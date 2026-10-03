import type { Locator, Page } from 'playwright';
import { AutomationError } from './adapter';

/**
 * Helpers de seleção robusta. A ordem é sempre role/aria/texto antes de CSS,
 * e quando nada é encontrado a função FALHA — nunca clica em algo próximo.
 */

export async function firstVisible(page: Page, selectors: readonly string[]): Promise<Locator | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) return locator;
  }
  return null;
}

export async function textOf(page: Page, selectors: readonly string[]): Promise<string | null> {
  const locator = await firstVisible(page, selectors);
  if (!locator) return null;
  const text = (await locator.innerText().catch(() => null))?.trim();
  return text && text.length > 0 ? text : null;
}

/** Botão por nome acessível — a forma mais estável de achar algo no LinkedIn. */
export async function findButtonByName(
  scope: Page | Locator,
  patterns: readonly RegExp[],
  options: { timeout?: number } = {},
): Promise<Locator | null> {
  for (const pattern of patterns) {
    const byRole = scope.getByRole('button', { name: pattern }).first();
    if (await byRole.isVisible({ timeout: options.timeout ?? 2000 }).catch(() => false)) return byRole;

    const byLabel = scope.locator(`[aria-label]`).filter({ hasText: pattern }).first();
    if (await byLabel.isVisible().catch(() => false)) return byLabel;
  }
  return null;
}

export async function requireButtonByName(
  scope: Page | Locator,
  patterns: readonly RegExp[],
  what: string,
  context: Record<string, unknown> = {},
): Promise<Locator> {
  const button = await findButtonByName(scope, patterns);
  if (!button) {
    throw new AutomationError(`Botão não encontrado: ${what}`, { ...context, patterns: patterns.map(String) });
  }
  return button;
}

/** Um trecho pequeno do HTML, para investigar uma falha sem guardar a página inteira. */
export async function htmlSnippet(page: Page, limit = 1500): Promise<string> {
  try {
    const main = page.locator('main').first();
    const html = (await main.innerHTML().catch(() => null)) ?? (await page.content());
    return html.slice(0, limit);
  } catch {
    return '';
  }
}
