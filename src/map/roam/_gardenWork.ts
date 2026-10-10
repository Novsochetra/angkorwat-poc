import { Vector3 } from 'three';
import { bigFruit, GARDEN_SPOT, gardenBody, gardenPose } from '../../character/gardenWork';
import { BODY_UNIT_M, WALK_SPEED } from '../../world/scale';
import { SFX } from '../audio/addonSfx';
import { ACTIONS, PICK_ACTION, type GardenAction } from '../garden/actions';
import { isTree, KINDS, stageOf, trunkAt, type PlantKindId } from '../garden/kinds';
import { GARDEN, type Plant } from '../garden/state';
import { pad } from '../pad/pad';
import { num, t } from '../ui/lang';
import { touchJump, type AddonEnv, type AddonHold, type AddonKey } from './_addons';
import { GardenHands } from './_gardenProps';
import type { FillSpot } from './_gardenSpots';
import { gardenMark, gardenSay, plantWord } from './_gardenToasts';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';
import { stepSound } from './walker';

/**
 * His work in the home garden (roam/_garden.ts starts it from the E row or the
 * seed card): it holds him (`holding`) from E to the end of the action, as the
 * farm's work does (roam/_farmWork.ts).
 *
 * 1. **To his place**: he walks (a calm pace, his footsteps) to where the work is
 *    done from — before the plant on his side of it, at the distance the action
 *    wants (`standOff`: the hoe's reach, the can's spout, the bamboo pole under
 *    the crown, the fallen fruit at the trunk's foot), round it where the ground
 *    there is not free — or before the jar or at the stream's edge; then turns
 *    to it. Planting, he is there already: the plant goes where the ring is.
 * 2. **The action** (garden/actions.ts: its beats are the clock): his posture
 *    (character/gardenWork.ts `gardenPose`, `postureFeet = false`), what is in his
 *    hands (roam/_gardenProps.ts `GardenHands`), each beat's sound and the lasting
 *    one (the water pouring, the can filling), and the garden's state at its beat:
 *    `set` the plant is planted (`GARDEN.plant`), `pour` it is watered, `full` the
 *    can is full, `take` the harvest goes into his basket (a toast: "4 × mango in
 *    your basket"), `out` the dead plant is gone.
 * 3. **The camera** comes a little closer and round to his side (the side it is
 *    on), lower for work on the ground, further back and higher for the bamboo
 *    pole in a mango's crown; eased back after.
 *
 * The stick held away stops it at once (before its beat, nothing changes: the seed
 * stays in his bag, the fruit on the tree); back to the map, another mode, a meal
 * begun stop it at once too. The touch Jump button is hidden meanwhile; the key
 * help says the stick stops.
 *
 * `freeze` (the URL's `gardenact=<action>:<t>`, roam/_garden.ts): he stands at
 * his work held at `t` s into the action, his things in his hands, the state of
 * the beats before `t` done: for pictures of the poses and the props.
 */

/** The stick held away this long (s) stops him. */
const PUSH = 0.15;
/** His walk to his place: a share of the walker's walking pace; given up after this long (s: he works from where he is). */
const PACE = 0.6;
const WALKER_PACE = 1.6;
const WALK_MAX = 4;
/** The camera at the work: round to his side (rad from behind him), its tilt (rad) and distance (m); the bamboo pole's, further and lower (the crown in view). */
const FRAME = { side: 1.2, pitch: 0.34, distance: 5.2, rate: 2.4, for: 1.6 };
const FRAME_POLE = { side: 1.3, pitch: 0.16, distance: 7.2 };
const FRAME_TREE = { side: 1.15, pitch: 0.24, distance: 6.0 };
/** The camera eases back to where it was over this (1/s). */
const BACK = 1.6;

/**
 * Where a plant's harvest is: how high over the ground (m) and how far out from the plant's middle toward him (m;
 * a tree's past its trunk). His reach (pickReach, pickCut) is ≤ ≈ 1.75 m on the map; the bamboo pole's fruit is up
 * under the crown (the mango's, the papaya's).
 */
const FRUIT_UP: Partial<Record<PlantKindId, number>> = {
  eggplant: 0.3,
  pumpkin: 0.12,
  corn: 1.2,
  guava: 1.6,
  jackfruit: 1.35,
  sugarcane: 0.07,
  banana: 1.45,
  papaya: 3.2,
  mango: 2.8,
};
const FRUIT_OUT: Partial<Record<PlantKindId, number>> = {
  eggplant: 0.1,
  pumpkin: 0.35,
  corn: 0.08,
  guava: 0.65,
  jackfruit: 0.12,
  sugarcane: 0.08,
  banana: 0.25,
  papaya: 0.2,
  mango: 2.1,
};
/** The fallen fruit he picks up lies this far out past the trunk (m), its middle this high. */
const FALLEN = { out: 0.6, up: 0.13 };
/** The water in the jar: this far in from its middle toward him (m, just inside the near rim), this high over the ground. */
const JAR_WATER = { in: 0.2, up: 0.6 };

export interface WorkReq {
  action: GardenAction;
  kind: PlantKindId;
  /** The plant worked on (water, pick, clear), or null (planting, filling). */
  plant: Plant | null;
  /** Planting: where the plant goes (m). */
  spot?: { x: number; z: number };
  /** Filling: the jar or the stream. */
  fill?: FillSpot;
}

interface Session {
  readonly req: WorkReq;
  phase: 'walk' | 'turn' | 'work';
  /** Seconds into the action; of the walk; the stick held away. */
  t: number;
  walkT: number;
  push: number;
  /** Where the work is (m: the plant's foot, the fruit, the water), where he stands, the way he faces. */
  readonly target: Vector3;
  readonly stand: Vector3;
  face: number;
  /** The work's place in his space (m: left, ahead), as the pose wants it. */
  sx: number;
  sz: number;
  /** Beats done. */
  readonly done: boolean[];
  /** Held at `t` (a check's picture). */
  frozen: boolean;
  /** Planting: the new plant's turn and variety (from where it is: the same every time). */
  yaw: number;
  seed: number;
}

let env: AddonEnv | null = null;
let hands: GardenHands | null = null;
const body = gardenBody('plant');
const posture = () => gardenPose(body);
let S: Session | null = null;
/** The camera before (eased back to after), the side it comes round to, how long it has been framed. */
let before: { pitch: number; distance: number } | null = null;
let side = 1;
let framed = 0;
let lastStep = 0;
let touchShown: string | null = null;

const _v = new Vector3();

const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
/** A number 0‥1 from a place (the same every time). */
const hashAt = (x: number, z: number, s: number) => {
  const v = Math.sin(x * 12.9898 + z * 78.233 + s * 37.719) * 43758.5453;
  return v - Math.floor(v);
};

/** World → his own space (BU): x his left, y up from his soles, z ahead. */
function toBody(ctx: RoamCtx, x: number, y: number, z: number, out: Vector3): Vector3 {
  const b = ctx.body;
  const k = 1 / (BODY_UNIT_M * b.scale);
  const dx = x - b.pos.x;
  const dz = z - b.pos.z;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return out.set((dx * c - dz * s) * k, (y - b.pos.y) * k, (dx * s + dz * c) * k);
}

/** The ground under his feet at (x, z): the land, or what he stands on near it (a low step of the yard). */
function groundAt(ctx: RoamCtx, x: number, z: number): number {
  const land = ctx.world.field.heightAt(x, z);
  const top = ctx.world.groundAt(x, z);
  return top - land < 0.6 ? top : land;
}

/**
 * Where the work should be in his space (m: `sx` to his left, `sz` ahead) for the action, as the poses are made for
 * (character/gardenWork.ts `GARDEN_SPOT`, in body units at his size): he stands so the work is there.
 */
function aimOf(a: GardenAction, kind: PlantKindId, up: number, scale: number, out: { sx: number; sz: number }): { sx: number; sz: number } {
  const bu = BODY_UNIT_M * scale;
  const G = GARDEN_SPOT;
  out.sx = 0;
  switch (a) {
    case 'pickReach':
      if (bigFruit(kind)) out.sz = 7.5 * bu;
      else {
        out.sx = G.reachX * bu;
        out.sz = G.pickReach * bu;
      }
      break;
    case 'pickCut':
      // (a cane's foot low before him; a banana bunch's stalk before his chest, a little nearer)
      out.sz = (up > 0.6 ? 6.5 : G.pickCut) * bu;
      break;
    case 'pickPole':
      out.sz = G.poleZ(up / bu) * bu;
      break;
    default:
      out.sz = G[a] * bu;
  }
  return out;
}

/** Where the work is on a plant (m) for the action, from the side `dx, dz` (unit, from the plant toward him). */
function targetOf(a: GardenAction, p: Plant, dx: number, dz: number, out: Vector3): Vector3 {
  const k = KINDS[p.kind];
  const ground = env!.world.field.heightAt(p.x, p.z);
  const trunk = trunkAt(k, stageOf(k, p.age));
  let off = 0;
  let up = 0;
  if (a === 'pickLow' || a === 'pickReach' || a === 'pickCut' || a === 'pickPole') {
    off = (isTree(k) ? trunk : 0) + (FRUIT_OUT[p.kind] ?? 0.1);
    up = FRUIT_UP[p.kind] ?? 1.2;
  } else if (a === 'pickGround') {
    off = trunk + FALLEN.out;
    up = FALLEN.up;
  } else if (a === 'water' && isTree(k)) off = trunk + 0.25;
  else if (a === 'clear') off = trunk;
  return out.set(p.x + dx * off, ground + up, p.z + dz * off);
}

/** Can he stand at (x, z) (not in water, nothing built there, on the work's level)? */
function standable(ctx: RoamCtx, x: number, z: number, level: number, plant: Plant | null): boolean {
  const w = ctx.world;
  if (w.waterAt(x, z) !== null) return false;
  const land = w.field.heightAt(x, z);
  if (Math.abs(land - level) > 0.6) return false;
  if (w.groundAt(x, z) - land > 0.3) return false;
  // (another plant's foot)
  for (const p of GARDEN.plants) if (p !== plant && Math.hypot(p.x - x, p.z - z) < 0.45) return false;
  return true;
}

const _aim = { sx: 0, sz: 0 };

/**
 * His place and facing for work at `target` with the work at (sx, sz) in his space: he stands `hypot(sx, sz)` from
 * it, looking `atan2(sx, sz)` to the right of it. `from` is the way (rad) from the target to him.
 */
function placeAt(target: Vector3, sx: number, sz: number, from: number, stand: Vector3): number {
  const d = Math.hypot(sx, sz);
  stand.set(target.x + Math.sin(from) * d, 0, target.z + Math.cos(from) * d);
  return from + Math.PI - Math.atan2(sx, sz);
}

/** His place for a plant: on his side of it, else round it where it is free; the work's place too. Returns his facing. */
function placeFor(ctx: RoamCtx, a: GardenAction, p: Plant, stand: Vector3, target: Vector3, aim: { sx: number; sz: number }): number {
  const b = ctx.body.pos;
  const base = Math.atan2(b.x - p.x, b.z - p.z);
  const level = ctx.world.field.heightAt(p.x, p.z);
  let face = 0;
  for (let i = 0; i < 12; i++) {
    const turn = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 6);
    const ang = base + turn;
    targetOf(a, p, Math.sin(ang), Math.cos(ang), target);
    aimOf(a, p.kind, target.y - level, ctx.body.scale, aim);
    face = placeAt(target, aim.sx, aim.sz, ang, stand);
    if (standable(ctx, stand.x, stand.z, level, p)) return face;
  }
  targetOf(a, p, Math.sin(base), Math.cos(base), target);
  aimOf(a, p.kind, target.y - level, ctx.body.scale, aim);
  return placeAt(target, aim.sx, aim.sz, base, stand);
}

function setPose(on: boolean): void {
  const ex = env?.explorer;
  if (!ex) return;
  if (on) {
    ex.animator.posture = posture;
    ex.animator.postureFeet = false;
  } else if (ex.animator.posture === posture) {
    ex.animator.posture = null;
    ex.animator.postureFeet = true;
  }
}

function touch(want: 'hide' | null): void {
  if (want === touchShown) return;
  touchShown = want;
  touchJump(want);
}

/**
 * The lasting sound of the action at `t` (audio/_garden.ts): on during its `loop` time, else 0 (it thins out by
 * itself). The pour's level is what the water falls on: 1 on a leafy plant (stage 2 on), 0.6 on bare earth (a seed,
 * a sprout).
 */
function loopLevel(s: Session | null, a: GardenAction, tt: number, on: boolean): void {
  const loop = ACTIONS[a].loop;
  if (!loop) return;
  let v = on && tt >= loop.from && tt < loop.to ? 1 : 0;
  const p = s?.req.plant;
  if (v && loop.sfx === 'gardenPour' && p && stageOf(KINDS[p.kind], p.age) < 2) v = 0.6;
  SFX.level(loop.sfx, v);
}

/** The state at a beat (the plant set, watered, picked, pulled out; the can full). */
function beatDone(s: Session, name: string, quiet: boolean): void {
  const r = s.req;
  const p = r.plant;
  if (name === 'set' && r.spot) {
    const np = GARDEN.plant(r.kind, r.spot.x, r.spot.z, s.yaw, s.seed);
    if (np && !quiet) gardenSay(t('gardenPlanted', { plant: plantWord(r.kind) }));
  } else if (name === 'pour' && p) GARDEN.water(p);
  else if (name === 'full') {
    GARDEN.fillCan();
    if (!quiet) gardenSay(t('gardenFilled', { n: num(GARDEN.can) }));
  } else if (name === 'take' && p) {
    // (the harvest is said first, then what follows from it: one kept to eat, roam/_gardenEat.ts)
    const mark = gardenMark();
    const n = GARDEN.pick(p);
    if (n > 0 && !quiet) {
      gardenSay(t('gardenPicked', { n: num(n), item: t(KINDS[p.kind].fruit.item) }), null, mark);
      pad.rumble('tick', 0.3);
    }
  } else if (name === 'out' && p) GARDEN.remove(p);
}

/** One beat crossed: its sound and its state. */
function beats(s: Session, from: number, to: number, quiet: boolean): void {
  const list = ACTIONS[s.req.action].beats;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (s.done[i] || b.at > to || b.at < from - 1e-6) continue;
    s.done[i] = true;
    if (b.sound && !quiet) SFX.play(b.sound, 0.85);
    beatDone(s, b.name, quiet);
  }
}

/** Has the action's state changed yet (its beat passed)? Before it, stopping changes nothing. */
function stateDone(s: Session): boolean {
  const list = ACTIONS[s.req.action].beats;
  for (let i = 0; i < list.length; i++) if (s.done[i] && (list[i].name === 'set' || list[i].name === 'pour' || list[i].name === 'full' || list[i].name === 'take' || list[i].name === 'out')) return true;
  return false;
}

/** The plant is still there (and it is still worth it: watered by the rain meanwhile, picked…). */
function stillThere(s: Session): boolean {
  const p = s.req.plant;
  return !p || GARDEN.plants.includes(p);
}

/** Walk toward `goal` (m) at `speed`, turning to the way; footsteps. True once there. */
function walkTo(ctx: RoamCtx, goal: Vector3, speed: number, dt: number): boolean {
  const b = ctx.body;
  const p = b.pos;
  const dx = goal.x - p.x;
  const dz = goal.z - p.z;
  const d = Math.hypot(dx, dz);
  const v = d > 0.04 ? Math.min(speed, 0.4 + d * 3) : 0;
  if (d > 0.04) {
    const k = Math.min(d, v * dt) / d;
    p.x += dx * k;
    p.z += dz * k;
    b.yaw += angleDiff(Math.atan2(dx, dz), b.yaw) * damp(10, dt);
  }
  settle(ctx, dt);
  b.explorer.setMotion(v / b.scale, true, 0);
  const phase = b.explorer.animator.phase;
  if (v > 0.25) {
    const crossed = (q: number) => (lastStep < q && phase >= q) || (phase < lastStep && (lastStep < q || phase >= q));
    if (crossed(0.25) || crossed(0.75)) ctx.sound(stepSound(ctx.world, p.x, ctx.world.field.heightAt(p.x, p.z), p.z), 0.45 + v * 0.1);
  }
  lastStep = phase;
  return d <= 0.04;
}

function settle(ctx: RoamCtx, dt: number): void {
  const p = ctx.body.pos;
  const y = groundAt(ctx, p.x, p.z);
  p.y += (y - p.y) * (dt > 0 ? damp(14, dt) : 1);
}

/** The camera: behind him on his way, round to his side at the work (eased for a while; the player's after). */
function frameCam(ctx: RoamCtx, s: Session, dt: number): void {
  const { cam, body: b, input } = ctx;
  const working = s.phase === 'work';
  const a = s.req.action;
  const low = a !== 'pickReach' && a !== 'pickPole' && a !== 'pickCut' && a !== 'water';
  if (input.lookYaw || input.lookPitch || input.zoom) framed = FRAME.for;
  const h = 1.7 * b.scale;
  const fy = b.pos.y + (!working ? h * 0.86 : a === 'pickPole' ? h * 1.05 : low ? h * 0.5 : h * 0.72);
  cam.focus.x = b.pos.x;
  cam.focus.z = b.pos.z;
  cam.focus.y += (fy - cam.focus.y) * damp(6, dt);
  cam.behindYaw = b.yaw;
  cam.follow = working ? 0 : 0.6;
  if (!working || framed >= FRAME.for) return;
  framed += dt;
  const kind = KINDS[s.req.kind];
  const want = a === 'pickPole' ? FRAME_POLE : isTree(kind) && a !== 'plantTree' && a !== 'fill' ? FRAME_TREE : FRAME;
  const k = damp(FRAME.rate, dt);
  cam.yaw += angleDiff(b.yaw + want.side * side, cam.yaw) * k;
  cam.pitch += (want.pitch - cam.pitch) * k;
  cam.distance += (Math.min(Math.max(want.distance, cam.minDistance), cam.maxDistance) - cam.distance) * k;
}

/** Stop now: his hands empty, the posture off, the sounds quiet. */
function finish(ctx: RoamCtx | null): void {
  const s = S;
  if (!s) return;
  S = null;
  setPose(false);
  hands?.clear();
  loopLevel(s, s.req.action, 0, false);
  touch(null);
  if (ctx) ctx.body.explorer.setMotion(0, true, 0);
}

const KEYS: readonly AddonKey[] = [
  ['W A S D', 'gardenKeyStop', 'lstick'],
  ['Q R', 'rLook', 'rstick'],
];

export const GardenWork = {
  init(e: AddonEnv): void {
    env = e;
  },
  get active(): boolean {
    return S !== null;
  },
  /** The action under way and how far into it (s), for the checks and the bug report. */
  get now(): { action: GardenAction; t: number; phase: string; kind: PlantKindId; plant: number | null } | null {
    return S ? { action: S.req.action, t: +S.t.toFixed(2), phase: S.phase, kind: S.req.kind, plant: S.req.plant?.id ?? null } : null;
  },

  /** Begin (E, the seed card). */
  start(ctx: RoamCtx, req: WorkReq): boolean {
    if (!env || S) return false;
    const b = ctx.body;
    const target = new Vector3();
    const stand = new Vector3();
    let face = b.yaw;
    const aim = _aim;
    if (req.action === 'plant' || req.action === 'plantTree') {
      if (!req.spot || GARDEN.seeds(req.kind) <= 0) return false;
      target.set(req.spot.x, ctx.world.field.heightAt(req.spot.x, req.spot.z), req.spot.z);
      aimOf(req.action, req.kind, 0, b.scale, aim);
      // (a short step to the hoe's reach: from where he stands, toward the spot)
      face = placeAt(target, aim.sx, aim.sz, Math.atan2(b.pos.x - target.x, b.pos.z - target.z), stand);
    } else if (req.action === 'fill') {
      const f = req.fill;
      if (!f) return false;
      aimOf('fill', req.kind, 0, b.scale, aim);
      const from = Math.atan2(b.pos.x - f.x, b.pos.z - f.z);
      if (f.at === 'jar') {
        // (the water's surface just inside the jar's near rim)
        target.set(f.x + Math.sin(from) * JAR_WATER.in, ctx.world.field.heightAt(f.x, f.z) + JAR_WATER.up, f.z + Math.cos(from) * JAR_WATER.in);
        face = placeAt(target, aim.sx, aim.sz, from, stand);
      } else {
        // (at the stream's edge: back from the water until he is on the bank)
        target.set(f.x, f.y, f.z);
        let d = Math.hypot(aim.sx, aim.sz);
        face = placeAt(target, aim.sx, aim.sz, from, stand);
        for (let i = 0; i < 12 && ctx.world.waterAt(stand.x, stand.z) !== null; i++) {
          d += 0.1;
          stand.set(target.x + Math.sin(from) * d, 0, target.z + Math.cos(from) * d);
        }
      }
    } else {
      const p = req.plant;
      if (!p) return false;
      face = placeFor(ctx, req.action, p, stand, target, aim);
    }
    const sx = req.spot?.x ?? target.x;
    const sz = req.spot?.z ?? target.z;
    S = {
      req,
      phase: Math.hypot(stand.x - b.pos.x, stand.z - b.pos.z) > 0.08 ? 'walk' : 'turn',
      t: 0,
      walkT: 0,
      push: 0,
      target,
      stand,
      face,
      sx: aim.sx,
      sz: aim.sz,
      done: ACTIONS[req.action].beats.map(() => false),
      frozen: false,
      yaw: hashAt(sx, sz, 1) * Math.PI * 2,
      seed: hashAt(sx, sz, 2),
    };
    hands ??= new GardenHands(env.explorer);
    body.action = req.action;
    body.kind = req.kind;
    body.t = 0;
    body.life = 0;
    before ??= { pitch: ctx.cam.pitch, distance: ctx.cam.distance };
    // (the camera comes round on the side it is on already)
    side = angleDiff(ctx.cam.yaw, b.yaw) >= 0 ? 1 : -1;
    framed = 0;
    b.vel.set(0, 0, 0);
    touch('hide');
    return true;
  },

  /** A check's picture: start it and hold it at `t` s in, his place reached, the state of the beats before `t` done. */
  freeze(ctx: RoamCtx, req: WorkReq, tt: number): boolean {
    if (!this.start(ctx, req)) return false;
    const s = S!;
    const b = ctx.body;
    b.pos.x = s.stand.x;
    b.pos.z = s.stand.z;
    b.pos.y = groundAt(ctx, b.pos.x, b.pos.z);
    b.yaw = s.face;
    s.phase = 'work';
    s.frozen = true;
    s.t = Math.max(0, Math.min(ACTIONS[req.action].len - 0.01, tt));
    beats(s, 0, s.t, true);
    setPose(true);
    if (s.req.plant || s.req.action === 'fill' || s.req.spot) toBody(ctx, s.target.x, s.target.y, s.target.z, body.spot);
    body.action = req.action;
    body.kind = req.kind;
    body.t = s.t;
    hands?.update(req.action, s.t, req.kind, body.spot, req.plant ? req.plant.seed : null);
    const ex = b.explorer;
    ex.object.position.copy(b.pos);
    ex.object.rotation.set(0, b.yaw, 0);
    for (let i = 0; i < 40; i++) ex.update(1 / 30);
    // The camera there at once (or the URL's `rcam=`).
    const rc = ctx.start.get('rcam')?.split(',').map(Number);
    const kind = KINDS[req.kind];
    const want = req.action === 'pickPole' ? FRAME_POLE : isTree(kind) && req.action !== 'plantTree' && req.action !== 'fill' ? FRAME_TREE : FRAME;
    const cam = ctx.cam;
    cam.yaw = b.yaw + (rc && Number.isFinite(rc[0]) ? (rc[0] * Math.PI) / 180 : want.side);
    cam.pitch = rc && Number.isFinite(rc[1]) ? (rc[1] * Math.PI) / 180 : want.pitch;
    cam.distance = rc && rc[2] ? rc[2] : want.distance;
    framed = FRAME.for;
    frameCam(ctx, s, 0);
    cam.focus.y = b.pos.y + 1.7 * b.scale * (req.action === 'pickPole' ? 1.05 : 0.6);
    console.info(`[map] garden: ${req.action}:${s.t.toFixed(2)} (${req.kind}${req.plant ? ` #${req.plant.id}` : ''}) at (${b.pos.x.toFixed(1)}, ${b.pos.z.toFixed(1)})`);
    return true;
  },

  hold(ctx: RoamCtx, dt: number): AddonHold {
    const s = S;
    if (!s) return { prompt: null };
    const { body: b, input } = ctx;
    const ex = b.explorer;
    ctx.cam.turn(input.lookYaw, input.lookPitch, input.zoom);
    // (a meal begun, the plant gone meanwhile: he stops at once)
    if (ex.foodHeld || (!stillThere(s) && !stateDone(s))) {
      finish(ctx);
      return { prompt: null };
    }
    // The stick held away stops him (on his way: at once).
    const push = Math.hypot(input.move.x, input.move.y) > 0.5;
    s.push = push ? s.push + dt : 0;
    if (push && (s.frozen || s.phase !== 'work' || s.push > PUSH)) {
      finish(ctx);
      return { prompt: null };
    }
    const speed = WALK_SPEED * b.scale * WALKER_PACE * PACE;
    switch (s.phase) {
      case 'walk': {
        s.walkT += dt;
        if (walkTo(ctx, s.stand, speed, dt) || s.walkT > WALK_MAX) {
          s.phase = 'turn';
          // (the way to the plant from where he is now)
          s.face = Math.atan2(s.target.x - b.pos.x, s.target.z - b.pos.z) - Math.atan2(s.sx, s.sz);
        }
        break;
      }
      case 'turn': {
        settle(ctx, dt);
        ex.setMotion(0, true, 0);
        b.yaw += angleDiff(s.face, b.yaw) * damp(10, dt);
        if (Math.abs(angleDiff(s.face, b.yaw)) < 0.06) {
          b.yaw = s.face;
          s.phase = 'work';
          setPose(true);
          toBody(ctx, s.target.x, s.target.y, s.target.z, body.spot);
        }
        break;
      }
      case 'work': {
        settle(ctx, dt);
        ex.setMotion(0, true, 0);
        b.vel.set(0, 0, 0);
        const was = s.t;
        if (!s.frozen) s.t += dt;
        body.life += dt;
        beats(s, was, s.t, s.frozen);
        body.action = s.req.action;
        body.t = s.t;
        body.kind = s.req.kind;
        body.spot.lerp(toBody(ctx, s.target.x, s.target.y, s.target.z, _v), damp(12, dt));
        hands?.update(s.req.action, s.t, s.req.kind, body.spot, s.req.plant ? s.req.plant.seed : null);
        loopLevel(s, s.req.action, s.t, s.frozen ? false : true);
        if (s.t >= ACTIONS[s.req.action].len) {
          finish(ctx);
          return { prompt: null };
        }
        break;
      }
    }
    if (S) frameCam(ctx, s, dt);
    return { prompt: null };
  },

  keys(): readonly AddonKey[] | null {
    return S ? KEYS : null;
  },

  /** Back from the work: the camera eases to where it was (unless the player zooms). */
  after(ctx: RoamCtx, dt: number): void {
    if (S || !before) return;
    if (ctx.input.zoom) {
      before = null;
      return;
    }
    const k = damp(BACK, dt);
    ctx.cam.pitch += (before.pitch - ctx.cam.pitch) * k;
    ctx.cam.distance += (before.distance - ctx.cam.distance) * k;
    ctx.cam.follow = 0.6;
    if (Math.abs(before.pitch - ctx.cam.pitch) < 0.005 && Math.abs(before.distance - ctx.cam.distance) < 0.05) before = null;
  },

  /** Stop at once (back to the map, another mode). */
  stop(ctx: RoamCtx | null, overview = false): void {
    finish(ctx);
    if (overview) before = null;
  },
};

/** The action for picking a plant. */
export const pickAction = (k: PlantKindId): GardenAction => PICK_ACTION[KINDS[k].fruit.pick];
/** The action for planting a kind. */
export const plantAction = (k: PlantKindId): GardenAction => (isTree(KINDS[k]) ? 'plantTree' : 'plant');
