import { fbm } from '../heightfield';
import { TRAILS } from '../layout';

/**
 * **The bamboo forest** (ព្រៃឫស្សី, ticket AWP-15): where it grows, with no three.js, so the jungle's scatter
 * (veg/scatter.ts keeps its trees out), the forest's planting (veg/bambooForest.ts) and the checks read the same
 * shape.
 *
 * On the flat lowland at the foot of Phnom Kulen, west of the Kulen foot trail and the woodcutters' camp, between
 * the east village road (west), the back trail (north) and the cattle trader's meadow (south): open grass before
 * it, 80 m from his house up the Kulen foot trail. A shallow hollow (2 m down, x 360‥376) runs through its east
 * part. Not over a place, a road, a trail, a paddy, a village, a jungle site, his land or water.
 *
 * - The forest: a blob round (`x`, `z`), `rx` × `rz`, its edge ragged (`edge`: noise on the radius).
 * - A trail into it (layout.ts `TRAILS` "bamboo forest trail": off the Kulen foot trail at 406, −195, west into a
 *   clearing): no clump within `TRAIL_KEEP` m of its line, no leaves over its tread (`TRAIL_OPEN`).
 * - The clearing (`CLEARING`) at the trail's end: the woodcutter's rack where the cut poles dry
 *   (veg/bambooForest.ts), sky over it.
 */
export const BAMBOO_FOREST = { x: 352, z: -189, rx: 34, rz: 26 } as const;

/** The clearing at the trail's end (m): no clump within `r` + its clumps' foot of it, no leaves over `r` − 1. */
export const CLEARING = { x: 343, z: -190, r: 7 } as const;

/** The trail's points (layout.ts `TRAILS` "bamboo forest trail"): off the Kulen foot trail, west into the clearing. */
export const FOREST_TRAIL: readonly (readonly [number, number])[] = TRAILS.find((t) => t.name === 'bamboo forest trail')?.points ?? [];

/** No clump's middle within this of the trail's line (m): its canes stand at most 1 m out, the tread is 3 m wide. */
export const TRAIL_KEEP = 3.8;
/** No leaf within this of the trail's line (m), at any height: a gap in the canopy over the tread (seen from above: the maps). */
export const TRAIL_OPEN = 1.6;

/** How ragged the edge is (a share of the radius, ±). */
const EDGE = 0.2;

/** Distance from (x, z) to the trail's line (m). */
export function trailDistance(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < FOREST_TRAIL.length; i++) {
    const [ax, az] = FOREST_TRAIL[i];
    const [bx, bz] = FOREST_TRAIL[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * u, z - az - dz * u));
  }
  return best;
}

/**
 * How far into the forest (x, z) is: 1 at its middle, 0 at its ragged edge, below 0 outside (a share of the
 * radius). The trail and the clearing are inside it.
 */
export function forestDepth(x: number, z: number): number {
  const { x: cx, z: cz, rx, rz } = BAMBOO_FOREST;
  const d = Math.hypot((x - cx) / rx, (z - cz) / rz);
  const edge = 1 + (fbm(x / 13, z / 13, 717, 2) - 0.5) * 2 * EDGE;
  return 1 - d / edge;
}

/** Is (x, z) in the forest, or within `margin` m of its edge (the jungle's trees keep this far off)? */
export function inBambooForest(x: number, z: number, margin = 0): boolean {
  return forestDepth(x, z) > -margin / Math.min(BAMBOO_FOREST.rx, BAMBOO_FOREST.rz);
}

/** The box round the forest (and its clumps' reach, m). */
export const FOREST_BOX = {
  x0: BAMBOO_FOREST.x - BAMBOO_FOREST.rx * (1 + EDGE) - 5,
  x1: BAMBOO_FOREST.x + BAMBOO_FOREST.rx * (1 + EDGE) + 5,
  z0: BAMBOO_FOREST.z - BAMBOO_FOREST.rz * (1 + EDGE) - 5,
  z1: BAMBOO_FOREST.z + BAMBOO_FOREST.rz * (1 + EDGE) + 5,
} as const;
