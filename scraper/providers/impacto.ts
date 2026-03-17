import { Page } from 'playwright';
import { getBrowser, getContext } from '../core/browser';
import { prisma } from '@/lib/prisma';
import {
  detectCurrencyCode,
  finalizeScrapeJob,
  parsePriceText,
  parsePriceTextForCurrency,
  toAbsoluteMediaUrl,
  toAbsoluteUrl,
  upsertScrapedListing,
} from '../core/catalog';

const PROVIDER_NAME = 'Impacto';
const BASE_URL = 'https://www.impacto.com.pe';

const CATEGORIES_TO_SCRAPE = [
  '/catalogo?menu=Laptops',
  '/catalogo?categoria=Monitores&c=10',
  '/catalogo?menu=PC%27s%20Completas',
  '/catalogo?categoria=Tarjetas%20de%20Video&c=15',
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeImpacto(jobId: string): Promise<void> {
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
          '.single-product',
          (items) =>
            items.map((el) => ({
              name: (el.querySelector('.product-title a') as HTMLElement)?.textContent?.trim() ?? '',
              priceText: (el.querySelector('.product-price') as HTMLElement)?.textContent?.trim() ?? '',
              url: (el.querySelector('.product-title a, .product-image a') as HTMLAnchorElement)?.getAttribute('href') ?? '',
              imageUrl:
                (el.querySelector('.product-image img') as HTMLImageElement)?.getAttribute('src')?.trim() ??
                (el.querySelector('.product-image img') as HTMLImageElement)?.getAttribute('data-src')?.trim() ??
                '',
            }))
        );

        for (const product of products) {
          const currency = detectCurrencyCode(product.priceText);
          const cleanPrice = parsePriceTextForCurrency(product.priceText, currency) ?? parsePriceText(product.priceText);
          const productUrl = toAbsoluteUrl(BASE_URL, product.url, product.name);

          if (!product.name || cleanPrice === null) continue;

          await upsertScrapedListing({
            providerId: provider.id,
            rawName: product.name,
            price: cleanPrice,
            currency,
            url: productUrl,
            imageUrl: toAbsoluteMediaUrl(BASE_URL, product.imageUrl),
          });

          itemsFound++;
        }
      } catch (catError) {
        console.error(`[Impacto] Error en categoría ${categoryPath}:`, catError);
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
