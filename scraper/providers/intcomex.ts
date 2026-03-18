import { getPersistentContext } from '../core/browser';
import type { Page } from 'playwright';
import { prisma } from '@/lib/prisma';
import {
  detectCurrencyCode,
  finalizeScrapeJob,
  parsePriceTextForCurrency,
  toAbsoluteMediaUrl,
  upsertScrapedListing,
} from '../core/catalog';
import { resolveWholesalerCredentials } from '../core/credentials';
import type { RunAllScrapersOptions } from '../core/scheduler';

const PROVIDER_NAME = 'Intcomex';
const BASE_URL = 'https://store.intcomex.com';
const HOME_URL = 'https://store.intcomex.com/es-XPE/Home';
const LOGIN_URL = 'https://store.intcomex.com/es-XPE/Account/Login';
const MAX_ITEMS = 200;

// Páginas de categoría para una extracción más completa
const CATEGORY_URLS = [
  'https://store.intcomex.com/es-XPE/Category/Laptops',
  'https://store.intcomex.com/es-XPE/Category/Monitores',
  'https://store.intcomex.com/es-XPE/Category/Componentes',
  'https://store.intcomex.com/es-XPE/Category/Almacenamiento',
  'https://store.intcomex.com/es-XPE/Category/Tablets',
  'https://store.intcomex.com/es-XPE/Category/Celulares',
  'https://store.intcomex.com/es-XPE/Category/Networking',
];

interface CandidateItem {
  name: string;
  url: string;
  imageUrl?: string;
  priceText: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Escribe texto carácter a carácter con variación de velocidad humana */
async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.locator(selector).click();
  await delay(200 + Math.random() * 200);
  for (const char of text) {
    await page.keyboard.type(char, { delay: 40 + Math.random() * 80 });
  }
  await delay(300 + Math.random() * 300);
}

async function authenticate(page: Page, user: string, pass: string) {
  // Navegar al login — la página redirige a Azure B2C; usamos domcontentloaded
  // para no fallar en la cadena de redirecciones 302
  await page.goto(LOGIN_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  }).catch(() => {
    // ERR_ABORTED puede ocurrir por redirecciones; continuar y esperar el formulario
  });

  // Esperar a que el formulario de login esté listo (puede estar en Azure B2C)
  const emailLocator = page.locator('#email, #signInName').first();
  await emailLocator.waitFor({ state: 'visible', timeout: 25000 });

  // Escribir credenciales con velocidad humana
  await humanType(page, '#email, #signInName', user);
  await humanType(page, '#password', pass);

  // Pequeña pausa antes de enviar (comportamiento humano)
  await delay(500 + Math.random() * 500);

  // Hacer clic en el botón de inicio de sesión
  const submitButton = page
    .getByRole('button', { name: /iniciar sesi[oó]n|sign in|entrar/i })
    .first();

  // Esperar navegación después del clic
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}),
    submitButton.click(),
  ]);

  // Dar tiempo a que complete el flujo OAuth/Azure B2C redirect chain
  await delay(4000);

  // Si seguimos en Azure B2C, esperar más (puede haber un segundo redirect)
  if (page.url().includes('b2clogin.com')) {
    await page
      .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 })
      .catch(() => {});
    await delay(2000);
  }

  const finalUrl = page.url();
  const emailStillVisible = await page.locator('#email, #signInName').count() > 0;

  // Si aún estamos en b2clogin con formulario visible = login fallido
  if (finalUrl.includes('b2clogin.com') && emailStillVisible) {
    // Intentar extraer mensaje de error visible en la página
    const errorMsg = await page
      .locator('.error, [role="alert"], #claimVerificationServerError, .pageLevel, [class*="error"]')
      .first()
      .textContent()
      .catch(() => '');
    const msg = errorMsg?.trim();
    throw new Error(
      `Intcomex: inicio de sesión rechazado.${msg ? ` Detalle: ${msg}` : ' Verifica usuario, contraseña o MFA.'}`
    );
  }
}

/** Extrae items de producto de la página actual */
async function extractItemsFromPage(page: Page): Promise<CandidateItem[]> {
  return page.locator('a[href*="/Product/Detail/"], a[href*="/Product/"]').evaluateAll((anchors) =>
    (anchors as HTMLAnchorElement[])
      .map((anchor) => {
        const href = anchor.href;
        const text = anchor.textContent?.replace(/\s+/g, ' ').trim() ?? '';

        if (!href || !text || /ingrese para ver precio|ver precio/i.test(text) || text.length < 5) {
          return null;
        }

        const container =
          anchor.closest('article, li, .swiper-slide, .item, .product, .product-item, .card') ||
          anchor.parentElement ||
          anchor;

        const imageUrl = (container.querySelector('img') as HTMLImageElement | null)?.src ?? undefined;
        const priceText = (container.textContent ?? '').replace(/\s+/g, ' ').trim();

        return { name: text, url: href, imageUrl, priceText };
      })
      .filter(Boolean) as CandidateItem[]
  );
}

async function collectCandidates(page: Page): Promise<CandidateItem[]> {
  const deduped = new Map<string, CandidateItem>();

  // Primera pasada: home page
  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await delay(2000);

  for (const item of await extractItemsFromPage(page)) {
    if (!deduped.has(item.url)) deduped.set(item.url, item);
  }

  // Segunda pasada: kategorías específicas
  for (const catUrl of CATEGORY_URLS) {
    if (deduped.size >= MAX_ITEMS) break;
    try {
      await page.goto(catUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(1500);

      // Scroll para cargar lazy-loaded products
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await delay(1000);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(1500);

      for (const item of await extractItemsFromPage(page)) {
        if (!deduped.has(item.url)) deduped.set(item.url, item);
      }
    } catch {
      // Categoría no disponible, continuar
    }
  }

  return Array.from(deduped.values()).slice(0, MAX_ITEMS);
}

export async function scrapeIntcomex(jobId: string, options?: RunAllScrapersOptions): Promise<void> {
  const credentials = resolveWholesalerCredentials('INTCOMEX', options?.credentialOverrides);
  const user = credentials?.username;
  const pass = credentials?.password;

  if (!user || !pass) {
    throw new Error('Credenciales INTCOMEX_USER/INTCOMEX_PASS no configuradas');
  }

  // Usar contexto persistente para que las cookies de Azure B2C sobrevivan
  // los redirects cross-domain (store.intcomex.com ↔ b2clogin.com)
  const context = await getPersistentContext('intcomex');
  const page = await context.newPage();

  const provider = await prisma.provider.findFirst({
    where: { name: PROVIDER_NAME },
  });
  if (!provider) throw new Error(`Provider ${PROVIDER_NAME} no encontrado en DB`);

  let itemsFound = 0;
  let topLevelError: string | undefined;

  try {
    await authenticate(page, user, pass);

    const candidates = await collectCandidates(page);

    for (const item of candidates) {
      const currency = detectCurrencyCode(item.priceText);
      const inlinePrice = parsePriceTextForCurrency(item.priceText, currency);
      let finalPrice = inlinePrice;
      let finalImageUrl = toAbsoluteMediaUrl(BASE_URL, item.imageUrl);

      if (!finalPrice) {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await delay(2000);

        const detailText = await page.locator('body').innerText();
        const detailCurrency = detectCurrencyCode(detailText);
        finalPrice = parsePriceTextForCurrency(detailText, detailCurrency);
        finalImageUrl = finalImageUrl ?? toAbsoluteMediaUrl(BASE_URL, await page.locator('img').first().getAttribute('src').catch(() => null) ?? undefined);
      }

      if (!finalPrice) {
        continue;
      }

      await upsertScrapedListing({
        providerId: provider.id,
        rawName: item.name,
        price: finalPrice,
        currency,
        url: item.url,
        imageUrl: finalImageUrl,
      });

      itemsFound++;
    }

    if (itemsFound === 0) {
      topLevelError = 'Intcomex autenticó, pero no expuso precios parseables en los productos inspeccionados.';
    }
  } finally {
    await page.close();
    await context.close();
  }

  await finalizeScrapeJob(jobId, itemsFound, topLevelError);

  if (topLevelError) {
    throw new Error(topLevelError);
  }
}
