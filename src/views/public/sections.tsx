import type { Child } from 'hono/jsx';
import { localizeRecord, pick } from '../../i18n';
import { safeHref, formatDate } from '../../lib/util';
import type { SectionDoc } from '../../snapshot/model';
import { articleDate, liveArticles } from '../../snapshot/read';
import type { RenderCtx } from './context';
import { Buttons, Img, Md, SectionHead } from './components';
import { ApplicationForm, ApplicantForms, ContactForm } from './forms';

/** Merge shared + English + current-locale content (non-empty locale values win). */
export function resolveContent(s: Pick<SectionDoc, 'content'>, locale: string): Record<string, any> {
  const out: Record<string, any> = { ...(s.content.shared ?? {}), ...(s.content.en ?? {}) };
  const loc = locale !== 'en' ? s.content[locale] : undefined;
  if (loc) {
    for (const [k, v] of Object.entries(loc)) {
      if (Array.isArray(v) ? v.length : typeof v === 'string' ? v.trim() : v != null) out[k] = v;
    }
  }
  return out;
}

function Shell({ s, children, extraClass }: { s: SectionDoc; children: Child; extraClass?: string }) {
  const st = s.settings ?? {};
  const bg = st.background ?? 'obsidian';
  const img = bg === 'image' && st.bgImage ? safeHref(st.bgImage) : '';
  return (
    <section
      class={`section sec-${s.type} bg-${bg} pad-${st.spacing ?? 'normal'} align-${st.align ?? 'left'} overlay-${st.overlay ?? 'medium'}${extraClass ? ' ' + extraClass : ''}`}
      id={st.anchor || undefined}
      style={img ? `--bg-image:url("${encodeURI(img)}")` : undefined}
      data-reveal
    >
      {children}
    </section>
  );
}

const n = (v: any, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const take = <T,>(list: T[], count: any) => (n(count) > 0 ? list.slice(0, n(count)) : list);

export function RenderSection({ rc, s, first }: { rc: RenderCtx; s: SectionDoc; first?: boolean }) {
  const c = resolveContent(s, rc.locale);
  const { t, lp, data, locale } = rc;

  switch (s.type) {
    case 'hero': {
      const Tag = first ? 'h1' : 'h2';
      return (
        <section class={`hero hero-${c.height ?? 'large'} align-${s.settings?.align ?? 'left'}`} id={s.settings?.anchor || undefined}>
          <div class="hero-media">
            <Img rc={rc} src={c.image} alt="" eager={first} sizes="100vw" />
            {c.video ? <video class="hero-video" data-src={safeHref(c.video)} muted loop playsinline preload="none" aria-hidden="true" /> : null}
          </div>
          <div class="hero-shade" aria-hidden="true" />
          <div class="container hero-inner">
            {c.eyebrow ? <p class="eyebrow">{c.eyebrow}</p> : null}
            <Tag class="hero-title">{c.heading}</Tag>
            {c.subheading ? <p class="hero-sub">{c.subheading}</p> : null}
            {c.body ? <p class="hero-body">{c.body}</p> : null}
            <Buttons rc={rc} buttons={c.buttons} />
          </div>
          {c.height === 'full' ? <span class="scroll-cue" aria-hidden="true" /> : null}
        </section>
      );
    }

    case 'text': {
      const pos = c.image ? c.imagePosition ?? 'right' : 'none';
      return (
        <Shell s={s}>
          <div class={`container text-block img-${pos}`}>
            <div class="text-col">
              {c.eyebrow ? <p class="eyebrow">{c.eyebrow}</p> : null}
              {c.heading ? (first ? <h1>{c.heading}</h1> : <h2>{c.heading}</h2>) : null}
              {c.heading ? <span class="rule" aria-hidden="true" /> : null}
              <Md src={c.body} />
              <Buttons rc={rc} buttons={c.buttons} />
            </div>
            {c.image ? (
              <figure class="media-col">
                <Img rc={rc} src={c.image} sizes="(min-width: 960px) 40vw, 100vw" credit={!c.caption} />
                {c.caption ? <figcaption>{c.caption}</figcaption> : null}
              </figure>
            ) : null}
          </div>
        </Shell>
      );
    }

    case 'cards': {
      const items: any[] = Array.isArray(c.items) ? c.items : [];
      return (
        <Shell s={s}>
          <div class="container">
            <SectionHead eyebrow={c.eyebrow} heading={c.heading} intro={c.intro} center={s.settings?.align === 'center'} />
            <div class={`grid cols-${c.columns ?? '3'}`}>
              {items.map((it) => {
                const href = safeHref(it.href ?? '');
                const inner = (
                  <>
                    {it.image ? <div class="card-media"><Img rc={rc} src={it.image} sizes="(min-width: 960px) 33vw, 100vw" /></div> : null}
                    <div class="card-body">
                      {it.title ? <h3>{it.title}</h3> : null}
                      {it.text ? <p>{it.text}</p> : null}
                    </div>
                  </>
                );
                return href ? <a class="card card-link" href={lp(href)}>{inner}</a> : <div class="card">{inner}</div>;
              })}
            </div>
            <Buttons rc={rc} buttons={c.buttons} />
          </div>
        </Shell>
      );
    }

    case 'quote':
      return (
        <Shell s={s}>
          <div class="container narrow quote-block">
            {c.image ? <div class="quote-portrait"><Img rc={rc} src={c.image} sizes="160px" /></div> : null}
            <blockquote>
              <p>{c.quote}</p>
              {c.attribution ? <footer>— {c.attribution}</footer> : null}
            </blockquote>
          </div>
        </Shell>
      );

    case 'cta':
      return (
        <Shell s={s} extraClass="cta">
          <div class="container narrow center">
            {c.eyebrow ? <p class="eyebrow">{c.eyebrow}</p> : null}
            {c.heading ? <h2>{c.heading}</h2> : null}
            <span class="rule" aria-hidden="true" />
            {c.body ? <p class="lede">{c.body}</p> : null}
            <Buttons rc={rc} buttons={c.buttons} />
          </div>
        </Shell>
      );

    case 'notice':
      return (
        <Shell s={s}>
          <div class="container narrow">
            <aside class={`notice tone-${c.tone ?? 'info'}`}>
              {c.heading ? <h2 class="notice-title">{c.heading}</h2> : null}
              <Md src={c.body} />
            </aside>
          </div>
        </Shell>
      );

    case 'gallery': {
      const items: any[] = Array.isArray(c.items) ? c.items : [];
      return (
        <Shell s={s}>
          <div class="container">
            <SectionHead eyebrow={c.eyebrow} heading={c.heading} />
            <div class="gallery">
              {items.filter((i) => i.image).map((i) => (
                <figure>
                  <Img rc={rc} src={i.image} sizes="(min-width: 960px) 33vw, 50vw" alt={i.caption ?? ''} />
                  {i.caption ? <figcaption>{i.caption}</figcaption> : null}
                </figure>
              ))}
            </div>
          </div>
        </Shell>
      );
    }

    case 'timeline_preview': {
      const events = take(data.events, c.count || 5).map((e) => localizeRecord(e, locale));
      return (
        <Shell s={s}>
          <div class="container">
            <SectionHead eyebrow={c.eyebrow} heading={c.heading} intro={c.intro} />
            <ol class="timeline-mini">
              {events.map((e) => (
                <li>
                  <a href={lp(`/timeline/${e.slug}`)}>
                    <span class="tl-date">{e.dateLabel}</span>
                    <span class="tl-title">{e.title}</span>
                    <span class="tl-summary">{e.summary}</span>
                  </a>
                </li>
              ))}
            </ol>
            <Buttons rc={rc} buttons={c.buttons} />
          </div>
        </Shell>
      );
    }

    case 'timeline_full': {
      const events = data.events.map((e) => localizeRecord(e, locale));
      const eras = [...new Set(events.map((e) => e.era).filter(Boolean))];
      return (
        <Shell s={s}>
          <div class="container">
            <SectionHead eyebrow={c.eyebrow} heading={c.heading} intro={c.intro} />
            {eras.length > 1 ? (
              <div class="chips" role="group" aria-label={t('timeline.filter')} data-filter-group="timeline">
                <button type="button" class="chip" aria-pressed="true" data-filter="">{t('common.all')}</button>
                {eras.map((era) => <button type="button" class="chip" aria-pressed="false" data-filter={era}>{era}</button>)}
              </div>
            ) : null}
            {events.length ? (
              <ol class="timeline" data-filter-list="timeline">
                {events.map((e) => (
                  <li class="tl-item" data-filter-value={e.era}>
                    <div class="tl-marker" aria-hidden="true" />
                    <article class="tl-card">
                      <p class="tl-date">{e.dateLabel}</p>
                      <h3><a href={lp(`/timeline/${e.slug}`)}>{e.title}</a></h3>
                      {e.certainty !== 'documented' ? <p class={`badge badge-${e.certainty}`}>{t(`certainty.${e.certainty}`)}</p> : null}
                      {e.image ? <div class="tl-media"><Img rc={rc} src={e.image} alt={e.imageAlt} sizes="(min-width: 960px) 30vw, 90vw" /></div> : null}
                      <p>{e.summary}</p>
                      <a class="more" href={lp(`/timeline/${e.slug}`)}>{t('common.readMore')} <span aria-hidden="true">→</span></a>
                    </article>
                  </li>
                ))}
              </ol>
            ) : <p class="empty">{t('common.empty')}</p>}
          </div>
        </Shell>
      );
    }

    case 'figures_list': {
      const list = take(data.figures, c.count).map((f) => localizeRecord(f, locale));
      return (
        <Shell s={s}>
          <div class="container">
            <SectionHead eyebrow={c.eyebrow} heading={c.heading} intro={c.intro} />
            <div class="grid cols-3 portraits">
              {list.map((f) => (
                <a class="card card-link portrait-card" href={lp(`/figures/${f.slug}`)}>
                  <div class="card-media portrait"><Img rc={rc} src={f.portrait} alt={f.portraitAlt || f.name} sizes="(min-width: 960px) 30vw, 90vw" /></div>
                  <div class="card-body">
                    <p class="meta">{f.datesLabel}</p>
                    <h3>{f.name}</h3>
                    <p class="role">{f.roleTitle}</p>
                    <p>{f.summary}</p>
                  </div>
                </a>
              ))}
            </div>
            {!list.length ? <p class="empty">{t('common.empty')}</p> : null}
            <Buttons rc={rc} buttons={c.buttons} />
          </div>
        </Shell>
      );
    }

    case 'principles_list': {
      const list = take(data.principles, c.count).map((p) => localizeRecord(p, locale));
      return (
        <Shell s={s}>
          <div class="container">
            <SectionHead eyebrow={c.eyebrow} heading={c.heading} intro={c.intro} />
            <ol class="principles">
              {list.map((p, i) => (
                <li>
                  <a href={lp(`/principles/${p.slug}`)} class="principle">
                    <span class="numeral" aria-hidden="true">{['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][i] ?? i + 1}</span>
                    <h3>{p.title}</h3>
                    <p>{p.summary}</p>
                  </a>
                </li>
              ))}
            </ol>
            <Buttons rc={rc} buttons={c.buttons} />
          </div>
        </Shell>
      );
    }

    case 'symbols_list': {
      const list = take(data.symbols, c.count).map((x) => localizeRecord(x, locale));
      return (
        <Shell s={s}>
          <div class="container">
            <SectionHead eyebrow={c.eyebrow} heading={c.heading} intro={c.intro} />
            <div class="grid cols-2 symbols">
              {list.map((x) => (
                <a class="card card-link symbol-card" href={lp(`/symbols/${x.slug}`)}>
                  {x.image ? <div class="card-media"><Img rc={rc} src={x.image} alt={x.imageAlt || x.name} sizes="(min-width: 960px) 45vw, 90vw" /></div> : null}
                  <div class="card-body">
                    <h3>{x.name}</h3>
                    {x.origin ? <p class="meta">{x.origin}</p> : null}
                    <p>{x.summary}</p>
                  </div>
                </a>
              ))}
            </div>
            <Buttons rc={rc} buttons={c.buttons} />
          </div>
        </Shell>
      );
    }

    case 'leadership_list': {
      const list = data.leadership.map((x) => localizeRecord(x, locale));
      return (
        <Shell s={s}>
          <div class="container">
            <SectionHead eyebrow={c.eyebrow} heading={c.heading} intro={c.intro} />
            {list.length ? (
              <div class="grid cols-3 portraits">
                {list.map((p) => (
                  <a class="card card-link portrait-card" href={lp(`/leadership/${p.slug}`)}>
                    <div class="card-media portrait"><Img rc={rc} src={p.photo} alt={p.photoAlt || p.name} sizes="(min-width: 960px) 30vw, 90vw" /></div>
                    <div class="card-body"><h3>{p.name}</h3><p class="role">{p.position}</p><p>{p.summary}</p></div>
                  </a>
                ))}
              </div>
            ) : <p class="empty">{t('leadership.none')}</p>}
          </div>
        </Shell>
      );
    }

    case 'articles_list': {
      const mode = c.mode ?? 'articles';
      let list = liveArticles(data, { locale, announcements: mode === 'announcements' ? true : mode === 'articles' ? false : undefined });
      if (mode === 'featured') list = list.filter((a) => a.featured);
      const cat = c.filters ? rc.url.searchParams.get('category') ?? '' : '';
      const tag = c.filters ? rc.url.searchParams.get('tag') ?? '' : '';
      const catObj = data.categories.find((x) => x.slug === cat);
      if (catObj) list = list.filter((a) => a.categoryId === catObj.id);
      if (tag) list = list.filter((a) => a.tags.some((x) => x.toLowerCase() === tag.toLowerCase()));
      list = take(list, c.count);
      const base = mode === 'announcements' ? '/announcements' : '/publications';
      const usedCats = data.categories.filter((ct) => liveArticles(data, { locale }).some((a) => a.categoryId === ct.id));
      return (
        <Shell s={s}>
          <div class="container">
            <SectionHead eyebrow={c.eyebrow} heading={c.heading} intro={c.intro} />
            {c.filters && usedCats.length > 1 ? (
              <nav class="chips" aria-label={t('articles.category')}>
                <a class="chip" href={lp(rc.path)} aria-current={!cat && !tag ? 'true' : undefined}>{t('common.all')}</a>
                {usedCats.map((ct) => <a class="chip" href={`${lp(rc.path)}?category=${ct.slug}`} rel="nofollow" aria-current={cat === ct.slug ? 'true' : undefined}>{pick(ct.name, locale)}</a>)}
                {tag ? <span class="chip" aria-current="true">#{tag}</span> : null}
              </nav>
            ) : null}
            {list.length ? (
              <div class="grid cols-3 articles">
                {list.map((a, i) => {
                  const ct = data.categories.find((x) => x.id === a.categoryId);
                  return (
                    <a class={`card card-link article-card${a.featured && i === 0 && !cat ? ' featured' : ''}`} href={lp(`${a.isAnnouncement ? '/announcements' : base}/${a.slug}`)}>
                      {a.coverImage ? <div class="card-media"><Img rc={rc} src={a.coverImage} alt={a.coverAlt} sizes="(min-width: 960px) 33vw, 100vw" /></div> : null}
                      <div class="card-body">
                        <p class="meta">
                          {ct ? <span>{pick(ct.name, locale)}</span> : null}
                          <time datetime={new Date(articleDate(a)).toISOString()}>{formatDate(articleDate(a), locale)}</time>
                        </p>
                        <h3>{a.title}</h3>
                        <p>{a.excerpt}</p>
                      </div>
                    </a>
                  );
                })}
              </div>
            ) : <p class="empty">{t('articles.none')}</p>}
            <Buttons rc={rc} buttons={c.buttons} />
          </div>
        </Shell>
      );
    }

    case 'archive_list': {
      const list = data.archives.map((x) => localizeRecord(x, locale));
      const kinds = [...new Set(list.map((x) => x.kind))];
      return (
        <Shell s={s}>
          <div class="container">
            <SectionHead eyebrow={c.eyebrow} heading={c.heading} intro={c.intro} />
            {kinds.length > 1 ? (
              <div class="chips" role="group" aria-label={t('archive.filter')} data-filter-group="archive">
                <button type="button" class="chip" aria-pressed="true" data-filter="">{t('common.all')}</button>
                {kinds.map((k) => <button type="button" class="chip" aria-pressed="false" data-filter={k}>{t(`archive.kind.${k}`)}</button>)}
              </div>
            ) : null}
            <ul class="archive-list" data-filter-list="archive">
              {list.map((x) => (
                <li data-filter-value={x.kind}>
                  <a class="archive-item" href={lp(`/archive/${x.slug}`)}>
                    {x.image ? <div class="archive-thumb"><Img rc={rc} src={x.image} alt={x.imageAlt} sizes="120px" /></div> : <div class="archive-thumb placeholder" aria-hidden="true">❦</div>}
                    <div>
                      <p class="meta"><span>{t(`archive.kind.${x.kind}`)}</span>{x.dateLabel ? <span>{x.dateLabel}</span> : null}</p>
                      <h3>{x.title}</h3>
                      <p>{x.description}</p>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
            {!list.length ? <p class="empty">{t('common.empty')}</p> : null}
          </div>
        </Shell>
      );
    }

    case 'faq_list': {
      let list = data.faqs.map((f) => localizeRecord(f, locale));
      if (c.category) list = list.filter((f) => f.category === c.category);
      list = take(list, c.count);
      return (
        <Shell s={s}>
          <div class="container narrow">
            <SectionHead eyebrow={c.eyebrow} heading={c.heading} intro={c.intro} />
            <div class="faq">
              {list.map((f) => (
                <details id={`faq-${f.slug}`}>
                  <summary>{f.question}</summary>
                  <Md src={f.answer} />
                </details>
              ))}
            </div>
            <Buttons rc={rc} buttons={c.buttons} />
          </div>
        </Shell>
      );
    }

    case 'application_form':
      return <Shell s={s}><ApplicationForm rc={rc} heading={c.heading} intro={c.intro} /></Shell>;
    case 'contact_form':
      return <Shell s={s}><ContactForm rc={rc} kind="contact" eyebrow={c.eyebrow} heading={c.heading} intro={c.intro} /></Shell>;
    case 'report_form':
      return <Shell s={s}><ContactForm rc={rc} kind="report" heading={c.heading} intro={c.intro} /></Shell>;
    case 'applicant_forms':
      return <Shell s={s}><ApplicantForms rc={rc} heading={c.heading} intro={c.intro} /></Shell>;

    default:
      return null;
  }
}

export function RenderSections({ rc, sections }: { rc: RenderCtx; sections: SectionDoc[] }) {
  const visible = sections.filter((s) => s.visible !== false);
  return <>{visible.map((s, i) => <RenderSection rc={rc} s={s} first={i === 0} />)}</>;
}
