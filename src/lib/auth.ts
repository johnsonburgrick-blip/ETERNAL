import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AdminUser, AppEnv, Env, Role } from '../env';
import { clientIp, randomToken, sha256Hex } from './util';
import { isSameOrigin } from './guard';

/**
 * Admin sessions: a random 256-bit token lives only in an HttpOnly, Secure,
 * SameSite=Strict cookie; the database stores only its SHA-256 hash. Sessions expire
 * after IDLE_MS without activity or ABSOLUTE_MS after login, whichever comes first.
 * Logout and expiry delete the row.
 */
export const SESSION_COOKIE = '__Host-eic_admin';
export const IDLE_MS = 2 * 3600_000;
export const ABSOLUTE_MS = 12 * 3600_000;
const TOUCH_EVERY_MS = 5 * 60_000;

export async function createSession(c: Context<AppEnv>, userId: number, mfaPending: boolean): Promise<void> {
  const token = randomToken(32);
  const ts = Date.now();
  await c.env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, mfa_pending, ip, user_agent, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(await sha256Hex(token), userId, mfaPending ? 1 : 0, clientIp(c.req.raw), (c.req.header('user-agent') ?? '').slice(0, 300), ts, ts, ts + ABSOLUTE_MS)
    .run();
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'Strict', path: '/', maxAge: ABSOLUTE_MS / 1000 });
}

export interface SessionInfo { user: AdminUser; mfaPending: boolean }

export async function readSession(c: Context<AppEnv>): Promise<SessionInfo | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || token.length > 100) return null;
  const hash = await sha256Hex(token);
  const row = await c.env.DB.prepare(
    `SELECT s.id AS sid, s.mfa_pending, s.last_seen_at, s.expires_at, u.id, u.email, u.display_name, u.role, u.status, u.totp_secret
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
  )
    .bind(hash)
    .first<any>();
  if (!row) return null;
  const t = Date.now();
  if (row.expires_at < t || t - row.last_seen_at > IDLE_MS || row.status !== 'active') {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(row.sid).run();
    deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true });
    return null;
  }
  if (t - row.last_seen_at > TOUCH_EVERY_MS) {
    c.executionCtx.waitUntil(c.env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(t, row.sid).run());
  }
  return {
    mfaPending: !!row.mfa_pending,
    user: { id: row.id, email: row.email, display_name: row.display_name, role: row.role, totp_enabled: !!row.totp_secret, session_id: row.sid },
  };
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true });
}

// ───────────── Roles & permissions ─────────────
export type Permission =
  | 'applications.view_all' | 'applications.review' | 'applications.assign' | 'applications.delete' | 'applications.export'
  | 'content' | 'media' | 'forms' | 'emails.templates' | 'emails.logs' | 'emails.broadcast'
  | 'reports' | 'reports.content' | 'settings' | 'users' | 'security' | 'backups';

const ROLE_PERMS: Record<Role, Permission[] | '*'> = {
  super_admin: '*',
  content_admin: ['content', 'media', 'reports.content'],
  // Reviewers see and act on applications assigned to them.
  reviewer: ['applications.review'],
};

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Administrator',
  content_admin: 'Content Administrator',
  reviewer: 'Application Reviewer',
};

export function can(user: Pick<AdminUser, 'role'>, perm: Permission): boolean {
  const p = ROLE_PERMS[user.role];
  return p === '*' || p.includes(perm);
}

/** Middleware: must be logged in (MFA complete). Applies the same-origin check to every write. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!['GET', 'HEAD'].includes(c.req.method) && !isSameOrigin(c.req.raw)) {
    return c.text('Cross-origin request blocked.', 403);
  }
  const s = await readSession(c);
  if (!s) {
    const back = encodeURIComponent(new URL(c.req.url).pathname);
    return c.redirect(`/admin/login?next=${back}`, 303);
  }
  if (s.mfaPending) return c.redirect('/admin/login/mfa', 303);
  c.set('user', s.user);
  await next();
};

export function requirePerm(...perms: Permission[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const u = c.get('user');
    if (!perms.some((p) => can(u, p))) return c.text('You do not have permission to access this area.', 403);
    await next();
  };
}

export function pepperOf(env: Env): string | null {
  return env.AUTH_PEPPER && env.AUTH_PEPPER.length >= 32 ? env.AUTH_PEPPER : null;
}
