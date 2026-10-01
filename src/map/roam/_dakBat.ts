import { Group, Vector3 } from 'three';
import { buildPhtel, buildSpoon, dakBatPose, dakState, DAK_HAT, DAK_KNEEL, DAK_RISE, PHTEL_UP } from '../../character/dakBat';
import { PRAY } from '../../character/clips';
import { buildHand } from '../../character/parts/limbs';
import { JOINTS } from '../../character/skeleton';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { BODY_UNIT_M } from '../../world/scale';
import '../audio/_dakbat';
import { SFX } from '../audio/addonSfx';
import { registerEvent } from '../calendar';
import { nearby, type Nearby } from '../greet';
import { frontOf, inWindow, MK, stallById, stallPoint } from '../hamlet/_mkPlan';
import { progress } from '../progress';
import { registerShop, type Shop, type ShopItem } from '../shop';
import type { MapFrame, RoamMode } from '../types';
import { num, onLang, t } from '../ui/lang';
import { registerAddon, type AddonEnv } from './_addons';
import { ALMS_ON, ALMS_WHERE, DAK, DAK_HINT, DAK_NEAR, DAK_SIDE, DAK_STAND, inClock, type AlmsMonk } from './_dakBatHooks';
import { bagNotify, KEEPSAKES } from './_shopBag';
import { keptOf } from './_shopPurse';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * Dak bat (ដាក់បាត្រ): giving food to the monks on their morning alms round,
 * as Cambodians do. At dawn monks walk barefoot in a line with their alms
 * bowls (the sugar-palm village's three, people/_sceneAlms.ts; Angkor Wat's
 * five up the valley road, people/_monks.ts; the floating village's monk,
 * people/_sceneVillage.ts); families give by the road.
 *
 * - **The rice**: the morning market's flower and offerings stall (open at
 *   dawn, 0.69‥0.93 of the clock, as the market has it) sells "sticky rice
 *   for the monks" (a silver bowl of rice, ផ្តិល, with a spoon and a lotus
 *   bud: 3 000 ៛, shop `market-flowers`). It goes straight into his bag (a
 *   keepsake, roam/_shopBag.ts `KEEPSAKES`: never eaten; 6 eats the first
 *   thing that is food; its button in "In my bag" says what it is for).
 * - **Giving**: with it in his bag, when a line of monks comes near along
 *   his side of the way (within `DAK_NEAR` m, ahead of them, up to
 *   `DAK_SIDE` m off it), the walker offers "E  ដាក់បាត្រព្រះសង្ឃ" / "E  Offer
 *   food to the monks" (without it: where to buy it, no E). E: he turns to
 *   the monks' way, takes his hat off and kneels at the roadside (the
 *   prayer's kneel, character/dakBat.ts), the bowl of rice on his lap; the
 *   first monk not past him yet steps out of the line to stand before him
 *   (the others wait) and lifts the lid of his bowl; he rises on his knees
 *   and puts two spoonfuls of rice in (reaching over the bowl, never
 *   touching the monk), sits back, palms together at his face while the
 *   monks chant the blessing (audio/_dakbat.ts `dakChant`), bows once to the
 *   ground, gets up (hat on), and the monks walk on. "You offered food to
 *   the monks (n)" (`progress` `dak.count`). The camera comes round to the
 *   side, low, the monk and him in view, the line behind.
 * - **Leaving off**: E, Space or the stick while he waits gets him up (the
 *   rice stays in his bag); once the rice is in, it is given; back to the
 *   map (or another mode): everything stops at once, the hat back on.
 *
 * The monks' side is the people part's: `DAK` (roam/_dakBatHooks.ts).
 *
 * URL (checks): `dakbat=1` (with `clock=0.78` and `at=` by a line's way:
 * the sugar-palm village street, e.g. `at=381,-68.9`, the valley road
 * below Angkor Wat, e.g. `at=10,-88`, or the floating village's path below
 * the pagoda's stair, `at=-304.2,81`) the rice in his bag and the monks
 * coming up to him (≈ 7 m off; `dakbat=near`: the same without the rice,
 * for the hint); `dakbat=wait` kneeling for them;
 * `dakbat=give` the monk before him, the spoon over his bowl (`sim=_:<s>`
 * that far into the giving), `dakbat=bless` palms together in the blessing.
 */

const ID = 'dakbat';
/** The rice's item id (a keepsake in the bag), the stall's shop. */
const RICE_ID = 'dakRice';
const SHOP_ID = 'market-flowers';

/** Turning to the way (s), the kneel's speed (prayer time a second), on to the heels and the bowl out (s). */
const TURN = 0.45;
const KNEEL_RATE = 1.15;
const SETTLE = 0.6;
/** Up on his knees to reach (s); a spoonful (s: out, tipped, back), how many; back on the heels, the hands together (s). */
const RISE = 0.55;
const SPOONFUL = 1.75;
const SPOONFULS = 2;
const SIT = 0.75;
/** The blessing (s: the monks' chant, `dakChant`), the bow (s). */
const BLESS = 6.6;
const BOW = 1.5;
/** Leaving off part way: the hands back (s). */
const LEAVE = 0.55;
/**
 * No monk answers his asking within this (s): he gets up. Once a line has answered (a monk is coming, maybe after a
 * family's stop) it is the line's to say: only a safety beyond any stop and walk (s).
 */
const ANSWER = 5.5;
const WAIT_MAX = 90;
/** How far forward he leans to reach (radians). */
const LEAN = 0.16;
/**
 * The camera: from his side (`side` from the way he faces), a little above and near, the monk and him in view;
 * it eases there over `FOR` s, then the player may look round; back to where it was after.
 */
const FRAME = { side: Math.PI / 2 + 0.55, pitch: 0.3, distance: 5.8, rate: 1.8, back: 2.2, for: 3.2 };
/** The stick past this (or Space, E) leaves off. */
const STICK = 0.35;

// ── The stall, the rice ──────────────────────────────────────────────────────

const RICE_ITEM: ShopItem = {
  id: RICE_ID,
  name: { km: 'បាយដំណើបដាក់បាត្រ', en: 'Sticky rice for the monks' },
  price: 3000,
  // (the bag's picture: a bowl of rice with its spoon, a lotus bud on it)
  consume: 'riceBowl',
  colors: [0xe88aa8],
};
const FLOWERS = stallById('flowers');
/** The buyer's spot in front of the flower stall (as hamlet/_shops.ts places the market's: a little further out). */
function stallSpot(): { x: number; z: number; facing: number } {
  const f = frontOf(FLOWERS, 0);
  const [ox, oz] = stallPoint(FLOWERS, 0, FLOWERS.d / 2 + 1);
  const [fx, fz] = stallPoint(FLOWERS, 0, FLOWERS.d / 2);
  const k = 0.35 / Math.hypot(ox - fx, oz - fz);
  return { x: MK.x + f.x + (ox - fx) * k, z: MK.z + f.z + (oz - fz) * k, facing: f.yaw };
}
const MKOPEN = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('mkopen');
function registerStall(y: number): Shop {
  const p = stallSpot();
  const s: Shop = {
    id: SHOP_ID,
    name: { km: 'តូបផ្កា និងគ្រឿងបូជា', en: 'Flowers and offerings' },
    x: p.x,
    y,
    z: p.z,
    r: 2.1,
    facing: p.facing,
    items: [RICE_ITEM],
    open: (f: MapFrame) => MKOPEN === 'all' || (MKOPEN !== 'none' && inWindow(f.clock, FLOWERS.open)),
  };
  registerShop(s);
  return s;
}
// (registered now, so `kept=dakRice` finds it as the purse is made; again with its floor once roaming is built)
const STALL = registerStall(NaN);

// ── The calendar: the village round ──────────────────────────────────────────
registerEvent({ id: 'dakbat-village', kind: 'daily', name: 'whenAlms', note: 'dakCalNote', place: 'evVillage', begins: 'dakCalBegins', where: ALMS_WHERE, on: (m) => inClock(m.clock, ALMS_ON) });

// ── The add-on ───────────────────────────────────────────────────────────────

type Step = 'off' | 'turn' | 'down' | 'settle' | 'wait' | 'rise' | 'give' | 'sit' | 'bless' | 'bow' | 'leave' | 'up' | 'back';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

let env: AddonEnv | null = null;
let step: Step = 'off';
/** Seconds into the step. */
let st = 0;
const ps = dakState();
/** Where he kneels (feet) and faces; the way the monks walk there. */
const spot = new Vector3();
let facing = 0;
let way = 0;
let turnFrom = 0;
/** The hat came off for it (it goes back on). */
let hatTaken = false;
/** The rice went into the bowl (it is given, whatever happens next), counted, the spoonful out now. */
let given = false;
let counted = false;
let spooned = 0;
/** The camera: the side it looks from, the player's view before, how long framed (s). */
let camYaw = 0;
let before: { pitch: number; distance: number } | null = null;
let framed = 0;
let monkThere = false;
/** The props (built the first time) and the open hands of the sampeah, on him now. */
let props: { left: Group; right: Group; full: Group; less: Group; rice: Group; bare: Group } | null = null;
let hands: { L: Group; R: Group } | null = null;
let propsOn = false;
let handsOpen = false;
/** The prompts (made again when the language changes). */
let pOffer = '';
let pNeed = '';
let pUp = '';
const words = () => {
  pOffer = `E  ${t('dakOffer')}`;
  pNeed = t('dakNeed');
  pUp = `E  ${t('dakUp')}`;
};
words();
onLang(words);
/** Scratch (no allocation a step). */
const _v = new Vector3();
/** The line he last gave to, and until when (`DAK.now`): no "buy rice" hint for its monks meanwhile (he just gave). */
let gaveLine = '';
let gaveUntil = -1e9;
/** The way the monks walk is known (from their line's slots; a check's start guesses it until its line answers). */
let wayKnown = false;
/** When he asked (`DAK.now`: the frames' time, so a check's scripted steps, which run no people, do not time it out). */
let askedAt = 0;
/** A check's URL holds the camera (`rcam=`): the offering leaves it be. */
let urlCam = false;

/** Where his rice is in his bag (−1: none). */
function riceAt(): number {
  const kept = env?.purse.kept ?? [];
  for (let i = 0; i < kept.length; i++) if (kept[i].id === RICE_ID) return i;
  return -1;
}

/** The monk nearest him coming along his way (fresh, on his round, ahead of him and not far off it), or null. */
function coming(ctx: RoamCtx): { m: AlmsMonk; d: number } | null {
  const p = ctx.body.pos;
  let best: AlmsMonk | null = null;
  let bd = DAK_NEAR;
  for (const m of DAK.monks) {
    if (!m.on || m.t < DAK.now - 0.6 || Math.abs(m.y - p.y) > 2.5) continue;
    const dx = p.x - m.x;
    const dz = p.z - m.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= bd) continue;
    const fx = Math.sin(m.yaw);
    const fz = Math.cos(m.yaw);
    // (ahead of him along his way, and not far off it)
    if (dx * fx + dz * fz < 0.6 || Math.abs(dx * fz - dz * fx) > DAK_SIDE) continue;
    best = m;
    bd = d;
  }
  if (!best) return null;
  NEAREST.m = best;
  NEAREST.d = bd;
  return NEAREST;
}
/** (`coming`'s answer: one object, filled again each call) */
const NEAREST = { m: null as unknown as AlmsMonk, d: 0 };

function setHat(on: boolean): void {
  const e = env!;
  if (e.explorer.currentOutfit.hat === on) return;
  e.explorer.setOutfit({ hat: on });
  e.photo.refreshBody();
}

/** The bowl of rice and the spoon in his hands (`on`), at `size` (0‥1: they pop in and shrink away). */
function showProps(on: boolean, size: number): void {
  const e = env!;
  if (on && !props) {
    const q = e.explorer.rig.quality;
    const mk = (b: Parameters<typeof buildVoxelMesh>[0], name: string) => buildVoxelMesh(b, { quality: q, castShadow: true, name });
    const full = mk(buildPhtel(1), 'dak:rice');
    const less = mk(buildPhtel(0.3), 'dak:rice-given');
    const rice = mk(buildSpoon(true), 'dak:spoon-rice');
    const bare = mk(buildSpoon(false), 'dak:spoon');
    const left = new Group();
    left.name = 'dak:bowl';
    left.position.set(0, PHTEL_UP, 0);
    left.add(full, less);
    const right = new Group();
    right.name = 'dak:spoon';
    right.add(rice, bare);
    props = { left, right, full, less, rice, bare };
  }
  if (!props) return;
  if (on !== propsOn) {
    propsOn = on;
    if (on) {
      e.explorer.rig.setSlotObject('dakBowl', 'propL', props.left);
      e.explorer.rig.setSlotObject('dakSpoon', 'propR', props.right);
    } else {
      e.explorer.rig.clearSlot('dakBowl');
      e.explorer.rig.clearSlot('dakSpoon');
    }
  }
  const s = Math.max(0.001, size);
  props.left.scale.setScalar(s);
  props.right.scale.setScalar(s);
  props.full.visible = spooned < SPOONFULS;
  props.less.visible = !props.full.visible;
}

/** The spoon carries rice (`on`) or is empty. */
function spoonRice(on: boolean): void {
  if (!props) return;
  props.rice.visible = on;
  props.bare.visible = !on;
}

/** Flat hands (the sampeah, the bow) or his own. */
function openHands(on: boolean): void {
  const e = env!;
  if (on === handsOpen) return;
  handsOpen = on;
  if (on) {
    if (!hands) {
      const q = e.explorer.rig.quality;
      const mk = (side: 'L' | 'R') => {
        const p = JOINTS[`wrist${side}`].pivot;
        return buildVoxelMesh(buildHand(side, 'open'), { quality: q, offset: new Vector3(p[0], p[1], p[2]), castShadow: true, name: `dak:hand${side}` });
      };
      hands = { L: mk('L'), R: mk('R') };
    }
    e.explorer.rig.setSlotObject('handL', 'wristL', hands.L);
    e.explorer.rig.setSlotObject('handR', 'wristR', hands.R);
  } else {
    // (his own hands back: the explorer's, as it had them)
    e.explorer.setHandPose('L', 'relaxed');
    e.explorer.setHandPose('R', 'relaxed');
  }
}

/** A point on the map in his space (BU), into `out`. */
function toBody(ctx: RoamCtx, x: number, y: number, z: number, out: Vector3): Vector3 {
  const b = ctx.body;
  const k = 1 / (BODY_UNIT_M * b.scale);
  const dx = x - b.pos.x;
  const dz = z - b.pos.z;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return out.set((c * dx - s * dz) * k, (y - b.pos.y) * k, (s * dx + c * dz) * k);
}

/** Start: kneel by the way, ask the line. */
function begin(ctx: RoamCtx, m: AlmsMonk): void {
  const p = ctx.body.pos;
  spot.copy(p);
  way = m.yaw;
  // Facing the monks' way across it (at its side), or the monk coming (in it).
  const lx = Math.cos(way);
  const lz = -Math.sin(way);
  const side = (p.x - m.x) * lx + (p.z - m.z) * lz;
  facing = Math.abs(side) > 1.3 ? Math.atan2(-Math.sign(side) * lx, -Math.sign(side) * lz) : way + Math.PI;
  const a = DAK.ask;
  a.n++;
  a.state = 'ask';
  a.line = m.line;
  a.k = -1;
  a.x = p.x;
  a.y = p.y;
  a.z = p.z;
  a.yaw = facing;
  a.mx = p.x + Math.sin(facing) * DAK_STAND;
  a.mz = p.z + Math.cos(facing) * DAK_STAND;
  a.myaw = facing + Math.PI;
  a.rice = 0;
  a.snap = false;
  askedAt = DAK.now;
  given = counted = false;
  spooned = 0;
  monkThere = false;
  wayKnown = true;
  urlCam = false;
  go('turn');
  turnFrom = ctx.body.yaw;
  pickSide(ctx);
}

function go(s: Step): void {
  step = s;
  st = 0;
}

/**
 * The side the camera looks from: across the way he faces, a little to his front (both him and the monk in view,
 * the spoon's side first: his right), not from where the line comes (the other monks would stand between), and
 * from where nothing stands between it and them: stone, a wall, a fence, leaves, or anyone (a passer-by on a
 * bicycle). Each side as asked, then square across, then a little further round to the front.
 */
function pickSide(ctx: RoamCtx): void {
  const a = DAK.ask;
  const fx = Math.sin(way);
  const fz = Math.cos(way);
  // (the camera stands at focus − forward(yaw) · d: on the line's coming side is "upstream")
  const upstream = (y: number) => Math.sin(y) * fx + Math.cos(y) * fz > 0.3;
  const w = ctx.world;
  const hard = w.hardClearance ?? w.clearance;
  const s = ctx.body.scale / 1.4;
  // (between him and where the monk will stand, at their chests)
  const f = _v.set((spot.x + a.mx) / 2, spot.y + 1.25 * s, (spot.z + a.mz) / 2);
  const d = FRAME.distance * s;
  const free = (y: number, people: boolean) => {
    const cp = Math.cos(FRAME.pitch);
    const cx = f.x - Math.sin(y) * cp * d;
    const cy = f.y + Math.sin(FRAME.pitch) * d;
    const cz = f.z - Math.cos(y) * cp * d;
    if ((hard?.(f.x, f.y, f.z, cx, cy, cz) ?? 1) < 0.97) return false;
    return !people || !nearby(f.x, spot.y, f.z, y + Math.PI, d + 1, 0.32, seen);
  };
  let pick = NaN;
  for (const people of [true, false])
    for (const off of SIDES)
      for (const sign of [1, -1]) {
        const y = facing + sign * off;
        if (Number.isNaN(pick) && !upstream(y) && free(y, people)) pick = y;
      }
  camYaw = Number.isNaN(pick) ? facing + FRAME.side : pick;
  framed = 0;
}
/** The sides tried, from the way he faces (radians: past square, toward his front first). */
const SIDES = [FRAME.side, Math.PI / 2, FRAME.side + 0.35, Math.PI / 2 - 0.35];
const seen: Nearby = { x: 0, y: 0, z: 0, d: 0, kind: '', elder: false };

/** Leave off now (E, the stick): back on his feet the way he went down; the rice stays in his bag unless it is in the bowl. */
function leaveOff(): void {
  const a = DAK.ask;
  if (step === 'turn') {
    end(false);
    return;
  }
  if (step === 'down') {
    go('back');
    if (!given && a.state !== 'none') a.state = 'none';
    return;
  }
  if (step === 'up' || step === 'back' || step === 'leave') return;
  // (the rice in: it is given, the monks go on; else they go on without it)
  a.state = given ? 'done' : 'none';
  if (given) count();
  go('leave');
}

/** The offering is given: counted, kept between visits. */
function count(): void {
  if (counted || !env) return;
  counted = true;
  gaveLine = DAK.ask.line;
  gaveUntil = DAK.now + 120;
  const n = progress.get('dak.count', 0, isNum) + 1;
  progress.set('dak.count', n);
  env.hud.toast(t('dakDone', { n: num(n) }));
}

/** All done (or stopped): his own pose, hands, hat; the monks let go. */
function end(soft: boolean): void {
  const e = env;
  if (!e) return;
  showProps(false, 0);
  openHands(false);
  if (hatTaken) {
    hatTaken = false;
    setHat(true);
  }
  e.explorer.animator.posture = null;
  e.explorer.animator.postureFeet = true;
  const a = DAK.ask;
  if (a.state !== 'none' && a.state !== 'done') a.state = given ? 'done' : 'none';
  if (!soft) a.state = given ? 'done' : 'none';
  step = 'off';
  st = 0;
}

/** The posture: the state's numbers each step (see character/dakBat.ts). */
const posture = () => dakBatPose(ps);

registerAddon({
  id: ID,
  init(e) {
    env = e;
    // (checks, on the dev server only — shots run there too: the offering's state from the console, `__dak.now()`)
    if (import.meta.env.DEV) Object.assign(window, { __dak:{ DAK, now: () => ({ step, st: +st.toFixed(2), facing: +facing.toFixed(2), way: +way.toFixed(2), camYaw: +camYaw.toFixed(2), given, spooned, ask: { ...DAK.ask } }) } });
    // (the stall's floor now)
    registerStall(e.world.field.heightAt(STALL.x, STALL.z));
    KEEPSAKES.set(RICE_ID, {
      // (its name says what it is for: no "Eat")
      label: (name) => name,
      pick: () => e.hud.toast(t('dakKeepHint')),
      kept: (name) => t('dakKept', { name }),
      busy: () => step !== 'off',
    });
    // (the bag shows it as what it is now: made before this add-on was)
    bagNotify.update();
  },

  get holding() {
    return step !== 'off';
  },

  get handsBusy() {
    return step !== 'off';
  },

  input(ctx, mode) {
    if (step === 'off' || mode !== 'walk') return false;
    const i = ctx.input;
    if (Math.hypot(i.move.x, i.move.y) > STICK || i.jump || i.use) leaveOff();
    // (his input is the offering's meanwhile: no tool, no camera, no emote)
    return true;
  },

  offer(ctx, mode) {
    if (mode !== 'walk' || step !== 'off' || !env || env.busy()) return null;
    const c = coming(ctx);
    if (!c) return null;
    if (riceAt() >= 0) return pOffer;
    return c.d < DAK_HINT && !(c.m.line === gaveLine && DAK.now < gaveUntil) ? pNeed : null;
  },

  use(ctx) {
    const c = coming(ctx);
    if (!c || riceAt() < 0 || !env) return;
    begin(ctx, c.m);
  },

  hold(ctx, dt) {
    const e = env!;
    const { body, cam, input } = ctx;
    const a = DAK.ask;
    st += dt;
    ps.t += dt;
    body.vel.set(0, 0, 0);
    body.grounded = true;
    body.pos.copy(spot);
    cam.turn(input.lookYaw, input.lookPitch, input.zoom);
    let prompt: string | null = null;
    switch (step) {
      case 'turn': {
        const k = smooth(Math.min(1, st / TURN));
        body.yaw = turnFrom + angleDiff(facing, turnFrom) * k;
        if (k >= 1) {
          body.yaw = facing;
          go('down');
          ps.pray = 0;
          ps.rise = 1;
          ps.hold = ps.spoon = ps.tip = ps.palms = ps.bow = ps.lookW = ps.lean = 0;
          e.explorer.animator.posture = posture;
          e.explorer.animator.postureFeet = false;
          SFX.play('dakCloth', 0.8);
        }
        break;
      }
      case 'down':
        ps.pray = Math.min(DAK_KNEEL, st * KNEEL_RATE);
        if (!hatTaken && ps.pray >= DAK_HAT.off && e.explorer.currentOutfit.hat) {
          hatTaken = true;
          setHat(false);
        }
        if (ps.pray >= DAK_KNEEL) {
          ps.pray = NaN;
          go('settle');
        }
        break;
      case 'settle': {
        // Back on his heels, the bowl of rice out of his bag onto his lap.
        const k = smooth(Math.min(1, st / SETTLE));
        ps.rise = 1 - k;
        ps.hold = smooth(Math.min(1, st / (SETTLE * 0.8)));
        ps.lookW = k;
        spoonRice(true);
        showProps(true, smooth(Math.min(1, st / 0.3)));
        if (k >= 1) go('wait');
        break;
      }
      case 'wait': {
        prompt = pUp;
        showProps(true, 1);
        // (the line's answer: one of them comes; none: they have passed)
        // (a check's `dakbat=wait`: the line nearest him is asked once the people part has said where its monks are)
        if (a.state === 'ask' && !a.line) a.line = nearestLine(ctx);
        if (askedAt < 0) askedAt = DAK.now;
        if (a.state === 'none' || (a.state === 'ask' && DAK.now - askedAt > ANSWER) || DAK.now - askedAt > WAIT_MAX) {
          e.hud.toast(t('dakMissed'));
          a.state = 'none';
          go('leave');
          break;
        }
        if (a.state === 'there') {
          monkThere = true;
          // (the view again, now he stands there: who passes by meanwhile)
          pickSide(ctx);
          SFX.play('dakLid', 0.7);
          go('rise');
        }
        break;
      }
      case 'rise': {
        const k = smooth(Math.min(1, st / RISE));
        ps.rise = k;
        ps.lean = LEAN * k;
        if (k >= 1) go('give');
        break;
      }
      case 'give': {
        // Two spoonfuls: the spoon out over the bowl, tipped, back to the rice.
        const n = Math.floor(st / SPOONFUL);
        const u = st - n * SPOONFUL;
        if (n >= SPOONFULS) {
          ps.spoon = ps.tip = 0;
          a.state = 'given';
          go('sit');
          break;
        }
        ps.spoon = u < 0.65 ? smooth(u / 0.65) : u < 1.0 ? 1 : 1 - smooth((u - 1.0) / 0.7);
        ps.tip = u < 0.62 ? 0 : u < 0.92 ? smooth((u - 0.62) / 0.3) : u < 1.05 ? 1 : 1 - smooth((u - 1.05) / 0.4);
        // (the rice falls in as the spoon tips over: given from the first)
        if (spooned <= n && u >= 0.8) {
          spooned = n + 1;
          a.rice = spooned / SPOONFULS;
          SFX.play('dakSpoon', 0.8);
          spoonRice(false);
          if (!given) {
            given = true;
            const i = riceAt();
            if (i >= 0) e.purse.take(i);
          }
        }
        // (a new spoonful from his bowl for the next)
        if (n + 1 < SPOONFULS && u > 1.55) spoonRice(true);
        break;
      }
      case 'sit': {
        // Back on his heels, the bowl and spoon away, palms together; the lid goes back on.
        const k = smooth(Math.min(1, st / SIT));
        ps.rise = 1 - k;
        ps.lean = LEAN * (1 - k);
        ps.hold = 1 - smooth(Math.min(1, st / (SIT * 0.6)));
        showProps(ps.hold > 0.02, ps.hold);
        ps.palms = smooth(Math.min(1, Math.max(0, (st - SIT * 0.35) / (SIT * 0.65))));
        ps.lookW = 1 - k;
        openHands(ps.palms > 0.45);
        if (st > 0.15 && st - dt <= 0.15) SFX.play('dakLid', 0.6);
        if (k >= 1) {
          a.state = 'bless';
          SFX.play('dakChant', 0.6);
          go('bless');
        }
        break;
      }
      case 'bless':
        if (st >= BLESS) go('bow');
        break;
      case 'bow': {
        // One bow to the ground, then the hands down: the monks walk on.
        const k = st / BOW;
        ps.bow = k < 0.38 ? smooth(k / 0.38) : k < 0.6 ? 1 : 1 - smooth((k - 0.6) / 0.4);
        ps.palms = 1 - smooth(Math.min(1, k / 0.5));
        openHands(ps.palms > 0.45 || ps.bow > 0.3);
        if (k >= 1) {
          ps.bow = ps.palms = 0;
          openHands(false);
          a.state = 'done';
          count();
          go('up');
          ps.pray = DAK_RISE;
          SFX.play('dakCloth', 0.8);
        }
        break;
      }
      case 'leave': {
        // Part way: the hands back to his knees, on his heels, then up.
        const k = Math.min(1, dt / LEAVE);
        ps.rise += (0 - ps.rise) * k * 3;
        ps.lean += (0 - ps.lean) * k * 3;
        ps.hold = Math.max(0, ps.hold - dt / LEAVE);
        ps.palms = Math.max(0, ps.palms - dt / LEAVE);
        ps.bow = Math.max(0, ps.bow - dt / LEAVE);
        ps.spoon = Math.max(0, ps.spoon - dt / LEAVE);
        ps.tip = Math.max(0, ps.tip - dt / LEAVE);
        ps.lookW = Math.max(0, ps.lookW - dt / LEAVE);
        showProps(ps.hold > 0.02, ps.hold);
        openHands(ps.palms > 0.45);
        if (st >= LEAVE) {
          ps.rise = ps.lean = ps.hold = ps.palms = ps.bow = ps.spoon = ps.tip = ps.lookW = 0;
          go('up');
          ps.pray = DAK_RISE;
          SFX.play('dakCloth', 0.8);
        }
        break;
      }
      case 'up':
        ps.pray = Math.min(PRAY.duration, DAK_RISE + st * KNEEL_RATE);
        if (hatTaken && ps.pray >= DAK_HAT.on) {
          hatTaken = false;
          setHat(true);
        }
        if (ps.pray >= PRAY.duration - 0.05) end(true);
        break;
      case 'back':
        // (left off while kneeling down: back up the same way)
        ps.pray = Math.max(0, (Number.isNaN(ps.pray) ? DAK_KNEEL : ps.pray) - dt * KNEEL_RATE * 1.3);
        if (hatTaken && ps.pray < DAK_HAT.off) {
          hatTaken = false;
          setHat(true);
        }
        if (ps.pray <= 0) end(true);
        break;
    }
    if (step === 'off') return { prompt: null };
    // (a check's start: the line that answered says which way the monks walk; the view again, the line behind)
    if (!wayKnown && a.line) {
      for (const m of DAK.monks)
        if (m.line === a.line && m.k === Math.max(0, a.k)) {
          way = m.yaw;
          wayKnown = true;
          pickSide(ctx);
          if (urlCam) framed = Infinity;
          else {
            ctx.cam.yaw = camYaw;
            ctx.cam.behindYaw = camYaw;
            framed = FRAME.for;
          }
        }
    }
    // Where he looks and reaches: the monk's bowl (his line coming, while he waits).
    if (a.state === 'there' || a.state === 'given' || a.state === 'bless') {
      // (the spoon over the near half of the bowl's mouth: toward him a little, just above it)
      const k = 0.1 / Math.max(0.1, Math.hypot(a.bx - spot.x, a.bz - spot.z));
      toBody(ctx, a.bx + (spot.x - a.bx) * k, a.by + 0.07, a.bz + (spot.z - a.bz) * k, ps.reach);
      ps.look.copy(ps.reach);
    } else {
      const c = coming(ctx);
      if (c) toBody(ctx, c.m.x, c.m.y + 2.6, c.m.z, ps.look);
    }
    e.explorer.setMotion(0, true, 0);
    frame(ctx, dt);
    return { prompt };
  },

  setMode(next) {
    // (off his feet, or back to the map: it stops at once)
    if (step !== 'off' && next !== 'walk') {
      if (given) count();
      end(false);
      restoreCam(null);
    }
  },

  frame(f: MapFrame, mode: RoamMode) {
    DAK.now = f.t;
    // (back from the offering: the player's own view again)
    if (step === 'off' && before && mode === 'walk') restoreCam(f.dt);
  },

  fromUrl(q, ctx) {
    const v = q.get('dakbat');
    if (!v || !env) return;
    // The rice in his bag (`near`: none, to check the hint), and, from the people part, the monks coming: `DAK.pin`.
    if (v !== 'near' && riceAt() < 0) env.purse.keep(keptOf(STALL, RICE_ITEM));
    DAK.pin = { x: ctx.body.pos.x, z: ctx.body.pos.z };
    if (v !== 'give' && v !== 'bless' && v !== 'wait') return;
    // Kneeling already, facing the way he faces; the monk there at once (`snap`), as far in as asked.
    const p = ctx.body.pos;
    spot.copy(p);
    facing = ctx.body.yaw;
    way = facing + Math.PI;
    wayKnown = false;
    const a = DAK.ask;
    a.n++;
    a.state = v === 'wait' ? 'ask' : v === 'give' ? 'there' : 'bless';
    a.line = '';
    a.k = -1;
    a.x = p.x;
    a.y = p.y;
    a.z = p.z;
    a.yaw = facing;
    a.mx = p.x + Math.sin(facing) * DAK_STAND;
    a.mz = p.z + Math.cos(facing) * DAK_STAND;
    a.myaw = facing + Math.PI;
    a.rice = v === 'bless' ? 1 : 0;
    a.snap = v !== 'wait';
    // (`wait`: the nearest line is asked as E would)
    // (timed from the first frame: a check starts before any)
    askedAt = -1;
    given = v === 'bless';
    counted = false;
    spooned = v === 'bless' ? SPOONFULS : 0;
    monkThere = v !== 'wait';
    if (given) {
      const i = riceAt();
      if (i >= 0) env.purse.take(i);
    }
    hatTaken = env.explorer.currentOutfit.hat;
    setHat(false);
    env.explorer.animator.posture = posture;
    env.explorer.animator.postureFeet = false;
    ps.pray = NaN;
    ps.lookW = v === 'bless' ? 0 : 1;
    ps.rise = v === 'give' ? 1 : 0;
    ps.lean = v === 'give' ? LEAN : 0;
    ps.hold = v === 'bless' ? 0 : 1;
    ps.palms = v === 'bless' ? 1 : 0;
    ps.spoon = ps.tip = ps.bow = 0;
    if (ps.hold > 0) {
      showProps(true, 1);
      spoonRice(true);
    }
    openHands(v === 'bless');
    go(v === 'wait' ? 'wait' : v === 'give' ? 'give' : 'bless');
    pickSide(ctx);
    // (the camera there at once, unless the URL holds one: then it stays as the URL has it)
    urlCam = q.has('rcam');
    if (urlCam) framed = Infinity;
    else {
      const cam = ctx.cam;
      before = { pitch: cam.pitch, distance: cam.distance };
      cam.yaw = camYaw;
      cam.behindYaw = camYaw;
      cam.pitch = FRAME.pitch;
      cam.distance = FRAME.distance * (ctx.body.scale / 1.4);
      framed = FRAME.for;
    }
  },

  report(): Record<string, string> | null {
    if (step === 'off') return riceAt() >= 0 && DAK.pin ? { dakbat: '1' } : null;
    const v = step === 'bless' || step === 'bow' ? 'bless' : step === 'give' || step === 'rise' ? 'give' : 'wait';
    return { dakbat: v, sim: '_:0.5' };
  },
});

/** The line with a monk nearest him (any distance), for a check's `dakbat=wait`. */
function nearestLine(ctx: RoamCtx): string {
  let best = '';
  let bd = Infinity;
  for (const m of DAK.monks) {
    const d = Math.hypot(m.x - ctx.body.pos.x, m.z - ctx.body.pos.z);
    if (m.on && d < bd) {
      bd = d;
      best = m.line;
    }
  }
  return best;
}

/**
 * The camera while he gives: from his side (`camYaw`), a little above, between him and the monk (once the monk is
 * there); eased there over `FRAME.for` s after each change, then it is the player's (a drag looks round).
 */
function frame(ctx: RoamCtx, dt: number): void {
  const { cam, body } = ctx;
  const a = DAK.ask;
  const s = body.scale / 1.4;
  // (the focus: his chest, kneeling; between him and the monk's bowl once it is open)
  const fx = monkThere ? (spot.x + a.bx) / 2 : spot.x;
  const fz = monkThere ? (spot.z + a.bz) / 2 : spot.z;
  cam.focus.set(fx, spot.y + 1.25 * s, fz);
  cam.behindYaw = camYaw;
  before ??= { pitch: cam.pitch, distance: cam.distance };
  framed += dt;
  if (framed > FRAME.for) return;
  const k = 1 - Math.exp(-FRAME.rate * dt);
  cam.yaw += angleDiff(camYaw, cam.yaw) * k;
  cam.pitch += (FRAME.pitch - cam.pitch) * k;
  cam.distance += (FRAME.distance * s - cam.distance) * k;
}

/** Back to the player's own pitch and distance (eased; null: at once). */
function restoreCam(dt: number | null): void {
  const e = env;
  if (!e || !before) return;
  const cam = e.cam;
  const k = dt === null ? 1 : 1 - Math.exp(-FRAME.back * dt);
  cam.pitch += (before.pitch - cam.pitch) * k;
  cam.distance += (before.distance - cam.distance) * k;
  if (dt === null || (Math.abs(before.pitch - cam.pitch) < 0.005 && Math.abs(before.distance - cam.distance) < 0.05)) before = null;
}
