import { registerEvent, type CalendarEvent } from '../calendar';
import { dayPhaseOf, EVENT_LIVE, EVENT_SPOTS, EVENTS, HELD_DAY, heldLoopsNow, QUIET_DAY, slotOpensAt, SLOTS, type TempleEvent } from '../events';
import { festivalAt, festivalNow } from '../festival/_schedule';
import { BM, BUSY as BH_BUSY, inWin } from '../hamlet/_bhMarketPlan';
import { ALMS as BH_ALMS } from '../hamlet/_bhSpots';
import { BUSY as MK_BUSY, inWindow } from '../hamlet/_mkPlan';
import { MARKET, PADDIES, PATHS, RACE_COURSE, VILLAGE } from '../layout';
import { MONK_AT } from '../people/_sceneBackFolk';
import { within } from '../people/_sceneBackKit';
import { END as APSARA_END, SHOW as APSARA_SHOW, STAGE } from '../people/_sceneApsara';
import { FARM_DARK, farmModeOf } from '../people/_sceneFarm';
import { KITE_FIELD, kitesFlying } from '../people/_sceneKites';
import { ALMS_ROUND } from '../people/_sceneVillage';
import { almsWalkAt } from '../people/_monks';
import { TIME, type MapMoment } from '../time';
import { FV_BOATS } from '../village/_fvPlan';
import { PAGODA } from '../village/_spots';
import { LUNAR, nextLunarSpan, nextNewYear } from './_calendarKhmer';

/**
 * The calendar's events (map/calendar.ts), each with the rule its part plays
 * it by, read from that part (never a copy of its numbers):
 *
 * - festivals: the Water Festival and Khmer New Year (festival/_schedule.ts
 *   `festivalAt`; `fest=` holds one: `shown`), with their next days in real
 *   life (the Khmer calendar, _calendarKhmer.ts);
 * - the day's moments: the monks' dawn chant and the pagoda's dusk drum
 *   (events.ts' hours), the alms rounds (people/_sceneVillage.ts, the forest
 *   monk's in _sceneBackFolk.ts, Angkor Wat's procession up the valley road
 *   in _monks.ts `almsWalkAt`; the sugar-palm village's is roam/_dakBat.ts'
 *   `dakbat-village`), the three morning markets (hamlet/_mkPlan.ts
 *   `BUSY`, _bhMarketPlan.ts `BUSY`, the floating village's boats
 *   village/_fvPlan.ts), the apsara dance (_sceneApsara.ts), the elephants'
 *   bath and the monkeys' crossing (events.ts' daylight: on the held day's
 *   own loop while the clock stands still in the day, `heldDay`);
 * - seasons: the khleng ek over the east fields (_sceneKites.ts), rice
 *   planting and the harvest (_sceneFarm.ts `farmModeOf`, by day).
 *
 * Importing this module registers them (roam/_calendar.ts does).
 */

/** The day's darkness at a clock (main.ts `nightOf`: 0 day … 1 night), for the farmers who are home at night. */
const nightOf = (c: number) => 0.5 - 0.5 * Math.cos(c * Math.PI * 2);
/** Whether the clock `c` is in `[a, a + len)` on the wrapping dial (events.ts `inside`). */
const inside = (c: number, a: number, len: number) => (((c - a) % 1) + 1) % 1 < len;
const slotsOf = (name: TempleEvent) => SLOTS.flatMap((s, i) => (s.name === name ? [i] : []));
const mid = (pts: readonly { x: number; z: number }[]) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, z: pts.reduce((s, p) => s + p.z, 0) / pts.length });

/** An hour's window of events.ts (the dawn chant, the dusk drum): on at a moment. */
function hourRule(name: TempleEvent): (m: MapMoment) => boolean {
  const [i] = slotsOf(name);
  return (m) => inside(m.clock, slotOpensAt(i, m.day), SLOTS[i].len);
}

/**
 * A daylight event of events.ts (the elephants, the monkeys): on at a moment while the clock runs (its window in the
 * daylight of that day; never in a still: `QUIET_DAY`; `event=` holds one on), and on the held day's own loop while
 * the clock stands still in the day (`HELD_DAY` s a loop; `EVENTS.dayPhase` its phase now).
 */
function daylight(name: TempleEvent): Pick<CalendarEvent, 'on' | 'shown' | 'heldDay'> {
  const slots = slotsOf(name);
  const on = (m: MapMoment) => {
    if (QUIET_DAY) return false;
    const ph = dayPhaseOf(m.clock);
    if (Number.isNaN(ph)) return false;
    return slots.some((i) => {
      const at = slotOpensAt(i, m.day);
      return ph >= at && ph < at + SLOTS[i].len;
    });
  };
  return {
    on,
    // (held on by the URL, `event=`; or still going on after its window, the elephants in the river: `EVENT_LIVE`)
    shown: (m) => EVENTS.forced === name || on(m) || !!EVENT_LIVE[name]?.(),
    heldDay() {
      const ph = EVENTS.dayPhase;
      const live = EVENTS.forced === name || !!EVENT_LIVE[name]?.();
      if (QUIET_DAY || Number.isNaN(ph)) return { on: live, next: NaN };
      const day = TIME.moment(TIME.days()).day;
      const loops = heldLoopsNow();
      let next = Infinity;
      for (const i of slots) {
        const at = slotOpensAt(i, day, loops);
        next = Math.min(next, at > ph ? at - ph : 1 - ph + slotOpensAt(i, day, loops + 1));
      }
      return { on: EVENTS.on[name] || live, next: next * HELD_DAY };
    },
  };
}

// ── Festivals ────────────────────────────────────────────────────────────────
registerEvent({
  id: 'water',
  kind: 'festival',
  name: 'festWater',
  note: 'festWaterNote',
  place: 'whenAtLake',
  begins: 'whenWaterBegins',
  // (the race's finish by the village, where the crowd cheers; the floats light the moat too at night)
  where: { x: RACE_COURSE.to[0], z: RACE_COURSE.to[1] },
  on: (m) => festivalAt(m.season, m.day) === 'water',
  shown: (m) => festivalNow(m) === 'water',
  // (its days can overlap the season's window by under a day: finer than a day's hour)
  step: 1 / 48,
  horizon: 400,
  // (the 14th of the waxing moon of Kadeuk to the 1st of the waning)
  real: (from) => nextLunarSpan(from, LUNAR.kadeuk, 14, 1, 1),
});
registerEvent({
  id: 'newyear',
  kind: 'festival',
  name: 'festNewYear',
  note: 'festNewYearNote',
  place: 'whenAtNewYear',
  begins: 'whenNewYearBegins',
  where: { x: VILLAGE.x, z: VILLAGE.z },
  on: (m) => festivalAt(m.season, m.day) === 'newyear',
  shown: (m) => festivalNow(m) === 'newyear',
  step: 1 / 24,
  horizon: 400,
  real: nextNewYear,
});

// ── The day's moments ────────────────────────────────────────────────────────
registerEvent({ id: 'dawnChant', kind: 'daily', name: 'whenChant', note: 'whenChantNote', place: 'whenAtPagoda', begins: 'whenChantBegins', where: { x: PAGODA.x, z: PAGODA.z }, on: hourRule('dawnChant') });
registerEvent({
  id: 'dakbat',
  kind: 'daily',
  name: 'whenAlms',
  note: 'whenAlmsNote',
  place: 'whenAtFloating',
  begins: 'whenAlmsBegins',
  where: { x: ALMS_ROUND.x, z: ALMS_ROUND.z },
  on: (m) => m.clock > ALMS_ROUND.from && m.clock < ALMS_ROUND.to,
});
registerEvent({
  id: 'dakbat-back',
  kind: 'daily',
  name: 'whenAlms',
  note: 'whenAlmsBackNote',
  place: 'jnHamlet',
  begins: 'whenAlmsBackBegins',
  where: { x: BH_ALMS.monk[0], z: BH_ALMS.monk[1] },
  on: (m) => within(m.clock, MONK_AT, 1),
});
// (Angkor Wat's monks walking up the valley road with their bowls in the morning: they take dak bat there, roam/_dakBat.ts)
const ROAD = PATHS.find((p) => p.name === 'valley road')?.points;
const ROAD_MID = ROAD ? { x: ROAD[ROAD.length >> 1][0], z: ROAD[ROAD.length >> 1][1] } : null;
registerEvent({
  id: 'dakbat-aw',
  kind: 'daily',
  name: 'whenAlms',
  note: 'whenAlmsAwNote',
  place: 'whenAtRoadAw',
  begins: 'whenAlmsAwBegins',
  where: ROAD_MID,
  on: (m) => almsWalkAt(m.clock, nightOf(m.clock)),
});
registerEvent({ id: 'market', kind: 'daily', name: 'jnMarket', note: 'whenMarketNote', place: 'evVillage', begins: 'whenMarketBegins', where: { x: MARKET.x, z: MARKET.z }, on: (m) => inWindow(m.clock, MK_BUSY) });
registerEvent({ id: 'market-back', kind: 'daily', name: 'whenMarketBack', note: 'whenMarketBackNote', place: 'jnHamlet', begins: 'whenMarketBackBegins', where: { x: BM.x, z: BM.z }, on: (m) => inWin(m.clock, BH_BUSY) });
registerEvent({
  id: 'market-float',
  kind: 'daily',
  name: 'whenBoats',
  note: 'whenBoatsNote',
  place: 'whenAtFloating',
  begins: 'whenBoatsBegins',
  where: mid(FV_BOATS),
  on: (m) => FV_BOATS.some((b) => inWindow(m.clock, b.open)),
});
registerEvent({
  id: 'elephants',
  kind: 'daily',
  name: 'whenElephants',
  note: 'whenElephantsNote',
  place: 'whenAtRiverGate',
  begins: 'whenElephantsBegins',
  // (where the fauna part found their way down to the river at its build)
  get where() {
    return EVENT_SPOTS.elephantBath ?? null;
  },
  ...daylight('elephantBath'),
});
registerEvent({
  id: 'monkeys',
  kind: 'daily',
  name: 'whenMonkeys',
  note: 'whenMonkeysNote',
  place: 'whenAtValley',
  begins: 'whenMonkeysBegins',
  // (a short window: looked for finely)
  step: 1 / 240,
  near: 160,
  get where() {
    return EVENT_SPOTS.monkeyCrossing ?? null;
  },
  ...daylight('monkeyCrossing'),
});
registerEvent({ id: 'duskDrum', kind: 'daily', name: 'whenDrum', note: 'whenDrumNote', place: 'whenAtPagodaOnly', begins: 'whenDrumBegins', where: { x: PAGODA.x, z: PAGODA.z }, on: hourRule('duskDrum') });
registerEvent({
  id: 'apsara',
  kind: 'daily',
  name: 'whenApsara',
  note: 'whenApsaraNote',
  place: 'whenAtAngkor',
  begins: 'whenApsaraBegins',
  where: { x: STAGE.x, z: STAGE.z },
  on: (m) => m.clock >= APSARA_SHOW && m.clock < APSARA_END,
});

// ── Seasons (by day) ─────────────────────────────────────────────────────────
/** The paddies by the lake, where the farmers work (the first ten: the east ones are the sugar-palm village's). */
const WEST_PADDIES = mid(PADDIES.slice(0, 10));
registerEvent({
  id: 'kites',
  kind: 'season',
  name: 'whenKites',
  note: 'whenKitesNote',
  place: 'whenAtEastFields',
  begins: 'whenKitesBegins',
  where: KITE_FIELD,
  on: (m) => kitesFlying(m.season, m.clock),
  step: 1 / 48,
  horizon: 400,
});
registerEvent({
  id: 'planting',
  kind: 'season',
  name: 'whenPlanting',
  note: 'whenPlantingNote',
  place: 'whenAtPaddies',
  begins: 'whenPlantingBegins',
  where: WEST_PADDIES,
  on: (m) => farmModeOf(m.season) === 'plant' && nightOf(m.clock) <= FARM_DARK,
  step: 1 / 48,
  horizon: 400,
});
registerEvent({
  id: 'harvest',
  kind: 'season',
  name: 'whenHarvest',
  note: 'whenHarvestNote',
  place: 'whenAtPaddies',
  begins: 'whenHarvestBegins',
  where: WEST_PADDIES,
  on: (m) => farmModeOf(m.season) === 'harvest' && nightOf(m.clock) <= FARM_DARK,
  step: 1 / 48,
  horizon: 400,
});
