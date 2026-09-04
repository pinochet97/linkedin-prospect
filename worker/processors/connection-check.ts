import { applyFacts, touchAttempt } from '@/lib/db/repositories/leads';
import { log } from '@/lib/db/repositories/logs';
import { ACTIONS } from '@/lib/activity';
import type { CampaignRow, EnrollmentWithLead } from '@/lib/db/types';
import type { WorkerContext } from '../context';

/**
 * "A pessoa aceitou?" não é um evento — é polling. Cada verificação registra
 * `last_attempt_at`, e a máquina de estados reagenda a próxima a partir daí.
 */
export async function processConnectionCheck(
  context: WorkerContext,
  enrollment: EnrollmentWithLead,
  campaign: CampaignRow,
): Promise<void> {
  const state = await context.adapter.getConnectionState(enrollment.lead.linkedin_url);
  await touchAttempt(enrollment.id);

  if (state === 'connected') {
    await applyFacts(enrollment.id, {
      connection_status: 'connected',
      linkedin_connected_at: new Date(),
      last_error: null,
    });
    await log({
      action: ACTIONS.connectionAccepted,
      status: 'success',
      campaignId: campaign.id,
      leadId: enrollment.lead_id,
      enrollmentId: enrollment.id,
      message: `${enrollment.lead.full_name} aceitou a conexão.`,
    });
    return;
  }

  await applyFacts(enrollment.id, { connection_status: state });

  // Registrar cada verificação sem novidade inundaria o feed de atividade.
  // O horário da última tentativa fica em `last_attempt_at`; só logamos
  // quando o estado realmente muda.
  if (state !== enrollment.connection_status) {
    await log({
      action: ACTIONS.checkConnection,
      status: 'info',
      campaignId: campaign.id,
      leadId: enrollment.lead_id,
      enrollmentId: enrollment.id,
      message: `Convite ainda não aceito (${enrollment.connection_status} → ${state}).`,
    });
  }
}
