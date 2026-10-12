import { EAST_DIR, EAST_N, inWindow, MK } from '../hamlet/_mkPlan';

/**
 * The bicycle shop (ហាងកង់: a repair-and-sale stall, as in any Cambodian market
 * town) at the sugar-palm village's morning market: where everything of it
 * stands, with no three.js, so the stall (roam/_bikeShopStall.ts), its
 * mechanic (people/_sceneBikeShop.ts), the bicycles for sale and the one
 * he buys (roam/_bike.ts), the add-on that sells them (roam/_bikeShop.ts) and
 * the maps (ui/_minimapSpots.ts) read the same numbers.
 *
 * It stands south of the village street's east leg, behind the row of motos
 * and bicycles parked there (hamlet/_mkPlan.ts `PARKED`), on the market's low
 * ground before the land steps up two metres to the fields: its front looks
 * north-north-east across the parked row to the street. Clear of the hall's
 * aisle (its east way out, `aisleE`), the drinks cart and the parking's node
 * (people walk to their motos from the street, north of the row).
 *
 * Its frame (as the market's stalls, `MkBuild.at`): `x, z` its middle, `yaw`
 * the way its front looks; local x across it (+x its west end, toward the
 * market hall; −x its east end, toward the village), +z out to its front. Local
 * (lx, lz) is the map's (x + lx cos yaw + lz sin yaw, z − lx sin yaw + lz cos yaw).
 *
 * Under a faded blue tarp on four bamboo poles: the mechanic's workbench along
 * the back of its west half (a vice, spanners, a tin of grease), his low stool
 * before it and a bicycle upside down on its saddle and bars that he is
 * mending, the basin of water he finds punctures in; inner tubes and tyres
 * hanging from the front pole, rims on the back one, a foot pump and a tall
 * hand pump by the front post; the three bicycles for sale side by side in
 * its east half, pointing out to the street; a painted sign over the front.
 */

/** A point beside the market's east leg (as _mkPlan.ts lays out its parking: `s` m along it from the bend, `off` m to the south). */
const besideEast = (s: number, off: number): [number, number] => [MK.x + EAST_DIR.x * s + EAST_N.x * off, MK.z + EAST_DIR.z * s + EAST_N.z * off];
const [SX, SZ] = besideEast(11.5, 11.5);

/** The stall's middle on the map (m) and the way its front looks (toward the street, from its south side). */
export const BIKE_SHOP = { x: SX, z: SZ, yaw: Math.atan2(-EAST_N.x, -EAST_N.z) } as const;

/** Its ground (local, m): the tarp's poles stand at its corners (a little out). */
export const SHOP_LOT = { x0: -2.6, x1: 2.6, z0: -1.65, z1: 1.75 } as const;

/** The tarp: its width and depth (as `tarp()` lays them over the frame's middle), its front and back edges' heights (m). */
export const SHOP_TARP = { w: 4.8, d: 3, front: 2.95, back: 2.6 } as const;

/** The workbench along the back of the west half (local span, its top's height, m). */
export const SHOP_BENCH = { x0: 0.78, x1: 2.4, z0: -1.45, z1: -0.72, h: 0.95 } as const;

/** The mechanic's low stool (local), the way he faces on it (local radians: 0 = +z, out to the front). */
export const SHOP_STOOL = { x: 1.35, z: -0.12, face: 0 } as const;

/** The bicycle he is mending, upside down on its saddle and bars before his stool (local middle, its length along local x). */
export const SHOP_MENDING = { x: 1.4, z: 0.95, len: 1.9 } as const;

/**
 * The three bicycles for sale in the east half, side by side and slanted out to the front and east (as a shop parks
 * its row, each showing its side to the street): the point on the ground under each one's saddle (local), in the
 * order of `BIKE_KINDS` (roam/_bikeOwn.ts); `SHOP_DISPLAY_TURN` their heading (local radians: 0 = out to the front).
 */
export const SHOP_DISPLAY_TURN = -0.55;
export const SHOP_DISPLAY: readonly (readonly [number, number])[] = [-0.2, -1.05, -1.9].map(
  (x) => [x - Math.sin(SHOP_DISPLAY_TURN) * 0.17, -0.12 - Math.cos(SHOP_DISPLAY_TURN) * 0.17] as const,
);

/** Where the bicycle he buys stands (local): on its stand before the stall's east end, pointing east along the street; its heading (local radians). */
export const SHOP_DELIVER = { x: -1.45, z: 2.95, turn: -Math.PI / 2 } as const;

/** Where the buyer stands (local: before the upturned bicycle, facing the mechanic, local −z) and how near he must be (m). */
export const SHOP_BUY = { x: 1.0, z: 2.55, r: 1.75 } as const;

/** The stall's front (local): standing here counts as at the shop for its words ("closed"). */
export const SHOP_FRONT = { x0: -2.9, x1: 2.9, z0: 1.85, z1: 4.6 } as const;

/** The painted sign standing on the front pole (local x of its middle, its middle's height, how far before the pole, its width and height, m). */
export const SHOP_SIGN = { x: 0.1, y: 3.46, z: 0.2, w: 2.3, h: 0.86 } as const;

/** Open hours (the clock: 0 golden afternoon, 0.25 dusk, 0.5 night, 0.75 dawn): from after sunrise to the late afternoon. */
export const SHOP_HOURS: readonly [number, number] = [0.765, 0.2];

/** Local (lx, lz) → the map's (x, z). */
export function shopToWorld(lx: number, lz: number): [number, number] {
  const s = Math.sin(BIKE_SHOP.yaw);
  const c = Math.cos(BIKE_SHOP.yaw);
  return [BIKE_SHOP.x + lx * c + lz * s, BIKE_SHOP.z - lx * s + lz * c];
}

/** The map's (x, z) → local (lx, lz) (no allocation: into `out`). */
export function shopLocal(x: number, z: number, out: [number, number]): [number, number] {
  const s = Math.sin(BIKE_SHOP.yaw);
  const c = Math.cos(BIKE_SHOP.yaw);
  const dx = x - BIKE_SHOP.x;
  const dz = z - BIKE_SHOP.z;
  out[0] = dx * c - dz * s;
  out[1] = dx * s + dz * c;
  return out;
}

/** A heading in the stall's frame (local radians) → the map's (as `body.yaw`). */
export const shopYaw = (local: number): number => local + BIKE_SHOP.yaw;

const _l: [number, number] = [0, 0];

/** Is the map point (x, z) before the stall (its front strip)? No allocation. */
export function atShopFront(x: number, z: number): boolean {
  const [lx, lz] = shopLocal(x, z, _l);
  const F = SHOP_FRONT;
  return lx > F.x0 && lx < F.x1 && lz > F.z0 && lz < F.z1;
}

const held = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('bikeshopopen');

/** Open at this time of day (`bikeshopopen=all|none` holds it open or shut, as the market's `mkopen=`). */
export function shopOpen(clock: number): boolean {
  if (held === 'all') return true;
  if (held === 'none') return false;
  return inWindow(clock, SHOP_HOURS);
}

/** The id the mechanic and the sale go by (shop.ts `BROWSE`, `SALE`: people/_saleBack.ts). */
export const BIKE_SHOP_ID = 'bike-shop';

/**
 * What the mechanic (people/_sceneBikeShop.ts) and the shop (roam/_bikeShop.ts) share: he writes whether he is there
 * (`here`: shown, in his hours) and on his stool (`atStall`); the shop writes `wanted` (he stands at the stall's front
 * in its hours: the mechanic looks up and stays). `ready`: the people part built him (without it — `people=0` — the
 * shop sells without him).
 */
export const SHOP_MECHANIC = { ready: false, here: false, atStall: false, wanted: false };
