/**
 * The road cut into pieces for drawing. The road runs all over the map, so
 * one mesh of it (r ≈ 425 m) was in view from anywhere and drawn whole:
 * 14,424 blocks of stone, 173 k triangles on low (635 k on medium), wherever
 * the camera stood. Cut into compact pieces, each its own mesh with a tight
 * bounding sphere, three leaves out the pieces off screen and behind the
 * camera, and on medium and up a far piece goes plain on its own
 * (graphics.ts `plainFar`), while the near ones keep their cut edges (the
 * carved stone under the light keeps them however far: path.ts).
 *
 * Pieces are clusters of the blocks' ground plan (k-means, started from
 * points spread as far apart as they can be, so the same road always cuts
 * the same way): round, compact pieces hold the most road for their size,
 * where squares of a grid hold diagonal stretches and corners. Measured on
 * the walks (the camera turned all round, low): the road's triangles drawn
 * 190 k → ≈ 55 k with 16 stone pieces and 4 each of the grass and the
 * light, ≈ 5 more draws; finer pieces gain little more (30 → ≈ 47 k) and
 * cost a draw each in the overview, where every piece is in view.
 */

/** How many pieces per family: the stone (paving, walls, steps, lamps), the grass on its edges, the inlay of light (and, medium and up, the carved stone under it). */
export const ROAD_PIECES = { stone: 16, grass: 4, glow: 4 } as const;

/** Lloyd's steps at most (the road's pieces settle in 20–30). */
const STEPS = 40;
/** The centres settle on about this many of the items (every n-th), then every item goes to the nearest: the same pieces as from all of them, in a fraction of the time. */
const SAMPLE = 2000;

const sq = (dx: number, dz: number): number => dx * dx + dz * dz;

/**
 * Items cut into at most `k` compact pieces by where they stand (x, z): each
 * item goes to the nearest of the pieces' centres. Each piece keeps its
 * items in their order; empty pieces are left out; pieces come in the order
 * their first centres were picked.
 */
export function cutIntoPieces<T>(items: readonly T[], k: number, x: (t: T) => number, z: (t: T) => number): T[][] {
  const n = items.length;
  if (!n) return [];
  if (k <= 1) return [items.slice()];
  const ax = Float64Array.from(items, x);
  const az = Float64Array.from(items, z);
  // (the sample the centres settle on)
  const every = Math.ceil(n / SAMPLE);
  const m = Math.ceil(n / every);
  const px = new Float64Array(m);
  const pz = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    px[i] = ax[i * every];
    pz[i] = az[i * every];
  }
  // Starting centres: the first item, then each time the item farthest from every centre so far.
  const cx: number[] = [px[0]];
  const cz: number[] = [pz[0]];
  const near = new Float64Array(m);
  for (let i = 0; i < m; i++) near[i] = sq(px[i] - cx[0], pz[i] - cz[0]);
  while (cx.length < k) {
    let far = 0;
    for (let i = 1; i < m; i++) if (near[i] > near[far]) far = i;
    if (near[far] === 0) break;
    cx.push(px[far]);
    cz.push(pz[far]);
    for (let i = 0; i < m; i++) near[i] = Math.min(near[i], sq(px[i] - px[far], pz[i] - pz[far]));
  }
  const c = cx.length;
  const nearest = (x0: number, z0: number): number => {
    let best = 0;
    let bd = Infinity;
    for (let j = 0; j < c; j++) {
      const d = sq(x0 - cx[j], z0 - cz[j]);
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    return best;
  };
  const of = new Int32Array(m).fill(-1);
  const sx = new Float64Array(c);
  const sz = new Float64Array(c);
  const count = new Int32Array(c);
  for (let step = 0; step < STEPS; step++) {
    let moved = false;
    for (let i = 0; i < m; i++) {
      const j = nearest(px[i], pz[i]);
      if (of[i] !== j) {
        of[i] = j;
        moved = true;
      }
    }
    if (!moved) break;
    sx.fill(0);
    sz.fill(0);
    count.fill(0);
    for (let i = 0; i < m; i++) {
      sx[of[i]] += px[i];
      sz[of[i]] += pz[i];
      count[of[i]]++;
    }
    for (let j = 0; j < c; j++)
      if (count[j]) {
        cx[j] = sx[j] / count[j];
        cz[j] = sz[j] / count[j];
      }
  }
  const pieces: T[][] = cx.map(() => []);
  for (let i = 0; i < n; i++) pieces[nearest(ax[i], az[i])].push(items[i]);
  return pieces.filter((p) => p.length);
}
