import { query, queryOne, withTransaction } from '@/lib/db/client';
import { buildUpdate } from '@/lib/db/sql';
import type { CampaignRow, CampaignStepDbRow } from '@/lib/db/types';
import { compileSequence, DEFAULT_STEPS, type CampaignStepRow } from '@/lib/engine/sequence';
import type { CampaignStatus, Sequence } from '@/lib/engine/types';

export interface CampaignInput {
  name: string;
  search_query: string | null;
  linkedin_search_url: string | null;
  icp_description: string;
  qualification_threshold: number;
  connection_note_max_chars: number;
  daily_connection_limit: number;
  daily_message_limit: number;
  discovery_target: number;
}

export async function listCampaigns(options: { includeArchived?: boolean } = {}): Promise<CampaignRow[]> {
  const where = options.includeArchived ? '' : "where status <> 'archived'";
  return query<CampaignRow>(`select * from campaigns ${where} order by created_at desc`);
}

export async function getCampaign(id: string): Promise<CampaignRow | null> {
  return queryOne<CampaignRow>('select * from campaigns where id = $1', [id]);
}

export async function getActiveCampaigns(): Promise<CampaignRow[]> {
  return query<CampaignRow>("select * from campaigns where status = 'active' order by created_at asc");
}

export async function createCampaign(input: CampaignInput, steps: CampaignStepRow[] = DEFAULT_STEPS): Promise<string> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `insert into campaigns
         (name, search_query, linkedin_search_url, icp_description, qualification_threshold,
          connection_note_max_chars, daily_connection_limit, daily_message_limit, discovery_target)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id`,
      [
        input.name,
        input.search_query,
        input.linkedin_search_url,
        input.icp_description,
        input.qualification_threshold,
        input.connection_note_max_chars,
        input.daily_connection_limit,
        input.daily_message_limit,
        input.discovery_target,
      ],
    );
    const campaignId = rows[0].id;
    for (const step of steps) {
      await client.query(
        `insert into campaign_steps (campaign_id, step_order, step_type, delay_hours, enabled)
         values ($1, $2, $3, $4, $5)`,
        [campaignId, step.step_order, step.step_type, step.delay_hours, step.enabled],
      );
    }
    return campaignId;
  });
}

export async function updateCampaign(id: string, patch: Partial<CampaignInput>): Promise<void> {
  const statement = buildUpdate('campaigns', patch, { column: 'id', value: id });
  if (!statement) return;
  await query(statement.text, statement.values);
}

export async function setCampaignStatus(id: string, status: CampaignStatus): Promise<void> {
  await query('update campaigns set status = $1, updated_at = now() where id = $2', [status, id]);
}

/** Kill switch: pausa todas as campanhas ativas. Nunca apaga nada. */
export async function pauseAllCampaigns(): Promise<number> {
  const rows = await query<{ id: string }>(
    "update campaigns set status = 'paused', updated_at = now() where status = 'active' returning id",
  );
  return rows.length;
}

export async function getCampaignSteps(campaignId: string): Promise<CampaignStepDbRow[]> {
  return query<CampaignStepDbRow>('select * from campaign_steps where campaign_id = $1 order by step_order', [
    campaignId,
  ]);
}

export async function getSequence(campaignId: string): Promise<Sequence> {
  const steps = await getCampaignSteps(campaignId);
  return compileSequence(steps);
}

export async function replaceCampaignSteps(campaignId: string, steps: CampaignStepRow[]): Promise<void> {
  await withTransaction(async (client) => {
    await client.query('delete from campaign_steps where campaign_id = $1', [campaignId]);
    for (const step of steps) {
      await client.query(
        `insert into campaign_steps (campaign_id, step_order, step_type, delay_hours, enabled)
         values ($1, $2, $3, $4, $5)`,
        [campaignId, step.step_order, step.step_type, step.delay_hours, step.enabled],
      );
    }
  });
}

export async function setDiscoveryStatus(
  campaignId: string,
  status: CampaignRow['discovery_status'],
  error: string | null = null,
): Promise<void> {
  await query(
    `update campaigns
        set discovery_status = $1, discovery_error = $2, discovery_last_run_at = now(), updated_at = now()
      where id = $3`,
    [status, error, campaignId],
  );
}
