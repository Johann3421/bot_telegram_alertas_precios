/**
 * Next.js Instrumentation Hook
 * Se ejecuta una sola vez al arrancar el servidor (dev y producción).
 * Inicia el scheduler de scraping automático cada SCRAPE_INTERVAL_HOURS horas.
 */
export async function register() {
  // Solo en runtime Node.js (no en Edge runtime ni en el cliente)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Importación dinámica para no cargar Playwright en el bundle del cliente
    const { registerScraper, startScheduler } = await import('./scraper/core/scheduler');
    const { scrapeHiraoka } = await import('./scraper/providers/hiraoka');
    const { scrapeCoolbox } = await import('./scraper/providers/coolbox');
    const { scrapeImpacto } = await import('./scraper/providers/impacto');
    const { scrapeOechsle } = await import('./scraper/providers/oechsle');
    const { scrapeDeltron } = await import('./scraper/providers/deltron');
    const { scrapeIngramMicro } = await import('./scraper/providers/ingram-micro');
    const { scrapeIntcomex } = await import('./scraper/providers/intcomex');
    const { scrapeMaximaInternacional } = await import('./scraper/providers/maxima-internacional');
    const { scrapeCompudiskett } = await import('./scraper/providers/compudiskett');

    registerScraper('Hiraoka', scrapeHiraoka);
    registerScraper('Coolbox', scrapeCoolbox);
    registerScraper('Impacto', scrapeImpacto);
    registerScraper('Oechsle', scrapeOechsle);
    registerScraper('Deltron', scrapeDeltron);
    registerScraper('Ingram Micro', scrapeIngramMicro);
    registerScraper('Intcomex', scrapeIntcomex);
    registerScraper('Maxima Internacional', scrapeMaximaInternacional);
    registerScraper('Compudiskett', scrapeCompudiskett);

    startScheduler();

    console.log('[Instrumentation] Scheduler de scraping automático iniciado.');
  }
}
