import type { HeightField } from '../heightfield';
import { KHMER_PAINT } from './kinds';
import { gableRoof, smoothRoof, type Cell } from './roof';
import { BLOCKS, cellMid, cellOf, type Block, type BlockStore } from './store';

/**
 * Test builds for the player's block layer (`pblocks=` in the URL: shots and
 * the dev server only, never on the live site: index.ts; nothing is saved):
 *
 * - `demo`: one sala (សាលា, an open pavilion) on the meadow before his stilt
 *   house, in a few hundred blocks: a laterite plinth (sunk to the ground
 *   over the slope) with a course of brick under its sandstone coping, a ring
 *   of sandstone slabs round it as a step, twelve posts (timber at the
 *   corners, bamboo between), a beam ring painted lacquer red, a palm thatch
 *   roof in stepped rings two cells deep, a gold finial: all six materials,
 *   the slab, painted blocks.
 * - `full`: a full plot: nine salas, 3 × 3, 8 m apart (9,925 blocks over
 *   about 24 × 24 m, the plinths sunk to the sloping ground: 8 chunks), for
 *   the frame's cost (`npm run perf`).
 *
 * - `walk`: the walk map's test course (AWP-17) on the flat meadow west of
 *   his stilt house (8 m up, x 418‥426, z −172‥−163; `@x,z` its corner): a
 *   stair of slab steps (0.25 m each, 1 m wide treads of half a metre, 2 m
 *   across) up to a floor 2 m high (4 × 4 m, timber on laterite), a brick
 *   wall 2.5 m high and 5 m long north of it, and a low wall of one block
 *   (0.5 m: too high a step; he jumps it) south of it.
 *
 *   A stair of stair blocks (AWP-24: 0.25 m treads, 1 m wide) climbs to the
 *   floor's east side from the east (x 426‥428, z −169‥−168).
 * - `gable`: a Khmer house with a steep gable roof (AWP-24: 6 × 4 m of timber
 *   walls on a laterite plinth, a door to the south, a palm thatch roof at 45°
 *   over them, a cell over at every side, its gable ends timber): the roof's
 *   steps smoothed with stairs and its ridge capped with slabs (roof.ts
 *   `gableRoof`). `gable-stepped`: the same with the roof left as steps of
 *   full blocks (as before AWP-24), to compare.
 * - `hip` / `hip-stepped`: the sala's hipped roof (one cell deep this time),
 *   smoothed (stairs, outer corner stairs at its four corners, a slab cap) or
 *   left as steps.
 * - `fullmix`: `full` with every sala's roof smoothed (roof.ts `smoothRoof`):
 *   the frame's cost of a plot of mixed shapes against `full`'s cubes.
 *
 * `pblocks=demo@x,z` / `full@x,z` / `gable@x,z` puts it elsewhere (its middle, m).
 */

/** Where the demo stands: the meadow north of his stilt house (hamlet/_homePlan.ts `HOME_AT` 424, −107), before its veranda. */
export const DEMO_AT = { x: 431, z: -131 } as const;

/** One sala, its plinth `w` cells across, its middle at x, z (m). Returns the blocks set. */
export function buildSala(store: BlockStore, field: Pick<HeightField, 'heightAt'>, x: number, z: number, w = 12, roofStyle: 'deep' | 'smooth' | 'hip' | 'hip-stepped' = 'deep'): number {
  const i0 = cellOf(x) - (w >> 1);
  const k0 = cellOf(z) - (w >> 1);
  // The plinth's top: a cell over the highest ground under it and its step.
  let high = -Infinity;
  const ground: number[] = [];
  for (let a = -1; a <= w; a++)
    for (let b = -1; b <= w; b++) {
      const g = cellOf(field.heightAt(cellMid(i0 + a), cellMid(k0 + b)));
      ground[(a + 1) * (w + 2) + b + 1] = g;
      high = Math.max(high, g);
    }
  const top = high + 1;
  const laterite: Block = { mat: 'laterite' };
  const coping: Block = { mat: 'sandstone' };
  const gold: Block = { mat: 'sandstone', color: KHMER_PAINT.gold };
  const step: Block = { mat: 'sandstone', shape: 'slab' };
  const brick: Block = { mat: 'brick' };
  const timber: Block = { mat: 'timber' };
  const bamboo: Block = { mat: 'bamboo' };
  const beam: Block = { mat: 'timber', color: KHMER_PAINT.lacquer };
  const thatch: Block = { mat: 'thatch' };
  const before = store.count;
  store.batch(() => {
    for (let a = -1; a <= w; a++)
      for (let b = -1; b <= w; b++) {
        const ring = a < 0 || b < 0 || a >= w || b >= w;
        const g = ground[(a + 1) * (w + 2) + b + 1];
        const i = i0 + a;
        const k = k0 + b;
        // (the step: a slab on its own laterite, down to the ground)
        const stand = ring ? top - 1 : top;
        for (let j = Math.min(g, stand - 1); j < stand; j++) store.set(i, j, k, laterite);
        if (ring) store.set(i, top - 1, k, step);
        else {
          const edge = a === 0 || b === 0 || a === w - 1 || b === w - 1;
          // (the coping: sandstone, its corner stones gilded)
          const corner = (a === 0 || a === w - 1) && (b === 0 || b === w - 1);
          store.set(i, top, k, edge ? (corner ? gold : coping) : laterite);
          // (a course of brick under it, round the edge: its upper half shows over the step)
          if (edge) store.set(i, top - 1, k, brick);
        }
      }
    // Posts round the edge, a cell in, four a side (evenly: 1, 4, 7, 10 of 12), 5 cells (2.5 m) high: timber at the
    // corners, bamboo between.
    const posts = [1, Math.round((w - 3) / 3) + 1, w - 2 - Math.round((w - 3) / 3), w - 2];
    for (const a of posts)
      for (const b of posts) {
        if (a !== 1 && a !== w - 2 && b !== 1 && b !== w - 2) continue;
        const corner = (a === 1 || a === w - 2) && (b === 1 || b === w - 2);
        for (let j = top + 1; j <= top + 5; j++) store.set(i0 + a, j, k0 + b, corner ? timber : bamboo);
      }
    // The beam ring over them, lacquer red.
    for (let a = 1; a <= w - 2; a++)
      for (let b = 1; b <= w - 2; b++) if (a === 1 || b === 1 || a === w - 2 || b === w - 2) store.set(i0 + a, top + 6, k0 + b, beam);
    // The thatch: rings stepping in, from the eaves a cell past the plinth, each two cells deep, so every step sits
    // on the ring under it (one cell deep, a ring would meet the next only along an edge: mesh.ts `diagonalJoints`).
    // (`hip`: one cell deep; `smooth`: two deep, smoothed; both: the steps filled with stairs: roof.ts)
    const deep = roofStyle === 'deep' || roofStyle === 'smooth' ? 1 : 0;
    const roof: Cell[] = [];
    let y = top + 7;
    for (let r = -1; r < w >> 1; r++, y++)
      for (let a = r; a <= w - 1 - r; a++)
        for (let b = r; b <= w - 1 - r; b++)
          if (Math.min(a - r, b - r, w - 1 - r - a, w - 1 - r - b) <= deep) {
            store.set(i0 + a, y, k0 + b, thatch);
            roof.push([i0 + a, y, k0 + b]);
          }
    // The finial: a gold cap on the top ring.
    for (let a = (w >> 1) - 1; a <= w >> 1; a++) for (let b = (w >> 1) - 1; b <= w >> 1; b++) store.set(i0 + a, y, k0 + b, gold);
    if (roofStyle === 'smooth' || roofStyle === 'hip') smoothRoof(roof, store);
  });
  return store.count - before;
}

/** Where the walk test course starts (its low corner, m): flat land 8 m up, west of his stilt house. */
export const WALK_COURSE_AT = { x: 418, z: -169 } as const;

/**
 * The walk test course (see above), its low corner at x, z (m), every column standing on the ground under it.
 * Cells from the corner (a along x, b along z): the stair a 0‥7, b 0‥3 (step n: n + 1 quarter metres); the floor
 * a 8‥15, b −2‥5 (2 m); the brick wall a 0‥9, b 10 (2.5 m); the low wall a 0‥9, b −6 (0.5 m); the stair of stair
 * blocks a 16‥19, b 0‥1 (climbing −x: step n at a = 19 − n, its stair n cells up on laterite).
 */
export function buildWalkCourse(store: BlockStore, field: Pick<HeightField, 'heightAt'>, x: number, z: number): number {
  const i0 = cellOf(x);
  const k0 = cellOf(z);
  const before = store.count;
  // (a column of `quarters` quarter metres on the ground: cubes, a slab on top for an odd count)
  const column = (a: number, b: number, quarters: number, top: Block, under: Block) => {
    const g = cellOf(field.heightAt(cellMid(i0 + a), cellMid(k0 + b)));
    const full = quarters >> 1;
    for (let n = 0; n < full; n++) store.set(i0 + a, g + n, k0 + b, n === full - 1 && !(quarters & 1) ? top : under);
    if (quarters & 1) store.set(i0 + a, g + full, k0 + b, { ...top, shape: 'slab' });
  };
  store.batch(() => {
    const sandstone: Block = { mat: 'sandstone' };
    const laterite: Block = { mat: 'laterite' };
    for (let a = 0; a < 8; a++) for (let b = 0; b < 4; b++) column(a, b, a + 1, sandstone, laterite);
    for (let a = 8; a < 16; a++) for (let b = -2; b < 6; b++) column(a, b, 8, { mat: 'timber' }, laterite);
    for (let a = 0; a < 10; a++) column(a, 10, 10, { mat: 'brick', color: KHMER_PAINT.lacquer }, { mat: 'brick' });
    for (let a = 0; a < 10; a++) column(a, -6, 2, { mat: 'sandstone', color: KHMER_PAINT.gold }, laterite);
    // (AWP-24: stair blocks, each a cell higher than the last, climbing −x up to the floor's east side)
    for (let n = 0; n < 4; n++)
      for (let b = 0; b < 2; b++) {
        const g = cellOf(field.heightAt(cellMid(i0 + 19 - n), cellMid(k0 + b)));
        for (let h = 0; h < n; h++) store.set(i0 + 19 - n, g + h, k0 + b, laterite);
        store.set(i0 + 19 - n, g + n, k0 + b, { mat: 'sandstone', shape: 'stair', turn: 3 });
      }
  });
  return store.count - before;
}

/**
 * A Khmer house with a gable roof (see above), its middle at x, z (m): walls 12 × 8 cells, 5 high (2.5 m) on a
 * plinth a cell high, a door 2 cells wide in the south wall; the roof (palm thatch, a cell over the walls at every
 * side) along x. `stepped`: the roof left as steps of full blocks. Returns the blocks set.
 */
export function buildGableHouse(store: BlockStore, field: Pick<HeightField, 'heightAt'>, x: number, z: number, stepped: boolean): number {
  const W = 12;
  const D = 8;
  const i0 = cellOf(x) - (W >> 1);
  const k0 = cellOf(z) - (D >> 1);
  let high = -Infinity;
  for (let a = -1; a <= W; a++) for (let b = -1; b <= D; b++) high = Math.max(high, cellOf(field.heightAt(cellMid(i0 + a), cellMid(k0 + b))));
  const before = store.count;
  store.batch(() => {
    const laterite: Block = { mat: 'laterite' };
    const timber: Block = { mat: 'timber' };
    const post: Block = { mat: 'timber', color: 0x5a3a26 };
    // The plinth (down to the ground), its top at `high`.
    for (let a = 0; a < W; a++)
      for (let b = 0; b < D; b++) {
        const g = cellOf(field.heightAt(cellMid(i0 + a), cellMid(k0 + b)));
        for (let j = Math.min(g, high); j <= high; j++) store.set(i0 + a, j, k0 + b, laterite);
      }
    // The walls, 5 cells high, dark posts at the corners; a door (2 cells) in the south wall (−z) at its middle.
    for (let a = 0; a < W; a++)
      for (let b = 0; b < D; b++) {
        if (a > 0 && a < W - 1 && b > 0 && b < D - 1) continue;
        const corner = (a === 0 || a === W - 1) && (b === 0 || b === D - 1);
        const door = b === 0 && (a === (W >> 1) - 1 || a === W >> 1);
        if (door) continue;
        for (let j = high + 1; j <= high + 5; j++) store.set(i0 + a, j, k0 + b, corner ? post : timber);
      }
    // The roof: eave rows level with the walls' top course, a cell outside them; the gable ends (timber) on the end walls.
    gableRoof({ i0: i0 - 1, k0: k0 - 1, i1: i0 + W, k1: k0 + D, j: high + 5, ridge: 'x', block: { mat: 'thatch' }, stepped, ends: { block: timber, inset: 1 } }, store);
  });
  return store.count - before;
}

/** Fill the store as `pblocks=` asks (see above); returns the blocks set, or 0. */
export function fillDemo(spec: string, field: Pick<HeightField, 'heightAt'>, store = BLOCKS): number {
  const [kind, at] = spec.split('@');
  const xz = at?.split(',').map(Number);
  const x = xz && Number.isFinite(xz[0]) ? xz[0] : DEMO_AT.x;
  const z = xz && Number.isFinite(xz[1]) ? xz[1] : DEMO_AT.z;
  const before = store.count;
  if (kind === 'walk') buildWalkCourse(store, field, xz ? x : WALK_COURSE_AT.x, xz ? z : WALK_COURSE_AT.z);
  else if (kind === 'demo') buildSala(store, field, x, z);
  else if (kind === 'full' || kind === 'fullmix') store.batch(() => {
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) buildSala(store, field, x + a * 8, z + b * 8, 12, kind === 'full' ? 'deep' : 'smooth');
  });
  else if (kind === 'gable' || kind === 'gable-stepped') buildGableHouse(store, field, x, z, kind === 'gable-stepped');
  else if (kind === 'hip' || kind === 'hip-stepped') buildSala(store, field, x, z, 12, kind);
  return store.count - before;
}
