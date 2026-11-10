import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { can } from '../../lib/auth';
import { clampStr, DAY } from '../../lib/util';
import { TEMPLATE_DEFS } from '../../email/defaults';
import { loadSettingsForEmail, queueEmail, renderEmail, resolveTemplate, retryLoggedEmail } from '../../email/send';
import { Badge, Card, ConfirmForm, Empty, Field, Pager, Select, Time } from '../../views/admin/ui';
import { back, intParam, logAction, page } from './common';

const r = new Hono<AppEnv>();
const LOCALES = ['en', 'fr', 'es'];

r.get('/', async (c) => {
  const u = c.get('user');
  const overrides = (await c.env.DB.prepare('SELECT key, locale, updated_at FROM email_templates').all<any>()).results;
  const stats = (await c.env.DB.prepare('SELECT status, COUNT(*) AS n FROM email_logs WHERE created_at > ? GROUP BY status').bind(Date.now() - 30 * DAY).all<any>()).results;
  const s = Object.fromEntries(stats.map((x) => [x.status, x.n]));
  const configured = !!c.env.RESEND_API_KEY;
  return page(c, { title: 'Emails', active: 'emails', actions: <a class="btn small primary" href="/admin/emails/compose">Compose</a> }, (
    <>
      <Card title="Delivery (last 30 days)" actions={can(u, 'emails.logs') ? <a href="/admin/emails/logs">Delivery log</a> : undefined}>
        <div class="stats small">
          <a class="stat ok" href="/admin/emails/logs?status=sent"><span class="stat-value">{s.sent ?? 0}</span><span class="stat-label">Sent</span></a>
          <a class="stat bad" href="/admin/emails/logs?status=failed"><span class="stat-value">{s.failed ?? 0}</span><span class="stat-label">Failed</span></a>
          <a class="stat warn" href="/admin/emails/logs?status=skipped"><span class="stat-value">{s.skipped ?? 0}</span><span class="stat-label">Not sent</span></a>
          <a class="stat info" href="/admin/emails/logs?status=queued"><span class="stat-value">{(s.queued ?? 0) + (s.sending ?? 0)}</span><span class="stat-label">In progress</span></a>
        </div>
        <p class="kv"><span>Sender</span><code>{c.env.EMAIL_FROM_NAME} &lt;{c.env.EMAIL_FROM}&gt;</code></p>
        <p class="kv"><span>Reply-To</span><code>{c.env.EMAIL_REPLY_TO}</code></p>
        <p class="kv"><span>Admin notifications to</span><code>{c.env.ADMIN_NOTIFY_EMAIL}</code></p>
        <p class="kv"><span>Resend API key</span>{configured ? <Badge status="sent" label="Configured (secret)" /> : <Badge status="failed" label="Missing" />}</p>
        {!configured ? <p class="help">Set it once with <code>npx wrangler secret put RESEND_API_KEY</code>. Until then, emails are logged as "not sent".</p> : null}
      </Card>
      {can(u, 'emails.templates') ? (
        <Card title="Templates">
          <p class="help">Every template uses the branded layout with your logo. Edit the wording per language; placeholders like {'{{name}}'} are filled in automatically.</p>
          <ul class="list">
            {Object.entries(TEMPLATE_DEFS).map(([key, d]) => (
              <li class="list-row">
                <span><strong>{d.name}</strong><span class="muted small">{d.audience === 'admin' ? 'To administrators' : 'To applicants / visitors'} · {key}</span></span>
                <span class="row">{LOCALES.filter((l) => l === 'en' || d.audience === 'client').map((l) => <a class={`btn small ${overrides.some((o) => o.key === key && o.locale === l) ? '' : 'ghost'}`} href={`/admin/emails/templates/${key}/${l}`}>{l.toUpperCase()}</a>)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  ));
});

const sample: Record<string, string> = {
  name: 'Alex Morgan', reference: 'EIC-2026-ABC234', email: 'applicant@example.com', country: 'France', message: 'Example message text.\nSecond line.',
  subject: 'Example subject', link: 'https://yourdomain.com/example-link', role: 'Application Reviewer', kind: 'contact message', status: 'Under review',
};

r.get('/templates/:key/:locale', async (c) => {
  if (!can(c.get('user'), 'emails.templates')) return c.text('Forbidden', 403);
  const key = c.req.param('key');
  const locale = c.req.param('locale');
  const def = TEMPLATE_DEFS[key];
  if (!def || !LOCALES.includes(locale)) return back(c, '/admin/emails', { error: 'Unknown template.' });
  const row = await c.env.DB.prepare('SELECT * FROM email_templates WHERE key = ? AND locale = ?').bind(key, locale).first<any>();
  const t = await resolveTemplate(c.env, key, locale);
  const settings = await loadSettingsForEmail(c.env);
  const preview = await renderEmail(c.env, settings, key, locale, sample);
  return page(c, { title: def.name, active: 'emails', back: { href: '/admin/emails', label: 'Emails' }, wide: true }, (
    <div class="editor-split">
      <div class="editor-form">
        <Card title={`Edit (${locale.toUpperCase()})`}>
          {!row ? <p class="help">Showing the built-in default{locale !== 'en' && !(def as any)[locale] ? ' (English — no reviewed translation yet)' : ''}. Saving creates your own version.</p> : <p class="help">Customised <Time ts={row.updated_at} />.</p>}
          <form method="post" action={`/admin/emails/templates/${key}/${locale}`} class="stack">
            <Field label="Subject" name="subject" value={t.subject} required max={250} />
            <Field label="Heading" name="heading" value={t.heading} max={200} />
            <Field label="Body" name="body" type="markdown" value={t.body} required rows={14} help={`Available placeholders: ${['site_name', ...def.vars].map((v) => `{{${v}}}`).join(', ')}`} />
            <Field label="Button label (shown when a link is included)" name="button_label" value={t.button} max={60} />
            <div class="row wrap"><button class="btn primary" type="submit">Save template</button></div>
          </form>
          {row ? <ConfirmForm action={`/admin/emails/templates/${key}/${locale}/reset`} label="Revert to default" message="Delete your customised version and use the built-in default?" small /> : null}
          <form method="post" action={`/admin/emails/templates/${key}/${locale}/test`} class="inline"><button class="btn small" type="submit">Send a test to {c.get('user').email}</button></form>
        </Card>
      </div>
      <aside class="editor-preview">
        <p class="muted small">Preview with sample data · Subject: <strong>{preview.subject}</strong></p>
        <iframe class="email-preview" title="Email preview" srcdoc={preview.html} sandbox="" />
      </aside>
    </div>
  ));
});

r.post('/templates/:key/:locale', async (c) => {
  if (!can(c.get('user'), 'emails.templates')) return c.text('Forbidden', 403);
  const key = c.req.param('key');
  const locale = c.req.param('locale');
  const def = TEMPLATE_DEFS[key];
  if (!def || !LOCALES.includes(locale)) return back(c, '/admin/emails');
  const f = await c.req.parseBody();
  const subject = clampStr(f.subject, 250), body = clampStr(f.body, 20000);
  if (!subject || !body) return back(c, `/admin/emails/templates/${key}/${locale}`, { error: 'Subject and body are required.' });
  await c.env.DB.prepare(
    `INSERT INTO email_templates (key, locale, name, audience, subject, heading, body, button_label, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key, locale) DO UPDATE SET subject = excluded.subject, heading = excluded.heading, body = excluded.body, button_label = excluded.button_label, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  )
    .bind(key, locale, def.name, def.audience, subject, clampStr(f.heading, 200), body, clampStr(f.button_label, 60), c.get('user').id, Date.now())
    .run();
  await logAction(c, 'email_template.save', 'email_template', `${key}/${locale}`);
  return back(c, `/admin/emails/templates/${key}/${locale}`, { ok: 'Template saved.' });
});

r.post('/templates/:key/:locale/reset', async (c) => {
  await c.env.DB.prepare('DELETE FROM email_templates WHERE key = ? AND locale = ?').bind(c.req.param('key'), c.req.param('locale')).run();
  await logAction(c, 'email_template.reset', 'email_template', `${c.req.param('key')}/${c.req.param('locale')}`);
  return back(c, `/admin/emails/templates/${c.req.param('key')}/${c.req.param('locale')}`, { ok: 'Reverted to the default.' });
});

r.post('/templates/:key/:locale/test', async (c) => {
  const key = c.req.param('key');
  if (!TEMPLATE_DEFS[key]) return back(c, '/admin/emails');
  await queueEmail(c.env, c.executionCtx as ExecutionContext, { dedupeKey: `test:${key}:${c.req.param('locale')}:${Date.now()}`, template: key, to: c.get('user').email, locale: c.req.param('locale'), vars: sample });
  await logAction(c, 'email.test', 'email_template', key);
  return back(c, `/admin/emails/templates/${key}/${c.req.param('locale')}`, { ok: `Test email queued to ${c.get('user').email}. Check the delivery log for its status.` });
});

// ───────── Delivery log ─────────
r.get('/logs', async (c) => {
  if (!can(c.get('user'), 'emails.logs')) return c.text('Forbidden', 403);
  const q = new URL(c.req.url).searchParams;
  const pg = Math.max(1, parseInt(q.get('page') ?? '1', 10) || 1);
  const status = q.get('status') ?? '';
  const valid = ['queued', 'sending', 'sent', 'failed', 'skipped'].includes(status);
  const rows = (await c.env.DB.prepare(`SELECT id, template_key, category, to_email, subject, status, error, attempts, application_id, created_at, updated_at FROM email_logs ${valid ? 'WHERE status = ?' : ''} ORDER BY created_at DESC LIMIT 51 OFFSET ?`)
    .bind(...(valid ? [status] : []), (pg - 1) * 50).all<any>()).results;
  return page(c, { title: 'Delivery log', active: 'emails', back: { href: '/admin/emails', label: 'Emails' } }, (
    <>
      <div class="tabs">{['', 'sent', 'failed', 'skipped', 'queued'].map((s) => <a href={`/admin/emails/logs${s ? `?status=${s}` : ''}`} aria-current={s === status ? 'page' : undefined}>{s || 'All'}</a>)}</div>
      {rows.length ? (
        <ul class="list cards">
          {rows.slice(0, 50).map((e) => (
            <li class="list-row">
              <span>
                <strong>{e.subject}</strong>
                <span class="muted small">To {e.to_email} · {e.template_key} · <Time ts={e.created_at} />{e.attempts > 1 ? ` · ${e.attempts} attempts` : ''}</span>
                {e.error ? <span class="error small">{e.error.slice(0, 200)}</span> : null}
                {e.application_id ? <a class="small" href={`/admin/applications/${e.application_id}`}>Open application</a> : null}
              </span>
              <span class="row"><Badge status={e.status} />{['failed', 'skipped'].includes(e.status) ? <form method="post" action={`/admin/emails/logs/${e.id}/retry`}><button class="btn small" type="submit">Retry</button></form> : null}</span>
            </li>
          ))}
        </ul>
      ) : <Empty>No emails.</Empty>}
      <Pager base="/admin/emails/logs" page={pg} hasMore={rows.length > 50} params={q} />
    </>
  ));
});

r.post('/logs/:id{[0-9]+}/retry', async (c) => {
  if (!can(c.get('user'), 'emails.logs')) return c.text('Forbidden', 403);
  const ok = await retryLoggedEmail(c.env, intParam(c, 'id'));
  await logAction(c, 'email.retry', 'email_log', intParam(c, 'id'), ok ? 'sent' : 'failed');
  return back(c, '/admin/emails/logs', ok ? { ok: 'Email sent.' } : { error: 'Sending failed again. See the error for details.' });
});

// ───────── Compose: correspondence & official announcements ─────────
r.get('/compose', async (c) => {
  const u = c.get('user');
  const broadcast = can(u, 'emails.broadcast');
  return page(c, { title: 'Send email', active: 'emails', back: { href: '/admin/emails', label: 'Emails' } }, (
    <>
      <Card title="Email one applicant">
        <form method="get" action="/admin/applications" class="row wrap">
          <input type="search" name="q" placeholder="Reference, name or email" aria-label="Find applicant" required />
          <button class="btn" type="submit">Find</button>
        </form>
        <p class="help">Open the application and use “Send email to applicant”. Every message is recorded in the application's correspondence history.</p>
      </Card>
      {broadcast ? (
        <Card title="Official announcement to a group">
          <form method="post" action="/admin/emails/compose" class="stack" data-confirm="Send this announcement to every applicant in the selected group?">
            <Select label="Recipients" name="group" options={[{ value: 'ACCEPTED', label: 'All accepted applicants' }, { value: 'PENDING', label: 'All applicants awaiting a decision' }]} />
            <Field label="Subject" name="subject" required max={200} />
            <Field label="Message" name="message" type="textarea" rows={8} required max={10000} />
            <Field label="Link (optional)" name="link" type="url" placeholder="https://yourdomain.com/announcements/…" />
            <button class="btn primary" type="submit">Send announcement</button>
          </form>
          <p class="help">Only applicants who confirmed their email address receive it. Each recipient receives an individual email; duplicates are prevented.</p>
        </Card>
      ) : null}
    </>
  ));
});

r.post('/compose', async (c) => {
  if (!can(c.get('user'), 'emails.broadcast')) return c.text('Forbidden', 403);
  const f = await c.req.parseBody();
  const subject = clampStr(f.subject, 200), message = clampStr(f.message, 10000), link = clampStr(f.link, 500);
  if (!subject || !message) return back(c, '/admin/emails/compose', { error: 'Subject and message are required.' });
  const statuses = f.group === 'ACCEPTED' ? ['ACCEPTED'] : ['NEW', 'PENDING_REVIEW', 'UNDER_REVIEW', 'INFORMATION_REQUESTED'];
  const recipients = (await c.env.DB.prepare(`SELECT id, full_name, email, locale FROM applications WHERE email_verified_at IS NOT NULL AND status IN (${statuses.map(() => '?').join(',')}) LIMIT 2000`).bind(...statuses).all<any>()).results;
  const batchId = crypto.randomUUID().slice(0, 8);
  for (const a of recipients) {
    await queueEmail(c.env, c.executionCtx as ExecutionContext, {
      dedupeKey: `announce:${batchId}:${a.id}`, template: 'announcement', to: a.email, locale: a.locale, applicationId: a.id,
      vars: { name: a.full_name, subject, message, link: /^https?:\/\//.test(link) ? link : '' },
    });
  }
  await logAction(c, 'email.broadcast', 'applications', recipients.length, subject);
  return back(c, '/admin/emails/logs', { ok: `Announcement queued for ${recipients.length} recipient(s).` });
});

export default r;
