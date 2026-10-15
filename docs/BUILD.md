# Build and run

## Prerequisites

| Component | Requirement |
| --- | --- |
| LunaAI Web backend | Node.js 20 or newer |
| LunaAI Web frontend | Node.js 20 or newer |
| LunaAI PC | Windows 10/11 with the .NET 8 SDK (build and run); Linux/macOS can build and test the portable core |

## LunaAI Web

### Backend

```bash
cd apps/web/backend
npm install
cp .env.example .env          # then edit JWT_SECRET and provider settings
npm start                     # http://localhost:3001
```

Environment variables (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `PORT`, `HOST` | Listen address, defaults `3001` / `0.0.0.0`. |
| `JWT_SECRET` | Token signing key. **Required** when `NODE_ENV=production`. |
| `JWT_EXPIRES_IN` | Token lifetime, default `7d`. |
| `DB_PATH` | SQLite file, default `./data/lunaai-web.db`. |
| `CORS_ORIGINS` | Comma-separated allowed browser origins. |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | Provider configuration. Without a key the development provider answers and the UI says so. |
| `ENABLE_SERVER_TOOLS`, `SERVER_TOOL_ALLOWLIST` | Opt-in server-side tools, off by default. |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_AUTH_MAX`, `RATE_LIMIT_WINDOW_MS` | Abuse protection. |

### Frontend

```bash
cd apps/web/frontend
npm install
npm run dev        # http://localhost:5173, proxies /api to http://127.0.0.1:3001
npm run build      # type-checks and writes static assets to dist/
```

`LUNAAI_API_URL` overrides the proxy target for the dev server. The browser always uses relative
`/api` paths, so no build needs a backend hostname.

### Tests

```bash
cd apps/web/backend && npm test
cd apps/web/frontend && npm test && npm run build
node --test tests/separation.test.mjs        # repository guards, from the repository root
```

## LunaAI PC (native Windows)

```powershell
cd apps\pc
dotnet restore LunaAI.PC.sln
dotnet build LunaAI.PC.sln -c Release
dotnet test LunaAI.PC.sln -c Release
dotnet run --project src\LunaAI.PC.App
```

Publish a native executable:

```powershell
dotnet publish src\LunaAI.PC.App\LunaAI.PC.App.csproj -c Release -r win-x64 --self-contained false -o .\artifacts\pc
.\artifacts\pc\LunaAI.PC.exe
```

Linux/macOS developers can build and test the portable core (no WPF, no native screen or input
services):

```bash
cd apps/pc
dotnet build src/LunaAI.PC.Security/LunaAI.PC.Security.csproj -c Release
dotnet test tests/LunaAI.PC.Tests/LunaAI.PC.Tests.csproj -c Release
```

Settings live in `%APPDATA%\LunaAI\settings.json`; `LUNAAI_PC_DATA_DIR` overrides the data
directory (used by tests and portable installs). The provider API key is read from the environment
variable named in settings (default `LUNAAI_PC_API_KEY`) and is never written to disk.

## Continuous integration

`.github/workflows/ci.yml` runs five jobs:

1. **Repository guards** — product separation, branding, locale parity.
2. **LunaAI Web backend** — `npm ci`, API and isolation tests.
3. **LunaAI Web frontend** — tests plus production build and type check.
4. **LunaAI PC (Windows)** — restore, build, xUnit tests, publish, and a check that the published
   native build contains no web assets, with the artifact uploaded.
5. **LunaAI PC core (Linux)** — build and test the portable security core on Linux.

Build failures are surfaced as GitHub annotations so a failing compiler error is readable from the
checks API without downloading logs.
