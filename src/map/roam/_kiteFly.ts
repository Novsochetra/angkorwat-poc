import { Vector3, type Group } from 'three';
import { kiteFlyPose, kiteFlyState } from '../../character/kiteFly';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import '../audio/_kiteFly';
import { SFX } from '../audio/addonSfx';
import { padName } from '../pad/glyphs';
import { pad } from '../pad/pad';
import { SURFACE } from '../heightfield';
import { BACK_HAMLET, EAST_VILLAGE, KULEN_PICNIC, MARKET, PALM_GROVE, PLACES, VILLAGE } from '../layout';
import { paddyFlooded } from '../paddies/stages';
import { KITE_HOOK } from '../people/_kite';
import { KITE_FIELDS } from '../people/_sceneKites';
import { progress } from '../progress';
import { SEY_SPOT } from '../sey';
import { browse, SHOPS } from '../shop';
import { weatherNow } from '../sky/weather';
import { TIME } from '../time';
import type { MapFrame, MapWeather } from '../types';
import { createAskCard, type AskCard } from '../ui/ask';
import { lang, t } from '../ui/lang';
import { addonHands, registerAddon, type AddonEnv, type AddonHold, type AddonKey } from './_addons';
import { createKiteGear, followWind, HIS_VOICE, kiteWeather, LIFT, windAloft, type KiteGear } from './_kiteSky';
import { createKiteStall, KITE_PRICE, type KiteStall } from './_kiteStall';
import { riel } from './_shopPurse';
import { mooredBoatNear } from './boat';
import { angleDiff } from './followCam';
import type { RoamCtx, RoamWorld } from './types';
import { stepSound } from './walker';

/**
 * Flying his own kite (khleng, ខ្លែង): a roaming add-on (_addons.ts) that
 * holds him in walk mode while it flies (`holding`), as the rope swing does.
 *
 * **Getting it.** The grandfather who flies the big khleng ek on the east
 * field (people/_sceneKites.ts, in the kite season's afternoons and into the
 * night) gives him a small one the first time he asks: near him, "E  Ask for
 * a kite"; the grandfather answers (a bubble), his son comes up and holds it
 * out, and he takes it, looks at it and puts it away (KITE_HOOK: the people's
 * side of it). Or he buys one at the morning market: the stall of woven
 * things has kites on a bamboo pole (_kiteStall.ts), "E  Buy a kite — ៨,០០០ ៛"
 * asks with a card of its own (ui/ask.ts), the seller hands it over. He keeps
 * it (progress.ts `kite.have`).
 *
 * **Flying it.** "E  Fly your kite" is offered only where and when it really
 * flies: in fair weather with the kite season's wind aloft (the north wind
 * from after the Water Festival to March, _kiteSky.ts `windAloft`), on the
 * kite fields (the families' east, the children's west) or a dry rice field,
 * away from the villages, the markets, the sey circle, a place's entrance and
 * the stalls (`kiteGround`), with nothing over him or down the wind (the walk
 * maps' `clearance`, `hardClearance`, `softClearance`: `flyHere`). It comes
 * last in the E row (`ORDER`): anything else in reach (the dog, the sey, the
 * farmers' work) wins. Out of the season, on the families' field, a toast once
 * a visit says when kites fly there (no E). Then he turns into the wind with
 * the kite held up at arm's length past
 * his right shoulder, runs a few steps and lets it go: it climbs behind him on
 * its line; he turns round to it and it climbs on to `LINE_START` m of line.
 * Then:
 * - **W** lets out line (it goes higher and further, sinking a little as the
 *   line pays out), **S** reels in (it climbs on the shorter line);
 * - **A / D** steer it left and right across the wind (lower at the sides);
 * - gusts make it dance (bob, swing, roll), its ribbon shimmers and, high up,
 *   its bow hums (the khleng ek's own song: audio/kite.ts);
 * - **Shift + move** (the stick past its ring on touch, R2 on a pad) walks
 *   him slowly with it; the kite follows (it climbs as he walks into the
 *   wind, sinks as he walks with it). Not under trees or roofs: the line
 *   would catch.
 * - Sunk into a tree it snags; on the ground it lies: he must reel it in
 *   (S or E): a tug frees it and it comes in.
 * - **E** brings it in: he reels it all in, folds it and puts it away. Rain
 *   brings it in by itself.
 * The line is one thin sagging strip from his fist (_kiteSky.ts). The camera
 * looks up past him at the kite while he flies it (a drag turns it).
 *
 * URL (checks): `kite=have` (he has one) · `kite=fly` or `kite=fly:<height m>`
 * (flying it there at once, `kiteside=<rad>` steered that far: + his left) ·
 * `kite=gift:<s>` (he asked the grandfather: `s` s after the son holds it out,
 * the moment held still; none: waiting for him) · `kite=bought:<s>` (the
 * market's hand-over, the same) · `kite=buy` (the buy card, at the stall) ·
 * `kite=snag:<x,y,z>` (caught in a tree there; no point: where the flight would
 * be) · `kite=down` (lying on the ground under it) · `kitewind=<0‥1>` (the wind
 * aloft held there: 0 a calm). `report()` gives `kite=` (and `kiteside=`).
 * Shots log `[map] kite: caught in a tree at …` and the market's spots.
 */

/** Line (m): the shortest it flies on, where a launch lets it climb to, all there is. */
const LINE_MIN = 6;
const LINE_START = 24;
const LINE_MAX = 80;
/** Paying out, reeling in, bringing it in (m/s of line), and how far A / D steer it across the wind (radians). */
const LET_OUT = 5.5;
const REEL = 6.5;
const REEL_IN = 11;
const STEER = 0.95;
/** Near enough the grandfather to ask him (m, across and up). */
const GIVER_REACH = 5.5;
/** The launch (s): turning into the wind, letting go, the end of the run, turned round to it. */
const L_TURN = 0.45;
const L_RELEASE = 0.85;
const L_RUN_END = 2.0;
const L_TURNED = 2.8;
/** The launch run's pace and his slow walk with the kite flying (m/s on the map, at the roaming size 1.4). */
const RUN_V = 4.2;
const WALK_V = 1.9;
/** The hand-over (s from when it is held out to him): he reaches out, takes it, looks at it, puts it away. */
const G_TAKE = 0.9;
const G_HAND = 1.25;
const G_LOOK = 1.35;
const G_AWAY = 2.7;
const G_DONE = 3.0;
/** Waiting this long (s) for the grandfather's son to come up with it (else it is simply in his hands). */
const GIFT_WAIT = 8;
/** Folding it away (s). */
const FOLD = 1.35;
/** Seconds between its hum's calls while it flies high (audio/kite.ts follows them), and how high it must be (m). */
const HUM_EVERY = 1.6;
const HUM_HIGH = 14;
/** Saved: he has a kite. */
const HAVE_KEY = 'kite.have';
/** Its place in the E row: after every other add-on (they come at 60 at most), so anything else in reach wins. */
const ORDER = 90;
/** The key help (bottom left) while it flies (`keys`) and while it is caught (S or E reels it in); else the walk's. */
const FLY_KEYS: readonly AddonKey[] = [
  ['W', 'kiteKeyOut', 'lstick'],
  ['S', 'kiteKeyIn', 'lstick'],
  ['A D', 'kiteKeySteer', 'lstick'],
  ['Shift', 'kiteKeyWalk', 'r2'],
  ['E', 'kiteReel', 'west'],
];
const SNAG_KEYS: readonly AddonKey[] = [['S E', 'kiteReel', 'lstick west']];
/**
 * Where it is not offered, however open (m round: the villages, the markets, the hamlets, the picnic place, the
 * children's sey circle): people live and work there; a kite is flown out on the fields. And this near a place's
 * entrance or a stall (m).
 */
const SETTLED = [
  { x: EAST_VILLAGE.x, z: EAST_VILLAGE.z, r: EAST_VILLAGE.r + 20 },
  { x: MARKET.x, z: MARKET.z, r: MARKET.r + 40 },
  { x: PALM_GROVE.x, z: PALM_GROVE.z, r: PALM_GROVE.r + 12 },
  { x: KULEN_PICNIC.x, z: KULEN_PICNIC.z, r: KULEN_PICNIC.r + 20 },
  { x: BACK_HAMLET.x, z: BACK_HAMLET.z, r: BACK_HAMLET.r + 20 },
  { x: VILLAGE.x, z: VILLAGE.z, r: 90 },
  { x: SEY_SPOT.x, z: SEY_SPOT.z, r: 25 },
] as const;
const PLACE_CLEAR = 60;
const SHOP_CLEAR = 30;
/** His left fist's slot for the spool (rig `setSlotObject`). */
const SPOOL_SLOT = 'kiteSpool';

type Stage = 'none' | 'take' | 'launch' | 'fly' | 'snag' | 'reel' | 'fold';

let env: AddonEnv | null = null;
let gear: KiteGear | null = null;
let stall: KiteStall | null = null;
let stallTried = false;
let card: AskCard | null = null;
/** The bamboo spool in his left fist while he flies it (made once). */
let spool: Group | null = null;
let have = false;
let stage: Stage = 'none';
/** Seconds in the stage; frozen (a check's still of a moment). */
let tau = 0;
let frozen = false;
/** The hand-over: from the grandfather's son or the market's seller; when it was held out to him (s into `take`; −1 not yet); no son came. */
let takeFrom: 'gift' | 'buy' = 'gift';
let giveT = -1;
let alone = false;
/** The flight: line out (m), angle over the level and round from downwind (rad, + his left), roll; the line's speed (m/s, + out). */
let L = 0;
let e = 0;
let side = 0;
let roll = 0;
let rate = 0;
let out = 1;
/** Letting out after the launch, to `LINE_START`. */
let climb = false;
/** Being brought in from a snag or off the ground (dragged in a straight line), and its angle then. */
let dragged = false;
let dragE = 0;
/** Caught: in a tree or on the ground, where (the knot) and how it hung. */
let snagKind: 'tree' | 'ground' = 'tree';
const snagAt = new Vector3();
let snagYaw = 0;
let snagPitch = 0;
let snagWait = 0;
/** The wind it flies in (downwind x z, strength), followed slowly; held by a check (`kitewind=`). */
const wind = { x: 0, z: -1, k: 0.6 };
let windDir = Number.NaN;
let windHeld: number | null = null;
/** The season, the time of day and the night of the last frame (NaN before one). */
let season = Number.NaN;
let clock = Number.NaN;
let night = 0;
/** His pose (character/kiteFly.ts) and its shapes' targets. */
const ps = kiteFlyState();
const want = { fly: 0, hold: 0, take: 0, look: 0, fold: 0 };
const posture = () => kiteFlyPose(ps);
let lastPhase = 0;
/** The camera: framing the kite (eased 0‥1), the player's last turn (s ago), his own view to go back to after. */
let camW = 0;
let camIdle = 10;
let framing = true;
let camBefore: { pitch: number; pitchMin: number; distance: number } | null = null;
/** The view while he takes it (his side, tilt, distance), once he has turned. */
let takeView: { side: number; pitch: number; distance: number } | null = null;
/** Toasts said once (a visit): the keys; the hum; all the line (a flight); the trees (s until again). */
let keysSaid = false;
let seasonSaid = false;
let humSaid = false;
let maxSaid = false;
let treesAt = 0;
let humAt = 0;
/** The open field here, looked at last (where, when) and what it was. */
const openAt = { x: Number.NaN, z: Number.NaN, t: -1e9, ok: false };
/** The kite where the flight puts it (m: from the hand as the steps work it out; drawn from his real fist). */
const kp = new Vector3();
const fist = new Vector3();
const from = new Vector3();
const hold: AddonHold = { prompt: null, mode: null };
/** The shot's own start (its `rcam` holds the camera). */
let urlCam = false;

// ── Words (made again only when the language or the controls change) ──

const words = { lang: '', pad: false, touch: false, ask: '', buy: '', fly: '', reel: '', flying: '' };
function say(): typeof words {
  const touch = document.body.classList.contains('roam-touch');
  if (words.lang === lang() && words.pad === pad.active && words.touch === touch) return words;
  words.lang = lang();
  words.pad = pad.active;
  words.touch = touch;
  words.ask = `E  ${t('kiteAsk')}`;
  words.buy = `E  ${t('kiteBuy', { price: riel(KITE_PRICE) })}`;
  words.fly = `E  ${t('kiteFly')}`;
  words.reel = `E  ${t('kiteReel')}`;
  // (the other keys are in the key help while it flies: `keys`; on touch the first flight's toast says them)
  words.flying = words.reel;
  return words;
}

// ── Small helpers ──

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const smooth = (v: number) => {
  const c = clamp(v, 0, 1);
  return c * c * (3 - 2 * c);
};

function seasonNow(): number {
  if (!Number.isNaN(season)) return season;
  const q = env?.params.get('season');
  return q !== null && q !== undefined && q !== '' ? Number(q) || 0 : TIME.moment(TIME.days()).season;
}

/** The time of day now (`MapFrame.clock`: the last frame's, or the map's time before one). */
function clockNow(): number {
  return Number.isNaN(clock) ? TIME.moment(TIME.days()).clock : clock;
}

/** The wind aloft now (a check's, if it holds one). */
function windNow(w: Readonly<MapWeather>): number {
  return windHeld ?? windAloft(w, seasonNow());
}

/** Where his fist about is (m), for the flight's sums (the kite is drawn from his real fist). */
function anchor(ctx: RoamCtx, out: Vector3): Vector3 {
  const b = ctx.body;
  const k = b.scale / 1.4;
  return out.set(b.pos.x + Math.sin(b.yaw) * 0.35 * k, b.pos.y + 1.6 * k, b.pos.z + Math.cos(b.yaw) * 0.35 * k);
}

/** The kite's knot `L` m out at `e` and `side` from `a` in the wind (as people/_kite.ts `Kite.flyAt` puts it). */
function kiteAt(a: Vector3, out: Vector3): Vector3 {
  const cs = Math.cos(side);
  const ss = Math.sin(side);
  const dx = wind.x * cs + wind.z * ss;
  const dz = wind.z * cs - wind.x * ss;
  return out.set(a.x + dx * L * Math.cos(e), a.y + L * Math.sin(e), a.z + dz * L * Math.cos(e));
}

/** The angle the wind holds it at (radians over the level), for its line, its steer and how hard he works it. */
function holdAngle(k: number): number {
  if (k < LIFT) return 0.02;
  const s = side / STEER;
  return (0.6 + 0.42 * k) * (1 - 0.5 * s * s);
}

/**
 * Where he can stand at (x, z) with his feet at `y` (stepping at most 0.6 up or 0.9 down; room for him; not in
 * deep water, not off the roaming area, not under a roof or a trunk's crown): the floor there, or NaN.
 */
function floorAt(ctx: RoamCtx, x: number, z: number, y: number): number {
  const w = ctx.world;
  const s = ctx.body.scale;
  if (!w.inBounds(x, z) || (w.edgeDistance?.(x, z) ?? 99) < 4) return Number.NaN;
  const h = 1.7 * s * 0.95;
  const r = 0.3 * s;
  const g = standOn(w, x, z, y, h);
  if (Number.isNaN(g) || g > y + 0.6 || g < y - 0.9) return Number.NaN;
  for (const [cx, cz] of RING) {
    const gr = standOn(w, x + cx * r, z + cz * r, y, h);
    if (Number.isNaN(gr) || gr > y + 0.6) return Number.NaN;
  }
  const water = w.waterAt(x, z);
  if (water !== null && water - g > 0.3) return Number.NaN;
  if ((w.ceilingAt?.(x, z, g + 0.5) ?? Infinity) < g + 20) return Number.NaN;
  return g;
}
const RING = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
/** Where feet at `y` stand at (x, z), a step of 0.6 m at most, `h` of room (the walk map; the land without one). */
const standOn = (w: RoamWorld, x: number, z: number, y: number, h: number): number => (w.standAt ? w.standAt(x, z, y, 0.6, h) : w.groundAt(x, z));

/** Move him by (dx, dz) if he fits there (`lineCheck`: and the line from there is clear); true if he moved. */
function stepBy(ctx: RoamCtx, dx: number, dz: number, lineCheck: boolean): boolean {
  const p = ctx.body.pos;
  const x = p.x + dx;
  const z = p.z + dz;
  const g = floorAt(ctx, x, z, p.y);
  if (Number.isNaN(g)) return false;
  if (lineCheck) {
    // (the line's first stretch from there up to the kite: no leaves, no roof)
    const w = ctx.world;
    const k = ctx.body.scale / 1.4;
    const ax = x;
    const ay = g + 1.6 * k;
    const az = z;
    const lx = kp.x - ax;
    const ly = kp.y - ay;
    const lz = kp.z - az;
    const l = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
    const u = Math.min(14, l) / l;
    const bx = ax + lx * u;
    const by = ay + ly * u;
    const bz = az + lz * u;
    if ((w.softClearance && w.softClearance(ax, ay, az, bx, by, bz) < 1) || (w.clearance && w.clearance(ax, ay, az, bx, by, bz) < 1)) {
      if (ctx.t > treesAt) {
        ctx.hud.toast(t('kiteTrees'));
        treesAt = ctx.t + 6;
      }
      return false;
    }
  }
  p.x = x;
  p.z = z;
  p.y = g;
  return true;
}

/** Turn him towards `yaw` at `rate` (1/s). */
function turnTo(ctx: RoamCtx, yaw: number, r: number, dt: number): void {
  ctx.body.yaw += angleDiff(yaw, ctx.body.yaw) * damp(r, dt);
}

// ── Where he may fly it (E "Fly your kite") ──

/** Rays from his hand: down the wind low and high, out to both sides, straight up (yaw from downwind, elevation, length m). */
const RAYS = [
  [0, 0.32, 26],
  [0, 0.78, 30],
  [0.6, 0.5, 22],
  [-0.6, 0.5, 22],
  [0, 1.45, 16],
] as const;

const within = (x: number, z: number, s: { readonly x: number; readonly z: number; readonly r: number }) => (x - s.x) ** 2 + (z - s.z) ** 2 < s.r * s.r;

/**
 * A field to fly it over: the kite fields (the families' east, the children's west: people/_sceneKites.ts
 * `KITE_FIELDS`) or a rice field that is dry (after the harvest: paddies/stages.ts), away from the villages,
 * the markets, a place's entrance and the stalls (`SETTLED`).
 */
function kiteGround(w: RoamWorld, x: number, z: number): boolean {
  for (const s of SETTLED) if (within(x, z, s)) return false;
  for (const p of PLACES) if ((x - p.anchor[0]) ** 2 + (z - p.anchor[2]) ** 2 < PLACE_CLEAR * PLACE_CLEAR) return false;
  for (const s of SHOPS) if ((x - s.x) ** 2 + (z - s.z) ** 2 < SHOP_CLEAR * SHOP_CLEAR) return false;
  if (within(x, z, KITE_FIELDS.east) || within(x, z, KITE_FIELDS.west)) return true;
  return w.field.surfaceAt(x, z) === SURFACE.paddy && !paddyFlooded(x, z);
}

/**
 * He may fly it here: on a kite field or a dry rice field (`kiteGround`), on the land (not a terrace or a roof),
 * dry, and nothing over him or down the wind (trees, roofs, walls, a sign: the walk maps' solid, the camera's hard
 * map and its leaves). Looked at again once he has moved a metre or half a second has gone.
 */
function flyHere(ctx: RoamCtx): boolean {
  const p = ctx.body.pos;
  if (Math.abs(p.x - openAt.x) < 0.8 && Math.abs(p.z - openAt.z) < 0.8 && Math.abs(ctx.t - openAt.t) < 0.5) return openAt.ok;
  openAt.x = p.x;
  openAt.z = p.z;
  openAt.t = ctx.t;
  const w = ctx.world;
  openAt.ok = false;
  if (!w.inBounds(p.x, p.z) || p.y > w.field.heightAt(p.x, p.z) + 1.2 || !kiteGround(w, p.x, p.z)) return false;
  const water = w.waterAt(p.x, p.z);
  if (water !== null && water > p.y - 0.1) return false;
  if ((w.ceilingAt?.(p.x, p.z, p.y + 0.5) ?? Infinity) < p.y + 30) return false;
  // (nothing else's E here: a place's beacon, a boat by the bank, a ramp, the balloon)
  if (w.placeNear(p.x, p.z, p.y) || w.launchNear?.(p.x, p.z, p.y) || w.balloonNear?.(p.x, p.z, p.y) || mooredBoatNear(p.x, p.z)) return false;
  const hy = p.y + 1.6 * (ctx.body.scale / 1.4);
  // (straight up: also what only the camera's maps hold)
  if (w.hardClearance && w.hardClearance(p.x, hy, p.z, p.x, hy + 25, p.z) < 1) return false;
  const dir = ctx.weather?.windDir ?? Math.atan2(wind.x, wind.z);
  for (const [a, el, len] of RAYS) {
    const c = Math.cos(el) * len;
    const bx = p.x + Math.sin(dir + a) * c;
    const by = hy + Math.sin(el) * len;
    const bz = p.z + Math.cos(dir + a) * c;
    if (w.clearance && w.clearance(p.x, hy, p.z, bx, by, bz) < 1) return false;
    if (w.softClearance && w.softClearance(p.x, hy, p.z, bx, by, bz) < 1) return false;
  }
  openAt.ok = true;
  return true;
}

/** Out of the kite season (or a calm), coming onto the families' field with his kite: once a visit, a word on when kites fly (no E). */
function seasonHint(ctx: RoamCtx): void {
  if (seasonSaid) return;
  const p = ctx.body.pos;
  if (!within(p.x, p.z, KITE_FIELDS.east)) return;
  seasonSaid = true;
  ctx.hud.toast(t('kiteSeasonHint'));
}

// ── Starting and stopping ──

function ensureGear(): KiteGear | null {
  if (!env) return null;
  if (!gear) gear = createKiteGear(env.scene);
  if (!stallTried) {
    stallTried = true;
    // (the morning market's kites: only where the market is on this map)
    if (env.parts.some((p) => p.name === 'hamlet')) stall = createKiteStall(env.world, gear.things, env.params);
  }
  return gear;
}

/**
 * The spool in his left fist (the people's kite flyers hold a reel too): a short bamboo dowel along the fist's
 * grip axis, the cream line wound round its middle between two rims. Body units, the fist's own space.
 */
function spoolIn(on: boolean): void {
  const x = env?.explorer;
  if (!x) return;
  if (!on) {
    x.rig.clearSlot(SPOOL_SLOT);
    return;
  }
  if (!spool) {
    const b = new VoxelBuilder();
    b.box(0, 0, 0, 0.5, 0.5, 4.4, 0xb8935a, 'wood');
    b.box(0, 0, 0, 1.3, 1.3, 2.0, 0xeee6d2, 'krama');
    for (const z of [-1.15, 1.15]) b.box(0, 0, z, 1.7, 1.7, 0.3, 0x9a7444, 'wood');
    spool = buildVoxelMesh(b, { quality: x.rig.quality, name: 'kite:spool' });
  }
  x.rig.setSlotObject(SPOOL_SLOT, 'propL', spool);
}

/** He holds still under the kite's posture from now (the walker hands its steps here: `holding`). */
function begin(ctx: RoamCtx, next: Stage): void {
  stage = next;
  tau = 0;
  takeView = null;
  const x = ctx.body.explorer;
  x.animator.posture = posture;
  x.animator.postureFeet = true;
  lastPhase = x.animator.phase;
  ctx.body.vel.set(0, 0, 0);
}

/** Done: the posture goes (eased by the Animator), the line, the sounds; the camera eases back (`after`). */
function finish(ctx: RoamCtx | null): void {
  stage = 'none';
  frozen = false;
  climb = false;
  dragged = false;
  rate = 0;
  const q = KITE_HOOK.gift;
  q.t = -1;
  q.giving = false;
  if (env) {
    env.explorer.animator.posture = null;
    env.explorer.animator.postureFeet = true;
  }
  if (ctx) ctx.body.vel.set(0, 0, 0);
  gear?.kite.hide();
  gear?.hideLine();
  spoolIn(false);
  SFX.level('kiteLine', 0);
  SFX.level('kiteFlutter', 0);
  for (const k of ['fly', 'hold', 'take', 'look', 'fold'] as const) want[k] = 0;
}

function startLaunch(ctx: RoamCtx): void {
  if (!ensureGear()) return;
  begin(ctx, 'launch');
  spoolIn(true);
  windDir = Number.NaN;
  windDir = followWind(wind, ctx.weather, windDir, 0);
  L = 1.5;
  e = 0.2;
  side = 0;
  roll = 0;
  out = 0.2;
  maxSaid = false;
  framing = !urlCam;
  SFX.play('kitePaper', 0.6);
  if (!keysSaid && !ctx.shot) {
    keysSaid = true;
    const touch = document.body.classList.contains('roam-touch');
    ctx.hud.toast(pad.active ? t('kiteKeysPad', { fast: padName('r2', pad.kind) }) : t(touch ? 'kiteKeysTouch' : 'kiteKeys'));
  }
}

/** Flying at once (a check's `kite=fly`): `height` m over his hand, `sideAt` radians round. */
function startFlying(ctx: RoamCtx, height: number, sideAt: number): void {
  if (!ensureGear()) return;
  begin(ctx, 'fly');
  spoolIn(true);
  windDir = followWind(wind, ctx.weather, Number.NaN, 0);
  wind.k = windNow(ctx.weather ?? weatherNow());
  side = clamp(sideAt, -STEER, STEER);
  e = holdAngle(Math.max(wind.k, LIFT + 0.1));
  L = clamp(height / Math.sin(e), LINE_MIN, LINE_MAX);
  out = 1;
  roll = 0;
  // (facing it; a check's `rcam` turns with him, it is his)
  const yaw = Math.atan2(wind.x * Math.cos(side) + wind.z * Math.sin(side), wind.z * Math.cos(side) - wind.x * Math.sin(side));
  ctx.cam.yaw += angleDiff(yaw, ctx.body.yaw);
  ctx.body.yaw = yaw;
  want.fly = ps.fly = 1;
  anchor(ctx, from);
  kiteAt(from, kp);
  camW = 1;
  if (framing) {
    // (the view a flight settles into: behind him, looking up at it)
    const chestY = ctx.body.pos.y + 1.7 * ctx.body.scale * 0.95 * 0.86;
    const fy = chestY + clamp((kp.y - chestY) * 0.06, 0, 1.6);
    camBefore ??= { pitch: ctx.cam.pitch, pitchMin: ctx.cam.pitchMin, distance: ctx.cam.distance };
    ctx.cam.pitchMin = -1.05;
    ctx.cam.focus.set(ctx.body.pos.x, fy, ctx.body.pos.z);
    ctx.cam.yaw = yaw;
    ctx.cam.pitch = framePitch(ctx, fy, camBefore.pitch);
    ctx.cam.yaw = yaw + clearRound(ctx, yaw, ctx.cam.pitch);
  }
}

function startReel(fromSnag: boolean): void {
  stage = 'reel';
  tau = 0;
  climb = false;
  dragged = fromSnag;
  if (fromSnag) {
    // (from where it is caught, in a straight line; off the ground it lifts as he pulls)
    dragE = Math.max(snagKind === 'ground' ? 0.25 : 0, e);
    e = dragE;
  }
}

function startTake(ctx: RoamCtx, how: 'gift' | 'buy'): void {
  if (!ensureGear()) return;
  begin(ctx, 'take');
  takeFrom = how;
  giveT = -1;
  alone = false;
  if (how === 'gift') {
    const q = KITE_HOOK.gift;
    q.n++;
    q.t = 0;
    q.giving = false;
    q.x = ctx.body.pos.x;
    q.y = ctx.body.pos.y;
    q.z = ctx.body.pos.z;
    q.yaw = ctx.body.yaw;
  }
}

/** The kite is his now (kept between visits). */
function gotIt(ctx: RoamCtx): void {
  have = true;
  progress.set(HAVE_KEY, true);
  ctx.hud.toast(t('kiteGot'));
}

// ── The buy card (the market) ──

const KITE_ICON =
  '<svg class="mu-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.2 4.6 Q12 2.2 20.8 4.6" fill="none" stroke="#c49a58" stroke-width="1.3"/>' +
  '<path d="M12 3.4 21 6.6 17.4 9.4 13.4 10.4 15.6 13.4 12 15.2 8.4 13.4 10.6 10.4 6.6 9.4 3 6.6Z" fill="#c8382a" stroke="#f2ead4" stroke-width="1.1" stroke-linejoin="round"/>' +
  '<path d="m12 6.2 1.6 1.6L12 9.4l-1.6-1.6Z" fill="#e8b43a"/><path d="m12 11.2 1.1 1.1L12 13.4l-1.1-1.1Z" fill="#1f3f9a"/><path d="M11 15.2c-.8 2.4.6 3.6-.4 6.2M13 15.2c.8 2.4-.6 3.6.4 6.2" fill="none" stroke="#d8c890" stroke-width="1.1" stroke-linecap="round"/></svg>';

function askBuy(ctx: RoamCtx): void {
  const e0 = env;
  const st = stall;
  if (!e0 || !st) return;
  if (!card) {
    const root = document.getElementById('ui') ?? e0.layer;
    card = createAskCard(root, {
      cls: 'kite-buy',
      icon: KITE_ICON,
      words: () => ({ title: t('kiteCardTitle'), note: t('kiteCardNote', { price: riel(KITE_PRICE) }), stay: t('kiteCardStay'), go: t('kiteCardGo') }),
      onGo: () => paid(),
      sound: (s) => e0.uiSound(s),
    });
  }
  // (the seller looks up and asks what he would like: people/_saleBack.ts)
  browse(ctx.t, st.shop);
  browsing = true;
  card.ask();
}
let browsing = false;
let lastCtx: RoamCtx | null = null;

/** He pressed Buy: pay, and the seller hands it over. */
function paid(): void {
  const ctx = lastCtx;
  if (!env || !ctx || !stall) return;
  if (!env.purse.pay(KITE_PRICE)) {
    ctx.hud.toast(t('byShort'));
    env.uiSound('tick');
    return;
  }
  stall.sold(ctx.t);
  env.uiSound('select');
  startTake(ctx, 'buy');
}

// ── The steps while it holds him ──

/** Ease his shapes towards `want`, and the walk under them. */
function poseStep(ctx: RoamCtx, dt: number, speed: number): void {
  const k = damp(6, dt);
  ps.fly += (want.fly - ps.fly) * k;
  ps.hold += (want.hold - ps.hold) * k;
  ps.take += (want.take - ps.take) * k;
  ps.look += (want.look - ps.look) * k;
  ps.fold += (want.fold - ps.fold) * k;
  ps.t += dt;
  const b = ctx.body;
  // (true size: the gait's speed)
  const v = speed / b.scale;
  ps.speed = v;
  ps.phase = b.explorer.animator.phase;
  b.explorer.setMotion(v, true, 0);
  // Footsteps, as the walker's (at the cycle's footfalls).
  const phase = b.explorer.animator.phase;
  if (speed > 0.4) {
    const crossed = (p: number) => (lastPhase < p && phase >= p) || (phase < lastPhase && (lastPhase < p || phase >= p));
    if (crossed(0.25) || crossed(0.75)) ctx.sound(stepSound(ctx.world, b.pos.x, b.pos.y, b.pos.z), Math.min(1, 0.3 + speed / 8));
  }
  lastPhase = phase;
  // Where the line goes from his fist, in his own space (x his left, y up, z ahead).
  anchor(ctx, from);
  const dx = kp.x - from.x;
  const dy = kp.y - from.y;
  const dz = kp.z - from.z;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  ps.aim.set(dx * c - dz * s, dy, dx * s + dz * c);
  if (ps.aim.lengthSq() < 1e-6) ps.aim.set(0, 0.6, 0.8);
  ps.aim.normalize();
}

/** The camera: up past him at the kite while it flies (eased in `camW`); he still turns it. */
function camStep(ctx: RoamCtx, dt: number, kiteW: number, behind: number): void {
  const { cam, body } = ctx;
  camW += (kiteW - camW) * damp(2, dt);
  // (taking it: round to his side, so the hands meet in the view, not behind his back; from where nothing is in the way)
  if (stage === 'take' && framing) {
    if (!takeView && tau > 0.4) takeView = clearSide(ctx);
    if (takeView && camIdle > 1.2) {
      camBefore ??= { pitch: cam.pitch, pitchMin: cam.pitchMin, distance: cam.distance };
      const k = damp(1.6, dt);
      cam.yaw += angleDiff(body.yaw + takeView.side, cam.yaw) * k;
      cam.pitch += (takeView.pitch - cam.pitch) * k;
      cam.distance += (takeView.distance - cam.distance) * k;
    }
  }
  const s = body.scale;
  const chestY = body.pos.y + 1.7 * s * 0.95 * 0.86;
  // (it looks a little above his chest, so he stays in the lower part of the view, clear of the prompt)
  const up = clamp((kp.y - chestY) * 0.06, 0, 1.6) * camW;
  const fy = chestY + up;
  cam.focus.set(body.pos.x, fy, body.pos.z);
  cam.behindYaw = behind;
  cam.fov = 50 + 7 * camW;
  if (camW > 0.05 && !camBefore) camBefore = { pitch: cam.pitch, pitchMin: cam.pitchMin, distance: cam.distance };
  if (camBefore) cam.pitchMin = -1.05;
  if (stage !== 'take' && framing && camIdle > 1.2 && camBefore) {
    // Behind him and up at the kite while it flies (a little round, if a tree or a wall stands there); back to his
    // own tilt as it comes down.
    const k = damp(0.9, dt);
    const pitch = framePitch(ctx, fy, camBefore.pitch);
    if (camW > 0.3) {
      roundWait -= dt;
      if (roundWait <= 0) {
        roundWait = 0.5;
        round = clearRound(ctx, behind, pitch);
      }
      cam.yaw += angleDiff(behind + round, cam.yaw) * k * camW;
    }
    cam.pitch += (pitch - cam.pitch) * k;
  }
}

/** Round from behind him (radians) the framing camera goes, so as not to stand in a tree or a wall; looked at twice a second. */
let round = 0;
let roundWait = 0;
const ROUND_TRIES = [0, 0.45, -0.45, 0.9, -0.9, 1.3, -1.3];

/**
 * The first turn round from `yaw` (`ROUND_TRIES`) from which nothing stands between the camera and him, nor in its
 * view up past him at the kite (a crown over the camera); 0 if none.
 */
function clearRound(ctx: RoamCtx, yaw: number, pitch: number): number {
  const w = ctx.world;
  const c = ctx.cam.focus;
  const hard = w.hardClearance ?? w.clearance;
  const soft = w.softClearance;
  const d = ctx.cam.distance + 1.2;
  const cp = Math.cos(pitch) * d;
  const y = c.y + Math.sin(pitch) * d;
  for (const a of ROUND_TRIES) {
    const x = c.x - Math.sin(yaw + a) * cp;
    const z = c.z - Math.cos(yaw + a) * cp;
    if ((hard?.(c.x, c.y, c.z, x, y, z) ?? 1) < 0.98) continue;
    if (soft && (soft(c.x, c.y, c.z, x, y, z, true) < 0.95 || soft(x, y, z, c.x, c.y, c.z) < 0.95)) continue;
    // (and the first 16 m of its look up towards the kite)
    const lx = kp.x - x;
    const ly = kp.y - y;
    const lz = kp.z - z;
    const u = 16 / (Math.sqrt(lx * lx + ly * ly + lz * lz) || 1);
    if (soft && soft(x, y, z, x + lx * u, y + ly * u, z + lz * u) < 0.98) continue;
    return a;
  }
  return 0;
}

/** Tries for the view while he takes it: round to either side of him (radians from behind), nearer if need be. */
const TAKE_SIDES = [0.9, -0.9, 1.3, -1.3, 0.5, -0.5];
const TAKE_VIEW = { pitch: 0.2, distance: 7.5 };

/** The first side of him from which nothing stands between the camera and him (a stall's tarp, a wall, leaves: as the shops' camera looks). */
function clearSide(ctx: RoamCtx): { side: number; pitch: number; distance: number } {
  const w = ctx.world;
  const c = ctx.cam.focus;
  const hard = w.hardClearance ?? w.clearance;
  const soft = w.softClearance;
  for (const k of [1, 0.65])
    for (const side of TAKE_SIDES) {
      const a = ctx.body.yaw + side;
      const d = TAKE_VIEW.distance * k + 1.2;
      const cp = Math.cos(TAKE_VIEW.pitch);
      const x = c.x - Math.sin(a) * cp * d;
      const y = c.y + Math.sin(TAKE_VIEW.pitch) * d;
      const z = c.z - Math.cos(a) * cp * d;
      if ((hard?.(c.x, c.y, c.z, x, y, z) ?? 1) < 0.98) continue;
      if (soft && soft(c.x, c.y, c.z, x, y, z, true) < 0.95) continue;
      return { side, pitch: TAKE_VIEW.pitch, distance: TAKE_VIEW.distance * k };
    }
  return { side: 0.5, pitch: TAKE_VIEW.pitch * 0.5, distance: TAKE_VIEW.distance * 0.6 };
}

/**
 * The camera's tilt framing the kite (`camW` of it; the rest `own`, his own tilt): up past him at it, the higher
 * it flies the more; but never down into the land behind him (a field's terraces: it would pull in onto him).
 */
function framePitch(ctx: RoamCtx, fy: number, own: number): number {
  const { cam, body } = ctx;
  const chestY = body.pos.y + 1.7 * body.scale * 0.95 * 0.86;
  const elev = Math.atan2(kp.y - chestY, Math.max(1, Math.hypot(kp.x - body.pos.x, kp.z - body.pos.z)));
  const want = -clamp(0.05 + 0.4 * elev, 0.05, 0.5) * camW + own * (1 - camW);
  const d = cam.distance;
  const c = Math.cos(want) * d;
  const g = ctx.world.field.heightAt(body.pos.x - Math.sin(cam.yaw) * c, body.pos.z - Math.cos(cam.yaw) * c);
  return Math.max(want, Math.asin(clamp((g + 1.1 - fy) / d, -1, 1)));
}

/** Sunk into a tree, a roof or the ground? (Its knot as the steps put it.) */
function caught(ctx: RoamCtx): 'tree' | 'ground' | null {
  const w = ctx.world;
  if (kp.y - w.field.heightAt(kp.x, kp.z) < 1.1) return 'ground';
  const top = kp.y + 0.7;
  const low = kp.y - 1.0;
  if (w.softClearance && w.softClearance(kp.x, top, kp.z, kp.x, low, kp.z) < 1) return 'tree';
  if (w.clearance && w.clearance(kp.x, top, kp.z, kp.x, low, kp.z) < 1) return 'tree';
  return null;
}

function snag(ctx: RoamCtx, kind: 'tree' | 'ground'): void {
  stage = 'snag';
  tau = 0;
  snagKind = kind;
  climb = false;
  rate = 0;
  const g = gear;
  if (g) {
    // (where it is, as it was drawn; lying face up on the ground)
    snagAt.copy(g.kite.shown ? g.kite.knot : kp);
    snagYaw = Math.atan2(-(kp.x - from.x), -(kp.z - from.z));
    snagPitch = kind === 'ground' ? -Math.PI / 2 + 0.08 : e + 0.45;
    if (kind === 'ground') snagAt.y = ctx.world.field.heightAt(snagAt.x, snagAt.z) + 0.12;
  }
  kp.copy(snagAt);
  if (ctx.shot) console.info(`[map] kite: ${kind === 'tree' ? 'caught in a tree' : 'down on the ground'} at ${[snagAt.x, snagAt.y, snagAt.z].map((v) => v.toFixed(1)).join(',')}`);
  ctx.hud.toast(t(kind === 'tree' ? 'kiteSnag' : 'kiteDown'));
  SFX.play(kind === 'tree' ? 'kiteTug' : 'kitePaper', 0.5);
}

function holdStep(ctx: RoamCtx, dt: number): AddonHold {
  lastCtx = ctx;
  const { body, input, cam } = ctx;
  cam.turn(input.lookYaw, input.lookPitch, input.zoom);
  camIdle = input.lookYaw || input.lookPitch ? 0 : camIdle + dt;
  if (!frozen) tau += dt;
  const w = ctx.weather ?? weatherNow();
  windDir = followWind(wind, w, windDir, dt);
  wind.k = windNow(w);
  const sw = say();
  hold.prompt = null;
  hold.mode = null;
  let speed = 0;
  let kiteW = 0;
  let behind = body.yaw;
  anchor(ctx, from);
  const downYaw = Math.atan2(wind.x, wind.z);
  switch (stage) {
    case 'take': {
      const q = KITE_HOOK.gift;
      if (takeFrom === 'gift') {
        if (giveT < 0 && !frozen) {
          q.t = tau;
          if (q.giving) giveT = tau;
          else if (tau > GIFT_WAIT) {
            giveT = tau;
            alone = true;
          }
        }
        // He faces the son once he comes up (the grandfather before).
        const g = KITE_HOOK.giver;
        const tx = q.giving ? q.hx : g.x;
        const tz = q.giving ? q.hz : g.z;
        turnTo(ctx, Math.atan2(tx - body.pos.x, tz - body.pos.z), 5, dt);
      } else {
        if (giveT < 0 && !frozen && tau >= 0.45) giveT = tau;
        if (stall) turnTo(ctx, stall.spot.facing, 5, dt);
      }
      const g = giveT < 0 ? -1 : tau - giveT;
      // (he reaches out; takes it; holds it up and looks at it; puts it away)
      want.take = g >= 0 && g < G_LOOK ? 1 : takeFrom === 'buy' && g < 0 ? 0.35 : 0;
      want.look = g >= G_LOOK && g < G_AWAY ? 1 : 0;
      if (takeFrom === 'gift' && g >= G_LOOK) q.t = -1;
      else if (takeFrom === 'gift' && giveT >= 0) q.t = tau;
      if (g >= G_TAKE && g - dt < G_TAKE) SFX.play('kitePaper', 0.7);
      if (g >= G_AWAY && g - dt < G_AWAY) SFX.play('kitePaper', 0.5);
      if (g >= G_DONE) {
        gotIt(ctx);
        finish(ctx);
        return hold;
      }
      break;
    }
    case 'launch': {
      const upYaw = downYaw + Math.PI;
      // Into the wind, the kite held up past his right shoulder; a few running steps; let go; then round to face it.
      turnTo(ctx, tau < L_RUN_END ? upYaw : downYaw, tau < L_RUN_END ? 8 : 4.5, dt);
      const v = RUN_V * (body.scale / 1.4) * smooth((tau - L_TURN) / 0.3) * (1 - smooth((tau - (L_RUN_END - 0.45)) / 0.45));
      if (v > 0.05 && tau < L_RUN_END && stepBy(ctx, Math.sin(body.yaw) * v * dt, Math.cos(body.yaw) * v * dt, false)) speed = v;
      want.hold = tau < L_RELEASE + 0.15 ? 1 : 0;
      want.fly = tau < L_RELEASE + 0.15 ? 0 : 1;
      if (tau >= L_RELEASE) {
        if (tau - dt < L_RELEASE) SFX.play('kiteWhoosh', 0.9);
        // (from his hand: it leaves it where he held it)
        const u = smooth((tau - L_RELEASE) / (L_TURNED - L_RELEASE));
        L = 0.5 + 10.5 * u;
        e = 0.18 + 0.45 * u;
        out = 0.2 + 0.6 * u;
        kiteW = 1;
      } else kiteW = 0.6;
      kiteAt(from, kp);
      behind = downYaw;
      SFX.level('kiteFlutter', tau < L_RELEASE ? 0.5 * wind.k : 0.7 * (1 - smooth((tau - L_RELEASE) / 2)));
      SFX.level('kiteLine', tau >= L_RELEASE ? 0.6 : 0);
      if (tau >= L_TURNED) {
        stage = 'fly';
        tau = 0;
        climb = true;
        out = 0.8;
      }
      break;
    }
    case 'fly': {
      if (!kiteWeather(w)) {
        // (rain or snow: he brings it in at once)
        ctx.hud.toast(t('kiteRainIn'));
        startReel(false);
        break;
      }
      const k = wind.k;
      const amount = Math.min(1, Math.hypot(input.move.x, input.move.y));
      const walking = input.run && amount > 0.2;
      let r = 0;
      let steer = 0;
      if (!walking) {
        r = input.move.y > 0.12 ? LET_OUT * input.move.y : input.move.y < -0.12 ? REEL * input.move.y : 0;
        steer = -input.move.x;
      }
      if (climb) {
        r = Math.max(r, 4);
        if (L >= LINE_START) climb = false;
      }
      if (r > 0 && L >= LINE_MAX - 0.01) {
        r = 0;
        if (!maxSaid && input.move.y > 0.12) {
          maxSaid = true;
          ctx.hud.toast(t('kiteMax'));
        }
      }
      rate += (r - rate) * damp(8, dt);
      L = clamp(L + rate * dt, LINE_MIN, LINE_MAX);
      // Steering: across the wind (lower at the sides); the roll leans into the turn.
      const sideWant = steer * STEER;
      side += (sideWant - side) * damp(1.3, dt);
      roll += (0.6 * (sideWant - side) - roll) * damp(3, dt);
      // His walk (slow, the kite follows): into the wind it climbs, with it it sinks.
      let along = 0;
      if (walking) {
        const fx = Math.sin(cam.yaw);
        const fz = Math.cos(cam.yaw);
        let wx = fx * input.move.y - fz * input.move.x;
        let wz = fz * input.move.y + fx * input.move.x;
        const l = Math.hypot(wx, wz) || 1;
        wx /= l;
        wz /= l;
        const v = WALK_V * (body.scale / 1.4) * amount;
        if (stepBy(ctx, wx * v * dt, wz * v * dt, true)) {
          speed = v;
          along = -(wx * wind.x + wz * wind.z) * amount;
        }
        turnTo(ctx, Math.atan2(wx, wz), 6, dt);
      } else turnTo(ctx, Math.atan2(kp.x - body.pos.x, kp.z - body.pos.z), 3, dt);
      const eWant = holdAngle(k) - 0.12 * Math.max(0, rate) / LET_OUT + 0.06 * Math.max(0, -rate) / REEL + (along > 0 ? 0.07 : 0.12) * along;
      e += (eWant - e) * damp(k < LIFT ? 0.35 : 0.8, dt);
      out += (1 - out) * damp(1.5, dt);
      kiteAt(from, kp);
      kiteW = 1;
      behind = Math.atan2(kp.x - body.pos.x, kp.z - body.pos.z);
      ps.work = clamp(rate / LET_OUT, -1, 1);
      ps.steer = clamp(steer, -1, 1);
      SFX.level('kiteLine', clamp(Math.abs(rate) / LET_OUT, 0, 1));
      SFX.level('kiteFlutter', L < 14 ? 0.5 * (1 - L / 14) : 0);
      // Sunk into a tree or onto the ground: caught (looked at a few times a second).
      snagWait -= dt;
      if (snagWait <= 0) {
        snagWait = 0.15;
        const c = caught(ctx);
        if (c) {
          snag(ctx, c);
          break;
        }
      }
      if (input.use) startReel(false);
      hold.prompt = sw.flying;
      break;
    }
    case 'snag': {
      kp.copy(snagAt);
      kiteW = 1;
      behind = Math.atan2(kp.x - body.pos.x, kp.z - body.pos.z);
      turnTo(ctx, behind, 3, dt);
      ps.work = 0;
      ps.steer = 0;
      L = from.distanceTo(snagAt);
      e = Math.asin(clamp((snagAt.y - from.y) / Math.max(0.1, L), -1, 1));
      // (keep the drag's way: the snag's own bearing)
      const bx = snagAt.x - from.x;
      const bz = snagAt.z - from.z;
      const cs = (bx * wind.x + bz * wind.z) / Math.max(1e-3, Math.hypot(bx, bz));
      const sn = (bx * wind.z - bz * wind.x) / Math.max(1e-3, Math.hypot(bx, bz));
      side = Math.atan2(sn, cs);
      if (input.use || input.move.y < -0.3) {
        // A tug frees it.
        SFX.play('kiteTug', 0.8);
        startReel(true);
      }
      hold.prompt = sw.reel;
      break;
    }
    case 'reel': {
      L -= (dragged ? REEL : REEL_IN) * dt;
      rate = -(dragged ? REEL : REEL_IN);
      if (!dragged) {
        e += (Math.min(0.95, holdAngle(Math.max(wind.k, LIFT)) + 0.1) - e) * damp(0.8, dt);
        side += -side * damp(1, dt);
      } else e = dragE;
      roll += -roll * damp(3, dt);
      out = clamp((L - 2) / 10, 0.15, 1);
      kiteAt(from, kp);
      kiteW = L > 6 ? 1 : 0.5;
      behind = Math.atan2(kp.x - body.pos.x, kp.z - body.pos.z);
      turnTo(ctx, behind, 3, dt);
      ps.work = -1;
      ps.steer = 0;
      SFX.level('kiteLine', 0.9);
      SFX.level('kiteFlutter', L < 12 ? 0.55 * (1 - L / 12) : 0);
      if (L <= 2.2) {
        stage = 'fold';
        tau = 0;
        rate = 0;
        SFX.level('kiteLine', 0);
        SFX.level('kiteFlutter', 0);
        SFX.play('kitePaper', 0.7);
      }
      break;
    }
    case 'fold': {
      want.fly = 0;
      want.fold = tau < FOLD - 0.25 ? 1 : 0;
      ps.work = 0;
      if (tau >= FOLD) {
        finish(ctx);
        return hold;
      }
      break;
    }
    default:
      break;
  }
  if (stage === 'fly' || stage === 'snag' || stage === 'reel') {
    want.fly = 1;
    want.hold = want.take = want.look = want.fold = 0;
  }
  poseStep(ctx, dt, speed);
  body.vel.set(0, 0, 0);
  camStep(ctx, dt, kiteW, behind);
  return hold;
}

// ── Drawing (every frame) ──

/** The kite where the stage has it, and its line from his real fist. */
function draw(f: MapFrame): void {
  const g = gear;
  if (!g || !env) return;
  const k = g.kite;
  const n = Math.min(1, Math.max(0, (f.night - 0.25) / 0.35));
  k.light(1 - n * n * (3 - 2 * n));
  if (stage === 'none') {
    k.hide();
    g.hideLine();
    return;
  }
  const x = env.explorer;
  x.rig.joints.propR.getWorldPosition(fist);
  const now = f.t;
  const body = env.body;
  const back = body.yaw + Math.PI;
  // Gusts make it dance: a bob, a swing, a roll (more in a gusty wind).
  const gust = Math.max(0, Math.sin((now * Math.PI * 2) / 7.3 + 1.1) * Math.sin((now * Math.PI * 2) / 4.1)) * (0.6 + 0.8 * (f.weather?.wind ?? 0));
  const eD = 0.05 * gust * Math.sin(now * 2.7) + 0.015 * Math.sin(now * 0.8);
  const sD = 0.09 * gust * Math.sin(now * 1.9 + 1) + 0.03 * Math.sin(now * 0.37 + 2);
  const rD = 0.35 * gust * Math.sin(now * 3.3) + 0.06 * Math.sin(now * 0.9);
  switch (stage) {
    case 'take': {
      const q = KITE_HOOK.gift;
      const gT = giveT < 0 ? -1 : tau - giveT;
      if (gT < 0 || ((alone || takeFrom === 'buy') && gT < 0.6) || (takeFrom === 'gift' && !alone && gT < G_HAND && !q.giving)) {
        k.hide();
        break;
      }
      const away = 1 - smooth((gT - G_AWAY) / (G_DONE - G_AWAY));
      if (takeFrom === 'gift' && !alone && gT < G_HAND) {
        // In the son's hands, its face to the explorer; then over into his.
        const u = smooth((gT - G_TAKE) / (G_HAND - G_TAKE));
        const hx = q.hx + (fist.x - q.hx) * u;
        const hy = q.hy + (fist.y - q.hy) * u;
        const hz = q.hz + (fist.z - q.hz) * u;
        k.hold(hx, hy, hz, Math.atan2(body.pos.x - q.hx, body.pos.z - q.hz), 0.15, 0, now, 0.55, 0.2);
      } else k.hold(fist.x, fist.y, fist.z, back, 0.2, 0.03 * Math.sin(now * 1.3), now, 0.55, 0.2, Math.max(0.05, away));
      if (away < 0.06) k.hide();
      break;
    }
    case 'launch':
      if (tau < L_RELEASE) {
        // Held up by its spine past his right shoulder, its face into the wind (the way he runs).
        k.hold(fist.x, fist.y, fist.z, body.yaw, 0.35, 0.05 * Math.sin(now * 3), now, 1.2, 0.6);
        g.hideLine();
      } else {
        k.flyAt(fist.x, fist.y, fist.z, wind, L, e + eD * out, side + sD * out, roll + rD * out, out, now);
        g.line(fist.x, fist.y, fist.z, L * 0.08, f.night);
      }
      break;
    case 'fly':
    case 'reel': {
      k.flyAt(fist.x, fist.y, fist.z, wind, L, e + (dragged ? 0 : eD), side + (dragged ? 0 : sD), roll + (dragged ? 0 : rD), out, now);
      const slack = stage === 'reel' ? 0.03 : Math.max(0, rate) > 0.5 ? 0.025 : 0;
      g.line(fist.x, fist.y, fist.z, L * (0.065 - 0.035 * wind.k + slack), f.night);
      break;
    }
    case 'snag':
      k.hold(snagAt.x, snagAt.y, snagAt.z, snagYaw, snagPitch, snagKind === 'tree' ? 0.5 : 0.1, now, snagKind === 'tree' ? 2.2 : 1.5, snagKind === 'tree' ? 0.25 : 0);
      g.line(fist.x, fist.y, fist.z, L * 0.025, f.night);
      break;
    case 'fold': {
      const away = 1 - smooth((tau - (FOLD - 0.3)) / 0.3);
      k.hold(fist.x, fist.y, fist.z, back, 0.25, 0, now, 0.55 * (1 - smooth(tau / FOLD)), 0.15, Math.max(0.05, away));
      if (away < 0.06) k.hide();
      g.hideLine();
      break;
    }
    default:
      break;
  }
  // Its bow hums high up (the khleng ek's song, audio/kite.ts: as the people's kites call it).
  if ((stage === 'fly' || stage === 'reel') && f.dt > 0 && !env.shot && now >= humAt) {
    const high = k.mid.y - env.world.field.heightAt(k.mid.x, k.mid.z);
    if (high > HUM_HIGH && L > 16) {
      humAt = now + HUM_EVERY;
      const blow = clamp((wind.k - 0.4) / 0.5, 0, 1);
      f.calls.push({ kind: 'kiteHum', x: k.mid.x, y: k.mid.y, z: k.mid.z, gain: (0.3 + 0.45 * blow) * Math.min(1, (high - HUM_HIGH) / 14), size: HIS_VOICE });
      if (!humSaid && stage === 'fly') {
        humSaid = true;
        env.hud.toast(t('kiteHum'));
      }
    }
  }
}

registerAddon({
  id: 'kite',
  order: ORDER,
  get holding() {
    return stage !== 'none';
  },
  get handsBusy() {
    return stage !== 'none';
  },

  keys() {
    return stage === 'fly' || stage === 'launch' ? FLY_KEYS : stage === 'snag' ? SNAG_KEYS : null;
  },

  init(e0) {
    env = e0;
    have = progress.get(HAVE_KEY, false, (v): v is boolean => typeof v === 'boolean');
    const held = Number(e0.params.get('kitewind'));
    windHeld = e0.params.has('kitewind') && Number.isFinite(held) ? clamp(held, 0, 1) : null;
  },

  offer(ctx, mode) {
    lastCtx = ctx;
    // (not while something else has him or his hands: praying, resting, at a stall, the camera up, the umbrella…)
    // (nor under the buy card: it asks, the E there is its own)
    if (mode !== 'walk' || stage !== 'none' || !env || env.busy() || addonHands() || !ctx.body.grounded || card?.open) return null;
    const p = ctx.body.pos;
    const sw = say();
    if (!have) {
      const g = KITE_HOOK.giver;
      if (g.out && (p.x - g.x) ** 2 + (p.z - g.z) ** 2 < GIVER_REACH * GIVER_REACH && Math.abs(p.y - g.y) < 2.5) return sw.ask;
      // (the market's kites: made as he comes near, if the camera has not been there yet)
      if (!stallTried && nearMarket(p.x, p.z)) ensureGear();
      if (stall?.near(p.x, p.y, p.z, clockNow())) return sw.buy;
      return null;
    }
    // Only where and when it really flies: fair weather, the kite season's wind aloft, a field for it.
    const w = ctx.weather ?? weatherNow();
    if (!kiteWeather(w)) return null;
    if (windNow(w) < LIFT) {
      seasonHint(ctx);
      return null;
    }
    return flyHere(ctx) ? sw.fly : null;
  },

  use(ctx) {
    lastCtx = ctx;
    if (!have) {
      const p = ctx.body.pos;
      const g = KITE_HOOK.giver;
      if (g.out && (p.x - g.x) ** 2 + (p.z - g.z) ** 2 < GIVER_REACH * GIVER_REACH) startTake(ctx, 'gift');
      else if (stall?.near(p.x, p.y, p.z, clockNow())) askBuy(ctx);
      return;
    }
    const w = ctx.weather ?? weatherNow();
    if (!kiteWeather(w)) {
      ctx.hud.toast(t('kiteWet'));
      return;
    }
    if (windNow(w) < LIFT) {
      ctx.hud.toast(t('kiteCalm'));
      return;
    }
    startLaunch(ctx);
  },

  hold(ctx, dt) {
    return holdStep(ctx, dt);
  },

  after(ctx, mode, dt) {
    lastCtx = ctx;
    // (after a flight: the camera eases back to his own view, its usual tilt range)
    if (stage === 'none' && camBefore && mode === 'walk') {
      const cam = ctx.cam;
      camW += -camW * damp(2, dt);
      cam.pitch += (camBefore.pitch - cam.pitch) * damp(1.5, dt);
      cam.distance += (camBefore.distance - cam.distance) * damp(1.5, dt);
      if (Math.abs(camBefore.pitch - cam.pitch) < 0.01 && Math.abs(camBefore.distance - cam.distance) < 0.05) {
        cam.pitchMin = camBefore.pitchMin;
        camBefore = null;
        camW = 0;
      }
    }
  },

  frame(f) {
    season = f.season;
    clock = f.clock;
    night = f.night;
    // (the market's kites are drawn once the camera comes near the market: the gear then, not before)
    if (!gear && env && (have || stage !== 'none' || nearMarket(f.camera.position.x, f.camera.position.z))) ensureGear();
    // (his own kite's twin leaves the pole once he has paid for it)
    const market = stall?.frame(f, have || (stage === 'take' && takeFrom === 'buy')) ?? false;
    draw(f);
    // (the buy card shut: the seller stops waiting for him)
    if (browsing && card && !card.open) {
      browsing = false;
      browse(f.t, null);
    }
    // (nothing out — no kite, no stall in view —: no draw at all)
    gear?.flush(night, market || stage !== 'none');
  },

  setMode(next, _prev, ctx) {
    if (next === 'walk') return;
    // (out of the walk — back to the map, a saved view's start: the kite goes at once)
    if (stage !== 'none') finish(ctx);
    if (card?.open) card.close();
    if (camBefore) {
      ctx.cam.pitchMin = camBefore.pitchMin;
      camBefore = null;
    }
    camW = 0;
  },

  fromUrl(q, ctx) {
    const v = q.get('kite');
    if (!v) return;
    urlCam = q.has('rcam');
    framing = !urlCam;
    const [what, arg = ''] = v.split(':');
    const num = Number(arg);
    if (what !== 'gift' && what !== 'buy' && what !== 'bought') have = true;
    if (what === 'fly' || what === 'snag' || what === 'down') {
      startFlying(ctx, what === 'fly' && Number.isFinite(num) && arg ? num : 30, Number(q.get('kiteside')) || 0);
      if (what !== 'fly') {
        // (caught where the report says, `kite=snag:x,y,z`; else where the flight would be, or on the ground under it)
        const at = arg.split(',').map(Number);
        if (at.length === 3 && at.every(Number.isFinite)) kp.set(at[0], at[1], at[2]);
        if (what === 'down') kp.y = ctx.world.field.heightAt(kp.x, kp.z) + 0.5;
        snag(ctx, what === 'down' ? 'ground' : 'tree');
      }
    } else if (what === 'gift' || what === 'bought') {
      have = false;
      startTake(ctx, what === 'gift' ? 'gift' : 'buy');
      // (a still of that moment of the hand-over, `s` s after it is held out to him (< 0: before): its time stands)
      tau = 10;
      giveT = Number.isFinite(num) && arg && num >= 0 ? tau - num : -1;
      frozen = true;
      if (what === 'gift') KITE_HOOK.gift.t = tau;
    } else if (what === 'buy') {
      ensureGear();
      if (stall) askBuy(ctx);
    }
  },

  report() {
    if (stage === 'fly' || stage === 'launch' || stage === 'reel') {
      const h = Math.max(4, kp.y - (env ? env.body.pos.y + 1.6 * (env.body.scale / 1.4) : kp.y));
      return { kite: `fly:${h.toFixed(0)}`, ...(Math.abs(side) > 0.1 ? { kiteside: side.toFixed(2) } : {}) };
    }
    if (stage === 'snag') return { kite: `${snagKind === 'tree' ? 'snag' : 'down'}:${[snagAt.x, snagAt.y, snagAt.z].map((v) => v.toFixed(1)).join(',')}` };
    return have ? { kite: 'have' } : null;
  },
});

/** (x, z) near the morning market (its kites for sale are drawn while the camera is within 160 m of their stall). */
function nearMarket(x: number, z: number): boolean {
  return (x - MARKET.x) ** 2 + (z - MARKET.z) ** 2 < 200 * 200;
}
