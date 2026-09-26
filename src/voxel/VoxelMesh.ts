import {
  BoxGeometry,
  BufferAttribute,
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

/**
 * For each triangle of a unit block, the sides (bits as a box's `open`:
 * +x −x +y −y +z −z) whose being seen can show it. A face: its own side. An
 * edge strip between two faces: those two, and the sides at either end of
 * the edge (where four blocks meet, their rounded edges leave a narrow shaft
 * between them, seen from above down to where the tops are, so a top-only
 * block keeps its upright edges). A corner: its three sides. The kind comes
 * from the triangle's own normal (one, two or three axes), so every rounding
 * step counts.
 */
function sidesOfTriangles(geometry: BufferGeometry): Uint8Array {
  const index = geometry.index!;
  const pos = geometry.getAttribute('position');
  const sides = new Uint8Array(index.count / 3);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let t = 0; t < sides.length; t++) {
    a.fromBufferAttribute(pos, index.getX(t * 3));
    b.fromBufferAttribute(pos, index.getX(t * 3 + 1)).sub(a);
    c.fromBufferAttribute(pos, index.getX(t * 3 + 2)).sub(a);
    const n = b.cross(c).normalize();
    let m = 0;
    let axes = 0;
    let free = 0;
    for (let k = 0; k < 3; k++) {
      const v = n.getComponent(k);
      if (v > 1e-3) m |= 1 << (k * 2);
      else if (v < -1e-3) m |= 2 << (k * 2);
      else {
        free = 3 << (k * 2);
        continue;
      }
      axes++;
    }
    // (a triangle with no size has no side: always kept)
    sides[t] = axes === 0 ? 63 : axes === 2 ? m | free : m;
  }
  return sides;
}

const sidesIndexCache = new WeakMap<BufferAttribute, Map<number, BufferAttribute>>();

/**
 * The index of a unit block's triangles that can show while only the sides
 * in `shown` can be seen (see sidesOfTriangles). All sides: the block's own
 * index.
 */
export function openSidesIndex(geometry: BufferGeometry, shown: number): BufferAttribute {
  const full = geometry.index!;
  if ((shown & 63) === 63) return full;
  let byShown = sidesIndexCache.get(full);
  if (!byShown) sidesIndexCache.set(full, (byShown = new Map()));
  let index = byShown.get(shown & 63);
  if (!index) {
    const sides = sidesOfTriangles(geometry);
    const keep: number[] = [];
    for (let t = 0; t < sides.length; t++) if (sides[t] & shown) keep.push(full.getX(t * 3), full.getX(t * 3 + 1), full.getX(t * 3 + 2));
    index = new BufferAttribute(full.array instanceof Uint32Array ? new Uint32Array(keep) : new Uint16Array(keep), 1);
    byShown.set(shown & 63, index);
  }
  return index;
}

/**
 * The land under a builder's blocks, for `hideCovered`: a grid of cells, each
 * solid below its `floor` (the hollow under the land, closed off all round).
 */
export interface CoverGround {
  /** The grid's corner (m), cell size (m) and cells across x and z. */
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  /** Per cell (i + k · nx): solid below this height (m); −Infinity: nothing. */
  floor: Float32Array;
}

/**
 * How far out a side is tested (m): past the shader's overlap of flush faces
 * (1.2 cm), well inside any block. A side's own border is left out of the
 * test by `EDGE` (m), so blocks meeting it at the same line cover it.
 */
const COVER = { out: 0.02, edge: 0.01, hash: 2 };

/** Rectangles (u0, u1, v0, v1 each) to test a side against, and the two work lists of `coveredBy`. */
const RECTS = 2048;
const rectBuf = new Float64Array(RECTS * 4);
const workA = new Float64Array(RECTS * 4);
const workB = new Float64Array(RECTS * 4);

/**
 * Whether rectangle [u0, u1] × [v0, v1] lies inside the union of the first
 * `count` rectangles of `rectBuf`: each one is cut out of what is left. Too
 * many pieces left: not covered (the side is drawn).
 */
function coveredBy(u0: number, u1: number, v0: number, v1: number, count: number): boolean {
  let left = workA;
  let next = workB;
  left[0] = u0;
  left[1] = u1;
  left[2] = v0;
  left[3] = v1;
  let nl = 1;
  for (let r = 0; r < count; r++) {
    const ru0 = rectBuf[r * 4];
    const ru1 = rectBuf[r * 4 + 1];
    const rv0 = rectBuf[r * 4 + 2];
    const rv1 = rectBuf[r * 4 + 3];
    let nn = 0;
    for (let p = 0; p < nl && nn + 4 <= RECTS; p++) {
      const pu0 = left[p * 4];
      const pu1 = left[p * 4 + 1];
      const pv0 = left[p * 4 + 2];
      const pv1 = left[p * 4 + 3];
      if (ru1 <= pu0 || ru0 >= pu1 || rv1 <= pv0 || rv0 >= pv1) {
        nn = piece(next, nn, pu0, pu1, pv0, pv1);
        continue;
      }
      // (the parts of p outside r)
      if (pu0 < ru0) nn = piece(next, nn, pu0, ru0, pv0, pv1);
      if (pu1 > ru1) nn = piece(next, nn, ru1, pu1, pv0, pv1);
      const a = Math.max(pu0, ru0);
      const b = Math.min(pu1, ru1);
      if (pv0 < rv0) nn = piece(next, nn, a, b, pv0, rv0);
      if (pv1 > rv1) nn = piece(next, nn, a, b, rv1, pv1);
    }
    if (nn + 4 > RECTS) return false;
    const t = left;
    left = next;
    next = t;
    nl = nn;
    if (!nl) return true;
  }
  return false;
}
/** Put a rectangle in a work list at `n`; returns the new length. */
function piece(list: Float64Array, n: number, a: number, b: number, c: number, d: number): number {
  list[n * 4] = a;
  list[n * 4 + 1] = b;
  list[n * 4 + 2] = c;
  list[n * 4 + 3] = d;
  return n + 1;
}

/**
 * The sides of each block that can be seen: those its builder marks open,
 * and any other side with somewhere just outside it that is not solid (not
 * inside another block, not below the ground's floor). The builder's `open`
 * marks what the blocks look like (a side against a neighbour shades as a
 * seam), and a side it marks covered may still stick out a little (a grass
 * lip over a cliff, a pillar out of the wall): only this test leaves sides
 * out. Turned blocks show every side and cover nothing.
 */
function shownSides(boxes: VoxelBox[], ground?: CoverGround): Uint8Array {
  const n = boxes.length;
  const shown = new Uint8Array(n);
  const lo = new Float64Array(n * 3);
  const hi = new Float64Array(n * 3);
  const still = new Uint8Array(n);
  let [gx0, gx1, gz0, gz1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let j = 0; j < n; j++) {
    const b = boxes[j];
    lo[j * 3] = b.x - b.sx / 2;
    lo[j * 3 + 1] = b.y - b.sy / 2;
    lo[j * 3 + 2] = b.z - b.sz / 2;
    hi[j * 3] = b.x + b.sx / 2;
    hi[j * 3 + 1] = b.y + b.sy / 2;
    hi[j * 3 + 2] = b.z + b.sz / 2;
    if (b.rx || b.ry || b.rz) continue;
    still[j] = 1;
    gx0 = Math.min(gx0, lo[j * 3]);
    gx1 = Math.max(gx1, hi[j * 3]);
    gz0 = Math.min(gz0, lo[j * 3 + 2]);
    gz1 = Math.max(gz1, hi[j * 3 + 2]);
  }
  // Blocks by squares of the ground plan (a flat list per square: `first`, `items`).
  const H = COVER.hash;
  const ox = Math.floor(gx0 / H);
  const oz = Math.floor(gz0 / H);
  const w = Math.max(1, Math.floor(gx1 / H) - ox + 1);
  const d = Math.max(1, Math.floor(gz1 / H) - oz + 1);
  const first = new Int32Array(w * d + 1);
  const each = (j: number, fn: (sq: number) => void) => {
    for (let i = Math.floor(lo[j * 3] / H) - ox; i <= Math.floor(hi[j * 3] / H) - ox; i++)
      for (let k = Math.floor(lo[j * 3 + 2] / H) - oz; k <= Math.floor(hi[j * 3 + 2] / H) - oz; k++) fn(i + k * w);
  };
  for (let j = 0; j < n; j++) if (still[j]) each(j, (sq) => first[sq + 1]++);
  for (let q = 0; q < w * d; q++) first[q + 1] += first[q];
  const items = new Int32Array(first[w * d]);
  const fill = first.slice(0, w * d);
  for (let j = 0; j < n; j++) if (still[j]) each(j, (sq) => (items[fill[sq]++] = j));

  for (let j = 0; j < n; j++) {
    let m = (boxes[j].open ?? 63) & 63;
    if (!still[j]) m = 63;
    for (let s = 0; s < 6 && m !== 63; s++) {
      if (m & (1 << s)) continue;
      const a = s >> 1;
      const u = (a + 1) % 3;
      const v = (a + 2) % 3;
      const q = s & 1 ? lo[j * 3 + a] - COVER.out : hi[j * 3 + a] + COVER.out;
      const e = COVER.edge;
      const u0 = lo[j * 3 + u] + e;
      const u1 = hi[j * 3 + u] - e;
      const v0 = lo[j * 3 + v] + e;
      const v1 = hi[j * 3 + v] - e;
      let count = 0;
      // The ground's solid part in the plane just outside (u, v: y, z for an x side · z, x for a y side · x, y for a z side).
      if (ground) {
        const { x0, z0, cell, nx, nz, floor } = ground;
        const i0 = Math.floor(((a === 0 ? q : lo[j * 3]) - x0) / cell);
        const i1 = a === 0 ? i0 : Math.floor((hi[j * 3] - 1e-6 - x0) / cell);
        const k0 = Math.floor(((a === 2 ? q : lo[j * 3 + 2]) - z0) / cell);
        const k1 = a === 2 ? k0 : Math.floor((hi[j * 3 + 2] - 1e-6 - z0) / cell);
        for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++)
          for (let k = Math.max(0, k0); k <= Math.min(nz - 1, k1); k++) {
            const top = floor[i + k * nx];
            if (top === -Infinity || count >= RECTS || (a === 1 && top <= q)) continue;
            if (a === 0) count = piece(rectBuf, count, -Infinity, top, z0 + k * cell, z0 + (k + 1) * cell);
            else if (a === 2) count = piece(rectBuf, count, x0 + i * cell, x0 + (i + 1) * cell, -Infinity, top);
            else count = piece(rectBuf, count, z0 + k * cell, z0 + (k + 1) * cell, x0 + i * cell, x0 + (i + 1) * cell);
          }
      }
      // Other blocks through the plane just outside (one of them often covers the whole side).
      let whole = false;
      const i0 = Math.floor((a === 0 ? q : lo[j * 3]) / H) - ox;
      const i1 = Math.floor((a === 0 ? q : hi[j * 3]) / H) - ox;
      const k0 = Math.floor((a === 2 ? q : lo[j * 3 + 2]) / H) - oz;
      const k1 = Math.floor((a === 2 ? q : hi[j * 3 + 2]) / H) - oz;
      for (let i = Math.max(0, i0); i <= Math.min(w - 1, i1) && !whole; i++)
        for (let k = Math.max(0, k0); k <= Math.min(d - 1, k1) && !whole; k++)
          for (let t = first[i + k * w]; t < first[i + k * w + 1]; t++) {
            const o = items[t];
            const o3 = o * 3;
            if (o === j || lo[o3 + a] >= q || hi[o3 + a] <= q) continue;
            const ou0 = lo[o3 + u];
            const ou1 = hi[o3 + u];
            const ov0 = lo[o3 + v];
            const ov1 = hi[o3 + v];
            if (ou1 <= u0 || ou0 >= u1 || ov1 <= v0 || ov0 >= v1) continue;
            if (ou0 <= u0 && ou1 >= u1 && ov0 <= v0 && ov1 >= v1) {
              whole = true;
              break;
            }
            if (count < RECTS) count = piece(rectBuf, count, ou0, ou1, ov0, ov1);
          }
      if (!whole && !(count && coveredBy(u0, u1, v0, v1, count))) m |= 1 << s;
    }
    shown[j] = m;
  }
  return shown;
}

/**
 * A family's blocks grouped by the sides they show (`hideCovered`): a group
 * of its own for each set of shown sides common enough (the land's tops, 3
 * in 4 of its blocks), the rest together, drawn with every side any of them
 * shows. Each group is one more draw call, so rare sets stay in the rest:
 * a group of its own needs 1000 blocks (on the low graphics level a top-only
 * block saves about 4 triangles: less than 4000 is not worth a draw call on
 * a phone).
 */
const COMMON_SIDES = { blocks: 1000, share: 0.15 };
function bySides(boxes: VoxelBox[], shown: Uint8Array): { sides: number; list: VoxelBox[] }[] {
  const families = new Map<string, Map<number, VoxelBox[]>>();
  for (let j = 0; j < boxes.length; j++) {
    const b = boxes[j];
    let groups = families.get(b.mat);
    if (!groups) families.set(b.mat, (groups = new Map()));
    let g = groups.get(shown[j]);
    if (!g) groups.set(shown[j], (g = []));
    g.push(b);
  }
  const out: { sides: number; list: VoxelBox[] }[] = [];
  for (const groups of families.values()) {
    let total = 0;
    for (const g of groups.values()) total += g.length;
    const min = Math.max(COMMON_SIDES.blocks, total * COMMON_SIDES.share);
    const rest: VoxelBox[] = [];
    let restSides = 0;
    for (const [m, g] of groups)
      if (m !== 63 && g.length >= min) out.push({ sides: m, list: g });
      else {
        for (const b of g) rest.push(b);
        restSides |= m;
      }
    if (rest.length) out.push({ sides: restSides, list: rest });
  }
  return out;
}

export interface VoxelMeshOptions {
  quality?: VoxelQuality;
  /** Subtracted from every box position (e.g. the joint pivot the part hangs from). */
  offset?: Vector3;
  castShadow?: boolean;
  receiveShadow?: boolean;
  name?: string;
  /**
   * Leave out the sides no one can see: every side the builder does not
   * mark open, where just outside it is all solid (other blocks of this
   * builder; with `ground`, the hollow under the land too). The blocks of a
   * family are then split by the sides they show (a few meshes each,
   * `userData.voxelSides`: the sides drawn, bits as `open`). For blocks that
   * never move (a swaying leaf would show what it covered).
   */
  hideCovered?: boolean | { ground?: CoverGround };
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
  const hide = options.hideCovered;
  const lists = hide ? bySides(builder.boxes, shownSides(builder.boxes, hide === true ? undefined : hide.ground)) : [...buckets.values()].map((l) => ({ sides: 63, list: l }));
  for (const { sides, list } of lists) {
    const { mat } = list[0];
    const spec = VOXEL_MATERIALS[mat];
    const chamfer = (spec as VoxelMaterialSpec).chamfer ?? false;
    const segments = chamfer ? Math.min(1, SEGMENTS[quality]) : SEGMENTS[quality];
    const geometry = unitVoxelGeometry(spec.bevel, segments, chamfer);
    // A thin geometry wrapper per mesh: shares the cached index/position/normal
    // buffers and adds the per-instance side masks and bevel radius.
    const geo = new BufferGeometry();
    geo.setIndex(openSidesIndex(geometry, sides));
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
    // (the sides drawn, when some are left out: a new shape of block keeps to them, openSidesIndex)
    if (sides !== 63) mesh.userData.voxelSides = sides;
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
