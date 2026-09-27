import type { MkBuild } from './_mkKit';

/**
 * Khmer words in pixels for the market's painted signs: each word as the
 * Koulen typeface (the sign painters' bold Khmer) draws it, one character a
 * pixel, so the signs are blocks like the rest of the map and need no font
 * at build time. Rows top to bottom, `#` = paint.
 *
 * - `MARKET_WORD`: "ផ្សារ" (market), at 22 px, over the way in;
 * - `NOODLE_WORD`: "នំបញ្ចុក" (num banh chok), at 16 px, on the noodle cart.
 */
export const MARKET_WORD = [
  '.........###......................',
  '..###########...###.####......###.',
  '.############..###########...#####',
  '.############..###########...#####',
  '############..#############.#####.',
  '####..........####....#####.####..',
  '.####..######..####...#####..####.',
  '.#####.######..#####..#####..#####',
  '.#####..#####..#####..#####..#####',
  '.#####..#####..#####..#####..#####',
  '.#####..#####..#####..#####..#####',
  '.#####..#####..#####..#####..#####',
  '.#####..#####..#####..#####..#####',
  '.############..#####..#####..#####',
  '.############..#####..#####..#####',
  '.############.#######.#####.######',
  '.############.#######.#####.######',
  '.#####..#####.#######.#####.######',
  '........####...#####..............',
  '........#####..#####..............',
  '........#####..#####..............',
  '........#####..#####..............',
  '........############..............',
  '.........##########...............',
  '...........######.................',
];

export const NOODLE_WORD = [
  '...###......................................',
  '..####......................................',
  '..#####.....................................',
  '..#####.....................................',
  '..####......................................',
  '............................................',
  '.######...###..###..####.#########.#########',
  '########..###..####.##############.#########',
  '###..###.###..###...#########.####..........',
  '###..###.####..###..########..####..#######.',
  '###..###..###..####.###..###..####..########',
  '.####.....###..####.###..###..####.#########',
  '..######..###..####.###..###..####.####.####',
  '###..###..###..####.###..###..####.####.####',
  '###..###..###..####.###..###..####.####.####',
  '########..####.####.####.###..####.####.####',
  '########..########..####.###..####.####.####',
  '########...#######..####.###..####.####.####',
  '..........................##...##...........',
  '.........................####.####..........',
  '..........................###.###...........',
  '..........................#######...........',
  '..........................#######...........',
  '..............................###...........',
  '..............................###...........',
  '..............................###...........',
  '..............................###...........',
];

/** A word's size in pixels (columns, rows). */
export const wordSize = (word: readonly string[]): [number, number] => [word[0].length, word.length];

/** The painted pixels as rectangles (columns c0‥c1, rows r0‥r1, inclusive): runs along a row, grown down while the rows below repeat them. */
function rects(word: readonly string[]): [number, number, number, number][] {
  const [cols, rows] = wordSize(word);
  const used = word.map((r) => [...r].map(() => false));
  const out: [number, number, number, number][] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (word[r][c] !== '#' || used[r][c]) continue;
      let c1 = c;
      while (c1 + 1 < cols && word[r][c1 + 1] === '#' && !used[r][c1 + 1]) c1++;
      let r1 = r;
      const same = (row: number) => {
        for (let k = c; k <= c1; k++) if (word[row][k] !== '#' || used[row][k]) return false;
        return (c === 0 || word[row][c - 1] !== '#' || used[row][c - 1]) && (c1 === cols - 1 || word[row][c1 + 1] !== '#' || used[row][c1 + 1]);
      };
      while (r1 + 1 < rows && same(r1 + 1)) r1++;
      for (let rr = r; rr <= r1; rr++) for (let k = c; k <= c1; k++) used[rr][k] = true;
      out.push([c, c1, r, r1]);
    }
  return out;
}
const RECTS = new Map<readonly string[], [number, number, number, number][]>();

/**
 * A word in raised letters on one face of a sign board (the builder's
 * frame: the board across x at z = 0): centred on (x, y), each pixel `px` m,
 * standing out toward `face` (−1: the −z side; +1 the +z side), mirrored so it
 * reads left to right from that side.
 */
export function signLetters(mk: MkBuild, word: readonly string[], x: number, y: number, z: number, px: number, face: number, color: number): void {
  let list = RECTS.get(word);
  if (!list) RECTS.set(word, (list = rects(word)));
  const [cols, rows] = wordSize(word);
  const w = cols * px;
  const h = rows * px;
  // (seen from −z, the viewer's right is −x: the first letter at +x)
  const dir = face < 0 ? -1 : 1;
  for (const [c0, c1, r0, r1] of list) {
    const u = ((c0 + c1 + 1) / 2) * px - w / 2;
    const v = h / 2 - ((r0 + r1 + 1) / 2) * px;
    mk.box(x + dir * u, y + v, z + face * 0.02, (c1 - c0 + 1) * px, (r1 - r0 + 1) * px, 0.05, color, 'mapBark', 1.08);
  }
}
