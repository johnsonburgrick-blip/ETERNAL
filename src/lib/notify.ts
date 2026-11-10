/**
 * Centralised admin notifications: in-app notification centre rows for the relevant
 * administrators plus (optionally) an email to ADMIN_NOTIFY_EMAIL (support@…).
 * Never throws: a failed notification must not break the action that triggered it.
 */
import type { Env, Role } from '../env';
import { queueEmail } from '../email/send';

export interface AdminNotice {
  type: 'application_new' | 'application_assigned' | 'applicant_reply' | 'application_attention' | 'publication_due' | 'content_published' | 'security' | 'form_submission';
  title: string;
  body?: string;
  link?: string;
  roles?: Role[];          // notify all active admins with these roles
  userIds?: number[];      // and/or these users
  excludeUserId?: number;  // usually the actor
  email?: { template: string; dedupeKey: string; vars: Record<string, any>; applicationId?: number | null };
}

export async function notifyAdmins(env: Env, ctx: ExecutionContext, n: AdminNotice): Promise<void> {
  try {
    const ids = new Set<number>(n.userIds ?? []);
    if (n.roles?.length) {
      const r = await env.DB.prepare(`SELECT id FROM users WHERE status = 'active' AND role IN (${n.roles.map(() => '?').join(',')})`)
        .bind(...n.roles)
        .all<{ id: number }>();
      r.results.forEach((x) => ids.add(x.id));
    }
    if (n.excludeUserId) ids.delete(n.excludeUserId);
    if (ids.size) {
      const ts = Date.now();
      await env.DB.batch(
        [...ids].map((uid) =>
          env.DB.prepare('INSERT INTO admin_notifications (user_id, type, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
            uid, n.type, n.title.slice(0, 200), (n.body ?? '').slice(0, 1000), n.link ?? '', ts,
          ),
        ),
      );
    }
  } catch (e) {
    console.error('notify: in-app notification failed', String(e));
  }
  if (n.email) {
    const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
    await queueEmail(env, ctx, {
      dedupeKey: n.email.dedupeKey,
      template: n.email.template,
      to: env.ADMIN_NOTIFY_EMAIL,
      locale: 'en',
      applicationId: n.email.applicationId ?? null,
      vars: { link: n.link ? base + n.link : '', ...n.email.vars },
    });
  }
}

export async function audit(env: Env, userId: number | null, action: string, entityType = '', entityId: string | number = '', detail = '', ip = '') {
  try {
    await env.DB.prepare('INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(userId, action, entityType, String(entityId), detail.slice(0, 2000), ip, Date.now())
      .run();
  } catch (e) {
    console.error('audit: write failed', action, String(e));
  }
}
