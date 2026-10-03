/**
 * Tipos do motor de prospecção.
 *
 * Princípio: o `status` de um lead é uma PROJEÇÃO dos fatos persistidos
 * (timestamps, score, flags) — nunca uma variável mutada por conta própria.
 * Isso elimina estados inconsistentes depois de um restart ou de uma falha
 * no meio de uma ação.
 */

export const LEAD_STATUSES = [
  'discovered',
  'qualified',
  'rejected',
  'ready_for_connection',
  'connection_requested',
  'waiting_connection',
  'connected',
  'ready_for_first_message',
  'first_message_sent',
  'waiting_followup_1',
  'followup_1_sent',
  'waiting_followup_2',
  'followup_2_sent',
  'replied',
  'interested',
  'not_interested',
  'completed',
  'error',
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const CONNECTION_STATUSES = ['unknown', 'not_connected', 'pending', 'connected'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const NEXT_ACTIONS = [
  'qualify',
  'send_connection_request',
  'check_connection',
  'send_first_message',
  'send_followup_1',
  'send_followup_2',
  'none',
] as const;

export type NextAction = (typeof NEXT_ACTIONS)[number];

/** Ações que efetivamente tocam o LinkedIn (contam para rate limit). */
export const BROWSER_ACTIONS = [
  'send_connection_request',
  'check_connection',
  'send_first_message',
  'send_followup_1',
  'send_followup_2',
] as const;

export const INTEREST_STATUSES = ['interested', 'not_interested', 'meeting_scheduled', 'later', 'ignore'] as const;
export type InterestStatus = (typeof INTEREST_STATUSES)[number];

export const CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'archived'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const STEP_TYPES = ['connection_request', 'first_message', 'followup_1', 'followup_2'] as const;
export type StepType = (typeof STEP_TYPES)[number];

export const MESSAGE_KINDS = [
  'connection_note',
  'first_message',
  'followup_1',
  'followup_2',
  'inbound_reply',
] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

/**
 * Os fatos de uma inscrição (campaign_leads) que o motor precisa conhecer.
 * Propositalmente NÃO inclui `status` nem `next_action`: ambos são derivados.
 */
export interface EnrollmentFacts {
  qualificationScore: number | null;
  connectionStatus: ConnectionStatus;
  connectionRequestedAt: Date | null;
  connectedAt: Date | null;
  firstMessageSentAt: Date | null;
  followup1SentAt: Date | null;
  followup2SentAt: Date | null;
  repliedAt: Date | null;
  sequenceStopped: boolean;
  interestStatus: InterestStatus | null;
  retryCount: number;
  lastAttemptAt: Date | null;
  manualError: boolean;
}

export interface SequenceStep {
  enabled: boolean;
  /** Horas de espera ANTES de executar este passo. */
  delayHours: number;
}

export interface Sequence {
  connectionRequest: SequenceStep;
  firstMessage: SequenceStep;
  followup1: SequenceStep;
  followup2: SequenceStep;
}

export interface TimingOptions {
  /** De quanto em quanto tempo reconferir se a conexão foi aceita. */
  connectionCheckIntervalHours: number;
  /** Depois de quantos dias desistir de um convite não aceito. */
  connectionExpireDays: number;
  /** Após quantas falhas o lead vai para revisão manual. */
  maxRetries: number;
}

export const DEFAULT_TIMING: TimingOptions = {
  connectionCheckIntervalHours: 6,
  connectionExpireDays: 30,
  maxRetries: 3,
};

export interface Projection {
  status: LeadStatus;
  nextAction: NextAction;
  /** Quando a ação fica elegível. `null` quando não há ação. */
  nextActionAt: Date | null;
  /** Explicação legível — vai para os logs e para a UI. */
  reason: string;
}
