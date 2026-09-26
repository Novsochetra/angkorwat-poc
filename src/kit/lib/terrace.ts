import { hash3, valueNoise3 } from '../../voxel/random';
import { MOSS, SANDSTONE, SOIL } from '../palette';
import { PieceBuilder } from '../PieceBuilder';
import { placePiece, turnXZ, type Placement } from '../place';
import { here, rng, snap, TEXEL } from '../shapes';
import { soilSurf, stoneSurf, type StoneFinish } from '../surface';
import type { KitPiece } from '../types';
import { baluster, coursesOf, DryMasonry, FACE, finishLook, overgrow, spansOf, subtractBox, type Box6, type CourseOptions, type Ledge, type Stone, type StoneLook } from './gallery';
import { commitGrass, ghostGround, GRASS_TONES, grassGrid, grassTuft, plusTuft } from './grass';

/**
 * §16 terrace system — the shared terrace library: stepped, moulded terrace
 * bodies with paved, walkable tops, as the terraces of Angkor Wat are built.
 * Each stage is a tall Khmer base: base mouldings (a plinth and bands of
 * 0.25 m, each set in a little from the one below), a plain or niched dado
 * of 0.5 m ashlars, then cornice mouldings stepping out again to a projecting
 * coping, the rim of the paved top. Stones are laid dry with `DryMasonry`
 * (one box per stone, running bond, corners bonded course by course); the
 * hidden interior is one dark core box per stage; the top is paved with
 * 0.25 m slabs in rows, moss and grass in the joints; moss cushions and
 * grass sit on every ledge (`overgrow`).
 *
 * ## Placement contract
 * - Origin at the centre of the footprint, y = 0 on the ground; front = +Z,
 *   right = +X (BRIEF.md). The footprint is `width` (x) × `depth` (z), on the
 *   0.5 m / 2 m grid: x ∈ [−width/2, width/2], z ∈ [−depth/2, depth/2].
 * - A stage's **outline** is its outermost face — the plinth's and the
 *   coping's (they project the same distance). Stage 0's outline is the
 *   footprint; each stage above is set back by its `setback` on finished
 *   sides. The **dado plane** lies `relief` (the profile's largest projection,
 *   0.25–0.375 m) behind the outline; the facing stones reach `skin` (0.5 m)
 *   behind the dado plane (the **inner plane**), where the paving starts.
 * - The walkable top of stage k is y = its `y1` (the top of the coping and
 *   the paving); the whole body's walkable top is `top` (the last stage's).
 * - **Finished sides** (`sides`, default all four) get the moulded face.
 *   On the other sides every stage runs flush to the footprint edge with its
 *   paving, cut square: put the next body there (x ± width) and they tile
 *   into one bigger terrace, faces and paving continuing.
 * - **Side frame** (used by gaps, niches and edges): for each side, `u` runs
 *   along it, left → right as seen from outside, and `n` is the distance out
 *   from the centre: front u = x, n = z; right u = −z, n = x; back u = −x,
 *   n = −z; left u = z, n = −x. `turn` = quarter turns that face a +Z-facing
 *   kit module out over that side (front 0, right 1, back 2, left 3, as in
 *   `placePiece`), so a side-frame (u, n) is piece (x, z) = `turnXZ(u, n, turn)`.
 * - **Gaps** (for stairs): a gap leaves a span of a side's moulded face out,
 *   on every stage (or the listed ones), and lays a plain ashlar face there,
 *   flush with the stage's outline (or `depth` behind it), foot to top:
 *   mouldings and colliders stop at the gap's ends, the top stays level and
 *   paved behind it. A stair set against the gap has its back on that plane —
 *   for stage k at n = `stages[k].outline[side] − depth`, i.e. the footprint
 *   edge for stage 0 — and climbs to `y1`; a recessed gap's floor on the
 *   tread below is paved.
 * - **Edges** (for parapets, naga balustrades, lions, posts): `edges` lists
 *   each finished side's coping of each stage: its level, the outline and inner
 *   plane, and its spans along the side with the gaps taken out.
 *   `edgePlacement(edge, u, inset)` places a straight +Z-facing module
 *   (running along x) on it, centred at u, its origin `inset` behind the rim.
 * - Colliders: one solid box per stage over its outline, from the ground to
 *   its top (minus the gaps), so every top is walkable.
 *
 * ## Usage
 * ```ts
 * const p = new PieceBuilder();
 * const t = terrace(p, {
 *   width: 8, depth: 8, finish: STONE_FINISH.mossy, seed,
 *   stages: [{ height: 2 }, { height: 1.25, setback: 1.25 }],
 *   gaps: [{ side: 'front', width: 4.75 }],     // a stair will stand here
 *   weather: { moss: 0.6, grass: 0.5 },
 * });
 * // a balustrade module (4 m long, running along x, front at z = 0.25) on the back rim:
 * const back = t.edges.find((e) => e.side === 'back' && e.stage === 1)!;
 * placePiece(target, balustrade, edgePlacement(back, 0, 0.25));
 * return p.done();
 * ```
 * Lower-level: `terracePiece(o)` builds a lone body as a KitPiece;
 * `profileFor(h)` / `TERRACE_PROFILES` give the moulding profiles;
 * `sideBox`, `sideFrame` convert between the side frame and piece space.
 */

const T = TEXEL;
/** A hair (1/64 m): keeps hidden boxes off the faces they would flicker against. */
const HAIR = T / 4;
/** The dark of the open joints and recesses (as in lib/gallery). */
const JOINT = SANDSTONE.cavity[1];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export type TerraceSide = 'front' | 'right' | 'back' | 'left';
/** The four sides, clockwise from the front seen from above (index = turn). */
export const TERRACE_SIDES: readonly TerraceSide[] = ['front', 'right', 'back', 'left'];
/** A value per side — e.g. the distance of a face from the centre (the side frame's n). */
export type SideValues = Record<TerraceSide, number>;

/** Quarter turns that face a +Z module out over the side. */
const turnOf = (s: TerraceSide) => TERRACE_SIDES.indexOf(s);
/** The side's outward face as a FACE bit, and the inward one. */
const OUT_FACE: SideValues = { front: FACE.pz, right: FACE.px, back: FACE.nz, left: FACE.nx };
const IN_FACE: SideValues = { front: FACE.nz, right: FACE.nx, back: FACE.pz, left: FACE.px };
/** The sides at the left and right end of a side, as seen from outside. */
const ends = (s: TerraceSide): [TerraceSide, TerraceSide] => {
  const i = turnOf(s);
  return [TERRACE_SIDES[(i + 3) % 4], TERRACE_SIDES[(i + 1) % 4]];
};
const along = (s: TerraceSide): 'x' | 'z' => (s === 'front' || s === 'back' ? 'x' : 'z');

/** The piece-space box of a side-frame box: u0‥u1 along the side, n0‥n1 out from the centre. */
export function sideBox(side: TerraceSide, u0: number, u1: number, y0: number, y1: number, n0: number, n1: number): Box6 {
  const t = turnOf(side);
  const [ax, az] = turnXZ(u0, n0, t);
  const [bx, bz] = turnXZ(u1, n1, t);
  return [Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz)];
}

/** A side's frame: its turn and the conversion of (u, n) to piece (x, z). */
export function sideFrame(side: TerraceSide): { turn: number; toPiece(u: number, n: number): [number, number] } {
  const turn = turnOf(side);
  return { turn, toPiece: (u, n) => turnXZ(u, n, turn) };
}

/** The span a piece-space box covers along a side (u0‥u1). */
function uSpan(side: TerraceSide, b: Box6): [number, number] {
  if (side === 'front') return [b[0], b[3]];
  if (side === 'back') return [-b[3], -b[0]];
  if (side === 'right') return [-b[5], -b[2]];
  return [b[2], b[5]];
}

/** The span a piece-space box covers out from the centre on a side (n0‥n1). */
function nSpan(side: TerraceSide, b: Box6): [number, number] {
  if (side === 'front') return [b[2], b[5]];
  if (side === 'back') return [-b[5], -b[2]];
  if (side === 'right') return [b[0], b[3]];
  return [-b[3], -b[0]];
}

/** A side-frame span (u) on the course axis of that side (x or z, ascending). */
function axisSpan(side: TerraceSide, a: number, b: number): [number, number] {
  return side === 'front' || side === 'left' ? [a, b] : [-b, -a];
}

/** One moulding band of a stage's face: its height and how far it stands out of the dado plane (metres). */
export interface TerraceBand {
  h: number;
  out: number;
  /** Brightness of its stones (default 1; < 1 for a band sunk in shadow). */
  shade?: number;
}

/** A stage's moulded face, bottom to top: base bands under the dado, cornice bands over it (the last is the coping). */
export interface TerraceProfile {
  base: readonly TerraceBand[];
  cornice: readonly TerraceBand[];
}

/**
 * Profiles by stage height. Khmer bases are symmetrical about the dado: the
 * bands step in from the plinth and back out to the coping. Bands are 0.25 m
 * (fillets 0.125 m); projections are on the texel grid.
 */
export const TERRACE_PROFILES = {
  /** Stages under 1.5 m: a plinth and a coping. */
  low: { base: [{ h: 0.25, out: 0.25 }], cornice: [{ h: 0.25, out: 0.25 }] },
  /** 1.5–3 m: plinth and step band, step band and coping. */
  mid: {
    base: [
      { h: 0.25, out: 0.25 },
      { h: 0.25, out: 0.125 },
    ],
    cornice: [
      { h: 0.25, out: 0.125 },
      { h: 0.25, out: 0.25 },
    ],
  },
  /** 3 m and more: plinth, step, fillet, torus, fillet — mirrored under the coping. */
  tall: {
    base: [
      { h: 0.25, out: 0.375 },
      { h: 0.25, out: 0.25 },
      { h: 0.125, out: 0.0625 },
      { h: 0.25, out: 0.1875 },
      { h: 0.125, out: 0.0625 },
    ],
    cornice: [
      { h: 0.125, out: 0.0625 },
      { h: 0.25, out: 0.1875 },
      { h: 0.125, out: 0.0625 },
      { h: 0.25, out: 0.25 },
      { h: 0.25, out: 0.375 },
    ],
  },
} as const satisfies Record<string, TerraceProfile>;

/** The profile for a stage of height h (it always leaves at least a quarter metre of dado). */
export function profileFor(h: number): TerraceProfile {
  if (h >= 3) return TERRACE_PROFILES.tall;
  if (h >= 1.5) return TERRACE_PROFILES.mid;
  if (h >= 0.75) return TERRACE_PROFILES.low;
  return { base: [], cornice: [{ h: 0.25, out: 0.125 }] };
}

/** A band of dark recessed niches along a stage's dado (the sheet's upper terrace): blind windows with balusters. */
export interface TerraceNiches {
  /** Clear width of a niche (default 1.0 m). */
  width?: number;
  /** Centre-to-centre spacing (default 1.5 m); niches keep 0.5 m clear of the corners. */
  bay?: number;
  /** How deep they are cut into the dado (default 0.375 m, at most `skin` − 0.125). */
  depth?: number;
  /** Balusters standing in each niche (default 3; 0 = plain dark niches). */
  balusters?: number;
}

export interface TerraceStage {
  /** Height of the stage (metres, on the 1/16 m grid; 0.25 m steps read best). */
  height: number;
  /** How far its outline is set back from the stage below, on finished sides (default 1.0 m; ignored for stage 0). */
  setback?: number;
  /** Moulding profile (default `profileFor(height)`). */
  profile?: TerraceProfile;
  /** A band of niches in the dado. */
  niches?: boolean | TerraceNiches;
}

/** A span of a side's face left for a stair (see the placement contract). */
export interface TerraceGap {
  side: TerraceSide;
  /** Centre along the side (u, metres; default 0 = the middle). */
  at?: number;
  /** Width of the gap (metres, on the texel grid). */
  width: number;
  /** How far behind the stage's outline the plain face is laid (default 0; at most relief + `skin` − 0.125). */
  depth?: number;
  /** Stages it cuts (default all). */
  stages?: readonly number[];
}

/** Paving of the tops. */
export interface TerracePaving {
  /** Depth of a row of slabs along z (default 0.75 m). */
  row?: number;
  /** Slab length range along x (default 0.5–1.25 m). */
  length?: [number, number];
  /** Square slabs `row` × `row` in straight lines (stack bond), like a laid court, instead of running bond. */
  grid?: boolean;
  /** Paving on the treads of the lower stages too (default true). */
  treads?: boolean;
}

/** Age and nature on a terrace (defaults follow the finish; 0‥1 unless said). */
export interface TerraceWeather {
  /** Moss cushions on the ledges and treads, moss in the paving joints. */
  moss?: number;
  /** Grass tufts in the joints of ledges and paving. */
  grass?: number;
  /** Dark run-off grime under the cornices. */
  streaks?: number;
  /** Dado stones knocked out (count). */
  missing?: number;
  /** Dado stones split by a crack (count). */
  cracked?: number;
  /** Share of paving slabs gone, soil and grass in their place. */
  lost?: number;
}

export interface TerraceOptions {
  /** Footprint along x and z (metres; the 2 m grid tiles best). */
  width: number;
  depth: number;
  /** Stages bottom to top. */
  stages: readonly TerraceStage[];
  finish: StoneFinish;
  seed: number;
  /** Sides with a finished face (default all four); the others run flush to the footprint edge. */
  sides?: readonly TerraceSide[];
  gaps?: readonly TerraceGap[];
  paving?: TerracePaving;
  weather?: TerraceWeather;
  /** Depth of the facing stones behind the dado plane (default 0.5 m). */
  skin?: number;
  /** Stone lengths along the courses: dado and bands, coping (defaults [0.75, 1.25], [0.5, 1.0]). */
  stones?: { face?: [number, number]; coping?: [number, number] };
  /**
   * Lay the stones into this masonry and don't emit it: the caller adds its own
   * stones (posts, stairs…) and calls `masonry.emit(p.voxels)` itself.
   */
  masonry?: DryMasonry;
  /** Areas (piece-space boxes) the caller builds on — posts, balustrades, statues: no moss or grass goes there. */
  clear?: readonly Box6[];
}

/** Where one stage ended up (side values are the side frame's n). */
export interface TerraceStageInfo {
  y0: number;
  /** The walkable top of the stage. */
  y1: number;
  /** Outer faces of plinth and coping. */
  outline: SideValues;
  /** The dado plane. */
  dado: SideValues;
  /** The inner plane: back of the facing stones. */
  inner: SideValues;
  /**
   * The coping's inner face, where the paving starts: the inner plane, or —
   * where the tread in front of the stage above is too narrow to pave — that
   * stage's outline (the coping stones then run back under it).
   */
  rim: SideValues;
}

/** A stage's top edge on one finished side, for parapets, balustrades, posts. */
export interface TerraceEdge {
  side: TerraceSide;
  stage: number;
  /** Level of the top (walkable) at the edge. */
  y: number;
  /** Quarter turns facing a +Z module out over this side. */
  turn: number;
  /** n of the rim's outer face (the stage outline) and of its inner face (`rim`, where the paving starts). */
  outer: number;
  inner: number;
  /** Spans along the side (u, left → right from outside) over the whole outline, gaps taken out. */
  spans: [number, number][];
}

export interface TerraceInfo {
  /** The body's walkable top (the last stage's y1). */
  top: number;
  stages: TerraceStageInfo[];
  edges: TerraceEdge[];
  /** The masonry the stones were laid in (already emitted unless `masonry` was passed). */
  masonry: DryMasonry;
}

/** A +Z-facing module's placement on an edge: centred at u along it, its origin `inset` behind the rim's outer face. */
export function edgePlacement(e: TerraceEdge, u: number, inset = 0): Placement {
  const [x, z] = turnXZ(u, e.outer - inset, e.turn);
  return { x, y: e.y, z, turn: e.turn };
}

/** A terrace body as a lone kit piece (see {@link terrace}). */
export function terracePiece(o: TerraceOptions): KitPiece {
  const p = new PieceBuilder();
  terrace(p, o);
  return p.done();
}

interface Laid {
  side: TerraceSide;
  stones: Stone[];
}

/** Build a terrace body into `p` (see the placement contract at the top of this file). */
export function terrace(p: PieceBuilder, o: TerraceOptions): TerraceInfo {
  const f = o.finish;
  const seed = o.seed;
  const fin = new Set<TerraceSide>(o.sides ?? TERRACE_SIDES);
  const skin = snap(o.skin ?? 0.5);
  const m = o.masonry ?? new DryMasonry(seed);
  const w = {
    moss: o.weather?.moss ?? (f.surf[0] >= 0.4 ? f.surf[0] : 0),
    grass: o.weather?.grass ?? 0,
    streaks: o.weather?.streaks ?? (f.surf[3] >= 0.2 ? f.surf[3] : 0),
    missing: o.weather?.missing ?? 0,
    cracked: o.weather?.cracked ?? (f.surf[2] >= 0.3 ? 2 : 0),
    lost: o.weather?.lost ?? 0,
  };
  const faceLen = o.stones?.face ?? [0.75, 1.25];
  const copeLen = o.stones?.coping ?? [0.5, 1.0];

  // Stone looks: the finish, with grime running down from under each coping.
  const base = finishLook(f, seed, { moss: w.moss * 0.1 });
  let stageY: [number, number] = [0, 1];
  const look = (x: number, y: number, z: number): StoneLook => {
    const l = base(x, y, z);
    if (w.streaks <= 0) return l;
    const band = valueNoise3((x - z) * 1.4, 0.5, 0.5, seed + 23);
    const high = clamp01((y - stageY[0]) / Math.max(0.5, stageY[1] - stageY[0]));
    const s = clamp01((band - 0.5) * 3.5) * w.streaks * (0.45 + 0.55 * high);
    return s > l.surf[3] ? { ...l, surf: [l.surf[0], l.surf[1], l.surf[2], s] } : l;
  };

  // ── Stages: outline, dado and inner planes ────────────────────────────────
  const W = snap(o.width);
  const D = snap(o.depth);
  const foot: SideValues = { front: D / 2, back: D / 2, left: W / 2, right: W / 2 };
  const stages: (TerraceStageInfo & { profile: TerraceProfile; niches?: Required<TerraceNiches>; drips: Map<TerraceSide, Box6[]> })[] = [];
  let y = 0;
  o.stages.forEach((st, k) => {
    const h = snap(st.height);
    let profile = st.profile ?? profileFor(h);
    const sum = (bs: readonly TerraceBand[]) => bs.reduce((a, b) => a + b.h, 0);
    if (sum(profile.base) + sum(profile.cornice) > h - 0.25 + 1e-6) profile = profileFor(Math.min(h, 1.25));
    const relief = Math.max(0, ...profile.base.map((b) => b.out), ...profile.cornice.map((b) => b.out));
    const prev = k ? stages[k - 1].outline : foot;
    const per = (fn: (s: TerraceSide) => number) => Object.fromEntries(TERRACE_SIDES.map((s) => [s, fn(s)])) as SideValues;
    const outline = per((s) => (fin.has(s) ? (k ? prev[s] - snap(st.setback ?? 1) : foot[s]) : foot[s]));
    const dado = per((s) => (fin.has(s) ? outline[s] - relief : outline[s]));
    const inner = per((s) => (fin.has(s) ? dado[s] - skin : outline[s]));
    const n = st.niches === true ? {} : st.niches || undefined;
    const niches = n ? { width: n.width ?? 1, bay: n.bay ?? 1.5, depth: Math.min(n.depth ?? 0.375, skin - 0.125), balusters: n.balusters ?? 2 } : undefined;
    stages.push({ y0: y, y1: y + h, outline, dado, inner, rim: { ...inner }, profile, niches, drips: new Map() });
    y += h;
  });
  // A tread too narrow for a row of slabs is all coping.
  stages.forEach((st, k) => {
    const up = stages[k + 1];
    if (up) for (const s of TERRACE_SIDES) if (fin.has(s) && st.inner[s] - up.outline[s] < 0.5) st.rim[s] = Math.min(st.inner[s], up.outline[s]);
  });
  const top = y;

  // Gap spans per stage and side (u), with the plane their plain face stands on.
  const gapsOf = (k: number, s: TerraceSide) =>
    (o.gaps ?? [])
      .filter((g) => g.side === s && fin.has(s) && (!g.stages || g.stages.includes(k)))
      .map((g) => {
        const at = g.at ?? 0;
        const st = stages[k];
        return { a: snap(at - g.width / 2), b: snap(at + g.width / 2), depth: Math.max(0, Math.min(snap(g.depth ?? 0), st.outline[s] - st.rim[s] - 0.125)) };
      });

  // Where the caller builds: no moss or grass there.
  const clear = o.clear ?? [];
  const isClear = (x: number, y: number, z: number) => clear.some((b) => x > b[0] - T && x < b[3] + T && z > b[2] - T && z < b[5] + T && y > b[1] - 0.25 && y < b[4]);
  /** Spans along side s (u) that a clear box covers over n0‥n1 at level y. */
  const clearU = (s: TerraceSide, y: number, n0: number, n1: number): [number, number][] =>
    clear
      .filter((b) => y > b[1] - 0.25 && y < b[4] + T && nSpan(s, b)[1] > n0 - T && nSpan(s, b)[0] < n1 + T)
      .map((b) => {
        const [a, c] = uSpan(s, b);
        return [a - T, c + T];
      });

  const mr = rng(seed * 5 + 9);
  const ledges = new Map<TerraceSide, Ledge[]>(TERRACE_SIDES.map((s) => [s, []]));
  const faceStones: Laid[] = [];
  const dadoStones: Laid[] = [];
  /** Interior boundaries of a run of stones along the side (u), for grass in the joints. */
  const jointsOf = (side: TerraceSide, stones: readonly Stone[]) => {
    const us = stones.flatMap((s) => uSpan(side, s.box));
    const [lo, hi] = [Math.min(...us), Math.max(...us)];
    return [...new Set(us.map((u) => Math.round(u * 16) / 16))].filter((u) => u > lo + 1e-6 && u < hi - 1e-6);
  };

  stages.forEach((st, k) => {
    stageY = [st.y0, st.y1];
    const { profile } = st;
    const dadoH = st.y1 - st.y0 - profile.base.reduce((a, b) => a + b.h, 0) - profile.cornice.reduce((a, b) => a + b.h, 0);
    type B = TerraceBand & { kind: 'base' | 'dado' | 'cornice' };
    const bands: B[] = [
      ...profile.base.map((b) => ({ ...b, kind: 'base' as const })),
      ...(dadoH > T / 2 ? coursesOf(dadoH).map((h) => ({ h, out: 0, kind: 'dado' as const })) : []),
      ...profile.cornice.map((b) => ({ ...b, kind: 'cornice' as const })),
    ];
    const dado0 = st.y0 + profile.base.reduce((a, b) => a + b.h, 0);
    const dado1 = dado0 + Math.max(0, dadoH);
    // Niche spans along each finished side (u), clear of the corners and the gaps.
    const niches = new Map<TerraceSide, [number, number][]>();
    if (st.niches && dadoH >= 0.5) {
      const nz = st.niches;
      for (const s of TERRACE_SIDES) {
        if (!fin.has(s)) continue;
        const [L, R] = ends(s);
        const [lo, hi] = [-st.dado[L], st.dado[R]];
        const count = Math.max(0, Math.floor((hi - lo - 1 - nz.width) / nz.bay) + 1);
        const c0 = (lo + hi) / 2;
        const gaps = gapsOf(k, s);
        const spans: [number, number][] = [];
        for (let i = 0; i < count; i++) {
          const c = c0 + (i - (count - 1) / 2) * nz.bay;
          const [a, b] = [snap(c - nz.width / 2), snap(c + nz.width / 2)];
          if (!gaps.some((g) => b > g.a - 0.25 && a < g.b + 0.25)) spans.push([a, b]);
        }
        niches.set(s, spans);
      }
    }
    const firstCornice = bands.findIndex((b) => b.kind === 'cornice');

    let yb = st.y0;
    bands.forEach((b, j) => {
      const row = j + k * 5;
      const next = bands[j + 1];
      const prev = bands[j - 1];
      const outer = (s: TerraceSide, band: B | undefined = b) => (fin.has(s) ? st.dado[s] + (band ? band.out : 0) : st.outline[s]);
      const frontBackOwn = row % 2 === 0;
      const coping = j === bands.length - 1;
      for (const s of TERRACE_SIDES) {
        if (!fin.has(s)) continue;
        const [L, R] = ends(s);
        const owns = (s === 'front' || s === 'back') === frontBackOwn;
        const back = coping ? st.rim : st.inner;
        const u0 = -(owns || !fin.has(L) ? outer(L) : back[L]);
        const u1 = owns || !fin.has(R) ? outer(R) : back[R];
        const gaps = gapsOf(k, s);
        const inNiche = b.kind === 'dado' && niches.has(s);
        const bandLook =
          b.shade === undefined
            ? look
            : (x: number, y: number, z: number): StoneLook => {
                const l = look(x, y, z);
                return { ...l, shade: (l.shade ?? 1) * b.shade! };
              };
        const holes: [number, number][] = [...gaps.map((g): [number, number] => [g.a, g.b]), ...(inNiche ? niches.get(s)! : [])];
        const lintels = j === firstCornice ? (niches.get(s) ?? []) : [];
        let closed = IN_FACE[s];
        if (j === 0 || !prev || b.out <= prev.out + 1e-6) closed |= FACE.ny;
        if (next && next.out >= b.out - 1e-6) closed |= FACE.py;
        const laid: Stone[] = [];
        for (const [a, c] of spansOf(u0, u1, holes)) {
          const opts: CourseOptions = {
            axis: along(s),
            face: OUT_FACE[s],
            length: coping ? copeLen : faceLen,
            row,
            closed,
            look: bandLook,
            fixed: lintels.map(([p0, p1]) => {
              const [fa, fb] = axisSpan(s, p0 - 0.125, p1 + 0.125);
              return { a: fa, b: fb, proud: 0 };
            }),
            openBelow: lintels.map(([p0, p1]) => axisSpan(s, p0, p1)),
          };
          laid.push(...m.course(sideBox(s, a, c, yb, yb + b.h, back[s], outer(s)), opts));
        }
        if (!laid.length) continue;
        faceStones.push({ side: s, stones: laid });
        if (b.kind === 'dado') dadoStones.push({ side: s, stones: laid.filter((q) => !holes.some(([a, c]) => uSpan(s, q.box)[1] > a - 0.125 && uSpan(s, q.box)[0] < c + 0.125)) });
        // Ledges: the top of a band standing out further than the one above, and the coping.
        const ledgeEnd = (e: TerraceSide) => (fin.has(e) ? (s === 'front' || s === 'back' ? outer(e) : coping ? st.rim[e] : outer(e, next)) : st.outline[e]);
        const lu0 = -ledgeEnd(L);
        const lu1 = ledgeEnd(R);
        // (not the ends of the runs at a gap or a niche)
        const joints = jointsOf(s, laid).filter((u) => !holes.some(([p0, p1]) => Math.abs(u - p0) < 1e-6 || Math.abs(u - p1) < 1e-6));
        if (coping || (next && next.out < b.out - 1e-6)) {
          const z0 = coping ? st.rim[s] : outer(s, next);
          const off: [number, number][] = [...gaps.map((g): [number, number] => [g.a, g.b]), ...clearU(s, yb + b.h, z0, outer(s))];
          for (const [a, c] of spansOf(lu0, lu1, off)) ledges.get(s)!.push({ x0: a, x1: c, y: yb + b.h, z0, z1: outer(s), joints: joints.filter((u) => u > a && u < c) });
        } else if (w.moss > 0 && b.h >= 0.25) {
          // Moss creeping down the upright joints from the course above (side frame: x = u, z = n).
          const list = st.drips.get(s) ?? [];
          st.drips.set(s, list);
          for (const u of joints) {
            if (!mr.chance(w.moss * 0.3)) continue;
            const x = mr.chance(0.5) ? u - T : u;
            const len = snap(Math.min(b.h - T, mr.range(0.125, 0.5)));
            list.push([x, yb + b.h - len, outer(s), x + T, yb + b.h, outer(s) + T / 2]);
          }
        }
      }
      yb += b.h;
    });

    // Gaps: a plain face at the dado plane (or behind it), foot to top.
    for (const s of TERRACE_SIDES)
      for (const g of gapsOf(k, s)) {
        const cut = st.outline[s] - g.depth;
        m.wall(sideBox(s, g.a, g.b, st.y0, st.y1, st.rim[s], cut), coursesOf(st.y1 - st.y0), { axis: along(s), face: OUT_FACE[s], length: faceLen, closed: FACE.ny | IN_FACE[s], row: k, look });
      }

    // Niches: blind windows — a dark back, dark linings two texels in from the
    // face (so each reveal keeps a lit arris), balusters standing near the front.
    const src = here();
    for (const [s, spans] of niches) {
      const nz = st.niches!;
      const d = st.dado[s];
      const back = d - nz.depth;
      const { toPiece } = sideFrame(s);
      const dark = (u0: number, u1: number, y0: number, y1: number, n0: number, n1: number, i: number) => {
        const b = sideBox(s, u0, u1, y0, y1, n0, n1);
        p.voxels.span(b[0], b[1], b[2], b[3], b[4], b[5], SANDSTONE.cavity[i % SANDSTONE.cavity.length], 'sandstone', { shade: 0.42, open: 0, src });
      };
      spans.forEach(([a, c], i) => {
        m.course(sideBox(s, a, c, dado0, dado1, st.inner[s], back), {
          axis: along(s),
          face: OUT_FACE[s],
          length: [4, 4],
          closed: FACE.ny | FACE.py | IN_FACE[s],
          look: () => ({ color: SANDSTONE.cavity[i % SANDSTONE.cavity.length], surf: stoneSurf({ stain: 0.3 }), shade: 0.5 }),
        });
        dark(a, a + T, dado0, dado1, back, d - 2 * T, i);
        dark(c - T, c, dado0, dado1, back, d - 2 * T, i + 1);
        dark(a + T, c - T, dado1 - T, dado1, back, d - 2 * T, i + 2);
        dark(a + T, c - T, dado0, dado0 + T, back, d - 2 * T, i);
        for (let q = 0; q < nz.balusters; q++) {
          const [bx, bz] = toPiece(a + ((q + 0.5) * (c - a)) / nz.balusters, d - 3 * T);
          baluster(p.voxels, bx, dado0 + T, dado1 - T, bz, f.palette, f.surf, seed + k * 97 + i * 7 + q);
        }
      });
    }

    // The core: the hidden fill inside the facing, under the paving.
    const cx0 = -st.inner.left;
    const cx1 = st.inner.right;
    const cz0 = -st.inner.back;
    const cz1 = st.inner.front;
    p.voxels.span(cx0 + HAIR, st.y0, cz0 + HAIR, cx1 - HAIR, st.y1 - 0.25, cz1 - HAIR, JOINT, 'sandstone', { open: 0, src: here() });
  });

  // ── Paving ─────────────────────────────────────────────────────────────────
  const tufts: [number, number, number][] = [];
  stages.forEach((st, k) => {
    const up = stages[k + 1];
    if (up && o.paving?.treads === false) return;
    const A = st.rim;
    const jA = (s: TerraceSide) => fin.has(s);
    // (the slabs keep less of the finish's moss than the walls: on the sheet it sits in the joints)
    const lookP = finishLook({ ...f, surf: [f.surf[0] * 0.6, f.surf[1], f.surf[2], f.surf[3]] }, seed + 31 + k, { moss: w.moss * 0.1 });
    const keep = (x: number, z: number) => !isClear(x, st.y1, z) && (!up || x < -up.outline.left - 0.5 || x > up.outline.right + 0.5 || z < -up.outline.back - 0.5 || z > up.outline.front + 0.5);
    const pave = (x0: number, z0: number, x1: number, z1: number, joint: [boolean, boolean, boolean, boolean]) =>
      paveRect(p, { x0, z0, x1, z1, joint, y: st.y1, paving: o.paving, look: lookP, moss: w.moss, lost: w.lost, grass: w.grass, seed: seed + 41 + k * 13, tufts, keep });
    if (!up) {
      pave(-A.left, -A.back, A.right, A.front, [jA('left'), jA('right'), jA('back'), jA('front')]);
      return;
    }
    const H = up.outline;
    // The tread around the stage above: front and back strips the full width, left and right between them.
    if (A.front - H.front >= 0.25) pave(-A.left, H.front, A.right, A.front, [jA('left'), jA('right'), true, jA('front')]);
    if (A.back - H.back >= 0.25) pave(-A.left, -A.back, A.right, -H.back, [jA('left'), jA('right'), jA('back'), true]);
    if (A.left - H.left >= 0.25) pave(-A.left, -H.back, -H.left, H.front, [jA('left'), true, false, false]);
    if (A.right - H.right >= 0.25) pave(H.right, -H.back, A.right, H.front, [true, jA('right'), false, false]);
    // The floor of a recessed gap in the stage above.
    for (const s of TERRACE_SIDES)
      for (const g of gapsOf(k + 1, s)) {
        if (g.depth < 0.125) continue;
        const b = sideBox(s, g.a, g.b, 0, 0, H[s] - g.depth, H[s]);
        const inward: Record<TerraceSide, [boolean, boolean, boolean, boolean]> = {
          front: [true, true, true, false],
          back: [true, true, false, true],
          right: [true, false, true, true],
          left: [false, true, true, true],
        };
        pave(b[0], b[2], b[3], b[5], inward[s]);
      }
  });

  // Age: dado stones knocked out or split, arrises chipped.
  const dr = rng(seed * 13 + 5);
  const pool = dadoStones.flatMap((l) => l.stones).filter((s) => s.box[4] - s.box[1] >= 0.375 && Math.max(s.box[3] - s.box[0], s.box[5] - s.box[2]) >= 0.5);
  const pick = () => pool.splice(dr.int(0, pool.length - 1), 1)[0];
  for (let q = 0; q < w.cracked && pool.length; q++) m.crack(pick(), dr.int(1, 1e6));
  for (let q = 0; q < w.missing && pool.length; q++) m.knockOut(pick(), 0.375);
  for (const l of faceStones) for (const s of l.stones) if (!s.crack && !s.gone && dr.chance(f.wear * 0.6)) m.chip(s, dr.int(1, 1e6));
  if (!o.masonry) m.emit(p.voxels);

  // ── Overgrowth: moss and grass on the ledges, moss at the foot of each stage ──
  const target = { voxels: p.voxels };
  for (const s of TERRACE_SIDES) {
    if (!fin.has(s)) continue;
    const tmp = new PieceBuilder();
    const ls = ledges.get(s)!;
    if (ls.length && (w.moss > 0 || w.grass > 0)) overgrow(tmp, ls, w.moss, w.grass, seed + turnOf(s) * 101);
    // Moss creeping out from the foot of each stage over the tread below it.
    if (w.moss > 0)
      stages.forEach((st, k) => {
        const below = stages[k - 1];
        if (!below || below.outline[s] - st.outline[s] < 0.625) return;
        const [L, R] = ends(s);
        const spans = spansOf(-st.outline[L], st.outline[R], [...gapsOf(k, s).map((g): [number, number] => [g.a, g.b]), ...clearU(s, st.y0, st.outline[s], st.outline[s] + 0.5)]);
        footMoss(tmp, { spans, y: st.y0, n: st.outline[s], reach: Math.min(0.5, below.outline[s] - st.outline[s] - 0.375), amount: w.moss, seed: seed + k * 17 + turnOf(s) });
      });
    const src = here();
    for (const st of stages) for (const b of st.drips.get(s) ?? []) tmp.voxels.span(b[0], b[1], b[2], b[3], b[4], b[5], mr.pick(JOINT_MOSS), 'leaves', { shade: 0.9, src });
    if (tmp.voxels.boxes.length) placePiece(target, tmp.done(), { x: 0, y: 0, z: 0, turn: turnOf(s) });
  }
  if (tufts.length) tuftsAt(p, tufts, seed + 77);

  // ── Colliders: a solid box per stage, the gaps cut out ────────────────────
  const edges: TerraceEdge[] = [];
  stages.forEach((st, k) => {
    let boxes: Box6[] = [[-st.outline.left, 0, -st.outline.back, st.outline.right, st.y1, st.outline.front]];
    for (const s of TERRACE_SIDES) {
      const [L, R] = ends(s);
      const gaps = gapsOf(k, s);
      for (const g of gaps) {
        const cut = sideBox(s, g.a, g.b, -1, st.y1 + 1, st.outline[s] - g.depth, st.outline[s] + 1);
        boxes = boxes.flatMap((b) => subtractBox(b, cut));
      }
      if (fin.has(s))
        edges.push({
          side: s,
          stage: k,
          y: st.y1,
          turn: turnOf(s),
          outer: st.outline[s],
          inner: st.rim[s],
          spans: spansOf(-st.outline[L], st.outline[R], gaps.map((g) => [g.a, g.b])),
        });
    }
    for (const b of boxes) p.collider(b[0], b[1], b[2], b[3], b[4], b[5]);
  });

  return { top, stages: stages.map(({ y0, y1, outline, dado, inner, rim }) => ({ y0, y1, outline, dado, inner, rim })), edges, masonry: m };
}

interface PaveOptions {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Which sides (−x, +x, −z, +z) meet stone (a joint a texel wide) rather than run flush to an open edge. */
  joint: [boolean, boolean, boolean, boolean];
  /** Walkable level (the slabs' tops). */
  y: number;
  paving?: TerracePaving;
  look: (x: number, y: number, z: number) => StoneLook;
  moss: number;
  lost: number;
  grass: number;
  seed: number;
  /** Collects grass tufts rooted in the joints (x, y, z). */
  tufts: [number, number, number][];
  /** Where tufts may grow. */
  keep: (x: number, z: number) => boolean;
}

/** Moss tones for the joints: the sheet's yellow-green in the cracks between slabs. */
const JOINT_MOSS = [MOSS[0], MOSS[2], MOSS[4], 0x8a9a3e, 0x7d9038] as const;

/**
 * Pave a rectangle with 0.25 m slabs in rows along x (running bond, or a
 * straight grid), each a texel short of the next: the joints read as dark
 * lines over a dark bed, some filled with moss, grass rooting in others;
 * lost slabs leave soil and grass a hand lower.
 */
function paveRect(p: PieceBuilder, o: PaveOptions): void {
  const r = rng(o.seed);
  const v = p.voxels;
  const src = here();
  const grid = !!o.paving?.grid;
  const rowD = snap(o.paving?.row ?? (grid ? 1 : 0.75));
  const [l0, l1] = o.paving?.length ?? [0.5, 1.25];
  const [jx0, jx1, jz0, jz1] = o.joint;
  // The slabs' area: a texel in from the sides that meet stone.
  const X0 = o.x0 + (jx0 ? T : 0);
  const X1 = o.x1 - (jx1 ? T : 0);
  const Z0 = o.z0 + (jz0 ? T : 0);
  const Z1 = o.z1 - (jz1 ? T : 0);
  if (X1 - X0 < 2 * T || Z1 - Z0 < 2 * T) return;
  const y = o.y;
  const PT = 0.25;
  // The bed under the joints, reaching a hair under the stone around (open edges: a hair short).
  let bed: Box6[] = [[o.x0 - (jx0 ? HAIR : -HAIR), y - PT, o.z0 - (jz0 ? HAIR : -HAIR), o.x1 + (jx1 ? HAIR : -HAIR), y - HAIR, o.z1 + (jz1 ? HAIR : -HAIR)]];
  // Rows (and a grid's columns) share the length out evenly, on the texel grid.
  const even = (a: number, b: number, size: number) => {
    const n = Math.max(1, Math.round((b - a) / size));
    return Array.from({ length: n + 1 }, (_, i) => (i === n ? b : snap(a + ((b - a) * i) / n)));
  };
  const rows = even(Z0, Z1, rowD);
  const columns = grid ? even(X0, X1, rowD) : [];
  for (let n = 0; n + 1 < rows.length; n++) {
    const [z, zb] = [rows[n], rows[n + 1]];
    const lastRow = n + 2 === rows.length;
    const ze = lastRow ? zb : zb - T;
    const cuts: number[] = grid ? columns : [X0];
    let x = X0;
    if (!grid && n % 2 === 1) {
      const part = snap(((l0 + l1) / 4) * (0.8 + 0.4 * hash3(n, 1, 3, o.seed)));
      if (X1 - x - part >= l0 * 0.5) cuts.push((x += part));
    }
    for (let i = 0; !grid && x < X1 - 1e-6; i++) {
      let len = snap(l0 + (l1 - l0) * hash3(n, i, 7, o.seed));
      if (X1 - (x + len) < l0 * 0.5) len = X1 - x;
      x = Math.min(X1, x + len);
      cuts.push(x);
    }
    for (let i = 0; i + 1 < cuts.length; i++) {
      const [xa, xb] = [cuts[i], cuts[i + 1]];
      const last = i + 2 === cuts.length;
      const xe = last ? xb : xb - T;
      const [cx, cz] = [(xa + xe) / 2, (z + ze) / 2];
      if (o.lost > 0 && r.chance(o.lost) && xe - xa > 0.3) {
        // A lost slab: soil a hand lower, grassed over, the bed cut away under it.
        const hole: Box6 = [xa, y - PT, z, xb, y, zb];
        bed = bed.flatMap((b) => subtractBox(b, hole));
        v.span(xa, y - PT - 0.125, z, xe, y - 0.125, ze, SOIL.dirt[i % SOIL.dirt.length], 'soil', { surf: soilSurf({ grass: 0.85, moss: 0.3 }), src });
        if (o.keep(cx, cz)) o.tufts.push([cx + r.range(-0.1, 0.1), y - 0.125, cz + r.range(-0.1, 0.1)]);
        continue;
      }
      const lk = o.look(cx, y, cz);
      v.span(xa, y - PT, z, xe, y, ze, lk.color, 'sandstone', { shade: lk.shade, surf: lk.surf, src });
      // Moss filling the joint beside it, now and then; grass rooting in another.
      if (!last && r.chance(o.moss * 0.5)) {
        const a = snap(r.range(z, Math.max(z, ze - 0.25)));
        v.span(xe, y - 2 * T, a, xb, y, Math.min(ze, a + snap(r.range(0.25, 0.75))), r.pick(JOINT_MOSS), 'leaves', { shade: 0.95, src });
      } else if (!last && o.keep(xe + T / 2, cz) && r.chance(o.grass * 0.3)) o.tufts.push([xe + T / 2, y, snap(r.range(z + 0.1, ze - 0.1)) + T / 2]);
      if (!lastRow && r.chance(o.moss * 0.45)) {
        const a = snap(r.range(xa, Math.max(xa, xe - 0.25)));
        v.span(a, y - 2 * T, ze, Math.min(xe, a + snap(r.range(0.25, 0.75))), y, zb, r.pick(JOINT_MOSS), 'leaves', { shade: 0.95, src });
      } else if (!lastRow && o.keep(cx, ze + T / 2) && r.chance(o.grass * 0.2)) o.tufts.push([snap(r.range(xa + 0.1, xe - 0.1)) + T / 2, y, ze + T / 2]);
    }
  }
  for (const b of bed) if (b[3] - b[0] > 1e-6 && b[5] - b[2] > 1e-6) v.span(b[0], b[1], b[2], b[3], b[4], b[5], JOINT, 'sandstone', { open: 4, src });
}

/** Moss tones on the treads: olive to the sheets' bright yellow-green. */
const TREAD_MOSS = [0x607339, 0x6d833f, 0x788741, 0x8a9a3e, 0x495d30] as const;

/**
 * Moss creeping out from the foot of a stage over the tread below it, in the
 * side frame (x = u, z = n, the stage's face at z = n facing +z): cushions a
 * texel or two thick, reaching up to `reach` out, a lump here and there.
 */
function footMoss(p: PieceBuilder, o: { spans: [number, number][]; y: number; n: number; reach: number; amount: number; seed: number }): void {
  const r = rng(o.seed);
  const v = p.voxels;
  const src = here();
  for (const [s0, s1] of o.spans) {
    // (cushions side by side, never overlapping: overlapping tops would flicker)
    for (let x = s0 + r.range(0, 0.4); x < s1 - 0.2; x += r.range(0.25, 0.8)) {
      if (!r.chance(o.amount * 0.8)) continue;
      const xa = snap(x);
      const len = snap(Math.min(s1 - xa, r.range(0.25, 0.9)));
      const d = snap(Math.min(o.reach, r.range(0.125, 0.45)));
      if (len < 2 * T || d < T) continue;
      x = xa + len;
      const c = () => TREAD_MOSS[r.int(0, TREAD_MOSS.length - 1)];
      v.span(xa, o.y, o.n, xa + len, o.y + T, o.n + d, c(), 'leaves', { src });
      if (len > 3 * T) v.span(xa + T, o.y + T, o.n, xa + len - T, o.y + 2 * T, o.n + Math.max(T, Math.min(d - T, 2 * T)), c(), 'leaves', { shade: 1.05, src });
    }
  }
}

/** Grass tufts rooted at points (x, root level y, z), in one texel grid: mostly "+" tufts, some fuller. */
function tuftsAt(p: PieceBuilder, at: readonly [number, number, number][], seed: number): void {
  const r = rng(seed);
  const ox = snap(Math.min(...at.map((a) => a[0]))) - 1;
  const oz = snap(Math.min(...at.map((a) => a[2]))) - 1;
  const g = grassGrid(p, [ox, 0, oz], seed);
  for (const [x, y, z] of at) {
    const i = Math.floor((x - ox) / T);
    const k = Math.floor((z - oz) / T);
    const j = Math.round(y / T);
    ghostGround(g, i - 2, k - 2, i + 2, k + 2, j);
    const tones = r.chance(0.6) ? GRASS_TONES.meadow : GRASS_TONES.lawn;
    if (r.chance(0.35)) grassTuft(g, i, k, { j, height: r.int(3, 6), radius: r.pick([1, 1.4]), arms: 0.4, seed: r.int(1, 1e6), tones });
    else plusTuft(g, i, k, { j, height: r.int(2, 5), seed: r.int(1, 1e6), tones });
  }
  commitGrass(p, g, { seed });
}
