import { hash3, valueNoise3 } from '../../../voxel/random';
import type { VoxelGrid } from '../../../voxel/VoxelBuilder';
import { GRASS } from '../../palette';
import type { PieceBuilder } from '../../PieceBuilder';
import { fillEllipsoid, fillTube, rng, snap, TEXEL, tone, type Rng } from '../../shapes';
import { barkSurf, leafSurf, stoneSurf } from '../../surface';

/**
 * §18.1 broadleaf trees: ② Medium tree, ③ Small tree and the trees of the
 * ⑥ dense jungle cluster. What the sheet draws: a thick trunk of brown bark
 * planks whose base flares into stepped roots over a few small sandstone
 * stones and grass tufts, branches showing as beams under the lower leaf
 * clumps, and a rounded canopy of clumps with a jagged voxel surface — sunlit
 * yellow-green tops, mid greens, deep teal undersides and gaps — with a few
 * hanging vines.
 *
 * Trunk and canopy are one grid of `cell`-sized voxels (the sheet draws a
 * tree ≈ 25–30 voxels tall); grass blades use a 2-texel grid, vines and
 * stones are free boxes.
 */

/**
 * Canopy tones by light, deep teal undersides → sunlit yellow-green tips
 * (sampled off ② / ③, through fromSheet): the shadier the tone, the bluer.
 */
const LEAF_RAMP: readonly (readonly number[])[] = [
  [0x1f4034, 0x1b3b30],
  [0x2a5444, 0x27503f, 0x2e5a46],
  [0x365f45, 0x3b6443, 0x335a44],
  [0x4b7243, 0x46693f, 0x507845],
  [0x668a3e, 0x5f843f, 0x6e9142],
  [0x829a36, 0x7b9535, 0x8ba33a],
  [0x9aad38, 0x93a936, 0xa3b43c],
  [0xb3c040, 0xabbb3c],
];
/** Bark: the sheet's grey-brown planks, the lit ones warmer (trunk and branches). */
const BARK_TONES = [0x80634d, 0x735a46, 0x8e6e53, 0x68523f, 0x9c7852];
/** Roots: a little paler, their lit steps tan like the sheet's. */
const ROOT_TONES = [0x9c7a5a, 0x8f6f52, 0xaa8560, 0x86694f];
/** Hanging vines: yellow-green, like the sheet's. */
const VINE_TONES = [0x8a9c34, 0x7a8e30, 0x9aab3a, 0x6f8a33];
/** The sandstone blocks at the base: warm pinkish tan heaps and grey ones, like the sheet's. */
const STONE_WARM = [0xc8a585, 0xbf9b7a, 0xb99577, 0xc39c7a];
const STONE_GREY = [0xa39d96, 0x979089, 0xaaa39b];

/** Numeric key of a grid cell (for cell sets). */
const cellKey = (i: number, j: number, k: number) => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);

/** A clump's superellipsoid term |t|^2.5 (2 would be round, higher boxier). */
const sq25 = (t: number) => t * t * Math.sqrt(Math.abs(t));

const SIDES: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export interface BroadleafOptions {
  /** Ground to canopy top (m). */
  height: number;
  /** Canopy width (m). */
  width: number;
  seed: number;
  /** Where the trunk stands in piece space (default the origin). */
  x?: number;
  z?: number;
  /** Voxel size of trunk and canopy (m); default {@link broadleafCell}. */
  cell?: number;
  /** Lowest leaves, as a share of the height. */
  base: number;
  /** Trunk thickness above the flare (m, rounded to whole cells). */
  trunk: number;
  /** Leaf clumps over the canopy dome (more clumps = smaller ones). */
  clumps: number;
  /** Stepped surface roots around the flare… */
  roots: number;
  /** …reaching this far from the trunk's axis (m, ± a fifth). */
  rootReach: number;
  /** Vines hanging from the lower clumps. */
  vines: number;
  /** Little heaps of sandstone blocks between the roots. */
  stones: number;
}

/**
 * Default voxel size: ≈ 0.11 m·√height on a 2-texel step (5 m → 0.25 m,
 * 11 m → 0.375 m, 22 m → 0.5 m), so every tree reads as chunky voxels like the
 * sheet while bigger trees don't get too fine or too costly.
 */
export function broadleafCell(height: number): number {
  return Math.max(2, Math.round((0.11 * Math.sqrt(height)) / (2 * TEXEL))) * 2 * TEXEL;
}

interface Clump {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  /** In the lower ring (its branch shows as a beam, vines hang from it). */
  low: boolean;
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** cos of the polar angle of the lowest clumps on the canopy dome (≈ 112°, a little below its equator). */
const RIM = -0.38;
/** Exponent of the dome (a superellipse): > 2 gives the sheet's broad shoulders and flat-ish top. */
const DOME_P = 3;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** The canopy: its clumps, and the dome their centres sit on (cell units). */
interface Canopy {
  clumps: Clump[];
  /** Centre height and half-width / half-height of the dome. */
  y: number;
  a: number;
  b: number;
}

/**
 * Where the leaf clumps go (cell units): a crown clump on top, the rest spread
 * evenly over a dome (a golden-angle spiral down to just below its equator,
 * jittered), each about as wide as the spacing, so the clumps stay distinct
 * with dark gaps between them like the sheet's. The lowest ring hangs at the
 * canopy base, held `clear` cells off the axis so the limbs show under it.
 */
function canopyLayout(r: Rng, n: number, ax: number, A: number, base: number, top: number, clear: number): Canopy {
  const rc = (A * 1.05) / Math.sqrt(n);
  const ry = rc * 0.75;
  // (Room for the bigger clumps and the leaf relief, so the canopy ends up `A` wide and `top` tall.)
  const b = (top - 0.7 - base - 2 * ry) / (1 - RIM);
  const y = top - 0.7 - ry - b;
  const a = A - 1.1 * rc - 0.5;
  const az0 = r.range(0, Math.PI * 2);
  const clumps: Clump[] = [];
  for (let q = 0; q < n; q++) {
    const cz = q === 0 ? 1 : 1 - ((q + r.range(-0.25, 0.25)) / (n - 1)) * (1 - RIM);
    // Push the spherical direction out onto the superellipse dome.
    const t = ((Math.sqrt(1 - cz * cz) / a) ** DOME_P + (Math.abs(cz) / b) ** DOME_P) ** (-1 / DOME_P);
    const sz = (t * Math.sqrt(1 - cz * cz)) / a;
    const cy = (t * cz) / b;
    const az = az0 + q * GOLDEN + r.range(-0.25, 0.25);
    const s = q === 0 ? 1.15 : 1;
    const rx = rc * s * r.range(0.85, 1.15);
    const rz = rc * s * r.range(0.85, 1.15);
    const ry = Math.min(rx, rz) * r.range(0.68, 0.82);
    // The lowest ones hang a little lower and apart, under the core.
    const low = cz < -0.05;
    const dist = low ? Math.max(sz * a, clear + rx) : sz * a;
    clumps.push({ x: ax + Math.cos(az) * dist, y: y + cy * b - (low ? 0.5 * ry : 0), z: ax + Math.sin(az) * dist, rx, ry, rz, low });
  }
  return { clumps, y, a, b };
}

/**
 * One leaf clump: a rounded slab (a superellipsoid, flat-topped like the
 * sheet's terraced clumps) with a lumpy surface.
 */
function fillClump(g: VoxelGrid, cl: Clump, seed: number, core: Set<number>): void {
  for (let i = Math.floor(cl.x - cl.rx - 1); i <= Math.ceil(cl.x + cl.rx + 1); i++)
    for (let j = Math.floor(cl.y - cl.ry - 1); j <= Math.ceil(cl.y + cl.ry + 1); j++)
      for (let k = Math.floor(cl.z - cl.rz - 1); k <= Math.ceil(cl.z + cl.rz + 1); k++) {
        const d = sq25((i + 0.5 - cl.x) / cl.rx) + sq25((j + 0.5 - cl.y) / cl.ry) + sq25((k + 0.5 - cl.z) / cl.rz);
        // The lumps move the surface by ±0.45: only look them up near it.
        if (d > 1.45 || (d > 0.55 && d > 1 + (valueNoise3(i * 0.6, j * 0.6, k * 0.6, seed) - 0.5) * 0.9)) continue;
        g.set(i, j, k, 0);
        core.delete(cellKey(i, j, k));
      }
}

/** Face-plane coordinates of a cell for a face direction (x faces: z, y; y faces: x, z; z faces: x, y). */
const faceUV = (d: number, i: number, j: number, k: number): [number, number] => (d < 2 ? [k, j] : d < 4 ? [i, k] : [i, j]);

/** The Greek-cross tiling of a face plane: every cell belongs to the plus centred where u + 2v ≡ 0 (mod 5). */
function plusCentre(u: number, v: number): [number, number] {
  const m = (((u + 2 * v) % 5) + 5) % 5;
  return m === 0 ? [u, v] : m === 1 ? [u - 1, v] : m === 2 ? [u, v - 1] : m === 3 ? [u, v + 1] : [u + 1, v];
}

/**
 * The sheet's leafy canopy surface (like its Leaf Variations cubes): the
 * outer skin is tiled with plus-shaped leaf clusters, some standing a cell
 * proud, some sunk into a dark notch — so every clump shows a mosaic of lit
 * tops and shaded sides instead of a smooth skin. Each surface cell joins the
 * cluster of the side it faces (away from `centre`, tops first; never down).
 */
function relief(g: VoxelGrid, centre: [number, number, number], seed: number, raise: number, sink: number): void {
  const add: [number, number, number][] = [];
  const cut: [number, number, number][] = [];
  g.forEach((i, j, k, cell) => {
    if (cell.mat !== 'leaves') return;
    let best = -1;
    let bestDot = -Infinity;
    for (let d = 0; d < 6; d++) {
      const [dx, dy, dz] = SIDES[d];
      if (dy < 0 || g.has(i + dx, j + dy, k + dz)) continue;
      const dot = dx * (i + 0.5 - centre[0]) + dy * (j + 0.5 - centre[1]) + dz * (k + 0.5 - centre[2]) + (dy > 0 ? 2 : 0);
      if (dot > bestDot) {
        bestDot = dot;
        best = d;
      }
    }
    if (best < 0) return;
    const [u, v] = faceUV(best, i, j, k);
    const [cu, cv] = plusCentre(u + best, v + 2 * best);
    const layer = best < 2 ? i : best < 4 ? j : k;
    const h = hash3(cu * 8 + best, cv, layer, seed);
    const [dx, dy, dz] = SIDES[best];
    if (h < sink) cut.push([i, j, k]);
    else if (h > 1 - raise) add.push([i + dx, j + dy, k + dz]);
  });
  for (const [i, j, k] of cut) g.delete(i, j, k);
  for (const [i, j, k] of add) g.set(i, j, k, 0);
}

/**
 * Build one broadleaf tree into `p` (trunk standing at `x`, `z`, ground at
 * y = 0) with its trunk colliders. Deterministic for a seed; several trees
 * can share one piece (the jungle cluster).
 */
export function broadleafTree(p: PieceBuilder, o: BroadleafOptions): void {
  const c = o.cell ?? broadleafCell(o.height);
  const seed = o.seed;
  const r = rng(seed * 7919 + 17);
  const H = o.height / c;
  const A = o.width / (2 * c);
  const base = o.base * H;
  const tc = Math.max(1, Math.round(o.trunk / c));
  const rt = tc / 2;
  // An odd trunk is centred on a cell, an even one on a cell corner.
  const ax = tc % 2 ? 0.5 : 0;
  const x0 = o.x ?? 0;
  const z0 = o.z ?? 0;
  const origin: [number, number, number] = [snap(x0 - ax * c), 0, snap(z0 - ax * c)];
  const g = p.voxels.grid({ cell: c, origin, mat: 'leaves', jitter: 0.05, ao: 0.35, seed, surf: leafSurf() });
  const canopy = canopyLayout(r, o.clumps, ax, A, base, H, rt + 2.5);
  const fork = canopy.y;

  // Bark cells set themselves (returning null, so fillTube sets nothing more):
  // the trunk in vertical planks — one tone per column for a stretch — roots and branches in one tone each.
  const barkCell =
    (col?: number) =>
    (i: number, j: number, k: number): null => {
      if (j >= 0) g.set(i, j, k, col ?? tone(BARK_TONES, i, Math.floor((j + 8 * hash3(i, 1, k, seed)) / 8), k, seed), 'trunk', 1, barkSurf({ moss: j < 2 ? 0.35 : 0.06, stain: 0.18 }));
      return null;
    };
  const plank = barkCell();

  // ── Trunk: a leaning column of planks, a little wider at the ground, spreading into the fork ──
  const lean = [r.range(-0.5, 0.5) * rt, r.range(-0.5, 0.5) * rt];
  const axisAt = (y: number): [number, number] => {
    const t = Math.min(1, y / fork) ** 2;
    return [ax + lean[0] * t, ax + lean[1] * t];
  };
  const radius = (y: number) => rt * (1 + 0.6 * Math.exp(-y / (rt + 1)) + 0.4 * smooth(base - 3, base + 2, y));
  for (let j = 0; j < Math.ceil(fork); j++) {
    const y = j + 0.5;
    const [cx, cz] = axisAt(y);
    const R = radius(y);
    for (let i = Math.floor(cx - R - 1); i <= Math.ceil(cx + R); i++)
      for (let k = Math.floor(cz - R - 1); k <= Math.ceil(cz + R); k++) {
        const dx = i + 0.5 - cx;
        const dz = k + 0.5 - cz;
        const d = Math.hypot(dx, dz);
        // Irregular outline: some planks stand proud, some corners are missing.
        const wob = d > 0 ? (valueNoise3((dx / d) * 1.4 + 5, y * 0.3, (dz / d) * 1.4, seed) - 0.5) * 0.8 : 0;
        if (d <= R + 0.2 + wob) plank(i, j, k);
      }
  }

  // ── Buttress roots: ridges from high on the trunk stepping down and out over the ground ──
  const rootAz = r.range(0, Math.PI * 2);
  const rootAngles: number[] = [];
  let reach = rt;
  for (let n = 0; n < o.roots; n++) {
    const a = rootAz + ((n + r.range(-0.3, 0.3)) / o.roots) * Math.PI * 2;
    rootAngles.push(a);
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const end = Math.max(rt + 1.5, (o.rootReach / c) * r.range(0.8, 1.15));
    reach = Math.max(reach, end);
    const h0 = rt * r.range(1.5, 2.5) + 1;
    const [cx, cz] = axisAt(h0);
    const mid = rt + (end - rt) * 0.4;
    fillTube(g, [cx + dx * rt * 0.6, h0, cz + dz * rt * 0.6], [ax + dx * mid, h0 * 0.4, ax + dz * mid], [ax + dx * end, 0.5, ax + dz * end], Math.max(0.75, rt * 0.5), 0.75, barkCell(r.pick(ROOT_TONES)));
  }

  // ── Canopy: limbs leave the trunk just under the canopy for the lower and
  // middle clumps (the lowest run out level, like the sheet's beams, then turn
  // up), a dark recessed core, the clumps over them ──
  const rim = Math.min(...canopy.clumps.filter((cl) => !cl.low).map((cl) => cl.y));
  for (const cl of canopy.clumps) {
    // (Branches to the upper clumps would run inside the core: none needed.)
    if (!cl.low && cl.y > fork) continue;
    const ys = cl.low ? cl.y - cl.ry + r.range(-0.5, 0.8) : rim - r.range(0.5, 2);
    const [cx, cz] = axisAt(ys);
    const out = cl.low ? 0.8 : 0.5;
    const ctrl: [number, number, number] = [cx + (cl.x - cx) * out, cl.low ? ys : ys + (cl.y - ys) * 0.35, cz + (cl.z - cz) * out];
    fillTube(g, [cx, ys, cz], ctrl, [cl.x, cl.y, cl.z], Math.max(0.75, rt * 0.6), 0.75, barkCell(r.pick(BARK_TONES)));
  }
  // The core stops above the lowest clumps, so they hang apart with gaps between them.
  const core = new Set<number>();
  const coreCell = (i: number, j: number, k: number) => {
    if (j + 0.5 < rim) return null;
    core.add(cellKey(i, j, k));
    return 0;
  };
  fillEllipsoid(g, [ax, canopy.y, ax], [0.8 * canopy.a, 0.85 * canopy.b, 0.8 * canopy.a], coreCell);
  canopy.clumps.forEach((cl, n) => fillClump(g, cl, seed + 31 * n, core));
  relief(g, [ax, canopy.y, ax], seed, 0.3, 0.14);
  paintLeaves(g, canopy.clumps, core, base, H, seed);

  // ── Vines: strands hanging from the lower clumps (one long one nearly to the ground) ──
  const vw = Math.max(2 * TEXEL, snap(c * 0.6));
  const low = canopy.clumps.filter((cl) => cl.low);
  let vines = 0;
  for (let t = 0; vines < o.vines && low.length && t < o.vines * 6; t++) {
    const cl = low[t % low.length];
    const i = Math.floor(cl.x + r.range(-0.55, 0.55) * cl.rx);
    const k = Math.floor(cl.z + r.range(-0.55, 0.55) * cl.rz);
    let j = Math.floor(cl.y);
    if (g.get(i, j, k)?.mat !== 'leaves') continue;
    while (g.get(i, j - 1, k)?.mat === 'leaves') j--;
    // Stop above whatever is below (a branch, a root) or short of the ground.
    let floor = 0.6;
    for (let jj = j - 1; jj >= 0; jj--)
      if (g.has(i, jj, k)) {
        floor = (jj + 1) * c + 0.2;
        break;
      }
    const y0 = j * c;
    let len = Math.min(y0 - floor, vines === 1 ? y0 : r.range(0.2, 0.4) * y0);
    if (len < 2 * vw) continue;
    vines++;
    let x = snap(origin[0] + (i + 0.5) * c);
    const z = snap(origin[2] + (k + 0.5) * c);
    let y = y0;
    while (len > vw) {
      const seg = Math.min(len, snap(r.range(0.5, 1.1)));
      p.voxels.box(x, y - seg / 2, z, vw, seg, vw, r.pick(VINE_TONES), 'leaves', { surf: leafSurf() });
      y -= seg;
      len -= seg;
      x += r.pick([-1, 1]) * snap(vw / 2);
    }
  }

  // ── Grass tufts among the roots and stones (2-texel blades) ──
  const gc = 2 * TEXEL;
  const gg = p.voxels.grid({ cell: gc, origin: [snap(x0), 0, snap(z0)], mat: 'leaves', jitter: 0.08, ao: 0.15, seed: seed + 1, surf: leafSurf() });
  const groundAt = (x: number, z: number) => {
    let j = 0;
    while (g.has(Math.floor((x - origin[0]) / c), j, Math.floor((z - origin[2]) / c))) j++;
    return j * c;
  };
  for (let t = o.stones + 3; t > 0; t--) {
    const a = r.range(0, Math.PI * 2);
    const dist = r.range(rt + 1, reach + 0.5) * c;
    const tx = Math.cos(a) * dist;
    const tz = Math.sin(a) * dist;
    for (let q = r.int(5, 9); q > 0; q--) {
      const bx = tx + r.range(-1.6, 1.6) * gc;
      const bz = tz + r.range(-1.6, 1.6) * gc;
      const bi = Math.floor(bx / gc);
      const bk = Math.floor(bz / gc);
      const bj = Math.round(groundAt(x0 + bx, z0 + bz) / gc);
      const tall = r.int(1, 3);
      for (let h = 0; h < tall; h++) gg.set(bi, bj + h, bk, tone(h === tall - 1 ? GRASS.tip : GRASS.blade, bi, h, bk, seed));
    }
  }

  // ── Stones: little heaps of sandstone blocks between the roots, mossy on top ──
  // Stone sizes follow the voxel size (0.375 m cells: 0.6–0.9 m blocks).
  const sc = c / 0.375;
  let tones: readonly number[] = STONE_WARM;
  const block = (x: number, y: number, z: number, w: number, h: number, d: number) =>
    p.voxels.box(snap(x), y + h / 2, snap(z), w, h, d, r.pick(tones), 'sandstone', { surf: stoneSurf({ moss: r.range(0.25, 0.6), stain: 0.3, lichen: 0.1 }) });
  // Heaps sit in the gaps between roots (where no root lies), the first in the gap nearest the front, as on the sheet.
  const gapAt = (q: number) => (rootAngles[q] + rootAngles[(q + 1) % o.roots] + (q + 1 === o.roots ? Math.PI * 2 : 0)) / 2;
  let frontGap = 0;
  for (let q = 1; q < o.roots; q++) if (Math.sin(gapAt(q)) > Math.sin(gapAt(frontGap))) frontGap = q;
  for (let n = 0; n < o.stones; n++) {
    tones = r.chance(0.3) ? STONE_GREY : STONE_WARM;
    const a = gapAt((frontGap + Math.floor((n * o.roots) / o.stones)) % o.roots);
    let dist = r.range(rt + 1.8, reach - 0.3);
    while (dist < reach + 2 && g.has(Math.floor(ax + Math.cos(a) * dist), 0, Math.floor(ax + Math.sin(a) * dist))) dist += 0.5;
    const sx = x0 + Math.cos(a) * dist * c;
    const sz = z0 + Math.sin(a) * dist * c;
    const w = snap(r.range(0.6, 0.9) * sc);
    const d = snap(r.range(0.45, 0.7) * sc);
    const h = snap(r.range(0.3, 0.48) * sc);
    block(sx, 0, sz, w, h, d);
    if (r.chance(0.6)) block(sx + r.range(-0.15, 0.15) * w, h, sz + r.range(-0.15, 0.15) * d, snap(w * 0.6), snap(h * 0.7), snap(d * 0.65));
    if (r.chance(0.7)) {
      const t = a + Math.PI / 2;
      const off = (w * 0.5 + r.range(0.12, 0.3)) * r.pick([-1, 1]);
      block(sx + Math.cos(t) * off, 0, sz + Math.sin(t) * off, snap(w * 0.6), snap(h * 0.6), snap(d * 0.8));
    }
  }

  const first = p.voxels.boxes.length;
  g.commit();
  // Bark cells stacked in one column with one tone read as one plank: no bevel between them.
  for (let n = first; n < p.voxels.boxes.length; n++) {
    const b = p.voxels.boxes[n];
    if (b.mat !== 'trunk') continue;
    const i = Math.floor((b.x - origin[0]) / c);
    const j = Math.floor(b.y / c);
    const k = Math.floor((b.z - origin[2]) / c);
    const same = (jj: number) => {
      const n2 = g.get(i, jj, k);
      return n2?.mat === 'trunk' && n2.color === b.color;
    };
    b.merge = (same(j + 1) ? 4 : 0) | (same(j - 1) ? 8 : 0);
  }
  gg.commit();
  // Colliders: the trunk up to the canopy, and its flared foot (the roots stay climbable steps).
  const half = rt * c;
  const foot = 1.35 * half;
  p.collider(x0 - half, 0, z0 - half, x0 + half, base * c, z0 + half);
  p.collider(x0 - foot, 0, z0 - foot, x0 + foot, 1.5 * (rt + 1) * c, z0 + foot);
}

/**
 * Colour the leaf cells: each clump is bright on top and dark underneath
 * (the sheet's yellow-green tops, teal undersides), the whole canopy a little
 * darker low down, darker again where a higher clump shades it and in the
 * creases between clumps; a strong per-voxel jitter across the ramp gives the
 * sheet's mosaic of greens.
 */
function paintLeaves(g: VoxelGrid, clumps: Clump[], core: Set<number>, base: number, top: number, seed: number): void {
  const last = LEAF_RAMP.length - 1;
  g.paint((i, j, k, cell) => {
    if (cell.mat !== 'leaves') return;
    // Enclosed cells are culled when the grid is committed: no colour needed.
    if (g.has(i + 1, j, k) && g.has(i - 1, j, k) && g.has(i, j + 1, k) && g.has(i, j - 1, k) && g.has(i, j, k + 1) && g.has(i, j, k - 1)) return;
    // The recessed core shows in the gaps: dark.
    if (core.has(cellKey(i, j, k))) return tone(LEAF_RAMP[hash3(i, j, k, seed + 9) < 0.7 ? 0 : 1], i, j, k, seed);
    const x = i + 0.5;
    const y = j + 0.5;
    const z = k + 0.5;
    // Nearest and second-nearest clump (squared normalised distances).
    let q1 = Infinity;
    let q2 = Infinity;
    let own = clumps[0];
    for (const cl of clumps) {
      const dx = (x - cl.x) / cl.rx;
      const dy = (y - cl.y) / cl.ry;
      const dz = (z - cl.z) / cl.rz;
      const q = dx * dx + dy * dy + dz * dz;
      if (q < q1) {
        q2 = q1;
        q1 = q;
        own = cl;
      } else if (q < q2) q2 = q;
    }
    const u = Math.max(-1, Math.min(1, (y - own.y) / own.ry));
    const v = (y - base) / (top - base);
    const ownTop = Math.ceil(own.y + own.ry);
    let covered = 0;
    for (let jj = ownTop + 1; jj <= ownTop + 4 && !covered; jj++) if (g.has(i, jj, k)) covered = 1;
    const crease = Math.sqrt(q2) - Math.sqrt(q1) < 0.2 ? 1 : 0;
    const L = 3.1 + 2.8 * u + 0.8 * (v - 0.5) - 0.7 * covered - 1.0 * crease + (hash3(i, j, k, seed + 9) - 0.5) * 2.2;
    return tone(LEAF_RAMP[Math.max(0, Math.min(last, Math.round(L)))], i, j, k, seed);
  });
}
