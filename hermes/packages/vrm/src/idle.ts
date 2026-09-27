import * as THREE from 'three';

/**
 * Procedural idle animation.
 *
 * Deliberately not a baked clip: it is layered noise + oscillators so the
 * character never loops visibly. It drives an abstract `IdleTarget` so the
 * same animator runs against a real VRM humanoid or the fallback rig used
 * before the user imports a model.
 *
 * Layers
 *  1. breathing   — slow chest/spine scale+rotation, ~14 breaths/min
 *  2. sway        — hips/spine drift on two incommensurable sine pairs
 *  3. head        — delayed follow of the body sway + micro-noise
 *  4. eye saccade — gaze jumps to a new target every 0.8–3.2 s, eased
 *  5. blink       — stochastic, with occasional double-blinks
 *  6. arms        — tiny shoulder/upper-arm breathing counter-motion
 */

export type IdleBone =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'upperChest'
  | 'neck'
  | 'head'
  | 'leftEye'
  | 'rightEye'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftUpperArm'
  | 'rightUpperArm';

export interface IdleTarget {
  /** Return the node for a humanoid bone, or null if the model lacks it. */
  getBone(bone: IdleBone): THREE.Object3D | null;
  /** Set an expression/blendshape weight in 0..1. No-op if unsupported. */
  setExpression(name: string, weight: number): void;
  /** True when the model exposes real eye bones (vs. blendshape-only gaze). */
  hasEyeBones(): boolean;
}

export interface IdleConfig {
  /** Breaths per minute. */
  breathRate: number;
  breathDepth: number;
  swayAmount: number;
  headFollow: number;
  blinkEnabled: boolean;
  /** Mean seconds between blinks. */
  blinkInterval: number;
  saccadeEnabled: boolean;
  gazeRange: number;
  /** Global multiplier — 0 disables all idle motion. */
  intensity: number;
}

export const DEFAULT_IDLE_CONFIG: IdleConfig = {
  breathRate: 14,
  breathDepth: 1,
  swayAmount: 1,
  headFollow: 1,
  blinkEnabled: true,
  blinkInterval: 4.2,
  saccadeEnabled: true,
  gazeRange: 0.22,
  intensity: 1,
};

/** Deterministic PRNG so tests can assert exact motion. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface BoneRest {
  quaternion: THREE.Quaternion;
  position: THREE.Vector3;
  scale: THREE.Vector3;
}

export class IdleAnimator {
  private readonly rest = new Map<IdleBone, BoneRest>();
  private readonly euler = new THREE.Euler();
  private readonly quat = new THREE.Quaternion();
  private readonly rand: () => number;

  private time = 0;

  // blink state
  private blinkTimer = 1.5;
  private blinkPhase = 0; // 0 = open, runs 0..1 while blinking
  private blinking = false;
  private pendingDoubleBlink = false;
  private blinkWeight = 0;

  // gaze state
  private gazeTimer = 0.7;
  private gazeFrom = new THREE.Vector2();
  private gazeTo = new THREE.Vector2();
  private gazeT = 1;
  private gazeDuration = 0.14;
  private gaze = new THREE.Vector2();

  // emotion overlay
  private emotion: string | null = null;
  private emotionWeight = 0;
  private emotionTarget = 0;

  /** Extra head/eye aim from the host app (e.g. look at the cursor). */
  public lookAt = new THREE.Vector2(0, 0);

  constructor(
    private target: IdleTarget,
    public config: IdleConfig = { ...DEFAULT_IDLE_CONFIG },
    seed = 1337,
  ) {
    this.rand = mulberry32(seed);
    this.captureRest();
  }

  /** Re-read rest pose. Call after swapping the model. */
  setTarget(target: IdleTarget): void {
    this.target = target;
    this.rest.clear();
    this.captureRest();
  }

  private captureRest(): void {
    const bones: IdleBone[] = [
      'hips',
      'spine',
      'chest',
      'upperChest',
      'neck',
      'head',
      'leftEye',
      'rightEye',
      'leftShoulder',
      'rightShoulder',
      'leftUpperArm',
      'rightUpperArm',
    ];
    for (const bone of bones) {
      const node = this.target.getBone(bone);
      if (!node) continue;
      this.rest.set(bone, {
        quaternion: node.quaternion.clone(),
        position: node.position.clone(),
        scale: node.scale.clone(),
      });
    }
  }

  /** Blend towards an emotion expression; pass null to fade back to neutral. */
  setEmotion(name: string | null, weight = 0.8): void {
    if (this.emotion && this.emotion !== name) this.target.setExpression(this.emotion, 0);
    this.emotion = name;
    this.emotionTarget = name ? weight : 0;
  }

  /** Force a blink now (used when the character "wakes up" or reacts). */
  triggerBlink(double = false): void {
    this.blinking = true;
    this.blinkPhase = 0;
    this.pendingDoubleBlink = double;
  }

  get currentBlinkWeight(): number {
    return this.blinkWeight;
  }

  get currentGaze(): THREE.Vector2 {
    return this.gaze;
  }

  /**
   * Advance the animation. `dt` in seconds.
   * Pure function of (time, rng state) — no reliance on wall clock.
   */
  update(dt: number): void {
    const clamped = Math.min(dt, 0.1); // guard against tab-restore spikes
    this.time += clamped;
    const k = this.config.intensity;
    if (k <= 0) return;

    const t = this.time;

    // ---- 1. Breathing ----------------------------------------------------
    const breathHz = this.config.breathRate / 60;
    const breath = Math.sin(t * breathHz * Math.PI * 2);
    const breathAmp = 0.018 * this.config.breathDepth * k;

    this.rotateFromRest('chest', 0, 0, 0, breath * breathAmp * 0.8);
    this.rotateFromRest('spine', breath * breathAmp * 0.45, 0, 0);
    this.scaleFromRest('upperChest', 1 + breath * 0.012 * this.config.breathDepth * k);

    // ---- 2. Body sway ----------------------------------------------------
    const sway = 0.012 * this.config.swayAmount * k;
    const swayX = Math.sin(t * 0.37) * 0.6 + Math.sin(t * 0.91 + 1.1) * 0.4;
    const swayZ = Math.sin(t * 0.29 + 2.3) * 0.6 + Math.sin(t * 0.73) * 0.4;
    this.rotateFromRest('hips', swayX * sway * 0.5, swayZ * sway * 0.35, swayZ * sway);
    this.translateFromRest('hips', 0, breath * 0.004 * this.config.breathDepth * k, 0);

    // ---- 3. Head: lags the body, plus micro-noise ------------------------
    const lag = 0.35;
    const headX = Math.sin((t - lag) * 0.37) * 0.5 + Math.sin(t * 1.7 + 0.5) * 0.12;
    const headY = Math.sin((t - lag) * 0.23 + 1.7) * 0.6 + Math.sin(t * 2.1) * 0.1;
    const headAmp = 0.05 * this.config.headFollow * k;
    this.rotateFromRest(
      'head',
      headX * headAmp + this.lookAt.y * 0.25 - breath * 0.006,
      headY * headAmp + this.lookAt.x * 0.35,
      Math.sin(t * 0.31 + 0.9) * headAmp * 0.35,
    );
    this.rotateFromRest('neck', headX * headAmp * 0.4, headY * headAmp * 0.4, 0);

    // ---- 4. Arms ---------------------------------------------------------
    const armAmp = 0.02 * k;
    this.rotateFromRest('leftUpperArm', 0, 0, -breath * armAmp);
    this.rotateFromRest('rightUpperArm', 0, 0, breath * armAmp);
    this.rotateFromRest('leftShoulder', 0, 0, -breath * armAmp * 0.4);
    this.rotateFromRest('rightShoulder', 0, 0, breath * armAmp * 0.4);

    // ---- 5. Eye saccades -------------------------------------------------
    if (this.config.saccadeEnabled) {
      this.gazeTimer -= clamped;
      if (this.gazeTimer <= 0) {
        this.gazeFrom.copy(this.gaze);
        const r = this.config.gazeRange;
        this.gazeTo.set((this.rand() * 2 - 1) * r, (this.rand() * 2 - 1) * r * 0.6);
        this.gazeT = 0;
        this.gazeDuration = 0.06 + this.rand() * 0.08;
        this.gazeTimer = 0.8 + this.rand() * 2.4;
        // A saccade often coincides with a blink.
        if (this.rand() < 0.22) this.triggerBlink(this.rand() < 0.2);
      }
      if (this.gazeT < 1) {
        this.gazeT = Math.min(1, this.gazeT + clamped / this.gazeDuration);
        const e = easeOutCubic(this.gazeT);
        this.gaze.set(
          this.gazeFrom.x + (this.gazeTo.x - this.gazeFrom.x) * e,
          this.gazeFrom.y + (this.gazeTo.y - this.gazeFrom.y) * e,
        );
      }
      const gazeX = this.gaze.x + this.lookAt.x * 0.4;
      const gazeY = this.gaze.y + this.lookAt.y * 0.3;
      if (this.target.hasEyeBones()) {
        this.rotateFromRest('leftEye', -gazeY, gazeX, 0);
        this.rotateFromRest('rightEye', -gazeY, gazeX, 0);
      } else {
        this.target.setExpression('lookLeft', Math.max(0, -gazeX) * 3);
        this.target.setExpression('lookRight', Math.max(0, gazeX) * 3);
        this.target.setExpression('lookUp', Math.max(0, gazeY) * 3);
        this.target.setExpression('lookDown', Math.max(0, -gazeY) * 3);
      }
    }

    // ---- 6. Blinking -----------------------------------------------------
    if (this.config.blinkEnabled) {
      if (!this.blinking) {
        this.blinkTimer -= clamped;
        if (this.blinkTimer <= 0) {
          this.triggerBlink(this.rand() < 0.15);
          this.blinkTimer = this.config.blinkInterval * (0.45 + this.rand() * 1.3);
        }
      } else {
        // 120 ms close, 90 ms open
        this.blinkPhase += clamped / 0.21;
        if (this.blinkPhase >= 1) {
          this.blinking = false;
          this.blinkPhase = 0;
          if (this.pendingDoubleBlink) {
            this.pendingDoubleBlink = false;
            this.blinking = true;
          }
        }
      }
      this.blinkWeight = this.blinking ? blinkCurve(this.blinkPhase) : 0;
      this.target.setExpression('blink', this.blinkWeight);
    }

    // ---- 7. Emotion cross-fade ------------------------------------------
    if (this.emotion) {
      const speed = 4 * clamped;
      this.emotionWeight += Math.sign(this.emotionTarget - this.emotionWeight) * Math.min(speed, Math.abs(this.emotionTarget - this.emotionWeight));
      this.target.setExpression(this.emotion, this.emotionWeight);
      if (this.emotionWeight <= 0.001 && this.emotionTarget === 0) this.emotion = null;
    }
  }

  private rotateFromRest(bone: IdleBone, x: number, y: number, z = 0, extraZ = 0): void {
    const node = this.target.getBone(bone);
    const rest = this.rest.get(bone);
    if (!node || !rest) return;
    this.euler.set(x, y, z + extraZ, 'XYZ');
    this.quat.setFromEuler(this.euler);
    node.quaternion.copy(rest.quaternion).multiply(this.quat);
  }

  private translateFromRest(bone: IdleBone, x: number, y: number, z: number): void {
    const node = this.target.getBone(bone);
    const rest = this.rest.get(bone);
    if (!node || !rest) return;
    node.position.set(rest.position.x + x, rest.position.y + y, rest.position.z + z);
  }

  private scaleFromRest(bone: IdleBone, factor: number): void {
    const node = this.target.getBone(bone);
    const rest = this.rest.get(bone);
    if (!node || !rest) return;
    node.scale.set(rest.scale.x * factor, rest.scale.y, rest.scale.z * factor);
  }
}

/** Fast close, slower open — matches real eyelid dynamics. */
export function blinkCurve(phase: number): number {
  if (phase <= 0 || phase >= 1) return 0;
  return phase < 0.42 ? easeOutCubic(phase / 0.42) : easeInOutSine(1 - (phase - 0.42) / 0.58);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}
