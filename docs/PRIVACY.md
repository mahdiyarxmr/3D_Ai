# Privacy

LunaAI Web and LunaAI PC handle data differently, and both tell the user which is which.

## LunaAI Web

| Question | Answer |
| --- | --- |
| Where is data stored? | On the operator's server: SQLite database plus server logs. |
| What leaves the server? | Conversation content is sent to the configured AI provider when a message is generated. Nothing is sent to LunaAI PC. |
| Telemetry | None. There is no analytics or tracking code in this repository. |
| What can the service see about my device? | Only what a browser normally sends (IP for rate limiting, `User-Agent`). No files are read from your machine, and uploads are limited to the bytes you send. |

## LunaAI PC

| Question | Answer |
| --- | --- |
| Where is data stored? | `%APPDATA%\LunaAI` in your own profile: settings, conversations, tasks, audit log, application log, and screenshots taken by the screen-capture tool. |
| Which data leaves the computer? | Only conversation messages sent to the AI provider you configured. Screenshots, file contents and audit records stay local unless you enable a sharing setting. |
| Is there a network listener? | No. The application opens no socket; the UI and agent run in one process. |
| Is anything uploaded silently? | No. There is no background upload path, and the privacy settings expose the two places where data could leave (screenshots, file contents). |
| Audit of actions | Every permission decision and execution is appended to `audit/lunaai-pc-audit.jsonl`, with secrets redacted. |
| Screenshots | Stored locally under `screenshots/` when a capture tool runs. Forwarding image bytes to a remote model requires an explicit setting and is not implemented yet. |

## Secrets

* LunaAI Web: provider keys and `JWT_SECRET` come from environment variables and never reach clients,
  logs or audit records.
* LunaAI PC: the provider key is read from an environment variable named in settings; the settings
  file stores only that variable's name. Logs, audit records and exception messages pass through the
  secret redactor.
* Do not commit `.env` files; `.env.example` is the template. Key material in a repository history is
  a permanent leak — rotate immediately if it happens.
