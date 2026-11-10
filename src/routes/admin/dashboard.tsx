import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { can, pepperOf, ROLE_LABELS } from '../../lib/auth';
import { hashPassword, MIN_PASSWORD_LENGTH, passwordProblems, verifyPassword } from '../../lib/password';
import { newTotpSecret, otpauthUri, verifyTotp } from '../../lib/totp';
import { b64url, hmacSha256, timingSafeEqual } from '../../lib/util';
import { Badge, Card, Empty, Field, Time, visibleNav } from '../../views/admin/ui';
import { back, form, logAction, page } from './common';

const r = new Hono<AppEnv>();

const STATUSES = ['NEW', 'PENDING_REVIEW', 'UNDER_REVIEW', 'INFORMATION_REQUESTED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN'];

r.get('/', async (c) => {
  const u = c.get('user');
  const db = c.env.DB;
  const seeAll = can(u, 'applications.view_all');
  const seeApps = seeAll || can(u, 'applications.review');
  const scope = seeAll ? '' : ' AND assigned_to = ?';
  const binds = seeAll ? [] : [u.id];

  let counts: Record<string, number> = {};
  let unverified = 0;
  let recent: any[] = [];
  if (seeApps) {
    const r1 = await db.prepare(`SELECT status, COUNT(*) AS n FROM applications WHERE email_verified_at IS NOT NULL${scope} GROUP BY status`).bind(...binds).all<any>();
    counts = Object.fromEntries(r1.results.map((x) => [x.status, x.n]));
    if (seeAll) unverified = (await db.prepare('SELECT COUNT(*) AS n FROM applications WHERE email_verified_at IS NULL').first<{ n: number }>())?.n ?? 0;
    recent = (await db.prepare(`SELECT id, reference, full_name, country, status, created_at FROM applications WHERE email_verified_at IS NOT NULL${scope} ORDER BY created_at DESC LIMIT 6`).bind(...binds).all<any>()).results;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const activity = can(u, 'security') || can(u, 'content')
    ? (await db.prepare(`SELECT a.action, a.entity_type, a.entity_id, a.created_at, u.display_name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id WHERE a.action NOT LIKE 'login.%' AND a.action != 'logout' AND a.user_id IS NOT NULL ORDER BY a.created_at DESC LIMIT 8`).all<any>()).results
    : [];
  const publishing = can(u, 'content')
    ? (await db.prepare("SELECT a.action, a.entity_type, a.entity_id, a.detail, a.created_at, u.display_name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id WHERE a.action IN ('page.publish','article.publish','article.unpublish','collection.save','media.upload') ORDER BY a.created_at DESC LIMIT 6").all<any>()).results
    : [];
  const contentStats = can(u, 'content')
    ? await db.prepare("SELECT (SELECT COUNT(*) FROM articles WHERE status='published') AS published, (SELECT COUNT(*) FROM articles WHERE status='draft') AS drafts, (SELECT COUNT(*) FROM articles WHERE status='scheduled') AS scheduled, (SELECT COUNT(*) FROM pages WHERE draft_json IS NOT NULL) AS page_drafts, (SELECT COUNT(*) FROM media_assets) AS media").first<any>()
    : null;

  const stat = (label: string, value: number, href: string, tone = '') => (
    <a class={`stat ${tone}`} href={href}><span class="stat-value">{value}</span><span class="stat-label">{label}</span></a>
  );
  const pending = (counts.PENDING_REVIEW ?? 0) + (counts.INFORMATION_REQUESTED ?? 0);

  return page(c, { title: 'Dashboard', active: 'dashboard' }, (
    <>
      <p class="greeting">Welcome back, {u.display_name}. <span class="muted">{ROLE_LABELS[u.role]}</span></p>
      {seeApps ? (
        <div class="stats">
          {stat(seeAll ? 'Total applications' : 'Assigned to me', total, '/admin/applications')}
          {stat('New', counts.NEW ?? 0, '/admin/applications?status=NEW', 'info')}
          {stat('Pending', pending, '/admin/applications?status=PENDING_REVIEW', 'warn')}
          {stat('Under review', counts.UNDER_REVIEW ?? 0, '/admin/applications?status=UNDER_REVIEW', 'warn')}
          {stat('Accepted', counts.ACCEPTED ?? 0, '/admin/applications?status=ACCEPTED', 'ok')}
          {stat('Declined', counts.DECLINED ?? 0, '/admin/applications?status=DECLINED', 'bad')}
        </div>
      ) : null}
      {seeAll && unverified ? <p class="help">{unverified} submission(s) are awaiting email confirmation and are not counted above. <a href="/admin/applications?verified=no">View</a></p> : null}

      <Card title="Quick actions">
        <div class="quick">
          {seeApps ? <a class="qa" href="/admin/applications">Manage applications</a> : null}
          {can(u, 'content') ? <a class="qa" href="/admin/pages/by-slug/home">Edit homepage</a> : null}
          {can(u, 'media') ? <a class="qa" href="/admin/media#upload">Upload media</a> : null}
          {can(u, 'content') ? <a class="qa" href="/admin/content/articles/new">Create article</a> : null}
          {seeApps ? <a class="qa" href="/admin/emails/compose">Send email</a> : null}
          {can(u, 'settings') ? <a class="qa" href="/admin/settings">Website settings</a> : null}
        </div>
      </Card>

      <div class="cols">
        {seeApps ? (
          <Card title="Recent submissions" actions={<a href="/admin/applications">All</a>}>
            {recent.length ? (
              <ul class="list">
                {recent.map((a) => (
                  <li><a href={`/admin/applications/${a.id}`} class="list-row"><span><strong>{a.full_name}</strong><span class="muted small">{a.reference} · <Time ts={a.created_at} /></span></span><Badge status={a.status} /></a></li>
                ))}
              </ul>
            ) : <Empty>No applications yet.</Empty>}
          </Card>
        ) : null}
        {contentStats ? (
          <Card title="Website publishing" actions={<a href="/admin/content/articles">Articles</a>}>
            <p class="kv"><span>Published articles</span><strong>{contentStats.published}</strong></p>
            <p class="kv"><span>Drafts</span><strong>{contentStats.drafts}</strong></p>
            <p class="kv"><span>Scheduled</span><strong>{contentStats.scheduled}</strong></p>
            <p class="kv"><span>Pages with unpublished drafts</span><strong>{contentStats.page_drafts}</strong></p>
            <p class="kv"><span>Media files</span><strong>{contentStats.media}</strong></p>
            {publishing.length ? (
              <ul class="list compact">{publishing.map((a) => <li><span>{a.action.replace('.', ' ')} · {a.detail || `${a.entity_type} ${a.entity_id}`}</span><span class="muted small">{a.display_name} · <Time ts={a.created_at} /></span></li>)}</ul>
            ) : null}
          </Card>
        ) : null}
        {activity.length ? (
          <Card title="Recent administrator activity" actions={can(u, 'security') ? <a href="/admin/security">Audit log</a> : undefined}>
            <ul class="list compact">{activity.map((a) => <li><span><strong>{a.display_name ?? 'System'}</strong> {a.action.replace(/[._]/g, ' ')} <span class="muted">{a.entity_type} {a.entity_id}</span></span><span class="muted small"><Time ts={a.created_at} /></span></li>)}</ul>
          </Card>
        ) : null}
      </div>
    </>
  ));
});

r.get('/more', (c) => {
  const u = c.get('user');
  return page(c, { title: 'More', active: 'more' }, (
    <Card>
      <ul class="menu-list">
        {visibleNav(u).map((n) => <li><a href={n.href}>{n.label}</a></li>)}
        <li><a href="/admin/notifications">Notifications</a></li>
        <li><a href="/admin/account">My account & security</a></li>
        <li><a href="/" target="_blank" rel="noopener">View website ↗</a></li>
        <li><form method="post" action="/admin/logout"><button class="link" type="submit">Sign out</button></form></li>
      </ul>
    </Card>
  ));
});

// ───────── Notification centre ─────────
r.get('/notifications', async (c) => {
  const u = c.get('user');
  const filter = c.req.query('filter') === 'unread' ? ' AND read_at IS NULL' : '';
  const list = (await c.env.DB.prepare(`SELECT * FROM admin_notifications WHERE user_id = ?${filter} ORDER BY created_at DESC LIMIT 100`).bind(u.id).all<any>()).results;
  return page(c, { title: 'Notifications', active: 'more', actions: <form method="post" action="/admin/notifications/read-all"><button class="btn small" type="submit">Mark all read</button></form> }, (
    <>
      <div class="tabs"><a href="/admin/notifications" aria-current={!filter ? 'page' : undefined}>All</a><a href="/admin/notifications?filter=unread" aria-current={filter ? 'page' : undefined}>Unread</a></div>
      {list.length ? (
        <ul class="list notif">
          {list.map((n) => (
            <li class={n.read_at ? 'read' : 'unread'}>
              <a href={n.link || '#'} class="list-row"><span><strong>{n.title}</strong>{n.body ? <span class="muted small">{n.body}</span> : null}<span class="muted small"><Time ts={n.created_at} /></span></span></a>
              <form method="post" action={`/admin/notifications/${n.id}/toggle`}><button class="btn small ghost" type="submit">{n.read_at ? 'Mark unread' : 'Mark read'}</button></form>
            </li>
          ))}
        </ul>
      ) : <Empty>No notifications.</Empty>}
    </>
  ));
});

r.post('/notifications/read-all', async (c) => {
  await c.env.DB.prepare('UPDATE admin_notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').bind(Date.now(), c.get('user').id).run();
  return back(c, '/admin/notifications', { ok: 'All notifications marked as read.' });
});

r.post('/notifications/:id/toggle', async (c) => {
  await c.env.DB.prepare('UPDATE admin_notifications SET read_at = CASE WHEN read_at IS NULL THEN ? ELSE NULL END WHERE id = ? AND user_id = ?')
    .bind(Date.now(), Number(c.req.param('id')), c.get('user').id)
    .run();
  return back(c, '/admin/notifications');
});

// ───────── My account: password change & MFA ─────────
async function mfaSig(c: any, secret: string) {
  return b64url(await hmacSha256(c.env.AUTH_PEPPER ?? '', `mfa-enroll:${c.get('user').id}:${secret}`));
}

r.get('/account', async (c) => {
  const u = c.get('user');
  const sessions = (await c.env.DB.prepare('SELECT id, ip, user_agent, created_at, last_seen_at FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC').bind(u.id).all<any>()).results;
  let enroll: { secret: string; uri: string; sig: string } | null = null;
  if (!u.totp_enabled && c.req.query('mfa') === 'setup') {
    const secret = newTotpSecret();
    enroll = { secret, uri: otpauthUri(secret, u.email, 'EIC Admin'), sig: await mfaSig(c, secret) };
  }
  return page(c, { title: 'My account', active: 'more' }, (
    <>
      <Card title="Profile">
        <p class="kv"><span>Name</span><strong>{u.display_name}</strong></p>
        <p class="kv"><span>Email</span><strong>{u.email}</strong></p>
        <p class="kv"><span>Role</span><strong>{ROLE_LABELS[u.role]}</strong></p>
      </Card>
      <Card title="Change password">
        <form method="post" action="/admin/account/password" class="stack">
          <Field label="Current password" name="current" type="password" required autocomplete="current-password" />
          <Field label="New password" name="password" type="password" required autocomplete="new-password" help={`At least ${MIN_PASSWORD_LENGTH} characters. Signs out your other sessions.`} attrs={{ minlength: MIN_PASSWORD_LENGTH }} />
          <Field label="Confirm new password" name="confirm" type="password" required autocomplete="new-password" attrs={{ minlength: MIN_PASSWORD_LENGTH }} />
          <button class="btn primary" type="submit">Change password</button>
        </form>
      </Card>
      <Card title="Two-step verification (MFA)">
        {u.totp_enabled ? (
          <>
            <p><Badge status="active" label="Enabled" /> Sign-in requires a code from your authenticator app.</p>
            <form method="post" action="/admin/account/mfa/disable" class="stack" data-confirm="Disable two-step verification?">
              <Field label="Current password" name="current" type="password" required autocomplete="current-password" />
              <Field label="Authenticator code" name="code" required inputmode="numeric" autocomplete="one-time-code" />
              <button class="btn danger" type="submit">Disable</button>
            </form>
          </>
        ) : enroll ? (
          <form method="post" action="/admin/account/mfa/enable" class="stack">
            <p>1. In your authenticator app (e.g. 1Password, Google Authenticator, Authy), add an account using this setup key:</p>
            <p class="secret-key" data-copy>{enroll.secret.match(/.{1,4}/g)!.join(' ')}</p>
            <p><a class="btn small" href={enroll.uri}>Open in authenticator app</a></p>
            <input type="hidden" name="secret" value={enroll.secret} />
            <input type="hidden" name="sig" value={enroll.sig} />
            <Field label="2. Enter the 6-digit code it shows" name="code" required inputmode="numeric" autocomplete="one-time-code" />
            <button class="btn primary" type="submit">Turn on</button>
          </form>
        ) : (
          <>
            <p>Protect your account with a time-based code from an authenticator app.</p>
            <a class="btn primary" href="/admin/account?mfa=setup">Set up two-step verification</a>
          </>
        )}
      </Card>
      <Card title="Active sessions">
        <ul class="list compact">
          {sessions.map((s) => <li><span>{s.id === u.session_id ? <strong>This device · </strong> : null}{(s.user_agent || 'Unknown device').slice(0, 80)}</span><span class="muted small">Last active <Time ts={s.last_seen_at} /></span></li>)}
        </ul>
        {sessions.length > 1 ? <form method="post" action="/admin/account/sessions/revoke-others"><button class="btn small" type="submit">Sign out other sessions</button></form> : null}
      </Card>
    </>
  ));
});

r.post('/account/password', async (c) => {
  const u = c.get('user');
  const pepper = pepperOf(c.env);
  if (!pepper) return back(c, '/admin/account', { error: 'AUTH_PEPPER is not configured.' });
  const f = await form(c);
  const row = await c.env.DB.prepare('SELECT password_hash, password_salt, password_iterations FROM users WHERE id = ?').bind(u.id).first<any>();
  if (!row || !(await verifyPassword(String(f.current ?? ''), pepper, { hash: row.password_hash, salt: row.password_salt, iterations: row.password_iterations }))) {
    await logAction(c, 'password.change_failed', 'user', u.id);
    return back(c, '/admin/account', { error: 'Your current password is incorrect.' });
  }
  const problem = f.password !== f.confirm ? 'The new passwords do not match.' : passwordProblems(f.password ?? '', u.email);
  if (problem) return back(c, '/admin/account', { error: problem });
  const h = await hashPassword(f.password, pepper);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ? WHERE id = ?').bind(h.hash, h.salt, h.iterations, Date.now(), u.id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(u.id, u.session_id),
  ]);
  await logAction(c, 'password.changed', 'user', u.id);
  return back(c, '/admin/account', { ok: 'Password changed. Other sessions were signed out.' });
});

r.post('/account/mfa/enable', async (c) => {
  const u = c.get('user');
  const f = await form(c);
  const secret = String(f.secret ?? '');
  if (!/^[A-Z2-7]{32}$/.test(secret) || !timingSafeEqual(await mfaSig(c, secret), String(f.sig ?? ''))) return back(c, '/admin/account', { error: 'Setup expired. Please start again.' });
  if (!(await verifyTotp(secret, String(f.code ?? '')))) return back(c, '/admin/account?mfa=setup', { error: 'That code did not match. Scan the new key and try again.' });
  await c.env.DB.prepare('UPDATE users SET totp_secret = ?, updated_at = ? WHERE id = ?').bind(secret, Date.now(), u.id).run();
  await logAction(c, 'mfa.enabled', 'user', u.id);
  return back(c, '/admin/account', { ok: 'Two-step verification is now on.' });
});

r.post('/account/mfa/disable', async (c) => {
  const u = c.get('user');
  const pepper = pepperOf(c.env);
  const f = await form(c);
  const row = await c.env.DB.prepare('SELECT password_hash, password_salt, password_iterations, totp_secret FROM users WHERE id = ?').bind(u.id).first<any>();
  const pwOk = !!pepper && !!row && (await verifyPassword(String(f.current ?? ''), pepper, { hash: row.password_hash, salt: row.password_salt, iterations: row.password_iterations }));
  if (!pwOk || !row?.totp_secret || !(await verifyTotp(row.totp_secret, String(f.code ?? '')))) return back(c, '/admin/account', { error: 'Password or code incorrect.' });
  await c.env.DB.prepare('UPDATE users SET totp_secret = NULL, updated_at = ? WHERE id = ?').bind(Date.now(), u.id).run();
  await logAction(c, 'mfa.disabled', 'user', u.id);
  return back(c, '/admin/account', { ok: 'Two-step verification disabled.' });
});

r.post('/account/sessions/revoke-others', async (c) => {
  const u = c.get('user');
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(u.id, u.session_id).run();
  await logAction(c, 'sessions.revoked_others', 'user', u.id);
  return back(c, '/admin/account', { ok: 'Other sessions signed out.' });
});

export { STATUSES };
export default r;
