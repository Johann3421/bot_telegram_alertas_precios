import cron from 'node-cron';
import { prisma } from '@/lib/prisma';
import { runAlertEngine } from './alert-engine';
import type { ScraperCredentialMap } from './credentials';

// Tipo genérico para funciones de scraping
type ScraperFn = (jobId: string, options?: RunAllScrapersOptions) => Promise<void>;

export interface RunAllScrapersOptions {
  credentialOverrides?: ScraperCredentialMap;
}

interface ProviderScraper {
  name: string;
  fn: ScraperFn;
}

// Registrar proveedores dinámicamente
const scrapers: ProviderScraper[] = [];

export function registerScraper(name: string, fn: ScraperFn): void {
  scrapers.push({ name, fn });
}

// Ejecutar todos los scrapers registrados
export async function runAllScrapers(options?: RunAllScrapersOptions): Promise<void> {
  console.log('[Scheduler] Iniciando ciclo de scraping:', new Date().toISOString());

  for (const { name, fn } of scrapers) {
    const provider = await prisma.provider.findFirst({ where: { name } });
    if (!provider?.isActive) {
      console.log(`[Scheduler] Proveedor ${name} inactivo, saltando`);
      continue;
    }

    const job = await prisma.scrapeJob.create({
      data: {
        providerId: provider.id,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    try {
      console.log(`[Scheduler] Scraping ${name}...`);
      await fn(job.id, options);
      console.log(`[Scheduler] ${name} completado`);
    } catch (err) {
      console.error(`[Scheduler] Error en ${name}:`, err);
      await prisma.scrapeJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errors: String(err),
          finishedAt: new Date(),
        },
      });
    }
  }

  // Después de todo el scraping, correr motor de alertas
  await runAlertEngine();
}

// Programar ejecución cada N horas
export function startScheduler(): void {
  const hours = parseInt(process.env.SCRAPE_INTERVAL_HOURS ?? '3', 10);
  const cronExpr = `0 */${hours} * * *`;

  cron.schedule(cronExpr, async () => {
    await runAllScrapers();
  });

  console.log(`[Scheduler] Programado cada ${hours} horas (${cronExpr})`);
}
