import type { BikeColourId, BikeKindId } from './_bikeOwn';

/**
 * Pixel art for the bicycle shop's card (roam/_bikeShopCard.ts), in the buy
 * menu's look (_shopIcons.ts: crisp pixels, full colour, the page's drop
 * shadow): each bicycle the shop sells side-on, 24 × 14 — two spoked wheels,
 * the step-through frame in its colour, the saddle, the bars and grips, and
 * its kind's fittings (the town bicycle's cane basket and rack, the lady's
 * white basket, cream saddle and grips, white mudguards and skirt guard, the
 * red one's padded seat on its rack, its lamp on the fork, streamers from the
 * grips). A black frame is drawn a shade lighter: it sits on the card's light
 * tile (`.bs-pic`) as the others do. `SHOP_ICON`: a bicycle and a spanner in
 * gold, for the card's title.
 */

type Px = readonly [x: number, y: number, key: string];

/** A wheel's tyre (9 × 9, centre (4, 4)) and its spokes. */
const WHEEL = ['...kkk...', '.kk...kk.', '.k..r..k.', 'k...r...k', 'k.rrhrr.k', 'k...r...k', '.k..r..k.', '.kk...kk.', '...kkk...'];

function wheel(out: Px[], cx: number, cy: number): void {
  WHEEL.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] !== '.') out.push([cx - 4 + i, cy - 4 + j, row[i]]);
  });
}

/** The pixels of a bicycle of `kind` (keys of the palette below), facing right: rear wheel at x 5, front at x 18. */
function pixels(kind: BikeKindId): Px[] {
  const p: Px[] = [];
  wheel(p, 5, 9);
  wheel(p, 18, 9);
  const lady = kind === 'lady';
  const carrier = kind === 'carrier';
  // Mudguards over both tyres.
  for (const x of [3, 4, 5, 6, 7]) p.push([x, 4, 'm']);
  for (const x of [16, 17, 18, 19]) p.push([x, 4, 'm']);
  // The frame: chain stays, seat tube, seat stays, the step-through tube, head tube, fork.
  for (const [x, y] of [[6, 9], [7, 10], [8, 10], [9, 10], [10, 10], [11, 10], [11, 9], [10, 8], [10, 7], [10, 6], [9, 5], [8, 5], [7, 6], [7, 7], [6, 8], [12, 9], [13, 8], [14, 7], [15, 6], [16, 5], [16, 4], [16, 3], [17, 6], [17, 7], [18, 8]] as const) p.push([x, y, 'F']);
  // The cranks and a pedal.
  p.push([11, 11, 'c'], [12, 12, 'c'], [13, 12, 'p']);
  // The saddle, its post.
  for (const x of [7, 8, 9, 10]) p.push([x, 3, 's']);
  p.push([9, 4, 'C']);
  // The stem, the bars back to the grips.
  p.push([16, 2, 'C'], [15, 1, 'C'], [14, 1, 'g'], [13, 1, 'g']);
  // The rack over the back wheel, its reflector.
  for (const x of [2, 3, 4, 5, 6]) p.push([x, carrier ? 4 : 3, 'R']);
  p.push([1, carrier ? 4 : 3, 'x']);
  if (carrier) {
    // A padded seat on the rack, the lamp on the fork, streamers from the grips.
    for (const x of [2, 3, 4, 5, 6]) p.push([x, 3, 'u']);
    p.push([3, 2, 'u'], [4, 2, 'u'], [5, 2, 'u']);
    p.push([18, 5, 'C'], [19, 5, 'L']);
    p.push([13, 2, 'S'], [12, 3, 'T'], [13, 3, 'U']);
  } else {
    // The basket before the bars (a rim, the weave), the lamp under it.
    for (const x of [17, 18, 19, 20, 21]) p.push([x, 1, 'B']);
    for (const x of [17, 18, 19, 20, 21]) for (const y of [2, 3]) p.push([x, y, (x + y) % 2 ? 'b' : 'd']);
    p.push([20, 4, 'C'], [21, 4, 'L']);
    if (lady) for (const [x, y] of [[2, 6], [3, 6], [2, 7], [3, 7], [4, 7], [2, 8], [3, 8]] as const) p.push([x, y, 'q']);
  }
  return p;
}

const FRAME: Record<BikeColourId, string> = { black: '#3a3a40', sky: '#6fb3dc', red: '#c4302a' };

function palette(kind: BikeKindId, colour: BikeColourId): Record<string, string> {
  const F = FRAME[colour];
  const lady = kind === 'lady';
  const carrier = kind === 'carrier';
  return {
    k: '#1a1a1c',
    r: '#a8a8b0',
    h: '#6a6a70',
    F,
    c: '#8a8a90',
    p: '#2a2a2a',
    s: lady ? '#d8c8a0' : carrier ? '#1e1e20' : '#4a3426',
    C: '#d4d4da',
    g: lady ? '#e8dcbe' : '#2a2a2a',
    R: '#8a8a90',
    x: '#d8302a',
    m: lady ? '#ece8de' : carrier ? '#d4d4da' : F,
    B: lady ? F : '#8a6430',
    b: lady ? '#f4f2ec' : '#c49a58',
    d: lady ? '#c8c3b4' : '#9a7438',
    L: '#ffe9a8',
    q: '#d6d2c4',
    u: '#2a2420',
    S: '#d83a30',
    T: '#f2c43a',
    U: '#3a9a5a',
  };
}

/** Pixels → an SVG of 1-pixel-high runs per colour (in the palette's order). */
function svg(cls: string, px: readonly Px[], pal: Record<string, string>, w: number, h: number, label = ''): string {
  // (later pixels over earlier ones: the frame over the wheels)
  const grid: (string | null)[] = new Array(w * h).fill(null);
  for (const [x, y, k] of px) if (x >= 0 && x < w && y >= 0 && y < h) grid[y * w + x] = k;
  const runs = new Map<string, string[]>();
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const k = grid[y * w + x];
      let n = 1;
      while (x + n < w && grid[y * w + x + n] === k) n++;
      if (k && pal[k]) {
        let l = runs.get(k);
        if (!l) runs.set(k, (l = []));
        l.push(`M${x} ${y}h${n}v1h-${n}z`);
      }
      x += n;
    }
  }
  const body = [...runs].map(([k, d]) => `<path fill="${pal[k]}" d="${d.join('')}"/>`).join('');
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'} shape-rendering="crispEdges">${body}</svg>`;
}

const made = new Map<string, string>();

/** A bicycle of `kind` in `colour`, side-on (24 × 14). */
export function bikePicture(kind: BikeKindId, colour: BikeColourId, cls = 'bs-bike'): string {
  const key = `${kind}|${colour}|${cls}`;
  let s = made.get(key);
  if (!s) made.set(key, (s = svg(cls, pixels(kind), palette(kind, colour), 24, 14)));
  return s;
}

/** The card's title: a town bicycle in gold with a spanner over it (16 × 16 tall-ish: 24 × 16). */
export function shopIcon(cls: string): string {
  const p = pixels('town').map(([x, y, k]): Px => [x, y + 2, k]);
  // (a spanner across the top left)
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [3, 2], [4, 3], [5, 4], [6, 5], [7, 6], [8, 6], [7, 7]] as const) p.push([x, y, 'W']);
  const gold: Record<string, string> = { k: '#5a4420', r: '#c8a050', h: '#8a6a30', F: '#f2c860', c: '#c8a050', p: '#8a6a30', s: '#c89a40', C: '#ffe08a', g: '#8a6a30', R: '#c8a050', x: '#f2c860', m: '#f2c860', B: '#c8a050', b: '#ffd878', d: '#c89a40', L: '#fff2b8', W: '#e8e8ee' };
  return svg(cls, p, gold, 24, 16);
}
