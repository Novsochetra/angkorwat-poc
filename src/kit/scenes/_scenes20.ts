import { hash3, valueNoise3 } from '../../voxel/random';
import type { Surf, VoxelGrid } from '../../voxel/VoxelBuilder';
import { joints, pores } from '../assets/20/_masonry-props';
import { BlockSet, masonry } from '../BlockSet';
import { commitGrass, flower, grassClump, grassGrid, grassTuft, plusTuft, smallPlant, sprout, type ClumpOptions, type GrassTones, type TuftOptions } from '../lib/grass';
import { LEAF_SHAPES, LeafBed, leafCluster, scatterLeaves } from '../lib/leaves';
import { fromSheet, LEAF, SANDSTONE, SOIL } from '../palette';
import { PieceBuilder } from '../PieceBuilder';
import { placePiece, type Placement } from '../place';
import { rng, snap, TEXEL, type Rng } from '../shapes';
import { soilSurf } from '../surface';
import type { KitCollider, KitPiece } from '../types';

/**
 * Shared parts of the §20 environment examples (fragments and vegetation, the
 * shrine with offerings, steps with a drain and a pond): the scenes' ground
 * (soil, broken flagstone paving), a height map of what has been built so the
 * grass and leaves land on the ground or on the stones' tops, one grass grid
 * per scene, leaf litter, and the ruined walls and pillar stubs that stand in
 * for the temple architecture of later sections.
 */

/**
 * Old walls and pillars: the kit's moss-covered and weathered sandstone mixed —
 * the sheet's walls are greyer and darker than the props lying in front of them.
 */
export const WALL: readonly number[] = [...SANDSTONE.mossy, SANDSTONE.weathered[0], SANDSTONE.weathered[2], SANDSTONE.weathered[4]];

/**
 * Flagstones: the sheet's court slabs — half of them warm tan in the sun
 * (#bb8c62–#c5936d on the lit tops), half grey-brown and mauve (#79685a–
 * #8f7a70) — via fromSheet.
 */
export const PAVE: readonly number[] = [0xc0906a, 0xb08664, 0xb89272, 0x8e7a6a, 0x7e6e62, 0x98806c].map(fromSheet);

/** A rectangle on the ground (metres, scene space). */
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** An axis-aligned box: [x0, y0, z0, x1, y1, z1] (metres). */
export type Box = readonly [number, number, number, number, number, number];

const inBox = (b: Box, x: number, y: number, z: number) => x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5];

/**
 * Put a kit piece into the scene (moved, turned, with its colliders and
 * lights). Blocks whose centre lies inside one of `cut` — stone the piece
 * grows into, or what lies past the diorama's edge — are dropped (hidden
 * anyway, and their faces would flicker against the stone's), and so are
 * colliders wholly inside one. Returns the index of the piece's first block.
 */
export function put(p: PieceBuilder, piece: KitPiece | null, at: Placement, cut: readonly Box[] = []): number {
  const b0 = p.voxels.boxes.length;
  if (!piece) return b0;
  const c0 = p.colliders.length;
  placePiece({ voxels: p.voxels, collider: (c) => p.colliders.push(c), extra: (o) => p.extras.push(o) }, piece, at);
  if (!cut.length) return b0;
  const boxes = p.voxels.boxes;
  let w = b0;
  for (let n = b0; n < boxes.length; n++) if (!cut.some((c) => inBox(c, boxes[n].x, boxes[n].y, boxes[n].z))) boxes[w++] = boxes[n];
  boxes.length = w;
  const cols = p.colliders;
  let v = c0;
  for (let n = c0; n < cols.length; n++) {
    const { min, max } = cols[n];
    if (!cut.some((c) => min[0] >= c[0] && min[1] >= c[1] && min[2] >= c[2] && max[0] <= c[3] && max[1] <= c[4] && max[2] <= c[5])) cols[v++] = cols[n];
  }
  cols.length = v;
  return b0;
}

/** Boxes covering everything outside `area` up to height `h`: cut with them to trim a piece at the diorama's edge. */
export function outside(area: Rect, h: number): Box[] {
  const F = 100;
  return [
    [-F, -F, -F, area.x0, h, F],
    [area.x1, -F, -F, F, h, F],
    [area.x0, -F, -F, area.x1, h, area.z0],
    [area.x0, -F, area.z1, area.x1, h, F],
  ];
}

/** `area` minus the `holes`, cut into as few rectangles as a sweep over their edges gives. */
export function complement(area: Rect, holes: readonly Rect[]): Rect[] {
  const clip = holes.map((h) => ({ x0: Math.max(area.x0, h.x0), z0: Math.max(area.z0, h.z0), x1: Math.min(area.x1, h.x1), z1: Math.min(area.z1, h.z1) })).filter((h) => h.x1 > h.x0 && h.z1 > h.z0);
  const xs = [...new Set([area.x0, area.x1, ...clip.flatMap((h) => [h.x0, h.x1])])].sort((a, b) => a - b);
  const zs = [...new Set([area.z0, area.z1, ...clip.flatMap((h) => [h.z0, h.z1])])].sort((a, b) => a - b);
  const nx = xs.length - 1;
  const nz = zs.length - 1;
  const free = (i: number, k: number) => !clip.some((h) => (xs[i] + xs[i + 1]) / 2 > h.x0 && (xs[i] + xs[i + 1]) / 2 < h.x1 && (zs[k] + zs[k + 1]) / 2 > h.z0 && (zs[k] + zs[k + 1]) / 2 < h.z1);
  const used = new Uint8Array(nx * nz);
  const out: Rect[] = [];
  for (let k = 0; k < nz; k++)
    for (let i = 0; i < nx; i++) {
      if (used[k * nx + i] || !free(i, k)) continue;
      let i1 = i + 1;
      while (i1 < nx && !used[k * nx + i1] && free(i1, k)) i1++;
      let k1 = k + 1;
      grow: while (k1 < nz) {
        for (let a = i; a < i1; a++) if (used[k1 * nx + a] || !free(a, k1)) break grow;
        k1++;
      }
      for (let b = k; b < k1; b++) for (let a = i; a < i1; a++) used[b * nx + a] = 1;
      out.push({ x0: xs[i], z0: zs[k], x1: xs[i1], z1: zs[k1] });
    }
  return out;
}

/**
 * Soil blocks over rectangles, their tops at y = 0 and half a metre deep, with
 * colliders. Sides that meet another of the rectangles merge (no bevel), so
 * the ground reads as one piece; the `soil` pattern draws the dirt, the grass
 * patches and the moss from `surf`.
 */
export function soilGround(p: PieceBuilder, rects: readonly Rect[], o: { color?: number; surf?: Surf } = {}): void {
  for (const r of rects) {
    const touches = (x: number, z: number) => rects.some((q) => q !== r && x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1);
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const merge = (touches(r.x1 + 0.01, cz) ? 1 : 0) | (touches(r.x0 - 0.01, cz) ? 2 : 0) | (touches(cx, r.z1 + 0.01) ? 16 : 0) | (touches(cx, r.z0 - 0.01) ? 32 : 0);
    p.voxels.span(r.x0, -0.5, r.z0, r.x1, 0, r.z1, o.color ?? SOIL.dirt[0], 'soil', { surf: o.surf ?? soilSurf({ grass: 0.5 }), merge, open: 4 | (51 & ~merge) });
    p.collider(r.x0, -0.5, r.z0, r.x1, 0, r.z1);
  }
}

export interface PavingOptions {
  area: Rect;
  /** Top of the slabs (default y = 0). */
  top?: number;
  /** Depth of a row of slabs and length of a slab along it (metres). */
  rows?: [number, number];
  lengths?: [number, number];
  palette: readonly number[];
  /** Pattern amounts of a slab centred at (x, z). */
  surf: (x: number, z: number, r: Rng) => Surf;
  seed: number;
  /** Chance that the slab at (x, z) is gone, the soil under it showing. */
  missing?: (x: number, z: number) => number;
  /** Chance that it has been heaved up at a tilt (by roots) or has settled a little. */
  heave?: (x: number, z: number) => number;
  /** Chance that it lies broken in two. */
  broken?: number;
  /** Left bare (a pond, a wall's footprint): the slabs stop at their edges. */
  skip?: readonly Rect[];
  /** Soil in the gaps. */
  soil?: Surf;
}

/** What a paving laid: its slabs and the gaps where one is missing (both as rectangles). */
export interface Paving {
  slabs: Rect[];
  gaps: Rect[];
}

const JOINT = 0.03;
const SLAB = 0.25;

/**
 * Flagstone paving as the §20 sheet draws its courts: rows of big slabs of
 * mixed length (the joints staggered), each a separate stone with bevelled
 * edges and a dark joint between, some heaved at a tilt or settled a little,
 * some broken in two, some gone — the soil showing in the hole, a little below
 * the stones.
 * A soil bed under the joints, one collider over it all (top at `top`).
 */
export function paving(p: PieceBuilder, o: PavingOptions): Paving {
  const r = rng(o.seed);
  const top = o.top ?? 0;
  const [r0, r1] = o.rows ?? [0.5, 0.875];
  const [l0, l1] = o.lengths ?? [0.625, 1.25];
  const skip = o.skip ?? [];
  const out: Paving = { slabs: [], gaps: [] };
  // (tilted slabs rise until their lowest edge sits at the court: nothing sinks under the kit
  // level's lawn, which lies 2 cm below a scene's ground)
  const slab = (q: Rect, tone: number, surf: Surf, sink: number, tilt: [number, number]) => {
    const w = q.x1 - q.x0 - JOINT;
    const d = q.z1 - q.z0 - JOINT;
    const lift = (Math.abs(Math.sin(tilt[0])) * d + Math.abs(Math.sin(tilt[1])) * w) / 2;
    p.voxels.box((q.x0 + q.x1) / 2, top - SLAB / 2 - sink + lift, (q.z0 + q.z1) / 2, w, SLAB, d, tone, 'sandstone', { surf, shade: 0.95 + r() * 0.1, rx: tilt[0], rz: tilt[1] });
  };
  // Rows break at the edges of what is skipped, so every row is either beside it or across it.
  const cuts = skip.flatMap((q) => [q.z0, q.z1]).filter((c) => c > o.area.z0 + 1e-6 && c < o.area.z1 - 1e-6);
  for (let z = o.area.z0; z < o.area.z1 - 1e-6; ) {
    let depth = snap(r.range(r0, r1));
    if (o.area.z1 - (z + depth) < r0 * 0.6) depth = o.area.z1 - z;
    for (const c of cuts) if (c > z + 1e-6 && c < z + depth - 1e-6) depth = c - z;
    const z1 = z + depth;
    // The stretches of the row left free, slabs laid end to end in each (the last one fitted).
    let free: [number, number][] = [[o.area.x0, o.area.x1]];
    for (const q of skip)
      if (q.z0 < z1 - 1e-6 && q.z1 > z + 1e-6) free = free.flatMap(([a, b]): [number, number][] => (q.x1 <= a || q.x0 >= b ? [[a, b]] : [...(q.x0 > a ? [[a, q.x0] as [number, number]] : []), ...(q.x1 < b ? [[q.x1, b] as [number, number]] : [])]));
    for (const [a, b] of free)
      for (let x = a; x < b - 1e-6; ) {
        let len = snap(r.range(l0, l1));
        if (b - (x + len) < l0 * 0.5) len = b - x;
        const q: Rect = { x0: x, z0: z, x1: x + len, z1 };
        x += len;
        const cx = (q.x0 + q.x1) / 2;
        const cz = (q.z0 + q.z1) / 2;
        if (r.chance(o.missing?.(cx, cz) ?? 0)) {
          out.gaps.push(q);
          continue;
        }
        out.slabs.push(q);
        const tone = o.palette[Math.floor(hash3(Math.round(cx * 8), 3, Math.round(cz * 8), o.seed) * o.palette.length)];
        const surf = o.surf(cx, cz, r);
        const heaved = r.chance(o.heave?.(cx, cz) ?? 0);
        const tilt: [number, number] = heaved && r.chance(0.6) ? [r.range(-0.05, 0.05), r.range(-0.05, 0.05)] : [0, 0];
        const sink = heaved && !tilt[0] ? r.range(0.006, 0.014) : 0;
        if (r.chance(o.broken ?? 0) && len > 0.5) {
          // Broken across: two pieces, the crack a joint wide, one a little lower.
          const cut = snap(q.x0 + len * r.range(0.35, 0.65));
          slab({ ...q, x1: cut }, tone, surf, sink, tilt);
          slab({ ...q, x0: cut }, tone, surf, Math.max(sink, r.range(0.006, 0.014)), [0, 0]);
        } else slab(q, tone, surf, sink, tilt);
      }
    z = z1;
  }
  // Soil in the gaps, a little below the slabs; the bed under the joints.
  for (const q of out.gaps)
    p.voxels.span(q.x0, top - SLAB, q.z0, q.x1, top - 0.04, q.z1, SOIL.dirt[1], 'soil', { surf: o.soil ?? soilSurf({ grass: 0.7, moss: 0.3 }), open: 4 });
  for (const q of complement(o.area, skip)) {
    p.voxels.span(q.x0, top - SLAB - 0.25, q.z0, q.x1, top - SLAB, q.z1, SOIL.humus[0], 'soil', { surf: soilSurf({ wet: 0.5 }), open: 4 | 51 });
    p.collider(q.x0, top - SLAB - 0.25, q.z0, q.x1, top, q.z1);
  }
  return out;
}

/**
 * Heights of everything solid built so far, on a grid over the scene (from
 * the colliders, stacked ones from the ground up), and where the water is:
 * where grass may root and what fallen leaves rest on.
 */
export class Heights {
  private readonly nx: number;
  private readonly nz: number;
  private readonly h: Float32Array;
  private readonly water: Uint8Array;

  constructor(
    readonly area: Rect,
    readonly cell = 0.125,
  ) {
    this.nx = Math.ceil((area.x1 - area.x0) / cell);
    this.nz = Math.ceil((area.z1 - area.z0) / cell);
    this.h = new Float32Array(this.nx * this.nz).fill(-10);
    this.water = new Uint8Array(this.nx * this.nz);
  }

  /** Raise the map to the tops of these colliders; water marks its cells. */
  add(colliders: readonly KitCollider[]): this {
    const c = this.cell;
    for (const b of [...colliders].sort((a, q) => a.min[1] - q.min[1])) {
      const i0 = Math.max(0, Math.round((b.min[0] - this.area.x0) / c));
      const i1 = Math.min(this.nx, Math.round((b.max[0] - this.area.x0) / c));
      const k0 = Math.max(0, Math.round((b.min[2] - this.area.z0) / c));
      const k1 = Math.min(this.nz, Math.round((b.max[2] - this.area.z0) / c));
      for (let i = i0; i < i1; i++)
        for (let k = k0; k < k1; k++) {
          const n = i * this.nz + k;
          if (b.noStand) this.water[n] = 1;
          // (only stone resting on what is there: a lintel over a door is no floor)
          else if (this.h[n] < -5 || b.min[1] <= this.h[n] + 0.35) this.h[n] = Math.max(this.h[n], b.max[1]);
        }
    }
    return this;
  }

  private index(x: number, z: number): number {
    const i = Math.floor((x - this.area.x0) / this.cell);
    const k = Math.floor((z - this.area.z0) / this.cell);
    return i < 0 || k < 0 || i >= this.nx || k >= this.nz ? -1 : i * this.nz + k;
  }

  /** Top of the solid ground or stone at (x, z) (−10 off the map or over a hole). */
  at(x: number, z: number): number {
    const n = this.index(x, z);
    return n < 0 ? -10 : this.h[n];
  }

  wet(x: number, z: number): boolean {
    const n = this.index(x, z);
    return n >= 0 && this.water[n] === 1;
  }

  /** Lowest and highest top in the square of half-size `r` around (x, z), and whether water is in it. */
  range(x: number, z: number, r: number): { lo: number; hi: number; wet: boolean } {
    let lo = Infinity;
    let hi = -Infinity;
    let wet = false;
    for (let a = x - r; a <= x + r + 1e-6; a += this.cell)
      for (let b = z - r; b <= z + r + 1e-6; b += this.cell) {
        const h = this.at(a, b);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
        wet ||= this.wet(a, b);
      }
    return { lo, hi, wet };
  }

  /** Level, dry ground at height `y` (± 2 cm) all around (x, z) within `r`. */
  clear(x: number, z: number, r: number, y = 0): boolean {
    const { lo, hi, wet } = this.range(x, z, r);
    return !wet && lo > y - 0.02 && hi < y + 0.02;
  }

  /** Distance (metres, up to `max`) from (x, z) to the nearest cell standing more than `rise` above `y`. */
  near(x: number, z: number, max: number, y = 0, rise = 0.1): number {
    let best = max;
    for (let a = -max; a <= max + 1e-6; a += this.cell)
      for (let b = -max; b <= max + 1e-6; b += this.cell) {
        const d = Math.hypot(a, b);
        if (d < best && this.at(x + a, z + b) > y + rise) best = d;
      }
    return best;
  }
}

/** Tones of the fern-like seedlings in the sheet's rubble: dark stems, lime leaves, pale tips. */
const FERN = { stem: [0x3e5a2e, 0x46642f], leaf: [LEAF.bright[0], LEAF.bright[2], LEAF.yellowish[2], 0x6f9a36], tip: [LEAF.bright[3], LEAF.yellowish[1], 0x9cc24a] };

/**
 * One grass grid (texel cells on the world grid) for a whole scene: tufts,
 * clumps, seedlings, flowers and ferns rooted on the ground or on the top of
 * a stone (from the height map), cells that would sink into stone or stand in
 * the water dropped, emitted as blade stalks with sunlit tips (`commitGrass`).
 */
export class Greenery {
  readonly g: VoxelGrid;
  private n = 0;

  /** `keep`: areas left bare (a drain's channel, a rim that should read clean). */
  constructor(
    private readonly p: PieceBuilder,
    private readonly heights: Heights,
    readonly seed: number,
    private readonly keep: readonly Rect[] = [],
  ) {
    this.g = grassGrid(p, [0, 0, 0], seed);
  }

  private kept(x: number, z: number): boolean {
    return this.keep.some((q) => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1);
  }

  /**
   * Root cell of a plant at (x, z): its column and the row just above the
   * surface there (null off the map or on the water); ghosts the surface
   * around it so the base gets its contact shade.
   */
  private root(x: number, z: number, r = 2): [number, number, number] | null {
    const y = this.heights.at(x, z);
    if (y < -5 || this.heights.wet(x, z) || this.kept(x, z)) return null;
    const i = Math.floor(x / TEXEL);
    const k = Math.floor(z / TEXEL);
    const j = Math.round(y / TEXEL);
    for (let a = i - r; a <= i + r; a++) for (let b = k - r; b <= k + r; b++) if (!this.g.has(a, j - 1, b)) this.g.ghost(a, j - 1, b);
    return [i, j, k];
  }

  private next(): number {
    return this.seed * 1000 + this.n++;
  }

  tuft(x: number, z: number, o: TuftOptions = {}): void {
    const at = this.root(x, z, Math.ceil((o.radius ?? 1.5) + 2));
    if (at) grassTuft(this.g, at[0], at[2], { seed: this.next(), ...o, j: at[1] });
  }

  /** A mounded clump of tufts filling an ellipse (radii in texels). */
  clump(x: number, z: number, o: ClumpOptions): void {
    const at = this.root(x, z, Math.ceil(Math.max(o.rx, o.rz) + 3));
    if (at) grassClump(this.g, at[0], at[2], { seed: this.next(), ...o, j: at[1] });
  }

  plus(x: number, z: number, o: { height?: number; tones?: GrassTones } = {}): void {
    const at = this.root(x, z, 2);
    if (at) plusTuft(this.g, at[0], at[2], { ...o, j: at[1], seed: this.next() });
  }

  sprout(x: number, z: number, tones?: GrassTones): void {
    const at = this.root(x, z, 1);
    if (at) sprout(this.g, at[0], at[2], { j: at[1], tones, seed: this.next() });
  }

  plant(x: number, z: number, o: { height?: number; tones?: GrassTones } = {}): void {
    const at = this.root(x, z, 3);
    if (at) smallPlant(this.g, at[0], at[2], { ...o, j: at[1], seed: this.next() });
  }

  flower(x: number, z: number, petals: readonly number[], h?: number, tones?: GrassTones): void {
    const at = this.root(x, z, 1);
    if (at) flower(this.g, at[0], at[2], { j: at[1], h, petals, tones, seed: this.next() });
  }

  /**
   * A fern-like seedling, as the sheet sprinkles through its rubble: a few
   * fronds rising from a dark heart and arching out and down, leaflets on
   * alternate sides, lime leaves with pale tips. `size` = frond length (texels).
   */
  fern(x: number, z: number, size = 4): void {
    const at = this.root(x, z, size + 1);
    if (!at) return;
    const [i, j, k] = at;
    const seed = this.next();
    const r = rng(seed);
    const set = (a: number, y: number, b: number, tones: readonly number[]) => {
      if (!this.g.has(a, y, b)) this.g.set(a, y, b, tones[Math.floor(hash3(a, y, b, seed) * tones.length)]);
    };
    const fronds = r.int(4, 6);
    const a0 = r.range(0, Math.PI * 2);
    set(i, j, k, FERN.stem);
    for (let f = 0; f < fronds; f++) {
      const a = a0 + (f / fronds) * Math.PI * 2 + r.range(-0.3, 0.3);
      const len = Math.max(2, size + r.int(-1, 1));
      const rise = r.int(1, 2);
      // Spine: up out of the heart, then out along the heading, arching over.
      for (let t = 1; t <= len; t++) {
        const s = t / len;
        const a1 = i + Math.round(Math.cos(a) * t);
        const b1 = k + Math.round(Math.sin(a) * t);
        const y = j + Math.round(rise + Math.sin(Math.PI * Math.min(1, s * 1.2)) * (len * 0.45) - s * s * 1.5);
        set(a1, y, b1, t === len ? FERN.tip : FERN.leaf);
        if (t === 1) for (let u = j; u < y; u++) set(i, u, k, FERN.stem);
        // Leaflets on alternate sides, across the heading.
        if (t > 1 && t < len && (t + f) % 2 === 0) {
          const side = t % 4 < 2 ? 1 : -1;
          set(a1 + Math.round(-Math.sin(a) * side), y, b1 + Math.round(Math.cos(a) * side), FERN.leaf);
        }
      }
    }
  }

  /** Emit: drop cells inside stone (or over water, or in a kept area), then the stalks with their sunlit caps. */
  commit(): void {
    const drop: [number, number, number][] = [];
    const h = this.heights;
    this.g.forEach((i, j, k, c) => {
      if (c.ghost) return;
      const x = (i + 0.5) * TEXEL;
      const z = (k + 0.5) * TEXEL;
      const y = (j + 0.5) * TEXEL;
      if (y < h.at(x, z) || h.wet(x, z) || this.kept(x, z)) drop.push([i, j, k]);
    });
    for (const [i, j, k] of drop) this.g.delete(i, j, k);
    commitGrass(this.p, this.g, { seed: this.seed });
  }
}

/** The §20 sheet's leaves: lobed blades, now and then an oval one or a star. */
const LITTER_SHAPES = [LEAF_SHAPES.oak, LEAF_SHAPES.oak, LEAF_SHAPES.oval, LEAF_SHAPES.star];

/**
 * Fallen leaves over an area: rosettes at `clusters` (n leaves each) and
 * `singles` loose leaves spread between them, all resting on what the height
 * map says lies there (the ground, a stone's top) — never on the water.
 */
export function litter(p: PieceBuilder, heights: Heights, o: { area: Rect; clusters: readonly [number, number, number][]; singles: number; palette: readonly number[]; seed: number; keep?: (x: number, z: number) => boolean }): void {
  const ground = (x: number, z: number) => (heights.wet(x, z) ? -Infinity : heights.at(x, z));
  o.clusters.forEach(([x, z, n], c) => {
    if (heights.range(x, z, 0.3).wet) return;
    leafCluster(p, { x, z, count: n, palette: o.palette, shapes: LITTER_SHAPES, size: [0.1, 0.19], torn: 0.25, seed: o.seed * 31 + c, ground });
  });
  if (o.singles <= 0) return;
  // Loose leaves: a bed per 4 m square, so each one's height map stays small.
  const r = rng(o.seed * 7 + 1);
  const { x0, z0, x1, z1 } = o.area;
  const perArea = o.singles / ((x1 - x0) * (z1 - z0));
  for (let x = x0; x < x1 - 1e-6; x += 4)
    for (let z = z0; z < z1 - 1e-6; z += 4) {
      const w = Math.min(4, x1 - x);
      const d = Math.min(4, z1 - z);
      const bed = new LeafBed({ x: x + w / 2, z: z + d / 2, w, d, ground, res: TEXEL / 2 });
      const n = Math.round(perArea * w * d * r.range(0.6, 1.4));
      for (let t = 0; t < n; t++) {
        const lx = r.range(x, x + w);
        const lz = r.range(z, z + d);
        if (o.keep && !o.keep(lx, lz)) continue;
        if (heights.range(lx, lz, 0.1).wet) continue;
        scatterLeaves(p, { x: lx, z: lz, r: 0.05, count: 1, palette: o.palette, shapes: LITTER_SHAPES, size: [0.1, 0.18], torn: 0.3, seed: o.seed * 101 + Math.round(x * 13 + z * 7) * 50 + t, bed });
      }
      bed.commit(p);
    }
}

export interface RuinOptions {
  /** Length along x (the wall runs −length/2 … length/2, its face at z = 0 looking +Z, `depth` behind). */
  length: number;
  depth?: number;
  /** Height the masonry still stands at along the wall (x in piece space): its broken top. */
  top: (x: number) => number;
  palette: readonly number[];
  /** Pattern amounts of a block by the height of its centre (moss creeps down from the top). */
  surf: (y: number) => Surf;
  /** Chipped edges (0‥1). */
  wear: number;
  seed: number;
  /** Pilasters proud of the face at these x. */
  pilasters?: readonly number[];
  /** A projecting base course. */
  plinth?: boolean;
  /** Front-skin blocks fallen out of the face (share). */
  holes?: number;
}

/**
 * A ruined temple wall — the stand-in for the galleries of later sections:
 * 0.5 m courses of dressed blocks with staggered joints, two skins deep, a
 * projecting base course, pilasters, the top broken down to `top` block by
 * block, a few stones fallen out of the face and bites out of the broken
 * edge. Faces +Z. One collider per standing stone.
 */
export function ruinWall(o: RuinOptions): KitPiece {
  const p = new PieceBuilder();
  const set = new BlockSet(0.125);
  const r = rng(o.seed);
  const L = o.length;
  const D = o.depth ?? 1;
  const course = 0.5;
  const base = o.plinth ? 0.5 : 0;
  let hi = 0;
  for (let x = -L / 2; x <= L / 2; x += 0.25) hi = Math.max(hi, o.top(x));
  hi = Math.ceil(hi / course) * course;
  const style = (id: number) => {
    if (id < 0) return {};
    const { min, max } = set.boxOf(id);
    return { surf: o.surf((min[1] + max[1]) / 2) };
  };
  if (o.plinth) masonry(set, -L / 2, 0, -D, L / 2, base, 0.25, { length: [0.75, 1.5], course: base, depth: 0.625, axis: 'x', palette: o.palette, style, seed: o.seed });
  for (const px of o.pilasters ?? []) masonry(set, px - 0.375, base, 0, px + 0.375, hi, 0.25, { length: [0.75, 0.75], course, axis: 'x', palette: o.palette, style, seed: o.seed + 7 + Math.round(px * 4) });
  masonry(set, -L / 2, base, -D, L / 2, hi, 0, { length: [0.5, 1.25], course, depth: 0.5, axis: 'x', palette: o.palette, style, seed: o.seed + 1 });
  // The broken top: every stone above the line is gone.
  for (const id of set.find((x, y) => y > o.top(x))) set.remove(id);
  // Stones fallen out of the face (never the base course or the top one).
  for (const id of set.find((x, y, z) => z > -0.5 && y > base + course && y < o.top(x) - course)) if (r.chance(o.holes ?? 0)) set.remove(id);
  set.erode(o.wear, o.seed + 3, { where: (_x, y) => y > 0.2 });
  for (const id of set.find((x, y) => y > o.top(x) - course)) {
    if (!r.chance(0.3)) continue;
    const { min, max } = set.boxOf(id);
    set.carveSphere(r.chance(0.5) ? min[0] : max[0], max[1], r.range(min[2], max[2]), r.range(0.15, 0.3), o.seed + id);
  }
  set.emit(p.voxels, { seed: o.seed });
  dress(p, set, o.seed);
  for (const id of set.find(() => true)) {
    const { min, max } = set.boxOf(id);
    p.collider(min[0], min[1], min[2], max[0], max[1], max[2]);
  }
  return p.done();
}

/** The §20 props' finish on a laid block set: dark pores pocking the faces and a dark line along every flush joint. */
export function dress(p: PieceBuilder, set: BlockSet, seed: number, porosity = 6): void {
  pores(p, set, seed, porosity);
  joints(p, set, seed);
}

/**
 * A pillar stub: a moulded base, square drums of `size` stacked to `height`,
 * the top one broken off at a slant, chipped; `palette` / `surf` as the walls.
 */
export function pillarStub(o: { size: number; height: number; palette: readonly number[]; surf: (y: number) => Surf; wear: number; seed: number }): KitPiece {
  const p = new PieceBuilder();
  const set = new BlockSet(0.125);
  const r = rng(o.seed);
  const s = o.size / 2;
  const tone = (n: number) => o.palette[Math.floor(hash3(n, 5, 3, o.seed) * o.palette.length)];
  set.add(-s - 0.125, 0, -s - 0.125, s + 0.125, 0.375, s + 0.125, tone(0), { surf: o.surf(0.2) });
  let y = 0.375;
  for (let n = 1; y < o.height - 1e-6; n++) {
    const h = Math.min(snap(r.range(0.5, 0.625), 0.125), o.height - y);
    set.add(-s, y, -s, s, y + h, s, tone(n), { surf: o.surf(y + h / 2) });
    y += h;
  }
  // Broken off: a slanting bite out of the top, chips round the edges.
  const a = r.range(0, Math.PI * 2);
  set.carve((x, yy, z) => yy > o.height - 0.3 && yy - (o.height - 0.3) > (x * Math.cos(a) + z * Math.sin(a) + s) * 0.45 + valueNoise3(x * 6, yy * 6, z * 6, o.seed) * 0.12);
  set.erode(o.wear, o.seed + 1, { where: (_x, yy) => yy > 0.4 });
  set.emit(p.voxels, { seed: o.seed });
  dress(p, set, o.seed);
  p.collider(-s - 0.125, 0, -s - 0.125, s + 0.125, 0.375, s + 0.125);
  p.collider(-s, 0.375, -s, s, o.height - 0.15, s);
  return p.done();
}

/** Seeded points in a rectangle, at least `gap` apart and each passing `ok`. */
export function spots(seed: number, area: Rect, n: number, gap: number, ok: (x: number, z: number) => boolean = () => true): [number, number][] {
  const r = rng(seed);
  const out: [number, number][] = [];
  for (let t = 0; t < n * 40 && out.length < n; t++) {
    const x = r.range(area.x0, area.x1);
    const z = r.range(area.z0, area.z1);
    if (!ok(x, z) || out.some(([a, b]) => Math.hypot(a - x, b - z) < gap)) continue;
    out.push([x, z]);
  }
  return out;
}
