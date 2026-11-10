/**
 * Membership application handlers. There are no applicant accounts: every follow-up
 * action (email verification, withdrawal, messages, save-and-resume) is confirmed
 * through a single-use, time-limited link sent to the applicant's email address.
 * Responses never reveal whether an email or reference exists.
 */
import type { Env } from '../env';
import { COUNTRY_CODES, pick } from '../i18n';
import { checkPublicForm, ipKey, overLimit } from '../lib/guard';
import { audit, notifyAdmins } from '../lib/notify';
import { clampStr, DAY, HOUR, isEmail, parseJson, randomToken, referenceCode, sha256Hex } from '../lib/util';
import { queueEmail } from '../email/send';
import type { AppField, SiteData } from '../snapshot/model';
import type { FormState, RenderCtx } from '../views/public/context';

const MAX_DOCS = 3;
const MAX_DOC_BYTES = 10 * 1024 * 1024;
const ACTIVE_STATUSES = ['NEW', 'PENDING_REVIEW', 'UNDER_REVIEW', 'INFORMATION_REQUESTED', 'ACCEPTED'];

function guardMessage(rc: RenderCtx, reason: string): string {
  if (reason === 'too_fast') return rc.t('form.error.too_fast');
  if (reason === 'config') return 'This form is temporarily unavailable (server configuration incomplete).';
  return rc.t('form.error.bot');
}

function collectValues(fields: AppField[], fd: FormData): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of fields) v[f.key] = clampStr(fd.get(f.key), f.type === 'textarea' ? Math.max(f.maxLength, 100) : f.maxLength);
  v.submission_token = clampStr(fd.get('submission_token'), 64);
  v.consent = fd.get('consent') === 'yes' ? 'yes' : '';
  v.terms = fd.get('terms') === 'yes' ? 'yes' : '';
  const resume = clampStr(fd.get('_resume'), 100);
  if (resume) v._resume = resume;
  return v;
}

export function validateApplication(rc: RenderCtx, fields: AppField[], v: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  const { t, locale } = rc;
  for (const f of fields) {
    const val = v[f.key] ?? '';
    if (f.required && (f.type === 'checkbox' ? val !== 'yes' : !val)) {
      errors[f.key] = t('form.error.required');
      continue;
    }
    if (!val) continue;
    if (f.type === 'email' && !isEmail(val)) errors[f.key] = t('form.error.email');
    if (f.type === 'country' && !COUNTRY_CODES.includes(val)) errors[f.key] = t('form.error.required');
    if (f.type === 'select' && f.options.length && !f.options.some((o) => o.value === val)) errors[f.key] = t('form.error.required');
    if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(val)) errors[f.key] = t('form.error.required');
    if (f.type === 'url' && !/^https?:\/\/\S+$/i.test(val)) errors[f.key] = pick({ en: 'Please enter a full web address (https://…).', fr: 'Veuillez saisir une adresse web complète (https://…).' }, locale)!;
  }
  if (v.consent !== 'yes') errors.consent = t('form.error.required');
  if (v.terms !== 'yes') errors.terms = t('form.error.required');
  return errors;
}

async function sniffType(file: File): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const hex = [...head].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.startsWith('25504446')) return 'application/pdf';
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('89504e47')) return 'image/png';
  if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return 'image/webp';
  return null;
}

function documentsOf(fd: FormData): File[] {
  return fd.getAll('documents').filter((f): f is File => typeof f === 'object' && f !== null && 'size' in f && (f as File).size > 0);
}

async function newActionToken(env: Env, action: string, email: string, applicationId: number | null, payload: object, ttlMs: number): Promise<string> {
  const token = randomToken(32);
  await env.DB.prepare('INSERT INTO applicant_actions (token_hash, action, application_id, email, payload_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(await sha256Hex(token), action, applicationId, email, JSON.stringify(payload), Date.now() + ttlMs, Date.now())
    .run();
  return token;
}

const link = (env: Env, rc: RenderCtx, path: string) => env.PUBLIC_BASE_URL.replace(/\/$/, '') + rc.lp(path);

/** POST /apply — submit, or "save and continue later". */
export async function handleApplicationPost(env: Env, ctx: ExecutionContext, req: Request, rc: RenderCtx, data: SiteData): Promise<{ state: FormState; status: number }> {
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return { state: { form: 'apply', message: rc.t('form.error.generic') }, status: 400 };
  }
  const fields = data.applicationFields;
  const values = collectValues(fields, fd);
  const action = fd.get('_action') === 'save' ? 'save' : 'submit';
  const keep = (extra: Partial<FormState>, status = 400) => ({ state: { form: 'apply', values, ...extra }, status });

  if (!data.settings.applicationsOpen) return keep({ message: 'Applications are currently closed.' }, 403);
  const guard = await checkPublicForm(env, req, 'apply', fd, action === 'save' ? 1000 : 4000);
  if (!guard.ok) return keep({ message: guardMessage(rc, guard.reason) }, guard.reason === 'config' ? 503 : 400);

  const ip = await ipKey(req);
  if (await overLimit(env, 'apply_ip', ip, 8, HOUR)) return keep({ message: rc.t('form.error.rate') }, 429);

  const email = (values.email ?? '').toLowerCase();

  // ── Save and continue later ──
  if (action === 'save') {
    if (!isEmail(email)) return keep({ errors: { email: rc.t('form.error.email') }, message: rc.t('form.error.email') });
    if (!(await overLimit(env, 'resume_email', email, 3, DAY))) {
      const saved: Record<string, string> = { ...values };
      delete saved.submission_token;
      delete saved._resume;
      const token = await newActionToken(env, 'resume', email, null, { values: saved, locale: rc.locale }, 7 * DAY);
      await queueEmail(env, ctx, {
        dedupeKey: `resume:${token.slice(0, 16)}`, template: 'application_resume', to: email, locale: rc.locale,
        vars: { link: link(env, rc, `/apply/resume/${token}`) },
      });
    }
    return keep({ info: rc.t('apply.resumeSent', { email }) }, 200);
  }

  // ── Submit ──
  const errors = validateApplication(rc, fields, values);
  const docs = documentsOf(fd);
  if (docs.length > MAX_DOCS) errors.documents = rc.t('apply.error.file');
  const docTypes: string[] = [];
  for (const d of docs) {
    const type = d.size <= MAX_DOC_BYTES ? await sniffType(d) : null;
    if (!type) errors.documents = rc.t('apply.error.file');
    docTypes.push(type ?? '');
  }
  if (Object.keys(errors).length) return keep({ errors, message: rc.t('form.error.generic') });

  const token = values.submission_token && /^[A-Za-z0-9-]{16,64}$/.test(values.submission_token) ? values.submission_token : crypto.randomUUID();
  const successState = { state: { form: 'apply', success: rc.t('apply.submittedBody', { email }) } as FormState, status: 200 };

  // Idempotency: the same form submitted twice (double click, refresh, retry).
  const existingToken = await env.DB.prepare('SELECT id FROM applications WHERE submission_token = ?').bind(token).first();
  if (existingToken) return successState;

  // One active application per email. Respond identically and tell the owner by email.
  const active = await env.DB.prepare(
    `SELECT id, reference, full_name FROM applications WHERE email = ? AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')}) ORDER BY id DESC LIMIT 1`,
  )
    .bind(email, ...ACTIVE_STATUSES)
    .first<{ id: number; reference: string; full_name: string }>();
  if (active) {
    await queueEmail(env, ctx, {
      dedupeKey: `dup:${active.id}:${new Date().toISOString().slice(0, 10)}`, template: 'application_duplicate', to: email, locale: rc.locale,
      applicationId: active.id, vars: { name: active.full_name, reference: active.reference },
    });
    return successState;
  }

  const answers: Record<string, string> = {};
  for (const f of fields) if (!['full_name', 'email', 'country'].includes(f.key)) answers[f.key] = values[f.key] ?? '';
  const ts = Date.now();
  let appId = 0;
  let reference = '';
  for (let attempt = 0; attempt < 4 && !appId; attempt++) {
    reference = referenceCode();
    try {
      const row = await env.DB.prepare(
        `INSERT INTO applications (reference, status, full_name, email, country, locale, answers_json, consent_version, consent_at, submission_token, ip_hash, created_at, updated_at)
         VALUES (?, 'NEW', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
        .bind(reference, values.full_name, email, values.country ?? '', rc.locale, JSON.stringify(answers), data.settings.consentVersion, ts, token, ip, ts, ts)
        .first<{ id: number }>();
      appId = row!.id;
    } catch (e) {
      const msg = String(e);
      if (msg.includes('submission_token')) return successState; // concurrent duplicate
      if (!msg.includes('reference')) throw e;
    }
  }
  if (!appId) throw new Error('could not allocate reference');

  // Private documents → R2 under private/ (never publicly routable)
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    const safeName = d.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80) || 'document';
    const key = `private/applications/${appId}/${crypto.randomUUID()}-${safeName}`;
    try {
      await env.BUCKET.put(key, d.stream(), { httpMetadata: { contentType: docTypes[i] } });
      await env.DB.prepare('INSERT INTO application_documents (application_id, r2_key, file_name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(appId, key, safeName, docTypes[i], d.size, ts)
        .run();
    } catch (e) {
      console.error('apply: document upload failed', String(e));
    }
  }
  await env.DB.prepare("INSERT INTO application_events (application_id, type, to_status, detail, created_at) VALUES (?, 'submitted', 'NEW', ?, ?)")
    .bind(appId, `${docs.length} document(s)`, ts)
    .run();
  if (values._resume) {
    await env.DB.prepare("UPDATE applicant_actions SET used_at = ? WHERE token_hash = ? AND action = 'resume'").bind(ts, await sha256Hex(values._resume)).run();
  }

  const verifyToken = await newActionToken(env, 'verify_email', email, appId, {}, 7 * DAY);
  await queueEmail(env, ctx, {
    dedupeKey: `app-verify:${appId}`, template: 'application_verify', to: email, locale: rc.locale, applicationId: appId,
    vars: { name: values.full_name, reference, link: link(env, rc, `/apply/confirm/${verifyToken}`) },
  });
  return successState;
}

export interface ActionRow { id: number; action: string; application_id: number | null; email: string; payload_json: string; expires_at: number; used_at: number | null }

export async function findAction(env: Env, token: string): Promise<ActionRow | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const row = await env.DB.prepare('SELECT * FROM applicant_actions WHERE token_hash = ?').bind(await sha256Hex(token)).first<ActionRow>();
  if (!row || row.used_at || row.expires_at < Date.now()) return null;
  return row;
}

/** Restores saved answers for /apply/resume/:token (token stays valid until final submission). */
export async function loadResume(env: Env, token: string): Promise<Record<string, string> | null> {
  const row = await findAction(env, token);
  if (!row || row.action !== 'resume') return null;
  const p = parseJson<{ values?: Record<string, string> }>(row.payload_json, {});
  return { ...(p.values ?? {}), _resume: token };
}

/** POST /apply/confirm/:token — executes a confirmed applicant action. Returns a message key. */
export async function executeAction(env: Env, ctx: ExecutionContext, token: string, rc: RenderCtx): Promise<{ ok: boolean; title: string; body: string }> {
  const row = await findAction(env, token);
  const invalid = { ok: false, title: rc.t('common.error'), body: rc.t('applicant.invalid') };
  if (!row || !row.application_id) return invalid;
  // single use: claim the token atomically
  const claimed = await env.DB.prepare('UPDATE applicant_actions SET used_at = ? WHERE id = ? AND used_at IS NULL').bind(Date.now(), row.id).run();
  if (!claimed.meta.changes) return invalid;

  const app = await env.DB.prepare('SELECT id, reference, full_name, email, country, status, locale, assigned_to, email_verified_at FROM applications WHERE id = ?')
    .bind(row.application_id)
    .first<any>();
  if (!app) return invalid;
  const ts = Date.now();
  const adminLink = `/admin/applications/${app.id}`;

  if (row.action === 'verify_email') {
    if (!app.email_verified_at) {
      await env.DB.batch([
        env.DB.prepare('UPDATE applications SET email_verified_at = ?, updated_at = ? WHERE id = ?').bind(ts, ts, app.id),
        env.DB.prepare("INSERT INTO application_events (application_id, type, detail, created_at) VALUES (?, 'email_verified', '', ?)").bind(app.id, ts),
      ]);
      await queueEmail(env, ctx, { dedupeKey: `app-received:${app.id}`, template: 'application_received', to: app.email, locale: app.locale, applicationId: app.id, vars: { name: app.full_name, reference: app.reference } });
      await notifyAdmins(env, ctx, {
        type: 'application_new', title: `New application ${app.reference}`, body: app.full_name, link: adminLink, roles: ['super_admin'],
        email: { template: 'admin_new_application', dedupeKey: `admin-new-app:${app.id}`, applicationId: app.id, vars: { name: app.full_name, reference: app.reference, email: app.email, country: app.country ?? '' } },
      });
    }
    return { ok: true, title: rc.t('apply.verifiedTitle'), body: rc.t('apply.verifiedBody', { ref: app.reference }) };
  }

  if (row.action === 'withdraw') {
    if (app.status !== 'WITHDRAWN') {
      await env.DB.batch([
        env.DB.prepare("UPDATE applications SET status = 'WITHDRAWN', updated_at = ?, decided_at = ? WHERE id = ?").bind(ts, ts, app.id),
        env.DB.prepare("INSERT INTO application_events (application_id, type, from_status, to_status, detail, created_at) VALUES (?, 'status_changed', ?, 'WITHDRAWN', 'Withdrawn by applicant', ?)").bind(app.id, app.status, ts),
      ]);
      await queueEmail(env, ctx, { dedupeKey: `app-withdrawn:${app.id}`, template: 'application_withdrawn', to: app.email, locale: app.locale, applicationId: app.id, vars: { name: app.full_name, reference: app.reference } });
      await notifyAdmins(env, ctx, {
        type: 'application_attention', title: `Application ${app.reference} withdrawn`, link: adminLink, roles: ['super_admin'], userIds: app.assigned_to ? [app.assigned_to] : [],
        email: { template: 'admin_application_withdrawn', dedupeKey: `admin-withdrawn:${app.id}`, applicationId: app.id, vars: { name: app.full_name, reference: app.reference } },
      });
    }
    return { ok: true, title: rc.t('applicant.withdrawTitle'), body: rc.t('applicant.withdrawn') };
  }

  if (row.action === 'message') {
    const message = clampStr(parseJson<{ message?: string }>(row.payload_json, {}).message, 5000);
    const r = await env.DB.prepare("INSERT INTO applicant_messages (application_id, direction, subject, body, created_at) VALUES (?, 'inbound', 'Message from applicant', ?, ?) RETURNING id")
      .bind(app.id, message, ts)
      .first<{ id: number }>();
    await env.DB.prepare("INSERT INTO application_events (application_id, type, detail, created_at) VALUES (?, 'message_received', '', ?)").bind(app.id, ts).run();
    await queueEmail(env, ctx, { dedupeKey: `app-msg-recv:${r!.id}`, template: 'applicant_message_received', to: app.email, locale: app.locale, applicationId: app.id, vars: { name: app.full_name, reference: app.reference } });
    await notifyAdmins(env, ctx, {
      type: 'applicant_reply', title: `Message from ${app.full_name} (${app.reference})`, body: message.slice(0, 200), link: adminLink, roles: ['super_admin'], userIds: app.assigned_to ? [app.assigned_to] : [],
      email: { template: 'admin_applicant_message', dedupeKey: `admin-app-msg:${r!.id}`, applicationId: app.id, vars: { name: app.full_name, reference: app.reference, message } },
    });
    return { ok: true, title: rc.t('applicant.title'), body: rc.t('applicant.confirmed') };
  }
  return invalid;
}

/** POST /apply/message and /apply/withdraw — always responds identically. */
export async function handleApplicantRequest(env: Env, ctx: ExecutionContext, req: Request, rc: RenderCtx, kind: 'message' | 'withdraw'): Promise<{ state: FormState; status: number }> {
  const form = kind === 'message' ? 'applicant_message' : 'applicant_withdraw';
  const fd = await req.formData();
  const values = { reference: clampStr(fd.get('reference'), 20).toUpperCase(), email: clampStr(fd.get('email'), 200).toLowerCase(), message: clampStr(fd.get('message'), 5000) };
  const guard = await checkPublicForm(env, req, form, fd);
  if (!guard.ok) return { state: { form, values, message: guardMessage(rc, guard.reason) }, status: 400 };
  const errors: Record<string, string> = {};
  if (!/^EIC-\d{4}-[A-Z0-9]{6}$/.test(values.reference)) errors.reference = rc.t('form.error.required');
  if (!isEmail(values.email)) errors.email = rc.t('form.error.email');
  if (kind === 'message' && values.message.length < 2) errors.message = rc.t('form.error.required');
  if (Object.keys(errors).length) return { state: { form, values, errors, message: rc.t('form.error.generic') }, status: 400 };

  const ip = await ipKey(req);
  if (await overLimit(env, 'applicant_ip', ip, 10, HOUR)) return { state: { form, values, message: rc.t('form.error.rate') }, status: 429 };

  const sent = { state: { form, success: rc.t('applicant.sent') } as FormState, status: 200 };
  const app = await env.DB.prepare('SELECT id, reference, status, locale FROM applications WHERE reference = ? AND email = ?').bind(values.reference, values.email).first<any>();
  if (!app || (kind === 'withdraw' && ['WITHDRAWN', 'DECLINED', 'ACCEPTED'].includes(app.status))) return sent;
  if (await overLimit(env, `applicant_${kind}`, String(app.id), 5, DAY)) return sent;

  const token = await newActionToken(env, kind, values.email, app.id, kind === 'message' ? { message: values.message } : {}, 2 * DAY);
  await queueEmail(env, ctx, {
    dedupeKey: `app-${kind}-confirm:${token.slice(0, 16)}`, template: kind === 'message' ? 'applicant_message_confirm' : 'application_withdraw_confirm',
    to: values.email, locale: app.locale || rc.locale, applicationId: app.id, vars: { reference: app.reference, link: link(env, rc, `/apply/confirm/${token}`) },
  });
  await audit(env, null, `applicant.${kind}_requested`, 'application', app.id, '', '');
  return sent;
}
