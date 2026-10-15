# LunaAI PC permission model

The permission manager is the decision point for every computer action. It is deliberately boring:
a fixed order of checks, no configuration that can turn a denial into an approval, and a
machine-readable reason for every outcome.

## Permission levels

| Level | Meaning | Typical user intent |
| --- | --- | --- |
| **Observe** | Inspect approved screen content, read approved project files, analyse windows and processes. No computer-changing action. | "Look, don't touch." |
| **Assist** (default) | Perform approved file edits and computer actions; ask for confirmation before sensitive or destructive operations; let the user review plans and changes. | Everyday pairing. |
| **Autonomous** | Execute permitted multi-step tasks without asking about every low-risk action, while all scope and risk restrictions stay in force and designated high-risk actions still require confirmation. | Long, repetitive tasks. |

Switching level never relaxes a check other than "may this low-risk action run without a prompt".
Emergency stop, path scoping, command policy, unknown-tool denial and high-risk confirmation apply at
every level.

## Risk classification

| Risk | Examples | Assist | Autonomous |
| --- | --- | --- | --- |
| Low | `read_file`, `list_directory`, `list_windows` | Allowed | Allowed |
| Medium | `capture_screen`, `press_key` | Approval | Approval when `RequireApprovalForMediumRisk` is set (default), otherwise allowed |
| High | `write_file`, `type_text`, `mouse_click`, `launch_application`, `run_command` | Approval | Approval |
| Critical | `delete_path`, `move_path` | Approval | Approval |

Approval always offers three answers: approve once, approve for this session, or deny. Denial is the
default when the dialog is dismissed, and a denial is recorded in the audit log with reason
`user_denied`.

## Tool catalogue

| Tool | Risk | Minimum level | Capabilities | Notes |
| --- | --- | --- | --- | --- |
| `capture_screen` | Medium | Observe | ReadScreen | Stores a PNG in the local data directory and returns metadata. |
| `list_directory` | Low | Observe | ReadFiles | Approved roots only. |
| `read_file` | Low | Observe | ReadFiles | Size limited. |
| `write_file` | High | Assist | WriteFiles | Approved roots only. |
| `move_path` | Critical | Assist | WriteFiles | Source and destination both validated. |
| `delete_path` | Critical | Assist | WriteFiles | Never auto-approved. |
| `run_command` | High | Assist | ExecuteCommands | Allow-listed executables, no shell, disabled unless the user enables command execution. |
| `mouse_click` | High | Assist | ControlInput | |
| `type_text` | High | Assist | ControlInput | 2000 characters per call. |
| `press_key` | Medium | Assist | ControlInput | Single key, from a fixed key map. |
| `list_windows` | Low | Observe | ControlWindows | Titles and process names. |
| `launch_application` | High | Assist | LaunchApplications | No shell metacharacters in the target. |

## The pipeline, stage by stage

1. **Observe** — the model or the user asks for screen or window information; those reads are
   themselves tools and are authorised like everything else.
2. **Plan** — model output becomes a `TaskPlan` with typed steps. A plan is data, not permission.
3. **Check permissions** — `PermissionManager.Authorize` runs the ordered checks: emergency stop,
   registered tool, permission level, file scope, command policy, write-in-observe-mode, risk.
4. **Check risk** — high and critical actions always require approval; medium actions depend on the
   setting; low actions run when the level allows.
5. **Request approval if needed** — a native modal dialog shows the tool, its risk, the reason and the
   raw arguments.
6. **Execute** — the typed tool performs the native call, with a per-call timeout from settings.
7. **Record audit event** — decision and execution are appended to the audit log with reasons,
   timings and redacted details.
8. **Verify result** — the step status (completed, failed, denied) is recorded and fed back to the
   model as the tool result.

## Command execution policy

Commands run through `System.Diagnostics.Process` with `UseShellExecute = false`, so no shell
interprets the arguments. On top of that:

* the executable must be a bare name on the allow list (`dotnet`, `node`, `git`, `python`, `cargo`,
  `go`, `mvn`, `make`, `msbuild`, `tsc`, …);
* `cmd`, `powershell`, `pwsh`, `bash`, `sh`, `wscript`, `reg` and `net` are deliberately **not** on
  the list, so shell pipelines and system administration tools cannot be reached through this tool;
* arguments containing `|`, `&&`, `||`, `;`, backticks, `$(`, `${`, redirection or newlines are
  rejected;
* destructive patterns (`rm -rf /`, `format `, `del /f`, `diskpart`, `shutdown`, `reg delete`,
  `bcdedit`, `takeown`, `icacls`, …) are rejected before the process starts;
* command execution itself is disabled unless the user turns it on in settings.

## File scope rules

An operation is allowed only when every path it touches is inside a directory the user approved:

* paths are canonicalised before comparison, so `..` sequences cannot escape;
* symbolic links and junctions are resolved and the resolved target is re-checked, so a link inside an
  approved root cannot point outside it;
* operating-system directories (`Windows`, `System32`, `Program Files`, `/etc`, `/usr`, …) stay
  protected even if the approved root contains them;
* writes validate the existing ancestor directory as well, so a linked parent directory cannot
  redirect a write.

## Extending the catalogue

Add a tool by implementing `ITool`, declaring an honest `ToolDescriptor`, registering it in
`ToolCatalog.Build` and adding tests. Registration validates the metadata and throws
`SecurityConfigurationException` when the declaration is inconsistent — a tool cannot claim low risk
while executing commands or claim to need no permission while controlling input.
