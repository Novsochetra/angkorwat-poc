import type { HatTones, KramaLook, ShirtTones, TrouserTones } from '../../character/clothes';
import { PALETTE } from '../../character/palette';
import type { ExpressionName } from '../../character/parts/face';
import { hatArt, hex, kramaArt, shirtArt, svg, trouserArt, type Layer, type Rect } from './_wardrobeIcons';

/**
 * Pixel art for the Look page (_wardrobeLook.ts), 16 × 16 in full colour as
 * the clothes' own (_wardrobeIcons.ts), in his own colours (character/palette.ts)
 * unless the market's are given:
 *
 * - **him dressed** (`figureIcon`): his shirt and what goes over it (his krama
 *   round the neck, a tail down the front; the big pack's bedroll over his
 *   shoulders and the straps of a pack; the camera on his chest; with no pack
 *   the satchel's strap across), the belt, and the shorts (or the market
 *   trousers) or the sampot, his boots: the outfits, the ready looks, the
 *   Outfit part;
 * - **the packs** from behind (`packIcon`): the big trekking pack with its
 *   bedroll and canteen, the leather day pack with its flap and pockets;
 * - his krama, shirt, shorts, the sampot and his palm-leaf hat (red band);
 * - **his face** (`faceIcon`): the hair over his brow, the eyes, brows and
 *   mouth of each of the six faces (character/parts/face.ts);
 * - **none** (`noneIcon`): the thing dim, a slash over it; the **lock** of
 *   what is not his yet.
 */

/** The class every picture of the page has (its size: _wardrobeStyle.ts). */
const CLS = 'lk-icon';

/** A 16 × 16 picture drawn pixel by pixel (later over earlier), then one path a colour. */
class Pix {
  private readonly px = new Map<number, string>();
  set(x: number, y: number, c: number | string): void {
    if (x < 0 || x > 15 || y < 0 || y > 15) return;
    this.px.set(y * 16 + x, typeof c === 'number' ? hex(c) : c);
  }
  rect(x: number, y: number, w: number, h: number, c: number | string): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
  }
  /** Rows of a grid: each letter a colour of `pal`; '.' nothing (what was there stays). */
  grid(rows: readonly string[], pal: Record<string, number | string>): void {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = pal[row[x]];
        if (c !== undefined) this.set(x, y, c);
      }
    });
  }
  layers(): Layer[] {
    const by = new Map<string, Rect[]>();
    for (const [k, c] of this.px) {
      let l = by.get(c);
      if (!l) by.set(c, (l = []));
      l.push([k % 16, Math.floor(k / 16), 1, 1]);
    }
    return [...by].map(([c, rs]) => [c, ...rs] as Layer);
  }
}

const SKIN = PALETTE.skin;
const LEATHER = PALETTE.leather;
const BOOT = PALETTE.boot;
/** His own krama (a red plaid, scarf.ts) as a market one's look. */
export const OWN_KRAMA: KramaLook = { weave: 'plaid', tones: PALETTE.krama };
export const OWN_SHIRT: ShirtTones = PALETTE.shirt;
export const OWN_SHORTS: TrouserTones = PALETTE.shorts;
export const OWN_HAT: HatTones = { red: PALETTE.hat.red, redDark: PALETTE.hat.redDark };

export interface Figure {
  legs: 'shorts' | 'sampot';
  pack: 'explorer' | 'default' | 'none';
  scarf: boolean;
  camera: boolean;
  /** The market's (null or left out: his own). */
  shirt?: ShirtTones | null;
  krama?: KramaLook | null;
  trousers?: TrouserTones | null;
}

/** Him from the front, from the shoulders down (see the file's comment). */
export function figureIcon(f: Figure, cls = CLS): string {
  const p = new Pix();
  const S = f.shirt ?? OWN_SHIRT;
  // (the big pack's bedroll over his shoulders, behind him)
  if (f.pack === 'explorer') {
    p.rect(3, 0, 10, 1, PALETTE.bedroll.light);
    p.rect(2, 1, 12, 1, PALETTE.bedroll.base);
  }
  // The shirt: the shoulders, the sleeves to the elbow, his arms, the hem.
  p.rect(4, 1, 8, 1, S.base);
  p.rect(7, 1, 2, 1, SKIN.shade);
  p.rect(2, 2, 12, 1, S.base);
  p.rect(1, 3, 14, 1, S.base);
  p.rect(3, 4, 10, 4, S.base);
  p.rect(1, 4, 2, 1, S.cuff);
  p.rect(13, 4, 2, 1, S.cuff);
  p.rect(2, 2, 2, 2, S.light);
  p.rect(1, 3, 1, 1, S.light);
  p.rect(3, 4, 1, 4, S.light);
  p.rect(12, 2, 2, 2, S.shade);
  p.rect(14, 3, 1, 1, S.shade);
  p.rect(12, 4, 1, 4, S.shade);
  p.rect(3, 7, 10, 1, S.mid);
  p.rect(1, 5, 2, 2, SKIN.base);
  p.rect(13, 5, 2, 2, SKIN.base);
  p.rect(1, 6, 2, 1, SKIN.shade);
  p.rect(13, 6, 2, 1, SKIN.shade);
  // A pack's straps down his chest, or the satchel's across it.
  if (f.pack !== 'none') {
    p.rect(4, 1, 1, 7, LEATHER.strap);
    p.rect(11, 1, 1, 7, LEATHER.strap);
  } else for (let i = 0; i < 7; i++) p.set(11 - i, 1 + i, LEATHER.strap);
  // The camera on its straps.
  if (f.camera) {
    if (!f.scarf) {
      p.set(6, 2, LEATHER.strap);
      p.set(9, 2, LEATHER.strap);
      p.set(6, 3, LEATHER.strap);
      p.set(9, 3, LEATHER.strap);
    }
    p.rect(6, 4, 4, 1, PALETTE.camera.plate);
    p.rect(6, 5, 4, 1, PALETTE.camera.body);
    p.rect(7, 5, 2, 1, PALETTE.camera.glass);
  }
  // His krama round the neck, a long tail down the front and a short one.
  if (f.scarf) {
    const K = (f.krama ?? OWN_KRAMA).tones;
    p.rect(5, 1, 6, 1, K.red);
    p.rect(5, 2, 6, 1, K.redLight);
    p.set(7, 2, K.dark);
    p.rect(5, 3, 2, 1, K.red);
    p.rect(9, 3, 2, 4, K.red);
    p.rect(9, 4, 2, 1, K.dark);
    p.set(10, 5, K.light);
    p.rect(9, 7, 2, 1, K.fringe);
  }
  // The belt and its buckle.
  p.rect(3, 8, 10, 1, LEATHER.dark);
  p.rect(7, 8, 2, 1, PALETTE.brass);
  if (f.legs === 'sampot') {
    // The sampot: baggy to the knee, the tail through the middle, gold at the knees.
    const T = PALETTE.sampot;
    p.rect(3, 9, 10, 1, T.base);
    p.rect(2, 10, 12, 2, T.base);
    p.rect(2, 10, 1, 2, T.light);
    p.rect(3, 9, 1, 1, T.light);
    p.rect(7, 9, 2, 3, T.dark);
    p.rect(13, 10, 1, 2, T.dark);
    p.rect(3, 12, 4, 1, T.gold);
    p.rect(9, 12, 4, 1, T.gold);
    p.rect(4, 13, 2, 1, PALETTE.sock);
    p.rect(10, 13, 2, 1, PALETTE.sock);
  } else if (f.trousers) {
    // Long loose trousers down to the boots.
    const T = f.trousers;
    p.rect(3, 9, 10, 1, T.base);
    p.rect(3, 10, 4, 3, T.base);
    p.rect(9, 10, 4, 3, T.base);
    p.rect(3, 9, 1, 4, T.light);
    p.rect(9, 10, 1, 3, T.light);
    p.rect(6, 10, 1, 3, T.dark);
    p.rect(12, 10, 1, 3, T.dark);
    p.rect(3, 13, 4, 1, T.hem);
    p.rect(9, 13, 4, 1, T.hem);
  } else {
    // His shorts with the outset hem, the knees, the socks.
    const T = OWN_SHORTS;
    p.rect(3, 9, 10, 1, T.base);
    p.rect(3, 10, 4, 1, T.base);
    p.rect(9, 10, 4, 1, T.base);
    p.rect(3, 9, 1, 2, T.light);
    p.rect(12, 9, 1, 2, T.dark);
    p.rect(2, 11, 5, 1, T.hem);
    p.rect(9, 11, 5, 1, T.hem);
    p.rect(4, 12, 2, 1, SKIN.base);
    p.rect(10, 12, 2, 1, SKIN.base);
    p.rect(4, 13, 2, 1, PALETTE.sock);
    p.rect(10, 13, 2, 1, PALETTE.sock);
  }
  // His boots.
  p.rect(3, 14, 4, 1, BOOT.upper);
  p.rect(9, 14, 4, 1, BOOT.upper);
  p.rect(3, 15, 4, 1, BOOT.toe);
  p.rect(9, 15, 4, 1, BOOT.toe);
  return svg(cls, p.layers());
}

const FLAP = { F: 0x93593a, f: 0x9d6441 };
const PACK_PAL: Record<string, number> = {
  e: PALETTE.bedroll.strap,
  R: PALETTE.bedroll.base,
  r: PALETTE.bedroll.light,
  S: PALETTE.bedroll.strap,
  d: LEATHER.darkest,
  o: LEATHER.dark,
  L: LEATHER.light,
  F: FLAP.F,
  f: FLAP.f,
  G: LEATHER.base,
  B: LEATHER.mid,
  M: LEATHER.dark,
  P: LEATHER.base,
  s: LEATHER.dark,
  t: LEATHER.darkest,
  y: PALETTE.brass,
  k: PALETTE.canteen.cap,
  c: PALETTE.canteen.base,
};
const BIG_PACK = [
  '................',
  '..eRRSRRRRSRRe..',
  '..errSrrrrSrre..',
  '...dLLLLLLLLd...',
  '...dFfFFFFfFd...',
  '...dFFFFFFFFd...',
  '...dFFFyyFFFdk..',
  '...dGGGyyGGGdcc.',
  '...dBBBBBBBBdcc.',
  '...dBMMMMMMBdcc.',
  '...dBPPPPPPBdcc.',
  '...dBPPPPPPBd...',
  '...dBBBBBBBBd...',
  '....dddddddd....',
];
const DAY_PACK = [
  '................',
  '................',
  '................',
  '......oooo......',
  '......o..o......',
  '....dFfFFfFd....',
  '....dFFyyFFd....',
  '....dddyyddd....',
  '...sGGGttGGGs...',
  '...sGPPGGPPGs...',
  '...sGPyGGyPGs...',
  '...sGPPGGPPGs...',
  '....GGGGGGGG....',
  '....dddddddd....',
];

/** A pack from behind: the big trekking pack (bedroll, canteen) or the day pack. */
export function packIcon(style: 'explorer' | 'default', cls = CLS): string {
  const p = new Pix();
  p.grid(style === 'explorer' ? BIG_PACK : DAY_PACK, PACK_PAL);
  return svg(cls, p.layers());
}

/** Shorts (his own, with the outset hem) on their own. */
function shortsArt(T: TrouserTones): Layer[] {
  const p = new Pix();
  p.grid(
    [
      '................',
      '................',
      '...DDDDDDDDDD...',
      '...LBBBBBBBBB...',
      '...LBBBBBBBBD...',
      '...LBBBDDBBBD...',
      '..LLBBB..BBBDD..',
      '..LBBBB..BBBBD..',
      '..LBBBD..LBBBD..',
      '..HHHHH..HHHHH..',
      '..hhhhh..hhhhh..',
    ],
    { D: T.dark, L: T.light, B: T.base, H: T.hem, h: T.dark },
  );
  return p.layers();
}

/** The sampot (chang kben): the gold band at the waist, its tail through the middle, gathered at the knees in gold. */
function sampotArt(): Layer[] {
  const T = PALETTE.sampot;
  const p = new Pix();
  p.grid(
    [
      '................',
      '................',
      '...gggggggggg...',
      '...LBBBDDBBBB...',
      '..LBBBBDDBBBBD..',
      '..LBBBBDDBBBBD..',
      '.LBBBBBDDBBBBBD.',
      '.LBBBBBDDBBBBBD.',
      '.LBBBBD..DBBBBD.',
      '..BBBBD..DBBBB..',
      '..ggggg..ggggg..',
    ],
    { g: T.gold, L: T.light, B: T.base, D: T.dark },
  );
  return p.layers();
}

export const krIcon = (k: KramaLook, cls = CLS) => svg(cls, kramaArt(k));
export const shirtIcon = (s: ShirtTones, cls = CLS) => svg(cls, shirtArt(s));
export const legsIcon = (t: TrouserTones, cls = CLS) => svg(cls, trouserArt(t));
export const shortsIcon = (cls = CLS) => svg(cls, shortsArt(OWN_SHORTS));
export const sampotIcon = (cls = CLS) => svg(cls, sampotArt());
export const hatIcon = (h: HatTones, cls = CLS) => svg(cls, hatArt(h));

/** His face: the hair over the brow, the cheeks; the eyes, brows and mouth of each face. */
const FACE_BASE = [
  '................',
  '.....hhhhhh.....',
  '...hhhhhhhhhh...',
  '..hhhhhhhhhhhh..',
  '..hhhHhhhhhHhh..',
  '..hhsshhhsshhh..',
  '..hssssssssssh..',
  '..hssssssssssh..',
  '..hssssssssssh..',
  '...ssssssssss...',
  '...ssssssssss...',
  '...ssssssssss...',
  '....ssssssss....',
  '.....ssssss.....',
];
/**
 * Over the base, row by row from the top: b brow, w eye white, k pupil (his eyes look in, as the game's:
 * face.ts `wkkw`), l lid, c blush, m mouth, n the mouth's dark.
 */
const FACES: Record<ExpressionName, readonly string[]> = {
  neutral: ['', '', '', '', '', '', '....bb....bb....', '', '....wk....kw....', '....wk....kw....', '....c......c....', '', '.......mm.......'],
  happy: ['', '', '', '', '', '', '....bb....bb....', '', '.....k....k.....', '....k.k..k.k....', '....c......c....', '......mmmm......', '.......nn.......'],
  determined: ['', '', '', '', '', '', '...bbb....bbb...', '.....b....b.....', '....wk....kw....', '....wk....kw....', '', '', '......nnnn......'],
  surprised: ['', '', '', '', '', '....bb....bb....', '', '....wk....kw....', '....wk....kw....', '....wk....kw....', '', '.......nn.......', '.......nn.......'],
  curious: ['', '', '', '', '', '..........bb....', '....bb..........', '', '....wk....wk....', '....wk....wk....', '....c......c....', '', '........n.......'],
  focused: ['', '', '', '', '', '', '', '....bb....bb....', '....ll....ll....', '....wk....kw....', '', '', '.......nn.......'],
};
const FACE_PAL: Record<string, number> = {
  h: PALETTE.hair.base,
  H: PALETTE.hair.light,
  s: SKIN.base,
  b: PALETTE.brow,
  w: PALETTE.eyeWhite,
  k: PALETTE.eyeDark,
  l: SKIN.shade,
  c: PALETTE.blush,
  m: PALETTE.mouth,
  n: PALETTE.mouthDark,
};

export function faceIcon(e: ExpressionName, cls = CLS): string {
  const p = new Pix();
  p.grid(FACE_BASE, FACE_PAL);
  p.grid(FACES[e], FACE_PAL);
  return svg(cls, p.layers());
}

/** None: the picture dim, a slash across it. */
export function noneIcon(of: string): string {
  const slash = [...Array(10)].map((_, i) => `M${3 + i} ${12 - i}h2v1h-2z`).join('');
  return of.replace(/<svg([^>]*)>([\s\S]*)<\/svg>$/, (_m, a: string, body: string) => `<svg${a}><g opacity="0.3">${body}</g><path fill="#ec9482" d="${slash}"/></svg>`);
}

/** No pack: the day pack, dim, slashed. */
export const noPackIcon = (cls = CLS) => noneIcon(packIcon('default', cls));

/** The small lock on what is not his yet (currentColor; its keyhole dark). */
export const LOCK_ICON =
  '<svg class="lk-lock" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M5 1h6v1h1v5h-2V3H6v4H4V2h1zM3 7h10v8H3z"/><path fill="#1b2230" d="M7 9h2v2H8v2H7v-2H6V9z" opacity="0.85"/></svg>';
