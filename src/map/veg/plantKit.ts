import { Euler, Matrix4, Vector3 } from 'three';
import { traceSource, type SourceTrace } from '../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../voxel/materials';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';

/**
 * The plant kit: leaves, fruit and vines in a few turned blocks, for every
 * part that grows plants on the map (the hamlets' gardens and orchards, the
 * market's produce, the home garden's models). Grown from the home garden's
 * own kit (garden/models/_fruitKit.ts: `beam`, `log`, `along` live here now
 * and the garden imports them from here).
 *
 * The world merges blocks per material family, so a shape costs its blocks:
 * every shape below says how many it lays.
 *
 * **Space.** Draw into any builder whose axes are the map's (the part's world
 * builder, a `Local` or `PsFrame` that only moves its origin): metres, +y up,
 * an azimuth `az` is a heading in the ground plane (0: +z, π/2: +x: the
 * direction (sin az, cos az)), an elevation `el` is up from level (radians).
 * Not into the local builder of a turned `Frame` (landmarks/_prasatKit.ts:
 * `place` adds its turn to `ry`, which only holds for level blocks): there,
 * give world points (`fr.world(…)`) and add the frame's `theta` to `az`. A
 * `Local` with a `theta` is such a frame's (the same rule). Into a `PsFrame`'s
 * `b`: add its origin (`F.ox`, `F.oy`, `F.oz`); the shapes' blocks are not in
 * its near-only `small` set (`F.fine` marks only its own boxes), so they are
 * drawn at every distance.
 * Every shape takes `src` (a bug report names the line that made it; default:
 * the caller of the shape), `mat` and `shade`.
 *
 * **Shapes** (blocks each; sizes are real ones, as the map's plants have them):
 *
 * | shape | what | blocks |
 * |---|---|---|
 * | `leaf` | one blade from its base: a curved slab narrow at the stalk, widest past the middle, a pointed tip (a square turned 45° in the blade), a paler mid-rib on top; `shape` `lance` (mango), `broad` (gourd, pumpkin), `oblong` (banana); `fold` folds its two halves down from the rib (a banana leaf) or up (a cupped leaf) | `segs` + 1 tip + `segs` rib (+`segs` with `fold`, +1 `stalk`): 1 seg no rib 2, 2 segs 5 (default), 3 segs 7, 3 segs folded 10 |
 * | `teardrop` | a fruit hanging from its stalk, the narrow end up: mango (0.12 × 0.09 m, `depth` 0.85, `curve` 0.3, a `blush` blended from the stalk), papaya (0.25 × 0.14 m, `taper` 0.65); lying with `dir` | 5 (2 with `low`), +1 `stalk` |
 * | `round` | a fruit round about its upright axis, squat or tall, in four steps up its side (a narrow foot, the ribbed band, the shoulder, the top): pumpkin (0.45 × 0.3 m), round gourd, melon, jackfruit (`hang` from a trellis or a trunk) | 6 (3 with `low`), +1 `stalk` |
 * | `long` | a finger along a gentle curve, thick in the middle: banana (0.16 × 0.035 m, `neck` 0.55, a dark `tip`), long eggplant (0.25 × 0.055 m, a green `cap`) | `segs` × 2 (× 1 with `sides: 4`), +1 `tip`, +1 `cap`: banana finger 3, eggplant 5 |
 * | `fan` | a hand-shaped leaf on a long stalk: `lobes` leaves fanned across its end (papaya: stalk 0.6–0.8 m, 7 lobes 0.55 × 0.22 m, `spread` 3.2) | 1 + each lobe's: 5 lobes of 1 piece, no rib, 11 (7: 15) |
 * | `vine` | a stem along given points (`sag` drapes them between two posts, `spiral` winds them up one) with leaves on alternate sides and curling tendrils | 1 a span, + each leaf's, + 3 a tendril |
 *
 * Helpers: `beam` (a block from point a to point c, turned along that line),
 * `log` (a stick: two beams turned 45°), `cross` (a round-ish body: two
 * beams crossed, as the fruit use), `along` (a point along a
 * heading), `across`, `mix` (two colours mixed).
 *
 * Check them: `index.html?shot=1&plantkit=lineup` lays every shape in a row on
 * a stone table in the meadow behind Angkor Wat (the console names the camera:
 * docs/map-work/BRIEF.md "The plant kit").
 */

export type P3 = [number, number, number];
type Mat = VoxelMaterialKey;

const UP = new Vector3(0, 1, 0);
const _a = new Vector3();
const _c = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _t = new Vector3();
const _m = new Matrix4();
const _e = new Euler();

/**
 * A block from point a to point c (its length along the line), `w` wide and `h`
 * deep. Its width lies level (across the line, in the ground plane) and `roll`
 * turns it about the line: positive lifts its +x side (x = up × the line).
 */
export function beam(b: VoxelBuilder, a: P3, c: P3, w: number, h: number, color: number, mat: Mat, roll = 0, shade?: number, src?: SourceTrace): void {
  _a.set(a[0], a[1], a[2]);
  _c.set(c[0], c[1], c[2]);
  _z.subVectors(_c, _a);
  const len = _z.length();
  if (len < 1e-4) return;
  _z.divideScalar(len);
  _x.crossVectors(UP, _z);
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
  _x.normalize();
  _y.crossVectors(_z, _x);
  if (roll) {
    const co = Math.cos(roll);
    const si = Math.sin(roll);
    _t.copy(_x);
    _x.multiplyScalar(co).addScaledVector(_y, si);
    _y.multiplyScalar(co).addScaledVector(_t, -si);
  }
  _e.setFromRotationMatrix(_m.makeBasis(_x, _y, _z), 'XYZ');
  b.box((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2, w, h, len, color, mat, { shade, src, rx: _e.x || undefined, ry: _e.y || undefined, rz: _e.z || undefined });
}

/** A round-ish stick from a to c, `d` thick: two blocks turned 45° about its length (an octagon). */
export function log(b: VoxelBuilder, a: P3, c: P3, d: number, color: number, mat: Mat, shade = 1, src?: SourceTrace): void {
  const s = d * 0.86;
  beam(b, a, c, s, s, color, mat, 0, shade, src);
  beam(b, a, c, s, s, color, mat, Math.PI / 4, shade * 0.96, src);
}

/**
 * A round-ish body from a to c, `w` wide and `h` deep: two blocks crossed (one narrower each way), so its
 * corners are cut in steps (two blocks turned 45° would stand out of each other's faces as ridges).
 */
export function cross(b: VoxelBuilder, a: P3, c: P3, w: number, h: number, color: number, mat: Mat, roll = 0, shade = 1, src?: SourceTrace, k = 0.78): void {
  beam(b, a, c, w, h * k, color, mat, roll, shade, src);
  beam(b, a, c, w * k, h, color, mat, roll, shade * 0.97, src);
}

/** A point `len` along the direction of azimuth `az` (0: +z) and elevation `el` from p. */
export function along(p: P3, az: number, el: number, len: number): P3 {
  const h = Math.cos(el) * len;
  return [p[0] + Math.sin(az) * h, p[1] + Math.sin(el) * len, p[2] + Math.cos(az) * h];
}

/** The level unit vector across azimuth `az` (beam's +x for a line going that way). */
export const across = (az: number): P3 => [Math.cos(az), 0, -Math.sin(az)];

/** Two sRGB colours mixed (t 0: a, 1: b). */
export function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => {
    const x = (a >> s) & 255;
    const y = (b >> s) & 255;
    return Math.round(x + (y - x) * t) & 255;
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** p moved by `d` along the unit vector u. */
const plus = (p: P3, u: P3, d: number): P3 => [p[0] + u[0] * d, p[1] + u[1] * d, p[2] + u[2] * d];

/**
 * A block centred at c, its length along the line of azimuth `az` and elevation
 * `el`, turned `roll` about that line (as `beam`), then `spin` about its own
 * thin axis (in the plane of its width and length: π/4 makes a square a diamond).
 */
function slab(b: VoxelBuilder, c: P3, az: number, el: number, roll: number, spin: number, w: number, h: number, len: number, color: number, mat: Mat, shade: number, src: SourceTrace | undefined): void {
  const ce = Math.cos(el);
  _z.set(Math.sin(az) * ce, Math.sin(el), Math.cos(az) * ce);
  _x.crossVectors(UP, _z);
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
  _x.normalize();
  _y.crossVectors(_z, _x);
  if (roll) {
    const co = Math.cos(roll);
    const si = Math.sin(roll);
    _t.copy(_x);
    _x.multiplyScalar(co).addScaledVector(_y, si);
    _y.multiplyScalar(co).addScaledVector(_t, -si);
  }
  if (spin) {
    const co = Math.cos(spin);
    const si = Math.sin(spin);
    _t.copy(_x);
    _x.multiplyScalar(co).addScaledVector(_z, si);
    _z.multiplyScalar(co).addScaledVector(_t, -si);
  }
  _e.setFromRotationMatrix(_m.makeBasis(_x, _y, _z), 'XYZ');
  b.box(c[0], c[1], c[2], w, h, len, color, mat, { shade, src, rx: _e.x || undefined, ry: _e.y || undefined, rz: _e.z || undefined });
}

/** The unit vectors across (+x) and up out of (+y) a line of azimuth `az`, elevation `el`, turned `roll` about it. */
function sides(az: number, el: number, roll: number): [P3, P3] {
  const ce = Math.cos(el);
  _z.set(Math.sin(az) * ce, Math.sin(el), Math.cos(az) * ce);
  _x.crossVectors(UP, _z);
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
  _x.normalize();
  _y.crossVectors(_z, _x);
  const co = Math.cos(roll);
  const si = Math.sin(roll);
  return [
    [_x.x * co + _y.x * si, _x.y * co + _y.y * si, _x.z * co + _y.z * si],
    [_y.x * co - _x.x * si, _y.y * co - _x.y * si, _y.z * co - _x.z * si],
  ];
}

/** Common options of every shape. */
interface Common {
  /** Material (default `mapLeaf` for leaves and vines, `petal` for fruit: the map's families). */
  mat?: Mat;
  shade?: number;
  /** The code that made it (default: where the shape was called). */
  src?: SourceTrace;
}

// ── Leaves ─────────────────────────────────────────────────────────────────

export interface LeafOpts extends Common {
  /** From its base to its tip (m), and its width at the widest. */
  len: number;
  wid: number;
  /** Heading and elevation at its base (radians). */
  az: number;
  el: number;
  color: number;
  /** How far it turns down from base to tip (radians; negative curls it up). Default 0.35. */
  bend?: number;
  /** Turned about its length (radians; positive lifts its +x side). */
  roll?: number;
  /** Its two halves folded from the mid-rib: positive droops them (Λ: a banana leaf), negative cups them (V). Doubles the body's blocks. */
  fold?: number;
  /** Pieces along it before the tip, 1‥3 (default 2): more bend smoothly. */
  segs?: 1 | 2 | 3;
  /** Its outline (default `lance`): `broad` for heart-shaped leaves (gourd, pumpkin), `oblong` for a banana's. */
  shape?: LeafShape;
  /** The mid-rib's colour (default the blade's, paler), or false for none (far leaves). */
  rib?: number | false;
  /** Thickness (m). Default 9 % of its width, 1.2‥4 cm. */
  thick?: number;
  /** A stalk this long before the blade (m; one block, the rib's colour darkened). */
  stalk?: number;
}

/**
 * Outlines: each body piece's width (share of `wid`), base first, by `segs`, and the tip diamond's: a `lance` leaf
 * (mango, most leaves) narrow at the stalk, widest past the middle; a `broad` one (gourd, pumpkin: heart-shaped)
 * wide from its base; an `oblong` one (banana) nearly as wide all along.
 */
const LEAF_W: Record<LeafShape, Record<1 | 2 | 3, readonly number[]>> = {
  lance: { 1: [0.9], 2: [0.68, 1], 3: [0.58, 1, 0.86] },
  broad: { 1: [1], 2: [0.94, 1], 3: [0.9, 1, 0.84] },
  oblong: { 1: [1], 2: [0.86, 1], 3: [0.8, 1, 0.96] },
};
const LEAF_TIP: Record<LeafShape, Record<1 | 2 | 3, number>> = {
  lance: { 1: 0.78, 2: 0.74, 3: 0.62 },
  broad: { 1: 0.8, 2: 0.72, 3: 0.66 },
  oblong: { 1: 0.7, 2: 0.66, 3: 0.6 },
};
/** Each body piece's share of the body's length (the narrow base short, the widest piece long: an oval, not a cross). */
const LEAF_L: Record<LeafShape, Record<1 | 2 | 3, readonly number[]>> = {
  lance: { 1: [1], 2: [0.36, 0.64], 3: [0.24, 0.46, 0.3] },
  broad: { 1: [1], 2: [0.45, 0.55], 3: [0.3, 0.4, 0.3] },
  oblong: { 1: [1], 2: [0.4, 0.6], 3: [0.3, 0.4, 0.3] },
};
export type LeafShape = 'lance' | 'broad' | 'oblong';
const RIB = 0xdcecaa;

/**
 * One leaf from the end of its stalk at `at`: a slab in `segs` pieces bending
 * down by `bend`, narrow at the base, widest past the middle, ending in a
 * point (a square turned 45° in the blade), a paler mid-rib along its top.
 * Returns its tip.
 */
export function leaf(b: VoxelBuilder, at: P3, o: LeafOpts): P3 {
  const src = o.src ?? traceSource();
  const mat = o.mat ?? 'mapLeaf';
  const shade = o.shade ?? 1;
  const segs = o.segs ?? 2;
  const bend = o.bend ?? 0.35;
  const roll = o.roll ?? 0;
  const fold = o.fold ?? 0;
  const t = o.thick ?? Math.min(0.04, Math.max(0.012, o.wid * 0.09));
  const rib = o.rib === false ? null : (o.rib ?? mix(o.color, RIB, 0.38));
  let p = at;
  if (o.stalk) {
    const q = along(p, o.az, o.el + bend * 0.3, o.stalk);
    const sw = Math.max(0.008, o.wid * 0.07);
    beam(b, p, q, sw, sw, mix(rib ?? o.color, 0x3a5a22, 0.3), mat, roll, shade, src);
    p = q;
  }
  // (the tip's diamond: its diagonal, as long as it is wide; the body runs to its middle)
  const shape = o.shape ?? 'lance';
  const D = Math.min(o.wid * LEAF_TIP[shape][segs], o.len * 0.9);
  const body = Math.max(o.len - D / 2, o.len * 0.3);
  const ws = LEAF_W[shape][segs];
  const ls = LEAF_L[shape][segs];
  let cum = 0;
  for (let i = 0; i < segs; i++) {
    const el = o.el - bend * cum;
    const piece = body * ls[i];
    cum += ls[i];
    const w = o.wid * ws[i];
    // (each piece reaches a little into the next: no gap on the bend)
    const lap = i < segs - 1 ? t : 0;
    const c = along(p, o.az, el, (piece + lap) / 2);
    const q = along(p, o.az, el, piece);
    const col = i % 2 ? o.color : mix(o.color, 0x203a10, 0.06);
    if (fold) {
      for (const s of [-1, 1]) {
        const r = roll - s * fold;
        const [x] = sides(o.az, el, r);
        slab(b, plus(c, x, (s * w) / 4), o.az, el, r, 0, w / 2 + t * 0.5, t, piece + lap, s < 0 ? mix(col, 0x203a10, 0.05) : col, mat, shade, src);
      }
    } else slab(b, c, o.az, el, roll, 0, w, t, piece + lap, col, mat, shade, src);
    if (rib !== null) {
      // (on the top face, standing out a hair; the last runs on into the tip)
      const [, n] = sides(o.az, el, roll);
      const rl = piece + (i === segs - 1 ? D * 0.3 : lap);
      const rc = along(p, o.az, el, rl / 2);
      const rw = Math.max(0.008, o.wid * 0.07);
      slab(b, plus(rc, n, t * 0.55), o.az, el, roll, 0, rw, t * 0.8, rl, rib, mat, shade, src);
    }
    p = q;
  }
  const el = o.el - bend;
  const s = D / Math.SQRT2;
  slab(b, p, o.az, el, roll, Math.PI / 4, s, t, s, mix(o.color, 0x203a10, 0.03), mat, shade, src);
  return along(p, o.az, el, D / 2);
}

export interface FanOpts extends Omit<LeafOpts, 'az' | 'el' | 'roll' | 'fold' | 'stalk'> {
  /** Heading and elevation of its stalk at `at` (radians). */
  az: number;
  el: number;
  /** The stalk's length (m; one block, bending down a little), and its colour (default the blade's, paler). */
  stalk: number;
  stalkColor?: number;
  /** Lobes fanned across the stalk's end (default 5), and how wide the fan opens (radians, default 2.4). */
  lobes?: number;
  spread?: number;
  /** The blade's elevation at the stalk's end (default the stalk's, less 0.3: the hand opens level). */
  blade?: number;
}

/**
 * A hand-shaped leaf on a long stalk (papaya, cassava, castor): the stalk from
 * `at`, then `lobes` lobes (each a `leaf`, `len` × `wid`, the middle ones
 * longest) fanned across its end. Blocks: 1 + each lobe's (5 lobes of 1 piece
 * with no rib: 11).
 */
export function fan(b: VoxelBuilder, at: P3, o: FanOpts): P3 {
  const src = o.src ?? traceSource();
  const mat = o.mat ?? 'mapLeaf';
  const shade = o.shade ?? 1;
  const n = o.lobes ?? 5;
  const spread = o.spread ?? 2.4;
  const end = along(at, o.az, o.el, o.stalk);
  const sw = Math.max(0.012, o.wid * 0.12);
  beam(b, at, end, sw, sw, o.stalkColor ?? mix(o.color, RIB, 0.45), mat, 0, shade, src);
  const blade = o.blade ?? o.el - 0.3;
  // (each lobe a leaf: the fan's own options but its stalk's)
  const { stalk: _s, stalkColor: _c, lobes: _n, spread: _p, blade: _b, ...lf } = o;
  for (let j = 0; j < n; j++) {
    const f = n > 1 ? j / (n - 1) - 0.5 : 0;
    const phi = f * spread;
    leaf(b, end, { ...lf, az: o.az + phi, el: blade - 0.25 * Math.abs(phi), len: o.len * (1 - 0.55 * Math.abs(f)), roll: -phi * 0.25, mat, shade, src });
  }
  return end;
}

// ── Fruit ──────────────────────────────────────────────────────────────────

export interface TeardropOpts extends Common {
  /** From the stalk to the round end (m), and across at the widest. */
  len: number;
  wid: number;
  color: number;
  /** Its axis from the stalk end to the round end (a unit vector; default straight down: hanging). */
  dir?: P3;
  /** Turned about its axis (radians): where its flat side and blush face. */
  roll?: number;
  /** Its depth over its width (a mango is a little flat: 0.85). Default 1. */
  depth?: number;
  /** The narrow end's width (share of `wid`; default 0.5: a mango; a papaya 0.65). */
  taper?: number;
  /** The narrow end's colour (default the body's, a little greener). */
  neck?: number;
  /** A blush blended along it, deepest at the stalk end (a ripe mango's red shoulders). */
  blush?: number;
  /** Its axis bending toward its +x side (share of its width at the round end; a mango 0.3). Default 0. */
  curve?: number;
  /** A stalk above it (m) and its colour. */
  stalk?: number;
  stalkColor?: number;
  /** Two blocks (far): the body and the shoulder, no point. */
  low?: boolean;
}

/**
 * A fruit with a round end and a narrow one, like a drop of water (the garden's
 * thirst drop, garden/_viewThirst.ts): `top` is where its stalk meets it, the
 * round end `len` away along `dir`, its axis bending `curve` toward its +x side
 * (a mango's kidney shape). Round end (two blocks crossed, its corners cut, a
 * narrower block rounding it off), the shoulder narrowing to the stalk, the
 * narrow end at the stalk (turned 45° where it fits inside the shoulder). A `blush` is blended along it: deepest at the
 * stalk end, fading over the shoulder into the round end (no patch).
 * Returns the round end's tip.
 */
export function teardrop(b: VoxelBuilder, top: P3, o: TeardropOpts): P3 {
  const src = o.src ?? traceSource();
  const mat = o.mat ?? 'petal';
  const shade = o.shade ?? 1;
  const d0 = o.dir ?? ([0, -1, 0] as P3);
  const dl = Math.hypot(d0[0], d0[1], d0[2]) || 1;
  const d: P3 = [d0[0] / dl, d0[1] / dl, d0[2] / dl];
  const roll = o.roll ?? 0;
  const dep = o.depth ?? 1;
  const { len, wid } = o;
  const tp = o.taper ?? 0.5;
  const neckC = o.neck ?? mix(o.color, 0x6a8a2a, 0.22);
  // (its +x side: the way it bends and, with a blush, the sun side)
  const [sx] = sides(Math.atan2(d[0], d[2]), Math.asin(Math.max(-1, Math.min(1, d[1]))), roll);
  const bendTo = (o.curve ?? 0) * wid * 0.5;
  const at = (u: number): P3 => plus(plus(top, d, u), sx, bendTo * (u / len) * (u / len));
  // Colours from the stalk end to the round end: a blush deepest at the stalk, fading out over the shoulder.
  const bl0 = o.blush;
  const tipC = bl0 === undefined ? neckC : mix(bl0, neckC, 0.25);
  const shoulderC = bl0 === undefined ? mix(o.color, neckC, 0.35) : mix(o.color, bl0, 0.55);
  const bodyC = bl0 === undefined ? o.color : mix(o.color, bl0, 0.2);
  if (o.stalk) beam(b, plus(top, d, -o.stalk), at(len * 0.06), Math.max(0.01, wid * 0.12), Math.max(0.01, wid * 0.12), o.stalkColor ?? 0x5a6a2a, 'mapLeaf', roll, shade, src);
  // The round end: at least as long as it is wide (half the fruit, a long one), its corners cut (two blocks crossed).
  const bl = Math.min(len, Math.max(wid * 0.96, len * 0.5));
  const uc = len - bl / 2;
  if (o.low) beam(b, at(len - bl), at(len), wid, wid * dep, o.color, mat, roll, shade, src);
  else {
    // (its widest part stops short of the end: a narrower block rounds the end off, no flat square bottom)
    const tl = len * 0.16;
    beam(b, at(len - bl), at(len - tl * 0.6), wid, wid * dep * 0.78, bodyC, mat, roll, shade, src);
    beam(b, at(len - bl), at(len - tl * 0.6), wid * 0.78, wid * dep, o.color, mat, roll, shade * 0.97, src);
    beam(b, at(len - tl * 1.6), at(len), wid * 0.68, wid * dep * 0.68, o.color, mat, roll, shade * 0.98, src);
  }
  // The shoulder, a little narrower, from near the stalk into the round end's middle; the narrow end at the stalk.
  const sw = tp + (1 - tp) * 0.68;
  beam(b, at(len * 0.05), at(uc), wid * sw, wid * dep * sw, shoulderC, mat, roll, shade, src);
  // (turned 45° only while its corners stay inside the shoulder: else they would stand out of it as ridges)
  if (!o.low) beam(b, at(0), at(len * 0.22), wid * tp, wid * tp * dep, tipC, mat, roll + (tp * Math.SQRT1_2 <= (sw * dep) / 2 ? Math.PI / 4 : 0), shade, src);
  return at(len);
}

export interface RoundOpts extends Common {
  /** Across (m) and high. */
  wid: number;
  hgt: number;
  color: number;
  /** The second tone of its ribs (default the body's, darker). */
  rib?: number;
  /** Its top's colour (default between the body's and the ribs'). */
  cap?: number;
  /** Turned about its upright axis. */
  ry?: number;
  /** A stalk on top: its colour (corky brown for a pumpkin). */
  stalk?: number;
  /** Hanging from `at` on its stalk (this long, m) instead of lying with its foot at `at`. */
  hang?: number;
  /** Its widest band in two tones, the ribs (default yes; false: one colour, a smooth melon). */
  ribs?: boolean;
  /** Three blocks (far): the foot, the band, the shoulder, square. */
  low?: boolean;
}

/**
 * A fruit round about its upright axis, from its foot at `at` (or hanging from
 * `at` with `hang`), in four steps up its side so it reads round from any
 * height (no box with a lid): a narrower foot, the widest band (two blocks
 * crossed: eight lobes in two tones, the ribs), the shoulder narrowing again
 * (crossed too: eight-sided from above), the small top round the stalk.
 */
export function round(b: VoxelBuilder, at: P3, o: RoundOpts): void {
  const src = o.src ?? traceSource();
  const mat = o.mat ?? 'petal';
  const shade = o.shade ?? 1;
  const { wid: w, hgt: h } = o;
  const ry = o.ry ?? 0;
  const rib = o.ribs === false ? o.color : (o.rib ?? mix(o.color, 0x2a2a12, 0.18));
  const cap = o.cap ?? mix(o.color, rib, 0.4);
  const stalkH = Math.max(0.025, h * 0.14);
  const x = at[0];
  const z = at[2];
  const y0 = o.hang !== undefined ? at[1] - o.hang - h : at[1];
  if (o.low) {
    // (the foot, the band, the shoulder: three steps, square, one turn)
    b.box(x, y0 + h * 0.13, z, w * 0.74, h * 0.26, w * 0.74, mix(o.color, rib, 0.5), mat, { shade: shade * 0.94, src, ry });
    b.box(x, y0 + h * 0.46, z, w * 0.92, h * 0.5, w * 0.92, o.color, mat, { shade, src, ry });
    b.box(x, y0 + h * 0.8, z, w * 0.72, h * 0.3, w * 0.72, cap, mat, { shade, src, ry });
  } else {
    // (each square step sits inside the cut corners of the band: no corner stands out; the band and the shoulder are
    // two blocks crossed, eight-sided from above)
    b.box(x, y0 + h * 0.13, z, w * 0.76, h * 0.26, w * 0.76, mix(o.color, rib, 0.5), mat, { shade: shade * 0.94, src, ry });
    b.box(x, y0 + h * 0.47, z, w, h * 0.56, w * 0.8, o.color, mat, { shade, src, ry });
    b.box(x, y0 + h * 0.47, z, w * 0.8, h * 0.56, w, rib, mat, { shade: shade * 0.98, src, ry });
    b.box(x, y0 + h * 0.79, z, w * 0.8, h * 0.22, w * 0.62, mix(o.color, cap, 0.5), mat, { shade, src, ry });
    b.box(x, y0 + h * 0.79, z, w * 0.62, h * 0.22, w * 0.8, mix(rib, cap, 0.5), mat, { shade: shade * 0.98, src, ry });
    b.box(x, y0 + h * 0.92, z, w * 0.42, h * 0.12, w * 0.42, cap, mat, { shade: shade * 0.97, src, ry });
  }
  if (o.stalk !== undefined) {
    const sw = Math.max(0.018, w * 0.09);
    if (o.hang !== undefined) b.box(x, y0 + h + o.hang / 2, z, sw * 0.6, o.hang + h * 0.1, sw * 0.6, o.stalk, 'mapLeaf', { shade, src, ry });
    else b.box(x, y0 + h + stalkH * 0.35, z, sw, stalkH, sw, o.stalk, 'mapBark', { shade, src, ry, rz: 0.3 });
  }
}

export interface LongOpts extends Common {
  /** From its stalk end to its tip (m), and across at the thickest. */
  len: number;
  thick: number;
  /** Heading and elevation at its stalk end. */
  az: number;
  el: number;
  color: number;
  /** How far it turns up from stalk end to tip (radians; negative down). Default 0.4. */
  curve?: number;
  /** Pieces along it, 2‥3 (default 2). */
  segs?: 2 | 3;
  /** Its width at the stalk end and at the tip (shares of `thick`; default 0.7, 0.7). A banana has a thin neck (0.55). */
  neck?: number;
  taper?: number;
  /** 8 (default): two blocks a piece turned 45° (round); 4: one (square, far or in a heap). */
  sides?: 4 | 8;
  /** A blunt tip of this colour (a banana's dark end). */
  tip?: number;
  /** A calyx or stalk at the stalk end, this colour (an eggplant's green star), `capWid` × its neck wide. */
  cap?: number;
  capWid?: number;
}

/**
 * A long fruit from its stalk end at `base`, curving gently: thick in the
 * middle, narrowing to its neck and its tip. Returns its tip.
 */
export function long(b: VoxelBuilder, base: P3, o: LongOpts): P3 {
  const src = o.src ?? traceSource();
  const mat = o.mat ?? 'petal';
  const shade = o.shade ?? 1;
  const segs = o.segs ?? 2;
  const curve = o.curve ?? 0.4;
  const neck = o.neck ?? 0.7;
  const taper = o.taper ?? 0.7;
  // (its width along it: from the neck to the thickest at a third, then to the tip)
  const width = (u: number) => o.thick * (u < 0.35 ? neck + (1 - neck) * (u / 0.35) : 1 - (1 - taper) * ((u - 0.35) / 0.65));
  const piece = o.len / segs;
  let p = base;
  let el = o.el;
  if (o.cap !== undefined) {
    const cw = o.thick * neck * (o.capWid ?? 1.15);
    beam(b, along(p, o.az, el, -o.len * 0.03), along(p, o.az, el, o.len * 0.12), cw, cw, o.cap, 'mapLeaf', 0, shade, src);
  }
  for (let i = 0; i < segs; i++) {
    el = o.el + (curve * (i + 0.5)) / segs;
    const w = width((i + 0.5) / segs);
    const q = along(p, o.az, el, piece);
    // (each piece reaches on into the next: no gap on the bend)
    const e = i < segs - 1 ? along(p, o.az, el, piece + w * 0.35) : q;
    if ((o.sides ?? 8) === 8) cross(b, p, e, w, w, o.color, mat, 0, shade, src);
    else beam(b, p, e, w * 0.9, w * 0.9, o.color, mat, 0, shade, src);
    p = q;
  }
  if (o.tip !== undefined) {
    const tw = width(1) * 0.62;
    beam(b, along(p, o.az, el, -tw * 0.4), along(p, o.az, el, tw * 0.5), tw, tw, o.tip, mat, Math.PI / 4, shade, src);
  }
  return p;
}

// ── Vines ──────────────────────────────────────────────────────────────────

export interface VineOpts extends Common {
  /** The stem's thickness (m). */
  thick: number;
  color: number;
  /** Leaves at its points (not the first): every `every`-th (default 1), on alternate sides, `spread` off the stem's heading (default 1.25 rad), rising `el` (default 0.5). */
  leaf?: Omit<LeafOpts, 'az' | 'el' | keyof Common> & { el?: number; every?: number; spread?: number };
  /** Curling tendrils of this colour at the points with no leaf. */
  tendril?: number;
  /** Varies the leaves' lengths and headings (the same every build). */
  seed?: number;
}

/**
 * A vine's stem along `pts` (one block a span), its leaves at the points on
 * alternate sides, tendrils curling at the points between.
 */
export function vine(b: VoxelBuilder, pts: readonly P3[], o: VineOpts): void {
  const src = o.src ?? traceSource();
  const mat = o.mat ?? 'mapLeaf';
  const shade = o.shade ?? 1;
  const seed = o.seed ?? 0;
  const dark = mix(o.color, 0x203010, 0.12);
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const c = pts[i + 1];
    const dx = c[0] - a[0];
    const dy = c[1] - a[1];
    const dz = c[2] - a[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    const e = (o.thick * 0.5) / l;
    beam(b, [a[0] - dx * e, a[1] - dy * e, a[2] - dz * e], [c[0] + dx * e, c[1] + dy * e, c[2] + dz * e], o.thick, o.thick, i % 2 ? dark : o.color, mat, 0, shade, src);
  }
  const lf = o.leaf;
  const every = lf?.every ?? 1;
  let side = 1;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[i - 1];
    const az = Math.atan2(p[0] - q[0], p[2] - q[2]);
    if (lf && i % every === 0) {
      const r = hash3(i, seed, 17, 401);
      const r2 = hash3(i, seed, 18, 401);
      leaf(b, p, { ...lf, az: az + side * (lf.spread ?? 1.25) + (r - 0.5) * 0.4, el: (lf.el ?? 0.5) + (r2 - 0.5) * 0.3, len: lf.len * (0.88 + 0.24 * r2), wid: lf.wid * (0.88 + 0.24 * r2), roll: (lf.roll ?? 0) - side * 0.2, mat: o.mat, shade, src });
      side = -side;
    } else if (o.tendril !== undefined) {
      // (three short turns of a spiral, rising and curling over)
      let t = p;
      const a0 = az - side * 1.2;
      for (let k = 0; k < 3; k++) {
        const n = along(t, a0 + side * k * 2.1, 0.5 - k * 0.55, 0.05 - k * 0.008);
        beam(b, t, n, 0.012, 0.012, o.tendril, mat, 0, shade, src);
        t = n;
      }
    }
  }
}

/** `n` spans from a to c hanging `drop` m lower in the middle (a vine draped between two posts): n + 1 points. */
export function sag(a: P3, c: P3, n: number, drop: number): P3[] {
  const out: P3[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    out.push([a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u - 4 * drop * u * (1 - u), a[2] + (c[2] - a[2]) * u]);
  }
  return out;
}

/** `n` spans winding up round a post from its foot at `foot`: `height` m, `turns` times round at `radius`: n + 1 points. */
export function spiral(foot: P3, height: number, radius: number, turns: number, n: number, a0 = 0): P3[] {
  const out: P3[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = a0 + u * turns * Math.PI * 2;
    out.push([foot[0] + Math.sin(a) * radius, foot[1] + u * height, foot[2] + Math.cos(a) * radius]);
  }
  return out;
}
