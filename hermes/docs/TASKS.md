# Tasks

Every `TODO` in the codebase should have a line here. Ordered by priority
within each section.

## Blocking the native build

- [ ] **Compile the Rust core on Windows.** Never compiled — no toolchain in
      the environment it was written in. Expect API drift in `enigo`, `xcap`
      and `sysinfo`. — `apps/desktop/src-tauri/`
- [ ] Replace the placeholder tray/bundle icons with real artwork, and generate
      a proper `icon.ico` for the NSIS/MSI bundles. — `src-tauri/icons/`
- [ ] Tighten the Windows DACL on `session.json` to the current user only.
      — `src-tauri/src/auth.rs`
- [ ] Implement `applications.close` and `applications.focus` (currently return
      an error rather than a fake success). — `src-tauri/src/tools.rs`

## Voice

- [ ] Register a real STT provider (faster-whisper). `/transcribe` returns 501
      today. — `services/voice/main.py`
- [ ] Register a real TTS provider (Piper) and map the composite parameters
      through `derive_composites()`. — `services/voice/providers/`
- [ ] Microphone capture + VAD in the companion window.
- [ ] Replace the Web Speech API preview fallback with a call to the voice
      service once a provider exists. — `screens/VoicePanel.tsx`
- [ ] Query provider capabilities at runtime instead of the hard-coded
      `MOCK_PROVIDER_CAPABILITIES` set. — `screens/VoicePanel.tsx`
- [ ] Drive `VrmStage.setViseme` from live audio via `AudioEnvelopeLipSync`.

## Vision

- [ ] Local OCR via rapidocr-onnxruntime. — `services/vision/main.py`
- [ ] Screenshot region cropping and element targeting.
- [ ] Windows UI Automation tree as a more reliable alternative to pixel clicks.

## Agent

- [ ] Exercise the OpenAI adapter against the live API — written but untested.
      — `services/agent/providers/openai_provider.py`
- [ ] Local provider via Ollama.
- [ ] Route the desktop app's agent loop through the agent service when a
      non-mock provider is selected (today the loop always uses the in-process
      provider).
- [ ] Persistent conversation memory. — `storage/memory/`

## Desktop

- [ ] `startOnLogin` is disabled outside Tauri and unimplemented inside it.
      — `screens/SettingsPanel.tsx`
- [ ] Actually switch between the `companion` and `expanded` OS windows; the
      mode toggle currently re-renders within one window.
- [ ] Persist companion window position across restarts.
- [ ] Per-monitor DPI handling for the transparent window.

## Quality

- [ ] Add a Rust test run to CI once the crate compiles (`cargo test` covers
      `permissions.rs` already).
- [ ] Add a GitHub Actions workflow: typecheck, vitest, pytest, cargo.
- [ ] Coverage reporting.
- [ ] E2E test driving the packaged app (Playwright + tauri-driver).

## Documentation

- [ ] Screenshots in the README once the native build runs.
- [ ] A short video of companion mode.
