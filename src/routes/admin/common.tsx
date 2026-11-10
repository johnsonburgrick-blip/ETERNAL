import type { Context } from 'hono';
import type { Child } from 'hono/jsx';
import type { AppEnv } from '../../env';
import { audit } from '../../lib/notify';
import { clientIp } from '../../lib/util';
import { invalidateAndRebuild } from '../../snapshot/snapshot';
import { AdminLayout, flashFrom, type AdminPageProps } from '../../views/admin/ui';

export type C = Context<AppEnv>;

export async function page(c: C, props: Omit<AdminPageProps, 'user' | 'unread' | 'children'> & { flash?: AdminPageProps['flash'] }, body: Child, status = 200) {
  const user = c.get('user');
  let unread = 0;
  if (user) {
    try {
      unread = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM admin_notifications WHERE user_id = ? AND read_at IS NULL').bind(user.id).first<{ n: number }>())?.n ?? 0;
    } catch {
      /* ignore */
    }
  }
  c.header('cache-control', 'no-store');
  return c.html(<AdminLayout {...props} user={user} unread={unread} flash={props.flash ?? flashFrom(c.req.url)}>{body}</AdminLayout>, status as any);
}

export function back(c: C, path: string, msg?: { ok?: string; error?: string }) {
  const u = new URL(path, c.req.url);
  if (msg?.ok) u.searchParams.set('ok', msg.ok);
  if (msg?.error) u.searchParams.set('error', msg.error);
  return c.redirect(u.pathname + u.search, 303);
}

export async function form(c: C): Promise<Record<string, string>> {
  const fd = await c.req.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === 'string') out[k] = v;
  return out;
}

export async function logAction(c: C, action: string, entityType = '', entityId: string | number = '', detail = '') {
  await audit(c.env, c.get('user')?.id ?? null, action, entityType, entityId, detail, clientIp(c.req.raw));
}

/** After any write to public content: rebuild the snapshot immediately + audit. */
export async function contentChanged(c: C, action: string, entityType: string, entityId: string | number, detail = '') {
  await logAction(c, action, entityType, entityId, detail);
  const ok = await invalidateAndRebuild(c.env);
  if (!ok) console.error('snapshot rebuild after admin write failed');
  return ok;
}

export const intParam = (c: C, name: string) => {
  const n = parseInt(c.req.param(name) ?? '', 10);
  return Number.isFinite(n) ? n : 0;
};
