# HERMES

A local-first desktop AI companion: a VRM avatar that lives on your desktop,
talks with you in English, Japanese or Persian, and — only when you allow it —
operates your computer.

> **Status: Phase 1.** The desktop shell, localization, VRM pipeline, character
> persistence, chat, permission engine, tool protocol, audit log and emergency
> stop are implemented and tested. Real STT/TTS and vision providers are not —
> see [Current status](#current-status) for the honest breakdown.

---

## Quick start

Requires **Node 20+**. Rust is only needed for the native desktop build.

```bash
cd hermes
npm install
npm run dev          # browser dev UI at http://localhost:5173
```

That gives you the complete interface — avatar, idle animation, language
switching, chat, permission prompts, audit log — running in a browser tab with
OS actions simulated. It is the fastest way to see what HERMES is.

For the real desktop application:

```bash
npm run dev:tauri    # native window, tray, real OS tools
```

Additional prerequisites for the native build (Windows):

- Rust stable — `rustup default stable`
- Visual Studio C++ Build Tools
- WebView2 runtime (preinstalled on Windows 11)

### Verify

```bash
npm test             # 174 TypeScript tests
npm run typecheck    # strict tsc across all packages

python -m venv .venv && .venv/bin/pip install -r services/requirements-dev.txt
.venv/bin/python -m pytest     # 44 Python tests
```

---

## What works today

| Capability                                   | State  | Notes                                                             |
| -------------------------------------------- | ------ | ----------------------------------------------------------------- |
| Tauri desktop shell, two windows, system tray | ✅     | Companion (transparent, always-on-top) + expanded                  |
| React UI, EN / JA / FA, runtime switching     | ✅     | RTL for Persian via CSS logical properties                         |
| `.vrm` import, validation, rendering          | ✅     | Container validated before parsing; invalid files rejected cleanly |
| Procedural idle animation                     | ✅     | Breathing, sway, head motion, saccades, blinking — all layered     |
| Character + voice persistence                 | ✅     | SQLite on desktop, IndexedDB/localStorage in the browser           |
| Chat UI and agent loop                        | ✅     | Observe → reason → plan → permission → execute → verify            |
| Permission engine (3 levels)                  | ✅     | 48 dedicated tests, enforced in TypeScript *and* Rust              |
| Typed tool protocol                           | ✅     | 21 tools; the model never sees a raw shell                         |
| Audit log with redaction                      | ✅     | Append-only; every decision recorded                               |
| Emergency stop                                | ✅     | In-app, tray, and OS-wide `Ctrl+Alt+Esc`                           |
| Local API authentication                      | ✅     | HMAC-signed; localhost is not treated as trusted                   |
| LLM providers                                 | 🟡     | Mock works end to end; OpenAI adapter written, untested            |
| TTS                                           | 🟡     | Interfaces + working mock; no real engine yet                      |
| STT / microphone                              | ⬜     | Interfaces only — returns 501 rather than faking it                |
| Vision / OCR                                  | ⬜     | Interfaces only                                                    |
| JoyAI                                         | ⬜     | Optional adapter stub; HERMES never depends on it                  |

Nothing above is marked ✅ on the strength of documentation alone. See
[`docs/TASKS.md`](docs/TASKS.md) for what remains.

---

## How it is put together

```
hermes/
├── apps/desktop/          Tauri app: React frontend + Rust core (src-tauri/)
├── packages/
│   ├── shared/            Character, voice and settings schemas (zod)
│   ├── agent-protocol/    Tool catalogue, permission engine, broker, agent loop
│   ├── vrm/               VRM validation, three.js stage, idle animation, lip sync
│   └── ui/                i18n runtime and shared components
├── services/              Python sidecars: agent, voice, vision, joyai
├── locales/               en / ja / fa × common, settings, voice, permissions
├── storage/               Local runtime state (git-ignored)
├── tests/                 TypeScript + Python test suites
└── docs/                  Architecture, permissions, security, API, plan, tasks
```

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the pieces fit,
and why the permission engine lives in TypeScript while Rust re-checks it.

---

## The safety model in one picture

Every tool call travels exactly one path. There is no side door: executors are
registered on the broker and are never handed to the agent or to the model.

```
Agent
  → parse against the typed schema     (reject malformed calls at the boundary)
  → Permission Manager                 (level, allow/denylist, filesystem scope)
  → Risk check                         (per-call escalation, e.g. "format C:")
  → User confirmation, if required     (blocking modal; timeout = refusal)
  → Tool executor                      (Rust re-checks policy independently)
  → Audit log                          (append-only, credentials redacted)
  → Result
  → Agent
```

Three permission levels:

- **OBSERVE** — screenshots, window and system info, reading files inside the
  folders you allow. No input synthesis, no writes, no shell.
- **ASSIST** — mouse, keyboard, applications, filesystem, CMD and PowerShell.
  Anything high-risk asks first.
- **AUTONOMOUS** — approved tools run without per-action prompts. Deletion,
  security configuration, credential access, persistence mechanisms, disk
  operations and shutdown **still require confirmation**, and disabling
  security software is blocked outright at every level.

Full rules and rationale: [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md).
Threat model: [`docs/SECURITY.md`](docs/SECURITY.md).

---

## Privacy

Local-first, and the default configuration never sends anything anywhere:

- Cloud LLM, cloud vision and cloud audio are three separate opt-in switches,
  all off by default.
- Telemetry is not merely off by default — the schema types it as `false`.
- API keys live in the OS credential store, never in settings files or logs.
- The audit log redacts credential-shaped keys and values before writing.
- Screenshots stay on disk unless a cloud vision provider is explicitly enabled.

---

## Running the optional services

HERMES runs fine without them; the desktop app uses an in-process mock provider
by default.

```bash
cd hermes
.venv/bin/uvicorn services.agent.main:app --port 8731 --host 127.0.0.1
```

All services require an HMAC-signed `Authorization` header derived from the
per-launch session secret the Rust core writes to
`storage/settings/session.json`. See [`docs/SECURITY.md`](docs/SECURITY.md).

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`AGENTS.md`](AGENTS.md) — the
latter is the working agreement for both human and AI contributors, and its
first rule is that a feature is not "done" until it runs.

## Licence

Apache-2.0. See [`LICENSE`](LICENSE).
