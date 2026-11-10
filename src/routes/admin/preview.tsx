import { localePath, translator, type Locale } from '../../i18n';
import type { ArticleLight } from '../../snapshot/model';
import { loadSiteDataFromDb } from '../../snapshot/source';
import type { RenderCtx } from '../../views/public/context';
import { DetailPage } from '../../views/public/pages';
import type { C } from './common';

/** Renders an article (any status) with the public template for admin preview. */
export async function renderArticlePreview(c: C, row: any) {
  const data = await loadSiteDataFromDb(c.env);
  const locale = (['en', 'fr', 'es'].includes(row.locale) ? row.locale : 'en') as Locale;
  const light: ArticleLight = {
    id: row.id, slug: row.slug, locale: row.locale, title: row.title, excerpt: row.excerpt, coverImage: row.cover_image, coverAlt: row.cover_alt,
    categoryId: row.category_id, tags: String(row.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean), authorName: row.author_name,
    status: 'published', publishAt: row.publish_at, featured: !!row.featured, isAnnouncement: !!row.is_announcement, metaTitle: row.meta_title,
    metaDescription: row.meta_description, publishedAt: row.published_at ?? Date.now(), updatedAt: row.updated_at,
  };
  const rc: RenderCtx = {
    env: c.env, data, locale, url: new URL(c.req.url), path: `/publications/${row.slug}`, t: translator(locale, data.translations),
    lp: (p: string) => localePath(p, locale), timers: {}, submissionToken: 'preview', preview: true,
  };
  c.header('cache-control', 'no-store');
  return c.html(<DetailPage rc={rc} kind="article" light={light} long={{ body: row.body }} listPath={row.is_announcement ? '/announcements' : '/publications'} />);
}
