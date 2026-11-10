/**
 * Centralised email sending through the Resend HTTP API.
 *
 * - Every email has a `dedupeKey` (e.g. "app-received:42"). The key is UNIQUE in
 *   email_logs, so a retried request or a double-click can never send the same email
 *   twice. It is also sent to Resend as the Idempotency-Key header.
 * - Delivery happens in ctx.waitUntil(), after the response is returned. A Resend
 *   outage or a bad address can never fail an order, application or form submission.
 *   Failures are logged and retried by the cron job.
 * - The API key comes only from the RESEND_API_KEY Worker secret and is never sent
 *   to the browser.
 */
import type { Env } from '../env';
import { isProduction } from '../env';
import type { SiteSettings } from '../snapshot/model';
import { DEFAULT_SETTINGS } from '../snapshot/model';
import { renderMarkdown, stripMarkdown } from '../lib/markdown';
import { absoluteUrl, escapeHtml, parseJson } from '../lib/util';
import { renderLayout } from './layout';
import { TEMPLATE_DEFS } from './defaults';

export interface EmailRequest {
  dedupeKey: string;
  template: string;
  to: string;
  locale?: string;
  vars?: Record<string, string | number | null | undefined>;
  applicationId?: number | null;
  /** admin notifications go to ADMIN_NOTIFY_EMAIL unless `to` is given explicitly */
}

export interface ResolvedTemplate { subject: string; heading: string; body: string; button: string; audience: 'client' | 'admin' }

export async function resolveTemplate(env: Env, key: string, locale: string): Promise<ResolvedTemplate> {
  const def = TEMPLATE_DEFS[key];
  if (!def) throw new Error(`Unknown email template: ${key}`);
  let rows: { locale: string; subject: string; heading: string; body: string; button_label: string }[] = [];
  try {
    const r = await env.DB.prepare('SELECT locale, subject, heading, body, button_label FROM email_templates WHERE key = ? AND locale IN (?, ?)')
      .bind(key, locale, 'en')
      .all<any>();
    rows = r.results;
  } catch {
    /* database unavailable: fall back to built-in defaults */
  }
  const db = rows.find((r) => r.locale === locale) ?? (def[locale as 'fr'] ? undefined : rows.find((r) => r.locale === 'en'));
  if (db) return { subject: db.subject, heading: db.heading, body: db.body, button: db.button_label, audience: def.audience };
  const d = (def as any)[locale] ?? def.en;
  return { subject: d.subject, heading: d.heading, body: d.body, button: d.button ?? '', audience: def.audience };
}

function fill(s: string, vars: Record<string, string>, html: boolean): string {
  return s.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, k) => {
    const v = vars[k] ?? '';
    return html ? escapeHtml(v).replace(/\r?\n/g, '<br>') : v;
  });
}

export async function loadSettingsForEmail(env: Env): Promise<SiteSettings> {
  try {
    const r = await env.DB.prepare("SELECT key, value FROM site_settings WHERE key IN ('siteName','tagline','emailLogoUrl','contactEmail','contactAddress','footerNote')").all<any>();
    const s: any = { ...DEFAULT_SETTINGS };
    for (const row of r.results) s[row.key] = parseJson(row.value, s[row.key]);
    return s;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function renderEmail(env: Env, settings: SiteSettings, template: string, locale: string, rawVars: Record<string, any>) {
  const t = await resolveTemplate(env, template, locale);
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const vars: Record<string, string> = { site_name: settings.siteName };
  for (const [k, v] of Object.entries(rawVars)) vars[k] = v == null ? '' : String(v);

  const subject = fill(t.subject, vars, false).replace(/[\r\n]+/g, ' ').slice(0, 250);
  const heading = fill(t.heading, vars, false);
  const bodyHtml = fill(renderMarkdown(t.body), vars, true).replace(/<p>\s*<\/p>/g, '');
  const bodyText = fill(t.body, vars, false).replace(/\*\*/g, '');
  const link = vars.link || '';
  const button = link && t.button ? { label: fill(t.button, vars, false), url: link } : undefined;
  const tagline = (settings.tagline as any)[locale] ?? settings.tagline.en;
  const address = (settings.contactAddress as any)?.[locale] ?? settings.contactAddress?.en ?? '';
  const footerLines = [
    `<strong style="color:#E9E0CD;letter-spacing:.12em;text-transform:uppercase">${escapeHtml(settings.siteName)}</strong>`,
    address ? escapeHtml(address) : '',
    `<a href="${escapeHtml(base)}" style="color:#B89554">${escapeHtml(base.replace(/^https?:\/\//, ''))}</a> · ${escapeHtml(env.EMAIL_REPLY_TO)}`,
    t.audience === 'client'
      ? locale === 'fr'
        ? 'Vous recevez cet e-mail suite à une démarche effectuée sur notre site. Nous ne vous demanderons jamais d’argent, de mot de passe ou de coordonnées bancaires par e-mail.'
        : 'You are receiving this email because of an action taken on our website. We will never ask you for money, passwords or banking details by email.'
      : 'Administrator notification.',
  ];
  const html = renderLayout({
    siteName: settings.siteName,
    tagline,
    logoUrl: absoluteUrl(base, settings.emailLogoUrl || '/assets/logo-email.png'),
    baseUrl: base,
    heading,
    bodyHtml,
    button,
    preheader: stripMarkdown(bodyText).slice(0, 140),
    footerLines,
    locale,
  });
  const text = `${heading}\n\n${bodyText}${button ? `\n\n${button.label}: ${button.url}` : ''}\n\n—\n${settings.siteName}\n${base}`;
  return { subject, html, text, audience: t.audience };
}

/**
 * Queue an email: render it, record it (deduplicated), then deliver in the background.
 * Never throws.
 */
export async function queueEmail(env: Env, ctx: ExecutionContext, req: EmailRequest, settings?: SiteSettings): Promise<{ queued: boolean; duplicate?: boolean }> {
  try {
    const s = settings ?? (await loadSettingsForEmail(env));
    const locale = req.locale && TEMPLATE_DEFS[req.template] ? req.locale : 'en';
    const r = await renderEmail(env, s, req.template, locale, req.vars ?? {});
    const ts = Date.now();
    let id: number | null = null;
    try {
      const row = await env.DB.prepare(
        `INSERT INTO email_logs (dedupe_key, template_key, category, to_email, subject, html, text, application_id, status, attempts, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id`,
      )
        .bind(req.dedupeKey, req.template, r.audience, req.to, r.subject, r.html, r.text, req.applicationId ?? null, ts, ts)
        .first<{ id: number }>();
      if (!row) return { queued: false, duplicate: true };
      id = row.id;
    } catch (e) {
      // Logging failed (e.g. DB down): still attempt delivery so the user gets their email.
      console.error('email: could not log email, sending without log', String(e));
    }
    ctx.waitUntil(deliver(env, { id, to: req.to, subject: r.subject, html: r.html, text: r.text, dedupeKey: req.dedupeKey, template: req.template }));
    return { queued: true };
  } catch (e) {
    console.error('email: queue failed', req.template, String(e));
    return { queued: false };
  }
}

interface Delivery { id: number | null; to: string; subject: string; html: string; text: string; dedupeKey: string; template: string }

function resendBase(env: Env) {
  if (!isProduction(env) && env.RESEND_API_BASE) return env.RESEND_API_BASE.replace(/\/$/, '');
  return 'https://api.resend.com';
}

async function setStatus(env: Env, id: number | null, status: string, fields: { provider_id?: string | null; error?: string | null } = {}) {
  if (id == null) return;
  try {
    await env.DB.prepare('UPDATE email_logs SET status = ?, provider_id = COALESCE(?, provider_id), error = ?, updated_at = ? WHERE id = ?')
      .bind(status, fields.provider_id ?? null, fields.error ?? null, Date.now(), id)
      .run();
  } catch (e) {
    console.error('email: status update failed', String(e));
  }
}

/** Send one email via Resend with short in-request retries for transient errors. Never throws. */
export async function deliver(env: Env, d: Delivery): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    await setStatus(env, d.id, 'skipped', { error: 'RESEND_API_KEY is not configured (npx wrangler secret put RESEND_API_KEY)' });
    return false;
  }
  if (d.id != null) {
    try {
      await env.DB.prepare("UPDATE email_logs SET status = 'sending', attempts = attempts + 1, updated_at = ? WHERE id = ?").bind(Date.now(), d.id).run();
    } catch {
      /* ignore */
    }
  }
  const fromName = (env.EMAIL_FROM_NAME || 'Eternal Illuminati Covenant').replace(/["<>]/g, '');
  const payload = {
    from: `${fromName} <${env.EMAIL_FROM}>`,
    to: [d.to],
    reply_to: env.EMAIL_REPLY_TO,
    subject: d.subject,
    html: d.html,
    text: d.text,
    tags: [{ name: 'template', value: d.template.replace(/[^A-Za-z0-9_-]/g, '_') }],
  };
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, attempt * 1500));
    try {
      const res = await fetch(`${resendBase(env)}/emails`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          'content-type': 'application/json',
          'idempotency-key': d.dedupeKey.slice(0, 256),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await res.text();
      if (res.ok) {
        const id = parseJson<{ id?: string }>(body, {}).id ?? null;
        await setStatus(env, d.id, 'sent', { provider_id: id, error: null });
        return true;
      }
      lastErr = `HTTP ${res.status}: ${body.slice(0, 300)}`;
      if (res.status !== 429 && res.status < 500) break; // permanent (validation, auth, unverified domain)
    } catch (e) {
      lastErr = `network: ${String(e).slice(0, 200)}`;
    }
  }
  console.error('email: delivery failed', d.template, lastErr);
  await setStatus(env, d.id, 'failed', { error: lastErr });
  return false;
}

/** Re-send a logged email (admin "Retry" button and cron). */
export async function retryLoggedEmail(env: Env, id: number): Promise<boolean> {
  const row = await env.DB.prepare('SELECT id, to_email, subject, html, text, dedupe_key, template_key, attempts FROM email_logs WHERE id = ?').bind(id).first<any>();
  if (!row) return false;
  return deliver(env, { id: row.id, to: row.to_email, subject: row.subject, html: row.html, text: row.text, dedupeKey: `${row.dedupe_key}:r${row.attempts}`, template: row.template_key });
}
