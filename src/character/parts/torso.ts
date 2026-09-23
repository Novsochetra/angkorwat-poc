import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { hash3 } from '../../voxel/random';
import { PALETTE } from '../palette';

/** Shirt body: 11 × 9 × 7 blocks of 0.8 BU (the shirt weave is finer than the hair). */
export const TORSO = { minX: -4.4, maxX: 4.4, minY: 11.8, maxY: 19.0, minZ: -2.8, maxZ: 2.8, cell: 0.8 } as const;

export interface TorsoOptions {
  /** Crossbody satchel strap (left shoulder → right hip). */
  satchelStrap?: boolean;
  /** Backpack shoulder straps. */
  packStraps?: boolean;
}

export function buildTorso(opts: TorsoOptions = {}): VoxelBuilder {
  const b = new VoxelBuilder();
  const S = PALETTE.shirt;
  const g = b.grid({ cell: TORSO.cell, origin: [TORSO.minX, TORSO.minY, TORSO.minZ], mat: 'shirt', jitter: 0.03, ao: 0.22, seed: 21 });
  const tone = (i: number, j: number, k: number) => {
    const r = hash3(i, j, k, 5);
    if (i === 0 || i === 10) return r < 0.5 ? S.mid : S.shade; // shaded flanks
    if (k === 0 && r < 0.3) return S.mid;
    return r < 0.62 ? S.base : r < 0.86 ? S.light : S.mid;
  };
  g.fill(0, 10, 0, 8, 0, 6, tone);
  // Sloped shoulders — the sleeve caps fill the corners.
  for (let k = 0; k <= 6; k++) {
    g.delete(0, 8, k);
    g.delete(10, 8, k);
  }
  // Neck opening under the krama.
  for (let i = 3; i <= 7; i++) for (let k = 1; k <= 5; k++) g.delete(i, 8, k);
  // Subtle placket down the front centre.
  for (let j = 1; j <= 7; j++) g.set(5, j, 6, j % 3 === 1 ? S.mid : S.base);
  g.commit();

  const L = PALETTE.leather;
  if (opts.packStraps ?? true) {
    // Backpack straps: over both shoulders and down the sides of the chest to the
    // belt, half hidden behind the sleeves as in the front view of the sheet.
    for (const s of [-1, 1]) {
      const x = s * 4.18;
      for (let z = -2.4; z <= 2.41; z += 0.8) b.box(s * 3.7, 19.12, z, 0.7, 0.26, 0.8, L.strap, 'leather', { shade: 0.95 });
      for (let y = 18.6; y >= 12.6; y -= 0.8) b.box(x, y, 2.94, 0.7, 0.8, 0.28, L.strap, 'leather', { shade: 1 - (18.6 - y) * 0.01 });
      for (let y = 18.6; y >= 15.8; y -= 0.8) b.box(x, y, -2.94, 0.7, 0.8, 0.28, L.strap, 'leather');
      b.box(x, 15.4, 3.13, 0.4, 0.4, 0.14, PALETTE.brassDark, 'brass');
    }
  }
  if (opts.satchelStrap ?? true) {
    // Two-block stepped diagonal band exactly like the reference turnaround.
    for (let j = 1; j <= 8; j++)
      for (const di of [0, 1]) {
        const i = j + di;
        const x = TORSO.minX + (i + 0.5) * TORSO.cell;
        const y = TORSO.minY + (j + 0.5) * TORSO.cell;
        const c = hash3(i, j, 3, 9) < 0.5 ? L.mid : di ? L.dark : L.base;
        b.box(x, y, 3.03, 0.8, 0.8, 0.4, c, 'leather');
        // back run, mostly hidden by the pack
        b.box(x, y, -3.0, 0.8, 0.8, 0.34, L.dark, 'leather');
      }
    // Over the left shoulder.
    for (let z = -2.4; z <= 2.41; z += 0.8) b.box(2.8, 19.18, z, 1.6, 0.34, 0.8, L.mid, 'leather');
  }
  return b;
}

/** Belt, buckle, pouches and the knife sheath — they ride on the hips. */
export function buildBelt(opts: { pouches?: boolean; sheath?: boolean } = {}): VoxelBuilder {
  const b = new VoxelBuilder();
  const L = PALETTE.leather;
  // Belt ring (hollow), slightly proud of shirt and shorts.
  const g = b.grid({ cell: [0.95, 1.1, 0.806], origin: [-4.75, 11.6, -3.3], mat: 'leather', jitter: 0.05, ao: 0.1, seed: 31 });
  for (let i = 0; i <= 9; i++)
    for (let k = 0; k <= 7; k++) if (i === 0 || i === 9 || k === 0 || k === 7) g.set(i, 0, k, hash3(i, 0, k, 2) < 0.5 ? L.base : L.mid);
  g.commit();

  // Buckle: warm leather-brass square frame with a grey metal plate (sheet 3.3.8).
  b.box(0, 12.15, 3.36, 1.4, 1.2, 0.32, 0xb57a34, 'leather', { shade: 1.12 });
  b.box(0, 12.15, 3.5, 0.74, 0.64, 0.16, PALETTE.camera.mid, 'metal');

  if (opts.pouches ?? true) {
    // Right-hip pouch riding on the belt, flap on top, two brass snaps.
    const p = b.grid({ cell: 0.55, origin: [-4.62, 10.85, 3.12], mat: 'leather', jitter: 0.06, ao: 0.2, seed: 33 });
    p.fill(0, 3, 0, 3, 0, 1, (i, j) => (j >= 2 ? (j === 3 ? L.dark : L.mid) : hash3(i, j, 0, 4) < 0.5 ? L.light : L.base));
    p.commit();
    b.box(-3.52, 12.28, 4.28, 0.34, 0.34, 0.14, PALETTE.brass, 'brass');
    b.box(-3.52, 11.4, 4.28, 0.34, 0.34, 0.14, PALETTE.brass, 'brass');
    // Left-hip side pouch.
    const q = b.grid({ cell: 0.55, origin: [4.72, 10.3, -1.2], mat: 'leather', jitter: 0.06, ao: 0.2, seed: 34 });
    q.fill(0, 1, 0, 3, 0, 3, (_i, j) => (j >= 3 ? L.dark : L.base));
    q.commit();
    b.box(5.86, 11.7, -0.1, 0.14, 0.34, 0.34, PALETTE.brass, 'brass');
  }
  if (opts.sheath ?? true) {
    // Knife in a long leather sheath on the right hip (hangs past the hand).
    const x = -5.05;
    b.span(x - 0.34, 6.6, -1.15, x + 0.34, 11.2, 0.15, 0x4a2b1b, 'leather');
    b.span(x - 0.38, 10.6, -1.2, x + 0.38, 11.25, 0.2, L.darkest, 'leather', { shade: 1.1 });
    b.span(x - 0.3, 6.25, -0.95, x + 0.3, 6.65, -0.05, PALETTE.brassDark, 'brass');
    b.span(x - 0.26, 11.2, -0.85, x + 0.26, 12.7, -0.15, PALETTE.wood.dark, 'wood');
    b.span(x - 0.32, 12.7, -0.9, x + 0.32, 13.05, -0.1, PALETTE.brassDark, 'brass');
  }
  return b;
}
