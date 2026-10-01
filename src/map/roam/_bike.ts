import { AdditiveBlending, CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three';
import { BIKE, bikePose, bikeState, STOP_LEAN, WHEELBASE } from '../../character/bike';
import { BODY_UNIT_M } from '../../world/scale';
import '../audio/_bike';
import { SFX } from '../audio/addonSfx';
import { Things } from '../people/_things';
import { pad } from '../pad/pad';
import type { MapFrame, RoamMode } from '../types';
import { lang, t } from '../ui/lang';
import { registerAddon, type AddonEnv } from './_addons';
import { BikeModel, type BikeTurns } from './_bikeModel';
import { BIKE_SPOTS, type BikeSpot } from './_bikeSpots';
import { angleDiff } from './followCam';
import type { RoamCtx, RoamWorld } from './types';
import { stepSound } from './walker';

/**
 * Bicycles to ride (ជិះកង់): black Khmer town bicycles stand on their side
 * stands at four places in the roaming area (_bikeSpots.ts: by the head of
 * Angkor Wat's road, at the morning market, at the sugar-palm village's west
 * end, at the little market behind Angkor Wat; badges on the maps).
 * On foot beside one, E ("E  Ride the bicycle"): he steps over, flips the
 * stand up and sits on, his left foot down.
 *
 * Riding (a walk-mode add-on that holds him, as the rope swing does): W
 * pedals (the speed builds up), Shift pedals hard, S brakes, and held once
 * stopped walks it back slowly; A / D steer the front wheel (a real turning
 * circle: tight at a walking pace, wide at speed) and he leans into the turn
 * with the bicycle; Space rings the bell (kring-kring); E gets off (braking
 * first if it rolls): he steps off to the side and the bicycle stays on its
 * stand where he left it. Back to the map, every bicycle goes back to its place.
 *
 * It follows the walk map (`world.standAt`): the roads, paths, fields and
 * temple courtyards; small steps (up to `BUMP`) it bumps over; up a stair or a
 * land step, or down one, it stops (a message: get off to climb), and it
 * stops at the bank of deep water; it slows up a rise and coasts down one,
 * slides along a wall it meets at a slant and stops against one head on, and
 * keeps inside the roaming area as he does walking (the mist's edge slows it).
 * The people step aside for him as for him on foot (people/_routes.ts reads
 * him in walk mode).
 *
 * His posture (character/bike.ts): seated, the fists on the grips, the boots
 * on the pedals (both by IK), pedalling in time with the cranks, a foot down
 * when stopped, leaning with the bicycle. The wheels and the cranks turn by
 * the way rolled; the follow camera rides behind, a little further back at
 * speed. His lantern goes away while he rides (`handsBusy`); at night the
 * bicycle's dynamo lamp lights the road ahead while it rolls. Sounds
 * (audio/_bike.ts): the chain as he pedals, the freewheel ticking as he
 * coasts, the tyres on earth, grass or stone, a bump, the brake, the stand,
 * the bell.
 *
 * URL (checks): `bike=ride` starts him on the nearest bicycle at `at=`
 * (facing `yaw=`), `bike=ride:<m/s>` already rolling; `bikeleft=<spot>:x:z:yaw,…`
 * a bicycle left away from its place (bug reports give both).
 */

/** Speeds (m/s, at his roaming size): pedalling, pedalling hard, walking it back; the most it ever goes. */
const V_EASY = 9;
const V_HARD = 13;
const V_BACK = 1.1;
const V_MAX = 16;
/** Pedalling's push (m/s² from a standstill), hard; the brakes; getting off (gentler). */
const PUSH = 4.2;
const PUSH_HARD = 6;
const BRAKE = 7;
const BRAKE_OFF = 4.5;
/** Rolling resistance on each ground (m/s²), the air's (per (m/s)²). */
const ROLL = { dirt: 0.2, grass: 0.45, stone: 0.12, sand: 0.9, water: 1.6 } as const;
type Ground = keyof typeof ROLL;
const AIR = 0.0055;
/** Hardest sideways pull in a turn (m/s²): the tightest turn at a speed (a real turning circle), and the most it leans (rad). */
const LAT = 6.5;
const STEER_MAX = 0.62;
/** Stopped, A / D shuffle it round with his foot down (rad/s). */
const PIVOT = 0.9;
const LEAN_MAX = 0.6;
/** Highest step the wheels bump over, deepest they drop down, and the most water they roll through (m). */
const BUMP = 0.42;
const DROP = 0.45;
const DEEP = 0.38;
/** Room he needs over the ground riding (m, his head at the roaming size). */
const ROOM = 2.3;
/** A move's longest step (m). */
const SUBSTEP = 0.15;
/** The roaming area's edge slows him from this far in (m), as on foot. */
const EDGE_SOFT = 8;
/** Seconds to get on and off; how near the bicycle's middle he must stand to get on (m) and how level with it. */
const MOUNT = 0.6;
const DISMOUNT = 0.55;
const REACH = 1.7;
const RISE = 1.2;
/** A parked bicycle leans on its stand this far (rad, to its left), its bars turned a little that way. */
const PARK_LEAN = 0.1;
const PARK_STEER = 0.28;
/** Stopped, the pedals come round to here (the right pedal up and forward, ready to push off). */
const PARK_CRANK = -2.25;
/** How far ahead of the saddle point the lamp's pool of light lies on the ground, and its size (m). */
const POOL_AHEAD = 6.5;
const POOL = { w: 2.6, l: 9.5 };

/**
 * Probes of the bicycle and him (m at the roaming size: along from the saddle
 * point, + ahead; across, + to his left): the tyres' ends, the pedals, the
 * bars and his shoulders, the basket. Each must have ground within `BUMP` of
 * the wheels and `ROOM` over it.
 */
const PROBES: readonly (readonly [number, number])[] = [
  [-0.74, 0],
  [-0.38, 0.22],
  [-0.38, -0.22],
  [0.12, 0.34],
  [0.12, -0.34],
  [0.62, 0.32],
  [0.62, -0.32],
  [1.08, 0],
];
const FRONT_PROBE = PROBES.length - 1;
const REAR_PROBE = 0;
/** The probes that lead going ahead (the bars, the basket) and going back (the back tyre, the rack). */
const AHEAD = [5, 6, 7];
const BEHIND = [0, 1, 2];
/** A stair's highest riser, and a land step's height (m): what he could walk up from the bicycle (the rest are walls to it). */
const RISER = 0.65;
const LAND_STEP = [1.6, 2.4];
/** Beside the leading probe (m across): a step there too is a stair or a land step, not a post. */
const ACROSS = [0.3, -0.3];
/** Turns tried to slide along a wall (rad from the way it goes), and how fast the bicycle turns to run along it (rad/s). */
const SLIDES = [0.35, -0.35, 0.7, -0.7, 1.05, -1.05];
const SLIDE_TURN = 1.6;
const LOOPS = ['bikeChain', 'bikeFree', 'bikeDirt', 'bikeGrass', 'bikeStone'];

interface Bike {
  readonly spot: BikeSpot;
  readonly model: BikeModel;
  /** The point on the ground under its saddle (m) and its heading. */
  readonly pos: Vector3;
  yaw: number;
  /** As drawn: its lean (+ its left side down), pitch (+ front down) and turns. */
  lean: number;
  pitch: number;
  readonly turns: BikeTurns;
  /** Not where its place has it (he rode it off). */
  moved: boolean;
}

type Phase = 'off' | 'mount' | 'ride' | 'dismount';
/** What blocks a move: nothing, a wall, a step up (stairs, a land step), a drop, deep water. */
type Block = 'ok' | 'wall' | 'up' | 'down' | 'deep';

let env: AddonEnv | null = null;
/** The roaming mode now (a URL's `bike=ride` only on foot). */
let roamMode: RoamMode = 'overview';
let things: Things | null = null;
const bikes: Bike[] = [];
let ride: Bike | null = null;
let phase: Phase = 'off';
/** Getting on or off: 0‥1. */
let u = 0;
const from = new Vector3();
const to = new Vector3();
let fromYaw = 0;
/** Getting off: how far he turns toward where he steps (rad, + to his left). */
let offTurn = 0;
const _side = new Vector3();
/** Along the heading (m/s, − backwards). */
let v = 0;
let steer = 0;
let lean = 0;
let pitch = 0;
let crank = 0;
let wheel = 0;
/** The eased heights of the wheels (m), the ground under them now and the step before. */
let wr = 0;
let wf = 0;
let gr = 0;
let gf = 0;
let gr0 = 0;
let gf0 = 0;
/** 0 riding ‥ 1 a foot down; walking it back (0‥1) and its steps; how long S has been held at a stop (s). */
let down = 1;
let back = 0;
let walk = 0;
let backWait = 0;
let effort = 0;
let bump = 0;
/** E pressed while rolling: braking to get off. */
let leaving = false;
let braked = false;
/** The ride's own clock (s: shots run their steps with the frame's time standing still). */
let clock = 0;
/** When the next bell, message and bump sound may come (`clock`). */
let bellAt = 0;
let toastAt = 0;
let bumpAt = 0;
let edgeToast = 0;
/** When he got on (`clock`): the keys show over him a few seconds. */
let onAt = 0;
/** The ground under the wheels (`stepSound` asked a few times a second) and the tyres' sound on it. */
let ground: Ground = 'dirt';
let groundAt = 0;
let lastSound = '';
/** The player's camera distance (the speed's extra goes on top) and the extra now; how strongly it followed before (put back after). */
let camBase = 9;
let camExtra = 0;
let followWas = 0.6;
/** The lamp's light on the ground ahead (at night while he rides). */
let pool: Mesh | null = null;
let poolMat: MeshBasicMaterial | null = null;
/** The prompts in the language in use (made again when it changes). */
let words = '';
let offerText = '';
let rideText = '';

const ps = bikeState();
const posture = () => bikePose(ps);

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const ease = (x: number) => {
  const c = clamp(x, 0, 1);
  return c * c * (3 - 2 * c);
};
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/** Metres at the roaming size → at his size now. */
const sc = (ctx: RoamCtx) => ctx.body.scale / 1.4;
/** A body unit in metres at his size now. */
const buM = (ctx: RoamCtx) => BODY_UNIT_M * ctx.body.scale;

function prompts(): void {
  if (words === lang()) return;
  words = lang();
  offerText = `E  ${t('bikeRide')}`;
  rideText = `E  ${t('bikeOff')}  ·  Space  ${t('bikeBell')}`;
}

// ── The bicycles on the map ────────────────────────────────────────────────

function build(e: AddonEnv): void {
  if (things) return;
  things = new Things(BIKE_SPOTS.reduce((n, s) => n + BikeModel.boxes(s.seed), 0));
  things.mesh.name = 'roam:bikes';
  e.scene.add(things.mesh);
  for (const spot of BIKE_SPOTS) {
    const model = new BikeModel(things, spot.seed);
    const b: Bike = { spot, model, pos: new Vector3(), yaw: 0, lean: 0, pitch: 0, turns: { steer: 0, front: 0, rear: 0, crank: PARK_CRANK, stand: 1, lamp: 0 }, moved: false };
    bikes.push(b);
    home(b, e.world);
  }
  // The dynamo lamp's pool of light on the ground ahead: a soft warm oval (long along the road, nothing at
  // the canvas's edges), added to the ground's light.
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.scale(1, 2);
  const grad = g.createRadialGradient(32, 34, 2, 32, 34, 29);
  grad.addColorStop(0, 'rgba(255, 228, 176, 1)');
  grad.addColorStop(0.4, 'rgba(255, 214, 156, 0.6)');
  grad.addColorStop(0.75, 'rgba(255, 204, 144, 0.18)');
  grad.addColorStop(1, 'rgba(255, 200, 140, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  poolMat = new MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, color: 0xffd9a0 });
  poolMat.name = 'roam:bike lamp';
  pool = new Mesh(new PlaneGeometry(1, 1), poolMat);
  pool.name = 'roam:bike lamp';
  pool.rotation.order = 'YXZ';
  pool.visible = false;
  pool.renderOrder = 2;
  pool.raycast = () => {};
  e.scene.add(pool);
}

/** Back to its place, on its stand. */
function home(b: Bike, world: RoamWorld): void {
  const s = b.spot;
  b.pos.set(s.x, groundUnder(world, s.x, s.z), s.z);
  b.yaw = s.yaw;
  park(b);
  b.turns.crank = PARK_CRANK;
  b.moved = false;
}

/** On its stand where it is: leaning on it, the bars turned a little, the lamp off (the pedals as he left them). */
function park(b: Bike): void {
  b.lean = PARK_LEAN;
  b.pitch = 0;
  b.turns.steer = PARK_STEER;
  b.turns.stand = 1;
  b.turns.lamp = 0;
}

/** The ground at (x, z) for a bicycle standing on the land (a low floor on it too: not a rail, a roof or a bridge over it). */
function groundUnder(world: RoamWorld, x: number, z: number): number {
  const land = world.field.heightAt(x, z);
  const g = world.standAt?.(x, z, land + 0.1, 0.4, ROOM);
  return g !== undefined && !Number.isNaN(g) ? g : land;
}

/** The bicycle he could get on from (x, y, z), or null. */
function near(x: number, y: number, z: number, s: number): Bike | null {
  let best: Bike | null = null;
  let bd = REACH * s;
  for (const b of bikes) {
    // (from its middle, between the wheels)
    const mx = b.pos.x + Math.sin(b.yaw) * 0.17 * s;
    const mz = b.pos.z + Math.cos(b.yaw) * 0.17 * s;
    const d = Math.hypot(x - mx, z - mz);
    if (d < bd && Math.abs(y - b.pos.y) < RISE) {
      bd = d;
      best = b;
    }
  }
  return best;
}

// ── Where it can go ────────────────────────────────────────────────────────

/** The ground under the probes and the wheels last tested (m); each probe's step up (m, NaN: a wall), or none. */
const probeY = new Float64Array(PROBES.length);
const stepY = new Float64Array(PROBES.length);
let rearY = 0;
let frontY = 0;

/**
 * Can the bicycle stand with its saddle point at (x, z) heading `yaw`, its
 * wheels at height `y`? Fills `rearY` / `frontY` (the ground under the
 * wheels) and says what blocks it, if anything: a step he could walk up
 * (stairs, a land step: across the way it goes, `dir`), a drop, deep water,
 * else a wall (a post, a rail, a stall: it slides along those). `loose`: it is
 * caught in something already; only the wheels count, and any way out is fine
 * but over a cliff.
 */
function test(ctx: RoamCtx, x: number, z: number, yaw: number, y: number, dir: number, loose = false): Block {
  const w = ctx.world;
  const k = sc(ctx);
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  // (his left: +x of his own space)
  const lx = Math.cos(yaw);
  const lz = -Math.sin(yaw);
  const room = ROOM * k;
  const bu = BODY_UNIT_M * ctx.body.scale;
  rearY = wheelGround(w, x + fx * BIKE.rear * bu, z + fz * BIKE.rear * bu, y, k);
  frontY = wheelGround(w, x + fx * BIKE.front * bu, z + fz * BIKE.front * bu, y, k);
  if (loose) return Number.isNaN(rearY) || Number.isNaN(frontY) || Math.min(rearY, frontY) < y - 2.5 * k ? 'wall' : 'ok';
  let blocked = 0;
  let deep = false;
  for (let i = 0; i < PROBES.length; i++) {
    const [a, c] = PROBES[i];
    const px = x + (fx * a + lx * c) * k;
    const pz = z + (fz * a + lz * c) * k;
    const g = w.standAt ? w.standAt(px, pz, y, BUMP * k, room) : w.groundAt(px, pz);
    probeY[i] = g;
    stepY[i] = -Infinity;
    if (Number.isNaN(g) || g > y + BUMP * k) {
      // (what is there: a step he could walk up, or a wall)
      stepY[i] = w.standAt ? w.standAt(px, pz, y, 2.4 * k, room) : NaN;
      blocked++;
      continue;
    }
    const water = w.waterAt(px, pz);
    if (water !== null && water > g + DEEP * k) deep = true;
  }
  if (blocked) {
    // A step up: across the way it goes (the leading probes, the middle one among them; or beside the middle
    // one too, where it meets the step first), not a post or a rail.
    const lead = dir >= 0 ? AHEAD : BEHIND;
    const mid = dir >= 0 ? FRONT_PROBE : REAR_PROBE;
    // (as high as a stair's riser or a land step: not a table, a stall's counter, a kerb or a low wall)
    const rise = (stepY[mid] - y) / k;
    if (!(rise > BUMP && (rise <= RISER || (rise >= LAND_STEP[0] && rise <= LAND_STEP[1])))) return 'wall';
    let ups = 0;
    for (const i of lead) if (stepY[i] > y + BUMP * k) ups++;
    if (ups >= 2) return 'up';
    const a = PROBES[mid][0];
    for (const c of ACROSS) {
      const g = w.standAt ? w.standAt(x + (fx * a + lx * c) * k, z + (fz * a + lz * c) * k, y, 2.4 * k, room) : NaN;
      if (!(g > y + BUMP * 0.8 * k)) return 'wall';
    }
    return 'up';
  }
  if (Number.isNaN(rearY) || Number.isNaN(frontY)) return 'wall';
  // (down a bank into deep water: the water stops it, not the drop)
  if (deep) return 'deep';
  if (frontY < y - DROP * k || rearY < y - DROP * k || probeY[FRONT_PROBE] < y - DROP * k || probeY[REAR_PROBE] < y - DROP * k) return 'down';
  if (!w.inBounds(x + fx * 1.1 * k * Math.sign(dir || 1), z + fz * 1.1 * k * Math.sign(dir || 1)) && w.inBounds(ctx.body.pos.x, ctx.body.pos.z)) return 'wall';
  return 'ok';
}

/** The ground a wheel touches at (x, z) from height `y` (NaN: a wall). */
function wheelGround(w: RoamWorld, x: number, z: number, y: number, k: number): number {
  return w.standAt ? w.standAt(x, z, y, BUMP * k, ROOM * k) : w.groundAt(x, z);
}

/** A short message (not again for a few seconds). */
function say(ctx: RoamCtx, key: 'bikeUp' | 'bikeDown' | 'bikeDeep'): void {
  if (clock < toastAt) return;
  toastAt = clock + 4;
  ctx.hud.toast(t(key));
}

/** A knock against something (a sound and the pad's shake for a hard one). */
function knock(speed: number): void {
  if (speed < 1.2 || clock < bumpAt) return;
  bumpAt = clock + 0.35;
  SFX.play('bikeBump', clamp(speed / 6, 0.3, 1));
  if (speed > 4) pad.rumble('land', clamp(speed / 10, 0.3, 0.8));
}

/**
 * Move along the heading by `d` m (− backwards), turning `turn` rad on the
 * way, in short steps: bumping over small steps, sliding along a wall met at a
 * slant, stopping at a step, a drop, deep water or a wall met head on.
 */
function move(ctx: RoamCtx, d: number, turn: number, dt: number): void {
  const body = ctx.body;
  const pos = body.pos;
  const k = sc(ctx);
  const n = Math.max(1, Math.ceil(Math.abs(d) / (SUBSTEP * k)));
  // (the most it turns to run along a wall each step)
  const most = (SLIDE_TURN * dt) / n;
  const y = wr + (wf - wr) * (-BIKE.rear / WHEELBASE);
  // (caught in something already, e.g. put there by a URL: only the wheels count, any way out is fine)
  const loose = test(ctx, pos.x, pos.z, body.yaw, y, Math.sign(d)) === 'wall';
  for (let i = 0; i < n; i++) {
    let ds = d / n;
    const yaw = body.yaw + turn / n;
    // The soft edge of the roaming area: slower and slower towards it (as on foot).
    if (ctx.world.edgeDistance) {
      const fx = Math.sin(yaw) * Math.sign(ds);
      const fz = Math.cos(yaw) * Math.sign(ds);
      const d0 = ctx.world.edgeDistance(pos.x, pos.z);
      const d1 = ctx.world.edgeDistance(pos.x + fx * Math.abs(ds) * 4, pos.z + fz * Math.abs(ds) * 4);
      if (d1 < EDGE_SOFT && d1 < d0) {
        const slow = Math.max(0, d1 / EDGE_SOFT) ** 1.5;
        ds *= slow;
        v *= 1 - (1 - slow) * 0.2;
        if (slow < 0.15 && clock > edgeToast) {
          ctx.hud.toast(t('rMist'));
          edgeToast = clock + 8;
        }
      }
    }
    const nx = pos.x + Math.sin(yaw) * ds;
    const nz = pos.z + Math.cos(yaw) * ds;
    const b = test(ctx, nx, nz, yaw, y, ds, loose);
    if (b === 'ok') {
      pos.x = nx;
      pos.z = nz;
      body.yaw = yaw;
      gr = rearY;
      gf = frontY;
      continue;
    }
    if (b === 'wall') {
      // Met at a slant: slide along it (the bicycle turns to run along it, losing the speed that went into it).
      let slid = false;
      for (const a of SLIDES) {
        const sy = yaw + a;
        const sx = pos.x + Math.sin(sy) * ds * Math.cos(a);
        const sz = pos.z + Math.cos(sy) * ds * Math.cos(a);
        const turnTo = clamp(a * 0.35, -most, most);
        if (test(ctx, sx, sz, body.yaw + turnTo, y, ds, loose) !== 'ok') continue;
        pos.x = sx;
        pos.z = sz;
        body.yaw += turnTo;
        gr = rearY;
        gf = frontY;
        if (Math.abs(a) > 0.5) knock(Math.abs(v) * Math.sin(Math.abs(a)));
        v *= 1 - 0.25 * Math.abs(Math.sin(a));
        slid = true;
        break;
      }
      if (slid) continue;
      // Head on: it stops.
      knock(Math.abs(v));
      v = 0;
      return;
    }
    // A step up or down, deep water: it stops there (he must get off to go on; backing, it just stops).
    if (ds > 0) say(ctx, b === 'up' ? 'bikeUp' : b === 'down' ? 'bikeDown' : 'bikeDeep');
    knock(Math.abs(v) * 0.6);
    v = 0;
    return;
  }
}

// ── Getting on, riding, getting off ────────────────────────────────────────

function start(ctx: RoamCtx, b: Bike, at = false): void {
  const e = env!;
  ride = b;
  phase = at ? 'ride' : 'mount';
  u = 0;
  from.copy(ctx.body.pos);
  fromYaw = ctx.body.yaw;
  if (at) {
    // (a check: the bicycle comes to him)
    b.pos.copy(ctx.body.pos);
    b.yaw = ctx.body.yaw;
    b.moved = true;
  }
  v = 0;
  // (getting on, the bars come straight as he sits; a check's bicycle starts with them straight)
  steer = at ? 0 : b.turns.steer;
  lean = at ? STOP_LEAN : b.lean;
  // (getting on, the stand flips up as he sits; a check's bicycle has it up already)
  b.turns.stand = at ? 0 : 1;
  pitch = 0;
  crank = PARK_CRANK;
  down = 1;
  back = walk = backWait = effort = bump = 0;
  leaving = braked = false;
  wr = wf = gr = gf = gr0 = gf0 = b.pos.y;
  onAt = clock;
  ctx.body.vel.set(0, 0, 0);
  e.explorer.animator.posture = posture;
  e.explorer.animator.postureFeet = false;
  // (from a shot's `rcam=`: the camera stays where it puts it)
  camBase = ctx.cam.distance;
  camExtra = 0;
  followWas = ctx.cam.follow;
  if (followWas > 0) ctx.cam.follow = 0.95;
  writePose(ctx, at);
  if (!at) SFX.play('bikeStand', 0.8);
}

/** Off at once (back to the map, the mode changed): the bicycle stays on its stand where it is. */
function stop(ctx: RoamCtx | null): void {
  if (phase === 'off') return;
  const e = env!;
  if (phase === 'mount' || phase === 'ride') e.explorer.animator.posture = null;
  e.explorer.animator.postureFeet = true;
  if (ride) {
    park(ride);
    ride.model.place(ride.pos.x, ride.pos.y, ride.pos.z, ride.yaw, ride.lean, ride.pitch, ctx?.body.scale ?? 1.4, ride.turns);
  }
  ride = null;
  phase = 'off';
  quiet();
  if (ctx) {
    ctx.cam.distance = camBase;
    ctx.cam.follow = followWas;
    ctx.cam.fov = 50;
  }
}

function quiet(): void {
  for (const s of LOOPS) SFX.level(s, 0);
  lastSound = '';
}

/** Where he steps off to: beside the bicycle on his left, else his right, else behind it (where he fits); his feet there. */
function stepOffSpot(ctx: RoamCtx, b: Bike, out: Vector3): Vector3 {
  const w = ctx.world;
  const k = sc(ctx);
  const lx = Math.cos(b.yaw);
  const lz = -Math.sin(b.yaw);
  const fx = Math.sin(b.yaw);
  const fz = Math.cos(b.yaw);
  for (const [across, along] of [[0.82, 0.15], [-0.82, 0.15], [0.82, -0.4], [-0.82, -0.4], [0, -1.25]] as const) {
    const x = b.pos.x + (lx * across + fx * along) * k;
    const z = b.pos.z + (lz * across + fz * along) * k;
    if (!w.inBounds(x, z)) continue;
    let ok = true;
    let top = -Infinity;
    // (his body, a circle of 0.42 m: as the walker's)
    for (let i = 0; i < 5 && ok; i++) {
      const a = (i / 4) * Math.PI * 2;
      const r = i === 4 ? 0 : 0.42 * k;
      const g = w.standAt ? w.standAt(x + Math.cos(a) * r, z + Math.sin(a) * r, b.pos.y, 0.6 * k, ROOM * k) : w.groundAt(x, z);
      if (Number.isNaN(g) || g < b.pos.y - 1.2 * k) ok = false;
      else top = Math.max(top, g);
    }
    const water = w.waterAt(x, z);
    if (ok && (water === null || water < top + 0.3)) return out.set(x, top, z);
  }
  return out.copy(b.pos);
}

function hold(ctx: RoamCtx, dt: number): { prompt: string | null } {
  const b = ride;
  const e = env!;
  const { body, input, cam } = ctx;
  clock += dt;
  prompts();
  if (!b) {
    stop(ctx);
    return { prompt: null };
  }
  cam.turn(input.lookYaw, input.lookPitch, input.zoom);
  if (input.zoom) camBase = clamp(cam.distance - camExtra, cam.minDistance, cam.maxDistance);
  const k = sc(ctx);
  const bu = buM(ctx);

  // ── Getting on: he steps over to the saddle, the stand flips up ──
  if (phase === 'mount') {
    u = Math.min(1, u + dt / MOUNT);
    const s = ease(u);
    body.pos.lerpVectors(from, b.pos, s);
    body.pos.y = from.y + (b.pos.y - from.y) * s + Math.sin(Math.PI * u) * 0.12 * k;
    body.yaw = fromYaw + angleDiff(b.yaw, fromYaw) * s;
    b.turns.stand = 1 - ease(u * 1.6);
    lean = PARK_LEAN + (STOP_LEAN - PARK_LEAN) * s;
    steer = PARK_STEER * (1 - s);
    if (u >= 1) {
      phase = 'ride';
      body.pos.copy(b.pos);
      body.yaw = b.yaw;
    }
    writePose(ctx, u >= 1);
    focus(ctx, dt);
    return { prompt: null };
  }

  // ── Getting off: he steps off to the side, the stand goes down, it leans on it ──
  if (phase === 'dismount') {
    u = Math.min(1, u + dt / DISMOUNT);
    const s = ease(u);
    body.pos.lerpVectors(from, to, s);
    body.pos.y += Math.sin(Math.PI * u) * 0.1 * k;
    // (he turns a little toward where he steps, and back as he stands by it)
    body.yaw = b.yaw + offTurn * Math.sin(Math.PI * Math.min(1, u * 1.15));
    b.turns.stand = ease(u * 1.4 - 0.2);
    b.lean = STOP_LEAN + (PARK_LEAN - STOP_LEAN) * ease(u * 1.3 - 0.3);
    b.turns.steer = steer + (PARK_STEER - steer) * s;
    b.turns.crank = crank;
    b.turns.lamp = 0;
    body.explorer.setMotion(u < 0.85 ? 1.2 : 0, true, 0);
    cam.focus.set(body.pos.x, body.pos.y + 1.94 * k, body.pos.z);
    cam.behindYaw = body.yaw;
    if (u >= 1) {
      park(b);
      ride = null;
      phase = 'off';
      cam.distance = camBase;
      cam.follow = followWas;
      cam.fov = 50;
      body.vel.set(0, 0, 0);
    }
    return { prompt: null };
  }

  // ── Riding ──
  const fwd = clamp(input.move.y, -1, 1);
  const side = clamp(input.move.x, -1, 1);
  if (input.use) leaving = true;
  // The bell (Space): kring-kring.
  if (input.jump && clock >= bellAt) {
    bellAt = clock + 0.85;
    SFX.play('bikeBell', 1);
  }
  const vf = Math.abs(v);
  // Getting off: once it has stopped (braking first).
  if (leaving && vf < 0.6) {
    phase = 'dismount';
    u = 0;
    from.copy(body.pos);
    stepOffSpot(ctx, b, to);
    // (stepping off to his left he turns that way a little, to his right the other)
    _side.subVectors(to, from);
    offTurn = clamp(0.5 * (_side.x * Math.cos(body.yaw) - _side.z * Math.sin(body.yaw)), -0.5, 0.5);
    e.explorer.animator.posture = null;
    e.explorer.animator.postureFeet = true;
    b.pos.copy(body.pos);
    b.yaw = body.yaw;
    b.lean = lean;
    b.pitch = 0;
    v = 0;
    quiet();
    SFX.play('bikeStand', 0.7);
    return { prompt: null };
  }

  // The ground under the wheels (a few times a second): how it rolls, how it sounds.
  if (clock >= groundAt || clock < groundAt - 1) {
    groundAt = clock + 0.15;
    ground = groundKind(ctx.world, body.pos.x, body.pos.y, body.pos.z);
  }

  // ── Speed: pedalling builds it up, the brakes and the ground take it, a rise slows it, a fall speeds it ──
  // (his camera or phone up, the album open: no hands on the bars, so he brakes to a stop and puts a foot down)
  const handsOff = !!e.photo.kind || e.photo.albumOpen;
  const pedal = !leaving && !handsOff && fwd > 0.08 ? fwd : 0;
  const hard = pedal > 0 && input.run;
  let a = 0;
  if (pedal > 0 && v >= -0.05) {
    const top = (hard ? V_HARD : V_EASY) * k * (0.35 + 0.65 * pedal);
    a += (hard ? PUSH_HARD : PUSH) * k * Math.max(0, 1 - Math.max(0, v) / top);
  }
  const slope = clamp((wf - wr) / (WHEELBASE * bu), -0.35, 0.35);
  // (stopped, his foot down holds it on a slope)
  a -= 9.8 * k * slope * 0.85 * (down < 0.5 ? 1 : 0);
  a -= AIR * v * vf / k;
  v += a * dt;
  // Rolling resistance (never past a standstill).
  const roll = ROLL[ground] * k * dt;
  v = v > 0 ? Math.max(0, v - roll) : Math.min(0, v + roll);
  const brake = leaving || handsOff ? BRAKE_OFF / BRAKE : fwd < -0.08 && v > 0.05 ? -fwd : 0;
  if (brake > 0 && v > 0) {
    if (!braked && v > 4.5 * k && !leaving) SFX.play('bikeBrake', clamp((v / k - 4) / 6, 0.2, 1));
    v = Math.max(0, v - BRAKE * k * brake * dt);
  }
  braked = brake > 0.4 && v > 0.3;
  // S held once stopped: walking it back slowly.
  backWait = !leaving && fwd < -0.25 && v <= 0.3 * k ? backWait + dt : 0;
  if (backWait > 0.35) v += (-V_BACK * k * clamp(-fwd, 0, 1) - v) * damp(4, dt);
  else if (v < 0) v += (0 - v) * damp(6, dt);
  v = clamp(v, -V_BACK * k, V_MAX * k);

  // ── Steering: the front wheel turns, the heading follows (tight slowly, wide fast); the lean comes with it ──
  const sp = Math.abs(v);
  const most = sp < 0.3 ? STEER_MAX : Math.min(STEER_MAX, Math.atan((WHEELBASE * bu * LAT * k) / (sp * sp)));
  steer += (-side * most - steer) * damp(8, dt);
  const L = WHEELBASE * bu;
  let yawRate = (v * Math.tan(steer)) / L;
  // Stopped (or held against something), A / D shuffle it round with his foot down: out of a corner.
  if (sp < 0.3 * k && Math.abs(side) > 0.3 && !handsOff) yawRate = -side * PIVOT;
  // (pushed back by a wall meanwhile: the step's turn is undone with it)
  move(ctx, v * dt, yawRate * dt, dt);

  // ── The wheels on the ground: up and over small steps, the bicycle pitching between them; a bump ──
  for (let i = 0; i < 2; i++) {
    const jump = i ? gf - gf0 : gr - gr0;
    if (Math.abs(jump) > 0.08 * k) {
      const hit = clamp(Math.abs(jump) / (0.35 * k), 0, 1) * clamp(0.35 + Math.abs(v) / (8 * k), 0, 1);
      if (hit > 0.15 && clock >= bumpAt) {
        bumpAt = clock + 0.12;
        SFX.play('bikeBump', hit);
        if (hit > 0.6) pad.rumble('tick', hit * 0.6);
      }
      bump = Math.max(bump, hit);
    }
  }
  gr0 = gr;
  gf0 = gf;
  wr += (gr - wr) * damp(gr > wr ? 22 : 14, dt);
  wf += (gf - wf) * damp(gf > wf ? 22 : 14, dt);
  body.pos.y = wr + (wf - wr) * (-BIKE.rear / WHEELBASE);
  pitch += (Math.atan2(wr - wf, L) - pitch) * damp(12, dt);
  bump *= Math.exp(-dt * 7);
  body.grounded = true;
  body.vel.set(Math.sin(body.yaw) * v, 0, Math.cos(body.yaw) * v);

  // ── The foot down when stopped, walking it back, the lean ──
  const stopped = Math.abs(v) < 0.45 * k && (pedal === 0 || v < 0);
  down += ((stopped ? 1 : 0) - down) * damp(stopped ? 5 : 8, dt);
  // (walking it back, or shuffling it round: his left foot steps)
  const pivoting = sp < 0.3 * k && Math.abs(yawRate) > 0.1;
  back += ((v < -0.05 || pivoting ? 1 : 0) - back) * damp(5, dt);
  walk += ((Math.abs(Math.min(0, v)) + (pivoting ? 0.5 * k : 0)) * dt * Math.PI * 2) / (0.75 * k);
  const turnLean = clamp(Math.atan((v * yawRate) / (9.8 * k)), -LEAN_MAX, LEAN_MAX);
  // (his foot down — stopped, or walking it back — leans it to that side)
  const foot = Math.max(down, back);
  lean += (turnLean * (1 - foot) + STOP_LEAN * foot - lean) * damp(7, dt);
  effort += ((hard ? 1 : 0) - effort) * damp(4, dt);

  // ── The cranks turn with his pedalling; coasting they rest level; stopped, the right pedal comes up to push off ──
  const gear = BIKE.gear * bu;
  if (pedal > 0 && v > 0) crank += (v / gear) * Math.PI * 2 * dt;
  else if (down > 0.5) crank += angleDiff(PARK_CRANK, crank) * damp(3, dt);
  else {
    const level = Math.round((crank - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
    crank += (level - crank) * damp(3, dt);
  }
  wheel += (v * dt) / (BIKE.wheel * bu);

  // ── Sounds: the chain while he pedals, the freewheel while it coasts, the tyres on the ground ──
  const speed = Math.abs(v) / k;
  const cadence = pedal > 0 && v > 0.2 ? speed / (BIKE.gear * BODY_UNIT_M * 1.4) : 0;
  SFX.level('bikeChain', clamp(cadence / 2.4, 0, 1));
  SFX.level('bikeFree', pedal === 0 && v > 0.8 * k ? clamp(speed / 14, 0.05, 1) : 0);
  const tyres = ground === 'grass' ? 'bikeGrass' : ground === 'stone' ? 'bikeStone' : 'bikeDirt';
  if (lastSound && lastSound !== tyres) SFX.level(lastSound, 0);
  lastSound = tyres;
  SFX.level(tyres, clamp(speed / 10, 0, 1) * (ground === 'water' ? 0.5 : 1));

  writePose(ctx, true);
  focus(ctx, dt);
  // (the keys: a few seconds after getting on, and whenever it stands)
  return { prompt: leaving || (clock - onAt > 5 && Math.abs(v) > 1.2 * k) ? null : rideText };
}

/** What the tyres roll on at the saddle point. */
function groundKind(w: RoamWorld, x: number, y: number, z: number): Ground {
  switch (stepSound(w, x, y, z)) {
    case 'stepGrass':
    case 'stepSnow':
      return 'grass';
    case 'stepStone':
    case 'stepWood':
      return 'stone';
    case 'stepSand':
      return 'sand';
    case 'stepWater':
      return 'water';
    default:
      return 'dirt';
  }
}

/** The posture's numbers and the bicycle's, from the ride (`carry`: the bicycle is where he is). */
function writePose(ctx: RoamCtx, carry: boolean): void {
  const b = ride!;
  ps.crank = crank;
  ps.steer = steer;
  ps.lean = lean;
  ps.pitch = pitch;
  ps.down = down;
  ps.back = back;
  ps.walk = walk;
  ps.effort = effort;
  ps.bump = bump;
  ps.look = clamp(steer * 1.1, -0.45, 0.45);
  ps.t = clock;
  if (carry) {
    b.pos.copy(ctx.body.pos);
    b.yaw = ctx.body.yaw;
    b.moved = true;
  }
  b.lean = lean;
  b.pitch = pitch;
  b.turns.steer = steer;
  b.turns.crank = crank;
  b.turns.front = b.turns.rear = wheel;
  ctx.body.explorer.setMotion(0, true, 0);
}

/** The follow camera: behind the bicycle, a little further back and wider at speed. */
function focus(ctx: RoamCtx, dt: number): void {
  const { cam, body } = ctx;
  const k = sc(ctx);
  const fast = ease((Math.abs(v) / k - 3) / 8);
  camExtra += (2.6 * fast * k - camExtra) * damp(1.5, dt);
  cam.distance = clamp(camBase + camExtra, cam.minDistance, cam.maxDistance + 3);
  cam.focus.set(body.pos.x, body.pos.y + 1.9 * k, body.pos.z);
  cam.behindYaw = body.yaw;
  cam.fov = 50 + 5 * fast;
}

// ── Every frame: the bicycles drawn, the lamp ──────────────────────────────

function frame(f: MapFrame, mode: RoamMode): void {
  if (!things || !env) return;
  // (all of them, wherever the camera is — the free camera too: four bicycles are one draw, only the one moving is written)
  const scale = mode === 'overview' ? 1.4 : env.body.scale;
  for (const b of bikes) {
    const ridden = b === ride;
    // (the dynamo: as bright as it turns, seen at dusk and night)
    if (ridden) b.turns.lamp = phase === 'ride' ? clamp(Math.abs(v) / 2.5, 0, 1) * clamp(f.night * 1.6 - 0.25, 0, 1) : 0;
    b.model.place(b.pos.x, b.pos.y, b.pos.z, b.yaw, b.lean, b.pitch, ridden ? scale : 1.4, b.turns);
    b.model.write();
  }
  things.flush(f.night);
  // The lamp's pool of light on the road ahead.
  if (pool && poolMat) {
    const b = ride;
    const lit = b && phase === 'ride' ? b.turns.lamp : 0;
    pool.visible = lit > 0.02;
    if (b && pool.visible) {
      const k = scale / 1.4;
      const ahead = POOL_AHEAD * k;
      pool.position.set(b.pos.x + Math.sin(b.yaw) * ahead, b.pos.y + 0.06, b.pos.z + Math.cos(b.yaw) * ahead);
      pool.rotation.set(-Math.PI / 2, b.yaw + Math.PI + steer * 0.5, 0);
      pool.scale.set(POOL.w * k, POOL.l * k, 1);
      poolMat.opacity = 0.5 * lit;
    }
  }
}

// ── The add-on ─────────────────────────────────────────────────────────────

registerAddon({
  id: 'bike',
  get holding() {
    return phase !== 'off';
  },
  get handsBusy() {
    return phase !== 'off';
  },
  init(e) {
    env = e;
    build(e);
  },
  offer(ctx, mode) {
    if (mode !== 'walk' || phase !== 'off' || !env || env.busy()) return null;
    const p = ctx.body.pos;
    if (!near(p.x, p.y, p.z, sc(ctx))) return null;
    prompts();
    return offerText;
  },
  use(ctx) {
    const p = ctx.body.pos;
    const b = near(p.x, p.y, p.z, sc(ctx));
    if (b) start(ctx, b);
  },
  hold,
  frame,
  setMode(next, _prev, ctx) {
    roamMode = next;
    if (next !== 'walk') stop(ctx);
    // Back to the map: every bicycle goes back to its place.
    if (next === 'overview' && env) for (const b of bikes) home(b, env.world);
  },
  fromUrl(q, ctx) {
    if (!env) return;
    // A bicycle left away from its place: `bikeleft=<spot>:x:z:yaw(deg),…`.
    for (const part of (q.get('bikeleft') ?? '').split(',').filter(Boolean)) {
      const [id, x, z, yaw] = part.split(':');
      const b = bikes.find((o) => o.spot.id === `bike-${id}`);
      if (!b || ![x, z, yaw].every((s) => Number.isFinite(Number(s)))) continue;
      b.pos.set(Number(x), groundUnder(env.world, Number(x), Number(z)), Number(z));
      b.yaw = (Number(yaw) * Math.PI) / 180;
      park(b);
      b.moved = true;
    }
    // On a bicycle at `at=` (the nearest comes to him), rolling at `bike=ride:<m/s>`.
    const m = /^ride(?::(-?[\d.]+))?$/.exec(q.get('bike') ?? '');
    if (m && phase === 'off' && roamMode === 'walk') {
      const p = ctx.body.pos;
      let best = bikes[0];
      for (const b of bikes) if (b.pos.distanceToSquared(p) < best.pos.distanceToSquared(p)) best = b;
      start(ctx, best, true);
      v = Number(m[1] ?? 0) * sc(ctx);
      if (Math.abs(v) > 0.45) down = 0;
      writePose(ctx, true);
    }
  },
  report() {
    const out: Record<string, string> = {};
    if (phase === 'ride' || phase === 'mount') out.bike = Math.abs(v) > 0.05 ? `ride:${v.toFixed(1)}` : 'ride';
    const left = bikes
      // (the one he is getting off is on its stand already)
      .filter((b) => b.moved && (b !== ride || phase === 'dismount'))
      .map((b) => `${b.spot.id.slice(5)}:${b.pos.x.toFixed(1)}:${b.pos.z.toFixed(1)}:${(((b.yaw * 180) / Math.PI) % 360).toFixed(0)}`);
    if (left.length) out.bikeleft = left.join(',');
    return Object.keys(out).length ? out : null;
  },
});

/** Checks (the console, a probe): where each bicycle is, and the ride. */
export function bikeDebug(): unknown {
  return {
    phase,
    v: +v.toFixed(2),
    steer: +steer.toFixed(3),
    lean: +lean.toFixed(3),
    down: +down.toFixed(2),
    lamp: ride ? +ride.turns.lamp.toFixed(2) : 0,
    pool: pool ? { shown: pool.visible, opacity: +(poolMat?.opacity ?? 0).toFixed(2), at: [pool.position.x, pool.position.y, pool.position.z].map((n) => +n.toFixed(1)) } : null,
    probes: [...probeY].map((g) => +g.toFixed(2)),
    steps: [...stepY].map((g) => +g.toFixed(2)),
    bikes: bikes.map((b) => ({ id: b.spot.id, x: +b.pos.x.toFixed(2), y: +b.pos.y.toFixed(2), z: +b.pos.z.toFixed(2), yaw: +((b.yaw * 180) / Math.PI).toFixed(1), shown: b.model.shown })),
  };
}
