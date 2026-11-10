/**
 * Media library. Phones upload straight from the gallery or camera. The browser
 * resizes and compresses images to WebP (and AVIF where the browser can encode it) in
 * several widths before upload (see public/assets/admin.js), so a 12 MB phone photo
 * becomes ~300 KB responsive variants. The server re-validates every file by its
 * magic bytes and size.
 */
import { Hono } from 'hono';
import type { AppEnv, Env } from '../../env';
import { clampStr, parseJson, safeHref } from '../../lib/util';
import { Card, ConfirmForm, Empty, Field, Pager, Select, Time } from '../../views/admin/ui';
import { back, contentChanged, intParam, logAction, page, type C } from './common';

const r = new Hono<AppEnv>();
const CATEGORIES = ['general', 'history', 'portraits', 'architecture', 'manuscripts', 'publications', 'leadership', 'documents', 'video'];
const LIMITS = { image: 15 * 1024 * 1024, video: 95 * 1024 * 1024, document: 25 * 1024 * 1024 };

async function sniff(file: File): Promise<{ mime: string; ext: string; kind: 'image' | 'video' | 'document' } | null> {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  const ascii = String.fromCharCode(...b);
  if (hex.startsWith('ffd8ff')) return { mime: 'image/jpeg', ext: 'jpg', kind: 'image' };
  if (hex.startsWith('89504e47')) return { mime: 'image/png', ext: 'png', kind: 'image' };
  if (ascii.startsWith('GIF8')) return { mime: 'image/gif', ext: 'gif', kind: 'image' };
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp', kind: 'image' };
  if (ascii.slice(4, 8) === 'ftyp') {
    const brand = ascii.slice(8, 12);
    if (brand === 'avif' || brand === 'avis') return { mime: 'image/avif', ext: 'avif', kind: 'image' };
    if (['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash'].includes(brand)) return { mime: 'video/mp4', ext: 'mp4', kind: 'video' };
  }
  if (hex.startsWith('1a45dfa3')) return { mime: 'video/webm', ext: 'webm', kind: 'video' };
  if (ascii.startsWith('%PDF')) return { mime: 'application/pdf', ext: 'pdf', kind: 'document' };
  return null; // SVG and everything else is rejected (SVG can carry scripts)
}

const USAGE_COLUMNS: [string, string, string][] = [
  ['page_sections', 'content_json', 'page section'], ['page_sections', 'settings_json', 'page section background'], ['pages', 'draft_json', 'page draft'], ['pages', 'meta_json', 'page SEO image'],
  ['articles', 'cover_image', 'article cover'], ['articles', 'body', 'article text'], ['historical_events', 'image', 'timeline event'], ['historical_events', 'body', 'timeline text'],
  ['historical_figures', 'portrait', 'historical figure'], ['historical_figures', 'body', 'biography text'], ['historical_archives', 'image', 'archive item'], ['historical_archives', 'file_url', 'archive download'],
  ['leadership_profiles', 'photo', 'leadership profile'], ['principles', 'image', 'principle'], ['symbols', 'image', 'symbol'], ['site_settings', 'value', 'site settings'],
];

export async function mediaUsage(env: Env, url: string) {
  const out: { where: string; id: string }[] = [];
  const res = await env.DB.batch(USAGE_COLUMNS.map(([t, col]) => env.DB.prepare(`SELECT ${t === 'site_settings' ? 'key' : 'id'} AS id FROM ${t} WHERE instr(${col}, ?) > 0 LIMIT 20`).bind(url)));
  res.forEach((r, i) => r.results.forEach((row: any) => out.push({ where: USAGE_COLUMNS[i][2], id: String(row.id) })));
  return out;
}

/** Remove deleted/replaced files from this data centre's edge cache (others expire via R2 404 on next miss). */
async function purgeEdge(c: C, urls: string[]) {
  const origin = new URL(c.req.url).origin;
  await Promise.all(urls.map((u) => caches.default.delete(new Request(origin + u)).catch(() => false)));
}

async function replaceReferences(env: Env, oldUrl: string, newUrl: string) {
  await env.DB.batch(USAGE_COLUMNS.map(([t, col]) => env.DB.prepare(`UPDATE ${t} SET ${col} = REPLACE(${col}, ?, ?) WHERE instr(${col}, ?) > 0`).bind(oldUrl, newUrl, oldUrl)));
}

async function storeUpload(c: C, fd: FormData): Promise<{ error: string } | { url: string; r2Key: string; kind: string; mime: string; size: number; width: number | null; height: number | null; variants: any[] }> {
  const file = fd.get('file');
  if (!file || typeof file === 'string') return { error: 'No file received.' };
  const t = await sniff(file as File);
  if (!t) return { error: 'Unsupported file type. Use JPG, PNG, WebP, AVIF, GIF, MP4, WebM or PDF.' };
  if (file.size > LIMITS[t.kind]) return { error: `File too large (max ${Math.round(LIMITS[t.kind] / 1048576)} MB for ${t.kind}s).` };
  const d = new Date();
  const base = `media/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}`;
  const key = `${base}.${t.ext}`;
  await c.env.BUCKET.put(key, (file as File).stream(), { httpMetadata: { contentType: t.mime, cacheControl: 'public, max-age=31536000, immutable' } });
  const variants: any[] = [];
  if (t.kind === 'image') {
    for (const [name, v] of fd.entries()) {
      const m = name.match(/^variant_(\d{2,4})$/);
      if (!m || typeof v === 'string') continue;
      const vt = await sniff(v as File);
      if (!vt || vt.kind !== 'image' || v.size > LIMITS.image) continue;
      const vkey = `${base}-${m[1]}.${vt.ext}`;
      await c.env.BUCKET.put(vkey, (v as File).stream(), { httpMetadata: { contentType: vt.mime, cacheControl: 'public, max-age=31536000, immutable' } });
      variants.push({ w: parseInt(m[1], 10), url: `/${vkey}`, mime: vt.mime, size: v.size, r2_key: vkey });
    }
  }
  const width = parseInt(String(fd.get('width') ?? ''), 10) || null;
  const height = parseInt(String(fd.get('height') ?? ''), 10) || null;
  return { url: `/${key}`, r2Key: key, kind: t.kind, mime: t.mime, size: file.size, width, height, variants: variants.sort((a, b) => a.w - b.w) };
}

r.get('/', async (c) => {
  const q = new URL(c.req.url).searchParams;
  const pg = Math.max(1, parseInt(q.get('page') ?? '1', 10) || 1);
  const where: string[] = [];
  const binds: any[] = [];
  if (CATEGORIES.includes(q.get('category') ?? '')) { where.push('category = ?'); binds.push(q.get('category')); }
  if (['image', 'video', 'document'].includes(q.get('kind') ?? '')) { where.push('kind = ?'); binds.push(q.get('kind')); }
  const term = (q.get('q') ?? '').trim().slice(0, 100);
  if (term) { where.push('(instr(lower(title), lower(?)) > 0 OR instr(lower(alt_json), lower(?)) > 0 OR instr(url, ?) > 0)'); binds.push(term, term, term); }
  const rows = (await c.env.DB.prepare(`SELECT id, url, kind, mime, title, variants_json, size FROM media_assets ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 49 OFFSET ?`).bind(...binds, (pg - 1) * 48).all<any>()).results;
  return page(c, { title: 'Media library', active: 'media' }, (
    <>
      <Card title="Upload" class="upload-card">
        <div id="upload" class="uploader" data-uploader>
          <p class="help">Choose photos from your gallery, take a photo, or upload a video (MP4/WebM, max 95 MB) or PDF. Images are resized and compressed automatically.</p>
          <Select label="Category" name="category" value="general" options={CATEGORIES.map((x) => ({ value: x, label: x[0].toUpperCase() + x.slice(1) }))} />
          <div class="row wrap">
            <label class="btn primary">Choose files<input type="file" hidden multiple accept="image/*,video/mp4,video/webm,application/pdf" data-upload-input /></label>
            <label class="btn">Take photo<input type="file" hidden accept="image/*" capture="environment" data-upload-input /></label>
          </div>
          <ul class="upload-list" data-upload-list aria-live="polite" />
        </div>
      </Card>
      <form class="filters" method="get">
        <input type="search" name="q" value={term} placeholder="Search media" aria-label="Search media" />
        <select name="kind" aria-label="Type"><option value="">All types</option>{['image', 'video', 'document'].map((k) => <option value={k} selected={q.get('kind') === k}>{k}</option>)}</select>
        <select name="category" aria-label="Category"><option value="">All categories</option>{CATEGORIES.map((k) => <option value={k} selected={q.get('category') === k}>{k}</option>)}</select>
        <button class="btn small" type="submit">Filter</button>
      </form>
      {rows.length ? (
        <ul class="media-grid">
          {rows.slice(0, 48).map((m) => {
            const v = parseJson<any[]>(m.variants_json, []);
            const thumb = v[0]?.url ?? m.url;
            return (
              <li><a href={`/admin/media/${m.id}`}>{m.kind === 'image' ? <img src={thumb} alt={m.title} loading="lazy" /> : <span class="file-tile">{m.kind === 'video' ? '▶ Video' : 'PDF'}</span>}<span class="cap">{m.title || m.url.split('/').pop()}</span></a></li>
            );
          })}
        </ul>
      ) : <Empty>No media yet.</Empty>}
      <Pager base="/admin/media" page={pg} hasMore={rows.length > 48} params={q} />
    </>
  ));
});

r.get('/library.json', async (c) => {
  const kind = c.req.query('kind');
  const term = (c.req.query('q') ?? '').trim().slice(0, 100).replace(/[%_]/g, '');
  const where: string[] = [];
  const binds: any[] = [];
  if (kind === 'image' || kind === 'video') { where.push('kind = ?'); binds.push(kind); }
  if (term) { where.push('(instr(lower(title), lower(?)) > 0 OR instr(url, ?) > 0)'); binds.push(term, term); }
  const rows = (await c.env.DB.prepare(`SELECT id, url, kind, title, variants_json FROM media_assets ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 60`).bind(...binds).all<any>()).results;
  return c.json(rows.map((m) => ({ id: m.id, url: m.url, kind: m.kind, title: m.title, thumb: parseJson<any[]>(m.variants_json, [])[0]?.url ?? m.url })));
});

r.post('/upload', async (c) => {
  const fd = await c.req.formData();
  const res = await storeUpload(c, fd);
  if ('error' in res) return c.json({ ok: false, error: res.error }, 400);
  const ts = Date.now();
  const title = clampStr(fd.get('title'), 200);
  const category = CATEGORIES.includes(String(fd.get('category'))) ? String(fd.get('category')) : 'general';
  const row = await c.env.DB.prepare(
    'INSERT INTO media_assets (url, r2_key, kind, mime, size, width, height, variants_json, title, alt_json, category, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
  )
    .bind(res.url, res.r2Key, res.kind, res.mime, res.size, res.width, res.height, JSON.stringify(res.variants), title, JSON.stringify({ en: clampStr(fd.get('alt'), 300) }), category, c.get('user').id, ts, ts)
    .first<{ id: number }>();
  await contentChanged(c, 'media.upload', 'media', row!.id, title || res.url);
  return c.json({ ok: true, id: row!.id, url: res.url, kind: res.kind, thumb: res.variants[0]?.url ?? res.url });
});

r.get('/:id{[0-9]+}', async (c) => {
  const m = await c.env.DB.prepare('SELECT m.*, u.display_name FROM media_assets m LEFT JOIN users u ON u.id = m.created_by WHERE m.id = ?').bind(intParam(c, 'id')).first<any>();
  if (!m) return back(c, '/admin/media', { error: 'Not found.' });
  const usage = await mediaUsage(c.env, m.url);
  const alt = parseJson<Record<string, string>>(m.alt_json, {});
  const variants = parseJson<any[]>(m.variants_json, []);
  return page(c, { title: m.title || 'Media item', active: 'media', back: { href: '/admin/media', label: 'Media library' } }, (
    <>
      <Card>
        <div class="media-preview">
          {m.kind === 'image' ? <img src={variants.at(-1)?.url ?? m.url} alt={alt.en ?? ''} /> : m.kind === 'video' ? <video src={m.url} controls preload="metadata" /> : <a href={m.url} target="_blank">Open PDF</a>}
        </div>
        <p class="kv"><span>Address</span><code class="copy" data-copy>{m.url}</code></p>
        <p class="kv"><span>Type</span><span>{m.mime} · {Math.round(m.size / 1024)} KB{m.width ? ` · ${m.width}×${m.height}` : ''}</span></p>
        {variants.length ? <p class="kv"><span>Optimised sizes</span><span>{variants.map((v) => `${v.w}px (${Math.round(v.size / 1024)} KB)`).join(', ')}</span></p> : null}
        <p class="kv"><span>Uploaded</span><span><Time ts={m.created_at} /> {m.display_name ? `by ${m.display_name}` : ''}</span></p>
      </Card>
      <Card title="Details">
        <form method="post" action={`/admin/media/${m.id}`} class="stack">
          <Field label="Title" name="title" value={m.title} max={200} />
          <Field label="Description for screen readers (English)" name="alt_en" value={alt.en ?? ''} max={300} help="Describe what the image shows. Leave empty only for decorative images." />
          <Field label="Description (French)" name="alt_fr" value={alt.fr ?? ''} max={300} />
          <Select label="Category" name="category" value={m.category} options={CATEGORIES.map((x) => ({ value: x, label: x }))} />
          <Field label="Credit / author" name="credit" value={m.credit} max={300} />
          <Field label="Licence" name="license" value={m.license} max={200} help="e.g. Public domain, CC BY-SA 4.0, © Owner — used with permission" />
          <Field label="Source URL" name="source_url" value={m.source_url} type="url" max={500} />
          <button class="btn primary" type="submit">Save</button>
        </form>
      </Card>
      <Card title="Replace file">
        <p class="help">Uploads a new version and updates every page, article and setting that uses this file.</p>
        <div data-uploader data-replace={`/admin/media/${m.id}/replace`}>
          <div class="row wrap">
            <label class="btn">Choose replacement<input type="file" hidden accept={m.kind === 'image' ? 'image/*' : m.kind === 'video' ? 'video/mp4,video/webm' : 'application/pdf'} data-upload-input /></label>
            {m.kind === 'image' ? <label class="btn">Take photo<input type="file" hidden accept="image/*" capture="environment" data-upload-input /></label> : null}
          </div>
          <ul class="upload-list" data-upload-list aria-live="polite" />
        </div>
      </Card>
      <Card title={`Where it is used (${usage.length})`}>
        {usage.length ? <ul class="list compact">{usage.map((u) => <li>{u.where} #{u.id}</li>)}</ul> : <p class="muted">Not used anywhere.</p>}
        {usage.length ? <p class="help">Remove it from these places before deleting, or replace it instead.</p> : <ConfirmForm action={`/admin/media/${m.id}/delete`} label="Delete file" message="Delete this file permanently?" />}
      </Card>
    </>
  ));
});

r.post('/:id{[0-9]+}', async (c) => {
  const id = intParam(c, 'id');
  const f = await c.req.parseBody();
  const alt: Record<string, string> = {};
  if (clampStr(f.alt_en, 300)) alt.en = clampStr(f.alt_en, 300);
  if (clampStr(f.alt_fr, 300)) alt.fr = clampStr(f.alt_fr, 300);
  await c.env.DB.prepare('UPDATE media_assets SET title = ?, alt_json = ?, category = ?, credit = ?, license = ?, source_url = ?, updated_at = ? WHERE id = ?')
    .bind(clampStr(f.title, 200), JSON.stringify(alt), CATEGORIES.includes(String(f.category)) ? f.category : 'general', clampStr(f.credit, 300), clampStr(f.license, 200), safeHref(clampStr(f.source_url, 500)), Date.now(), id)
    .run();
  await contentChanged(c, 'media.update', 'media', id);
  return back(c, `/admin/media/${id}`, { ok: 'Saved.' });
});

r.post('/:id{[0-9]+}/replace', async (c) => {
  const id = intParam(c, 'id');
  const m = await c.env.DB.prepare('SELECT * FROM media_assets WHERE id = ?').bind(id).first<any>();
  if (!m) return c.json({ ok: false, error: 'Not found' }, 404);
  const res = await storeUpload(c, await c.req.formData());
  if ('error' in res) return c.json({ ok: false, error: res.error }, 400);
  if (res.kind !== m.kind) return c.json({ ok: false, error: `Please upload a ${m.kind}.` }, 400);
  await c.env.DB.prepare('UPDATE media_assets SET url = ?, r2_key = ?, mime = ?, size = ?, width = ?, height = ?, variants_json = ?, updated_at = ? WHERE id = ?')
    .bind(res.url, res.r2Key, res.mime, res.size, res.width, res.height, JSON.stringify(res.variants), Date.now(), id)
    .run();
  await replaceReferences(c.env, m.url, res.url);
  const oldKeys = [m.r2_key, ...parseJson<any[]>(m.variants_json, []).map((v) => v.r2_key)].filter(Boolean);
  if (oldKeys.length) c.executionCtx.waitUntil(c.env.BUCKET.delete(oldKeys));
  await purgeEdge(c, [m.url, ...parseJson<any[]>(m.variants_json, []).map((v) => v.url)]);
  await contentChanged(c, 'media.replace', 'media', id, `${m.url} → ${res.url}`);
  return c.json({ ok: true, id, url: res.url, reload: true });
});

r.post('/:id{[0-9]+}/delete', async (c) => {
  const id = intParam(c, 'id');
  const m = await c.env.DB.prepare('SELECT * FROM media_assets WHERE id = ?').bind(id).first<any>();
  if (!m) return back(c, '/admin/media');
  if ((await mediaUsage(c.env, m.url)).length) return back(c, `/admin/media/${id}`, { error: 'This file is still in use.' });
  const keys = [m.r2_key, ...parseJson<any[]>(m.variants_json, []).map((v) => v.r2_key)].filter(Boolean);
  if (keys.length) await c.env.BUCKET.delete(keys);
  await purgeEdge(c, [m.url, ...parseJson<any[]>(m.variants_json, []).map((v) => v.url)]);
  await c.env.DB.prepare('DELETE FROM media_assets WHERE id = ?').bind(id).run();
  await contentChanged(c, 'media.delete', 'media', id, m.url);
  return back(c, '/admin/media', { ok: 'File deleted.' });
});

export { logAction };
export default r;
