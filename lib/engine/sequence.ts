import type { Sequence, StepType } from './types';

export interface CampaignStepRow {
  step_type: StepType;
  step_order: number;
  delay_hours: number;
  enabled: boolean;
}

/**
 * Sequência padrão (a do enunciado):
 *   convite -> espera 1 dia -> mensagem -> espera 3 dias -> follow-up 1
 *   -> espera 5 dias -> follow-up 2
 */
export const DEFAULT_STEPS: CampaignStepRow[] = [
  { step_type: 'connection_request', step_order: 1, delay_hours: 0, enabled: true },
  { step_type: 'first_message', step_order: 2, delay_hours: 24, enabled: true },
  { step_type: 'followup_1', step_order: 3, delay_hours: 72, enabled: true },
  { step_type: 'followup_2', step_order: 4, delay_hours: 120, enabled: true },
];

export const DEFAULT_SEQUENCE: Sequence = compileSequence(DEFAULT_STEPS);

/**
 * Converte as linhas de `campaign_steps` na estrutura tipada que o motor usa.
 * O convite é sempre habilitado: sem ele não existe caminho para mensagem.
 */
export function compileSequence(rows: CampaignStepRow[]): Sequence {
  const byType = new Map(rows.map((row) => [row.step_type, row]));
  const read = (type: StepType, fallbackDelay: number) => {
    const row = byType.get(type);
    return {
      enabled: row ? row.enabled : false,
      delayHours: row ? Math.max(0, row.delay_hours) : fallbackDelay,
    };
  };

  return {
    connectionRequest: { ...read('connection_request', 0), enabled: true },
    firstMessage: read('first_message', 24),
    followup1: read('followup_1', 72),
    followup2: read('followup_2', 120),
  };
}

export const STEP_LABELS: Record<StepType, string> = {
  connection_request: 'Convite de conexão',
  first_message: 'Primeira mensagem',
  followup_1: 'Follow-up 1',
  followup_2: 'Follow-up 2',
};
