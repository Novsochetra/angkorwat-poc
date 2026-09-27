import type { EvHome } from '../hamlet/_evSpots';
import type { Cover, Goods } from '../hamlet/_mkPlan';
import type { ShopItem } from '../shop';
import type { Lang } from '../types';
import { JETTY } from './_spots';

/**
 * The floating village's heart and its market (ផ្សារ), where everything
 * stands (world metres; no three.js: the build, village/_fvMarket.ts and
 * _fvVillage.ts, and the people, people/_sceneVillageMarket.ts, read it).
 *
 * A Tonle Sap waterfront market where the two trails meet the shore: the
 * east shore trail coming down from the north is its aisle, and the lane
 * from the trails' end to the jetty's foot its second side; the stalls fill
 * the wedge between them (their fronts to the aisle or the lane), the fish
 * seller squats at the landing by the jetty, the noodle stall stands by
 * the shop (its two tables), the grilled fish on the lane's far side, the
 * drinks cart by the shop's side where the trail comes in through the
 * gate. Women sell from their boats tied along the jetty in the morning
 * (`FV_BOATS`). Round the square
 * under the village tree (the tamarind: the ox cart turns round it, keep
 * clear) nothing solid stands. The village gate stands where the village
 * trail comes down off the dike (`FV_GATE`); a second row of houses on the
 * land side of the east shore trail makes the north street (`FV_HOMES`).
 *
 * Sizes are the people's (1.4 × true size): a table ≈ 1 m, a tarp ≈ 3 m up.
 *
 * Times (`clock`: 0 golden afternoon, 0.25 dusk, 0.5 midnight, 0.75 dawn;
 * a day is 6 minutes in the day cycle): the boats come in at dawn and go at
 * mid-morning, the fish is gone first, the square busiest in the morning,
 * quieter in the afternoon; the grill smokes from noon into the evening,
 * the noodle stall is lit under its bulbs until late.
 */

/** A stall's structure: a table, a raised bamboo platform, goods on the ground, the noodle cart, the grill, the drinks cart. */
export type FvKind = 'table' | 'platform' | 'ground' | 'noodle' | 'grill' | 'drinks';
/** What it sells: the east market's goods (hamlet/_mkGoods.ts), or grilled fish on bamboo sticks. */
export type FvGoods = Goods | 'grilledFish';

export interface FvStall {
  id: string;
  goods: FvGoods;
  kind: FvKind;
  cover: Cover;
  /** Middle (world m) and the way its front faces (yaw: 0 = +z, toward (sin, cos)): buyers come from the front. */
  x: number;
  z: number;
  yaw: number;
  /** Across the front and deep (m). */
  w: number;
  d: number;
  /** The seller (stall space: x across, z to the front; `y` over the ground: a platform) and how she sells. */
  seat: { x: number; z: number; y: number; pose: 'squat' | 'stool' | 'stand' | 'sit' };
  /** Open over the clock from `open[0]` round to `open[1]` (may wrap past 0). */
  open: [number, number];
  /** Dressing: sex, hat, seed (people/_kinds.ts). */
  who: { sex: 'f' | 'm'; hat: 'palm' | 'krama' | 'none'; seed: number };
  /** What the explorer can buy here (roam's buy menu, src/map/shop.ts), and the stall's name for it. */
  shop?: { name: Record<Lang, string>; items: ShopItem[] };
}

/** The trails through the market: the aisle (the east shore trail's last leg) and the lane to the jetty's foot. */
export const AISLE = { from: [-290, 62] as [number, number], to: [-300, 74] as [number, number] };
export const LANE = { from: [-300, 74] as [number, number], to: [JETTY.from[0], JETTY.from[1]] as [number, number] };

/** A point along a way (`s` m from its start) and `off` m to its right (looking along it: + to the right). */
function beside(way: { from: [number, number]; to: [number, number] }, s: number, off: number): [number, number] {
  const [ax, az] = way.from;
  const [bx, bz] = way.to;
  const l = Math.hypot(bx - ax, bz - az);
  const dx = (bx - ax) / l;
  const dz = (bz - az) / l;
  // (right of (dx, dz) in x-east, z-south: (−dz, dx))
  return [ax + dx * s - dz * off, az + dz * s + dx * off];
}
/** The yaw that faces from (x, z) toward (tx, tz). */
const facing = (x: number, z: number, tx: number, tz: number): number => Math.atan2(tx - x, tz - z);

// The aisle runs south-west: its right is the north-west side (the wedge), its left the shop's side.
const [B_X, B_Z] = beside(AISLE, 3.4, 3.0);
const [C_X, C_Z] = beside(AISLE, 7.5, 3.0);
const [D_X, D_Z] = beside(AISLE, 11.0, 2.8);
// The lane runs north-north-west: its right is the wedge (north-east), its left the grill's side.
const [E_X, E_Z] = beside(LANE, 8.4, 2.4);
const [G_X, G_Z] = beside(LANE, 4.4, -4.1);
const [N_X, N_Z] = beside(AISLE, 11.0, -3.2);

const kh = (km: string, en: string): Record<Lang, string> => ({ km, en });

export const FV_STALLS: FvStall[] = [
  // ── The landing, on the jetty foot's south side (the spirit house on its north): the fish straight off the boats, on a sheet under an umbrella ──
  { id: 'fish', goods: 'fishG', kind: 'ground', cover: 'umbrella', x: -307.5, z: 65.1, yaw: facing(-307.5, 65.1, -303, 68.5), w: 2.2, d: 1.6, seat: { x: 0.1, z: -0.55, y: 0, pose: 'squat' }, open: [0.68, 0.9], who: { sex: 'f', hat: 'krama', seed: 3101 } },
  // ── The wedge, fronts to the aisle: prahok and dried fish on a platform, greens, fruit ──
  { id: 'dried', goods: 'dried', kind: 'platform', cover: 'tarpBlue', x: B_X, z: B_Z, yaw: facing(B_X, B_Z, ...beside(AISLE, 3.4, 0)), w: 3.4, d: 2.6, seat: { x: 0.3, z: -0.7, y: 0.5, pose: 'sit' }, open: [0.7, 0.08], who: { sex: 'f', hat: 'none', seed: 3103 } },
  { id: 'greens', goods: 'greens', kind: 'table', cover: 'tarpOrange', x: C_X, z: C_Z, yaw: facing(C_X, C_Z, ...beside(AISLE, 7.5, 0)), w: 3.4, d: 2.6, seat: { x: -0.3, z: -0.8, y: 0, pose: 'stool' }, open: [0.7, 0.96], who: { sex: 'f', hat: 'palm', seed: 3107 } },
  {
    id: 'fruit',
    goods: 'fruit',
    kind: 'table',
    cover: 'parasolRed',
    x: D_X,
    z: D_Z,
    yaw: facing(D_X, D_Z, ...beside(AISLE, 11.0, 0)),
    w: 3.2,
    d: 2.6,
    seat: { x: 0.3, z: -0.8, y: 0, pose: 'stool' },
    open: [0.72, 0.16],
    who: { sex: 'f', hat: 'palm', seed: 3109 },
    shop: {
      name: kh('តូបផ្លែឈើ', 'Fruit stall'),
      items: [
        { id: 'mango', name: kh('ស្វាយខ្ចីជ្រលក់អំបិលម្ទេស', 'Green mango with chili salt'), price: 2000, consume: 'fruit', colors: [0x9ab848, 0xd8402c] },
        { id: 'bananas', name: kh('ចេកណាំវ៉ា', 'Bananas'), price: 1500, consume: 'fruit', colors: [0xe8d040, 0x6a8a3a] },
        { id: 'rambutan', name: kh('សាវម៉ាវ', 'Rambutans'), price: 3000, consume: 'fruit', colors: [0xc8302a, 0x4a8a34] },
      ],
    },
  },
  // ── Back to back with the greens, its front to the lane: Khmer sweets for whoever comes off the jetty ──
  {
    id: 'sweets',
    goods: 'cakes',
    kind: 'table',
    cover: 'parasolGreen',
    x: E_X,
    z: E_Z,
    yaw: facing(E_X, E_Z, ...beside(LANE, 8.4, 0)),
    w: 2.8,
    d: 2.2,
    seat: { x: 0.2, z: -0.75, y: 0, pose: 'stool' },
    open: [0.72, 0.2],
    who: { sex: 'f', hat: 'krama', seed: 3113 },
    shop: {
      name: kh('នំខ្មែរ', 'Khmer sweets'),
      items: [
        { id: 'numKom', name: kh('នំគម', 'Num kom (sticky rice cake)'), price: 1500, consume: 'sweet', colors: [0x4a8a34, 0xf4f0e0] },
        { id: 'numAnsom', name: kh('នំអន្សម', 'Num ansom'), price: 2000, consume: 'sweet', colors: [0x5a9a3a, 0xf4f0e0] },
        { id: 'jelly', name: kh('នំលុត', 'Num lot (jelly)'), price: 1500, consume: 'sweet', colors: [0x6ac050, 0xf08aa8] },
      ],
    },
  },
  // ── The lane's other side: the grill, fish on bamboo sticks over the charcoal (the smoke drifts over the square) ──
  {
    id: 'grill',
    goods: 'grilledFish',
    kind: 'grill',
    cover: 'parasolBlue',
    x: G_X,
    z: G_Z,
    yaw: facing(G_X, G_Z, ...beside(LANE, 4.4, 0)),
    w: 2.6,
    d: 2.2,
    seat: { x: 0.2, z: -0.7, y: 0, pose: 'stand' },
    open: [0.9, 0.34],
    who: { sex: 'm', hat: 'krama', seed: 3117 },
    shop: {
      name: kh('ត្រីអាំង', 'Grilled fish'),
      items: [
        { id: 'treyAng', name: kh('ត្រីអាំង', 'Grilled fish on a stick'), price: 3000, consume: 'skewer', colors: [0x8a6a3a, 0xc8b27a] },
        { id: 'chekAng', name: kh('ចេកអាំង', 'Grilled banana'), price: 1000, consume: 'skewer', colors: [0xc8a040, 0x6a7a3a] },
      ],
    },
  },
  // ── At the shop's front, by its tables: the noodle stall (num banh chok), lit until late ──
  {
    id: 'noodles',
    goods: 'noodles',
    kind: 'noodle',
    cover: 'tarpBlue',
    x: N_X,
    z: N_Z,
    yaw: facing(N_X, N_Z, ...beside(AISLE, 11.0, 0)),
    w: 3.0,
    d: 2.4,
    seat: { x: 0, z: -0.8, y: 0, pose: 'stand' },
    open: [0.7, 0.46],
    who: { sex: 'f', hat: 'none', seed: 3119 },
    shop: {
      name: kh('នំបញ្ចុក', 'Noodle stall'),
      items: [
        { id: 'numBanhChok', name: kh('នំបញ្ចុកសម្លខ្មែរ', 'Num banh chok'), price: 4000, consume: 'noodles', colors: [0xf2eee4, 0xb8b048] },
        { id: 'kuyTeav', name: kh('គុយទាវ', 'Kuy teav (noodle soup)'), price: 5000, consume: 'noodles', colors: [0xf2eee4, 0xc88a3a] },
      ],
    },
  },
  // ── By the shop's side where the village trail comes in through the gate: the drinks cart (iced coffee, sugarcane, coconuts) ──
  {
    id: 'drinks',
    goods: 'drinks',
    kind: 'drinks',
    cover: 'parasolRed',
    x: -290.1,
    z: 77.0,
    yaw: facing(-290.1, 77.0, -287.4, 80.6),
    w: 2.8,
    d: 2.2,
    seat: { x: -0.3, z: -0.75, y: 0, pose: 'stand' },
    open: [0.72, 0.28],
    who: { sex: 'm', hat: 'none', seed: 3121 },
    shop: {
      name: kh('ភេសជ្ជៈ', 'Drinks cart'),
      items: [
        { id: 'icedCoffee', name: kh('កាហ្វេទឹកដោះគោទឹកកក', 'Iced coffee with milk'), price: 3000, consume: 'bagDrink', colors: [0xb8864a, 0xf0ece0] },
        { id: 'cane', name: kh('ទឹកអំពៅ', 'Sugarcane juice'), price: 2500, consume: 'cupDrink', colors: [0xc8d070, 0xf4f2ee] },
        { id: 'coconut', name: kh('ដូងខ្ចី', 'Green coconut'), price: 4000, consume: 'coconut', colors: [0x6a8a3a, 0xf0ece0] },
      ],
    },
  },
];

/** The grocery (the shop on its short posts, village/_spots.ts `SHOP_HOME`): what it sells over its counter. */
export const FV_GROCERY: { name: Record<Lang, string>; items: ShopItem[]; open: [number, number] } = {
  name: kh('ហាងលក់ទំនិញ', 'Village shop'),
  // (from dawn till late in the evening: the grocer is behind her counter)
  open: [0.7, 0.44],
  items: [
    { id: 'water', name: kh('ទឹកសុទ្ធ', 'Bottle of water'), price: 1000, consume: 'bottle' },
    { id: 'icedTea', name: kh('តែទឹកកក', 'Iced tea'), price: 1500, consume: 'cupDrink', colors: [0xc88a3a, 0xf4f2ee] },
    { id: 'cake', name: kh('នំខេក', 'Sponge cake'), price: 1000, consume: 'sweet', colors: [0xe8c060, 0xf0e0b0] },
  ],
};

// ── The boats ────────────────────────────────────────────────────────────────

/** What a boat sells: fruit, greens, fish, or noodle soup cooked on board. */
export type FvBoatGoods = 'fruit' | 'greens' | 'fish' | 'noodles';

export interface FvBoat {
  id: string;
  goods: FvBoatGoods;
  /** Where it lies tied up (world m, on the water) and its heading there (bow: yaw). */
  x: number;
  z: number;
  yaw: number;
  /** Where it comes from over the lake and the turn on the way (world m). */
  from: [number, number];
  via: [number, number];
  /** Tied up over this window of the clock (it paddles in just before, away just after). */
  open: [number, number];
  /** The seller in it. */
  who: { hat: 'palm' | 'krama' | 'none'; seed: number };
  /** Where the buyer stands on the jetty (world m) and the shop, if it sells something to eat. */
  shop?: { name: Record<Lang, string>; items: ShopItem[] };
}

/** A point along the jetty `u` m out from its land end, `off` m to its north-east side (− to the south-west). */
export function onJetty(u: number, off: number): [number, number] {
  const [fx, fz] = JETTY.from;
  const [ux, uz] = JETTY.dir;
  // (north-east of the way out: (−uz, ux))
  return [fx + ux * u - uz * off, fz + uz * u + ux * off];
}
const OUT = Math.atan2(JETTY.dir[0], JETTY.dir[1]);
const [B1X, B1Z] = onJetty(6.0, 2.25);
const [B2X, B2Z] = onJetty(11.0, 2.25);
const [B3X, B3Z] = onJetty(6.2, -2.25);
const [B4X, B4Z] = onJetty(11.2, -2.25);

export const FV_BOATS: FvBoat[] = [
  {
    id: 'boat-fruit',
    goods: 'fruit',
    x: B1X,
    z: B1Z,
    yaw: OUT + Math.PI,
    from: [-321, 30],
    via: onJetty(15, 5),
    open: [0.735, 0.93],
    who: { hat: 'palm', seed: 3131 },
    shop: {
      name: kh('ទូកលក់ផ្លែឈើ', 'Fruit boat'),
      items: [
        { id: 'bananas', name: kh('ចេកណាំវ៉ា', 'Bananas'), price: 1500, consume: 'fruit', colors: [0xe8d040, 0x6a8a3a] },
        { id: 'mango', name: kh('ស្វាយទុំ', 'Ripe mango'), price: 2000, consume: 'fruit', colors: [0xf0b030, 0xe8c040] },
      ],
    },
  },
  { id: 'boat-greens', goods: 'greens', x: B2X, z: B2Z, yaw: OUT + Math.PI + 0.06, from: [-326, 26], via: onJetty(16, 6), open: [0.745, 0.91], who: { hat: 'krama', seed: 3133 } },
  {
    id: 'boat-noodles',
    goods: 'noodles',
    x: B3X,
    z: B3Z,
    yaw: OUT + Math.PI - 0.05,
    from: [-338, 62],
    via: onJetty(14, -5.5),
    open: [0.725, 0.97],
    who: { hat: 'palm', seed: 3137 },
    shop: {
      name: kh('ទូកគុយទាវ', 'Noodle boat'),
      items: [{ id: 'kuyTeav', name: kh('គុយទាវ', 'Kuy teav (noodle soup)'), price: 4000, consume: 'noodles', colors: [0xf2eee4, 0xc88a3a] }],
    },
  },
  { id: 'boat-fish', goods: 'fish', x: B4X, z: B4Z, yaw: OUT + Math.PI + 0.08, from: [-342, 56], via: onJetty(15, -6), open: [0.715, 0.88], who: { hat: 'krama', seed: 3139 } },
];

/** Where a buyer stands on the jetty to buy from boat `b` (world m) and the way he faces it. */
export function boatBuyer(b: FvBoat): { x: number; z: number; yaw: number } {
  const [fx, fz] = JETTY.from;
  const [ux, uz] = JETTY.dir;
  const u = (b.x - fx) * ux + (b.z - fz) * uz;
  const side = (b.x - fx) * -uz + (b.z - fz) * ux > 0 ? 1 : -1;
  const [x, z] = onJetty(u, side * 0.75);
  return { x, z, yaw: facing(x, z, b.x, b.z) };
}

// ── Round the market ─────────────────────────────────────────────────────────

/**
 * The village gate (ខ្លោងទ្វារភូមិ) where the village trail comes down off
 * the dike: two whitewashed pillars under lotus-bud tops, the name board
 * across ("ភូមិបណ្ដែតទឹក"), its face to the dike. `yaw` the way through
 * it into the village; `half` the half-width between the pillars (m).
 */
export const FV_GATE = { x: -287.8, z: 81.2, yaw: facing(-284, 83, -300, 74), half: 2.85 };

/** The market's sign arch over the lane, `t` m along it from the trails' end, its posts `half` m either side of the lane's middle. */
export const FV_ARCH = { t: 6, half: 1.5 };

/** The village tree (a tamarind, _fvVillage.ts): the ox cart turns round it (people/_sceneCart.ts; keep clear within `clear` m). */
export const FV_TREE = { x: -297, z: 81, clear: 6 };

/**
 * The north street: houses on the land side of the east shore trail, their
 * fronts to it and the stilt houses across it (the sugar-palm village's
 * Khmer forms, hamlet/_evHouse.ts), set back and turned each its own way.
 */
export const FV_HOMES: EvHome[] = [
  { id: 'fv-n1', x: -270.4, z: 29.2, facing: facing(-270.4, 29.2, -279, 27.5), form: 'kantaing', w: 7, d: 4.5, v: 2.2, roof: 'tile', walls: 'wood', posts: 'wood', stairX: 1.9, sun: 2, kitchen: -1, lit: true, under: ['hammock', 'traps', 'jars'], spirit: true, hens: true, laundry: true, seed: 41 },
  { id: 'fv-n2', x: -269.9, z: 41.0, facing: facing(-269.9, 41.0, -281, 43.5), form: 'pet', w: 6.5, d: 4.5, v: 2, roof: 'rust', walls: 'blue', posts: 'wood', stairX: -1.8, sun: 0, kitchen: 0, lit: true, tube: true, under: ['kre', 'woodpile', 'coop'], flowers: true, dog: true, seed: 42 },
  { id: 'fv-n3', x: -274.2, z: 51.4, facing: facing(-274.2, 51.4, -285, 56), form: 'dol', w: 6.5, d: 4.5, v: 2, roof: 'thatch', walls: 'wood', posts: 'wood', stairX: 1.8, sun: -1, kitchen: 0, lit: false, under: ['moto', 'jars', 'mortar'], hens: true, seed: 43 },
];

/** Fish drying racks (bamboo tables of split fish in the sun) and the ground drying mats: middle, yaw. */
export const FV_RACKS: { x: number; z: number; yaw: number; mat?: boolean }[] = [
  { x: -276.6, z: 35.2, yaw: 0.1 },
  { x: -277.8, z: 46.6, yaw: -0.2 },
  { x: -286.8, z: 38.5, yaw: 1.45, mat: true },
];
