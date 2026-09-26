# Implementation plan

## Phase 1 — foundation (this phase)

Ordered so the application is runnable at every step, and so the permission
engine exists before any dangerous tool does.

| #  | Step                        | State | Evidence                                             |
| -- | --------------------------- | ----- | ---------------------------------------------------- |
| 1  | Tauri desktop shell         | done  | `apps/desktop/src-tauri`, two windows, tray           |
| 2  | React UI                    | done  | `npm run dev` serves the full interface               |
| 3  | Localization + RTL          | done  | 12 locale files, 44 parity tests, 12 DOM tests        |
| 4  | VRM loading / rendering     | done  | `packages/vrm`, validated import, 26 tests            |
| 5  | Smooth idle animation       | done  | 6-layer procedural animator, deterministic tests      |
| 6  | Character persistence       | done  | SQLite + IndexedDB backends behind one interface      |
| 7  | Chat UI                     | done  | `ChatPanel`, streaming activity, conversation language |
| 8  | Voice interfaces            | part  | Provider contracts + working mock TTS; no real engine  |
| 9  | Permission engine           | done  | 48 tests; enforced in TypeScript and Rust             |
| 10 | Computer tool abstraction   | done  | 21 typed tools, zod-validated at the boundary         |
| 11 | Screenshot tool             | done  | `xcap`; simulated in the browser runtime              |
| 12 | Mouse / keyboard tools      | done  | `enigo`; chunked typing so the stop can interrupt     |
| 13 | Shell tools                 | done  | CMD + PowerShell, timeout, tree-kill, truncation      |
| 14 | Filesystem tools            | done  | Scope-enforced on both endpoints                      |
| 15 | Audit log                   | done  | Append-only SQLite, redaction, retention sweep        |
| 16 | Emergency stop              | done  | In-app, tray, OS-wide shortcut, child-process kill    |
| 17 | Vision integration          | stub  | Interfaces return 501 rather than fabricating         |
| 18 | JoyAI adapter               | stub  | Separate process, probed and degraded away from       |

### Not done, and deliberately so

- **Real STT/TTS.** Shipping a fake transcript is worse than shipping none: the
  agent would act on invented input. The interfaces, capability reporting and
  parameter mapping are complete and tested; plugging in faster-whisper and
  Piper is now a contained job.
- **Vision.** Same reasoning. A vision stub that invents UI elements would make
  the agent click on things that are not there.
- **Compiled Rust.** The native crate is written but has not been compiled in
  this environment (no Rust toolchain, and the target is Windows). Treat
  `cargo build` as the first task for anyone on a Windows machine.

## Phase 2 — make the agent genuinely useful

1. Compile and smoke-test the Rust core on Windows; fix what the compiler finds.
2. Wire a real LLM provider end to end (local first, via Ollama).
3. faster-whisper STT + VAD; microphone capture in the companion window.
4. Piper TTS with the voice-parameter mapping already specified in
   `services/voice/providers/base.py`.
5. Connect `AudioEnvelopeLipSync` to the real audio path.
6. Local OCR (rapidocr-onnxruntime) and screenshot region cropping.
7. Windows UI Automation for reliable element targeting instead of blind clicks.

## Phase 3 — depth

Persistent memory, long-running tasks, task interruption and resumption,
browser automation, multiple characters, plugin SDK, JoyAI integration proper.

## Principles held throughout

1. The application runs at every commit.
2. A feature is not done until it is exercised by a test.
3. The permission engine precedes every dangerous capability.
4. Unimplemented means a 501 or an explicit TODO — never a plausible fake.
5. Nothing is claimed in documentation that the code does not do.
