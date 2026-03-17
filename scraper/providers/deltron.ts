import { getBrowser, getContext } from '../core/browser';
import { prisma } from '@/lib/prisma';
import { resolveWholesalerCredentials } from '../core/credentials';
import type { RunAllScrapersOptions } from '../core/scheduler';

const PROVIDER_NAME = 'Deltron';

// Deltron requiere autenticación con credenciales de distribuidor
// Las credenciales se leen de variables de entorno
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  try {
    // Login en portal de distribuidores
    await page.goto('https://www.deltron.com.pe/modulos/productos/login.php', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await delay(1000);

    // Llenar formulario de login
    await page.fill('input[name="usuario"], #usuario, input[type="text"]', user);
    await page.fill('input[name="clave"], #clave, input[type="password"]', pass);
    await page.click('button[type="submit"], input[type="submit"], .btn-login');

    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await delay(2000);

    // Categorías de Deltron
    const categories = [
      '/modulos/productos/items.php?cat=laptops',
      '/modulos/productos/items.php?cat=monitores',
      '/modulos/productos/items.php?cat=componentes',
      '/modulos/productos/items.php?cat=almacenamiento',
    ];

    for (const catUrl of categories) {
      try {
        await page.goto(`https://www.deltron.com.pe${catUrl}`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });

        await delay(1000);

        const products = await page.$$eval(
          'tr.item, .product-row, [class*="product"], tbody tr',
          (rows) =>
            rows.map((row) => ({
              name: (row.querySelector('td:nth-child(2), [class*="desc"], [class*="name"]') as HTMLElement)?.textContent?.trim() ?? '',
              price: (row.querySelector('td:nth-child(4), [class*="price"], [class*="precio"]') as HTMLElement)?.textContent?.trim() ?? '',
              sku: (row.querySelector('td:nth-child(1), [class*="sku"], [class*="codigo"]') as HTMLElement)?.textContent?.trim() ?? '',
              url: (row.querySelector('a') as HTMLAnchorElement)?.href ?? '',
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
                url: product.url || `https://www.deltron.com.pe/${encodeURIComponent(product.name)}`,
              },
            },
            create: {
              providerId: provider.id,
              rawName: product.name,
              price: cleanPrice,
              url: product.url || `https://www.deltron.com.pe/${encodeURIComponent(product.name)}`,
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
        console.error(`[Deltron] Error en categoría ${catUrl}:`, catError);
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
