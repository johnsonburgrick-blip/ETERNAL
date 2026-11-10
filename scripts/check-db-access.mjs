// Enforces the read-model rule: public content tables are read from the database ONLY
// in src/snapshot/source.ts. Public route/view modules may not touch env.DB at all.
// Admin, cron, forms and libraries may write, and admin may read for editing.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const files = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) && files.push(path.join(d, e.name))));
walk(path.join(root, 'src'));

const CONTENT_TABLES = ['pages', 'page_sections', 'navigation_items', 'site_settings', 'articles', 'article_categories', 'historical_events', 'historical_figures', 'historical_archives', 'leadership_profiles', 'principles', 'symbols', 'faqs', 'media_assets', 'language_translations', 'application_fields'];
const readRe = new RegExp(`SELECT[\\s\\S]{0,400}?FROM\\s+(${CONTENT_TABLES.join('|')})\\b`, 'i');
const problems = [];

for (const f of files) {
  const rel = path.relative(root, f);
  const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const isPublic = rel.startsWith('src/routes/public') || rel.startsWith('src/views/');
  if (isPublic && /\benv\.DB\b|\.DB\.prepare|\bDB\.batch/.test(src)) problems.push(`${rel}: public route/view modules must not access env.DB`);
  // Only source.ts may SELECT public content outside the admin area / cron / backup / email-settings helpers.
  const allowed = rel === 'src/snapshot/source.ts' || rel.startsWith('src/routes/admin/') || ['src/cron.ts', 'src/lib/backup.ts', 'src/email/send.ts'].includes(rel);
  if (!allowed && readRe.test(src)) problems.push(`${rel}: reads a public content table, use snapshot/read.ts instead`);
}

if (problems.length) {
  console.error('DB access rule violations:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(`check-db-access: OK (${files.length} files scanned)`);
