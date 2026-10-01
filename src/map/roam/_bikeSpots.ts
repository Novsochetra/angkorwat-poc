import { bmX, bmYaw, bmZ } from '../hamlet/_bhMarketPlan';
import { streetAt } from '../hamlet/_evSpots';
import { EAST_DIR, EAST_N, MK } from '../hamlet/_mkPlan';

/**
 * Where the bicycles to ride stand (roam/_bike.ts), with no three.js: the
 * mini-map's badges (ui/_minimapSpots.ts) read them too. Each is a black
 * Khmer town bicycle on its side stand, parked where people leave theirs:
 *
 * - `wat`: on the forecourt's grass east of the head of the road's stairs, by
 *   the pad's south edge, pointing back to the road (bicycles are hired out by
 *   the real temple's west entrance); clear of the apsara stage, its torches,
 *   dancers and watchers (people/_sceneApsara.ts, west of the road), of the
 *   equinox crowd (people/_sceneEquinox.ts: the monks and the family east of the
 *   road sit 8 m and more north of it) and of the stair and the ways from its
 *   head; from there he can ride round the forecourt and into the courtyards;
 * - `market`: at the end of the row of motos and bicycles parked south of
 *   the morning market's village street (hamlet/_mkPlan.ts `PARKED`);
 * - `village`: at the sugar-palm village's west end, by the street in
 *   front of its first house (n1, which keeps its own bicycles under it:
 *   hamlet/_evSpots.ts), pointing along the street into the village;
 * - `hamlet`: with the bicycles at the foot of the lane behind Angkor Wat,
 *   by the little market (hamlet/_bhMarketPlan.ts `BM_PARKED`).
 *
 * `x, z`: the point on the ground under the saddle (m); `yaw`: the way the
 * bicycle points (radians, toward (sin, cos) in x, z).
 */

export type BikeSpotId = 'bike-wat' | 'bike-market' | 'bike-village' | 'bike-hamlet';

export interface BikeSpot {
  readonly id: BikeSpotId;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  /** Seed of its small differences (what is in the basket, a krama on the rack). */
  readonly seed: number;
  /** It has its own badge on the maps (the village's, 19 m from the market's, shares that one: on the big map they would sit on each other). */
  readonly badge: boolean;
}

/** A point beside the market's east leg, as the market lays out its parking (`s` along it from the bend, `off` to the south). */
const besideEast = (s: number, off: number): [number, number] => [MK.x + EAST_DIR.x * s + EAST_N.x * off, MK.z + EAST_DIR.z * s + EAST_N.z * off];
/** Facing the road from its south side (the market's parked bicycles point so, turned a little). */
const TO_ROAD_S = Math.atan2(-EAST_N.x, -EAST_N.z);

const [marketX, marketZ] = besideEast(19.1, 4.3);
/** By the village street's north edge at `x`, 3.4 m off its middle; pointing along it to the east, turned a little toward it. */
const street = streetAt(369);
const [villageX, villageZ] = [street.x + street.tz * 3.4, street.z - street.tx * 3.4];
const villageYaw = Math.atan2(street.tx, street.tz) - 0.3;

export const BIKE_SPOTS: readonly BikeSpot[] = [
  { id: 'bike-wat', x: 10.2, z: -152.6, yaw: -Math.PI / 2 + 0.15, seed: 1, badge: true },
  { id: 'bike-market', x: marketX, z: marketZ, yaw: TO_ROAD_S + 0.4, seed: 2, badge: true },
  { id: 'bike-village', x: villageX, z: villageZ, yaw: villageYaw, seed: 3, badge: false },
  { id: 'bike-hamlet', x: bmX(11.3, 5.1), z: bmZ(11.3, 5.1), yaw: bmYaw(1.3), seed: 4, badge: true },
];
