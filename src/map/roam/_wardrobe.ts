import { OUTFITS } from '../../character/AngkorExplorer';
import { SFX } from '../audio/addonSfx';
import '../audio/_wear';
import { frontOf, inWindow, MK, stallById, stallPoint } from '../hamlet/_mkPlan';
import { pad } from '../pad/pad';
import { browse, SALE, SHOPS, type Shop } from '../shop';
import type { MapFrame, RoamMode } from '../types';
import { onLang, t, type WordKey } from '../ui/lang';
import { LOOK_HOOKS, LOOK_TOOLS, MENU_HOOKS, MENU_PAGES, registerAddon, type AddonEnv } from './_addons';
import { createWearCard, type WearCard } from './_wardrobeCard';
import { Wardrobe, WEAR_ITEMS, WEAR_KINDS, wearItem, wearName, type WearItem, type WearKind } from './_wardrobeItems';
import { createLookPage, LOOK_PARTS, type LookChoice, type LookNow, type LookPage, type LookPart } from './_wardrobeLook';
import { angleDiff } from './followCam';
import type { RoamCtx, RoamWorld } from './types';

/**
 * Clothes from the market, and the explorer menu's Look page (the roaming
 * add-on `clothes`, words `wear…`, `look…`).
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
 * - **The Look page** (រូបរាង: the explorer menu's Look tab, I; `MENU_PAGES.look`,
 *   _wardrobeLook.ts): everything he wears, part by part — the outfit (his
 *   explorer clothes or the temple clothes; the four ready looks of G; his
 *   original look), the pack, the krama, the shirt, the legs, the hat, the
 *   face. What the market sells shows there from the start: what he has not
 *   bought yet dim with a lock, its price, and where it is sold. A choice is
 *   on at once (`pick`); on foot, standing free, with a small turn on the spot
 *   to show it off (`TWIRL`; another pick meanwhile goes on at once, the turn
 *   goes on). While it shows, on foot (not among a market's stalls), the
 *   camera comes round to his front and the picture slides left of the panel
 *   (above it, on a phone held upright); back as it was after. In the boat, on
 *   the glider or in the balloon it changes at once.
 * - **The parts are the explorer's own** (character/AngkorExplorer.ts
 *   `ExplorerOutfit`, `setClothes`): the outfit sets the legs (the shorts, or
 *   the sampot) and the camera (none with the temple clothes); the pack, the
 *   krama (`scarf`, and the market's colours), the hat (H; the market's band)
 *   and the face (X) go with every outfit. The market's shirt shows on both,
 *   its trousers only with the explorer clothes (in place of the shorts: with
 *   the sampot they wait, and the page says so). G, H and X stay in step with
 *   the page (it reads him each step: LOOK_TOOLS); a part the four looks do
 *   not have (no pack with the shorts, a krama with the sampot) is fine, and
 *   G goes on from the look before (`LOOK_HOOKS.changed`).
 * - The photos, the selfie and every roaming mode show them: it is the same
 *   explorer (the parts that change are built again once, on the change, from
 *   the tones in character/clothes.ts; never per frame).
 *
 * Saved: what he owns and wears from the market (`wear.owned`, `wear.on`);
 * the outfit, the pack, the krama on or off, the hat and the face are not
 * (as G, H and X never were: each visit starts in his explorer gear).
 *
 * Shots: `wear=<item>,<item>` dresses him (no saving: ids in _wardrobeItems.ts;
 * `wear=0` his own), `wearown=<item>,…|all` owns those too; `clothes=1` stands
 * him at the stall facing its seller with the card open (`clothes=wardrobe`:
 * the Look page, as `menu=1&menutab=look`), `clothestab=krama|shirt|trousers|hat`,
 * `clothesfocus=<i>` the ring on row i, `clothesbuy=<item>` buys it there and
 * then (`sim=_:<s>`: the hand-over ≈ 0.5, the turn ≈ 1.3‥2.1) · `lookpart=<part>`
 * the Look page on a part (outfit, pack, krama, shirt, legs, hat, face) ·
 * `kit=<shorts|sampot>,<explorer|default|none>,<0|1>` the outfit's legs, the
 * pack, the krama on (a look that is not one of G's four; theirs: `look=`).
 * `report()` gives `wear`, `wearown`, `clothes`, `clothestab`, `lookpart`, `kit`.
 */

/** The buyer's spot: this far out from the market's own buyers' (m: the roaming explorer is big), and how near it he must be (as hamlet/_shops.ts). */
const OUT = 0.35;
const REACH = 2.1;
/** After paying: in his hands (the shake) this long after (s), then the small turn (s), the clothes on this share of the way round. */
const HAND_AT = 0.95;
const SPIN = 1.15;
const DRESS_AT = 0.32;
/** The Look page's turn (s): the choice is on at once, he turns round once to show it. */
const TWIRL = 1.0;
/** Turning to the seller (s, a half turn; a small one is quicker). */
const TURN = 0.45;
/** The stick past this walks away from the card (and from the Look page's framing). */
const STICK = 0.3;
/**
 * The camera: at the stall behind his left shoulder (the seller and her goods
 * past him, left of the card: his front shows as he turns); the Look page on
 * foot, round to his front. `side` from behind him (radians, − round to his
 * left). It eases there over `for` s, then the player may look round; back as
 * it was after.
 */
const FRAME = {
  stall: { side: -1.2, pitch: 0.22, distance: 8.2 },
  look: { side: -2.6, pitch: 0.1, distance: 6.2 },
  rate: 2.2,
  back: 2.4,
  for: 2.6,
};
type Framing = (typeof FRAME)['stall'];
/** The lens shift while the card or the page is open (as the buy menu's: _shop.ts), at most this share of the view, eased at this rate (1/s). */
const SHIFT_MAX = 0.3;
const SHIFT_RATE = 4;
/** His step while he turns on the spot (m/s at true size, at the turn's fastest). */
const SPIN_STEP = 0.75;

let env: AddonEnv | null = null;
let wardrobe: Wardrobe | null = null;
let card: WearCard | null = null;
let page: LookPage | null = null;
/** The Look page shows (the explorer menu open on it). */
let pageOn = false;
/** He walked while it showed: the camera is the player's again until it shows anew. */
let walked = false;
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
 * A turn on the spot under way: after buying (`wait`: the hand-over first;
 * the clothes on at `at` of it: `apply`), or the Look page's (`apply` null:
 * already on). None off his feet or while something has him.
 */
let change: { apply: (() => void) | null; t: number; wait: number; len: number; at: number; spin: boolean; from: number; toast: string; bought: WearItem | null } | null = null;
/** A toast to show on the next step. */
let toastNext = '';
/** The camera: the player's before (to go back to), the framing now, how long (s); the URL's camera kept. */
let before: { pitch: number; distance: number } | null = null;
let framing: Framing | null = null;
let view: Framing = FRAME.stall;
/** The framing found no clear view (the Look page's, his front against a wall): the camera is left alone. */
let noRoom = false;
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

/** The stall's card (made the first time: nothing until then). */
function theCard(e: AddonEnv): WearCard {
  return (card ??= createWearCard({
    layer: e.layer,
    riel: () => e.purse.riel,
    owned: (id) => !!wardrobe?.has(id),
    wearing: (id) => !!wardrobe?.wearing(id),
    waits: (it) => it.kind === 'trousers' && e.explorer.currentOutfit.legs !== 'shorts',
    original: () => isOriginal(),
    onPick: pick,
    onOriginal: () => original(true),
    onClose: closeCard,
    sound: e.uiSound,
  }));
}

/** Dress him as the wardrobe says (only the parts that change are built again), the photo's hidden body kept hidden. */
function dress(): void {
  if (!env || !wardrobe) return;
  env.explorer.setClothes(wardrobe.clothes());
  env.photo.refreshBody();
}

/** On foot, standing free: the change comes with the small turn. */
function canSpin(): boolean {
  return !!env && mode === 'walk' && env.body.grounded && !env.explorer.animator.posture && !env.explorer.currentAction && !env.photo.kind;
}

/** After buying: `apply` puts it on (or off) a third of the way round the turn, or at once off his feet. */
function startChange(apply: () => void, toast: string, bought: WearItem | null): void {
  if (!env) return;
  change?.apply?.();
  const spin = canSpin();
  change = { apply, t: 0, wait: bought ? HAND_AT : 0, len: SPIN, at: DRESS_AT, spin, from: env.body.yaw, toast, bought };
  card?.busy(true, bought?.id ?? '');
  if (!spin && !bought) finishChange();
}

/** The change done: the clothes on (if not yet), the card free again, the toast. */
function finishChange(): void {
  const c = change;
  if (!c) return;
  change = null;
  c.apply?.();
  if (c.spin && env) env.body.yaw = c.from;
  card?.busy(false);
  card?.refresh();
  if (c.bought && card?.mode === 'stall') card.say('wearSuits');
  if (c.toast) toastNext = c.toast;
}

/** The Look page's choice is on: on foot, standing free, he turns round once to show it (a turn under way goes on). */
function twirl(): void {
  if (!env || change || !canSpin()) return;
  change = { apply: null, t: 0, wait: 0, len: TWIRL, at: 0, spin: true, from: env.body.yaw, toast: '', bought: null };
}

/** A row of the stall's card: buy it, put it on, or take it off. */
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

/** Wear `it` (bought now: after the hand-over), the part it is shown on (`wearKind`). */
function putOn(it: WearItem, bought: boolean): void {
  if (!env || !wardrobe) return;
  startChange(
    () => {
      wearKind(it.kind, it);
      SFX.play('wearOn', 1);
    },
    // (trousers in the temple clothes wait for the explorer clothes: the toast says so)
    it.kind === 'trousers' && env.explorer.currentOutfit.legs !== 'shorts' ? `${wearName(it)} · ${t('wearWithExplorer')}` : t('wearNowWearing', { name: wearName(it) }),
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
      w.wear(kind, null);
      dress();
      SFX.play('wearOff', 1);
    },
    t('wearTookOff', { name: wearName(it) }),
    null,
  );
}

/**
 * The market's `it` (or his own: null) of `kind` on, and the part that shows it: the krama round his neck, the
 * hat on his head (not while the umbrella is up, nor sitting, lying or praying: those keep his hat for him). The
 * trousers wait for the explorer clothes when he has the sampot on.
 */
function wearKind(kind: WearKind, it: WearItem | null): void {
  const e = env!;
  const w = wardrobe!;
  w.wear(kind, it);
  // (first the colours, then the part: built once, in the new colours)
  dress();
  if (kind === 'krama' && !e.explorer.currentOutfit.scarf) {
    e.explorer.setOutfit({ scarf: true });
    e.photo.refreshBody();
    LOOK_HOOKS.changed();
  }
  if (kind === 'hat' && !e.explorer.currentOutfit.hat && !MENU_HOOKS.umbrellaUp() && !e.busy()) LOOK_TOOLS.setHat(true);
}

/** He looks as he set out: his explorer gear (the big pack, his krama, the shorts, the camera), his own clothes, his hat on. */
function isOriginal(): boolean {
  const o = env?.explorer.currentOutfit;
  const g = OUTFITS.explorerGear;
  return !!o && !wardrobe?.on.size && o.legs === g.legs && o.pack === g.pack && o.scarf === g.scarf && o.camera === g.camera && LOOK_TOOLS.hat();
}

/** His original look again (what he bought stays his): `card` from the stall's card (after a turn there). */
function original(fromCard = false): void {
  const e = env;
  const w = wardrobe;
  if (!e || !w || isOriginal()) return;
  const apply = () => {
    w.original();
    dress();
    const gear = LOOK_TOOLS.looks.findIndex(([n]) => n === 'explorerGear');
    const o = e.explorer.currentOutfit;
    const g = OUTFITS.explorerGear;
    if (gear >= 0 && (o.legs !== g.legs || o.pack !== g.pack || o.scarf !== g.scarf || o.camera !== g.camera)) LOOK_TOOLS.setLook(gear);
    if (!LOOK_TOOLS.hat()) setHat(true);
    SFX.play('wearOff', 1);
  };
  if (fromCard) {
    if (change) return;
    startChange(apply, t('wearBackOriginal'), null);
  } else {
    apply();
    e.hud.toast(t('wearBackOriginal'));
    twirl();
  }
}

/** The hat on or off as H does (the umbrella up and the hat to go on: by H itself, so the umbrella folds for it: _umbrella.ts). */
function setHat(on: boolean): void {
  if (on && MENU_HOOKS.umbrellaUp() && !env?.explorer.currentOutfit.hat) env?.controls.press('KeyH');
  else LOOK_TOOLS.setHat(on);
}

// ── The Look page ──────────────────────────────────────────────────────────

/** What he has on now (one object, filled anew each time: the page compares it each step). */
const NOW: LookNow = { outfit: 'explorer', pack: 'big', krama: 'own', shirt: 'own', legs: 'shorts', hat: 'own', face: 0, preset: -1 };
function lookNow(): LookNow {
  const e = env!;
  const w = wardrobe!;
  const o = e.explorer.currentOutfit;
  NOW.outfit = o.legs === 'sampot' ? 'temple' : 'explorer';
  NOW.pack = o.pack === 'explorer' ? 'big' : o.pack === 'default' ? 'day' : 'none';
  NOW.krama = o.scarf ? (w.on.get('krama')?.id ?? 'own') : 'none';
  NOW.shirt = w.on.get('shirt')?.id ?? 'own';
  NOW.legs = o.legs === 'sampot' ? 'sampot' : (w.on.get('trousers')?.id ?? 'shorts');
  NOW.hat = LOOK_TOOLS.hat() ? (w.on.get('hat')?.id ?? 'own') : 'none';
  NOW.face = LOOK_TOOLS.face();
  NOW.preset = -1;
  const looks = LOOK_TOOLS.looks;
  for (let i = 0; i < looks.length; i++) {
    const l = OUTFITS[looks[i][0]];
    if (l.legs === o.legs && l.pack === o.pack && l.scarf === o.scarf && l.camera === o.camera) {
      NOW.preset = i;
      break;
    }
  }
  return NOW;
}

/** What the outfit he has on cannot show: shorts and trousers with the sampot, the sampot with the explorer clothes. */
function blocked(c: LookChoice): WordKey | null {
  if (c.part !== 'legs' || !env) return null;
  const sampot = env.explorer.currentOutfit.legs === 'sampot';
  if (c.id === 'sampot') return sampot ? null : 'lookSampotWhy';
  return sampot ? 'lookLegsWhy' : null;
}

/** A choice of the Look page put on (at once; the turn on foot). */
function pickLook(c: LookChoice): void {
  const e = env;
  const w = wardrobe;
  if (!e || !w) return;
  const o = e.explorer.currentOutfit;
  let worn = true;
  switch (c.part) {
    case 'outfit':
      if (c.id === 'original') return original();
      if (c.preset !== undefined) LOOK_TOOLS.setLook(c.preset);
      else {
        const temple = c.id === 'temple';
        e.explorer.setOutfit(temple ? { legs: 'sampot', camera: false } : { legs: 'shorts', camera: true });
        // (no camera in the temple clothes: it goes away if it was up)
        if (temple && e.photo.kind === 'camera') e.photo.lower();
        LOOK_HOOKS.changed();
      }
      break;
    case 'pack':
      worn = c.id !== 'none';
      e.explorer.setOutfit({ pack: c.id === 'big' ? 'explorer' : c.id === 'day' ? 'default' : 'none' });
      LOOK_HOOKS.changed();
      break;
    case 'krama':
      if (c.id === 'none') {
        worn = false;
        e.explorer.setOutfit({ scarf: false });
        LOOK_HOOKS.changed();
      } else wearKind('krama', c.item ?? null);
      break;
    case 'shirt':
      w.wear('shirt', c.item ?? null);
      dress();
      break;
    case 'legs':
      if (o.legs !== 'shorts') return;
      w.wear('trousers', c.item ?? null);
      dress();
      break;
    case 'hat':
      if (c.id === 'none') {
        worn = false;
        setHat(false);
      } else {
        w.wear('hat', c.item ?? null);
        dress();
        // (off for a prayer or lying down, it goes back on after, in this band)
        if (!LOOK_TOOLS.hat()) setHat(true);
      }
      break;
    case 'face':
      LOOK_TOOLS.setFace(c.face ?? 0);
      return;
  }
  e.photo.refreshBody();
  SFX.play(worn ? 'wearOn' : 'wearOff', 1);
  twirl();
}

/**
 * The Look page shows on foot (not walked off): tools.ts turns his lantern, torch or flashlight low and, after dark,
 * lights him softly from the camera's side (LOOK_HOOKS.showing), so the clothes read true; as it was once it goes.
 */
function lit(): void {
  LOOK_HOOKS.showing = pageOn && mode === 'walk' && !walked;
}

function thePage(e: AddonEnv): LookPage {
  return (page ??= createLookPage({
    now: lookNow,
    owned: (id) => !!wardrobe?.has(id),
    blocked,
    note: (p) => (p === 'legs' && e.explorer.currentOutfit.legs === 'sampot' ? 'lookLegsNote' : p === 'hat' && MENU_HOOKS.umbrellaUp() && !e.explorer.currentOutfit.hat ? 'lookHatUmbrella' : null),
    pick: pickLook,
    isOriginal,
    sound: e.uiSound,
    shown: (on) => {
      pageOn = on;
      walked = false;
      if (on) frontOk = mode === 'walk' && frontFree();
      lit();
    },
  }));
}

function closeCard(): void {
  if (!card?.open) return;
  card.close();
  turn = null;
  browse(lastCtx?.t ?? 0, null);
}

/** At the stall: the card, turned to the seller (`turnNow`, else facing her at once), the seller looks up. */
function openStall(turnNow: boolean): void {
  const e = env;
  if (!e || !stall) return;
  theCard(e).show();
  const yaw = stall.facing ?? e.body.yaw;
  if (turnNow) turnTo(yaw);
  else e.body.yaw = yaw;
  browse(lastCtx?.t ?? 0, stall);
}

function turnTo(yaw: number): void {
  const b = env!.body;
  const by = angleDiff(yaw, b.yaw);
  turn = { from: b.yaw, by, t: 0, len: TURN * (0.45 + (0.55 * Math.abs(by)) / Math.PI) };
}

/**
 * The view for a framing with him facing `yaw` (its side, the other, nearer, lower): the first with nothing between
 * the camera and him. None clear: the stall's nearer and lower all the same; the Look page's none (null: his front
 * is against a wall, in a gallery: the camera stays the player's, never into the back of his head).
 */
function clearView(w: RoamWorld, yaw: number, f: Framing): Framing | null {
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
  // (the Look page: his front, either way round, his side at most; the stall's: behind his shoulder, nearer his back too)
  const sides = f === FRAME.look ? [f.side, f.side * 0.8, f.side * 1.2, -f.side, -f.side * 0.8, f.side * 0.6] : [f.side, f.side * 0.8, f.side * 1.2, f.side * 0.6, -f.side, f.side * 0.4];
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
  return f === FRAME.look ? null : { side: f.side * 0.5, pitch: f.pitch * 0.5, distance: Math.max(4, f.distance * 0.7 * far) };
}

/**
 * Among stalls (a shop within this, m: a market's goods, tarps and parasols are not in the walk map, so the
 * clearances cannot see them) the Look page leaves the camera where the player has it.
 */
const STALLS_NEAR = 9;
/** The Look page may bring the camera round to his front here (on foot, free, not among a market's stalls). */
let frontOk = false;
function frontFree(): boolean {
  const p = env!.body.pos;
  for (const s of SHOPS) if (Math.abs(s.y - p.y) < 4 && (s.x - p.x) ** 2 + (s.z - p.z) ** 2 < STALLS_NEAR * STALLS_NEAR) return false;
  return !!stall && (stall.x - p.x) ** 2 + (stall.z - p.z) ** 2 >= STALLS_NEAR * STALLS_NEAR;
}

/** The camera for the card or the page (see `FRAME`), and back to the player's after. */
function frameCam(ctx: RoamCtx, dt: number): void {
  const e = env!;
  const want =
    keepView || mode !== 'walk' ? null : card?.mode === 'stall' ? FRAME.stall : pageOn && frontOk && !walked && !e.busy() ? FRAME.look : null;
  const cam = ctx.cam;
  const facing = change?.spin ? change.from : turn ? turn.from + turn.by : e.body.yaw;
  if (want) {
    if (want !== framing) {
      framing = want;
      framed = 0;
      const v = clearView(ctx.world, facing, want);
      noRoom = !v;
      if (v) view = v;
    }
    // (no clear view of his front here: the camera stays as the player has it)
    if (noRoom) return;
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
  noRoom = false;
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
  framing = f;
  framed = FRAME.for;
  cam.focus.set(e.body.pos.x, e.body.pos.y + 1.7 * 0.95 * 0.86 * e.body.scale, e.body.pos.z);
  const v = clearView(ctx.world, e.body.yaw, f);
  noRoom = !v;
  if (!v) return;
  view = v;
  before ??= { pitch: cam.pitch, distance: cam.distance };
  cam.yaw = e.body.yaw + view.side;
  cam.behindYaw = cam.yaw;
  cam.pitch = view.pitch;
  cam.distance = view.distance;
}

/**
 * The lens shift while the card or the Look page is open: he stands in the middle of the view it leaves free (as the
 * buy menu, _shop.ts): left of a panel at the right, above one along the bottom (a phone held upright).
 */
function lens(f: MapFrame): void {
  let wx = 0;
  let wy = 0;
  const menu = pageOn && page ? page.el.closest<HTMLElement>('.rxm') : null;
  const box = card?.open ? card.el : (menu ?? (pageOn ? page?.el : null));
  if (box && f.roam === 'walk' && !keepView) {
    const W = innerWidth;
    const H = innerHeight;
    const r = box.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      // (the menu docked along the bottom, a phone held upright: _explorerMenu.ts `data-dock`; the card: a sheet as wide)
      const below = menu ? menu.dataset.dock === 'bottom' : r.width > W * 0.7;
      if (below) wy = Math.min(SHIFT_MAX, Math.max(0, 0.5 - r.top / 2 / H));
      else wx = Math.min(SHIFT_MAX, Math.max(0, 0.5 - r.left / 2 / W));
    }
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
    // (the explorer menu's Look tab: _explorerMenu.ts puts the page in it)
    MENU_PAGES.look = thePage(e);
    // (checks: the dev server and shots)
    if (import.meta.env.DEV || e.shot)
      (window as unknown as { __clothes: unknown }).__clothes = {
        state: () => {
          const w = wardrobe!;
          const c = change;
          return {
            card: card?.mode ?? null,
            tab: card?.tab ?? null,
            change: c ? { t: c.t, spin: c.spin, applied: !c.apply, bought: c.bought?.id ?? null } : null,
            owned: [...w.owned],
            on: [...w.on.values()].map((i) => i.id),
            saving: w.saving,
            stall: stall && { x: stall.x, y: stall.y, z: stall.z, facing: stall.facing },
            open: stallOpen(),
            framing: framing === FRAME.stall ? 'stall' : framing === FRAME.look ? (noRoom ? 'look:no-room' : 'look') : null,
            // (the framing's view: its side from behind him, in degrees, as found clear; the camera's from his back now)
            view: framing && { side: Math.round((view.side * 180) / Math.PI), pitch: +view.pitch.toFixed(2), distance: +view.distance.toFixed(1) },
            camFromBack: Math.round((angleDiff(e.cam.yaw, e.body.yaw) * 180) / Math.PI),
            shift: [shiftX, shiftY],
            page: pageOn ? page!.state() : null,
            now: { ...lookNow() },
            // (what the explorer himself has on: the items whose tones he wears, and his look)
            explorer: Object.fromEntries(Object.entries(e.explorer.currentClothes).map(([k, v]) => [k, WEAR_ITEMS.find((i) => i.look === v)?.id ?? null])),
            outfit: { ...e.explorer.currentOutfit },
          };
        },
        /** The Look page on a part (it shows only with the menu open on it). */
        part: (p: LookPart) => page?.setPart(p),
        /** Roaming's group (his lights in hand are in it: tools.ts `roam:tools`). */
        scene: () => e.scene,
        page: () => page,
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
      if (m !== 'walk') closeCard();
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
    // (the Look page open and he walks off: the camera is the player's again)
    if (pageOn && !change && Math.hypot(i.move.x, i.move.y) > STICK) walked = true;
    // (handing over and the small turn: he keeps still)
    return change !== null && change.spin;
  },

  after(ctx, m, dt) {
    lastCtx = ctx;
    const e = env!;
    lit();
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
        const u = Math.max(0, c.t - c.wait) / c.len;
        const k = Math.min(1, u);
        // (a full turn on the spot to his left, stepping round, eased in and out)
        e.body.yaw = c.from + Math.PI * 2 * k * k * k * (k * (k * 6 - 15) + 10);
        if (k > 0 && k < 1) e.explorer.setMotion(SPIN_STEP * Math.sin(Math.PI * k), true, 0);
        if (c.apply && k >= c.at) {
          const a = c.apply;
          c.apply = null;
          a();
        }
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
    lit();
    if (next === 'walk') {
      if (pageOn) frontOk = frontFree();
      return;
    }
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
    kitFrom(q);
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
    } else if (which === 'wardrobe' && !pageOn) LOOK_HOOKS.open();
    const part = q.get('lookpart') as LookPart | null;
    if (part) {
      if (LOOK_PARTS.includes(part)) page?.setPart(part);
      else console.warn(`[map] clothes: no part "${part}" (${LOOK_PARTS.join(', ')})`);
    }
    // (the Look page open in a shot: the camera at his front at once)
    if (pageOn && !keepView && mode === 'walk' && frontOk && !e.busy()) frameNow(ctx, FRAME.look);
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
    const e = env;
    if (!w || !e) return null;
    const out: Record<string, string> = {};
    const on = [...w.on.values()].map((i) => i.id);
    if (on.length) out.wear = on.join(',');
    const more = [...w.owned].filter((id) => !w.wearing(id));
    if (more.length) out.wearown = more.join(',');
    if (card?.open) {
      out.clothes = '1';
      out.clothestab = card.tab;
    }
    // (the Look page open: the menu on it, on its part; tools.ts may say `menu=1&menutab=look` too)
    if (pageOn && page && !card?.open) {
      out.clothes = 'wardrobe';
      out.lookpart = page.part;
    }
    // (a look that is none of G's four: its parts; one of them is tools.ts's `look=`)
    const o = e.explorer.currentOutfit;
    if (lookNow().preset < 0) out.kit = `${o.legs},${o.pack},${o.scarf ? 1 : 0}`;
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

/** Checks and bug reports: `kit=<legs>,<pack>,<krama 0|1>` (after tools.ts's `look=`): the outfit's legs (the camera with them), the pack, the krama. */
function kitFrom(q: URLSearchParams): void {
  const e = env;
  const kit = q.get('kit')?.split(',');
  if (!e || !kit) return;
  const [legs, pk, sc] = kit;
  if ((legs !== 'shorts' && legs !== 'sampot') || (pk !== 'explorer' && pk !== 'default' && pk !== 'none')) {
    console.warn(`[map] clothes: kit=${kit.join(',')}: <shorts|sampot>,<explorer|default|none>,<0|1>`);
    return;
  }
  e.explorer.setOutfit({ legs, camera: legs === 'shorts', pack: pk, scarf: sc === '1' });
  e.photo.refreshBody();
  LOOK_HOOKS.changed();
}
