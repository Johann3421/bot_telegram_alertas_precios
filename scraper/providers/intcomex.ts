import { getBrowser, getContext } from '../core/browser';
import { prisma } from '@/lib/prisma';
import { finalizeScrapeJob } from '../core/catalog';
import { resolveWholesalerCredentials } from '../core/credentials';
import type { RunAllScrapersOptions } from '../core/scheduler';

const PROVIDER_NAME = 'Intcomex';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeIntcomex(jobId: string, options?: RunAllScrapersOptions): Promise<void> {
  const credentials = resolveWholesalerCredentials('INTCOMEX', options?.credentialOverrides);
  const user = credentials?.username;
  const pass = credentials?.password;

  if (!user || !pass) {
    throw new Error('Credenciales INTCOMEX_USER/INTCOMEX_PASS no configuradas');
  }

  const browser = await getBrowser();
  const context = await getContext(browser);
  const page = await context.newPage();

  const provider = await prisma.provider.findFirst({
    where: { name: PROVIDER_NAME },
  });
  if (!provider) throw new Error(`Provider ${PROVIDER_NAME} no encontrado en DB`);

  const itemsFound = 0;
  let topLevelError: string | undefined;

  try {
    await page.goto('https://store.intcomex.com/us', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await delay(1000);

    topLevelError = 'El scraper de Intcomex requiere autenticacion y una ruta valida del catalogo posterior al login. Configure las credenciales y ajuste la navegacion autenticada.';
  } finally {
    await page.close();
    await context.close();
  }

  await finalizeScrapeJob(jobId, itemsFound, topLevelError);

  if (topLevelError) {
    throw new Error(topLevelError);
  }
}
