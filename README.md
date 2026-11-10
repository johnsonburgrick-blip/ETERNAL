# Eternal Illuminati Covenant

The website, membership application system and mobile-first administration portal for the
Eternal Illuminati Covenant, an independent, modern organisation that studies the history
of the Bavarian Illuminati and the Enlightenment. The site states clearly that it is not
the historical order and claims no continuity with it.

Built on a **Cloudflare Worker (TypeScript)** with **D1**, **R2** and **Resend**. See
[PLAN.md](PLAN.md) for why this stack was chosen and [DEPLOY.md](DEPLOY.md) to put it live.

## What's included

**Public website** (English + French; Spanish prepared)
- Cinematic homepage and every requested page: history, interactive timeline, historical
  figures, philosophy, principles, symbols, the Covenant, leadership, membership, application
  guide, publications, announcements, research archive, FAQ, contact, code of conduct,
  governance, privacy, terms, data protection, report an issue.
- All content comes from the database and is editable in the admin portal. Detail pages
  for every record. In-memory search over the snapshot.
- SEO: unique titles, meta descriptions, canonical URLs, hreflang, Open Graph, JSON-LD,
  XML sitemap, robots.txt. Responsive WebP images with lazy loading. Hero video only on
  desktop, never with reduced motion or data saver. Accessible forms, skip links, keyboard
  navigation, reduced-motion support.

**Membership applications** (no applicant accounts)
- Four-step form with progress indicator, client- and server-side validation, review and
  edit, consent and terms, and up to 3 private supporting documents.
- Reference numbers (`EIC-2026-XXXXXX`), email verification, duplicate prevention (per
  submission token and per email, without revealing whether an email exists), a signed
  form timer, a honeypot, optional Turnstile and per-IP rate limits.
- Save-and-resume via a 7-day emailed link. Withdrawal and applicant messages are
  confirmed by email link.
- Statuses: New, Pending review, Under review, Information requested, Accepted, Declined,
  Withdrawn. Each change can email the applicant.

**Admin portal** (`/admin`, mobile-first with bottom navigation)
- Dashboard with real statistics and quick actions. Notification centre with read/unread.
- Applications: search, filters, sorting, detail view, private documents, internal notes,
  reviewer assignment, status changes with confirmation, information requests,
  correspondence and decision history, CSV export, deletion per the retention policy.
- Visual page editor: pick a page and a section, then edit text, photographs, backgrounds
  and buttons. Autosave drafts, preview on mobile/tablet/desktop, publish. Add, hide,
  reorder, duplicate or delete sections. Revision history with restore.
- Collections: articles (drafts, scheduling, categories, tags, featured, SEO), timeline,
  figures, archive, leadership, principles, symbols, FAQs, categories, all with revisions.
- Media library: phone gallery/camera upload, client-side compression to responsive WebP
  sizes, progress bars, magic-byte validation, categories, search, credits and licences,
  replace-everywhere, deletion only when unused.
- Emails: editable per-language templates with live preview and test send, delivery log
  with failure tracking and retry, announcements to applicant groups.
- Reports: monthly trends, status breakdown, review times, email delivery, content
  activity, article views (bots excluded), CSV export.
- Settings, navigation, interface translations, application-form fields, administrators
  (invite by email), security/audit log, backups.

**Security**
- Built-in auth: PBKDF2-SHA256 (Web Crypto) + per-user salt + `AUTH_PEPPER` secret.
  HttpOnly/Secure/SameSite=Strict `__Host-` session cookie storing only a token hash.
  Idle and absolute expiry. Optional TOTP MFA. Per-IP and per-account rate limits with
  lockout. Same-origin check on every admin write. One-time setup route.
- Roles: Super Administrator, Content Administrator, Application Reviewer (reviewers see
  only applications assigned to them). Every sensitive action is audit-logged.
- Applicant documents live under a private R2 prefix and are streamed only to authorised
  administrators. Strict CSP and security headers throughout.

**Read-model** (public views don't query D1)
- One versioned snapshot JSON: isolate memory (60 s) → edge cache (60 s) → R2
  `cache/site.json` → D1 only when older than 15 minutes, with stale-while-revalidate.
  Admin writes rebuild it at once. If D1 is down, the last good copy keeps serving.
- One DB read per detail page, falling back to the snapshot row. Unknown slugs 404 with no
  DB read. View counters skip bots. robots.txt keeps crawlers off query-string and search URLs.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Local Worker with local D1/R2 (needs `.dev.vars`, see DEPLOY.md) |
| `npm test` | Full end-to-end suite against `wrangler dev` with a mock Resend API |
| `npm run typecheck` | TypeScript |
| `npm run check:db-access` | Enforces the "only source.ts reads public content" rule |
| `npm run seed:build` | Regenerates `migrations/0002_seed.sql` from `scripts/seed-content.mjs` |
| `npm run db:migrate:local` / `db:migrate:remote` | Apply migrations |
| `node test/crawl.mjs <url>` | Acceptance crawl of a deployed site |
| `npm run deploy` | Deploy to Cloudflare |

## Layout

```
src/
  index.tsx            entry: routing, security headers, cron, dev instrumentation
  cron.ts              scheduled publication, email retries, cleanup, nightly backup
  snapshot/            read-model: model.ts (types), source.ts (the ONLY public DB reader),
                       snapshot.ts (layered cache), read.ts (public wrappers)
  routes/public.tsx    public site (no DB access)
  routes/admin/*       admin portal
  forms/*              application, applicant actions, contact/report handlers
  email/*              Resend client, branded layout, default templates
  lib/*                auth, password hashing, TOTP, guards, markdown, notifications, backup
  views/*              server-rendered TSX components (public + admin)
  sections/registry.ts section types shared by the editor and the renderer
migrations/            schema + generated seed
public/assets/         CSS, JS, logos, optimised images (served directly by Cloudflare)
scripts/               seed content/builder, image preparation, DB-access check
test/                  e2e suite, browser QA, acceptance crawler
```
