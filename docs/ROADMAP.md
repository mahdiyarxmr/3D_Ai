# Roadmap

Stages follow the product specification. Status is honest: see [STATUS.md](STATUS.md) for the
detailed inventory.

## Stage 1 — Architecture and decisions — complete

* Existing repository inspected; only the documentation set was worth keeping, and it was rewritten
  for the LunaAI naming, the native desktop stack and the two-product separation.
* Both architectures and their trust boundaries documented.
* Tool contracts, permission levels, data ownership and security rules defined.
* Native desktop stack selected and justified (C# / .NET 8 / WPF; see
  [PC_ARCHITECTURE.md](PC_ARCHITECTURE.md)).
* Implementation plan with testable milestones produced (this file).

## Stage 2 — LunaAI PC native foundation — complete

* Runnable native Windows desktop application (WPF).
* Native chat interface, conversation list, activity view and settings window.
* Provider-independent AI layer with a remote OpenAI-compatible provider and a labelled development
  provider.
* Local configuration and persistence in the per-user application data directory.
* Structured logging with secret redaction and error handling.

## Stage 3 — Safe desktop agent — largely complete

* Typed computer-tool interfaces and a tool catalogue. **Done**
* Permission manager with risk classification and default deny. **Done**
* Project-scoped file-system tools with a path guard. **Done**
* Screenshot capture and approved input control (Windows). **Done**
* Command execution with an allow list and no shell. **Done**
* Audit log, approval dialogs, emergency stop. **Done**
* Tests for denied operations and escalation attempts. **Done**
* System tray entry, global emergency-stop hotkey, per-task review UI. **Remaining**
* Verification loops that re-observe the screen after an action and compare with the goal.
  **Remaining**

## Stage 4 — LunaAI Web foundation — complete

* Separate frontend and backend deployables. **Done**
* Authentication and multi-user data isolation. **Done**
* Streaming chat, conversation history, provider abstraction. **Done**
* English, Japanese and Persian localization with RTL. **Done**
* Authorization and isolation tests; verification that the web surface cannot reach desktop tools.
  **Done**

## Stage 5 — Integration and polish — in progress

* Shared non-privileged contracts (`packages/shared-contracts`). **Done**
* Repository guards enforcing separation in CI. **Done**
* Voice output and speech input. **Planned**
* Visual understanding: forwarding screenshots to a vision-capable model under an explicit
  privacy setting. **Planned**
* VRM character companion. **Planned**
* Deployment, installation, update and recovery documentation. **Partially done** —
  [BUILD.md](BUILD.md) covers build and run; installer/update/recovery guides are still missing.
* End-to-end browser tests and installer tests. **Planned**
