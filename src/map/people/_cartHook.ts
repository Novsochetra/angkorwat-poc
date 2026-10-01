/**
 * The ox cart (people/_sceneCart.ts) and the ride on its back
 * (roam/_cartRide.ts) share this plain object, so neither imports the
 * other: each step the cart is placed it writes where it is, how fast it
 * goes and lends a function that turns a point of the cart into a point of
 * the map; the ride writes whether he is on it and when the driver should
 * turn round to him. No three.js objects cross. Until the people part has
 * built the cart (or with `people=0`, or the cart hidden far off) `live` is
 * false and the ride offers nothing.
 */

/** A point (m, map): a Vector3 fits. */
export interface CartPoint {
  x: number;
  y: number;
  z: number;
}

/** Who is on the back of the cart (the ride sets it). */
export const RIDER = { none: 0, climbing: 1, riding: 2, hopping: 3 } as const;
export type Rider = (typeof RIDER)[keyof typeof RIDER];

export interface CartHook {
  /** The cart is on the map, placed by its last step (false: not built, or hidden far off). */
  live: boolean;
  /** How far round its loop (m), and how fast it goes along it now (m/s, ≥ 0). */
  s: number;
  speed: number;
  /** Its own walking pace (m/s). */
  pace: number;
  /** Standing for the night by the village shop (the farmer gone in until the morning). */
  parked: boolean;
  /** Heading of the cart and of the oxen (rad: 0 = +z), and how it moves (m/s, map x and z). */
  yaw: number;
  oxYaw: number;
  vx: number;
  vz: number;
  /** The cart's pitch (rad, + its front down) and roll (rad, + its left side up). */
  pitch: number;
  roll: number;
  /** The middle of the axle on the ground and the yoke (m, map). */
  axle: CartPoint;
  yoke: CartPoint;
  /** Scale the cart is drawn at (its space is true size: × this on the map). */
  scale: number;
  /**
   * A point of the cart (its space: true-size metres, feet on y = 0 under the
   * axle, +z towards the oxen, +x its left) on the map now, into `out`; null
   * before the cart is built.
   */
  point: ((x: number, y: number, z: number, out: CartPoint) => CartPoint) | null;
  /** The rider (roam/_cartRide.ts): nobody, climbing on, riding, hopping off. */
  rider: Rider;
  /** Counts up: the driver turns round and welcomes him aboard (`hello`), wishes him well as he hops off (`bye`). */
  hello: number;
  bye: number;
  /** Put on by the URL: the cart readies itself for him at once (the tailboard down), no easing. */
  snap: boolean;
}

export const CART: CartHook = {
  live: false,
  s: 0,
  speed: 0,
  pace: 0.75,
  parked: false,
  yaw: 0,
  oxYaw: 0,
  vx: 0,
  vz: 0,
  pitch: 0,
  roll: 0,
  axle: { x: 0, y: 0, z: 0 },
  yoke: { x: 0, y: 0, z: 0 },
  scale: 1,
  point: null,
  rider: RIDER.none,
  hello: 0,
  bye: 0,
  snap: false,
};
