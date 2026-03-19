/**
 * Scraper de MercadoLibre Perú — usa Playwright para scraping web.
 * URL: https://listado.mercadolibre.com.pe/<categoria>
 *
 * Estrategia: recorrer páginas de listado de categorías tecnológicas
 * y extract product cards del DOM.
 */
import { getBrowser, getContext } from '../core/browser';
import { loadRenderedPage } from '../core/remote-render';
import { prisma } from '@/lib/prisma';
import {
  finalizeScrapeJob,
  parsePriceText,
  toAbsoluteMediaUrl,
  upsertScrapedListing,
} from '../core/catalog';

const PROVIDER_NAME = 'MercadoLibre';
const BASE_URL = 'https://listado.mercadolibre.com.pe';
const MAX_ITEMS = 300;

// Slugs de categorías de MercadoLibre Perú (URL path)
const CATEGORY_PATHS = [
  '/laptops',
  '/tablets',
  '/monitores-computacion',
  '/parlantes',
  '/auriculares',
  '/memorias-flash-pendrives',
  '/discos-ssd-2-5',
  '/redes-computacion',
];

export async function scrapeMercadoLibre(jobId: string): Promise<void> {
  const provider = await prisma.provider.findFirst({
    where: { name: PROVIDER_NAME },
  });
  if (!provider) throw new Error(`Provider ${PROVIDER_NAME} no encontrado en DB`);

  const browser = await getBrowser();
  const context = await getContext(browser);
  const page = await context.newPage();

  let itemsFound = 0;
  const categoryErrors: string[] = [];
  const backendSet = new Set<string>();
  let pagesAttempted = 0;
  let pagesSucceeded = 0;

  try {
    for (const catPath of CATEGORY_PATHS) {
      if (itemsFound >= MAX_ITEMS) break;

      try {
        pagesAttempted++;
        const backend = await loadRenderedPage(page, `${BASE_URL}${catPath}`, {
          providerName: PROVIDER_NAME,
          waitForSelector: '.ui-search-layout__item, [class*="search-results-item"]',
          timeoutMs: 70000,
          scrollSteps: 5,
        });
        backendSet.add(backend);
        pagesSucceeded++;

        const products = await page.$$eval(
          '.ui-search-layout__item, [class*="search-results-item"]',
          (items) =>
            items.map((el) => ({
              name:
                (el.querySelector('.ui-search-item__title, [class*="item__title"]') as HTMLElement)
                  ?.textContent?.trim() ?? '',
              priceText:
                (el.querySelector(
                  '.andes-money-amount__fraction, [class*="price__fraction"]'
                ) as HTMLElement)?.textContent?.trim() ?? '',
              url:
                (el.querySelector('a.ui-search-link, a[class*="search-link"]') as HTMLAnchorElement)
                  ?.getAttribute('href') ?? '',
              imageUrl:
                (el.querySelector('img') as HTMLImageElement)?.getAttribute('src')?.trim() ??
                (el.querySelector('img') as HTMLImageElement)?.getAttribute('data-src')?.trim() ??
                '',
            }))
        );

        for (const product of products) {
          if (!product.name || !product.url) continue;

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
      } catch (catError) {
        console.error(`[MercadoLibre] Error en categoría ${catPath}:`, catError);
        categoryErrors.push(`${catPath}: ${String(catError)}`);
      }
    }
  } catch (error) {
    await finalizeScrapeJob(jobId, itemsFound, String(error), {
      backendUsed: Array.from(backendSet).join(','),
      strategyUsed: 'remote-public-catalog',
      pagesAttempted,
      pagesSucceeded,
    });
    throw error;
  } finally {
    await page.close();
    await context.close();
  }

  await finalizeScrapeJob(
    jobId,
    itemsFound,
    categoryErrors.length > 0 && itemsFound === 0 ? categoryErrors.join(' | ') : undefined,
    {
      backendUsed: Array.from(backendSet).join(','),
      strategyUsed: 'remote-public-catalog',
      pagesAttempted,
      pagesSucceeded,
    }
  );
}


