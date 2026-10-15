# Testing

Tests exist to prove the security-relevant behaviour, not to inflate a number.

## How to run

```bash
# Repository guards: separation, branding, locale parity
node --test tests/separation.test.mjs

# LunaAI Web backend (26 tests): auth, isolation, streaming, tool policy
cd apps/web/backend && npm test

# LunaAI Web frontend (17 tests): i18n, SSE parser, API client
cd apps/web/frontend && npm test

# LunaAI PC: 70 test cases on Windows, the same suite on Linux for the portable core
cd apps/pc && dotnet test LunaAI.PC.sln -c Release
```

## LunaAI Web

`apps/web/backend/tests`

| File | Covers |
| --- | --- |
| `auth.test.js` | Registration, duplicate accounts, weak passwords, bcrypt storage, login, token requirement, auth rate limiting, no hash leakage. |
| `isolation.test.js` | Per-user listing, 404 for foreign reads/writes/renames/deletes, search scoping, per-user settings, persistence across a restart with a real SQLite file. |
| `chat.test.js` | SSE deltas, stored assistant reply, title generation, size limits, provider failure reporting, no secret leakage in responses. |
| `security.test.js` | Refusal to register computer-control capabilities, refusal of non-server scopes, policy denials (disabled, unknown, not allow-listed), safe arithmetic evaluation, allow-listed tool execution over HTTP, audit records, catalogue contents. |

`apps/web/frontend/tests`

| File | Covers |
| --- | --- |
| `i18n.test.ts` | English/Japanese/Persian strings, RTL for Persian, fallback chain, interpolation, key parity, non-empty values, error-code mapping, locale detection. |
| `sse.test.ts` | Chunk reassembly across network boundaries, keep-alive comments, malformed payloads, trailing events, abort handling. |
| `api.test.ts` | Bearer token only on authenticated calls, no localhost URLs, typed errors, token invalidation on 401, network error mapping, streaming callbacks. |

## LunaAI PC

`apps/pc/tests/LunaAI.PC.Tests`

| File | Covers |
| --- | --- |
| `PermissionManagerTests` | Unknown tool denial, high-risk confirmation in autonomous mode, observe-level write denial, allowed low-risk reads, path scope denial, emergency stop, disabled command execution, escalation attempts rejected at registration. |
| `PathGuardTests` | Approved-root allowance, outside-root denial, traversal denial, protected OS directories, symlink escape, invalid paths. |
| `CommandGuardTests` | Allow-listed executables, rejected shells and admin tools, destructive patterns, shell metacharacters, path-qualified executables, null bytes. |
| `ToolExecutionPipelineTests` | Denied tools never invoked, unknown tools, approval flow, denial preventing execution, session approvals, emergency stop, failure handling, audit records. |
| `AgentSessionTests` | Denied tool calls reported back to the model, approved execution inside the root, tool-call limit, emergency stop during a task, malformed arguments, conversation persistence. |
| `ToolCatalogTests` | Catalogue contents, approval requirements for input control, local screenshot storage, command policy end to end. |
| `ProviderAndStorageTests` | Streaming deltas, tool-call parsing, HTTP failures, development provider labelling, provider fallback without a key, store round trips, corrupted-file recovery, log redaction. |
| `AuditLogTests` | Recording and reading events, secret redaction, survival of a corrupted line. |

Windows-only services (GDI capture, `SendInput`, window enumeration) cannot run on a headless CI
runner; the tests exercise them through the `IScreenService`, `IInputService` and
`IApplicationService` interfaces with fakes, and the Windows implementations are compiled in the
Windows job so they cannot rot.

## Repository guards

| Check | Purpose |
| --- | --- |
| No desktop capability in web production code | The two products stay separate. |
| No privileged local endpoints in the web API | No `/api/pc`, `/api/computer`, `/api/shell`, `/api/execute`, `/api/local`. |
| The desktop product never imports the web app | No runtime coupling. |
| Branding is LunaAI everywhere | No leftovers of the previous product name in product materials. |
| Locale parity | Every locale defines every key that exists in English. |

## Not yet covered

* End-to-end browser tests (Playwright) for the web UI.
* The published desktop executable rendering a window on a real interactive Windows session.
* Load and soak testing of the streaming endpoint.
* Installer and update-path testing.
