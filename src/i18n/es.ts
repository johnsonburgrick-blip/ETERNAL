import type { en } from './en';

/**
 * Spanish is prepared but not enabled. Add the remaining strings (or add them in
 * Admin → Settings → Translations), then enable "es" in Admin → Settings → Languages.
 * Missing keys fall back to English.
 */
export const es: Partial<Record<keyof typeof en, string>> = {
  'site.skip': 'Ir al contenido principal',
  'nav.menu': 'Menú',
  'nav.close': 'Cerrar menú',
  'nav.language': 'Idioma',
  'nav.apply': 'Solicitar',
  'nav.search': 'Buscar',
  'common.readMore': 'Leer más',
  'common.viewAll': 'Ver todo',
  'common.back': 'Volver',
};
