import { Euler, Matrix4, Vector3 } from 'three';
import { VoxelBuilder, type VoxelBox, type VoxelGrid } from '../../voxel/VoxelBuilder';
import type { VoxelMaterialKey } from '../../voxel/materials';
import type { HeightField } from '../heightfield';
import type { JungleSite } from '../layout';

/**
 * A jungle site's own frame: its blocks are laid out in site space, then
 * turned to face the trail and set on the land.
 *
 * Site space: origin at the clearing's centre on its floor (`y`, the land
 * there), +z toward the site's front (`JungleSite.facing`: the trail), +x to
 * the right of someone looking out of the front, +y up (m). A facing within
 * `SNAP` of a quarter turn is taken as that quarter turn, so the blocks stay
 * square to the land's 2 m columns (and are not turned at all).
 */

/** A quarter turn this near (rad) is taken as exact. */
const SNAP = 0.15;

const _m = new Matrix4();
const _r = new Matrix4();
const _e = new Euler();
const _p = new Vector3();

/** Side bits of a block (see `VoxelBox.open`) after a quarter turn to the left seen from above (+z → +x). */
const turnSides = (m: number) => (m & 12) | (m & 1 ? 32 : 0) | (m & 2 ? 16 : 0) | (m & 16 ? 1 : 0) | (m & 32 ? 2 : 0);

export class SiteFrame {
  /** The site's blocks, in site space. */
  readonly b = new VoxelBuilder();
  /** Centre and floor (m). */
  readonly x: number;
  readonly z: number;
  readonly y: number;
  /** The turn used (rad; toward (sin, cos) in x, z). */
  readonly yaw: number;
  /** Quarter turns (0‥3) when the yaw is one, else null. */
  private readonly quarter: number | null;
  private readonly c: number;
  private readonly s: number;

  constructor(
    readonly field: HeightField,
    readonly site: JungleSite,
  ) {
    this.x = site.x;
    this.z = site.z;
    this.y = field.heightAt(site.x, site.z);
    const q = Math.round(site.facing / (Math.PI / 2));
    const near = Math.abs(site.facing - (q * Math.PI) / 2) < SNAP;
    this.quarter = near ? ((q % 4) + 4) % 4 : null;
    this.yaw = near ? (q * Math.PI) / 2 : site.facing;
    // (exact for a quarter turn)
    this.c = near ? [1, 0, -1, 0][this.quarter!] : Math.cos(this.yaw);
    this.s = near ? [0, 1, 0, -1][this.quarter!] : Math.sin(this.yaw);
  }

  /** Map point (x, z) of a site point. */
  toMap(lx: number, lz: number): [number, number] {
    return [this.x + this.c * lx + this.s * lz, this.z - this.s * lx + this.c * lz];
  }

  /** Map point of a site point (x, y, z). */
  point(lx: number, ly: number, lz: number): [number, number, number] {
    const [x, z] = this.toMap(lx, lz);
    return [x, this.y + ly, z];
  }

  /** Land under a site point, over the site's floor (m; the land steps by 2 m). */
  ground(lx: number, lz: number): number {
    const [x, z] = this.toMap(lx, lz);
    return this.field.heightAt(x, z) - this.y;
  }

  /** Is the site point on a trail's tread? */
  onTrail(lx: number, lz: number, band = false): boolean {
    const [x, z] = this.toMap(lx, lz);
    const c = this.field.index(x, z);
    return c >= 0 && this.field.trail[c] >= (band ? 1 : 2);
  }

  /**
   * A grid in site space whose cell (0, 0, 0) is centred on the point
   * (ox, oz) with its bottom on the floor + `oy` (cells of `cell` m).
   */
  grid(cell: number, o: { seed: number; mat?: VoxelMaterialKey; at?: [number, number, number]; jitter?: number; ao?: number }): VoxelGrid {
    const [ox, oy, oz] = o.at ?? [0, 0, 0];
    return this.b.grid({ cell, origin: [ox - cell / 2, oy, oz - cell / 2], mat: o.mat ?? 'mapStone', jitter: o.jitter ?? 0.04, ao: o.ao ?? 0.3, seed: o.seed });
  }

  /**
   * Ghost cells under the land for columns i0‥i1 × k0‥k1 of a grid made by
   * `grid` (its cell size `cell`, centred on (ox, oz)): the blocks standing
   * there get their AO and are culled underneath. Returns nothing.
   */
  ghostLand(g: VoxelGrid, cell: number, i0: number, i1: number, k0: number, k1: number, at: [number, number, number] = [0, 0, 0]): void {
    for (let i = i0; i <= i1; i++)
      for (let k = k0; k <= k1; k++) {
        const top = Math.round((this.ground(at[0] + i * cell, at[2] + k * cell) - at[1]) / cell);
        g.ghost(i, top - 1, k);
      }
  }

  /** Row (cells of `cell` m, from the grid's bottom `oy`) of the land's top under column (lx, lz). */
  landRow(lx: number, lz: number, cell: number, oy = 0): number {
    return Math.round((this.ground(lx, lz) - oy) / cell);
  }

  /**
   * Put the site's blocks into the part's builder, turned to the site's
   * facing and moved onto the land. Returns how many.
   */
  emit(out: VoxelBuilder): number {
    _r.makeRotationY(this.yaw);
    for (const b of this.b.boxes) {
      const nb: VoxelBox = { ...b };
      nb.x = this.x + this.c * b.x + this.s * b.z;
      nb.z = this.z - this.s * b.x + this.c * b.z;
      nb.y = this.y + b.y;
      if (!b.rx && !b.ry && !b.rz && this.quarter !== null) {
        // A square turn: swap the sizes and the open sides, no rotation.
        if (this.quarter & 1) [nb.sx, nb.sz] = [b.sz, b.sx];
        if (b.open !== undefined) for (let q = 0; q < this.quarter; q++) nb.open = turnSides(nb.open!);
      } else if (!b.rx && !b.rz) nb.ry = (b.ry ?? 0) + this.yaw;
      else {
        _m.makeRotationFromEuler(_e.set(b.rx ?? 0, b.ry ?? 0, b.rz ?? 0)).premultiply(_r);
        _e.setFromRotationMatrix(_m, 'XYZ');
        [nb.rx, nb.ry, nb.rz] = [_e.x, _e.y, _e.z];
      }
      out.boxes.push(nb);
    }
    return this.b.boxes.length;
  }

  /** The site's footprint on the map (m): the box round its blocks, for `field.occupy`. */
  footprint(pad = 1): [number, number, number, number] {
    let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const b of this.b.boxes) {
      const r = Math.max(b.sx, b.sz) / 2;
      for (const [dx, dz] of [
        [-r, -r],
        [r, r],
      ]) {
        const [x, z] = this.toMap(b.x + dx, b.z + dz);
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        z0 = Math.min(z0, z);
        z1 = Math.max(z1, z);
      }
    }
    return [x0 - pad, z0 - pad, x1 + pad, z1 + pad];
  }
}

/**
 * A fallen piece's turn: tipped back by `tilt` about x (its top toward −z,
 * its front +z face toward the sky), rolled by `roll` about z, then turned
 * by `yaw` about the vertical (rad).
 */
export function fallenTurn(tilt: number, roll: number, yaw: number): Matrix4 {
  return new Matrix4().makeRotationY(yaw).multiply(new Matrix4().makeRotationZ(roll)).multiply(new Matrix4().makeRotationX(-tilt));
}

/**
 * Move the boxes of a piece built in its own space (a fallen head, a
 * tilted slab) into `into`: turned by `rot` about its origin, then moved so
 * that its lowest point is at `at` (x and z: its origin; y: the bottom, m,
 * in `into`'s space).
 */
export function placePiece(piece: VoxelBuilder, into: VoxelBuilder, at: [number, number, number], rot: Matrix4): void {
  _r.copy(rot);
  const turned = piece.boxes.map((b) => {
    _p.set(b.x, b.y, b.z).applyMatrix4(_r);
    _m.makeRotationFromEuler(_e.set(b.rx ?? 0, b.ry ?? 0, b.rz ?? 0)).premultiply(_r);
    _e.setFromRotationMatrix(_m, 'XYZ');
    return { ...b, x: _p.x, y: _p.y, z: _p.z, rx: _e.x, ry: _e.y, rz: _e.z };
  });
  const tmp = new VoxelBuilder();
  tmp.boxes.push(...turned);
  const low = tmp.bounds().min[1];
  for (const b of turned) into.boxes.push({ ...b, x: b.x + at[0], y: b.y - low + at[1], z: b.z + at[2] });
}
