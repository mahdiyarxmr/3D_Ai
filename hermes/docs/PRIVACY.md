# Privacy

Local-first, and the default configuration sends nothing anywhere.

## What leaves the machine, and when

| Data           | Leaves only if                                   | Default |
| -------------- | ------------------------------------------------ | ------- |
| Prompts        | a cloud LLM provider is selected                 | off — in-process mock |
| Screenshots    | `privacy.allowCloudVision` is enabled            | off     |
| Microphone     | `privacy.allowCloudAudio` is enabled             | off     |
| File contents  | only as part of a prompt, so same as above       | off     |
| Telemetry      | never                                            | typed as the literal `false` |

Three independent switches. Enabling a cloud LLM does not silently enable cloud
vision — a user who accepts text leaving their machine has not thereby accepted
their screen leaving it.

`privacy.telemetry` is typed `z.literal(false)` in the settings schema, so
"enabled" is not a representable state. Turning it on would require a code
change and a schema change, both visible in review.

## Making it legible

The user can see, at any time:

- **Whether a screenshot leaves the computer** — the provider badge in Settings
  shows `local` or `cloud`, and a cloud provider cannot be selected while
  `allowCloudVision` is off.
- **Whether audio leaves the computer** — same treatment.
- **Which provider receives a prompt** — named in the agent status row.
- **Which files were accessed** — every filesystem call is an audit record.
- **Which tools ran** — the audit log is a first-class screen, filterable by
  tool, not a debug file.

## Credentials

- API keys live in the OS credential store. Settings persist a `credentialRef`
  only.
- Keys are passed to sidecars through the spawn environment, never a file.
- The audit redactor removes credential-shaped keys (`password`, `token`,
  `apiKey`, `secret`, …) and credential-shaped values (`sk-…`, `ghp_…`,
  `Bearer …`, `AKIA…`, PEM blocks) before anything is written.
- The session secret's `Debug` implementation prints `<redacted>`, so it cannot
  leak through a stray `{:?}` in a log line.

## Local data

```
%APPDATA%/dev.hermes.companion/
├── hermes.sqlite3     settings, characters, audit log
├── characters/        imported VRM files
├── logs/
└── memory/
```

All of it is deletable from Settings → Privacy, and audit retention
(`privacy.retainAuditLogDays`, default 90) is swept on every launch. The
repository `.gitignore` excludes every one of these paths, plus `*.vrm` — a
user's character model should never end up in a commit.

## Prompt injection is a privacy problem too

Text on screen can try to instruct the agent to read `~/.ssh` and paste it into
a chat window. The structural defences are: credential-shaped paths escalate to
CRITICAL and always require confirmation, an empty filesystem scope list means
*no* filesystem access, and cloud egress is off by default. There is no
content-level detection of injected instructions — see
[SECURITY.md](SECURITY.md#known-gaps).
