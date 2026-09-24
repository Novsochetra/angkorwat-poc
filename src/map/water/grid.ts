import { CELL, type HeightField } from '../heightfield';

/**
 * Where water is drawn, and how it flows: the height field's water cells,
 * cleaned up for drawing, plus a smooth flow field from the river samples.
 */

export const NONE = -1e4;

export interface WaterGrid {
  field: HeightField;
  /**
   * Water surface per cell as drawn (m), NONE where there is none. Cells past
   * a cliff whose nearest river sample is still on top (their water would
   * float metres over the ground) take the level of the pool below them, or
   * none.
   */
  level: Float32Array;
  /** Flow per cell (x, z): unit direction times a speed factor (1 = calm reach, up to ~2 at a lip). */
  flowX: Float32Array;
  flowZ: Float32Array;
  levelAt(x: number, z: number): number | null;
  /** Flow at a map point, bilinear between cell centres. */
  flowAt(x: number, z: number): [number, number];
}

export function buildWaterGrid(f: HeightField): WaterGrid {
  const { nx, nz, height, water } = f;
  const n = nx * nz;
  const level = new Float32Array(n).fill(NONE);
  for (let c = 0; c < n; c++) if (water[c] > -1000 && water[c] - height[c] <= 1.5) level[c] = water[c];
  // Deep cells at the foot of a fall: the pool's level when a neighbour has it.
  for (let pass = 0; pass < 3; pass++)
    for (let c = 0; c < n; c++) {
      if (water[c] < -1000 || level[c] > NONE) continue;
      const i = c % nx;
      const want = height[c] + 1;
      const nb = [i > 0 ? c - 1 : -1, i < nx - 1 ? c + 1 : -1, c - nx, c + nx];
      for (const m of nb) if (m >= 0 && m < n && Math.abs(level[m] - want) < 0.01) level[c] = want;
    }

  // Flow: every river sample adds its direction to the cells around it,
  // weighted by distance, and a speed factor (faster towards a lip and
  // under a fall).
  const sumX = new Float32Array(n);
  const sumZ = new Float32Array(n);
  const sumW = new Float32Array(n);
  const sumS = new Float32Array(n);
  for (const r of f.rivers) {
    const sm = r.samples;
    const speed = new Float32Array(sm.length).fill(1);
    for (const fall of f.falls) {
      if (fall.river !== r.name) continue;
      let lip = 0;
      let best = Infinity;
      sm.forEach((s, k) => {
        const d = Math.hypot(s.x - fall.x, s.z - fall.z);
        if (d < best) [best, lip] = [d, k];
      });
      let foot = lip + 1;
      while (foot < sm.length - 1 && sm[foot].level > fall.bottom) foot++;
      for (let k = Math.max(0, lip - 16); k <= lip; k++) speed[k] = Math.max(speed[k], 1 + 0.9 * Math.exp(-(lip - k) / 5));
      for (let k = foot; k < Math.min(sm.length, foot + 24); k++) speed[k] = Math.max(speed[k], 1 + 0.6 * Math.exp(-(k - foot) / 8));
    }
    sm.forEach((s, k) => {
      const sigma = s.w / 2 + 1.5;
      const reach = s.w / 2 + CELL * 2;
      const i0 = Math.max(0, Math.floor((s.x - reach - f.x0) / CELL));
      const i1 = Math.min(nx - 1, Math.floor((s.x + reach - f.x0) / CELL));
      const k0 = Math.max(0, Math.floor((s.z - reach - f.z0) / CELL));
      const k1 = Math.min(nz - 1, Math.floor((s.z + reach - f.z0) / CELL));
      for (let kk = k0; kk <= k1; kk++)
        for (let i = i0; i <= i1; i++) {
          const [x, z] = f.cellCenter(i, kk);
          const d = Math.hypot(x - s.x, z - s.z);
          if (d > reach) continue;
          const w = Math.exp(-((d / sigma) ** 2));
          const c = i + kk * nx;
          sumX[c] += s.dir[0] * w;
          sumZ[c] += s.dir[1] * w;
          sumS[c] += speed[k] * w;
          sumW[c] += w;
        }
    });
  }
  const flowX = new Float32Array(n);
  const flowZ = new Float32Array(n);
  for (let c = 0; c < n; c++) {
    if (sumW[c] <= 0) continue;
    const l = Math.hypot(sumX[c], sumZ[c]);
    if (l < 1e-4) continue;
    const s = sumS[c] / sumW[c];
    flowX[c] = (sumX[c] / l) * s;
    flowZ[c] = (sumZ[c] / l) * s;
  }

  const levelAt = (x: number, z: number): number | null => {
    const c = f.index(x, z);
    return c < 0 || level[c] <= NONE ? null : level[c];
  };
  const flowAt = (x: number, z: number): [number, number] => {
    const gx = (x - f.x0) / CELL - 0.5;
    const gz = (z - f.z0) / CELL - 0.5;
    const i = Math.max(0, Math.min(nx - 2, Math.floor(gx)));
    const k = Math.max(0, Math.min(nz - 2, Math.floor(gz)));
    const tx = Math.max(0, Math.min(1, gx - i));
    const tz = Math.max(0, Math.min(1, gz - k));
    const c = i + k * nx;
    const a = (1 - tx) * (1 - tz);
    const b = tx * (1 - tz);
    const d = (1 - tx) * tz;
    const e = tx * tz;
    return [
      flowX[c] * a + flowX[c + 1] * b + flowX[c + nx] * d + flowX[c + nx + 1] * e,
      flowZ[c] * a + flowZ[c + 1] * b + flowZ[c + nx] * d + flowZ[c + nx + 1] * e,
    ];
  };
  return { field: f, level, flowX, flowZ, levelAt, flowAt };
}
