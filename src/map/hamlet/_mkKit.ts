import { Euler, Quaternion, Vector3 } from 'three';
import type { SourceTrace } from '../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../voxel/materials';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';

/**
 * Plumbing for the market's build (hamlet/_market.ts): a box writer that
 * works in a turned frame (a stall's own space: x across, y up from the
 * ground, z to its front) and tags every box with the toggle it belongs to
 * (0: always there; else a stall's goods and spread tarp, or its rolled tarp
 * and folded parasol: `_mkToggles.ts` shows the ones open now), and the
 * market's structural pieces: bamboo and wooden poles, tilted slabs (tarps,
 * tin sheets, parasol panels), tarps, parasols, tables, platforms, stools.
 *
 * Families: wood and bamboo `mapBark` (solid, the camera sees through it
 * near him), tin, pots and motos `metal` (solid), cloth, goods and anything
 * that comes and goes with the time of day `petal` (soft: he walks through
 * it, like plants), the tree's leaves `mapLeaf`. Four families: four draws.
 */

export type Tones = readonly number[];
export const tone = (list: Tones, r: number): number => list[Math.min(list.length - 1, Math.floor(r * list.length))];

// ── Colours (sRGB) ───────────────────────────────────────────────────────────

export const BAMBOO: Tones = [0xc8b27a, 0xbba36c, 0xd4bf88, 0xae9660];
export const BAMBOO_OLD: Tones = [0xa89468, 0x9a875c, 0xb39f72];
export const WOOD: Tones = [0x8a6f55, 0x7d644c, 0x947a5e, 0x735c46, 0x9a8264];
export const POST: Tones = [0x4e3d30, 0x5a4636, 0x46372b, 0x55432f];
export const RUST: Tones = [0x9a5a32, 0x8a4f2c, 0xa8683a, 0x7c4a2a, 0x9d7458, 0x8f8a84, 0xa36236];
export const TARPS = {
  tarpBlue: [0x5d8cb8, 0x6a98c2, 0x547fa8, 0x6f9cc4],
  tarpOrange: [0xdc8a3c, 0xe29a4e, 0xd07a30, 0xe6a256],
  // (red, cream, green, yellow: never red-white-blue-white, which reads as the Thai flag)
  tarpStripe: [0xc8423a, 0xeee8dc, 0x3f8f5a, 0xe2b644],
} as const;
export const PARASOLS = {
  parasolRed: [0xc83a30, 0xf0ebe0],
  parasolGreen: [0x3f8f5a, 0xf0ebe0],
  parasolBlue: [0x3a78b8, 0xf0ebe0],
} as const;
export const STOOLS: Tones = [0xd03a30, 0x2a6ab0, 0x3a9a5a, 0xe0a02a];

// ── The box writer ───────────────────────────────────────────────────────────

const _q = new Quaternion();
const _qx = new Quaternion();
const _qz = new Quaternion();
const _e = new Euler();
const _up = new Vector3(0, 1, 0);
const _xa = new Vector3(1, 0, 0);
const _za = new Vector3(0, 0, 1);

export class MkBuild {
  readonly b = new VoxelBuilder();
  /** Per box (the builder's order): the toggle it belongs to (0: always there). */
  readonly tags: number[] = [];
  /** Toggle for the boxes written now. */
  tag = 0;
  /** The code that asked (one trace per builder function: `traceSource()`). */
  src: SourceTrace | undefined = undefined;
  seed = 0;
  private ox = 0;
  private oy = 0;
  private oz = 0;
  private yaw = 0;
  private c = 1;
  private s = 0;

  /** Work in a frame: origin (map m, `y` the ground), heading `yaw` (0: the frame's +z is the map's +z, turning to +x). */
  at(x: number, y: number, z: number, yaw: number, seed = 0): this {
    this.ox = x;
    this.oy = y;
    this.oz = z;
    this.yaw = yaw;
    this.c = Math.cos(yaw);
    this.s = Math.sin(yaw);
    this.seed = seed;
    return this;
  }

  /** Frame → map. */
  wx(x: number, z: number): number {
    return this.ox + x * this.c + z * this.s;
  }
  wz(x: number, z: number): number {
    return this.oz - x * this.s + z * this.c;
  }
  get ground(): number {
    return this.oy;
  }

  /**
   * A box by its middle and size in the frame (m; y up from the frame's
   * ground), turned `rz` about its own length, tilted `rx` about the frame's x,
   * then turned `ry` about y.
   */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, mat: VoxelMaterialKey, shade = 1, rx = 0, ry = 0, rz = 0): void {
    const X = this.wx(x, z);
    const Z = this.wz(x, z);
    const turn = this.yaw + ry;
    if (rx === 0 && rz === 0) this.b.box(X, this.oy + y, Z, sx, sy, sz, color, mat, { src: this.src, shade, ry: turn });
    else {
      _q.setFromAxisAngle(_up, turn).multiply(_qx.setFromAxisAngle(_xa, rx)).multiply(_qz.setFromAxisAngle(_za, rz));
      _e.setFromQuaternion(_q, 'XYZ');
      this.b.box(X, this.oy + y, Z, sx, sy, sz, color, mat, { src: this.src, shade, rx: _e.x, ry: _e.y, rz: _e.z });
    }
    this.tags.push(this.tag);
  }

  /** A box by its corners (in the frame, not turned). */
  span(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, mat: VoxelMaterialKey, shade = 1): void {
    this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), color, mat, shade);
  }

  /** A rod (or a slab: `sx` across, `sy` thick) from a to b in the frame. */
  rod(ax: number, ay: number, az: number, bx: number, by: number, bz: number, sx: number, sy: number, color: number, mat: VoxelMaterialKey, shade = 1): void {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-4) return;
    const h = Math.sqrt(dx * dx + dz * dz);
    const ry = h < 1e-5 ? 0 : Math.atan2(dx, dz);
    const rx = -Math.atan2(dy, h);
    this.box((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, sx, sy, len, color, mat, shade, rx, ry);
  }

  /** A seeded 0‥1 value for this frame's build. */
  r(i: number, j = 0, k = 0): number {
    return hash3(Math.round(i * 7.3) + 11, Math.round(j * 5.1) + 3, Math.round(k * 3.7) + 5, this.seed);
  }
}

// ── Structure ────────────────────────────────────────────────────────────────

/** A bamboo pole standing from the ground to `h` (with a node ring every metre or so). */
export function bambooPole(mk: MkBuild, x: number, z: number, h: number, w = 0.11): void {
  const c = tone(BAMBOO, mk.r(x, z, 1));
  mk.box(x, h / 2, z, w, h, w, c, 'mapBark', 0.95 + mk.r(z, x, 2) * 0.1);
  for (let y = 0.9 + mk.r(x, 3) * 0.3; y < h - 0.3; y += 1.05) mk.box(x, y, z, w + 0.03, 0.05, w + 0.03, tone(BAMBOO_OLD, mk.r(y, x, 4)), 'mapBark');
}

/**
 * A tarp stretched over four bamboo poles: `w` across, `d` deep (the frame's
 * middle), its front edge `hf` m up, its back `hb`, sagging a little in the
 * middle; blue, orange or striped. `rolled` (the stall closed): the tarp
 * rolled up along the back edge instead (the toggles show one or the other;
 * `roll` false: a tarp that stays up, never rolled).
 */
export function tarp(mk: MkBuild, w: number, d: number, hf: number, hb: number, tones: Tones, open: number, closed: number, striped = false, roll = true): void {
  const x0 = -w / 2 - 0.15;
  const x1 = w / 2 + 0.15;
  const zf = d / 2 + 0.35;
  const zb = -d / 2 - 0.1;
  const was = mk.tag;
  for (const [px, pz, h] of [
    [x0, zf, hf],
    [x1, zf, hf],
    [x0, zb, hb],
    [x1, zb, hb],
  ])
    bambooPole(mk, px, pz, h + 0.12);
  // Cross poles along the front and back edges (tied on).
  mk.rod(x0 - 0.1, hf, zf, x1 + 0.1, hf, zf, 0.08, 0.08, tone(BAMBOO, mk.r(1, 9)), 'mapBark');
  mk.rod(x0 - 0.1, hb, zb, x1 + 0.1, hb, zb, 0.08, 0.08, tone(BAMBOO, mk.r(2, 9)), 'mapBark');
  // Spread: two slabs, front and back halves, meeting at a sag in the middle.
  mk.tag = open;
  const zm = (zf + zb) / 2;
  const hm = (hf + hb) / 2 - 0.16;
  const strips = striped ? 7 : 1;
  for (let k = 0; k < strips; k++) {
    const a = x0 + ((x1 - x0) * k) / strips;
    const b = x0 + ((x1 - x0) * (k + 1)) / strips;
    const cx = (a + b) / 2;
    const col = striped ? tones[k % tones.length] : tone(tones, mk.r(k, 5));
    const sw = b - a + (striped ? 0.001 : 0);
    const fade = striped ? 1 : 0.96 + mk.r(k, 6) * 0.08;
    mk.rod(cx, hf + 0.06, zf + 0.12, cx, hm + 0.06, zm, sw, 0.04, col, 'petal', fade);
    mk.rod(cx, hm + 0.06, zm, cx, hb + 0.06, zb - 0.1, sw, 0.04, col, 'petal', fade * 0.97);
  }
  // A hem of a lighter shade along the front (the sun-faded fold).
  mk.box(0, hf - 0.02, zf + 0.14, x1 - x0, 0.1, 0.04, tone(tones, 0.99), 'petal', 1.1);
  // Rolled: a fat roll along the back edge.
  mk.tag = closed;
  if (roll) mk.rod(x0, hb + 0.14, zb, x1, hb + 0.14, zb, 0.24, 0.22, tone(tones, 0), 'petal', 0.9);
  mk.tag = was;
}

/**
 * A market parasol on its pole at (x, z): an eight-sided canopy of
 * alternating colours `r` m across its middle, `h` m up, with a short
 * scalloped skirt; folded (the stall closed): a tall bundle round the pole.
 */
export function parasol(mk: MkBuild, x: number, z: number, h: number, r: number, cols: readonly number[], open: number, closed: number, tilt = 0): void {
  const was = mk.tag;
  // (`closed` 0: it goes home with the seller, pole and all)
  const keeps = closed !== 0;
  mk.tag = keeps ? was : open;
  mk.box(x, (h + 0.35) / 2, z, 0.07, h + 0.35, 0.07, 0xd8d0c0, keeps ? 'mapBark' : 'petal');
  // A weighted foot: a concrete-filled bucket (or a tyre).
  if (keeps) mk.box(x, 0.13, z, 0.34, 0.26, 0.34, 0x5a5a58, 'mapBark');
  mk.tag = open;
  const drop = r * 0.36;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + tilt;
    // (out along the panel's middle: the way a yaw of `a` faces)
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const col = cols[k % cols.length];
    const shade = 0.96 + mk.r(k, x) * 0.06;
    // (the inner and outer parts of the panel: a triangle in two slabs)
    mk.rod(x, h + 0.36, z, x + dx * r * 0.52, h + 0.36 - drop * 0.52, z + dz * r * 0.52, r * 0.46, 0.035, col, 'petal', shade);
    mk.rod(x + dx * r * 0.46, h + 0.36 - drop * 0.46, z + dz * r * 0.46, x + dx * r, h + 0.36 - drop, z + dz * r, r * 0.8, 0.035, col, 'petal', shade);
    // The skirt: a flap hanging at the rim (across the panel: turned `a`).
    mk.box(x + dx * r, h + 0.36 - drop - 0.1, z + dz * r, r * 0.78, 0.2, 0.03, col, 'petal', shade * 0.94, 0, a);
  }
  mk.box(x, h + 0.42, z, 0.1, 0.14, 0.1, 0xd8d0c0, 'petal');
  if (keeps) {
    mk.tag = closed;
    mk.box(x, h - 0.45, z, 0.26, 1.3, 0.26, cols[0], 'petal', 0.92);
    mk.box(x, h - 0.3, z, 0.3, 0.06, 0.3, cols[1], 'petal', 0.9);
  }
  mk.tag = was;
}

/** A wooden table (top at `h`), `w` across, `d` deep, its middle at (x, z); a shelf under it. */
export function table(mk: MkBuild, x: number, z: number, w: number, d: number, h: number, shelf = true): void {
  const leg = 0.09;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    mk.box(x + sx * (w / 2 - 0.1), (h - 0.06) / 2, z + sz * (d / 2 - 0.1), leg, h - 0.06, leg, tone(WOOD, mk.r(sx, sz, x)), 'mapBark', 0.85);
  // The top: boards across.
  const n = Math.max(2, Math.round(d / 0.32));
  for (let k = 0; k < n; k++) {
    const z0 = z - d / 2 + (d * k) / n;
    mk.span(x - w / 2, h - 0.06, z0 + 0.005, x + w / 2, h, z0 + d / n - 0.005, tone(WOOD, mk.r(k, x, z)), 'mapBark', 0.94 + mk.r(z, k) * 0.1);
  }
  if (shelf) mk.span(x - w / 2 + 0.12, 0.22, z - d / 2 + 0.12, x + w / 2 - 0.12, 0.26, z + d / 2 - 0.12, tone(WOOD, mk.r(x, 7)), 'mapBark', 0.8);
}

/** A raised bamboo platform (the seller sits on it among the goods): `w` × `d`, its slats `h` up. */
export function platform(mk: MkBuild, x: number, z: number, w: number, d: number, h: number): void {
  for (const sx of [-1, 0, 1])
    for (const sz of [-1, 1]) mk.box(x + sx * (w / 2 - 0.12), (h - 0.08) / 2, z + sz * (d / 2 - 0.12), 0.12, h - 0.08, 0.12, tone(BAMBOO_OLD, mk.r(sx, sz, 3)), 'mapBark', 0.9);
  mk.span(x - w / 2, h - 0.16, z - d / 2, x + w / 2, h - 0.08, z + d / 2, tone(BAMBOO_OLD, mk.r(x, 4)), 'mapBark', 0.8);
  // Slats along its width, a finger apart.
  const n = Math.round(d / 0.2);
  for (let k = 0; k < n; k++) {
    const z0 = z - d / 2 + (d * k) / n;
    mk.span(x - w / 2 - 0.04, h - 0.08, z0 + 0.015, x + w / 2 + 0.04, h, z0 + d / n - 0.015, tone(BAMBOO, mk.r(k, z, 5)), 'mapBark', 0.95 + mk.r(k, 6) * 0.08);
  }
}

/** A low plastic stool (the noodle stall's, the sellers'). */
export function stool(mk: MkBuild, x: number, z: number, color: number, h = 0.36): void {
  mk.box(x, h - 0.03, z, 0.36, 0.06, 0.36, color, 'mapBark', 1.05);
  mk.box(x, (h - 0.06) / 2, z, 0.3, h - 0.06, 0.3, color, 'mapBark', 0.8);
}

/** A wheel (a moto's, a cart's) standing along the frame's z at (x, y, z): three boxes turned 30° apart, nearly round from the side. */
export function wheel(mk: MkBuild, x: number, y: number, z: number, r: number, w: number, color: number, mat: 'metal' | 'petal' | 'mapBark'): void {
  for (let k = 0; k < 3; k++) mk.box(x, y, z, w, r * 1.84, r * 1.84, color, mat, 1 - k * 0.03, (k * Math.PI) / 6);
  mk.box(x, y, z, w + 0.04, r * 0.5, r * 0.5, 0x8a8a86, mat, 1.1);
}

/** A mat laid on the ground (woven: two tones in bands). */
export function groundMat(mk: MkBuild, x: number, z: number, w: number, d: number, a: number, b: number): void {
  const n = Math.max(2, Math.round(d / 0.35));
  for (let k = 0; k < n; k++) {
    const z0 = z - d / 2 + (d * k) / n;
    mk.span(x - w / 2, 0, z0, x + w / 2, 0.03, z0 + d / n, k % 2 ? a : b, 'petal', 0.96 + mk.r(k, x) * 0.06);
  }
}
