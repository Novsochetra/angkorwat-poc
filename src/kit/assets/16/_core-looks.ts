import type { TerraceWeather } from '../../lib/terrace';
import { SANDSTONE } from '../../palette';
import { STONE_FINISH, stoneSurf, type StoneFinish } from '../../surface';
import type { KitShot, KitVariant } from '../../types';

/**
 * The sheet's stone: its lit tops sample #c89a6f–#d5a77b with darker #b58a62
 * blocks among them — the §19.1 cracked (dulled clean) tones and a few of the
 * mossy and broken ones, so it stays the temple's one sandstone. The moss
 * pattern stays light: on the sheet the moss sits on the ledges and in the
 * joints, the stone shows between.
 */
const SHEET_STONE: StoneFinish = {
  palette: [...SANDSTONE.cracked, SANDSTONE.mossy[0], SANDSTONE.mossy[2], SANDSTONE.broken[0], SANDSTONE.broken[2]],
  surf: stoneSurf({ moss: 0.28, lichen: 0.06, stain: 0.12 }),
  wear: 0.06,
};

/**
 * The finishes of the §16 core terraces (lower, middle, upper, platform): the
 * sheet's mossy grey-brown stone with moss on every tread and ledge and grass
 * in the joints, the same stone weathered and broken, and clean (restored).
 */
export const CORE_LOOKS: Record<string, { name: string; finish: StoneFinish; weather: TerraceWeather }> = {
  mossy: { name: 'Mossy', finish: SHEET_STONE, weather: { moss: 0.6, grass: 0.55, streaks: 0.3 } },
  weathered: { name: 'Weathered', finish: STONE_FINISH.weathered, weather: { moss: 0.4, grass: 0.7, streaks: 0.65, missing: 4, cracked: 3, lost: 0.05 } },
  clean: { name: 'Clean', finish: STONE_FINISH.clean, weather: { moss: 0, grass: 0, streaks: 0 } },
};

export const CORE_VARIANTS: KitVariant[] = Object.entries(CORE_LOOKS).map(([id, l]) => ({ id, name: l.name }));

/** The look of a variant id (falls back to the sheet's mossy stone). */
export const coreLook = (id: string) => CORE_LOOKS[id] ?? CORE_LOOKS.mossy;

/** The sheet's Front / Side / Top views (the finishes are on the asset page), then any extra shots. */
export const coreShots = (...extra: KitShot[]): KitShot[] => [{ view: 'front', label: 'Front' }, { view: 'side', label: 'Side' }, { view: 'top', label: 'Top' }, ...extra];
