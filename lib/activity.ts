import type { AutomationLogWithNames } from '@/lib/db/repositories/logs';

/** Nomes das ações registradas em `automation_logs`. */
export const ACTIONS = {
  discovery: 'discovery',
  leadDiscovered: 'lead_discovered',
  qualify: 'qualify',
  connect: 'send_connection_request',
  checkConnection: 'check_connection',
  connectionAccepted: 'connection_accepted',
  firstMessage: 'send_first_message',
  followup1: 'send_followup_1',
  followup2: 'send_followup_2',
  replyDetected: 'reply_detected',
  killSwitch: 'kill_switch',
  worker: 'worker',
  session: 'linkedin_session',
} as const;

export const ACTION_LABELS: Record<string, string> = {
  [ACTIONS.discovery]: 'Descoberta de leads',
  [ACTIONS.leadDiscovered]: 'Lead encontrado',
  [ACTIONS.qualify]: 'Qualificação',
  [ACTIONS.connect]: 'Convite de conexão',
  [ACTIONS.checkConnection]: 'Verificação de conexão',
  [ACTIONS.connectionAccepted]: 'Conexão aceita',
  [ACTIONS.firstMessage]: 'Primeira mensagem',
  [ACTIONS.followup1]: 'Follow-up 1',
  [ACTIONS.followup2]: 'Follow-up 2',
  [ACTIONS.replyDetected]: 'Resposta detectada',
  [ACTIONS.killSwitch]: 'Kill switch',
  [ACTIONS.worker]: 'Worker',
  [ACTIONS.session]: 'Sessão do LinkedIn',
};

/** Linha curta do feed: "conexão enviada para João Silva". */
export function describeLog(entry: AutomationLogWithNames): string {
  const who = entry.lead_name ?? 'lead';
  if (entry.status === 'failed') {
    return `falha em ${ACTION_LABELS[entry.action] ?? entry.action}${entry.lead_name ? ` (${who})` : ''}`;
  }

  switch (entry.action) {
    case ACTIONS.leadDiscovered:
      return `lead encontrado: ${who}`;
    case ACTIONS.qualify:
      return `${who} qualificado`;
    case ACTIONS.connect:
      return `conexão enviada para ${who}`;
    case ACTIONS.connectionAccepted:
      return `${who} aceitou conexão`;
    case ACTIONS.firstMessage:
      return `mensagem enviada para ${who}`;
    case ACTIONS.followup1:
      return `follow-up 1 enviado para ${who}`;
    case ACTIONS.followup2:
      return `follow-up 2 enviado para ${who}`;
    case ACTIONS.replyDetected:
      return `resposta detectada de ${who}`;
    default:
      return entry.message ?? (ACTION_LABELS[entry.action] ?? entry.action);
  }
}
