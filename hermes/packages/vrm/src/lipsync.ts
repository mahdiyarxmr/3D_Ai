/**
 * Lip sync.
 *
 * Two modes:
 *  1. `AudioEnvelopeLipSync` — real-time RMS from a WebAudio AnalyserNode,
 *     mapped onto a mouth-open weight. Provider-agnostic: it works with any
 *     TTS that produces audio.
 *  2. `visemesFromText` — a lightweight text->viseme schedule used when the
 *     TTS provider returns timing marks, or for the mock provider.
 */

export type Viseme = 'aa' | 'ih' | 'ou' | 'ee' | 'oh' | 'sil';

export interface VisemeFrame {
  viseme: Viseme;
  /** Milliseconds from utterance start. */
  tMs: number;
  weight: number;
}

const VOWEL_MAP: Record<string, Viseme> = {
  a: 'aa', á: 'aa', à: 'aa', ä: 'aa',
  i: 'ih', í: 'ih', ì: 'ih',
  u: 'ou', ú: 'ou', ù: 'ou', ü: 'ou',
  e: 'ee', é: 'ee', è: 'ee',
  o: 'oh', ó: 'oh', ò: 'oh', ö: 'oh',
  // Persian/Arabic-script vowel carriers.
  ا: 'aa', آ: 'aa', و: 'ou', ی: 'ih', ه: 'ee',
};

/**
 * Japanese kana are syllabic, so the mouth shape is the syllable's vowel
 * nucleus — `こ` (ko) is an "oh", not a consonant. Mapping by row gives
 * markedly better lip sync for Japanese than treating kana as consonants.
 */
const KANA_ROWS: Record<Viseme, string> = {
  aa: 'あかさたなはまやらわがざだばぱゃアカサタナハマヤラワガザダバパャ',
  ih: 'いきしちにひみりぎじぢびぴイキシチニヒミリギジヂビピ',
  ou: 'うくすつぬふむゆるぐずづぶぷゅウクスツヌフムユルグズヅブプュ',
  ee: 'えけせてねへめれげぜでべぺエケセテネヘメレゲゼデベペ',
  oh: 'おこそとのほもよろをごぞどぼぽょオコソトノホモヨロヲゴゾドボポョ',
  sil: 'んンっッー',
};

const KANA_MAP: Record<string, Viseme> = (() => {
  const out: Record<string, Viseme> = {};
  for (const [viseme, kana] of Object.entries(KANA_ROWS) as [Viseme, string][]) {
    for (const char of kana) out[char] = viseme;
  }
  return out;
})();

function visemeFor(char: string): Viseme | undefined {
  return KANA_MAP[char] ?? VOWEL_MAP[char.toLowerCase()];
}

/**
 * Build a viseme schedule from text. `msPerChar` should come from the TTS
 * provider's reported duration when available.
 */
export function visemesFromText(text: string, totalMs: number): VisemeFrame[] {
  const chars = [...text];
  if (chars.length === 0) return [];
  const step = totalMs / chars.length;
  const frames: VisemeFrame[] = [];
  let last: Viseme = 'sil';

  chars.forEach((char, index) => {
    const viseme = visemeFor(char);
    const tMs = Math.round(index * step);
    if (viseme && viseme !== 'sil') {
      frames.push({ viseme, tMs, weight: 0.55 + (viseme === 'aa' ? 0.3 : 0.1) });
      last = viseme;
    } else if (/\s|[.,!?;:،。！？]/.test(char)) {
      if (last !== 'sil') {
        frames.push({ viseme: 'sil', tMs, weight: 0 });
        last = 'sil';
      }
    } else if (last !== 'sil') {
      // Consonant: partially close the mouth without fully resetting.
      frames.push({ viseme: last, tMs, weight: 0.22 });
    }
  });

  frames.push({ viseme: 'sil', tMs: Math.round(totalMs), weight: 0 });
  return frames;
}

/** Real-time amplitude-driven mouth opening. */
export class AudioEnvelopeLipSync {
  private readonly data: Uint8Array<ArrayBuffer>;
  private smoothed = 0;

  constructor(
    private readonly analyser: AnalyserNode,
    private readonly options: { attack?: number; release?: number; gain?: number; floor?: number } = {},
  ) {
    analyser.fftSize = 1024;
    this.data = new Uint8Array(new ArrayBuffer(analyser.fftSize));
  }

  /** Returns a 0..1 mouth-open weight. Call once per animation frame. */
  sample(): number {
    this.analyser.getByteTimeDomainData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      const v = (this.data[i]! - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.data.length);
    const floor = this.options.floor ?? 0.015;
    const gain = this.options.gain ?? 4.2;
    const level = Math.max(0, Math.min(1, (rms - floor) * gain));
    const coeff = level > this.smoothed ? (this.options.attack ?? 0.55) : (this.options.release ?? 0.18);
    this.smoothed += (level - this.smoothed) * coeff;
    return this.smoothed;
  }
}

/** Plays a precomputed schedule against a wall clock. */
export class VisemeScheduler {
  private index = 0;
  private startedAt = 0;

  constructor(private frames: VisemeFrame[]) {}

  start(now = performance.now()): void {
    this.startedAt = now;
    this.index = 0;
  }

  /** Returns the frame active at `now`, or null when finished. */
  sample(now = performance.now()): VisemeFrame | null {
    const elapsed = now - this.startedAt;
    let current: VisemeFrame | null = null;
    while (this.index < this.frames.length && this.frames[this.index]!.tMs <= elapsed) {
      current = this.frames[this.index]!;
      this.index += 1;
    }
    if (this.index >= this.frames.length && !current) return null;
    return current;
  }

  get finished(): boolean {
    return this.index >= this.frames.length;
  }
}
