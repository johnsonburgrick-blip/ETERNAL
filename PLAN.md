# Eternal Illuminati Covenant — implementation plan

## Stack decision

The project brief preferred React/Supabase/Vercel, but the concrete platform
requirements (read-model, self-contained auth, free-tier budget) target
**Cloudflare Workers + D1 + R2**. This build therefore uses:

| Concern | Choice |
|---|---|
| Runtime | Cloudflare Worker (TypeScript), Hono router |
| Rendering | Server-rendered TSX components (`hono/jsx`) + small progressive-enhancement scripts. No client framework is needed, so public pages ship ~10 KB of JS. |
| Data | D1 (SQLite) with SQL migrations in `migrations/` |
| Files | R2 (public media under `media/`, private applicant documents under `private/`, snapshot under `cache/`, backups under `backups/`) |
| Email | Resend HTTP API, called only from the Worker |
| Auth | Built into the Worker (PBKDF2 + pepper, D1 sessions, optional TOTP MFA) |
| Bot protection | Cloudflare Turnstile when configured, plus honeypot, signed form timer and per-IP rate limits |

Supabase Row Level Security has no D1 equivalent. All authorization is enforced
server-side in the Worker. Public route modules can't reach the database at
all: `scripts/check-db-access.mjs` enforces this in CI.

## Phases

1. **Foundation**: schema/migrations, design system, i18n, env/config, crypto helpers.
2. **Public website**: CMS-driven pages built from section components, served from the snapshot read-model.
3. **Archive and publications**: timeline, figures, symbols, principles, archive, articles, announcements, search.
4. **Membership application**: 4-step form, email verification, reference numbers, de-duplication, documents, save-and-resume, withdrawal and applicant messages.
5. **Admin auth and roles**: setup route, login, MFA, sessions, rate limits, same-origin checks, invites/resets, roles.
6. **Mobile-first admin dashboard**: real statistics, quick actions, bottom navigation.
7. **CMS and visual editor**: page/section editor, drafts, autosave, device previews, publish, revisions and restore.
8. **Applications and email**: review workflow, notes, assignment, statuses, correspondence, templates, logs and retry.
9. **Notifications and reports**: notification centre, reports, CSV export.
10. **Security, performance and i18n**: audit log, backups, SEO, sitemap/robots, caching.
11. **Testing**: integration test suite against `wrangler dev` with a mock Resend server, plus a full-site crawl measuring D1 rows read.
