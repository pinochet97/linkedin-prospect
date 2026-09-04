/**
 * Identidade de um lead. A URL normalizada do perfil é a chave única global —
 * a mesma pessoa nunca vira duas linhas em `leads`.
 */

const PROFILE_PATH = /\/in\/([^/?#]+)/i;

/**
 * Normaliza uma URL de perfil para a forma canônica:
 *   https://www.linkedin.com/in/<slug>
 *
 * Aceita subdomínios de país (br.linkedin.com), querystrings de tracking,
 * barras finais e URLs sem protocolo. Devolve `null` se não for um perfil.
 */
export function normalizeLinkedInUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;

  const match = PROFILE_PATH.exec(url.pathname);
  if (!match) return null;

  let slug: string;
  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    slug = match[1];
  }
  slug = slug.trim().toLowerCase();
  if (!slug) return null;

  return `https://www.linkedin.com/in/${slug}`;
}

/** O slug público (`/in/<slug>`), útil como identidade secundária. */
export function extractPublicId(input: string | null | undefined): string | null {
  const normalized = normalizeLinkedInUrl(input);
  if (!normalized) return null;
  return normalized.slice('https://www.linkedin.com/in/'.length);
}

export function isSameLead(a: string, b: string): boolean {
  const left = normalizeLinkedInUrl(a);
  const right = normalizeLinkedInUrl(b);
  return left !== null && left === right;
}

/** Remove duplicatas de uma lista de perfis descobertos, preservando a ordem. */
export function dedupeByProfileUrl<T extends { linkedinUrl: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = normalizeLinkedInUrl(item.linkedinUrl);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ ...item, linkedinUrl: key });
  }
  return result;
}

/** "Kaio Guerreiro da Silva" -> "Kaio". Ignora emojis e credenciais no nome. */
export function firstNameOf(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const cleaned = fullName
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, ' ')
    .replace(/\s*[|,–—-]\s*.*$/u, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const first = cleaned.split(' ')[0] ?? '';
  return first.length > 0 ? first : null;
}
