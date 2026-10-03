import type { CampaignRow } from '@/lib/db/types';
import { countActionsLastHour, countSuccessToday } from '@/lib/db/repositories/logs';
import { checkRateLimit } from '@/lib/engine/rate-limit';
import type { NextAction } from '@/lib/engine/types';
import type { WorkerContext } from './context';

/**
 * Portões de execução: feature flags + limites. Separados da máquina de
 * estados de propósito — um lead pausado continua sabendo qual seria a sua
 * próxima ação, ele só não a executa agora.
 */

const MESSAGE_ACTIONS = ['send_first_message', 'send_followup_1', 'send_followup_2'] as const;

export function featureFlagFor(action: NextAction, context: WorkerContext): boolean {
  switch (action) {
    case 'send_connection_request':
      return context.config.ENABLE_CONNECTIONS;
    case 'check_connection':
      return context.config.ENABLE_CONNECTIONS;
    case 'send_first_message':
      return context.config.ENABLE_MESSAGES;
    case 'send_followup_1':
    case 'send_followup_2':
      return context.config.ENABLE_FOLLOWUPS;
    default:
      return true;
  }
}

export interface GateResult {
  allowed: boolean;
  reason: string;
}

export async function checkGates(
  action: NextAction,
  campaign: CampaignRow,
  context: WorkerContext,
): Promise<GateResult> {
  if (context.settings.automation_paused) {
    return { allowed: false, reason: 'Automação pausada globalmente.' };
  }
  if (!featureFlagFor(action, context)) {
    return { allowed: false, reason: `Feature flag desligada para ${action}.` };
  }

  const [connectionsToday, messagesToday, actionsLastHour] = await Promise.all([
    countSuccessToday(['send_connection_request'], campaign.id),
    countSuccessToday([...MESSAGE_ACTIONS], campaign.id),
    countActionsLastHour(['send_connection_request', ...MESSAGE_ACTIONS, 'check_connection']),
  ]);

  return checkRateLimit(
    action,
    { connectionsToday, messagesToday, actionsLastHour },
    {
      dailyConnections: campaign.daily_connection_limit,
      dailyMessages: campaign.daily_message_limit,
      actionsPerHour: context.config.ACTIONS_PER_HOUR,
    },
  );
}
