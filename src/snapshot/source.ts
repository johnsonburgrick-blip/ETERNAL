/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE ONLY MODULE ALLOWED TO READ PUBLIC CONTENT FROM THE DATABASE.
 * ════════════════════════════════════════════════════════════════════════════
 * Public routes/views never touch env.DB. They go through read.ts, which answers
 * from the snapshot when it is primed and calls these functions otherwise (snapshot
 * disabled, admin preview, cron). `npm run check:db-access` enforces the rule.
 */
import type { Env } from '../env';
import { parseJson } from '../lib/util';
import {
  DEFAULT_SETTINGS,
  type AppField, type ArchiveLight, type ArticleLight, type Category, type EventLight, type Faq, type FigureLight,
  type LeaderLight, type MediaLight, type NavItem, type PageEntry, type PrincipleLight, type RecordKind,
  type SectionDoc, type SiteData, type SiteSettings, type SymbolLight,
} from './model';

type Row = Record<string, any>;
const i18n = (r: Row) => parseJson<Record<string, Record<string, string>>>(r.i18n_json, {});

export async function loadSiteDataFromDb(env: Env): Promise<SiteData> {
  const db = env.DB;
  const q = (sql: string) => db.prepare(sql);
  const [settingsR, transR, navR, pagesR, sectionsR, catsR, artsR, evR, figR, arcR, leadR, prinR, symR, faqR, mediaR, fieldsR] =
    await db.batch<Row>([
      q('SELECT key, value FROM site_settings'),
      q('SELECT locale, key, value FROM language_translations'),
      q('SELECT id, location, parent_id, label_json, href, sort, is_button FROM navigation_items WHERE visible = 1 ORDER BY location, sort, id'),
      q("SELECT id, slug, name, meta_json, in_sitemap, updated_at FROM pages WHERE status = 'published'"),
      q('SELECT s.page_id, s.uid, s.type, s.visible, s.settings_json, s.content_json FROM page_sections s JOIN pages p ON p.id = s.page_id WHERE p.status = \'published\' AND s.visible = 1 ORDER BY s.page_id, s.sort'),
      q('SELECT id, slug, name_json, sort FROM article_categories ORDER BY sort, id'),
      // light copy: every column except body/views
      q("SELECT id, slug, locale, title, excerpt, cover_image, cover_alt, category_id, tags, author_name, status, publish_at, featured, is_announcement, meta_title, meta_description, published_at, updated_at FROM articles WHERE status IN ('published','scheduled') ORDER BY COALESCE(publish_at, published_at, created_at) DESC"),
      q("SELECT id, slug, date_label, year, era, title, summary, image, image_alt, certainty, sort, i18n_json, updated_at FROM historical_events WHERE status = 'published' ORDER BY year, sort, id"),
      q("SELECT id, slug, name, role_title, dates_label, portrait, portrait_alt, summary, sort, i18n_json, updated_at FROM historical_figures WHERE status = 'published' ORDER BY sort, id"),
      q("SELECT id, slug, title, kind, category, date_label, description, image, image_alt, file_url, external_url, downloadable, license, source, sort, i18n_json, updated_at FROM historical_archives WHERE status = 'published' ORDER BY sort, id"),
      q("SELECT id, slug, name, position, photo, photo_alt, summary, sort, i18n_json, updated_at FROM leadership_profiles WHERE status = 'published' ORDER BY sort, id"),
      q("SELECT id, slug, title, summary, image, image_alt, sort, i18n_json, updated_at FROM principles WHERE status = 'published' ORDER BY sort, id"),
      q("SELECT id, slug, name, image, image_alt, origin, summary, sort, i18n_json, updated_at FROM symbols WHERE status = 'published' ORDER BY sort, id"),
      q("SELECT id, slug, question, answer, category, sort, i18n_json FROM faqs WHERE status = 'published' ORDER BY sort, id"),
      q("SELECT url, kind, mime, width, height, variants_json, alt_json, credit, license, source_url FROM media_assets WHERE kind IN ('image','video')"),
      q('SELECT key, step, type, label_json, help_json, options_json, required, core, max_length, sort FROM application_fields WHERE active = 1 ORDER BY step, sort, id'),
    ]);

  const settings: SiteSettings = { ...DEFAULT_SETTINGS };
  for (const r of settingsR.results) (settings as any)[r.key] = parseJson(r.value, (settings as any)[r.key]);

  const translations: Record<string, Record<string, string>> = {};
  for (const r of transR.results) (translations[r.locale] ??= {})[r.key] = r.value;

  const nav: NavItem[] = navR.results.map((r) => ({
    id: r.id, location: r.location, parentId: r.parent_id ?? null, label: parseJson(r.label_json, { en: '' }),
    href: r.href, sort: r.sort, isButton: !!r.is_button,
  }));

  const pages: Record<string, PageEntry> = {};
  const byId = new Map<number, PageEntry>();
  for (const r of pagesR.results) {
    const p: PageEntry = {
      id: r.id, slug: r.slug, name: r.name, meta: parseJson(r.meta_json, { title: { en: r.name }, description: { en: '' } }),
      sections: [], inSitemap: !!r.in_sitemap, updatedAt: r.updated_at,
    };
    pages[r.slug] = p;
    byId.set(r.id, p);
  }
  for (const r of sectionsR.results) {
    byId.get(r.page_id)?.sections.push({
      uid: r.uid, type: r.type, visible: !!r.visible, settings: parseJson(r.settings_json, {}), content: parseJson(r.content_json, {}),
    } as SectionDoc);
  }

  const categories: Category[] = catsR.results.map((r) => ({ id: r.id, slug: r.slug, name: parseJson(r.name_json, { en: r.slug }), sort: r.sort }));
  const articles: ArticleLight[] = artsR.results.map(articleLight);
  const events: EventLight[] = evR.results.map((r) => ({
    id: r.id, slug: r.slug, dateLabel: r.date_label, year: r.year, era: r.era, title: r.title, summary: r.summary,
    image: r.image, imageAlt: r.image_alt, certainty: r.certainty, sort: r.sort, i18n: i18n(r), updatedAt: r.updated_at,
  }));
  const figures: FigureLight[] = figR.results.map((r) => ({
    id: r.id, slug: r.slug, name: r.name, roleTitle: r.role_title, datesLabel: r.dates_label, portrait: r.portrait,
    portraitAlt: r.portrait_alt, summary: r.summary, sort: r.sort, i18n: i18n(r), updatedAt: r.updated_at,
  }));
  const archives: ArchiveLight[] = arcR.results.map((r) => ({
    id: r.id, slug: r.slug, title: r.title, kind: r.kind, category: r.category, dateLabel: r.date_label, description: r.description,
    image: r.image, imageAlt: r.image_alt, fileUrl: r.file_url, externalUrl: r.external_url, downloadable: !!r.downloadable,
    license: r.license, source: r.source, sort: r.sort, i18n: i18n(r), updatedAt: r.updated_at,
  }));
  const leadership: LeaderLight[] = leadR.results.map((r) => ({
    id: r.id, slug: r.slug, name: r.name, position: r.position, photo: r.photo, photoAlt: r.photo_alt, summary: r.summary,
    sort: r.sort, i18n: i18n(r), updatedAt: r.updated_at,
  }));
  const principles: PrincipleLight[] = prinR.results.map((r) => ({
    id: r.id, slug: r.slug, title: r.title, summary: r.summary, image: r.image, imageAlt: r.image_alt, sort: r.sort, i18n: i18n(r), updatedAt: r.updated_at,
  }));
  const symbols: SymbolLight[] = symR.results.map((r) => ({
    id: r.id, slug: r.slug, name: r.name, image: r.image, imageAlt: r.image_alt, origin: r.origin, summary: r.summary,
    sort: r.sort, i18n: i18n(r), updatedAt: r.updated_at,
  }));
  const faqs: Faq[] = faqR.results.map((r) => ({
    id: r.id, slug: r.slug, question: r.question, answer: r.answer, category: r.category, sort: r.sort, i18n: i18n(r),
  }));
  const media: Record<string, MediaLight> = {};
  for (const r of mediaR.results) {
    media[r.url] = {
      url: r.url, kind: r.kind, mime: r.mime, width: r.width, height: r.height,
      variants: parseJson(r.variants_json, []).map((v: any) => ({ w: v.w, url: v.url, mime: v.mime })),
      alt: parseJson(r.alt_json, { en: '' }), credit: r.credit, license: r.license, sourceUrl: r.source_url,
    };
  }
  const applicationFields: AppField[] = fieldsR.results.map((r) => ({
    key: r.key, step: r.step, type: r.type, label: parseJson(r.label_json, { en: r.key }), help: parseJson(r.help_json, { en: '' }),
    options: parseJson(r.options_json, []), required: !!r.required, core: !!r.core, maxLength: r.max_length, sort: r.sort,
  }));

  return { settings, translations, nav, pages, categories, articles, events, figures, archives, leadership, principles, symbols, faqs, media, applicationFields };
}

function articleLight(r: Row): ArticleLight {
  return {
    id: r.id, slug: r.slug, locale: r.locale, title: r.title, excerpt: r.excerpt, coverImage: r.cover_image, coverAlt: r.cover_alt,
    categoryId: r.category_id ?? null, tags: String(r.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean),
    authorName: r.author_name, status: r.status, publishAt: r.publish_at ?? null, featured: !!r.featured,
    isAnnouncement: !!r.is_announcement, metaTitle: r.meta_title, metaDescription: r.meta_description,
    publishedAt: r.published_at ?? null, updatedAt: r.updated_at,
  };
}

const DETAIL_SQL: Record<RecordKind, string> = {
  article: "SELECT body FROM articles WHERE slug = ? AND status IN ('published','scheduled')",
  event: "SELECT body, sources, i18n_json FROM historical_events WHERE slug = ? AND status = 'published'",
  figure: "SELECT background, body, sources, i18n_json FROM historical_figures WHERE slug = ? AND status = 'published'",
  archive: "SELECT body, i18n_json FROM historical_archives WHERE slug = ? AND status = 'published'",
  leader: "SELECT body, responsibilities, credentials, i18n_json FROM leadership_profiles WHERE slug = ? AND status = 'published'",
  principle: "SELECT body, i18n_json FROM principles WHERE slug = ? AND status = 'published'",
  symbol: "SELECT body, sources, i18n_json FROM symbols WHERE slug = ? AND status = 'published'",
};

/** One primary-key read: the long-text columns of a single published record. */
export async function loadRecordLongText(env: Env, kind: RecordKind, slug: string): Promise<Row | null> {
  const r = await env.DB.prepare(DETAIL_SQL[kind]).bind(slug).first<Row>();
  if (!r) return null;
  if (r.i18n_json !== undefined) {
    r.i18n = parseJson(r.i18n_json, {});
    delete r.i18n_json;
  }
  return r;
}

/** Light copy of a scheduled article list — used by the scheduler cron when no snapshot exists. */
export async function loadScheduledArticles(env: Env): Promise<{ id: number; slug: string; title: string; publishAt: number }[]> {
  const r = await env.DB.prepare("SELECT id, slug, title, publish_at FROM articles WHERE status = 'scheduled' AND publish_at IS NOT NULL").all<Row>();
  return r.results.map((x) => ({ id: x.id, slug: x.slug, title: x.title, publishAt: x.publish_at }));
}
