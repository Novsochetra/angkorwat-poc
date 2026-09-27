import { TRAILS } from '../layout';
import type { Lang, MapFrame } from '../types';
import type { ConsumeKind, ShopItem } from '../shop';
import type { Goods } from './_mkPlan';

/**
 * The little morning market of the hamlet behind Angkor Wat (ផ្សារភូមិ:
 * the build `_bhMarket.ts`, its people people/_sceneBackMarket.ts; no
 * three.js here, both read it): at the crossroads where the `hamlet lane`
 * comes down off the rise and meets the back trail, by the sala and the
 * coconut cart (`_bhSpots.ts`). A village market is a handful of women
 * who carry in what the village grows and cooks and sit along the road at
 * first light: here on both sides of the trail, round the lane's foot,
 * under the big old tree that stands across the trail from the lane (the
 * way down from the hamlet ends on it).
 *
 * The market's frame (m): `s` along the trail from the junction (+ east,
 * toward Ta Prohm's hills), `t` across it (+ north, toward the hamlet;
 * − south, the meadow side). The trail's band (`|t| < 2.2`: walkers, the
 * cattle going out and home, bicycles) and the lane's (`|s| < 1.8`, t > 0)
 * stay clear.
 *
 * - North of the trail, west of the lane (between the cart and the lane):
 *   the breakfast stall — num banh chok and rice porridge, iced coffee —
 *   under a blue tarp, its low table and stools beside it toward the lane.
 * - North of the trail, east of the lane: the hamlet's own produce on a
 *   raised bamboo platform under a green parasol — palm sugar, rice, duck
 *   eggs, fresh palm juice.
 * - South of the trail, under the tree and along its shade: the fruit
 *   table under a market parasol, the vegetable seller under her umbrella
 *   and the fish seller on the ground, the num krok seller at her little
 *   griddle (the one who comes back in the evening).
 * - Round them: bicycles and a moto parked east of the lane's foot,
 *   baskets, trodden earth.
 *
 * Times (`clock`: 0 golden afternoon, 0.25 dusk, 0.5 midnight, 0.75 dawn):
 * the sellers come in the blue hour (the fish first), the market is busiest
 * from dawn to mid-morning (`BUSY`), they pack up toward noon; in the
 * afternoon only the juice cart; from the golden hour into the evening the
 * num krok seller again, under her little lamp after dusk.
 *
 * Shops (shop.ts `registerShop`, real riel prices: scratchpad BUY-CONTRACT):
 * the breakfast stall, the produce platform, the fruit table, the num krok
 * seller and the coconut cart (vegetables and raw fish are for cooking at
 * home: not shops).
 */

// ── The frame ────────────────────────────────────────────────────────────────

const trail = TRAILS.find((t) => t.name === 'back trail')?.points ?? [];
const lane = TRAILS.find((t) => t.name === 'hamlet lane')?.points ?? [
  [128, -306],
  [136, -322],
  [146, -336],
];
/** The trail's leg through the junction (from the point before it to the one after). */
const legA = trail.find(([x]) => x > 100 && x < 120) ?? [108, -318];
const legB = trail.find(([x]) => x > 140 && x < 160) ?? [148, -294];
const legLen = Math.hypot(legB[0] - legA[0], legB[1] - legA[1]) || 1;

/** The junction (the lane's foot on the trail): the frame's origin (map x, z). */
export const BM = { x: lane[0][0], z: lane[0][1] };
/** Along the trail (unit, map x, z: toward the east) and across it (toward the hamlet, north). */
export const BM_U = { x: (legB[0] - legA[0]) / legLen, z: (legB[1] - legA[1]) / legLen };
export const BM_N = { x: BM_U.z, z: -BM_U.x };

/** Market (s, t) → map x. */
export const bmX = (s: number, t: number): number => BM.x + s * BM_U.x + t * BM_N.x;
/** Market (s, t) → map z. */
export const bmZ = (s: number, t: number): number => BM.z + s * BM_U.z + t * BM_N.z;
/** Map (x, z) → market s, t. */
export const bmS = (x: number, z: number): number => (x - BM.x) * BM_U.x + (z - BM.z) * BM_U.z;
export const bmT = (x: number, z: number): number => (x - BM.x) * BM_N.x + (z - BM.z) * BM_N.z;
/**
 * A heading in the market's frame (0: facing +t, north toward the hamlet;
 * π/2: facing +s, east) → a map yaw (toward (sin, cos) in x, z).
 */
export const bmYaw = (a: number): number => Math.atan2(BM_N.x * Math.cos(a) + BM_U.x * Math.sin(a), BM_N.z * Math.cos(a) + BM_U.z * Math.sin(a));

/** Facing the trail from its north side, from its south side (market headings). */
export const TO_TRAIL_FROM_N = Math.PI;
export const TO_TRAIL_FROM_S = 0;

// ── The stalls ───────────────────────────────────────────────────────────────

/**
 * How a stall is built: the breakfast stall (a table with its pots on a
 * charcoal stove, a tarp, a low table and stools in front); a table under a
 * parasol; a seller on the ground behind her goods on a plastic sheet or a
 * mat under a small umbrella; the num krok seller squatting at her clay
 * griddle on a little stove, trays of cakes beside her.
 */
export type BmKind = 'breakfast' | 'table' | 'platform' | 'ground' | 'krok';

/** A window of the clock from `[0]` round to `[1]` (it may wrap past 0). */
export type Window = readonly [number, number];

export interface BmStall {
  id: string;
  kind: BmKind;
  /** What is on it (the east market's goods: hamlet/_mkGoods.ts), for the tables and the ground sellers. */
  goods: Goods;
  cover: 'tarpBlue' | 'parasolRed' | 'parasolGreen' | 'umbrella' | 'none';
  /** Middle (market s, t) and the way its front faces (a market heading: buyers come from the front). */
  s: number;
  t: number;
  face: number;
  /** Across the front and deep (m). */
  w: number;
  d: number;
  /** The seller: where (stall space: x across, z to the front; `y` up: a platform) and how. */
  seat: { x: number; z: number; y?: number; pose: 'squat' | 'stool' | 'stand' | 'sit' };
  /** Open over these windows of the clock. */
  open: readonly Window[];
  /** The seller's dress (people/_kinds.ts) and seed. */
  who: { sex: 'f' | 'm'; hat: 'palm' | 'krama' | 'none'; seed: number; goods?: 'fruit' | 'greens' | 'fish' | 'sweets' };
  /** What the explorer can buy here (none: not a shop). */
  sells?: { name: Record<Lang, string>; items: ShopItem[] };
}

const item = (id: string, km: string, en: string, price: number, consume: ConsumeKind, colors?: number[]): ShopItem => ({ id, name: { km, en }, price, consume, colors });

export const BM_STALLS: readonly BmStall[] = [
  // ── North of the trail, between the cart and the lane: breakfast ──
  {
    id: 'breakfast',
    kind: 'breakfast',
    goods: 'noodles',
    cover: 'tarpBlue',
    s: -6.3,
    t: 5.3,
    face: TO_TRAIL_FROM_N,
    w: 3.4,
    d: 2.6,
    seat: { x: -0.6, z: -0.55, pose: 'stand' },
    open: [[0.7, 0.9]],
    who: { sex: 'f', hat: 'krama', seed: 2701 },
    sells: {
      name: { km: 'នំបញ្ចុក និងបបរ', en: 'Num banh chok and rice porridge' },
      items: [
        item('numBanhChok', 'នំបញ្ចុក', 'Num banh chok', 4000, 'noodles', [0xf2eee4, 0xb8b048, 0x5aa040]),
        item('bobor', 'បបរ', 'Rice porridge (bobor)', 3000, 'riceBowl', [0xf4f0e6, 0xe8c070, 0x5aa040]),
        item('icedCoffee', 'កាហ្វេទឹកដោះគោទឹកកក', 'Iced coffee with milk', 3000, 'bagDrink', [0xa8744a, 0xf0ece4]),
      ],
    },
  },
  // ── North of the trail, east of the lane: the hamlet's own produce (rice, duck eggs, palm sugar) on a bamboo platform ──
  {
    id: 'produce',
    kind: 'platform',
    goods: 'sugar',
    cover: 'parasolGreen',
    s: 3.9,
    t: 4.3,
    face: TO_TRAIL_FROM_N,
    w: 2.8,
    d: 2.0,
    seat: { x: 0.5, z: -0.45, y: 0.5, pose: 'sit' },
    open: [[0.7, 0.92]],
    who: { sex: 'f', hat: 'none', seed: 2711 },
    sells: {
      name: { km: 'ស្ករត្នោត និងទឹកត្នោត', en: 'Palm sugar and palm juice' },
      items: [
        item('sugarCakes', 'ស្ករត្នោតមួយចង្កោម', 'A bundle of palm sugar cakes', 2500, 'sweet', [0xb87a3a, 0xc8b070]),
        item('palmJuice', 'ទឹកត្នោតស្រស់', 'Fresh palm juice', 1500, 'cupDrink', [0xf0e8c8, 0xe8ecf0]),
      ],
    },
  },
  // ── South of the trail, facing it: fruit, vegetables, fish, num krok (under the tree) ──
  {
    id: 'fruit',
    kind: 'table',
    goods: 'fruit',
    cover: 'parasolRed',
    s: -6.2,
    t: -4.3,
    face: TO_TRAIL_FROM_S,
    w: 3.2,
    d: 2.4,
    seat: { x: 0.4, z: -0.7, pose: 'stool' },
    open: [[0.71, 0.93]],
    who: { sex: 'f', hat: 'palm', seed: 2703, goods: 'fruit' },
    sells: {
      name: { km: 'ផ្លែឈើ', en: 'Fruit' },
      items: [
        item('mango', 'ស្វាយខ្ចីជ្រលក់អំបិលម្ទេស', 'Green mango with chili salt', 2000, 'fruit', [0x9ab848, 0xd02a1e]),
        item('bananas', 'ចេកណាំវ៉ា', 'A hand of bananas', 1500, 'fruit', [0xe8d040, 0xc8c840]),
        item('rambutan', 'សាវម៉ាវ', 'Rambutan', 3000, 'fruit', [0xc8302a, 0x8ab048]),
      ],
    },
  },
  {
    id: 'veg',
    kind: 'ground',
    goods: 'greensG',
    cover: 'umbrella',
    s: -2.5,
    t: -3.7,
    face: TO_TRAIL_FROM_S,
    w: 2.2,
    d: 1.6,
    seat: { x: 0.1, z: -0.55, pose: 'squat' },
    open: [[0.7, 0.88]],
    who: { sex: 'f', hat: 'palm', seed: 2705, goods: 'greens' },
  },
  {
    id: 'fish',
    kind: 'ground',
    goods: 'fishG',
    cover: 'none',
    s: 1.2,
    t: -3.8,
    face: TO_TRAIL_FROM_S + 0.12,
    w: 2.2,
    d: 1.6,
    seat: { x: -0.1, z: -0.55, pose: 'squat' },
    open: [[0.69, 0.84]],
    who: { sex: 'f', hat: 'krama', seed: 2707, goods: 'fish' },
  },
  {
    id: 'krok',
    kind: 'krok',
    goods: 'cakes',
    cover: 'umbrella',
    s: 4.9,
    t: -3.9,
    face: TO_TRAIL_FROM_S - 0.15,
    w: 2.4,
    d: 1.7,
    seat: { x: -0.35, z: -0.5, pose: 'squat' },
    open: [
      [0.72, 0.9],
      [0.05, 0.31],
    ],
    who: { sex: 'f', hat: 'none', seed: 2709, goods: 'sweets' },
    sells: {
      name: { km: 'នំគ្រក់ នំអន្សម', en: 'Num krok and num ansom' },
      items: [
        item('numKrok', 'នំគ្រក់', 'Num krok (a set)', 2000, 'sweet', [0xe8c878, 0xf4f0e0, 0x5a9a3a]),
        item('numAnsom', 'នំអន្សមចេក', 'Num ansom chek', 1500, 'sweet', [0x4a8a34, 0xf4f0e6]),
      ],
    },
  },
];

export const bmStall = (id: string): BmStall => BM_STALLS.find((s) => s.id === id)!;

/** The coconut and sugarcane cart by the sala (`_bhSpots.ts` `CART`): its shop (the seller's hours: people/_sceneBackFolk.ts `Seller`). */
export const CART_SHOP = {
  name: { km: 'ទឹកដូង ទឹកអំពៅ', en: 'Coconuts and sugarcane juice' } as Record<Lang, string>,
  items: [
    item('coconut', 'ដូងខ្ចី', 'Green coconut', 3000, 'coconut', [0x7aa040, 0xf0ecd8]),
    item('caneJuice', 'ទឹកអំពៅ', 'Sugarcane juice', 2000, 'cupDrink', [0xc8d070, 0xf0ece4]),
    item('water', 'ទឹកសុទ្ធ', 'Bottle of water', 1000, 'bottle'),
  ],
  open: [0.8, 0.27] as Window,
};

/** Is a window of the clock open now? */
export function inWin(clock: number, [a, b]: Window): boolean {
  const c = clock - Math.floor(clock);
  return a <= b ? c >= a && c < b : c >= a || c < b;
}

/** Is a stall open at this time of day (any of its windows)? */
export function stallOpen(s: BmStall, clock: number): boolean {
  for (const w of s.open) if (inWin(clock, w)) return true;
  return false;
}

/** The busy morning (dawn to mid-morning): buyers come and go. */
export const BUSY: Window = [0.72, 0.9];
/** The evening: the num krok seller's lamp is lit. */
export const EVENING_LAMP: Window = [0.17, 0.31];
/** The dark before sunrise: the breakfast stall's LED tube is lit. */
export const DAWN_LAMP: Window = [0.66, 0.765];

/** A stall's middle on the map and its heading (map yaw): its build's frame (hamlet/_mkKit.ts `MkBuild.at`). */
export function stallFrame(st: BmStall): { x: number; z: number; yaw: number } {
  return { x: bmX(st.s, st.t), z: bmZ(st.s, st.t), yaw: bmYaw(st.face) };
}

/** A stall's point (stall space: x across, z to its front, as its build) → map (x, z). */
export function stallXZ(st: BmStall, x: number, z: number): [number, number] {
  const f = stallFrame(st);
  const c = Math.cos(f.yaw);
  const n = Math.sin(f.yaw);
  return [f.x + x * c + z * n, f.z - x * n + z * c];
}

/**
 * Where a buyer stands at a stall (map x, z) and the map yaw to face it:
 * in front of its goods (at the breakfast stall: at its serving table, under
 * the tarp).
 */
export function frontXZ(st: BmStall, off = 0): { x: number; z: number; yaw: number } {
  const [x, z] = st.kind === 'breakfast' ? stallXZ(st, BREAKFAST_SERVE.x + off, BREAKFAST_SERVE.z) : stallXZ(st, off, st.d / 2 + (st.kind === 'table' ? 0.75 : 0.7));
  return { x, z, yaw: stallFrame(st).yaw + Math.PI };
}

/** The breakfast stall's serving table (stall space: its middle), and where a buyer stands at it. */
export const BREAKFAST_COUNTER = { x: 0.35, z: -0.05, w: 2.1, d: 0.8, h: 0.85 };
export const BREAKFAST_SERVE = { x: 0.35, z: 0.95 };

// ── The tree, the breakfast tables, the parked bicycles ──────────────────────

/** The big old tree across the trail from the lane's foot (market s, t), its crown's radius and height. */
export const BM_TREE = { s: 1.4, t: -10.6, r: 6.2, h: 8.0 };

/** The breakfast stall's low table beside it, toward the lane (market s, t; a market heading) and its stools (table space: x across, z to its front). */
export const BREAKFAST_TABLE = { s: -3.3, t: 4.3, face: 0.08 };
export const BREAKFAST_STOOLS: readonly [number, number][] = [
  [-0.95, -0.05],
  [0.95, 0.05],
  [0, -0.75],
];
/** A stool of the breakfast table on the map (x, z) and the map yaw of someone sitting on it, facing the table. */
export function breakfastStool(k: number): { x: number; z: number; yaw: number } {
  const t = BREAKFAST_TABLE;
  const yaw = bmYaw(t.face);
  const [sx, sz] = BREAKFAST_STOOLS[k];
  const c = Math.cos(yaw);
  const n = Math.sin(yaw);
  const x = bmX(t.s, t.t) + sx * c + sz * n;
  const z = bmZ(t.s, t.t) - sx * n + sz * c;
  return { x, z, yaw: Math.atan2(bmX(t.s, t.t) - x, bmZ(t.s, t.t) - z) };
}

/** Bicycles and a moto parked by the lane's foot, east of it (market s, t, heading), and whether they are there only while the market is busy. */
export const BM_PARKED: readonly { s: number; t: number; face: number; kind: 'moto' | 'bike'; color: number; busy: boolean }[] = [
  { s: 7.2, t: 4.4, face: 1.3, kind: 'moto', color: 0x8a1e22, busy: true },
  { s: 8.7, t: 4.8, face: 1.2, kind: 'bike', color: 0x2f6a8a, busy: true },
  { s: 9.9, t: 5.0, face: 1.35, kind: 'bike', color: 0x2a2a2a, busy: false },
];

/**
 * Where the forest monk stops on his dawn round, on the trail before the
 * breakfast stall (market s, t; he faces it: a market heading): the
 * breakfast cook and the fruit seller kneel before him and give
 * (people/_sceneBackFolk.ts `Riders`, _sceneBackMarket.ts).
 */
export const MONK_STOP = { s: -5.4, t: 0.3, face: 0 };

// ── Where the buyers walk (market s, t) ──────────────────────────────────────

/** Ways in and out: along the trail west (the monk's hut, the Buddha) and east (Ta Prohm's hills), up the lane to the hamlet. */
export const BM_WAYS = {
  west: [-24, 0.2] as const,
  east: [24, -0.2] as const,
  lane: [-0.1, 16] as const,
  /** On the trail at the lane's foot (the crossroads). */
  cross: [0, 0] as const,
};

/** The juice seller's clock: does his cart sell now (his hours, and not in a storm: `shelter`)? */
export function cartOpen(f: MapFrame, shelter: number): boolean {
  return inWin(f.clock, CART_SHOP.open) && shelter < 0.5;
}
