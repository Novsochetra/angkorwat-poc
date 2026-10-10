import { Euler, Matrix4, Vector3 } from 'three';
import type { VoxelMaterialKey } from '../../../voxel/materials';
import { hash3 } from '../../../voxel/random';
import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import type { PlantLook } from '../state';

/**
 * Shared helpers of the garden's fruit plants (banana.ts, papaya.ts, guava.ts):
 * a block laid along a line (`beam`), a round-ish stick (`log`), seeded numbers
 * from a plant's own `seed` (`rng`), colour mixing, and how a thirsty or dead
 * plant's colours turn (`leafTone`, `woodTone`). Local metres, the plant's foot at
 * the origin (garden/look.ts: the contract).
 */

export type P3 = [number, number, number];

const UP = new Vector3(0, 1, 0);
const _a = new Vector3();
const _c = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _t = new Vector3();
const _m = new Matrix4();
const _e = new Euler();

/**
 * A block from point a to point c (its length along the line), `w` wide and `h`
 * deep. Its width lies level (across the line, in the ground plane) and `roll`
 * turns it about the line: positive lifts its +x side (x = up × the line).
 */
export function beam(b: VoxelBuilder, a: P3, c: P3, w: number, h: number, color: number, mat: VoxelMaterialKey, roll = 0, shade?: number): void {
  _a.set(a[0], a[1], a[2]);
  _c.set(c[0], c[1], c[2]);
  _z.subVectors(_c, _a);
  const len = _z.length();
  if (len < 1e-4) return;
  _z.divideScalar(len);
  _x.crossVectors(UP, _z);
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
  _x.normalize();
  _y.crossVectors(_z, _x);
  if (roll) {
    const co = Math.cos(roll);
    const si = Math.sin(roll);
    _t.copy(_x);
    _x.multiplyScalar(co).addScaledVector(_y, si);
    _y.multiplyScalar(co).addScaledVector(_t, -si);
  }
  _e.setFromRotationMatrix(_m.makeBasis(_x, _y, _z), 'XYZ');
  b.box((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2, w, h, len, color, mat, { shade, rx: _e.x || undefined, ry: _e.y || undefined, rz: _e.z || undefined });
}

/**
 * A point on the skin of a stick from a to c (`rad` its radius), `t` along it (0‥1), `phi` round it: the side
 * a `beam` from a to c with `roll` = `phi` lays its thin face against (for bark patches).
 */
export function surface(a: P3, c: P3, t: number, phi: number, rad: number): P3 {
  _z.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]).normalize();
  _x.crossVectors(UP, _z);
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
  _x.normalize();
  _y.crossVectors(_z, _x);
  // (the rolled beam's own y: y cos φ − x sin φ)
  const co = Math.cos(phi);
  const si = Math.sin(phi);
  return [a[0] + (c[0] - a[0]) * t + (_y.x * co - _x.x * si) * rad, a[1] + (c[1] - a[1]) * t + (_y.y * co - _x.y * si) * rad, a[2] + (c[2] - a[2]) * t + (_y.z * co - _x.z * si) * rad];
}

/** A round-ish stick from a to c, `d` thick: two blocks turned 45° about its length (an octagon). */
export function log(b: VoxelBuilder, a: P3, c: P3, d: number, color: number, mat: VoxelMaterialKey, shade = 1): void {
  const s = d * 0.86;
  beam(b, a, c, s, s, color, mat, 0, shade);
  beam(b, a, c, s, s, color, mat, Math.PI / 4, shade * 0.96);
}

/** Seeded numbers (0‥1) of one plant: `r(i, j)` is the same every build for the same look. */
export function rng(look: PlantLook, salt: number): (i: number, j?: number) => number {
  const s = Math.floor(look.seed * 99991) | 0;
  return (i, j = 0) => hash3(i | 0, j | 0, s, salt);
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Two sRGB colours mixed (t 0: a, 1: b). */
export function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => {
    const x = (a >> s) & 255;
    const y = (b >> s) & 255;
    return Math.round(x + (y - x) * t) & 255;
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** One of a few tones by a seeded number (0‥1). */
export const pick = (tones: readonly number[], r: number): number => tones[Math.min(tones.length - 1, Math.floor(r * tones.length))];

/** A point `len` along the direction of azimuth `az` (0: +z) and elevation `el` from p. */
export function along(p: P3, az: number, el: number, len: number): P3 {
  const h = Math.cos(el) * len;
  return [p[0] + Math.sin(az) * h, p[1] + Math.sin(el) * len, p[2] + Math.cos(az) * h];
}

/** The level unit vector across azimuth `az` (beam's +x for a line going that way). */
export const across = (az: number): P3 => [Math.cos(az), 0, -Math.sin(az)];

/** Pale for want of water (droop 1), yellow-brown and limp (droop 2), dry brown (dead). */
const PALE = 0xa6ae5e;
const LIMP = 0x9e8a46;
const DRY = 0x7e684a;
const DRY_WOOD = 0x7a6e60;

/** A green part's colour as the plant's thirst or death turns it (`k` 0‥1: how much of it turns, for variety). */
export function leafTone(c: number, look: PlantLook, k = 1): number {
  if (look.dead) return mix(c, DRY, 0.82 + 0.18 * k);
  if (look.droop === 2) return mix(c, LIMP, 0.55 + 0.3 * k);
  if (look.droop === 1) return mix(c, PALE, 0.38 + 0.14 * k);
  return c;
}

/** Wood or a stem: greyer and drier when dead. */
export function woodTone(c: number, look: PlantLook, k = 0.75): number {
  return look.dead ? mix(c, DRY_WOOD, k) : c;
}
