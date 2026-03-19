import { getBrowser, getContext } from '../core/browser';
import { loadRenderedPage } from '../core/remote-render';
import { prisma } from '@/lib/prisma';
import {
  finalizeScrapeJob,
  parsePriceText,
  toAbsoluteMediaUrl,
  toAbsoluteUrl,
  upsertScrapedListing,
} from '../core/catalog';

const PROVIDER_NAME = 'Hiraoka';
const BASE_URL = 'https://www.hiraoka.com.pe';

const CATEGORIES_TO_SCRAPE = [
  '/tecnologia/laptops',
  '/tecnologia/computadoras',
  '/tecnologia/monitores',
  '/tecnologia/celulares',
];

export async function scrapeHiraoka(jobId: string): Promise<void> {
  const browser = await getBrowser();
  const context = await getContext(browser);
  const page = await context.newPage();

  const provider = await prisma.provider.findFirst({
    where: { name: PROVIDER_NAME },
  });
  if (!provider) throw new Error(`Provider ${PROVIDER_NAME} no encontrado en DB`);

  let itemsFound = 0;
  const categoryErrors: string[] = [];
  const backendSet = new Set<string>();
  let pagesAttempted = 0;
  let pagesSucceeded = 0;

  try {
    for (const categoryPath of CATEGORIES_TO_SCRAPE) {
      try {
        pagesAttempted++;
        const backend = await loadRenderedPage(page, `${BASE_URL}${categoryPath}`, {
          providerName: PROVIDER_NAME,
          waitForSelector: '.product-item, [class*="product-card"], [class*="ProductCard"], .vtex-product-summary',
          timeoutMs: 65000,
          scrollSteps: 5,
        });
        backendSet.add(backend);
        pagesSucceeded++;

        const products = await page.$$eval(
          '.product-item, [class*="product-card"], [class*="ProductCard"], .vtex-product-summary',
          (items) =>
            items.map((el) => ({
              name: (el.querySelector('[class*="name"], [class*="Name"], h2, h3, .product-name') as HTMLElement)?.textContent?.trim() ?? '',
              priceText: (el.querySelector('[class*="price"], [class*="Price"], .price, [class*="selling"]') as HTMLElement)?.textContent?.trim() ?? '',
              url: (el.querySelector('a[href]') as HTMLAnchorElement)?.getAttribute('href') ?? '',
              imageUrl:
                (el.querySelector('img') as HTMLImageElement)?.getAttribute('src')?.trim() ??
                (el.querySelector('img') as HTMLImageElement)?.getAttribute('data-src')?.trim() ??
                '',
            }))
        );

        for (const product of products) {
          const cleanPrice = parsePriceText(product.priceText);
          const productUrl = toAbsoluteUrl(BASE_URL, product.url, product.name);

          if (!product.name || cleanPrice === null) continue;

          await upsertScrapedListing({
            providerId: provider.id,
            rawName: product.name,
            price: cleanPrice,
            url: productUrl,
            imageUrl: toAbsoluteMediaUrl(BASE_URL, product.imageUrl),
          });

          itemsFound++;
        }
      } catch (catError) {
        console.error(`[Hiraoka] Error en categoría ${categoryPath}:`, catError);
        categoryErrors.push(`${categoryPath}: ${String(catError)}`);
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
