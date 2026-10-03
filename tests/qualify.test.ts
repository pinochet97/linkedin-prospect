import { describe, expect, it } from 'vitest';
import { mockQualify, prefilter } from '@/lib/ai/qualify';
import type { LeadContext } from '@/lib/ai/prompts';

const lead = (overrides: Partial<LeadContext> = {}): LeadContext => ({
  fullName: 'Rafael Souza',
  firstName: 'Rafael',
  headline: 'Founder & CEO na Clinicorp',
  jobTitle: 'Founder & CEO',
  company: 'Clinicorp',
  location: 'Florianópolis, SC',
  summary: null,
  segment: null,
  ...overrides,
});

describe('prefilter (economiza token)', () => {
  it('rejeita perfil sem nenhum dado', () => {
    const result = prefilter(lead({ headline: null, jobTitle: null, company: null, summary: null }));
    expect(result?.qualified).toBe(false);
    expect(result?.source).toBe('rule');
  });

  it('rejeita cargos claramente incompatíveis sem chamar a IA', () => {
    for (const headline of ['Estudante de Engenharia', 'Software Engineer Intern', 'Open to work', 'Aposentado']) {
      const result = prefilter(lead({ headline, jobTitle: null, company: null }));
      expect(result?.qualified, headline).toBe(false);
      expect(result?.score, headline).toBe(0);
    }
  });

  it('deixa passar para a IA quando o perfil é plausível', () => {
    expect(prefilter(lead())).toBeNull();
  });
});

describe('mockQualify (modo sem OpenAI)', () => {
  it('dá nota alta quando o perfil bate com o ICP', () => {
    const result = mockQualify(lead(), 'Founders e CEOs de empresas SaaS');
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.qualified).toBe(true);
  });

  it('dá nota baixa quando não bate', () => {
    const result = mockQualify(
      lead({ headline: 'Professor de História', jobTitle: 'Professor', company: 'Escola' }),
      'Founders e CEOs de empresas SaaS B2B',
    );
    expect(result.qualified).toBe(false);
  });
});
