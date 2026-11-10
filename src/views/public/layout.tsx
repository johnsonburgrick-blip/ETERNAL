import type { Child } from 'hono/jsx';
import { LOCALE_NAMES, localePath, pick, type Locale } from '../../i18n';
import { absoluteUrl, safeHref } from '../../lib/util';
import type { NavItem } from '../../snapshot/model';
import type { RenderCtx } from './context';
import { Emblem } from './components';

export const ASSET_VERSION = '20261110b';

export interface HeadMeta {
  title: string;
  description?: string;
  image?: string;
  type?: 'website' | 'article';
  noindex?: boolean;
  jsonLd?: Record<string, any>[];
  publishedTime?: number | null;
}

function NavLinks({ rc, items, all }: { rc: RenderCtx; items: NavItem[]; all: NavItem[] }) {
  return (
    <ul class="nav-list">
      {items.map((item) => {
        const children = all.filter((c) => c.parentId === item.id);
        const href = rc.lp(safeHref(item.href) || '/');
        const active = rc.path === item.href || (item.href !== '/' && rc.path.startsWith(item.href + '/'));
        if (!children.length)
          return (
            <li><a href={href} aria-current={active ? 'page' : undefined}>{pick(item.label, rc.locale)}</a></li>
          );
        return (
          <li class="has-sub">
            <a href={href} aria-current={active ? 'page' : undefined}>{pick(item.label, rc.locale)}</a>
            <button class="sub-toggle" type="button" aria-expanded="false" aria-label={`${pick(item.label, rc.locale)} submenu`}><span aria-hidden="true">▾</span></button>
            <ul class="sub">
              {children.map((ch) => (
                <li><a href={rc.lp(safeHref(ch.href) || '/')} aria-current={rc.path === ch.href ? 'page' : undefined}>{pick(ch.label, rc.locale)}</a></li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

export function Layout({ rc, meta, children }: { rc: RenderCtx; meta: HeadMeta; children: Child }) {
  const { data, locale, t } = rc;
  const s = data.settings;
  const base = rc.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const enabled = s.enabledLocales.filter(Boolean) as Locale[];
  const canonical = base + localePath(rc.path, locale);
  const title = meta.title ? `${meta.title} — ${s.siteName}` : `${s.siteName} — ${pick(s.tagline, locale)}`;
  const description = meta.description || pick(s.description, locale) || '';
  const ogImage = absoluteUrl(base, meta.image || s.defaultOgImage);
  const header = data.nav.filter((n) => n.location === 'header');
  const topLevel = header.filter((n) => !n.parentId && !n.isButton);
  const cta = header.find((n) => n.isButton);
  const footer = data.nav.filter((n) => n.location === 'footer' && !n.parentId);
  const legal = data.nav.filter((n) => n.location === 'legal');
  const logoIsDefault = !s.logoUrl || s.logoUrl === '/assets/logo.svg';
  const ld = [
    { '@context': 'https://schema.org', '@type': 'Organization', name: s.siteName, url: base, logo: absoluteUrl(base, s.emailLogoUrl || '/assets/logo-email.png'), email: s.contactEmail || undefined },
    ...(meta.jsonLd ?? []),
  ];

  return (
    <html lang={locale} class="no-js">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{title}</title>
        <meta name="description" content={description} />
        {meta.noindex || rc.preview ? <meta name="robots" content="noindex, nofollow" /> : null}
        <link rel="canonical" href={canonical} />
        {enabled.length > 1 && !meta.noindex
          ? [
              ...enabled.map((l) => <link rel="alternate" hreflang={l} href={base + localePath(rc.path, l)} />),
              <link rel="alternate" hreflang="x-default" href={base + rc.path} />,
            ]
          : null}
        <meta property="og:site_name" content={s.siteName} />
        <meta property="og:title" content={meta.title || s.siteName} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content={meta.type ?? 'website'} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:locale" content={locale === 'fr' ? 'fr_FR' : locale === 'es' ? 'es_ES' : 'en_GB'} />
        {meta.publishedTime ? <meta property="article:published_time" content={new Date(meta.publishedTime).toISOString()} /> : null}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="theme-color" content="#101010" />
        <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600&display=swap" />
        <link rel="stylesheet" href={`/assets/site.css?v=${ASSET_VERSION}`} />
        <script src={`/assets/site.js?v=${ASSET_VERSION}`} defer></script>
        {rc.env.TURNSTILE_SITE_KEY && Object.keys(rc.timers).length ? (
          <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
        ) : null}
        {ld.map((o) => <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(o).replace(/</g, '\\u003c') }} />)}
      </head>
      <body>
        <a class="skip-link" href="#main">{t('site.skip')}</a>
        {rc.preview ? <div class="preview-banner">Preview — unpublished draft</div> : null}
        <header class="site-header" data-header>
          <div class="container header-inner">
            <a class="brand" href={rc.lp('/')} aria-label={s.siteName}>
              {logoIsDefault ? <Emblem size={42} /> : <img src={s.logoUrl} alt="" width="42" height="42" />}
              <span class="brand-text">
                <span class="brand-name">{s.siteName}</span>
                <span class="brand-tag">{pick(s.tagline, locale)}</span>
              </span>
            </a>
            <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" data-nav-toggle>
              <span class="bars" aria-hidden="true"><span /><span /><span /></span>
              <span class="sr-only" data-label-open={t('nav.menu')} data-label-close={t('nav.close')}>{t('nav.menu')}</span>
            </button>
            <nav id="site-nav" class="site-nav" aria-label="Main">
              <NavLinks rc={rc} items={topLevel} all={header} />
              <div class="nav-extra">
                <a class="nav-search" href={rc.lp('/search')} aria-label={t('nav.search')}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                  <span class="nav-search-label">{t('nav.search')}</span>
                </a>
                {enabled.length > 1 ? (
                  <div class="lang" role="group" aria-label={t('nav.language')}>
                    {enabled.map((l) => (
                      <a href={localePath(rc.path, l)} hreflang={l} lang={l} aria-current={l === locale ? 'true' : undefined} title={LOCALE_NAMES[l]}>
                        {l.toUpperCase()}
                      </a>
                    ))}
                  </div>
                ) : null}
                {cta ? <a class="btn btn-gold btn-sm" href={rc.lp(safeHref(cta.href))}>{pick(cta.label, locale)}</a> : null}
              </div>
            </nav>
          </div>
        </header>
        <main id="main" tabindex={-1}>
          {rc.notTranslated ? <p class="lang-notice container">{t('common.notTranslated')}</p> : null}
          {children}
        </main>
        <footer class="site-footer">
          <div class="container footer-grid">
            <div class="footer-brand">
              <a class="brand" href={rc.lp('/')}>
                {logoIsDefault ? <Emblem size={52} /> : <img src={s.logoUrl} alt="" width="52" height="52" />}
                <span class="brand-text"><span class="brand-name">{s.siteName}</span><span class="brand-tag">{pick(s.tagline, locale)}</span></span>
              </a>
              <p class="footer-note">{pick(s.footerNote, locale) || t('footer.independent')}</p>
            </div>
            <nav class="footer-col" aria-label="Footer">
              <ul>{footer.map((n) => <li><a href={rc.lp(safeHref(n.href))}>{pick(n.label, locale)}</a></li>)}</ul>
            </nav>
            <nav class="footer-col" aria-label={t('footer.legal')}>
              <p class="footer-title">{t('footer.legal')}</p>
              <ul>{legal.map((n) => <li><a href={rc.lp(safeHref(n.href))}>{pick(n.label, locale)}</a></li>)}</ul>
            </nav>
            <div class="footer-col">
              <p class="footer-title">{t('footer.contact')}</p>
              {s.contactEmail ? <p><a href={`mailto:${s.contactEmail}`}>{s.contactEmail}</a></p> : null}
              {pick(s.contactAddress, locale) ? <p class="address">{pick(s.contactAddress, locale)}</p> : null}
              {s.socials.length ? (
                <ul class="socials">{s.socials.filter((x) => safeHref(x.url)).map((x) => <li><a href={safeHref(x.url)} rel="noopener me" target="_blank">{x.label}</a></li>)}</ul>
              ) : null}
            </div>
          </div>
          <div class="container footer-bottom">
            <p>© {new Date().getUTCFullYear()} {s.siteName}. {t('footer.rights')}</p>
          </div>
        </footer>
        {s.analyticsToken && !rc.preview ? (
          <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon={JSON.stringify({ token: s.analyticsToken })}></script>
        ) : null}
      </body>
    </html>
  );
}
