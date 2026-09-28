/**
 * The Resolution setting (the settings panel; `resolution=` in the URL): how
 * many pixels the map is drawn at, apart from the Graphics level, which picks
 * *what* is drawn (docs/map-work/PERFORMANCE-PLAN.md, 3b).
 *
 * - `auto`: the level's own, as before (graphics.ts `ratio`: the screen's on
 *   high and max, 1 on low, medium drops to 1 while frames come slow).
 * - a number: a share of the screen's own width (1: every screen dot; 0.5:
 *   half across, a quarter of the pixels). It is kept as a share, so it holds
 *   through a window resize or a move to another screen; the menu shows it as
 *   exact sizes ({@link resolutionSizes}).
 *
 * A picked size is drawn one of two ways (main.ts `applyView`):
 * - a whole step (the screen's dots per game pixel a whole number: 1, 2, 3,
 *   4): the canvas is that size and the browser stretches it with nearest
 *   pixels (`image-rendering: pixelated`), so each game pixel is a crisp
 *   square of 2 × 2, 3 × 3 … dots;
 * - a size between (e.g. 1920 × 1200 on a 2880 × 1800 screen): the canvas
 *   keeps the screen's own size, the scene and its effects draw into smaller
 *   targets, and the last pass (post.ts grade) scales them up with a smooth
 *   filter and a light sharpen. (The browser's own stretch by 4/3 blurred the
 *   whole map and laid a fine grid over it.)
 */
export type ResolutionChoice = 'auto' | number;

const SHOT = new URLSearchParams(location.search).get('shot') === '1';

/** The screen's own pixel ratio (a shot's is 1: it draws CSS pixels). */
export const screenRatio = (): number => (SHOT ? 1 : devicePixelRatio || 1);

/** Is a share a size the setting can hold (0.1‥1 of the screen's width)? */
export const isResolutionShare = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0.1 && v <= 1;

/**
 * What is drawn now (main.ts `applyView` sets it, post.ts and the point
 * sprites read it): the scene's pixel ratio (its targets are CSS size × it),
 * the canvas's (the picture on the page), and whether the browser stretches
 * the canvas with nearest pixels.
 */
export const view = { scene: 1, canvas: 1, pixelated: false };

/** The scene's height in pixels now: point sprites size themselves by it (road/glow.ts `pointScale`, sky/rain.ts, sky/snow.ts). */
export const sceneHeight = (): number => Math.max(1, Math.floor(innerHeight * view.scene));

/** Screen dots per game pixel for a share (1 / share), and whether that is a whole number (a clean stretch). */
export function stepOf(share: number): { step: number; whole: boolean } {
  const step = 1 / share;
  return { step, whole: Math.abs(step - Math.round(step)) < 0.02 };
}

/** One size in the menu. */
export interface ResolutionSize {
  /** Its share of the screen's width (what the setting keeps). */
  share: number;
  /** Width and height in pixels, the window's shape. */
  w: number;
  h: number;
  /** A whole step (1, 2, 3 or 4 screen dots a pixel): crisp; the menu marks it. */
  whole: boolean;
}

/** Common widths offered between the whole steps. */
const COMMON = [3840, 3200, 2560, 1920, 1680, 1280, 1024, 800, 640, 480];
/** At most this many sizes (the whole steps always among them). */
const MAX_SIZES = 8;
/** Narrower than this is no picture to play with. */
const MIN_WIDTH = 240;

/**
 * The sizes to offer for this window on this screen, biggest first: its own
 * pixels (`innerWidth × devicePixelRatio`, not capped at 2), then the common
 * widths that fit, down to a quarter across (4 × 4 dots a pixel), each with
 * the window's shape. The whole steps are always there; a common width within
 * 8 % of another size is left out.
 */
export function resolutionSizes(): ResolutionSize[] {
  const r = screenRatio();
  const W = Math.max(1, Math.round(innerWidth * r));
  const H = Math.max(1, Math.round(innerHeight * r));
  const size = (w: number, whole: boolean): ResolutionSize => ({ share: w / W, w: Math.round(w), h: Math.round((w * H) / W), whole });
  const out: ResolutionSize[] = [];
  for (let k = 1; k <= 4; k++) if (k === 1 || W / k >= MIN_WIDTH) out.push(size(W / k, true));
  const floor = Math.max(MIN_WIDTH, W / 4);
  const near = (w: number) => out.some((s) => Math.abs(s.w - w) / Math.max(s.w, w) < 0.08);
  for (const w of COMMON) if (w < W && w >= floor && !near(w)) out.push(size(w, false));
  // (too many: leave out the in-between size closest to its neighbours, until they fit)
  out.sort((a, b) => b.w - a.w);
  while (out.length > MAX_SIZES) {
    let drop = -1;
    let gap = Infinity;
    for (let i = 1; i < out.length - 1; i++) {
      if (out[i].whole) continue;
      const g = Math.log(out[i - 1].w / out[i + 1].w);
      if (g < gap) {
        gap = g;
        drop = i;
      }
    }
    if (drop < 0) break;
    out.splice(drop, 1);
  }
  return out;
}

/** The menu's size for a kept share (the nearest, within 3 %), or null (it came from another screen: none is pressed). */
export function sizeForShare(share: number, sizes = resolutionSizes()): ResolutionSize | null {
  let best: ResolutionSize | null = null;
  for (const s of sizes) if (Math.abs(s.share - share) / share < 0.03 && (!best || Math.abs(s.share - share) < Math.abs(best.share - share))) best = s;
  return best;
}

/** The size a share draws at in this window (for the note under the menu). */
export function sizeOfShare(share: number): { w: number; h: number } {
  const r = screenRatio();
  return { w: Math.round(innerWidth * r * share), h: Math.round(innerHeight * r * share) };
}
