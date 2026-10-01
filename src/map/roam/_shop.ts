import type { AngkorExplorer } from '../../character/AngkorExplorer';
import { MEAL, MEAL_OF, type MealAction } from '../../character/meals';
import { nearby, type Nearby } from '../greet';
import { pad } from '../pad/pad';
import { Bubble } from '../people/_bubble';
import type { Point } from '../people/_routes';
import { browse, SHOPS, shopNear, sold, type ConsumeKind, type Shop, type ShopItem } from '../shop';
import type { MapFrame, RoamMode, UISound } from '../types';
import { num, onLang, t, type WordKey } from '../ui/lang';
import { angleDiff } from './followCam';
import { PAD_LIGHT } from './input';
import { createShopBag, firstFood, KEEPSAKES, type ShopBag } from './_shopBag';
import { createShopMenu, isDrink, type ShopMenu } from './_shopMenu';
import { CARRY_MAX, createPurse, keptOf, nameOf, POCKET, POCKET_EVERY, riel, type Kept, type Purse } from './_shopPurse';
import type { FollowCam, RoamBody, RoamCtx, RoamHud, RoamWorld } from './types';

/**
 * Buying food and drink while roaming, and eating and drinking it (the
 * player asked: "I want our character to buy things, and eat and drink what
 * we buy"). The shops are shop.ts's (`registerShop`: each place registers
 * its stalls when it is built; the east side's are hamlet/_shops.ts).
 *
 * 1. **At a stall**: in front of an open one the walker offers
 *    "E  ទិញ — តូបនំបញ្ចុក" / "E  Buy — Num banh chok stall" (walker.ts,
 *    after a golden figure and a shrine, before a boat; on touch the Use
 *    button; a closed one only says it is closed, when nothing else is in
 *    reach). E turns him to the seller, the camera comes round behind his
 *    shoulder so both show (on a side from which nothing stands between),
 *    the seller looks up and asks what he would like (people/_saleBack.ts,
 *    `BROWSE`), and the buy menu opens (_shopMenu.ts): what the stall sells
 *    with its pixel picture and price.
 * 2. **Paying**: with the riel for it, the purse pays (a soft rustle of
 *    notes: `coin`), the sale goes out (`SALE`: the seller turns to him and
 *    holds it out, "អរគុណបង!"), and a moment later it is in his hands; the
 *    menu asks: eat (drink) it now — the default — or keep it for later (he
 *    carries up to `CARRY_MAX`). Short of riel, the menu says so: more
 *    pocket money comes at dawn (_shopPurse.ts).
 * 3. **Eating and drinking**: the character's `eat`, `bite` or `drink`
 *    with the thing in his hands (src/character: `holdFood`, meals.ts
 *    `MEAL_OF` / `MEAL`); at the stall he turns from the counter first and
 *    eats standing beside it, as at a street stall (the noodle stall's low
 *    stools want a posture the character has not: he does not sit on them); the
 *    camera comes round to his front to watch (a side from which nothing
 *    stands between: `clearView`), a munch or a sip on each bite; then
 *    "ឆ្ងាញ់!" / "Delicious!" (a drink: "ស្រស់ស្រាយ!" / "So refreshing!") in
 *    a bubble over his head. After the meal's first moment (its `stick`)
 *    the stick, Space, E or a tool key stops it.
 * 4. **Later**: what he keeps waits in his bag: the tool bar's slot 6 (and
 *    the key 6) eats or drinks the first, the explorer menu's "In my bag"
 *    any of them (_shopBag.ts). On foot, standing or sitting on the ground
 *    (J); not lying down, not in the boat, on the glider or in the balloon.
 *
 * The purse shows under the gold counter while roaming, and at the foot of
 * the buy menu. Nothing runs while he is not buying or eating but the
 * walker's look for a stall in reach (a handful of distances a step).
 *
 * URL (checks): `shop=<id>` he stands at that shop (`market-noodles`,
 * `market-grill`, `market-drinks`, `market-fruit`, `market-fruitG`,
 * `market-cakes`, `market-sugar`, `eastvillage-shop`, `kulen-stall`,
 * `kulen-road`; the other places' own: `palm-sugar-stall`,
 * `back-breakfast`, `back-produce`, `back-fruit`, `back-krok`,
 * `back-coconut`, the floating village's `village-…`; an unknown id lists
 * them in the console), facing its seller, the buy menu open · `shopbuy=<item>` with it: just bought that (the seller hands it
 * over; now or later?) · `bought=<item>` or `<shop>:<item>` eating or
 * drinking it now, where he is (`sim=_:<s>` that far in) · `shopfocus=<i>`
 * the keyboard's ring on row i (1: keep, on the second step) · in `sim=`,
 * `e` steps away from the list or takes the choice, `6` eats what he keeps ·
 * `purse=<riel>`, `kept=<item>,…`, `buy=0` (_shopPurse.ts).
 */

/** What E does at a stall, for the walker (walker.ts): in its row after a shrine, before a boat. */
export interface StallHooks {
  /** At a stall's menu, taking what he bought, or eating: no prompt over him meanwhile. */
  busy(): boolean;
  /**
   * The stall within reach of his feet (x, y, z): an open one ("E  Buy — …"),
   * else a closed one (it says so); null when there is none. (One object,
   * filled again each call.)
   */
  near(x: number, y: number, z: number): { shop: Shop; open: boolean; prompt: string } | null;
  /** E there: the buy menu opens. */
  buy(shop: Shop): void;
}

/** The walker's link to buying (filled by `createShopping`; until then no stall is near). */
export const stalls: StallHooks = { busy: () => false, near: () => null, buy() {} };

/**
 * The meal he is having now, for the add-ons (a monkey snatching it from his hands: _monkeyThief.ts): what it is and
 * how far in (s), or null; `snatch` ends it at once, as the stick does (no "Delicious!"). Filled by `createShopping`.
 */
export const meals: { now(): { readonly what: Kept; readonly t: number } | null; snatch(): void } = { now: () => null, snatch() {} };

export interface Shopping {
  /** The buy menu is open: roaming waits behind it (its keys are its own). */
  readonly menuOpen: boolean;
  /** His hands are for what he bought (taking it, eating it): the lantern, torch or flashlight is put away. */
  readonly handsBusy: boolean;
  /** Eating or drinking now. */
  readonly eating: boolean;
  /** The tool bar's slot (6) and the explorer menu's "In my bag" (_shopBag.ts). */
  readonly bag: ShopBag;
  /** His riel and what he keeps (_shopPurse.ts; the add-ons pay and earn with it too). */
  readonly purse: Purse;
  /**
   * Before the walker's step (tools.ts): the menu's own input (a push of the
   * stick walks away), eating (the stick or a key stops it after the first
   * moment), the bag's key (6). True when it took the step's input (he
   * keeps still).
   */
  input(ctx: RoamCtx, mode: RoamMode, tap: (...codes: string[]) => boolean): boolean;
  /** After the walker's step, on foot: the turn to the seller, the camera, the goods into his hands, eating. */
  step(ctx: RoamCtx, dt: number): void;
  /** Every frame (every mode): the bubble over his head, pocket money, the frame the shops' hours are read from. */
  frame(f: MapFrame): void;
  /** A new mode (off his feet): the menu shuts, eating stops at once. */
  stop(): void;
  fromUrl(params: URLSearchParams, ctx: RoamCtx): void;
  /** URL params that put it back as it is (bug reports). */
  report(): Record<string, string>;
}

export interface ShoppingDeps {
  explorer: AngkorExplorer;
  body: RoamBody;
  cam: FollowCam;
  hud: RoamHud;
  /** The roaming interface's layer (the menu, the purse). */
  layer: HTMLElement;
  /** A key as if pressed (the bag's slot: 6; RoamControls.press). */
  press(code: string): void;
  /** Resting on the ground (_rest.ts `state`): sitting he may eat, lying or asleep not. */
  resting(): 'sit' | 'lie' | 'sleep' | null;
  /** Something else has his hands or his view (praying, the camera or the phone up, the album). */
  occupied(): boolean;
  /** He picked something in the explorer menu's bag: it shuts, so the eating shows. */
  closeMenus(): void;
  uiSound?(s: UISound): void;
}

// ── Timing and the camera ────────────────────────────────────────────────────

/** Turning to the seller (s, a half turn; a small one is quicker); to eat, from the counter, this far round from facing it (radians), in this long. */
const TURN = 0.45;
const AWAY = Math.PI - 0.45;
const TURN_AWAY = 0.9;
/** After paying, the seller hands it over: in his hands this long after (s). */
const HAND_AT = 0.95;
/** The stick past this walks away from the list / stops eating (after the meal's own `stick` s: meals.ts `MEAL`). */
const STICK = 0.3;
/** The bubble after eating (s). */
const SAY_FOR = 2.6;
/** His head's top over his feet (m, at his roaming size, with the hat): the bubble's tail points there. */
const HEAD = 2.75;
/**
 * The camera: at the stall behind his left shoulder, a little above (the
 * seller and the goods show past him, left of the menu); eating, round to
 * his front-left, low and near (his face and the food). `side` is from
 * behind him (radians, − round to his left); it eases there over `FOR` s,
 * then the player may look round; back as it was after.
 */
const FRAME = {
  menu: { side: -1.1, pitch: 0.24, distance: 8.2 },
  eat: { side: -2.35, pitch: 0.07, distance: 4.8 },
  // (sitting on the ground: the rest's own camera looks at the sky over him; eating, it comes round to his front, low)
  sit: { side: -2.2, pitch: 0.12, distance: 4.4 },
  rate: 2.2,
  back: 2.4,
  for: 2.6,
};
type Framing = (typeof FRAME)['menu'];
/** The camera's side is clear out this far past it and this far to either side (m: the follow camera's own margins). */
const OUT = 1.2;
const SIDE = 0.6;
/**
 * While the menu is open the picture slides (a lens shift: the camera's
 * view offset, nothing moves) so that he stands in the middle of the view
 * the menu leaves free: left of the panel, above the sheet on a phone held
 * upright; at most this share of the view, easing at this rate (1/s).
 */
const SHIFT_MAX = 0.3;
const SHIFT_RATE = 4;
/** On a phone held upright the camera stands this much further back. */
const NARROW_FAR = 1.3;
/** His chest sitting on the ground (m over his feet, at his roaming size): the camera looks there while he eats sitting. */
const SEATED_CHEST = 1.25;
/** The views tried, in turn (the framing's pitch and distance times these): as it says, then lower, then lower and nearer. */
const VIEW_TRIES: readonly (readonly [number, number])[] = [
  [1, 1],
  [0.3, 1],
  [0.3, 0.7],
  [0, 0.55],
];
/** Nobody within this angle (radians, either side) of the way from him to the camera (a stall's customer's head filling the view). */
const PEOPLE_CONE = 0.3;
/** Keys that stop eating (and do nothing else that step): the tools (the game pad's d-pad ↑ light too), the camera and the phone, the emotes. */
const BREAKERS = ['Digit1', 'Numpad1', 'Digit2', 'Numpad2', 'Digit3', 'Numpad3', PAD_LIGHT, 'Digit4', 'Numpad4', 'KeyZ', 'Digit5', 'Numpad5', 'KeyY', 'KeyO', 'KeyF', 'KeyC', 'KeyU', 'KeyP'];

// ── The character (src/character: parts/food.ts, meals.ts): what he holds and the meals ─────

/** Put what he bought in his hands (null: nothing: into his bag, or eaten). */
function hold(ex: AngkorExplorer, kind: ConsumeKind | null, colors?: readonly number[]): void {
  ex.holdFood(kind, colors);
}
/** The meal for a kind (`eat`, `bite`, `drink`: meals.ts `MEAL_OF`). */
const mealAction = (kind: ConsumeKind): MealAction => MEAL_OF[kind];
/** When the bites (sips) come in a meal (s): a munch or a sip each. */
function biteTimes(a: MealAction): readonly number[] {
  const m = MEAL[a];
  return 'sips' in m ? m.sips : m.bites;
}

export function createShopping(d: ShoppingDeps): Shopping {
  const { explorer, body, cam, hud } = d;
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot') === '1';
  /** The item for an id (`shop:item`, or the first shop selling `item`). */
  const find = (id: string): { shop: Shop; item: ShopItem } | null => {
    const [a, b] = id.includes(':') ? id.split(':') : ['', id];
    for (const s of SHOPS) {
      if (a && s.id !== a) continue;
      const it = s.items.find((i) => i.id === b);
      if (it) return { shop: s, item: it };
    }
    return null;
  };
  const purse: Purse = createPurse(params, shot, (id) => {
    const f = find(id);
    return f ? keptOf(f.shop, f.item) : null;
  });

  let menu: ShopMenu | null = null;
  /** The last frame (the shops' hours read from it) and step context. */
  let lastFrame: MapFrame | null = null;
  let lastCtx: RoamCtx | null = null;
  /** The stall he is at (the menu, the take), and his turn to its seller. */
  let shop: Shop | null = null;
  let turn: { from: number; by: number; t: number; len: number } | null = null;
  /** Paid for: what, since when (s), what the player chose, in his hands yet. */
  let paid: { shop: Shop; item: ShopItem; t: number; choice: 'eat' | 'keep' | null; inHand: boolean } | null = null;
  /** Eating or drinking: what, the action, how long (s), bites sounded, sitting on the ground. */
  let meal: { what: Kept; action: MealAction; t: number; bites: number; times: readonly number[]; sitting: boolean; ahh: boolean } | null = null;
  /** A thing of the bag picked (the explorer menu), eaten on the next step. */
  let pending = -1;
  /** The camera: the player's before (to go back to), the framing now and for how long (s); the URL's camera kept. */
  let before: { pitch: number; distance: number } | null = null;
  let framing: Framing | null = null;
  /** The view taken for it (`clearView`). */
  let view: Framing = FRAME.menu;
  let framed = 0;
  let keepView = false;
  /** The lens shift now (shares of the view: + the picture slides left, up). */
  let shiftX = 0;
  let shiftY = 0;
  /** Pocket money: seconds of roaming since the last, the clock last frame. */
  let roamT = 0;
  let pocketAt = 0;
  let lastClock = -1;
  /** The bubble over his head after eating, and until when it is updated (s, the frame's clock). */
  let bubble: Bubble | null = null;
  let talking = -1e9;
  const head: Point = { x: 0, y: 0, z: 0 };
  const seen: Nearby = { x: 0, y: 0, z: 0, d: 0, kind: '', elder: false };
  const headAt = () => {
    head.x = body.pos.x;
    head.y = body.pos.y + HEAD * (body.scale / 1.4);
    head.z = body.pos.z;
    return head;
  };

  const bag = createShopBag({
    layer: d.layer,
    purse,
    onSlot: () => d.press('Digit6'),
    onPick: (i) => {
      pending = i;
      d.closeMenus();
    },
  });
  purse.onChange(() => {
    bag.update();
    menu?.refresh();
  });

  const busy = () => !!menu?.open || paid !== null || meal !== null || turn !== null;

  /** The buy menu (made the first time he buys: nothing until then). */
  function theMenu(): ShopMenu {
    return (menu ??= createShopMenu({
      layer: d.layer,
      onPick: pick,
      onChoose: choose,
      onClose: closeOrKeep,
      sound: d.uiSound,
    }));
  }

  // ── The walker's hooks ─────────────────────────────────────────────────────
  const hit = { shop: null as unknown as Shop, open: false, prompt: '' };
  /** The prompts, made once a shop and language (asked every step while he stands there). */
  const prompts = new Map<string, string>();
  onLang(() => prompts.clear());
  const promptOf = (s: Shop, open: boolean): string => {
    const key = open ? s.id : `${s.id}|closed`;
    let p = prompts.get(key);
    if (p === undefined) prompts.set(key, (p = open ? `E  ${t('byBuyAt', { name: nameOf(s) })}` : t('byClosed', { name: nameOf(s) })));
    return p;
  };
  Object.assign(stalls, {
    busy,
    near(x: number, y: number, z: number) {
      const f = lastFrame;
      if (!f || busy()) return null;
      const s = shopNear(x, y, z, f);
      if (s) {
        hit.shop = s;
        hit.open = true;
        hit.prompt = promptOf(s, true);
        return hit;
      }
      // (a closed one in reach only says so)
      for (const c of SHOPS) {
        if (!c.open || Math.abs(c.y - y) > 2.5 || (c.x - x) ** 2 + (c.z - z) ** 2 > c.r * c.r) continue;
        hit.shop = c;
        hit.open = false;
        hit.prompt = promptOf(c, false);
        return hit;
      }
      return null;
    },
    buy: (s: Shop) => openAt(s, true),
  } satisfies StallHooks);
  Object.assign(meals, { now: () => meal, snatch: () => endMeal(false) });

  /** At stall `s`: turn to its seller (`turnNow`, else face it at once), the menu, the seller looks up. */
  function openAt(s: Shop, turnNow: boolean): void {
    shop = s;
    theMenu().show(s, purse);
    if (s.facing !== undefined) {
      if (turnNow) turnTo(s.facing, TURN);
      else body.yaw = s.facing;
    }
    browse(lastCtx?.t ?? 0, s);
    hud.prompt(null);
  }

  /** The list shut (Esc, the ×, walking away): he steps back, the seller goes back to her work. */
  function leave(): void {
    menu?.close();
    shop = null;
    turn = null;
    browse(lastCtx?.t ?? 0, null);
  }

  /** Item `i` of the list: pay for it (or say he is short), the seller hands it over, now or later? */
  function pick(i: number): void {
    const s = shop;
    const item = s?.items[i];
    if (!s || !item || paid) return;
    // (a keepsake, not food — the rice for the monks, _shopBag.ts `KEEPSAKES` —: it goes into his bag, so it needs room there)
    const keepsake = KEEPSAKES.has(item.id);
    if (keepsake && purse.kept.length >= CARRY_MAX) return hud.toast(t('byBagFull'));
    if (!purse.pay(item.price)) {
      menu?.short(i);
      return;
    }
    lastCtx?.sound('coin', 1);
    // (the game pad in hand: a light tick as the notes go)
    pad.rumble('tick');
    bag.update('purse');
    sold(lastCtx?.t ?? 0, s, item);
    paid = { shop: s, item, t: 0, choice: keepsake ? 'keep' : null, inHand: false };
    if (keepsake) menu?.close();
    else menu?.take(item, purse.kept.length < CARRY_MAX);
  }

  /** Now or later: carried out once it is in his hands (`step`). */
  function choose(c: 'eat' | 'keep'): void {
    if (!paid) return;
    paid.choice = c === 'keep' && purse.kept.length >= CARRY_MAX ? 'eat' : c;
    menu?.close();
  }

  /** Esc or the ×: the list shuts; paid for, it is kept (or eaten, his bag full). */
  function closeOrKeep(): void {
    if (paid) choose('keep');
    else leave();
  }

  /**
   * Eat or drink `what` now (from the stall or his bag). At a stall
   * (`counter`: the way he faces its seller) he turns from the counter first,
   * as one steps aside to eat.
   */
  function startMeal(what: Kept, counter?: number): void {
    const action = mealAction(what.consume);
    const r = d.resting();
    meal = { what, action, t: 0, bites: 0, times: biteTimes(action), sitting: r === 'sit', ahh: false };
    hold(explorer, what.consume, what.colors);
    explorer.play(action);
    if (counter !== undefined && r === null) turnTo(counter + AWAY, TURN_AWAY);
  }

  /** Turn him to `yaw` over `len` s for a half turn (a small one is quicker). */
  function turnTo(yaw: number, len: number): void {
    const by = angleDiff(yaw, body.yaw);
    turn = { from: body.yaw, by, t: 0, len: len * (0.45 + (0.55 * Math.abs(by)) / Math.PI) };
  }

  /** Done eating (`full`: to the end: the bubble; else stopped). */
  function endMeal(full: boolean): void {
    const m = meal;
    if (!m) return;
    meal = null;
    if (explorer.currentAction === m.action) explorer.stop(m.action);
    hold(explorer, null);
    purse.taste(m.what.id);
    if (full) {
      bubble ??= new Bubble();
      const key: WordKey = isDrink(m.what.consume) ? 'byFresh' : 'byYum';
      bubble.say(key, headAt, SAY_FOR);
      talking = (lastFrame?.t ?? 0) + SAY_FOR + 1;
    }
  }

  /** Eat or drink thing `i` of his bag, if he can now (else a short message why). */
  function eatKept(i: number, mode: RoamMode): void {
    const k = purse.kept[i];
    if (!k) {
      hud.toast(t('byBagEmpty'));
      return;
    }
    // (a keepsake is not eaten: it says what it is for; one being given, the rice for the monks, holds the bag)
    const keepsake = KEEPSAKES.get(k.id);
    if (keepsake) return keepsake.pick();
    for (const v of KEEPSAKES.values()) if (v.busy()) return;
    if (mode !== 'walk') return hud.toast(t('byOnFoot'));
    const r = d.resting();
    // (asleep, a key only wakes him: _rest.ts; lying, he sits up first)
    if (r === 'sleep') return;
    if (r === 'lie') return hud.toast(t('bySitUp'));
    if (busy() || d.occupied() || explorer.currentAction || !body.grounded) return;
    purse.take(i);
    startMeal(k);
  }

  /** Where his turn (to the seller, or away from the counter to eat) ends, or where he faces. */
  const facingNow = () => (turn ? turn.from + turn.by : body.yaw);

  /**
   * The view the camera takes for framing `f` with him facing `yaw` (see
   * `FRAME`): its own side, else the other side, else nearer behind him; if
   * none of those is free, lower (under a market hall's roof, a tree's
   * crown) and nearer. The first from which nothing stands between the
   * camera and him (stone, walls, a roof, a stall's tarp or parasol,
   * leaves: the world's clearances, as far out and as wide as the follow
   * camera looks; and, when it can be, nobody: greet.ts `nearby`), so it
   * never frames him from inside the stall or has to pull in.
   */
  function clearView(w: RoamWorld, yaw: number, f: Framing): Framing {
    const c = cam.focus;
    const hard = w.hardClearance ?? w.clearance;
    const soft = w.softClearance;
    const free = (a: number, pitch: number, dist: number) => {
      // (out a little past the camera, and a little to either side of it: as the follow camera looks, followCam.ts)
      const d = dist + OUT;
      const cp = Math.cos(pitch);
      const x = c.x - Math.sin(a) * cp * d;
      const y = c.y + Math.sin(pitch) * d;
      const z = c.z - Math.cos(a) * cp * d;
      for (const k of [0, 1, -1]) {
        const px = x + Math.cos(a) * SIDE * k;
        const pz = z - Math.sin(a) * SIDE * k;
        if ((hard?.(c.x, c.y, c.z, px, y, pz) ?? 1) < 0.98) return false;
        if (soft && (soft(c.x, c.y, c.z, px, y, pz, true) < 0.95 || soft(px, y, pz, c.x, c.y, c.z) < 0.95)) return false;
      }
      return true;
    };
    // (nor anyone standing or sitting between: the people part's finder)
    const clearOfPeople = (a: number, dist: number) => !nearby(body.pos.x, body.pos.y, body.pos.z, a + Math.PI, dist + OUT, PEOPLE_CONE, seen);
    const sides = [f.side, -f.side, f.side * 0.75, -f.side * 0.75, f.side * 0.5, -f.side * 0.5, f.side * 0.25, -f.side * 0.25];
    // (a phone held upright: a little further back, or he fills the narrow view)
    const far = cam.camera.aspect < 0.8 ? NARROW_FAR : 1;
    for (const [pk, dk] of VIEW_TRIES)
      for (const pass of [true, false])
        for (const sd of sides) {
          const pitch = f.pitch * pk;
          const distance = Math.max(4, f.distance * dk * far);
          if (free(yaw + sd, pitch, distance) && (!pass || clearOfPeople(yaw + sd, distance))) return { side: sd, pitch, distance };
        }
    return { side: f.side * 0.25, pitch: f.pitch * 0.3, distance: Math.max(4, f.distance * 0.7 * far) };
  }

  /** The camera for this moment (see `FRAME`), and back to the player's after. */
  function frameCam(w: RoamWorld, dt: number): void {
    const want: Framing | null = keepView ? null : meal ? (meal.sitting ? FRAME.sit : FRAME.eat) : menu?.open || paid ? FRAME.menu : null;
    if (want) {
      if (want !== framing) {
        framing = want;
        framed = 0;
        view = clearView(w, facingNow(), want);
      }
      before ??= { pitch: cam.pitch, distance: cam.distance };
      const yaw = facingNow() + view.side;
      // (the follow camera holds this side while it lasts; the first moments it is brought there)
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

  /**
   * The lens shift while the menu is open (see `SHIFT_MAX`): the free part
   * of the view is left of the panel (its left edge) or above the sheet
   * (its top), read from the menu's place on the page.
   */
  function lens(f: MapFrame): void {
    let wx = 0;
    let wy = 0;
    const el = menu?.open ? menu.el : null;
    if (el && f.roam === 'walk' && !keepView) {
      const W = innerWidth;
      const H = innerHeight;
      // (a sheet along the bottom: as wide as the view; else a panel at the right)
      if (el.offsetWidth > W * 0.7) wy = Math.min(SHIFT_MAX, Math.max(0, 0.5 - el.offsetTop / 2 / H));
      else wx = Math.min(SHIFT_MAX, Math.max(0, 0.5 - el.offsetLeft / 2 / W));
    }
    const k = shot || f.dt <= 0 ? 1 : 1 - Math.exp(-SHIFT_RATE * f.dt);
    shiftX += (wx - shiftX) * k;
    shiftY += (wy - shiftY) * k;
    const camera = f.camera;
    if (Math.abs(shiftX) < 1e-4 && Math.abs(shiftY) < 1e-4) {
      shiftX = shiftY = 0;
      if (camera.view?.enabled) camera.clearViewOffset();
      return;
    }
    const W = innerWidth;
    const H = innerHeight;
    camera.setViewOffset(W, H, shiftX * W, shiftY * H, W, H);
  }

  /** The camera at once where the framing eases to (a check's shot). */
  function frameNow(w: RoamWorld, f: Framing): void {
    before ??= { pitch: cam.pitch, distance: cam.distance };
    framing = f;
    framed = FRAME.for;
    // (the walker has not set its focus yet: his chest)
    cam.focus.set(body.pos.x, body.pos.y + (meal?.sitting ? SEATED_CHEST * (body.scale / 1.4) : 1.7 * 0.95 * 0.86 * body.scale), body.pos.z);
    view = clearView(w, facingNow(), f);
    cam.yaw = facingNow() + view.side;
    cam.behindYaw = cam.yaw;
    cam.pitch = view.pitch;
    cam.distance = view.distance;
  }

  return {
    get menuOpen() {
      return !!menu?.open;
    },
    get handsBusy() {
      return (paid?.inHand ?? false) || meal !== null;
    },
    get eating() {
      return meal !== null;
    },
    bag,
    purse,
    input(ctx, mode, tap) {
      lastCtx = ctx;
      const i = ctx.input;
      const push = Math.hypot(i.move.x, i.move.y) > STICK;
      if (mode !== 'walk') {
        if (tap('Digit6', 'Numpad6') || pending >= 0) {
          pending = -1;
          if (purse.kept.length) hud.toast(t('byOnFoot'));
        }
        return false;
      }
      // At the stall: the menu's keys are its own (_shopMenu.ts), and so is the game pad (a layer: its arrows, ✕ and ○ come in as keys).
      if (menu?.open || paid) {
        if (menu?.step === 'list' && push) {
          // (walking away: the list shuts, he walks on this very step)
          leave();
          return false;
        }
        if (i.exit) closeOrKeep();
        // (a check's `e`, or touch's Use — the keyboard's keys the menu takes itself: buy the one in the ring, take the choice)
        else if (i.use) menu?.confirm();
        i.exit = i.use = false;
        return true;
      }
      if (meal) {
        if (meal.t > MEAL[meal.action].stick && (push || i.jump || i.use || tap(...BREAKERS))) {
          endMeal(false);
          i.use = i.jump = false;
          // (the stick walks him on at once; a key only stops it)
          return !push;
        }
        return true;
      }
      // The bag: 6 (or its slot) eats or drinks the first thing; the explorer menu's picks any.
      if (tap('Digit6', 'Numpad6')) eatKept(Math.max(0, firstFood(purse.kept)), mode);
      else if (pending >= 0) eatKept(pending, mode);
      pending = -1;
      return meal !== null;
    },
    step(ctx, dt) {
      lastCtx = ctx;
      if (turn) {
        turn.t += dt;
        const k = Math.min(1, turn.t / turn.len);
        body.yaw = turn.from + turn.by * k * k * (3 - 2 * k);
        if (k >= 1) turn = null;
      }
      // (eating sitting on the ground: the camera looks at him, not at the sky over him as the rest's does, _rest.ts)
      if (meal?.sitting && !keepView) cam.focus.set(body.pos.x, body.pos.y + SEATED_CHEST * (body.scale / 1.4), body.pos.z);
      frameCam(ctx.world, dt);
      // The stall closed meanwhile (the clock), or he was moved off it: the list shuts.
      if (menu?.step === 'list' && shop && (Math.hypot(shop.x - body.pos.x, shop.z - body.pos.z) > shop.r + 1.5 || (lastFrame && shop.open && !shop.open(lastFrame)))) leave();
      // Paid for: the seller hands it over, then now or later.
      if (paid) {
        paid.t += dt;
        if (!paid.inHand && paid.t >= HAND_AT) {
          paid.inHand = true;
          hold(explorer, paid.item.consume, paid.item.colors);
        }
        if (paid.inHand && paid.choice) {
          const k = keptOf(paid.shop, paid.item);
          const keep = paid.choice === 'keep' && purse.keep(k);
          const counter = paid.shop.facing;
          paid = null;
          shop = null;
          browse(ctx.t, null);
          if (keep) {
            hold(explorer, null);
            hud.toast(KEEPSAKES.get(k.id)?.kept(nameOf(k)) ?? t('byKept', { name: nameOf(k), n: num(purse.kept.length), max: num(CARRY_MAX) }));
            bag.update('bag');
          } else if (KEEPSAKES.has(k.id)) hold(explorer, null);
          else startMeal(k, counter);
        }
      }
      // Eating: a munch or a sip on each bite; over when the action is.
      if (meal) {
        meal.t += dt;
        const drink = isDrink(meal.what.consume);
        while (meal.bites < meal.times.length && meal.t >= meal.times[meal.bites]) {
          meal.bites++;
          ctx.sound(drink ? 'sip' : 'munch', 0.75);
        }
        // (and after a drink, a satisfied breath: meals.ts `MEAL.drink.ahh`)
        if (drink && !meal.ahh && meal.t >= MEAL.drink.ahh) {
          meal.ahh = true;
          ctx.sound('ahh', 0.8);
        }
        if (meal.t > 0.15 && explorer.currentAction !== meal.action) endMeal(true);
      }
    },
    frame(f) {
      lastFrame = f;
      // Pocket money: each dawn of the map's day, and where the time of day stands still every `POCKET_EVERY` s of roaming.
      if (f.roam !== 'overview' && f.dt > 0 && !shot) {
        roamT += f.dt;
        const c = f.clock;
        const dawn = lastClock >= 0 && lastClock < 0.75 && c >= 0.75 && c - lastClock < 0.25;
        if (dawn || roamT - pocketAt > POCKET_EVERY) {
          pocketAt = roamT;
          const add = purse.pocket();
          if (add > 0) {
            hud.toast(t('byPocket', { n: riel(POCKET) }));
            bag.update('purse');
          }
        }
      }
      lastClock = f.clock;
      lens(f);
      if (bubble && f.t <= talking) bubble.update(f.dt, f.camera, f.roam !== 'overview');
    },
    stop() {
      if (menu?.open) menu.close();
      if (paid) {
        // (off his feet with it paid for: into his bag if there is room, else it is his all the same — eaten on the way)
        const k = keptOf(paid.shop, paid.item);
        if (!purse.keep(k)) purse.taste(k.id);
        paid = null;
      }
      if (meal) endMeal(false);
      hold(explorer, null);
      shop = null;
      turn = null;
      browse(lastCtx?.t ?? 0, null);
      pending = -1;
    },
    fromUrl(p, ctx) {
      lastCtx = ctx;
      keepView = p.has('rcam');
      const id = p.get('shop');
      const s = id ? SHOPS.find((x) => x.id === id) : null;
      if (id && !s) console.warn(`[map] shop "${id}" is not on the map (${SHOPS.map((x) => x.id).join(', ')})`);
      if (s) {
        // At its spot facing its seller (on the floor there: the walk map's, under a roof too), the menu open.
        const g = ctx.world.standAt?.(s.x, s.z, s.y + 0.5, 1.1, 2.3) ?? s.y;
        body.pos.set(s.x, Number.isNaN(g) ? s.y : g, s.z);
        openAt(s, false);
        if (!keepView) frameNow(ctx.world, FRAME.menu);
        else {
          const rc = p.get('rcam')!.split(',').map(Number);
          cam.yaw = body.yaw + ((rc[0] ?? 0) * Math.PI) / 180;
        }
        const buy = p.get('shopbuy');
        const i = buy ? s.items.findIndex((it) => it.id === buy) : -1;
        if (buy && i < 0) console.warn(`[map] shop "${s.id}" sells no "${buy}" (${s.items.map((it) => it.id).join(', ')})`);
        if (i >= 0) pick(i);
        const fo = Number(p.get('shopfocus'));
        if (p.has('shopfocus') && Number.isFinite(fo)) menu?.focus(fo);
      }
      const b = p.get('bought');
      const got = b ? find(b) : null;
      if (b && !got) console.warn(`[map] bought: no shop sells "${b}"`);
      if (got) {
        startMeal(keptOf(got.shop, got.item));
        if (!keepView) frameNow(ctx.world, meal?.sitting ? FRAME.sit : meal ? FRAME.eat : FRAME.menu);
      }
    },
    report() {
      const out: Record<string, string> = { purse: String(purse.riel) };
      if (purse.kept.length) out.kept = purse.kept.map((k) => `${k.shop}:${k.id}`).join(',');
      if (menu?.open && shop) {
        out.shop = shop.id;
        if (paid) out.shopbuy = paid.item.id;
      }
      if (meal) {
        out.bought = `${meal.what.shop}:${meal.what.id}`;
        out.sim = `_:${Math.max(0.3, meal.t).toFixed(1)}`;
      }
      return out;
    },
  };
}
