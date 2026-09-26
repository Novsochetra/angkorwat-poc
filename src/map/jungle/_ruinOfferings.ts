import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { SiteFrame } from './_ruinFrame';
import type { ShrineLights } from './_incense';

/**
 * Offerings at the jungle shrines, as small free blocks in site space (m):
 * incense bowls with their sticks, candles, lotus buds, fruit and marigold
 * and jasmine garlands. Sticks, flowers, fruit and garlands are `petal`
 * blocks and candles `wax`: the walk map lets the explorer through them.
 * The lights (flames, glowing tips, smoke) go into a `ShrineLights` list in
 * map metres.
 */

export const BRASS = [0xc49a44, 0xb88d3a, 0xd1a851];
export const SAFFRON = [0xe98d1c, 0xf29a28, 0xdb7d18, 0xf5a531];
export const MARIGOLD = [0xf29a1c, 0xf7b521, 0xe8861a, 0xf5c02a];
export const JASMINE = 0xf4f1e6;
export const LOTUS = [0xeda0ae, 0xf3b8c3, 0xe38a9c];
/** Red lacquered wood (offering tables, the spirit house's tray). */
export const LACQUER = [0x7a2a1c, 0x6e2618, 0x843020];
const STICK = [0xa8402c, 0x9b3827, 0xb44a33];
const WAX = [0xf1e4c2, 0xeadcb8];
const SAND = 0xcdbd98;

const pick = (list: readonly number[], a: number, b: number, s: number) => list[Math.floor(hash3(a, b, s, 811) * list.length)];

/**
 * A bowl of incense on (x, y, z) (y: what it stands on): a brass bowl of
 * sand, `n` sticks fanned out of it, their tips glowing and a thread of
 * smoke over them. `r` its half width (m).
 */
export function incenseBowl(fr: SiteFrame, L: ShrineLights, x: number, y: number, z: number, o: { r: number; h: number; n: number; stick: number; seed: number; smoke?: number }): void {
  const src = traceSource();
  const { r, h } = o;
  fr.b.box(x, y + h / 2, z, r * 2, h, r * 2, BRASS[0], 'brass', { src, ry: 0.785 });
  fr.b.box(x, y + h - 0.02, z, r * 2.3, 0.05, r * 2.3, BRASS[2], 'brass', { src, ry: 0.785 });
  fr.b.box(x, y + h, z, r * 1.8, 0.03, r * 1.8, SAND, 'petal', { src, ry: 0.785 });
  let tx = 0;
  let tz = 0;
  for (let s = 0; s < o.n; s++) {
    const a = (s / o.n) * Math.PI * 2 + hash3(s, 1, o.seed, 812);
    const lean = 0.08 + 0.1 * hash3(s, 2, o.seed, 812);
    const d = o.n > 1 ? r * 0.45 : 0;
    const len = o.stick * (0.85 + 0.15 * hash3(s, 3, o.seed, 812));
    const [bx, bz] = [x + Math.cos(a) * d, z + Math.sin(a) * d];
    // Leaning out a little: turned about the axis across its lean.
    const [cx, cz] = [bx + Math.cos(a) * Math.sin(lean) * len * 0.5, bz + Math.sin(a) * Math.sin(lean) * len * 0.5];
    fr.b.box(cx, y + h + (len / 2) * Math.cos(lean), cz, 0.028, len, 0.028, pick(STICK, s, o.seed, 1), 'petal', { src, rx: Math.sin(a) * lean, rz: -Math.cos(a) * lean });
    const tip = fr.point(bx + Math.cos(a) * Math.sin(lean) * len, y + h + len * Math.cos(lean), bz + Math.sin(a) * Math.sin(lean) * len);
    L.tips.push(tip);
    tx += tip[0] / o.n;
    tz += tip[2] / o.n;
  }
  const top = fr.point(0, y + h + o.stick + 0.03, 0)[1];
  L.smoke.push({ at: [tx, top, tz], strength: o.smoke ?? 1 });
}

/** A candle on a small brass dish; its flame goes into the lights. */
export function candle(fr: SiteFrame, L: ShrineLights, x: number, y: number, z: number, h = 0.3, w = 0.1, seed = 0): void {
  const src = traceSource();
  fr.b.box(x, y + 0.025, z, w * 2, 0.05, w * 2, BRASS[1], 'brass', { src });
  fr.b.box(x, y + 0.05 + h / 2, z, w, h, w, pick(WAX, seed, 2, 3), 'wax', { src });
  L.candles.push(fr.point(x, y + 0.05 + h + 0.07, z));
}

/** A lotus bud on its stem (the Khmer way: a closed bud, petal tips folded out at its foot), standing at (x, y, z). */
export function lotusBud(fr: SiteFrame, x: number, y: number, z: number, h: number, seed: number): void {
  const src = traceSource();
  const lean = (hash3(seed, 1, 0, 813) - 0.5) * 0.25;
  fr.b.box(x, y + h / 2, z, 0.03, h, 0.03, 0x4f7a2a, 'petal', { src, rz: lean });
  const [bx, by] = [x - Math.sin(lean) * h, y + h * Math.cos(lean)];
  fr.b.box(bx, by + 0.05, z, 0.16, 0.12, 0.16, LOTUS[0], 'petal', { src, ry: 0.785 });
  fr.b.box(bx, by + 0.15, z, 0.12, 0.12, 0.12, LOTUS[1], 'petal', { src, ry: 0.785 });
  fr.b.box(bx, by + 0.24, z, 0.06, 0.08, 0.06, LOTUS[2], 'petal', { src, ry: 0.785 });
}

/** An open lotus lying at (x, y, z): six pink petals round a yellow heart. */
export function lotusOpen(fr: SiteFrame, x: number, y: number, z: number, size = 1): void {
  const src = traceSource();
  for (let p = 0; p < 6; p++) {
    const a = (p / 6) * Math.PI * 2;
    fr.b.box(x + Math.cos(a) * 0.09 * size, y + 0.04 * size, z + Math.sin(a) * 0.09 * size, 0.12 * size, 0.05 * size, 0.07 * size, LOTUS[p % 3], 'petal', { src, ry: -a, rz: 0.4 });
  }
  fr.b.box(x, y + 0.05 * size, z, 0.08 * size, 0.06 * size, 0.08 * size, 0xf2c94a, 'petal', { src });
}

/** A plate of fruit at (x, y, z): a hand of bananas, a mango, an orange, a dragon fruit. */
export function fruitPlate(fr: SiteFrame, x: number, y: number, z: number, ry: number, size = 1): void {
  const src = traceSource();
  const s = size;
  fr.b.box(x, y + 0.015, z, 0.42 * s, 0.03, 0.42 * s, BRASS[2], 'brass', { src, ry });
  const at = (dx: number, dz: number): [number, number] => [x + Math.cos(ry) * dx + Math.sin(ry) * dz, z - Math.sin(ry) * dx + Math.cos(ry) * dz];
  for (let b = 0; b < 4; b++) {
    const [bx, bz] = at(-0.08 * s + b * 0.045 * s, -0.04 * s);
    fr.b.box(bx, y + 0.06 * s, bz, 0.05 * s, 0.05 * s, 0.24 * s, b % 2 ? 0xf2cf3a : 0xe8c230, 'petal', { src, ry: ry + 0.25 - b * 0.12, rx: 0.2 });
  }
  const fruit: [number, number, number, number][] = [
    [0.1, 0.1, 0.1, 0xe6a52a],
    [-0.1, 0.12, 0.09, 0xe8841e],
    [0.12, -0.1, 0.11, 0xd9406a],
  ];
  for (const [dx, dz, d, c] of fruit) {
    const [fx, fz] = at(dx * s, dz * s);
    fr.b.box(fx, y + 0.03 + (d * s) / 2, fz, d * s, d * s, d * s, c, 'petal', { src, ry: ry + dx * 5 });
  }
}

/**
 * A garland swag from a to b (site space, m) sagging `sag` m in the middle:
 * marigold heads, orange and yellow, with a jasmine bud every few.
 */
export function garland(fr: SiteFrame, a: [number, number, number], b: [number, number, number], sag: number, seed: number, bead = 0.075): void {
  const src = traceSource();
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) + sag;
  const n = Math.max(2, Math.round(len / (bead * 0.95)));
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[2] + (b[2] - a[2]) * t;
    const y = a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t);
    const color = s % 5 === 2 ? JASMINE : pick(MARIGOLD, s, seed, 4);
    fr.b.box(x, y, z, bead, bead, bead, color, 'petal', { src, ry: hash3(s, seed, 5, 814) * 1.5 });
  }
}

/** A garland hanging straight down from (x, y, z), `len` m, a tassel of jasmine at its end. */
export function garlandDrop(fr: SiteFrame, x: number, y: number, z: number, len: number, seed: number, bead = 0.075): void {
  const src = traceSource();
  const n = Math.max(1, Math.round(len / bead));
  for (let s = 0; s < n; s++) fr.b.box(x, y - s * bead * 0.95, z, bead, bead, bead, s === n - 1 ? JASMINE : pick(MARIGOLD, s, seed, 6), 'petal', { src, ry: s * 0.7 });
  fr.b.box(x, y - n * bead * 0.95 - 0.04, z, bead * 0.6, 0.1, bead * 0.6, 0xc9352a, 'petal', { src });
}

/**
 * A cloth tied round a post or trunk: a band on each of its four sides
 * (site space: the post's middle (x, z), its half widths, the band's
 * middle height and depth), and its knot's two tails on the front.
 */
export function clothBand(fr: SiteFrame, x: number, z: number, hx: number, hz: number, y: number, h: number, seed: number): void {
  const src = traceSource();
  const t = 0.07;
  const c = (s: number) => pick(SAFFRON, s, seed, 7);
  fr.b.box(x, y, z + hz + t / 2, hx * 2 + t * 2, h, t, c(0), 'krama', { src });
  fr.b.box(x, y, z - hz - t / 2, hx * 2 + t * 2, h, t, c(1), 'krama', { src });
  fr.b.box(x + hx + t / 2, y, z, t, h, hz * 2, c(2), 'krama', { src });
  fr.b.box(x - hx - t / 2, y, z, t, h, hz * 2, c(3), 'krama', { src });
  // The knot and its tails.
  fr.b.box(x + hx * 0.4, y, z + hz + t * 1.5, 0.16, h * 0.9, 0.08, c(4), 'krama', { src });
  fr.b.box(x + hx * 0.3, y - h * 0.5 - 0.22, z + hz + t * 1.3, 0.13, 0.5, 0.05, c(5), 'krama', { src, rz: 0.12 });
  fr.b.box(x + hx * 0.55, y - h * 0.5 - 0.18, z + hz + t * 1.3, 0.12, 0.42, 0.05, c(6), 'krama', { src, rz: -0.18 });
}
