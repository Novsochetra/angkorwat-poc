import { BufferGeometry, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Sphere, Vector3 } from 'three';
import { getVoxelMaterial, VOXEL_MATERIALS } from '../../voxel/materials';
import { openSidesIndex, unitVoxelGeometry } from '../../voxel/VoxelMesh';

/**
 * The little things of his cattle that move or come and go (roam/_cattleHerd.ts):
 * the tethering ropes (a few sagging pieces each, from the stake or the post to
 * the collar), his stakes, the heap of straw or grass a cow eats from. One
 * instanced mesh of plain boxes in the map's `mapBark` family (no new shader
 * program; their colours are their own), a fixed pool of `CAP` blocks, written
 * each frame from slot 0 (`begin`, `box` / `rod`, `end`): nothing allocated, one
 * draw, only what is in use.
 */

const CAP = 160;
const _c = new Color();
const _v = new Vector3();

export class CattleBlocks {
  readonly mesh: InstancedMesh;
  private readonly m: Float32Array;
  private readonly col: Float32Array;
  private n = 0;
  private x0 = 0;
  private x1 = 0;
  private y0 = 0;
  private y1 = 0;
  private z0 = 0;
  private z1 = 0;

  constructor() {
    const spec = VOXEL_MATERIALS.mapBark;
    const unit = unitVoxelGeometry(spec.bevel, 0);
    const geo = new BufferGeometry();
    geo.setIndex(openSidesIndex(unit, 63));
    geo.setAttribute('position', unit.getAttribute('position'));
    geo.setAttribute('normal', unit.getAttribute('normal'));
    this.m = new Float32Array(CAP * 16);
    this.col = new Float32Array(CAP * 3);
    geo.setAttribute('voxOpen', new InstancedBufferAttribute(new Float32Array(CAP).fill(63), 1));
    geo.setAttribute('voxRadius', new InstancedBufferAttribute(new Float32Array(CAP), 1));
    const mesh = new InstancedMesh(geo, getVoxelMaterial('mapBark'), CAP);
    mesh.instanceMatrix = new InstancedBufferAttribute(this.m, 16).setUsage(DynamicDrawUsage);
    mesh.instanceColor = new InstancedBufferAttribute(this.col, 3).setUsage(DynamicDrawUsage);
    mesh.name = 'cattle:blocks';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.count = 0;
    mesh.boundingSphere = new Sphere(new Vector3(), 0);
    this.mesh = mesh;
  }

  /** Start the frame's blocks. */
  begin(): void {
    this.n = 0;
    this.x0 = this.y0 = this.z0 = Infinity;
    this.x1 = this.y1 = this.z1 = -Infinity;
  }

  /** A box: its middle (m), size, turn about y (rad), then a tilt about its own x (rad, + its front down), colour (sRGB). */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, pitch: number, color: number): void {
    if (this.n >= CAP) return;
    const o = this.n * 16;
    const cy = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    // (R = Ry · Rx: the columns, each × its size)
    const m = this.m;
    m[o] = cy * sx;
    m[o + 1] = 0;
    m[o + 2] = -sn * sx;
    m[o + 3] = 0;
    m[o + 4] = sn * sp * sy;
    m[o + 5] = cp * sy;
    m[o + 6] = cy * sp * sy;
    m[o + 7] = 0;
    m[o + 8] = sn * cp * sz;
    m[o + 9] = -sp * sz;
    m[o + 10] = cy * cp * sz;
    m[o + 11] = 0;
    m[o + 12] = x;
    m[o + 13] = y;
    m[o + 14] = z;
    m[o + 15] = 1;
    _c.setHex(color);
    this.col[this.n * 3] = _c.r;
    this.col[this.n * 3 + 1] = _c.g;
    this.col[this.n * 3 + 2] = _c.b;
    this.n++;
    const r = Math.max(sx, sy, sz);
    this.x0 = Math.min(this.x0, x - r);
    this.x1 = Math.max(this.x1, x + r);
    this.y0 = Math.min(this.y0, y - r);
    this.y1 = Math.max(this.y1, y + r);
    this.z0 = Math.min(this.z0, z - r);
    this.z1 = Math.max(this.z1, z + r);
  }

  /** A rod from a to b (m), `w` thick. */
  rod(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, color: number): void {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-4) return;
    const h = Math.sqrt(dx * dx + dz * dz);
    const yaw = h < 1e-5 ? 0 : Math.atan2(dx, dz);
    const pitch = -Math.atan2(dy, h);
    this.box((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, w, w, len + w * 0.5, yaw, pitch, color);
  }

  /** The frame's blocks up to the GPU (only the ones in use). */
  end(): void {
    const mesh = this.mesh;
    mesh.count = this.n;
    mesh.visible = this.n > 0;
    if (!this.n) return;
    const s = mesh.boundingSphere!;
    _v.set(this.x1 - this.x0, this.y1 - this.y0, this.z1 - this.z0);
    s.center.set((this.x0 + this.x1) / 2, (this.y0 + this.y1) / 2, (this.z0 + this.z1) / 2);
    s.radius = _v.length() / 2 + 0.5;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, this.n * 16);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.clearUpdateRanges();
    mesh.instanceColor!.addUpdateRange(0, this.n * 3);
    mesh.instanceColor!.needsUpdate = true;
  }

  get used(): number {
    return this.n;
  }
}
