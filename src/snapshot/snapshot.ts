/**
 * Snapshot read-model with layered, stale-while-revalidate lookup:
 *
 *   1. isolate memory      (~60 s, per isolate)
 *   2. edge cache          (caches.default, ~60 s, per data centre; no-op on *.workers.dev)
 *   3. R2 object           (cache/site.json, shared worldwide)
 *   4. D1                  (only when the R2 copy is older than ~15 min, or missing)
 *
 * A stale copy is served immediately and refreshed in the background with
 * ctx.waitUntil(). Before rebuilding from D1, the refresher re-reads R2 in case
 * another instance already refreshed it, so many instances don't rebuild at once.
 *
 * Copies whose `schema` differs, or that were written by an older deploy
 * (buildTs < this deploy's timestamp), are ignored, so a stale object can't keep
 * serving after a deploy.
 *
 * If D1 is unavailable, the last good copy keeps being served (any age); only writes fail.
 */
import type { Env } from '../env';
import { loadSiteDataFromDb } from './source';
import { SNAPSHOT_SCHEMA, type Snapshot } from './model';

export const R2_SNAPSHOT_KEY = 'cache/site.json';
const MEMORY_TTL_MS = 60_000;
const EDGE_TTL_S = 60;
const STALE_AFTER_MS = 15 * 60_000;
const REBUILD_BACKOFF_MS = 30_000;

// degraded = an older-build copy kept only because the database is unavailable
type Holder = { snap: Snapshot; freshAt: number; degraded?: boolean };
let mem: Holder | null = null;
let inflight: Promise<Snapshot | null> | null = null;
let lastFailure = 0;

export type SnapshotStatus = { source: 'memory' | 'edge' | 'r2' | 'db' | 'stale-memory' | 'none'; ageMs: number };
let lastStatus: SnapshotStatus = { source: 'none', ageMs: 0 };
export const snapshotStatus = () => lastStatus;

export function snapshotEnabled(env: Env) {
  return (env.SNAPSHOT_MODE ?? 'on') !== 'off' && !!env.BUCKET;
}

function buildInfo(env: Env) {
  const md = env.CF_VERSION_METADATA;
  const ts = md?.timestamp ? Date.parse(md.timestamp) : 0;
  return { id: md?.id || 'local', ts: Number.isFinite(ts) ? ts : 0 };
}

function sameSchema(s: any): s is Snapshot {
  return !!s && s.schema === SNAPSHOT_SCHEMA && typeof s.generatedAt === 'number';
}

function acceptable(s: any, env: Env): s is Snapshot {
  return sameSchema(s) && (s.buildTs ?? 0) >= buildInfo(env).ts;
}

let lastSeenR2: Snapshot | null = null; // same-schema copy from an older build (outage fallback only)

function edgeKey(env: Env) {
  const b = buildInfo(env);
  return new Request(`https://snapshot.internal/${R2_SNAPSHOT_KEY}?schema=${SNAPSHOT_SCHEMA}&build=${encodeURIComponent(b.id)}`);
}

async function edgeGet(env: Env): Promise<Holder | null> {
  try {
    const res = await caches.default.match(edgeKey(env));
    if (!res) return null;
    const freshAt = Number(res.headers.get('x-fresh-at')) || 0;
    if (Date.now() - freshAt >= MEMORY_TTL_MS) return null; // expired relative to its R2 read
    const snap = await res.json();
    return acceptable(snap, env) ? { snap, freshAt } : null;
  } catch {
    return null;
  }
}

async function edgePut(env: Env, h: Holder, body?: string) {
  try {
    const remaining = Math.max(1, EDGE_TTL_S - Math.floor((Date.now() - h.freshAt) / 1000));
    await caches.default.put(
      edgeKey(env),
      new Response(body ?? JSON.stringify(h.snap), {
        headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${remaining}`, 'x-fresh-at': String(h.freshAt) },
      }),
    );
  } catch {
    /* edge cache is best-effort */
  }
}

async function r2Get(env: Env): Promise<Snapshot | null> {
  const obj = await env.BUCKET.get(R2_SNAPSHOT_KEY);
  if (!obj) return null;
  const snap = await obj.json();
  if (acceptable(snap, env)) return snap;
  if (sameSchema(snap)) lastSeenR2 = snap; // older build: ignored unless the database is down
  return null;
}

/** Rebuild from D1 and publish to R2 + edge + memory. Returns null if D1 is unavailable. */
async function rebuild(env: Env, force = false): Promise<Snapshot | null> {
  if (!force && Date.now() - lastFailure < REBUILD_BACKOFF_MS) return null;
  let data;
  try {
    data = await loadSiteDataFromDb(env);
  } catch (e) {
    lastFailure = Date.now();
    console.error('snapshot: database unavailable, keeping last good copy', String(e));
    return null;
  }
  const b = buildInfo(env);
  const snap: Snapshot = { ...data, schema: SNAPSHOT_SCHEMA, build: b.id, buildTs: b.ts, generatedAt: Date.now() };
  const body = JSON.stringify(snap);
  const holder = { snap, freshAt: Date.now() };
  mem = holder;
  try {
    await env.BUCKET.put(R2_SNAPSHOT_KEY, body, { httpMetadata: { contentType: 'application/json' } });
  } catch (e) {
    console.error('snapshot: R2 write failed', String(e));
  }
  await edgePut(env, holder, body);
  return snap;
}

/** Background refresh, coalesced per isolate. Re-reads R2 first (after a small jitter). */
function refreshInBackground(env: Env, ctx: ExecutionContext) {
  if (inflight) return;
  inflight = (async () => {
    await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 1500)));
    try {
      const fromR2 = await r2Get(env);
      if (fromR2 && Date.now() - fromR2.generatedAt < STALE_AFTER_MS) {
        const h = { snap: fromR2, freshAt: Date.now() };
        mem = h;
        await edgePut(env, h);
        return fromR2;
      }
    } catch {
      /* fall through to rebuild */
    }
    return rebuild(env);
  })().finally(() => {
    inflight = null;
  });
  ctx.waitUntil(inflight);
}

function maybeRefresh(env: Env, ctx: ExecutionContext, snap: Snapshot) {
  if (Date.now() - snap.generatedAt > STALE_AFTER_MS) refreshInBackground(env, ctx);
}

/** Returns the current snapshot, or null when snapshots are disabled or no copy can be produced. */
export async function getSnapshot(env: Env, ctx: ExecutionContext): Promise<Snapshot | null> {
  if (!snapshotEnabled(env)) return null;
  const t = Date.now();

  // 1. isolate memory
  if (mem && (acceptable(mem.snap, env) || mem.degraded) && t - mem.freshAt < MEMORY_TTL_MS) {
    lastStatus = { source: 'memory', ageMs: t - mem.snap.generatedAt };
    maybeRefresh(env, ctx, mem.snap);
    return mem.snap;
  }

  // 2. edge cache (this data centre)
  const edge = await edgeGet(env);
  if (edge) {
    mem = edge;
    lastStatus = { source: 'edge', ageMs: t - edge.snap.generatedAt };
    maybeRefresh(env, ctx, edge.snap);
    return edge.snap;
  }

  // 3. R2 (worldwide)
  try {
    const fromR2 = await r2Get(env);
    if (fromR2) {
      const h = { snap: fromR2, freshAt: t };
      mem = h;
      ctx.waitUntil(edgePut(env, h));
      lastStatus = { source: 'r2', ageMs: t - fromR2.generatedAt };
      maybeRefresh(env, ctx, fromR2);
      return fromR2;
    }
  } catch (e) {
    console.error('snapshot: R2 read failed', String(e));
  }

  // R2 empty/unreadable: serve an expired memory copy rather than block, and refresh.
  if (mem && acceptable(mem.snap, env)) {
    lastStatus = { source: 'stale-memory', ageMs: t - mem.snap.generatedAt };
    refreshInBackground(env, ctx);
    return mem.snap;
  }

  // 4. No usable copy anywhere — build synchronously (coalesced).
  if (!inflight) {
    inflight = rebuild(env).finally(() => {
      inflight = null;
    });
  }
  const built = await inflight;
  if (built) {
    lastStatus = { source: 'db', ageMs: 0 };
    return built;
  }
  // Database unavailable and no copy from this build: serve the last good copy with the
  // same schema (e.g. written by the previous deploy) rather than failing.
  const fallback = mem?.snap && sameSchema(mem.snap) ? mem.snap : lastSeenR2;
  if (fallback) {
    mem = { snap: fallback, freshAt: t, degraded: true };
    lastStatus = { source: 'stale-memory', ageMs: t - fallback.generatedAt };
    return fallback;
  }
  lastStatus = { source: 'none', ageMs: 0 };
  return null;
}

/**
 * Called after every admin write: rebuild immediately so the editor sees their own
 * change at once. Other data centres pick it up within a minute (edge/memory TTL).
 */
export async function invalidateAndRebuild(env: Env): Promise<boolean> {
  if (!snapshotEnabled(env)) return true;
  const snap = await rebuild(env, true);
  return !!snap;
}

/** Drop this isolate's memory copy (tests / admin "refresh cache" button). */
export function dropMemoryCopy() {
  mem = null;
}

/** Read the snapshot copy currently stored in R2 without touching D1 (used by cron). */
export async function peekR2Snapshot(env: Env): Promise<Snapshot | null> {
  try {
    return await r2Get(env);
  } catch {
    return null;
  }
}
