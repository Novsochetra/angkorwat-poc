import { traceSource } from '../../feedback/sourceTrace';
import type { VoxelBox, VoxelBuilder } from '../../voxel/VoxelBuilder';

/**
 * The hand-painted sign of the family's stall by the palm lane, like the
 * boards by Cambodia's roads where a family sells its own: "ស្ករត្នោត" (palm
 * sugar) big in dark red and, under it, "ទឹកត្នោតស្រស់" (fresh palm juice) in
 * blue, on a whitewashed board of three planks on two posts. The words are
 * pixels (Koulen, the sign painters' bold Khmer as on the market's and the
 * hamlets' signs, 26 and 16 px, drawn by the browser so the subscript
 * letters sit right; `#` = paint), each run of paint one raised block, so
 * the sign is blocks like the rest of the map and needs no font at build
 * time.
 */
const WORD = [
  '.##########.....#####....####....#####...####################.....#############',
  '.##########.....#####...#####...######...#####################....#############',
  '###########....######..######...######...#####################....#############',
  '####...........###.....####....####......................#####.................',
  '.####..........####....#####...#####.....................#####.................',
  '.###########...#####....#####...#####.....###########....#####.....###########.',
  '############....#####...#####....#####...#############...#####....############.',
  '#############...#####...#####....#####...#############...#####....#############',
  '#####...#####...#####...#####....#####...#####...#####...#####....#####...#####',
  '#####...#####...#####...#####....#####...#####...#####...#####....#####...#####',
  '#####...#####...#####...#####....#####...#####...#####...#####....#####...#####',
  '#####...#####...#####...#####....#####...#####...#####...#####....#####...#####',
  '#####...#####...#####...#####....#####...#####...#####...#####....#####...#####',
  '#####...#####...#####...#####....#####...#####...#####...#####....#####...#####',
  '#####...#####...#####...#####....#####...#####...#####...#####....#####...#####',
  '#####...#############...#####....#####...#####...#####...#####....#####...#####',
  '######..#############..######....######..######..#####...#####....######..#####',
  '######...###########...######....######..######..#####...#####....######..#####',
  '######....#########....######....######..######..#####....####....######..#####',
  '...............................................................................',
  '.........###########............................#####..........................',
  '.........###########......................############.........................',
  '.........####...####......................############.........................',
  '.........####...####......................####..#####..........................',
  '.........####...####......................############.........................',
  '.........####...####............................######.........................',
  '.........###.....###.............................#####.........................',
];
/** "ទឹកត្នោតស្រស់" (fresh palm juice), Koulen 16 px. */
const JUICE = [
  '...............................................................................##...',
  '...............................................................................##...',
  '..######.......................................................................##...',
  '.#######.......................................................................##...',
  '.#######.......................................................................##...',
  '....................................................................................',
  '.######...########..###..#############...########..###...######...###...######...###',
  '########..########..###..#############...########.####..#######...###..#######...###',
  '###..###...........###.............####...........##....###......###...###......###.',
  '###..###...######...###...######....###...######..###....######..###....######...###',
  '###..##....#######..###...#######...###..#######...###..########..###..########..###',
  '.#######..####.###..###..####.###...###..###.####..###..###..###..###..###..###..###',
  '..######..###..###..###..###..###...###..###..###..###..###..###..###..###..###..###',
  '###..###..###..###..###..###..###...###..###..###..###..###..###..###..###..###..###',
  '###..###..###..###..###..###..###...###..###..###..###..###..###..###..###..###..###',
  '###..###..###..###..###..###..###...###..###..###..###..###..###..###..###..###..###',
  '########..###..###..####.####.###...###..###..###..###..####.########..####.########',
  '.######...###..###..####.####.###...###..###..###..###..####..######...####..######.',
  '..............................##...................###..##..........................',
  '..........................#######..................###..###.........................',
  '..........................#######..................###..###.........................',
  '..........................#######..................########.........................',
  '..............................###...................######..........................',
];
/** The paint of a word as rectangles (columns c0‥c1, rows r0‥r1): runs along a row, grown down while the rows below repeat them. */
function rects(word: readonly string[]): [number, number, number, number][] {
  const ROWS = word.length;
  const COLS = word[0].length;
  const used = word.map((r) => [...r].map(() => false));
  const out: [number, number, number, number][] = [];
  const free = (r: number, c: number) => word[r][c] === '#' && !used[r][c];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (!free(r, c)) continue;
      let c1 = c;
      while (c1 + 1 < COLS && free(r, c1 + 1)) c1++;
      let r1 = r;
      const same = (row: number) => {
        for (let k = c; k <= c1; k++) if (!free(row, k)) return false;
        return (c === 0 || !free(row, c - 1)) && (c1 === COLS - 1 || !free(row, c1 + 1));
      };
      while (r1 + 1 < ROWS && same(r1 + 1)) r1++;
      for (let rr = r; rr <= r1; rr++) for (let k = c; k <= c1; k++) used[rr][k] = true;
      out.push([c, c1, r, r1]);
    }
  return out;
}

/** The sign's lines: the word, its pixel's size (m), its paint. */
const LINES = [
  { word: WORD, px: 0.022, color: 0x9a2420 },
  { word: JUICE, px: 0.0155, color: 0x1f4a7a },
];
/** The gap between the lines, the margin round them (m). */
const GAP = 0.09;
const MARGIN = 0.14;

/**
 * The sign standing at (x, y, z) on the ground, its painted face looking
 * along `face` (radians from +z toward +x), the board's middle `mid` m up:
 * two posts, a board of three whitewashed planks, the words raised on it
 * (their letters go into `small`: drawn only near).
 */
export function psSign(b: VoxelBuilder, x: number, y: number, z: number, face: number, small: Set<VoxelBox>, mid = 1.65): void {
  const src = traceSource();
  const fx = Math.sin(face);
  const fz = Math.cos(face);
  // (the board's own axes: `u` across it — the reader's left, seen from the face — and `w` out of its face; a block turned by
  // `face` has its width along u and its depth along w)
  const ux = -fz;
  const uz = fx;
  const put = (u: number, v: number, w: number, su: number, sv: number, sw: number, color: number, shade = 1) =>
    b.box(x + ux * u + fx * w, y + v, z + uz * u + fz * w, su, sv, sw, color, 'mapBark', { src, shade, ry: face });
  const W = Math.max(...LINES.map((l) => l.word[0].length * l.px)) + 2 * MARGIN;
  const H = LINES.reduce((s, l) => s + l.word.length * l.px, 0) + GAP * (LINES.length - 1) + 2 * MARGIN;
  for (const s of [-1, 1]) put((s * W) / 2 - s * 0.12, (mid + H / 2 + 0.05) / 2, -0.07, 0.1, mid + H / 2 + 0.05, 0.1, 0x6a5038, 0.95);
  const planks = 3;
  for (let k = 0; k < planks; k++) {
    const h = H / planks;
    put(0, mid - H / 2 + h * (k + 0.5), 0, W, h - 0.02, 0.05, [0xe8e0cc, 0xdcd4bf, 0xe2dac6][k], 0.98 + 0.03 * k);
  }
  // The words, raised on the face (mirrored as seen from it: each first letter on the reader's left), one line under the other.
  let top = mid + H / 2 - MARGIN;
  for (const { word, px, color } of LINES) {
    const cols = word[0].length;
    for (const [c0, c1, r0, r1] of rects(word)) {
      const u = -(((c0 + c1 + 1) / 2) * px - (cols * px) / 2);
      const v = top - ((r0 + r1 + 1) / 2) * px;
      put(u, v, 0.03, (c1 - c0 + 1) * px, (r1 - r0 + 1) * px, 0.03, color, 1.05);
      small.add(b.boxes[b.boxes.length - 1]);
    }
    top -= word.length * px + GAP;
  }
}
