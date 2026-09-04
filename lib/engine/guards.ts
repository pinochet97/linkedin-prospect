import type { EnrollmentFacts, MessageKind } from './types';

/**
 * Guardas de idempotência.
 *
 * Regra do sistema: NENHUMA ação externa é executada sem passar por aqui
 * primeiro (consulta ao banco) e, em seguida, pela verificação do estado real
 * no LinkedIn dentro do adapter. As duas camadas juntas garantem que rodar o
 * worker duas vezes sobre o mesmo lead não gera dois convites nem duas
 * mensagens.
 */

export interface GuardResult {
  ok: boolean;
  reason: string;
}

const ALLOW: GuardResult = { ok: true, reason: 'ok' };

function blockedByReply(facts: EnrollmentFacts): GuardResult | null {
  if (facts.repliedAt) return { ok: false, reason: 'Lead já respondeu — sequência interrompida.' };
  if (facts.sequenceStopped) return { ok: false, reason: 'Sequência interrompida.' };
  return null;
}

export function canRequestConnection(facts: EnrollmentFacts): GuardResult {
  const blocked = blockedByReply(facts);
  if (blocked) return blocked;
  if (facts.connectionRequestedAt) return { ok: false, reason: 'Convite já enviado.' };
  if (facts.connectedAt || facts.connectionStatus === 'connected') {
    return { ok: false, reason: 'Já é conexão.' };
  }
  if (facts.connectionStatus === 'pending') return { ok: false, reason: 'Já existe convite pendente.' };
  return ALLOW;
}

export function canSendFirstMessage(facts: EnrollmentFacts): GuardResult {
  const blocked = blockedByReply(facts);
  if (blocked) return blocked;
  if (!facts.connectedAt && facts.connectionStatus !== 'connected') {
    return { ok: false, reason: 'Ainda não é conexão.' };
  }
  if (facts.firstMessageSentAt) return { ok: false, reason: 'Primeira mensagem já enviada.' };
  return ALLOW;
}

export function canSendFollowup1(facts: EnrollmentFacts): GuardResult {
  const blocked = blockedByReply(facts);
  if (blocked) return blocked;
  if (!facts.firstMessageSentAt) return { ok: false, reason: 'Primeira mensagem ainda não foi enviada.' };
  if (facts.followup1SentAt) return { ok: false, reason: 'Follow-up 1 já enviado.' };
  return ALLOW;
}

export function canSendFollowup2(facts: EnrollmentFacts): GuardResult {
  const blocked = blockedByReply(facts);
  if (blocked) return blocked;
  if (!facts.followup1SentAt) return { ok: false, reason: 'Follow-up 1 ainda não foi enviado.' };
  if (facts.followup2SentAt) return { ok: false, reason: 'Follow-up 2 já enviado.' };
  return ALLOW;
}

export function canSendMessage(facts: EnrollmentFacts, kind: Exclude<MessageKind, 'connection_note' | 'inbound_reply'>) {
  switch (kind) {
    case 'first_message':
      return canSendFirstMessage(facts);
    case 'followup_1':
      return canSendFollowup1(facts);
    case 'followup_2':
      return canSendFollowup2(facts);
  }
}
