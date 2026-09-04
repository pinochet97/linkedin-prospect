import { describe, expect, it } from 'vitest';
import { cleanGeneratedText, clampMessage } from '@/lib/ai/text';

describe('cleanGeneratedText', () => {
  it('remove aspas, markdown e espaços sobrando', () => {
    expect(cleanGeneratedText('  "Fala Rafael, tudo certo?"  ')).toBe('Fala Rafael, tudo certo?');
    expect(cleanGeneratedText('```\nFala Rafael\n```')).toBe('Fala Rafael');
    expect(cleanGeneratedText('**Fala** Rafael')).toBe('Fala Rafael');
  });
});

describe('clampMessage', () => {
  it('mantém o texto quando cabe no limite', () => {
    expect(clampMessage('Fala Rafael, vamos conectar!', 200)).toBe('Fala Rafael, vamos conectar!');
  });

  it('corta na fronteira de frase', () => {
    const text = 'Fala Rafael, vi o trabalho de vocês. Achei muito interessante o foco em clínicas. Vamos conectar!';
    const result = clampMessage(text, 60);
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result).toBe('Fala Rafael, vi o trabalho de vocês.');
  });

  it('corta na fronteira de palavra quando não há frase que caiba', () => {
    const result = clampMessage('Uma frase única bem comprida que não termina tão cedo assim mesmo', 30);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result.endsWith(' ')).toBe(false);
    expect(result.split(' ').at(-1)).not.toBe('compri');
  });
});
