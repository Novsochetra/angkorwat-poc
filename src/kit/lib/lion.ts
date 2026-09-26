import { hash3, valueNoise3 } from '../../voxel/random';
import { BlockSet } from '../BlockSet';
import { fromSheet } from '../palette';
import { PieceBuilder } from '../PieceBuilder';
import { placePiece, turnXZ } from '../place';
import { rng, TEXEL, tone } from '../shapes';
import { stoneSurf } from '../surface';
import { MossLayer, PROP_BROKEN } from '../assets/20/_masonry-props';
import { bar, blotch, box, Carver, ellipsoid, part, sdBox, stoneOf, tagOf, type CellInfo, type CellLook, type Part, type V3 } from '../assets/20/_statue';

/**
 * §21.2 ⑪ Guardian lion (singha) on its plinth — the shared lion of the
 * architecture kit, set in pairs on stair landings, terrace corners and the
 * causeway's cruciform terrace (§16, §21.3).
 *
 * The Angkor Wat lion stands: four straight columns of legs on big clawed
 * paws, the hind legs bent under round haunches, the body rising steeply to
 * a high chest hung with a bib of curls, the head held up — a square face
 * with a short muzzle, the mouth wide open on its fangs, round eyes under a
 * heavy brow — framed by a mane of curls in rows. The §21.2 sheet draws the
 * older seated type (on its haunches, as at other temples): `pose: 'seated'`.
 * Both are carved on a half-texel grid ({@link Carver}); the plinth is two
 * moulded tiers of dressed stones.
 *
 * Size (SIZES-ARCH §1.11): lion {@link LION}.height = 1.375 m from its soles to
 * the top of the mane, on a {@link LION}.plinth = 0.375 m plinth: 1.75 m in
 * all, the explorer's height. Plinth 0.75 × 1.0 m (base tier), 0.625 × 0.875 m
 * (top tier).
 *
 * Placement contract:
 *  - `at` is the centre of the plinth's footprint on the ground (y = the
 *    ground under the plinth); without a plinth, the point between the paws
 *    (the soles at `at`'s y).
 *  - The lion faces +Z at `turn` 0; `turn` counts quarter turns about +Y as in
 *    `place.ts` (1 faces +X, 2 faces −Z, 3 faces −X). Blocks stay axis-aligned.
 *  - Everything stays inside the plinth's base footprint, 0.75 m across × 1.0 m
 *    front to back (x × z at turn 0; the lion alone spans ±0.31 m across and
 *    −0.47‥+0.41 m front to back). Top of the mane 1.75 m above `at` (moss
 *    adds a centimetre).
 *  - Pairs: `side` is where the lion stands in a pair, seen from in front of
 *    it (the kit's +X = right). The pair's lions mirror each other: each curls
 *    its tail up over its rump onto the outer side of its back (and an old one
 *    loses its outer ear).
 *  - Colliders: one box for the plinth (walkable top at `plinthTop`, 0.375 m)
 *    and one round the lion (0.5 × 1.375 m, ≈ 0.78 m front to back).
 *  - Returns where it ended up ({@link LionPlaced}): plinth top, mane top and
 *    the bounds, in `p`'s space.
 *
 * Usage (a pair at the head of a 3 m stair whose top landing is at y = 1.5,
 * facing down the stair towards +Z):
 *
 *   guardianLion(p, { at: [-2, 1.5, 0], side: 'left', seed: 3 });
 *   guardianLion(p, { at: [2, 1.5, 0], side: 'right', seed: 4 });
 *
 * and on the corners of a terrace facing outwards along ±X:
 *
 *   guardianLion(p, { at: [5.5, 3.25, 5.5], turn: 1, weather: 0.6 });
 */

export type LionPose = 'standing' | 'seated';
export type LionSide = 'left' | 'right';
export type LionFinish = 'warm' | 'grey';

export interface LionOptions {
  /** Centre of the plinth's footprint on the ground, metres (default the origin). */
  at?: V3;
  /** Quarter turns about +Y (0 faces +Z, 1 faces +X…), as place.ts. */
  turn?: number;
  /** 'standing' (Angkor Wat, default) or 'seated' (the §21.2 sheet). */
  pose?: LionPose;
  /** Which lion of a pair, seen from its front (default 'right': stands at +X of the axis). */
  side?: LionSide;
  /** Stone: 'warm' — the sheet's golden sandstone (default); 'grey' — the grey-brown of the lions today. */
  finish?: LionFinish;
  /**
   * Age, 0‥1 (default 0.25): chipped edges, lichen and moss; from 0.6 on the
   * muzzle, an ear, toes and a plinth corner are broken away.
   */
  weather?: number;
  /** Extra moss, 0‥1, on top of what `weather` brings (default 0). */
  moss?: number;
  seed?: number;
  /** Stand it on its plinth (default true). */
  plinth?: boolean;
  /** Lion height, soles to the top of the mane, metres (default 1.375); the plinth scales with it. */
  height?: number;
  /** Add colliders (default true). */
  collide?: boolean;
}

/** Where a lion ended up (target space, metres). */
export interface LionPlaced {
  /** Top of the plinth (the lion's soles). */
  plinthTop: number;
  /** Top of the mane. */
  top: number;
  min: V3;
  max: V3;
}

/** The kit standard (metres). */
export const LION = {
  /** Soles to the top of the mane. */
  height: 1.375,
  plinth: 0.375,
  /** Base tier footprint, x × z. */
  footprint: [0.75, 1.0] as const,
  /** Top tier, x × z. */
  top: [0.625, 0.875] as const,
};

// ── Design ───────────────────────────────────────────────────────────────────
// Lion-local texels at the default size: x across (+x = the kit's right, the
// lion's own left), y up from its soles (the plinth's top), z forward (the
// way it looks), z = 0 over the plinth's centre. The carve cells are half a
// texel, centred on quarter texels, so every boundary below sits on a half.

type Fn = (x: number, y: number, z: number) => Part;

// Cell tags (colour) …
const STONE = 1;
const HAIR = 2;
const DARK = 3;
const TOOTH = 4;
const EYE = 5;
const LINE = 6;
const NOSE = 7;
const CLAW = 8;
const BALL = 9;
// … and stones (cells of one stone merge; seams between stones).
const HEAD = 1;
const MUZZLE = 2;
const JAW = 3;
const CHEST = 4;
const TORSO = 5;
const FORE_R = 6;
const FORE_L = 7;
const PAW_FR = 8;
const PAW_FL = 9;
const HAUNCH_R = 10;
const HAUNCH_L = 11;
const SHIN_R = 12;
const SHIN_L = 13;
const PAW_HR = 14;
const PAW_HL = 15;
const RUMP = 16;
const TAIL = 17;
const BROWS = 18;
const EAR = 19;
/** The ground of the mane between its curls. */
const MANE = 20;
/** Curls of the mane, the bib and the tail's tuft: eight stones in turn, so neighbouring curls meet in a seam. */
const CURL = 32;

/** The kind of stone a cell is (a block of the torso is still torso). */
const kind = (p: Part) => stoneOf(p) & 63;

/**
 * One block of a stone laid up in courses `course` texels high, as the sheet
 * builds its lion's legs of blocks: each block a stone of its own (its kind
 * in the low six bits).
 */
function blockOf(st: number, y: number, course: number): number {
  return st | (((Math.floor(y / course) & 15) + 1) << 6);
}

/** Height of the chin and the plane of the mane's front, in front of which the face stands. */
const CHIN_Y = 14.5;
const FACE_Z = 3.0;

/**
 * The face, right half (mirrored), half-texel cells: per row from the chin up
 * and per column from the axis out, how many cells stand in front of the
 * mane (the mane's curls stand one), and what they are — `T` teeth, `F`
 * fangs, `D` the dark of the open mouth, `N` the nose pad, `E` the eyeball,
 * `P` the pupil, `B` the brow, `H` curls, `x` nothing (the mane decides). As
 * the sheet draws it: a square jaw, the mouth open on a row of teeth top and
 * bottom with the fangs crossing at the corners, a blunt muzzle with the nose
 * pad on top, round eyes under a heavy brow, and the curls of the mane coming
 * down over the forehead.
 */
const FACE_ROWS: string[] = [
  '3  3  3  2  x  x ', // chin
  '5  5  5  4  2  x ', // lower jaw
  '6T 6T 6T 5T 2  2 ', // lower lip and teeth
  '2D 2D 6F 2D 2  2 ', // open mouth, the lower fangs rising
  '1D 1D 1D 2D 2  2 ', // the mouth's dark
  '2D 2D 2D 6F 2  2 ', // open mouth, the upper fangs hanging
  '7T 7T 7T 6T 3  2 ', // upper teeth under the lip
  '7  7  7  6  3  2 ', // upper lip
  '7N 7N 6  5  3  2 ', // the nose pad on the blunt muzzle
  '6  5  4E 4E 3  2 ', // bridge of the nose; the eyes' lower lids
  '5  4  3P 3P 3  2 ', // eyes, sunk under the brow
  '4  4B 4B 4B 4B 2 ', // the brow ridge over the eyes
  '3H 3H 3H 3H 3H 2H', // a row of curls over the forehead
];
const FACE_REL = FACE_ROWS.map((row) => row.trim().split(/\s+/).map((s) => (s[0] === 'x' ? null : Number(s[0]))));
const FACE_TAG = FACE_ROWS.map((row) =>
  row
    .trim()
    .split(/\s+/)
    .map((s) => ({ T: TOOTH, F: TOOTH, D: DARK, N: NOSE, E: BALL, P: EYE, H: HAIR })[s[1] as 'T'] ?? STONE),
);
const FACE_STONE = FACE_ROWS.map((row, r) =>
  row
    .trim()
    .split(/\s+/)
    .map((s, c) => (s[1] === 'B' ? BROWS : s[1] === 'D' ? HEAD : r < 6 ? JAW : r < 10 && c < 4 ? MUZZLE : HEAD)),
);

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** Curls (texels): bricks CURL_S on a side, their knobs CURL_H proud, a GROOVE between them. */
const CURL_S = 1.5;
const CURL_H = 0.5;
const GROOVE = 0.4;

/**
 * The curl a point of a curly surface lies in, for a surface facing along
 * axis `n` (0 x, 1 y, 2 z): the curls are laid in rows across it like bricks,
 * each row set half a curl over from the one below, a groove round each.
 * Returns the curl's stone, or 0 in the groove.
 */
function curlOn(x: number, y: number, z: number, n: number): number {
  const [a, b] = n === 0 ? [z, y] : n === 1 ? [x, z] : [x, y];
  const j = Math.floor(b / CURL_S);
  const o = (j & 1) * 0.5;
  const i = Math.floor(a / CURL_S + o);
  if (a - (i - o) * CURL_S < GROOVE || b - j * CURL_S < GROOVE) return 0;
  return CURL + mod(i * 3 + j * 5 + n * 2, 8);
}

/** Axis (0 x, 1 y, 2 z) along which a form's surface faces at a point: its gradient's longest component. */
function facing(f: (x: number, y: number, z: number) => number, x: number, y: number, z: number): number {
  const e = 0.25;
  const gx = Math.abs(f(x + e, y, z) - f(x - e, y, z));
  const gy = Math.abs(f(x, y + e, z) - f(x, y - e, z));
  const gz = Math.abs(f(x, y, z + e) - f(x, y, z - e));
  return gx >= gy && gx >= gz ? 0 : gy >= gz ? 1 : 2;
}

/**
 * A curly form: its surface in rows of curls standing proud (`form` < 0
 * inside). Returns the cell's part — a curl, the mane's ground in the
 * grooves, `inner` deeper in — or 0 outside.
 */
function curly(form: (x: number, y: number, z: number) => number, x: number, y: number, z: number, inner: number): Part {
  const d = form(x, y, z);
  if (d > CURL_H) return 0;
  if (d < -1) return part(STONE, inner);
  const c = curlOn(x, y, z, facing(form, x, y, z));
  if (d > (c ? CURL_H : 0)) return 0;
  return part(HAIR, c || MANE);
}

/**
 * The head (head-local texels: y = 0 under the chin, z = 0 the mane's front,
 * x = 0 on the axis): the face standing out of the mane — a rounded hood of
 * curls round and above it, falling behind to the neck — and a small round
 * ear, its hollow to the front, on either side at the top.
 */
function headFn(): Fn {
  const mane = box([0, 3.0, -2.0], [3.75, 4.0, 2.0], 2.0);
  return (x, y, z) => {
    const r = Math.floor(y * 2);
    const c = Math.floor(Math.abs(x) * 2);
    const zc = Math.floor(z * 2);
    if (r >= 0 && r < FACE_ROWS.length && c < 6 && zc >= 0) {
      const rel = FACE_REL[r][c];
      if (rel !== null) {
        if (FACE_TAG[r][c] !== HAIR) return zc < rel ? part(FACE_TAG[r][c], FACE_STONE[r][c]) : 0;
        // (a curl stands a cell prouder than the groove round it)
        const curl = curlOn(x, y, z, 2);
        return zc < rel - (curl ? 0 : 1) ? part(HAIR, curl || MANE) : 0;
      }
    }
    if (c >= 8 && c <= 9 && r >= 10 && r <= 12 && zc >= -2 && zc <= -1) return part(zc === -1 && c === 9 && r === 11 ? DARK : STONE, EAR);
    return curly(mane, x, y, z, HEAD);
  };
}

/** Distance to a tube along a polyline (texels), its radius running from r0 to r1. */
function tube(pts: V3[], r0: number, r1: number): (x: number, y: number, z: number) => number {
  return (x, y, z) => {
    let best = Infinity;
    for (let n = 0; n < pts.length - 1; n++) {
      const [a, b] = [pts[n], pts[n + 1]];
      const [ux, uy, uz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const l2 = ux * ux + uy * uy + uz * uz;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ux + (y - a[1]) * uy + (z - a[2]) * uz) / l2));
      const d = Math.hypot(x - a[0] - ux * t, y - a[1] - uy * t, z - a[2] - uz * t);
      best = Math.min(best, d - (r0 + (r1 - r0) * ((n + t) / (pts.length - 1))));
    }
    return best;
  };
}

/**
 * A disc — a cylinder along x — of radius `r` and half thickness `hw`, its
 * rims rounded by `e`: the round thigh the sheet draws, flat to the side.
 */
function discX(c: V3, r: number, hw: number, e = 0.4): (x: number, y: number, z: number) => number {
  return (x, y, z) => {
    const dr = Math.hypot(y - c[1], z - c[2]) - (r - e);
    const dx = Math.abs(x - c[0]) - (hw - e);
    return Math.min(Math.max(dr, dx), 0) + Math.hypot(Math.max(dr, 0), Math.max(dx, 0)) - e;
  };
}

/**
 * Body forms of a pose, chunky blocks like the sheet's (ax = |x|: the forms
 * are mirrored).
 */
interface Pose {
  torso: (x: number, y: number, z: number) => number;
  rump: (x: number, y: number, z: number) => number;
  haunch: (ax: number, y: number, z: number) => number;
  shin: (ax: number, y: number, z: number) => number;
  hindPaw: (ax: number, y: number, z: number) => number;
  /** Front of the hind paws (z). */
  hindToes: number;
  /**
   * The tail (x on the outer side): from its root low on the rump up over
   * the rump onto the back, the tip bent to the outer side, and the tuft of
   * curls at its end.
   */
  tail: V3[];
  tuft: V3;
}

const POSES: Record<LionPose, Pose> = {
  // Angkor Wat: the hind legs bent under round haunches, the rump well off the
  // plinth, the back falling steeply from the shoulders to it.
  standing: {
    torso: bar([0, 10.6, 0.5], [0, 8.6, -4.2], 3.1, 2.6, 0.8),
    rump: box([0, 8.2, -5.0], [3.0, 2.4, 1.6], 1.2),
    haunch: discX([3.0, 6.6, -4.0], 2.6, 1.0),
    shin: box([2.35, 2.9, -3.4], [1.1, 1.8, 1.2], 0.4),
    hindPaw: box([2.25, 0.65, -3.0], [1.75, 0.65, 1.5], 0.4),
    hindToes: -1.5,
    tail: [
      [0, 6.0, -6.9],
      [0, 9.2, -6.9],
      [0.7, 10.8, -5.9],
      [1.8, 11.3, -4.6],
    ],
    tuft: [2.2, 11.6, -3.8],
  },
  // The sheet: sitting on its haunches, the thighs big round discs, the hind
  // paws beside the chest under them, the body upright; the tail runs down
  // the back to the plinth, as the §09 lion's back view draws it.
  seated: {
    torso: box([0, 8.5, -0.8], [3.1, 4.5, 2.2], 1.0),
    rump: box([0, 3.2, -4.3], [3.0, 3.2, 1.9], 1.4),
    haunch: discX([3.0, 3.4, -2.6], 3.1, 1.0),
    shin: box([2.5, 1.4, -0.2], [1.0, 1.0, 1.0], 0.4),
    hindPaw: box([2.5, 0.6, 0.3], [1.5, 0.6, 1.2], 0.4),
    hindToes: 1.5,
    tail: [
      [0, 0.4, -6.6],
      [0, 5.8, -6.6],
      [0, 6.9, -4.9],
      [0, 7.6, -3.4],
      [0.6, 9.8, -3.4],
      [1.7, 10.8, -3.3],
    ],
    tuft: [2.1, 11.4, -3.2],
  },
};

/** The chest: a deep block standing out over the forelegs, its front hung with the bib. */
const CHEST_FORM = box([0, 10.5, 2.75], [3.5, 3.0, 2.25], 1.0);
/** An elbow tuft (on |x|). */
const ELBOW = ellipsoid([2.4, 8.3, 0.9], [1.0, 1.2, 0.9]);
const NECK_FORM = box([0, 13.5, 1.0], [2.6, 1.6, 1.8], 0.8);
const FORE_PAW = box([2.25, 0.75, 3.25], [1.75, 0.75, 1.75], 0.45);
/** Toe grooves (|x| of the cell centres) of the paws, all centred on |x| = 2.25. */
const GROOVES = [1.25, 2.25, 3.25];

/** The foreleg: a column tapering a little from the shoulder to the wrist. */
function foreleg(ax: number, y: number, z: number): number {
  const t = Math.max(0, Math.min(1, (y - 1) / 8));
  return sdBox(ax, y, z, [2.25, 5.4, 2.7], [1.0 + 0.25 * t, 4.6, 1.05 + 0.25 * t], 0.5);
}

/**
 * A paw: toes parted by grooves along the front third (dark lines, cut
 * through at the tips), the claws at the tips of the toes.
 */
function pawPart(ax: number, y: number, z: number, front: number, stone: number): Part {
  const groove = GROOVES.some((g) => Math.abs(ax - g) < 0.2);
  if (z > front - 1) {
    if (groove && z > front - 0.5) return 0;
    if (groove) return part(LINE, stone);
    if (z > front - 0.5 && y < 0.5) return part(CLAW, stone);
  }
  return part(STONE, stone);
}

/**
 * The whole lion (lion-local texels). `s` = +1 for the right lion of a pair,
 * −1 for the left: the tail's tip and tuft lie on the outer side of the back.
 */
function lionFn(pose: LionPose, s: 1 | -1): Fn {
  const P = POSES[pose];
  const head = headFn();
  const tail = tube(P.tail, 0.75, 0.6);
  const tuft = ellipsoid(P.tuft, [1.0, 1.1, 0.8]);
  return (x, y, z) => {
    const ax = Math.abs(x);
    const R = x < 0;
    if (y >= CHIN_Y - 1.5) {
      const h = head(x, y - CHIN_Y, z - FACE_Z);
      if (h) return h;
    }
    // The tail up the back (its tip bent to the outer side), a tuft of curls at its end.
    const tx = x * s;
    if (Math.hypot(tx - P.tuft[0], y - P.tuft[1], z - P.tuft[2]) < 1.6) {
      const t = curly((u, v, w) => tuft(u * s, v, w), x, y, z, TAIL);
      if (t) return t;
    }
    if (tail(tx, y, z) < 0) return part(STONE, TAIL);
    // Tufts of curls at the backs of the elbows.
    if (Math.hypot(ax - 2.4, y - 8.3, z - 0.9) < 1.8) {
      const t = curly(ELBOW, ax, y, z, CHEST);
      if (t) return t;
    }
    // The bib of curls hangs on the front of the chest, down to a point.
    if (z > 3.0 && y > 7.6 + 0.7 * ax && y < 14.5 && ax < 2.6) {
      const d = CHEST_FORM(x, y, z);
      if (d < -1) return part(STONE, CHEST);
      const c = curlOn(x, y, z, 2);
      if (d <= (c ? CURL_H : 0)) return part(HAIR, c || MANE);
    }
    let best = 0;
    let stone = 0;
    const take = (d: number, st: number) => {
      if (d < best) [best, stone] = [d, st];
    };
    take(CHEST_FORM(x, y, z), CHEST);
    take(P.torso(x, y, z), TORSO);
    take(NECK_FORM(x, y, z), CHEST);
    take(P.rump(x, y, z), RUMP);
    take(P.haunch(ax, y, z), R ? HAUNCH_R : HAUNCH_L);
    take(P.shin(ax, y, z), R ? SHIN_R : SHIN_L);
    take(foreleg(ax, y, z), R ? FORE_R : FORE_L);
    if (FORE_PAW(ax, y, z) < best) return pawPart(ax, y, z, 5.0, R ? PAW_FR : PAW_FL);
    if (P.hindPaw(ax, y, z) < best) return pawPart(ax, y, z, P.hindToes, R ? PAW_HR : PAW_HL);
    if (!stone) return 0;
    // The forelegs laid up in courses, as the sheet's lion builds its legs of blocks.
    return part(STONE, stone === FORE_R || stone === FORE_L ? blockOf(stone, y, 3) : stone);
  };
}

// ── Stone ────────────────────────────────────────────────────────────────────

/**
 * The lion's stone (through fromSheet). `warm`: the §21.2 sheet's golden
 * sandstone (a lit top #d8a45e, a lit front #b88650) taken a little towards
 * the pinker tan of the kit's warm finish, so the lion stands in the same
 * stone as the walls and doors round it; the plinth a shade darker and
 * browner, as drawn. `grey`: the lions as they stand today, grey-brown
 * sandstone with pale lichen (photos). `broken`: fresh breaks, paler.
 */
const FINISH: Record<LionFinish, { lion: readonly number[]; plinth: readonly number[]; broken: readonly number[] }> = {
  warm: {
    lion: [0xc59a68, 0xbf9464, 0xcaa06e, 0xb98e5e, 0xcea473].map(fromSheet),
    plinth: [0xae8558, 0xa77f54, 0xb38a5c, 0xa07a50, 0xb68e60].map(fromSheet),
    broken: PROP_BROKEN,
  },
  grey: {
    lion: [0x9e8a74, 0x96826d, 0xa6927b, 0x8e7a66, 0xaa957f].map(fromSheet),
    plinth: [0x8c7865, 0x85715f, 0x937e6a, 0x7d6a59].map(fromSheet),
    broken: [0xb49c80, 0xac957a, 0xbca487].map(fromSheet),
  },
};

/** The sheet's moss: yellow-olive clumps on the tops, dark olive where it runs down a face. */
const MOSS_TOP = [0x8a7e36, 0x837a32, 0x90843a, 0x7c7430, 0x877c36].map(fromSheet);
const MOSS_SIDE = [0x625e24, 0x5a5822, 0x66612a, 0x6c6628].map(fromSheet);

const mul = (hex: number, k: number) => {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * k));
  const b = Math.min(255, Math.round((hex & 255) * k));
  return (r << 16) | (g << 8) | b;
};

/** Stones of the face, kept crisp and clean. */
const FACE_STONES = new Set([HEAD, MUZZLE, JAW, BROWS]);

/**
 * Where moss settles (0‥1, in patches about three texels across): the crown
 * of the mane, the back and the haunches, the paws' tops — never the face.
 */
function lionMoss(seed: number, amount: number) {
  return (c: CellInfo) => {
    const st = kind(c.part);
    if (FACE_STONES.has(st) || st === EAR) return 0;
    const n = valueNoise3(c.x * 0.33, c.y * 0.33, c.z * 0.33, seed + 17);
    return Math.max(0, Math.min(1, (n - 0.55) * 1.6 + amount));
  };
}

/**
 * The lion's look: the stone mottled in close tones, each stone a shade of
 * its own, the curls a touch darker, the mouth and pupils dark brown, the
 * teeth and claws a little paler; moss as clumps of little cubes on the
 * broad tops, running over the edge where it is thick; warm rough breaks.
 */
function lionLook(fin: (typeof FINISH)[LionFinish], seed: number, moss: (c: CellInfo) => number, lichen: number): (c: CellInfo) => CellLook {
  return (c) => {
    const st = kind(c.part);
    const tg = tagOf(c.part);
    const m = moss(c);
    const h = hash3(c.i, c.j, c.k, seed + 29);
    const mossy = c.top && !c.scar && m * (0.35 + 0.65 * c.sky) > 0.42;
    const cushion = mossy ? tone(h < 0.55 ? MOSS_SIDE : MOSS_TOP, c.i, c.j, c.k, seed) : undefined;
    // (thin mats, or low clumps where it is thickest)
    const cushionH = mossy && m > 0.8 ? 0.5 : undefined;
    const face = c.open & 0b110011;
    // Where it is thick it runs over the edge and a cell or two down the face, no further.
    const down = [mossy ? 0.55 : 9, 0.7, 0.85, 9][c.under] - (h - 0.5) * 0.16;
    if (face && !c.scar && tg === STONE && m > down) return { color: tone(MOSS_SIDE, c.i, c.j, c.k, seed + 1), mat: 'leaves', surf: [0, 0, 0, 0], cushion, cushionH };
    let color = mul(blotch(fin.lion, c.x, c.y, c.z, seed + st * 13, 0.7), 0.96 + hash3(stoneOf(c.part), seed, 5) * 0.08);
    if (tg === DARK) color = mul(color, 0.42);
    else if (tg === EYE) color = mul(color, 0.4);
    else if (tg === LINE) color = mul(color, 0.6);
    else if (tg === NOSE) color = mul(color, 0.9);
    else if (tg === HAIR) color = mul(color, 0.93);
    else if (tg === TOOTH || tg === CLAW || tg === BALL) color = mul(color, 1.1);
    if (c.scar && tg !== DARK) color = tone(fin.broken, c.i, c.j, c.k, seed);
    const fine = FACE_STONES.has(st);
    const features = fine && tg !== DARK && tg !== EYE;
    return {
      color,
      cushion,
      cushionH,
      cavity: features ? 0.4 : 1,
      surf: stoneSurf({ moss: c.scar ? 0 : m * 0.15, lichen: fine ? lichen * 0.4 : lichen, stain: fine ? 0.05 : 0.12 }),
    };
  };
}

// ── Plinth ───────────────────────────────────────────────────────────────────

/**
 * The plinth (texels, `u` metres each, centred, standing on y = 0): a base tier moulded
 * as a foot band, a die set in half a texel and a projecting cap, then a
 * recessed fillet and the top tier stepped in a texel all round — each tier
 * laid of a few dressed stones whose joints run through its bands, as the
 * sheet lays its plinth in blocks. Returns its top in metres.
 */
function lionPlinth(set: BlockSet, u: number, seed: number, palette: readonly number[], broken: readonly number[], surf: ReturnType<typeof stoneSurf>): number {
  const t = (v: number) => v * u;
  const r = rng(seed * 7 + 3);
  const [bw, bd] = [LION.footprint[0] / TEXEL / 2, LION.footprint[1] / TEXEL / 2];
  const [tw, td] = [LION.top[0] / TEXEL / 2, LION.top[1] / TEXEL / 2];
  const style = { surf, broken };
  // Base tier: two stones across and three along, the joints a little off the thirds.
  const xs = [-bw, r.int(-1, 1), bw];
  const zs = [-bd, -bd / 3 + r.int(-1, 1), bd / 3 + r.int(-1, 1), bd];
  const bands: [number, number, number][] = [
    [0, 1, 0],
    [1, 3, 0.5],
    [3, 4, 0],
  ];
  for (let i = 0; i < 2; i++)
    for (let k = 0; k < 3; k++) {
      const color = tone(palette, i, k, 1, seed);
      for (const [y0, y1, inset] of bands) {
        const x0 = i === 0 ? xs[0] + inset : xs[1];
        const x1 = i === 1 ? xs[2] - inset : xs[1];
        const z0 = k === 0 ? zs[0] + inset : zs[k];
        const z1 = k === 2 ? zs[3] - inset : zs[k + 1];
        set.add(t(x0), t(y0), t(z0), t(x1), t(y1), t(z1), mul(color, y0 === 1 ? 0.94 : 1), style);
      }
    }
  // The fillet under the top tier, in shadow.
  set.add(t(-tw + 0.5), t(4), t(-td + 0.5), t(tw - 0.5), t(4.5), t(td - 0.5), mul(palette[0], 0.7), style);
  // Top tier: two stones front and back.
  const zj = r.int(-2, 2);
  set.add(t(-tw), t(4.5), t(-td), t(tw), t(6), t(zj), tone(palette, 3, 1, 2, seed), style);
  set.add(t(-tw), t(4.5), t(zj), t(tw), t(6), t(td), tone(palette, 4, 2, 2, seed), style);
  return t(6);
}

// ── Build ────────────────────────────────────────────────────────────────────

/** Build a lion in lion space (plinth centre at the origin, facing +Z). */
function buildLion(p: PieceBuilder, o: LionOptions): { plinthTop: number; top: number } {
  const seed = o.seed ?? 1;
  const pose = o.pose ?? 'standing';
  const s = (o.height ?? LION.height) / LION.height;
  const u = TEXEL * s;
  const weather = Math.max(0, Math.min(1, o.weather ?? 0.25));
  const fin = FINISH[o.finish ?? 'warm'];
  const r = rng(seed * 31 + 5);
  const side: 1 | -1 = o.side === 'left' ? -1 : 1;
  const plinthSurf = stoneSurf({ moss: 0.1 + 0.2 * weather, lichen: 0.05 + 0.15 * weather, stain: 0.1 + 0.3 * weather, crack: 0.03 + 0.08 * weather });
  // The plinth.
  let top = 0;
  let set: BlockSet | undefined;
  if (o.plinth ?? true) {
    set = new BlockSet(u / 2);
    top = lionPlinth(set, u, seed, fin.plinth, fin.broken, plinthSurf);
    if (weather >= 0.6) set.carveSphere(side * LION.top[0] * 0.5 * s, top, LION.top[1] * 0.5 * s, 0.09 * s, seed + 7);
    set.erode(0.03 + 0.12 * weather, seed + 3);
    set.emit(p.voxels, { seed });
  }
  // The lion on it.
  const topD = top / u;
  const fn = lionFn(pose, side);
  const local: Fn = (x, y, z) => fn(x, y - topD, z);
  // Half-texel cells at the default size; a bigger or smaller lion scales its
  // cells with it, so the face and the curls are carved the same at any size.
  const body = new Carver(u / 2, [0, 0, 0], u);
  body.add([-6, topD, -8], [6, topD + 23, 8], local);
  body.ghost([-LION.top[0] / TEXEL / 2, topD - 1, -LION.top[1] / TEXEL / 2], [LION.top[0] / TEXEL / 2, topD, LION.top[1] / TEXEL / 2]);
  // Damage: chipped edges everywhere but the features of the face; an old lion
  // has lost the end of its muzzle, the rim of an ear and a toe or two.
  if (weather >= 0.6) {
    const fy = topD + CHIN_Y;
    body.bite([r.range(-0.8, 0.8), fy + 4, FACE_Z + 3.2], 1.2 + r() * 0.3, seed + 9);
    body.bite([side * 4.6, fy + 5.5, FACE_Z - 0.7], 1.0, seed + 10);
    body.bite([side * r.range(1.5, 3), topD + 0.6, 5.1], 0.8, seed + 11);
  }
  body.chip(0.02 + 0.06 * weather, seed + 13, (_x, _y, _z, q) => weather >= 0.6 || !FACE_STONES.has(kind(q)));
  body.prune();
  const mossAmount = Math.min(1, 0.05 + 0.35 * weather + (o.moss ?? 0));
  body.emit(p.voxels, lionLook(fin, seed, lionMoss(seed, mossAmount), 0.06 + 0.25 * weather), { seed, round: 0.2 });
  // Moss felt on the plinth's ledges, round the paws.
  if (set) {
    const felt = new MossLayer(p, seed, (x, y, z) => set.solidAt(x, y, z) || body.occupies(x, y, z), u / 2);
    felt.cover(set, Math.min(0.9, 0.12 + 0.4 * weather + (o.moss ?? 0) * 0.6));
    felt.commit();
  }
  if (o.collide ?? true) {
    if (set) p.collider(-LION.footprint[0] * s / 2, 0, -LION.footprint[1] * s / 2, LION.footprint[0] * s / 2, top, LION.footprint[1] * s / 2);
    p.collider(-4 * u, top, -7 * u, 4 * u, top + 22 * u, 5.5 * u);
  }
  return { plinthTop: top, top: top + 22 * u };
}

/**
 * Put a guardian lion on its plinth into `p` at `o.at`, facing +Z turned by
 * `o.turn` quarter turns (see the placement contract above).
 */
export function guardianLion(p: PieceBuilder, o: LionOptions = {}): LionPlaced {
  const at = o.at ?? [0, 0, 0];
  const local = new PieceBuilder();
  const { plinthTop, top } = buildLion(local, o);
  const piece = local.done();
  placePiece({ voxels: p.voxels, collider: (c) => p.colliders.push(c) }, piece, { x: at[0], y: at[1], z: at[2], turn: o.turn ?? 0 });
  const b = piece.voxels.bounds();
  const [ax, az] = turnXZ(b.min[0], b.min[2], o.turn ?? 0);
  const [bx, bz] = turnXZ(b.max[0], b.max[2], o.turn ?? 0);
  return {
    plinthTop: at[1] + plinthTop,
    top: at[1] + top,
    min: [Math.min(ax, bx) + at[0], b.min[1] + at[1], Math.min(az, bz) + at[2]],
    max: [Math.max(ax, bx) + at[0], b.max[1] + at[1], Math.max(az, bz) + at[2]],
  };
}
