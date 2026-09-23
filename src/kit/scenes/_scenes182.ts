import { hash3, valueNoise3 } from '../../voxel/random';
import { VoxelBuilder, type Surf, type VoxelBox, type VoxelGrid } from '../../voxel/VoxelBuilder';
import { onTop } from '../assets/18.2/_tiles';
import { commitGrass, flower, ghostGround, grassGrid, grassTuft, plusTuft, smallPlant, type TuftOptions } from '../lib/grass';
import { placePiece } from '../place';
import type { PieceBuilder } from '../PieceBuilder';
import type { KitSceneContext } from '../scene';
import { here, rng, TEXEL, type Rng } from '../shapes';
import type { KitPiece } from '../types';

/**
 * Ground work of the §18.2 "In-game usage examples": a scene's floor as a 1 m
 * grid of cells, each paved, laid with a §18.2 ground tile (the kit's ground
 * system, tile by tile) or plain ground, plus the paving itself, the moss in
 * its joints and the grass and plants over everything.
 *
 * Tiles side by side only show their tops, so the side skins a neighbour hides
 * are left out when they are placed — about half of every tile — which is what
 * lets a scene lay dozens of them within its block budget.
 */

/** A §18.2 tile on a scene cell: asset id, variant, seed and quarter turns. */
export interface TileRef {
  id: string;
  variant: string;
  seed?: number;
  turn?: number;
}

/** Plain ground: one soil block per run of cells, top at y = 0. */
export interface SoilLook {
  color: number;
  surf: Surf;
}

export type Cell = { kind: 'pave' } | { kind: 'tile'; tile: TileRef } | { kind: 'soil'; look: SoilLook } | { kind: 'none' };

export const PAVE: Cell = { kind: 'pave' };
/** Covered by something else (a terrace, a building): no ground drawn. */
export const NONE: Cell = { kind: 'none' };
export const tile = (id: string, variant: string, seed = 1, turn = 0): Cell => ({ kind: 'tile', tile: { id, variant, seed, turn } });
export const soil = (look: SoilLook): Cell => ({ kind: 'soil', look });

/** Tiles stand this much proud of plain ground, so a soil block's merged edge slips under their top instead of z-fighting with it. */
const LIFT = 0.0005;
/** Joints between slabs: one texel wide, open two texels deep to the bed of dark earth. */
const JOINT = TEXEL;
const JOINT_DEPTH = 2 * TEXEL;

/** Dark humus of the bed under the paving (the sandstone-path tile's joint earth). */
const BED = onTop(0x4a3d2c);

/** The scene's floor plan: cell (i, k) covers x0 + i ‥ x0 + i + 1, z0 + k ‥ z0 + k + 1. */
export class GroundPlan {
  private readonly cells: Cell[];

  constructor(
    readonly x0: number,
    readonly z0: number,
    readonly nx: number,
    readonly nz: number,
    fill: Cell,
  ) {
    this.cells = new Array<Cell>(nx * nz).fill(fill);
  }

  at(i: number, k: number): Cell | undefined {
    return i >= 0 && k >= 0 && i < this.nx && k < this.nz ? this.cells[k * this.nx + i] : undefined;
  }

  /** The cell under a point (metres). */
  cellAt(x: number, z: number): Cell | undefined {
    return this.at(Math.floor(x - this.x0), Math.floor(z - this.z0));
  }

  set(i: number, k: number, c: Cell): this {
    if (i >= 0 && k >= 0 && i < this.nx && k < this.nz) this.cells[k * this.nx + i] = c;
    return this;
  }

  /** Every cell whose centre lies in the rectangle (metres). */
  rect(x0: number, z0: number, x1: number, z1: number, c: Cell | ((i: number, k: number) => Cell)): this {
    for (let k = 0; k < this.nz; k++)
      for (let i = 0; i < this.nx; i++) {
        const x = this.x0 + i + 0.5;
        const z = this.z0 + k + 0.5;
        if (x > x0 && x < x1 && z > z0 && z < z1) this.set(i, k, typeof c === 'function' ? c(i, k) : c);
      }
    return this;
  }

  /**
   * Does the cell hide a tile's side? Tiles and plain ground are solid up to
   * y = 0; under a terrace or a flight (`none`) the side is shut in where no
   * one sees it. Paving leaves it open in the joint, the scene's edge too.
   */
  solid(i: number, k: number): boolean {
    const c = this.at(i, k);
    return !!c && c.kind !== 'pave';
  }
}

/** Turn (x, z) by quarter turns like placePiece: turn 1 maps +Z to +X. */
function turnXZ(x: number, z: number, turn: number): [number, number] {
  switch (turn & 3) {
    case 1:
      return [z, -x];
    case 2:
      return [-x, -z];
    case 3:
      return [-z, x];
    default:
      return [x, z];
  }
}

/** A tile's four sides in piece space: direction and `open` bit of their skin plates. */
const SIDES: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 2],
  [0, 1, 16],
  [0, -1, 32],
];
const E = 1e-4;

/** Thinnest detail laid flat on a tile's side (leaves pressed into it): at most this thick, this far out. */
const FLAT = 0.02;
const NEAR = 0.04;

/**
 * Is a box of a tile hidden behind the sides in `hide` (open bits)? A plate
 * of the skin on one of those sides; detail hanging down outside it (grass
 * drips, roots, leaves folded over the edge); or thin detail flat against it
 * below the top (leaves pressed into the side) — all buried by the neighbour.
 */
function hidden(b: VoxelBox, hide: number): boolean {
  if (b.rx || b.ry || b.rz) return false;
  const [x0, x1, z0, z1] = [b.x - b.sx / 2, b.x + b.sx / 2, b.z - b.sz / 2, b.z + b.sz / 2];
  const o = b.open ?? 63;
  const plate = (bit: number, at: boolean) => o === bit && (hide & bit) !== 0 && at;
  if (plate(1, Math.abs(x1 - 0.5) < E) || plate(2, Math.abs(x0 + 0.5) < E) || plate(16, Math.abs(z1 - 0.5) < E) || plate(32, Math.abs(z0 + 0.5) < E)) return true;
  const top = b.y + b.sy / 2;
  if (top > E) return false;
  const low = top < -E;
  const beyond = (bit: number, out: boolean, flat: boolean) => (hide & bit) !== 0 && (out || (low && flat));
  return (
    beyond(1, x0 > 0.5 - E, b.sx < FLAT && x0 > 0.5 - NEAR) ||
    beyond(2, x1 < -0.5 + E, b.sx < FLAT && x1 < -0.5 + NEAR) ||
    beyond(16, z0 > 0.5 - E, b.sz < FLAT && z0 > 0.5 - NEAR) ||
    beyond(32, z1 < -0.5 + E, b.sz < FLAT && z1 < -0.5 + NEAR)
  );
}

const trimmed = new WeakMap<KitPiece, Map<number, KitPiece>>();

/** The piece without what its covered sides hide (cached per piece and mask). */
function trim(piece: KitPiece, hide: number): KitPiece {
  let byMask = trimmed.get(piece);
  if (!byMask) trimmed.set(piece, (byMask = new Map()));
  let out = byMask.get(hide);
  if (!out) {
    const v = new VoxelBuilder();
    for (const b of piece.voxels.boxes) if (!hidden(b, hide)) v.boxes.push(b);
    out = { voxels: v, colliders: [], extras: piece.extras };
    byMask.set(hide, out);
  }
  return out;
}

/**
 * Lay the plan: its tiles (built through the scene context, the sides their
 * neighbours hide left out), plain ground as one soil block per run of equal
 * cells, and the bed of dark earth under the paving. One collider covers the
 * whole plan (tiles and slabs are walkable at y = 0).
 */
export async function layGround(ctx: KitSceneContext, p: PieceBuilder, plan: GroundPlan): Promise<void> {
  const target = { voxels: p.voxels };
  for (let k = 0; k < plan.nz; k++)
    for (let i = 0; i < plan.nx; i++) {
      const c = plan.at(i, k);
      if (c?.kind !== 'tile') continue;
      const t = c.tile;
      const piece = await ctx.get(t.id, { variant: t.variant, seed: t.seed ?? 1 });
      if (!piece) {
        // Not built (yet): plain earth in its place.
        p.voxels.span(plan.x0 + i, -0.5, plan.z0 + k, plan.x0 + i + 1, 0, plan.z0 + k + 1, BED, 'soil', { surf: [0.2, 0.3, 0, 0.4] });
        continue;
      }
      const turn = t.turn ?? 0;
      let hide = 0;
      for (const [dx, dz, bit] of SIDES) {
        const [wx, wz] = turnXZ(dx, dz, turn);
        if (plan.solid(i + wx, k + wz)) hide |= bit;
      }
      placePiece(target, hide ? trim(piece, hide) : piece, { x: plan.x0 + i + 0.5, y: LIFT, z: plan.z0 + k + 0.5, turn });
    }

  // Plain ground and the paving bed: greedy rectangles of equal cells.
  const done = new Uint8Array(plan.nx * plan.nz);
  const keyOf = (c: Cell | undefined) => (c?.kind === 'soil' ? c.look : c?.kind === 'pave' ? PAVE : null);
  for (let k = 0; k < plan.nz; k++)
    for (let i = 0; i < plan.nx; i++) {
      const key = keyOf(plan.at(i, k));
      if (!key || done[k * plan.nx + i]) continue;
      let w = 1;
      while (i + w < plan.nx && !done[k * plan.nx + i + w] && keyOf(plan.at(i + w, k)) === key) w++;
      let d = 1;
      grow: while (k + d < plan.nz) {
        for (let x = i; x < i + w; x++) if (done[(k + d) * plan.nx + x] || keyOf(plan.at(x, k + d)) !== key) break grow;
        d++;
      }
      for (let z = k; z < k + d; z++) for (let x = i; x < i + w; x++) done[z * plan.nx + x] = 1;
      // Sides that run on into the same ground (or under a tile) are merged: no bevel, no seam.
      const along = (cells: [number, number][]) => cells.every(([a, b]) => keyOf(plan.at(a, b)) === key || plan.at(a, b)?.kind === 'tile');
      const range = (n: number, f: (t: number) => [number, number]) => Array.from({ length: n }, (_, t) => f(t));
      const sides = [
        along(range(d, (t) => [i + w, k + t])),
        along(range(d, (t) => [i - 1, k + t])),
        along(range(w, (t) => [i + t, k + d])),
        along(range(w, (t) => [i + t, k - 1])),
      ];
      const merge = (sides[0] ? 1 : 0) | (sides[1] ? 2 : 0) | (sides[2] ? 16 : 0) | (sides[3] ? 32 : 0);
      const [x0, z0, x1, z1] = [plan.x0 + i, plan.z0 + k, plan.x0 + i + w, plan.z0 + k + d];
      if (key === PAVE) p.voxels.span(x0, -0.5, z0, x1, -JOINT_DEPTH, z1, BED, 'soil', { surf: [0, 0.35, 0, 0.6], merge, open: 63 & ~merge });
      else {
        const look = key as SoilLook;
        p.voxels.span(x0, -0.5, z0, x1, 0, z1, look.color, 'soil', { surf: look.surf, merge, open: 63 & ~merge });
      }
    }
  p.collider(plan.x0, -0.5, plan.z0, plan.x0 + plan.nx, 0, plan.z0 + plan.nz);
}

// ── Paving ────────────────────────────────────────────────────────────────────

/** One slab as laid: its footprint (joint excluded) and how it sits. */
export interface Slab {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Height of its top (0 = flush; tilted slabs: at the centre). */
  top: number;
  tilted: boolean;
  /** Gone: moss and grass fill its bed. */
  gone: boolean;
}

export interface PavingOptions {
  /** Row depth along z (default 0.5 m: two rows to a cell). */
  row?: number;
  /** Slab lengths along x (metres, on the quarter metre). */
  length: [number, number];
  /** Slab thickness (default 0.25 m). */
  thick?: number;
  /** Stone tones (albedo). */
  palette: readonly number[];
  /** Pattern amounts of a slab at (x, z): moss, lichen and stain grow towards the edges. */
  surf: (x: number, z: number) => Surf;
  seed: number;
  /** Shares of slabs lifted / sunk a half texel, and tilted a few degrees (default 0.12, 0.1, 0.14). */
  lift?: number;
  sink?: number;
  tilt?: number;
  /** Share of slabs cracked in two, the pieces settled apart (default 0.06). */
  split?: number;
  /** Share of slabs gone, the bed showing (default 0.03). */
  missing?: number;
}

/** Earth grown over with moss and grass where a slab is gone. */
const GONE = 0x5a4a38;

/**
 * Pave the plan's `pave` cells: rows of slabs along x with staggered joints,
 * each slab one sandstone block (the pattern draws its texels) a joint's width
 * short of its neighbours, over the plan's bed of dark earth. Worn and uneven:
 * some slabs stand proud or sink a little, some tilt, a few are cracked in two
 * or gone (moss and grass in their place). Returns the slabs (for moss and
 * grass along their joints).
 */
export function pave(p: PieceBuilder, plan: GroundPlan, o: PavingOptions): Slab[] {
  const r = rng(o.seed * 31 + 7);
  const src = here();
  const row = o.row ?? 0.5;
  const T = o.thick ?? 0.25;
  const slabs: Slab[] = [];
  const q = (v: number) => Math.round(v * 4) / 4;
  const [lift, sink, tilt, split, missing] = [o.lift ?? 0.12, o.sink ?? 0.1, o.tilt ?? 0.14, o.split ?? 0.06, o.missing ?? 0.03];
  const lay = (x0: number, z0: number, x1: number, z1: number) => {
    const u = r();
    const color = o.palette[Math.floor(hash3(Math.round(x0 * 4), Math.round(z0 * 4), 3, o.seed) * o.palette.length)];
    const surf = o.surf((x0 + x1) / 2, (z0 + z1) / 2);
    if (u < missing) {
      p.voxels.span(x0, -T, z0, x1, -TEXEL, z1, GONE, 'soil', { surf: [0.75, 0.7, 0, 0.3], src });
      slabs.push({ x0, z0, x1, z1, top: -TEXEL, tilted: false, gone: true });
      return;
    }
    if (u < missing + split && x1 - x0 >= 0.75) {
      // Cracked across: two pieces a texel apart, one settled lower and tilted.
      const cut = x0 + Math.round(((x1 - x0) * r.range(0.35, 0.65)) / TEXEL) * TEXEL;
      put(x0, z0, cut - JOINT / 2, z1, color, surf, 0, 0, 0);
      put(cut + JOINT / 2, z0, x1, z1, color, surf, -TEXEL / 2, r.range(0.03, 0.06) * (r.chance(0.5) ? 1 : -1), 0);
      return;
    }
    const v = (u - missing - split) / (1 - missing - split);
    if (v < tilt) {
      const a = r.range(0.025, 0.055) * (r.chance(0.5) ? 1 : -1);
      if (r.chance(0.5)) put(x0, z0, x1, z1, color, surf, TEXEL / 4, 0, a);
      else put(x0, z0, x1, z1, color, surf, TEXEL / 4, a, 0);
    } else if (v < tilt + lift) put(x0, z0, x1, z1, color, surf, TEXEL / 2, 0, 0);
    else if (v < tilt + lift + sink) put(x0, z0, x1, z1, color, surf, -TEXEL / 2, 0, 0);
    else put(x0, z0, x1, z1, color, surf, 0, 0, 0);
  };
  function put(x0: number, z0: number, x1: number, z1: number, color: number, surf: Surf, top: number, rx: number, rz: number): void {
    const tilted = !!(rx || rz);
    p.voxels.box((x0 + x1) / 2, top - T / 2, (z0 + z1) / 2, x1 - x0, T, z1 - z0, color, 'sandstone', { surf, rx, rz, shade: 0.96 + r() * 0.08, src });
    slabs.push({ x0, z0, x1, z1, top, tilted, gone: false });
  }
  for (let k = 0; k < plan.nz; k++) {
    // Runs of paved cells in this row of cells.
    const runs: [number, number][] = [];
    for (let i = 0; i < plan.nx; i++) {
      if (plan.at(i, k)?.kind !== 'pave') continue;
      if (runs.length && runs[runs.length - 1][1] === i) runs[runs.length - 1][1] = i + 1;
      else runs.push([i, i + 1]);
    }
    const perCell = Math.round(1 / row);
    for (let h = 0; h < perCell; h++) {
      const z0 = plan.z0 + k + h * row;
      const n = k * perCell + h;
      for (const [ia, ib] of runs) {
        const [xa, xb] = [plan.x0 + ia, plan.x0 + ib];
        // Running bond: every other row starts with a part slab.
        let a = xa;
        if (n % 2 && xb - xa > 1) {
          const off = q(r.range(0.25, 0.5));
          lay(a, z0, a + off - JOINT, z0 + row - JOINT);
          a += off;
        }
        while (a < xb - 1e-6) {
          let len = q(r.range(o.length[0], o.length[1]));
          if (xb - (a + len) < 0.5) len = xb - a;
          lay(a, z0, a + len - JOINT, z0 + row - JOINT);
          a += len;
        }
      }
    }
  }
  return slabs;
}

// ── Moss in the joints ────────────────────────────────────────────────────────

/** Joint moss of the sandstone-path tile (its sheet tones), for strips that match the tiles beside them. */
const JOINT_MOSS = [0x5e5c24, 0x7a7424, 0x948c26, 0x4a4a20, 0xa89c34].map(onTop);

/**
 * Moss along the joints of the slabs where `amount(x, z)` (0‥1) is high: a
 * strip filling the joint almost to the top, spilling a texel or two over the
 * flat slabs' edges in little cushions — as the sheet's path, where moss
 * fills some joints and not others.
 */
export function jointMoss(p: PieceBuilder, slabs: readonly Slab[], amount: (x: number, z: number) => number, seed: number): void {
  const r = rng(seed * 13 + 1);
  const src = here();
  const tone = () => r.pick(JOINT_MOSS);
  for (const s of slabs) {
    // The joints on the slab's +x and +z sides (the next slab starts a joint's width on).
    const segs: [number, number, number, number, 'x' | 'z'][] = [
      [s.x1, s.z0, s.x1 + JOINT, s.z1 + JOINT, 'z'],
      [s.x0, s.z1, s.x1, s.z1 + JOINT, 'x'],
    ];
    for (const [x0, z0, x1, z1, axis] of segs) {
      const f = amount((x0 + x1) / 2, (z0 + z1) / 2);
      if (f <= 0 || r() > f) continue;
      const top = f > 0.7 && r.chance(0.5) ? TEXEL / 4 : -TEXEL / 4;
      p.voxels.span(x0, -JOINT_DEPTH, z0, x1, top, z1, tone(), 'leaves', { shade: 0.9 + r() * 0.15, src });
      if (s.tilted || s.gone || f < 0.45) continue;
      // Cushions over the slab's edge along this joint.
      const len = axis === 'z' ? z1 - z0 : x1 - x0;
      const n = Math.round(len / TEXEL);
      for (let t = 0; t < n; t++) {
        if (valueNoise3(t * 0.45, x0 * 3, z0 * 3, seed) < 1.05 - f) continue;
        const w = r.chance(f * 0.6) ? 2 : 1;
        const h = r.chance(0.3) ? TEXEL / 2 : TEXEL / 4;
        if (axis === 'z') p.voxels.span(x0 - w * TEXEL, s.top, z0 + t * TEXEL, x0, s.top + h, z0 + (t + 1) * TEXEL, tone(), 'leaves', { src });
        else p.voxels.span(x0 + t * TEXEL, s.top, z0 - w * TEXEL, x0 + (t + 1) * TEXEL, s.top + h, z0, tone(), 'leaves', { src });
      }
    }
  }
}

// ── Grass and plants ──────────────────────────────────────────────────────────

/**
 * Grass, plants and flowers anywhere in a scene: one texel grid in scene space
 * (lib/grass), rooted at any height, emitted at the end with commitGrass.
 */
export class Greenery {
  readonly g: VoxelGrid;

  constructor(
    readonly p: PieceBuilder,
    readonly seed: number,
  ) {
    this.g = grassGrid(p, [0, 0, 0], seed);
  }

  /** Texel cell of a point (metres) and ghost ground under a patch of radius `r` texels. */
  private root(x: number, y: number, z: number, r: number): [number, number, number] {
    const [i, j, k] = [Math.floor(x / TEXEL), Math.round(y / TEXEL), Math.floor(z / TEXEL)];
    ghostGround(this.g, i - r, k - r, i + r, k + r, j);
    return [i, j, k];
  }

  tuft(x: number, y: number, z: number, o: TuftOptions = {}): this {
    const [i, j, k] = this.root(x, y, z, 3);
    grassTuft(this.g, i, k, { ...o, j });
    return this;
  }

  plus(x: number, y: number, z: number, o: Parameters<typeof plusTuft>[3] = {}): this {
    const [i, j, k] = this.root(x, y, z, 1);
    plusTuft(this.g, i, k, { ...o, j });
    return this;
  }

  plant(x: number, y: number, z: number, o: Parameters<typeof smallPlant>[3] = {}): this {
    const [i, j, k] = this.root(x, y, z, 2);
    smallPlant(this.g, i, k, { ...o, j });
    return this;
  }

  flower(x: number, y: number, z: number, o: Parameters<typeof flower>[3] = {}): this {
    const [i, j, k] = this.root(x, y, z, 1);
    flower(this.g, i, k, { ...o, j });
    return this;
  }

  commit(sun = 0.4): void {
    commitGrass(this.p, this.g, { seed: this.seed, sun });
  }
}

/** Seeded points in a rectangle (metres), at least `gap` apart. */
export function spots(r: Rng, n: number, x0: number, z0: number, x1: number, z1: number, gap: number, ok: (x: number, z: number) => boolean = () => true): [number, number][] {
  const out: [number, number][] = [];
  for (let t = 0; t < n * 30 && out.length < n; t++) {
    const x = r.range(x0, x1);
    const z = r.range(z0, z1);
    if (ok(x, z) && out.every(([a, b]) => Math.hypot(a - x, b - z) >= gap)) out.push([x, z]);
  }
  return out;
}
