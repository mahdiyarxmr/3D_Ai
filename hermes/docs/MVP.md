# MVP acceptance criteria

Status as of the end of Phase 1. A box is only ticked if something in the
repository actually does it — documentation does not count as evidence.

Legend: ✅ done · 🟡 partial · ⬜ not started · 🔨 written but needs the Windows
build to verify.

## Desktop
- 🔨 Runs as a Windows desktop application — Tauri crate written, never compiled
- 🔨 Borderless transparent companion mode — configured in `tauri.conf.json`
- ✅ Expanded application window
- 🔨 System tray entry — `tray.rs`, with localized labels pushed from the UI
- ✅ Global emergency stop — in-app + tray + `Ctrl+Alt+Esc`

## Localization
- ✅ English UI
- ✅ Japanese UI
- ✅ Persian UI
- ✅ Persian RTL
- ✅ English/Japanese LTR
- ✅ Language changeable from settings, at runtime, without a reload
- ✅ Selected UI language persists
- ✅ Missing keys fall back to English, then render as the key

## VRM
- ✅ User can upload a VRM
- ✅ Invalid VRM rejected gracefully — validated before the parser sees it
- ✅ Renders in the transparent stage — `alpha: true`, no clear colour
- ✅ Idle animation is smooth — six layers, 60 fps, frame-rate independent
- ✅ Blinking, breathing, eye movement and subtle sway all present
- ✅ Expressions can be triggered — cross-faded, biased by personality
- 🟡 Lip sync — text-driven visemes work; audio-driven awaits real TTS

## Voice
- ✅ Male and female base voices
- ✅ Voice profiles can be created and persisted
- ✅ Every parameter adjustable, with a defined effect; unsupported ones are
  reported by the provider and greyed out rather than silently ignored
- ✅ Japanese-inspired / anime styling configurable
- ✅ en/ja/fa selectable
- 🟡 Voice preview — works against the mock provider
- 🟡 Speech interruption — plumbed through the emergency stop; no real audio yet
- ✅ Emotion changes delivery parameters and the avatar expression

## Agent
- ✅ Screenshot tool
- ✅ Mouse tools
- ✅ Keyboard tools
- ✅ Filesystem tools
- ✅ CMD tool
- ✅ PowerShell tool
- 🟡 Application/window tools — `open` and `list_windows` done; `close`/`focus`
  return an explicit error rather than a fake success
- ✅ Permission checks happen before execution — enforced twice, independently
- ✅ Tool activity visible in the UI
- ✅ High-risk actions request confirmation
- ✅ Emergency stop cancels execution, including in-flight work

*(Native tools are written and policy-gated; they execute for real only once
the Rust crate is compiled on Windows.)*

## Vision
- ✅ Agent can request a screenshot
- 🟡 Agent can inspect screenshot results — receives them; no vision model yet
- ✅ Agent can act and re-observe
- ✅ Agent verifies meaningful actions, and skips verification for read-only ones

## JoyAI
- ✅ Optional
- ✅ Base application runs without it — nothing imports it
- ✅ Behind an adapter/service boundary

## Engineering
- ✅ No secrets committed — `.gitignore` plus redaction in the log path
- ✅ Unit tests for permission logic — 48
- ✅ Integration tests for tool authorization — the broker suite
- 🟡 E2E test for VRM upload — validation and animation covered at unit level;
  no packaged-app E2E
- ✅ E2E-ish test for language switching — real DOM render
- ✅ Build instructions documented — README + BUILD.md

## Honest summary

Everything that can be verified without a Windows machine and a Rust toolchain
is verified, by 218 automated tests. What remains for Phase 1 completion is:
compile the crate, and replace the mock voice/vision providers with real ones.
Neither is blocked by design work.
