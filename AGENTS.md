# Working in this repository

These rules are binding for everyone who changes this codebase, including AI agents.

## 1. Two products, two trust boundaries

* `apps/web` is LunaAI Web: cloud-hosted, multi-user, browser access.
* `apps/pc` is LunaAI PC: a locally installed **native Windows** application.

Never add a privileged computer capability to LunaAI Web. That includes shell or command execution,
file-system access, screen capture, mouse or keyboard control, window control, application launching
and any endpoint that proxies such an action to LunaAI PC. There is no shared privileged service
between the products, and there must never be one.

Never let LunaAI Web authenticate a user into LunaAI PC. Web credentials grant web access only.

## 2. LunaAI PC must stay native

The desktop UI is WPF (C# / .NET 8). Do not introduce HTML, CSS, JavaScript, TypeScript, React,
TSX, Vue, PHP, Electron, Tauri or a WebView. Do not render the interface with an embedded browser
either. Native operating-system APIs (Win32) are used for computer interaction, and supporting
libraries may be C# only unless a written justification exists in `docs/PC_ARCHITECTURE.md`.

CI enforces this: the Windows job fails if web assets end up in the published desktop build.

## 3. Security invariants

1. Every computer action goes through `ToolExecutionPipeline`:
   observe → plan → permission check → risk check → approval if required → execute → audit → verify.
2. No model output may bypass the permission manager. Unknown tools are denied by default.
3. Permission levels only remove prompts; they never disable a control.
4. The emergency stop blocks every action at every level.
5. File tools are scoped to user-approved roots; path traversal and link escapes are denied.
6. Commands run without a shell, from an allow list, and are denied when the deployment disables
   command execution.
7. Secrets are never written to settings, logs, audit records or API responses.
8. Denials are audited with a machine-readable reason.

## 4. Build and test before you claim anything

```bash
# repository guards (product separation, branding, locale parity)
node --test tests/separation.test.mjs

# LunaAI Web
cd apps/web/backend && npm test
cd apps/web/frontend && npm test && npm run build

# LunaAI PC (Windows, .NET 8 SDK)
cd apps/pc && dotnet build LunaAI.PC.sln -c Release && dotnet test LunaAI.PC.sln -c Release
```

Never describe an unimplemented feature as finished, never add a fake implementation to satisfy a
test, and never leave a security-critical path as a TODO. Update `docs/STATUS.md` when the status of
a feature changes.

## 5. Localization

All user-visible strings live in `locales/{en,ja,fa}/*.json` and are referenced by key. Do not
hard-code visible text in source files. Persian is right-to-left, English and Japanese are
left-to-right. Keys must exist in all three locales; `tests/separation.test.mjs` enforces parity.

## 6. Conventions

* Conventional commit prefixes (`feat:`, `fix:`, `docs:`, `chore:`, `test:`).
* Keep configuration and secrets out of source control; `.env` files are ignored, `.env.example` is
  the template.
* Prefer small, reviewable changes that keep both products buildable.
