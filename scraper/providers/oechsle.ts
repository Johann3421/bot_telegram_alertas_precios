import { Page } from 'playwright';
import { getBrowser, getContext } from '../core/browser';
import { prisma } from '@/lib/prisma';
import {
  finalizeScrapeJob,
  parsePriceText,
  toAbsoluteMediaUrl,
  toAbsoluteUrl,
  upsertScrapedListing,
} from '../core/catalog';

const PROVIDER_NAME = 'Oechsle';
const BASE_URL = 'https://www.oechsle.pe';

const CATEGORIES_TO_SCRAPE = [
  '/tecnologia/computo/laptops',
  '/tecnologia/computo/laptops-gamers',
  '/tecnologia/computo/tablets',
  '/tecnologia/accesorios-de-computo/monitores',
  '/tecnologia/computo/all-in-one-y-computadoras-de-escritorio',
  '/tecnologia/accesorios-de-computo/discos-duros-y-memorias',
  '/tecnologia/telefonia/celulares',
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeOechsle(jobId: string): Promise<void> {
  const browser = await getBrowser();
  const context = await getContext(browser);
  const page = await context.newPage();

  const provider = await prisma.provider.findFirst({
    where: { name: PROVIDER_NAME },
  });
  if (!provider) throw new Error(`Provider ${PROVIDER_NAME} no encontrado en DB`);

  let itemsFound = 0;
  const categoryErrors: string[] = [];

  try {
    for (const categoryPath of CATEGORIES_TO_SCRAPE) {
      try {
        await page.goto(`${BASE_URL}${categoryPath}`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });

        await delay(1000);
        await autoScroll(page);

        const products = await page.$$eval(
          'a[href$="/p"], a[href*="/p?"]',
          (anchors) => {
            const seen = new Set<string>();

            return anchors
              .map((anchor) => {
                const image = anchor.querySelector('img') as HTMLImageElement | null;

                return {
                  name: (anchor.textContent ?? '').trim().replace(/\s+/g, ' '),
                  priceText: (anchor.textContent ?? '').trim(),
                  url: (anchor as HTMLAnchorElement).getAttribute('href') ?? '',
                  imageUrl:
                    image?.getAttribute('src')?.trim() ??
                    image?.getAttribute('data-src')?.trim() ??
                    '',
                };
              })
              .filter((item) => item.url && item.name.length > 20)
              .filter((item) => {
                if (seen.has(item.url)) {
                  return false;
                }

                seen.add(item.url);
                return true;
              });
          }
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
        console.error(`[Oechsle] Error en categoría ${categoryPath}:`, catError);
        categoryErrors.push(`${categoryPath}: ${String(catError)}`);
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

async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const maxHeight = 15000;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight || totalHeight >= maxHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 150);
    });
  });
}