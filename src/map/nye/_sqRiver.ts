import type { SourceTrace } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { GLOW_MODE, type Glow } from '../festival/_glow';
import { ANIM, perPeriod, type Kit } from '../festival/_kit';
import type { HeightField } from '../heightfield';
import type { Lamps } from '../landmarks/_prasatKit';
import { leaf } from '../veg/plantKit';
import { BRIDGE, STEPS_Z } from './plan';
import { GOLD, khmerLamp, LAMP_HALO, LATERITE, PAVER, pick, POST_STONE } from './_sqKit';
import { reeds } from './_sqMeadow';
import type { WaterLights } from './_lkReflect';

/**
 * The Kulen stream by the festival square (AWP-35; the owner's reference: "a small wooden bridge with lanterns over the
 * river in front, lotus flowers and lily pads on the river, stone edging"). The west bank's quay and its lamps are the
 * garden's (`_sqGarden.ts`); here:
 *
 * - **the footbridge** where the garden's river path crosses (plan.ts `BRIDGE`): a teak deck arching gently over the
 *   water on two stringers, from a laterite abutment in the quay to one on the east bank; rails of red-lacquered posts
 *   with gilt lotus-bud caps and turned balusters; a Khmer lamp at each corner and a lantern hanging from a tall post
 *   each side over its middle, their warm streaks on the water. Every block level or upright, turned only about y
 *   (the walk map takes a tilted block as its whole bounding box): he walks over it;
 * - **stepping stones** across the stream below the falls (plan.ts `STEPS_Z`): flat river stones from the quay's steps to
 *   the east bank;
 * - **the east bank**: a sandstone kerb along the water's edge, a laterite retaining wall up the land's step behind its
 *   strip, river rocks, reeds and taro (big heart leaves on long stalks, the plant kit's) on the strip;
 * - **the water**: lily pads and pink lotus in patches along both banks (the festival kit: bobbing a little).
 *
 * Into the square's builder and families (stone, bark, leaf, petal), the garden's kit and glow: no draw of its own.
 */

const LACQUER = [0x6e2a1e, 0x642619, 0x7a3022];
const TEAK = [0x7a5634, 0x6e4c2e, 0x856040, 0x725030];
const TEAK_DARK = [0x4a3424, 0x553c28, 0x40301f];
const ROCK = [0x8a8478, 0x7a756a, 0x6e6a60, 0x969082, 0x827a6c];
const WET_ROCK = [0x5e5a52, 0x544f48, 0x66615a];
const TARO = [0x2e5a2a, 0x386a30, 0x2a4e26, 0x427434];
const PAD = [0x4f9a3c, 0x5fae48, 0x468a36, 0x3f7e30];

export interface RiverOut {
  blocks: number;
  /** The bridge's lamps and lanterns (map x, z). */
  lights: [number, number][];
}

/** The stream's banks at one z (1 m rows): west and east water edges, the water's level, the strips' tops. */
interface Bank {
  z: number;
  xw: number;
  xe: number;
  wy: number;
  /** The east strip's top and where the land steps up behind it (x), and how high it goes there. */
  east: number;
  step: number;
  stepTop: number;
}

function banks(field: HeightField, z0: number, z1: number): Bank[] {
  const out: Bank[] = [];
  for (let z = z0; z <= z1; z += 1) {
    let xw = -1;
    for (let x = 424; x <= 452; x += 0.5)
      if (field.waterAt(x, z) !== null) {
        xw = x;
        break;
      }
    if (xw < 0) continue;
    let xe = xw;
    while (xe < xw + 20 && field.waterAt(xe + 0.5, z) !== null) xe += 0.5;
    xe += 0.5;
    const wy = field.waterAt(xw + 0.5, z) ?? 0;
    const east = field.heightAt(xe + 0.6, z);
    let step = xe + 0.6;
    while (step < xe + 18 && Math.abs(field.heightAt(step + 0.5, z) - east) < 0.3) step += 0.5;
    out.push({ z, xw, xe, wy, east, step: step + 0.5, stepTop: field.heightAt(step + 1, z) });
  }
  return out;
}

/**
 * A lamp's reflection on the water from (x, wy, z), its flame `high` m over the water: the venue's water lights when
 * given (`_lkReflect.ts`: long only at a grazing angle, a short soft patch seen from above), else the festival glow's
 * streak.
 */
function reflect(glow: Glow, water: WaterLights | undefined, x: number, wy: number, z: number, high: number, len: number, level: number, width: number): void {
  if (water) water.streak(x, wy, z, high, undefined, { level: level * 0.65, width });
  else glow.add(x, wy, z, 0xffa850, len, { mode: GLOW_MODE.streak, level, width });
}

export function dressRiver(b: VoxelBuilder, kit: Kit, glow: Glow, lamps: Lamps, field: HeightField, low: boolean, src: SourceTrace | undefined, water?: WaterLights): RiverOut {
  const b0 = b.boxes.length;
  const lights: [number, number][] = [];
  const rows = banks(field, -286, -228);
  const atBridge = (z: number, m = 0) => Math.abs(z - BRIDGE.z) < BRIDGE.w / 2 + 0.9 + m;
  const atSteps = (z: number, m = 0) => Math.abs(z - STEPS_Z) < 1.1 + m;

  bridge(b, glow, lamps, field, rows, low, src, lights, water);
  steppingStones(b, field, rows, low, src);

  // ── The east bank: a kerb along the water, the retaining wall up the land's step, rocks, reeds and taro ──
  for (const r of rows) {
    if (atBridge(r.z, 0.6) || r.z > -232 || r.z < -284) continue;
    const kx = r.xe + 0.22;
    if (r.east - r.wy > 0.5 && r.east - r.wy < 2.5) {
      b.box(kx, (r.wy - 0.6 + r.east + 0.14) / 2, r.z, 0.5, r.east + 0.14 - (r.wy - 0.6), 1.02, pick(PAVER, kx, r.z, 1, 161), 'mapStone', { src, shade: 0.92 + 0.1 * hash3(r.z, 1, 2, 161) });
      if (!low || r.z % 2 === 0) b.box(kx + 0.02, r.east + 0.16, r.z, 0.56, 0.06, 1.06, pick(POST_STONE, kx, r.z, 2, 161), 'mapStone', { src, shade: 1.04 });
    }
    // (the land's 2 m step behind a narrow strip: faced with laterite courses, a garden terrace)
    const rise = r.stepTop - r.east;
    if (rise > 1.2 && rise < 2.6 && r.step - r.xe < 6.5 && !atSteps(r.z)) {
      const wx = r.step - 0.25;
      for (let c = 0; c < 3; c++) {
        const y0 = r.east - 0.05 + (c * (rise + 0.15)) / 3;
        const y1 = r.east - 0.05 + ((c + 1) * (rise + 0.15)) / 3;
        b.box(wx - 0.06 * (2 - c), (y0 + y1) / 2, r.z, 0.5, y1 - y0 - 0.03, 1.0, pick(LATERITE, wx, r.z, 3 + c, 161), 'mapStone', { src, shade: 0.88 + 0.1 * hash3(r.z, c, 4, 161) });
      }
      b.box(wx, r.stepTop + 0.06, r.z, 0.62, 0.12, 1.02, pick(POST_STONE, wx, r.z, 7, 161), 'mapStone', { src, shade: 1.03 });
    }
    // Rocks at the kerb's foot, now and then.
    if (hash3(r.z, 3, 5, 161) < (low ? 0.18 : 0.32)) rock(b, kx - 0.55 - 0.3 * hash3(r.z, 4, 5, 161), r.wy - 0.3, r.z + (hash3(r.z, 5, 5, 161) - 0.5) * 0.6, 0.5 + 0.35 * hash3(r.z, 6, 5, 161), r.z * 7, true, src);
    if (atSteps(r.z, 0.4)) continue;
    // On the strip: reeds in clumps, taro, a rock.
    const room = r.step - r.xe - 0.9;
    if (room < 0.6) continue;
    const h = hash3(r.z, 7, 5, 161);
    const px = r.xe + 0.75 + room * 0.5 * hash3(r.z, 8, 5, 161);
    if (h < 0.42) reeds(b, px, r.east, r.z + 0.2, 1600 + r.z, low, src);
    else if (h < 0.62 && (!low || h < 0.52)) taro(b, px, r.east, r.z, 1700 + r.z, low, src);
    else if (h < 0.7) rock(b, px + 0.3, r.east - 0.2, r.z, 0.45 + 0.3 * hash3(r.z, 9, 5, 161), r.z * 11, false, src);
  }
  // Khmer lamps along the east bank, answering the quay's across the water: on the land over the retaining wall, or on
  // the strip where it is wide; one at the stepping stones' end. Their warm streaks on the water.
  for (const lz of [-283, STEPS_Z - 1.5, -269, -262, -255]) {
    const r = rows.reduce((best, q) => (Math.abs(q.z - lz) < Math.abs(best.z - lz) ? q : best), rows[0]);
    if (!r) continue;
    const walled = r.stepTop - r.east > 1.2 && r.stepTop - r.east < 2.6 && r.step - r.xe < 6.5;
    const tries = walled ? [r.step + 0.75, r.step + 1.5, r.step + 2.3] : [r.xe + 1.4, r.xe + 2.2, r.xe + 3];
    const x = tries.find((tx) => {
      const c = field.index(tx, lz);
      return c >= 0 && !field.occupied[c] && field.waterAt(tx, lz) === null && field.trail[c] !== 2;
    });
    if (x === undefined) continue;
    khmerLamp(b, x, field.heightAt(x, lz), lz, 1.2, 110 + Math.round(lz), src, lamps, glow, 2.0);
    field.occupy(x - 0.5, lz - 0.5, x + 0.5, lz + 0.5);
    reflect(glow, water, r.xe - 1.4, r.wy, lz, field.heightAt(x, lz) + 1.9 - r.wy, 8, 2, 0.42);
    lights.push([x, lz]);
  }
  // West bank past the quay's ends: reeds and taro on the strip.
  for (const r of rows) {
    if (r.z < -233) continue;
    const top = field.heightAt(r.xw - 0.6, r.z);
    if (top - r.wy > 1.6) continue;
    const h = hash3(r.z, 1, 6, 161);
    if (h < 0.5) reeds(b, r.xw - 0.7, top, r.z, 1800 + r.z, low, src);
    else if (h < 0.75) taro(b, r.xw - 0.8, top, r.z, 1900 + r.z, low, src);
  }

  // ── Lily pads and lotus in patches along both banks ──
  const patches = low ? 9 : 18;
  for (let p = 0; p < patches; p++) {
    const r = rows[Math.floor(hash3(p, 1, 7, 161) * rows.length)];
    if (!r || atBridge(r.z, 1.2) || atSteps(r.z, 1.2)) continue;
    const east = p % 3 !== 0;
    const cx = east ? r.xe - 0.9 - 0.8 * hash3(p, 2, 7, 161) : r.xw + 1.1 + 0.6 * hash3(p, 2, 7, 161);
    const n = (low ? 3 : 5) + Math.floor(hash3(p, 3, 7, 161) * (low ? 2 : 5));
    for (let i = 0; i < n; i++) {
      const a = hash3(p, i, 8, 161) * Math.PI * 2;
      const d = Math.sqrt(hash3(p, i, 9, 161)) * 1.5;
      const x = cx + Math.cos(a) * d * 0.6;
      const z = r.z + Math.sin(a) * d;
      const wy = field.waterAt(x, z);
      if (wy === null || atBridge(z, 0.4) || atSteps(z, 0.4)) continue;
      lilyPad(kit, x, wy, z, p * 31 + i);
      const k = hash3(p, i, 10, 161);
      if (k > 0.6) lotus(kit, x + 0.3, wy, z - 0.2, p * 31 + i, k > 0.85);
      else if (k > 0.45 && !low) heldLeaf(kit, x - 0.25, wy, z + 0.15, p * 31 + i);
    }
  }
  return { blocks: b.boxes.length - b0, lights };
}

/**
 * The footbridge: abutments, two stringers, teak planks across, rails and balusters, the lamps. Its deck runs along x
 * from `BRIDGE.x0` (on the quay: the garden builds the abutment rows there) to `BRIDGE.x1` (on the east bank).
 */
function bridge(b: VoxelBuilder, glow: Glow, lamps: Lamps, field: HeightField, rows: Bank[], low: boolean, src: SourceTrace | undefined, lights: [number, number][], water?: WaterLights): void {
  const { z: zc, x0, x1, w } = BRIDGE;
  const row = rows.reduce((best, r) => (Math.abs(r.z - zc) < Math.abs(best.z - zc) ? r : best), rows[0]);
  const wy = row?.wy ?? 5;
  const xe = row?.xe ?? 440;
  const ya = field.heightAt(x0 - 1.5, zc) + 0.12;
  const yb = field.heightAt(x1 + 0.6, zc) + 0.1;
  const L = x1 - x0;
  const rise = 0.55;
  /** The deck's top at x. */
  const deck = (x: number) => {
    const u = Math.max(0, Math.min(1, (x - x0) / L));
    return ya + (yb - ya) * u + rise * Math.sin(Math.PI * u);
  };
  const half = w / 2;
  // The east abutment: laterite from the stream bed to under the deck's end, a sandstone cap.
  const ax0 = xe - 0.35;
  const ax1 = x1 + 0.9;
  b.box((ax0 + ax1) / 2, (wy - 1.1 + yb - 0.12) / 2, zc, ax1 - ax0, yb - 0.12 - (wy - 1.1), w + 1.4, pick(LATERITE, ax0, zc, 1, 163), 'mapStone', { src, shade: 0.92 });
  b.box((ax0 + ax1) / 2 + 0.2, yb - 0.08, zc, ax1 - ax0 - 0.4, 0.1, w + 1.5, pick(POST_STONE, ax0, zc, 2, 163), 'mapStone', { src, shade: 1.03 });
  field.occupy(ax0, zc - half - 0.7, ax1, zc + half + 0.7);
  // Planks across, level, each a step up or down the arch.
  const pitch = low ? 0.5 : 0.3;
  const n = Math.round(L / pitch);
  for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.5) * (L / n);
    const h = hash3(i, 1, 3, 163);
    b.box(x, deck(x) - 0.045, zc + (h - 0.5) * 0.06, L / n - 0.025, 0.09, w - 0.08 * hash3(i, 2, 3, 163), pick(TEAK, i, 3, 4, 163), 'mapBark', { src, shade: 0.9 + 0.16 * h });
  }
  // Two stringers under them (level pieces following the arch) and a fascia board each side, dark.
  const pieces = low ? 6 : 12;
  for (let p = 0; p < pieces; p++) {
    const xa = x0 + (p * L) / pieces;
    const xb = x0 + ((p + 1) * L) / pieces;
    const y = Math.min(deck(xa), deck(xb)) - 0.09;
    for (const sz of [-1, 1]) {
      b.box((xa + xb) / 2, y - 0.16, zc + sz * (half - 0.35), xb - xa + 0.02, 0.3, 0.24, pick(TEAK_DARK, p, sz, 5, 163), 'mapBark', { src, shade: 0.8 });
      b.box((xa + xb) / 2, y - 0.1, zc + sz * (half + 0.02), xb - xa + 0.02, 0.22, 0.06, pick(LACQUER, p, sz, 6, 163), 'mapBark', { src, shade: 0.9 });
    }
  }
  // Rails: posts with gilt lotus-bud caps, a top rail and a lower one, turned balusters between (none on low).
  const posts = 9;
  const px = (i: number) => x0 + 0.2 + (i * (L - 0.4)) / (posts - 1);
  const RAIL = 1.0;
  for (const sz of [-1, 1]) {
    const z = zc + sz * (half - 0.06);
    for (let i = 0; i < posts; i++) {
      const x = px(i);
      const y = deck(x);
      const tall = i === (posts - 1) / 2;
      const top = y + (tall ? 2.25 : RAIL + 0.08);
      b.box(x, (y - 0.2 + top) / 2, z, 0.16, top - y + 0.2, 0.16, pick(LACQUER, i, sz, 7, 163), 'mapBark', { src });
      b.box(x, top + 0.07, z, 0.2, 0.06, 0.2, pick(GOLD, i, sz, 8, 163), 'mapStone', { src, shade: 1.05 });
      b.box(x, top + 0.17, z, 0.1, 0.14, 0.1, pick(GOLD, i, sz, 9, 163), 'mapStone', { src, shade: 1.1 });
      if (tall) {
        // A bracket out over the water and a lantern hanging from it: a little tower top over the glowing body.
        const lz = z + sz * 0.55;
        b.box(x, top - 0.12, (z + lz) / 2, 0.08, 0.08, 0.62, pick(LACQUER, i, sz, 10, 163), 'mapBark', { src });
        b.box(x, top - 0.36, lz, 0.02, 0.4, 0.02, 0x2a2420, 'mapStone', { src });
        const ly = top - 0.78;
        b.box(x, ly + 0.27, lz, 0.34, 0.06, 0.34, pick(GOLD, i, sz, 11, 163), 'mapStone', { src });
        b.box(x, ly + 0.36, lz, 0.22, 0.1, 0.22, pick(GOLD, i, sz, 12, 163), 'mapStone', { src, shade: 1.05 });
        b.box(x, ly - 0.24, lz, 0.3, 0.05, 0.3, pick(GOLD, i, sz, 13, 163), 'mapStone', { src });
        for (const [dx, dz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ])
          b.box(x + dx * 0.12, ly, lz + dz * 0.12, 0.04, 0.46, 0.04, pick(GOLD, i, dx + dz, 14, 163), 'mapStone', { src });
        lamps.add([x, ly, lz], 0.3, 1.2);
        glow.add(x, ly, lz, LAMP_HALO, 2.1, { level: 0.95 });
        reflect(glow, water, x, wy, lz + sz * 0.9, ly - wy, 8, 2.4, 0.42);
        lights.push([x, lz]);
      }
    }
    for (let i = 0; i + 1 < posts; i++) {
      const xa = px(i) + 0.08;
      const xb = px(i + 1) - 0.08;
      const xm = (xa + xb) / 2;
      const y = deck(xm);
      b.box(xm, y + RAIL, z, xb - xa, 0.09, 0.11, pick(LACQUER, i, sz, 15, 163), 'mapBark', { src, shade: 1.04 });
      if (low) continue;
      b.box(xm, y + 0.22, z, xb - xa, 0.07, 0.08, pick(LACQUER, i, sz, 16, 163), 'mapBark', { src, shade: 0.94 });
      const k = 4;
      for (let j = 0; j < k; j++) {
        const x = xa + ((j + 0.5) * (xb - xa)) / k;
        const yy = deck(x);
        b.box(x, yy + 0.43, z, 0.06, 0.34, 0.06, pick(TEAK, j, i, 17, 163), 'mapBark', { src });
        b.box(x, yy + 0.6, z, 0.1, 0.08, 0.1, pick(TEAK, j, i, 18, 163), 'mapBark', { src, shade: 1.05 });
        b.box(x, yy + 0.8, z, 0.06, 0.32, 0.06, pick(TEAK, j, i, 19, 163), 'mapBark', { src });
      }
    }
  }
  // A Khmer lamp at each corner (the west pair on the quay, the east pair on the abutment), their streaks on the water.
  for (const [x, y] of [
    [x0 - 0.55, ya],
    [x1 + 0.45, yb],
  ])
    for (const sz of [-1, 1]) {
      const z = zc + sz * (half + 0.48);
      khmerLamp(b, x, y - 0.02, z, 1.05, 90 + Math.round(x) + sz, src, lamps, glow, 2.0);
      lights.push([x, z]);
    }
  reflect(glow, water, (x0 + xe) / 2 - 1.2, wy, zc + half + 1.2, ya + 1.7 - wy, 7, 1.6, 0.4);
}

/** Flat river stones across the stream at `STEPS_Z`, from the quay's lowest step to the east bank. */
function steppingStones(b: VoxelBuilder, field: HeightField, rows: Bank[], low: boolean, src: SourceTrace | undefined): void {
  const r = rows.reduce((best, q) => (Math.abs(q.z - STEPS_Z) < Math.abs(best.z - STEPS_Z) ? q : best), rows[0]);
  if (!r) return;
  const n = Math.max(3, Math.round((r.xe - r.xw - 0.6) / 0.85));
  for (let i = 0; i <= n; i++) {
    const x = r.xw + 0.55 + (i * (r.xe - r.xw - 0.4)) / n;
    const z = STEPS_Z + (i % 2 ? 0.22 : -0.22) + (hash3(i, 1, 1, 165) - 0.5) * 0.15;
    const bed = field.heightAt(x, z);
    const last = i === n;
    const top = last ? r.wy + 0.62 : r.wy + 0.28;
    const s = 0.66 + 0.16 * hash3(i, 2, 1, 165);
    const ry = hash3(i, 3, 1, 165) * 1.2;
    b.box(x, (bed - 0.1 + top - 0.1) / 2, z, s * 0.92, top - 0.1 - bed + 0.1, s * 0.8, pick(WET_ROCK, i, 1, 2, 165), 'mapStone', { src, ry, shade: 0.9 });
    b.box(x, top - 0.08, z, s, 0.16, s * 0.86, pick(ROCK, i, 2, 3, 165), 'mapStone', { src, ry: ry + 0.2, shade: 0.98 + 0.08 * hash3(i, 4, 1, 165) });
    if (!low && i % 2 === 0) b.box(x, top - 0.04, z, s * 0.78, 0.12, s, pick(ROCK, i, 3, 4, 165), 'mapStone', { src, ry: ry + 0.9 });
  }
  field.occupy(r.xw, STEPS_Z - 0.8, r.xe + 0.5, STEPS_Z + 0.8);
}

/** A river rock: a rounded boulder of two blocks crossed and a smaller one; `wet`: darker, half in the water. */
function rock(b: VoxelBuilder, x: number, y: number, z: number, s: number, seed: number, wet: boolean, src: SourceTrace | undefined): void {
  const tones = wet ? WET_ROCK : ROCK;
  const ry = hash3(seed, 1, 1, 167) * Math.PI;
  b.box(x, y + s * 0.3, z, s, s * 0.62, s * 0.78, pick(tones, seed, 2, 2, 167), 'mapStone', { src, ry, shade: 0.94 });
  b.box(x, y + s * 0.36, z, s * 0.76, s * 0.7, s, pick(tones, seed, 3, 2, 167), 'mapStone', { src, ry: ry + 0.5, shade: 1.0 });
  b.box(x + Math.cos(ry) * s * 0.55, y + s * 0.15, z - Math.sin(ry) * s * 0.55, s * 0.5, s * 0.36, s * 0.46, pick(ROCK, seed, 4, 2, 167), 'mapStone', { src, ry: ry + 1.1 });
}

/** Taro by the water: big heart-shaped leaves held out on long stalks (the plant kit's `broad` leaves). */
function taro(b: VoxelBuilder, x: number, g: number, z: number, seed: number, low: boolean, src: SourceTrace | undefined): void {
  const n = low ? 2 : 4;
  const a0 = hash3(seed, 1, 1, 169) * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const az = a0 + (i / n) * Math.PI * 2 + (hash3(seed, i, 2, 169) - 0.5) * 0.6;
    const stalk = 0.55 + 0.4 * hash3(seed, i, 3, 169);
    leaf(b, [x, g + 0.05, z], { len: 0.75 + 0.3 * hash3(seed, i, 4, 169), wid: 0.55, az, el: 0.35, color: TARO[i % TARO.length], shape: 'broad', segs: low ? 1 : 2, rib: low ? false : undefined, bend: 0.7, stalk, src });
  }
}

/** A lily pad on the water (two thin slabs turned 45°: a round leaf), a little bobbing (the kit's drift). */
export function lilyPad(kit: Kit, x: number, wy: number, z: number, i: number): void {
  const d = { anim: ANIM.drift, a: [0, hash3(i, 1, 3, 71), 0.08] as [number, number, number], b: [0, 0, perPeriod(0.05), 0] as [number, number, number, number] };
  const s = 0.7 + 0.4 * hash3(i, 2, 3, 71);
  const c = PAD[i % 3];
  const yaw = hash3(i, 3, 3, 71) * 3;
  kit.box(x, wy + 0.03, z, s, 0.03, s * 0.9, c, { ...d, yaw });
  kit.box(x, wy + 0.035, z, s * 0.9, 0.03, s, c, { ...d, yaw: yaw + Math.PI / 4 });
  // (a second, smaller pad beside it)
  const a = yaw * 2;
  kit.box(x + Math.cos(a) * s * 0.9, wy + 0.03, z + Math.sin(a) * s * 0.9, s * 0.6, 0.03, s * 0.55, c, { ...d, yaw: yaw + 0.5 });
}

/** A pink lotus (outer and inner petals crossed, a gold heart) standing on the water, or a bud on its stalk. */
export function lotus(kit: Kit, x: number, wy: number, z: number, i: number, bud: boolean): void {
  const glow = 0.3;
  kit.box(x, wy + 0.25, z, 0.03, 0.5, 0.03, 0x5a7a3a);
  if (bud) {
    kit.box(x, wy + 0.58, z, 0.14, 0.2, 0.14, 0xf08ab0, { glow, yaw: 0.4 });
    kit.box(x, wy + 0.7, z, 0.07, 0.08, 0.07, 0xf6b0c8, { glow, yaw: 0.4 });
    return;
  }
  const yaw = hash3(i, 5, 3, 72) * 2;
  kit.box(x, wy + 0.52, z, 0.42, 0.1, 0.18, 0xe8729c, { glow, yaw });
  kit.box(x, wy + 0.52, z, 0.18, 0.1, 0.42, 0xe8729c, { glow, yaw });
  kit.box(x, wy + 0.57, z, 0.3, 0.14, 0.3, 0xf08ab0, { glow, yaw: yaw + Math.PI / 4 });
  kit.box(x, wy + 0.62, z, 0.2, 0.12, 0.2, 0xf6b0c8, { glow, yaw });
  kit.box(x, wy + 0.67, z, 0.08, 0.04, 0.08, 0xf0c040, { glow: 0.3 });
}

/** A lotus leaf held up out of the water on its stalk, cupped (two slabs crossed, tilted a little). */
function heldLeaf(kit: Kit, x: number, wy: number, z: number, i: number): void {
  const h = 0.35 + 0.35 * hash3(i, 1, 5, 73);
  const yaw = hash3(i, 2, 5, 73) * 3;
  kit.box(x, wy + h / 2, z, 0.03, h, 0.03, 0x5a7a3a);
  kit.box(x, wy + h, z, 0.62, 0.03, 0.56, PAD[(i + 1) % PAD.length], { yaw, pitch: 0.18 });
  kit.box(x, wy + h + 0.01, z, 0.56, 0.03, 0.62, PAD[(i + 2) % PAD.length], { yaw: yaw + Math.PI / 4, pitch: 0.18 });
}
