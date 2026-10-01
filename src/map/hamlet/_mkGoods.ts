import { HAT_BANDS, KRAMAS, SHIRTS, TROUSERS, type KramaLook } from '../../character/clothes';
import { tone, type MkBuild, type Tones } from './_mkKit';
import type { Goods } from './_mkPlan';

/**
 * The market's goods, stall by stall: colourful clusters that read from a
 * few metres away (a heap of mangoes, silver fish in round basins, bundles
 * of morning glory, kramas hanging) rather than fine detail. All `petal`
 * (soft, and they come and go with the stall: the build tags them with the
 * stall's toggle). Sizes are the people's (1.4 × true size).
 *
 * `goods(mk, kind, area)` fills a stall's selling surface (stall space: x
 * across, z to the front, `y` its top); a few kinds also hang things from
 * the stall's front pole or rack (`hang`).
 */

/** A stall's selling surface: across `x0..x1`, front to back `z0..z1` (z1 at the front), its top `y`. */
export interface Area {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y: number;
}

// ── Colours (sRGB) ───────────────────────────────────────────────────────────

const C = {
  mango: [0xf0b030, 0xe8c040, 0xf2a428, 0xd8b83a],
  mangoGreen: [0x9ab848, 0x8aa83e, 0xa8c050],
  banana: [0xe8d040, 0xdcc83a, 0xc8c840, 0xb8c040],
  dragon: [0xd8347a, 0xc82a6a, 0xe0488a],
  rambutan: [0xc8302a, 0xb82828, 0xd84030],
  pomelo: [0xb8c870, 0xc8d080, 0xa8bc62],
  longan: [0xc8a070, 0xb89060, 0xd0aa7a],
  coconut: [0x6a8a3a, 0x5e7e32, 0x789840],
  lotus: [0xf08ab0, 0xf6b0c8, 0xe8729c, 0xf6c8d8],
  marigold: [0xf0a020, 0xe88a18, 0xf4b830, 0xe07814],
  jasmine: [0xf4f2e8, 0xece8da],
  stem: [0x4a7a3a, 0x3f6e32, 0x557f40],
  leafy: [0x4f9a3a, 0x62aa44, 0x3f8a32, 0x58a03e],
  darkLeaf: [0x3a7a30, 0x2f6a28, 0x44862f],
  lemongrass: [0xc8d890, 0xb8cc80, 0xd4dca0],
  chiliRed: [0xd02a1e, 0xc02018, 0xe03a24],
  chiliGreen: [0x4a8a2a, 0x3f7a24, 0x5a9a32],
  lime: [0x7ab040, 0x6aa038, 0x88bc4a],
  ginger: [0xc8a060, 0xb89050, 0xd4b070],
  shallot: [0xb86a8a, 0xa85a7a, 0xc87a98],
  garlic: [0xe8e0d0, 0xf0ead8],
  eggplant: [0x5a2e5e, 0x4a2450, 0x6a3a6e],
  eggplantGreen: [0x9ab860, 0x8aa850],
  cucumber: [0x5a8a3a, 0x4a7a30, 0x6a9a44],
  tomato: [0xd8402c, 0xc83424, 0xe0503a],
  pumpkin: [0xd88a2a, 0xc87a24, 0x4a6a3a],
  gourd: [0x7aa850, 0x6a9844],
  cabbage: [0x9ac070, 0xa8cc80, 0x8ab060],
  corn: [0xe8c848, 0xdcbc3c],
  husk: [0x8aa850, 0x9ab860],
  fishSilver: [0xb8c0c4, 0xa8b2b8, 0xcfd6d8, 0x9aa6ac],
  fishBack: [0x6a7880, 0x5a6870],
  snakehead: [0x4a4a3e, 0x3e3e34, 0x55543f],
  catfish: [0x6a6a60, 0x5a5a52],
  dried: [0xb88a4a, 0xa87a3c, 0xc89a58, 0x9a6e36],
  shrimp: [0xe89070, 0xd8805e],
  prahokJar: [0x5a3a24, 0x4e3220, 0x66442a],
  prahok: [0x8a7a5a, 0x7a6a4c],
  sauce: [0x8a4a1e, 0x7a3e18],
  sugarCake: [0xb87a3a, 0xa86a2e, 0xc88a48, 0x9a5e28],
  palmLeaf: [0xc8b070, 0xbca062, 0xd2bc80],
  clay: [0x9a5a32, 0x8a4e2a, 0xa8683a],
  sack: [0xeae6da, 0xe0dccc, 0xf0ece2],
  rice: [0xf4f0e6, 0xf8f4ea],
  pork: [0xd88a80, 0xc8706a, 0xe09a90],
  fat: [0xf0dcd0, 0xe8d2c4],
  chicken: [0xe8c890, 0xdcb880],
  basket: [0xc8a868, 0xb89458, 0xd2b474, 0xa88a50],
  basketDark: [0x8a6a40, 0x7a5c36],
  straw: [0xd9c08a, 0xcdb07a, 0xe0c896],
  krama: [0xb8322c, 0x2c5a9a, 0x3a7a4a, 0xb8322c, 0x8a2a5a],
  sarong: [0x6a2a6a, 0x2a6a6a, 0x7a2a3a, 0x3a3a7a, 0x8a5a1a],
  noodle: [0xf2eee4, 0xece6d8],
  herb: [0x5aa040, 0x4a9038, 0x6ab04a],
  bananaFlower: [0xc8a0b8, 0x9a4a6a],
  sprout: [0xe8e8c8, 0xf0f0d8],
  broth: [0xb8b048, 0xa8a040],
  meat: [0x8a4a2a, 0xa05a30, 0x7a3e22],
  cane: [0xb8c070, 0xa8b060, 0x8a9a40, 0x7a5a6a],
  bag: [0xe87aa0, 0x5a9ad8, 0xf0f0ea, 0xe8d040],
} as const;

/** Aluminium, plastic tubs. */
const ALU = [0xb4b8ba, 0xc4c8ca, 0xa8acae];
const TUBS = [0xc83a32, 0x3a6aa8, 0x3a9a5a];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** A heap of round things (a pyramid of small boxes): its middle, half-spread (m), item size, layers. */
function heap(mk: MkBuild, x: number, y: number, z: number, rx: number, rz: number, s: number, tones: Tones, layers = 2, seed = 0): void {
  for (let l = 0; l < layers; l++) {
    const ex = rx - l * s * 0.55;
    const ez = rz - l * s * 0.55;
    if (ex < s * 0.3 || ez < s * 0.3) break;
    const nx = Math.max(1, Math.round((ex * 2) / (s * 1.02)));
    const nz = Math.max(1, Math.round((ez * 2) / (s * 1.02)));
    for (let i = 0; i < nx; i++)
      for (let k = 0; k < nz; k++) {
        const r = mk.r(i + seed * 3, k + l * 7, x * 3 + z);
        if (l > 0 && r < 0.2) continue;
        const px = x - ex + ((i + 0.5) * ex * 2) / nx + (mk.r(i, k, seed + 1) - 0.5) * s * 0.25;
        const pz = z - ez + ((k + 0.5) * ez * 2) / nz + (mk.r(k, i, seed + 2) - 0.5) * s * 0.25;
        const sz = s * (0.85 + r * 0.25);
        mk.box(px, y + l * s * 0.8 + sz / 2, pz, sz, sz * 0.9, sz, tone(tones, mk.r(i, k, l + seed)), 'petal', 0.9 + r * 0.18);
      }
  }
}

/** A woven basket (square-ish, a rim of a darker weave): returns the height of its top. */
function basket(mk: MkBuild, x: number, y: number, z: number, w: number, d: number, h: number, tones: Tones = C.basket): number {
  const c = tone(tones, mk.r(x, z, 31));
  mk.box(x, y + h / 2, z, w, h, d, c, 'petal', 0.92);
  mk.box(x, y + h - 0.02, z, w + 0.05, 0.06, d + 0.05, tone(C.basketDark, mk.r(z, x, 32)), 'petal');
  return y + h;
}

/** A round basin (two boxes crossed at 45°: eight-sided), its rim, and what it holds up to `fill` of its depth. Returns the top of its load. */
function basin(mk: MkBuild, x: number, y: number, z: number, r: number, h: number, color: number, fill: number, load: number): number {
  const s = r * 1.66;
  mk.box(x, y + h / 2, z, s, h, s, color, 'petal', 0.95);
  mk.box(x, y + h / 2, z, s, h, s, color, 'petal', 0.95, 0, Math.PI / 4);
  mk.box(x, y + h - 0.02, z, s + 0.04, 0.05, s + 0.04, color, 'petal', 1.12, 0, Math.PI / 8);
  const top = y + h * fill;
  mk.box(x, top - 0.02, z, s - 0.08, 0.04, s - 0.08, load, 'petal', 0.9, 0, Math.PI / 4);
  return top;
}

/** Fish lying every which way in a basin or on a tray: `n` little slabs round (x, z) within `r`. */
function fishes(mk: MkBuild, x: number, y: number, z: number, r: number, n: number, len: number, tones: Tones, seed: number): void {
  for (let i = 0; i < n; i++) {
    const a = mk.r(i, seed, 41) * Math.PI * 2;
    const d = Math.sqrt(mk.r(seed, i, 42)) * r;
    const ry = mk.r(i, 43, seed) * Math.PI;
    const px = x + Math.sin(a) * d;
    const pz = z + Math.cos(a) * d;
    const py = y + 0.03 + mk.r(i, 44) * 0.06;
    mk.box(px, py, pz, len * 0.34, len * 0.2, len, tone(tones, mk.r(i, 45, seed)), 'petal', 0.95 + mk.r(i, 46) * 0.12, 0, ry);
    // (a darker back on the bigger ones)
    if (len > 0.2 && i % 2 === 0) mk.box(px, py + len * 0.1, pz, len * 0.14, len * 0.06, len * 0.9, tone(C.fishBack, mk.r(i, 47)), 'petal', 1, 0, ry);
  }
}

/** A bundle lying down (morning glory, lemongrass, long beans): from its middle along the frame's x (`along`) or z, tied with a band. */
function bundle(mk: MkBuild, x: number, y: number, z: number, len: number, thick: number, color: number, band: number, alongX: boolean, ry = 0): void {
  const [sx, sz] = alongX ? [len, thick] : [thick, len];
  mk.box(x, y + thick * 0.4, z, sx, thick * 0.8, sz, color, 'petal', 0.95, 0, ry);
  mk.box(x, y + thick * 0.4, z, alongX ? 0.05 : thick + 0.03, thick * 0.85, alongX ? thick + 0.03 : 0.05, band, 'petal', 1, 0, ry);
}

/** A strand hanging from `y` (a garland, a banana hand, a bag): `n` boxes down. */
function strand(mk: MkBuild, x: number, y: number, z: number, n: number, s: number, tones: Tones, seed: number): void {
  for (let i = 0; i < n; i++) mk.box(x + (mk.r(i, seed) - 0.5) * 0.04, y - s * (i + 0.5) * 0.92, z, s, s * 0.95, s, tone(tones, mk.r(seed, i, 51)), 'petal', 0.92 + mk.r(i, 52) * 0.15);
}

/** A glazed jar with a lid (prahok, palm syrup, water). */
function jar(mk: MkBuild, x: number, y: number, z: number, s: number, tones: Tones, open?: number): void {
  const c = tone(tones, mk.r(x, z, 61));
  mk.box(x, y + 0.1 * s, z, 0.34 * s, 0.2 * s, 0.34 * s, c, 'petal', 0.85);
  mk.box(x, y + 0.34 * s, z, 0.5 * s, 0.32 * s, 0.5 * s, c, 'petal', 1);
  mk.box(x, y + 0.56 * s, z, 0.32 * s, 0.14 * s, 0.32 * s, c, 'petal', 1.06);
  if (open !== undefined) mk.box(x, y + 0.61 * s, z, 0.26 * s, 0.04, 0.26 * s, open, 'petal', 0.9);
  else mk.box(x, y + 0.65 * s, z, 0.36 * s, 0.05 * s, 0.36 * s, tone(C.basket, mk.r(z, 62)), 'petal', 0.9);
}

/** A plastic bag of something (a kilo of rice, a bag of juice, fish in water): a soft box. */
function bagOf(mk: MkBuild, x: number, y: number, z: number, s: number, color: number): void {
  mk.box(x, y + s * 0.4, z, s * 0.7, s * 0.8, s * 0.6, color, 'petal', 1.05);
  mk.box(x, y + s * 0.88, z, s * 0.25, s * 0.18, s * 0.2, color, 'petal', 1.1);
}

/** A dial scale (white body, red face) on the selling surface. */
function scale(mk: MkBuild, x: number, y: number, z: number): void {
  mk.box(x, y + 0.1, z, 0.28, 0.2, 0.24, 0xe8e6e0, 'petal', 1);
  mk.box(x, y + 0.2, z + 0.13, 0.18, 0.16, 0.03, 0xd83a2a, 'petal', 1.05);
  mk.box(x, y + 0.22, z, 0.34, 0.03, 0.3, 0xc8ccce, 'petal', 1.1);
}

// ── Stall by stall ───────────────────────────────────────────────────────────

/** Fill a stall's selling surface with its goods. */
export function goods(mk: MkBuild, kind: Goods, a: Area): void {
  const { x0, x1, z0, z1, y } = a;
  const W = x1 - x0;
  const D = z1 - z0;
  const cx = (x0 + x1) / 2;
  const at = (u: number, v: number): [number, number] => [x0 + W * u, z0 + D * v];
  switch (kind) {
    case 'flowers': {
      // Lotus buds standing in buckets, marigold garlands in heaps, jasmine on a tray, incense, banana-leaf cones.
      for (let b = 0; b < 3; b++) {
        const [bx, bz] = at(0.15 + b * 0.24, 0.62 + (b % 2) * 0.12);
        mk.box(bx, y + 0.17, bz, 0.3, 0.34, 0.3, TUBS[b % 3], 'petal', 0.9);
        for (let i = 0; i < 6; i++) {
          const ox = (mk.r(b, i, 71) - 0.5) * 0.24;
          const oz = (mk.r(i, b, 72) - 0.5) * 0.24;
          const h = 0.5 + mk.r(b, i, 73) * 0.25;
          mk.box(bx + ox, y + 0.3 + h / 2, bz + oz, 0.03, h, 0.03, tone(C.stem, mk.r(i, 74)), 'petal');
          mk.box(bx + ox, y + 0.34 + h, bz + oz, 0.11, 0.16, 0.11, tone(C.lotus, mk.r(b, i, 75)), 'petal', 1.05);
        }
      }
      heap(mk, ...xz3(at(0.25, 0.22), y), 0.32, 0.22, 0.1, C.marigold, 2, 3);
      heap(mk, ...xz3(at(0.58, 0.2), y), 0.22, 0.18, 0.08, C.jasmine, 1, 4);
      for (let i = 0; i < 3; i++) {
        const [ix, iz] = at(0.82, 0.25 + i * 0.22);
        mk.box(ix, y + 0.04, iz, 0.42, 0.06, 0.07, 0xc8302a, 'petal');
        mk.box(ix - 0.16, y + 0.04, iz, 0.1, 0.07, 0.08, 0xe8c040, 'petal');
      }
      for (let i = 0; i < 3; i++) {
        const [ox, oz] = at(0.9, 0.82 - i * 0.1);
        mk.box(ox - i * 0.12, y + 0.14, oz, 0.14, 0.28, 0.14, tone(C.leafy, mk.r(i, 76)), 'petal');
        mk.box(ox - i * 0.12, y + 0.3, oz, 0.08, 0.06, 0.08, 0xf0a020, 'petal');
      }
      break;
    }
    case 'fruit': {
      heap(mk, ...xz3(at(0.16, 0.45), y), 0.3, 0.4, 0.14, C.mango, 3, 1);
      heap(mk, ...xz3(at(0.42, 0.62), y), 0.22, 0.26, 0.17, C.dragon, 2, 2);
      heap(mk, ...xz3(at(0.42, 0.2), y), 0.22, 0.16, 0.1, C.rambutan, 2, 3);
      heap(mk, ...xz3(at(0.66, 0.5), y), 0.24, 0.34, 0.25, C.pomelo, 2, 4);
      basket(mk, ...xz3(at(0.88, 0.3), y), 0.4, 0.4, 0.2);
      heap(mk, ...xz3(at(0.88, 0.3), y + 0.2), 0.16, 0.16, 0.08, C.longan, 1, 5);
      heap(mk, ...xz3(at(0.86, 0.78), y), 0.18, 0.14, 0.14, C.mangoGreen, 2, 6);
      scale(mk, ...xz3(at(0.62, 0.12), y));
      // Coconuts on the ground in front of the table.
      heap(mk, cx - W * 0.3, 0, z1 + 0.25, 0.4, 0.18, 0.26, C.coconut, 2, 7);
      break;
    }
    case 'cloth': {
      // The krama stall (the explorer buys here: roam/_wardrobe.ts): folded kramas in their six colours, two rows of
      // stacks, the top one showing its weave (a check's white bands both ways, a plaid's thread and its dark band);
      // folded linen shirts (white, sand; indigo) and fisherman trousers; a pile of palm-leaf hats (never conical),
      // the top one with its blue band.
      KRAMA_SIX.forEach((k, s) => {
        const [sx, sz] = at(0.085 + (s % 3) * 0.15, s < 3 ? 0.72 : 0.27);
        const T = k.tones;
        const n = 3 + (s % 2);
        for (let j = 0; j < n; j++) mk.box(sx, y + 0.032 + j * 0.064, sz, 0.34, 0.058, 0.27, j % 2 ? T.red2 : T.red, 'petal', 0.94 + (j % 2) * 0.08);
        const top = y + n * 0.064 + 0.006;
        if (k.weave === 'check') {
          for (const d of [-0.09, 0.09]) {
            mk.box(sx + d, top, sz, 0.055, 0.012, 0.272, T.light, 'petal');
            mk.box(sx, top, sz + d, 0.342, 0.012, 0.05, T.light, 'petal');
          }
        } else {
          mk.box(sx, top, sz - 0.04, 0.342, 0.012, 0.045, T.dark, 'petal');
          mk.box(sx, top, sz + 0.06, 0.342, 0.012, 0.022, T.light, 'petal');
        }
        // (the folds' fronts: a pale thread along each)
        mk.box(sx, y + 0.032 + (n - 1) * 0.064, sz + 0.136, 0.34, 0.016, 0.006, T.light, 'petal');
      });
      const fold = (u: number, v: number, cols: readonly number[], collar: boolean) => {
        const [fx, fz] = at(u, v);
        cols.forEach((c, j) => {
          mk.box(fx, y + 0.03 + j * 0.06, fz, 0.34, 0.054, 0.28, c, 'petal', 0.95 + (j % 2) * 0.06);
          // (a shirt's collar at the back of the fold, a pair of trousers' fold line)
          if (collar) mk.box(fx, y + 0.06 + j * 0.06, fz - 0.1, 0.14, 0.014, 0.06, c === SHIRTS.indigo.base ? SHIRTS.indigo.cuff : 0xfaf6ee, 'petal', 0.92);
          else mk.box(fx, y + 0.058 + j * 0.06, fz, 0.012, 0.004, 0.27, 0x101014, 'petal');
        });
      };
      fold(0.53, 0.72, [SHIRTS.white.base, SHIRTS.white.base, SHIRTS.sand.base], true);
      fold(0.68, 0.72, [SHIRTS.indigo.base, SHIRTS.indigo.base], true);
      fold(0.53, 0.27, [SHIRTS.sand.base, SHIRTS.sand.base], true);
      fold(0.68, 0.27, [TROUSERS.navy.base, TROUSERS.black.base, TROUSERS.navy.base], false);
      // Palm-leaf hats in a leaning pile: wide straw brims bound in cloth, the top one's crown and its blue band.
      const [hx, hz] = at(0.895, 0.5);
      for (let j = 0; j < 3; j++) {
        const band = j === 2 ? HAT_BANDS.blue.red : 0xa02a24;
        const ox = j * 0.02;
        mk.box(hx + ox, y + 0.03 + j * 0.06, hz, 0.46, 0.03, 0.46, tone(C.straw, mk.r(j, 103)), 'petal');
        mk.box(hx + ox, y + 0.03 + j * 0.06, hz, 0.48, 0.016, 0.48, band, 'petal');
      }
      mk.box(hx + 0.04, y + 0.25, hz, 0.22, 0.13, 0.22, tone(C.straw, 0.5), 'petal');
      mk.box(hx + 0.04, y + 0.2, hz, 0.235, 0.035, 0.235, HAT_BANDS.blue.red, 'petal');
      break;
    }
    case 'greens': {
      // Morning glory and long beans in bundles, lemongrass, heaps of chillies and limes on banana leaves, herbs, ginger, shallots.
      for (let i = 0; i < 5; i++) bundle(mk, ...xz3(at(0.1 + i * 0.075, 0.72 - (i % 2) * 0.08), y), 0.62, 0.13, tone(C.leafy, mk.r(i, 91)), 0xd83a2a, false, 0.1 * (i - 2));
      for (let i = 0; i < 4; i++) bundle(mk, ...xz3(at(0.1 + i * 0.075, 0.25), y), 0.5, 0.1, tone(C.darkLeaf, mk.r(i, 92)), 0x4a7a3a, false);
      for (let i = 0; i < 4; i++) {
        const [lx, lz] = at(0.47 + i * 0.05, 0.3);
        mk.box(lx, y + 0.35, lz, 0.07, 0.7, 0.07, tone(C.lemongrass, mk.r(i, 93)), 'petal');
      }
      const leaf = (u: number, v: number) => {
        const [lx, lz] = at(u, v);
        mk.box(lx, y + 0.01, lz, 0.46, 0.02, 0.4, tone(C.leafy, mk.r(u * 10, 94)), 'petal', 0.85);
        return [lx, lz] as [number, number];
      };
      heap(mk, ...xz3(leaf(0.6, 0.72), y + 0.02), 0.16, 0.14, 0.06, C.chiliRed, 2, 11);
      heap(mk, ...xz3(leaf(0.74, 0.72), y + 0.02), 0.16, 0.14, 0.06, C.chiliGreen, 2, 12);
      heap(mk, ...xz3(leaf(0.88, 0.72), y + 0.02), 0.16, 0.14, 0.08, C.lime, 2, 13);
      heap(mk, ...xz3(leaf(0.66, 0.3), y + 0.02), 0.18, 0.14, 0.08, C.ginger, 1, 14);
      heap(mk, ...xz3(leaf(0.84, 0.3), y + 0.02), 0.18, 0.14, 0.07, C.shallot, 2, 15);
      heap(mk, cx + W * 0.18, y, z0 + 0.1, 0.18, 0.12, 0.13, C.herb, 2, 16);
      scale(mk, ...xz3(at(0.52, 0.72), y));
      break;
    }
    case 'baskets': {
      // Stacks of woven baskets, rolled mats standing, palm-leaf hats piled, brooms, clay pots for palm syrup.
      for (let s = 0; s < 3; s++) {
        const [bx, bz] = at(0.12 + s * 0.2, 0.3 + (s % 2) * 0.35);
        let top = y;
        const w = 0.62 - s * 0.08;
        for (let k = 0; k < 3; k++) top = basket(mk, bx, top - 0.06, bz, w - k * 0.04, w - k * 0.04, 0.26);
      }
      for (let m = 0; m < 5; m++) {
        const [mx, mz] = at(0.62 + (m % 3) * 0.1, 0.12 + Math.floor(m / 3) * 0.14);
        const band = [0xc8423a, 0x3a8a5a, 0xe8c040, 0x3d6fa8, 0xd8c088][m];
        mk.box(mx, y + 0.6, mz, 0.16, 1.2, 0.16, 0xd8c088, 'petal', 0.95);
        mk.box(mx, y + 0.5, mz, 0.17, 0.12, 0.17, band, 'petal');
        mk.box(mx, y + 0.9, mz, 0.17, 0.12, 0.17, band, 'petal');
      }
      // Palm-leaf hats: flat-topped crowns on wide brims, in a leaning stack (the Khmer hat, never the conical one).
      for (let k = 0; k < 4; k++) {
        const [hx, hz] = at(0.62, 0.7);
        mk.box(hx + k * 0.03, y + 0.04 + k * 0.07, hz, 0.62, 0.04, 0.62, tone(C.straw, mk.r(k, 101)), 'petal');
        mk.box(hx + k * 0.03, y + 0.04 + k * 0.07, hz, 0.64, 0.02, 0.64, 0xa02a24, 'petal');
      }
      const [hx, hz] = at(0.62, 0.7);
      mk.box(hx + 0.1, y + 0.42, hz, 0.3, 0.16, 0.3, tone(C.straw, 0.4), 'petal');
      mk.box(hx + 0.1, y + 0.36, hz, 0.32, 0.04, 0.32, 0xa02a24, 'petal');
      for (let p = 0; p < 3; p++) jar(mk, ...xz3(at(0.86, 0.2 + p * 0.28), y), 0.9, C.clay, 0x3a2a1e);
      for (let b = 0; b < 2; b++) {
        const [bx, bz] = at(0.97, 0.75 + b * 0.1);
        mk.box(bx, y + 0.7, bz, 0.05, 1.4, 0.05, 0xb89a5a, 'petal');
        mk.box(bx, y + 0.18, bz, 0.22, 0.36, 0.12, 0xc8a860, 'petal');
      }
      break;
    }
    case 'noodles': {
      // Num banh chok: baskets of white noodle nests on banana leaves, the green fish gravy in its pot, herbs, a stack of bowls.
      for (let b = 0; b < 2; b++) {
        const [nx, nz] = at(0.2 + b * 0.2, 0.62);
        mk.box(nx, y + 0.02, nz, 0.46, 0.03, 0.42, tone(C.leafy, mk.r(b, 111)), 'petal', 0.85);
        heap(mk, nx, y + 0.03, nz, 0.18, 0.16, 0.11, C.noodle, 2, 20 + b);
      }
      for (let t = 0; t < 3; t++) {
        const [hx, hz] = at(0.2 + t * 0.2, 0.2);
        mk.box(hx, y + 0.03, hz, 0.4, 0.05, 0.3, 0xe8e6e0, 'petal', 0.95);
        heap(mk, hx, y + 0.05, hz, 0.15, 0.1, 0.07, [C.herb, C.bananaFlower, C.sprout][t], 1, 30 + t);
      }
      for (let k = 0; k < 5; k++) mk.box(...xz3(at(0.82, 0.3), y + 0.05 + k * 0.07), 0.2, 0.06, 0.2, k % 2 ? 0xf0f0ea : 0x3a6aa8, 'petal', 1);
      for (let k = 0; k < 3; k++) mk.box(...xz3(at(0.82 + (k - 1) * 0.06, 0.7), y + 0.14), 0.07, 0.28, 0.07, [0xc83a24, 0x8a4a1e, 0xe8e0c8][k], 'petal');
      break;
    }
    case 'grill': {
      // Skewers across the grill: meat, grilled bananas in their leaves, corn.
      for (let i = 0; i < 9; i++) {
        const u = 0.12 + i * 0.095;
        const [sx, sz] = at(u, 0.5);
        const kind = i % 3;
        mk.box(sx, y + 0.05, sz, 0.03, 0.03, D * 1.1, 0xc8b27a, 'petal');
        if (kind === 0) for (let k = 0; k < 3; k++) mk.box(sx, y + 0.07, sz - 0.12 + k * 0.12, 0.09, 0.08, 0.09, tone(C.meat, mk.r(i, k, 121)), 'petal');
        else if (kind === 1) mk.box(sx, y + 0.08, sz, 0.12, 0.1, 0.34, 0x6a7a3a, 'petal');
        else mk.box(sx, y + 0.08, sz, 0.11, 0.11, 0.3, tone(C.corn, mk.r(i, 122)), 'petal');
      }
      break;
    }
    case 'drinks': {
      // Green coconuts, some cut open with straws; cups stacked; bags of juice.
      heap(mk, ...xz3(at(0.25, 0.5), y), 0.3, 0.3, 0.24, C.coconut, 2, 40);
      for (let k = 0; k < 3; k++) {
        const [kx, kz] = at(0.6 + k * 0.13, 0.62);
        mk.box(kx, y + 0.12, kz, 0.24, 0.24, 0.24, tone(C.coconut, mk.r(k, 131)), 'petal');
        mk.box(kx, y + 0.25, kz, 0.14, 0.03, 0.14, 0xf0ece0, 'petal');
        mk.box(kx + 0.03, y + 0.36, kz, 0.03, 0.22, 0.03, [0xe87aa0, 0x5a9ad8, 0xe8d040][k], 'petal');
      }
      for (let k = 0; k < 6; k++) mk.box(...xz3(at(0.65, 0.22), y + 0.06 + k * 0.1), 0.13, 0.1, 0.13, 0xf4f2ee, 'petal', 1.05);
      for (let k = 0; k < 3; k++) bagOf(mk, ...xz3(at(0.82, 0.22 + k * 0.08), y), 0.2, [0xc8d070, 0xe8c040, 0xd8e0a0][k]);
      break;
    }
    case 'fish': {
      // Round aluminium basins of silver trey riel and bigger fish, a big snakehead on a tray, a tub of live fish, the scale.
      const b1 = basin(mk, ...xz3(at(0.16, 0.55), y), 0.36, 0.2, ALU[0], 0.7, 0x5a6a70);
      fishes(mk, ...xz3(at(0.16, 0.55), b1), 0.28, 16, 0.16, C.fishSilver, 1);
      const b2 = basin(mk, ...xz3(at(0.42, 0.62), y), 0.34, 0.2, ALU[1], 0.7, 0x5a6a70);
      fishes(mk, ...xz3(at(0.42, 0.62), b2), 0.26, 7, 0.3, C.catfish, 2);
      const b3 = basin(mk, ...xz3(at(0.66, 0.5), y), 0.32, 0.22, TUBS[1], 0.75, 0x4a6a78);
      fishes(mk, ...xz3(at(0.66, 0.5), b3), 0.24, 6, 0.26, C.fishSilver, 3);
      const [tx, tz] = at(0.88, 0.6);
      mk.box(tx, y + 0.03, tz, 0.5, 0.05, 0.9, 0xc8ccce, 'petal', 1.05);
      mk.box(tx, y + 0.1, tz, 0.16, 0.12, 0.8, tone(C.snakehead, mk.r(tx, 141)), 'petal');
      mk.box(tx, y + 0.07, tz, 0.17, 0.05, 0.78, 0x8a8a78, 'petal');
      mk.box(tx, y + 0.12, tz + 0.43, 0.14, 0.1, 0.12, 0x3a3a30, 'petal');
      scale(mk, ...xz3(at(0.3, 0.15), y));
      break;
    }
    case 'dried': {
      // Dried fish fanned out on flat baskets, prahok in glazed jars and an open tub, fish sauce, dried shrimp.
      for (let b = 0; b < 2; b++) {
        const [fx, fz] = at(0.18 + b * 0.3, 0.55);
        mk.box(fx, y + 0.03, fz, 0.78, 0.05, 0.7, tone(C.basket, mk.r(b, 151)), 'petal', 0.9);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI;
          mk.box(fx + Math.cos(a) * 0.18, y + 0.07, fz + Math.sin(a) * 0.16 - 0.05, 0.12, 0.03, 0.34, tone(C.dried, mk.r(b, i, 152)), 'petal', 1, 0, a + Math.PI / 2);
        }
      }
      for (let j = 0; j < 3; j++) jar(mk, ...xz3(at(0.72 + (j % 2) * 0.14, 0.3 + j * 0.2), y), 1, C.prahokJar);
      jar(mk, ...xz3(at(0.92, 0.72), y), 1.1, C.prahokJar, tone(C.prahok, 0.3));
      for (let k = 0; k < 4; k++) mk.box(...xz3(at(0.6 + k * 0.05, 0.84), y + 0.16), 0.07, 0.32, 0.07, tone(C.sauce, mk.r(k, 153)), 'petal', 1.1);
      heap(mk, ...xz3(at(0.44, 0.2), y), 0.14, 0.12, 0.06, C.shrimp, 2, 50);
      break;
    }
    case 'sugar': {
      // Palm sugar: round cakes stacked in pyramids and cakes wrapped in palm leaf; a clay jar of syrup; rice in open sacks with a scoop.
      for (let p = 0; p < 2; p++) {
        const [px, pz] = at(0.12 + p * 0.2, 0.6);
        for (let l = 0; l < 3; l++)
          for (let i = 0; i < 3 - l; i++) mk.box(px + (i - (2 - l) / 2) * 0.18, y + 0.05 + l * 0.1, pz, 0.16, 0.09, 0.16, tone(C.sugarCake, mk.r(p, l, i)), 'petal', 1 + l * 0.04);
      }
      for (let i = 0; i < 6; i++) mk.box(...xz3(at(0.1 + i * 0.07, 0.18), y + 0.1), 0.1, 0.2, 0.1, tone(C.palmLeaf, mk.r(i, 161)), 'petal');
      jar(mk, ...xz3(at(0.52, 0.5), y), 1.1, C.clay, 0x9a5a28);
      for (let s = 0; s < 3; s++) {
        const [sx, sz] = at(0.68 + s * 0.13, 0.55 + (s % 2) * 0.12);
        mk.box(sx, y + 0.3, sz, 0.34, 0.6, 0.34, tone(C.sack, mk.r(s, 162)), 'petal', 0.95);
        mk.box(sx, y + 0.62, sz, 0.38, 0.06, 0.38, tone(C.sack, mk.r(s, 163)), 'petal', 1.05);
        mk.box(sx, y + 0.3, sz, 0.35, 0.05, 0.35, 0x3a5a9a, 'petal');
        mk.box(sx, y + 0.62, sz, 0.3, 0.06, 0.3, tone(C.rice, mk.r(s, 164)), 'petal', 1.1);
      }
      mk.box(...xz3(at(0.76, 0.6), y + 0.68), 0.12, 0.08, 0.2, 0xb8bcbe, 'petal', 1.1);
      break;
    }
    case 'meat': {
      // A round chopping block, pork on the boards, a chicken or two, the knife and the scale.
      const [bx, bz] = at(0.3, 0.5);
      mk.box(bx, y + 0.18, bz, 0.62, 0.36, 0.62, 0x8a6a4a, 'petal', 0.9);
      mk.box(bx, y + 0.18, bz, 0.62, 0.36, 0.62, 0x8a6a4a, 'petal', 0.9, 0, Math.PI / 4);
      mk.box(bx, y + 0.37, bz, 0.5, 0.02, 0.5, 0xc8a88a, 'petal', 1.05);
      mk.box(bx + 0.1, y + 0.4, bz, 0.26, 0.06, 0.18, tone(C.pork, 0.2), 'petal');
      mk.box(bx - 0.14, y + 0.4, bz + 0.1, 0.05, 0.02, 0.26, 0xb8bcbe, 'petal', 1.15);
      for (let i = 0; i < 5; i++) {
        const [px, pz] = at(0.55 + (i % 3) * 0.13, 0.35 + Math.floor(i / 3) * 0.3);
        mk.box(px, y + 0.06, pz, 0.24, 0.1, 0.2, tone(C.pork, mk.r(i, 171)), 'petal');
        mk.box(px, y + 0.12, pz - 0.06, 0.24, 0.03, 0.06, tone(C.fat, mk.r(i, 172)), 'petal');
      }
      for (let c = 0; c < 2; c++) {
        const [kx, kz] = at(0.88, 0.3 + c * 0.35);
        mk.box(kx, y + 0.1, kz, 0.26, 0.18, 0.34, tone(C.chicken, mk.r(c, 173)), 'petal');
        mk.box(kx, y + 0.08, kz + 0.2, 0.1, 0.08, 0.1, tone(C.chicken, 0.8), 'petal');
      }
      scale(mk, ...xz3(at(0.08, 0.3), y));
      break;
    }
    case 'veg': {
      heap(mk, ...xz3(at(0.12, 0.55), y), 0.18, 0.3, 0.13, C.eggplant, 2, 60);
      heap(mk, ...xz3(at(0.28, 0.6), y), 0.14, 0.22, 0.12, C.eggplantGreen, 2, 61);
      for (let i = 0; i < 6; i++) mk.box(...xz3(at(0.42 + (i % 3) * 0.06, 0.3 + Math.floor(i / 3) * 0.3), y + 0.06), 0.1, 0.1, 0.3, tone(C.cucumber, mk.r(i, 181)), 'petal');
      heap(mk, ...xz3(at(0.62, 0.5), y), 0.12, 0.26, 0.1, C.tomato, 2, 62);
      for (let p = 0; p < 3; p++) mk.box(...xz3(at(0.78 + (p % 2) * 0.1, 0.3 + p * 0.22), y + 0.15), 0.32, 0.28, 0.32, tone(C.pumpkin, mk.r(p, 182)), 'petal');
      for (let i = 0; i < 4; i++) bundle(mk, ...xz3(at(0.3, 0.12 + i * 0.07), y), 0.55, 0.09, tone(C.leafy, mk.r(i, 183)), 0xd83a2a, true);
      heap(mk, ...xz3(at(0.94, 0.8), y), 0.12, 0.12, 0.2, C.cabbage, 1, 63);
      for (let i = 0; i < 3; i++) {
        const [kx, kz] = at(0.52 + i * 0.05, 0.86);
        mk.box(kx, y + 0.07, kz, 0.1, 0.12, 0.32, tone(C.corn, mk.r(i, 184)), 'petal');
        mk.box(kx, y + 0.07, kz - 0.18, 0.12, 0.1, 0.14, tone(C.husk, mk.r(i, 185)), 'petal');
      }
      break;
    }
    case 'fishG': {
      // On the ground: two aluminium basins of silver fish and a plastic tub of catfish, a scale on the sheet.
      const b1 = basin(mk, ...xz3(at(0.22, 0.6), y), 0.38, 0.22, ALU[0], 0.7, 0x5a6a70);
      fishes(mk, ...xz3(at(0.22, 0.6), b1), 0.3, 16, 0.17, C.fishSilver, 5);
      const b2 = basin(mk, ...xz3(at(0.6, 0.62), y), 0.36, 0.22, ALU[2], 0.7, 0x5a6a70);
      fishes(mk, ...xz3(at(0.6, 0.62), b2), 0.28, 12, 0.19, C.fishSilver, 6);
      const b3 = basin(mk, ...xz3(at(0.88, 0.35), y), 0.28, 0.28, TUBS[0], 0.75, 0x4a6a78);
      fishes(mk, ...xz3(at(0.88, 0.35), b3), 0.2, 4, 0.3, C.catfish, 7);
      scale(mk, ...xz3(at(0.42, 0.15), y));
      break;
    }
    case 'fruitG': {
      // A heap of mangoes on the sheet, bunches of bananas lying by it, a basket of rambutan.
      heap(mk, ...xz3(at(0.3, 0.55), y), 0.42, 0.36, 0.16, C.mango, 3, 70);
      for (let k = 0; k < 3; k++) heap(mk, ...xz3(at(0.66 + (k % 2) * 0.12, 0.3 + k * 0.22), y), 0.18, 0.1, 0.11, C.banana, 2, 71 + k);
      basket(mk, ...xz3(at(0.88, 0.7), y), 0.4, 0.4, 0.24);
      heap(mk, ...xz3(at(0.88, 0.7), y + 0.24), 0.16, 0.16, 0.09, C.rambutan, 2, 74);
      break;
    }
    case 'cakes': {
      // Khmer cakes on round bamboo trays: num kom in banana-leaf pyramids, jelly squares green and pink, white rice balls, num ansom rolls.
      const tray = (u: number, v: number, r: number) => {
        const [tx, tz] = at(u, v);
        mk.box(tx, y + 0.05, tz, r * 1.66, 0.06, r * 1.66, tone(C.basket, mk.r(u * 9, 191)), 'petal', 0.95);
        mk.box(tx, y + 0.05, tz, r * 1.66, 0.06, r * 1.66, tone(C.basket, mk.r(u * 9, 192)), 'petal', 0.95, 0, Math.PI / 4);
        return [tx, tz] as [number, number];
      };
      const [ax, az] = tray(0.2, 0.6, 0.34);
      for (let k = 0; k < 7; k++) mk.box(ax + (k % 3) * 0.16 - 0.16, y + 0.14, az + Math.floor(k / 3) * 0.16 - 0.12, 0.12, 0.12, 0.12, 0x4a8a34, 'petal', 1, 0, Math.PI / 4);
      const [bx, bz] = tray(0.52, 0.66, 0.32);
      for (let k = 0; k < 9; k++) mk.box(bx + (k % 3) * 0.14 - 0.14, y + 0.12, bz + Math.floor(k / 3) * 0.14 - 0.14, 0.12, 0.08, 0.12, [0x6ac050, 0xf08aa8, 0xf4f0e0][k % 3], 'petal', 1.05);
      const [cx2, cz2] = tray(0.8, 0.55, 0.3);
      heap(mk, cx2, y + 0.08, cz2, 0.18, 0.18, 0.08, [0xf4f2ea, 0xece8dc], 2, 75);
      for (let k = 0; k < 4; k++) mk.box(...xz3(at(0.35 + k * 0.1, 0.18), y + 0.06), 0.1, 0.1, 0.3, 0x5a9a3a, 'petal', 0.95 + k * 0.03);
      break;
    }
    case 'greensG': {
      // Bundles of morning glory in a row, water lily stems (long, pink-purple), a basket of herbs.
      for (let i = 0; i < 6; i++) bundle(mk, ...xz3(at(0.1 + i * 0.08, 0.55), y), 0.7, 0.14, tone(C.leafy, mk.r(i, 76)), 0xd83a2a, false, 0.08 * (i - 3));
      for (let i = 0; i < 3; i++) bundle(mk, ...xz3(at(0.66 + i * 0.07, 0.5), y), 0.8, 0.1, [0xb86a9a, 0xa85a8a, 0xc87aa8][i], 0x4a7a3a, false);
      basket(mk, ...xz3(at(0.88, 0.25), y), 0.42, 0.42, 0.28);
      heap(mk, ...xz3(at(0.88, 0.25), y + 0.28), 0.16, 0.16, 0.12, C.herb, 1, 77);
      break;
    }
  }
}

/** What a stall hangs up: garlands from the parasol's rail, banana hands and bags from the tarp's front pole, kramas and sarongs on the rack. */
export function hang(mk: MkBuild, kind: Goods, x0: number, x1: number, z: number, top: number): void {
  const W = x1 - x0;
  switch (kind) {
    case 'flowers':
      for (let i = 0; i < 6; i++) strand(mk, x0 + W * ((i + 0.5) / 6), top, z, 5, 0.08, i % 3 === 2 ? C.jasmine : C.marigold, 200 + i);
      break;
    case 'fruit':
      for (let i = 0; i < 4; i++) {
        const x = x0 + W * (0.15 + i * 0.23);
        mk.box(x, top - 0.1, z, 0.02, 0.2, 0.02, 0xd8d0c0, 'petal');
        heap(mk, x, top - 0.62, z, 0.14, 0.1, 0.1, C.banana, 3, 210 + i);
      }
      break;
    case 'greens':
    case 'fish':
      for (let i = 0; i < 5; i++) strand(mk, x0 + W * (0.1 + i * 0.05), top, z, 2, 0.16, C.bag, 220 + i);
      break;
    case 'drinks':
      for (let i = 0; i < 5; i++) {
        const x = x0 + W * (0.2 + i * 0.12);
        mk.box(x, top - 0.08, z, 0.02, 0.16, 0.02, 0xd8d0c0, 'petal');
        bagOf(mk, x, top - 0.36, z, 0.2, [0xc8d070, 0xe8c040, 0xd8e0a0, 0xe89a50, 0xc8d070][i]);
      }
      break;
    default:
      break;
  }
}

/** The krama stall's six kramas (the ones the explorer buys: character/clothes.ts), in the order they hang. */
const KRAMA_SIX: readonly KramaLook[] = [KRAMAS.redWhite, KRAMAS.blueWhite, KRAMAS.green, KRAMAS.purple, KRAMAS.orange, KRAMAS.red];

/**
 * Kramas and sarongs hanging on a rack's bars (the cloth stall): along x at `z`, from the bar at `top`. The kramas
 * are the stall's six, each in its weave: a check's white bands across and two down, a plaid's dark bands and a
 * thread; a sarong's printed hem.
 */
export function cloth(mk: MkBuild, x0: number, x1: number, z: number, top: number, seed: number): void {
  const n = Math.floor((x1 - x0) / 0.4);
  let kr = 0;
  for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.5) * ((x1 - x0) / n);
    const sarong = (i + seed) % 3 === 0;
    const h = sarong ? 1.5 : 1.15;
    if (sarong) {
      mk.box(x, top - h / 2, z, 0.36, h, 0.03, tone(C.sarong, mk.r(i, seed, 191)), 'petal', 0.95 + mk.r(i, 192) * 0.08);
      mk.box(x, top - h + 0.12, z + 0.005, 0.37, 0.16, 0.03, 0xd8a040, 'petal');
      continue;
    }
    const k = KRAMA_SIX[(kr++ + seed) % KRAMA_SIX.length];
    const T = k.tones;
    mk.box(x, top - h / 2, z, 0.36, h, 0.03, T.red, 'petal', 0.95 + mk.r(i, 192) * 0.08);
    if (k.weave === 'check') {
      for (const d of [0.2, 0.45, 0.7, 0.95]) mk.box(x, top - d, z + 0.005, 0.37, 0.08, 0.03, T.light, 'petal', 0.97);
      for (const d of [-0.09, 0.09]) mk.box(x + d, top - h / 2, z + 0.008, 0.07, h, 0.03, T.light, 'petal', 0.97);
    } else {
      for (const d of [0.3, 0.78]) mk.box(x, top - d, z + 0.005, 0.37, 0.06, 0.03, T.dark, 'petal');
      mk.box(x, top - 0.55, z + 0.005, 0.37, 0.025, 0.03, T.light, 'petal');
    }
    // (the fringe at its foot)
    mk.box(x, top - h - 0.05, z, 0.3, 0.1, 0.02, T.fringe, 'petal', 0.9);
  }
}

/**
 * Clothes hanging on the krama stall's side bars, along x at `z` from the bar at `top`: fisherman trousers hung by
 * the waist (navy, black: two loose legs), and linen shirts on wire hangers (white, indigo, sand: the body, short
 * sleeves out, the collar).
 */
export function garments(mk: MkBuild, x0: number, x1: number, z: number, top: number, seed: number): void {
  const list = seed > 0 ? (['navy', 'white', 'sand'] as const) : (['black', 'indigo', 'navy'] as const);
  const n = list.length;
  list.forEach((g, i) => {
    const x = x0 + (i + 0.5) * ((x1 - x0) / n);
    if (g === 'navy' || g === 'black') {
      const T = TROUSERS[g];
      mk.box(x, top - 0.06, z, 0.46, 0.1, 0.035, T.dark, 'petal');
      for (const s of [-1, 1]) {
        mk.box(x + s * 0.12, top - 0.62, z, 0.21, 1.05, 0.03, T.base, 'petal', 0.95 + (s > 0 ? 0.05 : 0));
        mk.box(x + s * 0.12, top - 1.17, z, 0.22, 0.07, 0.035, T.hem, 'petal');
      }
      return;
    }
    const S = SHIRTS[g];
    // (the hanger's hook and wire)
    mk.box(x, top - 0.02, z, 0.02, 0.06, 0.02, 0x8a8a86, 'petal');
    mk.box(x, top - 0.07, z, 0.4, 0.02, 0.02, 0x8a8a86, 'petal');
    mk.box(x, top - 0.38, z, 0.4, 0.62, 0.03, S.base, 'petal', 0.96);
    for (const s of [-1, 1]) mk.box(x + s * 0.25, top - 0.17, z, 0.14, 0.18, 0.03, S.mid, 'petal', 0.95, 0, 0, s * 0.35);
    mk.box(x, top - 0.1, z + 0.006, 0.14, 0.05, 0.03, S.cuff, 'petal');
    mk.box(x, top - 0.4, z + 0.006, 0.025, 0.5, 0.03, S.mid, 'petal');
  });
}

/** A point of the surface and a height: the helpers' (x, y, z) argument list. */
function xz3(p: [number, number], y: number): [number, number, number] {
  return [p[0], y, p[1]];
}

export { basket, basin, bagOf, heap, jar, strand, C as GOODS_COLORS };
