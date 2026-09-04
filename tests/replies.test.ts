import { describe, expect, it } from 'vitest';
import { pickLastInbound } from '@/automation/linkedin/replies';

describe('pickLastInbound', () => {
  it('detecta resposta quando a última mensagem é do lead', () => {
    const result = pickLastInbound(
      [
        { sender: 'Kaio Guerreiro', body: 'Fala Rafael, valeu pela conexão.' },
        { sender: 'Rafael Souza', body: 'Opa, tudo bem? Manda mais detalhes.' },
      ],
      'Rafael Souza',
    );
    expect(result).toBe('Opa, tudo bem? Manda mais detalhes.');
  });

  it('não detecta quando a última mensagem é nossa', () => {
    const result = pickLastInbound(
      [
        { sender: 'Rafael Souza', body: 'Oi' },
        { sender: 'Kaio Guerreiro', body: 'Follow-up 1' },
      ],
      'Rafael Souza',
    );
    expect(result).toBeNull();
  });

  it('propaga o remetente em mensagens seguidas do mesmo autor', () => {
    const result = pickLastInbound(
      [
        { sender: 'Kaio Guerreiro', body: 'Primeira mensagem' },
        { sender: 'Rafael Souza', body: 'Opa' },
        { sender: null, body: 'complementando: faz sentido sim' },
      ],
      'Rafael Souza',
    );
    expect(result).toBe('complementando: faz sentido sim');
  });

  it('não marca resposta quando o remetente é desconhecido', () => {
    expect(pickLastInbound([{ sender: null, body: 'mensagem sem autor' }], 'Rafael Souza')).toBeNull();
  });

  it('ignora mensagens vazias', () => {
    const result = pickLastInbound(
      [
        { sender: 'Rafael Souza', body: 'resposta real' },
        { sender: 'Rafael Souza', body: '   ' },
      ],
      'Rafael Souza',
    );
    expect(result).toBe('resposta real');
  });
});
