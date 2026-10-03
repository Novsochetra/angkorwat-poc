/**
 * What the player found, kept between visits (localStorage; a versioned
 * key, every access in try / catch: private windows and blocked storage
 * just forget). Also the figure he follows from its list of clues (its
 * search area on the maps). A save from before the list (`found` only)
 * loads as it was, following none.
 */
export const TREASURE_KEY = 'angkor-map-treasure-v1';

export interface TreasureSave {
  /** Ids of the golden figures found (treasure/_spots.ts). */
  found: string[];
  /** The one whose search area is on the maps (_list.ts "Show on map"), or null. */
  tracked: string | null;
}

export function loadTreasure(): TreasureSave {
  try {
    const raw = JSON.parse(localStorage.getItem(TREASURE_KEY) ?? 'null') as Partial<TreasureSave> | null;
    return {
      found: Array.isArray(raw?.found) ? raw.found.filter((v): v is string => typeof v === 'string') : [],
      tracked: typeof raw?.tracked === 'string' ? raw.tracked : null,
    };
  } catch {
    return { found: [], tracked: null };
  }
}

export function saveTreasure(s: TreasureSave): void {
  try {
    localStorage.setItem(TREASURE_KEY, JSON.stringify({ found: s.found, tracked: s.tracked }));
  } catch {
    /* no storage: kept until the page closes */
  }
}
