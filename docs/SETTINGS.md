# Settings

## LunaAI Web (per account, stored server-side)

| Setting | Values | Notes |
| --- | --- | --- |
| `language` | `en`, `ja`, `fa` | Interface language; Persian switches the layout to right-to-left. |
| `theme` | `system`, `light`, `dark` | `system` follows the operating system preference. |

Both are validated by the API (`zod`) and by the frontend; the client also caches the language locally
so a reload does not flash the wrong language.

## LunaAI PC (`%APPDATA%\LunaAI\settings.json`)

| Section | Setting | Default | Meaning |
| --- | --- | --- | --- |
| General | `UiLanguage` | `en` | Interface language (`en`, `ja`, `fa`). |
| General | `ConversationLanguage` | `en` | Language used for replies and speech, independent of the interface. |
| General | `Theme` | `system` | Light/dark preference. |
| General | `MinimizeToTray` | `true` | Hide to the notification area instead of closing. |
| General | `WorkspacePath` | empty | Default project folder for new conversations. |
| Permissions | `ApprovedRoots` | empty | Directories file tools may touch. Empty means no file tool can run. |
| Permissions | `Agent.PermissionLevel` | `assist` | `observe`, `assist` or `autonomous`. |
| Permissions | `Agent.RequireApprovalForMediumRisk` | `true` | Require confirmation for medium-risk actions in autonomous mode. |
| Permissions | `Agent.AllowCommandExecution` | `false` | Master switch for the command tool. |
| Permissions | `Agent.MaxToolCallsPerTask` | `25` | Upper bound of tool executions per turn. |
| Permissions | `Agent.ToolTimeoutSeconds` | `120` | Per-invocation timeout. |
| AI | `Provider.Kind` | `LocalEcho` | `LocalEcho` (development) or `OpenAiCompatible`. |
| AI | `Provider.BaseUrl` | `https://api.openai.com/v1` | Endpoint, including a locally hosted model. |
| AI | `Provider.Model` | `gpt-4o-mini` | Model name passed to the endpoint. |
| AI | `Provider.ApiKeyEnvironmentVariable` | `LUNAAI_PC_API_KEY` | Name of the environment variable holding the key. The key itself is never stored. |
| Privacy | `Privacy.SendScreenshotsToProvider` | `false` | Whether image bytes may be sent to a provider. |
| Privacy | `Privacy.SendFileContentsToProvider` | `false` | Whether file contents may be sent to a provider. |
| Privacy | `Privacy.RecordScreenLocally` | `true` | Keep captured screenshots on disk. |
| Privacy | `Privacy.StoreConversationsLocally` | `true` | Persist conversation history. |
| Privacy | `Privacy.StoreAuditLogLocally` | `true` | Persist the audit log. |

Settings are written atomically (temporary file plus move), and a corrupted file falls back to
defaults instead of failing to start. `LUNAAI_PC_DATA_DIR` relocates the whole data directory, which
is how the tests and portable installs avoid touching the real profile.
