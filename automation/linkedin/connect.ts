import type { Page } from 'playwright';
import { getConfig } from '@/lib/config';
import { AutomationError, type ConnectionRequestResult } from './adapter';
import { humanDelay } from './browser';
import { findButtonByName, firstVisible, requireButtonByName } from './helpers';
import { openProfile, readConnectionState } from './profile';
import { LinkedInSelectors, LinkedInText } from './selectors';

/**
 * Convite de conexão.
 *
 * Idempotente por construção: antes de qualquer clique, conferimos o estado
 * real do perfil. Se já é conexão ou já existe convite pendente, saímos sem
 * enviar nada.
 *
 * Com DRY_RUN=true percorremos o caminho inteiro — abrir o modal, escrever a
 * nota, localizar o botão de envio — e paramos exatamente antes do clique
 * final.
 */
export async function requestConnection(
  page: Page,
  profileUrl: string,
  note: string | null,
): Promise<ConnectionRequestResult> {
  const dryRun = getConfig().DRY_RUN;
  await openProfile(page, profileUrl);

  const state = await readConnectionState(page);
  if (state === 'connected') return { outcome: 'already_connected' };
  if (state === 'pending') return { outcome: 'already_pending' };

  let connectButton = await findButtonByName(page, LinkedInText.connect);

  // Em alguns perfis o "Conectar" fica dentro do menu "Mais".
  if (!connectButton) {
    const more = await findButtonByName(page, LinkedInText.more);
    if (more) {
      await more.click();
      await humanDelay(500, 1200);
      connectButton = await findButtonByName(page, LinkedInText.connect);
    }
  }

  if (!connectButton) {
    return { outcome: 'unavailable', message: 'Perfil não oferece a ação de conectar.' };
  }

  await connectButton.click();
  await humanDelay(700, 1500);

  const modal = await firstVisible(page, LinkedInSelectors.connectModal);
  if (!modal) {
    throw new AutomationError('Modal de convite não abriu', { profileUrl });
  }

  let noteSent = false;
  if (note) {
    const addNote = await findButtonByName(modal, LinkedInText.addNote);
    if (addNote) {
      await addNote.click();
      await humanDelay(400, 900);
    }

    const textarea = await firstVisible(page, LinkedInSelectors.connectNoteTextarea);
    if (textarea) {
      await textarea.fill(note);
      noteSent = true;
      await humanDelay(400, 900);
    }
    // Sem campo de nota disponível (limite mensal do LinkedIn): segue sem nota.
  }

  const sendButton = await requireButtonByName(modal, LinkedInText.send, 'enviar convite', { profileUrl });

  if (dryRun) {
    // DRY RUN: tudo pronto, mas não clicamos. Fecha o modal e volta.
    const dismiss = await findButtonByName(modal, LinkedInText.dismiss);
    await dismiss?.click().catch(() => undefined);
    await page.keyboard.press('Escape').catch(() => undefined);
    return { outcome: 'dry_run', noteSent, message: 'DRY_RUN: convite pronto, envio não executado.' };
  }

  await sendButton.click();
  await humanDelay(1200, 2500);

  // Confirmação: o modal fecha e o perfil passa a mostrar "Pendente".
  const stillOpen = await firstVisible(page, LinkedInSelectors.connectModal);
  if (stillOpen) {
    const stillSend = await findButtonByName(stillOpen, LinkedInText.send);
    if (stillSend) {
      throw new AutomationError('Cliquei em enviar mas o modal continuou aberto', { profileUrl });
    }
  }

  return { outcome: 'sent', noteSent };
}
