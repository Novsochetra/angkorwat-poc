import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { ANIM, perPeriod, type Kit } from '../festival/_kit';
import type { HeightField } from '../heightfield';
import { FLAG_WHITE, flagCell } from '../roam/_flag';
import { GATE, SQUARE, STAGE } from './plan';
import type { BuiltTree } from './_sqGarden';
import { GOLD, hangingBanner, pick } from './_sqKit';
import type { StringSpan } from './_sqLifeSway';

/**
 * The square's dressing (AWP-35): red banners with the white Angkor Wat on tall poles round its edge (the cloth
 * in the festival kit, waving in its shader: ripples running out from the pole and down the cloth, the light moving
 * over them), warm string lights sagging from pole to the flowering trees round the sides (laid out here, drawn
 * swaying in the breeze by `_sqLifeSway.ts`; the trees, flower beds and water are the garden's, `_sqGarden.ts`),
 * lotus pots by the processional way. Nothing stands between the gate and the stage.
 *
 * Angles round the square: θ from +x (east), z = SQUARE.z + rz·sin θ (+z south: θ 90° is the gate, −90° the stage).
 */

/** Banners on the square's edge (θ degrees) and the two flanking the gate's passage outside (map x, z of the pole; the side). */
const BANNER_THETA = [0, 180, -42, 222, 42, 138];
const GATE_BANNERS: [number, number, number][] = [
  [GATE.x - 6.3, GATE.z + 3.5, -1],
  [GATE.x + 6.3, GATE.z + 3.5, 1],
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
/** Banners wave at about 2.2 rad/s (a whole number of turns in the kit's period), the ripple running down the cloth `DOWN` rad a metre. */
const WAVE = perPeriod(2.2);
const DOWN = 0.8;
/** How far the cloth swings out (m a metre from the pole). */
const SWING = 0.15;

const ell = (theta: number, k: number): [number, number] => {
  const a = (theta * Math.PI) / 180;
  return [SQUARE.x + Math.cos(a) * SQUARE.rx * k, SQUARE.z + Math.sin(a) * SQUARE.rz * k];
};

export interface DecorOut {
  /** Where the trees stand (map x, z, crown radius). */
  trees: [number, number, number][];
  /** The string lights round the sides (drawn, swaying, by the square's life: `_sqLife.ts`). */
  strings: StringSpan[];
}

export function dressSquare(b: VoxelBuilder, kit: Kit, field: HeightField, low: boolean, garden: readonly BuiltTree[] = []): DecorOut {
  const src = traceSource();
  /** String-light anchors: map point, θ (for the order round the square), its side (east +1, west −1). */
  const anchors: { x: number; y: number; z: number; th: number }[] = [];
  const strings: StringSpan[] = [];

  // ── Banners on their poles ──
  const pole = (x: number, z: number, dir: number, seed: number, h = 7.2) => {
    const g = field.heightAt(x, z);
    b.box(x, g + 0.2, z, 0.5, 0.4, 0.5, pick([0x9c6d50, 0x916349], x, z, 1), 'mapStone', { src });
    b.box(x, g + h / 2, z, 0.16, h, 0.16, pick(POLE, x, z, 2), 'mapBark', { src });
    b.box(x, g + h + 0.06, z, 0.26, 0.12, 0.26, pick(GOLD, x, z, 3), 'mapStone', { src });
    b.box(x, g + h + 0.22, z, 0.12, 0.22, 0.12, pick(GOLD, x, z, 4), 'mapStone', { src, shade: 1.08 });
    banner(kit, x, g + h - 0.35, z, dir, 1.3, 3.6, seed, low ? 6 : 3);
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
  // The gate's two: a lacquered pole before each wing, a gilt arm in toward the passage, a long banner hanging from it
  // facing the village (the owner's sheet, "ENTRANCE GATE"), between the braziers and the wings' ends.
  for (const [i, [x, z, sd]] of GATE_BANNERS.entries()) {
    const g = field.heightAt(x, z);
    const h = 7.4;
    b.box(x, g + 0.2, z, 0.56, 0.4, 0.56, pick([0x9c6d50, 0x916349], x, z, 1), 'mapStone', { src });
    b.box(x, g + h / 2, z, 0.18, h, 0.18, pick(POLE, x, z, 2), 'mapBark', { src });
    b.box(x, g + h + 0.06, z, 0.28, 0.12, 0.28, pick(GOLD, x, z, 3), 'mapStone', { src });
    b.box(x, g + h + 0.24, z, 0.13, 0.24, 0.13, pick(GOLD, x, z, 4), 'mapStone', { src, shade: 1.08 });
    const arm = g + h - 0.55;
    b.box(x - sd * 0.85, arm, z, 1.7, 0.09, 0.09, pick(GOLD, x, z, 5), 'mapStone', { src, shade: 1.02 });
    hangingBanner(kit, x - sd * 0.95, arm - 0.05, z + 0.08, 0, 1.25, 4.4, low, 30 + i, 0.05);
    field.occupy(x - 0.4, z - 0.4, x + 0.4, z + 0.4);
  }

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
    stringLights(strings, p, q, 0.9, every);
  }
  // Two strings from the square's south corners up to the gate's top corners (beside the way, never across it).
  {
    const [wx, wz] = ell(124, 1.0);
    const [ex, ez] = ell(56, 1.0);
    const g = field.heightAt(GATE.x, GATE.z - 6);
    stringLights(strings, { x: wx, y: g + 5.6, z: wz }, { x: GATE.x - 5.6, y: g + 6.4, z: GATE.z - 1.6 }, 0.7, every);
    stringLights(strings, { x: ex, y: g + 5.6, z: ez }, { x: GATE.x + 5.6, y: g + 6.4, z: GATE.z - 1.6 }, 0.7, every);
  }

  // ── Lotus pots ──
  for (const [i, [x, z]] of POTS.entries()) lotusPot(b, x, field.heightAt(x, z), z, i, src);
  return { trees, strings };
}

const norm = (th: number) => ((th % 360) + 450) % 360;
const side = (th: number) => (Math.cos((th * Math.PI) / 180) >= 0 ? 1 : -1);

/**
 * A banner: the cloth's edge on the pole at (x, y, z) (its middle height), `w` m out toward `dir`, `h` m tall: the
 * red of the flag's band, a gilt band top and bottom and a gilt fringe, and Angkor Wat in white as on the flag of
 * Cambodia (three towers: roam/_flag.ts), drawn in cells and laid as runs down each column of the cloth, none longer
 * than `run` cells: the ripple running down the cloth bends it at their corners (3: 196 boxes a banner, 6 on the low
 * level: 148; 120 in runs of any length).
 */
function banner(kit: Kit, x: number, y: number, z: number, dir: number, w: number, h: number, seed: number, run: number): void {
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
      while (r1 < last && r1 - r0 < run && colorAt(col, r1) === color) r1++;
      const top = y + h / 2 - r0 * dv;
      const hh = (r1 - r0) * dv;
      const white = color === 0xf4f2ec;
      kit.box(cx, top - hh / 2, cz, du + 0.002, hh + 0.002, white ? 0.05 : 0.03, color, { yaw, anim: ANIM.wave, a: [SWING, u0, WAVE], b: [phase, DOWN, r0 * dv, 0] });
      r0 = r1;
    }
  }
}

/**
 * A string of warm bulbs from p to q, sagging `sag` m, a bulb every `every` m: its wire and bulbs swaying
 * (`_sqLifeSway.ts`, kept in `strings`), each bulb a small bright point at any distance (as `_sqGlow.ts` `clampBulbs`:
 * no halo of its own, the bloom's is enough; a world-sized halo swelled into a disc by the camera).
 */
function stringLights(strings: StringSpan[], p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }, sag: number, every: number): void {
  if (Math.hypot(q.x - p.x, q.z - p.z) < 1) return;
  strings.push({ p, q, sag, every });
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
