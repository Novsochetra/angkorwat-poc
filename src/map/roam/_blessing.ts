import { InstancedMesh, Matrix4, Vector3, type Group } from 'three';
import { BLESS_BOWS, BLESS_HAT, BLESS_KNEEL, BLESS_RISE, blessPose, blessState } from '../../character/blessing';
import { PRAY, PRAY_PALMS } from '../../character/clips';
import { buildHand } from '../../character/parts/limbs';
import { wearRedString } from '../../character/redString';
import { JOINTS } from '../../character/skeleton';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { BODY_UNIT_M } from '../../world/scale';
import '../audio/_bless';
import { SFX } from '../audio/addonSfx';
import { registerEvent } from '../calendar';
import { festivalAt, festivalNow } from '../festival/_schedule';
import { pad } from '../pad/pad';
import { progress } from '../progress';
import { PAGODA } from '../village/_spots';
import type { MapFrame, RoamMode } from '../types';
import { onLang, t, type WordKey } from '../ui/lang';
import { registerAddon, type AddonEnv } from './_addons';
import { BLESS, BLESS_SCRIPT, BLESS_SEATS, blessHour, CHANT_FOR, SCRIPT_AT, seatBefore, seatFront, TIE, type BlessBox, type BlessSeat, type BlessState } from './_blessingHooks';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * A monk's blessing with the red string (ការចងអំបោះក្រហម), as Cambodians
 * receive it at the pagoda. A monk sits by day on his dais (people/
 * _sceneBlessing.ts; the link `BLESS`: roam/_blessingHooks.ts, its seats
 * `BLESS_SEATS`) in the floating village pagoda's hall, and another on Phnom
 * Kulen's rock floor by the reclining Buddha's head; a silver bowl of lustral
 * water with a sprig in it by his right knee, a ball of red cotton string by
 * his left.
 *
 * - **Ask** (on foot before his dais, while he sits there: by day, not at his
 *   meal; in the village not at Pchum Ben or Visak Bochea): "E  សុំពរពីព្រះសង្ឃ /
 *   Ask for a blessing" (a pad's □ / X, the touch Use button); beside it "J  Kneel
 *   and listen" (he kneels and the monk chants for him: roam/_listen.ts). By the
 *   empty dais it says why (night, his meal, a festival), no E.
 * - **The blessing**: he walks to the place before the dais (the stick or
 *   Space: never mind), turns to the monk, takes his hat off and kneels (the
 *   prayer's kneel), sits back on his heels, palms together at his face. The
 *   monk chants the Pali blessing (audio/_bless.ts `blessChant`), takes the
 *   sprig from the bowl, dips it and flicks the water over him: a few drops
 *   fly to him (he shuts his eyes as they land). Then he comes in on his
 *   knees and holds out his right hand, palm up, his left upright at his
 *   chest; the monk leans forward and ties the red string round his wrist
 *   with both hands, murmuring "āyu vaṇṇo sukhaṃ balaṃ", and pulls the knot
 *   snug; he says the blessing in Khmer (a bubble). He goes back on his knees,
 *   bows three times to the floor (the prayer's bows, the temple bell at the
 *   first) and gets up, his hat back on: "A monk blessed you. The red string
 *   protects you on your travels." The camera comes round to his right side,
 *   low, the monk's face and the string in view; a drag looks round.
 * - **Bareheaded** where the monk sits (`HALLS`: the village pagoda's hall, the
 *   floor on Kulen's rock before the Buddha): his hat off as he steps in, on
 *   again as he steps out.
 * - **The string** stays on his right wrist from then on, every visit
 *   (`progress` `bless.string`): in every pose and mode, in photos and the
 *   selfie (character/redString.ts: on the forearm, clear of what the hand
 *   holds — the umbrella, a skewer, the phone).
 * - **Once a visit** for each monk: a second time he smiles and nods ("You have
 *   your blessing already"), and the explorer greets him with a high sampeah.
 * - **Leaving off**: E, Space or the stick gets him up (the string stays if it
 *   is knotted); back to the map, everything stops at once.
 *
 * URL (checks): `bless=1` (with `at=` before the monk) asks as E would;
 * `bless=<step>[:<s>]` that far into a step at once (`kneel`, `chant`, `tie`,
 * `words`, `bow`, `up`, `again`; `bless=tie` alone: the cord going round his
 * wrist); either before the seat he stands before, else the nearest (`at=` on
 * Kulen's floor: Kulen's monk, with `people=kulenblessing`);
 * `redstring=1` (or `0`) the string on him (or off) in any shot;
 * `blessmonk=1|0` the monk there (or away) whatever the clock; the monk alone:
 * `blesspose=<state>:<s>` (people/_sceneBlessing.ts). `report()` gives
 * `bless=` and `redstring=1`. `window.__bless` (checks): the step, the time.
 */

const ID = 'bless';

/** Walking to his place: a calm pace (share of his), slower over the last `SLOW` m, there within `THERE` m; he gives up if no nearer for `STALL` s or after `GO_FOR` s. */
const PACE = 0.6;
const SLOW = 1.5;
const THERE = 0.18;
const STALL = 0.7;
const GO_FOR = 6;
/** The stick past this, Space or E: never mind (walking to it), or get up. */
const STICK = 0.35;
/** The turn to the monk (s), the kneel's speed (prayer time a second), back on his heels (s). */
const TURN_T = 0.55;
const KNEEL_RATE = 1.15;
const SETTLE_T = 0.8;
/** His words, the bows' speed (prayer time a second), a leaving off part way (s), the second time's greeting (s). */
const WORDS_FOR = 3.6;
/**
 * Kneeling low before the monk (character/blessing.ts `rise`, `bowHead`): up off his heels this much to move on his
 * knees; bowed this much at the tie, under the monk's words (his head always clearly below the monk's, who sits on
 * his raised dais: `BLESS_SEATS`).
 */
const KNEE_WALK = 0.25;
/** Held close for the string, he looks this high (m over the floor: the monk's hands and chest), not down at his own hand. */
const TIE_LOOK = 1.6;
const TIE_BOW = 0.45;
const WORDS_BOW = 0.8;
const BOW_RATE = 1.0;
const LEAVE_T = 0.6;
const AGAIN_FOR = 3.0;
/**
 * The camera: from his left side (`side` round from the way he faces, a little behind him), low, square to the
 * line between them: both in profile, the monk's sprinkling hand on its side, the hall's Buddha behind them. For the
 * tie it comes round behind him to his right side (`tieSide`, nearer: the string goes round his right wrist; the
 * hall's door behind them), and back after; a little wider (`fov`: the camera keeps off the hall's walls). Eased
 * there over `for` s at each change, then it is the player's (a drag looks round); back to where it was after. On
 * Kulen's floor the same frames it: from his left over the rock's open west edge, the reclining Buddha behind them;
 * for the tie from his right, west of the altar and north of the pilgrims' rows (they kneel behind it, out of view).
 */
const FRAME = { side: -1.45, tieSide: 1.4, pitch: 0.17, near: 3.0, far: 3.6, fov: 60, rate: 1.8, back: 2.2, for: 3.2 };
/** Where he looks as he looks at the string on his wrist (BU, his space: before him, a little to his right). */
const ADMIRE = new Vector3(-1.2, 14.5, 6.5);

const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
/** 0‥1 over [a, b] (smoothed). */
const over = (x: number, a: number, b: number) => smooth((x - a) / (b - a));
/** Up over [a, b], down over [c, d]. */
const bump = (x: number, a: number, b: number, c: number, d: number) => (x < c ? over(x, a, b) : 1 - over(x, c, d));

type Step = 'off' | 'go' | 'turn' | 'down' | 'settle' | 'chant' | 'tie' | 'words' | 'bow' | 'up' | 'leave' | 'back' | 'again';

let env: AddonEnv | null = null;
let step: Step = 'off';
/** Seconds into the step. */
let st = 0;
let seat: BlessSeat = BLESS_SEATS[0];
/** Where he kneels (feet), where he comes in close for the string; the way he faces (to the monk). */
const kneelAt = new Vector3();
const closeAt = new Vector3();
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
/**
 * Where a monk sits for blessings, he goes bareheaded: a box on the map (m), its floor; he is in it past its threshold
 * by `in` (m), out once back over it. The threshold is its `z0` side (`door` −1) or its `z1` side (+1).
 */
interface Hall {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly floor: number;
  readonly in: number;
  readonly door: -1 | 1;
}
/**
 * The village pagoda's hall (village/_pagoda.ts: its walls ± 4 m from the axis, from the door's wall to the back wall at
 * z 112.5), its floor (the altar's steps over it too); Kulen's rock floor before the reclining Buddha (`BLESS_SEATS`'
 * `kulen`, his frame: the floor's outline within x ± 9.1, z ± 6.1, 150 m up), from the head of its stair on the south
 * (its top step at z 6, its cheek walls from z 5).
 */
const HALLS: readonly Hall[] = [
  { x0: PAGODA.x - 4, x1: PAGODA.x + 4, z0: PAGODA.doorZ, z1: 112.5, floor: PAGODA.floor, in: 0.3, door: -1 },
  { x0: 409 - 9.1, x1: 409 + 9.1, z0: -445 - 6.1, z1: -445 + 5.6, floor: 150, in: 0.3, door: 1 },
];
let inHall = false;
/** His hat taken off as he stepped into the hall, to put back on as he steps out. */
let hallHatOff = false;
/** The string was knotted in this blessing (the toast at its end), and he wears it (kept, or a check's). */
let tied = false;
let worn = false;
/** The clock now (`MapFrame.clock`), and from when in the night the empty dais's hint says he comes after the morning chant. */
let clockNow = 0;
const DAWN_FROM = 0.62;
/** Seats whose monk has blessed him this visit. */
const blessed = new Set<string>();
/** The camera: the way it looks from, the player's view before, how long framed (s), held by a check's URL. */
let camYaw = 0;
let camDist = FRAME.far;
let before: { pitch: number; distance: number } | null = null;
let framed = 0;
let urlCam = false;
/** The flat hands of the sampeah (built the first time), on him now. */
let hands: { L: Group; R: Group } | null = null;
let handsOpen = false;
/** A face held over his own now ('asleep': the eyes shut as the drops land; 'happy': hearing the blessing). */
let face: 'asleep' | 'happy' | null = null;
/** The greeting of the second time played. */
let greeted = false;
/** The prompts and hints (made again when the language changes). */
let pAsk = '';
let pUp = '';
let pNight = '';
let pDawn = '';
let pMeal = '';
let pFest = '';
const words = () => {
  // (J beside it: kneel and listen to him chant, roam/_listen.ts)
  pAsk = `E  ${t('blessAsk')}  ·  J  ${t('listenMonk')}`;
  pUp = `E  ${t('blessUp')}`;
  pNight = t('blessNight');
  pDawn = t('blessDawn');
  pMeal = t('blessMeal');
  pFest = t('blessFest');
};
words();
onLang(words);
/** Scratch (no allocation a step). */
const _v = new Vector3();
const _m = new Matrix4();
const _f = { x: 0, z: 0 };
const posture = () => blessPose(ps);

// ── The calendar: the monks sit for blessings ────────────────────────────────
/** Each seat's words in the calendar (ui/lang.ts): what happens, where, the toast as it begins. */
const CAL: Readonly<Record<string, { note: WordKey; place: WordKey; begins: WordKey }>> = {
  village: { note: 'blessCalNote', place: 'whenAtPagodaOnly', begins: 'blessCalBegins' },
  kulen: { note: 'blessCalNoteKulen', place: 'rbGate', begins: 'blessCalBeginsKulen' },
};
for (const s of BLESS_SEATS) {
  const w = CAL[s.id];
  if (!w) continue;
  registerEvent({
    id: `bless-${s.id}`,
    kind: 'daily',
    name: 'blessCal',
    note: w.note,
    place: w.place,
    begins: w.begins,
    where: { x: s.x, z: s.z },
    near: 120,
    // (the monk's own rule, people/_sceneBlessing.ts: the hour, and in the village the pagoda's festival of that moment
    // — its day goes afternoon to afternoon, so the clock counts)
    on: (m) => blessHour(m.clock) === 'sit' && !(s.fest && pagodaFestival(festivalAt(m.season, m.day, m.clock))),
    // (as the map shows it: a festival the URL holds, or none, as the monk's scene plays it)
    shown: (m) => blessHour(m.clock) === 'sit' && !(s.fest && pagodaFestival(festivalNow(m))),
  });
}
function pagodaFestival(f: string | null): boolean {
  return f === 'pchumben' || f === 'visak';
}

// ── Where ────────────────────────────────────────────────────────────────────

/** The seat whose monk he stands before (in front of the dais, on its floor), or null. */
function seatNear(ctx: RoamCtx): BlessSeat | null {
  return seatBefore(ctx.body.pos);
}

/** He never stands on a monk's dais or its step (they are not on the walk map): out to the nearest open side. */
function keepOffDais(ctx: RoamCtx): void {
  for (const s of BLESS_SEATS) {
    keepOff(ctx, s, s.dais, !s.wall);
    keepOff(ctx, s, s.step, false);
  }
}

/** Out of box `d` of seat `s`: by its front or a side, or its back too (`back`: no wall behind it). */
function keepOff(ctx: RoamCtx, s: BlessSeat, d: BlessBox, back: boolean): void {
  const p = ctx.body.pos;
  const r = 0.3 * ctx.body.scale;
  if (p.y > d.top + 0.6 || p.y < s.floor - 0.6) return;
  const sn = Math.sin(s.yaw);
  const cs = Math.cos(s.yaw);
  const dx = p.x - d.x;
  const dz = p.z - d.z;
  const a = dx * sn + dz * cs;
  const c = dx * cs - dz * sn;
  const ea = d.along + r - Math.abs(a);
  const ec = d.across + r - Math.abs(c);
  if (ea <= 0 || ec <= 0) return;
  // (the back of it is the wall, or the dais: out the front, or a side, whichever is nearer; a dais standing free, out
  // its back too if that is nearer)
  let na = a;
  let nc = c;
  if (back && d.along + r + a < Math.min(ec, d.along + r - a)) na = -(d.along + r);
  else if (ec < d.along + r - a) nc = Math.sign(c || 1) * (d.across + r);
  else na = d.along + r;
  p.x = d.x + na * sn + nc * cs;
  p.z = d.z + na * cs - nc * sn;
}

// ── The blessing ─────────────────────────────────────────────────────────────

function go(s: Step): void {
  step = s;
  st = 0;
}

/** The link's state for the monk (`BLESS.ask`), each step. */
function tell(state: BlessState, tt: number): void {
  const a = BLESS.ask;
  a.state = state;
  a.t = tt;
  a.id = seat.id;
  const p = env?.body.pos ?? kneelAt;
  a.x = p.x;
  a.y = seat.floor;
  a.z = p.z;
}

/** Start: walk to the place before the monk (or a smile and a nod, the second time in a visit). */
function begin(ctx: RoamCtx, s: BlessSeat): void {
  seat = s;
  seatFront(s, s.kneel, _f);
  kneelAt.set(_f.x, s.floor, _f.z);
  seatFront(s, s.close, _f, s.closeLeft);
  closeAt.set(_f.x, s.floor, _f.z);
  facing = s.yaw + Math.PI;
  tied = false;
  greeted = false;
  urlCam = false;
  BLESS.ask.n++;
  turnFrom = ctx.body.yaw;
  from.copy(ctx.body.pos);
  if (blessed.has(s.id)) {
    // (the second time: he greets the monk where he stands, facing him)
    facing = Math.atan2(s.x - ctx.body.pos.x, s.z - ctx.body.pos.z);
    tell('again', 0);
    go('again');
    return;
  }
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

/** He stands in hall `h` (`was`: he was in one a step ago, so he is out only once back over its threshold). */
function inside(h: Hall, p: Vector3, was: boolean): boolean {
  if (p.y <= h.floor - 0.6 || p.y >= h.floor + 3 || p.x <= h.x0 || p.x >= h.x1) return false;
  const past = was ? 0.05 : h.in;
  return h.door < 0 ? p.z > h.z0 + past && p.z < h.z1 : p.z > h.z0 && p.z < h.z1 - past;
}

/**
 * In the pagoda's hall (or on Kulen's floor before the Buddha: `HALLS`) he goes bareheaded (one wears no hat before the
 * Buddha and the monks): his hat off as he steps in past the door, on again as he steps out (unless he put it back on
 * meanwhile: H); off his feet, or back to the map, on again at once (`inside` false).
 */
function hallHat(ctx: RoamCtx | null, mode: RoamMode | null): void {
  const e = env;
  if (!e) return;
  const was = inHall;
  const p = ctx?.body.pos;
  inHall = false;
  if (p && mode === 'walk') for (const h of HALLS) inHall ||= inside(h, p, was);
  if (inHall && !was) {
    if (e.explorer.currentOutfit.hat && !e.explorer.animator.posture) {
      setHat(false);
      hallHatOff = true;
    }
  } else if (!inHall && hallHatOff) {
    hallHatOff = false;
    setHat(true);
  }
}

/** The hat the blessing took back on him — or, in the hall, left off until he steps out (the hall's then). */
function hatBack(): void {
  hatTaken = false;
  if (inHall) hallHatOff = true;
  else setHat(true);
}

/** Flat hands (the sampeah, the hand held out, the bows) or his own. */
function openHands(on: boolean): void {
  const e = env!;
  if (on === handsOpen) return;
  handsOpen = on;
  if (on) {
    if (!hands) {
      const q = e.explorer.rig.quality;
      const mk = (side: 'L' | 'R') => {
        const p = JOINTS[`wrist${side}`].pivot;
        return buildVoxelMesh(buildHand(side, 'open'), { quality: q, offset: new Vector3(p[0], p[1], p[2]), castShadow: true, name: `bless:hand${side}` });
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

function showFace(f: 'asleep' | 'happy' | null): void {
  if (f === face || !env) return;
  face = f;
  env.explorer.showFace(f);
}

/** The red string on him at a stage of the tying (2: knotted, kept), or off (null). */
function string(stage: 0 | 1 | 2 | null): void {
  if (env) wearRedString(env.explorer, stage);
}

/** The knot pulled snug: the string is his, kept between visits. */
function knotted(): void {
  if (tied) return;
  tied = true;
  worn = true;
  blessed.add(seat.id);
  string(2);
  progress.set('bless.string', true);
  SFX.play('blessKnot', 0.9);
  pad.rumble('tick', 0.6);
}

/** Leave off (E, Space, the stick): up from where he is; the string stays if it is knotted. */
function leaveOff(): void {
  if (step === 'turn' || step === 'go') {
    end();
    return;
  }
  if (step === 'down') {
    go('back');
    tell('none', 0);
    return;
  }
  if (step === 'up' || step === 'back' || step === 'leave' || step === 'again' || step === 'off') return;
  // (the cord round his wrist but not knotted yet: the monk ties it off as he leaves)
  if (step === 'tie' && st >= TIE.wind) knotted();
  else if (!tied && worn) string(2);
  else if (!tied) string(null);
  tell('none', 0);
  go('leave');
}

/** All done (or stopped): his own pose, hands, face, hat; the monk lets go; the toast once the string is his. */
function end(): void {
  const e = env;
  if (!e) return;
  openHands(false);
  showFace(null);
  if (hatTaken) {
    hatBack();
  }
  e.explorer.animator.posture = null;
  e.explorer.animator.postureFeet = true;
  if (BLESS.ask.state !== 'none') tell('none', 0);
  if (tied) {
    e.hud.toast(t('blessDone'));
    tied = false;
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

/** The monk's face (m), for him to look at. */
function monkFace(out: Vector3): Vector3 {
  return out.set(seat.x, seat.y + 1.25, seat.z);
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

/** Sounds at their moment: a cue at `at` s into the step, crossed by this step. */
const cue = (at: number, dt: number) => st >= at && st - dt < at;

/** One step of the blessing while it holds him. */
function stepBlessing(ctx: RoamCtx, dt: number): string | null {
  const e = env!;
  const { body } = ctx;
  st += dt;
  ps.t += dt;
  let prompt: string | null = pUp;
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
      ps.pray = Math.min(BLESS_KNEEL, st * KNEEL_RATE);
      if (!hatTaken && ps.pray >= BLESS_HAT.off && e.explorer.currentOutfit.hat) {
        hatTaken = true;
        setHat(false);
      }
      if (ps.pray >= BLESS_KNEEL) {
        // (the prayer's kneel is the posture's own kneeling up: from here the posture's shape)
        ps.prayW = 0;
        go('settle');
      }
      break;
    case 'settle': {
      // Back on his heels, palms together at his face, looking up at the monk.
      ps.rise = 1 - over(st, 0, SETTLE_T);
      ps.palms = over(st, 0, SETTLE_T * 0.75);
      ps.lookW = 0.8 * over(st, 0, SETTLE_T);
      toBody(ctx, monkFace(_v).x, _v.y, _v.z, ps.look);
      openHands(ps.palms > 0.45);
      if (st >= SETTLE_T) {
        go('chant');
        SFX.play('blessChant', 0.85);
      }
      break;
    }
    case 'chant': {
      // Bowed under the chant and the water (leaning forward, his head well below the monk's: never level with it); his
      // eyes shut as the drops land.
      ps.palms = 1;
      ps.bowHead = Math.max(bump(st, 0, 1.4, CHANT_FOR - 1.2, CHANT_FOR), TIE_BOW * over(st, CHANT_FOR - 1.2, CHANT_FOR));
      ps.lookW = 0.8 - 0.5 * over(st, 0, 1.2);
      toBody(ctx, monkFace(_v).x, _v.y, _v.z, ps.look);
      for (const d of BLESS_SCRIPT.dips) if (cue(SCRIPT_AT + d, dt)) SFX.play('blessDip', 0.8);
      let shut = false;
      for (const f of BLESS_SCRIPT.flicks) {
        if (cue(SCRIPT_AT + f + 0.28, dt)) SFX.play('blessDrops', 0.8);
        if (st >= SCRIPT_AT + f + 0.18 && st < SCRIPT_AT + f + 0.8) shut = true;
      }
      showFace(shut ? 'asleep' : null);
      if (st >= CHANT_FOR) {
        showFace(null);
        go('tie');
        pickSide();
      }
      break;
    }
    case 'tie': {
      // In on his knees, the right hand out, palm up, the left under its forearm; the string round his wrist; back on
      // his knees to his place, where he looks at it.
      const m = BLESS.monks[seat.id];
      const out = TIE.back + 0.1;
      ps.palms = Math.max(1 - over(st, 0, 0.45), over(st, TIE.for - 0.6, TIE.for));
      // (low: a little up off his heels to move on his knees, on them between; his head up as he comes in and his hand
      // goes out — the monk's face is near —, bowed again as his palms come together)
      ps.rise = KNEE_WALK * Math.max(bump(st, 0, 0.35, 1.2, 1.6), bump(st, out - 0.2, out + 0.1, out + 0.9, out + 1.2));
      ps.bowHead = TIE_BOW * Math.max(1 - over(st, 0, 0.5), over(st, TIE.for - 0.6, TIE.for));
      const walkIn = over(st, 0.35, 1.35);
      const walkOut = over(st, out, out + 1.0);
      body.pos.lerpVectors(kneelAt, closeAt, walkIn - walkOut);
      ps.step = (walkIn - walkOut) * Math.PI * 3;
      ps.stepW = Math.max(bump(st, 0.35, 0.55, 1.15, 1.35), bump(st, out, out + 0.2, out + 0.8, out + 1.0));
      ps.offer = bump(st, 0.95, 1.65, TIE.back, TIE.back + 0.5);
      // (back at his place, his hand up before him, the palm to his face: he looks at the string on his wrist)
      ps.admire = bump(st, TIE.look, TIE.look + 0.5, TIE.for - 0.75, TIE.for - 0.15);
      if (cue(0.4, dt) || cue(0.9, dt) || cue(out + 0.1, dt) || cue(out + 0.6, dt)) SFX.play('blessCloth', 0.6);
      if (Number.isFinite(m.hx)) toBody(ctx, m.hx, m.hy, m.hz, ps.reach);
      // (his eyes lowered to the monk's hands and chest, his big head kept back from the monk's face; then the string)
      toBody(ctx, seat.x, seat.floor + TIE_LOOK, seat.z, ps.look).lerp(ADMIRE, ps.admire);
      ps.lookW = 0.9;
      openHands(true);
      if (cue(TIE.wind - 0.1, dt)) SFX.play('blessMurmur', 0.8);
      if (cue(TIE.wind, dt)) {
        string(0);
        SFX.play('blessTie', 0.9);
      }
      if (cue(TIE.round, dt)) string(1);
      if (cue(TIE.knot, dt)) knotted();
      if (st >= TIE.for) {
        go('words');
        pickSide();
      }
      break;
    }
    case 'words': {
      // The monk's blessing in Khmer: on his heels at his place, palms together, bowed low.
      ps.palms = 1;
      ps.offer = ps.admire = ps.stepW = ps.rise = 0;
      body.pos.copy(kneelAt);
      ps.bowHead = TIE_BOW + (WORDS_BOW - TIE_BOW) * over(st, 0.3, 1.2);
      toBody(ctx, monkFace(_v).x, _v.y, _v.z, ps.look);
      ps.lookW = 0.8 - 0.4 * over(st, 0.3, 1.2);
      showFace(st > 0.3 && st < WORDS_FOR - 0.4 ? 'happy' : null);
      if (st >= WORDS_FOR) {
        ps.pray = BLESS_BOWS;
        go('bow');
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
        hatBack();
      }
      prompt = null;
      if (ps.pray >= PRAY.duration - 0.05) {
        end();
        return null;
      }
      break;
    case 'leave': {
      // Part way: the hands back, on his heels, then up the prayer's way.
      const k = Math.min(1, (dt / LEAVE_T) * 3);
      ps.rise += (0 - ps.rise) * k;
      ps.palms = Math.max(0, ps.palms - dt / LEAVE_T);
      ps.offer = Math.max(0, ps.offer - dt / LEAVE_T);
      ps.admire = Math.max(0, ps.admire - dt / LEAVE_T);
      ps.stepW = ps.bowHead = 0;
      ps.prayW = Math.max(0, ps.prayW - dt / LEAVE_T);
      openHands(ps.palms > 0.45 || ps.offer > 0.3 || ps.admire > 0.3);
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
      if (hatTaken && ps.pray < BLESS_HAT.off) {
        hatBack();
      }
      prompt = null;
      if (ps.pray <= 0) {
        end();
        return null;
      }
      break;
    case 'again': {
      // The second time: turned to him, a high sampeah; he smiles and nods.
      const k = smooth(st / 0.4);
      body.yaw = turnFrom + angleDiff(facing, turnFrom) * k;
      if (!greeted && st >= 0.3) {
        greeted = true;
        e.explorer.play('greetHigh');
        ctx.sound('greet', 1);
      }
      prompt = null;
      if (st >= AGAIN_FOR) {
        end();
        return null;
      }
      break;
    }
  }
  // The monk follows (the link): what he does, how far into it.
  if (step === 'turn' || step === 'down' || step === 'settle') tell('kneel', BLESS.ask.state === 'kneel' ? BLESS.ask.t + dt : 0);
  else if (step === 'chant' || step === 'tie' || step === 'words' || step === 'again') tell(step, st);
  else if (step === 'bow' || step === 'up') tell('bow', st);
  if (step !== 'again' && step !== 'turn') e.explorer.setMotion(0, true, 0);
  frame(ctx, dt);
  return prompt;
}

/** The side the camera looks from (`FRAME`), nearer at the tie. */
function pickSide(): void {
  camYaw = facing + (step === 'tie' ? FRAME.tieSide : FRAME.side);
  camDist = step === 'tie' ? FRAME.near : FRAME.far;
  framed = urlCam ? Infinity : 0;
}

/** The camera while he is blessed: the focus between him and the monk; eased round after each change, then the player's. */
function frame(ctx: RoamCtx, dt: number): void {
  const { cam, body } = ctx;
  const s = body.scale / 1.4;
  if (step === 'again') {
    // (the second time he stands: the camera as on foot)
    cam.focus.set(body.pos.x, body.pos.y + 1.7 * body.scale * 0.95 * 0.86, body.pos.z);
    cam.behindYaw = body.yaw;
    return;
  }
  const tie = step === 'tie';
  // (between him and the monk; at the tie, at his hand)
  const k = tie ? 0.62 : 0.5;
  // (as high as the faces: the monk's on his raised dais is over his)
  cam.focus.set(body.pos.x + (seat.x - body.pos.x) * k, seat.floor + (tie ? 1.3 : 1.4) * s, body.pos.z + (seat.z - body.pos.z) * k);
  cam.behindYaw = camYaw;
  // (a little wider: the hall is narrow, the camera keeps off its walls)
  cam.fov = FRAME.fov;
  before ??= { pitch: cam.pitch, distance: cam.distance };
  framed += dt;
  if (framed > FRAME.for) return;
  const r = 1 - Math.exp(-FRAME.rate * dt);
  cam.yaw += angleDiff(camYaw, cam.yaw) * r;
  cam.pitch += (FRAME.pitch - cam.pitch) * r;
  cam.distance += (camDist * s - cam.distance) * r;
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

// ── The add-on ───────────────────────────────────────────────────────────────

/** A still settles this long after a start from the URL without `sim=` (roam.ts `SETTLE`, s). */
const SETTLE = 0.8;
/** URL steps (`bless=<step>[:<s>]`) and where they start him. */
const URL_STEPS: readonly Step[] = ['kneel' as Step, 'chant', 'tie', 'words', 'bow', 'up', 'again'];

registerAddon({
  id: ID,
  init(e) {
    env = e;
    worn = progress.get('bless.string', false, isBool);
    if (worn) string(2);
    Object.assign(window, {
      __bless: {
        now: () => ({ step, st: +st.toFixed(2), seat: seat.id, ask: { ...BLESS.ask }, monk: { ...BLESS.monks[seat.id] }, worn, blessed: [...blessed], hat: e.explorer.currentOutfit.hat, inHall, hallHatOff, hatTaken }),
        probe: () => ({ near: seatNear({ body: e.body } as RoamCtx)?.id ?? null, busy: e.busy(), now: BLESS.now, pos: e.body.pos.toArray(), grounded: e.body.grounded }),
        /** His head's top (the highest drawn point of his head and hair, as posed) and the seated monk's (the people model: his head's top 1.1975 model m over the dais sitting, × 1.37), m over the floor. */
        heads: () => {
          let top = -Infinity;
          e.explorer.rig.joints.head.updateWorldMatrix(true, true);
          // (each block's top corners: the meshes are instanced unit blocks)
          e.explorer.rig.joints.head.traverseVisible((o) => {
            if (!(o instanceof InstancedMesh)) return;
            for (let i = 0; i < o.count; i++) {
              o.getMatrixAt(i, _m);
              _m.premultiply(o.matrixWorld);
              for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) top = Math.max(top, _v.set(x, y, z).applyMatrix4(_m).y);
            }
          });
          return { his: +(top - seat.floor).toFixed(3), monk: +(seat.y + 1.1975 * 1.37 - seat.floor).toFixed(3) };
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

  input(ctx, mode) {
    if (step === 'off' || mode !== 'walk') return false;
    const i = ctx.input;
    const push = Math.hypot(i.move.x, i.move.y) > STICK || i.jump;
    if (step === 'go') {
      // (the player's own stick or Space: never mind; E again too)
      if (push || i.use) {
        tell('none', 0);
        step = 'off';
        return false;
      }
      steer(ctx);
      return false;
    }
    if (push || i.use) leaveOff();
    // (his input is the blessing's meanwhile: no tool, no camera, no emote; the drag still looks round)
    ctx.cam.turn(i.lookYaw, i.lookPitch, i.zoom);
    if (i.lookYaw || i.lookPitch) framed = Infinity;
    return true;
  },

  offer(ctx, mode) {
    if (mode !== 'walk' || step !== 'off' || !env || env.busy()) return null;
    const s = seatNear(ctx);
    if (!s) return null;
    const m = BLESS.monks[s.id];
    // (the people part last wrote him a moment ago: else it is not built, or far)
    if (BLESS.now - m.t > 1.5) return null;
    if (m.there) return pAsk;
    // (before his hours in the morning, from before dawn: he comes after the morning chant)
    const night = clockNow - Math.floor(clockNow) >= DAWN_FROM ? pDawn : pNight;
    return m.away === 'night' ? night : m.away === 'meal' ? pMeal : m.away === 'fest' ? pFest : null;
  },

  use(ctx) {
    const s = seatNear(ctx);
    if (!s || !env || !BLESS.monks[s.id].there) return;
    begin(ctx, s);
  },

  hold(ctx, dt) {
    ctx.body.vel.set(0, 0, 0);
    ctx.body.grounded = true;
    return { prompt: stepBlessing(ctx, dt) };
  },

  after(ctx, mode, dt) {
    hallHat(ctx, mode);
    if (mode !== 'walk') return;
    if (step === 'off' || step === 'go') keepOffDais(ctx);
    if (step !== 'go') return;
    // Walking to his place: there (or no nearer for a moment): he turns to the monk; too far still: never mind.
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

  setMode(next, _prev, ctx) {
    // (off his feet, or back to the map: his hat back on if the hall had it)
    if (next !== 'walk') hallHat(ctx, next);
    // (off his feet, or back to the map: it stops at once)
    if (step !== 'off' && next !== 'walk') {
      if (step === 'tie' && st >= TIE.wind) knotted();
      else if (!tied && !worn) string(null);
      else string(2);
      end();
      restoreCam(null);
    }
  },

  frame(f: MapFrame, mode: RoamMode) {
    BLESS.now = f.t;
    clockNow = f.clock;
    if (step === 'off' && before && mode === 'walk') restoreCam(f.dt);
  },

  fromUrl(q, ctx) {
    const rs = q.get('redstring');
    if (rs !== null) {
      worn = rs !== '0';
      string(worn ? 2 : null);
    }
    const v = q.get('bless');
    if (!v || !env) return;
    // (the seat he stands before, else the one nearest him)
    const here = seatNear(ctx);
    let s = here ?? BLESS_SEATS[0];
    let best = here ? -1 : Infinity;
    for (const c of BLESS_SEATS) {
      const d = Math.hypot(c.x - ctx.body.pos.x, c.z - ctx.body.pos.z);
      if (d < best) {
        best = d;
        s = c;
      }
    }
    if (v === '1') {
      begin(ctx, s);
      return;
    }
    const [name, sec] = v.split(':');
    const want = (name === 'kneel' ? 'settle' : name) as Step;
    if (!URL_STEPS.includes(name as Step)) return;
    // That far into the step at once, kneeling at his place (in close for the string), as the step would have him.
    if (want === 'again') blessed.add(s.id);
    else blessed.delete(s.id);
    begin(ctx, s);
    if (want === 'again') {
      st = Number(sec) || 0.9;
      return;
    }
    const at = sec !== undefined ? Number(sec) || 0 : want === 'tie' ? TIE.round + 0.25 : 1;
    ctx.body.pos.copy(want === 'tie' && at > 1.35 && at < TIE.back + 0.1 ? closeAt : kneelAt);
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
    // (the cord as far round as the tying has it; knotted after it: the string is his)
    if (want === 'tie') {
      if (at >= TIE.knot) knotted();
      else if (at >= TIE.round) string(1);
      else if (at >= TIE.wind) string(0);
    } else if (want === 'words' || want === 'bow' || want === 'up') knotted();
    if (want === 'bow') ps.pray = BLESS_BOWS;
    if (want === 'up') {
      ps.pray = BLESS_RISE;
      ps.prayW = 1;
    }
    // (run the step up to `at` — less the still's settling after, roam.ts `SETTLE`, when no `sim=` moves it on —, the
    // camera as it frames it unless the URL holds one)
    urlCam = q.has('rcam') || q.has('cam');
    pickSide();
    const steps = Math.round(Math.max(0, at - (q.has('sim') ? 0 : SETTLE)) / 0.05);
    for (let k = 0; k < steps && step === want; k++) stepBlessing(ctx, 0.05);
    if (!urlCam) {
      const cam = ctx.cam;
      before = { pitch: cam.pitch, distance: cam.distance };
      cam.yaw = camYaw;
      cam.behindYaw = camYaw;
      cam.pitch = FRAME.pitch;
      cam.distance = camDist * (ctx.body.scale / 1.4);
      framed = FRAME.for;
    }
  },

  report(): Record<string, string> | null {
    const out: Record<string, string> = {};
    if (worn) out.redstring = '1';
    if (step !== 'off' && step !== 'go') {
      const name = step === 'turn' || step === 'down' || step === 'settle' ? 'kneel' : step === 'leave' || step === 'back' ? 'up' : step;
      out.bless = `${name}:${st.toFixed(1)}`;
    } else if (step === 'go') out.bless = '1';
    // (his hat is only off for the blessing or in the hall: the link puts it on, they take it off again)
    if (hatTaken || hallHatOff) out.hat = '1';
    return Object.keys(out).length ? out : null;
  },
});
