import { applyFacts, listLeadsForReplyCheck, touchReplyCheck } from '@/lib/db/repositories/leads';
import { recordInboundReply } from '@/lib/db/repositories/messages';
import { log } from '@/lib/db/repositories/logs';
import { ACTIONS } from '@/lib/activity';
import { AutomationError } from '@/automation/linkedin';
import type { CampaignRow, EnrollmentWithLead } from '@/lib/db/types';
import { getCampaign } from '@/lib/db/repositories/campaigns';
import type { WorkerContext } from '../context';

/**
 * Detecção de resposta.
 *
 * Roda em dois momentos: periodicamente, e SEMPRE antes de um follow-up.
 * Uma resposta interrompe a sequência na hora — o lead nunca recebe mais nada.
 */
export async function checkLeadReply(
  context: WorkerContext,
  enrollment: EnrollmentWithLead,
  campaign: CampaignRow | null,
): Promise<boolean> {
  if (!context.config.ENABLE_REPLY_CHECK) return false;
  if (enrollment.replied_at) return true;

  const lastSentAt =
    enrollment.followup_2_sent_at ??
    enrollment.followup_1_sent_at ??
    enrollment.first_message_sent_at ??
    null;

  const inbound = await context.adapter.fetchLatestInboundMessage(
    enrollment.lead.linkedin_url,
    enrollment.lead.full_name,
    lastSentAt,
  );
  await touchReplyCheck(enrollment.id);

  if (!inbound) return false;

  await recordInboundReply(enrollment.id, inbound.text, inbound.receivedAt);
  await applyFacts(enrollment.id, {
    replied_at: inbound.receivedAt,
    reply_text: inbound.text.slice(0, 2000),
    sequence_stopped: true,
  });

  await log({
    action: ACTIONS.replyDetected,
    status: 'success',
    campaignId: campaign?.id ?? enrollment.campaign_id,
    leadId: enrollment.lead_id,
    enrollmentId: enrollment.id,
    message: `${enrollment.lead.full_name} respondeu.`,
    metadata: { preview: inbound.text.slice(0, 200) },
  });

  return true;
}

/** Varredura periódica das conversas de quem está em sequência. */
export async function processReplyChecks(context: WorkerContext, limit = 10): Promise<number> {
  if (!context.config.ENABLE_REPLY_CHECK || context.settings.automation_paused) return 0;

  const candidates = await listLeadsForReplyCheck(limit, context.config.CONNECTION_CHECK_INTERVAL_HOURS);
  let replies = 0;

  for (const enrollment of candidates) {
    try {
      const campaign = await getCampaign(enrollment.campaign_id);
      if (await checkLeadReply(context, enrollment, campaign)) replies += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await log({
        action: ACTIONS.replyDetected,
        status: 'failed',
        campaignId: enrollment.campaign_id,
        leadId: enrollment.lead_id,
        enrollmentId: enrollment.id,
        message: message.slice(0, 500),
        screenshotPath: error instanceof AutomationError ? error.screenshotPath : null,
      });
    }
  }

  return replies;
}
