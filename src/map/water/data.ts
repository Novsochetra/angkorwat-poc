import { ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, Matrix4, RGBAFormat, UnsignedByteType, Vector4, type InstancedMesh, type Object3D } from 'three';
import { CELL } from '../heightfield';
import type { FallFoot } from './falls';
import { NONE, type WaterGrid } from './grid';

/**
 * A map of the water, 0.5 m per texel, read by the surface shader:
 *  - R: distance to the bank (0‥6 m): shallow jade at the banks, deep teal in the middle, foam lines
 *  - G: extra foam: under falls and steps, at lips, round rocks and bridge piers standing in the water
 *  - B, A: flow (x, z), speed factor 0‥2 (0.5 = still)
 *
 * Rocks and piers are found by looking at the blocks already built (terrain,
 * landmarks and the road are built before the water): every block that
 * stands through the water surface.
 */
export interface WaterData {
  texture: DataTexture;
  /** (x0, z0, 1 / width, 1 / depth) in metres: uv = (xz − x0z0) · zw. */
  box: Vector4;
  /** Water texels covered by blocks (rocks, piers). */
  obstacles: number;
}

const TEXEL = 0.5;
/** Bank distance encoded up to this (m). */
const BANK_MAX = 6;

export function buildWaterData(g: WaterGrid, feet: FallFoot[], scene: Object3D): WaterData {
  const f = g.field;
  const { nx, nz } = f;
  const level = g.level;
  // Region: every drawn water cell and a margin.
  let xa = Infinity;
  let xb = -Infinity;
  let za = Infinity;
  let zb = -Infinity;
  for (let k = 0; k < nz; k++)
    for (let i = 0; i < nx; i++) {
      if (level[i + k * nx] <= NONE) continue;
      const [x, z] = f.cellCenter(i, k);
      xa = Math.min(xa, x);
      xb = Math.max(xb, x);
      za = Math.min(za, z);
      zb = Math.max(zb, z);
    }
  const X0 = Math.floor(xa - 8);
  const Z0 = Math.floor(za - 8);
  const W = Math.ceil((xb + 8 - X0) / TEXEL);
  const D = Math.ceil((zb + 8 - Z0) / TEXEL);
  const texX = (t: number) => X0 + (t + 0.5) * TEXEL;
  const texZ = (t: number) => Z0 + (t + 0.5) * TEXEL;
  const cellOf = (x: number, z: number) => f.index(x, z);

  // Level per texel (NONE if dry).
  const lv = new Float32Array(W * D).fill(NONE);
  for (let tz = 0; tz < D; tz++)
    for (let tx = 0; tx < W; tx++) {
      const c = cellOf(texX(tx), texZ(tz));
      if (c >= 0) lv[tx + tz * W] = level[c];
    }

  // Distance to the bank: to the nearest cell that is dry, or holds higher water (the foot of a step).
  // Per water cell: list the bank cells around it once, then measure from each of its texels.
  const bank = new Float32Array(W * D);
  const R = Math.ceil(BANK_MAX / CELL) + 1;
  const near: number[] = [];
  const per = CELL / TEXEL;
  const open = (q: number, L: number) => q >= 0 && q < nx * nz && level[q] > NONE && level[q] <= L + 0.5;
  for (let k = 0; k < nz; k++)
    for (let i = 0; i < nx; i++) {
      const L = level[i + k * nx];
      if (L <= NONE) continue;
      near.length = 0;
      for (let dk = -R; dk <= R; dk++)
        for (let di = -R; di <= R; di++) {
          const ii = i + di;
          const kk = k + dk;
          if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
          const c = ii + kk * nx;
          const m = level[c];
          if (m > NONE && m <= L + 0.5) continue;
          // (only bank cells next to open water can be the nearest)
          if (!open(c - 1, L) && !open(c + 1, L) && !open(c - nx, L) && !open(c + nx, L)) continue;
          near.push(f.x0 + (ii + 0.5) * CELL, f.z0 + (kk + 0.5) * CELL);
        }
      const cx0 = f.x0 + i * CELL;
      const cz0 = f.z0 + k * CELL;
      const tx0 = Math.round((cx0 - X0) / TEXEL);
      const tz0 = Math.round((cz0 - Z0) / TEXEL);
      for (let b = 0; b < per; b++)
        for (let a = 0; a < per; a++) {
          const tx = tx0 + a;
          const tz = tz0 + b;
          if (tx < 0 || tz < 0 || tx >= W || tz >= D) continue;
          const x = texX(tx);
          const z = texZ(tz);
          let best = BANK_MAX * BANK_MAX;
          for (let q = 0; q < near.length; q += 2) {
            const ex = Math.max(0, Math.abs(x - near[q]) - CELL / 2);
            const ez = Math.max(0, Math.abs(z - near[q + 1]) - CELL / 2);
            best = Math.min(best, ex * ex + ez * ez);
          }
          bank[tx + tz * W] = Math.sqrt(best);
        }
    }

  // Foam.
  const foam = new Float32Array(W * D);
  const stamp = (x: number, z: number, r: number, v: number) => {
    const t0 = Math.max(0, Math.floor((x - r - X0) / TEXEL));
    const t1 = Math.min(W - 1, Math.floor((x + r - X0) / TEXEL));
    const s0 = Math.max(0, Math.floor((z - r - Z0) / TEXEL));
    const s1 = Math.min(D - 1, Math.floor((z + r - Z0) / TEXEL));
    for (let tz = s0; tz <= s1; tz++)
      for (let tx = t0; tx <= t1; tx++) {
        const d = Math.hypot(texX(tx) - x, texZ(tz) - z) / r;
        if (d >= 1) continue;
        const t = tx + tz * W;
        const a = 1 - d * d;
        foam[t] = Math.max(foam[t], v * a * a);
      }
  };
  /** A foam trail down the flow from a point. */
  const trail = (x: number, z: number, r: number, v: number, len: number, fade: number, grow: number) => {
    let px = x;
    let pz = z;
    for (let s = 0; s <= len; s += 0.75) {
      stamp(px, pz, r + s * grow, v * Math.exp(-s / fade));
      const [fx, fz] = g.flowAt(px, pz);
      const fl = Math.hypot(fx, fz);
      if (fl < 0.05) break;
      px += (fx / fl) * 0.75;
      pz += (fz / fl) * 0.75;
    }
  };
  for (const ft of feet) {
    if (ft.small) {
      trail(ft.x, ft.z, 1.6, 0.75, 4, 2.5, 0.08);
      continue;
    }
    const r = ft.width * 0.5 + 1.5 + ft.drop * 0.04;
    stamp(ft.x - ft.dir[0], ft.z - ft.dir[1], r, 1);
    trail(ft.x, ft.z, r * 0.8, 0.95, Math.min(22, 7 + ft.drop * 0.5), 3 + ft.drop * 0.15, 0.06);
    // Water whitening as it reaches the lip.
    stamp(ft.lip[0], ft.lip[1], ft.width * 0.5 + 0.5, 0.3);
  }

  // Blocks standing through the water: rocks, piers.
  const obst = new Uint8Array(W * D);
  let obstacles = 0;
  const m = new Matrix4();
  const e = m.elements;
  scene.traverse((o) => {
    const mesh = o as InstancedMesh;
    if (!mesh.isInstancedMesh) return;
    mesh.updateWorldMatrix(true, false);
    const mw = mesh.matrixWorld;
    const arr = mesh.instanceMatrix.array;
    for (let n = 0; n < mesh.count; n++) {
      // Quick reject on the instance's own translation (most blocks are far from any water).
      const ix = arr[n * 16 + 12];
      const iz = arr[n * 16 + 14];
      if (mw.elements[0] === 1 && mw.elements[5] === 1 && mw.elements[10] === 1) {
        const wx = ix + mw.elements[12];
        const wz = iz + mw.elements[14];
        if (wx < X0 - 8 || wz < Z0 - 8 || wx > X0 + W * TEXEL + 8 || wz > Z0 + D * TEXEL + 8) continue;
        const c = cellOf(wx, wz);
        if (c >= 0 && level[c] <= NONE && f.water[c] < -1000) {
          // Centre on dry land far from water: skip unless the block is big.
          const sx = Math.abs(arr[n * 16]) + Math.abs(arr[n * 16 + 4]) + Math.abs(arr[n * 16 + 8]);
          if (sx < CELL * 1.5) continue;
        }
      }
      m.fromArray(arr, n * 16).premultiply(mw);
      const hx = (Math.abs(e[0]) + Math.abs(e[4]) + Math.abs(e[8])) / 2;
      const hy = (Math.abs(e[1]) + Math.abs(e[5]) + Math.abs(e[9])) / 2;
      const hz = (Math.abs(e[2]) + Math.abs(e[6]) + Math.abs(e[10])) / 2;
      const cx = e[12];
      const cy = e[13];
      const cz = e[14];
      const t0 = Math.max(0, Math.ceil((cx - hx + 0.05 - X0) / TEXEL - 0.5));
      const t1 = Math.min(W - 1, Math.floor((cx + hx - 0.05 - X0) / TEXEL - 0.5));
      const s0 = Math.max(0, Math.ceil((cz - hz + 0.05 - Z0) / TEXEL - 0.5));
      const s1 = Math.min(D - 1, Math.floor((cz + hz - 0.05 - Z0) / TEXEL - 0.5));
      for (let tz = s0; tz <= s1; tz++)
        for (let tx = t0; tx <= t1; tx++) {
          const t = tx + tz * W;
          const L = lv[t];
          if (L <= NONE || obst[t]) continue;
          if (cy - hy < L + 0.2 && cy + hy > L - 0.25) {
            obst[t] = 1;
            obstacles++;
          }
        }
    }
  });
  if (obstacles > 0) {
    let k = 0;
    for (let tz = 1; tz < D - 1; tz++)
      for (let tx = 1; tx < W - 1; tx++) {
        const t = tx + tz * W;
        if (!obst[t]) continue;
        foam[t] = 1;
        // Only the rim of an obstacle throws foam (and not every texel of a long one).
        if (obst[t - 1] && obst[t + 1] && obst[t - W] && obst[t + W]) continue;
        if (k++ % 2) continue;
        stamp(texX(tx), texZ(tz), 1.3, 0.9);
        trail(texX(tx), texZ(tz), 0.7, 0.75, 5, 2.2, 0.12);
      }
  }

  // Pack (flow bilinear between cell centres, only near the rivers; elsewhere still water).
  const data = new Uint8Array(W * D * 4);
  const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  const { flowX: FX, flowZ: FZ } = g;
  for (let tz = 0; tz < D; tz++) {
    const gz = (texZ(tz) - f.z0) / CELL - 0.5;
    const k = Math.max(0, Math.min(nz - 2, Math.floor(gz)));
    const bz = Math.max(0, Math.min(1, gz - k));
    for (let tx = 0; tx < W; tx++) {
      const t = tx + tz * W;
      const gx = (texX(tx) - f.x0) / CELL - 0.5;
      const i = Math.max(0, Math.min(nx - 2, Math.floor(gx)));
      const bx = Math.max(0, Math.min(1, gx - i));
      const c = i + k * nx;
      let fx = 0;
      let fz = 0;
      if (FX[c] || FZ[c] || FX[c + 1] || FZ[c + 1] || FX[c + nx] || FZ[c + nx] || FX[c + nx + 1] || FZ[c + nx + 1]) {
        const a = (1 - bx) * (1 - bz);
        const b = bx * (1 - bz);
        const d = (1 - bx) * bz;
        const e2 = bx * bz;
        fx = FX[c] * a + FX[c + 1] * b + FX[c + nx] * d + FX[c + nx + 1] * e2;
        fz = FZ[c] * a + FZ[c + 1] * b + FZ[c + nx] * d + FZ[c + nx + 1] * e2;
      }
      data[t * 4] = byte(bank[t] / BANK_MAX);
      data[t * 4 + 1] = lv[t] > NONE ? byte(foam[t]) : 0;
      data[t * 4 + 2] = byte(fx * 0.25 + 0.5);
      data[t * 4 + 3] = byte(fz * 0.25 + 0.5);
    }
  }
  const texture = new DataTexture(data, W, D, RGBAFormat, UnsignedByteType);
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return { texture, box: new Vector4(X0, Z0, 1 / (W * TEXEL), 1 / (D * TEXEL)), obstacles };
}
