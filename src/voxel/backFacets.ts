import { BufferAttribute, FrontSide, Matrix4, Vector3, type BufferGeometry, type Camera, type InstancedMesh, type Object3D, type PerspectiveCamera } from 'three';

/**
 * Voxel meshes that never move draw only the block sides that can face the
 * camera.
 *
 * A bevelled block is 44 triangles (faces, chamfer strips, corners) and about
 * half of them face away from the camera. The GPU drops those, but only after
 * it has read and set up every one: in the world map's overview that was some
 * 3 M of its 12.6 M triangles a frame, for nothing. Here, just before a mesh
 * is drawn, each side direction of its block shape (the triangles that share
 * one facet normal) is tested against the box around all the mesh's blocks: a
 * direction that faces away from the camera from every point of that box is
 * left out of this draw. The GPU would have dropped all of it, so the picture
 * is the same.
 *
 * The full index is put back right after the draw, so shadows, picking and
 * everything else still see every side; an orthographic camera (the mini-map)
 * gets every side too. Meshes with turned blocks, a mirroring transform, a
 * two-sided material or a rounder shape (over 30 side directions) draw whole.
 * Blocks may move later (the instance matrices are read again when they
 * change), but a mesh that moves every frame gains nothing from this.
 */
export function skipBackFacets(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as InstancedMesh;
    if (!mesh.isInstancedMesh || !mesh.geometry.index || !mesh.geometry.getAttribute('voxOpen')) return;
    mesh.onBeforeRender = drawFacing;
    mesh.onAfterRender = restore;
  });
}

/** The block shape's triangles by side direction, and the index of each set of directions drawn. */
interface Facets {
  /** Each triangle's direction. */
  dirOf: Uint8Array;
  /** Per direction: the normals to test (the facet normal, or with `loose` also each part of it). */
  exact: number[][][];
  loose: number[][][];
  /** All directions. */
  all: number;
  byMask: Map<number, BufferAttribute>;
}

/** A mesh's blocks: the box around them all (mesh space, m) and whether the mesh can be culled at all. */
interface Blocks {
  version: number;
  count: number;
  ok: boolean;
  min: Vector3;
  max: Vector3;
  /** Squared joints change a block's shape: test every normal an edge can end up with. */
  loose: boolean;
}

/** Most side directions per shape (the mask is a 32-bit number); a plain box has 6, a one-chamfer block 26. */
const MAX_DIRS = 30;
/**
 * A side seen almost edge-on is still drawn: the GPU's rounding can turn such
 * a sliver towards the camera, and then it touches a pixel here and there.
 * Kept: up to about 6° past edge-on (`angle` × the distance to the box's far
 * corner), plus `m` metres.
 */
const EDGE_ON = { angle: 0.1, m: 0.05 };

const shapes = new WeakMap<BufferAttribute, Facets | null>();
const meshes = new WeakMap<InstancedMesh, Blocks>();
const _inv = new Matrix4();
const _eye = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();

/** The geometry drawn with fewer sides just now, and its full index to put back. */
let swapped: BufferGeometry | null = null;
let swappedFull: BufferAttribute | null = null;

function drawFacing(this: Object3D, _renderer: unknown, _scene: unknown, camera: Camera, geometry: BufferGeometry): void {
  const mesh = this as InstancedMesh;
  const full = geometry.index;
  if (!full || !(camera as PerspectiveCamera).isPerspectiveCamera || Array.isArray(mesh.material) || mesh.material.side !== FrontSide) return;
  if (mesh.matrixWorld.determinant() <= 0) return;
  const facets = facetsOf(geometry, full);
  const blocks = blocksOf(mesh);
  if (!facets || !blocks.ok) return;
  // The eye in the mesh's space (the side test holds through any transform that does not mirror).
  _eye.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(_inv.copy(mesh.matrixWorld).invert());
  const tests = blocks.loose ? facets.loose : facets.exact;
  const { min, max } = blocks;
  const far = Math.hypot(Math.max(_eye.x - min.x, max.x - _eye.x), Math.max(_eye.y - min.y, max.y - _eye.y), Math.max(_eye.z - min.z, max.z - _eye.z));
  const slack = EDGE_ON.m + EDGE_ON.angle * far;
  let mask = 0;
  for (let d = 0; d < tests.length; d++)
    for (const n of tests[d]) {
      // Facing the eye from some point of the box: n · (eye − p) > 0 for the p lowest along n.
      const low = n[0] * (n[0] > 0 ? min.x : max.x) + n[1] * (n[1] > 0 ? min.y : max.y) + n[2] * (n[2] > 0 ? min.z : max.z);
      if (n[0] * _eye.x + n[1] * _eye.y + n[2] * _eye.z - low > -slack) {
        mask |= 1 << d;
        break;
      }
    }
  if (mask === facets.all) return;
  let index = facets.byMask.get(mask);
  if (!index) facets.byMask.set(mask, (index = subset(full, facets.dirOf, mask)));
  swapped = geometry;
  swappedFull = full;
  geometry.setIndex(index);
}

function restore(this: Object3D, _renderer: unknown, _scene: unknown, _camera: Camera, geometry: BufferGeometry): void {
  if (swapped !== geometry) return;
  geometry.setIndex(swappedFull);
  swapped = swappedFull = null;
}

/** The triangles of the directions in `mask`, in their first order. */
function subset(full: BufferAttribute, dirOf: Uint8Array, mask: number): BufferAttribute {
  const keep: number[] = [];
  for (let t = 0; t < dirOf.length; t++) if ((mask >> dirOf[t]) & 1) keep.push(full.getX(t * 3), full.getX(t * 3 + 1), full.getX(t * 3 + 2));
  return new BufferAttribute(full.array instanceof Uint32Array ? new Uint32Array(keep) : new Uint16Array(keep), 1);
}

function facetsOf(geometry: BufferGeometry, index: BufferAttribute): Facets | null {
  let facets = shapes.get(index);
  if (facets !== undefined) return facets;
  const pos = geometry.getAttribute('position');
  const dirOf = new Uint8Array(index.count / 3);
  const dirs = new Map<string, number>();
  const normals: Vector3[] = [];
  for (let t = 0; t < dirOf.length; t++) {
    _a.fromBufferAttribute(pos, index.getX(t * 3));
    _b.fromBufferAttribute(pos, index.getX(t * 3 + 1)).sub(_a);
    _c.fromBufferAttribute(pos, index.getX(t * 3 + 2)).sub(_a);
    const n = _b.cross(_c).normalize();
    const key = `${Math.round(n.x * 1000)},${Math.round(n.y * 1000)},${Math.round(n.z * 1000)}`;
    let d = dirs.get(key);
    if (d === undefined) {
      dirs.set(key, (d = normals.length));
      normals.push(n.clone());
    }
    dirOf[t] = d;
  }
  // (a degenerate triangle has no direction: "0,0,0" is always drawn)
  facets =
    normals.length > MAX_DIRS
      ? null
      : {
          dirOf,
          exact: normals.map((n) => (n.lengthSq() < 0.5 ? [[0, 0, 0]] : [n.toArray()])),
          loose: normals.map((n) => (n.lengthSq() < 0.5 ? [[0, 0, 0]] : parts(n))),
          all: 2 ** normals.length - 1,
          byMask: new Map(),
        };
  shapes.set(index, facets);
  return facets;
}

/** A normal and every normal made of some of its axes (what a squared joint can turn an edge into). */
function parts(n: Vector3): number[][] {
  const out: number[][] = [];
  const axes = [0, 1, 2].filter((a) => Math.abs(n.getComponent(a)) > 1e-3);
  for (let set = 1; set < 1 << axes.length; set++) {
    const v = new Vector3();
    axes.forEach((a, i) => {
      if ((set >> i) & 1) v.setComponent(a, n.getComponent(a));
    });
    out.push(v.normalize().toArray());
  }
  return out;
}

function blocksOf(mesh: InstancedMesh): Blocks {
  let b = meshes.get(mesh);
  if (b && b.version === mesh.instanceMatrix.version && b.count === mesh.count) return b;
  b = { version: mesh.instanceMatrix.version, count: mesh.count, ok: mesh.count > 0, min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity), loose: false };
  meshes.set(mesh, b);
  const e = mesh.instanceMatrix.array;
  let grow = 0;
  for (let i = 0; i < mesh.count && b.ok; i++) {
    const k = i * 16;
    const [sx, sy, sz] = [e[k], e[k + 5], e[k + 10]];
    // Moved and scaled only (a turned block's sides face other ways).
    const turn = Math.abs(e[k + 1]) + Math.abs(e[k + 2]) + Math.abs(e[k + 4]) + Math.abs(e[k + 6]) + Math.abs(e[k + 8]) + Math.abs(e[k + 9]);
    if (!(sx > 0 && sy > 0 && sz > 0) || turn > 1e-6 * (sx + sy + sz)) b.ok = false;
    b.min.min(_a.set(e[k + 12] - sx / 2, e[k + 13] - sy / 2, e[k + 14] - sz / 2));
    b.max.max(_a.set(e[k + 12] + sx / 2, e[k + 13] + sy / 2, e[k + 14] + sz / 2));
    grow = Math.max(grow, Math.min(sx, sy, sz) / 2);
  }
  // A covered side's bevel is pushed into the neighbour (up to its radius, under half the block).
  b.min.subScalar(grow);
  b.max.addScalar(grow);
  const open = mesh.geometry.getAttribute('voxOpen').array;
  for (let i = 0; i < mesh.count && !b.loose; i++) if ((open[i] as number) >= 64) b.loose = true;
  return b;
}
