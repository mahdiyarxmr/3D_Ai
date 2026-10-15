export const LOCALES = ['en', 'ja', 'fa'] as const;
export type Locale = (typeof LOCALES)[number];

export const FALLBACK_LOCALE: Locale = 'en';

export type Messages = Record<string, string>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Persian is right-to-left; English and Japanese are left-to-right. */
export function directionFor(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'fa' ? 'rtl' : 'ltr';
}

/**
 * Resolve a translation key with the chain: requested locale → English → key.
 * Interpolation uses `{name}` placeholders so translators control word order.
 */
export function translate(
  messages: Messages,
  key: string,
  vars: Record<string, string | number> = {},
  fallback: Messages = {}
): string {
  const template = messages[key] ?? fallback[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

/** Map an API error code to a localized message key. */
export function errorMessageKey(code: string | undefined): string {
  const known = new Set([
    'invalid_input',
    'email_taken',
    'invalid_credentials',
    'unauthorized',
    'invalid_token',
    'not_found',
    'rate_limited',
    'internal_error',
  ]);
  if (code && known.has(code)) return `error.${code}`;
  return 'error.generic';
}

export function localeLabelKey(locale: Locale): string {
  return `language.${locale === 'en' ? 'english' : locale === 'ja' ? 'japanese' : 'persian'}`;
}

export function detectLocale(candidates: readonly string[], stored?: string | null): Locale {
  if (isLocale(stored)) return stored;
  for (const candidate of candidates) {
    const base = candidate.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return FALLBACK_LOCALE;
}

export function applyDocumentLocale(locale: Locale): void {
  const root = document.documentElement;
  root.lang = locale;
  root.dir = directionFor(locale);
}
