import { traceSource } from '../../feedback/sourceTrace';
import { hash3, mulberry32, valueNoise3 } from '../../voxel/random';
import type { VoxelGrid } from '../../voxel/VoxelBuilder';
import { pickOf } from '../landmarks/_ruin';
import { elephantEar, fern, FLOWER_SETS, flowers, grassTuft, type PlantSink } from '../veg/plants';
import type { SiteFrame } from './_ruinFrame';

/**
 * Small pieces shared by the jungle sites: the forest floor's plants, moss
 * patches on stone seen from a chosen side, tumbled blocks, stepping stones.
 */

const key = (i: number, j: number, k: number) => `${i},${j},${k}`;

/**
 * The forest floor's plants in a clearing: the undergrowth's own shapes
 * (veg/plants.ts: ferns, elephant ears, grass tufts, ground flowers) as
 * still `mapLeaf` blocks (the undergrowth pool leaves built ground bare).
 * `n` plants between `r0` and `r1` m from the site's middle, not on a
 * trail's tread or where `keepOut` says.
 */
export function plantsAround(fr: SiteFrame, o: { n: number; r0: number; r1: number; seed: number; keepOut?: (x: number, z: number) => boolean; flowers?: number }): void {
  const src = traceSource();
  for (let t = 0; t < o.n; t++) {
    const a = hash3(t, 1, o.seed, 90) * Math.PI * 2;
    const d = o.r0 + Math.sqrt(hash3(t, 2, o.seed, 90)) * (o.r1 - o.r0);
    const [x, z] = [Math.cos(a) * d, Math.sin(a) * d];
    if (fr.onTrail(x, z) || o.keepOut?.(x, z)) continue;
    const rand = mulberry32(o.seed * 7919 + t);
    const pick = hash3(t, 3, o.seed, 90);
    const flowerShare = o.flowers ?? 0.15;
    const [draw, k] =
      pick < 0.45
        ? [fern, 0.9 + 0.6 * rand()]
        : pick < 0.62
          ? [elephantEar, 1 + 0.6 * rand()]
          : pick < 0.62 + flowerShare
            ? [(p: PlantSink, r: () => number) => flowers(p, r, FLOWER_SETS[t % FLOWER_SETS.length]), 1 + 0.3 * rand()]
            : [grassTuft, 1 + 0.5 * rand()];
    const yaw = rand() * Math.PI * 2;
    const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
    const y = fr.ground(x, z);
    const sink: PlantSink = {
      box(bx, by, bz, sx, sy, sz, byaw, color, shade, tilt = 0) {
        fr.b.box(x + k * (c * bx + s * bz), y + k * by, z + k * (-s * bx + c * bz), sx * k, sy * k, sz * k, color, 'mapLeaf', { src, shade, ry: yaw + byaw, rz: tilt });
      },
    };
    draw(sink, rand);
  }
}

/**
 * Moss in patches on the open sides of stone cells that face `dirs` (cell
 * steps, e.g. [0, 1, 0] up): a smooth field decides where, `amount` 0‥1 how
 * much. Cells in `keep` stay clean.
 */
export function mossOn(g: VoxelGrid, o: { seed: number; amount: number; dirs: [number, number, number][]; moss: readonly number[]; keep?: Set<string>; scale?: number }): void {
  const sc = o.scale ?? 4;
  const hits: [number, number, number][] = [];
  g.forEach((i, j, k, c) => {
    if (c.mat !== 'mapStone' || c.ghost || o.keep?.has(key(i, j, k))) return;
    if (!o.dirs.some(([dx, dy, dz]) => !g.has(i + dx, j + dy, k + dz))) return;
    const p = 0.7 * valueNoise3(i / sc, j / sc, k / sc, o.seed) + 0.3 * valueNoise3(i / 1.5, j / 1.5, k / 1.5, o.seed + 1);
    if (p > 0.78 - 0.5 * o.amount + (hash3(i, j, k, o.seed + 2) - 0.5) * 0.1) hits.push([i, j, k]);
  });
  for (const [i, j, k] of hits) g.put(i, j, k, { color: pickOf(o.moss, i, j, k, o.seed + 3), mat: 'mapGrass', shade: 0.88 + 0.16 * hash3(i, j, k, o.seed + 4) });
}

/**
 * Tumbled stones round a point (site space, m): `n` blocks turned every
 * which way, lying on the land (sunk a little). `size` scales them.
 */
export function toss(fr: SiteFrame, x: number, z: number, n: number, spread: number, seed: number, tones: readonly number[], size = 1, keepOut?: (x: number, z: number) => boolean): void {
  const src = traceSource();
  for (let t = 0; t < n; t++) {
    const bx = x + (hash3(t, 1, seed, 60) - 0.5) * spread * 2;
    const bz = z + (hash3(t, 2, seed, 60) - 0.5) * spread * 2;
    if (keepOut?.(bx, bz) || fr.onTrail(bx, bz)) continue;
    const [sx, sy, sz] = [(0.7 + hash3(t, 3, seed, 60) * 0.7) * size, (0.5 + hash3(t, 4, seed, 60) * 0.4) * size, (0.7 + hash3(t, 5, seed, 60) * 0.8) * size];
    fr.b.box(bx, fr.ground(bx, bz) + sy * 0.35, bz, sx, sy, sz, pickOf(tones, t, seed, 0, 61), 'mapStone', {
      src,
      shade: 0.84 + hash3(t, 6, seed, 60) * 0.16,
      rx: (hash3(t, 7, seed, 60) - 0.5) * 0.5,
      ry: hash3(t, 8, seed, 60) * Math.PI,
      rz: (hash3(t, 9, seed, 60) - 0.5) * 0.5,
    });
  }
}

/** Flat stepping stones from `a` to `b` (site space, m), one every `every` m, laid on the land. */
export function steppingStones(fr: SiteFrame, a: [number, number], b: [number, number], every: number, seed: number, tones: readonly number[]): void {
  const src = traceSource();
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.round(len / every));
  const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    const side = (hash3(s, 1, seed, 70) - 0.5) * 0.5;
    const x = a[0] + (b[0] - a[0]) * t + Math.cos(ry) * side;
    const z = a[1] + (b[1] - a[1]) * t - Math.sin(ry) * side;
    const w = 0.8 + hash3(s, 2, seed, 70) * 0.35;
    fr.b.box(x, fr.ground(x, z) + 0.06, z, w, 0.16, w * (0.75 + hash3(s, 3, seed, 70) * 0.3), pickOf(tones, s, seed, 1, 71), 'mapStone', { src, ry: ry + (hash3(s, 4, seed, 70) - 0.5) * 0.6, shade: 0.95 });
  }
}
