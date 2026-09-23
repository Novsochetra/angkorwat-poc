import { hash3 } from '../../../voxel/random';
import { PieceBuilder } from '../../PieceBuilder';
import { rng, TEXEL, type Rng } from '../../shapes';
import { barkSurf } from '../../surface';
import { defineKitAsset, type KitPiece } from '../../types';
import { blossom, cellKey, commitMerged, DIRS, LEAF_CELL, LEAF_LOOK, pickT, plusCentre, sheetTone, UP, type LeafLook, type LeafLookId } from './_samples';

/**
 * §18.1 Leaf variations — the canopy materials of the trees, each shown as
 * the sheet does: a neat cube of leaves whose faces are tiled with
 * plus-shaped leaf clusters at three depths — sunlit ones standing proud,
 * flush ones, shaded ones set back — with a few leaves missing along their
 * arms, where the dark inside shows through. So the cube keeps a clean
 * outline with small bumps. Bright, dark, yellowish and jungle-mix foliage,
 * plus the sheet's two dressings: vines hanging down the sides round a woody
 * stem, and pink blossoms.
 *
 * The clusters sit on a 1/8 m lattice, eight to an edge, over a dark core;
 * each is a slab one to three texels thick with its cells merged into one
 * clump. The front and back take the vertical edges, the top the rim.
 */
const T = TEXEL;
const L = LEAF_CELL;
/** Lattice cells along an edge: a 1 m cube, about three clusters across. */
const N = 8;
/** Half-width and height of the dark core; flush clusters are two texels thick, so the cube is N·L. */
const IN = (N * L) / 2 - 2 * T;
const CORE_H = (N - 1) * L;

/** Faces that carry clusters (DIRS indices: +x, −x, top, +z, −z) and their lattice: first and last u, last v. */
const FACES: [number, number, number, number][] = [
  [0, 1, N - 2, N - 2],
  [1, 1, N - 2, N - 2],
  [UP, 0, N - 1, N - 1],
  [4, 0, N - 1, N - 2],
  [5, 0, N - 1, N - 2],
];

type Box = [number, number, number, number, number, number];

/** A cluster: its thickness in texels (1 set back, 2 flush, 3 proud) and stable 0‥1 values for its tone and shade. */
interface Cluster {
  th: number;
  t: number;
  k: number;
}

const VINE = [0x3f5a2c, 0x35502a, 0x48602f].map(sheetTone);
const VINE_LEAF = [0x7f9a32, 0x8ea83a, 0x6f8c2e].map(sheetTone);
/** The sheet's woody stem: warm brown. */
const STEM = [0x946a3b, 0x8a6238, 0x9c7242].map(sheetTone);

/** The box of lattice cell (u, v) of a face, `th` texels thick. */
function cellBox(d: number, u: number, v: number, th: number): Box {
  const a0 = (-N * L) / 2 + u * L;
  const a1 = a0 + L;
  const t = th * T;
  if (d === UP) {
    const z0 = (-N * L) / 2 + v * L;
    return [a0, CORE_H, z0, a1, CORE_H + t, z0 + L];
  }
  const y0 = v * L;
  if (d === 4) return [a0, y0, IN, a1, y0 + L, IN + t];
  if (d === 5) return [a0, y0, -IN - t, a1, y0 + L, -IN];
  return d === 0 ? [IN, y0, a0, IN + t, y0 + L, a1] : [-IN - t, y0, a0, -IN, y0 + L, a1];
}

/** In-plane neighbour steps of a face's lattice and the side bit (+x 1, −x 2, +y 4, −y 8, +z 16, −z 32) each crosses. */
function sideBits(d: number): [number, number, number][] {
  const [ua, ub, va, vb] = d === UP ? [1, 2, 16, 32] : d < 2 ? [16, 32, 4, 8] : [1, 2, 4, 8];
  return [
    [1, 0, ua],
    [-1, 0, ub],
    [0, 1, va],
    [0, -1, vb],
  ];
}

/** Texel occupancy of the cube (for which sides of a slab are exposed). */
class Occupancy {
  private readonly s = new Set<number>();
  private key = (i: number, j: number, k: number) => ((i + 64) * 128 + (j + 64)) * 128 + (k + 64);
  add(b: Box): void {
    const [i0, j0, k0, i1, j1, k1] = b.map((v) => Math.round(v / T));
    for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) for (let k = k0; k < k1; k++) this.s.add(this.key(i, j, k));
  }
  /** Does any texel just outside this side of the box lie open (the ground counts as solid)? */
  open(b: Box, bit: number): boolean {
    const [i0, j0, k0, i1, j1, k1] = b.map((v) => Math.round(v / T));
    const axis = bit & 3 ? 0 : bit & 12 ? 1 : 2;
    const pos = (bit & 21) !== 0;
    const lo = [i0, j0, k0];
    const hi = [i1, j1, k1];
    lo[axis] = hi[axis] = pos ? hi[axis] : lo[axis] - 1;
    hi[axis]++;
    for (let i = lo[0]; i < hi[0]; i++)
      for (let j = lo[1]; j < hi[1]; j++) for (let k = lo[2]; k < hi[2]; k++) if (j >= 0 && !this.s.has(this.key(i, j, k))) return true;
    return false;
  }
}

interface SurfaceCell {
  d: number;
  u: number;
  v: number;
  /** Cluster key and cluster; is this cell its centre? */
  id: string;
  c: Cluster;
  centre: boolean;
  b: Box;
}

interface CubeSurface {
  cells: SurfaceCell[];
  /** Thickness (texels) of the leaves over the core at a lattice cell of a face (0: a gap). */
  surface: (d: number, u: number, v: number) => number;
}

/**
 * The cube: a dark core (a grid of leaf cells in the gap colour, merged into
 * one smooth block) and on each face a lattice tiled with Greek crosses —
 * cells with u + 2v ≡ 0 (mod 5) are centres, every other cell an arm of one
 * of them — shifted per face. Each cluster gets a depth; some arm cells are
 * left out. Returns the cells (for blossoms and vines) and the surface.
 */
function leafCube(p: PieceBuilder, look: LeafLook, seed: number, skip?: (d: number, u: number, v: number) => boolean): CubeSurface {
  const n = Math.round((2 * IN) / L);
  const core = p.voxels.grid({ cell: L, origin: [-IN, 0, -IN], mat: 'leaves', jitter: 0.06, ao: 0, seed, surf: look.surf });
  const group = new Map<number, number>();
  for (let i = 0; i < n; i++)
    for (let j = 0; j < N - 1; j++)
      for (let k = 0; k < n; k++) {
        core.set(i, j, k, look.gap, 'leaves', 0.6);
        group.set(cellKey(i, j, k), 1);
      }
  commitMerged(core, p.voxels, group);
  const occ = new Occupancy();
  occ.add([-IN, 0, -IN, IN, CORE_H, IN]);
  const clusters = new Map<string, Cluster>();
  const cells: SurfaceCell[] = [];
  for (const [d, u0, u1, v1] of FACES) {
    const off = [Math.floor(hash3(d, 1, 2, seed) * 5), Math.floor(hash3(d, 3, 4, seed) * 5)];
    for (let u = u0; u <= u1; u++)
      for (let v = 0; v <= v1; v++) {
        const [cu, cv] = plusCentre(u + off[0], v + off[1]);
        const id = `${d},${cu},${cv}`;
        let c = clusters.get(id);
        if (!c) {
          const x = hash3(cu, cv, d * 31, seed);
          c = { th: x < 0.26 ? 1 : x < 0.7 ? 2 : 3, t: hash3(cu, cv, d * 31, seed + 7), k: hash3(cu, cv, d * 31, seed + 9) };
          clusters.set(id, c);
        }
        // Leaves missing along the arms: the dark gaps between clusters. None on the cube's edges, where
        // clusters are never set back either, so the outline stays clean and the top never overhangs a hole.
        const centre = cu === u + off[0] && cv === v + off[1];
        const rim = u === 0 || u === N - 1 || v === (d === UP ? 0 : -1) || v === (d === UP ? N - 1 : N - 2);
        if (rim) c.th = Math.max(c.th, 2);
        if (skip?.(d, u, v) || (!centre && !rim && hash3(u, v, d * 17, seed + 3) < (d === UP ? 0.18 : 0.32))) continue;
        cells.push({ d, u, v, id, c, centre, b: cellBox(d, u, v, c.th) });
      }
  }
  // Scraps of clusters cut by the face's edge lie flush (a lone proud cell would read as a stray cube).
  const size = new Map<string, number>();
  for (const s of cells) size.set(s.id, (size.get(s.id) ?? 0) + 1);
  for (const s of cells) {
    if ((size.get(s.id) ?? 0) < 3) s.c.th = 2;
    s.b = cellBox(s.d, s.u, s.v, s.c.th);
    occ.add(s.b);
  }
  const at = new Map(cells.map((s) => [`${s.d},${s.u},${s.v}`, s]));
  for (const s of cells) {
    const { d, c, b } = s;
    // Merge the cells of one cluster; open only the sides that step down to something lower.
    let merge = 0;
    let open = 1 << d;
    for (const [du, dv, bit] of sideBits(d)) {
      const nb = at.get(`${d},${s.u + du},${s.v + dv}`);
      if (nb && nb.id === s.id) merge |= bit;
      else if (occ.open(b, bit)) open |= bit;
    }
    // Proud clusters catch the sun (the top ones most), flush ones a shade darker (on top, lit or darker), set-back ones in shadow.
    const pal = c.th === 3 ? (d === UP ? (look.top ?? look.light) : look.light) : c.th === 2 ? (c.t < (d === UP ? 0.5 : 0.25) ? look.light : look.mid) : d === UP ? look.mid : look.deep;
    const tone = pickT(pal, (c.t * 7.3) % 1);
    const shade = (c.th === 3 ? 1.04 : c.th === 2 ? 1 : 0.94) * (0.95 + 0.1 * c.k);
    p.voxels.span(b[0], b[1], b[2], b[3], b[4], b[5], tone, 'leaves', { surf: look.surf, shade, merge, open });
  }
  return { cells, surface: (d, u, v) => at.get(`${d},${u},${v}`)?.c.th ?? 0 };
}

/** Lattice columns and rows of the woody stem on the front face. */
const inStem = (d: number, u: number, v: number) => d === 4 && u >= 3 && u <= 4 && v <= 2;

function build(variant: string, seed: number): KitPiece {
  const p = new PieceBuilder();
  const look = LEAF_LOOK[(variant in LEAF_LOOK ? variant : 'bright') as LeafLookId];
  const r = rng(seed * 7 + 3);
  const vines = variant === 'vines';
  const cube = leafCube(p, look, seed, vines ? inStem : undefined);
  if (vines) {
    // The woody stem the vines climb, showing low on the front face, its foot a little wider.
    const bark = barkSurf({ moss: 0.25, stain: 0.3 });
    p.voxels.span(-L, 0, IN - 2 * T, L, 3 * L, IN + 2 * T, r.pick(STEM), 'trunk', { surf: bark });
    p.voxels.span(-L - T, 0, IN - T, L + T, 2 * T, IN + 2 * T, r.pick(STEM), 'trunk', { surf: bark });
    hangVines(p, cube, r);
  }
  if (variant === 'flowers') bloom(p, cube, r, { [UP]: 3, 4: 2, 0: 2, 1: 1, 5: 1 });
  const half = (N * L) / 2;
  p.collider(-half, 0, -half, half, N * L, half);
  return p.done();
}

/**
 * Blossoms on the centres of clusters that are flush or proud and clear of
 * the face's edges, a few per face (`quota` by DIRS index), never touching.
 */
function bloom(p: PieceBuilder, cube: CubeSurface, r: Rng, quota: Partial<Record<number, number>>): void {
  const left = { ...quota };
  const placed: SurfaceCell[] = [];
  const inner = (s: SurfaceCell) => s.u > 0 && s.u < N - 1 && s.v > 0 && s.v < (s.d === UP ? N - 1 : N - 2);
  const list = cube.cells.filter((s) => s.centre && s.c.th > 1 && inner(s)).sort((a, b) => a.c.t - b.c.t);
  for (const s of list) {
    if (!left[s.d] || placed.some((q) => q.d === s.d && Math.abs(q.u - s.u) + Math.abs(q.v - s.v) < 4)) continue;
    left[s.d]!--;
    placed.push(s);
    const [dx, dy, dz] = DIRS[s.d];
    const c = [(s.b[0] + s.b[3]) / 2, (s.b[1] + s.b[4]) / 2, (s.b[2] + s.b[5]) / 2];
    const half = [(s.b[3] - s.b[0]) / 2, (s.b[4] - s.b[1]) / 2, (s.b[5] - s.b[2]) / 2];
    blossom(p, [c[0] + dx * half[0], c[1] + dy * half[1], c[2] + dz * half[2]], s.d, r);
  }
}

/**
 * Vines hang from the top down the front and right faces (one round the
 * back): a strand one texel wide riding over the clusters and bridging the
 * gaps, coming over the top edge, with small leaves along it.
 */
function hangVines(p: PieceBuilder, cube: CubeSurface, r: Rng): void {
  const faces = [4, 0, 4, 0, 4, 5];
  for (let s = r.int(5, 6) - 1; s >= 0; s--) {
    const d = faces[s];
    const [dx, , dz] = DIRS[d];
    // Across the face in texels from its left edge (clear of the corners), and the lowest row reached.
    let lat = r.int(3, 2 * N - 5);
    const bottom = Math.round((d === 4 ? r.range(0.1, 0.35) : r.range(0.2, 0.55)) * 2 * N);
    const vine = r.pick(VINE);
    // Texels from the core out to the leaf surface at a row: the thickest cluster nearby, so the strand bridges gaps;
    // at the rim the top's clusters reach two texels out.
    const lift = (row: number) => {
      const v = Math.floor(row / 2);
      if (v >= N - 1) return 2;
      return Math.max(1, ...[-1, 0, 1].map((dv) => cube.surface(d, Math.floor(lat / 2), v + dv)));
    };
    // A box against the face: `w` texels across from `lateral`, rows `row`…`row + h`, `out` texels over the core.
    const slab = (row: number, h: number, lateral: number, w: number, out: number, color: number) => {
      const o = IN + out * T;
      const a = (-N * L) / 2 + lateral * T;
      if (dx !== 0) p.voxels.span(dx * o, row * T, a, dx * (o + T), (row + h) * T, a + w * T, color, 'leaves');
      else p.voxels.span(a, row * T, dz * o, a + w * T, (row + h) * T, dz * (o + T), color, 'leaves');
    };
    // Over the top edge: lying on the top clusters, from a little way in out to the strand.
    const u = Math.floor(lat / 2);
    const edge = d === 0 ? [N - 1, u] : d === 1 ? [0, u] : d === 4 ? [u, N - 1] : [u, 0];
    const top = 2 * (N - 1) + Math.max(1, cube.surface(UP, edge[0], edge[1]));
    const reach = IN + 3 * T;
    const a = (-N * L) / 2 + lat * T;
    if (dx !== 0) p.voxels.span(dx * (IN - 2 * T), top * T, a, dx * reach, (top + 1) * T, a + T, vine, 'leaves');
    else p.voxels.span(a, top * T, dz * (IN - 2 * T), a + T, (top + 1) * T, dz * reach, vine, 'leaves');
    // Then down the face in two-texel links, a leaf beside every other one or so.
    for (let row = top - 2; row >= bottom; row -= 2) {
      slab(row, 2, lat, 1, lift(row), vine);
      if (r.chance(0.5)) slab(row - 1, 2, lat + (r.chance(0.5) ? 1 : -2), 2, lift(row - 1), r.pick(VINE_LEAF));
      if (r.chance(0.2)) lat = Math.max(3, Math.min(2 * N - 4, lat + (r.chance(0.5) ? 1 : -1)));
    }
  }
}

export default defineKitAsset({
  section: '18.1',
  order: 7,
  name: 'Leaf variations',
  caption: 'Canopy materials: bright, dark, yellowish and jungle foliage, vines and blossoms.',
  size: {
    real: '1 m sample cube of 1/8 m leaf clusters (proud ones stand a texel out)',
    sheet: 'not given',
    note: 'A sample of canopy, big enough for about three clusters across a face, like the sheet’s cubes; the trees and the bush skin their crowns with the same plus-shaped clusters.',
  },
  variants: [
    { id: 'bright', name: 'Bright green' },
    { id: 'dark', name: 'Dark green' },
    { id: 'yellowish', name: 'Yellowish green' },
    { id: 'jungle', name: 'Jungle mix' },
    { id: 'vines', name: 'With vines' },
    { id: 'flowers', name: 'With flowers' },
  ],
  shots: [
    { view: 'iso', variant: 'dark', label: 'Dark green' },
    { view: 'iso', variant: 'yellowish', label: 'Yellowish green' },
    { view: 'iso', variant: 'jungle', label: 'Jungle mix' },
    { view: 'iso', variant: 'vines', label: 'With vines' },
    { view: 'iso', variant: 'flowers', label: 'With flowers' },
  ],
  ref: { sheet: 'section 18/section 18.1.png', box: [18, 598, 512, 742] },
  build: ({ variant, seed }) => build(variant, seed),
});
