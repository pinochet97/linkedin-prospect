import { describe, expect, it } from 'vitest';
import {
  dedupeByProfileUrl,
  extractPublicId,
  firstNameOf,
  isSameLead,
  normalizeLinkedInUrl,
} from '@/lib/engine/dedupe';

describe('normalizeLinkedInUrl', () => {
  it('normaliza variações da mesma pessoa para a mesma chave', () => {
    const canonical = 'https://www.linkedin.com/in/rafael-souza';
    expect(normalizeLinkedInUrl('https://www.linkedin.com/in/rafael-souza')).toBe(canonical);
    expect(normalizeLinkedInUrl('https://www.linkedin.com/in/rafael-souza/')).toBe(canonical);
    expect(normalizeLinkedInUrl('https://br.linkedin.com/in/Rafael-Souza?originalSubdomain=br')).toBe(canonical);
    expect(normalizeLinkedInUrl('linkedin.com/in/rafael-souza#experience')).toBe(canonical);
    expect(normalizeLinkedInUrl('  https://www.linkedin.com/in/rafael-souza/details/experience/  ')).toBe(canonical);
  });

  it('decodifica slugs com escape', () => {
    expect(normalizeLinkedInUrl('https://www.linkedin.com/in/jo%C3%A3o-silva')).toBe(
      'https://www.linkedin.com/in/joão-silva',
    );
  });

  it('rejeita o que não é perfil', () => {
    expect(normalizeLinkedInUrl('https://www.linkedin.com/company/anthropic')).toBeNull();
    expect(normalizeLinkedInUrl('https://example.com/in/rafael')).toBeNull();
    expect(normalizeLinkedInUrl('não é url')).toBeNull();
    expect(normalizeLinkedInUrl('')).toBeNull();
    expect(normalizeLinkedInUrl(null)).toBeNull();
  });

  it('extrai o slug público', () => {
    expect(extractPublicId('https://br.linkedin.com/in/Rafael-Souza/')).toBe('rafael-souza');
    expect(extractPublicId('https://www.linkedin.com/feed/')).toBeNull();
  });

  it('compara identidades', () => {
    expect(isSameLead('https://br.linkedin.com/in/Ana/', 'linkedin.com/in/ana?x=1')).toBe(true);
    expect(isSameLead('linkedin.com/in/ana', 'linkedin.com/in/ana-2')).toBe(false);
  });
});

describe('dedupeByProfileUrl', () => {
  it('remove duplicatas preservando a ordem e normalizando a URL', () => {
    const result = dedupeByProfileUrl([
      { linkedinUrl: 'https://www.linkedin.com/in/ana/', name: 'Ana' },
      { linkedinUrl: 'https://br.linkedin.com/in/ANA?trk=x', name: 'Ana (duplicada)' },
      { linkedinUrl: 'https://www.linkedin.com/in/bruno', name: 'Bruno' },
      { linkedinUrl: 'https://www.linkedin.com/company/x', name: 'Não é perfil' },
    ]);
    expect(result).toEqual([
      { linkedinUrl: 'https://www.linkedin.com/in/ana', name: 'Ana' },
      { linkedinUrl: 'https://www.linkedin.com/in/bruno', name: 'Bruno' },
    ]);
  });
});

describe('firstNameOf', () => {
  it('extrai o primeiro nome de forma tolerante', () => {
    expect(firstNameOf('Rafael Souza')).toBe('Rafael');
    expect(firstNameOf('Ana Paula | CEO na XPTO')).toBe('Ana');
    expect(firstNameOf('🚀 Bruno Lima')).toBe('Bruno');
    expect(firstNameOf('')).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });
});
