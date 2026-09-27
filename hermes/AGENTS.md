# AGENTS.md

Working agreement for anyone — human or AI — writing code in this repository.

## The first rule

**A feature is not done until it runs.**

Not until it is designed. Not until it is documented. Not until the types line
up. Until someone can start the app and use it.

The corollary matters more: **never write documentation that describes
behaviour the code does not have.** A README that claims working speech
recognition, backed by a function returning a canned string, is worse than no
README — it destroys the reader's ability to trust anything else in the repo.
If something is not implemented, say so, in the table, with a ⬜.

## If you cannot implement it

Three acceptable outcomes, in order of preference:

1. Implement it.
2. Return an explicit error — HTTP 501, a `ToolError`, a disabled control with
   a reason — and add a line to `docs/TASKS.md`.
3. Do not add the surface at all.

Never acceptable: returning plausible fake data. A vision stub that invents UI
elements makes the agent click on things that are not there. A TTS stub that
silently ignores `cuteness` gives the user a slider that does nothing. Both are
lies with a runtime cost.

## Order of work

Follow the order in `docs/IMPLEMENTATION_PLAN.md`. It is not arbitrary:

- **The permission engine precedes every dangerous capability.** Do not
  implement `shell.cmd` and plan to gate it afterwards.
- **The app stays runnable at every commit.** No "it'll work once the other
  half lands".
- **One layer at a time.** Do not start the vision pipeline, the voice pipeline
  and the memory system in the same change.

## Hard constraints

These are not preferences. Violating one is a bug regardless of how well it
tests.

1. **The model never touches a raw tool.** It sees typed declarations filtered
   by permission level. There is no `run_command` IPC endpoint, and adding one
   would defeat the entire architecture.
2. **Localhost is not authorisation.** Every local API call is HMAC-signed.
   Do not add an "it's only local" exemption.
3. **Two enforcement layers.** TypeScript decides and asks; Rust independently
   re-checks. Never remove the Rust check because "the frontend already did it"
   — the frontend is the part that renders untrusted content.
4. **AUTONOMOUS is not root.** The always-confirm and blocked categories apply
   at every level. Do not add a setting that disables them.
5. **JoyAI is never a dependency.** Deleting `services/joyai/` must leave every
   test passing.
6. **Every parameter has a defined effect.** If you cannot write down what a
   slider does, do not add the slider.
7. **Nothing executes without an audit record** — denials included.
8. **Simulated results are labelled.** The browser runtime prefixes every
   result with `[simulated]`. Keep it.

## Testing

Write the test before the dangerous code, not after.

- New tool → permission test first, then the executor.
- Bug fix → regression test, always. The two VRM bugs found in Phase 1 each
  have one, and both would have shipped without tests.
- Name tests as sentences describing behaviour:
  `'denies keyboard input at OBSERVE'`.
- Assert on outcomes. That the executor was *never called* is the assertion
  that matters for a denial — not that the function returned `allowed: false`.
- A failure in `tests/permissions.test.ts` is a security regression. Do not
  "fix" it by editing the expectation unless you mean to change the security
  model, and say so in the commit message if you do.

Run before every commit:

```bash
npm run typecheck && npm test && .venv/bin/python -m pytest
```

## Style

- TypeScript strict, `noUncheckedIndexedAccess` included. No `any`.
- Rust: no `unwrap()` outside tests; return `ToolError`.
- Python: typed signatures, `ruff` clean.
- CSS: logical properties only. A single `margin-left` breaks Persian.
- No hard-coded user-visible strings. Ever. Add the key to all three languages.
- Comments explain *why*. The code says what.

## Keeping the three catalogues in sync

The tool list exists in TypeScript, Rust and Python. Change one, change all
three, or `tests/native-parity.test.ts` fails. It fails for a reason: a tool
that Rust thinks is read-only and TypeScript thinks is destructive is a
privilege-escalation bug.

## Documentation upkeep

When implementation diverges from a document, **update the document in the same
change**. `docs/LOCALIZATION.md` now points at `docs/I18N.md` precisely because
two competing conventions were allowed to coexist for a while, and that is the
failure mode to avoid.

Keep `docs/TASKS.md` in step with the `TODO`s in the code. A `TODO` with no
task entry will be forgotten.

## Commits

Present tense, describing the change and its reason:

```
fix(vrm): strip GLB chunk padding before parsing JSON

The JSON chunk is padded to a 4-byte boundary, so any VRM whose JSON
length was not a multiple of 4 was rejected as bad_json — about three
in four real models. Adds alignment cases to tests/vrm.test.ts.
```
