import type { Surf } from '../../../voxel/VoxelBuilder';
import { TILE, TILE_DEPTH } from '../../lib/ground';
import { LEAF_SHAPES, LeafBed, leafPile, LITTER_MIX, placeLeaf, randomLeaf, scatterLeaves, type LeafPlane } from '../../lib/leaves';
import { PieceBuilder } from '../../PieceBuilder';
import { rng, TEXEL, type Rng } from '../../shapes';
import { soilSurf } from '../../surface';
import { defineKitAsset, type KitPiece } from '../../types';

/**
 * ⑥ Fallen leaves: a 1 m tile of dark forest humus strewn with star-shaped
 * leaves in orange, yellow, salmon and olive, as the sheet draws it — big
 * maple stars, middle stars and small three-pointed leaves lying flat or
 * overlapping a little, each with its drop shadow, the ones across an edge
 * folding down the side, more leaves pressed into the soil of the sides, pale
 * flecks of rotted leaf and a few seeds on the ground between them.
 */
interface Look {
  /** Humus albedo on top and on the sides (the soil pattern adds its crumbs). */
  soil: number;
  side: number;
  surf: Surf;
  palette: readonly number[];
  /** Whole leaves on top: big maple stars, middle stars, small three-pointed ones. */
  big: number;
  mid: number;
  small: number;
  /** Share of torn or nibbled leaves. */
  torn: number;
  /** Flat flecks of rotted leaf on the soil (sheet: the paler squares). */
  flecks: number;
  fleckTones: readonly number[];
  /** Leaves pressed into each side face. */
  sideLeaves: number;
  /** Colour of the leaves' drop shadows on the soil. */
  shadow: number;
  /** A heap in the middle. */
  pile?: boolean;
}

const LOOKS: Record<string, Look> = {
  // The sheet's main tile: bright dry leaves on dark humus.
  dry: {
    soil: 0x72554a,
    side: 0x7a5f4d,
    surf: soilSurf({ dry: 0.1 }),
    palette: LITTER_MIX.dry,
    big: 8,
    mid: 7,
    small: 8,
    torn: 0.15,
    flecks: 26,
    fleckTones: [0x86644e, 0x8f6449, 0x76584a, 0x9a6c4c],
    sideLeaves: 6,
    shadow: 0x2a1d17,
  },
  // Rain-soaked: darker, wetter soil; flat, dull brown leaves, many rotted to fragments.
  wet: {
    soil: 0x544840,
    side: 0x685446,
    surf: soilSurf({ wet: 0.45 }),
    palette: LITTER_MIX.wet,
    big: 4,
    mid: 6,
    small: 9,
    torn: 0.55,
    flecks: 34,
    fleckTones: [0x6a5444, 0x76604e, 0x5e4a3c, 0x846a52],
    sideLeaves: 4,
    shadow: 0x2a1d17,
  },
  // A heap of leaves raked or blown together, more around it.
  pile: {
    soil: 0x72554a,
    side: 0x7a5f4d,
    surf: soilSurf({ dry: 0.1 }),
    palette: LITTER_MIX.dry,
    big: 3,
    mid: 3,
    small: 5,
    torn: 0.15,
    flecks: 18,
    fleckTones: [0x86644e, 0x8f6449, 0x76584a, 0x9a6c4c],
    sideLeaves: 3,
    shadow: 0x2a1d17,
    pile: true,
  },
};

/** Seeds and crumbs of bark: the sheet's small round dots. */
const SEEDS = [0xa27448, 0x8e6440, 0xb4854e];

/**
 * The humus body as a shell of skins a millimetre thick — a top in the top's
 * tone and four sides in the sides' (the studio lights a top much harder than
 * the sheet does, so each needs its own albedo). Thin skins keep the edges crisp
 * like the neighbouring tiles; the bottom is never seen.
 */
function soil(p: PieceBuilder, look: Look): void {
  const skin = 0.001;
  const h = TILE / 2;
  p.voxels.box(0, -skin / 2, 0, TILE - 2 * skin, skin, TILE - 2 * skin, look.soil, 'soil', { surf: look.surf });
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
    p.voxels.box(nx * (h - skin / 2), -TILE_DEPTH / 2, nz * (h - skin / 2), nx ? skin : TILE, TILE_DEPTH, nz ? skin : TILE, look.side, 'soil', { surf: look.surf });
  p.collider(-h, -TILE_DEPTH, -h, h, 0, h);
}

/** Pale flecks of rotted leaf: flush texels on the soil top (a few span two), and a few seeds. */
function flecks(p: PieceBuilder, r: Rng, look: Look): void {
  const n = TILE / TEXEL;
  const used = new Set<number>();
  for (let f = 0; f < look.flecks; f++) {
    const i = r.int(0, n - 1);
    const k = r.int(0, n - 1);
    if (used.has(i * n + k)) continue;
    used.add(i * n + k);
    const wide = r.chance(0.3) && i < n - 1;
    const x = -TILE / 2 + (i + (wide ? 1 : 0.5)) * TEXEL;
    const z = -TILE / 2 + (k + 0.5) * TEXEL;
    p.voxels.box(x, TEXEL / 32, z, wide ? 2 * TEXEL : TEXEL, TEXEL / 16, TEXEL, r.pick(look.fleckTones), 'soil', { surf: look.surf });
  }
  for (let s = r.int(3, 6); s > 0; s--) {
    const x = r.range(-0.45, 0.45);
    const z = r.range(-0.45, 0.45);
    p.voxels.box(x, TEXEL / 8, z, TEXEL / 2, TEXEL / 4, TEXEL / 2, r.pick(SEEDS), 'leaves', { ry: r.range(0, Math.PI) });
  }
}

/**
 * Leaves pressed into the four sides (the sheet shows them in the soil below
 * the edge): thin plates flat on each face, half sunk in, a shade darker,
 * clipped to the face.
 */
function sideLeaves(p: PieceBuilder, r: Rng, look: Look): void {
  const thick = TEXEL / 8;
  const shapes = [LEAF_SHAPES.star, LEAF_SHAPES.trident, LEAF_SHAPES.maple, LEAF_SHAPES.bit];
  const faces: [LeafPlane, number, number][] = [['+z', 0, 1], ['+x', 1, 0], ['-z', 0, -1], ['-x', -1, 0]];
  for (const [plane, nx, nz] of faces) {
    for (let n = 0; n < look.sideLeaves; n++) {
      const leaf = randomLeaf(r, { palette: look.palette, shapes, size: [0.08, 0.19], torn: 0.5, thick });
      leaf.shade = r.range(0.72, 0.92);
      const t = ((n + r.range(0.15, 0.85)) / look.sideLeaves - 0.5) * TILE;
      // Most in the litter layer just under the edge, some deeper in the soil.
      const y = -r.range(0.03, n % 2 ? 0.2 : 0.42);
      const x = nx ? (nx * TILE) / 2 : t;
      const z = nz ? (nz * TILE) / 2 : t;
      const inFace = (px: number, py: number, pz: number) => Math.abs(nx ? pz : px) < TILE / 2 - TEXEL / 4 && py < -TEXEL / 4 && py > -TILE_DEPTH + TEXEL / 4;
      placeLeaf(p, leaf, { x, y, z, plane, yaw: r.range(0, Math.PI * 2), embed: thick / 2 }, inFace);
    }
  }
}

function build(variant: string, seed: number): KitPiece {
  const look = LOOKS[variant] ?? LOOKS.dry;
  const r = rng(seed * 41 + 7);
  const p = new PieceBuilder();
  soil(p, look);
  flecks(p, r, look);
  const bed = new LeafBed({ w: TILE, d: TILE, drape: true });
  // The heap: big leaves shingled over a dome of litter, kept clear of the edges.
  if (look.pile) leafPile(p, { bed, x: r.range(-0.02, 0.02), z: r.range(-0.04, 0.01), r: 0.37, height: 0.18, count: 23, palette: look.palette, shapes: [LEAF_SHAPES.maple, LEAF_SHAPES.star], size: [0.16, 0.24], seed });
  const common = { bed, w: TILE, d: TILE, palette: look.palette, torn: look.torn, spacing: 0.75 };
  scatterLeaves(p, { ...common, count: look.big, shapes: [LEAF_SHAPES.maple], size: [0.21, 0.26], seed: seed + 1 });
  scatterLeaves(p, { ...common, count: look.mid, shapes: [LEAF_SHAPES.star], size: [0.15, 0.19], seed: seed + 2 });
  scatterLeaves(p, { ...common, count: look.small, shapes: [LEAF_SHAPES.trident, LEAF_SHAPES.trident, LEAF_SHAPES.bit], size: [0.09, 0.13], seed: seed + 3 });
  bed.commit(p, { shadow: look.shadow });
  sideLeaves(p, r, look);
  return p.done();
}

export default defineKitAsset({
  section: '18.2',
  order: 6,
  name: 'Fallen leaves',
  caption: 'Leaf litter on dark forest humus, under the trees.',
  size: {
    real: '1 m × 1 m tile, 0.5 m of soil; leaves 0.09–0.26 m',
    sheet: 'not given (leaves ≈ ¼ of the tile)',
    note: 'The kit’s ground grid: 1 m tiles, walkable top at y = 0 and 0.5 m of soil. The sheet’s big leaves span about a quarter of the tile, i.e. 0.25 m — the size of real dipterocarp and fig leaves (15–25 cm) — so they are built at that size, small ones down to 9 cm.',
  },
  variants: [
    { id: 'dry', name: 'Dry leaves' },
    { id: 'wet', name: 'Wet leaves' },
    { id: 'pile', name: 'Leaf pile' },
  ],
  shots: [
    { view: 'iso', variant: 'wet', label: 'Wet leaves' },
    { view: 'iso', variant: 'pile', label: 'Leaf pile' },
    { view: 'top', label: 'Top view (tile)' },
  ],
  ref: { sheet: 'section 18/section 18.2.png', box: [953, 130, 1145, 662] },
  build: ({ variant, seed }) => build(variant, seed),
});
