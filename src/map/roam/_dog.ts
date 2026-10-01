import { Vector3 } from 'three';
import { dogPetPose, newDogPet } from '../../character/dogPet';
import { SFX } from '../audio/addonSfx';
import '../audio/_dog';
import { CH } from '../fauna/_kit';
import { len2, len3 } from '../fauna/_len';
import { GREET } from '../greet';
import { padName } from '../pad/glyphs';
import { pad } from '../pad/pad';
import { progress } from '../progress';
import type { MapFrame, MapPart, RoamMode, Subject } from '../types';
import { t } from '../ui/lang';
import { BODY_UNIT_M } from '../../world/scale';
import { ADDONS, registerAddon, type AddonEnv, type AddonHold } from './_addons';
import { closeDogCard, DEFAULT_DOG_NAME, DOG_NAMES, dogCalled, dogCardOpen, dogNameIn, dogQuoted, findDogName, openDogCard, pickDogCard, setDogCardDeps, type DogName } from './_dogCard';
import { DOG_MENU } from './_dogHook';
import { DOG_HEAD, DOG_SCALE, DogMesh, dogHeadLocal, dogPoint, newLook, type DogLook } from './_dogModel';
import { ground, hallAt, KERB, lineWalk, onLand, PathSearch, STEP_UP, stepKind, stepTo, Trail, type Hall } from './_dogPath';
import { mooredBoatNear } from './boat';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * A dog that becomes his friend (add-on `dog`, words `dog…`).
 *
 * - **The village dog**: in the sugar-palm village a tan village dog naps flat
 *   out on its side in the shade beside the little shop on the street (`HOME`). When he comes
 *   near on foot it wakes (a yawn), lifts its head, sits up and watches him, its
 *   tail wagging; close by it stands, wagging harder.
 * - **E "Pet the dog"** (on foot, close, facing it): it comes to sit in front of
 *   him, he squats down and pats its head (character/dogPet.ts); it wags hard,
 *   leans its head into his hand, ears back, eyes shut, a happy whine. **F**
 *   close in front of it: he scratches behind its ear instead of greeting; it
 *   tilts its head into his hand and its hind leg thumps.
 * - **It comes along**: after the second pet (or scratch) "The dog wants to come
 *   with you!", and a card asks its name (_dogCard.ts: លឿង "Yellow" for his tan
 *   dog, ខ្មៅ, ស, ក្រហម, តូច, សំណាង; Esc keeps លឿង). Kept: progress.ts
 *   `dog.adopted`, `dog.name` (the pets before it: `dog.pets`).
 * - **Following** on foot: a few metres behind along his trail (_dogPath.ts),
 *   walking, trotting to keep up, galloping when he runs; round walls and water
 *   as he went, cutting corners where a straight way is free; up the temple
 *   stairs, over the bridges, up and down the land's steps with a hop; never
 *   through a wall, never swimming (it waits at the bank). When he stops it
 *   turns to him and sits, lies down after a while, sleeps if he does (J / L);
 *   now and then it sniffs about, or barks at the monkeys and the junglefowl.
 * - **Waiting**: while he is in the boat, under the glider or the parachute, in
 *   the balloon, or another add-on has him (the bicycle, the cart, the
 *   buffalo, the zip line, the hammock, the ladder…), it waits where he left it,
 *   sitting, watching him. On foot again it finds the way to him (an A* over the
 *   walk map, a slice a step) and comes running; far away (over 150 m) it
 *   trots when there is a way, else it waits ("far away · 0 calls it").
 * - **0 "Call the dog"** (the explorer menu's "Call the dog" for a game pad or
 *   touch): it comes along the way it finds; with none, it comes out from
 *   behind a bush near him (a soft dissolve). Back to the map it goes home; the
 *   next time he lands it is waiting by where he lands.
 *
 * His stilt house (a later add-on) uses `dogBed` / `dogHome` / `dogState`.
 *
 * Its model and shader: _dogModel.ts (one draw, and one for its shadow); its
 * sounds: audio/_dog.ts. Nothing is allocated a step while it lives (its
 * path search's arrays are made once); what is far from him and the camera
 * sleeps.
 *
 * URL (checks): `dog=follow` (his dog, beside him at `at=`), `dog=sit|lie|sleep`
 * (settled by him so), `dog=pet|scratch` (petting it: `sim=_:<s>` how far),
 * `dog=adopt` (the village dog before him, petted once: E pets it the second
 * time), `dog=name` (the name card open), `dog=nap|wake` (the village dog at
 * home), `dog=wait` (his dog waiting at `dogat=x,z`), `dog=call` (called from
 * `dogat=` at once), `dog=bark` (barking at the nearest monkey or hen), `dog=away` (his
 * dog at home: it comes in by him when he lands, as at the start of a visit), `dog=0`
 * (no dog drawn) · `dogat=x,z` where it is · `dogname=<id|Khmer|Latin>`.
 */

// ── Tuning ─────────────────────────────────────────────────────────────────

/** The village dog's spot: on the ground beside the little shop's front, in the shade of its awning (hamlet/_evSpots.ts `EV_KIOSK` 414.8, −56.2), its head to the street. */
const HOME = { x: 419.0, z: -59.1, yaw: 3.3 };
/** He comes this near (m) and it wakes; it naps again once he is this far for this long (s). */
const WAKE = 9;
const SLEEP_AGAIN = 17;
const SLEEP_AFTER = 8;
/** Petting: from his feet to the dog (m) and how far round from his facing (rad); where it sits (m from his feet to its crown). */
const PET_REACH = 2.5;
const PET_CONE = 0.85;
/** Its crown while he pats it: this far ahead of his feet and to his right (m, drawn for him at 1.4 × his size). */
const PET_AT = { ahead: 0.42, right: 0.2 };
/** Two pets (or scratches) and it comes along. */
const PETS_TO_ADOPT = 2;
/** Following: it stops when its way to him is this short (m), sets off again past this. */
const FOLLOW_STOP = 2.4;
const FOLLOW_GO = 3.6;
/** How far behind him it keeps while he walks on (m). */
const FOLLOW_KEEP = 3.2;
/** He is on its level within this up or down (m: a crate he stands on, a step): more, and it is not beside him (a deck, a ledge). */
const LEVEL = 1.3;
/** Its fastest (m/s, drawn: he runs at ≈ 10), and how quickly it gets going and stops (m/s²). */
const TOP = 11;
const ACCEL = 10;
const BRAKE = 14;
/** Far: it trots to him only along a way it finds (m); the longest way it looks for (m). */
const FAR = 150;
const SEARCH_MAX = 420;
/** Looks for a way again this often while it waits for him on foot (s). */
const RETRY = 4;
/** Where he was when no way was found, and how long until it looks again anyway (s; doubles each time). */
const FAILED = { x: Infinity, z: Infinity, wait: 0 };
/** Drawn within this of the camera (m), its life stepped within this of him or the camera (m: the village dog). */
const DRAW_FAR = 170;
const THINK_FAR = 110;
/** It comes in from this far (m: behind a bush near him), fading in this long (s). */
const APPEAR = [5, 9] as const;
const FADE = 0.7;
/** Barks at a monkey or a junglefowl this near it (m), at most this often (s). */
const BARK_NEAR = 15;
const BARK_EVERY = [35, 70] as const;
/** Ground covered in one stride (m of a real dog: × its size): walking, trotting, galloping. */
const STRIDE = [0.62, 1.2, 2.0] as const;

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (u: number) => {
  const c = clamp(u, 0, 1);
  return c * c * (3 - 2 * c);
};
const approach = (v: number, to: number, rate: number, dt: number) => v + (to - v) * (1 - Math.exp(-rate * dt));

// ── State ──────────────────────────────────────────────────────────────────

type Life = 'nap' | 'awake' | 'follow' | 'wait' | 'come' | 'door' | 'away' | 'bed' | 'none';
type Act = 'none' | 'sniff' | 'bark';

let env: AddonEnv | null = null;
let mesh: DogMesh | null = null;
let fauna: MapPart | null = null;
/** The last step's context (for the frame, the cards). */
let lastCtx: RoamCtx | null = null;

let adopted = false;
let pets = 0;
let name: DogName = DEFAULT_DOG_NAME;
/** No dog at all (`dog=0`). */
let hidden = false;
/** Checks only: held standing (`dog=stand`), a gait shown on the spot (`doggait=1|2|3`: walk, trot, gallop). */
const HOLD = { stand: false, gait: -1, fade: -1 };

let life: Life = 'nap';
let act: Act = 'none';
/** The roaming mode as of the last step. */
let roamMode: RoamMode = 'overview';
/** It is to come in by where he is the next time he is on foot (a visit begun, `dogHome(false)`). */
let arrive = false;
/** Looked for ground by him to come in on again in this long (s); he has stood on his feet this long (s), and must have to be come to. */
let arriveIn = 0;
let landedFor = 0;
const LANDED = 1.8;
/** He is home (his stilt house): it sleeps on its bed. */
let atHome = false;
const bed = { x: HOME.x, y: NaN, z: HOME.z, yaw: HOME.yaw, set: false };

/** The add-on's clock (s): the channels are set and drawn by it. */
let clock = 0;
let stepped = false;

/** The dog: feet (m), heading, speed, the ground's tilt under it, how seen it is (0‥1, the dissolve). */
const D = { x: HOME.x, y: 0, z: HOME.z, yaw: HOME.yaw, speed: 0, pitch: 0, roll: 0, seen: 1, placed: false };
/** A hop up a land step or a jump down: from, to, how long, how far in. */
const AIR = { on: false, t: 0, dur: 0.4, up: true, x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 };
/** Its pose as the channels get it: gait (0 still, 1 walk, 2 trot, 3 gallop), rest (0 stand, 1 sit, 2 lie, 3 flat out), head, turn. */
const pose = { gait: 0, hz: 1, rest: 0, restGoal: 0, restAt: 0, head: 0, turn: 0 };
/** Its moods: what they are (eased), and what it wants them to be. */
const look: DogLook = newLook();
const want: DogLook = newLook();
let wagHz = 2;

/** How it goes: along his trail, a path found, straight to him, to a spot, or not at all. */
let route: 'none' | 'trail' | 'path' | 'direct' | 'spot' = 'none';
let ri = 0;
const SPOT = { x: 0, y: 0, z: 0 };
const trail = new Trail();
const search = new PathSearch();
let searchFor: 'come' | 'call' | 'bed' | 'door' | 'reach' | 'none' = 'none';
/** Its way goes to the foot of where he is (no way up to him: `PathSearch` `near`): there it waits. */
let toFoot = false;
let retryIn = 0;
/** Its way to him (m), and it is on its way (not settled). */
let wayLeft = 0;
let going = false;
let stuck = 0;
/** On its way but not moving (s). */
let halted = 0;
/** Timers (s): settled, since he last moved, the next sniff / bark scan, the bark's cool-down, the sniff or bark under way. */
let settled = 0;
let stillFor = 0;
let nextSniff = 8;
let nextScan = 2;
let barkCool = 20;
let actT = 0;
let barksLeft = 0;
let nextBarkAt = 0;
const BARK_AT = { x: 0, z: 0 };
/** Panting after a run (0‥1 of how hard it ran). */
let effort = 0;
/** A happy moment (s left: wagging hard, ears back) — called, he came back, he greeted. */
let joy = 0;
/** He last stood here (for his speed), and his speed (m/s). */
const HIM = { x: 0, y: 0, z: 0, speed: 0, set: false };
/** He was not walking since the last crumb (a ride, the boat, a fall): the next crumb has a gap before it. */
let gapped = true;
let lastGreet = GREET.n;
/** Toasts waiting (s from now, in order), and the far-away hint said once per landing. */
const HINTS: { in: number; text: string }[] = [
  { in: -1, text: '' },
  { in: -1, text: '' },
];
let farSaid = false;
/** A village dog's sleep timer (s far from him). */
let awayFor = 0;

// ── Petting ──

const PET = { on: false, kind: 'pet' as 'pet' | 'scratch', face: 0, t: 0, leaving: -1, crouch: 0, reach: 0, contact: false, lastThump: 0, sx: 0, sz: 0, patFrom: -1, done: false, camFree: false };
const petState = newDogPet();
const petPosture = () => dogPetPose(petState);
/** The follow camera as it was before petting (put back after), and its easing back out (s left, to how far). */
const CAM = { follow: 0.6, distance: 9, pitch: 0.3, min: 3.5 };
const CAM_BACK = { left: 0, to: 9 };

const _v = new Vector3();
const _w = new Vector3();
const _subjects: Subject[] = [];

// ── Small helpers ──────────────────────────────────────────────────────────

/** Another add-on holds him (the bicycle, the cart, the hammock…). */
const othersHolding = (): boolean => {
  for (const a of ADDONS) if (a.holding && a.id !== 'dog') return true;
  return false;
};

/** Loudness of its sounds by how far it is from him (0‥1). */
function near(gain: number): number {
  if (!lastCtx) return 0;
  const p = lastCtx.body.pos;
  const d = len3(D.x - p.x, D.y - p.y, D.z - p.z);
  return gain * clamp(1 - (d - 3) / 40, 0, 1) ** 1.4;
}

function sound(name: string, gain: number): void {
  if (!env || env.shot || hidden || want.fade < 0.3) return;
  const g = near(gain);
  if (g > 0.01) SFX.play(name, g);
}

/** The key that calls it, as the player plays (0, or none on a pad and on touch: the explorer menu). */
const viaMenu = () => pad.active || document.body.classList.contains('roam-touch');
const greetKey = () => (pad.active ? padName('down', pad.kind) : 'F');
/** Its name in a prompt or a toast ("ឆ្កែស": a one-letter name reads as a name), and on its own in quotes («ស»). */
const named = () => dogCalled(name);
const quoted = () => dogQuoted(name);

function toast(text: string): void {
  env?.hud.toast(text);
}

/** A toast in a moment (after another; two may wait). */
function toastLater(text: string, s: number): void {
  const h = HINTS[0].in > 0 ? HINTS[1] : HINTS[0];
  h.text = text;
  h.in = s;
}

/** The rest it is to go to (0 stand, 1 sit, 2 lie, 3 flat out): one step every 0.6 s, through the ones between. */
function restTo(goal: number): void {
  pose.restGoal = goal;
}

/** It stands (ready to go). */
const standing = () => pose.rest === 0 && mesh !== null && mesh.value(CH.rest, clock) < 0.3;

// ── Where it goes ──────────────────────────────────────────────────────────

/** Put it at (x, z) facing `yaw`: on the floor there at height `y` (never on another level: the tier under a terrace's edge, the land under a deck), or on the top there when no `y` is given. */
function putAt(x: number, z: number, yaw: number, y = NaN): void {
  const w = env?.world;
  let gy = y;
  if (w) {
    const g = ground(w, x, z, Number.isNaN(y) ? w.groundAt(x, z) : y + 0.5, Number.isNaN(y) ? 0.1 : STEP_UP);
    if (Number.isNaN(y)) gy = Number.isNaN(g) ? w.groundAt(x, z) : g;
    else gy = !Number.isNaN(g) && Math.abs(g - y) <= STEP_UP ? g : y;
  }
  D.x = x;
  D.z = z;
  D.y = Number.isNaN(gy) ? 0 : gy;
  D.yaw = yaw;
  D.speed = 0;
  D.pitch = D.roll = 0;
  D.placed = true;
  AIR.on = false;
  route = 'none';
  stuck = 0;
}

/** The village dog's spot, on the ground there (near `HOME`: the first free spot round it). */
function homeSpot(): void {
  const w = env?.world;
  if (!w) return;
  for (let r = 0; r <= 4; r += 0.5)
    for (let a = 0; a < 12; a++) {
      const x = HOME.x + Math.cos((a * TAU) / 12) * r;
      const z = HOME.z + Math.sin((a * TAU) / 12) * r;
      const top = w.groundAt(x, z);
      const g = ground(w, x, z, top, 0.1);
      if (Number.isNaN(g) || g - w.field.heightAt(x, z) > 0.4) continue;
      // (room for its body: the ground round it too)
      if (Number.isNaN(lineWalk(w, x, g, z, x + Math.sin(HOME.yaw) * 0.5, z + Math.cos(HOME.yaw) * 0.5))) continue;
      if (Number.isNaN(lineWalk(w, x, g, z, x - Math.sin(HOME.yaw) * 0.5, z - Math.cos(HOME.yaw) * 0.5))) continue;
      HOME_AT.x = x;
      HOME_AT.y = g;
      HOME_AT.z = z;
      return;
    }
  HOME_AT.x = HOME.x;
  HOME_AT.z = HOME.z;
  HOME_AT.y = w.groundAt(HOME.x, HOME.z);
}
const HOME_AT = { x: HOME.x, y: 0, z: HOME.z };

/** Stop looking (a look whether it can come up to him is forgotten: looked again when asked). */
function stopSearch(): void {
  search.cancel();
  if (searchFor === 'reach' && REACH.state === 'busy') REACH.state = 'none';
  searchFor = 'none';
}

/** Start looking for a way from it to (tx, ty, tz), for `why`. */
function seek(why: 'come' | 'call' | 'bed' | 'door', tx: number, ty: number, tz: number, limit: number): void {
  if (!env) return;
  if (searchFor === 'reach' && REACH.state === 'busy') REACH.state = 'none';
  search.start(env.world, D.x, D.y, D.z, tx, ty, tz, limit);
  searchFor = why;
}

/**
 * One step toward (tx, ty, tz) at `speed` (m/s), turning to it: walking (stairs, slopes), a hop up a land step, a
 * jump down; never into a wall or deep water (it stops: `stuck` grows).
 */
function drive(dt: number, tx: number, tz: number, speed: number): void {
  const w = env!.world;
  if (AIR.on) return flyOn(dt);
  const dx = tx - D.x;
  const dz = tz - D.z;
  const dist = len2(dx, dz);
  // (a sharp turn: round on the spot first, then off; nowhere to go: no turn)
  const off = dist > 0.05 ? angleDiff(Math.atan2(dx, dz), D.yaw) : 0;
  const turnRate = 5 + D.speed * 0.6;
  D.yaw += off * (1 - Math.exp(-turnRate * dt));
  if (dist > 0.05 && D.speed < 0.5 && Math.abs(off) > 0.6) TURN.rate = off;
  const facing = Math.abs(off) < 1.2 ? 1 : 0.15;
  const goal = dist < 0.05 ? 0 : Math.min(speed, dist / Math.max(dt, 1e-3)) * facing;
  D.speed += clamp(goal - D.speed, -BRAKE * dt, ACCEL * dt);
  let move = jammed > 0 ? 0 : Math.min(dist, D.speed * dt);
  if (move < 1e-4) {
    settleY(dt, D.y);
    return;
  }
  const ux = dx / dist;
  const uz = dz / dist;
  let gy = D.y;
  let moved = 0;
  while (move > 1e-4) {
    const s = Math.min(0.25, move);
    const nx = D.x + ux * s;
    const nz = D.z + uz * s;
    const g = stepTo(w, D.y, nx, nz, ux, uz);
    if (Number.isNaN(g)) {
      // (a wall met at a slant: slide along it; a post or a stair's stringer across the way: a small step aside, round it)
      let ok = false;
      if (Math.abs(ux) > 0.3) {
        const ga = stepTo(w, D.y, D.x + ux * s, D.z, ux, 0);
        if (!Number.isNaN(ga) && stepKind === 'walk') {
          D.x += ux * s;
          gy = ga;
          ok = true;
        }
      }
      if (!ok && Math.abs(uz) > 0.3) {
        const gb = stepTo(w, D.y, D.x, D.z + uz * s, 0, uz);
        if (!Number.isNaN(gb) && stepKind === 'walk') {
          D.z += uz * s;
          gy = gb;
          ok = true;
        }
      }
      if (!ok) {
        const gs = sidestep(w, ux, uz, s);
        if (!Number.isNaN(gs)) {
          gy = gs;
          ok = true;
        }
      }
      if (!ok) {
        stuck += dt;
        D.speed *= 0.5;
        break;
      }
      moved += s * 0.5;
      move -= s;
      continue;
    }
    if (stepKind !== 'walk') {
      leap(nx + ux * 0.25, nz + uz * 0.25, g, stepKind === 'hop', ux, uz);
      return;
    }
    D.x = nx;
    D.z = nz;
    gy = g;
    moved += s;
    move -= s;
  }
  if (moved > 0) stuck = Math.max(0, stuck - dt);
  settleY(dt, gy);
}

/** Checks (`__dog.jam(s)`, dev server): it cannot step for that long, as if every step were blocked. */
let jammed = 0;

/**
 * Something thin across its way (a post, a stringer under a stair): a little to one side (up to 0.4 m) the way on is
 * free? It moves that way (no faster than `s`) and gives the floor there; NaN: no way round.
 */
function sidestep(w: AddonEnv['world'], ux: number, uz: number, s: number): number {
  for (const o of SIDE)
    for (let side = -1; side <= 1; side += 2) {
      const px = D.x - uz * o * side;
      const pz = D.z + ux * o * side;
      const g1 = stepTo(w, D.y, px, pz, -uz * side, ux * side);
      if (Number.isNaN(g1) || stepKind !== 'walk') continue;
      const g2 = stepTo(w, g1, px + ux * s, pz + uz * s, ux, uz);
      if (Number.isNaN(g2) || stepKind !== 'walk') continue;
      const k = Math.min(1, s / o);
      D.x += (px - D.x) * k;
      D.z += (pz - D.z) * k;
      return g1;
    }
  return NaN;
}
const SIDE = [0.12, 0.25, 0.4] as const;

/** Its feet onto the ground under it (stairs as fast as it climbs them), and its body tilted with the ground. */
function settleY(dt: number, gy: number): void {
  const rate = 2.5 + 1.4 * D.speed;
  D.y += clamp(gy - D.y, -rate * dt, rate * dt);
  const w = env!.world;
  // (the ground under its front and hind feet: the body pitches along a stair or a slope)
  const half = 0.3 * DOG_SCALE;
  const sx = Math.sin(D.yaw) * half;
  const sz = Math.cos(D.yaw) * half;
  const f = ground(w, D.x + sx, D.z + sz, D.y, STEP_UP);
  const b = ground(w, D.x - sx, D.z - sz, D.y, STEP_UP);
  const tilt = Number.isNaN(f) || Number.isNaN(b) ? 0 : clamp(-Math.atan2(f - b, half * 2), -0.5, 0.5);
  D.pitch = approach(D.pitch, tilt, 8, dt);
  D.roll = approach(D.roll, 0, 8, dt);
}

/** Off it goes: a hop up onto a land step (`up`), or a jump down. */
function leap(x: number, z: number, y: number, up: boolean, ux: number, uz: number): void {
  const w = env!.world;
  // (it lands a little past the edge, where the step goes on)
  const g = ground(w, x, z, y, STEP_UP);
  const land = !Number.isNaN(g) && Math.abs(g - y) < STEP_UP;
  AIR.on = true;
  AIR.t = 0;
  AIR.up = up;
  AIR.x0 = D.x;
  AIR.y0 = D.y;
  AIR.z0 = D.z;
  AIR.x1 = land ? x : x - ux * 0.25;
  AIR.z1 = land ? z : z - uz * 0.25;
  AIR.y1 = land ? g : y;
  const dy = Math.abs(AIR.y1 - AIR.y0);
  AIR.dur = up ? 0.42 + 0.06 * dy : 0.3 + 0.07 * dy;
}

function flyOn(dt: number): void {
  AIR.t += dt / AIR.dur;
  const k = Math.min(1, AIR.t);
  const dy = AIR.y1 - AIR.y0;
  let h: number;
  let y: number;
  if (AIR.up) {
    // (up first, over the edge, then forward onto the top)
    h = k < 0.55 ? 0.35 * smooth(k / 0.55) : 0.35 + 0.65 * smooth((k - 0.55) / 0.45);
    y = k < 0.55 ? AIR.y0 + (dy + 0.3) * Math.sin((k / 0.55) * (Math.PI / 2)) : AIR.y1 + 0.3 * (1 - smooth((k - 0.55) / 0.45));
    want.leap = k < 0.5 ? -1 : 0.6;
  } else {
    h = Math.min(1, k * 1.25);
    y = AIR.y0 + dy * k * k + 0.18 * 4 * k * (1 - k);
    want.leap = 0.8;
  }
  D.x = AIR.x0 + (AIR.x1 - AIR.x0) * h;
  D.z = AIR.z0 + (AIR.z1 - AIR.z0) * h;
  D.y = y;
  D.pitch = approach(D.pitch, 0, 10, dt);
  if (k >= 1) {
    AIR.on = false;
    D.y = AIR.y1;
    want.leap = 0;
    sound('dogThump', 0.6);
  }
}

// ── His trail and the way to him ───────────────────────────────────────────

/** Its way left to him (m) along the route, and the point it heads for now (into SPOT-like out). */
const AIM = { x: 0, y: 0, z: 0 };

/** Follow him: the way along his trail (or straight, where free), the point to head for, how far it is. */
function wayToHim(ctx: RoamCtx): number {
  const p = ctx.body.pos;
  // (up or down a stair to him counts too: he is not by it two metres over it)
  const direct = len2(p.x - D.x, p.z - D.z) + Math.max(0, Math.abs(p.y - D.y) - KERB) * 1.5;
  if (route === 'direct') {
    AIM.x = p.x;
    AIM.y = p.y;
    AIM.z = p.z;
    return direct;
  }
  if (route === 'trail') {
    // (crumbs it has reached: on to the next)
    while (trail.has(ri) && len2(trail.x(ri) - D.x, trail.z(ri) - D.z) < 0.4 && Math.abs(trail.y(ri) - D.y) < 1.5) ri++;
    if (!trail.has(ri)) {
      AIM.x = p.x;
      AIM.y = p.y;
      AIM.z = p.z;
      return direct;
    }
    AIM.x = trail.x(ri);
    AIM.y = trail.y(ri);
    AIM.z = trail.z(ri);
    let len = len2(AIM.x - D.x, AIM.z - D.z);
    for (let i = ri + 1; i < trail.n; i++) len += len2(trail.x(i) - trail.x(i - 1), trail.z(i) - trail.z(i - 1));
    const last = trail.n - 1;
    return len + len2(p.x - trail.x(last), p.z - trail.z(last));
  }
  if (route === 'path') {
    const pp = search.path;
    while (ri < pp.count && len2(pp.x[ri] - D.x, pp.z[ri] - D.z) < reachAt(ri) && Math.abs(pp.y[ri] - D.y) < 1.5) ri++;
    if (ri >= pp.count) {
      AIM.x = p.x;
      AIM.y = p.y;
      AIM.z = p.z;
      return direct;
    }
    AIM.x = pp.x[ri];
    AIM.y = pp.y[ri];
    AIM.z = pp.z[ri];
    let len = len2(AIM.x - D.x, AIM.z - D.z);
    for (let i = ri + 1; i < pp.count; i++) len += len2(pp.x[i] - pp.x[i - 1], pp.z[i] - pp.z[i - 1]);
    return len + len2(p.x - pp.x[pp.count - 1], p.z - pp.z[pp.count - 1]);
  }
  AIM.x = D.x;
  AIM.y = D.y;
  AIM.z = D.z;
  return direct;
}

/**
 * How near (m) to path point `i` counts as there: before a step up or down to the next point (a hop, a jump, a stair's
 * tall tread) its column's middle, so it goes on straight across as the search went (the same step, the same checks).
 */
function reachAt(i: number): number {
  const pp = search.path;
  return i + 1 < pp.count && Math.abs(pp.y[i + 1] - pp.y[i]) > KERB ? 0.12 : 0.4;
}

/** Along its way to (ex, ez) (its bed, a hall's door): the next point of the way found (or the end). */
function wayAlong(ex: number, ez: number): void {
  const pp = search.path;
  while (ri < pp.count && len2(pp.x[ri] - D.x, pp.z[ri] - D.z) < reachAt(ri) && Math.abs(pp.y[ri] - D.y) < 1.5) ri++;
  if (ri < pp.count) {
    AIM.x = pp.x[ri];
    AIM.z = pp.z[ri];
  } else {
    AIM.x = ex;
    AIM.z = ez;
  }
}

/** A gap in his trail between crumb `from` and the newest (he jumped, fell, rode, sailed). */
function trailBroken(from: number): boolean {
  if (!trail.has(from)) return true;
  for (let i = from + 1; i < trail.n; i++) if (trail.gap(i)) return true;
  return false;
}

/** Onto his trail, at the crumb nearest the dog (of the last 60). */
function toTrail(): void {
  route = 'trail';
  let best = trail.n - 1;
  let bd = Infinity;
  for (let i = Math.max(trail.first, trail.n - 60); i < trail.n; i++) {
    const dd = len2(trail.x(i) - D.x, trail.z(i) - D.z) + Math.abs(trail.y(i) - D.y) * 2;
    if (dd < bd) {
      bd = dd;
      best = i;
    }
  }
  ri = Math.max(best, trail.first);
}

/** Shortcuts (a few tries a check): straight to him when the way is free, else to a later crumb or path point. */
function shortcut(ctx: RoamCtx): void {
  const w = ctx.world;
  const p = ctx.body.pos;
  const d = len2(p.x - D.x, p.z - D.z);
  if (d < 40) {
    const y = lineWalk(w, D.x, D.y, D.z, p.x, p.z);
    if (!Number.isNaN(y) && Math.abs(y - p.y) < 0.9) {
      route = 'direct';
      return;
    }
  }
  if (route === 'direct') {
    // (not straight any more: back onto his trail where it is nearest the dog)
    toTrail();
    return;
  }
  if (route === 'trail') {
    for (let j = trail.n - 1, k = 0; j > ri && k < 4; j -= 6, k++) {
      if (trailBroken(j)) break;
      const y = lineWalk(w, D.x, D.y, D.z, trail.x(j), trail.z(j));
      if (!Number.isNaN(y) && Math.abs(y - trail.y(j)) < 0.6) {
        ri = j;
        return;
      }
    }
  } else if (route === 'path') {
    const pp = search.path;
    for (let j = pp.count - 1, k = 0; j > ri && k < 4; j -= 8, k++) {
      const y = lineWalk(w, D.x, D.y, D.z, pp.x[j], pp.z[j]);
      if (!Number.isNaN(y) && Math.abs(y - pp.y[j]) < 0.6) {
        ri = j;
        return;
      }
    }
  }
}

// ── Coming in by him ───────────────────────────────────────────────────────

/** The floor under his feet (he may be in the air a moment). */
function hisLevel(ctx: RoamCtx): number {
  const p = ctx.body.pos;
  const g = ground(ctx.world, p.x, p.z, p.y + 0.5, STEP_UP);
  return Number.isNaN(g) ? p.y : g;
}

/**
 * The floor at (x, z) on his level — within a step of the floor under him `py` (not the tier under a terrace's edge,
 * not the land under his deck) — from where it can walk to him (a straight way, hops allowed, ending on his level); NaN
 * where there is none.
 */
function onHisLevel(ctx: RoamCtx, x: number, z: number, py: number): number {
  const w = ctx.world;
  const g = ground(w, x, z, py, STEP_UP);
  // (his floor, give or take a kerb; a step higher or lower only on a wide floor: never a stall's table or a bench)
  if (Number.isNaN(g) || Math.abs(g - py) > STEP_UP || (Math.abs(g - py) > KERB && !wideFloor(w, x, z, g))) return NaN;
  // (not in a temple's or a pagoda's hall)
  if (hallAt(x, g, z)) return NaN;
  const p = ctx.body.pos;
  const y = lineWalk(w, x, g, z, p.x, p.z, true);
  return Number.isNaN(y) || Math.abs(y - py) > STEP_UP ? NaN : g;
}

/** A floor at least 2 m across at (x, z), height `g` (three of the four points a metre round it as high, give or take a kerb). */
function wideFloor(w: AddonEnv['world'], x: number, z: number, g: number): boolean {
  let n = 0;
  for (let k = 0; k < 4; k++) {
    const h = ground(w, x + (k === 0 ? 1 : k === 1 ? -1 : 0), z + (k === 2 ? 1 : k === 3 ? -1 : 0), g, KERB);
    if (!Number.isNaN(h) && Math.abs(h - g) <= KERB) n++;
  }
  return n >= 3;
}

/** Checks: put it on his level at (x, z) if it can be there, else the nearest spot round him on his level, else at his feet. */
function besideHim(ctx: RoamCtx, x: number, z: number, yaw: number): void {
  const p = ctx.body.pos;
  const hall = hallAt(p.x, p.y, p.z);
  if (hall && doorSpot(ctx, hall)) {
    putAt(DOOR.x, DOOR.z, DOOR.yaw, DOOR.y);
    return;
  }
  const py = hisLevel(ctx);
  let g = onHisLevel(ctx, x, z, py);
  const r0 = len2(x - p.x, z - p.z);
  const a0 = Math.atan2(x - p.x, z - p.z);
  for (let k = 1; Number.isNaN(g) && k <= 48; k++) {
    // (all round him from the wanted spot, either way, then a little nearer and further)
    const r = Math.max(1.2, r0 + (k > 32 ? 1 : k > 16 ? -0.8 : 0));
    const a = a0 + (k % 2 ? 1 : -1) * Math.ceil((k % 16 || 16) / 2) * (Math.PI / 8);
    x = p.x + Math.sin(a) * r;
    z = p.z + Math.cos(a) * r;
    g = onHisLevel(ctx, x, z, py);
  }
  if (Number.isNaN(g)) {
    x = p.x;
    z = p.z;
    g = py;
  }
  putAt(x, z, Number.isNaN(yaw) ? Math.atan2(p.x - x, p.z - z) : yaw, g);
}

/**
 * It comes in near him (out from behind a bush, or out of view), faded in: on landing, called with no way, home
 * again. Only onto ground on his level that it can walk to him from; with none round him (up a deck, a tree, a
 * narrow ledge) it does not come, and the caller says so: false.
 */
function appearNear(ctx: RoamCtx): boolean {
  const w = ctx.world;
  const p = ctx.body.pos;
  // (he is in a hall: at its door, waiting)
  const hall = hallAt(p.x, p.y, p.z);
  if (hall) return appearAtDoor(ctx, hall);
  const cam = ctx.cam.camera.position;
  const fx = Math.sin(ctx.cam.yaw);
  const fz = Math.cos(ctx.cam.yaw);
  const py = hisLevel(ctx);
  let best = -Infinity;
  let bx = NaN;
  let bz = NaN;
  let by = NaN;
  for (let r = APPEAR[0]; r <= APPEAR[1]; r += 2)
    for (let a = 0; a < 16; a++) {
      const ang = (a * TAU) / 16;
      const x = p.x + Math.sin(ang) * r;
      const z = p.z + Math.cos(ang) * r;
      const g = onHisLevel(ctx, x, z, py);
      if (Number.isNaN(g)) continue;
      // Best: hidden from the camera by leaves or bark; else out of its view; else beside him, not in front of the camera.
      let score = 0;
      const soft = w.softClearance?.(cam.x, cam.y, cam.z, x, g + 0.5, z) ?? 1;
      const hard = w.hardClearance?.(cam.x, cam.y, cam.z, x, g + 0.5, z) ?? 1;
      if (soft < 0.97 || hard < 0.97) score += 3;
      const vx = x - cam.x;
      const vz = z - cam.z;
      const ahead = (vx * fx + vz * fz) / len2(vx, vz);
      if (ahead < 0.2) score += 2;
      score -= Math.abs(r - 6.5) * 0.1;
      if (score > best) {
        best = score;
        bx = x;
        by = g;
        bz = z;
      }
    }
  if (Number.isNaN(bx)) {
    // (no spot round him — a narrow bridge, a ledge: back along his trail, on his level and a walk from him)
    for (let i = trail.n - 1, k = 0; i >= trail.first && Number.isNaN(bx) && k < 40; i--) {
      if (len2(trail.x(i) - p.x, trail.z(i) - p.z) < 3) continue;
      k++;
      const g = onHisLevel(ctx, trail.x(i), trail.z(i), py);
      if (Number.isNaN(g)) continue;
      bx = trail.x(i);
      by = g;
      bz = trail.z(i);
    }
    // (nowhere: it stays where it is)
    if (Number.isNaN(bx)) return false;
  }
  putAt(bx, bz, Math.atan2(p.x - bx, p.z - bz), by);
  // (it comes in softly: from nothing to all of it)
  look.fade = 0;
  D.seen = 1;
  pose.rest = pose.restGoal = 0;
  setChannels(true);
  life = 'come';
  route = 'direct';
  toFoot = false;
  joy = 2.5;
  sound('dogWhine', 0.8);
  return true;
}

/** Could a dog come up to where he stands on foot? Looked for once a spot (a way from his floor down to the land). */
const REACH = { state: 'none' as 'none' | 'busy' | 'done', ok: false, call: false, x: NaN, y: NaN, z: NaN };

/**
 * Could it come up to him here on foot: true on the land or with a way down from his floor to it (a terrace, a deck by
 * its stair), false where there is none (a roof he landed on), null while it looks (`call`: a toast says when done).
 */
function reachHim(ctx: RoamCtx, call: boolean): boolean | null {
  const p = ctx.body.pos;
  const py = hisLevel(ctx);
  if (onLand(ctx.world, p.x, py, p.z)) return true;
  const here = len2(p.x - REACH.x, p.z - REACH.z) < 3 && Math.abs(py - REACH.y) < 1;
  if (REACH.state === 'busy') {
    REACH.call ||= call;
    return null;
  }
  if (REACH.state === 'done' && here) return REACH.ok;
  if (search.state === 'busy') stopSearch();
  search.start(ctx.world, p.x, py, p.z, p.x, py, p.z, 160, true);
  searchFor = 'reach';
  REACH.state = 'busy';
  REACH.call = call;
  REACH.x = p.x;
  REACH.y = py;
  REACH.z = p.z;
  return null;
}

/** It cannot get to him up there: it waits at the foot (where it is), looking up; looked for again once he moves on. */
function waitBelow(ctx: RoamCtx): void {
  life = 'wait';
  settled = 0;
  route = 'none';
  toFoot = false;
  const p = ctx.body.pos;
  FAILED.x = p.x;
  FAILED.z = p.z;
  FAILED.wait = Math.max(FAILED.wait, 6);
}

// ── Halls it waits outside ─────────────────────────────────────────────────

/** The hall he is in (`HALLS`: a pagoda's vihara, Angkor Wat's upper levels) and where it waits for him there. */
const DOOR = { hall: null as Hall | null, x: 0, y: 0, z: 0, yaw: 0, set: false, back: 6 };

/**
 * Where it waits at hall `h` (into `DOOR`): the hall's door, on the ground outside it (or the nearest free spot round
 * it); else where he went in (his trail's last crumb outside it). False: nowhere known (it waits where it is).
 */
function doorSpot(ctx: RoamCtx, h: Hall): boolean {
  const w = ctx.world;
  DOOR.set = false;
  if (h.door) {
    for (let k = 0; k <= 16; k++) {
      const r = k === 0 ? 0 : k <= 8 ? 0.6 : 1.2;
      const a = (k * TAU) / 8;
      const x = h.door.x + Math.sin(a) * r;
      const z = h.door.z + Math.cos(a) * r;
      const g = ground(w, x, z, h.y0, STEP_UP);
      if (Number.isNaN(g) || hallAt(x, g, z)) continue;
      DOOR.x = x;
      DOOR.y = g;
      DOOR.z = z;
      DOOR.yaw = h.door.yaw;
      DOOR.set = true;
      return true;
    }
  }
  const p = ctx.body.pos;
  for (let i = trail.n - 1, k = 0; i >= trail.first && k < 240; i--, k++) {
    const x = trail.x(i);
    const y = trail.y(i);
    const z = trail.z(i);
    if (hallAt(x, y, z)) continue;
    if (len2(x - p.x, z - p.z) > 60) break;
    DOOR.x = x;
    DOOR.y = y;
    DOOR.z = z;
    DOOR.yaw = Math.atan2(p.x - x, p.z - z);
    DOOR.set = true;
    return true;
  }
  return false;
}

/** He went into hall `h`: it goes to the door (straight, or by a way looked for) and waits there. */
function toDoor(ctx: RoamCtx, h: Hall): void {
  DOOR.hall = h;
  life = 'door';
  act = 'none';
  settled = 0;
  going = false;
  toFoot = false;
  route = 'none';
  BACK_OFF.on = false;
  if (search.state === 'busy') stopSearch();
  if (!doorSpot(ctx, h) || !D.placed) return;
  const y = lineWalk(ctx.world, D.x, D.y, D.z, DOOR.x, DOOR.z, true);
  if (!Number.isNaN(y) && Math.abs(y - DOOR.y) < 0.6) route = 'spot';
  else seek('door', DOOR.x, DOOR.y, DOOR.z, SEARCH_MAX);
}

/** In at hall `h`'s door, faded in (he landed in it, or it was far): false when no door is known. */
function appearAtDoor(ctx: RoamCtx, h: Hall): boolean {
  if (!doorSpot(ctx, h)) return false;
  putAt(DOOR.x, DOOR.z, DOOR.yaw, DOOR.y);
  look.fade = 0;
  D.seen = 1;
  pose.rest = pose.restGoal = 1;
  setChannels(true);
  DOOR.hall = h;
  life = 'door';
  settled = 2;
  return true;
}

/** Waiting at the door: there first (or where it is, with no way there), then sitting, an eye on the door; up and aside when someone comes by. */
function doorLife(ctx: RoamCtx, dt: number): void {
  const d = DOOR.set ? len2(DOOR.x - D.x, DOOR.z - D.z) : 0;
  if (d > 0.45 && (route === 'spot' || route === 'path')) {
    restTo(0);
    if (!standing()) return;
    if (route === 'path') wayAlong(DOOR.x, DOOR.z);
    else {
      AIM.x = DOOR.x;
      AIM.z = DOOR.z;
    }
    drive(dt, AIM.x, AIM.z, clamp(2.2 + d * 0.4, 2.2, 6));
    unstall(ctx, dt, 'door');
    return;
  }
  if (route !== 'none' && search.state !== 'busy') route = 'none';
  giveWay(ctx, dt);
  if (backOff(ctx, dt)) return;
  drive(dt, D.x, D.z, 0);
  settled += dt;
  // (moved off it to let someone by: back to the door after a while, when the way there is clear)
  if (d > 0.6 && (DOOR.back -= dt) <= 0 && search.state !== 'busy') {
    DOOR.back = 6;
    const y = lineWalk(ctx.world, D.x, D.y, D.z, DOOR.x, DOOR.z, true);
    if (!Number.isNaN(y) && Math.abs(y - DOOR.y) < 0.6 && PERSON.d > 2.5) route = 'spot';
  }
  const round = faceHim(ctx, dt);
  restTo(round ? 0 : settled > 40 ? 2 : settled > 0.8 ? 1 : 0);
}

// ── Not getting on ─────────────────────────────────────────────────────────

/** Where it was a moment ago, how long it has hardly moved since while it means to go (s), and what was tried. */
const STALL = { x: 0, y: 0, z: 0, t: 0, tries: 0 };
const STALL_AFTER = 2.5;

/**
 * Called while it means to go somewhere: when it has not got on for a few seconds (a step it cannot take, wedged by a
 * post), it takes the way's next step as the search did; then looks for the way again; then (coming to him) comes in
 * by him if it can be there, or at a door, or its bed; else it waits where it is.
 */
function unstall(ctx: RoamCtx | null, dt: number, goal: 'come' | 'door' | 'bed'): void {
  if (AIR.on || !ctx) {
    STALL.t = 0;
    return;
  }
  if (len3(D.x - STALL.x, D.y - STALL.y, D.z - STALL.z) > 0.35) {
    STALL.x = D.x;
    STALL.y = D.y;
    STALL.z = D.z;
    STALL.t = 0;
    STALL.tries = 0;
    return;
  }
  STALL.t += dt;
  if (STALL.t < STALL_AFTER) return;
  STALL.t = 0;
  STALL.tries++;
  if (route === 'path' && STALL.tries <= 2 && pathStep()) return;
  if (STALL.tries <= 2 && search.state !== 'busy') {
    stuck = 0;
    halted = 0;
    if (goal === 'bed') seek('bed', bed.x, Number.isNaN(bed.y) ? D.y : bed.y, bed.z, SEARCH_MAX);
    else if (goal === 'door') seek('door', DOOR.x, DOOR.y, DOOR.z, SEARCH_MAX);
    else seek('come', ctx.body.pos.x, hisLevel(ctx), ctx.body.pos.z, SEARCH_MAX);
    route = 'none';
    return;
  }
  STALL.tries = 0;
  if (goal === 'bed') putAt(bed.x, bed.z, bed.yaw, bed.y);
  else if (goal === 'door') route = 'none';
  else if (!appearNear(ctx)) waitBelow(ctx);
}

/** The way's next point, a step from where it stands (it is at the point before): it takes that step as the search did (a hop, a jump down, past a post). */
function pathStep(): boolean {
  const pp = search.path;
  if (ri >= pp.count) return false;
  const x = pp.x[ri];
  const y = pp.y[ri];
  const z = pp.z[ri];
  const dx = x - D.x;
  const dz = z - D.z;
  const d = len2(dx, dz);
  if (d > 0.95 || d < 0.05 || Math.abs(y - D.y) > 2.7) return false;
  leap(x, z, y, y > D.y, dx / d, dz / d);
  ri++;
  return true;
}

/** Wedged in something (a wall, a deck, deep water: no floor with room for it at its feet) a moment: out onto the nearest free spot. */
let wedgedFor = 0;
function wedged(ctx: RoamCtx): void {
  const w = ctx.world;
  if (AIR.on || !D.placed || PET.on || !(life === 'follow' || life === 'come' || life === 'wait' || life === 'door')) {
    wedgedFor = 0;
    return;
  }
  if (!Number.isNaN(ground(w, D.x, D.z, D.y, STEP_UP))) {
    wedgedFor = 0;
    return;
  }
  wedgedFor += 0.25;
  if (wedgedFor < 0.75) return;
  wedgedFor = 0;
  for (let r = 0.5; r <= 3; r += 0.5)
    for (let a = 0; a < 12; a++) {
      const x = D.x + Math.sin((a * TAU) / 12) * r;
      const z = D.z + Math.cos((a * TAU) / 12) * r;
      const g = ground(w, x, z, D.y + 0.5, STEP_UP);
      if (Number.isNaN(g) || Math.abs(g - D.y) > 1.2 || hallAt(x, g, z)) continue;
      const keep = life;
      putAt(x, z, D.yaw, g);
      life = keep;
      return;
    }
  if (life === 'door') {
    if (DOOR.hall) appearAtDoor(ctx, DOOR.hall);
  } else if (!appearNear(ctx)) waitBelow(ctx);
}

// ── His dog's life ─────────────────────────────────────────────────────────

function followLife(ctx: RoamCtx, dt: number): void {
  const p = ctx.body.pos;
  const w = ctx.world;
  const moving = HIM.speed > 0.6;
  stillFor = moving ? 0 : stillFor + dt;
  // (a way it cannot go on: look for one)
  if (route === 'trail' && trailBroken(ri) && search.state !== 'busy') {
    seek('come', p.x, p.y, p.z, SEARCH_MAX);
    route = 'none';
  }
  if (route === 'none' && search.state !== 'busy') {
    route = 'direct';
    if (trail.n > 0 && !trailBroken(trail.n - 1)) toTrail();
  }
  if ((Math.floor(clock * 5) !== Math.floor((clock - dt) * 5) || route === 'none') && !AIR.on) shortcut(ctx);
  wayLeft = wayToHim(ctx);
  // (beside him already, whatever the way says: he may stand up on something it cannot climb)
  if (len2(p.x - D.x, p.z - D.z) < FOLLOW_STOP && Math.abs(p.y - D.y) < LEVEL) wayLeft = Math.min(wayLeft, FOLLOW_STOP - 0.1);
  // A bark at an animal, a sniff about: only while he lingers.
  if (act === 'bark') return barkLife(ctx, dt);
  if (act === 'sniff') return sniffLife(ctx, dt);
  if (wayLeft > FOLLOW_GO || (going && wayLeft > FOLLOW_STOP)) {
    going = true;
    settled = 0;
    restTo(0);
    if (!standing()) return;
    // (as fast as he goes, a little faster while it is behind, slower close up; no faster than it can)
    const speed = clamp(HIM.speed + clamp((wayLeft - FOLLOW_KEEP) * 0.9, -2, 7), 1.4, TOP);
    drive(dt, AIM.x, AIM.z, speed);
    unstall(ctx, dt, 'come');
    // (not getting on — a wall, a step it cannot take, a crumb it cannot reach: it looks for a way)
    halted = D.speed < 0.3 && !AIR.on ? halted + dt : 0;
    if ((stuck > 0.8 || halted > 1.2) && search.state !== 'busy') {
      stuck = 0;
      halted = 0;
      seek('come', p.x, p.y, p.z, SEARCH_MAX);
      route = 'none';
    }
    return;
  }
  halted = 0;
  going = false;
  makeWay(ctx);
  giveWay(ctx, dt);
  offHisFeet(ctx);
  if (backOff(ctx, dt)) return;
  // Settled by him: stop, turn to him, sit, lie down after a while, sleep when he does.
  drive(dt, D.x, D.z, 0);
  settled += dt;
  const round = faceHim(ctx, dt);
  const asleep = ctx.body.explorer.asleep;
  if (HOLD.stand) {
    restTo(0);
    return;
  }
  if (moving) restTo(0);
  else if (asleep && settled > 4) restTo(3);
  else if (stillFor > 45 && settled > 40) restTo(3);
  else if (stillFor > 14 && settled > 12) restTo(2);
  else if (settled > 1.2 && stillFor > 0.8) restTo(1);
  if (round) restTo(0);
  // Now and then: sniff about, or bark at a monkey or a hen nearby (by day).
  if (!moving && pose.restGoal <= 1 && settled > 3) {
    nextSniff -= dt;
    if (nextSniff <= 0) {
      nextSniff = 9 + rnd() * 12;
      if (pickSniffSpot(w, p.x, p.z)) {
        act = 'sniff';
        actT = 0;
      }
    }
  }
  barkScan(ctx, dt);
}

/**
 * Its head turned to him, and its body round when he is too far round for its neck (sitting or standing; lying it only
 * turns its head): true while it wants to turn round (the caller has it stand up first).
 */
function faceHim(ctx: RoamCtx, dt: number): boolean {
  const p = ctx.body.pos;
  const head = Math.atan2(p.x - D.x, p.z - D.z);
  const off = angleDiff(head, D.yaw);
  const round = Math.abs(off) > (pose.restGoal >= 2 ? 9 : 1.5);
  if (round && standing()) {
    // (stepping round on the spot)
    D.yaw += off * (1 - Math.exp(-3 * dt));
    TURN.rate = off;
    pose.turn = 0;
  } else pose.turn = clamp(off / 1.04, -1, 1);
  // (looking up at him close by — he is tall —, or up there on his deck)
  const d = len2(p.x - D.x, p.z - D.z);
  pose.head = p.y - D.y > 2 && d < 25 ? -1 : d < 4 ? -0.6 : d < 10 ? -0.3 : 0;
  return round && Math.abs(off) > 0.25;
}

function pickSniffSpot(w: AddonEnv['world'], hx: number, hz: number): boolean {
  for (let k = 0; k < 6; k++) {
    const a = rnd() * TAU;
    const r = 2 + rnd() * 2.5;
    const x = D.x + Math.sin(a) * r;
    const z = D.z + Math.cos(a) * r;
    // (on its floor, a walk away, not at his feet nor off out of his reach)
    const dh = len2(x - hx, z - hz);
    if (dh < 1.8 || dh > FOLLOW_GO + 1) continue;
    const y = lineWalk(w, D.x, D.y, D.z, x, z);
    if (Number.isNaN(y) || Math.abs(y - D.y) > KERB) continue;
    SPOT.x = x;
    SPOT.y = y;
    SPOT.z = z;
    return true;
  }
  return false;
}

function sniffLife(_ctx: RoamCtx, dt: number): void {
  actT += dt;
  restTo(0);
  pose.turn = 0;
  if (!standing()) return;
  const d = len2(SPOT.x - D.x, SPOT.z - D.z);
  // (he moves on: it leaves off and follows)
  if (HIM.speed > 1 || wayLeft > FOLLOW_GO + 2 || actT > 9) {
    act = 'none';
    want.sniff = 0;
    return;
  }
  if (d > 0.3) {
    drive(dt, SPOT.x, SPOT.z, 1.4);
    pose.head = 0.6;
    want.sniff = 0.6;
    if (stuck > 0.5) act = 'none';
    return;
  }
  drive(dt, D.x, D.z, 0);
  pose.head = 1;
  want.sniff = 1;
  if (Math.floor(actT * 0.7) !== Math.floor((actT - dt) * 0.7)) sound('dogSniff', 0.8);
  if (actT > 6 + (D.x % 1)) {
    act = 'none';
    want.sniff = 0;
    pose.head = 0;
  }
}

/** Every few seconds by day: a monkey or a junglefowl near it? A bark or three at it, now and then. */
function barkScan(ctx: RoamCtx, dt: number): void {
  barkCool -= dt;
  nextScan -= dt;
  if (nextScan > 0 || barkCool > 0 || ctx.night > 0.55 || !fauna?.subjects) return;
  nextScan = 2.5;
  _subjects.length = 0;
  fauna.subjects(_subjects);
  let bd = BARK_NEAR;
  let found = false;
  for (const s of _subjects) {
    if (s.kind !== 'macaque' && s.kind !== 'junglefowl') continue;
    const d = len2(s.x - D.x, s.z - D.z);
    if (d < bd && Math.abs(s.y - D.y) < 4) {
      bd = d;
      BARK_AT.x = s.x;
      BARK_AT.z = s.z;
      found = true;
    }
  }
  _subjects.length = 0;
  if (!found) return;
  barkCool = BARK_EVERY[0] + rnd() * (BARK_EVERY[1] - BARK_EVERY[0]);
  if (rnd() < 0.35) return;
  startBark();
}

function startBark(): void {
  act = 'bark';
  actT = 0;
  barksLeft = 2 + Math.floor(rnd() * 2);
  nextBarkAt = 0.45;
}

function barkLife(_ctx: RoamCtx, dt: number): void {
  actT += dt;
  restTo(0);
  drive(dt, D.x, D.z, 0);
  const head = Math.atan2(BARK_AT.x - D.x, BARK_AT.z - D.z);
  const off = angleDiff(head, D.yaw);
  D.yaw += off * (1 - Math.exp(-4 * dt));
  pose.turn = 0;
  pose.head = -0.5;
  want.ears = 1;
  if (actT >= nextBarkAt && barksLeft > 0 && standing()) {
    barksLeft--;
    nextBarkAt = actT + 0.55 + rnd() * 0.25;
    BARK_PULSE.t = 0.22;
    sound('dogBark', 0.75);
  }
  if ((barksLeft <= 0 && actT > nextBarkAt) || HIM.speed > 1.5) act = 'none';
}
const BARK_PULSE = { t: 0 };

/** Waiting where he left it (he is in the boat, in the air, on a ride): it sits and watches him. */
function waitLife(ctx: RoamCtx, dt: number): void {
  giveWay(ctx, dt);
  if (backOff(ctx, dt)) return;
  drive(dt, D.x, D.z, 0);
  settled += dt;
  const round = faceHim(ctx, dt);
  restTo(round ? 0 : settled > 25 ? 2 : settled > 1 ? 1 : 0);
  const p = ctx.body.pos;
  if (len2(p.x - D.x, p.z - D.z) > 60) pose.head = 0;
}

/** Coming to him along the way it found (or straight). */
function comeLife(ctx: RoamCtx, dt: number): void {
  const p = ctx.body.pos;
  if (Math.floor(clock * 4) !== Math.floor((clock - dt) * 4) && !AIR.on) {
    const d = len2(p.x - D.x, p.z - D.z);
    const y = d < 40 ? lineWalk(ctx.world, D.x, D.y, D.z, p.x, p.z) : NaN;
    if (!Number.isNaN(y) && Math.abs(y - p.y) < 0.9) {
      route = 'direct';
      toFoot = false;
    } else if (route === 'direct') {
      // (no straight way after all: look for one)
      if (search.state !== 'busy') seek('come', p.x, p.y, p.z, SEARCH_MAX);
      route = 'none';
    } else if (route === 'path') shortcut(ctx);
  }
  wayLeft = wayToHim(ctx);
  restTo(0);
  if (!standing()) return;
  if (route === 'none') {
    drive(dt, D.x, D.z, 0);
    faceHim(ctx, dt);
    return;
  }
  // (at the foot of where he is, up there: it waits)
  if (toFoot && route === 'path' && ri >= search.path.count) return waitBelow(ctx);
  if (route === 'path' && ri >= search.path.count && len2(p.x - D.x, p.z - D.z) > 4 && search.state !== 'busy') {
    // (at the end of its way, but he went on: look again)
    seek('come', p.x, p.y, p.z, SEARCH_MAX);
    route = 'none';
    return;
  }
  // (from far off a steady trot; the last stretch at a run)
  const far = wayLeft > 60;
  const speed = clamp(far ? 5.5 : 4 + wayLeft * 0.35, 2, TOP);
  drive(dt, AIM.x, AIM.z, speed);
  unstall(ctx, dt, 'come');
  if (life !== 'come') return;
  if (stuck > 1 && search.state !== 'busy') {
    stuck = 0;
    seek('come', p.x, p.y, p.z, SEARCH_MAX);
    route = 'none';
  }
  // (there: its way to him is short, or it is close to him on about his level — he may stand on a crate or a step)
  const close = len2(p.x - D.x, p.z - D.z) < FOLLOW_STOP + 0.4 && Math.abs(p.y - D.y) < LEVEL;
  if ((wayLeft < FOLLOW_STOP + 0.4 && !toFoot) || close) {
    life = 'follow';
    route = 'none';
    going = false;
    settled = 0;
    joy = Math.max(joy, 2);
    sound('dogWhine', 0.7);
  }
}

/** Going to its bed and sleeping there (he is home: `dogHome`). */
function bedLife(dt: number): void {
  const d = len2(bed.x - D.x, bed.z - D.z);
  if (d > 0.4 && route === 'path') {
    restTo(0);
    if (!standing()) return;
    if (ri >= search.path.count) {
      drive(dt, bed.x, bed.z, 2.5);
      if (stuck > 1) putAt(bed.x, bed.z, bed.yaw, bed.y);
    } else {
      wayAlong(bed.x, bed.z);
      drive(dt, AIM.x, AIM.z, 3.5);
      unstall(lastCtx, dt, 'bed');
    }
    return;
  }
  drive(dt, D.x, D.z, 0);
  D.yaw += angleDiff(bed.yaw, D.yaw) * (1 - Math.exp(-2 * dt));
  pose.turn = 0;
  pose.head = 1;
  settled += dt;
  restTo(settled > 2 ? 3 : 2);
}

// ── The village dog's life (not his yet) ───────────────────────────────────

function villageLife(ctx: RoamCtx, dt: number): void {
  const p = ctx.body.pos;
  const d = len2(p.x - D.x, p.z - D.z);
  const onFoot = roamMode === 'walk' && Math.abs(p.y - D.y) < 3;
  if (life === 'nap') {
    drive(dt, D.x, D.z, 0);
    pose.head = 1;
    pose.turn = 0;
    restTo(3);
    // (him coming, or someone walking right up to it: it wakes)
    if (Math.floor(clock * 2) !== Math.floor((clock - dt) * 2)) nearestPerson();
    if ((onFoot && d < WAKE) || PERSON.d < 1.4) {
      life = 'awake';
      settled = 0;
      awayFor = 0;
      sound('dogYawn', 0.8);
    }
    return;
  }
  // Awake: up off its side, then sitting up watching him, standing and wagging when he is close; never far from its spot.
  settled += dt;
  giveWay(ctx, dt);
  if (backOff(ctx, dt)) return;
  const round = faceHim(ctx, dt);
  const home = len2(HOME_AT.x - D.x, HOME_AT.z - D.z);
  if (d < 3.4 && onFoot && settled > 1.4) {
    restTo(0);
    if (standing() && d > 1.6 && home < 2.2) drive(dt, p.x, p.z, 1.1);
    else drive(dt, D.x, D.z, 0);
  } else {
    restTo(settled < 1.2 ? 2 : round ? 0 : 1);
    if (home > 0.3 && standing()) drive(dt, HOME_AT.x, HOME_AT.z, 1.2);
    else drive(dt, D.x, D.z, 0);
  }
  awayFor = onFoot && d < SLEEP_AGAIN ? 0 : awayFor + dt;
  if (awayFor > SLEEP_AFTER) {
    life = 'nap';
    route = 'none';
  }
}

// ── The moods ──────────────────────────────────────────────────────────────

/** What it shows: the wag, the ears, panting, its eyes. */
function moods(ctx: RoamCtx | null, dt: number): void {
  joy = Math.max(0, joy - dt);
  BARK_PULSE.t = Math.max(0, BARK_PULSE.t - dt);
  effort = clamp(effort + (D.speed > 5 ? (D.speed / TOP) * 0.12 : -0.05) * dt, 0, 1);
  const sleeping = pose.rest >= 3 && pose.restGoal >= 3;
  const p = ctx?.body.pos;
  const d = p ? len2(p.x - D.x, p.z - D.z) : 99;
  let wag = 0;
  let ears = 0;
  if (PET.on) {
    wag = 1;
    ears = -1;
  } else if (sleeping) {
    wag = 0;
    ears = -0.2;
  } else if (joy > 0) {
    wag = 0.95;
    ears = -0.7;
  } else if (life === 'awake') {
    wag = d < 3.5 ? 0.8 : 0.4;
    ears = d < 3.5 ? -0.3 : 0.7;
  } else if (life === 'wait') {
    wag = 0.15;
    ears = 0.6;
  } else if (act === 'bark') {
    wag = 0.45;
    ears = 1;
  } else if (going || life === 'come') {
    wag = 0.3;
    ears = 0;
  } else {
    wag = pose.rest >= 2 ? 0.08 : 0.25;
    ears = pose.rest >= 2 ? -0.1 : 0.25;
  }
  want.wag = wag;
  wagHz = 1.6 + 5.5 * wag;
  if (!PET.on) want.ears = ears;
  want.pant = PET.on ? 0.15 : clamp(effort * 1.4 + (D.speed > 7 ? 0.3 : 0), 0, 1);
  if (!PET.on) {
    want.shut = sleeping ? 1 : 0;
    want.lean = 0;
    want.tilt = TILT.t > 0 ? TILT.v : 0;
    want.scratch = 0;
    want.pat = 0;
  }
  if (act !== 'sniff') want.sniff = 0;
  want.bark = BARK_PULSE.t > 0 ? 1 : 0;
  want.fade = D.seen;
  TILT.t = Math.max(0, TILT.t - dt);
}
/** A curious tilt of the head (he greeted, he called it). */
const TILT = { t: 0, v: 0 };

/** One mood toward what it wants. */
function ease(k: keyof DogLook, rate: number, dt: number): void {
  look[k] = approach(look[k], want[k], rate, dt);
}

/** Ease the moods to what it wants (every frame, or every step in a shot's simulation). */
function animate(dt: number): void {
  if (dt <= 0) return;
  ease('wag', 4, dt);
  ease('pant', 1.6, dt);
  look.shut = want.shut;
  ease('ears', 6, dt);
  ease('lean', 4, dt);
  ease('bark', 22, dt);
  ease('tilt', 4, dt);
  ease('scratch', 6, dt);
  ease('sniff', 5, dt);
  ease('leap', 12, dt);
  ease('pat', 14, dt);
  look.fade = clamp(look.fade + Math.sign(want.fade - look.fade) * (dt / FADE), Math.min(look.fade, want.fade), Math.max(look.fade, want.fade));
  if (HOLD.fade >= 0) look.fade = HOLD.fade;
  look.wagPhase += TAU * wagHz * dt;
  if (env && !env.shot) SFX.level('dogPant', near(look.pant));
}

/** The channels from its pose (written only when they change: the kit's flock). */
function setChannels(snap = false): void {
  if (!mesh) return;
  const fl = mesh.flock;
  // (one rest step at a time, through the ones between)
  if (pose.rest !== pose.restGoal && clock >= pose.restAt) {
    pose.rest += Math.sign(pose.restGoal - pose.rest);
    pose.restAt = clock + 0.6;
  }
  if (snap) {
    pose.rest = pose.restGoal;
    fl.set(0, CH.rest, pose.rest, clock, true);
  } else fl.set(0, CH.rest, pose.rest, clock);
  // The gait from its speed: walking, trotting, galloping, and its steps' pace.
  const v = D.speed / DOG_SCALE;
  const g = AIR.on ? 0 : v < 0.08 ? 0 : v < 1.6 ? clamp(v / 0.75, 0, 1) : v < 5 ? 1 + clamp((v - 1.6) / 1.0, 0, 1) : 2 + clamp((v - 5) / 1.2, 0, 1);
  const stride = g <= 1 ? STRIDE[0] : g <= 2 ? STRIDE[0] + (STRIDE[1] - STRIDE[0]) * (g - 1) : STRIDE[1] + (STRIDE[2] - STRIDE[1]) * (g - 2);
  // (turning on the spot: it steps round)
  const turning = g === 0 && Math.abs(TURN.rate) > 0.6 && pose.rest === 0;
  pose.gait = turning ? 0.6 : g;
  pose.hz = turning ? 1.6 : Math.max(0.8, v / stride);
  if (HOLD.gait >= 0) {
    // (checks: that gait on the spot, at its usual pace: 1.3, 4 and 9 m/s)
    pose.gait = HOLD.gait;
    const g = Math.round(HOLD.gait);
    pose.hz = g === 1 ? 1.3 / (STRIDE[0] * DOG_SCALE) : g === 2 ? 4 / (STRIDE[1] * DOG_SCALE) : g === 3 ? 9 / (STRIDE[2] * DOG_SCALE) : 1;
  }
  fl.gait(0, pose.gait, pose.hz, clock);
  fl.set(0, CH.head, PET.on ? (PET.kind === 'pet' ? -0.55 : -0.3) : pose.head, clock, snap);
  fl.set(0, CH.turn, pose.turn, clock, snap);
}
const TURN = { rate: 0, yaw: 0 };

let seed = 1;
/** Its own random numbers (fixed in shots). */
function rnd(): number {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

// ── Petting ────────────────────────────────────────────────────────────────

/** He is on foot, near it and facing it (E: a pet; F: a scratch). */
function canPet(ctx: RoamCtx): boolean {
  if (hidden || !mesh || !D.placed || PET.on || AIR.on || look.fade < 0.9) return false;
  if (life === 'away' || life === 'none' || life === 'bed') return false;
  if (roamMode !== 'walk' || othersHolding() || env?.busy() || !ctx.body.grounded) return false;
  const p = ctx.body.pos;
  const dx = D.x - p.x;
  const dz = D.z - p.z;
  const d = len2(dx, dz);
  if (d > PET_REACH || d < 0.25 || Math.abs(D.y - p.y) > 1) return false;
  return Math.abs(angleDiff(Math.atan2(dx, dz), ctx.body.yaw)) < PET_CONE;
}

function startPet(ctx: RoamCtx, kind: 'pet' | 'scratch'): void {
  const b = ctx.body;
  const p = b.pos;
  PET.on = true;
  PET.kind = kind;
  PET.t = 0;
  PET.leaving = -1;
  PET.crouch = 0;
  PET.reach = 0;
  PET.contact = false;
  PET.lastThump = 0;
  PET.patFrom = -1;
  PET.done = false;
  PET.camFree = false;
  // He turns to it; it sits in front of him a little to his right (his right hand pats it), its crown there (`PET`),
  // facing him: on ground that carries it, else where it is.
  const F = Math.atan2(D.x - p.x, D.z - p.z);
  PET.face = F;
  const k = b.scale / 1.4;
  const cx = p.x + Math.sin(F) * PET_AT.ahead * k - Math.cos(F) * PET_AT.right * k;
  const cz = p.z + Math.cos(F) * PET_AT.ahead * k + Math.sin(F) * PET_AT.right * k;
  const crown = sitCrownAhead();
  const ux = cx - p.x;
  const uz = cz - p.z;
  const ul = len2(ux, uz) || 1;
  const sx = cx + (ux / ul) * crown;
  const sz = cz + (uz / ul) * crown;
  const y = lineWalk(ctx.world, D.x, D.y, D.z, sx, sz);
  const fits = !Number.isNaN(y) && Math.abs(y - p.y) < 0.6;
  PET.sx = fits ? sx : D.x;
  PET.sz = fits ? sz : D.z;
  act = 'none';
  want.sniff = 0;
  route = 'none';
  CAM.follow = ctx.cam.follow;
  CAM.distance = ctx.cam.distance;
  CAM.pitch = ctx.cam.pitch;
  CAM.min = ctx.cam.minDistance;
  b.vel.set(0, 0, 0);
  b.explorer.animator.posture = petPosture;
  b.explorer.animator.postureFeet = true;
  b.explorer.showFace('happy');
  petState.t = 0;
  petState.crouch = 0;
  petState.reach = 0;
  petState.lift = 0;
  petState.rub = 0;
}

/** How far in front of its feet its crown is, sitting up to be petted and looking up (m, drawn). */
function sitCrownAhead(): number {
  dogHeadLocal({ rest: 1, head: -0.55, turn: 0, lean: 0, pat: 0, bark: 0, tilt: 0 }, DOG_HEAD.crown, _v);
  return _v.z * DOG_SCALE;
}

/** Up he gets (at once: Esc, back to the map, a mode change), the camera as it was. */
function endPet(ctx: RoamCtx | null, finished: boolean): void {
  if (!PET.on) return;
  PET.on = false;
  const ex = env?.explorer;
  if (ex) {
    ex.animator.posture = null;
    ex.animator.postureFeet = true;
    ex.showFace(null);
  }
  if (ctx) {
    ctx.cam.follow = CAM.follow;
    ctx.cam.minDistance = CAM.min;
    // (the camera eases back out to where it was over the next moment: `think`)
    CAM_BACK.left = 1.8;
    CAM_BACK.to = Math.min(CAM.distance, 14);
  }
  want.lean = want.pat = want.scratch = want.tilt = 0;
  want.shut = 0;
  settled = 0;
  // (it steps back off his feet, to sit a little way off)
  if (ctx) {
    const p = ctx.body.pos;
    const dx = D.x - p.x;
    const dz = D.z - p.z;
    const d = len2(dx, dz) || 1;
    const x = p.x + (dx / d) * 1.6;
    const z = p.z + (dz / d) * 1.6;
    const y = lineWalk(ctx.world, D.x, D.y, D.z, x, z);
    BACK_OFF.on = !Number.isNaN(y);
    BACK_OFF.x = x;
    BACK_OFF.z = z;
    BACK_OFF.t = 0;
  }
  if (!finished) return;
  joy = 2;
  if (adopted) return;
  pets++;
  if (env && !env.shot) progress.set('dog.pets', pets);
  if (pets >= PETS_TO_ADOPT) adopt(true);
  else toast(t('dogLikes'));
}

/** The dog comes along: kept, and the card asks its name (`ask`). */
function adopt(ask: boolean): void {
  adopted = true;
  life = 'follow';
  route = 'none';
  trail.clear();
  gapped = true;
  if (env && !env.shot) progress.set('dog.adopted', true);
  toast(t('dogAdopt'));
  BARK_PULSE.t = 0.22;
  sound('dogBark', 0.9);
  joy = 3;
  if (ask) ASK.in = 1.6;
}
const ASK = { in: -1 };
/** The name card, to open once the map has started (the loading screen gone: `started`); the name to pick in it (checks). */
const CARD = { pending: false, pick: -1 };
const started = (): boolean => {
  const l = document.getElementById('loading');
  return !l || l.classList.contains('done');
};
/** After a pet: a step or two back off his feet (to here). */
const BACK_OFF = { on: false, x: 0, z: 0, t: 0 };

/** Settled closer than a metre to him (he stepped up to it, a sniff ended there): a step or two back. */
function offHisFeet(ctx: RoamCtx): void {
  if (BACK_OFF.on || PET.on) return;
  const p = ctx.body.pos;
  const dx = D.x - p.x;
  const dz = D.z - p.z;
  const d = len2(dx, dz);
  if (d > 1 || Math.abs(p.y - D.y) > LEVEL || HIM.speed > 0.6) return;
  const ux = d > 0.05 ? dx / d : -Math.sin(ctx.body.yaw);
  const uz = d > 0.05 ? dz / d : -Math.cos(ctx.body.yaw);
  const x = p.x + ux * 1.8;
  const z = p.z + uz * 1.8;
  const y = lineWalk(ctx.world, D.x, D.y, D.z, x, z);
  if (Number.isNaN(y) || Math.abs(y - D.y) > KERB) return;
  BACK_OFF.on = true;
  BACK_OFF.x = x;
  BACK_OFF.z = z;
  BACK_OFF.t = 0;
}

/** He walks at it: it trots a step aside off his way (the side it is on). */
function makeWay(ctx: RoamCtx): void {
  if (BACK_OFF.on || HIM.speed < 1.5) return;
  const p = ctx.body.pos;
  const dx = D.x - p.x;
  const dz = D.z - p.z;
  if (dx * dx + dz * dz > 1.5 * 1.5) return;
  const hx = Math.sin(ctx.body.yaw);
  const hz = Math.cos(ctx.body.yaw);
  if (dx * hx + dz * hz <= 0) return;
  const side = dx * hz - dz * hx >= 0 ? 1 : -1;
  const x = D.x + hz * side * 1.6;
  const z = D.z - hx * side * 1.6;
  if (Number.isNaN(lineWalk(ctx.world, D.x, D.y, D.z, x, z))) return;
  BACK_OFF.on = true;
  BACK_OFF.x = x;
  BACK_OFF.z = z;
  BACK_OFF.t = 0;
}

/** Stepping back after a pet, or aside off his way (true while it does). */
function backOff(_ctx: RoamCtx, dt: number): boolean {
  if (!BACK_OFF.on) return false;
  BACK_OFF.t += dt;
  restTo(0);
  if (!standing()) return true;
  const d = len2(BACK_OFF.x - D.x, BACK_OFF.z - D.z);
  if (d < 0.15 || BACK_OFF.t > 3) {
    BACK_OFF.on = false;
    return false;
  }
  drive(dt, BACK_OFF.x, BACK_OFF.z, HIM.speed > 1.5 || BACK_OFF.t < 0 ? 3 : 1.6);
  return true;
}

/** The people part's walkers this frame (people/_routes.ts `Traffic.list`, as the land animals read it). */
type Passer = { x: number; y: number; z: number; who: string };
/** The nearest of them to it on its floor (m), and where. */
const PERSON = { x: 0, z: 0, d: Infinity };

function nearestPerson(): void {
  PERSON.d = Infinity;
  const list = (window as unknown as { __people?: { traffic?: { list: readonly Passer[] } } }).__people?.traffic?.list;
  if (!list) return;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (o.who === 'explorer' || o.who === 'animal' || o.who === 'beacon' || Math.abs(o.y - D.y) > 1.5) continue;
    const dx = o.x - D.x;
    const dz = o.z - D.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < PERSON.d) {
      PERSON.d = d;
      PERSON.x = o.x;
      PERSON.z = o.z;
    }
  }
}

/**
 * Someone comes right up to where it sits or lies (a monk's line after the alms, the market's lanes): it gets up and
 * moves off a little way, away from them, on its floor (by him, while it follows him). True as it starts to.
 */
function giveWay(ctx: RoamCtx, dt: number): boolean {
  if (BACK_OFF.on || AIR.on || clock < GIVE_WAY.next || Math.floor(clock * 4) === Math.floor((clock - dt) * 4)) return false;
  nearestPerson();
  if (PERSON.d > (pose.restGoal >= 2 ? 2.4 : 1.5)) return false;
  const w = ctx.world;
  const p = ctx.body.pos;
  let best = -Infinity;
  for (let k = 0; k < 12; k++) {
    const a = (k * TAU) / 12;
    const x = D.x + Math.sin(a) * 1.9;
    const z = D.z + Math.cos(a) * 1.9;
    const y = lineWalk(w, D.x, D.y, D.z, x, z);
    if (Number.isNaN(y) || Math.abs(y - D.y) > KERB) continue;
    let score = len2(x - PERSON.x, z - PERSON.z);
    // (following him: not off out of his reach, nor onto his feet)
    if (adopted && life === 'follow') {
      const dh = len2(x - p.x, z - p.z);
      if (dh > FOLLOW_GO - 0.3 || dh < 1.2) score -= 3;
    }
    if (score > best) {
      best = score;
      BACK_OFF.x = x;
      BACK_OFF.z = z;
    }
  }
  if (best === -Infinity) return false;
  BACK_OFF.on = true;
  BACK_OFF.t = 0;
  GIVE_WAY.next = clock + 3;
  settled = 0;
  return true;
}
const GIVE_WAY = { next: 0 };

/** His step while petting (it holds him: `hold`). */
function petStep(ctx: RoamCtx, dt: number): AddonHold {
  const b = ctx.body;
  const input = ctx.input;
  const cam = ctx.cam;
  PET.t += dt;
  const T = PET.t;
  cam.turn(input.lookYaw, input.lookPitch, input.zoom);
  // E, Space or the stick: he stands up (after the first moment).
  if (PET.leaving < 0 && T > 0.5 && (input.use || input.jump || len2(input.move.x, input.move.y) > 0.4)) PET.leaving = T;
  // He turns to the dog.
  const p = b.pos;
  b.yaw += angleDiff(PET.face, b.yaw) * (1 - Math.exp(-7 * dt));
  b.vel.set(0, 0, 0);
  b.explorer.setMotion(0, true, 0);
  // Down, the hand to its head; up again at the end.
  const up = PET.leaving >= 0 ? T - PET.leaving : -1;
  const ready = len2(PET.sx - D.x, PET.sz - D.z) < 0.1 || T > 1.3;
  PET.crouch = up >= 0 ? Math.max(0, 1 - up / 0.55) : ready ? Math.min(1, PET.crouch + dt / 0.5) : PET.crouch;
  PET.reach = up >= 0 ? Math.max(0, PET.reach - dt / 0.3) : PET.crouch > 0.6 ? Math.min(1, PET.reach + dt / 0.35) : 0;
  // Where its head is, in his space (body units).
  const point = PET.kind === 'pet' ? DOG_HEAD.crown : DOG_HEAD.earL;
  dogPoint(mesh!, clock, look, point, _v);
  toHim(b, _v, petState.hand);
  dogPoint(mesh!, clock, look, DOG_HEAD.nose, _w);
  toHim(b, _w.lerp(_v, 0.5), petState.look);
  petState.crouch = PET.crouch;
  petState.reach = PET.reach;
  petState.t += dt;
  // Pats (three, the hand coming down on its head), or small circles behind its ear.
  if (PET.reach >= 0.95 && up < 0 && PET.patFrom < 0) PET.patFrom = T;
  const into = PET.patFrom >= 0 && up < 0 ? T - PET.patFrom : -1;
  // (three pats, a moment's rest on its head; the scratch a little longer)
  if (into >= (PET.kind === 'pet' ? 3 * 0.55 + 0.45 : 2.6) && PET.leaving < 0) {
    PET.leaving = T;
    PET.done = true;
  }
  if (into > 0.6) PET.done = true;
  if (PET.kind === 'pet') {
    const cycle = 0.55;
    const n = into >= 0 ? into / cycle : 0;
    petState.lift = into >= 0 && n < 3 ? 0.5 - 0.5 * Math.cos(n * TAU) : 0;
    const touch = into >= 0 && petState.lift < 0.15;
    if (touch && !PET.contact) sound('dogPat', 0.9);
    PET.contact = touch;
    want.pat = touch ? 1 : 0;
    want.lean = into > 0.4 ? 1 : 0;
    want.shut = into > 0.3 && petState.lift < 0.5 ? 1 : 0;
    petState.rub = 0;
  } else {
    petState.lift = 0;
    petState.rub = into >= 0 ? Math.min(1, into / 0.3) : 0;
    petState.rubPhase += TAU * 2.2 * dt;
    want.tilt = into > 0.2 ? 0.85 : 0;
    want.shut = into > 0.3 ? 1 : 0;
    want.lean = into > 0.2 ? 0.5 : 0;
    want.scratch = into > 0.6 && into < 2.6 ? 1 : 0;
    if (want.scratch > 0 && T - PET.lastThump > 0.32) {
      PET.lastThump = T;
      sound('dogThump', 0.7);
    }
  }
  want.ears = -1;
  if (Math.floor((T - dt) / 0.9) !== Math.floor(T / 0.9) && T > 0.8 && T < 1) sound('dogWhine', 0.8);
  // The camera: round at his right, a little in front of him, the two in profile; once the player turns it, it is theirs.
  // (standing up, it comes back to his chest, where the walk has it: no jump)
  const back = up >= 0 ? smooth(up / 0.55) : 0;
  const mid = 1 - back;
  cam.focus.set(p.x + ((D.x - p.x) / 2) * mid, p.y + (0.62 + 0.769 * back) * b.scale, p.z + ((D.z - p.z) / 2) * mid);
  cam.behindYaw = PET.face + Math.PI / 2 + 0.22;
  cam.follow = 0;
  cam.minDistance = 2.6;
  if (input.lookYaw || input.lookPitch || input.zoom) PET.camFree = true;
  if (!PET.camFree) {
    cam.yaw += angleDiff(cam.behindYaw, cam.yaw) * (1 - Math.exp(-2.4 * dt));
    cam.pitch = approach(cam.pitch, 0.16, 2.4, dt);
    cam.distance = approach(cam.distance, 4.1, 2.4, dt);
  }
  if (up >= 0.6) endPet(ctx, PET.done);
  return { prompt: null };
}

/** A point on the map into his space (body units: +z ahead, +x his left, from his feet). */
function toHim(b: RoamCtx['body'], world: Vector3, out: Vector3): void {
  const s = 1 / (BODY_UNIT_M * b.scale);
  const rx = world.x - b.pos.x;
  const ry = world.y - b.pos.y;
  const rz = world.z - b.pos.z;
  const c = Math.cos(b.yaw);
  const n = Math.sin(b.yaw);
  out.set((rx * c - rz * n) * s, ry * s, (rx * n + rz * c) * s);
}

/** The dog's own step while petting (it comes to the spot in front of him, sits facing him). */
function petDogStep(ctx: RoamCtx, dt: number): void {
  const p = ctx.body.pos;
  const d = len2(PET.sx - D.x, PET.sz - D.z);
  if (d > 0.06 && PET.t < 1.8) {
    restTo(0);
    if (standing()) drive(dt, PET.sx, PET.sz, Math.min(1.6, 0.4 + d * 3));
    else drive(dt, D.x, D.z, 0);
    return;
  }
  drive(dt, D.x, D.z, 0);
  const head = Math.atan2(p.x - D.x, p.z - D.z);
  D.yaw += angleDiff(head, D.yaw) * (1 - Math.exp(-6 * dt));
  pose.turn = 0;
  restTo(1);
}

// ── Calling ────────────────────────────────────────────────────────────────

function call(ctx: RoamCtx): void {
  if (!adopted || hidden) {
    toast(t('dogNone'));
    return;
  }
  TILT.t = 1.2;
  TILT.v = 0.7;
  if (roamMode !== 'walk' || othersHolding()) return;
  const p = ctx.body.pos;
  const d = len2(p.x - D.x, p.z - D.z);
  act = 'none';
  // (he is in a hall: it waits at the door, and says so)
  if (life === 'door') {
    if (!DOOR.set || len2(DOOR.x - D.x, DOOR.z - D.z) > 40) appearAtDoor(ctx, DOOR.hall!);
    toast(t('dogDoor', { name: named() }));
    return;
  }
  // (from home, or nowhere near: in by him if it can be there; else it stays where it is, and says so)
  const comeIn = () => {
    // (where a dog could come up on foot — not a roof —: the look's end says, if it is still looking)
    const can = reachHim(ctx, true);
    if (can !== null) toast(can && appearNear(ctx) ? t('dogComing', { name: named() }) : t('dogNoWay', { name: named() }));
  };
  if (life === 'bed' || life === 'away' || !D.placed || look.fade < 0.5) return comeIn();
  const py = hisLevel(ctx);
  if (d < 5 && Math.abs(D.y - py) <= STEP_UP && !Number.isNaN(onHisLevel(ctx, D.x, D.z, py))) {
    toast(t('dogHere', { name: named() }));
    life = 'come';
    route = 'direct';
    joy = 2;
    sound('dogWhine', 0.8);
    return;
  }
  if (d > SEARCH_MAX * 0.8) return comeIn();
  seek('call', p.x, py, p.z, Math.min(SEARCH_MAX, d * 3 + 60));
  life = 'come';
  route = 'none';
  BARK_PULSE.t = 0.22;
  sound('dogBark', 0.5);
  toast(t('dogComing', { name: named() }));
}

// ── Each step ──────────────────────────────────────────────────────────────

function think(ctx: RoamCtx, rm: RoamMode, dt: number): void {
  roamMode = rm;
  const b = ctx.body;
  const p = b.pos;
  // His speed (from where he was), and his trail while he walks free on the ground.
  if (HIM.set && dt > 0) HIM.speed = approach(HIM.speed, len2(p.x - HIM.x, p.z - HIM.z) / dt, 10, dt);
  HIM.x = p.x;
  HIM.y = p.y;
  HIM.z = p.z;
  HIM.set = true;
  const others = othersHolding();
  const onFoot = rm === 'walk' && !others;
  if (onFoot && b.grounded && !b.explorer.animator.posture) {
    trail.add(p.x, p.y, p.z, !gapped);
    gapped = false;
  } else if (!onFoot || !b.grounded) gapped = true;
  // (he greeted with nobody near: it looks up at him, a tilt of the head)
  if (GREET.n !== lastGreet) {
    lastGreet = GREET.n;
    if (len2(p.x - D.x, p.z - D.z) < 10) {
      TILT.t = 1.1;
      TILT.v = rnd() < 0.5 ? 0.7 : -0.7;
      joy = Math.max(joy, 1);
    }
  }
  for (const h of HINTS) if (h.in > 0 && (h.in -= dt) <= 0) toast(h.text);
  if (CAM_BACK.left > 0 && !PET.on) {
    CAM_BACK.left = ctx.input.zoom || rm !== 'walk' ? 0 : CAM_BACK.left - dt;
    ctx.cam.distance = approach(ctx.cam.distance, CAM_BACK.to, 2.4, dt);
  }
  if (ASK.in > 0 && (ASK.in -= dt) <= 0 && !env?.shot) CARD.pending = true;
  // The way being looked for: a slice a step.
  if (search.state === 'busy') search.step();
  if (search.state === 'found' || search.state === 'near' || search.state === 'none') foundWay(ctx);

  if (!adopted) {
    if (len2(p.x - D.x, p.z - D.z) > THINK_FAR && camFar(ctx)) return;
    if (PET.on) petDogStep(ctx, dt);
    else villageLife(ctx, dt);
    return;
  }
  if (PET.on) return petDogStep(ctx, dt);
  if (atHome) {
    if (life !== 'bed') {
      life = 'bed';
      settled = 0;
      const far = len2(bed.x - D.x, bed.z - D.z);
      if (!D.placed || far > SEARCH_MAX * 0.8) putAt(bed.x, bed.z, bed.yaw, bed.y);
      else {
        seek('bed', bed.x, Number.isNaN(bed.y) ? D.y : bed.y, bed.z, SEARCH_MAX);
        route = 'none';
      }
    }
    return bedLife(dt);
  }
  landedFor = onFoot && b.grounded && !b.explorer.animator.posture ? landedFor + dt : 0;
  if (onFoot && (arrive || life === 'away' || life === 'bed' || !D.placed)) {
    // (in by him once he has landed — on his feet a moment: a start on a roof drops him off it first — and there is
    // ground on his level round him: up a deck or a tree it waits at home; looked for again twice a second)
    arriveIn -= dt;
    if (arriveIn > 0 || landedFor < LANDED) return;
    arriveIn = 0.5;
    // (only where a dog could come up on foot: not a roof)
    if (reachHim(ctx, false) !== true || !appearNear(ctx)) return;
    arrive = false;
    farSaid = false;
    return;
  }
  // (wedged in something — a wall, a deck, deep water — for a moment: out to the nearest free spot)
  if (Math.floor(clock * 4) !== Math.floor((clock - dt) * 4)) wedged(ctx);
  // He is in a temple's or a pagoda's hall: it waits at the door (also while he kneels there for a blessing).
  const hall = rm === 'walk' && (life === 'follow' || life === 'come' || life === 'wait' || life === 'door') ? hallAt(p.x, p.y, p.z) : null;
  if (hall) {
    if (life !== 'door' || DOOR.hall !== hall) toDoor(ctx, hall);
    return doorLife(ctx, dt);
  }
  if (life === 'door') {
    // (he came out: to him)
    DOOR.hall = null;
    settled = 0;
    if (onFoot) {
      life = 'come';
      route = 'none';
      seek('come', p.x, hisLevel(ctx), p.z, SEARCH_MAX);
      joy = Math.max(joy, 1.5);
    } else life = 'wait';
  }
  if (!onFoot) {
    if (life === 'follow' || life === 'come') {
      life = 'wait';
      settled = 0;
      act = 'none';
      route = 'none';
      if (search.state === 'busy') stopSearch();
      if (len2(p.x - D.x, p.z - D.z) < 30) sound('dogWhine', 0.6);
    }
    if (life === 'wait') waitLife(ctx, dt);
    return;
  }
  if (life === 'wait') {
    // On foot again: find the way to him (again now and then while there is none).
    waitLife(ctx, dt);
    retryIn -= dt;
    // (again now and then: sooner once he has moved on from where no way was found)
    if (retryIn <= 0 && search.state !== 'busy' && (len2(p.x - FAILED.x, p.z - FAILED.z) > 6 || retryIn < -FAILED.wait)) {
      retryIn = RETRY;
      const d = len2(p.x - D.x, p.z - D.z);
      const y = d < 40 ? lineWalk(ctx.world, D.x, D.y, D.z, p.x, p.z) : NaN;
      if (!Number.isNaN(y) && Math.abs(y - p.y) < 0.9) {
        life = 'come';
        route = 'direct';
      } else if (d < SEARCH_MAX * 0.8) seek('come', p.x, p.y, p.z, Math.min(SEARCH_MAX, d * 3 + 60));
      else if (!farSaid) farHint();
    }
    return;
  }
  if (life === 'come') return comeLife(ctx, dt);
  followLife(ctx, dt);
}

/** He is far from it and no way was found: it waits; a hint says how to call it (once a landing). */
function farHint(): void {
  farSaid = true;
  toast(viaMenu() ? t('dogFarMenu', { name: named() }) : t('dogFar', { name: named(), key: '0' }));
}

/** A search ended: on its way, or it waits. */
function foundWay(ctx: RoamCtx): void {
  const why = searchFor;
  const st = search.state;
  const ok = st === 'found';
  search.state = 'idle';
  searchFor = 'none';
  if (why === 'reach') {
    // (a look that ran out of room does not know: it comes)
    REACH.state = 'done';
    REACH.ok = ok || search.full;
    const ok2 = REACH.ok;
    if (REACH.call) {
      REACH.call = false;
      toast(ok2 && appearNear(ctx) ? t('dogComing', { name: named() }) : t('dogNoWay', { name: named() }));
    }
    return;
  }
  if (why === 'bed') {
    route = ok ? 'path' : 'none';
    ri = 0;
    if (!ok) putAt(bed.x, bed.z, bed.yaw, bed.y);
    return;
  }
  if (why === 'door') {
    // (no way to the door: it waits where it is)
    route = ok || (st === 'near' && search.path.count > 1) ? 'path' : 'none';
    ri = 0;
    return;
  }
  if (!adopted || atHome) return;
  if (ok) {
    FAILED.wait = 0;
    FAILED.x = FAILED.z = Infinity;
    route = 'path';
    ri = 0;
    toFoot = false;
    if (life === 'wait') {
      life = 'come';
      joy = 1.5;
    }
    return;
  }
  // No way to him: looked for again once he has moved on (or after a while, longer each time).
  const p0 = ctx.body.pos;
  FAILED.x = p0.x;
  FAILED.z = p0.z;
  FAILED.wait = Math.min(40, FAILED.wait * 2 || 6);
  // Called: in by him if it can be there; else to the foot of where he is (if it can get near) and it says so.
  if (why === 'call' && appearNear(ctx)) return;
  if (st === 'near' && search.path.count > 1) {
    route = 'path';
    ri = 0;
    toFoot = true;
    life = 'come';
    if (why === 'call') toast(t('dogNoWay', { name: named() }));
    return;
  }
  route = 'none';
  toFoot = false;
  if (life === 'come' || life === 'follow') {
    life = 'wait';
    settled = 0;
  }
  const p = ctx.body.pos;
  if (why === 'call') toast(t('dogNoWay', { name: named() }));
  else if (!farSaid && len3(p.x - D.x, p.y - D.y, p.z - D.z) > FAR) farHint();
}

const camFar = (ctx: RoamCtx) => {
  const c = ctx.cam.camera.position;
  return len2(c.x - D.x, c.z - D.z) > THINK_FAR;
};

// ── Drawing ────────────────────────────────────────────────────────────────

const PLACE = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: DOG_SCALE };

function draw(f: MapFrame, mode: RoamMode): void {
  if (!mesh) return;
  const cam = f.camera.position;
  const show =
    !hidden && D.placed && (adopted ? life !== 'away' && mode !== 'overview' : true) && len3(cam.x - D.x, cam.y - D.y, cam.z - D.z) < DRAW_FAR && look.fade > 0.01;
  if (show) {
    PLACE.x = D.x;
    PLACE.y = D.y;
    PLACE.z = D.z;
    PLACE.yaw = D.yaw;
    PLACE.pitch = D.pitch;
    PLACE.roll = D.roll;
    mesh.place(PLACE);
  } else mesh.hide();
  mesh.flush(look, clock);
}

// ── The add-on ─────────────────────────────────────────────────────────────

function readSaved(): void {
  adopted = progress.get('dog.adopted', false);
  pets = progress.get('dog.pets', 0);
  name = findDogName(progress.get('dog.name', DEFAULT_DOG_NAME.id)) ?? DEFAULT_DOG_NAME;
}

function setName(n: DogName): void {
  name = n;
  if (env && !env.shot) progress.set('dog.name', n.id);
}

registerAddon({
  id: 'dog',
  // (an add-on of the E row; it gives way to a boat, a ramp or the balloon in reach: `offer`)
  order: 60,
  init(e) {
    env = e;
    readSaved();
    mesh = new DogMesh();
    e.scene.add(mesh.mesh);
    fauna = e.parts.find((p) => p.name === 'fauna') ?? null;
    seed = e.shot ? 7 : 1 + Math.floor(Math.random() * 1e6);
    setDogCardDeps({
      current: () => name,
      onPick: (n) => {
        setName(n);
        toast(t('dogNamed', { name: quoted() }));
        hintAfterAdopt();
      },
      onClose: (fresh) => {
        if (fresh) hintAfterAdopt(true);
      },
      sound: (s) => e.uiSound(s),
    });
    // (the explorer menu's "Call the dog" and "Dog's name": _explorerMenu.ts)
    DOG_MENU.adopted = () => adopted && !hidden;
    DOG_MENU.rename = openDogName;
    homeSpot();
    putAt(HOME_AT.x, HOME_AT.z, HOME.yaw, HOME_AT.y);
    life = adopted ? 'away' : 'nap';
    pose.rest = pose.restGoal = adopted ? 0 : 3;
    setChannels(true);
    want.shut = look.shut = adopted ? 0 : 1;
    // (checks: the dev server and its shots only)
    if (import.meta.env.DEV)
      Object.assign(window, {
        __dog: {
          state: () => dogState(),
          get life() {
            return life;
          },
          get act() {
            return act;
          },
          get route() {
            return route;
          },
          get search() {
            return { state: search.state, looked: search.looked, path: search.path.count, toFoot };
          },
          /** The way found (feet: x, y, z each). */
          way: () => Array.from({ length: search.path.count }, (_, i) => [search.path.x[i], search.path.y[i], search.path.z[i]]),
          D,
          pose,
          look,
          pet: PET,
          petState,
          get debug() {
            return { AIM, AIR, ri, n: trail.n, first: trail.first, stuck, going, wayLeft, act, rest: pose.rest, restGoal: pose.restGoal, standing: standing(), stall: STALL, door: DOOR };
          },
          /** It cannot step for `s` seconds (the stall watch's checks). */
          jam: (s: number) => (jammed = s),
          trail,
          call: () => lastCtx && call(lastCtx),
          adopt: () => adopt(false),
          home: dogHome,
          bed: dogBed,
        },
      });
  },
  get holding() {
    return PET.on;
  },
  holdIn: 'walk',
  get handsBusy() {
    return PET.on;
  },
  input(ctx, mode, tap) {
    if (dogCardOpen()) {
      // (the name card has its keys: he keeps still)
      return true;
    }
    if (tap('Digit0', 'Numpad0')) call(ctx);
    // F close in front of it: a scratch behind its ears, not a greeting.
    if (mode === 'walk' && tap('KeyF') && !ctx.body.explorer.busy && canPet(ctx)) {
      startPet(ctx, 'scratch');
      return true;
    }
    return false;
  },
  offer(ctx, mode) {
    // (not under its name card)
    if (mode !== 'walk' || dogCardOpen() || CARD.pending || !canPet(ctx)) return null;
    // (a boat tied up here, a ramp, the balloon: theirs is the E)
    const p = ctx.body.pos;
    if (ctx.world.launchNear?.(p.x, p.z, p.y) || ctx.world.balloonNear?.(p.x, p.z, p.y)) return null;
    const boat = mooredBoatNear(p.x, p.z);
    if (boat && Math.abs(boat.level - p.y) < 4) return null;
    return adopted ? `E  ${t('dogPetName', { name: named() })}` : `E  ${t('dogPet')}`;
  },
  use(ctx) {
    if (canPet(ctx)) startPet(ctx, 'pet');
  },
  hold(ctx, dt) {
    return petStep(ctx, dt);
  },
  after(ctx, mode, dt) {
    lastCtx = ctx;
    if (dt <= 0) return;
    clock += dt;
    stepped = true;
    TURN.rate = 0;
    if (jammed > 0) jammed -= dt;
    think(ctx, mode, dt);
    moods(ctx, dt);
    setChannels();
    animate(dt);
  },
  frame(f, mode) {
    if (CARD.pending && started() && mode !== 'overview') {
      CARD.pending = false;
      openDogCard(true);
      if (CARD.pick >= 0) pickDogCard(CARD.pick);
    }
    if (!stepped) {
      clock += f.dt;
      if (mode === 'overview' && !adopted) {
        // (the village dog keeps napping while nobody roams)
        pose.restGoal = 3;
      }
      moods(null, f.dt);
      setChannels();
      animate(f.dt);
    }
    stepped = false;
    draw(f, mode);
  },
  setMode(next, prev, ctx) {
    roamMode = next;
    if (PET.on && next !== 'walk') endPet(ctx, false);
    if (next === 'overview') {
      // Back to the map: his dog goes home (and comes in by him the next time he lands); the village dog naps.
      endPet(null, false);
      closeDogCard();
      if (search.state === 'busy') stopSearch();
      act = 'none';
      route = 'none';
      atHome = false;
      if (adopted) {
        life = 'away';
        arrive = true;
        if (bed.set) putAt(bed.x, bed.z, bed.yaw, bed.y);
      } else {
        life = 'nap';
        putAt(HOME_AT.x, HOME_AT.z, HOME.yaw, HOME_AT.y);
        pose.rest = pose.restGoal = 3;
        setChannels(true);
      }
      SFX.level('dogPant', 0);
      return;
    }
    if (prev === 'overview') {
      trail.clear();
      gapped = true;
      HIM.set = false;
      if (adopted) arrive = true;
    }
    if (prev === 'walk' && next !== 'walk') gapped = true;
    // (landed far from it: the hint may come again)
    if ((prev === 'glide' || prev === 'hang' || prev === 'balloon' || prev === 'boat') && next === 'walk') {
      farSaid = false;
      retryIn = 0;
    }
  },
  fromUrl(q, ctx) {
    fromUrl(q, ctx);
  },
  report(): Record<string, string> | null {
    if (hidden) return { dog: '0' };
    const p = lastCtx?.body.pos;
    const d = p ? len2(p.x - D.x, p.z - D.z) : Infinity;
    if (!adopted) {
      if (d > 40) return pets ? { dogpets: String(pets) } : null;
      return { dog: life === 'nap' ? 'nap' : pets >= 1 ? 'adopt' : 'wake', ...(pets ? { dogpets: String(pets) } : {}) };
    }
    // (as it really is: gone home (or asleep on its bed while he is home: his house's own values bring that back) comes in
    // by him again; waiting where he left it; else by him, as it stands, sits or lies)
    if (life === 'away' || life === 'bed' || !D.placed) return { dog: 'away', dogname: name.id };
    const what = PET.on ? PET.kind : life === 'wait' || life === 'door' ? 'wait' : pose.restGoal >= 3 ? 'sleep' : pose.restGoal === 2 ? 'lie' : pose.restGoal === 1 ? 'sit' : 'follow';
    return {
      dog: what,
      dogname: name.id,
      ...(what === 'wait' || d > 6 ? { dogat: `${D.x.toFixed(1)},${D.z.toFixed(1)}` } : {}),
    };
  },
});

/** The hints after it came along: how to call it, and the scratch. */
function hintAfterAdopt(kept = false): void {
  if (kept) toast(t('dogNamed', { name: quoted() }));
  toastLater(viaMenu() ? t('dogFollowsMenu', { name: named() }) : t('dogFollows', { name: named(), key: '0' }), 3);
  toastLater(t('dogScratchHint', { name: named(), key: greetKey() }), 6.2);
}

// ── URL values (checks) ────────────────────────────────────────────────────

function fromUrl(q: URLSearchParams, ctx: RoamCtx): void {
  const v = q.get('dog');
  const nm = findDogName(q.get('dogname'));
  if (nm) name = nm;
  if (q.has('dogpets')) pets = Math.max(0, Number(q.get('dogpets')) || 0);
  if (!v) return;
  if (v === '0') {
    hidden = true;
    return;
  }
  hidden = false;
  const b = ctx.body;
  const p = b.pos;
  const at = q.get('dogat')?.split(',').map(Number);
  const has = at && at.length >= 2 && at.every(Number.isFinite);
  lastCtx = ctx;
  roamMode = 'walk';
  // (behind him at his left, unless `dogat=` says)
  const bx = has ? at![0] : p.x - Math.sin(b.yaw) * 2.2 + Math.cos(b.yaw) * 1.2;
  const bz = has ? at![1] : p.z - Math.cos(b.yaw) * 2.2 - Math.sin(b.yaw) * 1.2;
  const face = Math.atan2(p.x - bx, p.z - bz);
  if (v === 'nap' || v === 'wake') {
    adopted = false;
    if (has) putAt(bx, bz, HOME.yaw);
    life = v === 'nap' ? 'nap' : 'awake';
    pose.rest = pose.restGoal = v === 'nap' ? 3 : 1;
    want.shut = look.shut = v === 'nap' ? 1 : 0;
    settled = 2;
    setChannels(true);
    return;
  }
  if (v === 'adopt') {
    adopted = false;
    pets = Math.max(pets, PETS_TO_ADOPT - 1);
    // (the village dog awake in front of him)
    if (has) putAt(bx, bz, face);
    else besideHim(ctx, p.x + Math.sin(b.yaw) * 1.6, p.z + Math.cos(b.yaw) * 1.6, NaN);
    life = 'awake';
    settled = 2;
    pose.rest = pose.restGoal = 0;
    want.shut = look.shut = 0;
    setChannels(true);
    return;
  }
  // His dog.
  adopted = true;
  arrive = false;
  trail.clear();
  gapped = true;
  if (v === 'away') {
    // (gone home: it comes in by him once he is on his feet, as on landing at the start of a visit)
    life = 'away';
    arrive = true;
    return;
  }
  if (v === 'pet' || v === 'scratch') {
    besideHim(ctx, p.x + Math.sin(b.yaw) * 1.4, p.z + Math.cos(b.yaw) * 1.4, NaN);
    life = 'follow';
    pose.rest = pose.restGoal = 1;
    setChannels(true);
    startPet(ctx, v);
    return;
  }
  // (`dogat=`: there, on the top; else beside him on his level)
  if (has) putAt(bx, bz, face);
  else besideHim(ctx, bx, bz, NaN);
  look.fade = want.fade = 1;
  D.seen = 1;
  life = 'follow';
  route = 'direct';
  settled = 20;
  stillFor = 20;
  if (v === 'sit' || v === 'lie' || v === 'sleep') {
    pose.rest = pose.restGoal = v === 'sit' ? 1 : v === 'lie' ? 2 : 3;
    want.shut = look.shut = v === 'sleep' ? 1 : 0;
    pose.head = v === 'sleep' ? 1 : v === 'lie' ? 0.4 : -0.3;
    settled = v === 'sleep' ? 60 : v === 'lie' ? 20 : 2;
    stillFor = settled;
  } else if (v === 'wait') {
    life = 'wait';
    settled = 2;
    pose.rest = pose.restGoal = 1;
  } else if (v === 'call') {
    life = 'wait';
    pose.rest = pose.restGoal = 1;
    setChannels(true);
    call(ctx);
  } else if (v === 'bark') {
    // (at the nearest monkey or hen, else at a spot ahead of it)
    BARK_AT.x = D.x + Math.sin(face + 0.8) * 8;
    BARK_AT.z = D.z + Math.cos(face + 0.8) * 8;
    _subjects.length = 0;
    fauna?.subjects?.(_subjects);
    let bd = 40;
    for (const s of _subjects)
      if ((s.kind === 'macaque' || s.kind === 'junglefowl') && len2(s.x - D.x, s.z - D.z) < bd) {
        bd = len2(s.x - D.x, s.z - D.z);
        BARK_AT.x = s.x;
        BARK_AT.z = s.z;
      }
    _subjects.length = 0;
    startBark();
  } else if (v === 'name') {
    pose.rest = pose.restGoal = 1;
    // (opened once the map has started: never over the loading screen and its Start button)
    CARD.pending = true;
    const i = Number(q.get('dognamepick'));
    CARD.pick = Number.isInteger(i) ? i : -1;
  } else pose.rest = pose.restGoal = 0;
  HOLD.stand = v === 'stand';
  HOLD.gait = q.has('doggait') ? clamp(Number(q.get('doggait')) || 0, 0, 3) : -1;
  HOLD.fade = q.has('dogfade') ? clamp(Number(q.get('dogfade')), 0, 1) : -1;
  setChannels(true);
}

// ── For his stilt house (a later add-on) and others ────────────────────────

/** Where the dog sleeps (feet m; `y` the floor's height when it is not the ground's, `yaw` the way it lies). */
export interface DogSpot {
  x: number;
  z: number;
  y?: number;
  yaw?: number;
}

/** What the dog is doing (read only). */
export interface DogInfo {
  /** He has a dog (it follows him). */
  adopted: boolean;
  /** Its name (Khmer letters, Latin spelling); the default until one is picked. */
  name: { km: string; latin: string };
  /** `nap` / `awake`: the village dog, not his yet; `follow`, `come`, `wait`: his, roaming; `bed`: asleep on its bed (he is home); `away`: home while he is on the map. */
  life: Life;
  /** Where it is (feet, m) and how far from him (m; Infinity off roaming). */
  x: number;
  y: number;
  z: number;
  far: number;
  /** Lying asleep. */
  asleep: boolean;
}

const INFO: DogInfo = { adopted: false, name: { km: '', latin: '' }, life: 'nap', x: 0, y: 0, z: 0, far: Infinity, asleep: false };

/** The dog now (one object, filled again each call). */
export function dogState(): Readonly<DogInfo> {
  INFO.adopted = adopted;
  INFO.name.km = name.km;
  INFO.name.latin = name.latin;
  INFO.life = life;
  INFO.x = D.x;
  INFO.y = D.y;
  INFO.z = D.z;
  const p = lastCtx?.body.pos;
  // (in 3D: a dog 12 m below his deck is far)
  INFO.far = p && roamMode !== 'overview' ? len3(p.x - D.x, p.y - D.y, p.z - D.z) : Infinity;
  INFO.asleep = pose.restGoal >= 3 && look.shut > 0.5;
  return INFO;
}

/**
 * Where his dog sleeps (its bed: under his stilt house, on its veranda…), or null for none (it then goes home to the
 * village). Used while he is home (`dogHome(true)`) and when he goes back to the map. Not kept: the house sets it
 * when it is built.
 */
export function dogBed(spot: DogSpot | null): void {
  if (!spot) {
    bed.set = false;
    bed.x = HOME_AT.x;
    bed.z = HOME_AT.z;
    bed.y = HOME_AT.y;
    bed.yaw = HOME.yaw;
    return;
  }
  bed.set = true;
  bed.x = spot.x;
  bed.z = spot.z;
  bed.y = spot.y ?? (env ? env.world.groundAt(spot.x, spot.z) : NaN);
  bed.yaw = spot.yaw ?? 0;
}

/**
 * He is home (asleep in his house, say): his dog goes to its bed (along a way, or it is simply there when none is
 * found) and sleeps. `false`: it wakes and comes to him (along a way; it waits there while there is none). Nothing
 * while he has no dog.
 */
export function dogHome(on: boolean): void {
  if (on === atHome) return;
  atHome = on;
  settled = 0;
  if (!on && adopted) {
    // (it wakes on its bed and finds the way to him; in from by him only once he is on his feet far from it)
    route = 'none';
    retryIn = 0;
    FAILED.wait = 0;
    FAILED.x = FAILED.z = Infinity;
    if (D.placed) life = 'wait';
    else {
      life = 'away';
      arrive = true;
    }
  }
}

/** He has a dog. */
export const dogAdopted = (): boolean => adopted;

/** Its name in the language in use, or null while he has none. */
export const dogNameNow = (): string | null => (adopted ? dogNameIn(name) : null);

/** The explorer menu's "Dog's name": the card (only once he has a dog). */
export function openDogName(): void {
  if (adopted) openDogCard(false);
}

export { DOG_NAMES };
