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
 * viewfinder hump, chunky octagonal lens with recessed glass, red shutter light,
 * leather straps on brass D-rings. Camera joint (pivots at the neck so it swings).
 */
export function buildCamera(): VoxelBuilder {
  const b = new VoxelBuilder();
  // 8 × 6 × 3 blocks of 0.33: x −1.32‥1.32, y 12.2‥14.18, z 3.2‥4.19.
  const g = b.grid({ cell: 0.33, origin: [-1.32, 12.2, 3.2], mat: 'metal', jitter: 0.05, ao: 0.22, seed: 81 });
  g.fill(0, 7, 0, 5, 0, 2, (i, j) => (j === 5 ? C.plate : j === 0 ? C.dark : i === 0 || i === 7 ? C.mid : C.body));
  g.fill(2, 5, 6, 6, 0, 1, C.plate); // viewfinder hump
  g.set(6, 6, 1, C.dark); // dial
  g.commit();

  // Lens (sheet 3.3.5): a chunky octagonal ring of eight bevelled blocks standing
  // proud of the body, a dark barrel inside it and the glass with a glint.
  const lx = -0.12;
  const ly = 13.12;
  const front = 4.19;
  const apothem = 0.68;
  const ring = 0.27;
  const depth = 0.46;
  const side = 2 * apothem * Math.tan(Math.PI / 8) + 0.12;
  for (let n = 0; n < 8; n++) {
    const a = (n * Math.PI) / 4;
    const r = apothem - ring / 2;
    b.box(lx + Math.cos(a) * r, ly + Math.sin(a) * r, front + depth / 2, ring, side, depth, n % 2 ? C.plate : C.light, 'metal', { rz: a });
  }
  b.box(lx, ly, front + 0.16, 0.92, 0.92, 0.32, C.dark, 'metal'); // barrel
  b.box(lx, ly, front + 0.2, 0.52, 0.52, 0.32, C.glass, 'lens'); // glass
  b.box(lx - 0.1, ly + 0.1, front + 0.37, 0.1, 0.1, 0.02, 0xffffff, 'lens', { shade: 0.9 }); // glint
  b.box(0.98, 13.8, 4.24, 0.26, 0.26, 0.1, PALETTE.red, 'metal', { shade: 1.15 }); // shutter light
  // Brass D-rings + leather neck straps going up under the krama.
  for (const s of [-1, 1]) {
    const x = s * 1.12;
    b.box(x, 14.28, 3.7, 0.12, 0.34, 0.34, PALETTE.brass, 'brass');
    b.box(x, 14.5, 3.7, 0.3, 0.1, 0.34, PALETTE.brass, 'brass');
    strap(b, [x, 14.62, 3.62], [s * 1.9, 18.9, 2.5], 0.44, 0.2, L.strap, 0.55);
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
  const body = b.grid({ cell: 0.7, origin: [-2.8, 11.0, -6.4], mat: 'leather', jitter: 0.05, ao: 0.3, seed: 91 });
  body.fill(0, 7, 0, 8, 0, 4, (i, j, k) => (k === 0 ? leatherTone(i, j, k, 92) : hash3(i, j, k, 93) < 0.6 ? L.mid : L.dark));
  for (let i = 0; i <= 7; i++) body.delete(i, 8, 0); // rounded top-back edge
  for (const i of [0, 7]) {
    body.delete(i, 8, 1);
    body.delete(i, 0, 0);
  }
  body.commit();

  // Top flap: lighter leather with a dark stitched edge, wrapping over the top.
  const FL = [0x93593a, 0x8a5334, 0x9d6441];
  const flap = b.grid({ cell: [0.7, 0.7, 0.4], origin: [-2.45, 13.85, -6.8], mat: 'leather', jitter: 0.04, ao: 0.2, seed: 93 });
  flap.fill(0, 6, 0, 4, 0, 0, (i, j) => (i === 0 || i === 6 || j === 0 ? L.darkest : FL[Math.floor(hash3(i, j, 0, 94) * 3)]));
  flap.delete(0, 0, 0);
  flap.delete(6, 0, 0);
  flap.commit();
  const lid = b.grid({ cell: [0.7, 0.4, 0.7], origin: [-2.45, 17.1, -6.8], mat: 'leather', jitter: 0.04, ao: 0.15, seed: 95 });
  lid.fill(0, 6, 0, 0, 0, 3, (i, _j, k) => (i === 0 || i === 6 ? L.darkest : FL[Math.floor(hash3(i, 0, k, 96) * 3)]));
  lid.commit();

  // Big brass buckle at the flap's lower edge and its strap down to the pockets.
  const bz = -6.98;
  b.box(0, 15.02, bz, 1.25, 0.26, 0.26, PALETTE.brass, 'brass');
  b.box(0, 13.72, bz, 1.25, 0.26, 0.26, PALETTE.brass, 'brass');
  b.box(-0.5, 14.37, bz, 0.26, 1.04, 0.26, PALETTE.brass, 'brass');
  b.box(0.5, 14.37, bz, 0.26, 1.04, 0.26, PALETTE.brass, 'brass');
  b.box(0, 14.37, bz + 0.1, 0.74, 1.04, 0.1, L.darkest, 'leather');
  b.box(0, 14.37, bz - 0.06, 0.16, 0.9, 0.12, PALETTE.brassDark, 'brass'); // prong
  b.span(-0.34, 12.0, -7.08, 0.34, 13.6, -6.76, L.dark, 'leather');

  // Two front pockets, each with its own little flap and brass stud.
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -2.45 : 0.35;
    const p = b.grid({ cell: 0.7, origin: [x0, 11.15, -7.15], mat: 'leather', jitter: 0.05, ao: 0.22, seed: 97 + s });
    p.fill(0, 2, 0, 2, 0, 0, (i, j) => (j === 2 ? FL[i % 3] : hash3(i, j, 1, 98) < 0.6 ? L.base : L.mid));
    p.commit();
    b.span(x0 - 0.02, 12.95, -7.3, x0 + 2.12, 13.3, -7.12, L.darkest, 'leather'); // flap edge
    b.box(x0 + 1.05, 12.78, -7.3, 0.3, 0.3, 0.12, PALETTE.brass, 'brass');
    for (const dx of [0.25, 1.85]) b.box(x0 + dx, 11.4, -7.22, 0.18, 0.18, 0.1, PALETTE.rivet, 'metal');
  }
  // Side pockets with small buckles.
  for (const s of [-1, 1]) {
    const sp = b.grid({ cell: 0.7, origin: [s < 0 ? -3.5 : 2.8, 11.4, -5.95], mat: 'leather', jitter: 0.05, ao: 0.2, seed: 99 + s });
    sp.fill(0, 0, 0, 3, 0, 2, (_i, j) => (j === 3 ? FL[1] : L.dark));
    sp.commit();
    b.box(s * 3.56, 13.35, -4.85, 0.14, 0.36, 0.36, PALETTE.brass, 'brass');
  }
  // Carry loop.
  b.box(-0.7, 17.72, -4.6, 0.3, 0.6, 0.35, L.dark, 'leather');
  b.box(0.7, 17.72, -4.6, 0.3, 0.6, 0.35, L.dark, 'leather');
  b.box(0, 18.05, -4.6, 1.7, 0.3, 0.35, L.dark, 'leather');
  // Worn high like the sheet: the lid tucks right under the krama, the base sits on the belt.
  return b.translate(0, 0.9, 0);
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
