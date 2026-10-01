import { fishModel, shade, type FishKind } from './_fishKinds';

/**
 * Pixel art for selling his fish (the catch card, the sale card, his bag),
 * in the look of the buy menu's icons (_shopIcons.ts: crisp pixels, full
 * colour, a drop shadow from the page's CSS):
 *
 * - `fishIcon`: each fish from its left flank, cell by cell from its own
 *   voxel model (_fishKinds.ts, as the nature book's plate: _fishPlate.ts),
 *   lit from above, in a dark ink outline; made once a kind;
 * - `BASKET_ICON`: his woven bamboo fish basket, a tail out of its mouth;
 * - `SCALE_ICON`: the fish seller's hanging dial scale (its needle is
 *   `.sl-needle`: the cards swing it while she weighs).
 */

type Rect = readonly [x: number, y: number, w: number, h: number];
type Layer = readonly [color: string, ...rects: Rect[]];

const hex = (c: number) => `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;
const path = (rs: readonly Rect[]) => rs.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h-${w}z`).join('');

function svg(cls: string, w: number, h: number, layers: readonly Layer[], extra = ''): string {
  const body = layers.map(([c, ...rs]) => `<path fill="${c}" d="${path(rs)}"/>`).join('');
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true" shape-rendering="crispEdges" preserveAspectRatio="xMidYMid meet">${body}${extra}</svg>`;
}

const icons = new Map<FishKind, { w: number; h: number; body: string }>();

/** A fish from its left flank, snout to the left (its own model's cells), in an ink outline. */
export function fishIcon(kind: FishKind, cls: string): string {
  let ic = icons.get(kind);
  if (!ic) icons.set(kind, (ic = drawFish(kind)));
  return `<svg class="${cls}" viewBox="0 0 ${ic.w} ${ic.h}" aria-hidden="true" shape-rendering="crispEdges" preserveAspectRatio="xMidYMid meet">${ic.body}</svg>`;
}

function drawFish(kind: FishKind): { w: number; h: number; body: string } {
  const m = fishModel(kind);
  // (the outermost cell of each column and row, as the flank shows it)
  const seen = new Map<number, { k: number; color: number }>();
  const id = (i: number, j: number) => (i + 4) * 128 + (j + 64);
  for (const cl of m.cells) {
    const o = seen.get(id(cl.i, cl.j));
    if (!o || cl.k > o.k) seen.set(id(cl.i, cl.j), { k: cl.k, color: cl.color });
  }
  const has = (i: number, j: number) => seen.has(id(i, j));
  // (one cell of outline all round; the barbels stand at i = −1)
  const x0 = 2;
  const y0 = m.jMax + 1;
  const w = m.n + 4;
  const h = m.jMax - m.jMin + 3;
  const byColor = new Map<string, Rect[]>();
  const add = (c: string, r: Rect) => {
    let l = byColor.get(c);
    if (!l) byColor.set(c, (l = []));
    l.push(r);
  };
  const ink: Rect[] = [];
  for (const key of seen.keys()) {
    const i = Math.floor(key / 128) - 4;
    const j = (key % 128) - 64;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      if (!has(i + di, j + dj)) ink.push([x0 + i + di, y0 - (j + dj), 1, 1]);
  }
  for (const [key, cl] of seen) {
    const i = Math.floor(key / 128) - 4;
    const j = (key % 128) - 64;
    // Lit from above: the top edge lighter, the bottom edge darker; a glint along the wet back.
    const k = !has(i, j + 1) ? 1.14 : !has(i, j - 1) ? 0.82 : 1;
    const glint = !has(i, j + 1) && i > m.n * 0.2 && i < m.n * 0.55 && i % 3 === 0;
    add(glint ? '#f4f6f2' : hex(shade(cl.color, k)), [x0 + i, y0 - j, 1, 1]);
  }
  const layers: Layer[] = [['#1d1a17', ...ink], ...[...byColor].map(([c, rs]): Layer => [c, ...rs])];
  return { w, h, body: layers.map(([c, ...rs]) => `<path fill="${c}" d="${path(rs)}"/>`).join('') };
}

/** His fish basket: a flared mouth, the neck bound with cord, a round woven belly, a tail out of the mouth. */
export const BASKET_ICON = (cls: string): string =>
  svg(cls, 16, 16, [
    ['#b8c0c4', [9, 0, 1, 1], [11, 0, 1, 1], [9, 1, 3, 1], [10, 2, 1, 1]],
    ['#7c858a', [12, 0, 1, 1], [8, 0, 1, 1]],
    ['#c49a58', [3, 2, 10, 1]],
    ['#a8834a', [4, 3, 8, 1]],
    ['#5a3a22', [5, 4, 6, 2]],
    ['#d9bb7c', [4, 6, 8, 1], [3, 7, 10, 1], [2, 8, 12, 4], [3, 12, 10, 1], [4, 13, 8, 1]],
    ['#a8834a', [4, 7, 1, 1], [7, 7, 1, 1], [10, 7, 1, 1], [3, 9, 1, 1], [6, 9, 1, 1], [9, 9, 1, 1], [12, 9, 1, 1], [4, 11, 1, 1], [7, 11, 1, 1], [10, 11, 1, 1]],
    ['#e6cf98', [5, 8, 1, 1], [8, 8, 1, 1], [11, 8, 1, 1], [5, 10, 1, 1], [8, 10, 1, 1], [11, 10, 1, 1]],
    ['#8a6430', [5, 14, 6, 1]],
  ]);

/** The fish seller's hanging dial scale: a ring, the round face (its red needle: `.sl-needle`), the hook. */
export const SCALE_ICON = (cls: string): string =>
  svg(
    cls,
    16,
    16,
    [
      ['#8a8f94', [7, 0, 2, 1], [6, 1, 1, 1], [9, 1, 1, 1], [7, 2, 2, 1]],
      ['#c8ccd0', [5, 3, 6, 1], [4, 4, 1, 6], [11, 4, 1, 6], [5, 10, 6, 1]],
      ['#f4f2ea', [5, 4, 6, 6]],
      ['#3a3a3a', [6, 4, 1, 1], [9, 4, 1, 1], [5, 6, 1, 1], [10, 6, 1, 1]],
      ['#8a8f94', [7, 11, 2, 1], [7, 12, 1, 2], [8, 14, 2, 1], [10, 13, 1, 1]],
    ],
    // (the needle turns about the face's middle)
    '<g class="sl-needle"><path fill="#d8352a" d="M7.5 7h1v-2.6h-1z"/><path fill="#3a3a3a" d="M7 7h2v1h-2z"/></g>',
  );
