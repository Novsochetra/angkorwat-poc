import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { hash3 } from '../../voxel/random';
import { PALETTE } from '../palette';

const L = PALETTE.leather;
const C = PALETTE.camera;

/** Place thin boxes along a straight strap from a to b. */
function strap(
  b: VoxelBuilder,
  a: [number, number, number],
  c: [number, number, number],
  width: number,
  thick: number,
  color: number,
  seg = 0.55,
): void {
  const dx = c[0] - a[0];
  const dy = c[1] - a[1];
  const dz = c[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const n = Math.max(1, Math.round(len / seg));
  const rz = -Math.atan2(dx, dy);
  const rx = Math.atan2(dz, Math.hypot(dx, dy));
  for (let s = 0; s < n; s++) {
    const t = (s + 0.5) / n;
    b.box(a[0] + dx * t, a[1] + dy * t, a[2] + dz * t, width, (len / n) * 1.04, thick, color, 'leather', {
      rx,
      rz,
      shade: 0.96 + hash3(s, n, 1, 8) * 0.08,
    });
  }
}

/**
 * Compact camera on a neck strap (sheet 3.3.5/3.3.6): dark body, pale top plate,
 * viewfinder hump, octagonal lens ring, red shutter light, brass strap lugs.
 * Camera joint (pivots at the neck so it swings).
 */
export function buildCamera(): VoxelBuilder {
  const b = new VoxelBuilder();
  // 7 × 5 × 3 blocks of 0.35: body x −1.225‥1.225, y 12.3‥14.05, z 3.2‥4.25.
  const g = b.grid({ cell: 0.35, origin: [-1.225, 12.3, 3.2], mat: 'metal', jitter: 0.05, ao: 0.2, seed: 81 });
  g.fill(0, 6, 0, 4, 0, 2, (i, j) => (j === 4 ? C.plate : i === 0 || i === 6 ? C.mid : C.body));
  g.fill(2, 4, 5, 5, 0, 1, C.plate); // viewfinder hump
  g.commit();

  // Lens: octagonal ring two cells deep with recessed dark glass.
  const lens = b.grid({ cell: 0.2, origin: [-0.6, 12.575, 4.25], mat: 'metal', jitter: 0.03, ao: 0.15, seed: 82 });
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 6; j++) {
      const corner = (i === 0 || i === 5) && (j === 0 || j === 5);
      if (corner) continue;
      const centre = i >= 2 && i <= 3 && j >= 2 && j <= 3;
      if (centre) lens.set(i, j, 0, C.glass, 'lens');
      else {
        lens.set(i, j, 0, C.light);
        lens.set(i, j, 1, C.light);
      }
    }
  lens.commit();
  b.box(0.14, 13.3, 4.3, 0.1, 0.1, 0.04, 0xffffff, 'lens', { shade: 0.9 }); // glint

  b.box(0.86, 13.72, 4.28, 0.26, 0.26, 0.08, PALETTE.red, 'metal', { shade: 1.1 }); // shutter light
  b.box(-0.84, 14.1, 3.7, 0.32, 0.14, 0.32, C.dark, 'metal'); // dial
  // Brass lugs + neck strap going up under the krama.
  for (const s of [-1, 1]) {
    b.box(s * 1.14, 14.1, 3.66, 0.22, 0.3, 0.22, PALETTE.brass, 'brass');
    strap(b, [s * 1.14, 14.22, 3.58], [s * 1.8, 18.9, 2.5], 0.3, 0.16, L.darkest, 0.6);
  }
  return b;
}

export type PackStyle = 'default' | 'explorer';

/**
 * Leather backpack (sheet 3.3.7): body, top flap with brass buckle, two front
 * pockets with rivets, side pockets and a carry loop. Backpack joint.
 */
export function buildBackpack(style: PackStyle = 'default'): VoxelBuilder {
  return style === 'explorer' ? buildExplorerPack() : buildDaypack();
}

function leatherTone(i: number, j: number, k: number, seed: number): number {
  const r = hash3(i, j, k, seed);
  return r < 0.5 ? L.mid : r < 0.85 ? L.base : L.light;
}

function buildDaypack(): VoxelBuilder {
  const b = new VoxelBuilder();
  const body = b.grid({ cell: 0.7, origin: [-2.8, 11.0, -6.4], mat: 'leather', jitter: 0.05, ao: 0.28, seed: 91 });
  body.fill(0, 7, 0, 8, 0, 4, (i, j, k) => leatherTone(i, j, k, 92));
  for (let i = 0; i <= 7; i++) body.delete(i, 8, 0); // rounded top-back edge
  for (const i of [0, 7]) {
    body.delete(i, 8, 1);
    body.delete(i, 0, 0);
  }
  body.commit();

  // Top flap over the upper back face, wrapping over the top.
  const flap = b.grid({ cell: [0.7, 0.7, 0.35], origin: [-2.45, 13.9, -6.75], mat: 'leather', jitter: 0.05, ao: 0.2, seed: 93 });
  flap.fill(0, 6, 0, 4, 0, 0, (i, j) => (j === 0 ? L.darkest : hash3(i, j, 0, 94) < 0.6 ? L.dark : L.mid));
  flap.delete(0, 0, 0);
  flap.delete(6, 0, 0);
  flap.commit();
  const lid = b.grid({ cell: [0.7, 0.35, 0.7], origin: [-2.45, 16.6, -6.75], mat: 'leather', jitter: 0.05, ao: 0.15, seed: 95 });
  lid.fill(0, 6, 0, 0, 0, 3, (i, _j, k) => (hash3(i, 0, k, 96) < 0.6 ? L.dark : L.mid));
  lid.commit();

  // Brass buckle on the flap and the strap below it.
  const bz = -6.95;
  b.box(0, 14.82, bz, 1.12, 0.24, 0.24, PALETTE.brass, 'brass');
  b.box(0, 13.62, bz, 1.12, 0.24, 0.24, PALETTE.brass, 'brass');
  b.box(-0.44, 14.22, bz, 0.24, 1.0, 0.24, PALETTE.brass, 'brass');
  b.box(0.44, 14.22, bz, 0.24, 1.0, 0.24, PALETTE.brass, 'brass');
  b.box(0, 14.22, bz + 0.08, 0.64, 0.96, 0.12, L.darkest, 'leather');
  b.span(-0.3, 12.2, -6.98, 0.3, 13.5, -6.72, L.dark, 'leather');

  // Two front pockets with rivets.
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -2.45 : 0.35;
    const p = b.grid({ cell: 0.7, origin: [x0, 11.2, -7.1], mat: 'leather', jitter: 0.05, ao: 0.2, seed: 97 + s });
    p.fill(0, 2, 0, 2, 0, 0, (i, j) => (j === 2 ? L.dark : hash3(i, j, 1, 98) < 0.6 ? L.mid : L.base));
    p.commit();
    for (const dx of [0.35, 1.75]) b.box(x0 + dx, 12.95, -7.16, 0.22, 0.22, 0.1, PALETTE.rivet, 'metal');
  }
  // Side pockets with small buckles.
  for (const s of [-1, 1]) {
    const sp = b.grid({ cell: 0.7, origin: [s < 0 ? -3.5 : 2.8, 11.5, -5.9], mat: 'leather', jitter: 0.05, ao: 0.2, seed: 99 + s });
    sp.fill(0, 0, 0, 3, 0, 2, (_i, j) => (j === 3 ? L.darkest : L.dark));
    sp.commit();
    b.box(s * 3.56, 13.5, -4.85, 0.14, 0.34, 0.34, PALETTE.brass, 'brass');
  }
  // Carry loop.
  b.box(-0.7, 17.62, -4.6, 0.3, 0.6, 0.35, L.dark, 'leather');
  b.box(0.7, 17.62, -4.6, 0.3, 0.6, 0.35, L.dark, 'leather');
  b.box(0, 17.95, -4.6, 1.7, 0.3, 0.35, L.dark, 'leather');
  return b;
}

/** Bigger trekking pack with a bedroll and canteen ("Explorer Gear" variant). */
function buildExplorerPack(): VoxelBuilder {
  const b = new VoxelBuilder();
  const body = b.grid({ cell: 0.8, origin: [-3.2, 10.6, -7.7], mat: 'leather', jitter: 0.05, ao: 0.28, seed: 101 });
  body.fill(0, 7, 0, 9, 0, 5, (i, j, k) => leatherTone(i, j, k, 102));
  for (let i = 0; i <= 7; i++) body.delete(i, 9, 0);
  for (const i of [0, 7]) for (const j of [0, 9]) body.delete(i, j, 1);
  body.commit();
  const flap = b.grid({ cell: [0.8, 0.8, 0.35], origin: [-2.8, 14.6, -8.05], mat: 'leather', jitter: 0.05, ao: 0.2, seed: 103 });
  flap.fill(0, 6, 0, 4, 0, 0, (i, j) => (j === 0 ? L.dark : hash3(i, j, 0, 104) < 0.6 ? L.mid : L.base));
  flap.commit();
  b.box(0, 15.0, -8.28, 1.2, 1.1, 0.26, PALETTE.brass, 'brass');
  b.box(0, 15.0, -8.36, 0.62, 0.56, 0.14, L.darkest, 'leather');
  // Big lower pocket.
  const p = b.grid({ cell: 0.8, origin: [-2.4, 11.0, -8.5], mat: 'leather', jitter: 0.05, ao: 0.2, seed: 105 });
  p.fill(0, 5, 0, 3, 0, 0, (i, j) => (j === 3 ? L.dark : hash3(i, j, 2, 106) < 0.6 ? L.mid : L.base));
  p.commit();
  // Bedroll strapped on top.
  const R = PALETTE.bedroll;
  const roll = b.grid({ cell: 0.8, origin: [-4.0, 18.6, -7.3], mat: 'hat', jitter: 0.05, ao: 0.25, seed: 107 });
  for (let i = 0; i <= 9; i++)
    for (let j = 0; j <= 2; j++)
      for (let k = 0; k <= 3; k++) {
        const corner = (j === 0 || j === 2) && (k === 0 || k === 3);
        if (!corner) roll.set(i, j, k, (i + j) % 3 === 0 ? R.light : R.base);
      }
  roll.commit();
  for (const x of [-2.4, 2.4]) b.span(x - 0.3, 18.5, -7.5, x + 0.3, 21.1, -4.0, R.strap, 'leather');
  // Canteen on the right side.
  const W = PALETTE.canteen;
  b.span(-4.6, 11.6, -6.4, -3.3, 14.6, -4.0, W.base, 'metal', { shade: 1.05 });
  b.span(-4.35, 14.6, -5.6, -3.55, 15.2, -4.8, W.cap, 'metal');
  // Side straps.
  for (const s of [-1, 1]) b.span(s * 3.2 - 0.15, 12.0, -7.9, s * 3.2 + 0.15, 17.0, -2.9, L.dark, 'leather');
  return b;
}
