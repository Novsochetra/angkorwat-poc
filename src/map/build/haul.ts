import { HOME_AT, homeToWorld, homeYaw } from '../hamlet/_homePlan';
import { MAP_BOUNDS } from '../layout';
import { progress } from '../progress';
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
export const CART_AT: CartPlace = saved ? { x: saved[0], z: saved[1], yaw: saved[2] } : { ...CART_HOME };

/** Keep where it stands now (by the house: nothing kept, it is the default). */
export function saveCartAt(): void {
  const home = Math.hypot(CART_AT.x - CART_HOME.x, CART_AT.z - CART_HOME.z) < 0.05;
  progress.set('haul.at', home ? null : [+CART_AT.x.toFixed(2), +CART_AT.z.toFixed(2), +CART_AT.yaw.toFixed(3)]);
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
