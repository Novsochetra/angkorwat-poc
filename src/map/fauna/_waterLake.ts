import { mulberry32 } from '../../voxel/random';
import type { HeightField } from '../heightfield';
import { PADDIES } from '../layout';
import { plotSeason, PLOTS, waterOf } from '../paddies/stages';
import { lineReach, type Reach } from './_waterRivers';

/**
 * The water birds away from the rivers, for the ducks and the waders
 * (_waterDucks.ts, _waterWaders.ts: same herds, no more draw calls):
 *  - on the great lake (layout.ts `LAKES`): egrets and grey herons wading
 *    along its north-east and south shallows (away from the floating
 *    village, the race lane and the moored festival boats), a raft of
 *    lesser whistling ducks and a family of spot-billed ducks offshore;
 *  - great egrets standing in the rice paddies (layout.ts `PADDIES`) while
 *    a plot holds water (paddies/stages.ts: from the first rains until the
 *    water is let out before the harvest). A dry plot has none: its egrets
 *    are away, and none land there.
 *
 * Each place is a made-up straight "reach" (`lineReach`), so the birds use
 * the rivers' routines (wading, watching, stabbing; loops, fleeing).
 */

export interface ExtraWader {
  reach: Reach;
  u: number;
  side: number;
  kind: 'egret' | 'heron';
  /** Paddy plot index (`PADDIES`), −1 on the lake. */
  plot: number;
}

export interface ExtraSpot {
  reach: Reach;
  u: number;
  side: number;
  plot: number;
}

export interface ExtraFamily {
  reach: Reach;
  kind: 'spotbill' | 'whistler';
  adults: number;
  young: number;
}

export interface LakeBirds {
  waders: ExtraWader[];
  spots: ExtraSpot[];
  families: ExtraFamily[];
}

/** The lake's shallows: a line a few metres off the shore, the shore on `side`; birds on it. */
const SHORES: { line: [number, number, number, number]; side: number; birds: ('egret' | 'heron')[] }[] = [
  // North-east shore, north of the village and the race lane.
  { line: [-360, -30, -310, 4], side: -1, birds: ['heron', 'egret', 'egret'] },
  // South shore, west of the village.
  { line: [-495, 93, -445, 93], side: 1, birds: ['egret', 'egret', 'heron'] },
];

/** Offshore ducks: a line of open water (room either side, m). */
const RAFTS: { line: [number, number, number, number]; room: number; kind: 'spotbill' | 'whistler'; adults: number; young: number }[] = [
  { line: [-398, -24, -358, -8], room: 4, kind: 'whistler', adults: 7, young: 0 },
  { line: [-482, 80, -440, 80], room: 3, kind: 'spotbill', adults: 2, young: 4 },
];

/** Egrets per paddy plot (`PADDIES` order): most plots one or two. */
const PADDY_EGRETS = [1, 2, 0, 1, 1, 2, 1, 0, 2, 1];

/** How deep an egret stands in a flooded plot (m: its water is ~ 0.1 m). */
const PADDY_WADE = 0.1;
/** Paddy water over the plot's land when full (paddies/ground.ts `LIFT.wet`). */
const PADDY_WATER = 0.11;

export function buildLakeBirds(field: HeightField): LakeBirds {
  const rnd = mulberry32(4471);
  const out: LakeBirds = { waders: [], spots: [], families: [] };
  for (const s of SHORES) {
    const reach = lineReach(field, 'Great lake', ...s.line, { w: 14 });
    if (!reach) continue;
    const n = reach.b - reach.a;
    s.birds.forEach((kind, i) => out.waders.push({ reach, u: n * (0.15 + (0.7 * i) / Math.max(1, s.birds.length - 1)), side: s.side, kind, plot: -1 }));
    for (let u = 4; u < n - 3; u += 9) out.spots.push({ reach, u, side: s.side, plot: -1 });
  }
  for (const r of RAFTS) {
    const reach = lineReach(field, 'Great lake', ...r.line, { room: r.room });
    if (reach) out.families.push({ reach, kind: r.kind, adults: r.adults, young: r.young });
  }
  PADDIES.forEach((p, plot) => {
    // A line along the plot's long side through its middle; they stand at the
    // edge of the rice by the dikes (seen over tall rice from the dike paths).
    const along = p.w >= p.d;
    const half = (along ? p.w : p.d) / 2 - 3;
    const room = (along ? p.d : p.w) / 2 - 1.3;
    const [cx, cz] = [p.x, p.z];
    const [dx, dz] = along ? [Math.cos(p.rot), Math.sin(p.rot)] : [-Math.sin(p.rot), Math.cos(p.rot)];
    const reach = lineReach(field, 'paddies', cx - dx * half, cz - dz * half, cx + dx * half, cz + dz * half, {
      level: p.level + PADDY_WATER,
      room,
      wade: PADDY_WADE,
    });
    if (!reach) return;
    const n = reach.b - reach.a;
    for (let i = 0; i < PADDY_EGRETS[plot]; i++) out.waders.push({ reach, u: n * (0.2 + 0.6 * rnd()), side: rnd() < 0.5 ? -1 : 1, kind: 'egret', plot });
    for (const u of [n * 0.25, n * 0.75]) for (const side of [-1, 1]) out.spots.push({ reach, u, side, plot });
  });
  return out;
}

/** Water in each paddy plot now (0 dry … 1 full), from the season. */
export function paddyWater(season: number, out: Float32Array): Float32Array {
  for (let i = 0; i < PLOTS.length && i < out.length; i++) out[i] = waterOf(plotSeason(season, PLOTS[i].lag));
  return out;
}
