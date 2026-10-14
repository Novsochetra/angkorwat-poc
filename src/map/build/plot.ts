import { EV_COCONUTS, EV_MANGOS, EV_SUGAR_PALMS } from '../hamlet/_evSpots';

/**
 * His land (ដីរបស់គាត់): the plot round his stilt house (hamlet/_homePlan.ts
 * `HOME_AT`, 424, −107) where he may build (roam/_build*.ts), with no three.js,
 * so the build add-on (where a piece may stand: roam/_buildSpots.ts), its
 * outline on the ground and the maps (ui/minimap.ts) read the same shape.
 *
 * **The shape** (`PLOT_CORNERS`, on the map's axes: the house faces north, −z,
 * so its frame is the map's turned half round): between the Kulen foot trail on
 * the west (its tread's east edge: x 416, x 414 north of the bend at z −154)
 * and the Kulen stream on the east (its sandy bank: from x 438, x 436 north of
 * the bend); from the back of the village's north houses (south, z −88: the
 * mango in the yard of the house n4 stands just past it, its kitchen 7 m on)
 * up the Kulen foot meadow to the land's next step (north, z −168: 58 m before
 * the veranda). About 21 × 80 m, 1 706 m², all of it round the house.
 *
 * Until AWP-31 he could build within 46 m of the house's middle, but the
 * village's coarse "built on" cells (2 m) stopped him 3.5 m behind the house
 * and by the trees there, and most of the rest lay across the trail and the
 * stream. Inside his land those cells no longer stop him; the trail, the
 * stream, the house, the land's steps, his garden and the trees still do
 * (`PLOT_TREES`: a tree's trunk, and its crown for a tall piece).
 */

/** His land's corners (world x, z), round its edge (a simple polygon). */
export const PLOT_CORNERS: readonly (readonly [x: number, z: number])[] = [
  [414.4, -168],
  [435.4, -168],
  [435.4, -154],
  [437.8, -154],
  [437.8, -88],
  [416.4, -88],
  [416.4, -154],
  [414.4, -154],
];

/** The box round it (world m). */
export const PLOT_BOX = (() => {
  const xs = PLOT_CORNERS.map((c) => c[0]);
  const zs = PLOT_CORNERS.map((c) => c[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) } as const;
})();

/** Its area (m²). */
export const PLOT_AREA = (() => {
  let a = 0;
  for (let i = 0; i < PLOT_CORNERS.length; i++) {
    const [x0, z0] = PLOT_CORNERS[i];
    const [x1, z1] = PLOT_CORNERS[(i + 1) % PLOT_CORNERS.length];
    a += x0 * z1 - x1 * z0;
  }
  return Math.abs(a) / 2;
})();

/** How far (x, z) is from his land's edge (m). */
function toEdge(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < PLOT_CORNERS.length; i++) {
    const [ax, az] = PLOT_CORNERS[i];
    const [bx, bz] = PLOT_CORNERS[(i + 1) % PLOT_CORNERS.length];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

/** Is (x, z) inside the corners (on the edge counts)? */
function inside(x: number, z: number): boolean {
  if (x < PLOT_BOX.x0 || x > PLOT_BOX.x1 || z < PLOT_BOX.z0 || z > PLOT_BOX.z1) return false;
  let on = false;
  for (let i = 0, j = PLOT_CORNERS.length - 1; i < PLOT_CORNERS.length; j = i++) {
    const [xi, zi] = PLOT_CORNERS[i];
    const [xj, zj] = PLOT_CORNERS[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) on = !on;
  }
  return on || toEdge(x, z) < 1e-6;
}

/** Is the map point (x, z) on his land (`margin` m in from its edge; a negative margin reaches that far past it)? */
export function inPlot(x: number, z: number, margin = 0): boolean {
  if (inside(x, z)) return margin <= 0 || toEdge(x, z) >= margin;
  return margin < 0 && toEdge(x, z) <= -margin;
}

/** How far the map point (x, z) is past his land (m; 0 on it). */
export function pastPlot(x: number, z: number): number {
  return inside(x, z) ? 0 : toEdge(x, z);
}

/**
 * A tree on (or over) his land: its trunk's foot (x, z), the room its trunk takes (m, round the foot: a leaning
 * coconut's trunk leans out over it), and its crown (a circle round `cx, cz`, radius `cr`, from `low` m over the
 * ground up): a piece taller than `low` keeps out from under it.
 */
export interface PlotTree {
  readonly x: number;
  readonly z: number;
  readonly trunk: number;
  readonly cx: number;
  readonly cz: number;
  readonly cr: number;
  readonly low: number;
}

/** The village's yard trees whose trunk or crown reaches his land (hamlet/_evSpots.ts: the same lists the village draws). */
export const PLOT_TREES: readonly PlotTree[] = (() => {
  const out: PlotTree[] = [];
  const near = (x: number, z: number, r: number) => inPlot(x, z, -r);
  // Mangoes (hamlet/_evKit.ts `mango`): a 2.2 m trunk, the crown's lowest leaves about 2.9 m up, `r` round.
  for (const [x, z, r] of EV_MANGOS) if (near(x, z, r + 0.3)) out.push({ x, z, trunk: 0.7, cx: x, cz: z, cr: r + 0.3, low: 2.6 });
  // Coconuts: the trunk leans its top `lean` m out at `h`; at a tall piece's height (≈ 4.4 m) half of that out.
  for (const [x, z, h, lx, lz] of EV_COCONUTS) {
    const k = 4.4 / h;
    if (near(x, z, 2.5)) out.push({ x, z, trunk: 0.8, cx: x + lx * k * 0.5, cz: z + lz * k * 0.5, cr: 0.6 + Math.hypot(lx, lz) * k * 0.5, low: 2.4 });
  }
  // Sugar palms stand straight, their crowns high over anything he builds.
  for (const [x, z] of EV_SUGAR_PALMS) if (near(x, z, 1)) out.push({ x, z, trunk: 0.8, cx: x, cz: z, cr: 0, low: 99 });
  return out;
})();

// ── The block budget (AWP-19) ───────────────────────────────────────────────

/**
 * Blocks his land may hold, everything he builds on it together, chosen so a
 * full plot keeps a phone at its frame rate (graphics.ts `PhoneFrameRate`).
 * Measured (`npm run perf -- only=overview levels=phone,medium url=…&build=full`,
 * a walk at the plot's north end looking over it, 2026-10-14): every piece at
 * its most (65 pieces, 6 876 blocks) adds 8 draws and 0.08 M triangles on a
 * phone (≈ 11.6 a block; 44 on medium), the phone's GPU time the same (4.46 →
 * 4.41 ms on the M1 Max); the edge 3 draws, ≈ 0.01 M (with it: +11 draws,
 * +0.09 M on a phone, +0.32 M on medium). Triangles grow with the
 * blocks (one batch: the draws do not), so 10 000 blocks are ≈ 0.12 M on a
 * phone, under a new part's 0.15 M (docs/map-work/BRIEF.md "Budgets"), the walk
 * there ≈ 0.94 M of its 1.5 M. Every piece of today fits (69 %), with ≈ 3 000
 * blocks to spare for the player's own blocks (AWP-16: ≈ 8 triangles a block).
 */
export const PLOT_BUDGET = 10_000;

/**
 * What uses the budget, summed: each source counts its blocks on his land. The
 * build add-on adds its pieces (`pieces`: each piece's model's real block count,
 * standing or under way); a block layer adds its own with one line,
 * `addPlotBlocks('blocks', () => BLOCKS.countIn(PLOT_BOX…))`.
 */
const SOURCES = new Map<string, () => number>();

/** Add (or replace) a source of blocks on his land. */
export function addPlotBlocks(name: string, count: () => number): void {
  SOURCES.set(name, count);
}

/** Blocks on his land now (every source). */
export function plotBlocks(): number {
  let n = 0;
  for (const f of SOURCES.values()) n += f();
  return n;
}

/** Each source's blocks (checks, `window.__build.state()`). */
export function plotBlocksBy(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, f] of SOURCES) out[k] = f();
  return out;
}
