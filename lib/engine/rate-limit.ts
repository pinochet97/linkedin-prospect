import type { NextAction } from './types';

/**
 * Limites internos. O sistema para quando bate o limite configurado — nunca
 * existe comportamento agressivo embutido no código.
 */

export interface UsageCounts {
  /** Convites enviados com sucesso hoje, nesta campanha. */
  connectionsToday: number;
  /** Mensagens (primeira + follow-ups) enviadas com sucesso hoje, nesta campanha. */
  messagesToday: number;
  /** Ações no LinkedIn na última hora, considerando todas as campanhas. */
  actionsLastHour: number;
}

export interface Limits {
  dailyConnections: number;
  dailyMessages: number;
  actionsPerHour: number;
}

export interface RateLimitResult {
  allowed: boolean;
  reason: string;
}

const MESSAGE_ACTIONS: NextAction[] = ['send_first_message', 'send_followup_1', 'send_followup_2'];

/** `check_connection` é leitura: não gasta cota diária, mas conta no ritmo horário. */
export function checkRateLimit(action: NextAction, counts: UsageCounts, limits: Limits): RateLimitResult {
  if (action === 'qualify' || action === 'none') {
    return { allowed: true, reason: 'Ação não toca o LinkedIn.' };
  }

  if (counts.actionsLastHour >= limits.actionsPerHour) {
    return {
      allowed: false,
      reason: `Limite de ações por hora atingido (${counts.actionsLastHour}/${limits.actionsPerHour}).`,
    };
  }

  if (action === 'send_connection_request' && counts.connectionsToday >= limits.dailyConnections) {
    return {
      allowed: false,
      reason: `Limite diário de convites atingido (${counts.connectionsToday}/${limits.dailyConnections}).`,
    };
  }

  if (MESSAGE_ACTIONS.includes(action) && counts.messagesToday >= limits.dailyMessages) {
    return {
      allowed: false,
      reason: `Limite diário de mensagens atingido (${counts.messagesToday}/${limits.dailyMessages}).`,
    };
  }

  return { allowed: true, reason: 'Dentro dos limites.' };
}
