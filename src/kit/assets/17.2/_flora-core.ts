import type { SourceTrace } from '../../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../../voxel/materials';
import type { Surf, VoxelBuilder } from '../../../voxel/VoxelBuilder';
import type { WaterSurface } from '../../lib/water';
import { type Rng } from '../../shapes';

/**
 * Shared parts of the §17.2 water flora (lily pads, floating vegetation, small
 * debris): where things may go on a water surface, and two emitters that keep
 * block counts low — {@link Plate} (flat or dished plates of cells merged into
 * runs) and {@link stalk} (a thin stem of a few boxes).
 *
 * Every scatter of the §17.2 helpers takes a {@link WaterSurface} (from
 * `waterTile()` / `water()` of `lib/water.ts`), keeps its things inside the
 * surface's rectangle (and `inside`, and off `avoid`) and returns the
 * {@link FloraSpot}s it took, so the next scatter on the same water can keep
 * off them:
 *
 *   const s = waterTile(p, { depth: WATER_DEPTH.open, tint: 'moat', bed: 'silt', seed });
 *   const taken = lilyField(p, s, { seed, groups: 3 });
 *   debris(p, s, { seed, twigs: 3, leaves: 10, avoid: taken });
 */

/** A round footprint taken on the water (metres). */
export interface FloraSpot {
  x: number;
  z: number;
  r: number;
}

/** Where a scatter may put things on its surface. */
export interface FloraArea {
  /** Open water to use (default: the whole surface); a thing's centre and rim must be inside. */
  inside?: (x: number, z: number) => boolean;
  /** Footprints to keep off (another scatter's return value). */
  avoid?: readonly FloraSpot[];
}

/**
 * The best of a few random spots for a round thing of radius `r`: inside the
 * surface (less the radius), inside `inside`, off `avoid` and as far as can
 * be from the spots already `taken` (a blue-noise spread). `near` keeps the
 * centre within a disc (a colony's plants round its middle). Null when
 * nothing fits.
 */
export function findSpot(
  r: Rng,
  s: WaterSurface,
  rad: number,
  taken: readonly FloraSpot[],
  o: FloraArea & { near?: FloraSpot; tries?: number; margin?: number } = {},
): [number, number] | null {
  const m = rad + (o.margin ?? 0);
  const [x0, x1, z0, z1] = [s.x0 + m, s.x1 - m, s.z0 + m, s.z1 - m];
  if (x1 <= x0 || z1 <= z0) return null;
  let best: [number, number] | null = null;
  let bestD = -Infinity;
  for (let t = 0; t < (o.tries ?? 24); t++) {
    let x: number;
    let z: number;
    if (o.near) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * o.near.r;
      [x, z] = [o.near.x + Math.cos(a) * d, o.near.z + Math.sin(a) * d];
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
    } else [x, z] = [r.range(x0, x1), r.range(z0, z1)];
    if (!fits(x, z, rad, o)) continue;
    const d = Math.min(99, ...taken.map((q) => Math.hypot(q.x - x, q.z - z) - q.r - rad));
    if (d > bestD) [best, bestD] = [[x, z], d];
  }
  return best;
}

/** Is a round thing at (x, z) inside the area and off its `avoid` spots? */
export function fits(x: number, z: number, rad: number, o: FloraArea): boolean {
  const inside = o.inside;
  if (inside && !(inside(x, z) && inside(x - rad, z) && inside(x + rad, z) && inside(x, z - rad) && inside(x, z + rad))) return false;
  return !(o.avoid ?? []).some((q) => Math.hypot(q.x - x, q.z - z) < q.r + rad);
}

/** One cell of a {@link Plate}: its top (m), colour and the plant it belongs to (cells of one plant merge). */
export interface PlateCell {
  top: number;
  color: number;
  part: number;
  shade?: number;
  surf?: Surf;
}

const pkey = (i: number, k: number) => (i + 8192) * 16384 + (k + 8192);

/**
 * Flat things of cells — a lotus leaf's dish, a film of duckweed — as plates
 * `thick` metres deep under each cell's top. Cells of one plant at the same
 * height merge into runs along x with no bevel between them (one plate with a
 * stepped outline, like the leaves of `lib/leaves.ts`); a run ends where its
 * neighbours change, so no seam shows between rows. Only the face up counts as
 * open: the outlines stay dark, like the sheets' leaves.
 */
export class Plate {
  private readonly cells = new Map<number, PlateCell>();
  private next = 0;
  /** Cell (0, 0) min corner at (x0, z0). */
  constructor(
    readonly cell: number,
    readonly x0: number,
    readonly z0: number,
  ) {}

  /** A fresh plant id. */
  part(): number {
    return this.next++;
  }

  set(i: number, k: number, c: PlateCell): void {
    this.cells.set(pkey(i, k), c);
  }

  get(i: number, k: number): PlateCell | undefined {
    return this.cells.get(pkey(i, k));
  }

  /** Cell index of a point. */
  index(x: number, z: number): [number, number] {
    return [Math.floor((x - this.x0) / this.cell), Math.floor((z - this.z0) / this.cell)];
  }

  /** Centre of cell (i, k). */
  at(i: number, k: number): [number, number] {
    return [this.x0 + (i + 0.5) * this.cell, this.z0 + (k + 0.5) * this.cell];
  }

  get size(): number {
    return this.cells.size;
  }

  /** Emit the plates; returns the number of boxes. */
  commit(b: VoxelBuilder, o: { mat: VoxelMaterialKey; thick: number; surf?: Surf; src?: SourceTrace }): number {
    // 2: same plant, same top (merge); 1: something else there; 0: nothing.
    const status = (c: PlateCell, i: number, k: number) => {
      const n = this.get(i, k);
      return !n ? 0 : n.part === c.part && Math.abs(n.top - c.top) < 1e-6 ? 2 : 1;
    };
    const same = (a: PlateCell, c: PlateCell) => a.part === c.part && a.color === c.color && Math.abs(a.top - c.top) < 1e-6 && (a.shade ?? 1) === (c.shade ?? 1) && a.surf === c.surf;
    const rows = new Map<number, number[]>();
    for (const kk of this.cells.keys()) {
      const k = (kk % 16384) - 8192;
      const i = Math.floor(kk / 16384) - 8192;
      if (!rows.has(k)) rows.set(k, []);
      rows.get(k)!.push(i);
    }
    let count = 0;
    for (const [k, list] of rows) {
      list.sort((a, b) => a - b);
      for (let q = 0; q < list.length; ) {
        const i0 = list[q];
        const c = this.get(i0, k)!;
        const lo = status(c, i0, k - 1);
        const hi = status(c, i0, k + 1);
        let i1 = i0;
        while (q + 1 < list.length && list[q + 1] === i1 + 1) {
          const n = this.get(i1 + 1, k)!;
          if (!same(n, c) || status(n, i1 + 1, k - 1) !== lo || status(n, i1 + 1, k + 1) !== hi) break;
          i1++;
          q++;
        }
        q++;
        const west = status(c, i0 - 1, k);
        const east = status(c, i1 + 1, k);
        const merge = (east === 2 ? 1 : 0) | (west === 2 ? 2 : 0) | (hi === 2 ? 16 : 0) | (lo === 2 ? 32 : 0);
        const len = (i1 - i0 + 1) * this.cell;
        b.box(this.x0 + i0 * this.cell + len / 2, c.top - o.thick / 2, this.z0 + (k + 0.5) * this.cell, len, o.thick, this.cell, c.color, o.mat, {
          open: 4,
          merge,
          shade: c.shade ?? 1,
          surf: c.surf ?? o.surf,
          src: o.src,
        });
        count++;
      }
    }
    return count;
  }
}

/**
 * A thin stem from y0 up to y1 at (x, z), `w` metres square: one box, or two
 * when it steps sideways by its own width at `bend` (0‥1 up it) for a natural
 * kink. Returns the top's (x, z).
 */
export function stalk(
  b: VoxelBuilder,
  o: { x: number; z: number; y0: number; y1: number; w: number; color: number; bend?: { at: number; dx: number; dz: number }; mat?: VoxelMaterialKey; src?: SourceTrace },
): [number, number] {
  const mat = o.mat ?? 'leaves';
  if (o.y1 - o.y0 < 1e-3) return [o.x, o.z];
  if (!o.bend) {
    b.span(o.x - o.w / 2, o.y0, o.z - o.w / 2, o.x + o.w / 2, o.y1, o.z + o.w / 2, o.color, mat, { src: o.src });
    return [o.x, o.z];
  }
  const ym = o.y0 + (o.y1 - o.y0) * o.bend.at;
  const [x2, z2] = [o.x + o.bend.dx * o.w, o.z + o.bend.dz * o.w];
  // (the two overlap by a quarter of the width, so the kink reads as one stem)
  b.span(o.x - o.w / 2, o.y0, o.z - o.w / 2, o.x + o.w / 2, ym + o.w / 4, o.z + o.w / 2, o.color, mat, { src: o.src });
  b.span(x2 - o.w / 2, ym - o.w / 4, z2 - o.w / 2, x2 + o.w / 2, o.y1, z2 + o.w / 2, o.color, mat, { src: o.src });
  return [x2, z2];
}
