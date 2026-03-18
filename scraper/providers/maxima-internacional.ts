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

const PROVIDER_NAME = 'Maxima Internacional';
const BASE_URL = 'https://www.maximainternacional.com.pe';
const LOGIN_URL = 'https://www.maximainternacional.com.pe/Clientes';
const LIST_URL = 'https://www.maximainternacional.com.pe/Productos/Ingresos_Recientes';
const MAX_ITEMS = 60;

interface CandidateItem {
  name: string;
  url: string;
  imageUrl?: string;
  priceText: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function authenticate(page: Page, user: string, pass: string) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.fill('#Usuario', user);
  await page.fill('#Password', pass);
  await Promise.all([
    page.waitForLoadState('domcontentloaded').catch(() => {}),
    page.locator('input[type="submit"][value="INGRESAR"]').click(),
  ]);
  await page.waitForTimeout(4000);

  if ((await page.locator('#Usuario').count()) > 0 && (await page.locator('#Password').count()) > 0) {
    throw new Error('Maxima rechazó el inicio de sesión. Verifica las credenciales guardadas.');
  }
}

async function collectCandidates(page: Page): Promise<CandidateItem[]> {
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await delay(3000);

  const rawItems = await page.locator('a[href*="ProductoDetalle"]').evaluateAll((anchors) =>
    anchors
      .map((anchor) => {
        const href = (anchor as HTMLAnchorElement).href;
        const text = anchor.textContent?.replace(/\s+/g, ' ').trim() ?? '';

        if (!href || !text || /registro|cliente|ingreso/i.test(text)) {
          return null;
        }

        const container = anchor.closest('article, li, .item, .product, .product-item, .card, .swiper-slide') || anchor.parentElement || anchor;
        const imageUrl = (container.querySelector('img') as HTMLImageElement | null)?.src ?? undefined;
        const priceText = (container.textContent ?? '').replace(/\s+/g, ' ').trim();

        return { name: text, url: href, imageUrl, priceText };
      })
        .filter(Boolean) as CandidateItem[]
      );

  const deduped = new Map<string, CandidateItem>();
  for (const item of rawItems) {
    if (!deduped.has(item.url)) {
      deduped.set(item.url, item);
    }
  }

  return Array.from(deduped.values()).slice(0, MAX_ITEMS);
}

export async function scrapeMaximaInternacional(jobId: string, options?: RunAllScrapersOptions): Promise<void> {
  const credentials = resolveWholesalerCredentials('MAXIMA', options?.credentialOverrides);
  const user = credentials?.username;
  const pass = credentials?.password;

  if (!user || !pass) {
    throw new Error('Credenciales MAXIMA_USER/MAXIMA_PASS no configuradas');
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
      let currency = detectCurrencyCode(item.priceText);
      let finalPrice = parsePriceTextForCurrency(item.priceText, currency);
      let finalImageUrl = toAbsoluteMediaUrl(BASE_URL, item.imageUrl);

      if (!finalPrice) {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await delay(2000);
        const detailText = await page.locator('body').innerText();
        currency = detectCurrencyCode(detailText);
        finalPrice = parsePriceTextForCurrency(detailText, currency);
        finalImageUrl = finalImageUrl ?? toAbsoluteMediaUrl(BASE_URL, await page.locator('img').first().getAttribute('src').catch(() => null) ?? undefined);
      }

      if (!finalPrice) {
        continue;
      }

      await upsertScrapedListing({
        providerId: provider.id,
        rawName: item.name,
        price: finalPrice,
        currency,
        url: item.url,
        imageUrl: finalImageUrl,
      });

      itemsFound++;
    }

    if (itemsFound === 0) {
      topLevelError = 'Maxima autenticó, pero no se encontraron precios parseables en los productos inspeccionados.';
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