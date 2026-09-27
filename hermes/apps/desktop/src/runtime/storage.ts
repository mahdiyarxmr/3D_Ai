import { CharacterSchema, SettingsSchema, type Character, type Settings } from '@hermes/shared';
import type { AuditRecord, AuditSink } from '@hermes/agent-protocol';
import { IS_TAURI, invokeCommand } from './platform.js';

/**
 * Persistence.
 *
 * Tauri  -> SQLite + the app data directory, via Rust commands.
 * Browser-> localStorage / IndexedDB, so the UI is fully usable in dev.
 *
 * The VRM binary itself goes to IndexedDB (browser) or
 * `storage/characters/<id>/character.vrm` (desktop) — never localStorage,
 * which cannot hold tens of megabytes.
 */

const SETTINGS_KEY = 'hermes.settings.v1';
const CHARACTERS_KEY = 'hermes.characters.v1';
const AUDIT_KEY = 'hermes.audit.v1';
const DB_NAME = 'hermes-assets';
const DB_STORE = 'vrm';

export interface StorageBackend {
  loadSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
  listCharacters(): Promise<Character[]>;
  saveCharacter(character: Character): Promise<void>;
  deleteCharacter(id: string): Promise<void>;
  saveVrm(characterId: string, bytes: ArrayBuffer): Promise<string>;
  loadVrm(characterId: string): Promise<ArrayBuffer | null>;
  audit: AuditSink;
}

/* ----------------------------- browser ----------------------------- */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

class BrowserAuditSink implements AuditSink {
  private cache: AuditRecord[] | null = null;

  private read(): AuditRecord[] {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(localStorage.getItem(AUDIT_KEY) ?? '[]') as AuditRecord[];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  append(record: AuditRecord): void {
    const records = this.read();
    records.push(record);
    // Keep the dev log bounded; the desktop build uses SQLite with retention.
    if (records.length > 1000) records.splice(0, records.length - 1000);
    localStorage.setItem(AUDIT_KEY, JSON.stringify(records));
  }

  query(filter: { since?: string; tool?: string; limit?: number } = {}): AuditRecord[] {
    let out = [...this.read()].reverse();
    if (filter.since) out = out.filter((r) => r.at >= filter.since!);
    if (filter.tool) out = out.filter((r) => r.tool === filter.tool);
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  clear(): void {
    this.cache = [];
    localStorage.removeItem(AUDIT_KEY);
  }
}

class BrowserStorage implements StorageBackend {
  readonly audit = new BrowserAuditSink();

  async loadSettings(): Promise<Settings> {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return SettingsSchema.parse({});
      return SettingsSchema.parse(JSON.parse(raw));
    } catch {
      return SettingsSchema.parse({});
    }
  }

  async saveSettings(settings: Settings): Promise<void> {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  async listCharacters(): Promise<Character[]> {
    try {
      const raw = JSON.parse(localStorage.getItem(CHARACTERS_KEY) ?? '[]') as unknown[];
      return raw.map((c) => CharacterSchema.parse(c));
    } catch {
      return [];
    }
  }

  async saveCharacter(character: Character): Promise<void> {
    const all = await this.listCharacters();
    const index = all.findIndex((c) => c.id === character.id);
    if (index >= 0) all[index] = character;
    else all.push(character);
    localStorage.setItem(CHARACTERS_KEY, JSON.stringify(all));
  }

  async deleteCharacter(id: string): Promise<void> {
    const all = (await this.listCharacters()).filter((c) => c.id !== id);
    localStorage.setItem(CHARACTERS_KEY, JSON.stringify(all));
    const db = await openDb();
    db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).delete(id);
  }

  async saveVrm(characterId: string, bytes: ArrayBuffer): Promise<string> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(bytes, characterId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return `idb://${DB_STORE}/${characterId}`;
  }

  async loadVrm(characterId: string): Promise<ArrayBuffer | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(characterId);
      request.onsuccess = () => resolve((request.result as ArrayBuffer | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  }
}

/* ------------------------------ tauri ------------------------------ */

class TauriAuditSink implements AuditSink {
  async append(record: AuditRecord): Promise<void> {
    await invokeCommand('audit_append', { record });
  }

  async query(filter: { since?: string; tool?: string; limit?: number } = {}): Promise<AuditRecord[]> {
    return invokeCommand<AuditRecord[]>('audit_query', { filter });
  }
}

class TauriStorage implements StorageBackend {
  readonly audit = new TauriAuditSink();

  async loadSettings(): Promise<Settings> {
    const raw = await invokeCommand<unknown>('settings_load');
    return SettingsSchema.parse(raw ?? {});
  }

  async saveSettings(settings: Settings): Promise<void> {
    await invokeCommand('settings_save', { settings });
  }

  async listCharacters(): Promise<Character[]> {
    const raw = await invokeCommand<unknown[]>('characters_list');
    return raw.map((c) => CharacterSchema.parse(c));
  }

  async saveCharacter(character: Character): Promise<void> {
    await invokeCommand('character_save', { character });
  }

  async deleteCharacter(id: string): Promise<void> {
    await invokeCommand('character_delete', { id });
  }

  async saveVrm(characterId: string, bytes: ArrayBuffer): Promise<string> {
    return invokeCommand<string>('character_save_vrm', { id: characterId, bytes: Array.from(new Uint8Array(bytes)) });
  }

  async loadVrm(characterId: string): Promise<ArrayBuffer | null> {
    const bytes = await invokeCommand<number[] | null>('character_load_vrm', { id: characterId });
    return bytes ? new Uint8Array(bytes).buffer : null;
  }
}

export const storage: StorageBackend = IS_TAURI ? new TauriStorage() : new BrowserStorage();
export const isBrowserStorage = !IS_TAURI;
