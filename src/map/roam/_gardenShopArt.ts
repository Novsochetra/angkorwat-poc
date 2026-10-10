import type { PlantKindId } from '../garden/kinds';
import { ICON_OF, OWN } from './_shopIcons';

/**
 * Pixel art for the nursery (roam/_gardenShop*.ts) and for his harvest in his
 * bag (roam/_gardenEat.ts), in the buy menu's look (_shopIcons.ts: 16 × 16,
 * crisp pixels, full colour, lit from the top left, the page's drop shadow):
 *
 * - `kindIcon`: each of the twelve plants by what it gives (a long purple
 *   eggplant with its green cap, an ear of corn in its husk, a green ribbed
 *   Khmer pumpkin, two sugarcanes, a hand of bananas, a papaya cut open, a
 *   guava cut open, a ripe mango with its leaf, a jackfruit, a durian, a
 *   green coconut, sugar palm fruit with one opened);
 * - `SEEDLING_ICON`: a seedling in its black nursery bag (the card's title,
 *   the Buy tab), `HARVEST_ICON`: a woven basket of fruit (the Sell tab).
 *
 * The fruit he keeps to eat are items of their own in his bag (`EAT_ID`):
 * their pictures go into the bag's (`OWN`, `ICON_OF`), so the tool bar's slot
 * and "In my bag" show the fruit itself.
 */

type Rect = readonly [x: number, y: number, w: number, h: number];
type Layer = readonly [color: string, ...rects: Rect[]];

/** Rows of characters (16 × 16; `.` empty) in a palette's colours → layers of 1-pixel-high runs. */
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
  // (in the palette's order: later colours over earlier)
  return Object.keys(pal)
    .filter((ch) => by.has(ch))
    .map((ch): Layer => [pal[ch], ...by.get(ch)!]);
}

const STEM = '#6a4a2a';
const LEAF = '#4a8a34';
const LEAF_D = '#356a28';

const ART: Record<Exclude<PlantKindId, 'bodhi'>, Layer[]> = {
  eggplant: paint(
    [
      '................',
      '...........gg...',
      '..........gGGg..',
      '.........gGGgg..',
      '........pPhgg.g.',
      '.......pPhhPp...',
      '......pPhPPPp...',
      '.....pPhPPPPp...',
      '....pPhPPPPp....',
      '...pPPPPPPpd....',
      '..pPPPPPPpd.....',
      '..pPPPPPpd......',
      '..pPPPPpd.......',
      '..ppPPpd........',
      '...pddd.........',
      '................',
    ],
    { p: '#4a1a5a', P: '#6a2a7a', h: '#9a5aaa', d: '#341040', g: LEAF_D, G: '#5a9a3a' },
  ),
  corn: paint(
    [
      '..............s.',
      '............yYs.',
      '...........yYYy.',
      '..........yYkYy.',
      '.........yYYYYy.',
      '........yYkYYy..',
      '.......yYYYkY...',
      '......yYkYYYy...',
      '.....gyYYYky....',
      '....gGgyYYy.....',
      '...gGGGgyy......',
      '..gGGgGGg.......',
      '..gGg.gGg.......',
      '.gGg...gg.......',
      '.gg.............',
      '................',
    ],
    { y: '#c89a20', Y: '#f0c838', k: '#f8e070', g: '#4a7a2a', G: '#7ab04a', s: '#a8743a' },
  ),
  pumpkin: paint(
    [
      '................',
      '.......bb.......',
      '........b.......',
      '....gGGrGGGg....',
      '..gGGlGrGlGGGg..',
      '.gGlGGGrGGGlGGg.',
      '.gGGGrGGGrGGGGg.',
      'gGlGGrGGGrGGlGGg',
      'gGGGGrGGGrGGGGGg',
      'gGGlGrGGGrGlGGGg',
      '.gGGGrGGGrGGGGg.',
      '.gGGGGrGrGGGGGg.',
      '..gGoOoGGoOogg..',
      '....gggggggg....',
      '................',
      '................',
    ],
    { g: '#2f5a2a', G: '#4a7a3a', r: '#355f2c', l: '#9ab86a', o: '#d89a3a', O: '#e8b050', b: STEM },
  ),
  sugarcane: paint(
    [
      '.........g...G..',
      '........gG..gG..',
      '...G...gG..gG...',
      '...gG..pPgGg....',
      '....gG.pPG......',
      '....pP.nn.......',
      '....pP.pP.......',
      '....nn.pP.......',
      '....pP.pP.......',
      '....pP.nn.......',
      '....pP.pP.......',
      '....nn.pP.......',
      '....pP.pP.......',
      '....pP.nn.......',
      '....pP.pP.......',
      '................',
    ],
    { p: '#5a2a44', P: '#7a3a5a', n: '#c8b878', g: LEAF_D, G: '#6aa840' },
  ),
  banana: OWN.banana([0xf2d24a]) as Layer[],
  papaya: paint(
    [
      '................',
      '.....g..........',
      '....gG..........',
      '...yYYYy........',
      '..yYOOOYy.......',
      '..yOOOOOYy......',
      '.yYOOkOkOYy.....',
      '.yOOkkkkkOYy....',
      '.yOOkkkkkOOYg...',
      '.yOOOkkkOOOYg...',
      '.yYOOOOOOOOYgg..',
      '..yYOOOOOOYyg...',
      '...yYOOOOYyg....',
      '....yyYYyyg.....',
      '................',
      '................',
    ],
    { y: '#c88a28', Y: '#f0a030', O: '#f07a3a', k: '#2a2018', g: '#7aa040', G: '#5a8a30' },
  ),
  guava: paint(
    [
      '................',
      '.......b........',
      '.......bLL......',
      '....gGGGGg......',
      '...gGlGGGGg.....',
      '..gGlGGGGGGg....',
      '..gGGGGGWWWWg...',
      '..gGGGGWWwWWWg..',
      '..gGGGGWwPwWWg..',
      '..gGGGGWWwWWWg..',
      '..gGGGGGWWWWg...',
      '...gGGGGGGGg....',
      '....ggggggg.....',
      '................',
      '................',
      '................',
    ],
    { g: '#7a9a40', G: '#a8c860', l: '#d0e090', W: '#f4f0d8', w: '#d8c8a0', P: '#f0b0a8', b: STEM, L: LEAF },
  ),
  mango: paint(
    [
      '................',
      '.........b......',
      '.........bLL....',
      '........b.LLL...',
      '......yYYy......',
      '....yYYYYYYy....',
      '...yYhYYYYYYr...',
      '..yYhYYYYYYYrr..',
      '..yYhYYYYYYrRr..',
      '..yYYYYYYYYrRr..',
      '..yYYYYYYYrRRr..',
      '...yYYYYYrRRr...',
      '....yyYYrRRr....',
      '......yyrrr.....',
      '................',
      '................',
    ],
    { y: '#d8a028', Y: '#f2c23a', h: '#fae080', r: '#c8582a', R: '#e8803a', b: STEM, L: LEAF },
  ),
  jackfruit: paint(
    [
      '................',
      '.......bb.......',
      '.......b........',
      '.....gGGGGg.....',
      '....gGkGlkGg....',
      '...gGlGGkGGGg...',
      '...gkGlkGGGkg...',
      '...gGlkGGkGGg...',
      '...gGkGGGGkGg...',
      '...gGGGkGGGGg...',
      '...gkGGGGkGGg...',
      '...gGGkGGGGkg...',
      '....gGGGkGGg....',
      '.....gggggg.....',
      '................',
      '................',
    ],
    { g: '#7a7a2a', G: '#b8b848', k: '#8a8a30', l: '#d8d470', b: STEM },
  ),
  durian: paint(
    [
      '................',
      '.......bb.......',
      '...s..s.b.s.s...',
      '....gGGsGGGg....',
      '..sgGsGGGsGGgs..',
      '...gGlGsGGsGg...',
      '.sgGlGGGGsGGGgs.',
      '..gGGGsGGGGsGg..',
      '.sgGGsGGsGGGGgs.',
      '..gGsGGGGGsGGg..',
      '...gGGGsGGGGg...',
      '..s.gGGGGsGg.s..',
      '.....gggggg.....',
      '.......s........',
      '................',
      '................',
    ],
    { g: '#5a6a28', G: '#8a9a3a', l: '#b8c060', s: '#6a6a20', b: STEM },
  ),
  coconut: paint(
    [
      '................',
      '................',
      '......bbb.......',
      '.....gGGGg......',
      '...gGGGGGGGg....',
      '..gGlGGGGGGGg...',
      '..gGlGGGGGGGGg..',
      '.gGlGGGGGGGGGg..',
      '.gGGGGGGGGGGGg..',
      '.gGGGGGGGGGGdg..',
      '.gGGGGGGGGGdGg..',
      '..gGGGGGGGddg...',
      '..gGGGGGGdGg....',
      '...ggGGGGgg.....',
      '.....gggg.......',
      '................',
    ],
    { g: '#4a7a2a', G: '#6a9a3a', l: '#9ac860', d: '#5a8a32', b: '#8a6438' },
  ),
  sugarPalm: paint(
    [
      '................',
      '................',
      '...ggg..........',
      '..dDDDd..ggg....',
      '.dDhDDDd.dDDd...',
      '.dDDDDDddDhDDd..',
      '.dDDDDDddDDDDd..',
      '..dDDDd.dDDDDd..',
      '...ddd...dddd...',
      '....dwWWWwd.....',
      '...dwWWWWWwd....',
      '...dWWwWwWWd....',
      '...dwWWWWWwd....',
      '....dwWWWwd.....',
      '.....ddddd......',
      '................',
    ],
    { d: '#18141c', D: '#2a2430', h: '#5a5068', g: '#8a9a3a', W: '#f4f0d8', w: '#d8d4c0' },
  ),
};

function svg(cls: string, layers: readonly Layer[], label = ''): string {
  const body = layers.map(([c, ...rs]) => `<path fill="${c}" d="${rs.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h-${w}z`).join('')}"/>`).join('');
  return `<svg class="${cls}" viewBox="0 0 16 16" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'} shape-rendering="crispEdges">${body}</svg>`;
}

/** A plant's picture (what it gives), 16 × 16. */
export const kindIcon = (k: PlantKindId, cls = 'by-icon'): string => svg(cls, k === 'bodhi' ? SEEDLING : ART[k]);

const SEEDLING = paint(
  [
    '................',
    '.......L........',
    '......LlL.LL....',
    '...LL..L.LlL....',
    '...LlL.L.L......',
    '....LL.LL.......',
    '.......L........',
    '.......L........',
    '....sssssss.....',
    '...kKKKKKKKk....',
    '...kKhKKKKKk....',
    '...kKhKKKKKk....',
    '...kKKKKKKKk....',
    '...kKKKKKKKk....',
    '....kkkkkkk.....',
    '................',
  ],
  { L: '#4a8a34', l: '#7ab84a', s: '#5a3e28', k: '#141416', K: '#2a2a2e', h: '#4a4a50' },
);

/** A seedling in its black nursery bag. */
export const SEEDLING_ICON = (cls: string): string => svg(cls, SEEDLING);

/** A round woven basket of fruit (a mango, a banana, a guava). */
export const HARVEST_ICON = (cls: string): string =>
  svg(
    cls,
    paint(
      [
        '................',
        '................',
        '................',
        '.....yY..Gg.....',
        '...rRyYYGgGO....',
        '..rRRyYYGgOOO...',
        '.tTTTTTTTTTTTt..',
        '.tWTWTWTWTWTWt..',
        '.tTWTWTWTWTWTt..',
        '..tWTWTWTWTWt...',
        '..tTWTWTWTWTt...',
        '...tWTWTWTWt....',
        '....tttttt......',
        '................',
        '................',
        '................',
      ],
      { r: '#c8582a', R: '#f2c23a', y: '#d8b030', Y: '#f2d24a', G: '#a8c860', g: '#7a9a40', O: '#e8803a', t: '#8a6430', T: '#c49a58', W: '#e0c58a' },
    ),
  );

/** The item id of a garden fruit he keeps to eat (his bag: _shopPurse.ts `Kept`). */
export const EAT_ID = (k: PlantKindId): string => `garden-${k}`;

// (its picture in his bag: the tool bar's slot and "In my bag" draw `OWN[ICON_OF[id]]`)
for (const k of Object.keys(ART) as (keyof typeof ART)[]) {
  OWN[`garden${k}`] = () => ART[k];
  ICON_OF[EAT_ID(k)] = `garden${k}`;
}
