import { query } from '@/lib/db/client';
import { getConfig } from '@/lib/config';
import type { AutomationLogRow } from '@/lib/db/types';

export interface LogInput {
  action: string;
  status: AutomationLogRow['status'];
  message?: string | null;
  campaignId?: string | null;
  leadId?: string | null;
  enrollmentId?: string | null;
  metadata?: Record<string, unknown>;
  screenshotPath?: string | null;
}

export async function log(input: LogInput): Promise<void> {
  await query(
    `insert into automation_logs
       (campaign_id, lead_id, campaign_lead_id, action, status, message, metadata, screenshot_path)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      input.campaignId ?? null,
      input.leadId ?? null,
      input.enrollmentId ?? null,
      input.action,
      input.status,
      input.message ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.screenshotPath ?? null,
    ],
  );
}

export interface LogFilters {
  campaignId?: string;
  action?: string;
  status?: AutomationLogRow['status'];
  leadId?: string;
  limit?: number;
}

export interface AutomationLogWithNames extends AutomationLogRow {
  lead_name: string | null;
  campaign_name: string | null;
}

export async function listLogs(filters: LogFilters = {}): Promise<AutomationLogWithNames[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.campaignId) {
    values.push(filters.campaignId);
    conditions.push(`al.campaign_id = $${values.length}`);
  }
  if (filters.action) {
    values.push(filters.action);
    conditions.push(`al.action = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`al.status = $${values.length}`);
  }
  if (filters.leadId) {
    values.push(filters.leadId);
    conditions.push(`al.lead_id = $${values.length}`);
  }

  values.push(filters.limit ?? 100);

  return query<AutomationLogWithNames>(
    `select al.*, l.full_name as lead_name, c.name as campaign_name
       from automation_logs al
       left join leads l on l.id = al.lead_id
       left join campaigns c on c.id = al.campaign_id
      ${conditions.length ? `where ${conditions.join(' and ')}` : ''}
      order by al.created_at desc
      limit $${values.length}`,
    values,
  );
}

const TODAY = `date_trunc('day', now() at time zone $1) at time zone $1`;

/** Quantas ações bem-sucedidas aconteceram hoje (fuso configurável). */
export async function countSuccessToday(actions: string[], campaignId?: string): Promise<number> {
  const values: unknown[] = [getConfig().APP_TIMEZONE, actions];
  let filter = '';
  if (campaignId) {
    values.push(campaignId);
    filter = `and campaign_id = $${values.length}`;
  }
  const rows = await query<{ count: string }>(
    `select count(*)::text as count
       from automation_logs
      where status = 'success'
        and action = any($2::text[])
        and created_at >= ${TODAY}
        ${filter}`,
    values,
  );
  return Number(rows[0]?.count ?? 0);
}

export async function countActionsLastHour(actions: string[]): Promise<number> {
  const rows = await query<{ count: string }>(
    `select count(*)::text as count
       from automation_logs
      where status = 'success'
        and action = any($1::text[])
        and created_at >= now() - interval '1 hour'`,
    [actions],
  );
  return Number(rows[0]?.count ?? 0);
}
