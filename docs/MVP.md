# Acceptance criteria and current results

The specification's initial acceptance criteria, with the state of each item today. Nothing here is
marked complete without an artefact to point at; the detailed inventory is in
[STATUS.md](STATUS.md).

## LunaAI PC

| Criterion | State | Evidence |
| --- | --- | --- |
| A native Windows executable can be built and launched | Met (build) | CI job `LunaAI PC (native WPF, Windows)` restores, builds, tests and publishes `LunaAI.PC.exe`; the artifact is uploaded. Launching it requires an interactive Windows session, which CI cannot provide. |
| Its UI is not rendered with HTML, React, TSX or a WebView | Met | WPF windows constructed in C#; the publish step fails if any `.html`, `.css`, `.js`, `.ts` or `.jsx` file appears in the output. |
| The user can chat with a configured AI provider | Met | `Ui/MainWindow.cs` plus `OpenAiCompatibleProvider`; without a key the UI labels the development provider instead of pretending. |
| Local settings and conversation history persist | Met | `LunaAI.PC.Storage`, tests in `ProviderAndStorageTests` and `AgentSessionTests`. |
| The permission manager blocks unauthorized actions | Met | `PermissionManagerTests`, `ToolExecutionPipelineTests`, `AgentSessionTests`. |
| The emergency stop prevents further computer actions | Met | `Emergency_stop_blocks_every_tool_including_low_risk_reads`, `Emergency_stop_blocks_all_tool_calls`, `Emergency_stop_prevents_execution_even_after_approval`. |
| Tests cover permission enforcement and dangerous-operation denial | Met | 70 xUnit test cases (47 facts plus 23 theory cases) across permission, path, command, pipeline, session, catalogue, provider and storage suites. |

## LunaAI Web

| Criterion | State | Evidence |
| --- | --- | --- |
| Runs independently of LunaAI PC | Met | No reference to the desktop product in web code; enforced by the repository guard. |
| Multiple users register and keep separate conversations | Met | `isolation.test.js`. |
| One user cannot read or modify another user's data | Met | 404 on foreign reads, writes, renames and deletes; search and settings scoped. |
| Works in English, Japanese and Persian | Met | Locale bundles plus `i18n.test.ts`; Persian uses an RTL layout. |
| No endpoint gives web users privileged access to local computer tools | Met | No such endpoint exists, the tool registry refuses to register a desktop capability, and the guard test fails the build if one appears. |

## Documentation

| Criterion | State |
| --- | --- |
| Setup and build instructions are reproducible | Met — [BUILD.md](BUILD.md), verified by CI on every push. |
| The two products' architectures and security boundaries are documented | Met — [WEB_ARCHITECTURE.md](WEB_ARCHITECTURE.md), [PC_ARCHITECTURE.md](PC_ARCHITECTURE.md), [SECURITY.md](SECURITY.md). |
| Implemented, partial and planned features are clearly distinguished | Met — [STATUS.md](STATUS.md) and [ROADMAP.md](ROADMAP.md). |
