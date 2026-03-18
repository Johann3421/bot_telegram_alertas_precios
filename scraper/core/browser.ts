import { chromium, Browser, BrowserContext } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';

const CHROME_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-infobars',
  '--disable-dev-shm-usage',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-ipc-flooding-protection',
  // Desactivar restricciones SameSite — necesario para cookies cross-origin (Azure B2C / Intcomex)
  '--disable-features=VizDisplayCompositor,SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure',
  // Forzar HTTP/1.1 — evita ERR_HTTP2_PROTOCOL_ERROR en portales B2B que rechazan HTTP/2
  '--disable-http2',
  '--window-size=1366,768',
];

let browserInstance: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: CHROME_ARGS,
    });
  }
  return browserInstance;
}

// Script inyectado antes de que se cargue cualquier página — oculta marcadores de automatización
const STEALTH_INIT_SCRIPT = `
  // Ocultar propiedad webdriver
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

  // Simular plugins de Chrome
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const plugins = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '', length: 1 },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '', length: 2 },
      ];
      return plugins;
    },
  });

  // Idiomas realistas
  Object.defineProperty(navigator, 'languages', { get: () => ['es-PE', 'es', 'en-US', 'en'] });

  // Chrome runtime
  if (!window.chrome) {
    Object.defineProperty(window, 'chrome', {
      value: {
        app: { isInstalled: false, InstallState: {}, RunningState: {} },
        runtime: {
          onMessage: { addListener: () => {}, removeListener: () => {} },
          sendMessage: () => {},
          id: undefined,
        },
        loadTimes: () => ({}),
        csi: () => ({}),
      },
      writable: true,
    });
  }

  // Permissions API realista
  const originalQuery = window.navigator.permissions && window.navigator.permissions.query;
  if (originalQuery) {
    window.navigator.permissions.query = (parameters) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission, onchange: null } as PermissionStatus)
        : originalQuery.call(window.navigator.permissions, parameters);
  }

  // Ocultar Automation en headless Chrome
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 1 });

  // Azure B2C verifica navigator.cookieEnabled; forzar a true
  Object.defineProperty(navigator, 'cookieEnabled', { get: () => true });
`;

export async function getContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    extraHTTPHeaders: {
      'Accept-Language': 'es-PE,es;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  await context.addInitScript(STEALTH_INIT_SCRIPT);

  return context;
}

/**
 * Lanza un contexto Chromium con perfil de usuario real guardado en disco.
 * Las cookies persisten a través de redirecciones cross-origin (OAuth / Azure B2C).
 * Perfil: <project>/.playwright-profiles/<profileKey>/
 */
export async function getPersistentContext(profileKey: string): Promise<BrowserContext> {
  const dir = path.join(process.cwd(), '.playwright-profiles', profileKey);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const ctx = await chromium.launchPersistentContext(dir, {
    headless: true,
    args: CHROME_ARGS,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    extraHTTPHeaders: {
      'Accept-Language': 'es-PE,es;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });
  await ctx.addInitScript(STEALTH_INIT_SCRIPT);
  return ctx;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance && browserInstance.isConnected()) {
    await browserInstance.close();
    browserInstance = null;
  }
}
