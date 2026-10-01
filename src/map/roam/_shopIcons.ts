import type { ConsumeKind } from '../shop';

/**
 * Pixel art for buying (16 × 16, like the tool bar's and the explorer
 * menu's icons, but in full colour: what he buys, the riel note of the
 * purse, the stall, his bag). A dish or a drink is drawn by how it is eaten
 * (`ConsumeKind`: a bowl of num banh chok with chopsticks, a skewer, a green
 * coconut with a straw, a cup, a bag of iced coffee tied with a straw, a
 * bottle of water…), in the item's own colours when it has them; some
 * items have a picture of their own (a banana, rambutans, num krok, num
 * ansom, num kom, palm sugar cakes…: `ICON_OF`).
 */

type Rect = readonly [x: number, y: number, w: number, h: number];
/** A colour and the pixels (rectangles) in it; later ones paint over earlier ones. */
type Layer = readonly [color: string, ...rects: Rect[]];

const hex = (c: number) => `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;
/** A colour a little darker or lighter (k < 1 darker). */
const shade = (c: number, k: number) => {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k)));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
};

function svg(cls: string, layers: readonly Layer[]): string {
  const body = layers.map(([c, ...rs]) => `<path fill="${c}" d="${rs.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h-${w}z`).join('')}"/>`).join('');
  return `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">${body}</svg>`;
}

/** Pixels along a line (1 × 1 each), from (x0, y0) to (x1, y1). */
function line(x0: number, y0: number, x1: number, y1: number): Rect[] {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const out: Rect[] = [];
  for (let i = 0; i <= n; i++) out.push([Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), 1, 1]);
  return out;
}

/** A round blob: rows of `[y, x0, x1]` (inclusive). */
const rows = (list: readonly (readonly [number, number, number])[], dx = 0, dy = 0): Rect[] => list.map(([y, a, b]) => [a + dx, y + dy, b - a + 1, 1] as const);
const BALL5: readonly (readonly [number, number, number])[] = [
  [0, 1, 3],
  [1, 0, 4],
  [2, 0, 4],
  [3, 0, 4],
  [4, 1, 3],
];

const WOOD = '#c89a5a';
const STRAW_RED = '#d8352a';
const WHITE = '#f4f0e6';
const GLASS = '#dcecf4';
const LEAF = '#4a8a34';

/** The picture drawn for each kind of thing when the item has none of its own. */
type Art = (c: readonly number[]) => Layer[];

const ART: Record<ConsumeKind, Art> = {
  // A bowl of num banh chok: white noodle nests, the green fish gravy, herbs; chopsticks; a blue band on the bowl.
  noodles: (c) => [
    [WOOD, ...line(13, 0, 9, 4), ...line(14, 1, 10, 5)],
    [hex(c[0] ?? 0xf2eee4), [4, 5, 8, 1], [3, 6, 10, 2]],
    [hex(c[1] ?? 0x8ab040), [5, 6, 1, 1], [8, 5, 1, 1], [10, 7, 1, 1], [6, 7, 1, 1]],
    [hex(c[2] ?? 0x3a7a2a), [9, 6, 1, 1], [4, 7, 1, 1]],
    ['#e8e4dc', [2, 8, 12, 2], [3, 10, 10, 1], [4, 11, 8, 1], [5, 12, 6, 1]],
    ['#3a6aa8', [3, 10, 10, 1]],
    ['#b8b4a8', [6, 13, 4, 1], [12, 9, 1, 1], [11, 11, 1, 1]],
  ],
  // A plate of rice with grilled pork (bai sach chrouk) and a spoon.
  riceBowl: (c) => [
    ['#c8ccd0', ...line(15, 3, 11, 7)],
    [WHITE, [4, 5, 6, 1], [3, 6, 8, 3]],
    [hex(c[0] ?? 0xa8542a), [10, 6, 3, 2], [11, 8, 3, 1]],
    [hex(shade(c[0] ?? 0xa8542a, 0.7)), [11, 7, 2, 1]],
    ['#e8e4dc', [1, 9, 14, 2], [2, 11, 12, 1]],
    ['#b8b4a8', [3, 12, 10, 1]],
  ],
  // Grilled skewers (sach ko ang): three pieces on a bamboo stick.
  skewer: (c) => {
    const a = c[0] ?? 0x8a4a2a;
    return [
      ['#d8b878', ...line(1, 14, 14, 1)],
      [hex(a), [3, 9, 4, 4], [6, 6, 4, 4], [9, 3, 4, 4]],
      [hex(shade(a, 0.65)), [3, 12, 4, 1], [6, 9, 4, 1], [9, 6, 4, 1], [6, 10, 1, 1]],
      [hex(shade(a, 1.35)), [4, 9, 2, 1], [7, 6, 2, 1], [10, 3, 2, 1]],
      [hex(c[1] ?? 0xc8a050), [5, 11, 1, 1], [8, 8, 1, 1], [11, 5, 1, 1]],
    ];
  },
  // A mango (green with chili salt, or ripe), its stem and a leaf; a pinch of chili salt beside it.
  fruit: (c) => {
    const a = c[0] ?? 0x8ab83a;
    return [
      ['#7a5a3a', [9, 2, 1, 2]],
      [LEAF, [10, 1, 3, 1], [11, 2, 2, 1]],
      [hex(a), ...rows([[3, 7, 10], [4, 6, 11], [5, 5, 12], [6, 5, 12], [7, 5, 12], [8, 5, 12], [9, 5, 12], [10, 6, 12], [11, 6, 11], [12, 7, 10]])],
      [hex(shade(a, 0.72)), [11, 7, 1, 4], [10, 11, 1, 1], [8, 12, 2, 1]],
      [hex(shade(a, 1.3)), [7, 5, 2, 1], [6, 6, 1, 2]],
      [hex(c[1] ?? 0xd8584a), [1, 13, 3, 2], [2, 12, 1, 1]],
    ];
  },
  // Num krok: little round coconut cakes, golden underneath, on a banana leaf.
  sweet: (c) => {
    const a = c[0] ?? 0xe8b860;
    return [
      [LEAF, [1, 11, 14, 2], [2, 13, 12, 1]],
      [hex(a), ...rows(BALL5, 1, 6), ...rows(BALL5, 6, 5), ...rows(BALL5, 10, 7)],
      [hex(c[1] ?? 0xf4ecd0), [2, 6, 3, 2], [7, 5, 3, 2], [11, 7, 3, 2]],
      [hex(shade(a, 0.7)), [2, 10, 3, 1], [7, 9, 3, 1], [11, 11, 3, 1]],
    ];
  },
  // A green coconut, its top cut open, a straw in it.
  coconut: (c) => {
    const a = c[0] ?? 0x6a9a3a;
    return [
      [STRAW_RED, ...line(8, 5, 11, 0), [12, 0, 1, 1]],
      [hex(a), ...rows([[5, 4, 11], [6, 3, 12], [7, 2, 13], [8, 2, 13], [9, 2, 13], [10, 2, 13], [11, 3, 12], [12, 3, 12], [13, 4, 11], [14, 6, 9]])],
      [hex(shade(a, 0.7)), [11, 9, 2, 3], [9, 12, 3, 2], [12, 8, 1, 1]],
      [hex(shade(a, 1.3)), [4, 7, 2, 1], [3, 8, 1, 2]],
      [hex(c[1] ?? 0xf0ecd8), [5, 4, 6, 2]],
      [STRAW_RED, [8, 4, 1, 1]],
    ];
  },
  // A clear plastic cup with a straw: sugarcane juice, iced tea (the drink in its colour, ice in it).
  cupDrink: (c) => {
    const a = c[0] ?? 0xcfd88a;
    return [
      [STRAW_RED, ...line(8, 4, 11, 0), [12, 0, 1, 1]],
      [GLASS, [3, 4, 10, 1], [3, 5, 1, 1], [12, 5, 1, 1]],
      [hex(a), [4, 5, 8, 2], [4, 7, 8, 3], [5, 10, 6, 3], [5, 13, 6, 1]],
      [hex(shade(a, 0.8)), [10, 7, 1, 6], [6, 13, 4, 1]],
      [WHITE, [5, 6, 2, 2], [8, 8, 2, 2], [6, 10, 2, 1]],
      [GLASS, [4, 5, 1, 5], [5, 10, 1, 4]],
      [STRAW_RED, [8, 5, 1, 3]],
    ];
  },
  // Iced coffee with milk in a plastic bag, tied at the top round a straw, the loop to carry it by.
  bagDrink: (c) => {
    const a = c[0] ?? 0xa8744a;
    return [
      [WHITE, ...line(9, 0, 9, 3), [10, 0, 1, 1]],
      [GLASS, ...line(6, 3, 3, 0), [2, 0, 2, 1], ...line(5, 3, 2, 1)],
      [GLASS, [6, 3, 4, 1], [7, 4, 2, 1]],
      [hex(c[1] ?? 0xd8b890), [5, 5, 6, 2]],
      [hex(a), [4, 7, 8, 5], [5, 12, 6, 2]],
      [hex(shade(a, 0.75)), [10, 8, 1, 4], [7, 13, 3, 1]],
      [WHITE, [5, 8, 2, 2], [8, 10, 2, 1]],
      [GLASS, [4, 6, 1, 1], [11, 6, 1, 1], [3, 8, 1, 3]],
    ];
  },
  // A bottle of water (or an orange soda: the drink's colour), its cap and label.
  bottle: (c) => {
    const a = c[0] ?? 0xbfe0f0;
    return [
      [hex(c[1] ?? 0x2a6ac8), [6, 0, 4, 2]],
      [hex(a), [6, 2, 4, 1], [5, 3, 6, 1], [4, 4, 8, 11]],
      [hex(shade(a, 0.8)), [10, 5, 1, 9], [5, 14, 6, 1]],
      [hex(c[1] ?? 0x2a6ac8), [4, 8, 8, 3]],
      [hex(shade(c[1] ?? 0x2a6ac8, 1.5)), [5, 9, 3, 1]],
      [WHITE, [5, 4, 1, 3], [5, 12, 1, 2]],
    ];
  },
};

/** Pictures of their own for some items (by item id; add-ons add theirs: roam/_lotus.ts). */
export const OWN: Record<string, Art> = {
  // A banana, and a second one behind it.
  banana: (c) => {
    const a = c[0] ?? 0xf0d040;
    const curve = rows([[2, 11, 12], [3, 10, 12], [4, 9, 12], [5, 8, 11], [6, 7, 11], [7, 6, 10], [8, 5, 10], [9, 4, 9], [10, 3, 8], [11, 3, 7], [12, 3, 6], [13, 4, 5]]);
    return [
      [hex(shade(a, 0.8)), ...curve.map(([x, y, w, h]) => [x + 2, y + 1, w, h] as const)],
      [hex(a), ...curve],
      [hex(shade(a, 0.7)), [11, 3, 1, 2], [9, 6, 1, 2], [6, 9, 1, 2], [4, 12, 1, 1]],
      ['#6a4a2a', [12, 1, 2, 2], [3, 13, 1, 1]],
    ];
  },
  // Rambutans: red, hairy, one opened (the white fruit inside).
  rambutan: (c) => {
    const a = c[0] ?? 0xd83a2a;
    return [
      [hex(a), ...rows(BALL5, 1, 7), ...rows(BALL5, 7, 5), ...rows(BALL5, 5, 10)],
      [hex(shade(a, 0.65)), [2, 11, 3, 1], [8, 9, 3, 1], [6, 14, 3, 1]],
      ['#8ab83a', [1, 7, 1, 1], [5, 7, 1, 1], [7, 5, 1, 1], [11, 5, 1, 1], [12, 8, 1, 1], [4, 10, 1, 1], [10, 12, 1, 1], [0, 9, 1, 1]],
      [WHITE, [12, 11, 3, 3]],
      [hex(a), [11, 12, 1, 2], [15, 12, 1, 1]],
    ];
  },
  // A pomelo, a wedge cut out (pink flesh).
  pomelo: (c) => {
    const a = c[0] ?? 0xb8d070;
    return [
      [hex(a), ...rows([[2, 5, 10], [3, 3, 12], [4, 2, 13], [5, 1, 14], [6, 1, 14], [7, 1, 14], [8, 1, 14], [9, 1, 14], [10, 2, 13], [11, 3, 12], [12, 5, 10]])],
      [hex(shade(a, 0.75)), [10, 9, 3, 2], [7, 12, 3, 1]],
      [hex(c[1] ?? 0xf08a8a), [8, 3, 3, 1], [8, 4, 4, 2], [8, 6, 5, 2]],
      ['#f8e8e0', [8, 3, 1, 5]],
      ['#6a8a3a', [7, 0, 1, 2]],
    ];
  },
  // Num ansom: sticky rice rolled in a banana leaf, tied with strips of it.
  ansom: (c) => [
    [hex(c[0] ?? 0x5a9a3a), [1, 6, 13, 5]],
    [hex(shade(c[0] ?? 0x5a9a3a, 0.7)), [1, 10, 13, 1], [3, 7, 1, 1], [8, 8, 1, 1], [11, 7, 1, 1]],
    [hex(shade(c[0] ?? 0x5a9a3a, 1.25)), [2, 6, 11, 1]],
    ['#d8c8a0', [4, 5, 1, 7], [10, 5, 1, 7]],
    [WHITE, [14, 7, 1, 3]],
  ],
  // Num kom: a little pyramid of banana leaf (sticky rice, coconut and palm sugar inside).
  kom: (c) => [
    [hex(c[0] ?? 0x4a8a34), ...rows([[2, 7, 8], [3, 7, 8], [4, 6, 9], [5, 6, 9], [6, 5, 10], [7, 5, 10], [8, 4, 11], [9, 4, 11], [10, 3, 12], [11, 3, 12], [12, 2, 13], [13, 2, 13]])],
    [hex(shade(c[0] ?? 0x4a8a34, 0.7)), [8, 4, 1, 10], [9, 8, 3, 1]],
    [hex(shade(c[0] ?? 0x4a8a34, 1.3)), [6, 5, 1, 2], [5, 7, 1, 3]],
    ['#6a4a2a', [7, 1, 2, 1]],
  ],
  // Num plae ai: white rice balls rolled in grated coconut, on a leaf.
  plaeAi: (c) => [
    [LEAF, [1, 11, 14, 2], [2, 13, 12, 1]],
    [hex(c[0] ?? 0xf4f2ea), ...rows(BALL5, 2, 7), ...rows(BALL5, 6, 5), ...rows(BALL5, 10, 7), ...rows(BALL5, 6, 9)],
    ['#d8d0bc', [3, 11, 3, 1], [7, 13, 3, 1], [11, 11, 3, 1]],
    ['#c8a060', [4, 8, 1, 1], [8, 6, 1, 1], [12, 8, 1, 1]],
  ],
  // Num chahuoy: squares of jelly, green and pink.
  jelly: (c) => [
    [hex(c[0] ?? 0x6ac050), [1, 7, 6, 6]],
    [hex(c[1] ?? 0xf08aa8), [8, 5, 6, 6]],
    [WHITE, [2, 8, 2, 1], [9, 6, 2, 1]],
    [hex(shade(c[0] ?? 0x6ac050, 0.7)), [1, 12, 6, 1]],
    [hex(shade(c[1] ?? 0xf08aa8, 0.7)), [8, 10, 6, 1]],
  ],
  // Palm sugar: round cakes, stacked, one wrapped in a strip of palm leaf.
  palmSugar: (c) => {
    const a = c[0] ?? 0xb87a3a;
    return [
      [hex(a), [3, 3, 8, 3], [2, 6, 10, 3], [4, 9, 10, 3], [3, 12, 10, 2]],
      [hex(shade(a, 0.7)), [3, 5, 8, 1], [2, 8, 10, 1], [4, 11, 10, 1], [3, 13, 10, 1]],
      [hex(shade(a, 1.35)), [4, 3, 3, 1], [3, 6, 3, 1], [5, 9, 3, 1]],
      ['#c8b070', [9, 9, 1, 3], [12, 12, 1, 2]],
    ];
  },
  // A packet of biscuits from the village shop.
  biscuit: (c) => [
    [hex(c[0] ?? 0xd83a2a), [2, 4, 12, 9]],
    [hex(c[1] ?? 0xf0c030), [2, 4, 12, 2], [2, 11, 12, 2]],
    ['#e8c890', [5, 7, 2, 2], [9, 7, 2, 2]],
    [hex(shade(c[0] ?? 0xd83a2a, 0.7)), [2, 12, 12, 1]],
  ],
  // Grilled chicken on a split bamboo stick.
  chicken: (c) => [
    ['#d8b878', [7, 0, 2, 16]],
    [hex(c[0] ?? 0xb8642a), ...rows([[3, 5, 10], [4, 4, 11], [5, 3, 12], [6, 3, 12], [7, 3, 12], [8, 3, 12], [9, 4, 11], [10, 5, 10]])],
    [hex(shade(c[0] ?? 0xb8642a, 0.65)), [4, 8, 3, 1], [9, 6, 3, 1], [6, 10, 4, 1]],
    [hex(shade(c[0] ?? 0xb8642a, 1.35)), [5, 4, 3, 1], [4, 5, 1, 2]],
    ['#d8b878', [7, 11, 2, 1]],
  ],
  // Grilled corn on the cob.
  corn: (c) => [
    ['#d8b878', ...line(1, 15, 4, 12)],
    [hex(c[0] ?? 0xe8c040), ...rows([[3, 11, 12], [4, 10, 13], [5, 9, 13], [6, 8, 12], [7, 7, 11], [8, 6, 10], [9, 5, 9], [10, 4, 8], [11, 4, 7], [12, 5, 6]])],
    [hex(c[1] ?? 0x8a5a2a), [9, 5, 1, 1], [7, 8, 1, 1], [10, 6, 1, 1], [6, 10, 1, 1], [11, 4, 1, 1], [8, 7, 1, 1]],
    ['#9ab860', [12, 2, 2, 1], [13, 1, 2, 1]],
  ],
};

/** The item ids that have a picture of their own. */
export const ICON_OF: Record<string, keyof typeof OWN> = {
  chek: 'banana',
  savMav: 'rambutan',
  krauchThlong: 'pomelo',
  numAnsom: 'ansom',
  numKom: 'kom',
  numPlaeAi: 'plaeAi',
  numChahuoy: 'jelly',
  skorThnot: 'palmSugar',
  numKanhchap: 'biscuit',
  moanAng: 'chicken',
  potAng: 'corn',
};

/** The picture of a thing he can buy or carries (its item id, how it is eaten, its colours). */
export function itemIcon(what: { id: string; consume: ConsumeKind; colors?: readonly number[] }, cls = 'by-icon'): string {
  const own = ICON_OF[what.id];
  return svg(cls, (own ? OWN[own] : ART[what.consume])(what.colors ?? []));
}

/** A riel note (the purse): pale green, a little Angkor Wat of three towers on it (as the notes have temples). */
export const RIEL_ICON = svg('by-icon', [
  ['#5a8a5a', [0, 4, 16, 9]],
  ['#a8d098', [1, 5, 14, 7]],
  ['#cfe6c0', [2, 6, 4, 5]],
  ['#3a6a4a', [9, 7, 1, 1], [11, 6, 1, 2], [13, 7, 1, 1], [8, 8, 7, 1], [8, 9, 7, 1], [3, 7, 2, 1], [3, 9, 2, 1]],
  ['#7ab07a', [7, 11, 8, 1]],
]);

/** His bag of snacks: a bundle tied in a red-and-white krama. */
export const BAG_ICON = svg('by-icon', [
  ['#c8453a', [3, 5, 10, 9], [2, 7, 12, 6], [6, 2, 4, 3]],
  ['#f4ece0', [3, 7, 10, 1], [3, 10, 10, 1], [5, 5, 1, 9], [9, 5, 1, 9], [7, 2, 1, 3]],
  ['#8a2a24', [5, 4, 6, 1], [3, 13, 10, 1]],
  ['#e8b8a0', [11, 1, 2, 2], [4, 1, 2, 2]],
]);

/** A stall: a striped awning on two poles over a counter of goods. */
export const STALL_ICON = svg('by-icon', [
  ['#8a6a44', [2, 4, 1, 11], [13, 4, 1, 11]],
  ['#d8352a', [1, 1, 14, 3]],
  ['#f4ece0', [3, 1, 2, 3], [7, 1, 2, 3], [11, 1, 2, 3]],
  ['#b8281f', [1, 4, 14, 1]],
  ['#6a9a3a', [4, 8, 3, 2]],
  ['#f0b030', [8, 8, 3, 2]],
  ['#e8e4dc', [11, 8, 2, 2]],
  ['#7a5634', [2, 10, 12, 4]],
  ['#5a4028', [2, 13, 12, 1]],
]);
