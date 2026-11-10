/**
 * Public site. This module never touches env.DB directly: content comes from the
 * snapshot via snapshot/read.ts, and form submissions are delegated to src/forms/*.
 */
import type { Context } from 'hono';
import type { AppEnv, Env } from '../env';
import { localePath, localizeRecord, pick, splitLocale, translator } from '../i18n';
import { stripMarkdown } from '../lib/markdown';
import { formTimerToken } from '../lib/guard';
import { countArticleView } from '../lib/analytics';
import type { RecordKind, SiteData } from '../snapshot/model';
import { getSnapshot } from '../snapshot/snapshot';
import { liveArticles, recordDetail, siteData, type ReadCtx } from '../snapshot/read';
import type { FormState, RenderCtx } from '../views/public/context';
import { CmsPage, DetailPage, MessagePage, SearchPage } from '../views/public/pages';
import { resolveContent } from '../views/public/sections';
import { Layout } from '../views/public/layout';
import { executeAction, findAction, handleApplicantRequest, handleApplicationPost, loadResume } from '../forms/apply';
import { handleContactPost } from '../forms/contact';

const FORM_SECTIONS: Record<string, string[]> = {
  application_form: ['apply'],
  contact_form: ['contact'],
  report_form: ['report'],
  applicant_forms: ['applicant_message', 'applicant_withdraw'],
};

const DETAIL_ROUTES: { re: RegExp; kind: RecordKind; list: string }[] = [
  { re: /^\/publications\/([a-z0-9-]+)$/, kind: 'article', list: '/publications' },
  { re: /^\/announcements\/([a-z0-9-]+)$/, kind: 'article', list: '/announcements' },
  { re: /^\/timeline\/([a-z0-9-]+)$/, kind: 'event', list: '/timeline' },
  { re: /^\/figures\/([a-z0-9-]+)$/, kind: 'figure', list: '/figures' },
  { re: /^\/archive\/([a-z0-9-]+)$/, kind: 'archive', list: '/archive' },
  { re: /^\/leadership\/([a-z0-9-]+)$/, kind: 'leader', list: '/leadership' },
  { re: /^\/principles\/([a-z0-9-]+)$/, kind: 'principle', list: '/principles' },
  { re: /^\/symbols\/([a-z0-9-]+)$/, kind: 'symbol', list: '/symbols' },
];

async function makeRc(env: Env, url: URL, data: SiteData, formNames: string[]): Promise<RenderCtx> {
  const { locale, path } = splitLocale(url.pathname, data.settings.enabledLocales);
  const timers: Record<string, string> = {};
  for (const f of formNames) timers[f] = await formTimerToken(env, f);
  return {
    env, data, locale, url, path,
    t: translator(locale, data.translations),
    lp: (p: string) => localePath(p, locale),
    timers,
    submissionToken: crypto.randomUUID(),
  };
}

function formsOn(data: SiteData, slug: string): string[] {
  const p = data.pages[slug];
  return p ? p.sections.flatMap((s) => FORM_SECTIONS[s.type] ?? []) : [];
}

function html(c: Context<AppEnv>, body: any, status = 200) {
  c.header('cache-control', 'public, max-age=0, must-revalidate');
  return c.html(body, status as any);
}

function pageSlugFor(path: string): string | null {
  if (path === '/' || path === '') return 'home';
  const m = path.match(/^\/([a-z0-9-]+)\/?$/);
  return m ? m[1] : null;
}

export async function publicHandler(c: Context<AppEnv>): Promise<Response> {
  const env = c.env;
  const ctx = c.executionCtx as ExecutionContext;
  const url = new URL(c.req.url);
  const read: ReadCtx = { env, ctx, snap: await getSnapshot(env, ctx) };

  let data: SiteData;
  try {
    data = await siteData(read);
  } catch (e) {
    console.error('public: no snapshot and database unavailable', String(e));
    return c.html('<!doctype html><meta charset="utf-8"><title>Temporarily unavailable</title><body style="background:#101010;color:#E9E0CD;font-family:Georgia,serif;text-align:center;padding:15vh 1rem"><h1>Temporarily unavailable</h1><p>Please try again in a few minutes.</p></body>', 503, { 'retry-after': '120' });
  }

  const { path } = splitLocale(url.pathname, data.settings.enabledLocales);
  const method = c.req.method;
  const notFound = async () => {
    const rc = await makeRc(env, url, data, []);
    return html(c, <MessagePage rc={rc} title={rc.t('common.notFound')} body={rc.t('common.notFoundBody')} status={404} />, 404);
  };

  // ───────── POST: forms ─────────
  if (method === 'POST') {
    const post = async (slug: string, run: (rc: RenderCtx) => Promise<{ state: FormState; status: number }>) => {
      const rc = await makeRc(env, url, data, formsOn(data, slug));
      const { state, status } = await run(rc);
      const page = data.pages[slug];
      if (!page) return notFound();
      rc.formState = state;
      return html(c, <CmsPage rc={rc} page={page} />, status);
    };
    if (path === '/apply') return post('apply', (rc) => handleApplicationPost(env, ctx, c.req.raw, rc, data));
    if (path === '/contact') return post('contact', (rc) => handleContactPost(env, ctx, c.req.raw, rc, 'contact'));
    if (path === '/report') return post('report', (rc) => handleContactPost(env, ctx, c.req.raw, rc, 'report'));
    if (path === '/apply/message') return post('contact', (rc) => handleApplicantRequest(env, ctx, c.req.raw, rc, 'message'));
    if (path === '/apply/withdraw') return post('contact', (rc) => handleApplicantRequest(env, ctx, c.req.raw, rc, 'withdraw'));
    const m = path.match(/^\/apply\/confirm\/([A-Za-z0-9_-]+)$/);
    if (m) {
      const rc = await makeRc(env, url, data, []);
      const r = await executeAction(env, ctx, m[1], rc);
      return html(c, <MessagePage rc={rc} title={r.title} body={r.body} status={r.ok ? 200 : 410} />, r.ok ? 200 : 410);
    }
    return c.text('Method not allowed', 405);
  }

  if (method !== 'GET' && method !== 'HEAD') return c.text('Method not allowed', 405);

  // ───────── Applicant links (GET shows a confirm button; link scanners can't trigger actions) ─────────
  const confirm = path.match(/^\/apply\/confirm\/([A-Za-z0-9_-]+)$/);
  if (confirm) {
    const rc = await makeRc(env, url, data, []);
    c.header('x-robots-tag', 'noindex');
    const action = await findAction(env, confirm[1]);
    if (!action) return html(c, <MessagePage rc={rc} title={rc.t('common.error')} body={rc.t('applicant.invalid')} status={410} />, 410);
    const labels: Record<string, { title: string; button: string }> = {
      verify_email: { title: rc.t('apply.verifiedTitle'), button: pick({ en: 'Confirm my email address', fr: 'Confirmer mon adresse e-mail' }, rc.locale)! },
      withdraw: { title: rc.t('applicant.withdrawTitle'), button: rc.t('applicant.withdraw') },
      message: { title: rc.t('applicant.title'), button: rc.t('common.send') },
    };
    const l = labels[action.action] ?? labels.verify_email;
    return html(
      c,
      <Layout rc={rc} meta={{ title: l.title, noindex: true }}>
        <section class="section bg-obsidian pad-spacious">
          <div class="container narrow center confirmation">
            <h1>{l.title}</h1>
            <span class="rule" aria-hidden="true" />
            <form method="post" action={rc.lp(path)}><button class="btn btn-gold" type="submit">{l.button}</button></form>
          </div>
        </section>
      </Layout>,
    );
  }
  const resume = path.match(/^\/apply\/resume\/([A-Za-z0-9_-]+)$/);
  if (resume) {
    const rc = await makeRc(env, url, data, formsOn(data, 'apply'));
    c.header('x-robots-tag', 'noindex');
    const values = await loadResume(env, resume[1]);
    const page = data.pages.apply;
    if (!page) return notFound();
    rc.formState = values ? { form: 'apply', values, info: rc.t('apply.resumed') } : { form: 'apply', message: rc.t('apply.resumeExpired') };
    return html(c, <CmsPage rc={rc} page={page} />, values ? 200 : 410);
  }

  // ───────── Search (in-memory over the snapshot; disallowed in robots.txt) ─────────
  if (path === '/search') {
    const rc = await makeRc(env, url, data, []);
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
    return html(c, <SearchPage rc={rc} q={q} results={q ? search(rc, data, q) : []} />);
  }

  // ───────── Detail pages: 404 from the snapshot, else exactly one DB read ─────────
  for (const r of DETAIL_ROUTES) {
    const m = path.match(r.re);
    if (!m) continue;
    const detail = await recordDetail(read, r.kind, m[1]);
    if (!detail) return notFound();
    if (r.kind === 'article') {
      const correct = detail.light.isAnnouncement ? '/announcements' : '/publications';
      if (correct !== r.list) return c.redirect(localePath(`${correct}/${m[1]}`, splitLocale(url.pathname, data.settings.enabledLocales).locale), 301);
      countArticleView(env, ctx, c.req.raw, detail.light.id);
    }
    const rc = await makeRc(env, url, data, []);
    return html(c, <DetailPage rc={rc} kind={r.kind} light={detail.light} long={detail.long} listPath={r.list} />);
  }

  // ───────── CMS pages ─────────
  const slug = pageSlugFor(path);
  if (slug && data.pages[slug] && !(slug === 'home' && path !== '/')) {
    if (path !== '/' && path.endsWith('/')) return c.redirect(url.pathname.replace(/\/+$/, ''), 301);
    const rc = await makeRc(env, url, data, formsOn(data, slug));
    const page = data.pages[slug];
    rc.notTranslated = rc.locale !== 'en' && page.sections.some((s) => s.visible !== false && s.content.en && !s.content[rc.locale]);
    return html(c, <CmsPage rc={rc} page={page} />);
  }
  return notFound();
}

function search(rc: RenderCtx, data: SiteData, q: string) {
  const terms = q.toLowerCase().split(/\s+/).filter((x) => x.length > 1).slice(0, 6);
  if (!terms.length) return [];
  const out: { title: string; href: string; snippet: string; kind: string; score: number }[] = [];
  const add = (kind: string, title: string, href: string, text: string) => {
    const hay = `${title} ${text}`.toLowerCase();
    if (!terms.every((t) => hay.includes(t))) return;
    const score = terms.reduce((s, t) => s + (title.toLowerCase().includes(t) ? 3 : 1), 0);
    const plain = stripMarkdown(text);
    const i = Math.max(0, plain.toLowerCase().indexOf(terms[0]) - 60);
    out.push({ kind, title, href: rc.lp(href), snippet: (i > 0 ? '…' : '') + plain.slice(i, i + 200) + (plain.length > i + 200 ? '…' : ''), score });
  };
  const L = rc.locale;
  for (const p of Object.values(data.pages)) {
    const text = p.sections.map((s) => { const c = resolveContent(s, L); return [c.heading, c.subheading, c.body, c.intro, ...(Array.isArray(c.items) ? c.items.map((i: any) => `${i.title ?? ''} ${i.text ?? ''}`) : [])].filter((x) => typeof x === 'string').join(' '); }).join(' ');
    add('Page', pick(p.meta.title, L) ?? p.name, p.slug === 'home' ? '/' : `/${p.slug}`, text);
  }
  for (const a of liveArticles(data)) add(a.isAnnouncement ? 'Announcement' : 'Publication', a.title, `/${a.isAnnouncement ? 'announcements' : 'publications'}/${a.slug}`, `${a.excerpt} ${a.tags.join(' ')}`);
  for (const e of data.events.map((x) => localizeRecord(x, L))) add('Timeline', `${e.dateLabel} — ${e.title}`, `/timeline/${e.slug}`, e.summary);
  for (const f of data.figures.map((x) => localizeRecord(x, L))) add('Figure', f.name, `/figures/${f.slug}`, `${f.roleTitle} ${f.summary}`);
  for (const a of data.archives.map((x) => localizeRecord(x, L))) add('Archive', a.title, `/archive/${a.slug}`, `${a.description} ${a.source}`);
  for (const p of data.principles.map((x) => localizeRecord(x, L))) add('Principle', p.title, `/principles/${p.slug}`, p.summary);
  for (const s of data.symbols.map((x) => localizeRecord(x, L))) add('Symbol', s.name, `/symbols/${s.slug}`, `${s.origin} ${s.summary}`);
  for (const f of data.faqs.map((x) => localizeRecord(x, L))) add('FAQ', f.question, `/faq#faq-${f.slug}`, f.answer);
  for (const l of data.leadership.map((x) => localizeRecord(x, L))) add('Leadership', l.name, `/leadership/${l.slug}`, `${l.position} ${l.summary}`);
  return out.sort((a, b) => b.score - a.score).slice(0, 50);
}

// ───────── sitemap.xml & robots.txt (from the snapshot) ─────────
export async function sitemapHandler(c: Context<AppEnv>) {
  const read: ReadCtx = { env: c.env, ctx: c.executionCtx as ExecutionContext, snap: await getSnapshot(c.env, c.executionCtx as ExecutionContext) };
  const data = await siteData(read);
  const base = c.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const locales = data.settings.enabledLocales;
  const entries: { path: string; lastmod: number }[] = [];
  for (const p of Object.values(data.pages)) if (p.inSitemap) entries.push({ path: p.slug === 'home' ? '/' : `/${p.slug}`, lastmod: p.updatedAt });
  for (const a of liveArticles(data)) entries.push({ path: `/${a.isAnnouncement ? 'announcements' : 'publications'}/${a.slug}`, lastmod: a.updatedAt });
  data.events.forEach((x) => entries.push({ path: `/timeline/${x.slug}`, lastmod: x.updatedAt }));
  data.figures.forEach((x) => entries.push({ path: `/figures/${x.slug}`, lastmod: x.updatedAt }));
  data.archives.forEach((x) => entries.push({ path: `/archive/${x.slug}`, lastmod: x.updatedAt }));
  data.leadership.forEach((x) => entries.push({ path: `/leadership/${x.slug}`, lastmod: x.updatedAt }));
  data.principles.forEach((x) => entries.push({ path: `/principles/${x.slug}`, lastmod: x.updatedAt }));
  data.symbols.forEach((x) => entries.push({ path: `/symbols/${x.slug}`, lastmod: x.updatedAt }));
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries
  .flatMap((e) =>
    locales.map(
      (l) => `<url><loc>${esc(base + localePath(e.path, l as any))}</loc><lastmod>${new Date(e.lastmod || Date.now()).toISOString().slice(0, 10)}</lastmod>${
        locales.length > 1 ? locales.map((alt) => `<xhtml:link rel="alternate" hreflang="${alt}" href="${esc(base + localePath(e.path, alt as any))}"/>`).join('') : ''
      }</url>`,
    ),
  )
  .join('\n')}
</urlset>`;
  return c.body(xml, 200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' });
}

export async function robotsHandler(c: Context<AppEnv>) {
  const read: ReadCtx = { env: c.env, ctx: c.executionCtx as ExecutionContext, snap: await getSnapshot(c.env, c.executionCtx as ExecutionContext) };
  let locales = ['en', 'fr'];
  try {
    locales = (await siteData(read)).settings.enabledLocales;
  } catch {
    /* keep defaults */
  }
  const base = c.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const prefixes = ['', ...locales.filter((l) => l !== 'en').map((l) => `/${l}`)];
  const lines = [
    'User-agent: *',
    // Filtered, sorted and search URLs are endless permutations of the same records.
    'Disallow: /*?',
    ...prefixes.flatMap((p) => [`Disallow: ${p}/search`, `Disallow: ${p}/apply/`]),
    'Disallow: /admin',
    'Disallow: /__dev',
    'Allow: /',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ];
  return c.text(lines.join('\n'), 200, { 'cache-control': 'public, max-age=3600' });
}

// ───────── Public media from R2 (edge-cached, immutable keys) ─────────
export async function mediaHandler(c: Context<AppEnv>) {
  const url = new URL(c.req.url);
  const key = decodeURIComponent(url.pathname.slice(1)); // "media/…"
  if (!/^media\/[A-Za-z0-9/_.-]+$/.test(key) || key.includes('..')) return c.text('Not found', 404);
  const cache = caches.default;
  const cacheKey = new Request(url.origin + url.pathname);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const obj = await c.env.BUCKET.get(key);
  if (!obj) return c.text('Not found', 404, { 'cache-control': 'public, max-age=60' });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');
  if (!/^(image|video)\//.test(headers.get('content-type') ?? '')) headers.set('content-disposition', 'attachment');
  const res = new Response(obj.body, { headers });
  c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
