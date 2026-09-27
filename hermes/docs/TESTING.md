# Testing

```bash
npm test                        # 174 TypeScript tests
.venv/bin/python -m pytest      # 44 Python tests
```

## Suites

| File                          | Tests | Protects                                     |
| ----------------------------- | ----- | -------------------------------------------- |
| `tests/permissions.test.ts`   | 48    | The permission model itself                  |
| `tests/locales.test.ts`       | 44    | Locale key parity and placeholder integrity  |
| `tests/vrm.test.ts`           | 26    | VRM container validation, idle animator, lip sync |
| `tests/broker.test.ts`        | 25    | Call pipeline, emergency stop, redaction, agent loop |
| `tests/auth.test.ts`          | 14    | Local API signing, replay and origin defence |
| `tests/ui.test.tsx`           | 12    | Real DOM: language switching, RTL, a11y      |
| `tests/native-parity.test.ts` |  5    | TS / Rust / Python tool catalogues agree     |
| `tests/python/test_voice.py`  | 21    | Voice parameters have measurable effects     |
| `tests/python/test_auth.py`   | 12    | Cross-language auth parity                   |
| `tests/python/test_agent.py`  | 11    | Intent routing stays inside the tool contract |

## Coverage against the original minimum areas

### UI
- [x] language switching — real jsdom render, en → ja → fa → en
- [x] Persian RTL — `<html dir>` flips and flips back
- [x] Japanese rendering — locale tests assert kana/kanji are actually present
- [x] English fallback — missing key falls back, then renders the key visibly
- [ ] transparent window — needs the compiled native build
- [ ] popout menu — needs the compiled native build

### Character
- [x] valid VRM upload — synthetic GLB fixtures accepted
- [x] invalid VRM handling — bad magic, truncation, non-VRM glTF, 40-seed fuzz
- [x] character switching — animator re-captures the rest pose on model swap
- [x] idle animation — motion occurs, chest oscillates rather than drifts, blinks counted over 30 s, saccades bounded, seed-deterministic
- [x] expression fallback — blendshape path when eye bones are absent
- [x] lip sync — ordering, kana syllables, Perso-Arabic, empty input, scheduler
- [ ] rendering itself — needs a WebGL context; not unit-testable in jsdom

### Voice
- [x] profile creation, male/female base voices
- [x] style parameters — every parameter proven to change the output
- [x] language selection — en/ja/fa
- [x] preview — produces a real playable WAV
- [ ] interruption — needs a real audio pipeline

### Agent
- [x] permission enforcement, confirmation prompts, emergency stop
- [x] tool result handling, audit logging
- [x] verification after meaningful actions; no re-observation for read-only
- [ ] tool timeout — native, needs the compiled build

### Security
- [x] a denied tool never reaches the executor (asserted by a spy, not by return value)
- [x] AUTONOMOUS cannot bypass blocked tools, even with a granted confirmation
- [x] destructive operations require confirmation — all 13 categories
- [x] localhost alone is not authorisation
- [x] replay, tamper, expiry and cross-endpoint reuse all rejected
- [x] credentials redacted before they reach the log

## Principles

**Test behaviour, not implementation.** Assert that the executor was never
invoked, not that a particular internal flag was set.

**Name tests as sentences.** `'denies keyboard input at OBSERVE'`.

**A bug fix without a regression test is unfinished.** Both VRM defects found
during Phase 1 — the GLB padding rejection and the silent Japanese mouth — have
dedicated tests.

**The security suites are not refactorable at will.** A failure in
`permissions.test.ts` means the security model changed. Fix the code, or change
the test deliberately and say so in the commit message.

## Not yet automated

- `cargo test` — the crate has never been compiled (no toolchain available in
  the authoring environment)
- E2E against the packaged app (tauri-driver + Playwright)
- Actual WebGL rendering output
