import type { HatTones, KramaLook, ShirtTones, TrouserTones } from '../../character/clothes';
import type { WearItem } from './_wardrobeItems';

/**
 * Pixel art for the clothes (16 × 16 in full colour, as the buy menu's
 * pictures, _shopIcons.ts): a folded krama in its own weave and colours with
 * its fringe, a short-sleeved shirt, loose trousers, the palm-leaf hat with
 * its band; and the explorer menu's Wardrobe (a hanger with a krama over it,
 * in `currentColor`, gold when lit, as that menu's icons).
 */

type Rect = readonly [x: number, y: number, w: number, h: number];
/** A colour and its pixels (later ones paint over earlier ones). */
type Layer = readonly [color: string, ...rects: Rect[]];

const hex = (c: number) => `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;

function svg(cls: string, layers: readonly Layer[]): string {
  const body = layers
    .filter((l) => l.length > 1)
    .map(([c, ...rs]) => `<path fill="${c}" d="${rs.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h-${w}z`).join('')}"/>`)
    .join('');
  return `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">${body}</svg>`;
}

/** Pixels by colour (one path a colour). */
function byColor(px: [number, number, number][]): Layer[] {
  const m = new Map<number, Rect[]>();
  for (const [x, y, c] of px) {
    let l = m.get(c);
    if (!l) m.set(c, (l = []));
    l.push([x, y, 1, 1]);
  }
  return [...m].map(([c, rs]) => [hex(c), ...rs] as Layer);
}

/** A folded krama: the cloth (its weave: a plaid's bands and threads, or a check's cells), its folded edge, the fringe. */
function kramaArt(k: KramaLook): Layer[] {
  const T = k.tones;
  const px: [number, number, number][] = [];
  for (let y = 4; y <= 11; y++)
    for (let x = 1; x <= 14; x++) {
      let c: number;
      if (k.weave === 'check') {
        const a = ((x - 1) >> 1) % 2 === 0;
        const b = ((y - 4) >> 1) % 2 === 0;
        c = a && b ? T.red : a || b ? T.dark : T.light;
      } else {
        // (wide bands of the colour, a narrow dark band each way, a thin thread each way)
        const dw = x === 5 || x === 11;
        const dh = y === 9;
        const lw = x === 8;
        const lh = y === 6;
        c = dw && dh ? T.darkest : dw || dh ? (lw || lh ? T.lightDark : T.dark) : lw || lh ? T.light : T.red;
      }
      px.push([x, y, c]);
    }
  return [
    ...byColor(px),
    // (the fold along the top catches the light; a shadow under the cloth; the fringe)
    ['rgba(255,255,255,0.28)', [1, 4, 14, 1]],
    ['rgba(0,0,0,0.25)', [1, 11, 14, 1]],
    [hex(T.fringe), [2, 12, 1, 2], [5, 12, 1, 3], [8, 12, 1, 2], [11, 12, 1, 3], [13, 12, 1, 2]],
    [hex(T.fringeDark), [3, 12, 1, 3], [6, 12, 1, 2], [9, 12, 1, 3], [12, 12, 1, 2]],
    ['rgba(0,0,0,0.35)', [0, 5, 1, 6], [15, 5, 1, 6]],
  ];
}

/** A short-sleeved shirt: its body, the sleeves and their rolled cuffs, the open collar, the placket and two buttons. */
function shirtArt(S: ShirtTones): Layer[] {
  return [
    [hex(S.base), [4, 3, 8, 12], [1, 4, 3, 4], [12, 4, 3, 4], [3, 3, 1, 1], [12, 3, 1, 1]],
    [hex(S.light), [4, 4, 2, 10], [1, 4, 2, 1]],
    [hex(S.shade), [10, 5, 2, 10], [13, 5, 2, 3], [1, 7, 1, 1]],
    [hex(S.cuff), [1, 8, 3, 1], [12, 8, 3, 1]],
    [hex(S.mid), [7, 6, 1, 9], [6, 3, 4, 1]],
    ['rgba(0,0,0,0.38)', [7, 3, 2, 2], [7, 5, 1, 1]],
    ['rgba(255,255,255,0.55)', [8, 8, 1, 1], [8, 11, 1, 1]],
    ['rgba(0,0,0,0.25)', [4, 14, 8, 1]],
  ];
}

/** Loose trousers: the waistband, two wide legs, a fold down each, the turned-up hems. */
function trouserArt(T: TrouserTones): Layer[] {
  return [
    [hex(T.base), [3, 2, 10, 5], [2, 7, 6, 6], [8, 7, 6, 6], [2, 6, 1, 1], [13, 6, 1, 1]],
    [hex(T.light), [3, 3, 2, 3], [2, 7, 2, 5], [8, 7, 1, 5]],
    [hex(T.dark), [3, 1, 10, 2], [5, 7, 1, 6], [11, 7, 1, 6], [7, 5, 2, 2]],
    [hex(T.hem), [1, 13, 7, 2], [8, 13, 7, 2]],
    ['rgba(255,255,255,0.2)', [3, 1, 10, 1], [1, 13, 7, 1], [8, 13, 7, 1]],
  ];
}

/** The palm-leaf hat (never the conical one): the woven crown, its cloth band, the wide brim bound in the same cloth. */
function hatArt(H: HatTones): Layer[] {
  return [
    ['#e2b35c', [5, 4, 6, 1], [4, 5, 8, 2]],
    ['#f0c874', [6, 4, 3, 1], [2, 8, 12, 1]],
    ['#c99a48', [10, 5, 2, 2]],
    [hex(H.red), [4, 7, 8, 1], [1, 9, 14, 1]],
    [hex(H.redDark), [11, 7, 1, 1], [1, 9, 1, 1], [14, 9, 1, 1], [3, 10, 10, 1]],
  ];
}

/** An item's picture (`cls`: its size in the card). */
export function wearIcon(it: WearItem, cls = 'wr-icon'): string {
  switch (it.kind) {
    case 'krama':
      return svg(cls, kramaArt(it.look as KramaLook));
    case 'shirt':
      return svg(cls, shirtArt(it.look as ShirtTones));
    case 'trousers':
      return svg(cls, trouserArt(it.look as TrouserTones));
    case 'hat':
      return svg(cls, hatArt(it.look as HatTones));
  }
}

/** The stall's sign in the card: a stack of folded kramas (red and white, blue and white, green). */
export function stallIcon(cls = 'wr-icon'): string {
  const fold = (y: number, a: number, b: number): Layer[] => [
    [hex(a), [2, y, 12, 3]],
    [hex(b), [3, y, 2, 1], [7, y, 2, 1], [11, y, 2, 1], [5, y + 1, 2, 1], [9, y + 1, 2, 1], [3, y + 2, 2, 1], [7, y + 2, 2, 1], [11, y + 2, 2, 1]],
    ['rgba(0,0,0,0.3)', [2, y + 2, 12, 1]],
  ];
  return svg(cls, [
    ...fold(2, 0x3a8a54, 0xe8dc9c),
    ...fold(6, 0x2c5aa2, 0xf2efe6),
    ...fold(10, 0xc4303a, 0xf3ede2),
    ['#c4303a', [3, 13, 1, 2], [6, 13, 1, 2], [9, 13, 1, 2], [12, 13, 1, 2]],
  ]);
}

/** The explorer menu's Wardrobe: a hanger (`currentColor`, its hook gold) with a krama hung over its bar. */
export const WARDROBE_ICON = svg('rxm-icon', [
  ['#ffe07c', [8, 1, 2, 1], [9, 2, 1, 1], [8, 3, 1, 1]],
  ['currentColor', [7, 4, 2, 1], [5, 5, 2, 1], [9, 5, 2, 1], [3, 6, 2, 1], [11, 6, 2, 1], [1, 7, 2, 1], [13, 7, 2, 1], [1, 8, 14, 1]],
  ['#c8453a', [5, 9, 6, 4]],
  ['#f2e6d4', [5, 9, 1, 1], [7, 9, 1, 1], [9, 9, 1, 1], [6, 10, 1, 1], [8, 10, 1, 1], [10, 10, 1, 1], [5, 11, 1, 1], [7, 11, 1, 1], [9, 11, 1, 1], [6, 12, 1, 1], [8, 12, 1, 1], [10, 12, 1, 1]],
  ['#a22c38', [5, 13, 1, 2], [7, 13, 1, 2], [9, 13, 1, 2]],
]);
