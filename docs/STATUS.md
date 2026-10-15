# Implementation status

Honest inventory of what exists today. Anything not listed as implemented is not claimed.

## LunaAI Web

| Feature | Status | Evidence |
| --- | --- | --- |
| Multi-user accounts (register, login, token) | Implemented | `apps/web/backend/src/routes/auth.js`, `tests/auth.test.js` |
| Per-user isolation of conversations, messages, settings, search | Implemented | ownership predicates in `src/db.js`, `tests/isolation.test.js` |
| Streaming chat (SSE) with cancellation | Implemented | `src/routes/conversations.js`, `tests/chat.test.js`, `frontend/tests/sse.test.ts` |
| Conversation history, rename, delete, search | Implemented | `src/routes/conversations.js` |
| Provider abstraction with development fallback | Implemented | `src/providers/*` |
| English, Japanese, Persian UI with RTL | Implemented | `locales/*`, `frontend/src/i18n*`, `frontend/tests/i18n.test.ts` |
| Settings (language, theme) persisted per user | Implemented | `src/routes/settings.js` |
| Server-side tools under an explicit policy | Implemented, off by default | `src/tools/*`, `tests/security.test.js` |
| Rate limiting (global + auth) | Implemented (single instance) | `src/rateLimit.js`, `tests/auth.test.js` |
| RAG over uploaded documents | Planned | — |
| Server-side tool marketplace / per-user tool scopes | Planned | — |
| Shared rate-limit store for horizontal scaling | Planned | — |
| E2E browser tests | Planned | — |

## LunaAI PC

| Feature | Status | Evidence |
| --- | --- | --- |
| Native Windows desktop application (WPF, no web UI) | Implemented | `src/LunaAI.PC.App`, CI publish check |
| Native chat interface, conversation list, activity and audit views | Implemented | `Ui/MainWindow.cs` |
| Settings window (provider, permission level, approved folders, privacy, language) | Implemented | `Ui/SettingsWindow.cs` |
| Local persistence of settings, conversations, tasks | Implemented | `src/LunaAI.PC.Storage`, `ProviderAndStorageTests` |
| Provider-independent AI layer + remote provider | Implemented | `src/LunaAI.PC.Core/Ai`, `ProviderTests` |
| Structured logging with secret redaction | Implemented | `Storage/FileLogger.cs`, `Core/Diagnostics/SecretRedactor.cs` |
| Typed computer-tool interfaces | Implemented | `src/LunaAI.PC.Computer/Services` |
| Permission manager, risk classification, default deny | Implemented | `src/LunaAI.PC.Security/Permissions` |
| Project-scoped file tools with path guard | Implemented | `PathGuard`, `Tools/FileTools.cs` |
| Screenshot capture and approved computer interactions | Implemented (Windows) | `Windows/WindowsScreenService.cs`, `Tools/ComputerTools.cs` |
| Command execution with restrictions | Implemented (allow list, no shell) | `CommandGuard`, `Tools/ComputerTools.cs` |
| Audit log, approval dialogs, emergency stop | Implemented | `Audit/JsonlAuditLog.cs`, `Ui/ApprovalDialog.cs`, `EmergencyStop` |
| Controlled pipeline observe→plan→approve→execute→audit→verify | Implemented | `ToolExecutionPipeline`, `AgentSession` |
| Tests for denied operations and escalation attempts | Implemented | `tests/LunaAI.PC.Tests` |
| System tray entry | Implemented | `Ui/TrayIcon.cs` shows, hides and exits the app and exposes the emergency stop and resume actions |
| Global emergency stop shortcut (Ctrl+Alt+Shift+S) | Implemented | `Ui/EmergencyStopHotkey.cs` registers a system-wide hotkey with `RegisterHotKey` |
| Voice input and speech output | Planned | interfaces exist; `UnavailableSpeechSynthesizer` reports the gap |
| VRM character companion | Planned | see `docs/CHARACTER.md` |
| Visual understanding (model receives screenshots) | Planned | local capture works, image forwarding is not wired |
| Installer, auto-update, code signing | Planned | — |
| Local model runtime integration | Planned | provider layer accepts a local endpoint today |

## Documentation and process

| Item | Status |
| --- | --- |
| Architecture, security, permissions, API, localization, privacy, settings, roadmap docs | Implemented |
| Repository guards enforcing product separation | Implemented, in CI |
| CI for web and native PC (build, tests, publish) | Implemented |
