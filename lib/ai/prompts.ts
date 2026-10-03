/**
 * TODOS os prompts do sistema ficam neste arquivo.
 * Nada de prompt solto dentro de rota, worker ou componente.
 */

export interface CommunicationProfile {
  myName: string;
  myCompany: string;
  myRole: string;
  whatIDo: string;
  targetAudience: string;
  toneOfVoice: string;
  thingsToAvoid: string;
}

export interface LeadContext {
  fullName: string;
  firstName: string | null;
  headline: string | null;
  jobTitle: string | null;
  company: string | null;
  location: string | null;
  summary: string | null;
  segment: string | null;
}

export interface Prompt {
  system: string;
  user: string;
}

function leadBlock(lead: LeadContext): string {
  return [
    `Nome: ${lead.fullName}`,
    `Primeiro nome: ${lead.firstName ?? '—'}`,
    `Headline: ${lead.headline ?? '—'}`,
    `Cargo: ${lead.jobTitle ?? '—'}`,
    `Empresa: ${lead.company ?? '—'}`,
    `Localização: ${lead.location ?? '—'}`,
    `Segmento: ${lead.segment ?? '—'}`,
    `Resumo do perfil: ${lead.summary ?? '—'}`,
  ].join('\n');
}

function profileBlock(profile: CommunicationProfile): string {
  return [
    `Meu nome: ${profile.myName || '—'}`,
    `Minha empresa: ${profile.myCompany || '—'}`,
    `Meu cargo: ${profile.myRole || '—'}`,
    `O que eu faço: ${profile.whatIDo || '—'}`,
    `Público que eu procuro: ${profile.targetAudience || '—'}`,
    `Tom de voz: ${profile.toneOfVoice || 'informal, direto, curto, natural'}`,
    `O que evitar:\n${profile.thingsToAvoid || '- linguagem comercial\n- textos longos'}`,
  ].join('\n');
}

const WRITING_RULES = `
Regras de escrita (valem para tudo):
- Português do Brasil, primeira pessoa, como uma pessoa real escrevendo no LinkedIn.
- Curto. Sem introdução cerimoniosa, sem assinatura, sem "espero que esteja bem".
- Nunca invente fatos sobre a pessoa ou a empresa. Use só o que está no perfil.
- Se um dado não existir, simplesmente não fale dele.
- Nada de emoji, hashtag, bullet point ou formatação.
- Não venda nada na primeira abordagem. O objetivo é começar uma conversa.
- Devolva apenas o texto da mensagem, sem aspas e sem comentários.
`.trim();

/** Qualificação: decide se o lead bate com o ICP da campanha. */
export function qualificationPrompt(lead: LeadContext, icpDescription: string): Prompt {
  return {
    system: [
      'Você qualifica leads de prospecção B2B no LinkedIn.',
      'Seja rigoroso: só considere qualificado quem claramente se encaixa no ICP descrito.',
      'Na dúvida por falta de informação, dê uma nota baixa e explique.',
      'Responda apenas com o JSON pedido.',
    ].join(' '),
    user: [
      `ICP da campanha:\n${icpDescription || 'Não informado — use bom senso para prospecção B2B.'}`,
      '',
      `Perfil do lead:\n${leadBlock(lead)}`,
      '',
      'Devolva: qualified (boolean), score (0 a 100), reason (uma frase curta em português),',
      'segment (o segmento/vertical da empresa em 1 a 3 palavras, ou "desconhecido").',
    ].join('\n'),
  };
}

/** Nota do convite: curta, natural, sem cara de venda. */
export function connectionNotePrompt(
  lead: LeadContext,
  profile: CommunicationProfile,
  maxChars: number,
): Prompt {
  return {
    system: [
      'Você escreve notas de convite de conexão no LinkedIn em nome da pessoa abaixo.',
      WRITING_RULES,
      `A nota precisa caber em ${maxChars} caracteres — conte os caracteres antes de responder.`,
    ].join('\n\n'),
    user: [
      `Quem está escrevendo:\n${profileBlock(profile)}`,
      '',
      `Para quem:\n${leadBlock(lead)}`,
      '',
      'Escreva a nota do convite:',
      '- comece pelo primeiro nome da pessoa;',
      '- cite algo concreto do perfil dela (empresa, cargo ou área);',
      '- explique em meia linha por que faz sentido conectar;',
      '- termine com um convite simples para conectar.',
      '',
      'Exemplo de estilo (NÃO copie o conteúdo):',
      '"Fala Rafael, vi o trabalho de vocês na XPTO e achei interessante o que estão construindo. Também estou bem próximo do ecossistema de startups. Vamos conectar!"',
    ].join('\n'),
  };
}

/** Primeira mensagem, enviada depois que a conexão foi aceita. */
export function firstMessagePrompt(lead: LeadContext, profile: CommunicationProfile): Prompt {
  return {
    system: ['Você escreve a primeira mensagem depois que a conexão foi aceita no LinkedIn.', WRITING_RULES].join(
      '\n\n',
    ),
    user: [
      `Quem está escrevendo:\n${profileBlock(profile)}`,
      '',
      `Para quem:\n${leadBlock(lead)}`,
      '',
      'Escreva a mensagem:',
      '- agradeça a conexão em poucas palavras;',
      '- demonstre que olhou o perfil/empresa citando algo específico;',
      '- termine com UMA pergunta aberta e leve sobre o momento da empresa ou da área dela;',
      '- no máximo 3 frases.',
      '',
      'Exemplo de estilo (NÃO copie o conteúdo):',
      '"Fala Rafael, valeu pela conexão. Dei uma olhada melhor na XPTO e achei interessante o foco de vocês em gestão para clínicas. Como está o momento da empresa hoje?"',
    ].join('\n'),
  };
}

/** Follow-up: retoma o assunto sem cobrar e sem repetir a mensagem anterior. */
export function followupPrompt(
  lead: LeadContext,
  profile: CommunicationProfile,
  previousMessages: string[],
  attempt: 1 | 2,
): Prompt {
  return {
    system: [
      'Você escreve follow-ups no LinkedIn para quem não respondeu ainda.',
      WRITING_RULES,
      'Nunca cobre resposta, nunca reclame do silêncio, nunca repita a mensagem anterior.',
    ].join('\n\n'),
    user: [
      `Quem está escrevendo:\n${profileBlock(profile)}`,
      '',
      `Para quem:\n${leadBlock(lead)}`,
      '',
      `Mensagens que já enviei (não repita):\n${previousMessages.map((message) => `- ${message}`).join('\n') || '—'}`,
      '',
      attempt === 1
        ? 'Escreva o follow-up 1: retome o ponto anterior com curiosidade genuína e faça uma pergunta rápida. No máximo 2 frases.'
        : 'Escreva o follow-up 2: o último toque. Muito curto (1 a 2 frases), leve, deixando a porta aberta sem insistir.',
      '',
      'Exemplo de estilo (NÃO copie o conteúdo):',
      '"Rafael, puxando esse ponto novamente porque fiquei curioso sobre o momento da XPTO. Faz sentido trocar uma ideia rápida?"',
    ].join('\n'),
  };
}
