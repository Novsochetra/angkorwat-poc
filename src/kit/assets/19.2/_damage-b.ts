import type { BlockSet, BlockStyle } from '../../BlockSet';
import { fromSheet, MOSS, SANDSTONE } from '../../palette';
import type { PieceBuilder } from '../../PieceBuilder';
import { TEXEL } from '../../shapes';
import { hash3, valueNoise3 } from '../../../voxel/random';
import type { Surf } from '../../../voxel/VoxelBuilder';

/**
 * Shared pieces of §19.2 stone damage ④–⑥ (eroded edge, collapsed decorative
 * piece, dark weathering): dry-laid walls whose joints read as the sheet's dark
 * lines, wear that crumbles stones into the sheet's clusters of smaller
 * rounded cubes, carved reliefs in texel cells and the top-view tiles.
 */
export const T = TEXEL;
export const B = 0.5;

export type V3 = [number, number, number];

/** Albedos of colours picked off the sheet's lit faces (see {@link fromSheet}). */
export const sheetTones = (...hex: number[]): number[] => hex.map(fromSheet);

/** The dark of the joints and hollows (the sheet's near-black joint lines). */
export const JOINT = SANDSTONE.cavity[1];

/** Smooth 0‥1 ramp from a to b. */
export function ramp(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Value noise in 0‥1 at metre coordinates with a feature size of `size` metres. */
export function noise(x: number, y: number, z: number, size: number, seed: number): number {
  return valueNoise3(x / size, y / size, z / size, seed);
}

const snapT = (v: number) => Math.round(v / T) * T;

/** A dressed stone to lay: box (metres), colour and look. */
export interface Stone {
  min: V3;
  max: V3;
  color: number;
  style: BlockStyle;
}

export interface WallOptions {
  /** Footprint (metres, min/max). */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Course heights from the bottom up (metres). */
  courses: readonly number[];
  /** Height of the bottom (default 0, the ground). */
  y0?: number;
  /** Blocks through the depth (default: one per 0.5 m). */
  skins?: number;
  /** Block length range along x (metres). */
  length: [number, number];
  palette: readonly number[];
  /** Look of the block centred at (x, y, z). */
  style?: (x: number, y: number, z: number) => BlockStyle;
  seed: number;
  /** Joint fill colour and pattern (default the dark joint). */
  mortar?: { color?: number; surf?: Surf };
  /** How far the joint fill sits back from the faces (texels, default 1). */
  recess?: number;
}

/** A laid-out wall: its stones, the fill of its open joints and its envelope. */
export interface WallLayout {
  stones: Stone[];
  /** Slabs filling the joints a texel back from the faces. */
  joints: Stone[];
  min: V3;
  max: V3;
}

/**
 * Lay out a dry-jointed wall in running bond: each block stops one texel short
 * of its neighbours so the joints open into the sheet's dark lines, and the
 * joints are filled a texel back from every face (the dark you see in them).
 */
export function layWall(o: WallOptions): WallLayout {
  const skins = o.skins ?? Math.max(1, Math.round((o.z1 - o.z0) / B));
  const y0 = o.y0 ?? 0;
  const top = y0 + o.courses.reduce((a, b) => a + b, 0);
  const stones: Stone[] = [];
  const joints: Stone[] = [];
  const fill = { color: o.mortar?.color ?? JOINT, style: { surf: o.mortar?.surf, broken: null } };
  // Joint slabs are clipped to the envelope, set back on every open side.
  const r = (o.recess ?? 1) * T;
  const lo: V3 = [o.x0 + r, y0, o.z0 + r];
  const hi: V3 = [o.x1 - r, top - r, o.z1 - r];
  const joint = (min: V3, max: V3) => {
    const a: V3 = [Math.max(min[0], lo[0]), Math.max(min[1], lo[1]), Math.max(min[2], lo[2])];
    const b: V3 = [Math.min(max[0], hi[0]), Math.min(max[1], hi[1]), Math.min(max[2], hi[2])];
    if (b[0] - a[0] > 1e-6 && b[1] - a[1] > 1e-6 && b[2] - a[2] > 1e-6) joints.push({ min: a, max: b, ...fill });
  };
  let y = y0;
  o.courses.forEach((h, c) => {
    const gy = c < o.courses.length - 1 ? T : 0;
    for (let s = 0; s < skins; s++) {
      const za = snapT(o.z0 + ((o.z1 - o.z0) * s) / skins);
      const gz = s < skins - 1 ? T : 0;
      const zb = snapT(o.z0 + ((o.z1 - o.z0) * (s + 1)) / skins) - gz;
      // Running bond: alternate courses (and skins) start with a part block.
      const half = (c + s) % 2 ? snapT(((o.length[0] + o.length[1]) / 4) * (0.8 + 0.4 * hash3(c, s, 1, o.seed))) : 0;
      let x = o.x0;
      for (let n = 0; x < o.x1 - 1e-6; n++) {
        let len = n === 0 && half > T ? half : snapT(o.length[0] + (o.length[1] - o.length[0]) * hash3(c, s, n, o.seed + 3));
        if (o.x1 - (x + len) < o.length[0] * 0.5) len = o.x1 - x;
        const xe = x + len;
        const gx = xe < o.x1 - 1e-6 ? T : 0;
        const color = o.palette[Math.floor(hash3(Math.round(x / T), c, s, o.seed + 9) * o.palette.length)];
        const style = o.style?.((x + xe) / 2, y + h / 2, (za + zb) / 2) ?? {};
        stones.push({ min: [x, y, za], max: [xe - gx, y + h - gy, zb], color, style });
        // Its joints to the right, above and behind (corners go with the slab above / in front).
        if (gx) joint([xe - gx, y, za], [xe, y + h - gy, zb]);
        if (gy) joint([x, y + h - gy, za], [xe, y + h, zb + gz]);
        if (gz) joint([x, y, zb], [xe, y + h - gy, zb + gz]);
        x = xe;
      }
    }
    y += h;
  });
  return { stones, joints, min: [o.x0, y0, o.z0], max: [o.x1, top, o.z1] };
}

/** Does stone survive at a point? (the stone being laid is passed along) */
export type Keep = (x: number, y: number, z: number, s: Stone) => boolean;

/**
 * Lay stones into the set, crumbled where wear reaches them. Each stone is
 * tested on a grid of `cell`-sized pieces (1/8 m, or per axis — wide, low
 * pieces make worn tops step down in terraces): untouched, it goes in whole
 * (one rounded block); bitten, the intact stone around the damage is peeled
 * off in whole slabs (biggest first, so the seams stay near the damage) and
 * the damaged box goes in as its surviving cubes, whole 2 × 2 × 2 groups as
 * one — the sheet's worn corners are exactly such clusters of smaller rounded
 * cubes. `piece` restyles the cubes (moss in the hollows).
 */
export function crumble(set: BlockSet, stones: readonly Stone[], keep: Keep, o: { cell?: number | V3; piece?: (s: Stone, x: number, y: number, z: number) => BlockStyle } = {}): void {
  const c = o.cell ?? 0.125;
  const cs = typeof c === 'number' ? [c, c, c] : c;
  for (const s of stones) {
    const n = [0, 1, 2].map((a) => Math.max(1, Math.round((s.max[a] - s.min[a]) / cs[a])));
    const cut = (a: number, i: number) => snapT(s.min[a] + ((s.max[a] - s.min[a]) * i) / n[a]);
    const mid = (a: number, i: number) => (cut(a, i) + cut(a, i + 1)) / 2;
    const gone = new Set<number>();
    const idx = (i: number, j: number, k: number) => (i * n[1] + j) * n[2] + k;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-1, -1, -1];
    for (let i = 0; i < n[0]; i++)
      for (let j = 0; j < n[1]; j++)
        for (let k = 0; k < n[2]; k++) {
          if (keep(mid(0, i), mid(1, j), mid(2, k), s)) continue;
          gone.add(idx(i, j, k));
          [i, j, k].forEach((v, a) => {
            lo[a] = Math.min(lo[a], v);
            hi[a] = Math.max(hi[a], v);
          });
        }
    // Cell-index box [a, b) → a block of the stone (cubes of the damage get the piece look).
    const add = (a: number[], b: number[], piece: boolean) => {
      const min: V3 = [cut(0, a[0]), cut(1, a[1]), cut(2, a[2])];
      const max: V3 = [cut(0, b[0]), cut(1, b[1]), cut(2, b[2])];
      const style = piece && o.piece ? { ...s.style, ...o.piece(s, (min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2) } : s.style;
      set.add(min[0], min[1], min[2], max[0], max[1], max[2], s.color, style);
    };
    const b0 = [0, 0, 0];
    const b1 = [...n];
    if (gone.size) {
      // Peel whole slabs off around the damage, along its thinnest axis first.
      for (const a of [0, 1, 2].sort((p, q) => (hi[p] - lo[p] + 1) / n[p] - (hi[q] - lo[q] + 1) / n[q])) {
        if (lo[a] > b0[a]) add(b0, b1.map((v, c) => (c === a ? lo[a] : v)), false);
        if (hi[a] + 1 < b1[a]) add(b0.map((v, c) => (c === a ? hi[a] + 1 : v)), b1, false);
        b0[a] = lo[a];
        b1[a] = hi[a] + 1;
      }
    }
    // The damaged box (or the untouched stone) as its surviving cubes.
    if (!gone.size) add(b0, b1, false);
    else
      for (let i = b0[0]; i < b1[0]; i += 2)
        for (let j = b0[1]; j < b1[1]; j += 2)
          for (let k = b0[2]; k < b1[2]; k += 2) {
            const e = [Math.min(i + 2, b1[0]), Math.min(j + 2, b1[1]), Math.min(k + 2, b1[2])];
            let whole = true;
            for (let ii = i; ii < e[0]; ii++) for (let jj = j; jj < e[1]; jj++) for (let kk = k; kk < e[2]; kk++) if (gone.has(idx(ii, jj, kk))) whole = false;
            if (whole) add([i, j, k], e, true);
            else for (let ii = i; ii < e[0]; ii++) for (let jj = j; jj < e[1]; jj++) for (let kk = k; kk < e[2]; kk++) if (!gone.has(idx(ii, jj, kk))) add([ii, jj, kk], [ii + 1, jj + 1, kk + 1], true);
          }
  }
}

/**
 * Wear measured on a box envelope. 'edges': stone at depth d₁ and d₂ below its
 * two nearest faces (top, sides — never the ground) survives while
 * d₁ + d₂ ≥ W, so edges and corners go first and flat faces stay. 'top': only
 * the top edges wear (top depth + nearest side). Depth below the top counts
 * `up` times, so worn tops step down in terraces wider than they are high.
 * Returns the `keep` test.
 */
export function envelopeWear(min: V3, max: V3, W: (x: number, y: number, z: number) => number, o: { up?: number; mode?: 'edges' | 'top' } = {}): (x: number, y: number, z: number) => boolean {
  const up = o.up ?? 2;
  return (x, y, z) => {
    const w = W(x, y, z);
    if (w <= 0) return true;
    const top = (max[1] - y) * up;
    const sides = [x - min[0], max[0] - x, z - min[2], max[2] - z];
    if (o.mode === 'top') return top + Math.min(...sides) >= w;
    const d = [top, ...sides].sort((a, b) => a - b);
    return d[0] + d[1] >= w;
  };
}

/** Relief art heights in texels above the carved-back ground ('#' proud, '+' a texel lower). */
const RELIEF: Record<string, number> = { '#': 2, '+': 1 };

/** A carved stone (see {@link reliefStone}). */
export interface ReliefStone {
  /** The whole stone, relief included (metres). */
  min: V3;
  max: V3;
  /** The carved face: 'front' = +z (picture up = +y), 'top' = +y seen from above (picture up = −z). */
  face: 'front' | 'top';
  /**
   * The motif, top row first, one character per texel of the face: '#' stands
   * proud (2 texels), '+' a texel lower (channels inside a leaf), anything else
   * is carved back to the ground ('.' ground, 'o' a drill hole, 'm' moss).
   */
  art: readonly string[];
  color: number;
  /** Colour of the carved-back ground: the sheet's hollows read dark. */
  ground: number;
  style?: BlockStyle;
}

/**
 * A stone carved in relief: its body, a one-texel skin of the dark ground tone
 * (ringed by the stone, so the sides stay stone) and a two-texel slab on the
 * face carved out on the texel grid wherever the motif isn't. The slab's
 * cells are emitted as one stone, so the motif reads as chiselled — smooth,
 * with lit edges — against a dark ground. 'm' in the art puts a tuft of moss
 * on the ground (needs `p`).
 */
export function reliefStone(set: BlockSet, o: ReliefStone, p?: PieceBuilder): void {
  const front = o.face === 'front';
  // Along the face normal: n = the axis, f = the face; a/b = the two axes of the face plane.
  const n = front ? 2 : 1;
  const [a, b] = front ? [0, 1] : [0, 2];
  const f = o.max[n];
  // A box between lo and hi along the normal, [a0, a1] × [b0, b1] across it.
  const box = (lo: number, hi: number, a0: number, a1: number, b0: number, b1: number, color: number, style?: BlockStyle) => {
    const min: V3 = [0, 0, 0];
    const max: V3 = [0, 0, 0];
    [min[n], max[n], min[a], max[a], min[b], max[b]] = [lo, hi, a0, a1, b0, b1];
    set.add(...min, ...max, color, style);
  };
  const [a0, a1, b0, b1] = [o.min[a], o.max[a], o.min[b], o.max[b]];
  box(o.min[n], f - 3 * T, a0, a1, b0, b1, o.color, o.style);
  // The dark skin, ringed by stone so the sides stay stone…
  box(f - 3 * T, f - 2 * T, a0 + T, a1 - T, b0 + T, b1 - T, o.ground, o.style);
  box(f - 3 * T, f - 2 * T, a0, a1, b0, b0 + T, o.color, o.style);
  box(f - 3 * T, f - 2 * T, a0, a1, b1 - T, b1, o.color, o.style);
  box(f - 3 * T, f - 2 * T, a0, a0 + T, b0 + T, b1 - T, o.color, o.style);
  box(f - 3 * T, f - 2 * T, a1 - T, a1, b0 + T, b1 - T, o.color, o.style);
  // …and the relief slab, carved back to it wherever the motif isn't.
  box(f - 2 * T, f, a0, a1, b0, b1, o.color, { ...o.style, broken: null });
  const rows = o.art.length;
  const at = (x: number, y: number, z: number) => {
    const u = Math.floor((x - o.min[0]) / T);
    const row = front ? rows - 1 - Math.floor((y - o.min[1]) / T) : Math.floor((z - o.min[2]) / T);
    return o.art[row]?.[u] ?? '.';
  };
  const slab: V3 = [...o.min];
  slab[n] = f - 2 * T;
  set.carve((x, y, z) => (RELIEF[at(x, y, z)] ?? 0) <= Math.floor(([x, y, z][n] - slab[n] + 1e-6) / T), { min: slab, max: o.max });
  if (!p) return;
  o.art.forEach((line, row) =>
    [...line].forEach((ch, u) => {
      if (ch !== 'm') return;
      const x = o.min[0] + (u + 0.5) * T;
      if (front) p.voxels.box(x, o.max[1] - (row + 0.5) * T, f - 2 * T + T / 2, T, T, T, MOSS[(u + row) % MOSS.length], 'leaves');
      else p.voxels.box(x, f - 2 * T + T / 2, o.min[2] + (row + 0.5) * T, T, T, T, MOSS[(u + row) % MOSS.length], 'leaves');
    }),
  );
}

/** A stone of a top-view tile: picture rectangle in texels [u0, row0, u1, row1), rows from the top (−z). */
export interface TileStone {
  rect: [number, number, number, number];
  color: number;
  style?: BlockStyle;
}

/**
 * Stones of a top-view tile (the cards' "tile (top view)"): `cols × rows`
 * texels centred on the origin, standing on y = 0, the stones separated by
 * open one-texel joints over a bed three texels down — the joints read as the
 * sheet's dark lines. Returns the stones for the caller to lay.
 */
export function tileStones(p: PieceBuilder, cols: number, rows: number, height: number, stones: readonly TileStone[], bed: { color: number; mat?: 'sandstone' | 'leaves'; surf?: Surf }): Stone[] {
  const x0 = (-cols / 2) * T;
  const z0 = (-rows / 2) * T;
  // (inset a hair so its sides don't z-fight with the stones' outer faces)
  p.voxels.span(x0 + 0.004, 0, z0 + 0.004, x0 + cols * T - 0.004, height - 3 * T, z0 + rows * T - 0.004, bed.color, bed.mat ?? 'sandstone', { surf: bed.surf, open: 4 });
  return stones.map((s) => {
    const [u0, r0, u1, r1] = s.rect;
    return { min: [x0 + u0 * T, 0, z0 + r0 * T], max: [x0 + u1 * T, height, z0 + r1 * T], color: s.color, style: s.style ?? {} };
  });
}
