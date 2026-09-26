# Security

## Threat model

HERMES is a program that, by design, can move the mouse, type, run PowerShell
and delete files. The interesting question is not "can it be misused" but "who
can make it do so".

| # | Adversary                            | What they could do                                | Mitigation                                                                 |
| - | ------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------- |
| 1 | A confused or jailbroken **model**    | Emit destructive tool calls                       | Typed protocol, permission engine, always-confirm categories, hard blocks    |
| 2 | **Prompt injection** via screen text  | A webpage tells the agent to exfiltrate `.ssh`    | Credential paths escalate to CRITICAL; cloud egress is opt-in; audit log     |
| 3 | Another **local process**             | Drive HERMES's local API to run commands          | HMAC-signed requests; localhost is not trusted                              |
| 4 | A **web page** in the user's browser  | DNS-rebind to `127.0.0.1` and issue tool calls    | Origin allowlist; signed tokens the page cannot forge                        |
| 5 | A **compromised renderer**            | Call `execute_tool` bypassing the TS engine       | Rust re-checks level, capability and scope independently                     |
| 6 | A **malicious `.vrm`**                | Exploit the parser, or exfiltrate via the model   | Container validated before parsing; never executed; size-capped              |
| 7 | **Log leakage**                       | Credentials end up in the audit log or a bug report | Redaction before write; secret never `Debug`-printable in Rust              |
| 8 | A **runaway agent**                   | Keep acting after the user wants it to stop       | Native-first emergency stop; child-process kill; iteration cap               |

## Local API authentication

**Binding to 127.0.0.1 is not an authorisation boundary.** Every process on the
machine can connect, and a web page can reach it through DNS rebinding. HERMES
therefore treats its own services as untrusted callers.

Scheme (`packages/agent-protocol/src/auth.ts`, `services/common/auth.py`,
`apps/desktop/src-tauri/src/auth.rs` — all three must agree):

1. On launch the Rust core generates a 256-bit secret and writes it to
   `storage/settings/session.json` with restricted permissions. It is
   regenerated every launch, never logged, and `SessionSecret`'s `Debug` impl
   prints `<redacted>` so it cannot leak through a stray `{:?}`.
2. Each request carries `Authorization: Bearer <token>`, where the token is a
   base64 JSON envelope signed with HMAC-SHA256 over:

   ```
   METHOD \n path \n sha256(body) \n nonce \n expiresAt
   ```

3. Because the method, path and body hash are inside the signature, a captured
   token cannot be replayed against a different endpoint or with altered
   arguments.
4. Tokens expire after 60 seconds. Nonces are single-use within that window.
5. If an `Origin` header is present it must be on the allowlist
   (`tauri://localhost`, `https://tauri.localhost`), which blocks
   browser-originated rebinding.
6. Signature comparison is constant-time.
7. If the secret file is absent the services **fail closed** with 503 — they
   never fall back to unauthenticated operation.

Covered by `tests/auth.test.ts` (14 tests) and `tests/python/test_auth.py`
(12 tests), including a check that both implementations build byte-identical
canonical strings.

## Defence in depth at the IPC boundary

The webview is the weakest link — it renders model output and, eventually,
screenshots. So `execute_tool` does not trust it:

```rust
state.policy.read().check(&request.tool, &path_refs, stop.is_engaged())?;
```

This re-verifies the tool is known, the level permits its capability, every
path argument is inside a configured scope, and the emergency stop is clear.
The native policy cache is refreshed whenever settings are saved, so it cannot
lag behind the UI.

`tests/native-parity.test.ts` parses the Rust and Python tool tables and
asserts they match the TypeScript catalogue exactly — a mismatch would be a
silent under-restriction.

## Secrets handling

- API keys live in the OS credential store. Settings persist only a
  `credentialRef`, never the key.
- Keys reach a Python sidecar through its spawn environment, not a config file.
- The audit redactor strips credential-shaped **keys** and credential-shaped
  **values** (provider tokens, bearer headers, AWS ids, PEM blocks) before any
  write, and truncates very long strings.
- `.gitignore` refuses `.env`, `session.json`, `*.pem`, `*.key`.

## Shell execution

- PowerShell runs with `-NoProfile -NonInteractive`, so a user profile script
  cannot alter behaviour.
- `applications.open` spawns the binary directly, never via a shell, so
  arguments cannot be reinterpreted as extra commands.
- Every child process is registered with the emergency stop and killed —
  process tree included — when it fires.
- Output is truncated before it re-enters the model's context.

## Untrusted assets

`.vrm` files are validated before the glTF parser is handed the bytes: GLB
magic, container version, declared length against actual length, JSON chunk
presence, parseable JSON, and a genuine VRM extension. Size is capped at
200 MB. A fuzz test asserts the validator never throws on arbitrary input. The
file is data; nothing in it is executed.

## Content Security Policy

The production CSP is set by Tauri (`tauri.conf.json`): `script-src 'self'`, no
`unsafe-eval`, `connect-src` limited to IPC and loopback. It is deliberately
not in `index.html`, so that the Vite dev server's HMR client keeps working
without weakening the shipped policy.

## Privacy controls

Three independent opt-in switches — cloud LLM, cloud vision, cloud audio — all
default to off. Telemetry is typed as the literal `false` in the settings
schema, so "on" is not a representable state. Audit retention is configurable
and swept on launch.

## Reporting a vulnerability

Open a **private** security advisory on the GitHub repository rather than a
public issue. Please include the version, your permission level, and a minimal
reproduction.

## Known gaps

Honest list of what is not yet hardened:

- The Windows ACL on `session.json` is not yet tightened beyond the per-user
  `%APPDATA%` default (`auth.rs`, marked TODO).
- The OpenAI provider adapter is written but has never been exercised against
  the live API.
- There is no rate limiting on tool invocation beyond the per-run iteration cap.
- Prompt-injection defences are structural (permissions, egress controls); there
  is no content-level detection of injected instructions in screenshots.
