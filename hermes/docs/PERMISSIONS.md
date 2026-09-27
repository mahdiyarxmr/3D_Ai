# Permissions

The authoritative implementation is
`packages/agent-protocol/src/permissions.ts`, mirrored for defence in depth by
`apps/desktop/src-tauri/src/permissions.rs`. This document explains the rules;
`tests/permissions.test.ts` enforces them.

## Levels

| Level          | Capabilities                                                    | Auto-approves up to |
| -------------- | --------------------------------------------------------------- | ------------------- |
| **OBSERVE**    | `observe`, `fs.read`                                              | LOW                 |
| **ASSIST**     | + `input`, `fs.write`, `fs.delete`, `process`, `shell`, `network` | MEDIUM              |
| **AUTONOMOUS** | same as ASSIST                                                    | HIGH                |

The levels differ along two independent axes: **which capabilities exist at
all**, and **how much risk runs without asking**. AUTONOMOUS is not "ASSIST
with the safety off" — it has exactly the same capability set and exactly the
same hard blocks. It only removes the per-action prompt for routine work.

### OBSERVE

Allowed: screenshots, window enumeration, system info, process lists, and
reading files inside a configured filesystem scope.

Not allowed: mouse, keyboard, hotkeys, file writes, deletion, launching or
closing applications, CMD, PowerShell.

At this level the model is not even *told* about the forbidden tools —
`visibleTools()` filters the declarations by capability, so it cannot propose
an action it is not permitted to take.

### ASSIST

Adds full computer control, with confirmation for anything above MEDIUM risk.
In practice that means clicks and typing proceed; shell commands, application
launches, file writes and deletions ask first.

### AUTONOMOUS

High-risk tools run without prompting. The categories below do not.

## Risk classes

| Class        | Meaning                                                | Examples                                |
| ------------ | ------------------------------------------------------ | --------------------------------------- |
| **SAFE**     | Reversible, no side effects outside HERMES             | `computer.screenshot`, `system.info`     |
| **LOW**      | Side effects, trivially reversible                     | `computer.mouse_move`, `filesystem.read` |
| **MEDIUM**   | Real side effects on user data or UI state             | `computer.mouse_click`, `keyboard_type`  |
| **HIGH**     | Hard to reverse, or arbitrary code execution           | `shell.cmd`, `filesystem.write`          |
| **CRITICAL** | Destructive or security-relevant                       | `filesystem.delete`, `format C:`         |

Risk is per **call**, not per tool. `shell.powershell` is HIGH in general; a
script containing `Set-ExecutionPolicy` is CRITICAL. The escalation rules are
data (`CRITICAL_SHELL_PATTERNS`, `SENSITIVE_PATH_PATTERNS` in `tools.ts`) so
they are auditable and testable rather than buried in conditionals.

## Always confirmation-required — at every level

Even in AUTONOMOUS, with the tool allowlisted, these require an explicit human
approval. The escalation reason is attached to the prompt so the user is told
*why*.

| Category               | Triggered by                                                       |
| ---------------------- | ------------------------------------------------------------------ |
| `destructive.delete`   | `filesystem.delete`, `rd /s`, `del /q`, `Remove-Item -Recurse`      |
| `destructive.disk`     | `format`, `diskpart`, `vssadmin delete`, `cipher /w`, a bare drive root |
| `security.config`      | `reg add`/`reg delete`, `Set-ExecutionPolicy`                       |
| `security.firewall`    | `netsh advfirewall`                                                 |
| `security.accounts`    | `net user`, `net localgroup`                                        |
| `system.config`        | Writes under `\Windows`                                             |
| `system.boot`          | `bcdedit`                                                           |
| `system.power`         | `shutdown`, `Restart-Computer`, `Stop-Computer`                     |
| `persistence`          | `schtasks`, `Register-ScheduledTask`, `New-Service`, `sc create`, Startup folder, `CurrentVersion\Run` |
| `credentials`          | SAM hive, `.ssh`, `.aws`, `.gnupg`, `id_rsa`, `.env`, browser login DBs, `cmdkey`, `Get-Credential` |
| `remote.code`          | `Invoke-Expression`, `iex`, `DownloadString`, piped `Invoke-WebRequest` |
| `process.force_kill`   | `applications.close` with `force: true`                             |

## Permanently blocked — no level, no confirmation

| Category             | Triggered by                                      |
| -------------------- | ------------------------------------------------- |
| `security.antivirus` | `Set-MpPreference`, `Add-MpPreference`, `Defender` |

Disabling the user's security software is not an action HERMES will perform,
and there is no dialog that unlocks it. If a user genuinely needs this, they
can do it themselves — an AI companion should not be the vector.

## Filesystem scopes

File tools operate only inside explicitly configured directories.

- An **empty scope list means no filesystem access at all** — not "everywhere".
  This is the default.
- Both endpoints of `copy` and `move` are checked.
- Paths are normalised lexically (separators unified, `.`/`..` resolved) before
  comparison, so `C:/allowed/../../Windows/win.ini` is rejected.
- Comparison is case-insensitive for Windows paths, case-sensitive otherwise.
- A scope match is prefix-on-a-boundary: `C:/Users/dev/Documents` does **not**
  authorise `C:/Users/dev/Documents-secret`.
- Rust re-normalises independently, refusing any path that pops above its root.

## Allow and deny lists

- **Denylist always wins**, at every level, before any other check.
- A **non-empty allowlist is exclusive**: only the listed tools may run.
- An empty allowlist means "whatever the level permits" — it is not a block.

## Confirmation semantics

- A confirmation grant is **single-use** and bound to one `callId`. The next
  identical action asks again.
- After approval the engine **re-evaluates from scratch** with the grant
  recorded. A grant satisfies the confirmation requirement and nothing else —
  it cannot widen capability or filesystem scope.
- A timeout is a refusal. A thrown or dismissed dialog is a refusal.
- Both the request and the outcome are written to the audit log.

## Emergency stop

Engaging the stop:

1. Sets a process-wide flag that makes `evaluate()` deny **everything**,
   including SAFE tools.
2. Aborts the `AbortSignal` handed to any in-flight executor.
3. Kills every child process HERMES spawned, via the process tree on Windows.
4. Cancels any pending confirmation as a refusal.

It can be triggered from the in-app button, the companion-mode pill, the system
tray, or the OS-wide `Ctrl+Alt+Esc` shortcut. The tray and shortcut paths set
the **native** flag first, so a frozen webview cannot block a stop. It stays
engaged until the user explicitly releases it.

## Audit

Every decision — allowed, denied, confirmed, declined, executed, failed —
produces exactly one append-only record with the tool, redacted arguments, risk
class, level, outcome, reason, duration and result summary. Redaction strips
credential-shaped keys (`password`, `token`, `apiKey`, …) and credential-shaped
values (`sk-…`, `ghp_…`, `Bearer …`, `AKIA…`, PEM private keys) before anything
touches disk.

## Testing

`tests/permissions.test.ts` covers, among others:

- every tool OBSERVE must refuse, by name;
- each of the thirteen always-confirm categories, at AUTONOMOUS;
- the antivirus block surviving a granted confirmation;
- traversal, sibling-prefix and both-endpoint scope enforcement;
- emergency stop denying even SAFE tools;
- coherence of the policy tables themselves (OBSERVE ⊂ ASSIST, no level
  auto-approves CRITICAL, blocked and always-confirm sets are disjoint).
