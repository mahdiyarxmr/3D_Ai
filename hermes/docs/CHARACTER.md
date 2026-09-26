# Character profiles

A character binds a VRM model to a personality, a voice and a set of
languages. The schema is `packages/shared/src/character.ts`; it is zod-
validated on every read and write, so a corrupt file cannot crash the app.

```jsonc
{
  "id": "sakura",                       // lowercase slug, used as the folder name
  "name": "Sakura",
  "vrm": "characters/sakura/character.vrm",  // always relative to the storage root
  "personality": {
    "cute": 0.82, "playful": 0.76, "confident": 0.35,
    "verbose": 0.4, "warmth": 0.6, "initiative": 0.4
  },
  "voice": {
    "baseVoice": "voice_03", "gender": "feminine",
    "pitch": 0.62, "speed": 1.02, "energy": 0.71, "softness": 0.74,
    "warmth": 0.68, "deepness": 0.12, "maturity": 0.18, "cuteness": 0.82,
    "expressiveness": 0.7, "japaneseInfluence": 0.68, "animeStyle": 0.76
  },
  "languages": ["en", "ja", "fa"],
  "defaultLanguage": "en",
  "transform": { "scale": 1, "offsetX": 0, "offsetY": 0 }
}
```

Characters are independent of the application UI language.

## No meaningless sliders

Every parameter below has a defined, implemented effect. If a parameter cannot
be given one, it does not belong in the schema.

### Personality

Consumed in exactly two places: `buildPersonaPrompt()`, which converts traits
into explicit style directives appended to the system prompt, and
`deriveExpressionBias()`, which biases VRM expression weights.

| Trait        | Effect                                                                    |
| ------------ | ------------------------------------------------------------------------- |
| `cute`       | ≥0.66 → soft, endearing phrasing. ≤0.33 → plain and matter-of-fact.        |
| `playful`    | ≥0.66 → humour and teasing allowed; widens the smile on `happy`.           |
| `confident`  | ≥0.66 → direct statements, no hedging. ≤0.33 → explicit uncertainty.       |
| `verbose`    | Short answers ↔ full explanatory paragraphs.                              |
| `warmth`     | ≥0.66 → acknowledges the user's feelings before answering.                 |
| `initiative` | ≥0.66 → proactively suggests the next action. ≤0.33 → never suggests.      |

### Voice

Primitives map straight onto provider controls. Composites resolve into
primitives through `derive_composites()` in
`services/voice/providers/base.py`, which is unit-tested parameter by
parameter.

| Parameter           | Kind      | Effect                                                       |
| ------------------- | --------- | ------------------------------------------------------------ |
| `baseVoice`         | selector  | Provider voice id                                             |
| `gender`            | selector  | Presentation hint used to pick a default base voice           |
| `pitch`             | primitive | Fundamental frequency                                         |
| `speed`             | primitive | Rate multiplier, 0.5–2.0 (not unit-normalised)                |
| `energy`            | primitive | Gain and emphasis on stressed syllables                       |
| `softness`          | primitive | Breathiness ↑, consonant attack ↓                             |
| `warmth`            | primitive | Low-mid gain; less sibilance                                  |
| `deepness`          | primitive | Formant shift downward                                        |
| `expressiveness`    | primitive | Prosody range: monotone ↔ animated                            |
| `cuteness`          | composite | pitch ↑, rate ↑, formants ↑, prosody ↑                        |
| `maturity`          | composite | pitch ↓, formants ↓, prosody ↓ (opposes cuteness)             |
| `animeStyle`        | composite | prosody range ↑, attack ↑                                     |
| `japaneseInfluence` | composite | mora-timed rhythm applied to non-Japanese output              |

A provider that cannot honour a parameter reports it in
`SynthesiseResponse.unsupportedParams`, and the UI disables that slider with a
"not supported by this provider" hint rather than letting it do nothing.

## Storage

```
storage/characters/<id>/character.vrm    desktop
IndexedDB "hermes-assets" → key <id>     browser dev runtime
```

The character record itself lives in SQLite (desktop) or localStorage
(browser). `id` is re-sanitised natively before being used as a path segment.
