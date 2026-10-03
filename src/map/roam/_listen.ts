import { Vector3, type Group } from 'three';
import { BLESS_BOWS, BLESS_HAT, BLESS_KNEEL, BLESS_RISE, blessPose, blessState } from '../../character/blessing';
import { PRAY, PRAY_PALMS } from '../../character/clips';
import { buildHand } from '../../character/parts/limbs';
import { JOINTS } from '../../character/skeleton';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { BODY_UNIT_M } from '../../world/scale';
import { stopListenChant } from '../audio/_listen';
import { SFX } from '../audio/addonSfx';
import { pad } from '../pad/pad';
import { progress } from '../progress';
import type { MapFrame, RoamMode } from '../types';
import { num, onLang, t } from '../ui/lang';
import { registerAddon, touchJump, type AddonEnv, type AddonKey } from './_addons';
import { BLESS, BLESS_SEATS, seatBefore, seatFront, type BlessSeat } from './_blessingHooks';
import { CHANT_SITES, LISTEN, MONK_CHANT_FOR, rowFresh, siteLocal, siteWorld, type ChantSite, type ListenState, type ListenWho } from './_listenHooks';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * Kneeling to listen to the monks' chanting (ស្ដាប់ព្រះសង្ឃសូត្រមន្ត), in the
 * floating village pagoda's hall and before Phnom Kulen's reclining Buddha (the
 * link `LISTEN`, the rows' sites `CHANT_SITES`: roam/_listenHooks.ts):
 *
 * - **At the dawn chant** (events.ts `dawnChant`; four monks in a row before the
 *   Buddha, villagers kneeling behind them: people/_sceneChant.ts): behind the row
 *   (its `ask` floor: the hall, the rock's floor under the roof)
 *   "E  លុតជង្គង់ស្ដាប់ព្រះសង្ឃសូត្រមន្ត / Kneel and listen to the monks chanting"
 *   (J too; while they walk in, "The monks are coming in to chant", no E). He
 *   walks to his place behind the row (the nearer of its `spots`: behind the gap
 *   between two monks), turns to the Buddha and kneels as at dak bat
 *   (the prayer's kneel, hat off, back on his heels), palms together at his face,
 *   his head bowed, now and then a glance up. The chant is the pagoda's own
 *   (audio/temple.ts); the map's music steps back. When the monks end (they bow,
 *   heads down three times) he bows three times to the floor with them and gets up:
 *   "Sathu! You listened to the monks chanting".
 * - **Before the blessing monk** (by day, on his dais: people/_sceneBlessing.ts):
 *   beside "E  Ask for a blessing" the blessing's prompt says "J  Kneel and listen"
 *   (the explorer menu's Sit is J too: touch and the pad). He kneels where one
 *   kneels for the blessing; the monk puts his palms together and chants for him
 *   (the recorded monks, audio/_listen.ts; his bubbles: the homage, the refuges, the
 *   praise of the Buddha, loving-kindness) for `MONK_CHANT_FOR` s, then he bows
 *   three times and gets up.
 * - **Getting up**: E, Space, J or the stick: the three bows, then up (again during
 *   the bows: up at once). Back to the map, or off his feet: it all stops at once.
 * - **The camera** comes round low behind him (the row's: from the side toward the
 *   row's middle, the village's carpet, him on his knees, the row before him, the
 *   Buddha beyond; the monk's: over his left shoulder, the monk facing it) and
 *   drifts a very little; a drag looks round.
 *
 * URL (checks): `listen=1` starts as J or E would (`listenwho=row|monk`; else the
 * monk when he stands before the dais, else the nearest row); `listen=<step>[:<s>]`
 * that far into a step at once (`kneel`, `listen`, `bow`, `up`). `report()` gives
 * `listen=`, `listenwho=`. `window.__listen` (checks): the step, its time, the link.
 */

const ID = 'listen';
/** In the E row before a shrine (the pagoda door's, on the porch, reaches into the hall): in the hall at the dawn chant, listening comes first. */
const ORDER = 14;

/** Walking to his place: a calm pace (share of his), slower over the last `SLOW` m, there within `THERE` m; he gives up if no nearer for `STALL` s or after `GO_FOR` s. */
const PACE = 0.6;
const SLOW = 1.5;
const THERE = 0.18;
const STALL = 0.8;
const GO_FOR = 9;
/** The stick past this, Space, E or J: never mind (walking to it), or get up. */
const STICK = 0.35;
/** The turn to the monks (s), the kneel's speed (prayer time a second), back on his heels (s). */
const TURN_T = 0.55;
const KNEEL_RATE = 1.15;
const SETTLE_T = 0.9;
/** Listening: his head bowed this much (character/blessing.ts `bowHead`); a glance up every `GLANCE` s for `GLANCE_FOR` s. */
const LISTEN_BOW = 0.34;
const GLANCE = 17;
const GLANCE_FOR = 3.4;
/** The bows' speed (prayer time a second), a leaving off while kneeling down (s). */
const BOW_RATE = 1.0;
const LEAVE_T = 0.6;
/** The monks he listens to are gone (no longer written, or up) for this long (s): the end. */
const AWAY_FOR = 1.5;
/** It counts (the toast, `progress` `listen.count`) once he has listened this long (s), or to the end if he heard at least `END_COUNT` s of it. */
const COUNT_AFTER = 12;
const END_COUNT = 4;
/** The monk's chant fades out this long before its end (s); the sound is asked for this often (s). */
const FADE_BEFORE = 2.6;
const TICK = 0.9;
/**
 * The camera. The row's: from behind him, toward the row's middle (`side` round from the way he faces; in the village
 * over the carpet: the villagers on the mats are out of its way), a little above: him kneeling, the monks' row before him over
 * his shoulder, the Buddha beyond; the monk's: from behind his left shoulder (the monk faces it, chanting; the hall's door wall is close on his
 * left, the room is behind him), low. A little wider (`fov`:
 * the hall is narrow). Eased there over `for` s, then it drifts (`drift` rad over `period` s) until the player drags;
 * back to where it was after.
 */
const FRAME_ROW = { pitch: 0.22, dist: 4.2, focusUp: 1.4, toward: 0.6 };
/** The row's on a screen held upright (narrow: less from the side, its row's `cam.tall`, a little higher, so the row and the Buddha stay in). */
const FRAME_ROW_TALL = { pitch: 0.35, dist: 4.2, focusUp: 1.4, toward: 0.6 };
const FRAME_MONK = { side: -0.85, pitch: 0.2, dist: 3.9, focusUp: 1.35, toward: 0.5 };
const FRAME = { fov: 60, rate: 1.6, back: 2.2, for: 3.2, drift: 0.09, period: 46 };
/** Kneeling villagers keep him this far off (m, from their places: their knees and his); the monks' platform this far (m, his body). */
const ROW_ROOM = 0.62;
const SEAT_ROOM = 0.42;
/** The key help while he kneels. */
const KEYS: readonly AddonKey[] = [
  ['E', 'listenGetUp', 'west'],
  ['Q R', 'rLook', 'rstick'],
];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
/** 0‥1 over [a, b] (smoothed). */
const over = (x: number, a: number, b: number) => smooth((x - a) / (b - a));

type Step = 'off' | 'go' | 'turn' | 'down' | 'settle' | 'listen' | 'bow' | 'up' | 'leave' | 'back';

let env: AddonEnv | null = null;
let step: Step = 'off';
/** Seconds into the step; into the listening (the glances, the drift). */
let st = 0;
let heard = 0;
let who: ListenWho = 'none';
let seat: BlessSeat = BLESS_SEATS[0];
/** The row he listens to (`who` is `row`). */
let site: ChantSite = CHANT_SITES[0];
/** Where he kneels (feet), the way he faces (to the monk, or the Buddha). */
const kneelAt = new Vector3();
const from = new Vector3();
let facing = 0;
let turnFrom = 0;
/** Walking to his place: for how long (s), the nearest he has come (m) and how long ago (s). */
let goT = 0;
let goBest = Infinity;
let goSince = 0;
const ps = blessState();
/** The hat came off for it (it goes back on). */
let hatTaken = false;
/** The chanting ended (the bows are with the monks'), it was counted; the sound's next tick (s into the step). */
let ended = false;
let counted = false;
let tick = 0;
/** How long the monks he listens to have not been there (s): a moment's gap (the first frames, a slow one) is not the end. */
let away = 0;
/** A check's URL runs the steps up to its moment before the monks are written: their end is not looked for then. */
let replaying = false;
/** The stick was pushed last step (a push gets him up once, not again each step while held). */
let pushHeld = false;
/** The screen is held upright (the row's camera frames it so). */
let tall = false;
/** The camera: the way it looks from, the player's view before, how long framed (s), held by a check's URL. */
let camYaw = 0;
let before: { pitch: number; distance: number } | null = null;
let framed = 0;
let urlCam = false;
/** The flat hands of the sampeah (built the first time), on him now. */
let hands: { L: Group; R: Group } | null = null;
let handsOpen = false;
let face: 'happy' | null = null;
/** The prompts (made again when the language changes). */
let pAsk = '';
let pUp = '';
let pComing = '';
let pOver = '';
let pGoing = '';
let pGoingMonk = '';
const words = () => {
  pAsk = `E  ${t('listenAsk')}`;
  pGoing = t('listenAsk');
  pGoingMonk = t('listenMonk');
  pOver = t('listenOver');
  pUp = `E  ${t('listenUp')}`;
  pComing = t('listenComing');
};
words();
onLang(words);
/** Scratch (no allocation a step). */
const _v = new Vector3();
const _f = { x: 0, z: 0 };
const _l = { a: 0, d: 0 };
const posture = () => blessPose(ps);

// ── Where ────────────────────────────────────────────────────────────────────

/** He stands on the floor behind the row of `s` where E asks (the village's hall past the door, before the offering table). */
function inAsk(s: ChantSite, p: Vector3): boolean {
  if (Math.abs(p.y - s.floor) >= 0.8) return false;
  const l = siteLocal(s, p.x, p.z, _l);
  return Math.abs(l.a) < s.ask.a && l.d > s.ask.d0 && l.d < s.ask.d1;
}

/** The row built and near whose ask floor he stands on, or null. */
function rowHere(p: Vector3): ChantSite | null {
  for (const s of CHANT_SITES) if (rowFresh(s.id) && inAsk(s, p)) return s;
  return null;
}

/** What he would kneel to listen to here: a row (behind it, the monks in their places, chanting), or the blessing monk (before his dais, there). */
function listenable(ctx: RoamCtx): { who: 'row'; site: ChantSite } | { who: 'monk'; seat: BlessSeat } | null {
  const p = ctx.body.pos;
  const row = rowHere(p);
  const r = row ? LISTEN.rows[row.id] : null;
  if (row && r && r.there && !r.ending) return { who: 'row', site: row };
  const s = seatBefore(p);
  if (!s) return null;
  const m = BLESS.monks[s.id];
  // (the people part last wrote him a moment ago: else it is not built, or far)
  return m.there && BLESS.now - m.t < 1.5 ? { who: 'monk', seat: s } : null;
}

/** The listening place behind the row of `s` nearest him (world m). */
function spotNear(s: ChantSite, p: Vector3, out: Vector3): Vector3 {
  let best = Infinity;
  for (const k of s.spots) {
    siteWorld(s, k.a, k.d, _f);
    const d = Math.hypot(_f.x - p.x, _f.z - p.z);
    if (d < best) {
      best = d;
      out.set(_f.x, s.floor, _f.z);
    }
  }
  return out;
}

/**
 * He never stands on a row's platform (it is not on the walk map: put back off its front or an end; the Buddha's
 * table or bed is behind it), and while the villagers kneel in their places (or come to them) he keeps out of their
 * laps: out of a circle round each place.
 */
function keepOffRow(ctx: RoamCtx): void {
  for (const s of CHANT_SITES) if (rowFresh(s.id)) keepOff(ctx, s);
}

function keepOff(ctx: RoamCtx, s: ChantSite): void {
  const p = ctx.body.pos;
  if (Math.abs(p.y - s.floor) > 0.8) return;
  const r = SEAT_ROOM * (ctx.body.scale / 1.4);
  const P = s.seat;
  const a0 = -P.half - r;
  const a1 = P.half + r;
  const d0 = P.d0 - r;
  const l = siteLocal(s, p.x, p.z, _l);
  if (l.a > a0 && l.a < a1 && l.d > d0 && l.d < P.d1 + r) {
    // (out the nearest open side: the front, or an end)
    const front = l.d - d0;
    const left = l.a - a0;
    const right = a1 - l.a;
    if (front <= left && front <= right) l.d = d0;
    else if (left <= right) l.a = a0;
    else l.a = a1;
    siteWorld(s, l.a, l.d, _f);
    p.x = _f.x;
    p.z = _f.z;
  }
  const w = LISTEN.rows[s.id];
  if (!(w.there || w.chanting || w.coming)) return;
  for (const f of s.folk) {
    siteWorld(s, f.a, f.d, _f);
    push(p, _f.x, _f.z);
  }
}

function push(p: Vector3, x: number, z: number): void {
  const dx = p.x - x;
  const dz = p.z - z;
  const d = Math.hypot(dx, dz);
  if (d >= ROW_ROOM) return;
  // (straight out; from the very middle, back toward the door)
  const k = d < 1e-3 ? 0 : ROW_ROOM / d;
  p.x = d < 1e-3 ? x : x + dx * k;
  p.z = d < 1e-3 ? z - ROW_ROOM : z + dz * k;
}

// ── Kneeling, listening, the bows ────────────────────────────────────────────

function go(s: Step): void {
  step = s;
  st = 0;
}

/** The link's state for the monks (`LISTEN.ask`), each step. */
function tell(state: ListenState, tt: number): void {
  const a = LISTEN.ask;
  a.who = state === 'none' ? 'none' : who;
  a.state = state;
  a.t = tt;
  a.seat = seat.id;
  a.site = site.id;
  const p = env?.body.pos ?? kneelAt;
  a.x = p.x;
  a.y = kneelAt.y;
  a.z = p.z;
}

/** Start: walk to his place (behind the row, or before the monk). */
function begin(ctx: RoamCtx, w: { who: 'row'; site: ChantSite } | { who: 'monk'; seat: BlessSeat }): void {
  who = w.who;
  if (w.who === 'monk') {
    seat = w.seat;
    seatFront(seat, seat.kneel, _f);
    kneelAt.set(_f.x, seat.floor, _f.z);
    facing = seat.yaw + Math.PI;
  } else {
    site = w.site;
    spotNear(site, ctx.body.pos, kneelAt);
    facing = site.yaw;
  }
  ended = counted = false;
  heard = away = 0;
  urlCam = false;
  LISTEN.ask.n++;
  turnFrom = ctx.body.yaw;
  from.copy(ctx.body.pos);
  tell('kneel', 0);
  goT = goSince = 0;
  goBest = Infinity;
  if (Math.hypot(kneelAt.x - ctx.body.pos.x, kneelAt.z - ctx.body.pos.z) < 0.25) startTurn(ctx);
  else go('go');
}

function startTurn(ctx: RoamCtx): void {
  turnFrom = ctx.body.yaw;
  from.copy(ctx.body.pos);
  go('turn');
  pickSide();
  // (on a touch screen: no "Jump" beside "Get up" while he kneels)
  touchJump('hide');
}

/** The stick that walks him to his place, with the camera where it is (as the prayer's: _pray.ts `lead`). */
function steer(ctx: RoamCtx): void {
  const i = ctx.input;
  const p = ctx.body.pos;
  const dx = kneelAt.x - p.x;
  const dz = kneelAt.z - p.z;
  const dist = Math.hypot(dx, dz);
  if (dist < THERE) return;
  i.run = false;
  const k = (PACE * Math.min(1, Math.max(0.3, dist / SLOW))) / dist;
  const fx = Math.sin(ctx.cam.yaw);
  const fz = Math.cos(ctx.cam.yaw);
  i.move.x = (fx * dz - fz * dx) * k;
  i.move.y = (fx * dx + fz * dz) * k;
}

function setHat(on: boolean): void {
  const e = env!;
  if (e.explorer.currentOutfit.hat === on) return;
  e.explorer.setOutfit({ hat: on });
  e.photo.refreshBody();
}

/** Flat hands (the sampeah, the bows) or his own. */
function openHands(on: boolean): void {
  const e = env!;
  if (on === handsOpen) return;
  handsOpen = on;
  if (on) {
    if (!hands) {
      const q = e.explorer.rig.quality;
      const mk = (side: 'L' | 'R') => {
        const p = JOINTS[`wrist${side}`].pivot;
        return buildVoxelMesh(buildHand(side, 'open'), { quality: q, offset: new Vector3(p[0], p[1], p[2]), castShadow: true, name: `listen:hand${side}` });
      };
      hands = { L: mk('L'), R: mk('R') };
    }
    e.explorer.rig.setSlotObject('handL', 'wristL', hands.L);
    e.explorer.rig.setSlotObject('handR', 'wristR', hands.R);
  } else {
    e.explorer.setHandPose('L', 'relaxed');
    e.explorer.setHandPose('R', 'relaxed');
  }
}

function showFace(f: 'happy' | null): void {
  if (f === face || !env) return;
  face = f;
  env.explorer.showFace(f);
}

/** It counts: once a listening (the toast at its end). */
function count(): void {
  if (counted) return;
  counted = true;
  progress.set('listen.count', progress.get('listen.count', 0, isNum) + 1);
}

/** The monk's chanting stops (fading). */
function quietMonk(): void {
  if (who === 'monk') stopListenChant();
}

/** The monks he came to listen to have stopped (the row ends or goes, the blessing monk is gone): nothing to kneel for. */
function monksGone(): boolean {
  if (who === 'monk') {
    const m = BLESS.monks[seat.id];
    return !m.there || BLESS.now - m.t > AWAY_FOR;
  }
  const r = LISTEN.rows[site.id];
  return !rowFresh(site.id) || r.ending || r.leaving || !r.chanting;
}

/** The monks stopped before he had knelt to listen: he does not go on (walking, turning: he stops; kneeling: back up). */
function giveUp(): void {
  if (step === 'go' || step === 'turn') end();
  else if (step === 'down' || step === 'settle') {
    go('back');
    tell('none', 0);
  }
}

/** He gets up: the three bows first (E again during them: up at once). */
function leaveOff(): void {
  if (step === 'turn' || step === 'go') {
    end();
    return;
  }
  if (step === 'down' || step === 'settle') {
    go('back');
    tell('none', 0);
    return;
  }
  if (step === 'listen') {
    if (heard >= COUNT_AFTER) count();
    startBows();
    return;
  }
  if (step === 'bow') {
    go('leave');
    return;
  }
}

/** Into the three bows (the prayer's own, eased into): the chanting over, or he leaves. */
function startBows(): void {
  quietMonk();
  ps.pray = BLESS_BOWS;
  ps.prayW = 0;
  go('bow');
}

/** All done (or stopped): his own pose, hands, face, hat; the monks let go; the toast once it counted. */
function end(): void {
  const e = env;
  if (!e) return;
  quietMonk();
  openHands(false);
  showFace(null);
  touchJump(null);
  if (hatTaken) {
    hatTaken = false;
    setHat(true);
  }
  e.explorer.animator.posture = null;
  e.explorer.animator.postureFeet = true;
  if (LISTEN.ask.state !== 'none') tell('none', 0);
  if (counted) {
    e.hud.toast(t('listenDone', { n: num(progress.get('listen.count', 1, isNum)) }));
    counted = false;
  }
  step = 'off';
  st = 0;
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

/** What he looks at: the monk's face, or the Buddha beyond the row. */
function lookPoint(out: Vector3): Vector3 {
  if (who === 'monk') return out.set(seat.x, seat.y + 1.25, seat.z);
  const b = site.buddha;
  siteWorld(site, b.a, b.d, _f);
  return out.set(_f.x, b.y, _f.z);
}

/** The posture's numbers reset, kneeling up (the prayer's shape at its kneel). */
function kneelUp(): void {
  ps.pray = BLESS_KNEEL;
  ps.prayW = 1;
  ps.rise = 1;
  ps.palms = ps.offer = ps.admire = ps.bowHead = ps.stepW = ps.lookW = 0;
}

function posed(on: boolean): void {
  const a = env!.explorer.animator;
  a.posture = on ? posture : null;
  a.postureFeet = !on;
}

/** A glance up now and then while he listens (0 bowed ‥ 1 looking up). */
function glance(s: number): number {
  const u = (s + GLANCE * 0.45) % GLANCE;
  return u > GLANCE_FOR ? 0 : Math.sin((Math.PI * u) / GLANCE_FOR) ** 2;
}

/** One step while it holds him. */
function stepListen(ctx: RoamCtx, dt: number): string | null {
  const e = env!;
  const { body } = ctx;
  st += dt;
  ps.t += dt;
  let prompt: string | null = pUp;
  if ((step === 'turn' || step === 'down' || step === 'settle') && !replaying) {
    away = monksGone() ? away + dt : 0;
    if (away > AWAY_FOR) {
      away = 0;
      giveUp();
      if ((step as Step) === 'off') return null;
    }
  }
  switch (step) {
    case 'turn': {
      const k = smooth(st / TURN_T);
      body.yaw = turnFrom + angleDiff(facing, turnFrom) * k;
      body.pos.lerpVectors(from, kneelAt, k);
      e.explorer.setMotion(k < 1 ? 0.6 : 0, true, 0);
      if (k >= 1) {
        body.yaw = facing;
        kneelUp();
        ps.pray = 0;
        posed(true);
        SFX.play('blessCloth', 0.8);
        go('down');
      }
      prompt = null;
      break;
    }
    case 'down':
      // The prayer's kneel (as at dak bat): the hat off on the way down.
      ps.pray = Math.min(BLESS_KNEEL, st * KNEEL_RATE);
      if (!hatTaken && ps.pray >= BLESS_HAT.off && e.explorer.currentOutfit.hat) {
        hatTaken = true;
        setHat(false);
      }
      if (ps.pray >= BLESS_KNEEL) {
        ps.prayW = 0;
        go('settle');
      }
      break;
    case 'settle':
      // Back on his heels, palms together at his face, looking up at the monks.
      ps.rise = 1 - over(st, 0, SETTLE_T);
      ps.palms = over(st, 0, SETTLE_T * 0.75);
      ps.lookW = 0.8 * over(st, 0, SETTLE_T);
      toBody(ctx, lookPoint(_v).x, _v.y, _v.z, ps.look);
      openHands(ps.palms > 0.45);
      if (st >= SETTLE_T) {
        tick = 0;
        go('listen');
      }
      break;
    case 'listen': {
      // On his heels, palms together, his head bowed; a glance up now and then.
      heard += dt;
      const g = glance(st);
      const down = over(st, 0.4, 2.4);
      ps.palms = 1;
      ps.rise = 0;
      ps.bowHead = LISTEN_BOW * down * (1 - g);
      ps.lookW = 0.8 - 0.6 * down * (1 - g);
      toBody(ctx, lookPoint(_v).x, _v.y, _v.z, ps.look);
      // The sound: the monk's chanting (fading out before its end), or the music stepping back for the row's.
      tick -= dt;
      const fading = who === 'monk' && st >= MONK_CHANT_FOR - FADE_BEFORE;
      if (tick <= 0 && !fading) {
        tick = TICK;
        SFX.play(who === 'monk' ? 'listenChant' : 'listenHush', 1);
      }
      if (fading && st - dt < MONK_CHANT_FOR - FADE_BEFORE) stopListenChant();
      // The end: the monk's chant is over, or the row ends (or is gone: built no more, far, for more than a moment).
      const r = LISTEN.rows[site.id];
      const fresh = rowFresh(site.id);
      const there = who === 'monk' ? BLESS.monks[seat.id].there && BLESS.now - BLESS.monks[seat.id].t < 1.5 : fresh && r.chanting;
      away = there || replaying ? 0 : away + dt;
      const done = (who === 'monk' ? st >= MONK_CHANT_FOR : r.ending && fresh && !replaying) || away > AWAY_FOR;
      if (done) {
        ended = true;
        // (the end counts if he heard some of it)
        if (heard >= END_COUNT) count();
        startBows();
      }
      break;
    }
    case 'bow': {
      // The prayer's three bows to the floor (its own keys, eased into), the temple bell at the first.
      const was = ps.pray;
      ps.pray = Math.min(BLESS_RISE, BLESS_BOWS + st * BOW_RATE);
      ps.prayW = over(st, 0, 0.45);
      openHands(ps.pray < PRAY_PALMS[1]);
      for (const b of PRAY.bows) if (was < b && ps.pray >= b) pad.rumble('tick', 0.35);
      if (was < PRAY.bows[0] && ps.pray >= PRAY.bows[0]) ctx.sound('enter', 0.3);
      // (a smile as he bows at the end: sathu)
      showFace(ended && st > 0.6 ? 'happy' : null);
      if (ps.pray >= BLESS_RISE) {
        SFX.play('blessCloth', 0.8);
        go('up');
      }
      break;
    }
    case 'up':
      ps.prayW = 1;
      ps.pray = Math.min(PRAY.duration, BLESS_RISE + st * KNEEL_RATE);
      openHands(false);
      if (hatTaken && ps.pray >= BLESS_HAT.on) {
        hatTaken = false;
        setHat(true);
      }
      prompt = null;
      if (ps.pray >= PRAY.duration - 0.05) {
        end();
        return null;
      }
      break;
    case 'leave': {
      // Up at once from the bows: the hands back, on his heels, then up the prayer's way.
      const k = Math.min(1, (dt / LEAVE_T) * 3);
      ps.rise += (0 - ps.rise) * k;
      ps.palms = Math.max(0, ps.palms - dt / LEAVE_T);
      ps.bowHead = Math.max(0, ps.bowHead - dt / LEAVE_T);
      ps.prayW = Math.max(0, ps.prayW - dt / LEAVE_T);
      openHands(ps.palms > 0.45);
      showFace(null);
      prompt = null;
      if (st >= LEAVE_T) {
        kneelUp();
        ps.pray = BLESS_RISE;
        ps.rise = 0;
        SFX.play('blessCloth', 0.8);
        go('up');
      }
      break;
    }
    case 'back':
      // (left off while kneeling down: back up the same way)
      ps.pray = Math.max(0, ps.pray - dt * KNEEL_RATE * 1.3);
      ps.palms = Math.max(0, ps.palms - dt * 2);
      ps.rise = Math.min(1, ps.rise + dt * 2);
      openHands(ps.palms > 0.45);
      if (hatTaken && ps.pray < BLESS_HAT.off) {
        hatTaken = false;
        setHat(true);
      }
      prompt = null;
      if (ps.pray <= 0) {
        end();
        return null;
      }
      break;
  }
  // The monks follow (the link): what he does, how far into it.
  if (step === 'turn' || step === 'down' || step === 'settle') tell('kneel', LISTEN.ask.state === 'kneel' ? LISTEN.ask.t + dt : 0);
  else if (step === 'listen') tell('listen', st);
  else if (step === 'bow' || step === 'up' || step === 'leave') tell('bow', LISTEN.ask.state === 'bow' ? LISTEN.ask.t + dt : 0);
  if (step !== 'turn') e.explorer.setMotion(0, true, 0);
  frame(ctx, dt);
  return prompt;
}

/** The way the camera looks: the row's from behind him on the side toward its middle (the village's carpet), the monk's over his left shoulder. */
function pickSide(): void {
  tall = !!env && env.canvas.clientHeight > env.canvas.clientWidth * 1.15;
  const side = tall ? site.cam.tall : site.cam.side;
  camYaw = facing + (who === 'row' ? side * (siteLocal(site, kneelAt.x, kneelAt.z, _l).a < 0 ? -1 : 1) : FRAME_MONK.side);
  framed = urlCam ? Infinity : 0;
}

/** The row's camera for this screen. */
function rowFrame(): typeof FRAME_ROW {
  return tall ? FRAME_ROW_TALL : FRAME_ROW;
}

/** The camera while he listens: the focus between him and the monks; eased round, then a slow drift until the player drags. */
function frame(ctx: RoamCtx, dt: number): void {
  const { cam, body } = ctx;
  const s = body.scale / 1.4;
  const F = who === 'row' ? rowFrame() : FRAME_MONK;
  // (toward the monks from him: the row's line straight ahead of him, or the monk on his dais)
  if (who === 'row') siteWorld(site, siteLocal(site, body.pos.x, body.pos.z, _l).a, site.row.d, _f);
  const tx = who === 'row' ? _f.x : seat.x;
  const tz = who === 'row' ? _f.z : seat.z;
  cam.focus.set(body.pos.x + (tx - body.pos.x) * F.toward, kneelAt.y + F.focusUp * s, body.pos.z + (tz - body.pos.z) * F.toward);
  const drift = step === 'listen' ? FRAME.drift * Math.sin((Math.PI * 2 * st) / FRAME.period) : 0;
  cam.behindYaw = camYaw + drift;
  cam.fov = FRAME.fov;
  before ??= { pitch: cam.pitch, distance: cam.distance };
  framed += dt;
  if (framed > FRAME.for && framed !== Infinity) {
    // (settled: the slow drift, the player's drag stops it)
    cam.yaw += angleDiff(camYaw + drift, cam.yaw) * (1 - Math.exp(-0.6 * dt));
    return;
  }
  if (framed === Infinity) return;
  const r = 1 - Math.exp(-FRAME.rate * dt);
  cam.yaw += angleDiff(camYaw + drift, cam.yaw) * r;
  cam.pitch += (F.pitch - cam.pitch) * r;
  cam.distance += (F.dist * s - cam.distance) * r;
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

/** The row whose middle is nearest `p`. */
function nearestRow(p: Vector3): ChantSite {
  let best = CHANT_SITES[0];
  let bd = Infinity;
  for (const s of CHANT_SITES) {
    siteWorld(s, 0, s.row.d, _f);
    const d = Math.hypot(_f.x - p.x, _f.z - p.z);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

// ── The add-on ───────────────────────────────────────────────────────────────

/** A still settles this long after a start from the URL without `sim=` (roam.ts `SETTLE`, s). */
const SETTLE = 0.8;
const URL_STEPS = ['kneel', 'listen', 'bow', 'up'] as const;

registerAddon({
  id: ID,
  order: ORDER,
  init(e) {
    env = e;
    Object.assign(window, {
      __listen: {
        now: () => ({ step, st: +st.toFixed(2), heard: +heard.toFixed(1), who, seat: seat.id, site: site.id, ask: { ...LISTEN.ask }, row: { ...LISTEN.rows[site.id] }, fresh: rowFresh(site.id), hat: e.explorer.currentOutfit.hat, hatTaken, count: progress.get('listen.count', 0, isNum) }),
        probe: () => ({ here: listenable({ body: e.body } as RoamCtx)?.who ?? null, busy: e.busy(), pos: e.body.pos.toArray(), grounded: e.body.grounded, row: CHANT_SITES.find((s) => inAsk(s, e.body.pos))?.id ?? null }),
        /** The camera: its orbit, where it is, and how far out the hard world lets it go (0‥1 of the way to the orbit). */
        cam: () => {
          const c = e.cam;
          const f = c.focus;
          const cp = Math.cos(c.pitch);
          const p = [f.x - Math.sin(c.yaw) * cp * c.distance, f.y + Math.sin(c.pitch) * c.distance, f.z - Math.cos(c.yaw) * cp * c.distance];
          const h = e.world.hardClearance ?? e.world.clearance;
          const at = (e.cam as unknown as { camera?: { position: Vector3 } }).camera?.position.toArray();
          return { focus: f.toArray(), yaw: +c.yaw.toFixed(3), pitch: +c.pitch.toFixed(3), distance: +c.distance.toFixed(2), want: p, at, free: h?.(f.x, f.y, f.z, p[0], p[1], p[2]) };
        },
      },
    });
  },

  get holding() {
    return step !== 'off' && step !== 'go';
  },

  get handsBusy() {
    return step !== 'off' && step !== 'go';
  },

  keys() {
    return step !== 'off' && step !== 'go' ? KEYS : null;
  },

  input(ctx, mode, tap) {
    if (mode !== 'walk' || !env) return false;
    const i = ctx.input;
    const pushing = Math.hypot(i.move.x, i.move.y) > STICK;
    const pushed = pushing && !pushHeld;
    pushHeld = pushing;
    if (step === 'off') {
      // J: kneel and listen where there is chanting to listen to (before the blessing monk, in the hall at the dawn chant).
      if (!tap('KeyJ') || env.busy() || !ctx.body.grounded) return false;
      const w = listenable(ctx);
      if (!w) return false;
      begin(ctx, w);
      return true;
    }
    if (step === 'go') {
      // (the player's own stick: never mind, and he walks on as he steers; Space, E or J: never mind, he stops)
      if (pushing) {
        tell('none', 0);
        step = 'off';
        return false;
      }
      if (i.jump || i.use || tap('KeyJ')) {
        tell('none', 0);
        step = 'off';
        // (taken: not a jump, the walker's E or J's sitting down this step)
        return true;
      }
      steer(ctx);
      return false;
    }
    // (a push of the stick once — held, it does not go on to skip the bows —, Space, E or J: up)
    if (pushed || i.jump || i.use || tap('KeyJ')) leaveOff();
    // (his input is the listening's meanwhile: no tool, no camera, no emote; the drag still looks round)
    ctx.cam.turn(i.lookYaw, i.lookPitch, i.zoom);
    if (i.lookYaw || i.lookPitch) framed = Infinity;
    return true;
  },

  offer(ctx, mode) {
    // (walking to his place: what he is about, no E — the pagoda door's "E  Pray" reaches into the hall)
    if (mode === 'walk' && step === 'go') return who === 'monk' ? pGoingMonk : pGoing;
    if (mode !== 'walk' || step !== 'off' || !env || env.busy()) return null;
    const s = rowHere(ctx.body.pos);
    if (!s) return null;
    const r = LISTEN.rows[s.id];
    if (r.there && !r.ending) return pAsk;
    // (the monks walking in to their places, or done and going: what is on, no E)
    return r.coming ? pComing : r.ending || r.leaving ? pOver : null;
  },

  use(ctx) {
    const w = listenable(ctx);
    if (!w || !env) return;
    begin(ctx, w);
  },

  hold(ctx, dt) {
    ctx.body.vel.set(0, 0, 0);
    ctx.body.grounded = true;
    return { prompt: stepListen(ctx, dt) };
  },

  after(ctx, mode, dt) {
    if (mode !== 'walk') return;
    if (step === 'off' || step === 'go') keepOffRow(ctx);
    if (step !== 'go') return;
    // (the monks stopped meanwhile: never mind)
    away = monksGone() ? away + dt : 0;
    if (away > AWAY_FOR) {
      away = 0;
      end();
      return;
    }
    // Walking to his place: there (or no nearer for a moment): he turns to the monks; too far still: never mind.
    goT += dt;
    const dist = Math.hypot(kneelAt.x - ctx.body.pos.x, kneelAt.z - ctx.body.pos.z);
    if (dist < goBest - 0.03) {
      goBest = dist;
      goSince = 0;
    } else goSince += dt;
    if (ctx.body.grounded && (dist < THERE || goSince > STALL || goT > GO_FOR)) {
      if (dist < 1.0) startTurn(ctx);
      else {
        tell('none', 0);
        step = 'off';
      }
    }
  },

  setMode(next) {
    // (off his feet, or back to the map: it stops at once)
    if (step !== 'off' && next !== 'walk') {
      end();
      restoreCam(null);
    }
  },

  frame(f: MapFrame, mode: RoamMode) {
    LISTEN.now = f.t;
    if (step === 'off' && before && mode === 'walk') restoreCam(f.dt);
  },

  fromUrl(q, ctx) {
    const v = q.get('listen');
    if (!v || !env) return;
    // Who: the URL's, else the monk before his dais, else the nearest row.
    const s = seatBefore(ctx.body.pos);
    const w = q.get('listenwho') ?? (s ? 'monk' : 'row');
    const target = w === 'monk' ? { who: 'monk' as const, seat: s ?? BLESS_SEATS[0] } : { who: 'row' as const, site: nearestRow(ctx.body.pos) };
    if (v === '1') {
      begin(ctx, target);
      return;
    }
    const [name, sec] = v.split(':');
    if (!(URL_STEPS as readonly string[]).includes(name)) return;
    const want: Step = name === 'kneel' ? 'settle' : (name as Step);
    // That far into the step at once, kneeling at his place, as the step would have him.
    begin(ctx, target);
    const at = sec !== undefined ? Number(sec) || 0 : 1;
    ctx.body.pos.copy(kneelAt);
    ctx.body.yaw = facing;
    hatTaken = env.explorer.currentOutfit.hat;
    setHat(false);
    kneelUp();
    ps.prayW = 0;
    ps.pray = NaN;
    ps.rise = 0;
    ps.palms = 1;
    posed(true);
    openHands(true);
    go(want);
    if (want === 'bow') {
      ended = true;
      ps.pray = BLESS_BOWS;
    }
    if (want === 'up') {
      ps.pray = BLESS_RISE;
      ps.prayW = 1;
    }
    // (run the step up to `at` — less the still's settling after, roam.ts `SETTLE`, when no `sim=` moves it on —, the
    // camera as it frames it unless the URL holds one)
    urlCam = q.has('rcam') || q.has('cam');
    pickSide();
    const steps = Math.round(Math.max(0, at - (q.has('sim') ? 0 : SETTLE)) / 0.05);
    replaying = true;
    for (let k = 0; k < steps && step === want; k++) stepListen(ctx, 0.05);
    replaying = false;
    if (!urlCam) {
      const cam = ctx.cam;
      before = { pitch: cam.pitch, distance: cam.distance };
      const F = who === 'row' ? rowFrame() : FRAME_MONK;
      cam.yaw = camYaw;
      cam.behindYaw = camYaw;
      cam.pitch = F.pitch;
      cam.distance = F.dist * (ctx.body.scale / 1.4);
      framed = FRAME.for;
    }
  },

  report(): Record<string, string> | null {
    if (step === 'off') return null;
    if (step === 'go') return { listen: '1', listenwho: who };
    const name = step === 'turn' || step === 'down' || step === 'settle' || step === 'back' ? 'kneel' : step === 'leave' ? 'up' : step;
    // (the row there too, whatever the clock of the repro: people/_sceneChant.ts)
    return who === 'row' ? { listen: `${name}:${st.toFixed(1)}`, listenwho: who, chantrow: '1' } : { listen: `${name}:${st.toFixed(1)}`, listenwho: who };
  },
});
