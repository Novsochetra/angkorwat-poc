import { traceSource, type SourceTrace } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { Kit } from '../festival/_kit';
import type { HeightField } from '../heightfield';
import { SQUARE } from './plan';
import { TOP } from './_sqFloor';
import { hangingBanner, khmerLamp, kitFire, LATERITE, pick, POST_STONE } from './_sqKit';

/**
 * The square's edge (AWP-35, the owner's overhead reference): a low carved sandstone balustrade round the plaza
 * (Angkor's turned balusters between a moulded plinth and a rail, as on the terraces' false windows), with Khmer
 * lamps on stone pedestals for newel posts every ≈ 4.6 m all round (`_sqKit.ts` `khmerLamp`: an Angkor tower top
 * over the flame). Open at the gate, before the stage and at the four stalls. Every other newel post (and every
 * post at an opening's side, a gatepost) is a lantern pillar instead (the owner's sheet, "PLAYER GATHERING AREA",
 * and the lake reference's ring wall): a square sandstone pillar ≈ 3 m tall on a laterite foot, a lotus capital, a
 * bronze fire bowl on top with a live fire (the festival kit's `ANIM.flame`: `_sqKit.ts` `kitFire`), and a red
 * banner with the white Angkor Wat hanging on its face toward the square (`hangingBanner`). Nothing crosses the
 * gate → ring → stage way; the crowd keeps 3.2 m off the edge (people/_nyePlan.ts `EDGE`), so no one stands in one.
 *
 * Angles θ round the square from +x (east), z = SQUARE.z + rz·sin θ (+z south: 90° the gate, −90° the stage).
 * Returns the lamps' flames and the fires' middles (world m) for the light pools and halos (`_sqGlow.ts`).
 */

/** How far out round the ellipse the balustrade runs (× its radii: on the laterite border, inside the banners). */
const K = 0.97;
/** The openings (θ degrees, from → to). */
const OPEN: [number, number][] = [
  [79, 101], // the gate's way
  [-140, -40], // before the stage
  [-35, -13], // the east stalls
  [6.5, 28.5],
  [151.5, 173.5], // the west stalls
  [192.8, 214.8],
];
/** Lamp spacing along the rail (m). */
const SPACING = 4.6;

export interface SquareEdge {
  /** The Khmer lamps' flames (world m). */
  lamps: [number, number, number][];
  /** The pillars' fires (world m: the fire's middle). */
  fires: [number, number, number][];
}

export function buildSquareEdge(b: VoxelBuilder, field: HeightField, low: boolean, kit: Kit | null = null): SquareEdge {
  const src = traceSource();
  const flames: [number, number, number][] = [];
  const fires: [number, number, number][] = [];
  const at = (th: number): [number, number] => {
    const a = (th * Math.PI) / 180;
    return [SQUARE.x + Math.cos(a) * SQUARE.rx * K, SQUARE.z + Math.sin(a) * SQUARE.rz * K];
  };
  // The runs between the openings, going round from the stage's east side.
  const cuts = OPEN.map(([a, c]) => [norm(a), norm(c)] as [number, number]).sort((p, q) => p[0] - q[0]);
  const runs: [number, number][] = [];
  for (let i = 0; i < cuts.length; i++) {
    const from = cuts[i][1];
    let to = cuts[(i + 1) % cuts.length][0];
    if (to < from) to += 360;
    runs.push([from, to]);
  }
  let seed = 0;
  for (const [a0, a1] of runs) {
    // Arc length of the run (fine steps), then lamps evenly on it.
    const steps = 64;
    const arc: number[] = [0];
    for (let i = 1; i <= steps; i++) {
      const p = at(a0 + ((a1 - a0) * (i - 1)) / steps);
      const q = at(a0 + ((a1 - a0) * i) / steps);
      arc.push(arc[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1]));
    }
    const len = arc[steps];
    if (len < 2.5) continue;
    const n = Math.max(1, Math.round(len / SPACING));
    const thAt = (s: number): number => {
      let i = 1;
      while (i < steps && arc[i] < s) i++;
      const u = (s - arc[i - 1]) / Math.max(1e-6, arc[i] - arc[i - 1]);
      return a0 + ((a1 - a0) * (i - 1 + u)) / steps;
    };
    const posts: [number, number][] = [];
    for (let i = 0; i <= n; i++) posts.push(at(thAt((i / n) * len)));
    for (const [i, [x, z]] of posts.entries()) {
      const g = field.heightAt(x, z) + TOP;
      // (a pillar at each end, a gatepost, and every other post between; never two side by side)
      if (kit && (i === 0 || i === n || (i % 2 === 0 && i !== n - 1))) {
        fires.push(pillar(b, kit, x, g, z, low, 70 + seed++, src));
        continue;
      }
      // The pedestal: a moulded laterite foot, a sandstone die, a cornice; the lamp on it.
      b.box(x, g + 0.12, z, 0.92, 0.24, 0.92, pick(LATERITE, x, z, 1, 81), 'mapStone', { src });
      b.box(x, g + 0.42, z, 0.74, 0.36, 0.74, pick(POST_STONE, x, z, 2, 81), 'mapStone', { src });
      b.box(x, g + 0.64, z, 0.86, 0.08, 0.86, pick(POST_STONE, x, z, 3, 81), 'mapStone', { src, shade: 1.05 });
      khmerLamp(b, x, g + 0.6, z, 0.7, 50 + seed++, src, null, null);
      flames.push([x, g + 0.6 + 0.36 + 0.7 + 0.325, z]);
    }
    // The balustrade between each two posts: plinth, turned balusters, rail.
    for (let i = 0; i + 1 < posts.length; i++) {
      const [ax, az] = posts[i];
      const [bx, bz] = posts[i + 1];
      const L = Math.hypot(bx - ax, bz - az) - 0.9;
      if (L < 0.4) continue;
      const ry = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const g = field.heightAt(mx, mz) + TOP;
      b.box(mx, g + 0.12, mz, L, 0.24, 0.5, pick(POST_STONE, mx, mz, 4, 81), 'mapStone', { src, ry, shade: 0.94 });
      b.box(mx, g + 0.76, mz, L, 0.1, 0.38, pick(POST_STONE, mx, mz, 5, 81), 'mapStone', { src, ry, shade: 1.04 });
      const every = low ? 0.62 : 0.42;
      const k = Math.max(1, Math.floor(L / every));
      const dx = (bx - ax) / (L + 0.8);
      const dz = (bz - az) / (L + 0.8);
      for (let j = 0; j < k; j++) {
        const s = -L / 2 + ((j + 0.5) * L) / k;
        const x = mx + dx * s;
        const z = mz + dz * s;
        const tone = pick(POST_STONE, x, z, 6, 81);
        const sh = 0.96 + 0.06 * hash3(x, z, 7, 81);
        if (low) b.box(x, g + 0.48, z, 0.16, 0.48, 0.16, tone, 'mapStone', { src, ry, shade: sh });
        else {
          // (a turned baluster: a slim neck, a fat ring, a slim neck)
          b.box(x, g + 0.33, z, 0.12, 0.18, 0.12, tone, 'mapStone', { src, ry, shade: sh });
          b.box(x, g + 0.48, z, 0.19, 0.12, 0.19, tone, 'mapStone', { src, ry, shade: sh * 1.04 });
          b.box(x, g + 0.63, z, 0.12, 0.18, 0.12, tone, 'mapStone', { src, ry, shade: sh });
        }
      }
    }
  }
  return { lamps: flames, fires };
}

const BRONZE = [0x5c4430, 0x523c2a, 0x664c36];
const SHADOW_STONE = [0x8c7c64, 0x857660, 0x92826a];

/**
 * A lantern pillar standing at (x, g, z), turned square to the square's middle: a laterite foot, a moulded base, a
 * sandstone shaft with a sunk panel on each face, a lotus capital, a bronze fire bowl with its fire, and on the face
 * toward the square a banner hanging from a gilt bar under the capital. Returns the fire's middle (world m).
 */
function pillar(b: VoxelBuilder, kit: Kit, x: number, g: number, z: number, low: boolean, seed: number, src: SourceTrace | undefined): [number, number, number] {
  const face = Math.atan2(SQUARE.x - x, SQUARE.z - z);
  // (the pillar's own frame: its faces along and across `face`)
  const ry = face;
  const st = (i: number) => pick(POST_STONE, x, z, i, 82);
  // (chunky, as the owner's sheet's posts: a shaft 0.84 m square on a 1.2 m foot)
  b.box(x, g + 0.1, z, 1.2, 0.4, 1.2, pick(LATERITE, x, z, 1, 82), 'mapStone', { src, ry });
  b.box(x, g + 0.38, z, 1.04, 0.18, 1.04, st(2), 'mapStone', { src, ry, shade: 1.03 });
  b.box(x, g + 0.53, z, 0.94, 0.12, 0.94, st(3), 'mapStone', { src, ry });
  const h = 1.9;
  b.box(x, g + 0.59 + h / 2, z, 0.84, h, 0.84, st(4), 'mapStone', { src, ry });
  // A raised panel on each face (a darker stone, framed by the shaft's edges).
  if (!low) {
    b.box(x, g + 0.59 + h * 0.5, z, 0.88, h * 0.78, 0.58, pick(SHADOW_STONE, x, z, 5, 82), 'mapStone', { src, ry, shade: 0.92 });
    b.box(x, g + 0.59 + h * 0.5, z, 0.58, h * 0.78, 0.88, pick(SHADOW_STONE, x, z, 6, 82), 'mapStone', { src, ry, shade: 0.92 });
  }
  // The capital: a lotus cushion, a broad abacus.
  let y = g + 0.59 + h;
  b.box(x, y + 0.07, z, 0.96, 0.14, 0.96, st(7), 'mapStone', { src, ry, shade: 1.04 });
  b.box(x, y + 0.19, z, 1.1, 0.1, 1.1, st(8), 'mapStone', { src, ry, shade: 1.06 });
  b.box(x, y + 0.28, z, 0.88, 0.08, 0.88, st(9), 'mapStone', { src, ry });
  y += 0.32;
  // The bowl: a foot, the bowl flaring, its rim.
  b.box(x, y + 0.07, z, 0.44, 0.14, 0.44, pick(BRONZE, x, z, 10, 82), 'mapStone', { src, ry });
  b.box(x, y + 0.21, z, 0.74, 0.16, 0.74, pick(BRONZE, x, z, 11, 82), 'mapStone', { src, ry, shade: 0.92 });
  b.box(x, y + 0.33, z, 0.92, 0.08, 0.92, pick(BRONZE, x, z, 12, 82), 'mapStone', { src, ry, shade: 1.05 });
  const rim = y + 0.35;
  kitFire(kit, x, rim, z, 1.2, seed);
  // The banner on the face toward the square, from a gilt bar under the capital.
  const fx = Math.sin(face);
  const fz = Math.cos(face);
  const bar = g + 0.59 + h - 0.06;
  b.box(x + fx * 0.46, bar, z + fz * 0.46, 0.9, 0.07, 0.07, 0xd9a93a, 'mapStone', { src, ry, shade: 1.08 });
  hangingBanner(kit, x + fx * 0.47, bar - 0.04, z + fz * 0.47, face, 0.76, 1.55, low, seed);
  return [x, rim + 0.36, z];
}

/**
 * Where the gathering area's lantern pillars stand (θ degrees round the ring from +x, +z south), 20.6 m out: in the
 * four wide gaps the night's crowd leaves round it (people/_nyePlan.ts `planCrowd`, checked: every spot ≥ 5.7 m and
 * every walk-in route ≥ 4 m away), two flanking the stage's side of the circle, two its gate side.
 */
const GATHER_PILLARS = [-150, -30, 160, 20];
const GATHER_R = 20.6;

/**
 * The gathering area's lantern pillars (the owner's sheet, "PLAYER GATHERING AREA": chunky stone posts whose top is
 * a lantern, warm light through its carved windows, a red banner on the face): a laterite foot, a moulded base, a
 * shaft 0.9 m square, a lotus capital, the lantern — four corner posts round a glowing core seen through a stone
 * lattice on each face (two uprights and a bar) — under a little Angkor tower top with a gilt lotus bud, ≈ 3.3 m in
 * all; the banner on the face toward the ring. Returns the lanterns' cores (world m) for the glowing bodies, halos
 * and pools (`_sqGlow.ts`).
 */
export function gatheringPillars(b: VoxelBuilder, field: HeightField, kit: Kit, low: boolean, ring: { x: number; z: number }): [number, number, number][] {
  const src = traceSource();
  const cores: [number, number, number][] = [];
  for (const [i, th] of GATHER_PILLARS.entries()) {
    const a = (th * Math.PI) / 180;
    const x = ring.x + Math.cos(a) * GATHER_R;
    const z = ring.z + Math.sin(a) * GATHER_R;
    const g = field.heightAt(x, z) + TOP;
    const face = Math.atan2(ring.x - x, ring.z - z);
    const ry = face;
    const st = (k: number) => pick(POST_STONE, x, z, k, 83);
    b.box(x, g + 0.1, z, 1.3, 0.4, 1.3, pick(LATERITE, x, z, 1, 83), 'mapStone', { src, ry });
    b.box(x, g + 0.39, z, 1.12, 0.18, 1.12, st(2), 'mapStone', { src, ry, shade: 1.03 });
    b.box(x, g + 0.54, z, 1.0, 0.12, 1.0, st(3), 'mapStone', { src, ry });
    const h = 1.35;
    const y0 = g + 0.6;
    b.box(x, y0 + h / 2, z, 0.9, h, 0.9, st(4), 'mapStone', { src, ry });
    if (!low) {
      b.box(x, y0 + h * 0.5, z, 0.94, h * 0.74, 0.62, pick(SHADOW_STONE, x, z, 5, 83), 'mapStone', { src, ry, shade: 0.92 });
      b.box(x, y0 + h * 0.5, z, 0.62, h * 0.74, 0.94, pick(SHADOW_STONE, x, z, 6, 83), 'mapStone', { src, ry, shade: 0.92 });
    }
    // The capital.
    let y = y0 + h;
    b.box(x, y + 0.07, z, 1.0, 0.14, 1.0, st(7), 'mapStone', { src, ry, shade: 1.04 });
    b.box(x, y + 0.19, z, 1.12, 0.1, 1.12, st(8), 'mapStone', { src, ry, shade: 1.06 });
    y += 0.24;
    // The lantern: a sill, four corner posts, the lattice on each face, a lintel; the glowing core inside.
    const lh = 0.78;
    b.box(x, y + 0.04, z, 1.02, 0.08, 1.02, st(9), 'mapStone', { src, ry });
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    // (a point in the pillar's own frame: u across its face, w out of it)
    const at = (u: number, w: number): [number, number] => [x + u * c + w * s, z - u * s + w * c];
    for (const [u, w] of [
      [-0.42, -0.42],
      [0.42, -0.42],
      [-0.42, 0.42],
      [0.42, 0.42],
    ]) {
      const [px, pz] = at(u, w);
      b.box(px, y + 0.08 + lh / 2, pz, 0.18, lh, 0.18, st(10), 'mapStone', { src, ry });
    }
    const lattice = pick(SHADOW_STONE, x, z, 11, 83);
    for (const side of [0, 1, 2, 3]) {
      const turn = ry + (side * Math.PI) / 2;
      const cs = Math.cos(turn);
      const sn = Math.sin(turn);
      const on = (u: number): [number, number] => [x + u * cs + 0.4 * sn, z - u * sn + 0.4 * cs];
      for (const u of [-0.12, 0.12]) {
        const [px, pz] = on(u);
        b.box(px, y + 0.08 + lh / 2, pz, 0.06, lh, 0.05, lattice, 'mapStone', { src, ry: turn, shade: 0.9 });
      }
      const [mx, mz] = on(0);
      b.box(mx, y + 0.08 + lh * 0.55, mz, 0.66, 0.06, 0.05, lattice, 'mapStone', { src, ry: turn, shade: 0.9 });
    }
    cores.push([x, y + 0.08 + lh / 2, z]);
    y += 0.08 + lh;
    b.box(x, y + 0.05, z, 1.08, 0.1, 1.08, st(12), 'mapStone', { src, ry, shade: 1.04 });
    y += 0.1;
    // The tower top: three corbelled tiers drawing in, the gilt lotus bud.
    for (const [k, w] of [0.84, 0.62, 0.42].entries()) {
      b.box(x, y + 0.08, z, w, 0.16, w, st(13 + k), 'mapStone', { src, ry, shade: 1 + 0.03 * k });
      y += 0.16;
    }
    b.box(x, y + 0.1, z, 0.22, 0.2, 0.22, 0xd9a93a, 'mapStone', { src, ry, shade: 1.08 });
    b.box(x, y + 0.26, z, 0.1, 0.14, 0.1, 0xe3b44a, 'mapStone', { src, ry, shade: 1.12 });
    // The banner on the face toward the ring, from a gilt bar under the capital.
    const [bx, bz] = at(0, 0.48);
    const bar = y0 + h - 0.06;
    b.box(bx, bar, bz, 0.94, 0.07, 0.07, 0xd9a93a, 'mapStone', { src, ry, shade: 1.08 });
    const [cx, cz] = at(0, 0.49);
    hangingBanner(kit, cx, bar - 0.04, cz, face, 0.8, 1.18, low, 90 + i, 0.02);
    field.occupy(x - 0.7, z - 0.7, x + 0.7, z + 0.7);
  }
  return cores;
}

const norm = (th: number): number => ((th % 360) + 360) % 360;
