import { hash3, valueNoise3 } from '../../../voxel/random';
import type { VoxelGrid } from '../../../voxel/VoxelBuilder';
import { fromSheet } from '../../palette';
import { PieceBuilder } from '../../PieceBuilder';
import { TEXEL } from '../../shapes';
import { barkSurf, leafSurf } from '../../surface';
import { defineKitAsset, type KitPiece } from '../../types';
import { cellKey, commitMerged } from './_samples';

/**
 * §18.1 Trunk variations — cut lengths of the trunks the trees are made of,
 * in bark rather than planks: long vertical plates split by dark furrows, a
 * few standing proud, on a trunk that tapers a little and flares at the foot,
 * moss creeping up from the ground. A straight grey-brown trunk, a thick
 * reddish-brown one, one spreading into buttress roots, one wrapped in vines
 * and a pale, ringed sugar-palm trunk. The cut tops show the wood.
 *
 * Everything is one grid of 1/16 m cells (one texel), so the plates are two
 * or three texels wide; the cells of a plate merge into one strip and the
 * bark pattern draws its ridges.
 */
const T = TEXEL;
const F = (...hex: number[]) => hex.map(fromSheet);

/** A trunk sample (lengths in texels). */
interface Bark {
  /** Height; radius at the foot and at the top (without the flare). */
  h: number;
  r0: number;
  r1: number;
  /** Extra radius at the ground, fading over `flareH`. */
  flare: number;
  flareH: number;
  /** Cross-section: 2 is round, more is squarer (the sheet's trunks are square-ish). */
  p: number;
  /** Plate tones (sampled off the sheet's lit faces) and the dark furrows between plates. */
  tones: readonly number[];
  furrow: readonly number[];
  /** Plates round the trunk (0: rings instead, the palm). */
  columns: number;
  /** Share of plates standing a texel proud, and the plates' length range (texels). */
  rough: number;
  plate: readonly [number, number];
  /** Moss on the bark: its amount at the ground, fading out by this height. */
  moss: number;
  mossH: number;
  /** Rings of the palm trunk: rows per ring, give or take one. */
  ring?: number;
}

/** Cut wood of the tops: pale sapwood round a warmer heart. */
const [SAPWOOD, HEART] = F(0xc39a6c, 0xa4744e);
/** Bright moss of the sheet's trunk feet (a lit, yellow-green cushion). */
const MOSS = F(0x7d9a35, 0x8ea83c, 0x6a8a32, 0x5f7c2c);
/** Vines: dark olive stems, yellow-green leaves (sampled off the vine-wrapped trunk). */
const VINE_STEM = F(0x5c7a2a, 0x668530, 0x52702a);
const VINE_LEAF = F(0x7f9a32, 0x92aa3a, 0x6f8c2e, 0xa3b43e);

const SAMPLES: Record<string, Bark> = {
  // Grey-brown, a slim column with a slight taper, moss round its foot.
  straight: { h: 28, r0: 4.7, r1: 3.9, flare: 1.6, flareH: 3, p: 2.6, tones: F(0xb8977a, 0xa2846a, 0x8e7460, 0xae8e72), furrow: F(0x6a5646, 0x5f4d40), columns: 8, rough: 0.3, plate: [6, 13], moss: 0.7, mossH: 7 },
  // Reddish-brown, wider, deeper ridges, mossy low down.
  thick: { h: 30, r0: 7.6, r1: 5.6, flare: 2.4, flareH: 4, p: 2.8, tones: F(0xa46a44, 0x98603e, 0xae7550, 0x8c5a3a), furrow: F(0x4a3024, 0x3f2a20), columns: 15, rough: 0.4, plate: [4, 9], moss: 0.8, mossH: 11 },
  // A warm brown trunk; the buttress roots are added round it.
  roots: { h: 28, r0: 5.6, r1: 4.8, flare: 1.2, flareH: 3, p: 2.4, tones: F(0xaa7c58, 0x9e7252, 0xb4865e, 0x946a4c), furrow: F(0x503a2c, 0x463328), columns: 12, rough: 0.35, plate: [5, 11], moss: 0.6, mossH: 6 },
  // Brown, tapering more; the vines wind round it.
  vines: { h: 29, r0: 5.2, r1: 4, flare: 1.8, flareH: 3.5, p: 2.5, tones: F(0xa27a5a, 0x967054, 0xac8462, 0x8c684e), furrow: F(0x4c3a2e, 0x42332a), columns: 11, rough: 0.35, plate: [5, 11], moss: 0.7, mossH: 8 },
  // Sugar palm: pale beige-grey, round, ringed with leaf scars, a swollen foot.
  palm: { h: 27, r0: 4.2, r1: 4, flare: 1.8, flareH: 7, p: 2, tones: F(0xbc9f82, 0xaa8e74, 0xc4a88a, 0x9e866e), furrow: F(0x6a584c, 0x5e4e44), columns: 0, rough: 0, plate: [0, 0], moss: 0.5, mossH: 5, ring: 4 },
};

/** A trunk built into a grid, and what the dressings need to know about it. */
interface Trunk {
  g: VoxelGrid;
  /** Merge group per cell: the cells of one plate, ring or root read as one piece. */
  group: Map<number, number>;
  b: Bark;
  /** Radius of the bark (texels) at a height (texels), without plates and wobble. */
  radius: (y: number) => number;
}

/** Set a cell of the trunk grid with its merge group. */
function put(t: Trunk, i: number, j: number, k: number, color: number, grp: number, mat: 'trunk' | 'leaves' = 'trunk', moss = 0): void {
  t.g.set(i, j, k, color, mat, 1, mat === 'trunk' ? barkSurf({ moss, lichen: 0.06, stain: 0.3 }) : leafSurf());
  t.group.set(cellKey(i, j, k), grp);
}

/**
 * The bark column. Round the trunk run `columns` plates, each split along its
 * length into pieces (`plate` texels long); one texel of each column is a
 * furrow sunk into the bark, some pieces stand a texel proud, and a slow
 * wobble keeps the outline from looking turned. The palm has rings instead,
 * a dark leaf scar sunk between each ring and the next.
 */
function barkTrunk(p: PieceBuilder, b: Bark, seed: number): Trunk {
  const g = p.voxels.grid({ cell: T, origin: [0, 0, 0], mat: 'trunk', jitter: 0.04, ao: 0.45, seed });
  const radius = (y: number) => b.r0 + ((b.r1 - b.r0) * y) / b.h + b.flare * Math.exp(-y / b.flareH);
  const t: Trunk = { g, group: new Map(), b, radius };
  const R = Math.ceil(b.r0 + b.flare + 2);
  const n = b.columns;
  const shift = hash3(3, 5, 7, seed) * n;
  const tilt = hash3(5, 3, 7, seed) * Math.PI * 2;
  const pick = (list: readonly number[], a: number, c: number) => list[Math.floor(hash3(a, c, 11, seed) * list.length)];
  // The palm's rings: row j belongs to ring ringOf[j]; each ring is `ring` rows tall, give or take one.
  const ringOf: number[] = [];
  for (let j = 0, ring = 0; j < b.h; ring++) {
    const len = (b.ring ?? 4) - 1 + Math.floor(hash3(ring, 8, 8, seed) * 3);
    for (let q = 0; q < len && j < b.h; q++) ringOf[j++] = ring;
  }
  for (let j = 0; j < b.h; j++) {
    const y = j + 0.5;
    const rad = radius(y);
    // About one texel of each column's width is furrow.
    const fw = n ? Math.min(0.42, n / (6.6 * rad)) : 0;
    for (let i = -R; i < R; i++)
      for (let k = -R; k < R; k++) {
        const x = i + 0.5;
        const z = k + 0.5;
        const rho = (Math.abs(x) ** b.p + Math.abs(z) ** b.p) ** (1 / b.p);
        if (rho > rad + 1.6) continue;
        const a = Math.atan2(z, x);
        const wob = (valueNoise3(Math.cos(a) * 1.4 + 4, y * 0.09, Math.sin(a) * 1.4, seed) - 0.5) * 0.9;
        let lim: number;
        let color: number;
        let grp: number;
        if (n) {
          const u = (a / (2 * Math.PI) + 0.5) * n + shift;
          const c = Math.floor(u) % n;
          const len = b.plate[0] + Math.floor(hash3(c, 1, 7, seed) * (b.plate[1] - b.plate[0] + 1));
          const s = Math.floor((j + Math.floor(hash3(c, 2, 7, seed) * len)) / len);
          const furrow = u - Math.floor(u) < fw;
          const proud = hash3(c, s, 3, seed) < b.rough;
          // (The top row closes the furrows: the cut shows a whole ring of bark.)
          lim = rad + wob + (furrow && j < b.h - 1 ? -0.9 : proud ? 0.9 : 0);
          color = furrow ? pick(b.furrow, c, s) : pick(b.tones, c, s);
          grp = furrow ? 5000 + c : 1 + c * 64 + s;
        } else {
          // The rings run a little aslant, one row up on one side and down on the other.
          const jj = Math.min(b.h - 1, Math.max(0, j + Math.round(0.8 * Math.sin(a + tilt))));
          const s = ringOf[jj];
          const scar = jj > 0 && ringOf[jj - 1] !== s && j < b.h - 2;
          lim = rad + wob * 0.4 + (scar ? -0.6 : 0);
          color = scar ? pick(b.furrow, s, 0) : pick(b.tones, s, 1);
          grp = scar ? 5000 + s : 1 + s;
        }
        if (rho > lim) continue;
        // The cut top: bark at the rim, sapwood, the heart (a palm is fibre all through).
        if (j === b.h - 1 && rho < lim - 1.2) {
          const heart = n > 0 && rho < (rad - 1) * 0.45;
          put(t, i, j, k, heart ? HEART : SAPWOOD, heart ? 9000 : 9001);
          continue;
        }
        put(t, i, j, k, color, grp, 'trunk', b.moss * Math.max(0, 1 - j / b.mossH));
      }
  }
  // A bark cell with nothing above or below it would stick out as a lone cube: drop it.
  const lone: [number, number, number][] = [];
  g.forEach((i, j, k) => {
    if (j > 0 && j < b.h - 1 && !g.has(i, j - 1, k) && !g.has(i, j + 1, k)) lone.push([i, j, k]);
  });
  for (const [i, j, k] of lone) g.delete(i, j, k);
  return t;
}

/** Is an empty cell right against the bark (one of its four sides touching a trunk cell)? */
function onBark(t: Trunk, i: number, j: number, k: number): boolean {
  if (t.g.has(i, j, k)) return false;
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].some(([di, dk]) => t.g.get(i + di, j, k + dk)?.mat === 'trunk');
}

/**
 * Moss round the foot: cushions against the bark in the lowest rows and a few
 * on the ground right beside it, in patches, thinning upwards (the bark's own
 * moss pattern does the rest).
 */
function mossFoot(t: Trunk, seed: number, amount: number): void {
  const R = Math.ceil(t.radius(0) + 3);
  for (let j = 0; j < 3; j++)
    for (let i = -R; i < R; i++)
      for (let k = -R; k < R; k++) {
        if (t.g.has(i, j, k)) continue;
        const against = onBark(t, i, j, k);
        if (!against && (j > 0 || Math.hypot(i + 0.5, k + 0.5) > t.radius(0) + 1.8)) continue;
        const patch = valueNoise3(i * 0.4, j * 0.5, k * 0.4, seed + 41) * 0.8 + hash3(i, j, k, seed + 43) * 0.2;
        if (patch < 1 - amount * 0.42 + j * 0.14 + (against ? 0 : 0.1)) continue;
        put(t, i, j, k, MOSS[Math.floor(hash3(i, j, k, seed) * MOSS.length)], 8000, 'leaves');
      }
}

/**
 * Buttress roots, like the sheet's root base: `count` fins leaving the trunk
 * high up and running down and out to the ground, thinning and curving a
 * little, wider where they meet the soil; each merged into one piece.
 */
function buttressRoots(t: Trunk, seed: number, count: number, reach: number, top: number): void {
  const rt = t.radius(0);
  const R = Math.ceil(reach + 3);
  const turn = hash3(9, 9, 9, seed) * Math.PI * 2;
  const tones = F(0xb08460, 0xa47a58, 0xba8e68, 0x9c7454);
  for (let n = 0; n < count; n++) {
    const a0 = turn + ((n + (hash3(n, 4, 4, seed) - 0.5) * 0.45) / count) * Math.PI * 2;
    const end = reach * (0.78 + 0.3 * hash3(n, 5, 5, seed));
    const high = top * (0.75 + 0.35 * hash3(n, 6, 6, seed));
    const bend = (hash3(n, 7, 7, seed) - 0.5) * 0.6;
    const tone = tones[n % tones.length];
    for (let j = 0; j < high + 1; j++)
      for (let i = -R; i < R; i++)
        for (let k = -R; k < R; k++) {
          if (t.g.has(i, j, k)) continue;
          const x = i + 0.5;
          const z = k + 0.5;
          const s0 = x * Math.cos(a0) + z * Math.sin(a0);
          if (s0 < rt * 0.5 || s0 > end) continue;
          const f = Math.max(0, (s0 - rt) / (end - rt));
          const a = a0 + bend * f * f;
          const s = x * Math.cos(a) + z * Math.sin(a);
          const d = Math.abs(-x * Math.sin(a) + z * Math.cos(a));
          const h = high * (1 - f) ** 1.5 + 1;
          const half = 1 + 1.5 * (1 - f) + Math.max(0, 2 - j) * 0.45;
          if (s > end || d > half || j + 0.5 > h) continue;
          put(t, i, j, k, tone, 7000 + n, 'trunk', j < 3 ? 0.55 : 0.15);
        }
  }
}

/**
 * Vines wound round the trunk: strands of leaf cells against the bark along
 * helices, a texel or so wide, with a leaf pair every few rows beside them.
 */
function windVines(t: Trunk, seed: number, strands: number): void {
  const R = Math.ceil(t.radius(0) + 2);
  const helix = Array.from({ length: strands }, (_, n) => ({
    a: (n / strands) * Math.PI * 2 + hash3(n, 1, 3, seed) * 0.8,
    // Radians per row: some wind left, some right, one hangs nearly straight.
    twist: (n % 2 ? -1 : 1) * (0.05 + 0.07 * hash3(n, 2, 3, seed)),
    top: t.b.h - 1 - Math.floor(hash3(n, 3, 3, seed) * 6),
  }));
  const wrap = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
  for (let j = 0; j < t.b.h; j++) {
    const rad = t.radius(j + 0.5);
    for (let i = -R; i < R; i++)
      for (let k = -R; k < R; k++) {
        if (!onBark(t, i, j, k)) continue;
        const a = Math.atan2(k + 0.5, i + 0.5);
        helix.forEach((v, n) => {
          if (j > v.top || t.g.has(i, j, k)) return;
          const off = wrap(a - v.a - v.twist * j) * rad;
          if (Math.abs(off) < 0.62) put(t, i, j, k, VINE_STEM[Math.floor(hash3(n, j, 1, seed) * VINE_STEM.length)], 8100 + n, 'leaves');
          else {
            // A leaf pair every few rows, on alternating sides.
            const node = Math.floor(j / 3);
            const side = node % 2 ? 1 : -1;
            if (Math.sign(off) === side && Math.abs(off) < 2.7 && hash3(n, node, 5, seed) < 0.8 && j % 3 !== 2)
              put(t, i, j, k, VINE_LEAF[Math.floor(hash3(n, node, 6, seed) * VINE_LEAF.length)], 8200 + n * 40 + node, 'leaves');
          }
        });
      }
  }
}

function build(variant: string, seed: number): KitPiece {
  const p = new PieceBuilder();
  const b = SAMPLES[variant] ?? SAMPLES.straight;
  const t = barkTrunk(p, b, seed);
  if (variant === 'roots') buttressRoots(t, seed, 6, 15, 12);
  if (variant === 'vines') windVines(t, seed, 3);
  mossFoot(t, seed, b.moss);
  commitMerged(t.g, p.voxels, t.group);
  // The trunk blocks as a box as wide as its foot; round it the roots are a low step.
  const hw = Math.ceil(t.radius(0) + 1) * T;
  p.collider(-hw, 0, -hw, hw, b.h * T, hw);
  if (variant === 'roots') p.collider(-0.56, 0, -0.56, 0.56, 0.25, 0.56);
  return p.done();
}

export default defineKitAsset({
  section: '18.1',
  order: 8,
  name: 'Trunk variations',
  caption: 'Straight, thick, root base, vine-wrapped and palm trunks.',
  size: {
    real: '1.7–1.9 m lengths, 0.5–0.95 m thick above the flare (0.75–1.4 m at the foot); roots spread ≈ 1.6–1.8 m',
    sheet: 'not given',
    note: 'Cut lengths of the trees’ trunks: a medium tree’s 0.6 m trunk, a large tree’s ≈1 m trunk and its buttress roots, a sugar palm’s 0.5 m trunk on its swollen foot.',
  },
  variants: [
    { id: 'straight', name: 'Straight trunk' },
    { id: 'thick', name: 'Thick trunk' },
    { id: 'roots', name: 'Root base' },
    { id: 'vines', name: 'With vines' },
    { id: 'palm', name: 'Palm trunk' },
  ],
  shots: [
    { view: 'iso', variant: 'thick', label: 'Thick trunk' },
    { view: 'iso', variant: 'roots', label: 'Root base' },
    { view: 'iso', variant: 'vines', label: 'With vines' },
    { view: 'iso', variant: 'palm', label: 'Palm trunk' },
  ],
  ref: { sheet: 'section 18/section 18.1.png', box: [520, 598, 964, 742] },
  build: ({ variant, seed }) => build(variant, seed),
});
