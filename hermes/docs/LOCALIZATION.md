# Localization

> **Moved.** This file described the original requirement. The implemented
> convention — chosen, documented and enforced by tests — now lives in
> [**I18N.md**](I18N.md).
>
> The one thing that changed from this document's "suggested structure": it is
> no longer a suggestion. `locales/<lang>/{common,settings,voice,permissions}.json`
> is the only supported layout, and `tests/locales.test.ts` fails the build if
> a language deviates from it.

The original requirements, all of which still hold and are all now met:

| Requirement                                      | State |
| ------------------------------------------------ | ----- |
| English, Japanese, Persian as first-class UI languages | ✅ |
| All UI strings come from resources, none hard-coded    | ✅ |
| Runtime switching without restart                      | ✅ |
| Selected language persists                             | ✅ |
| RTL for Persian, LTR for English and Japanese          | ✅ |
| Persian- and Japanese-capable fonts                    | ✅ Vazirmatn / Noto Sans JP, via `html[data-lang]` |
| Locale-aware dates and numbers                         | ✅ `Intl` |
| Localized accessibility labels                         | ✅ |
| English fallback for missing keys                      | ✅ then the key itself, so gaps are visible |

See [I18N.md](I18N.md) for the key format, interpolation rules, the `<Bidi>`
component, and how to add a language.
