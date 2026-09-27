import { Euler, Quaternion } from 'three';
import type { SourceTrace } from '../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../voxel/materials';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { Frame } from '../landmarks/_prasatKit';
import { Palms, type PalmSet } from '../veg/palms';
import { GLOW } from './_lights';
import type { RoofKind, WallKind } from './_spots';

/**
 * Plumbing for the village's builds: colours, plank walls, stepped roofs and
 * small props (jars, pots, laundry, a dog, hens, boats…), all as free
 * boxes in a local frame (metres; y is the world height), turned into place
 * with `Frame.place`. Wood is `mapBark` (solid to walk on; the follow camera
 * sees through it near him, like the tree trunks), cloth and plants are
 * soft families (`petal`, `mapLeaf`: he walks through them). The coconut
 * palms (`palm`) are veg/palms.ts's, in draws of their own (`villagePalms`).
 */

export type Tones = readonly number[];

export const tone = (list: Tones, r: number): number => list[Math.min(list.length - 1, Math.floor(r * list.length))];

// ── Colours (sRGB) ───────────────────────────────────────────────────────────

/** Posts and beams: dark, wet-stained hardwood. */
export const POST: Tones = [0x4e3d30, 0x5a4636, 0x46372b, 0x55432f];
/** Deck and floor planks. */
export const DECK: Tones = [0x8a6f55, 0x7d644c, 0x947a5e, 0x735c46, 0x9a8264];
export const WALLS: Record<WallKind, Tones> = {
  wood: [0x7a6552, 0x6d5948, 0x86705b, 0x625041, 0x8f7862],
  grey: [0x8d867a, 0x7f786d, 0x989083, 0x736d63, 0x857c6d],
  blue: [0x6f9cb3, 0x79a6bb, 0x6592aa, 0x7ea9bb],
  green: [0x7fa58a, 0x89ae92, 0x739a7f, 0x94b69a],
  ochre: [0xc49856, 0xba8e4e, 0xcda461, 0xb3884a],
};
/** Door panels and shutters, per wall colour (a darker or contrasting paint). */
export const TRIM: Record<WallKind, Tones> = {
  wood: [0x5a4232, 0x644a38],
  grey: [0x3f6f8c, 0x46789a],
  blue: [0xe4ddcc, 0xd8d0bd],
  green: [0xe7dfc9, 0xd6cdb4],
  ochre: [0x6a3f2a, 0x74482f],
};
export const ROOFS: Record<RoofKind, Tones> = {
  // Dried palm thatch, silver-brown.
  thatch: [0x8f7d62, 0x857358, 0x9a876a, 0x7a6a52, 0x928066],
  // Galvanised tin, new and dull.
  tin: [0xa1a4a2, 0x93979a, 0xacafac, 0x878c8c],
  // Old tin, rusting in patches.
  rust: [0x9a5a32, 0x8a4f2c, 0xa8683a, 0x7c4a2a, 0x9d7458, 0x8f8a84],
  // Painted blue tin.
  blue: [0x4f7fa8, 0x5a8ab2, 0x46739a, 0x6390b4],
};
/** The ridge along the top of a roof. */
export const RIDGE: Record<RoofKind, number> = { thatch: 0x5f5040, tin: 0x7b7f80, rust: 0x6e3f24, blue: 0x3b6286 };
/** Clay water jars, flower pots. */
export const JAR: Tones = [0x6b3f26, 0x5e3620, 0x77472b];
export const POT: Tones = [0xb8633a, 0xa9582f, 0xc46f44];
export const LEAF: Tones = [0x3f7a2e, 0x4a8a34, 0x356a28, 0x58963c];
export const BLOOM: Tones = [0xe0508a, 0xf07aa8, 0xd84070, 0xf2c14a, 0xf09040];
/** Cloth on the lines: kramas, sarongs, shirts. */
export const CLOTH: Tones = [0xc8342c, 0x2f5ea8, 0xf0e6d0, 0xe0a030, 0x8a3a8c, 0x3a8a6a, 0xd86a8a, 0x2d2d33];
export const BAMBOO: Tones = [0xc8b27a, 0xbba36c, 0xd4bf88, 0xae9660];
export const HULL: Tones = [0x6e4a2e, 0x7a5434, 0x634229];

// ── Local builds ─────────────────────────────────────────────────────────────

const _q = new Quaternion();
const _e = new Euler();
const _e2 = new Euler();

/**
 * A local build: boxes in a frame's local metres (y = world height).
 * `theta` is the heading its frame will be placed with (`Frame.place`, which
 * adds it to each box's turn about y): boxes tilted out of the level
 * (`tilt`) need it; the rest do not.
 */
export class Local {
  constructor(
    readonly b: VoxelBuilder,
    readonly src: SourceTrace | undefined,
    readonly seed: number,
    readonly theta = 0,
  ) {}

  /**
   * A box turned `ax` about the frame's own x axis (its +z end down for
   * ax > 0): barge boards, the rays of a gable's sun. Right only if the
   * frame is placed with this build's `theta`.
   */
  tilt(x: number, y: number, z: number, sx: number, sy: number, sz: number, ax: number, color: number, mat: VoxelMaterialKey, shade = 1): void {
    // (on the map it turns by the frame's heading, then tilts: Ry(θ)·Rx(ax); Frame.place adds θ to ry)
    _q.setFromEuler(_e.set(ax, this.theta, 0, 'YXZ'));
    _e2.setFromQuaternion(_q, 'XYZ');
    this.b.box(x, y, z, sx, sy, sz, color, mat, { src: this.src, shade, rx: _e2.x, ry: _e2.y - this.theta, rz: _e2.z });
  }

  /** A board in the plane x = `x` from (z0, y0) to (z1, y1), `w` wide below that line (or across it, `centred`), `t` thick. */
  board(x: number, z0: number, y0: number, z1: number, y1: number, w: number, t: number, color: number, mat: VoxelMaterialKey = 'mapBark', shade = 1, centred = false): void {
    const dz = z1 - z0;
    const dy = y1 - y0;
    const len = Math.sqrt(dz * dz + dy * dy);
    // (moved down off the line by half its width, square to it)
    const k = centred ? 0 : w / 2 / len;
    const sgn = dz >= 0 ? 1 : -1;
    this.tilt(x, (y0 + y1) / 2 - Math.abs(dz) * k, (z0 + z1) / 2 + sgn * dy * k, t, w, len, -Math.atan2(dy, dz), color, mat, shade);
  }

  /** Box by min/max corners. */
  span(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, mat: VoxelMaterialKey, shade = 1): void {
    this.b.span(x0, y0, z0, x1, y1, z1, color, mat, { src: this.src, shade });
  }

  /** Box by centre and size. */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, mat: VoxelMaterialKey, shade = 1): void {
    this.b.box(x, y, z, sx, sy, sz, color, mat, { src: this.src, shade });
  }

  /** A seeded 0‥1 value for this build. */
  r(i: number, j = 0, k = 0): number {
    return hash3(Math.round(i * 7.3), Math.round(j * 5.1), Math.round(k * 3.7), this.seed);
  }
}

/** An opening in a wall: along the wall from `a0` to `a1`, from `y0` to `y1` (m). */
export interface Hole {
  a0: number;
  a1: number;
  y0: number;
  y1: number;
}

/**
 * A plank wall: along x (at z = `at`) or along z (at x = `at`), from `a` to
 * `b`, `t` thick, in rows of `row` m from `y0` to `y1`, leaving the holes
 * open. Each row is cut into planks 1.2–3 m long, each its own tone.
 */
export function planks(L: Local, axis: 'x' | 'z', at: number, t: number, a: number, b: number, y0: number, y1: number, holes: readonly Hole[], tones: Tones, mat: VoxelMaterialKey = 'mapBark', row = 0.45): void {
  for (let y = y0, n = 0; y < y1 - 1e-3; y += row, n++) {
    const top = Math.min(y1, y + row);
    let runs: [number, number][] = [[a, b]];
    for (const h of holes) {
      if (h.y0 >= top - 1e-3 || h.y1 <= y + 1e-3) continue;
      const next: [number, number][] = [];
      for (const [p, q] of runs) {
        if (h.a1 <= p || h.a0 >= q) next.push([p, q]);
        else {
          if (h.a0 > p) next.push([p, h.a0]);
          if (h.a1 < q) next.push([h.a1, q]);
        }
      }
      runs = next;
    }
    for (const [p, q] of runs) plankRun(L, axis, at, t, p, q, y, top, tones, mat, n);
  }
}

/** One row of planks from `p` to `q` (see `planks`). */
export function plankRun(L: Local, axis: 'x' | 'z', at: number, t: number, p: number, q: number, y0: number, y1: number, tones: Tones, mat: VoxelMaterialKey = 'mapBark', n = 0): void {
  let pos = p;
  let i = 0;
  while (q - pos > 0.05) {
    let end = Math.min(q, pos + 1.2 + L.r(at + n, i, 1) * 1.8);
    if (q - end < 0.5) end = q;
    const c = tone(tones, L.r(pos + at, y0, 2));
    const shade = 0.93 + L.r(pos, y0 + at, 3) * 0.12;
    if (axis === 'x') L.span(pos, y0, at - t / 2, end, y1, at + t / 2, c, mat, shade);
    else L.span(at - t / 2, y0, pos, at + t / 2, y1, end, c, mat, shade);
    pos = end;
    i++;
  }
}

/** A stepped gable roof, ridge along x. */
export interface Roof {
  /** Extent with the overhangs (m). */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Bottom of the outermost row (m). */
  eave: number;
  /** Each row steps in `run` and up `rise` (m). */
  run: number;
  rise: number;
}

/** Row index of a roof over the depth `z` (0 at the eaves). */
export const roofRow = (r: Roof, z: number): number => Math.max(0, Math.floor(Math.min(z - r.z0, r.z1 - z) / r.run));
/** Bottom of the roof over `z` (m). */
export const roofUnder = (r: Roof, z: number): number => r.eave + roofRow(r, z) * r.rise;
/** Top of the ridge (m). */
export const roofTop = (r: Roof): number => r.eave + (Math.ceil((r.z1 - r.z0) / 2 / r.run) + 0.2) * r.rise;

/**
 * Build a stepped gable roof: rows of `run` m stepping up `rise` m from both
 * eaves to the ridge, each row cut along x into sheets or thatch bundles of
 * their own tone (every few rows a little darker), a ridge cap on top.
 * `mat`: `hat` for thatch (straw), `metal` for tin.
 */
export function gableRoof(L: Local, r: Roof, tones: Tones, ridge: number, mat: VoxelMaterialKey, piece = 1.4): void {
  const mid = (r.z0 + r.z1) / 2;
  const half = (r.z1 - r.z0) / 2;
  const rows = Math.ceil(half / r.run);
  for (let k = 0; k < rows; k++) {
    const y0 = r.eave + k * r.rise;
    const y1 = y0 + r.rise + 0.06;
    const inA = r.z0 + k * r.run;
    const inB = r.z1 - k * r.run;
    const last = k === rows - 1;
    const strips: [number, number][] = last ? [[inA, inB]] : [
      [inA, inA + r.run],
      [inB - r.run, inB],
    ];
    const dark = k % 3 === 2 ? 0.9 : 1;
    for (const [za, zb] of strips) {
      let x = r.x0;
      let i = 0;
      while (r.x1 - x > 0.05) {
        let e = Math.min(r.x1, x + piece * (0.6 + L.r(k, i, za) * 0.9));
        if (r.x1 - e < 0.4) e = r.x1;
        L.span(x, y0, za, e, y1, zb, tone(tones, L.r(x, k, za + 1)), mat, dark * (0.94 + L.r(i, k, 5) * 0.1));
        x = e;
        i++;
      }
    }
    if (last) L.span(r.x0 - 0.05, y1 - 0.02, mid - 0.25, r.x1 + 0.05, y1 + 0.2, mid + 0.25, ridge, mat, 0.95);
  }
}

/**
 * Fill the triangle of a gable end (at x = `at`, `t` thick) under a roof,
 * from `from` (m) up to the ridge, between the depths `za` and `zb`.
 */
export function gableEnd(L: Local, r: Roof, at: number, t: number, za: number, zb: number, from: number, tones: Tones): void {
  const half = (r.z1 - r.z0) / 2;
  const rows = Math.ceil(half / r.run);
  for (let k = 0; k < rows; k++) {
    const y0 = r.eave + k * r.rise;
    const y1 = y0 + r.rise;
    if (y1 <= from + 1e-3) continue;
    const a = Math.max(za, r.z0 + (k + 1) * r.run);
    const b = Math.min(zb, r.z1 - (k + 1) * r.run);
    if (b - a < 0.2) continue;
    plankRun(L, 'z', at, t, a, b, Math.max(from, y0), y1, tones, 'mapBark', k);
  }
}

// ── Props ───────────────────────────────────────────────────────────────────

/** A big glazed water jar (peang) standing at (x, y, z). */
export function jar(L: Local, x: number, y: number, z: number, s = 1): void {
  const c = tone(JAR, L.r(x, z, 11));
  L.box(x, y + 0.12 * s, z, 0.5 * s, 0.24 * s, 0.5 * s, c, 'mapStone', 0.9);
  L.box(x, y + 0.45 * s, z, 0.7 * s, 0.45 * s, 0.7 * s, c, 'mapStone');
  L.box(x, y + 0.75 * s, z, 0.46 * s, 0.16 * s, 0.46 * s, c, 'mapStone', 1.05);
}

/** A clay pot with a leafy plant, sometimes in flower. */
export function potPlant(L: Local, x: number, y: number, z: number, big = false): void {
  const s = big ? 1.4 : 1;
  L.box(x, y + 0.17 * s, z, 0.4 * s, 0.34 * s, 0.4 * s, tone(POT, L.r(x, z, 12)), 'mapStone');
  L.box(x, y + 0.55 * s, z, 0.6 * s, 0.45 * s, 0.6 * s, tone(LEAF, L.r(z, x, 13)), 'mapLeaf');
  if (L.r(x, z, 14) < 0.6) L.box(x + 0.1, y + 0.8 * s, z - 0.08, 0.3 * s, 0.2 * s, 0.3 * s, tone(BLOOM, L.r(x, z, 15)), 'petal');
}

/** A line of washing from (x0, z0) to (x1, z1) at height y: a cord and cloths hung on it. */
export function laundry(L: Local, x0: number, z0: number, x1: number, z1: number, y: number): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(2, Math.floor(len / 0.8));
  const along = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  L.span(Math.min(x0, x1), y, Math.min(z0, z1), Math.max(x0, x1) + (along ? 0 : 0.03), y + 0.03, Math.max(z0, z1) + (along ? 0.03 : 0), 0xd8d0c0, 'petal');
  for (let i = 0; i < n; i++) {
    if (L.r(i, x0, 16) < 0.2) continue;
    const t = (i + 0.5) / n;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    const h = 0.5 + L.r(i, z0, 17) * 0.5;
    const wd = 0.45 + L.r(i, 1, 18) * 0.25;
    L.box(x, y - h / 2, z, along ? wd : 0.04, h, along ? 0.04 : wd, tone(CLOTH, L.r(i, x0 + z0, 19)), 'petal');
  }
}

/** A dog asleep, curled on its side, at (x, y, z), its head toward +x. */
export function dog(L: Local, x: number, y: number, z: number): void {
  const fur = 0xc49a62;
  const dark = 0x9a7446;
  L.box(x, y + 0.16, z, 0.62, 0.3, 0.32, fur, 'petal');
  L.box(x + 0.4, y + 0.14, z + 0.06, 0.22, 0.2, 0.22, fur, 'petal');
  L.box(x + 0.54, y + 0.1, z + 0.08, 0.12, 0.1, 0.12, dark, 'petal');
  L.box(x + 0.38, y + 0.27, z - 0.02, 0.07, 0.08, 0.07, dark, 'petal');
  L.box(x + 0.38, y + 0.27, z + 0.13, 0.07, 0.08, 0.07, dark, 'petal');
  L.box(x + 0.2, y + 0.05, z + 0.22, 0.34, 0.08, 0.1, fur, 'petal', 0.92);
  L.box(x - 0.36, y + 0.06, z + 0.16, 0.2, 0.08, 0.24, fur, 'petal', 0.9);
}

/** A hen (or the rooster, taller, red and green) pecking or standing at (x, y, z), facing +x. */
export function hen(L: Local, x: number, y: number, z: number, rooster = false, peck = false): void {
  const body = rooster ? 0x8a3a1c : tone([0xc8894a, 0xe6dccb, 0x6e4a30], L.r(x, z, 20));
  const h = rooster ? 1.15 : 1;
  L.box(x, y + 0.2 * h, z, 0.3, 0.2 * h, 0.2, body, 'petal');
  L.box(x - 0.17, y + 0.3 * h, z, 0.1, 0.18 * h, 0.14, rooster ? 0x1f4a3a : body, 'petal', 0.9);
  const hx = peck ? x + 0.2 : x + 0.15;
  const hy = peck ? y + 0.14 : y + 0.36 * h;
  L.box(hx, hy, z, 0.12, 0.13, 0.11, body, 'petal');
  L.box(hx + 0.01, hy + 0.09, z, 0.07, 0.06, 0.04, 0xc8302a, 'petal');
  L.box(hx + 0.08, hy - 0.01, z, 0.05, 0.03, 0.03, 0xe0a030, 'petal');
  L.box(x, y + 0.05, z, 0.04, 0.1, 0.1, 0xd09a40, 'petal');
}

/** A narrow wooden boat (a dugout-like skiff) on the water at level y, along x, length `len`. */
export function skiff(L: Local, x: number, y: number, z: number, len = 4.2, seed = 0): void {
  const c = tone(HULL, L.r(seed, 1, 21));
  const h2 = len / 2;
  L.span(x - h2 + 0.5, y - 0.15, z - 0.42, x + h2 - 0.5, y + 0.3, z + 0.42, c, 'mapBark');
  L.span(x + h2 - 0.5, y - 0.05, z - 0.25, x + h2, y + 0.38, z + 0.25, c, 'mapBark');
  L.span(x - h2, y - 0.05, z - 0.25, x - h2 + 0.5, y + 0.34, z + 0.25, c, 'mapBark');
  // The dark inside, a thwart, a paddle lying in it.
  L.span(x - h2 + 0.7, y + 0.29, z - 0.3, x + h2 - 0.7, y + 0.31, z + 0.3, 0x3a2a1e, 'mapBark');
  L.span(x - 0.15, y + 0.3, z - 0.4, x + 0.15, y + 0.36, z + 0.4, tone(DECK, L.r(seed, 2, 22)), 'mapBark');
  L.span(x + 0.4, y + 0.32, z - 0.08, x + 1.7, y + 0.36, z + 0.08, 0xa07a4e, 'mapBark');
}

/** The coconut palms `palm` plants, built once by the village part (`villagePalms`). */
let coconuts = new Palms();

/**
 * A coconut palm from (x, y, z), `h` m to its crown, its trunk leaning out
 * by `lean` (x, z) per 5 m of height and curving back up: the real one of
 * veg/palms.ts (feather fronds arching over, coconuts), drawn with the
 * village's other palms in their own instanced draws (`villagePalms`).
 */
export function palm(L: Local, x: number, y: number, z: number, h: number, lean: [number, number]): void {
  coconuts.add({ kind: 'coconut', x, y, z, h, seed: Math.floor(L.r(x, z, 23) * 1e6), lean: [lean[0] * h * 0.2, lean[1] * h * 0.2] });
}

/** The palms planted so far, built (the village part, once, after the shore): add its `object`, call its `update`. */
export function villagePalms(): PalmSet {
  const set = coconuts.build({ name: 'village:palms' });
  coconuts = new Palms();
  return set;
}

/** A banana plant: a short green stem and big leaves spreading up and out. */
export function banana(L: Local, x: number, y: number, z: number): void {
  L.box(x, y + 0.8, z, 0.35, 1.6, 0.35, 0x6d8a3a, 'mapLeaf');
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + L.r(k, z, 26);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    L.box(x + ca * 0.55, y + 1.7, z + sa * 0.55, 0.9, 0.2, 0.9, tone([0x5a9a34, 0x6aa83c, 0x4f8a2e], L.r(k, x, 27)), 'mapLeaf');
    L.box(x + ca * 1.15, y + 1.55, z + sa * 1.15, 0.7, 0.18, 0.7, tone([0x5a9a34, 0x78a840, 0x8a8a3a], L.r(x, k, 28)), 'mapLeaf');
  }
  L.box(x, y + 2.05, z, 0.4, 0.5, 0.4, 0x5f9a34, 'mapLeaf');
}

/** A broad shade tree (a tamarind): a short trunk forking into limbs, a wide, low, feathery crown of dark leaves. */
export function shadeTree(L: Local, x: number, y: number, z: number, seed: number): void {
  const bark = [0x5a4636, 0x4e3c2e, 0x645040];
  for (let j = 0; j < 4; j++) L.box(x, y + j + 0.5, z, 0.9, 1, 0.9, tone(bark, L.r(j, seed, 30)), 'mapBark');
  for (const [dx, dz] of [
    [1, 0.4],
    [-0.8, 0.7],
    [0.2, -1],
  ]) {
    L.box(x + dx * 0.9, y + 4.3, z + dz * 0.9, 0.7, 1, 0.7, tone(bark, L.r(dx, dz, 31)), 'mapBark');
    L.box(x + dx * 1.7, y + 5.1, z + dz * 1.7, 0.6, 0.8, 0.6, tone(bark, L.r(dz, dx, 32)), 'mapBark');
  }
  const R = 4.6;
  const H = 2.4;
  const cy = y + 6.2;
  for (let i = -5; i <= 5; i++)
    for (let j = -3; j <= 3; j++)
      for (let k = -5; k <= 5; k++) {
        const d = Math.hypot(i / R, j / H, k / R) + (L.r(i, j + seed, k) - 0.5) * 0.35;
        if (d > 1 || (d < 0.6 && Math.abs(j) < 2)) continue;
        const shade = 0.8 + 0.3 * ((j + 3) / 6);
        L.box(x + i, cy + j * 0.9, z + k, 1, 0.9, 1, tone([0x3a5e26, 0x456b2c, 0x33541f, 0x4e7432, 0x2e4d1c], L.r(k, i, j + seed)), 'mapLeaf', shade);
      }
}

/** A patch of lotus in the shallows round (x, z) on water at `level`: floating pads, a few leaves held up on stems, pink flowers and buds. */
export function lotus(L: Local, x: number, level: number, z: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = L.r(i, 1, 40) * Math.PI * 2;
    const d = Math.sqrt(L.r(i, 2, 41)) * (1 + n * 0.18);
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    const s = 0.55 + L.r(i, 3, 42) * 0.35;
    const k = L.r(i, 4, 43);
    if (k < 0.6) L.box(px, level + 0.04, pz, s, 0.06, s, tone(LEAF, L.r(i, 5, 44)), 'mapLeaf');
    else {
      const h = 0.4 + L.r(i, 6, 45) * 0.6;
      L.box(px, level + h / 2, pz, 0.05, h, 0.05, 0x5a7a3a, 'mapLeaf');
      if (k < 0.82) L.box(px, level + h, pz, s * 0.9, 0.08, s * 0.9, tone(LEAF, L.r(i, 7, 46)), 'mapLeaf', 1.05);
      else {
        L.box(px, level + h + 0.1, pz, 0.26, 0.22, 0.26, tone([0xf08ab0, 0xe8729c, 0xf6b0c8], L.r(i, 8, 47)), 'petal');
        L.box(px, level + h + 0.26, pz, 0.14, 0.12, 0.14, 0xf8c8d8, 'petal');
      }
    }
  }
}

/**
 * A Khmer palm-leaf hat hung on a wall (the wall's face at `z`, the hat
 * standing out toward +z): a wide flat brim, a flat-topped round crown with
 * straight sides, natural straw, a red binding round the brim's edge and a
 * red band round the crown. (Not the pointed hat: that one is Vietnamese.)
 */
export function khmerHat(L: Local, x: number, y: number, z: number): void {
  const straw = 0xd8c08a;
  L.box(x, y, z + 0.1, 0.62, 0.62, 0.04, 0xb8322a, 'mapBark');
  L.box(x, y, z + 0.12, 0.56, 0.56, 0.04, straw, 'mapBark');
  L.box(x, y, z + 0.2, 0.3, 0.3, 0.14, 0xb8322a, 'mapBark');
  L.box(x, y, z + 0.26, 0.28, 0.28, 0.12, straw, 'mapBark');
}

/** A bougainvillea bush: a low mound of leaves thick with magenta (or orange) bracts. */
export function bougainvillea(L: Local, x: number, y: number, z: number, seed: number): void {
  const bloom = L.r(seed, 1, 48) < 0.75 ? [0xd8307a, 0xe84a90, 0xc82870] : [0xf08a3a, 0xe87a30, 0xf2a050];
  for (let i = -1; i <= 1; i++)
    for (let k = -1; k <= 1; k++)
      for (let j = 0; j < 2; j++) {
        if (j === 1 && Math.abs(i) + Math.abs(k) > 1) continue;
        if (L.r(i + seed, j, k) < 0.15) continue;
        const flower = L.r(k, i + seed, j + 3) < 0.45;
        L.box(x + i * 0.6, y + 0.3 + j * 0.55, z + k * 0.6, 0.62, 0.58, 0.62, flower ? tone(bloom, L.r(i, k, seed + j)) : tone(LEAF, L.r(i, j, k + seed)), flower ? 'petal' : 'mapLeaf');
      }
}

/** A woven mat on a floor with a teapot and two cups: someone sits here in the evening. */
export function mat(L: Local, x: number, y: number, z: number): void {
  L.span(x - 0.6, y, z - 0.9, x + 0.6, y + 0.03, z + 0.9, 0xb8423a, 'petal');
  for (const d of [-0.5, 0, 0.5]) L.span(x - 0.62, y + 0.01, z + d - 0.06, x + 0.62, y + 0.035, z + d + 0.06, 0x3a7a5a, 'petal');
  L.box(x, y + 0.12, z, 0.2, 0.18, 0.2, 0x5a4a3a, 'metal');
  L.box(x + 0.25, y + 0.06, z + 0.15, 0.08, 0.08, 0.08, 0xe8e0d0, 'petal');
  L.box(x - 0.2, y + 0.06, z + 0.25, 0.08, 0.08, 0.08, 0xe8e0d0, 'petal');
}

/** A fishing net hung out to dry over a rail (along x from `x0` to `x1` at height `y`, hanging to the −z side). */
export function drapedNet(L: Local, x0: number, x1: number, y: number, z: number): void {
  for (let x = x0, i = 0; x < x1 - 0.1; x += 0.5, i++) {
    const h = 0.8 + L.r(i, x0, 49) * 0.5;
    L.span(x, y - h, z - 0.06, Math.min(x1, x + 0.5), y + 0.04, z - 0.02, i % 3 ? 0x3e5a4a : 0x4a6a54, 'petal', 0.9);
  }
  for (let k = 0; k < 4; k++) L.box(x0 + (x1 - x0) * ((k + 0.5) / 4), y - 0.9 - L.r(k, 50) * 0.3, z - 0.07, 0.08, 0.08, 0.05, 0xe8d8a8, 'petal');
}

/** A pile of bamboo fish traps (tall woven baskets) at (x, y, z). */
export function traps(L: Local, x: number, y: number, z: number, n = 3): void {
  for (let i = 0; i < n; i++) {
    const ox = (i % 2) * 0.7 - 0.35;
    const oz = Math.floor(i / 2) * 0.7;
    L.box(x + ox, y + 0.45, z + oz, 0.55, 0.9, 0.55, tone(BAMBOO, L.r(i, x, 29)), 'mapBark');
    L.box(x + ox, y + 0.93, z + oz, 0.3, 0.1, 0.3, 0x8a7448, 'mapBark');
  }
}

/** A clay stove (a round firepot) with a blackened pot on it, at (x, y, z): the smoke comes from its top. */
export function stove(L: Local, x: number, y: number, z: number): number {
  L.box(x, y + 0.2, z, 0.55, 0.4, 0.55, 0x8a5a3a, 'mapStone');
  L.box(x, y + 0.5, z, 0.42, 0.22, 0.42, 0x2a2420, 'mapStone');
  L.box(x + 0.5, y + 0.1, z + 0.2, 0.6, 0.2, 0.25, 0x6a5038, 'mapBark');
  return y + 0.7;
}

/** A small motorbike (moto) parked at (x, y, z), along x. */
export function moto(L: Local, x: number, y: number, z: number, color: number): void {
  L.box(x - 0.6, y + 0.3, z, 0.5, 0.6, 0.12, 0x222222, 'metal');
  L.box(x + 0.6, y + 0.3, z, 0.5, 0.6, 0.12, 0x222222, 'metal');
  L.box(x, y + 0.6, z, 1.1, 0.35, 0.34, color, 'metal');
  L.box(x - 0.2, y + 0.84, z, 0.6, 0.14, 0.32, 0x2a2a2a, 'metal');
  L.box(x + 0.65, y + 1.0, z, 0.12, 0.4, 0.12, 0x333333, 'metal');
  L.box(x + 0.65, y + 1.2, z, 0.1, 0.08, 0.7, 0x333333, 'metal');
}

/**
 * A Khmer spirit house (រានព្រះភូមិ, rean preah phum) at (x, y, z), facing
 * +z: on a white post, a red tray with a gold rim, and on it a tiny Angkor
 * tower (prasat) — a redented base (the square plan stepped in at the
 * corners), the sanctum with its dark doorway in a gold frame, a gold
 * cornice, the tower rising in four shrinking tiers with leaf antefixes at
 * the corners, a gold lotus bud on top (not the Thai san phra phum's
 * palace of crossed gables and a spire of rings). Before it on the tray: two
 * little bay sei, a pot of incense, a candle. Returns where the candle's
 * flame glows. About 2.9 m tall, 0.9 m across. `gold`: the gilt's block
 * family (a build that keeps to its own families passes one of them). The
 * sugar-palm village's spirit houses are this one too (hamlet/_evKit.ts).
 */
export function spiritHouse(L: Local, x: number, y: number, z: number, gold: VoxelMaterialKey = 'brass'): [number, number, number] {
  const WHITE = 0xece4d2;
  const OCHRE = 0xd8a85a;
  const GOLD = 0xe0b040;
  /** A redented square (a cross of two boxes: the Angkorian plan), `w` across, from y0 to y1. */
  const cross = (w: number, y0: number, y1: number, c: number, mat: VoxelMaterialKey = 'mapStone', sh = 1) => {
    L.box(x, (y0 + y1) / 2, z, w, y1 - y0, w * 0.72, c, mat, sh);
    L.box(x, (y0 + y1) / 2, z, w * 0.72, y1 - y0, w, c, mat, sh);
  };
  // The post on its footing, a gold band under the tray.
  L.box(x, y + 0.05, z, 0.34, 0.1, 0.34, WHITE, 'mapStone', 0.92);
  L.box(x, y + 0.78, z, 0.16, 1.36, 0.16, WHITE, 'mapStone');
  L.box(x, y + 1.43, z, 0.26, 0.08, 0.26, GOLD, gold);
  // The tray: red lacquer, a gold rim.
  L.box(x, y + 1.52, z + 0.04, 0.84, 0.1, 0.78, 0xa8322a, 'mapStone');
  L.box(x, y + 1.585, z + 0.04, 0.88, 0.03, 0.82, GOLD, gold, 1.05);
  // The base, the sanctum (its doorway on the front), the cornice.
  cross(0.54, y + 1.6, y + 1.7, OCHRE);
  cross(0.4, y + 1.7, y + 2.08, WHITE, 'mapStone', 1.03);
  L.box(x, y + 1.85, z + 0.205, 0.13, 0.26, 0.02, 0x3a2418, 'mapStone', 0.8);
  L.box(x, y + 2.0, z + 0.212, 0.2, 0.04, 0.02, GOLD, gold);
  cross(0.48, y + 2.08, y + 2.13, GOLD, gold);
  // The tower: tiers drawing in, leaf antefixes at the lower ones' corners, the lotus bud.
  let ty = y + 2.13;
  const tiers: [number, number][] = [
    [0.38, 0.12],
    [0.3, 0.11],
    [0.23, 0.1],
    [0.16, 0.09],
  ];
  tiers.forEach(([w, h], k) => {
    cross(w, ty, ty + h, k % 2 ? OCHRE : WHITE, 'mapStone', 1 + k * 0.03);
    if (k < 2)
      for (const [dx, dz] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ])
        L.box(x + dx * w * 0.42, ty + h + 0.035, z + dz * w * 0.42, 0.045, 0.07, 0.045, GOLD, gold);
    ty += h;
  });
  L.box(x, ty + 0.07, z, 0.12, 0.14, 0.12, GOLD, gold);
  L.box(x, ty + 0.19, z, 0.07, 0.1, 0.07, GOLD, gold, 1.05);
  L.box(x, ty + 0.275, z, 0.03, 0.07, 0.03, GOLD, gold, 1.1);
  // Offerings on the tray before it: bay sei (banana-leaf cones) each side, incense, a candle.
  for (const s of [-1, 1]) {
    L.box(x + s * 0.3, y + 1.65, z + 0.3, 0.12, 0.1, 0.12, 0x6a9a3a, 'mapLeaf');
    L.box(x + s * 0.3, y + 1.74, z + 0.3, 0.07, 0.08, 0.07, 0x7aaa44, 'mapLeaf');
  }
  L.box(x - 0.1, y + 1.64, z + 0.34, 0.1, 0.08, 0.1, 0x6a4a30, 'mapStone');
  L.box(x - 0.1, y + 1.75, z + 0.34, 0.012, 0.16, 0.012, 0xc86a3a, 'petal');
  L.box(x + 0.1, y + 1.65, z + 0.34, 0.035, 0.1, 0.035, 0xf2eee0, 'petal');
  return [x + 0.1, y + 1.72, z + 0.34];
}

// ── Khmer gables ─────────────────────────────────────────────────────────────

/** What a house's gable end shows: its planks only, a fan of rays out of a little sun, or a kbach flame leaf under the ridge. */
export type GableStyle = 'plain' | 'rays' | 'kbach';

/**
 * Plain barge boards on a roof's gable end at x = `x` (the roof's own end,
 * `r.x0` or `r.x1`, a little out toward `out`): one board down each slope
 * over the rows' stepped ends, meeting under the ridge — Khmer gables keep
 * them plain (no horns crossed over the peak, no hooks at the eaves). Needs
 * `L.theta` (see `Local.tilt`).
 */
export function bargeBoards(L: Local, r: Roof, x: number, out: number, color: number): void {
  const mid = (r.z0 + r.z1) / 2;
  const k = r.rise / r.run;
  // (the line over the rows' outer top corners)
  const y0 = r.eave + r.rise + 0.08;
  const top = y0 + (mid - r.z0) * k;
  for (const s of [-1, 1]) {
    const ze = s < 0 ? r.z0 - 0.04 : r.z1 + 0.04;
    L.board(x + out * 0.05, ze, y0 - 0.04 * k, mid, top, 0.3, 0.08, color, 'mapBark', 0.95);
  }
}

/**
 * The Khmer gable on a house's end wall (its outer face at x = `x`, facing
 * `out`), over the depths `za`‥`zb`, from `from` (the walls' top) up under
 * the roof `r`: with `rays`, a tie beam across its foot, a little half sun
 * in the middle and nine rays fanning out of it to the roof (as the old
 * wooden houses of Siem Reap and Kampong Cham); with `kbach`, a pointed
 * flame leaf of boards under the ridge. `color` the rays' and the leaf's,
 * `sun` the sun's. Needs `L.theta` for the rays (see `Local.tilt`).
 */
export function khmerGable(L: Local, r: Roof, x: number, out: number, za: number, zb: number, from: number, style: GableStyle, color: number, sun = 0xe0b048): void {
  if (style === 'plain') return;
  const mid = (za + zb) / 2;
  const hw = (zb - za) / 2;
  const fx = x + out * 0.04;
  if (style === 'kbach') {
    const apex = r.eave + (Math.ceil((r.z1 - r.z0) / 2 / r.run) + 1) * r.rise;
    const s = Math.min(0.9, (apex - from) * 0.45);
    const y = from + (apex - from) * 0.45;
    const rows: [number, number][] = [
      [0.12, 0.5],
      [0.34, 0.28],
      [0.52, 0.08],
      [0.46, -0.12],
      [0.26, -0.3],
      [0.1, -0.44],
    ];
    for (const [w, dy] of rows) L.box(fx, y + dy * s, mid, 0.06, s * 0.2, w * s, color, 'mapBark', 1.05);
    L.box(fx, y - 0.46 * s, mid + 0.14 * s, 0.06, s * 0.1, 0.16 * s, color, 'mapBark', 1.05);
    return;
  }
  // The rays: the apex of the gable's triangle over the tie beam, where each ray meets the roof.
  const apex = r.eave + (hw / r.run + 1) * r.rise - 0.45;
  const H = apex - from;
  if (H < 0.6) return;
  const y0 = from + 0.08;
  L.span(fx - 0.05, from - 0.06, za, fx + 0.05, from + 0.08, zb, color, 'mapBark', 0.9);
  L.box(fx, y0 + 0.13, mid, 0.07, 0.26, 0.62, sun, 'mapStone', 1.05);
  L.box(fx, y0 + 0.29, mid, 0.07, 0.08, 0.36, sun, 'mapStone', 1.05);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const phi = (Math.PI * (i + 0.5)) / n;
    const c = Math.cos(phi);
    const sn = Math.sin(phi);
    const t = (H - 0.1) / (sn + (H * Math.abs(c)) / hw);
    const a = 0.42;
    const b = t - 0.12;
    if (b - a < 0.2) continue;
    L.board(fx, mid + c * a, y0 + sn * a, mid + c * b, y0 + sn * b, 0.1, 0.06, color, 'mapBark', i % 2 ? 1 : 0.9, true);
  }
}

/** A glowing box (local m): centre, size, colour; `halo` (m) for a lantern's halo. */
export type GlowFn = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, halo?: number) => void;

/** A hanging lantern at (x, y, z) (the middle of its glass). */
export function lantern(L: Local, x: number, y: number, z: number, glow: GlowFn): void {
  L.box(x, y + 0.4, z, 0.03, 0.32, 0.03, 0x3a332c, 'metal');
  L.box(x, y + 0.2, z, 0.3, 0.06, 0.3, 0x4a3a2a, 'metal');
  L.box(x, y - 0.2, z, 0.26, 0.05, 0.26, 0x4a3a2a, 'metal');
  glow(x, y, z, 0.22, 0.34, 0.22, GLOW.lantern, 1.8);
}

/** Local → world for glows and smoke. */
export function toWorld(fr: Frame, x: number, y: number, z: number): [number, number, number] {
  return [fr.wx(x, z), y, fr.wz(x, z)];
}
