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
  b.box(x, g + 0.1, z, 1.0, 0.36, 1.0, pick(LATERITE, x, z, 1, 82), 'mapStone', { src, ry });
  b.box(x, g + 0.36, z, 0.86, 0.16, 0.86, st(2), 'mapStone', { src, ry, shade: 1.03 });
  b.box(x, g + 0.5, z, 0.76, 0.12, 0.76, st(3), 'mapStone', { src, ry });
  const h = 2.0;
  b.box(x, g + 0.56 + h / 2, z, 0.64, h, 0.64, st(4), 'mapStone', { src, ry });
  // A sunk panel on each face (a darker stone a hair inside the shaft's face, framed by it).
  if (!low) {
    b.box(x, g + 0.56 + h * 0.5, z, 0.68, h * 0.78, 0.44, pick(SHADOW_STONE, x, z, 5, 82), 'mapStone', { src, ry, shade: 0.92 });
    b.box(x, g + 0.56 + h * 0.5, z, 0.44, h * 0.78, 0.68, pick(SHADOW_STONE, x, z, 6, 82), 'mapStone', { src, ry, shade: 0.92 });
  }
  // The capital: a lotus cushion, a broad abacus.
  let y = g + 0.56 + h;
  b.box(x, y + 0.06, z, 0.74, 0.12, 0.74, st(7), 'mapStone', { src, ry, shade: 1.04 });
  b.box(x, y + 0.17, z, 0.88, 0.1, 0.88, st(8), 'mapStone', { src, ry, shade: 1.06 });
  b.box(x, y + 0.26, z, 0.7, 0.08, 0.7, st(9), 'mapStone', { src, ry });
  y += 0.3;
  // The bowl: a foot, the bowl flaring, its rim.
  b.box(x, y + 0.06, z, 0.36, 0.12, 0.36, pick(BRONZE, x, z, 10, 82), 'mapStone', { src, ry });
  b.box(x, y + 0.18, z, 0.6, 0.14, 0.6, pick(BRONZE, x, z, 11, 82), 'mapStone', { src, ry, shade: 0.92 });
  b.box(x, y + 0.29, z, 0.76, 0.08, 0.76, pick(BRONZE, x, z, 12, 82), 'mapStone', { src, ry, shade: 1.05 });
  const rim = y + 0.31;
  kitFire(kit, x, rim, z, 1, seed);
  // The banner on the face toward the square, from a gilt bar under the capital.
  const fx = Math.sin(face);
  const fz = Math.cos(face);
  const bar = g + 0.56 + h - 0.06;
  b.box(x + fx * 0.36, bar, z + fz * 0.36, 0.78, 0.07, 0.07, 0xd9a93a, 'mapStone', { src, ry, shade: 1.08 });
  hangingBanner(kit, x + fx * 0.37, bar - 0.04, z + fz * 0.37, face, 0.66, 1.62, low, seed);
  return [x, rim + 0.3, z];
}

const norm = (th: number): number => ((th % 360) + 360) % 360;
