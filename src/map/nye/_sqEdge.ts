import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { HeightField } from '../heightfield';
import { SQUARE } from './plan';
import { TOP } from './_sqFloor';
import { khmerLamp, LATERITE, pick, POST_STONE } from './_sqKit';

/**
 * The square's edge (AWP-35, the owner's overhead reference): a low carved sandstone balustrade round the plaza
 * (Angkor's turned balusters between a moulded plinth and a rail, as on the terraces' false windows), with Khmer
 * lamps on stone pedestals for newel posts every ≈ 4.6 m all round (`_sqKit.ts` `khmerLamp`: an Angkor tower top
 * over the flame). Open at the gate, before the stage and at the four stalls; the lamps stand at each opening's
 * sides as gateposts. Nothing crosses the gate → ring → stage way.
 *
 * Angles θ round the square from +x (east), z = SQUARE.z + rz·sin θ (+z south: 90° the gate, −90° the stage).
 * Returns the flames' middles (world m) for the light pools and halos (`_sqGlow.ts`).
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

export function buildSquareEdge(b: VoxelBuilder, field: HeightField, low: boolean): [number, number, number][] {
  const src = traceSource();
  const flames: [number, number, number][] = [];
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
    for (const [x, z] of posts) {
      const g = field.heightAt(x, z) + TOP;
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
      const L = Math.hypot(bx - ax, bz - az) - 0.8;
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
  return flames;
}

const norm = (th: number): number => ((th % 360) + 360) % 360;
