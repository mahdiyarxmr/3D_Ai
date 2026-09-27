# Contributing

Thanks for looking. Start with [AGENTS.md](AGENTS.md) — it is short, and it is
the working agreement for this repository. The most important line in it is
that a feature is not done until it runs, and that documentation must never
claim behaviour the code does not have.

## Setup

```bash
cd hermes
npm install
npm run dev          # full UI in a browser — no Rust, no Python needed
```

For the native app you also need Rust stable, the Visual Studio C++ Build
Tools, and WebView2. See [docs/BUILD.md](docs/BUILD.md).

## Before you open a pull request

```bash
npm run typecheck
npm test
.venv/bin/python -m pytest
```

All three must pass. If you touched the tool catalogue, confirm
`tests/native-parity.test.ts` still passes — it is the only thing keeping the
TypeScript, Rust and Python tool tables from silently diverging.

## Good first contributions

Pick from [docs/TASKS.md](docs/TASKS.md). Particularly welcome:

- **Compile the Rust crate on Windows and fix what the compiler finds.** It has
  never been built; this is the single highest-value contribution right now.
- **A real TTS provider** (Piper) mapped through `derive_composites()`.
- **A real STT provider** (faster-whisper).
- **Real tray and bundle icons** to replace the placeholders.
- **Additional locales.** The process is five steps and the tests will tell you
  what you missed — see [docs/I18N.md](docs/I18N.md).

## Changes that need discussion first

Open an issue before:

- altering the permission model, the risk classes, or the always-confirm list;
- changing the local API authentication scheme;
- adding a dependency to `packages/shared`;
- adding any IPC command that executes something outside `execute_tool`;
- making JoyAI required for anything.

## Reporting bugs

Include your OS and version, your permission level, what you expected, what
happened, and the relevant audit log entries. The audit log is designed to make
these reports easy — it records every decision, with credentials redacted, so
it is safe to paste.

## Security

Do not open a public issue for a vulnerability. Use a private GitHub security
advisory. See [docs/SECURITY.md](docs/SECURITY.md).

## Licence

Contributions are accepted under Apache-2.0, matching the project licence.
