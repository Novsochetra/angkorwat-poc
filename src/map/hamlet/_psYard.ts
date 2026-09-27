import { traceSource } from '../../feedback/sourceTrace';
import type { VoxelBox, VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { HeightField } from '../heightfield';
import { COWS, RACKS, YARD } from './_psPlan';
import { BAMBOO, cakeTray, FROND, PsFrame, pick, POST, type Rgb } from './_psKit';

/**
 * The palm sugar family's yard round the shed and the house (`_psPlan.ts`
 * `YARD`, `RACKS`): swept earth round the house and under the racks; the
 * drying racks in the sun south of the shed, bamboo tables knee-high with
 * flat woven trays of round golden cakes in rows (some trays half taken in);
 * the bamboo rail fence along the lane with its gap at the stall; dry fronds
 * stacked on an A-frame (the stove's fuel); the tapper's old bicycle with
 * its tube holders leaning on the shed; a rice straw stack on its pole for
 * the cows, their stakes; a banana clump behind the house and pots of
 * flowers by its stair; the dog asleep in the stall's shade. Every piece
 * stands on the ground read from `field` at build time.
 */

/** Rice straw, grey-gold; the banana's leaves and stems; clay pots; flowers. */
const RICE_STRAW: readonly Rgb[] = [0xc8b070, 0xbca464, 0xd4bc7c, 0xae965a];
const BANANA: readonly Rgb[] = [0x5a8a2e, 0x4e7e28, 0x66963a, 0x7a9a3a];
const POT: readonly Rgb[] = [0x9a5a3a, 0x8a4e32, 0xa66242];
/** The yard's swept earth: the land's dirt (terrain/palette.ts `DIRT`), a little darker where it is trodden. */
const YARD_EARTH: readonly Rgb[] = [0x8c6642, 0x82603e, 0x94704a, 0x7c5a3a];

export function buildYard(b: VoxelBuilder, field: HeightField, small: Set<VoxelBox>): void {
  const src = traceSource();
  const at = (x: number, z: number, fine = false): PsFrame => {
    const F = new PsFrame(b, x, field.heightAt(x, z), z, src, small, false, 9191);
    return fine ? F.fine : F;
  };
  earth(b, field, small);
  racks(b, field, small);
  fence(b, field, small);
  fronds(at(YARD.fronds.x0, YARD.fronds.z), YARD.fronds.x1 - YARD.fronds.x0);
  bicycle(at(YARD.bike.x, YARD.bike.z, true));
  strawStack(at(YARD.straw.x, YARD.straw.z), YARD.straw.s);
  for (const c of COWS) stake(at(c.x, c.z, true));
  banana(at(YARD.banana.x, YARD.banana.z));
  pots(at(YARD.pots.x, YARD.pots.z, true));
  dog(at(YARD.dog.x, YARD.dog.z, true));
}

/** Swept earth: big flat tiles of their own tone a finger over the ground (under the shed's floor, which lies a little higher). */
function earth(b: VoxelBuilder, field: HeightField, small: Set<VoxelBox>): void {
  const src = traceSource();
  for (const [k, [x0, z0, x1, z1]] of YARD.earth.entries()) {
    const nx = Math.max(1, Math.round((x1 - x0) / 2.1));
    const nz = Math.max(1, Math.round((z1 - z0) / 2.1));
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const xa = x0 + ((x1 - x0) * i) / nx;
        const xb = x0 + ((x1 - x0) * (i + 1)) / nx;
        const za = z0 + ((z1 - z0) * j) / nz;
        const zb = z0 + ((z1 - z0) * (j + 1)) / nz;
        // (the corners of the patch left out: a yard's worn edge is round)
        if ((i === 0 || i === nx - 1) && (j === 0 || j === nz - 1)) continue;
        const F = new PsFrame(b, 0, field.heightAt((xa + xb) / 2, (za + zb) / 2), 0, src, small, false, 9192 + k);
        F.span(xa, 0, za, xb, 0.02, zb, pick(YARD_EARTH, F.r(i, j, 1)), 'mapStone', 0.95 + 0.1 * F.r(j, i, 2));
      }
  }
}

/**
 * The drying racks: knee-high bamboo tables (legs, rails, a bed of split
 * bamboo) with a row of flat trays of cakes drying in the sun; the tray at
 * one end of each half taken in, one with fewer rows.
 */
function racks(b: VoxelBuilder, field: HeightField, small: Set<VoxelBox>): void {
  const src = traceSource();
  RACKS.forEach((r, k) => {
    const mx = (r.x0 + r.x1) / 2;
    const F = new PsFrame(b, 0, field.heightAt(mx, r.z), 0, src, small, false, 9193 + k);
    const hw = r.w / 2;
    for (const x of [r.x0 + 0.1, mx, r.x1 - 0.1])
      for (const s of [-1, 1]) F.box(x, r.h / 2, r.z + s * (hw - 0.08), 0.08, r.h, 0.08, pick(BAMBOO, F.r(x, s, 1)), 'mapBark', 0.9);
    for (const s of [-1, 1]) F.span(r.x0, r.h - 0.1, r.z + s * hw - 0.05, r.x1, r.h - 0.03, r.z + s * hw + 0.05, pick(BAMBOO, F.r(s, 2)), 'mapBark', 0.92);
    F.span(r.x0 + 0.05, r.h - 0.05, r.z - hw + 0.05, r.x1 - 0.05, r.h - 0.01, r.z + hw - 0.05, pick(BAMBOO, F.r(3)), 'mapBark', 1.02);
    const n = Math.floor((r.x1 - r.x0) / 1.02);
    const step = (r.x1 - r.x0) / n;
    for (let t = 0; t < n; t++) {
      const x = r.x0 + step * (t + 0.5);
      const gone = t === (k ? 0 : n - 1) ? 7 : 0;
      cakeTray(F, x, r.h - 0.01, r.z + (F.r(t, k, 4) - 0.5) * 0.08, 0.94, 4, k * 10 + t, gone);
    }
  });
}

/** The bamboo rail fence along the lane: posts every 1.4 m, two rails between. */
function fence(b: VoxelBuilder, field: HeightField, small: Set<VoxelBox>): void {
  const src = traceSource();
  YARD.fence.forEach(([x0, z0, x1, z1], k) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ux = (x1 - x0) / len;
    const uz = (z1 - z0) / len;
    const ry = Math.atan2(ux, uz);
    const n = Math.max(1, Math.round(len / 1.4));
    const F = new PsFrame(b, 0, 0, 0, src, small, false, 9195 + k);
    for (let i = 0; i <= n; i++) {
      const x = x0 + (ux * len * i) / n;
      const z = z0 + (uz * len * i) / n;
      const g = field.heightAt(x, z);
      F.box(x, g + 0.5, z, 0.1, 1.1, 0.1, pick(BAMBOO, F.r(i, 1)), 'mapBark', 0.9);
    }
    for (const hy of [0.42, 0.88]) {
      const x = (x0 + x1) / 2;
      const z = (z0 + z1) / 2;
      F.box(x, field.heightAt(x, z) + hy, z, 0.06, 0.07, len, pick(BAMBOO, F.r(hy, 2)), 'mapBark', 1, ry);
    }
  });
}

/** Dry fronds stacked for the stove on a bamboo A-frame (their fans hanging both sides), `len` m along x from the frame's origin. */
function fronds(F: PsFrame, len: number): void {
  F = F.at(traceSource());
  const h = 1.5;
  for (const x of [0.1, len - 0.1])
    for (const s of [-1, 1]) F.stick(x, 0, s * 0.55, x, h, 0, 0.07, pick(BAMBOO, F.r(x, s, 1)), 'mapBark', 0.9);
  F.span(0, h - 0.04, -0.04, len, h + 0.04, 0.04, pick(BAMBOO, F.r(2)), 'mapBark');
  for (let k = 0; k < 8; k++) {
    const x = 0.25 + ((len - 0.5) * (k + 0.5)) / 8;
    const s = k % 2 ? 1 : -1;
    F.slab(x, h * 0.55, s * 0.32, 0.9 + 0.3 * F.r(k, 3), 1.3, 0.06, s > 0 ? 0 : Math.PI, 0.4 + 0.15 * F.r(k, 4), pick(FROND, F.r(k, 5)), 'mapBark', 0.92);
  }
  // (a few long stalks on the ground)
  for (let k = 0; k < 3; k++) F.fine.stick(0.1 + k * 0.3, 0.04, 0.8 + k * 0.1, len - 0.2, 0.06, 0.7 + k * 0.15, 0.06, pick(FROND, F.r(k, 6)), 'mapBark', 0.9);
}

/** The tapper's old black bicycle on its stand by the wall, along z: square wheels of thin bars, the frame, the carrier with bamboo tube holders hung either side. */
function bicycle(F: PsFrame): void {
  F = F.at(traceSource());
  const r = 0.34;
  for (const wz of [-0.55, 0.55]) {
    F.box(0, r * 2 - 0.02, wz, 0.04, 0.04, 0.62, 0x222222, 'mapStone');
    F.box(0, 0.02, wz, 0.04, 0.04, 0.62, 0x222222, 'mapStone');
    F.box(0, r, wz - r + 0.02, 0.04, 0.62, 0.04, 0x222222, 'mapStone');
    F.box(0, r, wz + r - 0.02, 0.04, 0.62, 0.04, 0x222222, 'mapStone');
    F.box(0, r, wz, 0.1, 0.08, 0.08, 0x9a9a96, 'mapStone');
  }
  F.box(0, 0.56, 0, 0.06, 0.06, 1.05, 0x2a2a2a, 'mapStone');
  F.box(0, 0.45, -0.18, 0.06, 0.4, 0.06, 0x2a2a2a, 'mapStone');
  F.box(0, 0.8, -0.22, 0.14, 0.07, 0.26, 0x3a2a1e, 'mapStone');
  F.box(0, 0.82, 0.5, 0.06, 0.34, 0.06, 0x444444, 'mapStone');
  F.box(0, 0.98, 0.5, 0.56, 0.05, 0.06, 0x444444, 'mapStone');
  // The carrier and the tube holders: two bamboo tubes hung on each side.
  F.box(0, 0.8, -0.52, 0.34, 0.05, 0.4, pick(BAMBOO, F.r(1)), 'mapBark');
  for (const s of [-1, 1]) for (const dz of [-0.64, -0.4]) F.box(s * 0.24, 0.56, dz, 0.13, 0.46, 0.13, pick([0x6a4a2c, 0x7a5a36], F.r(s, dz, 2)), 'mapBark');
}

/** A rice straw stack built up round a pole, `s` its size (1: 2.6 m across, 3 m high), a cap of old straw on top. */
function strawStack(F: PsFrame, s: number): void {
  F = F.at(traceSource());
  const tiers: [number, number][] = [
    [2.6, 0.8],
    [2.8, 0.7],
    [2.4, 0.6],
    [1.8, 0.5],
    [1.1, 0.45],
  ];
  let y = 0;
  tiers.forEach(([w, h], k) => {
    F.box(0, y + (h * s) / 2, 0, w * s, h * s, w * s, pick(RICE_STRAW, F.r(k, 1)), 'mapBark', 0.94 + 0.06 * (k % 2), k * 0.4);
    y += h * s;
  });
  F.box(0, y + 0.3, 0, 0.1, 0.8, 0.1, pick(POST, F.r(2)), 'mapBark');
  F.box(0, y + 0.08, 0, 0.7 * s, 0.16, 0.7 * s, 0x8a7a5a, 'mapBark', 0.9, 0.2);
}

/** A cow's stake and the coil of rope at its foot. */
function stake(F: PsFrame): void {
  F = F.at(traceSource());
  F.box(0, 0.3, 0, 0.09, 0.6, 0.09, pick(POST, F.r(1)), 'mapBark');
  F.box(0, 0.05, 0.12, 0.3, 0.06, 0.3, 0xb8a47a, 'petal');
}

/** Two banana plants (a clump): stems of old leaf bases, big leaves arching out, a torn one hanging. */
function banana(F: PsFrame): void {
  F = F.at(traceSource());
  for (const [dx, dz, h] of [
    [0, 0, 2.6],
    [0.9, 0.7, 2.1],
  ]) {
    F.box(dx, h / 2, dz, 0.26, h, 0.26, 0x6e7a3a, 'mapLeaf', 0.9);
    for (let k = 0; k < 5; k++) {
      const a = k * 1.3 + dx;
      F.slab(dx + Math.sin(a) * 0.55, h - 0.05, dz + Math.cos(a) * 0.55, 0.45, 1.4, 0.05, a, 1.0 + 0.2 * F.r(k, dx, 1), pick(BANANA, F.r(k, dz, 2)), 'mapLeaf', 0.95);
    }
    F.slab(dx + 0.25, h - 0.7, dz - 0.2, 0.35, 1.0, 0.04, 2.6, 0.3, 0x8a7a44, 'mapLeaf', 0.9);
  }
}

/** Clay pots of bougainvillea and basil by the stair. */
function pots(F: PsFrame): void {
  F = F.at(traceSource());
  for (const [dx, dz, bloom] of [
    [0, 0, 0xc2317a],
    [0.55, 0.3, 0x5a8a2e],
  ]) {
    F.box(dx, 0.17, dz, 0.36, 0.34, 0.36, pick(POT, F.r(dx, 1)), 'mapStone');
    F.box(dx, 0.5, dz, 0.46, 0.34, 0.46, 0x4a7a2a, 'mapLeaf');
    F.box(dx + 0.05, 0.66, dz - 0.04, 0.32, 0.12, 0.3, bloom, 'petal');
  }
}

/** The dog asleep, curled on its side (a pale village dog), its head toward +x. */
function dog(F: PsFrame): void {
  F = F.at(traceSource());
  const fur = 0xc49a62;
  const dark = 0x9a7446;
  F.box(0, 0.16, 0, 0.62, 0.3, 0.32, fur, 'petal');
  F.box(0.4, 0.14, 0.06, 0.22, 0.2, 0.22, fur, 'petal');
  F.box(0.54, 0.1, 0.08, 0.12, 0.1, 0.12, dark, 'petal');
  F.box(0.38, 0.27, -0.02, 0.07, 0.08, 0.07, dark, 'petal');
  F.box(0.38, 0.27, 0.13, 0.07, 0.08, 0.07, dark, 'petal');
  F.box(0.2, 0.05, 0.22, 0.34, 0.08, 0.1, fur, 'petal', 0.92);
  F.box(-0.36, 0.06, 0.16, 0.2, 0.08, 0.24, fur, 'petal', 0.9);
}

