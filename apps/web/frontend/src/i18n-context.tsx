import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  FALLBACK_LOCALE,
  applyDocumentLocale,
  detectLocale,
  directionFor,
  translate,
  type Locale,
} from './i18n';
import { bundles } from './messages';

const STORAGE_KEY = 'lunaai.web.locale';

interface I18nValue {
  locale: Locale;
  direction: 'ltr' | 'rtl';
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (initialLocale) return initialLocale;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    return detectLocale(window.navigator.languages ?? [window.navigator.language], stored);
  });

  useEffect(() => {
    applyDocumentLocale(locale);
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      /* ignore storage failures */
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);

  const value = useMemo<I18nValue>(() => {
    const messages = bundles[locale];
    const fallback = bundles[FALLBACK_LOCALE];
    return {
      locale,
      direction: directionFor(locale),
      setLocale,
      t: (key, vars) => translate(messages, key, vars, fallback),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
