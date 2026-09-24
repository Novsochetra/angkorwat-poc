import { BlockSet, masonry } from '../../BlockSet';
import { fromSheet } from '../../palette';
import { PieceBuilder } from '../../PieceBuilder';
import { rng, TEXEL, tone, type Rng } from '../../shapes';
import { stoneSurf } from '../../surface';
import { defineKitAsset, type KitPiece } from '../../types';
import { hash3, valueNoise3 } from '../../../voxel/random';
import { MossLayer, PROP_BROKEN, PROP_STONE_LOW, PROP_SURF } from './_masonry-props';
import {
  bar,
  blotch,
  boundsSince,
  box,
  Carver,
  centreSince,
  ellipsoid,
  emitMoss,
  lowestSince,
  moveSince,
  part,
  rotateSince,
  sdBox,
  smin,
  STATUE_MOSS,
  STATUE_STONE,
  stoneOf,
  tagOf,
  type CellInfo,
  type CellLook,
  type MossClump,
  type Part,
  type V3,
} from './_statue';

/**
 * §20 ③ Broken statue — damaged Khmer statues: a seated Buddha as the
 * detailed Buddha sheet draws it (a stepped plinth of three courses, the
 * crossed legs a wide stepped lap, hands in meditation, broad shoulders with
 * the arms hanging clear of the chest, a head with tiers of curls, long
 * earlobes and closed, downcast eyes; moss in clumps of little olive cubes on
 * the tops and running down the faces), its fallen head; a
 * seated figure that lost its head; a guardian's torso; and a broken
 * pedestal among rubble.
 *
 * The seated figures and the heads are carved on a half-texel grid (two cells
 * to a texel, so the stone pattern still lines up) as a few big stones (chest
 * plates, belly, arms, knees, shins…) that merge into one carved surface each
 * and meet in seams, like the chunky blocks of the sheet; the guardian torso
 * and the loose chunks, chunkier like the sheet's fragments, on whole texels.
 * The masses are kept bold and apart so a figure reads at a glance from any
 * side: a wide lap, a narrow waist, broad shoulders with the arms hanging
 * clear of the chest, a narrow neck and a big head whose brow, nose, lips and
 * ears are cut deep enough to cast shade.
 */

// Cell tags (colour) …
const STONE = 1;
const HAIR = 2;
const DARK = 3;
const BAND = 4;
const SOLE = 5;
const LINE = 6;
const SHADE = 7;
const EYE = 8;
// … and stones (cells of one stone merge; seams between stones).
const LEG_R = 1;
const LEG_L = 2;
const SHIN = 3;
const LOW_SHIN = 4;
const FOOT = 5;
const BELLY = 6;
const CHEST_R = 7;
const CHEST_L = 8;
const ARM_R = 9;
const ARM_L = 10;
const FORE_R = 11;
const FORE_L = 12;
const HEAD = 13;
const HAND_R = 14;
const HAND_L = 15;
const HIPS = 16;
const CHUNK = 17;
const NECK = 18;
const LAP = 19;
const WAIST = 20;
const PEC_R = 21;
const PEC_L = 22;
const YOKE = 23;
const BLADE_R = 24;
const BLADE_L = 25;
const SPINE = 26;
const SHOULDER_R = 27;
const SHOULDER_L = 28;
const EAR = 29;
const BROW = 30;
/** Curls: five stones in turn, so neighbouring curls always meet in a seam. */
const CURL = 32;

type Fn = (x: number, y: number, z: number) => Part;

const mul = (hex: number, k: number) => {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * k));
  const b = Math.min(255, Math.round((hex & 255) * k));
  return (r << 16) | (g << 8) | b;
};

const mod5 = (n: number) => ((n % 5) + 5) % 5;

// ── Head ─────────────────────────────────────────────────────────────────────
// Head-local texels: x = 0 on the axis, y = 0 under the chin, z = 0 the plane of
// the cheeks. Rows, columns and depths below are half-texel cells: r = floor(2y),
// c = floor(2|x|), zc = floor(2z) (the cheek's own cell is zc = -1; 0 and 1 stand proud).

/** Half-width of each row (cells), chin → crown: the jaw narrowing to the chin, a square skull; rows 10 up are the tiers of curls. */
const HEAD_W = [2, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 4, 2];
/** Back of each row (cells behind the cheek plane). */
const HEAD_BACK = [-7, -8, -9, -9, -9, -9, -9, -9, -9, -9, -9, -9, -9, -8, -7];
/** Front of the tiers (rows 10 up; cells in front of it are empty): flush with the forehead band, then set back. */
const TIER_FRONT = [1, 1, 0, -1, -2];
/** How far the back corners of each tier are rounded (cells): a dome rising to the topknot. */
const TIER_ROUND = [3, 3, 3, 2, 1];
/**
 * Face relief, right half (mirrored), columns from the axis out: cells in
 * front of the cheek plane per row (0 = flush, -1 = receding); `E` marks the
 * eye slits, `L` the mouth, `S` half shade, `B` the forehead band, `x`
 * outside the face. As the sheet draws it: a square chin, the mouth a dark
 * line, broad flat cheeks, a long nose standing three cells proud at its tip,
 * closed eyes as slits under a brow ridge that shades them, and the band over
 * it. (A nostril wing beside the tip, one cell proud, renders as a dark hole:
 * the tip stands alone.)
 */
const FACE_ROWS: string[] = [
  '+0 +0 x  x  x ', // chin
  '+0 +0 +0 +0 x ', // lower lip over the square jaw
  '0L 0L +0 +0 x ', // the mouth: a dark line across the lips
  '+0 +0 +0 +0 +0', // upper lip; the jaw widening to the cheeks
  '+3 +0 +0 +0 +0', // nose tip; cheeks
  '+3 +0 +0 +0 +0', // the long nose; lower lids
  '+2 -1E -1E -1E +0', // closed eyes, downcast: long slits between the lids
  '+2 +1 +1 +1 +1', // the brow ridge over the eyes, the nose rising to it
  '+1B +1B +1B +1B +1B', // forehead band
  '+1B +1B +1B +1B +1B', // forehead band under the curls
];
const FACE_REL = FACE_ROWS.map((row) => row.trim().split(/\s+/).map((s) => (s[0] === 'x' ? null : s[0] === '-' ? -Number(s[1]) : Number(s[0] === '+' ? s[1] : s[0]))));
const FACE_TAG = FACE_ROWS.map((row) => row.trim().split(/\s+/).map((s) => (s.includes('E') ? EYE : s.includes('L') ? LINE : s.includes('S') ? SHADE : s.includes('B') ? BAND : STONE)));

/** Inside a row's cross-section (cells `back` ≤ zc < `front`), the back corners rounded by `rb`. */
function inSkull(c: number, zc: number, w: number, back: number, front: number, rb: number): boolean {
  if (c >= w || zc < back || zc >= front) return false;
  if (c >= w - rb && zc < back + rb) return Math.hypot(c + 0.5 - (w - rb), zc + 0.5 - (back + rb)) <= rb;
  return true;
}

/** Curls cover the back of the head down to the nape and the sides above the ears (the tiers are all curls). */
function hairAt(r: number, c: number, zc: number): boolean {
  return (r >= 2 && zc <= -8) || (r >= 9 && c >= 4);
}

/**
 * Long ears standing clear of the face, as the sheet's front view draws them:
 * flat panels two cells wide from the brow down to the nose, joined to the
 * skull by a root set a cell further back (a column of shade between face
 * and ear), a dark hollow opening to the side, and the long lobe hanging
 * free of the jaw.
 */
function ear(r: number, c: number, zc: number): Part {
  if (c < 5 || c > 7 || zc < -8 || zc > -5) return 0;
  if (r >= 4 && r <= 8) {
    if (c === 5) return zc <= -6 ? part(STONE, EAR) : 0;
    if (zc < -7) return 0;
    const hollow = r >= 5 && r <= 7 && zc === -6;
    if (c === 7) return hollow ? 0 : part(STONE, EAR);
    return part(hollow ? DARK : STONE, EAR);
  }
  return c === 6 && r >= 1 && r <= 3 && zc === -6 ? part(STONE, EAR) : 0;
}

/**
 * A curl of the hair: a lump two cells wide and deep (or one), one tall, the
 * lumps of each tier set half a lump over from the tier below, so the hair
 * reads as rows of uneven knobs rather than a grid; neighbouring lumps are
 * different stones and meet in a seam.
 */
function curlAt(x: number, r: number, zc: number): Part {
  const o = r & 1;
  const cx = Math.floor(x * 2) + o;
  let lx = Math.floor(cx / 2);
  const lz = Math.floor((zc + o) / 2);
  // Some lumps are two curls of one cell each, so the knobs vary in size.
  if (hash3(lx, r, lz, 5) < 0.4) lx = 2 * lx + (cx & 1) + 1000;
  return part(HAIR, CURL + mod5(lx + 2 * r + 3 * lz));
}

/**
 * A Khmer Buddha head (Angkor Wat period), as the detailed sheet draws it: a
 * square face under a forehead band whose lower edge is the brow ridge, the
 * eyes closed and downcast under heavy lids, a long straight nose, full lips
 * with the corners turned up, a narrow chin; long earlobes; and the
 * hair as five tiers of curls rising in a dome to the topknot — `ushnisha` of
 * its top two rows are left (0‥2; the topknot is the first thing to break). More
 * curls are grown afterwards ({@link growCurls}).
 */
function buddhaHead(ushnisha: number): Fn {
  return (x, y, z) => {
    const r = Math.floor(y * 2);
    const c = Math.floor(Math.abs(x) * 2);
    const zc = Math.floor(z * 2);
    if (r < 0 || r >= FACE_ROWS.length + 3 + ushnisha) return 0;
    const w = HEAD_W[r];
    if (c >= w) return ear(r, c, zc);
    const curl = curlAt(x, r, zc);
    if (r >= FACE_ROWS.length) {
      // A tier: set in from the one below, the upper ones rounded at all four corners.
      const t = r - FACE_ROWS.length;
      const front = TIER_FRONT[t];
      if (!inSkull(c, zc, w, HEAD_BACK[r], front, TIER_ROUND[t])) return 0;
      return t >= 3 && c === w - 1 && (zc === front - 1 || zc === HEAD_BACK[r]) ? 0 : curl;
    }
    if (zc >= -3) {
      const rel = FACE_REL[r][c] ?? -3;
      if (zc >= rel) return 0;
      return part(zc === rel - 1 ? FACE_TAG[r][c] : STONE, r >= 8 ? BROW : HEAD);
    }
    if (!inSkull(c, zc, w, HEAD_BACK[r], 0, r < 3 ? 2 : 3)) return 0;
    return hairAt(r, c, zc) ? curl : part(STONE, HEAD);
  };
}

/**
 * Snail-shell curls: the hair is lumps (see {@link curlAt}), and here some
 * whole lumps stand a cell out — every other row down the back, fewer on the
 * sides and over the forehead — so the outline of the head is knobbly, as the
 * sheet draws it. The tiers' tops stay level.
 */
function growCurls(c: Carver, headY: number): void {
  /** x and z steps of the six sides (±x, ±y, ±z). */
  const STEP = [1, -1, 0, 0, 0, 0].map((dx, n) => [dx, n === 4 ? 1 : n === 5 ? -1 : 0]);
  const cell = c.cell / c.unit;
  c.grow(
    (p) => tagOf(p) === HAIR,
    (x, y, z, side, from) => {
      if (side === 2) return 0;
      // The lump grown from (as curlAt lays them, `headY` being the head's
      // y = 0 in the carver's design units), so a whole lump stands out.
      const j = Math.floor((y - headY) * 2 + 1e-6);
      const [dx, dz] = STEP[side];
      const lump = (v: number) => Math.floor((Math.floor(v * 2 + 1e-6) + (j & 1)) / 2);
      const h = hash3(lump(x - dx * cell) * 7 + side, j, lump(z - dz * cell), 23);
      const chance = side === 5 ? (j % 2 === 0 ? 0.5 : 0.1) : side === 4 ? 0.22 : 0.3;
      return h < chance ? from : 0;
    },
  );
}

// ── Seated body ──────────────────────────────────────────────────────────────
// Body-local texels: x = 0 on the axis, y = 0 on the seat (pedestal top), z = 0
// through the middle of the lap; the figure faces +z, its right hand is at -x.

type Mudra = 'meditation' | 'earth';

/** Body-local z = 0 lies half a texel behind the pedestal's centre (the lap reaches further forward than back). */
const LAP_Z = 0.5;
/** Where the head would sit (chin height above the seat) and the neck axis (body-local z). */
const CHIN_Y = 10.5;
const NECK_Z = -1.3;
/** Pedestal (texels): width, depth, height. */
const PED: V3 = [20, 12, 3];

/**
 * Seated in the Khmer manner (right leg over left): a wide oval of crossed
 * legs — buttocks under the trunk, thighs out to round knees at the sides, the
 * shins crossing in front as one roll (the right over the left, the two
 * stones meeting in a slant), the right foot sole-up on the left thigh; a
 * narrow waist and soft belly, two chest plates, shoulders sloping from the
 * neck to round deltoids, thick arms hanging a texel clear of the chest (dark
 * armpit slots, closed at the back so they read as shade, not sky) and the
 * forearms sloping down and in. `meditation`: the hands meet in the lap;
 * `earth` (touching the earth): the right forearm goes down over the right knee.
 */
function seatedBody(mudra: Mudra): Fn {
  const seat = box([0, 1.4, -1.6], [4.8, 1.4, 2.6], 0.8);
  const lap = box([0, 1.4, 1.4], [3.8, 1.4, 2.6], 0.6);
  const thigh = bar([2.5, 1.5, -1.3], [6.6, 1.5, 1.8], 2.0, 1.5, 0.8);
  const knee = ellipsoid([6.8, 1.75, 2.2], [1.95, 1.75, 2.6]);
  const shins = bar([-6.4, 1.3, 4.3], [6.4, 1.3, 4.3], 1.35, 1.3, 0.7);
  const foot = box([4.3, 2.9, 1.8], [1.5, 0.5, 1.0], 0.3);
  const waist = box([0, 3.2, -1.4], [3.6, 2.0, 2.6], 1.4);
  const belly = ellipsoid([0, 4.3, -0.4], [3.4, 1.8, 2.4]);
  const chest = box([0, 7.1, -1.3], [3.9, 2.1, 2.9], 1.8);
  const pecs = box([1.95, 7.25, 1.1], [1.85, 1.4, 0.9], 0.9);
  const lats = box([4.6, 5.4, -2.9], [1.4, 2.9, 1.3], 0.5);
  const haunch = box([5.9, 3.9, -2.6], [2.5, 1.6, 1.1], 0.4);
  const yoke = bar([0.5, 9.2, -1.3], [4.8, 7.9, -1.3], 1.9, 0.8, 0.7);
  const delt = ellipsoid([5.9, 7.9, -1.0], [1.9, 1.5, 1.8]);
  const upper = bar([6.0, 8.4, -1.0], [6.9, 4.8, -0.3], 1.3, 1.35, 1.0);
  const fore = bar([6.9, 4.9, -0.2], [2.4, 3.4, 2.6], 1.1, 1.0, 0.6);
  const reach = bar([-6.9, 4.9, -0.2], [-7.1, 3.4, 4.2], 1.1, 1.0, 0.6);
  const far = 99;
  return (x, y, z) => {
    const ax = Math.abs(x);
    if (ax > 9.3 || z > 5.9 || z < -4.6 || y > 10 || (y > 4.2 && (ax > 8.6 || z > 4.5))) return 0;
    const R = x < 0;
    // The legs stay below 3.6 texels, the chest and arms above 4.2; the stone
    // behind the arms (the back of the armpits and, where the arm reaches
    // down to the knee, the haunch behind the elbow) is left in down to the
    // seat, so the arms frame shade, never sky.
    const low = y < 3.6;
    const high = y > 4.2;
    const dSeat = low ? seat(x, y, z) : far;
    const dLap = low ? lap(x, y, z) : far;
    const dLegs = low ? Math.min(thigh(ax, y, z), knee(ax, y, z)) : far;
    const dShins = low ? shins(x, y, z) : far;
    const dFoot = low ? foot(x, y, z) : far;
    const back = y > 2.2 ? lats(ax, y, z) : far;
    const dHaunch = mudra === 'earth' && R && y < 5.6 ? haunch(ax, y, z) : far;
    const dTrunk = Math.min(waist(x, y, z), belly(x, y, z), back, dHaunch, high ? Math.min(chest(x, y, z), pecs(ax, y, z), yoke(ax, y, z)) : far);
    const dArm = high ? smin(delt(ax, y, z), upper(ax, y, z), 0.6) : far;
    const dFore = mudra === 'meditation' || !R ? fore(ax, y, z) : reach(x, y, z);
    // The stone a cell belongs to: the form it is deepest inside.
    let best = dSeat;
    let stone = HIPS;
    if (dLap < best) [best, stone] = [dLap, LAP];
    if (dLegs < best) [best, stone] = [dLegs, R ? LEG_R : LEG_L];
    if (dShins < best) [best, stone] = [dShins, (y - 1.3) * 2.3 > x ? SHIN : LOW_SHIN];
    if (dFoot < best) [best, stone] = [dFoot, FOOT];
    if (dTrunk < best) [best, stone] = [dTrunk, y < 5.2 ? BELLY : R ? CHEST_R : CHEST_L];
    if (dArm < best) [best, stone] = [dArm, R ? ARM_R : ARM_L];
    if (dFore < best) [best, stone] = [dFore, R ? FORE_R : FORE_L];
    if (best > 0) return 0;
    // The back wall of an armpit slot, only ever seen through it: in shade.
    const tag = stone === FOOT ? SOLE : ax > 4 && z > -2.6 && y > 2.5 && y < 7.8 && best === dTrunk ? SHADE : STONE;
    return part(tag, stone);
  };
}

/**
 * Hands in meditation: an oval of the two hands in the lap, right over left,
 * palms up, the thumb tips meeting over them.
 */
function meditationHands(x: number, y: number, z: number): Part {
  if (y < 2.5 || y >= 4) return 0;
  const o = (x / 2.8) ** 2 + ((z - 2.75) / 1.35) ** 2;
  if (o >= 1) return 0;
  // Lower (left) hand, its finger tips showing under the right hand.
  if (y < 3) return part(STONE, HAND_L);
  if (y < 3.5) return part(STONE, HAND_R);
  // The thumbs meet over the palms, near the wrists.
  return Math.abs(x) < 1 && z < 2.5 ? part(STONE, HAND_R) : 0;
}

/** Touching the earth: right hand over the right knee, fingers down to the pedestal; left hand in the lap. */
function earthHands(x: number, y: number, z: number): Part {
  if (x >= -8 && x < -5.5 && z >= 4 && z < 5.5) {
    // The back of the hand bends over the knee; the fingers hang to the pedestal,
    // parted by shadowed grooves.
    if (y >= 2.5 && y < 4) return part(STONE, HAND_R);
    if (y < 2.5 && z >= 4.5) {
      const groove = Math.floor((x + 8) * 2) % 2 === 1;
      if (groove && (z >= 5 || y < 0.5)) return 0;
      return part(groove ? LINE : STONE, HAND_R);
    }
    return 0;
  }
  // Left hand palm up in the lap.
  return y >= 2.5 && y < 3 && x >= -1.5 && x < 3 && z >= 1.5 && z < 3.5 ? part(STONE, HAND_L) : 0;
}

/** A seated figure without its head (body-local texels): the neck (to be broken), hands, body. */
function seatedFigureFn(mudra: Mudra): Fn {
  const body = seatedBody(mudra);
  const hands = mudra === 'meditation' ? meditationHands : earthHands;
  return (x, y, z) => {
    // A short round neck, a good deal narrower than the shoulders.
    if (y >= 8.4 && y < CHIN_Y + 3 && Math.hypot(x, z - NECK_Z) < 1.6) return part(STONE, NECK);
    return y < CHIN_Y ? hands(x, y, z) || body(x, y, z) : 0;
  };
}

// ── Pedestal ─────────────────────────────────────────────────────────────────

/**
 * Khmer moulded pedestal (texels, centred, standing on y = 0): a base course in
 * two stones, a recessed band with a row of lotus petals, a projecting top
 * slab — in the §20 props' tones for stone in the lowest course, darker than
 * the figure so it stands off it. Returns the top height in metres.
 */
function pedestal(set: BlockSet, seed: number): number {
  const t = (v: number) => v * TEXEL;
  const [w, d, h] = PED;
  const [hw, hd, band] = [w / 2, d / 2, h - 2];
  const style = { surf: PROP_SURF.low, broken: PROP_BROKEN };
  const c = (n: number) => tone(PROP_STONE_LOW, n, seed, 3, seed);
  const joint = -1 - (seed % 3);
  set.add(t(-hw), 0, t(-hd), t(joint), t(band), t(hd), c(0), style);
  set.add(t(joint), 0, t(-hd), t(hw), t(band), t(hd), c(1), style);
  set.add(t(-hw + 1), t(band), t(-hd + 1), t(hw - 1), t(band + 1), t(hd - 1), c(2), style);
  // Petals: every other texel round the band, flush with the base below.
  const petal = { surf: PROP_SURF.clean, broken: PROP_BROKEN };
  for (let i = -hw + 1; i < hw - 1; i += 2) {
    set.add(t(i), t(band), t(hd - 1), t(i + 1), t(band + 1), t(hd), c(4), petal);
    set.add(t(i), t(band), t(-hd), t(i + 1), t(band + 1), t(-hd + 1), c(5), petal);
  }
  for (let k = -hd + 2; k < hd - 1; k += 2) {
    set.add(t(hw - 1), t(band), t(k), t(hw), t(band + 1), t(k + 1), c(6), petal);
    set.add(t(-hw), t(band), t(k), t(-hw + 1), t(band + 1), t(k + 1), c(7), petal);
  }
  set.add(t(-hw), t(band + 1), t(-hd), t(hw), t(h), t(hd), c(3), { surf: PROP_SURF.top, broken: PROP_BROKEN });
  return t(h);
}

/** The props' olive moss felt on the pedestal's top, round the figure (or what is left of it). */
function pedestalFelt(p: PieceBuilder, set: BlockSet, top: number, figure: Carver, seed: number, amount: number): void {
  const felt = new MossLayer(p, seed, (x, y, z) => set.solidAt(x, y, z) || figure.occupies(x, y, z));
  felt.cover(set, amount, (_x, y) => y > top - 1e-6);
  felt.commit();
}

// ── Looks ────────────────────────────────────────────────────────────────────

/**
 * Statue stone: blotchy grey-taupe tones, each stone a shade of its own, dark
 * carved lines, warm rough breaks; moss where `moss` says, lichen and dark
 * streaks everywhere.
 */
function statueLook(seed: number, moss: (c: CellInfo) => number): (c: CellInfo) => CellLook {
  return (c) => {
    const st = stoneOf(c.part);
    const tg = tagOf(c.part);
    const m = moss(c);
    let color = mul(blotch(STATUE_STONE, c.x, c.y, c.z, seed + st * 13), 0.92 + hash3(st, seed, 5) * 0.16);
    if (tg === DARK) color = mul(color, 0.48);
    else if (tg === EYE) color = mul(color, 0.5);
    else if (tg === LINE) color = mul(color, 0.62);
    else if (tg === SHADE) color = mul(color, 0.84);
    else if (tg === HAIR) color = mul(color, 0.8);
    else if (tg === BAND || tg === SOLE || st === HEAD) color = mul(color, 1.06);
    if (c.scar && tg !== DARK) color = tone(PROP_BROKEN, c.i, c.j, c.k, seed);
    const fine = st === HEAD || st === HAND_R || st === HAND_L;
    // Mats of the sheet's olive moss on broad tops; only a trace of the stone
    // pattern's own (cooler, greener) moss round them, as on the other props.
    const cushion = c.top && !c.scar && tg !== EYE && m * (0.35 + 0.65 * c.sky) > 0.46 ? tone(STATUE_MOSS, c.i, c.j, c.k, seed) : undefined;
    return { color, cushion, surf: stoneSurf({ moss: c.scar ? m * 0.1 : m * 0.25, lichen: 0.12, stain: fine ? 0.12 : 0.3 }) };
  };
}

/**
 * Moss in patches about three texels across (small enough that every
 * shoulder and knee gets some): thick on tops, creeping into the sides;
 * `boost` adds by place.
 */
function mossPatches(seed: number, boost: (c: CellInfo) => number) {
  return (c: CellInfo) => {
    const n = valueNoise3(c.x * 0.33, c.y * 0.33, c.z * 0.33, seed + 17);
    const m = (n - 0.4) * 1.5 + boost(c);
    return Math.max(0, Math.min(1, c.top ? 0.12 + m : m * 0.45));
  };
}

// ── Seated figures ───────────────────────────────────────────────────────────

interface Seated {
  body: Carver;
  /** The pedestal's stones. */
  ped: BlockSet;
  /** Seat height in design units (texels). */
  seatD: number;
  /** Metres per design unit. */
  u: number;
}

/** The pedestal plus a headless seated figure on it (not yet damaged or emitted). */
function seatedFigure(p: PieceBuilder, seed: number, mudra: Mudra): Seated {
  const set = new BlockSet(TEXEL);
  const seat = pedestal(set, seed);
  set.erode(0.08, seed + 3);
  set.emit(p.voxels, { seed });
  const { min, max } = set.bounds();
  p.collider(min[0], 0, min[2], max[0], seat, max[2]);
  const u = TEXEL;
  const seatD = seat / u;
  const fn = seatedFigureFn(mudra);
  /** Body-local design coordinates (seat at y = 0, lap centre at z = 0). */
  const local: Fn = (x, y, z) => fn(x, y - seatD, z + LAP_Z);
  const body = new Carver(TEXEL / 2, [0, 0, 0], u);
  body.add([-9.5, seatD, -5.5], [9.5, seatD + CHIN_Y, 5.5], local);
  // The neck, left to be broken.
  body.add([-4, seatD + CHIN_Y, -5.5], [4, seatD + CHIN_Y + 1.5, 2.5], local);
  body.ghost([-PED[0] / 2, seatD - 2, -PED[1] / 2], [PED[0] / 2, seatD, PED[1] / 2]);
  return { body, ped: set, seatD, u };
}

/**
 * Moss on a seated figure: mats on the broad tops of the lap and (by
 * `shoulders`) the shoulders, where rain and leaf litter settle — not on the
 * narrow ledges, which would stripe the figure like steps; only a few specks
 * on the neck, none on the hands.
 */
function seatedMoss(seed: number, seatD: number, shoulders: number) {
  return mossPatches(seed, (c) => {
    const st = stoneOf(c.part);
    if (st === NECK) return c.top && hash3(c.i, c.j, c.k, seed + 41) < 0.03 ? 1 : -9;
    if (st === HAND_R || st === HAND_L || c.sky < 0.6) return -0.6;
    const y = c.y - seatD;
    return (y < 3.6 && st !== SHIN && st !== LOW_SHIN ? 0.2 : 0) + (y > 8.5 ? shoulders : 0) - 0.1;
  });
}

/** Colliders of a seated figure: the lap and the trunk up to `top` (texels above the seat). */
function seatedColliders(p: PieceBuilder, f: Seated, top: number): void {
  const add = (hw: number, y0: number, y1: number, z0: number, z1: number) => p.collider(-hw * f.u, (f.seatD + y0) * f.u, (z0 - LAP_Z) * f.u, hw * f.u, (f.seatD + y1) * f.u, (z1 - LAP_Z) * f.u);
  add(9, 0, 3.4, -4.2, 5.7);
  add(8.3, 0, top, -4.2, 2.1);
}

// ── Seated Buddha ────────────────────────────────────────────────────────────
// Design texels: x = 0 on the axis (the figure's right hand at -x), y = 0 on the
// ground, z = 0 through the plinth's centre; the figure faces +z. The body's
// own functions take y from the seat (the plinth's top).

/** Default height (ground to the topknot), metres: 21 texels. */
const BUDDHA_H = 21 * TEXEL;
/**
 * Plinth (texels): half width and depth, the height of a course, and how far
 * the top course is stepped in — two courses round the full footprint and a
 * third set in, of blocks like the sheet's base.
 */
const PLINTH = { hw: 8.5, hd: 5, course: 1.5, step: 0.5 };
/** Chin above the seat, and the cheek plane (z); the neck's axis (head-local z) and radius. */
const CHIN = 9;
const FACE = 2;
const NECK_HZ = -2.4;
const NECK_R = 1.4;

/**
 * The Buddha sheet's colours, sampled off its lit faces (measure.py) and put
 * through fromSheet: the figure a warm pink-tan (chest plates, forehead band,
 * back plates) in close tones, the plinth a darker, yellower tan, the moss a
 * lit olive-yellow on the tops of its clumps and a dark olive on their sides
 * and where it grows down the faces (#68611e, #5f5d21 on the sheet).
 */
const BUDDHA_STONE = [0xcca27b, 0xc49874, 0xca9c77, 0xc0946f, 0xc79b70].map(fromSheet);
const BUDDHA_BASE = [0x9c7a50, 0x94744a, 0xa27f56, 0xa4805a, 0x91734a].map(fromSheet);
const BUDDHA_MOSS = [0x8a7e36, 0x837a32, 0x90843a, 0x7c7430, 0x877c36].map(fromSheet);
const BUDDHA_MOSS_SIDE = [0x625e24, 0x5a5822, 0x66612a, 0x6c6628].map(fromSheet);
/** The plinth's pattern: a little grime and moss, no heavy streaks (the sheet's blocks are clean). */
const PLINTH_SURF = { top: stoneSurf({ moss: 0.12, stain: 0.08, lichen: 0.1, crack: 0.04 }), low: stoneSurf({ moss: 0.16, stain: 0.18, lichen: 0.08, crack: 0.04 }) };

/**
 * The body in the sheet's chunky blocks (body-local texels): the crossed legs
 * a wide stepped lap — the seat and hips behind, the thighs out to square
 * knees, the shins across the front (right over left) a cell proud of the
 * knees, the lap between, where the hands rest in meditation (the left palm
 * up, the right on it, the thumb tips meeting); a narrow waist with a proud
 * belly block, two chest plates under a band at the collarbones, two plates
 * on the back over the spine; square shoulder blocks over the upper arms,
 * which hang a cell clear of the chest (the armpits closed half way back, so
 * the gaps read as shade from the front and from behind, never as sky), and
 * the forearms running forward and in to the hands.
 */
function buddhaBody(): Fn {
  const seat = box([0, 1.25, -2.0], [5.4, 1.25, 1.45], 0.3);
  const hips = box([0, 3.1, -2.0], [4.4, 0.9, 0.95], 0.3);
  const thigh = box([4.5, 1.4, 0.25], [2.3, 1.4, 3.2], 0.6);
  const shins = box([0, 0.95, 3.05], [4.8, 0.95, 1.1], 0.35);
  const lap = box([0, 1.5, 1.2], [3.2, 0.45, 2.2], 0.2);
  const waist = box([0, 4.0, -0.75], [2.9, 2.0, 1.7], 0.5);
  const belly = box([0, 4.5, 0.9], [1.6, 0.75, 0.6], 0.3);
  const chest = box([0, 6.35, -0.75], [3.1, 1.4, 1.7], 0.4);
  const sternum = box([0, 6.0, 1.2], [0.45, 0.9, 0.3]);
  const pec = box([1.65, 6.1, 1.3], [1.35, 0.95, 0.55], 0.35);
  const yoke = box([0, 7.3, -0.75], [3.5, 0.45, 1.7], 0.2);
  const blade = box([1.6, 6.3, -2.75], [1.45, 1.0, 0.2], 0.1);
  const spine = box([0, 4.6, -2.75], [1.8, 1.2, 0.2], 0.1);
  const armpit = box([3.3, 5.8, -0.75], [0.6, 1.4, 0.2]);
  const shoulder = box([4.9, 7.05, -1.1], [1.7, 0.7, 1.45], 0.5);
  const upper = box([4.95, 5.4, -1.05], [1.4, 1.35, 1.4], 0.45);
  const fore = bar([4.9, 4.4, -0.6], [2.6, 3.3, 2.7], 0.95, 0.85, 0.3);
  const handL = box([0, 2.5, 2.5], [2.6, 0.45, 1.15], 0.2);
  const handR = box([0, 3.25, 2.5], [2.1, 0.2, 0.95], 0.1);
  const thumbs = box([0, 3.75, 2.25], [0.95, 0.2, 0.7], 0.1);
  return (x, y, z) => {
    const ax = Math.abs(x);
    if (ax > 7 || y < 0 || z > 4.4 || z < -4.8) return 0;
    const R = x < 0;
    // The stone a cell belongs to: the form it is deepest inside.
    let best = -1e-6;
    let stone = 0;
    let tag = STONE;
    const take = (d: number, st: number, tg = STONE) => {
      if (d < best) [best, stone, tag] = [d, st, tg];
    };
    if (y < 4.2) {
      take(seat(x, y, z), ax < 2.4 ? HIPS : R ? LEG_R : LEG_L);
      take(hips(x, y, z), HIPS);
      take(thigh(ax, y, z), R ? LEG_R : LEG_L);
      take(shins(x, y, z), (y - 0.95) * 2.3 > x ? SHIN : LOW_SHIN);
      take(lap(x, y, z), LAP);
      take(handL(x, y, z), HAND_L);
      take(Math.min(handR(x, y, z), thumbs(x, y, z)), HAND_R);
    }
    take(waist(x, y, z), WAIST);
    take(belly(x, y, z), BELLY);
    take(spine(x, y, z), SPINE);
    take(fore(ax, y, z), R ? FORE_R : FORE_L);
    if (y > 4.2) {
      take(chest(x, y, z), R ? CHEST_R : CHEST_L);
      take(sternum(x, y, z), R ? CHEST_R : CHEST_L, SHADE);
      take(pec(ax, y, z), R ? PEC_R : PEC_L);
      take(yoke(x, y, z), YOKE);
      take(blade(ax, y, z), R ? BLADE_R : BLADE_L);
      take(armpit(ax, y, z), R ? CHEST_R : CHEST_L, SHADE);
      take(shoulder(ax, y, z), R ? SHOULDER_R : SHOULDER_L);
      take(upper(ax, y, z), R ? ARM_R : ARM_L);
    }
    if (!stone) return 0;
    // The legs and lap are laid up of blocks, like the sheet's figure; the
    // chest, belly, shoulders and arms are single big stones.
    if (BLOCKED.has(stone)) stone = blockOf(stone, x, y, z, 4, 1.5);
    return part(tag, stone);
  };
}

/** Stones of the Buddha built up of blocks (see {@link blockOf}). */
const BLOCKED = new Set([HIPS, LEG_R, LEG_L, SHIN, LOW_SHIN, LAP]);

/**
 * One block of a big stone: the stone split into blocks `w` texels wide and
 * deep and `course` tall in a running bond. Each block is a stone of its own
 * (its kind in the low six bits, {@link kind}), so the blocks meet in seams
 * and each takes a shade of its own.
 */
function blockOf(st: number, x: number, y: number, z: number, w: number, course: number): number {
  const row = Math.floor(y / course);
  const o = ((row & 1) * w) / 2;
  const b = (Math.floor((x + o) / w) * 7 + Math.floor((z + o) / w) * 3 + row * 5) & 15;
  return st | ((b + 1) << 6);
}

/** The kind of stone a cell is (a block of the chest is still chest). */
const kind = (p: Part) => stoneOf(p) & 63;

/** The whole figure (body-local texels): head, neck and body. */
function buddhaFn(ushnisha: number): Fn {
  const body = buddhaBody();
  const head = buddhaHead(ushnisha);
  return (x, y, z) => {
    if (y >= CHIN) {
      const h = head(x, y - CHIN, z - FACE);
      if (h) return h;
    }
    // A short round neck, set back under the chin.
    if (y >= 7.4 && y < CHIN + 2 && Math.hypot(x, z - FACE - NECK_HZ) < NECK_R) return part(STONE, NECK);
    return y < CHIN ? body(x, y, z) : 0;
  };
}

/**
 * The plinth (texels, centred, standing on y = 0) as the sheet builds it: real
 * blocks in courses with staggered joints — two courses round the full
 * footprint, a third stepped in — each course a skin of blocks along the
 * front and back and across the ends, round a core. Returns its top in metres.
 */
function buddhaPlinth(set: BlockSet, s: number, seed: number): number {
  const t = (v: number) => (Math.round(v * s * 2) * TEXEL) / 2;
  const { hw, hd, course, step } = PLINTH;
  const skin = 2.5;
  const lay = (inset: number, y0: number, courses: number, n: number) => {
    const [x0, x1, z0, z1] = [-hw + inset, hw - inset, -hd + inset, hd - inset];
    const y1 = y0 + courses * course;
    const opts = (axis: 'x' | 'z', k: number) => ({
      length: [t(2.5), t(4.5)] as [number, number],
      course: t(course),
      axis,
      palette: BUDDHA_BASE,
      // The lowest course grimier, moss creeping up from the soil.
      style: (_id: number, c: number) => ({ surf: y0 + c === 0 ? PLINTH_SURF.low : PLINTH_SURF.top, broken: PROP_BROKEN }),
      seed: seed + n * 11 + k * 3,
    });
    masonry(set, t(x0), t(y0), t(z1 - skin), t(x1), t(y1), t(z1), opts('x', 0));
    masonry(set, t(x0), t(y0), t(z0), t(x1), t(y1), t(z0 + skin), opts('x', 1));
    masonry(set, t(x0), t(y0), t(z0 + skin), t(x0 + skin), t(y1), t(z1 - skin), opts('z', 2));
    masonry(set, t(x1 - skin), t(y0), t(z0 + skin), t(x1), t(y1), t(z1 - skin), opts('z', 3));
    set.add(t(x0 + skin), t(y0), t(z0 + skin), t(x1 - skin), t(y1), t(z1 - skin), BUDDHA_BASE[0], { surf: PLINTH_SURF.top });
  };
  lay(0, 0, 2, 0);
  lay(step, 2 * course, 1, 1);
  return t(3 * course);
}

/**
 * Moss on the plinth as the sheet draws it: clumps of little olive cubes, each
 * as high as it grew (a whole cube in the middle of a patch, two stacked
 * where it is thickest), along the top edges, on the ledge of the step and at
 * the foot of the figure, and hanging a cell over the mossiest edges.
 */
function plinthMoss(p: PieceBuilder, set: BlockSet, figure: Carver, seed: number): void {
  const c = TEXEL / 2;
  const r = rng(seed * 13 + 5);
  const solid = (x: number, y: number, z: number) => set.solidAt(x, y, z) || figure.occupies(x, y, z);
  const grid = (cell: V3) => p.voxels.grid({ cell, origin: [0, 0, 0], mat: 'leaves', jitter: 0.1, ao: 0.25, seed });
  const clumps: MossClump[] = [];
  const faceX = grid([c / 2, c, c]);
  const faceZ = grid([c, c, c / 2]);
  const sides: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const id of set.find(() => true)) {
    const { min, max } = set.boxOf(id);
    const y = max[1];
    const j = Math.round(y / (c / 2));
    for (let i = Math.round(min[0] / c); i < Math.round(max[0] / c); i++)
      for (let k = Math.round(min[2] / c); k < Math.round(max[2] / c); k++) {
        const [x, z] = [(i + 0.5) * c, (k + 0.5) * c];
        // Open tops only: not under the figure or the step, not where the stone broke away.
        if (solid(x, y + c / 2, z) || !set.solidAt(x, y - c / 2, z)) continue;
        const edge = sides.find(([dx, dz]) => !solid(x + dx * c, y - c / 2, z + dz * c));
        const foot = sides.some(([dx, dz]) => solid(x + dx * c, y + c / 2, z + dz * c));
        const n = valueNoise3(x * 6, y * 3, z * 6, seed + 29) * 0.8 + r() * 0.2;
        const cover = 0.16 + (edge ? 0.24 : 0) + (foot ? 0.2 : 0);
        if (n >= cover) continue;
        // Half a cube at the rim of a patch, a whole one in its middle, a second on top where it is thickest.
        const h = hash3(i, j, k, seed + 3);
        const jc = Math.round(y / c);
        const whole = n < cover - 0.08;
        clumps.push({ i, j: jc, k, x, y, z, h: whole ? 1 : 0.5, color: tone(h < 0.6 ? BUDDHA_MOSS_SIDE : BUDDHA_MOSS, i, j, k, seed), shade: 0.92 + h * 0.12 });
        if (n < cover - 0.22) clumps.push({ i, j: jc + 1, k, x, y: y + c, z, h: 0.5, color: tone(BUDDHA_MOSS, i, j + 1, k, seed), shade: 1.02 });
        if (!edge || n > cover - 0.2) continue;
        // Over the edge: a lip of it down the face.
        const [dx, dz] = edge;
        const jj = Math.round(y / c) - 1;
        if (!set.solidAt(x, (jj + 0.5) * c, z)) continue;
        const color = tone(BUDDHA_MOSS_SIDE, i, jj, k, seed);
        if (dx) faceX.set(dx > 0 ? 2 * i + 2 : 2 * i - 1, jj, k, color);
        else faceZ.set(i, jj, dz > 0 ? 2 * k + 2 : 2 * k - 1, color);
      }
  }
  emitMoss(p.voxels, c, clumps);
  faceX.commit();
  faceZ.commit();
}

/**
 * Where moss settles on the Buddha (0‥1, in patches about three texels
 * across): the tiers of curls, the shoulders, the lap and the lower belly
 * behind the hands, where water stands — never the face or the ears, hardly
 * the hands.
 */
function buddhaMoss(seed: number, seatD: number) {
  return (c: CellInfo) => {
    const st = kind(c.part);
    const y = c.y - seatD;
    let boost = -0.1;
    if (tagOf(c.part) === HAIR) boost = 0.05;
    else if (st === HEAD || st === BROW || st === EAR || st === NECK) return 0;
    else if (st === HAND_R || st === HAND_L) boost = -0.3;
    else if (st === WAIST && c.z > 0 && y < 4) boost = 0.45;
    else if (y < 3.1) boost = 0.15;
    else if (y > 7.0) boost = 0.25;
    const n = valueNoise3(c.x * 0.33, c.y * 0.33, c.z * 0.33, seed + 17);
    return Math.max(0, Math.min(1, (n - 0.4) * 1.5 + boost));
  };
}

/**
 * The Buddha's stone: the sheet's warm tan mottled cell by cell in close
 * tones, each block (and each curl) a shade of its own but only just, the eye
 * slits and mouth dark brown (not black), warm rough breaks. Moss grows as
 * clumps of little cubes on the broad tops and, where it is thickest, wraps
 * over the edge and a cell down the face as the sheet's dark olive cubes.
 */
function buddhaLook(seed: number, moss: (c: CellInfo) => number): (c: CellInfo) => CellLook {
  return (c) => {
    const st = stoneOf(c.part);
    const k = kind(c.part);
    const tg = tagOf(c.part);
    const m = moss(c);
    const h = hash3(c.i, c.j, c.k, seed + 29);
    const mossy = c.top && !c.scar && m * (0.35 + 0.65 * c.sky) > 0.44;
    // Clumps: a whole cube where the moss is thick, lower towards the rim of a patch.
    const cushion = mossy ? tone(h < 0.55 ? BUDDHA_MOSS_SIDE : BUDDHA_MOSS, c.i, c.j, c.k, seed) : undefined;
    const cushionH = mossy ? (m > 0.72 ? 1 : 0.5) : undefined;
    // Where it is thick it grows over the edge and down the face in ragged
    // tongues, a cell or three, as the sheet's olive cubes on the fronts.
    const face = c.open & 0b110011;
    const down = [mossy ? 0.5 : 9, 0.6, 0.72, 0.84][c.under] - (h - 0.5) * 0.16;
    if (face && !c.scar && tg !== EYE && m > down) {
      return { color: tone(BUDDHA_MOSS_SIDE, c.i, c.j, c.k, seed + 1), mat: 'leaves', surf: [0, 0, 0, 0], cushion, cushionH };
    }
    let color = mul(blotch(BUDDHA_STONE, c.x, c.y, c.z, seed + st * 13, 0.7), 0.96 + hash3(st, seed, 5) * 0.08);
    if (tg === DARK) color = mul(color, 0.5);
    else if (tg === EYE) color = mul(color, 0.62);
    else if (tg === LINE) color = mul(color, 0.5);
    else if (tg === SHADE) color = mul(color, 0.8);
    else if (tg === BAND) color = mul(color, 1.04);
    if (c.scar && tg !== DARK) color = tone(PROP_BROKEN, c.i, c.j, c.k, seed);
    const fine = k === HEAD || k === BROW || k === HAND_R || k === HAND_L;
    // The ears stand in the head's shade; lift them so they read lit, as drawn.
    // The face and hands keep a clean skin: no dark streaks across the features.
    // The face keeps little of the crevice shade, so its features read as the sheet's
    // (dark only in the slits, not round the nose and lips).
    const features = k === HEAD || k === BROW;
    return { color, cushion, cushionH, cavity: features && tg !== EYE && tg !== LINE ? 0.35 : 1, shade: k === EAR ? 1.15 : 1, surf: stoneSurf({ moss: c.scar ? 0 : m * 0.15, lichen: fine ? 0.04 : 0.06, stain: fine ? 0.03 : 0.08 }) };
  };
}

function buddha(p: PieceBuilder, seed: number, height?: number): void {
  const s = height ? height / BUDDHA_H : 1;
  const u = TEXEL * s;
  const r = rng(seed);
  const { hw, hd, step } = PLINTH;
  // The plinth, the corner of its top course broken off on the figure's right.
  const set = new BlockSet(TEXEL / 2);
  const top = buddhaPlinth(set, s, seed);
  set.carveSphere(-(hw - step) * u, top, (hd - step) * u, 0.1 * s, seed + 7);
  set.erode(0.05, seed + 3);
  set.emit(p.voxels, { seed });
  const seatD = top / u;
  // The figure on it.
  const fn = buddhaFn(seed === 1 ? 2 : r.int(1, 2));
  const local: Fn = (x, y, z) => fn(x, y - seatD, z);
  const body = new Carver(TEXEL / 2, [0, 0, 0], u);
  body.add([-7.5, seatD, -5], [7.5, seatD + CHIN, 4.5], local);
  body.add([-4.2, seatD + CHIN, -3.2], [4.2, seatD + CHIN + 7.5, 3.2], local);
  body.ghost([-hw, seatD - 1, -hd], [hw, seatD, hd]);
  growCurls(body, seatD + CHIN);
  // Weathering: a bite out of a shoulder, chipped edges; the face, ears, hands and curls kept crisp.
  body.bite([r.chance(0.5) ? 6.2 : -6.2, seatD + 8.6, -1.6], 0.8 + r() * 0.3, seed + 9);
  const crisp = [HEAD, BROW, EAR, HAND_R, HAND_L, FORE_R, FORE_L];
  body.chip(0.06, seed + 11, (_x, _y, _z, q) => tagOf(q) !== HAIR && !crisp.includes(kind(q)));
  body.prune();
  const look = buddhaLook(seed, buddhaMoss(seed, seatD));
  body.emit(p.voxels, look, { seed, round: 0.2 });
  plinthMoss(p, set, body, seed);
  // The pieces of the broken corner lie piled against the plinth below it.
  const box3 = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => p.collider(x0 * u, y0 * u, z0 * u, x1 * u, y1 * u, z1 * u);
  rubblePile(p, r, [(-hw + 2.8) * u, (hd + 1.3) * u], s);
  box3(-hw + 0.4, 0, hd, -hw + 5.2, 3.8, hd + 2.5);
  box3(-hw, 0, -hd, hw, seatD, hd);
  box3(-7, seatD, -3.5, 7, seatD + 3, 4); // lap
  box3(-6.5, seatD + 3, -3, 6.5, seatD + 8, 3.5); // trunk, arms and hands
  box3(-3.5, seatD + 8, -3, 3.5, seatD + CHIN + 7.5, 3); // neck and head
}

/**
 * Broken blocks piled against the plinth (centre `at`, metres), as the
 * sheet's base shows them: two cube-ish stones on the ground, one fallen
 * across them, a couple of chips beside — each a single block of the plinth's
 * stone, turned and tipped where it came to rest, moss on the top one.
 */
function rubblePile(p: PieceBuilder, r: Rng, at: [number, number], s: number): void {
  const t = TEXEL * s;
  const pieces: [number, number, number, number][] = [
    // x, z (texels from `at`), size (texels), resting height (texels)
    [-1.2, 0.2, 2.25, 0],
    [1.1, -0.2, 2, 0],
    [0, 0.1, 1.75, 2],
    [2.8, 1.1, 0.9, 0],
    [-2.8, 0.9, 0.7, 0],
  ];
  for (const [n, [x, z, size, y]] of pieces.entries()) {
    const e = size * t;
    const color = n === 2 ? tone(BUDDHA_STONE, n, 1, 3, 9) : tone(BUDDHA_BASE, n, 2, 5, 9);
    const rot: V3 = [r.range(-0.12, 0.12), r.range(-0.5, 0.5), r.range(-0.12, 0.12)];
    // Raised by its tilt, so a corner doesn't sink into the ground.
    const lift = (Math.abs(Math.sin(rot[0])) + Math.abs(Math.sin(rot[2]))) * e * 0.5;
    const cy = y * t + e * 0.45 + lift;
    p.voxels.box(at[0] + x * t, cy, at[1] + z * t, e, e * 0.9, e, color, 'sandstone', { rx: rot[0], ry: rot[1], rz: rot[2], surf: PROP_SURF.mossy });
    if (n === 2) p.voxels.box(at[0] + x * t, cy + e * 0.45 + 0.008, at[1] + z * t, e * 0.8, 0.016, e * 0.7, BUDDHA_MOSS[0], 'leaves', { rx: rot[0], ry: rot[1], rz: rot[2], surf: [0, 0.35, 0, 0] });
  }
}

function headless(p: PieceBuilder, seed: number): void {
  const r = rng(seed);
  const f = seatedFigure(p, seed, 'earth');
  // The neck snapped off in a rough slope, a stump left standing on the shoulders.
  f.body.cut((x, y, z) => y > f.seatD + 11 + (valueNoise3(x * 0.8, z * 0.8, 1, seed) - 0.5) * 1.2 + x * 0.12 - (z + LAP_Z) * 0.1);
  f.body.chip(0.1, seed + 11);
  f.body.prune();
  const look = statueLook(seed, seatedMoss(seed, f.seatD, -0.2));
  f.body.emit(p.voxels, look, { seed });
  pedestalFelt(p, f.ped, f.seatD * f.u, f.body, seed, 0.28);
  chunk(p, r, seed + 21, 0.9, [0.76, 0, 0.46], look);
  seatedColliders(p, f, 11);
}

// ── Fragments ────────────────────────────────────────────────────────────────

/**
 * A broken chunk of statue lying on the ground (size in texels): a rough
 * lump with one worked face, turned and tipped as it fell.
 */
function chunk(p: PieceBuilder, r: Rng, seed: number, size: number, at: V3, look: (c: CellInfo) => CellLook): void {
  const c = new Carver(TEXEL, [0, 0, 0], TEXEL);
  const h = size * 1.6;
  const lump = box([0, h * 0.62, 0], [h, h * 0.62, h * 0.8], 0.8);
  c.add([-h - 1, 0, -h - 1], [h + 1, h * 1.6, h + 1], (x, y, z) => {
    const n = (valueNoise3(x * 0.8, y * 0.8, z * 0.8, seed) - 0.5) * 1.1;
    return lump(x, y, z) + n <= 0 ? part(STONE, CHUNK) : 0;
  });
  c.ghost([-h - 1, -1, -h - 1], [h + 1, 0, h + 1]);
  c.chip(0.3, seed + 3);
  c.prune();
  const start = p.voxels.boxes.length;
  c.emit(p.voxels, look, { seed });
  rotateSince(p.voxels, start, [0, 0, 0], [r.range(-0.12, 0.12), r.range(0, Math.PI * 2), r.range(-0.12, 0.12)]);
  moveSince(p.voxels, start, at[0], at[1] - lowestSince(p.voxels, start) - 0.01, at[2]);
}

/** Emit a broken-off piece and lay it on the ground at (x, z) metres, turned as it fell. */
function layDown(p: PieceBuilder, piece: Carver, look: (c: CellInfo) => CellLook, seed: number, x: number, z: number, rot: V3): void {
  const start = p.voxels.boxes.length;
  piece.emit(p.voxels, look, { seed });
  if (p.voxels.boxes.length === start) return;
  const c = centreSince(p.voxels, start);
  rotateSince(p.voxels, start, c, rot);
  moveSince(p.voxels, start, x - c[0], -lowestSince(p.voxels, start) - 0.006, z - c[2]);
}

function fallenHead(p: PieceBuilder, seed: number): void {
  const r = rng(seed);
  const fine = new Carver(TEXEL / 2, [0, 0, 0], TEXEL);
  const head = buddhaHead(seed === 1 ? 0 : r.int(0, 2));
  // Upright on the broken neck, chin a hand's breadth off the ground.
  const hy = 1.5;
  fine.add([-4, 0, -5.5], [4, 9, 1.5], (x, y, z) => head(x, y - hy, z) || (y < hy + 2 && Math.hypot(x, z - NECK_HZ) < NECK_R ? part(STONE, HEAD) : 0));
  growCurls(fine, hy);
  // The neck broke off unevenly.
  fine.cut((x, y, z) => y < 0.6 + valueNoise3(x * 0.9, z * 0.9, 3, seed) * 1.1 && z < -1);
  if (r.chance(0.6)) fine.bite([r.chance(0.5) ? 3.2 : -3.2, hy + 1.2, -2.8], 0.8, seed + 7); // a chipped earlobe
  fine.prune();
  const look = statueLook(seed, mossPatches(seed, (c) => (c.top && hash3(c.i, c.j, c.k, seed + 41) < 0.03 ? 1 : -9)));
  const start = p.voxels.boxes.length;
  fine.emit(p.voxels, look, { seed });
  // Settled askew where it fell.
  rotateSince(p.voxels, start, [0, 0, -1.5 * TEXEL], [-0.06 - r() * 0.06, 0.3 + r() * 0.25, (r() - 0.5) * 0.16]);
  moveSince(p.voxels, start, 0, -lowestSince(p.voxels, start) - 0.02, 0);
  chunk(p, r, seed + 31, 0.7, [0.3, 0, 0.12], look);
  p.collider(-3 * TEXEL, 0, -6 * TEXEL, 3 * TEXEL, 8 * TEXEL, 1.2 * TEXEL);
}

// ── Guardian torso ───────────────────────────────────────────────────────────

/**
 * A dvarapala's torso (texels, standing on y = 0, facing +z): the upper thighs
 * with the stone left between the legs, the short hip wrap with its pleated
 * front flap and belt, a narrow waist, broad chest with a necklace, sloping
 * shoulders with an armlet on the right arm, and the neck.
 */
function guardianTorso(): Fn {
  const thighs = box([2.0, 1.6, -0.3], [1.9, 1.6, 2.2], 0.7);
  const hips = box([0, 4.8, -0.4], [4.1, 1.7, 2.4], 0.8);
  const belt = box([0, 6.7, -0.4], [4.1, 0.45, 2.6], 0.4);
  const pecs = box([2.3, 10.9, 1.0], [2.1, 1.1, 1.0], 0.6);
  const trap = bar([1.8, 13.1, -0.6], [5.4, 12.3, -0.6], 1.8, 1.0, 0.6);
  const delt = box([5.9, 11.8, -0.5], [1.6, 1.5, 1.8], 0.9);
  const upperArm = bar([6.1, 11.9, -0.5], [6.6, 8.2, -0.2], 1.4, 1.4, 0.8);
  return (x, y, z) => {
    const R = x < 0;
    const ax = Math.abs(x);
    const flap = sdBox(x, y, z, [0, 3.7, 2.4], [y < 2.6 ? 1.6 : 1.1, 2.7, 0.5], 0.2);
    const hw = y < 8.5 ? 3.3 : Math.min(4.7, 3.3 + (y - 8.5) * 0.5);
    const chest = sdBox(x, y, z, [0, 10, -0.5], [hw, 3, 2.3], 0.9);
    const neck = y > 12 && y < 15 && Math.hypot(x, z + 0.6) < 2.0 ? -1 : 9;
    const beltD = belt(x, y, z);
    const lower = Math.min(thighs(ax, y, z), hips(x, y, z), flap, beltD);
    const upperBody = Math.min(chest, pecs(ax, y, z), trap(ax, y, z), neck);
    const arm = smin(delt(ax, y, z), upperArm(ax, y, z), 0.6);
    if (Math.min(lower, upperBody, arm) > 0) return 0;
    let best = lower;
    let stone = HIPS;
    let tag = STONE;
    const take = (d: number, st: number) => {
      if (d < best) [best, stone, tag] = [d, st, STONE];
    };
    take(upperBody, y < 8.6 ? BELLY : R ? CHEST_R : CHEST_L);
    take(arm, R ? ARM_R : ARM_L);
    if (stone === HIPS && (beltD <= 0 || Math.abs(y - 3.2) < 0.5) && flap > 0) tag = BAND; // belt and hem
    if (stone === HIPS && flap <= 0 && Math.floor(x + 64) % 2 === 0) tag = SHADE; // pleats
    if ((stone === CHEST_R || stone === CHEST_L) && z > 0 && Math.abs(y - (12.2 - Math.max(0, 3 - ax) * 0.3)) < 0.5) tag = BAND; // necklace
    if ((stone === ARM_R || stone === ARM_L) && y > 9.8 && y < 10.8) tag = BAND; // armlet
    return part(tag, stone);
  };
}

function torso(p: PieceBuilder, seed: number): void {
  const r = rng(seed);
  const body = new Carver(TEXEL, [0, 0, 0], TEXEL);
  body.add([-8, 0, -4], [8, 15, 4], guardianTorso());
  body.ghost([-8, -1, -4], [8, 0, 4]);
  // Broken at the neck, the left arm gone at the shoulder, the right at the elbow.
  body.cut((x, y, z) => y > 13.8 + (valueNoise3(x * 0.7, z * 0.7, 2, seed) - 0.5) * 1.6 + x * 0.12);
  const arm = body.breakOff((x, y) => x > 4.6 && y < 11.4 + (valueNoise3(y, 0, 1, seed) - 0.5) * 1.2);
  body.cut((x, y) => x < -4.6 && y < 9.4 + (valueNoise3(y, 1, 1, seed) - 0.5));
  body.bite([r.range(-3, 3), 0.8, 2.4], 1.3, seed + 5);
  body.chip(0.14, seed + 11);
  body.prune();
  const look = statueLook(seed, mossPatches(seed, (c) => (c.y > 11.5 ? 0.45 : 0.25) + (c.x < -1 ? 0.12 : 0)));
  const start = p.voxels.boxes.length;
  body.emit(p.voxels, look, { seed });
  // Settled a little askew where it was set up again.
  rotateSince(p.voxels, start, [0, 0, 0], [r.range(-0.05, 0.02), r.range(-0.25, 0.25), r.range(-0.04, 0.04)]);
  moveSince(p.voxels, start, 0, -lowestSince(p.voxels, start) - 0.03, 0);
  // The broken-off left arm lies at its feet.
  layDown(p, arm, look, seed, 0.5, 0.42, [r.range(1.2, 1.9), r.range(0, 6.3), r.range(-0.3, 0.3)]);
  p.collider(-5 * TEXEL, 0, -3 * TEXEL, 5 * TEXEL, 13.5 * TEXEL, 2.8 * TEXEL);
}

// ── Broken pedestal ──────────────────────────────────────────────────────────

/**
 * The statue fell apart: its pedestal lost a corner, the folded legs are
 * still on it, broken at the waist; the trunk lies on its back beside it and
 * chunks are strewn around.
 */
function rubble(p: PieceBuilder, seed: number): void {
  const r = rng(seed);
  const set = new BlockSet(TEXEL);
  const top = pedestal(set, seed);
  const [hw, hd] = [PED[0] / 2, PED[1] / 2];
  set.carveSphere(-hw * TEXEL, top, hd * TEXEL, 0.3, seed);
  set.erode(0.2, seed + 3);
  set.emit(p.voxels, { seed });
  p.collider(-hw * TEXEL, 0, -hd * TEXEL, hw * TEXEL, top, hd * TEXEL);
  const seatD = top / TEXEL;
  const look = statueLook(seed, mossPatches(seed, () => 0));
  // The folded legs, broken off at the waist.
  const legs = seatedBody('earth');
  const lap = new Carver(TEXEL / 2, [0, 0, 0], TEXEL);
  lap.add([-9.5, seatD, -6], [9.5, seatD + 5, 6], (x, y, z) => {
    const q = legs(x, y - seatD, z + LAP_Z);
    const st = stoneOf(q);
    return st === LEG_R || st === LEG_L || st === SHIN || st === LOW_SHIN || st === FOOT || st === HIPS || st === LAP ? q : 0;
  });
  lap.ghost([-hw, seatD - 2, -hd], [hw, seatD, hd]);
  lap.cut((x, y, z) => y - seatD > 2.3 + valueNoise3(x * 0.5, z * 0.5, 4, seed) * 1.5);
  const knee = lap.breakSphere([-8.2, seatD + 2.1, 3.6 - LAP_Z], 2.0, seed + 7);
  lap.chip(0.12, seed + 11);
  lap.prune();
  lap.emit(p.voxels, look, { seed });
  pedestalFelt(p, set, top, lap, seed, 0.3);
  layDown(p, knee, look, seed, -0.44, 0.5, [r.range(0.6, 1.4), r.range(0, 6.3), r.range(-0.3, 0.3)]);
  // The trunk, snapped at the waist and neck, fallen on its back to the right.
  const upper = seatedFigureFn('meditation');
  const trunk = new Carver(TEXEL / 2, [0, 0, 0], TEXEL);
  trunk.add([-8.6, 3, -5], [8.6, 11, 4], (x, y, z) => {
    const q = upper(x, y, z);
    const st = stoneOf(q);
    return st === BELLY || st === CHEST_R || st === CHEST_L || st === ARM_R || st === ARM_L || st === NECK ? q : 0;
  });
  trunk.cut((x, y, z) => y < 4.6 + valueNoise3(x * 0.6, z * 0.6, 5, seed) * 1.2 || y > 10 + valueNoise3(x, z, 6, seed) * 0.8);
  trunk.chip(0.12, seed + 13);
  trunk.prune();
  const lying = trunk.turned('x').turned('x').turned('x').turned('y');
  lying.settle();
  const start = p.voxels.boxes.length;
  lying.emit(p.voxels, look, { seed: seed + 2 });
  const b = boundsSince(p.voxels, start);
  const x0 = (hw + 0.6) * TEXEL;
  moveSince(p.voxels, start, snapT(x0 - b.min[0]), -b.min[1], snapT(-1.5 * TEXEL - (b.min[2] + b.max[2]) / 2));
  p.collider(x0, 0, -1.5 * TEXEL - (b.max[2] - b.min[2]) / 2, x0 + b.max[0] - b.min[0], b.max[1] - b.min[1], -1.5 * TEXEL + (b.max[2] - b.min[2]) / 2);
  // Chunks strewn round about.
  const spots: V3[] = [
    [-0.75, 0, -0.5],
    [0.2, 0, 0.66],
    [1.0, 0, 0.55],
  ];
  spots.forEach((at, n) => chunk(p, r, seed + 50 + n * 7, n === 0 ? 1.1 : 0.7, at, look));
}

/** Round a shift to whole texels, so moved stone keeps its pattern in step. */
const snapT = (v: number) => Math.round(v / TEXEL) * TEXEL;

export default defineKitAsset({
  section: '20',
  order: 3,
  name: 'Broken statue',
  caption: 'Damaged statues (Buddha, deity, guardian, etc).',
  size: {
    real: 'seated Buddha 1.31 m on a 0.28 m plinth of three courses, 1.06 × 0.63 m (head 0.47 m chin to topknot, shoulders 0.83 m and lap 0.88 m wide); guardian torso 0.9 m',
    sheet: 'not given',
    note: 'Khmer seated Buddhas of the Angkor Wat period are about life size, 1.2–1.4 m with the pedestal; a dvarapala guardian is ~1.8 m whole, so its torso fragment is ~0.9 m. The Buddha sheet gives no size either: its head is a third of the height and its base a fifth, so at a 0.47 m head the statue comes to 1.3 m.',
  },
  variants: [
    // The Buddha has a detailed sheet of its own (front, side and back views).
    { id: 'buddha', name: 'Seated Buddha', ref: { sheet: 'section 20/ChatGPT Image Sep 24, 2026, 09_43_55 AM.png', box: [20, 70, 525, 695], size: [1342, 1172] } },
    { id: 'head', name: 'Fallen head' },
    { id: 'headless', name: 'Headless figure' },
    { id: 'torso', name: 'Guardian torso' },
    { id: 'rubble', name: 'Broken pedestal' },
  ],
  // The sheet draws its statues low and nearly head-on: the face reads at that angle.
  mainView: 'iso-low',
  shots: [
    { view: 'iso', variant: 'head', label: 'Fallen head' },
    { view: 'iso', variant: 'headless', label: 'Headless figure' },
    { view: 'iso', variant: 'torso', label: 'Guardian torso' },
    { view: 'iso', variant: 'rubble', label: 'Broken pedestal' },
  ],
  ref: { sheet: 'section 20/6706F03E-0DFA-4AFA-80F0-5C031D4F49D5.PNG', box: [630, 88, 908, 398] },
  build: ({ variant, seed, height }): KitPiece => {
    const p = new PieceBuilder();
    if (variant === 'head') fallenHead(p, seed);
    else if (variant === 'headless') headless(p, seed);
    else if (variant === 'torso') torso(p, seed);
    else if (variant === 'rubble') rubble(p, seed);
    else buddha(p, seed, height);
    return p.done();
  },
});
