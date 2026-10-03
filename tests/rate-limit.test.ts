import { describe, expect, it } from 'vitest';
import { checkRateLimit, type Limits, type UsageCounts } from '@/lib/engine/rate-limit';

const limits: Limits = { dailyConnections: 20, dailyMessages: 30, actionsPerHour: 10 };

const counts = (overrides: Partial<UsageCounts> = {}): UsageCounts => ({
  connectionsToday: 0,
  messagesToday: 0,
  actionsLastHour: 0,
  ...overrides,
});

describe('rate limit', () => {
  it('permite quando está dentro dos limites', () => {
    expect(checkRateLimit('send_connection_request', counts({ connectionsToday: 17 }), limits).allowed).toBe(true);
  });

  it('bloqueia convite ao atingir o limite diário', () => {
    const result = checkRateLimit('send_connection_request', counts({ connectionsToday: 20 }), limits);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/20\/20/);
  });

  it('limite de convites não bloqueia mensagens', () => {
    expect(checkRateLimit('send_first_message', counts({ connectionsToday: 20 }), limits).allowed).toBe(true);
  });

  it('bloqueia follow-ups ao atingir o limite diário de mensagens', () => {
    expect(checkRateLimit('send_followup_1', counts({ messagesToday: 30 }), limits).allowed).toBe(false);
    expect(checkRateLimit('send_followup_2', counts({ messagesToday: 30 }), limits).allowed).toBe(false);
  });

  it('bloqueia tudo que toca o LinkedIn ao estourar o ritmo horário', () => {
    const hot = counts({ actionsLastHour: 10 });
    expect(checkRateLimit('send_connection_request', hot, limits).allowed).toBe(false);
    expect(checkRateLimit('check_connection', hot, limits).allowed).toBe(false);
  });

  it('qualificação não é limitada (não toca o LinkedIn)', () => {
    expect(checkRateLimit('qualify', counts({ actionsLastHour: 999 }), limits).allowed).toBe(true);
  });

  it('verificar conexão não consome cota diária', () => {
    const full = counts({ connectionsToday: 20, messagesToday: 30 });
    expect(checkRateLimit('check_connection', full, limits).allowed).toBe(true);
  });
});
