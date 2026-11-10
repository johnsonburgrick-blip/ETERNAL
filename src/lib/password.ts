import { b64, fromB64, timingSafeEqual } from './util';

/**
 * Password hashing: PBKDF2-SHA256 (Web Crypto) with a per-user random salt and a
 * server-side "pepper" held in the AUTH_PEPPER Worker secret.
 *
 *   input = HMAC-SHA256(key = AUTH_PEPPER, message = password)
 *   hash  = PBKDF2-SHA256(input, salt, ITERATIONS, 256 bits)
 *
 * Because the pepper never lives in the database, a leaked database alone cannot be
 * brute-forced offline.
 *
 * ⚠ ROTATING AUTH_PEPPER INVALIDATES EVERY EXISTING PASSWORD. After a rotation nobody
 *   can log in; use the documented recovery (DEPLOY.md → "Locked out") to recreate the
 *   owner account, then re-invite the other administrators.
 *
 * Cloudflare Workers caps PBKDF2 at 100,000 iterations; we use the maximum. The
 * iteration count is stored per user so it can be raised later without breaking logins.
 */
export const PBKDF2_ITERATIONS = 100_000;
export const MIN_PASSWORD_LENGTH = 12;
const enc = new TextEncoder();

async function pepperInput(password: string, pepper: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', enc.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(password.normalize('NFKC')));
}

async function derive(password: string, pepper: string, salt: Uint8Array, iterations: number): Promise<string> {
  const material = await crypto.subtle.importKey('raw', await pepperInput(password, pepper), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, 256);
  return b64(bits);
}

export async function hashPassword(password: string, pepper: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, pepper, salt, PBKDF2_ITERATIONS);
  return { hash, salt: b64(salt), iterations: PBKDF2_ITERATIONS };
}

export async function verifyPassword(
  password: string,
  pepper: string,
  stored: { hash: string; salt: string; iterations: number },
): Promise<boolean> {
  const computed = await derive(password, pepper, fromB64(stored.salt), stored.iterations);
  return timingSafeEqual(computed, stored.hash);
}

/** Equalise timing when the account does not exist. */
export async function dummyVerify(password: string, pepper: string) {
  await derive(password, pepper, new Uint8Array(16), PBKDF2_ITERATIONS);
}

export function passwordProblems(pw: string, email = ''): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (pw.length > 256) return 'Password is too long.';
  if (email && pw.toLowerCase().includes(email.split('@')[0].toLowerCase()) && email.split('@')[0].length > 3)
    return 'Password must not contain your email name.';
  if (/^(.)\1+$/.test(pw)) return 'Password is too simple.';
  return null;
}
