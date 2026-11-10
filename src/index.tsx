import { Hono } from 'hono';
import type { AppEnv, Env } from './env';
import { isProduction } from './env';
import admin from './routes/admin';
import { mediaHandler, publicHandler, robotsHandler, sitemapHandler } from './routes/public';
import { scheduled } from './cron';
import { dropMemoryCopy, snapshotStatus } from './snapshot/snapshot';

const app = new Hono<AppEnv>();

const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://cloudflareinsights.com",
  "frame-src 'self' https://challenges.cloudflare.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

app.use('*', async (c, next) => {
  await next();
  const h = c.res.headers;
  if (!h.has('content-security-policy')) h.set('content-security-policy', CSP);
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  h.set('permissions-policy', 'geolocation=(), microphone=(), payment=(), usb=()');
  if (!h.has('x-frame-options')) h.set('x-frame-options', 'SAMEORIGIN');
  if (isProduction(c.env)) h.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
});

app.get('/robots.txt', robotsHandler);
app.get('/sitemap.xml', sitemapHandler);
app.get('/media/*', mediaHandler);
app.route('/admin', admin);

// Local development diagnostics (never available in production).
app.get('/__dev/db-stats', (c) => {
  if (isProduction(c.env)) return c.notFound();
  const s = (globalThis as any).__dbStats ?? { rowsRead: 0, rowsWritten: 0, queries: 0 };
  if (c.req.query('reset') === '1') (globalThis as any).__dbStats = { rowsRead: 0, rowsWritten: 0, queries: 0 };
  if (c.req.query('drop') === '1') dropMemoryCopy();
  return c.json({ ...s, snapshot: snapshotStatus() });
});

app.all('*', publicHandler);

app.onError((err, c) => {
  console.error('unhandled error', c.req.method, new URL(c.req.url).pathname, err?.stack ?? String(err));
  const debug = isProduction(c.env) ? '' : `<pre style="text-align:left;white-space:pre-wrap;color:#f0a493">${String(err?.stack ?? err).replace(/[<&]/g, (ch) => (ch === '<' ? '&lt;' : '&amp;'))}</pre>`;
  return c.html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title><body style="background:#101010;color:#E9E0CD;font-family:Georgia,serif;text-align:center;padding:15vh 1rem"><h1>Something went wrong</h1><p>Please try again in a moment.</p><p><a style="color:#B89554" href="/">Return home</a></p>${debug}</body>`, 500);
});

// ───────── Local-only D1 instrumentation (row counting / simulated outage) ─────────
const originals = new WeakMap<object, D1PreparedStatement>();
function instrument(db: D1Database, down: boolean, count: boolean): D1Database {
  const stats = ((globalThis as any).__dbStats ??= { rowsRead: 0, rowsWritten: 0, queries: 0 });
  const record = (meta: any) => {
    if (!count || !meta) return;
    stats.queries++;
    stats.rowsRead += meta.rows_read ?? 0;
    stats.rowsWritten += meta.rows_written ?? 0;
  };
  const fail = () => {
    throw new Error('D1_ERROR: simulated database outage (DEV_SIMULATE_DB_DOWN)');
  };
  const wrap = (st: D1PreparedStatement): D1PreparedStatement => {
    const p = new Proxy(st, {
      get(target, prop) {
        if (prop === 'bind') return (...args: any[]) => wrap(target.bind(...args));
        if (prop === 'all' || prop === 'run') return async () => { if (down) fail(); const r = await (target as any)[prop](); record(r.meta); return r; };
        if (prop === 'first') return async (col?: string) => { if (down) fail(); const r = await target.all(); record(r.meta); const row: any = r.results[0] ?? null; return col ? row?.[col] ?? null : row; };
        if (prop === 'raw') return async (...a: any[]) => { if (down) fail(); return (target as any).raw(...a); };
        const v = (target as any)[prop];
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    originals.set(p, st);
    return p;
  };
  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') return (sql: string) => { if (down) fail(); return wrap(target.prepare(sql)); };
      if (prop === 'batch') return async (stmts: D1PreparedStatement[]) => { if (down) fail(); const res = await target.batch(stmts.map((s) => originals.get(s) ?? s)); res.forEach((r) => record(r.meta)); return res; };
      if (prop === 'exec') return async (sql: string) => { if (down) fail(); return target.exec(sql); };
      const v = (target as any)[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

function prepareEnv(env: Env): Env {
  if (isProduction(env)) return env;
  const down = env.DEV_SIMULATE_DB_DOWN === '1';
  const count = env.DEV_DB_METRICS === '1';
  return down || count ? { ...env, DB: instrument(env.DB, down, count) } : env;
}

export default {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) => app.fetch(req, prepareEnv(env), ctx),
  scheduled: (event: ScheduledController, env: Env, ctx: ExecutionContext) => ctx.waitUntil(scheduled(event, prepareEnv(env), ctx)),
} satisfies ExportedHandler<Env>;
