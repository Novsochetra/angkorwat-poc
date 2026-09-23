import { traceSource, type SourceTrace } from '../feedback/sourceTrace';
import { KIT_TEXELS_PER_M } from '../voxel/materials';
import { hash3, mulberry32, valueNoise3 } from '../voxel/random';
import type { VoxelGrid } from '../voxel/VoxelBuilder';

/** One texel of the kit's pixel-art surfaces (1/16 m). Snap block edges to it. */
export const TEXEL = 1 / KIT_TEXELS_PER_M;

/** Round a length / coordinate to the texel grid (or another step). */
export function snap(v: number, step = TEXEL): number {
  return Math.round(v / step) * step;
}

/** Seeded random helpers around mulberry32. */
export interface Rng {
  (): number;
  range(a: number, b: number): number;
  int(a: number, b: number): number;
  pick<T>(list: readonly T[]): T;
  chance(p: number): boolean;
}

export function rng(seed: number): Rng {
  const next = mulberry32(seed * 2654435761 + 12345) as Rng;
  next.range = (a, b) => a + (b - a) * next();
  next.int = (a, b) => Math.floor(a + (b - a + 1) * next());
  next.pick = (list) => list[Math.min(list.length - 1, Math.floor(next() * list.length))];
  next.chance = (p) => next() < p;
  return next;
}

/** Deterministic pick from a palette by lattice hash (stable per cell). */
export function tone(palette: readonly number[], i: number, j: number, k: number, seed = 0): number {
  return palette[Math.floor(hash3(i, j, k, seed) * palette.length) % palette.length];
}

export type CellColor = (i: number, j: number, k: number) => number | null;

const asColor = (c: number | CellColor): CellColor => (typeof c === 'number' ? () => c : c);

/**
 * Fill an ellipsoid of cells (centre and radii in cell units, fractional ok).
 * `rough` perturbs the surface with value noise (0 = smooth, 0.4 = lumpy), like
 * the reference canopies and rocks.
 */
export function fillEllipsoid(
  g: VoxelGrid,
  c: [number, number, number],
  r: [number, number, number],
  color: number | CellColor,
  o: { rough?: number; seed?: number; scale?: number; hollow?: number } = {},
): void {
  const col = asColor(color);
  const rough = o.rough ?? 0;
  const seed = o.seed ?? 1;
  const scale = o.scale ?? 0.35;
  for (let i = Math.floor(c[0] - r[0] - 1); i <= Math.ceil(c[0] + r[0] + 1); i++)
    for (let j = Math.floor(c[1] - r[1] - 1); j <= Math.ceil(c[1] + r[1] + 1); j++)
      for (let k = Math.floor(c[2] - r[2] - 1); k <= Math.ceil(c[2] + r[2] + 1); k++) {
        const d = Math.hypot((i + 0.5 - c[0]) / r[0], (j + 0.5 - c[1]) / r[1], (k + 0.5 - c[2]) / r[2]);
        const n = rough ? (valueNoise3(i * scale, j * scale, k * scale, seed) - 0.5) * 2 * rough : 0;
        if (d > 1 + n) continue;
        if (o.hollow && d < o.hollow) continue;
        const v = col(i, j, k);
        if (v !== null) g.set(i, j, k, v);
      }
}

/**
 * Tapered tube along a quadratic Bézier (cell units): trunks, branches, roots,
 * vines. Radius goes from r0 at `a` to r1 at `b`.
 */
export function fillTube(
  g: VoxelGrid,
  a: [number, number, number],
  ctrl: [number, number, number] | null,
  b: [number, number, number],
  r0: number,
  r1: number,
  color: number | CellColor,
): void {
  const col = asColor(color);
  const m = ctrl ?? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) + Math.hypot(m[0] - a[0], m[1] - a[1], m[2] - a[2]);
  const steps = Math.max(2, Math.ceil(len * 2));
  const seen = new Set<string>();
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const u = 1 - t;
    const p = [0, 1, 2].map((x) => u * u * a[x] + 2 * u * t * m[x] + t * t * b[x]);
    const r = r0 + (r1 - r0) * t;
    const R = Math.ceil(r);
    for (let i = Math.floor(p[0] - R); i <= Math.floor(p[0] + R); i++)
      for (let j = Math.floor(p[1] - R); j <= Math.floor(p[1] + R); j++)
        for (let k = Math.floor(p[2] - R); k <= Math.floor(p[2] + R); k++) {
          if (Math.hypot(i + 0.5 - p[0], j + 0.5 - p[1], k + 0.5 - p[2]) > Math.max(0.5, r)) continue;
          const key = `${i},${j},${k}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const v = col(i, j, k);
          if (v !== null) g.set(i, j, k, v);
        }
  }
}

/** Vertical cylinder (cell units): base centre, height, radius (optionally tapering). */
export function fillCylinder(
  g: VoxelGrid,
  base: [number, number, number],
  height: number,
  r0: number,
  color: number | CellColor,
  r1 = r0,
): void {
  const col = asColor(color);
  for (let j = 0; j < height; j++) {
    const r = r0 + ((r1 - r0) * j) / Math.max(1, height - 1);
    for (let i = Math.floor(base[0] - r - 1); i <= Math.ceil(base[0] + r); i++)
      for (let k = Math.floor(base[2] - r - 1); k <= Math.ceil(base[2] + r); k++) {
        if (Math.hypot(i + 0.5 - base[0], k + 0.5 - base[2]) > r) continue;
        const v = col(i, base[1] + j, k);
        if (v !== null) g.set(i, base[1] + j, k, v);
      }
  }
}

/**
 * Poisson-ish scatter of points in a w × d rectangle centred on the origin
 * (metres), at least `minDist` apart. Deterministic for a seed.
 */
export function scatter(seed: number, n: number, w: number, d: number, minDist: number, tries = 30): [number, number][] {
  const r = rng(seed);
  const pts: [number, number][] = [];
  for (let t = 0; t < n * tries && pts.length < n; t++) {
    const x = (r() - 0.5) * w;
    const z = (r() - 0.5) * d;
    if (pts.every(([px, pz]) => Math.hypot(px - x, pz - z) >= minDist)) pts.push([x, z]);
  }
  return pts;
}

/** Capture "who made this" once for many boxes (dev builds; for the bug reporter). */
export function here(): SourceTrace | undefined {
  return traceSource();
}
