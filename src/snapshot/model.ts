/**
 * The public read-model. One JSON object holds everything public pages need, so a
 * public page view never queries D1. Per-record long text (article bodies, biographies,
 * event narratives, …) is deliberately excluded. Detail pages fetch it with one
 * primary-key read and fall back to the light row below if that read fails.
 *
 * Bump SNAPSHOT_SCHEMA whenever the shape of this object changes. Copies written
 * with another schema, or by an older deploy, are ignored (see snapshot.ts).
 */
export const SNAPSHOT_SCHEMA = 3;

export type I18n<T = string> = { en: T; fr?: T; es?: T; [k: string]: T | undefined };

export interface SiteSettings {
  siteName: string;
  tagline: I18n;
  description: I18n;
  logoUrl: string;          // header/footer logo (SVG or raster)
  emailLogoUrl: string;     // PNG/JPG for email clients; absolute https or site path
  contactEmail: string;
  contactAddress: I18n;
  socials: { label: string; url: string }[];
  defaultOgImage: string;
  enabledLocales: string[];
  analyticsToken: string;   // Cloudflare Web Analytics (cookieless) token, optional
  retentionDays: number;    // applicant data retention after a decision
  consentVersion: string;
  applicationsOpen: boolean;
  footerNote: I18n;
}

export interface NavItem {
  id: number;
  location: 'header' | 'footer' | 'legal';
  parentId: number | null;
  label: I18n;
  href: string;
  sort: number;
  isButton: boolean;
}

export interface SectionSettings {
  background?: 'obsidian' | 'charcoal' | 'ivory' | 'image';
  bgImage?: string;
  overlay?: 'light' | 'medium' | 'strong';
  spacing?: 'compact' | 'normal' | 'spacious';
  align?: 'left' | 'center';
  anchor?: string;
}

/** content = { shared: {non-translatable fields}, en: {…}, fr: {…} } */
export interface SectionDoc {
  uid: string;
  type: string;
  visible: boolean;
  settings: SectionSettings;
  content: { shared?: Record<string, any>; [locale: string]: Record<string, any> | undefined };
}

export interface PageMeta {
  title: I18n;
  description: I18n;
  ogImage?: string;
}

export interface PageEntry {
  id: number;
  slug: string;
  name: string;
  meta: PageMeta;
  sections: SectionDoc[];
  inSitemap: boolean;
  updatedAt: number;
}

export interface Category { id: number; slug: string; name: I18n; sort: number }

export interface ArticleLight {
  id: number; slug: string; locale: string; title: string; excerpt: string;
  coverImage: string; coverAlt: string; categoryId: number | null; tags: string[]; authorName: string;
  status: 'published' | 'scheduled'; publishAt: number | null; featured: boolean; isAnnouncement: boolean;
  metaTitle: string; metaDescription: string; publishedAt: number | null; updatedAt: number;
}

interface Localizable { i18n?: Record<string, Record<string, string>> }

export interface EventLight extends Localizable {
  id: number; slug: string; dateLabel: string; year: number; era: string; title: string; summary: string;
  image: string; imageAlt: string; certainty: 'documented' | 'disputed' | 'legend'; sort: number; updatedAt: number;
}
export interface FigureLight extends Localizable {
  id: number; slug: string; name: string; roleTitle: string; datesLabel: string; portrait: string; portraitAlt: string;
  summary: string; sort: number; updatedAt: number;
}
export interface ArchiveLight extends Localizable {
  id: number; slug: string; title: string; kind: string; category: string; dateLabel: string; description: string;
  image: string; imageAlt: string; fileUrl: string; externalUrl: string; downloadable: boolean; license: string; source: string;
  sort: number; updatedAt: number;
}
export interface LeaderLight extends Localizable {
  id: number; slug: string; name: string; position: string; photo: string; photoAlt: string; summary: string; sort: number; updatedAt: number;
}
export interface PrincipleLight extends Localizable {
  id: number; slug: string; title: string; summary: string; image: string; imageAlt: string; sort: number; updatedAt: number;
}
export interface SymbolLight extends Localizable {
  id: number; slug: string; name: string; image: string; imageAlt: string; origin: string; summary: string; sort: number; updatedAt: number;
}
export interface Faq extends Localizable { id: number; slug: string; question: string; answer: string; category: string; sort: number }

export interface MediaLight {
  url: string; kind: string; mime: string; width: number | null; height: number | null;
  variants: { w: number; url: string; mime: string }[]; alt: I18n; credit: string; license: string; sourceUrl: string;
}

export interface AppField {
  key: string; step: 1 | 2 | 3; type: string; label: I18n; help: I18n; options: { value: string; label: I18n }[];
  required: boolean; core: boolean; maxLength: number; sort: number;
}

/** Everything public pages read. Built by source.ts (the only DB reader for this data). */
export interface SiteData {
  settings: SiteSettings;
  translations: Record<string, Record<string, string>>;
  nav: NavItem[];
  pages: Record<string, PageEntry>;
  categories: Category[];
  articles: ArticleLight[];
  events: EventLight[];
  figures: FigureLight[];
  archives: ArchiveLight[];
  leadership: LeaderLight[];
  principles: PrincipleLight[];
  symbols: SymbolLight[];
  faqs: Faq[];
  media: Record<string, MediaLight>;
  applicationFields: AppField[];
}

export interface Snapshot extends SiteData {
  schema: number;
  build: string;      // deploy version id that wrote this copy
  buildTs: number;    // deploy timestamp (ms) of that version
  generatedAt: number;
}

export type RecordKind = 'article' | 'event' | 'figure' | 'archive' | 'leader' | 'principle' | 'symbol';

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: 'Eternal Illuminati Covenant',
  tagline: { en: 'Knowledge. Enlightenment. Legacy.', fr: 'Savoir. Lumières. Héritage.' },
  description: {
    en: 'An independent, modern organisation devoted to the history of the Bavarian Illuminati, Enlightenment philosophy and the pursuit of knowledge.',
    fr: "Une organisation moderne et indépendante consacrée à l'histoire des Illuminés de Bavière, à la philosophie des Lumières et à la quête du savoir.",
  },
  logoUrl: '/assets/logo.svg',
  emailLogoUrl: '/assets/logo-email.png',
  contactEmail: 'support@yourdomain.com',
  contactAddress: { en: '' },
  socials: [],
  defaultOgImage: '/assets/og-default.jpg',
  enabledLocales: ['en', 'fr'],
  analyticsToken: '',
  retentionDays: 730,
  consentVersion: '2026-11',
  applicationsOpen: true,
  footerNote: { en: '' },
};
