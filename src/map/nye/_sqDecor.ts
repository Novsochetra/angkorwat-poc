import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { ANIM, perPeriod, type Kit } from '../festival/_kit';
import type { Glow } from '../festival/_glow';
import type { HeightField } from '../heightfield';
import type { Lamps } from '../landmarks/_prasatKit';
import { FLAG_WHITE, flagCell } from '../roam/_flag';
import { GATE, SQUARE, STAGE } from './plan';
import type { BuiltTree } from './_sqGarden';
import { GOLD, pick } from './_sqKit';

/**
 * The square's dressing (AWP-35): red banners with the white Angkor Wat on tall poles round its edge (the cloth
 * in the festival kit, waving in its shader), warm string lights sagging from pole to the flowering trees round
 * the sides (the trees, flower beds and water are the garden's, `_sqGarden.ts`), lotus pots by the processional way. Nothing stands between the gate and the stage.
 *
 * Angles round the square: θ from +x (east), z = SQUARE.z + rz·sin θ (+z south: θ 90° is the gate, −90° the stage).
 */

/** Banners on the square's edge (θ degrees) and the two flanking the gate outside (map x, z). */
const BANNER_THETA = [0, 180, -42, 222, 42, 138];
const GATE_BANNERS: [number, number, number][] = [
  [GATE.x - 8.6, GATE.z + 3.4, -Math.PI / 2],
  [GATE.x + 8.6, GATE.z + 3.4, Math.PI / 2],
];
/** Lotus pots (map x, z): by the gate inside, along the way, at the stage's stairs. */
const POTS: [number, number][] = [
  [GATE.x - 4.4, GATE.z - 4.6],
  [GATE.x + 4.4, GATE.z - 4.6],
  [GATE.x - 3.8, GATE.z - 10.5],
  [GATE.x + 3.8, GATE.z - 10.5],
  [STAGE.x - 10, STAGE.stairTo + 2.2],
  [STAGE.x + 10, STAGE.stairTo + 2.2],
];

/** The banner's red, its gilt trim, the pole's lacquer. */
const BANNER_RED = 0xc8102e;
const TRIM = 0xe2b04a;
const POLE = [0x5a2a20, 0x642f24, 0x52261c];
const WIRE = 0x2a2420;
/** Flags wave at about 2 rad/s (a whole number of turns in the kit's period). */
const WAVE = perPeriod(2.0);

const ell = (theta: number, k: number): [number, number] => {
  const a = (theta * Math.PI) / 180;
  return [SQUARE.x + Math.cos(a) * SQUARE.rx * k, SQUARE.z + Math.sin(a) * SQUARE.rz * k];
};

export interface DecorOut {
  /** Where the trees stand (map x, z, crown radius). */
  trees: [number, number, number][];
}

export function dressSquare(b: VoxelBuilder, kit: Kit, field: HeightField, bulbs: Lamps, glow: Glow | null, low: boolean, garden: readonly BuiltTree[] = []): DecorOut {
  const src = traceSource();
  /** String-light anchors: map point, θ (for the order round the square), its side (east +1, west −1). */
  const anchors: { x: number; y: number; z: number; th: number }[] = [];

  // ── Banners on their poles ──
  const pole = (x: number, z: number, dir: number, seed: number, h = 7.2) => {
    const g = field.heightAt(x, z);
    b.box(x, g + 0.2, z, 0.5, 0.4, 0.5, pick([0x9c6d50, 0x916349], x, z, 1), 'mapStone', { src });
    b.box(x, g + h / 2, z, 0.16, h, 0.16, pick(POLE, x, z, 2), 'mapBark', { src });
    b.box(x, g + h + 0.06, z, 0.26, 0.12, 0.26, pick(GOLD, x, z, 3), 'mapStone', { src });
    b.box(x, g + h + 0.22, z, 0.12, 0.22, 0.12, pick(GOLD, x, z, 4), 'mapStone', { src, shade: 1.08 });
    banner(kit, x, g + h - 0.35, z, dir, 1.3, 3.6, seed);
    return g + h;
  };
  for (const [i, th] of BANNER_THETA.entries()) {
    const [x, z] = ell(th, 1.02);
    // (the cloth flies along the edge, round the square: seen across it from the crowd)
    const a = (th * Math.PI) / 180;
    const tx = -Math.sin(a) * SQUARE.rx;
    const tz = Math.cos(a) * SQUARE.rz;
    const dir = Math.atan2(tx, tz) + (Math.sin(a) > 0 ? Math.PI : 0);
    const top = pole(x, z, dir, 10 + i);
    anchors.push({ x, y: top - 0.9, z, th });
  }
  for (const [i, [x, z, dir]] of GATE_BANNERS.entries()) pole(x, z, dir, 30 + i, 8);

  // ── The flowering trees (the garden's: _sqGarden.ts `NYE_TREES`, built before this) ──
  const trees: [number, number, number][] = [];
  for (const t of garden) {
    trees.push([t.x, t.z, t.r]);
    if (!t.edge) continue;
    const th = (Math.atan2((t.z - SQUARE.z) / SQUARE.rz, (t.x - SQUARE.x) / SQUARE.rx) * 180) / Math.PI;
    // (the lights go into the crown's underside on the square's side)
    const dx = SQUARE.x - t.x;
    const dz = SQUARE.z - t.z;
    const d = Math.hypot(dx, dz);
    anchors.push({ x: t.x + (dx / d) * 1.6, y: t.low - 0.2, z: t.z + (dz / d) * 1.6, th });
  }

  // ── String lights from anchor to anchor round each side (none across the gate or before the stage) ──
  anchors.sort((p, q) => norm(p.th) - norm(q.th));
  const every = low ? 1.3 : 0.65;
  for (let i = 0; i + 1 < anchors.length; i++) {
    const p = anchors[i];
    const q = anchors[i + 1];
    // (east side: −90° < θ < 90°; west: 90° < θ < 270°: never across the gate's or the stage's line)
    if (side(p.th) !== side(q.th)) continue;
    stringLights(kit, bulbs, glow, p, q, 0.9, every, low);
  }
  // Two strings from the square's south corners up to the gate's top corners (beside the way, never across it).
  {
    const [wx, wz] = ell(124, 1.0);
    const [ex, ez] = ell(56, 1.0);
    const g = field.heightAt(GATE.x, GATE.z - 6);
    stringLights(kit, bulbs, glow, { x: wx, y: g + 5.6, z: wz }, { x: GATE.x - 5.6, y: g + 6.4, z: GATE.z - 1.6 }, 0.7, every, low);
    stringLights(kit, bulbs, glow, { x: ex, y: g + 5.6, z: ez }, { x: GATE.x + 5.6, y: g + 6.4, z: GATE.z - 1.6 }, 0.7, every, low);
  }

  // ── Lotus pots ──
  for (const [i, [x, z]] of POTS.entries()) lotusPot(b, x, field.heightAt(x, z), z, i, src);
  return { trees };
}

const norm = (th: number) => ((th % 360) + 450) % 360;
const side = (th: number) => (Math.cos((th * Math.PI) / 180) >= 0 ? 1 : -1);

/**
 * A banner: the cloth's edge on the pole at (x, y, z) (its middle height), `w` m out toward `dir`, `h` m tall: the
 * red of the flag's band, a gilt band top and bottom and a gilt fringe, and Angkor Wat in white as on the flag of
 * Cambodia (three towers: roam/_flag.ts), drawn in cells and laid as runs down each column of the cloth.
 */
function banner(kit: Kit, x: number, y: number, z: number, dir: number, w: number, h: number, seed: number): void {
  const yaw = dir - Math.PI / 2;
  const s = Math.sin(dir);
  const c = Math.cos(dir);
  const phase = hash3(x, z, seed, 5) * 6.28;
  const cols = 12;
  const rows = 34;
  const du = w / cols;
  const dv = h / rows;
  // Where the temple sits (cloth u 0‥1 across, v 0‥1 down): its box in the flag is u 0.294‥0.706, v 0.29‥0.708.
  const T = { u0: 0.08, u1: 0.92, v0: 0.26, v1: 0.26 + (0.84 * w * 0.418) / (0.412 * 25 / 16) / h };
  const colorAt = (col: number, row: number): number => {
    if (row <= 1 || row >= rows - 3) return TRIM;
    if (row === 3 || row === rows - 5) return TRIM;
    const u = (col + 0.5) / cols;
    const v0 = row / rows;
    const v1 = (row + 1) / rows;
    if (u > T.u0 && u < T.u1 && v1 > T.v0 && v0 < T.v1) {
      const fu = 0.294 + ((col / cols - T.u0) / (T.u1 - T.u0)) * 0.412;
      const fu1 = 0.294 + (((col + 1) / cols - T.u0) / (T.u1 - T.u0)) * 0.412;
      const fv0 = 0.29 + ((v0 - T.v0) / (T.v1 - T.v0)) * 0.418;
      const fv1 = 0.29 + ((v1 - T.v0) / (T.v1 - T.v0)) * 0.418;
      if (flagCell(fu, Math.max(0.25, fv0), fu1, Math.min(0.75, fv1)) === FLAG_WHITE) return 0xf4f2ec;
    }
    // (a gilt lotus line under the temple)
    if (Math.abs(v0 - (T.v1 + 0.05)) < 0.5 / rows && col > 1 && col < cols - 2) return TRIM;
    return BANNER_RED;
  };
  for (let col = 0; col < cols; col++) {
    const u0 = col * du;
    const cx = x + s * (u0 + du / 2);
    const cz = z + c * (u0 + du / 2);
    let r0 = 0;
    // The fringe: every other column a little longer.
    const last = col % 2 ? rows : rows - 1;
    while (r0 < last) {
      const color = colorAt(col, r0);
      let r1 = r0 + 1;
      while (r1 < last && colorAt(col, r1) === color) r1++;
      const top = y + h / 2 - r0 * dv;
      const hh = (r1 - r0) * dv;
      const white = color === 0xf4f2ec;
      kit.box(cx, top - hh / 2, cz, du + 0.002, hh + 0.002, white ? 0.05 : 0.03, color, { yaw, anim: ANIM.wave, a: [0.07, u0, WAVE], b: [phase, 0, 0, 0] });
      r0 = r1;
    }
  }
}

/**
 * A string of warm bulbs from p to q, sagging `sag` m: the wire in short straight pieces (the kit), a bulb every
 * `every` m (a glowing box, and a small halo when not on the low level).
 */
function stringLights(kit: Kit, bulbs: Lamps, glow: Glow | null, p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }, sag: number, every: number, low: boolean): void {
  const len = Math.hypot(q.x - p.x, q.z - p.z);
  if (len < 1) return;
  const yaw = Math.atan2(q.x - p.x, q.z - p.z) - Math.PI / 2;
  const yAt = (u: number) => p.y + (q.y - p.y) * u - sag * 4 * u * (1 - u);
  const pieces = Math.max(3, Math.round(len / 1.6));
  for (let i = 0; i < pieces; i++) {
    const u0 = i / pieces;
    const u1 = (i + 1) / pieces;
    const x0 = p.x + (q.x - p.x) * u0;
    const z0 = p.z + (q.z - p.z) * u0;
    const x1 = p.x + (q.x - p.x) * u1;
    const z1 = p.z + (q.z - p.z) * u1;
    const y0 = yAt(u0);
    const y1 = yAt(u1);
    kit.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, y1 - y0, z1 - z0), 0.025, 0.025, WIRE, { yaw, roll: Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0)) });
  }
  const n = Math.max(2, Math.round(len / every));
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const x = p.x + (q.x - p.x) * u;
    const z = p.z + (q.z - p.z) * u;
    const y = yAt(u) - 0.09;
    bulbs.add([x, y, z], 0.11, 0.8 + 0.4 * hash3(x, z, i, 3));
    if (!low && i % 2 === 0) glow?.add(x, y, z, 0xffc070, 0.9, { level: 0.45 });
  }
}

/** A glazed jar of water with lotus: its leaves on the water and held up, a pink flower open and a bud. */
function lotusPot(b: VoxelBuilder, x: number, y: number, z: number, i: number, src: ReturnType<typeof traceSource>): void {
  const jar = [0x5a3b26, 0x4e3322, 0x66442c];
  const c = (k: number) => jar[Math.floor(hash3(x, z, k, 61) * 3)];
  b.box(x, y + 0.06, z, 0.7, 0.12, 0.7, 0x8a7a64, 'mapStone', { src });
  b.box(x, y + 0.42, z, 0.86, 0.6, 0.86, c(1), 'mapStone', { src });
  b.box(x, y + 0.42, z, 0.8, 0.6, 0.8, c(2), 'mapStone', { src, ry: Math.PI / 4 });
  b.box(x, y + 0.76, z, 0.76, 0.08, 0.76, c(3), 'mapStone', { src, shade: 1.06 });
  b.box(x, y + 0.77, z, 0.62, 0.06, 0.62, 0x26323a, 'mapStone', { src, shade: 0.9 });
  const leaf = [0x4f8a34, 0x5a9a3a, 0x467d2c];
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + i;
    b.box(x + Math.cos(a) * 0.2, y + 0.82, z + Math.sin(a) * 0.2, 0.32, 0.03, 0.32, leaf[k], 'mapLeaf', { src, ry: a });
  }
  // A leaf held up on its stem, the flower open (pink petals round a gold heart), a bud.
  b.box(x - 0.12, y + 1.05, z + 0.1, 0.03, 0.5, 0.03, 0x5a7a3a, 'mapLeaf', { src });
  b.box(x - 0.12, y + 1.3, z + 0.1, 0.36, 0.03, 0.36, leaf[1], 'mapLeaf', { src, ry: 0.5 });
  b.box(x + 0.1, y + 1.0, z - 0.06, 0.03, 0.42, 0.03, 0x5a7a3a, 'mapLeaf', { src });
  b.box(x + 0.1, y + 1.24, z - 0.06, 0.26, 0.12, 0.26, 0xf08ab0, 'petal', { src });
  b.box(x + 0.1, y + 1.27, z - 0.06, 0.26, 0.1, 0.26, 0xe8729c, 'petal', { src, ry: Math.PI / 4 });
  b.box(x + 0.1, y + 1.31, z - 0.06, 0.09, 0.05, 0.09, 0xf0c040, 'petal', { src });
  b.box(x + 0.02, y + 1.12, z + 0.16, 0.03, 0.62, 0.03, 0x5a7a3a, 'mapLeaf', { src });
  b.box(x + 0.02, y + 1.47, z + 0.16, 0.12, 0.16, 0.12, 0xf6b0c8, 'petal', { src });
}
