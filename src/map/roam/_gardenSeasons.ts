import { registerEvent } from '../calendar';
import { GROWN, inFruitMonths, KINDS, stageOf, type PlantKindId } from '../garden/kinds';
import { GARDEN, type Plant } from '../garden/state';
import { HOME_AT } from '../hamlet/_homePlan';
import type { WordKey } from '../ui/lang';
import { registerAddon } from './_addons';

/**
 * His fruit trees' seasons on the calendar of events (map/calendar.ts; the
 * roaming calendar, key 9, lists them under Seasons, says as one begins, puts
 * a gold mark on his house): a tree that fruits only in some months
 * (garden/kinds.ts `fruit.months`: the mango March–May, the jackfruit
 * March–August, the durian May–August, the sugar palm December–May) has its
 * season there once he has one of that kind grown near his house. The rule
 * is the garden's own: on while `inFruitMonths` and a grown, living one of
 * that kind stands in his garden (garden/state.ts `GARDEN`).
 *
 * An event is registered the first time he has one grown (so the calendar
 * lists no season of a tree he does not have), and stays: its rule says off
 * if he has none any more. The kinds that bear all year (the crops, the
 * banana, the papaya, the guava, the coconut) have no season.
 *
 * Words: `garden<Kind>Season`, `…Note`, `…Begins`, `gardenSeasonAt` (ui/lang.ts);
 * pictures: roam/_calendarIcons.ts `EVENT_ART['garden-<kind>']`.
 * Check: `calendar=1&garden=mango:4&season=0.09` (mid-May: on now).
 */

/** The kinds with a season of their own, and their words. */
const SEASONS: readonly { kind: PlantKindId; id: string; name: WordKey; note: WordKey; begins: WordKey }[] = [
  { kind: 'mango', id: 'garden-mango', name: 'gardenMangoSeason', note: 'gardenMangoSeasonNote', begins: 'gardenMangoSeasonBegins' },
  { kind: 'jackfruit', id: 'garden-jackfruit', name: 'gardenJackfruitSeason', note: 'gardenJackfruitSeasonNote', begins: 'gardenJackfruitSeasonBegins' },
  { kind: 'durian', id: 'garden-durian', name: 'gardenDurianSeason', note: 'gardenDurianSeasonNote', begins: 'gardenDurianSeasonBegins' },
  { kind: 'sugarPalm', id: 'garden-sugarpalm', name: 'gardenSugarPalmSeason', note: 'gardenSugarPalmSeasonNote', begins: 'gardenSugarPalmSeasonBegins' },
];

/** Where the season is: his house (the garden round it). */
const WHERE = { x: HOME_AT.x, z: HOME_AT.z } as const;
/** How finely the calendar looks for a season's start (days of the cycle): a month is two, the shortest season six. */
const STEP = 1 / 4;
/** How often the garden is looked at for newly grown trees (s). */
const LOOK = 0.5;

/** Whether he has a grown, living one of each kind at home, as of the garden last seen (its plants, their count, its clock). */
const grown: Partial<Record<PlantKindId, boolean>> = {};
let seenPlants: readonly Plant[] | null = null;
let seenCount = -1;
let seenClock = NaN;
const registered = new Set<string>();
let since = LOOK;

/** Look again only when the garden changed (another list, a plant more or less, the clock moved on): the calendar asks often. */
function fresh(): void {
  const ps = GARDEN.plants;
  if (ps === seenPlants && ps.length === seenCount && GARDEN.clock === seenClock) return;
  seenPlants = ps;
  seenCount = ps.length;
  seenClock = GARDEN.clock;
  for (const s of SEASONS) grown[s.kind] = false;
  for (const p of ps) if (p.at === 'home' && !p.dead && stageOf(KINDS[p.kind], p.age) === GROWN) grown[p.kind] = true;
}

/** Whether a grown one of `kind` stands in his garden now. */
function has(kind: PlantKindId): boolean {
  fresh();
  return grown[kind] === true;
}

/** Register the season of every kind he has grown and has not been registered yet. */
function sync(): void {
  for (const s of SEASONS) {
    if (registered.has(s.id) || !has(s.kind)) continue;
    registered.add(s.id);
    const k = KINDS[s.kind];
    registerEvent({
      id: s.id,
      kind: 'season',
      name: s.name,
      note: s.note,
      begins: s.begins,
      place: 'gardenSeasonAt',
      where: WHERE,
      on: (m) => inFruitMonths(k, m.season) && has(s.kind),
      step: STEP,
    });
  }
}

registerAddon({
  id: 'gardenSeasons',
  init() {
    sync();
  },
  fromUrl() {
    sync();
  },
  frame(f) {
    since += f.dt;
    if (since < LOOK) return;
    since = 0;
    sync();
  },
});
