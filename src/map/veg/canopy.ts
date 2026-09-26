import { CELL, type HeightField } from '../heightfield';
import { CAM_REACH, roamDistance } from '../terrain/views';
import type { Species } from './species';

/**
 * The jungle's crowns as the forest floor sees them, for the undergrowth
 * (veg/undergrowth.ts): how shaded each 2 m cell of the land is, and the
 * trees where the explorer roams (trunk, crown reach and height), so plants
 * keep off the trunks and vines can hang from the crowns. Written once by
 * the vegetation part, after the jungle is planted.
 */

/** A planted tree, as the undergrowth needs it. */
export interface CanopyTree {
  x: number;
  z: number;
  /** Ground under the trunk (m). */
  y: number;
  kind: Species;
  /** Crown reach (m). */
  r: number;
  /** Bottom and top of the crown over the ground (m). */
  low: number;
  h: number;
}

/** Bucket size of the tree index (m). */
const BUCKET = 8;

export class Canopy {
  /** Per land cell (as the height field's): 0 open sky … 255 deep under crowns. */
  readonly cover: Uint8Array;
  readonly trees: CanopyTree[];
  /** Trunk (or clump, or bush) radius per tree: no plant grows inside (m). */
  readonly trunk: Float32Array;
  private readonly nb: number;
  private readonly mb: number;
  private readonly start: Uint32Array;
  private readonly items: Uint32Array;

  constructor(
    private readonly field: HeightField,
    trees: CanopyTree[],
  ) {
    this.trees = trees;
    this.cover = new Uint8Array(field.nx * field.nz);
    this.trunk = new Float32Array(trees.length);
    const { cover } = this;
    trees.forEach((t, n) => {
      this.trunk[n] = t.kind === 'bush' ? t.r * 0.7 : t.kind === 'bamboo' ? 1.3 : t.kind === 'palm' ? 0.6 : t.r > 4.2 ? 1.7 : 1;
      // Shade: full under most of the crown, soft at its rim (bushes shade only a little).
      const k = t.kind === 'bush' ? 0.45 : t.kind === 'palm' ? 0.6 : 1;
      const reach = t.r * 1.1;
      const i0 = Math.max(0, Math.floor((t.x - reach - field.x0) / CELL));
      const i1 = Math.min(field.nx - 1, Math.floor((t.x + reach - field.x0) / CELL));
      const k0 = Math.max(0, Math.floor((t.z - reach - field.z0) / CELL));
      const k1 = Math.min(field.nz - 1, Math.floor((t.z + reach - field.z0) / CELL));
      for (let b = k0; b <= k1; b++)
        for (let a = i0; a <= i1; a++) {
          const [cx, cz] = field.cellCenter(a, b);
          const d = Math.hypot(cx - t.x, cz - t.z) / t.r;
          if (d > 1.1) continue;
          const v = Math.round(255 * k * Math.min(1, (1.1 - d) / 0.35));
          const c = a + b * field.nx;
          if (v > cover[c]) cover[c] = v;
        }
    });
    // Trees by 8 m bucket (counting sort).
    this.nb = Math.ceil((field.nx * CELL) / BUCKET);
    this.mb = Math.ceil((field.nz * CELL) / BUCKET);
    const count = new Uint32Array(this.nb * this.mb + 1);
    const bucketOf = trees.map((t) => this.bucket(t.x, t.z));
    for (const b of bucketOf) if (b >= 0) count[b + 1]++;
    for (let b = 0; b < this.nb * this.mb; b++) count[b + 1] += count[b];
    this.start = count.slice();
    this.items = new Uint32Array(trees.length);
    const fill = count.slice();
    bucketOf.forEach((b, n) => {
      if (b >= 0) this.items[fill[b]++] = n;
    });
  }

  private bucket(x: number, z: number): number {
    const a = Math.floor((x - this.field.x0) / BUCKET);
    const b = Math.floor((z - this.field.z0) / BUCKET);
    return a < 0 || b < 0 || a >= this.nb || b >= this.mb ? -1 : a + b * this.nb;
  }

  /** Shade at a map point, 0‥1. */
  coverAt(x: number, z: number): number {
    const c = this.field.index(x, z);
    return c < 0 ? 0 : this.cover[c] / 255;
  }

  /** Call `fn` with the index of every tree whose trunk stands within `reach` of the rectangle (m). */
  near(x0: number, z0: number, x1: number, z1: number, reach: number, fn: (n: number) => void): void {
    const a0 = Math.max(0, Math.floor((x0 - reach - this.field.x0) / BUCKET));
    const a1 = Math.min(this.nb - 1, Math.floor((x1 + reach - this.field.x0) / BUCKET));
    const b0 = Math.max(0, Math.floor((z0 - reach - this.field.z0) / BUCKET));
    const b1 = Math.min(this.mb - 1, Math.floor((z1 + reach - this.field.z0) / BUCKET));
    for (let b = b0; b <= b1; b++)
      for (let a = a0; a <= a1; a++) {
        const bk = a + b * this.nb;
        for (let i = this.start[bk]; i < this.start[bk + 1]; i++) fn(this.items[i]);
      }
  }
}

const canopies = new WeakMap<HeightField, Canopy>();

/** Where the undergrowth can be (the roaming area and the follow camera's reach round it). */
export function underReach(x: number, z: number): boolean {
  return roamDistance(x, z) < CAM_REACH + 20;
}

/** Record the planted jungle (the vegetation part, once). */
export function setCanopy(field: HeightField, trees: CanopyTree[]): Canopy {
  const c = new Canopy(field, trees);
  canopies.set(field, c);
  return c;
}

/** The planted jungle, or null (the vegetation part was not built). */
export function canopyOf(field: HeightField): Canopy | null {
  return canopies.get(field) ?? null;
}
