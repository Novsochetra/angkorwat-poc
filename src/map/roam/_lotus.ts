import { Vector3, type Group, type Object3D } from 'three';
import type { AngkorExplorer } from '../../character/AngkorExplorer';
import type { Pose } from '../../character/pose';
import { buildLotus, LAY_KNEEL, lotusLayPose, lotusLayState, lotusPickPose, lotusPickState, LOTUS_STEM } from '../../character/lotus';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { BODY_UNIT_M } from '../../world/scale';
import '../audio/_lotus';
import { SFX } from '../audio/addonSfx';
import { PLACES } from '../layout';
import { progress } from '../progress';
import type { MapFrame, RoamMode } from '../types';
import { num, onLang, placeText, t, type WordKey } from '../ui/lang';
import { addonBusy, addonHands, BEFORE_SHRINE, registerAddon, type AddonEnv } from './_addons';
import { SEAT } from './_boatModel';
import { BED, BED_SEEN, createLotusBed, type LotusBed, type LotusBud } from './_lotusBed';
import { createLaidLotus, type LaidLotus } from './_lotusLaid';
import { LOTUS_HOOK } from './_lotusHook';
import { shrine } from './_pray';
import { bagNotify, KEEPSAKES } from './_shopBag';
import { ICON_OF, OWN } from './_shopIcons';
import { CARRY_MAX, type Kept } from './_shopPurse';
import { WORSHIP, type WorshipSpot } from './_worship';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * A lotus picked from the boat and offered at a shrine (add-on `lotus`):
 *
 * - **Picking**: in the boat, slow or still, beside the lotus bed in the
 *   great lake off the floating village's south end (roam/_lotusBed.ts: pink
 *   buds standing over round leaves), "E  បេះផ្កាឈូក / Pick a lotus" (no
 *   prompt while fishing, the camera or the phone up, the album open). The
 *   boat comes alongside the nearest bud (it glides at most ~2 m, keeping its
 *   heading), he lays the paddle across his lap, leans out over that side
 *   (the hull dipping with him), reaches down, takes the stem and snaps it (a
 *   ring spreads on the water, drops fall), brings the lotus up out to that
 *   side, looks at it with a smile and puts it in his bag (≈ 3.3 s;
 *   character/lotus.ts). That bud is gone for the visit (the stub and the
 *   leaves stay). The stick or E while he reaches: he sits back, nothing
 *   picked. The camera comes round to that side a little and back.
 * - **In his bag**: a keepsake (roam/_shopBag.ts `KEEPSAKES`, as the rice for
 *   the monks): never eaten (6 eats the first thing that is food), its button
 *   in "In my bag" says what it is for; up to the bag's 3 (full: a toast, no
 *   picking). Kept between visits with the bag (the purse's own saving).
 * - **Offering**: at any shrine (roam/_worship.ts, the walker's "E  Pray")
 *   with a lotus in his bag the prompt is "E  ថ្វាយផ្កាឈូក ហើយថ្វាយបង្គំ / Offer
 *   a lotus and pray" (offered before the shrine's own: `order` ≤
 *   `BEFORE_SHRINE`); E: he walks onto the shrine's golden lotus, turns and
 *   kneels as the prayer does (roam/_pray.ts, the same E), and once both knees
 *   are down the prayer waits (`prayClock`: held at `LAY_KNEEL`) while he takes
 *   the lotus from his bag, bows forward a little to his right and lays it on
 *   the floor before him on that side (clear of the bows' hands and head), the
 *   bud toward the shrine, his left hand under his right forearm; he sits
 *   up and the prayer goes on (the sampeah, three bows). The lotus stays where
 *   he laid it for the visit (roam/_lotusLaid.ts, smooth like the altar
 *   offerings), a few side by side. A toast "You offered a lotus at Angkor
 *   Wat"; counted in progress.ts `lotus.offered`. Getting up meanwhile (E, the
 *   stick) before it is laid keeps it in his bag. Visak Bochea's procession
 *   lays his own lotus with the candle (roam/_lotusHook.ts).
 *
 * URL (checks), `lotus=` one or more of, in order (`have:2,offer`):
 * `have:<n>` n lotuses in his bag · `near` (with `roam=boat&at=` by the bed)
 * the boat beside the nearest bud, its prompt · `pick` / `pick:<s>` picking it
 * (s s in: 1.15 the snap, 2 looking at it) · `offer` / `offer:<s>` (on foot at
 * a shrine: `at=` its spot, or `kneelat=`) kneeling, laying it (0.3 it is in
 * his hand, 1.2 bowing, 1.8 laid) · `laid` one lying before the shrine nearest
 * him; `lotuspicked=<i,…>|all` buds gone. A shot without `sim=` counts its
 * 0.8 s of settling into `<s>`. `report()` gives them back.
 */

const ID = 'lotus';
/** The lotus's item id in his bag (a keepsake), and the "shop" it is from (none sells it: he picks it). */
const LOTUS_ID = 'lotusBud';
const FROM = 'lotus-bed';

/** Metres per body unit of him on the map (his size: `ROAM_SCALE`). */
const BU = BODY_UNIT_M;

// ── Picking: where a bud can be reached, the timeline ─────────────────────

/** A bud can be picked from the boat while it is this far beside the boat's middle line (m) and along it from his seat (m). */
const SIDE_NEAR = 0.45;
const SIDE_FAR = 2.5;
const ALONG = [-1.5, 1.7] as const;
/** The boat no faster than this (m/s), the glide no longer than this (m). */
const SLOW = 1.4;
const GLIDE_MAX = 2.4;
/** Where the bud ends up, alongside: out from the middle line (m at his size 1.4), along the boat from his seat (m). */
const LAT = 0.86;
const FORE = 0.28;
/** The timeline (s): the glide, the reach, the grip and its tug, the snap, up to his chest, looking at it, away into his bag, the paddle back. */
const P = { glide: 0.8, leanIn: [0.05, 0.85], lapIn: [0, 0.5], armIn: [0.2, 0.95], tug: [1.03, 1.15], snap: 1.15, lift: [1.15, 1.85], look: [1.85, 2.45], stow: [2.45, 2.95], lapOut: [2.75, 3.25], armOut: [2.8, 3.25], end: 3.3 } as const;
/** The hull dips toward him this much at full lean (radians). */
const ROLL = 0.07;
/** Sitting back after leaving off (s). */
const BACK = 0.5;
/**
 * Held up out to that side and ahead, looking at it (his head is big: in front of his face it would hide it); by his
 * hip, putting it away (BU, his space in the boat, `x` toward the side he reaches).
 */
const SHOW = new Vector3(3.4, 11.4, 2.2);
const SHOW_DIR = new Vector3(0.4, 0.84, 0.36).normalize();
const STOW = new Vector3(4.6, 6.4, -7.2);
const STOW_DIR = new Vector3(0.2, 0.5, -0.84).normalize();
/** The camera while he picks: round to that side and a little behind (his arm going down to the bud, the bed beyond), low and nearer; eased there over the reach. */
const FRAME = { side: 1.15, pitch: 0.16, distance: 5.2, rate: 2.2, until: 1.8, back: 1.8 };

// ── Offering: where he lays it ─────────────────────────────────────────────

/**
 * How far before him he lays it (m at his size 1.4: his fist's middle), to his right (m: his right hand lays it, and
 * the prayer's bows put his hands and his head before him), the floor no more than this off his own (m).
 */
const LAY_AHEAD = 0.46;
const LAY_RIGHT = 0.6;
const LAY_FLOOR = 0.32;
/** Setting it down, he bows this much further (a share of the bow). */
const LAY_DOWN = 0.14;
/** Laid ones beside each other: this far apart (m). */
const LAY_APART = 0.17;
/** The timeline (s): out of his bag, the bow forward, laid (let go), up again. */
const L = { take: [0, 0.5], lean: [0.5, 1.45], support: [0.6, 1.15], down: [1.45, 1.8], release: 1.8, back: [1.85, 2.55], end: 2.6 } as const;
/** The fist before his chest as he takes it out, the lotus pointing up and ahead (BU, his space on the floor kneeling). */
const HOLD = new Vector3(-2.2, 8.2, 4.4);
const HOLD_DIR = new Vector3(0, 0.75, 0.66).normalize();
/** The camera while he lays it: from his side (either) and behind, a little above, near; back behind him (the prayer's view) as he sits up. */
const LAY_FRAME = { side: 0.85, pitch: 0.34, distance: 5, rate: 2.4, back: { pitch: 0.04, distance: 4.5 } };
/** E said "pray with a lotus": waiting for him to kneel, this long at most (s). */
const PENDING_FOR = 12;

// ── Helpers ────────────────────────────────────────────────────────────────

const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const ramp = (s: number, [a, b]: readonly [number, number]) => smooth((s - a) / (b - a));
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A point on the map in his space (BU, his feet at the origin, +z the way he faces), into `out`. */
function toBody(ctx: RoamCtx, x: number, y: number, z: number, out: Vector3): Vector3 {
  const b = ctx.body;
  const k = 1 / (BU * b.scale);
  const dx = x - b.pos.x;
  const dz = z - b.pos.z;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return out.set((c * dx - s * dz) * k, (y - b.pos.y) * k, (s * dx + c * dz) * k);
}
/** A direction on the map in his space (unit stays unit), into `out`. */
function dirToBody(ctx: RoamCtx, x: number, y: number, z: number, out: Vector3): Vector3 {
  const c = Math.cos(ctx.body.yaw);
  const s = Math.sin(ctx.body.yaw);
  return out.set(c * x - s * z, y, s * x + c * z);
}

/**
 * The prayer's clock: the Animator's playing action (Animator.ts keeps it to itself; read only here, its shape
 * checked): held at the kneel while he lays the lotus, so the prayer's own timing (the hat, the bell, the flat
 * hands, the bows) simply waits. Null when the prayer is not playing (or the Animator keeps it some other way).
 */
function prayClock(ex: AngkorExplorer): { t: number } | null {
  const a = (ex.animator as unknown as { action?: { name?: unknown; t?: unknown; stopping?: unknown } | null }).action;
  return a && a.name === 'pray' && typeof a.t === 'number' && !a.stopping ? (a as { t: number }) : null;
}

/** The place a worship spot belongs to, in a sentence ("at Angkor Wat", "at the forest Buddha"). */
const SPOT_WORDS: Record<string, WordKey> = {
  'village-pagoda-door': 'lotusAtPagoda',
  'jungle-forest-buddha': 'lotusAtForest',
  'jungle-lake-shrine': 'lotusAtLake',
  'jungle-kulen-shrine': 'lotusAtKulen',
  'jungle-spirit-house': 'lotusAtSpirit',
};
function placeOf(spot: WorshipSpot | null): string {
  const p = spot?.place ? PLACES.find((q) => q.id === spot.place) : undefined;
  if (p) return placeText(p).name;
  return t((spot && SPOT_WORDS[spot.id]) || 'lotusAtShrine');
}

// ── The add-on ─────────────────────────────────────────────────────────────

type PickStep = 'off' | 'pick' | 'back';
type LayStep = 'off' | 'lay';

let env: AddonEnv | null = null;
let bed: LotusBed | null = null;
let bedQueued = false;
let laid: LaidLotus | null = null;
/** The lotus in his hand (built the first time), the slot it is in now, its size. */
let hand: Group | null = null;
let handIn: 'propL' | 'propR' | null = null;

// Picking.
let pick: PickStep = 'off';
let st = 0;
let bud: LotusBud | null = null;
const ps = lotusPickState();
const from = new Vector3();
const to = new Vector3();
let snapped = false;
/** The boat's own posture while he picks (its pose under ours). */
let base: ((t: number) => Pose) | null = null;
let paddle: Object3D | null = null;
let ride: Object3D | null = null;
/** The camera: before (to go back to), its follow, framed or the player's now. */
let camBefore: { pitch: number; distance: number; follow: number } | null = null;
let camFree = false;
let camYaw = 0;
/** This step's input, kept before tools.ts stills it (the look goes on; the stick or E leaves off). */
const look = { yaw: 0, pitch: 0, zoom: 0, push: 0, use: false };
let smiled = false;

// Offering.
let lay: LayStep = 'off';
let lt = 0;
let pending: { spot: WorshipSpot; t: number } | null = null;
let laySpot: WorshipSpot | null = null;
const ls = lotusLayState();
/** Where it is laid (the fist's middle on the floor), the way the bud points (yaw), the floor. */
const layAt = new Vector3();
let layYaw = 0;
let released = false;
let layCam: { yaw: number; free: boolean } | null = null;
/** His boat's hull on the water this frame (for the bed: what stands under it shrinks away). */
const hull = { x: 0, z: 0, yaw: 0, s: 1 };
/** A toast to give a moment later (s from now). */
let later: { text: string; in: number } | null = null;
/** URL: a check's start of the offering `s` s in (after the kneel); of the pick. */
let urlLay: number | null = null;

/** The prompts (made again when the language changes). */
let pPick = '';
let pOffer = '';
const words = () => {
  pPick = `E  ${t('lotusPick')}`;
  pOffer = `E  ${t('lotusOffer')}`;
};
words();
onLang(words);

/**
 * Its picture in his bag (roam/_shopIcons.ts, 16 × 16 like the others): a closed pink bud upright, deeper pink at the
 * tip, a pale foot in its green cup, the stem down, a leaf curling off it.
 */
OWN.lotusBud = () => [
  ['#3f7a2e', [9, 12, 3, 1], [10, 11, 4, 1], [12, 10, 3, 1], [11, 13, 2, 1]],
  ['#5d8f3c', [8, 9, 1, 7]],
  ['#6f9a3c', [7, 8, 3, 1]],
  ['#f6c4d2', [7, 7, 3, 1], [6, 6, 5, 1]],
  ['#f08ab0', [6, 2, 5, 4], [5, 3, 7, 3], [7, 1, 3, 1]],
  ['#f6b0c8', [6, 3, 1, 3], [7, 2, 1, 1]],
  ['#e8729c', [8, 2, 1, 4], [10, 4, 1, 2]],
  ['#c8406c', [8, 0, 1, 2], [7, 1, 1, 1], [9, 1, 1, 1]],
];
ICON_OF[LOTUS_ID] = 'lotusBud';

/** The lotus as it goes in his bag. */
const keptLotus = (): Kept => ({ shop: FROM, id: LOTUS_ID, name: { km: 'ក្រពុំផ្កាឈូក', en: 'Lotus bud' }, consume: 'sweet', colors: [0xf08ab0, 0x5d8f3c] });

/** Lotuses in his bag; where the first is (−1: none). */
function lotuses(): number {
  let n = 0;
  for (const k of env?.purse.kept ?? []) if (k.id === LOTUS_ID) n++;
  return n;
}
function lotusAt(): number {
  const kept = env?.purse.kept ?? [];
  for (let i = 0; i < kept.length; i++) if (kept[i].id === LOTUS_ID) return i;
  return -1;
}

/** The bed, built now (a check, or he is near), else queued for idle time. */
function makeBed(now: boolean): void {
  if (bed || !env) return;
  if (!now) {
    if (bedQueued) return;
    bedQueued = true;
    const go = () => makeBed(true);
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 2500 });
    else setTimeout(go, 200);
    return;
  }
  const t0 = performance.now();
  bed = createLotusBed(env.world);
  env.scene.add(bed.object);
  console.info(`[map] lotus bed: ${bed.buds.length} buds, ${bed.blocks} blocks in ${(performance.now() - t0).toFixed(1)} ms`);
}

/** The lotus in his `slot` hand (null: none), at `size` (0‥1: it grows out of his bag and shrinks into it). */
function holdLotus(slot: 'propL' | 'propR' | null, size = 1): void {
  const e = env;
  if (!e) return;
  if (slot && !hand) hand = buildVoxelMesh(buildLotus(), { quality: e.explorer.rig.quality, castShadow: true, name: 'lotus:hand' });
  if (slot !== handIn) {
    if (handIn) e.explorer.rig.clearSlot('lotusHand');
    if (slot && hand) e.explorer.rig.setSlotObject('lotusHand', slot, hand);
    handIn = slot;
  }
  if (hand) hand.scale.setScalar(Math.max(0.001, size));
}

/** The bud the boat can come alongside now (none picked, within reach of a short glide), nearest first; its boat-space place. */
function budNear(ctx: RoamCtx): LotusBud | null {
  if (!bed) return null;
  const b = ctx.body;
  const s = b.scale;
  if (Math.hypot(b.pos.x - BED.x, b.pos.z - BED.z) > BED.r + 6) return null;
  const c = Math.cos(b.yaw);
  const sn = Math.sin(b.yaw);
  const seat = SEAT.z * s;
  let best: LotusBud | null = null;
  let bd = Infinity;
  for (const u of bed.buds) {
    if (u.picked) continue;
    const dx = u.x - b.pos.x;
    const dz = u.z - b.pos.z;
    const side = c * dx - sn * dz;
    const along = sn * dx + c * dz - seat;
    const a = Math.abs(side);
    if (a < SIDE_NEAR * (s / 1.4) || a > SIDE_FAR * (s / 1.4) || along < ALONG[0] || along > ALONG[1]) continue;
    const glide = Math.hypot(a - LAT * (s / 1.4), along - FORE);
    if (glide > GLIDE_MAX || glide >= bd) continue;
    if (!open(ctx, u, Math.sign(side) || 1)) continue;
    bd = glide;
    best = u;
  }
  return best;
}

/** Where the boat comes to for bud `u` on `side` (into `out`): it keeps its heading. */
function alongside(ctx: RoamCtx, u: LotusBud, side: number, out: Vector3): Vector3 {
  const b = ctx.body;
  const s = b.scale / 1.4;
  const c = Math.cos(b.yaw);
  const sn = Math.sin(b.yaw);
  // (the bud at (side · LAT, FORE from the seat) in boat space: the boat's middle from there)
  const lx = side * LAT * s;
  const lz = SEAT.z * b.scale + FORE;
  return out.set(u.x - (c * lx + sn * lz), b.pos.y, u.z - (-sn * lx + c * lz));
}

const _o = new Vector3();
/** Points of the hull tried for open water (m along, m across, at his size 1.4): the middle, bow, stern, sides. */
const HULL_PTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1.5, 0],
  [-1.5, 0],
  [0, 0.6],
  [0, -0.6],
];
/** The boat fits on open water alongside bud `u` (its middle, bow, stern and sides: the lake, nothing built there). */
function open(ctx: RoamCtx, u: LotusBud, side: number): boolean {
  const w = ctx.world;
  const p = alongside(ctx, u, side, _o);
  const hx = Math.sin(ctx.body.yaw);
  const hz = Math.cos(ctx.body.yaw);
  const k = ctx.body.scale / 1.4;
  for (const [fa, fd] of HULL_PTS) {
    const a = fa * k;
    const d = fd * k;
    const x = p.x + hx * a + hz * d;
    const z = p.z + hz * a - hx * d;
    const water = w.waterAt(x, z);
    if (water === null || w.groundAt(x, z) > water - 0.3) return false;
  }
  return true;
}

/** Start picking bud `u` (`at`: s already in, a check's). */
function startPick(ctx: RoamCtx, u: LotusBud, at = 0, glide = true): void {
  const e = env!;
  const b = ctx.body;
  const c = Math.cos(b.yaw);
  const sn = Math.sin(b.yaw);
  const side = c * (u.x - b.pos.x) - sn * (u.z - b.pos.z) >= 0 ? 1 : -1;
  bud = u;
  ps.side = side;
  from.copy(b.pos);
  alongside(ctx, u, side, to);
  if (!glide) from.copy(to);
  pick = 'pick';
  st = at;
  snapped = false;
  smiled = false;
  ps.lean = ps.arm = ps.lap = ps.lookW = ps.roll = 0;
  // Over the boat's own posture (its pose for the moment, ours on it).
  const cur = e.explorer.animator.posture;
  base = cur && cur !== pickPosture ? cur : base;
  e.explorer.animator.posture = pickPosture;
  paddle = e.explorer.rig.getSlot('boatPaddle') ?? null;
  ride ??= e.scene.getObjectByName('boat:ride') ?? null;
  // The camera round to his side (and back after: its pitch, distance, follow).
  const cam = ctx.cam;
  camBefore = { pitch: cam.pitch, distance: cam.distance, follow: cam.follow };
  cam.follow = 0;
  camFree = ctx.start.has('rcam') && ctx.shot;
  camYaw = b.yaw - side * FRAME.side;
  SFX.play('lotusReach', 0.8);
}

/** The pose while he picks: the boat's, with him leaning out (character/lotus.ts). */
const pickPosture = (time: number): Pose => {
  const p = base ? base(time) : {};
  return lotusPickPose(p, ps, paddle);
};

/** Picking is over (`kept`: it went into his bag; `quiet`: no toast, back to the map). */
function endPick(ctx: RoamCtx | null, kept: boolean, quiet = false): void {
  const e = env;
  if (!e) return;
  if (snapped && kept) {
    if (e.purse.keep(keptLotus())) {
      bagNotify.update('bag');
      if (!quiet) e.hud.toast(t('lotusPicked', { n: num(lotuses()), max: num(CARRY_MAX) }));
    }
  }
  holdLotus(null);
  if (e.explorer.animator.posture === pickPosture) e.explorer.animator.posture = base;
  if (smiled) e.explorer.showFace(null);
  smiled = false;
  pick = 'off';
  bud = null;
  snapped = false;
  ps.roll = 0;
  if (ctx && camBefore) ctx.cam.follow = camBefore.follow;
}

/** A card asks something just now ("Back to the map?": ui/ask.ts), or roaming is on its way back to the map: what he does waits. */
const asking = (): boolean => (typeof document !== 'undefined' && document.body.classList.contains('mu-asking')) || !(env?.controls.enabled ?? true);

/** One step of picking (the boat's step: it holds him). */
function stepPick(ctx: RoamCtx, dt: number): void {
  const e = env!;
  const { body, cam } = ctx;
  const u = bud!;
  // (asked "Back to the map?": he waits as he is; snapped already, it goes into his bag as roaming ends)
  if (asking()) {
    body.vel.set(0, 0, 0);
    return;
  }
  st += dt;
  body.vel.set(0, 0, 0);
  // (the boat posture came back under ours: a new boat's, a settled shot's)
  const cur = e.explorer.animator.posture;
  if (cur !== pickPosture) {
    if (cur) base = cur;
    e.explorer.animator.posture = pickPosture;
    paddle = e.explorer.rig.getSlot('boatPaddle') ?? null;
  }
  cam.turn(look.yaw, look.pitch, look.zoom);
  if (look.yaw || look.pitch) camFree = true;

  const side = ps.side;
  const s = body.scale / 1.4;
  if (pick === 'back') {
    // Leaving off: back to sitting with the paddle, nothing picked.
    const k = Math.min(1, dt / BACK) * 2.5;
    ps.lean += (0 - ps.lean) * k;
    ps.arm += (0 - ps.arm) * k;
    ps.lap += (0 - ps.lap) * k;
    ps.lookW += (0 - ps.lookW) * k;
    ps.roll = -side * ROLL * smooth(ps.lean);
    if (st > BACK) endPick(ctx, false);
    return;
  }

  // The boat glides alongside the bud (keeping its heading).
  const g = smooth(st / P.glide);
  body.pos.x = from.x + (to.x - from.x) * g;
  body.pos.z = from.z + (to.z - from.z) * g;

  // Leaving off while he reaches (before the stem is in his hand).
  if (!snapped && st > 0.15 && (look.push > 0.5 || look.use)) {
    pick = 'back';
    st = 0;
    return;
  }

  ps.lean = st < P.lift[0] ? ramp(st, P.leanIn) : 1 - 0.85 * ramp(st, P.lift) - 0.15 * ramp(st, [P.stow[0], P.lapOut[1]]);
  ps.lap = st < P.lapOut[0] ? ramp(st, P.lapIn) : 1 - ramp(st, P.lapOut);
  ps.arm = st < P.armOut[0] ? ramp(st, P.armIn) : 1 - ramp(st, P.armOut);
  ps.roll = -side * ROLL * smooth(ps.lean);
  // The stem: where his fist takes it (the stem's own length under the bud's foot).
  const stem = LOTUS_STEM * BU * body.scale;
  const gx = u.fx - u.ax * stem;
  const gy = u.fy - u.ay * stem;
  const gz = u.fz - u.az * stem;
  const grip = toBody(ctx, gx, gy, gz, _g);
  const axis = dirToBody(ctx, u.ax, u.ay, u.az, _ax);
  if (st < P.snap) {
    // Down to the stem; the tug just before it gives (toward him a little).
    ps.fist.copy(grip);
    ps.stem.copy(axis);
    const tug = ramp(st, P.tug);
    ps.fist.x -= side * 0.45 * tug;
    ps.fist.y += 0.25 * tug;
    toBody(ctx, u.fx, u.fy, u.fz, ps.look);
    ps.lookW = ramp(st, [0.1, 0.6]);
  } else {
    if (!snapped) {
      // Snapped: the bud in his hand, a ring on the water, the drops.
      snapped = true;
      bed?.setPicked(u.i, true);
      bed?.ripple(u.x, u.water, u.z);
      holdLotus(side > 0 ? 'propL' : 'propR', 1);
      SFX.play('lotusSnap', 0.9);
    }
    // Up before his chest, looking at it (turning it a little), then down into his bag by his hip.
    const up = ramp(st, P.lift);
    const away = ramp(st, P.stow);
    _show.set(SHOW.x * side, SHOW.y, SHOW.z);
    _stow.set(STOW.x * side, STOW.y, STOW.z);
    ps.fist.copy(grip).lerp(_show, up).lerp(_stow, away);
    const turn = 0.22 * Math.sin(Math.PI * ramp(st, P.look)) * side;
    _sd.set(SHOW_DIR.x * side, SHOW_DIR.y, SHOW_DIR.z).applyAxisAngle(UP, turn);
    _wd.set(STOW_DIR.x * side, STOW_DIR.y, STOW_DIR.z);
    ps.stem.copy(axis).lerp(_sd, up).lerp(_wd, away).normalize();
    // (he looks at the bud in his hand, then ahead again)
    ps.look.copy(ps.fist).addScaledVector(ps.stem, LOTUS_STEM + 1.3);
    ps.lookW = 1 - ramp(st, [P.stow[0], P.stow[1] + 0.2]);
    holdLotus(side > 0 ? 'propL' : 'propR', 1 - ramp(st, [P.stow[0] + 0.15, P.stow[1]]));
    if (!smiled && st >= P.look[0] - 0.2 && st < P.stow[0]) {
      smiled = true;
      e.explorer.showFace('happy');
    }
    if (smiled && st >= P.stow[0] + 0.3) {
      smiled = false;
      e.explorer.showFace(null);
    }
    if (st - dt < P.stow[0] + 0.1 && st >= P.stow[0] + 0.1) SFX.play('lotusKeep', 0.7);
  }
  if (st >= P.end) {
    endPick(ctx, true);
    return;
  }

  // The camera: round to his side, a little above (until the player turns it).
  if (!camFree && st < FRAME.until) {
    const k = 1 - Math.exp(-FRAME.rate * dt);
    cam.yaw += angleDiff(camYaw, cam.yaw) * k;
    cam.pitch += (FRAME.pitch - cam.pitch) * k;
    cam.distance += (FRAME.distance * s - cam.distance) * k;
  }
}
const _g = new Vector3();
const _ax = new Vector3();
const _show = new Vector3();
const _stow = new Vector3();
const _sd = new Vector3();
const _wd = new Vector3();
const UP = new Vector3(0, 1, 0);

// ── Offering at a shrine ───────────────────────────────────────────────────

/** He knelt with a lotus to offer: the prayer waits while he lays it. */
function startLay(ctx: RoamCtx, spot: WorshipSpot, at = 0): void {
  const e = env!;
  const b = ctx.body;
  laySpot = spot;
  lay = 'lay';
  lt = at;
  released = false;
  pending = null;
  // Where: before him (he faces the shrine), a little to his right; on the floor there (or nearer, or his own).
  const fx = Math.sin(b.yaw);
  const fz = Math.cos(b.yaw);
  const rx = -fz;
  const rz = fx;
  const s = b.scale / 1.4;
  let floor = b.pos.y;
  let ahead = LAY_AHEAD * s;
  for (const k of [1, 0.85, 0.7]) {
    const x = b.pos.x + fx * LAY_AHEAD * s * k;
    const z = b.pos.z + fz * LAY_AHEAD * s * k;
    const g = ctx.world.groundAt(x, z);
    if (Math.abs(g - b.pos.y) <= LAY_FLOOR * s) {
      floor = g;
      ahead = LAY_AHEAD * s * k;
      break;
    }
  }
  // (laid here already: the next beside it, further to his right; past the third, on the first again)
  const x0 = b.pos.x + fx * ahead + rx * LAY_RIGHT * s;
  const z0 = b.pos.z + fz * ahead + rz * LAY_RIGHT * s;
  const n = (laid?.near(x0 + rx * LAY_APART, z0 + rz * LAY_APART, LAY_APART * 2) ?? 0) % 3;
  layAt.set(x0 + rx * n * LAY_APART * s, floor, z0 + rz * n * LAY_APART * s);
  layYaw = b.yaw;
  Object.assign(ls, { lean: 0, arm: 0, support: 0, lookW: 0, t: 0 });
  e.explorer.animator.posture = layPosture;
  e.explorer.animator.postureFeet = true;
  // The camera from whichever side has room (else behind, higher).
  const hard = ctx.world.hardClearance ?? ctx.world.clearance;
  const fy = b.pos.y + 1.1 * s;
  const d = LAY_FRAME.distance * s;
  let yaw = NaN;
  for (const side of [1, -1]) {
    const y = b.yaw + side * LAY_FRAME.side;
    const cp = Math.cos(LAY_FRAME.pitch) * d;
    const ok = (hard?.(b.pos.x, fy, b.pos.z, b.pos.x - Math.sin(y) * cp, fy + Math.sin(LAY_FRAME.pitch) * d, b.pos.z - Math.cos(y) * cp) ?? 1) >= 0.97;
    if (ok && Number.isNaN(yaw)) yaw = y;
  }
  layCam = { yaw: Number.isNaN(yaw) ? b.yaw : yaw, free: ctx.start.has('rcam') && ctx.shot };
}

const layPosture = (): Pose => lotusLayPose(ls);

/** Laid: on the floor for the visit, out of his bag, counted, told. */
function release(): void {
  const e = env!;
  released = true;
  holdLotus(null);
  laid?.lay(layAt.x, layAt.y, layAt.z, layYaw);
  SFX.play('lotusLay', 0.85);
  const i = lotusAt();
  if (i >= 0) e.purse.take(i);
  bagNotify.update();
  const n = progress.get('lotus.offered', 0, isNum) + 1;
  progress.set('lotus.offered', n);
  e.hud.toast(t('lotusOffered', { place: placeOf(laySpot) }));
}

/** The offering is over (or stopped: what he holds goes back in his bag unless it was laid). */
function endLay(): void {
  const e = env;
  if (!e) return;
  holdLotus(null);
  if (e.explorer.animator.posture === layPosture) e.explorer.animator.posture = null;
  lay = 'off';
  laySpot = null;
  layCam = null;
}

/** One step of laying it (after the walker's and the prayer's: the prayer held at its kneel meanwhile). */
function stepLay(ctx: RoamCtx, dt: number): void {
  const e = env!;
  const clock = prayClock(e.explorer);
  // (he got up: E, the stick, a key; or the prayer went on some other way)
  if (!clock) {
    endLay();
    return;
  }
  // The prayer waits at the kneel (the Animator adds this step's time as it poses him next).
  clock.t = LAY_KNEEL - Math.min(dt, 0.1);
  // ("Back to the map?" asks, or he is on his way there: it waits too, so it is laid, taken from his bag and counted
  // only if he stays; gone back to the map, it is still in his bag: `setMode`)
  if (asking()) return;
  lt += dt;
  ls.t += dt;
  const b = ctx.body;
  const s = b.scale;
  // Out of his bag into his right hand, before his chest.
  const take = ramp(lt, L.take);
  ls.arm = lt < L.back[0] ? take : 1 - ramp(lt, L.back);
  ls.lean = lt < L.back[0] ? ramp(lt, L.lean) + LAY_DOWN * ramp(lt, L.down) * (1 - ramp(lt, [L.release, L.back[0]])) : 1 - ramp(lt, L.back);
  ls.support = lt < L.back[0] ? ramp(lt, L.support) : 1 - ramp(lt, [L.back[0], L.back[0] + 0.35]);
  if (!released) holdLotus('propR', smooth((lt - 0.08) / 0.32));
  // The fist: before his chest → over the spot → down onto it; the lotus from pointing up to lying along the floor.
  const over = ramp(lt, L.lean);
  const down = ramp(lt, L.down);
  toBody(ctx, layAt.x, layAt.y, layAt.z, _lay);
  // (the fist's middle over the floor by half a fist and the stem)
  _lay.y += 1.05;
  _above.copy(_lay);
  _above.y += 2.6;
  ls.fist.copy(HOLD).lerp(_above, over).lerp(_lay, down);
  _flat.set(0, -0.08, 1).normalize();
  ls.stem.copy(HOLD_DIR).lerp(_flat, smooth((lt - L.lean[0]) / (L.down[1] - L.lean[0]))).normalize();
  if (released) {
    // (let go: the hand lifts off it and comes back)
    ls.fist.y += 1.2 * ramp(lt, [L.release, L.release + 0.3]);
  }
  ls.look.copy(_lay).addScaledVector(ls.stem, LOTUS_STEM * 0.6);
  ls.lookW = lt < L.back[0] ? ramp(lt, [0.3, 0.9]) : 1 - ramp(lt, L.back);
  if (!released && lt >= L.release) release();
  // The camera: round to his side while he lays it, then back behind him for the bows.
  const cam = ctx.cam;
  if (layCam && !layCam.free) {
    if (ctx.input.lookYaw || ctx.input.lookPitch) layCam.free = true;
    else {
      const k = 1 - Math.exp(-LAY_FRAME.rate * dt);
      const back = lt >= L.back[0];
      cam.yaw += angleDiff(back ? b.yaw : layCam.yaw, cam.yaw) * k;
      cam.pitch += ((back ? LAY_FRAME.back.pitch : LAY_FRAME.pitch) - cam.pitch) * k;
      cam.distance += ((back ? LAY_FRAME.back.distance : LAY_FRAME.distance) * (s / 1.4) - cam.distance) * k;
    }
  }
  // (its aim lowered toward where the lotus goes while he lays it)
  const fw = lt < L.back[0] ? ramp(lt, [0.3, 1.0]) : 1 - ramp(lt, L.back);
  if (fw > 0) cam.focus.lerp(_focus.set((b.pos.x + layAt.x) / 2, b.pos.y + 0.75 * (s / 1.4), (b.pos.z + layAt.z) / 2), fw * 0.8);
  if (lt >= L.end) {
    // (the prayer goes on from its kneel: the sampeah, the bows)
    endLay();
  }
}
const _focus = new Vector3();
const _lay = new Vector3();
const _above = new Vector3();
const _flat = new Vector3();

// ── Registration ───────────────────────────────────────────────────────────

registerAddon({
  id: ID,
  order: BEFORE_SHRINE - 1,
  holdIn: 'boat',

  get holding() {
    return pick !== 'off';
  },
  get handsBusy() {
    return pick !== 'off' || lay !== 'off';
  },

  init(e) {
    env = e;
    laid = createLaidLotus();
    e.scene.add(laid.object);
    KEEPSAKES.set(LOTUS_ID, {
      // (what it is for: the button is narrow)
      label: () => t('lotusLabel'),
      pick: () => e.hud.toast(t('lotusHint')),
      kept: (name) => t('lotusKept', { name }),
      busy: () => lay !== 'off' || pick !== 'off',
    });
    bagNotify.update();
    // (Visak Bochea's procession lays his own lotus with the candle: roam/_visak.ts)
    LOTUS_HOOK.has = () => lotuses() > 0;
    LOTUS_HOOK.offerWith = (where) => {
      const i = lotusAt();
      if (i < 0 || !env) return false;
      env.purse.take(i);
      bagNotify.update();
      progress.set('lotus.offered', progress.get('lotus.offered', 0, isNum) + 1);
      // (Visak Bochea: at the floating village pagoda's candle tray; told once the prayer's own "Paying respect" has been)
      later = { text: t('lotusOffered', { place: t(where === 'visak' ? 'lotusAtPagoda' : 'lotusAtShrine') }), in: 2.6 };
      return true;
    };
    // (checks: the state from the console)
    Object.assign(window, {
      __lotus: {
        state: () => ({ pick, st: +st.toFixed(2), bud: bud?.i ?? null, snapped, lay, lt: +lt.toFixed(2), released, pending: pending?.spot.id ?? null, have: lotuses(), offered: progress.get('lotus.offered', 0, isNum) }),
        bed: () => bed,
        laid: () => laid?.list,
        pose: ps,
        layPose: ls,
      },
    });
  },

  input(ctx, mode) {
    if (pick === 'off' || mode !== 'boat') return false;
    const i = ctx.input;
    look.yaw = i.lookYaw;
    look.pitch = i.lookPitch;
    look.zoom = i.zoom;
    look.push = Math.hypot(i.move.x, i.move.y);
    look.use = i.use;
    // (his input is the picking's meanwhile: no paddling, tools or camera; the look goes on in `hold`)
    return true;
  },

  offer(ctx, mode) {
    const e = env;
    if (!e) return null;
    if (mode === 'boat') {
      // (in the boat its posture always holds him: not `busy()`; the camera, the phone, the album, another add-on's hands)
      if (pick !== 'off' || e.photo.kind || e.photo.albumOpen || addonBusy() || addonHands()) return null;
      if (Math.hypot(ctx.body.vel.x, ctx.body.vel.z) > SLOW) return null;
      makeBed(Math.hypot(ctx.body.pos.x - BED.x, ctx.body.pos.z - BED.z) < BED.r + 40);
      return budNear(ctx) ? pPick : null;
    }
    // On foot before a shrine with a lotus: offer it as he prays.
    if (lay !== 'off' || pending || e.busy() || lotuses() === 0) return null;
    return shrine.near() ? pOffer : null;
  },

  use(ctx, mode) {
    const e = env;
    if (!e) return;
    if (mode === 'boat') {
      const u = budNear(ctx);
      if (!u) return;
      if (e.purse.kept.length >= CARRY_MAX) {
        e.hud.toast(t('lotusFull'));
        return;
      }
      startPick(ctx, u);
      return;
    }
    const spot = shrine.near();
    if (!spot || lotuses() === 0) return;
    // (the prayer walks him onto its lotus, turns him and kneels him; `after` takes it from the kneel)
    shrine.kneel(spot);
    pending = { spot, t: 0 };
  },

  hold(ctx, dt) {
    if (pick !== 'off') stepPick(ctx, dt);
    env?.explorer.setMotion(0, true, 0);
    return { prompt: null };
  },

  after(ctx, mode, dt) {
    const e = env;
    if (!e) return;
    // The hull dips toward him as he leans out (after the boat placed it).
    if (mode === 'boat' && pick !== 'off' && ride) ride.rotation.z += ps.roll;
    if (mode !== 'walk') return;
    // E with a lotus at a shrine: once both knees are down, he lays it (the prayer waits).
    if (pending && lay === 'off') {
      pending.t += dt;
      const clock = prayClock(e.explorer);
      if (clock && clock.t >= LAY_KNEEL - 0.08) startLay(ctx, pending.spot, urlLay ?? 0);
      else if ((!clock && !shrine.busy() && pending.t > 0.3) || pending.t > PENDING_FOR) pending = null;
      urlLay = null;
    }
    if (lay !== 'off') stepLay(ctx, dt);
  },

  frame(f: MapFrame, mode: RoamMode) {
    if (!env) return;
    if (later && (later.in -= f.dt) <= 0) {
      if (mode !== 'overview') env.hud.toast(later.text);
      later = null;
    }
    const cam = f.camera.position;
    const d = Math.hypot(cam.x - BED.x, cam.z - BED.z);
    if (!bed && (mode === 'boat' || d < 300)) makeBed(d < 120);
    if (bed) {
      bed.object.visible = d < BED_SEEN;
      // (what stands under his boat's hull, riding or left on the water, shrinks away)
      ride ??= env.scene.getObjectByName('boat:ride') ?? null;
      const r = ride && ride.visible ? ride : null;
      if (r) {
        hull.x = r.position.x;
        hull.z = r.position.z;
        hull.yaw = r.rotation.y;
        hull.s = r.scale.x;
      }
      bed.update(f.dt, r ? hull : null);
    }
    laid?.frame(f.camera);
    // Back from picking: the player's own pitch and distance again (eased).
    if (pick === 'off' && camBefore && mode === 'boat') {
      const c = env.cam;
      const k = 1 - Math.exp(-FRAME.back * f.dt);
      c.pitch += (camBefore.pitch - c.pitch) * k;
      c.distance += (camBefore.distance - c.distance) * k;
      if (Math.abs(camBefore.pitch - c.pitch) < 0.005 && Math.abs(camBefore.distance - c.distance) < 0.05) camBefore = null;
    } else if (pick === 'off' && mode !== 'boat') camBefore = null;
  },

  setMode(next, _prev, ctx) {
    if (pick !== 'off' && next !== 'boat') endPick(ctx, true, true);
    if (lay !== 'off' && next !== 'walk') endLay();
    if (next !== 'walk') pending = null;
  },

  fromUrl(q, ctx) {
    const e = env;
    const v = q.get('lotus');
    const pk = q.get('lotuspicked');
    if (!e || (!v && !pk)) return;
    makeBed(true);
    if (pk && bed) for (const u of bed.buds) if (pk === 'all' || pk.split(',').map(Number).includes(u.i)) bed.setPicked(u.i, true);
    if (!v) return;
    // (one or more, in order: `have:2,offer`)
    for (const cmd of v.split(',')) urlCommand(cmd.trim(), q, ctx);
  },

  report() {
    const out: Record<string, string> = {};
    if (bed) {
      // (the one he is picking now is picked again by the replay)
      const gone = bed.buds.filter((u) => u.picked && !(pick === 'pick' && u === bud)).map((u) => u.i);
      if (gone.length) out.lotuspicked = gone.length === bed.buds.length ? 'all' : gone.join(',');
    }
    // (what he carries; laying one, it is still his until it is down: a replay lays it again)
    const have = lotuses() + (lay !== 'off' && released ? 1 : 0);
    const cmds: string[] = [];
    if (have) cmds.push(`have:${have}`);
    if (pick === 'pick') cmds.push(`pick:${st.toFixed(1)}`);
    else if (lay !== 'off') {
      // (the prayer's own `sim=` is its time: laying, ours — a moment for the pose to come in, then as far as he is)
      cmds.push(`offer:${Math.max(0, lt - 0.6).toFixed(1)}`);
      out.sim = '_:0.6';
    }
    if (cmds.length) out.lotus = cmds.join(',');
    return Object.keys(out).length ? out : null;
  },
});

/** A check's `lotus=` command (see the module's notes). */
function urlCommand(cmd: string, q: URLSearchParams, ctx: RoamCtx): void {
  const e = env;
  if (!e) return;
  const [what, arg] = cmd.split(':');
  const n = Number(arg);
  // (a shot without `sim=` settles 0.8 s before its picture: counted in)
  const at = Number.isFinite(n) ? Math.max(0, n - (q.has('sim') ? 0 : 0.8)) : 0;
  const give = (k: number) => {
    for (let i = lotuses(); i < k && e.purse.kept.length < CARRY_MAX; i++) e.purse.keep(keptLotus());
    bagNotify.update();
  };
  if (what === 'have') give(Math.min(CARRY_MAX, Number.isFinite(n) ? n : 1));
  if ((what === 'pick' || what === 'near') && bed) {
    // The nearest bud to the boat, the boat alongside it.
    const b = ctx.body;
    let best: LotusBud | null = null;
    for (const u of bed.buds) if (!u.picked && (!best || Math.hypot(u.x - b.pos.x, u.z - b.pos.z) < Math.hypot(best.x - b.pos.x, best.z - b.pos.z))) best = u;
    if (!best) return;
    const c = Math.cos(b.yaw);
    const sn = Math.sin(b.yaw);
    const side = c * (best.x - b.pos.x) - sn * (best.z - b.pos.z) >= 0 ? 1 : -1;
    alongside(ctx, best, side, _o);
    if (what === 'near') {
      // (a little further out: the prompt, not yet reaching)
      b.pos.set(_o.x - c * side * 0.35, b.pos.y, _o.z + sn * side * 0.35);
      return;
    }
    b.pos.set(_o.x, b.pos.y, _o.z);
    startPick(ctx, best, at, false);
    return;
  }
  if (what === 'offer' || what === 'laid') {
    if (!lotuses()) give(1);
    const spot = shrine.near() ?? nearestSpot(ctx);
    if (!spot) return;
    const b = ctx.body;
    if (what === 'laid') {
      // (laid as he would have from the spot; he stays where `at=` has him)
      const was = { x: b.pos.x, y: b.pos.y, z: b.pos.z, yaw: b.yaw };
      b.pos.set(spot.x, spot.y, spot.z);
      b.yaw = Math.atan2(spot.fx - spot.x, spot.fz - spot.z);
      startLay(ctx, spot, L.end);
      release();
      endLay();
      b.pos.set(was.x, was.y, was.z);
      b.yaw = was.yaw;
      return;
    }
    b.pos.set(spot.x, spot.y, spot.z);
    b.yaw = Math.atan2(spot.fx - spot.x, spot.fz - spot.z);
    e.explorer.play('pray');
    const clock = prayClock(e.explorer);
    if (clock) clock.t = LAY_KNEEL;
    pending = { spot, t: 0 };
    urlLay = at;
  }
}

/** The worship spot nearest him (any side, within 8 m, about his floor), for a check's start. */
function nearestSpot(ctx: RoamCtx): WorshipSpot | null {
  const p = ctx.body.pos;
  let best: WorshipSpot | null = null;
  let bd = 8;
  for (const w of WORSHIP) {
    const d = Math.hypot(w.x - p.x, w.z - p.z);
    if (d < bd && Math.abs(w.y - p.y) < 3) [bd, best] = [d, w];
  }
  return best;
}
