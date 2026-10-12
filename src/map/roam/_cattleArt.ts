/**
 * Pixel art for the cattle trader's card (roam/_cattleCard.ts), in the buy
 * menu's look (_shopIcons.ts, _gardenShopArt.ts: 16 × 16, crisp pixels, full
 * colour, lit from the top left, the page's drop shadow): the white Khmer cow
 * of the villages in profile — a hump over the shoulders, the dewlap, short
 * horns, drooping ears, long legs, its red collar and bronze bell; a young one
 * leaner; a calf small and big-headed, no bell —, a sheaf of rice straw tied
 * round its waist, and a riel note with a coin for selling.
 */

type Rect = readonly [x: number, y: number, w: number, h: number];
type Layer = readonly [color: string, ...rects: Rect[]];

/** Rows of characters (16 × 16; `.` empty) in a palette's colours → layers of 1-pixel runs (the palette's order: later over earlier). */
function paint(rows: readonly string[], pal: Readonly<Record<string, string>>): Layer[] {
  const by = new Map<string, Rect[]>();
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let n = 1;
      while (x + n < row.length && row[x + n] === ch) n++;
      if (ch !== '.' && pal[ch]) {
        let l = by.get(ch);
        if (!l) by.set(ch, (l = []));
        l.push([x, y, n, 1]);
      }
      x += n;
    }
  });
  return Object.keys(pal)
    .filter((ch) => by.has(ch))
    .map((ch): Layer => [pal[ch], ...by.get(ch)!]);
}

function svg(cls: string, layers: readonly Layer[]): string {
  const body = layers.map(([c, ...rs]) => `<path fill="${c}" d="${rs.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h-${w}z`).join('')}"/>`).join('');
  return `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">${body}</svg>`;
}

/** The cow's colours: its white coat, the shade under it, the pale belly, horns, muzzle, eye, hooves, collar, bell, the outline. */
const COW_PAL = {
  o: '#5a4a40',
  W: '#f2ede2',
  w: '#d8d0c0',
  B: '#faf7f0',
  h: '#9a8a6a',
  m: '#b09088',
  e: '#1a1410',
  k: '#3a3230',
  c: '#b02a22',
  b: '#d8a848',
  t: '#4a4034',
};

const GROWN = paint(
  [
    '................',
    '.............h..',
    '.......ooo..oho.',
    '......oWWWo.oWWo',
    '..ooooWWWWWooWWo',
    '.oWWWWWWWWWWWWeo',
    'otWWWWWWWWWWWWmo',
    'otWwWWWWWWWWWcmo',
    'ot.wwWWWWWWwwcb.',
    '.t.owBBBBBBwob..',
    '....w.w...w.w...',
    '....w.w...w.w...',
    '....w.w...w.w...',
    '....k.k...k.k...',
    '................',
    '................',
  ],
  COW_PAL,
);

const YOUNG = paint(
  [
    '................',
    '................',
    '................',
    '.........o...oho',
    '........oWo.oWWo',
    '...ooooooWWooWWo',
    '..oWWWWWWWWWWWeo',
    '.otWWWWWWWWWWWmo',
    '.otWwWWWWWWWWcmo',
    '.ot.wBBBBBBwwco.',
    '....w.w...w.w...',
    '....w.w...w.w...',
    '....w.w...w.w...',
    '....k.k...k.k...',
    '................',
    '................',
  ],
  COW_PAL,
);

const CALF = paint(
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '..........oooo..',
    '.........oWWWWo.',
    '....ooooooWWWeo.',
    '...oWWWWWWWWWmmo',
    '..otWWWWWWWWWmo.',
    '..ot.wBBBBBwwo..',
    '.....w.w..w.w...',
    '.....w.w..w.w...',
    '.....w.w..w.w...',
    '.....k.k..k.k...',
    '................',
  ],
  COW_PAL,
);

/** A sheaf of rice straw standing, tied round its waist, fanning out above (as the hunger icon over a cow: _cattleIcon.ts). */
const STRAW = paint(
  [
    '...o.oo..oo.o...',
    '..oYoYYooYYoYo..',
    '..oYLYYdYYdYYo..',
    '...oYLYYdYYYo...',
    '...oYLYYdYYYo...',
    '....oYLYdYYo....',
    '....oYLYdYYo....',
    '.....oYYdYo.....',
    '.....otttto.....',
    '.....oTTTTo.....',
    '.....oYdYYo.....',
    '....oYYdYYYo....',
    '....oYYdYdYo....',
    '...oYYYdYdYYo...',
    '...oooooooooo...',
    '................',
  ],
  { o: '#3a2410', Y: '#e6c25c', L: '#fff0b8', d: '#c49a3a', t: '#7a4a1a', T: '#9a6224' },
);

/** A riel note and a coin (the Sell tab: he is paid for his cow). */
const PURSE = paint(
  [
    '................',
    '................',
    '................',
    '.gggggggggggg...',
    '.gGGGGGGGGGGg...',
    '.gGLLLGGddGGg...',
    '.gGLLLGdddGGg...',
    '.gGLLLGGGGGGg...',
    '.gGGGGGGGddGgyy.',
    '.gggggggggggyYYy',
    '...........yYWYy',
    '...........yYYYy',
    '............yyy.',
    '................',
    '................',
    '................',
  ],
  { g: '#5a8a5a', G: '#a8d098', L: '#cfe6c0', d: '#3a6a4a', y: '#b8862a', Y: '#f2c23a', W: '#fff2b8' },
);

export type CattleArt = 'grown' | 'young' | 'calf' | 'straw' | 'purse';
const ART: Record<CattleArt, Layer[]> = { grown: GROWN, young: YOUNG, calf: CALF, straw: STRAW, purse: PURSE };

/** A picture of the card's (16 × 16). */
export const cattleIcon = (a: CattleArt, cls = 'by-icon'): string => svg(cls, ART[a]);
