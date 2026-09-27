import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  NAMESPACES,
  createTranslator,
  extractPlaceholders,
  flattenEntries,
  flattenKeys,
  type ResourceTree,
  type Resources,
} from '@hermes/ui';
import { RTL_LANGUAGES, SUPPORTED_LANGUAGES, directionFor } from '@hermes/shared';

const LOCALES_DIR = join(__dirname, '..', 'locales');
const REFERENCE = 'en';

function load(language: string, namespace: string): ResourceTree {
  return JSON.parse(readFileSync(join(LOCALES_DIR, language, `${namespace}.json`), 'utf8')) as ResourceTree;
}

const languages = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const resources: Resources = Object.fromEntries(
  languages.map((language) => [language, Object.fromEntries(NAMESPACES.map((ns) => [ns, load(language, ns)]))]),
);

describe('locale inventory', () => {
  it('ships exactly the supported languages', () => {
    expect(languages).toEqual([...SUPPORTED_LANGUAGES].sort());
  });

  it('every language has every namespace', () => {
    for (const language of languages) {
      for (const namespace of NAMESPACES) {
        expect(() => load(language, namespace), `${language}/${namespace}.json`).not.toThrow();
      }
    }
  });
});

describe('key parity', () => {
  for (const namespace of NAMESPACES) {
    const reference = flattenKeys(load(REFERENCE, namespace));

    it(`${namespace}: English defines a non-trivial key set`, () => {
      expect(reference.length).toBeGreaterThan(5);
    });

    for (const language of languages.filter((l) => l !== REFERENCE)) {
      const keys = flattenKeys(load(language, namespace));

      it(`${namespace}: ${language} has no missing keys`, () => {
        expect(reference.filter((key) => !keys.includes(key))).toEqual([]);
      });

      it(`${namespace}: ${language} has no extra keys`, () => {
        expect(keys.filter((key) => !reference.includes(key))).toEqual([]);
      });
    }
  }
});

describe('interpolation parity', () => {
  for (const namespace of NAMESPACES) {
    const reference = flattenEntries(load(REFERENCE, namespace));

    for (const language of languages.filter((l) => l !== REFERENCE)) {
      const entries = flattenEntries(load(language, namespace));

      it(`${namespace}: ${language} uses the same placeholders`, () => {
        const mismatches: string[] = [];
        for (const [key, template] of Object.entries(reference)) {
          const translated = entries[key];
          if (translated === undefined) continue;
          const expected = extractPlaceholders(template);
          const actual = extractPlaceholders(translated);
          if (expected.join(',') !== actual.join(',')) {
            mismatches.push(`${key}: expected {{${expected.join('}},{{')}}} got {{${actual.join('}},{{')}}}`);
          }
        }
        expect(mismatches).toEqual([]);
      });
    }
  }
});

describe('translation quality guards', () => {
  for (const language of languages.filter((l) => l !== REFERENCE)) {
    it(`${language}: no value is left empty`, () => {
      const empty: string[] = [];
      for (const namespace of NAMESPACES) {
        for (const [key, value] of Object.entries(flattenEntries(load(language, namespace)))) {
          if (value.trim() === '') empty.push(`${namespace}:${key}`);
        }
      }
      expect(empty).toEqual([]);
    });

    it(`${language}: is actually translated, not copied from English`, () => {
      // Brand names, language endonyms and provider names are legitimately
      // identical across locales; everything else should differ.
      const ALLOWED_IDENTICAL = /^(app\.name|language\.(english|japanese|persian)|ai\.provider(Mock|Local|OpenAI)|sections\.joyai|title)$/;
      const identical: string[] = [];
      for (const namespace of NAMESPACES) {
        const reference = flattenEntries(load(REFERENCE, namespace));
        const entries = flattenEntries(load(language, namespace));
        for (const [key, value] of Object.entries(entries)) {
          if (ALLOWED_IDENTICAL.test(key)) continue;
          if (/^[A-Z0-9_.]+$/.test(reference[key] ?? '')) continue; // enum-ish values
          if (value === reference[key]) identical.push(`${namespace}:${key}`);
        }
      }
      expect(identical).toEqual([]);
    });
  }

  it('Japanese is not written in simplified Chinese characters', () => {
    // A cheap canary for the "treated JA as ZH" mistake called out in
    // docs/LOCALIZATION.md: these glyphs are simplified-only.
    const simplifiedOnly = /[设讯语见帮关闭开输见ţ]/;
    const offenders: string[] = [];
    for (const namespace of NAMESPACES) {
      for (const [key, value] of Object.entries(flattenEntries(load('ja', namespace)))) {
        if (simplifiedOnly.test(value)) offenders.push(`${namespace}:${key} -> ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('Persian uses Persian yeh/kaf, not the Arabic forms', () => {
    // U+064A ARABIC YEH and U+0643 ARABIC KAF render incorrectly in Persian.
    const arabicForms = /[\u064A\u0643]/;
    const offenders: string[] = [];
    for (const namespace of NAMESPACES) {
      for (const [key, value] of Object.entries(flattenEntries(load('fa', namespace)))) {
        if (arabicForms.test(value)) offenders.push(`${namespace}:${key} -> ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('fallback chain', () => {
  it('falls back to English for a missing key', () => {
    const partial: Resources = { en: { common: { only: { in: { english: 'English value' } } } }, fa: { common: {} } };
    const t = createTranslator(partial, 'fa');
    expect(t('only.in.english')).toBe('English value');
  });

  it('falls back to the key itself when nothing resolves', () => {
    const t = createTranslator({ en: { common: {} } }, 'en');
    expect(t('nothing.here')).toBe('nothing.here');
  });

  it('reports a miss so developer mode can surface it', () => {
    const misses: string[] = [];
    const t = createTranslator({ en: { common: {} } }, 'ja');
    t('missing.key', { onMissing: (key) => misses.push(key) });
    expect(misses).toEqual(['missing.key']);
  });

  it('resolves namespaced keys and defaults to common', () => {
    const t = createTranslator(resources, 'en');
    expect(t('permissions:levels.OBSERVE')).toBe('Observe');
    expect(t('nav.chat')).toBe('Chat');
  });

  it('interpolates values and leaves unknown placeholders intact', () => {
    const t = createTranslator({ en: { common: { greet: 'Hi {{name}}, you have {{n}}' } } }, 'en');
    expect(t('greet', { values: { name: 'Ada', n: 3 } })).toBe('Hi Ada, you have 3');
    expect(t('greet', { values: { name: 'Ada' } })).toBe('Hi Ada, you have {{n}}');
  });

  it('every language resolves a real string for a sample of real keys', () => {
    const sample = ['nav.chat', 'emergency.stop', 'settings:title', 'voice:params.pitch', 'permissions:levels.ASSIST'];
    for (const language of languages) {
      const t = createTranslator(resources, language);
      for (const key of sample) {
        const value = t(key);
        expect(value, `${language} ${key}`).not.toBe(key);
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe('text direction', () => {
  it('Persian is RTL', () => {
    expect(directionFor('fa')).toBe('rtl');
    expect(RTL_LANGUAGES.has('fa')).toBe(true);
  });

  it('English and Japanese are LTR', () => {
    expect(directionFor('en')).toBe('ltr');
    expect(directionFor('ja')).toBe('ltr');
  });
});
