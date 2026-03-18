/**
 * Scraper de Falabella Perú — usa Playwright para renderizar páginas de categoría.
 * La API interna está protegida por Cloudflare, por lo que raspamos el HTML renderizado.
 *
 * URL base: https://www.falabella.com.pe/falabella-pe/category/<CAT_ID>-<CAT_NAME>
 */
import { type Page } from 'playwright';
import { getBrowser, getContext } from '../core/browser';
import { prisma } from '@/lib/prisma';
import {
  finalizeScrapeJob,
  parsePriceText,
  toAbsoluteMediaUrl,
  upsertScrapedListing,
} from '../core/catalog';

const PROVIDER_NAME = 'Falabella';
const BASE_URL = 'https://www.falabella.com.pe';
const MAX_ITEMS = 300;

// Rutas de categorías de Falabella Perú para tecnología
const CATEGORY_PATHS = [
  '/falabella-pe/category/cat10006-Laptops',
  '/falabella-pe/category/cat4470040-Tablets',
  '/falabella-pe/category/cat4470006-Celulares',
  '/falabella-pe/category/cat4470038-Monitores',
  '/falabella-pe/category/cat4470039-Accesorios-Computacion',
  '/falabella-pe/category/cat4470028-Impresoras',
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const maxHeight = 20000;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight || totalHeight >= maxHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 180);
    });
  });
}

export async function scrapeFalabella(jobId: string): Promise<void> {
  const provider = await prisma.provider.findFirst({
    where: { name: PROVIDER_NAME },
  });
  if (!provider) throw new Error(`Provider ${PROVIDER_NAME} no encontrado en DB`);

  const browser = await getBrowser();
  const context = await getContext(browser);
  const page = await context.newPage();

  let itemsFound = 0;
  const categoryErrors: string[] = [];

  try {
    for (const catPath of CATEGORY_PATHS) {
      if (itemsFound >= MAX_ITEMS) break;

      try {
        await page.goto(`${BASE_URL}${catPath}`, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });

        // Esperar a que carguen los pods de producto (renderizado client-side)
        await page
          .waitForSelector('[class*="pod-"], [class*="search-results-4-grid"]', {
            timeout: 25000,
          })
          .catch(() => {});

        await delay(1500);
        await autoScroll(page);
        await delay(1000);

        const products = await page.$$eval(
          '[class*="pod-link"], a[href*="/falabella-pe/product/"]',
          (anchors) => {
            const seen = new Set<string>();
            return anchors
              .map((a) => {
                const card = a.closest('[class*="pod-"]') ?? a.parentElement;
                const href = a.getAttribute('href') ?? '';
                if (!href || seen.has(href)) return null;
                seen.add(href);

                const name =
                  (card?.querySelector('[class*="pod-title"], [class*="pod-subTitle"]') as HTMLElement)
                    ?.textContent?.trim() ?? '';
                const priceText =
                  (card?.querySelector(
                    '[class*="prices-0-0-"], [class*="pod-prices"]'
                  ) as HTMLElement)?.textContent?.trim() ?? '';
                const imageUrl =
                  (card?.querySelector('img') as HTMLImageElement)?.getAttribute('src')?.trim() ??
                  (card?.querySelector('img') as HTMLImageElement)?.getAttribute('data-src')?.trim() ??
                  '';

                return { name, priceText, url: href, imageUrl };
              })
              .filter(Boolean);
          }
        );

        for (const product of products as { name: string; priceText: string; url: string; imageUrl: string }[]) {
          if (!product.name) continue;

          const cleanPrice = parsePriceText(product.priceText);
          if (cleanPrice === null) continue;

          await upsertScrapedListing({
            providerId: provider.id,
            rawName: product.name,
            price: cleanPrice,
            currency: 'PEN',
            url: product.url.startsWith('http') ? product.url : `${BASE_URL}${product.url}`,
            imageUrl: toAbsoluteMediaUrl(BASE_URL, product.imageUrl),
          });

          itemsFound++;
          if (itemsFound >= MAX_ITEMS) break;
        }

        await delay(1200);
      } catch (catError) {
        console.error(`[Falabella] Error en categoría ${catPath}:`, catError);
        categoryErrors.push(`${catPath}: ${String(catError)}`);
      }
    }
  } catch (error) {
    await finalizeScrapeJob(jobId, itemsFound, String(error));
    throw error;
  } finally {
    await page.close();
    await context.close();
  }

  await finalizeScrapeJob(
    jobId,
    itemsFound,
    categoryErrors.length > 0 && itemsFound === 0 ? categoryErrors.join(' | ') : undefined
  );
}
