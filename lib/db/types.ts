import type {
  CampaignStatus,
  ConnectionStatus,
  EnrollmentFacts,
  InterestStatus,
  LeadStatus,
  MessageKind,
  NextAction,
  StepType,
} from '@/lib/engine/types';

export interface SettingsRow {
  id: number;
  my_name: string;
  my_company: string;
  my_role: string;
  what_i_do: string;
  target_audience: string;
  tone_of_voice: string;
  things_to_avoid: string;
  automation_paused: boolean;
  paused_reason: string | null;
  worker_last_tick_at: Date | null;
  updated_at: Date;
}

export interface CampaignRow {
  id: string;
  name: string;
  search_query: string | null;
  linkedin_search_url: string | null;
  icp_description: string;
  qualification_threshold: number;
  connection_note_max_chars: number;
  daily_connection_limit: number;
  daily_message_limit: number;
  discovery_target: number;
  status: CampaignStatus;
  discovery_status: 'pending' | 'running' | 'done' | 'failed';
  discovery_last_run_at: Date | null;
  discovery_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CampaignStepDbRow {
  id: string;
  campaign_id: string;
  step_order: number;
  step_type: StepType;
  delay_hours: number;
  enabled: boolean;
}

export interface LeadRow {
  id: string;
  linkedin_url: string;
  linkedin_public_id: string | null;
  full_name: string;
  first_name: string | null;
  headline: string | null;
  job_title: string | null;
  company: string | null;
  location: string | null;
  profile_summary: string | null;
  profile_enriched_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface EnrollmentRow {
  id: string;
  campaign_id: string;
  lead_id: string;
  status: LeadStatus;
  connection_status: ConnectionStatus;
  qualification_score: number | null;
  qualification_reason: string | null;
  qualification_segment: string | null;
  linkedin_connection_requested_at: Date | null;
  linkedin_connected_at: Date | null;
  first_message_sent_at: Date | null;
  followup_1_sent_at: Date | null;
  followup_2_sent_at: Date | null;
  replied_at: Date | null;
  reply_text: string | null;
  sequence_stopped: boolean;
  interest_status: InterestStatus | null;
  next_action: NextAction | null;
  next_action_at: Date | null;
  retry_count: number;
  last_error: string | null;
  last_attempt_at: Date | null;
  last_reply_check_at: Date | null;
  locked_at: Date | null;
  locked_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface EnrollmentWithLead extends EnrollmentRow {
  lead: LeadRow;
  /** Em quantas campanhas esta pessoa está. > 1 vira aviso de duplicidade. */
  campaign_count: number;
}

export interface LeadMessageRow {
  id: string;
  campaign_lead_id: string;
  kind: MessageKind;
  body: string;
  generated_at: Date | null;
  sent_at: Date | null;
  dry_run: boolean;
  created_at: Date;
}

export interface AutomationLogRow {
  id: string;
  campaign_id: string | null;
  lead_id: string | null;
  campaign_lead_id: string | null;
  action: string;
  status: 'success' | 'failed' | 'skipped' | 'info';
  message: string | null;
  metadata: Record<string, unknown>;
  screenshot_path: string | null;
  created_at: Date;
}

/** Converte a linha do banco nos fatos que o motor entende. */
export function toFacts(row: EnrollmentRow): EnrollmentFacts {
  return {
    qualificationScore: row.qualification_score,
    connectionStatus: row.connection_status,
    connectionRequestedAt: row.linkedin_connection_requested_at,
    connectedAt: row.linkedin_connected_at,
    firstMessageSentAt: row.first_message_sent_at,
    followup1SentAt: row.followup_1_sent_at,
    followup2SentAt: row.followup_2_sent_at,
    repliedAt: row.replied_at,
    sequenceStopped: row.sequence_stopped,
    interestStatus: row.interest_status,
    retryCount: row.retry_count,
    lastAttemptAt: row.last_attempt_at,
    manualError: row.status === 'error',
  };
}
