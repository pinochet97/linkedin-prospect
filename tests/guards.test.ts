import { describe, expect, it } from 'vitest';
import {
  canRequestConnection,
  canSendFirstMessage,
  canSendFollowup1,
  canSendFollowup2,
  canSendMessage,
} from '@/lib/engine/guards';
import { facts, hoursFromNow } from './helpers';

describe('idempotência — convite', () => {
  it('permite convite para lead novo e qualificado', () => {
    expect(canRequestConnection(facts({ qualificationScore: 90 })).ok).toBe(true);
  });

  it('não envia um segundo convite', () => {
    const result = canRequestConnection(facts({ connectionRequestedAt: hoursFromNow(-5) }));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/já enviado/i);
  });

  it('não envia convite para quem já é conexão', () => {
    expect(canRequestConnection(facts({ connectionStatus: 'connected' })).ok).toBe(false);
  });

  it('não envia convite quando já existe convite pendente detectado no LinkedIn', () => {
    expect(canRequestConnection(facts({ connectionStatus: 'pending' })).ok).toBe(false);
  });
});

describe('idempotência — mensagens', () => {
  it('não envia a primeira mensagem duas vezes', () => {
    const state = facts({ connectedAt: hoursFromNow(-48), firstMessageSentAt: hoursFromNow(-24) });
    const result = canSendFirstMessage(state);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/já enviada/i);
  });

  it('não envia mensagem para quem não é conexão', () => {
    expect(canSendFirstMessage(facts({})).ok).toBe(false);
  });

  it('não envia follow-up 1 antes da primeira mensagem', () => {
    expect(canSendFollowup1(facts({ connectedAt: hoursFromNow(-10) })).ok).toBe(false);
  });

  it('não envia follow-up 1 duas vezes', () => {
    const state = facts({ firstMessageSentAt: hoursFromNow(-100), followup1SentAt: hoursFromNow(-10) });
    expect(canSendFollowup1(state).ok).toBe(false);
  });

  it('não envia follow-up 2 duas vezes', () => {
    const state = facts({
      firstMessageSentAt: hoursFromNow(-200),
      followup1SentAt: hoursFromNow(-100),
      followup2SentAt: hoursFromNow(-10),
    });
    expect(canSendFollowup2(state).ok).toBe(false);
  });

  it('qualquer mensagem é bloqueada depois da resposta', () => {
    const replied = facts({
      connectedAt: hoursFromNow(-200),
      firstMessageSentAt: hoursFromNow(-100),
      repliedAt: hoursFromNow(-1),
    });
    expect(canSendMessage(replied, 'followup_1').ok).toBe(false);
    expect(canSendMessage(replied, 'followup_2').ok).toBe(false);
    expect(canRequestConnection(replied).ok).toBe(false);
  });
});
