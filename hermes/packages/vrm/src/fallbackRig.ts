import * as THREE from 'three';
import type { IdleBone, IdleTarget } from './idle.js';

/**
 * Fallback humanoid rig.
 *
 * Shown before the user imports a `.vrm`. It is a real skeleton of meshes with
 * the same humanoid bone names a VRM exposes, driven by the *same*
 * `IdleAnimator` — so breathing, sway, gaze and blinking are visibly running
 * on day one. It is explicitly not a placeholder image.
 */
export class FallbackRig implements IdleTarget {
  readonly root = new THREE.Group();
  private readonly bones = new Map<IdleBone, THREE.Object3D>();
  private readonly expressions = new Map<string, number>();
  private readonly eyelids: THREE.Mesh[] = [];
  private readonly mouth: THREE.Mesh;
  private readonly materials: THREE.Material[] = [];

  constructor(accent = 0x6ea8ff) {
    const skin = this.material(0xf2d9c9);
    const cloth = this.material(accent);
    const dark = this.material(0x2b3350);
    const eyeWhite = this.material(0xffffff);
    const iris = this.material(0x2f6fb5);

    const hips = new THREE.Group();
    hips.position.y = 0.95;
    this.root.add(hips);
    this.bones.set('hips', hips);

    const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.08, 4, 16), cloth);
    hips.add(pelvis);

    const spine = new THREE.Group();
    spine.position.y = 0.1;
    hips.add(spine);
    this.bones.set('spine', spine);

    const chest = new THREE.Group();
    chest.position.y = 0.14;
    spine.add(chest);
    this.bones.set('chest', chest);

    const upperChest = new THREE.Group();
    chest.add(upperChest);
    this.bones.set('upperChest', upperChest);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.135, 0.2, 4, 20), cloth);
    torso.position.y = 0.06;
    upperChest.add(torso);

    const neck = new THREE.Group();
    neck.position.y = 0.21;
    upperChest.add(neck);
    this.bones.set('neck', neck);

    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.07, 14), skin);
    neckMesh.position.y = 0.03;
    neck.add(neckMesh);

    const head = new THREE.Group();
    head.position.y = 0.08;
    neck.add(head);
    this.bones.set('head', head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 28, 24), skin);
    skull.position.y = 0.1;
    skull.scale.set(1, 1.12, 0.95);
    head.add(skull);

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.122, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.62), dark);
    hair.position.y = 0.105;
    hair.scale.set(1, 1.1, 1);
    head.add(hair);

    // Eyes: separate bone groups so real eye-bone gaze works.
    for (const side of [-1, 1] as const) {
      const eye = new THREE.Group();
      eye.position.set(0.042 * side, 0.105, 0.088);
      head.add(eye);
      this.bones.set(side < 0 ? 'rightEye' : 'leftEye', eye);

      const white = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 14), eyeWhite);
      eye.add(white);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.012, 14, 12), iris);
      pupil.position.z = 0.014;
      eye.add(pupil);

      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0235, 16, 14, 0, Math.PI * 2, 0, Math.PI / 2), skin);
      lid.position.set(0, 0, 0);
      lid.scale.y = 0.02;
      eye.add(lid);
      this.eyelids.push(lid);
    }

    this.mouth = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), this.material(0x9c4a53));
    this.mouth.position.set(0, 0.048, 0.104);
    this.mouth.scale.set(1.4, 0.18, 0.6);
    head.add(this.mouth);

    // Arms
    for (const side of [-1, 1] as const) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.11 * side, 0.17, 0);
      upperChest.add(shoulder);
      this.bones.set(side < 0 ? 'rightShoulder' : 'leftShoulder', shoulder);

      const upperArm = new THREE.Group();
      upperArm.position.set(0.04 * side, 0, 0);
      upperArm.rotation.z = -0.22 * side;
      shoulder.add(upperArm);
      this.bones.set(side < 0 ? 'rightUpperArm' : 'leftUpperArm', upperArm);

      const armMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.34, 4, 12), cloth);
      armMesh.position.y = -0.2;
      upperArm.add(armMesh);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 12), skin);
      hand.position.y = -0.4;
      hand.scale.set(0.8, 1.1, 0.6);
      upperArm.add(hand);
    }

    // Legs (static — the idle animator does not target them)
    for (const side of [-1, 1] as const) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.52, 4, 12), dark);
      leg.position.set(0.055 * side, -0.33, 0);
      hips.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.04, 0.16), dark);
      foot.position.set(0.055 * side, -0.62, 0.03);
      hips.add(foot);
    }
  }

  private material(color: number): THREE.Material {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.02 });
    this.materials.push(m);
    return m;
  }

  getBone(bone: IdleBone): THREE.Object3D | null {
    return this.bones.get(bone) ?? null;
  }

  hasEyeBones(): boolean {
    return true;
  }

  setExpression(name: string, weight: number): void {
    const w = Math.max(0, Math.min(1, weight));
    this.expressions.set(name, w);
    if (name === 'blink') {
      for (const lid of this.eyelids) lid.scale.y = 0.02 + w * 1.15;
    }
    if (name === 'aa' || name === 'ih' || name === 'ou' || name === 'ee' || name === 'oh') {
      const open = Math.max(
        this.expressions.get('aa') ?? 0,
        this.expressions.get('ih') ?? 0,
        this.expressions.get('ou') ?? 0,
        this.expressions.get('ee') ?? 0,
        this.expressions.get('oh') ?? 0,
      );
      this.mouth.scale.set(1.4 - open * 0.5, 0.18 + open * 1.5, 0.6 + open * 0.4);
    }
    if (name === 'happy') {
      this.mouth.scale.x = 1.4 + w * 0.6;
      this.mouth.position.y = 0.048 + w * 0.004;
    }
  }

  getExpression(name: string): number {
    return this.expressions.get(name) ?? 0;
  }

  dispose(): void {
    this.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}
