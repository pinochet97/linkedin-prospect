import { completeText } from './client';
import { isAiMocked } from '@/lib/config';
import { clampMessage } from './text';
import {
  connectionNotePrompt,
  firstMessagePrompt,
  followupPrompt,
  type CommunicationProfile,
  type LeadContext,
} from './prompts';

/**
 * Geração das mensagens. Cada uma é gerada UMA vez e guardada em
 * `lead_messages` — reenvio nunca chama a IA de novo.
 */

const FIRST_MESSAGE_MAX = 600;
const FOLLOWUP_MAX = 400;

function subject(lead: LeadContext): string {
  return lead.firstName ?? lead.fullName.split(' ')[0] ?? 'tudo bem';
}

function reference(lead: LeadContext): string {
  if (lead.company) return `o trabalho de vocês na ${lead.company}`;
  if (lead.jobTitle) return `o seu trabalho como ${lead.jobTitle}`;
  return 'o seu perfil';
}

export function mockConnectionNote(lead: LeadContext, profile: CommunicationProfile, maxChars: number): string {
  const who = profile.whatIDo ? 'Também estou próximo desse ecossistema.' : '';
  return clampMessage(`Fala ${subject(lead)}, vi ${reference(lead)} e achei interessante. ${who} Vamos conectar!`, maxChars);
}

export function mockFirstMessage(lead: LeadContext): string {
  return clampMessage(
    `Fala ${subject(lead)}, valeu pela conexão. Dei uma olhada melhor em ${reference(lead)} e fiquei curioso. Como está o momento de vocês hoje?`,
    FIRST_MESSAGE_MAX,
  );
}

export function mockFollowup(lead: LeadContext, attempt: 1 | 2): string {
  const text =
    attempt === 1
      ? `${subject(lead)}, puxando esse ponto de novo porque fiquei curioso sobre o momento de vocês. Faz sentido trocar uma ideia rápida?`
      : `${subject(lead)}, fico por aqui para não insistir. Se fizer sentido mais para frente, é só chamar.`;
  return clampMessage(text, FOLLOWUP_MAX);
}

export async function generateConnectionNote(
  lead: LeadContext,
  profile: CommunicationProfile,
  maxChars: number,
): Promise<string> {
  if (isAiMocked()) return mockConnectionNote(lead, profile, maxChars);
  const text = await completeText(connectionNotePrompt(lead, profile, maxChars), 200);
  return clampMessage(text, maxChars);
}

export async function generateFirstMessage(lead: LeadContext, profile: CommunicationProfile): Promise<string> {
  if (isAiMocked()) return mockFirstMessage(lead);
  const text = await completeText(firstMessagePrompt(lead, profile), 320);
  return clampMessage(text, FIRST_MESSAGE_MAX);
}

export async function generateFollowup(
  lead: LeadContext,
  profile: CommunicationProfile,
  previousMessages: string[],
  attempt: 1 | 2,
): Promise<string> {
  if (isAiMocked()) return mockFollowup(lead, attempt);
  const text = await completeText(followupPrompt(lead, profile, previousMessages, attempt), 260);
  return clampMessage(text, FOLLOWUP_MAX);
}
