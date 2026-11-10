// Browser QA: horizontal-overflow checks at common viewports, JS behaviour of the
// multi-step form and admin UI, and screenshots for visual review.
// Usage: node test/qa-browser.cjs <baseUrl> <screenshotDir>   (expects a fresh, set-up-able database)
const { chromium, devices } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const OUT = process.argv[3] || 'qa-shots';
fs.mkdirSync(OUT, { recursive: true });
const WIDTHS = [360, 390, 768, 1024, 1280, 1440];
const PUBLIC = ['/', '/history', '/timeline', '/figures/adam-weishaupt', '/philosophy', '/principles', '/symbols', '/covenant', '/membership', '/apply', '/publications', '/publications/ingolstadt-1776', '/archive', '/faq', '/contact', '/privacy', '/fr', '/search?q=minerva'];
const ADMIN = ['/admin', '/admin/applications', '/admin/pages', '/admin/pages/1', '/admin/pages/1/sections/seed-home-0', '/admin/content/articles', '/admin/content/events/1', '/admin/media', '/admin/emails', '/admin/reports', '/admin/settings', '/admin/users', '/admin/security', '/admin/notifications', '/admin/more', '/admin/account'];
const problems = [];
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) problems.push(msg); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|challenges\.cloudflare|cloudflareinsights/.test(m.text() + (m.location()?.url ?? ''))) consoleErrors.push(`${page.url()}: ${m.text()} ${m.location()?.url ?? ''}`); });
  page.on('pageerror', (e) => consoleErrors.push(`${page.url()}: ${e.message}`));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());

  async function overflowAt(paths, label) {
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const p of paths) {
        await page.goto(BASE + p, { waitUntil: 'load' });
        const over = await page.evaluate(() => {
          const doc = document.documentElement;
          if (doc.scrollWidth <= window.innerWidth + 1) return null;
          const wide = [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(el).position !== 'fixed').slice(0, 3).map((el) => el.tagName + '.' + el.className);
          return { sw: doc.scrollWidth, w: window.innerWidth, wide };
        });
        if (over) ok(false, `${label} ${p} @${w}px horizontal overflow ${JSON.stringify(over)}`);
      }
    }
    ok(true, `${label}: overflow checked on ${paths.length} pages × ${WIDTHS.length} widths`);
  }

  // Public pages
  await overflowAt(PUBLIC, 'public');
  for (const [w, h, name, p] of [[1440, 900, 'home-desktop', '/'], [390, 844, 'home-mobile', '/'], [1440, 900, 'history-desktop', '/history'], [390, 844, 'timeline-mobile', '/timeline'], [1440, 900, 'figure-desktop', '/figures/adam-weishaupt'], [390, 844, 'apply-mobile', '/apply']]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(BASE + p, { waitUntil: 'load' });
    await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((e) => e.classList.add('is-visible')));
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: name.includes('mobile') ? false : false });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((e) => e.classList.add('is-visible')));
  await page.screenshot({ path: `${OUT}/home-full.png`, fullPage: true });

  // Mobile nav
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.click('[data-nav-toggle]');
  ok(await page.isVisible('#site-nav .nav-list'), 'mobile menu opens');
  await page.click('.has-sub .sub-toggle');
  ok(await page.isVisible('.has-sub .sub.open a'), 'mobile submenu expands');
  await page.screenshot({ path: `${OUT}/nav-mobile.png` });
  await page.keyboard.press('Escape');

  // Timeline filter
  await page.goto(BASE + '/timeline', { waitUntil: 'load' });
  const before = await page.locator('.tl-item:visible').count();
  await page.click('[data-filter-group="timeline"] [data-filter]:nth-child(2)');
  const after = await page.locator('.tl-item:visible').count();
  ok(after > 0 && after < before, `timeline era filter works (${before} → ${after})`);

  // Multi-step application form (client side)
  await page.goto(BASE + '/apply', { waitUntil: 'load' });
  ok(await page.isVisible('[data-progress]'), 'progress indicator shown');
  ok((await page.locator('.step.active').getAttribute('data-step')) === '1', 'starts at step 1');
  await page.click('.step.active [data-next]');
  ok((await page.locator('.step.active').getAttribute('data-step')) === '1' && (await page.locator('.step.active .has-error').count()) > 0, 'cannot continue with empty required fields; errors shown');
  await page.fill('#f-full_name', 'Browser Tester');
  await page.fill('#f-email', 'browser.tester@example.com');
  await page.selectOption('#f-country', 'GB');
  await page.check('#f-age_confirmation');
  await page.click('.step.active [data-next]');
  ok((await page.locator('.step.active').getAttribute('data-step')) === '2', 'step 2 reached');
  await page.fill('#f-occupation', 'Librarian'); await page.fill('#f-experience', 'Rare books'); await page.fill('#f-interests', 'Kant');
  await page.click('.step.active [data-next]');
  await page.fill('#f-motivation', 'Curiosity'); await page.fill('#f-understanding', 'A study society'); await page.fill('#f-contribution', 'Cataloguing');
  await page.click('.step.active [data-next]');
  ok((await page.locator('.step.active').getAttribute('data-step')) === '4', 'review step reached');
  ok((await page.textContent('[data-review-body]')).includes('Librarian'), 'review summary lists answers');
  await page.screenshot({ path: `${OUT}/apply-review-mobile.png`, fullPage: true });
  await page.click('[data-review-body] .review-block:nth-child(2) button');
  ok((await page.locator('.step.active').getAttribute('data-step')) === '2', '"Edit" returns to the right step');
  await page.click('.step.active [data-next]'); await page.click('.step.active [data-next]');
  await page.check('input[name="consent"]'); await page.check('input[name="terms"]');
  await page.waitForTimeout(4200);
  await page.click('[data-submit]');
  await page.waitForLoadState('load');
  ok(/Application received/.test(await page.content()), 'application submitted from the browser');

  // Admin: setup + login (fresh database expected)
  const pass = 'Qa-' + crypto.randomBytes(12).toString('hex');
  await page.goto(BASE + '/admin/setup', { waitUntil: 'load' });
  if (await page.isVisible('input[name="display_name"]')) {
    await page.fill('input[name="display_name"]', 'QA Owner'); await page.fill('input[name="email"]', 'qa@example.com');
    await page.fill('input[name="password"]', pass); await page.fill('input[name="confirm"]', pass);
    await page.click('button[type="submit"]');
  }
  await page.goto(BASE + '/admin/login', { waitUntil: 'load' });
  await page.fill('input[name="email"]', 'qa@example.com'); await page.fill('input[name="password"]', pass);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + '/admin');
  ok(await page.isVisible('.bottom-nav'), 'admin bottom navigation on mobile');
  await page.screenshot({ path: `${OUT}/admin-dashboard-mobile.png`, fullPage: true });
  await overflowAt(ADMIN, 'admin');

  // Section editor on a phone: autosave + repeater + confirm dialog
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '/admin/pages/1/sections/seed-home-0', { waitUntil: 'load' });
  await page.fill('input[name="loc[heading]"]', 'Autosaved heading');
  await page.waitForSelector('[data-autosave-status]:has-text("Draft saved")', { timeout: 8000 });
  ok(true, 'autosave saved the draft from a phone');
  const rows = await page.locator('[data-repeater-list] [data-repeater-row]').count();
  await page.click('[data-repeater-add]');
  ok((await page.locator('[data-repeater-list] [data-repeater-row]').count()) === rows + 1, 'repeater adds a button row');
  await page.screenshot({ path: `${OUT}/editor-mobile.png`, fullPage: false });
  await page.goto(BASE + '/admin/pages/1', { waitUntil: 'load' });
  await page.click('.publish-bar form[data-confirm] button:has-text("Discard")');
  ok(await page.isVisible('dialog[open]'), 'confirmation dialog before destructive action');
  await page.click('dialog [value="cancel"]');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/admin/pages/1/sections/seed-home-0', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/editor-desktop.png` });
  await page.goto(BASE + '/admin/pages/1/devices', { waitUntil: 'load' });
  await page.click('[data-device="768"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/devices-tablet.png` });

  // Media picker opens
  await page.goto(BASE + '/admin/pages/1/sections/seed-home-0', { waitUntil: 'load' });
  await page.click('[data-media-field] [data-mf-pick]');
  await page.waitForSelector('dialog.picker[open] [data-picker-grid] li');
  ok(true, 'media picker opens and lists the library');

  ok(consoleErrors.length === 0, `no JavaScript errors (${consoleErrors.slice(0, 3).join(' | ')})`);
  await browser.close();
  console.log(problems.length ? `\n${problems.length} problem(s)` : '\nall browser QA checks passed');
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
