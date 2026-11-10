// Acceptance crawl: requests every public page reachable from the homepage and the
// sitemap (as a search-engine crawler), and reports status codes.
// Usage: node test/crawl.mjs https://yourdomain.com [maxRequests]
// Then compare the D1 "rows read" counter before/after (see DEPLOY.md → Acceptance check).
const base = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const max = parseInt(process.argv[3] || '5000', 10);
const host = new URL(base).host;
const ua = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const seen = new Set();
const queue = ['/', '/sitemap.xml', '/robots.txt'];
const byStatus = {};
const fivexx = [];
let n = 0;
const started = Date.now();
while (queue.length && n < max) {
  const batch = queue.splice(0, 6).filter((p) => !seen.has(p));
  batch.forEach((p) => seen.add(p));
  await Promise.all(batch.map(async (p) => {
    n++;
    let res;
    try { res = await fetch(base + p, { headers: { 'user-agent': ua }, redirect: 'manual' }); } catch (e) { fivexx.push([p, 'network']); return; }
    byStatus[res.status] = (byStatus[res.status] ?? 0) + 1;
    if (res.status >= 500) fivexx.push([p, res.status]);
    if (!/html|xml/.test(res.headers.get('content-type') ?? '')) return;
    const text = await res.text();
    for (const m of text.matchAll(/(?:href="|<loc>)([^"<#]+)/g)) {
      let u;
      try { u = new URL(m[1], base); } catch { continue; }
      if (u.host !== host || u.search || /^\/(admin|assets|media|cdn-cgi)/.test(u.pathname)) continue;
      if (!seen.has(u.pathname) && !queue.includes(u.pathname)) queue.push(u.pathname);
    }
  }));
}
console.log(JSON.stringify({ base, requests: n, seconds: Math.round((Date.now() - started) / 1000), byStatus, fivexx: fivexx.slice(0, 20) }, null, 2));
process.exit(fivexx.length ? 1 : 0);
