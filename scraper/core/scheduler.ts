import cron from 'node-cron';
import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/secrets';
import { runAlertEngine } from './alert-engine';
import type { ScraperCredentialMap, ScraperCredential } from './credentials';
import type { WholesalerProvider } from '@prisma/client';

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
  // Idempotente: evitar registros duplicados si el módulo se importa varias veces
  if (scrapers.some((s) => s.name === name)) return;
  scrapers.push({ name, fn });
}

// Proveedores mayoristas que requieren credenciales — su key en la DB
const WHOLESALER_PROVIDER_MAP: Record<string, WholesalerProvider> = {
  'Deltron': 'DELTRON',
  'Ingram Micro': 'INGRAM',
  'Intcomex': 'INTCOMEX',
  'Maxima Internacional': 'MAXIMA',
  'Compudiskett': 'COMPUDISKETT',
};

/**
 * Obtiene las credenciales para scraping automático:
 * 1. Busca primero en credentialOverrides (pasados desde la UI con usuario autenticado)
 * 2. Fallback: credenciales del primer admin con esa key en UserWholesalerCredential
 * 3. Fallback final: variables de entorno
 */
async function resolveScheduledCredentials(
  providerKey: WholesalerProvider,
  overrides?: ScraperCredentialMap
): Promise<ScraperCredential | null> {
  const override = overrides?.[providerKey];
  if (override?.username && override.password) return override;

  // Buscar en DB: cualquier usuario que tenga credenciales para este proveedor
  const stored = await prisma.userWholesalerCredential.findFirst({
    where: { provider: providerKey },
    orderBy: { updatedAt: 'desc' },
  });

  if (stored?.usernameEncrypted && stored?.passwordEncrypted) {
    return {
      username: decryptSecret(stored.usernameEncrypted),
      password: decryptSecret(stored.passwordEncrypted),
    };
  }

  return null;
}

/**
 * Usa GPT-4o-mini para analizar errores de scraping y sugerir qué falló.
 * Solo se invoca cuando hay un error no relacionado a credenciales.
 */
async function analyzeScraperError(providerName: string, error: string): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.startsWith('sk-...')) return;

  // No analizar errores de credenciales (ya son claros)
  if (/credenciales|credential|password|usuario/i.test(error)) return;

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'Eres un experto en scraping web para portales B2B peruanos. ' +
            'Analiza el error de scraping y da una causa probable + acción correctiva en 2 líneas máximo. ' +
            'Responde en español, de manera concisa.',
        },
        {
          role: 'user',
          content: `Proveedor: ${providerName}\nError: ${error.slice(0, 800)}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 150,
    });
    const analysis = response.choices[0]?.message?.content?.trim();
    if (analysis) {
      console.warn(`[Scheduler][IA] Análisis de error en ${providerName}: ${analysis}`);
    }
  } catch {
    // No propagar errores del análisis IA
  }
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

    // Para mayoristas, verificar credenciales ANTES de crear el job
    const wholesalerKey = WHOLESALER_PROVIDER_MAP[name];
    let effectiveCredentials: ScraperCredential | null = null;

    if (wholesalerKey) {
      effectiveCredentials = await resolveScheduledCredentials(wholesalerKey, options?.credentialOverrides);
      if (!effectiveCredentials) {
        console.log(`[Scheduler] Proveedor ${name}: sin credenciales configuradas, saltando`);
        continue;
      }
    }

    // Inyectar credenciales resueltas en el mapa para que el scraper las use
    const enrichedOptions: RunAllScrapersOptions = {
      ...options,
      credentialOverrides: {
        ...options?.credentialOverrides,
        ...(wholesalerKey && effectiveCredentials
          ? { [wholesalerKey]: effectiveCredentials }
          : {}),
      },
    };

    const job = await prisma.scrapeJob.create({
      data: {
        providerId: provider.id,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    try {
      console.log(`[Scheduler] Scraping ${name}...`);
      await fn(job.id, enrichedOptions);
      console.log(`[Scheduler] ${name} completado`);
    } catch (err) {
      const errorStr = String(err);
      console.error(`[Scheduler] Error en ${name}:`, errorStr);
      await prisma.scrapeJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errors: errorStr,
          finishedAt: new Date(),
        },
      });
      // Análisis IA asíncrono (no bloquea el ciclo)
      void analyzeScraperError(name, errorStr);
    }
  }

  // Después de todo el scraping, correr motor de alertas
  await runAlertEngine();
}

// Programar ejecución cada N horas
let schedulerStarted = false;

export function startScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const hours = parseInt(process.env.SCRAPE_INTERVAL_HOURS ?? '3', 10);
  const cronExpr = `0 */${hours} * * *`;

  cron.schedule(cronExpr, async () => {
    await runAllScrapers();
  });

  console.log(`[Scheduler] Programado cada ${hours} horas (${cronExpr})`);
}
