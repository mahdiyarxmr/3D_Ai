# Local file formats

| File | Product | Format | Notes |
| --- | --- | --- | --- |
| `locales/<locale>/common.json` | both | JSON object of string keys | Shared vocabulary. |
| `locales/<locale>/web.json` | LunaAI Web | JSON object | Web-only strings. |
| `locales/<locale>/pc.json` | LunaAI PC | JSON object | Desktop-only strings. |
| `%APPDATA%\LunaAI\settings.json` | LunaAI PC | JSON, written atomically | Contains no secrets; stores the *name* of the API key environment variable. |
| `%APPDATA%\LunaAI\conversations.json` | LunaAI PC | JSON array of conversations | Messages inline; local only. |
| `%APPDATA%\LunaAI\tasks.json` | LunaAI PC | JSON array of task plans | Steps with status and result. |
| `%APPDATA%\LunaAI\audit\lunaai-pc-audit.jsonl` | LunaAI PC | JSON Lines, append-only | One event per line: timestamp, kind, tool, decision, reason, risk, level, redacted details. |
| `%APPDATA%\LunaAI\logs\lunaai-pc.log` | LunaAI PC | JSON Lines | Structured log, redacted. |
| `%APPDATA%\LunaAI\screenshots\*.png` | LunaAI PC | PNG | Captured locally by the screen tool. |
| `data/lunaai-web.db` (configurable) | LunaAI Web | SQLite | `users`, `conversations`, `messages`, `user_settings`, `audit_events`. |

Rules:

* Asset files (VRM models, images) are untrusted data. They are validated before loading and are never
  executed as code.
* Reader implementations tolerate a corrupted record: an unreadable audit line is skipped, and a
  malformed settings file falls back to defaults.
* Writers use a temporary file plus an atomic move so an interrupted write cannot corrupt user data.
