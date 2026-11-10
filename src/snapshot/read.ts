/**
 * Public read API. Answers from the snapshot when it is primed; otherwise falls back
 * to source.ts (the only DB reader). Public routes and views use only these functions.
 */
import type { Env } from '../env';
import { loadRecordLongText, loadSiteDataFromDb } from './source';
import type { ArticleLight, RecordKind, SiteData, Snapshot } from './model';

export interface ReadCtx {
  env: Env;
  ctx: ExecutionContext;
  snap: Snapshot | null;
  cache?: Promise<SiteData>;
}

export function siteData(rc: ReadCtx): Promise<SiteData> {
  if (rc.snap) return Promise.resolve(rc.snap);
  return (rc.cache ??= loadSiteDataFromDb(rc.env));
}

export function isLiveArticle(a: ArticleLight, t = Date.now()): boolean {
  if (a.status === 'published') return true;
  return a.status === 'scheduled' && !!a.publishAt && a.publishAt <= t;
}

export function liveArticles(data: SiteData, opts: { locale?: string; announcements?: boolean } = {}): ArticleLight[] {
  const t = Date.now();
  return data.articles
    .filter((a) => isLiveArticle(a, t))
    .filter((a) => (opts.announcements === undefined ? true : a.isAnnouncement === opts.announcements))
    .filter((a) => !opts.locale || a.locale === opts.locale || !data.articles.some((x) => x.locale === opts.locale))
    .sort((a, b) => articleDate(b) - articleDate(a));
}

export const articleDate = (a: ArticleLight) => a.publishAt ?? a.publishedAt ?? a.updatedAt;

type LightOf<K extends RecordKind> = K extends 'article' ? ArticleLight : any;

const COLLECTION: Record<RecordKind, keyof SiteData> = {
  article: 'articles', event: 'events', figure: 'figures', archive: 'archives', leader: 'leadership', principle: 'principles', symbol: 'symbols',
};

/**
 * Detail page data. Unknown slugs 404 straight from the snapshot (no DB read), so
 * crawlers probing random URLs cost nothing. Known slugs cost exactly one DB read for
 * the long text; if that read fails, the light snapshot row is rendered instead.
 */
export async function recordDetail<K extends RecordKind>(
  rc: ReadCtx,
  kind: K,
  slug: string,
): Promise<{ light: LightOf<K>; long: Record<string, any> | null; degraded: boolean } | null> {
  const data = await siteData(rc);
  const list = data[COLLECTION[kind]] as any[];
  const light = list.find((r) => r.slug === slug);
  if (!light) return null;
  if (kind === 'article' && !isLiveArticle(light)) return null;
  try {
    const long = await loadRecordLongText(rc.env, kind, slug);
    return { light, long, degraded: false };
  } catch (e) {
    console.error('detail: long-text read failed, serving snapshot row', kind, slug, String(e));
    return { light, long: null, degraded: true };
  }
}
