import { traceSource } from '../../../feedback/sourceTrace';
import { mix } from './_treeKit';
import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { hash3, valueNoise3 } from '../../../voxel/random';

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

export class Crown {
  /** Cell size (m), half width in cells (x and z), height in cells, the grid's floor (m). */
  readonly c: number;
  readonly n: number;
  readonly ny: number;
  readonly y0: number;
  private readonly w: number;
  readonly occ: Uint8Array;
  /** The rough edge's noise per cell (computed once, when first asked: −1 not yet). */
  private readonly noise: Float32Array;
  private readonly seed: number;

  constructor(cell: number, radius: number, y0: number, y1: number, seed: number) {
    this.c = cell;
    this.n = Math.ceil(radius / cell) + 1;
    this.y0 = y0;
    this.ny = Math.ceil((y1 - y0) / cell) + 1;
    this.w = 2 * this.n + 1;
    this.occ = new Uint8Array(this.w * this.w * this.ny);
    this.noise = new Float32Array(this.occ.length).fill(-1);
    this.seed = seed;
  }

  /** The rough edge's noise at a cell (0‥1, smooth over a couple of cells). */
  private rough(i: number, j: number, k: number): number {
    const q = this.idx(i, j, k);
    let v = this.noise[q];
    if (v < 0) {
      const f = 1.1;
      v = this.noise[q] = valueNoise3(i * this.c * f, this.cy(j) * f, k * this.c * f, this.seed);
    }
    return v;
  }

  private idx(i: number, j: number, k: number): number {
    return (j * this.w + (k + this.n)) * this.w + (i + this.n);
  }

  /** Filled (outside the grid: empty). */
  at(i: number, j: number, k: number): boolean {
    if (i < -this.n || i > this.n || k < -this.n || k > this.n || j < 0 || j >= this.ny) return false;
    return this.occ[this.idx(i, j, k)] !== 0;
  }

  set(i: number, j: number, k: number, on: boolean): void {
    if (i < -this.n || i > this.n || k < -this.n || k > this.n || j < 0 || j >= this.ny) return;
    this.occ[this.idx(i, j, k)] = on ? 1 : 0;
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
    const i0 = Math.max(-this.n, Math.floor((x - rx) / c) - 1);
    const i1 = Math.min(this.n, Math.ceil((x + rx) / c) + 1);
    const k0 = Math.max(-this.n, Math.floor((z - rz) / c) - 1);
    const k1 = Math.min(this.n, Math.ceil((z + rz) / c) + 1);
    const j0 = Math.max(0, Math.floor((y - ry - this.y0) / c) - 1);
    const j1 = Math.min(this.ny - 1, Math.ceil((y + ry - this.y0) / c) + 1);
    for (let j = j0; j <= j1; j++) {
      const py = this.cy(j);
      const dy = (py - y) / ry;
      for (let k = k0; k <= k1; k++) {
        const pz = k * c;
        const dz = (pz - z) / rz;
        for (let i = i0; i <= i1; i++) {
          const px = i * c;
          const dx = (px - x) / rx;
          let d = dx * dx + dy * dy + dz * dz;
          if (d > 1.6) continue;
          if (rough > 0) d += (this.rough(i, j, k) - 0.5) * rough;
          if (d < 1) this.occ[this.idx(i, j, k)] = on ? 1 : 0;
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
    for (let j = 0; j < this.ny; j++)
      for (let k = -this.n; k <= this.n; k++)
        for (let i = -this.n; i <= this.n; i++) if (this.at(i, j, k) && hash3(i, j, k, seed + 17) < share) this.set(i, j, k, false);
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
    for (let q = 0; q < this.occ.length; q++) n += this.occ[q];
    return n;
  }

  /**
   * Draw the shell: every filled cell with an open face; returns the blocks drawn. Not a lattice: a share of the
   * 2 × 2 × 2 groups of cells become one bigger leaf mass, every block is a little bigger than its cell (no dark
   * seams), moved off the grid and turned a little; light and shade come in patches (clusters of leaves), the
   * sun lies on the upper tops, and tufts of mixed sizes poke out of the faces.
   */
  emit(b: VoxelBuilder, o: EmitOptions): number {
    const src = traceSource();
    const { c, n, ny, w } = this;
    const ramp = o.ramp;
    const lift = o.lift ?? 1;
    const tufts = o.tufts ?? 0;
    const ts0 = c * (o.tuft ?? 0.55);
    const mergeShare = o.merge ?? 0.62;
    const sun = o.sun ?? mix(ramp[ramp.length - 1], 0xc4d270, 0.45);
    const seed = o.seed;
    const N = this.occ.length;
    // Height span of the filled cells (the tone climbs over it).
    let lo = ny;
    let hi = -1;
    for (let j = 0; j < ny; j++)
      for (let q = j * w * w, e = q + w * w; q < e; q++)
        if (this.occ[q]) {
          lo = Math.min(lo, j);
          hi = Math.max(hi, j);
          break;
        }
    if (hi < 0) return 0;
    const span = Math.max(1, hi - lo);
    // Pass 1: every shell cell's colour, shade and open faces.
    const col = new Uint32Array(N);
    const sha = new Float32Array(N);
    const faces = new Uint8Array(N);
    const done = new Uint8Array(N);
    const info: CellInfo = { x: 0, y: 0, z: 0, top: false, under: false, exposure: 0, t: 0, color: 0, tuft: false };
    for (let j = lo; j <= hi; j++)
      for (let k = -n; k <= n; k++)
        for (let i = -n; i <= n; i++) {
          if (!this.at(i, j, k)) continue;
          const f =
            (this.at(i + 1, j, k) ? 0 : 1) |
            (this.at(i - 1, j, k) ? 0 : 2) |
            (this.at(i, j + 1, k) ? 0 : 4) |
            (this.at(i, j - 1, k) ? 0 : 8) |
            (this.at(i, j, k + 1) ? 0 : 16) |
            (this.at(i, j, k - 1) ? 0 : 32);
          if (!f) continue;
          let open = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dz = -1; dz <= 1; dz++)
              for (let dx = -1; dx <= 1; dx++) {
                const m = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
                if (m === 0 || this.at(i + dx, j + dy, k + dz)) continue;
                open += m === 1 ? W1 : m === 2 ? W2 : W3;
              }
          const exposure = open / TOTAL_W;
          const t = (j - lo) / span;
          const x = this.cx(i);
          const y = this.cy(j);
          const z = k * c;
          const top = (f & 4) !== 0;
          const under = (f & 8) !== 0 && !top;
          // Clusters: light and shade in patches a metre or two across, as leaves bunch on their twigs.
          const cluster = valueNoise3(x * 0.62, y * 0.62, z * 0.62, seed + 51) - 0.5;
          let sh = 1 + 0.3 * Math.max(-0.7, Math.min(0.45, (exposure - 0.305) * 2));
          if (this.at(i, j + 2, k) || this.at(i, j + 3, k)) sh *= 0.9;
          sh *= 1 + (hash3(i, j, k, seed + 9) - 0.5) * 0.1 + cluster * 0.22;
          sh *= 0.88 + 0.22 * t;
          let tn = 0.4 + t * 2.1 * lift + (top ? 0.8 : 0) + (exposure - 0.3) * 2.5 + (valueNoise3(i * 0.6, j * 0.6, k * 0.6, seed) - 0.5) * 1.2 + cluster * 2.6;
          if (under) tn -= 0.9;
          const ti = Math.max(0, Math.min(ramp.length - 1, Math.floor(tn)));
          let cc = ramp[ti];
          // The sun on the upper tops: a lit yellow-green sheen.
          if (top && t > 0.45) {
            cc = mix(cc, sun, Math.min(0.4, (t - 0.45) * 0.7 + Math.max(0, cluster) * 0.5));
            sh *= 1.06;
          }
          if (o.paint) {
            info.x = x;
            info.y = y;
            info.z = z;
            info.top = top;
            info.under = under;
            info.exposure = exposure;
            info.t = t;
            info.color = cc;
            info.tuft = false;
            const p = o.paint(info);
            if (p !== null) cc = p;
          }
          const q = this.idx(i, j, k);
          col[q] = cc;
          sha[q] = sh;
          faces[q] = f;
        }
    let drawn = 0;
    // Pass 2: bigger leaf masses: full 2 × 2 × 2 groups (on a grid shifted by the seed) that show at the surface.
    const pi = seed & 1;
    const pj = (seed >> 1) & 1;
    const pk = (seed >> 2) & 1;
    for (let j = lo - pj; j <= hi; j += 2)
      for (let k = -n - pk; k <= n; k += 2)
        for (let i = -n - pi; i <= n; i += 2) {
          if (hash3(i, j, k, seed + 61) >= mergeShare) continue;
          let full = true;
          let shell = 0;
          let topQ = -1;
          let shSum = 0;
          for (let dj = 0; dj < 2 && full; dj++)
            for (let dk = 0; dk < 2 && full; dk++)
              for (let di = 0; di < 2; di++) {
                if (!this.at(i + di, j + dj, k + dk)) {
                  full = false;
                  break;
                }
                const q = this.idx(i + di, j + dj, k + dk);
                if (faces[q]) {
                  shell++;
                  shSum += sha[q];
                  if (topQ < 0 || dj === 1) topQ = q;
                }
              }
          if (!full || shell === 0) continue;
          for (let dj = 0; dj < 2; dj++) for (let dk = 0; dk < 2; dk++) for (let di = 0; di < 2; di++) done[this.idx(i + di, j + dj, k + dk)] = 1;
          const h1 = hash3(i, j, k, seed + 67);
          const h2 = hash3(i, j, k, seed + 71);
          const h3 = hash3(i, j, k, seed + 73);
          const s2 = 2 * c;
          b.box(this.cx(i) + c / 2 + (h1 - 0.5) * c * 0.4, this.cy(j) + c / 2 + (h2 - 0.5) * c * 0.3, k * c + c / 2 + (h3 - 0.5) * c * 0.4, s2 * (0.96 + h2 * 0.2), s2 * (0.84 + h3 * 0.2), s2 * (0.96 + h1 * 0.2), col[topQ], 'mapLeaf', {
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
      for (let k = -n; k <= n; k++)
        for (let i = -n; i <= n; i++) {
          if (!this.at(i, j, k)) continue;
          const q = this.idx(i, j, k);
          const f = faces[q];
          if (!f) continue;
          const x = this.cx(i);
          const y = this.cy(j);
          const z = k * c;
          const sh = sha[q];
          if (!done[q]) {
            const h1 = hash3(i, j, k, seed + 81);
            const h2 = hash3(i, j, k, seed + 83);
            const h3 = hash3(i, j, k, seed + 87);
            // (a lone cell sticking out sits a bit lower and smaller: a hanging bunch, not a cube)
            // (sizes in clusters: some patches of small leaves, some of bigger; each overlaps its neighbours, no seams)
            const big = valueNoise3(x * 0.9, y * 0.9, z * 0.9, seed + 91);
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
          const sides: number[] = [];
          if (f & 1) sides.push(0);
          if (f & 2) sides.push(1);
          if (f & 16) sides.push(2);
          if (f & 32) sides.push(3);
          if (f & 4) sides.push(4, 4);
          if (f & 8 && !(f & 4)) sides.push(5);
          if (!sides.length) continue;
          const s = sides[Math.floor(h * sides.length)];
          const ts = ts0 * (0.7 + hash3(i, j, k, seed + 47) * 0.85);
          const out = c / 2 + ts / 2 - ts * 0.4;
          const jx = (hash3(i, j, k, seed + 41) - 0.5) * c * 0.6;
          const jz = (hash3(i, j, k, seed + 43) - 0.5) * c * 0.6;
          const tx = s === 0 ? out : s === 1 ? -out : jx;
          const tz = s === 2 ? out : s === 3 ? -out : jz;
          const ty = s === 4 ? out : s === 5 ? -out : jx * 0.5;
          // (a tuft is lighter than its cell, or darker hanging under the crown; up top, the sun on it)
          const base = col[q];
          let tc = s === 5 ? mix(base, ramp[0], 0.3) : s === 4 ? mix(base, sun, 0.35) : mix(base, ramp[ramp.length - 1], 0.3);
          if (o.paint) {
            info.x = x + tx;
            info.y = y + ty;
            info.z = z + tz;
            info.top = s === 4;
            info.under = s === 5;
            info.t = (j - lo) / span;
            info.color = tc;
            info.tuft = true;
            const p = o.paint(info);
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
    return drawn;
  }
}
