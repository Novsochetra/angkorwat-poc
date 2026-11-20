import type { MapRoam } from '../map/roam/roam';
import { ADDONS, type RoamAddon } from '../map/roam/_addons';
import { RIDES, type Ride } from './protocol';

/**
 * The roaming explorer as the live rooms send him (src/net/client.ts `update`'s `me`): his feet, facing and how he
 * moves (`RIDES`), read from the roaming part each frame with no allocation. In the overview: null (nothing sent).
 *
 * How he moves: the parachute (`glide` mode) is `parachute`, the hang glider (`hang`) `glide`, the boat and the
 * balloon theirs; on foot, a bicycle add-on holding him is `bike`, the hammock `lie`, resting on the ground (J / L)
 * `sit` / `lie`; anything else on foot (the leap's run, the ox, the zip line) `walk`.
 */

const R = (r: Ride) => RIDES.indexOf(r);
const WALK = R('walk');
const BIKE = R('bike');
const GLIDE = R('glide');
const BOAT = R('boat');
const BALLOON = R('balloon');
const PARACHUTE = R('parachute');
const SIT = R('sit');
const LIE = R('lie');

/** The add-ons that change his ride, found once they have registered (they load while the map builds). */
let bike: RoamAddon | null = null;
let hammock: RoamAddon | null = null;
const find = (id: string) => ADDONS.find((a) => a.id === id) ?? null;

const me = { x: 0, y: 0, z: 0, yaw: 0, ride: 0 };

/** His state now (the same object each call), or null in the overview. */
export function readMe(roam: MapRoam | null): typeof me | null {
  if (!roam || !roam.active) return null;
  const p = roam.body.pos;
  me.x = p.x;
  me.y = p.y;
  me.z = p.z;
  me.yaw = roam.body.yaw;
  switch (roam.mode) {
    case 'glide':
      me.ride = PARACHUTE;
      break;
    case 'hang':
      me.ride = GLIDE;
      break;
    case 'boat':
      me.ride = BOAT;
      break;
    case 'balloon':
      me.ride = BALLOON;
      break;
    default: {
      bike ??= find('bike');
      hammock ??= find('hammock');
      const rest = roam.resting;
      me.ride = bike?.holding ? BIKE : hammock?.holding || rest === 'lie' || rest === 'sleep' ? LIE : rest === 'sit' ? SIT : WALK;
    }
  }
  return me;
}
