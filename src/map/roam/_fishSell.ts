import '../audio/_sell';
import { SFX } from '../audio/addonSfx';
import { nearby, type Nearby } from '../greet';
import { pad } from '../pad/pad';
import { progress } from '../progress';
import { TIME } from '../time';
import { sold, type Shop, type ShopItem } from '../shop';
import type { MapFrame, RoamMode } from '../types';
import { num, onLang, t } from '../ui/lang';
import { registerAddon, type AddonEnv } from './_addons';
import { BASKET_ICON, fishIcon } from './_fishSellArt';
import { basket, BASKET_MAX, fishName, fishPrice, parseBasket, type BasketFish } from './_fishSellBasket';
import { createSaleCard, type SaleCard } from './_fishSellCard';
import { catchChoice, sellUi } from './_fishSellChoice';
import { basketBuilder, heldFishBuilder } from './_fishSellModel';
import { buyerNear, fishBuyers, type FishBuyer } from './_fishSellSpots';
import { esc, injectSellStyle } from './_fishSellStyle';
import { BAG_MORE, bagNotify } from './_shopBag';
import { riel } from './_shopPurse';
import { angleDiff } from './followCam';
import type { RoamCtx, RoamWorld } from './types';

/**
 * Selling his fish (add-on `sellfish`): he earns riel with the fish he
 * catches.
 *
 * 1. **Keep or let go**: when he holds up a fish he caught from the boat
 *    (_fishing.ts), the catch card asks (_fishSellChoice.ts): keep it in his
 *    fish basket (a small woven bamboo one: up to five fish) or let it go.
 *    The basket hangs over the boat's left side in the water (_fishing.ts),
 *    at the back of his left hip on foot (here: the rig's `fishBasket`
 *    slot), the tails of the last fish out of its mouth (_fishSellModel.ts);
 *    the explorer menu's "In my bag" lists them (_shopBag.ts `BAG_MORE`).
 * 2. **At a fish seller** (_fishSellSpots.ts: the floating village's landing,
 *    its fish boat and its grilled fish man, the morning market's fish stall
 *    and fish seller, the fish seller behind Angkor Wat), on foot, with fish
 *    in his basket: "E  Sell your fish (3)". E turns him to her, the camera
 *    comes round behind his shoulder (a side nothing stands in, as the buy
 *    menu's), the picture slides so he stands left of the card, and the sale
 *    card opens (_fishSellCard.ts): she weighs each fish on her hanging dial
 *    scale (its needle swings, a tick and the spring's wobble: `sellScale`),
 *    then its price shows. "Sell all" or one at a time: he crouches and holds
 *    the fish out to her (the character's `interact`, the fish in his right
 *    fist: the `sellFish` slot), she turns to him, holds out the money and
 *    says "អរគុណបង!" (people/_saleBack.ts, through shop.ts `SALE`), the
 *    purse earns it (`sellCoin`: notes counted, a coin, a small rising
 *    chime; the purse at the top glows, the card's counts up). The last fish
 *    sold, the card shuts by itself.
 * 3. **Away**: outside her hours the prompt says when to come back (the
 *    morning; the grill at midday), and E says it again.
 * 4. **Fish do not keep**: back to the map, the basket is empty (the catch
 *    card says so until he has kept one: saved `sell.told`). Saved too: how
 *    many fish he has sold (`sell.sold`) and the riel it brought
 *    (`sell.earned`).
 *
 * Keys: E at a seller; the sale card's own (1–5, ↑ ↓, Enter, Esc); the pad
 * (a layer: ✕, ○, its arrows); touch (the card's rows; Use takes the one in
 * the ring). Esc, the ×, ○ or a push of the stick shuts it (not while a fish
 * is being handed over: it shuts after).
 *
 * URL (checks): `fishbasket=<kind>:<cm>,…` the basket's fish
 * (_fishSellBasket.ts) · `sellfish=1` the sale card open at the seller by
 * `at=` · `sellfish=<id>` at that seller's spot, facing her, the card open
 * (ids: `village-fish`, `village-boat-fish`, `village-grill`,
 * `market-fish`, `market-fishG`, `back-fish`; an unknown one lists them) ·
 * `sellbuy=all|<i>` sells (all, or fish i from 1) as soon as she has
 * weighed them · `sellfocus=<i>` the ring on row i (0 "Sell all") ·
 * `sim=_:<s>` how far in (weighing: 0.35 s and 0.4 s a fish; a hand-over
 * 1.9 s, paid at 1.25 s). The catch card: _fishing.ts (`fishing=catch:<kind>`,
 * `fishing=keep:<kind>`, `fishchoice=0|1`).
 */

// ── Timing (s) ───────────────────────────────────────────────────────────────

/** Turning to her (a half turn). */
const TURN = 0.45;
/** She weighs the first fish this long after the card opens, then one each `WEIGH_EACH`. */
const WEIGH_FIRST = 0.35;
const WEIGH_EACH = 0.4;
/** A hand-over: the fish in his hand from / to (his reach), into hers; she pays at `PAY`; done at `HAND_END`. */
const HAND_SHOW = 0.15;
const HAND_GIVE = 0.85;
const PAY = 1.25;
const HAND_END = 1.9;
/** The purse counts up over this long. */
const COUNT = 0.8;
/** The last fish sold: the card shuts this long after the money. */
const CLOSE_AFTER = 1.5;
/** The stick past this shuts the card (he walks on). */
const STICK = 0.3;
/** His head over his feet (m, at his roaming size): the camera's look point is his chest. */
const CHEST = 1.7 * 0.95 * 0.86;
/**
 * The camera at the seller (the buy menu's: _shop.ts `FRAME.menu`): behind his left shoulder, a little above,
 * the seller and her fish past him; eased there over `FOR` s, then the player's; back as it was after.
 */
const FRAME = { side: -1.1, pitch: 0.24, distance: 8.2, rate: 2.2, back: 2.4, for: 2.6 };
/** The views tried (pitch and distance times these), the camera's clear margins, the cone kept free of people. */
const VIEW_TRIES: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, 0.8],
  [1.5, 0.8],
  [0.6, 0.9],
  [1.5, 0.62],
  [0.3, 0.7],
  [0, 0.55],
];
/** The sides tried (radians from behind him, − round to his left). */
const SIDES = [-1.1, 1.1, -0.8, 0.8, -1.4, 1.4, -0.5, 0.5, -0.25, 0.25];
const OUT = 1.2;
const SIDE = 0.6;
const PEOPLE_CONE = 0.3;
/**
 * Nothing near the lens (a post, a roof's edge, leaves): rays this long (m) from the camera across what it sees
 * (left, middle, right, and the bottom of the picture); nobody within `NEAR_PEOPLE` m of it; the seller looked for
 * `HER_AHEAD` m in front of where he stands to sell, at `HER_UP` m over its floor (squatting or standing: her chest).
 */
const LENS_CLEAR = 3.5;
const LENS_FAN = [-0.45, -0.22, 0, 0.22, 0.45];
const NEAR_PEOPLE = 2.4;
const HER_AHEAD = 2.0;
const HER_UP = 1.2;
/** The picture slides (a lens shift) so he stands in the middle of what the card leaves free: at most this share, at this rate (1/s). */
const SHIFT_MAX = 0.3;
const SHIFT_RATE = 4;
const NARROW_FAR = 1.3;

/** A sale under way at a seller. */
interface Sale {
  buyer: FishBuyer;
  /** Seconds since the card opened. */
  t: number;
  turn: { from: number; by: number; t: number; len: number } | null;
  /** Fish weighed so far, and when the next is. */
  weighed: number;
  nextWeigh: number;
  /** A hand-over: which fish (basket indices), what she pays, since when (s), what has happened. */
  hand: { which: number[]; fish: BasketFish[]; total: number; t: number; shown: boolean; given: boolean; paid: boolean } | null;
  /** The card shuts this far in (the last fish sold, or asked to while a fish was handed over): -1 not. */
  closeAt: number;
  closeAsked: boolean;
  /** For checks: sell this as soon as all is weighed (`sellbuy=`). */
  auto: number | 'all' | null;
  /** The camera's side looked for again a moment in (who stands where: the people move, and a check's are placed by then). */
  looked: boolean;
}

let env: AddonEnv | null = null;
let card: SaleCard | null = null;
let sale: Sale | null = null;
let lastFrame: MapFrame | null = null;
let lastCtx: RoamCtx | null = null;
/** The roaming mode now (`setMode`). */
let curMode: RoamMode = 'overview';
/** The hip basket as built (its basket version; -1 none). */
let hipV = -1;
/** The camera: the player's before, the view taken, how long framed; the URL's camera kept. */
let before: { pitch: number; distance: number } | null = null;
let view = { side: FRAME.side, pitch: FRAME.pitch, distance: FRAME.distance };
let framed = 0;
let keepView = false;
/** The lens shift now (shares of the view: + the picture slides left, up), and whether it is ours to clear. */
let shiftX = 0;
let shiftY = 0;
let shifted = false;
/** The purse at the card's foot, counting up: from, to, since (s). */
let count: { from: number; to: number; t: number } | null = null;
/** The prompt last made (asked every step at a seller: made again only when the seller, the count, her hours or the language change). */
const said = { b: null as FishBuyer | null, n: -1, here: false, text: '' };
onLang(() => (said.text = ''));
const seen: Nearby = { x: 0, y: 0, z: 0, d: 0, kind: '', elder: false };
/** A seller as a shop, for the people's seller (shop.ts `SALE`: she turns to him, holds out the money, thanks him). */
const shops = new Map<string, Shop>();
const FISH_ITEM: ShopItem = { id: 'fish', name: { km: 'ត្រី', en: 'Fish' }, price: 0, consume: 'skewer' };

// ── The basket in "In my bag" (the explorer menu: _shopBag.ts) ──
const bagRow = document.createElement('div');
bagRow.className = 'sl-bagrow';
bagRow.hidden = true;
BAG_MORE.push({ el: bagRow, has: () => basket.n > 0 });
let bagShown = '';
function fillBag(): void {
  const key = `${basket.version}|${num(1)}`;
  if (key === bagShown) return;
  bagShown = key;
  if (basket.n) injectSellStyle();
  bagRow.hidden = basket.n === 0;
  bagRow.innerHTML = basket.n
    ? `<span class="sl-bag-h">${BASKET_ICON('sl-basket-icon')}${esc(t('sellBasket'))} ${num(basket.n)}/${num(BASKET_MAX)}</span><span class="sl-bag-fish">${basket.fish
        .map((f) => `<span class="sl-bag-f">${fishIcon(f.kind, 'sl-fish')}${esc(fishName(f.kind))} · ${esc(t('sellCm', { cm: num(f.cm) }))}</span>`)
        .join('')}</span>`
    : '';
  bagRow.setAttribute('aria-label', `${t('sellBasket')} ${num(basket.n)}/${num(BASKET_MAX)}`);
}
basket.onChange(() => {
  fillBag();
  bagNotify.update();
});
onLang(() => {
  bagShown = '';
  fillBag();
});
fillBag();

// ── The sale ─────────────────────────────────────────────────────────────────

function theCard(e: AddonEnv): SaleCard {
  return (card ??= createSaleCard({ layer: e.layer, onSell: sellNow, onClose: askClose, sound: (s) => e.uiSound(s) }));
}

/** At seller `b`: he turns to her, the camera comes round, the card opens and she weighs his fish. */
function open(ctx: RoamCtx, b: FishBuyer, turnNow: boolean): void {
  const e = env;
  if (!e) return;
  const by = angleDiff(b.facing, ctx.body.yaw);
  sale = {
    buyer: b,
    t: 0,
    turn: turnNow ? { from: ctx.body.yaw, by, t: 0, len: TURN * (0.45 + (0.55 * Math.abs(by)) / Math.PI) } : null,
    weighed: 0,
    nextWeigh: WEIGH_FIRST,
    hand: null,
    closeAt: -1,
    closeAsked: false,
    auto: null,
    looked: false,
  };
  if (!turnNow) ctx.body.yaw = b.facing;
  ctx.body.vel.set(0, 0, 0);
  theCard(e).show(() => t(b.name), e.purse.riel);
  count = null;
  framed = 0;
  view = clearView(ctx, b);
  ctx.hud.prompt(null);
}

/** The card shuts: he stands free, the seller goes on with her work, the camera goes back. */
function closeSale(quiet = false): void {
  if (!sale) return;
  const ex = env?.explorer;
  if (sale.hand && !sale.hand.paid) {
    // (shut while a fish was on its way: it is hers all the same, paid at once)
    pay(sale);
  }
  if (ex) {
    ex.rig.clearSlot('sellFish');
    if (ex.currentAction === 'interact') ex.stop('interact');
  }
  sale = null;
  if (card?.open) card.close();
  if (quiet) count = null;
}

/** Esc, the ×, ○, a tap outside, a push of the stick: shut it (after the hand-over under way). */
function askClose(): void {
  if (!sale) return;
  if (sale.hand) {
    sale.closeAsked = true;
    return;
  }
  closeSale();
}

/** Sell fish `which` (a basket index) or all: he hands it over. */
function sellNow(which: number | 'all'): void {
  const s = sale;
  if (!s || s.hand || !basket.n) return;
  const idx = which === 'all' ? basket.fish.map((_, i) => i) : basket.fish[which] ? [which] : [];
  if (!idx.length || s.weighed < (which === 'all' ? basket.n : which + 1)) return;
  const fish = idx.map((i) => basket.fish[i]);
  const total = fish.reduce((a, f) => a + fishPrice(f.kind, f.cm), 0);
  s.hand = { which: idx, fish, total, t: 0, shown: false, given: false, paid: false };
  card?.selling(idx);
  const ex = env?.explorer;
  if (ex) {
    if (ex.currentAction && ex.currentAction !== 'interact') ex.stop();
    ex.play('interact');
  }
}

/** She takes the fish: out of his basket and his hand, her turn to him and the money held out (the people's seller). */
function give(s: Sale, ctx: RoamCtx): void {
  const h = s.hand!;
  h.given = true;
  env?.explorer.rig.clearSlot('sellFish');
  SFX.play('sellHand', 0.8);
  // (out of the basket: the highest index first, so the others keep theirs)
  for (const i of [...h.which].sort((a, b) => b - a)) basket.take(i);
  let shop = shops.get(s.buyer.id);
  if (!shop) {
    const b = s.buyer;
    shop = { id: `sell-${b.id}`, name: { km: '', en: '' }, x: b.x, y: b.y, z: b.z, r: b.r, facing: b.facing, items: [] };
    shops.set(b.id, shop);
  }
  sold(ctx.t, shop, FISH_ITEM);
}

/** He is paid: into the purse (it glows; the card's counts up), the sound, the words; saved counts. */
function pay(s: Sale): void {
  const h = s.hand!;
  if (h.paid) return;
  h.paid = true;
  const e = env;
  if (!e) return;
  if (!h.given && lastCtx) give(s, lastCtx);
  const was = e.purse.riel;
  e.purse.earn(h.total);
  SFX.play('sellCoin', 0.9);
  pad.rumble('tick');
  bagNotify.update('purse');
  count = e.shot ? null : { from: was, to: e.purse.riel, t: 0 };
  if (e.shot) card?.purse(e.purse.riel, false);
  e.hud.toast(t('sellEarned', { n: riel(h.total) }));
  card?.say('sellAgain');
  progress.set('sell.sold', progress.get('sell.sold', 0) + h.fish.length);
  progress.set('sell.earned', progress.get('sell.earned', 0) + h.total);
}

/** One step of the sale (while it holds him): the turn, the weighing, a hand-over, shutting. */
function step(ctx: RoamCtx, dt: number): void {
  const s = sale!;
  const { body } = ctx;
  s.t += dt;
  if (s.turn) {
    const tr = s.turn;
    tr.t += dt;
    const k = Math.min(1, tr.t / tr.len);
    body.yaw = tr.from + tr.by * k * k * (3 - 2 * k);
    if (k >= 1) s.turn = null;
  }
  // (a moment in, the camera's side again: nobody standing between)
  if (!s.looked && s.t >= 0.15) {
    s.looked = true;
    const was = view;
    view = clearView(ctx, s.buyer);
    if ((view.side !== was.side || view.pitch !== was.pitch) && !keepView) {
      if (env?.shot) frameNow(ctx);
      else framed = Math.min(framed, FRAME.for - 1);
    }
  }
  // She weighs them, one after the other.
  if (s.weighed < basket.n && s.t >= s.nextWeigh) {
    s.weighed++;
    s.nextWeigh = s.t + WEIGH_EACH;
    SFX.play('sellScale', 0.7);
    card?.weighed(s.weighed);
    if (s.weighed >= basket.n) card?.say('sellOffer');
  }
  if (s.auto !== null && s.weighed >= basket.n && !s.hand) {
    const a = s.auto;
    s.auto = null;
    sellNow(a);
  }
  // A hand-over: the fish in his fist as he reaches out, into hers; paid; done.
  const h = s.hand;
  if (h) {
    h.t += dt;
    const ex = body.explorer;
    if (!h.shown && h.t >= HAND_SHOW) {
      h.shown = true;
      // (the biggest of them in his hand: the one she weighs last)
      const big = h.fish.reduce((a, f) => (fishPrice(f.kind, f.cm) > fishPrice(a.kind, a.cm) ? f : a));
      ex.rig.setSlot('sellFish', 'propR', heldFishBuilder(big.kind, big.cm));
    }
    if (!h.given && h.t >= HAND_GIVE) give(s, ctx);
    if (!h.paid && h.t >= PAY) pay(s);
    if (h.t >= HAND_END) {
      s.hand = null;
      card?.selling(null);
      card?.refill();
      s.weighed = basket.n;
      if (!basket.n) s.closeAt = s.t + CLOSE_AFTER - (HAND_END - PAY);
      else if (s.closeAsked) s.closeAt = s.t;
    }
  }
  // The seller gone meanwhile (the clock), or the basket empty: the card shuts.
  if (!s.hand && s.closeAt < 0 && lastFrame && !s.buyer.open(lastFrame.clock)) s.closeAt = s.t;
  if (s.closeAt >= 0 && s.t >= s.closeAt && !s.hand) closeSale();
}

// ── The camera (the buy menu's ways: _shop.ts) ───────────────────────────────

/**
 * The side the camera takes at a seller: a side, a height and a distance from which both he and she show — nothing
 * solid between the camera and him, nor between it and her (the world's clearances, as far out and as wide as the
 * follow camera looks; leaves too), nothing right in front of the lens (a post, a stall's tarp: rays across the
 * picture), and, when it can be, nobody at the camera nor across the lines to them (greet.ts `nearby`). Behind his
 * left shoulder first, then round both sides, nearer and higher (over heads); then without the people, then only
 * the line to him (the buy menu's rule: _shop.ts `clearView`).
 */
function clearView(ctx: RoamCtx, b: FishBuyer): { side: number; pitch: number; distance: number } {
  const t0 = env?.shot ? performance.now() : 0;
  const w: RoamWorld = ctx.world;
  const { body, cam } = ctx;
  const yaw = b.facing;
  const c = { x: body.pos.x, y: body.pos.y + CHEST * body.scale, z: body.pos.z };
  const her = { x: b.x + Math.sin(b.facing) * HER_AHEAD, y: b.y + HER_UP, z: b.z + Math.cos(b.facing) * HER_AHEAD };
  const hard = w.hardClearance ?? w.clearance;
  const soft = w.softClearance;
  const floor = body.pos.y;
  const p = { x: 0, y: 0, z: 0 };
  /** The camera's place for this side, tilt and distance (into `p`). */
  const place = (a: number, pitch: number, dist: number) => {
    const d = dist + OUT;
    const cp = Math.cos(pitch);
    p.x = c.x - Math.sin(a) * cp * d;
    p.y = c.y + Math.sin(pitch) * d;
    p.z = c.z - Math.cos(a) * cp * d;
  };
  /** Clear from the camera (and a little to either side of it) to point q: nothing solid, no leaves. */
  const sees = (a: number, q: { x: number; y: number; z: number }) => {
    for (const k of [0, 1, -1]) {
      const px = p.x + Math.cos(a) * SIDE * k;
      const pz = p.z - Math.sin(a) * SIDE * k;
      if ((hard?.(q.x, q.y, q.z, px, p.y, pz) ?? 1) < 0.98) return false;
      if (soft && (soft(q.x, q.y, q.z, px, p.y, pz, true) < 0.95 || soft(px, p.y, pz, q.x, q.y, q.z) < 0.95)) return false;
    }
    return true;
  };
  /** Nothing right in front of the lens: rays across the picture, and one to its bottom. */
  const lensClear = (a: number, pitch: number) => {
    for (const da of LENS_FAN) {
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
    }
    return true;
  };
  /** Nobody between him and the camera, at the camera, or across the line from it to her. */
  const clearOfPeople = (a: number, dist: number) => {
    if (nearby(body.pos.x, floor, body.pos.z, a + Math.PI, dist + OUT, PEOPLE_CONE, seen)) return false;
    if (nearby(p.x, floor, p.z, 0, NEAR_PEOPLE, Math.PI, seen)) return false;
    const dh = Math.hypot(her.x - p.x, her.z - p.z);
    return !nearby(p.x, floor, p.z, Math.atan2(her.x - p.x, her.z - p.z), Math.max(0, dh - 1.2), 0.22, seen);
  };
  const far = cam.camera.aspect < 0.8 ? NARROW_FAR : 1;
  let out: { side: number; pitch: number; distance: number } | null = null;
  let passUsed = -1;
  // (strict first: both lines, the lens, the people; then without the people; then the line to him with them; then alone)
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
        passUsed = pass;
        break;
      }
    }
  out ??= { side: FRAME.side * 0.25, pitch: FRAME.pitch * 0.3, distance: Math.max(4, FRAME.distance * 0.7 * far) };
  if (env?.shot) console.info(`[map] sellfish: the camera's side ${out.side.toFixed(2)}, pitch ${out.pitch.toFixed(2)}, ${out.distance.toFixed(1)} m (pass ${passUsed}) in ${(performance.now() - t0).toFixed(1)} ms`);
  return out;
}

/** While selling: the camera eases to its side, then it is the player's; after, back to the player's pitch and distance. */
function frameCam(ctx: RoamCtx, dt: number): void {
  const cam = ctx.cam;
  if (sale && !keepView) {
    before ??= { pitch: cam.pitch, distance: cam.distance };
    const yaw = (sale.turn ? sale.turn.from + sale.turn.by : ctx.body.yaw) + view.side;
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
  cam.yaw = (sale ? sale.buyer.facing : body.yaw) + view.side;
  cam.behindYaw = cam.yaw;
  cam.pitch = view.pitch;
  cam.distance = view.distance;
}

/**
 * The lens shift while a card is open (the sale card, or the catch card in the boat): the picture slides so he
 * stands in the middle of what the card leaves free (left of the panel, above the sheet on a phone held upright),
 * as the buy menu's (_shop.ts `lens`, which clears any shift of its own each frame before this one runs).
 */
function lens(f: MapFrame): void {
  const el = card?.open ? card.el : catchChoice.open ? catchChoice.el : null;
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
  const W = innerWidth;
  const H = innerHeight;
  camera.setViewOffset(W, H, shiftX * W, shiftY * H, W, H);
}

// ── The basket at his hip ────────────────────────────────────────────────────

/** At his hip while it holds fish, off his feet in the boat (it hangs over the boat's side there: _fishing.ts). */
function syncHip(mode: RoamMode): void {
  const ex = env?.explorer;
  if (!ex) return;
  const want = basket.n > 0 && mode !== 'boat' && mode !== 'overview';
  if (!want) {
    if (hipV >= 0) {
      ex.rig.clearSlot('fishBasket');
      hipV = -1;
    }
    return;
  }
  if (hipV === basket.version) return;
  ex.rig.setSlot('fishBasket', 'hips', basketBuilder(basket.fish, 'hip'));
  hipV = basket.version;
}

/** The prompt at a seller: "E  Sell your fish (3)", or when she comes back. */
function promptAt(b: FishBuyer, here: boolean): string {
  if (said.b !== b || said.n !== basket.n || said.here !== here || !said.text) {
    said.b = b;
    said.n = basket.n;
    said.here = here;
    said.text = here ? `E  ${t('sellPrompt', { n: num(basket.n) })}` : t(b.back, { name: t(b.name) });
  }
  return said.text;
}

registerAddon({
  id: 'sellfish',
  init(e) {
    env = e;
    sellUi.sound = (s) => e.uiSound(s);
  },
  get holding() {
    return sale !== null;
  },
  input(ctx, mode, _tap, _dt) {
    lastCtx = ctx;
    if (!sale) return false;
    const i = ctx.input;
    // The card's keys are its own (and the pad's, a layer); a push of the stick walks away, touch's Use (or a check's `e`) takes the one in the ring.
    if (mode !== 'walk') {
      closeSale();
      return false;
    }
    if (Math.hypot(i.move.x, i.move.y) > STICK && !sale.hand) {
      closeSale();
      return false;
    }
    if (i.exit) askClose();
    else if (i.use) card?.confirm();
    i.exit = i.use = false;
    return true;
  },
  offer(ctx, mode) {
    if (mode !== 'walk' || !basket.n || !env || env.busy() || sale) return null;
    const p = ctx.body.pos;
    const b = buyerNear(ctx.world.field, p.x, p.y, p.z);
    if (!b) return null;
    return promptAt(b, !lastFrame || b.open(lastFrame.clock));
  },
  use(ctx, mode) {
    if (mode !== 'walk' || !basket.n) return;
    const p = ctx.body.pos;
    const b = buyerNear(ctx.world.field, p.x, p.y, p.z);
    if (!b) return;
    if (lastFrame && !b.open(lastFrame.clock)) {
      ctx.hud.toast(t(b.back, { name: t(b.name) }));
      return;
    }
    open(ctx, b, true);
  },
  hold(ctx, dt) {
    const { body, cam } = ctx;
    lastCtx = ctx;
    // He stands still, facing her; the camera looks at his chest (and comes round at first).
    body.vel.set(0, 0, 0);
    body.grounded = true;
    body.explorer.setMotion(0, true, 0);
    cam.focus.set(body.pos.x, body.pos.y + CHEST * body.scale, body.pos.z);
    cam.fov = 50;
    if (sale) step(ctx, dt);
    frameCam(ctx, dt);
    return { prompt: null };
  },
  after(ctx, mode, dt) {
    lastCtx = ctx;
    syncHip(mode);
    // (the camera back to the player's once the card has shut)
    if (!sale && before && mode === 'walk') frameCam(ctx, dt);
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
    curMode = next;
    if (next !== 'walk') closeSale(true);
    if (next === 'overview') {
      // Fish do not keep: back to the map, the basket is empty.
      catchChoice.close();
      basket.clear();
      before = null;
    }
    syncHip(next);
  },
  fromUrl(q, ctx) {
    lastCtx = ctx;
    keepView = q.has('rcam');
    // (the basket's fish: a shot's URL, or a saved view's — "Go there", a bug report's replay — through roam.ts placeFrom,
    // which first went back through the overview, where the basket emptied; before `sellfish=`, which sells them)
    const fb = q.get('fishbasket');
    if (fb !== null) basket.set(parseBasket(fb));
    syncHip(curMode);
    const spec = q.get('sellfish');
    if (!spec || !env) return;
    const field = ctx.world.field;
    let b: FishBuyer | null = null;
    if (spec === '1') {
      const p = ctx.body.pos;
      b = buyerNear(field, p.x, p.y, p.z);
      if (!b) console.warn(`[map] sellfish: no fish seller within reach of (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) (${fishBuyers(field).map((x) => `${x.id} ${x.x.toFixed(1)},${x.z.toFixed(1)}`).join(' · ')})`);
    } else {
      b = fishBuyers(field).find((x) => x.id === spec) ?? null;
      if (!b) console.warn(`[map] sellfish: no seller "${spec}" (${fishBuyers(field).map((x) => x.id).join(', ')})`);
      else {
        // (at her spot, on the floor there: the walk map's)
        const g = ctx.world.standAt?.(b.x, b.z, b.y + 0.5, 1.1, 2.3) ?? b.y;
        ctx.body.pos.set(b.x, Number.isNaN(g) ? b.y : g, b.z);
      }
    }
    if (!b) return;
    // (the time of day: the view's own `clock=` when it has one — Go there puts its moment back — else the frame's, else the map's)
    const qc = Number(q.get('clock'));
    const clock = q.has('clock') && Number.isFinite(qc) ? ((qc % 1) + 1) % 1 : (lastFrame?.clock ?? TIME.moment(TIME.days()).clock);
    if (!basket.n) {
      console.warn('[map] sellfish: the basket is empty (fishbasket=<kind>:<cm>,…)');
      return;
    }
    if (!b.open(clock)) {
      // (away: as E there says it)
      ctx.body.yaw = b.facing;
      ctx.hud.prompt(promptAt(b, false));
      console.info(`[map] sellfish: ${b.id} is away at clock ${clock.toFixed(2)}`);
      return;
    }
    // (the sale frames itself, whatever camera the URL had: a report's `rcam=` is where the camera stood then — with
    // other people round her now, the side is looked for again)
    keepView = false;
    open(ctx, b, false);
    frameNow(ctx);
    const buy = q.get('sellbuy');
    if (buy && sale) sale.auto = buy === 'all' ? 'all' : Math.max(0, Math.round(Number(buy)) - 1);
    const fo = Number(q.get('sellfocus'));
    if (q.has('sellfocus') && Number.isFinite(fo)) card?.focus(fo);
    console.info(`[map] sellfish: at ${b.id} (${b.x.toFixed(1)}, ${b.z.toFixed(1)}), ${basket.n} fish for ${basket.total} riel`);
  },
  report() {
    const out: Record<string, string> = {};
    if (basket.n) out.fishbasket = basket.spec();
    if (sale) out.sellfish = sale.buyer.id;
    return Object.keys(out).length ? out : null;
  },
});
