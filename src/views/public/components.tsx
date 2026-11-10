import type { Child } from 'hono/jsx';
import { pick } from '../../i18n';
import { renderMarkdown } from '../../lib/markdown';
import { safeHref } from '../../lib/util';
import type { RenderCtx } from './context';

export function Emblem({ size = 44, title }: { size?: number; title?: string }) {
  return (
    <svg class="emblem" width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.4" role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'} aria-label={title}>
      <circle cx="32" cy="32" r="30" />
      <circle cx="32" cy="32" r="26.5" stroke-width=".7" />
      <path d="M32 11.5 52 45.5H12z" />
      <path d="M32 20.5 44.6 41.8H19.4z" stroke-width=".7" />
      <circle cx="32" cy="34.5" r="3.6" />
      <path d="M32 2v4M32 58v4M2 32h4M58 32h4M10.8 10.8l2.8 2.8M50.4 50.4l2.8 2.8M10.8 53.2l2.8-2.8M50.4 13.6l2.8-2.8" stroke-width=".9" />
    </svg>
  );
}

export function Md({ src, class: cls }: { src?: string; class?: string }) {
  if (!src) return null;
  return <div class={cls ?? 'prose'} dangerouslySetInnerHTML={{ __html: renderMarkdown(src) }} />;
}

export function Img(props: {
  rc: RenderCtx; src?: string; alt?: string; sizes?: string; eager?: boolean; class?: string; credit?: boolean;
}) {
  const { rc, src } = props;
  if (!src) return null;
  const m = rc.data.media[src];
  const alt = props.alt ?? (m ? pick(m.alt, rc.locale) : '') ?? '';
  const variants = m?.variants?.length ? [...m.variants].sort((a, b) => a.w - b.w) : [];
  const srcset = variants.length ? variants.map((v) => `${v.url} ${v.w}w`).join(', ') : undefined;
  const fallback = variants.length ? variants[Math.min(variants.length - 1, 1)].url : src;
  const img = (
    <img
      src={fallback}
      srcset={srcset}
      sizes={srcset ? props.sizes ?? '100vw' : undefined}
      alt={alt}
      width={m?.width ?? undefined}
      height={m?.height ?? undefined}
      loading={props.eager ? 'eager' : 'lazy'}
      decoding={props.eager ? 'sync' : 'async'}
      fetchpriority={props.eager ? 'high' : undefined}
      class={props.class}
    />
  );
  if (props.credit && m?.credit) {
    return (
      <figure class="credited">
        {img}
        <figcaption class="credit">
          {m.sourceUrl ? <a href={m.sourceUrl} rel="noopener" target="_blank">{m.credit}</a> : m.credit}
          {m.license ? ` · ${m.license}` : ''}
        </figcaption>
      </figure>
    );
  }
  return img;
}

export function Buttons({ rc, buttons }: { rc: RenderCtx; buttons?: { label?: string; href?: string; style?: string }[] }) {
  const list = (buttons ?? []).filter((b) => b && b.label && safeHref(b.href ?? ''));
  if (!list.length) return null;
  return (
    <div class="buttons">
      {list.slice(0, 3).map((b) => (
        <a class={`btn ${b.style === 'secondary' ? 'btn-ghost' : 'btn-gold'}`} href={rc.lp(safeHref(b.href!))}>
          {b.label}
        </a>
      ))}
    </div>
  );
}

export function SectionHead({ eyebrow, heading, intro, center }: { eyebrow?: string; heading?: string; intro?: string; center?: boolean }) {
  if (!eyebrow && !heading && !intro) return null;
  return (
    <header class={`section-head${center ? ' center' : ''}`}>
      {eyebrow ? <p class="eyebrow">{eyebrow}</p> : null}
      {heading ? <h2>{heading}</h2> : null}
      {heading ? <span class="rule" aria-hidden="true" /> : null}
      {intro ? <p class="lede">{intro}</p> : null}
    </header>
  );
}

export function Breadcrumbs({ rc, items }: { rc: RenderCtx; items: { label: string; href?: string }[] }) {
  return (
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((i, idx) =>
          i.href && idx < items.length - 1 ? (
            <li><a href={rc.lp(i.href)}>{i.label}</a></li>
          ) : (
            <li aria-current="page">{i.label}</li>
          ),
        )}
      </ol>
    </nav>
  );
}

export function PageHero({ rc, title, eyebrow, image, children }: { rc: RenderCtx; title: string; eyebrow?: string; image?: string; children?: Child }) {
  return (
    <section class="page-hero bg-obsidian">
      {image ? <div class="page-hero-media"><Img rc={rc} src={image} alt="" eager sizes="100vw" /></div> : null}
      <div class="container narrow">
        {eyebrow ? <p class="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {children}
      </div>
    </section>
  );
}
