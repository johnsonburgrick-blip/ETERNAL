import type { Env } from '../../env';
import type { Locale, T } from '../../i18n';
import type { SiteData } from '../../snapshot/model';

export interface FormState {
  form: string;                       // which form the state belongs to
  values?: Record<string, string>;
  errors?: Record<string, string>;
  message?: string;                   // general error / info
  success?: string;                   // success message (replaces the form)
  info?: string;                      // neutral notice shown above the form
}

export interface RenderCtx {
  env: Env;
  data: SiteData;
  locale: Locale;
  t: T;
  lp: (path: string) => string;
  url: URL;
  path: string;                       // path without locale prefix
  timers: Record<string, string>;     // signed form timer tokens by form name
  submissionToken: string;
  formState?: FormState;
  preview?: boolean;
  notTranslated?: boolean;
}
