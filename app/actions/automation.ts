'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import { pauseAllCampaigns, resumeKillSwitchedCampaigns } from '@/lib/db/repositories/campaigns';
import { log } from '@/lib/db/repositories/logs';
import { setAutomationPaused } from '@/lib/db/repositories/settings';

/**
 * STOP ALL AUTOMATIONS. Pausa tudo e impede novas ações. Não apaga nada —
 * basta despausar para o worker continuar de onde parou.
 */
export async function stopAllAutomations() {
  await requireAuth();
  const paused = await pauseAllCampaigns();
  await setAutomationPaused(true, 'Parada manual pelo botão de emergência.');
  await log({
    action: 'kill_switch',
    status: 'info',
    message: `Automação parada manualmente. ${paused} campanha(s) pausada(s).`,
  });
  revalidatePath('/', 'layout');
}

export async function resumeAutomations() {
  await requireAuth();
  const resumed = await resumeKillSwitchedCampaigns();
  await setAutomationPaused(false, null);
  await log({
    action: 'kill_switch',
    status: 'info',
    message: `Automação liberada. ${resumed} campanha(s) voltaram ao ar.`,
  });
  revalidatePath('/', 'layout');
}
