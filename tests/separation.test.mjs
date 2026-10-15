import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(directory, { skip = [] } = {}) {
  const results = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'bin' || entry === 'obj') continue;
    const full = path.join(directory, entry);
    if (skip.some((fragment) => full.includes(fragment))) continue;
    const stats = statSync(full);
    if (stats.isDirectory()) results.push(...walk(full, { skip }));
    else results.push(full);
  }
  return results;
}

function readAll(directory) {
  return walk(directory)
    .filter((file) => /\.(js|mjs|ts|tsx|json|md|css|html)$/.test(file))
    .map((file) => ({ file, content: readFileSync(file, 'utf8') }));
}

describe('LunaAI Web / LunaAI PC separation', () => {
  const webFiles = readAll(path.join(repoRoot, 'apps/web'));
  // The web backend's own tests name the forbidden tool names on purpose in order
  // to prove they cannot be registered. Production code is scanned strictly.
  const webProductionFiles = webFiles.filter(({ file }) => !/apps[\\/]web[\\/].*[\\/]tests[\\/]/.test(file));
  const localeFiles = readAll(path.join(repoRoot, 'locales'));

  it('LunaAI Web contains no local computer-control capability', () => {
    const forbidden = [
      'LunaAI.PC',
      'capture_screen',
      'mouse_click',
      'type_text',
      'press_key',
      'list_windows',
      'launch_application',
      'ToolCapability.ControlInput',
      'EmergencyStop',
    ];

    for (const { file, content } of webProductionFiles) {
      for (const token of forbidden) {
        assert.ok(
          !content.includes(token),
          `${path.relative(repoRoot, file)} must not reference the privileged desktop capability "${token}"`
        );
      }
    }
  });

  it('LunaAI Web never exposes a privileged local-execution endpoint', () => {
    for (const { file, content } of webProductionFiles) {
      if (!file.endsWith('.js')) continue;
      for (const route of ['/api/pc', '/api/computer', '/api/shell', '/api/execute', '/api/local']) {
        assert.ok(!content.includes(route), `${path.relative(repoRoot, file)} must not define ${route}`);
      }
    }
  });

  it('LunaAI PC does not depend on the web application at runtime', () => {
    const pcFiles = readAll(path.join(repoRoot, 'apps/pc'));
    for (const { file, content } of pcFiles) {
      assert.ok(!content.includes('apps/web'), `${path.relative(repoRoot, file)} must not import the web app`);
    }
  });

  it('branding is LunaAI everywhere in product materials', () => {
    const filesToCheck = [
      ...readAll(path.join(repoRoot, 'locales')),
      ...readAll(path.join(repoRoot, 'docs')),
      ...readAll(path.join(repoRoot, 'apps')),
      path.join(repoRoot, 'README.md'),
    ];

    for (const entry of filesToCheck) {
      const file = typeof entry === 'string' ? entry : entry.file;
      const content = typeof entry === 'string' ? readFileSync(entry, 'utf8') : entry.content;
      if (path.basename(file) === 'ROADMAP.md' || path.relative(repoRoot, file).startsWith('docs/HISTORY')) continue;
      assert.ok(!/\bHERMES\b/i.test(content), `${path.relative(repoRoot, file)} still contains the previous product name`);
    }
  });

  it('the shared contract package exposes no computer-control schema', () => {
    const sharedFiles = readAll(path.join(repoRoot, 'packages/shared-contracts'));
    for (const { file, content } of sharedFiles) {
      assert.ok(!/computer|shell|screenshot|mouse|keyboard/i.test(content), `${path.relative(repoRoot, file)} must stay non-privileged`);
    }
  });

  it('every locale directory provides the same keys', () => {
    const byLocale = new Map();
    for (const { file, content } of localeFiles) {
      const locale = path.basename(path.dirname(file));
      const namespace = path.basename(file);
      const parsed = JSON.parse(content);
      const entry = byLocale.get(locale) ?? { keys: new Set() };
      for (const key of Object.keys(parsed)) entry.keys.add(`${namespace}:${key}`);
      byLocale.set(locale, entry);
    }

    const english = byLocale.get('en');
    assert.ok(english, 'the en locale directory is required');

    for (const [locale, entry] of byLocale) {
      const missing = [...english.keys].filter((key) => !entry.keys.has(key));
      assert.deepEqual(missing, [], `${locale} is missing keys present in en`);
    }
  });
});
