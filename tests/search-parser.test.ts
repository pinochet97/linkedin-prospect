import { describe, expect, it } from 'vitest';
import { parseSearchResultText } from '@/automation/linkedin/search';

describe('parseSearchResultText', () => {
  it('extrai nome, headline e localização de um resultado típico', () => {
    const raw = [
      'Rafael Souza',
      'Rafael Souza',
      '• 2º',
      'Founder & CEO na Clinicorp',
      'Florianópolis, SC',
      'Conectar',
    ].join('\n');

    expect(parseSearchResultText(raw)).toEqual({
      fullName: 'Rafael Souza',
      headline: 'Founder & CEO na Clinicorp',
      location: 'Florianópolis, SC',
    });
  });

  it('funciona em inglês e sem localização', () => {
    const raw = ['Ana Almeida', '2nd', 'CTO at Omie', 'Message'].join('\n');
    expect(parseSearchResultText(raw)).toEqual({
      fullName: 'Ana Almeida',
      headline: 'CTO at Omie',
      location: null,
    });
  });

  it('devolve nulos quando o bloco está vazio', () => {
    expect(parseSearchResultText('\n\n • 3º \n')).toEqual({ fullName: null, headline: null, location: null });
  });
});
