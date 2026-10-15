import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const dbPath = process.env.DB_PATH || './data/lunaai.db';
mkdirSync(dirname(dbPath), { recursive: true });
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
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT 'New conversation',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS settings (
  user_id INTEGER PRIMARY KEY,
  language TEXT NOT NULL DEFAULT 'en',
  theme TEXT NOT NULL DEFAULT 'light',
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

export function createUser(email, name, passwordHash) {
  const stmt = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?,?,?)');
  const info = stmt.run(email.toLowerCase(), name, passwordHash);
  db.prepare('INSERT INTO settings (user_id) VALUES (?)').run(info.lastInsertRowid);
  return info.lastInsertRowid;
}

export function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
}

export function findUserById(id) {
  return db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(id);
}

export function createConversation(userId, title = 'New conversation') {
  const info = db.prepare('INSERT INTO conversations (user_id, title) VALUES (?,?)').run(userId, title);
  return info.lastInsertRowid;
}

export function listConversations(userId) {
  return db.prepare('SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
}

export function getConversation(userId, convId) {
  return db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(convId, userId);
}

export function deleteConversation(userId, convId) {
  const conv = getConversation(userId, convId);
  if (!conv) return false;
  db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').run(convId, userId);
  return true;
}

export function addMessage(convId, role, content) {
  const info = db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)').run(convId, role, content);
  db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(convId);
  return info.lastInsertRowid;
}

export function listMessages(convId) {
  return db.prepare('SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC').all(convId);
}

export function getSettings(userId) {
  return db.prepare('SELECT language, theme FROM settings WHERE user_id = ?').get(userId);
}

export function updateSettings(userId, language, theme) {
  db.prepare('UPDATE settings SET language = COALESCE(?, language), theme = COALESCE(?, theme) WHERE user_id = ?').run(language, theme, userId);
}

export default db;
