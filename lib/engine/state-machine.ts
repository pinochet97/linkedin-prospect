import {
  DEFAULT_TIMING,
  type EnrollmentFacts,
  type LeadStatus,
  type NextAction,
  type Projection,
  type Sequence,
  type TimingOptions,
} from './types';

export interface ProjectionInput {
  facts: EnrollmentFacts;
  sequence: Sequence;
  /** Nota mínima de qualificação da campanha. */
  qualificationThreshold: number;
  now: Date;
  timing?: TimingOptions;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR_MS);
}

function stop(status: LeadStatus, reason: string): Projection {
  return { status, nextAction: 'none', nextActionAt: null, reason };
}

function schedule(status: LeadStatus, nextAction: NextAction, nextActionAt: Date, reason: string): Projection {
  return { status, nextAction, nextActionAt, reason };
}

/**
 * A CAMADA CENTRAL: "qual é a próxima ação deste lead?".
 *
 * Função pura — nenhum acesso a banco, rede ou relógio global. Recebe os fatos
 * persistidos e devolve o status canônico, a próxima ação e quando ela fica
 * elegível.
 *
 * A ordem das regras importa e é coberta por testes:
 *   resposta > erro > qualificação > convite > conexão > mensagem > follow-ups
 *
 * Observação: pausa de campanha, kill switch, feature flags e limites diários
 * NÃO entram aqui. Eles são portões de execução (ver `canExecute` e
 * `rate-limit.ts`), não estado do lead. Um lead pausado continua sabendo qual
 * seria a sua próxima ação.
 */
export function project(input: ProjectionInput): Projection {
  const { facts, sequence, qualificationThreshold, now } = input;
  const timing = input.timing ?? DEFAULT_TIMING;

  // 1. Resposta interrompe tudo, em qualquer ponto da sequência.
  if (facts.repliedAt) {
    if (facts.interestStatus === 'interested') return stop('interested', 'Lead respondeu e foi marcado como interessado.');
    if (facts.interestStatus === 'not_interested') {
      return stop('not_interested', 'Lead respondeu e foi marcado como não interessado.');
    }
    return stop('replied', 'Lead respondeu — sequência interrompida.');
  }

  // 2. Interrupção manual da sequência.
  if (facts.sequenceStopped) {
    return stop('completed', 'Sequência interrompida manualmente.');
  }

  // 3. Falhas repetidas: revisão manual.
  if (facts.manualError || facts.retryCount >= timing.maxRetries) {
    return stop('error', `Falhou ${facts.retryCount}x — precisa de revisão manual.`);
  }

  // 4. Qualificação.
  if (facts.qualificationScore === null) {
    return schedule('discovered', 'qualify', now, 'Lead ainda não qualificado.');
  }
  if (facts.qualificationScore < qualificationThreshold) {
    return stop('rejected', `Score ${facts.qualificationScore} abaixo do mínimo (${qualificationThreshold}).`);
  }

  const isConnected = Boolean(facts.connectedAt) || facts.connectionStatus === 'connected';

  // 5. Convite de conexão.
  if (!isConnected) {
    if (!facts.connectionRequestedAt) {
      return schedule('ready_for_connection', 'send_connection_request', now, 'Pronto para receber convite.');
    }

    // 6. Aguardando aceite — polling com intervalo fixo e prazo de validade.
    const expiresAt = new Date(facts.connectionRequestedAt.getTime() + timing.connectionExpireDays * DAY_MS);
    if (now >= expiresAt) {
      return stop('completed', `Convite não aceito em ${timing.connectionExpireDays} dias.`);
    }
    const base = facts.lastAttemptAt && facts.lastAttemptAt > facts.connectionRequestedAt
      ? facts.lastAttemptAt
      : facts.connectionRequestedAt;
    const checkAt = addHours(base, timing.connectionCheckIntervalHours);
    const alreadyChecked = Boolean(facts.lastAttemptAt && facts.lastAttemptAt > facts.connectionRequestedAt);
    return schedule(
      alreadyChecked ? 'waiting_connection' : 'connection_requested',
      'check_connection',
      checkAt,
      'Convite enviado, aguardando aceite.',
    );
  }

  const connectedAt = facts.connectedAt ?? facts.connectionRequestedAt ?? now;

  // 7. Primeira mensagem.
  if (!facts.firstMessageSentAt) {
    if (!sequence.firstMessage.enabled) {
      return stop('completed', 'Conectado. A sequência não prevê mensagem.');
    }
    const dueAt = addHours(connectedAt, sequence.firstMessage.delayHours);
    return schedule(
      now >= dueAt ? 'ready_for_first_message' : 'connected',
      'send_first_message',
      dueAt,
      'Conectado, aguardando o delay para a primeira mensagem.',
    );
  }

  // 8. Follow-up 1.
  if (!facts.followup1SentAt) {
    if (!sequence.followup1.enabled) {
      return stop('completed', 'Primeira mensagem enviada. Sem follow-ups configurados.');
    }
    const dueAt = addHours(facts.firstMessageSentAt, sequence.followup1.delayHours);
    return schedule('waiting_followup_1', 'send_followup_1', dueAt, 'Sem resposta — follow-up 1 agendado.');
  }

  // 9. Follow-up 2.
  if (!facts.followup2SentAt) {
    if (!sequence.followup2.enabled) {
      return stop('completed', 'Follow-up 1 enviado. Sem follow-up 2 configurado.');
    }
    const dueAt = addHours(facts.followup1SentAt, sequence.followup2.delayHours);
    return schedule('waiting_followup_2', 'send_followup_2', dueAt, 'Sem resposta — follow-up 2 agendado.');
  }

  // 10. Fim da sequência.
  return stop('completed', 'Sequência concluída sem resposta.');
}

/** Conveniência: a ação está elegível agora? */
export function isDue(projection: Projection, now: Date): boolean {
  if (projection.nextAction === 'none') return false;
  if (!projection.nextActionAt) return false;
  return projection.nextActionAt.getTime() <= now.getTime();
}
