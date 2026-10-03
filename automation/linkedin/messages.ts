import type { Page } from 'playwright';
import { getConfig } from '@/lib/config';
import { AutomationError, type SendMessageResult } from './adapter';
import { humanDelay } from './browser';
import { findButtonByName, firstVisible } from './helpers';
import { openProfile, readConnectionState } from './profile';
import { LinkedInSelectors, LinkedInText } from './selectors';

/**
 * Envio de mensagem pelo overlay do perfil.
 *
 * Só envia para quem já é conexão. Com DRY_RUN escreve a mensagem no composer
 * e para antes de clicar em enviar (limpando o rascunho).
 */
export async function sendMessage(page: Page, profileUrl: string, body: string): Promise<SendMessageResult> {
  const dryRun = getConfig().DRY_RUN;
  await openProfile(page, profileUrl);

  const state = await readConnectionState(page);
  if (state !== 'connected') {
    return { outcome: 'unavailable', message: `Perfil não é conexão (estado: ${state}).` };
  }

  const messageButton = await findButtonByName(page, LinkedInText.message);
  if (!messageButton) {
    return { outcome: 'unavailable', message: 'Perfil não oferece a ação de mensagem.' };
  }

  await messageButton.click();
  await humanDelay(900, 1800);

  const composer = await firstVisible(page, LinkedInSelectors.messageOverlayComposer);
  if (!composer) {
    throw new AutomationError('Composer de mensagem não abriu', { profileUrl });
  }

  await composer.click();
  await composer.fill('');
  await composer.type(body, { delay: 18 });
  await humanDelay(600, 1400);

  const sendButton = await firstVisible(page, LinkedInSelectors.messageSendButton);
  if (!sendButton) {
    throw new AutomationError('Botão de enviar mensagem não encontrado', { profileUrl });
  }

  if (dryRun) {
    await composer.fill('');
    await page.keyboard.press('Escape').catch(() => undefined);
    return { outcome: 'dry_run', message: 'DRY_RUN: mensagem escrita, envio não executado.' };
  }

  await sendButton.click();
  await humanDelay(1200, 2400);

  const leftover = (await composer.innerText().catch(() => ''))?.trim();
  if (leftover && leftover.length > 0) {
    throw new AutomationError('Mensagem continuou no composer depois do envio', { profileUrl });
  }

  return { outcome: 'sent' };
}
