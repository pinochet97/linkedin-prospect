import type { Page } from 'playwright';
import type { InboundMessage } from './adapter';
import { humanDelay } from './browser';
import { findButtonByName, firstVisible } from './helpers';
import { openProfile } from './profile';
import { LinkedInSelectors, LinkedInText } from './selectors';

/**
 * Detecção de resposta.
 *
 * Regra deliberadamente conservadora: só consideramos que houve resposta
 * quando a ÚLTIMA mensagem da conversa é claramente do lead. Se o remetente
 * não puder ser identificado, devolvemos `null` — preferimos deixar de
 * detectar (o pior caso é um follow-up a mais) do que marcar uma resposta que
 * não existiu e parar a sequência sem motivo.
 */

interface ThreadMessage {
  sender: string | null;
  body: string;
}

/** Percorre a thread propagando o remetente (mensagens seguidas omitem o nome). */
export function pickLastInbound(messages: ThreadMessage[], leadFullName: string): string | null {
  const leadTokens = leadFullName
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 2);

  let currentSender: string | null = null;
  let lastSenderWasLead: boolean | null = null;
  let lastBody: string | null = null;

  for (const message of messages) {
    if (message.sender) currentSender = message.sender;
    if (!message.body.trim()) continue;

    if (!currentSender) {
      lastSenderWasLead = null;
      lastBody = message.body;
      continue;
    }

    const sender = currentSender.toLowerCase();
    lastSenderWasLead = leadTokens.length > 0 && leadTokens.every((token) => sender.includes(token));
    lastBody = message.body;
  }

  return lastSenderWasLead === true ? lastBody : null;
}

export async function fetchLatestInboundMessage(
  page: Page,
  profileUrl: string,
  leadFullName: string,
): Promise<InboundMessage | null> {
  await openProfile(page, profileUrl);

  const messageButton = await findButtonByName(page, LinkedInText.message);
  if (!messageButton) return null;

  await messageButton.click();
  await humanDelay(1200, 2200);

  const container = await firstVisible(page, LinkedInSelectors.messageThreadItem);
  if (!container) return null;

  const items = page.locator(LinkedInSelectors.messageThreadItem.join(', '));
  const total = await items.count();
  const messages: ThreadMessage[] = [];

  for (let index = 0; index < total; index += 1) {
    const item = items.nth(index);
    let sender: string | null = null;
    for (const selector of LinkedInSelectors.messageThreadSenderName) {
      const found = await item.locator(selector).first().innerText().catch(() => null);
      if (found?.trim()) {
        sender = found.trim();
        break;
      }
    }

    let body = '';
    for (const selector of LinkedInSelectors.messageThreadBody) {
      const found = await item.locator(selector).first().innerText().catch(() => null);
      if (found?.trim()) {
        body = found.trim();
        break;
      }
    }

    messages.push({ sender, body });
  }

  await page.keyboard.press('Escape').catch(() => undefined);

  const inbound = pickLastInbound(messages, leadFullName);
  if (!inbound) return null;

  // O LinkedIn não expõe um timestamp confiável por mensagem; usamos o momento
  // da detecção, que é o que o motor precisa para parar a sequência.
  return { text: inbound.slice(0, 2000), receivedAt: new Date() };
}
