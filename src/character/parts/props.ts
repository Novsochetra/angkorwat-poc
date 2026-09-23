import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { hash3 } from '../../voxel/random';
import { PALETTE } from '../palette';

/**
 * Hat, lantern and torch from the "Equipment / Variations" row of the sheet.
 * Lantern and torch are authored in their own local frame (origin = grip point).
 */

/** Hair above this height is trimmed away under the hat crown. */
export const HAT_CLIP_Y = 29.6;

/** Wide-brimmed khaki explorer hat. Head joint. */
export function buildHat(): VoxelBuilder {
  const b = new VoxelBuilder();
  const H = PALETTE.hat;
  const zc = -0.9;
  // Brim: stepped voxel ellipse, curling down slightly at the rim.
  const brim = b.grid({ cell: [1, 0.7, 1], origin: [-10.5, 28.9, zc - 10.5], mat: 'hat', jitter: 0.05, ao: 0.2, seed: 111 });
  for (let i = 0; i < 21; i++)
    for (let k = 0; k < 21; k++) {
      const x = i - 10;
      const z = k - 10;
      const r = Math.hypot(x / 9.7, z / 10.0);
      if (r > 1) continue;
      brim.set(i, 0, k, r > 0.82 ? H.light : hash3(i, 0, k, 3) < 0.6 ? H.base : H.shade);
    }
  brim.commit();
  // Rim lip one step lower at the edge (gives the brim a soft downward curl).
  for (let i = 0; i < 21; i++)
    for (let k = 0; k < 21; k++) {
      const r = Math.hypot((i - 10) / 9.7, (k - 10) / 10.0);
      if (r > 0.9 && r <= 1.0 && hash3(i, 1, k, 4) < 0.55) b.box(i - 10, 28.74, zc + k - 10, 0.98, 0.32, 0.98, H.shade, 'hat', { shade: 0.9 });
    }
  // Crown: band row + three tapering rows with a centre crease on top.
  const crown = b.grid({ cell: 1, origin: [-7.5, 29.6, zc - 7.5], mat: 'hat', jitter: 0.05, ao: 0.28, seed: 113 });
  const rows = [
    { rx: 6.6, rz: 7.0, band: true },
    { rx: 6.4, rz: 6.8, band: false },
    { rx: 6.0, rz: 6.4, band: false },
    { rx: 5.2, rz: 5.6, band: false },
  ];
  rows.forEach((row, j) => {
    for (let i = 0; i < 15; i++)
      for (let k = 0; k < 15; k++) {
        const x = i - 7;
        const z = k - 7;
        if ((x / row.rx) ** 2 + (z / row.rz) ** 2 > 1) continue;
        if (j === 3 && Math.abs(x) <= 1 && Math.abs(z) <= 3) continue; // pinch
        crown.set(i, j, k, row.band ? H.band : hash3(i, j, k, 5) < 0.6 ? H.base : H.light);
      }
  });
  crown.commit();
  return b;
}

/** Hand lantern. Origin at the bail bar held in the fist; hangs along −Y. */
export function buildLantern(): { frame: VoxelBuilder; glass: VoxelBuilder } {
  const frame = new VoxelBuilder();
  const glass = new VoxelBuilder();
  const M = 0x3b3a3a;
  const M2 = 0x55524e;
  frame.box(0, 0, 0, 1.5, 0.28, 0.28, M, 'metal');
  for (const s of [-1, 1]) frame.box(s * 0.72, -0.6, 0, 0.24, 1.3, 0.24, M, 'metal');
  frame.span(-1.0, -1.85, -1.0, 1.0, -1.25, 1.0, M, 'metal');
  frame.span(-0.55, -1.25, -0.55, 0.55, -1.0, 0.55, M2, 'metal');
  frame.span(-0.3, -1.0, -0.3, 0.3, -0.75, 0.3, PALETTE.brass, 'brass');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) frame.box(sx * 0.82, -3.05, sz * 0.82, 0.32, 2.5, 0.32, M, 'metal');
  frame.span(-1.1, -4.85, -1.1, 1.1, -4.3, 1.1, M, 'metal');
  frame.span(-0.8, -5.05, -0.8, 0.8, -4.85, 0.8, M2, 'metal');
  const T = PALETTE.torch;
  glass.box(0, -3.05, 0, 1.36, 2.4, 1.36, T.yellow, 'glow');
  glass.box(0, -3.25, 0, 0.62, 1.1, 0.62, T.core, 'glow');
  return { frame, glass };
}

/**
 * Wooden torch. Origin at the grip; the handle runs along +Z (the fist's grip
 * axis), so it points up when the forearm is raised as in the hero shot.
 */
export function buildTorchHandle(): VoxelBuilder {
  const b = new VoxelBuilder();
  const W = PALETTE.wood;
  const g = b.grid({ cell: [0.56, 0.56, 0.62], origin: [-0.28, -0.28, -1.5], mat: 'wood', jitter: 0.07, ao: 0, seed: 121 });
  g.fill(0, 0, 0, 0, 0, 10, (_i, _j, k) => (k % 3 === 0 ? W.dark : W.base));
  g.commit();
  // Wrapped, pitch-soaked head.
  b.span(-0.46, -0.46, 5.1, 0.46, 0.46, 6.4, 0x3a2418, 'wood', { shade: 0.9 });
  b.span(-0.52, -0.52, 5.4, 0.52, 0.52, 5.8, 0x5a3a24, 'wood');
  return b;
}

/** Flame blocks (drawn upright in their own frame, flickered at runtime). */
export function buildFlame(): VoxelBuilder {
  const b = new VoxelBuilder();
  const T = PALETTE.torch;
  b.box(0, 0.7, 0, 1.35, 1.4, 1.35, T.deep, 'glow');
  b.box(0, 1.15, 0, 1.1, 1.6, 1.1, T.orange, 'glow');
  b.box(0.08, 2.05, 0, 0.75, 1.3, 0.75, T.yellow, 'glow');
  b.box(-0.12, 1.55, 0.07, 0.5, 0.9, 0.5, T.core, 'glow');
  b.box(0.16, 2.95, -0.07, 0.4, 0.65, 0.4, T.yellow, 'glow');
  b.box(-0.2, 2.6, 0.12, 0.28, 0.4, 0.28, T.orange, 'glow');
  return b;
}
