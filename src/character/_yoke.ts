import { Matrix4, Vector3 } from 'three';

/**
 * The shoulder pole's sizes and its place (character/carryPole.ts re-exports them; character/gardenWork.ts poses
 * the pole's actions with them): in a module of their own so the two can share them without importing each other.
 */

/** Where the pole lies on his right shoulder (chest space, BU): its middle, on top of the shoulder by the collar. */
export const SHOULDER_PAD = new Vector3(-5.2, 7.1, 0.2);

/** The pole and its buckets (BU; the map's 1 BU = 7.35 cm: a 1.7 m pole, 30 cm tin buckets on half-metre ropes). */
export const YOKE = {
  /** The bamboo pole: its length, its radius; how far its ends bow down under two full buckets. */
  length: 23,
  r: 0.45,
  bow: 0.9,
  /** The rope from the notch at each end down to the bucket's bail (the wire handle's top). */
  rope: 6,
  /** A bucket: its height, its radius at the rim (a little narrower at the base), the bail's arch over the rim. */
  height: 4.2,
  radius: 2.15,
  bail: 1.4,
};
/** The hook (a pole end) to the bucket's middle (BU): the pendulum's length. */
export const YOKE_SWING = YOKE.rope + YOKE.bail + YOKE.height / 2;
/**
 * Where a pose puts the pole (the pole's five actions: character/gardenWork.ts `gardenYoke` fills it): its frame in
 * his space (BU: the pole's middle, +z along it to the front bucket's end, +y up), each bucket's lowest place (BU in
 * his space: it stands there, the rope slack; −Infinity: over water, it goes in) and its tip (rad: tipped over its
 * rim, pouring), and whether the dipper is in his right hand.
 */
export interface YokePlace {
  readonly frame: Matrix4;
  floor: [number, number];
  tip: [number, number];
  dipper: boolean;
  /** Where each rope is tied along the pole (BU from its middle, + toward its front end): its ends' notches, or (leaning) a node low on it. */
  hook: [number, number];
  /**
   * Where each bucket stands on the ground (his space, BU: its base's middle) when it rests there, `standOn` 1, eased
   * toward hanging under its hook as `standOn` goes to 0; its rope slack from the hook to its bail.
   */
  readonly stand: [Vector3, Vector3];
  standOn: [number, number];
  /** A bucket let down on its own cord (`poleFillRope`): which (−1 none), its frame (his space, its bail's top), the cord's top (his fist). */
  cord: number;
  readonly load: Matrix4;
  readonly cordTop: Vector3;
}
export function yokePlace(): YokePlace {
  return { frame: new Matrix4(), floor: [0, 0], tip: [0, 0], dipper: false, hook: [HOOK_END, -HOOK_END], stand: [new Vector3(), new Vector3()], standOn: [0, 0], cord: -1, load: new Matrix4(), cordTop: new Vector3() };
}
/** The ropes' notches: this far from the pole's middle (BU). */
export const HOOK_END = YOKE.length / 2 - 1.0;

/**
 * Where the pole rests for `poleUp` (and `poleDown` back to it): lying on its buckets beside him (`ground`, the
 * default), or leaning against his house's stilt (`lean`): its foot and its top (his space, BU), the buckets standing
 * at its foot either side, their ropes tied to a node low on it (as roam/_carryPoleModel.ts `leanModel` draws it).
 */
export interface PoleRest {
  at: 'ground' | 'lean';
  readonly foot: Vector3;
  readonly top: Vector3;
}
export function poleRest(): PoleRest {
  return { at: 'ground', foot: new Vector3(), top: new Vector3() };
}
/** The lean's buckets: this far either side of the foot and this far back from it (BU, its frame), the ropes' node this far up the pole from its foot. */
export const LEAN = { side: 3.67, back: 3.0, node: 8.4 };
