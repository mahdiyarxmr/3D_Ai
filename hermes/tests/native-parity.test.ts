import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOL_IDS, getTool } from '@hermes/agent-protocol';

/**
 * The tool catalogue exists in three places: TypeScript (authoritative), Rust
 * (native re-check) and Python (service contract). Drift between them is a
 * security bug — a tool the native side does not recognise would be rejected,
 * but worse, a tool mapped to the wrong capability would be under-restricted.
 */

const ROOT = join(__dirname, '..');
const RUST = readFileSync(join(ROOT, 'apps/desktop/src-tauri/src/permissions.rs'), 'utf8');
const PYTHON = readFileSync(join(ROOT, 'services/computer/contract.py'), 'utf8');

const RUST_CAPABILITY_NAMES: Record<string, string> = {
  Observe: 'observe',
  Input: 'input',
  FsRead: 'fs.read',
  FsWrite: 'fs.write',
  FsDelete: 'fs.delete',
  Process: 'process',
  Shell: 'shell',
};

function parseRust(): Map<string, string> {
  const body = RUST.slice(RUST.indexOf('pub fn capability_of'), RUST.indexOf('#[derive(Debug, thiserror::Error)]'));
  const out = new Map<string, string>();
  // Arms look like: "a" | "b" => Capability::Input,
  for (const match of body.matchAll(/((?:"[\w.]+"\s*\|?\s*)+)=>\s*Capability::(\w+)/g)) {
    const capability = RUST_CAPABILITY_NAMES[match[2]!];
    for (const id of match[1]!.matchAll(/"([\w.]+)"/g)) out.set(id[1]!, capability!);
  }
  return out;
}

function parsePython(): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of PYTHON.matchAll(/"([\w.]+)":\s*"([\w.]+)",/g)) out.set(match[1]!, match[2]!);
  return out;
}

describe('tool catalogue parity', () => {
  const rust = parseRust();
  const python = parsePython();

  it('parsed all three catalogues', () => {
    expect(TOOL_IDS.length).toBeGreaterThan(15);
    expect(rust.size).toBe(TOOL_IDS.length);
    expect(python.size).toBe(TOOL_IDS.length);
  });

  it('Rust knows every TypeScript tool, with the same capability', () => {
    for (const id of TOOL_IDS) {
      expect(rust.get(id), `rust missing ${id}`).toBe(getTool(id)!.capability);
    }
  });

  it('Python knows every TypeScript tool, with the same capability', () => {
    for (const id of TOOL_IDS) {
      expect(python.get(id), `python missing ${id}`).toBe(getTool(id)!.capability);
    }
  });

  it('neither mirror declares a tool TypeScript does not', () => {
    const known = new Set<string>(TOOL_IDS);
    expect([...rust.keys()].filter((id) => !known.has(id))).toEqual([]);
    expect([...python.keys()].filter((id) => !known.has(id))).toEqual([]);
  });

  it('the Rust OBSERVE level matches the TypeScript one', () => {
    // Rust: Level::Observe => matches!(capability, Capability::Observe | Capability::FsRead)
    expect(RUST).toMatch(/Level::Observe\s*=>\s*matches!\(\s*capability,\s*Capability::Observe\s*\|\s*Capability::FsRead\s*\)/);
  });
});
