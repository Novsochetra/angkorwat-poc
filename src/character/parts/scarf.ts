import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { hash3 } from '../../voxel/random';
import { PALETTE } from '../palette';
import { JOINTS } from '../skeleton';

/**
 * The red krama (Cambodian checked scarf, sheet 3.3.3): a chunky two-row collar
 * wrapped around the neck and one long tail hanging down the front-left, ending
 * in a fringe. The checks are red with dark maroon warp stripes and lighter
 * salmon weft stripes; gold threads come from the material's edge tint.
 */
const K = PALETTE.krama;

/** Krama check colour for a cell at (column u, row v). */
export function kramaColor(u: number, v: number, seed = 0): number {
  const warp = ((u % 4) + 4) % 4 === 2;
  const weft = ((v % 3) + 3) % 3 === 1;
  if (warp && weft) return K.cross;
  if (warp) return K.dark;
  if (weft) return K.light;
  return hash3(u, v, 3, seed) < 0.5 ? K.red : K.red2;
}

interface Ring {
  y0: number;
  y1: number;
  hx: number;
  z0: number;
  z1: number;
  /** extra drop at the front of the ring */
  sag: number;
}

function ringCells(b: VoxelBuilder, ring: Ring, row: number, seed: number): void {
  const h = ring.y1 - ring.y0;
  const cell = 0.95;
  const nx = Math.round((ring.hx * 2) / cell);
  const nz = Math.round((ring.z1 - ring.z0) / cell);
  const sx = (ring.hx * 2) / nx;
  const sz = (ring.z1 - ring.z0) / nz;
  let u = 0;
  const put = (x: number, z: number, w: number, d: number, front: number) => {
    const wob = (hash3(u, row, 1, seed) - 0.5) * 0.14;
    const wob2 = (hash3(u, row, 2, seed) - 0.5) * 0.12;
    const y = (ring.y0 + ring.y1) / 2 - ring.sag * front;
    b.box(x, y, z, w * 1.02, h, d * 1.02, kramaColor(u, row, seed), 'krama', { rx: wob2, rz: wob, shade: 1 - front * 0.02 });
    u++;
  };
  // front (+z) and back rows along x, sides along z
  for (let i = 0; i < nx; i++) {
    const x = -ring.hx + (i + 0.5) * sx;
    put(x, ring.z1 - sz / 2, sx, sz, 1 - Math.abs(x) / ring.hx);
  }
  for (let k = nz - 2; k >= 1; k--) put(ring.hx - sx / 2, ring.z0 + (k + 0.5) * sz, sx, sz, 0);
  for (let i = nx - 1; i >= 0; i--) put(-ring.hx + (i + 0.5) * sx, ring.z0 + sz / 2, sx, sz, 0);
  for (let k = 1; k <= nz - 2; k++) put(-ring.hx + sx / 2, ring.z0 + (k + 0.5) * sz, sx, sz, 0);
}

/** Collar wrapped around the neck. Chest joint. */
export function buildScarfCollar(): VoxelBuilder {
  const b = new VoxelBuilder();
  // Lower wrap drapes wider over the shoulders and sags at the front.
  ringCells(b, { y0: 18.1, y1: 19.2, hx: 4.1, z0: -3.3, z1: 3.55, sag: 0.35 }, 0, 71);
  // Upper wrap hugs the neck under the chin.
  ringCells(b, { y0: 19.2, y1: 20.35, hx: 3.35, z0: -2.7, z1: 3.05, sag: 0.1 }, 1, 72);
  return b;
}

/** Tail segments, top to bottom. Each lives on its own swinging joint. */
export function buildScarfTail(segment: 1 | 2 | 3): VoxelBuilder {
  const b = new VoxelBuilder();
  const x = JOINTS.scarf1.pivot[0];
  const rows: Record<1 | 2 | 3, { top: number; n: number; z: number; tilt: number }> = {
    1: { top: 18.3, n: 3, z: 3.5, tilt: -0.06 },
    2: { top: 15.7, n: 3, z: 3.55, tilt: 0 },
    3: { top: 13.3, n: 2, z: 3.55, tilt: 0 },
  };
  const r = rows[segment];
  const rowH = segment === 1 ? 2.6 / 3 : segment === 2 ? 2.4 / 3 : 0.8;
  const v0 = segment === 1 ? 0 : segment === 2 ? 3 : 6;
  for (let v = 0; v < r.n; v++)
    for (let u = 0; u < 2; u++) {
      const y = r.top - (v + 0.5) * rowH;
      const cx = x - 0.45 + u * 0.9;
      const wob = (hash3(u, v0 + v, 4, 73) - 0.5) * 0.08;
      b.box(cx, y, r.z, 0.9, rowH * 1.01, 0.52, kramaColor(u + 1, v0 + v + 1, 73), 'krama', { rz: wob, rx: r.tilt });
    }
  if (segment === 3) {
    // Fringe: four loose tassels.
    const bottom = r.top - r.n * rowH;
    [-0.66, -0.22, 0.22, 0.66].forEach((dx, t) => {
      const len = 0.9 + hash3(t, 9, 9, 74) * 0.25;
      b.box(x + dx, bottom - len / 2, r.z, 0.26, len, 0.3, t % 2 ? K.dark : K.fringe, 'krama', { rz: (hash3(t, 1, 1, 75) - 0.5) * 0.12 });
    });
  }
  return b;
}
