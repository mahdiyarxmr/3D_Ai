# API

Two distinct surfaces: **Tauri IPC commands** (webview ↔ Rust core) and the
**local HTTP services** (Rust/webview ↔ Python sidecars). Both are
authenticated; neither treats locality as trust.

## Tauri IPC commands

Invoked with `invoke(name, args)`. Errors are serialised as strings.

| Command              | Arguments                        | Returns              | Notes                                              |
| -------------------- | -------------------------------- | -------------------- | -------------------------------------------------- |
| `settings_load`      | —                                | `Settings`           | Also refreshes the native policy cache              |
| `settings_save`      | `{ settings }`                   | —                    | Refreshes the native policy cache                   |
| `characters_list`    | —                                | `Character[]`        |                                                     |
| `character_save`     | `{ character }`                  | —                    |                                                     |
| `character_delete`   | `{ id }`                         | —                    | Also removes the VRM directory                      |
| `character_save_vrm` | `{ id, bytes }`                  | relative path        | `id` re-sanitised natively against traversal        |
| `character_load_vrm` | `{ id }`                         | `number[] \| null`   |                                                     |
| `audit_append`       | `{ record }`                     | —                    | Append-only                                         |
| `audit_query`        | `{ filter? }`                    | `AuditRecord[]`      | `{ tool?, limit? }`, limit clamped to 1–5000        |
| `execute_tool`       | `{ request: { tool, args } }`    | `{ summary, data? }` | **Re-checks policy natively** before dispatch       |
| `emergency_stop`     | —                                | —                    | Engages the native kill switch                      |
| `emergency_reset`    | —                                | —                    |                                                     |
| `tray_set_labels`    | `{ labels }`                     | —                    | Localized tray strings pushed from the frontend     |

There is deliberately **no** generic `run_command` or `write_file` command.
`execute_tool` is the only route to the OS.

### Events

Emitted by Rust, consumed by the webview:

| Event                      | Payload   | Meaning                             |
| -------------------------- | --------- | ----------------------------------- |
| `tray://action`            | `string`  | `show`/`companion`/`expanded`/`emergency-stop` |
| `hermes://emergency-stop`  | `boolean` | Stop engaged or released            |

### In-process agent events

`packages/agent-protocol` emits these to the UI layer (see
`HermesEvent` in `packages/shared/src/events.ts`):

```
agent.started        agent.thinking       agent.tool.started
agent.tool.completed agent.permission.required
agent.message        agent.completed      agent.interrupted
voice.started        voice.viseme         voice.completed
avatar.expression    emergency.stop
```

## Local HTTP services

All requests require `Authorization: Bearer <signed-token>` — see
[SECURITY.md](SECURITY.md). `/health` is the only unauthenticated endpoint, and
it returns nothing sensitive.

### agent — `127.0.0.1:8731`

| Method | Path         | Body              | Returns     |
| ------ | ------------ | ----------------- | ----------- |
| GET    | `/health`    | —                 | `{ status }` |
| GET    | `/providers` | —                 | `{ providers: string[] }` |
| POST   | `/complete`  | `CompleteRequest` | `AgentStep` |

```jsonc
// CompleteRequest
{
  "messages": [{ "role": "user", "content": "take a screenshot" }],
  "availableTools": [{ "name": "computer.screenshot", "description": "…", "risk": "SAFE", "parameters": {} }],
  "language": "en",
  "provider": "mock"
}

// AgentStep
{ "kind": "tool", "thought": "…", "calls": [{ "callId": "c1", "tool": "computer.screenshot", "args": {} }] }
{ "kind": "final", "text": "…", "emotion": "neutral" }
```

Only tools the current permission level exposes are ever sent in
`availableTools`.

### voice — `127.0.0.1:8732`

| Method | Path          | Body                | Returns              | Status |
| ------ | ------------- | ------------------- | -------------------- | ------ |
| GET    | `/providers`  | —                   | capability report     | works  |
| POST   | `/synthesise` | `SynthesiseRequest` | `SynthesiseResponse`  | works (mock) |
| POST   | `/preview`    | `SynthesiseRequest` | `SynthesiseResponse`  | works (mock) |
| POST   | `/transcribe` | audio               | —                     | **501** |

`/providers` reports, per provider, which voice parameters it `supports` and
which it `ignores`, so the UI can grey out controls instead of pretending.
`SynthesiseResponse.unsupportedParams` repeats this per request.

### vision — `127.0.0.1:8733`

| Method | Path         | Status  |
| ------ | ------------ | ------- |
| GET    | `/providers` | works (reports none configured) |
| POST   | `/analyse`   | **501** |
| POST   | `/ocr`       | **501** |

Returning 501 is intentional: a vision stub that invents UI elements would
cause the agent to act on fiction.

### joyai — `127.0.0.1:8734` (optional)

| Method | Path         | Notes                                             |
| ------ | ------------ | ------------------------------------------------- |
| GET    | `/status`    | Always answers; reports `installed: false` cleanly |
| POST   | `/transform` | 503 unless `JOYAI_UPSTREAM` is configured          |

HERMES probes `/status` and degrades silently. Nothing in the base application
imports this service.

## Error format

```jsonc
{ "error": "forbidden_origin" }      // 401 from the auth middleware
{ "detail": "unknown TTS provider" } // 4xx/5xx from FastAPI
```

Tauri commands reject with a plain string message.
