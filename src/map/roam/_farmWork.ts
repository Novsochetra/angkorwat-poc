import { Vector3, type PerspectiveCamera } from 'three';
import { farmBody, farmPose, type FarmKind } from '../../character/farmWork';
import { BODY_UNIT_M, WALK_SPEED } from '../../world/scale';
import { SFX } from '../audio/addonSfx';
import '../audio/_farm';
import { paddyFlooded, PLOTS } from '../paddies/stages';
import { pad } from '../pad/pad';
import type { MapFrame, RoamMode } from '../types';
import { lang, num, t, type WordKey } from '../ui/lang';
import { registerAddon, touchJump, type AddonEnv, type AddonHold, type AddonKey } from './_addons';
import { FARM, farmAsk, type FarmAct } from './_farmLink';
import { FarmMarks } from './_farmMarks';
import { BUNDLE_STAGES, FarmProps, SHEAF_STAGES } from './_farmProps';
import { ACROSS, cut as cutHill, findStrip, hide, hold as holdHill, localSeason, openPlot, plant as plantHill, restore, riceReady, shrink, STRIP, type Hill, type Strip } from './_farmStrip';
import { CARRY_MAX, riel, type Kept } from './_shopPurse';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';
import { stepSound } from './walker';

/**
 * Helping the farmers in the lake paddies plant and cut the rice (an add-on,
 * _addons.ts; the farmers: people/_sceneFarm.ts, through _farmLink.ts).
 *
 * - **Planting time** (their row bent over a flooded plot, people/_sceneFarm.ts
 *   `farmModeOf`): near them, "E  Help plant rice". The farmer at the row's
 *   end straightens up, turns to him and holds out a bundle of seedlings; he
 *   walks over and takes it in his left hand, wades to his own place at the
 *   end of the row (knee-deep: he sinks into the mud, slower, splashing),
 *   faces the planted rows as they do and bends over. E (or Space) pushes a
 *   clump into the mud at the next spot of his strip (a gold ring shows
 *   where): two across, then a step back to the next row, `STRIP` in all
 *   (_farmStrip.ts: the paddies' own hills, so they stand in the field's rows
 *   and grow on with it). His bundle thins as he goes. At the last one the
 *   farmer comes over, says "អរគុណ!" and gives him a parcel of num ansom for
 *   his bag (riel instead, if his bag is full); he takes it in both hands and
 *   sampeahs her.
 * - **Harvest** (the golden rice, the reapers in a row): "E  Help with the
 *   harvest": she lends him her sickle (she gathers by hand meanwhile); E
 *   cuts the next clump (the left hand grips it, the sickle draws through
 *   under the fist: stubble left), the sheaf growing in his left hand; at the
 *   last he twists a tie round it, carries it to the bund nearest his strip
 *   and lays it there beside any he laid before (_farmMarks.ts: they stay for
 *   the visit); she comes over, takes her sickle back, thanks him, gives him
 *   the parcel.
 * - **Other times**: near them, a line says when to come back.
 * - **Leaving**: the stick walks him out of it: he straightens up and the
 *   farmer comes to take back the bundle or the sickle (the stick again: at
 *   once). Back to the map, another mode, the night, a meal: he stops at once,
 *   quietly. What he planted or cut stays this visit.
 *
 * It holds him (`holding`) from E to the end: the walks to her, to his
 * place, to the bund are its own (a calm pace, the wading slower, the walk
 * cycle and footsteps as the walker's); the work is a posture
 * (character/farmWork.ts), the hands by IK to the clump. The camera comes
 * round to his right shoulder while he works (the player may turn it), and
 * eases back after.
 *
 * URL (checks; `season=` in the work's time, `at=` near the farmers):
 * `farm=plant|reap` him at his place in the row with the bundle or sickle,
 * `farm=plant:<n>|reap:<n>` with n clumps done (the next one going in),
 * `farm=plant:give|reap:give` the farmer holding it out to him,
 * `farm=reap:lay` laying the sheaf on the bund, `farm=plant:thanks|reap:thanks`
 * the farmer's thanks and her parcel. `report()` gives them back.
 */

/** Near a farmer in the row this close (m, across; and up or down): E helps. */
const OFFER = 4.2;
const OFFER_UP = 1.6;
/** Near any farmer out of the work's season this close (m): the line saying when to come back. */
const COME_BACK = 3.2;
/** He and the farmer face each other this far apart to hand things over (m). */
const MEET = 1.35;
/** His walks: a calm pace, slower wading in the flooded plot (shares of the walker's walking pace). */
const PACE = 0.55;
const WADE = 0.36;
/** The walker's walking pace over the true-size speed (walker.ts `PACE`). */
const WALKER_PACE = 1.6;
/** In the flooded plot he sinks into the mud this deep (m): the water's skin (0.11 m over the floor) round his shins. */
const SINK = 0.2;
/** Seconds: a clump planted, a clump cut (the moment it goes in or is cut, as a share of it). */
const PLANT_T = 0.62;
const PLANT_AT = 0.64;
const REAP_T = 0.72;
const REAP_AT = 0.42;
/** A shuffle step to the next place: its seconds (and per metre). */
const STEP_T = 0.32;
const STEP_PER_M = 0.5;
/** Handing over: the hand out by `REACH` s, it changes hands at `SWAP`, the exchange over by `TAKE`. */
const REACH = 0.5;
const SWAP = 0.62;
const TAKE = 1.25;
/** Tying the sheaf, laying it down (the sheaf leaves his hands at `LAY_AT`). */
const TIE_T = 0.95;
const LAY_T = 1.35;
const LAY_AT = 0.6;
/** The thanks: (after her sickle is back) her words and parcel, his hands out, the parcel in his bag, his sampeah, the end. */
const THANK = { reach: 0.45, swap: 0.95, bag: 1.75, sampeah: 1.95, end: 3.4 };
/** Waiting at most this long for her to come over (s): then the exchange goes on where she is. */
const WAIT = 6;
/** The stick held away this long (s) walks him out of it. */
const PUSH = 0.18;
/**
 * The camera at his work: at his side away from the farmers' row, a little round to his front (planting: the
 * row ahead of him stands clear beyond him), his bent back, the hand going down to the clump, the rows; reaping
 * from nearly in front and higher, over the standing rice (the reapers are beside and behind him: clear of him too).
 * Handing over: from the side. Eased there over `FRAME_FOR` s (then the player's).
 */
const FRAME = { plant: { yaw: Math.PI - 1.2, pitch: 0.32, distance: 5.4 }, reap: { yaw: Math.PI - 0.45, pitch: 0.46, distance: 6.0 }, rate: 2.2 };
const SIDE = { yaw: 1.75, pitch: 0.22, distance: 6.4 };
const FRAME_FOR = 2.2;
/** The farmers' gift: a num ansom (as the floating village's market sells it), and riel when his bag is full. */
const ANSOM: Kept = { shop: 'farm', id: 'farmAnsom', name: { km: 'នំអន្សម', en: 'Num ansom' }, consume: 'sweet', colors: [0x5a9a3a, 0xf4f0e0] };
const PAY = 3000;
/** A new strip's seedlings, seen, shrink back into the water over this (s). */
const SHRINK_T = 1.2;
/** The kept strip (planting: unplanted beside an end of the row) is looked at this often (s). */
const KEEP_EVERY = 0.5;
/** Out of sight: farther than this from the camera (m), or this far and out of its view. */
const UNSEEN_FAR = 60;
const UNSEEN_NEAR = 10;

type Phase = 'fetch' | 'take' | 'wade' | 'work' | 'step' | 'tie' | 'carry' | 'lay' | 'thank' | 'return';

interface Bund {
  /** Where he stands to lay it (m), where it lies, the bund's way along and the way out from the plot. */
  stand: Vector3;
  at: Vector3;
  ax: number;
  az: number;
  ox: number;
  oz: number;
}

interface Session {
  kind: FarmKind;
  phase: Phase;
  /** Seconds in this phase. */
  t: number;
  /** The farmer working with him (`FARM.farmers`), the row's end he works at. */
  giver: number;
  end: number;
  strip: Strip;
  /** Clumps done. */
  n: number;
  /** The clump's motion (0‥1) or −1, and a press waiting for it. */
  act: number;
  queued: boolean;
  /** Where he walks to or steps to (m), and from (a step); the way he faces at the work (rad). */
  readonly goal: Vector3;
  readonly from: Vector3;
  face: number;
  bund: Bund | null;
  /** He holds her bundle or sickle; the sheaf is tied; the parcel has gone into his bag. */
  tool: boolean;
  tied: boolean;
  gifted: boolean;
  /** The stick held away (s). */
  push: number;
}

// ── State ──────────────────────────────────────────────────────────────────

let env: AddonEnv | null = null;
let props: FarmProps | null = null;
let marks: FarmMarks | null = null;
const pose = farmBody('plant');
const posture = () => farmPose(pose);
let S: Session | null = null;
/** The season and the night now, the camera (frame), and the frame's seconds. */
let season = 0.45;
let night = 0;
let camera: PerspectiveCamera | null = null;
/** He sinks into the mud this deep now (m, eased). */
let sink = 0;
/** The camera before he started (eased back to after), and how long it has been framed for the work. */
let before: { pitch: number; distance: number } | null = null;
let framed = 0;
let lastPhase: Phase | null = null;
/** The walk cycle's phase last step (footfalls at 0.25 and 0.75). */
let lastStep = 0;
/** A check's state from the URL, applied once the farmers are out. */
let pending: { kind: FarmKind; n: number; at: 'work' | 'give' | 'lay' | 'thanks' } | null = null;
/** Planting: the strip kept unplanted beside an end of the row (`e`), and when it was looked at last. */
let kept: { e: number; strip: Strip } | null = null;
/** A new strip's seedlings shrinking back into the water (seen while it was made), and how far (0‥1). */
let shrinking: Strip | null = null;
let shrinkK = 0;
let keptAt = -1;
/** Reaping: hills kept standing he did not get to, put back where nobody sees. */
const later: Hill[] = [];
/** The offer's look (a strip there or not) is worked out this often. */
let offerAt = -1;
let offerOk = false;
let offerKey = -1;

const _v = new Vector3();
const _w = new Vector3();
const _d = new Vector3();

// ── Little helpers ─────────────────────────────────────────────────────────

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (u: number) => {
  const c = clamp(u, 0, 1);
  return c * c * (3 - 2 * c);
};
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/** The prompts in the language in use, made once a language (no string made a frame). */
let promptLang = '';
const keyedWords = new Map<WordKey, string>();
const plainWords = new Map<WordKey, string>();
const workWords: Record<FarmKind, string[]> = { plant: [], reap: [] };
function sameLang(): void {
  if (lang() === promptLang) return;
  promptLang = lang();
  keyedWords.clear();
  plainWords.clear();
  workWords.plant.length = workWords.reap.length = 0;
}

/** "E  <words>" (or the words alone: a line with no key, when to come back). */
function words(key: WordKey, keyed = true): string {
  sameLang();
  const m = keyed ? keyedWords : plainWords;
  let s = m.get(key);
  if (!s) m.set(key, (s = keyed ? `E  ${t(key)}` : t(key)));
  return s;
}

/** The work prompt: "E  Plant (3/12)  ·  Walk away to stop". */
function workPrompt(kind: FarmKind, n: number): string {
  sameLang();
  return (workWords[kind][n] ??= `E  ${t(kind === 'plant' ? 'farmPlant' : 'farmReap', { n: num(n), max: num(STRIP) })}  ·  ${t('farmStop')}`);
}

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

/** The land under (x, z) (m): the paddies are not solid in the walk map, the dikes are land. */
const landAt = (ctx: RoamCtx, x: number, z: number) => ctx.world.field.heightAt(x, z);

/** The work's facing: planting toward the rows planted (against the work's way), reaping into the standing rice. */
const faceOf = (s: Strip) => (s.kind === 'plant' ? Math.atan2(-s.wx, -s.wz) : Math.atan2(s.wx, s.wz));

/**
 * Where he stands for clump `i` of his strip (m): planting, behind its row's two, a little to the left of them
 * (his short right arm reaches both); reaping, behind the clump, it a little left of his middle (his left hand
 * grips it, the sickle comes from the right).
 */
function standFor(s: Strip, i: number, out: Vector3): Vector3 {
  const k = Math.min(STRIP - 1, i);
  const f = faceOf(s);
  const fx = Math.sin(f);
  const fz = Math.cos(f);
  if (s.kind === 'plant') {
    const r = Math.floor(k / ACROSS.plant) * ACROSS.plant;
    const a = s.hills[r];
    const b = s.hills[r + ACROSS.plant - 1];
    out.set(a.x + (a.x - b.x) * 0.26, 0, a.z + (a.z - b.z) * 0.26);
  } else {
    const h = s.hills[k];
    // (his left is (fz, −fx))
    out.set(h.x - fz * 0.05, 0, h.z + fx * 0.05);
  }
  return out.set(out.x - fx * 0.5, 0, out.z - fz * 0.5);
}

/** Is a point out of the player's sight (far, or off the view)? */
function unseen(x: number, y: number, z: number): boolean {
  const c = camera;
  if (!c) return true;
  const p = c.position;
  const d = Math.hypot(x - p.x, y - p.y, z - p.z);
  if (d > UNSEEN_FAR) return true;
  if (d < UNSEEN_NEAR) return false;
  c.getWorldDirection(_d);
  const cos = ((x - p.x) * _d.x + (y - p.y) * _d.y + (z - p.z) * _d.z) / d;
  // (the view's half-width across its diagonal, and some)
  const half = (((c.fov * Math.max(1, c.aspect)) / 2 + 18) * Math.PI) / 180;
  return cos < Math.cos(Math.min(Math.PI * 0.95, half));
}

const stripSeen = (s: Strip) => !unseen(s.hills[0].x, s.hills[0].y, s.hills[0].z) || !unseen(s.hills[STRIP - 1].x, s.hills[STRIP - 1].y, s.hills[STRIP - 1].z);

/** The way the farmers' work goes now (unit x, z). */
const workWay = (out: Vector3) => out.set(FARM.ux * FARM.ahead, 0, FARM.uz * FARM.ahead);

/** The row's end nearest (x, z) that has room for one more (0, 1), or −1. */
function nearestEnd(x: number, z: number): number {
  let best = -1;
  let bd = Infinity;
  for (let e = 0; e < 2; e++) {
    const end = FARM.ends[e];
    if (!end.ok) continue;
    const d = Math.hypot(end.x - x, end.z - z);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/** The row farmer nearest (x, z), or −1. */
function nearestRow(x: number, z: number, maxD = Infinity): number {
  let best = -1;
  let bd = maxD;
  FARM.farmers.forEach((f, k) => {
    if (!f.shown || f.job !== 'row') return;
    const d = Math.hypot(f.x - x, f.z - z);
    if (d < bd) {
      bd = d;
      best = k;
    }
  });
  return best;
}

// ── The strips ─────────────────────────────────────────────────────────────

/**
 * A planting strip at the row's end `e` for him now: the one kept for him if there is one (at its own end), else a
 * new one there (kept unplanted from now on).
 */
function plantStrip(e: number): Strip | null {
  const k = kept;
  if (k && k.strip.plot === FARM.plot) return k.strip;
  const sl = localSeason(FARM.plot, season);
  const s = stripAt('plant', e, PLANT_AHEAD);
  if (!s) return null;
  if (k) release(k.strip);
  // (where the player may see it, the seedlings up there now shrink back into the water as she hands him the bundle)
  const seen = stripSeen(s);
  for (const h of s.hills) if (!seen || sl < h.plant0) hide(h);
  shrinking = seen ? s : null;
  shrinkK = 0;
  kept = { e, strip: s };
  return s;
}

/** The shrinking over at once (the work stopped): those not planted unplanted. */
function finishShrink(): void {
  const s = shrinking;
  shrinking = null;
  if (!s) return;
  for (const h of s.hills) if (!h.done) hide(h);
}

/** A kept strip let go: the clumps he did not plant come back as the plot has them. */
function release(s: Strip): void {
  if (shrinking === s) shrinking = null;
  for (const h of s.hills) if (!h.done) restore(h);
  if (kept?.strip === s) kept = null;
}

/** The row's end nearest the camera that has room for one more (where he would come from), or −1. */
function endNearCamera(): number {
  const c = camera?.position;
  return c ? nearestEnd(c.x, c.z) : -1;
}

/**
 * Planting: keep one strip unplanted beside an end of the farmers' row (the end nearest the camera when it is
 * made), so the explorer finds a place left for him there; moved with the row, and let go when the planting is
 * over, only where nobody sees it change. Reaping: the clumps kept standing that he did not get to, back as the plot
 * has them, where nobody sees.
 */
function keep(): void {
  for (let i = later.length - 1; i >= 0; i--) {
    const h = later[i];
    if (!unseen(h.x, h.y, h.z)) continue;
    restore(h);
    later.splice(i, 1);
  }
  // (his own strip in use: as it is)
  if (S && S.kind === 'plant') return;
  const k = kept;
  const planting = FARM.shown && FARM.work === 'plant';
  if (!planting || (k && k.strip.plot !== FARM.plot)) {
    if (k && !stripSeen(k.strip)) release(k.strip);
    return;
  }
  // (where it is now beside the row: as it is; else a new place, only where nobody would see the seedlings go)
  // (its first clump lies ≈ a metre out from the end: `SPACE`)
  if (k && FARM.ends[k.e].ok && Math.hypot(k.strip.hills[0].x - FARM.ends[k.e].x, k.strip.hills[0].z - FARM.ends[k.e].z) < 2.2) return;
  if (k && stripSeen(k.strip)) return;
  const e = endNearCamera();
  if (e < 0) return;
  const end = FARM.ends[e];
  if (!unseen(end.x, k ? k.strip.hills[0].y : landAt0(end.x, end.z), end.z)) return;
  if (k) release(k.strip);
  plantStrip(e);
}

/** (the land under a point, without a step's context) */
function landAt0(x: number, z: number): number {
  return env ? env.world.field.heightAt(x, z) : 8;
}

// ── Starting, stopping ─────────────────────────────────────────────────────

/**
 * Planting, his strip begins this far back from the farmers' line (m, on its side not planted yet); reaping, this far
 * ahead of the reapers' line, then further on (past a ragged edge of their cut). With `SPACE` across, nobody of the
 * row stands behind him from the side.
 */
const PLANT_AHEAD = 1.0;
const REAP_AHEAD = [1.6, 2.2, 1.0, 0.6];
/**
 * His strip is set this much further out from the row's end (m), beyond the farmers' own spacing (2.4 m), then
 * nearer where the plot's edge is close: he works ≈ 3 m from the nearest farmer.
 */
const SPACE = [0.95, 0.6, 0.3, 0];

/**
 * His strip at the row's end `e`, `ahead` (m) on from the farmers' line the way the work goes: set out from the end
 * farmer a little more than they are from each other (`SPACE` m further out across the plot: his hat and theirs,
 * bent over, keep clear of each other from every side), nearer in only where the plot's edge leaves no room.
 */
function stripAt(kind: FarmKind, e: number, ahead: number): Strip | null {
  const end = FARM.ends[e];
  if (!end.ok) return null;
  workWay(_w);
  const sl = localSeason(FARM.plot, season);
  // (out across the plot, away from the row: the row's ends lie at −v (0) and +v (1); v runs along x where the sweep runs along z)
  const out = e === 0 ? -1 : 1;
  const ox = FARM.uz !== 0 ? out : 0;
  const oz = FARM.uz !== 0 ? 0 : out;
  for (const space of SPACE) {
    const s = findStrip(kind, FARM.plot, end.x + ox * space, end.z + oz * space, _w.x, _w.z, sl, ahead);
    if (s) return s;
  }
  return null;
}

/** A reaping strip at the row's end `e`: standing rice a little ahead of the reapers' line, or null. */
function reapStrip(e: number): Strip | null {
  for (const ahead of REAP_AHEAD) {
    const s = stripAt('reap', e, ahead);
    if (s) return s;
  }
  return null;
}

/** Is there a strip for him at the row's end `e` (planting: one kept there, or room for one)? */
function roomAt(e: number): boolean {
  if (e < 0 || !FARM.ends[e].ok) return false;
  if (FARM.work === 'harvest') return reapStrip(e) !== null;
  return stripAt('plant', e, PLANT_AHEAD) !== null;
}

/** The row's end he would work at: planting, the one with his strip kept there; else the nearer with room, or the other (−1: neither). */
function endFor(x: number, z: number): number {
  if (FARM.work === 'plant' && kept && kept.strip.plot === FARM.plot && FARM.ends[kept.e].ok) return kept.e;
  const e = nearestEnd(x, z);
  if (e < 0) return -1;
  if (roomAt(e)) return e;
  return roomAt(1 - e) ? 1 - e : -1;
}

/** Can he help here now (a farmer near, a strip of his there)? Worked out at most twice a second. */
function canHelp(ctx: RoamCtx): boolean {
  const near = nearestEnd(ctx.body.pos.x, ctx.body.pos.z);
  const key = (FARM.plot * 4 + (FARM.work === 'plant' ? 1 : FARM.work === 'harvest' ? 2 : 3)) * 4 + near + 1;
  if (ctx.t < offerAt && ctx.t > offerAt - 1 && key === offerKey) return offerOk;
  offerAt = ctx.t + 0.8;
  offerKey = key;
  offerOk = riceReady() && endFor(ctx.body.pos.x, ctx.body.pos.z) >= 0;
  return offerOk;
}

/** Start helping at the row's end nearest him (or the other, if there is no room there): the strip, the farmer there, the walk over to her. */
function start(ctx: RoamCtx, kind: FarmKind): boolean {
  const p = ctx.body.pos;
  if (!riceReady()) return false;
  const e = endFor(p.x, p.z);
  if (e < 0) return false;
  const end = FARM.ends[e];
  let strip: Strip | null;
  if (kind === 'plant') strip = plantStrip(e);
  else {
    strip = reapStrip(e);
    // (kept standing while he works: the plot's own sweep passes them by)
    if (strip) for (const h of strip.hills) holdHill(h);
  }
  if (!strip) return false;
  const giver = nearestRow(end.x, end.z);
  if (giver < 0) return false;
  // (the farmers just starting a plot: its rows drawn already, for his clumps)
  if (kind === 'plant' && localSeason(strip.plot, season) < PLOTS[strip.plot].plant) openPlot(strip.plot, true);
  S = {
    kind,
    phase: 'fetch',
    t: 0,
    giver,
    end: e,
    strip,
    n: strip.hills.reduce((n, h) => n + (h.done ? 1 : 0), 0),
    act: -1,
    queued: false,
    goal: new Vector3(),
    from: new Vector3(),
    face: faceOf(strip),
    bund: null,
    tool: false,
    tied: false,
    gifted: false,
    push: 0,
  };
  pose.kind = kind;
  pose.bend = 0;
  pose.act = -1;
  pose.step = -1;
  pose.offer = 0;
  pose.lay = 0;
  FARM.helper.working = true;
  farmAsk(giver, 'face');
  before ??= { pitch: ctx.cam.pitch, distance: ctx.cam.distance };
  ctx.body.vel.set(0, 0, 0);
  props ??= new FarmProps(ctx.body.explorer);
  marks ??= new FarmMarks(env!.scene);
  return true;
}

function setPhase(next: Phase): void {
  if (!S) return;
  S.phase = next;
  S.t = 0;
}

/**
 * Stop now: his hands empty (her bundle or sickle back with her), the posture off, she goes back to work. What he
 * planted or cut stays; planting, the rest of his strip stays kept for him; reaping, the clumps kept standing go
 * back to the plot's own days where nobody sees.
 */
function finish(ctx: RoamCtx | null): void {
  const s = S;
  if (!s) return;
  S = null;
  pending = null;
  const ex = env?.explorer;
  if (ex && ex.animator.posture === posture) {
    ex.animator.posture = null;
    ex.animator.postureFeet = true;
  }
  props?.clear();
  marks?.showGuide(null);
  touch(null);
  farmAsk(-1, 'none');
  FARM.helper.working = false;
  FARM.helper.sickle = false;
  if (s.kind === 'reap') for (const h of s.strip.hills) if (!h.done) later.push(h);
  // (a whole row planted: the next one is a new strip)
  if (s.kind === 'plant' && s.n >= STRIP && kept?.strip === s.strip) kept = null;
  if (shrinking === s.strip) finishShrink();
  if (ctx) ctx.body.explorer.setMotion(0, true, 0);
}

/** The stick walked him out of it: he gives back what he holds (she comes for it), or stops at once. */
function leave(ctx: RoamCtx): void {
  const s = S;
  if (!s) return;
  if (s.phase === 'return') return finish(ctx);
  if (!s.tool) return finish(ctx);
  setPhase('return');
  s.act = -1;
  s.queued = false;
  meetPoint(ctx, s);
  farmAsk(s.giver, 'come');
}

/** Where she comes to, to face him (`MEET` in front of him, on her side), and he turns to her. */
function meetPoint(ctx: RoamCtx, s: Session): void {
  const f = FARM.farmers[s.giver];
  const p = ctx.body.pos;
  let dx = f.x - p.x;
  let dz = f.z - p.z;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d;
  dz /= d;
  FARM.helper.tx = p.x + dx * MEET;
  FARM.helper.tz = p.z + dz * MEET;
}

/** The farmer has come over (or has been long enough on her way). */
function herThere(s: Session): boolean {
  const f = FARM.farmers[s.giver];
  return Math.hypot(f.x - FARM.helper.tx, f.z - FARM.helper.tz) < 0.35 || s.t > WAIT;
}

/** The parcel into his bag (or riel, with a full bag), and the toast. */
function reward(): void {
  const e = env;
  if (!e) return;
  if (e.purse.keep(ANSOM)) e.hud.toast(t('farmGift', { n: num(e.purse.kept.length), max: num(CARRY_MAX) }));
  else {
    e.purse.earn(PAY);
    e.hud.toast(t('farmPaid', { riel: riel(PAY) }));
  }
}

/** The bund to lay the sheaf on: the plot's edge nearest where he is, out on its dike. */
function bundFor(ctx: RoamCtx, s: Strip): Bund {
  const p = PLOTS[s.plot].paddy;
  const at = ctx.body.pos;
  // (the plot's four edges: how far, and the way out across each)
  const edges = [
    { d: at.x - (p.x - p.w / 2), ox: -1, oz: 0 },
    { d: p.x + p.w / 2 - at.x, ox: 1, oz: 0 },
    { d: at.z - (p.z - p.d / 2), ox: 0, oz: -1 },
    { d: p.z + p.d / 2 - at.z, ox: 0, oz: 1 },
  ].sort((a, b) => a.d - b.d);
  const e = edges[0];
  // (on the dike a metre out from the plot's edge; he stands on the plot's side of it, facing out)
  const ex = e.ox !== 0 ? (e.ox > 0 ? p.x + p.w / 2 : p.x - p.w / 2) : at.x;
  const ez = e.oz !== 0 ? (e.oz > 0 ? p.z + p.d / 2 : p.z - p.d / 2) : at.z;
  const lx = ex + e.ox * 1.0;
  const lz = ez + e.oz * 1.0;
  return {
    stand: new Vector3(ex - e.ox * 0.35, 0, ez - e.oz * 0.35),
    at: new Vector3(lx, landAt(ctx, lx, lz), lz),
    ax: Math.abs(e.oz),
    az: Math.abs(e.ox),
    ox: e.ox,
    oz: e.oz,
  };
}

// ── The steps ──────────────────────────────────────────────────────────────

/**
 * Walk toward `goal` at `speed` (m/s; slower over the last half metre), turning to the way; sunk in the mud where
 * the plot is flooded (planting); footsteps and splashes as he goes. True once there.
 */
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
  settleY(ctx, dt);
  b.explorer.setMotion(v / b.scale, true, 0);
  footfalls(ctx, v);
  return d <= 0.04;
}

/** His feet: on the land, sunk into the mud where the plot is flooded (eased, as he wades in or out). */
function settleY(ctx: RoamCtx, dt: number): void {
  const p = ctx.body.pos;
  const wet = S?.kind === 'plant' && paddyFlooded(p.x, p.z);
  sink += ((wet ? SINK : 0) - sink) * damp(3, dt);
  const y = landAt(ctx, p.x, p.z) - sink;
  p.y += (y - p.y) * damp(14, dt);
}

/** The walk cycle went past `q` (0‥1) from `a` to `b` (wrapping). */
const crossed = (a: number, b: number, q: number) => (a < q && b >= q) || (b < a && (a < q || b >= q));

/** A footstep at each footfall of the walk cycle (and a splash where he wades). */
function footfalls(ctx: RoamCtx, speed: number): void {
  const b = ctx.body;
  const phase = b.explorer.animator.phase;
  if (speed > 0.25) {
    const left = crossed(lastStep, phase, 0.25);
    if (left || crossed(lastStep, phase, 0.75)) {
      const p = b.pos;
      const land = landAt(ctx, p.x, p.z);
      ctx.sound(stepSound(ctx.world, p.x, land, p.z), 0.45 + speed * 0.1);
      if (paddyFlooded(p.x, p.z)) {
        // (the foot's side: his left is (cos yaw, −sin yaw))
        const sg = left ? 1 : -1;
        marks?.splashAt(p.x + Math.cos(b.yaw) * 0.16 * sg, land + 0.11, p.z - Math.sin(b.yaw) * 0.16 * sg, 0.45);
      }
    }
  }
  lastStep = phase;
}

/** The camera: behind him walking; round to his right shoulder at the work, from the side handing over (eased for a while). */
function frameCam(ctx: RoamCtx, s: Session, dt: number): void {
  const { cam, body, input } = ctx;
  const h = 1.7 * body.scale * 0.95;
  const working = s.phase === 'work' || s.phase === 'step' || s.phase === 'tie' || s.phase === 'lay';
  const handing = s.phase === 'take' || s.phase === 'thank' || (s.phase === 'return' && herThere(s));
  if (s.phase !== lastPhase) {
    if (working !== (lastPhase === 'work' || lastPhase === 'step' || lastPhase === 'tie' || lastPhase === 'lay') || handing) framed = 0;
    lastPhase = s.phase;
  }
  if (input.lookYaw || input.lookPitch || input.zoom) framed = FRAME_FOR;
  const y = body.pos.y + (working ? 0.95 : handing ? h * 0.7 : h * 0.86);
  cam.focus.x = body.pos.x;
  cam.focus.z = body.pos.z;
  cam.focus.y += (y - cam.focus.y) * damp(6, dt);
  cam.behindYaw = body.yaw;
  cam.follow = working || handing ? 0 : 0.6;
  if (!(working || handing) || framed >= FRAME_FOR) return;
  framed += dt;
  const want = working ? FRAME[s.kind] : SIDE;
  const k = damp(FRAME.rate, dt);
  cam.yaw += angleDiff(body.yaw + want.yaw * (working ? farmersSide(ctx, s) : 1), cam.yaw) * k;
  cam.pitch += (want.pitch - cam.pitch) * k;
  cam.distance += (Math.min(Math.max(want.distance, cam.minDistance), cam.maxDistance) - cam.distance) * k;
}

/**
 * Which side of him the farmers' row is: +1 on his left, −1 on his right (the camera, at his facing + π − a·side,
 * comes round in front on the other side).
 */
function farmersSide(ctx: RoamCtx, s: Session): number {
  const f = FARM.farmers[s.giver];
  const b = ctx.body;
  // (his left is (cos yaw, −sin yaw))
  return (f.x - b.pos.x) * Math.cos(b.yaw) - (f.z - b.pos.z) * Math.sin(b.yaw) > 0 ? 1 : -1;
}

/** The clump he works on next: its foot in his space (eased: the hands and chest turn to it smoothly). */
function aim(ctx: RoamCtx, s: Session, dt: number, snap = false): Hill | null {
  const h = s.strip.hills[Math.min(STRIP - 1, s.n)];
  if (!h) return null;
  toBody(ctx, h.x, h.y, h.z, _v);
  if (snap) pose.spot.copy(_v);
  else pose.spot.lerp(_v, damp(12, dt));
  return h;
}

/** One step of the work (`hold`). */
function step(ctx: RoamCtx, dt: number): AddonHold {
  const s = S!;
  const { body, input } = ctx;
  const ex = body.explorer;
  s.t += dt;
  pose.t += dt;
  ctx.cam.turn(input.lookYaw, input.lookPitch, input.zoom);
  const h = FARM.helper;
  h.x = body.pos.x;
  h.y = body.pos.y;
  h.z = body.pos.z;
  // (the farmers gone home for the night, another plot now, a meal begun with 6: he stops at once)
  if (!FARM.shown || FARM.plot !== s.strip.plot || ex.foodHeld) {
    finish(ctx);
    return { prompt: null };
  }
  // The stick held away walks him out of it (not while laying the sheaf down or being thanked).
  const push = Math.hypot(input.move.x, input.move.y) > 0.5;
  s.push = push ? s.push + dt : 0;
  if (s.push > PUSH && s.phase !== 'lay' && s.phase !== 'thank' && s.phase !== 'carry' && s.phase !== 'tie' && !(s.phase === 'return' && s.t < 0.6)) {
    s.push = -1e9;
    leave(ctx);
    if (!S) return { prompt: null };
  }
  if (!push && s.push < 0) s.push = 0;
  const press = input.use || input.jump;
  let prompt: string | null = null;
  const speed = WALK_SPEED * body.scale * WALKER_PACE;
  const g = s.goal;
  switch (s.phase) {
    case 'fetch': {
      // To her: in front of her, facing her (she turns to him meanwhile).
      const f = FARM.farmers[s.giver];
      _d.set(body.pos.x - f.x, 0, body.pos.z - f.z);
      const d = _d.length() || 1;
      g.set(f.x + (_d.x / d) * MEET, 0, f.z + (_d.z / d) * MEET);
      const there = walkTo(ctx, g, speed * (paddyFlooded(body.pos.x, body.pos.z) ? WADE : PACE), dt);
      if (there || s.t > WAIT) {
        setPhase('take');
        farmAsk(s.giver, 'give');
        ex.animator.posture = posture;
        ex.animator.postureFeet = false;
        pose.offerHand = s.kind === 'plant' ? 'L' : 'R';
      }
      break;
    }
    case 'take': {
      // She holds it out; his hand goes out and takes it.
      const f = FARM.farmers[s.giver];
      body.yaw += angleDiff(Math.atan2(f.x - body.pos.x, f.z - body.pos.z), body.yaw) * damp(8, dt);
      settleY(ctx, dt);
      ex.setMotion(0, true, 0);
      pose.offer = s.t < SWAP ? smooth(s.t / REACH) : 1 - smooth((s.t - SWAP) / (TAKE - SWAP));
      if (!s.tool && s.t >= SWAP) {
        s.tool = true;
        if (s.kind === 'plant') props!.hold('L', 'bundle', bundleStage(s.n), true, 0.1);
        else {
          props!.hold('R', 'sickle');
          FARM.helper.sickle = true;
        }
        SFX.play('farmRustle', 0.9);
      }
      if (s.t >= TAKE) {
        farmAsk(s.giver, 'lent');
        pose.offer = 0;
        ex.animator.posture = null;
        ex.animator.postureFeet = true;
        setPhase('wade');
        standFor(s.strip, s.n, g);
      }
      break;
    }
    case 'wade': {
      // To his place at the row's end (wading slower in the flooded plot), then the work's way.
      const wet = paddyFlooded(body.pos.x, body.pos.z) || paddyFlooded(g.x, g.z);
      if (walkTo(ctx, g, speed * (wet && s.kind === 'plant' ? WADE : PACE), dt)) {
        body.yaw += angleDiff(s.face, body.yaw) * damp(9, dt);
        if (Math.abs(angleDiff(s.face, body.yaw)) < 0.05) {
          body.yaw = s.face;
          setPhase('work');
          ex.animator.posture = posture;
          ex.animator.postureFeet = false;
          aim(ctx, s, dt, true);
        }
      }
      break;
    }
    case 'work': {
      settleY(ctx, dt);
      ex.setMotion(0, true, 0);
      pose.bend += (1 - pose.bend) * damp(5, dt);
      const hill = aim(ctx, s, dt);
      if (press && s.n < STRIP) s.queued = true;
      // (a press, now or while he was still bending down or stepping: the next clump, once he is down to it)
      if (s.queued && s.act < 0 && pose.bend > 0.6 && s.n < STRIP) {
        s.queued = false;
        s.act = 0;
      }
      if (s.act >= 0 && hill) {
        const len = s.kind === 'plant' ? PLANT_T : REAP_T;
        const at = s.kind === 'plant' ? PLANT_AT : REAP_AT;
        const was = s.act;
        s.act = Math.min(1, s.act + dt / len);
        if (was < at && s.act >= at) done(ctx, s, hill);
        if (s.act >= 1) {
          s.act = -1;
          if (s.n >= STRIP) {
            s.queued = false;
            if (s.kind === 'plant') {
              setPhase('thank');
              meetPoint(ctx, s);
              farmAsk(s.giver, 'come');
            } else setPhase('tie');
          } else {
            standFor(s.strip, s.n, _v);
            if (Math.hypot(_v.x - body.pos.x, _v.z - body.pos.z) > 0.05) {
              s.from.copy(body.pos);
              g.copy(_v);
              setPhase('step');
              toBody(ctx, g.x, body.pos.y, g.z, pose.stride);
              pose.stride.y = 0;
              pose.step = 0;
            }
          }
        }
      }
      pose.act = s.act;
      if (s.n < STRIP) {
        const nh = s.strip.hills[s.n];
        _v.set(nh.x, nh.y, nh.z);
        marks!.showGuide(s.act < 0 || s.act > 0.85 ? _v : null, s.kind === 'plant' && paddyFlooded(nh.x, nh.z));
      } else marks!.showGuide(null);
      prompt = s.n < STRIP ? workPrompt(s.kind, s.n) : null;
      break;
    }
    case 'step': {
      // A shuffle to the next place: the feet one after the other, the body carried smoothly with them.
      const len = STEP_T + STEP_PER_M * Math.hypot(g.x - s.from.x, g.z - s.from.z);
      const u = Math.min(1, s.t / len);
      const e = smooth(u);
      body.pos.x = s.from.x + (g.x - s.from.x) * e;
      body.pos.z = s.from.z + (g.z - s.from.z) * e;
      settleY(ctx, dt);
      ex.setMotion(0, true, 0);
      pose.step = u;
      aim(ctx, s, dt);
      if (press) s.queued = true;
      const wet = s.kind === 'plant' && paddyFlooded(body.pos.x, body.pos.z);
      // (a little splash as each foot comes down)
      if (wet && ((s.t - dt < len * 0.5 && s.t >= len * 0.5) || (s.t - dt < len && s.t >= len))) marks!.splashAt(body.pos.x, landAt(ctx, body.pos.x, body.pos.z) + 0.11, body.pos.z, 0.3);
      if (u >= 1) {
        pose.step = -1;
        setPhase('work');
      }
      prompt = workPrompt(s.kind, s.n);
      break;
    }
    case 'tie': {
      // He straightens a little and twists a tie of straw round the sheaf.
      settleY(ctx, dt);
      ex.setMotion(0, true, 0);
      pose.bend += (0.35 - pose.bend) * damp(5, dt);
      if (s.t >= TIE_T * 0.5 && !s.tied) {
        s.tied = true;
        props!.hold('L', 'sheaf', SHEAF_STAGES - 1, true, 0.55);
        SFX.play('farmRustle', 0.7);
      }
      if (s.t >= TIE_T) {
        s.bund = bundFor(ctx, s.strip);
        g.copy(s.bund.stand);
        ex.animator.posture = null;
        ex.animator.postureFeet = true;
        pose.bend = 0;
        setPhase('carry');
        // (she comes over to the bund too, to his side of it)
        FARM.helper.tx = s.bund.stand.x - s.bund.ox * MEET;
        FARM.helper.tz = s.bund.stand.z - s.bund.oz * MEET;
        farmAsk(s.giver, 'come');
      }
      prompt = words('farmCarry', false);
      break;
    }
    case 'carry': {
      const b = s.bund!;
      if (walkTo(ctx, g, speed * PACE, dt)) {
        const out = Math.atan2(b.ox, b.oz);
        body.yaw += angleDiff(out, body.yaw) * damp(9, dt);
        if (Math.abs(angleDiff(out, body.yaw)) < 0.06) {
          setPhase('lay');
          ex.animator.posture = posture;
          ex.animator.postureFeet = false;
        }
      }
      prompt = words('farmCarry', false);
      break;
    }
    case 'lay': {
      settleY(ctx, dt);
      ex.setMotion(0, true, 0);
      pose.lay = Math.min(1, s.t / LAY_T);
      if (s.t >= LAY_T * LAY_AT && props!.holding('L') === 'sheaf') {
        const b = s.bund!;
        props!.hold('L', null);
        marks!.laySheaf(b.at.x, b.at.y, b.at.z, b.ax, b.az, b.ox, b.oz);
        SFX.play('farmLay', 0.9);
        pad.rumble('tick', 0.3);
      }
      if (s.t >= LAY_T) {
        pose.lay = 0;
        setPhase('thank');
      }
      prompt = words('farmCarry', false);
      break;
    }
    case 'thank': {
      // She comes over; (reaping: her sickle back first;) her thanks and the parcel; his sampeah.
      settleY(ctx, dt);
      ex.setMotion(0, true, 0);
      pose.bend += (0 - pose.bend) * damp(5, dt);
      pose.act = -1;
      const f = FARM.farmers[s.giver];
      body.yaw += angleDiff(Math.atan2(f.x - body.pos.x, f.z - body.pos.z), body.yaw) * damp(6, dt);
      if (FARM.helper.act === 'come') {
        if (!herThere(s)) break;
        s.t = 0;
        farmAsk(s.giver, s.kind === 'reap' && s.tool ? 'take' : 'thank');
        pose.offerHand = 'R';
      }
      // (reaping: the sickle back to her, then her thanks)
      if (FARM.helper.act === 'take') {
        pose.offer = s.t < SWAP ? smooth(s.t / REACH) : 1 - smooth((s.t - SWAP) / (TAKE - SWAP));
        if (s.tool && s.t >= SWAP) {
          s.tool = false;
          props!.hold('R', null);
          FARM.helper.sickle = false;
          SFX.play('farmRustle', 0.8);
        }
        if (s.t >= TAKE) {
          s.t = 0;
          farmAsk(s.giver, 'thank');
        }
        break;
      }
      pose.offerHand = 'both';
      const T = THANK;
      pose.offer = s.t < T.swap ? smooth((s.t - T.reach) / (T.swap - T.reach)) : 1 - smooth((s.t - T.bag) / (T.sampeah - T.bag));
      if (s.t >= T.swap && props!.holding('R') !== 'parcel' && !s.gifted) {
        props!.hold('R', 'parcel');
        SFX.play('farmRustle', 0.8);
      }
      if (s.t >= T.bag && !s.gifted) {
        s.gifted = true;
        props!.hold('R', null);
        reward();
      }
      if (s.t >= T.sampeah && ex.animator.posture === posture) {
        ex.animator.posture = null;
        ex.animator.postureFeet = true;
        ex.play('greet');
      }
      if (s.t >= T.end) finish(ctx);
      break;
    }
    case 'return': {
      // Back to her: she comes over; he holds it out, she takes it.
      settleY(ctx, dt);
      ex.setMotion(0, true, 0);
      pose.bend += (0 - pose.bend) * damp(5, dt);
      pose.act = -1;
      pose.step = -1;
      if (ex.animator.posture !== posture) {
        ex.animator.posture = posture;
        ex.animator.postureFeet = false;
      }
      const f = FARM.farmers[s.giver];
      body.yaw += angleDiff(Math.atan2(f.x - body.pos.x, f.z - body.pos.z), body.yaw) * damp(6, dt);
      marks!.showGuide(null);
      if (FARM.helper.act === 'come') {
        if (!herThere(s)) break;
        s.t = 0;
        farmAsk(s.giver, 'take');
        pose.offerHand = s.kind === 'plant' ? 'L' : 'R';
      }
      pose.offer = s.t < SWAP ? smooth(s.t / REACH) : 1 - smooth((s.t - SWAP) / (TAKE - SWAP));
      if (s.tool && s.t >= SWAP) {
        s.tool = false;
        props!.clear();
        FARM.helper.sickle = false;
        SFX.play('farmRustle', 0.8);
      }
      if (s.t >= TAKE) finish(ctx);
      break;
    }
  }
  if (S) {
    frameCam(ctx, s, dt);
    touch(s);
  }
  return { prompt };
}

// ── His keys while he works (the key help, bottom left; touch's jump button) ──

/** At the work: E and Space plant or cut, the stick walks away; elsewhere (on his way, handing over) the stick stops it. */
const KEYS: Record<FarmKind, readonly AddonKey[]> = {
  plant: [
    ['E', 'farmKeyPlant', 'west'],
    ['Space', 'farmKeyPlant', 'south'],
    ['W A S D', 'farmStop', 'lstick'],
    ['Q R', 'rLook', 'rstick'],
  ],
  reap: [
    ['E', 'farmKeyReap', 'west'],
    ['Space', 'farmKeyReap', 'south'],
    ['W A S D', 'farmStop', 'lstick'],
    ['Q R', 'rLook', 'rstick'],
  ],
};
const KEYS_GOING: readonly AddonKey[] = [
  ['W A S D', 'farmStop', 'lstick'],
  ['Q R', 'rLook', 'rstick'],
];
const KEYS_LOOK: readonly AddonKey[] = [['Q R', 'rLook', 'rstick']];

/** The phases where E or Space plants or cuts. */
const atWork = (p: Phase) => p === 'work' || p === 'step';

/** The key help's lines now (the same array while nothing changes). */
function keysNow(): readonly AddonKey[] | null {
  const s = S;
  if (!s) return null;
  if (atWork(s.phase)) return KEYS[s.kind];
  // (the stick stops him on his way and while she hands it over; not while he carries, lays down or is thanked)
  return s.phase === 'fetch' || s.phase === 'take' || s.phase === 'wade' || s.phase === 'return' ? KEYS_GOING : KEYS_LOOK;
}

/** Touch's jump button: "Plant" / "Cut" at the work, hidden meanwhile, its own again after. */
let touchShown: string | null = null;
function touch(s: Session | null): void {
  const want = !s ? null : atWork(s.phase) ? (s.kind === 'plant' ? 'farmBtnPlant' : 'farmBtnReap') : 'hide';
  if (want === touchShown) return;
  touchShown = want;
  touchJump(want as 'farmBtnPlant' | 'farmBtnReap' | 'hide' | null);
}

/** A clump planted or cut now: the field's hill changes, a splash or a swish, his bundle thins or his sheaf grows. */
function done(ctx: RoamCtx, s: Session, h: Hill): void {
  const sl = localSeason(s.strip.plot, season);
  if (s.kind === 'plant') {
    plantHill(h, sl);
    marks!.splashAt(h.x, h.y + 0.11, h.z, 0.32);
    SFX.play('farmPlant', 0.9);
  } else {
    cutHill(h, sl);
    marks!.cutFloor(h.x, h.y, h.z, h.cut0, PLOTS[s.strip.plot].lag);
    SFX.play('farmSwish', 0.9);
  }
  pad.rumble('tick', 0.25);
  s.n++;
  if (s.kind === 'plant') {
    const left = STRIP - s.n;
    if (left <= 0) props!.hold('L', null);
    else props!.hold('L', 'bundle', bundleStage(s.n), true, 0.1);
  } else props!.hold('L', 'sheaf', sheafStage(s.n), true, 0.55);
  void ctx;
}

/** The bundle's stage with `n` clumps planted (full … thin). */
const bundleStage = (n: number) => Math.min(BUNDLE_STAGES - 1, Math.floor((n / STRIP) * BUNDLE_STAGES));
/** The sheaf's stage with `n` cut (its last, tied, only once tied). */
const sheafStage = (n: number) => Math.min(SHEAF_STAGES - 2, Math.floor(((n - 1) / STRIP) * (SHEAF_STAGES - 1)));

// ── A check's state (URL `farm=`) ──────────────────────────────────────────

/** Put him in the state the URL asks for, at once (the farmers are out and the rice is there). */
function place(ctx: RoamCtx, want: NonNullable<typeof pending>): void {
  if (!start(ctx, want.kind)) {
    console.warn(`[map] farm: no room for "${want.kind}" here (farmers ${FARM.shown ? FARM.work : 'not out'})`);
    return;
  }
  const s = S!;
  const { body } = ctx;
  const ex = body.explorer;
  const sl = localSeason(s.strip.plot, season);
  // (a still: the strip as it would be once she has handed him the bundle)
  finishShrink();
  const n = Math.min(STRIP, want.at === 'lay' || want.at === 'thanks' ? STRIP : want.n);
  for (let i = s.n; i < n; i++) {
    const h = s.strip.hills[i];
    if (s.kind === 'plant') plantHill(h, sl, true);
    else {
      cutHill(h, sl, true);
      marks!.cutFloor(h.x, h.y, h.z, h.cut0, PLOTS[s.strip.plot].lag);
    }
  }
  s.n = n;
  const f = FARM.farmers[s.giver];
  const h = FARM.helper;
  if (want.at === 'give') {
    // Facing her, his hand going out to take it.
    _d.set(body.pos.x - f.x, 0, body.pos.z - f.z).normalize();
    body.pos.set(f.x + _d.x * MEET, 0, f.z + _d.z * MEET);
    body.yaw = Math.atan2(f.x - body.pos.x, f.z - body.pos.z);
    setPhase('take');
    s.t = SWAP - 0.05;
    pose.offerHand = s.kind === 'plant' ? 'L' : 'R';
    pose.offer = 1;
    farmAsk(s.giver, 'give');
  } else if (want.at === 'lay' && s.kind === 'reap') {
    standFor(s.strip, STRIP - 1, body.pos);
    s.bund = bundFor(ctx, s.strip);
    body.pos.copy(s.bund.stand);
    body.yaw = Math.atan2(s.bund.ox, s.bund.oz);
    s.tool = true;
    FARM.helper.sickle = true;
    props!.hold('R', 'sickle');
    props!.hold('L', 'sheaf', SHEAF_STAGES - 1, true, 0.55);
    setPhase('lay');
    s.t = LAY_T * 0.45;
    pose.lay = s.t / LAY_T;
    h.tx = s.bund.stand.x - s.bund.ox * 3;
    h.tz = s.bund.stand.z - s.bund.oz * 3;
    farmAsk(s.giver, 'come');
  } else if (want.at === 'thanks') {
    if (s.kind === 'reap') {
      standFor(s.strip, STRIP - 1, body.pos);
      s.bund = bundFor(ctx, s.strip);
      body.pos.copy(s.bund.stand);
      marks!.laySheaf(s.bund.at.x, s.bund.at.y, s.bund.at.z, s.bund.ax, s.bund.az, s.bund.ox, s.bund.oz);
      body.yaw = Math.atan2(-s.bund.ox, -s.bund.oz);
    } else {
      standFor(s.strip, STRIP - 1, body.pos);
      body.yaw = s.face + Math.PI / 2;
    }
    setPhase('thank');
    s.t = (THANK.reach + THANK.swap) / 2 + 0.25;
    pose.offerHand = 'both';
    pose.offer = 1;
    h.tx = body.pos.x + Math.sin(body.yaw) * MEET;
    h.tz = body.pos.z + Math.cos(body.yaw) * MEET;
    h.warp = true;
    farmAsk(s.giver, 'thank');
  } else {
    // At his place in the row, bent over the next clump, his hand on its way to it (n done).
    standFor(s.strip, n, body.pos);
    body.yaw = s.face;
    s.tool = true;
    if (s.kind === 'plant') props!.hold('L', 'bundle', bundleStage(n), true, 0.1);
    else {
      props!.hold('R', 'sickle');
      FARM.helper.sickle = true;
      if (n > 0) props!.hold('L', 'sheaf', sheafStage(n), true, 0.55);
    }
    setPhase('work');
    pose.bend = 1;
    s.act = n > 0 && n < STRIP ? (s.kind === 'plant' ? PLANT_AT - 0.06 : REAP_AT - 0.08) : -1;
    pose.act = s.act;
    farmAsk(s.giver, 'lent');
  }
  // On the ground (sunk where the plot is flooded), the posture and the camera there at once.
  sink = s.kind === 'plant' && paddyFlooded(body.pos.x, body.pos.z) ? SINK : 0;
  body.pos.y = landAt(ctx, body.pos.x, body.pos.z) - sink;
  ex.animator.posture = posture;
  ex.animator.postureFeet = false;
  aim(ctx, s, 0, true);
  if (s.phase === 'work' && s.n < STRIP) {
    const nh = s.strip.hills[s.n];
    marks!.showGuide(_v.set(nh.x, nh.y, nh.z), s.kind === 'plant' && paddyFlooded(nh.x, nh.z));
  }
  ex.object.position.copy(body.pos);
  ex.object.rotation.set(0, body.yaw, 0);
  for (let i = 0; i < 40; i++) ex.update(1 / 30);
  props!.frame(body.yaw);
  const rc = ctx.start.get('rcam')?.split(',').map(Number);
  const cam = ctx.cam;
  const working = s.phase === 'work' || s.phase === 'lay';
  const view = working ? FRAME[s.kind] : SIDE;
  cam.yaw = body.yaw + (rc && Number.isFinite(rc[0]) ? (rc[0] * Math.PI) / 180 : view.yaw * (working ? farmersSide(ctx, s) : 1));
  cam.pitch = rc && Number.isFinite(rc[1]) ? (rc[1] * Math.PI) / 180 : view.pitch;
  cam.distance = rc && rc[2] ? rc[2] : view.distance;
  cam.follow = 0;
  cam.focus.set(body.pos.x, body.pos.y + (working ? 0.95 : 1.15), body.pos.z);
  framed = FRAME_FOR;
  lastPhase = s.phase;
  touch(s);
  // (the prompt as the work's step would show it: a still has no steps after this)
  ctx.hud.prompt(s.phase === 'work' ? workPrompt(s.kind, s.n) : s.phase === 'lay' ? words('farmCarry', false) : null);
  console.info(`[map] farm: ${want.kind}:${want.at === 'work' ? n : want.at} in plot ${s.strip.plot} (season ${season.toFixed(3)}), at (${body.pos.x.toFixed(1)}, ${body.pos.z.toFixed(1)}), with farmer ${s.giver}`);
}

// ── The add-on ─────────────────────────────────────────────────────────────

/** Keys that would start something else (sitting, lying, greeting, emotes, a light, the explorer menu): not while he works. */
const BREAKERS = ['KeyJ', 'KeyL', 'KeyF', 'KeyC', 'KeyU', 'KeyP', 'Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3', 'KeyO', 'KeyI'];

registerAddon({
  id: 'farm',
  // (after the others' default: a ride or a stall near the paddies comes first)
  order: 60,
  init(e) {
    env = e;
  },
  input(_ctx, _mode, tap) {
    return S !== null && tap(...BREAKERS);
  },
  offer(ctx, mode) {
    if (mode !== 'walk' || !env || S || env.busy() || !FARM.shown) return null;
    const p = ctx.body.pos;
    let row = Infinity;
    let any = Infinity;
    for (const f of FARM.farmers) {
      if (!f.shown || Math.abs(f.y - p.y) > OFFER_UP) continue;
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (f.job === 'row') row = Math.min(row, d);
      any = Math.min(any, d);
    }
    const work = FARM.work;
    if ((work === 'plant' || work === 'harvest') && row < OFFER) {
      if (canHelp(ctx)) return words(work === 'plant' ? 'farmHelpPlant' : 'farmHelpReap');
      if (work === 'harvest' && any < COME_BACK) return words('farmReapDone', false);
      return null;
    }
    if (any < COME_BACK) {
      if (work === 'grow') return words('farmComeReap', false);
      if (work === 'dry') return words('farmComePlant', false);
    }
    return null;
  },
  use(ctx) {
    if (FARM.work !== 'plant' && FARM.work !== 'harvest') return;
    if (!canHelp(ctx)) return;
    start(ctx, FARM.work === 'plant' ? 'plant' : 'reap');
  },
  get holding() {
    return S !== null;
  },
  hold(ctx, dt) {
    if (!S) return { prompt: null };
    return step(ctx, dt);
  },
  keys() {
    return keysNow();
  },
  get handsBusy() {
    return S !== null;
  },
  after(ctx, mode, dt) {
    // Back from the work: the camera eases to where it was (unless the player zooms).
    if (S || !before || mode !== 'walk') return;
    if (ctx.input.zoom) {
      before = null;
      return;
    }
    const k = damp(1.6, dt);
    ctx.cam.pitch += (before.pitch - ctx.cam.pitch) * k;
    ctx.cam.distance += (before.distance - ctx.cam.distance) * k;
    ctx.cam.follow = 0.6;
    if (Math.abs(before.pitch - ctx.cam.pitch) < 0.005 && Math.abs(before.distance - ctx.cam.distance) < 0.05) before = null;
  },
  frame(f: MapFrame, mode: RoamMode) {
    season = f.season;
    night = f.night;
    camera = f.camera as PerspectiveCamera;
    const dt = f.dt > 0 ? f.dt : 0;
    if (marks) marks.frame(dt, night, env?.body.scale ?? 1, season);
    if (props && env) props.frame(env.body.yaw);
    if (!env) return;
    // (a check's state, once the farmers are out and the rice is there)
    if (pending && FARM.shown && riceReady() && mode === 'walk' && !S) {
      const want = pending;
      pending = null;
      place(ctxOf(f), want);
    }
    // (a new strip's seedlings shrinking back into the water while she hands him the bundle)
    if (shrinking) {
      shrinkK = Math.min(1, shrinkK + dt / SHRINK_T);
      const sl = localSeason(shrinking.plot, season);
      for (const h of shrinking.hills) if (!h.done && sl >= h.plant0) shrink(h, sl, shrinkK);
      if (shrinkK >= 1) shrinking = null;
    }
    // (the strips kept for him beside the row, and the clumps kept standing: changed where nobody sees)
    if (riceReady() && (f.t >= keptAt || f.t < keptAt - 10)) {
      keptAt = f.t + KEEP_EVERY;
      keep();
    }
  },
  setMode(next) {
    if (next !== 'walk') {
      finish(null);
      if (next === 'overview') before = null;
    }
  },
  fromUrl(q) {
    const v = q.get('farm');
    if (!v) return;
    const [kind, arg] = v.split(':');
    if (kind !== 'plant' && kind !== 'reap') return;
    const n = Number(arg);
    pending = {
      kind,
      n: Number.isFinite(n) ? clamp(Math.round(n), 0, STRIP) : 0,
      at: arg === 'give' || arg === 'lay' || arg === 'thanks' ? arg : Number(arg) >= STRIP ? 'thanks' : 'work',
    };
    if (pending.at === 'lay' && kind === 'plant') pending.at = 'work';
  },
  report() {
    if (!S) return null;
    // (at his place in the row: how far he has got; else the moment, as the URL names it)
    const at = S.phase === 'take' || S.phase === 'fetch' ? 'give' : S.phase === 'lay' || S.phase === 'carry' || S.phase === 'tie' ? (S.kind === 'reap' ? 'lay' : `${S.n}`) : S.phase === 'thank' ? 'thanks' : `${S.n}`;
    return { farm: `${S.kind}:${at}` };
  },
});

/** A roaming context for a check's state from a frame (the add-on's env and the frame: no input). */
function ctxOf(f: MapFrame): RoamCtx {
  const e = env!;
  return {
    world: e.world,
    body: e.body,
    input: e.controls.state,
    cam: e.cam,
    hud: e.hud,
    sound: () => {},
    levels: { wind: 0, wake: 0, sail: 0 },
    t: f.t,
    night: f.night,
    shot: e.shot,
    ledge: { feet: e.body.pos.clone(), yaw: e.body.yaw },
    start: e.params,
    enter: () => {},
  };
}

/** (for type checks: the acts this module asks for) */
export type { FarmAct };
