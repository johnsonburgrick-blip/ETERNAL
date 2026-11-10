-- Eternal Illuminati Covenant — core schema (D1 / SQLite)
-- All timestamps are Unix epoch milliseconds (INTEGER).
-- Translatable JSON columns use the shape {"en": ..., "fr": ...}.

PRAGMA foreign_keys = ON;

-- ───────────────────────── Administrators & auth ─────────────────────────
-- `users` doubles as the admin profile table (there are no applicant/member accounts).
CREATE TABLE users (
  id                  INTEGER PRIMARY KEY,
  email               TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  display_name        TEXT    NOT NULL,
  role                TEXT    NOT NULL CHECK (role IN ('super_admin','content_admin','reviewer')),
  status              TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','disabled')),
  password_hash       TEXT,
  password_salt       TEXT,
  password_iterations INTEGER,
  totp_secret         TEXT,
  locked_until        INTEGER,
  last_login_at       INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE TABLE sessions (
  id           INTEGER PRIMARY KEY,
  token_hash   TEXT    NOT NULL UNIQUE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mfa_pending  INTEGER NOT NULL DEFAULT 0,
  ip           TEXT,
  user_agent   TEXT,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- One-time admin tokens (invites, password resets). Only hashes are stored.
CREATE TABLE auth_tokens (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT    NOT NULL CHECK (purpose IN ('invite','reset')),
  token_hash  TEXT    NOT NULL UNIQUE,
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER,
  created_at  INTEGER NOT NULL
);

-- Sliding-window rate limiting (failed logins per IP / per account, form posts per IP …)
CREATE TABLE rate_events (
  id         INTEGER PRIMARY KEY,
  bucket     TEXT    NOT NULL,
  key        TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_rate_events ON rate_events(bucket, key, created_at);

-- ───────────────────────── Site content ─────────────────────────
CREATE TABLE site_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,           -- JSON value
  updated_at INTEGER NOT NULL
);

CREATE TABLE navigation_items (
  id         INTEGER PRIMARY KEY,
  location   TEXT    NOT NULL CHECK (location IN ('header','footer','legal')),
  parent_id  INTEGER REFERENCES navigation_items(id) ON DELETE CASCADE,
  label_json TEXT    NOT NULL,
  href       TEXT    NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  visible    INTEGER NOT NULL DEFAULT 1,
  is_button  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_nav_location ON navigation_items(location, sort);

CREATE TABLE pages (
  id           INTEGER PRIMARY KEY,
  slug         TEXT    NOT NULL UNIQUE,       -- '' is not allowed; homepage slug is 'home'
  name         TEXT    NOT NULL,              -- admin label
  meta_json    TEXT    NOT NULL DEFAULT '{}', -- published {en:{title,description}, fr:{…}, ogImage}
  draft_json   TEXT,                          -- full working copy {meta, sections[]}; NULL = no pending draft
  status       TEXT    NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  in_sitemap   INTEGER NOT NULL DEFAULT 1,
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  published_at INTEGER,
  draft_updated_at INTEGER,
  draft_updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Published sections (normalised). Drafts live in pages.draft_json until published.
CREATE TABLE page_sections (
  id            INTEGER PRIMARY KEY,
  page_id       INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  uid           TEXT    NOT NULL,
  type          TEXT    NOT NULL,
  sort          INTEGER NOT NULL DEFAULT 0,
  visible       INTEGER NOT NULL DEFAULT 1,
  settings_json TEXT    NOT NULL DEFAULT '{}',
  content_json  TEXT    NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_sections_page ON page_sections(page_id, sort);

CREATE TABLE media_assets (
  id            INTEGER PRIMARY KEY,
  url           TEXT    NOT NULL UNIQUE,     -- public path (/media/… or /assets/img/…)
  r2_key        TEXT,                        -- NULL for bundled static images
  kind          TEXT    NOT NULL CHECK (kind IN ('image','video','document')),
  mime          TEXT    NOT NULL,
  size          INTEGER NOT NULL DEFAULT 0,
  width         INTEGER,
  height        INTEGER,
  variants_json TEXT    NOT NULL DEFAULT '[]', -- [{w,url,mime,size,r2_key?}]
  title         TEXT    NOT NULL DEFAULT '',
  alt_json      TEXT    NOT NULL DEFAULT '{}',
  category      TEXT    NOT NULL DEFAULT 'general',
  credit        TEXT    NOT NULL DEFAULT '',
  license       TEXT    NOT NULL DEFAULT '',
  source_url    TEXT    NOT NULL DEFAULT '',
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX idx_media_category ON media_assets(category, created_at);

CREATE TABLE language_translations (
  id         INTEGER PRIMARY KEY,
  locale     TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (locale, key)
);

-- Editorial
CREATE TABLE article_categories (
  id        INTEGER PRIMARY KEY,
  slug      TEXT    NOT NULL UNIQUE,
  name_json TEXT    NOT NULL,
  sort      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE articles (
  id               INTEGER PRIMARY KEY,
  slug             TEXT    NOT NULL UNIQUE,
  locale           TEXT    NOT NULL DEFAULT 'en',
  title            TEXT    NOT NULL,
  excerpt          TEXT    NOT NULL DEFAULT '',
  body             TEXT    NOT NULL DEFAULT '',
  cover_image      TEXT    NOT NULL DEFAULT '',
  cover_alt        TEXT    NOT NULL DEFAULT '',
  category_id      INTEGER REFERENCES article_categories(id) ON DELETE SET NULL,
  tags             TEXT    NOT NULL DEFAULT '',   -- comma separated
  author_name      TEXT    NOT NULL DEFAULT '',
  status           TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','published','unpublished')),
  publish_at       INTEGER,
  featured         INTEGER NOT NULL DEFAULT 0,
  is_announcement  INTEGER NOT NULL DEFAULT 0,
  meta_title       TEXT    NOT NULL DEFAULT '',
  meta_description TEXT    NOT NULL DEFAULT '',
  views            INTEGER NOT NULL DEFAULT 0,
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  published_at     INTEGER
);
CREATE INDEX idx_articles_status ON articles(status, publish_at);

-- Historical & organisational collections. `i18n_json` holds translated fields: {"fr":{"title":…}}
CREATE TABLE historical_events (
  id         INTEGER PRIMARY KEY,
  slug       TEXT    NOT NULL UNIQUE,
  date_label TEXT    NOT NULL,
  year       INTEGER NOT NULL,
  era        TEXT    NOT NULL DEFAULT '',
  title      TEXT    NOT NULL,
  summary    TEXT    NOT NULL DEFAULT '',
  body       TEXT    NOT NULL DEFAULT '',
  image      TEXT    NOT NULL DEFAULT '',
  image_alt  TEXT    NOT NULL DEFAULT '',
  sources    TEXT    NOT NULL DEFAULT '',
  certainty  TEXT    NOT NULL DEFAULT 'documented' CHECK (certainty IN ('documented','disputed','legend')),
  sort       INTEGER NOT NULL DEFAULT 0,
  status     TEXT    NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  i18n_json  TEXT    NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE historical_figures (
  id          INTEGER PRIMARY KEY,
  slug        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  role_title  TEXT    NOT NULL DEFAULT '',
  dates_label TEXT    NOT NULL DEFAULT '',
  portrait    TEXT    NOT NULL DEFAULT '',
  portrait_alt TEXT   NOT NULL DEFAULT '',
  summary     TEXT    NOT NULL DEFAULT '',
  background  TEXT    NOT NULL DEFAULT '',
  body        TEXT    NOT NULL DEFAULT '',
  sources     TEXT    NOT NULL DEFAULT '',
  sort        INTEGER NOT NULL DEFAULT 0,
  status      TEXT    NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  i18n_json   TEXT    NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE historical_archives (
  id           INTEGER PRIMARY KEY,
  slug         TEXT    NOT NULL UNIQUE,
  title        TEXT    NOT NULL,
  kind         TEXT    NOT NULL DEFAULT 'document' CHECK (kind IN ('document','photograph','manuscript','research','reference')),
  category     TEXT    NOT NULL DEFAULT '',
  date_label   TEXT    NOT NULL DEFAULT '',
  description  TEXT    NOT NULL DEFAULT '',
  body         TEXT    NOT NULL DEFAULT '',
  image        TEXT    NOT NULL DEFAULT '',
  image_alt    TEXT    NOT NULL DEFAULT '',
  file_url     TEXT    NOT NULL DEFAULT '',     -- uploaded file in media library
  external_url TEXT    NOT NULL DEFAULT '',
  downloadable INTEGER NOT NULL DEFAULT 0,
  license      TEXT    NOT NULL DEFAULT '',
  source       TEXT    NOT NULL DEFAULT '',
  sort         INTEGER NOT NULL DEFAULT 0,
  status       TEXT    NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  i18n_json    TEXT    NOT NULL DEFAULT '{}',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE leadership_profiles (
  id               INTEGER PRIMARY KEY,
  slug             TEXT    NOT NULL UNIQUE,
  name             TEXT    NOT NULL,
  position         TEXT    NOT NULL DEFAULT '',
  photo            TEXT    NOT NULL DEFAULT '',
  photo_alt        TEXT    NOT NULL DEFAULT '',
  summary          TEXT    NOT NULL DEFAULT '',
  body             TEXT    NOT NULL DEFAULT '',
  responsibilities TEXT    NOT NULL DEFAULT '',
  credentials      TEXT    NOT NULL DEFAULT '',
  sort             INTEGER NOT NULL DEFAULT 0,
  status           TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  i18n_json        TEXT    NOT NULL DEFAULT '{}',
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE principles (
  id         INTEGER PRIMARY KEY,
  slug       TEXT    NOT NULL UNIQUE,
  title      TEXT    NOT NULL,
  summary    TEXT    NOT NULL DEFAULT '',
  body       TEXT    NOT NULL DEFAULT '',
  image      TEXT    NOT NULL DEFAULT '',
  image_alt  TEXT    NOT NULL DEFAULT '',
  sort       INTEGER NOT NULL DEFAULT 0,
  status     TEXT    NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  i18n_json  TEXT    NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE symbols (
  id         INTEGER PRIMARY KEY,
  slug       TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL,
  image      TEXT    NOT NULL DEFAULT '',
  image_alt  TEXT    NOT NULL DEFAULT '',
  origin     TEXT    NOT NULL DEFAULT '',
  summary    TEXT    NOT NULL DEFAULT '',   -- historical meaning (short)
  body       TEXT    NOT NULL DEFAULT '',   -- cultural interpretations (long)
  sources    TEXT    NOT NULL DEFAULT '',
  sort       INTEGER NOT NULL DEFAULT 0,
  status     TEXT    NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  i18n_json  TEXT    NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE faqs (
  id         INTEGER PRIMARY KEY,
  slug       TEXT    NOT NULL UNIQUE,
  question   TEXT    NOT NULL,
  answer     TEXT    NOT NULL DEFAULT '',
  category   TEXT    NOT NULL DEFAULT 'general',
  sort       INTEGER NOT NULL DEFAULT 0,
  status     TEXT    NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  i18n_json  TEXT    NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ───────────────────────── Membership applications ─────────────────────────
CREATE TABLE application_fields (
  id           INTEGER PRIMARY KEY,
  key          TEXT    NOT NULL UNIQUE,
  step         INTEGER NOT NULL CHECK (step IN (1,2,3)),
  type         TEXT    NOT NULL CHECK (type IN ('text','email','tel','url','textarea','select','country','date','checkbox')),
  label_json   TEXT    NOT NULL,
  help_json    TEXT    NOT NULL DEFAULT '{}',
  options_json TEXT    NOT NULL DEFAULT '[]',   -- [{value, label:{en,fr}}]
  required     INTEGER NOT NULL DEFAULT 0,
  core         INTEGER NOT NULL DEFAULT 0,      -- core fields cannot be removed
  max_length   INTEGER NOT NULL DEFAULT 500,
  sort         INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE applications (
  id                INTEGER PRIMARY KEY,
  reference         TEXT    NOT NULL UNIQUE,
  status            TEXT    NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','PENDING_REVIEW','UNDER_REVIEW','INFORMATION_REQUESTED','ACCEPTED','DECLINED','WITHDRAWN')),
  full_name         TEXT    NOT NULL,
  email             TEXT    NOT NULL COLLATE NOCASE,
  country           TEXT    NOT NULL DEFAULT '',
  locale            TEXT    NOT NULL DEFAULT 'en',
  answers_json      TEXT    NOT NULL DEFAULT '{}',
  consent_version   TEXT    NOT NULL,
  consent_at        INTEGER NOT NULL,
  email_verified_at INTEGER,
  submission_token  TEXT    NOT NULL UNIQUE,
  ip_hash           TEXT,
  assigned_to       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  decided_at        INTEGER
);
CREATE INDEX idx_applications_status ON applications(status, created_at);
CREATE INDEX idx_applications_email ON applications(email);
CREATE INDEX idx_applications_assigned ON applications(assigned_to, status);

CREATE TABLE application_documents (
  id             INTEGER PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  r2_key         TEXT    NOT NULL UNIQUE,
  file_name      TEXT    NOT NULL,
  mime           TEXT    NOT NULL,
  size           INTEGER NOT NULL,
  created_at     INTEGER NOT NULL
);

CREATE TABLE application_events (
  id             INTEGER PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  type           TEXT    NOT NULL,
  from_status    TEXT,
  to_status      TEXT,
  detail         TEXT    NOT NULL DEFAULT '',
  actor_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_app_events ON application_events(application_id, created_at);

CREATE TABLE application_notes (
  id             INTEGER PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  author_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body           TEXT    NOT NULL,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_app_notes ON application_notes(application_id);

CREATE TABLE application_assignments (
  id             INTEGER PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_app_assign ON application_assignments(application_id);

CREATE TABLE applicant_messages (
  id             INTEGER PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  direction      TEXT    NOT NULL CHECK (direction IN ('inbound','outbound')),
  subject        TEXT    NOT NULL DEFAULT '',
  body           TEXT    NOT NULL,
  author_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email_log_id   INTEGER,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_app_messages ON applicant_messages(application_id, created_at);

-- Email-confirmed applicant actions without accounts: verify email, withdraw,
-- message about an application, save-and-resume. Only token hashes are stored.
CREATE TABLE applicant_actions (
  id             INTEGER PRIMARY KEY,
  token_hash     TEXT    NOT NULL UNIQUE,
  action         TEXT    NOT NULL CHECK (action IN ('verify_email','withdraw','message','resume')),
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  email          TEXT    NOT NULL COLLATE NOCASE,
  payload_json   TEXT    NOT NULL DEFAULT '{}',
  expires_at     INTEGER NOT NULL,
  used_at        INTEGER,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_applicant_actions_expires ON applicant_actions(expires_at);

-- Contact form and "report an issue" submissions
CREATE TABLE form_submissions (
  id         INTEGER PRIMARY KEY,
  kind       TEXT    NOT NULL CHECK (kind IN ('contact','report')),
  name       TEXT    NOT NULL,
  email      TEXT    NOT NULL,
  subject    TEXT    NOT NULL DEFAULT '',
  message    TEXT    NOT NULL,
  page_url   TEXT    NOT NULL DEFAULT '',
  locale     TEXT    NOT NULL DEFAULT 'en',
  status     TEXT    NOT NULL DEFAULT 'new' CHECK (status IN ('new','handled')),
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_form_submissions ON form_submissions(kind, status, created_at);

-- ───────────────────────── Email ─────────────────────────
CREATE TABLE email_templates (
  id           INTEGER PRIMARY KEY,
  key          TEXT    NOT NULL,
  locale       TEXT    NOT NULL DEFAULT 'en',
  name         TEXT    NOT NULL,
  audience     TEXT    NOT NULL CHECK (audience IN ('client','admin')),
  subject      TEXT    NOT NULL,
  heading      TEXT    NOT NULL DEFAULT '',
  body         TEXT    NOT NULL,           -- markdown-lite with {{placeholders}}
  button_label TEXT    NOT NULL DEFAULT '',
  updated_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at   INTEGER NOT NULL,
  UNIQUE (key, locale)
);

CREATE TABLE email_logs (
  id             INTEGER PRIMARY KEY,
  dedupe_key     TEXT    NOT NULL UNIQUE,
  template_key   TEXT    NOT NULL,
  category       TEXT    NOT NULL CHECK (category IN ('client','admin')),
  to_email       TEXT    NOT NULL,
  subject        TEXT    NOT NULL,
  html           TEXT    NOT NULL,
  text           TEXT    NOT NULL,
  application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  status         TEXT    NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed','skipped')),
  provider_id    TEXT,
  error          TEXT,
  attempts       INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX idx_email_logs_status ON email_logs(status, created_at);
CREATE INDEX idx_email_logs_app ON email_logs(application_id);

-- ───────────────────────── Admin operations ─────────────────────────
CREATE TABLE admin_notifications (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL,
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL DEFAULT '',
  link       TEXT    NOT NULL DEFAULT '',
  read_at    INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_notifications_user ON admin_notifications(user_id, read_at, created_at);

CREATE TABLE audit_logs (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT    NOT NULL,
  entity_type TEXT    NOT NULL DEFAULT '',
  entity_id   TEXT    NOT NULL DEFAULT '',
  detail      TEXT    NOT NULL DEFAULT '',
  ip          TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
CREATE INDEX idx_audit_action ON audit_logs(action, created_at);

CREATE TABLE content_revisions (
  id          INTEGER PRIMARY KEY,
  entity_type TEXT    NOT NULL,
  entity_id   INTEGER NOT NULL,
  data_json   TEXT    NOT NULL,
  note        TEXT    NOT NULL DEFAULT '',
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_revisions_entity ON content_revisions(entity_type, entity_id, created_at);

-- Values produced by timer jobs. A row is only written when the value changes;
-- the latest value is always published to its own R2 object (cache/timer/<key>.json).
CREATE TABLE timer_values (
  key        TEXT PRIMARY KEY,
  value_json TEXT    NOT NULL,
  changed_at INTEGER NOT NULL
);
