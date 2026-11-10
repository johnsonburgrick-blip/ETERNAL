/**
 * Visual page editor: select a page → select a section → edit text, photograph,
 * background and buttons → preview on mobile/tablet/desktop → save draft → publish.
 * The whole page (meta + ordered sections) is edited as one draft document in
 * pages.draft_json; publishing writes page_sections atomically and records a revision.
 */
import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { localePath, translator, type Locale } from '../../i18n';
import { notifyAdmins } from '../../lib/notify';
import { clampStr, parseJson, parseNestedForm, safeHref, slugify } from '../../lib/util';
import type { PageMeta, SectionDoc, SiteData } from '../../snapshot/model';
import { loadSiteDataFromDb } from '../../snapshot/source';
import { BACKGROUNDS, isTranslatable, SECTION_TYPES, type FieldDef } from '../../sections/registry';
import { CmsPage } from '../../views/public/pages';
import { resolveContent } from '../../views/public/sections';
import type { RenderCtx } from '../../views/public/context';
import { Badge, Card, Check, ConfirmForm, Empty, Field, MediaField, Select, Time } from '../../views/admin/ui';
import { back, contentChanged, intParam, logAction, page, type C } from './common';

const r = new Hono<AppEnv>();
export const CORE_SLUGS = ['home', 'apply', 'contact', 'privacy', 'terms', 'publications', 'timeline'];
const EDIT_LOCALES: Locale[] = ['en', 'fr', 'es'];

interface PageDoc { meta: PageMeta; inSitemap: boolean; sections: SectionDoc[] }

async function pageRow(c: C, id: number) {
  return c.env.DB.prepare('SELECT * FROM pages WHERE id = ?').bind(id).first<any>();
}

async function publishedDoc(c: C, row: any): Promise<PageDoc> {
  const secs = (await c.env.DB.prepare('SELECT uid, type, visible, settings_json, content_json FROM page_sections WHERE page_id = ? ORDER BY sort').bind(row.id).all<any>()).results;
  return {
    meta: parseJson(row.meta_json, { title: { en: row.name }, description: { en: '' } }),
    inSitemap: !!row.in_sitemap,
    sections: secs.map((s) => ({ uid: s.uid, type: s.type, visible: !!s.visible, settings: parseJson(s.settings_json, {}), content: parseJson(s.content_json, {}) })),
  };
}

async function workingDoc(c: C, row: any): Promise<PageDoc> {
  return row.draft_json ? parseJson<PageDoc>(row.draft_json, await publishedDoc(c, row)) : publishedDoc(c, row);
}

async function saveDraft(c: C, id: number, doc: PageDoc) {
  await c.env.DB.prepare('UPDATE pages SET draft_json = ?, draft_updated_at = ?, draft_updated_by = ? WHERE id = ?').bind(JSON.stringify(doc), Date.now(), c.get('user').id, id).run();
}

const sectionTitle = (s: SectionDoc) => {
  const c = resolveContent(s, 'en');
  return String(c.heading || c.quote || c.eyebrow || SECTION_TYPES[s.type]?.label || s.type).slice(0, 80);
};

// ───────── Page list & creation ─────────
r.get('/', async (c) => {
  const rows = (await c.env.DB.prepare('SELECT id, slug, name, status, draft_json IS NOT NULL AS has_draft, updated_at, draft_updated_at FROM pages ORDER BY sort, name').all<any>()).results;
  return page(c, { title: 'Pages', active: 'pages' }, (
    <>
      <p class="help">Step 1 — choose a page to edit. Every public page is built from sections you can edit, reorder, hide and preview before publishing.</p>
      <ul class="list cards">
        {rows.map((p) => (
          <li>
            <a class="list-row" href={`/admin/pages/${p.id}`}>
              <span><strong>{p.name}</strong><span class="muted small">/{p.slug === 'home' ? '' : p.slug} · updated <Time ts={p.draft_updated_at ?? p.updated_at} /></span></span>
              <span class="row">{p.has_draft ? <Badge status="scheduled" label="Draft changes" /> : null}<Badge status={p.status} /></span>
            </a>
          </li>
        ))}
      </ul>
      <Card title="Create a new page">
        <form method="post" action="/admin/pages" class="stack">
          <Field label="Page name" name="name" required max={100} />
          <Field label="Address (slug)" name="slug" max={60} help="Lowercase words separated by hyphens, e.g. lectures. Leave empty to generate from the name." />
          <button class="btn primary" type="submit">Create page</button>
        </form>
      </Card>
    </>
  ));
});

r.post('/', async (c) => {
  const f = await c.req.parseBody();
  const name = clampStr(f.name, 100);
  const slug = slugify(clampStr(f.slug, 60) || name);
  if (!name || !slug || ['admin', 'media', 'assets', 'search', 'sitemap', 'robots', 'fr', 'en', 'es', 'apply'].includes(slug)) return back(c, '/admin/pages', { error: 'Please choose a valid, unused address.' });
  if (await c.env.DB.prepare('SELECT id FROM pages WHERE slug = ?').bind(slug).first()) return back(c, '/admin/pages', { error: 'That address is already in use.' });
  const ts = Date.now();
  const doc: PageDoc = {
    meta: { title: { en: name }, description: { en: '' } },
    inSitemap: true,
    sections: [
      { uid: crypto.randomUUID(), type: 'hero', visible: true, settings: {}, content: { shared: { height: 'medium' }, en: { heading: name } } },
      { uid: crypto.randomUUID(), type: 'text', visible: true, settings: {}, content: { shared: { imagePosition: 'right' }, en: { heading: '', body: 'Write your content here.' } } },
    ],
  };
  const row = await c.env.DB.prepare("INSERT INTO pages (slug, name, meta_json, draft_json, status, sort, created_at, updated_at, draft_updated_at, draft_updated_by) VALUES (?, ?, ?, ?, 'draft', 100, ?, ?, ?, ?) RETURNING id")
    .bind(slug, name, JSON.stringify(doc.meta), JSON.stringify(doc), ts, ts, ts, c.get('user').id)
    .first<{ id: number }>();
  await logAction(c, 'page.create', 'page', row!.id, slug);
  return back(c, `/admin/pages/${row!.id}`, { ok: 'Page created as a draft. Edit its sections, then publish.' });
});

r.get('/by-slug/:slug', async (c) => {
  const row = await c.env.DB.prepare('SELECT id FROM pages WHERE slug = ?').bind(c.req.param('slug')).first<{ id: number }>();
  return row ? c.redirect(`/admin/pages/${row.id}`, 303) : back(c, '/admin/pages', { error: 'Page not found.' });
});

// ───────── Page overview (sections) ─────────
r.get('/:id{[0-9]+}', async (c) => {
  const id = intParam(c, 'id');
  const row = await pageRow(c, id);
  if (!row) return back(c, '/admin/pages', { error: 'Page not found.' });
  const doc = await workingDoc(c, row);
  const publicUrl = row.slug === 'home' ? '/' : `/${row.slug}`;
  return page(c, { title: row.name, active: 'pages', back: { href: '/admin/pages', label: 'Pages' } }, (
    <>
      <div class={`publish-bar${row.draft_json ? ' has-draft' : ''}`}>
        <div>
          {row.draft_json ? <><Badge status="scheduled" label="Unpublished changes" /> <span class="muted small">saved <Time ts={row.draft_updated_at} /></span></> : <Badge status={row.status} label={row.status === 'published' ? 'Live — no pending changes' : 'Draft page (not public)'} />}
        </div>
        <div class="row wrap">
          <a class="btn small" href={`/admin/pages/${id}/devices`}>Preview</a>
          {row.draft_json || row.status !== 'published' ? <ConfirmForm action={`/admin/pages/${id}/publish`} label="Publish" message="Publish these changes to the live website?" danger={false} small /> : null}
          {row.draft_json ? <ConfirmForm action={`/admin/pages/${id}/discard`} label="Discard draft" message="Discard all unpublished changes on this page?" small /> : null}
          {row.status === 'published' ? <a class="btn small ghost" href={publicUrl} target="_blank" rel="noopener">View live ↗</a> : null}
        </div>
      </div>

      <Card title="Step 2 — choose a section">
        {doc.sections.length ? (
          <ol class="section-list">
            {doc.sections.map((s, i) => (
              <li class={s.visible ? '' : 'is-hidden'}>
                <a class="sec-main" href={`/admin/pages/${id}/sections/${s.uid}`}>
                  <span class="sec-type">{SECTION_TYPES[s.type]?.label ?? s.type}</span>
                  <strong>{sectionTitle(s)}</strong>
                  {!s.visible ? <span class="muted small">Hidden</span> : null}
                </a>
                <div class="sec-tools">
                  <form method="post" action={`/admin/pages/${id}/sections/${s.uid}/move`}><input type="hidden" name="dir" value="up" /><button class="icon-btn" disabled={i === 0} aria-label="Move up">↑</button></form>
                  <form method="post" action={`/admin/pages/${id}/sections/${s.uid}/move`}><input type="hidden" name="dir" value="down" /><button class="icon-btn" disabled={i === doc.sections.length - 1} aria-label="Move down">↓</button></form>
                  <form method="post" action={`/admin/pages/${id}/sections/${s.uid}/toggle`}><button class="icon-btn" aria-label={s.visible ? 'Hide section' : 'Show section'}>{s.visible ? '👁' : '◌'}</button></form>
                  <form method="post" action={`/admin/pages/${id}/sections/${s.uid}/duplicate`}><button class="icon-btn" aria-label="Duplicate section">⧉</button></form>
                  <form method="post" action={`/admin/pages/${id}/sections/${s.uid}/delete`} data-confirm="Delete this section from the draft? (You can discard the draft to undo.)"><button class="icon-btn danger" aria-label="Delete section">✕</button></form>
                </div>
              </li>
            ))}
          </ol>
        ) : <Empty>This page has no sections yet.</Empty>}
        <form method="post" action={`/admin/pages/${id}/sections/add`} class="row wrap add-section">
          <select name="type" aria-label="Section type">{Object.entries(SECTION_TYPES).map(([k, d]) => <option value={k}>{d.label}</option>)}</select>
          <select name="position" aria-label="Position"><option value="end">At the end</option><option value="start">At the start</option></select>
          <button class="btn" type="submit">Add section</button>
        </form>
        <p class="help">Changes are saved as a draft. Visitors see nothing until you press Publish.</p>
      </Card>

      <Card title="Page settings & SEO">
        <form method="post" action={`/admin/pages/${id}/meta`} class="stack">
          {EDIT_LOCALES.map((l) => (
            <fieldset class="locale-group">
              <legend>{l.toUpperCase()}</legend>
              <Field label="Page title" name={`title_${l}`} value={doc.meta.title?.[l] ?? ''} max={120} />
              <Field label="Meta description" name={`description_${l}`} value={doc.meta.description?.[l] ?? ''} type="textarea" rows={2} max={300} />
            </fieldset>
          ))}
          <MediaField label="Social sharing image (Open Graph)" name="ogImage" value={doc.meta.ogImage} />
          <Check label="Include in sitemap" name="inSitemap" checked={doc.inSitemap} />
          <button class="btn" type="submit">Save to draft</button>
        </form>
      </Card>

      <Card title="History">
        <p><a href={`/admin/pages/${id}/revisions`}>Revision history & restore</a></p>
        {!CORE_SLUGS.includes(row.slug) ? <ConfirmForm action={`/admin/pages/${id}/delete`} label="Delete page" message="Delete this page permanently? Its revisions are kept for recovery." small /> : null}
      </Card>
    </>
  ));
});

async function mutate(c: C, fn: (doc: PageDoc, row: any) => PageDoc | string) {
  const id = intParam(c, 'id');
  const row = await pageRow(c, id);
  if (!row) return back(c, '/admin/pages', { error: 'Page not found.' });
  const doc = await workingDoc(c, row);
  const out = fn(doc, row);
  if (typeof out === 'string') return back(c, `/admin/pages/${id}`, { error: out });
  await saveDraft(c, id, out);
  return back(c, `/admin/pages/${id}`, { ok: 'Draft updated.' });
}

r.post('/:id{[0-9]+}/sections/add', async (c) => {
  const f = await c.req.parseBody();
  const type = String(f.type);
  const def = SECTION_TYPES[type];
  return mutate(c, (doc) => {
    if (!def) return 'Unknown section type.';
    const s: SectionDoc = { uid: crypto.randomUUID(), type, visible: true, settings: {}, content: { shared: { ...(def.defaults?.shared ?? {}) }, en: { heading: def.label, ...(def.defaults?.en ?? {}) } } };
    if (f.position === 'start') doc.sections.unshift(s);
    else doc.sections.push(s);
    return doc;
  });
});

r.post('/:id{[0-9]+}/sections/:uid/move', async (c) => {
  const dir = (await c.req.parseBody()).dir === 'up' ? -1 : 1;
  return mutate(c, (doc) => {
    const i = doc.sections.findIndex((s) => s.uid === c.req.param('uid'));
    const j = i + dir;
    if (i < 0 || j < 0 || j >= doc.sections.length) return doc;
    [doc.sections[i], doc.sections[j]] = [doc.sections[j], doc.sections[i]];
    return doc;
  });
});

r.post('/:id{[0-9]+}/sections/:uid/toggle', (c) =>
  mutate(c, (doc) => {
    const s = doc.sections.find((x) => x.uid === c.req.param('uid'));
    if (s) s.visible = !s.visible;
    return doc;
  }),
);

r.post('/:id{[0-9]+}/sections/:uid/duplicate', (c) =>
  mutate(c, (doc) => {
    const i = doc.sections.findIndex((x) => x.uid === c.req.param('uid'));
    if (i >= 0) doc.sections.splice(i + 1, 0, { ...structuredClone(doc.sections[i]), uid: crypto.randomUUID() });
    return doc;
  }),
);

r.post('/:id{[0-9]+}/sections/:uid/delete', (c) =>
  mutate(c, (doc) => {
    doc.sections = doc.sections.filter((x) => x.uid !== c.req.param('uid'));
    return doc;
  }),
);

r.post('/:id{[0-9]+}/meta', async (c) => {
  const f = await c.req.parseBody();
  return mutate(c, (doc) => {
    const title: any = {}, description: any = {};
    for (const l of EDIT_LOCALES) {
      const t = clampStr(f[`title_${l}`], 120), d = clampStr(f[`description_${l}`], 300);
      if (t) title[l] = t;
      if (d) description[l] = d;
    }
    if (!title.en) return 'An English page title is required.';
    doc.meta = { title, description, ogImage: safeHref(clampStr(f.ogImage, 500)) || undefined };
    doc.inSitemap = f.inSitemap === '1';
    return doc;
  });
});

// ───────── Section editor ─────────
function FieldEditor({ f, value, name, enValue, locale }: { f: FieldDef; value: any; name: string; enValue?: any; locale: string }) {
  const ph = locale !== 'en' && typeof enValue === 'string' ? `English: ${enValue.slice(0, 120)}` : undefined;
  switch (f.type) {
    case 'image': return <MediaField label={f.label} name={name} value={value ?? ''} help={f.help} />;
    case 'video': return <MediaField label={f.label} name={name} value={value ?? ''} kind="video" help={f.help} />;
    case 'select': return <Select label={f.label} name={name} value={value ?? ''} options={f.options ?? []} help={f.help} />;
    case 'checkbox': return <Check label={f.label} name={name} checked={!!value} help={f.help} />;
    case 'number': return <Field label={f.label} name={name} type="number" value={value ?? ''} help={f.help} attrs={{ min: 0, max: 100 }} />;
    case 'url': return <Field label={f.label} name={name} value={value ?? ''} help={f.help} placeholder="/page or https://…" />;
    case 'buttons': {
      const rows: any[] = Array.isArray(value) ? value : [];
      const row = (b: any, i: string | number) => (
        <div class="rep-row" data-repeater-row>
          <Field label="Button label" name={`${name}[${i}][label]`} value={b.label ?? ''} max={60} />
          <Field label="Link" name={`${name}[${i}][href]`} value={b.href ?? ''} max={300} placeholder="/apply" />
          <Select label="Style" name={`${name}[${i}][style]`} value={b.style ?? 'primary'} options={[{ value: 'primary', label: 'Gold (primary)' }, { value: 'secondary', label: 'Outline (secondary)' }]} />
          <div class="rep-tools"><button type="button" class="btn small ghost" data-rep-up>↑</button><button type="button" class="btn small ghost" data-rep-down>↓</button><button type="button" class="btn small danger" data-rep-remove>Remove</button></div>
        </div>
      );
      return (
        <fieldset class="repeater" data-repeater data-max="3">
          <legend>{f.label}</legend>
          {f.help ? <p class="help">{f.help}</p> : null}
          <div data-repeater-list>{rows.map((b, i) => row(b, i))}</div>
          <template data-repeater-template>{row({}, '__i__')}</template>
          <button type="button" class="btn small" data-repeater-add>Add button</button>
        </fieldset>
      );
    }
    case 'items': {
      const rows: any[] = Array.isArray(value) ? value : [];
      const row = (it: any, i: string | number) => (
        <div class="rep-row" data-repeater-row>
          {(f.itemFields ?? []).map((sf) => <FieldEditor f={sf} value={it[sf.name]} name={`${name}[${i}][${sf.name}]`} locale="en" />)}
          <div class="rep-tools"><button type="button" class="btn small ghost" data-rep-up>↑</button><button type="button" class="btn small ghost" data-rep-down>↓</button><button type="button" class="btn small danger" data-rep-remove>Remove</button></div>
        </div>
      );
      return (
        <fieldset class="repeater" data-repeater>
          <legend>{f.label}</legend>
          <div data-repeater-list>{rows.map((it, i) => row(it, i))}</div>
          <template data-repeater-template>{row({}, '__i__')}</template>
          <button type="button" class="btn small" data-repeater-add>Add item</button>
        </fieldset>
      );
    }
    default:
      return <Field label={f.label} name={name} type={f.type === 'markdown' ? 'markdown' : f.type === 'textarea' ? 'textarea' : 'text'} value={value ?? ''} max={f.max} help={f.help} placeholder={ph} />;
  }
}

r.get('/:id{[0-9]+}/sections/:uid', async (c) => {
  const id = intParam(c, 'id');
  const row = await pageRow(c, id);
  if (!row) return back(c, '/admin/pages', { error: 'Page not found.' });
  const doc = await workingDoc(c, row);
  const s = doc.sections.find((x) => x.uid === c.req.param('uid'));
  if (!s) return back(c, `/admin/pages/${id}`, { error: 'Section not found (it may have been deleted).' });
  const def = SECTION_TYPES[s.type];
  const locale = (EDIT_LOCALES as string[]).includes(c.req.query('locale') ?? '') ? (c.req.query('locale') as Locale) : 'en';
  const loc = s.content[locale] ?? {};
  const en = s.content.en ?? {};
  const shared = s.content.shared ?? {};
  const st = s.settings ?? {};
  const action = `/admin/pages/${id}/sections/${s.uid}`;
  return page(c, { title: def?.label ?? s.type, active: 'pages', back: { href: `/admin/pages/${id}`, label: row.name }, wide: true }, (
    <div class="editor-split">
      <div class="editor-form">
        <div class="tabs" role="tablist" aria-label="Language">
          {EDIT_LOCALES.map((l) => <a href={`${action}?locale=${l}`} aria-current={l === locale ? 'page' : undefined}>{l.toUpperCase()}{l !== 'en' && !s.content[l] ? ' ·' : ''}</a>)}
        </div>
        {locale !== 'en' && !s.content[locale] ? (
          <div class="toast">No {locale.toUpperCase()} version yet — visitors see English. <form method="post" action={`${action}/copy-en?locale=${locale}`} class="inline"><button class="btn small" type="submit">Start from the English text</button></form></div>
        ) : null}
        <form method="post" action={`${action}?locale=${locale}`} class="stack" data-autosave data-preview-target="preview-frame">
          <input type="hidden" name="locale" value={locale} />
          <Card title={`Step 3 — content (${locale.toUpperCase()})`}>
            {def?.fields.filter(isTranslatable).map((f) => <FieldEditor f={f} value={loc[f.name]} enValue={en[f.name]} name={`loc[${f.name}]`} locale={locale} />)}
          </Card>
          {def?.fields.some((f) => !isTranslatable(f)) ? (
            <Card title="Photographs & options (all languages)">
              {def.fields.filter((f) => !isTranslatable(f)).map((f) => <FieldEditor f={f} value={shared[f.name]} name={`shared[${f.name}]`} locale="en" />)}
            </Card>
          ) : null}
          <Card title="Background & layout">
            <Select label="Background" name="settings[background]" value={st.background ?? 'obsidian'} options={BACKGROUNDS} />
            <MediaField label="Background photograph (when background is 'Photograph')" name="settings[bgImage]" value={st.bgImage ?? ''} />
            <Select label="Photograph darkening" name="settings[overlay]" value={st.overlay ?? 'medium'} options={[{ value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' }, { value: 'strong', label: 'Strong' }]} />
            <Select label="Spacing" name="settings[spacing]" value={st.spacing ?? 'normal'} options={[{ value: 'compact', label: 'Compact' }, { value: 'normal', label: 'Normal' }, { value: 'spacious', label: 'Spacious' }]} />
            <Select label="Alignment" name="settings[align]" value={st.align ?? 'left'} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centred' }]} />
            <Field label="Anchor (for links like /page#anchor)" name="settings[anchor]" value={st.anchor ?? ''} max={40} />
            <Check label="Visible on the page" name="visible" checked={s.visible} />
          </Card>
          <div class="sticky-actions">
            <span class="autosave-status muted small" data-autosave-status aria-live="polite">Changes are saved to the draft automatically.</span>
            <button class="btn primary" type="submit">Save draft</button>
            <a class="btn" href={`/admin/pages/${id}/devices?locale=${locale}#${s.uid}`}>Preview</a>
          </div>
        </form>
      </div>
      <aside class="editor-preview" aria-label="Live preview">
        <div class="device-toggle" role="group" aria-label="Preview size">
          <button type="button" data-device="390" aria-pressed="true">Mobile</button>
          <button type="button" data-device="768" aria-pressed="false">Tablet</button>
          <button type="button" data-device="1280" aria-pressed="false">Desktop</button>
        </div>
        <div class="device-stage" data-device-stage><iframe id="preview-frame" title="Draft preview" src={`/admin/pages/${id}/preview?locale=${locale}#${s.uid}`} data-device-frame loading="lazy" /></div>
      </aside>
    </div>
  ));
});

function cleanValue(f: FieldDef, raw: any): any {
  switch (f.type) {
    case 'image': case 'video': case 'url': return safeHref(clampStr(raw, 500));
    case 'number': { const n = parseInt(String(raw ?? ''), 10); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0; }
    case 'checkbox': return raw === '1' || raw === true;
    case 'select': return (f.options ?? []).some((o) => o.value === raw) ? raw : f.options?.[0]?.value ?? '';
    case 'buttons':
      return (Array.isArray(raw) ? raw : []).map((b: any) => ({ label: clampStr(b?.label, 60), href: safeHref(clampStr(b?.href, 300)), style: b?.style === 'secondary' ? 'secondary' : 'primary' })).filter((b) => b.label && b.href).slice(0, 3);
    case 'items':
      return (Array.isArray(raw) ? raw : [])
        .map((it: any) => Object.fromEntries((f.itemFields ?? []).map((sf) => [sf.name, cleanValue(sf, it?.[sf.name])])))
        .filter((it) => Object.values(it).some((v) => v !== '' && v !== false && v !== 0))
        .slice(0, 24);
    default: return clampStr(raw, f.max ?? (f.type === 'markdown' ? 20000 : 4000));
  }
}

r.post('/:id{[0-9]+}/sections/:uid', async (c) => {
  const id = intParam(c, 'id');
  const autosave = c.req.header('x-autosave') === '1';
  const row = await pageRow(c, id);
  if (!row) return autosave ? c.json({ ok: false }, 404) : back(c, '/admin/pages', { error: 'Page not found.' });
  const fd = await c.req.formData();
  const nested = parseNestedForm([...fd.entries()].filter((e): e is [string, string] => typeof e[1] === 'string'));
  const locale = (EDIT_LOCALES as string[]).includes(nested.locale) ? nested.locale : 'en';
  const doc = await workingDoc(c, row);
  const s = doc.sections.find((x) => x.uid === c.req.param('uid'));
  if (!s) return autosave ? c.json({ ok: false }, 404) : back(c, `/admin/pages/${id}`, { error: 'Section not found.' });
  const def = SECTION_TYPES[s.type];
  const loc: Record<string, any> = {};
  const shared: Record<string, any> = { ...(s.content.shared ?? {}) };
  for (const f of def?.fields ?? []) {
    if (isTranslatable(f)) loc[f.name] = cleanValue(f, nested.loc?.[f.name]);
    else shared[f.name] = cleanValue(f, nested.shared?.[f.name]);
  }
  s.content = { ...s.content, shared, [locale]: loc };
  const st = nested.settings ?? {};
  s.settings = {
    background: BACKGROUNDS.some((b) => b.value === st.background) ? st.background : 'obsidian',
    bgImage: safeHref(clampStr(st.bgImage, 500)) || undefined,
    overlay: ['light', 'medium', 'strong'].includes(st.overlay) ? st.overlay : 'medium',
    spacing: ['compact', 'normal', 'spacious'].includes(st.spacing) ? st.spacing : 'normal',
    align: st.align === 'center' ? 'center' : 'left',
    anchor: slugify(clampStr(st.anchor, 40)) || undefined,
  };
  s.visible = nested.visible === '1';
  await saveDraft(c, id, doc);
  if (autosave) return c.json({ ok: true, savedAt: Date.now() });
  return back(c, `/admin/pages/${id}/sections/${s.uid}?locale=${locale}`, { ok: 'Draft saved. Press Publish on the page when ready.' });
});

r.post('/:id{[0-9]+}/sections/:uid/copy-en', async (c) => {
  const locale = c.req.query('locale') ?? 'fr';
  const id = intParam(c, 'id');
  const row = await pageRow(c, id);
  if (!row || !(EDIT_LOCALES as string[]).includes(locale)) return back(c, '/admin/pages');
  const doc = await workingDoc(c, row);
  const s = doc.sections.find((x) => x.uid === c.req.param('uid'));
  if (s) {
    s.content[locale] = structuredClone(s.content.en ?? {});
    await saveDraft(c, id, doc);
  }
  return back(c, `/admin/pages/${id}/sections/${c.req.param('uid')}?locale=${locale}`, { ok: 'English text copied. Replace it with the reviewed translation.' });
});

// ───────── Publish / discard / delete ─────────
r.post('/:id{[0-9]+}/publish', async (c) => {
  const id = intParam(c, 'id');
  const row = await pageRow(c, id);
  if (!row) return back(c, '/admin/pages', { error: 'Page not found.' });
  const before = await publishedDoc(c, row);
  const doc = await workingDoc(c, row);
  const ts = Date.now();
  const db = c.env.DB;
  await db.batch([
    db.prepare('INSERT INTO content_revisions (entity_type, entity_id, data_json, note, created_by, created_at) VALUES (\'page\', ?, ?, ?, ?, ?)').bind(id, JSON.stringify(before), row.status === 'published' ? 'Before publish' : 'Initial (unpublished)', c.get('user').id, ts),
    db.prepare('DELETE FROM page_sections WHERE page_id = ?').bind(id),
    ...doc.sections.map((s, i) =>
      db.prepare('INSERT INTO page_sections (page_id, uid, type, sort, visible, settings_json, content_json) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, s.uid, s.type, i, s.visible ? 1 : 0, JSON.stringify(s.settings ?? {}), JSON.stringify(s.content ?? {})),
    ),
    db.prepare("UPDATE pages SET meta_json = ?, in_sitemap = ?, draft_json = NULL, status = 'published', updated_at = ?, published_at = ? WHERE id = ?").bind(JSON.stringify(doc.meta), doc.inSitemap ? 1 : 0, ts, ts, id),
  ]);
  await contentChanged(c, 'page.publish', 'page', id, row.name);
  await notifyAdmins(c.env, c.executionCtx as ExecutionContext, { type: 'content_published', title: `Page published: ${row.name}`, body: `by ${c.get('user').display_name}`, link: `/admin/pages/${id}`, roles: ['super_admin', 'content_admin'], excludeUserId: c.get('user').id });
  return back(c, `/admin/pages/${id}`, { ok: 'Published. The change is live now and reaches every region within about a minute.' });
});

r.post('/:id{[0-9]+}/discard', async (c) => {
  const id = intParam(c, 'id');
  await c.env.DB.prepare('UPDATE pages SET draft_json = NULL WHERE id = ?').bind(id).run();
  await logAction(c, 'page.discard_draft', 'page', id);
  return back(c, `/admin/pages/${id}`, { ok: 'Draft discarded. The page is back to its published version.' });
});

r.post('/:id{[0-9]+}/delete', async (c) => {
  const id = intParam(c, 'id');
  const row = await pageRow(c, id);
  if (!row || CORE_SLUGS.includes(row.slug)) return back(c, '/admin/pages', { error: 'This page cannot be deleted.' });
  const doc = await workingDoc(c, row);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO content_revisions (entity_type, entity_id, data_json, note, created_by, created_at) VALUES ('page', ?, ?, ?, ?, ?)").bind(id, JSON.stringify({ ...doc, slug: row.slug, name: row.name }), 'Deleted page', c.get('user').id, Date.now()),
    c.env.DB.prepare('DELETE FROM pages WHERE id = ?').bind(id),
  ]);
  await contentChanged(c, 'page.delete', 'page', id, row.slug);
  return back(c, '/admin/pages', { ok: 'Page deleted.' });
});

// ───────── Revisions ─────────
r.get('/:id{[0-9]+}/revisions', async (c) => {
  const id = intParam(c, 'id');
  const row = await pageRow(c, id);
  if (!row) return back(c, '/admin/pages');
  const revs = (await c.env.DB.prepare("SELECT r.id, r.note, r.created_at, u.display_name FROM content_revisions r LEFT JOIN users u ON u.id = r.created_by WHERE r.entity_type = 'page' AND r.entity_id = ? ORDER BY r.created_at DESC LIMIT 50").bind(id).all<any>()).results;
  return page(c, { title: `${row.name} — history`, active: 'pages', back: { href: `/admin/pages/${id}`, label: row.name } }, (
    <Card title="Previous published versions">
      <p class="help">Restoring copies a version into the draft so you can preview it before publishing. Nothing goes live until you publish.</p>
      {revs.length ? (
        <ul class="list">
          {revs.map((v) => (
            <li class="list-row">
              <span><strong><Time ts={v.created_at} /></strong><span class="muted small">{v.note} · {v.display_name ?? 'System'}</span></span>
              <span class="row"><a class="btn small ghost" href={`/admin/pages/${id}/revisions/${v.id}/preview`} target="_blank">Preview</a><ConfirmForm action={`/admin/pages/${id}/revisions/${v.id}/restore`} label="Restore" message="Replace the current draft with this version?" danger={false} small /></span>
            </li>
          ))}
        </ul>
      ) : <Empty>No revisions yet. One is recorded every time the page is published.</Empty>}
    </Card>
  ));
});

r.post('/:id{[0-9]+}/revisions/:rid{[0-9]+}/restore', async (c) => {
  const id = intParam(c, 'id');
  const rev = await c.env.DB.prepare("SELECT data_json FROM content_revisions WHERE id = ? AND entity_type = 'page' AND entity_id = ?").bind(intParam(c, 'rid'), id).first<any>();
  if (!rev) return back(c, `/admin/pages/${id}/revisions`, { error: 'Revision not found.' });
  const d = parseJson<PageDoc>(rev.data_json, { meta: { title: { en: '' }, description: { en: '' } }, inSitemap: true, sections: [] });
  await saveDraft(c, id, { meta: d.meta, inSitemap: d.inSitemap ?? true, sections: d.sections });
  await logAction(c, 'page.restore_revision', 'page', id, String(intParam(c, 'rid')));
  return back(c, `/admin/pages/${id}`, { ok: 'Revision restored into the draft. Preview it, then publish.' });
});

// ───────── Previews (rendered with the public templates, from the DB) ─────────
async function renderPreview(c: C, slug: string, doc: PageDoc, locale: Locale) {
  const data: SiteData = await loadSiteDataFromDb(c.env);
  const entry = { id: 0, slug, name: slug, meta: doc.meta, sections: doc.sections, inSitemap: doc.inSitemap, updatedAt: Date.now() };
  const url = new URL(c.req.url);
  const rc: RenderCtx = {
    env: c.env, data: { ...data, pages: { ...data.pages, [slug]: entry } }, locale, url, path: slug === 'home' ? '/' : `/${slug}`,
    t: translator(locale, data.translations), lp: (p: string) => localePath(p, locale), timers: {}, submissionToken: 'preview', preview: true,
  };
  c.header('cache-control', 'no-store');
  c.header('x-robots-tag', 'noindex');
  return c.html(<CmsPage rc={rc} page={entry} />);
}

const previewLocale = (c: C): Locale => ((['en', 'fr', 'es'] as string[]).includes(c.req.query('locale') ?? '') ? (c.req.query('locale') as Locale) : 'en');

r.get('/:id{[0-9]+}/preview', async (c) => {
  const row = await pageRow(c, intParam(c, 'id'));
  if (!row) return c.text('Not found', 404);
  return renderPreview(c, row.slug, await workingDoc(c, row), previewLocale(c));
});

r.get('/:id{[0-9]+}/revisions/:rid{[0-9]+}/preview', async (c) => {
  const row = await pageRow(c, intParam(c, 'id'));
  const rev = await c.env.DB.prepare("SELECT data_json FROM content_revisions WHERE id = ? AND entity_type = 'page'").bind(intParam(c, 'rid')).first<any>();
  if (!row || !rev) return c.text('Not found', 404);
  return renderPreview(c, row.slug, parseJson<PageDoc>(rev.data_json, { meta: { title: { en: '' }, description: { en: '' } }, inSitemap: true, sections: [] }), previewLocale(c));
});

r.get('/:id{[0-9]+}/devices', async (c) => {
  const id = intParam(c, 'id');
  const row = await pageRow(c, id);
  if (!row) return back(c, '/admin/pages');
  const locale = previewLocale(c);
  return page(c, { title: `Preview — ${row.name}`, active: 'pages', back: { href: `/admin/pages/${id}`, label: row.name }, wide: true }, (
    <>
      <div class="row wrap preview-toolbar">
        <div class="device-toggle" role="group" aria-label="Device">
          <button type="button" data-device="390" aria-pressed="true">Mobile</button>
          <button type="button" data-device="768" aria-pressed="false">Tablet</button>
          <button type="button" data-device="1280" aria-pressed="false">Desktop</button>
        </div>
        <div class="tabs">{EDIT_LOCALES.map((l) => <a href={`/admin/pages/${id}/devices?locale=${l}`} aria-current={l === locale ? 'page' : undefined}>{l.toUpperCase()}</a>)}</div>
        {row.draft_json || row.status !== 'published' ? <ConfirmForm action={`/admin/pages/${id}/publish`} label="Publish" message="Publish these changes to the live website?" danger={false} small /> : <span class="muted small">No unpublished changes</span>}
      </div>
      <div class="device-stage large" data-device-stage><iframe title="Draft preview" src={`/admin/pages/${id}/preview?locale=${locale}`} data-device-frame /></div>
    </>
  ));
});

export default r;
