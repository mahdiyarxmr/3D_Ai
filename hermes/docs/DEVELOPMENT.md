# Development

## Environment

| Tool   | Version | Needed for              |
| ------ | ------- | ----------------------- |
| Node   | 20+     | Everything              |
| npm    | 10+     | Workspaces              |
| Rust   | stable  | The native desktop build only |
| Python | 3.11+   | The optional services only    |

On Windows you also need the Visual Studio C++ Build Tools and the WebView2
runtime (already present on Windows 11).

## Layout

npm workspaces. Build order is enforced by TypeScript project references:

```
shared → agent-protocol → vrm → ui → apps/desktop
```

`packages/shared` must not import from any other workspace package. If you find
yourself wanting it to, the code belongs somewhere else.

## Commands

```bash
npm run dev          # Vite dev server, browser runtime, no Rust or Python
npm run dev:tauri    # native window with real OS tools
npm run typecheck    # strict tsc over every project
npm test             # vitest
npm run test:watch
npm run build        # typecheck + production frontend bundle
npm run build:tauri  # Windows installers (NSIS + MSI)
```

Python:

```bash
python -m venv .venv
.venv/bin/pip install -r services/requirements-dev.txt
.venv/bin/python -m pytest
.venv/bin/ruff check services tests/python
```

## The two runtimes

The same React bundle runs in a browser and inside Tauri.

|                | `npm run dev` (browser)         | `npm run dev:tauri`     |
| -------------- | ------------------------------- | ----------------------- |
| Tool execution | `SimulatedToolExecutor`         | Real, via Rust          |
| Persistence    | localStorage + IndexedDB        | SQLite + files          |
| Tray, shortcut | absent                          | present                 |
| Window effects | ignored                         | real                    |

Simulated results are labelled `[simulated]` in the UI and in the audit log.
Keep it that way — a dev harness that looks like it did something real is a
trap.

Detection lives in `runtime/platform.ts`. Do not call `invoke()` directly from
a component; go through `runtime/executors.ts` or `runtime/storage.ts`.

## Testing

| Suite                       | What it protects                                     |
| --------------------------- | ---------------------------------------------------- |
| `tests/permissions.test.ts` | The security model. Treat failures as security bugs. |
| `tests/broker.test.ts`      | Call pipeline ordering, emergency stop, redaction    |
| `tests/locales.test.ts`     | Locale key parity and placeholder integrity          |
| `tests/vrm.test.ts`         | Container validation and the idle animator           |
| `tests/auth.test.ts`        | Local API signing and replay resistance              |
| `tests/native-parity.test.ts` | TS / Rust / Python tool catalogues agree           |
| `tests/ui.test.tsx`         | Real DOM: language switching, RTL, a11y              |
| `tests/python/`             | Auth parity, voice parameter mapping, agent routing  |

Conventions: describe behaviour, not implementation
(`'denies keyboard input at OBSERVE'`, not `'test evaluate 3'`). Assert on
outcomes, not internals. Every bug fix gets a regression test — both VRM bugs
found during Phase 1 have one.

## Adding a tool

1. Declare it in `packages/agent-protocol/src/tools.ts` with a zod schema,
   capability, base risk and escalation rules.
2. Add a permission test **before** the implementation.
3. Implement the executor in `src-tauri/src/tools.rs`.
4. Mirror the capability in `permissions.rs` and
   `services/computer/contract.py`, or `native-parity.test.ts` fails.
5. Add localized strings for its confirmation prompt in all three languages.

## Adding a provider

Implement the interface and register it. Nothing else changes:

| Kind   | Interface                                     |
| ------ | --------------------------------------------- |
| LLM    | `LlmProvider` (TS) / `AgentProvider` (Python)  |
| TTS    | `TtsProvider.synthesise()` + `capabilities()`  |
| STT    | `SttProvider.transcribe()`                     |
| Vision | `VisionProvider.analyse()` / `ocr()`           |

A TTS provider **must** report its real capability set. Silently ignoring a
parameter is how you end up with sliders that do nothing.

## Style

- TypeScript strict, including `noUncheckedIndexedAccess`. No `any`; if a type
  is genuinely unknown, use `unknown` and narrow it.
- Rust: no `unwrap()` outside tests. Return `ToolError`.
- Python: typed signatures, `ruff` clean.
- CSS: logical properties only. No `left`/`right`.
- Comments explain *why*. The code already says what.

## Gotchas

- **The CSP lives in `tauri.conf.json`, not `index.html`.** A `<meta>` CSP
  breaks Vite's HMR client.
- **`noUncheckedIndexedAccess` makes `array[0]` possibly-undefined.** This is
  correct; handle it rather than asserting it away.
- **The idle animator is seeded.** Same seed, same motion — that is what makes
  it testable. Do not introduce bare `Math.random()`.
- **Do not `await` a confirmation inside the permission engine.** It is a pure
  synchronous function; the broker handles the asynchronous part.
