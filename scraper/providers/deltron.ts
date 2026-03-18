import { getBrowser, getContext } from '../core/browser';
import type { Page } from 'playwright';
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
const BASE_URL = 'https://www.deltron.com.pe';
const LOGIN_URL = `${BASE_URL}/modulos/productos/login.php`;
const MAX_ITEMS = 150;

const CATEGORY_PATHS = [
  '/modulos/productos/items.php?cat=laptops',
  '/modulos/productos/items.php?cat=monitores',
  '/modulos/productos/items.php?cat=componentes',
  '/modulos/productos/items.php?cat=almacenamiento',
  '/modulos/productos/items.php?cat=tablets',
  '/modulos/productos/items.php?cat=celulares',
  '/modulos/productos/items.php?cat=perifericos',
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Login flexible para Deltron.
 * Prueba múltiples selectores de campo de usuario en orden de prioridad
 * antes de caer en el primer input visible que no sea contraseña.
 */
async function loginDeltron(page: Page, user: string, pass: string): Promise<void> {
  await page.goto(LOGIN_URL, { waitUntil: 'load', timeout: 45000 }).catch(async () => {
    // Si la URL directa falla (redirect o error), intentar con la base
    await page.goto(BASE_URL, { waitUntil: 'load', timeout: 45000 });
  });

  await delay(2000);

  // Buscar campo de usuario con múltiples selectores en orden de prioridad
  const USER_SELECTORS = [
    'input[name="usuario"]',
    'input[name="user"]',
    'input[name="login"]',
    'input[name="usu"]',
    'input[name="username"]',
    'input[name="email"]',
    '#usuario', '#user', '#login', '#username',
    'input[type="email"]',
  ];

  let usernameSelector: string | null = null;
  for (const sel of USER_SELECTORS) {
    if ((await page.locator(sel).count()) > 0) {
      usernameSelector = sel;
      break;
    }
  }

  if (!usernameSelector) {
    // Fallback: primer input visible que no sea contraseña / botón / oculto
    const genericInput = page.locator(
      'input:not([type="password"]):not([type="submit"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"])'
    ).first();
    const visible = await genericInput.isVisible().catch(() => false);
    if (!visible) {
      throw new Error(
        `Deltron: no se encontró campo de usuario en ${page.url()}. ` +
        `Verifica la URL de login y los selectores de formulario.`
      );
    }
    await genericInput.fill(user);
  } else {
    await page.fill(usernameSelector, user);
  }

  // Contraseña
  const passInput = page.locator('input[type="password"]').first();
  await passInput.waitFor({ state: 'visible', timeout: 10000 });
  await passInput.fill(pass);

  // Enviar formulario
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {}),
    page.locator(
      'button[type="submit"], input[type="submit"], .btn-login, ' +
      'button:has-text("Ingresar"), button:has-text("Entrar"), button:has-text("Login")'
    ).first().click(),
  ]);
  await delay(2000);

  // Verificar que no seguimos en el form de login (campo de usuario ya no visible)
  if (usernameSelector && (await page.locator(usernameSelector).count()) > 0) {
    throw new Error('Deltron: inicio de sesión rechazado. Verifica usuario y contraseña.');
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

  const provider = await prisma.provider.findFirst({
    where: { name: PROVIDER_NAME },
  });
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

        // Deltron usa tablas HTML clásicas para mostrar productos
        const rows = await page.$$eval(
          'table tr, tr.item, tr[class*="item"], tr[class*="product"], .product-row',
          (elements: Element[]) =>
            elements.map((el) => {
              const cells = Array.from(el.querySelectorAll('td'));
              const anchor = el.querySelector('a[href]') as HTMLAnchorElement | null;
              const img = el.querySelector('img') as HTMLImageElement | null;
              const allText = cells.map((c) => (c.textContent ?? '').trim()).join(' ');
              // Nombre: primera celda con texto largo que no empiece con número
              const name =
                cells.find((c) => {
                  const t = (c.textContent ?? '').trim();
                  return t.length > 6 && !/^\d/.test(t);
                })?.textContent?.trim() ?? '';
              return {
                name,
                priceText: allText,
                url: anchor?.href ?? '',
                imageUrl: img?.src ?? '',
              };
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
        'Deltron: autenticado pero sin productos parseables. Verifica que los selectores de tabla coincidan con el portal actual.';
    }
  } catch (err) {
    topLevelError = String(err);
    throw err;
  } finally {
    await page.close();
    await context.close();
  }

  await finalizeScrapeJob(jobId, itemsFound, topLevelError);
  if (topLevelError && itemsFound === 0) {
    throw new Error(topLevelError);
  }
}
