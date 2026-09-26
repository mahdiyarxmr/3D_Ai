# Architecture

## Processes

```
┌──────────────────────────────────────────────────────────────────┐
│ HERMES.exe (Tauri)                                               │
│                                                                  │
│  ┌────────────────────────────┐   IPC    ┌────────────────────┐  │
│  │ WebView (React/TypeScript) │ <──────> │ Rust core          │  │
│  │                            │          │                    │  │
│  │ • UI, i18n, RTL            │          │ • execute_tool     │  │
│  │ • VRM stage (three.js)     │          │ • native policy    │  │
│  │ • Permission ENGINE        │          │   re-check         │  │
│  │ • Agent loop               │          │ • SQLite storage   │  │
│  │ • ToolBroker               │          │ • audit log        │  │
│  │ • Confirmation UI          │          │ • tray, shortcuts  │  │
│  └────────────────────────────┘          │ • emergency stop   │  │
│                                          └─────────┬──────────┘  │
└────────────────────────────────────────────────────┼─────────────┘
                                                     │ HMAC-signed HTTP
                          ┌──────────────────────────┼──────────────────┐
                          ▼                          ▼                  ▼
                 ┌─────────────────┐       ┌─────────────────┐  ┌──────────────┐
                 │ agent  :8731    │       │ voice  :8732    │  │ vision :8733 │
                 │ LLM providers   │       │ STT / TTS       │  │ OCR / VLM    │
                 └─────────────────┘       └─────────────────┘  └──────────────┘
                                                     │
                                          ┌──────────▼───────────┐
                                          │ joyai :8734 (OPTIONAL)│
                                          │ never a dependency    │
                                          └───────────────────────┘
```

The Python services are **optional**. With none of them running, HERMES falls
back to the in-process mock LLM provider and remains fully usable — that is a
hard requirement, tested by the fact that `npm run dev` needs no Python at all.

## Where each concern lives, and why

| Concern                        | Home                      | Why there                                                                     |
| ------------------------------ | ------------------------- | ----------------------------------------------------------------------------- |
| Permission **policy**          | TypeScript                | It needs the UI to ask the user, and it must be trivially unit-testable        |
| Permission **enforcement**     | TypeScript **and** Rust   | The renderer is not trusted; Rust re-checks before touching the OS             |
| Tool **execution**             | Rust                      | Input synthesis, capture and process control are native concerns               |
| Audit log                      | Rust (SQLite)             | Must survive a renderer crash and be append-only                               |
| Agent **loop**                 | TypeScript                | Confirmation is interactive; the loop has to be able to block on a human       |
| Model **inference**            | Python                    | That is where the ML ecosystem lives                                           |
| VRM rendering                  | TypeScript (three.js)     | `@pixiv/three-vrm` is the reference implementation                             |
| i18n                           | TypeScript                | Runtime switching without a reload                                             |

### Why the permission engine is not in Rust

It was tempting. The reason it is not: the engine must ask the user, and the
user is in the webview. Splitting "decide" from "ask" across the IPC boundary
would have produced a chattier and more error-prone protocol. Instead the
engine is a **pure, synchronous, exhaustively tested function** in TypeScript
(`packages/agent-protocol/src/permissions.ts`, 48 tests), and Rust performs an
independent structural re-check — level, capability, filesystem scope,
emergency stop — before any syscall.

The two catalogues could drift, which would be a security bug, so
`tests/native-parity.test.ts` parses `permissions.rs` and
`services/computer/contract.py` and asserts all three agree on every tool.

## The tool call path

```
LLM output
   │
   ▼
parseToolCall()          ← zod schema; unknown tool or bad args dies here
   │
   ▼
evaluate()               ← pure function: level → denylist → capability
   │                        → allowlist → fs scope → risk → confirmation
   ├── deny ────────────────────────────────► audit, return
   ├── confirm ──► ConfirmationProvider ──► user
   │                  │
   │                  ├── declined ────────► audit, return
   │                  └── approved ──► evaluate() AGAIN
   │                                    (a grant cannot widen scope)
   ▼
ToolExecutor
   ├── Tauri  → invoke('execute_tool') → Rust re-check → OS
   └── Browser→ SimulatedToolExecutor (labelled, touches nothing)
   │
   ▼
audit.append()           ← redacted, append-only
   │
   ▼
result back into the agent transcript
```

Re-evaluating after approval is deliberate. A user approving *this* deletion
must not thereby grant the agent a path outside its filesystem scopes; the
grant only satisfies the confirmation requirement, never the structural checks.

## The agent loop

```
Observe ─► Reason ─► Plan ─► Permission ─► Execute ─► Observe ─► Verify ─► Continue
```

Implemented in `packages/agent-protocol/src/agent.ts`. Provider-agnostic:
adding OpenAI, Ollama or llama.cpp means implementing `LlmProvider` and nothing
in the loop changes.

Verification is not decorative. After any state-changing action (click, type,
hotkey, app launch, shell command) the loop automatically issues a screenshot
and feeds it back into the transcript before the model continues — so the agent
reasons about what actually happened rather than what it intended.

## Data flow for a VRM import

```
File picker → ArrayBuffer
  → validateVrm()        header, version, length, JSON chunk, VRM extension
  → storage.saveVrm()    SQLite-adjacent file / IndexedDB
  → CharacterSchema      zod-validated record persisted
  → VrmStage.loadVrm()   GLTFLoader + VRMLoaderPlugin
  → IdleAnimator.setTarget(new VrmTarget(vrm))
```

The uploaded file is treated as untrusted data throughout. It is validated
before the glTF parser sees it, and nothing in it is ever executed.

## Storage layout

```
%APPDATA%/dev.hermes.companion/
├── hermes.sqlite3            settings, characters, audit (WAL mode)
├── characters/<id>/character.vrm
├── settings/session.json     per-launch secret, owner-only
├── logs/
└── memory/
```

## The browser runtime

The same React bundle runs in a plain browser (`npm run dev`) and inside Tauri.
`runtime/platform.ts` detects which, and swaps in simulated executors and
localStorage/IndexedDB persistence. Every simulated result is explicitly
labelled `[simulated]` in both the UI and the audit log — the dev harness must
never let anyone believe a real action occurred.

## Deliberate constraints

1. **The model never receives a shell.** It receives typed tool declarations;
   `shell.cmd` is a tool with a schema, a risk class and escalation rules.
2. **No tool executes without an audit record.** Denials are logged too.
3. **The emergency stop is native-first.** Tray and global shortcut engage the
   Rust flag directly, so a hung webview cannot prevent a stop.
4. **JoyAI is behind a process boundary.** Nothing in the base app imports it.
5. **UI language and conversation language are independent settings**, and
   always have been — not a retrofit.
