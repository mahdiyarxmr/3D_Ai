import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  DEFAULT_IDLE_CONFIG,
  IdleAnimator,
  VRM_MAX_BYTES,
  VisemeScheduler,
  blinkCurve,
  mulberry32,
  validateVrm,
  visemesFromText,
  type IdleBone,
  type IdleTarget,
} from '@hermes/vrm';

/* ------------------------------ fixtures ------------------------------ */

function buildGlb(json: unknown, { magic = 0x46546c67, version = 2, chunkType = 0x4e4f534a } = {}): ArrayBuffer {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const padded = new Uint8Array(Math.ceil(jsonBytes.length / 4) * 4).fill(0x20); // spec: space padding
  padded.set(jsonBytes);

  const buffer = new ArrayBuffer(20 + padded.length);
  const view = new DataView(buffer);
  view.setUint32(0, magic, true);
  view.setUint32(4, version, true);
  view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, padded.length, true);
  view.setUint32(16, chunkType, true);
  new Uint8Array(buffer, 20).set(padded);
  return buffer;
}

const VRM1 = { asset: { version: '2.0' }, extensionsUsed: ['VRMC_vrm'], extensions: { VRMC_vrm: { meta: { name: 'Sakura', authors: ['Ada'], licenseUrl: 'https://example.test' } } } };
const VRM0 = { asset: { version: '2.0' }, extensions: { VRM: { meta: { title: 'Legacy', author: 'Bob', licenseName: 'CC0' } } } };

/* ----------------------------- validation ----------------------------- */

describe('VRM validation', () => {
  it('accepts a VRM 1.0 container and reads its metadata', () => {
    const result = validateVrm(buildGlb(VRM1));
    expect(result).toMatchObject({ ok: true, specVersion: '1.0' });
    expect(result.meta).toMatchObject({ name: 'Sakura', author: 'Ada' });
  });

  it('accepts a VRM 0.x container', () => {
    const result = validateVrm(buildGlb(VRM0));
    expect(result).toMatchObject({ ok: true, specVersion: '0.x' });
    expect(result.meta?.name).toBe('Legacy');
  });

  it('rejects a plain glTF with no VRM extension', () => {
    expect(validateVrm(buildGlb({ asset: { version: '2.0' } }))).toMatchObject({ ok: false, error: 'not_vrm' });
  });

  it('rejects a file that is not a GLB at all', () => {
    const text = new TextEncoder().encode('this is definitely not a model file at all');
    expect(validateVrm(text.buffer as ArrayBuffer)).toMatchObject({ ok: false, error: 'not_glb' });
  });

  it('rejects an empty or truncated file', () => {
    expect(validateVrm(new ArrayBuffer(8))).toMatchObject({ ok: false, error: 'too_small' });
  });

  it('rejects an unsupported glTF version', () => {
    expect(validateVrm(buildGlb(VRM1, { version: 3 }))).toMatchObject({ ok: false, error: 'unsupported_version' });
  });

  it('rejects a header that lies about its length', () => {
    const buffer = buildGlb(VRM1);
    new DataView(buffer).setUint32(8, 10_000_000, true);
    expect(validateVrm(buffer)).toMatchObject({ ok: false, error: 'length_mismatch' });
  });

  it('rejects a missing JSON chunk', () => {
    expect(validateVrm(buildGlb(VRM1, { chunkType: 0x004e4942 }))).toMatchObject({ ok: false, error: 'no_json_chunk' });
  });

  it('rejects malformed JSON without throwing', () => {
    const bad = new TextEncoder().encode('{not json');
    const buffer = new ArrayBuffer(20 + bad.length);
    const view = new DataView(buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, buffer.byteLength, true);
    view.setUint32(12, bad.length, true);
    view.setUint32(16, 0x4e4f534a, true);
    new Uint8Array(buffer, 20).set(bad);
    expect(validateVrm(buffer)).toMatchObject({ ok: false, error: 'bad_json' });
  });

  it('enforces a size ceiling so a huge upload cannot exhaust memory', () => {
    expect(VRM_MAX_BYTES).toBe(200 * 1024 * 1024);
  });

  it('never throws, whatever the input', () => {
    const fuzz = new Uint8Array(256);
    for (let seed = 0; seed < 40; seed++) {
      const rand = mulberry32(seed);
      for (let i = 0; i < fuzz.length; i++) fuzz[i] = Math.floor(rand() * 256);
      expect(() => validateVrm(fuzz.buffer.slice(0) as ArrayBuffer)).not.toThrow();
    }
  });
});

/* --------------------------- idle animation --------------------------- */

class TestRig implements IdleTarget {
  readonly bones = new Map<IdleBone, THREE.Object3D>();
  readonly expressions = new Map<string, number>();

  constructor(private readonly eyes = true) {
    const names: IdleBone[] = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftEye', 'rightEye', 'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm'];
    for (const name of names) {
      const node = new THREE.Object3D();
      node.position.set(0, 1, 0);
      this.bones.set(name, node);
    }
  }

  getBone(bone: IdleBone): THREE.Object3D | null {
    return this.bones.get(bone) ?? null;
  }

  hasEyeBones(): boolean {
    return this.eyes;
  }

  setExpression(name: string, weight: number): void {
    this.expressions.set(name, weight);
  }
}

function run(animator: IdleAnimator, seconds: number, dt = 1 / 60): void {
  for (let t = 0; t < seconds; t += dt) animator.update(dt);
}

describe('idle animation', () => {
  it('actually moves the skeleton — it is not a static pose', () => {
    const rig = new TestRig();
    const animator = new IdleAnimator(rig, { ...DEFAULT_IDLE_CONFIG }, 42);
    const head = rig.getBone('head')!;
    const before = head.quaternion.clone();

    run(animator, 1.0);
    expect(head.quaternion.angleTo(before)).toBeGreaterThan(0.001);
  });

  it('breathes: the chest oscillates rather than drifting', () => {
    const rig = new TestRig();
    const animator = new IdleAnimator(rig, { ...DEFAULT_IDLE_CONFIG }, 7);
    const chest = rig.getBone('chest')!;
    const samples: number[] = [];
    for (let i = 0; i < 400; i++) {
      animator.update(1 / 60);
      samples.push(new THREE.Euler().setFromQuaternion(chest.quaternion).z);
    }
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    expect(max - min).toBeGreaterThan(0.005);
    // Oscillation, not drift: the last sample is near the middle of the range.
    expect(Math.abs(samples.at(-1)!)).toBeLessThan(max - min);
  });

  it('blinks periodically, and the eyes fully reopen', () => {
    const rig = new TestRig();
    const animator = new IdleAnimator(rig, { ...DEFAULT_IDLE_CONFIG }, 3);
    let blinks = 0;
    let wasClosed = false;
    let maxWeight = 0;

    for (let i = 0; i < 60 * 30; i++) {
      animator.update(1 / 60);
      const weight = rig.expressions.get('blink') ?? 0;
      maxWeight = Math.max(maxWeight, weight);
      if (weight > 0.5 && !wasClosed) {
        blinks += 1;
        wasClosed = true;
      }
      if (weight < 0.05) wasClosed = false;
    }

    expect(blinks).toBeGreaterThan(2);
    expect(maxWeight).toBeGreaterThan(0.85);
    expect(rig.expressions.get('blink')).toBeLessThan(1);
  });

  it('moves the eyes in discrete saccades within the configured range', () => {
    const rig = new TestRig();
    const animator = new IdleAnimator(rig, { ...DEFAULT_IDLE_CONFIG, gazeRange: 0.2 }, 11);
    const positions = new Set<string>();
    for (let i = 0; i < 60 * 20; i++) {
      animator.update(1 / 60);
      positions.add(animator.currentGaze.x.toFixed(2));
      expect(Math.abs(animator.currentGaze.x)).toBeLessThanOrEqual(0.21);
    }
    expect(positions.size).toBeGreaterThan(3);
  });

  it('is deterministic for a given seed', () => {
    const a = new IdleAnimator(new TestRig(), { ...DEFAULT_IDLE_CONFIG }, 99);
    const b = new IdleAnimator(new TestRig(), { ...DEFAULT_IDLE_CONFIG }, 99);
    run(a, 5);
    run(b, 5);
    expect(a.currentGaze.x).toBeCloseTo(b.currentGaze.x, 10);
    expect(a.currentBlinkWeight).toBeCloseTo(b.currentBlinkWeight, 10);
  });

  it('stops all motion at intensity 0', () => {
    const rig = new TestRig();
    const animator = new IdleAnimator(rig, { ...DEFAULT_IDLE_CONFIG, intensity: 0 }, 5);
    const head = rig.getBone('head')!;
    const before = head.quaternion.clone();
    run(animator, 3);
    expect(head.quaternion.angleTo(before)).toBe(0);
  });

  it('survives a huge delta without teleporting the model', () => {
    const rig = new TestRig();
    const animator = new IdleAnimator(rig, { ...DEFAULT_IDLE_CONFIG }, 5);
    animator.update(120); // e.g. laptop resumed from sleep
    const head = rig.getBone('head')!;
    expect(Number.isFinite(head.quaternion.x)).toBe(true);
    expect(head.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(0.5);
  });

  it('falls back to look-direction blendshapes when there are no eye bones', () => {
    const rig = new TestRig(false);
    const animator = new IdleAnimator(rig, { ...DEFAULT_IDLE_CONFIG }, 5);
    run(animator, 4);
    const used = ['lookLeft', 'lookRight', 'lookUp', 'lookDown'].filter((k) => rig.expressions.has(k));
    expect(used.length).toBeGreaterThan(0);
  });

  it('cross-fades an emotion in and back out', () => {
    const rig = new TestRig();
    const animator = new IdleAnimator(rig, { ...DEFAULT_IDLE_CONFIG }, 5);
    animator.setEmotion('happy', 0.9);
    run(animator, 1);
    expect(rig.expressions.get('happy')).toBeGreaterThan(0.5);
    animator.setEmotion(null);
    run(animator, 1);
    expect(rig.expressions.get('happy')).toBeLessThan(0.05);
  });

  it('re-captures the rest pose when the model is swapped', () => {
    const first = new TestRig();
    const animator = new IdleAnimator(first, { ...DEFAULT_IDLE_CONFIG }, 5);
    run(animator, 2);
    const second = new TestRig();
    second.getBone('head')!.quaternion.setFromEuler(new THREE.Euler(0.4, 0, 0));
    animator.setTarget(second);
    animator.update(1 / 60);
    // Motion is applied relative to the new rest pose, not the old one.
    const euler = new THREE.Euler().setFromQuaternion(second.getBone('head')!.quaternion);
    expect(euler.x).toBeGreaterThan(0.3);
  });

  it('blink curve closes fast and opens slower', () => {
    expect(blinkCurve(0)).toBe(0);
    expect(blinkCurve(1)).toBe(0);
    expect(blinkCurve(0.42)).toBeCloseTo(1, 1);
    expect(blinkCurve(0.2)).toBeGreaterThan(blinkCurve(0.8));
  });
});

/* -------------------------------- lipsync ------------------------------ */

describe('lip sync', () => {
  it('produces vowel visemes ordered in time', () => {
    const frames = visemesFromText('hello there', 1000);
    expect(frames.length).toBeGreaterThan(2);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]!.tMs).toBeGreaterThanOrEqual(frames[i - 1]!.tMs);
    }
    expect(frames.some((f) => f.viseme === 'ee')).toBe(true);
    expect(frames.at(-1)).toMatchObject({ viseme: 'sil', weight: 0 });
  });

  it('handles Japanese kana and Persian letters', () => {
    // こ=oh, ん=sil, に=ih, ち=ih, は=aa — syllabic, not consonant-by-consonant.
    const ja = visemesFromText('こんにちは', 800);
    expect(ja.some((f) => f.viseme === 'oh')).toBe(true);
    expect(ja.some((f) => f.viseme === 'ih')).toBe(true);
    expect(ja.some((f) => f.viseme === 'aa')).toBe(true);
    expect(visemesFromText('سلام دنیا', 800).some((f) => f.viseme === 'aa')).toBe(true);
  });

  it('returns nothing for empty text', () => {
    expect(visemesFromText('', 500)).toEqual([]);
  });

  it('schedules frames against a clock and reports completion', () => {
    const scheduler = new VisemeScheduler(visemesFromText('aeiou', 500));
    scheduler.start(0);
    expect(scheduler.sample(0)).not.toBeNull();
    scheduler.sample(600);
    expect(scheduler.finished).toBe(true);
  });
});
