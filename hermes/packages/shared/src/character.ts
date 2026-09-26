import { z } from 'zod';

/**
 * Character + voice schema.
 *
 * Every parameter below is documented with its *mechanical* effect. If a
 * parameter has no defined effect it does not belong in this file — see
 * docs/CHARACTER.md for the policy against meaningless sliders.
 */

/** A normalised 0..1 parameter. */
const unit = z.number().min(0).max(1);

export const SupportedLanguageSchema = z.enum(['en', 'ja', 'fa']);
export type SupportedLanguage = z.infer<typeof SupportedLanguageSchema>;

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['en', 'ja', 'fa'];

/** Languages that render right-to-left. */
export const RTL_LANGUAGES: ReadonlySet<SupportedLanguage> = new Set<SupportedLanguage>(['fa']);

export function directionFor(language: SupportedLanguage): 'ltr' | 'rtl' {
  return RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr';
}

/**
 * Personality traits.
 *
 * These are NOT decorative. They are consumed in exactly two places:
 *  1. `buildPersonaPrompt()` turns them into explicit natural-language
 *     style directives appended to the agent system prompt.
 *  2. `deriveExpressionBias()` biases which VRM expression is chosen for a
 *     given emotion (e.g. a high-`playful` character smiles wider on `happy`).
 */
export const PersonalitySchema = z.object({
  /** Higher -> softer wording, more diminutives, more filler warmth. */
  cute: unit.default(0.5),
  /** Higher -> more jokes/teasing, wider smile expressions, faster gestures. */
  playful: unit.default(0.5),
  /** Higher -> more declarative statements, fewer hedges ("maybe", "I think"). */
  confident: unit.default(0.5),
  /** Higher -> longer, more explanatory answers; lower -> terse answers. */
  verbose: unit.default(0.4),
  /** Higher -> more empathetic acknowledgement before answering. */
  warmth: unit.default(0.6),
  /** Higher -> more proactive tool suggestions; lower -> waits to be asked. */
  initiative: unit.default(0.4),
});
export type Personality = z.infer<typeof PersonalitySchema>;

/**
 * Voice parameters.
 *
 * The voice service maps these onto whatever the active TTS provider supports
 * (see services/voice/providers/base.py -> `VoiceProvider.capabilities()`).
 * Parameters a provider cannot honour are reported back as `unsupported` so the
 * UI can grey them out instead of pretending they did something.
 */
export const VoiceParamsSchema = z.object({
  /** Provider voice id, e.g. "voice_03". Resolved by the voice service. */
  baseVoice: z.string().min(1).default('voice_01'),
  /** Presentation hint used to pick a default base voice. */
  gender: z.enum(['feminine', 'masculine', 'neutral']).default('neutral'),

  /** Fundamental frequency shift. 0.5 = provider default, 1.0 = +1 octave-ish. */
  pitch: unit.default(0.5),
  /** Speaking rate multiplier, 0.5..2.0 (NOT unit-normalised). */
  speed: z.number().min(0.5).max(2).default(1),
  /** Loudness + dynamic range. Higher -> more emphatic peaks. */
  energy: unit.default(0.5),
  /** Breathiness / attack softness. Higher -> gentler consonant onsets. */
  softness: unit.default(0.5),
  /** Timbre warmth (low-mid emphasis). Higher -> rounder, less sibilant. */
  warmth: unit.default(0.5),
  /** Formant shift downward. Higher -> larger apparent vocal tract. */
  deepness: unit.default(0.3),
  /** Apparent age. Low -> youthful, high -> mature. Shifts formants + pacing. */
  maturity: unit.default(0.5),
  /** Composite: raises pitch, shortens phrase length, adds rising intonation. */
  cuteness: unit.default(0.5),
  /** Prosody range. Low -> monotone, high -> animated pitch contour. */
  expressiveness: unit.default(0.6),
  /** Japanese phonetic/prosodic influence when speaking non-Japanese. */
  japaneseInfluence: unit.default(0),
  /** Anime-style delivery: exaggerated emotion, sharper attack, higher head voice. */
  animeStyle: unit.default(0),
});
export type VoiceParams = z.infer<typeof VoiceParamsSchema>;

/** Emotions the agent may request; drives both TTS delivery and VRM expression. */
export const EmotionSchema = z.enum([
  'neutral',
  'happy',
  'sad',
  'angry',
  'surprised',
  'relaxed',
  'thinking',
]);
export type Emotion = z.infer<typeof EmotionSchema>;

export const CharacterSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, 'id must be lowercase slug'),
  name: z.string().min(1).max(64),
  /** Path relative to the storage root. Never an absolute path from the UI. */
  vrm: z.string().min(1),
  personality: PersonalitySchema.default({}),
  voice: VoiceParamsSchema.default({}),
  languages: z.array(SupportedLanguageSchema).min(1).default(['en']),
  defaultLanguage: SupportedLanguageSchema.default('en'),
  /** Avatar transform in companion mode. */
  transform: z
    .object({
      scale: z.number().min(0.2).max(4).default(1),
      offsetX: z.number().default(0),
      offsetY: z.number().default(0),
    })
    .default({}),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type Character = z.infer<typeof CharacterSchema>;

export function defaultCharacter(overrides: Partial<Character> = {}): Character {
  return CharacterSchema.parse({
    id: 'default',
    name: 'HERMES',
    vrm: '',
    languages: ['en', 'ja', 'fa'],
    defaultLanguage: 'en',
    ...overrides,
  });
}

/**
 * Turn personality into explicit style directives for the LLM system prompt.
 * Deterministic and testable — this is the contract that makes the sliders real.
 */
export function buildPersonaPrompt(character: Character, conversationLanguage: SupportedLanguage): string {
  const p = character.personality;
  const lines: string[] = [];
  lines.push(`You are ${character.name}, a desktop companion.`);
  lines.push(`Reply in ${languageName(conversationLanguage)} unless the user switches language.`);

  if (p.cute >= 0.66) lines.push('Tone: soft and endearing. Use gentle phrasing and light affectionate markers.');
  else if (p.cute <= 0.33) lines.push('Tone: plain and matter-of-fact. Avoid cutesy phrasing.');

  if (p.playful >= 0.66) lines.push('Be playful; light humour and teasing are welcome.');
  else if (p.playful <= 0.33) lines.push('Stay serious; avoid jokes.');

  if (p.confident >= 0.66) lines.push('State conclusions directly. Avoid hedging language.');
  else if (p.confident <= 0.33) lines.push('Be tentative; flag uncertainty explicitly.');

  lines.push(
    p.verbose >= 0.66
      ? 'Explain your reasoning in full paragraphs.'
      : p.verbose <= 0.33
        ? 'Answer in one or two short sentences.'
        : 'Keep answers moderately concise.',
  );

  if (p.warmth >= 0.66) lines.push("Acknowledge the user's feelings before answering.");
  if (p.initiative >= 0.66) lines.push('Proactively suggest the next useful action or tool.');
  else if (p.initiative <= 0.33) lines.push('Do not suggest actions unless asked.');

  return lines.join('\n');
}

/** Bias applied to VRM expression weights, derived from personality. */
export function deriveExpressionBias(personality: Personality, emotion: Emotion): number {
  const base = 0.6;
  switch (emotion) {
    case 'happy':
      return clamp01(base + personality.playful * 0.4);
    case 'sad':
      return clamp01(base - personality.confident * 0.2);
    case 'angry':
      return clamp01(base * (1 - personality.cute * 0.5));
    case 'surprised':
      return clamp01(base + personality.playful * 0.25);
    case 'relaxed':
      return clamp01(base + personality.warmth * 0.2);
    default:
      return base;
  }
}

export function languageName(language: SupportedLanguage): string {
  switch (language) {
    case 'en':
      return 'English';
    case 'ja':
      return 'Japanese';
    case 'fa':
      return 'Persian';
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
