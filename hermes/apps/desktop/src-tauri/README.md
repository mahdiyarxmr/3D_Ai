# Native core (Rust / Tauri)

Build prerequisites (Windows):

- Rust stable (`rustup default stable`)
- Microsoft Visual Studio C++ Build Tools
- WebView2 runtime (present on Windows 11 by default)

Then, from `hermes/`:

```
npm run dev:tauri     # dev build with hot reload
npm run build:tauri   # NSIS + MSI installers
```

## Layout

| File             | Responsibility                                               |
| ---------------- | ------------------------------------------------------------ |
| `lib.rs`         | Command surface, startup, window/tray wiring                  |
| `permissions.rs` | Independent native re-check of level, capability and fs scope |
| `tools.rs`       | The actual OS executors                                       |
| `storage.rs`     | SQLite: settings, characters, append-only audit log           |
| `emergency.rs`   | Process-wide kill switch and child-process registry           |
| `auth.rs`        | Per-launch session secret for the local services              |
| `tray.rs`        | System tray, localized from the frontend                      |
| `shortcuts.rs`   | OS-wide Ctrl+Alt+Esc emergency stop                           |

## Why the native side re-checks permissions

`execute_tool` never trusts the webview. The TypeScript engine owns policy and
UX (risk escalation, confirmation prompts); the Rust side independently
verifies the level allows the capability, the path is inside an allowed scope,
and the emergency stop is clear. A compromised renderer therefore cannot
escalate beyond the configured level.
