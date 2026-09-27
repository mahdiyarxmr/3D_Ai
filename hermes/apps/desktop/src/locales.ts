import type { Resources, ResourceTree } from '@hermes/ui';

/**
 * Locale bundles are compiled in at build time via Vite's glob import, so a
 * missing file is a build error rather than a runtime 404. Adding a language
 * means adding a folder under `locales/` — nothing here changes.
 */
const modules = import.meta.glob('../../../locales/*/*.json', { eager: true }) as Record<string, { default: ResourceTree }>;

export const resources: Resources = (() => {
  const out: Resources = {};
  for (const [path, module] of Object.entries(modules)) {
    const match = /locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
    if (!match) continue;
    const [, language, namespace] = match as unknown as [string, string, string];
    out[language] ??= {};
    (out[language] as Record<string, ResourceTree>)[namespace] = module.default;
  }
  return out;
})();

export const availableLanguages = Object.keys(resources).sort();
