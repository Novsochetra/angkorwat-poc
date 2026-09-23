import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { getVoxelMaterial, VOXEL_MATERIALS, voxelPatternOf, type VoxelMaterialKey } from './materials';
import type { Surf, VoxelBox, VoxelBuilder } from './VoxelBuilder';

export type VoxelQuality = 'low' | 'medium' | 'high';

/**
 * Block geometry per quality level:
 *  - high:   RoundedBoxGeometry, 2 bevel segments (300 tris) — viewer / close-ups
 *  - medium: 24-vertex chamfered box with split normals (44 tris) — shades like a
 *            rounded block at a fraction of the cost; default for the game
 *  - low:    plain box (12 tris) — distant LOD
 */
const SEGMENTS: Record<VoxelQuality, number> = { low: 0, medium: 1, high: 2 };

const geometryCache = new Map<string, BufferGeometry>();

/**
 * Unit-size block for a material's bevel ratio. Instances are scaled to their
 * real size by the instance matrix; the voxel shader re-bevels them so the
 * rounding keeps the same radius on every edge (see materials.ts).
 */
export function unitVoxelGeometry(bevel: number, segments: number): BufferGeometry {
  const k = `${bevel.toFixed(4)}|${segments}`;
  let geo = geometryCache.get(k);
  if (!geo) {
    if (segments === 1) geo = chamferBoxGeometry(1, 1, 1, bevel);
    else {
      const raw = segments <= 0 ? new BoxGeometry(1, 1, 1) : new RoundedBoxGeometry(1, 1, 1, segments, bevel);
      raw.deleteAttribute('uv');
      geo = mergeVertices(raw, 1e-5);
      raw.dispose();
    }
    geo.computeBoundingSphere();
    geometryCache.set(k, geo);
  }
  return geo;
}

/**
 * Chamfered box: 6 inset faces, 12 bevel quads and 8 corner triangles sharing 24
 * vertices (one per corner per face normal). Normals interpolate across each
 * bevel, so lighting and the rim shader read it as a rounded edge.
 */
export function chamferBoxGeometry(sx: number, sy: number, sz: number, radius: number): BufferGeometry {
  const h = [sx / 2, sy / 2, sz / 2];
  const r = Math.max(1e-4, Math.min(radius, h[0] * 0.999, h[1] * 0.999, h[2] * 0.999));
  const inset = [h[0] - r, h[1] - r, h[2] - r];
  const pos: number[] = [];
  const nor: number[] = [];
  // Vertex (corner c = bits xyz, axis a): inset corner pushed out to the face along a.
  const vid = (c: number, a: number) => c * 3 + a;
  for (let c = 0; c < 8; c++) {
    const sg = [c & 1 ? 1 : -1, c & 2 ? 1 : -1, c & 4 ? 1 : -1];
    for (let a = 0; a < 3; a++) {
      const p = [sg[0] * inset[0], sg[1] * inset[1], sg[2] * inset[2]];
      p[a] = sg[a] * h[a];
      const n = [0, 0, 0];
      n[a] = sg[a];
      pos.push(p[0], p[1], p[2]);
      nor.push(n[0], n[1], n[2]);
    }
  }
  const idx: number[] = [];
  const tri = (a: number, b: number, c: number) => {
    // Orient outward (the shape is convex and centred on the origin).
    const pa = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]];
    const pb = [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]];
    const pc = [pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]];
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const m = [pa[0] + pb[0] + pc[0], pa[1] + pb[1] + pc[1], pa[2] + pb[2] + pc[2]];
    if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) idx.push(a, c, b);
    else idx.push(a, b, c);
  };
  const quad = (a: number, b: number, c: number, d: number) => {
    tri(a, b, c);
    tri(a, c, d);
  };
  const corner = (x: number, y: number, z: number) => (x ? 1 : 0) | (y ? 2 : 0) | (z ? 4 : 0);
  // Faces.
  for (let a = 0; a < 3; a++)
    for (const s of [0, 1]) {
      const b = (a + 1) % 3;
      const c = (a + 2) % 3;
      const cs: number[] = [];
      for (const [pb, pc] of [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]) {
        const bits = [0, 0, 0];
        bits[a] = s;
        bits[b] = pb;
        bits[c] = pc;
        cs.push(vid(corner(bits[0], bits[1], bits[2]), a));
      }
      quad(cs[0], cs[1], cs[2], cs[3]);
    }
  // Bevels between face (a, sa) and face (b, sb), running along axis c.
  for (let a = 0; a < 3; a++)
    for (let b = a + 1; b < 3; b++) {
      const c = 3 - a - b;
      for (const sa of [0, 1])
        for (const sb of [0, 1]) {
          const at = (sc: number, ax: number) => {
            const bits = [0, 0, 0];
            bits[a] = sa;
            bits[b] = sb;
            bits[c] = sc;
            return vid(corner(bits[0], bits[1], bits[2]), ax);
          };
          quad(at(0, a), at(1, a), at(1, b), at(0, b));
        }
    }
  // Corner triangles.
  for (let c = 0; c < 8; c++) tri(vid(c, 0), vid(c, 1), vid(c, 2));
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}

export interface VoxelMeshOptions {
  quality?: VoxelQuality;
  /** Subtracted from every box position (e.g. the joint pivot the part hangs from). */
  offset?: Vector3;
  castShadow?: boolean;
  receiveShadow?: boolean;
  name?: string;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);
const _c = new Color();

const q8 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
/** Two 0‥1 amounts in one float (8 bits each), unpacked by voxUnpack in the shader. */
const pack2 = (a: number, b: number) => q8(a) * 256 + q8(b);

/**
 * Per-instance data of a patterned family: packed surf amounts, the baked
 * shade (applied after the pattern, so moss and grass keep the block's AO) and
 * the merge mask (sides that continue into the same stone).
 */
export function packSurf(out: Float32Array, i: number, surf: Surf | undefined, shade: number, merge = 0): void {
  const s = surf ?? NO_SURF;
  out[i * 4] = pack2(s[0], s[1]);
  out[i * 4 + 1] = pack2(s[2], s[3]);
  out[i * 4 + 2] = shade;
  out[i * 4 + 3] = merge;
}
const NO_SURF: Surf = [0, 0, 0, 0];

const patterned = (mat: VoxelMaterialKey) => voxelPatternOf(mat) !== undefined;

/**
 * Turn a builder into instanced voxel meshes: one InstancedMesh per material
 * family (sizes live in the instance matrices), so a whole character is a
 * dozen draw calls and a world region only a few.
 */
export function buildVoxelMesh(builder: VoxelBuilder, options: VoxelMeshOptions = {}): Group {
  const quality = options.quality ?? 'high';
  const offset = options.offset ?? new Vector3();
  const buckets = new Map<string, VoxelBox[]>();
  for (const b of builder.boxes) {
    let list = buckets.get(b.mat);
    if (!list) buckets.set(b.mat, (list = []));
    list.push(b);
  }

  const group = new Group();
  group.name = options.name ?? 'voxels';
  // Builder space = instance position + offset (the feedback tool reports picks in it).
  group.userData.voxelOffset = offset.clone();
  for (const list of buckets.values()) {
    const { mat } = list[0];
    const spec = VOXEL_MATERIALS[mat];
    const geometry = unitVoxelGeometry(spec.bevel, SEGMENTS[quality]);
    // A thin geometry wrapper per mesh: shares the cached index/position/normal
    // buffers and adds the per-instance exposed-face mask.
    const geo = new BufferGeometry();
    geo.setIndex(geometry.index);
    geo.setAttribute('position', geometry.getAttribute('position'));
    geo.setAttribute('normal', geometry.getAttribute('normal'));
    const open = new Float32Array(list.length);
    // Patterned families carry their surf amounts + shade; their colour stays pure.
    const surf = patterned(mat) ? new Float32Array(list.length * 4) : null;
    const mesh = new InstancedMesh(geo, getVoxelMaterial(mat), list.length);
    mesh.name = `${group.name}:${mat}`;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      open[i] = b.open ?? 63;
      _p.set(b.x - offset.x, b.y - offset.y, b.z - offset.z);
      if (b.rx || b.ry || b.rz) _q.setFromEuler(_e.set(b.rx ?? 0, b.ry ?? 0, b.rz ?? 0));
      else _q.identity();
      _s.set(b.sx, b.sy, b.sz);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      _c.setHex(b.color);
      if (surf) packSurf(surf, i, b.surf, b.shade, b.merge);
      else _c.multiplyScalar(b.shade);
      mesh.setColorAt(i, _c);
    }
    geo.setAttribute('voxOpen', new InstancedBufferAttribute(open, 1));
    if (surf) geo.setAttribute('voxSurf', new InstancedBufferAttribute(surf, 4));
    // The code that made each instance (dev builds), for the feedback tool's picker.
    if (list.some((b) => b.src)) mesh.userData.voxelSources = list.map((b) => b.src);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = options.castShadow ?? true;
    mesh.receiveShadow = options.receiveShadow ?? true;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    group.add(mesh);
  }
  return group;
}

/** Dispose instanced meshes created by {@link buildVoxelMesh} (geometry/material are shared caches). */
export function disposeVoxelMesh(group: Group): void {
  group.traverse((o) => {
    const m = o as InstancedMesh;
    if (!m.isInstancedMesh) return;
    // Detach the shared cached buffers so disposing frees only this mesh's own data.
    const g = m.geometry;
    g.setIndex(null);
    g.deleteAttribute('position');
    g.deleteAttribute('normal');
    g.dispose();
    m.dispose();
  });
}
