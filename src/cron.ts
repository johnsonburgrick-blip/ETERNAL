/**
 * Scheduled jobs.
 *
 * Rule for anything written on a timer: the job publishes its result to its own R2
 * object (cache/timer/<key>.json) and only writes a database row when the value
 * actually changed. Today the only timer value is the publication scheduler's state;
 * any future cron job that fetches external data must use publishTimerValue() too.
 */
import type { Env } from './env';
import { notifyAdmins } from './lib/notify';
import { DAY, HOUR, MINUTE } from './lib/util';
import { retryLoggedEmail } from './email/send';
import { invalidateAndRebuild, peekR2Snapshot } from './snapshot/snapshot';
import { loadScheduledArticles } from './snapshot/source';
import { buildSqlDump } from './lib/backup';

export async function publishTimerValue(env: Env, key: string, value: unknown): Promise<boolean> {
  const objKey = `cache/timer/${key}.json`;
  const body = JSON.stringify(value);
  let previous: string | null = null;
  try {
    previous = (await (await env.BUCKET.get(objKey))?.text()) ?? null;
  } catch {
    /* treat as changed */
  }
  await env.BUCKET.put(objKey, JSON.stringify({ value, publishedAt: Date.now() }), { httpMetadata: { contentType: 'application/json' } });
  const prevValue = previous ? JSON.stringify(JSON.parse(previous).value) : null;
  if (prevValue === body) return false; // unchanged → no DB write
  await env.DB.prepare('INSERT INTO timer_values (key, value_json, changed_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, changed_at = excluded.changed_at')
    .bind(key, body, Date.now())
    .run();
  return true;
}

/** Every 5 minutes: flip due scheduled articles to published (reading the snapshot, not D1). */
export async function runScheduler(env: Env, ctx: ExecutionContext) {
  const t = Date.now();
  const snap = await peekR2Snapshot(env);
  const scheduled = snap
    ? snap.articles.filter((a) => a.status === 'scheduled' && a.publishAt).map((a) => ({ id: a.id, slug: a.slug, title: a.title, publishAt: a.publishAt! }))
    : await loadScheduledArticles(env);
  const due = scheduled.filter((a) => a.publishAt <= t);
  let changed = 0;
  for (const a of due) {
    const r = await env.DB.prepare("UPDATE articles SET status = 'published', published_at = COALESCE(published_at, publish_at), updated_at = ? WHERE id = ? AND status = 'scheduled'").bind(t, a.id).run();
    if (r.meta.changes) {
      changed++;
      await notifyAdmins(env, ctx, { type: 'publication_due', title: `Scheduled article published: ${a.title}`, link: `/admin/content/articles/${a.id}`, roles: ['super_admin', 'content_admin'] });
    }
  }
  if (changed) await invalidateAndRebuild(env);
  const upcoming = scheduled.filter((a) => a.publishAt > t).sort((a, b) => a.publishAt - b.publishAt);
  await publishTimerValue(env, 'scheduler', { pending: upcoming.length, next: upcoming[0]?.publishAt ?? null });
}

/** Every 5 minutes: retry transient email failures and emails stuck mid-send. */
export async function retryEmails(env: Env) {
  const rows = (
    await env.DB.prepare(
      `SELECT id FROM email_logs WHERE attempts < 5 AND created_at > ? AND (
         (status = 'failed' AND (error LIKE 'network%' OR error LIKE 'HTTP 5%' OR error LIKE 'HTTP 429%'))
         OR (status IN ('queued','sending') AND updated_at < ?)) ORDER BY created_at LIMIT 20`,
    )
      .bind(Date.now() - 2 * DAY, Date.now() - 10 * MINUTE)
      .all<{ id: number }>()
  ).results;
  for (const r of rows) await retryLoggedEmail(env, r.id);
}

/** Daily: cleanup, retention housekeeping and backup. */
export async function runDaily(env: Env, ctx: ExecutionContext) {
  const t = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ? OR last_seen_at < ?').bind(t, t - 2 * HOUR),
    env.DB.prepare('DELETE FROM rate_events WHERE created_at < ?').bind(t - DAY),
    env.DB.prepare('DELETE FROM auth_tokens WHERE expires_at < ?').bind(t),
    env.DB.prepare('DELETE FROM applicant_actions WHERE expires_at < ?').bind(t),
    env.DB.prepare('DELETE FROM admin_notifications WHERE read_at IS NOT NULL AND read_at < ?').bind(t - 90 * DAY),
  ]);

  // Unconfirmed applications are deleted after 7 days (the applicant was told so).
  const stale = (await env.DB.prepare('SELECT id FROM applications WHERE email_verified_at IS NULL AND created_at < ? LIMIT 200').bind(t - 7 * DAY).all<{ id: number }>()).results;
  for (const s of stale) {
    const docs = (await env.DB.prepare('SELECT r2_key FROM application_documents WHERE application_id = ?').bind(s.id).all<{ r2_key: string }>()).results;
    if (docs.length) await env.BUCKET.delete(docs.map((d) => d.r2_key));
    await env.DB.prepare('DELETE FROM applications WHERE id = ?').bind(s.id).run();
  }

  // Retention reminder
  const ret = await env.DB.prepare("SELECT value FROM site_settings WHERE key = 'retentionDays'").first<{ value: string }>();
  const days = Number(ret?.value ?? 730) || 730;
  const expired = (await env.DB.prepare("SELECT COUNT(*) AS n FROM applications WHERE status IN ('ACCEPTED','DECLINED','WITHDRAWN') AND decided_at < ?").bind(t - days * DAY).first<{ n: number }>())?.n ?? 0;
  if (expired) await notifyAdmins(env, ctx, { type: 'application_attention', title: `${expired} application record(s) past the retention period`, link: '/admin/applications?retention=expired&verified=all', roles: ['super_admin'] });

  // Backup to private R2 storage; keep 30 days
  const sql = await buildSqlDump(env);
  await env.BUCKET.put(`backups/${new Date().toISOString().replace(/[:.]/g, '-')}-nightly.sql`, sql, { httpMetadata: { contentType: 'application/sql' } });
  const list = await env.BUCKET.list({ prefix: 'backups/', limit: 1000 });
  const old = list.objects.filter((o) => o.uploaded.getTime() < t - 30 * DAY).map((o) => o.key);
  if (old.length) await env.BUCKET.delete(old);
  console.log(`daily: removed ${stale.length} unconfirmed applications, backup ${sql.length} bytes, pruned ${old.length} old backups`);
}

export async function scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
  if (event.cron === '17 3 * * *') {
    await runDaily(env, ctx);
    return;
  }
  await runScheduler(env, ctx);
  await retryEmails(env);
}
