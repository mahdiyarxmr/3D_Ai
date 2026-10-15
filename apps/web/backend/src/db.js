import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * LunaAI Web data layer.
 *
 * Every conversation is owned by exactly one user. All read/write helpers take
 * the owning user id so that ownership is enforced in the query itself rather
 * than only in the HTTP layer.
 */
export function createDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id);

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','ja','fa')),
      theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system','light','dark')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      kind TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return new LunaDatabase(db);
}

export class LunaDatabase {
  constructor(db) {
    this.db = db;
  }

  close() {
    this.db.close();
  }

  // ---- users -----------------------------------------------------------

  createUser({ email, name, passwordHash }) {
    const insert = this.db.prepare(
      'INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)'
    );
    const info = insert.run(normalizeEmail(email), name, passwordHash);
    this.db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(info.lastInsertRowid);
    return this.findUserById(info.lastInsertRowid);
  }

  findUserByEmail(email) {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(normalizeEmail(email));
  }

  findUserById(id) {
    const row = this.db
      .prepare('SELECT id, email, name, created_at FROM users WHERE id = ?')
      .get(id);
    return row ? toPublicUser(row) : undefined;
  }

  // ---- conversations ---------------------------------------------------

  createConversation(userId, title = '') {
    const info = this.db
      .prepare('INSERT INTO conversations (user_id, title) VALUES (?, ?)')
      .run(userId, title);
    return this.getConversation(userId, info.lastInsertRowid);
  }

  listConversations(userId, { limit = 100, offset = 0 } = {}) {
    return this.db
      .prepare(
        `SELECT id, title, created_at, updated_at,
                (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
           FROM conversations c
          WHERE user_id = ?
          ORDER BY updated_at DESC, id DESC
          LIMIT ? OFFSET ?`
      )
      .all(userId, limit, offset);
  }

  /** Returns the conversation only when it belongs to the given user. */
  getConversation(userId, conversationId) {
    return this.db
      .prepare('SELECT id, user_id, title, created_at, updated_at FROM conversations WHERE id = ? AND user_id = ?')
      .get(conversationId, userId);
  }

  renameConversation(userId, conversationId, title) {
    const info = this.db
      .prepare("UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(title, conversationId, userId);
    return info.changes > 0;
  }

  deleteConversation(userId, conversationId) {
    const info = this.db
      .prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?')
      .run(conversationId, userId);
    return info.changes > 0;
  }

  searchConversations(userId, query, limit = 30) {
    const like = `%${query.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    return this.db
      .prepare(
        `SELECT c.id, c.title, c.updated_at,
                m.content AS snippet,
                m.role AS snippet_role
           FROM conversations c
           JOIN messages m ON m.conversation_id = c.id
          WHERE c.user_id = ?
            AND (m.content LIKE ? ESCAPE '\\' OR c.title LIKE ? ESCAPE '\\')
          ORDER BY c.updated_at DESC, m.id DESC
          LIMIT ?`
      )
      .all(userId, like, like, limit);
  }

  // ---- messages --------------------------------------------------------

  addMessage(conversationId, role, content) {
    const info = this.db
      .prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)')
      .run(conversationId, role, content);
    this.db
      .prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?")
      .run(conversationId);
    return info.lastInsertRowid;
  }

  listMessages(conversationId, { limit = 500 } = {}) {
    return this.db
      .prepare(
        `SELECT id, role, content, created_at FROM messages
          WHERE conversation_id = ? ORDER BY id ASC LIMIT ?`
      )
      .all(conversationId, limit);
  }

  // ---- settings --------------------------------------------------------

  getSettings(userId) {
    return this.db
      .prepare('SELECT language, theme FROM user_settings WHERE user_id = ?')
      .get(userId);
  }

  updateSettings(userId, { language, theme }) {
    this.db
      .prepare(
        `UPDATE user_settings
            SET language = COALESCE(?, language),
                theme = COALESCE(?, theme),
                updated_at = datetime('now')
          WHERE user_id = ?`
      )
      .run(language ?? null, theme ?? null, userId);
    return this.getSettings(userId);
  }

  // ---- audit -----------------------------------------------------------

  recordAudit({ userId = null, kind, detail = '' }) {
    this.db
      .prepare('INSERT INTO audit_events (user_id, kind, detail) VALUES (?, ?, ?)')
      .run(userId, kind, detail);
  }
}

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

export function toPublicUser(row) {
  return { id: row.id, email: row.email, name: row.name, createdAt: row.created_at };
}
