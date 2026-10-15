# LunaAI security model

## Two trust boundaries

```
LunaAI Web  ── untrusted internet users ──►  your servers        (no access to any user's device)
LunaAI PC   ── one local user ───────────►  that user's computer (no inbound network surface)
```

Nothing crosses the boundary between them. There is no shared privileged service, no mutual
authentication that would grant web users desktop rights, and no endpoint that proxies a desktop
action. `tests/separation.test.mjs` fails the build if web production code ever names a desktop
capability or exposes a privileged route.

## LunaAI PC controls

| Control | Where | Behaviour |
| --- | --- | --- |
| Permission levels | `LunaAI.PC.Security.Permissions.PermissionManager` | Observe / Assist / Autonomous. Higher levels only remove prompts; they never disable a check. |
| Default deny | same | A tool that is not registered with the permission manager is denied with reason `unknown_tool`. |
| Metadata validation | `ToolMetadataValidator` | A tool whose declared risk or minimum level does not match its capabilities is rejected at registration, which blocks silent privilege escalation by a careless or malicious tool. |
| Path scoping | `PathGuard` | Canonicalises paths, rejects `..` traversal, resolves symlinks and junctions and re-checks them, and keeps operating-system directories off limits even inside an approved root. |
| Command policy | `CommandGuard` | Executables must be on an allow list and given as bare names, arguments with shell metacharacters or destructive patterns are rejected, and processes run without a shell. |
| Emergency stop | `EmergencyStop` | Blocks every tool at every level until the user disengages it. Checked at the start of every authorisation and again immediately before execution. |
| Audit trail | `JsonlAuditLog` | Append-only JSON Lines record of every decision and execution with a machine-readable reason. |
| Secret redaction | `SecretRedactor` | Applied to all log fields, audit reasons and details, and exception messages. |
| No network surface | `LunaAI.PC.App` | The desktop application opens no listening socket. There is no local HTTP API to attack. |

Every computer action passes through `ToolExecutionPipeline`:
observe → plan → permission check → risk check → approval if required → execute → audit → verify.
Models propose tool calls; the pipeline decides whether they may run.

## LunaAI Web controls

* bcrypt (cost 12) password hashing; hashes never leave the server.
* JWT bearer tokens signed with `JWT_SECRET`; the service refuses to start in production without one.
  User identity is always derived from the token, never from a request body.
* Ownership predicate in every query; other users' resources return 404 to prevent id probing.
* `zod` validation on every request body and query, with explicit length limits.
* Rate limiting per IP for the whole API plus a stricter bucket for register/login.
* CORS restricted by `CORS_ORIGINS` in deployments; the browser client only ever uses relative paths.
* Provider API keys are read from server-side environment variables and are never sent to clients,
  logged or persisted in responses.
* Server-side tool execution is off by default (`ENABLE_SERVER_TOOLS=false`), allow-listable, and
  cannot include a computer-control capability because the registry refuses to register one.
* Uploaded files are treated as data belonging to one conversation; the original location on the
  user's device is never requested or stored.

## Threat scenarios and the expected behaviour

| Scenario | Expected behaviour | Covered by |
| --- | --- | --- |
| Model asks for a tool outside the workspace | Denied with `outside_approved_roots`, nothing executes | `AgentSessionTests.Denied_tool_calls_are_reported_to_the_model_and_never_executed` |
| Model invents a tool name | Denied with `unknown_tool`, no handler is resolved | `ToolExecutionPipelineTests.Unknown_tool_is_denied_without_any_handler_call` |
| Model tries to run a destructive command | Denied by the command guard | `ToolCatalogTests.Command_execution_is_denied_when_arguments_are_destructive` |
| Model asks to delete files | Approval required; denial prevents execution | `ToolExecutionPipelineTests.Denying_the_approval_prevents_execution` |
| Escalation through tool metadata | Registration throws | `PermissionManagerTests.Metadata_that_hides_a_capability_is_rejected_at_registration` |
| Emergency stop during a task | All further actions denied | `PermissionManagerTests.Emergency_stop_blocks_every_tool_including_low_risk_reads` |
| Symlink escape from an approved root | Resolved target re-checked and denied | `PathGuardTests.Denies_symbolic_links_that_escape_the_root` |
| One web user reading another's data | 404 and no data leak | `apps/web/backend/tests/isolation.test.js` |
| Secret in a log or audit record | Replaced with `[redacted]` | `AuditLogTests.Redacts_secret_looking_values`, `StorageTests.File_logger_redacts_secrets` |

## Known limitations

* The in-memory rate limiter is per instance; horizontal scaling needs a shared store.
* The JSONL audit log is append-only but not cryptographically chained or signed.
* The desktop application stores conversations in plain JSON in the user's own profile directory.
  OS-level disk encryption is the protection mechanism; per-conversation encryption is planned.
* `capture_screen` writes images locally. Forwarding images to a remote model requires the
  `SendScreenshotsToProvider` setting and is not wired up yet (planned).
* Code signing of the published executable is not configured in this repository.

## Reporting

Report a security issue privately to the maintainer instead of opening a public issue. Include
affected product, version, reproduction steps and impact.
