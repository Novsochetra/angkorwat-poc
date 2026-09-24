import { traceSource, type SourceTrace } from '../feedback/sourceTrace';
import { hash3 } from './random';
import type { VoxelMaterialKey } from './materials';

/**
 * Per-block amounts (0‥1) for the pixel-art pattern of its material family —
 * stone: [moss, lichen, cracks, stain], soil: [grass, moss, dry, wet],
 * leaf: [flowers, yellowing, 0, 0], bark: [moss, lichen, 0, stain]. See materials.ts.
 */
export type Surf = readonly [number, number, number, number];

/** One rounded block. Coordinates are in the builder's space (character: body units). */
export interface VoxelBox {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  /** sRGB hex colour. */
  color: number;
  /** Brightness multiplier baked from ambient occlusion and colour jitter. */
  shade: number;
  mat: VoxelMaterialKey;
  /**
   * Exposed faces bitmask (+x 1, −x 2, +y 4, −y 8, +z 16, −z 32). Rims are only
   * painted on edges between two exposed faces, so flush neighbours show a soft
   * seam while real steps get the warm highlight. Free boxes default to 63.
   */
  open?: number;
  /** Pattern amounts for kit families with a pixel-art surface (see {@link Surf}). */
  surf?: Surf;
  /**
   * Sides (same bits as `open`) that continue into the same stone — e.g. the
   * cells of one carved block: no bevel there, so the cells read as one block.
   * Patterned families only.
   */
  merge?: number;
  /**
   * Sides (same bits as `open`) that butt against another block — masonry
   * joints. The family's `gap` pulls them in, so a thin dark joint shows
   * between neighbouring stones.
   */
  joint?: number;
  /**
   * Bevel radius in metres, in place of the family's `bevel` ratio — e.g. the
   * cells of a carved block keep the rounding of their whole stone.
   */
  radius?: number;
  /** Optional Euler rotation (radians, XYZ). */
  rx?: number;
  ry?: number;
  rz?: number;
  /** The code that created this box (dev builds; shown by the feedback tool). */
  src?: SourceTrace;
}

type BoxExtra = Partial<Pick<VoxelBox, 'shade' | 'rx' | 'ry' | 'rz' | 'open' | 'src' | 'surf' | 'merge' | 'joint' | 'radius'>>;

export type Vec3Tuple = [number, number, number];

export interface GridOptions {
  /** Cell size, uniform or per axis. */
  cell: number | Vec3Tuple;
  /** Position of the min corner of cell (0, 0, 0). */
  origin: Vec3Tuple;
  mat: VoxelMaterialKey;
  /** ± brightness variation per cell (0.05 = ±5 %). */
  jitter?: number;
  /** Strength of the per-cell ambient occlusion / edge brightening. */
  ao?: number;
  seed?: number;
  /** Drop cells whose six neighbours are all filled (never visible). Default true. */
  cull?: boolean;
  /** Pattern amounts for cells set without their own. */
  surf?: Surf;
}

interface Cell {
  color: number;
  mat: VoxelMaterialKey;
  shade: number;
  surf?: Surf;
  /** Who made this cell (default: where the grid was created). */
  src?: SourceTrace;
  /** Occupies space (for culling / AO) but is not emitted. */
  ghost?: boolean;
}

const BIAS = 1024;
const SPAN = 2048;
const key = (i: number, j: number, k: number) => ((i + BIAS) * SPAN + (j + BIAS)) * SPAN + (k + BIAS);

/**
 * Collects rounded boxes for one rigid body part. Boxes can be placed freely, or
 * authored on any number of grids with their own cell size — the reference sheet
 * mixes resolutions (big hair/face blocks, finer shirt weave, tiny camera parts).
 */
export class VoxelBuilder {
  readonly boxes: VoxelBox[] = [];

  box(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: number,
    mat: VoxelMaterialKey,
    extra: BoxExtra = {},
  ): this {
    const src = extra.src ?? traceSource();
    this.boxes.push({ x, y, z, sx, sy, sz, color, mat, shade: extra.shade ?? 1, open: extra.open, surf: extra.surf, merge: extra.merge, joint: extra.joint, radius: extra.radius, rx: extra.rx, ry: extra.ry, rz: extra.rz, src });
    return this;
  }

  /** Box given by its min/max corners. */
  span(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, mat: VoxelMaterialKey, extra: BoxExtra = {}): this {
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), color, mat, extra);
  }

  grid(opts: GridOptions): VoxelGrid {
    return new VoxelGrid(this, opts);
  }

  append(other: VoxelBuilder): this {
    for (const b of other.boxes) this.boxes.push({ ...b });
    return this;
  }

  /** Mirror every box across the plane x = 0 (used for left/right limbs). */
  mirrorX(): this {
    for (const b of this.boxes) {
      b.x = -b.x;
      if (b.open !== undefined) b.open = swapX(b.open);
      if (b.merge !== undefined) b.merge = swapX(b.merge);
      if (b.joint !== undefined) b.joint = swapX(b.joint);
      if (b.ry !== undefined) b.ry = -b.ry;
      if (b.rz !== undefined) b.rz = -b.rz;
    }
    return this;
  }

  translate(dx: number, dy: number, dz: number): this {
    for (const b of this.boxes) {
      b.x += dx;
      b.y += dy;
      b.z += dz;
    }
    return this;
  }

  bounds(): { min: Vec3Tuple; max: Vec3Tuple } {
    const min: Vec3Tuple = [Infinity, Infinity, Infinity];
    const max: Vec3Tuple = [-Infinity, -Infinity, -Infinity];
    const h: Vec3Tuple = [0, 0, 0];
    for (const b of this.boxes) {
      halfExtents(b, h);
      min[0] = Math.min(min[0], b.x - h[0]);
      min[1] = Math.min(min[1], b.y - h[1]);
      min[2] = Math.min(min[2], b.z - h[2]);
      max[0] = Math.max(max[0], b.x + h[0]);
      max[1] = Math.max(max[1], b.y + h[1]);
      max[2] = Math.max(max[2], b.z + h[2]);
    }
    return { min, max };
  }
}

/** A side mask mirrored across x = 0 (swaps the +x and −x bits). */
const swapX = (m: number) => (m & ~3) | ((m & 1) << 1) | ((m & 2) >> 1);

/**
 * Half extents of a box's axis-aligned bounds, rotation included: for a box
 * turned by Euler XYZ (three.js order, R = Rx·Ry·Rz), extent_i = Σ_j |R_ij|·half_j.
 */
function halfExtents(b: VoxelBox, out: Vec3Tuple): Vec3Tuple {
  const hx = b.sx / 2;
  const hy = b.sy / 2;
  const hz = b.sz / 2;
  if (!b.rx && !b.ry && !b.rz) {
    out[0] = hx;
    out[1] = hy;
    out[2] = hz;
    return out;
  }
  const a = Math.cos(b.rx ?? 0);
  const s = Math.sin(b.rx ?? 0);
  const c = Math.cos(b.ry ?? 0);
  const d = Math.sin(b.ry ?? 0);
  const e = Math.cos(b.rz ?? 0);
  const f = Math.sin(b.rz ?? 0);
  // Rows of R (as in Matrix4.makeRotationFromEuler, order 'XYZ').
  const r00 = c * e;
  const r01 = -c * f;
  const r02 = d;
  const r10 = a * f + s * e * d;
  const r11 = a * e - s * f * d;
  const r12 = -s * c;
  const r20 = s * f - a * e * d;
  const r21 = s * e + a * f * d;
  const r22 = a * c;
  out[0] = Math.abs(r00) * hx + Math.abs(r01) * hy + Math.abs(r02) * hz;
  out[1] = Math.abs(r10) * hx + Math.abs(r11) * hy + Math.abs(r12) * hz;
  out[2] = Math.abs(r20) * hx + Math.abs(r21) * hy + Math.abs(r22) * hz;
  return out;
}

/** A sparse voxel grid that emits its visible cells into a {@link VoxelBuilder}. */
export class VoxelGrid {
  readonly cell: Vec3Tuple;
  readonly origin: Vec3Tuple;
  readonly mat: VoxelMaterialKey;
  /** Where the grid was created; shared by every box it emits. */
  readonly src = traceSource();
  private readonly cells = new Map<number, Cell>();
  private readonly idx = new Map<number, Vec3Tuple>();
  private readonly opts: Required<Omit<GridOptions, 'cell' | 'origin' | 'mat' | 'surf'>>;
  private readonly surf?: Surf;

  constructor(
    private readonly builder: VoxelBuilder,
    opts: GridOptions,
  ) {
    this.cell = typeof opts.cell === 'number' ? [opts.cell, opts.cell, opts.cell] : opts.cell;
    this.origin = opts.origin;
    this.mat = opts.mat;
    this.opts = { jitter: opts.jitter ?? 0.05, ao: opts.ao ?? 0.25, seed: opts.seed ?? 1, cull: opts.cull ?? true };
    this.surf = opts.surf;
  }

  set(i: number, j: number, k: number, color: number, mat: VoxelMaterialKey = this.mat, shade = 1, surf: Surf | undefined = this.surf): this {
    const kk = key(i, j, k);
    this.cells.set(kk, { color, mat, shade, surf });
    this.idx.set(kk, [i, j, k]);
    return this;
  }

  /** Set a cell with every option at once (family, shade, surf, source trace). */
  put(i: number, j: number, k: number, c: { color: number; mat?: VoxelMaterialKey; shade?: number; surf?: Surf; src?: SourceTrace }): this {
    const kk = key(i, j, k);
    this.cells.set(kk, { color: c.color, mat: c.mat ?? this.mat, shade: c.shade ?? 1, surf: c.surf ?? this.surf, src: c.src });
    this.idx.set(kk, [i, j, k]);
    return this;
  }

  /**
   * Mark a cell as solid without drawing it — for cells supplied by another part
   * (e.g. the swappable face plugged into the head) so neighbours shade correctly.
   */
  ghost(i: number, j: number, k: number): this {
    const kk = key(i, j, k);
    this.cells.set(kk, { color: 0, mat: this.mat, shade: 1, ghost: true });
    this.idx.set(kk, [i, j, k]);
    return this;
  }

  get(i: number, j: number, k: number): Cell | undefined {
    return this.cells.get(key(i, j, k));
  }

  has(i: number, j: number, k: number): boolean {
    return this.cells.has(key(i, j, k));
  }

  delete(i: number, j: number, k: number): this {
    const kk = key(i, j, k);
    this.cells.delete(kk);
    this.idx.delete(kk);
    return this;
  }

  /** Fill an inclusive index range. `color` may be a function returning null to skip. */
  fill(
    i0: number,
    i1: number,
    j0: number,
    j1: number,
    k0: number,
    k1: number,
    color: number | ((i: number, j: number, k: number) => number | null),
    mat: VoxelMaterialKey = this.mat,
    surf: Surf | undefined = this.surf,
  ): this {
    for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++)
      for (let j = Math.min(j0, j1); j <= Math.max(j0, j1); j++)
        for (let k = Math.min(k0, k1); k <= Math.max(k0, k1); k++) {
          const c = typeof color === 'number' ? color : color(i, j, k);
          if (c !== null) this.set(i, j, k, c, mat, 1, surf);
        }
    return this;
  }

  /** Recolour existing cells. */
  paint(fn: (i: number, j: number, k: number, cell: Cell) => number | void): this {
    for (const [kk, c] of this.cells) {
      const [i, j, k] = this.idx.get(kk)!;
      const r = fn(i, j, k, c);
      if (typeof r === 'number') c.color = r;
    }
    return this;
  }

  forEach(fn: (i: number, j: number, k: number, cell: Cell) => void): void {
    for (const [kk, c] of this.cells) {
      const [i, j, k] = this.idx.get(kk)!;
      fn(i, j, k, c);
    }
  }

  get size(): number {
    return this.cells.size;
  }

  /** Centre of a cell in builder space. */
  center(i: number, j: number, k: number): Vec3Tuple {
    return [
      this.origin[0] + (i + 0.5) * this.cell[0],
      this.origin[1] + (j + 0.5) * this.cell[1],
      this.origin[2] + (k + 0.5) * this.cell[2],
    ];
  }

  /** Emit visible cells as boxes (with baked AO + jitter). */
  commit(): VoxelBuilder {
    const { jitter, ao, seed, cull } = this.opts;
    for (const [kk, c] of this.cells) {
      if (c.ghost) continue;
      const [i, j, k] = this.idx.get(kk)!;
      if (
        cull &&
        this.has(i + 1, j, k) &&
        this.has(i - 1, j, k) &&
        this.has(i, j + 1, k) &&
        this.has(i, j - 1, k) &&
        this.has(i, j, k + 1) &&
        this.has(i, j, k - 1)
      )
        continue;
      let shade = c.shade;
      if (ao > 0) {
        // Exposure: share of empty cells in the 26-neighbourhood, weighted so face
        // neighbours matter most. Flat walls map to 1.0, convex edges/tufts get
        // brighter, crevices darker — like the reference's soft studio shading.
        let open = 0;
        let total = 0;
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++)
            for (let dz = -1; dz <= 1; dz++) {
              const n = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
              if (n === 0) continue;
              const w = n === 1 ? 1 : n === 2 ? 0.6 : 0.35;
              total += w;
              if (!this.has(i + dx, j + dy, k + dz)) open += w;
            }
        const exposure = open / total;
        const flat = 0.305; // exposure of a cell on a flat wall with these weights
        shade *= 1 + ao * Math.max(-0.7, Math.min(0.45, (exposure - flat) * 2.0));
        // Cells lit from above read lighter than those under an overhang.
        if (this.has(i, j + 1, k) && !this.has(i, j, k + 1) && this.has(i, j + 1, k + 1)) shade *= 1 - ao * 0.35;
      }
      if (jitter > 0) shade *= 1 + (hash3(i, j, k, seed) - 0.5) * 2 * jitter;
      const open =
        (this.has(i + 1, j, k) ? 0 : 1) |
        (this.has(i - 1, j, k) ? 0 : 2) |
        (this.has(i, j + 1, k) ? 0 : 4) |
        (this.has(i, j - 1, k) ? 0 : 8) |
        (this.has(i, j, k + 1) ? 0 : 16) |
        (this.has(i, j, k - 1) ? 0 : 32);
      const [x, y, z] = this.center(i, j, k);
      this.builder.box(x, y, z, this.cell[0], this.cell[1], this.cell[2], c.color, c.mat, { shade, open, surf: c.surf, src: c.src ?? this.src });
    }
    return this.builder;
  }
}
