import { FORMS } from './kinds';
import { BLOCKS, BLOCK_M, rawShape, rawTurn, type BlockStore } from './store';

/**
 * A ray through the player's blocks (no three.js): the first block it meets,
 * which of its sides, and where (paint, AWP-22: roam/_paint.ts aims with it).
 * It walks the grid cell by cell (Amanatides & Woo) and, in a cell with a
 * block, meets the block's own boxes (kinds.ts `FORMS`: a slab's empty upper
 * half, a stair's step are passed through to what is behind). The land stops
 * it (`ground`: the ray under the land's height ends there).
 */

/** What a ray met: the block's cell, the side it met (0 +x, 1 −x, 2 +y, 3 −y, 4 +z, 5 −z), how far (m), the box met (cell units). */
export interface BlockHit {
  i: number;
  j: number;
  k: number;
  side: number;
  t: number;
  box: readonly [number, number, number, number, number, number];
}

const _hit: BlockHit = { i: 0, j: 0, k: 0, side: 0, t: 0, box: [0, 0, 0, 1, 1, 1] };

/**
 * The first block on the ray from (ox, oy, oz) along (dx, dy, dz) (need not be of length 1; `far` in metres along
 * the unit ray), or null. `ground(x, z)`: the land's height (the ray ends under it). The result is reused by the next
 * call: copy what is kept.
 */
export function rayBlocks(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, far: number, ground?: (x: number, z: number) => number, store: BlockStore = BLOCKS): BlockHit | null {
  const len = Math.hypot(dx, dy, dz);
  if (!store.count || len < 1e-9) return null;
  dx /= len;
  dy /= len;
  dz /= len;
  // In cells.
  const px = ox / BLOCK_M;
  const py = oy / BLOCK_M;
  const pz = oz / BLOCK_M;
  let i = Math.floor(px);
  let j = Math.floor(py);
  let k = Math.floor(pz);
  const si = dx > 0 ? 1 : -1;
  const sj = dy > 0 ? 1 : -1;
  const sk = dz > 0 ? 1 : -1;
  const inf = Number.POSITIVE_INFINITY;
  // (cells along the ray to the next cell edge on each axis, and per cell)
  const ddx = dx !== 0 ? Math.abs(1 / dx) : inf;
  const ddy = dy !== 0 ? Math.abs(1 / dy) : inf;
  const ddz = dz !== 0 ? Math.abs(1 / dz) : inf;
  let tx = dx !== 0 ? (dx > 0 ? i + 1 - px : px - i) * ddx : inf;
  let ty = dy !== 0 ? (dy > 0 ? j + 1 - py : py - j) * ddy : inf;
  let tz = dz !== 0 ? (dz > 0 ? k + 1 - pz : pz - k) * ddz : inf;
  const end = far / BLOCK_M;
  let t = 0;
  while (t <= end) {
    const raw = store.raw(i, j, k);
    if (raw) {
      const form = FORMS[rawShape(raw) * 4 + rawTurn(raw)];
      let best = inf;
      for (const b of form?.boxes ?? []) {
        const h = slab(px - i, py - j, pz - k, dx, dy, dz, b);
        if (h >= 0 && h < best) {
          best = h;
          _hit.side = slabSide;
          _hit.box = b;
        }
      }
      if (best <= end) {
        _hit.i = i;
        _hit.j = j;
        _hit.k = k;
        _hit.t = best * BLOCK_M;
        return _hit;
      }
    }
    // (the next cell)
    if (tx < ty && tx < tz) {
      t = tx;
      tx += ddx;
      i += si;
    } else if (ty < tz) {
      t = ty;
      ty += ddy;
      j += sj;
    } else {
      t = tz;
      tz += ddz;
      k += sk;
    }
    // Under the land: it ends there.
    if (ground) {
      const x = (px + dx * t) * BLOCK_M;
      const z = (pz + dz * t) * BLOCK_M;
      if ((py + dy * t) * BLOCK_M < ground(x, z) - 0.02) return null;
    }
  }
  return null;
}

/** The side the last `slab` met. */
let slabSide = 0;

/** Where the ray from p (cell units, the cell's corner at 0) along d meets box b (its distance along d, or −1). */
function slab(px: number, py: number, pz: number, dx: number, dy: number, dz: number, b: readonly number[]): number {
  let lo = -Infinity;
  let hi = Infinity;
  let side = 0;
  const p = [px, py, pz];
  const d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) {
      if (p[a] < b[a] || p[a] > b[a + 3]) return -1;
      continue;
    }
    let t0 = (b[a] - p[a]) / d[a];
    let t1 = (b[a + 3] - p[a]) / d[a];
    // (entering through the low side when it goes up the axis: that side faces −axis)
    let s = 2 * a + 1;
    if (t0 > t1) {
      [t0, t1] = [t1, t0];
      s = 2 * a;
    }
    if (t0 > lo) {
      lo = t0;
      side = s;
    }
    hi = Math.min(hi, t1);
  }
  if (lo > hi || hi < 0) return -1;
  // (the ray starts inside the box: met at once, on the side it leaves by is meaningless; the near one is kept)
  slabSide = side;
  return Math.max(0, lo);
}
