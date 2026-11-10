import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { can } from '../../lib/auth';
import { DAY, toCsv } from '../../lib/util';
import { Badge, Card, Empty, Time, statusLabel } from '../../views/admin/ui';
import { back, form, intParam, logAction, page } from './common';

// ───────── Reports ─────────
export const reports = new Hono<AppEnv>();

function Bars({ rows, label }: { rows: { k: string; n: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <table class="bars" aria-label={label}>
      <tbody>
        {rows.map((r) => (
          <tr><th scope="row">{r.k}</th><td><span class="bar" style={`--w:${Math.round((r.n / max) * 100)}%`} /><span class="bar-n">{r.n}</span></td></tr>
        ))}
      </tbody>
    </table>
  );
}

reports.get('/', async (c) => {
  const u = c.get('user');
  const db = c.env.DB;
  const apps = can(u, 'reports');
  const since = Date.now() - 365 * DAY;
  const monthly = apps ? (await db.prepare("SELECT strftime('%Y-%m', created_at / 1000, 'unixepoch') AS k, COUNT(*) AS n FROM applications WHERE created_at > ? AND email_verified_at IS NOT NULL GROUP BY k ORDER BY k").bind(since).all<any>()).results : [];
  const byStatus = apps ? (await db.prepare('SELECT status AS k, COUNT(*) AS n FROM applications WHERE email_verified_at IS NOT NULL GROUP BY status ORDER BY n DESC').all<any>()).results : [];
  const review = apps ? await db.prepare("SELECT COUNT(*) AS n, AVG(decided_at - created_at) AS avg_ms, MIN(decided_at - created_at) AS min_ms, MAX(decided_at - created_at) AS max_ms FROM applications WHERE decided_at IS NOT NULL AND status IN ('ACCEPTED','DECLINED')").first<any>() : null;
  const byCountry = apps ? (await db.prepare('SELECT country AS k, COUNT(*) AS n FROM applications WHERE email_verified_at IS NOT NULL GROUP BY country ORDER BY n DESC LIMIT 10').all<any>()).results : [];
  const emails = apps ? (await db.prepare('SELECT status AS k, COUNT(*) AS n FROM email_logs WHERE created_at > ? GROUP BY status').bind(Date.now() - 30 * DAY).all<any>()).results : [];
  const content = (await db.prepare("SELECT action AS k, COUNT(*) AS n FROM audit_logs WHERE created_at > ? AND (action LIKE 'page.%' OR action LIKE 'article.%' OR action LIKE 'collection.%' OR action LIKE 'media.%') GROUP BY action ORDER BY n DESC").bind(Date.now() - 30 * DAY).all<any>()).results;
  const topArticles = (await db.prepare("SELECT id, title, views, published_at FROM articles WHERE status = 'published' ORDER BY views DESC LIMIT 10").all<any>()).results;
  const analytics = await db.prepare("SELECT value FROM site_settings WHERE key = 'analyticsToken'").first<{ value: string }>();
  const days = (ms: number | null) => (ms ? `${(ms / DAY).toFixed(1)} days` : '—');

  return page(c, { title: 'Reports', active: 'reports', actions: apps ? <a class="btn small" href="/admin/reports/export/monthly.csv">Export CSV</a> : undefined }, (
    <>
      {apps ? (
        <div class="cols">
          <Card title="Applications per month (confirmed)">{monthly.length ? <Bars rows={monthly} label="Applications per month" /> : <Empty>No data yet.</Empty>}</Card>
          <Card title="Status breakdown">{byStatus.length ? <Bars rows={byStatus.map((r: any) => ({ k: statusLabel(r.k), n: r.n }))} label="Status breakdown" /> : <Empty>No data yet.</Empty>}</Card>
          <Card title="Review times (accepted & declined)">
            <p class="kv"><span>Decisions</span><strong>{review?.n ?? 0}</strong></p>
            <p class="kv"><span>Average time to decision</span><strong>{days(review?.avg_ms)}</strong></p>
            <p class="kv"><span>Fastest</span><strong>{days(review?.min_ms)}</strong></p>
            <p class="kv"><span>Slowest</span><strong>{days(review?.max_ms)}</strong></p>
          </Card>
          <Card title="Top countries">{byCountry.length ? <Bars rows={byCountry} label="Top countries" /> : <Empty>No data yet.</Empty>}</Card>
          <Card title="Email delivery (30 days)">{emails.length ? <Bars rows={emails} label="Email delivery" /> : <Empty>No emails yet.</Empty>}</Card>
        </div>
      ) : null}
      <div class="cols">
        <Card title="Website content activity (30 days)">{content.length ? <Bars rows={content} label="Content activity" /> : <Empty>No changes recorded.</Empty>}</Card>
        <Card title="Publication performance (human page views)">
          {topArticles.length ? <ul class="list compact">{topArticles.map((a) => <li><a href={`/admin/content/articles/${a.id}`}>{a.title}</a><span class="muted small">{a.views} views · <Time ts={a.published_at} /></span></li>)}</ul> : <Empty>No published articles.</Empty>}
          <p class="help">Counts exclude bots and crawlers.</p>
        </Card>
        <Card title="Website traffic">
          {analytics && JSON.parse(analytics.value || '""') ? (
            <p>Cookieless Cloudflare Web Analytics is enabled. View traffic in the Cloudflare dashboard → Analytics & Logs → Web Analytics.</p>
          ) : <p>No analytics provider configured. Add a Cloudflare Web Analytics token (privacy-friendly, no cookies) in <a href="/admin/settings">Settings</a>.</p>}
        </Card>
      </div>
    </>
  ));
});

reports.get('/export/monthly.csv', async (c) => {
  if (!can(c.get('user'), 'reports')) return c.text('Forbidden', 403);
  const rows = (await c.env.DB.prepare("SELECT strftime('%Y-%m', created_at / 1000, 'unixepoch') AS month, status, COUNT(*) AS n FROM applications WHERE email_verified_at IS NOT NULL GROUP BY month, status ORDER BY month, status").all<any>()).results;
  await logAction(c, 'report.export', 'report', 'monthly');
  return c.body(toCsv([['month', 'status', 'applications'], ...rows.map((r) => [r.month, r.status, r.n])]), 200, {
    'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="application-statistics.csv"', 'cache-control': 'no-store',
  });
});

// ───────── Inbox: contact & report submissions ─────────
export const inbox = new Hono<AppEnv>();

inbox.get('/', async (c) => {
  const kind = c.req.query('kind') === 'report' ? 'report' : c.req.query('kind') === 'contact' ? 'contact' : '';
  const rows = (await c.env.DB.prepare(`SELECT id, kind, name, email, subject, status, created_at FROM form_submissions ${kind ? 'WHERE kind = ?' : ''} ORDER BY created_at DESC LIMIT 100`).bind(...(kind ? [kind] : [])).all<any>()).results;
  return page(c, { title: 'Inbox', active: 'inbox' }, (
    <>
      <div class="tabs"><a href="/admin/inbox" aria-current={!kind ? 'page' : undefined}>All</a><a href="/admin/inbox?kind=contact" aria-current={kind === 'contact' ? 'page' : undefined}>Contact</a><a href="/admin/inbox?kind=report" aria-current={kind === 'report' ? 'page' : undefined}>Reports</a></div>
      {rows.length ? (
        <ul class="list cards">{rows.map((m) => <li><a class="list-row" href={`/admin/inbox/${m.id}`}><span><strong>{m.subject}</strong><span class="muted small">{m.kind} · {m.name} · <Time ts={m.created_at} /></span></span><Badge status={m.status} /></a></li>)}</ul>
      ) : <Empty>No messages.</Empty>}
    </>
  ));
});

inbox.get('/:id{[0-9]+}', async (c) => {
  const m = await c.env.DB.prepare('SELECT * FROM form_submissions WHERE id = ?').bind(intParam(c, 'id')).first<any>();
  if (!m) return back(c, '/admin/inbox', { error: 'Not found.' });
  return page(c, { title: m.subject, active: 'inbox', back: { href: '/admin/inbox', label: 'Inbox' } }, (
    <Card title={m.kind === 'report' ? 'Issue report' : 'Contact message'} actions={<Badge status={m.status} />}>
      <p class="kv"><span>From</span><span>{m.name} · <a href={`mailto:${m.email}?subject=${encodeURIComponent('Re: ' + m.subject)}`}>{m.email}</a></span></p>
      <p class="kv"><span>Received</span><Time ts={m.created_at} /></p>
      {m.page_url ? <p class="kv"><span>Page</span><span>{m.page_url}</span></p> : null}
      <p class="message-body">{m.message}</p>
      <div class="row wrap">
        <a class="btn primary" href={`mailto:${m.email}?subject=${encodeURIComponent('Re: ' + m.subject)}`}>Reply by email</a>
        <form method="post" action={`/admin/inbox/${m.id}/toggle`}><button class="btn" type="submit">{m.status === 'new' ? 'Mark handled' : 'Mark as new'}</button></form>
        <form method="post" action={`/admin/inbox/${m.id}/delete`} data-confirm="Delete this message permanently?"><button class="btn danger" type="submit">Delete</button></form>
      </div>
    </Card>
  ));
});

inbox.post('/:id{[0-9]+}/toggle', async (c) => {
  await c.env.DB.prepare("UPDATE form_submissions SET status = CASE status WHEN 'new' THEN 'handled' ELSE 'new' END WHERE id = ?").bind(intParam(c, 'id')).run();
  return back(c, `/admin/inbox/${intParam(c, 'id')}`, { ok: 'Updated.' });
});

inbox.post('/:id{[0-9]+}/delete', async (c) => {
  await form(c);
  await c.env.DB.prepare('DELETE FROM form_submissions WHERE id = ?').bind(intParam(c, 'id')).run();
  await logAction(c, 'inbox.delete', 'form_submission', intParam(c, 'id'));
  return back(c, '/admin/inbox', { ok: 'Message deleted.' });
});
