/**
 * Schema-driven CRUD for every content collection: articles, timeline events,
 * historical figures, archive items, leadership, principles, symbols, FAQs and
 * article categories. Each save records a revision and rebuilds the snapshot.
 */
import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { notifyAdmins } from '../../lib/notify';
import { clampStr, parseJson, safeHref, slugify } from '../../lib/util';
import { Badge, Card, Check, ConfirmForm, Empty, Field, MediaField, Pager, Select, Time } from '../../views/admin/ui';
import { back, contentChanged, intParam, page, type C } from './common';
import { renderArticlePreview } from './preview';

type FType = 'text' | 'textarea' | 'markdown' | 'image' | 'file' | 'url' | 'number' | 'select' | 'checkbox' | 'datetime' | 'category' | 'i18nname';
interface CField { col: string; label: string; type: FType; required?: boolean; help?: string; options?: { value: string; label: string }[]; tr?: boolean; max?: number }
interface CDef { table: string; label: string; singular: string; title: string; publicBase?: string; fields: CField[]; order: string; statuses?: string[]; slugFrom?: string; i18n: boolean }

const PUB = [{ value: 'published', label: 'Published' }, { value: 'draft', label: 'Draft (hidden)' }];
const SRC_HELP = 'Markdown list of references, e.g. "- van Dülmen, *Der Geheimbund der Illuminaten* (1975)".';

export const COLLECTIONS: Record<string, CDef> = {
  articles: {
    table: 'articles', label: 'Publications & announcements', singular: 'article', title: 'title', publicBase: '/publications', order: 'COALESCE(publish_at, updated_at) DESC', i18n: false,
    statuses: ['draft', 'scheduled', 'published', 'unpublished'],
    fields: [
      { col: 'title', label: 'Title', type: 'text', required: true, max: 200 },
      { col: 'slug', label: 'Address (slug)', type: 'text', help: 'Generated from the title if empty.', max: 100 },
      { col: 'excerpt', label: 'Summary / excerpt', type: 'textarea', max: 500 },
      { col: 'body', label: 'Article text', type: 'markdown', max: 100000 },
      { col: 'cover_image', label: 'Cover photograph', type: 'image' },
      { col: 'cover_alt', label: 'Cover description (alt text)', type: 'text', max: 200 },
      { col: 'category_id', label: 'Category', type: 'category' },
      { col: 'tags', label: 'Tags', type: 'text', help: 'Comma separated', max: 300 },
      { col: 'author_name', label: 'Author', type: 'text', max: 100 },
      { col: 'locale', label: 'Language', type: 'select', options: [{ value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }, { value: 'es', label: 'Español' }] },
      { col: 'status', label: 'Status', type: 'select', options: [{ value: 'draft', label: 'Draft' }, { value: 'scheduled', label: 'Scheduled' }, { value: 'published', label: 'Published' }, { value: 'unpublished', label: 'Unpublished' }] },
      { col: 'publish_at', label: 'Publication date & time (UTC)', type: 'datetime', help: 'Required for scheduled articles. The article appears automatically at this time.' },
      { col: 'featured', label: 'Featured', type: 'checkbox' },
      { col: 'is_announcement', label: 'Official announcement (listed under Announcements)', type: 'checkbox' },
      { col: 'meta_title', label: 'SEO title (optional)', type: 'text', max: 120 },
      { col: 'meta_description', label: 'SEO description (optional)', type: 'textarea', max: 300 },
    ],
  },
  events: {
    table: 'historical_events', label: 'Historical timeline', singular: 'event', title: 'title', publicBase: '/timeline', order: 'year, sort, id', i18n: true, statuses: ['published', 'draft'],
    fields: [
      { col: 'title', label: 'Event title', type: 'text', required: true, tr: true, max: 200 },
      { col: 'slug', label: 'Address (slug)', type: 'text', max: 100 },
      { col: 'date_label', label: 'Date as displayed (e.g. "1 May 1776")', type: 'text', required: true, tr: true, max: 60 },
      { col: 'year', label: 'Year (for ordering)', type: 'number', required: true },
      { col: 'sort', label: 'Order within the year', type: 'number' },
      { col: 'era', label: 'Era (filter group)', type: 'text', tr: true, max: 60 },
      { col: 'summary', label: 'Short description', type: 'textarea', tr: true, max: 600 },
      { col: 'body', label: 'Full description', type: 'markdown', tr: true },
      { col: 'image', label: 'Photograph', type: 'image' },
      { col: 'image_alt', label: 'Photograph description', type: 'text', tr: true, max: 200 },
      { col: 'certainty', label: 'Historical certainty', type: 'select', options: [{ value: 'documented', label: 'Documented' }, { value: 'disputed', label: 'Disputed' }, { value: 'legend', label: 'Tradition / legend' }] },
      { col: 'sources', label: 'Sources', type: 'markdown', help: SRC_HELP },
      { col: 'status', label: 'Status', type: 'select', options: PUB },
    ],
  },
  figures: {
    table: 'historical_figures', label: 'Historical figures', singular: 'figure', title: 'name', publicBase: '/figures', order: 'sort, id', i18n: true, statuses: ['published', 'draft'],
    fields: [
      { col: 'name', label: 'Name', type: 'text', required: true, max: 150 },
      { col: 'slug', label: 'Address (slug)', type: 'text', max: 100 },
      { col: 'role_title', label: 'Historical role', type: 'text', tr: true, max: 200 },
      { col: 'dates_label', label: 'Dates (e.g. "1748–1830")', type: 'text', max: 60 },
      { col: 'portrait', label: 'Portrait', type: 'image' },
      { col: 'portrait_alt', label: 'Portrait description', type: 'text', tr: true, max: 200 },
      { col: 'summary', label: 'Summary', type: 'textarea', tr: true, max: 600 },
      { col: 'background', label: 'Historical background', type: 'markdown', tr: true },
      { col: 'body', label: 'Biography', type: 'markdown', tr: true },
      { col: 'sources', label: 'Historical references', type: 'markdown', help: SRC_HELP },
      { col: 'sort', label: 'Display order', type: 'number' },
      { col: 'status', label: 'Status', type: 'select', options: PUB },
    ],
  },
  archives: {
    table: 'historical_archives', label: 'Research library & archive', singular: 'archive item', title: 'title', publicBase: '/archive', order: 'sort, id', i18n: true, statuses: ['published', 'draft'],
    fields: [
      { col: 'title', label: 'Title', type: 'text', required: true, tr: true, max: 200 },
      { col: 'slug', label: 'Address (slug)', type: 'text', max: 100 },
      { col: 'kind', label: 'Type', type: 'select', options: ['document', 'photograph', 'manuscript', 'research', 'reference'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
      { col: 'category', label: 'Category', type: 'text', max: 80 },
      { col: 'date_label', label: 'Date of the material', type: 'text', max: 60 },
      { col: 'description', label: 'Short description', type: 'textarea', tr: true, max: 800 },
      { col: 'body', label: 'Full description / notes', type: 'markdown', tr: true },
      { col: 'image', label: 'Image', type: 'image' },
      { col: 'image_alt', label: 'Image description', type: 'text', tr: true, max: 200 },
      { col: 'file_url', label: 'Downloadable file (PDF/image)', type: 'file' },
      { col: 'downloadable', label: 'Allow download (only if you hold the rights or it is public domain)', type: 'checkbox' },
      { col: 'external_url', label: 'External source copy (URL)', type: 'url' },
      { col: 'license', label: 'Licence / copyright status', type: 'text', max: 200, help: 'e.g. Public domain, CC BY-SA 4.0, © Holder (used with permission)' },
      { col: 'source', label: 'Source / holding institution', type: 'text', max: 300 },
      { col: 'sort', label: 'Display order', type: 'number' },
      { col: 'status', label: 'Status', type: 'select', options: PUB },
    ],
  },
  leadership: {
    table: 'leadership_profiles', label: 'Leadership profiles', singular: 'profile', title: 'name', publicBase: '/leadership', order: 'sort, id', i18n: true, statuses: ['published', 'draft'],
    fields: [
      { col: 'name', label: 'Name', type: 'text', required: true, max: 150 },
      { col: 'slug', label: 'Address (slug)', type: 'text', max: 100 },
      { col: 'position', label: 'Official position', type: 'text', tr: true, max: 150 },
      { col: 'photo', label: 'Photograph', type: 'image' },
      { col: 'photo_alt', label: 'Photograph description', type: 'text', tr: true, max: 200 },
      { col: 'summary', label: 'Short introduction', type: 'textarea', tr: true, max: 600 },
      { col: 'body', label: 'Biography', type: 'markdown', tr: true },
      { col: 'responsibilities', label: 'Responsibilities', type: 'markdown', tr: true },
      { col: 'credentials', label: 'Verified credentials (only list what can be verified)', type: 'markdown', tr: true },
      { col: 'sort', label: 'Display order', type: 'number' },
      { col: 'status', label: 'Status', type: 'select', options: PUB },
    ],
  },
  principles: {
    table: 'principles', label: 'Principles', singular: 'principle', title: 'title', publicBase: '/principles', order: 'sort, id', i18n: true, statuses: ['published', 'draft'],
    fields: [
      { col: 'title', label: 'Title', type: 'text', required: true, tr: true, max: 150 },
      { col: 'slug', label: 'Address (slug)', type: 'text', max: 100 },
      { col: 'summary', label: 'Summary', type: 'textarea', tr: true, max: 600 },
      { col: 'body', label: 'Full text', type: 'markdown', tr: true },
      { col: 'image', label: 'Photograph', type: 'image' },
      { col: 'image_alt', label: 'Photograph description', type: 'text', tr: true, max: 200 },
      { col: 'sort', label: 'Display order', type: 'number' },
      { col: 'status', label: 'Status', type: 'select', options: PUB },
    ],
  },
  symbols: {
    table: 'symbols', label: 'Symbols & interpretations', singular: 'symbol', title: 'name', publicBase: '/symbols', order: 'sort, id', i18n: true, statuses: ['published', 'draft'],
    fields: [
      { col: 'name', label: 'Symbol name', type: 'text', required: true, tr: true, max: 150 },
      { col: 'slug', label: 'Address (slug)', type: 'text', max: 100 },
      { col: 'image', label: 'Historical image', type: 'image' },
      { col: 'image_alt', label: 'Image description', type: 'text', tr: true, max: 200 },
      { col: 'origin', label: 'Origin', type: 'text', tr: true, max: 300 },
      { col: 'summary', label: 'Historical meaning', type: 'textarea', tr: true, max: 800 },
      { col: 'body', label: 'Cultural interpretations (distinguish documented fact from later claims)', type: 'markdown', tr: true },
      { col: 'sources', label: 'Supporting references', type: 'markdown', help: SRC_HELP },
      { col: 'sort', label: 'Display order', type: 'number' },
      { col: 'status', label: 'Status', type: 'select', options: PUB },
    ],
  },
  faqs: {
    table: 'faqs', label: 'Frequently asked questions', singular: 'question', title: 'question', order: 'sort, id', i18n: true, statuses: ['published', 'draft'], slugFrom: 'question',
    fields: [
      { col: 'question', label: 'Question', type: 'text', required: true, tr: true, max: 300 },
      { col: 'slug', label: 'Anchor (slug)', type: 'text', max: 100 },
      { col: 'answer', label: 'Answer', type: 'markdown', tr: true, max: 5000 },
      { col: 'category', label: 'Category', type: 'select', options: ['general', 'history', 'membership', 'privacy'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
      { col: 'sort', label: 'Display order', type: 'number' },
      { col: 'status', label: 'Status', type: 'select', options: PUB },
    ],
  },
  categories: {
    table: 'article_categories', label: 'Article categories', singular: 'category', title: 'slug', order: 'sort, id', i18n: false,
    fields: [
      { col: 'slug', label: 'Address (slug)', type: 'text', required: true, max: 60 },
      { col: 'name_json', label: 'Name', type: 'i18nname' },
      { col: 'sort', label: 'Display order', type: 'number' },
    ],
  },
};

const TR_LOCALES = ['fr', 'es'];
const r = new Hono<AppEnv>();

function def(c: C): CDef | null {
  return COLLECTIONS[c.req.param('coll') ?? ''] ?? null;
}

r.get('/', (c) =>
  page(c, { title: 'History & content', active: 'collections' }, (
    <ul class="list cards">
      {Object.entries(COLLECTIONS).map(([k, d]) => <li><a class="list-row" href={`/admin/content/${k}`}><strong>{d.label}</strong><span aria-hidden="true">→</span></a></li>)}
    </ul>
  )),
);

r.get('/:coll', async (c) => {
  const d = def(c);
  if (!d) return back(c, '/admin/content', { error: 'Unknown collection.' });
  const q = new URL(c.req.url).searchParams;
  const pg = Math.max(1, parseInt(q.get('page') ?? '1', 10) || 1);
  const where: string[] = [];
  const binds: any[] = [];
  const status = q.get('status') ?? '';
  if (d.statuses?.includes(status)) { where.push('status = ?'); binds.push(status); }
  const term = (q.get('q') ?? '').trim().slice(0, 100);
  if (term) { where.push(`instr(lower(${d.title}), lower(?)) > 0`); binds.push(term); }
  const rows = (await c.env.DB.prepare(`SELECT * FROM ${d.table} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${d.order} LIMIT 51 OFFSET ?`).bind(...binds, (pg - 1) * 50).all<any>()).results;
  const key = c.req.param('coll');
  const active = key === 'articles' ? 'articles' : 'collections';
  return page(c, { title: d.label, active, back: key === 'articles' ? undefined : { href: '/admin/content', label: 'Content' }, actions: <a class="btn small primary" href={`/admin/content/${key}/new`}>New {d.singular}</a> }, (
    <>
      <form class="filters" method="get">
        <input type="search" name="q" value={term} placeholder="Search" aria-label="Search" />
        {d.statuses ? <select name="status" aria-label="Status"><option value="">All</option>{d.statuses.map((s) => <option value={s} selected={s === status}>{s}</option>)}</select> : null}
        <button class="btn small" type="submit">Filter</button>
      </form>
      {rows.length ? (
        <ul class="list cards">
          {rows.slice(0, 50).map((row) => (
            <li>
              <a class="list-row" href={`/admin/content/${key}/${row.id}`}>
                <span>
                  <strong>{key === 'categories' ? parseJson<any>(row.name_json, {}).en ?? row.slug : row[d.title]}</strong>
                  <span class="muted small">{row.date_label ?? row.dates_label ?? row.position ?? (row.publish_at ? <Time ts={row.publish_at} /> : row.slug)}{row.views ? ` · ${row.views} views` : ''}</span>
                </span>
                {row.status ? <span class="row">{row.featured ? <Badge status="info" label="Featured" /> : null}<Badge status={row.status} /></span> : null}
              </a>
            </li>
          ))}
        </ul>
      ) : <Empty>Nothing here yet. <a href={`/admin/content/${key}/new`}>Create the first {d.singular}</a>.</Empty>}
      <Pager base={`/admin/content/${key}`} page={pg} hasMore={rows.length > 50} params={q} />
    </>
  ));
});

function toLocalInput(ts: number | null) {
  return ts ? new Date(ts).toISOString().slice(0, 16) : '';
}

async function editForm(c: C, d: CDef, row: any | null, error?: string) {
  const key = c.req.param('coll');
  const cats = d.table === 'articles' ? (await c.env.DB.prepare('SELECT id, slug, name_json FROM article_categories ORDER BY sort').all<any>()).results : [];
  const i18n = parseJson<Record<string, Record<string, string>>>(row?.i18n_json, {});
  const action = row ? `/admin/content/${key}/${row.id}` : `/admin/content/${key}`;
  const publicUrl = row && d.publicBase && row.status === 'published' ? `${d.table === 'articles' && row.is_announcement ? '/announcements' : d.publicBase}/${row.slug}` : null;
  const input = (f: CField, name: string, value: any) => {
    switch (f.type) {
      case 'image': return <MediaField label={f.label} name={name} value={value ?? ''} help={f.help} />;
      case 'file': return <MediaField label={f.label} name={name} value={value ?? ''} kind="document" help={f.help} />;
      case 'select': return <Select label={f.label} name={name} value={value ?? f.options?.[0]?.value} options={f.options ?? []} help={f.help} />;
      case 'checkbox': return <Check label={f.label} name={name} checked={!!value} help={f.help} />;
      case 'number': return <Field label={f.label} name={name} type="number" value={value ?? 0} required={f.required} help={f.help} />;
      case 'datetime': return <Field label={f.label} name={name} type="datetime-local" value={toLocalInput(value)} help={f.help} />;
      case 'category': return <Select label={f.label} name={name} value={String(value ?? '')} options={[{ value: '', label: '— None —' }, ...cats.map((ct) => ({ value: String(ct.id), label: parseJson<any>(ct.name_json, {}).en ?? ct.slug }))]} />;
      case 'i18nname': {
        const v = parseJson<Record<string, string>>(value, {});
        return <>{['en', ...TR_LOCALES].map((l) => <Field label={`${f.label} (${l.toUpperCase()})`} name={`${name}__${l}`} value={v[l] ?? ''} required={l === 'en'} max={80} />)}</>;
      }
      default: return <Field label={f.label} name={name} type={f.type === 'markdown' ? 'markdown' : f.type === 'textarea' ? 'textarea' : f.type === 'url' ? 'url' : 'text'} value={value ?? ''} required={f.required} max={f.max} help={f.help} />;
    }
  };
  return page(c, { title: row ? `Edit ${d.singular}` : `New ${d.singular}`, active: key === 'articles' ? 'articles' : 'collections', back: { href: `/admin/content/${key}`, label: d.label }, flash: error ? { error } : undefined }, (
    <>
      {row ? (
        <div class="row wrap page-actions-inline">
          {d.table === 'articles' ? <a class="btn small" href={`/admin/content/articles/${row.id}/preview`} target="_blank">Preview</a> : null}
          {publicUrl ? <a class="btn small ghost" href={publicUrl} target="_blank" rel="noopener">View live ↗</a> : null}
          <a class="btn small ghost" href={`/admin/content/${key}/${row.id}/revisions`}>History</a>
        </div>
      ) : null}
      <form method="post" action={action} class="stack" data-unsaved-guard>
        <Card title="English (main)">{d.fields.map((f) => input(f, f.col, row?.[f.col]))}</Card>
        {d.i18n
          ? TR_LOCALES.map((l) => (
              <details class="card locale-card">
                <summary>{l === 'fr' ? 'French translation' : 'Spanish translation (prepared)'}{Object.keys(i18n[l] ?? {}).length ? ' ✓' : ''}</summary>
                <p class="help">Leave a field empty to show the English text. Important or legal wording must be reviewed by a qualified translator.</p>
                {d.fields.filter((f) => f.tr).map((f) => input({ ...f, required: false }, `tr__${l}__${f.col}`, i18n[l]?.[f.col]))}
              </details>
            ))
          : null}
        <div class="sticky-actions"><button class="btn primary" type="submit">{row ? 'Save changes' : `Create ${d.singular}`}</button></div>
      </form>
      {row ? <Card title="Delete"><ConfirmForm action={`/admin/content/${key}/${row.id}/delete`} label={`Delete this ${d.singular}`} message={`Delete this ${d.singular}? A copy is kept in its history for recovery.`} /></Card> : null}
    </>
  ));
}

r.get('/:coll/new', (c) => {
  const d = def(c);
  return d ? editForm(c, d, null) : back(c, '/admin/content');
});

r.get('/:coll/:id{[0-9]+}', async (c) => {
  const d = def(c);
  if (!d) return back(c, '/admin/content');
  const row = await c.env.DB.prepare(`SELECT * FROM ${d.table} WHERE id = ?`).bind(intParam(c, 'id')).first<any>();
  return row ? editForm(c, d, row) : back(c, `/admin/content/${c.req.param('coll')}`, { error: 'Not found.' });
});

async function readValues(c: C, d: CDef, fd: Record<string, any>, existing: any | null) {
  const v: Record<string, any> = {};
  for (const f of d.fields) {
    const raw = fd[f.col];
    switch (f.type) {
      case 'number': v[f.col] = parseInt(String(raw ?? '0'), 10) || 0; break;
      case 'checkbox': v[f.col] = raw === '1' ? 1 : 0; break;
      case 'image': case 'file': case 'url': v[f.col] = safeHref(clampStr(raw, 500)); break;
      case 'datetime': { const t = raw ? Date.parse(String(raw) + 'Z') : NaN; v[f.col] = Number.isFinite(t) ? t : null; break; }
      case 'category': v[f.col] = raw ? parseInt(String(raw), 10) || null : null; break;
      case 'select': v[f.col] = (f.options ?? []).some((o) => o.value === raw) ? raw : f.options?.[0]?.value; break;
      case 'i18nname': {
        const o: Record<string, string> = {};
        for (const l of ['en', ...TR_LOCALES]) { const s = clampStr(fd[`${f.col}__${l}`], 80); if (s) o[l] = s; }
        v[f.col] = JSON.stringify(o);
        break;
      }
      default: v[f.col] = clampStr(raw, f.max ?? (f.type === 'markdown' ? 100000 : 2000));
    }
  }
  if ('slug' in v) v.slug = slugify(v.slug || String(v[d.slugFrom ?? d.title] ?? '')) || `item-${Date.now().toString(36)}`;
  if (d.i18n) {
    const i18n: Record<string, Record<string, string>> = {};
    for (const l of TR_LOCALES) for (const f of d.fields.filter((x) => x.tr)) {
      const s = clampStr(fd[`tr__${l}__${f.col}`], f.max ?? 100000);
      if (s) (i18n[l] ??= {})[f.col] = s;
    }
    v.i18n_json = JSON.stringify(i18n);
  }
  if (d.table === 'articles') {
    if (v.status === 'scheduled' && !v.publish_at) return { error: 'A scheduled article needs a publication date.' };
    if (v.status === 'scheduled' && v.publish_at <= Date.now()) v.status = 'published';
    if (v.status === 'published') v.published_at = existing?.published_at ?? v.publish_at ?? Date.now();
    if (v.status === 'published' && !v.publish_at) v.publish_at = v.published_at;
  }
  const missing = d.fields.find((f) => f.required && (v[f.col] === '' || v[f.col] == null || (f.type === 'i18nname' && !JSON.parse(v[f.col]).en)));
  if (missing) return { error: `${missing.label} is required.` };
  return { v };
}

async function save(c: C, existingId: number | null) {
  const d = def(c);
  if (!d) return back(c, '/admin/content');
  const key = c.req.param('coll');
  const fd = await c.req.parseBody();
  const existing = existingId ? await c.env.DB.prepare(`SELECT * FROM ${d.table} WHERE id = ?`).bind(existingId).first<any>() : null;
  if (existingId && !existing) return back(c, `/admin/content/${key}`, { error: 'Not found.' });
  const res = await readValues(c, d, fd as any, existing);
  if ('error' in res) return editForm(c, d, { ...(existing ?? {}), ...Object.fromEntries(Object.entries(fd)) }, res.error);
  const v = res.v!;
  if (v.slug) {
    const clash = await c.env.DB.prepare(`SELECT id FROM ${d.table} WHERE slug = ? AND id != ?`).bind(v.slug, existingId ?? 0).first();
    if (clash) return editForm(c, d, { ...(existing ?? {}), ...v, id: existingId }, 'That address (slug) is already used by another item.');
  }
  const ts = Date.now();
  const hasTimestamps = d.table !== 'article_categories';
  if (hasTimestamps) v.updated_at = ts;
  let id = existingId;
  if (existing) {
    await c.env.DB.prepare("INSERT INTO content_revisions (entity_type, entity_id, data_json, note, created_by, created_at) VALUES (?, ?, ?, 'Before edit', ?, ?)").bind(d.table, existingId, JSON.stringify(existing), c.get('user').id, ts).run();
    const cols = Object.keys(v);
    await c.env.DB.prepare(`UPDATE ${d.table} SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...cols.map((k) => v[k]), existingId).run();
  } else {
    if (hasTimestamps) v.created_at = ts;
    if (d.table === 'articles') v.created_by = c.get('user').id;
    const cols = Object.keys(v);
    const row = await c.env.DB.prepare(`INSERT INTO ${d.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) RETURNING id`).bind(...cols.map((k) => v[k])).first<{ id: number }>();
    id = row!.id;
  }
  const published = d.table === 'articles' && v.status === 'published' && existing?.status !== 'published';
  await contentChanged(c, d.table === 'articles' ? (published ? 'article.publish' : v.status === 'unpublished' ? 'article.unpublish' : 'article.save') : 'collection.save', d.table, id!, String(v[d.title] ?? v.slug ?? ''));
  if (published) {
    await notifyAdmins(c.env, c.executionCtx as ExecutionContext, { type: 'content_published', title: `Article published: ${v.title}`, link: `/admin/content/articles/${id}`, roles: ['super_admin', 'content_admin'], excludeUserId: c.get('user').id });
  }
  return back(c, `/admin/content/${key}/${id}`, { ok: existing ? 'Saved and published to the website.' : 'Created.' });
}

r.post('/:coll', (c) => save(c, null));
r.post('/:coll/:id{[0-9]+}', (c) => save(c, intParam(c, 'id')));

r.post('/:coll/:id{[0-9]+}/delete', async (c) => {
  const d = def(c);
  if (!d) return back(c, '/admin/content');
  const id = intParam(c, 'id');
  const row = await c.env.DB.prepare(`SELECT * FROM ${d.table} WHERE id = ?`).bind(id).first<any>();
  if (!row) return back(c, `/admin/content/${c.req.param('coll')}`);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO content_revisions (entity_type, entity_id, data_json, note, created_by, created_at) VALUES (?, ?, ?, 'Deleted', ?, ?)").bind(d.table, id, JSON.stringify(row), c.get('user').id, Date.now()),
    c.env.DB.prepare(`DELETE FROM ${d.table} WHERE id = ?`).bind(id),
  ]);
  await contentChanged(c, 'collection.delete', d.table, id, String(row[d.title] ?? ''));
  return back(c, `/admin/content/${c.req.param('coll')}`, { ok: 'Deleted. It can be restored from the revision history.' });
});

r.get('/:coll/:id{[0-9]+}/revisions', async (c) => {
  const d = def(c);
  if (!d) return back(c, '/admin/content');
  const id = intParam(c, 'id');
  const revs = (await c.env.DB.prepare('SELECT r.id, r.note, r.created_at, u.display_name FROM content_revisions r LEFT JOIN users u ON u.id = r.created_by WHERE r.entity_type = ? AND r.entity_id = ? ORDER BY r.created_at DESC LIMIT 50').bind(d.table, id).all<any>()).results;
  const key = c.req.param('coll');
  return page(c, { title: 'Revision history', active: 'collections', back: { href: `/admin/content/${key}/${id}`, label: 'Back to editor' } }, (
    <Card title="Previous versions">
      {revs.length ? (
        <ul class="list">{revs.map((v) => <li class="list-row"><span><strong><Time ts={v.created_at} /></strong><span class="muted small">{v.note} · {v.display_name ?? 'System'}</span></span><ConfirmForm action={`/admin/content/${key}/${id}/revisions/${v.id}/restore`} label="Restore" message="Restore this version? The current version is saved to history first." danger={false} small /></li>)}</ul>
      ) : <Empty>No previous versions yet.</Empty>}
    </Card>
  ));
});

r.post('/:coll/:id{[0-9]+}/revisions/:rid{[0-9]+}/restore', async (c) => {
  const d = def(c);
  if (!d) return back(c, '/admin/content');
  const id = intParam(c, 'id');
  const rev = await c.env.DB.prepare('SELECT data_json FROM content_revisions WHERE id = ? AND entity_type = ? AND entity_id = ?').bind(intParam(c, 'rid'), d.table, id).first<any>();
  if (!rev) return back(c, `/admin/content/${c.req.param('coll')}/${id}`, { error: 'Revision not found.' });
  const data = parseJson<Record<string, any>>(rev.data_json, {});
  const current = await c.env.DB.prepare(`SELECT * FROM ${d.table} WHERE id = ?`).bind(id).first<any>();
  const cols = Object.keys(data).filter((k) => /^[a-z_]+$/.test(k));
  if (current) {
    await c.env.DB.prepare("INSERT INTO content_revisions (entity_type, entity_id, data_json, note, created_by, created_at) VALUES (?, ?, ?, 'Before restore', ?, ?)").bind(d.table, id, JSON.stringify(current), c.get('user').id, Date.now()).run();
    const upd = cols.filter((k) => k !== 'id');
    await c.env.DB.prepare(`UPDATE ${d.table} SET ${upd.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...upd.map((k) => data[k]), id).run();
  } else {
    await c.env.DB.prepare(`INSERT INTO ${d.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...cols.map((k) => data[k])).run();
  }
  await contentChanged(c, 'collection.restore', d.table, id);
  return back(c, `/admin/content/${c.req.param('coll')}/${id}`, { ok: 'Version restored.' });
});

// Article preview (works for drafts and scheduled articles)
r.get('/articles/:id{[0-9]+}/preview', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(intParam(c, 'id')).first<any>();
  if (!row) return c.text('Not found', 404);
  return renderArticlePreview(c, row);
});

export default r;
