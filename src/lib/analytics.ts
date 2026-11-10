import type { Env } from '../env';
import { isBot } from './util';

/**
 * Analytics-style writes (view counters) are skipped for bots/crawlers so crawler
 * traffic can't burn the D1 write budget. Runs after the response via waitUntil.
 */
export function countArticleView(env: Env, ctx: ExecutionContext, req: Request, articleId: number) {
  if (req.method !== 'GET' || isBot(req.headers.get('user-agent'))) return;
  if (req.headers.get('purpose') === 'prefetch' || req.headers.get('sec-purpose')?.includes('prefetch')) return;
  ctx.waitUntil(
    env.DB.prepare('UPDATE articles SET views = views + 1 WHERE id = ?').bind(articleId).run().then(
      () => undefined,
      (e) => console.error('views: increment failed', String(e)),
    ),
  );
}
