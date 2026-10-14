import { GATHER, gatherLeft, gatherTakenAt, registerGatherSource, type GatherSpot } from '../build/gather';
import { progress } from '../progress';
import { BAMBOO_CUT, BAMBOO_SIDES, bambooSideAngle, bambooSideAt, type BambooClump } from '../veg/bambooCut';

/**
 * **Cutting bamboo** (ticket AWP-10; the gathering core AWP-9): the jungle's bamboo
 * clumps where he roams (vegetation.ts plants them; veg/bambooCut.ts knows their
 * blocks) are cut with the phkak knife, `HITS` blows a pole, `PIECES` poles a
 * clump, each pole back in `REGROW_DAYS` game days.
 *
 * A pole cut is one side's canes (a third of the clump round its middle,
 * veg/bambooCut.ts `BAMBOO_SIDES`): the side he works from first (`onWork`: the
 * canes before him), then the nearest side still standing. A cut side shows
 * stubs with pale cut ends and young shoots (ទំពាំង) that grow as the game days
 * pass; when its pole has grown back the side's canes stand whole again (the
 * oldest cut first, as the core gives them back).
 *
 * Saved (progress.ts `gather.bambooSides`: per clump, the sides cut, oldest first;
 * the core keeps how many and when, `gather.spots`). A clump the save says less
 * or more of than the core is made to agree with the core (sides dropped oldest
 * first, or added round from the south); a broken value reads as none.
 * Same source id as AWP-9's proof source (`bamboo`): the saved spots carry on.
 */
const HITS = 4;
const PIECES = BAMBOO_SIDES;
const REGROW_DAYS = 2;
const FOOT = 1.35;
/** The knife lands at knee height on the cane (m). */
const HIT_Y = 0.5;
const KEY = 'gather.bambooSides';

let spots: GatherSpot[] = [];
const clumpOf = new Map<string, BambooClump>();
/** Per clump: the sides cut, oldest first (saved). */
const sides: Record<string, number[]> = {};
/** Per clump: the side he works from now (`onWork`). */
const from = new Map<string, number>();

const isSides = (v: unknown): v is Record<string, number[]> => typeof v === 'object' && v !== null && !Array.isArray(v);
function load(): void {
  for (const k of Object.keys(sides)) delete sides[k];
  let n = 0;
  for (const [id, list] of Object.entries(progress.get(KEY, {}, isSides))) {
    if (++n > 4000 || id.length > 200 || !Array.isArray(list)) continue;
    const ok: number[] = [];
    for (const s of list) if (Number.isInteger(s) && s >= 0 && s < BAMBOO_SIDES && !ok.includes(s)) ok.push(s);
    if (ok.length) sides[id] = ok;
  }
}

function save(): void {
  progress.set(KEY, Object.keys(sides).length ? sides : null);
}

/** The side still standing nearest the one he works from (or the south's), not in `cut`. */
function nextSide(spot: GatherSpot, cut: readonly number[]): number {
  const c = clumpOf.get(spot.id);
  const want = from.get(spot.id) ?? (c ? bambooSideAt(c, c.x, c.z + 1) : 0);
  const a = bambooSideAngle(want);
  let best = -1;
  let bd = Infinity;
  for (let s = 0; s < BAMBOO_SIDES; s++) {
    if (cut.includes(s)) continue;
    const d = Math.abs(Math.atan2(Math.sin(bambooSideAngle(s) - a), Math.cos(bambooSideAngle(s) - a)));
    if (d < bd - 1e-6) {
      bd = d;
      best = s;
    }
  }
  return best;
}

/** The sides cut now, as many as the core says are growing back (saved when they change). */
function sidesOf(spot: GatherSpot): number[] {
  const n = spot.pieces - gatherLeft(spot);
  const had = sides[spot.id] ?? [];
  let list = had.length > n ? had.slice(had.length - n) : had.slice();
  while (list.length < n) {
    const s = nextSide(spot, list);
    if (s < 0) break;
    list = [...list, s];
  }
  if (list.length !== had.length || list.some((s, i) => s !== had[i])) {
    if (list.length) sides[spot.id] = list;
    else delete sides[spot.id];
    save();
  }
  return list;
}

/** How far each cut side has grown back (0‥1), oldest first. */
function growOf(spot: GatherSpot, n: number): number[] {
  const ts = gatherTakenAt(spot);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const at = ts[ts.length - n + i];
    out.push(at === undefined ? 0 : Math.max(0, Math.min(1, (GATHER.clock - at) / spot.regrowDays)));
  }
  return out;
}

/** The clump drawn as the core has it. */
function show(spot: GatherSpot): void {
  const list = sidesOf(spot);
  BAMBOO_CUT.set(spot.id, list.length ? { sides: list, grow: growOf(spot, list.length) } : null);
}

/** Register the clumps (roam/_gather.ts `init`, once the map's parts are built: the jungle's). Returns how many. */
export function registerBambooClumps(): number {
  load();
  spots = [];
  clumpOf.clear();
  for (const c of BAMBOO_CUT.clumps()) {
    spots.push({ id: c.id, material: 'bamboo', x: c.x, z: c.z, r: FOOT, hits: HITS, pieces: PIECES, regrowDays: REGROW_DAYS, hitY: HIT_Y });
    clumpOf.set(c.id, c);
  }
  const byId = new Map(spots.map((s) => [s.id, s]));
  registerGatherSource({
    id: 'bamboo',
    spots: () => spots,
    onTake: (spot) => show(spot),
    onLeft: (spot) => show(spot),
    onWork(spot, x, z) {
      const c = clumpOf.get(spot.id);
      if (c) from.set(spot.id, bambooSideAt(c, x, z));
    },
  });
  BAMBOO_CUT.growthFrom((id) => {
    const s = byId.get(id);
    return s ? growOf(s, (sides[id] ?? []).length) : null;
  });
  // (the clumps cut in the save, drawn so; a clump grown back while the map was closed drops its saved sides)
  for (const s of spots) if (gatherLeft(s) < s.pieces || sides[s.id]) show(s);
  return spots.length;
}
