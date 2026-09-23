import { PieceBuilder } from '../../PieceBuilder';
import { rng, type Rng } from '../../shapes';
import { defineKitAsset, type KitPiece } from '../../types';
import { DEPTH, N, Texels, edgeColumns, mix, onSide, onTop, skinCells, texelValue, toneRanker } from './_tiles';

/**
 * ⑤ Lichen: old grey-brown sandstone blocks spotted with pale lichen rosettes —
 * greyish-white and beige, lobed like little flowers, standing a texel proud
 * on the tops and flat on the sides — with green moss in the gaps and joints,
 * over a browner, damper lower course, as on the sheet.
 */
interface LichenLook {
  /** Rosettes per side of the jittered grid, and their radius (texels). */
  grid: number;
  radius: [number, number];
  /** Share of rosettes raised a texel (the lichen crust); the rest lie flat on the stone. */
  raised: number;
  /** Share of the bare top grown over with moss. */
  moss: number;
  /** Flat rosettes per side face. */
  sideLichen: number;
  /** Crack lines across the stone. */
  cracks: number;
}

const LOOKS: Record<string, LichenLook> = {
  // The sheet's main cube: a rosette every 30 cm or so, moss between.
  subtle: { grid: 3, radius: [2.3, 2.9], raised: 1, moss: 0.5, sideLichen: 1, cracks: 0 },
  // Rosettes crowding into each other, more moss.
  heavy: { grid: 4, radius: [1.9, 2.4], raised: 1, moss: 0.62, sideLichen: 2, cracks: 0 },
  // Bare cracked stone with flat lichen patches.
  stone: { grid: 3, radius: [1.8, 2.6], raised: 0.35, moss: 0.16, sideLichen: 1, cracks: 4 },
};

/** Stone of the blocks (sheet: grey-brown with lighter and darker texels), top and sides. */
const STONE = { top: [0x4e4a3a, 0x655a4c, 0x786a52, 0x83735d, 0x98846e].map(onTop), side: [0x564d3e, 0x665a4a, 0x726552, 0x7e6f5a, 0x8e7d64].map(onSide) };
const STONE_W = [10, 22, 30, 24, 14];
/** The lower course: browner and damper. */
const LOWER = [0x2d2719, 0x514628, 0x5b4629, 0x6d5538, 0x735639, 0x8a6a48].map(onSide);
const LOWER_W = [10, 22, 22, 22, 16, 8];
/** Lichen: grey at the rosettes' hearts through beige to greyish white at the rims. */
const LICHEN = [0x958672, 0xae9c82, 0xc6b294, 0xd8c6a6, 0xe6d6b8].map(onTop);
const LICHEN_SIDE = [0x9c8a70, 0xb09c80, 0xc4b096, 0xd8c6ac].map(onSide);
const MOSS = [0x2e3420, 0x3c4226, 0x4e4b32, 0x5d5f2a, 0x6c6a30, 0x86861f].map(onTop);
const MOSS_SIDE = [0x2c3220, 0x3e4426, 0x505628, 0x62662c].map(onSide);
const JOINT = 0x241e16;

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Cells of a lobed rosette round (ca, cb) in a face's texel plane, with each
 * cell's distance from the heart (0‥1): four or five rounded lobes, like the
 * sheet's lichen "flowers".
 */
function rosette(r: Rng, ca: number, cb: number, radius: number, seed: number): { a: number; b: number; d: number }[] {
  const lobes = r.chance(0.6) ? 4 : 5;
  const phase = r.range(0, Math.PI * 2);
  const out: { a: number; b: number; d: number }[] = [];
  for (let a = Math.floor(ca - radius - 1); a <= ca + radius + 1; a++)
    for (let b = Math.floor(cb - radius - 1); b <= cb + radius + 1; b++) {
      const [dx, dz] = [a + 0.5 - ca, b + 0.5 - cb];
      const d = Math.hypot(dx, dz);
      const edge = radius * (0.66 + 0.38 * Math.cos(lobes * Math.atan2(dz, dx) + phase)) + (texelValue(a, 3, b, seed, 0.9, 0.4) - 0.5) * 0.6;
      if (d < edge) out.push({ a, b, d: Math.min(1, d / radius) });
    }
  return out;
}

/** Lichen tone of a rosette cell: greyer towards the heart, paler towards the rim, well speckled. */
function lichenTone(pal: readonly number[], d: number, v: number): number {
  return pal[Math.min(pal.length - 1, Math.max(0, Math.floor((d * 0.45 + v * 0.55) * pal.length)))];
}

function build(variant: string, seed: number): KitPiece {
  const look = LOOKS[variant] ?? LOOKS.subtle;
  const r = rng(seed * 23 + 11);
  const t = new Texels('sandstone');
  const cells = skinCells(t);

  // Blocks: 2 × 2 on top; down the sides a grey course over a browner one,
  // staggered. Joints are dark texel lines.
  const along = (i: number, k: number) => (k === 0 || k === N - 1 ? i : k);
  const joint = (i: number, j: number, k: number) => (j === -1 ? i % 8 === 0 || k % 8 === 0 : j === -5 || (along(i, k) + (j < -4 ? 4 : 0)) % 8 === 0);
  // (blotchier than the dirt: weathered stone reads in patches, not speckle)
  const value = ([i, j, k]: [number, number, number]) => texelValue(i, j, k, seed, 0.4, 0.72);
  const rankUp = toneRanker(cells.filter(([, j]) => j >= -4).map(value), STONE_W);
  const rankLow = toneRanker(cells.filter(([, j]) => j < -4).map(value), LOWER_W);
  for (const c of cells) {
    const [i, j, k] = c;
    let color = j >= -4 ? (j === -1 ? STONE.top : STONE.side)[rankUp(value(c))] : LOWER[rankLow(value(c))];
    if (joint(i, j, k)) color = mix(color, j === -1 ? onTop(JOINT) : onSide(JOINT), 0.6);
    t.set(i, j, k, color);
  }

  // Cracks (bare-stone variant): jagged dark lines wandering across the top.
  for (let n = 0; n < look.cracks; n++) {
    let [i, k] = [r.int(1, N - 2), r.chance(0.5) ? 0 : N - 1];
    const dk = k === 0 ? 1 : -1;
    for (let s = r.int(8, 14); s > 0 && i >= 0 && i < N && k >= 0 && k < N; s--) {
      const c = t.color(i, -1, k);
      if (c !== undefined) t.set(i, -1, k, mix(c, onTop(JOINT), 0.75));
      if (r.chance(0.55)) k += dk;
      else i += r.chance(0.5) ? 1 : -1;
    }
  }

  // Rosettes on top: a jittered grid; each raised a texel as one crust (the
  // sheet's lichen stands proud of the stone) or lying flat.
  const crust = t.loose();
  const lichen = new Set<number>();
  const step = N / look.grid;
  for (let gi = 0; gi < look.grid; gi++)
    for (let gk = 0; gk < look.grid; gk++) {
      const ci = (gi + 0.5) * step + r.range(-0.25, 0.25) * step;
      const ck = (gk + 0.5) * step + r.range(-0.25, 0.25) * step;
      const up = r.chance(look.raised);
      for (const { a: i, b: k, d } of rosette(r, ci, ck, r.range(look.radius[0], look.radius[1]), seed + gi * 7 + gk)) {
        if (i < 0 || k < 0 || i >= N || k >= N) continue;
        const c = lichenTone(LICHEN, d, texelValue(i, 9, k, seed + 5, 0.8, 0.4));
        lichen.add(i * N + k);
        // The crust: one body (grey-beige sides), each texel's top painted, the heart darker.
        if (up) t.set(i, 0, k, LICHEN[0], { group: crust, ao: true, cap: d < 0.22 ? LICHEN[0] : c });
        else t.set(i, -1, k, c);
      }
    }

  // Fill one-texel holes in the crust (their rounded corners read as pegs).
  for (let i = 1; i < N - 1; i++)
    for (let k = 1; k < N - 1; k++)
      if (!t.has(i, 0, k) && DIRS.every(([di, dk]) => t.has(i + di, 0, k + dk))) {
        t.set(i, 0, k, LICHEN[0], { group: crust, ao: true, cap: LICHEN[1] });
        lichen.add(i * N + k);
      }

  // Moss over the bare stone between the rosettes (and in the joints), by rank
  // so each variant gets its share, a little extra hugging the rosettes' feet.
  const bare = cells.filter(([i, j, k]) => j === -1 && !lichen.has(i * N + k));
  const growth = bare.map(([i, j, k]) => texelValue(i, j, k, seed + 31, 0.32, 0.7) + (joint(i, j, k) ? 0.12 : 0));
  const cut = [...growth].sort((x, y) => y - x)[Math.floor(bare.length * look.moss)] ?? 2;
  bare.forEach(([i, j, k], n) => {
    const near = DIRS.some(([di, dk]) => lichen.has((i + di) * N + k + dk));
    if (growth[n] > cut || (near && growth[n] > cut - 0.1)) t.set(i, j, k, MOSS[Math.floor(texelValue(i, j, k, seed + 32, 0.6, 0.5) * MOSS.length)], { mat: 'leaves' });
  });
  // Moss along the seam between the courses and up some of the side joints.
  for (const [i, j, k] of cells) {
    const g = texelValue(i, j, k, seed + 35, 0.3, 0.8);
    if (j < -1 && ((j === -5 && g > 0.42) || (j === -4 && g > 0.6) || (joint(i, j, k) && j > -5 && g > 0.62)))
      t.set(i, j, k, MOSS_SIDE[Math.floor(texelValue(i, j, k, seed + 36, 0.6, 0.5) * MOSS_SIDE.length)], { mat: 'leaves' });
  }

  // Flat rosettes on the sides' grey course (as on the sheet's right face).
  for (const [face, fixed] of [
    ['z', N - 1],
    ['x', N - 1],
    ['z', 0],
    ['x', 0],
  ] as const)
    for (let n = 0; n < look.sideLichen; n++) {
      const ca = r.range(2.5, N - 2.5);
      const cj = r.range(-4.2, -1.8);
      for (const { a, b, d } of rosette(r, ca, cj, r.range(2.3, 3), seed + 61 + n)) {
        const j = b;
        if (a < 0 || a >= N || j >= -1 || j < -5) continue;
        const [i, k] = face === 'z' ? [a, fixed] : [fixed, a];
        if (t.color(i, j, k) !== undefined) t.set(i, j, k, lichenTone(LICHEN_SIDE, d, texelValue(i, j, k, seed + 62, 0.8, 0.4)));
      }
    }

  // Moss dripping down from mossy edges.
  for (const [i, k] of edgeColumns()) {
    const c = t.color(i, -1, k);
    if (c === undefined || !MOSS.includes(c) || !r.chance(0.7)) continue;
    const len = r.int(1, 5);
    for (let j = -2; j >= Math.max(-DEPTH, -1 - len); j--) t.set(i, j, k, MOSS_SIDE[Math.floor(texelValue(i, j, k, seed + 33, 0.6, 0.5) * MOSS_SIDE.length)], { mat: 'leaves' });
  }

  const p = new PieceBuilder();
  t.emit(p.voxels);
  p.collider(-0.5, -0.5, -0.5, 0.5, 0, 0.5);
  return p.done();
}

export default defineKitAsset({
  section: '18.2',
  order: 5,
  name: 'Lichen',
  caption: 'Old stone spotted with pale lichen, moss in the gaps.',
  size: {
    real: '1 m × 1 m tile, 0.5 m deep; rosettes 25–40 cm',
    sheet: 'cube ≈ 1 × 0.7 m',
    note: 'The kit’s ground grid: 1 m tiles, walkable top at y = 0 (the lichen crust stands one texel proud), 0.5 m deep so every ground tile lines up. Crustose lichen rosettes on Angkor’s sandstone grow a few cm to ~0.4 m across.',
  },
  variants: [
    { id: 'subtle', name: 'Subtle lichen' },
    { id: 'heavy', name: 'Heavy lichen' },
    { id: 'stone', name: 'Stone + lichen' },
  ],
  shots: [
    { view: 'iso', variant: 'heavy', label: 'Heavy lichen' },
    { view: 'iso', variant: 'stone', label: 'Stone + lichen' },
    { view: 'top', label: 'Top view (tile)' },
  ],
  ref: { sheet: 'section 18/section 18.2.png', box: [771, 130, 963, 662] },
  build: ({ variant, seed }) => build(variant, seed),
});
