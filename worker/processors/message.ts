import { applyFacts, getEnrollment, recordFailure, touchAttempt } from '@/lib/db/repositories/leads';
import { getMessage, listMessages, markMessageSent, saveGeneratedMessage } from '@/lib/db/repositories/messages';
import { log } from '@/lib/db/repositories/logs';
import { generateFirstMessage, generateFollowup } from '@/lib/ai/personalize';
import { canSendMessage } from '@/lib/engine/guards';
import { toFacts } from '@/lib/db/types';
import { ACTIONS } from '@/lib/activity';
import type { CampaignRow, EnrollmentWithLead } from '@/lib/db/types';
import { toLeadContext, type WorkerContext } from '../context';
import { checkLeadReply } from './reply';

export type OutboundMessageKind = 'first_message' | 'followup_1' | 'followup_2';

const ACTION_BY_KIND: Record<OutboundMessageKind, string> = {
  first_message: ACTIONS.firstMessage,
  followup_1: ACTIONS.followup1,
  followup_2: ACTIONS.followup2,
};

const TIMESTAMP_BY_KIND = {
  first_message: 'first_message_sent_at',
  followup_1: 'followup_1_sent_at',
  followup_2: 'followup_2_sent_at',
} as const;

/**
 * Envio de mensagem (primeira ou follow-up).
 *
 * Antes de QUALQUER follow-up conferimos se a pessoa respondeu. Se respondeu,
 * a sequência para aqui e nada é enviado.
 */
export async function processMessage(
  context: WorkerContext,
  enrollment: EnrollmentWithLead,
  campaign: CampaignRow,
  kind: OutboundMessageKind,
): Promise<void> {
  let current = enrollment;

  if (kind !== 'first_message') {
    const replied = await checkLeadReply(context, enrollment, campaign);
    if (replied) return;
    current = (await getEnrollment(enrollment.id)) ?? enrollment;
  }

  const guard = canSendMessage(toFacts(current), kind);
  if (!guard.ok) {
    await log({
      action: ACTION_BY_KIND[kind],
      status: 'skipped',
      campaignId: campaign.id,
      leadId: current.lead_id,
      enrollmentId: current.id,
      message: guard.reason,
    });
    await applyFacts(current.id, {});
    return;
  }

  const existing = await getMessage(current.id, kind);
  let body = existing?.body ?? null;

  if (!body) {
    if (kind === 'first_message') {
      body = await generateFirstMessage(toLeadContext(current), context.profile);
    } else {
      const previous = (await listMessages(current.id))
        .filter((message) => message.kind !== 'inbound_reply' && message.sent_at)
        .map((message) => message.body);
      body = await generateFollowup(toLeadContext(current), context.profile, previous, kind === 'followup_1' ? 1 : 2);
    }
    await saveGeneratedMessage(current.id, kind, body);
  }

  await touchAttempt(current.id);
  const result = await context.adapter.sendMessage(current.lead.linkedin_url, body);

  if (result.outcome === 'unavailable') {
    await recordFailure(current.id, result.message ?? 'Não foi possível abrir a conversa.');
    await log({
      action: ACTION_BY_KIND[kind],
      status: 'failed',
      campaignId: campaign.id,
      leadId: current.lead_id,
      enrollmentId: current.id,
      message: result.message ?? 'Não foi possível abrir a conversa.',
    });
    return;
  }

  const dryRun = result.outcome === 'dry_run';
  await applyFacts(current.id, { [TIMESTAMP_BY_KIND[kind]]: new Date(), last_error: null });
  await markMessageSent(current.id, kind, { dryRun });

  await log({
    action: ACTION_BY_KIND[kind],
    status: 'success',
    campaignId: campaign.id,
    leadId: current.lead_id,
    enrollmentId: current.id,
    message: dryRun ? 'DRY RUN: mensagem não enviada de verdade.' : `Mensagem enviada para ${current.lead.full_name}.`,
    metadata: { dryRun, adapter: context.adapter.name, body },
  });
}
