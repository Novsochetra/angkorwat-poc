import { BlockSet } from '../../BlockSet';
import { fromSheet, SANDSTONE } from '../../palette';
import { PieceBuilder } from '../../PieceBuilder';
import { TEXEL } from '../../shapes';
import { stoneSurf } from '../../surface';
import type { KitPiece } from '../../types';
import { hash3, valueNoise3 } from '../../../voxel/random';
import type { Surf, VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { TEMPLE_BLOCK_M } from '../../../world/scale';

/**
 * Shared masonry of §19.2 ①–③ and ⑤ (broken corner, missing block, cracked
 * block, collapsed decorative piece): dressed sandstone blocks laid dry like the
 * sheet's little walls — each joint a texel open, dark a texel in — then damaged
 * in steps of two texels (the sheet's broken ledges and stair-stepped cracks are
 * drawn in chunky "pixels"), hollowed or carved in relief, and emitted so a
 * damaged block keeps the rounded edges of a whole one while its hollows read
 * dark, as on the sheet.
 */

export const B = TEMPLE_BLOCK_M;
/** Size of a damage step: two texels (1/8 m). */
const STEP = 2 * TEXEL;

/**
 * Block faces of the 19.2 sheet (lit-face averages): warm tan, a shade duller
 * and more orange than §19.1 clean.
 */
export const STONE = [0xd0a67a, 0xc79e73, 0xd6ae82, 0xc0986f, 0xcba278].map(fromSheet);
/**
 * Faces a break exposed: the sheet's rough interior — fresher than the
 * weathered faces, so a little lighter and more orange (its lit ledges glow).
 */
export const RAW = [0xdcac78, 0xd3a26f, 0xe3b682].map(fromSheet);
/** The dark seen in the open joints (as on §19.2 ④–⑥). */
const JOINT = SANDSTONE.cavity[1];
/** The walls of a crack: dark, so a crack reads as the sheet's dark line between lit lips. */
const CRACK = SANDSTONE.cavity[0];
/**
 * Dressed faces. Every block face on the sheet is a coarse mosaic — dark pits
 * and grey-brown texels, pale flecks — about twice the contrast of the plain
 * pattern: a heavy dose of weathering mottle (a few run-off streaks come with
 * it) and pale lichen flecks bring the faces there. (Measured on the cards: a
 * lit front's luminance spread 0.18 of its median against the sheet's
 * 0.12–0.14, ~10 % of texels darker than 0.8 × and ~12 % lighter than 1.12 ×
 * the median against the sheet's 9 % and 11 %; the plain pattern gave 0.06.)
 */
export const PLAIN = stoneSurf({ stain: 0.44, lichen: 0.42 });
/**
 * Moss for blocks that stay whole. (The pattern's moss and stain thresholds
 * slide with the height inside each box, which stripes the thin boxes of broken
 * stone — so broken blocks only get a trace of moss, on their ledges.)
 */
export const MOSSY = stoneSurf({ moss: 0.7, stain: 0.44, lichen: 0.3 });
/** A trace of moss for broken blocks: it only takes on the tops of ledges. */
export const MOSS_TRACE = stoneSurf({ moss: 0.14, stain: 0.44, lichen: 0.4 });
/** Faces a break exposed: rough and grainy, no lichen yet. */
export const ROUGH = stoneSurf({ stain: 0.36 });
/** Inside a hollow or a relief's ground: the texture stays, the pale flecks and moss don't (they'd glow in the shade). */
const IN_SHADOW = stoneSurf({ stain: 0.3 });
/** How far a face at the mouth of a missing block's hollow has gone to the cavity tones (1 at the back). */
const CAVE_MIX = 0.55;
/**
 * The cut-back ground of a relief is the same stone in shadow (linear light:
 * about half as bright as the lit face in sRGB), not the cavity's black — so a
 * carved face still reads as one solid stone, as on the sheet.
 */
const RELIEF_SHADE = 0.2;
/** How much a broken face darkens from the top of its stone to the bottom. */
const SINK = 0.7;

/** A break out of the stone (see {@link Mason.breakAway}). */
export interface BreakSpec {
  /** Where the break is widest: a point on an arris or a face (metres). */
  at: [number, number, number];
  /** Reach into the stone along x and z at the widest ledge (metres). */
  reach: [number, number];
  /** Height of the break below `at` (metres). */
  below: number;
  /** …and above it (default 0: a break open to the top). */
  above?: number;
  /** Ledges over the height (default 3). */
  ledges?: number;
  /** How far the ledge rims wander (0‥1, default 0.28). */
  rough?: number;
  /** Squareness of the ledges (2 = round, 4+ = boxy; default 3). */
  square?: number;
  /** Keep the break inside this box (metres): one stone breaks, its neighbours stay whole. */
  clip?: Bounds;
}

/** A stone broken down in terraces (see {@link Mason.terrace}). */
export interface TerraceSpec {
  /** The box the break is cut from (metres), usually one stone. */
  min: [number, number, number];
  max: [number, number, number];
  /** Which way the break falls: weights along +x and +z (negative: towards −x / −z). */
  fall: [number, number];
  /** Height the stone keeps at the high side and at the low side (metres). */
  high: number;
  low: number;
  /** Rise of a terrace (metres, default a damage step, 1/8 m). */
  rise?: number;
  /** How far the terrace rims wander (share of the fall, default 0.14). */
  rough?: number;
}

/** A crack line (see {@link Mason.crack}). */
export interface CrackSpec {
  /** Face the line is drawn on: front (x, y) cut through z, side (z, y) through x, top (x, z) down through y. */
  on: 'front' | 'side' | 'top';
  /** Ends of the line on that face (metres). */
  from: [number, number];
  to: [number, number];
  /** Extent through the stone along the third axis (metres). */
  through: [number, number];
  /** Sideways wander in steps (default 1.5). */
  wander?: number;
  /** Gap in texels (default 1). */
  width?: number;
  /** Stair step in texels (default 1: the sheet's fine jaggies; 2 for chunky splits). */
  step?: number;
}

/** A carved relief on a front face (see {@link Mason.relief}). */
export interface ReliefSpec {
  /** Top-left corner of the motif on the face, and the face's z (metres). */
  at: [number, number, number];
  /**
   * The motif, top row first, one character per texel: '#' stands proud, '+'
   * a texel lower, anything else is carved back to the ground.
   */
  art: readonly string[];
  /** How deep the ground is cut (texels, default 2). */
  depth?: number;
}

/** The look of a mason's stones (default: the §19.2 ①–③ tan). */
export interface MasonLook {
  /** Tones of the dressed faces, one picked per block. */
  palette?: readonly number[];
  /** Pattern of the dressed faces. */
  surf?: Surf;
  /** Tones of the faces a break exposed. */
  raw?: readonly number[];
  /** Pattern of the faces a break exposed. */
  rough?: Surf;
  /**
   * Lay the stones tight, meeting in soft seams, instead of dry with open dark
   * joints (a texel is too coarse a joint for small carved members). A joint
   * opens only between two stones laid loose (see {@link Mason.block}).
   */
  tight?: boolean;
}

/** A block as laid out, before the joints are opened (box in metres). */
interface Plan {
  box: number[];
  color: number;
  raw: number;
  surf: Surf;
  shade: number;
  tight: boolean;
}

/** A block in the BlockSet and how it looks. */
interface Stone {
  id: number;
  color: number;
  /** Colour of the faces damage exposed. */
  raw: number;
  surf: Surf;
  /** Pattern of the faces damage exposed. */
  rough: Surf;
  shade: number;
  /** Joint fill (cleared where damage reaches it). */
  fill?: boolean;
}

/** A collision box from min/max corners (metres). */
export type ColliderBox = [number, number, number, number, number, number];

type Bounds = { min: [number, number, number]; max: [number, number, number] };

const FACE_N: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** Key of a texel cell (any cell within ±1000 texels). */
const cellKey = (i: number, j: number, k: number) => ((i + 1024) * 2048 + (j + 1024)) * 2048 + (k + 1024);

/** Centre of the damage step (1/8 m cell) a coordinate falls in. */
const stepCentre = (v: number) => (Math.floor(v / STEP) + 0.5) * STEP;

/**
 * Blocks laid out by hand, then laid dry on a 1/16 m carve grid (see
 * {@link Mason.lay}), broken, cracked and emitted.
 */
export class Mason {
  readonly set = new BlockSet(TEXEL);
  private readonly plan: Plan[] = [];
  private readonly stones: Stone[] = [];
  /** Texel cells of the open joints (filled or not). */
  private readonly joints = new Set<number>();
  /** Texel cells cut by cracks. */
  private readonly gaps = new Set<number>();
  /** Texel cells cut back by reliefs (carved, not broken). */
  private readonly carved = new Set<number>();
  /** Boxes left open by missing blocks (metres). */
  private readonly hollows: Bounds[] = [];
  private readonly palette: readonly number[];
  private readonly surf: Surf;
  private readonly raw: readonly number[];
  private readonly rough: Surf;
  private readonly tight: boolean;
  private laid = false;

  constructor(
    readonly seed: number,
    look: MasonLook = {},
  ) {
    this.palette = look.palette ?? STONE;
    this.surf = look.surf ?? PLAIN;
    this.raw = look.raw ?? RAW;
    this.rough = look.rough ?? ROUGH;
    this.tight = look.tight ?? false;
  }

  /**
   * Lay out one dressed block from min/max corners (metres), in one of the
   * palette's tones (or `tone`), laid tight or loose as the mason's look says
   * (or `tight`).
   */
  block(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, surf: Surf = this.surf, o: { tone?: number; tight?: boolean } = {}): void {
    const h = (salt: number) => hash3(Math.round(x0 / TEXEL), Math.round(y0 / TEXEL), Math.round(z0 / TEXEL), this.seed + salt);
    this.plan.push({
      box: [x0, y0, z0, x1, y1, z1],
      color: o.tone ?? this.palette[Math.floor(h(0) * this.palette.length)],
      raw: this.raw[Math.floor(h(7) * this.raw.length)],
      surf,
      shade: 1 + (h(3) - 0.5) * 0.16,
      tight: o.tight ?? this.tight,
    });
  }

  /** Lay out a course of blocks along x between the given joints (metres). */
  row(joints: number[], y0: number, y1: number, z0: number, z1: number, surf: Surf = this.surf): void {
    for (let n = 0; n + 1 < joints.length; n++) this.block(joints[n], y0, z0, joints[n + 1], y1, z1, surf);
  }

  /** Give every block whose centre passes `where` a pattern (moss on the shaded side…). */
  style(where: (x: number, y: number, z: number) => boolean, surf: Surf): void {
    for (const p of this.plan) if (where((p.box[0] + p.box[3]) / 2, (p.box[1] + p.box[4]) / 2, (p.box[2] + p.box[5]) / 2)) p.surf = surf;
    const ids = new Set(this.set.find(where));
    for (const s of this.stones) if (ids.has(s.id) && !s.fill) s.surf = surf;
  }

  /** Leave out every block whose centre passes `where` (the missing block). */
  omit(where: (x: number, y: number, z: number) => boolean): void {
    for (let n = this.plan.length - 1; n >= 0; n--) {
      const b = this.plan[n].box;
      if (where((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2)) this.plan.splice(n, 1);
    }
  }

  /**
   * Leave out the blocks in a box (metres) and keep the box as a hollow: the
   * stone faces looking into it take the sheet's cavity tones, darker the
   * deeper they sit — the dark recess a missing block leaves.
   */
  hollow(min: [number, number, number], max: [number, number, number]): void {
    this.omit((x, y, z) => within(x, y, z, min, max));
    this.hollows.push({ min, max });
  }

  /**
   * Lay the planned blocks dry: a block that meets another on its +x, +y or +z
   * side stops a texel short of it, and the joint is filled with dark stone a
   * texel back from every face — the sheet's dark joint lines between rounded,
   * rim-lit blocks (or, laid tight, they simply meet). Runs once, before the
   * first damage.
   */
  private lay(): void {
    if (this.laid) return;
    this.laid = true;
    const q = (v: number) => Math.round(v / TEXEL);
    const boxes = this.plan.map((p) => p.box.map(q));
    const loose = this.plan.map((p) => !p.tight);
    const meets = (a: number[], b: number[], ax: number) => b[ax] === a[ax + 3] && [0, 1, 2].every((o) => o === ax || (b[o] < a[o + 3] && b[o + 3] > a[o]));
    const cut = boxes.map((a, i) => a.map((v, n) => (n >= 3 && loose[i] && boxes.some((b, j) => j !== i && loose[j] && meets(a, b, n - 3)) ? v - 1 : v)));
    const stone = new Set<number>();
    for (const c of cut) for (let i = c[0]; i < c[3]; i++) for (let j = c[1]; j < c[4]; j++) for (let k = c[2]; k < c[5]; k++) stone.add(cellKey(i, j, k));
    boxes.forEach((a, n) => {
      for (let ax = 0; ax < 3; ax++) {
        if (cut[n][ax + 3] === a[ax + 3]) continue;
        const lo = [a[0], a[1], a[2]];
        const hi = [a[3], a[4], a[5]];
        lo[ax] = hi[ax] - 1;
        for (let i = lo[0]; i < hi[0]; i++) for (let j = lo[1]; j < hi[1]; j++) for (let k = lo[2]; k < hi[2]; k++) if (!stone.has(cellKey(i, j, k))) this.joints.add(cellKey(i, j, k));
      }
    });
    this.plan.forEach((p, n) => {
      const c = cut[n];
      const id = this.set.add(c[0] * TEXEL, c[1] * TEXEL, c[2] * TEXEL, c[3] * TEXEL, c[4] * TEXEL, c[5] * TEXEL, p.color);
      if (id >= 0) this.stones.push({ id, color: p.color, raw: p.raw, surf: p.surf, rough: this.rough, shade: p.shade });
    });
    // Fill the joints a texel back from the open air, merged into slabs.
    const inside = (i: number, j: number, k: number) => stone.has(cellKey(i, j, k)) || this.joints.has(cellKey(i, j, k));
    const fill = new Map<number, [number, number, number]>();
    for (const kk of this.joints) {
      const k = (kk % 2048) - 1024;
      const j = (Math.floor(kk / 2048) % 2048) - 1024;
      const i = Math.floor(kk / 2048 / 2048) - 1024;
      if (FACE_N.every(([dx, dy, dz]) => inside(i + dx, j + dy, k + dz))) fill.set(kk, [i, j, k]);
    }
    const has = (i: number, j: number, k: number) => fill.has(cellKey(i, j, k));
    const full = (i0: number, i1: number, j0: number, j1: number, k0: number, k1: number) => {
      for (let a = i0; a < i1; a++) for (let b = j0; b < j1; b++) for (let c = k0; c < k1; c++) if (!has(a, b, c)) return false;
      return true;
    };
    for (const [kk, [i, j, k]] of fill) {
      if (!fill.has(kk)) continue;
      let i1 = i + 1;
      while (has(i1, j, k)) i1++;
      let k1 = k + 1;
      while (full(i, i1, j, j + 1, k1, k1 + 1)) k1++;
      let j1 = j + 1;
      while (full(i, i1, j1, j1 + 1, k, k1)) j1++;
      for (let a = i; a < i1; a++) for (let b = j; b < j1; b++) for (let c = k; c < k1; c++) fill.delete(cellKey(a, b, c));
      const id = this.set.add(i * TEXEL, j * TEXEL, k * TEXEL, i1 * TEXEL, j1 * TEXEL, k1 * TEXEL, JOINT);
      if (id >= 0) this.stones.push({ id, color: JOINT, raw: JOINT, surf: PLAIN, rough: PLAIN, shade: 1, fill: true });
    }
  }

  /**
   * Break stone away in ledges, like the sheet's broken corner: the reach into
   * the stone shrinks in steps away from `at`, each ledge a step or two high
   * with a rim wandering by a few steps, so the break reads as rough terraces
   * of freshly broken stone. The rims wander with the direction from `at`, so a
   * ledge never leaves a stub standing, and lower ledges never undercut upper ones.
   */
  breakAway(o: BreakSpec, seed = this.seed): number {
    this.lay();
    const [cx, cy, cz] = o.at;
    const ledges = o.ledges ?? 3;
    const rough = o.rough ?? 0.28;
    const p = o.square ?? 3;
    const above = o.above ?? 0;
    const inside = (x: number, z: number, t: number, side: number) => {
      const f = Math.pow(1 - t / ledges, 0.7);
      const dx = (x - cx) / (o.reach[0] * f);
      const dz = (z - cz) / (o.reach[1] * f);
      const d = Math.hypot(dx, dz) || 1;
      const [u, w] = [dx / d, dz / d];
      const n = valueNoise3(u * 2.2 + 3, w * 2.2 + 3, t * 7.3 + side, seed + 1) * 0.8 + valueNoise3(u * 5 + 9, w * 5 + 9, t * 7.3 + side, seed + 2) * 0.2;
      return Math.pow(Math.abs(dx) ** p + Math.abs(dz) ** p, 1 / p) < 1 + (n - 0.5) * 2 * rough;
    };
    const bounds: Bounds = {
      min: [cx - o.reach[0] * 1.5, cy - o.below, cz - o.reach[1] * 1.5],
      max: [cx + o.reach[0] * 1.5, cy + above, cz + o.reach[1] * 1.5],
    };
    if (o.clip)
      for (let a = 0; a < 3; a++) {
        bounds.min[a] = Math.max(bounds.min[a], o.clip.min[a]);
        bounds.max[a] = Math.min(bounds.max[a], o.clip.max[a]);
      }
    const n = this.set.carve((fx, fy, fz) => {
      // Decided per damage step, so the break is drawn in chunky pixels.
      const [x, y, z] = [stepCentre(fx), stepCentre(fy), stepCentre(fz)];
      const below = y < cy;
      const h = below ? (cy - y) / o.below : above > 0 ? (y - cy) / above : 0;
      if (h >= 1) return false;
      // The ledge this step is on (ledge heights wobble a step here and there).
      const t = Math.max(0, Math.min(ledges - 1, Math.floor(h * ledges + (valueNoise3(x * 3, 0.5, z * 3, seed + 3) - 0.5) * 0.3)));
      // Carved where this ledge or any one further out is: no undercuts.
      for (let u = t; u < ledges; u++) if (inside(x, z, u, below ? 0.5 : 40.5)) return true;
      return false;
    }, bounds);
    this.despeckle(bounds);
    return n;
  }

  /**
   * Break a stone down in terraces, like the sheet's broken corner: the top
   * falls from `high` to `low` across the box in the `fall` direction, cut into
   * level treads a `rise` apart whose rims wander a little — a fracture read
   * as chunky steps of fresh stone, lit treads over risers in shadow.
   */
  terrace(o: TerraceSpec, seed = this.seed): number {
    this.lay();
    const rise = o.rise ?? STEP;
    const rough = o.rough ?? 0.14;
    const [fx, fz] = o.fall;
    const sum = Math.abs(fx) + Math.abs(fz) || 1;
    const along = (v: number, a: number, f: number) => {
      const t = (v - o.min[a]) / (o.max[a] - o.min[a]);
      return f >= 0 ? t * f : (1 - t) * -f;
    };
    const bounds: Bounds = { min: [...o.min], max: [...o.max] };
    const n = this.set.carve((px, py, pz) => {
      // Decided per damage step in plan, so the rims are drawn in chunky pixels.
      const [x, z] = [stepCentre(px), stepCentre(pz)];
      const u = (along(x, 0, fx) + along(z, 2, fz)) / sum + (valueNoise3(x * 5.3, 0.5, z * 5.3, seed + 7) - 0.5) * 2 * rough;
      const keep = o.low + rise * Math.round((o.high - (o.high - o.low) * Math.min(1, Math.max(0, u)) - o.low) / rise);
      return py > keep;
    }, bounds);
    this.despeckle(bounds);
    return n;
  }

  /**
   * A crack through the stone: a stair-stepped line (a one-texel gap) drawn on
   * a face and cut through the stone along the third axis, drifting a step as
   * it goes — the sheet's split blocks. Its walls are drawn dark (see
   * {@link emitStones}), so it reads as a dark line between lit lips.
   */
  crack(o: CrackSpec, seed = this.seed): number {
    this.lay();
    const r = TEXEL;
    const k = o.step ?? 1;
    const g = k * r;
    const wander = o.wander ?? 1.5;
    const width = o.width ?? 1;
    const [ua, va] = [o.from[0] / g, o.from[1] / g];
    const [ub, vb] = [o.to[0] / g, o.to[1] / g];
    const alongV = Math.abs(vb - va) >= Math.abs(ub - ua);
    const [m0, m1, q0, q1] = alongV ? [va, vb, ua, ub] : [ua, ub, va, vb];
    // Steps along the long axis, from the one holding `from` to the one holding `to`.
    const dir = m1 >= m0 ? 1 : -1;
    const first = dir > 0 ? Math.floor(m0) : Math.ceil(m0) - 1;
    const last = dir > 0 ? Math.ceil(m1) - 1 : Math.floor(m1);
    const n = Math.max(1, Math.abs(last - first));
    // The gap: a one-texel line at the step boundary on the short axis, with a
    // connecting run where the stair changes step.
    const gap = new Set<number>();
    const put = (m: number, q: number) => gap.add((m + 4096) * 8192 + q + 4096);
    let prevQ = Math.round(q0);
    for (let st = 0; st <= Math.abs(last - first); st++) {
      const t = st / n;
      const w = (valueNoise3(st * 0.225 * k, 0.5, 0.5, seed) - 0.5) * 2 * wander * Math.sqrt(Math.sin(Math.PI * t));
      const q = Math.round(q0 + (q1 - q0) * t + w);
      const M = first + st * dir;
      for (let f = 0; f < k; f++) for (let d = 0; d < width; d++) put(M * k + f, q * k + d);
      // The run joining the previous step, on this step's row next to it.
      const row = dir > 0 ? M * k : M * k + k - 1;
      if (st > 0) for (let c = Math.min(prevQ, q) * k; c <= Math.max(prevQ, q) * k + width - 1; c++) put(row, c);
      prevQ = q;
    }
    // Across the stone the line drifts a step now and then.
    const drift = (c: number) => k * Math.round((valueNoise3(c * 0.11, 3.5, 0.5, seed + 9) - 0.5) * 1.6);
    const axes = o.on === 'front' ? [0, 1, 2] : o.on === 'side' ? [2, 1, 0] : [0, 2, 1];
    const lo = [0, 0, 0];
    const hi = [0, 0, 0];
    lo[axes[alongV ? 1 : 0]] = Math.min(first, last) * g;
    hi[axes[alongV ? 1 : 0]] = (Math.max(first, last) + 1) * g;
    lo[axes[alongV ? 0 : 1]] = (Math.min(q0, q1) - 3 - wander) * g - 2 * r;
    hi[axes[alongV ? 0 : 1]] = (Math.max(q0, q1) + 4 + wander) * g + 2 * r;
    lo[axes[2]] = Math.min(o.through[0], o.through[1]);
    hi[axes[2]] = Math.max(o.through[0], o.through[1]);
    return this.set.carve(
      (x, y, z) => {
        const p = [x, y, z];
        const u = Math.floor(p[axes[0]] / r);
        const v = Math.floor(p[axes[1]] / r);
        const c = Math.floor(p[axes[2]] / r);
        const [m, q] = alongV ? [v, u] : [u, v];
        const cut = gap.has((m + 4096) * 8192 + q - drift(c) + 4096) || gap.has((m + 4096) * 8192 + q - drift(c - 1) + 4096);
        if (cut) this.gaps.add(cellKey(Math.floor(x / r), Math.floor(y / r), Math.floor(z / r)));
        return cut;
      },
      { min: [lo[0], lo[1], lo[2]], max: [hi[0], hi[1], hi[2]] },
    );
  }

  /**
   * Knock chips a step (1/8 m) big off exposed edges and corners where
   * `where` allows — worn, nicked arrises around the damage.
   */
  nick(amount: number, where: (x: number, y: number, z: number) => boolean, salt = 0): void {
    this.lay();
    const b = this.set.bounds();
    const seed = this.seed * 7 + 13 + salt;
    const solid = (x: number, y: number, z: number) => y < 0 || this.set.solidAt(x, y, z);
    const drop = new Set<number>();
    const id = (x: number, y: number, z: number) => cellKey(Math.floor(x / STEP), Math.floor(y / STEP), Math.floor(z / STEP));
    for (let x = stepCentre(b.min[0]); x < b.max[0]; x += STEP)
      for (let y = stepCentre(b.min[1]); y < b.max[1]; y += STEP)
        for (let z = stepCentre(b.min[2]); z < b.max[2]; z += STEP) {
          if (!where(x, y, z) || !solid(x, y, z)) continue;
          let open = 0;
          for (const [dx, dy, dz] of FACE_N) if (!solid(x + dx * STEP, y + dy * STEP, z + dz * STEP)) open++;
          if (open < 2) continue;
          const [i, j, k] = [Math.floor(x / STEP), Math.floor(y / STEP), Math.floor(z / STEP)];
          const run = valueNoise3(i * 0.5, j * 0.5, k * 0.5, seed) * 1.4;
          if (hash3(i, j, k, seed + 31) < amount * (open >= 3 ? 0.9 : 0.45) * run) drop.add(id(x, y, z));
        }
    if (drop.size) this.set.carve((x, y, z) => drop.has(id(x, y, z)), b);
    this.despeckle(b);
  }

  /**
   * Chip single texels off the edges where `where` allows, in short runs —
   * the ragged grain of a fresh break, finer than its 1/8 m ledges.
   */
  roughen(amount: number, where: (x: number, y: number, z: number) => boolean, seed = this.seed): number {
    this.lay();
    const n = this.set.erode(amount, seed * 3 + 5, { where, passes: 1 });
    this.despeckle(this.set.bounds());
    return n;
  }

  /** Knock off the lone texels damage leaves standing (four or more open sides). */
  private despeckle(bounds: Bounds): void {
    const r = this.set.res;
    const solid = (x: number, y: number, z: number) => y < 0 || this.set.solidAt(x, y, z);
    const id = (x: number, y: number, z: number) => cellKey(Math.floor(x / r), Math.floor(y / r), Math.floor(z / r));
    for (let pass = 0; pass < 2; pass++) {
      const loose = new Set<number>();
      this.set.carve((x, y, z) => {
        let open = 0;
        for (const [dx, dy, dz] of FACE_N) if (!solid(x + dx * r, y + dy * r, z + dz * r)) open++;
        if (open >= 4) loose.add(id(x, y, z));
        return false;
      }, bounds);
      if (!loose.size) return;
      this.set.carve((x, y, z) => loose.has(id(x, y, z)), bounds);
    }
  }

  /**
   * Carve a relief into a front (+z) face: the motif stands proud and the
   * ground around it is cut back on the texel grid, so it reads as chiselled
   * stone — the motif's face lit, its ground in shadow (not a break).
   */
  relief(o: ReliefSpec): number {
    this.lay();
    const [ax, ay, az] = o.at;
    const depth = o.depth ?? 2;
    const cols = Math.max(...o.art.map((l) => l.length));
    const q = (v: number) => Math.floor(v / TEXEL + 1e-6);
    return this.set.carve(
      (x, y, z) => {
        const layer = q(az - z);
        const ch = o.art[q(ay - y)]?.[q(x - ax)] ?? '.';
        const proud = ch === '#' ? depth : ch === '+' ? depth - 1 : 0;
        if (layer >= depth - proud) return false;
        this.carved.add(cellKey(Math.floor(x / TEXEL), Math.floor(y / TEXEL), Math.floor(z / TEXEL)));
        return true;
      },
      { min: [ax, ay - o.art.length * TEXEL, az - depth * TEXEL], max: [ax + cols * TEXEL, ay, az] },
    );
  }

  /**
   * Emit the stone (see {@link emitStones}) with the given colliders (min/max
   * corners), or one collider around it all.
   */
  finish(o: { dark?: number; colliders?: readonly ColliderBox[] } = {}): KitPiece {
    this.lay();
    const p = new PieceBuilder();
    const r = TEXEL;
    emitStones(p.voxels, this.set, this.stones, {
      joint: (i, j, k) => this.joints.has(cellKey(i, j, k)),
      gap: (i, j, k) => this.gaps.has(cellKey(i, j, k)),
      carved: (i, j, k) => this.carved.has(cellKey(i, j, k)),
      hollow: (i, j, k) => this.hollows.some((h) => within((i + 0.5) * r, (j + 0.5) * r, (k + 0.5) * r, h.min, h.max)),
      dark: o.dark ?? 0.84,
    });
    if (o.colliders) for (const c of o.colliders) p.collider(...c);
    else p.boundsCollider();
    return p.done();
  }
}

/** Point within a box (metres, min/max corners, optional margin)? */
export function within(x: number, y: number, z: number, min: [number, number, number], max: [number, number, number], pad = 0): boolean {
  return x > min[0] - pad && x < max[0] + pad && y > min[1] - pad && y < max[1] + pad && z > min[2] - pad && z < max[2] + pad;
}

/** A colour pulled towards its own grey (deep shadow reads neutral on the sheet). */
function greyer(hex: number, t: number): number {
  const [r, g, b] = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  const m = (c: number) => Math.round(c + (l - c) * t);
  return (m(r) << 16) | (m(g) << 8) | m(b);
}

/** sRGB blend of two colours. */
function mix(a: number, b: number, t: number): number {
  const m = (sh: number) => Math.round(((a >> sh) & 255) + (((b >> sh) & 255) - ((a >> sh) & 255)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

type CellTest = (i: number, j: number, k: number) => boolean;

/**
 * Emit the stones. A block untouched by damage and hollows is one rounded box.
 * Any other block is merged greedily into the fewest boxes of one look (tall
 * first), so its sound bulk stays a few big boxes with the rounded edges of a
 * whole block while the damage is drawn step by step; sides that continue into
 * the same stone are merged (no bevel). Faces that look only into broken-away
 * stone take the block's raw colour and rough pattern (only into a crack: the
 * crack's dark; only into a missing block's hollow: the cavity tones; only
 * into a relief's cut-back ground: the stone in shadow, so motifs stand lit
 * over it), and joint fill the damage laid bare is dropped. Every visible cell is shaded by how deep in a hollow it sits: each
 * exposed face measures how much stone fills cubes of 2–12 texels around it
 * (half = a flat face), so cracks and the backs of holes go dark like the
 * sheet's (the open joints are left to their dark fill). The shade is set in
 * sRGB terms — the renderer multiplies linear light, so a linear 0.36 still
 * reads as 60 % — with deep shadow a little greyer.
 */
function emitStones(
  v: VoxelBuilder,
  set: BlockSet,
  stones: readonly Stone[],
  o: { joint: CellTest; gap: CellTest; carved: CellTest; hollow: CellTest; dark: number },
): void {
  const r = set.res;
  const alive = new Set(set.find(() => true));
  const live = stones.filter((s) => alive.has(s.id));
  if (!live.length) return;
  const cellsOf = (s: Stone) => {
    const { min, max } = set.boxOf(s.id);
    return [min[0], min[1], min[2], max[0], max[1], max[2]].map((m) => Math.round(m / r));
  };
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const s of live) {
    const c = cellsOf(s);
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], c[a]);
      hi[a] = Math.max(hi[a], c[a + 3]);
    }
  }
  // A grid around the stone with room for the largest occlusion cube.
  const M = 13;
  const [gi, gj, gk] = [lo[0] - M, lo[1] - M, lo[2] - M];
  const [nx, ny, nz] = [hi[0] - lo[0] + 2 * M, hi[1] - lo[1] + 2 * M, hi[2] - lo[2] + 2 * M];
  const at = (i: number, j: number, k: number) => ((i - gi) * ny + (j - gj)) * nz + (k - gk);
  const solid = new Uint8Array(nx * ny * nz);
  const owner = new Int32Array(nx * ny * nz).fill(-1);
  live.forEach((s, n) => {
    const c = cellsOf(s);
    for (let i = c[0]; i < c[3]; i++)
      for (let j = c[1]; j < c[4]; j++)
        for (let k = c[2]; k < c[5]; k++) {
          owner[at(i, j, k)] = n;
          solid[at(i, j, k)] = set.solidAt((i + 0.5) * r, (j + 0.5) * r, (k + 0.5) * r) ? 1 : 0;
        }
  });
  // Joint fill that damage has laid bare goes with it: the break shows the
  // neighbouring stones' faces, not a slab of dark.
  const bare: number[] = [];
  live.forEach((s, n) => {
    if (!s.fill) return;
    const c = cellsOf(s);
    for (let i = c[0]; i < c[3]; i++)
      for (let j = c[1]; j < c[4]; j++)
        for (let k = c[2]; k < c[5]; k++) {
          if (!solid[at(i, j, k)]) continue;
          for (const [dx, dy, dz] of FACE_N) {
            const m = at(i + dx, j + dy, k + dz);
            if (owner[m] >= 0 && owner[m] !== n && !solid[m] && !live[owner[m]].fill) {
              bare.push(at(i, j, k));
              break;
            }
          }
        }
  });
  for (const m of bare) {
    solid[m] = 0;
    owner[m] = -1;
  }
  // Summed-volume table: P(a, b, c) = solid cells in [0,a)×[0,b)×[0,c) of the grid.
  const sb = nz + 1;
  const sa = (ny + 1) * sb;
  const P = new Int32Array((nx + 1) * sa);
  for (let a = 1; a <= nx; a++)
    for (let b = 1; b <= ny; b++)
      for (let c = 1; c <= nz; c++)
        P[a * sa + b * sb + c] =
          solid[((a - 1) * ny + (b - 1)) * nz + (c - 1)] +
          P[(a - 1) * sa + b * sb + c] +
          P[a * sa + (b - 1) * sb + c] +
          P[a * sa + b * sb + c - 1] -
          P[(a - 1) * sa + (b - 1) * sb + c] -
          P[(a - 1) * sa + b * sb + c - 1] -
          P[a * sa + (b - 1) * sb + c - 1] +
          P[(a - 1) * sa + (b - 1) * sb + c - 1];
  const sum = (a: number, b: number, c: number) => P[a * sa + b * sb + c];
  /** Solid cells in the inclusive cell box [i0,i1]×[j0,j1]×[k0,k1]. */
  const count = (i0: number, i1: number, j0: number, j1: number, k0: number, k1: number) => {
    const a0 = Math.max(0, i0 - gi);
    const a1 = Math.min(nx, i1 - gi + 1);
    const b0 = Math.max(0, j0 - gj);
    const b1 = Math.min(ny, j1 - gj + 1);
    const c0 = Math.max(0, k0 - gk);
    const c1 = Math.min(nz, k1 - gk + 1);
    if (a1 <= a0 || b1 <= b0 || c1 <= c0) return 0;
    return sum(a1, b1, c1) - sum(a0, b1, c1) - sum(a1, b0, c1) - sum(a1, b1, c0) + sum(a0, b0, c1) + sum(a0, b1, c0) + sum(a1, b0, c0) - sum(a0, b0, c0);
  };
  const SCALES: [number, number][] = [
    [2, 0.8],
    [4, 1],
    [8, 1],
    [12, 0.85],
  ];
  /** Occlusion 0‥1 of face f of cell (i, j, k): the most enclosed of its cubes. */
  const occlusion = (i: number, j: number, k: number, f: number) => {
    const nrm = FACE_N[f];
    const ax = nrm[0] ? 0 : nrm[1] ? 1 : 2;
    const cell = [i, j, k];
    let occ = 0;
    for (const [R, w] of SCALES) {
      const a = [i - R, j - R, k - R];
      const b = [i + R, j + R, k + R];
      // R cells each side of the face along its normal, 2R + 1 across.
      if (nrm[ax] > 0) a[ax] = cell[ax] - R + 1;
      else b[ax] = cell[ax] + R - 1;
      const s = count(a[0], b[0], a[1], b[1], a[2], b[2]) / (2 * R * (2 * R + 1) ** 2);
      occ = Math.max(occ, w * Math.min(1, Math.max(0, (s - 0.53) / 0.3)));
    }
    return occ;
  };
  const LEVELS = 8;
  const levelShade = Array.from({ length: LEVELS }, (_, l) => Math.pow(1 - o.dark * Math.pow(l / (LEVELS - 1), 1.2), 2.2));
  const HIDDEN = -1;
  const EMPTY = -2;

  for (const s of live) {
    const c = cellsOf(s);
    const [W, H, D] = [c[3] - c[0], c[4] - c[1], c[5] - c[2]];
    // A look key per solid cell (dressed, raw or crack wall × hollow level);
    // cells with no open side are hidden and fit any box.
    const key = new Int8Array(W * H * D);
    const li = (x: number, y: number, z: number) => (x * H + y) * D + z;
    let whole = true;
    let plain = true;
    for (let x = 0; x < W; x++)
      for (let y = 0; y < H; y++)
        for (let z = 0; z < D; z++) {
          const [i, j, k] = [c[0] + x, c[1] + y, c[2] + z];
          if (!solid[at(i, j, k)]) {
            key[li(x, y, z)] = EMPTY;
            whole = false;
            continue;
          }
          let open = 0;
          let faces = 0;
          let occ = 0;
          let intoCrack = false;
          let intoBreak = false;
          let intoHollow = false;
          let intoCarved = false;
          let intoAir = false;
          FACE_N.forEach(([dx, dy, dz], f) => {
            const [a, b, c] = [i + dx, j + dy, k + dz];
            const n = at(a, b, c);
            if (solid[n]) return;
            open++;
            if (o.gap(a, b, c)) intoCrack = true;
            else if (o.hollow(a, b, c)) intoHollow = true;
            else if (o.carved(a, b, c)) intoCarved = true;
            else if (owner[n] >= 0) intoBreak = true;
            else intoAir = true;
            if (o.joint(a, b, c)) return;
            faces++;
            occ += occlusion(i, j, k, f);
          });
          if (!open) {
            key[li(x, y, z)] = HIDDEN;
            continue;
          }
          const look = intoAir ? 0 : intoBreak ? 1 : intoCrack ? 2 : intoHollow ? 3 : intoCarved ? 4 : 0;
          const K = look * LEVELS + (faces ? Math.round((occ / faces) * (LEVELS - 1)) : 0);
          // (a whole block only gives up its single box for a real hollow)
          if (K >= 3) plain = false;
          key[li(x, y, z)] = K;
        }
    if (whole && plain) {
      // One rounded box; sides fully against other stone are not open.
      const covered = (i0: number, i1: number, j0: number, j1: number, k0: number, k1: number) => {
        for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) for (let k = k0; k < k1; k++) if (!solid[at(i, j, k)]) return false;
        return true;
      };
      const open =
        (covered(c[3], c[3] + 1, c[1], c[4], c[2], c[5]) ? 0 : 1) |
        (covered(c[0] - 1, c[0], c[1], c[4], c[2], c[5]) ? 0 : 2) |
        (covered(c[0], c[3], c[4], c[4] + 1, c[2], c[5]) ? 0 : 4) |
        (covered(c[0], c[3], c[1] - 1, c[1], c[2], c[5]) ? 0 : 8) |
        (covered(c[0], c[3], c[1], c[4], c[5], c[5] + 1) ? 0 : 16) |
        (covered(c[0], c[3], c[1], c[4], c[2] - 1, c[2]) ? 0 : 32);
      if (open) v.box(((c[0] + c[3]) / 2) * r, ((c[1] + c[4]) / 2) * r, ((c[2] + c[5]) / 2) * r, W * r, H * r, D * r, s.color, 'sandstone', { shade: s.shade, open, surf: s.surf });
      continue;
    }
    const used = new Uint8Array(W * H * D);
    const fits = (x: number, y: number, z: number, K: number) => {
      const n = li(x, y, z);
      return !used[n] && (key[n] === K || key[n] === HIDDEN);
    };
    // Boxes grow up first: tall boxes keep the pattern's moss and grime (which
    // follow the height inside a box) smooth on the sides.
    for (let x = 0; x < W; x++)
      for (let z = 0; z < D; z++)
        for (let y = 0; y < H; y++) {
          const K = key[li(x, y, z)];
          if (K < 0 || used[li(x, y, z)]) continue;
          let y1 = y + 1;
          while (y1 < H && fits(x, y1, z, K)) y1++;
          let x1 = x + 1;
          growX: while (x1 < W) {
            for (let yy = y; yy < y1; yy++) if (!fits(x1, yy, z, K)) break growX;
            x1++;
          }
          let z1 = z + 1;
          growZ: while (z1 < D) {
            for (let xx = x; xx < x1; xx++) for (let yy = y; yy < y1; yy++) if (!fits(xx, yy, z1, K)) break growZ;
            z1++;
          }
          for (let xx = x; xx < x1; xx++) for (let yy = y; yy < y1; yy++) for (let zz = z; zz < z1; zz++) used[li(xx, yy, zz)] = 1;
          // Sides: merged if any of it continues into this stone, open if any of it is air.
          const box = [c[0] + x, c[1] + y, c[2] + z, c[0] + x1, c[1] + y1, c[2] + z1];
          let open = 0;
          let merge = 0;
          FACE_N.forEach((nrm, f) => {
            const ax = nrm[0] ? 0 : nrm[1] ? 1 : 2;
            const a = [box[0], box[1], box[2]];
            const b = [box[3], box[4], box[5]];
            if (nrm[ax] > 0) [a[ax], b[ax]] = [box[ax + 3], box[ax + 3] + 1];
            else [a[ax], b[ax]] = [box[ax] - 1, box[ax]];
            for (let i = a[0]; i < b[0]; i++)
              for (let j = a[1]; j < b[1]; j++)
                for (let k = a[2]; k < b[2]; k++) {
                  const n = at(i, j, k);
                  if (!solid[n]) open |= 1 << f;
                  else if (live[owner[n]] === s) merge |= 1 << f;
                }
          });
          const level = K % LEVELS;
          const look = Math.floor(K / LEVELS);
          const surf = look === 1 ? s.rough : look >= 3 ? IN_SHADOW : s.surf;
          const px = [((box[0] + box[3]) / 2) * r, ((box[1] + box[4]) / 2) * r, ((box[2] + box[5]) / 2) * r] as const;
          const dims = [(x1 - x) * r, (y1 - y) * r, (z1 - z) * r] as const;
          if (look === 3) {
            // Inside a missing block: the stone fades into the cavity tones the deeper it sits.
            const cave = SANDSTONE.cavity[Math.floor(hash3(box[0], box[1], box[2], 11) * SANDSTONE.cavity.length)];
            v.box(...px, ...dims, greyer(mix(s.color, cave, CAVE_MIX + ((1 - CAVE_MIX) * level) / (LEVELS - 1)), 0.3), 'sandstone', { shade: s.shade, open, merge, surf });
            continue;
          }
          if (look === 4) {
            // A relief's cut-back ground: the stone in shadow, a little darker in the tight corners.
            v.box(...px, ...dims, greyer(s.color, 0.2), 'sandstone', { shade: s.shade * RELIEF_SHADE * (1 - (0.35 * level) / (LEVELS - 1)), open, merge, surf });
            continue;
          }
          const color = [s.color, s.raw, CRACK][look];
          // Broken faces darken the further down the break they sit, so its ledges step back into shadow.
          const sink = look === 1 ? 1 - SINK * Math.min(1, (c[4] - box[4]) / Math.max(1, c[4] - c[1])) : 1;
          v.box(...px, ...dims, greyer(color, (0.45 * level) / (LEVELS - 1)), 'sandstone', { shade: s.shade * levelShade[level] * sink, open, merge, surf });
        }
  }
}
