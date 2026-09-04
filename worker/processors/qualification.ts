import { applyFacts } from '@/lib/db/repositories/leads';
import { log } from '@/lib/db/repositories/logs';
import { qualifyLead } from '@/lib/ai/qualify';
import { ACTIONS } from '@/lib/activity';
import type { CampaignRow, EnrollmentWithLead } from '@/lib/db/types';
import { toLeadContext, type WorkerContext } from '../context';

/**
 * Qualificação. Não toca o LinkedIn: usa o que a descoberta já trouxe.
 * O filtro barato (`prefilter`) roda antes da IA e evita gastar token com
 * perfis obviamente fora do ICP.
 */
export async function processQualification(
  _context: WorkerContext,
  enrollment: EnrollmentWithLead,
  campaign: CampaignRow,
): Promise<void> {
  const result = await qualifyLead(toLeadContext(enrollment), campaign.icp_description);

  await applyFacts(enrollment.id, {
    qualification_score: result.score,
    qualification_reason: result.reason,
    qualification_segment: result.segment,
  });

  await log({
    action: ACTIONS.qualify,
    status: 'success',
    campaignId: campaign.id,
    leadId: enrollment.lead_id,
    enrollmentId: enrollment.id,
    message: `${result.score}/100 — ${result.reason}`,
    metadata: { score: result.score, segment: result.segment, source: result.source },
  });
}
