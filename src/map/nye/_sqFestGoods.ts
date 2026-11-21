import { hash3 } from '../../voxel/random';
import type { Glow } from '../festival/_glow';
import type { Site } from '../jungle/_campKit';
import type { Lamps } from '../landmarks/_prasatKit';
import { stallSign } from './_sqFestSigns';

/**
 * What the festival's newer stalls sell (AWP-35, `_sqStalls.ts`), in stall space (+z the buyers' side, +x its left,
 * y up from its ground): the flower stall's lotus and garlands, the lamp and toy stall's paper lamps, pinwheels and
 * balloons, and the sugarcane juice cart whole (it has no stand of its own: a pushcart under a parasol). Families as
 * the stalls': `mapBark`, `petal`, `mapStone`, the flames in the square's `lamps`.
 */

interface Counter {
  z: number;
  w: number;
  d: number;
  top: number;
}

const LOTUS = [0xf2a0bc, 0xf6c4d4, 0xf8f2ec, 0xe884a8];
const STEM = 0x4e7e32;
const BUCKET = [0x6a7a8a, 0x8a6a4a, 0x5a6a7a];

/**
 * ផ្កា: lotus buds standing in buckets on the counter and on the ground at its ends, garlands of jasmine (white, a red
 * bloom at the foot) and marigold (orange) hanging from the front beam, banana-leaf offerings (baysei) on the counter.
 */
export function flowerGoods(s: Site, C: Counter, low: boolean): void {
  const r = (a: number, b = 0) => hash3(a, b, 13, s.seed);
  const bucket = (x: number, y: number, z: number, k: number, h: number, n: number) => {
    s.box(x, y + h / 2, z, 0.26, h, 0.26, BUCKET[k % BUCKET.length], 'mapStone');
    for (let j = 0; j < n; j++) {
      const dx = ((j % 3) - 1) * 0.07;
      const dz = (Math.floor(j / 3) - 0.5) * 0.08;
      const bh = 0.18 + 0.12 * r(j, x);
      s.box(x + dx, y + h + bh / 2, z + dz, 0.025, bh, 0.025, STEM, 'petal');
      s.box(x + dx, y + h + bh + 0.06, z + dz, 0.07, 0.13, 0.07, LOTUS[(j + k) % LOTUS.length], 'petal', { ry: r(j, 3) });
    }
  };
  const n = low ? 3 : 6;
  bucket(-1.0, C.top, C.z, 0, 0.2, n);
  bucket(-0.55, C.top, C.z + 0.05, 1, 0.2, n);
  for (const sx of [-1, 1]) bucket(sx * 1.78, 0, C.z + 0.45, sx > 0 ? 2 : 1, 0.42, n);
  // Baysei: banana-leaf cones, a white jasmine crown.
  for (let k = 0; k < (low ? 2 : 4); k++) {
    const x = 0.05 + k * 0.28;
    s.box(x, C.top + 0.08, C.z, 0.18, 0.16, 0.18, 0x5a8a3a, 'petal');
    s.box(x, C.top + 0.2, C.z, 0.12, 0.1, 0.12, 0x6a9a3a, 'petal');
    s.box(x, C.top + 0.29, C.z, 0.06, 0.08, 0.06, 0xf6f2ea, 'petal');
  }
  // Marigold heaped in a flat basket.
  s.box(1.0, C.top + 0.04, C.z, 0.5, 0.06, 0.4, 0xb8945a, 'mapBark');
  if (!low) for (let k = 0; k < 6; k++) s.box(0.85 + (k % 3) * 0.15, C.top + 0.1, C.z - 0.1 + Math.floor(k / 3) * 0.2, 0.12, 0.07, 0.12, k % 2 ? 0xf0901a : 0xf8b828, 'petal');
  // Garlands from the front beam (its foot under the canopy's edge).
  const g = low ? 4 : 8;
  for (let k = 0; k < g; k++) {
    const x = -1.35 + (k * 2.7) / (g - 1);
    const jas = k % 3 !== 1;
    const len = 0.5 + 0.15 * r(k, 9);
    s.box(x, 2.62 - len / 2, 0.98, jas ? 0.05 : 0.07, len, jas ? 0.05 : 0.07, jas ? 0xf8f6ee : 0xf0901a, 'petal');
    s.box(x, 2.62 - len - 0.04, 0.98, 0.09, 0.08, 0.09, jas ? 0xd8283a : 0xf8c828, 'petal');
  }
}

const PAPER = [0xf28ab0, 0xf8d060, 0x9ad0f0, 0xfff2dc, 0xb0e898, 0xf8a868];
const BALLOON = [0xe8303a, 0xf8d040, 0x3a8ae8, 0xf06ab0, 0x48c060, 0xf8f4ec, 0xa060e0];
const HALO = [0xff9ac0, 0xffd070, 0xa8d8ff, 0xfff0d8, 0xb8f0a8, 0xffb070];

/**
 * គោម: round paper lamps in soft colours hanging along the front beam and from the ridge (each a glowing heart in the
 * square's flames, four ribs and two rims of its paper, a halo of its colour; never a red lantern with tassels),
 * pinwheels on a rack, clay whistles and sparklers on the counter, and a bunch of balloons tied to the left post,
 * floating over the canopy.
 */
export function toyGoods(s: Site, C: Counter, lamps: Lamps, glow: Glow | null, low: boolean): void {
  const r = (a: number, b = 0) => hash3(a, b, 17, s.seed);
  const lamp = (x: number, y: number, z: number, k: number, size: number) => {
    const c = PAPER[k % PAPER.length];
    const P = s.world(x, y, z);
    lamps.add([P.x, P.y, P.z], size * 0.86, 0.75);
    s.box(x, y + size * 0.55, z, size * 0.7, 0.03, size * 0.7, c, 'petal');
    s.box(x, y - size * 0.55, z, size * 0.7, 0.03, size * 0.7, c, 'petal');
    if (!low) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) s.box(x + dx * size * 0.46, y, z + dz * size * 0.46, dx ? 0.025 : size * 0.5, size * 0.95, dz ? 0.025 : size * 0.5, c, 'petal');
    s.box(x, y + size * 0.55 + 0.12, z, 0.015, 0.22, 0.015, 0x3a3028, 'mapBark');
    glow?.add(P.x, P.y, P.z, HALO[k % HALO.length], 1.1 + size * 2, { level: 0.75 });
  };
  const n = low ? 3 : 6;
  for (let k = 0; k < n; k++) lamp(-1.3 + (k * 2.6) / (n - 1), 2.16 - 0.08 * (k % 2), 1.05, k, 0.26);
  if (!low) for (let k = 0; k < 3; k++) lamp(-0.7 + k * 0.7, 2.7, 0.0, k + 3, 0.3);
  // Pinwheels on a bamboo rack by the counter's right end.
  s.box(-1.78, 0.9, C.z + 0.4, 0.06, 1.8, 0.06, 0xb89a5a, 'mapBark');
  for (let k = 0; k < (low ? 3 : 6); k++) {
    const y = 1.05 + k * 0.15;
    const x = -1.78 + (k % 2 ? 0.14 : -0.14);
    const c = PAPER[(k * 2) % PAPER.length];
    s.box(x, y, C.z + 0.46, 0.22, 0.05, 0.02, c, 'petal', { rz: 0.785 + r(k) });
    s.box(x, y, C.z + 0.46, 0.05, 0.22, 0.02, PAPER[(k * 2 + 1) % PAPER.length], 'petal', { rz: 0.785 + r(k) });
  }
  // Clay whistles and a cup of sparklers on the counter.
  for (let k = 0; k < (low ? 3 : 7); k++) s.box(0.2 + (k % 4) * 0.17, C.top + 0.05, C.z - 0.1 + Math.floor(k / 4) * 0.2, 0.1, 0.08, 0.13, PAPER[k % PAPER.length], 'petal');
  s.box(-0.7, C.top + 0.08, C.z, 0.14, 0.14, 0.14, 0xd8d0c0, 'mapStone');
  if (!low) for (let k = 0; k < 5; k++) s.box(-0.74 + (k % 3) * 0.04, C.top + 0.32, C.z - 0.03 + (k % 2) * 0.05, 0.012, 0.36, 0.012, 0x9a9a96, 'mapStone', { rz: (k - 2) * 0.08 });
  // Balloons over the canopy's front corner, on strings from the left post's top.
  const bx = 1.62;
  const bz = 1.2;
  const m = low ? 5 : 9;
  for (let k = 0; k < m; k++) {
    const a = (k / m) * Math.PI * 2 + r(k, 2);
    const h = 3.7 + 0.5 * r(k, 4) + (k % 3) * 0.28;
    const d = k % 3 ? 0.42 : 0.18;
    const x = bx + Math.cos(a) * d;
    const z = bz + Math.sin(a) * d;
    const c = BALLOON[k % BALLOON.length];
    s.box(x, h, z, 0.38, 0.44, 0.38, c, 'petal', { ry: r(k, 5) });
    s.box(x, h - 0.26, z, 0.09, 0.06, 0.09, c, 'petal');
    if (!low) s.box((bx + x) / 2, (2.75 + h - 0.29) / 2, (bz + z) / 2, 0.012, h - 0.29 - 2.75, 0.012, 0xe8e4dc, 'petal');
  }
}

const CART = [0x2a6ab8, 0x2a62a8];
const CANE = [0x9aa83a, 0x8a9a32, 0x7a5a3a];

/**
 * ទឹកអំពៅ: the sugarcane juice cart. A blue pushcart on two spoked wheels, its handles at the back; on it the roller
 * press (a steel box, its big crank wheel at its side), cane stalks laid along its top and standing in a basket by it,
 * cups of juice and an ice box under a glass case; the red sign on its front; a parasol of red and white over it, a
 * bulb hanging under it.
 */
export function cartGoods(s: Site, lamps: Lamps, glow: Glow | null, low: boolean): void {
  const cz = 0.15;
  const top = 0.95;
  // The cart: its box, the handles, the wheels, the legs at the back.
  s.box(0, top - 0.3, cz, 1.7, 0.6, 0.86, CART[0], 'mapStone');
  s.box(0, top - 0.02, cz, 1.78, 0.05, 0.92, 0xd8d4ca, 'mapStone');
  s.box(0, top - 0.58, cz, 1.74, 0.06, 0.9, CART[1], 'mapStone', { shade: 0.85 });
  for (const sx of [-1, 1]) {
    s.box(sx * 0.3, top - 0.1, cz - 0.75, 0.05, 0.05, 0.7, 0x8a8a86, 'mapStone');
    s.box(sx * 0.96, 0.36, cz, 0.06, 0.72, 0.72, 0x2a2826, 'mapStone');
    s.box(sx * 0.96, 0.36, cz, 0.06, 0.72, 0.72, 0x2a2826, 'mapStone', { rx: 0.785 });
    s.box(sx * 0.98, 0.36, cz, 0.08, 0.12, 0.12, 0xc8c4bc, 'mapStone');
    s.box(sx * 0.6, (top - 0.6) / 2, cz - 0.35, 0.05, top - 0.6, 0.05, 0x8a8a86, 'mapStone');
  }
  s.box(0, top - 0.1, cz - 1.1, 0.7, 0.05, 0.05, 0x8a8a86, 'mapStone');
  // The press: a steel box, its rollers' mouth, the crank wheel at its side.
  s.box(0.45, top + 0.25, cz - 0.05, 0.52, 0.5, 0.44, 0xb8b8b4, 'mapStone');
  s.box(0.45, top + 0.42, cz + 0.18, 0.4, 0.08, 0.06, 0x3a3a3a, 'mapStone');
  s.box(0.75, top + 0.3, cz - 0.05, 0.04, 0.6, 0.6, 0x5a5a5e, 'mapStone');
  if (!low) s.box(0.75, top + 0.3, cz - 0.05, 0.04, 0.6, 0.6, 0x5a5a5e, 'mapStone', { rx: 0.785 });
  s.box(0.8, top + 0.3, cz + 0.2, 0.06, 0.06, 0.18, 0xd8d4ca, 'mapStone');
  // Cane stalks along the top, more standing in a basket by the left wheel.
  for (let k = 0; k < (low ? 3 : 6); k++) s.box(-0.35, top + 0.04 + (k % 2) * 0.05, cz - 0.3 + k * 0.06, 1.15, 0.05, 0.05, CANE[k % CANE.length], 'mapBark');
  s.box(1.3, 0.2, cz + 0.2, 0.34, 0.4, 0.34, 0xb89a5a, 'mapBark');
  for (let k = 0; k < (low ? 3 : 7); k++) s.box(1.22 + (k % 3) * 0.08, 1.0, cz + 0.12 + Math.floor(k / 3) * 0.08, 0.05, 1.55, 0.05, CANE[k % CANE.length], 'mapBark', { rz: ((k % 3) - 1) * 0.06 });
  // The glass case with cups of juice and the ice box.
  s.box(-0.35, top + 0.2, cz + 0.22, 0.75, 0.36, 0.3, 0xc8e0e8, 'petal', { shade: 1.1 });
  for (let k = 0; k < 4; k++) s.box(-0.6 + k * 0.17, top + 0.1, cz + 0.22, 0.08, 0.14, 0.08, 0xc8d878, 'petal');
  s.box(-0.5, top + 0.12, cz - 0.25, 0.42, 0.22, 0.3, 0xf2efe6, 'mapStone');
  // The sign on the cart's front.
  stallSign(s, 'cane', 0, top - 0.3, cz + 0.45, 1.5, 0.5, !low);
  // The parasol: a pole, three tiers of red and white panels (octagons), a knob; the bulb under it.
  const ux = -0.62;
  const uz = cz - 0.2;
  s.box(ux, 1.85, uz, 0.05, 1.8, 0.05, 0x8a8a86, 'mapStone');
  const tiers: [number, number, number][] = [
    [2.62, 1.45, 0xc8202a],
    [2.78, 1.05, 0xf4f0e6],
    [2.92, 0.62, 0xc8202a],
  ];
  for (const [y, w, c] of tiers) {
    s.box(ux, y, uz, w * 1.6, 0.08, w * 1.6, c, 'petal');
    s.box(ux, y, uz, w * 1.6, 0.08, w * 1.6, c, 'petal', { ry: 0.785 });
  }
  s.box(ux, 3.04, uz, 0.1, 0.12, 0.1, 0xe2b04a, 'petal');
  const B = s.world(ux + 0.25, 2.35, uz + 0.25);
  lamps.add([B.x, B.y, B.z], 0.12, 0.9);
  glow?.add(B.x, B.y, B.z, 0xffc070, 2.6, { level: 0.75 });
}
