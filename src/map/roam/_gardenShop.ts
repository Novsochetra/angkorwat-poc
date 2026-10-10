import '../audio/_sell';
import { SFX } from '../audio/addonSfx';
import { KINDS, type PlantKindId } from '../garden/kinds';
import { GARDEN } from '../garden/state';
import { nearby, type Nearby } from '../greet';
import { NURSERY_BUY, NURSERY_SHOP, NURSERY_STOOL, nurseryOpen, nurseryToWorld, nurseryYaw } from '../hamlet/_nurseryPlan';
import { pad } from '../pad/pad';
import { progress } from '../progress';
import { browse, sold, type Shop, type ShopItem } from '../shop';
import { TIME } from '../time';
import type { MapFrame } from '../types';
import { num, onLang, t, type WordKey } from '../ui/lang';
import { registerAddon, type AddonEnv } from './_addons';
import { createGardenShopCard, type GardenShopCard, type ShopTab } from './_gardenShopCard';
import { heldHarvest, heldNursery } from './_gardenShopModel';
import { bagNotify } from './_shopBag';
import { riel } from './_shopPurse';
import { angleDiff } from './followCam';
import type { RoamCtx, RoamWorld } from './types';
// (Grandma's gift on his veranda, and his harvest to eat: add-ons of their own, loaded with this one)
import './_gardenGift';
import './_gardenEat';

/**
 * The seedling nursery (add-on `gardenShop`; the place: hamlet/_nursery.ts,
 * its seller: people/_sceneNursery.ts): where he gets seeds for his home
 * garden and sells what it gives.
 *
 * At her table by the Kulen foot trail, on foot, while she is there (sunrise
 * to the evening): "E  Buy seeds and seedlings". E turns him to her, the
 * camera comes round behind his shoulder (a side nothing stands in, as the
 * buy menu's and the fish sale's), the picture slides so he stands left of
 * the card, she looks up and asks (people/_saleBack.ts through shop.ts
 * `BROWSE`), and the card opens (_gardenShopCard.ts):
 *
 * - **Buy**: the twelve plants with their price in riel (garden/kinds.ts
 *   `price`). One bought: the purse pays (the notes' rustle, the purse
 *   glows), she holds it out to him and thanks him (`SALE`), he reaches and
 *   takes it (the character's `interact`, the packet or the seedling in his
 *   fist: _gardenShopModel.ts), and it is his (`GARDEN.addSeeds`). Short of
 *   riel: the row says so and so does she.
 * - **Sell**: his basket's harvest at her prices (`fruit.sell`): one, or all;
 *   he holds it out to her, she takes it and pays (the coins: `sellCoin`),
 *   the purse earns it (and counts up at the card's foot).
 *
 * Away (her hours over), the prompt says the nursery is closed till the
 * morning, and E says it again. Saved (progress.ts): how many he has bought
 * (`nursery.bought`), sold (`nursery.sold`) and earned (`nursery.earned`).
 *
 * Keys: E at her table; the card's own (1–9, ↑ ↓, ← → or Tab for the tabs,
 * Enter, Esc); the pad (a layer: ✕, ○, its arrows, L1 / R1); touch (the
 * card's rows and tabs; Use takes the one in the ring). A push of the stick
 * walks away (not while a hand-over is under way: it shuts after).
 *
 * URL (checks): `gardenshop=1|buy|sell` he stands at her table facing her,
 * the card open (on that tab) · `gardenshopbuy=<kind>` buys one as it opens
 * · `gardenshopsell=<kind>|all` sells · `gardenshopfocus=<i>` the ring on
 * row i · with `seeds=`, `basket=`, `purse=` (garden/state.ts,
 * _shopPurse.ts) · `nursopen=all|none` (_nurseryPlan.ts) · `sim=_:<s>` how
 * far in (a hand-over: 1.9 s; paid at 0.15 s when buying, 1.25 s selling).
 */

// ── Timing (s) ───────────────────────────────────────────────────────────────

/** Turning to her (a half turn). */
const TURN = 0.45;
/** Buying: what he bought is in his fist from / to (his reach); the next can be bought after `BUY_LOCK`. */
const TAKE_SHOW = 0.5;
const TAKE_END = 1.7;
const BUY_LOCK = 0.55;
/** Selling: his harvest in his fist from / to, into hers at `GIVE`; she pays at `PAY`; done at `HAND_END`. */
const HAND_SHOW = 0.15;
const HAND_GIVE = 0.85;
const PAY = 1.25;
const HAND_END = 1.9;
/** The purse counts up over this long. */
const COUNT = 0.8;
/** The stick past this shuts the card (he walks on). */
const STICK = 0.3;
/** His chest over his feet (m, at his roaming size). */
const CHEST = 1.7 * 0.95 * 0.86;
/** The camera at her table (the buy menu's and the fish sale's): behind his left shoulder, a little above, she and her seedlings past him. */
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
/** Her chest over her stool's ground (seated, m). */
const HER_UP = 1.1;
const SHIFT_MAX = 0.3;
const SHIFT_RATE = 4;
const NARROW_FAR = 1.3;

/** Where he stands at her table (map m), how near counts, and the way he faces her. */
const [BUY_X, BUY_Z] = nurseryToWorld(NURSERY_BUY.x, NURSERY_BUY.z);
const FACING = nurseryYaw(Math.PI);
const [HER_X, HER_Z] = nurseryToWorld(NURSERY_STOOL.x, NURSERY_STOOL.z);

/** The nursery as a shop for the people's seller (shop.ts `BROWSE`, `SALE`): not registered (the buy menu does not offer it). */
const SHOP: Shop = { id: NURSERY_SHOP, name: { km: 'កន្លែងលក់កូនឈើ', en: 'Plant nursery' }, x: BUY_X, y: 0, z: BUY_Z, r: NURSERY_BUY.r, facing: FACING, items: [] };
const ITEM: ShopItem = { id: 'seedling', name: { km: 'កូនឈើ', en: 'Seedling' }, price: 0, consume: 'fruit' };

interface Visit {
  t: number;
  turn: { from: number; by: number; t: number; len: number } | null;
  /** A hand-over: buying (`buy`: the kind he took) or selling (`sell`: which, what she pays), since when (s). */
  hand: { what: 'buy' | 'sell'; kind: PlantKindId; which: PlantKindId | 'all'; n: number; total: number; t: number; shown: boolean; given: boolean; paid: boolean } | null;
  closeAsked: boolean;
  looked: boolean;
}

let env: AddonEnv | null = null;
let card: GardenShopCard | null = null;
let visit: Visit | null = null;
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
/** The prompt last made (asked every step at her table). */
const said = { open: false, text: '' };
onLang(() => (said.text = ''));
const seen: Nearby = { x: 0, y: 0, z: 0, d: 0, kind: '', elder: false };

GARDEN.on((e) => {
  if (e.type === 'seeds' || e.type === 'basket') card?.refill();
});

/** Standing at her table (on foot, about her floor). */
function atTable(x: number, y: number, z: number, floor: number): boolean {
  return (x - BUY_X) ** 2 + (z - BUY_Z) ** 2 <= NURSERY_BUY.r ** 2 && Math.abs(y - floor) < 2.5;
}

function theCard(e: AddonEnv): GardenShopCard {
  return (card ??= createGardenShopCard({
    layer: e.layer,
    onBuy: buy,
    onSell: sell,
    onTab: (tab) => card?.say(tabWords(tab)),
    onClose: askClose,
    sound: (s) => e.uiSound(s),
  }));
}

const tabWords = (tab: ShopTab): WordKey => (tab === 'buy' ? 'gardenShopHi' : GARDEN.basketKinds().length ? 'gardenShopSellHi' : 'gardenShopEmpty');

/** At her table: he turns to her, the camera comes round, she looks up, the card opens. */
function open(ctx: RoamCtx, tab: ShopTab, turnNow: boolean): void {
  const e = env;
  if (!e) return;
  const by = angleDiff(FACING, ctx.body.yaw);
  visit = { t: 0, turn: turnNow ? { from: ctx.body.yaw, by, t: 0, len: TURN * (0.45 + (0.55 * Math.abs(by)) / Math.PI) } : null, hand: null, closeAsked: false, looked: false };
  if (!turnNow) ctx.body.yaw = FACING;
  ctx.body.vel.set(0, 0, 0);
  SHOP.y = ctx.body.pos.y;
  theCard(e).show(tab, e.purse.riel);
  browse(ctx.t, SHOP);
  count = null;
  framed = 0;
  view = clearView(ctx);
  ctx.hud.prompt(null);
}

/** The card shuts: he stands free, she goes back to her seedlings, the camera goes back. */
function closeVisit(quiet = false): void {
  if (!visit) return;
  const h = visit.hand;
  if (h && h.what === 'sell' && !h.paid) pay(visit);
  const ex = env?.explorer;
  if (ex) {
    ex.rig.clearSlot('gardenShop');
    if (ex.currentAction === 'interact') ex.stop('interact');
  }
  visit = null;
  if (card?.open) card.close();
  browse(lastCtx?.t ?? 0, null);
  if (quiet) count = null;
}

/** Esc, the ×, ○, a tap outside, a push of the stick: shut it (after a sale's hand-over under way). */
function askClose(): void {
  if (!visit) return;
  if (visit.hand && visit.hand.what === 'sell') {
    visit.closeAsked = true;
    return;
  }
  closeVisit();
}

/** Buy one of a kind: the purse pays, she hands it over, it is his. */
function buy(k: PlantKindId): void {
  const v = visit;
  const e = env;
  if (!v || !e || (v.hand && (v.hand.what === 'sell' || v.hand.t < BUY_LOCK))) return;
  const price = KINDS[k].price;
  if (price === null) return;
  if (!e.purse.pay(price)) {
    card?.short(k);
    card?.say('gardenShopShort');
    return;
  }
  lastCtx?.sound('coin', 1);
  pad.rumble('tick');
  bagNotify.update('purse');
  card?.purse(e.purse.riel, false);
  sold(lastCtx?.t ?? 0, SHOP, ITEM);
  GARDEN.addSeeds(k, 1);
  progress.set('nursery.bought', progress.get('nursery.bought', 0) + 1);
  e.hud.toast(t('gardenShopGot', { name: t(KINDS[k].name), n: num(GARDEN.seeds(k)) }));
  card?.say('gardenShopBought');
  v.hand = { what: 'buy', kind: k, which: k, n: 1, total: price, t: 0, shown: false, given: true, paid: true };
  const ex = e.explorer;
  ex.rig.clearSlot('gardenShop');
  if (ex.currentAction !== 'interact') {
    if (ex.currentAction) ex.stop();
    ex.play('interact');
  }
}

/** Sell one of a kind, or all: he holds it out to her. */
function sell(which: PlantKindId | 'all'): void {
  const v = visit;
  const e = env;
  // (a seedling just bought still in his fist: it goes into his things, and he holds out his harvest)
  if (!v || !e || (v.hand && (v.hand.what === 'sell' || v.hand.t < BUY_LOCK))) return;
  if (v.hand) {
    e.explorer.rig.clearSlot('gardenShop');
    v.hand = null;
  }
  const kinds = which === 'all' ? GARDEN.basketKinds() : GARDEN.basket(which) > 0 ? [which] : [];
  if (!kinds.length) return;
  let n = 0;
  let total = 0;
  for (const k of kinds) {
    const c = which === 'all' ? GARDEN.basket(k) : 1;
    n += c;
    total += c * KINDS[k].fruit.sell;
  }
  // (the one he holds out: the dearest of them)
  const big = kinds.reduce((a, k) => (KINDS[k].fruit.sell > KINDS[a].fruit.sell ? k : a));
  v.hand = { what: 'sell', kind: big, which, n, total, t: 0, shown: false, given: false, paid: false };
  card?.busy(true);
  const ex = e.explorer;
  if (ex.currentAction && ex.currentAction !== 'interact') ex.stop();
  ex.play('interact');
}

/** She takes it: out of his basket and his hand, her turn to him and the money held out. */
function give(v: Visit, ctx: RoamCtx): void {
  const h = v.hand!;
  h.given = true;
  env?.explorer.rig.clearSlot('gardenShop');
  SFX.play('sellHand', 0.8);
  if (h.which === 'all') for (const k of GARDEN.basketKinds()) GARDEN.takeFromBasket(k, GARDEN.basket(k));
  else GARDEN.takeFromBasket(h.which, 1);
  sold(ctx.t, SHOP, ITEM);
}

/** He is paid: into the purse (it glows; the card's counts up), the coins, the words; saved counts. */
function pay(v: Visit): void {
  const h = v.hand!;
  if (h.paid) return;
  h.paid = true;
  const e = env;
  if (!e) return;
  if (!h.given && lastCtx) give(v, lastCtx);
  const was = e.purse.riel;
  e.purse.earn(h.total);
  SFX.play('sellCoin', 0.9);
  pad.rumble('tick');
  bagNotify.update('purse');
  count = e.shot ? null : { from: was, to: e.purse.riel, t: 0 };
  if (e.shot) card?.purse(e.purse.riel, false);
  e.hud.toast(h.which === 'all' ? t('gardenShopEarnedAll', { riel: riel(h.total) }) : t('gardenShopEarned', { n: num(h.n), item: t(KINDS[h.kind].fruit.item), riel: riel(h.total) }));
  card?.say('gardenShopSoldSay');
  progress.set('nursery.sold', progress.get('nursery.sold', 0) + h.n);
  progress.set('nursery.earned', progress.get('nursery.earned', 0) + h.total);
}

/** One step of the visit (while it holds him): the turn, a hand-over, shutting. */
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
  const h = v.hand;
  if (h) {
    h.t += dt;
    const ex = body.explorer;
    if (h.what === 'buy') {
      // (she holds it out; he reaches and takes it: in his fist a moment)
      if (!h.shown && h.t >= TAKE_SHOW) {
        h.shown = true;
        ex.rig.setSlot('gardenShop', 'propR', heldNursery(h.kind));
      }
      if (h.t >= TAKE_END) {
        ex.rig.clearSlot('gardenShop');
        v.hand = null;
      }
    } else {
      if (!h.shown && h.t >= HAND_SHOW) {
        h.shown = true;
        ex.rig.setSlot('gardenShop', 'propR', heldHarvest(h.kind));
      }
      if (!h.given && h.t >= HAND_GIVE) give(v, ctx);
      if (!h.paid && h.t >= PAY) pay(v);
      if (h.t >= HAND_END) {
        v.hand = null;
        card?.busy(false);
        card?.refill();
        if (v.closeAsked) {
          closeVisit();
          return;
        }
      }
    }
  }
  // (her hours over meanwhile: the card shuts)
  if (!v.hand && lastFrame && !nurseryOpen(lastFrame.clock)) closeVisit();
}

// ── The camera (the buy menu's and the fish sale's ways) ─────────────────────

/**
 * The side the camera takes at her table: a side, a height and a distance from which both he and she show — nothing
 * solid between the camera and him, nor between it and her, nothing right in front of the lens (the shade net's poles,
 * the sign), and, when it can be, nobody at the camera nor across the lines (as the fish sale's `clearView`).
 */
function clearView(ctx: RoamCtx): { side: number; pitch: number; distance: number } {
  const w: RoamWorld = ctx.world;
  const { body, cam } = ctx;
  const yaw = FACING;
  const c = { x: body.pos.x, y: body.pos.y + CHEST * body.scale, z: body.pos.z };
  const her = { x: HER_X, y: body.pos.y + HER_UP, z: HER_Z };
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
    const dh = Math.hypot(her.x - p.x, her.z - p.z);
    return !nearby(p.x, floor, p.z, Math.atan2(her.x - p.x, her.z - p.z), Math.max(0, dh - 1.2), 0.22, seen);
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
        if (pass < 2 && (!sees(a, her) || !lensClear(a, pitch))) continue;
        if ((pass === 0 || pass === 2) && !clearOfPeople(a, distance)) continue;
        out = { side: sd, pitch, distance };
        if (env?.shot) console.info(`[map] gardenShop: the camera's side ${sd.toFixed(2)}, pitch ${pitch.toFixed(2)}, ${distance.toFixed(1)} m (pass ${pass})`);
        break;
      }
    }
  return out ?? { side: FRAME.side * 0.25, pitch: FRAME.pitch * 0.3, distance: Math.max(4, FRAME.distance * 0.7 * far) };
}

/** While at her table: the camera eases to its side, then it is the player's; after, back to the player's pitch and distance. */
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

/** The prompt at her table: "E  Buy seeds and seedlings", or that the nursery is closed. */
function promptAt(here: boolean): string {
  if (said.open !== here || !said.text) {
    said.open = here;
    said.text = here ? `E  ${t('gardenShopPrompt')}` : t('gardenShopClosed');
  }
  return said.text;
}

const clockNow = (): number => lastFrame?.clock ?? TIME.moment(TIME.days()).clock;

registerAddon({
  id: 'gardenShop',
  order: 30,
  init(e) {
    env = e;
    // (checks: what the nursery's flow did, read by a test in the page)
    if (e.shot || import.meta.env.DEV)
      Object.assign(window, {
        __gardenShop: {
          state: () => ({
            open: !!card?.open,
            tab: card?.tab ?? null,
            busy: !!visit?.hand,
            riel: e.purse.riel,
            kept: e.purse.kept.map((k) => k.id),
            seeds: Object.fromEntries(GARDEN.seedKinds().map((k) => [k, GARDEN.seeds(k)])),
            basket: Object.fromEntries(GARDEN.basketKinds().map((k) => [k, GARDEN.basket(k)])),
            gift: GARDEN.gift,
            action: e.explorer.currentAction ?? null,
            // (what he holds to eat: a private of the character's, read only here for checks)
            food: (e.explorer as unknown as { food: { kind: string } | null }).food?.kind ?? null,
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
    if (Math.hypot(i.move.x, i.move.y) > STICK && !(visit.hand && visit.hand.what === 'sell')) {
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
    if (!atTable(p.x, p.y, p.z, ctx.world.field.heightAt(BUY_X, BUY_Z))) return null;
    return promptAt(nurseryOpen(clockNow()));
  },
  use(ctx, mode) {
    if (mode !== 'walk') return;
    if (!nurseryOpen(clockNow())) {
      ctx.hud.toast(t('gardenShopClosed'));
      return;
    }
    open(ctx, 'buy', true);
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
    if (!visit && before && mode === 'walk') frameCam(ctx, dt);
  },
  frame(f) {
    lastFrame = f;
    lens(f);
    if (count && card?.open) {
      count.t += f.dt;
      const u = Math.min(1, count.t / COUNT);
      const e = 1 - (1 - u) * (1 - u);
      card.purse(Math.round(count.from + (count.to - count.from) * e), u < 1);
      if (u >= 1) count = null;
    } else count = null;
  },
  setMode(next) {
    if (next !== 'walk') closeVisit(true);
    if (next === 'overview') before = null;
  },
  fromUrl(q, ctx) {
    lastCtx = ctx;
    keepView = q.has('rcam');
    const spec = q.get('gardenshop');
    if (!spec || !env) return;
    // (at her table, on the floor there, facing her)
    const g = ctx.world.standAt?.(BUY_X, BUY_Z, ctx.world.field.heightAt(BUY_X, BUY_Z) + 0.5, 1.1, 2.3) ?? ctx.world.field.heightAt(BUY_X, BUY_Z);
    ctx.body.pos.set(BUY_X, Number.isNaN(g) ? ctx.world.field.heightAt(BUY_X, BUY_Z) : g, BUY_Z);
    ctx.body.yaw = FACING;
    const qc = Number(q.get('clock'));
    const clock = q.has('clock') && Number.isFinite(qc) ? ((qc % 1) + 1) % 1 : clockNow();
    if (!nurseryOpen(clock)) {
      ctx.hud.prompt(promptAt(false));
      console.info(`[map] gardenShop: the nursery is closed at clock ${clock.toFixed(2)}`);
      return;
    }
    keepView = false;
    open(ctx, spec === 'sell' ? 'sell' : 'buy', false);
    frameNow(ctx);
    const b = q.get('gardenshopbuy');
    if (b && b in KINDS) buy(b as PlantKindId);
    const s = q.get('gardenshopsell');
    if (s && (s === 'all' || s in KINDS)) {
      card?.setTab('sell', false);
      sell(s as PlantKindId | 'all');
    }
    const fo = Number(q.get('gardenshopfocus'));
    if (q.has('gardenshopfocus') && Number.isFinite(fo)) card?.focus(fo);
    console.info(`[map] gardenShop: at the nursery (${BUY_X.toFixed(1)}, ${BUY_Z.toFixed(1)}), ${env.purse.riel} riel`);
  },
  report() {
    return visit && card ? { gardenshop: card.tab } : null;
  },
});
