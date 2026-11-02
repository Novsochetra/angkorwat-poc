import { HOME_AT, homeToWorld, homeYaw } from '../hamlet/_homePlan';
import { MAP_BOUNDS } from '../layout';
import { progress } from '../progress';
import { ROAM_SCALE } from '../roam/types';
import { createStock, type Bag } from './materials';

/**
 * **His ox cart** (រទេះគោ, ticket AWP-14; the add-on `haul`, roam/_haul.ts):
 * what it carries and where it stands, with no three.js, so the build checks,
 * the explorer menu or a later ticket can read them without loading the add-on.
 *
 * - **The load** (`CART_LOAD`): a stock of materials (build/materials.ts
 *   `createStock`) up to `CART_LIMIT` in weight, five times what he carries on
 *   foot. He loads his bag into it at its tail; at home he unloads it into his
 *   home store (`STORE`). Saved as `haul.load` (`{ log: 5, bamboo: 10 }`): on
 *   load a broken count is dropped and a load over the limit cut down to it,
 *   the heaviest first (as the bag's).
 * - **Where it stands** (`CART_AT`: the ground under the middle of its axle, and
 *   its heading, rad, 0 = +z): by his house (`CART_HOME`) until he leads it away;
 *   wherever he lets go of the rope after that. Saved as `haul.at` (`[x, z,
 *   yaw]`); a broken one (not three numbers, off the map) is forgotten and the
 *   cart stands by the house again. The add-on checks a saved place against the
 *   land too (water, off the roaming area: back by the house).
 *
 * - **Where it stands, for the others** (`cartBlocks`): the cart's box and its
 *   oxen's (`CART_BOX`, `OXEN_BOX`) where it stands now and at its place by the
 *   house, so the build ghost (roam/_buildSpots.ts) and planting
 *   (roam/_gardenSpots.ts) never put a piece or a plant on it or box it in.
 *
 * Shots and `progress=0` save nothing.
 */

/**
 * The cart carries this much weight: five of his bag loads (`CARRY_LIMIT` 12). The biggest piece he builds, the
 * cattle pen, takes 44 (5 logs, 10 bamboo poles, 4 bundles of thatch): one cart load brings it home with room to
 * spare. (A real ox cart takes several hundred kilos; the game's weights are only how much room a thing takes.)
 */
export const CART_LIMIT = 60;

/** What the cart carries (saved: `haul.load`). */
export const CART_LOAD: Bag = createStock('haul.load', CART_LIMIT);

/** A place for the cart: the ground under its axle's middle (m) and its heading (rad, 0 = +z). */
export interface CartPlace {
  x: number;
  z: number;
  yaw: number;
}

/**
 * Its place by his house: on the house's east side (the side away from the stair and the grandmother's yard),
 * beside its back half, its oxen toward the mountain like the house, the tail to the back yard: out of the
 * stair's, the dog's and the hammock's way, clear of the stream's bank (house frame: hamlet/_homePlan.ts).
 */
export const CART_HOME: Readonly<CartPlace> = (() => {
  const [x, z] = homeToWorld(-8, -3);
  return { x, z, yaw: homeYaw(0) };
})();

/** From the axle to the yoke on the map (m): people/_sceneCart.ts `REACH` (3.55 m, true size) at the people's scale. */
export const CART_YOKE = 3.55 * ROAM_SCALE;
/**
 * The cart and its oxen as boxes on the map (m: along its heading from the axle / from the yoke, half across): what
 * he keeps out of on foot, and what a piece or a plant may not stand on. The cart's from its let-down tailboard to
 * its pole, the oxen's from their rumps to their noses.
 */
export const CART_BOX = { back: -1.75, front: 2.7, half: 1.25 } as const;
export const OXEN_BOX = { back: -2.45, front: 1.45, half: 1.05 } as const;

/** What the others may ask of it now (roam/_haul.ts keeps it): he leads it (it moves; no badge on the maps). */
export const CART_STATE = { leading: false };

/** Wrap a heading into −π‥π (a broken save's 1e300 included: then 0). */
export const wrapYaw = (a: number): number => (Number.isFinite(a) && Math.abs(a) < 1e9 ? Math.atan2(Math.sin(a), Math.cos(a)) : 0);

const isPlace = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) &&
  v.length === 3 &&
  v.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
  v[0] >= MAP_BOUNDS.x0 &&
  v[0] <= MAP_BOUNDS.x1 &&
  v[1] >= MAP_BOUNDS.z0 &&
  v[1] <= MAP_BOUNDS.z1;

const saved = progress.get<[number, number, number] | null>('haul.at', null, (v): v is [number, number, number] => isPlace(v));

/** Where the cart stands now (the add-on moves it while he leads it, and saves it when he lets go). */
export const CART_AT: CartPlace = saved ? { x: saved[0], z: saved[1], yaw: wrapYaw(saved[2]) } : { ...CART_HOME };

/** Keep where it stands now (by the house: nothing kept, it is the default). */
export function saveCartAt(): void {
  const home = Math.hypot(CART_AT.x - CART_HOME.x, CART_AT.z - CART_HOME.z) < 0.05;
  // (exactly where it stands, not rounded: a place at the edge of fitting, rounded, might not fit, and a reload would move it)
  progress.set('haul.at', home ? null : [CART_AT.x, CART_AT.z, wrapYaw(CART_AT.yaw)]);
}

/** Put it back by his house (a saved place that is no good any more). */
export function cartHome(): void {
  CART_AT.x = CART_HOME.x;
  CART_AT.z = CART_HOME.z;
  CART_AT.yaw = CART_HOME.yaw;
  saveCartAt();
}

/** How far (m) the cart's place is from his house's middle. */
export const cartFromHome = (): number => Math.hypot(CART_AT.x - HOME_AT.x, CART_AT.z - HOME_AT.z);

/** Does the disc (x, z, r) meet the cart's box or its oxen's, the cart standing at `at` (its oxen straight ahead)? */
function hits(at: Readonly<CartPlace>, x: number, z: number, r: number): boolean {
  const fx = Math.sin(at.yaw);
  const fz = Math.cos(at.yaw);
  for (let k = 0; k < 2; k++) {
    const b = k === 0 ? CART_BOX : OXEN_BOX;
    const ox = at.x + (k === 0 ? 0 : fx * CART_YOKE);
    const oz = at.z + (k === 0 ? 0 : fz * CART_YOKE);
    const dx = x - ox;
    const dz = z - oz;
    const a = dx * fx + dz * fz;
    const c = dx * fz - dz * fx;
    const oa = Math.max(b.back - a, a - b.front, 0);
    const oc = Math.max(Math.abs(c) - b.half, 0);
    if (oa * oa + oc * oc < r * r || (oa === 0 && oc === 0)) return true;
  }
  return false;
}

/**
 * Is (x, z), or a disc of radius `r` round it, on the ox cart or its oxen, where they stand now or at their place by
 * the house (kept for them while they are away: the cart goes back there)? For the build ghost, planting, a
 * footprint: nothing may stand on the cart nor box it in.
 */
export const cartBlocks = (x: number, z: number, r = 0): boolean => hits(CART_AT, x, z, r) || hits(CART_HOME, x, z, r);

/**
 * Is (x, z), or a disc of radius `r` round it, in the ox cart or its oxen where they stand now (not their place by the
 * house)? For what moves: the bicycle, the ridden cow, his cattle, the dog keep out of it.
 */
export const cartBodyBlocks = (x: number, z: number, r = 0): boolean => hits(CART_AT, x, z, r);

/** As `cartBlocks`, and which: the cart itself (`here`), or its place by the house while it is away (`place`); null: neither. */
export const cartBlockWhy = (x: number, z: number, r = 0): 'here' | 'place' | null => (hits(CART_AT, x, z, r) ? 'here' : hits(CART_HOME, x, z, r) ? 'place' : null);

/** The cart stands away from its place by the house and he is not leading it (its badge on the maps). */
export const cartAway = (): boolean => !CART_STATE.leading && Math.hypot(CART_AT.x - CART_HOME.x, CART_AT.z - CART_HOME.z) > 4;
