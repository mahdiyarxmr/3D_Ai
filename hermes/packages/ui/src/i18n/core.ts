import type { SupportedLanguage } from '@hermes/shared';

/**
 * Localization runtime.
 *
 * Convention (see docs/I18N.md):
 *  - Resources are NESTED JSON objects, one file per namespace.
 *  - Lookup uses a dotted path: `t('permissions:levels.OBSERVE')`.
 *  - The namespace prefix is optional and defaults to `common`.
 *  - Fallback chain: requested language -> English -> the key itself.
 *  - Interpolation is `{{name}}`. Never build sentences by concatenation.
 */

export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';
export const NAMESPACES = ['common', 'settings', 'voice', 'permissions'] as const;
export type Namespace = (typeof NAMESPACES)[number];
export const DEFAULT_NAMESPACE: Namespace = 'common';

export type ResourceTree = { [key: string]: string | ResourceTree };
export type Resources = Record<string, Partial<Record<Namespace, ResourceTree>>>;

export interface TranslateOptions {
  /** Interpolation values for `{{placeholders}}`. */
  values?: Record<string, string | number>;
  /** Returned instead of the key when nothing resolves. */
  defaultValue?: string;
  /** Report misses (dev mode surfaces these). */
  onMissing?: (key: string, language: string) => void;
}

export function resolvePath(tree: ResourceTree | undefined, path: string): string | undefined {
  if (!tree) return undefined;
  let node: string | ResourceTree | undefined = tree;
  for (const segment of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as ResourceTree)[segment];
    if (node === undefined) return undefined;
  }
  return typeof node === 'string' ? node : undefined;
}

export function interpolate(template: string, values: Record<string, string | number> = {}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}

export function splitKey(key: string): { namespace: Namespace; path: string } {
  const index = key.indexOf(':');
  if (index === -1) return { namespace: DEFAULT_NAMESPACE, path: key };
  const namespace = key.slice(0, index) as Namespace;
  return { namespace: (NAMESPACES as readonly string[]).includes(namespace) ? namespace : DEFAULT_NAMESPACE, path: key.slice(index + 1) };
}

export function createTranslator(resources: Resources, language: string) {
  return (key: string, options: TranslateOptions = {}): string => {
    const { namespace, path } = splitKey(key);

    let template = resolvePath(resources[language]?.[namespace], path);
    if (template === undefined && language !== FALLBACK_LANGUAGE) {
      template = resolvePath(resources[FALLBACK_LANGUAGE]?.[namespace], path);
      if (template !== undefined) options.onMissing?.(key, language);
    }
    if (template === undefined) {
      options.onMissing?.(key, language);
      return options.defaultValue ?? key;
    }
    return interpolate(template, options.values);
  };
}

export type Translator = ReturnType<typeof createTranslator>;

/** Flatten a nested tree into dotted keys. Used by the parity tests. */
export function flattenKeys(tree: ResourceTree, prefix = ''): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.push(full);
    else out.push(...flattenKeys(value, full));
  }
  return out.sort();
}

/** Placeholders used by a template, e.g. "{{a}} {{b}}" -> ["a","b"]. */
export function extractPlaceholders(template: string): string[] {
  return [...template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!).sort();
}

/** Every dotted key -> template string, for placeholder comparison. */
export function flattenEntries(tree: ResourceTree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[full] = value;
    else Object.assign(out, flattenEntries(value, full));
  }
  return out;
}
