import { Box3, Group, Vector3, type Object3D } from 'three';
import { buildFood, type FoodKind } from '../../character/parts/food';
import { buildVoxelMesh, disposeVoxelMesh } from '../../voxel/VoxelMesh';
import { BODY_UNIT_M } from '../../world/scale';
import { SURFACE } from '../heightfield';
import { CH, Model, type Species } from './_kit';
import type { Activity, Agent, Ground, Habits } from './_landBrain';
import type { Survey } from './_landPlaces';

/**
 * Long-tailed macaque (crab-eating macaque), the monkey of Angkor's temples:
 * about 0.5 m of body and as much again of tail, grey-brown with a paler
 * belly and cheek whiskers, a bare pinkish-grey face. On all fours it
 * knuckle-walks and gallops; it sits upright on its haunches to groom a
 * neighbour, scratch or eat, and sleeps sitting hunched, head on its chest.
 * Babies are dark and ride on their mother's back.
 *
 * Variants: 0 adult, 1 baby (dark fur, pink face), 2 old male (more golden).
 * Act: 1 groom (right hand picks at a neighbour), 2 scratch (left hand), 3 eat;
 * and the thief's (roam/_monkeyThief.ts, never in a troop's own life): 4 reach
 * up for the explorer's snack (standing, a leap), 5 hold it (see `THIEF`).
 */

const S = { fur: 0, back: 1, pale: 2, face: 3, hand: 4, eye: 5, brow: 6 };

const model = new Model()
  .bone('body', null, [0, 0.3, -0.15])
  .bone('neck', 'body', [0, 0.4, 0.19])
  .bone('head', 'neck', [0, 0.4, 0.19])
  .boneLR('arm*', 'body', [0.085, 0.33, 0.15])
  .boneLR('fore*', 'arm*', [0.085, 0.17, 0.15])
  .boneLR('leg*', 'body', [0.075, 0.3, -0.15])
  .boneLR('shin*', 'leg*', [0.075, 0.16, -0.12])
  .bone('tail1', 'body', [0, 0.37, -0.21])
  .bone('tail2', 'tail1', [0, 0.37, -0.43]);

model
  // Body: long back, deeper chest, pale belly, a darker saddle.
  .box('body', [0, 0.33, -0.03], [0.19, 0.17, 0.4], S.fur)
  .box('body', [0, 0.345, 0.12], [0.21, 0.19, 0.14], S.fur)
  .box('body', [0, 0.25, 0.0], [0.15, 0.03, 0.3], S.pale)
  .box('body', [0, 0.418, -0.05], [0.16, 0.02, 0.3], S.back)
  // Head: skull with a little crest, flat pale face, muzzle, brow, whiskers, ears.
  .box('head', [0, 0.44, 0.27], [0.15, 0.14, 0.14], S.fur)
  .box('head', [0, 0.52, 0.25], [0.06, 0.03, 0.08], S.back)
  .box('head', [0, 0.43, 0.345], [0.11, 0.09, 0.012], S.face)
  .box('head', [0, 0.405, 0.36], [0.07, 0.045, 0.045], S.face)
  .box('head', [0, 0.47, 0.35], [0.12, 0.022, 0.028], S.brow)
  .boxLR('head', [0.028, 0.447, 0.352], [0.024, 0.018, 0.01], S.eye)
  .boxLR('head', [0.075, 0.42, 0.31], [0.03, 0.085, 0.07], S.pale)
  .boxLR('head', [0.082, 0.465, 0.26], [0.015, 0.04, 0.035], S.face)
  // Arms and legs, hands and feet of dark skin.
  .boxLR('arm*', [0.085, 0.25, 0.15], [0.055, 0.165, 0.06], S.fur)
  .boxLR('fore*', [0.085, 0.095, 0.15], [0.05, 0.15, 0.055], S.fur)
  .boxLR('fore*', [0.085, 0.012, 0.165], [0.055, 0.024, 0.075], S.hand)
  .boxLR('leg*', [0.078, 0.23, -0.14], [0.07, 0.15, 0.09], S.fur)
  .boxLR('shin*', [0.075, 0.09, -0.125], [0.055, 0.14, 0.06], S.fur)
  .boxLR('shin*', [0.075, 0.012, -0.1], [0.055, 0.024, 0.11], S.hand)
  // Tail, as long as the body.
  .box('tail1', [0, 0.37, -0.32], [0.036, 0.036, 0.22], S.fur)
  .box('tail2', [0, 0.37, -0.555], [0.03, 0.03, 0.25], S.back);

const GLSL = /* glsl */ `
vec3 faunaBoneRot(int b, FaunaPose P) {
  float sit = P.rest;
  float up = 1.0 - sit;
  float groom = clamp(1.0 - abs(P.act - 1.0), 0.0, 1.0) * sit;
  float scratch = clamp(1.0 - abs(P.act - 2.0), 0.0, 1.0) * sit;
  float eat = clamp(1.0 - abs(P.act - 3.0), 0.0, 1.0) * sit;
  // The thief (a troop's own life keeps to acts 0‥3, where these are all 0): 4 reaching up for the explorer's snack
  // (standing: a leap, rearing up, both arms up); 5 holding it — under the chin in the right hand running on three
  // legs, or at its mouth in both hands sitting (from eating, 3, the right hand comes down to it and the left one up).
  float reach = clamp(1.0 - abs(P.act - 4.0), 0.0, 1.0) * up;
  float carry = clamp(P.act - 4.0, 0.0, 1.0) * up;
  float mouth = clamp(P.act - 3.0, 0.0, 1.0) * sit;
  float both = clamp((P.act - 3.0) * 0.5, 0.0, 1.0) * sit;
  // (reaching for it or holding it: no bob of the body, and the right arm does not step)
  float still = 1.0 - min(1.0, carry + reach);
  if (b == B_BODY) return vec3(-1.25 * sit + sin(P.phase) * 0.14 * P.run * up * still - 0.55 * reach, 0.0, sin(P.phase) * 0.04 * P.walk * up * still);
  // (the neck keeps the head level whatever the body does; reaching, it looks up at the snack)
  if (b == B_NECK) return vec3(1.25 * sit - sin(P.phase) * 0.14 * P.run * up * still + 0.25 * reach, 0.0, 0.0);
  if (b == B_HEAD) {
    float nod = P.head * (0.6 + 0.15 * sit) + 0.35 * groom + 0.08 * sin(P.t * 3.1 + P.seed * 9.0) * groom;
    nod -= 0.05 * sin(P.phase * 2.0) * P.walk;
    // (the thief: looking up at it; nibbling at it, sitting)
    nod += -0.35 * reach + both * (0.1 + 0.14 * max(0.0, sin(P.t * 6.0 + P.seed * 4.0)));
    float look = P.turn * 0.9 + 0.25 * scratch;
    return vec3(nod, look, 0.12 * scratch);
  }
  // (tail pitch > 0 lifts it) Carried with its base up and the rest hanging in an arc; on the ground behind when sitting.
  if (b == B_TAIL1) return vec3(0.3 * up + 1.35 * sit + 0.2 * P.run, 0.18 * sin(P.t * 0.9 + P.seed * 6.0), 0.0);
  if (b == B_TAIL2) return vec3(-0.95 * up - 0.05 * sit + 0.5 * P.run, 0.25 * sin(P.t * 0.9 + P.seed * 6.0 - 0.8), 0.0);

  bool left = b == B_ARML || b == B_FOREL || b == B_LEGL || b == B_SHINL;
  bool hind = b == B_LEGL || b == B_LEGR || b == B_SHINL || b == B_SHINR;
  bool upper = b == B_ARML || b == B_ARMR || b == B_LEGL || b == B_LEGR;
  float side = left ? 1.0 : -1.0;
  // Steps: diagonal walk (left hind, left fore, right hind, right fore), a gallop runs in pairs.
  float walkOff = hind ? (left ? 0.0 : 0.5) : (left ? 0.25 : 0.75);
  float runOff = hind ? (left ? 0.0 : 0.1) : (left ? 0.5 : 0.6);
  float th = P.phase + 6.2832 * mix(walkOff, runOff, P.run);
  float swing = -sin(th) * (0.42 * P.walk + 0.8 * P.run) * up;
  float bend = max(0.0, cos(th)) * (0.55 * P.walk + 0.9 * P.run) * up;
  if (hind) {
    // (reaching: the legs push off and trail)
    if (upper) return vec3(swing * (1.0 - reach) - 0.45 * sit + 0.85 * reach, 0.25 * side * sit, 0.0);
    return vec3(bend * (1.0 - reach) + 1.15 * sit + 0.45 * reach, 0.0, 0.0);
  }
  // Arms: hang in front when sitting; the right one grooms or feeds, the left scratches.
  bool right = !left;
  float steps = right ? still : 1.0 - reach;
  if (upper) {
    float a = swing * steps + 0.95 * sit;
    if (right) a += -0.9 * groom - 1.9 * eat + 0.12 * sin(P.t * 1.7) * eat - 0.35 * mouth - 1.15 * carry;
    else a += -2.1 * scratch - 0.35 * both;
    a -= 2.0 * reach;
    return vec3(a, 0.0, left ? 0.55 * scratch : 0.0);
  }
  float f = -bend * 0.7 * steps;
  if (right) f += (-0.55 + 0.3 * sin(P.t * 6.5 + P.seed * 5.0)) * groom - 1.7 * eat - 1.5 * mouth - 1.4 * carry;
  else f += (-1.3 + 0.35 * sin(P.t * 19.0)) * scratch - 1.5 * both;
  return vec3(f, 0.0, 0.0);
}

vec3 faunaRootMove(FaunaPose P) {
  float up = 1.0 - P.rest;
  // (the thief reaching for or carrying the snack: no bob)
  float held = min(1.0, clamp(1.0 - abs(P.act - 4.0), 0.0, 1.0) + clamp(P.act - 4.0, 0.0, 1.0)) * up;
  float bob = 0.012 * sin(P.phase * 2.0) * P.walk + 0.06 * max(0.0, sin(P.phase)) * P.run;
  return vec3(0.0, -0.205 * P.rest + bob * up * (1.0 - held), 0.0);
}
`;

export const MACAQUE: Species = {
  name: 'macaque',
  model,
  palettes: [
    [0x7d6e5c, 0x685a48, 0xb2a48e, 0xc8a393, 0x4a4038, 0x1d1612, 0x584b3e],
    [0x3d3531, 0x342d29, 0x5c524b, 0xdcaea5, 0x4d3e37, 0x120e0c, 0x2a2420],
    [0x9c8667, 0x836d50, 0xc7b69a, 0xc09888, 0x4a4038, 0x1d1612, 0x6a5a45],
  ],
  glsl: GLSL,
  ease: [0.25, 0.45, 0.4, 0.5, 0.35],
};

/** Troops round the temples: sit, groom, scratch, eat, pick at the ground; scamper off and settle again. */
export const MACAQUE_HABITS: Habits = {
  walk: 0.9,
  run: 3.8,
  walkHz: 1.8,
  runHz: 3.4,
  turn: 4,
  alertAt: 9,
  fleeAt: 5.5,
  fleeTo: [7, 13],
  wander: 7,
  leash: 25,
  moves: 0.4,
  idle: [
    ['sit', 3, 6, 15],
    ['look', 2, 4, 10],
    ['groom', 3, 10, 25],
    ['scratch', 1, 2, 5],
    ['eat', 2, 5, 12],
    ['graze', 2, 3, 8],
    ['stand', 1, 2, 5],
  ],
  looks: {
    stand: { rest: 0, head: 0, act: 0 },
    graze: { rest: 0, head: 1, act: 0 },
    look: { rest: 1, head: 0, act: 0 },
    sit: { rest: 1, head: 0.2, act: 0 },
    groom: { rest: 1, head: 0.3, act: 1 },
    groomed: { rest: 1, head: 0.7, act: 0 },
    scratch: { rest: 1, head: 0, act: 2 },
    eat: { rest: 1, head: 0, act: 3 },
    sleep: { rest: 1, head: 1, act: 0 },
  },
  night: 0.9,
  climb: 1.3,
};

// ── The thief: one macaque borrowed from its troop to steal the explorer's snack ────────────────

/**
 * The snack thief (roam/_monkeyThief.ts): while the explorer eats near a
 * temple troop, one bold macaque of it comes for his snack. The roaming
 * add-on drives it (where it is, how it looks, what it holds: `THIEF`,
 * every roaming step, so a shot's `sim=` plays it); the fauna part
 * (land.ts) leaves that macaque's own life alone meanwhile and puts it on
 * the map as `THIEF.pose` says, with the snack in its hands (`linkThief`).
 * Then it goes back to its troop where it is (`giveBack`).
 *
 * No three.js crosses: the add-on reads the troop's macaques (their place,
 * mode, size) and the ground they may stand on, and writes plain numbers.
 */

/** Where the borrowed macaque is and how it looks (the flock's channels: _kit.ts `CH`). */
export interface ThiefPose {
  /** Its feet (m) and heading (radians, 0 = +z). */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** 0 still, 1 walk, 2 run; steps a second. */
  gait: number;
  hz: number;
  /** Sitting 0‥1; head −1 high ‥ 1 down; head turned −1‥1; the act (4 reach, 5 hold the snack). */
  rest: number;
  head: number;
  turn: number;
  act: number;
}

/** What it holds: his snack (its kind and colours: parts/food.ts), the stage it is eaten to, how big still (1 → 0: gone). */
export interface ThiefFood {
  kind: FoodKind;
  colors?: readonly number[];
  stage: number;
  size: number;
}

export interface ThiefLink {
  /** The temple troops' macaques that may come (not a mother carrying her baby); empty until the fauna part is built. */
  readonly members: Agent[];
  /** Where they may stand (the temples' floors and paving: NaN elsewhere), and their largest step a metre (m). */
  ground: Ground | null;
  readonly climb: number;
  /**
   * The top of what is underfoot on the way (m): as `ground`, but on the edge of a step too (where one may not sit,
   * but walks over); NaN in water, at a trunk, under a low roof, up a wall too high for them. A way is theirs when
   * no step along it is higher than `climb`: never through a wall.
   */
  path: Ground | null;
  /** The macaque the add-on drives now (its own life paused), or null. */
  agent: Agent | null;
  readonly pose: ThiefPose;
  food: ThiefFood | null;
  /** Shots: into a new pose at once (no easing). */
  snap: boolean;
}

export const THIEF: ThiefLink = {
  members: [],
  ground: null,
  climb: MACAQUE_HABITS.climb,
  path: null,
  agent: null,
  pose: { x: 0, y: 0, z: 0, yaw: 0, gait: 0, hz: 1.8, rest: 0, head: 0, turn: 0, act: 0 },
  food: null,
  snap: false,
};

/** Take macaque `ag` out of its troop's life: from now on `THIEF.pose` is where it is, starting as it is now. */
export function borrow(ag: Agent): void {
  if (THIEF.agent && THIEF.agent !== ag) giveBack();
  const fl = ag.flock;
  Object.assign(THIEF.pose, {
    x: ag.x,
    y: ag.y,
    z: ag.z,
    yaw: ag.yaw,
    gait: 0,
    hz: MACAQUE_HABITS.walkHz,
    rest: fl.target(ag.i, CH.rest),
    head: fl.target(ag.i, CH.head),
    turn: fl.target(ag.i, CH.turn),
    act: fl.target(ag.i, CH.act),
  });
  // (not idle meanwhile: no neighbour comes to groom it)
  ag.mode = 'walk';
  ag.tx = ag.x;
  ag.tz = ag.z;
  THIEF.agent = ag;
  THIEF.food = null;
}

/** Back to its troop where it is now, doing `act` for about `seconds` (then its own life goes on). */
export function giveBack(act: Activity = 'look', seconds = 3): void {
  const ag = THIEF.agent;
  THIEF.agent = null;
  THIEF.food = null;
  holder.visible = false;
  if (!ag) return;
  const p = THIEF.pose;
  const g = THIEF.ground?.(p.x, p.z) ?? Number.NaN;
  ag.x = ag.tx = p.x;
  ag.z = ag.tz = p.z;
  ag.y = p.y;
  // (in the air or on a perch the troop's ground has not: it lands where it is)
  ag.gy = Number.isNaN(g) ? p.y : g;
  ag.yaw = p.yaw;
  ag.mode = 'idle';
  ag.act = act;
  ag.timer = seconds;
}

// The bones the hand hangs from (rest pose, model units: the model above) and the right palm on its forearm.
const PIVOT_BODY = [0, 0.3, -0.15] as const;
const PIVOT_ARM = [-0.085, 0.33, 0.15] as const;
const PIVOT_FORE = [-0.085, 0.17, 0.15] as const;
const PALM = [-0.085, 0.004, 0.2] as const;

/** Turn `p` about the x axis through `pivot` by `a` (the shader's pitch: + tips the front down). */
function pitch(p: Vector3, pivot: readonly [number, number, number], a: number): void {
  const y = p.y - pivot[1];
  const z = p.z - pivot[2];
  const c = Math.cos(a);
  const s = Math.sin(a);
  p.y = pivot[1] + c * y - s * z;
  p.z = pivot[2] + s * y + c * z;
}

/**
 * Where the snack is in its hands (model units, from its feet; +x its left,
 * +z ahead) for sitting `rest` and act `act`: the shader's chain from the
 * right palm up through the forearm, the arm and the body, as `faunaBoneRot`
 * turns them when it reaches or holds (no step or bob then); between both
 * hands while it reaches with both, or eats sitting.
 */
export function thiefHand(rest: number, act: number, out: Vector3): Vector3 {
  const sit = rest;
  const up = 1 - sit;
  const eat = Math.max(0, 1 - Math.abs(act - 3)) * sit;
  const reach = Math.max(0, 1 - Math.abs(act - 4)) * up;
  const carry = Math.min(1, Math.max(0, act - 4)) * up;
  const mouth = Math.min(1, Math.max(0, act - 3)) * sit;
  const both = Math.min(1, Math.max(0, (act - 3) * 0.5)) * sit;
  out.set(PALM[0], PALM[1], PALM[2]);
  pitch(out, PIVOT_FORE, -1.7 * eat - 1.5 * mouth - 1.4 * carry);
  pitch(out, PIVOT_ARM, 0.95 * sit - 1.9 * eat - 0.35 * mouth - 1.15 * carry - 2.0 * reach);
  pitch(out, PIVOT_BODY, -1.25 * sit - 0.55 * reach);
  out.x += -PALM[0] * Math.min(1, both + reach);
  out.y -= 0.205 * sit;
  return out;
}

/** The snack's size in its hands (m per body unit of the explorer's food: as in his hands, a little smaller; a coconut, a bowl more so). */
const FOOD_SCALE = BODY_UNIT_M * 1.4 * 0.85;
const FOOD_SIZE: Partial<Record<FoodKind, number>> = { coconut: 0.7, noodles: 0.85, riceBowl: 0.85 };
/** The thief is hidden past this distance from the camera (m, as the troops: land.ts `FAR`). */
const FAR = 190;
/** The snack in its hands: one group (shown at its stage), built when it takes one. */
const holder = new Group();
holder.name = 'fauna:thief-snack';
holder.visible = false;
let snack: { key: string; inner: Group; stages: Group[] } | null = null;
const _h = new Vector3();
const _box = new Box3();

/** Build the snack's blocks (the item the explorer held it by: the bowl, the bag, the stick, the cup), centred in the hands. */
function snackOf(f: ThiefFood): NonNullable<typeof snack> {
  const key = `${f.kind}|${f.colors?.join(',') ?? ''}`;
  if (snack?.key === key) return snack;
  if (snack) {
    for (const g of snack.stages) disposeVoxelMesh(g);
    snack.inner.removeFromParent();
  }
  const model = buildFood(f.kind, f.colors);
  const item = (model.left ?? model.right)!;
  const inner = new Group();
  const stages = item.stages.map((b, i) => {
    const g = buildVoxelMesh(b, { name: `fauna:thief-snack:${f.kind}:${i}`, castShadow: false });
    g.visible = i === 0;
    inner.add(g);
    return g;
  });
  // (a stick stands up in its fist, its top at the mouth; a bowl, bag, cup or coconut upright, a little under the mouth)
  const stick = f.kind === 'skewer' || f.kind === 'sweet';
  if (stick) inner.rotation.x = -Math.PI / 2;
  inner.updateMatrixWorld(true);
  _box.setFromObject(inner);
  const tall = _box.max.y - _box.min.y;
  _box.getCenter(_h);
  inner.position.sub(_h);
  inner.position.y -= tall * (stick ? 0.38 : 0.22);
  inner.scale.setScalar(FOOD_SIZE[f.kind] ?? 1);
  inner.position.multiplyScalar(FOOD_SIZE[f.kind] ?? 1);
  holder.add(inner);
  return (snack = { key, inner, stages });
}

/**
 * land.ts: the troops' macaques the thief may be (`members`), their ground, the map's survey (the way's tops) and
 * the part's group (the snack goes in it). Returns what land.ts does each step for the borrowed one instead of its
 * own life.
 */
export function linkThief(members: Agent[], ground: Ground, sv: Survey, parent: Object3D): { readonly agent: Agent | null; place(now: number, cam: { x: number; y: number; z: number }): void } {
  THIEF.members.length = 0;
  THIEF.members.push(...members);
  THIEF.ground = ground;
  const { field: f, cover, walk } = sv;
  // (templeGround's rules, _landPlaces.ts, less "flat all round": a step's edge is walked over, not sat on)
  THIEF.path = walk
    ? (x, z) => {
        const c = f.index(x, z);
        if (c < 0 || f.water[c] > -1000 || cover[c] & 2) return Number.NaN;
        const s = f.surface[c];
        if (s === SURFACE.bed || s === SURFACE.rock) return Number.NaN;
        const top = walk.topAt(x, z);
        if (top > f.height[c] + 3.2 || walk.ceilingAt(x, z, top + 0.05) - top < 0.6) return Number.NaN;
        return top;
      }
    : ground;
  parent.add(holder);
  return {
    get agent() {
      return THIEF.agent;
    },
    place(now, cam) {
      const ag = THIEF.agent;
      if (!ag) return;
      const p = THIEF.pose;
      const fl = ag.flock;
      const i = ag.i;
      const snap = THIEF.snap;
      // (what the troop, the nature book and the baby riders read: where it is)
      ag.x = ag.tx = p.x;
      ag.y = ag.gy = p.y;
      ag.z = ag.tz = p.z;
      ag.yaw = p.yaw;
      if (snap) fl.set(i, CH.gait, p.gait, now, true);
      fl.gait(i, p.gait, p.hz, now);
      fl.set(i, CH.rest, p.rest, now, snap);
      fl.set(i, CH.head, p.head, now, snap);
      fl.set(i, CH.turn, Math.round(p.turn * 10) / 10, now, snap);
      fl.set(i, CH.act, p.act, now, snap);
      const dx = p.x - cam.x;
      const dy = p.y - cam.y;
      const dz = p.z - cam.z;
      const seen = Math.sqrt(dx * dx + dy * dy + dz * dz) < FAR;
      if (seen) fl.place(i, p.x, p.y, p.z, p.yaw, ag.scale);
      else fl.hide(i);
      // The snack in its hands: where the shader puts them now (the eased channels), turned and sized with it.
      const f = THIEF.food;
      if (!f || !seen || f.size <= 0.01) {
        holder.visible = false;
        return;
      }
      const s = snackOf(f);
      const n = Math.min(Math.max(0, Math.round(f.stage)), s.stages.length - 1);
      for (let k = 0; k < s.stages.length; k++) s.stages[k].visible = k === n;
      thiefHand(fl.value(i, CH.rest, now), fl.value(i, CH.act, now), _h).multiplyScalar(ag.scale);
      const c = Math.cos(p.yaw);
      const sn = Math.sin(p.yaw);
      holder.position.set(p.x + c * _h.x + sn * _h.z, p.y + _h.y, p.z - sn * _h.x + c * _h.z);
      holder.rotation.set(0, p.yaw, 0);
      holder.scale.setScalar(FOOD_SCALE * ag.scale * f.size);
      holder.visible = true;
    },
  };
}
