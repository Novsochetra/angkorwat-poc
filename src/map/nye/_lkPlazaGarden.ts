import type { SourceTrace } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { GLOW_MODE, type Glow } from '../festival/_glow';
import { ANIM, perPeriod, SHOW, type Kit } from '../festival/_kit';
import type { HeightField } from '../heightfield';
import { LAKE_AVENUE, LAKE_GATE, LAKE_PILLARS, LAKE_POND, LAKE_SALAS, LAKE_SIDE, LAKE_WALL, lakeFacingIn, lakePlazaAt } from './plan';
import { champa, lilyPad, lotus } from './_sqGarden';
import { LATERITE, pick, POST_STONE } from './_sqKit';

/**
 * The lake plaza's garden (AWP-35, the owner's lake reference: purple flower beds round the wall, a lily pond in the
 * foreground by the gate; where: plan.ts `LAKE_POND`, `LAKE_WALL`, `LAKE_AVENUE`):
 *
 * - **flower beds** in a ring just outside the wall (between it and the lamp posts), and along both sides of the
 *   avenue: mostly purple and violet (torenia, lavender), pink periwinkle, now and then white jasmine;
 * - **the lily pond** left of the avenue by the gate: a kerb of sandstone and laterite round dark still water (the
 *   kit: no walk map, he wades if he jumps the kerb), lily pads and pink lotus, a frangipani leaning over it, and on
 *   the night lotus candles drifting on it, their light in the water.
 *
 * Plants and the kerb in the shore's builder (leaf and petal soft, stone solid), the water, lilies and candles in the
 * kit and the glow: no draw of their own.
 */

export interface GardenIn {
  field: HeightField;
  b: VoxelBuilder;
  kit: Kit;
  glow: Glow;
  low: boolean;
  src: SourceTrace | undefined;
  /** The plaza's paving (the floor and the landing): beds keep off it. */
  paved(x: number, z: number): boolean;
}

/** Flowers: [leaves, flower tones] — purple torenia, lavender, pink periwinkle, violet, white jasmine. */
const BEDS: readonly [number, readonly number[]][] = [
  [0x447e34, [0x8a4cc8, 0x9a5ad6, 0x7a3eb4]],
  [0x4a8a36, [0xa070d8, 0xb486e2, 0x9462cc]],
  [0x4a8a36, [0xf07aa8, 0xe8609a, 0xf596bd]],
  [0x3f7a2e, [0x6a34a8, 0x7a40b8, 0x5e2c9a]],
  [0x447e34, [0x8a4cc8, 0xa070d8, 0x7a3eb4]],
  [0x4f8a2c, [0xf2eee4, 0xfaf6ea, 0xe8e2d4]],
];
const SOIL = [0x4a3424, 0x543a28, 0x40301f];
/** The pond's water (dark, still) and its kerb. */
const POND_WATER = 0x1f4352;

export function dressPlazaGarden(o: GardenIn): void {
  const { field, b, low, src } = o;
  // ── Beds round the wall, outside it: between the pillars, the lamp posts left a gap ──
  const RB = LAKE_WALL.r + 0.85;
  const keepOff = (a: number, r: number) => {
    const [x, z] = lakePlazaAt(a, r);
    return (
      o.paved(x, z) ||
      LAKE_PILLARS.some((p) => Math.hypot(p.x - x, p.z - z) < 1.05) ||
      LAKE_SALAS.some((s) => Math.hypot(s.x - x, s.z - z) < 5.2) ||
      Math.abs(Math.atan2(Math.sin(a - LAKE_GATE.phi), Math.cos(a - LAKE_GATE.phi))) < 0.3 ||
      Math.abs(Math.atan2(Math.sin(a - LAKE_SIDE.phi), Math.cos(a - LAKE_SIDE.phi))) < 0.16 ||
      Math.abs(a) < LAKE_WALL.front + 0.05 ||
      field.waterAt(x, z) !== null ||
      field.heightAt(x, z) < 7.6
    );
  };
  // (the lamp posts stand mid-way between the pillars, 0.6 m further out: a gap for each)
  const postAt = LAKE_PILLARS.map((p, i) => {
    const q = LAKE_PILLARS[(i + 1) % LAKE_PILLARS.length];
    return Math.atan2(Math.sin(p.phi) + Math.sin(q.phi), Math.cos(p.phi) + Math.cos(q.phi));
  });
  // Runs of free 1 m pieces round the ring, each laid as beds of up to 4 m that follow the curve.
  let run: number[] = [];
  let seed = 700;
  const flush = () => {
    for (let k = 0; run.length >= 2 && k < Math.ceil(run.length / 4); k++) {
      const pieces = Math.ceil(run.length / 4);
      const [px, pz] = lakePlazaAt(run[Math.floor((k * (run.length - 1)) / pieces)], RB);
      const [qx, qz] = lakePlazaAt(run[Math.floor(((k + 1) * (run.length - 1)) / pieces)], RB);
      bed(b, field, px, pz, qx, qz, 0.7, seed++, low, src);
    }
    run = [];
  };
  for (let a = -Math.PI; a < Math.PI; a += 1 / RB) {
    const nearPost = postAt.some((m) => Math.abs(Math.atan2(Math.sin(a - m), Math.cos(a - m))) * RB < 0.75);
    if (keepOff(a, RB) || nearPost) flush();
    else run.push(a);
  }
  flush();

  // ── Beds along the avenue's sides (past the naga), broken where its lamps stand ──
  {
    const F = (lr: number, s: number): [number, number] => {
      const [x, z] = lakePlazaAt(LAKE_AVENUE.phi, lr);
      const yaw = lakeFacingIn(LAKE_AVENUE.phi);
      // (across: the avenue's left and right)
      return [x + Math.cos(yaw) * s, z - Math.sin(yaw) * s];
    };
    const off = LAKE_AVENUE.w / 2 + 1.45;
    for (const s of [-1, 1])
      for (let r = LAKE_AVENUE.r0 + 9.2; r < LAKE_AVENUE.r1 - 3; r += 4.5) {
        const [ax, az] = F(r, s * off);
        const [bx, bz] = F(r + 3.2, s * off);
        if ([ax, bx].some((x, k) => field.trail[field.index(x, k ? bz : az)] === 2) || field.isFree(ax, az) === false) continue;
        bed(b, field, ax, az, bx, bz, 0.8, 760 + Math.round(r) * 2 + s, low, src);
      }
  }

  pond(o);
}

/** A flower bed from (x0, z0) to (x1, z1), `w` m wide: dark soil, a row (two but on low) of leafy mounds with flower heads, purple mostly. */
function bed(b: VoxelBuilder, field: HeightField, x0: number, z0: number, x1: number, z1: number, w: number, seed: number, low: boolean, src: SourceTrace | undefined): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.5) return;
  const ux = (x1 - x0) / len;
  const uz = (z1 - z0) / len;
  const ry = Math.atan2(ux, uz);
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  const gm = field.heightAt(mx, mz);
  b.box(mx, gm + 0.05, mz, w, 0.14, len + 0.3, pick(SOIL, mx, mz, 1), 'mapStone', { src, ry, shade: 0.9 });
  const rows = low ? 1 : 2;
  const stepL = low ? 0.55 : 0.36;
  const n = Math.max(1, Math.floor((len + 0.3) / stepL));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    for (let r = 0; r < rows; r++) {
      const off = rows === 1 ? 0 : (r ? 0.18 : -0.18) * w;
      const along = t * (len + 0.3) + (r ? stepL * 0.25 : -stepL * 0.25);
      const px = mx + ux * along + uz * off;
      const pz = mz + uz * along - ux * off;
      const kind = BEDS[Math.floor(hash3(Math.floor(seed * 7 + i / 5), r, 3, 701) * BEDS.length) % BEDS.length];
      const g = field.heightAt(px, pz);
      const h = hash3(px, pz, seed, 702);
      const s = 0.28 + 0.1 * h;
      b.box(px, g + 0.12 + s * 0.4, pz, s, s * 0.8, s, kind[0], 'mapLeaf', { src, ry: h * 1.6, shade: 0.9 + 0.15 * h });
      const fc = kind[1][Math.floor(hash3(px, pz, seed, 703) * kind[1].length) % kind[1].length];
      b.box(px, g + 0.12 + s * 0.85, pz, s * 0.8, 0.13, s * 0.8, fc, 'petal', { src, ry: h * 2.3 + 0.4 });
    }
  }
  field.occupy(mx - len / 2 - w, mz - len / 2 - w, mx + len / 2 + w, mz + len / 2 + w);
}

/** The lily pond (`LAKE_POND`): kerb, water, lilies and lotus, a frangipani over it, lotus candles on the night. */
function pond(o: GardenIn): void {
  const { field, b, kit, glow, low, src } = o;
  const P = LAKE_POND;
  const fx = Math.sin(P.yaw);
  const fz = Math.cos(P.yaw);
  const ax = Math.cos(P.yaw);
  const az = -Math.sin(P.yaw);
  const at = (a: number, c: number): [number, number] => [P.x + fx * a + ax * c, P.z + fz * a + az * c];
  const g = Math.min(field.heightAt(P.x, P.z), ...[0, 1, 2, 3].map((k) => field.heightAt(...at(Math.cos((k * Math.PI) / 2) * P.rx, Math.sin((k * Math.PI) / 2) * P.rz))));
  const wy = g + 0.1;
  // The water: strips across, each as long as the ellipse there (the kerb hides their stepped ends).
  const strips = low ? 5 : 8;
  for (let k = 0; k < strips; k++) {
    const a = -P.rx + ((k + 0.5) * 2 * P.rx) / strips;
    const half = P.rz * Math.sqrt(Math.max(0, 1 - (a / P.rx) ** 2)) + 0.15;
    const [x, z] = at(a, 0);
    kit.box(x, wy - 0.03, z, (2 * P.rx) / strips + 0.02, 0.06, half * 2, POND_WATER, { yaw: P.yaw + Math.PI / 2, glow: 0.05 });
  }
  // The kerb: stones round the rim, turned along it, sandstone and laterite in turn.
  const n = low ? 18 : 26;
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    const t1 = ((k + 1) / n) * Math.PI * 2;
    const [x0, z0] = at(Math.cos(t) * (P.rx + 0.2), Math.sin(t) * (P.rz + 0.2));
    const [x1, z1] = at(Math.cos(t1) * (P.rx + 0.2), Math.sin(t1) * (P.rz + 0.2));
    const L = Math.hypot(x1 - x0, z1 - z0) + 0.08;
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const ry = Math.atan2(-(z1 - z0), x1 - x0);
    b.box(mx, g + 0.12, mz, L, 0.42, 0.45, k % 3 ? pick(POST_STONE, k, 1, 1, 711) : pick(LATERITE, k, 2, 2, 711), 'mapStone', { src, ry, shade: 0.94 + 0.08 * hash3(k, 3, 1, 711) });
  }
  // Lilies and lotus.
  for (let k = 0; k < (low ? 4 : 7); k++) {
    const t = hash3(k, 1, 1, 712) * Math.PI * 2;
    const rr = 0.35 + 0.5 * hash3(k, 2, 1, 712);
    const [x, z] = at(Math.cos(t) * P.rx * rr, Math.sin(t) * P.rz * rr);
    lilyPad(kit, x, wy, z, 2600 + k);
    if (k % 2 === 0) lotus(kit, x + 0.35, wy, z - 0.25, 2600 + k, k % 4 === 2);
  }
  // Lotus candles drifting slowly round (night only), each with its light in the water.
  for (let k = 0; k < (low ? 3 : 5); k++) {
    const t = (k / 5) * Math.PI * 2 + 0.4;
    const [x, z] = at(Math.cos(t) * P.rx * 0.5, Math.sin(t) * P.rz * 0.45);
    const drift = { a: [0, hash3(k, 4, 1, 713), 0.25 + 0.2 * hash3(k, 5, 1, 713)] as [number, number, number], b: [0, 0, perPeriod(0.12 + 0.08 * hash3(k, 6, 1, 713)), 0] as [number, number, number, number] };
    const d = { show: SHOW.night, anim: ANIM.drift, a: drift.a, b: drift.b };
    const petal = k % 3 ? 0xf29ab8 : 0xf6f0e4;
    kit.box(x, wy + 0.04, z, 0.34, 0.08, 0.34, 0x5f9a3a, d);
    kit.box(x, wy + 0.1, z, 0.26, 0.1, 0.26, petal, { ...d, yaw: Math.PI / 4 });
    kit.box(x, wy + 0.19, z, 0.04, 0.1, 0.04, 0xf4ecd8, d);
    kit.box(x, wy + 0.27, z, 0.05, 0.07, 0.05, 0xffc070, { ...d, glow: 2.2 });
    glow.add(x, wy + 0.28, z, 0xffa850, 1.1, { drift, level: 0.5 });
    glow.add(x, wy - 0.1, z, 0xffa040, 1.7, { drift, mode: GLOW_MODE.streak, level: 1.1, width: 0.2 });
  }
  // A frangipani on its side away from the avenue, leaning over the water.
  {
    const [vx, vz] = lakePlazaAt(LAKE_AVENUE.phi, 30);
    const sides = [1, -1].map((s) => at(-P.rx * 0.2, s * (P.rz + 1.6)));
    const [x, z] = sides.sort((p, q) => Math.hypot(q[0] - vx, q[1] - vz) - Math.hypot(p[0] - vx, p[1] - vz))[0];
    if (field.isFree(x, z)) champa(b, kit, glow, field, { x, z, kind: 'champa', bloom: 'white', h: 6, r: 2.8, edge: false }, x, field.heightAt(x, z), z, 7500, low, src);
  }
  field.occupy(P.x - P.rx - 0.8, P.z - P.rx - 0.8, P.x + P.rx + 0.8, P.z + P.rx + 0.8);
}
