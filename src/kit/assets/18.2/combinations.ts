import { hash3, valueNoise3 } from '../../../voxel/random';
import type { VoxelGrid } from '../../../voxel/VoxelBuilder';
import { topGrid } from '../../lib/ground';
import { clipToFootprint, commitGrass, LAWN_TONES, lawnMosaic, plusTuft } from '../../lib/grass';
import { LEAF_SHAPES, LeafBed, LITTER_MIX, placeLeaf, randomLeaf, scatterLeaves, type LeafPlane } from '../../lib/leaves';
import { rock, type StoneBounds } from '../../lib/rocks';
import { commitRoots, mossOver, ROOT_LOOK, ROOT_MOSS, trail, type RootGround, type RootLook, type RootStyle, type TrailSpec } from '../../lib/roots';
import { PieceBuilder } from '../../PieceBuilder';
import { fillEllipsoid, rng, TEXEL, tone, type Rng } from '../../shapes';
import { defineKitAsset, type KitPiece } from '../../types';
import { Canvas } from './_combo';
import { DEPTH, mix, onSide, onTop, scale, texelValue, toneRanker } from './_tiles';

/**
 * §18.2 Combination examples: four 2 × 2 m ground tiles where the §18.2
 * surfaces blend into each other — raised patches of grass on bare dirt,
 * sandstone paving with moss creeping through the joints and over the edges,
 * dark soil strewn with fallen leaves, and a thick, forking root lying over
 * mossy ground between grey rocks. Painted texel by texel over the whole
 * top (no 1 m seams), 0.5 m of ground below and the walkable top at y = 0,
 * like the 1 m tiles they sit beside.
 */
type Vec3 = [number, number, number];

/** The tiles' side (metres). */
const W = 2;
const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Tone of a palette for a 0‥1 value. */
const pickT = (pal: readonly number[], v: number) => pal[Math.min(pal.length - 1, Math.max(0, Math.floor(v * pal.length)))];

/** Paint cells by rank of their texel value, so each tone covers its share (palette dark → light). */
function paintRanked(c: Canvas, cells: Vec3[], pal: readonly number[], weights: readonly number[], seed: number, style: Parameters<Canvas['set']>[4] = {}, blotch = 0.5, mixAmt = 0.45): void {
  const v = cells.map(([i, j, k]) => texelValue(i, j, k, seed, blotch, mixAmt));
  const rank = toneRanker(v, weights);
  cells.forEach(([i, j, k], n) => c.set(i, j, k, pal[rank(v[n])], style));
}

/** A grid of texel cells over the tile's top for tufts, roots and seedlings, the ground under it solid. */
function detailGrid(p: PieceBuilder, c: Canvas, seed: number): VoxelGrid {
  const g = topGrid(p, { w: W, d: W, mat: 'leaves', seed });
  // Whatever the canvas raised stands solid under the detail (its AO and contact shadows).
  for (let i = 0; i < c.ni; i++)
    for (let k = 0; k < c.nk; k++) {
      const top = c.top(i, k);
      for (let j = 0; j <= top; j++) g.ghost(i, j, k);
    }
  return g;
}

// ── Grass + dirt ─────────────────────────────────────────────────────────────

/** The sheet's earth under the grass (as the grass tile), dark → light, and each tone's share. */
const EARTH = [0x312823, 0x563f32, 0x6f4e3a, 0x895f41, 0xa3754f].map(onSide);
const EARTH_W = [9, 19, 36, 27, 9];
const EARTH_STONE = [0x6e6a6c, 0x5e5a5c, 0x7c7674].map(onSide);
/** Grass hanging over the edges: the lip of the turf, then further down. */
const DRIP_TOP = [0x9ea831, 0x839236, 0x8a9830].map(onSide);
const DRIP = [0x677d35, 0x4e612f, 0x5c7331, 0x3d4f2c].map(onSide);
/** The dark, rooty soil of a patch where no grass hangs over its side. */
const SOD = [0x3a3226, 0x46392a, 0x2f2a22].map(onSide);
/** Bare dirt between the grass (sheet: red-brown, dark crumbs, pale clods), dark → light. */
const BARE = [0x3e342a, 0x6a5038, 0x8e6444, 0xa8744c, 0xc08658, 0xe0a468].map(onTop);
const BARE_W = [6, 20, 34, 24, 11, 5];
/**
 * Lumps on the patches: one body colour, so neighbouring cubes merge into soft
 * mounds, and tops from olive to the sheet's sunlit lime.
 */
const LUMP = 0x4a6234;
const LUMP_TOP = LAWN_TONES.slice(2);
/** Shares of the lawn tones (dark → bright): the sheet's patches are sunnier than the grass tile's lawn. */
const TURF_SHARES = [0.06, 0.1, 0.16, 0.25, 0.26, 0.17];
/**
 * The patchwork: half-metre slots (rows from the back, −z, to the front; x from
 * left to right), `G` a grass patch — the sheet's layout: patches all along the
 * front-left edge, bare dirt in the middle of the front-right one and in a few
 * slots behind, channels of dirt between neighbouring patches.
 */
const SLOTS = ['GGGG', 'G.G.', '.G..', 'GGGG'];
/** Texels across a slot, and how high the patches stand (texels). */
const SLOT = 8;
const PATCH_H = 2;

/** Is slot (si, sk) grass? The sheet's layout; other seeds turn and mirror it. */
function grassSlot(si: number, sk: number, seed: number): boolean {
  const sym = (((seed - 1) % 8) + 8) % 8;
  let [a, b] = [sym & 1 ? 3 - si : si, sym & 2 ? 3 - sk : sk];
  if (sym & 4) [a, b] = [b, a];
  return SLOTS[b][a] === 'G';
}

function grassDirt(seed: number): KitPiece {
  const p = new PieceBuilder();
  const r = rng(seed * 7 + 3);
  const c = new Canvas(W, W, 'soil');
  const n = c.ni;
  const S = n / SLOT;

  // The patches: each grass slot less a channel of dirt towards its neighbours
  // (one or two texels a side; now and then two join into one bigger patch),
  // flush with the tile's edges so the grass hangs down its sides.
  const grass = (si: number, sk: number) => si >= 0 && sk >= 0 && si < S && sk < S && grassSlot(si, sk, seed);
  const patch = new Int16Array(n * n).fill(-1);
  const at = (i: number, k: number) => (c.inside(i, k) ? patch[i * n + k] : -2);
  let count = 0;
  for (let sk = 0; sk < S; sk++)
    for (let si = 0; si < S; si++) {
      if (!grass(si, sk)) continue;
      const inset = (di: number, dk: number) => {
        const [ni, nk] = [si + di, sk + dk];
        if (ni < 0 || nk < 0 || ni >= S || nk >= S) return 0;
        // (the edge between two slots decides once for both)
        const edge = hash3(Math.min(si, ni) * 2 + (di ? 0 : 1), Math.min(sk, nk), 5, seed);
        if (grass(ni, nk)) return edge < 0.15 ? 0 : hash3(si, sk, di * 3 + dk, seed + 1) < 0.5 ? 1 : 2;
        return hash3(si, sk, di * 3 + dk, seed + 2) < 0.5 ? 0 : 1;
      };
      const [i0, i1] = [si * SLOT + inset(-1, 0), (si + 1) * SLOT - inset(1, 0)];
      const [k0, k1] = [sk * SLOT + inset(0, -1), (sk + 1) * SLOT - inset(0, 1)];
      for (let i = i0; i < i1; i++) for (let k = k0; k < k1; k++) patch[i * n + k] = count;
      count++;
    }
  // Ragged, blocky outlines: notches bitten out of the rims, most corners gone.
  const rimOf = (i: number, k: number) => DIRS.filter(([di, dk]) => at(i + di, k + dk) === -1).length;
  const bite: number[] = [];
  for (let i = 0; i < n; i++)
    for (let k = 0; k < n; k++) {
      const e = at(i, k) >= 0 ? rimOf(i, k) : 0;
      if (e && hash3(i, 1, k, seed + 3) < (e > 1 ? 0.45 : 0.12)) bite.push(i * n + k);
    }
  for (const q of bite) patch[q] = -1;
  // Grass spilling over the rims onto the dirt: a texel lower than the patch.
  const low = new Set<number>();
  for (let i = 0; i < n; i++)
    for (let k = 0; k < n; k++) {
      if (at(i, k) !== -1) continue;
      const near = new Set(DIRS.map(([di, dk]) => at(i + di, k + dk)).filter((v) => v >= 0));
      if (near.size === 1 && hash3(i, 2, k, seed + 4) < 0.14) low.add(i * n + k);
    }
  const height = (i: number, k: number) => (at(i, k) >= 0 ? PATCH_H : low.has(i * n + k) ? PATCH_H - 1 : 0);
  const isBare = (i: number, k: number) => c.inside(i, k) && height(i, k) === 0;

  const cells = c.skin();
  const sides = cells.filter(([, j]) => j < -1);
  paintRanked(c, sides, EARTH, EARTH_W, seed);
  // A few grey stones, one or two texels, in the lower earth.
  for (const [i, j, k] of sides) if (j < -3 && texelValue(i, j, k, seed + 9, 0.7, 0.5) > 0.8) c.set(i, j, k, pickT(EARTH_STONE, texelValue(i, j, k, seed + 10, 0.9, 0.3)));

  // Bare dirt, a tone or two darker round the foot of the patches (their shade).
  const top = cells.filter(([, j]) => j === -1);
  const dirt = top.filter(([i, , k]) => isBare(i, k));
  const v = dirt.map(([i, j, k]) => texelValue(i, j, k, seed + 1, 0.5, 0.45));
  const rank = toneRanker(v, BARE_W);
  dirt.forEach(([i, j, k], q) => {
    const foot = DIRS.some(([di, dk]) => height(i + di, k + dk) > 0) ? 2 : [-1, 1].some((di) => [-1, 1].some((dk) => height(i + di, k + dk) > 0)) ? 1 : 0;
    c.set(i, j, k, BARE[Math.max(0, rank(v[q]) - foot)]);
  });

  // The patches: turf on top (a lawn mosaic), the grass hanging over their
  // rims — the lip always, the texel under it mostly — over dark sod.
  const lawn = lawnMosaic(n, n, seed, TURF_SHARES);
  for (const [i, , k] of top) {
    const h = height(i, k);
    if (!h) continue;
    // (under the patch only the side shows, at the tile's edge: sod or hanging grass)
    c.set(i, -1, k, r.pick(SOD));
    for (let j = 0; j < h; j++) {
      if (j < h - 1) {
        const hangs = r.chance(0.7);
        c.set(i, j, k, hangs ? r.pick(DRIP) : r.pick(SOD), { mat: hangs ? 'leaves' : 'soil' });
        continue;
      }
      const t = LAWN_TONES[Math.max(0, lawn[k * n + i] - (h < PATCH_H ? 1 : 0))];
      c.set(i, j, k, t, { mat: 'leaves', side: r.pick(DRIP_TOP) });
    }
  }
  // Down the tile's sides under the patches: grass hanging one to six texels over the sod.
  for (const [i, k] of c.edges()) {
    const h = height(i, k);
    if (!h) continue;
    const len = r.int(0, 2) + (r.chance(0.45) ? r.int(1, 4) : 0);
    for (let d = 0; d < len; d++) c.set(i, -1 - d, k, r.pick(DRIP), { mat: 'leaves' });
  }

  // Low lumps on some of the patches, a texel proud of their turf.
  const lump = c.loose();
  const inner: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) if (at(i, k) >= 0 && DIRS.every(([di, dk]) => at(i + di, k + dk) >= 0 || at(i + di, k + dk) === -2)) inner.push([i, k]);
  const clumps: [number, number, number][] = [];
  for (let t = 0; t < 400 && clumps.length < count * 0.6 && inner.length; t++) {
    const [i, k] = r.pick(inner);
    if (clumps.every(([a, b]) => Math.hypot(a - i, b - k) > 6)) clumps.push([i, k, r.range(1.2, 2.1)]);
  }
  const lumpy = new Set<number>();
  for (const [ci, ck, rad] of clumps)
    for (let i = ci - 3; i <= ci + 3; i++)
      for (let k = ck - 3; k <= ck + 3; k++) {
        const d = (Math.hypot(i - ci, k - ck) + (hash3(i, 2, k, seed) - 0.5) * 1.1) / rad;
        if (d > 1 || at(i, k) < 0 || rimOf(i, k)) continue;
        lumpy.add(i * n + k);
        c.set(i, PATCH_H, k, LUMP, { mat: 'leaves', group: lump, ao: true, cap: pickT(LUMP_TOP, (1 - d) * 0.6 + hash3(i, 3, k, seed) * 0.4) });
      }
  // The turf round the lumps' foot in their shade.
  for (let i = 0; i < n; i++)
    for (let k = 0; k < n; k++) {
      if (at(i, k) < 0 || lumpy.has(i * n + k) || !DIRS.some(([di, dk]) => c.inside(i + di, k + dk) && lumpy.has((i + di) * n + k + dk))) continue;
      const t = LAWN_TONES[Math.max(0, lawn[k * n + i] - 2)];
      c.set(i, PATCH_H - 1, k, t, { mat: 'leaves', side: r.pick(DRIP_TOP) });
    }

  // Clods of the paler earth on the dirt, one to four texels each.
  for (let q = 0, tries = 0; q < 6 && tries < 60; tries++) {
    const [i, k] = [r.int(1, n - 2), r.int(1, n - 2)];
    if (!isBare(i, k) || c.has(i, 0, k) || DIRS.some(([di, dk]) => !isBare(i + di, k + dk))) continue;
    q++;
    const g = c.loose();
    c.set(i, 0, k, BARE[r.int(3, 5)], { group: g, ao: true });
    for (const [di, dk] of DIRS) if (r.chance(0.35) && isBare(i + di, k + dk)) c.set(i + di, 0, k + dk, BARE[r.int(3, 5)], { group: g, ao: true });
  }

  // The sheet's lime crosses: one or two on each patch (on a lump or the flat
  // turf), and a few small ones sprouting from the dirt.
  const g = detailGrid(p, c, seed);
  const spots: [number, number, number][] = [];
  for (let t = 0; t < 400 && spots.length < count * 1.6; t++) {
    const [i, k] = r.pick(inner);
    if (spots.every(([a, b]) => Math.hypot(a - i, b - k) > 4)) spots.push([i, k, lumpy.has(i * n + k) ? 2 : 3]);
  }
  spots.forEach(([i, k, h], q) => {
    const j = c.top(i, k);
    if (j >= 0 && !g.has(i, j + 1, k)) plusTuft(g, i, k, { j: j + 1, height: h, seed: seed * 31 + q });
  });
  const clear = (i: number, k: number) => {
    for (let a = i - 2; a <= i + 2; a++) for (let b = k - 2; b <= k + 2; b++) if (!isBare(a, b) || c.has(a, 0, b)) return false;
    return true;
  };
  for (let q = 0, tries = 0; q < 4 && tries < 120; tries++) {
    const [i, k] = [r.int(2, n - 3), r.int(2, n - 3)];
    if (!clear(i, k) || g.has(i, 0, k)) continue;
    q++;
    plusTuft(g, i, k, { height: r.chance(0.5) ? 2 : 1, seed: seed * 17 + q });
  }
  clipToFootprint(g, n, n);
  commitGrass(p, g, { seed, sun: 0.7 });

  c.emit(p.voxels);
  p.collider(-W / 2, -DEPTH * TEXEL, -W / 2, W / 2, 0, W / 2);
  return p.done();
}

// ── Sandstone path + moss ────────────────────────────────────────────────────

/** Slab thickness and the depth of the open joints (texels). */
const SLAB_T = 4;
const JOINT = 2;
/** Slab tones (sheet: greyer, duller paving than the path tile). */
const SLAB = [0xc6a886, 0xbc9f7f, 0xceae8c, 0xb69a7a, 0xc2a584].map(onTop);
/**
 * Texel mottling of a slab (by rank, see MOTTLE_W): the sheet's grey-brown
 * blotches, olive stains of old moss and cream highlights.
 */
const SPOT = onTop(0x7a6a54);
const STAIN = onTop(0x6d653d);
const CREAM = onTop(0xedcea6);
const MOTTLE: readonly [number, number][] = [
  [STAIN, 0.6],
  [SPOT, 0.6],
  [SPOT, 0.3],
  [0, 0],
  [CREAM, 0.35],
  [CREAM, 0.65],
];
const MOTTLE_W = [7, 11, 18, 32, 20, 12];
/** The older course under the slabs, in shade. */
const LOWER = [0x7e6248, 0x6f5540, 0x8a6c52, 0x5e4a38].map(onSide);
const JOINT_EARTH = [0x3e3428, 0x4a3e30, 0x33291f].map(onTop);
/** Moss (sheet: yellow-olive, dark in the joints) on top and down the sides. */
const PATH_MOSS = [0x4a4a20, 0x5e5c24, 0x76742a, 0x928c26, 0xaea52a].map(onTop);
const PATH_MOSS_SIDE = [0x3a3c1c, 0x4a4a22, 0x5c5a24, 0x6e6a28].map(onSide);

interface Slab {
  i0: number;
  i1: number;
  k0: number;
  k1: number;
  color: number;
}

/** Cut `len` texels from `start` into pieces min‥max long with one-texel joints between: [start, end) runs. */
function runs(r: Rng, start: number, len: number, min: number, max: number): [number, number][] {
  const counts: number[] = [];
  for (let n = 1; n <= 12; n++) if (n * min + n - 1 <= len && n * max + n - 1 >= len) counts.push(n);
  const n = counts.length ? r.pick(counts) : 1;
  const lens = new Array<number>(n).fill(min);
  for (let left = len - (n - 1) - n * min; left > 0; ) {
    const i = r.int(0, n - 1);
    if (lens[i] < max) {
      lens[i]++;
      left--;
    } else if (lens.every((l) => l >= max)) break;
  }
  const out: [number, number][] = [];
  let a = start;
  for (const l of lens) {
    out.push([a, a + l]);
    a += l + 1;
  }
  return out;
}

function pathMoss(seed: number): KitPiece {
  const r = rng(seed * 17 + 3);
  const c = new Canvas(W, W, 'sandstone');
  const n = c.ni;

  // Slabs of about half a metre in rows along x, each row cut on its own so the
  // joints stagger; texel row / column 0 is the tile's own joint, as on the path tile.
  const slabs: Slab[] = [];
  for (const [k0, k1] of runs(r, 1, n - 1, 7, 9)) for (const [i0, i1] of runs(r, 1, n - 1, 6, 9)) slabs.push({ i0, i1, k0, k1, color: r.pick(SLAB) });
  const slabAt = new Map<number, Slab>();
  for (const s of slabs) {
    const cells: Vec3[] = [];
    for (let i = s.i0; i < s.i1; i++)
      for (let k = s.k0; k < s.k1; k++) {
        slabAt.set(i * n + k, s);
        for (let j = -SLAB_T; j < 0; j++) cells.push([i, j, k]);
      }
    const v = cells.map(([i, j, k]) => texelValue(i, j, k, seed + s.i0 * 7 + s.k0, 0.45, 0.5));
    const rank = toneRanker(v, MOTTLE_W);
    cells.forEach(([i, j, k], q) => {
      const [tint, t] = MOTTLE[rank(v[q])];
      const col = mix(s.color, tint, t);
      const border = i === s.i0 || i === s.i1 - 1 || k === s.k0 || k === s.k1 - 1;
      // A pale worn rim along the top edges; the faces below it in shade.
      if (j === -1) c.set(i, j, k, border ? mix(col, CREAM, 0.22) : col, { side: scale(col, 0.86) });
      else c.set(i, j, k, scale(col, j === -SLAB_T ? 0.76 : 0.86));
    });
    // Worn-round corners.
    for (const [i, k] of [
      [s.i0, s.k0],
      [s.i1 - 1, s.k0],
      [s.i0, s.k1 - 1],
      [s.i1 - 1, s.k1 - 1],
    ])
      if (r.chance(0.8)) c.delete(i, -1, k);
  }

  // The older course below: blocks in rows along x, staggered, a dark seam under the slabs.
  for (const [k0, k1] of runs(r, 0, n, 7, 10)) {
    const off = r.int(2, 5);
    for (const [i0, i1] of runs(r, -off, n + off, 6, 10)) {
      const color = r.pick(LOWER);
      for (let i = Math.max(0, i0); i < Math.min(n, i1); i++)
        for (let k = k0; k < k1; k++)
          for (let j = -DEPTH; j < -SLAB_T; j++) {
            const col = mix(color, texelValue(i, j, k, seed + 3, 0.5, 0.5) > 0.5 ? CREAM : SPOT, 0.15);
            c.set(i, j, k, j === -SLAB_T - 1 ? scale(col, 0.72) : col);
          }
    }
  }
  // Dark earth in the joints between the older blocks; the bottom never shows.
  for (let i = 0; i < n; i++)
    for (let k = 0; k < n; k++) {
      for (let j = -DEPTH; j < -SLAB_T; j++) if (!c.has(i, j, k)) c.set(i, j, k, pickT(JOINT_EARTH, texelValue(i, j, k, seed, 0.7, 0.4)), { mat: 'soil' });
      c.ghost(i, -DEPTH - 1, k);
    }

  // Joints: dark earth two texels below the slab tops.
  const joints: [number, number][] = [];
  for (let i = 0; i < n; i++)
    for (let k = 0; k < n; k++) {
      if (slabAt.has(i * n + k)) continue;
      for (let j = -JOINT - 1; j >= -SLAB_T; j--) c.set(i, j, k, pickT(JOINT_EARTH, texelValue(i, j, k, seed, 0.7, 0.4)), { mat: 'soil' });
      joints.push([i, k]);
    }

  // Moss in a few patches round joint crossings — one by the left edge, one in
  // the back right corner, one at the front, as on the sheet — filling the
  // joints, spilling over the slabs (flush texels, raised cushions) and down the sides.
  const isJoint = (i: number, k: number) => c.inside(i, k) && !slabAt.has(i * n + k);
  const crossings = joints.filter(([i, k]) => DIRS.filter(([di, dk]) => isJoint(i + di, k + dk)).length >= 3);
  const zones: [number, number, number, number][] = [
    [0, 7, 5, n - 6],
    [n - 9, n, 0, 9],
    [5, n - 6, n - 8, n],
  ];
  const centres: [number, number, number][] = [];
  for (const [a0, a1, b0, b1] of zones) {
    const pool = crossings.filter(([i, k]) => i >= a0 && i < a1 && k >= b0 && k < b1);
    const alt = joints.filter(([i, k]) => i >= a0 && i < a1 && k >= b0 && k < b1);
    const list = pool.length ? pool : alt;
    if (list.length) centres.push([...r.pick(list), r.range(8, 11)]);
  }
  // A stray patch somewhere else.
  const stray = r.pick(crossings.length ? crossings : joints);
  centres.push([stray[0], stray[1], r.range(3, 4.5)]);
  const field = (i: number, k: number) => Math.max(0, ...centres.map(([a, b, reach]) => 1 - Math.hypot(a - i, b - k) / reach)) + (texelValue(i, 5, k, seed + 23, 0.5, 0.6) - 0.5) * 0.5;
  const mossTone = (i: number, k: number) => pickT(PATH_MOSS, texelValue(i, 0, k, seed + 22, 0.55, 0.5));
  for (const [i, k] of joints) {
    const f = field(i, k);
    if (f < 0.2 && hash3(i, 0, k, seed + 77) > 0.14) continue;
    // Moss swells out of the joint: up to the slab tops where it's thickest.
    let j = -1;
    while (j > -SLAB_T && !c.has(i, j - 1, k)) j--;
    for (let y = j; y <= (f > 0.5 ? -1 : -2); y++) c.set(i, y, k, mossTone(i + (y - j) * 3, k), { mat: 'soil' });
  }
  const cushion = c.loose();
  for (const s of slabs)
    for (let i = s.i0; i < s.i1; i++)
      for (let k = s.k0; k < s.k1; k++) {
        const f = field(i, k);
        if (!c.has(i, -1, k) || f < 0.42) continue;
        c.set(i, -1, k, mossTone(i, k), { mat: 'soil' });
        if (f < 0.55 || !r.chance(0.8)) continue;
        c.set(i, 0, k, PATH_MOSS[1], { mat: 'leaves', group: cushion, ao: true, cap: pickT(PATH_MOSS, 0.45 + hash3(i, 2, k, seed) * 0.55) });
        if (f > 0.75 && r.chance(0.6)) c.set(i, 1, k, PATH_MOSS[1], { mat: 'leaves', group: cushion, ao: true, cap: pickT(PATH_MOSS, 0.7 + hash3(i, 3, k, seed) * 0.3) });
      }
  // Moss running down the sides from the mossy edges, and along the seam under the slabs.
  const isMoss = (col: number | undefined) => col !== undefined && PATH_MOSS.includes(col);
  for (const [i, k] of c.edges()) {
    const from = isMoss(c.color(i, -1, k)) ? -2 : isMoss(c.color(i, -2, k)) ? -3 : 0;
    if (!from || !r.chance(0.85)) continue;
    const len = r.int(2, SLAB_T + 3);
    for (let j = from; j >= from + 1 - len; j--) if (c.color(i, j, k) !== undefined) c.set(i, j, k, r.pick(PATH_MOSS_SIDE), { mat: 'soil' });
  }
  for (const [i, k] of c.edges()) {
    const f = texelValue(i, 1, k, seed + 29, 0.3, 0.8) + Math.max(0, field(i, k)) * 0.4;
    if (f < 0.6) continue;
    c.set(i, -SLAB_T - 1, k, r.pick(PATH_MOSS_SIDE), { mat: 'soil' });
    if (f > 0.78) c.set(i, r.chance(0.5) ? -SLAB_T : -SLAB_T - 2, k, r.pick(PATH_MOSS_SIDE), { mat: 'soil' });
  }

  const p = new PieceBuilder();
  c.emit(p.voxels);
  p.collider(-W / 2, -DEPTH * TEXEL, -W / 2, W / 2, 0, W / 2);
  return p.done();
}

// ── Leaves + dirt ────────────────────────────────────────────────────────────

/** Dark forest humus (sheet: red-brown top, darker sides), dark → light, and shares. */
const HUMUS_TOP = [0x3a2a20, 0x523a2a, 0x6a4a34, 0x7c563c, 0x8e6444].map(onTop);
const HUMUS_TOP_W = [6, 20, 44, 22, 8];
const HUMUS_SIDE = [0x282119, 0x3e2e22, 0x523a29, 0x644631, 0x735139].map(onSide);
const HUMUS_SIDE_W = [10, 22, 32, 24, 12];
/** Pale flecks of rotted leaf on the soil. */
const FLECK = [0x8a6448, 0x9a7050, 0x7c5a42].map(onTop);
/** The seedlings at the back (sheet: lime crosses on short stems). */
const SEEDLING = { stem: 0x2e4826, leaf: [0x405e24, 0x4c6a28, 0x58762c] };

/**
 * A seedling: a stem two or three texels tall with a cross of leaves round its
 * tip, the bigger ones with the leaf tips drooping out a texel further.
 */
function seedling(g: VoxelGrid, i: number, k: number, j: number, r: Rng): void {
  const h = r.int(1, 2);
  for (let t = 0; t <= h; t++) g.set(i, j + t, k, SEEDLING.stem);
  for (const [di, dk] of DIRS) {
    g.set(i + di, j + h, k + dk, r.pick(SEEDLING.leaf));
    if (h > 1 && r.chance(0.6)) g.set(i + 2 * di, j + h - 1, k + 2 * dk, r.pick(SEEDLING.leaf));
  }
}

/** Leaves pressed into the four sides, half sunk in, a shade darker, clipped to the face. */
function sideLeaves(p: PieceBuilder, r: Rng, count: number): void {
  const thick = TEXEL / 8;
  const shapes = [LEAF_SHAPES.star, LEAF_SHAPES.trident, LEAF_SHAPES.maple, LEAF_SHAPES.bit];
  const faces: [LeafPlane, number, number][] = [
    ['+z', 0, 1],
    ['+x', 1, 0],
    ['-z', 0, -1],
    ['-x', -1, 0],
  ];
  for (const [plane, nx, nz] of faces)
    for (let q = 0; q < count; q++) {
      const leaf = randomLeaf(r, { palette: LITTER_MIX.dry, shapes, size: [0.08, 0.18], torn: 0.5, thick });
      leaf.shade = r.range(0.7, 0.9);
      const t = ((q + r.range(0.15, 0.85)) / count - 0.5) * W;
      // Most in the litter layer just under the edge, some deeper in the soil.
      const y = -r.range(0.03, q % 2 ? 0.18 : 0.4);
      const inFace = (px: number, py: number, pz: number) => Math.abs(nx ? pz : px) < W / 2 - TEXEL / 4 && py < -TEXEL / 4 && py > -DEPTH * TEXEL + TEXEL / 4;
      placeLeaf(p, leaf, { x: nx ? (nx * W) / 2 : t, y, z: nz ? (nz * W) / 2 : t, plane, yaw: r.range(0, Math.PI * 2), embed: thick / 2 }, inFace);
    }
}

function leavesDirt(seed: number): KitPiece {
  const p = new PieceBuilder();
  const r = rng(seed * 41 + 7);
  const c = new Canvas(W, W, 'soil');
  const n = c.ni;
  const cells = c.skin();
  // Dark humus, low-contrast on top, crumbly down the sides; pale flecks of rotted leaf.
  paintRanked(
    c,
    cells.filter(([, j]) => j === -1),
    HUMUS_TOP,
    HUMUS_TOP_W,
    seed,
  );
  paintRanked(
    c,
    cells.filter(([, j]) => j < -1),
    HUMUS_SIDE,
    HUMUS_SIDE_W,
    seed + 1,
  );
  for (let q = 0; q < 70; q++) {
    const [i, k] = [r.int(0, n - 1), r.int(0, n - 1)];
    c.set(i, -1, k, r.pick(FLECK));
  }
  c.emit(p.voxels);
  p.collider(-W / 2, -DEPTH * TEXEL, -W / 2, W / 2, 0, W / 2);

  // Leaves: big maple stars, middle stars and small three-pointed ones, each
  // resting on the soil or the leaves below, the ones across an edge folding down it.
  const bed = new LeafBed({ w: W, d: W, drape: true });
  const common = { bed, w: W, d: W, palette: LITTER_MIX.dry, torn: 0.2, spacing: 0.8 };
  scatterLeaves(p, { ...common, count: 9, shapes: [LEAF_SHAPES.maple], size: [0.3, 0.36], seed: seed + 1 });
  scatterLeaves(p, { ...common, count: 10, shapes: [LEAF_SHAPES.star], size: [0.2, 0.25], seed: seed + 2 });
  scatterLeaves(p, { ...common, count: 13, shapes: [LEAF_SHAPES.trident, LEAF_SHAPES.trident, LEAF_SHAPES.bit], size: [0.1, 0.15], seed: seed + 3 });

  // Seedlings in the gaps at the back, where the leaves left bare soil.
  const g = topGrid(p, { w: W, d: W, mat: 'leaves', seed });
  const at = (i: number) => -W / 2 + (i + 0.5) * TEXEL;
  for (let q = 0, tries = 0; q < 4 && tries < 200; tries++) {
    const [i, k] = [r.int(3, n - 4), r.int(2, Math.floor(n * 0.55))];
    const clear = [-2, 0, 2].every((d) => bed.top(at(i + d), at(k)) <= 0.001 && bed.top(at(i), at(k + d)) <= 0.001);
    if (!clear || [...Array(9).keys()].some((q2) => g.has(i + (q2 % 3) - 1, 1, k + Math.floor(q2 / 3) - 1))) continue;
    q++;
    seedling(g, i, k, 0, r);
    bed.raise(at(i - 2), at(k - 2), at(i + 2), at(k + 2), 0.02);
  }
  commitGrass(p, g, { seed, sun: 0.4 });
  bed.commit(p, { shadow: 0x2a1d17 });
  sideLeaves(p, r, 5);
  return p.done();
}

// ── Roots + moss + rocks ─────────────────────────────────────────────────────

/** Forest floor between the moss (sheet: dark olive-brown), dark → light. */
const FLOOR = [0x2a281e, 0x3a3626, 0x4a4230, 0x5a4e38, 0x6a5840].map(onTop);
const FLOOR_W = [10, 22, 32, 24, 12];
/** Humus down the sides (sheet: brown with dark crumbs and a few pale clods). */
const HUMUS = [0x24201c, 0x49392c, 0x5a4432, 0x654b38, 0x866145, 0xa27850].map(onSide);
const HUMUS_W = [7, 18, 27, 25, 16, 7];
/** Moss patches on the ground (sheet: dark olive to yellow-olive), dark → light, and down the sides. */
const GROUND_MOSS = [0x33311c, 0x4b451d, 0x5e5a28, 0x79702a, 0x9a9029].map(onTop);
const GROUND_MOSS_W = [8, 18, 30, 28, 16];
const SIDE_MOSS = [0x2e2e1a, 0x3d3923, 0x524f2c, 0x6a6428].map(onSide);

/**
 * The tile's hero root: warm tan bark, pale along its lit back and mid-brown
 * down its sides, a darker lower layer where it lies on the moss and a dark
 * rim under it — albedos fitted in the studio until it renders like the
 * sheet's (#c8a982–#dcad74 on top, #8b6844 down the sides).
 */
const HERO_ROOT: RootLook = {
  ridge: [0xc8a67c, 0xd0ae82, 0xbc9a72],
  bark: [0x8e7054, 0x826650, 0x987a5c],
  flank: [0x62503e, 0x6a5642],
  under: [0x3e3024, 0x362a20],
  rings: ROOT_LOOK.clean.rings,
  moss: 0.08,
};

/** The rocks' stone: the sheet's mid-grey (the field-stone palette renders too pale beside this root). */
const STONE_GREY = [0xb4b0aa, 0xa4a09a, 0x94908a, 0x827e78, 0x706c66];
/** The stones, clear of the root's course (x, z, width, height): a big one at the back left, one at the back right, a small one in front. */
const STONES: [number, number, number, number][] = [
  [-0.56, -0.6, 0.38, 0.24],
  [0.62, -0.64, 0.3, 0.2],
  [0.02, 0.56, 0.2, 0.12],
];

/**
 * The root's course: in over the middle of the back edge (its tree stands
 * behind the tile), rising proud of the ground, to the middle of the tile, then
 * on to the front of the right side and down it; limbs fork off to the left
 * (one of them down the front side) and to the middle of the right side.
 */
const HERO: TrailSpec = {
  from: [0.06, 0.1, -W / 2 + 0.01],
  heading: 1.75,
  length: 2.3,
  radius: [0.18, 0.13],
  bend: -0.6,
  drop: 0.55,
  fin: true,
  knees: [[0.66, 0.11, 0.42]],
  hang: 0.3,
  forks: [
    {
      at: 0.37,
      turn: 1.35,
      length: 0.95,
      share: 0.88,
      end: 0.75,
      knees: [[0.45, 0.1, 0.34]],
      dive: 0.15,
      forks: [{ at: 0.58, turn: -0.95, length: 0.95, share: 0.9, end: 0.8, hang: 0.26 }],
    },
    { at: 0.46, turn: -1.05, length: 0.95, share: 0.85, end: 0.8, bend: -0.3, hang: 0.24 },
  ],
};

function rootsMossRocks(seed: number): KitPiece {
  const p = new PieceBuilder();
  const r = rng(seed * 13 + 9);
  const c = new Canvas(W, W, 'soil');
  const n = c.ni;
  const cells = c.skin();

  // Moss in patches over the floor, hanging over the edges where it reaches them.
  const mossAt = (i: number, k: number) => valueNoise3(i * 0.16, 0.5, k * 0.16, seed + 11) * 0.72 + hash3(i, 0, k, seed + 12) * 0.28 > 0.44;
  const top = cells.filter(([, j]) => j === -1);
  paintRanked(
    c,
    top.filter(([i, , k]) => !mossAt(i, k)),
    FLOOR,
    FLOOR_W,
    seed,
  );
  paintRanked(
    c,
    top.filter(([i, , k]) => mossAt(i, k)),
    GROUND_MOSS,
    GROUND_MOSS_W,
    seed + 2,
    { mat: 'leaves' },
    0.55,
    0.5,
  );
  const sides = cells.filter(([, j]) => j < -1);
  paintRanked(c, sides, HUMUS, HUMUS_W, seed + 1, {}, 0.42, 0.4);
  for (const [i, k] of c.edges()) {
    if (!mossAt(i, k)) continue;
    const len = 1 + Math.floor(hash3(i, 7, k, seed + 15) * 4);
    for (let d = 0; d < len; d++) c.set(i, -2 - d, k, pickT(SIDE_MOSS, texelValue(i, d, k, seed + 16, 0.6, 0.5)), { mat: 'leaves' });
  }
  c.emit(p.voxels);
  p.collider(-W / 2, -DEPTH * TEXEL, -W / 2, W / 2, 0, W / 2);

  // Grey rocks bedded in the soil (seeds nudge them).
  const rocks: StoneBounds[] = STONES.map(([x, z, w, h], q) =>
    rock(p, { at: [x + r.range(-0.05, 0.05), 0, z + r.range(-0.05, 0.05)], size: [w, h, w * r.range(0.85, 1.1)], sink: 0.06, moss: 0.12, tone: 1, palette: STONE_GREY, seed: seed * 71 + q }),
  );
  const onRock = (x: number, z: number) => rocks.find((b) => x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2]);
  const ground: RootGround = {
    height: (x, z) => (Math.abs(x) > W / 2 || Math.abs(z) > W / 2 ? -Infinity : (onRock(x, z)?.max[1] ?? 0)),
    soft: (x, z) => !onRock(x, z),
  };

  // The root: thick, pale-backed, lying proud of the moss and arching off it
  // here and there, its limbs spread over most of the tile and hanging down
  // the front and right sides.
  const g = topGrid(p, { w: W, d: W, mat: 'leaves', seed });
  for (let j = -DEPTH; j <= -1; j++)
    for (let q = 0; q < n; q++) {
      g.ghost(q, j, 0).ghost(q, j, n - 1);
      g.ghost(0, j, q).ghost(n - 1, j, q);
    }
  for (const b of rocks)
    for (let i = Math.floor((b.min[0] + W / 2) / TEXEL); i < Math.ceil((b.max[0] + W / 2) / TEXEL); i++)
      for (let k = Math.floor((b.min[2] + W / 2) / TEXEL); k < Math.ceil((b.max[2] + W / 2) / TEXEL); k++) for (let j = 0; j < Math.round(b.max[1] / TEXEL); j++) g.ghost(i, j, k);
  const style: RootStyle = { look: HERO_ROOT, seed, ground, wiggle: 0.5, taper: 1.2, flat: 0.95, knuckle: TEXEL * 3 };
  trail(g, { ...HERO, from: [HERO.from[0] + r.range(-0.05, 0.05), HERO.from[1], HERO.from[2]], heading: HERO.heading + r.range(-0.05, 0.05) }, style, 2);
  // Cut off square at the back edge: the root runs on into the tile behind.
  const behind: Vec3[] = [];
  g.forEach((i, j, k, cell) => {
    if (k < 0 && !cell.ghost) behind.push([i, j, k]);
  });
  for (const [i, j, k] of behind) g.delete(i, j, k);
  // Bark grain: a texel here and there a shade darker or lighter (the sheet's speckled bark).
  const grain: [Vec3, number][] = [];
  g.forEach((i, j, k, cell) => {
    const h = hash3(i, j, k, seed + 31);
    if (!cell.ghost && cell.mat === 'trunk' && h < 0.16) grain.push([[i, j, k], h < 0.1 ? 0.8 : 1.1]);
  });
  for (const [[i, j, k], f] of grain) {
    const cell = g.get(i, j, k)!;
    g.put(i, j, k, { ...cell, color: scale(cell.color, f) });
  }

  // Moss cushions on the mossy ground, clear of the stones and the root (so it stays legible).
  const wood = (i: number, k: number) => {
    for (let a = i - 3; a <= i + 3; a++)
      for (let b = k - 3; b <= k + 3; b++) {
        const w = g.get(a, 0, b);
        if (w && !w.ghost && w.mat === 'trunk') return true;
      }
    return false;
  };
  for (let q = 0, tries = 0; q < 11 && tries < 160; tries++) {
    const [ci, ck] = [r.int(1, n - 2), r.int(1, n - 2)];
    const [x, z] = [-W / 2 + (ci + 0.5) * TEXEL, -W / 2 + (ck + 0.5) * TEXEL];
    if (!mossAt(ci, ck) || wood(ci, ck) || rocks.some((b) => x > b.min[0] - 0.1 && x < b.max[0] + 0.1 && z > b.min[2] - 0.1 && z < b.max[2] + 0.1)) continue;
    q++;
    const rad: Vec3 = [r.range(1.8, 3.2), r.range(1.4, 2.4), r.range(1.8, 3.2)];
    fillEllipsoid(g, [ci + 0.5, -0.3, ck + 0.5], rad, (i, j, k) => (j < 0 || !c.inside(i, k) || g.has(i, j, k) ? null : tone(ROOT_MOSS, i, j + 2, k, seed)), { rough: 0.5, seed: seed + q });
  }
  // Seedlings on the moss.
  for (let q = 0, tries = 0; q < 3 && tries < 80; tries++) {
    const [i, k] = [r.int(3, n - 4), r.int(3, n - 4)];
    if (!mossAt(i, k) || [...Array(9).keys()].some((q2) => g.has(i + (q2 % 3) - 1, 0, k + Math.floor(q2 / 3) - 1))) continue;
    q++;
    seedling(g, i, k, 0, r);
  }
  mossOver(g, { amount: 0.15, seed });
  commitRoots(g, p.voxels);
  return p.done();
}

export default defineKitAsset({
  section: '18.2',
  order: 9,
  name: 'Combination examples',
  caption: 'Ground surfaces blending into each other.',
  size: {
    real: '2 m × 2 m tiles, 0.5 m of ground; grass patches ≈ 0.4–0.5 m, 12 cm proud; slabs ≈ 0.5 m; leaves 0.1–0.36 m; root 0.36 m thick where it enters, its limbs 0.2–0.3 m; rocks 0.2–0.38 m',
    sheet: 'not given (drawn as 2 × 2 tile blocks)',
    note: 'Four of the kit’s 1 m ground tiles side by side, painted as one surface: the same 1/16 m texels, 0.5 m of ground and walkable top at y = 0 as the §18.2 tiles, so they sit in a field of them.',
  },
  variants: [
    { id: 'grass-dirt', name: 'Grass + Dirt' },
    { id: 'path-moss', name: 'Sandstone Path + Moss' },
    { id: 'leaves-dirt', name: 'Leaves + Dirt' },
    { id: 'roots-moss-rocks', name: 'Roots + Moss + Rocks' },
  ],
  shots: [
    { view: 'iso', variant: 'path-moss', label: 'Sandstone Path + Moss' },
    { view: 'iso', variant: 'leaves-dirt', label: 'Leaves + Dirt' },
    { view: 'iso', variant: 'roots-moss-rocks', label: 'Roots + Moss + Rocks' },
  ],
  ref: { sheet: 'section 18/section 18.2.png', box: [18, 676, 755, 948] },
  build: ({ variant, seed }) =>
    variant === 'path-moss' ? pathMoss(seed) : variant === 'leaves-dirt' ? leavesDirt(seed) : variant === 'roots-moss-rocks' ? rootsMossRocks(seed) : grassDirt(seed),
});
