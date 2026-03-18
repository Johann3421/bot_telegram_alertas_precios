import { getBrowser, getContext } from '../core/browser';
import type { Page, Frame } from 'playwright';
import { prisma } from '@/lib/prisma';
import {
  finalizeScrapeJob,
  parsePriceText,
  toAbsoluteUrl,
  upsertScrapedListing,
} from '../core/catalog';
import { resolveWholesalerCredentials } from '../core/credentials';
import type { RunAllScrapersOptions } from '../core/scheduler';

const PROVIDER_NAME = 'Deltron';
// Portal B2B Xtranet — URL real confirmada en logs del VPS
const BASE_URL = 'https://xpand.deltron.com.pe';
const LOGIN_URL = `${BASE_URL}/login.php`;
const MAX_ITEMS = 150;

// Rutas de categoría tras login; cat= IDs son los del portal Xtranet.
// Si alguna devuelve 0 items el loop continúa con la siguiente.
const CATEGORY_PATHS = [
  '/xtranet/productos.php?cat=1',
  '/xtranet/productos.php?cat=2',
  '/xtranet/productos.php?cat=3',
  '/xtranet/productos.php?cat=4',
  '/xtranet/productos.php?cat=5',
  '/xtranet/productos.php?cat=6',
  '/xtranet/productos.php?cat=7',
  '/xtranet/productos.php',         // listado general — fallback sin filtro
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Busca un selector tanto en el frame principal como en todos los iframes.
 * Portales PHP clásicos suelen meter el formulario de login dentro de un <iframe>.
 */
async function findInput(
  page: Page,
  selectors: string[],
): Promise<{ frame: Frame; selector: string } | null> {
  const frames = page.frames();
  for (const selector of selectors) {
    for (const frame of frames) {
      try {
        if ((await frame.locator(selector).count()) > 0) return { frame, selector };
      } catch {
        // Frame destruido mientras iteramos — ignorar
      }
    }
  }
  return null;
}

/**
 * Detecta y espera a que resuelva un challenge de Cloudflare (o similar WAF).
 * CF renderiza una página sin <input>; hay que esperar a que el JS resuelva el reto
 * antes de buscar el formulario de login.
 */
async function waitForCloudflare(page: Page): Promise<void> {
  const title = await page.title().catch(() => '');
  const isCF =
    title.includes('Just a moment') ||
    title.includes('Checking your browser') ||
    title.includes('Please Wait') ||
    (await page.locator('#challenge-form, #cf-challenge-running, .cf-browser-verification').count().catch(() => 0)) > 0;

  if (isCF) {
    console.warn('[Deltron] Cloudflare challenge detectado, esperando resolución (hasta 30s)...');
    // Esperar a que desaparezca el título de CF y aparezca algún <input>
    await page.waitForFunction(
      () => !document.title.includes('Just a moment') && !document.title.includes('Checking'),
      { timeout: 30000 }
    ).catch(() => {});
    await delay(3000);
  }
}

async function loginDeltron(page: Page, user: string, pass: string): Promise<void> {
  // Paso 1: visitar la HOME primero para obtener la cookie de sesión/CF clearance
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await waitForCloudflare(page);
  await delay(1500);

  // Paso 2: navegar al login con networkidle
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(
    async () => { await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}); }
  );
  await waitForCloudflare(page);

  // Esperar activamente a que aparezca algún <input> (hasta 30s para portales JS lentos)
  await page.waitForFunction(
    () => document.querySelectorAll('input').length > 0,
    { timeout: 30000 }
  ).catch(() => {});
  await delay(1000);

  const USER_SELECTORS = [
    'input[name="usuario"]', 'input[name="usu"]',   'input[name="user"]',
    'input[name="login"]',   'input[name="username"]', 'input[name="email"]',
    '#usuario', '#usu', '#user', '#login', '#username',
    'input[type="email"]',   'input[type="text"]',
  ];

  const userField = await findInput(page, USER_SELECTORS);

  if (!userField) {
    // DIAGNÓSTICO: volcar todos los inputs en logs para identificar los selectores reales
    const mainInputs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).map((el) => ({
        name: (el as HTMLInputElement).name,
        id: el.id,
        type: (el as HTMLInputElement).type,
        placeholder: (el as HTMLInputElement).placeholder,
        visible: (el as HTMLInputElement).offsetParent !== null,
      }))
    );
    const iframeInputs: unknown[] = [];
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      try {
        const fi = await frame.evaluate(() =>
          Array.from(document.querySelectorAll('input')).map((el) => ({
            frameUrl: window.location.href,
            name: (el as HTMLInputElement).name,
            id: el.id,
            type: (el as HTMLInputElement).type,
          }))
        );
        iframeInputs.push(...fi);
      } catch { /* frame descargado */ }
    }
    console.error(
      `[Deltron] DIAGNÓSTICO url=${page.url()} ` +
      `mainInputs=${JSON.stringify(mainInputs)} ` +
      `iframeInputs=${JSON.stringify(iframeInputs)}`
    );
    throw new Error(
      `Deltron: no se encontró campo de usuario en ${page.url()}. ` +
      `Revisa la línea [Deltron] DIAGNÓSTICO en los logs para ver los inputs disponibles.`
    );
  }

  await userField.frame.locator(userField.selector).first().fill(user);

  const passField = await findInput(page, ['input[type="password"]']);
  if (!passField) throw new Error('Deltron: no se encontró campo de contraseña.');
  await passField.frame.locator('input[type="password"]').first().fill(pass);

  const SUBMIT_SELS = [
    'button[type="submit"]', 'input[type="submit"]',
    '.btn-login', 'button:has-text("Ingresar")',
    'button:has-text("Entrar")', 'button:has-text("Login")',
  ];
  const submitField = await findInput(page, SUBMIT_SELS);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {}),
    submitField
      ? submitField.frame.locator(submitField.selector).first().click()
      : userField.frame.locator(userField.selector).first().press('Enter'),
  ]);
  await delay(2000);

  if (page.url().includes('login.php')) {
    throw new Error(
      'Deltron: inicio de sesión rechazado (URL sigue en login.php). Verifica usuario y contraseña.'
    );
  }
}

export async function scrapeDeltron(jobId: string, options?: RunAllScrapersOptions): Promise<void> {
  const credentials = resolveWholesalerCredentials('DELTRON', options?.credentialOverrides);
  const user = credentials?.username;
  const pass = credentials?.password;

  if (!user || !pass) {
    throw new Error('Credenciales DELTRON_USER/DELTRON_PASS no configuradas');
  }

  const browser = await getBrowser();
  const context = await getContext(browser);
  const page = await context.newPage();

  const provider = await prisma.provider.findFirst({ where: { name: PROVIDER_NAME } });
  if (!provider) throw new Error(`Provider ${PROVIDER_NAME} no encontrado en DB`);

  let itemsFound = 0;
  let topLevelError: string | undefined;

  try {
    await loginDeltron(page, user, pass);

    for (const catPath of CATEGORY_PATHS) {
      if (itemsFound >= MAX_ITEMS) break;
      try {
        await page.goto(`${BASE_URL}${catPath}`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        await delay(1000);

        const rows = await page.$$eval(
          'table tr, tr.item, tr[class*="item"], tr[class*="product"], .product-row',
          (elements: Element[]) =>
            elements.map((el) => {
              const cells = Array.from(el.querySelectorAll('td'));
              const anchor = el.querySelector('a[href]') as HTMLAnchorElement | null;
              const img = el.querySelector('img') as HTMLImageElement | null;
              const allText = cells.map((c) => (c.textContent ?? '').trim()).join(' ');
              const name =
                cells.find((c) => {
                  const t = (c.textContent ?? '').trim();
                  return t.length > 6 && !/^\d/.test(t);
                })?.textContent?.trim() ?? '';
              return { name, priceText: allText, url: anchor?.href ?? '', imageUrl: img?.src ?? '' };
            })
        );

        for (const row of rows) {
          const price = parsePriceText(row.priceText);
          if (!row.name || !price || price <= 0) continue;
          await upsertScrapedListing({
            providerId: provider.id,
            rawName: row.name,
            price,
            currency: 'PEN',
            url: toAbsoluteUrl(BASE_URL, row.url, row.name),
            imageUrl: row.imageUrl || undefined,
          });
          itemsFound++;
        }
      } catch (catErr) {
        console.error(`[Deltron] Error en ${catPath}:`, catErr);
      }
    }

    if (itemsFound === 0) {
      topLevelError =
        'Deltron: autenticado pero sin productos parseables. ' +
        'Verifica que los selectores de tabla coincidan con el portal Xtranet actual.';
    }
  } catch (err) {
    topLevelError = String(err);
    throw err;
  } finally {
    await page.close();
    await context.close();
  }

  await finalizeScrapeJob(jobId, itemsFound, topLevelError);
  if (topLevelError && itemsFound === 0) throw new Error(topLevelError);
}
