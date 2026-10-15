# LunaAI

LunaAI is two separate products that share one brand, one design language and one localization vocabulary.

| Product | What it is | Where it runs | Repository location |
| --- | --- | --- | --- |
| **LunaAI Web** | A multi-user AI assistant in the browser, like ChatGPT | Your servers, reachable from any browser | `apps/web` |
| **LunaAI PC** | A native Windows desktop agent that can work on your own computer | The user's own Windows PC | `apps/pc` |

They are **not** two interfaces for the same application. They have different deployment models,
different trust boundaries and different capabilities.

* LunaAI Web **cannot** reach your computer. It has no shell, no file access, no mouse or keyboard
  control and no remote-control endpoint. Uploading a file to the web app grants access to that
  file only, never to the folder it came from.
* LunaAI PC runs locally as a **native Windows desktop application (C# / .NET 8 / WPF)**. It is not a
  web application: no HTML, CSS, JavaScript, React, Electron, Tauri or embedded browser renders its
  interface.
* The two products share only non-privileged things: brand and design language, localization
  terminology, provider abstractions and documentation conventions.

## Repository layout

```
apps/
  web/
    backend/          LunaAI Web API (Node.js, Express, SQLite)
    frontend/         LunaAI Web client (React + TypeScript + Vite)
  pc/
    LunaAI.PC.sln     LunaAI PC solution (C# / .NET 8)
    src/              native app + core, storage, security, computer, agent, voice libraries
    tests/            xUnit tests (permission enforcement, denial, audit, isolation)
packages/
  shared-contracts/   non-privileged API contracts shared by both products
locales/              en / ja / fa string bundles used by both products
docs/                 architecture, security, permissions, API, localization, roadmap, status
tests/                repository guards (product separation, branding, locale parity)
```

## Quick start

**LunaAI Web**

```bash
cd apps/web/backend && npm install && npm start          # API on http://localhost:3001
cd apps/web/frontend && npm install && npm run dev       # UI on http://localhost:5173 (proxies /api)
```

**LunaAI PC** (Windows with the .NET 8 SDK)

```powershell
cd apps\pc
dotnet build LunaAI.PC.sln -c Release
dotnet run --project src\LunaAI.PC.App
```

Full instructions, environment variables and CI details: [docs/BUILD.md](docs/BUILD.md).

## Status at a glance

Implemented, partial and planned work is tracked honestly in [docs/STATUS.md](docs/STATUS.md).
Nothing in this repository claims to be finished before it is.

| Area | Status |
| --- | --- |
| LunaAI Web: accounts, isolation, streaming chat, history, search, en/ja/fa + RTL | Implemented, tested |
| LunaAI Web: server-side tools under an explicit policy | Implemented (opt-in, off by default) |
| LunaAI PC: native WPF shell, settings, local history, provider layer | Implemented |
| LunaAI PC: permission manager, path/command guards, audit log, emergency stop | Implemented, tested |
| LunaAI PC: observe/plan/approve/execute pipeline with typed tools | Implemented, tested |
| LunaAI PC: voice output, VRM companion, visual model understanding | Planned |

## Documentation

* [docs/WEB_ARCHITECTURE.md](docs/WEB_ARCHITECTURE.md) · [docs/PC_ARCHITECTURE.md](docs/PC_ARCHITECTURE.md)
* [docs/SECURITY.md](docs/SECURITY.md) · [docs/PERMISSIONS.md](docs/PERMISSIONS.md)
* [docs/API.md](docs/API.md) · [docs/LOCALIZATION.md](docs/LOCALIZATION.md)
* [docs/BUILD.md](docs/BUILD.md) · [docs/TESTING.md](docs/TESTING.md) · [docs/PRIVACY.md](docs/PRIVACY.md)
* [docs/SETTINGS.md](docs/SETTINGS.md) · [docs/ROADMAP.md](docs/ROADMAP.md) · [docs/STATUS.md](docs/STATUS.md)

Contributors (human or AI) must read [AGENTS.md](AGENTS.md) first: it contains the rules that keep
the two products separate.
