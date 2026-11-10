import { localizeRecord, pick } from '../../i18n';
import { stripMarkdown } from '../../lib/markdown';
import { absoluteUrl, formatDate, safeHref } from '../../lib/util';
import type { PageEntry, RecordKind } from '../../snapshot/model';
import { articleDate } from '../../snapshot/read';
import type { RenderCtx } from './context';
import { Breadcrumbs, Img, Md } from './components';
import { Layout } from './layout';
import { RenderSections, resolveContent } from './sections';

export function CmsPage({ rc, page }: { rc: RenderCtx; page: PageEntry }) {
  const meta = page.meta;
  const first = page.sections.find((s) => s.visible !== false);
  const firstImage = first ? resolveContent(first, rc.locale).image : undefined;
  const isHome = page.slug === 'home';
  return (
    <Layout
      rc={rc}
      meta={{
        title: isHome ? '' : pick(meta.title, rc.locale) ?? page.name,
        description: pick(meta.description, rc.locale),
        image: meta.ogImage || firstImage,
        jsonLd: isHome ? [{ '@context': 'https://schema.org', '@type': 'WebSite', name: rc.data.settings.siteName, url: rc.env.PUBLIC_BASE_URL, inLanguage: rc.data.settings.enabledLocales }] : undefined,
      }}
    >
      <RenderSections rc={rc} sections={page.sections} />
    </Layout>
  );
}

const KIND_INFO: Record<RecordKind, { list: string; label: (rc: RenderCtx) => string }> = {
  article: { list: '/publications', label: (rc) => pageTitle(rc, 'publications', 'Publications') },
  event: { list: '/timeline', label: (rc) => pageTitle(rc, 'timeline', 'Timeline') },
  figure: { list: '/figures', label: (rc) => pageTitle(rc, 'figures', 'Historical Figures') },
  archive: { list: '/archive', label: (rc) => pageTitle(rc, 'archive', 'Archive') },
  leader: { list: '/leadership', label: (rc) => pageTitle(rc, 'leadership', 'Leadership') },
  principle: { list: '/principles', label: (rc) => pageTitle(rc, 'principles', 'Principles') },
  symbol: { list: '/symbols', label: (rc) => pageTitle(rc, 'symbols', 'Symbols') },
};

function pageTitle(rc: RenderCtx, slug: string, fallback: string) {
  const p = rc.data.pages[slug];
  return (p && pick(p.meta.title, rc.locale)) || fallback;
}

function breadcrumbLd(rc: RenderCtx, items: { label: string; href: string }[]) {
  const base = rc.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.label, item: base + rc.lp(it.href) })),
  };
}

function Sources({ rc, src }: { rc: RenderCtx; src?: string }) {
  if (!src || !src.trim()) return null;
  return (
    <aside class="sources">
      <h2>{rc.t('common.sources')}</h2>
      <Md src={src} />
    </aside>
  );
}

/** Generic detail page for every collection. `long` holds the long-text columns (one DB read). */
export function DetailPage({ rc, kind, light, long, listPath }: { rc: RenderCtx; kind: RecordKind; light: any; long: Record<string, any> | null; listPath?: string }) {
  const { t, locale } = rc;
  const merged = localizeRecord({ ...light, ...(long ?? {}), i18n: { ...(light.i18n ?? {}), ...(long?.i18n ?? {}) } }, locale);
  const info = KIND_INFO[kind];
  const list = listPath ?? info.list;
  const listLabel = list === '/announcements' ? pageTitle(rc, 'announcements', 'Announcements') : info.label(rc);
  const title: string = merged.title ?? merged.name;
  const crumbs = [{ label: pageTitle(rc, 'home', 'Home'), href: '/' }, { label: listLabel, href: list }, { label: title, href: `${list}/${merged.slug}` }];

  let image = '', imageAlt = '', eyebrow = '', subtitle = '', description = '';
  let body: string | undefined = merged.body;
  const extra: any[] = [];
  let jsonLd: any[] = [breadcrumbLd(rc, crumbs)];
  let published: number | null = null;

  switch (kind) {
    case 'article': {
      const cat = rc.data.categories.find((c) => c.id === merged.categoryId);
      image = merged.coverImage; imageAlt = merged.coverAlt; eyebrow = cat ? pick(cat.name, locale) ?? '' : '';
      published = articleDate(merged);
      subtitle = [formatDate(published, locale), merged.authorName ? t('articles.by', { name: merged.authorName }) : ''].filter(Boolean).join(' · ');
      description = merged.metaDescription || merged.excerpt;
      if (!long) body = merged.excerpt;
      if (merged.tags?.length)
        extra.push(<p class="tags">{merged.tags.map((tg: string) => <a class="chip" rel="nofollow" href={`${rc.lp(list)}?tag=${encodeURIComponent(tg)}`}>#{tg}</a>)}</p>);
      const base = rc.env.PUBLIC_BASE_URL.replace(/\/$/, '');
      jsonLd.push({
        '@context': 'https://schema.org', '@type': merged.isAnnouncement ? 'NewsArticle' : 'Article', headline: title, description,
        datePublished: published ? new Date(published).toISOString() : undefined, dateModified: new Date(merged.updatedAt).toISOString(),
        image: image ? absoluteUrl(base, image) : undefined, author: merged.authorName ? { '@type': 'Person', name: merged.authorName } : { '@type': 'Organization', name: rc.data.settings.siteName },
        publisher: { '@type': 'Organization', name: rc.data.settings.siteName, logo: { '@type': 'ImageObject', url: absoluteUrl(base, rc.data.settings.emailLogoUrl) } },
        mainEntityOfPage: base + rc.lp(`${list}/${merged.slug}`), inLanguage: merged.locale,
      });
      break;
    }
    case 'event':
      image = merged.image; imageAlt = merged.imageAlt; eyebrow = merged.dateLabel; description = merged.summary;
      if (merged.certainty !== 'documented') extra.push(<p class={`badge badge-${merged.certainty}`}>{t(`certainty.${merged.certainty}`)}</p>);
      if (!long) body = merged.summary;
      break;
    case 'figure':
      image = merged.portrait; imageAlt = merged.portraitAlt || merged.name; eyebrow = merged.datesLabel; subtitle = merged.roleTitle; description = merged.summary;
      if (merged.background) extra.push(<div class="lead-in"><Md src={merged.background} /></div>);
      if (!long) body = merged.summary;
      jsonLd.push({ '@context': 'https://schema.org', '@type': 'Person', name: merged.name, description: merged.summary });
      break;
    case 'archive':
      image = merged.image; imageAlt = merged.imageAlt; eyebrow = [t(`archive.kind.${merged.kind}`), merged.dateLabel].filter(Boolean).join(' · ');
      description = merged.description;
      if (!long) body = merged.description;
      extra.push(
        <div class="archive-meta">
          {merged.source ? <p><strong>Source:</strong> {merged.source}</p> : null}
          {merged.license ? <p><strong>{t('common.license')}:</strong> {merged.license}</p> : null}
          <div class="buttons">
            {merged.downloadable && merged.fileUrl ? <a class="btn btn-gold" href={safeHref(merged.fileUrl)} download>{t('common.download')}</a> : null}
            {merged.externalUrl ? <a class="btn btn-ghost" href={safeHref(merged.externalUrl)} rel="noopener" target="_blank">{t('common.externalSource')} ↗</a> : null}
          </div>
        </div>,
      );
      break;
    case 'leader':
      image = merged.photo; imageAlt = merged.photoAlt || merged.name; subtitle = merged.position; description = merged.summary;
      if (!long) body = merged.summary;
      break;
    case 'principle':
      image = merged.image; imageAlt = merged.imageAlt; description = merged.summary;
      if (!long) body = merged.summary;
      break;
    case 'symbol':
      image = merged.image; imageAlt = merged.imageAlt || merged.name; eyebrow = merged.origin; description = merged.summary;
      if (merged.summary) extra.push(<p class="lede">{merged.summary}</p>);
      if (!long) body = '';
      break;
  }

  return (
    <Layout rc={rc} meta={{ title, description: stripMarkdown(description).slice(0, 300), image, type: kind === 'article' ? 'article' : 'website', jsonLd, publishedTime: published }}>
      <article class={`detail detail-${kind}`}>
        <header class="detail-head bg-obsidian">
          <div class="container narrow">
            <Breadcrumbs rc={rc} items={crumbs} />
            {eyebrow ? <p class="eyebrow">{eyebrow}</p> : null}
            <h1>{title}</h1>
            {subtitle ? <p class="detail-sub">{subtitle}</p> : null}
            <span class="rule" aria-hidden="true" />
          </div>
        </header>
        <div class="section bg-obsidian pad-compact">
          <div class={`container ${image ? 'detail-grid' : 'narrow'}`}>
            {image ? (
              <div class={`detail-media${kind === 'figure' || kind === 'leader' ? ' portrait' : ''}`}>
                <Img rc={rc} src={image} alt={imageAlt} eager sizes="(min-width: 960px) 40vw, 100vw" credit />
              </div>
            ) : null}
            <div class="detail-body">
              {extra}
              <Md src={body} />
              {kind === 'leader' && merged.responsibilities ? <><h2>Responsibilities</h2><Md src={merged.responsibilities} /></> : null}
              {kind === 'leader' && merged.credentials ? <><h2>Credentials</h2><Md src={merged.credentials} /></> : null}
              <Sources rc={rc} src={merged.sources} />
              <p class="back"><a href={rc.lp(list)}>← {listLabel}</a></p>
            </div>
          </div>
        </div>
      </article>
    </Layout>
  );
}

export function SearchPage({ rc, q, results }: { rc: RenderCtx; q: string; results: { title: string; href: string; snippet: string; kind: string }[] }) {
  const { t } = rc;
  return (
    <Layout rc={rc} meta={{ title: t('search.title'), noindex: true }}>
      <section class="page-hero bg-obsidian compact">
        <div class="container narrow">
          <h1>{t('search.title')}</h1>
          <form class="search-form" method="get" action={rc.lp('/search')} role="search">
            <label class="sr-only" for="q">{t('search.title')}</label>
            <input id="q" type="search" name="q" value={q} placeholder={t('search.placeholder')} maxlength={100} />
            <button class="btn btn-gold" type="submit">{t('nav.search')}</button>
          </form>
        </div>
      </section>
      <section class="section bg-obsidian pad-compact">
        <div class="container narrow">
          {q ? <p class="meta" role="status">{results.length ? t('search.results', { n: results.length, q }) : t('search.none', { q })}</p> : null}
          <ul class="search-results">
            {results.map((r) => (
              <li><a href={r.href}><span class="eyebrow">{r.kind}</span><span class="sr-title">{r.title}</span><span class="sr-snippet">{r.snippet}</span></a></li>
            ))}
          </ul>
        </div>
      </section>
    </Layout>
  );
}

export function MessagePage({ rc, title, body, status = 200 }: { rc: RenderCtx; title: string; body: string; status?: number }) {
  return (
    <Layout rc={rc} meta={{ title, noindex: true }}>
      <section class="section bg-obsidian pad-spacious">
        <div class="container narrow center confirmation">
          <span class="status-code" aria-hidden="true">{status >= 400 ? status : '✦'}</span>
          <h1>{title}</h1>
          <span class="rule" aria-hidden="true" />
          <p class="lede">{body}</p>
          <p><a class="btn btn-ghost" href={rc.lp('/')}>{rc.t('common.home')}</a></p>
        </div>
      </section>
    </Layout>
  );
}
