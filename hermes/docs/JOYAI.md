# JoyAI integration

JoyAI-Video-Edit is an **optional** visual/video subsystem. The base HERMES
application does not depend on it, and that is enforced structurally rather
than by convention.

## How the boundary is enforced

```
HERMES (Tauri + React)
   │  HTTP, only if joyai.enabled
   ▼
services/joyai/main.py          ← the adapter, ships with HERMES
   │  HTTP, only if JOYAI_UPSTREAM is set
   ▼
JoyAI runtime                   ← separate install, separate GPU requirements
```

1. **No import, anywhere.** No package in `packages/` or `apps/` references
   JoyAI. Deleting `services/joyai/` entirely leaves every test passing.
2. **Off by default.** `joyai.enabled` defaults to `false`.
3. **Unreachable is a normal state.** `GET /status` always answers, reporting
   `{"installed": false}` cleanly when no upstream is configured. It is not an
   error path, and it does not produce an error toast.
4. **Separate process, separate dependencies.** JoyAI's model and GPU
   requirements are far larger than the assistant's; they must not become a
   prerequisite for launching a chat window.
5. **The adapter is the seam.** If JoyAI's API changes, one file changes.

## Endpoints

| Method | Path         | Behaviour                                          |
| ------ | ------------ | -------------------------------------------------- |
| GET    | `/health`    | Always 200                                         |
| GET    | `/status`    | Reports whether an upstream is configured/reachable |
| POST   | `/transform` | 503 unless `JOYAI_UPSTREAM` is set                 |

Configured by the `JOYAI_UPSTREAM` environment variable. Absent means absent —
the adapter does not guess at a default upstream.

## Status

⬜ **Stub.** The adapter, the boundary and the settings exist and are wired.
No transformation is implemented; `/transform` returns 503 rather than a
plausible-looking fake.

## Potential future features

Video transformation, webcam effects, stylized video, desktop video
processing — Phase 3 at the earliest, and each behind the same boundary.
