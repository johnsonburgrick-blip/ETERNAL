// End-to-end tests against `wrangler dev` (local D1 + R2) with a mock Resend API.
// Secrets for the local run are generated randomly at start-up and never printed.
// Usage: npm test
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const STATE = path.join(ROOT, 'test/.state');
const PORT = 8787, PORT_DOWN = 8789, MOCK_PORT = 8788;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_NOTIFY = 'support@yourdomain.com';
const results = [];
const procs = [];
let section = '';

// ───────── tiny test helpers ─────────
function check(name, cond, detail = '') {
  results.push({ section, name, ok: !!cond, detail });
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? `  →  ${String(detail).slice(0, 300)}` : ''}`);
}
const group = (n) => { section = n; console.log(`\n■ ${n}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (n = 32) => crypto.randomBytes(n).toString('hex');

// Node's fetch may reuse a keep-alive socket the dev server already closed while idle.
const _fetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  try { return await _fetch(url, opts); } catch (e) {
    if (e?.cause?.code === 'UND_ERR_SOCKET' || e?.cause?.code === 'ECONNRESET') return _fetch(url, opts);
    throw e;
  }
};

// ───────── mock Resend ─────────
const sent = [];
let failNext = 0;
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.method === 'POST' && req.url === '/emails') {
      if (failNext > 0) { failNext--; res.writeHead(500, { 'content-type': 'application/json' }); return res.end('{"message":"mock outage"}'); }
      const json = JSON.parse(body);
      sent.push({ ...json, _auth: req.headers.authorization, _idem: req.headers['idempotency-key'] });
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ id: crypto.randomUUID() }));
    }
    res.writeHead(404); res.end();
  });
});
async function waitEmail(pred, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) { const e = sent.find(pred); if (e) return e; await sleep(150); }
  return null;
}
const linkIn = (email, re) => (email?.html.match(re) ?? [])[0]?.replace(/&amp;/g, '&');

// ───────── HTTP client with a cookie jar ─────────
class Client {
  constructor(base = BASE) { this.base = base; this.jar = new Map(); this.lastSetCookie = []; }
  async req(p, { method = 'GET', form, multipart, headers = {}, origin = true } = {}) {
    const h = { 'user-agent': 'Mozilla/5.0 (E2E test browser)', ...headers };
    if (this.jar.size) h.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    let body;
    if (form) { body = new URLSearchParams(form).toString(); h['content-type'] = 'application/x-www-form-urlencoded'; }
    if (multipart) body = multipart;
    if (method !== 'GET' && origin) h.origin = this.base;
    const res = await fetch(this.base + p, { method, headers: h, body, redirect: 'manual' });
    this.lastSetCookie = res.headers.getSetCookie();
    for (const c of this.lastSetCookie) {
      const [kv] = c.split(';');
      const [k, ...v] = kv.split('=');
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(c) || v.join('=') === '') this.jar.delete(k.trim()); else this.jar.set(k.trim(), v.join('='));
    }
    res.text_ = await res.text();
    if (res.status >= 500 && process.env.SHOW_500 !== '0') console.log(`    [${res.status} ${method} ${p}] ` + (res.text_.match(/<pre[^>]*>([\s\S]*?)<\/pre>/)?.[1] ?? res.text_.slice(0, 300)).slice(0, 800));
    return res;
  }
}
const hidden = (html, name) => (html.match(new RegExp(`name="${name}" value="([^"]*)"`)) ?? [])[1];
// hidden field inside the form that posts to `action`
const formHidden = (html, action, name) => { const i = html.indexOf(`action="${action}"`); return i < 0 ? undefined : hidden(html.slice(i, html.indexOf('</form>', i)), name); };
const loc = (r) => decodeURIComponent((r.headers.get('location') ?? '').replace(/\+/g, ' '));

// ───────── TOTP (RFC 6238) for the MFA test ─────────
function b32decode(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, val = 0; const out = [];
  for (const c of s.replace(/\s/g, '')) { val = (val << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totp(secret, t = Date.now()) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const mac = crypto.createHmac('sha1', b32decode(secret)).update(buf).digest();
  const o = mac[mac.length - 1] & 15;
  return String(((mac.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}

// ───────── process management ─────────
function startWorker(port, extraVars, logName) {
  const secrets = { AUTH_PEPPER: rand(), TOKEN_SECRET: rand() };
  const vars = { ENVIRONMENT: 'development', PUBLIC_BASE_URL: `http://127.0.0.1:${port}`, DEV_DB_METRICS: '1', RESEND_API_KEY: 're_test_local_dummy', RESEND_API_BASE: `http://127.0.0.1:${MOCK_PORT}`, ...secrets, ...extraVars };
  const args = ['wrangler', 'dev', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', STATE, '--test-scheduled', '--show-interactive-dev-session=false', '--inspector-port', String(port + 1000)];
  for (const [k, v] of Object.entries(vars)) args.push('--var', `${k}:${v}`);
  const log = fs.openSync(path.join(STATE, `${logName}.log`), 'w');
  const p = spawn('npx', args, { cwd: ROOT, stdio: ['ignore', log, log], detached: true });
  procs.push(p);
  return { p, secrets };
}
async function waitReady(base) {
  for (let i = 0; i < 90; i++) { try { const r = await fetch(base + '/robots.txt'); if (r.ok) return true; } catch {} await sleep(1000); }
  throw new Error('worker did not start: ' + base);
}
function cleanup() { for (const p of procs) { try { process.kill(-p.pid, 'SIGTERM'); } catch {} } mock.close(); }
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

const dbStats = async (reset = false) => (await fetch(`${BASE}/__dev/db-stats${reset ? '?reset=1' : ''}`)).json();

// ════════════════════════════════════════════════════════════════════
async function main() {
  fs.rmSync(STATE, { recursive: true, force: true });
  fs.mkdirSync(STATE, { recursive: true });
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', STATE], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => mock.listen(MOCK_PORT, '127.0.0.1', r));
  startWorker(PORT, {}, 'worker');
  await waitReady(BASE);
  const anon = new Client();

  // ───────────────────────────── Public site ─────────────────────────────
  group('Public website');
  const pagesToCheck = ['/', '/history', '/timeline', '/figures', '/philosophy', '/principles', '/symbols', '/covenant', '/leadership', '/membership', '/apply', '/application-guide', '/publications', '/announcements', '/archive', '/faq', '/contact', '/report', '/privacy', '/terms', '/data-protection', '/code-of-conduct', '/governance'];
  for (const p of pagesToCheck) {
    const r = await anon.req(p);
    check(`GET ${p} → 200 with title`, r.status === 200 && /<title>[^<]+<\/title>/.test(r.text_), r.status);
  }
  const home = await anon.req('/');
  check('homepage has hero, tagline, apply + history buttons', /Eternal Illuminati Covenant/.test(home.text_) && /Knowledge\. Enlightenment\. Legacy\./.test(home.text_) && /href="\/apply"/.test(home.text_) && /href="\/history"/.test(home.text_));
  check('homepage independence statement in footer', /claims no historical continuity/.test(home.text_));
  check('meta description, canonical, hreflang, Open Graph and JSON-LD present', /<meta name="description"/.test(home.text_) && /rel="canonical"/.test(home.text_) && /hreflang="fr"/.test(home.text_) && /property="og:image"/.test(home.text_) && /application\/ld\+json/.test(home.text_));
  check('security headers (CSP, nosniff, frame options, referrer policy)', home.headers.get('content-security-policy')?.includes("default-src 'self'") && home.headers.get('x-content-type-options') === 'nosniff' && !!home.headers.get('x-frame-options') && !!home.headers.get('referrer-policy'));
  const fr = await anon.req('/fr');
  check('French homepage: lang="fr" and translated hero', fr.status === 200 && /<html lang="fr"/.test(fr.text_) && /Savoir\. Lumières\. Héritage\./.test(fr.text_));
  const frLegal = await anon.req('/fr/privacy');
  check('Untranslated legal page in FR shows English with a notice (no machine translation)', frLegal.status === 200 && /pas encore disponible dans votre langue/.test(frLegal.text_));
  for (const p of ['/timeline/founding-of-the-order', '/figures/adam-weishaupt', '/publications/ingolstadt-1776', '/announcements/welcome-to-our-website', '/archive/einige-originalschriften-1787', '/principles/integrity-and-responsibility', '/symbols/eye-of-providence']) {
    const r = await anon.req(p);
    check(`detail ${p} → 200`, r.status === 200, r.status);
  }
  check('timeline detail shows sources section', /Sources &amp; references|Sources & references/.test((await anon.req('/timeline/founding-of-the-order')).text_));
  check('legend entry carries a certainty label', /Tradition \/ legend/.test((await anon.req('/timeline/the-courier-and-the-lightning')).text_));
  check('announcement under /publications redirects to /announcements', (await anon.req('/publications/welcome-to-our-website')).status === 301);
  check('unknown page → 404', (await anon.req('/does-not-exist')).status === 404);
  check('unknown detail slug → 404', (await anon.req('/figures/nobody')).status === 404);
  const search = await anon.req('/search?q=weishaupt');
  check('search finds results (served from snapshot)', search.status === 200 && /results for/.test(search.text_) && /adam-weishaupt/.test(search.text_));
  const robots = await anon.req('/robots.txt');
  check('robots.txt blocks query strings, search, apply links and admin', /Disallow: \/\*\?/.test(robots.text_) && /Disallow: \/search/.test(robots.text_) && /Disallow: \/fr\/search/.test(robots.text_) && /Disallow: \/admin/.test(robots.text_) && /Sitemap:/.test(robots.text_));
  const sm = await anon.req('/sitemap.xml');
  check('sitemap lists pages, details and FR alternates', sm.status === 200 && /<loc>http:\/\/127\.0\.0\.1:8787\/history<\/loc>/.test(sm.text_) && /\/figures\/adam-weishaupt/.test(sm.text_) && /hreflang="fr"/.test(sm.text_));
  const css = await fetch(BASE + '/assets/site.css');
  check('static assets served', css.ok && (await css.text()).includes('--obsidian'));
  check('hidden placeholder sections are NOT public', !/To be completed by the Covenant/.test((await anon.req('/covenant')).text_));

  // ───────────────────────────── Setup & authentication ─────────────────────────────
  group('Admin setup & authentication');
  const admin = new Client();
  let r = await admin.req('/admin');
  check('/admin redirects to login when signed out', r.status === 303 && /\/admin\/login/.test(r.headers.get('location')));
  r = await admin.req('/admin/login');
  check('login redirects to setup while no users exist', r.status === 303 && r.headers.get('location') === '/admin/setup');
  r = await admin.req('/admin/setup');
  check('setup form shown while users table is empty', r.status === 200 && /Create the owner account/.test(r.text_));
  const ownerEmail = 'owner@example.com';
  const ownerPass = 'Test-' + rand(10);
  r = await admin.req('/admin/setup', { method: 'POST', form: { display_name: 'Owner', email: ownerEmail, password: ownerPass, confirm: ownerPass }, origin: false });
  check('setup POST without Origin is rejected (same-origin check)', r.status === 403);
  r = await admin.req('/admin/setup', { method: 'POST', form: { display_name: 'Owner', email: ownerEmail, password: 'short', confirm: 'short' } });
  check('setup enforces minimum password length', r.status === 400 && /at least 12/.test(r.text_));
  r = await admin.req('/admin/setup', { method: 'POST', form: { display_name: 'Owner', email: ownerEmail, password: ownerPass, confirm: ownerPass } });
  check('owner account created', r.status === 303);
  r = await admin.req('/admin/setup');
  check('setup refuses once an owner exists', r.status === 403);
  r = await admin.req('/admin/setup', { method: 'POST', form: { display_name: 'X', email: 'x@example.com', password: ownerPass, confirm: ownerPass } });
  check('setup POST refused once an owner exists', r.status === 403);
  r = await admin.req('/admin/login', { method: 'POST', form: { email: ownerEmail, password: 'wrong-password-123' } });
  check('wrong password rejected with generic message', r.status === 401 && /Incorrect email or password/.test(r.text_));
  r = await admin.req('/admin/login', { method: 'POST', form: { email: ownerEmail, password: ownerPass } });
  const sc = admin.lastSetCookie.join('\n');
  check('login succeeds and redirects to dashboard', r.status === 303 && r.headers.get('location') === '/admin');
  check('session cookie is __Host-, HttpOnly, Secure, SameSite=Strict', /__Host-eic_admin=/.test(sc) && /HttpOnly/i.test(sc) && /Secure/i.test(sc) && /SameSite=Strict/i.test(sc));
  r = await admin.req('/admin');
  check('dashboard loads with real statistics', r.status === 200 && /Total applications/.test(r.text_) && /Quick actions/.test(r.text_));
  check('admin responses are no-store + noindex', r.headers.get('cache-control') === 'no-store' && /noindex/.test(r.headers.get('x-robots-tag') ?? ''));
  r = await admin.req('/admin/settings', { method: 'POST', form: { siteName: 'Hacked' }, origin: false, headers: { origin: 'https://evil.example' } });
  check('cross-origin admin write blocked', r.status === 403);

  // ───────────────────────────── CMS ─────────────────────────────
  group('CMS: visual page editor, drafts, preview, publish, revisions');
  r = await admin.req('/admin/pages/by-slug/home');
  const homeEditor = r.headers.get('location');
  r = await admin.req(homeEditor);
  const firstSection = (r.text_.match(/href="(\/admin\/pages\/\d+\/sections\/[^"]+)"/) ?? [])[1];
  check('page overview lists sections', !!firstSection && /Step 2/.test(r.text_));
  r = await admin.req(firstSection);
  check('section editor shows content, photo, background and button fields', /Step 3/.test(r.text_) && /Background photograph/.test(r.text_) && /Background &amp; layout|Background & layout/.test(r.text_) && /data-repeater/.test(r.text_));
  const newHeading = 'Edited Heading ' + rand(3);
  const sectionForm = { locale: 'en', 'loc[eyebrow]': 'Edited eyebrow', 'loc[heading]': newHeading, 'loc[subheading]': 'Knowledge. Enlightenment. Legacy.', 'loc[body]': 'Body text', 'loc[buttons][0][label]': 'Apply now', 'loc[buttons][0][href]': '/apply', 'loc[buttons][0][style]': 'primary', 'loc[buttons][1][label]': 'Bad', 'loc[buttons][1][href]': 'javascript:alert(1)', 'shared[height]': 'full', 'shared[image]': '', 'settings[background]': 'obsidian', visible: '1' };
  r = await admin.req(firstSection, { method: 'POST', form: sectionForm, headers: { 'x-autosave': '1' } });
  check('autosave returns JSON', r.status === 200 && /"ok":true/.test(r.text_));
  check('draft is NOT visible on the public site yet', !(await anon.req('/')).text_.includes(newHeading));
  const pageId = homeEditor.split('/').pop();
  r = await admin.req(`/admin/pages/${pageId}/preview`);
  check('preview shows the draft', r.status === 200 && r.text_.includes(newHeading) && /Preview — unpublished draft/.test(r.text_));
  check('unsafe javascript: link stripped from buttons', !r.text_.includes('javascript:alert'));
  r = await admin.req(`/admin/pages/${pageId}/devices`);
  check('mobile/tablet/desktop preview page', /data-device="390"/.test(r.text_) && /data-device="768"/.test(r.text_) && /data-device="1280"/.test(r.text_));
  r = await admin.req(`/admin/pages/${pageId}/publish`, { method: 'POST', form: {} });
  check('publish succeeds', r.status === 303 && /Published/.test(loc(r)));
  check('published change visible publicly immediately (snapshot rebuilt)', (await anon.req('/')).text_.includes(newHeading));
  r = await admin.req(`/admin/pages/${pageId}/revisions`);
  const restore = (r.text_.match(/action="(\/admin\/pages\/\d+\/revisions\/\d+\/restore)"/) ?? [])[1];
  check('revision recorded on publish', !!restore);
  await admin.req(restore, { method: 'POST', form: {} });
  await admin.req(`/admin/pages/${pageId}/publish`, { method: 'POST', form: {} });
  check('restoring the previous revision and publishing reverts the page', !(await anon.req('/')).text_.includes(newHeading) && /Eternal Illuminati Covenant/.test((await anon.req('/')).text_));
  r = await admin.req(`/admin/pages/${pageId}/sections/add`, { method: 'POST', form: { type: 'quote', position: 'end' } });
  r = await admin.req(homeEditor);
  check('section can be added to the draft', /Quotation/.test(r.text_));
  await admin.req(`/admin/pages/${pageId}/discard`, { method: 'POST', form: {} });
  check('discarding the draft removes unpublished changes', !/Unpublished changes/.test((await admin.req(homeEditor)).text_));

  // ───────────────────────────── Membership application ─────────────────────────────
  group('Membership application, emails & review');
  sent.length = 0;
  let apply = await anon.req('/apply');
  const ft = hidden(apply.text_, '_ft');
  const token = hidden(apply.text_, 'submission_token');
  check('form has signed timer, submission token, honeypot and 4 steps', !!ft && !!token && /name="website"/.test(apply.text_) && /data-step="4"/.test(apply.text_));
  check('country list is localised', /<option value="FR">France<\/option>/.test(apply.text_));
  const applicant = 'applicant.' + rand(3) + '@example.com';
  const appForm = (extra = {}) => ({ _ft: ft, submission_token: token, website: '', full_name: 'Ada Applicant', email: applicant, country: 'FR', phone: '', age_confirmation: 'yes', occupation: 'Historian', experience: 'Archives work', education: '', interests: 'Enlightenment', motivation: 'To study', understanding: 'A modern society', contribution: 'Research notes', additional: '', referral: 'search', consent: 'yes', terms: 'yes', _action: 'submit', ...extra });
  r = await anon.req('/apply', { method: 'POST', form: appForm() });
  check('submitting instantly is rejected by the timer', r.status === 400 && /quick/i.test(r.text_));
  await sleep(4200);
  r = await anon.req('/apply', { method: 'POST', form: appForm({ website: 'http://spam' }) });
  check('honeypot rejects bots', r.status === 400);
  r = await anon.req('/apply', { method: 'POST', form: appForm({ motivation: '', consent: '' }) });
  check('server-side validation reports missing fields', r.status === 400 && /This field is required/.test(r.text_));
  r = await anon.req('/apply', { method: 'POST', form: appForm() });
  check('valid application accepted with confirmation screen', r.status === 200 && /Application received/.test(r.text_));
  const verifyMail = await waitEmail((e) => e.to[0] === applicant && /Confirm your email/.test(e.subject));
  check('verification email sent to applicant', !!verifyMail);
  check('email From/Reply-To/API key/idempotency key correct', verifyMail?.from === 'Eternal Illuminati Covenant <noreply@yourdomain.com>' && verifyMail?.reply_to === 'support@yourdomain.com' && verifyMail?._auth === 'Bearer re_test_local_dummy' && !!verifyMail?._idem);
  check('email is branded HTML with absolute logo URL and text alternative', /<img src="http:\/\/127\.0\.0\.1:8787\/assets\/logo-email\.png"/.test(verifyMail?.html ?? '') && /#B89554/.test(verifyMail?.html ?? '') && verifyMail?.text?.length > 50);
  const ref = (verifyMail?.subject.match(/EIC-\d{4}-[A-Z0-9]{6}/) ?? [])[0];
  check('reference number generated', !!ref);
  r = await anon.req('/apply', { method: 'POST', form: appForm() });
  await sleep(1500);
  check('double submission (same token) creates nothing and sends nothing new', r.status === 200 && sent.filter((e) => e.to[0] === applicant).length === 1);
  const confirmLink = linkIn(verifyMail, /http:\/\/127\.0\.0\.1:8787\/apply\/confirm\/[A-Za-z0-9_-]+/);
  r = await anon.req(confirmLink.replace(BASE, ''));
  check('confirm link GET shows a button (scanners cannot trigger it)', r.status === 200 && /<form method="post"/.test(r.text_));
  r = await anon.req(confirmLink.replace(BASE, ''), { method: 'POST', form: {} });
  check('email confirmed', r.status === 200 && /is now in the review queue/.test(r.text_));
  check('confirmation link is single-use', (await anon.req(confirmLink.replace(BASE, ''), { method: 'POST', form: {} })).status === 410);
  const received = await waitEmail((e) => e.to[0] === applicant && /Application received/.test(e.subject));
  const adminNew = await waitEmail((e) => e.to[0] === ADMIN_NOTIFY && /New application/.test(e.subject));
  check('applicant receives "application received" email', !!received);
  check('admin notification sent to support@ with admin link', !!adminNew && /\/admin\/applications\/\d+/.test(adminNew.html));
  // duplicate email, new token
  apply = await anon.req('/apply');
  await sleep(4200);
  r = await anon.req('/apply', { method: 'POST', form: appForm({ _ft: hidden(apply.text_, '_ft'), submission_token: hidden(apply.text_, 'submission_token') }) });
  const dupMail = await waitEmail((e) => e.to[0] === applicant && /already have an application/.test(e.subject));
  check('second application for same email: identical response, owner notified by email (no enumeration)', r.status === 200 && /Application received/.test(r.text_) && !!dupMail);
  // save and resume
  apply = await anon.req('/apply');
  await sleep(1200);
  const resumeEmail = 'resume.' + rand(3) + '@example.com';
  r = await anon.req('/apply', { method: 'POST', form: { _ft: hidden(apply.text_, '_ft'), submission_token: hidden(apply.text_, 'submission_token'), website: '', full_name: 'Rita Resume', email: resumeEmail, occupation: 'Teacher', _action: 'save' } });
  const resumeMail = await waitEmail((e) => e.to[0] === resumeEmail && /Continue your/.test(e.subject));
  check('save-and-continue emails a time-limited link', r.status === 200 && !!resumeMail);
  r = await anon.req(linkIn(resumeMail, /http:\/\/127\.0\.0\.1:8787\/apply\/resume\/[A-Za-z0-9_-]+/).replace(BASE, ''));
  check('resume link restores saved answers', r.status === 200 && /value="Rita Resume"/.test(r.text_) && /value="Teacher"/.test(r.text_));
  // admin review
  r = await admin.req('/admin/applications');
  const appPath = (r.text_.match(/href="(\/admin\/applications\/\d+)"/) ?? [])[1];
  check('application listed in admin', !!appPath && r.text_.includes('Ada Applicant'));
  check('admin search finds by reference', (await admin.req('/admin/applications?q=' + ref)).text_.includes('Ada Applicant'));
  r = await admin.req(appPath);
  check('application detail shows answers, history and actions', /Archives work/.test(r.text_) && /Decision history/.test(r.text_) && /Internal notes/.test(r.text_));
  r = await admin.req(appPath + '/note', { method: 'POST', form: { body: 'Promising applicant' } });
  check('internal note added', /Promising applicant/.test((await admin.req(appPath)).text_));
  r = await admin.req(appPath + '/status', { method: 'POST', form: { status: 'INFORMATION_REQUESTED', message: '', notify: '1' } });
  check('information request requires a message', /describe the information/.test(loc(r)));
  r = await admin.req(appPath + '/status', { method: 'POST', form: { status: 'INFORMATION_REQUESTED', message: 'Please describe your research interests.', notify: '1' } });
  check('information request email sent', !!(await waitEmail((e) => e.to[0] === applicant && /Additional information requested/.test(e.subject) && /research interests/.test(e.html))));
  r = await admin.req(appPath + '/message', { method: 'POST', form: { subject: 'Hello from the review team', message: 'A personal message.' } });
  check('admin can email the applicant (correspondence)', !!(await waitEmail((e) => e.to[0] === applicant && e.subject === 'Hello from the review team')));
  r = await admin.req(appPath + '/status', { method: 'POST', form: { status: 'ACCEPTED', message: 'Welcome aboard.', notify: '1' } });
  check('acceptance email sent', !!(await waitEmail((e) => e.to[0] === applicant && /has been accepted/.test(e.subject))));
  r = await admin.req(appPath);
  check('decision history and correspondence recorded', /information requested/i.test(r.text_) && /Accepted/.test(r.text_) && /Hello from the review team/.test(r.text_));
  r = await admin.req('/admin/applications?format=csv');
  check('CSV export', r.status === 200 && /text\/csv/.test(r.headers.get('content-type')) && r.text_.includes(ref));
  // applicant message & withdrawal (another applicant)
  const contactPage = await anon.req('/contact');
  await sleep(2700);
  r = await anon.req('/apply/message', { method: 'POST', form: { _ft: formHidden(contactPage.text_, '/apply/message', '_ft'), website: '', reference: ref, email: applicant, message: 'A question about my application.' } });
  const msgConfirm = await waitEmail((e) => e.to[0] === applicant && /Confirm your message/.test(e.subject));
  check('applicant message requires email confirmation', r.status === 200 && !!msgConfirm);
  r = await anon.req('/apply/message', { method: 'POST', form: { _ft: formHidden(contactPage.text_, '/apply/message', '_ft'), website: '', reference: 'EIC-2026-ZZZZZZ', email: applicant, message: 'probe' } });
  check('wrong reference gets the identical response (no data exposed)', r.status === 200 && /If the reference and email match/.test(r.text_));
  const ml = linkIn(msgConfirm, /http:\/\/127\.0\.0\.1:8787\/apply\/confirm\/[A-Za-z0-9_-]+/).replace(BASE, '');
  await anon.req(ml, { method: 'POST', form: {} });
  check('confirmed applicant message notifies admins', !!(await waitEmail((e) => e.to[0] === ADMIN_NOTIFY && /Applicant message/.test(e.subject))));
  check('message appears in correspondence history', /A question about my application/.test((await admin.req(appPath)).text_));

  // ───────────────────────────── Contact, report, email reliability ─────────────────────────────
  group('Contact & report forms, email failure handling');
  const cp = await anon.req('/contact');
  await sleep(2700);
  failNext = 6; // Resend outage: both client and admin emails fail (3 attempts each)
  r = await anon.req('/contact', { method: 'POST', form: { _ft: hidden(cp.text_, '_ft'), website: '', name: 'Carl Contact', email: 'carl@example.com', subject: 'Archive question', message: 'Hello' } });
  check('contact form succeeds even while the email provider is down', r.status === 200 && /Thank you/.test(r.text_));
  await sleep(6500);
  r = await admin.req('/admin/emails/logs?status=failed');
  const failedId = (r.text_.match(/action="\/admin\/emails\/logs\/(\d+)\/retry"/) ?? [])[1];
  check('failed delivery recorded in the delivery log', !!failedId);
  failNext = 0;
  r = await admin.req(`/admin/emails/logs/${failedId}/retry`, { method: 'POST', form: {} });
  check('failed email can be retried and is then sent', /Email sent/.test(loc(r)));
  check('contact submission visible in admin inbox', /Archive question/.test((await admin.req('/admin/inbox')).text_));
  const rp = await anon.req('/report');
  await sleep(2700);
  r = await anon.req('/report', { method: 'POST', form: { _ft: hidden(rp.text_, '_ft'), website: '', name: 'Rae', email: 'rae@example.com', subject: 'Scam claiming to be you', page_url: '', message: 'Someone asked me for money.' } });
  check('report confirmation to sender + admin notification', r.status === 200 && !!(await waitEmail((e) => e.to[0] === 'rae@example.com')) && !!(await waitEmail((e) => e.to[0] === ADMIN_NOTIFY && /Scam claiming/.test(e.subject))));
  r = await admin.req('/admin/emails/templates/application_received/fr');
  check('email template editor with live preview', r.status === 200 && /srcdoc=/.test(r.text_));

  // ───────────────────────────── Media ─────────────────────────────
  group('Media library');
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
  let fd = new FormData();
  fd.append('file', new Blob([png], { type: 'image/png' }), 'pixel.png');
  fd.append('variant_480', new Blob([png], { type: 'image/png' }), 'v480.png');
  fd.append('width', '1'); fd.append('height', '1'); fd.append('category', 'general'); fd.append('title', 'Test pixel');
  r = await admin.req('/admin/media/upload', { method: 'POST', multipart: fd });
  const up = JSON.parse(r.text_ || '{}');
  check('image upload accepted (with optimised variant)', r.status === 200 && up.ok && /^\/media\//.test(up.url));
  const mediaRes = await fetch(BASE + up.url);
  check('uploaded file served publicly with immutable caching', mediaRes.ok && mediaRes.headers.get('content-type') === 'image/png' && /immutable/.test(mediaRes.headers.get('cache-control') ?? ''));
  fd = new FormData();
  fd.append('file', new Blob(['<svg onload="alert(1)"></svg>'], { type: 'image/svg+xml' }), 'x.svg');
  r = await admin.req('/admin/media/upload', { method: 'POST', multipart: fd });
  check('SVG / unknown file types rejected by magic-byte check', r.status === 400);
  check('private application documents are not reachable via /media', (await fetch(BASE + '/media/../private/x')).status === 404);
  r = await admin.req(`/admin/media/${up.id}/delete`, { method: 'POST', form: {} });
  check('unused media can be deleted', /deleted/.test(loc(r)) && (await fetch(BASE + up.url + '?x')).status !== 200);

  // ───────────────────────────── Articles & scheduling ─────────────────────────────
  group('Publications, scheduling & cron');
  const future = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 16);
  r = await admin.req('/admin/content/articles', { method: 'POST', form: { title: 'Scheduled essay', slug: '', excerpt: 'Soon', body: 'Body', status: 'scheduled', publish_at: future, locale: 'en', category_id: '1' } });
  const artPath = r.headers.get('location')?.split('?')[0];
  check('scheduled article created', r.status === 303 && /\/admin\/content\/articles\/\d+/.test(artPath));
  check('scheduled article not public before its time', (await anon.req('/publications/scheduled-essay')).status === 404);
  check('article preview works for unpublished articles', /Scheduled essay/.test((await admin.req(artPath + '/preview')).text_));
  r = await admin.req('/admin/content/articles', { method: 'POST', form: { title: 'Published essay', excerpt: 'Now', body: '## Heading\n\nText with **bold**.', status: 'published', locale: 'en', category_id: '2', tags: 'method, sources', featured: '1' } });
  check('published article visible immediately', /Published essay/.test((await anon.req('/publications')).text_) && (await anon.req('/publications/published-essay')).status === 200);
  check('markdown rendered safely', /<h2>Heading<\/h2>/.test((await anon.req('/publications/published-essay')).text_));
  // force the scheduled article to be due, then run the cron
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', STATE, '--command', `UPDATE articles SET publish_at = ${Date.now() - 60000} WHERE slug = 'scheduled-essay'`], { cwd: ROOT, stdio: 'ignore' });
  await admin.req('/admin/settings/rebuild-cache', { method: 'POST', form: {} });
  r = await fetch(`${BASE}/__scheduled?cron=${encodeURIComponent('*/5 * * * *')}`);
  await sleep(1500);
  check('cron publishes due scheduled articles', (await anon.req('/publications/scheduled-essay')).status === 200 && /Published|published/.test((await admin.req('/admin/content/articles?status=published')).text_) && (await admin.req('/admin/content/articles?status=published')).text_.includes('Scheduled essay'));
  check('notification centre received the publication notice', /Scheduled article published/.test((await admin.req('/admin/notifications')).text_));
  const tv1 = execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', STATE, '--json', '--command', "SELECT changed_at FROM timer_values WHERE key='scheduler'"], { cwd: ROOT }).toString();
  await fetch(`${BASE}/__scheduled?cron=${encodeURIComponent('*/5 * * * *')}`);
  await sleep(1000);
  const tv2 = execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', STATE, '--json', '--command', "SELECT changed_at FROM timer_values WHERE key='scheduler'"], { cwd: ROOT }).toString();
  check('timer job writes its DB row only when the value changes', JSON.parse(tv1)[0].results[0]?.changed_at === JSON.parse(tv2)[0].results[0]?.changed_at);
  r = await admin.req('/admin/content/events', { method: 'POST', form: { title: 'Test event', date_label: '1790', year: '1790', summary: 'A test', status: 'published', certainty: 'disputed' } });
  check('timeline event created via admin and visible', /Test event/.test((await anon.req('/timeline')).text_));

  // ───────────────────────────── Roles & invitations ─────────────────────────────
  group('Roles, invitations & permissions');
  sent.length = 0;
  r = await admin.req('/admin/users', { method: 'POST', form: { display_name: 'Rev Reviewer', email: 'reviewer@example.com', role: 'reviewer' } });
  const invite = await waitEmail((e) => e.to[0] === 'reviewer@example.com' && /invited/.test(e.subject));
  check('invitation emailed to the new administrator', !!invite);
  const inviteLink = linkIn(invite, /http:\/\/127\.0\.0\.1:8787\/admin\/reset\/[A-Za-z0-9_-]+/).replace(BASE, '');
  const revPass = 'Rev-' + rand(10);
  const rev = new Client();
  r = await rev.req(inviteLink, { method: 'POST', form: { password: revPass, confirm: revPass } });
  check('invitee sets own password', r.status === 303);
  check('invite link is single-use', (await rev.req(inviteLink)).status === 410);
  await rev.req('/admin/login', { method: 'POST', form: { email: 'reviewer@example.com', password: revPass } });
  check('reviewer can sign in', (await rev.req('/admin')).status === 200);
  check('reviewer cannot edit pages (403)', (await rev.req('/admin/pages')).status === 403);
  check('reviewer cannot manage users (403)', (await rev.req('/admin/users')).status === 403);
  check('reviewer cannot read unassigned applications', (await rev.req(appPath)).status === 404);
  await admin.req(appPath + '/assign', { method: 'POST', form: { user_id: '2' } });
  check('reviewer can read an application once assigned', (await rev.req(appPath)).status === 200);
  check('reviewer cannot export CSV', (await rev.req('/admin/applications?format=csv')).status === 403);

  // ───────────────────────────── MFA & password change ─────────────────────────────
  group('MFA & password change');
  r = await admin.req('/admin/account?mfa=setup');
  const secret = hidden(r.text_, 'secret'), sig = hidden(r.text_, 'sig');
  r = await admin.req('/admin/account/mfa/enable', { method: 'POST', form: { secret, sig, code: totp(secret) } });
  check('TOTP MFA enabled', /now on/.test(loc(r)));
  await admin.req('/admin/logout', { method: 'POST', form: {} });
  check('logout ends the session', (await admin.req('/admin')).status === 303);
  r = await admin.req('/admin/login', { method: 'POST', form: { email: ownerEmail, password: ownerPass } });
  check('login with MFA asks for a code', /\/admin\/login\/mfa/.test(r.headers.get('location')));
  check('MFA-pending session cannot reach the dashboard', /mfa/.test((await admin.req('/admin')).headers.get('location') ?? ''));
  r = await admin.req('/admin/login/mfa', { method: 'POST', form: { code: '000000' } });
  check('wrong MFA code rejected', r.status === 401);
  r = await admin.req('/admin/login/mfa', { method: 'POST', form: { code: totp(secret) } });
  check('correct MFA code completes sign-in', r.status === 303 && (await admin.req('/admin')).status === 200);
  const newPass = 'New-' + rand(10);
  r = await admin.req('/admin/account/password', { method: 'POST', form: { current: 'nope-nope-nope', password: newPass, confirm: newPass } });
  check('password change requires the current password', /incorrect/.test(loc(r)));
  r = await admin.req('/admin/account/password', { method: 'POST', form: { current: ownerPass, password: 'short', confirm: 'short' } });
  check('password change enforces minimum length', /at least 12/.test(loc(r)));
  r = await admin.req('/admin/account/password', { method: 'POST', form: { current: ownerPass, password: newPass, confirm: newPass } });
  check('password changed', /Password changed/.test(loc(r)));

  // ───────────────────────────── Backups ─────────────────────────────
  group('Backups & restore');
  r = await admin.req('/admin/backups', { method: 'POST', form: {} });
  r = await admin.req('/admin/backups');
  const dl = (r.text_.match(/href="(\/admin\/backups\/download\?key=[^"]+)"/) ?? [])[1]?.replace(/&amp;/g, '&');
  const dump = await admin.req(dl);
  check('backup created and downloadable by super admin', dump.status === 200 && /INSERT INTO applications/.test(dump.text_));
  check('backup download forbidden to reviewers', (await rev.req(dl)).status === 403);
  const restoreDir = path.join(STATE, 'restore');
  fs.writeFileSync(path.join(STATE, 'backup.sql'), dump.text_);
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', restoreDir], { cwd: ROOT, stdio: 'ignore' });
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', restoreDir, '--command', 'DELETE FROM page_sections; DELETE FROM navigation_items; DELETE FROM pages; DELETE FROM media_assets; DELETE FROM site_settings; DELETE FROM historical_events; DELETE FROM historical_figures; DELETE FROM historical_archives; DELETE FROM principles; DELETE FROM symbols; DELETE FROM faqs; DELETE FROM articles; DELETE FROM article_categories; DELETE FROM application_fields;'], { cwd: ROOT, stdio: 'ignore' });
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', restoreDir, '--file', path.join(STATE, 'backup.sql')], { cwd: ROOT, stdio: 'ignore' });
  const count = (dir, t) => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', dir, '--json', '--command', `SELECT COUNT(*) AS n FROM ${t}`], { cwd: ROOT }).toString())[0].results[0].n;
  const tables = ['applications', 'articles', 'page_sections', 'users', 'application_events', 'email_logs'];
  const same = tables.every((t) => count(STATE, t) === count(restoreDir, t));
  check(`restore into a fresh database reproduces row counts (${tables.join(', ')})`, same);

  // ───────────────────────────── Read-model acceptance ─────────────────────────────
  group('Snapshot read-model: crawl cost & database outage');
  await dbStats(true);
  const crawl = await crawlSite(BASE, 3000);
  const stats = await dbStats();
  check(`crawled ${crawl.requests} public URLs with no 5xx`, crawl.errors5xx === 0, JSON.stringify(crawl.bad.slice(0, 5)));
  check(`D1 rows read during the crawl stay tiny (${stats.rowsRead} rows / ${stats.queries} queries for ${crawl.requests} requests)`, stats.rowsRead <= crawl.detailPages + 5, JSON.stringify(stats));
  check('crawler requests did not write view counters', stats.rowsWritten === 0, stats.rowsWritten);
  // A second worker sharing the same R2/D1 files, but with the database "down"
  startWorker(PORT_DOWN, { DEV_SIMULATE_DB_DOWN: '1' }, 'worker-db-down');
  await waitReady(`http://127.0.0.1:${PORT_DOWN}`);
  const down = new Client(`http://127.0.0.1:${PORT_DOWN}`);
  const downCrawl = await crawlSite(`http://127.0.0.1:${PORT_DOWN}`, 400);
  check(`database down: ${downCrawl.requests} public pages still served from the last good snapshot, no 5xx`, downCrawl.errors5xx === 0 && downCrawl.requests > 50, JSON.stringify(downCrawl.bad.slice(0, 5)));
  r = await down.req('/figures/adam-weishaupt');
  check('database down: detail page falls back to the snapshot row', r.status === 200 && /Adam Weishaupt/.test(r.text_));
  const dc = await down.req('/contact');
  await sleep(2700);
  r = await down.req('/contact', { method: 'POST', form: { _ft: hidden(dc.text_, '_ft'), website: '', name: 'Xavier', email: 'x@example.com', subject: 'Outage test', message: 'Is anyone there?' } });
  check('database down: writes fail (form returns an error, not a fake success)', r.status >= 500, r.status + ' ' + (r.text_.match(/class="alert[^"]*"[^>]*>([^<]+)/) ?? [])[1]);

  // ───────────────────────────── Brute-force protection ─────────────────────────────
  group('Rate limiting & lockout');
  const bf = new Client();
  for (let i = 0; i < 5; i++) await bf.req('/admin/login', { method: 'POST', form: { email: 'reviewer@example.com', password: 'wrong-' + i + '-xxxxxx' } });
  r = await bf.req('/admin/login', { method: 'POST', form: { email: 'reviewer@example.com', password: revPass } });
  check('account locked after 5 failed attempts (even with the right password)', r.status === 423);
  check('lockout raised a security notification', /Account locked/.test((await admin.req('/admin/notifications')).text_));
  for (let i = 0; i < 6; i++) await bf.req('/admin/login', { method: 'POST', form: { email: `nobody${i}@example.com`, password: 'wrong-password-xx' } });
  r = await bf.req('/admin/login', { method: 'POST', form: { email: 'nobody@example.com', password: 'wrong-password-xx' } });
  check('per-IP limit blocks further attempts after 10 failures', r.status === 429);

  // ───────────────────────────── Documented lock-out recovery ─────────────────────────────
  group('Lock-out recovery (DEPLOY.md §7)');
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', STATE, '--command', 'DELETE FROM sessions; DELETE FROM auth_tokens; DELETE FROM users;'], { cwd: ROOT, stdio: 'ignore' });
  check('after deleting users + sessions, old sessions no longer work', (await admin.req('/admin')).status === 303);
  r = await new Client().req('/admin/setup');
  check('setup route is available again', r.status === 200 && /Create the owner account/.test(r.text_));
  check('content and applications survive the recovery', count(STATE, 'applications') > 0 && count(STATE, 'articles') > 0 && (await anon.req('/history')).status === 200);

  // ───────────────────────────── Summary ─────────────────────────────
  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  fs.writeFileSync(path.join(STATE, 'results.json'), JSON.stringify(results, null, 1));
  cleanup();
  process.exit(failed.length ? 1 : 0);
}

// Crawl every internal link reachable from the homepage (both languages).
export async function crawlSite(base, max = 3000) {
  const seen = new Set(), queue = ['/', '/fr', '/sitemap.xml', '/robots.txt'];
  let requests = 0, errors5xx = 0, detailPages = 0;
  const bad = [];
  const ua = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
  while (queue.length && requests < max) {
    const batch = queue.splice(0, 8).filter((p) => !seen.has(p));
    batch.forEach((p) => seen.add(p));
    await Promise.all(batch.map(async (p) => {
      requests++;
      let res;
      for (let a = 0; a < 3 && !res; a++) {
        try { res = await fetch(base + p, { headers: { 'user-agent': ua }, redirect: 'manual' }); } catch (e) { if (a === 2) { errors5xx++; bad.push([p, String(e.cause?.code ?? e)]); return; } await sleep(200); }
      }
      if (res.status >= 500) { errors5xx++; bad.push([p, res.status]); }
      if (/^\/(fr\/)?(publications|announcements|timeline|figures|archive|leadership|principles|symbols)\/[a-z0-9-]+$/.test(p) && res.status === 200) detailPages++;
      const type = res.headers.get('content-type') ?? '';
      if (!/html|xml/.test(type)) return;
      const text = await res.text();
      const links = [...text.matchAll(/(?:href="|<loc>)(?:https?:\/\/127\.0\.0\.1:\d+)?(\/[^"<#?]*)/g)].map((m) => m[1]);
      for (const l of links) if (!seen.has(l) && !/^\/(admin|assets|media|__)/.test(l) && !queue.includes(l)) queue.push(l);
    }));
  }
  return { requests, errors5xx, detailPages, bad };
}

main().catch((e) => { console.error(e); cleanup(); process.exit(1); });
