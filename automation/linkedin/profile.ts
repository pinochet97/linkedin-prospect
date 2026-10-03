import type { Page } from 'playwright';
import { normalizeLinkedInUrl } from '@/lib/engine/dedupe';
import { AutomationError, type ConnectionState, type ProfileDetails } from './adapter';
import { assertSignedIn } from './browser';
import { firstVisible, findButtonByName, textOf } from './helpers';
import { LinkedInSelectors, LinkedInText } from './selectors';

/** Abre o perfil (se ainda não estivermos nele) e confirma que a sessão vale. */
export async function openProfile(page: Page, profileUrl: string): Promise<string> {
  const url = normalizeLinkedInUrl(profileUrl);
  if (!url) throw new AutomationError('URL de perfil inválida', { profileUrl });

  if (!page.url().startsWith(url)) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  }
  await assertSignedIn(page);
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 20_000 });
  return url;
}

/**
 * Estado da conexão lido da própria página:
 *   "Pendente" visível  -> convite já enviado
 *   badge de grau "1"   -> já é conexão
 *   botão "Conectar"    -> ainda não é conexão
 */
export async function readConnectionState(page: Page): Promise<ConnectionState> {
  const pending = await findButtonByName(page, LinkedInText.pending);
  if (pending) return 'pending';

  const badge = await textOf(page, LinkedInSelectors.profileDistanceBadge);
  if (badge && /(^|\s)1(º|st|°)/i.test(badge)) return 'connected';

  const connect = await findButtonByName(page, LinkedInText.connect);
  if (connect) return 'not_connected';

  // Sem botão "Conectar" e sem badge de 1º grau: pode estar atrás do menu "Mais".
  const more = await findButtonByName(page, LinkedInText.more);
  if (more) return 'unknown';

  return 'unknown';
}

/** "Founder & CEO na XPTO" -> { jobTitle, company }. */
export function parseHeadline(headline: string | null): { jobTitle: string | null; company: string | null } {
  if (!headline) return { jobTitle: null, company: null };
  const match = /^(.*?)\s+(?:na|no|at|@|em)\s+(.+)$/i.exec(headline);
  if (match) {
    return { jobTitle: match[1].trim(), company: match[2].split('|')[0].trim() };
  }
  return { jobTitle: headline.split('|')[0].trim(), company: null };
}

export async function readProfile(page: Page, profileUrl: string): Promise<ProfileDetails> {
  const url = await openProfile(page, profileUrl);

  const fullName = await textOf(page, LinkedInSelectors.profileName);
  if (!fullName) {
    throw new AutomationError('Não consegui ler o nome do perfil', { profileUrl: url });
  }

  const headline = await textOf(page, LinkedInSelectors.profileHeadline);
  const location = await textOf(page, LinkedInSelectors.profileLocation);
  const companyFromCard = await textOf(page, LinkedInSelectors.profileCurrentCompany);
  const about = await textOf(page, LinkedInSelectors.profileAbout);
  const derived = parseHeadline(headline);

  return {
    linkedinUrl: url,
    fullName: fullName.split('\n')[0].trim(),
    headline,
    jobTitle: derived.jobTitle,
    company: companyFromCard ?? derived.company,
    location,
    // Resumo curto: o suficiente para a IA personalizar sem inflar o prompt.
    summary: about ? about.slice(0, 600) : null,
    connectionState: await readConnectionState(page),
  };
}

/** Existe um composer de mensagem disponível? (usado antes de tentar enviar) */
export async function hasMessageButton(page: Page): Promise<boolean> {
  return Boolean(await findButtonByName(page, LinkedInText.message));
}

export async function ensureVisibleMain(page: Page): Promise<void> {
  const main = await firstVisible(page, ['main']);
  if (!main) throw new AutomationError('Página do LinkedIn não carregou como esperado', { url: page.url() });
}
