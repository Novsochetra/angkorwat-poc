import { SFX } from '../audio/addonSfx';
import '../audio/_wear';
import { frontOf, inWindow, MK, stallById, stallPoint } from '../hamlet/_mkPlan';
import { pad } from '../pad/pad';
import { browse, SALE, SHOPS, type Shop } from '../shop';
import type { MapFrame, RoamMode } from '../types';
import { onLang, t } from '../ui/lang';
import { MENU_HOOKS, registerAddon, type AddonEnv } from './_addons';
import { createWearCard, type WearCard } from './_wardrobeCard';
import { Wardrobe, WEAR_ITEMS, WEAR_KINDS, wearItem, wearName, type WearItem, type WearKind } from './_wardrobeItems';
import { angleDiff } from './followCam';
import type { RoamCtx, RoamWorld } from './types';

/**
 * Clothes from the market (the roaming add-on `clothes`, words `wear…`).
 *
 * - **The krama stall** of the morning market in the sugar-palm village (its
 *   `cloth` stall: hamlet/_mkPlan.ts; racks of kramas, folded stacks, shirts,
 *   trousers, hats: hamlet/_mkGoods.ts; its seller people/_sceneMarket.ts),
 *   open from dawn to the late afternoon. In front of it, on foot, E "ទិញខោអាវ"
 *   / "Buy clothes": he turns to the seller, the camera comes round to his
 *   side (him, the seller and the goods; the picture slides left of the card),
 *   she looks up and asks (people/_saleBack.ts, `BROWSE`), and the card opens
 *   (_wardrobeCard.ts): kramas in six colours, linen shirts in three, loose
 *   fisherman trousers in two, a palm-leaf hat with a blue band, at real riel
 *   prices. Closed: the prompt says so (no E).
 * - **Buying**: the purse pays (the rustle of notes), the seller hands it over
 *   (`SALE`: she turns to him with it, "អរគុណបង!"), he shakes it out and puts
 *   it on at once with a small turn on the spot (the clothes change a third of
 *   the way round), the seller says it suits him, and it is his
 *   (map/progress.ts `wear.owned`; `wear.on` what he wears). What he owns says
 *   "Wear" there; what he wears "✓ Wearing" (taken again: off).
 * - **His wardrobe** (the explorer menu's "My clothes", I; the pad's △): what
 *   he owns by kind, tap to put on or take off, "Original look" for his own
 *   clothes; on foot the camera comes round to his front for it (and the small
 *   turn); in the boat, on the glider or in the balloon it changes at once.
 * - **With the looks (G)**: the clothes colour what his look shows — the
 *   krama on the looks with the scarf (gear, day pack), the shirt on all four,
 *   the trousers in place of the shorts (the temple clothes keep their
 *   sampot), the hat's blue band whenever the hat is on (H). Putting on a
 *   krama in the "no scarf" or temple look, or trousers in the temple look,
 *   puts the day pack look on (the explorer menu's own chip: G, the menu and
 *   the bug report stay in step); G afterwards goes on as before, and a look
 *   that hides it says so in his wardrobe ("Not shown in this look").
 * - The photos, the selfie and every roaming mode show them: it is the same
 *   explorer (character/AngkorExplorer.ts `setClothes`: the parts that change
 *   are built again once, on the change, from the tones in
 *   character/clothes.ts; never per frame).
 *
 * Shots: `wear=<item>,<item>` dresses him (no saving: ids in _wardrobeItems.ts;
 * `wear=0` his own), `wearown=<item>,…|all` owns those too; `clothes=1` stands
 * him at the stall facing its seller with the card open (`clothes=wardrobe`:
 * his wardrobe), `clothestab=krama|shirt|trousers|hat`, `clothesfocus=<i>`
 * the ring on row i, `clothesbuy=<item>` buys it there and then (`sim=_:<s>`:
 * the hand-over ≈ 0.5, the turn ≈ 1.3‥2.1). `report()` gives `wear`, `wearown`,
 * `clothes`, `clothestab`.
 */

/** The buyer's spot: this far out from the market's own buyers' (m: the roaming explorer is big), and how near it he must be (as hamlet/_shops.ts). */
const OUT = 0.35;
const REACH = 2.1;
/** After paying: in his hands (the shake) this long after (s), then the small turn (s), the clothes on this share of the way round. */
const HAND_AT = 0.95;
const SPIN = 1.15;
const DRESS_AT = 0.32;
/** Turning to the seller (s, a half turn; a small one is quicker). */
const TURN = 0.45;
/** The stick past this walks away from the card. */
const STICK = 0.3;
/**
 * The camera: at the stall behind his left shoulder (the seller and her goods
 * past him, left of the card: his front shows as he turns); his wardrobe on
 * foot, round to his front. `side` from behind him (radians, − round to his
 * left). It eases there over `for` s, then the player may look round; back as
 * it was after.
 */
const FRAME = {
  stall: { side: -1.2, pitch: 0.22, distance: 8.2 },
  wardrobe: { side: -2.6, pitch: 0.1, distance: 6.2 },
  rate: 2.2,
  back: 2.4,
  for: 2.6,
};
type Framing = (typeof FRAME)['stall'];
/** The lens shift while the card is open (as the buy menu's: _shop.ts), at most this share of the view, eased at this rate (1/s). */
const SHIFT_MAX = 0.3;
const SHIFT_RATE = 4;
/** His step while he turns on the spot (m/s at true size, at the turn's fastest). */
const SPIN_STEP = 0.75;

let env: AddonEnv | null = null;
let wardrobe: Wardrobe | null = null;
let card: WearCard | null = null;
let lastCtx: RoamCtx | null = null;
let mode: RoamMode = 'overview';
/** The map's clock last frame (the stall's hours). */
let clock = 0.85;
/** The stall's buyer spot (map m), the way he faces its seller; as a shop for the seller's hooks (shop.ts `BROWSE`, `SALE`; not registered: it sells no food). */
let stall: Shop | null = null;
let marketUp = false;
/** Turning to the seller. */
let turn: { from: number; by: number; t: number; len: number } | null = null;
/**
 * A change under way: bought (`wait`: the hand-over first), then the small
 * turn (`spin`; none off his feet or while something has him) and the clothes
 * on at `DRESS_AT` of it.
 */
let change: { apply: () => void; t: number; wait: number; spin: boolean; from: number; applied: boolean; toast: string; bought: WearItem | null } | null = null;
/** A toast to show on the next step (after a look's own "Outfit: …", which the switch gives at once). */
let toastNext = '';
/** The camera: the player's before (to go back to), the framing now, how long (s); the URL's camera kept. */
let before: { pitch: number; distance: number } | null = null;
let framing: Framing | null = null;
let view: Framing = FRAME.stall;
let framed = 0;
let keepView = false;
let shiftX = 0;
let shiftY = 0;
/** The prompts (made once a language). */
let promptOpen = '';
let promptShut = '';
onLang(() => (promptOpen = promptShut = ''));
const force = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('mkopen');

/** The stall's spot (from the market's plan, as its food stalls': hamlet/_shops.ts). */
function stallSpot(w: RoamWorld): Shop {
  const s = stallById('cloth');
  const f = frontOf(s, 0);
  const [ox, oz] = stallPoint(s, 0, s.d / 2 + 1);
  const [fx, fz] = stallPoint(s, 0, s.d / 2);
  const k = OUT / Math.hypot(ox - fx, oz - fz);
  const x = MK.x + f.x + (ox - fx) * k;
  const z = MK.z + f.z + (oz - fz) * k;
  return { id: 'market-cloth', name: { km: t('wearStall'), en: 'Krama and clothes stall' }, x, y: w.field.heightAt(x, z), z, r: REACH, facing: f.yaw, items: [] };
}

/** The krama stall is open now (its seller there: the market's hours, `mkopen=all|none`). */
const stallOpen = (): boolean => force === 'all' || (force !== 'none' && inWindow(clock, stallById('cloth').open));

/** The market is on the map (its food stalls registered as it was built: hamlet/_shops.ts). */
function marketBuilt(): boolean {
  if (!marketUp) marketUp = SHOPS.some((s) => s.id === 'market-noodles');
  return marketUp;
}

/** The card (made the first time: nothing until then). */
function theCard(e: AddonEnv): WearCard {
  return (card ??= createWearCard({
    layer: e.layer,
    riel: () => e.purse.riel,
    owned: (id) => !!wardrobe?.has(id),
    wearing: (id) => !!wardrobe?.wearing(id),
    hidden: (it) => hiddenNow(it.kind),
    dressed: () => (wardrobe?.on.size ?? 0) > 0,
    onPick: pick,
    onOriginal: original,
    onClose: closeCard,
    sound: e.uiSound,
  }));
}

/** The look he has on does not show this kind (a krama without the scarf, trousers with the sampot). */
function hiddenNow(kind: WearKind): boolean {
  const o = env?.explorer.currentOutfit;
  if (!o) return false;
  return (kind === 'krama' && !o.scarf) || (kind === 'trousers' && o.legs !== 'shorts');
}

/** Dress him as the wardrobe says (only the parts that change are built again), the photo's hidden body kept hidden. */
function dress(): void {
  if (!env || !wardrobe) return;
  env.explorer.setClothes(wardrobe.clothes());
  env.photo.refreshBody();
}

/** Put on the day pack look (the explorer menu's own chip, so G, the menu and the bug report stay in step) when his look hides `kind`. */
function showKind(kind: WearKind): void {
  if (!hiddenNow(kind)) return;
  const chip = document.querySelector<HTMLElement>('.rxm-b[data-look] .rxm-t[data-w="rLookPack"]')?.closest<HTMLButtonElement>('button');
  chip?.click();
}

/** On foot, standing free: the change comes with the small turn. */
function canSpin(): boolean {
  return !!env && mode === 'walk' && env.body.grounded && !env.explorer.animator.posture && !env.explorer.currentAction && !env.photo.kind;
}

/** Start a change: `apply` puts it on (or off) a third of the way round the turn, or at once off his feet. */
function startChange(apply: () => void, toast: string, bought: WearItem | null): void {
  if (!env) return;
  change?.apply();
  const spin = canSpin();
  change = { apply, t: 0, wait: bought ? HAND_AT : 0, spin, from: env.body.yaw, applied: false, toast, bought };
  card?.busy(true, bought?.id ?? '');
  if (!spin && !bought) finishChange();
}

/** The change done: the clothes on (if not yet), the card free again, the toast. */
function finishChange(): void {
  const c = change;
  if (!c) return;
  change = null;
  if (!c.applied) c.apply();
  if (c.spin && env) env.body.yaw = c.from;
  card?.busy(false);
  card?.refresh();
  if (c.bought && card?.mode === 'stall') card.say('wearSuits');
  toastNext = c.toast;
}

/** A row of the card: buy it (at the stall), put it on, or take it off. */
function pick(it: WearItem): void {
  const e = env;
  const w = wardrobe;
  if (!e || !w || change) return;
  if (w.has(it.id)) {
    if (w.wearing(it.id)) takeOff(it.kind);
    else putOn(it, false);
    return;
  }
  if (card?.mode !== 'stall' || !stall) return;
  if (!e.purse.pay(it.price)) {
    card.short(it.id);
    return;
  }
  lastCtx?.sound('coin', 1);
  // (the game pad in hand: a light tick as the notes go)
  pad.rumble('tick');
  w.add(it);
  // The seller hands it over (people/_saleBack.ts: she turns to him with it, thanks him), as a sale at a food stall (shop.ts `sold`).
  SALE.t = lastCtx?.t ?? 0;
  SALE.shop = stall.id;
  SALE.item = it.id;
  SALE.x = stall.x;
  SALE.y = stall.y;
  SALE.z = stall.z;
  SALE.n++;
  putOn(it, true);
}

/** Wear `it` (bought now: after the hand-over); the look that hides it gives way to the day pack. */
function putOn(it: WearItem, bought: boolean): void {
  const e = env;
  const w = wardrobe;
  if (!e || !w) return;
  startChange(
    () => {
      if (change) change.applied = true;
      w.wear(it.kind, it);
      dress();
      // (then a look that shows it, if his hides it: built once, in the new clothes)
      showKind(it.kind);
      // (the hat: on his head — not while the umbrella is up (its brim), nor sitting, lying or praying (those keep
      // his hat for him: H puts it on after))
      if (it.kind === 'hat' && !e.explorer.currentOutfit.hat && !MENU_HOOKS.umbrellaUp() && !e.busy()) {
        e.explorer.setOutfit({ hat: true });
        e.photo.refreshBody();
      }
      SFX.play('wearOn', 1);
    },
    t('wearNowWearing', { name: wearName(it) }),
    bought ? it : null,
  );
}

/** Take off what he wears of `kind` (his own again). */
function takeOff(kind: WearKind): void {
  const w = wardrobe;
  const it = w?.on.get(kind);
  if (!w || !it) return;
  startChange(
    () => {
      if (change) change.applied = true;
      w.wear(kind, null);
      dress();
      SFX.play('wearOff', 1);
    },
    t('wearTookOff', { name: wearName(it) }),
    null,
  );
}

/** His own clothes again (what he owns stays his). */
function original(): void {
  const w = wardrobe;
  if (!w || !w.on.size || change) return;
  startChange(
    () => {
      if (change) change.applied = true;
      w.original();
      dress();
      SFX.play('wearOff', 1);
    },
    t('wearBackOriginal'),
    null,
  );
}

/** At the stall: the card, turned to the seller (`turnNow`, else facing her at once), the seller looks up. */
function openStall(turnNow: boolean): void {
  const e = env;
  if (!e || !stall) return;
  theCard(e).show('stall');
  const yaw = stall.facing ?? e.body.yaw;
  if (turnNow) turnTo(yaw);
  else e.body.yaw = yaw;
  browse(lastCtx?.t ?? 0, stall);
}

/** His wardrobe (the explorer menu's "My clothes"): in any roaming mode; on foot the camera comes round to his front. */
export function openWardrobe(): void {
  const e = env;
  if (!e || mode === 'overview') return;
  frontOk = frontFree();
  theCard(e).show('wardrobe');
}
// (the explorer menu's "My clothes" opens it without loading this module: _addons.ts MENU_HOOKS)
MENU_HOOKS.openWardrobe = openWardrobe;

function closeCard(): void {
  if (!card?.open) return;
  const atStall = card.mode === 'stall';
  card.close();
  turn = null;
  if (atStall) browse(lastCtx?.t ?? 0, null);
}

function turnTo(yaw: number): void {
  const b = env!.body;
  const by = angleDiff(yaw, b.yaw);
  turn = { from: b.yaw, by, t: 0, len: TURN * (0.45 + (0.55 * Math.abs(by)) / Math.PI) };
}

/** The view for a framing with him facing `yaw` (its side, the other, nearer, lower): the first with nothing between the camera and him. */
function clearView(w: RoamWorld, yaw: number, f: Framing): Framing {
  const c = env!.cam.focus;
  const hard = w.hardClearance ?? w.clearance;
  const soft = w.softClearance;
  const free = (a: number, pitch: number, dist: number) => {
    const d = dist + 1.2;
    const cp = Math.cos(pitch);
    const x = c.x - Math.sin(a) * cp * d;
    const y = c.y + Math.sin(pitch) * d;
    const z = c.z - Math.cos(a) * cp * d;
    for (const k of [0, 1, -1]) {
      const px = x + Math.cos(a) * 0.6 * k;
      const pz = z - Math.sin(a) * 0.6 * k;
      if ((hard?.(c.x, c.y, c.z, px, y, pz) ?? 1) < 0.98) return false;
      if (soft && (soft(c.x, c.y, c.z, px, y, pz, true) < 0.95 || soft(px, y, pz, c.x, c.y, c.z) < 0.95)) return false;
    }
    return true;
  };
  const sides = [f.side, f.side * 0.8, f.side * 1.2, f.side * 0.6, -f.side, f.side * 0.4];
  const far = env!.cam.camera.aspect < 0.8 ? 1.3 : 1;
  for (const [pk, dk] of [
    [1, 1],
    [0.5, 1],
    [0.5, 0.75],
  ])
    for (const sd of sides) {
      const pitch = f.pitch * pk;
      const distance = Math.max(4, f.distance * dk * far);
      if (free(yaw + sd, pitch, distance)) return { side: sd, pitch, distance };
    }
  return { side: f.side * 0.5, pitch: f.pitch * 0.5, distance: Math.max(4, f.distance * 0.7 * far) };
}

/**
 * Among stalls (a shop within this, m: a market's goods, tarps and parasols are not in the walk map, so the
 * clearances cannot see them) the wardrobe leaves the camera where the player has it.
 */
const STALLS_NEAR = 9;
/** His wardrobe may bring the camera round to his front here (on foot, free, not among a market's stalls). */
let frontOk = false;
function frontFree(): boolean {
  const p = env!.body.pos;
  for (const s of SHOPS) if (Math.abs(s.y - p.y) < 4 && (s.x - p.x) ** 2 + (s.z - p.z) ** 2 < STALLS_NEAR * STALLS_NEAR) return false;
  return !!stall && (stall.x - p.x) ** 2 + (stall.z - p.z) ** 2 >= STALLS_NEAR * STALLS_NEAR;
}

/** The camera for the card (see `FRAME`), and back to the player's after. */
function frameCam(ctx: RoamCtx, dt: number): void {
  const e = env!;
  const want = keepView || mode !== 'walk' ? null : card?.mode === 'stall' ? FRAME.stall : card?.mode === 'wardrobe' && frontOk && !e.busy() ? FRAME.wardrobe : null;
  const cam = ctx.cam;
  const facing = change?.spin ? change.from : turn ? turn.from + turn.by : e.body.yaw;
  if (want) {
    if (want !== framing) {
      framing = want;
      framed = 0;
      view = clearView(ctx.world, facing, want);
    }
    before ??= { pitch: cam.pitch, distance: cam.distance };
    const yaw = facing + view.side;
    cam.behindYaw = yaw;
    framed += dt;
    if (framed > FRAME.for) return;
    const k = 1 - Math.exp(-FRAME.rate * dt);
    cam.yaw += angleDiff(yaw, cam.yaw) * k;
    cam.pitch += (view.pitch - cam.pitch) * k;
    cam.distance += (view.distance - cam.distance) * k;
    return;
  }
  framing = null;
  if (!before) return;
  const k = 1 - Math.exp(-FRAME.back * dt);
  cam.pitch += (before.pitch - cam.pitch) * k;
  cam.distance += (before.distance - cam.distance) * k;
  if (Math.abs(before.pitch - cam.pitch) < 0.005 && Math.abs(before.distance - cam.distance) < 0.05) before = null;
}

/** The camera at once where its framing eases to (a check's shot). */
function frameNow(ctx: RoamCtx, f: Framing): void {
  const e = env!;
  const cam = ctx.cam;
  before ??= { pitch: cam.pitch, distance: cam.distance };
  framing = f;
  framed = FRAME.for;
  cam.focus.set(e.body.pos.x, e.body.pos.y + 1.7 * 0.95 * 0.86 * e.body.scale, e.body.pos.z);
  view = clearView(ctx.world, e.body.yaw, f);
  cam.yaw = e.body.yaw + view.side;
  cam.behindYaw = cam.yaw;
  cam.pitch = view.pitch;
  cam.distance = view.distance;
}

/** The lens shift while the card is open: he stands in the middle of the view the card leaves free (as the buy menu, _shop.ts). */
function lens(f: MapFrame): void {
  let wx = 0;
  let wy = 0;
  const el = card?.open ? card.el : null;
  if (el && f.roam === 'walk' && !keepView) {
    const W = innerWidth;
    const H = innerHeight;
    if (el.offsetWidth > W * 0.7) wy = Math.min(SHIFT_MAX, Math.max(0, 0.5 - el.offsetTop / 2 / H));
    else wx = Math.min(SHIFT_MAX, Math.max(0, 0.5 - el.offsetLeft / 2 / W));
  }
  const k = env?.shot || f.dt <= 0 ? 1 : 1 - Math.exp(-SHIFT_RATE * f.dt);
  const was = shiftX !== 0 || shiftY !== 0;
  shiftX += (wx - shiftX) * k;
  shiftY += (wy - shiftY) * k;
  const camera = f.camera;
  if (Math.abs(shiftX) < 1e-4 && Math.abs(shiftY) < 1e-4) {
    shiftX = shiftY = 0;
    // (once, as it comes back: a view offset of someone else's is not ours to clear)
    if (was && camera.view?.enabled) camera.clearViewOffset();
    return;
  }
  const W = innerWidth;
  const H = innerHeight;
  camera.setViewOffset(W, H, shiftX * W, shiftY * H, W, H);
}

const smooth = (k: number) => k * k * (3 - 2 * k);

registerAddon({
  id: 'clothes',
  init(e) {
    env = e;
    const t0 = performance.now();
    wardrobe = new Wardrobe(e.params);
    stall = stallSpot(e.world);
    keepView = e.params.has('rcam');
    wearFrom(e.params);
    wardrobe.onChange(() => card?.refresh());
    e.purse.onChange(() => card?.refresh());
    if (wardrobe.on.size) {
      dress();
      if (e.shot) console.info(`[map] clothes: wearing ${[...wardrobe.on.values()].map((i) => i.id).join(', ')} (dressed in ${(performance.now() - t0).toFixed(1)} ms)`);
    }
    // (checks: the dev server and shots)
    if (import.meta.env.DEV || e.shot)
      (window as unknown as { __clothes: unknown }).__clothes = {
        state: () => {
          const w = wardrobe!;
          const c = change;
          return {
            card: card?.mode ?? null,
            tab: card?.tab ?? null,
            change: c ? { t: c.t, spin: c.spin, applied: c.applied, bought: c.bought?.id ?? null } : null,
            owned: [...w.owned],
            on: [...w.on.values()].map((i) => i.id),
            saving: w.saving,
            stall: stall && { x: stall.x, y: stall.y, z: stall.z, facing: stall.facing },
            open: stallOpen(),
            framing: framing === FRAME.stall ? 'stall' : framing === FRAME.wardrobe ? 'wardrobe' : null,
            shift: [shiftX, shiftY],
            // (what the explorer himself has on: the items whose tones he wears, and his look)
            explorer: Object.fromEntries(Object.entries(e.explorer.currentClothes).map(([k, v]) => [k, WEAR_ITEMS.find((i) => i.look === v)?.id ?? null])),
            outfit: { ...e.explorer.currentOutfit },
          };
        },
        wardrobe: openWardrobe,
      };
  },

  offer(ctx, m) {
    if (m !== 'walk' || !stall || card?.open || change || env?.busy()) return null;
    const p = ctx.body.pos;
    if ((p.x - stall.x) ** 2 + (p.z - stall.z) ** 2 > REACH * REACH || Math.abs(p.y - stall.y) > 2.5 || !marketBuilt()) return null;
    if (stallOpen()) return (promptOpen ||= `E  ${t('wearBuy')}`);
    return (promptShut ||= t('wearClosed'));
  },

  use(_ctx, m) {
    if (m !== 'walk' || !stallOpen()) return;
    openStall(true);
  },

  input(ctx, m) {
    lastCtx = ctx;
    const i = ctx.input;
    if (card?.open) {
      // (the stall's card is for standing at it: off his feet, it shuts)
      if (card.mode === 'stall' && m !== 'walk') closeCard();
      else if (!change && Math.hypot(i.move.x, i.move.y) > STICK) {
        // (walking away: it shuts, he walks on this very step)
        closeCard();
        return false;
      } else {
        if (i.exit) closeCard();
        // (touch's Use, a check's `e`: take the one in the ring)
        else if (i.use) card.confirm();
        i.exit = i.use = false;
        return true;
      }
    }
    // (handing over and the small turn: he keeps still)
    return change !== null && change.spin;
  },

  after(ctx, m, dt) {
    lastCtx = ctx;
    const e = env!;
    if (toastNext) {
      e.hud.toast(toastNext);
      toastNext = '';
    }
    if (turn && m === 'walk') {
      turn.t += dt;
      const k = Math.min(1, turn.t / turn.len);
      e.body.yaw = turn.from + turn.by * smooth(k);
      if (k >= 1) turn = null;
    }
    const c = change;
    if (c) {
      c.t += dt;
      // (the seller's hand-over: it is in his hands, he shakes it out)
      if (c.bought && c.t >= c.wait && c.t - dt < c.wait) SFX.play('wearShake', 1);
      if (c.spin && m === 'walk') {
        const u = Math.max(0, c.t - c.wait) / SPIN;
        const k = Math.min(1, u);
        // (a full turn on the spot to his left, stepping round, eased in and out)
        e.body.yaw = c.from + Math.PI * 2 * k * k * k * (k * (k * 6 - 15) + 10);
        if (k > 0 && k < 1) e.explorer.setMotion(SPIN_STEP * Math.sin(Math.PI * k), true, 0);
        if (!c.applied && k >= DRESS_AT) c.apply();
        if (k >= 1) finishChange();
      } else if (c.t >= c.wait) finishChange();
    }
    // The stall closed meanwhile (the clock), or he was moved off it: the card shuts.
    if (card?.mode === 'stall' && stall && !change && (Math.hypot(stall.x - e.body.pos.x, stall.z - e.body.pos.z) > REACH + 1.5 || !stallOpen())) closeCard();
    if (m === 'walk') frameCam(ctx, dt);
    // (the small turn without the card's framing: the camera stays behind where he faced, not round with him)
    if (change?.spin && !framing) ctx.cam.behindYaw = change.from;
  },

  frame(f, m) {
    clock = f.clock;
    if (m === 'overview' && !card?.open && shiftX === 0 && shiftY === 0) return;
    lens(f);
  },

  setMode(next) {
    mode = next;
    if (next === 'walk') return;
    // (off his feet: the change is done at once, the stall's card shuts; back to the map: everything)
    if (change) finishChange();
    turn = null;
    if (card?.mode === 'stall' || next === 'overview') closeCard();
    if (next === 'overview') toastNext = '';
  },

  fromUrl(q, ctx) {
    lastCtx = ctx;
    keepView = q.has('rcam');
    if (q !== env?.params) wearFrom(q);
    const e = env!;
    const which = q.get('clothes');
    if (which === '1' && stall) {
      // At its spot facing its seller (on the floor there), the card open.
      if (!stallOpen()) console.warn('[map] clothes: the krama stall is closed now (clock); its card opens all the same');
      const g = ctx.world.standAt?.(stall.x, stall.z, stall.y + 0.5, 1.1, 2.3) ?? stall.y;
      e.body.pos.set(stall.x, Number.isNaN(g) ? stall.y : g, stall.z);
      openStall(false);
      if (!keepView) frameNow(ctx, FRAME.stall);
      else {
        const rc = q.get('rcam')!.split(',').map(Number);
        ctx.cam.yaw = e.body.yaw + ((rc[0] ?? 0) * Math.PI) / 180;
      }
    } else if (which === 'wardrobe') {
      openWardrobe();
      if (!keepView && mode === 'walk' && frontOk) frameNow(ctx, FRAME.wardrobe);
    }
    const tab = q.get('clothestab') as WearKind | null;
    if (tab && WEAR_KINDS.includes(tab)) card?.setTab(tab);
    const fo = Number(q.get('clothesfocus'));
    if (q.has('clothesfocus') && Number.isFinite(fo)) card?.focus(fo);
    const buy = q.get('clothesbuy');
    if (buy && card?.mode === 'stall') {
      const it = wearItem(buy);
      if (!it) console.warn(`[map] clothes: no "${buy}" (${WEAR_ITEMS.map((i) => i.id).join(', ')})`);
      else {
        card.setTab(it.kind);
        card.focus(WEAR_ITEMS.filter((i) => i.kind === it.kind).indexOf(it));
        pick(it);
      }
    }
  },

  report() {
    const w = wardrobe;
    if (!w) return null;
    const out: Record<string, string> = {};
    const on = [...w.on.values()].map((i) => i.id);
    if (on.length) out.wear = on.join(',');
    const more = [...w.owned].filter((id) => !w.wearing(id));
    if (more.length) out.wearown = more.join(',');
    if (card?.open) {
      out.clothes = card.mode === 'stall' ? '1' : 'wardrobe';
      out.clothestab = card.tab;
    }
    return Object.keys(out).length ? out : null;
  },
});

/** Checks: `wear=` (he wears and owns those; `0`: his own), `wearown=` (he owns those too; `all`). */
function wearFrom(q: URLSearchParams): void {
  const w = wardrobe;
  if (!w) return;
  const own = q.get('wearown');
  if (own) w.fromIds(own === 'all' ? WEAR_ITEMS.map((i) => i.id) : own.split(',').map((s) => s.trim()).filter(Boolean), false);
  const wear = q.get('wear');
  if (wear === '0') w.original();
  else if (wear) w.fromIds(wear.split(',').map((s) => s.trim()).filter(Boolean), true);
  if (wear || own) dress();
}
