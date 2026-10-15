import type { HeightField } from '../heightfield';
import { FACE_Z_MIN } from '../terrain/views';
import type { VoxelMaterialKey } from '../../voxel/materials';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { Proto } from './proto';

/**
 * The world lattice the tree prototypes are stamped into (one per cell size).
 * Trees that touch or overlap merge: a leaf cell is drawn only if one of its
 * sides is open in the whole jungle, not just in its own tree, so a dense
 * stand costs about one block per square metre of canopy.
 *
 * The fixed map cameras stand south of what they look at and above the
 * canopy; the roaming camera looks every way, but seldom up into a crown
 * (and there the undersides of the cells above close it). So cells whose
 * only open sides face down (−y), or north (−z) where no camera looks south
 * (views.ts `FACE_Z_MIN`), are not drawn: they stay in the lattice (they
 * still hide their neighbours and cast shadow through the cells in front of
 * them).
 */

// Cell index ranges: x −1024‥1023, y −16‥495, z −800‥223 (in cells).
const key = (i: number, j: number, k: number) => ((i + 1024) << 19) | ((j + 16) << 10) | (k + 800);

/** Sides a map camera can see: ±x, +y, +z, and −z (north) in most of the map. */
const SEEN = 1 | 2 | 4 | 16;
const NORTH = 32;

/** Quarter turn q (0‥3) and mirror m of a local (x, z) offset. */
function turn(x: number, z: number, q: number, m: boolean): [number, number] {
  if (m) x = -x;
  switch (q & 3) {
    case 1:
      return [-z, x];
    case 2:
      return [-x, -z];
    case 3:
      return [z, -x];
    default:
      return [x, z];
  }
}

export class Lattice {
  private readonly map = new Map<number, number>();
  private readonly ci: number[] = [];
  private readonly cj: number[] = [];
  private readonly ck: number[] = [];
  private readonly color: number[] = [];
  private readonly shade: number[] = [];
  private readonly mat: number[] = [];
  private readonly shell: number[] = [];
  private readonly proto: (Proto | undefined)[] = [];
  /** Per cell, the stamp that owns it (the `owner` given to `stamp`; −1 none): the bamboo clumps he can cut (veg/bambooCut.ts). */
  private readonly owner: number[] = [];
  /** Free boxes (trunks), already placed. */
  private readonly free: { x: number; y: number; z: number; sx: number; sy: number; sz: number; color: number; shade: number; leaf: boolean; p: Proto; owner: number }[] = [];

  constructor(
    /** Cell size (m). */
    readonly s: number,
    private readonly field: HeightField,
  ) {}

  /**
   * Stamp a prototype with its trunk cell at map point (x, z) (snapped to the
   * lattice), standing on ground height `y`, turned by `q` quarter turns.
   * `owner` (≥ 0) names the stamp: `emit` tells which blocks it drew (a drawn
   * cell it shares with another tree is the one's whose colour it shows).
   * `keep(x, y, z)`: a cell (its middle, map m) is stamped only if it says so
   * (the bamboo forest's gaps over its trail and clearing; free boxes are
   * all kept). Returns the number of cells added.
   */
  stamp(p: Proto, x: number, y: number, z: number, q: number, m: boolean, shade = 1, owner = -1, keep?: (x: number, y: number, z: number) => boolean): number {
    const s = this.s;
    const bi = Math.floor(x / s);
    const bk = Math.floor(z / s);
    const bj = Math.round(y / s);
    const px = (bi + 0.5) * s;
    const pz = (bk + 0.5) * s;
    const f = this.field;
    let added = 0;
    for (let c = 0; c < p.n; c++) {
      const [dx, dz] = turn(p.ci[c], p.ck[c], q, m);
      const i = bi + dx;
      const j = bj + p.cj[c];
      const k = bk + dz;
      // Cells in the ground (a trunk by a bank, a crown against a cliff) are dropped.
      if ((j + 0.5) * s < f.heightAt((i + 0.5) * s, (k + 0.5) * s)) continue;
      if (keep && !keep((i + 0.5) * s, (j + 0.5) * s, (k + 0.5) * s)) continue;
      const kk = key(i, j, k);
      const had = this.map.get(kk);
      if (had !== undefined) {
        // Overlap: a drawn cell wins over a hidden one.
        if (p.shell[c] && !this.shell[had]) {
          this.shell[had] = 1;
          this.color[had] = p.color[c];
          this.shade[had] = p.shade[c] * shade;
          this.mat[had] = p.mat[c];
          this.proto[had] = p;
          this.owner[had] = owner;
        }
        continue;
      }
      this.map.set(kk, this.ci.length);
      this.ci.push(i);
      this.cj.push(j);
      this.ck.push(k);
      this.color.push(p.color[c]);
      this.shade.push(p.shade[c] * shade);
      this.mat.push(p.mat[c]);
      this.shell.push(p.shell[c]);
      this.proto.push(p);
      this.owner.push(owner);
      added++;
    }
    for (const b of p.boxes) {
      const [bx, bz] = turn(b.x, b.z, q, m);
      const odd = (q & 1) === 1;
      this.free.push({ x: px + bx, y: y + b.y, z: pz + bz, sx: odd ? b.sz : b.sx, sy: b.sy, sz: odd ? b.sx : b.sz, color: b.color, shade: b.shade * shade, leaf: !!b.leaf, p, owner });
    }
    return added;
  }

  has(i: number, j: number, k: number): boolean {
    return this.map.has(key(i, j, k));
  }

  /** Cells drawn so far would be (an estimate while placing: shell cells). */
  get cells(): number {
    return this.ci.length;
  }

  /**
   * Emit the visible cells and the free boxes into the builder of their tile (by place and family). Returns the number
   * of boxes. `owned(owner, builder, index)`: each block of a stamp with an owner, where it went in its builder.
   */
  emit(sink: (x: number, z: number, mat: VoxelMaterialKey) => VoxelBuilder, owned?: (owner: number, builder: VoxelBuilder, index: number) => void): number {
    const s = this.s;
    let n = 0;
    const has = (i: number, j: number, k: number) => this.map.has(key(i, j, k));
    for (let c = 0; c < this.ci.length; c++) {
      if (!this.shell[c]) continue;
      const i = this.ci[c];
      const j = this.cj[c];
      const k = this.ck[c];
      const open = (has(i + 1, j, k) ? 0 : 1) | (has(i - 1, j, k) ? 0 : 2) | (has(i, j + 1, k) ? 0 : 4) | (has(i, j - 1, k) ? 0 : 8) | (has(i, j, k + 1) ? 0 : 16) | (has(i, j, k - 1) ? 0 : 32);
      if (!(open & ((k + 0.5) * s > FACE_Z_MIN ? SEEN | NORTH : SEEN))) continue;
      let shade = this.shade[c];
      // Under another tree's crown: darker.
      if (!(open & 4) && (has(i, j + 2, k) || has(i, j + 3, k))) shade *= 0.93;
      const x = (i + 0.5) * s;
      const z = (k + 0.5) * s;
      const mat = this.mat[c] ? 'mapBark' : 'mapLeaf';
      const to = sink(x, z, mat);
      to.box(x, (j + 0.5) * s, z, s, s, s, this.color[c], mat, { shade, open, src: this.proto[c]?.src });
      if (owned && this.owner[c] >= 0) owned(this.owner[c], to, to.boxes.length - 1);
      n++;
    }
    for (const f of this.free) {
      const mat = f.leaf ? 'mapLeaf' : 'mapBark';
      const to = sink(f.x, f.z, mat);
      to.box(f.x, f.y, f.z, f.sx, f.sy, f.sz, f.color, mat, { shade: f.shade, src: f.p.src });
      if (owned && f.owner >= 0) owned(f.owner, to, to.boxes.length - 1);
    }
    return n + this.free.length;
  }
}
