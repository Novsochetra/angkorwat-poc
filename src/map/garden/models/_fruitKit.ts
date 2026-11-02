import { Vector3 } from 'three';
import { hash3 } from '../../../voxel/random';
import { mix, type P3 } from '../../veg/plantKit';
import type { PlantLook } from '../state';

/**
 * Shared helpers of the garden's fruit plants (banana.ts, papaya.ts, guava.ts):
 * seeded numbers from a plant's own `seed` (`rng`), a point on a stick's skin
 * (`surface`), and how a thirsty or dead plant's colours turn (`leafTone`,
 * `woodTone`). A block laid along a line (`beam`), a round-ish stick (`log`),
 * `along`, `across` and colour mixing are the map's plant kit's
 * (veg/plantKit.ts), passed on from here. Local metres, the plant's foot at the
 * origin (garden/look.ts: the contract).
 */

export type { P3 } from '../../veg/plantKit';
export { across, along, beam, log, mix } from '../../veg/plantKit';

const UP = new Vector3(0, 1, 0);
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();

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

/** Seeded numbers (0‥1) of one plant: `r(i, j)` is the same every build for the same look. */
export function rng(look: PlantLook, salt: number): (i: number, j?: number) => number {
  const s = Math.floor(look.seed * 99991) | 0;
  return (i, j = 0) => hash3(i | 0, j | 0, s, salt);
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/** One of a few tones by a seeded number (0‥1). */
export const pick = (tones: readonly number[], r: number): number => tones[Math.min(tones.length - 1, Math.floor(r * tones.length))];

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
