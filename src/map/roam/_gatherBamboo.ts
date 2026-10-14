import { registerGatherSource, type GatherSpot } from '../build/gather';
import type { MapPart, Subject } from '../types';

/**
 * The proof source of the gathering core (AWP-9): the map's own bamboo clumps
 * (vegetation.ts, the ones where he roams, as its `subjects` list them for the
 * nature book) are cut with the knife. Nothing of the clump changes yet: making
 * the cut canes show and grow back is the bamboo ticket's (AWP-10), which takes
 * this source over (same id, `bamboo`: its spots' saved state carries on).
 *
 * A clump gives `PIECES` poles, `HITS` hits each; each grows back in
 * `REGROW_DAYS` game days. Its canes stand within `FOOT` m of its middle.
 */
const HITS = 4;
const PIECES = 3;
const REGROW_DAYS = 2;
const FOOT = 1.7;
/** The knife lands at knee height on the cane (m). */
const HIT_Y = 0.5;

let spots: GatherSpot[] = [];

/** Register the clumps (roam/_gather.ts `init`, once the map's parts are built). Returns how many. */
export function registerBambooClumps(parts: readonly MapPart[]): number {
  const found: Subject[] = [];
  const veg = parts.find((p) => p.name === 'vegetation');
  try {
    veg?.subjects?.(found);
  } catch (e) {
    console.warn('[gather] bamboo: the clumps could not be read', e);
  }
  const seen = new Set<string>();
  spots = [];
  for (const s of found) {
    if (s.kind !== 'bamboo') continue;
    const id = `bamboo:${Math.round(s.x)},${Math.round(s.z)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    spots.push({ id, material: 'bamboo', x: s.x, z: s.z, r: FOOT, hits: HITS, pieces: PIECES, regrowDays: REGROW_DAYS, hitY: HIT_Y });
  }
  registerGatherSource({ id: 'bamboo', spots: () => spots });
  return spots.length;
}
