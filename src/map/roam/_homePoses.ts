import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { solveArm } from '../../character/Animator';
import { idle } from '../../character/clips';
import type { Pose } from '../../character/pose';
import { JOINTS } from '../../character/skeleton';

/**
 * His poses in his stilt house, postures for `Animator.posture` (standing,
 * the feet planted: `postureFeet` stays true):
 *
 * - **The stretch** on waking (roam/_homeSleep.ts): his arms go up and out in
 *   a wide V over his shoulders (his arms are short and his head big: up past
 *   his ears is as high as they go), fists closed, the chest arching back, the
 *   head tipping back with the eyes shut a moment; a small shiver at the top;
 *   then down again. `k` 0‥1 is how far into the stretch he is (the caller
 *   eases it in and out).
 * - **Working the doors** (roam/_homeDoor.ts): a half step in and a lean
 *   toward them, both hands out to the leaves (their rings, or their edges
 *   from inside), following them as they swing; `k` 0‥1 how far he reaches.
 *
 * Units: body units (BU) in the explorer's space (+z forward, +x his left),
 * as character/clips.ts.
 */

/** Where the fists go at the top (character space, BU), and which way the elbows point (chest space). */
const FIST = { x: 8.6, y: 22.6, z: -0.6 };
const POLE = { L: new Vector3(0.9, -0.25, -0.35).normalize(), R: new Vector3(-0.9, -0.25, -0.35).normalize() };
/** The fists at rest by his sides (character space, BU): where the arms start from. */
const REST = { x: 6.2, y: 11.6, z: 0.4 };

const HIPS = new Vector3(...JOINTS.hips.pivot);
const CHEST_REST = new Vector3(...JOINTS.chest.pivot).sub(HIPS);
const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _t = new Vector3();
const _f = new Vector3();
const _s = new Vector3(1, 1, 1);

const smooth = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return c * c * (3 - 2 * c);
};

/** The stretch at `k` (0 standing at ease ‥ 1 at full stretch), `t` seconds (the shiver, the breath). */
export function stretchPose(k: number, t: number): Pose {
  const pose = idle(t);
  const e = smooth(k);
  // (a small shiver at the top of it)
  const shiver = Math.sin(t * 41) * 0.012 * smooth((k - 0.8) / 0.2);
  const hp = pose.hips ?? {};
  pose.hips = { ...hp, rx: (hp.rx ?? 0) - 0.05 * e, py: (hp.py ?? 0) + 0.25 * e };
  const c = pose.chest ?? {};
  pose.chest = { ...c, rx: (c.rx ?? 0) - 0.24 * e + shiver, rz: (c.rz ?? 0) + shiver };
  pose.neck = { rx: -0.18 * e };
  const h = pose.head ?? {};
  pose.head = { ...h, rx: (h.rx ?? 0) - 0.32 * e, ry: (h.ry ?? 0) * (1 - e) };
  // (up on the balls of his feet a little at the top)
  pose.ankleL = { rx: 0.12 * e };
  pose.ankleR = { rx: 0.12 * e };

  // The fists from his sides up to the V over his shoulders, into chest space through this pose's hips and chest.
  toChest(pose);
  for (const side of [1, -1] as const) {
    _f.set(side * (REST.x + (FIST.x - REST.x) * e), REST.y + (FIST.y - REST.y) * e, REST.z + (FIST.z - REST.z) * e).applyMatrix4(_m);
    Object.assign(pose, solveArm(side > 0 ? 'L' : 'R', _f, side > 0 ? POLE.L : POLE.R));
  }
  return pose;
}

/** `_m`: his space (BU) into chest space, through `pose`'s hips and chest. */
function toChest(pose: Pose): void {
  const hips = pose.hips ?? {};
  _q.setFromEuler(_e.set(hips.rx ?? 0, hips.ry ?? 0, hips.rz ?? 0));
  _m.compose(_t.set(HIPS.x + (hips.px ?? 0), HIPS.y + (hips.py ?? 0), HIPS.z + (hips.pz ?? 0)), _q, _s);
  const ch = pose.chest ?? {};
  _m2.compose(CHEST_REST, _q2.setFromEuler(_e.set(ch.rx ?? 0, ch.ry ?? 0, ch.rz ?? 0)), _s);
  _m.multiply(_m2).invert();
}

// ── Working the doors ──────────────────────────────────────────────────────

/** The half step in (BU: the hips forward), the chest's lean and the head's lift (radians) at full reach. */
const DOOR = { step: 1.3, lean: 0.2, head: -0.14 };
/** Elbows down and a little out as he pushes or pulls (chest space). */
const DOOR_POLE = { L: new Vector3(0.55, -0.8, -0.2).normalize(), R: new Vector3(-0.55, -0.8, -0.2).normalize() };

/**
 * Working the doors at `k` (0 at ease ‥ 1 reaching), his hands at `handL` / `handR` (his space, BU; the caller
 * brings them in from where they hang and keeps them within his reach), `t` seconds (his breathing).
 */
export function doorPose(k: number, handL: Vector3, handR: Vector3, t: number): Pose {
  const pose = idle(t);
  const e = smooth(k);
  const hp = pose.hips ?? {};
  pose.hips = { ...hp, rx: (hp.rx ?? 0) + 0.05 * e, pz: (hp.pz ?? 0) + DOOR.step * e };
  const c = pose.chest ?? {};
  pose.chest = { ...c, rx: (c.rx ?? 0) + DOOR.lean * e };
  const h = pose.head ?? {};
  pose.head = { ...h, rx: (h.rx ?? 0) + DOOR.head * e };
  toChest(pose);
  for (const side of [1, -1] as const) {
    const hand = side > 0 ? handL : handR;
    _f.set(side * REST.x + (hand.x - side * REST.x) * e, REST.y + (hand.y - REST.y) * e, REST.z + (hand.z - REST.z) * e).applyMatrix4(_m);
    Object.assign(pose, solveArm(side > 0 ? 'L' : 'R', _f, side > 0 ? DOOR_POLE.L : DOOR_POLE.R));
  }
  return pose;
}
