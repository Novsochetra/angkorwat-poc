import { Vector3 } from 'three';
import { BODY_UNIT_M, WALK_SPEED } from '../../world/scale';
import { SFX } from '../audio/addonSfx';
import '../audio/_gather';
import { actionOf, GATHER, gatherLeft, gatherRegrowIn, gatherSources, hitYOf, sourceOf, type GatherSpot } from '../build/gather';
import { BAG, CARRY_LIMIT, MATERIALS, MATERIAL_IDS, STORE, materialCount, materialsText, type GatherAction, type MaterialId } from '../build/materials';
import { DUST, FLY, Particles } from '../garden/_fxParticles';
import { HOME } from '../hamlet/_homePlan';
import { pad } from '../pad/pad';
import { progress } from '../progress';
import { TIME } from '../time';
import { BAMBOO_CUT } from '../veg/bambooCut';
import type { MapFrame, RoamMode } from '../types';
import { lang, num, t, type WordKey } from '../ui/lang';
import { ADDONS, registerAddon, touchJump, type AddonEnv, type AddonHold, type AddonKey } from './_addons';
import { registerBambooClumps } from './_gatherBamboo';
import { registerLogs } from './_gatherLogs';
import { registerThatch, thatchTick } from './_gatherThatch';
import { clayTick, registerClay } from './_gatherClay';
import { createGatherHud, type GatherHud } from './_gatherHud';
import { gatherLoadBuilder } from './_gatherLoad';
import { GatherLayer } from './_gatherLayer';
import { gatherPose, gatherToolBuilder, newGatherPose, SWING } from './_gatherPose';
import { byHouse } from './_buildSpots';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';
import { stepSound } from './walker';

/**
 * **Gathering building materials** (add-on `gather`, ticket AWP-9; the guide:
 * docs/map-work/addons.md "Gathering materials"). The core every gathering
 * source builds on: the materials, the bag and the home store
 * (build/materials.ts), the sources and their spots (build/gather.ts). This
 * module is the player's side: the E row, one swing per hit, the sounds and
 * chips, the load on screen, unloading at home, the URL.
 *
 * - **A spot** (a source's `GatherSpot`: a bamboo clump…) within reach, before
 *   him, on foot: "E  Cut bamboo" (the material's verb). None left: "None left: it
 *   grows back in 2 days" (no key); his load too heavy for one more: "Your load is
 *   full (12/12): take it home first"; the source says no (`can`): its words.
 * - **One hit is one swing**: E starts (the first swing at once); he steps up to
 *   it if he stood back, turns to it, the tool in his hand (the phkak knife to
 *   chop, the hoe to dig: _gatherPose.ts) and swings; each press of E (or Space;
 *   the pad's □ or ✕; the touch Use or the big button, which says "Chop") is
 *   another swing, one more waiting while one is under way. Each blow: the
 *   material's sound (audio/_gather.ts), chips of it flying (garden/_fxParticles.ts),
 *   a tick on the pad, the source's `onHit`. The spot's `hits` blows give one piece:
 *   it goes in his bag (`BAG.add`), a toast ("+1 bamboo pole · load 6/12"), the
 *   load chip glows. He keeps at it while the spot has more and his bag has room;
 *   the stick held away walks him out of it; back to the map, another mode: at once.
 * - **The load** (_gatherHud.ts): a chip under the purse while he carries
 *   something (each material, how many; the load against `CARRY_LIMIT`); "In my
 *   bag" on the explorer menu's Bag page lists it with what is at home.
 * - **Home**: his house his (`HOME.owned`), he comes by it on foot carrying
 *   something: his load is put down in his home store (`STORE`, a toast says what):
 *   the build card uses his bag and his store (roam/_build.ts).
 * - **Regrowing**: the gathering's clock (build/gather.ts `GATHER.advance`) runs
 *   here with the map's time while he plays (as the garden's: a day of the cycle,
 *   or `dayLength` s of play while the time stands still; sleep moves it on).
 *
 * The sources, registered from `init` (each draws what it has left its own way):
 * the jungle's bamboo clumps (_gatherBamboo.ts, AWP-10), the woodcutters' felled
 * trunks (_gatherLogs.ts, AWP-11), the sugar-palm village's young palms
 * (_gatherThatch.ts, AWP-12), the clay banks (_gatherClay.ts, AWP-13); later ones
 * (the ox cart AWP-14, a bamboo forest AWP-15) register themselves the same way
 * (`registerGatherSource`). The load on his back: _gatherLoad.ts.
 *
 * URL (shots and the dev server only, `env.shot || import.meta.env.DEV`: on the live site a link
 * never freezes him, never fills his bag or store, never spends a spot in his save):
 * `bag=<material>:<n>,…` · `store=<material>:<n>,…` · `gather=<material>[:<hits>[:<s>]]`
 * (at the nearest spot of it to `at=`: him at work, `hits` blows of the piece
 * already landed, held `s` seconds into a swing: the chips of a blow at `s` past
 * the blow) · `gatheract=chop|dig` (that swing there instead of its own: a pose's
 * check before its material has a source) · `gatherleft=<n>` (that spot has `n` pieces left) · `gatherdays=<d>` (then
 * the gathering's clock `d` game days on: grown back that far) · `gatherwork=0` (the spot only, him not at work) · `gatherunload=1`
 * (a shot unloads at home too). `report()` gives `bag=`, `store=`, `gather=`.
 * `window.__gather` (shots, the dev server): `state()`, `near(x, z, r)`, `advance(days)`. Console lines `[gather] …`.
 */

/** He reaches a spot's foot from this far (m, his feet to its foot circle), facing it. */
const REACH = 1.3;
/** He faces a spot well enough (cos of the angle to it). */
const FACING = 0.3;
/** Feet this much over or under a spot's ground: not that spot. */
const LEVEL = 1.6;
/** The blow lands this far before his feet (m, flat): he steps up to be so (no nearer than `NEAR`). */
const STAND = { at: 0.95, near: 0.6, far: 1.15 };
/** The stick held away this long (s) walks him out of it. */
const PUSH = 0.15;
/** After the last piece he could take, he lowers the tool and stops this long after (s). */
const LINGER = 0.45;
/** The camera at the work: round to his right, a little before him (rad from behind: the knife and the blow in view, not behind his body), tilt, distance (m), how far the focus goes toward the spot; eased over `for` s. */
const FRAME = { side: 1.75, pitch: 0.4, distance: 6.2, toward: 0.35, rate: 2.4, for: 1.6 };
/** He stands turned this much to his left of the spot (rad): the blow lands before his right hip, not behind his body. */
const TURN_LEFT = 0.45;
/** Chips a blow throws (chop, dig), their size (m) and life (s). */
const CHIPS = { chop: 10, dig: 11, axe: 12, size: [0.1, 0.19], life: [1.2, 1.8] } as const;

interface Session {
  readonly spot: GatherSpot;
  readonly action: GatherAction;
  phase: 'step' | 'turn' | 'work' | 'done';
  /** Blows of this piece landed. */
  n: number;
  /** Seconds into the swing under way (−1: none), one more pressed meanwhile. */
  swing: number;
  queued: boolean;
  /** Seconds of the stick held away; in this phase; since the work began. */
  push: number;
  t: number;
  life: number;
  /** Where he stands, the way he faces, where the blow lands (m, the map). */
  readonly stand: Vector3;
  face: number;
  readonly work: Vector3;
  /** Held still (a check's picture). */
  frozen: boolean;
  /** Pieces taken this time. */
  got: number;
}

let env: AddonEnv | null = null;
let hud: GatherHud | null = null;
let fx: Particles | null = null;
let S: Session | null = null;
const pose = newGatherPose();
const posture = () => gatherPose(pose);
let stepN = 0;
/** The spot within reach now (once a step) and the prompt. */
const near = { step: -1, spot: null as GatherSpot | null, prompt: null as string | null };
/** The camera before (eased back after), how long framed. */
let before: { pitch: number; distance: number } | null = null;
let framed = 0;
let lastStep = 0;
let touchShown: WordKey | 'hide' | null = null;
/** The gathering's clock: the map's days last frame, `TIME.skipped()` last frame (as the garden's). */
let lastDays = Number.NaN;
let lastSkipped = Number.NaN;
/** Shots: unload at home only when asked (`gatherunload=1`). */
let unloadInShot = false;

const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const _v = new Vector3();

// ── Words (made once a language and value: no string is made a frame) ──────────

let wordsLang = '';
const said = new Map<string, string>();
function words(key: string, make: () => string): string {
  if (lang() !== wordsLang) {
    wordsLang = lang();
    said.clear();
  }
  let s = said.get(key);
  if (s === undefined) {
    if (said.size > 400) said.clear();
    s = make();
    said.set(key, s);
  }
  return s;
}

const verbOf = (a: GatherAction): WordKey => (a === 'dig' ? 'gatherHitDig' : 'gatherHitChop');

// ── Spots near him ─────────────────────────────────────────────────────────

/** The spot within reach before him (or null): nearest, best faced. */
function spotNear(ctx: RoamCtx): GatherSpot | null {
  const b = ctx.body;
  const p = b.pos;
  const fx = Math.sin(b.yaw);
  const fz = Math.cos(b.yaw);
  let best: GatherSpot | null = null;
  let score = Infinity;
  for (const src of gatherSources())
    for (const s of src.spots()) {
      const dx = s.x - p.x;
      const dz = s.z - p.z;
      if (Math.abs(dx) > s.r + REACH + 1 || Math.abs(dz) > s.r + REACH + 1) continue;
      const d = Math.hypot(dx, dz);
      if (d - s.r > REACH) continue;
      const dot = d > 0.05 ? (dx * fx + dz * fz) / d : 1;
      if (dot < FACING) continue;
      if (Math.abs(ctx.world.field.heightAt(s.x, s.z) - p.y) > LEVEL) continue;
      const sc = d - s.r - dot * 0.5;
      if (sc < score) {
        score = sc;
        best = s;
      }
    }
  return best;
}

/** Why he cannot gather `s` now (words with no key), or null. */
function whyNot(ctx: RoamCtx, s: GatherSpot): string | null {
  const m = s.material;
  if (gatherLeft(s) <= 0) {
    const days = Math.ceil(gatherRegrowIn(s));
    const w = sourceOf(s)?.spent ?? { days: 'gatherSpent', soon: 'gatherSpentSoon' };
    return days <= 1 ? words(`soon|${w.soon}`, () => t(w.soon)) : words(`spent|${w.days}|${days}`, () => t(w.days, { n: num(days) }));
  }
  const r = sourceOf(s)?.can?.(s, { x: ctx.body.pos.x, y: ctx.body.pos.y, z: ctx.body.pos.z, night: ctx.night });
  if (r) return words(`can|${r}`, () => t(r));
  if (BAG.room(m) < 1) {
    const load = BAG.load();
    return words(`full|${load}`, () => t(load >= CARRY_LIMIT ? 'gatherFull' : 'gatherHeavy', { n: num(load), max: num(CARRY_LIMIT) }));
  }
  return null;
}

function nearNow(ctx: RoamCtx): void {
  if (near.step === stepN) return;
  near.step = stepN;
  near.spot = spotNear(ctx);
  near.prompt = null;
  if (!near.spot) return;
  const s = near.spot;
  near.prompt = whyNot(ctx, s) ?? words(`go|${s.material}`, () => `E  ${t(MATERIALS[s.material].verb)}`);
}

/** Another add-on has his hands (the shoulder pole, the umbrella…). */
const handsTaken = (): boolean => ADDONS.some((a) => a.id !== 'gather' && (a.handsBusy || a.holding));

// ── The work ───────────────────────────────────────────────────────────────

/** World → his own space (BU): x his left, y up from his soles, z ahead. */
function toBody(ctx: RoamCtx, x: number, y: number, z: number, out: Vector3): Vector3 {
  const b = ctx.body;
  const k = 1 / (BODY_UNIT_M * b.scale);
  const dx = x - b.pos.x;
  const dz = z - b.pos.z;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return out.set((dx * c - dz * s) * k, (y - b.pos.y) * k, (dx * s + dz * c) * k);
}

/** Where he stands for `spot` from (x, z), facing its middle, and where the blow lands: into the session's vectors. */
function placeFor(ctx: RoamCtx, s: Session, x: number, z: number): void {
  const sp = s.spot;
  let dx = x - sp.x;
  let dz = z - sp.z;
  let d = Math.hypot(dx, dz);
  if (d < 0.05) {
    dx = 0;
    dz = 1;
    d = 1;
  }
  dx /= d;
  dz /= d;
  // (a bank: he stands on its land side; a trunk lying: across it, on the side he comes from)
  if (sp.stand !== undefined) {
    dx = Math.sin(sp.stand);
    dz = Math.cos(sp.stand);
  } else if (sp.along !== undefined) {
    const px = Math.cos(sp.along);
    const pz = -Math.sin(sp.along);
    const k = dx * px + dz * pz >= 0 ? 1 : -1;
    dx = px * k;
    dz = pz * k;
  }
  // (the blow on the foot circle toward him; he stands `STAND.at` back from it, unless already in [near, far] of it)
  const wx = sp.x + dx * sp.r;
  const wz = sp.z + dz * sp.r;
  const now = d - sp.r;
  const at = now >= STAND.near && now <= STAND.far ? now : STAND.at;
  s.stand.set(wx + dx * at, 0, wz + dz * at);
  // (turned a little to his left: the blow lands before his right hip, where the knife comes down, in the camera's view)
  s.face = Math.atan2(-dx, -dz) + TURN_LEFT;
  s.work.set(wx, ctx.world.field.heightAt(wx, wz) + hitYOf(sp), wz);
}

function settle(ctx: RoamCtx, dt: number): void {
  const p = ctx.body.pos;
  const land = ctx.world.field.heightAt(p.x, p.z);
  const top = ctx.world.groundAt(p.x, p.z);
  const y = top - land < 0.3 ? top : land;
  p.y += (y - p.y) * (dt > 0 ? damp(14, dt) : 1);
}

/** A step or two toward `goal` (m), turning to the way; footsteps. True once there. */
function walkTo(ctx: RoamCtx, goal: Vector3, dt: number): boolean {
  const b = ctx.body;
  const p = b.pos;
  const dx = goal.x - p.x;
  const dz = goal.z - p.z;
  const d = Math.hypot(dx, dz);
  const v = d > 0.04 ? Math.min(WALK_SPEED * b.scale * 0.9, 0.4 + d * 3) : 0;
  if (d > 0.04) {
    const k = Math.min(d, v * dt) / d;
    p.x += dx * k;
    p.z += dz * k;
    b.yaw += angleDiff(Math.atan2(dx, dz), b.yaw) * damp(10, dt);
  }
  settle(ctx, dt);
  b.explorer.setMotion(v / b.scale, true, 0);
  const phase = b.explorer.animator.phase;
  if (v > 0.25) {
    const crossed = (q: number) => (lastStep < q && phase >= q) || (phase < lastStep && (lastStep < q || phase >= q));
    if (crossed(0.25) || crossed(0.75)) ctx.sound(stepSound(ctx.world, p.x, ctx.world.field.heightAt(p.x, p.z), p.z), 0.45 + v * 0.1);
  }
  lastStep = phase;
  return d <= 0.04;
}

function setPose(on: boolean): void {
  const ex = env?.explorer;
  if (!ex) return;
  if (on) {
    ex.animator.posture = posture;
    ex.animator.postureFeet = true;
  } else if (ex.animator.posture === posture) {
    ex.animator.posture = null;
    ex.animator.postureFeet = true;
  }
}

let toolShown: GatherAction | null = null;
function tool(a: GatherAction | null): void {
  const ex = env?.explorer;
  if (!ex || a === toolShown) return;
  toolShown = a;
  if (a) ex.rig.setSlot('gatherTool', 'propR', gatherToolBuilder(a));
  else ex.rig.clearSlot('gatherTool');
}

/** The load on his back as last drawn: the bag's version, his pack on or not. */
let loadShown = '';
/** His back load (roam/_gatherLoad.ts) drawn again when the bag (or his pack) changed. */
function backLoad(): void {
  const ex = env?.explorer;
  if (!ex) return;
  const pack = !!ex.rig.getSlot('pack');
  const key = `${BAG.version}|${pack}`;
  if (key === loadShown) return;
  loadShown = key;
  const b = gatherLoadBuilder(BAG.all(), pack);
  if (b) ex.rig.setSlot('gatherLoad', 'backpack', b);
  else ex.rig.clearSlot('gatherLoad');
}

function touch(want: WordKey | 'hide' | null): void {
  if (want === touchShown) return;
  touchShown = want;
  touchJump(want);
}

/** Chips of the material flying off the blow (seeded by the spot and the blow: the same picture every time); `age` s on already. */
function chips(s: Session, age = 0): void {
  if (!fx) return;
  const m = MATERIALS[s.spot.material];
  const w = s.work;
  const floor = env ? env.world.field.heightAt(w.x, w.z) : w.y;
  fx.reseed((s.spot.x * 13.1 + s.spot.z * 7.7 + s.n * 3.3 + s.got * 17.9) % 1000);
  // (they fly back toward him and to the sides: away from the cane, the way the blade comes out)
  const bx = Math.sin(s.face + Math.PI);
  const bz = Math.cos(s.face + Math.PI);
  const n = CHIPS[s.action];
  for (let i = 0; i < n; i++) {
    const a = (fx.rnd() - 0.5) * 2.2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const sp = 1.2 + fx.rnd() * 1.6;
    const vx = (bx * c - bz * sn) * sp;
    const vz = (bx * sn + bz * c) * sp;
    const size = CHIPS.size[0] + fx.rnd() * (CHIPS.size[1] - CHIPS.size[0]);
    const long = s.action === 'dig' ? 1 : 1.8;
    fx.spawn(FLY, w.x, w.y + 0.05, w.z, vx, 1.8 + fx.rnd() * 2, vz, size * long, size * 0.6, size, m.chips[i % m.chips.length], CHIPS.life[0] + fx.rnd() * (CHIPS.life[1] - CHIPS.life[0]), floor);
  }
  if (s.action === 'dig')
    for (let i = 0; i < 3; i++) fx.spawn(DUST, w.x + (fx.rnd() - 0.5) * 0.4, floor + 0.1, w.z + (fx.rnd() - 0.5) * 0.4, 0, 0.4, 0, 0.3, 0.2, 0.3, 0xb89a78, 0.9, floor);
  if (age > 0) fx.step(age);
}

/** A blow lands. */
function blow(ctx: RoamCtx, s: Session): void {
  s.n++;
  SFX.play(`gatherHit:${s.spot.material}`, 0.75 + 0.25 * ((s.n * 7) % 5) / 4);
  pad.rumble('tick', 0.35);
  chips(s);
  try {
    sourceOf(s.spot)?.onHit?.(s.spot, s.n, s.spot.hits);
  } catch (e) {
    console.error('[gather] onHit failed:', e);
  }
  if (s.n < s.spot.hits) return;
  // The piece comes off: into his bag.
  s.n = 0;
  const m = s.spot.material;
  if (BAG.room(m) < 1 || !GATHER.take(s.spot)) {
    s.phase = 'done';
    s.t = 0;
    return;
  }
  BAG.add(m, 1);
  s.got++;
  SFX.play('gatherGot', 0.9);
  pad.rumble('bump', 0.4);
  hud?.pop();
  ctx.hud.toast(t('gatherGot', { what: materialCount(m, 1), n: num(BAG.load()), max: num(CARRY_LIMIT) }));
  console.info(`[gather] +1 ${m} from ${s.spot.id} (${gatherLeft(s.spot)} left there), bag ${JSON.stringify(BAG.all())} load ${BAG.load()}/${CARRY_LIMIT}`);
  // (no more here, or no room: he lowers the tool and stops)
  if (gatherLeft(s.spot) <= 0 || BAG.room(m) < 1) {
    s.phase = 'done';
    s.t = 0;
    if (BAG.room(m) < 1) SFX.play('gatherFull', 0.8);
  }
}

/** Stop now: the tool put away, the posture off, the camera eased back. */
function finish(ctx: RoamCtx | null): void {
  if (!S) return;
  S = null;
  pose.k = 0;
  pose.s = -1;
  setPose(false);
  tool(null);
  touch(null);
  if (ctx) ctx.body.explorer.setMotion(0, true, 0);
}

/** Tell the spot's source he works it from (x, z) (the side that goes first). */
function worksFrom(spot: GatherSpot, x: number, z: number): void {
  try {
    sourceOf(spot)?.onWork?.(spot, x, z);
  } catch (e) {
    console.error('[gather] onWork failed:', e);
  }
}

/** Begin at `spot` (E). */
function start(ctx: RoamCtx, spot: GatherSpot, frozen = false): Session {
  finish(ctx);
  const s: Session = {
    spot,
    action: actionOf(spot),
    phase: 'step',
    n: 0,
    swing: -1,
    queued: true,
    push: 0,
    t: 0,
    life: 0,
    stand: new Vector3(),
    face: 0,
    work: new Vector3(),
    frozen,
    got: 0,
  };
  placeFor(ctx, s, ctx.body.pos.x, ctx.body.pos.z);
  if (Math.hypot(s.stand.x - ctx.body.pos.x, s.stand.z - ctx.body.pos.z) < 0.08) s.phase = 'turn';
  worksFrom(spot, ctx.body.pos.x, ctx.body.pos.z);
  S = s;
  pose.action = s.action;
  pose.s = -1;
  before ??= { pitch: ctx.cam.pitch, distance: ctx.cam.distance };
  framed = 0;
  ctx.body.vel.set(0, 0, 0);
  touch(verbOf(s.action));
  console.info(`[gather] at ${spot.id} (${spot.material}, ${gatherLeft(spot)} of ${spot.pieces} left, ${spot.hits} hits a piece)`);
  return s;
}

/** The camera: round to his side at the work, the spot in view (eased for a while; the player's after). */
function frameCam(ctx: RoamCtx, s: Session, dt: number): void {
  const { cam, body: b, input } = ctx;
  const h = 1.7 * b.scale;
  if (input.lookYaw || input.lookPitch || input.zoom) framed = FRAME.for;
  const k = dt > 0 ? damp(4, dt) : 1;
  cam.focus.x += (b.pos.x + (s.work.x - b.pos.x) * FRAME.toward - cam.focus.x) * k;
  cam.focus.z += (b.pos.z + (s.work.z - b.pos.z) * FRAME.toward - cam.focus.z) * k;
  cam.focus.y += (b.pos.y + h * 0.55 - cam.focus.y) * (dt > 0 ? damp(6, dt) : 1);
  cam.behindYaw = b.yaw;
  cam.follow = 0;
  if (framed >= FRAME.for) return;
  framed += dt;
  const e = dt > 0 ? damp(FRAME.rate, dt) : 1;
  // (round to his right: the side of the tool)
  cam.yaw += angleDiff(b.yaw + FRAME.side, cam.yaw) * e;
  cam.pitch += (FRAME.pitch - cam.pitch) * e;
  cam.distance += (Math.min(Math.max(FRAME.distance, cam.minDistance), cam.maxDistance) - cam.distance) * e;
}

const KEYS: Record<GatherAction, readonly AddonKey[]> = {
  chop: [
    ['E', 'gatherHitChop', 'west'],
    ['W A S D', 'gatherKeyStop', 'lstick'],
    ['Q R', 'rLook', 'rstick'],
  ],
  dig: [
    ['E', 'gatherHitDig', 'west'],
    ['W A S D', 'gatherKeyStop', 'lstick'],
    ['Q R', 'rLook', 'rstick'],
  ],
  axe: [
    ['E', 'gatherHitChop', 'west'],
    ['W A S D', 'gatherKeyStop', 'lstick'],
    ['Q R', 'rLook', 'rstick'],
  ],
};

/** The prompt while he works: "E  Chop (2/4)". */
const workWords = (s: Session): string =>
  words(`hit|${s.action}|${s.n}|${s.spot.hits}`, () => `E  ${t('gatherHitting', { verb: t(verbOf(s.action)), n: num(s.n), of: num(s.spot.hits) })}`);

function hold(ctx: RoamCtx, dt: number): AddonHold {
  const s = S;
  if (!s || !env) return { prompt: null };
  const { body: b, input } = ctx;
  const ex = b.explorer;
  ctx.cam.turn(input.lookYaw, input.lookPitch, input.zoom);
  if (ex.foodHeld) {
    finish(ctx);
    return { prompt: null };
  }
  // The stick held away walks him out of it (on his way to it: at once).
  const push = Math.hypot(input.move.x, input.move.y) > 0.5;
  s.push = push ? s.push + dt : 0;
  if (push && (s.frozen || s.phase !== 'work' || s.push > PUSH)) {
    finish(ctx);
    return { prompt: null };
  }
  const press = !s.frozen && (input.use || input.jump);
  if (press) {
    if (s.phase === 'work' && s.swing < 0) s.swing = 0;
    else if (s.phase !== 'done') s.queued = true;
  }
  s.t += dt;
  s.life += dt;
  pose.life = s.life;
  switch (s.phase) {
    case 'step': {
      pose.k = Math.max(0, pose.k - dt * 4);
      if (walkTo(ctx, s.stand, dt) || s.t > 3) {
        s.phase = 'turn';
        s.t = 0;
      }
      break;
    }
    case 'turn': {
      settle(ctx, dt);
      ex.setMotion(0, true, 0);
      b.yaw += angleDiff(s.face, b.yaw) * damp(12, dt);
      tool(s.action);
      if (Math.abs(angleDiff(s.face, b.yaw)) < 0.08 || s.t > 1) {
        b.yaw = s.face;
        s.phase = 'work';
        s.t = 0;
        setPose(true);
      }
      break;
    }
    case 'work':
    case 'done': {
      settle(ctx, dt);
      ex.setMotion(0, true, 0);
      b.vel.set(0, 0, 0);
      setPose(true);
      tool(s.action);
      pose.k = s.phase === 'done' && s.swing < 0 ? Math.max(0, pose.k - dt * 3) : Math.min(1, pose.k + dt * 4);
      if (!s.frozen) {
        if (s.swing < 0 && s.queued && s.phase === 'work') {
          s.swing = 0;
          s.queued = false;
        }
        if (s.swing >= 0) {
          const w = SWING[s.action];
          const was = s.swing;
          s.swing += dt;
          // (the swish as the tool comes down; the blow as it lands)
          if (was < w.up && s.swing >= w.up) SFX.play('gatherSwish', 0.8);
          if (was < w.hit && s.swing >= w.hit) blow(ctx, s);
          if (s.swing >= w.len) s.swing = -1;
        }
      }
      pose.s = s.swing;
      toBody(ctx, s.work.x, s.work.y, s.work.z, _v);
      pose.work.lerp(_v, s.frozen ? 1 : damp(10, dt));
      if (s.phase === 'done' && s.swing < 0 && s.t > LINGER && pose.k <= 0.05) {
        finish(ctx);
        return { prompt: null };
      }
      break;
    }
  }
  if (S) frameCam(ctx, s, dt);
  return { prompt: s.phase === 'work' ? workWords(s) : null };
}

// ── Home: the load put down ────────────────────────────────────────────────

function unloadAtHome(ctx: RoamCtx): void {
  const all = BAG.all();
  const what = materialsText(all);
  for (const m of MATERIAL_IDS) {
    const n = BAG.count(m);
    if (n > 0) STORE.add(m, BAG.take(m, n));
  }
  SFX.play('gatherUnload', 0.9);
  hud?.pop();
  ctx.hud.toast(t('gatherUnloaded', { what }));
  console.info(`[gather] unloaded at home: ${JSON.stringify(all)}; the store has ${JSON.stringify(STORE.all())}`);
}

// ── The URL ────────────────────────────────────────────────────────────────

/** `bag=bamboo:4,clay:1` into `into` (emptied first). */
function fillFrom(q: string, into: typeof BAG | typeof STORE, what: string): void {
  into.clear();
  if (q === '0') return;
  for (const part of q.split(',')) {
    const [m, n] = part.split(':');
    if (!(m in MATERIALS)) {
      console.warn(`[gather] ${what}=: no material "${m}" (${MATERIAL_IDS.join(', ')})`);
      continue;
    }
    const want = Math.max(0, Math.floor(Number(n ?? 1) || 0));
    const got = into.add(m as MaterialId, want);
    if (got < want) console.warn(`[gather] ${what}=: only ${got} of ${want} ${m} fit (the carry limit, ${CARRY_LIMIT})`);
  }
}

/** The nearest spot of `m` to (x, z), or null. */
function nearestOf(m: MaterialId, x: number, z: number): GatherSpot | null {
  let best: GatherSpot | null = null;
  let bd = Infinity;
  for (const src of gatherSources())
    for (const s of src.spots()) {
      if (s.material !== m) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
  return best;
}

/** A check's picture: him at work at `spot`, `n` blows of the piece landed, held `sw` s into a swing (or ready). */
function freeze(ctx: RoamCtx, spot: GatherSpot, n: number, sw: number | null): void {
  const s = start(ctx, spot, true);
  const b = ctx.body;
  b.pos.set(s.stand.x, 0, s.stand.z);
  b.pos.y = ctx.world.groundAt(b.pos.x, b.pos.z);
  // (stood again from where he stands now: the blow on the foot circle toward him)
  placeFor(ctx, s, b.pos.x, b.pos.z);
  b.yaw = s.face;
  s.phase = 'work';
  s.n = Math.max(0, Math.min(spot.hits - 1, n));
  s.swing = sw === null ? -1 : Math.max(0, Math.min(SWING[s.action].len - 0.001, sw));
  s.queued = false;
  pose.k = 1;
  pose.s = s.swing;
  pose.life = 1;
  toBody(ctx, s.work.x, s.work.y, s.work.z, pose.work);
  setPose(true);
  tool(s.action);
  // (a blow already landed in this swing: its chips that far on)
  const hitAt = SWING[s.action].hit;
  if (sw !== null && sw >= hitAt) chips(s, sw - hitAt);
  const ex = b.explorer;
  ex.object.position.copy(b.pos);
  ex.object.rotation.set(0, b.yaw, 0);
  for (let i = 0; i < 40; i++) ex.update(1 / 30);
  const rc = ctx.start.get('rcam')?.split(',').map(Number);
  const cam = ctx.cam;
  cam.yaw = b.yaw + (rc && Number.isFinite(rc[0]) ? (rc[0] * Math.PI) / 180 : FRAME.side);
  cam.pitch = rc && Number.isFinite(rc[1]) ? (rc[1] * Math.PI) / 180 : FRAME.pitch;
  cam.distance = rc && rc[2] ? rc[2] : FRAME.distance;
  framed = FRAME.for;
  cam.focus.set(b.pos.x + (s.work.x - b.pos.x) * FRAME.toward, b.pos.y + 1.7 * b.scale * 0.55, b.pos.z + (s.work.z - b.pos.z) * FRAME.toward);
  console.info(`[gather] check: at ${spot.id}, ${s.n}/${spot.hits} blows, ${sw === null ? 'ready' : `${sw.toFixed(2)} s into the swing`}, him at (${b.pos.x.toFixed(1)}, ${b.pos.z.toFixed(1)}) facing ${((b.yaw * 180) / Math.PI).toFixed(0)}°`);
}

registerAddon({
  id: 'gather',
  order: 60,
  get holding() {
    return S !== null;
  },
  get handsBusy() {
    return S !== null;
  },
  init(e) {
    env = e;
    const n = registerBambooClumps();
    let logs = 0;
    try {
      logs = registerLogs(e.world.field, e.scene);
    } catch (err) {
      console.error('[gather] the woodcutters\' logs failed:', err);
    }
    let young = 0;
    try {
      young = registerThatch(e.world.field, e.scene);
    } catch (err) {
      console.error('[gather] the young sugar palms failed:', err);
    }
    let banks = 0;
    try {
      banks = registerClay(e.world.field, e.scene);
    } catch (err) {
      console.error('[gather] the clay banks failed:', err);
    }
    hud = createGatherHud(e.layer);
    fx = new Particles();
    fx.mesh.name = 'gather:chips';
    e.scene.add(fx.mesh);
    const dev = e.shot || import.meta.env.DEV;
    // (a shot's or a check's bag and store, before the first frame: never on the live site, where a link would
    // replace the player's own)
    const qb = e.params.get('bag');
    if (dev && qb !== null) fillFrom(qb, BAG, 'bag');
    const qs = e.params.get('store');
    if (dev && qs !== null) fillFrom(qs, STORE, 'store');
    unloadInShot = dev && e.params.get('gatherunload') === '1';
    console.info(`[gather] ${n} bamboo clumps to cut, ${logs} logs at the woodcutters' camp, ${young} young sugar palms, ${banks} clay banks · bag ${JSON.stringify(BAG.all())} (load ${BAG.load()}/${CARRY_LIMIT}) · home store ${JSON.stringify(STORE.all())}${progress.saving ? '' : ' (not saved: a shot or progress=0)'}`);
    if (dev)
      Object.assign(window, {
        __gather: {
          state: () => ({
            bag: BAG.all(),
            load: BAG.load(),
            limit: CARRY_LIMIT,
            store: STORE.all(),
            clock: +GATHER.clock.toFixed(4),
            near: near.spot ? { id: near.spot.id, left: gatherLeft(near.spot), prompt: near.prompt } : null,
            work: S ? { spot: S.spot.id, phase: S.phase, n: S.n, hits: S.spot.hits, swing: +S.swing.toFixed(3), queued: S.queued, got: S.got } : null,
            saving: progress.saving,
            sources: gatherSources().map((src) => ({ id: src.id, spots: src.spots().length })),
            bambooCut: { ...BAMBOO_CUT.stats },
          }),
          near: (x: number, z: number, r = 30) =>
            gatherSources()
              .flatMap((src) => src.spots())
              .filter((s) => Math.hypot(s.x - x, s.z - z) < r)
              .map((s) => ({ id: s.id, x: +s.x.toFixed(2), z: +s.z.toFixed(2), r: s.r, left: gatherLeft(s), material: s.material })),
          advance: (days: number) => GATHER.advance(days),
        },
      });
  },
  offer(ctx, m) {
    stepN++;
    if (m !== 'walk' || !env || S || env.busy() || handsTaken()) return null;
    nearNow(ctx);
    return near.prompt;
  },
  use(ctx) {
    if (!env || S) return;
    nearNow(ctx);
    const s = near.spot;
    if (!s || whyNot(ctx, s)) {
      SFX.play('gatherFull', 0.6);
      return;
    }
    start(ctx, s);
  },
  hold(ctx, dt) {
    return hold(ctx, dt);
  },
  keys() {
    return S ? KEYS[S.action] : null;
  },
  after(ctx, m, dt) {
    // The load chip: carrying something, or at work (not in the overview).
    hud?.set(m !== 'overview' && (!BAG.empty || S !== null));
    // Home: his load put down in his store as he comes by his house on foot.
    if (m === 'walk' && !S && HOME.owned && !BAG.empty && env && (!env.shot || unloadInShot) && !env.busy()) {
      const p = ctx.body.pos;
      if (byHouse(p.x, p.z, 3) && p.y - ctx.world.field.heightAt(p.x, p.z) < 0.9) unloadAtHome(ctx);
    }
    // The camera eased back after the work (unless the player moved it).
    if (S || !before) return;
    const cam = ctx.cam;
    if (ctx.input.lookPitch || ctx.input.zoom) {
      before = null;
      return;
    }
    const k = damp(1.6, dt);
    cam.pitch += (before.pitch - cam.pitch) * k;
    cam.distance += (before.distance - cam.distance) * k;
    if (Math.abs(before.pitch - cam.pitch) < 0.005 && Math.abs(before.distance - cam.distance) < 0.05) before = null;
  },
  frame(f: MapFrame, m: RoamMode) {
    const dt = f.dt > 0 ? f.dt : 0;
    fx?.step(dt);
    backLoad();
    thatchTick(dt);
    clayTick(dt);
    GatherLayer.frame(f.camera.position);
    // The gathering's clock: the map's days as they run (sleep moves them on), else a day each `dayLength` s of play
    // (as the garden's, roam/_garden.ts). Not in a shot (still) nor on the overview.
    const days = TIME.days();
    const played = dt / TIME.dayLength;
    const sk = TIME.skipped();
    const jumped = Number.isNaN(lastSkipped) ? 0 : Math.max(0, sk - lastSkipped);
    let d = 0;
    if (TIME.cycling()) d = Number.isNaN(lastDays) ? 0 : Math.min(days - lastDays, played * 1.5 + jumped);
    else d = played;
    lastSkipped = sk;
    lastDays = days;
    if (env && !env.shot && m !== 'overview' && d > 0) GATHER.advance(Math.min(d, 2));
  },
  setMode(next, _prev, ctx) {
    finish(ctx);
    if (next === 'overview') before = null;
  },
  fromUrl(q, ctx) {
    // (checks only: in a shot or on the dev server; on the live site a link never freezes him nor changes his save)
    if (!env || !(env.shot || import.meta.env.DEV)) return;
    const g = q.get('gather');
    if (!g) return;
    const [m, n, sw] = g.split(':');
    if (!(m in MATERIALS)) {
      console.warn(`[gather] gather=: no material "${m}" (${MATERIAL_IDS.join(', ')})`);
      return;
    }
    const found = nearestOf(m as MaterialId, ctx.body.pos.x, ctx.body.pos.z);
    // (`gatheract=chop|dig`: that swing at it, to check a pose before its material's source exists)
    const act = q.get('gatheract');
    const spot = found && (act === 'chop' || act === 'dig' || act === 'axe') ? { ...found, action: act as GatherAction } : found;
    if (!spot) {
      console.warn(`[gather] gather=: no spot of ${m} (sources: ${gatherSources().map((s) => s.id).join(', ') || 'none'})`);
      return;
    }
    const left = q.get('gatherleft');
    if (left !== null) {
      worksFrom(spot, ctx.body.pos.x, ctx.body.pos.z);
      GATHER.setLeft(spot, Number(left));
    }
    // (`gatherdays=<d>`: the gathering's clock that many game days on: what was taken grows back that far)
    const days = Number(q.get('gatherdays'));
    if (days > 0 && Number.isFinite(days)) GATHER.advance(Math.min(days, 100));
    // (`gatherwork=0`: the spot only, him not put to work at it)
    if (q.get('gatherwork') === '0') return;
    freeze(ctx, spot, Number(n) || 0, sw !== undefined && sw !== '' ? Number(sw) || 0 : null);
  },
  report() {
    const out: Record<string, string> = {};
    const list = (o: Partial<Record<MaterialId, number>>) =>
      Object.entries(o)
        .map(([m, n]) => `${m}:${n}`)
        .join(',');
    if (!BAG.empty) out.bag = list(BAG.all());
    if (!STORE.empty) out.store = list(STORE.all());
    if (S) out.gather = `${S.spot.material}:${S.n}${S.swing >= 0 ? `:${S.swing.toFixed(2)}` : ''}`;
    return Object.keys(out).length ? out : null;
  },
});
