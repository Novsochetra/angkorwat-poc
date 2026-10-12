import { Vector3 } from 'three';
import type { AngkorExplorer } from '../../character/AngkorExplorer';
import { OFFER_KNEEL, offerPose, offerPoseState } from '../../character/offer';
import { GARDEN } from '../garden/state';
import { progress } from '../progress';
import { TIME } from '../time';
import type { MapFrame, RoamMode } from '../types';
import { num, t } from '../ui/lang';
import { BEFORE_SHRINE, registerAddon, type AddonKey } from './_addons';
import { GIVING, stepGift, takeGift } from './_giveFruit';
import { createLaidPool, isOfferKind, offerGeometry, OFFER_KINDS, TRAY_R, type LaidPool, type OfferKind } from './_offerFruitModels';
import { monkFrame, monkFromUrl, monkHold, monkHolding, monkInit, monkInput, monkNow, monkOffer, monkReport, monkStop, monkUrlJump, monkUse } from './_offerFruitMonk';
import { asking, BU, countMerit, fruitWord, hideHand, isNum, LATER, offerKind, OFFER_ID, okKind, prompt, ramp, RIM, S, showHand, smooth, STEP, toBody } from './_offerFruitShared';
import { shrine } from './_pray';
import { WORSHIP, type WorshipSpot } from './_worship';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * Offering his garden's fruit (add-on `offerFruit`; the giving shared with the
 * sharing add-on: roam/_giveFruit.ts): at a shrine (ថ្វាយ) and to the monks
 * (ប្រគេន: roam/_offerFruitMonk.ts). What he gives is one fruit of his garden's
 * basket (garden/state.ts `GARDEN.basket`), of the kinds eaten as they are
 * (`OFFER_KINDS`: bananas, a coconut, a mango…; not the vegetables): the one he
 * has most of, or the one he picked with `,` / `.` (the prompt says so while he
 * has two kinds or more, until he has used them).
 *
 * - **At a shrine** (every `WORSHIP` spot of roam/_worship.ts: the temples'
 *   Buddhas, the village pagoda, Kulen, the jungle's shrines, the spirit houses
 *   and the neak ta's shrines): "E  ថ្វាយចេក ហើយថ្វាយបង្គំ / Offer bananas and
 *   pray", before the plain "Pray" (a lotus in his bag is offered first: the
 *   lotus add-on's). E: the prayer walks him onto its golden lotus, turns and
 *   kneels him (roam/_pray.ts, as the lotus add-on does); once both knees are
 *   down the prayer waits (its clock held at `OFFER_KNEEL`) while he takes the
 *   fruit out on its little brass tray in both hands, lifts it before his face
 *   with his head bowed to it (លើកថ្វាយ), brings it down, bows forward and sets
 *   it on the floor before the shrine, a little to his left (a lotus he lays
 *   goes to his right; the bows' hands and head stay clear), sits up, and the
 *   prayer goes on: the sampeah, the three bows. The tray stays there a few map
 *   hours (`LAID_DAYS`), then is taken away while nobody looks (a pool of 14).
 *   One of that kind out of his basket; a calm toast, counted (`progress`
 *   `offer.count`; a toast at 10, 25, 50, 100…).
 *
 * URL (checks): `offer=shrine[:<spot id>][:<s>]` kneeling at that spot (else
 * the nearest), `s` s into it (0.3 out of his basket, 1.3 raised, 3.2 bowing,
 * 3.6 set down); `offer=monk|dakbat|bless[…]` (roam/_offerFruitMonk.ts
 * `monkFromUrl`); `offerkind=<kind>` the fruit; `offered=<spot id>,…|all` trays
 * lying there (the `offerkind`'s); `basket=<kind>:<n>` (the garden's) gives him
 * fruit. `report()` gives them back. `__offer.now()` in the console.
 */

// ── At a shrine: where he sets it, the timeline ────────────────────────────

/** Before him (m at his size 1.4: the tray's middle), to his left (m), its floor no more than this off his own (m). */
const SET_AHEAD = 0.38;
const SET_LEFT = 0.3;
const SET_FLOOR = 0.32;
/** Trays side by side: this far apart (m), at most this many before a spot (then on the first again). */
const SET_APART = 0.4;
const SET_MAX = 3;
/**
 * The timeline (s): out of his basket before his chest, raised before his face, held there, down to his chest again,
 * the bow forward and down to the floor, let go, up again.
 */
const L = { take: [0, 0.45], lift: [0.45, 1.25], down: [2.0, 2.55], lean: [2.55, 3.45], release: 3.55, back: [3.65, 4.4], end: 4.5 } as const;
/** The gift's middle (the tray's rim, BU in his space kneeling upright): before his chest, raised before his face. */
const CHEST = new Vector3(0, 10.2, 5.4);
const BROW = new Vector3(0, 13.2, 7.4);
/** The fists just outside the tray's rim (BU). */
const TRAY_HALF = TRAY_R / BU + 0.3;
/** How far he bows forward to set it down (toward the prayer's bow), over to his left. */
const SET_STOOP = 0.36;
const SET_LEAN = 0.3;
const SET_SIDE = 0.5;
/** The camera while he offers: from his side with room, behind and a little above, near; back behind him for the bows. */
const LAY_FRAME = { side: 0.95, pitch: 0.3, distance: 5.2, rate: 2.4, back: { pitch: 0.04, distance: 4.5 } };
/** E said "offer": waiting for him to kneel, this long at most (s). */
const PENDING_FOR = 12;

/** The key help while he gives to a monk (E, Space or the stick gets him up; the drag looks). */
const KEYS: readonly AddonKey[] = [
  ['E', 'dakUp', 'west'],
  ['Q R', 'rLook', 'rstick'],
];

/**
 * The prayer's clock: the Animator's playing action (Animator.ts keeps it to itself; read only here, its shape checked,
 * as roam/_lotus.ts does): held at the kneel while he offers. Null when the prayer is not playing.
 */
function prayClock(ex: AngkorExplorer): { t: number } | null {
  const a = (ex.animator as unknown as { action?: { name?: unknown; t?: unknown; stopping?: unknown } | null }).action;
  return a && a.name === 'pray' && typeof a.t === 'number' && !a.stopping ? (a as { t: number }) : null;
}

// ── The add-on's state ─────────────────────────────────────────────────────

let laid: LaidPool | null = null;
let lay: 'off' | 'lay' = 'off';
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
/** URL: a check's start of the offering `s` s in; a check's camera (`rcam=`: held, whatever the prayer's framing does). */
let urlLay: number | null = null;
let urlOrbit: { yaw: number; pitch: number; distance: number } | null = null;

// ── At a shrine ────────────────────────────────────────────────────────────

/** Where he sets it kneeling at (x, y, z) facing `yaw` (the floor there, or nearer, or his own), into `out`; beside those there. */
function setPlace(ctx: RoamCtx, x: number, y: number, z: number, yaw: number, scale: number, out: Vector3): Vector3 {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  // (his left: +x of his space)
  const lx = Math.cos(yaw);
  const lz = -Math.sin(yaw);
  const s = scale / 1.4;
  let floor = y;
  let ahead = SET_AHEAD * s;
  for (const k of [1, 0.85, 0.7]) {
    const g = ctx.world.groundAt(x + fx * SET_AHEAD * s * k + lx * SET_LEFT * s, z + fz * SET_AHEAD * s * k + lz * SET_LEFT * s);
    if (Math.abs(g - y) <= SET_FLOOR * s) {
      floor = g;
      ahead = SET_AHEAD * s * k;
      break;
    }
  }
  // (set here already: the next beside it, further to his left; past the third, on the first again)
  const x0 = x + fx * ahead + lx * SET_LEFT * s;
  const z0 = z + fz * ahead + lz * SET_LEFT * s;
  const n = (laid?.near(x0 + lx * SET_APART * 0.5 * s, z0 + lz * SET_APART * 0.5 * s, SET_APART * 0.9 * s) ?? 0) % SET_MAX;
  return out.set(x0 + lx * n * SET_APART * s, floor, z0 + lz * n * SET_APART * s);
}

/** He knelt with fruit to offer: the prayer waits while he raises it and sets it down. */
function startLay(ctx: RoamCtx, spot: WorshipSpot, kind: OfferKind, at = 0): void {
  const e = S.env!;
  const b = ctx.body;
  laySpot = spot;
  layKind = kind;
  lay = 'lay';
  lt = at;
  released = false;
  pending = null;
  GIVING.by = OFFER_ID;
  GIVING.t = 0;
  setPlace(ctx, b.pos.x, b.pos.y, b.pos.z, b.yaw, b.scale, layAt);
  layYaw = b.yaw;
  Object.assign(ps, { pray: NaN, stand: false, rise: 1, lean: 0, side: 0, stoop: 0, hold: 0, palms: 0, bow: 0, lookW: 0, half: TRAY_HALF, t: 0 });
  ps.gift.copy(CHEST);
  e.explorer.animator.posture = layPosture;
  e.explorer.animator.postureFeet = false;
  // The camera from whichever side has room (his left first: where it goes), else behind, higher.
  const s = b.scale / 1.4;
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
  layCam = { yaw: Number.isNaN(yaw) ? b.yaw : yaw, free: (ctx.start.has('rcam') || ctx.start.has('cam')) && ctx.shot };
}

const layPosture = () => offerPose(ps);

/** Set down: on the floor a few map hours, out of his basket, counted, told. */
function release(): void {
  const e = S.env!;
  released = true;
  hideHand();
  laid?.lay(layKind, laySpot?.id ?? '', layAt.x, layAt.y, layAt.z, layYaw, e.body.scale, TIME.days());
  takeGift(layKind);
  const n = countMerit(false);
  e.hud.toast(t('offerDoneShrine', { fruit: fruitWord(layKind), n: num(n) }));
}

/** The offering is over (or stopped: the fruit stays in his basket unless it was set down). */
function endLay(): void {
  const e = S.env;
  if (!e) return;
  hideHand();
  if (e.explorer.animator.posture === layPosture) {
    e.explorer.animator.posture = null;
    e.explorer.animator.postureFeet = true;
  }
  if (GIVING.by === OFFER_ID) GIVING.by = null;
  lay = 'off';
  laySpot = null;
  layCam = null;
}

/** One step of the offering at a shrine (after the walker's and the prayer's: the prayer held at its kneel meanwhile). */
const _set = new Vector3();
const _focus = new Vector3();
function stepLay(ctx: RoamCtx, dt: number): void {
  const e = S.env!;
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
  // The hands: on the tray out of his basket, raised before his face, down, out to the floor; let go, back to his thighs.
  ps.hold = lt < L.back[0] ? ramp(lt, L.take) : 1 - ramp(lt, L.back);
  const up = ramp(lt, L.lift);
  const down = ramp(lt, L.down);
  const out = ramp(lt, L.lean);
  const back = released ? 1 - ramp(lt, L.back) : 1;
  ps.stoop = SET_STOOP * out * back;
  ps.lean = SET_LEAN * out * back;
  ps.side = SET_SIDE * out * back;
  ps.gift.copy(CHEST).lerp(BROW, up * (1 - down));
  toBody(ctx, layAt.x, layAt.y, layAt.z, _set);
  _set.y += RIM / BU;
  ps.gift.lerp(_set, out);
  if (released) ps.gift.y += 1.4 * ramp(lt, [L.release, L.release + 0.35]);
  // (his eyes on it; raised, his head bowed to it)
  ps.look.copy(ps.gift);
  if (up * (1 - down) > 0.5) ps.look.set(0, 5, 16);
  ps.lookW = lt < L.back[0] ? ramp(lt, [0.1, 0.5]) : 1 - ramp(lt, L.back);
  if (!released) showHand(layKind, ctx, ps.gift, true, smooth((lt - 0.05) / 0.3));
  if (!released && lt >= L.release) release();
  // The camera: round to his side while he offers, then back behind him for the bows.
  const cam = ctx.cam;
  if (layCam && !layCam.free) {
    if (ctx.input.lookYaw || ctx.input.lookPitch) layCam.free = true;
    else {
      const k = 1 - Math.exp(-LAY_FRAME.rate * dt);
      const behind = lt >= L.back[0];
      cam.yaw += angleDiff(behind ? b.yaw : layCam.yaw, cam.yaw) * k;
      cam.pitch += ((behind ? LAY_FRAME.back.pitch : LAY_FRAME.pitch) - cam.pitch) * k;
      cam.distance += ((behind ? LAY_FRAME.back.distance : LAY_FRAME.distance) * (s / 1.4) - cam.distance) * k;
    }
  }
  if (urlOrbit) {
    cam.yaw = cam.behindYaw = b.yaw + urlOrbit.yaw;
    cam.pitch = urlOrbit.pitch;
    cam.distance = urlOrbit.distance;
  }
  // (its aim lowered toward where it goes while he sets it down)
  const fw = lt < L.back[0] ? out : 1 - ramp(lt, L.back);
  if (fw > 0) cam.focus.lerp(_focus.set((b.pos.x + layAt.x) / 2, b.pos.y + 0.8 * (s / 1.4), (b.pos.z + layAt.z) / 2), fw * 0.7);
  if (lt >= L.end) endLay();
}

// ── Registration ───────────────────────────────────────────────────────────

registerAddon({
  id: OFFER_ID,
  order: BEFORE_SHRINE - 1,

  get holding() {
    return monkHolding();
  },
  get handsBusy() {
    return lay !== 'off' || monkHolding();
  },

  keys() {
    return monkHolding() ? KEYS : null;
  },

  init(e) {
    S.env = e;
    laid = createLaidPool();
    e.scene.add(laid.object);
    monkInit(laid);
    // (the fruit's shapes made in idle time, a kind at a time, his basket's first: no hitch the first time he offers)
    if (!e.shot && typeof requestIdleCallback === 'function') {
      const order = [...OFFER_KINDS].sort((a, b) => GARDEN.basket(b) - GARDEN.basket(a));
      let i = 0;
      const next = () => {
        if (i >= order.length * 2) return;
        const k = order[i >> 1];
        offerGeometry(k, (i & 1) === 0);
        i++;
        requestIdleCallback(next, { timeout: 4000 });
      };
      requestIdleCallback(next, { timeout: 4000 });
    }
    Object.assign(window, {
      __offer: {
        now: () => ({ lay, lt: +lt.toFixed(2), released, pending: pending?.spot.id ?? null, kind: offerKind(), basket: Object.fromEntries(OFFER_KINDS.map((k) => [k, GARDEN.basket(k)])), count: progress.get('offer.count', 0, isNum), monks: progress.get('offer.monks', 0, isNum), giving: GIVING.by, monk: monkNow() }),
        laid: () => laid?.list.filter((l) => l.on),
        pose: ps,
        /** The fruit in his hands: shown, where (m), its scale; his feet. */
        hand: () => ({ visible: S.hand?.visible ?? false, at: S.hand?.position.toArray().map((v) => +v.toFixed(2)), scale: S.hand?.scale.x, feet: e.body.pos.toArray().map((v) => +v.toFixed(2)), yaw: +e.body.yaw.toFixed(2), inScene: !!S.hand?.parent }),
        /** The walk map's floor at (x, z) (m), for working out new worship spots. */
        ground: (x: number, z: number) => e.world.groundAt(x, z),
      },
    });
  },

  input(ctx, mode, tap) {
    STEP.stepN++;
    if (mode === 'walk' && monkHolding()) return monkInput(ctx);
    if (mode !== 'walk' || lay !== 'off' || STEP.shownStep < STEP.stepN - 1) return false;
    // `,` / `.` while his offering's prompt shows: the next fruit of his basket.
    const dir = tap('Comma') ? -1 : tap('Period') ? 1 : 0;
    if (!dir || !S.env) return false;
    const k = stepGift(dir, okKind);
    if (k && isOfferKind(k)) {
      STEP.stepped = true;
      S.env.hud.toast(t('offerPicked', { fruit: fruitWord(k), n: num(GARDEN.basket(k)) }));
      S.env.uiSound('tick');
    }
    return false;
  },

  offer(ctx, mode) {
    const e = S.env;
    if (!e || mode !== 'walk' || lay !== 'off' || pending || monkHolding() || e.busy() || (GIVING.by && GIVING.by !== OFFER_ID)) return null;
    const k = offerKind();
    if (!k) return null;
    if (shrine.near()) return prompt('offerShrine', k);
    return monkOffer(ctx);
  },

  use(ctx, mode) {
    const e = S.env;
    if (!e || mode !== 'walk') return;
    const spot = shrine.near();
    const k = offerKind();
    if (!k) return;
    if (!spot) {
      monkUse(ctx);
      return;
    }
    // (the prayer walks him onto its lotus, turns him and kneels him; `after` takes it from the kneel)
    shrine.kneel(spot);
    pending = { spot, kind: k, t: 0 };
  },

  hold(ctx, dt) {
    return monkHold(ctx, dt);
  },

  after(ctx, mode, dt) {
    const e = S.env;
    if (!e || mode !== 'walk') return;
    monkUrlJump(ctx);
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
    if (!S.env) return;
    if (LATER.in > 0 && (LATER.in -= f.dt) <= 0 && mode !== 'overview') S.env.hud.toast(LATER.text);
    laid?.frame(f.camera, TIME.days());
    if (mode === 'walk') monkFrame(f.dt);
  },

  setMode(next) {
    if (lay !== 'off' && next !== 'walk') endLay();
    if (next !== 'walk') {
      pending = null;
      monkStop();
    }
  },

  fromUrl(q, ctx) {
    const e = S.env;
    if (!e) return;
    const kq = q.get('offerkind');
    const want = q.get('offer');
    const kind: OfferKind = kq && isOfferKind(kq) ? kq : (offerKind() ?? 'banana');
    // (the fruit he would give: the URL's, put in his basket if he has none)
    if (want && GARDEN.basket(kind) <= 0) GARDEN.fromUrl(new URLSearchParams(`basket=${kind}:3`), () => []);
    if (kq && isOfferKind(kq)) stepToward(kind);
    const lying = q.get('offered');
    if (lying && laid) {
      for (const w of WORSHIP) {
        if (lying !== 'all' && !lying.split(',').includes(w.id)) continue;
        // (as he would set it, kneeling at the spot)
        const yaw = Math.atan2(w.fx - w.x, w.fz - w.z);
        setPlace(ctx, w.x, w.y, w.z, yaw, ctx.body.scale, _set);
        laid.lay(kind, w.id, _set.x, _set.y, _set.z, yaw, ctx.body.scale, TIME.days());
      }
    }
    if (!want) return;
    const [what, a, b] = want.split(':');
    // (a shot without `sim=` settles 0.8 s before its picture: counted in)
    const settle = q.has('sim') ? 0 : 0.8;
    if (what === 'monk' || what === 'dakbat' || what === 'bless') {
      const n = Number(b);
      monkFromUrl(ctx, what, a, Number.isFinite(n) ? Math.max(0, n - settle) : 0, kind);
      return;
    }
    if (what !== 'shrine') return;
    // (`shrine:<id>:<s>`, `shrine:<id>`, `shrine:<s>`, `shrine`)
    const byId = a && Number.isNaN(Number(a)) ? WORSHIP.find((w) => w.id === a) : null;
    const sIn = Number(byId ? b : a);
    const spot = byId ?? shrine.near() ?? nearestSpot(ctx);
    if (!spot) return;
    const at = Number.isFinite(sIn) ? Math.max(0, sIn - settle) : 0;
    const bd = ctx.body;
    bd.pos.set(spot.x, spot.y, spot.z);
    bd.yaw = Math.atan2(spot.fx - spot.x, spot.fz - spot.z);
    e.explorer.play('pray');
    const clock = prayClock(e.explorer);
    if (clock) clock.t = OFFER_KNEEL;
    pending = { spot, kind, t: 0 };
    urlLay = at;
    const rc = ctx.shot ? q.get('rcam')?.split(',').map(Number) : null;
    if (rc && rc.length >= 3) urlOrbit = { yaw: (rc[0] * Math.PI) / 180, pitch: (rc[1] * Math.PI) / 180, distance: rc[2] };
  },

  report() {
    const out: Record<string, string> = {};
    const k = lay !== 'off' ? layKind : offerKind();
    if (k) out.offerkind = k;
    const lying = laid?.list.filter((l) => l.on && l.spot && !l.spot.startsWith('bless-')).map((l) => l.spot) ?? [];
    if (lying.length) out.offered = [...new Set(lying)].join(',');
    if (lay !== 'off' && laySpot && !released) {
      out.offer = `shrine:${laySpot.id}:${Math.max(0, lt - 0.6).toFixed(1)}`;
      out.sim = '_:0.6';
    }
    const m = monkReport();
    if (m) Object.assign(out, m);
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
