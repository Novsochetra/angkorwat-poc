import { traceSource, type SourceTrace } from '../../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../../voxel/materials';
import { hash3 } from '../../../voxel/random';
import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import type { PlantLook } from '../state';

/**
 * The garden's two palms (garden/models/coconut.ts, sugarPalm.ts) share this kit:
 * the map's own palms (veg/palms.ts: their colours, proportions and the way
 * their leaves are posed: a root, a heading, a lift, a roll and a bend, the
 * shader's arc) rebuilt in the garden's voxel blocks (`mapLeaf`, `mapBark`,
 * `petal`): turned blocks along the same curves, so a grown garden palm stands
 * like the village's.
 *
 * - {@link PalmKit}: seeded numbers, the code that made the blocks (one trace
 *   per part: bug reports name the part, and the build stays quick in dev),
 *   upright blocks and beams between two points.
 * - {@link Leaf}: a leaf's frame and its bend (veg/palms.ts `palmPose`).
 * - {@link fan} (the sugar palm's pleated fan on its stalk), {@link frond}
 *   (the coconut's feather frond), {@link strap} (a young palm's first,
 *   undivided folded leaf).
 * - {@link Wither}: a thirsty or dead palm's colours and sag.
 */

// ── Colours (sRGB): the map's palms (veg/palms.ts), and the garden's own ─────

/** Sugar palm: the trunk dark grey to near black, paler and dustier low down. */
export const SUGAR_TRUNK = [0x3f3c38, 0x47433e, 0x393633, 0x4e4943] as const;
export const SUGAR_TRUNK_LOW = 0x59544c;
/** The old leaf bases under the crown: grey-brown, split and weathered. */
export const BOOTS = [0x4d4236, 0x574a3b, 0x43392f, 0x5e5140] as const;
/** The heart of the crown and the living leaves' stalks. */
export const HEART = 0x505236;
export const STALK = [0x66663c, 0x5c5d37, 0x6f6c41] as const;
/** Fans: young ones yellow-green; the crown a dull grey-green; the oldest yellowing. */
export const FAN_YOUNG = [0x7f9c56, 0x89a45c, 0x769450] as const;
export const FAN = [0x5a7a44, 0x64824a, 0x55723e, 0x6b864e, 0x5f7c43] as const;
export const FAN_OLD = [0x6c7842, 0x777f44, 0x807d42] as const;
/** Dead fans and fronds. */
export const DEAD = [0x7d6242, 0x6f573a, 0x86694a, 0x62503a, 0x74604a] as const;
/** Sugar palm fruit: round, dark purple-black; its cap of sepals; the flower stalks tan. */
export const PALM_FRUIT = [0x2c2228, 0x36282f, 0x3e2d33] as const;
export const FRUIT_CAP = [0x6e6a3a, 0x7a7040, 0x625e34] as const;
export const FLOWER = [0x9b8558, 0x8d7749, 0xa89060] as const;

/** Coconut palm: the trunk pale grey-brown, ringed; the crown shaft olive. */
export const COCO_TRUNK = [0x8e806c, 0x998a75, 0x817461, 0x9d8f7a] as const;
export const COCO_RING = 0x6e6252;
export const COCO_SHAFT = 0x77804a;
export const FROND = [0x6a9a38, 0x74a540, 0x5f8d32, 0x7fac47] as const;
export const FROND_YOUNG = [0x8aae4a, 0x94b452, 0x82a844] as const;
export const FROND_OLD = [0x97a040, 0xa59e49, 0x8e993a] as const;
export const DEAD_FROND = [0x8b6f45, 0x7d6341, 0x957a50] as const;
/** Coconuts: green (a little brighter than the map's: they hang in the crown's shade); turning (yellow-brown); ripe (brown husk). */
export const NUT_GREEN = [0x76a434, 0x82ae3a, 0x8aac3c] as const;
export const NUT_TURNING = [0xa8923a, 0xb08a3a, 0x9a8238] as const;
export const NUT_RIPE = [0x7b5b37, 0x86643c, 0x6f5232] as const;
/** A sprouting nut's husk (dry, fibrous) and its dark eye end. */
export const HUSK = [0x8a6a45, 0x7e6040, 0x947250] as const;
export const HUSK_DARK = 0x5a4430;
/** A young palm's sheath at the foot (green-brown). */
export const SHEATH = [0x7a7c46, 0x6e7240, 0x84834c] as const;

/** Grey-brown of a dry, dead palm (nothing green). */
const DRY = [0x8a7658, 0x7c6a52, 0x958266, 0x7f6e5a, 0x8c7c62] as const;

export const pick = (list: readonly number[], r: number): number => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/** `a` toward `b` by `t` (sRGB hex). */
export function mixHex(a: number, b: number, t: number): number {
  const m = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

// ── Thirst and death ───────────────────────────────────────────────────────

/** How a palm's leaves show its thirst (`droop`) or its death. */
export interface Wither {
  /** Radians off each leaf's lift (it hangs). */
  readonly sag: number;
  /** Times each leaf's bend. */
  readonly bend: number;
  /** A fan's spread kept (it folds as it wilts), a frond's leaflets hanging further (radians). */
  readonly fold: number;
  readonly hang: number;
  readonly dead: boolean;
  /** A living leaf's colour as the palm is now. */
  tint(hex: number, r: number): number;
}

const PALE = 0xa9b062;
const LIMP = 0xb49c4e;

export function witherOf(look: PlantLook): Wither {
  if (look.dead)
    return { sag: 0.75, bend: 2.6, fold: 0.55, hang: 0.5, dead: true, tint: (_h, r) => pick(DRY, r) };
  if (look.droop === 2)
    return { sag: 0.55, bend: 2.2, fold: 0.62, hang: 0.4, dead: false, tint: (h, r) => mixHex(h, LIMP, 0.4 + 0.2 * r) };
  if (look.droop === 1)
    return { sag: 0.28, bend: 1.55, fold: 0.85, hang: 0.18, dead: false, tint: (h, r) => mixHex(h, PALE, 0.16 + 0.12 * r) };
  return { sag: 0, bend: 1, fold: 1, hang: 0, dead: false, tint: (h) => h };
}

// ── Blocks ─────────────────────────────────────────────────────────────────

export type Mat = VoxelMaterialKey;

/** Euler angles (XYZ, as three) of the turn whose axes are X, Y and Z = X × Y. */
const _rot = { rx: 0, ry: 0, rz: 0 };
function eulerOf(Xx: number, Xy: number, Xz: number, Yx: number, Yy: number, Yz: number): typeof _rot {
  const Zx = Xy * Yz - Xz * Yy;
  const Zy = Xz * Yx - Xx * Yz;
  const Zz = Xx * Yy - Xy * Yx;
  // (three's Euler.setFromRotationMatrix, order XYZ: m11 = X.x, m12 = Y.x, m13 = Z.x, …)
  const m13 = Math.max(-1, Math.min(1, Zx));
  _rot.ry = Math.asin(m13);
  if (Math.abs(m13) < 0.9999999) {
    _rot.rx = Math.atan2(-Zy, Zz);
    _rot.rz = Math.atan2(-Yx, Xx);
  } else {
    _rot.rx = Math.atan2(Yz, Yy);
    _rot.rz = 0;
  }
  return _rot;
}

/** The blocks of one palm: its seeded numbers, the part being made, and two ways to lay a block. */
/** A palm's seeded number 0‥1 (`PalmKit.r`) from its seed's integer `s` (round(seed × 100003)), its salt and `q`. */
export const palmRand = (s: number, salt: number, q: number): number => hash3(s, q, salt, 9473);
/** `PalmKit.r` without the kit (a model's pure helpers: where its fallen fruit lies). */
export const palmR = (seed: number, salt: number) => (q: number): number => palmRand(Math.round(seed * 100003), salt, q);

/**
 * Where fallen fruit `i` of `n` lies (local m: x, z): round the foot `toward` (rad) from the trunk, 0.8‥`reach` m
 * out (the view draws it there, garden/_viewFruit.ts; roam/_gardenWork.ts goes there to pick it up).
 */
export function fallenSpot(r: (q: number) => number, n: number, toward: number, reach: number, i: number, q0 = 900): [number, number] {
  const a = toward + (i - (n - 1) / 2) * 1.05 + (r(q0 + i) - 0.5) * 0.6;
  const d = 0.8 + (reach - 0.8) * r(q0 + 10 + i);
  return [Math.sin(a) * d, Math.cos(a) * d];
}

export class PalmKit {
  private readonly s: number;
  /** The code making the blocks now (dev builds): one trace per part, see {@link mark}. */
  private src: SourceTrace | undefined;
  /** Blocks laid (for the budget). */
  n = 0;

  constructor(
    readonly b: VoxelBuilder,
    seed: number,
    private readonly salt: number,
  ) {
    this.s = Math.round(seed * 100003);
    this.src = traceSource();
  }

  /** A seeded number 0‥1 (the same palm every time). */
  r(q: number): number {
    return palmRand(this.s, this.salt, q);
  }

  /** The blocks from here on were made by the caller's line (bug reports name it). */
  mark(): void {
    this.src = traceSource();
  }

  /** An upright block centred at (x, y, z), turned `yaw` about y. */
  block(x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, color: number, mat: Mat, shade = 1): void {
    this.n++;
    this.b.box(x, y, z, sx, sy, sz, color, mat, yaw ? { shade, ry: yaw, src: this.src } : { shade, src: this.src });
  }

  /** A block turned by Euler angles (XYZ). */
  turned(x: number, y: number, z: number, sx: number, sy: number, sz: number, rx: number, ry: number, rz: number, color: number, mat: Mat, shade = 1): void {
    this.n++;
    this.b.box(x, y, z, sx, sy, sz, color, mat, { shade, rx, ry, rz, src: this.src });
  }

  /**
   * A block from (x0, y0, z0) to (x1, y1, z1) (its length, plus `over` to close
   * the joints of a chain), `w` wide across toward (ax, ay, az) (as near as square
   * to its length) and `t` thick.
   */
  beam(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, w: number, t: number, ax: number, ay: number, az: number, color: number, mat: Mat, shade = 1, over = 0): void {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-5) return;
    dx /= len;
    dy /= len;
    dz /= len;
    // Across: square to the length.
    const k = ax * dx + ay * dy + az * dz;
    let px = ax - k * dx;
    let py = ay - k * dy;
    let pz = az - k * dz;
    let pl = Math.hypot(px, py, pz);
    if (pl < 1e-4) {
      // (any square direction: level if it can be)
      if (Math.abs(dy) < 0.95) {
        px = dz;
        py = 0;
        pz = -dx;
      } else {
        px = 1;
        py = 0;
        pz = 0;
      }
      pl = Math.hypot(px, py, pz);
    }
    px /= pl;
    py /= pl;
    pz /= pl;
    const e = eulerOf(px, py, pz, dx, dy, dz);
    this.turned((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, w, len + over, t, e.rx, e.ry, e.rz, color, mat, shade);
  }
}

// ── Leaves ─────────────────────────────────────────────────────────────────

/**
 * A leaf's frame, as the map's palm shader poses it (veg/palms.ts `palmPose`):
 * from its root along heading `az` (radians from +z toward +x) and lift `el`,
 * its upper side turned `roll` about that line; it curves down along its length
 * by `k` (1/m: a circle's arc). Points are given in metres along it, across it
 * and over its upper side.
 */
export class Leaf {
  ox = 0;
  oy = 0;
  oz = 0;
  readonly X = [1, 0, 0];
  readonly Y = [0, 1, 0];
  readonly Z = [0, 0, 1];
  k = 0;

  set(x: number, y: number, z: number, az: number, el: number, roll: number, k: number): this {
    this.ox = x;
    this.oy = y;
    this.oz = z;
    const ce = Math.cos(el);
    const se = Math.sin(el);
    const ca = Math.cos(az);
    const sa = Math.sin(az);
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    // Z along; X0 across, level; Y0 its upper side.
    const x0 = [ca, 0, -sa];
    const y0 = [-se * sa, ce, -se * ca];
    this.Z[0] = sa * ce;
    this.Z[1] = se;
    this.Z[2] = ca * ce;
    for (let i = 0; i < 3; i++) {
      this.X[i] = x0[i] * cr + y0[i] * sr;
      this.Y[i] = y0[i] * cr - x0[i] * sr;
    }
    this.k = k;
    return this;
  }

  /** The point `along` m out, `sx` across and `sy` over its upper side (world, into `out`). */
  at(along: number, sx: number, sy: number, out: number[]): number[] {
    const a = this.k * along;
    const small = Math.abs(a) < 1e-3;
    const S = small ? along : Math.sin(a) / this.k;
    const C = small ? 0.5 * this.k * along * along : (1 - Math.cos(a)) / this.k;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let i = 0; i < 3; i++) {
      const up = this.Y[i] * ca + this.Z[i] * sa;
      out[i] = (i === 0 ? this.ox : i === 1 ? this.oy : this.oz) + this.Z[i] * S - this.Y[i] * C + this.X[i] * sx + up * sy;
    }
    return out;
  }

  /** A direction given across, up and along the leaf at `along` m (world, into `out`). */
  dir(along: number, lx: number, ly: number, lz: number, out: number[]): number[] {
    const a = this.k * along;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let i = 0; i < 3; i++) {
      const up = this.Y[i] * ca + this.Z[i] * sa;
      const T = this.Z[i] * ca - this.Y[i] * sa;
      out[i] = this.X[i] * lx + up * ly + T * lz;
    }
    return out;
  }
}

const _leaf = new Leaf();

/**
 * The map's palm leaves are lit brighter than a block of the same colour (their
 * blades brighten to the rim, the low sun glows through them: veg/palms.ts): the
 * garden's leaf blocks are this much lighter, so the two sit together.
 */
const LIT = 1.22;
/** (the coconut's fronds most: their thin leaflets glow in the map's palms) */
const FROND_LIT = 1.42;
const _p = [0, 0, 0];
const _q = [0, 0, 0];
const _e = [0, 0, 0];

export interface FanOpts {
  /** Blade segments, and how far round they spread (radians: 3.5 open, less folded). */
  segs: number;
  spread: number;
  /** Stalk colour; the blade's rim brightness (old and dead fans less). */
  stalk: number;
  tip?: number;
  /** Stalk thickness (m, default 0.085). */
  stalkW?: number;
  /** A stalk's spines: dark teeth along its edges (near the foot of a young palm, where they are seen). */
  spines?: boolean;
}

/**
 * A sugar palm's fan on its stalk (veg/palms.ts `fanGeometry`, in blocks): the
 * stalk from the root, then the blade's pleated segments radiating from its tip
 * (each tipped the other way about its length), the two halves rising in a
 * shallow V. `stalk` and `scale` (the blade's radius) in metres; `bend` 1/m.
 */
export function fan(K: PalmKit, x: number, y: number, z: number, az: number, el: number, roll: number, stalk: number, scale: number, bend: number, color: number, shade: number, o: FanOpts): void {
  const L = _leaf.set(x, y, z, az, el, roll, bend);
  const sw = o.stalkW ?? 0.085;
  // The stalk: two lengths along its curve (stiff, a little flattened).
  const n = stalk > 0.6 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const a0 = (stalk * i) / n;
    const a1 = (stalk * (i + 1)) / n;
    L.at(a0, 0, 0, _p);
    L.at(a1, 0, 0, _q);
    L.dir((a0 + a1) / 2, 1, 0, 0, _e);
    K.beam(_p[0], _p[1], _p[2], _q[0], _q[1], _q[2], sw, sw * 0.7, _e[0], _e[1], _e[2], o.stalk, 'mapLeaf', 0.82 * LIT * shade, 0.04);
  }
  if (o.spines && stalk > 0.3) {
    // (a row of dark teeth on each edge of the stalk's lower half)
    for (let i = 0; i < 2; i++) {
      const a = stalk * (0.25 + 0.3 * i);
      L.at(a, (i ? 1 : -1) * sw * 0.55, 0, _p);
      K.block(_p[0], _p[1], _p[2], 0.03, 0.03, 0.03, az, 0x2e2a20, 'mapBark', 1);
    }
  }
  // The blade.
  const tip = o.tip ?? 1;
  const half = o.spread / 2;
  for (let i = 0; i < o.segs; i++) {
    const f = (i + 0.5) / o.segs;
    const phi = -half + o.spread * f;
    const side = Math.abs(Math.sin(phi));
    const len = 1 - 0.24 * (phi / 1.75) ** 2;
    const tilt = (i % 2 ? 1 : -1) * 0.38;
    const dx = Math.sin(phi);
    const dz = Math.cos(phi);
    const lift = (r: number) => r * (0.3 * side + 0.06) + 0.08 * r * r;
    const r0 = 0.04;
    const rm = (r0 + len) / 2;
    L.at(stalk + dz * r0 * scale, dx * r0 * scale, lift(r0) * scale, _p);
    L.at(stalk + dz * len * scale, dx * len * scale, lift(len) * scale, _q);
    // Across the segment: level, tipped by the pleat.
    L.dir(stalk + dz * rm * scale, Math.cos(phi) * Math.cos(tilt), Math.sin(tilt), -Math.sin(phi) * Math.cos(tilt), _e);
    const w = Math.min(0.42, (o.spread / o.segs) * 0.95) * scale;
    K.beam(_p[0], _p[1], _p[2], _q[0], _q[1], _q[2], w, 0.035, _e[0], _e[1], _e[2], color, 'mapLeaf', LIT * shade * (0.92 + 0.12 * tip * (i % 2 ? 1 : 0.9)));
  }
}

export interface FrondOpts {
  /** Lengths of the midrib (its curve), and pairs of leaflets along it. */
  segs: number;
  pairs: number;
  /** The leaflets' brightness at the tip (old and dead fronds less), their colour if not the frond's. */
  tip?: number;
  /** Radians the leaflets hang further (wilting). */
  hang?: number;
  /** The midrib's colour. */
  rib: number;
}

/**
 * A coconut frond (veg/palms.ts `frondGeometry`, in blocks): the midrib along its
 * curve, `len` m, with pairs of long narrow leaflets reaching forward and out
 * and hanging in a V, short at the base and the tip, longest in the middle
 * (`scale`: their size, m).
 */
export function frond(K: PalmKit, x: number, y: number, z: number, az: number, el: number, roll: number, len: number, scale: number, bend: number, color: number, shade: number, o: FrondOpts): void {
  const L = _leaf.set(x, y, z, az, el, roll, bend);
  for (let i = 0; i < o.segs; i++) {
    const a0 = (len * i) / o.segs;
    const a1 = (len * (i + 1)) / o.segs;
    const w = 0.12 * scale * (1 - 0.65 * ((i + 0.5) / o.segs));
    L.at(a0, 0, 0, _p);
    L.at(a1, 0, 0, _q);
    L.dir((a0 + a1) / 2, 1, 0, 0, _e);
    K.beam(_p[0], _p[1], _p[2], _q[0], _q[1], _q[2], w, w * 0.8, _e[0], _e[1], _e[2], o.rib, 'mapLeaf', LIT * shade * 1.12, 0.03);
  }
  const tip = o.tip ?? 1;
  const fwd = 0.95;
  for (let k = 0; k < o.pairs; k++) {
    const t = 0.08 + 0.88 * ((k + 0.5) / o.pairs);
    const ll = (0.42 + 0.58 * Math.sin(Math.PI * Math.min(1, (t - 0.02) / 0.96)) ** 0.7) * scale;
    const hang = 0.45 + 0.35 * t + (o.hang ?? 0);
    const a0 = t * len;
    for (const s of [-1, 1]) {
      const lx = s * Math.sin(fwd) * Math.cos(hang);
      const ly = -Math.sin(hang);
      const lz = Math.cos(fwd) * Math.cos(hang);
      L.at(a0, 0, 0, _p);
      L.at(a0 + lz * ll, lx * ll, ly * ll - 0.1 * scale, _q);
      // Across the leaflet: level in the frond's frame, square to its length.
      const el2 = Math.hypot(lz, lx) || 1;
      L.dir(a0 + lz * ll * 0.5, (-lz * s) / el2, 0, (lx * s) / el2, _e);
      K.beam(_p[0], _p[1], _p[2], _q[0], _q[1], _q[2], 0.15 * scale, 0.03, _e[0], _e[1], _e[2], color, 'mapLeaf', FROND_LIT * shade * (0.84 + 0.2 * t * tip), 0.02);
    }
  }
}

/**
 * A young palm's first leaves: one long undivided blade, folded down its middle
 * (two halves rising in a V), curving out. `split` (0‥1) parts the two halves
 * along the blade (a young coconut's bifid leaf: two lobes opening like a fish's
 * tail); `notch` parts only the tip. `w`: the open blade's width (m).
 */
export function strap(K: PalmKit, x: number, y: number, z: number, az: number, el: number, roll: number, len: number, w: number, bend: number, color: number, shade: number, segs: number, fold = 0.55, notch = false, split = 0): void {
  const L = _leaf.set(x, y, z, az, el, roll, bend);
  // (narrow at the foot, widest past the middle, narrowing to the tip)
  const width = (f: number) => w * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, 0.25 + 0.8 * f)));
  // Each half's middle off the fold at `a` m along: a quarter of the blade, and as the halves part.
  const off = (a: number, f: number, s: number) => s * (width(f) / 4 + split * 0.45 * a * (a / len) + (notch && f > 1 - 1 / segs ? width(f) * 0.5 * (f - (1 - 1 / segs)) * segs : 0));
  for (let i = 0; i < segs; i++) {
    const f0 = i / segs;
    const f1 = (i + 1) / segs;
    const ww = width((f0 + f1) / 2);
    const a0 = len * f0;
    const a1 = len * f1;
    for (const s of [-1, 1]) {
      // Each half from the fold out, tipped up by `fold`.
      const o0 = off(a0, f0, s);
      const o1 = off(a1, f1, s);
      L.at(a0, o0 * Math.cos(fold), Math.abs(o0) * Math.sin(fold), _p);
      L.at(a1, o1 * Math.cos(fold), Math.abs(o1) * Math.sin(fold), _q);
      L.dir((a0 + a1) / 2, Math.cos(fold), s * Math.sin(fold), 0, _e);
      K.beam(_p[0], _p[1], _p[2], _q[0], _q[1], _q[2], ww * 0.52, 0.03, _e[0], _e[1], _e[2], color, 'mapLeaf', LIT * shade * (s > 0 ? 1 : 0.9), 0.03);
    }
  }
}
