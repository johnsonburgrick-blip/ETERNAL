import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { createSession, destroySession, pepperOf, readSession, ROLE_LABELS } from '../../lib/auth';
import { ipKey, overLimit, rateCount, rateHit } from '../../lib/guard';
import { notifyAdmins } from '../../lib/notify';
import { dummyVerify, hashPassword, MIN_PASSWORD_LENGTH, passwordProblems, verifyPassword } from '../../lib/password';
import { verifyTotp } from '../../lib/totp';
import { clampStr, clientIp, HOUR, isEmail, MINUTE, randomToken, sha256Hex } from '../../lib/util';
import { queueEmail } from '../../email/send';
import { Card, Field } from '../../views/admin/ui';
import { back, form, logAction, page, type C } from './common';

const LOGIN_WINDOW = 15 * MINUTE;
const MAX_FAIL_PER_IP = 10;
const MAX_FAIL_PER_ACCOUNT = 5;
const LOCK_MS = 15 * MINUTE;

const r = new Hono<AppEnv>();

function PepperMissing() {
  return (
    <Card title="Server configuration required">
      <p>The <code>AUTH_PEPPER</code> secret is not set (or is shorter than 32 characters), so passwords cannot be hashed safely.</p>
      <p>Set it once from your project folder and enter a long random value at the prompt:</p>
      <pre class="code">npx wrangler secret put AUTH_PEPPER</pre>
      <p class="help">Generate a value with a password manager (64+ random characters). Never change it afterwards: rotating the pepper invalidates every password.</p>
    </Card>
  );
}

async function userCount(c: C) {
  return (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>())?.n ?? 0;
}

// ───────────────────────── One-time setup ─────────────────────────
r.get('/setup', async (c) => {
  if ((await userCount(c)) > 0) return page(c, { title: 'Setup' }, <Card title="Setup already completed"><p>An owner account exists. <a href="/admin/login">Sign in</a>.</p></Card>, 403);
  if (!pepperOf(c.env)) return page(c, { title: 'Setup' }, <PepperMissing />, 503);
  return page(c, { title: 'Create owner account' }, <SetupForm />);
});

function SetupForm({ error, name, email }: { error?: string; name?: string; email?: string }) {
  return (
    <div class="auth-box">
      <Card title="Create the owner account">
        <p class="help">This form is available only while no administrator exists. The owner becomes a Super Administrator.</p>
        {error ? <div class="toast err" role="alert">{error}</div> : null}
        <form method="post" action="/admin/setup" class="stack">
          <Field label="Your name" name="display_name" value={name} required max={100} autocomplete="name" />
          <Field label="Email" name="email" type="email" value={email} required max={200} autocomplete="email" />
          <Field label="Password" name="password" type="password" required autocomplete="new-password" help={`At least ${MIN_PASSWORD_LENGTH} characters. A passphrase is ideal.`} attrs={{ minlength: MIN_PASSWORD_LENGTH }} />
          <Field label="Confirm password" name="confirm" type="password" required autocomplete="new-password" attrs={{ minlength: MIN_PASSWORD_LENGTH }} />
          <button class="btn primary block" type="submit">Create owner account</button>
        </form>
      </Card>
    </div>
  );
}

r.post('/setup', async (c) => {
  if ((await userCount(c)) > 0) return c.text('Setup already completed.', 403);
  const pepper = pepperOf(c.env);
  if (!pepper) return page(c, { title: 'Setup' }, <PepperMissing />, 503);
  if (await overLimit(c.env, 'setup_ip', await ipKey(c.req.raw), 10, HOUR)) return c.text('Too many attempts.', 429);
  const f = await form(c);
  const name = clampStr(f.display_name, 100);
  const email = clampStr(f.email, 200).toLowerCase();
  let error = '';
  if (!name) error = 'Please enter your name.';
  else if (!isEmail(email)) error = 'Please enter a valid email address.';
  else if (f.password !== f.confirm) error = 'The passwords do not match.';
  else error = passwordProblems(f.password ?? '', email) ?? '';
  if (error) return page(c, { title: 'Create owner account' }, <SetupForm error={error} name={name} email={email} />, 400);
  const h = await hashPassword(f.password, pepper);
  const ts = Date.now();
  // Atomic: only inserts while the users table is still empty.
  const res = await c.env.DB.prepare(
    `INSERT INTO users (email, display_name, role, status, password_hash, password_salt, password_iterations, created_at, updated_at)
     SELECT ?, ?, 'super_admin', 'active', ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users)`,
  )
    .bind(email, name, h.hash, h.salt, h.iterations, ts, ts)
    .run();
  if (!res.meta.changes) return c.text('Setup already completed.', 403);
  await logAction(c, 'setup.owner_created', 'user', email);
  return back(c, '/admin/login', { ok: 'Owner account created. Please sign in.' });
});

// ───────────────────────── Login ─────────────────────────
function LoginForm({ error, email, next }: { error?: string; email?: string; next?: string }) {
  return (
    <div class="auth-box">
      <Card title="Administrator sign in">
        {error ? <div class="toast err" role="alert">{error}</div> : null}
        <form method="post" action="/admin/login" class="stack">
          <input type="hidden" name="next" value={next ?? ''} />
          <Field label="Email" name="email" type="email" value={email} required autocomplete="username" max={200} />
          <Field label="Password" name="password" type="password" required autocomplete="current-password" />
          <button class="btn primary block" type="submit">Sign in</button>
        </form>
        <p class="center"><a href="/admin/forgot">Forgot your password?</a></p>
      </Card>
    </div>
  );
}

r.get('/login', async (c) => {
  const s = await readSession(c);
  if (s && !s.mfaPending) return c.redirect('/admin', 303);
  if ((await userCount(c)) === 0) return c.redirect('/admin/setup', 303);
  return page(c, { title: 'Sign in' }, <LoginForm next={c.req.query('next')} />);
});

const safeNext = (n?: string) => (n && /^\/admin(\/[A-Za-z0-9/_\-?=&.%]*)?$/.test(n) && !n.startsWith('//') ? n : '/admin');

r.post('/login', async (c) => {
  const pepper = pepperOf(c.env);
  if (!pepper) return page(c, { title: 'Sign in' }, <PepperMissing />, 503);
  const f = await form(c);
  const email = clampStr(f.email, 200).toLowerCase();
  const password = String(f.password ?? '').slice(0, 256);
  const ip = await ipKey(c.req.raw);
  const generic = 'Incorrect email or password.';
  const fail = (msg = generic, status = 401) => page(c, { title: 'Sign in' }, <LoginForm error={msg} email={email} next={f.next} />, status);

  if ((await rateCount(c.env, 'login_fail_ip', ip, LOGIN_WINDOW)) >= MAX_FAIL_PER_IP) {
    await logAction(c, 'login.rate_limited', 'ip', clientIp(c.req.raw));
    return fail('Too many failed attempts from your network. Please wait 15 minutes.', 429);
  }
  const user = await c.env.DB.prepare('SELECT id, email, display_name, status, password_hash, password_salt, password_iterations, totp_secret, locked_until FROM users WHERE email = ?')
    .bind(email)
    .first<any>();
  const acctKey = await sha256Hex('acct:' + email);
  if (!user || !user.password_hash || user.status !== 'active') {
    await dummyVerify(password, pepper);
    await rateHit(c.env, 'login_fail_ip', ip);
    await rateHit(c.env, 'login_fail_acct', acctKey);
    await logAction(c, 'login.failed', 'user', email, 'unknown or inactive account');
    return fail();
  }
  if (user.locked_until && user.locked_until > Date.now()) {
    await rateHit(c.env, 'login_fail_ip', ip);
    return fail('This account is temporarily locked after repeated failed sign-ins. Try again later or reset your password.', 423);
  }
  const ok = await verifyPassword(password, pepper, { hash: user.password_hash, salt: user.password_salt, iterations: user.password_iterations });
  if (!ok) {
    await rateHit(c.env, 'login_fail_ip', ip);
    await rateHit(c.env, 'login_fail_acct', acctKey);
    await logAction(c, 'login.failed', 'user', user.id, 'wrong password');
    if ((await rateCount(c.env, 'login_fail_acct', acctKey, LOGIN_WINDOW)) >= MAX_FAIL_PER_ACCOUNT) {
      await c.env.DB.prepare('UPDATE users SET locked_until = ? WHERE id = ?').bind(Date.now() + LOCK_MS, user.id).run();
      await logAction(c, 'login.locked', 'user', user.id);
      await notifyAdmins(c.env, c.executionCtx as ExecutionContext, {
        type: 'security', title: `Account locked: ${user.email}`, body: 'Repeated failed sign-in attempts.', link: '/admin/security', roles: ['super_admin'],
        email: { template: 'admin_security', dedupeKey: `lock:${user.id}:${Math.floor(Date.now() / LOCK_MS)}`, vars: { subject: `Account locked (${user.email})`, message: `The administrator account ${user.email} was locked for 15 minutes after ${MAX_FAIL_PER_ACCOUNT} failed sign-in attempts.` } },
      });
    }
    return fail();
  }
  await c.env.DB.prepare('UPDATE users SET locked_until = NULL, last_login_at = ? WHERE id = ?').bind(Date.now(), user.id).run();
  await createSession(c, user.id, !!user.totp_secret);
  await logAction(c, user.totp_secret ? 'login.password_ok' : 'login.success', 'user', user.id);
  if (user.totp_secret) return c.redirect(`/admin/login/mfa?next=${encodeURIComponent(safeNext(f.next))}`, 303);
  return c.redirect(safeNext(f.next), 303);
});

// ───────────────────────── MFA (TOTP) ─────────────────────────
function MfaForm({ error, next }: { error?: string; next?: string }) {
  return (
    <div class="auth-box">
      <Card title="Two-step verification">
        <p>Enter the 6-digit code from your authenticator app.</p>
        {error ? <div class="toast err" role="alert">{error}</div> : null}
        <form method="post" action="/admin/login/mfa" class="stack">
          <input type="hidden" name="next" value={next ?? ''} />
          <Field label="Code" name="code" required inputmode="numeric" autocomplete="one-time-code" max={7} attrs={{ pattern: '[0-9 ]{6,7}', autofocus: true }} />
          <button class="btn primary block" type="submit">Verify</button>
        </form>
        <form method="post" action="/admin/logout"><button class="link" type="submit">Cancel and sign out</button></form>
      </Card>
    </div>
  );
}

r.get('/login/mfa', async (c) => {
  const s = await readSession(c);
  if (!s) return c.redirect('/admin/login', 303);
  if (!s.mfaPending) return c.redirect('/admin', 303);
  return page(c, { title: 'Verification' }, <MfaForm next={c.req.query('next')} />);
});

r.post('/login/mfa', async (c) => {
  const s = await readSession(c);
  if (!s) return c.redirect('/admin/login', 303);
  const f = await form(c);
  const key = `u${s.user.id}`;
  if ((await rateCount(c.env, 'mfa_fail', key, LOGIN_WINDOW)) >= MAX_FAIL_PER_ACCOUNT) {
    await destroySession(c);
    return back(c, '/admin/login', { error: 'Too many incorrect codes. Please sign in again later.' });
  }
  const row = await c.env.DB.prepare('SELECT totp_secret FROM users WHERE id = ?').bind(s.user.id).first<{ totp_secret: string }>();
  if (!row?.totp_secret || !(await verifyTotp(row.totp_secret, String(f.code ?? '')))) {
    await rateHit(c.env, 'mfa_fail', key);
    await logAction(c, 'mfa.failed', 'user', s.user.id);
    return page(c, { title: 'Verification' }, <MfaForm error="That code is not valid. Check your device's time and try again." next={f.next} />, 401);
  }
  await c.env.DB.prepare('UPDATE sessions SET mfa_pending = 0 WHERE id = ?').bind(s.user.session_id).run();
  await logAction(c, 'login.success', 'user', s.user.id, 'with MFA');
  return c.redirect(safeNext(f.next), 303);
});

r.post('/logout', async (c) => {
  const s = await readSession(c);
  if (s) await logAction(c, 'logout', 'user', s.user.id);
  await destroySession(c);
  return back(c, '/admin/login', { ok: 'You have been signed out.' });
});

// ───────────────────────── Password recovery & invitations ─────────────────────────
r.get('/forgot', (c) =>
  page(c, { title: 'Reset password' },
    <div class="auth-box">
      <Card title="Reset your password">
        <p>Enter your administrator email. If it belongs to an active account, we will email a reset link valid for 30 minutes.</p>
        <form method="post" action="/admin/forgot" class="stack">
          <Field label="Email" name="email" type="email" required autocomplete="username" />
          <button class="btn primary block" type="submit">Send reset link</button>
        </form>
        <p class="center"><a href="/admin/login">Back to sign in</a></p>
      </Card>
    </div>),
);

r.post('/forgot', async (c) => {
  const f = await form(c);
  const email = clampStr(f.email, 200).toLowerCase();
  const done = () => back(c, '/admin/login', { ok: 'If that address belongs to an administrator, a reset link has been sent.' });
  if (!isEmail(email)) return done();
  if (await overLimit(c.env, 'forgot_ip', await ipKey(c.req.raw), 5, HOUR)) return done();
  if (await overLimit(c.env, 'forgot_acct', await sha256Hex(email), 3, HOUR)) return done();
  const user = await c.env.DB.prepare("SELECT id, email, display_name FROM users WHERE email = ? AND status = 'active'").bind(email).first<any>();
  if (!user) return done();
  await sendAuthLink(c, user, 'reset');
  await logAction(c, 'password.reset_requested', 'user', user.id);
  return done();
});

export async function sendAuthLink(c: C, user: { id: number; email: string; display_name: string; role?: string }, purpose: 'reset' | 'invite') {
  const token = randomToken(32);
  const ttl = purpose === 'invite' ? 72 * HOUR : 30 * MINUTE;
  await c.env.DB.prepare('INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(user.id, purpose, await sha256Hex(token), Date.now() + ttl, Date.now())
    .run();
  const link = `${c.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/admin/reset/${token}`;
  await queueEmail(c.env, c.executionCtx as ExecutionContext, {
    dedupeKey: `auth-${purpose}:${token.slice(0, 16)}`,
    template: purpose === 'invite' ? 'admin_invite' : 'admin_password_reset',
    to: user.email,
    vars: { name: user.display_name, link, role: user.role ? ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] : '' },
  });
}

async function findAuthToken(c: C, token: string) {
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return null;
  return c.env.DB.prepare(
    'SELECT t.id, t.purpose, t.user_id, u.email, u.display_name FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > ? AND u.status != \'disabled\'',
  )
    .bind(await sha256Hex(token), Date.now())
    .first<any>();
}

function ResetForm({ token, title, error }: { token: string; title: string; error?: string }) {
  return (
    <div class="auth-box">
      <Card title={title}>
        {error ? <div class="toast err" role="alert">{error}</div> : null}
        <form method="post" action={`/admin/reset/${token}`} class="stack">
          <Field label="New password" name="password" type="password" required autocomplete="new-password" help={`At least ${MIN_PASSWORD_LENGTH} characters.`} attrs={{ minlength: MIN_PASSWORD_LENGTH }} />
          <Field label="Confirm new password" name="confirm" type="password" required autocomplete="new-password" attrs={{ minlength: MIN_PASSWORD_LENGTH }} />
          <button class="btn primary block" type="submit">Save password</button>
        </form>
      </Card>
    </div>
  );
}

r.get('/reset/:token', async (c) => {
  c.header('referrer-policy', 'no-referrer');
  const t = await findAuthToken(c, c.req.param('token'));
  if (!t) return page(c, { title: 'Link expired' }, <Card title="This link is invalid or has expired"><p><a href="/admin/forgot">Request a new link</a>.</p></Card>, 410);
  return page(c, { title: 'Choose password' }, <ResetForm token={c.req.param('token')} title={t.purpose === 'invite' ? `Welcome, ${t.display_name}` : 'Choose a new password'} />);
});

r.post('/reset/:token', async (c) => {
  const pepper = pepperOf(c.env);
  if (!pepper) return page(c, { title: 'Reset' }, <PepperMissing />, 503);
  const token = c.req.param('token');
  const t = await findAuthToken(c, token);
  if (!t) return page(c, { title: 'Link expired' }, <Card title="This link is invalid or has expired"><p><a href="/admin/forgot">Request a new link</a>.</p></Card>, 410);
  const f = await form(c);
  const problem = f.password !== f.confirm ? 'The passwords do not match.' : passwordProblems(f.password ?? '', t.email);
  if (problem) return page(c, { title: 'Choose password' }, <ResetForm token={token} title="Choose a new password" error={problem} />, 400);
  const h = await hashPassword(f.password, pepper);
  const ts = Date.now();
  const claim = await c.env.DB.prepare('UPDATE auth_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL').bind(ts, t.id).run();
  if (!claim.meta.changes) return c.text('This link has already been used.', 410);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, status = 'active', locked_until = NULL, updated_at = ? WHERE id = ?").bind(h.hash, h.salt, h.iterations, ts, t.user_id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(t.user_id),
    c.env.DB.prepare('DELETE FROM auth_tokens WHERE user_id = ? AND used_at IS NULL').bind(t.user_id),
  ]);
  await logAction(c, t.purpose === 'invite' ? 'user.invite_accepted' : 'password.reset', 'user', t.user_id);
  return back(c, '/admin/login', { ok: 'Password saved. Please sign in.' });
});

export default r;
