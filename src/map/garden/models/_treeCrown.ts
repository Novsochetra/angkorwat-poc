import { traceSource } from '../../../feedback/sourceTrace';
import { mix } from './_treeKit';
import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { hash3 } from '../../../voxel/random';

/**
 * A fruit tree's crown as a small volume of leaf cells (garden/models/_treeKit.ts
 * has the rest of the kit): lumps (`blob`) filled with a rough, noisy edge,
 * hollows carved out (`carve`: the bowl under a mango's dome), thinned for a young
 * tree (`thin`), then only its shell is drawn (`emit`), shaded like the map's own
 * crowns (veg/proto.ts: deep and bluish inside and below, yellow-green where the
 * sun sits on top), with small leaf tufts poking out of the surface so the crown
 * reads as leaves, not boxes, when he stands under it.
 *
 * The cells are finer than the map's (0.4‥0.5 m, the map's 1 m): the garden's
 * trees are seen from a few metres.
 *
 * Speed (garden/look.ts: a big tree builds in ≤ 2 ms, inside a play frame): the
 * grid is padded (no bounds checks in the hot loops: neighbours are fixed index
 * offsets), its typed arrays are reused from one build to the next (one crown at a
 * time is the rule; a second one at once gets its own), the value noise is inlined
 * (`vnoise`, the same numbers as voxel/random.ts `valueNoise3` without its closure).
 */

/** What `paint` is told of a shell cell (to colour new flushes, a bronze underside…). */
export interface CellInfo {
  x: number;
  y: number;
  z: number;
  /** Open to the sky / to the ground (a top or bottom face shows). */
  top: boolean;
  under: boolean;
  /** 0 buried ‥ 1 alone in the air. */
  exposure: number;
  /** Height in the crown (0 its lowest cell ‥ 1 its top). */
  t: number;
  /** The colour the shading picked. */
  color: number;
  /** A tuft (the small leaf block out of a face), not the cell itself. */
  tuft: boolean;
}

export interface EmitOptions {
  /** Leaf colours, deep shade → sunlit top (the map's ramps have six). */
  ramp: readonly number[];
  seed: number;
  /** How fast the tone climbs with height (1 as the map's crowns). */
  lift?: number;
  /** A colour for this cell instead of the ramp's (null: keep the ramp's). */
  paint?: (c: CellInfo) => number | null;
  /** Share of the surface cells with a small tuft of leaves sticking out (0‥1). */
  tufts?: number;
  /** Size of a tuft (a share of the cell, 0.55 by default; each one 0.7‥1.35 of it). */
  tuft?: number;
  /** Share of the 2 × 2 × 2 groups of full cells drawn as one bigger leaf mass (0.4 by default). */
  merge?: number;
  /** The sun's colour laid over the tops of the upper crown (a lit, yellow-green sheen). */
  sun?: number;
}

const W1 = 1;
const W2 = 0.6;
const W3 = 0.35;
const TOTAL_W = 6 * W1 + 12 * W2 + 8 * W3;

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Smooth value noise in [0, 1): exactly voxel/random.ts `valueNoise3` (the same numbers), with no closure. */
export function vnoise(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);
  const tz = smooth(z - zi);
  const c000 = hash3(xi, yi, zi, seed);
  const c100 = hash3(xi + 1, yi, zi, seed);
  const c010 = hash3(xi, yi + 1, zi, seed);
  const c110 = hash3(xi + 1, yi + 1, zi, seed);
  const c001 = hash3(xi, yi, zi + 1, seed);
  const c101 = hash3(xi + 1, yi, zi + 1, seed);
  const c011 = hash3(xi, yi + 1, zi + 1, seed);
  const c111 = hash3(xi + 1, yi + 1, zi + 1, seed);
  const x00 = c000 + (c100 - c000) * tx;
  const x10 = c010 + (c110 - c010) * tx;
  const x01 = c001 + (c101 - c001) * tx;
  const x11 = c011 + (c111 - c011) * tx;
  const a = x00 + (x10 - x00) * ty;
  const b = x01 + (x11 - x01) * ty;
  return a + (b - a) * tz;
}

/** Scratch arrays shared by the crowns built one after another (grown, never shrunk). */
interface Scratch {
  occ: Uint8Array;
  noise: Float32Array;
  col: Uint32Array;
  sha: Float32Array;
  faces: Uint8Array;
  done: Uint8Array;
}
let pool: Scratch | null = null;
let poolBusy = false;
function scratch(n: number): Scratch {
  return { occ: new Uint8Array(n), noise: new Float32Array(n), col: new Uint32Array(n), sha: new Float32Array(n), faces: new Uint8Array(n), done: new Uint8Array(n) };
}

/** Pad of empty cells round the grid: one at the sides and below, three above (the shade looks 3 cells up). */
const PAD_LO = 1;
const PAD_HI = 3;
/** The tuft's open sides, in the order they are picked from (no array per tuft). */
const SIDES = new Int8Array(7);

export class Crown {
  /** Cell size (m), half width in cells (x and z), height in cells, the grid's floor (m). */
  readonly c: number;
  readonly n: number;
  readonly ny: number;
  readonly y0: number;
  /** Padded row width (x, z) and layer size. */
  private readonly w: number;
  private readonly ww: number;
  private readonly len: number;
  private readonly s: Scratch;
  private readonly pooled: boolean;
  private readonly seed: number;
  /** The 26 neighbours' index offsets and weights, in the order (dy, dz, dx) the exposure sums them. */
  private readonly nOff: Int32Array;
  private readonly nW: Float64Array;

  constructor(cell: number, radius: number, y0: number, y1: number, seed: number) {
    this.c = cell;
    this.n = Math.ceil(radius / cell) + 1;
    this.y0 = y0;
    this.ny = Math.ceil((y1 - y0) / cell) + 1;
    this.w = 2 * this.n + 1 + 2 * PAD_LO;
    this.ww = this.w * this.w;
    this.len = this.ww * (this.ny + PAD_LO + PAD_HI);
    this.seed = seed;
    if (!poolBusy) {
      if (!pool || pool.occ.length < this.len) pool = scratch(Math.max(this.len, 24000));
      this.s = pool;
      this.pooled = true;
      poolBusy = true;
    } else {
      this.s = scratch(this.len);
      this.pooled = false;
    }
    this.s.occ.fill(0, 0, this.len);
    this.s.noise.fill(-1, 0, this.len);
    this.nOff = new Int32Array(26);
    this.nW = new Float64Array(26);
    let q = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const m = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
          if (m === 0) continue;
          this.nOff[q] = dy * this.ww + dz * this.w + dx;
          this.nW[q] = m === 1 ? W1 : m === 2 ? W2 : W3;
          q++;
        }
  }

  /** The cells (a view of the scratch: valid until the next crown is built). */
  get occ(): Uint8Array {
    return this.s.occ.subarray(0, this.len);
  }

  /** The rough edge's noise at a cell (0‥1, smooth over a couple of cells), computed once per cell. */
  private rough(i: number, j: number, k: number, q: number): number {
    const noise = this.s.noise;
    let v = noise[q];
    if (v < 0) {
      const f = 1.1;
      v = noise[q] = vnoise(i * this.c * f, this.cy(j) * f, k * this.c * f, this.seed);
    }
    return v;
  }

  private idx(i: number, j: number, k: number): number {
    return (j + PAD_LO) * this.ww + (k + this.n + PAD_LO) * this.w + (i + this.n + PAD_LO);
  }

  private inside(i: number, j: number, k: number): boolean {
    return i >= -this.n && i <= this.n && k >= -this.n && k <= this.n && j >= 0 && j < this.ny;
  }

  /** Filled (outside the grid: empty). */
  at(i: number, j: number, k: number): boolean {
    return this.inside(i, j, k) && this.s.occ[this.idx(i, j, k)] !== 0;
  }

  set(i: number, j: number, k: number, on: boolean): void {
    if (this.inside(i, j, k)) this.s.occ[this.idx(i, j, k)] = on ? 1 : 0;
  }

  /** Cell centre (m). */
  cx(i: number): number {
    return i * this.c;
  }
  cy(j: number): number {
    return this.y0 + (j + 0.5) * this.c;
  }

  /** Cells of an ellipsoid round (x, y, z) with radii (rx, ry, rz) (m), its edge roughened by `rough` (0‥1). */
  blob(x: number, y: number, z: number, rx: number, ry: number, rz: number, rough: number, on = true): void {
    const c = this.c;
    const occ = this.s.occ;
    const v = on ? 1 : 0;
    const i0 = Math.max(-this.n, Math.floor((x - rx) / c) - 1);
    const i1 = Math.min(this.n, Math.ceil((x + rx) / c) + 1);
    const k0 = Math.max(-this.n, Math.floor((z - rz) / c) - 1);
    const k1 = Math.min(this.n, Math.ceil((z + rz) / c) + 1);
    const j0 = Math.max(0, Math.floor((y - ry - this.y0) / c) - 1);
    const j1 = Math.min(this.ny - 1, Math.ceil((y + ry - this.y0) / c) + 1);
    for (let j = j0; j <= j1; j++) {
      const py = this.cy(j);
      const dy = (py - y) / ry;
      const dy2 = dy * dy;
      if (dy2 > 1.6) continue;
      for (let k = k0; k <= k1; k++) {
        const pz = k * c;
        const dz = (pz - z) / rz;
        const dyz = dy2 + dz * dz;
        if (dyz > 1.6) continue;
        let q = this.idx(i0, j, k);
        for (let i = i0; i <= i1; i++, q++) {
          const px = i * c;
          const dx = (px - x) / rx;
          let d = dx * dx + dy * dy + dz * dz;
          if (d > 1.6) continue;
          if (rough > 0) d += (this.rough(i, j, k, q) - 0.5) * rough;
          if (d < 1) occ[q] = v;
        }
      }
    }
  }

  /** Clear the cells of an ellipsoid (a hollow under the crown, a gap). */
  carve(x: number, y: number, z: number, rx: number, ry: number, rz: number, rough = 0): void {
    this.blob(x, y, z, rx, ry, rz, rough, false);
  }

  /** Leave out a share of the cells (a young tree's thin crown: light shows through). */
  thin(share: number, seed: number): void {
    const occ = this.s.occ;
    for (let j = 0; j < this.ny; j++)
      for (let k = -this.n; k <= this.n; k++) {
        let q = this.idx(-this.n, j, k);
        for (let i = -this.n; i <= this.n; i++, q++) if (occ[q] && hash3(i, j, k, seed + 17) < share) occ[q] = 0;
      }
  }

  /** Lowest filled cell's underside at (x, z) (m), or NaN where the crown is not. */
  bottomAt(x: number, z: number): number {
    const i = Math.round(x / this.c);
    const k = Math.round(z / this.c);
    for (let j = 0; j < this.ny; j++) if (this.at(i, j, k)) return this.y0 + j * this.c;
    return Number.NaN;
  }

  /** Cells filled. */
  count(): number {
    let n = 0;
    const occ = this.s.occ;
    for (let q = 0; q < this.len; q++) n += occ[q];
    return n;
  }

  /**
   * Draw the shell: every filled cell with an open face; returns the blocks drawn. Not a lattice: a share of the
   * 2 × 2 × 2 groups of cells become one bigger leaf mass, every block is a little bigger than its cell (no dark
   * seams), moved off the grid and turned a little; light and shade come in patches (clusters of leaves), the
   * sun lies on the upper tops, and tufts of mixed sizes poke out of the faces. The crown's scratch is let go
   * after it (`bottomAt` is still right until the next crown is made).
   */
  emit(b: VoxelBuilder, o: EmitOptions): number {
    try {
      return this.draw(b, o);
    } finally {
      if (this.pooled) poolBusy = false;
    }
  }

  private draw(b: VoxelBuilder, o: EmitOptions): number {
    const src = traceSource();
    const { c, n, ny, w, ww } = this;
    const { occ, col, sha, faces, done } = this.s;
    const nOff = this.nOff;
    const nW = this.nW;
    const ramp = o.ramp;
    const rampTop = ramp.length - 1;
    const lift = o.lift ?? 1;
    const tufts = o.tufts ?? 0;
    const ts0 = c * (o.tuft ?? 0.55);
    const mergeShare = o.merge ?? 0.62;
    const sun = o.sun ?? mix(ramp[rampTop], 0xc4d270, 0.45);
    const seed = o.seed;
    const paint = o.paint;
    // Height span of the filled cells (the tone climbs over it).
    let lo = ny;
    let hi = -1;
    for (let j = 0; j < ny; j++) {
      const q0 = (j + PAD_LO) * ww;
      for (let q = q0, e = q0 + ww; q < e; q++)
        if (occ[q]) {
          if (j < lo) lo = j;
          hi = j;
          break;
        }
    }
    if (hi < 0) return 0;
    const span = Math.max(1, hi - lo);
    const len = this.len;
    faces.fill(0, 0, len);
    done.fill(0, 0, len);
    // Pass 1: every shell cell's colour, shade and open faces.
    const info: CellInfo = { x: 0, y: 0, z: 0, top: false, under: false, exposure: 0, t: 0, color: 0, tuft: false };
    for (let j = lo; j <= hi; j++)
      for (let k = -n; k <= n; k++) {
        let q = this.idx(-n, j, k);
        for (let i = -n; i <= n; i++, q++) {
          if (!occ[q]) continue;
          const f = (occ[q + 1] ? 0 : 1) | (occ[q - 1] ? 0 : 2) | (occ[q + ww] ? 0 : 4) | (occ[q - ww] ? 0 : 8) | (occ[q + w] ? 0 : 16) | (occ[q - w] ? 0 : 32);
          if (!f) continue;
          let open = 0;
          for (let e = 0; e < 26; e++) if (!occ[q + nOff[e]]) open += nW[e];
          const exposure = open / TOTAL_W;
          const t = (j - lo) / span;
          const x = i * c;
          const y = this.y0 + (j + 0.5) * c;
          const z = k * c;
          const top = (f & 4) !== 0;
          const under = (f & 8) !== 0 && !top;
          // Clusters: light and shade in patches a metre or two across, as leaves bunch on their twigs.
          const cluster = vnoise(x * 0.62, y * 0.62, z * 0.62, seed + 51) - 0.5;
          let sh = 1 + 0.3 * Math.max(-0.7, Math.min(0.45, (exposure - 0.305) * 2));
          if (occ[q + 2 * ww] || occ[q + 3 * ww]) sh *= 0.9;
          sh *= 1 + (hash3(i, j, k, seed + 9) - 0.5) * 0.1 + cluster * 0.22;
          sh *= 0.88 + 0.22 * t;
          let tn = 0.4 + t * 2.1 * lift + (top ? 0.8 : 0) + (exposure - 0.3) * 2.5 + (vnoise(i * 0.6, j * 0.6, k * 0.6, seed) - 0.5) * 1.2 + cluster * 2.6;
          if (under) tn -= 0.9;
          const ti = Math.max(0, Math.min(rampTop, Math.floor(tn)));
          let cc = ramp[ti];
          // The sun on the upper tops: a lit yellow-green sheen.
          if (top && t > 0.45) {
            cc = mix(cc, sun, Math.min(0.4, (t - 0.45) * 0.7 + Math.max(0, cluster) * 0.5));
            sh *= 1.06;
          }
          if (paint) {
            info.x = x;
            info.y = y;
            info.z = z;
            info.top = top;
            info.under = under;
            info.exposure = exposure;
            info.t = t;
            info.color = cc;
            info.tuft = false;
            const p = paint(info);
            if (p !== null) cc = p;
          }
          col[q] = cc;
          sha[q] = sh;
          faces[q] = f;
        }
      }
    let drawn = 0;
    // Pass 2: bigger leaf masses: full 2 × 2 × 2 groups (on a grid shifted by the seed) that show at the surface.
    const pi = seed & 1;
    const pj = (seed >> 1) & 1;
    const pk = (seed >> 2) & 1;
    const s2 = 2 * c;
    for (let j = lo - pj; j <= hi; j += 2)
      for (let k = -n - pk; k <= n; k += 2)
        for (let i = -n - pi; i <= n; i += 2) {
          if (hash3(i, j, k, seed + 61) >= mergeShare) continue;
          // (out of the grid on any side: not full; the pad cells are empty)
          if (i < -n - 1 || k < -n - 1 || j < -1) continue;
          const q0 = this.idx(i, j, k);
          let full = true;
          let shell = 0;
          let topQ = -1;
          let shSum = 0;
          for (let dj = 0; dj < 2 && full; dj++)
            for (let dk = 0; dk < 2 && full; dk++)
              for (let di = 0; di < 2; di++) {
                const q = q0 + dj * ww + dk * w + di;
                if (!occ[q]) {
                  full = false;
                  break;
                }
                if (faces[q]) {
                  shell++;
                  shSum += sha[q];
                  if (topQ < 0 || dj === 1) topQ = q;
                }
              }
          if (!full || shell === 0) continue;
          for (let dj = 0; dj < 2; dj++) for (let dk = 0; dk < 2; dk++) for (let di = 0; di < 2; di++) done[q0 + dj * ww + dk * w + di] = 1;
          const h1 = hash3(i, j, k, seed + 67);
          const h2 = hash3(i, j, k, seed + 71);
          const h3 = hash3(i, j, k, seed + 73);
          b.box(i * c + c / 2 + (h1 - 0.5) * c * 0.4, this.y0 + (j + 0.5) * c + c / 2 + (h2 - 0.5) * c * 0.3, k * c + c / 2 + (h3 - 0.5) * c * 0.4, s2 * (0.96 + h2 * 0.2), s2 * (0.84 + h3 * 0.2), s2 * (0.96 + h1 * 0.2), col[topQ], 'mapLeaf', {
            shade: shSum / shell,
            rx: (h3 - 0.5) * 0.24,
            ry: (h1 - 0.5) * 1.0,
            rz: (h2 - 0.5) * 0.24,
            src,
          });
          drawn++;
        }
    // Pass 3: the other shell cells, each a little bigger than its cell, off the grid, turned; and the tufts.
    for (let j = lo; j <= hi; j++)
      for (let k = -n; k <= n; k++) {
        let q = this.idx(-n, j, k);
        for (let i = -n; i <= n; i++, q++) {
          const f = faces[q];
          if (!f) continue;
          const x = i * c;
          const y = this.y0 + (j + 0.5) * c;
          const z = k * c;
          const sh = sha[q];
          if (!done[q]) {
            const h1 = hash3(i, j, k, seed + 81);
            const h2 = hash3(i, j, k, seed + 83);
            const h3 = hash3(i, j, k, seed + 87);
            // (sizes in clusters: some patches of small leaves, some of bigger; each overlaps its neighbours, no seams)
            const big = vnoise(x * 0.9, y * 0.9, z * 0.9, seed + 91);
            const sz = c * (0.98 + big * 0.4 + h2 * 0.12);
            b.box(x + (h1 - 0.5) * c * 0.42, y + (h2 - 0.5) * c * 0.3, z + (h3 - 0.5) * c * 0.42, sz * (0.92 + h1 * 0.16), sz * (0.82 + h3 * 0.18), sz * (0.92 + h3 * 0.16), col[q], 'mapLeaf', {
              shade: sh,
              rx: (h2 - 0.5) * 0.3,
              ry: (h3 - 0.5) * 1.0,
              rz: (h1 - 0.5) * 0.3,
              src,
            });
            drawn++;
          }
          if (tufts <= 0 || hash3(i, j, k, seed + 31) >= tufts) continue;
          const h = hash3(i, j, k, seed + 37);
          let ns = 0;
          if (f & 1) SIDES[ns++] = 0;
          if (f & 2) SIDES[ns++] = 1;
          if (f & 16) SIDES[ns++] = 2;
          if (f & 32) SIDES[ns++] = 3;
          if (f & 4) {
            SIDES[ns++] = 4;
            SIDES[ns++] = 4;
          }
          if (f & 8 && !(f & 4)) SIDES[ns++] = 5;
          if (!ns) continue;
          const s = SIDES[Math.floor(h * ns)];
          const ts = ts0 * (0.7 + hash3(i, j, k, seed + 47) * 0.85);
          const out = c / 2 + ts / 2 - ts * 0.4;
          const jx = (hash3(i, j, k, seed + 41) - 0.5) * c * 0.6;
          const jz = (hash3(i, j, k, seed + 43) - 0.5) * c * 0.6;
          const tx = s === 0 ? out : s === 1 ? -out : jx;
          const tz = s === 2 ? out : s === 3 ? -out : jz;
          const ty = s === 4 ? out : s === 5 ? -out : jx * 0.5;
          // (a tuft is lighter than its cell, or darker hanging under the crown; up top, the sun on it)
          const base = col[q];
          let tc = s === 5 ? mix(base, ramp[0], 0.3) : s === 4 ? mix(base, sun, 0.35) : mix(base, ramp[rampTop], 0.3);
          if (paint) {
            info.x = x + tx;
            info.y = y + ty;
            info.z = z + tz;
            info.top = s === 4;
            info.under = s === 5;
            info.t = (j - lo) / span;
            info.color = tc;
            info.tuft = true;
            const p = paint(info);
            if (p !== null) tc = p;
          }
          const hy = s === 5 ? ts * 1.35 : ts * (0.85 + h * 0.3);
          b.box(x + tx, y + ty - (s === 5 ? ts * 0.15 : 0), z + tz, ts, hy, ts * (0.8 + h * 0.4), tc, 'mapLeaf', {
            shade: sh * (s === 5 ? 0.92 : 1.05),
            ry: (h - 0.5) * 1.6,
            rx: (hash3(i, j, k, seed + 53) - 0.5) * 0.4,
            src,
          });
          drawn++;
        }
      }
    return drawn;
  }
}
