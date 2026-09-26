import { BlockSet } from '../../BlockSet';
import { DryMasonry, FACE, finishLook, overgrow, type CourseOptions, type Ledge, type Stone } from '../../lib/gallery';
import { NAGA, NAGA_FINISH, nagaHead, nagaRun, type NagaLook } from '../../lib/naga';
import { PieceBuilder } from '../../PieceBuilder';
import { placePiece, type Placement } from '../../place';
import { rng, snap, TEXEL } from '../../shapes';
import type { VoxelBox } from '../../../voxel/VoxelBuilder';
import type { StoneFinish } from '../../surface';

/**
 * §16 terrace edges — the parapets that stand on a terrace's rim: the naga
 * balustrade (Angkor Wat's), the sheet's pierced post-and-rail parapet at a
 * real 1.0 m, and the naga body turning a corner (which lib/naga.ts lacks).
 *
 * Run frame (every parapet here): the parapet runs **along X**, its axis on
 * z = 0, standing on the walkway at y = 0; front = +Z. On a terrace rim it
 * stands with its axis {@link PARAPET_INSET} behind the rim's outer face —
 * `edgePlacement(edge, u, PARAPET_INSET)` from lib/terrace.ts puts it there.
 */

const T = TEXEL;

/**
 * How far behind a rim's outer face a parapet's axis stands: the naga's kerb
 * then starts 0.5 m in (on the dado plane of a 3.25 m wall), and the naga
 * fan's step block and halo (± 0.69 m) stay inside the outline.
 */
export const PARAPET_INSET = 0.75;

/**
 * The pierced parapet, at a real 1.0 m (SIZES-ARCH §1.3): a plinth, a sill,
 * a band of square openings between stubby piers, a heavy rail on top; posts
 * with a lotus-bud finial at the ends. Heights (y) and half depths (z) in m.
 */
export const PIERCED = {
  top: 1.0,
  plinth: [0, 0.25, 0.375],
  sill: [0.25, 0.375, 0.25],
  /** The openings: 0.375 m tall, 0.3125–0.375 m wide. */
  band: [0.375, 0.75],
  rail: [0.75, 1.0, 0.3125],
  /** Pier shaft half depth, and its base and cap (a texel each, standing out front and back). */
  pier: 0.125,
  pierCap: 0.1875,
  /** Post foot half width (it is square); the post's footprint is 0.875 m square. */
  foot: 0.4375,
  shaft: 0.375,
  /** Top of the post's cap (the collider); the finial rises to `postTop`. */
  cap: 1.375,
  postTop: 1.75,
} as const;

/**
 * A post's tiers bottom up: [y0, y1, half width, crossed]. Foot, a shaft of
 * two stones (the joint level with the rail's underside), a projecting cap,
 * then the lotus bud: a cushion, the bud cut as crossed boxes so it reads
 * round, a tip.
 */
const POST_TIERS: readonly [number, number, number, boolean?][] = [
  [0, 0.25, PIERCED.foot],
  [0.25, 0.75, PIERCED.shaft],
  [0.75, 1.25, PIERCED.shaft],
  [1.25, PIERCED.cap, PIERCED.foot],
  [PIERCED.cap, 1.4375, 0.25],
  [1.4375, 1.625, 0.1875, true],
  [1.625, 1.6875, 0.125],
  [1.6875, PIERCED.postTop, 0.0625],
];

/**
 * How a pierced run ends: `post` — a whole post, flush with the end;
 * `half` — the half of a post centred on the end (the next module brings the
 * other half, so tiled runs share one post per joint); `abut` — another
 * run's post stands just beyond the end (its foot touches it); `open` — the
 * courses run on to the end.
 */
export type PostEnd = 'post' | 'half' | 'abut' | 'open';

export interface PiercedOptions {
  /** The run's extent along x. */
  x0: number;
  x1: number;
  /** How the −X and +X ends finish. */
  ends: readonly [PostEnd, PostEnd];
  finish: StoneFinish;
  seed: number;
  /** Moss cushions on the rail, plinth and caps, 0‥1. */
  moss?: number;
  /** Grass in the joints, 0‥1. */
  grass?: number;
  /** Chipped arrises and knocked-out piers, 0‥1. */
  wear?: number;
}

/**
 * Openings and piers across a span of whole texels: openings of 5–6
 * texels, piers of at least 3, as near the sheet's 1.5 : 1 as the span
 * allows; the odd texels go to the piers from the middle out, so the band
 * stays symmetric. Returns the openings' [a, b] in texels from the start.
 */
function openings(span: number): [number, number][] {
  let best: { n: number; o: number; score: number } | undefined;
  for (let n = 1; n <= span / 8; n++)
    for (const o of [5, 6]) {
      const p = (span - n * o) / (n + 1);
      if (p < 3) continue;
      const score = Math.abs(o / p - 1.5) + Math.abs(p - 4) * 0.2;
      if (!best || score < best.score) best = { n, o, score };
    }
  if (!best) return [];
  const { n, o } = best;
  const piers = new Array<number>(n + 1).fill(Math.floor((span - n * o) / (n + 1)));
  let extra = span - n * o - piers.reduce((a, b) => a + b, 0);
  // (the middle pier first, then pairs outwards from the centre)
  const mid = n / 2;
  if (extra % 2 === 1 && Number.isInteger(mid)) (piers[mid]++, extra--);
  for (let k = 0; extra > 0; k++) {
    const i = Math.floor(mid - 0.5 - k);
    const j = Math.ceil(mid + 0.5 + k);
    if (i < 0) break;
    piers[i]++;
    if (--extra > 0) (piers[j]++, extra--);
  }
  const out: [number, number][] = [];
  let at = piers[0];
  for (let i = 0; i < n; i++) {
    out.push([at, at + o]);
    at += o + piers[i + 1];
  }
  return out;
}

/**
 * The sheet's pierced parapet, in the run frame (see the top of the file),
 * built into `p`: its stones are dry masonry in the terrace's finish.
 */
export function piercedParapet(p: PieceBuilder, o: PiercedOptions): void {
  const P = PIERCED;
  const m = new DryMasonry(o.seed);
  const look = finishLook(o.finish, o.seed + 3, { moss: (o.moss ?? 0) * 0.35 });
  const [x0, x1] = [snap(o.x0), snap(o.x1)];
  // Post centres at each end (a whole post sits flush inside the run, a half one on the end).
  const centre = (e: PostEnd, x: number, dir: 1 | -1) => (e === 'post' ? x + dir * P.foot : e === 'half' ? x : e === 'abut' ? x - dir * P.foot : undefined);
  const c0 = centre(o.ends[0], x0, 1);
  const c1 = centre(o.ends[1], x1, -1);
  // Where the courses stop: the posts' feet for the plinth, their shafts above.
  const stop = (c: number | undefined, x: number, half: number, dir: 1 | -1) => (c === undefined ? x : c + dir * half);
  const [f0, f1] = [stop(c0, x0, P.foot, 1), stop(c1, x1, P.foot, -1)];
  const [s0, s1] = [stop(c0, x0, P.shaft, 1), stop(c1, x1, P.shaft, -1)];
  const course = (a: number, b: number, [y0, y1, h]: readonly number[], length: [number, number], row: number, extra: Partial<CourseOptions> = {}) =>
    b - a > T ? m.course([a, y0, -h, b, y1, h], { length, row, closed: FACE.ny | FACE.py, look, ...extra }) : [];

  const plinth = course(f0, f1, P.plinth, [0.75, 1.25], 0, { closed: FACE.ny });
  course(s0, s1, P.sill, [0.5, 1.0], 1, { closed: FACE.ny });
  // The band of openings between the shafts, and the piers standing in it.
  const holes = openings(Math.round((s1 - s0) / T)).map(([a, b]): [number, number] => [s0 + a * T, s0 + b * T]);
  const piers: Stone[] = [];
  let a = s0;
  for (const [h0, h1] of [...holes, [s1, s1] as [number, number]]) {
    if (h0 - a > T) {
      course(a, h0, [P.band[0], P.band[0] + T, P.pierCap], [4, 4], 0);
      piers.push(...course(a, h0, [P.band[0] + T, P.band[1] - T, P.pier], [4, 4], 0));
      course(a, h0, [P.band[1] - T, P.band[1], P.pierCap], [4, 4], 0);
    }
    a = h1;
  }
  const rail = course(s0, s1, P.rail, [0.75, 1.25], 2, { closed: FACE.ny, openBelow: holes });

  // Posts: a whole one, or the half of one inside the run.
  const posts = [c0 !== undefined && o.ends[0] !== 'abut' ? c0 : undefined, c1 !== undefined && o.ends[1] !== 'abut' ? c1 : undefined].filter((c): c is number => c !== undefined);
  const span = (c: number, w: number): [number, number] => [Math.max(x0, c - w), Math.min(x1, c + w)];
  for (const c of posts) {
    POST_TIERS.forEach(([y0, y1, w, crossed], i) => {
      const [pa, pb] = span(c, w);
      const closed = FACE.ny | (i < POST_TIERS.length - 1 ? FACE.py : 0);
      if (crossed) {
        // The bud: two crossed stones, one a texel narrower each way.
        const [qa, qb] = span(c, w - T);
        m.course([qa, y0, -w, qb, y1, w], { length: [4, 4], closed, look });
        m.course([pa, y0, -(w - T), pb, y1, w - T], { length: [4, 4], closed, look });
      } else m.course([pa, y0, -w, pb, y1, w], { length: [4, 4], closed, look });
    });
    const [pa, pb] = span(c, P.foot);
    p.collider(pa, 0, -P.foot, pb, P.cap, P.foot);
  }

  // Age: chipped arrises; a worn parapet has lost a pier or two.
  const r = rng(o.seed * 7 + 1);
  const wear = o.wear ?? 0;
  for (const s of m.stones) if (r.chance(wear * 0.35 + 0.03)) m.chip(s, r.int(1, 1e6));
  if (wear > 0.3) for (const s of piers) if (r.chance(wear * 0.25)) m.knockOut(s, 0.25);
  m.emit(p.voxels);

  // Moss on the rail, the plinth's front ledge and the caps; grass in their joints.
  const joints = (stones: readonly Stone[]) => stones.slice(1).map((s) => s.box[0]);
  const ledges: Ledge[] = [
    { x0: s0, x1: s1, y: P.rail[1], z0: 0, z1: P.rail[2], joints: joints(rail) },
    { x0: f0, x1: f1, y: P.plinth[1], z0: P.sill[2], z1: P.plinth[2], joints: joints(plinth) },
    ...posts.map((c) => ({ x0: span(c, P.foot)[0], x1: span(c, P.foot)[1], y: P.cap, z0: P.foot - 0.1875, z1: P.foot, joints: [] })),
  ].filter((l) => l.x1 - l.x0 > 0.25);
  if ((o.moss ?? 0) > 0 || (o.grass ?? 0) > 0) overgrow(p, ledges, o.moss ?? 0, o.grass ?? 0, o.seed + 5);
  p.collider(x0, 0, -P.plinth[2], x1, P.top, P.plinth[2]);
}

/** A parapet built in the run frame, placed into `p` (e.g. at an `edgePlacement`). */
export function placeRun(p: PieceBuilder, at: Placement, build: (q: PieceBuilder) => void): void {
  const q = new PieceBuilder();
  build(q);
  placePiece({ voxels: p.voxels, collider: (c) => p.colliders.push(c) }, q.done(), at);
}

// ── The naga balustrade turning a corner ─────────────────────────────────────

/** Post tiers of the corner post: the run's posts a texel bigger all round, as under the tail's rising body. */
const CORNER_POST: readonly [number, number, number][] = [
  [NAGA.kerb, 0.3125, 0.25],
  [0.3125, 0.5, 0.1875],
  [0.5, NAGA.postTop, 0.25],
];

export interface NagaTurnOptions extends NagaLook {
  /** The corner: where the two runs' axes cross (piece space). */
  x: number;
  z: number;
  /** Walkway level. */
  y: number;
}

/**
 * The corner of a naga balustrade that runs along +X towards (x, z) and turns
 * there to run back towards −Z (an outside corner, facing front and right):
 * the body carried round over a corner post a size up, each row of the body
 * mitred, the kerb an L. It fills the last 1.25 m of each arm — the straight
 * runs (whole 2 m bays) end at x − 1.25 and at z − 1.25. The body's rows and
 * scales are cut from lib/naga's own run, so the stone matches it.
 */
export function nagaTurn(p: PieceBuilder, o: NagaTurnOptions): void {
  const reach = 1.25;
  // One arm in the run frame, the corner at x = 0 (+X towards it, the body on z = 0), cut from a 4 m run.
  const arm = (seed: number, stop: (hw: number) => number) => {
    const q = new PieceBuilder();
    nagaRun(q, { ...o, seed, length: 2 * NAGA.bay, x: 0, y: 0, z: 0 });
    // Each texel row's half width (the kerb's, the body's rows') — read off the run, so a bitten body keeps its rows.
    const row = (b: VoxelBox) => Math.round((b.y - b.sy / 2) / T);
    const half = new Map<number, number>();
    for (const b of q.voxels.boxes) half.set(row(b), Math.max(half.get(row(b)) ?? 0, Math.abs(b.z) + b.sz / 2));
    const out = new PieceBuilder();
    for (const b of q.voxels.boxes) {
      const y0 = b.y - b.sy / 2;
      const top = b.y + b.sy / 2;
      // The run's posts go: the corner post stands at the corner.
      if (y0 >= NAGA.kerb - 1e-6 && top <= NAGA.postTop + 1e-6) continue;
      const hw = top <= NAGA.kerb + 1e-6 ? NAGA.width / 2 : (half.get(row(b)) ?? 0);
      const x0 = Math.max(-reach, b.x - b.sx / 2);
      const x1 = Math.min(stop(hw), b.x + b.sx / 2);
      if (x1 - x0 < 1e-6) continue;
      const cut = x1 < b.x + b.sx / 2 - 1e-6;
      out.voxels.boxes.push({ ...b, x: (x0 + x1) / 2, sx: x1 - x0, open: cut ? (b.open ?? 63) | FACE.px : b.open, joint: cut ? (b.joint ?? 0) & ~FACE.px : b.joint });
    }
    return out.done();
  };
  const target = { voxels: p.voxels };
  // The front arm's rows run to the far side of the corner; the right arm's
  // (turned to run along Z) stop at their near side: each row mitred, none overlapping.
  placePiece(target, arm(o.seed, (hw) => hw), { x: o.x, y: o.y, z: o.z, turn: 0 });
  placePiece(target, arm(o.seed + 11, (hw) => -hw), { x: o.x, y: o.y, z: o.z, turn: 3 });
  // The corner post.
  const set = new BlockSet(T);
  const look = finishLook(o.finish ?? NAGA_FINISH, o.seed + 13);
  for (const [y0, y1, w] of CORNER_POST) {
    const l = look(o.x, o.y + y0, o.z);
    set.add(o.x - w, o.y + y0, o.z - w, o.x + w, o.y + y1, o.z + w, l.color, { surf: l.surf, broken: null });
  }
  if ((o.broken ?? 0) > 0) set.erode((o.broken ?? 0) * 0.4, o.seed + 3);
  set.emit(p.voxels, { seed: o.seed, jitter: 0.03 });
  const k = NAGA.width / 2;
  p.collider(o.x - reach, o.y, o.z - k, o.x + k, o.y + NAGA.top, o.z + k);
  p.collider(o.x - k, o.y, o.z - reach, o.x + k, o.y + NAGA.top, o.z - k);
}

/** A straight naga run in the run frame (whole 2 m bays), for {@link placeRun}. */
export const nagaRunIn = (look: NagaLook, x0: number, x1: number) => (q: PieceBuilder) => nagaRun(q, { ...look, length: x1 - x0, x: (x0 + x1) / 2 });

/** A naga run ending at x1 in the seven-headed fan (the fan fills x1 … x1 + 2, looking +X), for {@link placeRun}. */
export const nagaFanIn = (look: NagaLook, x0: number, x1: number) => (q: PieceBuilder) => {
  if (x1 - x0 >= NAGA.bay) nagaRun(q, { ...look, length: x1 - x0, x: (x0 + x1) / 2 });
  nagaHead(q, { ...look, x: x1, facing: 1 });
};

