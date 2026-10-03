import type { Page } from 'playwright';
import { dedupeByProfileUrl, normalizeLinkedInUrl } from '@/lib/engine/dedupe';
import { AutomationError, type DiscoveredProfile, type SearchInput } from './adapter';
import { assertSignedIn, humanDelay } from './browser';
import { parseHeadline } from './profile';
import { LinkedInUrls } from './selectors';

/**
 * Descoberta de leads. Duas formas, como pedido:
 *   1. o usuário passa a URL de pesquisa pronta;
 *   2. o usuário passa um texto ("Founder SaaS Brasil") e montamos a URL.
 *
 * Não é um motor de busca: lê o que a página de resultados já mostra.
 */

const DEGREE_LINE = /^(•\s*)?(1|2|3)(º|°|st|nd|rd)?(\s*(grau|degree))?\s*(conexão|connection)?$/i;
const NOISE_LINE =
  /^(status is offline|status is online|ver perfil|view profile|conectar|connect|mensagem|message|seguir|follow|• 3º\+|3º\+|\.\.\.)$/i;

/**
 * O bloco de texto de um resultado vira {nome, headline, localização}.
 * Função pura para conseguir testar sem abrir o browser.
 */
export function parseSearchResultText(raw: string): {
  fullName: string | null;
  headline: string | null;
  location: string | null;
} {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !DEGREE_LINE.test(line) && !NOISE_LINE.test(line));

  // O LinkedIn repete o nome para leitores de tela.
  const unique: string[] = [];
  for (const line of lines) {
    if (unique[unique.length - 1] !== line) unique.push(line);
  }

  const fullName = unique[0] ?? null;
  const headline = unique[1] ?? null;
  const location = unique[2] && /,|\s-\s/.test(unique[2]) ? unique[2] : null;

  return { fullName, headline, location };
}

/** Colhe os perfis visíveis na página de resultados atual. */
async function collectFromPage(page: Page): Promise<DiscoveredProfile[]> {
  const links = page.locator('a[href*="/in/"]');
  const total = await links.count();
  const found: DiscoveredProfile[] = [];

  for (let index = 0; index < total; index += 1) {
    const link = links.nth(index);
    const href = await link.getAttribute('href').catch(() => null);
    const url = normalizeLinkedInUrl(href);
    if (!url) continue;

    // O texto útil está no item da lista que contém o link.
    const container = link.locator('xpath=ancestor::li[1]');
    const text =
      (await container.innerText().catch(() => null)) ?? (await link.innerText().catch(() => null)) ?? '';
    const parsed = parseSearchResultText(text);
    if (!parsed.fullName) continue;

    const derived = parseHeadline(parsed.headline);
    found.push({
      linkedinUrl: url,
      fullName: parsed.fullName,
      headline: parsed.headline,
      jobTitle: derived.jobTitle,
      company: derived.company,
      location: parsed.location,
    });
  }

  return found;
}

export async function searchPeople(page: Page, input: SearchInput): Promise<DiscoveredProfile[]> {
  const target = input.searchUrl?.trim() || (input.query ? LinkedInUrls.peopleSearch(input.query) : null);
  if (!target) {
    throw new AutomationError('Campanha sem busca: informe um texto ou uma URL de pesquisa.');
  }

  await page.goto(target, { waitUntil: 'domcontentloaded' });
  await assertSignedIn(page);

  const collected: DiscoveredProfile[] = [];
  let pageIndex = 0;

  // Poucas páginas de propósito: descoberta é a parte mais visível para o
  // LinkedIn, então vamos devagar e o worker roda de novo depois.
  while (collected.length < input.limit && pageIndex < 5) {
    await page.waitForLoadState('networkidle').catch(() => undefined);
    // Rola até o fim: os resultados carregam sob demanda.
    for (let step = 0; step < 5; step += 1) {
      await page.mouse.wheel(0, 1200);
      await humanDelay(400, 900);
    }

    collected.push(...(await collectFromPage(page)));

    const next = page.locator('button[aria-label*="Avançar"], button[aria-label*="Next"]').first();
    if (collected.length >= input.limit || !(await next.isEnabled().catch(() => false))) break;

    await next.click().catch(() => undefined);
    await humanDelay(2000, 4000);
    pageIndex += 1;
  }

  return dedupeByProfileUrl(collected).slice(0, input.limit);
}
