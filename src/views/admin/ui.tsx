import type { Child } from 'hono/jsx';
import type { AdminUser } from '../../env';
import { can, ROLE_LABELS, type Permission } from '../../lib/auth';
import { formatDateTime } from '../../lib/util';
import { Emblem } from '../public/components';
import { ASSET_VERSION } from '../public/layout';

export interface AdminPageProps {
  title: string;
  user?: AdminUser;
  active?: string;
  unread?: number;
  flash?: { ok?: string; error?: string };
  back?: { href: string; label: string };
  actions?: Child;
  wide?: boolean;
  children: Child;
}

interface NavDef { key: string; href: string; label: string; icon: string; perm?: Permission[]; bottom?: boolean }

const NAV: NavDef[] = [
  { key: 'dashboard', href: '/admin', label: 'Dashboard', icon: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10', bottom: true },
  { key: 'applications', href: '/admin/applications', label: 'Applications', icon: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6', perm: ['applications.review', 'applications.view_all'], bottom: true },
  { key: 'pages', href: '/admin/pages', label: 'Pages', icon: 'M4 5h16v14H4zM4 9h16M9 9v10', perm: ['content'], bottom: true },
  { key: 'articles', href: '/admin/content/articles', label: 'Publications', icon: 'M5 4h11l3 3v13H5zM8 9h8M8 13h8M8 17h5', perm: ['content'] },
  { key: 'collections', href: '/admin/content', label: 'History & content', icon: 'M4 6h16M4 12h16M4 18h10', perm: ['content'] },
  { key: 'media', href: '/admin/media', label: 'Media', icon: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15 9h.01', perm: ['media'], bottom: true },
  { key: 'inbox', href: '/admin/inbox', label: 'Inbox', icon: 'M4 6h16v12H4zM4 7l8 6 8-6', perm: ['forms'] },
  { key: 'emails', href: '/admin/emails', label: 'Emails', icon: 'M3 7l9 6 9-6M3 7v10h18V7', perm: ['emails.templates', 'emails.logs'] },
  { key: 'reports', href: '/admin/reports', label: 'Reports', icon: 'M5 20V10M12 20V4M19 20v-7', perm: ['reports', 'reports.content'] },
  { key: 'settings', href: '/admin/settings', label: 'Settings', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12l2-1-2-4-2 1-2-2V3h-4v3L9 8 7 7l-2 4 2 1v2l-2 1 2 4 2-1 2 2v3h4v-3l2-2 2 1 2-4-2-1z', perm: ['settings'] },
  { key: 'users', href: '/admin/users', label: 'Administrators', icon: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21c1-4 4-6 8-6s7 2 8 6', perm: ['users'] },
  { key: 'security', href: '/admin/security', label: 'Security', icon: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', perm: ['security'] },
  { key: 'backups', href: '/admin/backups', label: 'Backups', icon: 'M4 7h16v13H4zM4 7l2-3h12l2 3M9 12h6', perm: ['backups'] },
];

const Icon = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={d} /></svg>
);

export function visibleNav(user: AdminUser) {
  return NAV.filter((n) => !n.perm || n.perm.some((p) => can(user, p)));
}

export function AdminLayout(p: AdminPageProps) {
  const nav = p.user ? visibleNav(p.user) : [];
  const bottom = nav.filter((n) => n.bottom).slice(0, 4);
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content="#101010" />
        <title>{p.title} · Admin</title>
        <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href={`/assets/admin.css?v=${ASSET_VERSION}`} />
        <script src={`/assets/admin.js?v=${ASSET_VERSION}`} defer></script>
      </head>
      <body class={p.user ? 'has-nav' : 'no-nav'}>
        <a class="skip-link" href="#main">Skip to content</a>
        <header class="topbar">
          <a class="tb-brand" href="/admin" aria-label="Admin home"><Emblem size={30} /><span>EIC Admin</span></a>
          <h1 class="tb-title">{p.title}</h1>
          {p.user ? (
            <div class="tb-actions">
              <a class="tb-icon" href="/admin/notifications" aria-label={`Notifications${p.unread ? ` (${p.unread} unread)` : ''}`}>
                <Icon d="M6 16V11a6 6 0 1112 0v5l2 2H4zM10 20a2 2 0 004 0" />
                {p.unread ? <span class="dot">{p.unread > 99 ? '99+' : p.unread}</span> : null}
              </a>
              <a class="tb-icon" href="/admin/account" aria-label="My account"><Icon d="M16 8a4 4 0 11-8 0 4 4 0 018 0zM4 21c1-4 4-6 8-6s7 2 8 6" /></a>
            </div>
          ) : null}
        </header>
        {p.user ? (
          <nav class="sidebar" aria-label="Admin">
            <ul>
              {nav.map((n) => <li><a href={n.href} aria-current={p.active === n.key ? 'page' : undefined}><Icon d={n.icon} /><span>{n.label}</span></a></li>)}
              <li><a href="/" target="_blank" rel="noopener"><Icon d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /><span>View website</span></a></li>
            </ul>
            <div class="sidebar-user">
              <strong>{p.user.display_name}</strong>
              <span>{ROLE_LABELS[p.user.role]}</span>
              <form method="post" action="/admin/logout"><button class="link" type="submit">Sign out</button></form>
            </div>
          </nav>
        ) : null}
        <main id="main" class={`main${p.wide ? ' wide' : ''}`} tabindex={-1}>
          {p.back ? <a class="back-link" href={p.back.href}>← {p.back.label}</a> : null}
          {p.actions ? <div class="page-actions">{p.actions}</div> : null}
          {p.flash?.ok ? <div class="toast ok" role="status" data-toast>{p.flash.ok}</div> : null}
          {p.flash?.error ? <div class="toast err" role="alert">{p.flash.error}</div> : null}
          {p.children}
        </main>
        {p.user ? (
          <nav class="bottom-nav" aria-label="Quick navigation">
            {bottom.map((n) => <a href={n.href} aria-current={p.active === n.key ? 'page' : undefined}><Icon d={n.icon} /><span>{n.label}</span></a>)}
            <a href="/admin/more" aria-current={p.active === 'more' ? 'page' : undefined}><Icon d="M5 12h.01M12 12h.01M19 12h.01" /><span>More</span></a>
          </nav>
        ) : null}
        <dialog class="confirm-dialog" data-confirm-dialog>
          <form method="dialog">
            <p data-confirm-text>Are you sure?</p>
            <div class="row end"><button value="cancel" class="btn ghost">Cancel</button><button value="ok" class="btn danger" data-confirm-ok>Confirm</button></div>
          </form>
        </dialog>
      </body>
    </html>
  );
}

export function Card({ title, children, actions, class: cls }: { title?: string; children: Child; actions?: Child; class?: string }) {
  return (
    <section class={`card${cls ? ' ' + cls : ''}`}>
      {title || actions ? <header class="card-head">{title ? <h2>{title}</h2> : null}{actions}</header> : null}
      {children}
    </section>
  );
}

export function Field({ label, name, value, type = 'text', help, required, placeholder, rows, max, autocomplete, inputmode, attrs }: {
  label: string; name: string; value?: string | number | null; type?: string; help?: string; required?: boolean; placeholder?: string; rows?: number; max?: number; autocomplete?: string; inputmode?: string; attrs?: Record<string, any>;
}) {
  const id = `fld-${name.replace(/[^a-z0-9_]/gi, '-')}`;
  return (
    <div class="field">
      <label for={id}>{label}{required ? <span class="req"> *</span> : null}</label>
      {type === 'textarea' || type === 'markdown' ? (
        <textarea id={id} name={name} rows={rows ?? (type === 'markdown' ? 10 : 4)} required={required} maxlength={max} placeholder={placeholder} class={type === 'markdown' ? 'md' : undefined} {...(attrs ?? {})}>{value ?? ''}</textarea>
      ) : (
        <input id={id} name={name} type={type} value={value ?? ''} required={required} maxlength={max} placeholder={placeholder} autocomplete={autocomplete} inputmode={inputmode as any} {...(attrs ?? {})} />
      )}
      {help ? <p class="help">{help}</p> : null}
    </div>
  );
}

export function Select({ label, name, value, options, help, required }: { label: string; name: string; value?: string | null; options: { value: string; label: string }[]; help?: string; required?: boolean }) {
  const id = `fld-${name.replace(/[^a-z0-9_]/gi, '-')}`;
  return (
    <div class="field">
      <label for={id}>{label}{required ? <span class="req"> *</span> : null}</label>
      <select id={id} name={name} required={required}>
        {options.map((o) => <option value={o.value} selected={String(value ?? '') === o.value}>{o.label}</option>)}
      </select>
      {help ? <p class="help">{help}</p> : null}
    </div>
  );
}

export function Check({ label, name, checked, help }: { label: string; name: string; checked?: boolean; help?: string }) {
  return (
    <div class="field check">
      <label><input type="checkbox" name={name} value="1" checked={!!checked} /> <span>{label}</span></label>
      {help ? <p class="help">{help}</p> : null}
    </div>
  );
}

/** Image/video/file field with media-library picker, inline upload (gallery or camera) and preview. */
export function MediaField({ label, name, value, kind = 'image', help }: { label: string; name: string; value?: string; kind?: 'image' | 'video' | 'document'; help?: string }) {
  const id = `fld-${name.replace(/[^a-z0-9_]/gi, '-')}`;
  return (
    <div class="field media-field" data-media-field data-kind={kind}>
      <label for={id}>{label}</label>
      <div class="mf-preview" data-mf-preview>
        {value && kind === 'image' ? <img src={value} alt="" loading="lazy" /> : value ? <span class="mf-file">{value}</span> : <span class="mf-empty">No {kind} selected</span>}
      </div>
      <input id={id} name={name} type="text" value={value ?? ''} placeholder="/media/… or https://…" data-mf-input inputmode="url" />
      <div class="row wrap">
        <button type="button" class="btn small" data-mf-pick>Choose from library</button>
        <label class="btn small">Upload<input type="file" hidden data-mf-upload accept={kind === 'image' ? 'image/*' : kind === 'video' ? 'video/mp4,video/webm' : '.pdf,application/pdf,image/*'} /></label>
        {kind === 'image' ? <label class="btn small">Camera<input type="file" hidden data-mf-upload accept="image/*" capture="environment" /></label> : null}
        <button type="button" class="btn small ghost" data-mf-clear>Remove</button>
      </div>
      <progress class="mf-progress" max="100" value="0" hidden data-mf-progress />
      {help ? <p class="help">{help}</p> : null}
    </div>
  );
}

export function ConfirmForm({ action, label, message, danger = true, hidden, small }: { action: string; label: string; message: string; danger?: boolean; hidden?: Record<string, string>; small?: boolean }) {
  return (
    <form method="post" action={action} data-confirm={message} class="inline">
      {Object.entries(hidden ?? {}).map(([k, v]) => <input type="hidden" name={k} value={v} />)}
      <button type="submit" class={`btn${danger ? ' danger' : ''}${small ? ' small' : ''}`}>{label}</button>
    </form>
  );
}

const STATUS_CLASS: Record<string, string> = {
  NEW: 'info', PENDING_REVIEW: 'warn', UNDER_REVIEW: 'warn', INFORMATION_REQUESTED: 'warn', ACCEPTED: 'ok', DECLINED: 'bad', WITHDRAWN: 'muted',
  published: 'ok', draft: 'muted', scheduled: 'info', unpublished: 'bad', sent: 'ok', failed: 'bad', queued: 'info', sending: 'info', skipped: 'warn',
  active: 'ok', invited: 'info', disabled: 'bad', new: 'info', handled: 'muted',
};
export const statusLabel = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
export function Badge({ status, label }: { status: string; label?: string }) {
  return <span class={`badge ${STATUS_CLASS[status] ?? 'muted'}`}>{label ?? statusLabel(status)}</span>;
}

export function Time({ ts }: { ts?: number | null }) {
  if (!ts) return <span class="muted">—</span>;
  return <time datetime={new Date(ts).toISOString()} data-local-time>{formatDateTime(ts)}</time>;
}

export function Pager({ base, page, hasMore, params }: { base: string; page: number; hasMore: boolean; params?: URLSearchParams }) {
  const href = (p: number) => {
    const q = new URLSearchParams(params);
    q.set('page', String(p));
    return `${base}?${q}`;
  };
  if (page <= 1 && !hasMore) return null;
  return (
    <nav class="pager" aria-label="Pagination">
      {page > 1 ? <a class="btn small ghost" href={href(page - 1)}>← Previous</a> : <span />}
      <span class="muted">Page {page}</span>
      {hasMore ? <a class="btn small ghost" href={href(page + 1)}>Next →</a> : <span />}
    </nav>
  );
}

export function Empty({ children }: { children: Child }) {
  return <div class="empty">{children}</div>;
}

export function flashFrom(url: string) {
  const u = new URL(url);
  return { ok: u.searchParams.get('ok') ?? undefined, error: u.searchParams.get('error') ?? undefined };
}
