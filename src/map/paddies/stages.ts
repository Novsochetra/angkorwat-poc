import { hash3 } from '../../voxel/random';
import { PADDIES, type Paddy } from '../layout';

/**
 * The rice year of the paddies (paddies.ts): every plot runs through the
 * same stages on `MapFrame.season` (0‥1, 0 = mid-April), a little out of
 * step with its neighbours (its `lag`), and is cut on its own day (`cut`):
 *
 *   0      dry, bare, cracked earth (the hot season)
 *   ~0.05  first rains: the earth darkens, ploughed furrows
 *   ~0.07  the nursery bed is sown (one plot's corner): dense bright seedlings
 *   ~0.09  the plots fill: shallow water, a mirror of the sky
 *   ~0.12  seedlings pulled from the nursery and planted out in rows
 *   0.3‥0.55 lush green rice, knee to hip high, water under it
 *   ~0.55  the water is let out; the heads come out and turn gold
 *   ~0.62‥0.72 heavy golden heads bend over
 *   0.67‥0.8 harvest: each plot cut in a sweep, sheaves stood in stooks,
 *          then threshed; straw stacks go up
 *   0.8‥1  stubble on drying earth, then cracked earth; the stubble is grazed away
 *
 * Every function is smooth in the season (no pops), written twice: in GLSL
 * (`STAGE_GLSL`, used by the shaders) and in JS where the CPU needs it (the
 * footstep: is he wading?).
 */

/** Per plot: its lag behind the season, harvest and planting days (plot-local season), rows along x or z, nursery. */
export interface PlotPlan {
  paddy: Paddy;
  index: number;
  /** Season lag (the plot's own season is `fract(season − lag)`). */
  lag: number;
  /** Plot-local season when the cut starts (the sweep takes `SWEEP`). */
  cut: number;
  /** Plot-local season when planting starts. */
  plant: number;
  /** Rows run along x (else z). */
  rowsX: boolean;
}

/** How long (season) a sweep of planting or cutting takes to cross a plot. */
export const SWEEP = 0.014;
/** The plot whose corner is the nursery bed (layout.ts `PADDIES` index). */
export const NURSERY = 3;
/** The nursery bed: a strip this wide (m) along the plot's east side. */
export const NURSERY_W = 6;

export const PLOTS: PlotPlan[] = PADDIES.map((paddy, index) => {
  const r = (k: number) => hash3(index, k, 3, 7717);
  return {
    paddy,
    index,
    lag: (r(1) - 0.45) * 0.05,
    cut: 0.665 + r(2) * 0.1,
    // (the nursery plot is planted last: its seedlings go out first)
    plant: index === NURSERY ? 0.132 : 0.112 + r(3) * 0.016,
    rowsX: r(4) > 0.45,
  };
});

/** GLSL: the stage curves of a plot-local season `s`. */
export const STAGE_GLSL = /* glsl */ `
// Water standing in the plot (0 dry … 1 full): the rains fill it, it is let out before the harvest.
float pdWater(float s) { return smoothstep(0.07, 0.11, s) * (1.0 - smoothstep(0.53, 0.61, s)); }
// Wet earth (0 dry and cracked … 1 wet mud): the first rains, then drying after the water is let out.
float pdMud(float s) { return smoothstep(0.035, 0.075, s) * (1.0 - smoothstep(0.62, 0.8, s)); }
// Furrows of the plough in the wet earth before the plots fill.
float pdFurrow(float s) { return smoothstep(0.035, 0.06, s) * (1.0 - smoothstep(0.09, 0.12, s)); }
// Growth of the planted rice (0 seedling … 1 full height).
float pdGrow(float s) { return smoothstep(0.12, 0.42, s); }
// Ripening: the heads out and gold (0 green … 1 gold).
float pdRipe(float s) { return smoothstep(0.55, 0.67, s); }
// Heavy heads bending over.
float pdDroop(float s) { return smoothstep(0.6, 0.71, s); }
`;

/** Plot-local season. */
export const plotSeason = (season: number, lag: number): number => (((season - lag) % 1) + 1) % 1;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** JS twin of `pdWater`. */
export const waterOf = (s: number): number => smooth(0.07, 0.11, s) * (1 - smooth(0.53, 0.61, s));

/** The plot at a map point (−1: none). */
export function plotAt(x: number, z: number): number {
  for (let i = 0; i < PADDIES.length; i++) {
    const p = PADDIES[i];
    const dx = x - p.x;
    const dz = z - p.z;
    const cs = Math.cos(p.rot);
    const sn = Math.sin(p.rot);
    if (Math.abs(dx * cs + dz * sn) <= p.w / 2 + 0.5 && Math.abs(-dx * sn + dz * cs) <= p.d / 2 + 0.5) return i;
  }
  return -1;
}

/** The season the paddies show now (set by the part every frame; NaN: the part is not built). */
const now = { season: NaN, wet: 0 };

export function setPaddySeason(season: number, wet: number): void {
  now.season = season;
  now.wet = wet;
}

/**
 * Is there water to wade in at this point of a paddy plot (the footstep
 * sound)? The plot's standing water now, or puddles after heavy rain.
 */
export function paddyFlooded(x: number, z: number): boolean {
  if (Number.isNaN(now.season)) return false;
  const i = plotAt(x, z);
  if (i < 0) return false;
  const w = Math.max(waterOf(plotSeason(now.season, PLOTS[i].lag)), now.wet * 0.35);
  return w > 0.5;
}
