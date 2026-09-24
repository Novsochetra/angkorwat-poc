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
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { getVoxelMaterial, VOXEL_MATERIALS, voxelPatternOf, type VoxelMaterialKey, type VoxelMaterialSpec } from './materials';
import { getVoxelDepthMaterial } from './shadow';
import type { Surf, VoxelBox, VoxelBuilder } from './VoxelBuilder';

export type VoxelQuality = 'low' | 'medium' | 'high';

/**
 * Block geometry per quality level. Every block is a cube with flat faces and
 * bevelled edges and corners (radius = the family's `bevel`):
 *  - high:   rounded in 2 steps (92 tris) — viewer / close-ups
 *  - medium: one chamfer with smooth normals (44 tris) — shades like a rounded
 *            block at a fraction of the cost; default for the game
 *  - low:    plain box (12 tris) — distant LOD
 * Families with `chamfer` get one flat cut on every edge from medium up.
 */
const SEGMENTS: Record<VoxelQuality, number> = { low: 0, medium: 1, high: 2 };

const geometryCache = new Map<string, BufferGeometry>();

/**
 * Unit-size block for a material's bevel ratio. Instances are scaled to their
 * real size by the instance matrix; the voxel shader re-bevels them so the
 * bevel keeps the same size on every edge (see materials.ts).
 */
export function unitVoxelGeometry(bevel: number, segments: number, flat = false): BufferGeometry {
  const k = `${bevel.toFixed(4)}|${segments}|${flat ? 'flat' : 'smooth'}`;
  let geo = geometryCache.get(k);
  if (!geo) {
    if (segments >= 1) geo = roundedBlockGeometry(1, 1, 1, bevel, segments, flat);
    else {
      const raw = new BoxGeometry(1, 1, 1);
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
 * Bevelled block: 6 flat faces joined by edges and corners rounded in `segments`
 * steps (1 = a single chamfer). A point sits on the inset corner pushed out by
 * the radius along its direction, so the shader can re-bevel it at any size.
 * Each corner is a triangle grid over the sphere octant, each edge a strip
 * between two corners. Smooth: normals follow the rounding, so the light rolls
 * over it. Flat: every strip and corner facet has its own normal, so each bevel
 * step reads as a flat cut with crisp lines on both sides.
 */
export function roundedBlockGeometry(sx: number, sy: number, sz: number, radius: number, segments: number, flat = false): BufferGeometry {
  const s = Math.max(1, Math.round(segments));
  const h = [sx / 2, sy / 2, sz / 2];
  const r = Math.max(1e-4, Math.min(radius, h[0] * 0.999, h[1] * 0.999, h[2] * 0.999));
  const inset = [h[0] - r, h[1] - r, h[2] - r];
  // Surface points and their directions (the rounded normal).
  const pp: number[] = [];
  const pn: number[] = [];
  const ids = new Map<number, number>();
  // Point of corner c (bits xyz: + side) at rounding step t (t[0] + t[1] + t[2] = s;
  // [s, 0, 0] lies on the x face). Steps are even in angle along every edge.
  const vid = (c: number, t: readonly number[]) => {
    const k = ((c * (s + 1) + t[0]) * (s + 1) + t[1]) * (s + 1) + t[2];
    let id = ids.get(k);
    if (id === undefined) {
      const sg = [c & 1 ? 1 : -1, c & 2 ? 1 : -1, c & 4 ? 1 : -1];
      const d = t.map((ti, a) => Math.sin(((ti / s) * Math.PI) / 2) * sg[a]);
      const l = Math.hypot(d[0], d[1], d[2]);
      for (let a = 0; a < 3; a++) {
        pp.push(sg[a] * inset[a] + (r * d[a]) / l);
        pn.push(d[a] / l);
      }
      id = ids.size;
      ids.set(k, id);
    }
    return id;
  };
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const vertex = (p: number, n: readonly number[]) => {
    pos.push(pp[p * 3], pp[p * 3 + 1], pp[p * 3 + 2]);
    nor.push(n[0], n[1], n[2]);
    return pos.length / 3 - 1;
  };
  const shared = new Map<number, number>();
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
  // A triangle or quad (points in order around it).
  const poly = (...ps: number[]) => {
    let vs: number[];
    if (flat) {
      const n = [0, 0, 0];
      for (const p of ps) for (let a = 0; a < 3; a++) n[a] += pn[p * 3 + a];
      const l = Math.hypot(n[0], n[1], n[2]);
      vs = ps.map((p) => vertex(p, [n[0] / l, n[1] / l, n[2] / l]));
    } else
      vs = ps.map((p) => {
        let v = shared.get(p);
        if (v === undefined) shared.set(p, (v = vertex(p, [pn[p * 3], pn[p * 3 + 1], pn[p * 3 + 2]])));
        return v;
      });
    tri(vs[0], vs[1], vs[2]);
    if (vs.length === 4) tri(vs[0], vs[2], vs[3]);
  };
  const corner = (bits: readonly number[]) => bits[0] | (bits[1] << 1) | (bits[2] << 2);
  const step = (a: number, ta: number, b: number, tb: number) => {
    const t = [0, 0, 0];
    t[a] = ta;
    t[b] = tb;
    return t;
  };
  // Faces.
  for (let a = 0; a < 3; a++)
    for (const sa of [0, 1]) {
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
        bits[a] = sa;
        bits[b] = pb;
        bits[c] = pc;
        cs.push(vid(corner(bits), step(a, s, b, 0)));
      }
      poly(cs[0], cs[1], cs[2], cs[3]);
    }
  // Edges between face (a, sa) and face (b, sb), running along axis c.
  for (let a = 0; a < 3; a++)
    for (let b = a + 1; b < 3; b++) {
      const c = 3 - a - b;
      for (const sa of [0, 1])
        for (const sb of [0, 1]) {
          const at = (sc: number, k: number) => {
            const bits = [0, 0, 0];
            bits[a] = sa;
            bits[b] = sb;
            bits[c] = sc;
            return vid(corner(bits), step(a, s - k, b, k));
          };
          for (let k = 0; k < s; k++) poly(at(0, k), at(1, k), at(1, k + 1), at(0, k + 1));
        }
    }
  // Corners: row i holds the steps [s - i, i - j, j].
  for (let c = 0; c < 8; c++) {
    const at = (i: number, j: number) => vid(c, [s - i, i - j, j]);
    for (let i = 0; i < s; i++)
      for (let j = 0; j <= i; j++) {
        poly(at(i, j), at(i + 1, j), at(i + 1, j + 1));
        if (j < i) poly(at(i, j), at(i + 1, j + 1), at(i, j + 1));
      }
  }
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
    const chamfer = (spec as VoxelMaterialSpec).chamfer ?? false;
    const segments = chamfer ? Math.min(1, SEGMENTS[quality]) : SEGMENTS[quality];
    const geometry = unitVoxelGeometry(spec.bevel, segments, chamfer);
    // A thin geometry wrapper per mesh: shares the cached index/position/normal
    // buffers and adds the per-instance side masks and bevel radius.
    const geo = new BufferGeometry();
    geo.setIndex(geometry.index);
    geo.setAttribute('position', geometry.getAttribute('position'));
    geo.setAttribute('normal', geometry.getAttribute('normal'));
    const open = new Float32Array(list.length);
    const radius = new Float32Array(list.length);
    // Patterned families carry their surf amounts + shade; their colour stays pure.
    const surf = patterned(mat) ? new Float32Array(list.length * 4) : null;
    const mesh = new InstancedMesh(geo, getVoxelMaterial(mat), list.length);
    mesh.name = `${group.name}:${mat}`;
    // (the look panel rebuilds the edges from this: segments, flat cut or round)
    mesh.userData.voxelShape = { segments, flat: chamfer };
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      // Bits 0–5: exposed sides; bits 6–11: joints to other blocks.
      open[i] = (b.open ?? 63) | ((b.joint ?? 0) << 6);
      radius[i] = b.radius ?? 0;
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
    geo.setAttribute('voxRadius', new InstancedBufferAttribute(radius, 1));
    if (surf) geo.setAttribute('voxSurf', new InstancedBufferAttribute(surf, 4));
    // The code that made each instance (dev builds), for the feedback tool's picker.
    if (list.some((b) => b.src)) mesh.userData.voxelSources = list.map((b) => b.src);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = options.castShadow ?? true;
    mesh.receiveShadow = options.receiveShadow ?? true;
    // Shadows are cast by the re-bevelled block, not its square box.
    mesh.customDepthMaterial = getVoxelDepthMaterial(mat);
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
