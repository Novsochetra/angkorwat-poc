import { BlockSet } from '../../BlockSet';
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
  type Part,
  type V3,
} from './_statue';

/**
 * §20 ③ Broken statue — damaged Khmer statues as the sheet draws them: a seated
 * Buddha on its moulded pedestal (hands in the lap, calm downcast face, long
 * earlobes, curls and a topknot) with pieces broken off and moss on the
 * shoulders and lap; its fallen head; a seated figure that lost its head; a
 * guardian's torso; and a broken pedestal among rubble.
 *
 * The seated figures and the heads are carved on a half-texel grid (two cells
 * to a texel, so the stone pattern still lines up) as a few big stones (chest
 * plates, belly, arms, knees, shins…) that merge into one carved surface each
 * and meet in seams, like the chunky blocks of the sheet; the guardian torso
 * and the loose chunks, chunkier like the sheet's fragments, on whole texels.
 * The masses are kept bold and apart so a figure reads at a glance from any
 * side: a wide oval lap, a narrow waist, broad shoulders with the arms
 * hanging clear of the chest, a narrow neck and a big head whose brow, nose,
 * lips and ears are cut deep enough to cast shade.
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
const KNOT = 9;
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

/** Default seated Buddha height (ground to the topknot), metres: 20.5 texels. */
const BUDDHA_H = 1.28;
/** Pedestal (texels): width, depth, height. */
const PED: V3 = [20, 12, 3];

type Fn = (x: number, y: number, z: number) => Part;

const mul = (hex: number, k: number) => {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * k));
  const b = Math.min(255, Math.round((hex & 255) * k));
  return (r << 16) | (g << 8) | b;
};

// ── Head ─────────────────────────────────────────────────────────────────────
// Head-local texels: x = 0 on the axis, y = 0 under the chin, z = 0 the face plane.
// Rows and columns below are half-texel cells (r = floor(2y), c = floor(2|x|)).

/** Half-width of each row in half-texels, chin → crown: a square jaw, a boxy skull. */
const HEAD_W = [3, 4, 5, 5, 6, 6, 6, 6, 6, 6, 6, 5];
/** Back of each row (half-texels behind the face plane). */
const HEAD_BACK = [-5, -7, -9, -10, -11, -12, -12, -12, -12, -12, -11, -10];
/**
 * Face relief, right half (mirrored), columns from the axis out: cells in
 * front of the face plane per row (0 = flush, -1 = receding); `E` marks the
 * dark eye slits, `L` the line of the lips, `S` half shade beside the nose
 * and at the corners, `B` the diadem band, `x` outside the face. The brow
 * ridge stands two cells proud of the eyes so it casts a band of shade.
 */
const FACE: string[] = [
  '+0 +0 -1 x  x  x ', // chin
  '+1 +0 +0 -1 x  x ', // chin, rounding into the jaw
  '+1 +1 +0 -1 -1 x ', // full lower lip
  '0L 0L 0S -1 -1 -2', // line of the lips
  '+1 +1 +0 +0 -1 -1', // upper lip, the corners turned up in a smile
  '+2 1S +0 +0 +0 -1', // nose tip over the shaded nostril wings
  '+2 +0 +0 +0 +0 -1', // nose, cheeks rounding away
  '+1 0S -1E -1E 0S -1', // downcast eyes, deep under the brow
  '+1 +1 +1 +1 +1 +0', // brow ridge
  '+0 +0 +0 +0 +0 -1', // forehead
  '0B 0B 0B 0B 0B -1', // diadem at the hairline
];
const FACE_REL = FACE.map((row) => row.trim().split(/\s+/).map((s) => (s[0] === 'x' ? null : s[0] === '-' ? -Number(s[1]) : Number(s[0] === '+' ? s[1] : s[0]))));
const FACE_TAG = FACE.map((row) => row.trim().split(/\s+/).map((s) => (s.includes('E') ? EYE : s.includes('L') ? LINE : s.includes('S') ? SHADE : s.includes('B') ? BAND : STONE)));

/** Inside a row's cross-section: rounded back corners (half-texel cells). */
function inSkull(c: number, zc: number, w: number, back: number, rb: number): boolean {
  if (c >= w || zc < back || zc >= 0) return false;
  if (c >= w - rb && zc < back + rb) return Math.hypot(c + 0.5 - (w - rb), zc + 0.5 - (back + rb)) <= rb;
  return true;
}

/** Hair covers the crown, the sides above the ears and the back of the skull down to the nape. */
function hairAt(r: number, c: number, zc: number): boolean {
  return r >= FACE.length || (r >= 5 && zc < -9) || (r >= 9 && c >= 5 && zc < -2);
}

/**
 * Long ears standing out from the sides (half-texel cells): the rim round a
 * dark hollow at eye level, and the pierced lobe hanging slim to the lips.
 */
function ear(r: number, c: number, zc: number): number {
  if (r < 2 || r > 8 || zc < -9 || zc > -7 || c > 7) return 0;
  if (r <= 4) return c === 6 && zc < -7 ? (r === 3 && zc === -8 ? DARK : STONE) : 0;
  const hollow = (r === 6 || r === 7) && zc === -8;
  if (c === 7) return hollow ? 0 : STONE;
  return hollow ? DARK : STONE;
}

/**
 * A Khmer Buddha head (Angkor Wat period), as tags: broad square face with a
 * straight brow ridge over heavy downcast lids, broad nose, full lips with
 * the corners turned up, a diadem band at the low hairline, long pierced
 * earlobes and a stepped ushnisha of `ushnisha` rows (0‥2; the topknot is
 * the first thing to break). Curls are grown afterwards ({@link growCurls}).
 */
function buddhaHead(ushnisha: number): (x: number, y: number, z: number) => number {
  const rows = HEAD_W.length;
  return (x, y, z) => {
    const r = Math.floor(y * 2);
    const c = Math.floor(Math.abs(x) * 2);
    const zc = Math.floor(z * 2);
    if (r < 0) return 0;
    if (r >= rows) {
      const t = r - rows;
      if (t >= ushnisha) return 0;
      const w = [3, 2][t];
      const cz = zc + 6;
      if (c >= w || cz < -w || cz >= w) return 0;
      // Rounded in plan: the corners go.
      return t === 0 && c === w - 1 && (cz === -w || cz === w - 1) ? 0 : KNOT;
    }
    const w = HEAD_W[r];
    if (c >= w) return ear(r, c, zc);
    if (r < FACE.length && zc >= -3) {
      const rel = FACE_REL[r][Math.min(c, 5)] ?? -3;
      if (zc >= rel) return 0;
      return zc === rel - 1 ? FACE_TAG[r][Math.min(c, 5)] : STONE;
    }
    if (!inSkull(c, zc, w, HEAD_BACK[r], r < 3 ? 2 : 3.5)) return 0;
    return hairAt(r, c, zc) ? HAIR : STONE;
  };
}

/**
 * Snail-shell curls: a texel-sized knob on every other texel of the crown and
 * the back of the head, round the smooth topknot. The sides and the front
 * stay flat, so the head keeps the sheet's tall boxy outline and the
 * hairline frames the face.
 */
function growCurls(c: Carver): void {
  const n = (v: number) => Math.floor((v * c.unit) / TEXEL + 1e-6);
  c.grow(
    (p) => tagOf(p) === HAIR,
    (x, y, z, side, from) => ((side === 2 || side === 5) && (n(x) + n(y) + n(z)) % 2 === 0 ? from : 0),
  );
}

// ── Seated body ──────────────────────────────────────────────────────────────
// Body-local texels: x = 0 on the axis, y = 0 on the seat (pedestal top), z = 0
// through the middle of the lap; the figure faces +z, its right hand is at -x.

type Mudra = 'meditation' | 'earth';

/** Body-local z = 0 lies half a texel behind the pedestal's centre (the lap reaches further forward than back). */
const LAP_Z = 0.5;
/** Chin height above the seat, face plane (body-local z) and neck axis. */
const CHIN_Y = 10.5;
const FACE_Z = 1.5;
const NECK_Z = -1.3;

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

/** The whole seated figure (body-local texels): head (unless `ushnisha` is null), neck, hands, body. */
function seatedFigureFn(mudra: Mudra, ushnisha: number | null): Fn {
  const body = seatedBody(mudra);
  const hands = mudra === 'meditation' ? meditationHands : earthHands;
  const head = ushnisha === null ? null : buddhaHead(ushnisha);
  return (x, y, z) => {
    if (head && y >= CHIN_Y) {
      const t = head(x, y - CHIN_Y, z - FACE_Z);
      if (t) return part(t, HEAD);
    }
    // A short round neck, a good deal narrower than the head.
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
function pedestal(set: BlockSet, s: number, seed: number): number {
  const t = (v: number) => Math.round(v * s) * TEXEL;
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
    else if (tg === HAIR || tg === KNOT) color = mul(color, 0.8);
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
  /** Seat height in design units (texels × scale). */
  seatD: number;
  /** Metres per design unit. */
  u: number;
}

/** The pedestal plus a seated figure on it (not yet damaged or emitted). */
function seatedFigure(p: PieceBuilder, s: number, seed: number, mudra: Mudra, ushnisha: number | null): Seated {
  const set = new BlockSet(TEXEL);
  const seat = pedestal(set, s, seed);
  set.erode(0.08, seed + 3);
  set.emit(p.voxels, { seed });
  const { min, max } = set.bounds();
  p.collider(min[0], 0, min[2], max[0], seat, max[2]);
  const u = TEXEL * s;
  const seatD = seat / u;
  const fn = seatedFigureFn(mudra, ushnisha);
  /** Body-local design coordinates (seat at y = 0, lap centre at z = 0). */
  const local: Fn = (x, y, z) => fn(x, y - seatD, z + LAP_Z);
  const body = new Carver(TEXEL / 2, [0, 0, 0], u);
  body.add([-9.5, seatD, -5.5], [9.5, seatD + CHIN_Y, 5.5], local);
  // Head and neck (just the neck, left to be broken, on a headless figure).
  body.add([-4, seatD + CHIN_Y, -5.5], [4, seatD + CHIN_Y + (ushnisha === null ? 1.5 : 7), 2.5], local);
  body.ghost([-PED[0] / 2, seatD - 2, -PED[1] / 2], [PED[0] / 2, seatD, PED[1] / 2]);
  return { body, ped: set, seatD, u };
}

/**
 * Moss on a seated figure: mats on the broad tops of the lap and (by
 * `shoulders`) the shoulders, where rain and leaf litter settle — not on the
 * narrow ledges, which would stripe the figure like steps; only a few specks
 * on the head, none on the hands.
 */
function seatedMoss(seed: number, seatD: number, shoulders = 0.15) {
  return mossPatches(seed, (c) => {
    const st = stoneOf(c.part);
    if (st === HEAD || st === NECK) return c.top && hash3(c.i, c.j, c.k, seed + 41) < 0.03 ? 1 : -9;
    if (st === HAND_R || st === HAND_L || c.sky < 0.6) return -0.6;
    const y = c.y - seatD;
    return (y < 3.6 && st !== SHIN && st !== LOW_SHIN ? 0.2 : 0) + (y > 8.5 ? shoulders : 0) - 0.1;
  });
}

function buddha(p: PieceBuilder, seed: number, height?: number): void {
  const s = height ? height / BUDDHA_H : 1;
  const r = rng(seed);
  const f = seatedFigure(p, s, seed, 'meditation', seed === 1 ? 2 : r.int(1, 2));
  growCurls(f.body);
  const at = (x: number, y: number, z: number): V3 => [x, f.seatD + y, z - LAP_Z];
  // Damage: the front of the right knee broken off, a chipped shoulder, weathered edges.
  const knee = f.body.breakSphere(at(-8.2, 2.1, 3.6), 1.7 + r() * 0.3, seed + 5);
  f.body.bite(at(r.chance(0.5) ? 6.3 : -6.3, 9.3, -1.2), 0.9 + r() * 0.3, seed + 9);
  f.body.chip(0.08, seed + 11, (_x, _y, _z, q) => stoneOf(q) !== HEAD && stoneOf(q) !== HAND_R && stoneOf(q) !== HAND_L);
  f.body.prune();
  const look = statueLook(seed, seatedMoss(seed, f.seatD));
  f.body.emit(p.voxels, look, { seed });
  pedestalFelt(p, f.ped, f.seatD * f.u, f.body, seed, 0.22);
  // The broken knee lies at the foot of the pedestal.
  layDown(p, knee, look, seed, (-0.44 + r() * 0.1) * s, (0.47 + r() * 0.04) * s, [r.range(0.5, 1.2), r.range(0, 6.3), r.range(-0.3, 0.3)]);
  seatedColliders(p, f, 10, true);
}

/** Colliders of a seated figure: the lap, the trunk up to `top` (texels above the seat) and the head if it has one. */
function seatedColliders(p: PieceBuilder, f: Seated, top: number, head: boolean): void {
  const add = (hw: number, y0: number, y1: number, z0: number, z1: number) => p.collider(-hw * f.u, (f.seatD + y0) * f.u, (z0 - LAP_Z) * f.u, hw * f.u, (f.seatD + y1) * f.u, (z1 - LAP_Z) * f.u);
  add(9, 0, 3.4, -4.2, 5.7);
  add(8.3, 0, top, -4.2, 2.1);
  if (head) add(3.5, top, CHIN_Y + 7, -5, 2.5);
}

function headless(p: PieceBuilder, seed: number): void {
  const r = rng(seed);
  const f = seatedFigure(p, 1, seed, 'earth', null);
  // The neck snapped off in a rough slope, a stump left standing on the shoulders.
  f.body.cut((x, y, z) => y > f.seatD + 11 + (valueNoise3(x * 0.8, z * 0.8, 1, seed) - 0.5) * 1.2 + x * 0.12 - (z + LAP_Z) * 0.1);
  f.body.chip(0.1, seed + 11);
  f.body.prune();
  const look = statueLook(seed, seatedMoss(seed, f.seatD, -0.2));
  f.body.emit(p.voxels, look, { seed });
  pedestalFelt(p, f.ped, f.seatD * f.u, f.body, seed, 0.28);
  chunk(p, r, seed + 21, 0.9, [0.76, 0, 0.46], look);
  seatedColliders(p, f, 11, false);
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
  const neckZ = NECK_Z - FACE_Z;
  fine.add([-4.5, 0, -7], [4.5, 9, 2], (x, y, z) => {
    const t = head(x, y - hy, z) || (y < hy + 2 && Math.hypot(x, z - neckZ) < 1.6 ? STONE : 0);
    return t ? part(t, HEAD) : 0;
  });
  growCurls(fine);
  // The neck broke off unevenly.
  fine.cut((x, y, z) => y < 0.6 + valueNoise3(x * 0.9, z * 0.9, 3, seed) * 1.1 && z < -1);
  if (r.chance(0.6)) fine.bite([r.chance(0.5) ? 3.6 : -3.6, hy + 1.6, -4], 0.9, seed + 7); // a chipped earlobe
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
  const top = pedestal(set, 1, seed);
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
  const upper = seatedFigureFn('meditation', null);
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
    real: 'seated Buddha 1.28 m with its 0.19 m pedestal (head 0.44 m chin to topknot, lap 1.12 m wide); guardian torso 0.9 m',
    sheet: 'not given',
    note: 'Khmer seated Buddhas of the Angkor Wat period are about life size, 1.2–1.4 m with the pedestal; a dvarapala guardian is ~1.8 m whole, so its torso fragment is ~0.9 m.',
  },
  variants: [
    { id: 'buddha', name: 'Seated Buddha' },
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
