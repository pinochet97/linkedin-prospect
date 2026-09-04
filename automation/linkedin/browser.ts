import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { getConfig } from '@/lib/config';
import { LinkedInSelectors, LinkedInUrls } from './selectors';
import { SessionExpiredError } from './adapter';

/**
 * Camada de browser. Um único Chromium com **perfil persistente**: o usuário
 * loga uma vez à mão (`npm run linkedin:login`) e a sessão é reaproveitada
 * pelo worker.
 *
 * Nunca guardamos usuário/senha do LinkedIn — só o profile do navegador.
 */

export interface BrowserSession {
  context: BrowserContext;
  page: Page;
  /** Salva um PNG e devolve o caminho relativo (ou null se falhar). */
  screenshot(name: string): Promise<string | null>;
  close(): Promise<void>;
}

export interface LaunchOptions {
  headless?: boolean;
  profileDir?: string;
}

export async function launchBrowser(options: LaunchOptions = {}): Promise<BrowserSession> {
  const config = getConfig();
  const profileDir = resolve(options.profileDir ?? config.CHROME_PROFILE_DIR);
  const screenshotDir = resolve(config.SCREENSHOT_DIR);
  mkdirSync(profileDir, { recursive: true });
  mkdirSync(screenshotDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: options.headless ?? config.HEADLESS,
    executablePath: config.CHROME_EXECUTABLE_PATH || undefined,
    viewport: { width: 1360, height: 900 },
    locale: 'pt-BR',
    timezoneId: config.APP_TIMEZONE,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  context.setDefaultTimeout(20_000);
  context.setDefaultNavigationTimeout(45_000);

  const page = context.pages()[0] ?? (await context.newPage());

  return {
    context,
    page,
    async screenshot(name: string) {
      try {
        const file = join(screenshotDir, `${Date.now()}-${name.replace(/[^a-z0-9_-]/gi, '_')}.png`);
        await page.screenshot({ path: file, fullPage: false });
        return file;
      } catch {
        return null;
      }
    },
    async close() {
      await context.close().catch(() => undefined);
    },
  };
}

/** A sessão ainda está válida? Não navega se já estivermos numa página do LinkedIn. */
export async function assertSignedIn(page: Page): Promise<void> {
  if (!page.url().includes('linkedin.com')) {
    await page.goto(LinkedInUrls.home, { waitUntil: 'domcontentloaded' });
  }

  for (const selector of LinkedInSelectors.signedOutMarker) {
    if ((await page.locator(selector).count()) > 0) {
      throw new SessionExpiredError();
    }
  }

  const signedIn = await Promise.any(
    LinkedInSelectors.signedInMarker.map(async (selector) => {
      await page.locator(selector).first().waitFor({ state: 'attached', timeout: 8000 });
      return true;
    }),
  ).catch(() => false);

  if (!signedIn) throw new SessionExpiredError();
}

/** Pausa aleatória entre ações — nada de rajada. */
export async function humanDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.round(minMs + Math.random() * Math.max(0, maxMs - minMs));
  await new Promise((done) => setTimeout(done, delay));
}
