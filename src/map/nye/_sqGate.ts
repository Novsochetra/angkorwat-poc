import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { HeightField } from '../heightfield';
import { BAYON_STONE, bondTone, carveFace, courseShade, FACE_TINY, fillBox, tone, type Side, type StoneTones } from '../landmarks/_faces';
import { GATE } from './plan';

/**
 * The square's entrance gate on the village side (AWP-35; plan.ts `GATE`), as Angkor Thom's gates: a stone
 * gopura of sandstone with a passage through it (a corbelled, pointed top, as the Khmer built them: no
 * true arch), false windows in its wings, and over the passage a tower with a Bayon face on each of its four
 * sides (landmarks/_faces.ts, the Bayon's own faces and stone), stepped tiers and a lotus bud on top.
 *
 * Built on a 0.5 m grid in the square's builder: ≈ 2.5 k blocks after the hidden ones go. Facing south (the
 * village side) as `GATE.facing` 0 says; the passage is `GATE.w` wide (4.5 m), 5 m high. Returns the gate's
 * footprint (map x0, z0, x1, z1) to keep trees off, and the passage's top (m over the ground).
 */

/** The Bayon's stone tones, warmed to the square's Kulen sandstone (the stage's, the pavers'): one place, not two. */
const STONE: StoneTones = {
  ...BAYON_STONE,
  wall: [0x988a74, 0x90826c, 0x9f917b, 0x8a7d68],
  mid: [0xa69882, 0x9e907a, 0xae9f88],
  light: [0xbcae95, 0xb4a68d, 0xc4b59c],
  bright: [0xd0c2a6, 0xc8ba9e, 0xd6c8ac],
  dark: [0x6a5e4e, 0x625747, 0x716453],
  deep: [0x2a241e, 0x302922, 0x26201b],
  shadow: [0x5a5043, 0x54493d, 0x5f5447],
  ledge: [0xab9d85, 0xa3957d, 0xb3a58c],
};

/** Grid cell (m). */
const C = 0.5;
/** Cells across (x), deep (z): odd, so the tower stands on the middle column. */
const NI = 27;
const NK = 11;
/** The low walls' laterite. */
const LATERITE = [0x9c6d50, 0x916349, 0xa67858, 0x8a5e46];

export function buildGate(b: VoxelBuilder, field: HeightField): { box: [number, number, number, number]; ground: number } {
  const ground = field.heightAt(GATE.x, GATE.z);
  const ox = GATE.x - (NI * C) / 2;
  const oz = GATE.z - (NK * C) / 2;
  // (row 0 is under the ground: the gate's foot never shows a gap on a slope)
  const g = b.grid({ cell: C, origin: [ox, ground - C, oz], mat: 'mapStone', jitter: 0.04, ao: 0.3, seed: 351 });
  const T = STONE;
  const seed = 351;
  const wall = (i: number, j: number, k: number) => bondTone(T.wall, i, j, k, seed);
  const ledge = (i: number, j: number, k: number) => tone(T.ledge, i, j, k, seed + 1);
  const shade = (_i: number, j: number) => courseShade(j);
  const ci = (NI - 1) / 2;
  const ck = (NK - 1) / 2;
  /** Half the passage (cells either side of the middle column) at row j, or −1 where it is closed. */
  const open = (j: number): number => (j >= 1 && j <= 10 ? 4 : j === 11 ? 3 : j === 12 ? 2 : j === 13 ? 1 : -1);

  // ── The body: wings either side of the passage, a moulded base, a cornice ──
  fillBox(g, 0, NI - 1, 0, 13, 0, NK - 1, (i, j, k) => (Math.abs(i - ci) <= open(j) ? null : j === 1 ? ledge(i, j, k) : wall(i, j, k)), 'mapStone', shade);
  // Base moulding (a step out all round) and the cornice (out again, a lip of lighter stone).
  for (const [j, out] of [
    [1, 1],
    [14, 1],
  ] as const)
    for (let i = -out; i < NI + out; i++)
      for (let k = -out; k < NK + out; k++) {
        if (j === 1 && Math.abs(i - ci) <= open(j)) continue;
        if (i >= 0 && i < NI && k >= 0 && k < NK && j !== 14) continue;
        g.put(i, j, k, { color: ledge(i, j, k), mat: 'mapStone', shade: 1.04 });
      }
  // False windows in the wings (both faces): a dark panel in a light frame, balusters across it.
  for (const k of [-1, NK]) {
    const kk = k < 0 ? 0 : NK - 1;
    for (const c0 of [3, NI - 8]) {
      for (let j = 4; j <= 9; j++)
        for (let i = c0; i < c0 + 5; i++) {
          const edge = j === 4 || j === 9 || i === c0 || i === c0 + 4;
          if (edge) g.put(i, j, k, { color: tone(T.light, i, j, k, seed + 2), mat: 'mapStone', shade: 1.02 });
          else g.put(i, j, kk, { color: (i - c0) % 2 ? tone(T.mid, i, j, kk, seed) : tone(T.deep, i, j, kk, seed), mat: 'mapStone', shade: (i - c0) % 2 ? 1 : 0.8 });
        }
    }
    // The lintel over the passage, carved lighter.
    for (let i = ci - 5; i <= ci + 5; i++) for (const j of [12, 13]) if (Math.abs(i - ci) > open(j)) g.put(i, j, k, { color: tone(T.bright, i, j, k, seed + 3), mat: 'mapStone', shade: 1 });
  }
  // The passage's floor: paving stones through it (the square's floor runs on outside).
  for (let i = ci - 4; i <= ci + 4; i++) for (let k = 0; k < NK; k++) g.put(i, 0, k, { color: tone(T.ledge, i, 0, k, seed + 4), mat: 'mapStone', shade: 0.95 });

  // ── The tower: a plinth, the faces, a cornice, stepped tiers, the lotus bud ──
  const square = (h: number, j0: number, j1: number, color: (i: number, j: number, k: number) => number, notch = true) =>
    fillBox(g, ci - h, ci + h, j0, j1, ck - h, ck + h, (i, j, k) => (notch && Math.abs(i - ci) === h && Math.abs(k - ck) === h ? null : color(i, j, k)), 'mapStone', shade);
  square(5, 15, 15, wall, false);
  square(5, 16, 16, ledge, false);
  const fj = 17;
  square(4, fj, fj + FACE_TINY.height - 1, wall, false);
  for (const side of ['S', 'E', 'N', 'W'] as Side[]) carveFace(g, { ci, ck, half: 4, j0: fj, side, face: FACE_TINY, tones: T, seed: seed + 7 });
  let j = fj + FACE_TINY.height;
  square(5, j, j, ledge, false);
  j++;
  for (const [h, rows] of [
    [4, 2],
    [3, 2],
    [2, 2],
    [1, 1],
  ] as const) {
    square(h, j, j + rows - 2, wall);
    square(h, j + rows - 1, j + rows - 1, ledge);
    // (corner pinnacles on the wider tiers)
    if (h >= 3) for (const [di, dk] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.put(ci + di * h, j + rows, ck + dk * h, { color: ledge(di, j, dk), mat: 'mapStone', shade: 1.05 });
    j += rows;
  }
  // The lotus bud: a round cushion, the bud, its tip.
  for (let di = -1; di <= 1; di++) for (let dk = -1; dk <= 1; dk++) if (di === 0 || dk === 0) g.put(ci + di, j, ck + dk, { color: tone(T.bright, di, j, dk, seed), mat: 'mapStone', shade: 1 });
  g.put(ci, j + 1, ck, { color: tone(T.bright, 0, j + 1, 0, seed), mat: 'mapStone', shade: 1.05 });
  g.put(ci, j + 2, ck, { color: tone(T.light, 0, j + 2, 0, seed), mat: 'mapStone', shade: 1.08 });

  // Low laterite walls either side, stepping down to the meadow: the gate stands in a line, not alone.
  for (const sgn of [-1, 1])
    for (let w = 0; w < 14; w++) {
      const i = sgn < 0 ? -1 - w : NI + w;
      const hh = w < 9 ? 3 : w < 12 ? 2 : 1;
      for (let jj = 0; jj <= hh; jj++)
        for (let k = ck - 1; k <= ck + 1; k++) g.put(i, jj, k, { color: jj === hh ? ledge(i, jj, k) : tone(LATERITE, i, jj, k, seed), mat: 'mapStone', shade: courseShade(jj) });
    }
  // A little moss on the cornice's lip, as on any old stone.
  g.forEach((i, jj, k, cell) => {
    if (jj === 14 && (k < 0 || k >= NK) && hash3(i, jj, k, seed + 9) < 0.18) cell.color = tone(T.moss, i, jj, k, seed);
  });
  g.commit();
  return { box: [ox - 8, oz - 1, ox + NI * C + 8, oz + NK * C + 1], ground };
}
