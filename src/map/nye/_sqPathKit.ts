import type { SourceTrace } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { HeightField } from '../heightfield';
import { leaf } from '../veg/plantKit';
import { LATERITE, pick, POST_STONE, type Tones } from './_sqKit';

/**
 * The garden's planters (AWP-35, the owner's reference: "decorative planters and urns" round the festival square), Khmer
 * as a temple garden or a Phnom Penh courtyard has them, never Chinese glazed dragons or Thai horned pots:
 *
 * - `glazedJar`: the big glazed water jar ពាង (peang) of Kampong Chhnang stoneware, dark brown with a paler shoulder,
 *   holding a spray of cordyline or a bougainvillea mound, or open water with lotus;
 * - `stonePlanter`: a carved sandstone planter (a moulded foot, a band of lotus petals round its belly, a rim) on a
 *   laterite plinth, heaped with flowers;
 * - `lotusBasin`: a low round sandstone basin of still water with lily pads and pink lotus.
 *
 * Solid (stone, in the square's builder and its families): the walk map keeps him out of them; their plants are
 * leaves and petals. `low`: the cheap form (fewer pieces, no carving).
 */

/** Stoneware glazes: dark brown, chocolate, a warm ochre-brown (sRGB, as the map's jars). */
const GLAZE: Tones = [0x5a3b26, 0x4e3322, 0x66442c, 0x734c2e];
const GLAZE_LIGHT: Tones = [0x8a6a3e, 0x96744a, 0x7e5e36];
const SOIL = 0x3e2c1e;
const WATER = 0x24343a;
const LEAF = [0x2f5e2a, 0x3a6e30, 0x467d34, 0x2a5228];
/** Cordyline (red ti plant: by every Khmer house's steps), its leaves dark red and green-red. */
const TI = [0x7a1e2e, 0x8e2a3a, 0x5e2a2a, 0x6a3a2a];
const BLOOM: readonly Tones[] = [
  [0xc0186e, 0xd42a80, 0xe2449a],
  [0xf08a12, 0xf7a81c, 0xe8740e],
  [0xf07aa8, 0xe8609a, 0xfdf4f6],
  [0xd8202e, 0xe23a3a, 0xf06a8a],
];
const LOTUS = [0xf08ab0, 0xe8729c, 0xf6b0c8];
/** The carved band's shadowed petals. */
const CARVE: Tones = [0x9a8a70, 0x928268, 0xa49478];

export type JarFill = 'ti' | 'flowers' | 'lotus';

/** A glazed jar standing at (x, y, z), `s` its size (1: 0.95 m tall), what grows in it. */
export function glazedJar(b: VoxelBuilder, x: number, y: number, z: number, s: number, fill: JarFill, seed: number, low: boolean, src: SourceTrace | undefined): void {
  const r = (i: number) => hash3(seed, i, 7, 131);
  const c = pick(GLAZE, x, z, 1, 131);
  const sh = pick(GLAZE_LIGHT, x, z, 2, 131);
  // The foot, the belly (two blocks crossed: round), the shoulder in the paler glaze, the neck and its rolled rim.
  b.box(x, y + 0.08 * s, z, 0.44 * s, 0.16 * s, 0.44 * s, c, 'mapStone', { src, shade: 0.86 });
  b.box(x, y + 0.42 * s, z, 0.8 * s, 0.52 * s, 0.8 * s, c, 'mapStone', { src, ry: r(1) * 0.3 });
  if (!low) b.box(x, y + 0.42 * s, z, 0.7 * s, 0.56 * s, 0.7 * s, c, 'mapStone', { src, ry: Math.PI / 4 + r(1) * 0.3, shade: 0.96 });
  b.box(x, y + 0.72 * s, z, 0.62 * s, 0.12 * s, 0.62 * s, sh, 'mapStone', { src, ry: r(2) * 0.3, shade: 1.04 });
  b.box(x, y + 0.83 * s, z, 0.44 * s, 0.1 * s, 0.44 * s, c, 'mapStone', { src, ry: r(3) });
  b.box(x, y + 0.9 * s, z, 0.52 * s, 0.05 * s, 0.52 * s, sh, 'mapStone', { src, ry: r(3), shade: 1.06 });
  const top = y + 0.92 * s;
  if (fill === 'lotus') {
    b.box(x, top - 0.01, z, 0.4 * s, 0.02, 0.4 * s, WATER, 'mapStone', { src, shade: 0.9 });
    lotusClump(b, x, top, z, 0.8 * s, seed, low, src);
    return;
  }
  b.box(x, top - 0.02, z, 0.42 * s, 0.04, 0.42 * s, SOIL, 'mapStone', { src });
  if (fill === 'ti') {
    // A spray of long leaves fanning up and out from a short stem (the plant kit's leaves, not flat squares).
    const n = low ? 5 : 9;
    for (let i = 0; i < n; i++) {
      const az = (i / n) * Math.PI * 2 + r(10 + i);
      leaf(b, [x, top + 0.25 * s, z], { len: (0.55 + 0.25 * r(20 + i)) * s, wid: 0.13 * s, az, el: 0.5 + 0.6 * r(30 + i), color: i % 3 ? TI[i % TI.length] : LEAF[i % LEAF.length], segs: low ? 1 : 2, rib: false, bend: 0.5, src });
    }
    b.box(x, top + 0.12 * s, z, 0.07, 0.26 * s, 0.07, 0x4a3a2a, 'mapBark', { src });
    return;
  }
  flowerMound(b, x, top, z, 0.62 * s, seed, low, src);
}

/** A carved sandstone planter at (x, y, z), `w` m square, heaped with flowers. */
export function stonePlanter(b: VoxelBuilder, x: number, y: number, z: number, w: number, ry: number, seed: number, low: boolean, src: SourceTrace | undefined): void {
  const st = (i: number) => pick(POST_STONE, x, z, i, 133);
  const h = 0.62 * w;
  // A laterite plinth, the moulded foot, the body, the rim.
  b.box(x, y + 0.06, z, w * 1.12, 0.16, w * 1.12, pick(LATERITE, x, z, 1, 133), 'mapStone', { src, ry, shade: 0.94 });
  b.box(x, y + 0.2, z, w, 0.14, w, st(2), 'mapStone', { src, ry, shade: 1.02 });
  b.box(x, y + 0.2 + h / 2, z, w * 0.86, h - 0.1, w * 0.86, st(3), 'mapStone', { src, ry });
  b.box(x, y + 0.2 + h, z, w * 1.02, 0.1, w * 1.02, st(4), 'mapStone', { src, ry, shade: 1.05 });
  if (!low) {
    // The band of lotus petals round its belly: three shadowed petals a face.
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    for (let f = 0; f < 4; f++) {
      const a = (f * Math.PI) / 2;
      const nx = Math.sin(a);
      const nz = Math.cos(a);
      for (const u of [-0.27, 0, 0.27]) {
        const lx = nx * w * 0.44 + nz * u * w;
        const lz = nz * w * 0.44 - nx * u * w;
        b.box(x + lx * c + lz * s, y + 0.2 + h * 0.45, z - lx * s + lz * c, 0.18 * w, 0.24 * w, 0.18 * w, pick(CARVE, f, u * 10, 5, 133), 'mapStone', { src, ry: ry + Math.PI / 4 });
      }
    }
  }
  const top = y + 0.25 + h;
  b.box(x, top - 0.02, z, w * 0.8, 0.05, w * 0.8, SOIL, 'mapStone', { src, ry });
  flowerMound(b, x, top, z, w * 0.74, seed, low, src);
}

/** A low round sandstone basin of still water at (x, y, z), `r` its radius, lily pads and lotus in it. */
export function lotusBasin(b: VoxelBuilder, x: number, y: number, z: number, r: number, seed: number, low: boolean, src: SourceTrace | undefined): void {
  const st = (i: number) => pick(POST_STONE, x, z, i, 137);
  const d = r * 2;
  b.box(x, y + 0.08, z, d * 0.9, 0.16, d * 0.9, pick(LATERITE, x, z, 1, 137), 'mapStone', { src, shade: 0.94 });
  b.box(x, y + 0.3, z, d, 0.4, d * 0.72, st(2), 'mapStone', { src });
  b.box(x, y + 0.3, z, d * 0.72, 0.4, d, st(3), 'mapStone', { src });
  if (!low) b.box(x, y + 0.3, z, d * 0.86, 0.4, d * 0.86, st(4), 'mapStone', { src, ry: Math.PI / 4, shade: 0.97 });
  b.box(x, y + 0.49, z, d * 0.74, 0.02, d * 0.74, WATER, 'mapStone', { src, ry: Math.PI / 8 });
  lotusClump(b, x, y + 0.5, z, r * 1.3, seed, low, src);
}

/** A mound of flowers: leafy lumps, flower heads over them (bougainvillea, marigold, periwinkle or hibiscus). */
export function flowerMound(b: VoxelBuilder, x: number, y: number, z: number, w: number, seed: number, low: boolean, src: SourceTrace | undefined): void {
  const r = (i: number) => hash3(seed, i, 9, 139);
  const tones = BLOOM[Math.floor(r(0) * BLOOM.length) % BLOOM.length];
  const lumps = low ? 2 : 4;
  for (let i = 0; i < lumps; i++) {
    const a = (i / lumps) * Math.PI * 2 + r(1);
    const o = i ? w * 0.2 : 0;
    const s = w * (i ? 0.5 : 0.7);
    b.box(x + Math.cos(a) * o, y + s * 0.38, z + Math.sin(a) * o, s, s * 0.76, s, LEAF[i % LEAF.length], 'mapLeaf', { src, ry: a, shade: 0.92 + 0.1 * r(2 + i) });
  }
  const n = low ? 4 : 9;
  for (let i = 0; i < n; i++) {
    const a = r(10 + i) * Math.PI * 2;
    const o = w * 0.42 * Math.sqrt(r(20 + i));
    b.box(x + Math.cos(a) * o, y + w * 0.5 - o * 0.35, z + Math.sin(a) * o, 0.2, 0.12, 0.2, tones[i % tones.length], 'petal', { src, ry: a });
  }
}

/** Lily pads on the water at y (round: two slabs crossed), a leaf held up, pink lotus open and in bud. */
function lotusClump(b: VoxelBuilder, x: number, y: number, z: number, w: number, seed: number, low: boolean, src: SourceTrace | undefined): void {
  const r = (i: number) => hash3(seed, i, 11, 141);
  const pads = low ? 2 : 4;
  for (let i = 0; i < pads; i++) {
    const a = (i / pads) * Math.PI * 2 + r(1);
    const o = w * 0.28;
    const s = w * (0.3 + 0.1 * r(2 + i));
    b.box(x + Math.cos(a) * o, y + 0.01, z + Math.sin(a) * o, s, 0.025, s * 0.86, LEAF[(i + 1) % LEAF.length], 'mapLeaf', { src, ry: a });
    if (!low) b.box(x + Math.cos(a) * o, y + 0.012, z + Math.sin(a) * o, s * 0.86, 0.025, s, LEAF[(i + 1) % LEAF.length], 'mapLeaf', { src, ry: a + Math.PI / 4 });
  }
  // A leaf held up on its stalk, the flower open on its own, a bud.
  b.box(x - w * 0.12, y + 0.24, z + w * 0.08, 0.03, 0.48, 0.03, 0x5a7a3a, 'mapLeaf', { src });
  b.box(x - w * 0.12, y + 0.48, z + w * 0.08, w * 0.34, 0.03, w * 0.34, LEAF[1], 'mapLeaf', { src, ry: 0.5 });
  b.box(x + w * 0.1, y + 0.2, z - w * 0.06, 0.03, 0.4, 0.03, 0x5a7a3a, 'mapLeaf', { src });
  b.box(x + w * 0.1, y + 0.42, z - w * 0.06, 0.26, 0.12, 0.26, LOTUS[0], 'petal', { src });
  b.box(x + w * 0.1, y + 0.45, z - w * 0.06, 0.26, 0.1, 0.26, LOTUS[1], 'petal', { src, ry: Math.PI / 4 });
  b.box(x + w * 0.1, y + 0.49, z - w * 0.06, 0.09, 0.05, 0.09, 0xf0c040, 'petal', { src });
  if (low) return;
  b.box(x + w * 0.02, y + 0.3, z + w * 0.16, 0.03, 0.6, 0.03, 0x5a7a3a, 'mapLeaf', { src });
  b.box(x + w * 0.02, y + 0.64, z + w * 0.16, 0.12, 0.16, 0.12, LOTUS[2], 'petal', { src });
}

/** Flower bed plants: [leaves, flower] (marigold, red cockscomb, pink periwinkle, purple torenia, white jasmine). */
const BED: readonly [number, readonly number[]][] = [
  [0x4f8a2c, [0xf08a12, 0xf7a81c, 0xe8740e]],
  [0x3f7a2e, [0xc8182e, 0xd82a3a, 0xb8102a]],
  [0x4a8a36, [0xf07aa8, 0xe8609a, 0xf596bd]],
  [0x447e34, [0x8a4cc8, 0x9a5ad6, 0x7a3eb4]],
  [0x4f8a2c, [0xf7b21c, 0xf4c030, 0xf08a12]],
  [0x3f7a2e, [0xe0407a, 0xd02e6a, 0xea5a8e]],
];
const BED_SOIL = [0x4a3424, 0x543a28, 0x40301f];

/**
 * A flower bed from (x0, z0) to (x1, z1), `w` m wide: dark soil, then plants in patches of one kind (each a leafy
 * mound and its flower heads on top), two rows staggered (one on the low level).
 */
export function flowerBed(b: VoxelBuilder, field: HeightField, x0: number, z0: number, x1: number, z1: number, seed: number, low: boolean, src: SourceTrace | undefined, w = 1.0, kerb = false): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.3) return;
  const ux = (x1 - x0) / len;
  const uz = (z1 - z0) / len;
  const ry = Math.atan2(ux, uz);
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  const gm = field.heightAt(mx, mz);
  b.box(mx, gm + 0.06, mz, w, 0.16, len + 0.1, pick(BED_SOIL, mx, mz, 1), 'mapStone', { src, ry, shade: 0.9 });
  // (`kerb`: a sandstone edging along both long sides, a hand high, as a temple garden's beds)
  if (kerb && !low)
    for (const sd of [-1, 1]) {
      const kx = mx + uz * sd * (w / 2 + 0.06);
      const kz = mz - ux * sd * (w / 2 + 0.06);
      b.box(kx, field.heightAt(kx, kz) + 0.1, kz, 0.14, 0.24, len + 0.08, pick(POST_STONE, kx, kz, 7, 143), 'mapStone', { src, ry, shade: 0.95 });
    }
  field.occupy(mx - w / 2 - len / 2, mz - w / 2 - len / 2, mx + w / 2 + len / 2, mz + w / 2 + len / 2);
  // (a wide bed: three rows, the middle one taller, mounded; on low one row of bigger plants)
  const rows = low || w < 0.8 ? 1 : w >= 1.4 ? 3 : 2;
  const step = low ? 0.6 : 0.42;
  const n = Math.max(1, Math.floor(len / step));
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n - 0.5;
    for (let r = 0; r < rows; r++) {
      const off = rows === 1 ? 0 : rows === 3 ? (r - 1) * 0.3 * w : (r ? 0.22 : -0.22) * w;
      const along = u * len + (r % 2 ? step * 0.25 : -step * 0.25);
      const px = mx + ux * along + uz * off;
      const pz = mz + uz * along - ux * off;
      const kind = BED[Math.floor(hash3(Math.floor((seed * 7 + i / 6) as number), r, 3, 96) * BED.length) % BED.length];
      const g = field.heightAt(px, pz);
      const h = hash3(px, pz, seed, 97);
      const s = (0.3 + 0.1 * h) * (rows === 3 && r === 1 ? 1.45 : low && w >= 1.4 ? 1.3 : 1);
      b.box(px, g + 0.14 + s * 0.4, pz, s, s * 0.8, s, kind[0], 'mapLeaf', { src, ry: h * 1.6, shade: 0.9 + 0.15 * h });
      const fc = kind[1][Math.floor(hash3(px, pz, seed, 98) * kind[1].length) % kind[1].length];
      b.box(px, g + 0.14 + s * 0.85, pz, s * 0.78, 0.13, s * 0.78, fc, 'petal', { src, ry: h * 2.3 + 0.4 });
    }
  }
}
