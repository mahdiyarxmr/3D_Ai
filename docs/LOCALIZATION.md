# Localization

HERMES must support three first-class UI languages in MVP:

- English (`en`)
- Japanese (`ja`)
- Persian/Farsi (`fa`)

## Requirements

- All UI strings must come from localization resources.
- Never hard-code visible UI text inside components.
- Runtime language switching without restarting the application where practical.
- Persist the user's selected language.
- Provide RTL layout for Persian.
- Provide LTR layout for English and Japanese.
- Persian UI must use an appropriate Persian-capable font.
- Japanese UI must use a Japanese-capable font.
- Dates, numbers, and formatting should respect locale.
- Accessibility labels must also be localized.

## Suggested structure

locales/
  en/
    common.json
    settings.json
    permissions.json
    voice.json
  ja/
    common.json
    settings.json
    permissions.json
    voice.json
  fa/
    common.json
    settings.json
    permissions.json
    voice.json

## Language selector

The settings UI should expose:

English
日本語
فارسی

The current language should also be accessible from the tray/menu.

## Agent language behavior

The user interface language and conversation language are separate settings.

Example:
- UI: Persian
- Conversation: Japanese

The agent should follow the conversation language requested by the user while keeping the application UI in the selected UI language.

## Voice language

Voice profiles should declare supported synthesis languages.

A character can have:
- English voice
- Japanese voice
- Persian voice

The agent can select the correct voice/language for the current response.

## Persian

Persian must use RTL layout where appropriate. Mixed LTR content such as code, paths, URLs, usernames, and commands must remain correctly readable.

## Japanese

Japanese UI must not be treated as Chinese. Use Japanese locale conventions and fonts.

## English

English is the fallback locale if a translation key is missing.
