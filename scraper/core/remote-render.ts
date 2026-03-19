import type { Page } from 'playwright';

type ScrapeBackend = 'firecrawl' | 'scraperapi' | 'playwright';

interface LoadRenderedPageOptions {
  providerName: string;
  waitForSelector?: string;
  timeoutMs?: number;
  scrollSteps?: number;
  headers?: Record<string, string>;
}

interface FirecrawlScrapeResponse {
  success: boolean;
  data?: {
    html?: string;
    rawHtml?: string;
    metadata?: {
      statusCode?: number;
      error?: string;
    };
  };
  error?: string;
}

const DEFAULT_BACKENDS: ScrapeBackend[] = ['firecrawl', 'scraperapi', 'playwright'];

function providerEnvSuffix(providerName: string): string {
  return providerName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function parseBackendOrder(providerName: string): ScrapeBackend[] {
  const configured = (
    process.env[`SCRAPE_HTML_BACKENDS_${providerEnvSuffix(providerName)}`] ??
    process.env.SCRAPE_HTML_BACKENDS ??
    DEFAULT_BACKENDS.join(',')
  )
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  const ordered: ScrapeBackend[] = [];
  for (const entry of configured) {
    if ((entry === 'firecrawl' || entry === 'scraperapi' || entry === 'playwright') && !ordered.includes(entry)) {
      ordered.push(entry);
    }
  }

  return ordered.length > 0 ? ordered : DEFAULT_BACKENDS;
}

function injectBaseHref(html: string, url: string): string {
  const baseTag = `<base href="${url}">`;

  if (/<base\s/i.test(html)) {
    return html;
  }

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  }

  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${baseTag}</head>`);
  }

  return `<html><head>${baseTag}</head><body>${html}</body></html>`;
}

function buildFirecrawlActions(options: LoadRenderedPageOptions) {
  const actions: Array<Record<string, unknown>> = [];
  const steps = Math.max(0, Math.min(options.scrollSteps ?? 4, 10));

  if (options.waitForSelector) {
    actions.push({ type: 'wait', selector: options.waitForSelector });
  }

  for (let index = 0; index < steps; index++) {
    actions.push({ type: 'scroll', direction: 'down' });
    actions.push({ type: 'wait', milliseconds: 800 });
  }

  return actions;
}

async function fetchFirecrawlHtml(url: string, options: LoadRenderedPageOptions): Promise<string> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('FIRECRAWL_API_KEY no configurado');
  }

  const timeout = Math.max(1000, Math.min(options.timeoutMs ?? 60000, 300000));
  const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['html'],
      onlyMainContent: false,
      waitFor: 1500,
      timeout,
      maxAge: 0,
      proxy: process.env.FIRECRAWL_PROXY_MODE ?? 'auto',
      blockAds: true,
      storeInCache: false,
      location: {
        country: 'PE',
        languages: ['es-PE', 'es', 'en-US'],
      },
      headers: {
        'Accept-Language': 'es-PE,es;q=0.9,en-US;q=0.8,en;q=0.7',
        ...options.headers,
      },
      actions: buildFirecrawlActions(options),
    }),
    signal: AbortSignal.timeout(timeout + 5000),
  });

  const payload = (await response.json()) as FirecrawlScrapeResponse;
  if (!response.ok || !payload.success) {
    throw new Error(
      payload.error ??
        payload.data?.metadata?.error ??
        `Firecrawl devolvio ${response.status} para ${url}`
    );
  }

  const html = payload.data?.html ?? payload.data?.rawHtml;
  if (!html?.trim()) {
    throw new Error(`Firecrawl no devolvio HTML util para ${url}`);
  }

  return html;
}

async function fetchScraperApiHtml(url: string, options: LoadRenderedPageOptions): Promise<string> {
  const apiKey = process.env.SCRAPERAPI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('SCRAPERAPI_API_KEY no configurado');
  }

  const endpoint = new URL('https://api.scraperapi.com/');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('render', 'true');
  if (options.waitForSelector) {
    endpoint.searchParams.set('wait_for_selector', options.waitForSelector);
  }
  if ((process.env.SCRAPERAPI_PREMIUM ?? 'false').toLowerCase() === 'true') {
    endpoint.searchParams.set('premium', 'true');
  }
  if ((process.env.SCRAPERAPI_ULTRA_PREMIUM ?? 'false').toLowerCase() === 'true') {
    endpoint.searchParams.set('ultra_premium', 'true');
  }
  if (process.env.SCRAPERAPI_COUNTRY_CODE?.trim()) {
    endpoint.searchParams.set('country_code', process.env.SCRAPERAPI_COUNTRY_CODE.trim());
  }
  if (process.env.SCRAPERAPI_DEVICE_TYPE?.trim()) {
    endpoint.searchParams.set('device_type', process.env.SCRAPERAPI_DEVICE_TYPE.trim());
  }

  const timeout = Math.max(1000, Math.min(options.timeoutMs ?? 70000, 70000));
  const response = await fetch(endpoint, {
    headers: {
      'x-sapi-api_key': apiKey,
      'Accept-Language': 'es-PE,es;q=0.9,en-US;q=0.8,en;q=0.7',
      ...options.headers,
    },
    signal: AbortSignal.timeout(timeout),
  });

  const html = await response.text();
  if (!response.ok) {
    throw new Error(`ScraperAPI devolvio ${response.status} para ${url}: ${html.slice(0, 300)}`);
  }

  if (!html.trim()) {
    throw new Error(`ScraperAPI no devolvio HTML util para ${url}`);
  }

  return html;
}

async function autoScroll(page: Page, scrollSteps: number): Promise<void> {
  for (let index = 0; index < scrollSteps; index++) {
    await page.evaluate(() => {
      window.scrollBy(0, Math.max(window.innerHeight, 800));
    });
    await page.waitForTimeout(700);
  }
}

async function loadWithPlaywright(page: Page, url: string, options: LoadRenderedPageOptions): Promise<void> {
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: options.timeoutMs ?? 45000,
  });

  if (options.waitForSelector) {
    await page.waitForSelector(options.waitForSelector, {
      timeout: Math.min(options.timeoutMs ?? 45000, 20000),
    }).catch(() => {});
  }

  await autoScroll(page, Math.max(1, options.scrollSteps ?? 4));
}

export async function loadRenderedPage(
  page: Page,
  url: string,
  options: LoadRenderedPageOptions
): Promise<ScrapeBackend> {
  let lastError: unknown;

  for (const backend of parseBackendOrder(options.providerName)) {
    try {
      if (backend === 'playwright') {
        await loadWithPlaywright(page, url, options);
      } else {
        const html =
          backend === 'firecrawl'
            ? await fetchFirecrawlHtml(url, options)
            : await fetchScraperApiHtml(url, options);

        await page.setContent(injectBaseHref(html, url), { waitUntil: 'domcontentloaded' });
        if (options.waitForSelector) {
          await page.waitForSelector(options.waitForSelector, {
            timeout: Math.min(options.timeoutMs ?? 45000, 15000),
          }).catch(() => {});
        }
      }

      console.log(`[${options.providerName}] HTML cargado con backend=${backend} url=${url}`);
      return backend;
    } catch (error) {
      lastError = error;
      console.warn(
        `[${options.providerName}] backend=${backend} fallo en ${url}: ${String(error)}`
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`[${options.providerName}] no se pudo cargar ${url} con ningun backend`);
}

export async function buildCookieHeader(page: Page, url: string): Promise<string | undefined> {
  const cookies = await page.context().cookies([url]);
  if (cookies.length === 0) {
    return undefined;
  }

  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}