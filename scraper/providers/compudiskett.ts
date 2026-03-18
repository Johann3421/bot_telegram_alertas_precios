import { getBrowser, getContext } from '../core/browser';
import type { Page } from 'playwright';
import { prisma } from '@/lib/prisma';
import {
  detectCurrencyCode,
  finalizeScrapeJob,
  parsePriceTextForCurrency,
  toAbsoluteMediaUrl,
  upsertScrapedListing,
} from '../core/catalog';
import { resolveWholesalerCredentials } from '../core/credentials';
import type { RunAllScrapersOptions } from '../core/scheduler';

const PROVIDER_NAME = 'Compudiskett';
const BASE_URL = 'https://ecommerce.compudiskett.com.pe';
const HOME_URL = 'https://ecommerce.compudiskett.com.pe/';
const MAX_ITEMS = 60;

interface CandidateItem {
  code: string;
  name: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function authenticate(page: Page, user: string, pass: string) {
  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await delay(2000);
  await page.evaluate(() => {
    const loginFn = (window as unknown as { logincdk?: () => void }).logincdk;
    if (typeof loginFn === 'function') {
      loginFn();
    }
  });
  await delay(1500);

  await page.fill('#username', user);
  await page.fill('#userpass', pass);
  await page.locator('#log_enviar').click();
  await delay(5000);
}

async function collectCandidates(page: Page): Promise<CandidateItem[]> {
  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await delay(3000);

  const rawItems = await page.locator('a[onclick*="busqueda_general"]').evaluateAll((anchors) =>
    anchors
      .map((anchor) => {
        const onclick = anchor.getAttribute('onclick') ?? '';
        const match = onclick.match(/busqueda_general\('link',\s*'[^']*',\s*'[^']*',\s*'([^']+)'\)/i);
        const code = match?.[1]?.trim();

        if (!code) {
          return null;
        }

        const container = anchor.closest('article, li, .card, .product-item, .item') || anchor.parentElement || anchor;
        const name = (container.textContent ?? '').replace(/\s+/g, ' ').trim();
        return name ? { code, name } : null;
      })
        .filter(Boolean) as CandidateItem[]
      );

  const deduped = new Map<string, CandidateItem>();
  for (const item of rawItems) {
    if (!deduped.has(item.code)) {
      deduped.set(item.code, item);
    }
  }

  return Array.from(deduped.values()).slice(0, MAX_ITEMS);
}

export async function scrapeCompudiskett(jobId: string, options?: RunAllScrapersOptions): Promise<void> {
  const credentials = resolveWholesalerCredentials('COMPUDISKETT', options?.credentialOverrides);
  const user = credentials?.username;
  const pass = credentials?.password;

  if (!user || !pass) {
    throw new Error('Credenciales COMPUDISKETT_USER/COMPUDISKETT_PASS no configuradas');
  }

  const browser = await getBrowser();
  const context = await getContext(browser);
  const page = await context.newPage();

  const provider = await prisma.provider.findFirst({ where: { name: PROVIDER_NAME } });
  if (!provider) throw new Error(`Provider ${PROVIDER_NAME} no encontrado en DB`);

  let itemsFound = 0;
  let topLevelError: string | undefined;

  try {
    await authenticate(page, user, pass);
    const candidates = await collectCandidates(page);

    for (const item of candidates) {
      await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await delay(1500);
      await page.evaluate((code) => {
        const navigateFn = (window as unknown as {
          busqueda_general?: (mode: string, arg1: string, arg2: string, arg3: string) => void;
        }).busqueda_general;

        if (typeof navigateFn === 'function') {
          navigateFn('link', ' ', ' ', code);
        }
      }, item.code);

      await page.waitForURL(/producto-cdk\.php/i, { timeout: 30000 }).catch(() => {});
      await delay(3000);

      const detailText = await page.locator('body').innerText();
      const currency = detectCurrencyCode(detailText);
      const finalPrice = parsePriceTextForCurrency(detailText, currency);

      if (!finalPrice) {
        continue;
      }

      const title = (await page.locator('h2').first().textContent().catch(() => null))?.replace(/\s+/g, ' ').trim() || item.name;
      const imageUrl = toAbsoluteMediaUrl(BASE_URL, await page.locator('img[src*="/images/productos/"]').first().getAttribute('src').catch(() => null) ?? undefined);

      await upsertScrapedListing({
        providerId: provider.id,
        rawName: title,
        price: finalPrice,
        currency,
        url: page.url(),
        imageUrl,
      });

      itemsFound++;
    }

    if (itemsFound === 0) {
      topLevelError = 'Compudiskett autenticó, pero no se encontraron precios parseables en los productos inspeccionados.';
    }
  } finally {
    await page.close();
    await context.close();
  }

  await finalizeScrapeJob(jobId, itemsFound, topLevelError);

  if (topLevelError) {
    throw new Error(topLevelError);
  }
}