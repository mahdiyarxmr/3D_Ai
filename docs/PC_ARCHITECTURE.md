# LunaAI PC architecture

LunaAI PC is a native Windows desktop application: a local computer-use and coding agent installed
and operated by a single local user.

## Selected stack and justification

**C# with .NET 8 and WPF**, using Win32 APIs for computer interaction.

| Option | Why it was not selected |
| --- | --- |
| Electron / Tauri / WebView | Forbidden by the product requirements and rejected on principle: the desktop UI must not be a web application. |
| C++ with Qt Widgets | Native and viable, but Qt adds a large native dependency tree, and its C++ deployment story on Windows (redistributables, per-configuration builds) is heavier here than a self-contained WPF binary. |
| Java with JavaFX | Requires a JVM and JavaFX modules on every target machine and gives weaker access to Win32 input APIs without extra JNI layers. |
| C# / .NET + WPF (selected) | First-party Windows desktop stack, direct P/Invoke to `user32` for input, GDI capture through `System.Drawing`, WPF for a native window, tray support via `NotifyIcon`, first-class local file/registry-free configuration, and one toolchain for the app, the agent core and the tests. |

Windows-only pieces are the UI (`net8.0-windows`, WPF) and the screen/input/application services.
Everything that decides *what may run* is portable `net8.0`: permission manager, guards, audit log,
tool pipeline, storage and the agent loop. CI therefore verifies the security core on Linux as well
as the full Windows build.

## Project layout

```
apps/pc/
  LunaAI.PC.sln
  src/
    LunaAI.PC.Core/       models, provider abstraction, settings, logging, redaction
    LunaAI.PC.Storage/    data directory, JSON stores, JSONL file logger
    LunaAI.PC.Security/   permission levels, risk model, guards, audit log, emergency stop
    LunaAI.PC.Computer/   typed capability interfaces + native Windows implementations
    LunaAI.PC.Agent/      tool registry, approval prompts, controlled execution pipeline, session
    LunaAI.PC.Voice/      speech interfaces and an explicit "unavailable" implementation
    LunaAI.PC.App/        WPF application: composition root, main window, settings, approval dialog
  tests/
    LunaAI.PC.Tests/      xUnit tests for the security-critical behaviour
```

## Composition and data flow

`Ui/DesktopAgentHost` is the composition root. It loads settings, creates the data directories,
builds the permission manager, registers the tool catalogue with both the registry and the permission
manager, wires the pipeline, the audit log and the agent session, and then hands the session to the
main window. The window never touches a computer capability directly.

A user turn runs as:

```
user prompt ─► AgentSession ─► provider (remote or local model) proposes tool calls
                    │
                    ▼
            ToolExecutionPipeline
            ┌───────────────────────────────────────────────────────────────┐
            │ 1 observe   – capture screen / list windows (through tools)   │
            │ 2 plan      – model output, recorded as a TaskPlan            │
            │ 3 permission– IPermissionManager: level, scope, commands      │
            │ 4 risk      – risk classification decides prompt vs allow     │
            │ 5 approval  – native dialog, deny is the default              │
            │ 6 execute   – the typed tool runs the native call             │
            │ 7 audit     – decision + execution appended to the audit log  │
            │ 8 verify    – result recorded, task step status updated       │
            └───────────────────────────────────────────────────────────────┘
```

An unknown tool is denied before any handler is resolved; a denied call is reported back to the model
as a tool error, and the model cannot escalate because the checks live outside the model's reach.

## Computer layer

`LunaAI.PC.Computer` exposes five typed interfaces — `IScreenService`, `IInputService`,
`IFileSystemService`, `IProcessService`, `IApplicationService` — and two implementations:

* Windows implementations using P/Invoke (`SendInput`, `EnumWindows`, `GetForegroundWindow`) and GDI
  capture, and
* explicit "unsupported" implementations that throw `PlatformNotSupportedException` on other systems.
  They never silently succeed.

The file-system and process services are portable, but every path and every executable they receive
has already been validated by the path guard and the command guard.

## Local-first data

Everything is stored in the per-user application data directory (`%APPDATA%\LunaAI` on Windows,
overridable with `LUNAAI_PC_DATA_DIR`):

```
settings.json          user configuration (no secrets)
conversations.json     conversation and message history
tasks.json             task plans and step outcomes
audit/lunaai-pc-audit.jsonl   append-only audit events
logs/lunaai-pc.log     structured JSONL application log (redacted)
screenshots/           local screen captures, only when a capture tool ran
```

LunaAI PC listens on **no network interface**. There is no local HTTP API, no socket server and no
unauthenticated control channel. The UI and the agent run in one process and communicate in memory,
which is why the application cannot be reached from a browser at all.

## Provider layer and privacy

`IChatProvider` is implemented by `OpenAiCompatibleProvider` (any OpenAI-compatible HTTP endpoint,
including a locally hosted model) and by `LocalEchoProvider`, a deterministic development provider
that performs no network I/O. The provider receives conversation messages and tool *definitions*
only; it has no capability handle. When no key is configured, the application states clearly that the
development provider is in use.

`PrivacySettings` records whether screenshots or file contents may be sent to a provider, and
`SendScreenshotsToProvider` defaults to false. Today `capture_screen` stores the image locally and
returns metadata; forwarding image bytes to a model is a planned feature (see `docs/STATUS.md`).

## Window, tray and safety controls

The main window is a native WPF window (chat, activity, audit, settings). A notification-area icon
(`NotifyIcon`) provides show/hide, emergency stop, resume and exit, and the window hides to the tray
on minimise when that setting is enabled. The emergency stop is also bound to a system-wide hotkey
(`Ctrl+Alt+Shift+S`, registered with `RegisterHotKey`), so actions can be stopped while another
application has focus — the hotkey handler engages the stop, cancels the running turn and updates the
window and audit log.

## Platform limitations (stated honestly)

* The application targets Windows (`net8.0-windows`). On other systems the core builds and its tests
  run, but screen capture, input control and application launch are unavailable by design.
* Command execution runs allow-listed executables without a shell. `cmd`, `powershell` and similar
  interpreters are deliberately not on the allow list, so shell pipelines are not supported.
* Voice output and the VRM companion are not implemented yet; the UI disables the controls and shows
  the reason instead of pretending to work.
* Automated tests run against the portable core and the capability interfaces with fakes. Rendering a
  real window, the tray icon and the global hotkey require an interactive Windows session and are
  verified manually.
* The application is published as framework-dependent (`dotnet publish -r win-x64`) today; a
  self-contained or MSIX installer is planned.
