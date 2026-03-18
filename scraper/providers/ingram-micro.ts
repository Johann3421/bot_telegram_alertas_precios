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

const PROVIDER_NAME = 'Ingram Micro';
const BASE_URL = 'https://pe.ingrammicro.com';
const LOGIN_URL = `${BASE_URL}/login`;
const MAX_ITEMS = 150;

// Rutas de categoría que se intentarán; si una falla o devuelve 0, se continúa con la siguiente
const CATEGORY_PATHS = [
  '/search?category=laptops',
  '/search?category=desktops',
  '/search?category=monitors',
  '/search?category=components',
  '/search?category=tablets',
  '/search?category=networking',
  '/products',
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Navega a una URL con reintentos automáticos para errores HTTP/2 transitorios
 * (ERR_HTTP2_PROTOCOL_ERROR, ERR_CONNECTION_RESET, etc.)
 */
async function retryGoto(
  page: Page,
  url: string,
  maxAttempts = 3,
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
      return;
    } catch (err) {
      const msg = String(err);
      const isTransient =
        msg.includes('ERR_HTTP2') ||
        msg.includes('ERR_PROTOCOL') ||
        msg.includes('ERR_CONNECTION') ||
        msg.includes('ERR_NETWORK') ||
        msg.includes('net::ERR');

      if (attempt < maxAttempts && isTransient) {
        console.warn(`[Ingram Micro] Error de red en intento ${attempt}/${maxAttempts} para ${url}, reintentando en ${attempt * 3}s...`);
        await delay(attempt * 3000);
      } else {
        throw err;
      }
    }
  }
}

export async function scrapeIngramMicro(jobId: string, options?: RunAllScrapersOptions): Promise<void> {
  const credentials = resolveWholesalerCredentials('INGRAM', options?.credentialOverrides);
  const user = credentials?.username;
  const pass = credentials?.password;

  if (!user || !pass) {
    throw new Error('Credenciales INGRAM_USER/INGRAM_PASS no configuradas');
  }

  const browser = await getBrowser();
  const context = await getContext(browser);
  const page = await context.newPage();

  const provider = await prisma.provider.findFirst({ where: { name: PROVIDER_NAME } });
  if (!provider) throw new Error(`Provider ${PROVIDER_NAME} no encontrado en DB`);

  let itemsFound = 0;
  let topLevelError: string | undefined;

  try {
    // Login con retry para manejar HTTP/2 transitorios
    await retryGoto(page, LOGIN_URL);
    await delay(1500);

    // Detectar campo de email/usuario con múltiples selectores
    const EMAIL_SELECTORS = [
      'input[name="email"]', '#email', 'input[type="email"]',
      'input[name="username"]', '#username', 'input[name="user"]',
    ];
    let emailSel: string | null = null;
    for (const s of EMAIL_SELECTORS) {
      if ((await page.locator(s).count()) > 0) { emailSel = s; break; }
    }
    if (emailSel) await page.fill(emailSel, user);

    await page.fill('input[type="password"]', pass);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
      page.locator('button[type="submit"], input[type="submit"]').first().click(),
    ]);
    await delay(2000);

    // Scraping de categorías
    for (const catPath of CATEGORY_PATHS) {
      if (itemsFound >= MAX_ITEMS) break;
      try {
        await retryGoto(page, `${BASE_URL}${catPath}`);
        await delay(1500);
        // Scroll para activar lazy-loading
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
        await delay(1000);

        // Selectors genéricos que cubren grids de productos y tablas B2B
        const PRODUCT_SELECTORS = [
          '.product-item', '[class*="product-card"]', '[class*="ProductCard"]',
          '[class*="search-result"]', '[data-product-id]', '[data-sku]',
          'tr[class*="product"]', 'tr[class*="item"]', 'li[class*="product"]',
        ].join(', ');

        const products = await page.$$eval(
          PRODUCT_SELECTORS,
          (elements: Element[]) =>
            elements.map((el) => {
              const nameEl = el.querySelector(
                '[class*="name"], [class*="title"], [class*="desc"], h2, h3, td:nth-child(2), .product-name'
              ) as HTMLElement | null;
              const anchor = el.querySelector('a[href]') as HTMLAnchorElement | null;
              const img = el.querySelector('img') as HTMLImageElement | null;
              return {
                name: nameEl?.textContent?.trim() ?? anchor?.textContent?.trim() ?? '',
                priceText: el.textContent?.trim() ?? '',
                url: anchor?.href ?? '',
                imageUrl: img?.src ?? '',
              };
            })
        );

        for (const p of products) {
          const price = parsePriceText(p.priceText);
          if (!p.name || !price || price <= 0) continue;
          await upsertScrapedListing({
            providerId: provider.id,
            rawName: p.name,
            price,
            currency: 'PEN',
            url: toAbsoluteUrl(BASE_URL, p.url, p.name),
            imageUrl: p.imageUrl || undefined,
          });
          itemsFound++;
        }
      } catch (catErr) {
        console.error(`[Ingram Micro] Error en ${catPath}:`, catErr);
      }
    }

    if (itemsFound === 0) {
      topLevelError =
        'Ingram Micro: autenticado pero sin productos encontrados. ' +
        'Los selectores CSS pueden necesitar ajuste según la versión actual del portal.';
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

