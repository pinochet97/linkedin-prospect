/**
 * Higiene do texto gerado. A IA às vezes devolve aspas, markdown ou passa do
 * limite de caracteres — isso é corrigido antes de qualquer envio.
 */

export function cleanGeneratedText(raw: string): string {
  return raw
    .trim()
    .replace(/^```[a-z]*\n?|```$/g, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\*\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Garante o limite de caracteres cortando numa fronteira de frase (ou, em
 * último caso, de palavra). Nunca corta no meio de uma palavra.
 */
export function clampMessage(text: string, maxChars: number): string {
  const clean = cleanGeneratedText(text);
  if (clean.length <= maxChars) return clean;

  const sentences = clean.match(/[^.!?]+[.!?]*/g) ?? [clean];
  let result = '';
  for (const sentence of sentences) {
    if ((result + sentence).trim().length > maxChars) break;
    result += sentence;
  }

  result = result.trim();
  if (result.length > 0) return result;

  const words = clean.slice(0, maxChars + 1).split(' ');
  words.pop();
  return words.join(' ').trim().replace(/[,;:]$/, '');
}
