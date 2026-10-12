import { Vector3, type Mesh } from 'three';
import type { AngkorExplorer } from '../../character/AngkorExplorer';
import { OFFER_KNEEL, offerPose, offerPoseState } from '../../character/offer';
import { BODY_UNIT_M } from '../../world/scale';
import type { PlantKindId } from '../garden/kinds';
import { GARDEN } from '../garden/state';
import { progress } from '../progress';
import { TIME } from '../time';
import type { MapFrame, RoamMode } from '../types';
import { num, onLang, t, type WordKey } from '../ui/lang';
import { BEFORE_SHRINE, registerAddon, type AddonEnv } from './_addons';
import { giftKind, giftKinds, GIVING, stepGift, takeGift } from './_giveFruit';
import { createLaidPool, FRUIT_SIZE, isOfferKind, offerMesh, OFFER_KINDS, setOfferKind, TRAY_R, type LaidPool, type OfferKind } from './_offerFruitModels';
import { shrine } from './_pray';
import { WORSHIP, type WorshipSpot } from './_worship';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * Offering his garden's fruit (add-on `offerFruit`; the giving shared with the
 * sharing add-on: roam/_giveFruit.ts): at a shrine (ថ្វាយ) and to the monks
 * (ប្រគេន). What he gives is one fruit of his garden's basket (garden/state.ts
 * `GARDEN.basket`), of the kinds eaten as they are (`OFFER_KINDS`: bananas, a
 * coconut, mangoes…; not the vegetables): the one he has most of, or the one
 * he picked with `,` / `.` (the prompt says so while he has two kinds or more).
 *
 * - **At a shrine** (every `WORSHIP` spot of roam/_worship.ts: the temples'
 *   Buddhas, the village pagoda, Kulen, the jungle's shrines, the spirit houses
 *   and the neak ta's shrines): "E  ថ្វាយចេក ហើយថ្វាយបង្គំ / Offer bananas and
 *   pray", before the plain "Pray". E: the prayer walks him onto its golden
 *   lotus, turns and kneels him (roam/_pray.ts, as the lotus add-on does); once
 *   both knees are down the prayer waits (its clock held at `OFFER_KNEEL`)
 *   while he takes the fruit out on its little brass tray in both hands, lifts
 *   it to his forehead with his head bowed (លើកថ្វាយ), brings it down, bows
 *   forward and sets it on the floor before the shrine, a little to his left
 *   (the lotus he lays goes to his right; the bows' hands and head stay clear),
 *   sits up, and the prayer goes on: the sampeah, the three bows. The tray
 *   stays there a few map hours (`LAID_DAYS`), then is taken away while nobody
 *   looks. One of that kind out of his basket; a calm toast, counted
 *   (`progress` `offer.count`; a toast at 10, 25, 50, 100…).
 * - **To the monks**: roam/_offerFruitMonk.ts.
 *
 * URL (checks): `offer=shrine[:<spot id>][:<s>]` kneeling at that spot (else
 * the nearest), `s` s into laying it (0.3 out of his bag, 1.3 at his forehead,
 * 3.2 bowing, 3.6 set down); `offerkind=<kind>` the fruit; `offered=<spot
 * id>,…|all` trays lying there (the `offerkind`'s); `basket=<kind>:<n>` (the
 * garden's) gives him fruit. `report()` gives them back.
 */

const ID = 'offerFruit';
/** Metres per body unit (his own; times his `body.scale` on the map). */
const BU = BODY_UNIT_M;

// ── At a shrine: where he sets it, the timeline ────────────────────────────

/** Before him (m at his size 1.4: the tray's middle), to his left (m), its floor no more than this off his own (m). */
const SET_AHEAD = 0.52;
const SET_LEFT = 0.36;
const SET_FLOOR = 0.32;
/** Trays side by side: this far apart (m), at most this many before a spot (then on the first again). */
const SET_APART = 0.42;
const SET_MAX = 3;
/**
 * The timeline (s): out of his bag before his chest, up to his forehead, held there, down to his chest again, the
 * bow forward and down to the floor, let go, up again.
 */
const L = { take: [0, 0.45], lift: [0.45, 1.25], down: [2.0, 2.55], lean: [2.55, 3.45], release: 3.55, back: [3.65, 4.4], end: 4.5 } as const;
/** The gift's middle (the tray's rim, BU in his space kneeling upright): before his chest, at his forehead. */
const CHEST = new Vector3(0, 10.2, 5.4);
const BROW = new Vector3(0, 15.6, 6.2);
/** The tray's rim over its foot (m, real), and its hands' half width (BU: the fists just outside the rim). */
const RIM = 0.05;
const TRAY_HALF = TRAY_R / BU + 0.3;
/** How far he bows forward to set it down, toward his left. */
const SET_LEAN = 0.95;
const SET_SIDE = 0.55;
/** The camera while he offers: from his side with room, behind and a little above, near; back behind him for the bows. */
const LAY_FRAME = { side: 0.95, pitch: 0.3, distance: 5.2, rate: 2.4, back: { pitch: 0.04, distance: 4.5 } };
/** E said "offer": waiting for him to kneel, this long at most (s). */
const PENDING_FOR = 12;
/** Merit toasts at these counts (after the count's own). */
const MILESTONES = [10, 25, 50, 100, 200, 500];

const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const ramp = (s: number, [a, b]: readonly [number, number]) => smooth((s - a) / (b - a));
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The fruit's name in a sentence (ui/lang.ts `offerFruit…`). */
const FRUIT_WORD: Record<OfferKind, WordKey> = {
  banana: 'offerFruitBanana',
  coconut: 'offerFruitCoconut',
  mango: 'offerFruitMango',
  papaya: 'offerFruitPapaya',
  guava: 'offerFruitGuava',
  jackfruit: 'offerFruitJackfruit',
  durian: 'offerFruitDurian',
  sugarPalm: 'offerFruitSugarPalm',
  sugarcane: 'offerFruitSugarcane',
};
export const fruitWord = (k: OfferKind): string => t(FRUIT_WORD[k]);
const okKind = (k: string): boolean => isOfferKind(k);

/** The fruit he would give now (of the kinds that can be offered), or null. */
export function offerKind(): OfferKind | null {
  const k = giftKind(okKind);
  return k && isOfferKind(k) ? k : null;
}

/**
 * The prayer's clock: the Animator's playing action (Animator.ts keeps it to itself; read only here, its shape checked,
 * as roam/_lotus.ts does): held at the kneel while he offers. Null when the prayer is not playing.
 */
function prayClock(ex: AngkorExplorer): { t: number } | null {
  const a = (ex.animator as unknown as { action?: { name?: unknown; t?: unknown; stopping?: unknown } | null }).action;
  return a && a.name === 'pray' && typeof a.t === 'number' && !a.stopping ? (a as { t: number }) : null;
}

/** A point on the map in his space (BU, his feet at the origin, +z the way he faces), into `out`. */
export function toBody(ctx: RoamCtx, x: number, y: number, z: number, out: Vector3): Vector3 {
  const b = ctx.body;
  const k = 1 / (BU * b.scale);
  const dx = x - b.pos.x;
  const dz = z - b.pos.z;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return out.set((c * dx - s * dz) * k, (y - b.pos.y) * k, (s * dx + c * dz) * k);
}
/** A point in his space (BU) on the map, into `out`. */
export function toMap(ctx: RoamCtx, p: Vector3, out: Vector3): Vector3 {
  const b = ctx.body;
  const k = BU * b.scale;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return out.set(b.pos.x + (c * p.x + s * p.z) * k, b.pos.y + p.y * k, b.pos.z + (-s * p.x + c * p.z) * k);
}

// ── The add-on's state ─────────────────────────────────────────────────────

type LayStep = 'off' | 'lay';

let env: AddonEnv | null = null;
let laid: LaidPool | null = null;
/** The fruit in his hands (one mesh, its geometry the kind's), and whether it shows. */
let hand: Mesh | null = null;
let lay: LayStep = 'off';
let lt = 0;
let pending: { spot: WorshipSpot; kind: OfferKind; t: number } | null = null;
let laySpot: WorshipSpot | null = null;
let layKind: OfferKind = 'banana';
const ps = offerPoseState();
/** Where it is set (the tray's foot on the floor), the way it faces. */
const layAt = new Vector3();
let layYaw = 0;
let released = false;
let layCam: { yaw: number; free: boolean } | null = null;
/** URL: a check's start of the offering `s` s in. */
let urlLay: number | null = null;
/** A toast a moment later (s from now). */
let later: { text: string; in: number } | null = null;
/** The roaming step his prompt last showed in (`,` / `.` step his fruit only then), and the steps counted. */
let shownStep = -1;
let stepN = 0;
/** He has stepped through his fruit with `,` / `.` this visit (the prompt's hint goes). */
let stepped = false;

/** The prompts (made when asked: the fruit's name in them). */
const _kinds: PlantKindId[] = [];
export function prompt(key: 'offerShrine' | 'offerMonk' | 'offerBowl', k: OfferKind): string {
  const p = `E  ${t(key, { fruit: fruitWord(k) })}`;
  return !stepped && giftKinds(_kinds, okKind).length > 1 ? `${p}  ·  , .  ${t('offerStep')}` : p;
}
// (the words change with the language: nothing kept)
onLang(() => undefined);

/** Counted: the merit, kept between visits (`monk`: an offering to a monk); the toast's count. */
export function countMerit(monk: boolean): number {
  const n = progress.get('offer.count', 0, isNum) + 1;
  progress.set('offer.count', n);
  if (monk) progress.set('offer.monks', progress.get('offer.monks', 0, isNum) + 1);
  if (MILESTONES.includes(n)) later = { text: t('offerMilestone', { n: num(n) }), in: 3.2 };
  return n;
}

// ── At a shrine ────────────────────────────────────────────────────────────

/** He knelt with fruit to offer: the prayer waits while he lifts it and sets it down. */
function startLay(ctx: RoamCtx, spot: WorshipSpot, kind: OfferKind, at = 0): void {
  const e = env!;
  const b = ctx.body;
  laySpot = spot;
  layKind = kind;
  lay = 'lay';
  lt = at;
  released = false;
  pending = null;
  GIVING.by = ID;
  GIVING.t = 0;
  // Where: before him (he faces the shrine), a little to his left; on the floor there (or nearer, or his own).
  const fx = Math.sin(b.yaw);
  const fz = Math.cos(b.yaw);
  // (his left: +x of his space)
  const lx = Math.cos(b.yaw);
  const lz = -Math.sin(b.yaw);
  const s = b.scale / 1.4;
  let floor = b.pos.y;
  let ahead = SET_AHEAD * s;
  for (const k of [1, 0.85, 0.7]) {
    const x = b.pos.x + fx * SET_AHEAD * s * k + lx * SET_LEFT * s;
    const z = b.pos.z + fz * SET_AHEAD * s * k + lz * SET_LEFT * s;
    const g = ctx.world.groundAt(x, z);
    if (Math.abs(g - b.pos.y) <= SET_FLOOR * s) {
      floor = g;
      ahead = SET_AHEAD * s * k;
      break;
    }
  }
  // (set here already: the next beside it, further to his left; past the third, on the first again)
  const x0 = b.pos.x + fx * ahead + lx * SET_LEFT * s;
  const z0 = b.pos.z + fz * ahead + lz * SET_LEFT * s;
  const n = (laid?.near(x0 + lx * SET_APART * 0.5 * s, z0 + lz * SET_APART * 0.5 * s, SET_APART * 0.9 * s) ?? 0) % SET_MAX;
  layAt.set(x0 + lx * n * SET_APART * s, floor, z0 + lz * n * SET_APART * s);
  layYaw = b.yaw;
  Object.assign(ps, { pray: NaN, stand: false, rise: 1, lean: 0, side: 0, hold: 0, palms: 0, bow: 0, lookW: 0, half: TRAY_HALF, t: 0 });
  ps.gift.copy(CHEST);
  e.explorer.animator.posture = layPosture;
  e.explorer.animator.postureFeet = false;
  // The camera from whichever side has room (his left first: where it goes), else behind, higher.
  const hard = ctx.world.hardClearance ?? ctx.world.clearance;
  const fy = b.pos.y + 1.1 * s;
  const d = LAY_FRAME.distance * s;
  let yaw = NaN;
  for (const side of [-1, 1]) {
    const y = b.yaw + side * LAY_FRAME.side;
    const cp = Math.cos(LAY_FRAME.pitch) * d;
    const ok = (hard?.(b.pos.x, fy, b.pos.z, b.pos.x - Math.sin(y) * cp, fy + Math.sin(LAY_FRAME.pitch) * d, b.pos.z - Math.cos(y) * cp) ?? 1) >= 0.97;
    if (ok && Number.isNaN(yaw)) yaw = y;
  }
  layCam = { yaw: Number.isNaN(yaw) ? b.yaw : yaw, free: ctx.start.has('rcam') && ctx.shot };
}

const layPosture = () => offerPose(ps);

/** Set down: on the floor a few map hours, out of his basket, counted, told. */
function release(): void {
  const e = env!;
  released = true;
  showHand(null);
  laid?.lay(layKind, laySpot?.id ?? '', layAt.x, layAt.y, layAt.z, layYaw, e.body.scale, TIME.days());
  takeGift(layKind);
  const n = countMerit(false);
  e.hud.toast(t('offerDoneShrine', { fruit: fruitWord(layKind), n: num(n) }));
}

/** The offering is over (or stopped: the fruit stays in his basket unless it was set down). */
function endLay(): void {
  const e = env;
  if (!e) return;
  showHand(null);
  if (e.explorer.animator.posture === layPosture) {
    e.explorer.animator.posture = null;
    e.explorer.animator.postureFeet = true;
  }
  if (GIVING.by === ID) GIVING.by = null;
  lay = 'off';
  laySpot = null;
  layCam = null;
}

/** The fruit in his hands (`kind`, on its tray or not; null: none), at the gift's place `p` (BU, his space), `size` 0‥1. */
const _w = new Vector3();
function showHand(kind: OfferKind | null, ctx?: RoamCtx, p?: Vector3, onTray = true, size = 1): void {
  if (!kind || !ctx || !p) {
    if (hand) hand.visible = false;
    return;
  }
  if (!hand) {
    hand = offerMesh('offer:hand');
    env!.scene.add(hand);
  }
  setOfferKind(hand, kind, onTray);
  toMap(ctx, p, _w);
  const s = ctx.body.scale * Math.max(0.001, size);
  // (the gift's place is the tray's rim, or the fruit's middle: its foot under it)
  hand.position.set(_w.x, _w.y - (onTray ? RIM : FRUIT_SIZE[kind].high * 0.5) * s, _w.z);
  hand.rotation.set(0, ctx.body.yaw, 0);
  hand.scale.setScalar(s);
  hand.visible = true;
}

/** One step of the offering at a shrine (after the walker's and the prayer's: the prayer held at its kneel meanwhile). */
const _set = new Vector3();
const _focus = new Vector3();
function stepLay(ctx: RoamCtx, dt: number): void {
  const e = env!;
  const clock = prayClock(e.explorer);
  // (he got up: E, the stick, a key; or the prayer went on some other way)
  if (!clock) {
    endLay();
    return;
  }
  clock.t = OFFER_KNEEL - Math.min(dt, 0.1);
  if (asking()) return;
  lt += dt;
  ps.t += dt;
  GIVING.t = lt;
  const b = ctx.body;
  const s = b.scale;
  // The hands: on the tray out of his bag, up to his forehead, down, out to the floor; let go, back to his thighs.
  ps.hold = lt < L.back[0] ? ramp(lt, L.take) : 1 - ramp(lt, L.back);
  const up = ramp(lt, L.lift);
  const down = ramp(lt, L.down);
  const out = ramp(lt, L.lean);
  ps.lean = lt < L.back[0] ? SET_LEAN * out : SET_LEAN * (1 - ramp(lt, L.back));
  // (toward his left as he bows to set it there: the chest a little round)
  ps.gift.copy(CHEST).lerp(BROW, up * (1 - down));
  toBody(ctx, layAt.x, layAt.y, layAt.z, _set);
  _set.y += RIM / BU;
  ps.gift.lerp(_set, out);
  if (released) ps.gift.y += 1.4 * ramp(lt, [L.release, L.release + 0.35]);
  // (his eyes on it; at his forehead, his head bowed to it)
  ps.look.copy(ps.gift);
  if (up * (1 - down) > 0.5) ps.look.set(0, 2, 16);
  ps.lookW = lt < L.back[0] ? ramp(lt, [0.1, 0.5]) : 1 - ramp(lt, L.back);
  ps.side = SET_SIDE * out * (released ? 1 - ramp(lt, L.back) : 1);
  if (!released) showHand(layKind, ctx, ps.gift, true, smooth((lt - 0.05) / 0.3));
  if (!released && lt >= L.release) release();
  // The camera: round to his side while he offers, then back behind him for the bows.
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
  // (its aim lowered toward where it goes while he sets it down)
  const fw = lt < L.back[0] ? out : 1 - ramp(lt, L.back);
  if (fw > 0) cam.focus.lerp(_focus.set((b.pos.x + layAt.x) / 2, b.pos.y + 0.8 * (s / 1.4), (b.pos.z + layAt.z) / 2), fw * 0.7);
  if (lt >= L.end) endLay();
}
/** A card asks something just now ("Back to the map?": ui/ask.ts), or roaming is on its way back: it waits. */
const asking = (): boolean => (typeof document !== 'undefined' && document.body.classList.contains('mu-asking')) || !(env?.controls.enabled ?? true);

// ── Registration ───────────────────────────────────────────────────────────

registerAddon({
  id: ID,
  order: BEFORE_SHRINE - 1,

  get handsBusy() {
    return lay !== 'off';
  },

  init(e) {
    env = e;
    laid = createLaidPool();
    e.scene.add(laid.object);
    Object.assign(window, {
      __offer: {
        now: () => ({ lay, lt: +lt.toFixed(2), released, pending: pending?.spot.id ?? null, kind: offerKind(), basket: Object.fromEntries(OFFER_KINDS.map((k) => [k, GARDEN.basket(k)])), count: progress.get('offer.count', 0, isNum), monks: progress.get('offer.monks', 0, isNum), giving: GIVING.by }),
        laid: () => laid?.list.filter((l) => l.on),
        pose: ps,
      },
    });
  },

  input(_ctx, mode, tap) {
    stepN++;
    if (mode !== 'walk' || lay !== 'off' || shownStep < stepN - 1) return false;
    // `,` / `.` while his offering's prompt shows: the next fruit of his basket.
    const dir = tap('Comma') ? -1 : tap('Period') ? 1 : 0;
    if (!dir || !env) return false;
    const k = stepGift(dir, okKind);
    if (k && isOfferKind(k)) {
      stepped = true;
      env.hud.toast(t('offerPicked', { fruit: fruitWord(k), n: num(GARDEN.basket(k)) }));
      env.uiSound('tick');
    }
    return false;
  },

  offer(_ctx, mode) {
    const e = env;
    if (!e || mode !== 'walk' || lay !== 'off' || pending || e.busy() || (GIVING.by && GIVING.by !== ID)) return null;
    const k = offerKind();
    if (!k) return null;
    if (!shrine.near()) return null;
    shownStep = stepN;
    return prompt('offerShrine', k);
  },

  use(_ctx, mode) {
    const e = env;
    if (!e || mode !== 'walk') return;
    const spot = shrine.near();
    const k = offerKind();
    if (!spot || !k) return;
    // (the prayer walks him onto its lotus, turns him and kneels him; `after` takes it from the kneel)
    shrine.kneel(spot);
    pending = { spot, kind: k, t: 0 };
  },

  after(ctx, mode, dt) {
    const e = env;
    if (!e || mode !== 'walk') return;
    // E with fruit at a shrine: once both knees are down, he offers it (the prayer waits).
    if (pending && lay === 'off') {
      pending.t += dt;
      const clock = prayClock(e.explorer);
      if (clock && clock.t >= OFFER_KNEEL - 0.08) startLay(ctx, pending.spot, pending.kind, urlLay ?? 0);
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
    laid?.frame(f.camera, TIME.days());
  },

  setMode(next) {
    if (lay !== 'off' && next !== 'walk') endLay();
    if (next !== 'walk') pending = null;
  },

  fromUrl(q, ctx) {
    const e = env;
    if (!e) return;
    const kq = q.get('offerkind');
    const kind: OfferKind = kq && isOfferKind(kq) ? kq : offerKind() ?? 'banana';
    // (the fruit he would give: the URL's, put in his basket if he has none)
    const want = q.get('offer');
    if (kq && isOfferKind(kq)) {
      if (GARDEN.basket(kind) <= 0 && want) GARDEN.fromUrl(new URLSearchParams(`basket=${kind}:3`), () => []);
      stepToward(kind);
    }
    const lying = q.get('offered');
    if (lying && laid) {
      for (const w of WORSHIP) {
        if (lying !== 'all' && !lying.split(',').includes(w.id)) continue;
        // (as he would set it, kneeling at the spot)
        const yaw = Math.atan2(w.fx - w.x, w.fz - w.z);
        const lx = Math.cos(yaw);
        const lz = -Math.sin(yaw);
        const x = w.x + Math.sin(yaw) * SET_AHEAD + lx * SET_LEFT;
        const z = w.z + Math.cos(yaw) * SET_AHEAD + lz * SET_LEFT;
        const g = ctx.world.groundAt(x, z);
        laid.lay(kind, w.id, x, Math.abs(g - w.y) < SET_FLOOR ? g : w.y, z, yaw, ctx.body.scale, TIME.days());
      }
    }
    if (!want) return;
    const [what, a, b] = want.split(':');
    if (what !== 'shrine') return;
    // (`shrine:<id>:<s>`, `shrine:<id>`, `shrine:<s>`, `shrine`)
    const byId = a && Number.isNaN(Number(a)) ? WORSHIP.find((w) => w.id === a) : null;
    const sIn = Number(byId ? b : a);
    const spot = byId ?? shrine.near() ?? nearestSpot(ctx);
    if (!spot) return;
    if (GARDEN.basket(kind) <= 0) GARDEN.fromUrl(new URLSearchParams(`basket=${kind}:3`), () => []);
    stepToward(kind);
    const at = Number.isFinite(sIn) ? Math.max(0, sIn - (q.has('sim') ? 0 : 0.8)) : 0;
    const bd = ctx.body;
    bd.pos.set(spot.x, spot.y, spot.z);
    bd.yaw = Math.atan2(spot.fx - spot.x, spot.fz - spot.z);
    e.explorer.play('pray');
    const clock = prayClock(e.explorer);
    if (clock) clock.t = OFFER_KNEEL;
    pending = { spot, kind, t: 0 };
    urlLay = at;
  },

  report() {
    const out: Record<string, string> = {};
    const k = lay !== 'off' ? layKind : offerKind();
    if (k) out.offerkind = k;
    const lying = laid?.list.filter((l) => l.on && l.spot).map((l) => l.spot) ?? [];
    if (lying.length) out.offered = [...new Set(lying)].join(',');
    if (lay !== 'off' && laySpot && !released) {
      out.offer = `shrine:${laySpot.id}:${Math.max(0, lt - 0.6).toFixed(1)}`;
      out.sim = '_:0.6';
    }
    return Object.keys(out).length ? out : null;
  },
});

/** The chosen fruit made `kind` (a check's): stepped to it through his basket. */
function stepToward(kind: OfferKind): void {
  for (let i = 0; i < 12 && offerKind() !== kind; i++) stepGift(1, okKind);
}

/** The worship spot nearest him (within 8 m, about his floor), for a check's start. */
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
