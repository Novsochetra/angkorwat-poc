import { Euler, Quaternion, Vector3 } from 'three';
import type { SourceTrace } from '../../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../../voxel/materials';
import { hash3 } from '../../../voxel/random';
import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';

/**
 * Shared plumbing of the yard pieces he builds at home (the pen, the shelter,
 * the bamboo bed, the fence, the straw stack: build/models/{pen,shelter,kre,
 * fence,haystack}.ts; the contract build/pieces.ts): seeded randomness, the
 * village's colours (hamlet/_evKit.ts, village/_kit.ts, jungle/_campKit.ts:
 * the same wood, bamboo, thatch and straw as the sugar-palm village's own pen,
 * houses and stacks), and turned boxes (poles from a to b, thatch courses,
 * leaning posts). Only the map's block families (`Mat`).
 */

export type Mat = Extract<VoxelMaterialKey, 'mapBark' | 'mapLeaf' | 'mapStone' | 'petal' | 'mapRock' | 'mapGrass'>;
export type Rand = () => number;
export type Src = SourceTrace | undefined;

/** A seeded stream for one piece (the same seed draws the same piece every time): `salt` keeps its parts apart. */
export function rng(seed: number, salt: number): Rand {
  // (seeds may be 0‥1 like the garden's, or whole numbers: both spread over the hash)
  const s = Math.round(seed * 9973) | 0;
  let n = 0;
  return () => hash3(n++, s, salt, 613);
}

/** One of a few tones by a random value. */
export const tone = (list: readonly number[], r: number): number => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/** Two sRGB colours mixed (t 0 → a, 1 → b). */
export function mix(a: number, b: number, t: number): number {
  const u = 1 - t;
  const r = Math.round(((a >> 16) & 255) * u + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * u + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * u + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}

// ── Colours (sRGB), the village's ───────────────────────────────────────────

/** Posts: dark, wet-stained hardwood (village/_kit.ts `POST`). */
export const POST = [0x4e3d30, 0x5a4636, 0x46372b, 0x55432f] as const;
/** Rough rails and poles, lighter (the village pen's rails). */
export const RAIL = [0x8a6a48, 0x7a5a3a, 0x9a7a54, 0x846446] as const;
/** Aged whole bamboo, straw-gold (village/_kit.ts `BAMBOO`). */
export const BAMBOO = [0xc8b27a, 0xbba36c, 0xd4bf88, 0xae9660] as const;
/** Older bamboo, darker gold-brown (frames, legs). */
export const OLD_BAMBOO = [0x9a8458, 0x8e7a4e, 0xa48c5e, 0x937c50] as const;
/** New split bamboo, pale green-gold (just cut: slats, lattice). */
export const NEW_BAMBOO = [0xcdc47e, 0xc1b970, 0xd6cc8c, 0xb8b066, 0xc9bd78] as const;
/** A bamboo node's ring (a little darker, greener). */
export const NODE = [0xa49a5a, 0x988e52] as const;
/** Rattan and bamboo-strip lashings. */
export const TIE = [0x7a6446, 0x6e5a3e, 0x857050] as const;
/** Dried palm-leaf thatch, new: golden tan going silver (the palm sugar shed's, hamlet/_psKit.ts `THATCH`, `THATCH_NEW`). */
export const THATCH = [0xa08c66, 0x97835e, 0xaa966e, 0x8f7e5e, 0xa69472, 0x9a8a6a] as const;
export const THATCH_NEW = [0xb49c6a, 0xbfa874, 0xa89060] as const;
export const THATCH_OLD = [0x8e8470, 0x857b68, 0x978d78] as const;
/** The thatch's dark underside and ragged eave ends. */
export const THATCH_DARK = [0x6e5e44, 0x66573e, 0x75644a] as const;
/** Rice straw: fresh gold, weathered grey-gold (hamlet/_evKit.ts `STRAW`, _bhYard.ts). */
export const STRAW = [0xd4b868, 0xc8a858, 0xdcc478, 0xbc9c50, 0xd8bc6a] as const;
export const OLD_STRAW = [0xa89058, 0x9c8652, 0xb09a62, 0x8f7c4c] as const;
/** Trodden earth (as the palm sugar yard's), and the land's own worn paths (terrain/palette.ts `PATH`). */
export const EARTH = [0x8c6642, 0x82603e, 0x94704a, 0x7c5a3a] as const;
export const PATH = [0xa6825a, 0x997652, 0xb08c63, 0x9e7a55] as const;
/** Cut wood's pale end grain. */
export const CUT = [0xd8b27a, 0xcfa56b, 0xc89c62] as const;
/** Krama checks: a colour and white. */
export const KRAMA: readonly (readonly [number, number])[] = [
  [0xb8322c, 0xf0ece0],
  [0x2c5a9a, 0xf0ece0],
  [0x3a7a4a, 0xf0ece0],
  [0x7a2a6a, 0xf0ece0],
];

// ── Turned boxes ─────────────────────────────────────────────────────────────

const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);

/**
 * A box turned: `yaw` about y, then `pitch` (its +z end up, radians), then `roll` about its own length (z). The
 * box's centre at (x, y, z). (As the garden's `turned`.)
 */
export function turned(b: VoxelBuilder, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, pitch: number, roll: number, color: number, mat: Mat, shade: number, src: Src): void {
  _q.setFromAxisAngle(Y, yaw);
  if (pitch) _q.multiply(_q2.setFromAxisAngle(X, -pitch));
  if (roll) _q.multiply(_q2.setFromAxisAngle(Z, roll));
  _e.setFromQuaternion(_q, 'XYZ');
  b.box(x, y, z, sx, sy, sz, color, mat, { shade, rx: _e.x, ry: _e.y, rz: _e.z, src });
}

/**
 * A pole, board or bundle from a to b: `w` across, `t` thick (its own up), its length along a→b plus `over` at
 * each end (lashed ends past the post), `roll` about its length.
 */
export function stick(b: VoxelBuilder, ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, t: number, color: number, mat: Mat, shade: number, src: Src, over = 0, roll = 0): void {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const flat = Math.hypot(dx, dz);
  const len = Math.hypot(flat, dy);
  if (len < 1e-4) return;
  turned(b, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, w, t, len + 2 * over, Math.atan2(dx, dz), Math.atan2(dy, flat), roll, color, mat, shade, src);
}

/**
 * An upright post from `y0` (below the ground: sunk in) to `top`, `w` square, leaning a little about its foot at
 * (x, z): `lx` its top toward +z, `lz` toward −x (radians, small).
 */
export function post(b: VoxelBuilder, x: number, z: number, y0: number, top: number, w: number, color: number, mat: Mat, shade: number, src: Src, lx = 0, lz = 0): void {
  const h = top - y0;
  // (turned about its middle, so the middle moves half as far as the top: the foot stays put)
  b.box(x - Math.sin(lz) * h * 0.5, y0 + h / 2, z + Math.sin(lx) * h * 0.5, w, h, w, color, mat, { shade, rx: lx, rz: lz, src });
}

/**
 * One course of thatch on a roof's slope (as the palm sugar shed's, hamlet/_psKit.ts `thatchSlope`): a band along
 * `axis` from `a0` to `a1` at `at` across it, `slab` wide down the slope, its middle `y` on the roof's plane (the
 * thatch's mid-thickness), the roof falling toward `down` (±1 along the other axis) at `pitch`. Laid a little
 * flatter than the roof, so its lower edge stands proud on the course below (the line of shade that reads as
 * thatch); cut in panels of their own tone; now and then a patch of newer or older leaf over it, a finger proud.
 */
export function thatchBand(b: VoxelBuilder, r: Rand, axis: 'x' | 'z', a0: number, a1: number, at: number, y: number, slab: number, thick: number, pitch: number, down: number, dark: number, src: Src): void {
  const lift = thick * 0.8;
  const flat = pitch - Math.atan2(lift, slab);
  // (raised half the lift: the upper edge on the plane, the lower edge `lift` over it)
  const yc = y + lift / 2;
  const tiltOf = (p: number) => (axis === 'x' ? { rx: down * p } : { rz: -down * p });
  let a = a0;
  while (a1 - a > 0.05) {
    let e = Math.min(a1, a + 0.4 + r() * 0.55);
    if (a1 - e < 0.3) e = a1;
    const c = tone(THATCH, r());
    const sh = dark * (0.88 + r() * 0.14);
    const th = thick + r() * 0.03;
    if (axis === 'x') b.box((a + e) / 2, yc + (r() - 0.5) * 0.025, at, e - a + 0.02, th, slab, c, 'mapBark', { src, shade: sh, ...tiltOf(flat) });
    else b.box(at, yc + (r() - 0.5) * 0.025, (a + e) / 2, slab, th, e - a + 0.02, c, 'mapBark', { src, shade: sh, ...tiltOf(flat) });
    a = e;
  }
  // Patches of newer (golden) or older (grey) leaf.
  const n = Math.max(1, Math.round((a1 - a0) / 2));
  for (let k = 0; k < n; k++) {
    if (r() < 0.35) continue;
    const pl = 0.45 + r() * 0.8;
    const m = a0 + ((a1 - a0) * (k + 0.2 + 0.6 * r())) / n;
    const pa = Math.max(a0, m - pl / 2);
    const pb = Math.min(a1, m + pl / 2);
    if (pb - pa < 0.3) continue;
    const c = r() < 0.6 ? tone(THATCH_NEW, r()) : tone(THATCH_OLD, r());
    // (a finger over the band, toward its upper half: the next course hides its top)
    const up = 0.035 / Math.cos(pitch);
    const back = slab * 0.08;
    const dz = axis === 'x' ? -down * back : 0;
    const dx = axis === 'z' ? -down * back : 0;
    if (axis === 'x') b.box((pa + pb) / 2, yc + up + Math.tan(flat) * back, at + dz, pb - pa, thick * 0.7, slab * 0.8, c, 'mapBark', { src, shade: dark * (0.92 + r() * 0.1), ...tiltOf(flat) });
    else b.box(at + dx, yc + up + Math.tan(flat) * back, (pa + pb) / 2, slab * 0.8, thick * 0.7, pb - pa, c, 'mapBark', { src, shade: dark * (0.92 + r() * 0.1), ...tiltOf(flat) });
  }
}
