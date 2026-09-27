import { Matrix4, Vector3, type Group, type Object3D } from 'three';
import type { ExpressionName } from '../../character/parts/face';
import { mulberry32 } from '../../voxel/random';
import { len2 } from '../fauna/_len';
import type { HeightField } from '../heightfield';
import { LAKES } from '../layout';
import { lang, num, t } from '../ui/lang';
import { activeJournal } from './_book';
import { SPECIES_BY_KIND } from './_bookData';
import { STOWED_ROD } from './_boatModel';
import { createFishGear, LINE_POINTS, ROD_HOLD } from './_fishGear';
import { catchLength, FISH, FISH_KINDS, pickFish, type FishKind, type FishWater } from './_fishKinds';
import { FishHold } from './_fishPoses';
import type { Wake } from './_wake';
import type { RiverField } from './flow';
import { angleDiff } from './followCam';
import { setTouchFish, takeTouchFish } from './touch';
import type { RoamCtx } from './types';

/**
 * Fishing from the boat, a calm little game (the boat: boat.ts; the pole,
 * float, line and fish drawn: _fishGear.ts; his body: _fishPoses.ts; the
 * fish: _fishKinds.ts).
 *
 * In the boat, slow or still, **F** (or the Fish button on touch) lays the
 * paddle across his lap; he reaches for the bamboo pole laid along the
 * boat's right side and takes it up. A swing back and a flick forward: the
 * float flies 6–10 m out over open water and lands with a plop and rings.
 * The boat drifts slowly with the current (still on the lake), and the
 * follow camera eases to a calm view from the side, him and the float in
 * it. A bite comes in 5–25 s (sooner at dawn and dusk and in a light rain,
 * later in a storm): a nibble or two dips the float (the prompt goes quiet),
 * then it goes under (a sound, rings, "F  Strike!"). F, Space, a click or
 * the button within 1.2 s strikes: the pole bends, the line goes taut, the
 * fish runs this way and that and splashes, then he lifts it out, catches
 * it in his left hand, lays the pole down and holds the fish up by its lip
 * at his side for a moment, smiling (the camera comes round to his front;
 * "ត្រីរៀល — Trey riel · 12 cm"; its page in the nature book), then leans
 * over, lets it go back into the water, takes the pole up and casts again. Too
 * late: "It got away". Too soon (while it nibbles): it swims off. Space or
 * a click while he waits twitches the float. W A S D, E, or F while he
 * waits lays the pole down again and puts the paddle back in his hands.
 * Which fish bites depends on the water (the great lake: all five; the
 * rivers and the Kulen stream: the riel, the climbing perch and the catfish
 * mostly; a pond or a moat: the perch and the snakehead), its size on
 * chance within a true range. With the camera or the phone up the pole
 * rests on the gunwale and no fish bites.
 *
 * Randomness: seeded (by the time while playing, fixed in shots). Costs
 * nothing when he is not fishing (the gear is hidden: no draws, no work).
 *
 * URL (checks, with `roam=boat` and a `sim=`; not `fish=`: the people's
 * cast nets have it): `fishing=1` start (he takes the pole up and casts:
 * `sim=_:5`) · `fishing=cast` the cast (`sim=_:1` the float in the air) ·
 * `fishing=wait` the float out, no bite (`sim=_:3`) · `fishing=bite` the
 * float going under (`sim=_:0.4`) · `fishing=fight[:<kind>]` the struggle
 * (`sim=_:1`) · `fishing=catch:<kind>` holding it up (`sim=_:1.5`) ·
 * `fishing=release:<kind>` letting it go (`sim=_:0.8`) · `fishcm=<n>` its
 * length. Kinds: riel, snakehead, catfish, perch, featherback. `rcam=`
 * keeps the camera where it says.
 */

type Phase = 'off' | 'take' | 'cast' | 'wait' | 'bite' | 'fight' | 'lift' | 'hold' | 'release' | 'stow';

/** What fishing needs of the boat this step. */
export interface FishBoat {
  /** The hull he rides, placed for this step (its matrix: boat space, true size, to the map). */
  readonly hull: Object3D;
  /** The water level under it (m), the rivers (level, current, banks) and the land. */
  readonly level: number;
  readonly river: RiverField;
  readonly field: HeightField;
  /** The boat's marks on the water (rings, foam, drops). */
  readonly wake: Wake;
  /** Speed through the water (m/s), and the current's (m/s). */
  readonly speed: number;
  readonly current: number;
  /** Afloat and settled (not boarding, not going over a fall). */
  readonly afloat: boolean;
  /** Show or hide the pole laid along the boat's side. */
  stowed(show: boolean): void;
}

export interface Fishing {
  /** The pole, float, line and fish (world space; the boat adds it). */
  readonly object: Group;
  /** His body while he fishes (the ride's posture: `RideState.fish`). */
  readonly hold: FishHold;
  /** From taking the pole up until it lies in the boat again. */
  readonly active: boolean;
  /** The share of the current the boat drifts with (1 when not fishing). */
  readonly drift: number;
  /** Before the boat's physics, once a step: F, Space, a click, the Fish button; the stick and E stop. Takes the paddling input while he fishes. */
  input(ctx: RoamCtx, boat: FishBoat): void;
  /** After the hull is placed, every step in the boat: the timeline, the pole, float, line and fish on the map, his body, the camera. */
  place(ctx: RoamCtx, dt: number, boat: FishBoat): void;
  /** The prompt's fishing part ("F  Fish", "F  Strike!"), or null; the touch button follows. */
  prompt(boat: FishBoat): string | null;
  /** Put it all away: `soft` as he would (the pole laid down), else at once (leaving the boat, a fall). */
  stop(ctx: RoamCtx, soft: boolean): void;
  /** Checks: `fishing=…` (see above), on a start in the boat from the URL. */
  fromUrl(params: URLSearchParams, ctx: RoamCtx, boat: FishBoat): void;
  /** Every frame in every mode: the float's night glow, the line's light. */
  frame(night: number): void;
  /** For bug reports: URL params that start a shot at this moment of fishing (null: not fishing). */
  report(): Record<string, string> | null;
}

// ── Timing (s) and places ────────────────────────────────────────────────────

const T_TAKE = 1.15;
/** He has the pole at this time of the take (it leaves the boat's side). */
const T_GRAB = 0.45;
const T_BACK = 0.55;
const T_FLICK = 0.25;
/** The float leaves the pole's tip this far into the cast. */
const T_RELEASE = 0.66;
const T_SETTLE = 0.6;
const BITE_WINDOW = 1.2;
const T_LIFT = 0.95;
/** The catch held up (the pole laid down first, the right hand back to the paddle), then shown. */
const T_HOLD = 3.3;
const T_LAY = 0.55;
const T_LET_GO_ALL = 1.45;
/** He lets go of the fish this far into the release. */
const T_LET_GO = 0.72;
const T_STOW = 1.0;
/** The pole back in the boat this far into putting it away (then his arms go back to the paddle). */
const T_LAID = 0.65;
/** After a miss or too soon: F and Space do nothing this long (a late press does not put the pole away). */
const GRACE = 0.9;
/** The boat (and the float) drift with this share of the current while he fishes. */
const DRIFT = 0.3;
/** He can fish slower than this through the water (m/s), in a current slower than `FAST`, not within `FALLS` m of a fall's lip. */
const SLOW = 0.8;
const FAST = 1.6;
const FALLS = 30;
/** The float hangs this far under the pole's tip before a cast (m, true size). */
const HANG = 0.75;
/** The camera eases to its framing over this long after each change (then it is the player's). */
const FRAME_FOR = 3;
/**
 * The framings (the follow camera's orbit: yaw from his heading, pitch, distance at his roaming
 * size): from the side, a little behind, low — him on one side, the float on the other (the yaw is
 * added to the cast's aim); and close in at his front, a little to his right (the fish at his left
 * side hangs clear of him against the water), for the catch.
 */
const SIDE_VIEW = { yaw: 1.1, pitch: 0.17, dist: 9 };
/** The side view on a phone held upright (a narrow view): from further round behind him, looking out along the line, so he and the float are both in it. */
const SIDE_TALL = { yaw: 0.45, pitch: 0.24, dist: 9.5 };
const SHOW_VIEW = { yaw: Math.PI - 0.35, pitch: 0.1, dist: 2.9 };
/** The shown fish's back (boat space): out to his side, so its flank faces the show's camera. */
const SHOW_BACK = new Vector3(Math.sin(SHOW_VIEW.yaw - Math.PI / 2), 0, Math.cos(SHOW_VIEW.yaw - Math.PI / 2));
/** Gravity on the flying float (m/s² at true size: a little light, a lazy arc). */
const FLY_G = 6.9;

/** A pose of the pole in the boat: the right fist on it (boat space, m, true size), where it points (azimuth + to his left of the bow, elevation up). */
interface RodPose {
  x: number;
  y: number;
  z: number;
  az: number;
  el: number;
}
const pose = (x: number, y: number, z: number, az: number, el: number): RodPose => ({ x, y, z, az, el });
/** Held out, waiting (the azimuth is added to the cast's aim). */
const READY = pose(-0.19, 0.53, -0.1, 0, 0.58);
/** Raised a little, the float hanging from the tip, before a cast. */
const PRE = pose(-0.2, 0.56, -0.12, 0, 0.8);
/** Swung back over his right shoulder. */
const BACK = pose(-0.24, 0.72, -0.2, 0.12, 1.85);
/** At the end of the flick. */
const FLICK = pose(-0.17, 0.52, 0.0, 0, 0.28);
/** Struck and fighting (the azimuth: towards the fish). */
const FIGHT = pose(-0.2, 0.62, -0.1, 0, 0.95);
/** Lifting the fish out and swinging it in to his left hand (not aimed). */
const LIFT = pose(-0.18, 0.7, -0.14, 0.15, 1.25);
/**
 * The catch shown (boat space, m, true size): he holds it up by its mouth in his left hand, his arm
 * out to his side at shoulder height, the fish hanging clear of him (his fists are big: held
 * across his chest they would hide it); and where his left hand lets it go, low over the left
 * gunwale. `GRIP`: where the fist holds it (u from the snout: its lip).
 */
const SHOW_AT = new Vector3(0.42, 0.8, -0.1);
const LET_GO_AT = new Vector3(0.47, 0.34, -0.06);
const GRIP = 0.02;
/** The fish hangs from the bottom of his fist, not its middle (m, true size): his fist only pinches its lip. */
const FIST_LOW = 0.075;
/** The pole laid in the boat, as a pose (the boat's model: _boatModel.ts `STOWED_ROD`). */
const STOWED: RodPose = (() => {
  const d = new Vector3().subVectors(STOWED_ROD.tip, STOWED_ROD.butt).normalize();
  const f = new Vector3().copy(STOWED_ROD.butt).addScaledVector(d, ROD_HOLD);
  return pose(f.x, f.y, f.z, Math.atan2(d.x, d.z), Math.asin(d.y));
})();
/** Where he casts: the aims he tries (radians, + to his left of the bow: over the right bow first) and how far (m). */
const AIMS = [-0.55, -0.35, -0.8, -0.15, -1.05, 0.05, 0.25, 0.45];
const CAST = [6, 10] as const;

const ease = (u: number) => {
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

const UP = new Vector3(0, 1, 0);
const _m = new Matrix4();
const _v = new Vector3();
const _w = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _p = new Vector3();
const _q = new Vector3();
const _flow = { x: 0, z: 0 };

/** The great lake (layout.ts `LAKES`). */
const GREAT_LAKE = LAKES.find((l) => l.name === 'Great lake') ?? null;

/** Which water (x, z) is on: the great lake, a river, the Kulen stream, or a pond or a moat. */
function waterKind(field: HeightField, x: number, z: number): FishWater {
  const l = GREAT_LAKE;
  if (l) {
    const c = Math.cos(l.rot ?? 0);
    const s = Math.sin(l.rot ?? 0);
    const dx = x - l.x;
    const dz = z - l.z;
    const u = (dx * c + dz * s) / l.rx;
    const v = (-dx * s + dz * c) / l.rz;
    if (u * u + v * v < 1.1) return 'lake';
  }
  for (const r of field.rivers)
    for (let i = 0; i < r.samples.length; i += 2) {
      const s = r.samples[i];
      const dx = s.x - x;
      const dz = s.z - z;
      const reach = s.w / 2 + 5;
      if (dx * dx + dz * dz < reach * reach) return r.name === 'Kulen stream' ? 'stream' : 'river';
    }
  return 'pond';
}

/** The keys told once a visit. */
let howToShown = false;

export function createFishing(): Fishing {
  const gear = createFishGear();
  const hold = new FishHold();
  let phase: Phase = 'off';
  /** Time in the phase, and on the whole (s). */
  let pt = 0;
  let clock = 0;
  let rng = mulberry32(1);
  let seeded = false;
  // The pole now, at the start of the move under way, and two key poses aimed (scratch).
  const rod: RodPose = { ...STOWED };
  const from: RodPose = { ...STOWED };
  const pa: RodPose = { ...READY };
  const pb: RodPose = { ...READY };
  let bend = 0;
  /** The cast: where it aims (radians from the bow) and lands (world), the line's length once out (m). */
  let aim = AIMS[0];
  const target = new Vector3();
  let lineLen = 8;
  // The float: where (world), its speed while flying (and where it was: the pendulum), how it lies.
  const fp = new Vector3();
  const fv = new Vector3();
  const fPrev = new Vector3();
  let floatOn = false;
  let flying = false;
  let thrown = false;
  let flyT = 0;
  let flyFor = 1;
  let lie = 0;
  let floatYaw = 0;
  /** The pole's tip and the fist on it (world), as last drawn. */
  const tip = new Vector3();
  const fist = new Vector3();
  // Waiting: time waited (not while the camera is up), when the bite comes (Infinity: never), the nibbles first.
  let waitT = 0;
  let nextBite = Infinity;
  let noBite = false;
  const nibbles: number[] = [];
  let dip = 0;
  let twitch = 0;
  let grace = 0;
  let ringT = 0;
  // The fish: kind, length (cm), where (world: under the water while it fights), its axis (snout), bend.
  let kind: FishKind = 'riel';
  let cm = 12;
  let fightFor = 2;
  let splashes = 0;
  let reelT = 0;
  let dropT = 0;
  const fishAt = new Vector3();
  const fishFrom = new Vector3();
  const fishTo = new Vector3();
  const fishAxis = new Vector3(0, 0, 1);
  /** Where its back faces (world): up while it swims, out to his side while he shows it. */
  const fishBack = new Vector3(0, 1, 0);
  const mouthAt = new Vector3();
  let grip = 0;
  let fishShown = false;
  let fell = false;
  const fallV = new Vector3();
  let flex = 0;
  let newPage = false;
  /** Taking the pole up again after a catch (it lies in the boat, shown: no reaching for the boat's own). */
  let retake = false;
  /** The right fist is on the pole (else on the fish, or going back to the paddle). */
  let rightOnRod = true;
  let faceBefore: ExpressionName | null = null;
  // The camera: side (him and the float) or show (his front and the fish), eased for a while after each change.
  let view: 'none' | 'side' | 'show' = 'none';
  let viewT = 0;
  let keepView = false;
  let focusW = 0;
  const focusAt = new Vector3();
  let before: { pitch: number; distance: number; follow: number; minDistance: number } | null = null;
  let looked = false;
  // Where he looks (world), if anywhere.
  const lookAt = new Vector3();
  let looking = false;
  let touchLabel: string | null = null;
  let perfMs = 0;
  let perfN = 0;
  /** The pole resting on the gunwale while the camera or the phone is up (0‥1, eased). */
  let propW = 0;
  let calmT = 0;
  let lastNight = -1;

  const line: Vector3[] = Array.from({ length: LINE_POINTS }, () => new Vector3());

  function go(next: Phase): void {
    phase = next;
    pt = 0;
    Object.assign(from, rod);
  }

  /** A random number 0‥1 (seeded: by the time while playing, fixed in shots). */
  const rnd = () => rng();
  function seed(ctx: RoamCtx): void {
    if (seeded) return;
    seeded = true;
    rng = mulberry32(ctx.shot ? 20260927 : (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0);
  }

  // ── The pole ────────────────────────────────────────────────────────────

  /** `out` = a blend of two poses of the pole (the azimuth the short way round). */
  function blend(out: RodPose, a: RodPose, b: RodPose, k: number): RodPose {
    out.x = lerp(a.x, b.x, k);
    out.y = lerp(a.y, b.y, k);
    out.z = lerp(a.z, b.z, k);
    out.az = a.az + angleDiff(b.az, a.az) * k;
    out.el = lerp(a.el, b.el, k);
    return out;
  }
  /** A key pose aimed (its azimuth added to `az`), into `out`. */
  const aimed = (p: RodPose, out: RodPose, az = aim): RodPose => Object.assign(out, p, { az: az + p.az });

  /** Draw the pole where `rod` says, bent towards `pull` (world, from the tip); the tip and the fist (world) come back. */
  function drawRod(boat: FishBoat, k: number, pull: Vector3 | null): void {
    const hull = boat.hull;
    _v.set(Math.sin(rod.az) * Math.cos(rod.el), Math.sin(rod.el), Math.cos(rod.az) * Math.cos(rod.el));
    _p.set(rod.x, rod.y, rod.z).addScaledVector(_v, -ROD_HOLD).applyMatrix4(hull.matrix);
    _v.applyQuaternion(hull.quaternion);
    gear.rod(_p, _v, bend, pull, k, tip, fist);
  }

  // ── The float and the line ──────────────────────────────────────────────

  /** The float hanging from the tip (a pendulum on its line), before a cast and after a catch. */
  function dangle(dt: number, k: number, level: number): void {
    const len = HANG * k;
    if (!floatOn) {
      fp.copy(tip).addScaledVector(UP, -len);
      fPrev.copy(fp);
      floatOn = true;
    }
    _v.subVectors(fp, fPrev).multiplyScalar(0.985);
    fPrev.copy(fp);
    fp.add(_v).addScaledVector(UP, -9.8 * k * dt * dt);
    _w.subVectors(fp, tip);
    const l = _w.length();
    if (l > len) fp.copy(tip).addScaledVector(_w, len / l);
    // (it floats: from a pole laid low in the boat it rests on the water)
    if (fp.y < level) fp.y = level;
    lie = 0;
  }

  /** The line from the tip to `end`, sagging by `sag` (m) in the middle; it lies on the water, never under it (`level`). */
  function curve(end: Vector3, sag: number, level: number): void {
    _q.addVectors(tip, end).multiplyScalar(0.5);
    _q.y = Math.max(Math.min(level + 0.02, _q.y), _q.y - sag);
    for (let i = 0; i < LINE_POINTS; i++) {
      const s = i / (LINE_POINTS - 1);
      const a = (1 - s) * (1 - s);
      const b = 2 * s * (1 - s);
      const c = s * s;
      const pt = line[i].set(a * tip.x + b * _q.x + c * end.x, a * tip.y + b * _q.y + c * end.y, a * tip.z + b * _q.z + c * end.z);
      if (pt.y < level + 0.004 && s < 0.98) pt.y = level + 0.004;
    }
    gear.line(line);
  }

  // ── Casting and biting ──────────────────────────────────────────────────

  /** Where to cast: open water of the same level 6–10 m out, over the right bow first; false if there is none. */
  function chooseCast(ctx: RoamCtx, boat: FishBoat): boolean {
    const { body } = ctx;
    const r = boat.river;
    const want = CAST[0] + (CAST[1] - CAST[0]) * rnd();
    const w = ctx.world;
    const lv0 = boat.level;
    // (open water of the boat's level, nothing built there: a raft, the jetty, a pier)
    const open = (x: number, z: number) => {
      const lv = r.levelAt(x, z);
      if (lv === null || Math.abs(lv - lv0) > 0.3 || r.bankAt(x, z, lv0) < 1.2) return false;
      const g = w.standAt ? w.standAt(x, z, lv0, 0.1, 0) : w.groundAt(x, z);
      return !Number.isNaN(g) && g < lv0 + 0.05;
    };
    // (the float lands with room round it)
    const ok = (x: number, z: number, land = false) => open(x, z) && (!land || [0, 1, 2, 3].every((q) => open(x + Math.cos(q * 1.57) * 1.4, z + Math.sin(q * 1.57) * 1.4)));
    for (const az of AIMS) {
      const yaw = body.yaw + az;
      const sx = Math.sin(yaw);
      const sz = Math.cos(yaw);
      // (all of the way there over open water)
      let clear = 0;
      for (let d = 2; d <= CAST[1]; d += 1) {
        if (!ok(body.pos.x + sx * d, body.pos.z + sz * d)) break;
        clear = d;
      }
      let d = Math.min(want, clear);
      while (d >= 5 && !ok(body.pos.x + sx * d, body.pos.z + sz * d, true)) d -= 1;
      if (d < 5) continue;
      aim = az;
      target.set(body.pos.x + sx * d, boat.level, body.pos.z + sz * d);
      return true;
    }
    return false;
  }

  /** Throw the float from where it hangs to land on `target`. */
  function launch(k: number): void {
    flying = thrown = true;
    flyT = 0;
    flyFor = 0.7 + len2(target.x - fp.x, target.z - fp.z) * 0.025;
    const g = FLY_G * k;
    fv.set((target.x - fp.x) / flyFor, (target.y - fp.y) / flyFor + 0.5 * g * flyFor, (target.z - fp.z) / flyFor);
  }

  /** The bite's schedule from now: sooner at dawn and dusk and in a light rain, later in a storm (never: checks). */
  function schedule(ctx: RoamCtx, never = false): void {
    waitT = 0;
    nibbles.length = 0;
    if (never) {
      nextBite = Infinity;
      return;
    }
    const w = ctx.weather;
    const twilight = 1 - Math.abs(2 * ctx.night - 1);
    const rain = w ? clamp(w.rain * 3, 0, 1) * clamp((0.75 - w.rain) * 3, 0, 1) : 0;
    const boost = clamp(twilight * 0.9 + rain * 0.8 - (w?.storm ?? 0) * 0.6, -0.5, 1.5);
    nextBite = 5 + 20 * Math.pow(rnd(), Math.max(0.4, 1 + 1.6 * boost));
    // (one to three nibbles first)
    const n = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const at = nextBite - 0.55 - i * (0.6 + rnd() * 0.5);
      if (at > 0.8) nibbles.push(at);
    }
  }

  /** It is nibbling (the last nibble has come): a strike now is too soon. */
  const nibbling = () => phase === 'wait' && nibbles.length > 0 && waitT > nibbles[nibbles.length - 1] - 0.05;

  // ── The fish ────────────────────────────────────────────────────────────

  /** The catch as he shows it (boat space): up by its lip in his left hand, out at his side; its back out, its snout up. */
  function showPose(hull: Object3D): void {
    hold.left.copy(SHOW_AT);
    fishAt.copy(SHOW_AT).addScaledVector(UP, -FIST_LOW).applyMatrix4(hull.matrix);
    fishBack.copy(SHOW_BACK).applyQuaternion(hull.quaternion);
    // (it sways a little, hanging from his fist)
    const sway = 0.12 * Math.sin(clock * 3.1);
    fishAxis.copy(UP).addScaledVector(SHOW_BACK, sway).normalize().applyQuaternion(hull.quaternion);
    grip = GRIP;
  }

  /** Draw the fish: snout along `fishAxis`, its back towards `fishBack` (else up), the point `grip` of its length (from the snout) at `fishAt`. */
  function placeFish(k: number): void {
    const L = (cm / 100) * k;
    _y.copy(fishBack).addScaledVector(fishAxis, -fishBack.dot(fishAxis));
    if (_y.lengthSq() < 0.01) _y.copy(UP).addScaledVector(fishAxis, -UP.dot(fishAxis));
    if (_y.lengthSq() < 1e-6) _y.set(1, 0, 0);
    _y.normalize();
    _x.crossVectors(_y, fishAxis).normalize();
    _v.copy(fishAt).addScaledVector(fishAxis, -(0.5 - grip) * L);
    _m.makeBasis(_x, _y, fishAxis).scale(_w.set(L, L, L)).setPosition(_v);
    gear.fish(kind, _m, flex);
    mouthAt.copy(fishAt).addScaledVector(fishAxis, grip * L);
    fishShown = true;
  }

  function hideFish(): void {
    gear.fish(null);
    fishShown = false;
  }

  /** Water flies: a splash where the fish breaks the surface or drops in (drops and a ring). */
  function splash(boat: FishBoat, x: number, z: number, size: number, k: number): void {
    const w = boat.wake;
    const y = boat.level;
    w.ring(x, y + 0.03, z, 0.1 * k * size, 1.4 * k * size, 1.6, 0.45);
    for (let i = 0; i < Math.round(4 + 6 * size); i++) {
      const a = rnd() * Math.PI * 2;
      const sp = (0.5 + rnd() * 1.2) * k * size;
      w.drop(x, y + 0.08 * k, z, Math.cos(a) * sp, (1.6 + rnd() * 2) * k * Math.sqrt(size), Math.sin(a) * sp, (0.05 + rnd() * 0.05) * k, 1.2, y);
    }
  }

  /** The strike: the fish is on; it will run from under the float to off the boat's side (the aim's side). */
  function startFight(ctx: RoamCtx, boat: FishBoat): void {
    const k = ctx.body.scale;
    fishFrom.set(fp.x, boat.level - 0.35 * k, fp.z);
    // (boat space: out from the side, a little ahead of him)
    fishTo.set(aim < 0 ? -1.5 : 1.5, -0.25, 0.7).applyMatrix4(boat.hull.matrix);
    fishTo.y = boat.level - 0.25 * k;
    fishAt.copy(fishFrom);
    const f = FISH[kind];
    const size = (cm - f.cm[0]) / Math.max(1, f.cm[1] - f.cm[0]);
    fightFor = 1.3 + 2.1 * f.fight * (0.45 + 0.55 * size);
    splashes = f.fight > 0.5 ? 2 : f.fight > 0.3 ? 1 : 0;
    reelT = 0;
    ctx.sound('reel', 0.75);
    go('fight');
  }

  /** In his hand: the sound, the words, its page in the nature book, a smile. */
  function landed(ctx: RoamCtx): void {
    const f = FISH[kind];
    ctx.sound('catch', 0.9);
    ctx.hud.toast(t('fiCaught', { km: f.km, say: f.say, cm: num(cm) }));
    newPage = activeJournal()?.record(kind, ctx.body.pos.x, ctx.body.pos.z, cm) ?? false;
    const ex = ctx.body.explorer;
    if (ex.currentExpression !== 'happy') faceBefore = ex.currentExpression;
    ex.setExpression('happy');
  }

  /** The smile goes (unless the player changed his face meanwhile). */
  function faceBack(ctx: RoamCtx): void {
    if (faceBefore && ctx.body.explorer.currentExpression === 'happy') ctx.body.explorer.setExpression(faceBefore);
    faceBefore = null;
  }

  /** A fish falling from his hand (let go, or dropped as he stops): into the water with a splash, then it swims off. */
  function fall(ctx: RoamCtx, boat: FishBoat, dt: number, k: number): void {
    fallV.y -= 9.8 * k * dt;
    fishAt.addScaledVector(fallV, dt);
    fishAxis.addScaledVector(UP, -dt * 2).normalize();
    placeFish(k);
    if (fishAt.y > boat.level) return;
    hideFish();
    splash(boat, fishAt.x, fishAt.z, 0.45, k);
    ctx.sound('release', 0.8);
    // (off it goes, out from the boat: a few streaks of foam)
    const b = ctx.body.pos;
    _v.set(fishAt.x - b.x, 0, fishAt.z - b.z).normalize();
    for (let q = 0; q < 3; q++) {
      const sp = (1.6 + q * 0.5) * k;
      boat.wake.foam(fishAt.x, boat.level + 0.03, fishAt.z, _v.x * sp, _v.z * sp, 0.12 * k, 0.3 * k, 0.3 * k, 0.9 * k, Math.atan2(_v.x, _v.z), 1.2 + q * 0.2, 0.3);
    }
    faceBack(ctx);
    if (newPage) {
      newPage = false;
      ctx.hud.toast(t('bkNew', { name: SPECIES_BY_KIND.get(kind)?.name[lang()] ?? kind }));
    }
  }

  // ── The camera ──────────────────────────────────────────────────────────

  function frameTo(ctx: RoamCtx, v: 'side' | 'show'): void {
    const cam = ctx.cam;
    before ??= { pitch: cam.pitch, distance: cam.distance, follow: cam.follow, minDistance: cam.minDistance };
    view = v;
    viewT = keepView ? FRAME_FOR : 0;
  }

  /**
   * The follow camera while he fishes: for a while after each change it
   * eases to its framing — from the side, a little behind, low (him on one
   * side, the float on the other), or round at his front for the catch —
   * then it is the player's; it looks between him and the float, or at the
   * fish in his hand. Done fishing, it goes back to the player's own.
   */
  function frameCam(ctx: RoamCtx, dt: number): void {
    const { cam, body } = ctx;
    const s = body.scale / 1.4;
    if (looked) viewT = FRAME_FOR;
    looked = false;
    if (phase !== 'off') cam.follow = 0;
    // (the catch is shown close: the boat's camera may come nearer than it lets the player zoom)
    if (before) cam.minDistance = view === 'show' ? SHOW_VIEW.dist * s * 0.9 : before.minDistance;
    if (view !== 'none' && viewT < FRAME_FOR && phase !== 'off') {
      viewT += dt;
      const e = 1 - Math.exp(-1.7 * dt);
      const f = view === 'side' ? (cam.camera.aspect < 0.8 ? SIDE_TALL : SIDE_VIEW) : SHOW_VIEW;
      cam.yaw += angleDiff(body.yaw + f.yaw + (view === 'side' ? aim : 0), cam.yaw) * e;
      cam.pitch += (f.pitch - cam.pitch) * e;
      cam.distance += (f.dist * s - cam.distance) * e;
    }
    const want = phase === 'off' || phase === 'take' || phase === 'stow' ? 0 : 1;
    focusW += (want - focusW) * (1 - Math.exp(-dt * 2));
    if (focusW > 0.001) {
      const f = cam.focus;
      f.x += (focusAt.x - f.x) * focusW;
      f.y += (focusAt.y - f.y) * focusW;
      f.z += (focusAt.z - f.z) * focusW;
    }
    // Done fishing: back to the player's own view, and the camera follows the boat again.
    if (phase === 'off' && before) {
      const e = 1 - Math.exp(-2.2 * dt);
      cam.pitch += (before.pitch - cam.pitch) * e;
      cam.distance += (before.distance - cam.distance) * e;
      if (Math.abs(before.pitch - cam.pitch) < 0.005 && Math.abs(before.distance - cam.distance) < 0.05) {
        cam.follow = before.follow;
        cam.minDistance = before.minDistance;
        before = null;
        view = 'none';
      }
    }
  }

  // ── Starting ────────────────────────────────────────────────────────────

  const canFish = (boat: FishBoat) => boat.afloat && boat.speed < SLOW && boat.current < FAST;

  function start(ctx: RoamCtx, boat: FishBoat): void {
    if (!boat.afloat) return;
    const hud = ctx.hud;
    if (boat.speed >= SLOW) return hud.toast(t('fiSlowDown'));
    if (boat.current >= FAST) return hud.toast(t('fiTooFast'));
    const fallAhead = boat.river.fallNear(ctx.body.pos.x, ctx.body.pos.z, FALLS);
    if (fallAhead && Math.abs(fallAhead.top - boat.level) < 0.6) return hud.toast(t('fiFalls'));
    seed(ctx);
    if (!chooseCast(ctx, boat)) return hud.toast(t('fiNoRoom'));
    Object.assign(rod, STOWED);
    bend = 0;
    floatOn = flying = thrown = retake = false;
    hideFish();
    go('take');
    // (the camera comes round to the side as he reaches for the pole)
    frameTo(ctx, 'side');
    if (!howToShown) {
      howToShown = true;
      hud.toast(t(document.body.classList.contains('roam-touch') ? 'fiHowToTouch' : 'fiHowTo'));
    }
  }

  /** The cast from the start: the float hanging, not yet thrown (the camera eases on to the side, for the aim of this cast). */
  function toCast(ctx: RoamCtx): void {
    floatOn = flying = thrown = false;
    fv.set(0, 0, 0);
    if (view !== 'side' || viewT >= FRAME_FOR) frameTo(ctx, 'side');
    go('cast');
  }

  // ── The steps ───────────────────────────────────────────────────────────

  /** The timeline of the phase: the pole's pose, his body's, the fish; the moments (sounds, rings, words). */
  function timeline(ctx: RoamCtx, dt: number, boat: FishBoat): void {
    const { body } = ctx;
    const k = body.scale;
    const level = boat.level;
    const hull = boat.hull;
    const device = body.explorer.currentAction === 'photo' || body.explorer.currentAction === 'selfie';
    // His defaults: relaxed, leaning back a little, turned a little towards the aim, looking at the float.
    hold.lean = -0.06;
    hold.twist = clamp(aim * 0.3, -0.25, 0.15);
    hold.tilt = 0;
    hold.rightW = 1;
    hold.leftW = 0;
    rightOnRod = true;
    hold.poleR.set(-0.7, -1, -0.3).normalize();
    looking = floatOn;
    lookAt.copy(fp);
    switch (phase) {
      case 'take': {
        // Reach down to the pole at his right side (laid in the boat, or laid down for the catch), then lift it up and out.
        hold.w = retake ? 1 : ease(pt / 0.35);
        hold.rightW = ease(pt / T_GRAB);
        hold.right.set(STOWED.x, STOWED.y, STOWED.z);
        const up = ease((pt - T_GRAB) / 0.6);
        hold.lean = lerp(0.22, -0.06, up);
        hold.tilt = lerp(0.14, 0, up);
        hold.twist = lerp(-0.2, hold.twist, up);
        looking = false;
        if (pt < T_GRAB) Object.assign(rod, STOWED);
        else {
          if (!gear.shown) {
            gear.show(true);
            boat.stowed(false);
            ctx.sound('boatIn', 0.25);
          }
          blend(rod, STOWED, aimed(PRE, pa), ease((pt - T_GRAB) / (T_TAKE - T_GRAB)));
        }
        if (pt >= T_TAKE) {
          if (retake && !chooseCast(ctx, boat)) {
            ctx.hud.toast(t('fiNoRoom'));
            api.stop(ctx, true);
            break;
          }
          retake = false;
          toCast(ctx);
        }
        break;
      }
      case 'cast': {
        // Back over the shoulder, a flick forward (the float flies), the pole settles out ahead.
        hold.w = 1;
        if (pt < T_BACK) {
          blend(rod, from, aimed(BACK, pa), ease(pt / T_BACK));
          hold.poleR.set(-1, -0.35, -0.1).normalize();
          hold.lean = -0.14;
          hold.twist -= 0.2;
        } else if (pt < T_BACK + T_FLICK) {
          const u = (pt - T_BACK) / T_FLICK;
          blend(rod, aimed(BACK, pa), aimed(FLICK, pb), u * u * (3 - 2 * u));
          hold.lean = lerp(-0.14, 0.14, u);
        } else blend(rod, aimed(FLICK, pa), aimed(READY, pb), ease((pt - T_BACK - T_FLICK) / T_SETTLE));
        if (!thrown && pt >= T_RELEASE && floatOn) {
          launch(k);
          ctx.sound('cast', 0.8);
        }
        break;
      }
      case 'wait': {
        // The pole held out, swaying a little; the float bobs; nibbles, then the bite.
        hold.w = 1;
        const out = aimed(READY, pa);
        out.el += 0.015 * Math.sin(clock * 0.8) + (twitch > 0 ? 0.2 * Math.sin(Math.PI * (1 - twitch / 0.35)) : 0);
        out.az += 0.012 * Math.sin(clock * 0.53);
        // (the camera or the phone up: the pole rests on the gunwale, no hand on it; the fish wait)
        propW += ((device ? 1 : 0) - propW) * (1 - Math.exp(-dt * 6));
        if (propW > 0.001) {
          out.x = lerp(out.x, -0.3, propW);
          out.y = lerp(out.y, 0.3, propW);
          out.el = lerp(out.el, 0.3, propW);
          hold.rightW = 1 - propW;
        }
        if (!device) waitT += dt;
        blend(rod, from, out, ease(pt / 0.5));
        bend = 0.06;
        for (const n of nibbles)
          if (waitT >= n && waitT - dt < n) {
            dip = 0.25;
            boat.wake.ring(fp.x, level + 0.03, fp.z, 0.04, 0.32 * k, 0.9, 0.22);
          }
        if (waitT >= nextBite) {
          // The bite: which fish, how big (the water decides who is there).
          kind = pickFish(waterKind(boat.field, fp.x, fp.z), rnd());
          cm = catchLength(kind, rnd());
          floatYaw = rnd() * Math.PI * 2;
          ctx.sound('bite', 1);
          boat.wake.ring(fp.x, level + 0.03, fp.z, 0.06, 0.9 * k, 1.3, 0.45);
          boat.wake.ring(fp.x, level + 0.03, fp.z, 0.04, 0.5 * k, 0.9, 0.35);
          go('bite');
        }
        break;
      }
      case 'bite': {
        hold.w = 1;
        aimed(READY, rod);
        rod.el -= 0.03 * ease(pt / 0.2);
        bend = 0.22;
        if (pt > BITE_WINDOW) {
          // Too late: the float pops back up.
          ctx.hud.toast(t('fiGotAway'));
          fp.y = level;
          boat.wake.ring(fp.x, level + 0.03, fp.z, 0.05, 0.7 * k, 1.1, 0.3);
          grace = GRACE;
          schedule(ctx, noBite);
          go('wait');
        }
        break;
      }
      case 'fight': {
        // The strike (a jerk up), then the fish runs this way and that, splashing, and tires.
        hold.w = 1;
        const u = Math.min(1, pt / fightFor);
        fishAt.lerpVectors(fishFrom, fishTo, ease(u));
        _v.subVectors(fishTo, fishFrom).setY(0);
        const l = _v.length() || 1;
        const zig = Math.sin(pt * 2.4) * 0.9 * k * (1 - u);
        fishAt.x += (-_v.z / l) * zig;
        fishAt.z += (_v.x / l) * zig;
        const bearing = angleDiff(Math.atan2(fishAt.x - body.pos.x, fishAt.z - body.pos.z), body.yaw);
        const want = aimed(FIGHT, pa, clamp(bearing, -1.3, 0.5));
        want.y += 0.02 * Math.sin(clock * 11.3) * (1 - u);
        want.el += 0.07 * Math.sin(clock * 6.7);
        blend(rod, from, want, ease(pt / 0.18));
        const f = FISH[kind];
        bend = (0.45 + 0.35 * f.fight) * (1 - 0.3 * u) + 0.14 * Math.abs(Math.sin(clock * 8.3));
        hold.lean = 0.08;
        hold.twist = clamp(bearing * 0.35, -0.4, 0.2);
        looking = true;
        lookAt.copy(fishAt);
        // The float rides on the line near the fish, on its side; foam where the fish swirls.
        _v.subVectors(tip, fishAt).normalize();
        fp.copy(fishAt).addScaledVector(_v, 0.55 * k);
        fp.y = clamp(fp.y, level - 0.01, level + 0.02);
        lie = 0.85;
        floatYaw = Math.atan2(_v.x, _v.z);
        if ((ringT -= dt) <= 0) {
          ringT = 0.28;
          boat.wake.ring(fp.x, level + 0.03, fp.z, 0.04, 0.35 * k, 0.8, 0.28);
          boat.wake.foam(fishAt.x, level + 0.03, fishAt.z, 0, 0, 0.1 * k, 0.15 * k, 0.35 * k, 0.5 * k, rnd() * 6.28, 1.0, 0.3);
        }
        // (a thrash at the top: drops and a slap)
        if (splashes > 0 && u > (splashes === 2 ? 0.4 : 0.75)) {
          splashes--;
          splash(boat, fishAt.x, fishAt.z, 0.7, k);
          ctx.sound('splash', 0.3);
        }
        if ((reelT += dt) > 1.1 && u < 0.85) {
          reelT = 0;
          ctx.sound('reel', 0.45);
        }
        if (u >= 1) {
          // Out it comes.
          splash(boat, fishAt.x, fishAt.z, 1, k);
          ctx.sound('splash', 0.4);
          fishFrom.set(fishAt.x, level, fishAt.z);
          go('lift');
        }
        break;
      }
      case 'lift': {
        // Up out of the water on the line, swung in to his left hand out at his side.
        hold.w = 1;
        const u = Math.min(1, pt / T_LIFT);
        blend(rod, from, LIFT, ease(pt / 0.5));
        bend = 0.3;
        _p.copy(SHOW_AT).addScaledVector(UP, -FIST_LOW).applyMatrix4(hull.matrix);
        // (along a curve through a point well above the gunwale)
        _q.lerpVectors(fishFrom, _p, 0.5);
        _q.y = Math.max(fishFrom.y, _p.y) + 0.9 * k;
        const e = ease(u);
        const a = (1 - e) * (1 - e);
        const b = 2 * e * (1 - e);
        const c = e * e;
        fishAt.set(a * fishFrom.x + b * _q.x + c * _p.x, a * fishFrom.y + b * _q.y + c * _p.y, a * fishFrom.z + b * _q.z + c * _p.z);
        hold.left.copy(SHOW_AT);
        hold.leftW = ease((u - 0.5) / 0.5);
        hold.twist = 0.12;
        hold.lean = 0.04;
        looking = true;
        lookAt.copy(fishAt);
        flex = 0.55 * Math.sin(clock * 13);
        // (hanging from its mouth, snout up to the tip; its back out to his side as the hand takes it)
        grip = GRIP * ease((u - 0.6) / 0.4);
        fishAxis.subVectors(tip, fishAt).normalize();
        fishBack.copy(SHOW_BACK).applyQuaternion(hull.quaternion);
        if (u >= 1) {
          // In his hand: off the hook (the float hangs from the tip again), and shown.
          landed(ctx);
          frameTo(ctx, 'show');
          floatOn = false;
          dropT = 0;
          go('hold');
        }
        break;
      }
      case 'hold': {
        // He lays the pole down along the boat (his right hand back to the paddle) and holds the fish up
        // by its lip, out at his side, to the camera, smiling; wet, and wriggling now and then.
        hold.w = 1;
        blend(rod, from, STOWED, ease(pt / T_LAY));
        bend = 0;
        if (pt >= T_LAY) {
          rightOnRod = false;
          hold.right.set(STOWED.x, STOWED.y, STOWED.z);
          hold.rightW = 1 - ease((pt - T_LAY) / 0.35);
        }
        showPose(hull);
        // (lifted a little as he shows it)
        const up = 0.04 * ease((pt - T_LAY) / 0.5);
        hold.left.y += up;
        fishAt.addScaledVector(UP, up * k);
        hold.leftW = 1;
        hold.twist = 0.18;
        hold.tilt = -0.06;
        hold.lean = 0.02;
        // (he looks at the fish, then at the camera, pleased)
        looking = true;
        if (pt < T_LAY + 0.5) lookAt.copy(fishAt);
        else lookAt.copy(ctx.cam.camera.position);
        flex = 0.45 * Math.sin(clock * 12) * (pt % 1.2 < 0.35 ? 1 : 0.08);
        if ((dropT -= dt) <= 0 && pt < 2) {
          dropT = 0.12;
          // (drips from its tail)
          _v.copy(fishAt).addScaledVector(fishAxis, -(cm / 100) * k * 0.9);
          boat.wake.drop(_v.x + (rnd() - 0.5) * 0.05 * k, _v.y, _v.z + (rnd() - 0.5) * 0.05 * k, 0, -0.2, 0, 0.025 * k, 1.2, level);
        }
        if (pt >= T_HOLD) {
          fell = false;
          go('release');
        }
        break;
      }
      case 'release': {
        // He leans over the left side, lowers it to the water, tail first, and lets go; it drops in and swims off.
        hold.w = 1;
        Object.assign(rod, STOWED);
        rightOnRod = false;
        hold.right.set(STOWED.x, STOWED.y, STOWED.z);
        hold.rightW = 0;
        const u = ease(pt / T_LET_GO);
        const back = fell ? 1 - ease((pt - T_LET_GO) / 0.6) : 1;
        hold.leftW = fell ? 1 - ease((pt - T_LET_GO - 0.15) / 0.45) : 1;
        hold.left.lerpVectors(SHOW_AT, LET_GO_AT, u);
        hold.lean = lerp(0.02, 0.24, u) * back;
        hold.tilt = lerp(-0.06, -0.3, u) * back;
        hold.twist = lerp(0.18, 0.3, u) * back;
        looking = true;
        if (!fell) {
          fishAt.copy(hold.left).addScaledVector(UP, -FIST_LOW).applyMatrix4(hull.matrix);
          fishBack.copy(SHOW_BACK).applyQuaternion(hull.quaternion);
          fishAxis.copy(UP).applyQuaternion(hull.quaternion);
          flex = 0.3 * Math.sin(clock * 10);
          if (pt >= T_LET_GO) {
            fell = true;
            fallV.set(0, -0.5 * k, 0);
          }
        } else if (fishShown) fall(ctx, boat, dt, k);
        lookAt.copy(fishAt);
        if (pt >= T_LET_GO_ALL) {
          if (fishShown) hideFish();
          grace = 0.3;
          frameTo(ctx, 'side');
          // (and he takes the pole up again)
          retake = true;
          go('take');
        }
        break;
      }
      case 'stow': {
        // The float reeled in, the pole laid back along the boat's side, the hands back on the paddle.
        looking = false;
        if (pt < T_LAID) {
          hold.w = 1;
          blend(rod, from, STOWED, ease(pt / T_LAID));
          hold.lean = lerp(-0.06, 0.2, ease(pt / T_LAID));
          hold.tilt = lerp(0, 0.12, ease(pt / T_LAID));
        } else {
          if (gear.shown) {
            gear.show(false);
            boat.stowed(true);
            ctx.sound('boatIn', 0.2);
          }
          Object.assign(rod, STOWED);
          hold.w = 1 - ease((pt - T_LAID) / (T_STOW - T_LAID));
          hold.lean = 0.2;
          hold.tilt = 0.12;
        }
        // (a fish in his hand drops back into the water)
        if (fishShown && !fell) {
          fell = true;
          fallV.set(0, 0, 0);
        }
        if (fishShown) fall(ctx, boat, dt, k);
        if (pt >= T_STOW) {
          phase = 'off';
          pt = 0;
          hold.w = hold.rightW = hold.leftW = 0;
          gear.show(false);
          boat.stowed(true);
          view = 'none';
        }
        break;
      }
    }
  }

  /** The float: hanging, flying, on the water (drifting, bobbing, dipping, under). */
  function floatStep(ctx: RoamCtx, dt: number, boat: FishBoat): void {
    const k = ctx.body.scale;
    const level = boat.level;
    if ((phase === 'take' && !retake) || phase === 'off') {
      floatOn = false;
      return;
    }
    // (hanging from the tip: before a cast, and off the hook once the fish is in his hands)
    if ((phase === 'cast' && !thrown) || phase === 'hold' || phase === 'release' || phase === 'take') dangle(dt, k, level);
    else if (phase === 'lift') {
      // (on the line between the tip and the fish's mouth)
      floatOn = true;
      fp.lerpVectors(tip, mouthAt, 0.45);
    } else if (phase === 'stow') {
      // (reeled in to the tip, then gone)
      if (floatOn) {
        fp.lerp(tip, 1 - Math.exp(-dt * 10));
        if (fp.distanceTo(tip) < 0.2 * k || pt > 0.35) floatOn = false;
      }
    }
    if (flying) {
      flyT += dt;
      fv.y -= FLY_G * k * dt;
      fp.addScaledVector(fv, dt);
      if (flyT >= flyFor) {
        // Plop (the sound of the float in the water: `bite`, softer than a bite).
        flying = false;
        fp.copy(target);
        ctx.sound('bite', 0.9);
        boat.wake.ring(fp.x, level + 0.03, fp.z, 0.06, 1.0 * k, 1.8, 0.45);
        boat.wake.ring(fp.x, level + 0.03, fp.z, 0.04, 0.55 * k, 1.2, 0.35);
        for (let q = 0; q < 4; q++) {
          const a = rnd() * 6.28;
          boat.wake.drop(fp.x, level + 0.03, fp.z, Math.cos(a) * 0.4 * k, (1.1 + rnd()) * k, Math.sin(a) * 0.4 * k, 0.035 * k, 0.8, level);
        }
        lineLen = Math.max(4, fp.distanceTo(tip) * 1.03);
        schedule(ctx, noBite);
        go('wait');
      }
    }
    if (phase === 'wait' || phase === 'bite') {
      // On the water: drifting with the current (slowly, as the boat), bobbing; kept within the line's reach.
      boat.river.flowAt(fp.x, fp.z, _flow);
      fp.x += _flow.x * DRIFT * dt;
      fp.z += _flow.z * DRIFT * dt;
      _v.subVectors(fp, tip).setY(0);
      const l = _v.length();
      if (l > lineLen) fp.addScaledVector(_v, -(l - lineLen) / l);
      dip = Math.max(0, dip - dt);
      if (phase === 'bite') {
        // (pulled under, and off to one side)
        fp.y = level - 0.12 * k * ease(pt / 0.2);
        fp.x += Math.sin(floatYaw) * 0.3 * k * dt;
        fp.z += Math.cos(floatYaw) * 0.3 * k * dt;
        lie = 0.4 * ease(pt / 0.3);
      } else {
        const d = dip > 0 ? Math.sin((dip / 0.25) * Math.PI) * 0.03 * k : 0;
        fp.y = level + (0.006 * Math.sin(clock * 2.1) + 0.004 * Math.sin(clock * 3.3 + 1)) * k - d;
        lie = 0;
        if ((ringT -= dt) <= 0) {
          ringT = 2.4 + rnd();
          boat.wake.ring(fp.x, level + 0.03, fp.z, 0.04, 0.3 * k, 1.6, 0.1);
        }
      }
    }
  }

  /** Draw it all: the pole (bent towards what pulls), the fish, the line and the float. */
  function draw(ctx: RoamCtx, boat: FishBoat): void {
    const k = ctx.body.scale;
    const level = boat.level;
    if (!gear.shown) return;
    const onFish = phase === 'fight' || phase === 'lift';
    // (the pull from the last tip: a frame's lag, unseen)
    const pull = onFish ? _w.subVectors(phase === 'fight' ? fishAt : mouthAt, tip) : phase === 'wait' || phase === 'bite' ? _w.subVectors(fp, tip) : null;
    if (pull) pull.normalize();
    drawRod(boat, k, pull);
    if (phase === 'lift' || phase === 'hold' || (phase === 'release' && !fell)) placeFish(k);
    if (phase === 'fight') curve(fishAt, 0, level - 10);
    else if (onFish) curve(mouthAt, 0, level);
    else if (floatOn) {
      const sag = phase === 'wait' ? Math.max(0.2, 0.08 * lineLen) : phase === 'bite' ? 0.05 : flying ? 0.15 * k : 0;
      curve(fp, sag, flying || !thrown ? level - 10 : level);
    } else gear.line(null);
    gear.float(floatOn ? fp : null, k, lie, floatYaw);
    gear.flush();
  }

  const api: Fishing = {
    object: gear.object,
    hold,
    get active() {
      return phase !== 'off';
    },
    get drift() {
      return phase === 'off' ? 1 : DRIFT;
    },
    input(ctx, boat) {
      const i = ctx.input;
      const f = !!i.taps?.has('KeyF') || takeTouchFish();
      const device = ctx.body.explorer.currentAction === 'photo' || ctx.body.explorer.currentAction === 'selfie';
      if (i.lookYaw || i.lookPitch) looked = true;
      if (phase === 'off') {
        if (f && !device) start(ctx, boat);
        return;
      }
      const move = len2(i.move.x, i.move.y) > 0.3;
      const strike = f || i.jump || i.click;
      if (phase === 'stow') {
        // (laying the pole down: nothing more to do)
      } else if (move || i.use) api.stop(ctx, true);
      else if (grace > 0) {
        // (a late press after a miss: nothing)
      } else if (phase === 'bite' && strike) startFight(ctx, boat);
      else if (nibbling() && strike) {
        // Too soon: it was only nibbling; it swims off (a swirl), another will come.
        ctx.hud.toast(t('fiEarly'));
        twitch = 0.35;
        boat.wake.ring(fp.x, boat.level + 0.03, fp.z, 0.05, 0.8 * ctx.body.scale, 1.2, 0.3);
        schedule(ctx, noBite);
        grace = GRACE;
      } else if (phase === 'wait' && (i.jump || i.click) && !device) {
        // A twitch: the float skips a little towards him.
        twitch = 0.35;
        _v.subVectors(tip, fp).setY(0);
        const l = _v.length();
        if (l > 1) fp.addScaledVector(_v, 0.28 / l);
        boat.wake.ring(fp.x, boat.level + 0.03, fp.z, 0.04, 0.45 * ctx.body.scale, 0.9, 0.25);
      } else if (f && (phase === 'wait' || phase === 'cast' || phase === 'take')) api.stop(ctx, true);
      // (the paddle is on his lap: no paddling, no stepping ashore meanwhile)
      i.move.x = i.move.y = 0;
      i.use = i.jump = i.click = false;
    },
    place(ctx, dt, boat) {
      if (phase === 'off') {
        calmT = canFish(boat) ? calmT + dt : 0;
        frameCam(ctx, dt);
        return;
      }
      const perf0 = ctx.shot ? performance.now() : 0;
      pt += dt;
      clock += dt;
      grace = Math.max(0, grace - dt);
      twitch = Math.max(0, twitch - dt);
      boat.hull.updateMatrix();
      timeline(ctx, dt, boat);
      // (put away just now: the camera goes back)
      if ((phase as Phase) === 'off') {
        frameCam(ctx, dt);
        return;
      }
      floatStep(ctx, dt, boat);
      draw(ctx, boat);
      // His body: the fists where the pole and the fish are; his head towards what he watches.
      const { body } = ctx;
      const k = body.scale;
      if (rightOnRod) hold.right.set(rod.x, rod.y, rod.z);
      const e = 1 - Math.exp(-dt * 4);
      if (looking) {
        hold.lookYaw += (angleDiff(Math.atan2(lookAt.x - body.pos.x, lookAt.z - body.pos.z), body.yaw) - hold.lookYaw) * e;
        const dist = len2(lookAt.x - body.pos.x, lookAt.z - body.pos.z);
        hold.lookPitch += (clamp(Math.atan2(body.pos.y + 1.2 * k - lookAt.y, Math.max(0.5, dist)), -0.4, 0.6) - hold.lookPitch) * e;
      } else {
        hold.lookYaw += (hold.twist - hold.lookYaw) * e;
        hold.lookPitch += (0.25 - hold.lookPitch) * e;
      }
      // The camera: between him and the float (or the fish in his hand).
      const chest = body.pos.y + 1.15 * k;
      if (phase === 'lift' || phase === 'hold' || (phase === 'release' && !fell)) {
        // (his face and the fish's middle)
        _v.copy(fishAt).addScaledVector(fishAxis, -(cm / 200) * k);
        focusAt.set((body.pos.x + _v.x) / 2, (chest + 0.35 * k + _v.y) / 2, (body.pos.z + _v.z) / 2);
      }
      else {
        const f = phase === 'wait' || phase === 'bite' || phase === 'fight' ? fp : target;
        focusAt.set(body.pos.x + (f.x - body.pos.x) * 0.35, chest - 0.2 * k, body.pos.z + (f.z - body.pos.z) * 0.35);
      }
      frameCam(ctx, dt);
      // (checks: its cost, once, in a shot)
      if (ctx.shot && perfN < 60) {
        perfMs += performance.now() - perf0;
        if (++perfN === 60) console.info(`[map] fishing: ${(perfMs / perfN).toFixed(3)} ms a step (CPU, average of ${perfN}) · ${phase}`);
      }
    },
    prompt(boat) {
      let text: string | null = null;
      let touch: string | null = null;
      if (phase === 'off') {
        if (calmT > 1) text = `F  ${t('fiFish')}`;
        if (canFish(boat)) touch = t('fiFish');
      } else if (phase === 'bite') {
        text = `F  ${t('fiStrike')}`;
        touch = t('fiStrike');
      } else if (phase === 'wait' && !nibbling()) text = `F  ${t('fiStop')}`;
      if (touch !== touchLabel) {
        touchLabel = touch;
        setTouchFish(touch, phase === 'bite');
      }
      return text;
    },
    stop(ctx, soft) {
      if (phase === 'off') {
        if (!soft && touchLabel) setTouchFish((touchLabel = null));
        return;
      }
      if (soft) {
        if (phase === 'stow') return;
        flying = false;
        go('stow');
        return;
      }
      // At once: everything put away (leaving the boat, going over a fall).
      phase = 'off';
      pt = 0;
      gear.show(false);
      hideFish();
      floatOn = flying = thrown = false;
      hold.w = hold.rightW = hold.leftW = 0;
      faceBack(ctx);
      setTouchFish((touchLabel = null));
      const cam = ctx.cam;
      if (before) {
        cam.pitch = before.pitch;
        cam.distance = before.distance;
        cam.follow = before.follow;
        cam.minDistance = before.minDistance;
        before = null;
      }
      view = 'none';
      focusW = 0;
    },
    fromUrl(params, ctx, boat) {
      const spec = params.get('fishing');
      if (!spec) return;
      const [what, name] = spec.split(':');
      keepView = params.has('rcam');
      seed(ctx);
      if (name && (FISH_KINDS as readonly string[]).includes(name)) kind = name as FishKind;
      const c = Number(params.get('fishcm'));
      cm = Number.isFinite(c) && c > 0 ? Math.round(c) : Math.round((FISH[kind].cm[0] + FISH[kind].cm[1]) / 2);
      if (what === '1' || what === 'take') return start(ctx, boat);
      if (!chooseCast(ctx, boat)) return;
      // Straight into the moment asked for: the pole already in his hand, out of the boat.
      const k = ctx.body.scale;
      boat.stowed(false);
      gear.show(true);
      hold.w = 1;
      boat.hull.updateMatrix();
      aimed(what === 'cast' ? PRE : READY, rod);
      drawRod(boat, k, null);
      noBite = what !== 'bite';
      if (what === 'cast') return toCast(ctx);
      frameTo(ctx, what === 'catch' || what === 'hold' || what === 'release' ? 'show' : 'side');
      fp.copy(target);
      floatOn = thrown = true;
      lineLen = Math.max(4, fp.distanceTo(tip) * 1.03);
      schedule(ctx, true);
      go('wait');
      if (what === 'bite') nextBite = 0;
      else if (what === 'fight') startFight(ctx, boat);
      else if (what === 'catch' || what === 'hold' || what === 'release') {
        // (the fish in his hand, the pole laid down)
        Object.assign(rod, STOWED);
        showPose(boat.hull);
        landed(ctx);
        floatOn = false;
        fell = false;
        go(what === 'release' ? 'release' : 'hold');
        if (what !== 'release') pt = T_LAY;
      }
    },
    frame(night) {
      if (Math.abs(night - lastNight) > 0.002) gear.light((lastNight = night));
    },
    report() {
      if (phase === 'off' || phase === 'stow') return null;
      const at = phase === 'take' || phase === 'cast' ? 'cast' : phase === 'wait' ? 'wait' : phase === 'bite' ? 'bite' : phase === 'fight' ? `fight:${kind}` : phase === 'release' ? `release:${kind}` : `catch:${kind}`;
      const sim = phase === 'cast' ? pt : phase === 'take' ? 0 : Math.max(0.4, Math.min(pt, 2));
      return { fishing: at, fishcm: String(cm), sim: `_:${sim.toFixed(1)}` };
    },
  };
  return api;
}
