# Settings

The schema is `packages/shared/src/settings.ts`. It is zod-validated with
defaults on every field, so a truncated or hand-edited settings file degrades
to defaults instead of crashing the app.

Saving settings also refreshes the **native** policy cache in the Rust core, so
a permission change takes effect on both enforcement layers at once.

## General

| Key                     | Type                 | Default | Effect                                    |
| ----------------------- | -------------------- | ------- | ----------------------------------------- |
| `general.uiLanguage`    | `en` \| `ja` \| `fa` | `en`    | UI chrome only. Switches at runtime.      |
| `general.startOnLogin`  | bool                 | `false` | **Not implemented** — disabled in the UI  |
| `general.minimiseToTray`| bool                 | `true`  | Close button hides rather than exits      |
| `general.alwaysOnTop`   | bool                 | `true`  | Companion window stays above other windows|
| `general.theme`         | `dark` \| `light`    | `dark`  |                                           |

## Conversation

| Key                              | Default | Effect                                                    |
| -------------------------------- | ------- | --------------------------------------------------------- |
| `conversation.language`          | `en`    | What the agent writes and speaks. **Independent of the UI language.** |
| `conversation.followUserLanguage`| `true`  | Detect the language of the user's message and reply in it  |

## Agent

| Key                             | Default    | Effect                                                    |
| ------------------------------- | ---------- | --------------------------------------------------------- |
| `agent.permissionLevel`         | `OBSERVE`  | The safest level is the default. See [PERMISSIONS.md](PERMISSIONS.md). |
| `agent.toolAllowlist`           | `[]`       | Empty = whatever the level permits. Non-empty = exclusive. |
| `agent.toolDenylist`            | `[]`       | Always wins, at every level, before any other check.       |
| `agent.filesystemScopes`        | `[]`       | **Empty means no filesystem access**, not unrestricted.    |
| `agent.confirmationTimeoutMs`   | `120000`   | A timeout is a refusal. 5 s–10 min.                        |
| `agent.maxIterations`           | `12`       | Hard cap per run; the loop emits `interrupted` on hitting it. |

## Voice

| Key                    | Default | Effect                                        |
| ---------------------- | ------- | --------------------------------------------- |
| `voice.inputEnabled`   | `false` | Microphone capture (not implemented yet)      |
| `voice.outputEnabled`  | `true`  | Speak replies                                 |
| `voice.inputDeviceId`  | `null`  | `null` = system default                       |
| `voice.outputDeviceId` | `null`  | `null` = system default                       |
| `voice.vadThreshold`   | `0.35`  | Voice-activity sensitivity                    |
| `voice.sttProvider`    | `mock`  | Returns 501 until a real one is registered    |
| `voice.ttsProvider`    | `mock`  | Working mock; reports its capability set      |

Per-character voice *parameters* (pitch, cuteness, animeStyle…) live on the
character, not here — see [CHARACTER.md](CHARACTER.md).

## AI

| Key                 | Default | Effect                                                      |
| ------------------- | ------- | ----------------------------------------------------------- |
| `ai.llmProvider`    | `mock`  | In-process mock; works with no network and no Python        |
| `ai.visionProvider` | `mock`  | Reports "none configured" rather than inventing results     |
| `ai.credentialRef`  | `null`  | Which OS keychain entry holds the key. **Never the key itself.** |

## Privacy

| Key                          | Default | Effect                                        |
| ---------------------------- | ------- | --------------------------------------------- |
| `privacy.allowCloudLlm`      | `false` | Gate on any off-device prompt                 |
| `privacy.allowCloudVision`   | `false` | Gate on any off-device pixel                  |
| `privacy.allowCloudAudio`    | `false` | Gate on any off-device audio                  |
| `privacy.retainAuditLogDays` | `90`    | Swept on launch. 1–3650.                      |
| `privacy.telemetry`          | `false` | Typed `z.literal(false)` — `true` is unrepresentable |

## Character

| Key                            | Default | Effect                    |
| ------------------------------ | ------- | ------------------------- |
| `character.activeCharacterId`  | `null`  | Which character is on screen |

Scale, offset and idle behaviour belong to the character record, so they travel
with the character rather than with the installation.

## JoyAI

| Key              | Default                  | Effect                                        |
| ---------------- | ------------------------ | --------------------------------------------- |
| `joyai.enabled`  | `false`                  | Off by default. The app never requires it.    |
| `joyai.endpoint` | `http://127.0.0.1:8734`  | Probed; unreachable is a normal, quiet state. |

## Advanced

| Key                      | Default | Effect                                              |
| ------------------------ | ------- | --------------------------------------------------- |
| `advanced.developerMode` | `false` | Shows service status, raw tool payloads, diagnostics |

## Storage

SQLite `settings` table on the desktop; `localStorage` in the browser runtime.
Both behind the same `SettingsStore` interface, so no component knows which.
