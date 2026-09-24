import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { pick, type Tones } from './_prasat';

/**
 * The giant trees of Ta Prohm (silk-cotton and strangler figs): a tall pale
 * trunk with buttresses, thick roots that pour over whatever is under them
 * (walls, roofs, towers) down to the ground, a few limbs, and a wide, flat,
 * lumpy crown high above. 1 m blocks; roots taper to 0.5 m.
 */

/** Pale grey-beige bark of the silk-cotton trees. */
export const PALE_BARK: Tones = [0xc3b9a4, 0xb6ac97, 0xcec5b1, 0xaaa08b];
/** Roots: the same bark, a little darker and warmer. */
export const ROOT: Tones = [0xa99d86, 0x9e927c, 0xb4a891, 0x958a75];
/**
 * Crowns: the silk-cotton trees' lighter, yellower green, so the giants read
 * apart from the darker jungle round them.
 */
export const CANOPY: Tones = [0x6d9a38, 0x7ca842, 0x5e8c32, 0x8ab44c, 0x6a9440];

export interface GiantTreeOpts {
  /** Trunk centre (builder space, m). */
  x: number;
  z: number;
  /** Where the trunk stands (m). */
  base: number;
  /** Top of the trunk, where the crown begins (m). */
  top: number;
  /** Crown radius (m). */
  crown: number;
  seed: number;
  /** Top of whatever is under a point (m): the roots follow it down walls and over roofs. */
  surface: (x: number, z: number) => number;
  /** May a root run here? (keeps them off the road) */
  allowed?: (x: number, z: number) => boolean;
  roots?: number;
  /** Root length along the ground (m). */
  reach?: number;
}

export function giantTree(b: VoxelBuilder, o: GiantTreeOpts): number {
  const src = traceSource();
  const n0 = b.boxes.length;
  const { x, z, base, top, seed } = o;
  const bark = (i: number, j: number, k: number) => pick(PALE_BARK, hash3(i, j, k, seed));
  // Trunk: 2 × 2 m, with a slight wander halfway up, and buttresses at the foot.
  const lean = [(hash3(seed, 1, 2, 5) - 0.5) * 2, (hash3(seed, 3, 4, 5) - 0.5) * 2];
  for (let y = base; y < top; y++) {
    const t = (y - base) / Math.max(1, top - base);
    const ox = Math.round(lean[0] * t * 2) * 0.5;
    const oz = Math.round(lean[1] * t * 2) * 0.5;
    for (const [dx, dz] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [-0.5, 0.5],
      [0.5, 0.5],
    ])
      b.box(x + ox + dx, y + 0.5, z + oz + dz, 1, 1, 1, bark(dx * 2, y, dz * 2), 'mapBark', { src, shade: 0.92 + 0.12 * t });
  }
  const buttress = Math.min(4, Math.max(2, Math.round((top - base) * 0.2)));
  for (const [dx, dz] of [
    [-1.5, -0.5],
    [-1.5, 0.5],
    [1.5, -0.5],
    [1.5, 0.5],
    [-0.5, -1.5],
    [0.5, -1.5],
    [-0.5, 1.5],
    [0.5, 1.5],
  ]) {
    const h = buttress - (hash3(dx * 2, dz * 2, seed, 7) < 0.5 ? 1 : 0);
    for (let y = 0; y < h; y++) b.box(x + dx, base + y + 0.5, z + dz, 1, 1, 1, bark(dx * 4, y, dz * 4), 'mapBark', { src, shade: 0.9 });
  }

  // Roots, pouring over what lies below.
  const roots = o.roots ?? 7;
  const reach = o.reach ?? 11;
  for (let r = 0; r < roots; r++) {
    const a = ((r + hash3(r, seed, 9, 1) * 0.6) / roots) * Math.PI * 2;
    let dx = Math.cos(a);
    let dz = Math.sin(a);
    let h = base;
    let px = x + dx * 1.5;
    let pz = z + dz * 1.5;
    for (let s = 0; s < reach; s++) {
      // A little wander.
      const w = (hash3(r, s, seed, 11) - 0.5) * 0.5;
      const ndx = dx - dz * w;
      const ndz = dz + dx * w;
      const l = Math.hypot(ndx, ndz);
      dx = ndx / l;
      dz = ndz / l;
      const nx = px + dx;
      const nz = pz + dz;
      if (o.allowed && !o.allowed(nx, nz)) break;
      const size = s < 3 ? 1 : s < 7 ? 0.75 : 0.5;
      const surf = o.surface(nx, nz);
      const color = pick(ROOT, hash3(r, s, seed, 13));
      if (surf < h - 0.25) {
        // Down a wall face: a hanging run of root from here to the level below.
        for (let y = surf; y < h; y += size) b.box(nx, y + size / 2, nz, size, size, size, color, 'mapBark', { src, shade: 0.88 });
        h = surf;
      } else if (surf > h + 0.25) {
        // Up and over.
        for (let y = h; y < surf; y += size) b.box(px, y + size / 2, pz, size, size, size, color, 'mapBark', { src, shade: 0.9 });
        h = surf;
      }
      b.box(nx, h + size / 2, nz, size, size, size, color, 'mapBark', { src, shade: 0.94 });
      px = nx;
      pz = nz;
    }
  }

  // Limbs up into the crown.
  const cy = top + o.crown * 0.35;
  const tx = x + Math.round(lean[0] * 2) * 0.5;
  const tz = z + Math.round(lean[1] * 2) * 0.5;
  for (let l = 0; l < 4; l++) {
    const a = ((l + hash3(l, seed, 3, 17) * 0.5) / 4) * Math.PI * 2;
    const len = o.crown * 0.55;
    for (let s = 0; s < len; s++) {
      const t = s / len;
      b.box(tx + Math.cos(a) * s, top - 1 + t * (cy - top + 1), tz + Math.sin(a) * s, 1, 1, 1, bark(l, s, 3), 'mapBark', { src, shade: 0.95 });
    }
  }

  // Crown: a wide, flattish, lumpy dome of 1 m leaf blocks (only its shell).
  const R = o.crown;
  const H = R * 0.42;
  const n = Math.ceil(R) + 1;
  const inside = (i: number, j: number, k: number) => {
    const bump = (hash3(Math.floor(i / 3), Math.floor(j / 2), Math.floor(k / 3), seed + 19) - 0.5) * 0.45 + (hash3(i, j, k, seed + 23) - 0.5) * 0.18;
    const q = Math.hypot(i / R, (j > 0 ? j / H : j / (H * 0.7)), k / R);
    return q + bump < 1;
  };
  for (let i = -n; i <= n; i++)
    for (let k = -n; k <= n; k++)
      for (let j = -Math.ceil(H) - 1; j <= Math.ceil(H) + 1; j++) {
        if (!inside(i, j, k)) continue;
        if (inside(i + 1, j, k) && inside(i - 1, j, k) && inside(i, j + 1, k) && inside(i, j - 1, k) && inside(i, j, k + 1) && inside(i, j, k - 1)) continue;
        const up = (j + H) / (2 * H);
        const color = pick(CANOPY, hash3(i, j, k, seed + 29));
        b.box(tx + i, cy + j, tz + k, 1, 1, 1, color, 'mapLeaf', { src, shade: 0.72 + 0.4 * Math.max(0, Math.min(1, up)) });
      }
  return b.boxes.length - n0;
}
