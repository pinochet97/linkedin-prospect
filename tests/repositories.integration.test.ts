/**
 * Testes de integração dos repositórios. Rodam apenas quando há um Postgres
 * acessível em DATABASE_URL (ou TEST_DATABASE_URL) — caso contrário são
 * ignorados, para não quebrar quem só quer rodar a lógica pura.
 *
 *   createdb linkedin_prospect && npm run db:migrate && npm test
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { closePool, getPool, query } = await import('@/lib/db/client');
const campaigns = await import('@/lib/db/repositories/campaigns');
const leads = await import('@/lib/db/repositories/leads');
const messages = await import('@/lib/db/repositories/messages');
const logs = await import('@/lib/db/repositories/logs');

const available = await getPool()
  .query('select 1 from campaign_leads limit 1')
  .then(() => true)
  .catch(() => false);

const suite = available ? describe : describe.skip;

suite('repositórios (integração)', () => {
  const createdCampaigns: string[] = [];
  const profile = {
    linkedinUrl: 'https://www.linkedin.com/in/teste-integracao',
    fullName: 'Teste Integração',
    headline: 'Founder na Empresa Teste',
    jobTitle: 'Founder',
    company: 'Empresa Teste',
    location: 'São Paulo, SP',
  };

  beforeAll(async () => {
    await query("delete from leads where linkedin_url like 'https://www.linkedin.com/in/teste-%'");
    await query("delete from campaigns where name like '[test]%'");
  });

  afterAll(async () => {
    for (const id of createdCampaigns) {
      await query('delete from automation_logs where campaign_id = $1', [id]);
      await query('delete from campaigns where id = $1', [id]);
    }
    await query("delete from leads where linkedin_url like 'https://www.linkedin.com/in/teste-%'");
    await closePool();
  });

  async function newCampaign(name: string) {
    const id = await campaigns.createCampaign({
      name,
      search_query: 'Founder SaaS Brasil',
      linkedin_search_url: null,
      icp_description: 'Founders de SaaS B2B brasileiro',
      qualification_threshold: 60,
      connection_note_max_chars: 200,
      daily_connection_limit: 20,
      daily_message_limit: 30,
      discovery_target: 10,
    });
    createdCampaigns.push(id);
    return id;
  }

  it('cria campanha com a sequência padrão', async () => {
    const id = await newCampaign('[test] sequência');
    const steps = await campaigns.getCampaignSteps(id);
    expect(steps.map((step) => step.step_type)).toEqual([
      'connection_request',
      'first_message',
      'followup_1',
      'followup_2',
    ]);
    const sequence = await campaigns.getSequence(id);
    expect(sequence.followup2.delayHours).toBe(120);
  });

  it('não duplica a mesma pessoa nem a mesma inscrição', async () => {
    const id = await newCampaign('[test] dedupe');

    const first = await leads.upsertLeadAndEnroll(id, profile);
    expect(first?.leadCreated).toBe(true);
    expect(first?.enrollmentCreated).toBe(true);

    // Mesma pessoa, URL escrita de outro jeito.
    const second = await leads.upsertLeadAndEnroll(id, {
      ...profile,
      linkedinUrl: 'https://br.linkedin.com/in/Teste-Integracao/?trk=abc',
    });
    expect(second?.leadCreated).toBe(false);
    expect(second?.enrollmentCreated).toBe(false);
    expect(second?.leadId).toBe(first?.leadId);
    expect(second?.enrollmentId).toBe(first?.enrollmentId);

    const rows = await query<{ count: string }>(
      "select count(*)::text as count from leads where linkedin_url = 'https://www.linkedin.com/in/teste-integracao'",
    );
    expect(rows[0].count).toBe('1');
  });

  it('avisa quando a pessoa já está em outra campanha', async () => {
    const first = await newCampaign('[test] campanha A');
    const second = await newCampaign('[test] campanha B');

    await leads.upsertLeadAndEnroll(first, profile);
    const result = await leads.upsertLeadAndEnroll(second, profile);

    expect(result?.otherCampaignIds).toContain(first);
    const duplicates = await leads.findDuplicateEnrollments(result!.leadId, second);
    expect(duplicates.map((row) => row.campaign_id)).toContain(first);
  });

  it('deriva status e próxima ação a partir dos fatos', async () => {
    const id = await newCampaign('[test] projeção');
    const enrolled = await leads.upsertLeadAndEnroll(id, { ...profile, linkedinUrl: 'linkedin.com/in/teste-projecao' });
    const enrollmentId = enrolled!.enrollmentId;

    const discovered = await leads.getEnrollment(enrollmentId);
    expect(discovered?.status).toBe('discovered');
    expect(discovered?.next_action).toBe('qualify');

    const qualified = await leads.applyFacts(enrollmentId, { qualification_score: 85, qualification_reason: 'ok' });
    expect(qualified.status).toBe('ready_for_connection');
    expect(qualified.next_action).toBe('send_connection_request');

    const requested = await leads.applyFacts(enrollmentId, {
      linkedin_connection_requested_at: new Date(),
      connection_status: 'pending',
    });
    expect(requested.status).toBe('connection_requested');
    expect(requested.next_action).toBe('check_connection');

    const connected = await leads.applyFacts(enrollmentId, {
      linkedin_connected_at: new Date(),
      connection_status: 'connected',
    });
    expect(connected.status).toBe('connected');
    expect(connected.next_action).toBe('send_first_message');

    const replied = await leads.applyFacts(enrollmentId, { replied_at: new Date(), reply_text: 'oi' });
    expect(replied.status).toBe('replied');
    expect(replied.next_action).toBe('none');
    expect(replied.next_action_at).toBeNull();
  });

  it('rejeita lead abaixo do score e não agenda nada', async () => {
    const id = await newCampaign('[test] rejeição');
    const enrolled = await leads.upsertLeadAndEnroll(id, { ...profile, linkedinUrl: 'linkedin.com/in/teste-rejeicao' });
    const result = await leads.applyFacts(enrolled!.enrollmentId, { qualification_score: 20 });
    expect(result.status).toBe('rejected');
    expect(result.next_action).toBe('none');
  });

  it('só uma mensagem de saída por tipo (índice único)', async () => {
    const id = await newCampaign('[test] mensagens');
    const enrolled = await leads.upsertLeadAndEnroll(id, { ...profile, linkedinUrl: 'linkedin.com/in/teste-mensagens' });
    const enrollmentId = enrolled!.enrollmentId;

    await messages.saveGeneratedMessage(enrollmentId, 'first_message', 'Primeira versão');
    await messages.saveGeneratedMessage(enrollmentId, 'first_message', 'Segunda versão');

    const all = await messages.listMessages(enrollmentId);
    expect(all.filter((message) => message.kind === 'first_message')).toHaveLength(1);

    await messages.markMessageSent(enrollmentId, 'first_message', { dryRun: true });
    // Depois de enviada, o corpo não é mais sobrescrito.
    await messages.saveGeneratedMessage(enrollmentId, 'first_message', 'Terceira versão');
    const stored = await messages.getMessage(enrollmentId, 'first_message');
    expect(stored?.body).toBe('Segunda versão');
    expect(stored?.sent_at).not.toBeNull();
  });

  it('reserva leads elegíveis apenas de campanhas ativas', async () => {
    const id = await newCampaign('[test] claim');
    const enrolled = await leads.upsertLeadAndEnroll(id, { ...profile, linkedinUrl: 'linkedin.com/in/teste-claim' });

    const beforeActivation = await leads.claimDueEnrollments('teste', 50);
    expect(beforeActivation.find((row) => row.id === enrolled!.enrollmentId)).toBeUndefined();

    await campaigns.setCampaignStatus(id, 'active');
    const claimed = await leads.claimDueEnrollments('teste', 50);
    expect(claimed.find((row) => row.id === enrolled!.enrollmentId)).toBeDefined();

    // Já reservado: uma segunda chamada não devolve o mesmo lead.
    const again = await leads.claimDueEnrollments('teste-2', 50);
    expect(again.find((row) => row.id === enrolled!.enrollmentId)).toBeUndefined();

    await leads.releaseLock(enrolled!.enrollmentId);
    await campaigns.setCampaignStatus(id, 'paused');
  });

  it('conta ações do dia para o rate limit', async () => {
    const id = await newCampaign('[test] limites');
    await logs.log({ action: 'send_connection_request', status: 'success', campaignId: id });
    await logs.log({ action: 'send_connection_request', status: 'failed', campaignId: id });
    const count = await logs.countSuccessToday(['send_connection_request'], id);
    expect(count).toBe(1);
  });
});
