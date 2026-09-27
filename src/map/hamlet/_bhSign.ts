import type { Local } from '../village/_kit';

/**
 * "ទឹកដូង" (coconut water) in pixels, for the juice seller's painted sign:
 * the word as the Koulen typeface draws it at 22 px (the sign painters'
 * bold Khmer), one character a pixel, so the sign is blocks like the rest of
 * the map and needs no font at build time. Rows top to bottom, `#` = paint.
 */
const WORD = [
  '........###..........................................',
  '...#########.........................................',
  '..##########.........................................',
  '..###...####.........................................',
  '..#########..........................................',
  '.....................................................',
  '...................................####...####.......',
  '.##########...###########...#####..####...####...####',
  '.##########...###########...###########...####...####',
  '###########....##########...###########...###########',
  '#####..####..................#########.....#########.',
  '#####..####....#########.....###....###..........###.',
  '.####..####....##########...#####..####...####...####',
  '.#####.........##########...#####..####...####...####',
  '.##########...#####..####...#####..####...####...####',
  '...########...#####..####...#####..####...####...####',
  '.##...#####...#####..####...#####..####...####...####',
  '#####..####...#####..####...#####..####...####...####',
  '#####..####...#####..####...###########...####.#.####',
  '#####..####...#####..####...###########...###########',
  '.##########...#####..####...###########...###########',
  '.##########...#####..####...###########...###########',
  '..########....#####..####...#####..####...#####..####',
  '.....................................................',
  '................................##..###..............',
  '................................##..###..............',
  '................................##..###..............',
  '................................##..###..............',
  '................................#######..............',
  '................................#######..............',
  '..................................###................',
];

export const SIGN_COLS = WORD[0].length;
export const SIGN_ROWS = WORD.length;

/** The painted pixels as rectangles (columns c0‥c1, rows r0‥r1): runs along a row, grown down while the rows below repeat them. */
function rects(): [number, number, number, number][] {
  const used = WORD.map((r) => [...r].map(() => false));
  const out: [number, number, number, number][] = [];
  for (let r = 0; r < SIGN_ROWS; r++)
    for (let c = 0; c < SIGN_COLS; c++) {
      if (WORD[r][c] !== '#' || used[r][c]) continue;
      let c1 = c;
      while (c1 + 1 < SIGN_COLS && WORD[r][c1 + 1] === '#' && !used[r][c1 + 1]) c1++;
      let r1 = r;
      const same = (row: number) => {
        for (let k = c; k <= c1; k++) if (WORD[row][k] !== '#' || used[row][k]) return false;
        return (c === 0 || WORD[row][c - 1] !== '#' || used[row][c - 1]) && (c1 === SIGN_COLS - 1 || WORD[row][c1 + 1] !== '#' || used[row][c1 + 1]);
      };
      while (r1 + 1 < SIGN_ROWS && same(r1 + 1)) r1++;
      for (let rr = r; rr <= r1; rr++) for (let k = c; k <= c1; k++) used[rr][k] = true;
      out.push([c, c1, r, r1]);
    }
  return out;
}
const RECTS = rects();

/**
 * The word in raised letters on the +z face of a sign board standing across
 * x at `z` (a build's local frame): centred on (x, y), each pixel `px` m.
 */
export function signWord(L: Local, x: number, y: number, z: number, px: number, color: number): void {
  const w = SIGN_COLS * px;
  const h = SIGN_ROWS * px;
  // (read from the +z side the viewer's right is +x: the first letter at −x)
  for (const [c0, c1, r0, r1] of RECTS) {
    const u = ((c0 + c1 + 1) / 2) * px - w / 2;
    const v = h / 2 - ((r0 + r1 + 1) / 2) * px;
    L.box(x + u, y + v, z + 0.015, (c1 - c0 + 1) * px, (r1 - r0 + 1) * px, 0.03, color, 'mapStone', 1.08);
  }
}
