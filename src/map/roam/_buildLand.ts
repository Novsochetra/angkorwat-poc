import { PLOT_BOX } from '../build/plot';

/**
 * His land as one map (the build add-on: roam/_buildSpots.ts makes it with its own rules and asks it): a grid of
 * `LAND_CELL` m squares over his land's box, each with what stops a piece there for good — the water, the trail and
 * the paths, the fields, past his land (a neighbour's yard), his house, and anything else the world stands there
 * (the stream's bank stones, a rock; never his own blocks or pieces, nor his garden: those come and go and are asked
 * live). Made once, in idle slices after roaming starts (`step`), at once when asked before.
 *
 * - **Two masks**, one per kind of thing he places: a **piece** keeps half a metre from the trail and the water (room
 *   to walk by), a **fence** may stand by them and its middle line on his land's edge (_buildSpots.ts `FENCE_EDGE`).
 *   Each is the raw reasons grown by the kind's margins (`MARGINS`, in whole squares).
 * - **The cord** (build/plotEdge.ts): the outline of the fence mask where it meets the land's edge, a neighbour's
 *   yard or something standing (the bank stones), as straight runs (`runs`): so the cord he sees is a line a fence
 *   fits along (_build.ts `snapEdge` lays one just inside it). Not along the trail's or the stream's own sides
 *   (they show themselves), nor round small islands (a rock) or his house.
 * - **The red squares** (`blockedRuns`): what stops the kind he places on his land besides the trail's tread and the
 *   water itself (their margins, the bank, a rock, his house), drawn faint red while he builds (_buildLandView.ts).
 */

/** A square of the map (m). */
export const LAND_CELL = 0.25;

/** Why a square stops a piece, for good (0: nothing does). The order is the rules' order: the first one found is said. */
export const LAND_WHY = ['', 'water', 'path', 'field', 'plot', 'yard', 'house', 'thing'] as const;
export type LandWhy = Exclude<(typeof LAND_WHY)[number], ''>;
const CODE: Record<LandWhy, number> = { water: 1, path: 2, field: 3, plot: 4, yard: 5, house: 6, thing: 7 };

/** The kinds he places, with their margins round each reason (m; a negative one lets it reach that far past). */
export type LandKind = 'piece' | 'fence';
const MARGINS: Record<LandKind, Partial<Record<LandWhy, number>>> = {
  piece: { water: 0.6, path: 0.5, field: 0.5, house: 0.1 },
  fence: { water: 0.15, house: 0.1 },
};

/** What the map is made from (roam/_buildSpots.ts's own rules, at one point). */
export interface LandRules {
  /** Water, the trail, a path or a field at (x, z), or null. */
  ground(x: number, z: number): 'water' | 'path' | 'field' | 'far' | null;
  /** Past his land at (x, z), for this kind (a fence: within its half depth past the edge counts as on it): why, or null. */
  land(x: number, z: number, kind: LandKind): 'plot' | 'yard' | null;
  /** His house (and the grandmother's places) at (x, z). */
  house(x: number, z: number): boolean;
  /** Something of the world standing at (x, z) (not his own). */
  thing(x: number, z: number): boolean;
}

/** A straight run of the cord: from (x0, z0) to (x1, z1) along x or z, his land on the side `inX`, `inZ` (−1, 0, 1). */
export interface LandRun {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  readonly inX: number;
  readonly inZ: number;
}

/** A row of red squares: from x0 to x1 at row z (its middle), the reason the first one has. */
export interface BlockedRun {
  readonly x0: number;
  readonly x1: number;
  readonly z: number;
}

/** Islands of something standing smaller than this (squares) get no cord: a rock, a post, a tree's trunk (≈ 25 m²). */
const ISLAND = 400;
/** A cord run shorter than this (m) is left out (a corner's tooth). */
const RUN_MIN = 0.75;

export interface LandMap {
  readonly ready: boolean;
  /** Work on it for about `ms` (idle slices); true when done. */
  step(ms: number): boolean;
  /** Why a piece of `kind` cannot stand at (x, z) for good (the first reason), or null. Makes the rest at once if needed. */
  why(kind: LandKind, x: number, z: number): LandWhy | null;
  /** Something of the world stands at (x, z) (the rules' "thing": asked after the others). */
  thing(x: number, z: number): boolean;
  /** The cord's runs (the fence mask's outline against the land's edge and what stands). */
  runs(): readonly LandRun[];
  /** The red squares for `kind` on his land (rows of them). */
  blockedRuns(kind: LandKind): readonly BlockedRun[];
  /** Squares where `kind` may stand (checks: the land's size). */
  free(kind: LandKind): number;
  /** Its size (checks). */
  readonly size: { readonly ni: number; readonly nk: number; readonly ms: number };
}

export function createLandMap(rules: LandRules, inside: (x: number, z: number) => boolean): LandMap {
  const x0 = Math.floor(PLOT_BOX.x0) - 1;
  const z0 = Math.floor(PLOT_BOX.z0) - 1;
  const ni = Math.ceil((PLOT_BOX.x1 + 1 - x0) / LAND_CELL);
  const nk = Math.ceil((PLOT_BOX.z1 + 1 - z0) / LAND_CELL);
  const n = ni * nk;
  /** Per square: the raw reason (no margins) for a piece and for a fence (only past his land differs), and a thing. */
  const rawPiece = new Uint8Array(n);
  const rawFence = new Uint8Array(n);
  const things = new Uint8Array(n);
  const masks: Record<LandKind, Uint8Array> = { piece: new Uint8Array(n), fence: new Uint8Array(n) };
  let row = 0;
  let done = false;
  let ms = 0;
  let runList: LandRun[] | null = null;
  const blocked: Partial<Record<LandKind, BlockedRun[]>> = {};
  const cx = (i: number) => x0 + (i + 0.5) * LAND_CELL;
  const cz = (k: number) => z0 + (k + 0.5) * LAND_CELL;

  /** One row of raw reasons. */
  function makeRow(k: number): void {
    const z = cz(k);
    for (let i = 0; i < ni; i++) {
      const x = cx(i);
      const c = i + k * ni;
      const g = rules.ground(x, z);
      let base = g === 'far' ? CODE.plot : g ? CODE[g] : 0;
      let p = base;
      let f = base;
      if (!base) {
        const lp = rules.land(x, z, 'piece');
        const lf = rules.land(x, z, 'fence');
        p = lp ? CODE[lp] : 0;
        f = lf ? CODE[lf] : 0;
        if (rules.house(x, z)) {
          base = CODE.house;
          p ||= base;
          f ||= base;
        }
      }
      rawPiece[c] = p;
      rawFence[c] = f;
      things[c] = rules.thing(x, z) ? 1 : 0;
    }
  }

  /** The masks: each kind's raw reasons grown by its margins (in squares, a square's reach round each). */
  function grow(): void {
    for (const kind of ['piece', 'fence'] as const) {
      const raw = kind === 'piece' ? rawPiece : rawFence;
      const out = masks[kind];
      out.set(raw);
      // (by reason, the first in the rules' order kept where two reach one square)
      for (let code = LAND_WHY.length - 1; code >= 1; code--) {
        const why = LAND_WHY[code] as LandWhy;
        const r = Math.round((MARGINS[kind][why] ?? 0) / LAND_CELL);
        if (r <= 0) continue;
        for (let k = 0; k < nk; k++)
          for (let i = 0; i < ni; i++) {
            if (raw[i + k * ni] !== code) continue;
            for (let dk = -r; dk <= r; dk++) {
              const kk = k + dk;
              if (kk < 0 || kk >= nk) continue;
              for (let di = -r; di <= r; di++) {
                const ii = i + di;
                if (ii < 0 || ii >= ni) continue;
                const o = ii + kk * ni;
                if (!out[o] || out[o] > code) out[o] = code;
              }
            }
          }
      }
    }
  }

  function finish(): void {
    while (row < nk) makeRow(row++);
    if (!done) {
      grow();
      done = true;
    }
  }

  const at = (x: number, z: number): number => {
    const i = Math.floor((x - x0) / LAND_CELL);
    const k = Math.floor((z - z0) / LAND_CELL);
    return i < 0 || k < 0 || i >= ni || k >= nk ? -1 : i + k * ni;
  };

  /** The things' islands touching nothing else that stops a fence, smaller than `ISLAND` squares: no cord round them. */
  function smallIslands(): Uint8Array {
    const small = new Uint8Array(n);
    const seen = new Uint8Array(n);
    const stack: number[] = [];
    const part: number[] = [];
    for (let s = 0; s < n; s++) {
      if (seen[s] || !things[s] || masks.fence[s]) continue;
      stack.push(s);
      seen[s] = 1;
      part.length = 0;
      let open = true;
      while (stack.length) {
        const c = stack.pop()!;
        part.push(c);
        const i = c % ni;
        const k = (c - i) / ni;
        for (const [di, dk] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const ii = i + di;
          const kk = k + dk;
          if (ii < 0 || kk < 0 || ii >= ni || kk >= nk) continue;
          const o = ii + kk * ni;
          if (masks.fence[o]) open = false;
          if (seen[o] || !things[o] || masks.fence[o]) continue;
          seen[o] = 1;
          stack.push(o);
        }
      }
      if (open && part.length < ISLAND) for (const c of part) small[c] = 1;
    }
    return small;
  }

  /** The cord: edges between a square a fence may take and one stopped by past-the-land, a yard or a thing, merged into runs. */
  function makeRuns(): LandRun[] {
    const small = smallIslands();
    const okF = (c: number) => c >= 0 && !masks.fence[c] && !(things[c] && !small[c]);
    // (a square past it that the cord runs against: past his land, a yard, or something standing (no small island))
    const wall = (c: number) => {
      if (c < 0) return true;
      const m = masks.fence[c];
      if (m === CODE.plot || m === CODE.yard) return true;
      return !m && !!things[c] && !small[c];
    };
    const out: LandRun[] = [];
    // Edges along x (between rows k-1 and k), then along z (between columns i-1 and i).
    for (let k = 0; k <= nk; k++) {
      let start = -1;
      let dir = 0;
      const flush = (end: number) => {
        if (start >= 0 && (end - start) * LAND_CELL >= RUN_MIN) out.push({ x0: x0 + start * LAND_CELL, z0: z0 + k * LAND_CELL, x1: x0 + end * LAND_CELL, z1: z0 + k * LAND_CELL, inX: 0, inZ: dir });
        start = -1;
      };
      for (let i = 0; i <= ni; i++) {
        let d = 0;
        if (i < ni) {
          const below = k > 0 ? i + (k - 1) * ni : -1;
          const above = k < nk ? i + k * ni : -1;
          if (okF(above) && wall(below)) d = 1;
          else if (okF(below) && wall(above)) d = -1;
        }
        if (d !== dir || !d) {
          flush(i);
          if (d) start = i;
          dir = d;
        }
      }
    }
    for (let i = 0; i <= ni; i++) {
      let start = -1;
      let dir = 0;
      const flush = (end: number) => {
        if (start >= 0 && (end - start) * LAND_CELL >= RUN_MIN) out.push({ x0: x0 + i * LAND_CELL, z0: z0 + start * LAND_CELL, x1: x0 + i * LAND_CELL, z1: z0 + end * LAND_CELL, inX: dir, inZ: 0 });
        start = -1;
      };
      for (let k = 0; k <= nk; k++) {
        let d = 0;
        if (k < nk) {
          const left = i > 0 ? i - 1 + k * ni : -1;
          const right = i < ni ? i + k * ni : -1;
          if (okF(right) && wall(left)) d = 1;
          else if (okF(left) && wall(right)) d = -1;
        }
        if (d !== dir || !d) {
          flush(k);
          if (d) start = k;
          dir = d;
        }
      }
    }
    return out;
  }

  /** The red squares for a kind, on his land (or a fence's reach past it): not the trail's tread nor the water itself. */
  function makeBlocked(kind: LandKind): BlockedRun[] {
    const m = masks[kind];
    const raw = kind === 'piece' ? rawPiece : rawFence;
    const out: BlockedRun[] = [];
    for (let k = 0; k < nk; k++) {
      let start = -1;
      for (let i = 0; i <= ni; i++) {
        const c = i + k * ni;
        let red = false;
        if (i < ni && inside(cx(i), cz(k))) {
          const code = m[c] || (things[c] ? CODE.thing : 0);
          red = !!code && code !== CODE.plot && code !== CODE.yard && raw[c] !== CODE.water && raw[c] !== CODE.path;
        }
        // (rows of at most 2 m: drawn on the ground's height at their middle)
        if (red && start < 0) start = i;
        else if (start >= 0 && (!red || (i - start) * LAND_CELL >= 2)) {
          out.push({ x0: x0 + start * LAND_CELL, x1: x0 + i * LAND_CELL, z: cz(k) });
          start = red ? i : -1;
        }
      }
    }
    return out;
  }

  return {
    get ready() {
      return done;
    },
    step(budget) {
      if (done) return true;
      const t0 = performance.now();
      while (row < nk && performance.now() - t0 < budget) makeRow(row++);
      if (row >= nk) {
        grow();
        done = true;
      }
      ms += performance.now() - t0;
      return done;
    },
    why(kind, x, z) {
      if (!done) {
        const t0 = performance.now();
        finish();
        ms += performance.now() - t0;
      }
      const c = at(x, z);
      if (c < 0) return 'plot';
      const code = masks[kind][c];
      return code ? (LAND_WHY[code] as LandWhy) : null;
    },
    thing(x, z) {
      if (!done) finish();
      const c = at(x, z);
      return c >= 0 && !!things[c];
    },
    runs() {
      if (!done) finish();
      return (runList ??= makeRuns());
    },
    blockedRuns(kind) {
      if (!done) finish();
      return (blocked[kind] ??= makeBlocked(kind));
    },
    free(kind) {
      if (!done) finish();
      let f = 0;
      for (let c = 0; c < n; c++) if (!masks[kind][c] && !things[c]) f++;
      return f;
    },
    get size() {
      return { ni, nk, ms: Math.round(ms) };
    },
  };
}
