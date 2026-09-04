import { applyFacts, enrichLeadProfile, getEnrollment, recordFailure, touchAttempt } from '@/lib/db/repositories/leads';
import { getMessage, markMessageSent, saveGeneratedMessage } from '@/lib/db/repositories/messages';
import { log } from '@/lib/db/repositories/logs';
import { generateConnectionNote } from '@/lib/ai/personalize';
import { canRequestConnection } from '@/lib/engine/guards';
import { toFacts } from '@/lib/db/types';
import { ACTIONS } from '@/lib/activity';
import type { CampaignRow, EnrollmentWithLead } from '@/lib/db/types';
import { toLeadContext, type WorkerContext } from '../context';

/**
 * Convite de conexão.
 *
 * Ordem obrigatória: consultar o banco (guard) → ler o estado real no
 * LinkedIn (dentro do adapter) → só então agir.
 */
export async function processConnectionRequest(
  context: WorkerContext,
  enrollment: EnrollmentWithLead,
  campaign: CampaignRow,
): Promise<void> {
  const guard = canRequestConnection(toFacts(enrollment));
  if (!guard.ok) {
    await log({
      action: ACTIONS.connect,
      status: 'skipped',
      campaignId: campaign.id,
      leadId: enrollment.lead_id,
      enrollmentId: enrollment.id,
      message: guard.reason,
    });
    await applyFacts(enrollment.id, {});
    return;
  }

  // Já estamos abrindo o perfil para conectar: aproveitamos para completar os
  // dados que faltam, sem custo extra de navegação.
  let current = enrollment;
  if (!enrollment.lead.profile_enriched_at) {
    const details = await context.adapter.fetchProfile(enrollment.lead.linkedin_url);
    await enrichLeadProfile(enrollment.lead_id, {
      headline: details.headline ?? null,
      job_title: details.jobTitle ?? null,
      company: details.company ?? null,
      location: details.location ?? null,
      profile_summary: details.summary ?? null,
    });
    current = (await getEnrollment(enrollment.id)) ?? enrollment;
  }

  const existing = await getMessage(enrollment.id, 'connection_note');
  const note =
    existing?.body ??
    (await generateConnectionNote(toLeadContext(current), context.profile, campaign.connection_note_max_chars));
  if (!existing) await saveGeneratedMessage(enrollment.id, 'connection_note', note);

  await touchAttempt(enrollment.id);
  const result = await context.adapter.sendConnectionRequest(current.lead.linkedin_url, note);

  switch (result.outcome) {
    case 'sent':
    case 'dry_run': {
      const dryRun = result.outcome === 'dry_run';
      await applyFacts(enrollment.id, {
        linkedin_connection_requested_at: new Date(),
        connection_status: 'pending',
        last_error: null,
      });
      await markMessageSent(enrollment.id, 'connection_note', { dryRun });
      await log({
        action: ACTIONS.connect,
        status: 'success',
        campaignId: campaign.id,
        leadId: enrollment.lead_id,
        enrollmentId: enrollment.id,
        message: dryRun ? 'DRY RUN: convite não enviado de verdade.' : 'Convite enviado.',
        metadata: { dryRun, adapter: context.adapter.name, noteSent: result.noteSent ?? false, note },
      });
      return;
    }

    case 'already_connected': {
      await applyFacts(enrollment.id, {
        connection_status: 'connected',
        linkedin_connected_at: new Date(),
        linkedin_connection_requested_at: enrollment.linkedin_connection_requested_at ?? new Date(),
      });
      await log({
        action: ACTIONS.connect,
        status: 'skipped',
        campaignId: campaign.id,
        leadId: enrollment.lead_id,
        enrollmentId: enrollment.id,
        message: 'Já era conexão — seguimos direto para a mensagem.',
      });
      return;
    }

    case 'already_pending': {
      await applyFacts(enrollment.id, {
        connection_status: 'pending',
        linkedin_connection_requested_at: new Date(),
      });
      await log({
        action: ACTIONS.connect,
        status: 'skipped',
        campaignId: campaign.id,
        leadId: enrollment.lead_id,
        enrollmentId: enrollment.id,
        message: 'Já existia convite pendente.',
      });
      return;
    }

    case 'unavailable': {
      await recordFailure(enrollment.id, result.message ?? 'Perfil não permite conexão.');
      await log({
        action: ACTIONS.connect,
        status: 'failed',
        campaignId: campaign.id,
        leadId: enrollment.lead_id,
        enrollmentId: enrollment.id,
        message: result.message ?? 'Perfil não permite conexão.',
      });
    }
  }
}
