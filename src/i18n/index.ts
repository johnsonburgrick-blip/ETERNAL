import { en } from './en';
import { fr } from './fr';
import { es } from './es';

export type Locale = 'en' | 'fr' | 'es';
export type Dict = Record<keyof typeof en, string>;

/** Locales that have UI strings. Which are *enabled* publicly is a site setting. */
export const LOCALES: Locale[] = ['en', 'fr', 'es'];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Français', es: 'Español' };

const DICTS: Record<Locale, Partial<Dict>> = { en, fr, es };

export type Overrides = Record<string, Record<string, string>>;

export function translator(locale: Locale, overrides?: Overrides) {
  const d = DICTS[locale] ?? en;
  const o = overrides?.[locale] ?? {};
  const oEn = overrides?.en ?? {};
  return (key: keyof typeof en | string, vars?: Record<string, string | number>): string => {
    let s: string = o[key] ?? (d as any)[key] ?? oEn[key] ?? (en as any)[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}

export type T = ReturnType<typeof translator>;

export function isLocale(s: string | undefined | null): s is Locale {
  return !!s && (LOCALES as string[]).includes(s);
}

/** Prefix a site path for a locale: ('/history','fr') → '/fr/history'. */
export function localePath(path: string, locale: Locale): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  if (locale === DEFAULT_LOCALE) return path;
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}

/** Split '/fr/history' → { locale:'fr', path:'/history' } */
export function splitLocale(pathname: string, enabled: string[]): { locale: Locale; path: string } {
  const m = pathname.match(/^\/([a-z]{2})(\/.*)?$/);
  if (m && m[1] !== DEFAULT_LOCALE && enabled.includes(m[1]) && isLocale(m[1])) {
    return { locale: m[1], path: m[2] || '/' };
  }
  return { locale: DEFAULT_LOCALE, path: pathname };
}

/** Pick a translated value from {en:…, fr:…} with English fallback. */
export function pick<V>(obj: Partial<Record<string, V>> | null | undefined, locale: string): V | undefined {
  if (!obj) return undefined;
  return (obj[locale] as V | undefined) ?? (obj.en as V | undefined);
}

/** Merge translated fields from an `i18n_json` blob over a base record. */
export function localizeRecord<R extends Record<string, any>>(rec: R, locale: string): R {
  if (locale === DEFAULT_LOCALE || !rec.i18n) return rec;
  const tr = rec.i18n[locale];
  if (!tr) return rec;
  const out: any = { ...rec };
  for (const [k, v] of Object.entries(tr)) if (typeof v === 'string' && v.trim()) out[k] = v;
  return out;
}

export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

// ISO 3166-1 alpha-2 codes; names are localised at render time with Intl.DisplayNames.
export const COUNTRY_CODES =
  'AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW'.split(' ');
