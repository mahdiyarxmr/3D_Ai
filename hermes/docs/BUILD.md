# Build

Target: Windows 10/11 x64 desktop application.

## Prerequisites

| Requirement                      | Needed for              |
| -------------------------------- | ----------------------- |
| Node 20+                         | everything              |
| Rust stable (`rustup default stable`) | the native build   |
| Visual Studio C++ Build Tools    | linking on Windows      |
| WebView2 runtime                 | preinstalled on Win 11  |
| Python 3.11+                     | optional services only  |

## Development

```bash
npm install
npm run dev          # browser runtime — no Rust, no Python
npm run dev:tauri    # native window with real OS tools
```

`npm run dev` is the fast loop: the entire UI, avatar, localization, chat,
permission prompts and audit log, with OS actions simulated and clearly
labelled as such.

## Release

```bash
npm run build:tauri
```

Produces, under `apps/desktop/src-tauri/target/release/bundle/`:

- an **NSIS installer** (`.exe`) — per-user install, no admin rights
- an **MSI** (`.msi`) — for managed deployment

Both include an uninstaller and an optional desktop shortcut. The tray entry is
built in.

> **Not yet done:** the crate has never been compiled — the environment it was
> written in has no Rust toolchain and is not Windows. Expect to fix API drift
> in `enigo`, `xcap` and `sysinfo` on the first build. This is the top item in
> [TASKS.md](TASKS.md).

## Icons

`src-tauri/icons/` currently holds 1×1 placeholder PNGs so the config is valid.
Replace them with real artwork before shipping:

```bash
npx @tauri-apps/cli icon path/to/source-1024.png
```

## Services in the end-user build

An end user never starts a service by hand. The Rust core spawns the Python
sidecars as managed child processes, passes each one the session secret through
its environment, and shuts them down with the app. If a sidecar is missing or
fails to start, HERMES logs it and continues with the in-process mock provider
— a missing optional service must never prevent the app from launching.

In development the services are started manually so they can be restarted
independently:

```bash
npm run services:agent    # :8731
npm run services:voice    # :8732
npm run services:vision   # :8733
npm run services:joyai    # :8734
```

## Auto-start

`startOnLogin` exists in the settings schema but is not implemented. It is
disabled in the UI rather than shown as a switch that does nothing.

## Portable build

Not configured yet. Tauri can produce one; it needs a decision about where a
portable instance keeps `storage/`, since `%APPDATA%` defeats the purpose.
