import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getConfig } from '@/lib/config';
import { SESSION_COOKIE } from '@/lib/auth-cookie';

/**
 * Autenticação mínima: uma única conta admin, senha no ambiente, cookie
 * assinado. Uso interno, uma pessoa — nada de usuários, papéis ou convites.
 */

export { SESSION_COOKIE };
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sign(payload: string): string {
  return createHmac('sha256', getConfig().APP_SECRET).update(payload).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function checkPassword(password: string): boolean {
  return safeEqual(password, getConfig().ADMIN_PASSWORD);
}

export function createSessionToken(now: Date = new Date()): string {
  const expiresAt = String(now.getTime() + SESSION_TTL_MS);
  return `${expiresAt}.${sign(expiresAt)}`;
}

export function verifySessionToken(token: string | undefined, now: Date = new Date()): boolean {
  if (!token) return false;
  const [expiresAt, signature] = token.split('.');
  if (!expiresAt || !signature) return false;
  if (!safeEqual(signature, sign(expiresAt))) return false;
  return Number(expiresAt) > now.getTime();
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** Portão usado pelo layout autenticado. */
export async function requireAuth(): Promise<void> {
  if (!(await isAuthenticated())) redirect('/login');
}

export async function startSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
