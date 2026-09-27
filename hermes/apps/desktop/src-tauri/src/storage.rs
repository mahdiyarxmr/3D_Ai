//! SQLite-backed persistence: settings, characters and the audit log.
//!
//! The audit table is append-only by construction: there is no UPDATE or
//! DELETE statement anywhere in this module except the retention sweep, which
//! can only remove rows older than the configured window.

use chrono::Utc;
use parking_lot::Mutex;
use rusqlite::{params, Connection};
use serde_json::Value;
use std::path::{Path, PathBuf};

pub struct Store {
    conn: Mutex<Connection>,
    root: PathBuf,
}

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

impl serde::Serialize for StoreError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

impl Store {
    pub fn open(root: &Path) -> Result<Self, StoreError> {
        std::fs::create_dir_all(root)?;
        std::fs::create_dir_all(root.join("characters"))?;
        std::fs::create_dir_all(root.join("logs"))?;
        std::fs::create_dir_all(root.join("settings"))?;
        std::fs::create_dir_all(root.join("memory"))?;

        let conn = Connection::open(root.join("hermes.sqlite3"))?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS characters (
                id         TEXT PRIMARY KEY,
                payload    TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS audit (
                id             TEXT PRIMARY KEY,
                at             TEXT NOT NULL,
                run_id         TEXT,
                call_id        TEXT NOT NULL,
                tool           TEXT NOT NULL,
                args           TEXT NOT NULL,
                risk           TEXT NOT NULL,
                level          TEXT NOT NULL,
                outcome        TEXT NOT NULL,
                reason         TEXT,
                detail         TEXT,
                duration_ms    INTEGER,
                result_summary TEXT,
                confirmed_by   TEXT
            );
            CREATE INDEX IF NOT EXISTS audit_at_idx ON audit (at DESC);
            CREATE INDEX IF NOT EXISTS audit_tool_idx ON audit (tool);
            "#,
        )?;
        Ok(Store {
            conn: Mutex::new(conn),
            root: root.to_path_buf(),
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /* ----------------------------- settings ---------------------------- */

    pub fn load_settings(&self) -> Result<Value, StoreError> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = 'app'")?;
        let mut rows = stmt.query([])?;
        if let Some(row) = rows.next()? {
            let raw: String = row.get(0)?;
            Ok(serde_json::from_str(&raw)?)
        } else {
            Ok(Value::Object(Default::default()))
        }
    }

    pub fn save_settings(&self, settings: &Value) -> Result<(), StoreError> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('app', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![serde_json::to_string(settings)?],
        )?;
        Ok(())
    }

    /* ---------------------------- characters --------------------------- */

    pub fn list_characters(&self) -> Result<Vec<Value>, StoreError> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare("SELECT payload FROM characters ORDER BY updated_at DESC")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(serde_json::from_str(&row?)?);
        }
        Ok(out)
    }

    pub fn save_character(&self, character: &Value) -> Result<(), StoreError> {
        let id = character
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("default")
            .to_string();
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO characters (id, payload, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
            params![id, serde_json::to_string(character)?, Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }

    pub fn delete_character(&self, id: &str) -> Result<(), StoreError> {
        {
            let conn = self.conn.lock();
            conn.execute("DELETE FROM characters WHERE id = ?1", params![id])?;
        }
        let dir = self.character_dir(id);
        if dir.exists() {
            std::fs::remove_dir_all(dir)?;
        }
        Ok(())
    }

    fn character_dir(&self, id: &str) -> PathBuf {
        // `id` is constrained to a lowercase slug by the TypeScript schema; we
        // re-sanitise here so a malicious IPC payload cannot traverse out.
        let safe: String = id
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
            .take(64)
            .collect();
        self.root.join("characters").join(safe)
    }

    pub fn save_vrm(&self, id: &str, bytes: &[u8]) -> Result<String, StoreError> {
        let dir = self.character_dir(id);
        std::fs::create_dir_all(&dir)?;
        let path = dir.join("character.vrm");
        std::fs::write(&path, bytes)?;
        Ok(format!("characters/{id}/character.vrm"))
    }

    pub fn load_vrm(&self, id: &str) -> Result<Option<Vec<u8>>, StoreError> {
        let path = self.character_dir(id).join("character.vrm");
        if !path.exists() {
            return Ok(None);
        }
        Ok(Some(std::fs::read(path)?))
    }

    /* ------------------------------ audit ------------------------------ */

    pub fn audit_append(&self, record: &Value) -> Result<(), StoreError> {
        let get = |key: &str| record.get(key).and_then(Value::as_str).map(str::to_string);
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO audit (id, at, run_id, call_id, tool, args, risk, level, outcome, reason, detail, duration_ms, result_summary, confirmed_by)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                get("id").unwrap_or_else(|| Utc::now().timestamp_nanos_opt().unwrap_or(0).to_string()),
                get("at").unwrap_or_else(|| Utc::now().to_rfc3339()),
                get("runId"),
                get("callId").unwrap_or_default(),
                get("tool").unwrap_or_default(),
                serde_json::to_string(record.get("args").unwrap_or(&Value::Null))?,
                get("risk").unwrap_or_else(|| "SAFE".into()),
                get("level").unwrap_or_else(|| "OBSERVE".into()),
                get("outcome").unwrap_or_default(),
                get("reason"),
                get("detail"),
                record.get("durationMs").and_then(Value::as_i64),
                get("resultSummary"),
                get("confirmedBy"),
            ],
        )?;
        Ok(())
    }

    pub fn audit_query(&self, limit: i64, tool: Option<&str>) -> Result<Vec<Value>, StoreError> {
        let conn = self.conn.lock();
        let sql = if tool.is_some() {
            "SELECT id, at, run_id, call_id, tool, args, risk, level, outcome, reason, detail, duration_ms, result_summary
             FROM audit WHERE tool = ?2 ORDER BY at DESC LIMIT ?1"
        } else {
            "SELECT id, at, run_id, call_id, tool, args, risk, level, outcome, reason, detail, duration_ms, result_summary
             FROM audit ORDER BY at DESC LIMIT ?1"
        };
        let mut stmt = conn.prepare(sql)?;
        let map = |row: &rusqlite::Row<'_>| -> rusqlite::Result<Value> {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "at": row.get::<_, String>(1)?,
                "runId": row.get::<_, Option<String>>(2)?,
                "callId": row.get::<_, String>(3)?,
                "tool": row.get::<_, String>(4)?,
                "args": serde_json::from_str::<Value>(&row.get::<_, String>(5)?).unwrap_or(Value::Null),
                "risk": row.get::<_, String>(6)?,
                "level": row.get::<_, String>(7)?,
                "outcome": row.get::<_, String>(8)?,
                "reason": row.get::<_, Option<String>>(9)?,
                "detail": row.get::<_, Option<String>>(10)?,
                "durationMs": row.get::<_, Option<i64>>(11)?,
                "resultSummary": row.get::<_, Option<String>>(12)?,
            }))
        };
        let rows = match tool {
            Some(tool) => stmt.query_map(params![limit, tool], map)?.collect::<Result<Vec<_>, _>>()?,
            None => stmt.query_map(params![limit], map)?.collect::<Result<Vec<_>, _>>()?,
        };
        Ok(rows)
    }

    /// Retention sweep. The only statement in HERMES that removes audit rows.
    pub fn audit_prune(&self, retain_days: i64) -> Result<usize, StoreError> {
        let cutoff = (Utc::now() - chrono::Duration::days(retain_days)).to_rfc3339();
        let conn = self.conn.lock();
        Ok(conn.execute("DELETE FROM audit WHERE at < ?1", params![cutoff])?)
    }
}
