import { Quaternion, Vector3, type Object3D } from 'three';
import { chestArm } from './gardenWork';
import type { Rig } from './Rig';

/**
 * A bundle of cut grass (or straw) carried in both arms against his chest,
 * over his walk (the map's roam/_cattleWork.ts): both fists in front of his
 * belly under the bundle, the forearms round it, the elbows out a little, his
 * walk's legs and body as they are. The bundle hangs on his chest joint (the
 * caller's slot), so it stays against him; the arms are solved once (arm IK in
 * the chest's space, character/gardenWork.ts `chestArm`) and laid over the
 * Animator's arms each frame by `w` (0: untouched), no allocation.
 *
 * ```ts
 * // after the explorer's update each frame (an add-on's `frame`):
 * applyHugCarry(explorer.rig, w);   // w: 0 not carrying ‥ 1 carrying (ease it)
 * ```
 *
 * Units: body units (BU) in his chest's space (+z forward, +x his left, y up).
 */

/** Where the bundle lies against him (the chest joint's space, BU): its middle, and how long it is across him. */
export const HUG_BUNDLE = { x: 0, y: 1.4, z: 4.6, len: 9 } as const;
/** The fists under the bundle (chest space, BU), the elbows' way (out, down, a little back). */
const FIST_L = new Vector3(2.4, 0.2, 4.4);
const FIST_R = new Vector3(-2.4, 0.2, 4.4);
const POLE_L = new Vector3(0.75, -0.55, -0.35).normalize();
const POLE_R = new Vector3(-0.75, -0.55, -0.35).normalize();

interface Arm {
  shoulder: Vector3;
  shift: Vector3;
  elbow: number;
  wrist: Vector3;
}
let solved: { L: Arm; R: Arm } | null = null;

function solve(): { L: Arm; R: Arm } {
  const arm = (side: 'L' | 'R'): Arm => {
    // (the fist turned palm up under the bundle: its grip across, toward the other hand)
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), side === 'L' ? -1.1 : 1.1);
    const p = chestArm(side, side === 'L' ? FIST_L : FIST_R, q, side === 'L' ? POLE_L : POLE_R);
    const sh = p[`shoulder${side}`]!;
    const wr = p[`wrist${side}`]!;
    return {
      shoulder: new Vector3(sh.rx ?? 0, sh.ry ?? 0, sh.rz ?? 0),
      shift: new Vector3(sh.px ?? 0, sh.py ?? 0, sh.pz ?? 0),
      elbow: p[`elbow${side}`]?.rx ?? 0,
      wrist: new Vector3(wr.rx ?? 0, wr.ry ?? 0, wr.rz ?? 0),
    };
  };
  return { L: arm('L'), R: arm('R') };
}

function blend(g: Object3D, x: number, y: number, z: number, w: number): void {
  const r = g.rotation;
  r.set(r.x + (x - r.x) * w, r.y + (y - r.y) * w, r.z + (z - r.z) * w);
}

/** Lay the hug over his arms as the Animator posed them this frame (by `w` 0‥1). */
export function applyHugCarry(rig: Rig, w: number): void {
  if (w <= 0.001) return;
  solved ??= solve();
  const J = rig.joints;
  const L = solved.L;
  const R = solved.R;
  blend(J.shoulderL, L.shoulder.x, L.shoulder.y, L.shoulder.z, w);
  J.shoulderL.position.copy(rig.rest.shoulderL).addScaledVector(L.shift, w);
  blend(J.elbowL, L.elbow, 0, 0, w);
  blend(J.wristL, L.wrist.x, L.wrist.y, L.wrist.z, w);
  blend(J.shoulderR, R.shoulder.x, R.shoulder.y, R.shoulder.z, w);
  J.shoulderR.position.copy(rig.rest.shoulderR).addScaledVector(R.shift, w);
  blend(J.elbowR, R.elbow, 0, 0, w);
  blend(J.wristR, R.wrist.x, R.wrist.y, R.wrist.z, w);
}
