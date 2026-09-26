import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { directionFor, type SupportedLanguage } from '@hermes/shared';
import { createTranslator, type Resources, type Translator } from './core.js';

interface I18nContextValue {
  language: SupportedLanguage;
  setLanguage: (language: SupportedLanguage) => void;
  dir: 'ltr' | 'rtl';
  t: Translator;
  missingKeys: readonly string[];
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  resources: Resources;
  language: SupportedLanguage;
  onLanguageChange?: (language: SupportedLanguage) => void;
  /** Collect misses so developer mode can surface them. */
  trackMissing?: boolean;
  children: React.ReactNode;
}

/**
 * Applies the language to <html lang> and <html dir> so RTL is a document-level
 * concern (logical CSS properties then do the rest — no mirrored stylesheets).
 */
export function I18nProvider({ resources, language, onLanguageChange, trackMissing = false, children }: I18nProviderProps) {
  const [missing, setMissing] = useState<string[]>([]);
  const dir = directionFor(language);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = language;
    root.dir = dir;
    root.dataset.lang = language;
  }, [language, dir]);

  const t = useMemo(() => {
    const translate = createTranslator(resources, language);
    return ((key, options = {}) =>
      translate(key, {
        ...options,
        onMissing: (missingKey, lang) => {
          options.onMissing?.(missingKey, lang);
          if (trackMissing) {
            setMissing((prev) => (prev.includes(missingKey) ? prev : [...prev, missingKey]));
          }
        },
      })) as Translator;
  }, [resources, language, trackMissing]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      dir,
      t,
      missingKeys: missing,
      setLanguage: (next) => onLanguageChange?.(next),
    }),
    [language, dir, t, missing, onLanguageChange],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

/** Convenience hook: `const t = useT();` */
export function useT(): Translator {
  return useI18n().t;
}

/**
 * Locale-aware number formatting. Persian uses Eastern Arabic digits by
 * default in fa-IR, which is correct for prose but wrong for file paths and
 * commands — those must stay in the Latin numeral system, hence `latin`.
 */
export function useFormatters() {
  const { language } = useI18n();
  return useMemo(() => {
    const locale = language === 'fa' ? 'fa-IR' : language === 'ja' ? 'ja-JP' : 'en-GB';
    return {
      number: (n: number, latin = false) => new Intl.NumberFormat(latin ? 'en-GB' : locale).format(n),
      dateTime: (d: Date | string | number) =>
        new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(d)),
      time: (d: Date | string | number) => new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }).format(new Date(d)),
      relative: (ms: number) => `${new Intl.NumberFormat(locale).format(Math.round(ms))} ms`,
    };
  }, [language]);
}
