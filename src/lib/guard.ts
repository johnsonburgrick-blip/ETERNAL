import type { Env } from '../env';
import { b64url, clientIp, hmacSha256, sha256Hex, timingSafeEqual } from './util';

// ───────────── Rate limiting (sliding window over rate_events) ─────────────
export async function rateCount(env: Env, bucket: string, key: string, windowMs: number): Promise<number> {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM rate_events WHERE bucket = ? AND key = ? AND created_at > ?')
    .bind(bucket, key, Date.now() - windowMs)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

export async function rateHit(env: Env, bucket: string, key: string): Promise<void> {
  await env.DB.prepare('INSERT INTO rate_events (bucket, key, created_at) VALUES (?, ?, ?)').bind(bucket, key, Date.now()).run();
}

/** Records a hit and returns true if the limit is exceeded (including this hit). */
export async function overLimit(env: Env, bucket: string, key: string, limit: number, windowMs: number): Promise<boolean> {
  const n = await rateCount(env, bucket, key, windowMs);
  if (n >= limit) return true;
  await rateHit(env, bucket, key);
  return false;
}

export async function ipKey(req: Request): Promise<string> {
  // store a hash, not the raw IP
  return (await sha256Hex('ip:' + clientIp(req))).slice(0, 32);
}

// ───────────── Public form protection ─────────────
export function formSecret(env: Env): string | null {
  return env.TOKEN_SECRET || env.AUTH_PEPPER || null;
}

/** Signed render timestamp embedded in public forms (blocks instant bot posts & replays after 24 h). */
export async function formTimerToken(env: Env, form: string): Promise<string> {
  const secret = formSecret(env);
  if (!secret) return '';
  const ts = Date.now().toString(36);
  const sig = b64url(await hmacSha256(secret, `${form}.${ts}`)).slice(0, 22);
  return `${ts}.${sig}`;
}

export type GuardResult = { ok: true } | { ok: false; reason: 'bot' | 'too_fast' | 'config' };

export async function checkPublicForm(env: Env, req: Request, form: string, data: FormData, minMs = 2500): Promise<GuardResult> {
  const secret = formSecret(env);
  if (!secret) return { ok: false, reason: 'config' };
  // honeypot: real users never see or fill this field
  if (String(data.get('website') ?? '').trim() !== '') return { ok: false, reason: 'bot' };
  const tok = String(data.get('_ft') ?? '');
  const [ts, sig] = tok.split('.');
  if (!ts || !sig) return { ok: false, reason: 'bot' };
  const expected = b64url(await hmacSha256(secret, `${form}.${ts}`)).slice(0, 22);
  if (!timingSafeEqual(expected, sig)) return { ok: false, reason: 'bot' };
  const age = Date.now() - parseInt(ts, 36);
  if (age < minMs) return { ok: false, reason: 'too_fast' };
  if (age > 7 * 24 * 3600_000) return { ok: false, reason: 'bot' };
  if (env.TURNSTILE_SECRET_KEY) {
    const token = String(data.get('cf-turnstile-response') ?? '');
    if (!token) return { ok: false, reason: 'bot' };
    try {
      const body = new FormData();
      body.append('secret', env.TURNSTILE_SECRET_KEY);
      body.append('response', token);
      body.append('remoteip', req.headers.get('cf-connecting-ip') ?? '');
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(8000) });
      const out = (await res.json()) as { success?: boolean };
      if (!out.success) return { ok: false, reason: 'bot' };
    } catch {
      return { ok: false, reason: 'bot' };
    }
  }
  return { ok: true };
}

// ───────────── Same-origin check for admin writes ─────────────
export function isSameOrigin(req: Request): boolean {
  const url = new URL(req.url);
  const origin = req.headers.get('origin');
  if (origin) return origin === url.origin;
  // Some browsers omit Origin on same-origin form posts; fall back to Fetch Metadata.
  const site = req.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin';
  const referer = req.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin === url.origin;
    } catch {
      return false;
    }
  }
  return false;
}
