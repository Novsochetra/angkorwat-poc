import { MARKET } from '../layout';

/**
 * Where everything of the morning market stands (no three.js: the build,
 * hamlet/_market.ts, and its people, people/_sceneMarket.ts, both read it).
 *
 * The market fills the square where the `east village road` comes down from
 * the north-west and turns east along the village street (layout.ts
 * `MARKET`): the road is its main aisle. In local metres from the square's
 * middle (`MK`: x east, z south, the ground's height read from the field):
 *
 * - the sign arch "ផ្សារ" over the road where it comes in from the north;
 * - two rows of stalls facing each other across the road's north leg
 *   (flowers and offerings, fruit, kramas and sarongs on the west; greens
 *   and herbs on a raised bamboo platform, baskets, mats and palm-leaf hats
 *   on the east), under tarps and market parasols;
 * - the noodle stall (num banh chok) at the inner corner, its low tables
 *   and stools under the big shade tree, the grill by the village street;
 * - the covered hall on the outer side of the bend (a long roof of rusty tin
 *   on wooden posts): fish, dried fish and prahok, palm sugar and rice
 *   facing the square; meat and vegetables on the far side of its aisle;
 * - the drinks stall (a sugarcane press) and the motos and bicycles parked
 *   south of the village street.
 *
 * Sizes are for the map's people, drawn at 1.4 × true size (`PEOPLE_SCALE`):
 * a table is ≈ 1 m high, a tarp ≈ 3 m up.
 *
 * Times (`clock`: 0 golden afternoon, 0.25 dusk, 0.5 midnight, 0.75 dawn):
 * each stall is open over its own window (`open`), so the market fills up
 * before dawn (the fish first), is busiest in the morning, half empty by the
 * afternoon, packed up at dusk; at night only the noodle stall is open.
 */

/** The square's middle on the map (m). */
export const MK = { x: MARKET.x, z: MARKET.z };

/** Local (m from the middle) → map. */
export const mkX = (lx: number): number => MK.x + lx;
export const mkZ = (lz: number): number => MK.z + lz;

/** The road's middle line through the square (local): the north leg (x at z, for z ≤ 0) and the east leg (z at x, for x ≥ 0). */
export const roadX = (z: number): number => -3 + (z + 24) / 8;
export const roadZ = (x: number): number => (12 * x) / 22;
/** The east leg's direction (unit, local) and its normal to the south (the parking side). */
export const EAST_DIR = { x: 22 / Math.hypot(22, 12), z: 12 / Math.hypot(22, 12) };
export const EAST_N = { x: -EAST_DIR.z, z: EAST_DIR.x };

/** What a stall sells (the goods built on it, the seller's calls). */
export type Goods = 'flowers' | 'fruit' | 'cloth' | 'greens' | 'baskets' | 'noodles' | 'grill' | 'drinks' | 'fish' | 'dried' | 'sugar' | 'meat' | 'veg' | 'fishG' | 'fruitG' | 'cakes' | 'greensG';

/**
 * Its structure: a table, a raised bamboo platform (the seller sits on it), goods on a mat on the ground, a rack
 * of hanging cloth, the noodle cart, the grill, the sugarcane cart; `hall`: a platform under the hall's roof;
 * `ground`: a seller squatting on the ground behind basins and baskets on a plastic sheet.
 */
export type StallKind = 'table' | 'platform' | 'mat' | 'rack' | 'noodle' | 'grill' | 'drinks' | 'hall' | 'ground';

/** Its cover: a tarp (faded blue, orange, striped), a market parasol, a small umbrella (a ground seller's), or none (the hall's roof, the tree). */
export type Cover = 'tarpBlue' | 'tarpOrange' | 'tarpStripe' | 'parasolRed' | 'parasolGreen' | 'parasolBlue' | 'umbrella' | 'none';

/** How the seller sits or stands: squatting low, on a low stool, standing, cross-legged on a platform. */
export type SellerPose = 'squat' | 'stool' | 'stand' | 'sit';

export interface Stall {
  id: string;
  goods: Goods;
  kind: StallKind;
  cover: Cover;
  /** Middle (local m) and the way its front faces (yaw: 0 = +z, turning to +x): buyers come from the front. */
  x: number;
  z: number;
  yaw: number;
  /** Width across the front and depth (m). */
  w: number;
  d: number;
  /** The seller: where (stall space: x across, z to the front), how high (m above the ground: a platform), how. */
  seat: { x: number; z: number; y: number; pose: SellerPose };
  /** Open over the clock from `open[0]` round to `open[1]` (the window may wrap past 0). */
  open: [number, number];
  /** Dressing: the seller's sex and hat (people/_kinds.ts), seed. */
  who: { sex: 'f' | 'm'; hat: 'palm' | 'krama' | 'none'; seed: number };
}

const W = Math.PI / 2;
/** Facing the east leg of the road from its north side (the wedge), and from its south side. */
const TO_ROAD_N = Math.atan2(EAST_N.x, EAST_N.z);
const TO_ROAD_S = Math.atan2(-EAST_N.x, -EAST_N.z);

/** A point beside the east leg: `s` m along it from the bend, `off` m off its middle (+ to the south). */
function besideEast(s: number, off: number): [number, number] {
  return [EAST_DIR.x * s + EAST_N.x * off, EAST_DIR.z * s + EAST_N.z * off];
}
const [GX, GZ] = besideEast(15.5, -3.4);
const [DX, DZ] = besideEast(6.6, 3.5);
const [G5X, G5Z] = besideEast(10.6, -3.0);

export const STALLS: Stall[] = [
  // ── The north leg, west side (fronts face east, to the road) ──
  { id: 'flowers', goods: 'flowers', kind: 'table', cover: 'parasolRed', x: roadX(-15.4) - 3.4, z: -15.4, yaw: W, w: 3.4, d: 2.6, seat: { x: 0.3, z: -0.75, y: 0, pose: 'stool' }, open: [0.69, 0.93], who: { sex: 'f', hat: 'none', seed: 2101 } },
  { id: 'fruit', goods: 'fruit', kind: 'table', cover: 'tarpOrange', x: roadX(-10.9) - 3.5, z: -10.9, yaw: W, w: 3.8, d: 2.8, seat: { x: -0.4, z: -0.85, y: 0, pose: 'stool' }, open: [0.72, 0.14], who: { sex: 'f', hat: 'krama', seed: 2103 } },
  { id: 'cloth', goods: 'cloth', kind: 'rack', cover: 'tarpStripe', x: roadX(-6.4) - 3.5, z: -6.4, yaw: W, w: 3.8, d: 2.8, seat: { x: 0.5, z: -0.35, y: 0, pose: 'stand' }, open: [0.76, 0.2], who: { sex: 'f', hat: 'none', seed: 2107 } },
  // ── The north leg, east side (fronts face west) ──
  { id: 'greens', goods: 'greens', kind: 'platform', cover: 'tarpBlue', x: roadX(-15.4) + 3.5, z: -15.4, yaw: -W, w: 3.6, d: 2.8, seat: { x: 0.2, z: -0.75, y: 0.5, pose: 'squat' }, open: [0.7, 0.99], who: { sex: 'f', hat: 'palm', seed: 2109 } },
  { id: 'baskets', goods: 'baskets', kind: 'mat', cover: 'parasolGreen', x: roadX(-10.9) + 3.4, z: -10.9, yaw: -W, w: 3.6, d: 2.8, seat: { x: -0.2, z: -0.95, y: 0, pose: 'squat' }, open: [0.75, 0.12], who: { sex: 'm', hat: 'palm', seed: 2111 } },
  // ── The inner corner: the noodle stall (num banh chok), its tables under the tree; the grill by the street ──
  { id: 'noodles', goods: 'noodles', kind: 'noodle', cover: 'tarpBlue', x: 3.9, z: -4.9, yaw: -W + 0.35, w: 3.2, d: 2.6, seat: { x: 0, z: -0.8, y: 0, pose: 'stand' }, open: [0.7, 0.64], who: { sex: 'f', hat: 'none', seed: 2113 } },
  { id: 'grill', goods: 'grill', kind: 'grill', cover: 'parasolBlue', x: GX, z: GZ, yaw: TO_ROAD_N, w: 2.6, d: 2.2, seat: { x: 0.2, z: -0.7, y: 0, pose: 'stand' }, open: [0.86, 0.3], who: { sex: 'm', hat: 'krama', seed: 2117 } },
  // ── South of the village street: the drinks cart (sugarcane press, coconuts) by the parking ──
  { id: 'drinks', goods: 'drinks', kind: 'drinks', cover: 'parasolRed', x: DX, z: DZ, yaw: TO_ROAD_S, w: 2.8, d: 2.4, seat: { x: -0.3, z: -0.75, y: 0, pose: 'stand' }, open: [0.78, 0.22], who: { sex: 'm', hat: 'none', seed: 2119 } },
  // ── The hall: its north row faces the square; its south row faces the aisle ──
  { id: 'fish', goods: 'fish', kind: 'hall', cover: 'none', x: -12, z: 5.35, yaw: Math.PI, w: 3.8, d: 1.9, seat: { x: 0, z: -0.45, y: 0.5, pose: 'squat' }, open: [0.68, 0.96], who: { sex: 'f', hat: 'krama', seed: 2121 } },
  { id: 'dried', goods: 'dried', kind: 'hall', cover: 'none', x: -7.5, z: 5.35, yaw: Math.PI, w: 3.8, d: 1.9, seat: { x: 0.3, z: -0.45, y: 0.5, pose: 'sit' }, open: [0.7, 0.02], who: { sex: 'f', hat: 'none', seed: 2123 } },
  { id: 'sugar', goods: 'sugar', kind: 'hall', cover: 'none', x: -3, z: 5.35, yaw: Math.PI, w: 3.8, d: 1.9, seat: { x: -0.2, z: -0.45, y: 0.5, pose: 'sit' }, open: [0.71, 0.18], who: { sex: 'f', hat: 'none', seed: 2127 } },
  { id: 'meat', goods: 'meat', kind: 'hall', cover: 'none', x: -11.5, z: 9.65, yaw: Math.PI, w: 3.6, d: 1.9, seat: { x: 0, z: -0.45, y: 0.5, pose: 'stand' }, open: [0.69, 0.98], who: { sex: 'm', hat: 'none', seed: 2129 } },
  { id: 'veg', goods: 'veg', kind: 'hall', cover: 'none', x: -5, z: 9.65, yaw: Math.PI, w: 3.8, d: 1.9, seat: { x: 0.2, z: -0.45, y: 0.5, pose: 'squat' }, open: [0.7, 0.03], who: { sex: 'f', hat: 'palm', seed: 2131 } },
  // ── Sellers on the ground: along the walk in front of the hall, and either side of the village street ──
  { id: 'fishG', goods: 'fishG', kind: 'ground', cover: 'umbrella', x: -12.6, z: 0.2, yaw: 0, w: 2.2, d: 1.6, seat: { x: 0.1, z: -0.55, y: 0, pose: 'squat' }, open: [0.69, 0.93], who: { sex: 'f', hat: 'krama', seed: 2133 } },
  { id: 'cakes', goods: 'cakes', kind: 'ground', cover: 'umbrella', x: -8.8, z: 0.0, yaw: 0, w: 2.2, d: 1.6, seat: { x: -0.1, z: -0.55, y: 0, pose: 'squat' }, open: [0.7, 0.98], who: { sex: 'f', hat: 'none', seed: 2137 } },
  { id: 'fruitG', goods: 'fruitG', kind: 'ground', cover: 'umbrella', x: -5.0, z: -0.3, yaw: 0.3, w: 2.2, d: 1.6, seat: { x: 0.1, z: -0.55, y: 0, pose: 'squat' }, open: [0.73, 0.98], who: { sex: 'f', hat: 'palm', seed: 2139 } },
  { id: 'greensG', goods: 'greensG', kind: 'ground', cover: 'umbrella', x: G5X, z: G5Z, yaw: TO_ROAD_N, w: 2.2, d: 1.6, seat: { x: -0.1, z: -0.55, y: 0, pose: 'squat' }, open: [0.7, 0.95], who: { sex: 'f', hat: 'krama', seed: 2143 } },
];

export const stallById = (id: string): Stall => STALLS.find((s) => s.id === id)!;

/** Is a window of the clock open now (it may wrap past 0)? */
export function inWindow(clock: number, [a, b]: readonly [number, number]): boolean {
  const c = clock - Math.floor(clock);
  return a <= b ? c >= a && c < b : c >= a || c < b;
}

/** The busy morning (dawn to mid-morning), when the square is full. */
export const BUSY: [number, number] = [0.72, 0.95];

/** Stall space → local: a point `(sx, sz)` of stall `s`. */
export function stallPoint(s: Stall, sx: number, sz: number): [number, number] {
  const c = Math.cos(s.yaw);
  const n = Math.sin(s.yaw);
  return [s.x + sx * c + sz * n, s.z - sx * n + sz * c];
}

/** Where a buyer stands at a stall (local) and the way they face (yaw). */
export function frontOf(s: Stall, off = 0): { x: number; z: number; yaw: number } {
  const reach = s.kind === 'hall' ? 0.95 : s.kind === 'noodle' ? 0.75 : 0.7;
  const [x, z] = stallPoint(s, off, s.d / 2 + reach);
  return { x, z, yaw: s.yaw + Math.PI };
}

// ── The covered hall, the sign, the tree, the noodle tables, the parking ──

/** The hall: posts from x0 to x1 (every `bay` m) on two lines (z0, z1); its roof over the posts with an overhang (all local m). */
export const HALL = { x0: -15, x1: 0, z0: 4.2, z1: 10.8, bay: 3.75, eave: 3.4, ridge: 5.0, over: 0.95, overEnd: 0.6 };

/** The sign arch over the road's north leg: its middle (local) and how far its posts stand either side of the road's middle. */
export const SIGN = { x: roadX(-19.6), z: -19.6, half: 3.1, board: 4.7 };

/** The big shade tree at the inner corner (its trunk, local), and its crown's radius. */
export const TREE = { x: 10.2, z: -6.4, r: 5.2 };
/** The neak ta shrine at the tree's foot, facing the square (local; yaw: the way its open front faces). */
export const SHRINE = { x: 8.75, z: -5.55, yaw: -1.2 };

/** The noodle stall's low tables (local middle, yaw) and a stool round each (4 a table: the eaters' seats). */
export const TABLES: { x: number; z: number; yaw: number }[] = [
  { x: 7.4, z: -2.1, yaw: 0.3 },
  { x: 12.8, z: -2.3, yaw: -0.2 },
  { x: 13.6, z: -8.9, yaw: 0.5 },
];
/** The noodle stall's bare bulb, hung from its tarp in front of the cart (stall space: across, to the front). */
export const NOODLE_BULB = { x: 0.95, z: 1.2 };
/** The bare bulb hung from the tree's low limb over the tables (local), lit with the noodle stall's lights. */
export const TABLE_BULB = { x: 10.1, z: -2.9, y: 3.35 };
/** Stools round a table (table space: across, along; the eater faces the table). */
export const STOOL_AT: [number, number][] = [
  [0, -0.95],
  [0, 0.95],
  [-1.25, 0],
  [1.25, 0],
];

/** Motos and bicycles parked south of the village street (local, the way they point). */
export const PARKED: { x: number; z: number; yaw: number; kind: 'moto' | 'bike'; color: number; always?: boolean }[] = [
  { ...pt(besideEast(10.6, 4.9)), yaw: TO_ROAD_S + 0.5, kind: 'moto', color: 0x8a1e22, always: true },
  { ...pt(besideEast(12.4, 5.2)), yaw: TO_ROAD_S + 0.45, kind: 'moto', color: 0x1f3a6a },
  { ...pt(besideEast(14.2, 5.0)), yaw: TO_ROAD_S + 0.55, kind: 'moto', color: 0x2a2a2e, always: true },
  { ...pt(besideEast(15.9, 4.6)), yaw: TO_ROAD_S + 0.4, kind: 'bike', color: 0x2f6a8a },
  { ...pt(besideEast(17.2, 4.4)), yaw: TO_ROAD_S + 0.4, kind: 'bike', color: 0xa83a2a, always: true },
];
function pt([x, z]: [number, number]): { x: number; z: number } {
  return { x, z };
}

// ── Where people walk: a small graph of aisles (local), and the ways in ──

/**
 * Aisle points: the road's north leg (from the arch in), the bend, the
 * east leg out along the village street, the walk along the hall's front,
 * its aisle, the noodle tables, the parking.
 */
export const NODES: Record<string, [number, number]> = {
  north: [roadX(-30), -30],
  arch: [roadX(-18), -18],
  n1: [roadX(-13.2), -13.2],
  n2: [roadX(-8.6), -8.6],
  n3: [roadX(-3.6), -3.6],
  bend: [0.6, 0.9],
  front0: [-1.6, 2.7],
  front1: [-7.4, 2.6],
  front2: [-13.6, 2.6],
  aisleW: [-16.6, 7.5],
  aisle1: [-11.5, 7.5],
  aisle2: [-5, 7.5],
  aisleE: [1.7, 7.5],
  e1: besideEast(6.2, 0.2),
  e2: besideEast(12.5, 0.3),
  east: besideEast(30, 0),
  tables: [9.7, -3.4],
  parking: besideEast(12.8, 2.6),
};

export const EDGES: [string, string][] = [
  ['north', 'arch'],
  ['arch', 'n1'],
  ['n1', 'n2'],
  ['n2', 'n3'],
  ['n3', 'bend'],
  ['bend', 'front0'],
  ['front0', 'front1'],
  ['front1', 'front2'],
  ['front2', 'aisleW'],
  ['aisleW', 'aisle1'],
  ['aisle1', 'aisle2'],
  ['aisle2', 'aisleE'],
  ['aisleE', 'e1'],
  ['bend', 'e1'],
  ['e1', 'e2'],
  ['e2', 'east'],
  ['n3', 'tables'],
  ['bend', 'tables'],
  ['e1', 'parking'],
  ['e2', 'parking'],
];

/** The aisle point each stall's front is reached from. */
export const STALL_NODE: Record<string, string> = {
  flowers: 'n1',
  greens: 'n1',
  fruit: 'n2',
  baskets: 'n2',
  cloth: 'n3',
  noodles: 'n3',
  grill: 'e2',
  drinks: 'e1',
  fish: 'front2',
  dried: 'front1',
  sugar: 'front0',
  meat: 'aisle1',
  veg: 'aisle2',
  fishG: 'front2',
  cakes: 'front1',
  fruitG: 'front0',
  greensG: 'e1',
};

/** Shortest walks between aisle points (node names in order), from the graph above. */
export function aisleRoute(from: string, to: string): string[] {
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const open = new Set<string>([from]);
  while (open.size) {
    let best = '';
    let bd = Infinity;
    for (const n of open) if ((dist.get(n) ?? Infinity) < bd) [best, bd] = [n, dist.get(n)!];
    open.delete(best);
    if (best === to) break;
    for (const [a, b] of EDGES) {
      const next = a === best ? b : b === best ? a : '';
      if (!next) continue;
      const [ax, az] = NODES[best];
      const [bx, bz] = NODES[next];
      const d = bd + Math.hypot(bx - ax, bz - az);
      if (d < (dist.get(next) ?? Infinity)) {
        dist.set(next, d);
        prev.set(next, best);
        open.add(next);
      }
    }
  }
  const path = [to];
  while (path[0] !== from) {
    const p = prev.get(path[0]);
    if (!p) return [from, to];
    path.unshift(p);
  }
  return path;
}
