import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { cowSeatPose, cowSeatState, sway } from '../../character/cowRide';
import { JOINTS, type JointName } from '../../character/skeleton';
import { mulberry32 } from '../../voxel/random';
import { BODY_UNIT_M } from '../../world/scale';
import { SFX } from '../audio/addonSfx';
import '../audio/_cowRide';
import { addRideCow, COW_RIDE, rideCow, type RideCow } from '../cattle/ride';
import { padName } from '../pad/glyphs';
import { pad } from '../pad/pad';
import { OX_LIE, OX_ROCK } from '../people/_ox';
import { OX_CHEEK, OX_HALF, OX_NOSE, OX_RIDDEN, OX_SEAT, OX_SHOULDER, oxBodyTilt, oxGait, oxHz, oxPoint, type OxPose } from '../people/_oxRide';
import type { MapFrame, RoamMode } from '../types';
import { lang, t } from '../ui/lang';
import { registerAddon, touchJump, type AddonEnv, type AddonHold, type AddonKey } from './_addons';
import { angleDiff } from './followCam';
import type { RoamCtx, RoamWorld } from './types';
import { stepSound } from './walker';

/**
 * Riding the white cattle (គោ), as Khmer village children do: walk up calmly
 * to one of the cattle he may ride (cattle/ride.ts `COW_RIDE`: the sugar-palm
 * village's herd grazing on the meadow over the stream or in its pen at night,
 * people/_sceneEastVillage.ts; his own grown cows, map/cattle/) standing,
 * grazing or lying, and E "Ride the cow" by its flank: he hops up and sits
 * astride behind the hump, both fists on the nose rope (character/cowRide.ts);
 * a lying one heaves itself up with him on it, hind end first. W walks it on
 * (1.3 m/s × its size), Shift a trot (2.3: a bouncy jog he bobs on), S backs it
 * a step, A / D turn it; now and then it stops to graze and it lows, soft. It
 * follows the land as the walker does (the walk map, `standAt`): up and down
 * the land's steps, round walls and trees, never onto stairs, terraces,
 * bridges' planks, jetties or anything built; it wades the shallows only. Its
 * body rocks with its stride, trots in diagonal pairs (people/_ox.ts's shader,
 * on the ride's step phase: `_oxRide.ts`), and he sways with it. E: he slides
 * off beside it, on the side there is ground; its keeper takes it on from there
 * (the village's grazes a while, then walks back to the herd).
 *
 * Its sounds (audio/_cowRide.ts): hooves on grass, earth, mud and stone,
 * wading, the low, a grunt getting up, a snort; its wooden bell clonks with its
 * steps (the village cattle's own `cowBell`, through the map's calls).
 *
 * A walk-mode add-on that holds him (`holding`): roaming keeps him on foot, so
 * the camera and the phone work from its back; the lights go away.
 *
 * URL (checks): `cow=ride` puts him on the cow nearest `at=`, brought there
 * (`yaw=` its heading) · `cow=lie` the same with it lying (it gets up a moment
 * later) · `cow=graze` riding, it grazes · `cow=trot` riding, trotting while W
 * is held (`sim=w:2`) · `cow=off` just got off beside it · `cow=near` (or
 * `near:lie`) it stands (or lies) a step in front of him, not ridden: the
 * prompt · `cowfake=1` adds a cow of his drawn by nobody, a step in front of
 * him (the ride's logic alone).
 */

// ── Tuning ─────────────────────────────────────────────────────────────────

/** Its pace (m/s for a cow of size 1): walking, trotting (Shift), backing up; turning (rad/s). */
const WALK = 1.3;
const TROT = 2.3;
const BACK = 0.5;
const TURN = 0.75;
/** How quickly it gets going and stops (1/s). */
const SPEED_UP = 1.7;
const SLOW_DOWN = 3.0;
/** A land step it goes up or down (m: the walker's hop), the room it needs over the ground with him on it (m). */
const UP = 2.2;
const ROOM = 3.2;
/** The deepest water it wades (m, size 1: up to its belly), what stands more than this over the land is built (stairs, terraces, bridges, planks, jars), the road's paving is not (m). */
const DEEP = 0.6;
const BUILT = 0.35;
/** Out on open water it stops too: no bank or shallows within this far round its head (m). */
const OPEN_RINGS = [3, 5.5, 8];
/** It trots no deeper than this (m of water, size 1): wading, it walks. */
const TROT_WET = 0.25;
/** It keeps this far inside the roaming area (m). */
const EDGE = 3;
/** Getting on: from his feet to its body's line (m), its back over his feet (m: down, up). */
const REACH = 1.6;
const SEAT_LOW = -1.2;
const SEAT_HIGH = 2.4;
/** Getting on and off, and getting up off the ground with him on it (s); it waits a moment first. */
const ON_TIME = 1.0;
const OFF_TIME = 0.75;
const RISE_TIME = 1.6;
const RISE_WAIT = 0.9;
/** Front to hind hooves (model units). */
const WHEELBASE = 1.2;
/** Under him it rocks a little more than walking free (rad, on its tilt): fore and aft, side to side. */
const RIDE_ROCK = 0.02;
const RIDE_ROLL = 0.025;
/** Grazing stops while walking (s of walking between, s long), lows and snorts (s between); its head down grazing (the head channel: the herd's 1, a little lower: down to the grass). */
const GRAZE_EVERY: [number, number] = [25, 50];
const GRAZE_FOR: [number, number] = [2.2, 3.4];
const MOO_EVERY: [number, number] = [26, 60];
const SNORT_EVERY: [number, number] = [10, 20];
const GRAZE_HEAD = 1;
/** Its bell: rung on a front hoof's step (chance: walking, trotting), and now and then standing (s between). */
const BELL_WALK = 0.45;
const BELL_TROT = 0.8;
const BELL_IDLE: [number, number] = [5, 11];
/** The nose rope: how many pieces it is drawn in, how thick (m), how far it hangs from the ring when let go (m). */
const ROPE_SEGS = 15;
const ROPE_THICK = 0.035;
const ROPE_HANG = 0.65;

/** Where it stands on the ground (model units, its own space: x its left, z ahead): the head, the front corners, the front hooves, the middle, the hind hooves, the rump's corners. */
const PROBES: readonly (readonly [number, number])[] = [
  [0, 1.6],
  [0.28, 0.74],
  [-0.28, 0.74],
  [0, 0.58],
  [0, 0],
  [0, -0.62],
  [0.27, -0.84],
  [-0.27, -0.84],
];
const FRONT = 3;
const MIDDLE = 4;
const HIND = 5;
/** Its four hooves: where each comes down in the step cycle walking (the shader's leg offsets: front left, hind left, front right, hind right), front or not; trotting, the fronts come down a quarter earlier (diagonal pairs). */
const FEET: readonly { at: number; front: boolean }[] = [
  { at: 0, front: true },
  { at: 0.25, front: false },
  { at: 0.5, front: true },
  { at: 0.75, front: false },
];
/** The bell under its neck (model units, the neck's bone). */
const BELL: [number, number, number] = [0, 0.8, 1.0];

type Blocked = '' | 'wall' | 'deep' | 'built' | 'drop' | 'edge';

const smooth = (u: number) => {
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
};
const TAU = Math.PI * 2;
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const deg = (r: number) => ((((r * 180) / Math.PI) % 360) + 360) % 360;

// ── The ride ───────────────────────────────────────────────────────────────

let env: AddonEnv | null = null;
/** Where the ride is: none, getting on, riding, getting off. */
let state: 'none' | 'mount' | 'ride' | 'dismount' = 'none';
/** The cow, while he is on it or getting on or off; one a URL put in front of him (held still for the prompt). */
let cow: RideCow | null = null;
let parked: RideCow | null = null;
/** `COW_RIDE.version` when last looked at (a cow taken off the list is let go). */
let seen = -1;
/** Its pose (the fields it writes, and the shader's channels: read back on the CPU with `oxPoint`). */
const B: OxPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1, gait: 0, rest: 0, head: 0, turn: 0, phase: 0 };
/** Its steps so far (cycles, + forward: the contract's `gait`), and their rate now (cycles a second). */
let cycles = 0;
let hz = 0;
/** The ground's tilt under it (radians), apart from the tilt of getting up. */
let groundPitch = 0;
let risePitch = 0;
/** Speed along its heading (m/s, − backing up) and turning (rad/s, + to its left). */
let speed = 0;
let turnRate = 0;
/** Getting on or off (0‥1), the side (+1 its left), from and to (his feet, or its seat). */
let u = 0;
let side = 1;
const from = new Vector3();
const to = new Vector3();
/** Getting up off the ground with him on it: seconds since he sat, how far up (0‥1; −1 none), and how low it lay. */
let riseClock = 0;
let rise = -1;
let riseFrom = 0;
/** E pressed: it stops, then he gets off. */
let leaving = false;
/** A URL holds the trot (`cow=trot`): W trots without Shift. */
let trotHeld = false;
/** Its will: grazing (s left), how long without a key (s), walked since the last stop to graze (s), when the next is. */
let grazeLeft = 0;
let grazeFor = 0;
let idle = 0;
let walked = 0;
let grazeAt = 30;
let mooIn = 8;
let mooHead = 0;
let snortIn = 12;
let bellIn = 6;
/** The bell to ring this frame (gain; 0 none): `frame` puts it in the map's calls. */
let bellNow = 0;
const bellAt = new Vector3();
/** The water at its front and hind hooves last step (m deep; for the splash going in). */
let wetFront = 0;
let wetHind = 0;
/** Its step cycle last step (0‥1), and how far the front hooves' ground jumped (a land step). */
let lastCycle = 0;
let lastFront = 0;
/** What a probe ran into (`misfits`), what stopped it last ('' since it moved on: a toast says so, not too often), and when the toast may come again (s). */
let blocked: Blocked = '';
let stopped: Blocked = '';
let toastAgain = 0;
/** Seconds riding (the rider's breathing, the head's look round). */
let clock = 0;
/** The first ride's keys shown; the first stop to graze said. */
let hinted = false;
let grazeTold = false;
let rnd = mulberry32(11);
const range = (r: readonly [number, number]) => r[0] + (r[1] - r[0]) * rnd();

/** His posture (character/cowRide.ts) and its springs. */
const seatState = cowSeatState();
const swayVel = { pitch: 0, roll: 0, lift: 0 };
const posture = () => cowSeatPose(seatState);
const bodyTilt = { pitch: 0, roll: 0 };
/** Where he sits (world); the camera's eased height. */
const seat = new Vector3();
let focusY = 0;
/** A camera distance to ease to after getting on (m), or null. */
let settle: number | null = null;
const SETTLE_DIST = 9.5;
const SETTLE_PITCH = 0.32;
/** The ground under each probe (m) and where the probes are, where it stands; and for a pose being tried. */
const probeG = new Float64Array(PROBES.length);
const probeX = new Float64Array(PROBES.length);
const probeZ = new Float64Array(PROBES.length);
const tryG = new Float64Array(PROBES.length);
const tryX = new Float64Array(PROBES.length);
const tryZ = new Float64Array(PROBES.length);
const tryOk = new Uint8Array(PROBES.length);

/** The prompts, made once per language (not every frame). */
let words = '';
let ridePrompt = '';
let offPrompt = '';
function prompts(): void {
  const l = lang();
  if (l === words) return;
  words = l;
  ridePrompt = `E  ${t('cowRide')}`;
  offPrompt = `E  ${t('cowOff')}`;
}

/** Its walk and trot shares now (from the gait channel). */
const trotShare = () => Math.min(1, Math.max(0, B.gait - 1));
const walkShare = () => Math.min(1, Math.max(0, B.gait)) - trotShare();

// ── Where it may go ────────────────────────────────────────────────────────

/**
 * How many of its probes do not fit at (x, z) heading `yaw`, its feet near `ref` (0: it fits there): a wall or a
 * low roof, a drop deeper than a land step, something built (stairs, a terrace, a bridge, planks), water deeper than
 * it wades, the mist at the edge. The ground under each that fits goes in `tryG` (`tryOk`); what stops it first, in
 * `blocked`.
 */
function misfits(w: RoamWorld, x: number, z: number, yaw: number, ref: number): number {
  const s = B.scale;
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  let bad = 0;
  blocked = '';
  for (let k = 0; k < PROBES.length; k++) {
    const px = PROBES[k][0] * s;
    const pz = PROBES[k][1] * s;
    const wx = x + c * px + sn * pz;
    const wz = z - sn * px + c * pz;
    tryX[k] = wx;
    tryZ[k] = wz;
    // (as the walker's walk map has it: the land, temples, the road, trunks; a wall or a low roof: NaN)
    const g = w.standAt ? w.standAt(wx, wz, ref, UP, ROOM) : w.groundAt(wx, wz);
    const wa = Number.isNaN(g) ? null : w.waterAt(wx, wz);
    const why: Blocked =
      (w.edgeDistance?.(wx, wz) ?? EDGE + 1) < EDGE
        ? 'edge'
        : Number.isNaN(g)
          ? 'wall'
          : g < ref - UP - 0.1
            ? 'drop'
            : builtAt(w, wx, wz, g)
              ? 'built'
              : wa !== null && wa - g > DEEP * s
                ? 'deep'
                : // (its head out over open water, far from any bank: the lake past its shallows)
                  k === 0 && wa !== null && wa - g > 0.3 && openWater(w, wx, wz)
                  ? 'deep'
                  : '';
    tryOk[k] = why ? 0 : 1;
    tryG[k] = g;
    if (!why) continue;
    bad++;
    if (!blocked) blocked = why;
  }
  return bad;
}

/**
 * Its probes that do not fit where it stands (`move`). A pose to go to must fit; where it does not fit already (put
 * there by a URL, or lying where it lay), as the walker's `loose`: going on, its middle and its leading end must fit
 * (`dir` + ahead, − backing up), turning on the spot no more of it may stick out: it always gets out of a tight spot,
 * never further in.
 */
let here = 0;
function ok(w: RoamWorld, x: number, z: number, yaw: number, dir: number): boolean {
  const n = misfits(w, x, z, yaw, B.y);
  if (n === 0) return true;
  if (here === 0) return false;
  if (dir === 0) return n <= here;
  if (!tryOk[MIDDLE]) return false;
  for (const k of dir > 0 ? LEAD_AHEAD : LEAD_BACK) if (!tryOk[k]) return false;
  return true;
}
/** Its probes at its front and at its rump (`PROBES`). */
const LEAD_AHEAD = [0, 1, 2, 3];
const LEAD_BACK = [5, 6, 7];

/**
 * Is the floor at (x, z), top `g`, built (stairs, a temple's terrace, a bridge's planks, a jetty, a jar): over the
 * land there by more than `BUILT` (the road's paving is not), unless it is flush with the land a step away (earth
 * filling the lip of a bank); planks always.
 */
function builtAt(w: RoamWorld, x: number, z: number, g: number): boolean {
  const f = w.field;
  if (w.woodAt?.(x, z, g)) return true;
  if (g <= f.heightAt(x, z) + BUILT) return false;
  for (let a = 0; a < 4; a++) {
    const h = f.heightAt(x + FLUSH[a * 2], z + FLUSH[a * 2 + 1]);
    if (Math.abs(g - h) < 0.12) return false;
  }
  return true;
}
/** Where `builtAt` looks for land flush with a built floor (m). */
const FLUSH = [2, 0, -2, 0, 0, 2, 0, -2];

/** Open water at (x, z): no dry ground (or shallows) within `OPEN_RINGS` round it. The last answer is kept for the metre it was asked in. */
let openKey = NaN;
let openWas = false;
function openWater(w: RoamWorld, x: number, z: number): boolean {
  const key = Math.round(x) * 4099 + Math.round(z);
  if (key === openKey) return openWas;
  openKey = key;
  openWas = true;
  for (const r of OPEN_RINGS)
    for (let a = 0; a < 12; a++) {
      const px = x + Math.cos((a * Math.PI) / 6) * r;
      const pz = z + Math.sin((a * Math.PI) / 6) * r;
      const wa = w.waterAt(px, pz);
      if (wa === null || wa - w.groundAt(px, pz) < 0.15) {
        openWas = false;
        return false;
      }
    }
  return true;
}

/** The ground under it where it is now: each probe that fits (the others keep what they had). */
function ground(w: RoamWorld): number {
  const bad = misfits(w, B.x, B.z, B.yaw, B.y);
  for (let k = 0; k < PROBES.length; k++) {
    probeX[k] = tryX[k];
    probeZ[k] = tryZ[k];
    if (tryOk[k]) probeG[k] = tryG[k];
  }
  return bad;
}

/** A toast for what stops it (deep water, steps or a terrace, the mist), not too often. */
function complain(ctx: RoamCtx, why: Blocked): void {
  if (ctx.t < toastAgain || ctx.shot) return;
  const key = why === 'deep' ? 'cowDeep' : why === 'built' ? 'cowBuilt' : why === 'edge' ? 'rMist' : null;
  if (!key) return;
  ctx.hud.toast(t(key));
  toastAgain = ctx.t + 8;
}

/** The water at (x, z) over ground `g` (m; 0 dry). */
function depthAt(w: RoamWorld, x: number, z: number, g: number): number {
  const wa = w.waterAt(x, z);
  return wa === null ? 0 : Math.max(0, wa - g);
}

// ── The cow: taken, posed, given back ──────────────────────────────────────

/** The nearest cow he can get on from where he stands, or null (cheap: a handful). */
function nearest(ctx: RoamCtx): RideCow | null {
  const p = ctx.body.pos;
  let best: RideCow | null = null;
  let bestD = REACH;
  for (const c of COW_RIDE.cows) {
    // (one its keeper lets him ride now: standing still, grazing or lying; or the one a URL put before him)
    if (c !== parked && (!c.canRide || c.ridden)) continue;
    const s = c.scale;
    // From his feet to the line along its body, rump to chest.
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const along = dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw);
    const k = Math.max(-0.85 * s, Math.min(0.85 * s, along));
    const ex = dx - Math.sin(c.yaw) * k;
    const ez = dz - Math.cos(c.yaw) * k;
    const d = Math.sqrt(ex * ex + ez * ez) - OX_HALF * s;
    if (d > bestD) continue;
    const back = c.y + (OX_SEAT[1] - OX_LIE.drop * (c.lying ? 1 : 0)) * s - p.y;
    if (back < SEAT_LOW || back > SEAT_HIGH) continue;
    best = c;
    bestD = d;
  }
  return best;
}

/** Take it: its keeper only draws it now, the ride poses it from how it looks. */
function take(c: RideCow, ctx: RoamCtx): void {
  if (parked === c) parked = null;
  cow = c;
  c.ridden = true;
  COW_RIDE.ridden = c;
  OX_RIDDEN.cow = c;
  seen = COW_RIDE.version;
  B.x = c.x;
  B.y = c.y;
  B.z = c.z;
  B.yaw = c.yaw;
  B.scale = c.scale;
  B.pitch = B.roll = groundPitch = risePitch = 0;
  B.gait = 0;
  B.rest = c.lying ? 1 : 0;
  B.head = Math.max(-1, Math.min(GRAZE_HEAD, c.head));
  B.turn = 0;
  B.phase = 0;
  cycles = 0;
  hz = 0;
  speed = turnRate = 0;
  lastCycle = 0;
  // (the ground under it, as the ride sees it; where a probe does not fit, its own feet's)
  probeG.fill(B.y);
  ground(ctx.world);
  lastFront = probeG[FRONT];
  wetFront = depthAt(ctx.world, probeX[FRONT], probeZ[FRONT], probeG[FRONT]);
  wetHind = depthAt(ctx.world, probeX[HIND], probeZ[HIND], probeG[HIND]);
  write();
}

/** Its pose into its fields (its keeper draws it from them: people/_oxRide.ts `drawRideCow`). */
function write(): void {
  const c = cow;
  if (!c) return;
  // (on its tilt: the ground's, getting up, and a little more rocking under him than walking free)
  const w = walkShare();
  B.pitch = groundPitch + risePitch + RIDE_ROCK * Math.sin(B.phase * 2 + 1) * w;
  B.roll = RIDE_ROLL * Math.sin(B.phase) * w;
  c.x = B.x;
  c.y = B.y;
  c.z = B.z;
  c.yaw = B.yaw = wrapAngle(B.yaw);
  c.scale = B.scale;
  c.pitch = B.pitch;
  c.roll = B.roll;
  c.gait = cycles;
  c.speed = speed;
  c.head = B.head;
  c.lying = B.rest > 0.5;
  c.canRide = false;
  OX_RIDDEN.gait = B.gait;
  OX_RIDDEN.hz = hz;
  OX_RIDDEN.rest = B.rest;
  OX_RIDDEN.turn = B.turn;
}

/** Give it back to its keeper: standing (or lying) where it is, its legs still, its tilt gone. */
function release(): void {
  // (the touch controls' Jump button is back: he is off)
  touchJump(null);
  const c = cow;
  if (!c) return;
  c.ridden = false;
  c.pitch = c.roll = c.speed = 0;
  c.lying = B.rest > 0.5;
  COW_RIDE.ridden = null;
  OX_RIDDEN.cow = null;
  cow = null;
}

/** The cow a URL held still in front of him, let go (back to the map, or another put there). */
function unpark(): void {
  if (!parked) return;
  parked.ridden = false;
  parked = null;
}

// ── Getting on and off ─────────────────────────────────────────────────────

function startMount(c: RideCow, ctx: RoamCtx): void {
  const { body } = ctx;
  take(c, ctx);
  // (the side he is on: its left or its right)
  const lx = (body.pos.x - B.x) * Math.cos(B.yaw) - (body.pos.z - B.z) * Math.sin(B.yaw);
  side = lx >= 0 ? 1 : -1;
  state = 'mount';
  u = 0;
  leaving = false;
  trotHeld = false;
  from.copy(body.pos);
  body.vel.set(0, 0, 0);
  seatState.on = 0;
  seatState.side = side;
  seatState.lean = 0;
  seatState.lagPitch = seatState.lagRoll = 0;
  seatState.lift = seatState.lagLift = 0;
  swayVel.pitch = swayVel.roll = swayVel.lift = 0;
  body.explorer.animator.posture = posture;
  body.explorer.animator.postureFeet = false;
  // (on a touch screen the Jump button does nothing on its back: hidden while he rides; the stick past its ring trots)
  touchJump('hide');
  grazeLeft = 0;
  idle = 0;
  walked = 0;
  riseClock = 0;
  rise = -1;
  clock = 0;
  rnd = mulberry32(((B.x * 73856093) ^ (B.z * 19349663)) >>> 0);
  grazeAt = range(GRAZE_EVERY);
  mooIn = 6 + 5 * rnd();
  snortIn = range(SNORT_EVERY);
  bellIn = range(BELL_IDLE);
  focusY = body.pos.y + 2;
  // (the camera eases back and up a little if it is close or low: he and the cow fill the view; a zoom stops it)
  settle = ctx.cam.distance < SETTLE_DIST ? SETTLE_DIST : null;
  ctx.sound('jump', 0.3);
}

/** A spot beside it where he can stand (its left first, then its right, then by its rump or its shoulders), or false. */
function landingSpot(w: RoamWorld, out: Vector3): boolean {
  const s = B.scale;
  const c = Math.cos(B.yaw);
  const sn = Math.sin(B.yaw);
  const tries: readonly (readonly [number, number])[] = [
    [side * 1.05, -0.25],
    [-side * 1.05, -0.25],
    [side * 0.9, -1.25],
    [-side * 0.9, -1.25],
    [side * 0.9, 1.0],
    [-side * 0.9, 1.0],
  ];
  for (const [lx, lz] of tries) {
    const x = B.x + (c * lx + sn * lz) * s;
    const z = B.z + (-sn * lx + c * lz) * s;
    if (!w.inBounds(x, z)) continue;
    // (about its own level: not up on a wall's top, nor down a drop)
    const g = w.standAt ? w.standAt(x, z, B.y + 0.3, 1.0, 2.4) : w.groundAt(x, z);
    if (Number.isNaN(g) || Math.abs(g - B.y) > 1.3) continue;
    // (no deeper than he wades: deeper, the walker would take a boat)
    if (depthAt(w, x, z, g) > 0.75) continue;
    out.set(x, g, z);
    // (the side he goes to: its left or its right of the seat)
    seatState.side = lx >= 0 ? 1 : -1;
    return true;
  }
  return false;
}

function startDismount(ctx: RoamCtx): void {
  state = 'dismount';
  u = 0;
  leaving = false;
  from.copy(seat);
  ctx.sound('jump', 0.25);
}

/** Off at once (back to the map, a saved view, another mode, the cow gone): his posture away, the cow let go where it is. */
function stopNow(ctx: RoamCtx | null): void {
  if (state === 'none') return;
  const body = env?.body;
  if (body) {
    if (state !== 'dismount' && ctx && landingSpot(ctx.world, to)) body.pos.copy(to);
    body.explorer.animator.posture = null;
    body.explorer.animator.postureFeet = true;
    body.vel.set(0, 0, 0);
    body.grounded = true;
  }
  B.gait = 0;
  hz = 0;
  risePitch = 0;
  // (getting up when he left: it is up)
  if (rise >= 0) B.rest = 0;
  rise = -1;
  write();
  release();
  state = 'none';
  leaving = false;
  trotHeld = false;
  hideRope();
}

// ── One step on its back ───────────────────────────────────────────────────

/** Its will and the keys: how fast it goes and turns, grazing, lowing. */
function drive(ctx: RoamCtx, dt: number): void {
  const { input } = ctx;
  const s = B.scale;
  const w = ctx.world;
  let fwd = state === 'ride' && !leaving ? input.move.y : 0;
  let steer = state === 'ride' && !leaving ? -input.move.x : 0;
  const keys = Math.abs(fwd) > 0.15 || Math.abs(steer) > 0.15;
  idle = keys ? 0 : idle + dt;
  // Getting up off the ground with him on it: a moment's wait, then hind end first (the front low), then the front.
  if (rise >= 0) {
    riseClock += dt;
    if (riseClock > RISE_WAIT) {
      if (rise === 0) {
        SFX.play('cowGrunt', 0.9);
        pad.rumble('tick', 0.6);
      }
      rise = Math.min(1, rise + dt / RISE_TIME);
      B.rest = riseFrom * (1 - smooth(rise));
      risePitch = 0.28 * Math.sin(Math.PI * Math.min(1, rise / 0.8)) * (rise < 0.8 ? 1 : 0);
      if (rise >= 1) {
        rise = -1;
        risePitch = 0;
        B.rest = 0;
      }
    }
    fwd = steer = 0;
  }
  // Stopping to graze now and then on the way (on grass or earth, not in the water nor on the road); Shift urges it on sooner.
  const wet = depthAt(w, B.x, B.z, probeG[MIDDLE]);
  const run = input.run || trotHeld;
  if (grazeLeft > 0) {
    grazeLeft -= dt;
    if (run && grazeFor - grazeLeft > 0.8) grazeLeft = Math.min(grazeLeft, 0.25);
    fwd = 0;
    steer *= 0.3;
  } else if (Math.abs(speed) > WALK * s * 0.5 && rise < 0) {
    walked += dt;
    if (walked > grazeAt && wet < 0.05 && grassy(w)) {
      grazeLeft = grazeFor = range(GRAZE_FOR);
      walked = 0;
      grazeAt = range(GRAZE_EVERY);
      if (!grazeTold && !ctx.shot) {
        grazeTold = true;
        ctx.hud.toast(t('cowGraze'));
      }
    }
  }
  // The head: down grazing (and nibbling when left standing a while on land), level walking, up a little trotting or lowing.
  if (mooHead > 0) mooHead -= dt;
  const nibble = idle > 3 && wet < 0.3 && rise < 0 && state === 'ride';
  const headWant = grazeLeft > 0 ? GRAZE_HEAD : nibble ? 0.85 * GRAZE_HEAD : mooHead > 0 ? -0.4 : trotShare() > 0.3 ? -0.15 : Math.abs(speed) > 0.2 ? 0.15 : 0;
  B.head += (headWant - B.head) * (1 - Math.exp(-dt * 2.6));
  // (its head comes up before it walks on)
  if (B.head > 0.45 * GRAZE_HEAD) fwd = 0;
  // Speed: slow to get going and to stop; it trots only on land (in the shallows it walks), slower in the water.
  const trot = run && wet < TROT_WET * s;
  let want = fwd > 0.15 ? (trot ? TROT : WALK) * s * Math.min(1, fwd * 1.25) : fwd < -0.3 ? -BACK * s : 0;
  want *= 1 - 0.35 * Math.min(1, wet / (DEEP * s));
  speed += (want - speed) * (1 - Math.exp(-dt * (Math.abs(want) > Math.abs(speed) ? SPEED_UP : SLOW_DOWN)));
  if (Math.abs(speed) < 0.005 && want === 0) speed = 0;
  const turnWant = steer * TURN * (Math.abs(speed) > 0.2 ? 1 : 0.8) * (trotShare() > 0.5 ? 0.75 : 1);
  turnRate += (turnWant - turnRate) * (1 - Math.exp(-dt * 4));
  if (Math.abs(turnRate) < 0.002 && turnWant === 0) turnRate = 0;
  // The head turns into its turns, and looks about when it stands.
  const look = Math.abs(turnRate) > 0.05 ? turnRate / TURN : idle > 1.5 ? 0.5 * Math.sin(clock * 0.16) : 0;
  B.turn += (Math.max(-0.7, Math.min(0.7, look * 0.55)) - B.turn) * (1 - Math.exp(-dt * 1.5));
  // Lowing now and then (soft), a snort; standing, its bell clonks as it moves its head.
  mooIn -= dt;
  snortIn -= dt;
  bellIn -= dt;
  if (mooIn <= 0 && state === 'ride') {
    mooIn = range(MOO_EVERY);
    if (grazeLeft <= 0) {
      SFX.play('cowMoo', 0.75 + 0.25 * rnd());
      mooHead = 1.5;
    }
  }
  if (snortIn <= 0) {
    snortIn = range(SNORT_EVERY);
    SFX.play('cowSnort', 0.5 + 0.3 * rnd());
  }
  if (bellIn <= 0) {
    bellIn = range(BELL_IDLE);
    if (B.gait < 0.1) bellNow = Math.max(bellNow, 0.3 + 0.15 * rnd());
  }
}

/** The ground under its middle is grass or earth (a stop to graze): not sand, rock, paving or a paddy. */
function grassy(w: RoamWorld): boolean {
  const snd = stepSound(w, B.x, probeG[MIDDLE], B.z);
  return snd === 'stepGrass' || snd === 'step';
}

/** Move it: turn, walk, round what is in the way; then its height and tilt over the ground, its legs' pace. */
function move(ctx: RoamCtx, dt: number): void {
  const w = ctx.world;
  const s = B.scale;
  // (where it stands now: a tight spot lets it out, `ok`)
  here = misfits(w, B.x, B.z, B.yaw, B.y);
  if (turnRate !== 0) {
    const ny = B.yaw + turnRate * dt;
    if (ok(w, B.x, B.z, ny, 0)) B.yaw = ny;
    else turnRate *= 0.3;
  }
  const d = speed * dt;
  if (Math.abs(d) > 1e-6) {
    const dx = Math.sin(B.yaw) * d;
    const dz = Math.cos(B.yaw) * d;
    if (ok(w, B.x + dx, B.z + dz, B.yaw, speed)) {
      B.x += dx;
      B.z += dz;
      stopped = '';
    } else {
      const why = blocked;
      stopped = why;
      // (round the corner of a wall or a trunk, as the walker slides along them; not along deep water or steps: it stops there)
      if (why === 'wall' && Math.abs(dx) > Math.abs(dz) * 0.4 && ok(w, B.x + dx * 0.5, B.z, B.yaw, speed)) B.x += dx * 0.5;
      else if (why === 'wall' && Math.abs(dz) > Math.abs(dx) * 0.4 && ok(w, B.x, B.z + dz * 0.5, B.yaw, speed)) B.z += dz * 0.5;
      else {
        speed *= 0.2;
        complain(ctx, why);
      }
    }
  }
  ground(w);
  const gF = probeG[FRONT];
  const gH = probeG[HIND];
  // A land step under its front hooves: it heaves itself up (a grunt), or steps down.
  if (gF - lastFront > 0.8 && state === 'ride') {
    SFX.play('cowGrunt', 0.5);
    pad.rumble('tick', 0.5);
  }
  if (lastFront - gF > 0.8) pad.rumble('tick', 0.35);
  lastFront = gF;
  // Its feet: between the front and the hind hooves' ground, tilted from one to the other (as far as a cow leans).
  const dy = (gF + gH) / 2 - B.y;
  B.y += Math.max(-3.4 * dt, Math.min(2.6 * dt, dy * (1 - Math.exp(-dt * 10))));
  const pitchWant = Math.max(-0.42, Math.min(0.42, Math.atan2(gH - gF, WHEELBASE * s)));
  groundPitch += (pitchWant - groundPitch) * (1 - Math.exp(-dt * 7));
  // Its legs: walking (to 1), trotting (to 2: the stride longer and quicker), stepping round on the spot as it turns.
  const sp = Math.abs(speed);
  let gait = oxGait(sp, s, WALK, TROT);
  const turning = Math.min(0.6, (Math.abs(turnRate) / TURN) * 0.6);
  gait = Math.max(gait, turning);
  B.gait = gait < 0.005 ? 0 : gait;
  hz = sp > 0.03 ? oxHz(B.gait, sp, s) : turning > 0.05 ? 0.8 : 0;
  const dir = speed < -0.01 ? -1 : 1;
  cycles += dir * hz * dt;
  B.phase = (((cycles % 1) + 1) % 1) * TAU;
}

/** Its hooves: a sound as each one comes down (on what is under it), the splash going in; its bell with the front steps. */
function hooves(ctx: RoamCtx): void {
  const w = ctx.world;
  const c = B.phase / TAU;
  const walking = B.gait > 0.12;
  const run = trotShare();
  // (how far the cycle went this step, either way: backing up it runs back)
  let dc = c - lastCycle;
  if (dc > 0.5) dc -= 1;
  else if (dc < -0.5) dc += 1;
  for (const f of FEET) {
    if (!walking || dc === 0) break;
    // (trotting, a hind hoof lands with the front one across from it: one sound for the pair)
    if (run > 0.6 && !f.front) continue;
    const at = f.front ? f.at - 0.25 * run : f.at;
    const ahead = (((at - lastCycle) % 1) + 1) % 1;
    const behind = (((lastCycle - at) % 1) + 1) % 1;
    if (!(dc > 0 ? ahead > 0 && ahead <= dc : behind >= 0 && behind < -dc)) continue;
    const k = f.front ? FRONT : HIND;
    const g = probeG[k];
    const depth = depthAt(w, probeX[k], probeZ[k], g);
    const gain = (f.front ? 0.9 : 0.75) * (0.6 + 0.4 * Math.min(1, B.gait)) * (run > 0.6 ? 1.25 : 1);
    if (depth > 0.1) SFX.play('cowWade', Math.min(1, depth / (0.7 * B.scale)) * gain);
    else {
      const snd = stepSound(w, probeX[k], g, probeZ[k]);
      SFX.play(snd === 'stepGrass' ? 'cowHoofGrass' : snd === 'stepWater' ? 'cowHoofMud' : snd === 'stepStone' || snd === 'stepWood' ? 'cowHoofHard' : 'cowHoofEarth', snd === 'stepSnow' ? gain * 0.6 : gain);
    }
    // (its wooden bell swings with the steps: a clonk on many of the front ones)
    if (f.front && rnd() < (run > 0.5 ? BELL_TROT : BELL_WALK)) bellNow = Math.max(bellNow, run > 0.5 ? 0.7 : 0.5 + 0.15 * rnd());
  }
  lastCycle = c;
  // Into the water off the bank (its front, then its hind legs): a splash as deep as it goes in.
  const dF = depthAt(w, probeX[FRONT], probeZ[FRONT], probeG[FRONT]);
  const dH = depthAt(w, probeX[HIND], probeZ[HIND], probeG[HIND]);
  if (dF > 0.25 && wetFront <= 0.25) SFX.play('cowSplash', Math.min(1, dF / 0.7));
  if (dH > 0.25 && wetHind <= 0.25) SFX.play('cowSplash', 0.6 * Math.min(1, dH / 0.7));
  wetFront = dF;
  wetHind = dH;
}

/** Him on its back: where he sits, how the back tilts and bounces under him, his sway; the camera behind and above. */
function placeRider(ctx: RoamCtx, dt: number): void {
  const { body, cam } = ctx;
  oxPoint(B, 'body', OX_SEAT, seat);
  oxBodyTilt(B, bodyTilt);
  seatState.pitch = B.pitch + bodyTilt.pitch;
  seatState.roll = B.roll + bodyTilt.roll;
  // (the trot's bounce under him, in his body units: he bobs on it a moment late)
  const run = trotShare();
  const bu = BODY_UNIT_M * body.scale;
  seatState.lift = ((OX_ROCK.lift * walkShare() + OX_ROCK.trotLift * run) * Math.sin(B.phase * 2) * (1 - B.rest) * B.scale) / bu;
  sway(seatState, Math.min(dt, 1 / 30), swayVel);
  seatState.half = (OX_HALF * B.scale) / bu;
  seatState.look += ((Math.abs(turnRate) > 0.05 ? (turnRate / TURN) * 0.45 : idle > 2 ? 0.35 * Math.sin(clock * 0.21) : 0) - seatState.look) * (1 - Math.exp(-dt * 2));
  // (leaning back as it stands up front-low, into a climb up a bank, a little forward into the trot)
  seatState.lean += (-0.9 * risePitch + 0.25 * groundPitch + 0.08 * run - seatState.lean) * (1 - Math.exp(-dt * 6));
  seatState.t = clock;
  if (state === 'mount') {
    // Up onto its back: an arc from his feet past its flank, over to the seat; he turns to face its way.
    const e = smooth(u);
    const ctrlX = seat.x + Math.cos(B.yaw) * side * 0.5 * B.scale;
    const ctrlZ = seat.z - Math.sin(B.yaw) * side * 0.5 * B.scale;
    const ctrlY = Math.max(from.y, seat.y) + 0.5;
    const a = (1 - e) * (1 - e);
    const b = 2 * (1 - e) * e;
    const c = e * e;
    body.pos.set(a * from.x + b * ctrlX + c * seat.x, a * from.y + b * ctrlY + c * seat.y, a * from.z + b * ctrlZ + c * seat.z);
    body.yaw += angleDiff(B.yaw, body.yaw) * (1 - Math.exp(-dt * 7));
    seatState.on = u;
  } else if (state === 'dismount') {
    const e = smooth(u);
    const ctrlY = Math.max(seat.y, to.y) + 0.25;
    const ctrlX = (seat.x + to.x) / 2;
    const ctrlZ = (seat.z + to.z) / 2;
    const a = (1 - e) * (1 - e);
    const b = 2 * (1 - e) * e;
    const c = e * e;
    body.pos.set(a * seat.x + b * ctrlX + c * to.x, a * seat.y + b * ctrlY + c * to.y, a * seat.z + b * ctrlZ + c * to.z);
    seatState.on = 1 - u;
  } else {
    body.pos.copy(seat);
    body.yaw = B.yaw;
    seatState.on = 1;
  }
  body.vel.set(0, 0, 0);
  body.grounded = true;
  body.explorer.setMotion(0, true, 0);
  // The camera: behind it and above, looking at him; its rocking and bounce eased out of the view.
  if (settle !== null) {
    cam.distance += (settle - cam.distance) * (1 - Math.exp(-dt * 1.5));
    if (cam.pitch < SETTLE_PITCH) cam.pitch += (SETTLE_PITCH - cam.pitch) * (1 - Math.exp(-dt * 1.5));
    if (ctx.input.zoom || Math.abs(settle - cam.distance) < 0.05) settle = null;
  }
  focusY += (body.pos.y + 1.25 - focusY) * (1 - Math.exp(-dt * 4));
  cam.focus.set(body.pos.x, focusY, body.pos.z);
  cam.behindYaw = B.yaw;
  cam.fov = 50;
}

function hold(ctx: RoamCtx, dt: number): AddonHold {
  const { input, cam } = ctx;
  cam.turn(input.lookYaw, input.lookPitch, input.zoom);
  clock += dt;
  // (its keeper took it off the list: sold, its part gone)
  if (seen !== COW_RIDE.version) {
    seen = COW_RIDE.version;
    if (cow && !COW_RIDE.cows.includes(cow)) cow = null;
  }
  if (!cow) {
    stopNow(ctx);
    return { prompt: null };
  }
  let prompt: string | null = null;
  if (state === 'mount') {
    u = Math.min(1, u + dt / ON_TIME);
    drive(ctx, dt);
    move(ctx, dt);
    if (u >= 1) {
      state = 'ride';
      ctx.sound('stepGrass', 0.4);
      // (a lying cow gets up with him on it)
      if (B.rest > 0.3) {
        rise = 0;
        riseFrom = B.rest;
        riseClock = 0;
      }
      hint(ctx);
    }
  } else if (state === 'ride') {
    prompts();
    // E: it stops, then he gets off (where there is ground beside it).
    if (input.use && !leaving) {
      if (landingSpot(ctx.world, to)) leaving = true;
      else if (!ctx.shot) ctx.hud.toast(t('cowNoOff'));
    }
    drive(ctx, dt);
    move(ctx, dt);
    hooves(ctx);
    if (leaving && rise < 0 && Math.abs(speed) < 0.06 && Math.abs(turnRate) < 0.03 && B.gait < 0.05) {
      // (the spot again, now it has stopped)
      if (landingSpot(ctx.world, to)) startDismount(ctx);
      else leaving = false;
    }
    prompt = leaving || rise >= 0 ? null : offPrompt;
  } else if (state === 'dismount') {
    u = Math.min(1, u + dt / OFF_TIME);
    drive(ctx, dt);
    move(ctx, dt);
    // (it stands still, and level, as he gets off)
    groundPitch *= 1 - Math.min(1, dt * 4);
  }
  write();
  placeRider(ctx, dt);
  if (state === 'dismount' && u >= 1) {
    const { body } = ctx;
    body.pos.copy(to);
    body.explorer.animator.posture = null;
    body.explorer.animator.postureFeet = true;
    body.explorer.setMotion(0, true, 0);
    ctx.sound('land', 0.25);
    B.gait = 0;
    hz = 0;
    write();
    release();
    state = 'none';
    hideRope();
  }
  return { prompt };
}

/** The keys, the first ride of the visit (on a touch screen the stick; a game pad its own buttons). */
function hint(ctx: RoamCtx): void {
  if (hinted || ctx.shot) return;
  hinted = true;
  const touch = document.body.classList.contains('roam-touch');
  if (pad.active) ctx.hud.toast(t('cowPad', { fast: padName('r2', pad.kind) }));
  else ctx.hud.toast(t(touch ? 'cowTouch' : 'cowKeys'));
}

// ── The nose rope ──────────────────────────────────────────────────────────

let rope: InstancedMesh | null = null;
/** How much of it is in his hands (0 hanging from its nose ‥ 1 to his fists): it comes up as he sits, and drops as he gets off. */
let ropeShow = 0;
/** Its way: the ring in its nose, along its left cheek, over its left shoulder by the hump, to his fists. */
const rp = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
const _a = new Vector3();
const _b = new Vector3();
const _p0 = new Vector3();
const _p1 = new Vector3();
const _d = new Vector3();
const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _hm = new Matrix4();
const UP_AXIS = new Vector3(0, 1, 0);

function buildRope(scene: AddonEnv['scene']): InstancedMesh {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 }), ROPE_SEGS);
  mesh.name = 'cow:rope';
  // (thin and always near him: never culled, no shadow of its own)
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const c = new Color();
  // (twisted fibre: the swing's rope colours, light and dark by turns)
  for (let i = 0; i < ROPE_SEGS; i++) mesh.setColorAt(i, c.set(i % 2 ? 0x7a6446 : 0x86704f));
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}

function hideRope(): void {
  ropeShow = 0;
  if (rope) rope.visible = false;
}

/** A fist's place on the map (the rig's prop socket, through his size and heading). */
function fist(s: 'L' | 'R', out: Vector3): Vector3 {
  const body = env!.body;
  const joints = body.explorer.rig.joints;
  // (up the chain from the fist's socket to the rig's root, as `Rig.chainMatrix`, with no array made)
  _hm.identity();
  for (let n: JointName | null = s === 'L' ? 'propL' : 'propR'; n; n = JOINTS[n].parent) {
    joints[n].updateMatrix();
    _hm.premultiply(joints[n].matrix);
  }
  out.setFromMatrixPosition(_hm).multiplyScalar(BODY_UNIT_M * body.scale);
  const c = Math.cos(body.yaw);
  const sn = Math.sin(body.yaw);
  return out.set(body.pos.x + c * out.x + sn * out.z, body.pos.y + out.y, body.pos.z - sn * out.x + c * out.z);
}

/** The point `v` (0 the ring ‥ 1 its end) along the rope's way `rp` (a Catmull-Rom curve through its four points). */
function ropePoint(v: number, out: Vector3): Vector3 {
  const x = Math.min(2.9999, Math.max(0, v * 3));
  const j = Math.floor(x);
  const t1 = x - j;
  const p0 = rp[Math.max(0, j - 1)];
  const p1 = rp[j];
  const p2 = rp[j + 1];
  const p3 = rp[Math.min(3, j + 2)];
  const t2 = t1 * t1;
  const t3 = t2 * t1;
  const a = -0.5 * t3 + t2 - 0.5 * t1;
  const b = 1.5 * t3 - 2.5 * t2 + 1;
  const c = -1.5 * t3 + 2 * t2 + 0.5 * t1;
  const d = 0.5 * t3 - 0.5 * t2;
  return out.set(a * p0.x + b * p1.x + c * p2.x + d * p3.x, a * p0.y + b * p1.y + c * p2.y + d * p3.y, a * p0.z + b * p1.z + c * p2.z + d * p3.z);
}

/** The rope from the ring in its nose to his fists, along its cheek and over its shoulder (no allocation). */
function drawRope(dt: number): void {
  const want = cow && (state === 'ride' || (state === 'mount' && u > 0.75)) ? 1 : 0;
  ropeShow += Math.sign(want - ropeShow) * Math.min(Math.abs(want - ropeShow), dt / 0.35);
  if (!cow || ropeShow <= 0.001 || !env) {
    if (rope) rope.visible = false;
    return;
  }
  rope ??= buildRope(env.scene);
  rope.visible = true;
  oxPoint(B, 'head', OX_NOSE, rp[0]);
  oxPoint(B, 'head', OX_CHEEK, rp[1]);
  oxPoint(B, 'body', OX_SHOULDER, rp[2]);
  fist('L', _a);
  fist('R', _b);
  rp[3].copy(_b.add(_a).multiplyScalar(0.5));
  // Picked up: it uncoils from the ring (hanging under its chin), then its end comes up into his fists; let go, the other way.
  const reach = Math.min(1, ropeShow / 0.35);
  const held = smooth((ropeShow - 0.35) / 0.65);
  if (held < 1) {
    const n = rp[0];
    for (let i = 1; i < 4; i++) rp[i].lerp(_a.set(n.x, n.y - (ROPE_HANG * i) / 3, n.z), 1 - held);
  }
  for (let i = 0; i < ROPE_SEGS; i++) {
    ropePoint((i / ROPE_SEGS) * reach, _p0);
    ropePoint(((i + 1) / ROPE_SEGS) * reach, _p1);
    _d.subVectors(_p1, _p0);
    const len = _d.length();
    _q.setFromUnitVectors(UP_AXIS, len > 1e-6 ? _d.multiplyScalar(1 / len) : UP_AXIS);
    _m.compose(_p0.add(_p1).multiplyScalar(0.5), _q, _s.set(ROPE_THICK, len + ROPE_THICK * 0.5, ROPE_THICK));
    rope.setMatrixAt(i, _m);
  }
  rope.instanceMatrix.needsUpdate = true;
}

// ── URL values (checks) ────────────────────────────────────────────────────

/** A cow of his that nobody draws (`cowfake=1`, a step in front of him; or `cowfake=x,z`): the ride's logic alone. */
function fake(q: URLSearchParams, ctx: RoamCtx): void {
  const v = q.get('cowfake');
  if (!v) return;
  const { body, world } = ctx;
  const at = v.split(',').map(Number);
  const x = at.length === 2 && at.every(Number.isFinite) ? at[0] : body.pos.x + Math.sin(body.yaw) * 2.2;
  const z = at.length === 2 && at.every(Number.isFinite) ? at[1] : body.pos.z + Math.cos(body.yaw) * 2.2;
  const c = rideCow('own-test', 'his');
  c.x = x;
  c.z = z;
  c.y = world.field.heightAt(x, z);
  c.yaw = wrapAngle(body.yaw + Math.PI / 2);
  c.scale = 1.4;
  c.canRide = true;
  addRideCow(c);
  console.info(`[cow] a cow of his drawn by nobody (own-test) at (${x.toFixed(1)}, ${c.y.toFixed(1)}, ${z.toFixed(1)})`);
}

function fromUrl(q: URLSearchParams, ctx: RoamCtx): void {
  fake(q, ctx);
  const v = q.get('cow');
  if (!v) return;
  if (!COW_RIDE.cows.length) {
    console.info(`[cow] cow=${v}: no cattle to ride (the village's people not built?)`);
    return;
  }
  const { body, world } = ctx;
  const [what, how] = v.split(':');
  unpark();
  // The cow nearest `at=`, brought there.
  const p = body.pos;
  let c = COW_RIDE.cows[0];
  for (const o of COW_RIDE.cows) if (Math.hypot(o.x - p.x, o.z - p.z) < Math.hypot(c.x - p.x, c.z - p.z)) c = o;
  // (its feet on the land there, or the road's paving: never on a roof or a deck a URL's `at=` may name)
  const groundAt = (x: number, z: number) => {
    const land = world.field.heightAt(x, z);
    const g = world.standAt ? world.standAt(x, z, land + 0.05, BUILT, ROOM) : land;
    return Number.isNaN(g) ? land : g;
  };
  if (what === 'near') {
    // A step in front of him, across his way, grazing (or lying): not ridden, held still there for the prompt.
    const x = p.x + Math.sin(body.yaw) * 2.0;
    const z = p.z + Math.cos(body.yaw) * 2.0;
    c.x = x;
    c.z = z;
    c.y = groundAt(x, z);
    c.yaw = wrapAngle(body.yaw + Math.PI / 2);
    c.lying = how === 'lie';
    c.head = how === 'lie' ? 0 : 1;
    c.pitch = c.roll = c.speed = 0;
    c.canRide = true;
    c.ridden = true;
    parked = c;
    console.info(`[cow] cow=${v}: ${c.id} (${c.owner}) ${how === 'lie' ? 'lying' : 'standing'} at (${x.toFixed(1)}, ${c.y.toFixed(1)}, ${z.toFixed(1)})`);
    return;
  }
  if (what !== 'ride' && what !== 'lie' && what !== 'graze' && what !== 'trot' && what !== 'off') return;
  // (he sits on its back: `at=` is where its feet are, under him)
  c.x = p.x;
  c.z = p.z;
  c.y = groundAt(p.x, p.z);
  c.yaw = wrapAngle(body.yaw);
  c.lying = what === 'lie';
  c.head = 0;
  startMount(c, ctx);
  // (the camera as the URL has it: `rcam=`)
  settle = null;
  state = 'ride';
  u = 1;
  if (what === 'lie') {
    rise = 0;
    riseFrom = 1;
    riseClock = 0;
    B.rest = 1;
  }
  if (what === 'graze') grazeLeft = grazeFor = 30;
  trotHeld = what === 'trot';
  hinted = true;
  write();
  placeRider(ctx, 1);
  seatState.lagPitch = seatState.pitch;
  seatState.lagRoll = seatState.roll;
  focusY = body.pos.y + 1.25;
  if (what === 'off') {
    if (landingSpot(world, to)) {
      state = 'dismount';
      u = 1;
      placeRider(ctx, 1);
      body.pos.copy(to);
    }
    body.explorer.animator.posture = null;
    body.explorer.animator.postureFeet = true;
    release();
    state = 'none';
  }
  console.info(`[cow] cow=${v}: ${c.id} (${c.owner}), the cow nearest at=, brought to (${B.x.toFixed(1)}, ${B.y.toFixed(1)}, ${B.z.toFixed(1)}), size ${B.scale.toFixed(2)}`);
}

// ── The add-on ─────────────────────────────────────────────────────────────

/** Its keys (the key help while he rides): keyboard, and the game pad's (the left stick, R2, □, the right stick). */
const RIDE_KEYS: readonly AddonKey[] = [
  ['W S', 'cowKeyWalk', 'lstick'],
  ['A D', 'rTurn', 'lstick'],
  ['Shift', 'cowKeyTrot', 'r2'],
  ['E', 'cowKeyOff', 'west'],
  ['Q R', 'rLook', 'rstick'],
];

registerAddon({
  id: 'cow',
  // (as the buffalo's: before a boat tied up by the bank, a ramp or a beacon that is also in reach)
  order: 45,
  init(e) {
    env = e;
    // (checks: where the ride is, read by test scripts)
    Object.assign(window, {
      __cowRide: {
        get state() {
          return state;
        },
        get leaving() {
          return leaving;
        },
        get grazing() {
          return grazeLeft > 0;
        },
        get rising() {
          return rise >= 0;
        },
        get speed() {
          return speed;
        },
        get trot() {
          return trotShare();
        },
        get turnRate() {
          return turnRate;
        },
        get rope() {
          return ropeShow;
        },
        /** What stopped it last ('' nothing since it moved on; wall, deep, built, drop, edge) and how many of its probes stick out where it stands. */
        get blocked() {
          return stopped;
        },
        get misfit() {
          return here;
        },
        /** The cow he rides (its fields), or the one a URL holds before him. */
        get cow() {
          return cow;
        },
        get parked() {
          return parked;
        },
        get bob() {
          return seatState.lagLift - seatState.lift;
        },
        /** Its probes where it stands turned `dyaw` (rad) and moved `ahead` m: which fit, the ground under each, what stops it (a check's look; it allocates). */
        probe(dyaw = 0, ahead = 0) {
          const w = env?.world;
          if (!w) return null;
          const yaw = B.yaw + dyaw;
          const bad = misfits(w, B.x + Math.sin(yaw) * ahead, B.z + Math.cos(yaw) * ahead, yaw, B.y);
          return { bad, blocked, ok: [...tryOk], g: [...tryG].map((v) => +v.toFixed(2)), y: B.y };
        },
        pose: B,
        seat,
        get cows() {
          return COW_RIDE.cows;
        },
      },
    });
  },
  get holding() {
    return state !== 'none';
  },
  holdIn: 'walk',
  get handsBusy() {
    return state !== 'none';
  },
  // (the key help, bottom left, while he rides: no jump, no tools; the same array each time)
  keys: () => RIDE_KEYS,
  offer(ctx, mode) {
    if (mode !== 'walk' || state !== 'none' || env?.busy()) return null;
    if (!nearest(ctx)) return null;
    prompts();
    return ridePrompt;
  },
  use(ctx, mode) {
    if (mode !== 'walk' || state !== 'none') return;
    const c = nearest(ctx);
    if (c) startMount(c, ctx);
  },
  hold,
  after(ctx, mode) {
    // (calm: on foot not running, or on its back; the cattle then let him come up)
    const v = ctx.body.vel;
    COW_RIDE.calm = mode === 'walk' && (state !== 'none' || Math.sqrt(v.x * v.x + v.z * v.z) < 6);
  },
  frame(f: MapFrame) {
    drawRope(Math.min(f.dt, 0.1) || (env?.shot ? 1 : 0));
    // (its bell, where it hangs under its neck: the village cattle's own sound, through the map's calls)
    if (bellNow > 0) {
      if (cow && f.dt > 0 && !env?.shot) {
        oxPoint(B, 'neck', BELL, bellAt);
        f.calls.push({ kind: 'cowBell', x: bellAt.x, y: bellAt.y, z: bellAt.z, gain: bellNow });
      }
      bellNow = 0;
    }
  },
  setMode(next: RoamMode, _prev: RoamMode, ctx: RoamCtx) {
    // (on foot he comes calmly until he runs: `after`)
    COW_RIDE.calm = next === 'walk';
    if (next !== 'walk') stopNow(next === 'overview' ? null : ctx);
    if (next === 'overview') {
      COW_RIDE.calm = false;
      unpark();
    }
  },
  fromUrl,
  report() {
    if (state === 'none' || !cow) return null;
    return {
      cow: grazeLeft > 0 ? 'graze' : rise >= 0 ? 'lie' : 'ride',
      // (where its feet are: the shot brings the cow there and seats him on it)
      at: `${B.x.toFixed(2)},${B.z.toFixed(2)}`,
      yaw: deg(B.yaw).toFixed(0),
      ...(cow.id === 'own-test' ? { cowfake: '1' } : {}),
    };
  },
});
