import { gatherLeft, registerGatherSource, type GatherSpot } from '../build/gather';
import { BAMBOO_CUT, BAMBOO_SIDES, bambooSideAngle } from '../veg/bambooCut';
import { GatherParts } from './_gatherSides';

/**
 * **Cutting bamboo** (ticket AWP-10; the gathering core AWP-9): the jungle's bamboo
 * clumps where he roams (vegetation.ts plants them; veg/bambooCut.ts knows their
 * blocks) are cut with the phkak knife, `HITS` blows a pole, `PIECES` poles a
 * clump, each pole back in `REGROW_DAYS` game days.
 *
 * A pole cut is one side's canes (a third of the clump round its middle,
 * veg/bambooCut.ts `BAMBOO_SIDES`): the side he works from first (`onWork`: the
 * canes before him), then the nearest side still standing (roam/_gatherSides.ts).
 * A cut side shows stubs with pale cut ends and young shoots (ទំពាំង) that grow as
 * the game days pass; when its pole has grown back the side's canes stand whole
 * again (the oldest cut first, as the core gives them back).
 *
 * Saved (progress.ts `gather.bambooSides`: per clump, the sides cut, oldest first;
 * the core keeps how many and when, `gather.spots`). Same source id as AWP-9's
 * proof source (`bamboo`): the saved spots carry on.
 */
const HITS = 4;
const PIECES = BAMBOO_SIDES;
const REGROW_DAYS = 2;
const FOOT = 1.35;
/** The knife lands at knee height on the cane (m). */
const HIT_Y = 0.5;

let spots: GatherSpot[] = [];
let sides: GatherParts | null = null;

/** The clump drawn as the core has it. */
function show(spot: GatherSpot): void {
  if (!sides) return;
  const list = sides.of(spot);
  BAMBOO_CUT.set(spot.id, list.length ? { sides: list, grow: sides.grow(spot, list.length) } : null);
}

/** Register the clumps (roam/_gather.ts `init`, once the map's parts are built: the jungle's). Returns how many. */
export function registerBambooClumps(): number {
  const parts = (sides = new GatherParts('gather.bambooSides', BAMBOO_SIDES, (_s, n) => bambooSideAngle(n)));
  spots = BAMBOO_CUT.clumps().map((c) => ({ id: c.id, material: 'bamboo', x: c.x, z: c.z, r: FOOT, hits: HITS, pieces: PIECES, regrowDays: REGROW_DAYS, hitY: HIT_Y }));
  const byId = new Map(spots.map((s) => [s.id, s]));
  registerGatherSource({
    id: 'bamboo',
    spots: () => spots,
    onTake: (spot) => show(spot),
    onLeft: (spot) => show(spot),
    onWork: (spot, x, z) => parts.from(spot, x, z),
  });
  BAMBOO_CUT.growthFrom((id) => {
    const s = byId.get(id);
    return s ? parts.grow(s, parts.saved(id).length) : null;
  });
  // (the clumps cut in the save, drawn so; a clump grown back while the map was closed drops its saved sides)
  for (const s of spots) if (gatherLeft(s) < s.pieces || parts.saved(s.id).length) show(s);
  return spots.length;
}
