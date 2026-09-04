import type { PoolClient } from 'pg';
import { getPool, query, queryOne, withTransaction } from '@/lib/db/client';
import { buildUpdate } from '@/lib/db/sql';
import { toFacts, type EnrollmentRow, type EnrollmentWithLead, type LeadRow } from '@/lib/db/types';
import { getConfig } from '@/lib/config';
import { extractPublicId, firstNameOf, normalizeLinkedInUrl } from '@/lib/engine/dedupe';
import { compileSequence, type CampaignStepRow } from '@/lib/engine/sequence';
import { project } from '@/lib/engine/state-machine';
import { DEFAULT_TIMING, type InterestStatus, type LeadStatus } from '@/lib/engine/types';

export interface DiscoveredProfileInput {
  linkedinUrl: string;
  fullName: string;
  headline?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  location?: string | null;
}

export interface EnrollResult {
  leadId: string;
  enrollmentId: string;
  leadCreated: boolean;
  enrollmentCreated: boolean;
  /** A pessoa já está (ou esteve) em outra campanha. Nunca abordamos duas vezes em silêncio. */
  otherCampaignIds: string[];
}

const LEAD_SELECT = `
  cl.*,
  row_to_json(l.*) as lead,
  (select count(*) from campaign_leads other where other.lead_id = cl.lead_id)::int as campaign_count
`;

const ENROLLMENT_FROM = `
  from campaign_leads cl
  join leads l on l.id = cl.lead_id
`;

function hydrate(row: EnrollmentRow & { lead: Record<string, unknown>; campaign_count?: number }): EnrollmentWithLead {
  const lead = row.lead as unknown as LeadRow;
  return {
    ...row,
    campaign_count: row.campaign_count ?? 1,
    lead: {
      ...lead,
      // row_to_json devolve datas como string ISO.
      created_at: new Date(lead.created_at),
      updated_at: new Date(lead.updated_at),
      profile_enriched_at: lead.profile_enriched_at ? new Date(lead.profile_enriched_at) : null,
    },
  };
}

/**
 * Insere (ou reaproveita) a pessoa e a inscreve na campanha.
 * Idempotente: rodar duas vezes com o mesmo perfil não cria duplicata.
 */
export async function upsertLeadAndEnroll(
  campaignId: string,
  profile: DiscoveredProfileInput,
): Promise<EnrollResult | null> {
  const url = normalizeLinkedInUrl(profile.linkedinUrl);
  if (!url) return null;
  const publicId = extractPublicId(url);

  return withTransaction(async (client) => {
    const inserted = await client.query<LeadRow>(
      `insert into leads (linkedin_url, linkedin_public_id, full_name, first_name, headline, job_title, company, location)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (linkedin_url) do nothing
       returning *`,
      [
        url,
        publicId,
        profile.fullName,
        firstNameOf(profile.fullName),
        profile.headline ?? null,
        profile.jobTitle ?? null,
        profile.company ?? null,
        profile.location ?? null,
      ],
    );

    let leadCreated = inserted.rowCount === 1;
    let lead = inserted.rows[0];

    if (!lead) {
      const existing = await client.query<LeadRow>('select * from leads where linkedin_url = $1', [url]);
      lead = existing.rows[0];
      leadCreated = false;
      // Completa campos que estavam vazios, sem sobrescrever o que já existe.
      await client.query(
        `update leads
            set headline   = coalesce(headline, $2),
                job_title  = coalesce(job_title, $3),
                company    = coalesce(company, $4),
                location   = coalesce(location, $5),
                updated_at = now()
          where id = $1`,
        [lead.id, profile.headline ?? null, profile.jobTitle ?? null, profile.company ?? null, profile.location ?? null],
      );
    }

    const others = await client.query<{ campaign_id: string }>(
      'select campaign_id from campaign_leads where lead_id = $1 and campaign_id <> $2',
      [lead.id, campaignId],
    );

    const enrollment = await client.query<{ id: string }>(
      `insert into campaign_leads (campaign_id, lead_id, next_action, next_action_at)
       values ($1, $2, 'qualify', now())
       on conflict (campaign_id, lead_id) do nothing
       returning id`,
      [campaignId, lead.id],
    );

    let enrollmentId = enrollment.rows[0]?.id;
    const enrollmentCreated = Boolean(enrollmentId);
    if (!enrollmentId) {
      const existing = await client.query<{ id: string }>(
        'select id from campaign_leads where campaign_id = $1 and lead_id = $2',
        [campaignId, lead.id],
      );
      enrollmentId = existing.rows[0].id;
    }

    return {
      leadId: lead.id,
      enrollmentId,
      leadCreated,
      enrollmentCreated,
      otherCampaignIds: others.rows.map((row) => row.campaign_id),
    };
  });
}

export async function getEnrollment(id: string): Promise<EnrollmentWithLead | null> {
  const row = await queryOne<EnrollmentRow & { lead: Record<string, unknown>; campaign_count?: number }>(
    `select ${LEAD_SELECT} ${ENROLLMENT_FROM} where cl.id = $1`,
    [id],
  );
  return row ? hydrate(row) : null;
}

export interface EnrollmentFilters {
  campaignId?: string;
  status?: LeadStatus;
  search?: string;
  repliedOnly?: boolean;
  limit?: number;
  offset?: number;
}

export async function listEnrollments(filters: EnrollmentFilters = {}): Promise<EnrollmentWithLead[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.campaignId) {
    values.push(filters.campaignId);
    conditions.push(`cl.campaign_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`cl.status = $${values.length}`);
  }
  if (filters.repliedOnly) {
    conditions.push('cl.replied_at is not null');
  }
  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(`(l.full_name ilike $${values.length} or l.company ilike $${values.length}
      or l.headline ilike $${values.length})`);
  }

  values.push(filters.limit ?? 100);
  const limitParam = `$${values.length}`;
  values.push(filters.offset ?? 0);
  const offsetParam = `$${values.length}`;

  const rows = await query<EnrollmentRow & { lead: Record<string, unknown>; campaign_count?: number }>(
    `select ${LEAD_SELECT} ${ENROLLMENT_FROM}
      ${conditions.length ? `where ${conditions.join(' and ')}` : ''}
      order by cl.updated_at desc
      limit ${limitParam} offset ${offsetParam}`,
    values,
  );
  return rows.map(hydrate);
}

export async function countEnrollments(filters: EnrollmentFilters = {}): Promise<number> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filters.campaignId) {
    values.push(filters.campaignId);
    conditions.push(`cl.campaign_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`cl.status = $${values.length}`);
  }
  const row = await queryOne<{ count: string }>(
    `select count(*)::text as count ${ENROLLMENT_FROM} ${conditions.length ? `where ${conditions.join(' and ')}` : ''}`,
    values,
  );
  return Number(row?.count ?? 0);
}

/**
 * Reserva leads elegíveis para o worker.
 *
 * `for update ... skip locked` evita que dois processos peguem o mesmo lead.
 * O lock também tem validade (`locked_at`), então um worker que morrer no meio
 * de uma ação não trava o lead para sempre.
 */
export async function claimDueEnrollments(workerId: string, limit: number): Promise<EnrollmentWithLead[]> {
  const rows = await query<{ id: string }>(
    `with due as (
        select cl.id
          from campaign_leads cl
          join campaigns c on c.id = cl.campaign_id
         where c.status = 'active'
           and cl.next_action is not null
           and cl.next_action <> 'none'
           and cl.next_action_at <= now()
           and (cl.locked_at is null or cl.locked_at < now() - interval '10 minutes')
         order by cl.next_action_at asc
         limit $1
         for update of cl skip locked
     )
     update campaign_leads cl
        set locked_at = now(), locked_by = $2
       from due
      where cl.id = due.id
      returning cl.id`,
    [limit, workerId],
  );

  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const hydrated = await query<EnrollmentRow & { lead: Record<string, unknown>; campaign_count?: number }>(
    `select ${LEAD_SELECT} ${ENROLLMENT_FROM} where cl.id = any($1::uuid[]) order by cl.next_action_at asc`,
    [ids],
  );
  return hydrated.map(hydrate);
}

export async function releaseLock(enrollmentId: string): Promise<void> {
  await query('update campaign_leads set locked_at = null, locked_by = null where id = $1', [enrollmentId]);
}

export type EnrollmentPatch = Partial<
  Pick<
    EnrollmentRow,
    | 'connection_status'
    | 'qualification_score'
    | 'qualification_reason'
    | 'qualification_segment'
    | 'linkedin_connection_requested_at'
    | 'linkedin_connected_at'
    | 'first_message_sent_at'
    | 'followup_1_sent_at'
    | 'followup_2_sent_at'
    | 'replied_at'
    | 'reply_text'
    | 'sequence_stopped'
    | 'interest_status'
    | 'retry_count'
    | 'last_error'
    | 'last_attempt_at'
    | 'status'
  >
>;

async function reprojectWithClient(client: PoolClient, enrollmentId: string): Promise<EnrollmentRow> {
  const { rows } = await client.query<
    EnrollmentRow & { qualification_threshold: number; steps: CampaignStepRow[] | null }
  >(
    `select cl.*,
            c.qualification_threshold,
            (select json_agg(json_build_object(
                      'step_type', s.step_type,
                      'step_order', s.step_order,
                      'delay_hours', s.delay_hours,
                      'enabled', s.enabled))
               from campaign_steps s where s.campaign_id = c.id) as steps
       from campaign_leads cl
       join campaigns c on c.id = cl.campaign_id
      where cl.id = $1
      for update of cl`,
    [enrollmentId],
  );

  const row = rows[0];
  if (!row) throw new Error(`Inscrição não encontrada: ${enrollmentId}`);

  const projection = project({
    facts: toFacts(row),
    sequence: compileSequence(row.steps ?? []),
    qualificationThreshold: row.qualification_threshold,
    now: new Date(),
    timing: {
      ...DEFAULT_TIMING,
      connectionCheckIntervalHours: getConfig().CONNECTION_CHECK_INTERVAL_HOURS,
      connectionExpireDays: getConfig().CONNECTION_EXPIRE_DAYS,
    },
  });

  const { rows: updated } = await client.query<EnrollmentRow>(
    `update campaign_leads
        set status = $2, next_action = $3, next_action_at = $4, updated_at = now()
      where id = $1
      returning *`,
    [enrollmentId, projection.status, projection.nextAction, projection.nextActionAt],
  );
  return updated[0];
}

/**
 * Caminho de escrita central: grava os FATOS e reprojeta status/próxima ação.
 * Nenhum outro lugar do sistema define `status` ou `next_action` na mão.
 */
export async function applyFacts(enrollmentId: string, patch: EnrollmentPatch): Promise<EnrollmentRow> {
  return withTransaction(async (client) => {
    const statement = buildUpdate('campaign_leads', patch, { column: 'id', value: enrollmentId });
    if (statement) await client.query(statement.text, statement.values);
    return reprojectWithClient(client, enrollmentId);
  });
}

/** Recalcula status/próxima ação sem mudar fatos (usado após editar a sequência). */
export async function reproject(enrollmentId: string): Promise<EnrollmentRow> {
  return withTransaction((client) => reprojectWithClient(client, enrollmentId));
}

export async function reprojectCampaign(campaignId: string): Promise<number> {
  const rows = await query<{ id: string }>('select id from campaign_leads where campaign_id = $1', [campaignId]);
  for (const row of rows) {
    await reproject(row.id);
  }
  return rows.length;
}

export async function recordFailure(enrollmentId: string, error: string): Promise<EnrollmentRow> {
  return withTransaction(async (client) => {
    await client.query(
      `update campaign_leads
          set retry_count = retry_count + 1, last_error = $2, last_attempt_at = now(), updated_at = now()
        where id = $1`,
      [enrollmentId, error.slice(0, 2000)],
    );
    return reprojectWithClient(client, enrollmentId);
  });
}

export async function touchAttempt(enrollmentId: string): Promise<void> {
  await query('update campaign_leads set last_attempt_at = now(), updated_at = now() where id = $1', [enrollmentId]);
}

export async function clearError(enrollmentId: string): Promise<EnrollmentRow> {
  return applyFacts(enrollmentId, { retry_count: 0, last_error: null, status: 'discovered' });
}

export async function setInterest(enrollmentId: string, interest: InterestStatus | null): Promise<EnrollmentRow> {
  return applyFacts(enrollmentId, { interest_status: interest });
}

export async function stopSequence(enrollmentId: string): Promise<EnrollmentRow> {
  return applyFacts(enrollmentId, { sequence_stopped: true });
}

/**
 * Completa o perfil com o que foi lido na página, SEM sobrescrever dados que
 * já existem (o nome vindo da busca costuma ser mais confiável).
 */
export async function enrichLeadProfile(
  leadId: string,
  patch: Partial<Pick<LeadRow, 'headline' | 'job_title' | 'company' | 'location' | 'profile_summary'>>,
): Promise<void> {
  await query(
    `update leads
        set headline        = coalesce(headline, $2),
            job_title       = coalesce(job_title, $3),
            company         = coalesce(company, $4),
            location        = coalesce(location, $5),
            profile_summary = coalesce($6, profile_summary),
            profile_enriched_at = now(),
            updated_at = now()
      where id = $1`,
    [
      leadId,
      patch.headline ?? null,
      patch.job_title ?? null,
      patch.company ?? null,
      patch.location ?? null,
      patch.profile_summary ?? null,
    ],
  );
}

/** Campanhas (além desta) em que a mesma pessoa já aparece. */
export async function findDuplicateEnrollments(leadId: string, exceptCampaignId: string) {
  return query<{ campaign_id: string; campaign_name: string; status: LeadStatus }>(
    `select cl.campaign_id, c.name as campaign_name, cl.status
       from campaign_leads cl
       join campaigns c on c.id = cl.campaign_id
      where cl.lead_id = $1 and cl.campaign_id <> $2`,
    [leadId, exceptCampaignId],
  );
}

export async function poolIsReady(): Promise<boolean> {
  try {
    await getPool().query('select 1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Leads que estão em sequência e ainda não responderam — candidatos à
 * varredura periódica da caixa de entrada.
 */
export async function listLeadsForReplyCheck(limit: number, minIntervalHours: number): Promise<EnrollmentWithLead[]> {
  const rows = await query<EnrollmentRow & { lead: Record<string, unknown>; campaign_count?: number }>(
    `select ${LEAD_SELECT} ${ENROLLMENT_FROM}
       join campaigns c on c.id = cl.campaign_id
      where c.status = 'active'
        and cl.replied_at is null
        and cl.sequence_stopped = false
        and cl.first_message_sent_at is not null
        and (cl.last_reply_check_at is null or cl.last_reply_check_at < now() - ($2 || ' hours')::interval)
      order by cl.last_reply_check_at asc nulls first
      limit $1`,
    [limit, minIntervalHours],
  );
  return rows.map(hydrate);
}

export async function touchReplyCheck(enrollmentId: string): Promise<void> {
  await query('update campaign_leads set last_reply_check_at = now() where id = $1', [enrollmentId]);
}
