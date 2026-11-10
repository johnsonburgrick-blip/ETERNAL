import { Hono } from 'hono';
import type { AppEnv, AdminUser } from '../../env';
import { countryName } from '../../i18n';
import { can, ROLE_LABELS } from '../../lib/auth';
import { notifyAdmins } from '../../lib/notify';
import { clampStr, DAY, parseJson, toCsv } from '../../lib/util';
import { queueEmail } from '../../email/send';
import { Badge, Card, Check, ConfirmForm, Empty, Field, Pager, Select, statusLabel, Time } from '../../views/admin/ui';
import { back, form, intParam, logAction, page, type C } from './common';
import { STATUSES } from './dashboard';

const r = new Hono<AppEnv>();
const PER_PAGE = 25;

const STATUS_EMAIL: Record<string, string | undefined> = {
  UNDER_REVIEW: 'application_under_review',
  INFORMATION_REQUESTED: 'application_info_requested',
  ACCEPTED: 'application_accepted',
  DECLINED: 'application_declined',
  WITHDRAWN: 'application_withdrawn',
};

async function retentionDays(c: C): Promise<number> {
  const r = await c.env.DB.prepare("SELECT value FROM site_settings WHERE key = 'retentionDays'").first<{ value: string }>();
  return parseJson(r?.value, 730);
}

function buildFilter(c: C, u: AdminUser, q: URLSearchParams, retention: number) {
  const where: string[] = [];
  const binds: any[] = [];
  if (!can(u, 'applications.view_all')) {
    where.push('a.assigned_to = ?');
    binds.push(u.id);
  }
  const status = q.get('status') ?? '';
  if (STATUSES.includes(status)) { where.push('a.status = ?'); binds.push(status); }
  const verified = q.get('verified') ?? 'yes';
  if (verified === 'yes') where.push('a.email_verified_at IS NOT NULL');
  if (verified === 'no') where.push('a.email_verified_at IS NULL');
  const assigned = q.get('assigned') ?? '';
  if (assigned === 'me') { where.push('a.assigned_to = ?'); binds.push(u.id); }
  if (assigned === 'none') where.push('a.assigned_to IS NULL');
  if (q.get('retention') === 'expired') {
    where.push("a.status IN ('ACCEPTED','DECLINED','WITHDRAWN') AND a.decided_at IS NOT NULL AND a.decided_at < ?");
    binds.push(Date.now() - retention * DAY);
  }
  const term = (q.get('q') ?? '').trim().slice(0, 100);
  if (term) {
    where.push('(instr(lower(a.full_name), lower(?)) > 0 OR instr(lower(a.email), lower(?)) > 0 OR instr(upper(a.reference), upper(?)) > 0)');
    binds.push(term, term, term);
  }
  const order = q.get('sort') === 'oldest' ? 'a.created_at ASC' : 'a.created_at DESC';
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', binds, order };
}

r.get('/', async (c) => {
  const u = c.get('user');
  const url = new URL(c.req.url);
  const q = url.searchParams;
  const retention = await retentionDays(c);
  const f = buildFilter(c, u, q, retention);

  if (q.get('format') === 'csv') {
    if (!can(u, 'applications.export')) return c.text('Forbidden', 403);
    const rows = (await c.env.DB.prepare(`SELECT a.*, us.display_name AS assignee FROM applications a LEFT JOIN users us ON us.id = a.assigned_to ${f.sql} ORDER BY ${f.order} LIMIT 10000`).bind(...f.binds).all<any>()).results;
    const keys = [...new Set(rows.flatMap((r) => Object.keys(parseJson<Record<string, string>>(r.answers_json, {}))))];
    const iso = (t: number | null) => (t ? new Date(t).toISOString() : '');
    const csv = toCsv([
      ['reference', 'status', 'full_name', 'email', 'country', 'locale', 'submitted_at', 'email_verified_at', 'decided_at', 'assigned_to', ...keys],
      ...rows.map((r) => {
        const a = parseJson<Record<string, string>>(r.answers_json, {});
        return [r.reference, r.status, r.full_name, r.email, r.country, r.locale, iso(r.created_at), iso(r.email_verified_at), iso(r.decided_at), r.assignee ?? '', ...keys.map((k) => a[k] ?? '')];
      }),
    ]);
    await logAction(c, 'application.export', 'applications', rows.length, q.toString());
    return c.body(csv, 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="applications-${new Date().toISOString().slice(0, 10)}.csv"`, 'cache-control': 'no-store' });
  }

  const pg = Math.max(1, parseInt(q.get('page') ?? '1', 10) || 1);
  const rows = (await c.env.DB.prepare(
    `SELECT a.id, a.reference, a.full_name, a.email, a.country, a.status, a.created_at, a.email_verified_at, us.display_name AS assignee
       FROM applications a LEFT JOIN users us ON us.id = a.assigned_to ${f.sql} ORDER BY ${f.order} LIMIT ? OFFSET ?`,
  ).bind(...f.binds, PER_PAGE + 1, (pg - 1) * PER_PAGE).all<any>()).results;
  const hasMore = rows.length > PER_PAGE;
  const exportQ = new URLSearchParams(q);
  exportQ.set('format', 'csv');
  exportQ.delete('page');

  return page(c, {
    title: 'Applications', active: 'applications',
    actions: can(u, 'applications.export') ? <a class="btn small" href={`/admin/applications?${exportQ}`}>Export CSV</a> : undefined,
  }, (
    <>
      <form class="filters" method="get" action="/admin/applications">
        <input type="search" name="q" value={q.get('q') ?? ''} placeholder="Search name, email or reference" aria-label="Search applications" />
        <select name="status" aria-label="Status"><option value="">All statuses</option>{STATUSES.map((s) => <option value={s} selected={q.get('status') === s}>{statusLabel(s)}</option>)}</select>
        {can(u, 'applications.view_all') ? (
          <select name="assigned" aria-label="Assignment"><option value="">Anyone</option><option value="me" selected={q.get('assigned') === 'me'}>Assigned to me</option><option value="none" selected={q.get('assigned') === 'none'}>Unassigned</option></select>
        ) : null}
        <select name="verified" aria-label="Email confirmation"><option value="yes" selected={(q.get('verified') ?? 'yes') === 'yes'}>Email confirmed</option><option value="no" selected={q.get('verified') === 'no'}>Awaiting confirmation</option><option value="all" selected={q.get('verified') === 'all'}>All</option></select>
        <select name="sort" aria-label="Sort"><option value="newest">Newest first</option><option value="oldest" selected={q.get('sort') === 'oldest'}>Oldest first</option></select>
        {can(u, 'applications.delete') ? <select name="retention" aria-label="Retention"><option value="">Any age</option><option value="expired" selected={q.get('retention') === 'expired'}>{`Past retention (${retention} days after decision)`}</option></select> : null}
        <button class="btn small primary" type="submit">Apply</button>
      </form>
      {q.get('retention') === 'expired' && can(u, 'applications.delete') && rows.length ? (
        <ConfirmForm action="/admin/applications/purge-expired" label="Delete all records past retention" message="Permanently delete every decided application past the retention period, including documents and history? This cannot be undone." />
      ) : null}
      {rows.length ? (
        <ul class="list cards">
          {rows.slice(0, PER_PAGE).map((a) => (
            <li>
              <a class="list-row" href={`/admin/applications/${a.id}`}>
                <span>
                  <strong>{a.full_name}</strong>
                  <span class="muted small">{a.reference} · {countryName(a.country, 'en')} · <Time ts={a.created_at} /></span>
                  <span class="muted small">{a.assignee ? `Assigned: ${a.assignee}` : 'Unassigned'}{a.email_verified_at ? '' : ' · email not confirmed'}</span>
                </span>
                <Badge status={a.status} />
              </a>
            </li>
          ))}
        </ul>
      ) : <Empty>No applications match these filters.</Empty>}
      <Pager base="/admin/applications" page={pg} hasMore={hasMore} params={q} />
    </>
  ));
});

async function loadApp(c: C, id: number) {
  const u = c.get('user');
  const app = await c.env.DB.prepare('SELECT a.*, us.display_name AS assignee FROM applications a LEFT JOIN users us ON us.id = a.assigned_to WHERE a.id = ?').bind(id).first<any>();
  if (!app) return null;
  if (!can(u, 'applications.view_all') && app.assigned_to !== u.id) return null;
  return app;
}

r.get('/:id{[0-9]+}', async (c) => {
  const u = c.get('user');
  const id = intParam(c, 'id');
  const app = await loadApp(c, id);
  if (!app) return page(c, { title: 'Not found', back: { href: '/admin/applications', label: 'Applications' } }, <Empty>Application not found or not assigned to you.</Empty>, 404);
  const db = c.env.DB;
  const [fields, docs, events, notes, messages, emails, reviewers] = await db.batch<any>([
    db.prepare('SELECT key, step, label_json FROM application_fields ORDER BY step, sort, id'),
    db.prepare('SELECT id, file_name, mime, size, created_at FROM application_documents WHERE application_id = ?').bind(id),
    db.prepare('SELECT e.*, us.display_name FROM application_events e LEFT JOIN users us ON us.id = e.actor_id WHERE e.application_id = ? ORDER BY e.created_at DESC').bind(id),
    db.prepare('SELECT n.*, us.display_name FROM application_notes n LEFT JOIN users us ON us.id = n.author_id WHERE n.application_id = ? ORDER BY n.created_at DESC').bind(id),
    db.prepare('SELECT m.*, us.display_name FROM applicant_messages m LEFT JOIN users us ON us.id = m.author_id WHERE m.application_id = ? ORDER BY m.created_at DESC').bind(id),
    db.prepare('SELECT id, template_key, subject, status, error, created_at FROM email_logs WHERE application_id = ? ORDER BY created_at DESC').bind(id),
    db.prepare("SELECT id, display_name, role FROM users WHERE status = 'active' AND role IN ('super_admin','reviewer') ORDER BY display_name"),
  ]);
  const answers = parseJson<Record<string, string>>(app.answers_json, {});
  const label = (k: string) => parseJson<any>(fields.results.find((f: any) => f.key === k)?.label_json, { en: k }).en ?? k;
  const stepOf = (k: string) => fields.results.find((f: any) => f.key === k)?.step ?? 3;
  await logAction(c, 'application.viewed', 'application', id);

  return page(c, { title: app.reference, active: 'applications', back: { href: '/admin/applications', label: 'Applications' } }, (
    <>
      <Card title={app.full_name} actions={<Badge status={app.status} />}>
        <p class="kv"><span>Reference</span><strong>{app.reference}</strong></p>
        <p class="kv"><span>Email</span><a href={`mailto:${app.email}`}>{app.email}</a></p>
        <p class="kv"><span>Country</span><strong>{countryName(app.country, 'en')}</strong></p>
        <p class="kv"><span>Language</span><strong>{app.locale.toUpperCase()}</strong></p>
        <p class="kv"><span>Submitted</span><Time ts={app.created_at} /></p>
        <p class="kv"><span>Email confirmed</span>{app.email_verified_at ? <Time ts={app.email_verified_at} /> : <Badge status="skipped" label="Not yet" />}</p>
        <p class="kv"><span>Assigned to</span><strong>{app.assignee ?? 'Unassigned'}</strong></p>
        <p class="kv"><span>Consent</span><span>Version {app.consent_version}, <Time ts={app.consent_at} /></span></p>
      </Card>

      <Card title="Change status">
        <form method="post" action={`/admin/applications/${id}/status`} class="stack" data-confirm="Update the status of this application?">
          <Select label="New status" name="status" value={app.status} options={STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))} />
          <Field label="Message to the applicant (optional; required when requesting information)" name="message" type="textarea" rows={4} max={4000} />
          <Check label="Email the applicant about this change" name="notify" checked />
          <button class="btn primary" type="submit">Update status</button>
        </form>
      </Card>

      {[1, 2, 3].map((step) => {
        const keys = Object.keys(answers).filter((k) => stepOf(k) === step);
        if (!keys.length) return null;
        return (
          <Card title={['', 'Personal information', 'Background', 'Motivation'][step]}>
            <dl class="answers">{keys.map((k) => <><dt>{label(k)}</dt><dd>{answers[k] || <span class="muted">—</span>}</dd></>)}</dl>
          </Card>
        );
      })}

      <Card title={`Supporting documents (${docs.results.length})`}>
        {docs.results.length ? (
          <ul class="list compact">{docs.results.map((d: any) => <li><a href={`/admin/applications/${id}/documents/${d.id}`} target="_blank" rel="noopener">{d.file_name}</a><span class="muted small">{d.mime} · {Math.round(d.size / 1024)} KB</span></li>)}</ul>
        ) : <p class="muted">None provided.</p>}
      </Card>

      {can(u, 'applications.assign') ? (
        <Card title="Assign reviewer">
          <form method="post" action={`/admin/applications/${id}/assign`} class="row wrap">
            <select name="user_id" aria-label="Reviewer">
              <option value="">Unassigned</option>
              {reviewers.results.map((rv: any) => <option value={rv.id} selected={app.assigned_to === rv.id}>{rv.display_name} ({ROLE_LABELS[rv.role as keyof typeof ROLE_LABELS]})</option>)}
            </select>
            <button class="btn" type="submit">Save</button>
          </form>
        </Card>
      ) : null}

      <Card title="Send email to applicant">
        <form method="post" action={`/admin/applications/${id}/message`} class="stack" data-confirm="Send this email to the applicant?">
          <Field label="Subject" name="subject" required max={200} value={`Your application ${app.reference}`} />
          <Field label="Message" name="message" type="textarea" rows={6} required max={8000} />
          <button class="btn primary" type="submit">Send email</button>
        </form>
      </Card>

      <Card title="Internal notes (never shown to the applicant)">
        <form method="post" action={`/admin/applications/${id}/note`} class="stack">
          <Field label="Add a note" name="body" type="textarea" rows={3} required max={4000} />
          <button class="btn" type="submit">Add note</button>
        </form>
        <ul class="list compact">{notes.results.map((n: any) => <li class="note"><p>{n.body}</p><span class="muted small">{n.display_name ?? 'Unknown'} · <Time ts={n.created_at} /></span></li>)}</ul>
      </Card>

      <Card title="Correspondence">
        {messages.results.length || emails.results.length ? (
          <ul class="list compact">
            {messages.results.map((m: any) => (
              <li class={`msg ${m.direction}`}><strong>{m.direction === 'inbound' ? 'From applicant' : `To applicant · ${m.display_name ?? ''}`}</strong> <span class="muted small"><Time ts={m.created_at} /></span><p>{m.subject ? <em>{m.subject}: </em> : null}{m.body}</p></li>
            ))}
            {emails.results.map((e: any) => <li><span>{e.subject}</span><span class="muted small"><Badge status={e.status} /> {e.template_key} · <Time ts={e.created_at} />{e.error ? ` · ${e.error.slice(0, 80)}` : ''}</span></li>)}
          </ul>
        ) : <p class="muted">No correspondence yet.</p>}
      </Card>

      <Card title="Decision history">
        <ul class="list compact timeline-admin">
          {events.results.map((e: any) => (
            <li><span><strong>{e.type.replace(/_/g, ' ')}</strong>{e.from_status || e.to_status ? ` ${e.from_status ? statusLabel(e.from_status) : ''} → ${e.to_status ? statusLabel(e.to_status) : ''}` : ''}{e.detail ? <span class="muted"> — {e.detail}</span> : null}</span><span class="muted small">{e.display_name ?? 'Applicant/system'} · <Time ts={e.created_at} /></span></li>
          ))}
        </ul>
      </Card>

      {can(u, 'applications.delete') ? (
        <Card title="Delete record">
          <p class="help">Permanently deletes this application, its documents, notes, messages and history (retention policy / erasure request).</p>
          <ConfirmForm action={`/admin/applications/${id}/delete`} label="Delete application permanently" message={`Permanently delete ${app.reference} and all related data? This cannot be undone.`} />
        </Card>
      ) : null}
    </>
  ));
});

r.post('/:id{[0-9]+}/status', async (c) => {
  const u = c.get('user');
  const id = intParam(c, 'id');
  const app = await loadApp(c, id);
  if (!app) return c.text('Not found', 404);
  const f = await form(c);
  const status = String(f.status ?? '');
  const message = clampStr(f.message, 4000);
  if (!STATUSES.includes(status)) return back(c, `/admin/applications/${id}`, { error: 'Invalid status.' });
  if (status === 'INFORMATION_REQUESTED' && !message) return back(c, `/admin/applications/${id}`, { error: 'Please describe the information you need.' });
  if (status === app.status && !message) return back(c, `/admin/applications/${id}`, { ok: 'Status unchanged.' });
  const ts = Date.now();
  const decided = ['ACCEPTED', 'DECLINED', 'WITHDRAWN'].includes(status);
  const ev = await c.env.DB.prepare("INSERT INTO application_events (application_id, type, from_status, to_status, detail, actor_id, created_at) VALUES (?, 'status_changed', ?, ?, ?, ?, ?) RETURNING id")
    .bind(id, app.status, status, message.slice(0, 500), u.id, ts)
    .first<{ id: number }>();
  await c.env.DB.prepare('UPDATE applications SET status = ?, updated_at = ?, decided_at = ? WHERE id = ?').bind(status, ts, decided ? ts : null, id).run();
  const tpl = STATUS_EMAIL[status];
  if (f.notify === '1' && tpl && status !== app.status) {
    await queueEmail(c.env, c.executionCtx as ExecutionContext, {
      dedupeKey: `app-status:${id}:${ev!.id}`, template: tpl, to: app.email, locale: app.locale, applicationId: id,
      vars: { name: app.full_name, reference: app.reference, message },
    });
    if (message) await c.env.DB.prepare("INSERT INTO applicant_messages (application_id, direction, subject, body, author_id, created_at) VALUES (?, 'outbound', ?, ?, ?, ?)").bind(id, statusLabel(status), message, u.id, ts).run();
  }
  await logAction(c, 'application.status', 'application', id, `${app.status} → ${status}`);
  return back(c, `/admin/applications/${id}`, { ok: `Status updated to ${statusLabel(status)}${f.notify === '1' && tpl && status !== app.status ? ' and the applicant was emailed' : ''}.` });
});

r.post('/:id{[0-9]+}/assign', async (c) => {
  const u = c.get('user');
  if (!can(u, 'applications.assign')) return c.text('Forbidden', 403);
  const id = intParam(c, 'id');
  const app = await loadApp(c, id);
  if (!app) return c.text('Not found', 404);
  const f = await form(c);
  const target = f.user_id ? Number(f.user_id) : null;
  if (target) {
    const ok = await c.env.DB.prepare("SELECT id FROM users WHERE id = ? AND status = 'active' AND role IN ('super_admin','reviewer')").bind(target).first();
    if (!ok) return back(c, `/admin/applications/${id}`, { error: 'Invalid reviewer.' });
  }
  const ts = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE applications SET assigned_to = ?, updated_at = ?, status = CASE WHEN status = \'NEW\' AND ? IS NOT NULL THEN \'PENDING_REVIEW\' ELSE status END WHERE id = ?').bind(target, ts, target, id),
    c.env.DB.prepare('INSERT INTO application_assignments (application_id, user_id, assigned_by, created_at) VALUES (?, ?, ?, ?)').bind(id, target, u.id, ts),
    c.env.DB.prepare("INSERT INTO application_events (application_id, type, detail, actor_id, created_at) VALUES (?, 'assigned', ?, ?, ?)").bind(id, target ? `to user #${target}` : 'unassigned', u.id, ts),
  ]);
  if (target && target !== u.id) {
    await notifyAdmins(c.env, c.executionCtx as ExecutionContext, { type: 'application_assigned', title: `Application ${app.reference} assigned to you`, body: app.full_name, link: `/admin/applications/${id}`, userIds: [target] });
  }
  await logAction(c, 'application.assign', 'application', id, String(target ?? 'none'));
  return back(c, `/admin/applications/${id}`, { ok: 'Assignment saved.' });
});

r.post('/:id{[0-9]+}/note', async (c) => {
  const id = intParam(c, 'id');
  if (!(await loadApp(c, id))) return c.text('Not found', 404);
  const body = clampStr((await form(c)).body, 4000);
  if (!body) return back(c, `/admin/applications/${id}`, { error: 'Note is empty.' });
  await c.env.DB.prepare('INSERT INTO application_notes (application_id, author_id, body, created_at) VALUES (?, ?, ?, ?)').bind(id, c.get('user').id, body, Date.now()).run();
  await logAction(c, 'application.note', 'application', id);
  return back(c, `/admin/applications/${id}`, { ok: 'Note added.' });
});

r.post('/:id{[0-9]+}/message', async (c) => {
  const u = c.get('user');
  const id = intParam(c, 'id');
  const app = await loadApp(c, id);
  if (!app) return c.text('Not found', 404);
  const f = await form(c);
  const subject = clampStr(f.subject, 200);
  const message = clampStr(f.message, 8000);
  if (!subject || !message) return back(c, `/admin/applications/${id}`, { error: 'Subject and message are required.' });
  const ts = Date.now();
  const m = await c.env.DB.prepare("INSERT INTO applicant_messages (application_id, direction, subject, body, author_id, created_at) VALUES (?, 'outbound', ?, ?, ?, ?) RETURNING id").bind(id, subject, message, u.id, ts).first<{ id: number }>();
  await c.env.DB.prepare("INSERT INTO application_events (application_id, type, detail, actor_id, created_at) VALUES (?, 'email_sent', ?, ?, ?)").bind(id, subject, u.id, ts).run();
  await queueEmail(c.env, c.executionCtx as ExecutionContext, {
    dedupeKey: `app-msg-out:${m!.id}`, template: 'applicant_correspondence', to: app.email, locale: app.locale, applicationId: id,
    vars: { name: app.full_name, reference: app.reference, subject, message },
  });
  await logAction(c, 'application.email', 'application', id, subject);
  return back(c, `/admin/applications/${id}`, { ok: 'Email queued for delivery. Check its status under Correspondence.' });
});

r.get('/:id{[0-9]+}/documents/:doc{[0-9]+}', async (c) => {
  const id = intParam(c, 'id');
  if (!(await loadApp(c, id))) return c.text('Not found', 404);
  const doc = await c.env.DB.prepare('SELECT * FROM application_documents WHERE id = ? AND application_id = ?').bind(intParam(c, 'doc'), id).first<any>();
  if (!doc) return c.text('Not found', 404);
  const obj = await c.env.BUCKET.get(doc.r2_key);
  if (!obj) return c.text('File missing', 404);
  await logAction(c, 'application.document_viewed', 'application', id, doc.file_name);
  return new Response(obj.body, {
    headers: {
      'content-type': doc.mime,
      'content-disposition': `inline; filename="${doc.file_name.replace(/"/g, '')}"`,
      'cache-control': 'no-store, private',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
});

export async function deleteApplication(c: C, id: number) {
  const docs = (await c.env.DB.prepare('SELECT r2_key FROM application_documents WHERE application_id = ?').bind(id).all<{ r2_key: string }>()).results;
  if (docs.length) await c.env.BUCKET.delete(docs.map((d) => d.r2_key));
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM applicant_actions WHERE application_id = ?').bind(id),
    c.env.DB.prepare('UPDATE email_logs SET application_id = NULL, html = \'[deleted]\', text = \'[deleted]\' WHERE application_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM applications WHERE id = ?').bind(id),
  ]);
}

r.post('/:id{[0-9]+}/delete', async (c) => {
  if (!can(c.get('user'), 'applications.delete')) return c.text('Forbidden', 403);
  const id = intParam(c, 'id');
  const app = await loadApp(c, id);
  if (!app) return c.text('Not found', 404);
  await deleteApplication(c, id);
  await logAction(c, 'application.deleted', 'application', id, app.reference);
  return back(c, '/admin/applications', { ok: `${app.reference} deleted.` });
});

r.post('/purge-expired', async (c) => {
  if (!can(c.get('user'), 'applications.delete')) return c.text('Forbidden', 403);
  const days = await retentionDays(c);
  const rows = (await c.env.DB.prepare("SELECT id FROM applications WHERE status IN ('ACCEPTED','DECLINED','WITHDRAWN') AND decided_at IS NOT NULL AND decided_at < ? LIMIT 200").bind(Date.now() - days * DAY).all<{ id: number }>()).results;
  for (const r of rows) await deleteApplication(c, r.id);
  await logAction(c, 'application.retention_purge', 'applications', rows.length);
  return back(c, '/admin/applications', { ok: `${rows.length} record(s) past retention deleted.` });
});

export default r;
