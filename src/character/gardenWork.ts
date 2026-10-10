import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { ACTIONS, propAt, type GardenAction, type GardenProp } from '../map/garden/actions';
import type { PlantKindId } from '../map/garden/kinds';
import { solveArm } from './Animator';
import type { JointPose, Pose } from './pose';
import { JOINTS, type JointName } from './skeleton';

/**
 * Working in his home garden (the map's roam/_gardenWork.ts): a posture for
 * `Animator.posture` with `postureFeet = false`, one per action of
 * map/garden/actions.ts (`ACTIONS`: its beats are the poses' moments too).
 *
 * How a Cambodian villager works his garden: he hoes bent over, squats flat-footed
 * to set a seed, kneels on one knee to plant a tree, tips the can with his free
 * hand under its spout, crouches at the jar to fill it, twists a fruit off and
 * drops it in the basket on his hip, reaches up into the leaves, cuts with his
 * knife, lifts the long bamboo pole into the crown, picks fallen fruit up with
 * both hands, and tugs a dead plant out leaning back.
 *
 * Everything he holds is placed first (`item` frames: the hoe through its swing,
 * the can tipped so its rose is over the plant, the pole's basket at the fruit…)
 * and his fists go where they hold it (`GRIPS`: each fist's place and turn in the
 * item's frame, which roam/_gardenProps.ts uses too, so the prop sits in the fist
 * exactly as the pose expects), by arm IK through the chest's frame as the
 * posture leaves it, the wrists turned to the grip. The body follows keyed shapes
 * per action (a monotone cubic through them: it starts and ends standing, so the
 * Animator's blend in and out is seamless); the feet stay planted where they stand
 * (a step lifts a foot and sets it down: never a slide), by two-bone leg IK, the
 * soles flat (or the right knee down on the ground, kneeling). His head looks at
 * the work.
 *
 * His arms are short for his big head (parts/food.ts): both hands meet only in
 * front of his chest, so he bends right over to reach the earth, and two-handed
 * things are held close in front of him.
 *
 * Units: body units (BU) in the explorer's space (+z forward, +x his left, y up
 * from his soles), as character/farmWork.ts. On the map 1 BU = 7.35 cm (the
 * explorer is `ROAM_SCALE` 1.4 × 1.7 m: 2.4 m).
 */
export interface GardenBody {
  action: GardenAction;
  /** Seconds into the action (0‥`ACTIONS[action].len`). */
  t: number;
  /**
   * Where the work is (BU, his space; see `GARDEN_SPOT` for where to stand him):
   * - the plant's foot (plant, plantTree, water, clear);
   * - the fruit's middle (pickLow, pickReach, pickGround; pickPole: up in the crown);
   * - where the knife cuts (pickCut: a cane's foot, a banana bunch's stalk);
   * - the water's surface where the can dips (fill: the jar's, or the stream's).
   */
  readonly spot: Vector3;
  /** Seconds since the posture began (breathing). */
  life: number;
  /** The plant's kind (its fruit's size: a big one is held in both hands; the seed, cutting, pup or seedling). */
  kind: PlantKindId | null;
}

export function gardenBody(action: GardenAction): GardenBody {
  return { action, t: 0, spot: new Vector3(0, 0, 9), life: 0, kind: null };
}

/**
 * Where the work should be (BU, his space) for each action, as the poses are made
 * for: the interaction stands him so the spot is about here (he turns to face it).
 * The poses reach a spot a little off these (the IK bends deeper or reaches), but
 * far off his hands fall short.
 * - plant / plantTree / clear: the plant's foot `z` ahead (0.66‥0.7 m on the map).
 * - water: the plant's foot `z` ahead (≈ 0.9 m): the can's long spout reaches it.
 * - fill: the water's surface `z` ahead; y: the surface's own height (a jar's
 *   ≈ 0.6 m: 8 BU, the stream's ≈ 0: he squats).
 * - pickLow: the fruit, y its height (an eggplant ≈ 0.3 m: 4 BU; a pumpkin on the ground ≈ 1.6).
 * - pickReach: the fruit ≤ 25 BU up (1.85 m: he stands on his toes for the highest).
 * - pickCut: a cane's foot (y ≈ 1) or a banana bunch's stalk (y ≤ 24).
 * - pickPole: the fruit, `poleZ(y)` ahead: the pole leans in at about 70°.
 * - pickGround: the fallen fruit's middle.
 */
export const GARDEN_SPOT = {
  plant: 12,
  plantTree: 12.5,
  water: 12,
  fill: 8,
  pickLow: 6.5,
  pickReach: 3.0,
  pickCut: 7.5,
  pickGround: 5.4,
  clear: 4.8,
  /** pickReach: the fruit this far to his right (BU: his right hand picks it, his arm up beside his big head). */
  reachX: -7.0,
  /** pickPole: how far ahead (BU) the fruit should be for its height `y` (BU): the pole leans in at about 60°. */
  poleZ: (y: number) => 6 + Math.max(0, y - 16) * 0.55,
} as const;

// ── Items and grips ─────────────────────────────────────────────────────────

type V3 = readonly [number, number, number];

/** A fist on an item: the fist's middle (the prop joint) and its X and Y axes, in the item's frame (Z = X × Y: the grip channel). */
export interface Grip {
  at: V3;
  x: V3;
  y: V3;
}

const UP: Grip = { at: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0] };
const grip = (at: V3, x: V3 = [1, 0, 0], y: V3 = [0, 1, 0]): Grip => ({ at, x, y });

/**
 * The hoe (ចបកាប់), in its frame: the handle along +z from its butt (origin) to the
 * iron's socket; the blade hangs from there toward −y, its edge back toward him
 * (+y is the handle's back, the forearms' side). Both fists along the handle,
 * thumbs toward the iron: the left near the butt, the right further up.
 */
export const HOE = {
  handle: 16,
  /** The handle's radius. */
  r: 0.42,
  /** The blade: its length from the socket to the edge, its width, its way (hoe frame: down and back toward him). */
  blade: 4.3,
  width: 4.4,
  dir: [0, -0.96, -0.28] as V3,
  gripL: 1.0,
  gripR: 4.4,
};
/** The blade's edge, hoe frame. */
const HOE_EDGE = new Vector3(0, HOE.dir[1] * HOE.blade, HOE.handle + HOE.dir[2] * HOE.blade);

/**
 * The watering can (ធុងស្រោចទឹក), its frame: the bottom's middle at the origin, +y up,
 * +z toward the spout. Its body, the top handle from back to front (the right fist
 * on it, carrying it as a bucket), the long spout from the bottom of its front up at
 * `spoutUp`, the rose at its end.
 */
export const CAN = {
  w: 5.2,
  d: 4.4,
  h: 5.2,
  /** The spout: where it leaves the body, its rise (rad) and length. */
  spoutAt: [0, 1.1, 2.0] as V3,
  spoutUp: 0.66,
  spout: 8.6,
  /** The rose's radius. */
  rose: 0.95,
  /** The top handle's top (over the body's top). */
  handleUp: 2.2,
};
const SPOUT_DIR = new Vector3(0, Math.sin(CAN.spoutUp), Math.cos(CAN.spoutUp));
/** The rose's face (can frame): where the water comes out. */
export const CAN_ROSE = new Vector3(...CAN.spoutAt).addScaledVector(SPOUT_DIR, CAN.spout + 0.5);

/** The knife (កាំបិត), its frame: the handle in the fist at the origin, the blade along +z, its edge toward −y (the fingers' side). */
export const KNIFE = { handle: 2.8, blade: 6.4, width: 1.9 };

/**
 * The bamboo picking pole (ដងបេះ), its frame: the butt at the origin, the pole up +z,
 * the little woven basket and its hook at the top (`head` long). The shaft is as
 * long as the work needs (`gardenPoleLength`): the right fist near the butt, the
 * left higher up.
 */
export const POLE = { r: 0.42, head: 3.4, gripR: 2.6, gripL: 6.0 };

/** The woven bamboo basket on his hip, its frame: the bottom's middle at the origin, +y up; held by its back rim (−z). */
export const BASKET = { r: 3.3, h: 3.5 };

/** The bagged seedling: the black nursery bag (its bottom's middle at the origin, +y up), the sapling standing out of it. */
export const SEEDLING = { r: 1.35, h: 2.8, tree: 7 };

/**
 * A plant's harvest in his hands (BU; true size on the map, a little generous so it
 * reads in his fist): its frame's origin in its middle, +y up (a hanging fruit's
 * stalk); `w` across, `h` tall; `both`: big, held in both hands; `hang`: a bunch
 * or canes held by the stalk at the top (pickCut), their origin there.
 */
export const FRUIT: Record<PlantKindId, { w: number; h: number; both: boolean; hang?: boolean }> = {
  // (the plant models' own sizes, garden/models/*.ts: the round striped eggplant, the pumpkin half a metre across…)
  eggplant: { w: 2.1, h: 2.0, both: false },
  corn: { w: 1.3, h: 3.4, both: false },
  pumpkin: { w: 6.6, h: 4.2, both: true },
  sugarcane: { w: 1.6, h: 15, both: false, hang: true },
  banana: { w: 4.6, h: 8, both: false, hang: true },
  papaya: { w: 2.6, h: 3.9, both: false },
  guava: { w: 1.6, h: 1.7, both: false },
  mango: { w: 1.7, h: 2.4, both: false },
  jackfruit: { w: 4.6, h: 7.6, both: true },
  durian: { w: 5.0, h: 5.6, both: true },
  coconut: { w: 4.0, h: 3.4, both: true },
  sugarPalm: { w: 2.8, h: 2.4, both: false },
  bodhi: { w: 1, h: 1, both: false },
};

/** A fruit held in both hands, or in one. */
export const bigFruit = (kind: PlantKindId | null): boolean => !!kind && FRUIT[kind].both;

/** The fist on a small fruit: above it (the fruit under his fingers, its stalk in the fist). */
/** Each kind's fruit grips, made once. */
const FRUIT_GRIPS = new Map<PlantKindId, { top: Grip; below: Grip; L: Grip; R: Grip }>();
function fruitGrips(k: PlantKindId): { top: Grip; below: Grip; L: Grip; R: Grip } {
  let g = FRUIT_GRIPS.get(k);
  if (!g) {
    const { w, h } = FRUIT[k];
    g = {
      top: grip([0, h / 2 + 0.9, 0]),
      below: grip([0, -h / 2 - 1.3, 0], [0, 1, 0], [0, 0, -1]),
      L: grip([w / 2 + 0.75, 0.2, 0]),
      R: grip([-(w / 2 + 0.75), 0.2, 0]),
    };
    FRUIT_GRIPS.set(k, g);
  }
  return g;
}
const fruitTop = (k: PlantKindId): Grip => fruitGrips(k).top;
/** A right palm up under a fruit (reaching up for it, bringing it down sitting on his palm): fingers forward, thumb out. */
const fruitBelow = (k: PlantKindId): Grip => fruitGrips(k).below;
/** Fists on a big fruit's sides, palms in, thumbs forward (the right on its right, −x). */
const fruitSide = (k: PlantKindId, side: 'L' | 'R'): Grip => fruitGrips(k)[side];
/** A stalk or canes through the fist, running up +z of the item (the item's own frame is the fist's). */
const STALK: Grip = UP;
/** Fists round a stick's stem (its frame +y up the stem): the grip channel up the stem, the forearm toward −z. */
const stem = (y: number): Grip => grip([0, y, 0], [1, 0, 0], [0, 0, -1]);
/** The dead plant's stick: how tall (BU) for a crop's and a tree's. */
export const STICK = { crop: 7.5, tree: 12, gripR: 2.2, gripL: 4.2 };
/** The seed, the sugarcane cutting, the banana pup: held up by the stem (their frame +y up from the foot). */
export const SEED = { cutting: 4.2, pup: 7.5 };

const GRIPS = {
  hoeL: grip([0, 0, HOE.gripL]),
  hoeR: grip([0, 0, HOE.gripR]),
  // (the top handle's middle, a little to the back: it balances as he carries it)
  can: grip([0, CAN.h + CAN.handleUp - 0.55, -0.4]),
  // (the left fist on the back handle, thumb up, the forearm from the can's left: it tips the can by it)
  canL: grip([0, 3.4, -CAN.d / 2 - 1.05], [0, 0, 1], [1, 0, 0]),
  knife: UP,
  // (the back rim across his fingers, the palm to the basket)
  basket: grip([0, BASKET.h + 0.15, -BASKET.r - 0.35], [0, 0, -1], [0, 1, 0]),
  // (the bag held at its sides, palms in, high on it: setting it in the hole the hands go down to the earth)
  bagR: grip([-(SEEDLING.r + 0.75), 2.1, 0]),
  bagL: grip([SEEDLING.r + 0.75, 2.1, 0]),
  seed: grip([0, 1.15, -0.2]),
  cutting: stem(2.4),
  pup: stem(2.2),
  stickR: stem(STICK.gripR),
  stickL: stem(STICK.gripL),
} satisfies Record<string, Grip>;

/**
 * The fist on `prop` (kind's) for `side`, in the item's frame, during `action`
 * at `t` (the pole slides through his hands as he lowers it). Null: that hand does
 * not hold it. roam/_gardenProps.ts puts the item in the fist by the inverse.
 */
export function gardenGrip(prop: GardenProp, kind: PlantKindId | null, side: 'L' | 'R', action: GardenAction, t: number, spot?: Vector3): Grip | null {
  switch (prop) {
    case 'hoe':
      return side === 'L' ? GRIPS.hoeL : GRIPS.hoeR;
    case 'can':
      return side === 'R' ? GRIPS.can : null;
    case 'knife':
      return side === 'R' ? GRIPS.knife : null;
    case 'basket':
      return side === 'L' ? GRIPS.basket : null;
    case 'pole': {
      const g = poleGrips(t, spot ?? DEFAULT_SPOT.pickPole);
      const pg = side === 'L' ? PROP_POLE_GRIP.L : PROP_POLE_GRIP.R;
      (pg.at as [number, number, number])[2] = side === 'L' ? g.l : g.r;
      return pg;
    }
    case 'seed':
      return GRIPS.seed;
    case 'cutting':
      return GRIPS.cutting;
    case 'pup':
      return GRIPS.pup;
    case 'seedling':
      return side === 'L' ? GRIPS.bagL : GRIPS.bagR;
    case 'stick':
      return side === 'L' ? GRIPS.stickL : GRIPS.stickR;
    case 'fruit': {
      const k = kind ?? 'mango';
      if (FRUIT[k].hang) return STALK;
      if (bigFruit(k) || action === 'pickGround') return fruitSide(k, side);
      return action === 'pickReach' ? fruitBelow(k) : fruitTop(k);
    }
  }
}

/** The pole's grips for the props (rewritten at each call). */
const PROP_POLE_GRIP = { R: grip([0, 0, POLE.gripR]), L: grip([0, 0, POLE.gripL]) };

/** What each hand holds at `t` (ACTIONS' table, a big fruit in both hands, the basket then on the ground). */
export function gardenHeld(action: GardenAction, t: number, kind: PlantKindId | null, side: 'L' | 'R'): GardenProp | null {
  const a = ACTIONS[action];
  const big = bigFruit(kind) && (action === 'pickLow' || action === 'pickReach');
  if (big && side === 'L') return propAt(a.right, t);
  return propAt(side === 'L' ? a.left : a.right, t);
}

/** The basket stands on the ground beside him (his hands hold none: a big fruit, the pole, fallen fruit). */
export function groundBasket(action: GardenAction, kind: PlantKindId | null): boolean {
  return action === 'pickGround' || ((action === 'pickLow' || action === 'pickReach') && bigFruit(kind));
}
/** Where it stands (his space, BU): on his left, a little ahead. */
const GROUND_BASKET = new Vector3(2.6, 0, 10.0);
/** …for a big fruit picked off its plant (a pumpkin, a jackfruit): closer, he lifts it in with both hands. */
const GROUND_BASKET_BIG = new Vector3(3.2, 0, 7.4);
/** Where the basket stands on the ground (his space) for the body's work: as he stepped up to it. */
export function gardenGroundBasket(w: GardenBody, out: Vector3): Vector3 {
  out.copy(w.action === 'pickGround' ? GROUND_BASKET : GROUND_BASKET_BIG);
  return out.add(approachOf(w.action, w.spot, _ab, w.kind));
}
const _ab = new Vector3();
/** Where the thrown dead plant lands (his space): on the heap to his right, as he stepped up to it. */
export function gardenStickHeap(w: GardenBody, out: Vector3): Vector3 {
  return out.copy(STICK_HEAP).add(approachOf(w.action, w.spot, _ab, w.kind));
}
/** Where the seedling, the cutting or the pup waits on the ground until he takes it (from the spot, BU). */
export const WAITING = { seedling: new Vector3(3.4, 0, -2.6), cutting: new Vector3(-3.6, 0, -3.4), pup: new Vector3(-3.8, 0, -3.2) } as const;

const DEFAULT_SPOT: Record<GardenAction, Vector3> = {
  plant: new Vector3(0, 0, GARDEN_SPOT.plant),
  plantTree: new Vector3(0, 0, GARDEN_SPOT.plantTree),
  water: new Vector3(0, 0, GARDEN_SPOT.water),
  fill: new Vector3(0, 0, GARDEN_SPOT.fill),
  pickLow: new Vector3(0.4, 4, GARDEN_SPOT.pickLow),
  pickReach: new Vector3(GARDEN_SPOT.reachX, 24.5, GARDEN_SPOT.pickReach),
  pickCut: new Vector3(-0.5, 2, GARDEN_SPOT.pickCut),
  pickPole: new Vector3(0, 66, GARDEN_SPOT.poleZ(66)),
  pickGround: new Vector3(0, 1.7, GARDEN_SPOT.pickGround),
  clear: new Vector3(0, 0, GARDEN_SPOT.clear),
};
/** A good spot for an action (checks, the viewer): as `GARDEN_SPOT` says. */
export const defaultGardenSpot = (a: GardenAction): Vector3 => DEFAULT_SPOT[a];
/** Picking a big fruit off its plant (both hands): before him, at the trunk (a jackfruit) or on the ground (a pumpkin). */
const BIG_REACH_SPOT = new Vector3(0, 18, 7.5);
/** Cutting high (a banana bunch's stalk): the stalk before his chest, the bunch hanging before his belly. */
const HIGH_CUT_SPOT = new Vector3(0, 19.5, 6.5);
/** The spot the action's pose is made for (the step up to the work makes up the rest). */
function homeSpot(a: GardenAction, kind: PlantKindId | null, spot: Vector3, out: Vector3): Vector3 {
  if (a === 'pickReach' && bigFruit(kind)) return out.copy(BIG_REACH_SPOT);
  if (a === 'pickCut') return out.lerpVectors(DEFAULT_SPOT.pickCut, HIGH_CUT_SPOT, smooth((spot.y - 6) / 9));
  return out.copy(DEFAULT_SPOT[a]);
}
/** The step to the work (BU, his space: x, z) for a spot: how far it is from where the pose wants it, at most `APPROACH_MAX`. */
function approachOf(a: GardenAction, spot: Vector3, out: Vector3, kind: PlantKindId | null = null): Vector3 {
  out.set(spot.x, 0, spot.z).sub(homeSpot(a, kind, spot, _ah).setY(0));
  const amax = APPROACH_MAX[a];
  if (out.length() > amax) out.setLength(amax);
  return out;
}
const _ah = new Vector3();

// ── The pole ────────────────────────────────────────────────────────────────

/** Where his hands are on the pole at the hook (his space): in front of his chest, up. */
const POLE_HANDS = new Vector3(-1.3, 16.2, 4.6);
/** The shaft's length (BU, from the butt to the basket's foot) for a fruit at `spot`: the basket reaches it from his hands at the hook. */
export function gardenPoleLength(spot: Vector3): number {
  const mid = (POLE.gripR + POLE.gripL) / 2;
  return Math.max(24, _a.copy(spot).sub(POLE_HANDS).length() + mid - POLE.head * 0.5);
}

/** The fists' places along the pole (from its butt, BU), and its shaft's length. */
function poleGrips(t: number, spot: Vector3): { r: number; l: number; len: number } {
  void t;
  return { r: POLE.gripR, l: POLE.gripL, len: gardenPoleLength(spot) };
}

// ── Beats ───────────────────────────────────────────────────────────────────

/** Each action's beats by name (the n-th of a name: `name`, `name2`, `name3`…). */
const BEATS = Object.fromEntries(
  (Object.keys(ACTIONS) as GardenAction[]).map((a) => {
    const by: Record<string, number> = { len: ACTIONS[a].len };
    const count: Record<string, number> = {};
    for (const b of ACTIONS[a].beats) {
      const n = (count[b.name] = (count[b.name] ?? 0) + 1);
      by[n === 1 ? b.name : `${b.name}${n}`] = b.at;
    }
    return [a, by];
  }),
) as Record<GardenAction, Record<string, number>>;
const beats = (a: GardenAction) => BEATS[a];
/** When beat `name` of `action` is (s; the n-th of a repeated one: `pat2`), or Infinity (none). */
export const gardenBeat = (action: GardenAction, name: string): number => BEATS[action][name] ?? Infinity;
/** The times of a repeated beat (the chops, the pats, the tugs). */
const times = (a: GardenAction, name: string) => ACTIONS[a].beats.filter((b) => b.name === name).map((b) => b.at);

// ── The body's shape ────────────────────────────────────────────────────────

interface Shape {
  /** Tilts (+ forward / down). */
  tilt: number;
  chest: number;
  /** The hips joint lowered and moved (BU: + down, + forward, + to his left). */
  drop: number;
  fwd: number;
  side: number;
  /** Turns (+ to his left): the hips, the chest on them; the chest's lean (+ to his right). */
  turn: number;
  twist: number;
  roll: number;
  /** Knees out (rad). */
  splay: number;
  /** The right knee down on the ground (0‥1), the heels up on his toes (0‥1). */
  kneel: number;
  toes: number;
  /** How much the head looks at the work (0 straight ahead with the chest ‥ 1). */
  look: number;
}
type ShapeKey = keyof Shape;
const STAND: Shape = { tilt: 0, chest: 0, drop: 0, fwd: 0, side: 0, turn: 0, twist: 0, roll: 0, splay: 0.03, kneel: 0, toes: 0, look: 0.35 };
const FIELDS = Object.keys(STAND) as ShapeKey[];
type Keys = readonly (readonly [number, Shape])[];
const S = (s: Partial<Shape>): Shape => ({ ...STAND, ...s });

/** The shape at `u`: a monotone cubic through the keys per value (it flows through them, never past one; at rest at the ends). */
function shapeAt(u: number, ks: Keys, out: Shape): Shape {
  const n = ks.length;
  if (u <= ks[0][0]) return Object.assign(out, ks[0][1]);
  if (u >= ks[n - 1][0]) return Object.assign(out, ks[n - 1][1]);
  let i = 0;
  while (ks[i + 1][0] < u) i++;
  const [t1, p1] = ks[i];
  const [t2, p2] = ks[i + 1];
  const p0 = i > 0 ? ks[i - 1] : null;
  const p3 = i + 2 < n ? ks[i + 2] : null;
  const h = t2 - t1;
  const a = (u - t1) / h;
  const a2 = a * a;
  const a3 = a2 * a;
  const slope = (x: number, y: number) => (x * y > 0 ? (2 * x * y) / (x + y) : 0);
  for (const f of FIELDS) {
    const v1 = p1[f];
    const v2 = p2[f];
    const d = (v2 - v1) / h;
    const m1 = p0 ? slope((v1 - p0[1][f]) / (t1 - p0[0]), d) : 0;
    const m2 = p3 ? slope(d, (p3[1][f] - v2) / (p3[0] - t2)) : 0;
    out[f] = (2 * a3 - 3 * a2 + 1) * v1 + (a3 - 2 * a2 + a) * h * m1 + (-2 * a3 + 3 * a2) * v2 + (a3 - a2) * h * m2;
  }
  return out;
}

/** Up to the hole to plant: his feet step this far forward (BU) after the hoeing. */
const STEP_IN = 6.0;
/** Hoeing: bent over the spot, the knees bent, the feet apart. */
const HOEING = S({ tilt: 0.38, chest: 0.22, drop: 1.5, fwd: -1.0, splay: 0.1, look: 1 });
const HOEING_DEEP = S({ tilt: 0.46, chest: 0.26, drop: 1.9, fwd: -1.3, splay: 0.12, look: 1 });
/** Squatting flat-footed (the Cambodian way: heels down, knees wide, leaning over the spot). */
const SQUAT = S({ tilt: 0.55, chest: 0.72, drop: 5.9, fwd: -1.7, splay: 0.45, look: 1 });
/** Kneeling on the right knee, the left foot forward flat, over the spot. */
/** Squatting to cut at a cane's foot: more upright, the knife arm free to swing. */
const CUT_SQUAT = S({ tilt: 0.36, chest: 0.3, drop: 5.6, fwd: -1.8, splay: 0.45, look: 1 });
const KNEEL = S({ tilt: 0.42, chest: 0.42, drop: 5.6, fwd: 0.4, splay: 0.14, kneel: 1, look: 1 });

/** Each action's shapes (the spot's height picks between two for some: `low` / `high`). */
const KEYS = (() => {
  const P = beats('plant');
  const T = beats('plantTree');
  const W = beats('water');
  const F = beats('fill');
  const L = beats('pickLow');
  const R = beats('pickReach');
  const C = beats('pickCut');
  const O = beats('pickPole');
  const G = beats('pickGround');
  const X = beats('clear');
  return {
    plant: [
      [0, STAND],
      [0.32, HOEING],
      [P.chop3 + 0.05, HOEING],
      [P.hoeDown, S({ tilt: 0.55, chest: 0.42, drop: 2.6, fwd: 1.0, splay: 0.16, twist: -0.22, turn: -0.08, look: 1 })],
      [P.kneel, S({ ...SQUAT, fwd: SQUAT.fwd + STEP_IN })],
      [P.pat2 + 0.08, S({ ...SQUAT, fwd: SQUAT.fwd + STEP_IN })],
      [P.up, S({ ...SQUAT, drop: 5.0, tilt: 0.42, chest: 0.36, fwd: SQUAT.fwd + STEP_IN })],
      [P.len, STAND],
    ],
    plantTree: [
      [0, STAND],
      [0.32, HOEING_DEEP],
      [T.chop4 + 0.05, HOEING_DEEP],
      [T.hoeDown, S({ tilt: 0.6, chest: 0.44, drop: 2.8, fwd: 1.0, splay: 0.16, twist: -0.22, turn: -0.08, look: 1 })],
      [T.kneel, S({ ...KNEEL, tilt: 0.55, chest: 0.72, fwd: KNEEL.fwd + STEP_IN - 1.6, twist: 0.2 })],
      [T.tear, S({ ...KNEEL, tilt: 0.32, chest: 0.36, fwd: KNEEL.fwd + STEP_IN - 1.6 })],
      [T.set, S({ ...KNEEL, tilt: 0.55, chest: 0.75, fwd: KNEEL.fwd + STEP_IN - 1.6 })],
      [T.pat2 + 0.1, S({ ...KNEEL, tilt: 0.55, chest: 0.75, fwd: KNEEL.fwd + STEP_IN - 1.6 })],
      [T.up, S({ ...KNEEL, kneel: 0.6, drop: 4.2, tilt: 0.35, chest: 0.3, fwd: KNEEL.fwd + STEP_IN - 1.6 })],
      [T.len, STAND],
    ],
    water: [
      [0, STAND],
      [W.tip, S({ tilt: 0.24, chest: 0.16, drop: 0.8, fwd: -0.6, twist: 0.12, look: 1 })],
      [W.pour, S({ tilt: 0.3, chest: 0.2, drop: 1.0, fwd: -0.7, twist: 0.16, look: 1 })],
      [W.stop, S({ tilt: 0.3, chest: 0.2, drop: 1.0, fwd: -0.7, twist: 0.16, look: 1 })],
      [W.stop + 0.3, S({ tilt: 0.12, chest: 0.08, drop: 0.5, fwd: -0.3, look: 0.8 })],
      [W.len, STAND],
    ],
    // (fill: a crouch at the jar's height, low: a squat at the stream)
    fillHigh: [
      [0, STAND],
      [F.dip, S({ tilt: 0.42, chest: 0.3, drop: 2.0, fwd: -1.2, splay: 0.12, twist: -0.12, look: 1 })],
      [F.full, S({ tilt: 0.44, chest: 0.3, drop: 2.2, fwd: -1.2, splay: 0.12, twist: -0.12, look: 1 })],
      [F.lift, S({ tilt: 0.36, chest: 0.24, drop: 1.8, fwd: -1.0, splay: 0.1, twist: -0.1, look: 1 })],
      [F.len, STAND],
    ],
    fillLow: [
      [0, STAND],
      [F.dip, S({ ...SQUAT, chest: 0.82, twist: -0.18, splay: 0.45 })],
      [F.full, S({ ...SQUAT, chest: 0.84, twist: -0.18, splay: 0.45 })],
      [F.lift, S({ ...SQUAT, chest: 0.8, twist: -0.14, splay: 0.45 })],
      [F.len, STAND],
    ],
    pickLowHigh: [
      [0, STAND],
      [L.grip, S({ tilt: 0.72, chest: 0.55, drop: 3.2, fwd: -1.7, splay: 0.2, look: 1 })],
      [L.take, S({ tilt: 0.7, chest: 0.52, drop: 3.1, fwd: -1.7, splay: 0.2, look: 1 })],
      [L.basket, S({ tilt: 0.5, chest: 0.42, drop: 2.4, fwd: -1.3, splay: 0.14, twist: 0.12, look: 1 })],
      [L.len, STAND],
    ],
    pickLowLow: [
      [0, STAND],
      [L.grip, SQUAT],
      [L.take, S({ ...SQUAT, chest: 0.45 })],
      [L.basket, S({ ...SQUAT, drop: 5.0, tilt: 0.5, chest: 0.62, twist: 0.18 })],
      [L.len, STAND],
    ],
    pickReach: [
      [0, STAND],
      [R.grip, S({ tilt: -0.06, chest: -0.1, drop: -0.2, look: 1, toes: 1 })],
      [R.take, S({ tilt: -0.02, chest: -0.06, drop: 0.3, look: 1, toes: 0.4 })],
      [R.basket, S({ tilt: 0.22, chest: 0.22, drop: 0.8, fwd: -0.4, twist: 0.16, look: 1 })],
      [R.len, STAND],
    ],
    // (a big fruit off the trunk in both hands: knees bent for its weight, then down into the basket)
    pickReachBig: [
      [0, STAND],
      [R.grip, S({ tilt: 0.2, chest: 0.12, drop: 0.8, fwd: -0.3, look: 1 })],
      [R.take, S({ tilt: 0.2, chest: 0.1, drop: 1.5, fwd: -0.5, look: 1 })],
      [R.basket, S({ tilt: 0.62, chest: 0.5, drop: 3.4, fwd: -1.4, splay: 0.2, twist: 0.2, look: 1 })],
      [R.len, STAND],
    ],
    pickCutLow: [
      [0, STAND],
      [C.cut - 0.25, S({ ...CUT_SQUAT, twist: -0.1 })],
      [C.cut2, S({ ...CUT_SQUAT, twist: -0.06 })],
      [C.take, S({ ...SQUAT, drop: 5.4, tilt: 0.52, chest: 0.72 })],
      [C.basket, S({ ...SQUAT, drop: 5.0, tilt: 0.5, chest: 0.7, twist: 0.3 })],
      [C.len, STAND],
    ],
    pickCutHigh: [
      [0, STAND],
      [C.cut - 0.25, S({ tilt: 0.08, chest: 0.04, drop: 0.3, twist: -0.06, look: 1 })],
      [C.cut2, S({ tilt: 0.08, chest: 0.04, drop: 0.3, twist: -0.06, look: 1 })],
      [C.take, S({ tilt: 0.04, chest: 0.0, drop: 0.6, look: 1 })],
      [C.basket, S({ tilt: 0.3, chest: 0.24, drop: 1.4, fwd: -0.6, twist: 0.3, turn: 0.1, look: 1 })],
      [C.len, STAND],
    ],
    pickPole: [
      [0, STAND],
      [O.raise, S({ tilt: 0.04, chest: 0.02, drop: 0.7, fwd: -0.3, twist: -0.18, look: 1 })],
      [O.hook, S({ tilt: 0.04, chest: 0.0, drop: 0.8, fwd: -0.3, twist: -0.2, look: 1 })],
      [O.take, S({ tilt: 0.06, chest: 0.02, drop: 1.2, fwd: -0.5, twist: -0.16, look: 1 })],
      [O.down, S({ tilt: 0.14, chest: 0.1, drop: 1.4, fwd: -0.6, twist: 0.2, look: 1 })],
      [O.basket, S({ tilt: 0.22, chest: 0.14, drop: 1.6, fwd: -0.7, twist: 0.26, look: 1 })],
      [O.len, STAND],
    ],
    pickGround: [
      [0, STAND],
      [G.grip, SQUAT],
      [G.take, SQUAT],
      [G.take + 0.35, S({ ...SQUAT, drop: 5.0, tilt: 0.45, chest: 0.55, twist: 0.12 })],
      [G.basket, S({ ...SQUAT, drop: 5.4, tilt: 0.58, chest: 0.84, twist: 0.12 })],
      [G.len, STAND],
    ],
    clear: [
      [0, STAND],
      [X.grip, S({ tilt: 0.6, chest: 0.8, drop: 5.6, fwd: -1.8, splay: 0.45, look: 1 })],
      [X.tug2 + 0.12, S({ tilt: 0.58, chest: 0.78, drop: 5.4, fwd: -1.8, splay: 0.45, look: 1 })],
      [X.out, S({ tilt: 0.42, chest: 0.36, drop: 3.4, fwd: -1.8, splay: 0.3, look: 1 })],
      [X.toss - 0.12, S({ tilt: 0.2, chest: 0.1, drop: 1.4, fwd: -1.0, twist: 0.2, turn: 0.1, splay: 0.12, look: 1 })],
      [X.toss, S({ tilt: 0.16, chest: 0.06, drop: 1.0, fwd: -0.6, twist: -0.42, turn: -0.2, splay: 0.1, look: 0.6 })],
      [X.len, STAND],
    ],
  } satisfies Record<string, Keys>;
})();

// ── The feet ────────────────────────────────────────────────────────────────

/** A step: `side`'s foot from where it stands to `x`, `z` (BU from its rest place), between `t0` and `t1`. */
type Step = readonly [side: 'L' | 'R', t0: number, t1: number, x: number, z: number];

const STEPS: Record<GardenAction, readonly Step[]> = (() => {
  const P = beats('plant');
  const T = beats('plantTree');
  const W = beats('water');
  const O = beats('pickPole');
  const X = beats('clear');
  return {
    // (feet apart to hoe; back together as he stands)
    // (feet apart to hoe; up to the hole to squat at it; back as he stands)
    plant: [
      ['L', 0.02, 0.28, 1.1, 0.6],
      ['R', 0.12, 0.38, -1.0, -0.4],
      ['L', P.hoeDown - 0.12, P.hoeDown + 0.16, 1.5, STEP_IN + 0.3],
      ['R', P.hoeDown + 0.1, P.kneel - 0.04, -1.5, STEP_IN - 0.3],
      ['L', P.up + 0.05, P.up + 0.32, 0, 0],
      ['R', P.up + 0.24, P.len - 0.04, 0, 0],
    ],
    // (apart to hoe; the left foot forward to kneel on the right knee; back)
    plantTree: [
      ['L', 0.02, 0.28, 1.1, 0.6],
      ['R', 0.12, 0.38, -1.0, -0.6],
      ['L', T.hoeDown - 0.12, T.hoeDown + 0.16, 1.2, STEP_IN + 2.0],
      ['R', T.hoeDown + 0.1, T.kneel - 0.12, -1.6, STEP_IN - 1.0],
      ['L', T.up + 0.08, T.up + 0.38, 0, 0],
      ['R', T.up + 0.3, T.len - 0.04, 0, 0],
    ],
    water: [['L', 0.05, 0.32, 0.4, 1.6], ['L', W.stop + 0.3, W.len - 0.1, 0, 0]],
    fill: [['L', 0.05, 0.3, 0.9, 0.4], ['R', 0.12, 0.38, -0.8, -0.2], ['L', 2.15, 2.4, 0, 0], ['R', 2.3, 2.56, 0, 0]],
    pickLow: [['L', 0.05, 0.3, 0.9, 0.3], ['R', 0.12, 0.36, -0.8, -0.3], ['L', 1.85, 2.1, 0, 0], ['R', 2.05, 2.34, 0, 0]],
    pickReach: [['L', 0.04, 0.3, 0.3, 1.2], ['L', 1.75, 2.1, 0, 0]],
    pickCut: [['L', 0.05, 0.3, 0.9, 0.6], ['R', 0.12, 0.36, -0.8, -0.4], ['L', 2.3, 2.55, 0, 0], ['R', 2.45, 2.74, 0, 0]],
    pickPole: [['L', 0.05, 0.35, 0.5, 1.8], ['L', O.len - 0.4, O.len - 0.08, 0, 0]],
    pickGround: [['L', 0.05, 0.3, 1.0, 0.3], ['R', 0.12, 0.36, -0.9, -0.3], ['L', 1.85, 2.1, 0, 0], ['R', 2.05, 2.34, 0, 0]],
    clear: [['L', 0.05, 0.3, 1.0, 0.8], ['R', 0.12, 0.36, -1.0, -0.6], ['L', X.toss + 0.1, X.toss + 0.36, 0, 0], ['R', X.toss + 0.26, X.len - 0.04, 0, 0]],
  };
})();
/** A foot lifted this high (BU) in a step. */
const LIFT = 1.2;

// ── Scalars ─────────────────────────────────────────────────────────────────

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (u: number) => {
  const c = clamp(u, 0, 1);
  return c * c * (3 - 2 * c);
};
/** Ease in only (a swing gathering speed to its strike). */
const easeIn = (u: number) => {
  const c = clamp(u, 0, 1);
  return c * c * c;
};
/** Ease out only (a lift slowing to its top). */
const easeOut = (u: number) => 1 - easeIn(1 - u);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
/** 0 → 1 over a‥b, 1 → 0 over c‥d. */
const window4 = (t: number, a: number, b: number, c: number, d: number) => smooth((t - a) / (b - a)) * (1 - smooth((t - c) / (d - c)));
/** 0‥1 of the way from t0 to t1, eased. */
const seg = (t: number, t0: number, t1: number) => smooth((t - t0) / (t1 - t0));

// ── Skeleton numbers ────────────────────────────────────────────────────────

const P = (n: JointName) => new Vector3(...JOINTS[n].pivot);
const HIPS_P = P('hips');
const CHEST_L = P('chest').sub(HIPS_P);
const HIP_L = { L: P('hipL').sub(HIPS_P), R: P('hipR').sub(HIPS_P) };
const THIGH_V = P('kneeL').sub(P('hipL'));
const SHIN_V = P('ankleL').sub(P('kneeL'));
const THIGH = THIGH_V.length();
const SHIN = SHIN_V.length();
const SHIN_LEAN = Math.atan2(-SHIN_V.z, -SHIN_V.y);
const ANKLE_REST = { L: P('ankleL'), R: P('ankleR') };
const NECK_L = P('neck').sub(P('chest'));
const HEAD_L = P('head').sub(P('neck'));
/** The eyes from the head joint (BU): where he looks from. */
const EYES = new Vector3(0, 3.2, 3.2);
/** The arms (chest space): shoulder, upper arm, elbow → wrist, wrist → the fist's middle. */
const ARM = {
  L: { shoulder: P('shoulderL').sub(P('chest')), upper: P('elbowL').sub(P('shoulderL')), wrist: P('wristL').sub(P('elbowL')), fist: P('propL').sub(P('wristL')) },
  R: { shoulder: P('shoulderR').sub(P('chest')), upper: P('elbowR').sub(P('shoulderR')), wrist: P('wristR').sub(P('elbowR')), fist: P('propR').sub(P('wristR')) },
};
/** The ball of the foot (ankle space): on his toes the heel lifts about it. */
const BALL = new Vector3(0, -2.0, 3.0);
/** Kneeling: the right knee's front on the ground, the foot laid back behind it, its sole up (this far turned over). */
const KNEEL_TOES = Math.PI - 0.12;

// (scratch: used at once)
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _v = new Vector3();
const _w = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _m3 = new Matrix4();
const ONE = new Vector3(1, 1, 1);
const _shape: Shape = { ...STAND };
const _shape2: Shape = { ...STAND };
const _item = new Matrix4();
const _item2 = new Matrix4();
const _hipsM = new Matrix4();
const _chestM = new Matrix4();
const _chestInv = new Matrix4();
const _chestQInv = new Quaternion();

// ── Frames ──────────────────────────────────────────────────────────────────

const _fx = new Vector3();
const _fy = new Vector3();
const _fz = new Vector3();
/** A frame (rotation + place) from its +z and a hint for +y (any of the arguments may be the module's scratch vectors). */
function frameZY(pos: Vector3, z: Vector3, yHint: Vector3, out: Matrix4): Matrix4 {
  _fz.copy(z).normalize();
  _fy.copy(yHint).addScaledVector(_fz, -yHint.dot(_fz));
  if (_fy.lengthSq() < 1e-8) _fy.set(0, 1, 0).addScaledVector(_fz, -_fz.y);
  _fy.normalize();
  _fx.crossVectors(_fy, _fz);
  out.makeBasis(_fx, _fy, _fz);
  return out.setPosition(pos);
}
/** A frame from its +y and a hint for +z. */
function frameYZ(pos: Vector3, y: Vector3, zHint: Vector3, out: Matrix4): Matrix4 {
  _fy.copy(y).normalize();
  _fz.copy(zHint).addScaledVector(_fy, -zHint.dot(_fy));
  if (_fz.lengthSq() < 1e-8) _fz.set(0, 0, 1);
  _fz.normalize();
  _fx.crossVectors(_fy, _fz);
  out.makeBasis(_fx, _fy, _fz);
  return out.setPosition(pos);
}
/** An upright frame turned `yaw` (about +y) and tipped `pitch` (+: its +z down), at `pos`. */
function frameYawPitch(pos: Vector3, yaw: number, pitch: number, out: Matrix4): Matrix4 {
  _q.setFromEuler(_e.set(pitch, yaw, 0, 'YXZ'));
  return out.compose(pos, _q, ONE);
}

const GRIP_M = new Map<Grip, Matrix4>();
/** Grips that change (the pole's, as it slides through his hands): made fresh each time, never kept. */
const LIVE_GRIPS = new WeakSet<Grip>();
const _gm = new Matrix4();
/** A grip as a matrix (the fist in the item's frame): use it at once (a live grip's is a scratch matrix). */
function gripMatrix(g: Grip): Matrix4 {
  let m = GRIP_M.get(g);
  if (m) return m;
  _fx.set(...g.x);
  _fy.set(...g.y);
  _fz.crossVectors(_fx, _fy);
  m = LIVE_GRIPS.has(g) ? _gm : new Matrix4();
  m.makeBasis(_fx, _fy, _fz).setPosition(g.at[0], g.at[1], g.at[2]);
  if (!LIVE_GRIPS.has(g)) GRIP_M.set(g, m);
  return m;
}

// ── Hands ───────────────────────────────────────────────────────────────────

/** A hand's target: the fist's frame in his space, how far it is on (0 hanging free ‥ 1), the elbow's way (his space). */
interface Hand {
  m: Matrix4;
  w: number;
  pole: Vector3;
  /** The wrist turned to the frame (1) or left as the arm leaves it (0). */
  turn: number;
  /** The left hand on what the right one holds: it goes where the thing really is, the right fist as posed times `rel`. */
  follow: boolean;
  rel: Matrix4;
}
const HANDS: Record<'L' | 'R', Hand> = {
  L: { m: new Matrix4(), w: 0, pole: new Vector3(), turn: 1, follow: false, rel: new Matrix4() },
  R: { m: new Matrix4(), w: 0, pole: new Vector3(), turn: 1, follow: false, rel: new Matrix4() },
};
/** Elbows down and out (his space), a little back. */
const POLE_DOWN = { L: new Vector3(0.75, -1, -0.3).normalize(), R: new Vector3(-0.75, -1, -0.3).normalize() };
/** Elbows back and a little out (a forearm held out forward: the knife). */
const POLE_BACK = { L: new Vector3(0.4, -0.5, -1).normalize(), R: new Vector3(-0.4, -0.5, -1).normalize() };
/** Elbows out (arms raised: the pole, reaching up). */
const POLE_OUT = { L: new Vector3(1, -0.35, -0.2).normalize(), R: new Vector3(-1, -0.35, -0.2).normalize() };

function setHand(side: 'L' | 'R', m: Matrix4, w = 1, pole = POLE_DOWN[side], turn = 1): void {
  const h = HANDS[side];
  h.m.copy(m);
  h.w = w;
  h.pole.copy(pole);
  h.turn = turn;
  h.follow = false;
}
/**
 * Both hands on one thing (it is carried in the right fist): the right on its grip, the left on its own, going
 * where the thing really is once the right arm is posed (a right wrist that cannot turn all the way turns the thing).
 */
function bothOn(item: Matrix4, gR: Grip, gL: Grip, wR = 1, wL = 1, poleR = POLE_DOWN.R, poleL = POLE_DOWN.L, turnR = 1): void {
  onItem('R', item, gR, wR, poleR);
  HANDS.R.turn = turnR;
  onItem('L', item, gL, wL, poleL);
  const L = HANDS.L;
  L.follow = true;
  L.rel.copy(gripMatrix(gR)).invert().multiply(gripMatrix(gL));
}
/** A hand on an item: the item's frame times the grip. */
function onItem(side: 'L' | 'R', item: Matrix4, g: Grip, w = 1, pole = POLE_DOWN[side]): void {
  setHand(side, _m3.multiplyMatrices(item, gripMatrix(g)), w, pole);
}
function freeHand(side: 'L' | 'R'): void {
  HANDS[side].w = 0;
  HANDS[side].follow = false;
}
/** A hand resting on the thigh above the knee (leaning over the work). */
function onThigh(side: 'L' | 'R', w = 1): void {
  const sg = side === 'L' ? 1 : -1;
  // (a little above the knee, on its top and outside: from the knee toward the hip)
  _v.copy(KNEE[side]).lerp(_w.copy(HIP_L[side]).applyMatrix4(_hipsM), 0.3).add(_c.set(sg * 0.9, 1.7, 0.6));
  setHand(side, _m3.makeRotationY(-sg * 0.35).setPosition(_v), w, POLE_DOWN[side], REST_TURN);
}
/** A resting hand's wrist goes this far to its frame (the rest as the arm leaves it). */
const REST_TURN = 0.3;
/** A fist resting on his knee (the knee joint's place `knee`, his space). */
function onKnee(side: 'L' | 'R', knee: Vector3, w = 1): void {
  if (w > 0) setHand(side, kneeFrame(side, knee, _m3), w, POLE_DOWN[side], REST_TURN);
}

// ── The pose ────────────────────────────────────────────────────────────────

/** Where the knees are this frame (his space), for hands resting on them. */
const KNEE = { L: new Vector3(), R: new Vector3() };
/** How far (BU) each fist fell short of its target in the last pose (checks: out of reach), and the targets and shoulders (his space). */
export const GARDEN_REACH = { L: 0, R: 0, target: { L: new Vector3(), R: new Vector3() }, shoulder: { L: new Vector3(), R: new Vector3() } };

/** His pose for the body's action at its time. */
export function gardenPose(w: GardenBody): Pose {
  const a = w.action;
  const t = clamp(w.t, 0, ACTIONS[a].len);
  const sp = workSpot(w, _spot);
  const sh = bodyShape(a, t, sp, w.kind, _shape);
  // (breathing, a slow sway while working)
  const work = window4(t, 0, 0.4, ACTIONS[a].len - 0.4, ACTIONS[a].len);
  sh.chest += Math.sin(w.life * 1.9) * 0.016 * work;
  dips(a, t, sh);
  // (stepped up to the work: the body goes with the feet)
  approachOf(a, sp, _approach, w.kind);
  const ak = approachK(a, t);
  _ap.copy(_approach).multiplyScalar(ak);
  sh.fwd += _approach.z * ak;
  sh.side += _approach.x * ak;

  const pose: Pose = {
    hips: { rx: sh.tilt, ry: sh.turn, px: sh.side, py: -sh.drop, pz: sh.fwd },
    chest: { rx: sh.chest, ry: sh.twist, rz: sh.roll },
  };
  _hipsM.compose(_a.set(HIPS_P.x + sh.side, HIPS_P.y - sh.drop, HIPS_P.z + sh.fwd), _q.setFromEuler(_e.set(sh.tilt, sh.turn, 0)), ONE);
  _chestM.multiplyMatrices(_hipsM, _m.compose(CHEST_L, _q.setFromEuler(_e.set(sh.chest, sh.twist, sh.roll)), ONE));
  _chestInv.copy(_chestM).invert();
  _q.setFromRotationMatrix(_chestM);
  _chestQInv.copy(_q).invert();

  legs(a, t, sh, pose);
  hands(w, t, sp);
  arm('R', pose);
  if (HANDS.L.follow && HANDS.R.w > 0.001) HANDS.L.m.multiplyMatrices(fistFrame(pose, 'R', _m), HANDS.L.rel);
  arm('L', pose);
  look(a, t, sp, sh.look, pose);
  return pose;
}

const _spot = new Vector3();
/** A low fruit's height (BU) when the spot given is the plant's foot (y ≈ 0): where it hangs on its plant. */
const LOW_FRUIT_Y: Partial<Record<PlantKindId, number>> = { eggplant: 4.5, pumpkin: 1.8 };
/**
 * The spot as the poses use it: a fruit picked up off the ground is held by its middle (never under the ground); a
 * low fruit given at its plant's foot is where it hangs.
 */
function workSpot(w: GardenBody, out: Vector3): Vector3 {
  out.copy(w.spot);
  const k = w.kind;
  if (w.action === 'pickGround') out.y = Math.max(out.y, FRUIT[k ?? 'durian'].h / 2);
  if (w.action === 'pickLow' && out.y < 0.5) out.y = (k && LOW_FRUIT_Y[k]) ?? 3;
  return out;
}

/** The body's shape for the action at `t` (some by the spot's height). */
function bodyShape(a: GardenAction, t: number, sp: Vector3, kind: PlantKindId | null, out: Shape): Shape {
  switch (a) {
    case 'pickReach':
      return shapeAt(t, bigFruit(kind) ? KEYS.pickReachBig : KEYS.pickReach, out);
    case 'fill': {
      const k = smooth((7 - sp.y) / 6);
      return blendShapes(t, KEYS.fillHigh, KEYS.fillLow, k, out);
    }
    case 'pickLow': {
      const k = smooth((4.5 - sp.y) / 2.5);
      return blendShapes(t, KEYS.pickLowHigh, KEYS.pickLowLow, k, out);
    }
    case 'pickCut': {
      const k = smooth((sp.y - 6) / 9);
      return blendShapes(t, KEYS.pickCutLow, KEYS.pickCutHigh, k, out);
    }
    default:
      return shapeAt(t, KEYS[a], out);
  }
}
function blendShapes(t: number, a: Keys, b: Keys, k: number, out: Shape): Shape {
  shapeAt(t, a, out);
  if (k <= 0) return out;
  shapeAt(t, b, _shape2);
  for (const f of FIELDS) out[f] = mix(out[f], _shape2[f], k);
  return out;
}

/** The body going with the hoe's strokes, the tugs, the pats (added to the shape). */
function dips(a: GardenAction, t: number, sh: Shape): void {
  if (a === 'plant' || a === 'plantTree') {
    const deep = a === 'plantTree' ? 1.3 : 1;
    for (const at of times(a, 'chop')) {
      // (up with the hoe, then down into the stroke)
      const up = window4(t, at - 0.3, at - 0.18, at - 0.16, at - 0.06);
      const hit = window4(t, at - 0.08, at, at + 0.06, at + 0.24);
      sh.tilt += (0.14 * hit - 0.1 * up) * deep;
      sh.chest += (0.08 * hit - 0.1 * up) * deep;
      sh.drop += (0.5 * hit - 0.2 * up) * deep;
    }
    for (const at of times(a, 'pat')) {
      const p = window4(t, at - 0.12, at, at + 0.02, at + 0.16);
      sh.tilt += 0.05 * p;
      sh.chest += 0.04 * p;
    }
  } else if (a === 'clear') {
    for (const at of times(a, 'tug')) {
      // (leaning back hard, up out of the knees)
      const p = window4(t, at - 0.16, at, at + 0.05, at + 0.3);
      sh.tilt -= 0.12 * p;
      sh.chest -= 0.08 * p;
      sh.drop -= 0.35 * p;
      sh.fwd -= 0.35 * p;
    }
  }
}

// ── Legs ────────────────────────────────────────────────────────────────────

const _foot = { L: new Vector3(), R: new Vector3() };
const _lift = { L: 0, R: 0 };

/** Where each foot stands at `t` (ankle place, his space) and how high it is lifted. */
function feet(a: GardenAction, t: number): void {
  const len = ACTIONS[a].len;
  for (const side of ['L', 'R'] as const) {
    const f = _foot[side];
    f.copy(ANKLE_REST[side]);
    _lift[side] = 0;
    let fx = 0;
    let fz = 0;
    for (const [s, t0, t1, x, z] of STEPS[a]) {
      if (s !== side || t < t0) continue;
      const u = clamp((t - t0) / (t1 - t0), 0, 1);
      const e = smooth(u);
      if (t <= t1) _lift[side] = LIFT * Math.sin(Math.PI * u);
      fx = mix(fx, x, e);
      fz = mix(fz, z, e);
    }
    // (up to the work and back: a step in at the start, a step back at the end)
    const [i0, i1, o0, o1] = APPROACH_STEPS[side];
    const ui = clamp((t - i0) / (i1 - i0), 0, 1);
    const uo = clamp((t - (len - o0)) / (o0 - o1), 0, 1);
    const k = smooth(ui) * (1 - smooth(uo));
    if (_approach.lengthSq() > 0.01) _lift[side] = Math.max(_lift[side], LIFT * (Math.sin(Math.PI * ui) + Math.sin(Math.PI * uo)));
    f.x += fx + _approach.x * k;
    f.z += fz + _approach.z * k;
  }
}

/**
 * The step to the work (BU, his space: x, z): how far the spot is from where the action's pose wants it, at most
 * `APPROACH_MAX` (pickPole: none, the pole reaches). Set by `gardenPose`.
 */
const _approach = new Vector3();
/** …as far as he has stepped now (the body's offset at `t`): what the hands' places in his space go with. */
const _ap = new Vector3();
/** A place in his space as it goes with the step up to the work. */
const rel = (v: Vector3, out: Vector3) => out.copy(v).add(_ap);
const _rel = new Vector3();
const APPROACH_MAX: Record<GardenAction, number> = { plant: 6, plantTree: 6, water: 6, fill: 4, pickLow: 7, pickReach: 7, pickCut: 7, pickPole: 0, pickGround: 7, clear: 7 };
/** The feet's steps to the work and back (s): in from‥to after the start, back from‥to before the end. */
const APPROACH_STEPS = { L: [0.02, 0.26, 0.5, 0.27], R: [0.1, 0.34, 0.31, 0.06] } as const;
/** How far through the step in (and back out) the body is at `t` (0‥1). */
function approachK(a: GardenAction, t: number): number {
  const len = ACTIONS[a].len;
  return smooth((t - 0.04) / 0.28) * (1 - smooth((t - (len - 0.46)) / 0.38));
}

function legs(a: GardenAction, t: number, sh: Shape, pose: Pose): void {
  feet(a, t);
  const hipsQ = _qh.setFromRotationMatrix(_hipsM);
  const hipsInv = _qhi.copy(hipsQ).invert();
  for (const side of ['L', 'R'] as const) {
    const sg = side === 'L' ? 1 : -1;
    const hip = _a.copy(HIP_L[side]).applyMatrix4(_hipsM);
    const kneel = side === 'R' ? sh.kneel : 0;
    // The ankle's target and the foot's turn (his space): flat, on its toes (the heel up about the ball), or kneeling.
    const tip = sh.toes * 0.5;
    const toes = tip + kneel * KNEEL_TOES;
    const ankle = _b.copy(_foot[side]);
    ankle.y += _lift[side];
    if (tip > 0.001) {
      // (the heel lifts about the ball: the ankle goes up and forward)
      _v.copy(BALL).applyAxisAngle(_ax, tip);
      ankle.add(_c.copy(BALL).sub(_v).setX(0));
    }
    // (kneeling: the foot goes back behind the knee, the shin along the ground, the top of the foot on it, its sole up)
    if (kneel > 0) ankle.lerp(_c.set(ankle.x, ANKLE_REST[side].y + KNEEL_UP, hip.z - KNEEL_BACK), kneel);
    const yaw = sg * (0.08 + sh.splay * 0.35) + sh.turn * 0.4;
    // The knee's way: forward and out (kneeling: down).
    const pole = _c.set(sg * (0.15 + sh.splay * 1.4), -0.15 - 1.2 * kneel, 1).applyAxisAngle(_ay, yaw * 0.8);
    // Two-bone IK in the hips' frame.
    const d = _d.subVectors(ankle, hip).applyQuaternion(hipsInv);
    pole.applyQuaternion(hipsInv);
    const len = clamp(d.length(), Math.abs(THIGH - SHIN) + 0.02, THIGH + SHIN - 0.02);
    const knee = Math.acos(clamp((len * len - THIGH * THIGH - SHIN * SHIN) / (2 * THIGH * SHIN), -1, 1)) - SHIN_LEAN;
    // The leg's line and the knee's way, at rest (the thigh, the shin bent by `knee`) and as wanted: the hip's turn maps one on the other.
    _v.copy(SHIN_V).applyAxisAngle(_ax, knee).add(THIGH_V);
    frameAB(_v, THIGH_V, _m);
    frameAB(d, pole, _m2);
    _m2.multiply(_m.transpose());
    _e.setFromRotationMatrix(_m2, 'XYZ');
    pose[`hip${side}`] = { rx: _e.x, ry: _e.y, rz: _e.z };
    pose[`knee${side}`] = { rx: knee };
    // The foot: flat and turned out a little (or on its toes), whatever the leg's turn.
    const hipQ = _qj.setFromRotationMatrix(_m2);
    const chain = _q.copy(hipsQ).multiply(hipQ).multiply(_qk.setFromAxisAngle(_ax, knee));
    chain.invert().multiply(_qf.setFromEuler(_e.set(toes, yaw, 0, 'YXZ')));
    _e.setFromQuaternion(chain, 'XYZ');
    pose[`ankle${side}`] = { rx: _e.x, ry: _e.y, rz: _e.z };
    // (where the knee is, for a hand resting on it)
    KNEE[side].copy(THIGH_V).applyQuaternion(hipQ).applyQuaternion(hipsQ).add(hip);
  }
}
const _qf = new Quaternion();
const _qh = new Quaternion();
const _qhi = new Quaternion();
const _qj = new Quaternion();
const _qk = new Quaternion();
const _ax = new Vector3(1, 0, 0);
const _ay = new Vector3(0, 1, 0);
/** Kneeling, the right ankle goes this far behind the hip joint and this much lower than standing (BU): the foot laid back. */
const KNEEL_BACK = 4.8;
const KNEEL_UP = -0.9;
/** An orthonormal frame (as columns): `a` its first axis, `b`'s part across it the second. */
function frameAB(a: Vector3, b: Vector3, out: Matrix4): Matrix4 {
  _x.copy(a).normalize();
  _y.copy(b).addScaledVector(_x, -b.dot(_x)).normalize();
  _z.crossVectors(_x, _y);
  return out.makeBasis(_x, _y, _z);
}

// ── Arms ────────────────────────────────────────────────────────────────────

const _target = new Vector3();
const _aim = new Vector3();
const _got = new Vector3();
const _fq = new Quaternion();
const _mf = new Matrix4();
const _mw = new Matrix4();
const _pole = new Vector3();
const _shrug = new Vector3();
/** An arm's reach (BU): the shoulder to the fist's middle, straight. */
const ARM_LEN = ARM.L.upper.length() + ARM.L.wrist.length() + ARM.L.fist.length();
/** How far a reaching shoulder comes toward its target (BU). */
const SHRUG_MAX = 1.3;
/** The arm hanging free (no target): a little out and forward, the elbow soft. */
const FREE = { shoulder: 0.06, out: 0.08, elbow: -0.18 };

function arm(side: 'L' | 'R', pose: Pose): void {
  const h = HANDS[side];
  const sg = side === 'L' ? 1 : -1;
  const free: Pose = {
    [`shoulder${side}`]: { rx: FREE.shoulder, rz: sg * FREE.out },
    [`elbow${side}`]: { rx: FREE.elbow },
    [`wrist${side}`]: {},
  };
  if (h.w <= 0.001) {
    Object.assign(pose, free);
    GARDEN_REACH[side] = 0;
    return;
  }
  // The fist's place and turn in chest space.
  GARDEN_REACH.target[side].setFromMatrixPosition(h.m);
  GARDEN_REACH.shoulder[side].copy(ARM[side].shoulder).applyMatrix4(_chestM);
  _target.setFromMatrixPosition(h.m).applyMatrix4(_chestInv);
  _fq.setFromRotationMatrix(h.m).premultiply(_chestQInv);
  _pole.copy(h.pole).applyQuaternion(_chestQInv);
  // (out of reach: the shoulder comes forward toward it a little, as a reaching shoulder does)
  _shrug.copy(_target).sub(ARM[side].shoulder);
  const need = _shrug.length() - (ARM_LEN - 0.2);
  if (need > 0) {
    _shrug.setLength(Math.min(need, SHRUG_MAX));
    _shrug.y = clamp(_shrug.y, -0.6, 0.9);
  } else _shrug.set(0, 0, 0);
  const ik = armTo(side, _target, _fq, _pole, h.turn, _shrug);
  // (a hand only partly on its target is not short of it)
  if (h.w < 0.9) GARDEN_REACH[side] = 0;
  for (const j of [`shoulder${side}`, `elbow${side}`, `wrist${side}`] as JointName[]) {
    const p = free[j] ?? {};
    const q = ik[j] ?? {};
    pose[j] = {
      rx: mix(p.rx ?? 0, q.rx ?? 0, h.w),
      ry: mix(p.ry ?? 0, q.ry ?? 0, h.w),
      rz: mix(p.rz ?? 0, q.rz ?? 0, h.w),
      px: (q.px ?? 0) * h.w,
      py: (q.py ?? 0) * h.w,
      pz: (q.pz ?? 0) * h.w,
    };
  }
}

/** Forearm rotation (chest space) of an arm posed by `solveArm`. */
function forearm(pose: Pose, side: 'L' | 'R', out: Matrix4): Matrix4 {
  const s = pose[`shoulder${side}`]!;
  out.makeRotationFromEuler(_e.set(s.rx ?? 0, s.ry ?? 0, s.rz ?? 0, 'XYZ'));
  return out.multiply(_mw.makeRotationX(pose[`elbow${side}`]!.rx ?? 0));
}
/** The wrist that turns the fist to `quat` (chest space). */
function wristTo(pose: Pose, side: 'L' | 'R', quat: Quaternion, k: number): JointPose {
  const fore = forearm(pose, side, _mf).transpose();
  _q.setFromRotationMatrix(fore.multiply(_mw.makeRotationFromQuaternion(quat)));
  if (k < 1) _q.slerp(_q2.identity(), 1 - k);
  _e.setFromQuaternion(_q, 'XYZ');
  return { rx: _e.x, ry: _e.y, rz: _e.z };
}
/** The fist's middle (chest space) for the arm joints `pose`. */
function fistAt(pose: Pose, side: 'L' | 'R', out: Vector3): Vector3 {
  const A = ARM[side];
  const sj = pose[`shoulder${side}`] ?? {};
  const wj = pose[`wrist${side}`] ?? {};
  const fore = forearm(pose, side, _mf);
  out.copy(A.fist).applyMatrix4(_mw.makeRotationFromEuler(_e.set(wj.rx ?? 0, wj.ry ?? 0, wj.rz ?? 0))).add(A.wrist).applyMatrix4(fore);
  _v.copy(A.upper).applyMatrix4(_mw.makeRotationFromEuler(_e.set(sj.rx ?? 0, sj.ry ?? 0, sj.rz ?? 0)));
  return out.add(_v).add(A.shoulder).add(_w.set(sj.px ?? 0, sj.py ?? 0, sj.pz ?? 0));
}
/** The fist's frame (his space) for the arm joints `pose` (the chest as posed). */
function fistFrame(pose: Pose, side: 'L' | 'R', out: Matrix4): Matrix4 {
  const A = ARM[side];
  const sj = pose[`shoulder${side}`] ?? {};
  const ej = pose[`elbow${side}`] ?? {};
  const wj = pose[`wrist${side}`] ?? {};
  out.copy(_chestM);
  out.multiply(_mf.compose(_v.copy(A.shoulder).add(_w.set(sj.px ?? 0, sj.py ?? 0, sj.pz ?? 0)), _q.setFromEuler(_e.set(sj.rx ?? 0, sj.ry ?? 0, sj.rz ?? 0)), ONE));
  out.multiply(_mf.compose(A.upper, _q.setFromEuler(_e.set(ej.rx ?? 0, 0, 0)), ONE));
  out.multiply(_mf.compose(A.wrist, _q.setFromEuler(_e.set(wj.rx ?? 0, wj.ry ?? 0, wj.rz ?? 0)), ONE));
  return out.multiply(_mf.makeTranslation(A.fist));
}

/** Arm IK to the fist's place and turn (chest space): solve, turn the wrist, solve again by what the turn moved the fist. */
function armTo(side: 'L' | 'R', pos: Vector3, quat: Quaternion, pole: Vector3, turn: number, shrug: Vector3): Pose {
  _aim.copy(pos);
  let pose = solveArm(side, _aim, pole, shrug);
  for (let i = 0; i < 5; i++) {
    pose[`wrist${side}`] = wristTo(pose, side, quat, turn);
    _aim.add(_got.subVectors(pos, fistAt(pose, side, _got)));
    pose = solveArm(side, _aim, pole, shrug);
  }
  pose[`wrist${side}`] = wristTo(pose, side, quat, turn);
  GARDEN_REACH[side] = fistAt(pose, side, _got).distanceTo(pos);
  return pose;
}

// ── The head ────────────────────────────────────────────────────────────────

const _look = new Vector3();
/** The face looks down this far at most (rad, in the world): enough to see his hands, never the top of his hair. */
const LOOK_DOWN = 0.42;
/** He looks at the work: the neck and the head share the turn toward `_look` (his space). */
function look(a: GardenAction, t: number, sp: Vector3, k: number, pose: Pose): void {
  lookAt(a, t, sp, _look);
  // The eyes (chest space, the head's rest frame), the target in chest space.
  const eye = _a.copy(NECK_L).add(HEAD_L).add(EYES);
  const to = _b.copy(_look).applyMatrix4(_chestInv).sub(eye);
  const yaw = clamp(Math.atan2(to.x, to.z), -1.0, 1.0) * k;
  // (his head is big: looking at his feet he would show only his hair; the face turns down at most `LOOK_DOWN` in the world)
  const bent = (pose.hips?.rx ?? 0) + (pose.chest?.rx ?? 0);
  const pitch = clamp(clamp(Math.atan2(-to.y, Math.hypot(to.x, to.z)), -0.7, 0.85) * k, -1.2, LOOK_DOWN - bent);
  pose.neck = { rx: pitch * 0.42, ry: yaw * 0.4 };
  pose.head = { rx: pitch * 0.58, ry: yaw * 0.6 };
}

/** What he looks at (his space). */
function lookAt(a: GardenAction, t: number, sp: Vector3, out: Vector3): Vector3 {
  out.copy(sp);
  const b = beats(a);
  switch (a) {
    case 'water':
      // (the water landing round the plant's foot)
      return out;
    case 'pickLow':
    case 'pickReach': {
      // (the fruit, then the basket)
      const k = seg(t, b.take + 0.1, b.basket - 0.1) * (1 - seg(t, b.basket + 0.2, b.len));
      return out.lerp(HANDS.L.w > 0 ? _v.setFromMatrixPosition(HANDS.L.m) : _v.copy(GROUND_BASKET_BIG).add(_approach), k);
    }
    case 'pickPole': {
      // (up at the fruit, then follows the pole's basket down)
      return out.lerp(_poleTip, seg(t, b.take + 0.1, b.down));
    }
    case 'pickGround': {
      const k = seg(t, b.take + 0.2, b.basket - 0.15);
      return out.lerp(_v.copy(GROUND_BASKET).add(_approach), k);
    }
    case 'clear': {
      // (the stick, then where it lands)
      const k = seg(t, b.out + 0.2, b.toss + 0.1);
      return out.lerp(_v.set(-16, 0, 6), k);
    }
    case 'plant':
    case 'plantTree': {
      // (the hole; the hoe as he lays it down; the seedling as he takes it)
      const k = window4(t, b.hoeDown - 0.35, b.hoeDown - 0.1, b.hoeDown + 0.1, b.kneel - 0.1);
      out.lerp(_v.set(-7, 0, 6), k * 0.6);
      return out;
    }
    default:
      return out;
  }
}

// ── The work: where the items and the hands are ────────────────────────────

/** The hands (and the items in them) for the action at `t`. */
function hands(w: GardenBody, t: number, sp: Vector3): void {
  freeHand('L');
  freeHand('R');
  switch (w.action) {
    case 'plant':
    case 'plantTree':
      return planting(w, t, sp);
    case 'water':
      return watering(t, sp);
    case 'fill':
      return filling(t, sp);
    case 'pickLow':
    case 'pickReach':
      return picking(w, t, sp);
    case 'pickCut':
      return cutting(w, t, sp);
    case 'pickPole':
      return poling(t, sp);
    case 'pickGround':
      return gathering(w, t, sp);
    case 'clear':
      return clearing(w, t, sp);
  }
}

/**
 * The items' frames at `t` (his space): what roam/_gardenProps.ts puts on the
 * ground (the hoe laid down, the seedling waiting) follows the same, and the pose
 * puts the fists on them. Exported for the props: `gardenItem(w, prop, out)` gives
 * the frame of `prop` now (null: not placed by the pose).
 */
export function gardenItem(w: GardenBody, prop: GardenProp, out: Matrix4): Matrix4 | null {
  const t = clamp(w.t, 0, ACTIONS[w.action].len);
  // (the body as posed now: the step up to the work)
  gardenPose(w);
  switch (prop) {
    case 'hoe':
      return w.action === 'plant' || w.action === 'plantTree' ? hoeFrame(w.action, t, w.spot, out) : null;
    default:
      return null;
  }
}

// ── Planting ────────────────────────────────────────────────────────────────

/** The hoe at rest in his right hand before the first stroke (the fist's place): its iron on the ground ahead. */
const HOE_HOLD = { fist: new Vector3(-5.0, 10.9, 2.0), pitch: -0.62 };
/** Raised for a stroke (the hands before his face, the iron up over his head) and how high for a deep one. */
const HOE_UP = { mid: new Vector3(-1.2, 15.0, 5.0), pitch: 0.32 };
const HOE_UP_DEEP = { mid: new Vector3(-1.2, 15.8, 5.2), pitch: 0.5 };
/** The stroke's angle as the edge bites (handle pitch: − down): a shallow handle, the blade into the earth steeply. */
const HOE_HIT = -0.55;
/** Laid down on his right, the handle along the ground and the blade on its side. */
const HOE_LAID = { butt: new Vector3(-7.0, HOE.r, -3.2), yaw: -0.1 };
const _hl = new Vector3();

/** The middle of the two grips (hoe frame). */
const HOE_MID = (HOE.gripL + HOE.gripR) / 2;
const _hoeDir = new Vector3();
/** The hoe swings about the right hand's grip. */
const _hoeGrip = new Vector3(0, 0, HOE.gripR);
const _hoeUp = new Vector3();

/**
 * The hoe's frame at `t`: held, raised, struck into the earth at the spot (the edge
 * bites there), dragged back a little, raised again; after the last stroke laid down
 * on his right.
 */
function hoeFrame(a: GardenAction, t: number, sp: Vector3, out: Matrix4): Matrix4 {
  const chops = times(a, 'chop');
  const down = beats(a).hoeDown;
  const deep = a === 'plantTree';
  const up = deep ? HOE_UP_DEEP : HOE_UP;
  // The handle's pitch and the grips' middle at the strike: the edge on the spot.
  const hitFrame = (drag: number, o: Matrix4) => {
    _hoeDir.set(0, Math.sin(HOE_HIT - drag * 0.1), Math.cos(HOE_HIT - drag * 0.1));
    _hoeUp.set(0, Math.cos(HOE_HIT), -Math.sin(HOE_HIT));
    frameZY(_v.set(0, 0, 0), _hoeDir, _hoeUp, o);
    // (the edge at the spot, a little into the earth; dragged back toward him)
    _c.copy(HOE_EDGE).applyMatrix4(o);
    o.setPosition(_d.set(sp.x - 0.4, sp.y - 0.35 - drag * 0.1, sp.z - drag).sub(_c));
    return o;
  };
  const held = (mid: Vector3, pitch: number, o: Matrix4, at = HOE_MID) => {
    _hoeDir.set(0, Math.sin(pitch), Math.cos(pitch));
    _hoeUp.set(0, Math.cos(pitch), -Math.sin(pitch));
    frameZY(_v.set(0, 0, 0), _hoeDir, _hoeUp, o);
    _c.set(0, 0, at).applyMatrix4(o);
    return o.setPosition(_d.copy(mid).add(_ap).sub(_c));
  };
  // Which stroke: before the first, between two, after the last.
  let i = 0;
  while (i < chops.length && t > chops[i] + 0.12) i++;
  if (i >= chops.length) {
    // After the last stroke: out of the earth, laid down on his right.
    const last = chops[chops.length - 1];
    const k = seg(t, last + 0.12, down);
    hitFrame(1, out);
    if (k <= 0) return out;
    laidFrame(_item2);
    return lerpFrame(out, _item2, k, out, 3.5, _hoeGrip);
  }
  const hit = chops[i];
  const from = i === 0 ? 0 : chops[i - 1] + 0.12;
  // (before the first: from the hold; between strokes: dragged back, up, then down)
  const raiseEnd = hit - 0.17;
  if (t >= hit) {
    // (in the earth: dragged back a little)
    return hitFrame(smooth((t - hit) / 0.12), out);
  }
  if (t <= raiseEnd) {
    if (i === 0) held(HOE_HOLD.fist, HOE_HOLD.pitch, out, HOE.gripR);
    else hitFrame(1, out);
    held(up.mid, up.pitch, _item2);
    return lerpFrame(out, _item2, easeOut((t - from) / (raiseEnd - from)), out, i === 0 ? 0 : 2.5, _hoeGrip);
  }
  // The strike: gathering speed down to the earth.
  held(up.mid, up.pitch, out);
  hitFrame(0, _item2);
  return lerpFrame(out, _item2, easeIn((t - raiseEnd) / (hit - raiseEnd)), out, 1.2, _hoeGrip);
}

/** The hoe laid down (his space). */
function laidFrame(out: Matrix4): Matrix4 {
  // (the handle along the ground toward his front-right, rising to where the blade props it; the blade on its side)
  const yaw = HOE_LAID.yaw;
  _hoeDir.set(Math.sin(yaw), 0.12, Math.cos(yaw)).normalize();
  _hoeUp.set(-Math.cos(yaw), 0, Math.sin(yaw));
  return frameZY(_hl.copy(HOE_LAID.butt).add(_approach), _hoeDir, _hoeUp, out);
}

const _la = new Vector3();
const _lb = new Vector3();
const _lq = new Quaternion();
const _lq2 = new Quaternion();
/**
 * Between two frames (`k` 0‥1): the turns slerped, the place of `pivot` (the frame's own point: where it is held)
 * along a line lifted `arc` BU in the middle (so a held thing swings about the hand, not about its own origin).
 */
function lerpFrame(a: Matrix4, b: Matrix4, k: number, out: Matrix4, arc = 0, pivot?: Vector3 | readonly [number, number, number]): Matrix4 {
  const pv = pivot ? (pivot instanceof Vector3 ? _lp.copy(pivot) : _lp.set(pivot[0], pivot[1], pivot[2])) : _lp.set(0, 0, 0);
  _la.copy(pv).applyMatrix4(a);
  _lb.copy(pv).applyMatrix4(b);
  _lq.setFromRotationMatrix(a);
  _lq2.setFromRotationMatrix(b);
  _la.lerp(_lb, k);
  _la.y += arc * Math.sin(Math.PI * clamp(k, 0, 1));
  _lq.slerp(_lq2, k);
  // (the origin from where the pivot is)
  _la.sub(pv.applyQuaternion(_lq));
  return out.compose(_la, _lq, ONE);
}
const _lp = new Vector3();

/** Lerp two points, lifted `arc` in the middle (and brought `ahead` BU forward: away from his body). */
function arcTo(a: Vector3, b: Vector3, k: number, arc: number, out: Vector3, ahead = 0): Vector3 {
  out.lerpVectors(a, b, k);
  const m = Math.sin(Math.PI * clamp(k, 0, 1));
  out.y += arc * m;
  out.z += ahead * m;
  return out;
}

const _seedAt = new Vector3();
/** The seedling held up before him to tear its bag off (chest space: before his belly; the item's foot). */
const SEEDLING_HELD = new Vector3(0.3, -1.6, 6.0);
const _pouch = new Vector3();
const _pa = new Vector3();
const _pb = new Vector3();
const _hm = new Matrix4();

/** Move a hand toward the frame `m` (`k` of the way from where it was set this pose; one not set yet comes on by `k`). */
function toward(side: 'L' | 'R', m: Matrix4, k: number, pole = POLE_DOWN[side]): void {
  const h = HANDS[side];
  if (k <= 0) return;
  if (h.w <= 0.001) {
    setHand(side, m, k, pole);
    return;
  }
  lerpFrame(h.m, m, k, h.m);
  h.w = mix(h.w, 1, k);
  h.pole.lerp(pole, k).normalize();
}
/** A palm's frame flat on the ground at `pos`, the fingers forward (his space). */
function palmFrame(side: 'L' | 'R', pos: Vector3, out: Matrix4, spread = 0.25): Matrix4 {
  // (Hand frame: fingers −Y, the left palm −X (the right +X), thumb +Z; palm down: X = ±up, Y = back.)
  const sg = side === 'L' ? 1 : -1;
  _x.set(0, sg, 0);
  _y.set(sg * Math.sin(spread), 0, -Math.cos(spread));
  _z.crossVectors(_x, _y);
  return out.makeBasis(_x, _y, _z).setPosition(pos.x, pos.y + PALM_UP, pos.z);
}
/** A flat palm's fist joint is this high over what it lies on (BU: the hand's half thickness). */
const PALM_UP = 1.3;
/** A fist's frame resting on a knee (the knee joint's place `knee`, his space). */
function kneeFrame(side: 'L' | 'R', knee: Vector3, out: Matrix4): Matrix4 {
  const sg = side === 'L' ? 1 : -1;
  return out.makeRotationY(-sg * 0.3).setPosition(_v.copy(knee).add(_w.set(-sg * 0.3, 2.3, 1.0)));
}

function planting(w: GardenBody, t: number, sp: Vector3): void {
  const a = w.action;
  const b = beats(a);
  const tree = a === 'plantTree';
  const down = b.hoeDown;
  const kneel = b.kneel;
  const pats = times(a, 'pat');
  // ── The hoe (both hands; the left lets go a moment before it is down) ──
  if (t < down + 0.02) {
    hoeFrame(a, t, sp, _item);
    // (carried in his right hand; the left joins it as he lifts it, and lets go as he lays it down; raised high the
    // right wrist turns only part of the way: the hoe turns with his fist)
    _z.set(0, 0, 1).transformDirection(_item);
    bothOn(_item, GRIPS.hoeR, GRIPS.hoeL, 1, seg(t, 0.06, 0.26) * (1 - seg(t, down - 0.32, down - 0.05)), POLE_DOWN.R, POLE_DOWN.L, 1);
  }
  if (!tree) {
    // ── The seed (from the pouch on his belt; the cutting or the pup from the ground on his right): into the hole, pressed in ──
    const form = w.kind ? SEED_FORM[w.kind] : 'seed';
    const g = form === 'cutting' ? GRIPS.cutting : form === 'pup' ? GRIPS.pup : GRIPS.seed;
    if (form === 'cutting' || form === 'pup') _pouch.copy(sp).add(WAITING[form]);
    else _pouch.set(-3.7, -0.6, 2.9).applyMatrix4(_hipsM);
    _seedAt.copy(sp);
    if (t >= down - 0.05 && t < b.set) {
      if (t < kneel) {
        // (the right hand off the hoe to the pouch: the seed is in its fingers at the kneel)
        _hm.makeRotationY(0.5).setPosition(_pouch);
        onItem('R', _hm, g, seg(t, down - 0.05, kneel - 0.05));
      } else {
        // (over the hole, then down into it)
        const k = seg(t, kneel, b.set - 0.14);
        _pb.copy(_seedAt).setY(_seedAt.y + 2.4);
        arcTo(_pouch, _pb, k, 1.2, _v);
        _v.y -= 2.4 * seg(t, b.set - 0.14, b.set);
        _hm.makeRotationY(0.5 * (1 - k)).setPosition(_v);
        onItem('R', _hm, g);
      }
    } else if (t >= b.set && t < pats[0]) {
      // (let go: the hand comes up off it)
      _hm.makeRotationY(0).setPosition(_seedAt);
      onItem('R', _hm, g);
      const up = seg(t, b.set, b.set + 0.25);
      HANDS.R.m.setPosition(_w.setFromMatrixPosition(HANDS.R.m).add(_c.set(0, 1.8 * up, -0.4 * up)));
    }
    // (the left hand on its knee from the squat)
    if (t >= down - 0.3 && t < pats[0]) onKnee('L', KNEE.L, seg(t, down - 0.3, kneel));
  } else {
    // ── The seedling: from the ground beside the hole, up before him, the bag torn off, set in the hole ──
    const tear = b.tear;
    const set = b.set;
    _pa.copy(sp).add(WAITING.seedling);
    // (lifted before him, then over the hole, then down in it: the root ball's top level with the earth)
    _pb.copy(SEEDLING_HELD).applyMatrix4(_chestM);
    _seedAt.copy(sp).setY(sp.y - 1.1);
    if (t >= down - 0.05 && t < pats[0]) {
      if (t < kneel) {
        // (both hands down to it where it waits)
        _hm.makeRotationY(0).setPosition(_pa);
        onItem('R', _hm, GRIPS.bagR, seg(t, down, kneel - 0.05));
        onItem('L', _hm, GRIPS.bagL, seg(t, down, kneel - 0.05));
      } else if (t < set) {
        const k1 = seg(t, kneel, tear - 0.06);
        const k2 = seg(t, tear + 0.14, set);
        arcTo(_pa, _pb, k1, 1.0, _v);
        if (k2 > 0) arcTo(_v.clone(), _seedAt, k2, 0.8, _v);
        _hm.makeRotationY(0.2 * Math.sin(Math.PI * k1)).setPosition(_v);
        onItem('R', _hm, GRIPS.bagR);
        onItem('L', _hm, GRIPS.bagL);
        // (the tear: the left hand pulls the bag down and off to the side)
        const tg = window4(t, tear - 0.1, tear, tear + 0.04, tear + 0.22);
        if (tg > 0) HANDS.L.m.setPosition(_w.setFromMatrixPosition(HANDS.L.m).add(_c.set(2.0 * tg, -1.8 * tg, 0.3 * tg)));
      } else {
        // (let go: the hands come up off the root ball)
        _hm.makeRotationY(0).setPosition(_seedAt);
        onItem('R', _hm, GRIPS.bagR);
        onItem('L', _hm, GRIPS.bagL);
        const up = seg(t, set, set + 0.25);
        for (const s of ['L', 'R'] as const) HANDS[s].m.setPosition(_w.setFromMatrixPosition(HANDS[s].m).add(_c.set(0, 1.6 * up, -0.5 * up)));
      }
    }
  }
  // ── The pats: both palms down on the earth round the stem, up between ──
  const last = pats[pats.length - 1];
  if (t >= b.set + 0.1 && t < b.up) {
    const spread = tree ? 2.3 : 1.5;
    let h = 1.8;
    for (const at of pats) h = Math.min(h, mix(1.8, 0, window4(t, at - 0.14, at, at + 0.02, at + 0.15)));
    const into = seg(t, b.set + 0.1, pats[0] - 0.14);
    const out = seg(t, last + 0.15, b.up);
    for (const s of ['L', 'R'] as const) {
      const sg = s === 'L' ? 1 : -1;
      _v.set(sp.x + sg * spread, sp.y + h, sp.z - (tree ? 1.0 : 0.6));
      toward(s, palmFrame(s, _v, _hm), into);
      // (then onto the knees, to push himself up)
      toward(s, kneeFrame(s, KNEE[s], _hm), out);
    }
  }
  // (up: the hands leave the knees as he stands)
  if (t >= b.up) for (const s of ['L', 'R'] as const) setHand(s, kneeFrame(s, KNEE[s], _hm), 1 - seg(t, b.up + 0.05, b.len - 0.08));
}

/** What each kind is planted from (its seed's prop; kinds.ts `form`). */
const SEED_FORM: Record<PlantKindId, 'seed' | 'cutting' | 'pup' | 'seedling'> = {
  eggplant: 'seed',
  corn: 'seed',
  pumpkin: 'seed',
  sugarcane: 'cutting',
  banana: 'pup',
  papaya: 'seedling',
  guava: 'seedling',
  mango: 'seedling',
  jackfruit: 'seedling',
  durian: 'seedling',
  coconut: 'seedling',
  sugarPalm: 'seedling',
  bodhi: 'seedling',
};

// ── Watering ────────────────────────────────────────────────────────────────

/** The can carried at his right side (chest space, as he bends: the fist's place, the arm hanging). */
const CAN_CARRY = new Vector3(-6.0, -1.3, 1.3);
/** Pouring: the rose this high over the plant's foot (BU), the can tipped this far (rad). */
const POUR = { up: 3.8, tip: 0.85, start: 0.22 };

/** A can's frame tipped `tip` (rad, its spout down) and turned `yaw`, its grip (the top handle) at `fist` (his space). */
function canAt(fist: Vector3, yaw: number, tip: number, out: Matrix4): Matrix4 {
  frameYawPitch(_cv.set(0, 0, 0), yaw, tip, out);
  _cw.set(...GRIPS.can.at).applyMatrix4(out);
  return out.setPosition(_cv.copy(fist).sub(_cw));
}
const _cv = new Vector3();
const _cw = new Vector3();
const _fist = new Vector3();

function watering(t: number, sp: Vector3): void {
  const b = beats('water');
  const raise = seg(t, 0.05, b.tip);
  const tip = mix(POUR.start * raise, POUR.tip, seg(t, b.tip, b.pour)) * (1 - seg(t, b.stop, b.stop + 0.3)) + POUR.start * 0.6 * seg(t, b.stop, b.stop + 0.3);
  const lower = seg(t, b.stop + 0.25, b.len - 0.05);
  // (a slow sway while it pours: the water goes round the plant)
  const sway = Math.sin((t - b.pour) * 3.6) * 1.4 * window4(t, b.pour, b.pour + 0.25, b.stop - 0.25, b.stop);
  // (the can on his right, its spout turned in toward the plant)
  const yaw = Math.atan2(sp.x + 3.5, Math.max(1, sp.z - 5));
  // Where his fist is while it pours: the rose over the spot with the can tipped all the way; tipping the can turns it about his fist.
  frameYawPitch(_v.set(0, 0, 0), yaw, POUR.tip, _item);
  _c.copy(CAN_ROSE).sub(_w.set(...GRIPS.can.at)).transformDirection(_item).multiplyScalar(CAN_ROSE_ARM);
  _fist.set(sp.x + sway * Math.cos(yaw), sp.y + POUR.up, sp.z - 0.6 - sway * Math.sin(yaw)).sub(_c);
  // (carried at his side at the start and the end: the fist from there and back, the can turning on it)
  const carry = smooth(Math.max(1 - raise, lower));
  _fist.lerp(_rel.copy(CAN_CARRY).applyMatrix4(_chestM), carry);
  _fist.y += 1.2 * Math.sin(Math.PI * carry);
  canAt(_fist, yaw * (1 - carry), tip * (1 - carry), _item);
  onItem('R', _item, GRIPS.can);
  // The left hand on his thigh while he leans over to pour (his arms are short: the can's back handle is out of its reach).
  const left = window4(t, b.tip - 0.35, b.tip, b.stop + 0.05, b.stop + 0.4);
  if (left > 0) onThigh('L', left);
}
/** The rose's distance from the grip (can frame). */
const CAN_ROSE_ARM = CAN_ROSE.clone().sub(new Vector3(...GRIPS.can.at)).length();

// ── Filling ─────────────────────────────────────────────────────────────────

function filling(t: number, sp: Vector3): void {
  const b = beats('fill');
  const down = seg(t, 0.08, b.dip);
  // (the can in: tipped forward as it goes under, filling it sinks and rights itself; lifted out)
  const sink = seg(t, b.dip, b.full);
  const lift = seg(t, b.full + 0.05, b.lift + 0.15);
  const back = seg(t, b.lift + 0.05, b.len - 0.05);
  const tip = mix(0, 0.62, down) * (1 - sink * 0.75) * (1 - lift);
  const yaw = Math.atan2(sp.x + 1.5, sp.z) * 0.5 - 0.15;
  // (the fist over the water: the can's body this far under the surface (a little more as it fills), lifted out)
  const depth = mix(1.2, 2.2, sink) - 4.2 * lift;
  // (lifted out it comes up and toward him)
  _fist.set(sp.x - 0.4 - 1.2 * lift, sp.y - depth - CAN.h / 2 + GRIPS.can.at[1], sp.z - 0.4 - 3.5 * lift);
  const carry = smooth(Math.max(1 - down, back));
  _fist.lerp(_rel.copy(CAN_CARRY).applyMatrix4(_chestM), carry);
  _fist.y += 1.0 * Math.sin(Math.PI * carry);
  canAt(_fist, yaw * (1 - carry), tip, _item);
  onItem('R', _item, GRIPS.can);
  // (the left hand on its knee, steadying him)
  const k = window4(t, 0.1, b.dip, b.lift, b.len - 0.15);
  if (k > 0) onKnee('L', KNEE.L, k);
}

// ── Picking (low, reaching up) ──────────────────────────────────────────────

/** The basket on his hip (the left fist on its back rim: hips space, as the hips go), and brought before him (his space: the fist's place). */
const BASKET_HIP = new Vector3(6.2, 0.2, 2.6);
const BASKET_FRONT = new Vector3(2.4, 1.6, 5.2);

function picking(w: GardenBody, t: number, sp: Vector3): void {
  const a = w.action;
  const b = beats(a);
  const kind = w.kind ?? (a === 'pickLow' ? 'eggplant' : 'guava');
  const big = bigFruit(kind);
  const reach = a === 'pickReach';
  const go = seg(t, 0.05, b.grip);
  if (big) {
    // Both hands on the big fruit: twisted (or pulled) off, lifted, into the basket on the ground.
    const fruitAt = _a.copy(sp);
    const k = seg(t, b.take, b.basket - 0.05);
    _b.copy(GROUND_BASKET_BIG).add(_approach).setY(BASKET.h + FRUIT[kind].h * 0.12 + FRUIT[kind].h / 2);
    arcTo(fruitAt, _b, k, reach ? 1.5 : 3.0, _v);
    const twist = t < b.take ? 0.12 * Math.sin((t - b.grip) * 14) * seg(t, b.grip, b.grip + 0.1) : 0;
    _item.makeRotationY(twist + k * 0.4).setPosition(_v);
    const on = go * (1 - seg(t, b.basket, b.basket + 0.4));
    if (t >= b.basket) {
      // (let go above the basket; the hands come off)
      _v.y += 1.2 * seg(t, b.basket, b.basket + 0.3);
      _item.setPosition(_v);
    }
    bothOn(_item, fruitSide(kind, 'R'), fruitSide(kind, 'L'), on, on);
    return;
  }
  // The basket in the left hand: at his hip, before him at the basket beat (the right hand drops the fruit in).
  const basketIn = window4(t, b.take, b.basket - 0.12, b.basket + 0.1, b.len - 0.1);
  _pa.copy(BASKET_HIP).applyMatrix4(_hipsM);
  // (before him: in front of his belly to the left, where his right hand reaches: chest space, as he bends)
  _pb.copy(BASKET_FRONT).applyMatrix4(_chestM);
  _v.lerpVectors(_pa, _pb, basketIn);
  // (the basket's frame from the fist's: the fist on its back rim, upright, a little turned in)
  _m.makeRotationY(-0.35 * basketIn).setPosition(_v);
  _item.copy(_m).multiply(_m2.copy(gripMatrix(GRIPS.basket)).invert());
  // (keep it upright: the fist turns to it)
  onItem('L', _item, GRIPS.basket, 1);
  HANDS.L.w = 1;
  // The right hand: to the fruit, twists it off (reaching up: takes it on his palm), to the basket, lets go, back.
  const g = reach ? fruitBelow(kind) : fruitTop(kind);
  const mouth = _c.set(0, BASKET.h + 0.6, 0.2).applyMatrix4(_item);
  if (t < b.grip) {
    // (reaching to it from his side)
    _item2.makeRotationY(0).setPosition(sp);
    onItem('R', _item2, g, go, reach ? POLE_OUT.R : POLE_DOWN.R);
  } else if (t < b.take) {
    // (twisting it: the fist turns about the stalk, back and forth; pulled down a little)
    const tw = Math.sin((t - b.grip) * 16) * 0.55 * seg(t, b.grip, b.grip + 0.08);
    const pull = reach ? 0.8 * seg(t, b.grip, b.take) : 0;
    _item2.makeRotationY(tw).setPosition(_v.copy(sp).setY(sp.y - pull));
    onItem('R', _item2, g, 1, reach ? POLE_OUT.R : POLE_DOWN.R);
  } else if (t < b.basket) {
    // (off: a jerk, then to the basket's mouth)
    const k = seg(t, b.take, b.basket - 0.08);
    _a.copy(sp).setY(sp.y - (reach ? 1.6 : 0.4) * seg(t, b.take, b.take + 0.12));
    _b.copy(mouth).setY(mouth.y + FRUIT[kind].h / 2);
    arcTo(_a, _b, k, reach ? 0 : 2.0, _v, reach ? 3.0 : 0.8);
    _item2.makeRotationY(0.6 * k).setPosition(_v);
    onItem('R', _item2, g, 1, POLE_DOWN.R);
  } else {
    // (dropped in: the hand comes up and away, back to his side)
    const k = seg(t, b.basket, b.len - 0.05);
    _b.copy(mouth).setY(mouth.y + FRUIT[kind].h / 2 + 1.2 * seg(t, b.basket, b.basket + 0.2));
    _item2.makeRotationY(0.6).setPosition(_b);
    onItem('R', _item2, g, 1 - k, POLE_DOWN.R);
  }
}

// ── Cutting (sugarcane, a banana bunch) ─────────────────────────────────────

/** The knife's way through a stroke (from the spot, BU): drawn back up and out to his right, through, past to the left and down. */
const CUT_FROM = new Vector3(-3.4, 3.2, -0.8);
const CUT_TO = new Vector3(0.2, 1.4, -1.8);
const CUT_FROM_HIGH = new Vector3(-3.4, -2.4, -1.6);
/** A banana bunch stood on its heart: its stalk (the fist) this high (BU). */
const BUNCH_STANDS = 8 + 1.4 + 1.9 + 0.6;
const CUT_TO_HIGH = new Vector3(0.2, 0.6, -2.2);
/** The knife at rest in his right hand (his space), and where it goes back to its sheath on his right hip (hips space). */
const KNIFE_HOLD = new Vector3(-5.6, 13.0, 3.2);
const SHEATH = new Vector3(-4.9, 0.4, 0.6);

/** Where a stroke is (0 wound up ‥ 1 through) at `t`, the strikes at `hits`: wound up, fast through, drawn back for the next. */
function strokes(t: number, hits: readonly number[], wind: number): number {
  for (let i = 0; i < hits.length; i++) {
    const at = hits[i];
    if (t < at - 0.1) return i === 0 ? 0 : 1 - smooth((t - hits[i - 1] - 0.05) / (at - 0.1 - hits[i - 1] - 0.05));
    if (t <= at + 0.05) return easeIn((t - at + 0.1) / 0.15);
  }
  void wind;
  return 1;
}

function cutting(w: GardenBody, t: number, sp: Vector3): void {
  const b = beats('pickCut');
  const kind = w.kind ?? 'sugarcane';
  const banana = kind === 'banana';
  const high = smooth((sp.y - 6) / 9);
  const cuts = times('pickCut', 'cut');
  // ── The left hand: holds the cane (or the bunch's stalk) by the cut, takes it, lays it down on his left ──
  const holdAt = _pa.copy(sp).setY(sp.y + mix(3.0, -1.4, high));
  if (t < b.take) {
    // (the cane through the fist upright: the item's +z up, the forearm toward him)
    frameZY(holdAt, _v.set(0, 1, 0), _w.set(0, 0, -1), _item);
    onItem('L', _item, STALK, seg(t, 0.15, cuts[0] - 0.25), high > 0.5 ? POLE_OUT.L : POLE_DOWN.L);
  } else {
    // (taken: over to his left and laid on the ground there: the canes lying forward, the bunch on its side)
    const k = seg(t, b.take, b.basket);
    const off = seg(t, b.basket, b.basket + 0.3);
    // (the canes laid along the ground on his left; the bunch stood up on its heart there, its stalk up)
    rel(_pb.set(4.6, banana ? BUNCH_STANDS : 1.2, banana ? 5.6 : 4.2), _pb);
    arcTo(holdAt, _pb, k, 2.2 * (1 - high), _v);
    const lie = banana ? 0 : smooth(k * 1.25 - 0.25);
    _d.set(0, 1, 0).lerp(_w.set(0.12, 0.06, 1), lie).normalize();
    frameZY(_v, _d, _w.set(0, 0, -1).lerp(_c.set(0, 1, 0), lie), _item);
    onItem('L', _item, STALK, 1 - off, POLE_DOWN.L);
    if (off > 0) HANDS.L.m.setPosition(_w.setFromMatrixPosition(HANDS.L.m).add(_c.set(0, 1.8 * off, -0.6 * off)));
  }
  // ── The knife: up from his side, two strokes through, then down into its sheath on his right hip ──
  const s = strokes(t, cuts, 0.1);
  // (low, at a cane's foot: down across it; high, at a bunch's stalk: up across it, beside his head)
  _v.copy(CUT_FROM).lerp(CUT_FROM_HIGH, high);
  _w.copy(CUT_TO).lerp(CUT_TO_HIGH, high);
  const stroke = _pb.copy(sp).add(_v.lerp(_w, s));
  const ready = seg(t, 0.1, cuts[0] - 0.24);
  const done = seg(t, cuts[1] + 0.12, b.basket);
  const sheath = _a.copy(SHEATH).applyMatrix4(_hipsM);
  // (where the fist is: its rest, the stroke, the sheath's mouth)
  const fist = rel(KNIFE_HOLD, _d).lerp(stroke, ready);
  if (done > 0) fist.lerp(_w.copy(sheath).setY(sheath.y + 2.6), done);
  // The blade toward the cane (from the fist), its edge leading through the stroke (down and to his left).
  _v.copy(sp).sub(fist).setY(0);
  if (_v.lengthSq() < 1e-4) _v.set(0, 0, 1);
  _v.normalize().lerp(_w.set(0, 0, 1), 1 - ready).normalize();
  _v.y = mix(0.15, -0.2 + 0.5 * high, ready);
  frameZY(fist, _v, _w.set(-0.55, 1, 0.1).lerp(_c.set(0.55, -1, 0.1), high), _item);
  // (sheathed: the blade straight down at the end)
  const sheathed = seg(t, b.basket - 0.05, 2.38);
  if (sheathed > 0) {
    frameZY(fist, _v.set(0.06, -1, 0.12), _w.set(0, 0, 1), _item2);
    lerpFrame(_item, _item2, sheathed, _item);
  }
  onItem('R', _item, GRIPS.knife, 1 - seg(t, 2.42, b.len - 0.05), POLE_BACK.R);
}

// ── The picking pole ────────────────────────────────────────────────────────

const _poleTip = new Vector3();
const _poleDir = new Vector3();

/** The pole's frame (butt at the origin, +z up the pole) at `t`; also exported for the props (lowered it slides). */
function poleFrame(t: number, sp: Vector3, out: Matrix4): Matrix4 {
  const b = beats('pickPole');
  const g = poleGrips(t, sp);
  const mid = (g.r + g.l) / 2;
  const len = g.len;
  // From the hands' middle to the head's middle (BU).
  const reach = len - mid + POLE.head * 0.5;
  // (at the hook: the basket at the fruit, the hands in front of his chest)
  _poleDir.copy(sp).sub(POLE_HANDS).normalize();
  const hook = _a.copy(POLE_HANDS);
  // (held up before him at the start, leaning out, its foot off the ground)
  const hold = _b.set(-1.6, 14.8, 4.6);
  const holdDir = _c.set(-0.03, 0.9, 0.42).normalize();
  // (below the fruit before it goes in; pulled down at the tug)
  const below = seg(t, b.raise, b.hook);
  const tug = window4(t, b.hook, b.take, b.take + 0.05, b.take + 0.3);
  // (lowered: tipped down to his left front, then its head down on the ground there)
  const tip = seg(t, b.take + 0.15, b.down);
  const land = seg(t, b.down, b.basket);
  const hands = _v;
  const dir = _w;
  if (t < b.raise) {
    const k = seg(t, 0.05, b.raise);
    hands.lerpVectors(hold, hook, k).add(_x.set(0, -2.4 * k, -0.8 * k));
    dir.copy(holdDir).lerp(_poleDir, k).normalize();
  } else {
    // (from just under the fruit, up into the crown to it)
    hands.copy(hook).add(_x.set(0, -2.4 * (1 - below), -0.8 * (1 - below)));
    hands.y -= 2.4 * tug;
    hands.z -= 0.8 * tug;
    dir.copy(_poleDir);
    if (tip > 0) {
      hands.lerp(_x.copy(POLE_LOW), tip);
      // (its way by angles: from up into the crown, round and down to its left front, its head on the ground)
      const pitch0 = Math.asin(clamp(_poleDir.y, -1, 1));
      const yaw0 = Math.atan2(_poleDir.x, _poleDir.z);
      const down = Math.asin(clamp((POLE.head * 0.5 + 0.5 - hands.y) / reach, -1, 1));
      const pitch = mix(mix(pitch0, POLE_DOWN_PITCH, tip), down, land);
      const yaw = mix(yaw0, POLE_DOWN_YAW, tip);
      dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    }
  }
  _poleTip.copy(hands).addScaledVector(dir, reach);
  frameZY(_x.copy(hands).addScaledVector(dir, -mid), dir, _y.set(0, 0, -1).lerp(_z.set(0, 1, 0), tip), out);
  return out;
}
/** Lowering the pole: the hands come down to here (his space), the pole tipped down to this pitch, toward this yaw (his left front). */
const POLE_LOW = new Vector3(-0.8, 12.4, 4.6);
const POLE_DOWN_PITCH = 0.22;
const POLE_DOWN_YAW = 0.42;

/** The fists on the pole (they slide along it: live grips). */
const POLE_GRIP = { R: grip([0, 0, POLE.gripR]), L: grip([0, 0, POLE.gripL]) };
LIVE_GRIPS.add(POLE_GRIP.R);
LIVE_GRIPS.add(POLE_GRIP.L);

function poling(t: number, sp: Vector3): void {
  const b = beats('pickPole');
  poleFrame(t, sp, _item);
  const g = poleGrips(t, sp);
  const off = seg(t, 3.4, b.len - 0.05);
  (POLE_GRIP.R.at as [number, number, number])[2] = g.r;
  (POLE_GRIP.L.at as [number, number, number])[2] = g.l;
  bothOn(_item, POLE_GRIP.R, POLE_GRIP.L, 1 - off, 1 - off, POLE_OUT.R, POLE_OUT.L);
}

/** The pole's frame now (his space), for the props. */
export function gardenPoleFrame(t: number, spot: Vector3, out: Matrix4): Matrix4 {
  return poleFrame(t, spot, out);
}

// ── Fallen fruit ────────────────────────────────────────────────────────────

function gathering(w: GardenBody, t: number, sp: Vector3): void {
  const b = beats('pickGround');
  const kind = w.kind ?? 'durian';
  const go = seg(t, 0.15, b.grip);
  const k = seg(t, b.take, b.basket - 0.05);
  // (up to his belly, then over to the basket on his left and down into it)
  _a.copy(sp);
  rel(_b.set(1.2, 7.6, 6.4), _b);
  _c.copy(GROUND_BASKET).add(_approach).setY(BASKET.h + FRUIT[kind].h * 0.12 + FRUIT[kind].h / 2);
  if (k < 0.45) arcTo(_a, _b, k / 0.45, 0.6, _v);
  else arcTo(_b, _c, (k - 0.45) / 0.55, 1.4, _v);
  _item.makeRotationY(0.15 * k).setPosition(_v);
  if (t >= b.basket) {
    // (in; the hands come up off it)
    const up = seg(t, b.basket, b.basket + 0.3);
    _item.setPosition(_v.setY(_v.y + 1.2 * up));
  }
  const on = go * (1 - seg(t, b.basket + 0.05, b.len - 0.15));
  bothOn(_item, fruitSide(kind, 'R'), fruitSide(kind, 'L'), on, on);
}

// ── Pulling a dead plant out ────────────────────────────────────────────────

/** Where the tossed stick lands (his space): on the heap to his right. */
const STICK_HEAP = new Vector3(-17, 0, 5);

function clearing(w: GardenBody, t: number, sp: Vector3): void {
  const b = beats('clear');
  const go = seg(t, 0.1, b.grip);
  const tugs = times('clear', 'tug');
  // The stick's frame: rooted at the spot (a little up at each tug); out with its roots, leaning toward him; drawn
  // back to his left (the wind-up), swung across to his right and let go.
  let up = 0;
  for (const at of tugs) up += 0.45 * window4(t, at - 0.12, at, at + 0.04, at + 0.25);
  const out = seg(t, tugs[1] + 0.1, b.out);
  const wind = seg(t, b.out + 0.05, b.toss - 0.14);
  const swing = seg(t, b.toss - 0.14, b.toss);
  // (the item's origin is its root collar; the grips are 1.6 and 3.6 up it: positions here are the grips' middle)
  const MID = (STICK.gripR + STICK.gripL) / 2;
  _a.copy(sp).setY(sp.y + MID + up + 7.0 * out);
  _a.z -= 1.4 * out;
  _d.set(0, 1, 0).lerp(_c.set(0, 0.7, -0.7), out * 0.25).normalize();
  // (wound up to his left, the stem across him pointing left; swung right)
  rel(_b.set(1.6, 10.6, 5.6), _b);
  rel(_c.set(-1.2, 12.4, 5.8), _c);
  _v.copy(_a).lerp(_b, wind).lerp(_c, swing);
  _w.set(0.9, 0.35, 0.2).normalize();
  _d.lerp(_w, wind).normalize();
  _item.copy(frameYZ(_v, _d, _x.set(0, 0, 1), _item));
  _item.setPosition(_w.copy(_d).multiplyScalar(-MID).add(_v));
  const off = seg(t, b.toss - 0.02, b.toss + 0.25);
  bothOn(_item, GRIPS.stickR, GRIPS.stickL, go * (1 - off), go * (1 - off));
  if (off > 0) {
    // (thrown: the arms follow through to his right and come back down)
    for (const s of ['L', 'R'] as const) HANDS[s].m.setPosition(_w.setFromMatrixPosition(HANDS[s].m).add(_c.set(-2.2 * off, 1.2 * off, 0.4 * off)));
  }
  void w;
}

/**
 * Where `prop` in `side`'s hand is (his space) as the last `gardenPose` left it: the hand's target times the
 * grip's inverse (the pole: its own frame). roam/_gardenProps.ts lays things down where they were let go.
 */
export function gardenRelease(w: GardenBody, prop: GardenProp, side: 'L' | 'R', out: Matrix4): Matrix4 {
  if (prop === 'pole') return gardenPoleFrame(clamp(w.t, 0, ACTIONS.pickPole.len), w.spot, out);
  const g = gardenGrip(prop, w.kind, side, w.action, w.t, w.spot);
  if (!g) return out.identity();
  return out.copy(HANDS[side].m).multiply(_m.copy(gripMatrix(g)).invert());
}

/** The items as the pose holds them now (his space), for the props: the item in the hand that carries it. */
export function gardenItemNow(w: GardenBody, prop: GardenProp, out: Matrix4): Matrix4 | null {
  if (prop === 'pole') return gardenPoleFrame(clamp(w.t, 0, ACTIONS.pickPole.len), w.spot, out);
  return gardenItem(w, prop, out);
}
