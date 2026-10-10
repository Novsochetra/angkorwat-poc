import { inWindow } from './_mkPlan';

/**
 * The seedling nursery (កន្លែងលក់កូនឈើ) by the Kulen foot trail, on the way
 * from the sugar-palm village's street (and its morning market) up to his
 * stilt house: where everything of it stands, with no three.js, so its build
 * (hamlet/_nursery.ts), its seller (people/_sceneNursery.ts), the roaming
 * add-on that buys and sells there (roam/_gardenShop*.ts) and the maps
 * (ui/_minimapSpots.ts) read the same numbers.
 *
 * It stands west of the trail, between the village's tall sugar palm by the
 * trail (404.5, −87) and its mango (403.5, −98), the straw stack and the
 * cattle pen behind it: walking up the trail from the street, it is on the
 * left, a minute before his house (17 m on, across the trail).
 *
 * Its frame (as the market's stalls, `MkBuild.at`): `x, z` the middle of its
 * ground, `yaw` the way its front looks (east, to the trail); local x along
 * the trail (+x north), +z out to the front. Local (lx, lz) is the map's
 * (x + lz, z − lx).
 *
 * The rows of seedlings in their black bags run front to back in three beds
 * under the shade net, with aisles between; the young trees stand in big
 * bags along the north side, more seedlings set out on the ground before
 * them by the trail; the wooden table with the seed basket is at the front,
 * half under the net, the seller's stool behind it; the painted sign on two
 * posts at the north front corner, side-on to the trail, facing the street
 * (painted on both faces: read from his house too).
 */
export const NURSERY = { x: 407, z: -91.7, yaw: Math.PI / 2 } as const;

/** Its ground (local, m): what trees keep off and what the garden may not be planted on. */
export const NURSERY_LOT = { x0: -3.2, x1: 4.6, z0: -2.8, z1: 2.9 } as const;

/** The shade net: its posts (local x, z), its height at the front and back edges (m). */
export const NURSERY_NET = { xs: [-2.8, 0, 2.8] as readonly number[], z0: -2.5, z1: 1.85, front: 2.5, back: 2.2 } as const;

/** The beds of seedlings in bags: each bed's middle (local x), its half width; they run from `z0` to `z1`. */
export const NURSERY_BEDS = { xs: [-2.2, -0.85, 0.5] as readonly number[], half: 0.42, z0: -2.15, z1: 0.55 } as const;

/** The aisles between the beds (local x), where she walks to water them. */
export const NURSERY_AISLES: readonly number[] = [-1.525, -0.175];

/** The young trees in big bags along the north side (local x, z, height m), and two taller outside the net. */
export const NURSERY_TREES: readonly (readonly [number, number, number])[] = [
  [1.45, -2.0, 1.7],
  [2.25, -2.05, 2.05],
  [1.5, -1.05, 1.35],
  [2.3, -0.95, 1.85],
  [1.5, -0.1, 1.15],
  [2.3, 0.05, 1.55],
  [3.45, -1.6, 2.85],
  [3.5, -0.2, 2.45],
];

/** The table at the front: its span (local) and top's height (m). */
export const NURSERY_TABLE = { x0: -1.5, x1: 0.45, z0: 1.55, z1: 2.25, h: 0.78 } as const;

/** Her low stool behind the table (local), the way she faces on it (local radians: 0 = +z, the front: across the table to the trail). */
export const NURSERY_STOOL = { x: -0.55, z: 0.98, face: 0 } as const;

/** Her watering can's place on the ground by the stool (local), while she sits. */
export const NURSERY_CAN = { x: 0.35, z: 0.92 } as const;

/** The painted sign: its posts' middle (local), its turn (local radians), its board's width (m). */
export const NURSERY_SIGN = { x: 4.05, z: 2.2, turn: -Math.PI / 2 + 0.35, w: 2.2 } as const;

/** Where the buyer stands (local, before the table, facing it: local −z) and how near he must be (m). */
export const NURSERY_BUY = { x: -0.55, z: 3.4, r: 1.7 } as const;

/** Where she walks off to (and in from) out of hours: down the trail to the village street (map m). */
export const NURSERY_AWAY: readonly (readonly [number, number])[] = [
  [410.6, -88],
  [410.2, -76],
  [409.5, -66],
];

/** Open hours (the clock: 0 golden afternoon, 0.25 dusk, 0.5 night, 0.75 dawn): from sunrise to the evening. */
export const NURSERY_HOURS: readonly [number, number] = [0.74, 0.17];

/** Local (lx, lz) → the map's (x, z). */
export function nurseryToWorld(lx: number, lz: number): [number, number] {
  const s = Math.sin(NURSERY.yaw);
  const c = Math.cos(NURSERY.yaw);
  return [NURSERY.x + lx * c + lz * s, NURSERY.z - lx * s + lz * c];
}

/** The map's (x, z) → local (lx, lz). */
export function nurseryLocal(x: number, z: number): [number, number] {
  const s = Math.sin(NURSERY.yaw);
  const c = Math.cos(NURSERY.yaw);
  const dx = x - NURSERY.x;
  const dz = z - NURSERY.z;
  return [dx * c - dz * s, dx * s + dz * c];
}

/** A heading in the nursery's frame (local radians) → the map's (as `body.yaw`). */
export const nurseryYaw = (local: number): number => local + NURSERY.yaw;

/** Is the map point (x, z) on the nursery's ground (`margin` m out from it)? (The garden is not planted there.) */
export function onNurseryLot(x: number, z: number, margin = 0): boolean {
  const [lx, lz] = nurseryLocal(x, z);
  const L = NURSERY_LOT;
  return lx > L.x0 - margin && lx < L.x1 + margin && lz > L.z0 - margin && lz < L.z1 + margin;
}

const held = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('nursopen');

/** Open at this time of day (`nursopen=all|none` holds it open or shut, as the market's `mkopen=`). */
export function nurseryOpen(clock: number): boolean {
  if (held === 'all') return true;
  if (held === 'none') return false;
  return inWindow(clock, NURSERY_HOURS);
}

/** The id the seller and the sale go by (shop.ts `BROWSE`, `SALE`: people/_saleBack.ts). */
export const NURSERY_SHOP = 'garden-nursery';

/** The stall's front (local): where the explorer counts as at the nursery for its words ("closed", "she's coming"). */
export const NURSERY_FRONT = { x0: -3.4, x1: 4.6, z0: 2.3, z1: 6.4 } as const;

/** Is the map point (x, z) before the stall (its front strip, out to the trail's far side)? No allocation. */
export function atNurseryFront(x: number, z: number): boolean {
  const s = Math.sin(NURSERY.yaw);
  const c = Math.cos(NURSERY.yaw);
  const dx = x - NURSERY.x;
  const dz = z - NURSERY.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const F = NURSERY_FRONT;
  return lx > F.x0 && lx < F.x1 && lz > F.z0 && lz < F.z1;
}

/**
 * What the seller (people/_sceneNursery.ts) and the shop (roam/_gardenShop.ts) share: she writes whether she is
 * there at all (`here`: shown, in her hours) and sitting at her table (`atTable`: he can buy); the shop writes
 * `wanted` (he stands at the stall's front, in her hours: she leaves off watering, or hurries in, and comes back to
 * her table). `ready`: the people part built her (without it — `people=0` — the shop sells without her).
 */
export const NURSERY_SELLER = { ready: false, here: false, atTable: false, wanted: false };
