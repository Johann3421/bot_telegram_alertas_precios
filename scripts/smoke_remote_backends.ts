import 'dotenv/config';
import { getBrowser, getContext, closeBrowser } from '../scraper/core/browser';
import { loadRenderedPage } from '../scraper/core/remote-render';

const targets = [
  {
    providerName: 'MercadoLibre',
    url: 'https://listado.mercadolibre.com.pe/laptops',
    selector: '.ui-search-layout__item, [class*="search-results-item"]',
  },
  {
    providerName: 'Falabella',
    url: 'https://www.falabella.com.pe/falabella-pe/category/cat10006-Laptops',
    selector: 'a[href*="/falabella-pe/product/"]',
  },
  {
    providerName: 'Hiraoka',
    url: 'https://www.hiraoka.com.pe/tecnologia/laptops',
    selector: '.product-item, [class*="product-card"], [class*="ProductCard"], .vtex-product-summary',
  },
  {
    providerName: 'Oechsle',
    url: 'https://www.oechsle.pe/tecnologia/computo/laptops',
    selector: 'a[href$="/p"], a[href*="/p?"]',
  },
];

async function main() {
  const browser = await getBrowser();
  const context = await getContext(browser);
  const page = await context.newPage();

  for (const target of targets) {
    try {
      const backend = await loadRenderedPage(page, target.url, {
        providerName: target.providerName,
        waitForSelector: target.selector,
        timeoutMs: 70000,
        scrollSteps: 5,
      });

      const count = await page.locator(target.selector).count();
      console.log(`[Smoke] ${target.providerName}: backend=${backend} matched=${count} url=${target.url}`);
    } catch (error) {
      console.error(`[Smoke] ${target.providerName}: fallo ${String(error)}`);
    }
  }

  await page.close();
  await context.close();
  await closeBrowser();
}

main().catch(async (error) => {
  console.error('[Smoke] Error fatal:', error);
  await closeBrowser();
  process.exitCode = 1;
});