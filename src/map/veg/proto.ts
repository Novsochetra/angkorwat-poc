import type { SourceTrace } from '../../feedback/sourceTrace';
import { hash3, valueNoise3 } from '../../voxel/random';

/**
 * Tree prototypes for the map's jungle. A prototype is built once in a small
 * dense volume of cells (1 m near the camera, 2 m far away), shaded once
 * (soft AO, light tops, dark undersides), and then stamped many times onto
 * the world lattice (see lattice.ts), turned by quarter turns and mirrored.
 *
 * Local space, in cells: cell (0, 0, 0) is the one the trunk stands in, just
 * above the ground; the pivot is the centre of its footprint at ground level.
 */

/** Cell kinds in a volume. */
export const EMPTY = 0;
export const LEAF = 1;
export const BARK = 2;

/**
 * Canopy colour ramps, deep shade → sunlit tips (sRGB). Like the reference
 * sheet (§18.1), the shadier the tone, the bluer; the lit tops go yellow-green.
 */
export const RAMPS = {
  green: [0x1f3a2e, 0x294a34, 0x365e35, 0x497534, 0x5f8a37, 0x7ea23d],
  jungle: [0x1c362c, 0x254533, 0x325a3a, 0x437140, 0x5a883e, 0x7a9c3d],
  olive: [0x2a432f, 0x3a5831, 0x4d6f32, 0x638734, 0x7b9b38, 0x94ad3f],
  deep: [0x182f27, 0x213d2e, 0x2c4f33, 0x3b6536, 0x517e38, 0x6c953a],
  palm: [0x284a33, 0x355e36, 0x477539, 0x5b8a3c, 0x74a042, 0x90b24a],
  bush: [0x1d3629, 0x284832, 0x355c36, 0x4a7337, 0x628b3a, 0x7c9f3e],
  pink: [0x9c4d63, 0xb85e76, 0xd07a90, 0xe199aa, 0xeeb4c1, 0xf6cdd6],
  orange: [0x9a3c1e, 0xb54d23, 0xcf652c, 0xe27d36, 0xee9a48, 0xf5b660],
  dry: [0x4f4426, 0x5f522c, 0x6f6131, 0x83723a, 0x928347, 0xa39456],
  /** Bamboo: feathery, lighter and yellower than the broadleaf crowns. */
  bamboo: [0x38552d, 0x4b6a30, 0x628534, 0x7b9d3b, 0x96b447, 0xb0c75a],
} as const;
export type RampName = keyof typeof RAMPS;
const RAMP_LIST = Object.values(RAMPS) as readonly (readonly number[])[];
export const RAMP_ID = Object.fromEntries(Object.keys(RAMPS).map((k, i) => [k, i])) as Record<RampName, number>;

/** A box that is not on the lattice (trunk segments, root flares), relative to the pivot (m). */
export interface FreeBox {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: number;
  shade: number;
  /** Leaf family instead of bark (palm crown hearts, hanging fruit). */
  leaf?: boolean;
}

/** A dense volume of cells: i, k in [−r, r], j in [0, h). */
export class Vol {
  readonly n: number;
  readonly w: number;
  readonly kind: Uint8Array;
  /** Leaf: ramp id; bark: unused. */
  readonly ramp: Uint8Array;
  /** Bark colour (sRGB) per cell. */
  readonly color: Uint32Array;
  /** Extra brightness per cell (1 = none), multiplied into the baked shade. */
  readonly tint: Float32Array;

  constructor(
    readonly r: number,
    readonly h: number,
  ) {
    this.w = 2 * r + 1;
    this.n = this.w * this.w * h;
    this.kind = new Uint8Array(this.n);
    this.ramp = new Uint8Array(this.n);
    this.color = new Uint32Array(this.n);
    this.tint = new Float32Array(this.n).fill(1);
  }

  idx(i: number, j: number, k: number): number {
    if (i < -this.r || i > this.r || k < -this.r || k > this.r || j < 0 || j >= this.h) return -1;
    return i + this.r + (k + this.r) * this.w + j * this.w * this.w;
  }

  at(i: number, j: number, k: number): number {
    const c = this.idx(i, j, k);
    return c < 0 ? EMPTY : this.kind[c];
  }

  leaf(i: number, j: number, k: number, ramp: number, tint = 1): void {
    const c = this.idx(i, j, k);
    if (c < 0) return;
    this.kind[c] = LEAF;
    this.ramp[c] = ramp;
    this.tint[c] = tint;
  }

  bark(i: number, j: number, k: number, color: number, tint = 1): void {
    const c = this.idx(i, j, k);
    if (c < 0) return;
    this.kind[c] = BARK;
    this.color[c] = color;
    this.tint[c] = tint;
  }

  clear(i: number, j: number, k: number): void {
    const c = this.idx(i, j, k);
    if (c >= 0) this.kind[c] = EMPTY;
  }
}

/** One lump of a canopy: an ellipsoid (cells). */
export interface Blob {
  x: number;
  y: number;
  z: number;
  r: number;
  ry: number;
}

/**
 * Fill a canopy made of lumps: a cell is leaf when it is inside any lump,
 * with a ragged edge (noise on the threshold) so the outline breaks up into
 * voxel bumps. Cells under `floor` stay empty (flat-ish undersides).
 */
export function fillBlobs(v: Vol, blobs: readonly Blob[], ramp: number, seed: number, floor = -1e9, rough = 0.22): void {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const b of blobs) {
    x0 = Math.min(x0, b.x - b.r);
    x1 = Math.max(x1, b.x + b.r);
    y0 = Math.min(y0, b.y - b.ry);
    y1 = Math.max(y1, b.y + b.ry);
    z0 = Math.min(z0, b.z - b.r);
    z1 = Math.max(z1, b.z + b.r);
  }
  for (let j = Math.max(0, Math.floor(y0)); j <= Math.min(v.h - 1, Math.ceil(y1)); j++) {
    if (j + 0.5 < floor) continue;
    for (let k = Math.max(-v.r, Math.floor(z0)); k <= Math.min(v.r, Math.ceil(z1)); k++)
      for (let i = Math.max(-v.r, Math.floor(x0)); i <= Math.min(v.r, Math.ceil(x1)); i++) {
        // Cell centres: (i, j + 0.5, k).
        let d = Infinity;
        for (const b of blobs) {
          const dx = (i - b.x) / b.r;
          const dy = (j + 0.5 - b.y) / b.ry;
          const dz = (k - b.z) / b.r;
          d = Math.min(d, dx * dx + dy * dy + dz * dz);
        }
        const lim = 1 + (hash3(i, j, k, seed) - 0.5) * rough * 2 + (valueNoise3(i * 0.45, j * 0.45, k * 0.45, seed + 3) - 0.5) * rough * 2;
        if (d < lim) v.leaf(i, j, k, ramp);
      }
  }
}

/** A line of bark cells from a to b (cells), e.g. a branch. */
export function barkLine(v: Vol, a: [number, number, number], b: [number, number, number], color: (t: number) => number): void {
  const steps = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])));
  for (let s = 0; s <= steps; s++) {
    const t = steps ? s / steps : 0;
    const i = Math.round(a[0] + (b[0] - a[0]) * t);
    const j = Math.floor(a[1] + (b[1] - a[1]) * t);
    const k = Math.round(a[2] + (b[2] - a[2]) * t);
    if (v.at(i, j, k) === EMPTY) v.bark(i, j, k, color(t));
  }
}

/**
 * A finished prototype: its cells (every cell that can hide a neighbour —
 * the shell and the layer under it), baked colour and shade, and free boxes.
 */
export interface Proto {
  /** Cell size (m). */
  s: number;
  n: number;
  ci: Int8Array;
  cj: Uint8Array;
  ck: Int8Array;
  color: Uint32Array;
  shade: Float32Array;
  /** 0 leaf family, 1 bark family. */
  mat: Uint8Array;
  /** 1 = shows (on the shell), 0 = only hides neighbours. */
  shell: Uint8Array;
  boxes: FreeBox[];
  /** Canopy radius (m): spacing between trees. */
  r: number;
  /** Top (m above the ground). */
  h: number;
  /** Bottom of the leaves (m above the ground): where the crown starts. */
  low: number;
  src?: SourceTrace;
}

const SMOOTH_NEIGHBOURS: [number, number, number, number][] = [];
for (let dx = -1; dx <= 1; dx++)
  for (let dy = -1; dy <= 1; dy++)
    for (let dz = -1; dz <= 1; dz++) {
      const n = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
      if (n) SMOOTH_NEIGHBOURS.push([dx, dy, dz, n === 1 ? 1 : n === 2 ? 0.6 : 0.35]);
    }
const TOTAL_W = SMOOTH_NEIGHBOURS.reduce((s, n) => s + n[3], 0);

export interface FinishOptions {
  s: number;
  r: number;
  h: number;
  seed: number;
  boxes?: FreeBox[];
  /** How strongly the height in the canopy lifts the tone (default 1). */
  lift?: number;
  src?: SourceTrace;
}

/**
 * Shade a volume and pack it as a prototype. Leaf tones come from the cell's
 * ramp: higher in the canopy, open to the sky and on a bump → lighter;
 * underneath and in hollows → darker and bluer. Deep interior cells are left out.
 */
export function finishProto(v: Vol, o: FinishOptions): Proto {
  const { r, h, w } = v;
  // Height range of the leaves.
  let lo = Infinity;
  let hi = -Infinity;
  for (let c = 0; c < v.n; c++)
    if (v.kind[c] === LEAF) {
      const j = Math.floor(c / (w * w));
      lo = Math.min(lo, j);
      hi = Math.max(hi, j);
    }
  const span = Math.max(1, hi - lo);
  const lift = o.lift ?? 1;
  const ci: number[] = [];
  const cj: number[] = [];
  const ck: number[] = [];
  const color: number[] = [];
  const shade: number[] = [];
  const mat: number[] = [];
  const shell: number[] = [];
  const at = (i: number, j: number, k: number) => v.at(i, j, k) !== EMPTY;
  for (let j = 0; j < h; j++)
    for (let k = -r; k <= r; k++)
      for (let i = -r; i <= r; i++) {
        const c = v.idx(i, j, k);
        const kind = v.kind[c];
        if (kind === EMPTY) continue;
        const faces = (at(i + 1, j, k) ? 0 : 1) | (at(i - 1, j, k) ? 0 : 2) | (at(i, j + 1, k) ? 0 : 4) | (at(i, j - 1, k) ? 0 : 8) | (at(i, j, k + 1) ? 0 : 16) | (at(i, j, k - 1) ? 0 : 32);
        if (!faces) {
          // Keep the first layer under the shell (it hides the shell's inner faces from neighbours' view).
          let deep = true;
          for (const [dx, dy, dz] of SMOOTH_NEIGHBOURS)
            if (!at(i + dx * 2, j + dy * 2, k + dz * 2) && Math.abs(dx) + Math.abs(dy) + Math.abs(dz) === 1) deep = false;
          if (deep) continue;
        }
        let open = 0;
        for (const [dx, dy, dz, wgt] of SMOOTH_NEIGHBOURS) if (!at(i + dx, j + dy, k + dz)) open += wgt;
        const exposure = open / TOTAL_W;
        let sh = 1 + 0.3 * Math.max(-0.7, Math.min(0.45, (exposure - 0.305) * 2));
        if (at(i, j + 1, k) && !(faces & 4)) sh *= 0.96;
        // Under an overhang (something two cells up): darker.
        if (at(i, j + 2, k) || at(i, j + 3, k)) sh *= 0.9;
        sh *= 1 + (hash3(i, j, k, o.seed + 9) - 0.5) * 0.08;
        sh *= v.tint[c];
        let col: number;
        if (kind === LEAF) {
          const ramp = RAMP_LIST[v.ramp[c]];
          const t = (j - lo) / span;
          let tone = 0.4 + t * 2.1 * lift + (faces & 4 ? 0.7 : 0) + (exposure - 0.3) * 2.5 + (valueNoise3(i * 0.6, j * 0.6, k * 0.6, o.seed) - 0.5) * 1.8;
          if (faces & 8 && !(faces & 4)) tone -= 0.8;
          tone = Math.max(0, Math.min(ramp.length - 1, Math.floor(tone)));
          col = ramp[tone];
          sh *= 0.9 + 0.2 * t;
        } else col = v.color[c];
        ci.push(i);
        cj.push(j);
        ck.push(k);
        color.push(col);
        shade.push(sh);
        mat.push(kind === BARK ? 1 : 0);
        shell.push(faces ? 1 : 0);
      }
  return {
    s: o.s,
    n: ci.length,
    ci: Int8Array.from(ci),
    cj: Uint8Array.from(cj),
    ck: Int8Array.from(ck),
    color: Uint32Array.from(color),
    shade: Float32Array.from(shade),
    mat: Uint8Array.from(mat),
    shell: Uint8Array.from(shell),
    boxes: o.boxes ?? [],
    r: o.r,
    h: o.h,
    low: Number.isFinite(lo) ? lo * o.s : o.h,
    src: o.src,
  };
}

/** Seeded random stream for one prototype. */
export function rng(seed: number): () => number {
  let n = 0;
  return () => hash3(n++, seed, 71, 5);
}
