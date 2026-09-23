import { hash3, valueNoise3 } from '../../../voxel/random';
import type { VoxelGrid } from '../../../voxel/VoxelBuilder';
import { BlockSet } from '../../BlockSet';
import { commitGrass, flatLayer, ghostGround, grassGrid, grassTuft, PLATE, type GrassTones } from '../../lib/grass';
import { LEAF_SHAPES, LeafBed, leafPile, scatterLeaves } from '../../lib/leaves';
import { ROCK_SURF, type TexelBox } from '../../lib/rocks';
import { commitRoots, mossOver, stump, trail, type RootLook, type RootStyle } from '../../lib/roots';
import type { PieceBuilder } from '../../PieceBuilder';
import { rng, snap, TEXEL } from '../../shapes';
import { barkSurf, leafSurf, stoneSurf } from '../../surface';
import { sheetTone } from './_samples';

/**
 * The six small jungle-floor items of the §18.1 Ground Foliage strip, each a
 * builder that draws into a piece at a spot on its ground (y = 0), for the
 * strip card, dioramas and the level: a grass tuft, a small plant, a fern, a
 * leaf pile, a knotty root mound and a mossy rock. Built to real size on the
 * kit's 1/16 m texel grid; colours sampled off the sheet's strip.
 */
const T = TEXEL;
const S = (...hex: number[]) => hex.map(sheetTone);

export interface FoliageOptions {
  /** Centre of the item on the ground (x, z metres), default the origin. */
  at?: readonly [number, number];
  seed: number;
}

/** Min corner (x, z, on the texel grid) of an n × n texel grid centred on `at`. */
function corner(o: FoliageOptions, n: number): [number, number] {
  const [x, z] = o.at ?? [0, 0];
  return [snap(x - (n * T) / 2), snap(z - (n * T) / 2)];
}

/** Tone of a palette (dark → light) for a 0‥1 value. */
const pickT = (pal: readonly number[], v: number) => pal[Math.min(pal.length - 1, Math.max(0, Math.floor(v * pal.length)))];

/** A ragged disc of flush ground-cover plates round the middle of an n × n grid (radius in texels). */
function groundPatch(p: PieceBuilder, n: number, x0: number, z0: number, radius: number, tones: readonly number[], seed: number): void {
  const c = n / 2;
  flatLayer(
    p,
    n,
    n,
    [x0, 0, z0],
    (i, k) => {
      const d = (Math.hypot(i + 0.5 - c, k + 0.5 - c) + (valueNoise3(i * 0.8, 3.5, k * 0.8, seed) - 0.5) * 1.8) / radius;
      return d > 1 ? null : { color: pickT(tones, (1 - d) * 0.6 + hash3(i, 1, k, seed) * 0.4), mat: 'soil' };
    },
    PLATE,
  );
}

// ── Grass tuft ───────────────────────────────────────────────────────────────

/**
 * Blades (sheet: near-black green roots, olive stalks, yellow-lime tips) as
 * albedo: the blades' sides take the light at a slant and their tops get the
 * sunlit caps, so these sit a little under the sheet's lit tones.
 */
const TUFT: GrassTones = { base: [0x2a4222, 0x324a26], mid: [0x587428, 0x62802c], tip: [0x8c9c30, 0x9aa636] };
/** The turf the tuft grows from, dark → sunlit yellow-olive. */
const TURF = [0x3a4e24, 0x4e6228, 0x66742a, 0x7e862c, 0x92922e];

/**
 * A grass tuft about half a metre tall: a fountain of one-texel blades, most
 * nearly upright, some hooked at the tip, on a ragged mat of turf.
 */
export function turfTuft(p: PieceBuilder, o: FoliageOptions): void {
  const n = 12;
  const [x0, z0] = corner(o, n);
  const g = grassGrid(p, [x0, 0, z0], o.seed);
  ghostGround(g, -2, -2, n + 1, n + 1);
  const c = n / 2;
  for (let i = 0; i < n; i++)
    for (let k = 0; k < n; k++) {
      const d = Math.hypot(i + 0.5 - c, k + 0.5 - c) / (c - 1.2) + (valueNoise3(i * 0.7, 1.5, k * 0.7, o.seed) - 0.5) * 0.6;
      if (d <= 1) g.set(i, 0, k, pickT(TURF, 1 - d * 0.75 + (hash3(i, 0, k, o.seed) - 0.5) * 0.35));
    }
  grassTuft(g, c, c, { j: 1, height: 7, radius: 2.6, spacing: 1.6, lean: 0.5, nub: 0.65, arms: 0.3, tones: TUFT, seed: o.seed });
  commitGrass(p, g, { seed: o.seed, sun: 0.2 });
}

// ── Small plant ──────────────────────────────────────────────────────────────

/** Small plant (sheet: broad leaves, lime on top, dark green beneath and towards the stem; a dark stem on red-brown earth). */
const PLANT = {
  leaf: [0x6a8228, 0x7a902e, 0x5e7826],
  under: [0x2e4622, 0x385226],
  base: [0x3e5a26, 0x4a6428],
  stem: [0x4a3a24, 0x3a2e20],
  earth: S(0x5d3d24, 0x7a4c30, 0x8a5838, 0x9f653f),
};

/**
 * One broad leaf leaving the stem at cell (ci, j, ck) along heading `a`, `len`
 * cells long and up to 2·`w` + 1 wide: a paddle narrowing to a stalk at the
 * stem and to a point at the tip, arching up `rise` cells and drooping `droop`
 * at the tip, a dark underside under its middle.
 */
function plantLeaf(g: VoxelGrid, ci: number, j: number, ck: number, a: number, len: number, w: number, rise: number, droop: number, color: number): void {
  const [dx, dz] = [Math.cos(a), Math.sin(a)];
  const [px, pz] = [-dz, dx];
  for (let s = 0.8; s <= len + 1e-6; s += 0.5) {
    const u = s / len;
    const y = j + Math.round(rise * Math.sin(u * Math.PI * 0.55) - droop * u * u);
    const half = u < 0.2 ? 0 : u < 0.4 ? w * 0.6 : u < 0.78 ? w : u < 0.92 ? w * 0.5 : 0;
    for (let q = -Math.ceil(half); q <= Math.ceil(half); q++) {
      const off = Math.max(-half, Math.min(half, q));
      const i = Math.floor(ci + 0.5 + dx * s + px * off);
      const k = Math.floor(ck + 0.5 + dz * s + pz * off);
      if (g.has(i, y, k)) continue;
      g.set(i, y, k, u < 0.2 ? PLANT.base[0] : color);
      if (Math.abs(off) <= w * 0.6 && u > 0.3 && u < 0.8 && !g.has(i, y - 1, k)) g.set(i, y - 1, k, PLANT.under[Math.floor(hash3(i, y, k, 5) * 2)]);
    }
  }
}

/**
 * A sapling about half a metre tall: a short dark stem on a patch of
 * red-brown earth under a vase of broad paddle leaves in whorls, rising
 * from the stem and curling at the tips — the lowest spreading widest, the
 * top pair reaching up. Its cells are half a texel, so the leaves keep
 * the sheet's stepped outline at their real size.
 */
export function sapling(p: PieceBuilder, o: FoliageOptions): void {
  const n = 14;
  const [x0, z0] = corner(o, n);
  const r = rng(o.seed * 13 + 5);
  groundPatch(p, n, x0, z0, 3, PLANT.earth, o.seed);
  const g = p.voxels.grid({ cell: T / 2, origin: [x0, 0, z0], mat: 'leaves', jitter: 0.06, ao: 0.32, seed: o.seed });
  const m = 2 * n;
  ghostGround(g, 0, 0, m - 1, m - 1);
  // The stem: two cells square, the leaves leaving from its middle.
  const c = m / 2 - 1;
  const h = 10 + r.int(0, 1);
  for (let j = 0; j < h; j++) for (const [di, dk] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) g.set(c + di, j, c + dk, PLANT.stem[j < 3 ? 1 : 0], 'trunk', 1, barkSurf({ stain: 0.2 }));
  // Whorls of leaves up the stem — [height, leaves, length, half-width, rise, droop] — each
  // turned from the one below, all rising like a vase: the lowest spreading widest, the top pair reaching up.
  const whorls: [number, number, number, number, number, number][] = [
    [3, 4, 10, 2, 3, 2],
    [5, 3, 9.5, 1.9, 4, 1],
    [7, 3, 8.5, 1.7, 5, 1],
    [h, 2, 6.5, 1.4, 6, 0],
  ];
  let a = r.range(0, Math.PI * 2);
  for (const [y, count, len, w, rise, droop] of whorls) {
    for (let q = 0; q < count; q++) plantLeaf(g, c + 0.5, y, c + 0.5, a + (q * Math.PI * 2) / count + r.range(-0.25, 0.25), len * r.range(0.9, 1.08), w, rise, droop, r.pick(PLANT.leaf));
    a += Math.PI / count + r.range(0.2, 0.6);
  }
  commitGrass(p, g, { seed: o.seed, sun: 0.2 });
}

// ── Fern ─────────────────────────────────────────────────────────────────────

/** Fern leaflets (sheet: lime-topped bars over blue-green shade), dark → light, and the stalks. */
const FERN = [0x163628, 0x23482e, 0x335a34, 0x4a6e38, 0x668a3e, 0x86a246];
const FERN_STALK = 0x234a2e;
const FERN_EARTH = S(0x4e3a24, 0x6a4a2c, 0x7a5a34, 0x8a6a3a);

/**
 * One frond from the crown at (ci, ck) along heading `a`: a stalk rising in
 * half-texel rows and arching outward (stepping a texel at a time, with a
 * connecting cell so it stays one stalk), carrying a leaflet bar either side
 * on every other row — widest low down, tapering to the tip, swept forward,
 * lighter up the frond and out to the tips — over a darker, shorter band on
 * the rows between: the sheet's ladder of lit bars and shadowed seams.
 */
function frond(g: VoxelGrid, ci: number, ck: number, a: number, rows: number, reach: number, seed: number): void {
  const [dx, dz] = [Math.cos(a), Math.sin(a)];
  const [px, pz] = [-dz, dx];
  let last: [number, number] | null = null;
  for (let j = 0; j < rows; j++) {
    const t = j / (rows - 1);
    const d = 0.6 + reach * t ** 1.6;
    const [x, z] = [ci + dx * d, ck + dz * d];
    const [i, k] = [Math.floor(x), Math.floor(z)];
    if (last && (last[0] !== i || last[1] !== k)) {
      g.set(last[0], j, last[1], FERN_STALK);
      if (last[0] !== i && last[1] !== k) g.set(i, j, last[1], FERN_STALK);
    }
    last = [i, k];
    const bar = j % 2 === 0;
    const len = j < 2 || t > 0.95 ? 0 : Math.round(4.2 * Math.min(1, t * 3.5) * (1 - t) ** 0.6) - (bar ? 0 : 1);
    const tone = (s: number, qi: number, qk: number) => (bar ? pickT(FERN, 0.35 + t * 0.4 + (s / Math.max(1, len)) * 0.25 + hash3(qi, j, qk, seed) * 0.15) : pickT(FERN, 0.05 + t * 0.3 + hash3(qi, j, qk, seed) * 0.15));
    g.set(i, j, k, len > 0 ? tone(0, i, k) : FERN_STALK);
    for (const side of [-1, 1])
      for (let s = 1; s <= len; s++) {
        const qi = Math.floor(x + px * side * s + dx * s * 0.35);
        const qk = Math.floor(z + pz * side * s + dz * s * 0.35);
        if (!g.has(qi, j, qk)) g.set(qi, j, qk, tone(s, qi, qk));
      }
  }
}

/**
 * The fronds of a fern as the sheet draws it, facing the viewer of the iso
 * view (front right): [heading, rows, reach, shift] — a fan of three tall
 * ones leaning back, left, middle and right, so their leaflet bars run across
 * the view like ladders, and three low ones arching forward and out to the
 * sides. Headings are radians from +x towards +z; the shift (texels) moves a
 * frond's foot along the view's horizontal, (+x, −z).
 */
const FRONDS: [number, number, number, number][] = [
  [-2.36 - 0.9, 13, 4.4, -2],
  [-2.36, 15, 3, 0],
  [-2.36 + 0.9, 13, 4.4, 2],
  [0.78 - 0.6, 9, 4.2, 1.2],
  [0.78 + 0.6, 9, 4.2, -1.2],
  [0.78, 7, 4.4, 0],
];

/**
 * A fern about 0.8 m across and half a metre tall, facing the front right:
 * six fronds of stacked leaflet bars arching out of one crown on a patch of
 * dark earth — three tall ones fanning out behind, three low ones in front.
 */
export function fern(p: PieceBuilder, o: FoliageOptions): void {
  const n = 20;
  const [x0, z0] = corner(o, n);
  const r = rng(o.seed * 17 + 3);
  groundPatch(p, n, x0, z0, 5, FERN_EARTH, o.seed);
  // Half-texel rows: each leaflet bar is one row thick, a shadowed band between it and the next.
  const g = p.voxels.grid({ cell: [T, T / 2, T], origin: [x0, 0, z0], mat: 'leaves', jitter: 0.06, ao: 0.32, seed: o.seed });
  ghostGround(g, 0, 0, n - 1, n - 1);
  FRONDS.forEach(([a, rows, reach, shift], f) => {
    const at = shift * Math.SQRT1_2 + r.range(-0.3, 0.3);
    frond(g, n / 2 + at, n / 2 - at, a + r.range(-0.15, 0.15), Math.round(rows * r.range(0.92, 1.08)), reach * r.range(0.9, 1.1), o.seed * 31 + f);
  });
  commitGrass(p, g, { seed: o.seed, sun: 0.2 });
}

// ── Leaf pile ────────────────────────────────────────────────────────────────

/** Leaf pile (sheet: salmon-tan and orange leaves, a few green ones, dark litter and moss between). */
const PILE = [0xe29a52, 0xeaa865, 0xd48a48, 0xc47a42, 0xb06a3a, 0xf0bc80];
const PILE_GREEN = [0x9aa23e, 0x86963a];
const PILE_CORE = [0x3a2c1e, 0x4a3a26, 0x56602a, 0x46522a];
const PILE_MOSS = S(0x3a4a24, 0x56682a, 0x74862e, 0x8e9a34);

/**
 * A heap of fallen leaves about 0.6 m across and 0.3 m high: broad star and
 * oval leaves, thick like the sheet's, shingled over a dome of litter, a green
 * leaf here and there, strays round its foot and moss peeking out between them.
 */
export function leafHeap(p: PieceBuilder, o: FoliageOptions): void {
  const [x, z] = [snap(o.at?.[0] ?? 0), snap(o.at?.[1] ?? 0)];
  const r = rng(o.seed * 23 + 1);
  const bed = new LeafBed({ x, z, w: 1.1, d: 1.1 });
  // Moss lumps at the foot first, so the leaves settle over their edges.
  const n = 14;
  const [x0, z0] = corner(o, n);
  const g = grassGrid(p, [x0, 0, z0], o.seed);
  ghostGround(g, 0, 0, n - 1, n - 1);
  for (let q = 0; q < 5; q++) {
    const a = r.range(0, Math.PI * 2);
    const d = r.range(3, 4.6);
    const [ci, ck] = [Math.floor(n / 2 + Math.cos(a) * d), Math.floor(n / 2 + Math.sin(a) * d)];
    for (const [di, dk] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      if (q > 2 && (di || dk) && r.chance(0.5)) continue;
      g.set(ci + di, 0, ck + dk, r.pick(PILE_MOSS));
      if (!di && !dk && r.chance(0.5)) g.set(ci, 1, ck, PILE_MOSS[3]);
      bed.raise(x0 + (ci + di) * T, z0 + (ck + dk) * T, x0 + (ci + di + 1) * T, z0 + (ck + dk + 1) * T, g.has(ci + di, 1, ck + dk) ? 2 * T : T);
    }
  }
  commitGrass(p, g, { seed: o.seed, sun: 0.25 });
  const palette = [...PILE, ...PILE, PILE_GREEN[0], PILE_GREEN[1]];
  // Chunky leaves, as the sheet draws them: broad stars and ovals, thick plates.
  const shapes = [LEAF_SHAPES.star, LEAF_SHAPES.star, LEAF_SHAPES.maple, LEAF_SHAPES.oval];
  const thick = T / 2.5;
  leafPile(p, { bed, x, z, r: 0.28, height: 0.19, count: 46, palette, shapes, size: [0.12, 0.2], thick, torn: 0.2, core: PILE_CORE, seed: o.seed });
  scatterLeaves(p, { bed, x, z, r: 0.38, count: 5, palette, shapes, size: [0.09, 0.15], thick, spacing: 1.2, torn: 0.3, seed: o.seed + 5 });
  bed.commit(p, { shadow: 0x2a1d17 });
}

// ── Root mound ───────────────────────────────────────────────────────────────

/**
 * The mound's bark (sheet: taupe grey-browns, lit tops #ad8466–#bb9161, sides
 * #755d50–#99764f, near-black crevices), as albedo a step under the lit tops.
 */
const MOUND: RootLook = {
  bark: [0x7c624e, 0x8c7058, 0x9a7c60, 0x6e5848],
  under: [0x4a3e34, 0x40362e],
  rings: [0x3a3028, 0xa88a66, 0x8a6e54, 0xb4966e, 0x5a4a3c],
  moss: 0.35,
};
/** Chips of bark and grey-brown stone round the mound's foot, and its moss. */
const CHIPS = S(0x5e4a3a, 0x6e5a44, 0x7a6450);
const MOUND_MOSS = S(0x3e4a26, 0x5a6a2c, 0x7a8a30, 0x96a038);

/**
 * A knotty root mound about 1.2 m across and 0.45 m high: the stump of a
 * tree broken off low, seven roots leaving its flanks as buttresses that step
 * down to the ground and snake off over it, moss on their backs and in the
 * crotches between them, chips of bark and stone at its foot.
 */
export function rootMound(p: PieceBuilder, o: FoliageOptions): void {
  const [x, z] = [snap(o.at?.[0] ?? 0), snap(o.at?.[1] ?? 0)];
  const n = 26;
  const [x0, z0] = corner(o, n);
  const r = rng(o.seed * 29 + 3);
  const g = p.voxels.grid({ cell: T, origin: [x0, 0, z0], mat: 'leaves', jitter: 0.07, ao: 0.35, seed: o.seed });
  for (let i = -1; i <= n; i++) for (let k = -1; k <= n; k++) g.ghost(i, -1, k);
  // The stump, broken off low, and its roots: each leaves the flank as a
  // buttress, comes down to the ground and snakes off, some forking.
  stump(g, { look: MOUND, seed: o.seed, at: [x, z], radius: 0.19, height: 0.44, roots: 0, flare: 0.35, jag: 0.025 });
  const style: RootStyle = { look: MOUND, seed: o.seed, wiggle: 1, taper: 1.3, knuckle: T * 3 };
  const a0 = r.range(0, Math.PI * 2);
  for (let q = 0; q < 7; q++) {
    const h = a0 + (q / 7) * Math.PI * 2 + r.range(-0.2, 0.2);
    const lift = r.range(0.18, 0.32);
    const fork = r.chance(0.5) ? [{ at: 0.55, turn: r.chance(0.5) ? 0.7 : -0.7, length: 0.2, share: 0.7, dive: 0.5 }] : [];
    trail(
      g,
      { from: [x + Math.cos(h) * 0.14, lift, z + Math.sin(h) * 0.14], heading: h, length: r.range(0.42, 0.62), radius: [r.range(0.085, 0.105), 0.035], drop: lift * 1.3, curve: 1.6, fin: true, bend: r.range(-0.8, 0.8), dive: 0.3, forks: fork },
      style,
      q + 2,
    );
  }
  mossOver(g, { amount: 0.3, seed: o.seed, on: ['trunk', 'wood'] });
  // Moss in the crotches between the roots (ground cells with wood on two
  // sides), and a few chips of bark and stone about the foot.
  const wood = (i: number, k: number) => {
    const w = g.get(i, 0, k);
    return !!w && !w.ghost && w.mat !== 'leaves';
  };
  for (let i = 0; i < n; i++)
    for (let k = 0; k < n; k++) {
      if (g.has(i, 0, k) || valueNoise3(i * 0.5, 0.5, k * 0.5, o.seed + 4) < 0.4) continue;
      if ([wood(i + 1, k), wood(i - 1, k), wood(i, k + 1), wood(i, k - 1)].filter(Boolean).length >= 2) g.set(i, 0, k, pickT(MOUND_MOSS, hash3(i, 0, k, o.seed)), 'leaves', 1, leafSurf());
    }
  const c = n / 2;
  for (let q = 0, tries = 0; q < 3 && tries < 60; tries++) {
    const a = r.range(0, Math.PI * 2);
    const d = r.range(7, 10);
    const [i, k] = [Math.floor(c + Math.cos(a) * d), Math.floor(c + Math.sin(a) * d)];
    if (g.has(i, 0, k) || g.has(i + 1, 0, k) || g.has(i - 1, 0, k)) continue;
    q++;
    g.set(i, 0, k, r.pick(CHIPS), 'sandstone', 1, ROCK_SURF);
  }
  commitRoots(g, p.voxels);
  p.collider(x - 0.2, 0, z - 0.2, x + 0.2, 0.42, z + 0.2);
  p.collider(x - 0.42, 0, z - 0.42, x + 0.42, 0.18, z + 0.42);
}

// ── Mossy rock ───────────────────────────────────────────────────────────────

/** Pale warm-grey stone (sheet: lit tops #ceb49b–#ddc8ae), light → dark. */
const STONE = [0xd2bda4, 0xc6b199, 0xb9a58e, 0xab9884];
/** Moss over it (sheet: lime on the sunlit cushions, dark olive beneath), dark → light. */
const ROCK_MOSS = S(0x2c3622, 0x454f29, 0x5f6a2e, 0x7a8434, 0x929a3a, 0xa6ac40);
/**
 * The boulder as the sheet draws it, in big blocks (texels from its centre on
 * the ground): a low one on the left and a taller one on the right, one on
 * each of them (the right-hand one the highest), a smaller one in front.
 */
const BOULDER: TexelBox[] = [
  [-5, 0, -4, 0, 3, 4],
  [0, 0, -4, 5, 4, 3],
  [-4, 3, -3, 1, 6, 3],
  [0, 4, -4, 4, 7, 2],
  [-2, 0, 3, 3, 3, 5],
];

/**
 * A boulder about 0.6 m across and half a metre high with its moss: a few big
 * blocks of pale grey stone with chipped edges under a thick cap of moss over
 * its upper left side — cushions on the tops, strands hanging down the faces
 * from their edges, a skirt of moss round its foot there — the right-hand
 * block left bare.
 */
export function mossyRock(p: PieceBuilder, o: FoliageOptions): void {
  const [x, z] = [snap(o.at?.[0] ?? 0), snap(o.at?.[1] ?? 0)];
  const r = rng(o.seed * 31 + 11);
  // The stone: each seed shifts the blocks' faces a texel or so.
  const set = new BlockSet(T);
  BOULDER.forEach(([x0, y0, z0, x1, y1, z1], q) => {
    const j = () => r.int(-1, 1) * T;
    const color = STONE[(q + r.int(0, 1)) % STONE.length];
    set.add(x + x0 * T + j(), y0 * T, z + z0 * T + j(), x + x1 * T + j(), y1 * T + (y0 ? j() : 0), z + z1 * T + j(), color, { surf: stoneSurf({ lichen: 0.3, stain: 0.35, crack: 0.2, moss: q === 2 ? 0.5 : 0.15 }), broken: STONE.slice(2) });
  });
  set.erode(0.22, o.seed, { where: (_x, y) => y > T });
  set.emit(p.voxels, { seed: o.seed });
  const b = set.bounds();
  p.collider(b.min[0], 0, b.min[2], b.max[0], b.max[1], b.max[2]);

  const n = 16;
  const [x0, z0] = corner(o, n);
  const H = 10;
  const g = p.voxels.grid({ cell: T, origin: [x0, 0, z0], mat: 'leaves', jitter: 0.07, ao: 0.4, seed: o.seed, surf: leafSurf() });
  const topOf: number[] = [];
  for (let i = -1; i <= n; i++)
    for (let k = -1; k <= n; k++) {
      g.ghost(i, -1, k);
      let top = -1;
      for (let j = 0; j < H; j++)
        if (set.solidAt(x0 + (i + 0.5) * T, (j + 0.5) * T, z0 + (k + 0.5) * T)) {
          g.ghost(i, j, k);
          top = j;
        }
      if (i >= 0 && k >= 0 && i < n && k < n) topOf[i * n + k] = top;
    }
  const topAt = (i: number, k: number) => (i >= 0 && k >= 0 && i < n && k < n ? topOf[i * n + k] : -1);
  // How mossy a spot is: patches, thickest on the upper left and towards the back.
  const moss = (i: number, j: number, k: number) => valueNoise3(i * 0.45, j * 0.45, k * 0.45, o.seed + 5) * 0.5 + hash3(i, j, k, o.seed + 6) * 0.12 + (1 - i / n) * 0.5 + (j / H) * 0.22 - (k / n) * 0.12;
  // (in soft patches: dark olive in the shade and underneath, lime where the sun reaches)
  const tone = (i: number, j: number, k: number, lift = 0) => pickT(ROCK_MOSS, valueNoise3(i * 0.35, j * 0.35, k * 0.35, o.seed + 7) * 0.75 + hash3(i, j, k, o.seed + 8) * 0.2 + lift);
  for (let i = 0; i < n; i++)
    for (let k = 0; k < n; k++) {
      const top = topAt(i, k);
      if (top < 0) continue;
      const m = moss(i, top, k);
      if (m < 0.62) continue;
      // A cushion on the top, two texels where it's thickest.
      g.set(i, top + 1, k, tone(i, top + 1, k, 0.15));
      if (m > 0.9) g.set(i, top + 2, k, tone(i, top + 2, k, 0.3));
      // Strands down the open faces below its edge.
      for (const [di, dk] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const below = topAt(i + di, k + dk);
        if (below >= top || !r.chance(0.35 + (m - 0.62) * 1.2)) continue;
        const len = r.int(1, Math.max(1, top - below));
        for (let d = 0; d < len; d++) {
          const j = top - d;
          if (j <= below || g.has(i + di, j, k + dk)) break;
          g.set(i + di, j, k + dk, tone(i + di, j, k + dk, -0.15));
        }
      }
    }
  // A skirt of moss round the foot on the mossy side.
  for (let i = 0; i < n; i++)
    for (let k = 0; k < n; k++) {
      if (topAt(i, k) >= 0 || g.has(i, 0, k)) continue;
      const near = [-1, 0, 1].some((di) => [-1, 0, 1].some((dk) => topAt(i + di, k + dk) >= 0));
      if (near && moss(i, 0, k) > 0.56) g.set(i, 0, k, tone(i, 0, k));
    }
  g.commit();
}

/** Every item of the strip, in the sheet's order. */
export const FOLIAGE: { id: string; name: string; build: (p: PieceBuilder, o: FoliageOptions) => void; half: number }[] = [
  { id: 'grass-tuft', name: 'Grass tuft', build: turfTuft, half: 0.3 },
  { id: 'small-plant', name: 'Small plant', build: sapling, half: 0.32 },
  { id: 'fern', name: 'Fern', build: fern, half: 0.5 },
  { id: 'leaf-pile', name: 'Leaf pile', build: leafHeap, half: 0.36 },
  { id: 'roots', name: 'Roots', build: rootMound, half: 0.66 },
  { id: 'mossy-rock', name: 'Mossy rock', build: mossyRock, half: 0.36 },
];
