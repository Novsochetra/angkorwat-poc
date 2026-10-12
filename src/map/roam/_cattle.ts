import '../audio/_cattle';
import '../audio/_sell';
import { SFX } from '../audio/addonSfx';
import { BUILT } from '../build/pieces';
import { COW_RIDE } from '../cattle/ride';
import { STAKES, TRADER, TRADER_AT, TRADER_BUY, TRADER_FRONT, TRADER_STOOL, traderCue, traderOpen, traderToWorld } from '../cattle/plan';
import { ageOf, CATTLE, condOf, HERD_MAX, hungry, PRICE, STRAW_MAX, THIN, type CattleEvent, type Cow } from '../cattle/state';
import { HOME_AT } from '../hamlet/_homePlan';
import { pad } from '../pad/pad';
import { progress } from '../progress';
import { TIME } from '../time';
import type { MapFrame, RoamMode } from '../types';
import { lang, num, t, type WordKey } from '../ui/lang';
import { addonBusy, registerAddon, type AddonEnv } from './_addons';
import { createCattleCard, type CattleCard, type CattleRow, type CattleTab } from './_cattleCard';
import { CattleHerd, type Beast } from './_cattleHerd';
import { HungerIcons } from './_cattleIcon';
import { buildTraderPlace, installTraderWalk } from './_cattlePlace';
import { CattleWork } from './_cattleWork';
import { bagNotify } from './_shopBag';
import { riel } from './_shopPurse';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * His own cattle (add-on `cattle`; the guide: docs/map-work/addons.md "His own
 * cattle"). The player's wish (October 2026): "when we have a lot of money … buy
 * some cow, feed it and sell it".
 *
 * - **The cattle trader** (ឈ្មួញគោ) on the Kulen foot meadow north of the
 *   sugar-palm village, by the trail, 50 m past his house (cattle/plan.ts; his
 *   place _cattlePlace.ts, him people/_sceneCattle.ts): by day (`TRADER_HOURS`) on
 *   his stool under his tamarind, a calf and a young cow for sale tied to his
 *   posts, his own plough ox beside them. Before his stool, **E "ទិញ ឬលក់គោ / Buy
 *   or sell cattle"**: he turns to him, the camera comes round, the card opens
 *   (_cattleCard.ts): **Buy** a calf (80 000 ៛) or a young cow (150 000 ៛; at
 *   most four of his own), **Sell** his cows (by weight, age and how well fed:
 *   cattle/state.ts `value`; a calf raised well sells grown for ≈ 250 000 ៛),
 *   **Straw** bundles (ចំបើង, 1 000 ៛ each: one feeds a cow for a day). The
 *   animal he buys is untied and walks to its stake by his house; the first time
 *   the trader gives him a sickle too.
 * - **His cows** (_cattleHerd.ts): tethered by day on the meadow north of his
 *   house, into his pen at dusk if he built one (build/pieces.ts `BUILT`), else
 *   lying by their stakes. Each wants food once a game day: a hungry one shows a
 *   straw bundle over its head (_cattleIcon.ts) and lows more often. **E by a
 *   hungry cow's head** "ឲ្យកូនគោស៊ីចំបើង / Feed the calf straw" (a bundle from his
 *   stock), or with grass he cut "… grass". **Cutting grass**: on the meadow near
 *   home while a cow is hungry, **hold E** (_cattleWork.ts). They grow by fed
 *   days (calf → young → grown, cattle/state.ts), get thin unfed (never die), and
 *   a grown one can be ridden (the cow ride: cattle/ride.ts `COW_RIDE`).
 * - **Toasts**: hungry (near home; once when away), thin, grown.
 *
 * Saved: cattle/state.ts (`cattle.herd`, `cattle.straw`, `cattle.clock`), the
 * sickle (`cattle.sickle`). URL (shots and the dev server): `cattle=`,
 * `cattlehungry=1`, `cattlestraw=<n>`, `cattleclock=<d>`, `cattleshop=1|buy|sell|straw`
 * (`cattlebuy=calf|young`, `cattlesellrow=<i>`, `cattlestrawrow=<i>`, `cattlefocus=<i>`),
 * `cattlefeed=<t>` (`cattlefood=straw|grass`), `cattlecut=<t>`, `cattlecarry=1`,
 * `cattleeat=<0‥1>`, `cattlenight=1`, `cattlepen=<x>/<z>/<yaw>` (a pen stands there:
 * until `build=` makes one), `cattlespeed=<x>` (the dev server: days x times faster).
 * `window.__cattle` (shots, the dev server).
 */

let env: AddonEnv | null = null;
let herd: CattleHerd | null = null;
let work: CattleWork | null = null;
let icons: HungerIcons | null = null;
let card: CattleCard | null = null;
let lastCtx: RoamCtx | null = null;
let lastFrame: MapFrame | null = null;
let mode: RoamMode = 'overview';
/** The herd's clock: the map's days last frame, and the jumps meant (sleep). */
let lastDays = Number.NaN;
let lastSkipped = Number.NaN;
let speed = 1;

/** Where he stands to buy (map m), the way he faces the trader. */
const [BUY_X, BUY_Z] = traderToWorld(TRADER_BUY.x, TRADER_BUY.z);
const [STOOL_X, STOOL_Z] = traderToWorld(TRADER_STOOL.x, TRADER_STOOL.z);
const FACING = Math.atan2(STOOL_X - BUY_X, STOOL_Z - BUY_Z);

const clockNow = (): number => lastFrame?.clock ?? TIME.moment(TIME.days()).clock;

// ── Words (made once a language and value) ───────────────────────────────────

let wordsLang = '';
const said = new Map<string, string>();
function words(key: string, make: () => string): string {
  if (lang() !== wordsLang) {
    wordsLang = lang();
    said.clear();
  }
  let s = said.get(key);
  if (s === undefined) said.set(key, (s = make()));
  return s;
}
const COW_WORD = { calf: 'cattleCowCalf', young: 'cattleCowYoung', grown: 'cattleCowGrown' } as const;
/** A cow in a sentence ("Your calf…", "the young cow"), lower case in English. */
const cowWord = (c: Cow): string => t(COW_WORD[ageOf(c)]);

// ── The toasts ───────────────────────────────────────────────────────────────

const queue: string[] = [];
let toastWait = 0;
let gathering = -1;
let clock = 0;
const hungryNow: Cow[] = [];
let hungrySaid = -1e9;
let awaySaid = false;
const HUNGRY_EVERY = 90;
const NEAR_HOME = 70;

function say(text: string): void {
  if (mode === 'overview' || !text) return;
  if (queue.length && queue[queue.length - 1] === text) return;
  queue.push(text);
}

/** His feet's distance from home (the house, the stakes), or Infinity on the map. */
function fromHome(): number {
  if (!env || mode === 'overview') return Infinity;
  const p = env.body.pos;
  let d = Math.hypot(p.x - HOME_AT.x, p.z - HOME_AT.z);
  for (const s of STAKES) d = Math.min(d, Math.hypot(p.x - s[0], p.z - s[1]));
  return d;
}

function onEvent(e: CattleEvent): void {
  if (!env) return;
  if (e.type === 'bought' || e.type === 'sold') return;
  if (e.type === 'straw' || e.type === 'fed') {
    card?.refill();
    return;
  }
  const c = e.cow;
  if (e.type === 'hungry') {
    if (hungryNow.length < 8 && !hungryNow.includes(c)) hungryNow.push(c);
    if (gathering < 0) gathering = clock;
    card?.refill();
    return;
  }
  if (mode === 'overview') return;
  if (e.type === 'young') say(t('cattleGrewYoung'));
  else if (e.type === 'grown') say(t('cattleGrewGrown'));
  else if (e.type === 'thin') say(t('cattleThin1', { cow: cowWord(c) }));
  card?.refill();
}

function sayHungry(): void {
  const list = hungryNow.filter((c) => CATTLE.herd.includes(c) && hungry(c));
  hungryNow.length = 0;
  if (!list.length || mode === 'overview') return;
  if (fromHome() < NEAR_HOME) {
    awaySaid = false;
    if (clock - hungrySaid < HUNGRY_EVERY) return;
    hungrySaid = clock;
    say(list.length === 1 ? t('cattleHungry1', { cow: cowWord(list[0]) }) : t('cattleHungryN', { n: num(list.length) }));
  } else if (!awaySaid) {
    awaySaid = true;
    say(t('cattleHungryAway'));
  }
}

function toastFrame(dt: number, hold: boolean): void {
  clock += dt;
  if (!env) return;
  const home = fromHome();
  if (home < NEAR_HOME && awaySaid) {
    awaySaid = false;
    // (home again, a cow still hungry: said once more, not too soon)
    if (CATTLE.hungryCount() && clock - hungrySaid >= HUNGRY_EVERY) for (const c of CATTLE.herd) if (hungry(c) && hungryNow.length < 8) hungryNow.push(c);
    if (hungryNow.length && gathering < 0) gathering = clock;
  }
  if (gathering >= 0 && clock - gathering >= 1.2 && !hold && mode !== 'overview') {
    gathering = -1;
    sayHungry();
  }
  toastWait -= dt;
  if (toastWait > 0 || hold || !queue.length || mode === 'overview') return;
  env.hud.toast(queue.shift()!);
  toastWait = 3.1;
}

// ── The trader's card ────────────────────────────────────────────────────────

interface Visit {
  t: number;
  turn: { from: number; by: number; t: number; len: number } | null;
  /** A purchase or sale under way (s), nothing more taken meanwhile. */
  busy: number;
}
let visit: Visit | null = null;
let before: { pitch: number; distance: number } | null = null;
let framed = 0;
let keepView = false;
let viewSide = -1.1;

/** What his place says to him where he stands: at his stool, open and he there, buy; before it, he is coming; out of hours, closed. */
type Said = 'buy' | 'coming' | 'closed';
function traderSays(x: number, y: number, z: number, floor: number): Said | null {
  if (Math.abs(y - floor) > 2.5) return null;
  const c = Math.cos(TRADER_AT.yaw);
  const s = Math.sin(TRADER_AT.yaw);
  const dx = x - TRADER_AT.x;
  const dz = z - TRADER_AT.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const F = TRADER_FRONT;
  const front = lx > F.x0 && lx < F.x1 && lz > F.z0 && lz < F.z1;
  const at = Math.hypot(x - BUY_X, z - BUY_Z) <= TRADER_BUY.r;
  if (!front && !at) return null;
  if (!traderOpen(clockNow())) return 'closed';
  if (TRADER.ready && !TRADER.atStool) return 'coming';
  return at ? 'buy' : null;
}

function theCard(e: AddonEnv): CattleCard {
  return (card ??= createCattleCard({
    layer: e.layer,
    onTake: take,
    onTab: (tab) => card?.say(tabWords(tab)),
    onClose: () => closeVisit(),
    sound: (s) => e.uiSound(s),
  }));
}

const tabWords = (tab: CattleTab): WordKey => (tab === 'buy' ? 'cattleHi' : tab === 'straw' ? 'cattleStrawHi' : CATTLE.herd.length ? 'cattleSellHi' : 'cattleSellNone');

function openVisit(ctx: RoamCtx, tab: CattleTab, turnNow: boolean): void {
  const e = env;
  if (!e) return;
  const by = angleDiff(FACING, ctx.body.yaw);
  visit = { t: 0, turn: turnNow ? { from: ctx.body.yaw, by, t: 0, len: 0.45 * (0.45 + (0.55 * Math.abs(by)) / Math.PI) } : null, busy: 0 };
  if (!turnNow) ctx.body.yaw = FACING;
  ctx.body.vel.set(0, 0, 0);
  theCard(e).show(tab, e.purse.riel);
  card?.say(tabWords(tab));
  TRADER.visit = true;
  traderCue('hi');
  framed = 0;
  viewSide = clearSide(ctx);
  ctx.hud.prompt(null);
}

function closeVisit(): void {
  if (!visit) return;
  visit = null;
  TRADER.visit = false;
  card?.close();
}

/** A row of the card taken: buy a calf or a young cow, sell one of his, buy straw. */
function take(row: CattleRow): void {
  const e = env;
  const v = visit;
  const h = herd;
  if (!e || !v || !h || v.busy > 0) return;
  if (row.kind === 'calf' || row.kind === 'young') {
    if (!CATTLE.room) {
      card?.say('cattleFullSay', { n: num(HERD_MAX) });
      return;
    }
    const price = row.kind === 'calf' ? PRICE.calf : PRICE.young;
    if (!e.purse.pay(price)) {
      card?.short(row.kind === 'calf' ? 0 : 1);
      card?.say('cattleShortSay');
      traderCue('short');
      return;
    }
    const cow = CATTLE.buy(row.kind, h.lookFor(row.kind));
    if (!cow) return;
    h.handOver(cow, row.kind);
    lastCtx?.sound('coin', 1);
    pad.rumble('tick');
    bagNotify.update('purse');
    card?.purse(e.purse.riel, false);
    card?.say('cattleBoughtSay');
    traderCue('bought');
    v.busy = 0.6;
    e.hud.toast(t('cattleBought', { cow: t(row.kind === 'calf' ? 'cattleCowCalf' : 'cattleCowYoung') }));
    if (!progress.get('cattle.sickle', false)) {
      progress.set('cattle.sickle', true);
      say(t('cattleSickle'));
    }
    card?.refill();
    return;
  }
  if (row.kind === 'cow') {
    const c = row.cow;
    if (!CATTLE.herd.includes(c)) return;
    // (one he rides now is not sold from under him)
    const b = h.of(c);
    if (b?.ride?.ridden) return;
    const word = cowWord(c);
    const got = CATTLE.sell(c);
    if (!got) return;
    h.sold(c);
    e.purse.earn(got);
    SFX.play('sellCoin', 0.9);
    pad.rumble('tick');
    bagNotify.update('purse');
    card?.purse(e.purse.riel, true);
    card?.say('cattleSoldSay');
    traderCue('sold');
    v.busy = 0.6;
    e.hud.toast(t('cattleSold', { cow: word, riel: riel(got) }));
    progress.set('cattle.sold', progress.get('cattle.sold', 0) + 1);
    progress.set('cattle.earned', progress.get('cattle.earned', 0) + got);
    card?.refill();
    return;
  }
  // Straw.
  const n = Math.min(row.n, STRAW_MAX - CATTLE.straw);
  if (n <= 0) {
    card?.say('cattleStrawHi');
    return;
  }
  const i = row.n === 1 ? 0 : row.n === 5 ? 1 : 2;
  if (!e.purse.pay(PRICE.straw * n)) {
    card?.short(i);
    card?.say('cattleShortSay');
    traderCue('short');
    return;
  }
  CATTLE.addStraw(n);
  lastCtx?.sound('coin', 0.8);
  SFX.play('cattleBundle', 0.6);
  bagNotify.update('purse');
  card?.purse(e.purse.riel, false);
  card?.say('cattleStrawSay');
  traderCue('straw');
  v.busy = 0.4;
  e.hud.toast(t('cattleStrawGot', { n: num(n), have: num(CATTLE.straw) }));
  card?.refill();
}

/** The camera's side at his stool: behind his left shoulder if nothing stands in the way of him and the trader, else the other. */
function clearSide(ctx: RoamCtx): number {
  const w = ctx.world;
  const hard = w.hardClearance ?? w.clearance;
  const b = ctx.body;
  const cy = b.pos.y + 1.6;
  for (const side of SIDES) {
    const a = FACING + side;
    const d = 7.5;
    const px = b.pos.x - Math.sin(a) * d;
    const pz = b.pos.z - Math.cos(a) * d;
    const py = cy + 2.2;
    if ((hard?.(b.pos.x, cy, b.pos.z, px, py, pz) ?? 1) < 0.98) continue;
    if ((hard?.(STOOL_X, cy - 0.4, STOOL_Z, px, py, pz) ?? 1) < 0.98) continue;
    return side;
  }
  return -0.35;
}
const SIDES = [-1.1, 1.1, -0.75, 0.75, -1.4, 1.4];

/** While at his stool: the camera eases round to its side, then it is the player's; after, back to his pitch and distance. */
function frameCam(ctx: RoamCtx, dt: number): void {
  const cam = ctx.cam;
  if (visit && !keepView) {
    before ??= { pitch: cam.pitch, distance: cam.distance };
    const yaw = (visit.turn ? visit.turn.from + visit.turn.by : ctx.body.yaw) + viewSide;
    cam.behindYaw = yaw;
    framed += dt;
    if (framed > 2.6) return;
    const k = 1 - Math.exp(-2.2 * dt);
    cam.yaw += angleDiff(yaw, cam.yaw) * k;
    cam.pitch += (0.24 - cam.pitch) * k;
    cam.distance += (7.6 - cam.distance) * k;
    return;
  }
  if (!before) return;
  const k = 1 - Math.exp(-2.4 * dt);
  cam.pitch += (before.pitch - cam.pitch) * k;
  cam.distance += (before.distance - cam.distance) * k;
  if (Math.abs(before.pitch - cam.pitch) < 0.005 && Math.abs(before.distance - cam.distance) < 0.05) before = null;
}

function frameNow(ctx: RoamCtx): void {
  const { cam, body } = ctx;
  before ??= { pitch: cam.pitch, distance: cam.distance };
  framed = 2.6;
  cam.focus.set(body.pos.x, body.pos.y + 1.6, body.pos.z);
  cam.yaw = FACING + viewSide;
  cam.behindYaw = cam.yaw;
  cam.pitch = 0.24;
  cam.distance = 7.6;
}

/** The picture slides so he stands in the middle of what the card leaves free (as the nursery's). */
let shiftX = 0;
let shiftY = 0;
let shifted = false;
function lens(f: MapFrame): void {
  const el = card?.open ? card.el : null;
  let wx = 0;
  let wy = 0;
  if (el && f.roam !== 'overview' && !keepView) {
    const W = innerWidth;
    const H = innerHeight;
    if (el.offsetWidth > W * 0.7) wy = Math.min(0.3, Math.max(0, 0.5 - el.offsetTop / 2 / H));
    else wx = Math.min(0.3, Math.max(0, 0.5 - el.offsetLeft / 2 / W));
  }
  const k = env?.shot || f.dt <= 0 ? 1 : 1 - Math.exp(-4 * f.dt);
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

// ── Feeding, cutting: what E does by his cows ────────────────────────────────

const _nose = { x: 0, y: 0, z: 0 };

/** The hungry cow of his whose head he is at (in front of him, near its nose), or null. */
function cowAt(ctx: RoamCtx, any: boolean): Beast | null {
  if (!herd) return null;
  const p = ctx.body.pos;
  const fx = Math.sin(ctx.body.yaw);
  const fz = Math.cos(ctx.body.yaw);
  let best: Beast | null = null;
  let score = Infinity;
  for (const b of herd.beasts) {
    if (!b.cow || b.leaving || b.ride?.ridden || b.food || !b.at) continue;
    if (!any && !hungry(b.cow)) continue;
    if (Math.abs(b.y - p.y) > 1.6) continue;
    herd.nose(b, _nose);
    const dn = Math.hypot(_nose.x - p.x, _nose.z - p.z);
    const db = Math.hypot(b.x - p.x, b.z - p.z);
    const dx = b.x - p.x;
    const dz = b.z - p.z;
    const facing = db > 0.01 ? (dx * fx + dz * fz) / db : 1;
    // (at its head: near its nose; or by its body, turned to it)
    const near = dn < 1.9 + 0.3 * b.size || (db < 1.0 + 1.4 * b.size && facing > 0.35);
    if (!near) continue;
    const s = Math.min(dn, db) - facing * 0.5;
    if (s < score) {
      score = s;
      best = b;
    }
  }
  return best;
}

/** Where he may cut grass now: a cow of his hungry, nothing in his arms, on the meadow. */
function mayCut(ctx: RoamCtx): boolean {
  if (!herd || !work || work.carrying || work.active) return false;
  if (!CATTLE.hungryCount() && !env?.params.has('cattlecut')) return false;
  const p = ctx.body.pos;
  return CattleWork.canCut(ctx.world, p.x, p.y, p.z, (x, z, r) => plantNearHome(x, z, r));
}
const plantNearHome = (x: number, z: number, r: number): boolean => herd?.plantNear(x, z, r) ?? false;

type Choice = 'trader' | 'coming' | 'closed' | 'feedStraw' | 'feedGrass' | 'noStraw' | 'full' | null;
const choice = { kind: null as Choice, beast: null as Beast | null, prompt: null as string | null, step: -1 };
let stepN = 0;

function choose(ctx: RoamCtx): void {
  if (choice.step === stepN) return;
  choice.step = stepN;
  choice.kind = null;
  choice.beast = null;
  choice.prompt = null;
  const p = ctx.body.pos;
  const ts = traderSays(p.x, p.y, p.z, ctx.world.field.heightAt(BUY_X, BUY_Z));
  if (ts) {
    choice.kind = ts === 'buy' ? 'trader' : ts;
    choice.prompt = ts === 'buy' ? words('buy', () => `E  ${t('cattlePrompt')}`) : words(ts, () => t(ts === 'closed' ? 'cattleClosed' : 'cattleComing'));
    return;
  }
  if (!work || !CATTLE.herd.length) return;
  const b = cowAt(ctx, work.carrying);
  if (!b || !b.cow) return;
  const c = b.cow;
  const cw = cowWord(c);
  choice.beast = b;
  if (!hungry(c)) {
    choice.kind = 'full';
    choice.prompt = null;
    return;
  }
  if (work.carrying) {
    choice.kind = 'feedGrass';
    choice.prompt = words(`grass|${ageOf(c)}`, () => `E  ${t('cattleFeedGrass', { cow: cw })}`);
  } else if (CATTLE.straw > 0) {
    choice.kind = 'feedStraw';
    const n = CATTLE.straw;
    choice.prompt = words(`straw|${ageOf(c)}|${n}`, () => `E  ${t('cattleFeedStraw', { cow: cw })}  ·  ${t('cattleLeft', { n: num(n) })}`);
  } else {
    choice.kind = 'noStraw';
    choice.prompt = words(`nostraw|${ageOf(c)}`, () => t('cattleNoStraw', { cow: cw }));
  }
}

// ── The add-on ───────────────────────────────────────────────────────────────

registerAddon({
  id: 'cattle',
  order: 26,
  get holding() {
    return visit !== null || !!work?.active;
  },
  get handsBusy() {
    return visit !== null || !!work?.active || !!work?.carrying;
  },
  init(e) {
    env = e;
    herd = new CattleHerd(e.world, e.scene);
    herd.still = e.shot;
    const place = buildTraderPlace(e.world.field);
    e.scene.add(place.object);
    installTraderWalk(e.world);
    icons = new HungerIcons(e.shot, e.params);
    e.scene.add(icons.mesh);
    work = new CattleWork(e, herd);
    work.wire();
    // (a shot's or a check's herd, before the first frame; never on the live site, where a link would replace the
    // player's own saved herd)
    if (e.shot || import.meta.env.DEV) {
      CATTLE.fromUrl(e.params);
      const pen = e.params.get('cattlepen');
      if (pen && !BUILT.list.some((b) => b.id === 'pen')) {
        const [x, z, yaw] = pen.split('/').map(Number);
        if (Number.isFinite(x) && Number.isFinite(z)) {
          BUILT.list.push({ uid: 'pen-check', id: 'pen', x, y: e.world.field.heightAt(x, z), z, yaw: Number.isFinite(yaw) ? (yaw * Math.PI) / 180 : 0, done: 1, seed: 1 });
          BUILT.version++;
        }
      }
      const sp = Number(e.params.get('cattlespeed'));
      if (Number.isFinite(sp) && sp > 0) speed = sp;
    }
    herd.sync(CATTLE.herd, true);
    CATTLE.on(onEvent);
    if (e.shot || import.meta.env.DEV)
      Object.assign(window, {
        __cattle: {
          state: () => ({
            clock: +CATTLE.clock.toFixed(3),
            straw: CATTLE.straw,
            riel: e.purse.riel,
            herd: CATTLE.herd.map((c) => ({ id: c.id, age: ageOf(c), grow: +c.grow.toFixed(3), weight: +c.weight.toFixed(1), cond: +condOf(c).toFixed(3), hungry: hungry(c), fed: +c.fed.toFixed(3), stake: c.stake, look: c.look })),
            beasts: herd?.debug() ?? [],
            card: card?.open ? card.tab : null,
            choice: { kind: choice.kind, prompt: choice.prompt },
            work: work?.state() ?? null,
            icons: icons?.shown ?? 0,
            trader: { ...TRADER },
            rides: COW_RIDE.cows.map((r) => ({ id: r.id, owner: r.owner, canRide: r.canRide, ridden: r.ridden, x: +r.x.toFixed(2), z: +r.z.toFixed(2), scale: +r.scale.toFixed(2), lying: r.lying })),
            stats: herd?.stats,
            clump: herd ? { ...herd.clump } : null,
            blocks: herd?.blocks.used ?? 0,
          }),
          advance: (days: number) => CATTLE.advance(days),
          /** Where he is, and each cow of his: its nose, how far, hungry, what E would do. */
          near: () => {
            const ctx = lastCtx;
            if (!ctx || !herd) return null;
            const p = ctx.body.pos;
            return {
              at: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +ctx.body.yaw.toFixed(2)],
              cows: herd.beasts
                .filter((b) => b.cow)
                .map((b) => {
                  herd!.nose(b, _nose);
                  return { id: b.cow!.id, nose: [+_nose.x.toFixed(2), +_nose.z.toFixed(2)], dn: +Math.hypot(_nose.x - p.x, _nose.z - p.z).toFixed(2), db: +Math.hypot(b.x - p.x, b.z - p.z).toFixed(2), hungry: hungry(b.cow!), at: b.at, food: b.food, dy: +(b.y - p.y).toFixed(2) };
                }),
              choice: { kind: choice.kind, prompt: choice.prompt },
              busy: env?.busy() ?? null,
            };
          },
          straw: (n: number) => CATTLE.addStraw(n),
          carry: (on: boolean) => {
            if (work) work.carrying = on;
          },
          speed: (x: number) => (speed = x),
          ride: (id: string, on: boolean) => {
            const r = COW_RIDE.cows.find((c) => c.id === id);
            if (!r) return false;
            r.ridden = on;
            COW_RIDE.ridden = on ? r : null;
            return true;
          },
        },
      });
  },
  input(ctx, m) {
    lastCtx = ctx;
    stepN++;
    if (!visit) return false;
    const i = ctx.input;
    if (m !== 'walk') {
      closeVisit();
      return false;
    }
    if (Math.hypot(i.move.x, i.move.y) > 0.3) {
      closeVisit();
      return false;
    }
    if (i.exit) closeVisit();
    else if (i.use) card?.confirm();
    i.exit = i.use = false;
    return true;
  },
  offer(ctx, m) {
    lastCtx = ctx;
    if (m !== 'walk' || !env || env.busy() || visit || work?.active) return null;
    choose(ctx);
    return choice.prompt;
  },
  use(ctx, m) {
    if (m !== 'walk' || !env || !work) return;
    choose(ctx);
    switch (choice.kind) {
      case 'trader':
        openVisit(ctx, 'buy', true);
        break;
      case 'closed':
      case 'coming':
        ctx.hud.toast(t(choice.kind === 'closed' ? 'cattleClosed' : 'cattleComing'));
        break;
      case 'feedStraw':
        if (choice.beast) work.startFeed(ctx, choice.beast, 'straw');
        break;
      case 'feedGrass':
        if (choice.beast) work.startFeed(ctx, choice.beast, 'grass');
        break;
      default:
        break;
    }
  },
  hold(ctx, dt) {
    lastCtx = ctx;
    const { body, cam } = ctx;
    if (visit) {
      body.vel.set(0, 0, 0);
      body.grounded = true;
      body.explorer.setMotion(0, true, 0);
      cam.focus.set(body.pos.x, body.pos.y + 1.6, body.pos.z);
      cam.fov = 50;
      visit.t += dt;
      visit.busy = Math.max(0, visit.busy - dt);
      if (visit.turn) {
        const tr = visit.turn;
        tr.t += dt;
        const k = Math.min(1, tr.t / tr.len);
        body.yaw = tr.from + tr.by * k * k * (3 - 2 * k);
        if (k >= 1) visit.turn = null;
      }
      frameCam(ctx, dt);
      // (his hours over meanwhile: the card shuts)
      if (!traderOpen(clockNow())) closeVisit();
      return { prompt: null };
    }
    return work?.hold(ctx, dt) ?? { prompt: null };
  },
  keys() {
    return work?.keyHelp() ?? null;
  },
  after(ctx, m, dt) {
    lastCtx = ctx;
    TRADER.wanted = m === 'walk' && (visit !== null || choice.kind === 'coming');
    if (!visit && before && m === 'walk') frameCam(ctx, dt);
    // (something else has him now — a ride, the hammock, sitting or lying down, praying — or another mode: the grass is
    // put down; not his camera, not his own work)
    if (work?.carrying && !work.active && !visit && (m !== 'walk' || addonBusy() || ctx.body.explorer.animator.posture !== null)) {
      work.stop(true);
      if (m !== 'overview') say(t('cattleDrop'));
    }
    if (m !== 'overview' && herd) {
      const p = ctx.body.pos;
      const f = lastFrame;
      const c = f?.camera.matrixWorld.elements;
      herd.tick(dt, clockNow(), p.x, p.y, p.z, true, c ? c[12] : p.x, c ? c[14] : p.z);
    }
  },
  frame(f, m) {
    lastFrame = f;
    mode = m;
    if (!herd || !env) return;
    const dt = f.dt > 0 ? f.dt : 0;
    // The herd's clock: the map's days as they run (sleep moves them on), else a day each `dayLength` s of play.
    const days = TIME.days();
    const played = dt / TIME.dayLength;
    const sk = TIME.skipped();
    const jumped = Number.isNaN(lastSkipped) ? 0 : Math.max(0, sk - lastSkipped);
    let d = 0;
    if (TIME.cycling()) d = Number.isNaN(lastDays) ? 0 : Math.min(days - lastDays, played * 1.5 + jumped);
    else d = played;
    lastSkipped = sk;
    lastDays = days;
    if (!env.shot && d > 0) CATTLE.advance(Math.min(d * speed, 6));
    CATTLE.tick(dt);
    // (the map seen from above: the herd steps on the map's frames; roaming, on roaming's steps: `after`)
    const e = f.camera.matrixWorld.elements;
    if (m === 'overview') herd.tick(dt, f.clock, e[12], e[13], e[14], false, e[12], e[14]);
    herd.draw(f.camera, f.dt > 0 ? f.calls : null, f.listener.x, f.listener.z);
    // Their voices: lowing (a calf higher), the mouthfuls.
    const s = herd.sounds;
    if (s.moo > 0) SFX.play('cattleMoo', s.moo);
    if (s.calf > 0) SFX.play('cattleMooCalf', s.calf);
    if (s.munch > 0) SFX.play('cattleMunch', s.munch);
    s.moo = s.calf = s.munch = 0;
    // The hungry ones' straw bundle over their heads.
    if (icons) {
      for (const b of herd.beasts) {
        if (!b.cow) continue;
        const show = hungry(b.cow) && !b.food && !b.leaving && !b.ride?.ridden && m !== 'overview';
        const fx = Math.sin(b.yaw);
        const fz = Math.cos(b.yaw);
        icons.set(b.cow.id, show, condOf(b.cow) < THIN, b.x + fx * 1.15 * b.size, b.y + (1.95 - 0.5 * b.rest) * b.size + 0.25, b.z + fz * 1.15 * b.size);
      }
      icons.frame(dt, f.camera, BURST, f.night);
    }
    work?.frame(dt, m);
    lens(f);
    toastFrame(dt, m !== 'overview' && addonBusy() && !visit && !work?.active);
  },
  setMode(next) {
    mode = next;
    closeVisit();
    work?.stop(next !== 'walk');
    if (next === 'overview') {
      before = null;
      queue.length = 0;
      herd?.reset(clockNow());
      TRADER.wanted = false;
    }
  },
  fromUrl(q, ctx) {
    lastCtx = ctx;
    if (!herd || !work || !env) return;
    keepView = q.has('rcam');
    work.keepView = keepView;
    const clockQ = Number(q.get('clock'));
    const clk = q.has('clock') && Number.isFinite(clockQ) ? ((clockQ % 1) + 1) % 1 : clockNow();
    herd.settle(q.get('cattlenight') === '1' ? 0.45 : clk);
    // His cows eating from heaps (`cattleeat=<left 0‥1>`).
    const eat = q.get('cattleeat');
    if (eat !== null) for (const b of herd.beasts) if (b.cow) herd.feed(b, b.cow.id % 2 ? 'grass' : 'straw', Math.max(0.05, Math.min(1, Number(eat) || 1)));
    if (q.get('cattlecarry') === '1') work.carrying = true;
    const feed = q.get('cattlefeed');
    if (feed !== null) {
      const p = ctx.body.pos;
      let best: Beast | null = null;
      let bd = Infinity;
      for (const b of herd.beasts)
        if (b.cow && Math.hypot(b.x - p.x, b.z - p.z) < bd) {
          bd = Math.hypot(b.x - p.x, b.z - p.z);
          best = b;
        }
      if (best?.cow) {
        best.cow.fed = Math.min(best.cow.fed, CATTLE.clock - 1.2);
        const what = q.get('cattlefood') === 'grass' ? 'grass' : 'straw';
        if (what === 'grass') work.carrying = true;
        // (the shot's camera, as `rcam=` had it, turned with him as he turns to the cow)
        const was = ctx.body.yaw;
        work.freezeFeed(ctx, best, what, Math.max(0, Number(feed) || 0));
        ctx.cam.yaw += angleDiff(ctx.body.yaw, was);
        ctx.cam.behindYaw = ctx.cam.yaw;
        const y = ctx.world.field.heightAt(ctx.body.pos.x, ctx.body.pos.z);
        ctx.body.pos.y = y;
      }
    }
    const cut = q.get('cattlecut');
    if (cut !== null && Number(cut) > 0) work.freezeCut(ctx, Number(cut));
    const shop = q.get('cattleshop');
    if (shop) {
      const g = ctx.world.standAt?.(BUY_X, BUY_Z, ctx.world.field.heightAt(BUY_X, BUY_Z) + 0.5, 1.1, 2.3) ?? ctx.world.field.heightAt(BUY_X, BUY_Z);
      ctx.body.pos.set(BUY_X, Number.isNaN(g) ? ctx.world.field.heightAt(BUY_X, BUY_Z) : g, BUY_Z);
      ctx.body.yaw = FACING;
      if (!traderOpen(clk)) {
        ctx.hud.prompt(t('cattleClosed'));
        console.info(`[map] cattle: the trader is away at clock ${clk.toFixed(2)}`);
        return;
      }
      keepView = false;
      openVisit(ctx, shop === 'sell' ? 'sell' : shop === 'straw' ? 'straw' : 'buy', false);
      frameNow(ctx);
      const buy = q.get('cattlebuy');
      if (buy === 'calf' || buy === 'young') take({ kind: buy });
      const sr = Number(q.get('cattlesellrow'));
      if (q.has('cattlesellrow') && CATTLE.herd[sr]) take({ kind: 'cow', cow: CATTLE.herd[sr] });
      const st = Number(q.get('cattlestrawrow'));
      if (q.has('cattlestrawrow') && [1, 5, 10][st]) take({ kind: 'straw', n: [1, 5, 10][st] });
      const fo = Number(q.get('cattlefocus'));
      if (q.has('cattlefocus') && Number.isFinite(fo)) card?.focus(fo);
      console.info(`[map] cattle: at the trader (${BUY_X.toFixed(1)}, ${BUY_Z.toFixed(1)}), ${env.purse.riel} riel, ${CATTLE.herd.length} cows`);
    }
  },
  report() {
    const out: Record<string, string> = {};
    const h = CATTLE.report();
    if (h) out.cattle = h;
    if (CATTLE.straw) out.cattlestraw = String(CATTLE.straw);
    if (CATTLE.herd.length) out.cattleclock = CATTLE.clock.toFixed(2);
    if (card?.open) out.cattleshop = card.tab;
    if (work?.carrying) out.cattlecarry = '1';
    const pen = BUILT.list.find((b) => b.id === 'pen' && b.uid === 'pen-check');
    if (pen) out.cattlepen = `${pen.x.toFixed(1)}/${pen.z.toFixed(1)}/${((pen.yaw * 180) / Math.PI).toFixed(0)}`;
    return Object.keys(out).length ? out : null;
  },
});

/** The late half of the E row: cutting grass on the meadow (hold E), only when nothing else here has a real E. */
registerAddon({
  id: 'cattleCut',
  order: 96,
  offer(ctx, m) {
    if (m !== 'walk' || !env || env.busy() || visit || work?.active) return null;
    if (!mayCut(ctx)) return null;
    return words('cut', () => `E  ${t('cattleCutHold')}`);
  },
  use(ctx, m) {
    if (m !== 'walk' || !work || !mayCut(ctx)) return;
    work.startCut(ctx);
  },
});

const BURST = new Float32Array(24);
