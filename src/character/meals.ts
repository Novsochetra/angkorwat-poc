import { Matrix4, Quaternion, Vector3 } from 'three';
import type { FaceName } from './parts/face';
import { FOOD_GRIPS, type FoodKind, type Grip } from './parts/food';
import type { Pose } from './pose';

/**
 * Eating and drinking: the `eat`, `bite` and `drink` actions (clips.ts
 * ACTIONS) with what he holds (parts/food.ts). Each is a few seconds:
 *
 *  - `eat` (noodles, rice, fruit; ≈ 4.9 s): the bowl, box or bag up on his
 *    left palm in front of his chest, three times the chopsticks (spoon,
 *    stick) in his right hand take a portion from it and bring it up to his
 *    mouth from below on his right, his head bowing a little to meet them;
 *    he chews, then lowers it, content.
 *  - `bite` (a skewer, a rice cake; ≈ 4.2 s): the stick to his mouth from
 *    the right, a bite, a tug, he chews and looks at it (turning it), a
 *    second bite, chews, done.
 *  - `drink` (a coconut in both hands, a cup, a bag, a bottle; ≈ 4.4 s): the
 *    straw to his mouth (the bottle tipped up, his head turned to it: his
 *    arm is short), three sips, then down a little and a satisfied "ahh",
 *    head back.
 *
 * Each ends with the `yum` face and the empty things gone (they shrink away
 * in his hands: `MEAL[action].gone`); the explorer then lets go of the food.
 *
 * The hands follow a track of places per action (`KEYS`): each kind says
 * where its item is at each place (`PLACES`: in his chest's frame, in his
 * head's — "this point of the item on his mouth" —, or in the bowl's), the
 * Animator eases between them and puts the fists there by arm IK, the
 * wrists turned so the item sits as the place says (`mealHands`). His head
 * leans, bites, chews and tips back by `mealPose`. Standing, he stands
 * still; sitting (the rest posture), the posture keeps his body and only
 * the arms, the neck and the head eat.
 *
 * Units: body units (BU), chest space (+x his left, +y up, +z forward), as
 * the Animator's arm IK.
 */

export type MealAction = 'eat' | 'bite' | 'drink';
export const MEAL_ACTIONS: readonly MealAction[] = ['eat', 'bite', 'drink'];
export const isMeal = (a: string | null | undefined): a is MealAction => a === 'eat' || a === 'bite' || a === 'drink';

/** How each kind is taken. */
export const MEAL_OF: Record<FoodKind, MealAction> = {
  noodles: 'eat',
  riceBowl: 'eat',
  fruit: 'eat',
  skewer: 'bite',
  sweet: 'bite',
  coconut: 'drink',
  cupDrink: 'drink',
  bagDrink: 'drink',
  bottle: 'drink',
};
/** What he takes when an action plays with nothing in his hands (the viewer, game.html). */
export const DEFAULT_FOOD: Record<MealAction, FoodKind> = { eat: 'noodles', bite: 'skewer', drink: 'cupDrink' };

/**
 * Times (s from the start): `duration`, the fades; `eat` `portions` (the
 * chopsticks take one from the bowl) and `bites` (the food in his mouth);
 * `bite` `bites` (a piece off); `drink` `sips` (the level drops) and `ahh`;
 * `gone`: the empty things shrink away over this; `yum`: the happy face
 * from here; `stick`: from here a push of the stick may end it (it
 * shrinks away as the meal fades). For sounds, the caller's.
 */
export const MEAL = {
  eat: { duration: 4.9, fadeIn: 0.3, fadeOut: 0.45, portions: [0.7, 1.8, 2.9], bites: [1.12, 2.22, 3.32], yum: 3.95, gone: [4.12, 4.45], stick: 1.3 },
  bite: { duration: 4.2, fadeIn: 0.3, fadeOut: 0.45, bites: [0.6, 2.36], yum: 3.3, gone: [3.42, 3.75], stick: 0.9 },
  drink: { duration: 4.4, fadeIn: 0.3, fadeOut: 0.45, sips: [0.95, 1.5, 2.05], ahh: 2.62, yum: 3.2, gone: [3.62, 3.92], stick: 1.2 },
} as const;

// ── Faces ──────────────────────────────────────────────────────────────────

/** The faces of the meals (parts/face.ts `MEAL_FACES`; `chew` and `look` stand for their two chewing mouths). */
type MealFace = 'bite' | 'chew' | 'look' | 'sip' | 'ahh' | 'yum';
/** The face at each time (null: his own expression). */
const FACES: Record<MealAction, readonly (readonly [number, MealFace | null])[]> = {
  eat: [[0, null], [0.86, 'bite'], [1.16, 'chew'], [1.96, 'bite'], [2.26, 'chew'], [3.06, 'bite'], [3.36, 'chew'], [MEAL.eat.yum, 'yum']],
  bite: [[0, null], [0.34, 'bite'], [0.66, 'chew'], [1.1, 'look'], [2.1, 'bite'], [2.42, 'chew'], [MEAL.bite.yum, 'yum']],
  drink: [[0, null], [0.5, 'sip'], [2.5, 'ahh'], [MEAL.drink.yum, 'yum']],
};

/** The face `t` s into `action` (chewing: the two chewing mouths in turn, about 3.5 a second). */
export function mealFace(action: MealAction, t: number): FaceName | null {
  const keys = FACES[action];
  let f: MealFace | null = null;
  for (const [at, face] of keys) if (t >= at) f = face;
  const odd = Math.floor(t * 7) % 2 === 1;
  if (f === 'chew') return odd ? 'chew2' : 'chew';
  if (f === 'look') return odd ? 'look2' : 'look';
  return f;
}

/** How many of `times` have passed at `t`. */
export const passed = (times: readonly number[], t: number) => times.reduce((n, at) => n + (t >= at ? 1 : 0), 0);

/**
 * Which stage of each hand's item shows `t` s into `action` (parts/food.ts
 * stages: the bowl's portions eaten, the chopsticks loaded or not, the
 * pieces bitten, the sips taken), and how big they still are (1 ‥ 0 as they
 * go at the end).
 */
export function mealStage(action: MealAction, t: number, out: { left: number; right: number; size: number }): void {
  const g = MEAL[action].gone;
  out.size = 1 - smooth((t - g[0]) / (g[1] - g[0]));
  if (action === 'eat') {
    const m = MEAL.eat;
    out.left = passed(m.portions, t);
    // (loaded from a portion until the bite)
    const n = passed(m.portions, t);
    out.right = n > 0 && t < m.bites[n - 1] ? 1 : 0;
  } else if (action === 'bite') {
    out.left = 0;
    out.right = passed(MEAL.bite.bites, t);
  } else {
    out.left = 0;
    out.right = passed(MEAL.drink.sips, t);
  }
}

// ── Head and body ──────────────────────────────────────────────────────────

const smooth = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return c * c * (3 - 2 * c);
};
/** 0 → 1 over a‥b, 1 → 0 over c‥d. */
const window4 = (t: number, a: number, b: number, c: number, d: number) => smooth((t - a) / (b - a)) * (1 - smooth((t - c) / (d - c)));
/** Chewing: a small quick nod while `on`. */
const chew = (t: number, on: number) => Math.sin(t * Math.PI * 7) * 0.028 * on;

/**
 * The chest, neck and head `t` s into `action` (the arms are `mealHands`):
 * eating he bows his head over the bowl and a little more at each bite,
 * chewing nods; biting he turns to the stick, tugs, looks at it; drinking
 * he bends to the straw, sips, and tips his head back for the "ahh".
 */
export function mealPose(action: MealAction, t: number, kind: FoodKind): Pose {
  if (action === 'eat') {
    const m = MEAL.eat;
    const over = window4(t, 0.1, 0.5, 3.8, 4.3);
    let bite = 0;
    for (const b of m.bites) bite = Math.max(bite, window4(t, b - 0.3, b - 0.06, b + 0.08, b + 0.35));
    const chewing = window4(t, 1.2, 1.3, 4.0, 4.3) * (1 - bite);
    const content = window4(t, 3.9, 4.25, 4.6, 4.9);
    return {
      chest: { rx: 0.05 * over },
      neck: { rx: 0.03 * over + 0.03 * bite },
      head: { rx: 0.06 * over + 0.06 * bite + chew(t, chewing) - 0.06 * content, ry: -0.08 * bite, rz: 0.1 * content },
    };
  }
  if (action === 'bite') {
    const m = MEAL.bite;
    let at = 0;
    let tug = 0;
    for (const b of m.bites) {
      at = Math.max(at, window4(t, b - 0.35, b - 0.08, b + 0.02, b + 0.25));
      tug = Math.max(tug, window4(t, b, b + 0.12, b + 0.25, b + 0.5));
    }
    const look = window4(t, 0.8, 1.2, 1.9, 2.15);
    const chewing = window4(t, 0.7, 0.8, 1.95, 2.05) + window4(t, 2.5, 2.6, 3.2, 3.4);
    const content = window4(t, 3.2, 3.55, 3.9, 4.2);
    return {
      chest: { rx: 0.04 * at, ry: -0.06 * at },
      neck: { rx: 0.03 * at + 0.04 * look },
      head: { rx: 0.05 * at - 0.06 * tug + 0.12 * look + chew(t, chewing) - 0.05 * content, ry: -0.12 * at - 0.1 * tug - 0.22 * look, rz: 0.06 * look + 0.1 * content },
    };
  }
  const m = MEAL.drink;
  const sipping = window4(t, 0.3, 0.55, 2.3, 2.55);
  let sip = 0;
  for (const s of m.sips) sip = Math.max(sip, window4(t, s - 0.2, s - 0.05, s + 0.05, s + 0.2));
  const ahh = window4(t, 2.45, 2.7, 3.05, 3.35);
  const content = window4(t, 3.1, 3.4, 3.9, 4.4);
  // (the bottle tips up: the head goes back a little, and turns to it on his right: his arm is short)
  const bottle = kind === 'bottle' ? sipping : 0;
  const lean = kind === 'bottle' ? 0 : 0.06 * sipping;
  return {
    chest: { rx: 0.04 * sipping - 0.06 * ahh - 0.03 * bottle, ry: 0.08 * bottle },
    neck: { rx: 0.05 * sipping - 0.05 * ahh - 0.04 * bottle, ry: -0.12 * bottle },
    head: { rx: lean + 0.035 * sip - 0.2 * ahh - 0.12 * bottle - 0.04 * content, ry: -0.32 * bottle, rz: 0.08 * content },
  };
}

// ── The hands ──────────────────────────────────────────────────────────────

type V3 = readonly [number, number, number];

/**
 * Where an item is at a place. `in`: the frame `at` (and `z`, `y`) are in —
 * his chest (default), his head (with `point`: that point of the item on
 * `at`, e.g. the chopsticks' tips on his mouth), or the left hand's item
 * (eating: the chopsticks over the bowl). `z` / `y`: which way the item's
 * +Z and +Y point (made square; default the frame's own); `upright`: they
 * are in the chest's frame even for a head place (a cup stays upright as
 * his head bows). `point`: the item point put on `at` (`bite`: this bite's
 * point, parts/food.ts `bites`), else its origin. `shrug`: the shoulder
 * comes forward / up (BU) to reach. `from`: instead of `z`, the item's +Z
 * points from here to `at` (a rod aimed at his mouth from where the fist
 * comes: the fist lands on that line). `elbow`: which way the elbow points
 * (chest space; default down and out).
 */
interface Place {
  in?: 'chest' | 'head' | 'bowl';
  at: V3;
  z?: V3;
  y?: V3;
  from?: V3;
  upright?: boolean;
  point?: 'bite' | V3;
  shrug?: V3;
  elbow?: V3;
}

/** The mouth (head space, BU): the middle of the lips, a hair in front of the face. */
export const MOUTH: V3 = [0, 0.85, 4.75];
const m = (dx: number, dy: number, dz: number): V3 => [MOUTH[0] + dx, MOUTH[1] + dy, MOUTH[2] + dz];

type HandPlaces = Record<string, Place>;
interface KindPlaces {
  L?: HandPlaces;
  R: HandPlaces;
}

/** The left palm with a bowl, a box or a bag: low on his left, then up in front of his chest. */
const BOWL_L: HandPlaces = {
  carry: { at: [3.4, 2.0, 5.2], shrug: [0, 0, 0.4] },
  hold: { at: [2.4, 3.5, 5.6], z: [0, 0.12, 1], shrug: [-0.2, 0.2, 0.8] },
};
/**
 * Chopsticks, a spoon or the fruit's stick in the right hand (held at the
 * far end, the elbow down): its tip into the bowl from his right, then up
 * to his mouth from below on his right.
 */
const UTENSIL_R = (tipIn: number, dipIn: number, tip: number): HandPlaces => ({
  carry: { at: [-3.6, 1.8, 4.6], z: [0.25, 0.55, 0.8] },
  over: { in: 'bowl', at: [-0.2, tipIn + 1.1, 0], from: [-4.6, 3.3, -1.2], point: [0, 0, tip], shrug: [0, 0.1, 0.5] },
  dip: { in: 'bowl', at: [0.1, dipIn, 0.1], from: [-4.4, 2.7, -1.0], point: [0, 0, tip], shrug: [0, 0.1, 0.5] },
  mouth: { in: 'head', at: m(0, 0, 0), from: [-3.3, -3.6, 4.5], point: 'bite', shrug: [0.3, 0.2, 0.8] },
});

export const PLACES: Record<FoodKind, KindPlaces> = {
  noodles: { L: BOWL_L, R: UTENSIL_R(1.9, 2.05, 5.2) },
  riceBowl: { L: BOWL_L, R: UTENSIL_R(1.55, 1.65, 4.6) },
  fruit: { L: BOWL_L, R: UTENSIL_R(3.0, 2.8, 5.0) },
  skewer: {
    R: {
      carry: { at: [-3.8, 1.9, 4.4], z: [0.2, 0.75, 0.62] },
      mouth: { in: 'head', at: m(0, 0, -0.15), from: [-3.5, -3.4, 4.9], point: 'bite', shrug: [0.3, 0.2, 0.8] },
      pull: { in: 'head', at: m(-0.9, -0.7, 0.7), from: [-4.3, -4.0, 5.5], point: 'bite', shrug: [0.2, 0.1, 0.6] },
      look: { at: [-2.6, 3.9, 6.0], z: [0.35, 0.8, 0.45], shrug: [0.1, 0.1, 0.6] },
      look2: { at: [-2.4, 4.1, 6.1], z: [0.1, 0.85, 0.5], y: [0.3, 0.5, -0.8], shrug: [0.1, 0.1, 0.6] },
    },
  },
  sweet: {
    R: {
      carry: { at: [-3.8, 1.9, 4.4], z: [0.15, 0.85, 0.5] },
      mouth: { in: 'head', at: m(0, 0, -0.1), from: [-3.0, -3.5, 5.0], point: 'bite', shrug: [0.3, 0.2, 0.8] },
      pull: { in: 'head', at: m(-0.8, -0.7, 0.8), from: [-3.8, -4.2, 5.6], point: 'bite', shrug: [0.2, 0.1, 0.6] },
      look: { at: [-2.6, 3.8, 6.0], z: [0.3, 0.85, 0.4], shrug: [0.1, 0.1, 0.6] },
      look2: { at: [-2.4, 4.0, 6.1], z: [0.05, 0.9, 0.45], shrug: [0.1, 0.1, 0.6] },
    },
  },
  coconut: {
    R: {
      carry: { at: [0, 2.6, 7.0], shrug: [0, 0, 0.6] },
      mouth: { in: 'head', at: m(0, 0, 0), upright: true, point: 'bite', shrug: [0, 0, 0.9] },
      // (after: tipped toward him, looking into it)
      off: { at: [0, 2.7, 6.6], z: [0, 0.3, 1], shrug: [0, 0, 0.7] },
    },
  },
  cupDrink: {
    R: {
      carry: { at: [-1.9, 1.2, 5.6] },
      mouth: { in: 'head', at: m(0, 0, 0), upright: true, point: 'bite', shrug: [0.2, 0.2, 0.8] },
      off: { at: [-1.0, 2.2, 6.2], shrug: [0.1, 0.1, 0.6] },
    },
  },
  bagDrink: {
    R: {
      carry: { at: [-3.2, 3.6, 5.2] },
      mouth: { in: 'head', at: m(0, 0, 0), upright: true, point: 'bite', shrug: [0.2, 0.2, 0.8] },
      off: { at: [-1.6, 5.4, 6.2], shrug: [0.1, 0.1, 0.6] },
    },
  },
  bottle: {
    R: {
      carry: { at: [-2.2, 1.0, 5.6] },
      // (tipped up, its mouth on his lips, the bottom up in front: his head goes back with it)
      mouth: { in: 'head', at: m(0, 0, 0.1), z: [0, 0.94, -0.34], y: [0, -0.34, -0.94], point: 'bite', shrug: [0.2, 0.5, 1.2], elbow: [-0.45, -1, 0.25] },
      off: { at: [-1.4, 2.0, 6.2], z: [0, 0.3, 1], shrug: [0.1, 0.1, 0.6] },
    },
  },
};

/** The track of each action: [time (s), the left hand's place, the right hand's place, which bite's point]. */
type Key = readonly [number, string | null, string, number];
const KEYS: Record<MealAction, readonly Key[]> = {
  eat: [
    [0, 'carry', 'carry', 0],
    [0.42, 'hold', 'over', 0],
    [0.62, 'hold', 'dip', 0],
    [0.76, 'hold', 'dip', 0],
    [1.06, 'hold', 'mouth', 0],
    [1.2, 'hold', 'mouth', 0],
    [1.55, 'hold', 'over', 0],
    [1.72, 'hold', 'dip', 0],
    [1.86, 'hold', 'dip', 0],
    [2.16, 'hold', 'mouth', 0],
    [2.3, 'hold', 'mouth', 0],
    [2.65, 'hold', 'over', 0],
    [2.82, 'hold', 'dip', 0],
    [2.96, 'hold', 'dip', 0],
    [3.26, 'hold', 'mouth', 0],
    [3.4, 'hold', 'mouth', 0],
    [3.85, 'hold', 'over', 0],
    [4.35, 'carry', 'carry', 0],
  ],
  bite: [
    [0, null, 'carry', 0],
    [0.5, null, 'mouth', 0],
    [0.64, null, 'mouth', 0],
    [0.9, null, 'pull', 0],
    [1.35, null, 'look', 1],
    [1.85, null, 'look2', 1],
    [2.25, null, 'mouth', 1],
    [2.4, null, 'mouth', 1],
    [2.66, null, 'pull', 1],
    [3.3, null, 'carry', 1],
  ],
  drink: [
    [0, null, 'carry', 0],
    [0.5, null, 'mouth', 0],
    [2.35, null, 'mouth', 0],
    [2.62, null, 'off', 0],
    [3.2, null, 'off', 0],
    [3.75, null, 'carry', 0],
  ],
};

/** Where a hand's item is (chest space), the shoulder's reach and which way the elbow points (0: the Animator's own). */
export interface ItemPose {
  pos: Vector3;
  quat: Quaternion;
  shrug: Vector3;
  elbow: Vector3;
}
export const itemPose = (): ItemPose => ({ pos: new Vector3(), quat: new Quaternion(), shrug: new Vector3(), elbow: new Vector3() });

const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _p = new Vector3();
const _q = new Quaternion();
const _hq = new Quaternion();
const _mb = new Matrix4();
const A = itemPose();
const B = itemPose();

/** The quaternion of a frame whose +Z is `z` and +Y toward `y` (in its parent). */
function basis(z: V3 | undefined, y: V3 | undefined, out: Quaternion): Quaternion {
  _z.set(...(z ?? [0, 0, 1])).normalize();
  _y.set(...(y ?? [0, 1, 0]));
  _y.addScaledVector(_z, -_y.dot(_z));
  if (_y.lengthSq() < 1e-6) _y.set(0, 0, -1).addScaledVector(_z, _z.z);
  _y.normalize();
  _x.crossVectors(_y, _z);
  return out.setFromRotationMatrix(_mb.makeBasis(_x, _y, _z));
}

/** An item at a place (chest space): see `Place`. */
function placeItem(p: Place, bite: V3, head: Matrix4, bowl: ItemPose | null, out: ItemPose): ItemPose {
  basis(p.from ? [p.at[0] - p.from[0], p.at[1] - p.from[1], p.at[2] - p.from[2]] : p.z, p.y, out.quat);
  const frame = p.in ?? 'chest';
  if (frame === 'head') {
    if (!p.upright) out.quat.premultiply(_hq.setFromRotationMatrix(head));
    _p.set(...p.at).applyMatrix4(head);
  } else if (frame === 'bowl' && bowl) {
    out.quat.premultiply(bowl.quat);
    _p.set(...p.at).applyQuaternion(bowl.quat).add(bowl.pos);
  } else _p.set(...p.at);
  const point = p.point === 'bite' ? bite : (p.point ?? null);
  out.pos.copy(_p);
  if (point) out.pos.sub(_x.set(...point).applyQuaternion(out.quat));
  out.shrug.set(...(p.shrug ?? [0, 0, 0]));
  out.elbow.set(...(p.elbow ?? [0, 0, 0]));
  return out;
}

/** Ease between two item poses (`u` 0 → `a`, 1 → `b`) into `a`. */
function blend(a: ItemPose, b: ItemPose, u: number): ItemPose {
  a.pos.lerp(b.pos, u);
  a.quat.slerp(b.quat, u);
  a.shrug.lerp(b.shrug, u);
  a.elbow.lerp(b.elbow, u);
  return a;
}

/**
 * Where each hand's item is `t` s into `action` (or held, no action: the
 * `carry` places), chest space: `head` is the head's transform in chest
 * space this frame (the mouth moves with it). Returns which hands hold
 * something (the coconut: both, on the one item in `right`).
 */
export function mealHands(action: MealAction | null, kind: FoodKind, t: number, head: Matrix4, left: ItemPose, right: ItemPose): { left: boolean; right: boolean } {
  const places = PLACES[kind];
  const grips = FOOD_GRIPS[kind];
  const keys = action ? KEYS[action] : null;
  // The key before and after `t` (held: the carry places).
  let i = 0;
  if (keys) while (i < keys.length - 1 && keys[i + 1][0] <= t) i++;
  const k0 = keys?.[i];
  const k1 = keys?.[Math.min(i + 1, keys.length - 1)];
  const u = k0 && k1 && k1[0] > k0[0] ? smooth((t - k0[0]) / (k1[0] - k0[0])) : 0;
  const bites = grips.bites;
  const hasLeft = !!places.L && !!grips.left;
  if (hasLeft) {
    const name0 = k0?.[1] ?? 'carry';
    const name1 = k1?.[1] ?? 'carry';
    placeItem(places.L![name0] ?? places.L!.carry, bites[0], head, null, left);
    placeItem(places.L![name1] ?? places.L!.carry, bites[0], head, null, B);
    blend(left, B, u);
  }
  const name0 = k0?.[2] ?? 'carry';
  const name1 = k1?.[2] ?? 'carry';
  const bite0 = bites[Math.min(k0?.[3] ?? 0, bites.length - 1)];
  const bite1 = bites[Math.min(k1?.[3] ?? 0, bites.length - 1)];
  placeItem(places.R[name0] ?? places.R.carry, bite0, head, hasLeft ? left : null, right);
  placeItem(places.R[name1] ?? places.R.carry, bite1, head, hasLeft ? left : null, A);
  blend(right, A, u);
  return { left: hasLeft, right: true };
}

/** The fist's frame on an item (chest space) from the item's pose and the grip: its middle and turn. */
export function gripFrame(item: ItemPose, grip: Grip, pos: Vector3, quat: Quaternion): void {
  basis([grip.x[1] * grip.y[2] - grip.x[2] * grip.y[1], grip.x[2] * grip.y[0] - grip.x[0] * grip.y[2], grip.x[0] * grip.y[1] - grip.x[1] * grip.y[0]], grip.y, _q);
  quat.copy(item.quat).multiply(_q);
  pos.set(...grip.at).applyQuaternion(item.quat).add(item.pos);
}

/** Where an item sits in the fist holding it (the prop joint's frame): the grip undone. */
export function itemInFist(grip: Grip, pos: Vector3, quat: Quaternion): void {
  basis([grip.x[1] * grip.y[2] - grip.x[2] * grip.y[1], grip.x[2] * grip.y[0] - grip.x[0] * grip.y[2], grip.x[0] * grip.y[1] - grip.x[1] * grip.y[0]], grip.y, quat);
  quat.invert();
  pos.set(...grip.at).applyQuaternion(quat).negate();
}
