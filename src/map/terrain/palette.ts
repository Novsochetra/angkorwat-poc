/**
 * Terrain colours (sRGB albedo), set from the concept art
 * (assets/world-map-selection-screen/, sampled with PIL): the cliffs are warm
 * sandstone in ochre, orange-brown and red-brown bands (lit faces #e19057 /
 * #ca8152 / #b1724d, shaded #5e4b45), cracks cool and dark (#3e4050), the
 * foot of the cliffs darker and mossy; grass tops a yellow green in the sun
 * (#c9b433 lit, #4b4a18 in shade); banks pale sand with dark wet rock at the
 * water. The light (atmosphere.ts) is warm, so these are the colours under a
 * white light: judge them by their relationships, not their values. Seen
 * whole, the concept's cliffs are a muted warm grey-brown (saturation
 * 0.1–0.5, darker than the grass tops) that the low sun turns orange, so the
 * strata stay fairly muted here.
 */

/** Rock strata, one list of close tones per kind of band. */
export const STRATA_KINDS = {
  ochre: [0xae8a64, 0xa28060, 0xb8946c, 0xa6845f],
  rust: [0xa57656, 0x986c50, 0xae7f5d, 0x9d7052],
  redBrown: [0x93614e, 0x875a49, 0x9c6853, 0x8e5d4b],
  umber: [0x74604f, 0x6b5849, 0x7d6855, 0x715d4d],
  pale: [0xbca184, 0xb0967a, 0xc5ab8d, 0xb69b7f],
} as const;
export type StrataKind = keyof typeof STRATA_KINDS;
/** How often each kind of band comes up (weights). */
export const STRATA_WEIGHTS: [StrataKind, number][] = [
  ['ochre', 0.32],
  ['rust', 0.24],
  ['pale', 0.2],
  ['redBrown', 0.14],
  ['umber', 0.1],
];

/** Foot of the cliffs: cooler, greyer brown. */
export const FOOT = [0x5a4f47, 0x534941, 0x62574e, 0x574c44];
/** Moss on the rock near the foot and in the damp. */
export const MOSS_ROCK = [0x56623a, 0x4d5934, 0x5f6c40, 0x525e37];
/** Wet rock at the waterline and behind the falls. */
export const WET = [0x3c3833, 0x35322e, 0x44403a, 0x3a3935];
/** Greenery hanging over the lips and down the faces (mapGrass family). */
export const VINE = [0x3b6428, 0x44702c, 0x335a24, 0x4e7a31, 0x3f6a2a];
/** Grass curling over a lip (the first metres under a grass top). */
export const LIP = [0x557f2e, 0x4c7629, 0x5f8a33, 0x4a6f2a];

/** Tops. */
export const GRASS = [0x6e9a38, 0x689534, 0x75a03c, 0x639031, 0x7aa440];
/** Sunny, drier patches of grass. */
export const GRASS_DRY = [0x8ba445, 0x85a042, 0x92aa4a, 0x7f9b3f];
/** Lush, dark patches of grass. */
export const GRASS_DARK = [0x56832f, 0x517e2d, 0x5b8832, 0x4c792b];
export const ROCK_TOP = [0xaa8660, 0x9e7b57, 0xb5926b, 0xa3805b];
export const DIRT = [0x946c45, 0x88633f, 0x9e7750];
/**
 * A jungle trail's tread: worn earth close to the dry grass beside it, some
 * grass left on it, so from above it reads as a faint game path.
 */
export const TRAIL = [0x85714a, 0x7d6a44, 0x8b774f, 0x806d47];
/** A rice paddy's plot: wet mud with young rice (the paddies part lays its water and rice over it). */
export const PADDY = [0x6b6a3e, 0x646339, 0x737244, 0x5f5f38];
/** Under the road (the road pass paves it). */
export const PATH = [0xa6825a, 0x997652, 0xb08c63];
/** Bare ground on a landmark's pad (the rest of the pad is dry grass). */
export const PAD = [0x9c8466, 0x917a5e, 0xa68e6f];
/** River banks: pale sand and pebbles. */
export const SAND = [0xd4bd90, 0xc9b184, 0xdcc89e, 0xceb68a];
export const PEBBLE = [0xa99f8b, 0xb6ac97, 0x988e7c];
/** River bed (seen through the water). */
export const BED = [0x4a5646, 0x425040, 0x52604e];
/** Boulders and outcrops. */
export const BOULDER = [0x8c8070, 0x7f7465, 0x978a78, 0x857868];

/** One of a list, by a [0, 1) value. */
export const pick = (list: readonly number[], r: number): number => list[Math.min(list.length - 1, Math.floor(r * list.length))];
