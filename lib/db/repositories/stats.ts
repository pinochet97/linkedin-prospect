import { queryOne } from '@/lib/db/client';
import { getConfig } from '@/lib/config';

const TODAY = `date_trunc('day', now() at time zone $1) at time zone $1`;

export interface DashboardStats {
  activeCampaigns: number;
  totalLeads: number;
  newLeadsToday: number;
  connectionsRequested: number;
  connectionsAccepted: number;
  messagesSent: number;
  replies: number;
  interested: number;
  automationErrors: number;
}

export interface TodayStats {
  connections: number;
  messages: number;
  followups: number;
  repliesDetected: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const tz = getConfig().APP_TIMEZONE;
  const row = await queryOne<Record<string, string>>(
    `select
       (select count(*) from campaigns where status = 'active')::text as active_campaigns,
       (select count(*) from campaign_leads)::text as total_leads,
       (select count(*) from campaign_leads where created_at >= ${TODAY})::text as new_leads_today,
       (select count(*) from campaign_leads where linkedin_connection_requested_at is not null)::text as connections_requested,
       (select count(*) from campaign_leads where linkedin_connected_at is not null)::text as connections_accepted,
       (select count(*) from lead_messages
          where sent_at is not null
            and kind in ('first_message', 'followup_1', 'followup_2'))::text as messages_sent,
       (select count(*) from campaign_leads where replied_at is not null)::text as replies,
       (select count(*) from campaign_leads where interest_status = 'interested')::text as interested,
       (select count(*) from campaign_leads where status = 'error')::text as automation_errors`,
    [tz],
  );

  return {
    activeCampaigns: Number(row?.active_campaigns ?? 0),
    totalLeads: Number(row?.total_leads ?? 0),
    newLeadsToday: Number(row?.new_leads_today ?? 0),
    connectionsRequested: Number(row?.connections_requested ?? 0),
    connectionsAccepted: Number(row?.connections_accepted ?? 0),
    messagesSent: Number(row?.messages_sent ?? 0),
    replies: Number(row?.replies ?? 0),
    interested: Number(row?.interested ?? 0),
    automationErrors: Number(row?.automation_errors ?? 0),
  };
}

export async function getTodayStats(): Promise<TodayStats> {
  const tz = getConfig().APP_TIMEZONE;
  const row = await queryOne<Record<string, string>>(
    `select
       count(*) filter (where action = 'send_connection_request')::text as connections,
       count(*) filter (where action = 'send_first_message')::text as messages,
       count(*) filter (where action in ('send_followup_1', 'send_followup_2'))::text as followups,
       count(*) filter (where action = 'reply_detected')::text as replies_detected
     from automation_logs
     where status = 'success' and created_at >= ${TODAY}`,
    [tz],
  );

  return {
    connections: Number(row?.connections ?? 0),
    messages: Number(row?.messages ?? 0),
    followups: Number(row?.followups ?? 0),
    repliesDetected: Number(row?.replies_detected ?? 0),
  };
}

export interface CampaignStats {
  found: number;
  qualified: number;
  connectionRequested: number;
  connected: number;
  messaged: number;
  replied: number;
}

export async function getCampaignStats(campaignId: string): Promise<CampaignStats> {
  const row = await queryOne<Record<string, string>>(
    `select
       count(*)::text as found,
       count(*) filter (where qualification_score is not null and status <> 'rejected')::text as qualified,
       count(*) filter (where linkedin_connection_requested_at is not null)::text as connection_requested,
       count(*) filter (where linkedin_connected_at is not null)::text as connected,
       count(*) filter (where first_message_sent_at is not null)::text as messaged,
       count(*) filter (where replied_at is not null)::text as replied
     from campaign_leads
     where campaign_id = $1`,
    [campaignId],
  );

  return {
    found: Number(row?.found ?? 0),
    qualified: Number(row?.qualified ?? 0),
    connectionRequested: Number(row?.connection_requested ?? 0),
    connected: Number(row?.connected ?? 0),
    messaged: Number(row?.messaged ?? 0),
    replied: Number(row?.replied ?? 0),
  };
}

/** Uso do dia para os limites de uma campanha (mostrado como "17 / 20"). */
export async function getCampaignUsageToday(campaignId: string): Promise<{ connections: number; messages: number }> {
  const tz = getConfig().APP_TIMEZONE;
  const row = await queryOne<Record<string, string>>(
    `select
       count(*) filter (where action = 'send_connection_request')::text as connections,
       count(*) filter (where action in ('send_first_message', 'send_followup_1', 'send_followup_2'))::text as messages
     from automation_logs
     where status = 'success' and campaign_id = $2 and created_at >= ${TODAY}`,
    [tz, campaignId],
  );
  return { connections: Number(row?.connections ?? 0), messages: Number(row?.messages ?? 0) };
}
