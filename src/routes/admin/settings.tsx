import { Hono } from 'hono';
import type { AppEnv, Role } from '../../env';
import { en as EN_STRINGS } from '../../i18n/en';
import { ROLE_LABELS } from '../../lib/auth';
import { clampStr, isEmail, parseJson, safeHref, slugify } from '../../lib/util';
import { DEFAULT_SETTINGS, SNAPSHOT_SCHEMA } from '../../snapshot/model';
import { dropMemoryCopy, peekR2Snapshot, snapshotEnabled, snapshotStatus } from '../../snapshot/snapshot';
import { Badge, Card, Check, ConfirmForm, Empty, Field, MediaField, Select, Time } from '../../views/admin/ui';
import { back, contentChanged, intParam, logAction, page, type C } from './common';
import { sendAuthLink } from './auth';
import { buildSqlDump } from '../../lib/backup';

// ════════════════════ Site settings ════════════════════
export const settings = new Hono<AppEnv>();

async function loadSettings(c: C) {
  const rows = (await c.env.DB.prepare('SELECT key, value FROM site_settings').all<any>()).results;
  const s: any = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) s[r.key] = parseJson(r.value, s[r.key]);
  return s as typeof DEFAULT_SETTINGS;
}

settings.get('/', async (c) => {
  const s = await loadSettings(c);
  const r2 = await peekR2Snapshot(c.env);
  const st = snapshotStatus();
  const L = ['en', 'fr', 'es'];
  return page(c, { title: 'Website settings', active: 'settings' }, (
    <>
      <div class="tabs"><a href="/admin/settings" aria-current="page">General</a><a href="/admin/settings/navigation">Navigation</a><a href="/admin/settings/translations">Translations</a><a href="/admin/settings/fields">Application form</a></div>
      <form method="post" action="/admin/settings" class="stack">
        <Card title="Identity">
          <Field label="Organisation name" name="siteName" value={s.siteName} required max={100} />
          {L.map((l) => <Field label={`Tagline (${l.toUpperCase()})`} name={`tagline_${l}`} value={(s.tagline as any)[l] ?? ''} max={120} />)}
          {L.map((l) => <Field label={`Default description for search engines (${l.toUpperCase()})`} name={`description_${l}`} value={(s.description as any)[l] ?? ''} type="textarea" rows={2} max={300} />)}
          <MediaField label="Logo for the website header (leave as /assets/logo.svg to use the built-in emblem)" name="logoUrl" value={s.logoUrl} />
          <MediaField label="Logo for emails (PNG or JPG — email clients do not display SVG)" name="emailLogoUrl" value={s.emailLogoUrl} help="Must be publicly reachable over HTTPS once the site is live." />
          <MediaField label="Default social sharing image" name="defaultOgImage" value={s.defaultOgImage} />
        </Card>
        <Card title="Contact & footer">
          <Field label="Public contact email" name="contactEmail" type="email" value={s.contactEmail} max={200} />
          {L.map((l) => <Field label={`Postal address (${l.toUpperCase()})`} name={`contactAddress_${l}`} value={(s.contactAddress as any)[l] ?? ''} type="textarea" rows={2} max={300} />)}
          {L.map((l) => <Field label={`Footer note (${l.toUpperCase()}) — leave empty for the standard independence statement`} name={`footerNote_${l}`} value={(s.footerNote as any)[l] ?? ''} type="textarea" rows={2} max={400} />)}
          <Field label="Social links (one per line: Label | https://…)" name="socials" type="textarea" rows={3} value={s.socials.map((x) => `${x.label} | ${x.url}`).join('\n')} />
        </Card>
        <Card title="Languages">
          {L.map((l) => <Check label={{ en: 'English (default, always on)', fr: 'Français', es: 'Español (UI partially translated)' }[l]!} name={`locale_${l}`} checked={s.enabledLocales.includes(l) || l === 'en'} />)}
        </Card>
        <Card title="Membership applications">
          <Check label="Accept new applications" name="applicationsOpen" checked={s.applicationsOpen} />
          <Field label="Consent / terms version (change when you update the privacy notice or terms)" name="consentVersion" value={s.consentVersion} max={30} />
          <Field label="Retention period after a decision (days)" name="retentionDays" type="number" value={s.retentionDays} help="Decided applications older than this are listed under Applications → Past retention for deletion." />
        </Card>
        <Card title="Privacy-friendly analytics">
          <Field label="Cloudflare Web Analytics token (optional, cookieless)" name="analyticsToken" value={s.analyticsToken} max={100} />
        </Card>
        <div class="sticky-actions"><button class="btn primary" type="submit">Save settings</button></div>
      </form>
      <Card title="Public content cache (snapshot)">
        <p class="help">Public pages are served from a published snapshot, so visitor traffic never reads the database. It refreshes automatically after every admin change.</p>
        <p class="kv"><span>Mode</span><strong>{snapshotEnabled(c.env) ? 'On' : 'Off (reading database directly)'}</strong></p>
        <p class="kv"><span>Stored copy</span>{r2 ? <span>generated <Time ts={r2.generatedAt} /> · schema {r2.schema}</span> : <span class="muted">none</span>}</p>
        <p class="kv"><span>Last served from</span><span>{st.source}</span></p>
        <form method="post" action="/admin/settings/rebuild-cache"><button class="btn small" type="submit">Rebuild now</button></form>
      </Card>
    </>
  ));
});

settings.post('/', async (c) => {
  const f = await c.req.parseBody();
  const L = ['en', 'fr', 'es'];
  const tr = (prefix: string, max: number) => Object.fromEntries(L.map((l) => [l, clampStr(f[`${prefix}_${l}`], max)]).filter(([, v]) => v));
  const socials = String(f.socials ?? '').split('\n').map((line) => line.split('|').map((x) => x.trim())).filter(([label, url]) => label && safeHref(url ?? '')).map(([label, url]) => ({ label: label.slice(0, 40), url: safeHref(url) })).slice(0, 10);
  const contactEmail = clampStr(f.contactEmail, 200);
  const values: Record<string, any> = {
    siteName: clampStr(f.siteName, 100) || DEFAULT_SETTINGS.siteName,
    tagline: { en: DEFAULT_SETTINGS.tagline.en, ...tr('tagline', 120) },
    description: { en: '', ...tr('description', 300) },
    logoUrl: safeHref(clampStr(f.logoUrl, 500)) || '/assets/logo.svg',
    emailLogoUrl: safeHref(clampStr(f.emailLogoUrl, 500)) || '/assets/logo-email.png',
    defaultOgImage: safeHref(clampStr(f.defaultOgImage, 500)),
    contactEmail: isEmail(contactEmail) ? contactEmail : '',
    contactAddress: { en: '', ...tr('contactAddress', 300) },
    footerNote: { en: '', ...tr('footerNote', 400) },
    socials,
    enabledLocales: ['en', ...['fr', 'es'].filter((l) => f[`locale_${l}`] === '1')],
    applicationsOpen: f.applicationsOpen === '1',
    consentVersion: clampStr(f.consentVersion, 30) || DEFAULT_SETTINGS.consentVersion,
    retentionDays: Math.max(30, Math.min(3650, parseInt(String(f.retentionDays), 10) || 730)),
    analyticsToken: clampStr(f.analyticsToken, 100).replace(/[^A-Za-z0-9]/g, ''),
  };
  const ts = Date.now();
  await c.env.DB.batch(Object.entries(values).map(([k, v]) => c.env.DB.prepare('INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(k, JSON.stringify(v), ts)));
  await contentChanged(c, 'settings.save', 'settings', '');
  return back(c, '/admin/settings', { ok: 'Settings saved and published.' });
});

settings.post('/rebuild-cache', async (c) => {
  dropMemoryCopy();
  const ok = await contentChanged(c, 'snapshot.rebuild', 'snapshot', SNAPSHOT_SCHEMA);
  return back(c, '/admin/settings', ok ? { ok: 'Snapshot rebuilt.' } : { error: 'Rebuild failed — the database may be unavailable. The last good copy is still being served.' });
});

// ───────── Navigation ─────────
settings.get('/navigation', async (c) => {
  const items = (await c.env.DB.prepare('SELECT * FROM navigation_items ORDER BY location, parent_id IS NOT NULL, parent_id, sort, id').all<any>()).results;
  const tops = items.filter((i) => !i.parent_id && i.location === 'header');
  const row = (i: any) => {
    const label = parseJson<Record<string, string>>(i.label_json, {});
    return (
      <details class="card nav-item">
        <summary><strong>{label.en}</strong> <span class="muted small">{i.href}{i.parent_id ? ' · submenu' : ''}{i.visible ? '' : ' · hidden'}</span></summary>
        <form method="post" action={`/admin/settings/navigation/${i.id}`} class="stack">
          <Field label="Label (EN)" name="label_en" value={label.en ?? ''} required max={60} />
          <Field label="Label (FR)" name="label_fr" value={label.fr ?? ''} max={60} />
          <Field label="Label (ES)" name="label_es" value={label.es ?? ''} max={60} />
          <Field label="Link" name="href" value={i.href} required max={300} />
          <Select label="Location" name="location" value={i.location} options={[{ value: 'header', label: 'Header' }, { value: 'footer', label: 'Footer' }, { value: 'legal', label: 'Footer — legal' }]} />
          <Select label="Submenu of" name="parent_id" value={String(i.parent_id ?? '')} options={[{ value: '', label: '— Top level —' }, ...tops.filter((t) => t.id !== i.id).map((t) => ({ value: String(t.id), label: parseJson<any>(t.label_json, {}).en }))]} />
          <Field label="Order" name="sort" type="number" value={i.sort} />
          <Check label="Visible" name="visible" checked={!!i.visible} />
          <Check label="Show as highlighted button" name="is_button" checked={!!i.is_button} />
          <div class="row wrap"><button class="btn primary" type="submit">Save</button></div>
        </form>
        <ConfirmForm action={`/admin/settings/navigation/${i.id}/delete`} label="Delete link" message="Delete this navigation link (and its submenu)?" small />
      </details>
    );
  };
  return page(c, { title: 'Navigation', active: 'settings', back: { href: '/admin/settings', label: 'Settings' } }, (
    <>
      {['header', 'footer', 'legal'].map((loc) => (
        <section><h2 class="sub">{loc === 'legal' ? 'Footer — legal' : loc[0].toUpperCase() + loc.slice(1)}</h2>{items.filter((i) => i.location === loc).map(row)}</section>
      ))}
      <Card title="Add a link">
        <form method="post" action="/admin/settings/navigation" class="stack">
          <Field label="Label (EN)" name="label_en" required max={60} />
          <Field label="Label (FR)" name="label_fr" max={60} />
          <Field label="Link" name="href" required placeholder="/page" max={300} />
          <Select label="Location" name="location" options={[{ value: 'header', label: 'Header' }, { value: 'footer', label: 'Footer' }, { value: 'legal', label: 'Footer — legal' }]} />
          <Select label="Submenu of" name="parent_id" options={[{ value: '', label: '— Top level —' }, ...tops.map((t) => ({ value: String(t.id), label: parseJson<any>(t.label_json, {}).en }))]} />
          <Field label="Order" name="sort" type="number" value={100} />
          <button class="btn primary" type="submit">Add link</button>
        </form>
      </Card>
    </>
  ));
});

function navValues(f: Record<string, any>) {
  const label: Record<string, string> = {};
  for (const l of ['en', 'fr', 'es']) { const v = clampStr(f[`label_${l}`], 60); if (v) label[l] = v; }
  return {
    label_json: JSON.stringify(label), href: safeHref(clampStr(f.href, 300)) || '/', location: ['header', 'footer', 'legal'].includes(f.location) ? f.location : 'header',
    parent_id: f.parent_id ? parseInt(f.parent_id, 10) || null : null, sort: parseInt(f.sort, 10) || 0, visible: f.visible === undefined ? 1 : f.visible === '1' ? 1 : 0, is_button: f.is_button === '1' ? 1 : 0,
  };
}

settings.post('/navigation', async (c) => {
  const v = navValues(await c.req.parseBody());
  await c.env.DB.prepare('INSERT INTO navigation_items (label_json, href, location, parent_id, sort, visible, is_button) VALUES (?, ?, ?, ?, ?, 1, ?)').bind(v.label_json, v.href, v.location, v.parent_id, v.sort, v.is_button).run();
  await contentChanged(c, 'navigation.add', 'navigation', v.href);
  return back(c, '/admin/settings/navigation', { ok: 'Link added.' });
});

settings.post('/navigation/:id{[0-9]+}', async (c) => {
  const f = await c.req.parseBody();
  const v = navValues({ ...f, visible: f.visible ?? '0' });
  await c.env.DB.prepare('UPDATE navigation_items SET label_json = ?, href = ?, location = ?, parent_id = ?, sort = ?, visible = ?, is_button = ? WHERE id = ?').bind(v.label_json, v.href, v.location, v.parent_id, v.sort, v.visible, v.is_button, intParam(c, 'id')).run();
  await contentChanged(c, 'navigation.save', 'navigation', intParam(c, 'id'));
  return back(c, '/admin/settings/navigation', { ok: 'Link saved.' });
});

settings.post('/navigation/:id{[0-9]+}/delete', async (c) => {
  await c.env.DB.prepare('DELETE FROM navigation_items WHERE id = ?').bind(intParam(c, 'id')).run();
  await contentChanged(c, 'navigation.delete', 'navigation', intParam(c, 'id'));
  return back(c, '/admin/settings/navigation', { ok: 'Link deleted.' });
});

// ───────── UI translations ─────────
settings.get('/translations', async (c) => {
  const locale = ['fr', 'es', 'en'].includes(c.req.query('locale') ?? '') ? c.req.query('locale')! : 'fr';
  const rows = (await c.env.DB.prepare('SELECT key, value FROM language_translations WHERE locale = ?').bind(locale).all<any>()).results;
  const over = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const { fr } = await import('../../i18n/fr');
  const { es } = await import('../../i18n/es');
  const builtIn: Record<string, any> = { en: EN_STRINGS, fr, es }[locale]!;
  return page(c, { title: 'Interface translations', active: 'settings', back: { href: '/admin/settings', label: 'Settings' } }, (
    <>
      <div class="tabs">{['fr', 'es', 'en'].map((l) => <a href={`/admin/settings/translations?locale=${l}`} aria-current={l === locale ? 'page' : undefined}>{l.toUpperCase()}</a>)}</div>
      <p class="help">Override any interface text. Leave a field empty to use the built-in text. Membership and legal wording must be reviewed before publication.</p>
      <form method="post" action={`/admin/settings/translations?locale=${locale}`} class="stack">
        {Object.entries(EN_STRINGS).map(([k, v]) => (
          <Field label={`${k} — EN: ${v.slice(0, 90)}${v.length > 90 ? '…' : ''}`} name={k} value={over[k] ?? ''} placeholder={builtIn[k] ?? '(not translated — English shown)'} type={v.length > 80 ? 'textarea' : 'text'} rows={2} max={1000} />
        ))}
        <div class="sticky-actions"><button class="btn primary" type="submit">Save translations</button></div>
      </form>
    </>
  ));
});

settings.post('/translations', async (c) => {
  const locale = ['fr', 'es', 'en'].includes(c.req.query('locale') ?? '') ? c.req.query('locale')! : 'fr';
  const f = await c.req.parseBody();
  const ts = Date.now();
  const stmts = Object.keys(EN_STRINGS).map((k) => {
    const v = clampStr(f[k], 1000);
    return v
      ? c.env.DB.prepare('INSERT INTO language_translations (locale, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(locale, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(locale, k, v, ts)
      : c.env.DB.prepare('DELETE FROM language_translations WHERE locale = ? AND key = ?').bind(locale, k);
  });
  await c.env.DB.batch(stmts);
  await contentChanged(c, 'translations.save', 'translations', locale);
  return back(c, `/admin/settings/translations?locale=${locale}`, { ok: 'Translations saved.' });
});

// ───────── Application form fields ─────────
const FIELD_TYPES = ['text', 'email', 'tel', 'url', 'textarea', 'select', 'country', 'date', 'checkbox'];

settings.get('/fields', async (c) => {
  const fields = (await c.env.DB.prepare('SELECT * FROM application_fields ORDER BY step, sort, id').all<any>()).results;
  const editor = (f: any | null) => {
    const label = parseJson<Record<string, string>>(f?.label_json, {});
    const help = parseJson<Record<string, string>>(f?.help_json, {});
    const opts = parseJson<any[]>(f?.options_json, []).map((o) => `${o.value} | ${o.label?.en ?? ''} | ${o.label?.fr ?? ''}`).join('\n');
    return (
      <form method="post" action={f ? `/admin/settings/fields/${f.id}` : '/admin/settings/fields'} class="stack">
        {!f ? <Field label="Key (internal name)" name="key" required max={40} help="Lowercase letters and underscores, e.g. languages_spoken" /> : null}
        <Select label="Step" name="step" value={String(f?.step ?? 2)} options={[{ value: '1', label: '1 — Personal information' }, { value: '2', label: '2 — Background' }, { value: '3', label: '3 — Motivation' }]} />
        {f?.core ? <p class="help">Core field: type and requirement are fixed.</p> : <Select label="Type" name="type" value={f?.type ?? 'text'} options={FIELD_TYPES.map((t) => ({ value: t, label: t }))} />}
        <Field label="Label (EN)" name="label_en" value={label.en ?? ''} required max={200} />
        <Field label="Label (FR)" name="label_fr" value={label.fr ?? ''} max={200} />
        <Field label="Help text (EN)" name="help_en" value={help.en ?? ''} max={300} />
        <Field label="Help text (FR)" name="help_fr" value={help.fr ?? ''} max={300} />
        <Field label="Options for 'select' (one per line: value | English | French)" name="options" type="textarea" rows={3} value={opts} />
        <Field label="Maximum length" name="max_length" type="number" value={f?.max_length ?? 500} />
        <Field label="Order" name="sort" type="number" value={f?.sort ?? 100} />
        {!f?.core ? <Check label="Required" name="required" checked={!!f?.required} /> : null}
        {!f?.core ? <Check label="Active (shown on the form)" name="active" checked={f ? !!f.active : true} /> : null}
        <button class="btn primary" type="submit">{f ? 'Save field' : 'Add field'}</button>
      </form>
    );
  };
  return page(c, { title: 'Application form', active: 'settings', back: { href: '/admin/settings', label: 'Settings' } }, (
    <>
      <p class="help">Changes apply to new submissions immediately. Previous answers are kept. Data minimisation: only ask for what you need to review an application.</p>
      {[1, 2, 3].map((step) => (
        <section>
          <h2 class="sub">Step {step}</h2>
          {fields.filter((f) => f.step === step).map((f) => (
            <details class="card">
              <summary><strong>{parseJson<any>(f.label_json, {}).en}</strong> <span class="muted small">{f.type}{f.required ? ' · required' : ''}{f.core ? ' · core' : ''}{f.active ? '' : ' · inactive'}</span></summary>
              {editor(f)}
              {!f.core ? <ConfirmForm action={`/admin/settings/fields/${f.id}/delete`} label="Delete field" message="Delete this field? Existing answers remain in past applications." small /> : null}
            </details>
          ))}
        </section>
      ))}
      <Card title="Add a field">{editor(null)}</Card>
    </>
  ));
});

function fieldValues(f: Record<string, any>, core: boolean) {
  const tr = (p: string, max: number) => Object.fromEntries(['en', 'fr', 'es'].map((l) => [l, clampStr(f[`${p}_${l}`], max)]).filter(([, v]) => v));
  const options = String(f.options ?? '').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter(([v]) => v).map(([value, en, fr]) => ({ value: slugify(value).replace(/-/g, '_') || value, label: { en: en || value, ...(fr ? { fr } : {}) } })).slice(0, 50);
  return {
    step: [1, 2, 3].includes(parseInt(f.step, 10)) ? parseInt(f.step, 10) : 2,
    type: FIELD_TYPES.includes(f.type) ? f.type : 'text',
    label_json: JSON.stringify(tr('label', 200)), help_json: JSON.stringify(tr('help', 300)), options_json: JSON.stringify(options),
    max_length: Math.max(10, Math.min(10000, parseInt(f.max_length, 10) || 500)), sort: parseInt(f.sort, 10) || 0,
    required: core ? undefined : f.required === '1' ? 1 : 0, active: core ? undefined : f.active === '1' ? 1 : 0,
  };
}

settings.post('/fields', async (c) => {
  const f = await c.req.parseBody();
  const key = String(f.key ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40);
  if (!key || (await c.env.DB.prepare('SELECT id FROM application_fields WHERE key = ?').bind(key).first())) return back(c, '/admin/settings/fields', { error: 'Choose a unique key.' });
  const v = fieldValues(f as any, false);
  if (!JSON.parse(v.label_json).en) return back(c, '/admin/settings/fields', { error: 'An English label is required.' });
  await c.env.DB.prepare('INSERT INTO application_fields (key, step, type, label_json, help_json, options_json, required, core, max_length, sort, active) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)')
    .bind(key, v.step, v.type, v.label_json, v.help_json, v.options_json, v.required, v.max_length, v.sort, v.active).run();
  await contentChanged(c, 'fields.add', 'application_field', key);
  return back(c, '/admin/settings/fields', { ok: 'Field added.' });
});

settings.post('/fields/:id{[0-9]+}', async (c) => {
  const id = intParam(c, 'id');
  const existing = await c.env.DB.prepare('SELECT * FROM application_fields WHERE id = ?').bind(id).first<any>();
  if (!existing) return back(c, '/admin/settings/fields');
  const v = fieldValues((await c.req.parseBody()) as any, !!existing.core);
  if (!JSON.parse(v.label_json).en) return back(c, '/admin/settings/fields', { error: 'An English label is required.' });
  await c.env.DB.prepare('UPDATE application_fields SET step = ?, type = ?, label_json = ?, help_json = ?, options_json = ?, required = ?, max_length = ?, sort = ?, active = ? WHERE id = ?')
    .bind(existing.core ? existing.step : v.step, existing.core ? existing.type : v.type, v.label_json, v.help_json, v.options_json, v.required ?? existing.required, v.max_length, v.sort, v.active ?? existing.active, id).run();
  await contentChanged(c, 'fields.save', 'application_field', existing.key);
  return back(c, '/admin/settings/fields', { ok: 'Field saved.' });
});

settings.post('/fields/:id{[0-9]+}/delete', async (c) => {
  await c.env.DB.prepare('DELETE FROM application_fields WHERE id = ? AND core = 0').bind(intParam(c, 'id')).run();
  await contentChanged(c, 'fields.delete', 'application_field', intParam(c, 'id'));
  return back(c, '/admin/settings/fields', { ok: 'Field deleted.' });
});

// ════════════════════ Administrators ════════════════════
export const users = new Hono<AppEnv>();
const ROLES = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

users.get('/', async (c) => {
  const list = (await c.env.DB.prepare('SELECT id, email, display_name, role, status, totp_secret IS NOT NULL AS mfa, last_login_at, locked_until FROM users ORDER BY role, display_name').all<any>()).results;
  const me = c.get('user');
  return page(c, { title: 'Administrators', active: 'users' }, (
    <>
      {list.map((u) => (
        <details class="card">
          <summary><strong>{u.display_name}</strong> <span class="muted small">{u.email} · {ROLE_LABELS[u.role as Role]}{u.mfa ? ' · MFA' : ''}</span> <Badge status={u.status} /></summary>
          <p class="kv"><span>Last sign-in</span><Time ts={u.last_login_at} /></p>
          {u.locked_until && u.locked_until > Date.now() ? <p class="kv"><span>Locked until</span><Time ts={u.locked_until} /></p> : null}
          {u.id !== me.id ? (
            <>
              <form method="post" action={`/admin/users/${u.id}`} class="stack">
                <Field label="Name" name="display_name" value={u.display_name} required max={100} />
                <Select label="Role" name="role" value={u.role} options={ROLES} />
                <Select label="Status" name="status" value={u.status} options={[{ value: 'active', label: 'Active' }, { value: 'disabled', label: 'Disabled' }, ...(u.status === 'invited' ? [{ value: 'invited', label: 'Invited' }] : [])]} />
                <button class="btn primary" type="submit">Save</button>
              </form>
              <div class="row wrap">
                <form method="post" action={`/admin/users/${u.id}/send-link`}><button class="btn small" type="submit">{u.status === 'invited' ? 'Resend invitation' : 'Email a password reset link'}</button></form>
                <form method="post" action={`/admin/users/${u.id}/signout`}><button class="btn small" type="submit">Sign out everywhere</button></form>
                {u.mfa ? <ConfirmForm action={`/admin/users/${u.id}/reset-mfa`} label="Reset MFA" message="Remove this administrator's two-step verification? They can set it up again." small /> : null}
                <ConfirmForm action={`/admin/users/${u.id}/delete`} label="Delete" message="Delete this administrator? Their past actions stay in the audit log." small />
              </div>
            </>
          ) : <p class="help">This is you. Manage your own password and MFA under <a href="/admin/account">My account</a>.</p>}
        </details>
      ))}
      <Card title="Invite an administrator">
        <form method="post" action="/admin/users" class="stack">
          <Field label="Name" name="display_name" required max={100} />
          <Field label="Email" name="email" type="email" required max={200} />
          <Select label="Role" name="role" value="reviewer" options={ROLES} />
          <p class="help">They receive an email with a link (valid 72 hours) to choose their own password. You never handle their password.</p>
          <button class="btn primary" type="submit">Send invitation</button>
        </form>
      </Card>
    </>
  ));
});

users.post('/', async (c) => {
  const f = await c.req.parseBody();
  const email = clampStr(f.email, 200).toLowerCase();
  const name = clampStr(f.display_name, 100);
  const role = (ROLES.some((r) => r.value === f.role) ? f.role : 'reviewer') as Role;
  if (!isEmail(email) || !name) return back(c, '/admin/users', { error: 'Name and a valid email are required.' });
  if (await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()) return back(c, '/admin/users', { error: 'An administrator with this email already exists.' });
  const ts = Date.now();
  const row = await c.env.DB.prepare("INSERT INTO users (email, display_name, role, status, created_at, updated_at) VALUES (?, ?, ?, 'invited', ?, ?) RETURNING id").bind(email, name, role, ts, ts).first<{ id: number }>();
  await sendAuthLink(c, { id: row!.id, email, display_name: name, role }, 'invite');
  await logAction(c, 'user.invited', 'user', row!.id, `${email} as ${role}`);
  return back(c, '/admin/users', { ok: `Invitation sent to ${email}.` });
});

async function superAdminsLeft(c: C, excludingId: number) {
  return (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin' AND status = 'active' AND id != ?").bind(excludingId).first<{ n: number }>())?.n ?? 0;
}

users.post('/:id{[0-9]+}', async (c) => {
  const id = intParam(c, 'id');
  if (id === c.get('user').id) return back(c, '/admin/users', { error: 'You cannot change your own role or status.' });
  const f = await c.req.parseBody();
  const role = ROLES.some((r) => r.value === f.role) ? f.role : 'reviewer';
  const status = ['active', 'disabled', 'invited'].includes(String(f.status)) ? f.status : 'active';
  const cur = await c.env.DB.prepare('SELECT role, status FROM users WHERE id = ?').bind(id).first<any>();
  if (cur?.role === 'super_admin' && (role !== 'super_admin' || status !== 'active') && (await superAdminsLeft(c, id)) === 0) return back(c, '/admin/users', { error: 'At least one active Super Administrator is required.' });
  await c.env.DB.prepare('UPDATE users SET display_name = ?, role = ?, status = ?, updated_at = ? WHERE id = ?').bind(clampStr(f.display_name, 100), role, status, Date.now(), id).run();
  if (status === 'disabled' || role !== cur?.role) await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
  await logAction(c, 'user.updated', 'user', id, `role=${role} status=${status}`);
  return back(c, '/admin/users', { ok: 'Administrator updated.' });
});

users.post('/:id{[0-9]+}/send-link', async (c) => {
  const u = await c.env.DB.prepare("SELECT id, email, display_name, role, status FROM users WHERE id = ? AND status != 'disabled'").bind(intParam(c, 'id')).first<any>();
  if (!u) return back(c, '/admin/users', { error: 'Not available for disabled accounts.' });
  await sendAuthLink(c, u, u.status === 'invited' ? 'invite' : 'reset');
  await logAction(c, u.status === 'invited' ? 'user.invite_resent' : 'user.reset_sent', 'user', u.id);
  return back(c, '/admin/users', { ok: `Link emailed to ${u.email}.` });
});

users.post('/:id{[0-9]+}/signout', async (c) => {
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(intParam(c, 'id')).run();
  await logAction(c, 'user.sessions_revoked', 'user', intParam(c, 'id'));
  return back(c, '/admin/users', { ok: 'All sessions for that administrator were ended.' });
});

users.post('/:id{[0-9]+}/reset-mfa', async (c) => {
  await c.env.DB.prepare('UPDATE users SET totp_secret = NULL, updated_at = ? WHERE id = ?').bind(Date.now(), intParam(c, 'id')).run();
  await logAction(c, 'user.mfa_reset', 'user', intParam(c, 'id'));
  return back(c, '/admin/users', { ok: 'MFA removed.' });
});

users.post('/:id{[0-9]+}/delete', async (c) => {
  const id = intParam(c, 'id');
  if (id === c.get('user').id) return back(c, '/admin/users', { error: 'You cannot delete yourself.' });
  const cur = await c.env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(id).first<any>();
  if (cur?.role === 'super_admin' && (await superAdminsLeft(c, id)) === 0) return back(c, '/admin/users', { error: 'At least one Super Administrator is required.' });
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  await logAction(c, 'user.deleted', 'user', id);
  return back(c, '/admin/users', { ok: 'Administrator deleted.' });
});

// ════════════════════ Security log ════════════════════
export const security = new Hono<AppEnv>();

security.get('/', async (c) => {
  const filter = c.req.query('filter') ?? '';
  const where = filter === 'logins' ? "WHERE a.action LIKE 'login.%' OR a.action IN ('logout','mfa.failed')" : filter === 'security' ? "WHERE a.action LIKE 'login.locked' OR a.action LIKE 'login.rate%' OR a.action LIKE 'password.%' OR a.action LIKE 'mfa.%' OR a.action LIKE 'user.%'" : '';
  const logs = (await c.env.DB.prepare(`SELECT a.*, u.display_name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ${where} ORDER BY a.created_at DESC LIMIT 200`).all<any>()).results;
  const sessions = (await c.env.DB.prepare('SELECT s.id, s.ip, s.user_agent, s.last_seen_at, s.created_at, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id ORDER BY s.last_seen_at DESC').all<any>()).results;
  return page(c, { title: 'Security', active: 'security' }, (
    <>
      <Card title={`Active sessions (${sessions.length})`}>
        <ul class="list compact">{sessions.map((s) => <li><span><strong>{s.display_name}</strong> <span class="muted small">{(s.user_agent ?? '').slice(0, 70)}</span></span><span class="muted small">Active <Time ts={s.last_seen_at} /></span></li>)}</ul>
      </Card>
      <div class="tabs"><a href="/admin/security" aria-current={!filter ? 'page' : undefined}>Audit log</a><a href="/admin/security?filter=logins" aria-current={filter === 'logins' ? 'page' : undefined}>Sign-ins</a><a href="/admin/security?filter=security" aria-current={filter === 'security' ? 'page' : undefined}>Security events</a></div>
      {logs.length ? (
        <ul class="list compact audit">{logs.map((l) => <li><span><strong>{l.action}</strong> <span class="muted">{l.entity_type} {l.entity_id}</span>{l.detail ? <span class="muted small"> — {l.detail.slice(0, 120)}</span> : null}</span><span class="muted small">{l.display_name ?? 'Anonymous'} · <Time ts={l.created_at} /></span></li>)}</ul>
      ) : <Empty>No entries.</Empty>}
    </>
  ));
});

// ════════════════════ Backups ════════════════════
export const backups = new Hono<AppEnv>();

backups.get('/', async (c) => {
  const list = await c.env.BUCKET.list({ prefix: 'backups/', limit: 100 });
  const objs = list.objects.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime());
  return page(c, { title: 'Backups', active: 'backups' }, (
    <>
      <Card title="Database backups">
        <p class="help">A full SQL backup is written to private storage every night and kept for 30 days. You can also create one now. Cloudflare D1 additionally keeps 30 days of point-in-time history (Time Travel).</p>
        <form method="post" action="/admin/backups"><button class="btn primary" type="submit">Create backup now</button></form>
        {objs.length ? (
          <ul class="list compact">{objs.map((o) => <li><a href={`/admin/backups/download?key=${encodeURIComponent(o.key)}`}>{o.key.replace('backups/', '')}</a><span class="muted small">{Math.round(o.size / 1024)} KB · <Time ts={o.uploaded.getTime()} /></span></li>)}</ul>
        ) : <Empty>No backups yet.</Empty>}
      </Card>
      <Card title="How to restore">
        <ol class="steps">
          <li>Download the backup file above.</li>
          <li>Create a fresh database and apply the schema: <code>npx wrangler d1 create eic-restore</code> then <code>npx wrangler d1 migrations apply eic-restore --remote</code>.</li>
          <li>Load the data: <code>npx wrangler d1 execute eic-restore --remote --file=backup.sql</code>.</li>
          <li>Point <code>database_id</code> in wrangler.toml at the restored database and deploy. Or restore in place to any minute in the last 30 days with <code>npx wrangler d1 time-travel restore eic --timestamp=…</code>.</li>
        </ol>
        <p class="help">Uploaded files live in R2 and are not affected by database restores. Full details are in DEPLOY.md.</p>
      </Card>
    </>
  ));
});

export async function writeBackup(env: AppEnv['Bindings'], reason: string) {
  const sql = await buildSqlDump(env);
  const key = `backups/${new Date().toISOString().replace(/[:.]/g, '-')}-${reason}.sql`;
  await env.BUCKET.put(key, sql, { httpMetadata: { contentType: 'application/sql' } });
  return { key, size: sql.length };
}

backups.post('/', async (c) => {
  const b = await writeBackup(c.env, 'manual');
  await logAction(c, 'backup.created', 'backup', b.key);
  return back(c, '/admin/backups', { ok: `Backup created (${Math.round(b.size / 1024)} KB).` });
});

backups.get('/download', async (c) => {
  const key = c.req.query('key') ?? '';
  if (!/^backups\/[A-Za-z0-9._-]+\.sql$/.test(key)) return c.text('Not found', 404);
  const obj = await c.env.BUCKET.get(key);
  if (!obj) return c.text('Not found', 404);
  await logAction(c, 'backup.downloaded', 'backup', key);
  return new Response(obj.body, { headers: { 'content-type': 'application/sql', 'content-disposition': `attachment; filename="${key.split('/')[1]}"`, 'cache-control': 'no-store' } });
});
