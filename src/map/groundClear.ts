/**
 * Ground kept clear of the near ground cover (veg/undergrowth.ts: grass tufts,
 * wild flowers, ferns, big leaves, fallen logs): discs on the map that
 * something of roaming's own has dug or laid there since the map was built —
 * his garden's beds and tree basins (garden/view.ts sets them as plants come
 * and go). A plain hook object (no three.js), as map/greet.ts: the garden
 * writes it, the undergrowth reads it when it grows a cell, and grows the
 * cells under a changed disc again (`dirty`).
 */

export interface ClearDisc {
  x: number;
  z: number;
  /** Radius (m): no plant's foot within this (and a little of its own size) of (x, z). */
  r: number;
}

/** Checks: `groundclear=0` in the URL lets the ground cover grow over the dug earth again (to compare). */
const OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).get('groundclear') === '0';

export const GROUND_CLEAR = {
  /** The discs by their owner's key (a garden plant's id). */
  discs: new Map<number, ClearDisc>(),
  /** A box round every disc (m), for a quick "nowhere near". */
  x0: Infinity,
  x1: -Infinity,
  z0: Infinity,
  z1: -Infinity,
  /** Where discs changed since the undergrowth last looked (m; empty: x0 > x1): the cells there grow again. */
  dirty: { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity },

  /** Set (or move, resize) the disc under `key`; `r` ≤ 0 takes it away. */
  set(key: number, x: number, z: number, r: number): void {
    const was = this.discs.get(key);
    if (was && was.x === x && was.z === z && was.r === r) return;
    if (was) this.mark(was.x, was.z, was.r);
    if (r <= 0) {
      if (!was) return;
      this.discs.delete(key);
      this.fit();
      return;
    }
    if (was) {
      was.x = x;
      was.z = z;
      was.r = r;
    } else this.discs.set(key, { x, z, r });
    this.mark(x, z, r);
    this.fit();
  },

  /** No plant's foot here: (x, z) with a plant of reach `pr` (m) is in no disc. */
  free(x: number, z: number, pr: number): boolean {
    if (OFF || x < this.x0 - pr || x > this.x1 + pr || z < this.z0 - pr || z > this.z1 + pr) return true;
    for (const d of this.discs.values()) {
      const dx = x - d.x;
      const dz = z - d.z;
      const r = d.r + pr;
      if (dx * dx + dz * dz < r * r) return false;
    }
    return true;
  },

  mark(x: number, z: number, r: number): void {
    const d = this.dirty;
    d.x0 = Math.min(d.x0, x - r);
    d.x1 = Math.max(d.x1, x + r);
    d.z0 = Math.min(d.z0, z - r);
    d.z1 = Math.max(d.z1, z + r);
  },

  fit(): void {
    this.x0 = this.z0 = Infinity;
    this.x1 = this.z1 = -Infinity;
    for (const d of this.discs.values()) {
      this.x0 = Math.min(this.x0, d.x - d.r);
      this.x1 = Math.max(this.x1, d.x + d.r);
      this.z0 = Math.min(this.z0, d.z - d.r);
      this.z1 = Math.max(this.z1, d.z + d.r);
    }
  },
};
