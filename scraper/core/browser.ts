import { chromium, Browser, BrowserContext } from 'playwright';

let browserInstance: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    });
  }
  return browserInstance;
}

export async function getContext(browser: Browser): Promise<BrowserContext> {
  return await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'es-PE',
  });
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance && browserInstance.isConnected()) {
    await browserInstance.close();
    browserInstance = null;
  }
}
