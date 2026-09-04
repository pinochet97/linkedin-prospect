import { AutomationError, SessionExpiredError } from '@/automation/linkedin';
import { getCampaign } from '@/lib/db/repositories/campaigns';
import { claimDueEnrollments, recordFailure, releaseLock } from '@/lib/db/repositories/leads';
import { log } from '@/lib/db/repositories/logs';
import { setAutomationPaused, touchWorkerHeartbeat } from '@/lib/db/repositories/settings';
import { ACTIONS } from '@/lib/activity';
import type { CampaignRow, EnrollmentWithLead } from '@/lib/db/types';
import type { WorkerContext } from './context';
import { checkGates } from './limits';
import { processConnectionCheck } from './processors/connection-check';
import { processConnectionRequest } from './processors/connection';
import { processDiscovery } from './processors/discovery';
import { processMessage } from './processors/message';
import { processQualification } from './processors/qualification';
import { processReplyChecks } from './processors/reply';

/**
 * Worker: um processo, um loop, sem fila externa.
 *
 * A cada ciclo:
 *   1. descobre leads das campanhas ativas com descoberta pendente;
 *   2. pega os leads cuja `next_action_at` já venceu (com lock no banco) e
 *      executa a ação;
 *   3. varre as conversas em busca de respostas.
 *
 * Nada de `for (lead of leads) connect()`: o ritmo vem dos limites e do
 * intervalo entre ações.
 */

const BATCH_SIZE = 5;

export interface TickSummary {
  discovered: number;
  processed: number;
  skipped: number;
  failed: number;
  replies: number;
}

async function dispatch(
  context: WorkerContext,
  enrollment: EnrollmentWithLead,
  campaign: CampaignRow,
): Promise<void> {
  switch (enrollment.next_action) {
    case 'qualify':
      return processQualification(context, enrollment, campaign);
    case 'send_connection_request':
      return processConnectionRequest(context, enrollment, campaign);
    case 'check_connection':
      return processConnectionCheck(context, enrollment, campaign);
    case 'send_first_message':
      return processMessage(context, enrollment, campaign, 'first_message');
    case 'send_followup_1':
      return processMessage(context, enrollment, campaign, 'followup_1');
    case 'send_followup_2':
      return processMessage(context, enrollment, campaign, 'followup_2');
    default:
      return;
  }
}

async function handleFailure(
  enrollment: EnrollmentWithLead,
  campaign: CampaignRow,
  error: unknown,
): Promise<void> {
  // Sessão caída não é erro do lead: para tudo e avisa, em vez de queimar
  // tentativas e marcar leads como problemáticos.
  if (error instanceof SessionExpiredError) {
    await setAutomationPaused(true, 'Sessão do LinkedIn expirada. Rode `npm run linkedin:login`.');
    await log({
      action: ACTIONS.session,
      status: 'failed',
      campaignId: campaign.id,
      leadId: enrollment.lead_id,
      enrollmentId: enrollment.id,
      message: error.message,
    });
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  const updated = await recordFailure(enrollment.id, message);

  await log({
    action: enrollment.next_action ?? 'unknown',
    status: 'failed',
    campaignId: campaign.id,
    leadId: enrollment.lead_id,
    enrollmentId: enrollment.id,
    message: message.slice(0, 500),
    screenshotPath: error instanceof AutomationError ? error.screenshotPath : null,
    metadata: {
      retryCount: updated.retry_count,
      needsReview: updated.status === 'error',
      ...(error instanceof AutomationError ? error.context : {}),
    },
  });
}

async function processDueLeads(context: WorkerContext, summary: TickSummary): Promise<void> {
  const claimed = await claimDueEnrollments(context.workerId, BATCH_SIZE);

  for (const enrollment of claimed) {
    try {
      const campaign = await getCampaign(enrollment.campaign_id);
      if (!campaign || campaign.status !== 'active') {
        summary.skipped += 1;
        continue;
      }

      const action = enrollment.next_action ?? 'none';
      const gate = await checkGates(action, campaign, context);
      if (!gate.allowed) {
        summary.skipped += 1;
        continue;
      }

      await dispatch(context, enrollment, campaign);
      summary.processed += 1;
    } catch (error) {
      summary.failed += 1;
      const campaign = await getCampaign(enrollment.campaign_id);
      if (campaign) await handleFailure(enrollment, campaign, error);
      if (error instanceof SessionExpiredError) break;
    } finally {
      await releaseLock(enrollment.id);
    }
  }
}

export async function tick(context: WorkerContext): Promise<TickSummary> {
  const summary: TickSummary = { discovered: 0, processed: 0, skipped: 0, failed: 0, replies: 0 };

  // O batimento é registrado mesmo com a automação pausada: o dashboard
  // precisa distinguir "worker parado" de "worker rodando e pausado".
  await touchWorkerHeartbeat();
  if (context.settings.automation_paused) return summary;

  summary.discovered = await processDiscovery(context);
  await processDueLeads(context, summary);
  summary.replies = await processReplyChecks(context);

  return summary;
}
