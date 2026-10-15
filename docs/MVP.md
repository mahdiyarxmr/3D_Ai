# HERMES MVP Acceptance Criteria

## Desktop
- [ ] Runs as a Windows desktop application.
- [ ] Has a borderless transparent companion mode.
- [ ] Has an expanded application window.
- [ ] Has a system tray entry.
- [ ] Has a global emergency stop mechanism.

## Localization
- [ ] English UI works.
- [ ] Japanese UI works.
- [ ] Persian UI works.
- [ ] Persian uses RTL layout.
- [ ] English/Japanese use LTR layout.
- [ ] Language can be changed from settings.
- [ ] Selected UI language persists after restart.
- [ ] Missing translation keys fall back to English.

## VRM
- [ ] User can upload a VRM.
- [ ] Invalid VRM is rejected gracefully.
- [ ] VRM renders in transparent mode.
- [ ] Idle animation is smooth.
- [ ] Blinking, breathing, eye movement and subtle sway exist.
- [ ] Expressions can be triggered.
- [ ] Lip sync works.

## Voice
- [ ] At least one male and one female base voice are supported.
- [ ] Voice profiles can be created.
- [ ] Pitch, speed, energy, softness, deepness, maturity and cuteness can be adjusted where supported by the provider.
- [ ] Japanese-inspired/anime voice styling is configurable.
- [ ] English, Japanese and Persian speech can be selected when the configured TTS provider supports them.
- [ ] Voice preview works.
- [ ] Speech can be interrupted.
- [ ] Emotion changes delivery and avatar expression.

## Agent
- [ ] Screenshot tool.
- [ ] Mouse tools.
- [ ] Keyboard tools.
- [ ] Filesystem tools.
- [ ] CMD tool.
- [ ] PowerShell tool.
- [ ] Application/window tools.
- [ ] Permission checks happen before execution.
- [ ] Tool activity is visible in the UI.
- [ ] High-risk actions request confirmation.
- [ ] Emergency stop cancels execution.

## Vision
- [ ] Agent can request a screenshot.
- [ ] Agent can inspect screenshot results.
- [ ] Agent can perform an action and re-observe.
- [ ] Agent verifies meaningful actions.

## JoyAI
- [ ] JoyAI is optional.
- [ ] Base application runs without JoyAI installed.
- [ ] JoyAI integration is behind an adapter/service boundary.

## Engineering
- [ ] No secrets committed.
- [ ] Unit tests for permission logic.
- [ ] Integration tests for tool authorization.
- [ ] E2E test for VRM upload.
- [ ] E2E test for language switching.
- [ ] Build instructions are documented.
