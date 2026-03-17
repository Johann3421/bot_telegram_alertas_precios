import { getBrowser, getContext } from '../core/browser';
import { prisma } from '@/lib/prisma';
import { resolveWholesalerCredentials } from '../core/credentials';
import type { RunAllScrapersOptions } from '../core/scheduler';

const PROVIDER_NAME = 'Ingram Micro';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const provider = await prisma.provider.findFirst({
    where: { name: PROVIDER_NAME },
  });
  if (!provider) throw new Error(`Provider ${PROVIDER_NAME} no encontrado en DB`);

  let itemsFound = 0;

  try {
    // Login portal Ingram Micro
    await page.goto('https://pe.ingrammicro.com/login', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await delay(1000);
    await page.fill('input[name="email"], #email, input[type="email"]', user);
    await page.fill('input[name="password"], #password, input[type="password"]', pass);
    await page.click('button[type="submit"], input[type="submit"]');

    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await delay(2000);

    const categories = [
      '/search?category=laptops',
      '/search?category=desktops',
      '/search?category=monitors',
      '/search?category=components',
    ];

    for (const catUrl of categories) {
      try {
        await page.goto(`https://pe.ingrammicro.com${catUrl}`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });

        await delay(1000);

        const products = await page.$$eval(
          '.product-item, [class*="product"], [class*="search-result"], tr',
          (items) =>
            items.map((el) => ({
              name: (el.querySelector('[class*="name"], [class*="desc"], td:nth-child(2)') as HTMLElement)?.textContent?.trim() ?? '',
              price: (el.querySelector('[class*="price"], td:nth-child(4)') as HTMLElement)?.textContent?.trim() ?? '',
              url: (el.querySelector('a') as HTMLAnchorElement)?.href ?? '',
            }))
        );

        for (const product of products) {
          const cleanPrice = parseFloat(
            product.price.replace(/[^0-9.,]/g, '').replace(',', '.')
          );

          if (!product.name || isNaN(cleanPrice) || cleanPrice <= 0) continue;

          const listing = await prisma.rawListing.upsert({
            where: {
              providerId_url: {
                providerId: provider.id,
                url: product.url || `https://pe.ingrammicro.com/${encodeURIComponent(product.name)}`,
              },
            },
            create: {
              providerId: provider.id,
              rawName: product.name,
              price: cleanPrice,
              url: product.url || `https://pe.ingrammicro.com/${encodeURIComponent(product.name)}`,
            },
            update: {
              price: cleanPrice,
              scrapedAt: new Date(),
              inStock: true,
            },
          });

          await prisma.priceLog.create({
            data: {
              listingId: listing.id,
              providerId: provider.id,
              price: cleanPrice,
            },
          });

          itemsFound++;
        }
      } catch (catError) {
        console.error(`[Ingram Micro] Error en categoría ${catUrl}:`, catError);
      }
    }
  } finally {
    await page.close();
    await context.close();

    await prisma.scrapeJob.update({
      where: { id: jobId },
      data: {
        status: 'DONE',
        finishedAt: new Date(),
        itemsFound,
      },
    });
  }
}
