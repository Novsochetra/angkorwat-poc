import type { PALETTE } from './palette';

/**
 * Clothes in other colours for the explorer (the map's clothes stall and his
 * wardrobe: src/map/roam/_wardrobe*.ts). Each is a set of tones for parts he
 * already wears, given to the part builders in place of the palette's
 * (`AngkorExplorer.setClothes`): the krama's weave and colours (scarf.ts), the
 * shirt's (torso.ts and the sleeves, limbs.ts), long loose trousers instead
 * of the shorts (limbs.ts) and the palm-leaf hat's cloth band (props.ts).
 * Nothing here changes his own look: with no clothes the builders use the
 * palette, block for block as before (the viewer, the stickers).
 *
 * Colours are sRGB, as the palette's.
 */

/** The krama's tones, by the palette's names (`PALETTE.krama`). */
export type KramaTones = { readonly [K in keyof typeof PALETTE.krama]: number };

/**
 * How a krama is woven:
 * - `plaid`: as his own (scarf.ts `plaid`): wide bands of the main colour
 *   (`red`, `red2`, `redLight`), narrow dark bands (`dark`, `darkest` where two
 *   cross) and thin threads (`light`, `lightDark` over a dark band);
 * - `check`: the gingham check of the market kramas: cells of the colour
 *   (`red`, `red2`, `redLight`) and of white (`light`) by turns, `dark` where a
 *   coloured band crosses a white one (`darkest`, `lightDark` unused).
 */
export interface KramaLook {
  readonly weave: 'plaid' | 'check';
  readonly tones: KramaTones;
}

/** A shirt's tones (the palette's `shirt`). */
export interface ShirtTones {
  readonly light: number;
  readonly base: number;
  readonly mid: number;
  readonly shade: number;
  readonly cuff: number;
}

/** Long loose trousers in place of the shorts (the shorts' tone names: `PALETTE.shorts`; `hem` the turned-up cuff). */
export interface TrouserTones {
  readonly base: number;
  readonly light: number;
  readonly dark: number;
  readonly hem: number;
}

/** The palm-leaf hat's cloth: its band round the crown and the binding round the brim (the palette's `hat.red`, `hat.redDark`). */
export interface HatTones {
  readonly red: number;
  readonly redDark: number;
}

/** What he wears over his own clothes (null: his own). */
export interface ExplorerClothes {
  krama: KramaLook | null;
  shirt: ShirtTones | null;
  trousers: TrouserTones | null;
  hat: HatTones | null;
}

export const NO_CLOTHES: Readonly<ExplorerClothes> = { krama: null, shirt: null, trousers: null, hat: null };

/** The market's kramas (cotton, a silk one), their weaves and tones. */
export const KRAMAS = {
  /** Red and white check, the krama everyone knows. */
  redWhite: {
    weave: 'check',
    tones: { red: 0xc4303a, red2: 0xb72a35, redLight: 0xd03b43, dark: 0xe2898b, darkest: 0xe2898b, light: 0xf3ede2, lightDark: 0xe2898b, fringe: 0xc4303a, fringeDark: 0xefe6d8 },
  },
  /** Blue and white check. */
  blueWhite: {
    weave: 'check',
    tones: { red: 0x2c5aa2, red2: 0x285295, redLight: 0x3566ae, dark: 0x8aa8d6, darkest: 0x8aa8d6, light: 0xf2efe6, lightDark: 0x8aa8d6, fringe: 0x2c5aa2, fringeDark: 0xece8de },
  },
  /** Green with dark green bands and cream threads. */
  green: {
    weave: 'plaid',
    tones: { red: 0x2f8a4e, red2: 0x2a7d46, redLight: 0x3a9858, dark: 0x1d5a33, darkest: 0x133e23, light: 0xe8dc9c, lightDark: 0x8c9a5c, fringe: 0x2a7d46, fringeDark: 0x1b5230 },
  },
  /** Purple silk with gold threads. */
  purple: {
    weave: 'plaid',
    tones: { red: 0x74308c, red2: 0x682a7e, redLight: 0x843c9c, dark: 0x481a5e, darkest: 0x2f1040, light: 0xe2bd62, lightDark: 0x96664e, fringe: 0x682a7e, fringeDark: 0x421654 },
  },
  /** Orange with rust bands and white threads. */
  orange: {
    weave: 'plaid',
    tones: { red: 0xe0782a, red2: 0xd46c24, redLight: 0xec8a3a, dark: 0xa0481a, darkest: 0x6e3010, light: 0xf6e8cc, lightDark: 0xc89a72, fringe: 0xd46c24, fringeDark: 0x94441a },
  },
  /** The classic red: deep crimson, near-black bands and white threads. */
  red: {
    weave: 'plaid',
    tones: { red: 0xb0222e, red2: 0xa21e2a, redLight: 0xbe2c36, dark: 0x4e1219, darkest: 0x320b10, light: 0xf2e6d4, lightDark: 0xa86a6a, fringe: 0xa21e2a, fringeDark: 0x5a141c },
  },
} as const satisfies Record<string, KramaLook>;

/** Linen shirts. */
export const SHIRTS = {
  white: { light: 0xf7f4ed, base: 0xefebe2, mid: 0xe3ded3, shade: 0xd0c9bb, cuff: 0xf9f7f1 },
  indigo: { light: 0x40548a, base: 0x35487c, mid: 0x2d3d6d, shade: 0x25335c, cuff: 0x4c6096 },
  sand: { light: 0xe8cb95, base: 0xdcba80, mid: 0xd0ab6f, shade: 0xbc955b, cuff: 0xecd5a6 },
} as const satisfies Record<string, ShirtTones>;

/** Loose trousers. */
export const TROUSERS = {
  navy: { base: 0x27365c, light: 0x31426c, dark: 0x1f2b4b, hem: 0x2c3c64 },
  black: { base: 0x27272a, light: 0x333336, dark: 0x1d1d20, hem: 0x2d2d30 },
} as const satisfies Record<string, TrouserTones>;

/** The palm-leaf hat's cloth band. */
export const HAT_BANDS = {
  blue: { red: 0x2d58a0, redDark: 0x214380 },
} as const satisfies Record<string, HatTones>;
