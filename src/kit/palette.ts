import { Color } from 'three';

/**
 * Colours of the world kit (sRGB albedo), sampled from the section 18–20
 * reference sheets and corrected so the studio render matches them under its
 * studio light. Lists are tones of one material: pick per block with the seeded
 * hash so a surface has the 3–5 tone variation the sheets show.
 */

/**
 * Linear-light gain of the studio light on lit faces (average of top and front
 * faces), measured on the clean-sandstone cube against the §19.1 sheet.
 */
const SHEET_GAIN = [0.917, 0.853, 0.762] as const;
const _c = new Color();

/**
 * The albedo that renders like a colour picked off a lit (top / front) face of
 * a reference sheet: sample the sheet, wrap it in fromSheet(), done. (The
 * sheets' renders are warm-lit, so this adds back a little blue.)
 */
export function fromSheet(hex: number): number {
  _c.setHex(hex);
  _c.r = Math.min(1, _c.r / SHEET_GAIN[0]);
  _c.g = Math.min(1, _c.g / SHEET_GAIN[1]);
  _c.b = Math.min(1, _c.b / SHEET_GAIN[2]);
  return _c.getHex();
}

/** §19.1 sandstone finishes — the tones of a block's lit face. */
export const SANDSTONE = {
  /** Clean, recently built appearance. */
  clean: [0xe4c29a, 0xdcba91, 0xe9c9a2, 0xd5b289, 0xeccfa9],
  /** Warmer colour, sun-exposed. */
  warm: [0xc49061, 0xbb875a, 0xcb9868, 0xb38054, 0xd09e6e],
  /** Darker, aged stone. */
  dark: [0x6b574c, 0x634f45, 0x735e52, 0x5b4940, 0x7a6457],
  /** Cracked: the clean stone, a shade duller. */
  cracked: [0xd9b48d, 0xd1ac85, 0xdfbb95, 0xcaa57f],
  /** Heavily weathered: mottled mid-brown. */
  weathered: [0x866b57, 0x7b604e, 0x917561, 0x70584a, 0x9a7d67],
  /** The stone under the moss of moss-covered sandstone. */
  mossy: [0xa28366, 0x98795d, 0xac8d70, 0x8e7157],
  /** Freshly broken faces: rougher, a little darker and more orange. */
  broken: [0xb08c6c, 0xa58163, 0xba9676],
  /** Deep shadowed interiors (missing blocks, doorways). */
  cavity: [0x3e3129, 0x362b24, 0x46382e],
} as const;

export type SandstoneFinish = keyof typeof SANDSTONE;

/** §18.2 ground: soil bodies and surface layers. */
export const SOIL = {
  /** Dirt under grass and in paths. */
  dirt: [0x8a6a50, 0x80624b, 0x937257, 0x765b46, 0x9c7a5b],
  /** Dry, dusty dirt. */
  dry: [0x9c7c60, 0x917358, 0xa6856a],
  /** Wet, dark dirt. */
  wet: [0x584234, 0x503c2f, 0x614a3b],
  /** Forest floor under leaf litter. */
  humus: [0x5e4838, 0x554132, 0x68503e],
} as const;

export const GRASS = {
  /** Lawn / grass top (the pattern paints these; blades use them too). */
  blade: [0x607946, 0x4c6644, 0x788e44, 0x3f5f3d, 0x889c46],
  /** Tall grass / tufts: brighter tips. */
  tip: [0x8ea44c, 0x9bad3d, 0x7c9243],
  /** Dark base of dense tufts. */
  shade: [0x2e463c, 0x253c35, 0x385040],
} as const;

export const MOSS = [0x607339, 0x495d30, 0x788741, 0x38492c, 0x6d833f] as const;
export const LICHEN = [0xc9bfa6, 0xa9a584, 0xd9d3bf, 0x9aa07c] as const;

/** §18.1 leaf variations (canopy block colours). */
export const LEAF = {
  bright: [0x5e9433, 0x70a63b, 0x52872e, 0x84b443, 0x497b2a],
  dark: [0x31502f, 0x2a442a, 0x395b35, 0x243c24, 0x406134],
  yellowish: [0x90a635, 0xa4b73c, 0x7f9731, 0xb7c145, 0x738c2e],
  jungle: [0x3e6346, 0x2b4936, 0x6b853a, 0x52833c, 0x9cae3d],
  /** Palm fronds. */
  palm: [0x528335, 0x6a8839, 0x5e943e, 0x355c35, 0x82a643],
  /** Dry / dead palm fronds and fruit clusters hanging under the crown. */
  palmDry: [0x6f6131, 0x83723a, 0x60512a, 0x928347],
} as const;

export const FLOWER = {
  pink: [0xe59bb0, 0xd9788f, 0xf0b6c4],
  deep: [0xba6174, 0xc2536a],
  cream: [0xf1e6d2, 0xfff4e0],
  lotus: [0xf2a7c0, 0xe98aa8, 0xfbd3de],
  yellow: [0xf2c94c, 0xe8b53a],
} as const;

/** §18.1 trunk variations and roots. */
export const BARK = {
  /** Straight trunk: grey-brown. */
  grey: [0x827264, 0x78685b, 0x8c7c6e, 0x6e5f53],
  /** Thick trunk / buttress roots: warm brown. */
  brown: [0x735c48, 0x695342, 0x7d644f, 0x604c3c, 0x886e56],
  /** Strangler-fig roots: pale, sun-bleached. */
  pale: [0xb09476, 0xa3896c, 0xbba081, 0x957c62],
  /** Sugar-palm trunk rings. */
  palm: [0x957961, 0x866c57, 0xa3856a, 0x755e4c],
  /** Hanging vines / aerial roots. */
  vine: [0x5e7233, 0x4d612c, 0x738337],
} as const;

/** §20 fallen leaves: dry and wet leaf litter. */
export const LITTER = {
  dry: [0xc48040, 0xdb9347, 0xe4a64e, 0xac6c38, 0xd9b44a],
  wet: [0x8a5a34, 0x734d32, 0x97623c, 0x6b4a2c],
  green: [0x8c9a38, 0x7a8a30],
} as const;

export const WATER = {
  /** Pond / moat water, deep → shallow. */
  deep: [0x2f5a5e, 0x33605f, 0x2a5358],
  shallow: [0x4d7a6e, 0x557f70],
  lilyPad: [0x4f7a2e, 0x5f8a34, 0x446c28],
} as const;

/** Offering details. */
export const OFFERING = {
  incense: [0xb8323c, 0xa02a33],
  ember: 0xff9a3c,
  candle: [0xf1e3c4, 0xe8d6b0],
  flame: 0xffc45a,
  marigold: [0xf2a12e, 0xe8882a],
  banana: [0x7fa83a, 0x6c9a33],
} as const;
