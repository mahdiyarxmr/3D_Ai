# Localization

English (`en`), Japanese (`ja`) and Persian (`fa`) are first-class languages for both products.
All strings live in `locales/{locale}/{namespace}.json` and are referenced by key; no user-visible
text is hard-coded in source files.

## Structure

```
locales/
  en/ common.json  web.json  pc.json
  ja/ common.json  web.json  pc.json
  fa/ common.json  web.json  pc.json
```

* `common.json` — brand, navigation, generic actions, shared error messages. Used by both products.
* `web.json` — LunaAI Web strings (auth, chat, conversation list, settings, notices).
* `pc.json` — LunaAI PC strings (permission levels, approval dialog, audit log, tasks, privacy).

Sharing the directory keeps terminology identical across products ("permission level", "emergency
stop", "audit log" are the same words in both), while each product ships only its own namespace.
LunaAI PC copies `common.json` and `pc.json` next to the executable; the web bundle imports
`common.json` and `web.json` at build time.

## Key rules

* Keys are namespaced and stable: `settings.language.label`, `chat.tool.used`, `pc.approval.title`.
* Interpolation uses named placeholders (`{name}`, `{count}`), never string concatenation, so
  translators control word order.
* English is the fallback for any missing key; if a key is missing everywhere the key itself is shown
  so the gap is obvious during development.
* Keys must exist in every locale. `tests/separation.test.mjs` compares each locale against `en` and
  fails the build on a missing key; `apps/web/frontend/tests/i18n.test.ts` additionally asserts that no
  value is empty and that the English key set matches for Japanese and Persian.

## Layout direction

* Persian is right-to-left, English and Japanese are left-to-right.
* The web client sets `<html lang dir>` from the selected locale and uses CSS logical properties
  (`margin-inline-start`, `border-inline-end`) so no layout is mirrored by hand.
* The desktop application sets `Window.FlowDirection` from the same rule.
* Mixed-direction content (code, paths, URLs, commands) keeps its own direction through logical
  properties and left-to-right block containers rather than manual string reordering.

## Language selection

* The web client detects the initial locale from the browser (`navigator.languages`), falls back to
  English, persists the choice locally and stores it with the account (`/api/settings`).
* The desktop application stores the interface language in `settings.json`. Interface language and
  conversation language are separate settings: the UI can be Persian while the conversation is
  Japanese.

## Adding a language

1. Create `locales/<code>/` with the three namespaces, copied from `en`.
2. Add the code to `LOCALES` in `apps/web/frontend/src/i18n.ts` and to `SupportedLanguages` in
   `apps/pc/src/LunaAI.PC.App/Ui/Localization.cs`.
3. Add the validation enum in `apps/web/backend/src/routes/settings.js`.
4. Run the repository guard tests and both product test suites.
