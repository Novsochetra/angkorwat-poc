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
/** Dried palm-leaf thatch, new: warm tan going silver (village `ROOFS.thatch`, Kulen's `THATCH`). */
export const THATCH = [0x958060, 0x8c7856, 0x9e8a66, 0x857250, 0xa38f6a, 0x8f7c5a] as const;
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
