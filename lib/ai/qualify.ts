import { completeJson } from './client';
import { isAiMocked } from '@/lib/config';
import { qualificationPrompt, type LeadContext } from './prompts';

export interface QualificationResult {
  qualified: boolean;
  score: number;
  reason: string;
  segment: string;
  /** De onde veio a decisão — aparece nos logs. */
  source: 'rule' | 'ai' | 'mock';
}

const SCHEMA = {
  name: 'lead_qualification',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['qualified', 'score', 'reason', 'segment'],
    properties: {
      qualified: { type: 'boolean' },
      score: { type: 'integer', minimum: 0, maximum: 100 },
      reason: { type: 'string' },
      segment: { type: 'string' },
    },
  },
};

/** Perfis que claramente não decidem nada — descartados sem gastar token. */
const HARD_NEGATIVES = [
  /\bestudante\b/i,
  /\bstudent\b/i,
  /\bestagi[áa]ri/i,
  /\bintern\b/i,
  /\btrainee\b/i,
  /\baposentad/i,
  /\bretired\b/i,
  /open to work/i,
  /buscando (uma )?(nova )?(oportunidade|recoloca)/i,
  /em busca de recoloca/i,
];

/**
 * Filtro barato antes da IA. Só REJEITA — nunca aprova sozinho, para não
 * inventar score. Função pura.
 */
export function prefilter(lead: LeadContext): QualificationResult | null {
  const text = [lead.headline, lead.jobTitle, lead.company, lead.summary].filter(Boolean).join(' ');

  if (text.trim().length === 0) {
    return {
      qualified: false,
      score: 0,
      reason: 'Perfil sem cargo, headline ou empresa — não dá para avaliar.',
      segment: 'desconhecido',
      source: 'rule',
    };
  }

  const negative = HARD_NEGATIVES.find((pattern) => pattern.test(text));
  if (negative) {
    return {
      qualified: false,
      score: 0,
      reason: 'Cargo claramente incompatível com prospecção B2B.',
      segment: 'desconhecido',
      source: 'rule',
    };
  }

  return null;
}

/** Qualificação determinística usada quando a IA está em modo mock. */
const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-zà-ú0-9]+/i)
    .filter((token) => token.length >= 3);

/** "founder" casa com "founders", "ceo" com "ceos" — suficiente para o mock. */
const looselyMatches = (term: string, token: string): boolean =>
  term.startsWith(token.slice(0, 4)) || token.startsWith(term.slice(0, 4));

export function mockQualify(lead: LeadContext, icpDescription: string): QualificationResult {
  const leadTokens = tokenize([lead.headline, lead.jobTitle, lead.company].filter(Boolean).join(' '));
  const terms = tokenize(icpDescription).filter((term) => term.length > 3);

  const matches = terms.filter((term) => leadTokens.some((token) => looselyMatches(term, token)));
  const ratio = terms.length === 0 ? 0.5 : matches.length / terms.length;
  const score = Math.min(100, Math.round(40 + ratio * 80));

  return {
    qualified: score >= 60,
    score,
    reason: matches.length > 0 ? `Bate com: ${[...new Set(matches)].slice(0, 3).join(', ')}.` : 'Sem termos em comum com o ICP.',
    segment: lead.company ?? 'desconhecido',
    source: 'mock',
  };
}

export async function qualifyLead(lead: LeadContext, icpDescription: string): Promise<QualificationResult> {
  const ruled = prefilter(lead);
  if (ruled) return ruled;

  if (isAiMocked()) return mockQualify(lead, icpDescription);

  const result = await completeJson<Omit<QualificationResult, 'source'>>(
    qualificationPrompt(lead, icpDescription),
    SCHEMA,
  );

  return {
    qualified: Boolean(result.qualified),
    score: Math.max(0, Math.min(100, Math.round(result.score))),
    reason: result.reason?.slice(0, 300) ?? '',
    segment: result.segment?.slice(0, 60) ?? 'desconhecido',
    source: 'ai',
  };
}
