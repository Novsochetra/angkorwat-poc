import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { SourceTrace } from '../../feedback/sourceTrace';
import type { HeightField, PathSample } from '../heightfield';
import type { JungleSite } from '../layout';
import { BAMBOO, FLAGSTONE, pickTone, PLANK, POST, ROPE, Site } from './_campKit';

/**
 * Wooden foot bridges where a jungle trail crosses a stream (the `bridge`
 * sites): straight from bank to bank along the trail, a gentle arch of
 * planks across two log stringers, posts down to the stream bed under a
 * long one, bamboo rails on posts lashed with rope and a rope rail below
 * them, flat stones at both ends. Solid: the walk map takes the deck and
 * the rails (he walks over, the rails keep him on it); the stream runs under.
 *
 * The span comes from the trail's own samples (`field.trails`: `wet` over
 * water): the wet run nearest the site, stretched out to the first sample
 * each side on the bank top, plus a step onto it.
 */

/** Deck width (m) and its thickness; rails' height over the deck. */
const WIDTH = 2.6;
const PLANK_T = 0.08;
const RAIL = 1.15;
/** Plank pitch along the deck (m). */
const PITCH = 0.3;

export interface BridgeSpan {
  /** Ends on the banks (m, on the ground). */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Water under it (m). */
  level: number;
}

/** The span a bridge site needs, or null when no wet trail passes near it. */
export function bridgeSpan(field: HeightField, site: JungleSite): BridgeSpan | null {
  let best: { samples: PathSample[]; i0: number; i1: number; d: number } | null = null;
  for (const t of field.trails) {
    const s = t.samples;
    for (let i = 0; i < s.length; i++) {
      if (!s[i].wet) continue;
      let j = i;
      while (j + 1 < s.length && s[j + 1].wet) j++;
      const mx = (s[i].x + s[j].x) / 2;
      const mz = (s[i].z + s[j].z) / 2;
      const d = Math.hypot(mx - site.x, mz - site.z);
      if (d < site.r + 4 && (!best || d < best.d)) best = { samples: s, i0: i, i1: j, d };
      i = j;
    }
  }
  if (!best) return null;
  const s = best.samples;
  const level = Math.max(...s.slice(best.i0, best.i1 + 1).map((p) => p.y));
  // Out to the bank tops (dry, well over the water), and one metre on.
  const bank = (p: PathSample) => !p.wet && field.heightAt(p.x, p.z) >= level + 0.6;
  let a = best.i0;
  while (a > 0 && !bank(s[a])) a--;
  let b = best.i1;
  while (b < s.length - 1 && !bank(s[b])) b++;
  a = Math.max(0, a - 1);
  b = Math.min(s.length - 1, b + 1);
  return { ax: s[a].x, az: s[a].z, bx: s[b].x, bz: s[b].z, level };
}

export function buildBridge(b: VoxelBuilder, field: HeightField, span: BridgeSpan, seed: number, src: SourceTrace | undefined): void {
  const dx = span.bx - span.ax;
  const dz = span.bz - span.az;
  const L = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const ga = field.heightAt(span.ax, span.az);
  const gb = field.heightAt(span.bx, span.bz);
  // Site frame: the middle of the span at the water, +z from end a to end b.
  const s = new Site(b, field, (span.ax + span.bx) / 2, span.level, (span.az + span.bz) / 2, yaw, src, seed);
  const tone = (list: readonly number[], i: number, j: number, k: number) => pickTone(list, i, j, k, seed);
  const half = L / 2;
  const arch = Math.min(0.55, 0.05 * L);
  /** Top of the deck at lz (from the water). */
  const deck = (lz: number) => {
    const u = (lz + half) / L;
    return ga + (gb - ga) * u - span.level + 0.1 + arch * Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
  };
  // (every block of the bridge is level or upright, turned only about y: the walk map takes a tilted
  // block as its whole bounding box, which on a bridge running across the map's axes would roof it over)

  // Planks across, level, each a step up or down the arch; each a little different, a few worn paler.
  const n = Math.round(L / PITCH);
  for (let i = 0; i < n; i++) {
    const z = -half + (i + 0.5) * (L / n);
    const worn = hash3(i, 3, 1, seed) < 0.15;
    s.box((hash3(i, 1, 2, seed) - 0.5) * 0.08, deck(z) - PLANK_T / 2, z, WIDTH - 0.1 * hash3(i, 2, 2, seed), PLANK_T, L / n - 0.03, worn ? 0xc09a64 : tone(PLANK, i, 4, 5), 'wood', {
      shade: 0.92 + 0.14 * hash3(i, 5, 5, seed),
    });
  }
  // Boards under the planks, full width in short level lengths, overlapping: the walk map's columns
  // are 0.5 m, wider than a plank, so a column between two planks still finds the deck.
  const boards = Math.max(4, Math.round(L / 0.6));
  for (let p = 0; p < boards; p++) {
    const z0 = -half + (p * L) / boards;
    const z1 = -half + ((p + 1) * L) / boards;
    const y = Math.min(deck(z0), deck(z1)) - PLANK_T - 0.03;
    s.box(0, y, (z0 + z1) / 2, WIDTH - 0.2, 0.06, z1 - z0 + 0.08, tone(POST, p, 2, 16), 'wood', { shade: 0.7 });
  }
  // Two stringers under the planks, in short level pieces following the arch.
  const pieces = Math.max(4, Math.round(L / 0.8));
  for (const sx of [1, -1])
    for (let p = 0; p < pieces; p++) {
      const z0 = -half + (p * L) / pieces - (p === 0 ? 0.2 : 0);
      const z1 = -half + ((p + 1) * L) / pieces + (p === pieces - 1 ? 0.2 : 0);
      const y = Math.min(deck(z0), deck(z1)) - PLANK_T - 0.14;
      s.beam([sx * 0.8, y, z0], [sx * 0.8, y, z1], 0.26, 0.26, tone(POST, sx, p, 6), 'mapBark');
    }
  // Posts down to the stream bed under a long span, with a cross beam.
  if (L > 7.5)
    for (const lz of [-L / 5, L / 5]) {
      const bed = s.ground(0, lz);
      const top = deck(lz) - PLANK_T - 0.25;
      for (const sx of [1, -1]) s.box(sx * 0.85, (bed - 0.3 + top) / 2, lz, 0.22, top - bed + 0.3, 0.22, tone(POST, sx, lz, 7), 'mapBark');
      s.box(0, top - 0.05, lz, 2.1, 0.18, 0.18, tone(POST, 3, lz, 8), 'mapBark');
    }

  // Rails: bamboo posts lashed with rope, a bamboo top rail and a sagging rope below it.
  const posts = Math.max(3, Math.round(L / 1.7) + 1);
  const at = (i: number) => -half + 0.25 + (i * (L - 0.5)) / (posts - 1);
  for (const sx of [1, -1]) {
    const x = sx * (WIDTH / 2 - 0.02);
    for (let i = 0; i < posts; i++) {
      const z = at(i);
      const y0 = deck(z) - PLANK_T - 0.3;
      s.box(x, (y0 + deck(z) + RAIL + 0.08) / 2, z, 0.1, deck(z) + RAIL + 0.08 - y0, 0.1, tone(BAMBOO, sx, i, 9), 'wood');
      // (lashing at the top rail)
      s.box(x, deck(z) + RAIL - 0.04, z, 0.15, 0.1, 0.15, tone(ROPE, sx, i, 10), 'wood');
    }
    for (let i = 0; i + 1 < posts; i++) {
      const z0 = at(i);
      const z1 = at(i + 1);
      // (level lengths: the bamboo along the arch, the rope sagging between the posts)
      const k = 4;
      for (let j = 0; j < k; j++) {
        const za = z0 + ((z1 - z0) * j) / k;
        const zb = z0 + ((z1 - z0) * (j + 1)) / k;
        const zm = (za + zb) / 2;
        const u = (j + 0.5) / k;
        s.beam([x, deck(zm) + RAIL, za], [x, deck(zm) + RAIL, zb + 0.01], 0.08, 0.08, tone(BAMBOO, sx, i + 20, 11), 'wood');
        const ry = deck(zm) + RAIL * 0.52 - 0.1 * 4 * u * (1 - u);
        s.beam([x, ry, za], [x, ry, zb + 0.01], 0.035, 0.035, tone(ROPE, sx, i, 12), 'wood');
      }
    }
  }
  // Flat stones at both ends, stepping onto the deck.
  for (const [end, g] of [
    [-1, ga],
    [1, gb],
  ] as const) {
    const z = end * (half + 0.35);
    const y = g - span.level;
    s.box(0.2 * end, y + 0.05, z, 1.5, 0.16, 0.7, tone(FLAGSTONE, end, 1, 13), 'mapStone', { ry: 0.15 * end });
    s.box(-0.75, y + 0.08, z + end * 0.1, 0.6, 0.22, 0.55, tone(FLAGSTONE, end, 2, 14), 'mapStone', { ry: 0.5 });
    s.box(0.9, y + 0.07, z - end * 0.05, 0.55, 0.2, 0.5, tone(FLAGSTONE, end, 3, 15), 'mapStone', { ry: -0.3 });
  }
}
