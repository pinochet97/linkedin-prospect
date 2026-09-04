/**
 * Ponta a ponta com o LinkedIn simulado.
 *
 * Roda o worker de verdade (mesmo `tick()` do `npm run worker`) contra o
 * MockLinkedInAdapter e o Postgres local, exercitando o fluxo inteiro:
 *
 *   descobrir → qualificar → convidar → detectar aceite → mensagem →
 *   follow-up 1 → follow-up 2 → concluído
 *
 * e o caminho alternativo: resposta interrompe a sequência.
 *
 * Ignorado quando não há Postgres acessível.
 */
import 'dotenv/config';
import { afterAll, describe, expect, it } from 'vitest';
import { MockLinkedInAdapter } from '@/automation/linkedin/mock-adapter';

// Tempo comprimido: sem espera entre o convite e a verificação de aceite, e
// sem limite horário, para a sequência inteira caber em poucos ciclos.
process.env.CONNECTION_CHECK_INTERVAL_HOURS = '0';
process.env.ACTIONS_PER_HOUR = '10000';
process.env.LINKEDIN_ADAPTER = 'mock';
process.env.AI_MODE = 'mock';

const { closePool, getPool, query } = await import('@/lib/db/client');
const campaigns = await import('@/lib/db/repositories/campaigns');
const leads = await import('@/lib/db/repositories/leads');
const messagesRepo = await import('@/lib/db/repositories/messages');
const { loadContext } = await import('@/worker/context');
const { tick } = await import('@/worker/tick');

const available = await getPool()
  .query('select 1 from campaign_leads limit 1')
  .then(() => true)
  .catch(() => false);

const suite = available ? describe : describe.skip;

/** Todos os delays em zero: a sequência inteira cabe em poucos ciclos. */
const NO_DELAY_STEPS = [
  { step_type: 'connection_request', step_order: 1, delay_hours: 0, enabled: true },
  { step_type: 'first_message', step_order: 2, delay_hours: 0, enabled: true },
  { step_type: 'followup_1', step_order: 3, delay_hours: 0, enabled: true },
  { step_type: 'followup_2', step_order: 4, delay_hours: 0, enabled: true },
] as const;

suite('worker ponta a ponta (LinkedIn simulado)', () => {
  const created: string[] = [];

  afterAll(async () => {
    for (const id of created) {
      await query('delete from automation_logs where campaign_id = $1', [id]);
      await query('delete from campaigns where id = $1', [id]);
    }
    await query("delete from leads where linkedin_url like '%-e2e-%'");
    await closePool();
  });

  async function setupCampaign(name: string, seed: string, options: { replyRate: number }) {
    const id = await campaigns.createCampaign(
      {
        name: `[e2e] ${name}`,
        search_query: `${seed} founders saas`,
        linkedin_search_url: null,
        // Threshold 0: aqui testamos a SEQUÊNCIA, não o qualificador
        // (que tem os próprios testes).
        icp_description: 'Founders e CEOs de empresas SaaS',
        qualification_threshold: 0,
        connection_note_max_chars: 200,
        daily_connection_limit: 50,
        daily_message_limit: 50,
        discovery_target: 2,
      },
      [...NO_DELAY_STEPS],
    );
    created.push(id);
    await campaigns.setCampaignStatus(id, 'active');

    const adapter = new MockLinkedInAdapter({
      seed,
      acceptRate: 1,
      acceptAfterChecks: 1,
      replyRate: options.replyRate,
      statePath: null,
    });

    // URLs distintas por campanha para não colidir com outros testes.
    const originalSearch = adapter.searchPeople.bind(adapter);
    adapter.searchPeople = async (input) => {
      const profiles = await originalSearch(input);
      return profiles.map((profile, index) => ({
        ...profile,
        linkedinUrl: `https://www.linkedin.com/in/${seed}-e2e-${index}`,
      }));
    };

    const context = await loadContext(adapter, `e2e-${seed}`);
    return { id, adapter, context };
  }

  it('leva o lead da descoberta até o follow-up 2 quando ninguém responde', async () => {
    const { id, context } = await setupCampaign('sem resposta', 'quiet', { replyRate: 0 });

    // Ciclos suficientes para toda a sequência; o motor decide o que fazer.
    for (let round = 0; round < 12; round += 1) {
      await tick(context);
    }

    const enrollments = await leads.listEnrollments({ campaignId: id });
    expect(enrollments.length).toBeGreaterThan(0);

    for (const enrollment of enrollments) {
      expect(enrollment.qualification_score).not.toBeNull();
      expect(enrollment.linkedin_connection_requested_at).not.toBeNull();
      expect(enrollment.linkedin_connected_at).not.toBeNull();
      expect(enrollment.first_message_sent_at).not.toBeNull();
      expect(enrollment.followup_1_sent_at).not.toBeNull();
      expect(enrollment.followup_2_sent_at).not.toBeNull();
      expect(enrollment.status).toBe('completed');
      expect(enrollment.next_action).toBe('none');

      const stored = await messagesRepo.listMessages(enrollment.id);
      const kinds = stored.map((message) => message.kind).sort();
      expect(kinds).toEqual(['connection_note', 'first_message', 'followup_1', 'followup_2']);
      // Nenhuma mensagem duplicada.
      expect(new Set(kinds).size).toBe(kinds.length);
    }
  }, 60_000);

  it('para a sequência assim que o lead responde', async () => {
    const { id, context } = await setupCampaign('com resposta', 'chatty', { replyRate: 1 });

    for (let round = 0; round < 12; round += 1) {
      await tick(context);
    }

    const enrollments = await leads.listEnrollments({ campaignId: id });
    expect(enrollments.length).toBeGreaterThan(0);

    for (const enrollment of enrollments) {
      expect(enrollment.replied_at).not.toBeNull();
      expect(enrollment.reply_text).toBeTruthy();
      expect(enrollment.sequence_stopped).toBe(true);
      expect(enrollment.status).toBe('replied');
      expect(enrollment.next_action).toBe('none');
      // O ponto principal: nenhum follow-up depois da resposta.
      expect(enrollment.followup_1_sent_at).toBeNull();
      expect(enrollment.followup_2_sent_at).toBeNull();
    }
  }, 60_000);

  it('rodar de novo não gera ação nenhuma (idempotência)', async () => {
    const { id, context } = await setupCampaign('idempotência', 'idem', { replyRate: 0 });

    for (let round = 0; round < 12; round += 1) {
      await tick(context);
    }

    const before = await query<{ count: string }>(
      "select count(*)::text as count from automation_logs where campaign_id = $1 and status = 'success'",
      [id],
    );

    for (let round = 0; round < 3; round += 1) {
      await tick(context);
    }

    const after = await query<{ count: string }>(
      "select count(*)::text as count from automation_logs where campaign_id = $1 and status = 'success'",
      [id],
    );

    expect(after[0].count).toBe(before[0].count);
  }, 60_000);
});
