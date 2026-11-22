import type { Vector3 } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelMaterialKey } from '../../voxel/materials';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { Glow } from '../festival/_glow';
import type { HeightField } from '../heightfield';
import { BAMBOO, PLANK, POST, Site, type SiteBox } from '../jungle/_campKit';
import type { Lamps } from '../landmarks/_prasatKit';
import { registerShop, type ShopItem } from '../shop';
import { STALL_K, STALLS, type StallKind } from './plan';
import { stallSign } from './_sqFestSigns';
import { cartGoods, flowerGoods, toyGoods } from './_sqFestGoods';
import { buildSeats } from './_sqSeats';
import { LAMP_HALO, pick } from './_sqKit';

/**
 * The festival stalls on the square (AWP-35; plan.ts `STALLS`), as at a Cambodian night fair: a timber stand under a
 * peaked canopy of red and white stripes with a scalloped valance front and back, a red sign in gold Khmer letters
 * (`_sqFestSigns.ts`) standing on the canopy's front, a counter with a red cloth, the goods on it and on a shelf at the
 * back, bulbs along the front eave, a warm light under the ridge and a little Khmer lamp hanging from the front beam
 * (they glow; no light of their own); beside the food stalls' counters a crate heaped with fruit for the New Year
 * (mangoes, dragon fruit, bananas, rambutan: `fruit`). The kinds:
 *
 * - នំ sweets: a charcoal griddle of num krok (its round cups), trays of num kong and palm sugar cakes;
 * - អាំង grill: skewers of beef, grilled corn on a long grill over glowing coals, smoke the people part's;
 * - ភេសជ្ជៈ drinks: green coconuts heaped, cups of sugarcane juice, the ice box;
 * - នំអន្សម rice cakes: num ansom and num kom in banana leaf, stacked;
 * - ផ្កា flowers: lotus buds in buckets, jasmine and marigold garlands, banana-leaf offerings (`_sqFestGoods.ts`);
 * - គោម lamps and toys: round paper lamps glowing in soft colours, pinwheels, a bunch of balloons over the canopy;
 * - ទឹកអំពៅ the sugarcane juice cart: a pushcart with its roller press and crank wheel, cane stalks, under a red and
 *   white parasol (`_sqFestGoods.ts` `cartGoods`).
 *
 * The four snack stalls and the cart register shops (shop.ts: E Buy while roaming), open while the square stands.
 * Stall space: +z its front (the buyers' side, toward the square's middle), +x its left, y up from its ground, in a
 * real stall's metres; drawn `STALL_K` times that, for the map's people (1.4 × a real person). Families: timber
 * `mapBark`, cloth and food `petal` (soft), the griddle, jars and the cart `mapStone`: all in the square's builder (no
 * draw of its own). The seating round them (`_sqSeats.ts`) is built from here too, so square.ts keeps one call.
 */

const item = (id: string, km: string, en: string, price: number, consume: ShopItem['consume'], colors?: number[]): ShopItem => ({ id, name: { km, en }, price, consume, ...(colors ? { colors } : {}) });

const SHOPS: Partial<Record<StallKind, { km: string; en: string; items: ShopItem[] }>> = {
  sweets: {
    km: 'តូបនំ',
    en: 'Sweets stall',
    items: [
      item('numKrok', 'នំក្រក', 'Num krok (coconut rice cakes)', 2000, 'sweet', [0xf0d8a0, 0xd89a48]),
      item('numKong', 'នំកង', 'Num kong (sesame rings)', 1000, 'sweet', [0xc8843a, 0xe8d8b0]),
      item('numAkor', 'នំអាកោ', 'Num akor (steamed cakes)', 1000, 'sweet', [0xe85a8a, 0xf2f0e8]),
    ],
  },
  grill: {
    km: 'តូបអាំង',
    en: 'Grill stall',
    items: [
      item('sachKoAng', 'សាច់គោអាំង', 'Grilled beef skewers', 3000, 'skewer', [0x8a4a2a]),
      item('poatAng', 'ពោតអាំង', 'Grilled corn', 2000, 'skewer', [0xe8c040]),
      item('meukAng', 'មឹកអាំង', 'Grilled squid', 4000, 'skewer', [0xd8a888]),
    ],
  },
  drinks: {
    km: 'តូបភេសជ្ជៈ',
    en: 'Drinks stall',
    items: [
      item('tukAmpov', 'ទឹកអំពៅ', 'Sugarcane juice', 2000, 'cupDrink', [0xc8d878]),
      item('daung', 'ដូងខ្ចី', 'Green coconut', 3000, 'coconut'),
      item('kafeTukDohKo', 'កាហ្វេទឹកដោះគោទឹកកក', 'Iced coffee with milk', 3000, 'bagDrink', [0xa8783a]),
      item('tuk', 'ទឹកសុទ្ធ', 'Water', 1000, 'bottle'),
    ],
  },
  cakes: {
    km: 'តូបនំអន្សម',
    en: 'Rice cake stall',
    items: [
      item('numAnsom', 'នំអន្សម', 'Num ansom (sticky rice cake)', 2000, 'sweet', [0x5a8a3a, 0xe8e0c8]),
      item('numKom', 'នំគម', 'Num kom (coconut parcels)', 1000, 'sweet', [0x6a9a3a, 0xf0e8d0]),
      item('numPlae', 'នំផ្លែអាយ', 'Num plae ai (palm sugar balls)', 1500, 'sweet', [0xf2f0e8, 0xb8783a]),
    ],
  },
  cane: {
    km: 'រទេះទឹកអំពៅ',
    en: 'Sugarcane juice cart',
    items: [
      item('tukAmpovCart', 'ទឹកអំពៅ', 'Sugarcane juice, pressed while you wait', 2000, 'cupDrink', [0xc8d878]),
      item('tukAmpovKroch', 'ទឹកអំពៅក្រូចឆ្មារ', 'Sugarcane juice with lime', 2500, 'cupDrink', [0xd8e070]),
    ],
  },
};

/** A site drawn `STALL_K` times its local metres (positions, sizes, the ground's height under a point). */
class Scaled extends Site {
  override world(lx: number, ly: number, lz: number, out?: Vector3): Vector3 {
    return super.world(lx * STALL_K, ly * STALL_K, lz * STALL_K, out);
  }

  override ground(lx: number, lz: number): number {
    return super.ground(lx * STALL_K, lz * STALL_K) / STALL_K;
  }

  override box(lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, color: number, mat: VoxelMaterialKey, o: SiteBox = {}): void {
    super.box(lx, ly, lz, sx * STALL_K, sy * STALL_K, sz * STALL_K, color, mat, o);
  }
}

/** Canopy stripes: red with white (as in the owner's reference). */
const STRIPES: Record<StallKind, [number, number]> = {
  sweets: [0xc8202a, 0xf4f0e6],
  grill: [0xc8202a, 0xf4f0e6],
  drinks: [0xc8202a, 0xf4f0e6],
  cakes: [0xd42430, 0xf4f0e6],
  flowers: [0xc8202a, 0xf4f0e6],
  toys: [0xd42430, 0xf4f0e6],
  cane: [0xc8202a, 0xf4f0e6],
};

/** The stand (stall space): posts at ±`px`, front `pzF`, back `pzB`; eaves `eave` m up, the ridge `ridge` m; the canopy hangs `over` m past the posts. */
const ST = { px: 1.55, pzF: 0.95, pzB: -0.95, eave: 2.68, ridge: 3.35, over: 0.5, drop: 0.92 } as const;
/** The counter (stall space). */
const COUNTER = { z: 0.62, w: 2.9, d: 0.62, top: 1.0 };

export function buildStalls(b: VoxelBuilder, field: HeightField, lamps: Lamps, glow: Glow | null, low: boolean): void {
  const src = traceSource();
  STALLS.forEach((p, i) => {
    const kind = p.kind;
    const y = field.heightAt(p.x, p.z);
    const s = new Scaled(b, field, p.x, y, p.z, p.facing, src, 870 + i);
    if (kind === 'cane') cartGoods(s, lamps, glow, low);
    else {
      frame(s, STRIPES[kind], low);
      canopyLights(s, lamps, glow, low);
      stallSign(s, kind, 0, ST.ridge - 0.02, 0.62, 2.1, 0.72, !low);
      if (kind === 'flowers') flowerGoods(s, COUNTER, low);
      else if (kind === 'toys') toyGoods(s, COUNTER, lamps, glow, low);
      else {
        goods(s, kind, low);
        fruit(s, low);
      }
    }
    // Trees keep off it.
    field.occupy(p.x - 2.9, p.z - 2.9, p.x + 2.9, p.z + 2.9);
    // The shop: before the counter's middle, facing the stall.
    const sh = SHOPS[kind];
    if (!sh) return;
    const at = s.world(0, 0, kind === 'cane' ? 1.5 : 1.75);
    registerShop({ id: `nye-${kind}`, name: { km: sh.km, en: sh.en }, x: at.x, y: field.heightAt(at.x, at.z), z: at.z, r: 1.9, facing: p.facing + Math.PI, items: sh.items });
  });
  buildSeats(b, field, lamps, glow, low);
}

/** Bulbs along the front eave, a warm strip under the ridge, the little Khmer lamp hanging by the left post; their halos. */
function canopyLights(s: Site, lamps: Lamps, glow: Glow | null, low: boolean): void {
  const n = low ? 5 : 9;
  for (let k = 0; k < n; k++) {
    const x = -ST.px - 0.15 + ((k + 0.5) * (2 * ST.px + 0.3)) / n;
    const P = s.world(x, ST.ridge + 0.04 - ST.drop - 0.12 - 0.05 * Math.sin(((k + 0.5) / n) * Math.PI), ST.pzF + ST.over + 0.08);
    lamps.add([P.x, P.y, P.z], 0.09, 0.75);
  }
  const R = s.world(0, ST.ridge - 0.22, 0.05);
  lamps.strip([R.x, R.y, R.z], 2.5 * STALL_K, 0.06, 0.06, s.yaw, 0.7);
  const C = s.world(0, COUNTER.top + 0.5, COUNTER.z);
  glow?.add(C.x, C.y, C.z, 0xffc070, 3.2, { level: 0.7 });
  // (and a wide soft one under the canopy: from across the square a stall reads as a lit tent, as in the reference)
  const U = s.world(0, ST.eave - 0.3, 0.3);
  glow?.add(U.x, U.y, U.z, 0xffb868, low ? 4.5 : 5.5, { level: 0.35 });
  // The lamp hanging from the front beam, by the left post: a flame box under a little tower top.
  const lx = -1.05;
  const lz = ST.pzF + 0.1;
  const L = s.world(lx, 2.0, lz);
  s.box(lx, 2.3, lz, 0.02, 0.22, 0.02, 0x3a3028, 'mapBark');
  s.box(lx, 2.17, lz, 0.26, 0.05, 0.26, 0xb4a385, 'mapStone');
  s.box(lx, 2.22, lz, 0.16, 0.06, 0.16, 0xc8b799, 'mapStone');
  s.box(lx, 2.27, lz, 0.06, 0.06, 0.06, 0xd9a93a, 'mapStone');
  s.box(lx, 1.84, lz, 0.22, 0.05, 0.22, 0xb4a385, 'mapStone');
  lamps.add([L.x, L.y, L.z], 0.18, 0.9);
  glow?.add(L.x, L.y, L.z, LAMP_HALO, 1.6, { level: 0.8 });
}

/** Posts, beams, the peaked canopy in stripes with its valances and gable cloths, the counter with its cloth, the back shelf. */
function frame(s: Site, [red, other]: [number, number], low: boolean): void {
  const seed = s.seed;
  const tone = (list: readonly number[], a: number, c: number) => pick(list, a, c, 1, seed);
  const { px, pzF, pzB, eave, ridge, over, drop } = ST;
  for (const [x, z] of [
    [-px, pzF],
    [px, pzF],
    [-px, pzB],
    [px, pzB],
  ]) {
    const g = s.ground(x, z);
    s.box(x, (g + eave) / 2, z, 0.13, eave - g, 0.13, tone(POST, x * 10, z * 10), 'mapBark');
  }
  // (the ridge pole on two king posts, the eave beams)
  for (const sx of [-px, px]) s.box(sx, (eave + ridge) / 2, 0, 0.1, ridge - eave, 0.1, tone(POST, sx, 3), 'mapBark');
  s.box(0, ridge - 0.08, 0, 2 * px + 0.2, 0.1, 0.1, tone(PLANK, 1, 1), 'mapBark');
  s.box(0, eave - 0.05, pzF, 2 * px + 0.2, 0.1, 0.1, tone(PLANK, 1, 2), 'mapBark');
  s.box(0, eave - 0.05, pzB, 2 * px + 0.2, 0.1, 0.1, tone(PLANK, 2, 3), 'mapBark');
  // The canopy: stripes running down both slopes from the ridge, past the posts.
  const half = pzF + over;
  const slope = Math.atan2(drop, half);
  const len = Math.hypot(drop, half) + 0.04;
  const wide = 2 * px + 0.4;
  const stripes = low ? 6 : 8;
  for (let k = 0; k < stripes; k++) {
    const x = -wide / 2 + ((k + 0.5) * wide) / stripes;
    const col = k % 2 ? other : red;
    for (const side of [1, -1]) s.box(x, ridge + 0.04 - drop / 2, (side * half) / 2, wide / stripes + 0.005, 0.05, len, col, 'petal', { rx: side * slope });
  }
  // A red ridge cap, gilt at its ends.
  s.box(0, ridge + 0.07, 0, wide + 0.06, 0.08, 0.16, 0xa81622, 'petal');
  for (const sx of [-1, 1]) s.box(sx * (wide / 2 + 0.03), ridge + 0.09, 0, 0.1, 0.14, 0.18, 0xe2b04a, 'petal');
  // The gable ends: red cloth in stepped rows under the slopes.
  const rows = low ? 3 : 5;
  const ey = ridge + 0.04 - drop;
  for (const sx of [-1, 1])
    for (let r = 0; r < rows; r++) {
      const t = (r + 0.5) / rows;
      s.box(sx * (wide / 2 - 0.01), ey + t * drop, 0, 0.04, drop / rows, 2 * half * (1 - t) + 0.02, r % 2 ? other : red, 'petal');
    }
  // The valances: scalloped bands along both eaves (a band and a tab under each stripe).
  const vy = ey - 0.06;
  for (const side of [1, -1]) {
    const vz = side * (half + 0.02);
    s.box(0, vy, vz, wide, 0.1, 0.04, red, 'petal');
    if (side < 0 && low) continue;
    for (let k = 0; k < stripes; k++) {
      const x = -wide / 2 + ((k + 0.5) * wide) / stripes;
      s.box(x, vy - 0.1, vz, wide / stripes - 0.06, 0.1, 0.04, k % 2 ? red : other, 'petal');
      s.box(x, vy - 0.18, vz, 0.14, 0.06, 0.04, k % 2 ? red : other, 'petal');
    }
  }
  // The counter: a plank top on legs, a red cloth hung down its front with a gilt hem.
  const C = COUNTER;
  for (const sx of [1, -1]) for (const dz of [-1, 1]) s.box(sx * (C.w / 2 - 0.08), C.top / 2, C.z + dz * (C.d / 2 - 0.06), 0.08, C.top, 0.08, tone(BAMBOO, sx, dz), 'mapBark');
  s.box(0, C.top - 0.03, C.z, C.w, 0.06, C.d, tone(PLANK, 4, 5), 'mapBark');
  s.box(0, C.top * 0.55, C.z + C.d / 2 + 0.02, C.w, C.top * 0.8, 0.04, 0xb01828, 'petal');
  s.box(0, C.top * 0.17, C.z + C.d / 2 + 0.03, C.w, 0.06, 0.04, 0xe2b04a, 'petal');
  if (!low) for (let k = 0; k < 7; k++) s.box(-C.w / 2 + 0.2 + k * 0.42, C.top * 0.86, C.z + C.d / 2 + 0.045, 0.1, 0.1, 0.02, 0xe2b04a, 'petal');
  // A low stool for the seller behind it, a bench of crates; a shelf along the back.
  s.box(0.6, 0.2, -0.25, 0.36, 0.06, 0.36, 0xd8352a, 'mapStone');
  s.box(0.6, 0.09, -0.25, 0.3, 0.18, 0.3, 0xc82e24, 'mapStone');
  s.box(-0.95, 0.22, -0.45, 0.6, 0.44, 0.42, tone(PLANK, 6, 7), 'mapBark');
  s.box(0, 1.28, pzB + 0.12, 2 * px - 0.2, 0.05, 0.3, tone(PLANK, 8, 9), 'mapBark');
  if (!low)
    for (let k = 0; k < 6; k++) {
      const h = 0.16 + 0.1 * hash3(k, 1, 3, seed);
      s.box(-1.15 + k * 0.46, 1.31 + h / 2, pzB + 0.12, 0.22, h, 0.2, [0xb85a2a, 0xe8d8b0, 0x5a8a3a, 0xc8a040, 0x9a4a8a, 0xf2efe6][k], 'petal');
    }
}

/** Beside the counter (its right, the buyers' side): a crate on a stool heaped with fruit for the New Year. */
function fruit(s: Site, low: boolean): void {
  const x = 1.85;
  const z = 1.15;
  // (a woven bamboo crate, pale, on a red stool)
  s.box(x, 0.16, z, 0.5, 0.32, 0.42, 0xc82e24, 'mapStone');
  s.box(x, 0.45, z, 0.66, 0.26, 0.54, pick(BAMBOO, 8, 9, 1, s.seed), 'mapBark', { shade: 1.08 });
  s.box(x, 0.59, z, 0.7, 0.04, 0.58, pick(BAMBOO, 9, 8, 1, s.seed), 'mapBark', { shade: 1.12 });
  const r = (a: number, b = 0) => hash3(a, b, 11, s.seed);
  // Mangoes, dragon fruit (magenta, green tips), a hand of bananas, rambutan.
  const heap: [number, number, number, number, number][] = [
    [-0.18, -0.1, 0.13, 0xf2b33a, 0],
    [-0.04, -0.12, 0.13, 0xe8a030, 0],
    [-0.12, 0.04, 0.12, 0xf4c04a, 0],
    [0.12, -0.08, 0.15, 0xd8336e, 1],
    [0.16, 0.08, 0.14, 0xc82a62, 1],
    [0.0, 0.1, 0.1, 0xc8281e, 2],
    [-0.06, 0.12, 0.1, 0xb82218, 2],
  ];
  for (const [k, [dx, dz, w, col, kind]] of heap.entries()) {
    if (low && k % 2) continue;
    s.box(x + dx, 0.6 + w / 2 - 0.02, z + dz, w, w * 0.85, w, col, 'petal', { ry: r(k) * 1.5, shade: 0.95 + 0.1 * r(k, 1) });
    if (kind === 1 && !low) s.box(x + dx, 0.6 + w * 0.9, z + dz, 0.04, 0.05, 0.04, 0x5aa03a, 'petal');
  }
  // (the bananas: a hand of four laid across the back)
  for (let k = 0; k < (low ? 2 : 4); k++) s.box(x - 0.2 + k * 0.1, 0.66 + 0.02 * (k % 2), z + 0.2, 0.06, 0.06, 0.3, 0xf0d040, 'petal', { ry: 0.3 + 0.1 * k });
}

/** The goods on the counter (and beside it), by kind. */
function goods(s: Site, kind: StallKind, low: boolean): void {
  const C = COUNTER;
  const top = C.top;
  const r = (a: number, b = 0) => hash3(a, b, 7, s.seed);
  if (kind === 'sweets') {
    // The num krok griddle: a round iron pan of cups over a clay stove, at the counter's right.
    s.box(0.85, top + 0.12, C.z, 0.5, 0.22, 0.5, 0x8a5a3a, 'mapStone');
    s.box(0.85, top + 0.25, C.z, 0.52, 0.05, 0.52, 0x2a2826, 'mapStone');
    if (!low) for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) s.box(0.7 + a * 0.15, top + 0.28, C.z - 0.15 + c * 0.15, 0.08, 0.02, 0.08, 0xf0d8a0, 'petal');
    // Trays of num kong and palm sugar cakes.
    for (const [x, col] of [
      [-0.85, 0xc8843a],
      [-0.2, 0xe8d090],
      [0.3, 0xe85a8a],
    ] as const) {
      s.box(x, top + 0.03, C.z, 0.48, 0.04, 0.42, 0xb8945a, 'mapBark');
      for (let k = 0; k < (low ? 2 : 6); k++) s.box(x - 0.15 + (k % 3) * 0.15, top + 0.08, C.z - 0.08 + Math.floor(k / 3) * 0.16, 0.1, 0.05, 0.1, col, 'petal', { shade: 0.95 + 0.1 * r(k, x) });
    }
  } else if (kind === 'grill') {
    // A long charcoal grill on the counter, its coals glowing, skewers on it, cobs of corn.
    s.box(0.15, top + 0.08, C.z, 1.6, 0.14, 0.42, 0x3a3634, 'mapStone');
    s.box(0.15, top + 0.155, C.z, 1.5, 0.02, 0.34, 0xc84a1a, 'mapStone', { shade: 1.3 });
    for (let k = 0; k < (low ? 5 : 10); k++) s.box(-0.55 + k * 0.15, top + 0.18, C.z, 0.05, 0.04, 0.5, k % 3 === 2 ? 0xe8c040 : 0x7a3e22, 'petal');
    s.box(-1.0, top + 0.06, C.z, 0.4, 0.08, 0.36, 0xd8d4ca, 'mapStone');
    for (let k = 0; k < 3; k++) s.box(-1.08 + k * 0.08, top + 0.13, C.z, 0.06, 0.06, 0.26, 0xe8c040, 'petal');
  } else if (kind === 'drinks') {
    // A heap of green coconuts, cups of juice in a row, the blue ice box.
    for (let k = 0; k < (low ? 4 : 7); k++) {
      const x = -0.9 + (k % 4) * 0.2 + (k >= 4 ? 0.1 : 0);
      s.box(x, top + 0.1 + (k >= 4 ? 0.16 : 0), C.z, 0.2, 0.2, 0.2, [0x6a9a2a, 0x7aa832, 0x5e8e26][k % 3], 'petal', { ry: r(k) });
    }
    for (let k = 0; k < 5; k++) s.box(0.05 + k * 0.14, top + 0.07, C.z + 0.1, 0.08, 0.12, 0.08, [0xc8d878, 0xe89a3a, 0xc8d878, 0x8a4a2a, 0xc8d878][k], 'petal');
    s.box(0.95, top + 0.17, C.z - 0.05, 0.5, 0.32, 0.4, 0x2a6ab8, 'mapStone');
    s.box(0.95, top + 0.35, C.z - 0.05, 0.52, 0.05, 0.42, 0xf2efe6, 'mapStone');
    // (cane stalks leaning on the post)
    for (let k = 0; k < 3; k++) s.box(1.4 - k * 0.08, 0.9, 1.15, 0.05, 1.8, 0.05, 0x8a9a3a, 'mapBark', { rz: 0.12 + k * 0.05 });
  } else {
    // Num ansom: logs in banana leaf stacked; num kom: little green pyramids on a tray.
    for (let k = 0; k < (low ? 3 : 6); k++) s.box(-0.8 + (k % 3) * 0.18, top + 0.06 + Math.floor(k / 3) * 0.11, C.z, 0.14, 0.11, 0.42, [0x5a8a3a, 0x4e7e32][k % 2], 'petal');
    s.box(0.45, top + 0.03, C.z, 0.7, 0.04, 0.45, 0xb8945a, 'mapBark');
    for (let k = 0; k < (low ? 3 : 8); k++) {
      const x = 0.2 + (k % 4) * 0.16;
      const z = C.z - 0.1 + Math.floor(k / 4) * 0.2;
      s.box(x, top + 0.09, z, 0.12, 0.08, 0.12, 0x6a9a3a, 'petal');
      s.box(x, top + 0.15, z, 0.06, 0.05, 0.06, 0x7aaa42, 'petal');
    }
  }
}

