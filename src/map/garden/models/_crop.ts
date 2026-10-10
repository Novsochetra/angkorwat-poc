import { Euler, Quaternion, Vector3 } from 'three';
import type { VoxelMaterialKey } from '../../../voxel/materials';
import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { hash3 } from '../../../voxel/random';
import type { PlantLook } from '../state';

/**
 * Shared pieces of the garden's four crops (eggplant, corn, pumpkin, sugarcane:
 * garden/models/{eggplant,corn,pumpkin,sugarcane}.ts; the contract garden/look.ts):
 * seeded randomness, colours for thirst and death, and turned blocks laid end to end
 * (stems, ribbon leaves, vines, canes), the bamboo marker with its empty seed packet
 * and the little mound of a sown seed.
 *
 * Directions: `yaw` turns about y (0 toward +z, π/2 toward +x), `tilt` leans from
 * straight up toward that yaw (0 up, π/2 level, π straight down).
 */

/** A point that a chain of blocks moves along. */
export interface P {
  x: number;
  y: number;
  z: number;
}

export const pt = (x: number, y: number, z: number): P => ({ x, y, z });

/** A seeded value 0‥1 for one look and a salt (the same plant draws the same every time). */
export type Rand = (a: number, b?: number) => number;

export function rng(look: PlantLook, salt: number): Rand {
  const s = Math.round(look.seed * 99991);
  return (a, b = 0) => hash3(a, b, s, salt);
}

/** Two sRGB colours mixed (t 0 → a, 1 → b). */
export function mix(a: number, b: number, t: number): number {
  const u = 1 - t;
  const r = Math.round(((a >> 16) & 255) * u + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * u + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * u + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}

/** One of a few tones by a value 0‥1. */
export const tone = (list: readonly number[], r: number): number => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/** A leaf's colour for want of water: paler, yellowing (droop 1); limp yellow-brown (droop 2). */
export function thirsty(c: number, droop: 0 | 1 | 2, r = 0.5): number {
  if (droop === 0) return c;
  if (droop === 1) return mix(c, 0xa4ac5c, 0.34 + r * 0.12);
  return mix(c, r < 0.4 ? 0x8e7038 : 0xa89648, 0.6 + r * 0.18);
}

/** Dead: dry stems grey-brown, dry leaves brown (nothing green). Dry leaves are drawn as `mapBark` (its warm edge, no green). */
export const DEAD_STEM = [0x7c6c5a, 0x6e6050, 0x887664] as const;
export const DEAD_LEAF = [0x8c6e48, 0x7a5e3c, 0x9a7c50, 0x705638] as const;

/** Fresh dug earth heaped over a seed (darker than the bed: just turned and watered in). */
export const MOUND = [0x5c4430, 0x544030, 0x644a34] as const;

const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);

/**
 * A block laid from `p` along a direction (`yaw`, `tilt`), `len` long, `w` wide (level across the direction) and
 * `t` thick; `roll` turns it about its own length. It reaches a little past both ends (so a bent chain shows no
 * gap). Moves `p` to its far end and returns it.
 */
export function seg(b: VoxelBuilder, p: P, len: number, w: number, t: number, yaw: number, tilt: number, color: number, mat: VoxelMaterialKey, roll = 0, shade = 1): P {
  const st = Math.sin(tilt);
  const dx = st * Math.sin(yaw);
  const dy = Math.cos(tilt);
  const dz = st * Math.cos(yaw);
  _q.setFromAxisAngle(Y, yaw);
  _q2.setFromAxisAngle(X, tilt);
  _q.multiply(_q2);
  if (roll) {
    _q2.setFromAxisAngle(Y, roll);
    _q.multiply(_q2);
  }
  _e.setFromQuaternion(_q, 'XYZ');
  const h = len / 2;
  b.box(p.x + dx * h, p.y + dy * h, p.z + dz * h, w, len + Math.min(w, t) * 0.5, t, color, mat, { rx: _e.x, ry: _e.y, rz: _e.z, shade });
  p.x += dx * len;
  p.y += dy * len;
  p.z += dz * len;
  return p;
}

const Z = new Vector3(0, 0, 1);

/**
 * A block centred at `c`, turned as `seg` turns one (`yaw`, `tilt`, `roll` about its length), then `spin` about its
 * own thin axis (z): a blade's cross block, turned in the blade's plane.
 */
export function turned(b: VoxelBuilder, c: P, w: number, len: number, t: number, yaw: number, tilt: number, roll: number, spin: number, color: number, mat: VoxelMaterialKey): void {
  _q.setFromAxisAngle(Y, yaw);
  _q2.setFromAxisAngle(X, tilt);
  _q.multiply(_q2);
  _q2.setFromAxisAngle(Y, roll);
  _q.multiply(_q2);
  _q2.setFromAxisAngle(Z, spin);
  _q.multiply(_q2);
  _e.setFromQuaternion(_q, 'XYZ');
  b.box(c.x, c.y, c.z, w, len, t, color, mat, { rx: _e.x, ry: _e.y, rz: _e.z });
}

/** Where a direction (`yaw`, `tilt`) goes `d` from `p` (no block). */
export function step(p: P, d: number, yaw: number, tilt: number): P {
  const st = Math.sin(tilt);
  p.x += st * Math.sin(yaw) * d;
  p.y += Math.cos(tilt) * d;
  p.z += st * Math.cos(yaw) * d;
  return p;
}

/**
 * A ribbon or blade bending as it goes (corn, sugarcane, a curling leaf): `n` blocks from `p` toward `yaw`, the
 * first leaning `tilt`, each next `bend` more; `len` in all, its width from `w0` to `w1`. Each block's colour from
 * `color(i)`; `twist` turns each next block more about its length (a leaf twisting as it hangs). Returns the tip
 * (a new point).
 */
export function ribbon(
  b: VoxelBuilder,
  p: P,
  yaw: number,
  tilt: number,
  bend: number,
  n: number,
  len: number,
  w0: number,
  w1: number,
  t: number,
  color: (i: number) => number,
  mat: VoxelMaterialKey = 'mapLeaf',
  twist = 0,
): P {
  const q = pt(p.x, p.y, p.z);
  for (let i = 0; i < n; i++) {
    const w = n === 1 ? w0 : w0 + ((w1 - w0) * i) / (n - 1);
    seg(b, q, len / n, w, t, yaw, Math.min(Math.PI * 0.97, tilt + bend * i), color(i), mat, twist * (i + 1));
  }
  return q;
}

/** The little heap of earth over a sown seed (a cap rising out of the bed). */
export function mound(b: VoxelBuilder, x: number, z: number, s: number, r: number): void {
  b.box(x, 0.045, z, s, 0.07, s * 0.9, tone(MOUND, r), 'mapRock', { ry: r * 1.2 });
  b.box(x, 0.085, z, s * 0.6, 0.05, s * 0.55, tone(MOUND, 1 - r), 'mapRock', { ry: r * 1.2 + 0.5 });
}

/** A seed packet's printed colours: its paper, the band along its top, the picture of the crop on its front. */
export interface Packet {
  readonly paper: number;
  readonly band: number;
  readonly art: number;
}

/**
 * The bamboo marker stick pushed in beside a sown row, the empty seed packet slipped over its top (so he knows
 * what came up where): readable from 6 m. At (`x`, `z`), its face toward `yaw`; `faded` (dead seed) bleaches it.
 */
export function marker(b: VoxelBuilder, x: number, z: number, yaw: number, pack: Packet, r: number, faded = false): void {
  const lean = (r - 0.5) * 0.16;
  const p = pt(x, -0.02, z);
  seg(b, p, 0.46, 0.026, 0.026, yaw + Math.PI / 2, lean, mix(0xc8b072, 0xb09a5e, r), 'mapBark');
  const f = (c: number) => (faded ? mix(c, 0xd8d0b8, 0.55) : c);
  // The packet: slipped over the stick's top, its front toward `yaw`.
  const cx = x + Math.sin(yaw + Math.PI / 2) * Math.sin(lean) * 0.38;
  const cz = z + Math.cos(yaw + Math.PI / 2) * Math.sin(lean) * 0.38;
  const cy = 0.37;
  const tw = { ry: yaw, rz: lean * 0.6 };
  // (opened a little where the stick goes through it, so it reads from the side too; the picture on both faces)
  b.box(cx, cy, cz, 0.1, 0.13, 0.034, f(pack.paper), 'petal', tw);
  b.box(cx, cy + 0.048, cz, 0.104, 0.03, 0.038, f(pack.band), 'petal', tw);
  for (const s of [1, -1]) b.box(cx + Math.sin(yaw) * 0.016 * s, cy - 0.016, cz + Math.cos(yaw) * 0.016 * s, 0.064, 0.062, 0.006, f(pack.art), 'petal', tw);
}
