import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { FallbackRig } from './fallbackRig.js';
import { IdleAnimator, DEFAULT_IDLE_CONFIG, type IdleBone, type IdleConfig, type IdleTarget } from './idle.js';
import { validateVrm, type VrmValidationResult } from './validate.js';

/**
 * VrmStage — owns the WebGL canvas, the loaded model and the render loop.
 *
 * Transparent by default so the companion window can be borderless with the
 * desktop showing through.
 */

export interface StageOptions {
  canvas: HTMLCanvasElement;
  transparent?: boolean;
  /** Device pixel ratio cap; keeps the companion window cheap. */
  maxPixelRatio?: number;
  idle?: Partial<IdleConfig>;
}

/** Adapter mapping a loaded VRM onto the animator's abstract target. */
class VrmTarget implements IdleTarget {
  constructor(private readonly vrm: VRM) {}

  getBone(bone: IdleBone): THREE.Object3D | null {
    return this.vrm.humanoid?.getNormalizedBoneNode(bone as never) ?? null;
  }

  hasEyeBones(): boolean {
    return Boolean(this.vrm.humanoid?.getNormalizedBoneNode('leftEye' as never));
  }

  setExpression(name: string, weight: number): void {
    this.vrm.expressionManager?.setValue(name, Math.max(0, Math.min(1, weight)));
  }
}

export class VrmStage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock = new THREE.Clock();
  private readonly root = new THREE.Group();

  private fallback: FallbackRig | null = null;
  private vrm: VRM | null = null;
  private animator: IdleAnimator;
  private frame = 0;
  private running = false;
  private resizeObserver: ResizeObserver | null = null;
  private lipSyncWeight = 0;

  constructor(private readonly options: StageOptions) {
    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      alpha: options.transparent ?? true,
      antialias: true,
      premultipliedAlpha: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.maxPixelRatio ?? 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 40);
    this.camera.position.set(0, 1.32, 2.6);
    this.camera.lookAt(0, 1.24, 0);

    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(1.4, 2.4, 2.2);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 0.9);
    rim.position.set(-1.8, 1.4, -1.6);
    this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x404a6b, 1.1));

    this.scene.add(this.root);

    this.fallback = new FallbackRig();
    this.root.add(this.fallback.root);
    this.animator = new IdleAnimator(this.fallback, { ...DEFAULT_IDLE_CONFIG, ...options.idle });

    this.observeResize();
  }

  private observeResize(): void {
    const canvas = this.options.canvas;
    const apply = () => {
      const parent = canvas.parentElement;
      const width = parent?.clientWidth || canvas.clientWidth || 320;
      const height = parent?.clientHeight || canvas.clientHeight || 480;
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / Math.max(1, height);
      this.camera.updateProjectionMatrix();
    };
    apply();
    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(apply);
      this.resizeObserver.observe(canvas.parentElement);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const tick = () => {
      if (!this.running) return;
      this.frame = requestAnimationFrame(tick);
      const dt = this.clock.getDelta();
      this.animator.update(dt);
      this.vrm?.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  /** True while the built-in fallback rig (not a user VRM) is displayed. */
  get isFallback(): boolean {
    return this.vrm === null;
  }

  /**
   * Validate and load a `.vrm`. Rejects invalid files without touching the
   * current model, so a bad import never leaves the user with a blank stage.
   */
  async loadVrm(buffer: ArrayBuffer): Promise<VrmValidationResult> {
    const validation = validateVrm(buffer);
    if (!validation.ok) return validation;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    let vrm: VRM;
    try {
      const gltf = await loader.parseAsync(buffer, '');
      const loaded = gltf.userData.vrm as VRM | undefined;
      if (!loaded) return { ok: false, error: 'not_vrm' };
      vrm = loaded;
    } catch {
      return { ok: false, error: 'bad_json' };
    }

    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    VRMUtils.combineSkeletons(vrm.scene);
    vrm.scene.traverse((obj) => {
      obj.frustumCulled = false;
    });
    // VRM 0.x faces -Z; rotate so the avatar looks at the camera.
    if (vrm.meta && (vrm.meta as { metaVersion?: string }).metaVersion === '0') {
      VRMUtils.rotateVRM0(vrm);
    }

    this.clearModel();
    this.vrm = vrm;
    this.root.add(vrm.scene);
    this.animator.setTarget(new VrmTarget(vrm));
    this.frameCameraOnModel();
    return validation;
  }

  /** Drop the user VRM and go back to the built-in animated rig. */
  resetToFallback(): void {
    this.clearModel();
    this.fallback = new FallbackRig();
    this.root.add(this.fallback.root);
    this.animator.setTarget(this.fallback);
    this.camera.position.set(0, 1.32, 2.6);
    this.camera.lookAt(0, 1.24, 0);
  }

  private clearModel(): void {
    if (this.vrm) {
      this.root.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
      this.vrm = null;
    }
    if (this.fallback) {
      this.root.remove(this.fallback.root);
      this.fallback.dispose();
      this.fallback = null;
    }
  }

  private frameCameraOnModel(): void {
    if (!this.vrm) return;
    const head = this.vrm.humanoid?.getNormalizedBoneNode('head' as never);
    const box = new THREE.Box3().setFromObject(this.vrm.scene);
    const height = Math.max(0.5, box.max.y - box.min.y);
    const target = head ? head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, height * 0.9, 0);
    this.camera.position.set(0, target.y - 0.02, height * 1.75);
    this.camera.lookAt(0, target.y - 0.06, 0);
  }

  setTransform(scale: number, offsetX: number, offsetY: number): void {
    this.root.scale.setScalar(scale);
    this.root.position.set(offsetX, offsetY, 0);
  }

  setIdleConfig(patch: Partial<IdleConfig>): void {
    Object.assign(this.animator.config, patch);
  }

  setEmotion(emotion: string | null, weight = 0.8): void {
    const mapped = emotion === 'thinking' ? 'relaxed' : emotion;
    this.animator.setEmotion(mapped, weight);
  }

  /** Point the head/eyes at a normalised (-1..1) screen position. */
  setLookAt(x: number, y: number): void {
    this.animator.lookAt.set(x, y);
  }

  /** Drive the mouth from a 0..1 amplitude envelope (see lipsync.ts). */
  setMouthOpen(weight: number): void {
    this.lipSyncWeight = Math.max(0, Math.min(1, weight));
    const target: IdleTarget | null = this.vrm ? new VrmTarget(this.vrm) : this.fallback;
    target?.setExpression('aa', this.lipSyncWeight);
  }

  setViseme(viseme: string, weight: number): void {
    const target: IdleTarget | null = this.vrm ? new VrmTarget(this.vrm) : this.fallback;
    for (const v of ['aa', 'ih', 'ou', 'ee', 'oh']) target?.setExpression(v, v === viseme ? weight : 0);
  }

  dispose(): void {
    this.stop();
    this.resizeObserver?.disconnect();
    this.clearModel();
    this.renderer.dispose();
  }
}
