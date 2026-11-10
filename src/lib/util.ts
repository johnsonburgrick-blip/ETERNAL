const enc = new TextEncoder();

export const now = () => Date.now();
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

export function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(input: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256(key: string, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(msg));
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '0.0.0.0';
}

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function toInt(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function clampStr(v: unknown, max: number): string {
  return String(v ?? '').trim().slice(0, max);
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
export const isEmail = (s: string) => s.length <= 254 && EMAIL_RE.test(s);

/** Only allow relative paths, http(s) and mailto/tel links (blocks javascript: etc.). */
export function safeHref(href: string): string {
  const h = String(href ?? '').trim();
  if (!h) return '';
  if (h.startsWith('/') && !h.startsWith('//')) return h;
  if (h.startsWith('#')) return h;
  if (/^(https?:|mailto:|tel:)/i.test(h)) return h;
  return '';
}

/** Absolute URL for media/assets (needed in emails, OG tags, JSON-LD). */
export function absoluteUrl(base: string, path: string): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return base.replace(/\/$/, '') + (path.startsWith('/') ? path : '/' + path);
}

export function formatDate(ts: number | null | undefined, locale: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'long' }): string {
  if (!ts) return '';
  try {
    return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : locale === 'es' ? 'es-ES' : 'en-GB', { timeZone: 'UTC', ...opts }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}

export function formatDateTime(ts: number | null | undefined, locale = 'en'): string {
  return formatDate(ts, locale, { dateStyle: 'medium', timeStyle: 'short' });
}

export function csvEscape(v: unknown): string {
  let s = String(v ?? '');
  // Prevent CSV/formula injection when opened in spreadsheet software.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}

/** Parse bracketed form names (items[0][title]) into nested objects/arrays. */
export function parseNestedForm(entries: Iterable<[string, string]>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [rawKey, value] of entries) {
    const parts = rawKey.replace(/\]/g, '').split('[');
    let cur: any = out;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const last = i === parts.length - 1;
      const nextIsIndex = !last && /^\d+$/.test(parts[i + 1]);
      if (last) {
        cur[p] = value;
      } else {
        if (cur[p] == null) cur[p] = nextIsIndex ? [] : {};
        cur = cur[p];
      }
    }
  }
  // compact sparse arrays (rows removed client-side leave gaps)
  const compact = (v: any): any => {
    if (Array.isArray(v)) return v.filter((x) => x != null).map(compact);
    if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) v[k] = compact(v[k]);
    }
    return v;
  };
  return compact(out);
}

const BOT_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|outbrain|pinterest|vkshare|w3c_validator|whatsapp|telegrambot|discordbot|applebot|yandex|baidu|duckduck|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|gptbot|claudebot|ccbot|headless|lighthouse|python-requests|curl\/|wget|httpclient|okhttp|go-http-client|node-fetch|axios|scrapy|phantomjs|playwright|puppeteer/i;

export function isBot(ua: string | null | undefined): boolean {
  if (!ua) return true;
  return BOT_RE.test(ua);
}

export function referenceCode(): string {
  // EIC-YYYY-XXXXXX using an unambiguous alphabet
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(6));
  let s = '';
  for (const b of r) s += alphabet[b % alphabet.length];
  return `EIC-${new Date().getUTCFullYear()}-${s}`;
}
