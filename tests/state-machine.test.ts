import { describe, expect, it } from 'vitest';
import { project } from '@/lib/engine/state-machine';
import { compileSequence, DEFAULT_SEQUENCE, DEFAULT_STEPS } from '@/lib/engine/sequence';
import { DEFAULT_TIMING } from '@/lib/engine/types';
import { facts, hoursFromNow, NOW } from './helpers';

const base = { sequence: DEFAULT_SEQUENCE, qualificationThreshold: 60, now: NOW };

describe('project() — qualificação', () => {
  it('lead recém-descoberto precisa ser qualificado', () => {
    const result = project({ ...base, facts: facts() });
    expect(result.status).toBe('discovered');
    expect(result.nextAction).toBe('qualify');
    expect(result.nextActionAt).toEqual(NOW);
  });

  it('score abaixo do threshold rejeita e encerra', () => {
    const result = project({ ...base, facts: facts({ qualificationScore: 40 }) });
    expect(result.status).toBe('rejected');
    expect(result.nextAction).toBe('none');
    expect(result.nextActionAt).toBeNull();
  });

  it('score no threshold é aceito (>=)', () => {
    const result = project({ ...base, facts: facts({ qualificationScore: 60 }) });
    expect(result.status).toBe('ready_for_connection');
    expect(result.nextAction).toBe('send_connection_request');
  });
});

describe('project() — convite e conexão', () => {
  it('lead qualificado vai para convite imediatamente', () => {
    const result = project({ ...base, facts: facts({ qualificationScore: 90 }) });
    expect(result.nextAction).toBe('send_connection_request');
    expect(result.nextActionAt).toEqual(NOW);
  });

  it('convite enviado agenda a verificação de aceite', () => {
    const result = project({
      ...base,
      facts: facts({ qualificationScore: 90, connectionRequestedAt: hoursFromNow(-1) }),
    });
    expect(result.status).toBe('connection_requested');
    expect(result.nextAction).toBe('check_connection');
    expect(result.nextActionAt).toEqual(hoursFromNow(-1 + DEFAULT_TIMING.connectionCheckIntervalHours));
  });

  it('após uma verificação sem aceite, reagenda a partir da última tentativa', () => {
    const result = project({
      ...base,
      facts: facts({
        qualificationScore: 90,
        connectionRequestedAt: hoursFromNow(-10),
        lastAttemptAt: hoursFromNow(-2),
      }),
    });
    expect(result.status).toBe('waiting_connection');
    expect(result.nextAction).toBe('check_connection');
    expect(result.nextActionAt).toEqual(hoursFromNow(4));
  });

  it('convite não aceito expira e encerra o lead', () => {
    const result = project({
      ...base,
      facts: facts({ qualificationScore: 90, connectionRequestedAt: hoursFromNow(-24 * 31) }),
    });
    expect(result.status).toBe('completed');
    expect(result.nextAction).toBe('none');
  });

  it('lead que já era conexão pula o convite', () => {
    const result = project({
      ...base,
      facts: facts({ qualificationScore: 90, connectionStatus: 'connected' }),
    });
    expect(result.nextAction).toBe('send_first_message');
  });
});

describe('project() — timing da sequência', () => {
  it('espera o delay configurado antes da primeira mensagem', () => {
    const connectedAt = hoursFromNow(-2);
    const result = project({ ...base, facts: facts({ qualificationScore: 90, connectedAt }) });
    expect(result.status).toBe('connected');
    expect(result.nextAction).toBe('send_first_message');
    expect(result.nextActionAt).toEqual(hoursFromNow(22)); // -2h + 24h
  });

  it('quando o delay já passou, o lead fica elegível agora', () => {
    const result = project({ ...base, facts: facts({ qualificationScore: 90, connectedAt: hoursFromNow(-30) }) });
    expect(result.status).toBe('ready_for_first_message');
    expect(result.nextActionAt!.getTime()).toBeLessThanOrEqual(NOW.getTime());
  });

  it('encadeia mensagem -> 3 dias -> follow-up 1 -> 5 dias -> follow-up 2', () => {
    const firstMessageSentAt = hoursFromNow(-1);
    const afterFirst = project({
      ...base,
      facts: facts({ qualificationScore: 90, connectedAt: hoursFromNow(-30), firstMessageSentAt }),
    });
    expect(afterFirst.status).toBe('waiting_followup_1');
    expect(afterFirst.nextAction).toBe('send_followup_1');
    expect(afterFirst.nextActionAt).toEqual(hoursFromNow(71)); // -1h + 72h

    const followup1SentAt = hoursFromNow(72);
    const afterFollowup1 = project({
      ...base,
      facts: facts({
        qualificationScore: 90,
        connectedAt: hoursFromNow(-30),
        firstMessageSentAt,
        followup1SentAt,
      }),
    });
    expect(afterFollowup1.status).toBe('waiting_followup_2');
    expect(afterFollowup1.nextActionAt).toEqual(hoursFromNow(72 + 120));
  });

  it('sequência termina depois do follow-up 2', () => {
    const result = project({
      ...base,
      facts: facts({
        qualificationScore: 90,
        connectedAt: hoursFromNow(-200),
        firstMessageSentAt: hoursFromNow(-100),
        followup1SentAt: hoursFromNow(-50),
        followup2SentAt: hoursFromNow(-10),
      }),
    });
    expect(result.status).toBe('completed');
    expect(result.nextAction).toBe('none');
  });

  it('respeita passos desabilitados na sequência', () => {
    const sequence = compileSequence(
      DEFAULT_STEPS.map((step) => (step.step_type === 'followup_1' ? { ...step, enabled: false } : step)),
    );
    const result = project({
      ...base,
      sequence,
      facts: facts({ qualificationScore: 90, connectedAt: hoursFromNow(-30), firstMessageSentAt: hoursFromNow(-1) }),
    });
    expect(result.status).toBe('completed');
    expect(result.nextAction).toBe('none');
  });
});

describe('project() — resposta interrompe a sequência (regra obrigatória)', () => {
  it('mesmo com follow-up agendado, um lead que respondeu não tem próxima ação', () => {
    const result = project({
      ...base,
      facts: facts({
        qualificationScore: 90,
        connectedAt: hoursFromNow(-200),
        firstMessageSentAt: hoursFromNow(-100),
        repliedAt: hoursFromNow(-1),
      }),
    });
    expect(result.status).toBe('replied');
    expect(result.nextAction).toBe('none');
    expect(result.nextActionAt).toBeNull();
  });

  it('resposta tem precedência sobre erro e sobre qualificação pendente', () => {
    const result = project({
      ...base,
      facts: facts({ repliedAt: hoursFromNow(-1), retryCount: 99, manualError: true }),
    });
    expect(result.status).toBe('replied');
    expect(result.nextAction).toBe('none');
  });

  it('classificação no inbox reflete no status', () => {
    const interested = project({
      ...base,
      facts: facts({ qualificationScore: 90, repliedAt: hoursFromNow(-1), interestStatus: 'interested' }),
    });
    expect(interested.status).toBe('interested');

    const notInterested = project({
      ...base,
      facts: facts({ qualificationScore: 90, repliedAt: hoursFromNow(-1), interestStatus: 'not_interested' }),
    });
    expect(notInterested.status).toBe('not_interested');
  });

  it('sequência interrompida manualmente também não gera ação', () => {
    const result = project({ ...base, facts: facts({ qualificationScore: 90, sequenceStopped: true }) });
    expect(result.nextAction).toBe('none');
  });
});

describe('project() — erros', () => {
  it('após 3 falhas o lead vai para revisão manual', () => {
    const result = project({ ...base, facts: facts({ qualificationScore: 90, retryCount: 3 }) });
    expect(result.status).toBe('error');
    expect(result.nextAction).toBe('none');
  });

  it('com 2 falhas o lead ainda é processado', () => {
    const result = project({ ...base, facts: facts({ qualificationScore: 90, retryCount: 2 }) });
    expect(result.nextAction).toBe('send_connection_request');
  });
});
