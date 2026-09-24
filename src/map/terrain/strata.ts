import { hash3 } from '../../voxel/random';
import { fbm } from '../heightfield';
import { STRATA_WEIGHTS, type StrataKind } from './palette';

/**
 * The rock layers of the whole map: horizontal bands 2–6 m thick that run
 * through every cliff at the same heights, tilted and waved a little across
 * the land (a whole number of metres per column), so neighbouring columns
 * line up into long strata lines as on the concept art's cliffs.
 */
export interface Band {
  /** Bottom and top in band space (m; column space = band space − the column's warp). */
  y0: number;
  y1: number;
  kind: StrataKind;
  /** The band sticks out of the face a little: a ledge where the strata change. */
  ledge: number;
}

const Y_MIN = -80;
const Y_MAX = 320;
const THICK = [2, 3, 3, 4, 4, 5, 6];

export class Strata {
  readonly bands: Band[] = [];
  /** Band index per metre of band space. */
  private readonly at = new Int16Array(Y_MAX - Y_MIN);

  constructor(seed = 1) {
    let y = Y_MIN;
    let last: StrataKind | null = null;
    for (let n = 0; y < Y_MAX; n++) {
      const t = THICK[Math.floor(hash3(n, 1, 0, seed) * THICK.length)];
      let r = hash3(n, 2, 0, seed);
      let kind = STRATA_WEIGHTS[0][0];
      for (const [k, w] of STRATA_WEIGHTS) {
        kind = k;
        if ((r -= w) < 0) break;
      }
      if (kind === last) kind = STRATA_WEIGHTS[(STRATA_WEIGHTS.findIndex(([k]) => k === kind) + 2) % STRATA_WEIGHTS.length][0];
      const lr = hash3(n, 3, 0, seed);
      this.bands.push({ y0: y, y1: y + t, kind, ledge: lr < 0.3 ? 0.5 : lr < 0.45 ? 0.3 : 0 });
      for (let m = y; m < Math.min(Y_MAX, y + t); m++) this.at[m - Y_MIN] = n;
      y += t;
      last = kind;
    }
  }

  /** Index of the band at height y (m) of a column with warp w. */
  indexAt(y: number, w: number): number {
    const m = Math.floor(y + w) - Y_MIN;
    return this.at[Math.max(0, Math.min(this.at.length - 1, m))];
  }

  /** Band boundaries (column heights, m) strictly between y0 and y1 for a column with warp w. */
  boundaries(y0: number, y1: number, w: number, out: number[]): void {
    let n = this.indexAt(y0, w);
    for (; n < this.bands.length; n++) {
      const b = this.bands[n].y1 - w;
      if (b >= y1) break;
      if (b > y0) out.push(b);
    }
  }

  /** Warp of a column (whole metres): the strata tilt and wave across the land. */
  static warp(x: number, z: number): number {
    return Math.round((fbm(x / 90, z / 90, 5) - 0.5) * 14 + (fbm(x / 23, z / 23, 6) - 0.5) * 3);
  }
}
