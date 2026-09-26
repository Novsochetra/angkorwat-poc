import { plotSeason, PLOTS, SWEEP } from '../paddies/stages';

/**
 * The rice paddies on the mini-map and the big map, in the colour of their
 * stage of the rice year (paddies/stages.ts; each plot on its own season,
 * its `lag`, and cut on its own day): cracked dry earth in the hot season,
 * dark ploughed mud with the first rains, flooded (a sky-blue mirror) when
 * the plots fill, green rice growing deeper, golden before the harvest,
 * pale stubble after it, drying back to bare earth.
 *
 * Drawn over the land picture (which is made once), in map metres with the
 * canvas's current transform.
 */

/** Stage colours (sRGB), a key every plot-local season `s`: to the harvest. */
const KEYS: readonly [number, number][] = [
  [0.0, 0xc4a57a], // dry, cracked
  [0.035, 0xc4a57a],
  [0.07, 0x7a5a3e], // wet ploughed mud
  [0.1, 0x7cc0d0], // flooded: a mirror of the sky
  [0.14, 0x86bfa2], // seedlings planted out in the water
  [0.3, 0x62b044], // green rice
  [0.5, 0x3f922e], // deep green
  [0.58, 0xa8b43e], // heads coming out
  [0.67, 0xe6b83c], // golden
];
const GOLD = 0xe6b83c;
const STUBBLE = 0xd4bd84;
const DRY = 0xc4a57a;

const lerp = (a: number, b: number, t: number) => {
  const c = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (c(16) << 16) | (c(8) << 8) | c(0);
};
const smooth = (t: number) => {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
};

/** Plot `i`'s colour at the map's season (0‥1, 0 = mid-April), as sRGB. */
export function paddyColor(i: number, season: number): number {
  const plot = PLOTS[i];
  const s = plotSeason(season, plot.lag);
  // Harvest: golden until its cut, the sweep, then stubble drying back to earth.
  if (s >= plot.cut) {
    const after = smooth((s - plot.cut) / (SWEEP * 2));
    const dry = smooth((s - 0.88) / 0.1);
    return lerp(lerp(GOLD, STUBBLE, after), DRY, dry);
  }
  if (s >= KEYS[KEYS.length - 1][0]) return GOLD;
  for (let k = 1; k < KEYS.length; k++) {
    const [s1, c1] = KEYS[k];
    if (s > s1) continue;
    const [s0, c0] = KEYS[k - 1];
    return lerp(c0, c1, smooth((s - s0) / (s1 - s0)));
  }
  return GOLD;
}

/** A key for what the paddies look like now (the big map redraws when it changes). */
export const paddyKey = (season: number): string => PLOTS.map((_, i) => paddyColor(i, season).toString(16)).join();

/**
 * The plots in their colours, in map metres from (ox, oz) under the canvas's
 * current transform; dimmed and blued by night (0‥1) like the land.
 */
export function drawPaddies(c2: CanvasRenderingContext2D, season: number, night: number, ox: number, oz: number): void {
  const base = c2.getTransform();
  for (let i = 0; i < PLOTS.length; i++) {
    const p = PLOTS[i].paddy;
    let col = paddyColor(i, season);
    // (moonlit: toward the night land's blue, dim)
    if (night > 0.01) col = lerp(col, lerp(col, 0x1a2a48, 0.86), night);
    c2.setTransform(base);
    c2.translate(p.x - ox, p.z - oz);
    c2.rotate(p.rot);
    c2.fillStyle = `#${col.toString(16).padStart(6, '0')}`;
    // (a dike round each plot: a little inside its edge)
    c2.fillRect(-p.w / 2 + 0.6, -p.d / 2 + 0.6, p.w - 1.2, p.d - 1.2);
  }
  c2.setTransform(base);
}
