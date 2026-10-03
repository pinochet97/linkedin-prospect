import { describe, expect, it } from 'vitest';
import { compileSequence, DEFAULT_STEPS } from '@/lib/engine/sequence';

describe('compileSequence', () => {
  it('usa a sequência padrão do enunciado', () => {
    const sequence = compileSequence(DEFAULT_STEPS);
    expect(sequence.firstMessage).toEqual({ enabled: true, delayHours: 24 });
    expect(sequence.followup1).toEqual({ enabled: true, delayHours: 72 });
    expect(sequence.followup2).toEqual({ enabled: true, delayHours: 120 });
  });

  it('o convite é sempre habilitado (sem ele não há caminho para mensagem)', () => {
    const sequence = compileSequence([{ step_type: 'connection_request', step_order: 1, delay_hours: 0, enabled: false }]);
    expect(sequence.connectionRequest.enabled).toBe(true);
  });

  it('passos ausentes ficam desabilitados', () => {
    const sequence = compileSequence([{ step_type: 'connection_request', step_order: 1, delay_hours: 0, enabled: true }]);
    expect(sequence.firstMessage.enabled).toBe(false);
    expect(sequence.followup1.enabled).toBe(false);
  });

  it('delays negativos são normalizados para zero', () => {
    const sequence = compileSequence([
      { step_type: 'first_message', step_order: 2, delay_hours: -10, enabled: true },
    ]);
    expect(sequence.firstMessage.delayHours).toBe(0);
  });
});
