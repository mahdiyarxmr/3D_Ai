import { describe, expect, it } from 'vitest';
import { detectLocale, directionFor, errorMessageKey, localeLabelKey, translate } from '../src/i18n';
import { bundles } from '../src/messages';

describe('LunaAI Web i18n', () => {
  it('renders English, Japanese and Persian strings', () => {
    expect(translate(bundles.en, 'nav.chat')).toBe('Chat');
    expect(translate(bundles.ja, 'nav.chat')).toBe('チャット');
    expect(translate(bundles.fa, 'nav.chat')).toBe('گفتگو');
  });

  it('uses Persian RTL and LTR for English/Japanese', () => {
    expect(directionFor('fa')).toBe('rtl');
    expect(directionFor('en')).toBe('ltr');
    expect(directionFor('ja')).toBe('ltr');
  });

  it('falls back to English and then to the key itself', () => {
    expect(translate({}, 'nav.chat', {}, bundles.en)).toBe('Chat');
    expect(translate({}, 'missing.key', {}, bundles.en)).toBe('missing.key');
  });

  it('interpolates named variables', () => {
    expect(translate(bundles.en, 'chat.tool.used', { name: 'calculate' })).toBe('Server tool used: calculate');
    expect(translate(bundles.fa, 'conversations.messageCount', { count: 3 })).toBe('۳ پیام'.replace('۳', '3'));
  });

  it('keeps every locale in sync with the English key set', () => {
    const englishKeys = Object.keys(bundles.en).sort();
    for (const locale of ['ja', 'fa'] as const) {
      expect(Object.keys(bundles[locale]).sort()).toEqual(englishKeys);
    }
  });

  it('never leaves a value empty', () => {
    for (const locale of ['en', 'ja', 'fa'] as const) {
      for (const [key, value] of Object.entries(bundles[locale])) {
        expect(value.trim(), `${locale}:${key}`).not.toBe('');
      }
    }
  });

  it('maps error codes to localization keys', () => {
    expect(errorMessageKey('email_taken')).toBe('error.email_taken');
    expect(errorMessageKey('unknown_code')).toBe('error.generic');
    expect(errorMessageKey(undefined)).toBe('error.generic');
  });

  it('detects locale from browser preferences with English fallback', () => {
    expect(detectLocale(['ja-JP', 'en-US'])).toBe('ja');
    expect(detectLocale(['fa-IR'])).toBe('fa');
    expect(detectLocale(['de-DE', 'fr-FR'])).toBe('en');
    expect(detectLocale(['de-DE'], 'fa')).toBe('fa');
    expect(localeLabelKey('fa')).toBe('language.persian');
  });
});
