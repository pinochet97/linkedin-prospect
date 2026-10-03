/**
 * Valida os helpers de seleção contra HTML parecido com o do LinkedIn.
 *
 * Não acessa o LinkedIn: usa `page.setContent` com fixtures locais. Serve para
 * detectar quando um helper para de funcionar sem precisar de sessão real.
 * É ignorado quando o Chromium do Playwright não está instalado.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { findButtonByName, textOf } from '@/automation/linkedin/helpers';
import { readConnectionState, parseHeadline } from '@/automation/linkedin/profile';
import { LinkedInSelectors, LinkedInText } from '@/automation/linkedin/selectors';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');

const launchOptions = {
  headless: true,
  executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
};

const chromiumAvailable = await chromium
  .launch(launchOptions)
  .then(async (browser) => {
    await browser.close();
    return true;
  })
  .catch(() => false);

describe('parseHeadline', () => {
  it('separa cargo e empresa', () => {
    expect(parseHeadline('Founder & CEO na Clinicorp')).toEqual({ jobTitle: 'Founder & CEO', company: 'Clinicorp' });
    expect(parseHeadline('CTO at Omie')).toEqual({ jobTitle: 'CTO', company: 'Omie' });
    expect(parseHeadline('Head de Growth | SaaS B2B')).toEqual({ jobTitle: 'Head de Growth', company: null });
    expect(parseHeadline(null)).toEqual({ jobTitle: null, company: null });
  });
});

const suite = chromiumAvailable ? describe : describe.skip;

suite('helpers de seleção (Chromium)', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch(launchOptions);
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser?.close();
  });

  it('lê os campos do perfil', async () => {
    await page.setContent(fixture('profile.html'));
    expect(await textOf(page, LinkedInSelectors.profileName)).toBe('Rafael Souza');
    expect(await textOf(page, LinkedInSelectors.profileHeadline)).toBe('Founder & CEO na Clinicorp');
    expect(await textOf(page, LinkedInSelectors.profileLocation)).toBe('Florianópolis, SC');
    expect(await textOf(page, LinkedInSelectors.profileCurrentCompany)).toBe('Clinicorp');
  });

  it('acha o botão de conectar pelo nome acessível', async () => {
    await page.setContent(fixture('profile.html'));
    expect(await findButtonByName(page, LinkedInText.connect)).not.toBeNull();
  });

  it('não inventa um botão que não existe', async () => {
    await page.setContent(fixture('profile-connected.html'));
    expect(await findButtonByName(page, LinkedInText.connect)).toBeNull();
  });

  it('detecta os três estados de conexão', async () => {
    await page.setContent(fixture('profile.html'));
    expect(await readConnectionState(page)).toBe('not_connected');

    await page.setContent(fixture('profile-pending.html'));
    expect(await readConnectionState(page)).toBe('pending');

    await page.setContent(fixture('profile-connected.html'));
    expect(await readConnectionState(page)).toBe('connected');
  });
});
