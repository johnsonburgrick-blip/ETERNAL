import type { Env } from '../env';

/**
 * Data-only SQL dump in foreign-key-safe order. Restore into a database that already
 * has the schema (wrangler d1 migrations apply) with `wrangler d1 execute --file`.
 * Ephemeral tables (sessions, rate limits, one-time tokens) are intentionally skipped.
 */
export const BACKUP_TABLES = [
  'users', 'site_settings', 'navigation_items', 'pages', 'page_sections', 'media_assets', 'language_translations',
  'article_categories', 'articles', 'historical_events', 'historical_figures', 'historical_archives', 'leadership_profiles',
  'principles', 'symbols', 'faqs', 'application_fields', 'applications', 'application_documents', 'application_events',
  'application_notes', 'application_assignments', 'applicant_messages', 'form_submissions', 'email_templates', 'email_logs',
  'admin_notifications', 'audit_logs', 'content_revisions', 'timer_values',
];

function lit(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''")}'`;
}

export async function buildSqlDump(env: Env): Promise<string> {
  const out: string[] = [
    `-- Eternal Illuminati Covenant data backup ${new Date().toISOString()}`,
    '-- Restore: apply migrations to an empty database, then run this file.',
    'PRAGMA defer_foreign_keys = true;',
  ];
  for (const t of BACKUP_TABLES) {
    out.push(`-- ${t}`);
    let offset = 0;
    for (;;) {
      const rows = (await env.DB.prepare(`SELECT * FROM ${t} ORDER BY rowid LIMIT 500 OFFSET ?`).bind(offset).all<Record<string, unknown>>()).results;
      for (const r of rows) {
        const cols = Object.keys(r);
        out.push(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map((c) => lit(r[c])).join(', ')});`);
      }
      if (rows.length < 500) break;
      offset += 500;
    }
  }
  return out.join('\n') + '\n';
}
