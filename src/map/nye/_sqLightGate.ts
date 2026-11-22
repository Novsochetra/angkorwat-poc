import type { SourceTrace } from '../../feedback/sourceTrace';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { HeightField } from '../heightfield';
import { GATE } from './plan';
import type { LightWash } from './_sqLight';
import { LATERITE, pick, POST_STONE } from './_sqKit';

/**
 * The entrance gate at night (AWP-35; the owner: "the Bayon-face entrance gate is a dark grey block in the
 * foreground: light it warmly so it reads as a feature"): on each face two bronze fire bowls on sandstone pedestals
 * before its wings, their light washing up the wings (`_sqLight.ts`: light that keeps the stone's own tones), an
 * uplight on the ledge under each of the four Bayon faces washing up it, and in the passage a lantern hanging from its
 * corbelled top and a glow of lit air (its walls and floor are lit by the gate's own lamp, square.ts: light multiplied
 * over a lamp's light burns).
 *
 * The gate's shape is `_sqGate.ts`'s: a 0.5 m grid, 27 × 11 cells round `GATE`, the passage 9 cells wide and 5 m
 * high, the cornice 7 m up, the face tower's faces 4.5 m wide from 8 m up; the faces of its wings at ±2.75 m from
 * `GATE.z`, the window frames, base moulding and lintel 0.5 m proud of them.
 */

/** What the gate's lights are drawn with (the square glow's kit). */
export interface GateKit {
  b: VoxelBuilder;
  src: SourceTrace | undefined;
  light: LightWash;
  /** A glowing body (a flame's box): `flick` 0‥1. */
  flame(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, k: number, flick: number): void;
  /** A halo (`flick` 0‥1: with the flame there). */
  halo(x: number, y: number, z: number, size: number, color: number, level: number, flick: number): void;
  /** A soft additive pool on the ground. */
  pool(x: number, z: number, r: number, color: number, level: number): void;
  /** A hanging lantern from (x, y, z) on a cord `drop` m long. */
  lantern(x: number, y: number, z: number, drop: number, seed: number): void;
}

/** The flame (sRGB): a gold heart, orange tongues (not red: the bloom would turn them pink). */
const FIRE = { heart: 0xffb85a, tongue: 0xff9036 } as const;
const BRONZE = [0x5c4430, 0x523c2a, 0x664c36];
const WARM = 0xffa452;
/** Lamplight on the stone, paler (it multiplies the stone's own warm buff: a deep orange would turn it red). */
const STONE_LIGHT = 0xffcf9a;

/** Half the gate's width and depth (m), the passage's half width, its height and the face tower's half width. */
const HALF_W = 6.75;
const HALF_D = 2.75;
const PASS = 2.25;
const PASS_H = 5;
const CORNICE = 7;
const FACE_Y = 8;
const FACE_W = 2.25;

export function lightGate(k: GateKit, field: HeightField): void {
  const g = field.heightAt(GATE.x, GATE.z);
  const { light } = k;
  for (const side of [1, -1]) {
    // The face of the wings (z), and its front: the frames and the moulding 0.5 m proud of it.
    const face = GATE.z + side * HALF_D;
    const front = face + side * 0.5;
    for (const wing of [-1, 1]) {
      // A fire bowl before the wing's outer half, its light up the wing (clipped to it).
      const bx = GATE.x + wing * 5.4;
      const bz = face + side * 2.2;
      const by = field.heightAt(bx, bz);
      fireBowl(k, bx, by, bz, Math.round(bx * 7 + side * 3));
      const w0 = GATE.x + wing * PASS;
      const w1 = GATE.x + wing * HALF_W;
      light.wall({ x: bx, y: g + 0.6, z: front }, 1, 0, 0, side, 1.1, 0.42, CORNICE + 0.6, STONE_LIGHT, 0.5, { u0: Math.min(w0, w1) - bx, u1: Math.max(w0, w1) - bx, y0: -0.6, y1: CORNICE - 0.6 }, 1);
      light.pool(bx, bz, 4.2, STONE_LIGHT, 0.5, 1);
      k.pool(bx, bz, 3, WARM, 0.1);
    }
    // The lintel and the cornice over the passage, lit from below (the passage's glow, the bowls).
    light.wall({ x: GATE.x, y: g + PASS_H - 0.4, z: front }, 1, 0, 0, side, 2.6, 0.5, 3, STONE_LIGHT, 0.3, { u0: -3.2, u1: 3.2, y0: 0.6, y1: CORNICE + 0.1 - PASS_H + 0.4 });
  }

  // The Bayon faces, all four: an uplight from the ledge under each, its fixture on the ledge.
  for (const [nx, nz] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ]) {
    const ax = Math.abs(nz);
    const az = Math.abs(nx);
    // (the ledge's front: the face 0.5 m in from it)
    const fx = GATE.x + nx * (FACE_W + 0.5);
    const fz = GATE.z + nz * (FACE_W + 0.5);
    light.wall({ x: fx + nx * 0.03, y: g + FACE_Y - 0.6, z: fz + nz * 0.03 }, ax, az, nx, nz, 1.5, 0.32, 6.2, STONE_LIGHT, 1.1, { u0: -FACE_W - 0.2, u1: FACE_W + 0.2, y0: 0, y1: 6.4 });
    k.b.box(fx - nx * 0.22, g + FACE_Y + 0.06, fz - nz * 0.22, ax ? 0.34 : 0.22, 0.12, ax ? 0.22 : 0.34, pick(BRONZE, nx, nz, 7, 41), 'mapStone', { src: k.src, shade: 0.9 });
    k.halo(fx - nx * 0.12, g + FACE_Y + 0.16, fz - nz * 0.12, 0.6, 0xffc070, 0.35, 0);
  }

  // The passage: a lantern from its top, lit air in it (the gate's own lamp, square.ts, lights its walls and floor).
  k.lantern(GATE.x, g + 6.35, GATE.z, 1.1, 77);
  light.pool(GATE.x, GATE.z, 3.6, WARM, 0.12, 0.6);
  k.halo(GATE.x, g + PASS_H - 1.8, GATE.z, 5, 0xffa850, 0.12, 0.6);
}

/** A bronze fire bowl on a sandstone pedestal (y: the ground), its flame's heart and tongues glowing, flickering. */
function fireBowl(k: GateKit, x: number, y: number, z: number, seed: number): void {
  const { b, src } = k;
  b.box(x, y + 0.12, z, 0.7, 0.3, 0.7, pick(LATERITE, x, z, 1, seed), 'mapStone', { src });
  b.box(x, y + 0.31, z, 0.56, 0.08, 0.56, pick(POST_STONE, x, z, 2, seed), 'mapStone', { src, shade: 1.04 });
  b.box(x, y + 0.75, z, 0.32, 0.8, 0.32, pick(POST_STONE, x, z, 3, seed), 'mapStone', { src });
  b.box(x, y + 1.19, z, 0.48, 0.08, 0.48, pick(POST_STONE, x, z, 4, seed), 'mapStone', { src, shade: 1.05 });
  b.box(x, y + 1.31, z, 0.66, 0.16, 0.66, pick(BRONZE, x, z, 5, seed), 'mapStone', { src, shade: 0.9 });
  b.box(x, y + 1.43, z, 0.78, 0.1, 0.78, pick(BRONZE, x, z, 6, seed), 'mapStone', { src, shade: 0.95 });
  const fy = y + 1.5;
  k.flame(x, fy + 0.04, z, 0.6, 0.1, 0.6, FIRE.tongue, 0.8, 1);
  k.flame(x, fy + 0.26, z, 0.4, 0.38, 0.4, FIRE.heart, 0.95, 1);
  k.flame(x + 0.05, fy + 0.56, z - 0.03, 0.2, 0.28, 0.2, FIRE.tongue, 0.85, 1);
  k.halo(x, fy + 0.4, z, 3, 0xffa850, 0.7, 1);
}
