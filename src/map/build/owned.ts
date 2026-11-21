import { ROPE, STAKES } from '../cattle/plan';
import { CATTLE } from '../cattle/state';
import { BIKE_OWN } from '../roam/_bikeOwn';

/**
 * What he owns and leaves standing on his land, kept clear of building (AWP-20; the placing rules: roam/_buildSpots.ts
 * `canBuild`, so pieces and footprint buildings alike), no three.js: his own cows on their stakes, with the rope's
 * reach round each (cattle/plan.ts `STAKES`, `ROPE`), and his own bicycles where he left them (roam/_bikeOwn.ts
 * `BIKE_OWN`; not the one he rides). His ox cart and oxen are build/haul.ts's (`cartBlockWhy`).
 */

/** A cow's room past its rope's reach (m: its body round its middle). */
const COW_ROOM = 0.6;
/** His bicycle's room round where it stands (m: a frame 1.8 m long). */
const BIKE_ROOM = 1.1;

/** Is (x, z), with `r` m round it, on one of his cows' tethers or his parked bicycle? Which ('cow', 'bike'), or null. */
export function ownedBlocks(x: number, z: number, r = 0): 'cow' | 'bike' | null {
  for (const c of CATTLE.herd) {
    const s = STAKES[c.stake];
    if (s && Math.hypot(x - s[0], z - s[1]) < ROPE + COW_ROOM + r) return 'cow';
  }
  for (const b of BIKE_OWN.bikes) if (!b.riding && Math.hypot(x - b.x, z - b.z) < BIKE_ROOM + r) return 'bike';
  return null;
}
