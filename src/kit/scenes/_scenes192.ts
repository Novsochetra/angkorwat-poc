import { Euler, Matrix4 } from 'three';
import { hash3, valueNoise3 } from '../../voxel/random';
import type { Surf } from '../../voxel/VoxelBuilder';
import { crumble, JOINT, layWall, type V3, type WallOptions } from '../assets/19.2/_damage-b';
import type { BlockSet, BlockStyle } from '../BlockSet';
import { commitGrass, ghostGround, grassGrid, grassTuft, GRASS_TONES, type GrassTones } from '../lib/grass';
import { fromSheet, SANDSTONE, SOIL } from '../palette';
import type { PieceBuilder } from '../PieceBuilder';
import { here, TEXEL } from '../shapes';
import { leafSurf, soilSurf, STONE_FINISH, stoneSurf, surfMax } from '../surface';

/**
 * Shared masonry of the §19.2 combination / usage examples: temple walls laid
 * dry in the kit's sandstone courses — each stone a texel short of the next,
 * the joints filled dark a texel back, as on the §19.2 cards — then damaged the
 * ways the sheet shows: stones left out (missing blocks, a collapse), worn into
 * clusters of small cubes (eroded edges), broken away in ledges (broken
 * corners), split by stepped cracks, chipped. Stones take the §19.1 finishes in
 * patches, and moss gathers on the ledges.
 */
const T = TEXEL;
/** Metres → texel index. */
const ti = (v: number) => Math.round(v / T);
/** Snap to the 1/8 m damage step (chunky, like the sheet's pixels). */
const q8 = (v: number) => Math.round(v * 8) / 8;

/** A stone's colour and look. */
export interface Look {
  color: number;
  style: BlockStyle;
}

export type LookAt = (x: number, y: number, z: number) => Look;

export type Finish = 'clean' | 'warm' | 'dark' | 'cracked' | 'weathered' | 'mossy';

/** Does stone survive at (x, y, z) (metres)? */
export type Keep = (x: number, y: number, z: number) => boolean;

/** Mix two sRGB colours (t = 0 → a). */
function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s;
  return ch(16) | ch(8) | ch(0);
}

/**
 * Faces a break opened: the fresh sandstone under the skin — on old, dark
 * stone mostly grimed over again, so a break reads as rough stone of the same
 * family rather than a pale scar.
 */
const RAW: Record<Finish, readonly number[]> = {
  clean: SANDSTONE.broken,
  warm: SANDSTONE.broken.map((c, i) => mix(c, SANDSTONE.warm[i], 0.3)),
  cracked: SANDSTONE.broken,
  weathered: SANDSTONE.broken.map((c, i) => mix(c, SANDSTONE.weathered[i], 0.6)),
  dark: SANDSTONE.broken.map((c, i) => mix(c, SANDSTONE.dark[i], 0.65)),
  mossy: SANDSTONE.broken.map((c, i) => mix(c, SANDSTONE.mossy[i], 0.6)),
};

/** The stone at the back of a hole, deep in shadow (a stone's colour pulled most of the way to the cavity dark, #211d15 on the sheet). */
export const hollow = (color: number): number => mix(color, SANDSTONE.cavity[1], 0.8);

/** The dark walls of a crack (the sheet's black lines between lit lips). */
const CRACK_WALL = SANDSTONE.cavity;

/**
 * A stone of a §19.1 finish at (x, y, z): one of the finish's tones (picked by
 * position), its pattern with `extra` on top (more moss, stain…), and fresh
 * stone where it breaks.
 */
export function finishLook(f: Finish, x: number, y: number, z: number, seed: number, extra?: Surf): Look {
  const fin = STONE_FINISH[f];
  const color = fin.palette[Math.floor(hash3(ti(x), ti(y), ti(z), seed) * fin.palette.length)];
  return { color, style: { surf: extra ? surfMax(fin.surf, extra) : fin.surf, broken: RAW[f] } };
}

/** Value noise in 0‥1 at metre coordinates, features about `size` metres across. */
export const noise = (x: number, y: number, z: number, size: number, seed: number): number => valueNoise3(x / size, y / size, z / size, seed);

/** A ledged break (see {@link Ruin.breakAway}). */
export interface BreakSpec {
  /** Where the break is widest: a point on a top arris or corner (metres). */
  at: V3;
  /** Reach into the stone along x and z at the widest ledge (metres). */
  reach: [number, number];
  /** Depth of the break below `at` (metres). */
  below: number;
  /** Ledges over that depth (default 3). */
  ledges?: number;
  /** How far the ledge rims wander (0‥1, default 0.3). */
  rough?: number;
}

/** A crack (see {@link Ruin.crack}). */
export interface CrackSpec {
  /** Face the line is drawn on: front (x, y) cut through z, side (z, y) through x, top (x, z) down through y. */
  on: 'front' | 'side' | 'top';
  from: [number, number];
  to: [number, number];
  /** Extent through the stone along the third axis (metres). */
  through: [number, number];
  /** Sideways wander in texels (default 2). */
  wander?: number;
}

/** A box in texels: [i0, j0, k0, i1, j1, k1], max exclusive. */
type TBox = [number, number, number, number, number, number];

/** A laid block: a stone, a piece of a worn one, or joint fill. */
interface Block {
  box: TBox;
  look: Look;
  joint: boolean;
  /** Damage has cut cells out of it: emitted cell by cell. */
  carved: boolean;
}

/** Per-cell look of a damaged stone while it is merged into boxes. */
const EMPTY = -2;
const HIDDEN = -1;
const N6: V3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * A ruin's masonry on a dense texel grid. Plan stones (by hand or in
 * courses), leave some out, lay them dry (worn stones crumble into cubes),
 * then break, crack and chip them, and emit: an intact stone is one rounded
 * block; a damaged one its remaining cells in runs that still read as one
 * stone, the faces the damage opened in rough, fresh stone (or dark, in a
 * crack) — like `BlockSet.emit`, at a fraction of its cost for a whole wall.
 */
export class Ruin {
  private readonly plan: { box: TBox; look: Look }[] = [];
  private readonly blocks: Block[] = [];
  private lo: V3 = [0, 0, 0];
  private n: V3 = [0, 0, 0];
  /** Block owning each cell (−1 = air). */
  private own = new Int32Array(0);
  /** Cells damage cut away: 1 from a stone, 2 from joint fill. */
  private gone = new Uint8Array(0);
  /** Where damage was cut (texel boxes), to tidy the joint fill it laid bare. */
  private readonly damage: TBox[] = [];

  constructor(private readonly look: LookAt) {}

  /** One stone from min / max corners (metres). */
  stone(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, look?: Look): void {
    const box: TBox = [ti(Math.min(x0, x1)), ti(Math.min(y0, y1)), ti(Math.min(z0, z1)), ti(Math.max(x0, x1)), ti(Math.max(y0, y1)), ti(Math.max(z0, z1))];
    if (box[3] <= box[0] || box[4] <= box[1] || box[5] <= box[2]) return;
    this.plan.push({ box, look: look ?? this.look((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2) });
  }

  /**
   * A box volume (metres) laid in courses of running bond: `course` high (a
   * height, or a list bottom first), stones `length` long along `axis` (default
   * the longer side), in skins at most `depth` deep (default 0.5 m).
   */
  courses(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o: { length: [number, number]; course?: number | readonly number[]; depth?: number; axis?: 'x' | 'z'; seed: number; look?: LookAt }): void {
    const axis = o.axis ?? (x1 - x0 >= z1 - z0 ? 'x' : 'z');
    const [a0, a1] = axis === 'x' ? [x0, x1] : [z0, z1];
    const [d0, d1] = axis === 'x' ? [z0, z1] : [x0, x1];
    let heights: readonly number[];
    if (typeof o.course === 'object') heights = o.course;
    else {
      const count = Math.max(1, Math.round((y1 - y0) / (o.course ?? 0.5)));
      heights = Array<number>(count).fill((y1 - y0) / count);
    }
    const skins = Math.max(1, Math.ceil((d1 - d0) / (o.depth ?? 0.5) - 1e-6));
    const [l0, l1] = o.length;
    let y = y0;
    heights.forEach((h, c) => {
      for (let s = 0; s < skins; s++) {
        const sd0 = d0 + ((d1 - d0) * s) / skins;
        const sd1 = d0 + ((d1 - d0) * (s + 1)) / skins;
        const put = (p0: number, p1: number) => {
          const [bx0, bx1, bz0, bz1] = axis === 'x' ? [p0, p1, sd0, sd1] : [sd0, sd1, p0, p1];
          this.stone(bx0, y, bz0, bx1, y + h, bz1, o.look?.((bx0 + bx1) / 2, y + h / 2, (bz0 + bz1) / 2));
        };
        let a = a0;
        // Running bond: every other course (and skin) starts with a part stone.
        const off = (c + s) % 2 ? q8(((l0 + l1) / 4) * (0.8 + 0.4 * hash3(c, s, 1, o.seed))) : 0;
        if (off > 0 && off < a1 - a0 - l0 * 0.5) {
          put(a, a + off);
          a += off;
        }
        for (let n = 0; a < a1 - 1e-6; n++) {
          let len = Math.max(0.125, q8(l0 + (l1 - l0) * hash3(c, s, n, o.seed + 3)));
          if (a1 - (a + len) < l0 * 0.5) len = a1 - a;
          put(a, a + len);
          a += len;
        }
      }
      y += h;
    });
  }

  /** Leave out the planned stones whose centre passes `where` (missing blocks, a collapse). */
  omit(where: (x: number, y: number, z: number) => boolean): void {
    for (let n = this.plan.length - 1; n >= 0; n--) {
      const b = this.plan[n].box;
      if (where(((b[0] + b[3]) / 2) * T, ((b[1] + b[4]) / 2) * T, ((b[2] + b[5]) / 2) * T)) this.plan.splice(n, 1);
    }
  }

  /** Grid index of texel cell (i, j, k), −1 outside the grid. */
  private at(i: number, j: number, k: number): number {
    const [a, b, c] = [i - this.lo[0], j - this.lo[1], k - this.lo[2]];
    return a < 0 || b < 0 || c < 0 || a >= this.n[0] || b >= this.n[1] || c >= this.n[2] ? -1 : (a * this.n[1] + b) * this.n[2] + c;
  }

  /**
   * Lay the plan dry: a stone that meets another on its +x or +y side (or is
   * covered by others all over its +z side: the skins of a wall) stops a
   * texel short of it, and the joint is filled with dark stone a texel back
   * from the air — the §19.2 cards' dark joint lines between rounded stones. Where `wear` says stone is gone, the stone crumbles into cubes
   * (the sheet's worn edges: clusters of smaller rounded cubes), restyled by
   * `piece`; the joint fill stays a texel inside what survives.
   */
  lay(o: { wear?: Keep; piece?: (x: number, y: number, z: number) => BlockStyle; mortar?: Surf } = {}): void {
    if (!this.plan.length) return;
    const lo: V3 = [Infinity, Infinity, Infinity];
    const hi: V3 = [-Infinity, -Infinity, -Infinity];
    for (const { box } of this.plan)
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a], box[a] - 2);
        hi[a] = Math.max(hi[a], box[a + 3] + 2);
      }
    this.lo = lo;
    this.n = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    const size = this.n[0] * this.n[1] * this.n[2];
    const [sy, sz] = [this.n[1] * this.n[2], this.n[2]];
    /** Visit the rows of a texel box: grid index ranges [a, e) along z. */
    const rows = (b: TBox, f: (a: number, e: number) => void) => {
      for (let i = b[0], mi = this.at(b[0], b[1], b[2]); i < b[3]; i++, mi += sy) for (let j = b[1], mj = mi; j < b[4]; j++, mj += sz) f(mj, mj + b[5] - b[2]);
    };
    // Who planned each cell, then each stone cut a texel short where it meets another.
    const planned = new Int32Array(size).fill(-1);
    this.plan.forEach(({ box }, s) =>
      rows(box, (a, e) => {
        for (let m = a; m < e; m++) if (planned[m] < 0) planned[m] = s;
      }),
    );
    // The cells a cut takes off a stone are where its joints run.
    const joints: number[] = [];
    const cut = this.plan.map(({ box: b }, s): TBox => {
      const c: TBox = [...b];
      for (let ax = 0; ax < 3; ax++) {
        const layer: TBox = [...b];
        layer[ax] = b[ax + 3];
        layer[ax + 3] = b[ax + 3] + 1;
        let some = false;
        let all = true;
        rows(layer, (a, e) => {
          for (let m = a; m < e; m++)
            if (planned[m] >= 0 && planned[m] !== s) some = true;
            else all = false;
        });
        // (towards the viewer only where covered all over: a stone behind a pillar keeps its face)
        if (!(ax < 2 ? some : all)) continue;
        c[ax + 3]--;
        layer[ax] = c[ax + 3];
        layer[ax + 3] = c[ax + 3] + 1;
        rows(layer, (a, e) => {
          for (let m = a; m < e; m++) if (planned[m] === s) joints.push(m);
        });
      }
      return c;
    });
    // The joint fill: joint cells with stone or joint on every side (a texel back from the air).
    const fill = new Uint8Array(size);
    for (const m of joints) if (planned[m + 1] >= 0 && planned[m - 1] >= 0 && planned[m + sz] >= 0 && planned[m - sz] >= 0 && planned[m + sy] >= 0 && planned[m - sy] >= 0) fill[m] = 1;
    // Stones go in whole or worn into cubes; where they wore, marked on a coarse (1/2 m) map.
    const wear = o.wear;
    const coarse = (i: number, j: number, k: number) => ((((i - lo[0]) >> 3) * ((this.n[1] >> 3) + 1) + ((j - lo[1]) >> 3)) * ((this.n[2] >> 3) + 1) + ((k - lo[2]) >> 3));
    const worn = new Uint8Array(((this.n[0] >> 3) + 1) * ((this.n[1] >> 3) + 1) * ((this.n[2] >> 3) + 1));
    cut.forEach((c, s) => {
      if (c[3] <= c[0] || c[4] <= c[1] || c[5] <= c[2] || !this.add(c, this.plan[s].look, false, wear, o.piece)) return;
      for (let i = c[0] - 1; i <= c[3]; i += 4) for (let j = c[1] - 1; j <= c[4]; j += 4) for (let k = c[2] - 1; k <= c[5]; k += 4) worn[coarse(i, j, k)] = 1;
    });
    // The fill merged into slabs; near worn stone it stays a texel inside what survives.
    const mortar: Look = { color: JOINT, style: { surf: o.mortar ?? stoneSurf({ moss: 0.3 }), broken: null } };
    const inner: Keep | undefined = wear && ((x, y, z) => wear(x, y, z) && N6.every(([dx, dy, dz]) => wear(x + dx * T, y + dy * T, z + dz * T)));
    for (const m of Int32Array.from(joints).sort()) {
      if (fill[m] !== 1) continue;
      const [i, j, k] = [Math.floor(m / sy) + lo[0], (Math.floor(m / sz) % this.n[1]) + lo[1], (m % sz) + lo[2]];
      let i1 = i + 1;
      while (fill[m + (i1 - i) * sy] === 1) i1++;
      let k1 = k + 1;
      growZ: for (; ; k1++) for (let a = 0; a < i1 - i; a++) if (fill[m + a * sy + (k1 - k)] !== 1) break growZ;
      let j1 = j + 1;
      growY: for (; ; j1++) for (let a = 0; a < i1 - i; a++) for (let c = 0; c < k1 - k; c++) if (fill[m + a * sy + (j1 - j) * sz + c] !== 1) break growY;
      const slab: TBox = [i, j, k, i1, j1, k1];
      rows(slab, (a, e) => fill.fill(2, a, e));
      let near = false;
      if (inner) for (let a = i - 1; a <= i1 && !near; a += 4) for (let b = j - 1; b <= j1 && !near; b += 4) for (let c = k - 1; c <= k1 && !near; c += 4) near = worn[coarse(a, b, c)] === 1;
      this.add(slab, mortar, true, near ? inner : undefined);
    }
    // (the planning grid, done with, now says which block owns each cell)
    this.own = planned.fill(-1);
    this.gone = new Uint8Array(size);
    this.blocks.forEach(({ box }, id) => rows(box, (a, e) => this.own.fill(id, a, e)));
  }

  /**
   * Add a block, crumbled where `keep` fails: tested in 1/8 m cells, the
   * intact stone round the damage is peeled off in whole slabs and the damaged
   * box goes in as its surviving cubes, whole 2 × 2 × 2 groups as one.
   * Returns whether it crumbled.
   */
  private add(box: TBox, look: Look, joint: boolean, keep?: Keep, piece?: (x: number, y: number, z: number) => BlockStyle): boolean {
    // Cell edges along each axis, two texels apart (the last may be one).
    const edges = (a: number) => {
      const e: number[] = [];
      for (let v = box[a]; v < box[a + 3]; v += 2) e.push(v);
      e.push(box[a + 3]);
      return e;
    };
    const [ex, ey, ez] = [edges(0), edges(1), edges(2)];
    const n = [ex.length - 1, ey.length - 1, ez.length - 1];
    const put = (i0: number, j0: number, k0: number, i1: number, j1: number, k1: number, cube: boolean) => {
      const bx: TBox = [ex[i0], ey[j0], ez[k0], ex[i1], ey[j1], ez[k1]];
      const style = cube && piece ? { ...look.style, ...piece(((bx[0] + bx[3]) / 2) * T, ((bx[1] + bx[4]) / 2) * T, ((bx[2] + bx[5]) / 2) * T) } : look.style;
      this.blocks.push({ box: bx, look: style === look.style ? look : { color: look.color, style }, joint, carved: false });
    };
    const idx = (i: number, j: number, k: number) => (i * n[1] + j) * n[2] + k;
    let gone: Uint8Array | null = null;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-1, -1, -1];
    if (keep)
      for (let i = 0; i < n[0]; i++)
        for (let j = 0; j < n[1]; j++)
          for (let k = 0; k < n[2]; k++) {
            if (keep(((ex[i] + ex[i + 1]) / 2) * T, ((ey[j] + ey[j + 1]) / 2) * T, ((ez[k] + ez[k + 1]) / 2) * T)) continue;
            (gone ??= new Uint8Array(n[0] * n[1] * n[2]))[idx(i, j, k)] = 1;
            lo[0] = Math.min(lo[0], i);
            lo[1] = Math.min(lo[1], j);
            lo[2] = Math.min(lo[2], k);
            hi[0] = Math.max(hi[0], i);
            hi[1] = Math.max(hi[1], j);
            hi[2] = Math.max(hi[2], k);
          }
    if (!gone) {
      put(0, 0, 0, n[0], n[1], n[2], false);
      return false;
    }
    const cut = gone;
    // Peel whole slabs off round the damage, along its thinnest axis first.
    const b0 = [0, 0, 0];
    const b1 = [...n];
    for (const a of [0, 1, 2].sort((p, q) => (hi[p] - lo[p] + 1) / n[p] - (hi[q] - lo[q] + 1) / n[q])) {
      if (lo[a] > b0[a]) {
        const top = [...b1];
        top[a] = lo[a];
        put(b0[0], b0[1], b0[2], top[0], top[1], top[2], false);
      }
      if (hi[a] + 1 < b1[a]) {
        const bot = [...b0];
        bot[a] = hi[a] + 1;
        put(bot[0], bot[1], bot[2], b1[0], b1[1], b1[2], false);
      }
      b0[a] = lo[a];
      b1[a] = hi[a] + 1;
    }
    // The damaged box as its surviving cubes, whole 2 × 2 × 2 groups as one.
    for (let i = b0[0]; i < b1[0]; i += 2)
      for (let j = b0[1]; j < b1[1]; j += 2)
        for (let k = b0[2]; k < b1[2]; k += 2) {
          const [i1, j1, k1] = [Math.min(i + 2, b1[0]), Math.min(j + 2, b1[1]), Math.min(k + 2, b1[2])];
          let whole = true;
          for (let a = i; a < i1; a++) for (let b = j; b < j1; b++) for (let c = k; c < k1; c++) if (cut[idx(a, b, c)]) whole = false;
          if (whole) put(i, j, k, i1, j1, k1, true);
          else for (let a = i; a < i1; a++) for (let b = j; b < j1; b++) for (let c = k; c < k1; c++) if (!cut[idx(a, b, c)]) put(a, b, c, a + 1, b + 1, c + 1, true);
        }
    return true;
  }

  /** Cut grid cell m out of its block (damage). */
  private cut(m: number): void {
    if (m < 0 || this.own[m] < 0) return;
    const bl = this.blocks[this.own[m]];
    bl.carved = true;
    this.gone[m] = bl.joint ? 2 : 1;
    this.own[m] = -1;
  }

  /** Cut away the cells inside `min`‥`max` (metres) whose centre passes `pred`. */
  private carve(pred: (x: number, y: number, z: number) => boolean, min: V3, max: V3): void {
    const b: TBox = [Math.floor(min[0] / T), Math.floor(min[1] / T), Math.floor(min[2] / T), Math.ceil(max[0] / T), Math.ceil(max[1] / T), Math.ceil(max[2] / T)];
    for (let i = b[0]; i < b[3]; i++)
      for (let j = b[1]; j < b[4]; j++)
        for (let k = b[2]; k < b[5]; k++) {
          const m = this.at(i, j, k);
          if (m >= 0 && this.own[m] >= 0 && pred((i + 0.5) * T, (j + 0.5) * T, (k + 0.5) * T)) this.cut(m);
        }
    this.damage.push(b);
  }

  /**
   * Break stone away in ledges, like the sheet's broken corner: the reach into
   * the stone shrinks ledge by ledge below `at`, each rim wandering, decided per
   * 1/8 m step so the break is drawn in the sheet's chunky pixels; a lower
   * ledge never undercuts the one above it.
   */
  breakAway(o: BreakSpec, seed: number): void {
    const [cx, cy, cz] = o.at;
    const ledges = o.ledges ?? 3;
    const rough = o.rough ?? 0.3;
    const inside = (x: number, z: number, t: number) => {
      const f = Math.pow(1 - t / ledges, 0.7);
      const dx = (x - cx) / (o.reach[0] * f);
      const dz = (z - cz) / (o.reach[1] * f);
      const d = Math.hypot(dx, dz) || 1;
      const w = valueNoise3((dx / d) * 2.2 + 3, (dz / d) * 2.2 + 3, t * 7.3, seed) * 0.8 + valueNoise3((dx / d) * 5 + 9, (dz / d) * 5 + 9, t * 7.3, seed + 1) * 0.2;
      return Math.cbrt(Math.abs(dx) ** 3 + Math.abs(dz) ** 3) < 1 + (w - 0.5) * 2 * rough;
    };
    const steps = new Map<number, boolean>();
    this.carve(
      (fx, fy, fz) => {
        const [i, j, k] = [Math.floor(fx * 8), Math.floor(fy * 8), Math.floor(fz * 8)];
        const key = ((i + 512) * 1024 + j + 512) * 1024 + k + 512;
        let cut = steps.get(key);
        if (cut === undefined) {
          const [x, y, z] = [(i + 0.5) / 8, (j + 0.5) / 8, (k + 0.5) / 8];
          const h = Math.max(0, (cy - y) / o.below);
          const t = Math.max(0, Math.min(ledges - 1, Math.floor(h * ledges + (valueNoise3(x * 3, 0.5, z * 3, seed + 3) - 0.5) * 0.3)));
          cut = false;
          if (h < 1) for (let u = t; u < ledges && !cut; u++) cut = inside(x, z, u);
          steps.set(key, cut);
        }
        return cut;
      },
      [cx - o.reach[0] * 1.5, cy - o.below, cz - o.reach[1] * 1.5],
      [cx + o.reach[0] * 1.5, cy, cz + o.reach[1] * 1.5],
    );
  }

  /**
   * A crack: a stair-stepped line a texel wide drawn on a face and cut through
   * the stone, wandering sideways; the stones it splits get dark crack walls.
   */
  crack(o: CrackSpec, seed: number): void {
    const [u0, v0] = [o.from[0] / T, o.from[1] / T];
    const [u1, v1] = [o.to[0] / T, o.to[1] / T];
    const alongV = Math.abs(v1 - v0) >= Math.abs(u1 - u0);
    const len = Math.max(1, Math.ceil(Math.max(Math.abs(u1 - u0), Math.abs(v1 - v0))));
    const wander = o.wander ?? 2;
    const line = new Set<number>();
    const key = (u: number, v: number) => (u + 4096) * 8192 + v + 4096;
    let prev: [number, number] | null = null;
    for (let s = 0; s <= len; s++) {
      const t = s / len;
      const w = (valueNoise3(s * 0.21, 0.5, 0.5, seed) - 0.5) * 2 * wander * Math.sqrt(Math.sin(Math.PI * t));
      const cu = Math.floor(u0 + (u1 - u0) * t + (alongV ? w : 0));
      const cv = Math.floor(v0 + (v1 - v0) * t + (alongV ? 0 : w));
      // Join the last cell by a stair: across first, then along.
      if (prev) {
        let [pu, pv]: [number, number] = prev;
        while (pu !== cu) line.add(key((pu += Math.sign(cu - pu)), pv));
        while (pv !== cv) line.add(key(pu, (pv += Math.sign(cv - pv))));
      }
      line.add(key(cu, cv));
      prev = [cu, cv];
    }
    const axes = o.on === 'front' ? [0, 1, 2] : o.on === 'side' ? [2, 1, 0] : [0, 2, 1];
    const lo: V3 = [0, 0, 0];
    const hi: V3 = [0, 0, 0];
    lo[axes[0]] = (Math.min(u0, u1) - wander - 2) * T;
    hi[axes[0]] = (Math.max(u0, u1) + wander + 2) * T;
    lo[axes[1]] = (Math.min(v0, v1) - wander - 2) * T;
    hi[axes[1]] = (Math.max(v0, v1) + wander + 2) * T;
    lo[axes[2]] = Math.min(...o.through);
    hi[axes[2]] = Math.max(...o.through);
    const on = (x: number, y: number, z: number) => {
      const p = [x, y, z];
      return line.has(key(Math.floor(p[axes[0]] / T), Math.floor(p[axes[1]] / T)));
    };
    // Dark walls for the stones it splits (cells on the line, inside the stone).
    const split = new Set<number>();
    const b: TBox = [Math.floor(lo[0] / T), Math.floor(lo[1] / T), Math.floor(lo[2] / T), Math.ceil(hi[0] / T), Math.ceil(hi[1] / T), Math.ceil(hi[2] / T)];
    for (let i = b[0]; i < b[3]; i++)
      for (let j = b[1]; j < b[4]; j++)
        for (let k = b[2]; k < b[5]; k++) {
          const m = this.at(i, j, k);
          if (m >= 0 && this.own[m] >= 0 && on((i + 0.5) * T, (j + 0.5) * T, (k + 0.5) * T)) split.add(this.own[m]);
        }
    for (const id of split) {
      const bl = this.blocks[id];
      if (!bl.joint) bl.look = { color: bl.look.color, style: { ...bl.look.style, broken: CRACK_WALL } };
    }
    this.carve(on, lo, hi);
  }

  /**
   * Knock chips a step (1/8 m) big off the exposed edges and corners inside
   * `min`‥`max` (metres) where `where` allows — worn, nicked arrises.
   */
  nick(amount: number, seed: number, min: V3, max: V3, where: (x: number, y: number, z: number) => boolean = () => true): void {
    // In steps of two texels; a step is stone where its centre texel is.
    const solid = (a: number, b: number, c: number) => {
      if (b < 0) return true;
      const m = this.at(2 * a + 1, 2 * b + 1, 2 * c + 1);
      return m >= 0 && this.own[m] >= 0;
    };
    const drop: V3[] = [];
    const [a0, b0, c0] = [Math.floor(min[0] * 8), Math.floor(min[1] * 8), Math.floor(min[2] * 8)];
    const [a1, b1, c1] = [Math.ceil(max[0] * 8), Math.ceil(max[1] * 8), Math.ceil(max[2] * 8)];
    for (let a = a0; a < a1; a++)
      for (let b = b0; b < b1; b++)
        for (let c = c0; c < c1; c++) {
          if (!solid(a, b, c)) continue;
          const open = +!solid(a + 1, b, c) + +!solid(a - 1, b, c) + +!solid(a, b + 1, c) + +!solid(a, b - 1, c) + +!solid(a, b, c + 1) + +!solid(a, b, c - 1);
          if (open < 2 || !where((a + 0.5) / 8, (b + 0.5) / 8, (c + 0.5) / 8)) continue;
          if (hash3(a, b, c, seed + 31) < amount * (open >= 3 ? 0.9 : 0.45) * valueNoise3(a * 0.5, b * 0.5, c * 0.5, seed) * 1.4) drop.push([a, b, c]);
        }
    for (const [a, b, c] of drop)
      for (let i = 2 * a; i < 2 * a + 2; i++)
        for (let j = 2 * b; j < 2 * b + 2; j++)
          for (let k = 2 * c; k < 2 * c + 2; k++) this.cut(this.at(i, j, k));
    if (drop.length) this.damage.push([2 * a0, 2 * b0, 2 * c0, 2 * a1, 2 * b1, 2 * c1]);
  }

  /** Restyle the laid blocks whose centre passes `where` (the shadowed stones at the back of a hole…). */
  restyle(where: (x: number, y: number, z: number) => boolean, style: BlockStyle, color?: (c: number) => number): void {
    for (const id of this.find(where)) {
      const bl = this.blocks[id];
      bl.look = { color: color ? color(bl.look.color) : bl.look.color, style: { ...bl.look.style, ...style } };
    }
  }

  find(pred: (x: number, y: number, z: number, id: number) => boolean): number[] {
    const out: number[] = [];
    this.blocks.forEach(({ box: b }, id) => {
      if (pred(((b[0] + b[3]) / 2) * T, ((b[1] + b[4]) / 2) * T, ((b[2] + b[5]) / 2) * T, id)) out.push(id);
    });
    return out;
  }

  boxOf(id: number): { min: V3; max: V3 } {
    const b = this.blocks[id].box;
    return { min: [b[0] * T, b[1] * T, b[2] * T], max: [b[3] * T, b[4] * T, b[5] * T] };
  }

  solidAt(x: number, y: number, z: number): boolean {
    const m = this.at(Math.floor(x / T), Math.floor(y / T), Math.floor(z / T));
    return m >= 0 && this.own[m] >= 0;
  }

  /** Texel cells of stone with air above (the ledges moss can take), in x, y, z order. */
  tops(): V3[] {
    const out: V3[] = [];
    const sz = this.n[2];
    for (let i = 0, m = 0; i < this.n[0]; i++) for (let j = 0; j < this.n[1]; j++) for (let k = 0; k < this.n[2]; k++, m++) if (this.own[m] >= 0 && !(this.own[m + sz] >= 0)) out.push([i + this.lo[0], j + this.lo[1], k + this.lo[2]]);
    return out;
  }

  /**
   * Emit the stone. Joint fill that damage laid bare goes first: a break shows
   * the stones' broken faces, not slabs of dark.
   */
  emit(p: PieceBuilder, seed: number): void {
    const { own, gone, blocks } = this;
    const [sy, sz] = [this.n[1] * this.n[2], this.n[2]];
    const near = (m: number, v: number) => gone[m + 1] === v || gone[m - 1] === v || gone[m + sz] === v || gone[m - sz] === v || gone[m + sy] === v || gone[m - sy] === v;
    // A cell on the stone's old dressed skin (it faces air no damage made).
    const air = (m: number) => own[m] < 0 && gone[m] === 0;
    const skin = (m: number) => air(m + 1) || air(m - 1) || air(m + sz) || air(m - sz) || air(m + sy) || air(m - sy);
    for (const d of this.damage) {
      const bare: number[] = [];
      for (let i = d[0] - 1; i <= d[3]; i++)
        for (let j = d[1] - 1; j <= d[4]; j++)
          for (let k = d[2] - 1; k <= d[5]; k++) {
            const m = this.at(i, j, k);
            if (m >= 0 && own[m] >= 0 && blocks[own[m]].joint && near(m, 1)) bare.push(m);
          }
      for (const m of bare) this.cut(m);
    }
    const src = here();
    // Which sides of each block look into the air (for an intact block, its open faces).
    const sides = new Uint8Array(blocks.length);
    for (let m = sy; m < own.length - sy; m++) {
      const b = own[m];
      if (b >= 0) sides[b] |= (own[m + sy] < 0 ? 1 : 0) | (own[m - sy] < 0 ? 2 : 0) | (own[m + sz] < 0 ? 4 : 0) | (own[m - sz] < 0 ? 8 : 0) | (own[m + 1] < 0 ? 16 : 0) | (own[m - 1] < 0 ? 32 : 0);
    }
    blocks.forEach((bl, id) => {
      const [i0, j0, k0, i1, j1, k1] = bl.box;
      const st = bl.look.style;
      const mat = st.mat ?? 'sandstone';
      const shade = (st.shade ?? 1) * (1 + (hash3(i0, j0, k0, seed) - 0.5) * 0.16);
      if (!bl.carved) {
        // One rounded box; sides fully against other stone are not open.
        const open = sides[id];
        if (open) p.voxels.box(((i0 + i1) / 2) * T, ((j0 + j1) / 2) * T, ((k0 + k1) / 2) * T, (i1 - i0) * T, (j1 - j0) * T, (k1 - k0) * T, bl.look.color, mat, { shade, open, surf: st.surf, src });
        return;
      }
      // Its remaining cells merged greedily into the fewest boxes of one look
      // (tall first): dressed faces, or the fresh stone the damage laid bare.
      // Sides that go on into the same stone merge (no bevel), so it still
      // reads as one stone with bites out of it.
      const broken = st.broken === undefined ? SANDSTONE.broken : st.broken;
      const raw = broken ? broken[Math.floor(hash3(i0, j0, k0, seed + 5) * broken.length)] : bl.look.color;
      // Fresh breaks carry no lichen and only a trace of moss; crack walls none of either.
      const rawSurf: Surf | undefined = st.surf && [broken === CRACK_WALL ? 0 : st.surf[0] * 0.4, 0, st.surf[2], st.surf[3]];
      const [W, H, D] = [i1 - i0, j1 - j0, k1 - k0];
      const key = new Int8Array(W * H * D);
      const li = (x: number, y: number, z: number) => (x * H + y) * D + z;
      const m0 = this.at(i0, j0, k0);
      for (let x = 0; x < W; x++)
        for (let y = 0; y < H; y++)
          for (let z = 0, m = m0 + x * sy + y * sz; z < D; z++, m++) {
            if (own[m] !== id) key[li(x, y, z)] = EMPTY;
            else if (own[m + 1] >= 0 && own[m - 1] >= 0 && own[m + sz] >= 0 && own[m - sz] >= 0 && own[m + sy] >= 0 && own[m - sy] >= 0) key[li(x, y, z)] = HIDDEN;
            // Fresh stone inside the break; its lip keeps the dressed face (a
            // pale ring there reads as an outline), bar a crack's dark walls.
            else key[li(x, y, z)] = broken && (near(m, 1) || near(m, 2)) && (broken === CRACK_WALL || !skin(m)) ? 1 : 0;
          }
      const used = new Uint8Array(W * H * D);
      const fits = (x: number, y: number, z: number, K: number) => !used[li(x, y, z)] && (key[li(x, y, z)] === K || key[li(x, y, z)] === HIDDEN);
      let open = 0;
      let merge = 0;
      /** Look across one side of a box: `na` × `nb` cells from `base` in steps `sa`, `sb`. */
      const side = (base: number, na: number, sa: number, nb: number, sb: number, bit: number) => {
        for (let u = 0; u < na; u++)
          for (let v = 0; v < nb; v++) {
            const o = own[base + u * sa + v * sb];
            if (o < 0) open |= bit;
            else if (o === id) merge |= bit;
          }
      };
      for (let x = 0; x < W; x++)
        for (let z = 0; z < D; z++)
          for (let y = 0; y < H; y++) {
            const K = key[li(x, y, z)];
            if (K < 0 || used[li(x, y, z)]) continue;
            let y1 = y + 1;
            while (y1 < H && fits(x, y1, z, K)) y1++;
            let x1 = x + 1;
            growX: for (; x1 < W; x1++) for (let b = y; b < y1; b++) if (!fits(x1, b, z, K)) break growX;
            let z1 = z + 1;
            growZ: for (; z1 < D; z1++) for (let a = x; a < x1; a++) for (let b = y; b < y1; b++) if (!fits(a, b, z1, K)) break growZ;
            for (let a = x; a < x1; a++) for (let b = y; b < y1; b++) for (let c = z; c < z1; c++) used[li(a, b, c)] = 1;
            // Sides: open if any of it is air, merged if any goes on into this stone.
            const [w, h, d] = [x1 - x, y1 - y, z1 - z];
            const m = m0 + x * sy + y * sz + z;
            open = 0;
            merge = 0;
            side(m + w * sy, h, sz, d, 1, 1);
            side(m - sy, h, sz, d, 1, 2);
            side(m + h * sz, w, sy, d, 1, 4);
            side(m - sz, w, sy, d, 1, 8);
            side(m + d, w, sy, h, sz, 16);
            side(m - 1, w, sy, h, sz, 32);
            const box: TBox = [i0 + x, j0 + y, k0 + z, i0 + x1, j0 + y1, k0 + z1];
            if (open) p.voxels.box(((box[0] + box[3]) / 2) * T, ((box[1] + box[4]) / 2) * T, ((box[2] + box[5]) / 2) * T, (x1 - x) * T, (y1 - y) * T, (z1 - z) * T, K ? raw : bl.look.color, mat, { shade, open, merge, surf: K ? rawSurf : st.surf, src });
          }
    });
  }
}

/**
 * Masonry nothing damages (the back of a building, a roof): laid dry by
 * `layWall` and emitted as it stands — a box a stone, the joint fill a texel
 * back — without the grid a {@link Ruin} pays for.
 */
export function plain(p: PieceBuilder, o: WallOptions): void {
  const w = layWall(o);
  const src = here();
  for (const s of [...w.stones, ...w.joints]) p.voxels.span(...s.min, ...s.max, s.color, 'sandstone', { surf: s.style.surf, shade: s.style.shade, src });
}

/** The yellow-olive moss of the §19.2 sheet's ledges (lit tufts #e1c55a, mid #967f3a, the dark under it). */
export const LEDGE_MOSS = [0x5a6230, 0x6f7634, 0x858838, 0x9c9a40, 0xb4ad4c].map(fromSheet);
const MOSS_COAT = 0.012;
const MOSS_CUSHION = 0.028;

/** Texel cells of a block set's stone with air above, in x, y, z order. */
function setTops(set: BlockSet): V3[] {
  const solid = (i: number, j: number, k: number) => set.solidAt((i + 0.5) * T, (j + 0.5) * T, (k + 0.5) * T);
  const out: V3[] = [];
  for (const id of set.find(() => true)) {
    const { min, max } = set.boxOf(id);
    for (let i = ti(min[0]); i < ti(max[0]); i++)
      for (let k = ti(min[2]); k < ti(max[2]); k++) {
        let j = ti(max[1]) - 1;
        while (j >= ti(min[1]) && !solid(i, j, k)) j--;
        if (j >= ti(min[1]) && !solid(i, j + 1, k)) out.push([i, j, k]);
      }
  }
  return out.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
}

/**
 * Moss on the ledges of a ruin (or a block set), as the §19.2 sheet paints it:
 * patches on the upward faces where `amount` (0‥1 at a point) says — thicker
 * cushions in their middle, tones from dark to sunlit yellow-green — hanging
 * a texel or three down the open fronts below them. Thin `leaves` plates on
 * the stone, laid in runs along z of one tone and thickness.
 */
export function mossLedges(p: PieceBuilder, s: Ruin | BlockSet, amount: (x: number, y: number, z: number) => number, seed: number): void {
  const solid = (i: number, j: number, k: number) => s.solidAt((i + 0.5) * T, (j + 0.5) * T, (k + 0.5) * T);
  const surf = leafSurf({ yellow: 0.12 });
  const src = here();
  const growth = (i: number, j: number, k: number) => valueNoise3(i * 0.3, j * 0.2, k * 0.3, seed) * 0.7 + hash3(i, j, k, seed) * 0.3;
  const mossy = (i: number, j: number, k: number) => solid(i, j, k) && !solid(i, j + 1, k) && growth(i, j, k) > 1.08 - amount((i + 0.5) * T, (j + 1) * T, (k + 0.5) * T);
  const tone = (i: number, j: number, k: number, lift: number) =>
    LEDGE_MOSS[Math.max(0, Math.min(LEDGE_MOSS.length - 1, Math.floor(valueNoise3(i * 0.4, j * 0.5, k * 0.4, seed + 3) * 0.8 * LEDGE_MOSS.length + hash3(i, j, k, seed + 3) * 0.9 + lift)))];
  let run: { i: number; j: number; k: number; end: number; color: number; thick: number } | null = null;
  const flush = () => {
    if (run) p.voxels.span(run.i * T, (run.j + 1) * T, run.k * T, (run.i + 1) * T, (run.j + 1) * T + run.thick, run.end * T, run.color, 'leaves', { surf, src });
    run = null;
  };
  for (const [i, j, k] of s instanceof Ruin ? s.tops() : setTops(s)) {
    if (growth(i, j, k) <= 1.08 - amount((i + 0.5) * T, (j + 1) * T, (k + 0.5) * T)) continue;
    const inner = mossy(i + 1, j, k) && mossy(i - 1, j, k) && mossy(i, j, k + 1) && mossy(i, j, k - 1);
    const thick = inner && growth(i, j, k) > 1.2 - amount((i + 0.5) * T, (j + 1) * T, (k + 0.5) * T) ? MOSS_CUSHION : MOSS_COAT;
    const color = tone(i, j, k, thick > MOSS_COAT ? 1 : 0);
    if (run && run.i === i && run.j === j && run.end === k && run.color === color && run.thick === thick) run.end = k + 1;
    else {
      flush();
      run = { i, j, k, end: k + 1, color, thick };
    }
    // Hanging down the open front below it (the camera side), a texel or three.
    if (!solid(i, j, k + 1)) {
      const drop = Math.floor(valueNoise3(i * 0.7, j * 0.3, k * 0.7, seed + 9) * (1 + amount((i + 0.5) * T, j * T, k * T) * 4));
      for (let m = 0; m < drop && solid(i, j - m, k) && !solid(i, j - m, k + 1); m++)
        p.voxels.box((i + 0.5) * T, (j - m + 0.5) * T, (k + 1) * T + MOSS_COAT / 2, T, T, MOSS_COAT, tone(i, j - m, k, -m * 0.7), 'leaves', { surf, src });
    }
  }
  flush();
}

/** A tuft of grass: where (metres, on the surface it grows from) and how big (texels). */
export interface Tuft {
  x: number;
  y: number;
  z: number;
  height: number;
  radius?: number;
}

/** Grass tufts (lib/grass) in the joints and at the feet of the stones: one grid, emitted as stalks. */
export function tufts(p: PieceBuilder, list: readonly Tuft[], seed: number, tones: GrassTones = GRASS_TONES.meadow): void {
  const g = grassGrid(p, [0, 0, 0], seed);
  list.forEach((t, n) => {
    const [i, j, k] = [Math.floor(t.x / T), Math.round(t.y / T), Math.floor(t.z / T)];
    const r = Math.ceil(t.radius ?? t.height / 3) + 1;
    ghostGround(g, i - r, k - r, i + r, k + r, j);
    grassTuft(g, i, k, { j, height: t.height, radius: t.radius, lean: 0.9, nub: 0.6, arms: 0.5, spacing: 1.2, tones, seed: seed * 131 + n });
  });
  commitGrass(p, g, { seed });
}

/**
 * The ground stands a quarter texel proud of y = 0: the walkable kit level lays
 * its lawn under every scene with its top at y = 0, and a surface flush with it
 * would flicker against the grass.
 */
export const PAVE = T / 4;

/** A soil block with grass over a rectangle (0.5 m deep, top at {@link PAVE}) and its collider. */
export function soil(p: PieceBuilder, x0: number, z0: number, x1: number, z1: number): void {
  p.voxels.span(x0, PAVE - 0.5, z0, x1, PAVE, z1, SOIL.dirt[0], 'soil', { surf: soilSurf({ grass: 0.95, moss: 0.15 }) });
  p.collider(x0, -0.5, z0, x1, PAVE, z1);
}

/**
 * A paved court: rows of slabs 0.25 m thick, top at {@link PAVE}, a texel
 * apart so the joints read dark, over a soil bed whose grass shows where `gone`
 * leaves a slab out (none are laid where `under` says a structure stands).
 * Some slabs have settled or tipped a little. Adds the ground collider for the
 * rectangle; returns where joints cross and where slabs are gone (for the grass).
 */
export function paving(
  p: PieceBuilder,
  o: { x0: number; x1: number; z0: number; z1: number; seed: number; look: (x: number, z: number) => Look; gone?: (x: number, z: number) => boolean; under?: (x: number, z: number) => boolean },
): { joints: [number, number][]; holes: [number, number][] } {
  p.voxels.span(o.x0, -0.5, o.z0, o.x1, -0.25, o.z1, SOIL.dirt[0], 'soil', { surf: soilSurf({ grass: 0.85, moss: 0.2 }), open: 4 });
  p.collider(o.x0, -0.5, o.z0, o.x1, PAVE, o.z1);
  const joints: [number, number][] = [];
  const holes: [number, number][] = [];
  const src = here();
  let z = o.z0;
  for (let row = 0; z < o.z1 - 1e-6; row++) {
    let d = q8(0.5 + 0.375 * hash3(row, 1, 2, o.seed));
    if (o.z1 - (z + d) < 0.3) d = o.z1 - z;
    let x = o.x0 - (row % 2 ? q8(0.3 * hash3(row, 3, 3, o.seed)) : 0);
    for (let n = 0; x < o.x1 - 1e-6; n++) {
      let w = q8(0.5 + 0.75 * hash3(row, n, 5, o.seed));
      if (o.x1 - (x + w) < 0.3) w = o.x1 - x;
      const [a, b] = [Math.max(x, o.x0), Math.min(x + w, o.x1)];
      const [cx, cz] = [(a + b) / 2, z + d / 2];
      if (b - a > T && !o.under?.(cx, cz)) {
        if (o.gone?.(cx, cz)) holes.push([cx, cz]);
        else {
          const lk = o.look(cx, cz);
          const h = hash3(row, n, 9, o.seed);
          // One slab in six has settled a little; one in ten has tipped.
          const sink = h < 0.16 ? 0.03 : 0;
          const tip = h > 0.9 ? (h - 0.95) * 0.5 : 0;
          p.voxels.box(cx, PAVE - 0.125 - sink, cz, b - a - T, 0.25, d - T, lk.color, 'sandstone', { surf: lk.style.surf, shade: lk.style.shade, rx: tip, rz: tip * 0.6, src });
          if (a > o.x0) joints.push([a - T / 2, z - T / 2]);
        }
      }
      x += w;
    }
    z += d;
  }
  return { joints, holes };
}

const _m = new Matrix4();
const _e = new Euler();

/**
 * A dressed stone lying where it fell: `size` (metres) turned by `rot`
 * (radians), resting on its lowest corner at height `y`, sunk a little.
 * Its collider is its turned bounds, pulled in a little.
 */
export function fallen(p: PieceBuilder, o: { x: number; z: number; y?: number; size: V3; rot: V3; look: Look }): void {
  _m.makeRotationFromEuler(_e.set(o.rot[0], o.rot[1], o.rot[2]));
  const e = _m.elements;
  const half = (row: number) => Math.abs(e[row]) * o.size[0] * 0.5 + Math.abs(e[row + 4]) * o.size[1] * 0.5 + Math.abs(e[row + 8]) * o.size[2] * 0.5;
  const [hx, hy, hz] = [half(0), half(1), half(2)];
  const y = (o.y ?? 0) + hy - 0.02;
  p.voxels.box(o.x, y, o.z, o.size[0], o.size[1], o.size[2], o.look.color, 'sandstone', { surf: o.look.style.surf, shade: o.look.style.shade, rx: o.rot[0], ry: o.rot[1], rz: o.rot[2] });
  p.collider(o.x - hx * 0.85, o.y ?? 0, o.z - hz * 0.85, o.x + hx * 0.85, y + hy, o.z + hz * 0.85);
}

/**
 * A broken stone at (x, y, z), `size` metres, crumbled at its edges into the
 * sheet's clusters of cubes (in its own set, so it doesn't join the wall's
 * stones), with a collider when it is big enough to stand on.
 */
export function chunk(p: PieceBuilder, set: BlockSet, o: { x: number; y: number; z: number; size: V3; look: Look; wear?: number; seed: number }): void {
  const [w, h, d] = o.size;
  const min: V3 = [q8(o.x - w / 2), o.y, q8(o.z - d / 2)];
  const max: V3 = [q8(o.x + w / 2), o.y + q8(h), q8(o.z + d / 2)];
  const wear = o.wear ?? 0.22;
  crumble(set, [{ min, max, color: o.look.color, style: o.look.style }], (x, y, z, s) => {
    const dd = [x - s.min[0], s.max[0] - x, s.max[1] - y, z - s.min[2], s.max[2] - z].sort((a, b) => a - b);
    return dd[0] + dd[1] >= wear * (0.4 + 1.2 * noise(x, y, z, 0.2, o.seed));
  });
  if (Math.max(w, d) >= 0.3) p.collider(min[0], min[1], min[2], max[0], max[1] - 0.06, max[2]);
}

/** A piece of rubble: footprint centre, size (metres), look. */
export interface Rubble {
  x: number;
  z: number;
  size: V3;
  look: Look;
  /** Crumbled at the edges by default; `tilt` lays a whole block down at an angle instead (radians). */
  tilt?: V3;
}

/**
 * A heap of rubble where it fell: each piece rests on the highest thing under
 * its footprint — the `ground` (steps, a plinth) or the pieces laid before it.
 */
export function heap(p: PieceBuilder, set: BlockSet, list: readonly Rubble[], ground: (x: number, z: number) => number, seed: number): void {
  const tops: { min: V3; max: V3 }[] = [];
  list.forEach((r, n) => {
    const [w, h, d] = r.size;
    const reach = Math.max(w, d) * (r.tilt ? 0.6 : 0.45);
    let y = 0;
    for (const [fx, fz] of [
      [0, 0],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      y = Math.max(y, ground(r.x + fx * w * 0.4, r.z + fz * d * 0.4));
    for (const t of tops) if (r.x + reach > t.min[0] && r.x - reach < t.max[0] && r.z + reach > t.min[2] && r.z - reach < t.max[2]) y = Math.max(y, t.max[1] - 0.06);
    if (r.tilt) fallen(p, { x: r.x, z: r.z, y, size: r.size, rot: r.tilt, look: r.look });
    else chunk(p, set, { x: r.x, y: Math.round(y / T) * T, z: r.z, size: r.size, look: r.look, seed: seed * 31 + n });
    tops.push({ min: [r.x - w / 2, y, r.z - d / 2], max: [r.x + w / 2, y + h * (r.tilt ? 0.8 : 1), r.z + d / 2] });
  });
}
