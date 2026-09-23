import type { Surf } from '../../../voxel/VoxelBuilder';
import { PieceBuilder } from '../../PieceBuilder';
import { hash3 } from '../../../voxel/random';
import { rng, type Rng } from '../../shapes';
import { stoneSurf } from '../../surface';
import { defineKitAsset, type KitPiece } from '../../types';
import { DEPTH, N, Texels, edgeColumns, mix, onSide, onTop, scale, texelValue, toneRanker } from './_tiles';

/**
 * ③ Sandstone path: pale paving slabs like the temple causeways, 0.25–0.45 m,
 * laid in staggered rows with one-texel joints of dark earth and moss. The
 * slabs are a quarter metre thick over a course of older, darker blocks, so the
 * tile's sides show the stacked stone as on the sheet. Stones are painted
 * texel by texel like the sheet (mottled, with a pale worn rim along the top
 * edges); chips, cracks and missing pieces are texels taken out. Each tile
 * keeps a joint along its back and left edges, so a paved area of tiles has
 * one joint between every pair of slabs.
 */
const SLAB_T = 4; // slab thickness in texels (0.25 m)
const JOINT = 2; // depth of the open joint between slabs, in texels

interface PathLook {
  /** Slab lengths in texels. */
  size: [number, number];
  /** Slab tones (sheet top colours). */
  tones: readonly number[];
  surf: Surf;
  /** Moss patches, how far each reaches (texels), and the share of stray moss in other joints. */
  patches: number;
  reach: number;
  stray: number;
  /** Share of slab top edges chipped away. */
  wear: number;
  /** Moss along the seam between the slab course and the course below (0‥1). */
  seam: number;
}

const LOOKS: Record<string, PathLook> = {
  path: {
    size: [4, 6],
    tones: [0xe2b584, 0xecc393, 0xd6a878, 0xf0cb9c, 0xcf9f72],
    surf: stoneSurf(),
    patches: 4,
    reach: 4.5,
    stray: 0.08,
    wear: 0,
    seam: 0.45,
  },
  worn: {
    size: [5, 7],
    tones: [0xd8ad82, 0xcca176, 0xe0b68a, 0xc49a70],
    surf: stoneSurf({ stain: 0.2 }),
    patches: 4,
    reach: 5,
    stray: 0.25,
    wear: 0.5,
    seam: 0.5,
  },
  broken: {
    size: [6, 8],
    tones: [0xdcae7e, 0xe6b988, 0xd2a474, 0xeac090],
    surf: stoneSurf({ crack: 0.3, stain: 0.08 }),
    patches: 3,
    reach: 4.5,
    stray: 0.15,
    wear: 0.12,
    seam: 0.4,
  },
};

/**
 * Texel mottling of a stone (sheet: pale tan slabs with cream highlights and
 * grey-brown spots): each texel mixes the slab's tone towards one of these, by
 * rank so every slab shows each in its share.
 */
const SPOT = onTop(0x9c7f60);
const CREAM = onTop(0xfae0b2);
const MOTTLE: readonly [number, number][] = [
  [SPOT, 0.7],
  [SPOT, 0.3],
  [0, 0],
  [CREAM, 0.3],
  [CREAM, 0.7],
];
const MOTTLE_W = [7, 18, 36, 22, 17] as const;
/** The older course below, in shade on the sheet: tan-grey, darker. */
const LOWER = [0x8a6c4a, 0x7c6042, 0x947452, 0x74583c].map(onSide);
const EARTH = [0x4a3d2c, 0x544532, 0x3e3325].map(onTop);
const MOSS = [0x5e5c24, 0x7a7424, 0x948c26, 0x4a4a20, 0xa89c34].map(onTop);
const MOSS_SIDE = [0x4a4a22, 0x5c5a24, 0x3a3c1c, 0x6e6a28].map(onSide);
const BROKEN = [0xc4966a, 0xb88c62, 0xcc9f72].map(onTop);

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const hash = (i: number, k: number) => hash3(i, 0, k, 77);

/** A stone texel: the stone's tone mottled by rank `n` (see MOTTLE). */
const mottled = (tone: number, n: number) => mix(tone, MOTTLE[n][0], MOTTLE[n][1]);

/** Cut `len` texels from `start` into `count` pieces of at least `min`, one-texel joints between; [start, end) runs. */
function runs(r: Rng, start: number, len: number, min: number, max: number): [number, number][] {
  const room = len + 1;
  const counts = [];
  for (let n = 1; n <= 6; n++) if (n * (min + 1) <= room && n * (max + 1) >= room) counts.push(n);
  const n = counts.length ? r.pick(counts) : 1;
  // Random piece lengths within [min, max] that fill the run exactly.
  const lens = new Array<number>(n).fill(min);
  let left = len - (n - 1) - n * min;
  while (left > 0) {
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

interface Slab {
  i0: number;
  i1: number;
  k0: number;
  k1: number;
  color: number;
}

function build(variant: string, seed: number): KitPiece {
  const look = LOOKS[variant] ?? LOOKS.path;
  const r = rng(seed * 17 + 3);
  const t = new Texels('sandstone');
  const tones = look.tones.map(onTop);

  // Slabs in columns (along z), each column cut into rows of its own so the
  // joints stagger; texel column / row 0 is the tile's own joint.
  const slabs: Slab[] = [];
  for (const [i0, i1] of runs(r, 1, N - 1, look.size[0], look.size[1])) for (const [k0, k1] of runs(r, 1, N - 1, look.size[0], look.size[1])) slabs.push({ i0, i1, k0, k1, color: r.pick(tones) });
  const slabAt = new Map<number, Slab>();
  const inTile = (i: number, k: number) => i >= 0 && k >= 0 && i < N && k < N;

  // Paint the stones: texel mottling by rank, a pale worn rim along the top
  // edges, a darker bottom row where the slab sits on the course below.
  const mottle = (vals: number[]) => toneRanker(vals, MOTTLE_W);
  for (const s of slabs) {
    const cells: [number, number, number][] = [];
    for (let i = s.i0; i < s.i1; i++)
      for (let k = s.k0; k < s.k1; k++) {
        slabAt.set(i * N + k, s);
        for (let j = -SLAB_T; j < 0; j++) cells.push([i, j, k]);
      }
    const v = cells.map(([i, j, k]) => texelValue(i, j, k, seed + s.i0 * 7 + s.k0, 0.45, 0.5));
    const rank = mottle(v);
    cells.forEach(([i, j, k], n) => {
      const border = i === s.i0 || i === s.i1 - 1 || k === s.k0 || k === s.k1 - 1;
      const c = mottled(s.color, rank(v[n]));
      // The worn rim catches the light; the sides below it (and the walls of
      // the joints) sit in shade.
      if (j === -1) t.set(i, j, k, border ? mix(c, CREAM, 0.22) : c, { surf: look.surf, side: scale(c, 0.86) });
      else t.set(i, j, k, scale(c, j === -SLAB_T ? 0.78 : 0.86), { surf: look.surf });
    });
    // Rounded corners, as on the sheet's top view: the corner texels are worn away.
    for (const [i, k] of [
      [s.i0, s.k0],
      [s.i1 - 1, s.k0],
      [s.i0, s.k1 - 1],
      [s.i1 - 1, s.k1 - 1],
    ])
      if (r.chance(0.8)) t.delete(i, -1, k);
  }

  // The older course: two rows of blocks along x with staggered joints of
  // dark earth, one texel wide.
  for (const [k0, k1] of [
    [0, 8],
    [8, N],
  ]) {
    const off = r.int(2, 5);
    for (const [i0, i1] of runs(r, -off, N + off, 6, 10)) {
      const color = r.pick(LOWER);
      for (let i = Math.max(0, i0); i < Math.min(N, i1); i++)
        for (let k = k0; k < k1; k++)
          for (let j = -DEPTH; j < -SLAB_T; j++) {
            // Calmer mottling than the slabs; a dark seam under the slab course.
            const c = mottled(color, 1 + Math.min(2, Math.floor(texelValue(i, j, k, seed + 3, 0.5, 0.5) * 3)));
            t.set(i, j, k, j === -SLAB_T - 1 ? scale(c, 0.72) : c, {
              surf: look.surf,
            });
          }
    }
  }
  for (let i = 0; i < N; i++)
    for (let k = 0; k < N; k++) for (let j = -DEPTH; j < -SLAB_T; j++) if (!t.has(i, j, k)) t.set(i, j, k, EARTH[Math.floor(texelValue(i, j, k, seed, 0.7, 0.4) * EARTH.length)], { mat: 'soil' });

  // Wear: chip the slabs' top edges in runs (feet and rain rounding them off).
  const holes = new Set<number>();
  if (look.wear > 0)
    for (const s of slabs)
      for (let i = s.i0; i < s.i1; i++)
        for (let k = s.k0; k < s.k1; k++) {
          const out = DIRS.filter(([di, dk]) => slabAt.get((i + di) * N + k + dk) !== s).length;
          if (!out || texelValue(i, 0, k, seed + 31, 0.45, 0.6) < 1 - look.wear * (out >= 2 ? 1.1 : 0.7)) continue;
          t.delete(i, -1, k);
          if (out >= 2 && r.chance(look.wear * 0.6)) t.delete(i, -2, k);
        }

  // Broken: the front slab cracked across, a corner broken off another.
  if (variant === 'broken') {
    const front = slabs.filter((s) => s.k1 === N).sort((a, b) => b.i1 - b.i0 - (a.i1 - a.i0))[0];
    let ci = r.int(front.i0 + 2, front.i1 - 3);
    for (let k = front.k0; k < front.k1; k++) {
      if (k > front.k0 && r.chance(0.5)) ci = Math.max(front.i0 + 1, Math.min(front.i1 - 2, ci + (r.chance(0.5) ? 1 : -1)));
      t.delete(ci, -1, k).delete(ci, -2, k);
      holes.add(ci * N + k);
    }
    const others = slabs.filter((s) => s !== front && s.i1 - s.i0 >= 4 && s.k1 - s.k0 >= 4);
    const bit = others[r.int(0, others.length - 1)];
    if (bit)
      for (let i = bit.i0; i < bit.i1; i++)
        for (let k = bit.k0; k < bit.k1; k++) {
          const d = Math.hypot(i - bit.i0, k - bit.k0) + (texelValue(i, 0, k, seed + 41, 0.6, 0.5) - 0.5) * 1.6;
          if (d > 3.3) continue;
          for (let j = -1; j >= (d < 2 ? -3 : -2); j--) t.delete(i, j, k);
          holes.add(i * N + k);
        }
    // Stone the break laid open shows rougher and more orange.
    for (const h of holes) {
      const [hi, hk] = [Math.floor(h / N), h % N];
      for (const [di, dk] of [[0, 0], ...DIRS])
        for (let j = -1; j >= -SLAB_T; j--) if (t.color(hi + di, j, hk + dk) !== undefined && slabAt.has((hi + di) * N + hk + dk)) t.set(hi + di, j, hk + dk, r.pick(BROKEN), { surf: look.surf });
    }
  }

  // Joints and holes: dark earth up to two texels below the slab tops (the
  // groove).
  const joints: [number, number][] = [];
  for (let i = 0; i < N; i++)
    for (let k = 0; k < N; k++) {
      if (slabAt.has(i * N + k) && !holes.has(i * N + k)) continue;
      for (let j = -JOINT - 1; j >= -SLAB_T && !t.has(i, j, k); j--) t.set(i, j, k, EARTH[Math.floor(texelValue(i, j, k, seed, 0.7, 0.4) * EARTH.length)], { mat: 'soil' });
      joints.push([i, k]);
    }
  // Moss grows in patches round a few joint crossings, as on the sheet: it
  // fills the joints there and spills over the slab edges (flush texels, a
  // raised cushion here and there); a few stray bits sit in other joints.
  const isJoint = (i: number, k: number) => inTile(i, k) && (!slabAt.has(i * N + k) || holes.has(i * N + k));
  const crossings = joints.filter(([i, k]) => DIRS.filter(([di, dk]) => isJoint(i + di, k + dk)).length >= 3);
  const pool = crossings.length >= look.patches ? crossings : joints;
  const centres: [number, number][] = [];
  for (let n = 0; n < look.patches * 4 && centres.length < look.patches; n++) {
    const c = r.pick(pool);
    if (centres.every(([a, b]) => Math.hypot(a - c[0], b - c[1]) > 4)) centres.push(c);
  }
  const field = (i: number, k: number) => Math.max(0, ...centres.map(([a, b]) => 1 - Math.hypot(a - i, b - k) / look.reach)) + (texelValue(i, 5, k, seed + 23, 0.5, 0.6) - 0.5) * 0.5;
  const mossTone = (i: number, k: number) => MOSS[Math.floor(texelValue(i, 0, k, seed + 22, 0.55, 0.5) * MOSS.length)];
  for (const [i, k] of joints) {
    const f = field(i, k);
    if (f < 0.25 && hash(i, k) > look.stray) continue;
    // Moss swells out of the joint: up to the slab tops where it's thickest.
    let j = -1;
    while (j > -SLAB_T && !t.has(i, j - 1, k)) j--;
    t.set(i, j, k, mossTone(i, k), { mat: 'soil' });
    for (let y = j + 1; y <= (f > 0.5 ? -1 : -2); y++) t.set(i, y, k, mossTone(i + 3, k), { mat: 'soil' });
  }
  const cushion = t.loose();
  for (const s of slabs)
    for (let i = s.i0; i < s.i1; i++)
      for (let k = s.k0; k < s.k1; k++) {
        const f = field(i, k);
        if (!t.has(i, -1, k) || f < 0.55) continue;
        t.set(i, -1, k, mossTone(i, k), { mat: 'soil' });
        if (f > 0.72 && r.chance(0.55))
          t.set(i, 0, k, r.pick(MOSS), {
            mat: 'leaves',
            group: cushion,
            ao: true,
          });
      }
  const isMoss = (c: number | undefined) => c !== undefined && MOSS.includes(c);
  for (const [i, k] of edgeColumns()) {
    // Moss running down the tile's sides from mossy edges and joints.
    const from = isMoss(t.color(i, -1, k)) ? -2 : isMoss(t.color(i, -2, k)) ? -3 : 0;
    if (!inTile(i, k) || !from || !r.chance(0.75)) continue;
    const len = r.int(1, SLAB_T + 2);
    for (let j = from; j >= from + 1 - len; j--) if (t.color(i, j, k) !== undefined) t.set(i, j, k, r.pick(MOSS_SIDE), { mat: 'soil' });
  }

  // Moss along the seam under the slab course, as on the sheet's sides.
  for (const [i, k] of edgeColumns()) {
    const f = texelValue(i, 1, k, seed + 29, 0.3, 0.8);
    if (f < 1 - look.seam) continue;
    t.set(i, -SLAB_T - 1, k, r.pick(MOSS_SIDE), { mat: 'soil' });
    if (f > 1 - look.seam * 0.5)
      t.set(i, r.chance(0.5) ? -SLAB_T : -SLAB_T - 2, k, r.pick(MOSS_SIDE), {
        mat: 'soil',
      });
  }

  const p = new PieceBuilder();
  t.emit(p.voxels);
  p.collider(-0.5, -0.5, -0.5, 0.5, 0, 0.5);
  return p.done();
}

export default defineKitAsset({
  section: '18.2',
  order: 3,
  name: 'Sandstone path',
  caption: 'Temple paving slabs with moss in the joints.',
  size: {
    real: '1 m × 1 m tile, slabs 0.2–0.5 m, 0.25 m thick',
    sheet: 'cube ≈ 1 × 0.7 m',
    note: 'Causeway paving at Angkor Wat is sandstone slabs of roughly 0.3–0.6 m; the tile keeps the kit’s 1 m grid, walkable top at y = 0, 0.5 m deep.',
  },
  variants: [
    { id: 'path', name: 'Path tile' },
    { id: 'worn', name: 'Worn tile' },
    { id: 'broken', name: 'Broken tile' },
  ],
  shots: [
    { view: 'iso', variant: 'worn', label: 'Worn tile' },
    { view: 'iso', variant: 'broken', label: 'Broken tile' },
    { view: 'top', label: 'Top view (tile)' },
  ],
  ref: { sheet: 'section 18/section 18.2.png', box: [403, 130, 595, 662] },
  build: ({ variant, seed }) => build(variant, seed),
});
