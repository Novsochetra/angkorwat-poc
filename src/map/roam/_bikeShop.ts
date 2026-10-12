import type { Group } from 'three';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { BODY_UNIT_M } from '../../world/scale';
import '../audio/_bike';
import { SFX } from '../audio/addonSfx';
import { nearby, type Nearby } from '../greet';
import { pad } from '../pad/pad';
import { browse, sold, type Shop, type ShopItem } from '../shop';
import { TIME } from '../time';
import type { MapFrame } from '../types';
import { onLang, t } from '../ui/lang';
import { registerAddon, type AddonEnv } from './_addons';
import { BIKE_KINDS, BIKE_OWN, buyBike, costFor, isKind, kindOf, tradeIn, type BikeKindId } from './_bikeOwn';
import { createBikeShopCard, type BikeShopCard } from './_bikeShopCard';
import { BIKE_SHOP, BIKE_SHOP_ID, SHOP_BUY, SHOP_MECHANIC, SHOP_STOOL, atShopFront, shopOpen, shopToWorld, shopYaw } from './_bikeShopPlan';
import { buildShopStall, installShopWalk } from './_bikeShopStall';
import { MAP_SPOTS } from '../ui/_minimapSpots';
import { bagNotify } from './_shopBag';
import { riel } from './_shopPurse';
import { angleDiff } from './followCam';
import type { RoamCtx, RoamWorld } from './types';

/**
 * The bicycle shop (add-on `bikeShop`; where everything is: _bikeShopPlan.ts,
 * the stall: _bikeShopStall.ts, its mechanic: people/_sceneBikeShop.ts, the
 * card: _bikeShopCard.ts): a repair-and-sale stall at the sugar-palm
 * village's morning market, behind its row of parked motos and bicycles,
 * where he buys a bicycle of his own (roam/_bikeOwn.ts) instead of riding off
 * on the neighbours' (roam/_bike.ts: theirs say so now).
 *
 * Before the stall, on foot, in its hours (after sunrise to the late
 * afternoon): "E  Buy a bicycle". E turns him to the mechanic, the camera
 * comes round behind his shoulder (a side nothing stands in, as the nursery's
 * and the fish sale's), the picture slides so he stands left of the card, the
 * mechanic looks up and asks (people/_saleBack.ts through shop.ts `BROWSE`),
 * and the card opens: the black town bicycle (60,000 ៛), the sky-blue lady's
 * bicycle (85,000 ៛), the red one with a back seat (120,000 ៛). He has one
 * already: the one he picks costs its price less half of his (`tradeIn`: it
 * goes back to the shop; the same one says "Yours"). Short of riel: the row
 * says how much more he needs, and so does the mechanic.
 *
 * Bought: the purse pays (the notes' rustle, the purse glows), the mechanic
 * holds out its key on a red tag and thanks him (`SALE`), he reaches and
 * takes it (`interact`, the key in his fist), the bell rings twice and the
 * new bicycle stands on its stand before the stall's east end (`buyBike`; the
 * bicycle add-on draws it), its badge "My bicycle" on the maps; the card
 * shuts by itself a moment later. Saved (progress.ts): `bike.own`,
 * `bike.ownAt`, `bike.bought`.
 *
 * Out of hours the line before the stall says it is closed till the morning
 * (no key; E says it again); in them, while the mechanic is still walking in,
 * that he is coming.
 *
 * Keys: E before the stall; the card's own (1–3, ↑ ↓, Enter, Esc); the pad (a
 * layer: ✕, ○, its arrows); touch (the card's rows; Use takes the one in the
 * ring). A push of the stick walks away (not during a sale: it shuts after).
 *
 * URL (checks): `bikeshop=1` he stands at the stall facing the mechanic, the
 * card open · `bikeshopbuy=<kind>` buys it as it opens · `bikeshopfocus=<i>`
 * the ring on row i · with `purse=`, `bikeown=` (_bikeOwn.ts) ·
 * `bikeshopopen=all|none` (_bikeShopPlan.ts) · `sim=_:<s>` how far in (the
 * hand-over: 1.9 s; the card shuts at 2.6 s).
 */

// ── Timing (s) ───────────────────────────────────────────────────────────────

/** Turning to the mechanic (a half turn). */
const TURN = 0.45;
/** Buying: the key in his fist from / to; the card shuts by itself after `SHUT`. */
const TAKE_SHOW = 0.5;
const TAKE_END = 1.9;
const SHUT = 2.6;
/** The purse counts down over this long. */
const COUNT = 0.8;
/** The stick past this shuts the card (he walks on). */
const STICK = 0.3;
/** His chest over his feet (m, at his roaming size). */
const CHEST = 1.7 * 0.95 * 0.86;
/** The camera at the stall (the nursery's ways): behind his left shoulder, a little above, the mechanic and his bicycles past him. */
const FRAME = { side: -1.1, pitch: 0.24, distance: 8.2, rate: 2.2, back: 2.4, for: 2.6 };
const VIEW_TRIES: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, 0.8],
  [1.5, 0.8],
  [0.6, 0.9],
  [1.5, 0.62],
  [0.3, 0.7],
  [0, 0.55],
];
const SIDES = [-1.1, 1.1, -0.8, 0.8, -1.4, 1.4, -0.5, 0.5, -0.25, 0.25];
const OUT = 1.2;
const SIDE = 0.6;
const PEOPLE_CONE = 0.3;
const LENS_CLEAR = 3.5;
const LENS_FAN = [-0.45, -0.22, 0, 0.22, 0.45];
const NEAR_PEOPLE = 2.4;
/** The mechanic's chest over the ground (seated on his low stool, m). */
const HIS_UP = 1.1;
const SHIFT_MAX = 0.3;
const SHIFT_RATE = 4;
const NARROW_FAR = 1.3;
/** The stall is drawn while the camera is within this (m). */
const DRAW_NEAR = 340;

/** Where the buyer stands (map m), the way he faces the mechanic, where the mechanic sits. */
const [BUY_X, BUY_Z] = shopToWorld(SHOP_BUY.x, SHOP_BUY.z);
const FACING = shopYaw(Math.PI);
const [HIS_X, HIS_Z] = shopToWorld(SHOP_STOOL.x, SHOP_STOOL.z);

/** The shop for the people's mechanic (shop.ts `BROWSE`, `SALE`): not registered (the buy menu does not offer it). */
const SHOP: Shop = { id: BIKE_SHOP_ID, name: { km: 'ហាងកង់', en: 'Bicycle shop' }, x: BUY_X, y: 0, z: BUY_Z, r: SHOP_BUY.r, facing: FACING, items: [] };
const ITEM: ShopItem = { id: 'bicycle-key', name: { km: 'សោកង់', en: 'Bicycle key' }, price: 0, consume: 'fruit' };

interface Visit {
  t: number;
  turn: { from: number; by: number; t: number; len: number } | null;
  /** A sale under way: what he bought, since when (s), the key shown in his fist (and put away again). */
  sale: { kind: BikeKindId; t: number; shown: boolean; gone: boolean } | null;
  looked: boolean;
}

let env: AddonEnv | null = null;
let card: BikeShopCard | null = null;
let visit: Visit | null = null;
let stall: Group | null = null;
let lastFrame: MapFrame | null = null;
let lastCtx: RoamCtx | null = null;
let before: { pitch: number; distance: number } | null = null;
let view = { side: FRAME.side, pitch: FRAME.pitch, distance: FRAME.distance };
let framed = 0;
let keepView = false;
let shiftX = 0;
let shiftY = 0;
let shifted = false;
let count: { from: number; to: number; t: number } | null = null;
/** The prompt last made (asked every step before the stall). */
const said = { what: '' as string, text: '' };
onLang(() => (said.text = ''));
const seen: Nearby = { x: 0, y: 0, z: 0, d: 0, kind: '', elder: false };

/** The key on a red tag he takes from the mechanic (his right fist: the rig's `bikeShop` slot on `propR`, body units). */
function heldKey(): VoxelBuilder {
  const b = new VoxelBuilder();
  // (the fist's rest place, character space BU: as _gardenShopModel.ts)
  const F = { x: -5.65, y: 10.6, z: 0 };
  const M = 1 / BODY_UNIT_M;
  const put = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, mat: 'leather' | 'shirt' = 'leather') =>
    b.box(F.x + x * M, F.y + y * M, F.z + z * M, sx * M, sy * M, sz * M, color, mat);
  put(0, 0.02, 0.06, 0.012, 0.075, 0.01, 0xd8b048);
  put(0.012, -0.012, 0.06, 0.016, 0.01, 0.01, 0xd8b048);
  put(0, 0.065, 0.06, 0.03, 0.03, 0.01, 0xc8a038);
  put(0, 0.1, 0.06, 0.008, 0.04, 0.008, 0xb82c26, 'shirt');
  put(0, 0.13, 0.06, 0.04, 0.05, 0.006, 0xd23a30, 'shirt');
  return b;
}

/** Standing before the stall to buy (on foot, about its floor). */
function atBuy(x: number, y: number, z: number, floor: number): boolean {
  return (x - BUY_X) ** 2 + (z - BUY_Z) ** 2 <= SHOP_BUY.r ** 2 && Math.abs(y - floor) < 2.5;
}

function theCard(e: AddonEnv): BikeShopCard {
  return (card ??= createBikeShopCard({ layer: e.layer, onBuy: buy, onClose: askClose, sound: (s) => e.uiSound(s) }));
}

/** At the stall: he turns to the mechanic, the camera comes round, the mechanic looks up, the card opens. */
function open(ctx: RoamCtx, turnNow: boolean): void {
  const e = env;
  if (!e) return;
  const by = angleDiff(FACING, ctx.body.yaw);
  visit = { t: 0, turn: turnNow ? { from: ctx.body.yaw, by, t: 0, len: TURN * (0.45 + (0.55 * Math.abs(by)) / Math.PI) } : null, sale: null, looked: false };
  if (!turnNow) ctx.body.yaw = FACING;
  ctx.body.vel.set(0, 0, 0);
  SHOP.y = ctx.body.pos.y;
  theCard(e).show(e.purse.riel);
  browse(ctx.t, SHOP);
  count = null;
  framed = 0;
  view = clearView(ctx);
  ctx.hud.prompt(null);
}

/** The card shuts: he stands free, the mechanic goes back to his work, the camera goes back. */
function closeVisit(quiet = false): void {
  if (!visit) return;
  const ex = env?.explorer;
  if (ex) {
    ex.rig.clearSlot('bikeShop');
    if (ex.currentAction === 'interact') ex.stop('interact');
  }
  visit = null;
  if (card?.open) card.close();
  browse(lastCtx?.t ?? 0, null);
  if (quiet) count = null;
}

/** Esc, the ×, ○, a tap outside, a push of the stick: shut it (after the key is in his hand). */
function askClose(): void {
  if (!visit || visit.sale) return;
  closeVisit();
}

/** Buy one: the purse pays (less the trade-in), the mechanic hands over the key, the bicycle is his before the stall. */
function buy(k: BikeKindId): void {
  const v = visit;
  const e = env;
  if (!v || !e || v.sale) return;
  if (BIKE_OWN.kind === k) {
    card?.say('bikeShopYoursSay');
    return;
  }
  const cost = costFor(k);
  const was = e.purse.riel;
  if (!e.purse.pay(cost)) {
    card?.short(k);
    card?.say('bikeShopShortSay');
    pad.rumble('tick');
    return;
  }
  const traded = BIKE_OWN.kind ? tradeIn(BIKE_OWN.kind) : 0;
  lastCtx?.sound('coin', 1);
  pad.rumble('tick');
  bagNotify.update('purse');
  count = e.shot ? null : { from: was, to: e.purse.riel, t: 0 };
  card?.purse(e.shot ? e.purse.riel : was, false);
  sold(lastCtx?.t ?? 0, SHOP, ITEM);
  buyBike(k);
  // (one line: the hud shows one message at a time)
  e.hud.toast(traded ? t('bikeShopGotTraded', { name: t(kindOf(k).name), riel: riel(traded) }) : t('bikeShopGot', { name: t(kindOf(k).name) }));
  card?.say('bikeShopBoughtSay');
  card?.refill(k);
  card?.busy(true);
  v.sale = { kind: k, t: 0, shown: false, gone: false };
  const ex = e.explorer;
  ex.rig.clearSlot('bikeShop');
  if (ex.currentAction !== 'interact') {
    if (ex.currentAction) ex.stop();
    ex.play('interact');
  }
  console.info(`[map] bikeShop: bought the ${k} bicycle for ${cost} riel${traded ? ` (${traded} traded in)` : ''}; ${e.purse.riel} riel left`);
}

/** One step of the visit (while it holds him): the turn, a sale's hand-over, shutting. */
function step(ctx: RoamCtx, dt: number): void {
  const v = visit!;
  const { body } = ctx;
  v.t += dt;
  if (v.turn) {
    const tr = v.turn;
    tr.t += dt;
    const k = Math.min(1, tr.t / tr.len);
    body.yaw = tr.from + tr.by * k * k * (3 - 2 * k);
    if (k >= 1) v.turn = null;
  }
  if (!v.looked && v.t >= 0.15) {
    v.looked = true;
    const was = view;
    view = clearView(ctx);
    if ((view.side !== was.side || view.pitch !== was.pitch) && !keepView) {
      if (env?.shot) frameNow(ctx);
      else framed = Math.min(framed, FRAME.for - 1);
    }
  }
  const s = v.sale;
  if (s) {
    s.t += dt;
    const ex = body.explorer;
    // (the mechanic holds out the key; he reaches and takes it: in his fist a moment)
    if (!s.shown && s.t >= TAKE_SHOW) {
      s.shown = true;
      ex.rig.setSlot('bikeShop', 'propR', heldKey());
      // (the new bicycle's bell, twice: the mechanic rings it as he wheels it out)
      SFX.play('bikeBell', 0.8);
    }
    if (!s.gone && s.t >= TAKE_END) {
      s.gone = true;
      ex.rig.clearSlot('bikeShop');
    }
    if (s.t >= SHUT) {
      card?.busy(false);
      closeVisit();
      return;
    }
  }
  // (the shop's hours over meanwhile: the card shuts)
  if (!s && lastFrame && !shopOpen(lastFrame.clock)) closeVisit();
}

// ── The camera (the nursery's and the fish sale's ways) ──────────────────────

/**
 * The side the camera takes at the stall: a side, a height and a distance from which both he and the mechanic show —
 * nothing solid between the camera and him, nor between it and the mechanic, nothing right in front of the lens (the
 * tarp's poles, the pumps), and, when it can be, nobody at the camera nor across the lines (as the nursery's).
 */
function clearView(ctx: RoamCtx): { side: number; pitch: number; distance: number } {
  const w: RoamWorld = ctx.world;
  const { body, cam } = ctx;
  const yaw = FACING;
  const c = { x: body.pos.x, y: body.pos.y + CHEST * body.scale, z: body.pos.z };
  const his = { x: HIS_X, y: body.pos.y + HIS_UP, z: HIS_Z };
  const hard = w.hardClearance ?? w.clearance;
  const soft = w.softClearance;
  const floor = body.pos.y;
  const p = { x: 0, y: 0, z: 0 };
  const place = (a: number, pitch: number, dist: number) => {
    const d = dist + OUT;
    const cp = Math.cos(pitch);
    p.x = c.x - Math.sin(a) * cp * d;
    p.y = c.y + Math.sin(pitch) * d;
    p.z = c.z - Math.cos(a) * cp * d;
  };
  const sees = (a: number, q: { x: number; y: number; z: number }) => {
    for (const k of [0, 1, -1]) {
      const px = p.x + Math.cos(a) * SIDE * k;
      const pz = p.z - Math.sin(a) * SIDE * k;
      if ((hard?.(q.x, q.y, q.z, px, p.y, pz) ?? 1) < 0.98) return false;
      if (soft && (soft(q.x, q.y, q.z, px, p.y, pz, true) < 0.95 || soft(px, p.y, pz, q.x, q.y, q.z) < 0.95)) return false;
    }
    return true;
  };
  const lensClear = (a: number, pitch: number) => {
    for (const da of LENS_FAN)
      for (const dp of da === 0 ? [0, 0.3] : [0]) {
        const yy = a + da;
        const pp = pitch + dp;
        const cp = Math.cos(pp);
        const qx = p.x + Math.sin(yy) * cp * LENS_CLEAR;
        const qy = p.y - Math.sin(pp) * LENS_CLEAR;
        const qz = p.z + Math.cos(yy) * cp * LENS_CLEAR;
        if ((hard?.(p.x, p.y, p.z, qx, qy, qz) ?? 1) < 0.999) return false;
        if (soft && soft(p.x, p.y, p.z, qx, qy, qz) < 0.97) return false;
      }
    return true;
  };
  const clearOfPeople = (a: number, dist: number) => {
    if (nearby(body.pos.x, floor, body.pos.z, a + Math.PI, dist + OUT, PEOPLE_CONE, seen)) return false;
    if (nearby(p.x, floor, p.z, 0, NEAR_PEOPLE, Math.PI, seen)) return false;
    const dh = Math.hypot(his.x - p.x, his.z - p.z);
    return !nearby(p.x, floor, p.z, Math.atan2(his.x - p.x, his.z - p.z), Math.max(0, dh - 1.2), 0.22, seen);
  };
  const far = cam.camera.aspect < 0.8 ? NARROW_FAR : 1;
  let out: { side: number; pitch: number; distance: number } | null = null;
  for (let pass = 0; pass < 4 && !out; pass++)
    for (const [pk, dk] of VIEW_TRIES) {
      if (out) break;
      for (const sd of SIDES) {
        const a = yaw + sd;
        const pitch = FRAME.pitch * pk;
        const distance = Math.max(4, FRAME.distance * dk * far);
        place(a, pitch, distance);
        if (!sees(a, c)) continue;
        if (pass < 2 && (!sees(a, his) || !lensClear(a, pitch))) continue;
        if ((pass === 0 || pass === 2) && !clearOfPeople(a, distance)) continue;
        out = { side: sd, pitch, distance };
        if (env?.shot) console.info(`[map] bikeShop: the camera's side ${sd.toFixed(2)}, pitch ${pitch.toFixed(2)}, ${distance.toFixed(1)} m (pass ${pass})`);
        break;
      }
    }
  return out ?? { side: FRAME.side * 0.25, pitch: FRAME.pitch * 0.3, distance: Math.max(4, FRAME.distance * 0.7 * far) };
}

/** While at the stall: the camera eases to its side, then it is the player's; after, back to the player's pitch and distance. */
function frameCam(ctx: RoamCtx, dt: number): void {
  const cam = ctx.cam;
  if (visit && !keepView) {
    before ??= { pitch: cam.pitch, distance: cam.distance };
    const yaw = (visit.turn ? visit.turn.from + visit.turn.by : ctx.body.yaw) + view.side;
    cam.behindYaw = yaw;
    framed += dt;
    if (framed > FRAME.for) return;
    const k = 1 - Math.exp(-FRAME.rate * dt);
    cam.yaw += angleDiff(yaw, cam.yaw) * k;
    cam.pitch += (view.pitch - cam.pitch) * k;
    cam.distance += (view.distance - cam.distance) * k;
    return;
  }
  if (!before) return;
  const k = 1 - Math.exp(-FRAME.back * dt);
  cam.pitch += (before.pitch - cam.pitch) * k;
  cam.distance += (before.distance - cam.distance) * k;
  if (Math.abs(before.pitch - cam.pitch) < 0.005 && Math.abs(before.distance - cam.distance) < 0.05) before = null;
}

/** The camera at once where it eases to (a check's shot). */
function frameNow(ctx: RoamCtx): void {
  const { cam, body } = ctx;
  before ??= { pitch: cam.pitch, distance: cam.distance };
  framed = FRAME.for;
  cam.focus.set(body.pos.x, body.pos.y + CHEST * body.scale, body.pos.z);
  cam.yaw = FACING + view.side;
  cam.behindYaw = cam.yaw;
  cam.pitch = view.pitch;
  cam.distance = view.distance;
}

/** The lens shift while the card is open: the picture slides so he stands in the middle of what the card leaves free. */
function lens(f: MapFrame): void {
  const el = card?.open ? card.el : null;
  let wx = 0;
  let wy = 0;
  if (el && f.roam !== 'overview' && !keepView) {
    const W = innerWidth;
    const H = innerHeight;
    if (el.offsetWidth > W * 0.7) wy = Math.min(SHIFT_MAX, Math.max(0, 0.5 - el.offsetTop / 2 / H));
    else wx = Math.min(SHIFT_MAX, Math.max(0, 0.5 - el.offsetLeft / 2 / W));
  }
  const k = env?.shot || f.dt <= 0 ? 1 : 1 - Math.exp(-SHIFT_RATE * f.dt);
  shiftX += (wx - shiftX) * k;
  shiftY += (wy - shiftY) * k;
  const camera = f.camera;
  if (Math.abs(shiftX) < 1e-4 && Math.abs(shiftY) < 1e-4) {
    shiftX = shiftY = 0;
    if (shifted) {
      shifted = false;
      if (camera.view?.enabled) camera.clearViewOffset();
    }
    return;
  }
  shifted = true;
  camera.setViewOffset(innerWidth, innerHeight, shiftX * innerWidth, shiftY * innerHeight, innerWidth, innerHeight);
}

/** The line before the stall: "E  Buy a bicycle", that it is closed, or that the mechanic is coming. */
type Said = 'buy' | 'coming' | 'closed';
function promptAt(what: Said): string {
  if (said.what !== what || !said.text) {
    said.what = what;
    said.text = what === 'buy' ? `E  ${t('bikeShopPrompt')}` : t(what === 'coming' ? 'bikeShopComing' : 'bikeShopClosed');
  }
  return said.text;
}

/**
 * The mechanic is on his stool to serve him (or the people part is left out: the shop sells without him; in a shot's
 * scripted steps, which run before the people's, he is there whenever the shop is open, as he starts on his stool).
 */
const mechanicThere = (): boolean => !SHOP_MECHANIC.ready || SHOP_MECHANIC.atStall || !!env?.shot;

/**
 * What the stall says to him where he stands: at the buyer's place, open and the mechanic there, "E  Buy…"; anywhere
 * before the stall, open but the mechanic not on his stool yet (walking in), that he is coming; out of hours, that it
 * is closed; else nothing. Standing nearer his own bicycle (delivered before the stall) than the buyer's place: nothing
 * (E rides it).
 */
function stallSays(x: number, y: number, z: number, floor: number): Said | null {
  if (Math.abs(y - floor) > 2.5) return null;
  const front = atShopFront(x, z);
  const buyHere = atBuy(x, y, z, floor);
  if (!front && !buyHere) return null;
  if (BIKE_OWN.kind && (x - BIKE_OWN.x) ** 2 + (z - BIKE_OWN.z) ** 2 < (x - BUY_X) ** 2 + (z - BUY_Z) ** 2) return null;
  if (!shopOpen(clockNow())) return 'closed';
  if (!mechanicThere()) return 'coming';
  return buyHere ? 'buy' : null;
}

const clockNow = (): number => lastFrame?.clock ?? TIME.moment(TIME.days()).clock;

// ── The maps: "My bicycle" where it stands ───────────────────────────────────

/**
 * The big map's badge for his bicycle (ui/_minimapSpots.ts `my-bike`: the mini-map reads its place each frame; the big
 * map placed its button once): moved to where the bicycle stands, hidden while he has none. Its place in % comes from
 * two fixed badges' (the big map's scale, whatever it is).
 */
function placeBigBadge(): boolean {
  if (typeof document === 'undefined') return true;
  const btn = document.querySelector<HTMLElement>(".mm-spot[data-id='my-bike']");
  if (!btn) return false;
  btn.hidden = !BIKE_OWN.kind || BIKE_OWN.riding;
  if (btn.hidden) return true;
  const a = document.querySelector<HTMLElement>(".mm-spot[data-id='back-hamlet']");
  const b = document.querySelector<HTMLElement>(".mm-spot[data-id='east-village']");
  const pa = REF_A ? { x: REF_A.bx, z: REF_A.bz } : null;
  const pb = REF_B ? { x: REF_B.bx, z: REF_B.bz } : null;
  if (!a || !b || !pa || !pb) return false;
  const ax = parseFloat(a.style.left);
  const az = parseFloat(a.style.top);
  const bx = parseFloat(b.style.left);
  const bz = parseFloat(b.style.top);
  if (![ax, az, bx, bz].every(Number.isFinite) || pa.x === pb.x || pa.z === pb.z) return false;
  const sx = (bx - ax) / (pb.x - pa.x);
  const sz = (bz - az) / (pb.z - pa.z);
  btn.style.left = `${(ax + (BIKE_OWN.x - pa.x) * sx).toFixed(3)}%`;
  btn.style.top = `${(az + (BIKE_OWN.z - pa.z) * sz).toFixed(3)}%`;
  return true;
}
/** `BIKE_OWN.n` when the big map's badge was last placed (−1: not yet: the big map may not be made yet). */
let placedN = -1;
/** The two badges the big map's scale is read from (far apart both ways: the hamlet behind Angkor Wat, the sugar-palm village). */
const REF_A = MAP_SPOTS.find((m) => m.id === 'back-hamlet');
const REF_B = MAP_SPOTS.find((m) => m.id === 'east-village');

/**
 * The bicycle shop's and his bicycle's names on the big map only while their badge is pointed at, picked or the
 * target (as the nursery's): round the market and the village the names would cover each other. Their pictures show.
 */
function quietBigMapNames(): void {
  if (typeof document === 'undefined' || document.getElementById('bs-bigmap-style')) return;
  const st = document.createElement('style');
  st.id = 'bs-bigmap-style';
  st.textContent = `.mm-spot:is([data-id='bike-shop'], [data-id='my-bike']):not(:hover, :focus-visible, .is-target) .mm-place-label { display: none; }`;
  document.head.append(st);
}

// ── The add-on ───────────────────────────────────────────────────────────────

registerAddon({
  id: 'bikeShop',
  order: 30,
  init(e) {
    env = e;
    // The stall into roaming's scene, its solid parts into the walk map.
    const t0 = performance.now();
    const floor = e.world.field.heightAt(BIKE_SHOP.x, BIKE_SHOP.z);
    const built = buildShopStall(e.world.field);
    stall = built.object;
    e.scene.add(stall);
    installShopWalk(e.world, floor);
    console.info(`[map] bikeShop: the stall at (${BIKE_SHOP.x.toFixed(1)}, ${BIKE_SHOP.z.toFixed(1)}), ${built.blocks} blocks, built in ${(performance.now() - t0).toFixed(1)} ms`);
    quietBigMapNames();
    // (checks: what the shop did, read by a test in the page)
    if (e.shot || import.meta.env.DEV)
      Object.assign(window, {
        __bikeShop: {
          state: () => ({
            open: !!card?.open,
            ring: card?.ring ?? null,
            busy: !!visit?.sale,
            riel: e.purse.riel,
            own: BIKE_OWN.kind ? { kind: BIKE_OWN.kind, colour: BIKE_OWN.colour, at: [+BIKE_OWN.x.toFixed(2), +BIKE_OWN.z.toFixed(2), +((BIKE_OWN.yaw * 180) / Math.PI).toFixed(1)] } : null,
            costs: Object.fromEntries(BIKE_KINDS.map((k) => [k.id, costFor(k.id)])),
            mechanic: { ...SHOP_MECHANIC },
            action: e.explorer.currentAction ?? null,
          }),
        },
      });
  },
  get holding() {
    return visit !== null;
  },
  get handsBusy() {
    return visit !== null;
  },
  input(ctx, mode) {
    lastCtx = ctx;
    if (!visit) return false;
    const i = ctx.input;
    if (mode !== 'walk') {
      closeVisit();
      return false;
    }
    if (Math.hypot(i.move.x, i.move.y) > STICK && !visit.sale) {
      closeVisit();
      return false;
    }
    if (i.exit) askClose();
    else if (i.use) card?.confirm();
    i.exit = i.use = false;
    return true;
  },
  offer(ctx, mode) {
    if (mode !== 'walk' || !env || env.busy() || visit) return null;
    const p = ctx.body.pos;
    const w = stallSays(p.x, p.y, p.z, ctx.world.field.heightAt(BUY_X, BUY_Z));
    return w ? promptAt(w) : null;
  },
  use(ctx, mode) {
    if (mode !== 'walk') return;
    const p = ctx.body.pos;
    const w = stallSays(p.x, p.y, p.z, ctx.world.field.heightAt(BUY_X, BUY_Z));
    if (w === 'closed' || w === 'coming') {
      ctx.hud.toast(t(w === 'closed' ? 'bikeShopClosed' : 'bikeShopComing'));
      return;
    }
    if (w === 'buy') open(ctx, true);
  },
  hold(ctx, dt) {
    const { body, cam } = ctx;
    lastCtx = ctx;
    body.vel.set(0, 0, 0);
    body.grounded = true;
    body.explorer.setMotion(0, true, 0);
    cam.focus.set(body.pos.x, body.pos.y + CHEST * body.scale, body.pos.z);
    cam.fov = 50;
    if (visit) step(ctx, dt);
    frameCam(ctx, dt);
    return { prompt: null };
  },
  after(ctx, mode, dt) {
    lastCtx = ctx;
    // (someone at the stall in its hours: the mechanic looks up and stays)
    const p = ctx.body.pos;
    SHOP_MECHANIC.wanted = mode === 'walk' && (visit !== null || (atShopFront(p.x, p.z) && shopOpen(clockNow())));
    if (!visit && before && mode === 'walk') frameCam(ctx, dt);
  },
  frame(f) {
    lastFrame = f;
    lens(f);
    // (his bicycle bought, left somewhere, ridden: its badge on the big map follows; nothing else a frame)
    if (BIKE_OWN.n !== placedN && placeBigBadge()) placedN = BIKE_OWN.n;
    // (far off the stall is not drawn: its blocks are a few pixels from there)
    if (stall) {
      const c = f.camera.position;
      stall.visible = (c.x - BIKE_SHOP.x) ** 2 + (c.z - BIKE_SHOP.z) ** 2 < DRAW_NEAR * DRAW_NEAR;
    }
    if (count && card?.open) {
      count.t += f.dt;
      const u = Math.min(1, count.t / COUNT);
      const e = 1 - (1 - u) * (1 - u);
      card.purse(Math.round(count.from + (count.to - count.from) * e), u < 1);
      if (u >= 1) count = null;
    } else count = null;
  },
  setMode(next) {
    if (next !== 'walk') {
      closeVisit(true);
      SHOP_MECHANIC.wanted = false;
    }
    if (next === 'overview') before = null;
  },
  fromUrl(q, ctx) {
    lastCtx = ctx;
    keepView = q.has('rcam');
    if (q.get('bikeshop') !== '1' || !env) return;
    // (before the stall, on the floor there, facing the mechanic)
    const g = ctx.world.standAt?.(BUY_X, BUY_Z, ctx.world.field.heightAt(BUY_X, BUY_Z) + 0.5, 1.1, 2.3) ?? ctx.world.field.heightAt(BUY_X, BUY_Z);
    ctx.body.pos.set(BUY_X, Number.isNaN(g) ? ctx.world.field.heightAt(BUY_X, BUY_Z) : g, BUY_Z);
    ctx.body.yaw = FACING;
    const qc = Number(q.get('clock'));
    const clock = q.has('clock') && Number.isFinite(qc) ? ((qc % 1) + 1) % 1 : clockNow();
    if (!shopOpen(clock)) {
      ctx.hud.prompt(promptAt('closed'));
      console.info(`[map] bikeShop: the shop is closed at clock ${clock.toFixed(2)}`);
      return;
    }
    keepView = false;
    open(ctx, false);
    frameNow(ctx);
    const b = q.get('bikeshopbuy');
    if (isKind(b)) buy(b);
    const fo = Number(q.get('bikeshopfocus'));
    if (q.has('bikeshopfocus') && Number.isFinite(fo)) card?.focus(fo);
    console.info(`[map] bikeShop: at the stall (${BUY_X.toFixed(1)}, ${BUY_Z.toFixed(1)}), ${env.purse.riel} riel`);
  },
  report() {
    return visit && card ? { bikeshop: '1' } : null;
  },
});
