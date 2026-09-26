/**
 * What the player found, kept between visits (localStorage; a versioned
 * key, every access in try / catch: private windows and blocked storage
 * just forget).
 */
export const TREASURE_KEY = 'angkor-map-treasure-v1';

export interface TreasureSave {
  /** Ids of the golden figures found (treasure/_spots.ts). */
  found: string[];
}

export function loadTreasure(): TreasureSave {
  try {
    const raw = JSON.parse(localStorage.getItem(TREASURE_KEY) ?? 'null') as Partial<TreasureSave> | null;
    return { found: Array.isArray(raw?.found) ? raw.found.filter((v): v is string => typeof v === 'string') : [] };
  } catch {
    return { found: [] };
  }
}

export function saveTreasure(s: TreasureSave): void {
  try {
    localStorage.setItem(TREASURE_KEY, JSON.stringify({ found: s.found }));
  } catch {
    /* no storage: kept until the page closes */
  }
}
