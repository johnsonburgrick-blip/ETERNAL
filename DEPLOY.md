# Deploy notes

Everything runs on Cloudflare's free tier: one Worker, one D1 database, one R2 bucket,
and Resend for email. No Cloudflare Access, Zero Trust or third-party auth is needed.
Admin login is built into the Worker.

> **Secrets are never typed into files or commands.** Each `npx wrangler secret put NAME`
> command below asks for the value at its own prompt. Never commit secrets, and never
> paste them into chats or tickets.

## 1. One-time Cloudflare setup

```bash
npx wrangler login
```

```bash
npx wrangler d1 create eic
```

Copy the printed `database_id` into `wrangler.toml` (`[[d1_databases]]`).

```bash
npx wrangler r2 bucket create eic-files
```

Edit the `[vars]` block in `wrangler.toml`:

| Variable | Example | Purpose |
|---|---|---|
| `PUBLIC_BASE_URL` | `https://yourdomain.com` | Absolute links in emails, sitemap, canonical URLs |
| `EMAIL_FROM` | `noreply@yourdomain.com` | Sender (must be on a domain verified in Resend) |
| `EMAIL_REPLY_TO` | `support@yourdomain.com` | Reply-To on every email |
| `ADMIN_NOTIFY_EMAIL` | `support@yourdomain.com` | Receives every admin notification |
| `TURNSTILE_SITE_KEY` | *(optional)* | Enables the Cloudflare Turnstile widget on public forms |

## 2. Secrets (run each command and enter the value when prompted)

```bash
npx wrangler secret put AUTH_PEPPER
```

Enter 64+ random characters (for example from a password manager). This is the password
"pepper". **Never rotate it.** Rotating `AUTH_PEPPER` invalidates every existing password,
and you would then need the lock-out recovery in section 7.

```bash
npx wrangler secret put TOKEN_SECRET
```

Another 64+ random characters. It signs public form timers.

```bash
npx wrangler secret put RESEND_API_KEY
```

Your Resend API key. Until it is set, emails are logged as "not sent" and nothing else breaks.

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Optional. Set it only if you also set `TURNSTILE_SITE_KEY`.

## 3. Database & deploy

```bash
npm install
```

```bash
npm run db:migrate:remote
```

```bash
npm run deploy
```

Then, in the Cloudflare dashboard, go to Workers & Pages → eternal-illuminati-covenant →
Settings → Domains & Routes and add your custom domain. The edge-cache layer of the read
model (`caches.default`) only works on a custom domain, not on `*.workers.dev`.

## 4. Email (Resend)

1. In Resend → Domains, add `yourdomain.com` and create the DNS records it lists (SPF/DKIM)
   in Cloudflare DNS. Wait until the domain shows **Verified**.
2. Make sure `EMAIL_FROM` uses that domain.
3. The email logo is served from `https://yourdomain.com/assets/logo-email.png`. Replace the
   file or set another HTTPS URL in Admin → Settings → "Logo for emails".
4. Test: Admin → Emails → any template → "Send a test". Check Admin → Emails → Delivery log.
   Failed sends show the provider's error and can be retried. A cron job also retries
   temporary failures every 5 minutes.

## 5. First sign-in

Open `https://yourdomain.com/admin/setup` and create the owner account (Super
Administrator). This form exists only while the `users` table is empty; afterwards it
refuses. Invite other administrators from Admin → Administrators. Each invitee gets an
email link to choose their own password. Turn on two-step verification under My account.

## 6. Content review before launch

The seed content is a starting point. Before going live, please review:

- **History pages, timeline, figures, symbols, archive**: written from standard scholarship
  and cited. Have a historian check them.
- **The Covenant, Membership, FAQ, principles**: the wording about the modern organisation is
  a **draft**. Confirm it matches your actual policies.
- **Hidden placeholder sections** (Admin → Pages → The Covenant / Leadership): founding
  information, governance, activities. Fill them in with verified facts, then make them visible.
- **Privacy Policy, Terms, Data Protection**: drafts describing how this system actually
  handles data. Have them reviewed by a qualified adviser for your jurisdiction.
- **French**: interface and key pages are translated. Legal and membership-terms wording is
  deliberately left in English until a reviewed translation is entered.
- **Leadership**: no profiles are seeded. Publish only verified information.
- **Images**: historical images come from Wikimedia Commons (public domain, CC0 or CC BY/BY-SA).
  Credits and licences are stored in the media library and shown under each image.

## 7. Locked out? (recovery)

If every administrator is locked out, or `AUTH_PEPPER` was rotated, delete the user and
session rows and run the setup route again. Content, applications and history are kept.
Records that referenced a deleted user keep their data, with the user reference cleared.

```bash
npx wrangler d1 execute eic --remote --command "DELETE FROM sessions; DELETE FROM auth_tokens; DELETE FROM users;"
```

Then open `https://yourdomain.com/admin/setup`, create a new owner, and re-invite the other
administrators.

For a single locked account (5 wrong passwords → locked for 15 minutes), either wait, use
"Forgot your password?", or have a Super Administrator send a reset link from Admin →
Administrators.

## 8. Backups & recovery

- A full SQL backup is written nightly to R2 (`backups/`, kept for 30 days). Admin → Backups
  can create and download one at any time.
- D1 Time Travel can restore the live database to any minute in the last 30 days:

```bash
npx wrangler d1 time-travel restore eic --timestamp=2026-11-10T12:00:00Z
```

- To restore a downloaded backup into a fresh database:

```bash
npx wrangler d1 create eic-restore
```

```bash
npx wrangler d1 migrations apply eic-restore --remote
```

```bash
npx wrangler d1 execute eic-restore --remote --file=backup.sql
```

  Then point `database_id` in `wrangler.toml` at the restored database and deploy. (The
  restore path is exercised by `npm test`.)

## 9. Acceptance check: crawling must not burn D1 reads

Public page views are served from the snapshot read-model (memory → edge cache → R2
`cache/site.json` → D1 at most every ~15 minutes). To verify on the live site:

1. Note the D1 "Rows read" figure: Cloudflare dashboard → Storage & Databases → D1 → eic →
   Metrics. Or run:

```bash
npx wrangler d1 insights eic --timePeriod=1d
```

2. Crawl the whole site:

```bash
node test/crawl.mjs https://yourdomain.com
```

3. Check the counter again. It should barely move: roughly one row per detail page
   (article, event, figure…) plus at most one snapshot rebuild. The crawl must report no 5xx.

Locally, `npm test` runs the same crawl against `wrangler dev` and asserts both conditions,
including a simulated database outage.

## 10. Local development

Create `.dev.vars` yourself (it is git-ignored) with local-only values for
`AUTH_PEPPER`, `TOKEN_SECRET` and optionally `RESEND_API_KEY`, then:

```bash
npm run db:migrate:local
```

```bash
npm run dev
```

Run the full test suite (generates throw-away secrets itself and uses a mock email API):

```bash
npm test
```

## 11. Rules for future changes

- Public routes and views read data **only** through `src/snapshot/read.ts`. The only
  module allowed to query public content tables is `src/snapshot/source.ts`.
  `npm run check:db-access` enforces this.
- Bump `SNAPSHOT_SCHEMA` in `src/snapshot/model.ts` whenever the snapshot's shape changes.
- Any cron job that fetches external data must publish through `publishTimerValue()` in
  `src/cron.ts`: it writes its own R2 object, and a DB row only when the value changes.
