import type { Snapshot } from './snapshot/model';
import type { Locale } from './i18n';

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  CF_VERSION_METADATA?: { id: string; tag?: string; timestamp: string };

  ENVIRONMENT?: string;
  PUBLIC_BASE_URL: string;
  EMAIL_FROM: string;
  EMAIL_FROM_NAME?: string;
  EMAIL_REPLY_TO: string;
  ADMIN_NOTIFY_EMAIL: string;
  TURNSTILE_SITE_KEY?: string;
  SNAPSHOT_MODE?: string;

  // Secrets — set with `npx wrangler secret put NAME`
  RESEND_API_KEY?: string;
  AUTH_PEPPER?: string;
  TOKEN_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;

  // Local testing only (ignored when ENVIRONMENT === 'production')
  RESEND_API_BASE?: string;
  DEV_DB_METRICS?: string;
  DEV_SIMULATE_DB_DOWN?: string;
}

export interface AdminUser {
  id: number;
  email: string;
  display_name: string;
  role: Role;
  totp_enabled: boolean;
  session_id: number;
}

export type Role = 'super_admin' | 'content_admin' | 'reviewer';

export type AppVars = {
  snap: Snapshot | null;
  locale: Locale;
  user: AdminUser;
};

export type AppEnv = { Bindings: Env; Variables: AppVars };

export const isProduction = (env: Env) => (env.ENVIRONMENT ?? 'production') === 'production';
