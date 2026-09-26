import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { SourceTrace } from '../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../voxel/materials';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { HeightField } from '../heightfield';

/**
 * Shared pieces for the jungle's lived-in places (camps.ts): a site frame
 * that turns local coordinates (m; +z the way the site faces, +x its left,
 * +y up from the site's ground) into map ones, timbers and logs between two
 * points, sagging ropes, and the tones of weathered wood, thatch and stone.
 */

// ── Tones (sRGB) ────────────────────────────────────────────────────────────

/** Weathered planks, warm. */
export const PLANK = [0xa87a45, 0x9c703d, 0xb3864f, 0x926838, 0xa38a68];
/** Old grey-brown posts and beams, darker. */
export const POST = [0x6b5a48, 0x75634f, 0x5f5040, 0x806b55];
/** Split bamboo and woven panels, pale straw. */
export const BAMBOO = [0xc9a66b, 0xbf9b5f, 0xd2b077, 0xb8955a];
/** Dried palm-leaf thatch: grey-gold, darker underneath. */
export const THATCH = [0x8c7a52, 0x9a865c, 0x7f6e4a, 0xa38f66, 0x86744e];
/** Fresh-cut wood ends and split logs. */
export const CUT = [0xd8b27a, 0xcfa56b, 0xe0bd88];
/** Bark of cut logs. */
export const LOG_BARK = [0x5f4a38, 0x6b533e, 0x564231, 0x735a43];
/** Grey sandstone and river stones. */
export const ROCK = [0x8a8378, 0x7d776d, 0x958d80, 0x6f6a62, 0x9c9486];
/** Laterite flagstones (stepping stones, post footings): warm red-brown, ochre (grey went navy in the shade). */
export const FLAGSTONE = [0xa86f47, 0x9e6640, 0xb37a50, 0x94603d];
/** Moss on stones (mapLeaf: soft cushions). */
export const MOSS = [0x4f6a2c, 0x5a7732, 0x44602a, 0x66823a];
/** Rope and twine. */
export const ROPE = [0x7a6446, 0x6e5a3e, 0x857050];
/** Saffron of a monk's robe. */
export const SAFFRON = [0xe07a1f, 0xdb741c, 0xe48224, 0xd8701d];
/** Ferns and jungle greens (mapLeaf). */
export const FERN = [0x4f7a2a, 0x5b8a30, 0x3f6a22, 0x6a9a3a, 0x456f26];

export const pickTone = (list: readonly number[], i: number, j: number, k: number, seed = 0): number => list[Math.floor(hash3(i, j, k, seed) * list.length)];

// ── Site frame ──────────────────────────────────────────────────────────────

const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const _m = new Matrix4();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const UP = new Vector3(0, 1, 0);

export type P3 = readonly [number, number, number];

/** Extra settings for a block placed through a site. */
export interface SiteBox {
  /** Turn in the site's own frame (radians, Euler XYZ). */
  rx?: number;
  ry?: number;
  rz?: number;
  shade?: number;
}

/**
 * A place on the map with its own frame: origin at (x, y, z) on the map,
 * turned by `yaw` (its +z looks toward (sin yaw, cos yaw)), so the builds
 * can be written square to where the site faces. Blocks go into `b`.
 */
export class Site {
  readonly cos: number;
  readonly sin: number;

  constructor(
    readonly b: VoxelBuilder,
    readonly field: HeightField,
    readonly x: number,
    readonly y: number,
    readonly z: number,
    readonly yaw: number,
    readonly src: SourceTrace | undefined,
    readonly seed: number,
  ) {
    this.cos = Math.cos(yaw);
    this.sin = Math.sin(yaw);
  }

  /** Map point of a local one. */
  world(lx: number, ly: number, lz: number, out = new Vector3()): Vector3 {
    return out.set(this.x + lx * this.cos + lz * this.sin, this.y + ly, this.z - lx * this.sin + lz * this.cos);
  }

  /** Height of the land under a local point, from the site's ground (m). */
  ground(lx: number, lz: number): number {
    return this.field.heightAt(this.x + lx * this.cos + lz * this.sin, this.z - lx * this.sin + lz * this.cos) - this.y;
  }

  /** A block at a local point, sized along the local axes. */
  box(lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, color: number, mat: VoxelMaterialKey, o: SiteBox = {}): void {
    const w = this.world(lx, ly, lz, _a);
    let rx = 0;
    let ry = this.yaw + (o.ry ?? 0);
    let rz = 0;
    if (o.rx || o.rz) {
      // (the site's turn, then the block's own)
      _q.setFromAxisAngle(UP, this.yaw).multiply(_q2.setFromEuler(_e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'XYZ')));
      _e.setFromQuaternion(_q, 'XYZ');
      rx = _e.x;
      ry = _e.y;
      rz = _e.z;
    }
    this.b.box(w.x, w.y, w.z, sx, sy, sz, color, mat, { src: this.src, shade: o.shade, rx: rx || undefined, ry: ry || undefined, rz: rz || undefined });
  }

  /**
   * A timber from local point a to b (its length along the line), `w` wide
   * and `h` deep; `roll` turns it about its own length (0: its width lies
   * level). Map-space blocks: works at any slope.
   */
  beam(a: P3, b: P3, w: number, h: number, color: number, mat: VoxelMaterialKey, roll = 0, shade?: number): void {
    this.world(a[0], a[1], a[2], _a);
    this.world(b[0], b[1], b[2], _b);
    beamWorld(this.b, _a, _b, w, h, color, mat, roll, shade, this.src);
  }

  /**
   * A round-ish log (two boxes turned 45° about its length: an octagon)
   * from a to b, `d` thick.
   */
  log(a: P3, b: P3, d: number, color: number, mat: VoxelMaterialKey, shade?: number): void {
    const s = d * 0.83;
    this.beam(a, b, s, s, color, mat, 0, shade);
    this.beam(a, b, s, s, color, mat, Math.PI / 4, (shade ?? 1) * 0.97);
  }

  /**
   * A rope from a to b sagging `sag` m in the middle, in `n` straight
   * pieces, `t` thick.
   */
  rope(a: P3, b: P3, sag: number, t: number, n: number, color: number, mat: VoxelMaterialKey = 'wood'): void {
    const at = (u: number): [number, number, number] => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - sag * 4 * u * (1 - u), a[2] + (b[2] - a[2]) * u];
    for (let i = 0; i < n; i++) this.beam(at(i / n), at((i + 1) / n), t, t, color, mat);
  }
}

/** A timber between two map points (see `Site.beam`). */
export function beamWorld(b: VoxelBuilder, a: Vector3, c: Vector3, w: number, h: number, color: number, mat: VoxelMaterialKey, roll = 0, shade?: number, src?: SourceTrace): void {
  _z.subVectors(c, a);
  const len = _z.length();
  if (len < 1e-4) return;
  _z.divideScalar(len);
  // Its width lies level (across the line, in the ground plane), then rolled about the line.
  _x.crossVectors(UP, _z);
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
  _x.normalize();
  _y.crossVectors(_z, _x);
  if (roll) {
    const c0 = Math.cos(roll);
    const s0 = Math.sin(roll);
    const xx = _x.clone();
    _x.multiplyScalar(c0).addScaledVector(_y, s0);
    _y.multiplyScalar(c0).addScaledVector(xx, -s0);
  }
  _e.setFromRotationMatrix(_m.makeBasis(_x, _y, _z), 'XYZ');
  b.box((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2, w, h, len, color, mat, { src, shade, rx: _e.x || undefined, ry: _e.y || undefined, rz: _e.z || undefined });
}

/**
 * A stone: a main block and a smaller one or two on it, turned a little,
 * moss on the top when `moss` > 0 (the chance). `s` is its size (m).
 */
export function stone(site: Site, lx: number, lz: number, s: number, i: number, moss: number, sink = 0.15): void {
  const r = (k: number) => hash3(i, k, lx * 7 + lz * 13, site.seed + 5);
  const y0 = site.ground(lx, lz) - sink * s;
  const w = s * (0.8 + 0.4 * r(1));
  const d = s * (0.7 + 0.4 * r(2));
  const h = s * (0.45 + 0.35 * r(3));
  const turn = r(4) * Math.PI;
  const tilt = (r(5) - 0.5) * 0.25;
  site.box(lx, y0 + h / 2, lz, w, h, d, pickTone(ROCK, i, 1, 2, site.seed), 'mapStone', { ry: turn, rz: tilt, shade: 0.9 + 0.15 * r(6) });
  // A smaller lump on one side of the top.
  const ox = (r(7) - 0.5) * w * 0.4;
  const oz = (r(8) - 0.5) * d * 0.4;
  const h2 = h * (0.35 + 0.3 * r(9));
  site.box(lx + ox, y0 + h + h2 / 2 - 0.04, lz + oz, w * 0.6, h2, d * 0.6, pickTone(ROCK, i, 3, 4, site.seed), 'mapStone', { ry: turn + 0.4, shade: 0.95 + 0.1 * r(10) });
  if (r(11) < moss) {
    // A cushion of moss over the top (thin, a little smaller than the top).
    site.box(lx + ox * 0.3, y0 + h + h2 * 0.55, lz + oz * 0.3, w * 0.72, 0.1 + h2 * 0.35, d * 0.72, pickTone(MOSS, i, 5, 6, site.seed), 'mapLeaf', { ry: turn + 0.2 });
  }
}

/**
 * A fern: fronds from one point, arching out and down (thin mapLeaf
 * blocks), `s` its reach (m).
 */
export function fern(site: Site, lx: number, lz: number, s: number, i: number): void {
  const r = (k: number) => hash3(i, k, lx * 5 + lz * 11, site.seed + 9);
  const y0 = site.ground(lx, lz);
  const n = 7 + Math.floor(r(1) * 3);
  const col = pickTone(FERN, i, 2, 3, site.seed);
  for (let f = 0; f < n; f++) {
    const a = (f / n) * Math.PI * 2 + r(10 + f) * 0.6;
    const len = s * (0.8 + 0.35 * r(20 + f));
    const up = 0.95 + 0.3 * r(30 + f);
    // A frond: rising steeply from the heart, arching out, the tip drooping.
    const ca = Math.sin(a);
    const cz = Math.cos(a);
    const m1: P3 = [lx + ca * len * 0.3, y0 + len * 0.5 * Math.sin(up), lz + cz * len * 0.3];
    const m2: P3 = [lx + ca * len * 0.68, y0 + len * 0.62 * Math.sin(up), lz + cz * len * 0.68];
    const tip: P3 = [lx + ca * len, y0 + len * 0.35 * Math.sin(up), lz + cz * len];
    site.beam([lx, y0 + 0.02, lz], m1, 0.14 * s, 0.05, col, 'mapLeaf', 0, 0.9);
    site.beam(m1, m2, 0.2 * s, 0.05, col, 'mapLeaf', 0, 1.0);
    site.beam(m2, tip, 0.13 * s, 0.05, col, 'mapLeaf', 0, 1.1);
  }
}

/**
 * A banana plant: a few pseudo-stems from one clump, big ragged leaves
 * arching out from the top of each, and on the tallest a purple flower
 * bud hanging on its stalk. `h` the tallest stem (m).
 */
export function banana(site: Site, lx: number, lz: number, h: number, i: number): void {
  const r = (k: number) => hash3(i, k, lx * 3 + lz * 7, site.seed + 21);
  const y0 = site.ground(lx, lz);
  const STEM = [0x6f7d3e, 0x7a8642, 0x66733a];
  const LEAF = [0x6a9a36, 0x78a83c, 0x5e8c30, 0x86b446];
  const stems = 2 + Math.floor(r(1) * 2);
  for (let k = 0; k < stems; k++) {
    const sh = h * (k === 0 ? 1 : 0.55 + 0.3 * r(2 + k));
    const ox = k === 0 ? 0 : (r(5 + k) - 0.5) * 0.9;
    const oz = k === 0 ? 0 : (r(8 + k) - 0.5) * 0.9;
    const x = lx + ox;
    const z = lz + oz;
    const top: P3 = [x + 0.05, y0 + sh, z];
    site.beam([x, y0 - 0.1, z], top, 0.26 - 0.06 * k, 0.26 - 0.06 * k, pickTone(STEM, i, k, 1, site.seed), 'mapBark', 0, 0.95);
    const leaves = k === 0 ? 7 : 4;
    for (let l = 0; l < leaves; l++) {
      const a = (l / leaves) * Math.PI * 2 + r(12 + l + k * 9) * 0.8;
      const len = sh * (0.55 + 0.25 * r(20 + l + k * 9));
      const ca = Math.sin(a);
      const cz = Math.cos(a);
      // Stalk up and out, then the blade arching over and down (in two pieces, split at the rib).
      const m: P3 = [top[0] + ca * len * 0.45, top[1] + len * 0.28, top[2] + cz * len * 0.45];
      const tip: P3 = [top[0] + ca * len, top[1] - len * 0.05 - 0.25 * r(30 + l), top[2] + cz * len];
      const c = pickTone(LEAF, i, l, k + 2, site.seed);
      site.beam(top, m, 0.5, 0.04, c, 'mapLeaf', 0.15, 0.95);
      site.beam(m, tip, 0.56, 0.04, c, 'mapLeaf', -0.1, 1.05);
    }
    if (k === 0) {
      // The bud on its drooping stalk.
      const bx = top[0] + 0.35;
      site.beam(top, [bx, top[1] - 0.45, top[2] + 0.1], 0.05, 0.05, pickTone(STEM, i, 9, 9, site.seed), 'mapBark');
      site.box(bx, top[1] - 0.62, top[2] + 0.1, 0.16, 0.3, 0.16, 0x6b2f45, 'petal');
    }
  }
}
