import { Color } from 'three';
import { hash3, valueNoise3 } from '../../voxel/random';
import type { Surf } from '../../voxel/VoxelBuilder';
import { POND, pondFlora, type PondFloraOptions } from '../assets/20/_pond';
import { fromSheet } from '../palette';
import type { PieceBuilder } from '../PieceBuilder';
import { here, rng, snap, TEXEL, type Rng } from '../shapes';
import { leafSurf, soilSurf, stoneSurf } from '../surface';

export { bloomGrid, FloatLayer, floatingLeaf, lilyPad, lotusBud, lotusFlower, POND, pondFlora, waterBody } from '../assets/20/_pond';

/**
 * §17 moat & water — the water every kit piece uses: the §17.1 tiles (water
 * surface, shallow, deep, the five water colours), the shore and embankment
 * pieces, the §17.2 details and the §21.3 moat section.
 *
 * What the sheets draw: a slab of translucent water whose top is a mosaic of
 * soft light and dark squares with sun glints, framed by a pale glassy band,
 * over a band of bed blocks; through shallow water the bed (stones, sand,
 * weed) shows clearly, deep water is a dark saturated blue with no bottom in
 * sight, and the sides of a tile show the depth like a glass box — the bed's
 * colours coming through near the bottom.
 *
 * How it is built. The `water` family is translucent at a fixed opacity
 * (0.84), so a bed under it shows only faintly. The water is therefore a
 * painted skin, as the sheet paints it: a surface layer ({@link SURFACE_LAYER}
 * thick) of 1/4 m mosaic cells, split into 1/8 m cells where detail needs it,
 * each coloured with what one sees there — the water's own tone, darker with
 * depth, blended with the bed, stone or weed under it by how clear the water
 * is (stones get a darker front and right side painted beside them, so they
 * read as blocks); a pale rim a texel wide along each glass side; and on a
 * glass side a wall a texel thick, painted with what one sees looking in and
 * down through it. The real bed is built too: its blocks show along the
 * tile's foot and faintly through the water, and carry the colliders. The
 * skin is emitted nearest-first for the studio's iso camera (surface, then
 * the front walls, then the back ones): with one draw call per family the
 * first surface drawn hides what lies behind it, so a pixel blends one layer
 * of water over the bed, not three.
 *
 * Placement contract (every water piece):
 *  - The water surface is at `top` (default y = 0, like a ground tile's
 *    walkable top); the bed and its base blocks lie below it.
 *  - A rectangle x0‥x1 × z0‥z1 on the 1/8 m grid (a 4 m tile runs −2‥2).
 *  - Each side is `'glass'` (a finished face, as on the sheets' tiles) or
 *    `'open'` (no face: the water runs on into a neighbouring piece, a bank or
 *    a wall — let the rectangle reach a texel into a bank so no seam shows).
 *  - In the moat the surface sits 2.5 m below the bank top ({@link MOAT}):
 *    place a tile at y = MOAT.surface. Tiles of the three depths
 *    ({@link WATER_DEPTH}) share the surface, so their beds step down 0.5 m
 *    from the shallow margins to the deep middle; {@link slopedBed} makes a
 *    bed that slopes instead.
 *  - Colliders: the bed is walkable (one box per flat patch); the water is a
 *    `noStand` box from the lowest bed up to the surface.
 *
 * Usage — a 4 × 4 m tile of open moat water with a few lilies:
 *
 *   const p = new PieceBuilder();
 *   const s = waterTile(p, { depth: WATER_DEPTH.open, tint: 'moat', bed: 'silt', seed });
 *   lilies(p, s, { seed, clusters: 3, flowers: 1 });
 *
 * and water meeting a bank along its back (−z) side, shallow there and deep
 * at the front, the bank's submerged stones seen through it and a damp line
 * on the bank's face:
 *
 *   water(p, { x0: -4, z0: -2, x1: 4, z1: 2, sides: { nz: 'open' },
 *     depth: slopedBed({ axis: 'z', from: -2, to: 2, depths: [0.25, 1.5] }),
 *     under: (x, z) => (z < -1.5 ? { y: -0.3, color: STEP } : null), bed: 'silt', seed });
 *   waterline(p, { side: 'pz', at: -2, from: -4, to: 4, top: 0, seed });
 *
 * Extending the surface (§17.2): `overlay` repaints the surface texel by
 * texel (ripple rings, reflections, foam), and the returned
 * {@link WaterSurface} gives the rectangle, height and depths for things laid
 * on it (lily pads, debris, animated extras).
 */

// ── Kit standard ─────────────────────────────────────────────────────────────

/** Side of a water tile (m): moat and pond water is laid in 4 m squares. */
export const WATER_TILE = 4;

/**
 * Metres of water of the §17.1 tiles: the shallow margins (0.25–0.75 m), open
 * moat water (the moat holds 1–1.5 m on average) and its deep middle.
 */
export const WATER_DEPTH = { shallow: 0.5, open: 1.0, deep: 1.5 } as const;

/** Moat levels relative to the bank top (SIZES-ARCH §1.15): bank, water surface, deep bottom. */
export const MOAT = { bank: 0, surface: -2.5, bottom: -4.0 } as const;

/** Bed blocks under the lowest point of the bed (m). */
export const BED_BASE = 0.25;

/** Mosaic cell of the surface and the glass sides (the sheets' water "pixels"). */
export const WATER_CELL = 0.25;

/** The surface layer: one mosaic cell deep — the glassy band the sheets draw along a tile's top. */
export const SURFACE_LAYER = WATER_CELL;

/** Half a mosaic cell: where a cell holds detail (a stone's edge, a glint) it is split in four. */
const SUB = WATER_CELL / 2;

/** Bed blocks: one soil column per 1/4 m. */
const BED_CELL = 0.25;

// ── Water colours ────────────────────────────────────────────────────────────

/** How a body of water looks. Colours are sRGB albedo. */
export interface WaterTint {
  /** Mosaic tones of open water about 1 m deep, dark → light. */
  tones: readonly number[];
  /** Tones it takes where 1.5 m deep or more (no bottom in sight), dark → light. */
  abyss: readonly number[];
  /** How far one sees into it (m): under this much water the bed shows at about a third. */
  clarity: number;
  /** Share of each linear RGB channel of the bed's colour left after 1 m of water (red goes first). */
  filter: readonly [number, number, number];
  /** Sun glints on the surface. */
  glint: number;
}

export type WaterTintName = 'moat' | 'clear' | 'blue' | 'green' | 'dark' | 'muddy';

const sheet = (list: readonly number[]) => list.map(fromSheet);

/**
 * The sheets' waters (tones sampled from their tiles): `moat` is sheet A's
 * calm water surface (a deep teal blue, gold glints), the others are sheet
 * B's water colour variations.
 */
export const WATER_TINTS: Record<WaterTintName, WaterTint> = {
  moat: { tones: sheet([0x0c3f5d, 0x11506e, 0x245f6a, 0x1d6b84]), abyss: sheet([0x002440, 0x002b4b, 0x003355, 0x003d63, 0x004b74]), clarity: 0.55, filter: [0.45, 0.72, 0.85], glint: 0xf0e2a8 },
  clear: { tones: sheet([0x4f93b4, 0x5ea2c2, 0x72b2d0, 0x8cc4dc]), abyss: sheet([0x1f4f5c, 0x2e6975]), clarity: 1.3, filter: [0.7, 0.88, 0.95], glint: 0xfaf4dc },
  blue: { tones: sheet([0x184d70, 0x2c6c9a, 0x3a7aa8, 0x619cc3]), abyss: sheet([0x0d3752, 0x1d5174]), clarity: 0.8, filter: [0.45, 0.72, 0.95], glint: 0xf6f0d8 },
  green: { tones: sheet([0x1c4a3a, 0x2a5a3c, 0x376d48, 0x4f7c40]), abyss: sheet([0x173a2c, 0x1c4a3a]), clarity: 0.4, filter: [0.6, 0.8, 0.45], glint: 0xe8e6a0 },
  dark: { tones: sheet([0x113646, 0x1a4252, 0x204c5e, 0x2c5a6c]), abyss: sheet([0x0b2430, 0x113646]), clarity: 0.3, filter: [0.4, 0.55, 0.62], glint: 0xdfe0c8 },
  muddy: { tones: sheet([0x7e6c50, 0x8e795b, 0x97805e, 0xa78d64]), abyss: sheet([0x6b5a42, 0x776347]), clarity: 0.12, filter: [0.85, 0.72, 0.5], glint: 0xf2e6c4 },
};

/**
 * Linear gains from a painted colour to the albedo that renders like it: the
 * water family's glossy, see-through faces come out darker and greyer than a
 * matte block of the same albedo (calibrated on the studio render against
 * sheet A's tiles). Its glass sides render lighter on the sheets than a lit
 * side face does, hence their own gain.
 */
const TOP_GAIN: Rgb = [0.8, 1.12, 1.35];
const SIDE_GAIN: Rgb = [0.95, 1.35, 1.5];

// ── Beds ─────────────────────────────────────────────────────────────────────

/** What lies under the water (true colours, not as seen through water). Counts are per m² of bed. */
export interface BedLook {
  /** Tones of the bed blocks (one per 1/4 m column; the `soil` pattern draws the grit). */
  tones: readonly number[];
  surf: Surf;
  /** Sunken stones: blocks of `size` × `size` eighth-metres, `tall` texels above the bed. */
  stones?: { per: number; size: [number, number]; tall: [number, number]; tones: readonly number[]; surf: Surf };
  /** Pebbles: one or two texels across, one high. */
  pebbles?: { per: number; tones: readonly number[] };
  /** Water weed: clumps of blades, `tall` texels high. */
  weeds?: { per: number; tall: [number, number]; tones: readonly number[] };
}

export type BedKind = 'silt' | 'sand' | 'stones' | 'pebbles' | 'weeds';

/**
 * Beds of the sheets' tiles: `silt` under open and deep water (olive-khaki
 * blocks, a few dark sunken stones); `stones`, sheet A's shallow water (a
 * jumble of sunken blocks, olive, tan and mossy, on orange-brown ground);
 * `sand`, `pebbles` and `weeds`, its small tiles (a sandy bed dotted with
 * pebbles, stones and olive weed). The bed blocks' tones are the sheets' own
 * (their sides show in the open along a tile's foot).
 */
export const BED_LOOKS: Record<BedKind, BedLook> = {
  silt: {
    tones: sheet([0x8a8360, 0x7f7c62, 0x8c8462, 0x847e5c]),
    surf: soilSurf({ moss: 0.1 }),
    stones: { per: 0.3, size: [2, 4], tall: [1, 3], tones: [0x6a6a4e, 0x77724f, 0x5c5e48], surf: stoneSurf({ moss: 0.5, stain: 0.45 }) },
  },
  stones: {
    tones: sheet([0xa57748, 0xbb9352, 0xa98a50, 0x9e784d]),
    surf: soilSurf({ wet: 0.1 }),
    stones: { per: 3.6, size: [2, 4], tall: [2, 6], tones: [0xc8c07a, 0x9aa860, 0xe0cc8a, 0xb8a270, 0x8a9858, 0xd6b674], surf: stoneSurf({ moss: 0.35, stain: 0.3 }) },
    pebbles: { per: 2, tones: [0x9a8a60, 0x7e7a58, 0xb8a878] },
  },
  sand: {
    tones: sheet([0xc4af61, 0xb9ac5f, 0xbb9352, 0xc2a85c]),
    surf: soilSurf({ dry: 0.15 }),
    pebbles: { per: 1.5, tones: [0x8a7a5c, 0x9a8f84, 0x7a7466, 0xa89c88] },
    weeds: { per: 0.9, tall: [2, 4], tones: [0x6e7a3c, 0x5c6c34, 0x7f8a44] },
  },
  pebbles: {
    tones: sheet([0xb9ac5f, 0xa98a50, 0xc4af61]),
    surf: soilSurf({ dry: 0.1 }),
    stones: { per: 0.8, size: [1, 3], tall: [1, 2], tones: [0x9a8f84, 0x8a7a5c, 0xa89c88], surf: stoneSurf({ moss: 0.2, stain: 0.3 }) },
    pebbles: { per: 5, tones: [0x9a8f84, 0x8a7a5c, 0xa89c88, 0x6e6a60, 0xb8ab94] },
  },
  weeds: {
    tones: sheet([0x9e8a58, 0x8e7c50, 0xa98a50]),
    surf: soilSurf({ wet: 0.2, moss: 0.3 }),
    pebbles: { per: 1.5, tones: [0x8a7a5c, 0x9a8f84] },
    weeds: { per: 3.5, tall: [2, 6], tones: [0x5c6c34, 0x6e7a3c, 0x4c5e2c, 0x7f8a44] },
  },
};

// ── Bed shapes ───────────────────────────────────────────────────────────────

/** Depth of water (m) at a point. */
export type DepthFn = (x: number, z: number) => number;

/**
 * A bed sloping along x or z: `depths[0]` of water at `from`, `depths[1]` at
 * `to`, linear between and level beyond (`ease` rounds the ends off, like a
 * bank's toe running into the flat bottom).
 */
export function slopedBed(o: { axis: 'x' | 'z'; from: number; to: number; depths: [number, number]; ease?: boolean }): DepthFn {
  return (x, z) => {
    const t = Math.min(1, Math.max(0, ((o.axis === 'x' ? x : z) - o.from) / (o.to - o.from)));
    const s = o.ease ? t * t * (3 - 2 * t) : t;
    return o.depths[0] + (o.depths[1] - o.depths[0]) * s;
  };
}

// ── The water ────────────────────────────────────────────────────────────────

export type WaterSide = 'px' | 'nx' | 'pz' | 'nz';

/** A side of the water: a finished glass face, or none (it runs on into more water, a bank or a wall). */
export type WaterEdge = 'glass' | 'open';

/** Something under the water that another piece builds (a submerged step, a bank's toe): its top and colour. */
export type UnderFn = (x: number, z: number) => { y: number; color: number } | null;

export interface WaterOptions {
  /** The water's rectangle (m, on the 1/8 m grid). */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Height of the surface (default 0). */
  top?: number;
  /** Metres of water: a number, or a {@link DepthFn} for a bed that slopes (stepped to the texel grid). */
  depth: number | DepthFn;
  tint?: WaterTintName | WaterTint;
  /** The bed: a look, or false when another piece builds the floor (give `under` so it shows through). */
  bed?: BedKind | BedLook | false;
  /** Bed blocks under its lowest point (default {@link BED_BASE}). */
  base?: number;
  /** Each side's face (default all 'glass'). */
  sides?: Partial<Record<WaterSide, WaterEdge>>;
  /** Things built by the caller under the water, painted through it where they rise above the bed. */
  under?: UnderFn;
  /** Sun glints on the surface, 0‥1 (default 0.3): a patch of short streaks and a few loose ones. */
  glints?: number;
  /** Glint colour (default the tint's). */
  glint?: number;
  /** Repaint the surface texel by texel (sRGB in, sRGB out, before the render gain): ripples, reflections, foam (§17.2). */
  overlay?: (x: number, z: number, color: number) => number;
  seed: number;
}

/** The water's surface, for things laid on it or painted over it. */
export interface WaterSurface {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  top: number;
  /** Metres of water at a point (the bed as built, texel-stepped). */
  depthAt: (x: number, z: number) => number;
  tint: WaterTint;
}

type Rgb = [number, number, number];
const _c = new Color();
const lin = (hex: number): Rgb => {
  _c.setHex(hex);
  return [_c.r, _c.g, _c.b];
};
const hexOf = (c: Rgb): number => _c.setRGB(Math.min(1, c[0]), Math.min(1, c[1]), Math.min(1, c[2])).getHex();
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];
const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const spread = (list: Rgb[]) => {
  let d = 0;
  for (const a of list) for (const b of list) d = Math.max(d, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
  return d;
};
const average = (list: Rgb[]): Rgb => {
  const s: Rgb = [0, 0, 0];
  for (const c of list) for (let q = 0; q < 3; q++) s[q] += c[q] / list.length;
  return s;
};

/** One thing on the bed as the painter sees it. */
interface BedThing {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y: number;
  top: Rgb;
  side: Rgb;
}

/**
 * What lies under the water, texel by texel: the height and colour of the
 * topmost thing (bed, stone, weed, the caller's `under`), and the colour of
 * its sides.
 */
class BedMap {
  readonly n: number;
  readonly m: number;
  readonly y: Float32Array;
  private readonly top: Float32Array;
  private readonly side: Float32Array;
  constructor(
    readonly x0: number,
    readonly z0: number,
    x1: number,
    z1: number,
  ) {
    this.n = Math.round((x1 - x0) / TEXEL);
    this.m = Math.round((z1 - z0) / TEXEL);
    this.y = new Float32Array(this.n * this.m).fill(-Infinity);
    this.top = new Float32Array(this.n * this.m * 3);
    this.side = new Float32Array(this.n * this.m * 3);
  }

  index(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / TEXEL);
    const k = Math.floor((z - this.z0) / TEXEL);
    return i < 0 || k < 0 || i >= this.n || k >= this.m ? -1 : k * this.n + i;
  }

  /** Lay a thing: it wins the texels where it is the highest. */
  lay(t: BedThing): void {
    const i0 = Math.max(0, Math.round((t.x0 - this.x0) / TEXEL));
    const i1 = Math.min(this.n, Math.round((t.x1 - this.x0) / TEXEL));
    const k0 = Math.max(0, Math.round((t.z0 - this.z0) / TEXEL));
    const k1 = Math.min(this.m, Math.round((t.z1 - this.z0) / TEXEL));
    for (let k = k0; k < k1; k++)
      for (let i = i0; i < i1; i++) {
        const a = k * this.n + i;
        if (t.y < this.y[a]) continue;
        this.y[a] = t.y;
        this.top.set(t.top, a * 3);
        this.side.set(t.side, a * 3);
      }
  }

  topOf(a: number): Rgb {
    return [this.top[a * 3], this.top[a * 3 + 1], this.top[a * 3 + 2]];
  }

  sideOf(a: number): Rgb {
    return [this.side[a * 3], this.side[a * 3 + 1], this.side[a * 3 + 2]];
  }
}

/** Mosaic tone index of a 1/4 m cell: patches about a metre across, with single cells breaking out of them. */
function mosaic(ci: number, ck: number, n: number, seed: number): number {
  const patch = valueNoise3(ci * 0.27, ck * 0.27, 0.5, seed);
  const t = (patch - 0.5) * 1.9 + (hash3(ci, ck, 7, seed) - 0.5) * 0.75 + 0.5;
  return Math.min(n - 1, Math.max(0, Math.floor(t * n)));
}

/**
 * A pane of the skin, waiting to be sorted: `group` 0 the surface, 1 the
 * front sides, 2 the back ones; `merge` the in-plane sides that run on into
 * the next pane.
 */
interface Pane {
  group: number;
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  color: Rgb;
  merge: number;
}

/** Towards the studio's iso camera (azimuth 45°, elevation 30°): the skin is drawn nearest-first along it. */
const VIEW: Rgb = [0.612, 0.5, 0.612];
/** The iso camera's ray drops tan 30° per metre it travels into the water. */
const DROP = Math.tan(Math.PI / 6);
/** Share of the bed's colour that comes through the thinnest water. */
const SEE = 0.85;
/** Colour distance (linear, max channel) above which a mosaic cell is split into its four halves. */
const SPLIT = 0.02;
/** The pale glass of the rim, blended into the cell beside it. */
const RIM = lin(0xb4dce0);
/**
 * Thickness of the skin's panes. Each pane merges into the next (no bevel
 * between them, one flat sheet), and a merged side reaches a hair (3 % of the
 * pane's thinnest side) into its neighbour: on a pane this thin that overlap
 * is too narrow to show as a darker line through the water, and there are no
 * bevels to show as grooves.
 */
const PANE = TEXEL / 8;
/** The joint under the surface band on a glass side: half a texel, a shade darker. */
const JOINT = TEXEL / 2;

const FACE_BIT: Record<WaterSide, number> = { px: 1, nx: 2, pz: 16, nz: 32 };
const SIDES: WaterSide[] = ['px', 'nx', 'pz', 'nz'];

/**
 * A body of water over its bed (see the file comment): the bed blocks and
 * what lies on them, the painted skin (surface layer, rims and glass sides)
 * and the colliders. Returns the surface.
 */
export function water(p: PieceBuilder, o: WaterOptions): WaterSurface {
  const src = here();
  const top = o.top ?? 0;
  const tint = typeof o.tint === 'object' ? o.tint : WATER_TINTS[o.tint ?? 'moat'];
  const look = o.bed === false ? null : typeof o.bed === 'object' ? o.bed : BED_LOOKS[o.bed ?? 'silt'];
  const sides: Record<WaterSide, WaterEdge> = { px: 'glass', nx: 'glass', pz: 'glass', nz: 'glass', ...o.sides };
  const glass = (s: WaterSide) => sides[s] === 'glass';
  const { x0, z0, x1, z1 } = o;
  const depthFn: DepthFn = typeof o.depth === 'number' ? () => o.depth as number : o.depth;
  const limit = top - TEXEL;

  // The bed: one column per 1/4 m, its top stepped to the texel grid.
  const nb = Math.ceil((x1 - x0) / BED_CELL - 1e-6);
  const mb = Math.ceil((z1 - z0) / BED_CELL - 1e-6);
  const bedTop = new Float32Array(nb * mb);
  for (let k = 0; k < mb; k++)
    for (let i = 0; i < nb; i++) bedTop[k * nb + i] = Math.min(limit, top - snap(depthFn(x0 + (i + 0.5) * BED_CELL, z0 + (k + 0.5) * BED_CELL)));
  const bedAt = (x: number, z: number) => {
    const i = Math.min(nb - 1, Math.max(0, Math.floor((x - x0) / BED_CELL)));
    const k = Math.min(mb - 1, Math.max(0, Math.floor((z - z0) / BED_CELL)));
    return bedTop[k * nb + i];
  };
  const floor = Math.min(...bedTop);
  const bottom = floor - (o.base ?? BED_BASE);

  const map = new BedMap(x0, z0, x1, z1);
  for (let k = 0; k < mb; k++)
    for (let i = 0; i < nb; i++) {
      const cx0 = x0 + i * BED_CELL;
      const cz0 = z0 + k * BED_CELL;
      const [cx1, cz1] = [Math.min(x1, cx0 + BED_CELL), Math.min(z1, cz0 + BED_CELL)];
      const y = bedTop[k * nb + i];
      const tone = look ? look.tones[mosaic(i + 91, k + 17, look.tones.length, o.seed + 3)] : POND.silt;
      if (look) p.voxels.span(cx0, bottom, cz0, cx1, y, cz1, tone, 'soil', { surf: look.surf, src });
      const c = lin(tone);
      map.lay({ x0: cx0, z0: cz0, x1: cx1, z1: cz1, y, top: c, side: scale(c, 0.7) });
    }
  if (look) {
    bedFeatures(p, look, { x0, z0, x1, z1, limit, bedAt, map, r: rng(o.seed * 13 + 5), src });
    bedColliders(p, bedTop, nb, mb, [x0, z0, x1, z1], bottom);
  }
  if (o.under)
    for (let k = 0; k < map.m; k++)
      for (let i = 0; i < map.n; i++) {
        const [x, z] = [x0 + (i + 0.5) * TEXEL, z0 + (k + 0.5) * TEXEL];
        const u = o.under(x, z);
        if (!u || u.y <= map.y[k * map.n + i]) continue;
        const c = lin(u.color);
        map.lay({ x0: x - TEXEL / 2, z0: z - TEXEL / 2, x1: x + TEXEL / 2, z1: z + TEXEL / 2, y: Math.min(u.y, limit), top: c, side: scale(c, 0.65) });
      }

  // The water's own tone in a mosaic cell over `deep` metres, and what one sees through `len` metres of it down to colour `c`.
  const tones = tint.tones.map(lin);
  const abyss = tint.abyss.map(lin);
  const waterTone = (ci: number, ck: number, deep: number, salt: number): Rgb =>
    mix(tones[mosaic(ci, ck, tones.length, o.seed + salt)], abyss[mosaic(ci + 40, ck + 40, abyss.length, o.seed + salt)], smooth(0.9, 1.6, deep));
  const seen = (w: Rgb, c: Rgb, len: number, clarity = tint.clarity): Rgb => {
    const v = SEE * Math.exp(-((len / clarity) ** 1.5));
    const f = tint.filter;
    return mix(w, [c[0] * f[0] ** len, c[1] * f[1] ** len, c[2] * f[2] ** len], v);
  };

  const skin: Pane[] = [];
  const glintColor = lin(o.glint ?? tint.glint);
  const toTop = (c: Rgb, g: number): Rgb => mix([c[0] * TOP_GAIN[0], c[1] * TOP_GAIN[1], c[2] * TOP_GAIN[2]], glintColor, g);
  const toSide = (c: Rgb): Rgb => [c[0] * SIDE_GAIN[0], c[1] * SIDE_GAIN[1], c[2] * SIDE_GAIN[2]];
  const glints = glintMap(o.glints ?? 0.3, { x0, z0, x1, z1 }, o.seed);
  const y0 = top - SURFACE_LAYER;
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  // The mosaic spans the rectangle less a texel on each glass side, where the rim runs.
  const ix0 = x0 + (glass('nx') ? TEXEL : 0);
  const ix1 = x1 - (glass('px') ? TEXEL : 0);
  const iz0 = z0 + (glass('nz') ? TEXEL : 0);
  const iz1 = z1 - (glass('pz') ? TEXEL : 0);
  /** Next mosaic boundary after `a` on an axis starting at `origin`, capped at `end`. */
  const nextCell = (a: number, origin: number, end: number) => Math.min(end, origin + (Math.floor((a - origin) / WATER_CELL + 1e-6) + 1) * WATER_CELL);
  /** A pane of the surface: its sides merge with the next pane, except on the rectangle's edge. */
  const topPane = (bx0: number, bz0: number, bx1: number, bz1: number, color: Rgb) => {
    const merge = (near(bx1, x1) ? 0 : 1) | (near(bx0, x0) ? 0 : 2) | (near(bz1, z1) ? 0 : 16) | (near(bz0, z0) ? 0 : 32);
    skin.push({ group: 0, x0: bx0, y0: top - PANE, z0: bz0, x1: bx1, y1: top, z1: bz1, color, merge });
  };

  // ── The surface: texel paint → 1/8 m halves → 1/4 m cells ──
  const n = Math.ceil((x1 - x0) / WATER_CELL - 1e-6);
  const m = Math.ceil((z1 - z0) / WATER_CELL - 1e-6);
  const cellColor: Rgb[] = [];
  const paint = (x: number, z: number, ci: number, ck: number): Rgb => {
    const a = map.index(x, z);
    const c = seen(waterTone(ci, ck, top - bedAt(x, z), 0), map.topOf(a), top - map.y[a]);
    return o.overlay ? lin(o.overlay(x, z, hexOf(c))) : c;
  };
  const mosaicPane = (bx0: number, bz0: number, bx1: number, bz1: number, color: Rgb) => {
    const [cx0, cz0, cx1, cz1] = [Math.max(bx0, ix0), Math.max(bz0, iz0), Math.min(bx1, ix1), Math.min(bz1, iz1)];
    if (cx1 - cx0 > 1e-6 && cz1 - cz0 > 1e-6) topPane(cx0, cz0, cx1, cz1, color);
  };
  for (let ck = 0; ck < m; ck++)
    for (let ci = 0; ci < n; ci++) {
      const cx = x0 + ci * WATER_CELL;
      const cz = z0 + ck * WATER_CELL;
      const halves: { x0: number; z0: number; x1: number; z1: number; c: Rgb }[] = [];
      for (let q = 0; q < 4; q++) {
        const hx0 = cx + (q & 1) * SUB;
        const hz0 = cz + (q >> 1) * SUB;
        const [hx1, hz1] = [Math.min(x1, hx0 + SUB), Math.min(z1, hz0 + SUB)];
        if (hx1 - hx0 < 1e-6 || hz1 - hz0 < 1e-6) continue;
        const texels: Rgb[] = [];
        for (let tx = hx0 + TEXEL / 2; tx < hx1; tx += TEXEL) for (let tz = hz0 + TEXEL / 2; tz < hz1; tz += TEXEL) texels.push(paint(tx, tz, ci, ck));
        halves.push({ x0: hx0, z0: hz0, x1: hx1, z1: hz1, c: toTop(average(texels), glints((hx0 + hx1) / 2, (hz0 + hz1) / 2)) });
      }
      const all = average(halves.map((h) => h.c));
      cellColor[ck * n + ci] = all;
      if (spread(halves.map((h) => h.c)) < SPLIT) mosaicPane(cx, cz, Math.min(x1, cx + WATER_CELL), Math.min(z1, cz + WATER_CELL), all);
      else for (const h of halves) mosaicPane(h.x0, h.z0, h.x1, h.z1, h.c);
    }

  // ── The rims: a texel of pale glass along each glass side, a stretch per cell (the x-running ones own the corners) ──
  const cellAt = (x: number, z: number) => cellColor[Math.min(m - 1, Math.floor((z - z0) / WATER_CELL)) * n + Math.min(n - 1, Math.floor((x - x0) / WATER_CELL))];
  /** Rim colour of each stretch, by side and start, for the band below it. */
  const rimColor = new Map<string, Rgb>();
  for (const s of SIDES) {
    if (!glass(s)) continue;
    const alongX = s === 'pz' || s === 'nz';
    const [a0, a1] = alongX ? [x0, x1] : [iz0, iz1];
    for (let a = a0; a < a1 - 1e-6; ) {
      const b = nextCell(a, alongX ? x0 : z0, a1);
      const [bx0, bz0, bx1, bz1] = alongX
        ? [a, s === 'pz' ? z1 - TEXEL : z0, b, s === 'pz' ? z1 : z0 + TEXEL]
        : [s === 'px' ? x1 - TEXEL : x0, a, s === 'px' ? x1 : x0 + TEXEL, b];
      const c = mix(cellAt((bx0 + bx1) / 2, (bz0 + bz1) / 2), RIM, 0.3);
      rimColor.set(`${s}${a.toFixed(4)}`, c);
      topPane(bx0, bz0, bx1, bz1, c);
      a = b;
    }
  }

  // ── The glass sides: the band under the rim, a darker joint, then what one sees looking in and down through the side ──
  for (const s of SIDES) {
    if (!glass(s)) continue;
    const alongX = s === 'pz' || s === 'nz';
    // (the z-running sides fit between the x-running ones)
    const [a0, a1] = alongX ? [x0, x1] : [z0 + (glass('nz') ? PANE : 0), z1 - (glass('pz') ? PANE : 0)];
    const plane = { px: x1, nx: x0, pz: z1, nz: z0 }[s];
    const inward = s === 'px' || s === 'pz' ? -1 : 1;
    const salt = FACE_BIT[s] * 7;
    const group = s === 'px' || s === 'pz' ? 1 : 2;
    const [lo, hi]: WaterSide[] = alongX ? ['nx', 'px'] : ['nz', 'pz'];
    // Point on the side at `a` along it, `t` metres in.
    const pos = (a: number, t: number): [number, number] => (alongX ? [a, plane + inward * t] : [plane + inward * t, a]);
    const sight = (a: number, y: number, cell: number, row: number): Rgb => {
      const w = scale(waterTone(cell, row, top - bedAt(...pos(a, TEXEL / 2)), salt), 1 - 0.1 * Math.min(1, (top - y) / 1.5));
      for (let t = TEXEL / 2; t < 12; t += TEXEL / 2) {
        const at = map.index(...pos(a, t));
        const yy = y - t * DROP;
        if (at < 0) break;
        // (the sheets' glass sides show the bed from further in than their tops do)
        if (yy <= map.y[at]) return seen(w, map.y[at] - yy > TEXEL ? map.sideOf(at) : map.topOf(at), t / Math.cos(Math.PI / 6), tint.clarity * 1.6);
      }
      return w;
    };
    /** A pane of this side from a to b along it, ya to yb up; `down` / `up`: it runs on into a pane below / above. */
    const pane = (a: number, b: number, ya: number, yb: number, color: Rgb, down: boolean, up: boolean) => {
      const merge = (near(a, a0) ? 0 : FACE_BIT[lo]) | (near(b, a1) ? 0 : FACE_BIT[hi]) | (down ? 8 : 0) | (up ? 4 : 0);
      const [px0, pz0] = pos(a, 0);
      const [px1, pz1] = pos(b, PANE);
      skin.push({ group, x0: Math.min(px0, px1), y0: ya, z0: Math.min(pz0, pz1), x1: Math.max(px0, px1), y1: yb, z1: Math.max(pz0, pz1), color, merge });
    };
    const halves = (u0: number, u1: number): [number, number][] => (u1 - u0 > SUB + 1e-6 ? [[u0, u0 + SUB], [u0 + SUB, u1]] : [[u0, u1]]);
    const wallTop = y0 - JOINT;
    for (let ca = a0; ca < a1 - 1e-6; ) {
      const cb = nextCell(ca, alongX ? x0 : z0, a1);
      const cell = Math.floor((ca - (alongX ? x0 : z0)) / WATER_CELL);
      const ybed = bedAt(...pos((ca + cb) / 2, TEXEL / 2));
      // The band: the rim's pale glass seen edge-on, a touch darker than its top.
      const rim = rimColor.get(`${s}${(alongX ? ca : Math.max(ca, iz0)).toFixed(4)}`) ?? cellAt(...pos((ca + cb) / 2, TEXEL / 2));
      pane(ca, cb, Math.max(ybed, y0), top - PANE, scale(rim, 0.92), ybed < y0 - 1e-6, false);
      if (ybed < y0 - 1e-6) pane(ca, cb, Math.max(ybed, wallTop), y0, scale(toSide(sight((ca + cb) / 2, wallTop, cell, 0)), 0.72), ybed < wallTop - 1e-6, true);
      for (let row = 0; wallTop - row * WATER_CELL > ybed + 1e-6; row++) {
        const ya = wallTop - row * WATER_CELL;
        const yb = Math.max(ybed, ya - WATER_CELL);
        const parts: { a: [number, number]; y: [number, number]; c: Rgb }[] = [];
        for (const sa of halves(ca, cb)) for (const sy of halves(yb, ya)) parts.push({ a: sa, y: sy, c: toSide(sight((sa[0] + sa[1]) / 2, (sy[0] + sy[1]) / 2, cell, row)) });
        if (spread(parts.map((q) => q.c)) < SPLIT) pane(ca, cb, yb, ya, average(parts.map((q) => q.c)), yb > ybed + 1e-6, true);
        else for (const q of parts) pane(q.a[0], q.a[1], q.y[0], q.y[1], q.c, q.y[0] > ybed + 1e-6, true);
      }
      ca = cb;
    }
  }

  // Nearest-first for the iso camera, so each pixel blends one layer of water.
  const key = (b: Pane) => VIEW[0] * (b.x0 + b.x1) + VIEW[1] * (b.y0 + b.y1) + VIEW[2] * (b.z0 + b.z1);
  skin.sort((a, b) => a.group - b.group || key(b) - key(a));
  for (const b of skin) p.voxels.span(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, hexOf(b.color), 'water', { merge: b.merge, src });
  p.collider(x0, floor, z0, x1, top, z1, true);
  return { x0, z0, x1, z1, top, depthAt: (x, z) => top - bedAt(x, z), tint };
}

/**
 * Sun glints: a patch of short blobs drawn out across the view (the sheet's
 * gold flecks in the back-left of its tile), more patches the stronger the
 * sun, and a few loose ones. Returns the glint strength (0‥1) of a 1/8 m cell.
 */
function glintMap(amount: number, rect: { x0: number; z0: number; x1: number; z1: number }, seed: number): (x: number, z: number) => number {
  if (amount <= 0) return () => 0;
  const r = rng(seed * 71 + 29);
  const w = rect.x1 - rect.x0;
  const d = rect.z1 - rect.z0;
  const patches: [number, number, number][] = [];
  for (let q = 0; q < 1 + Math.round(amount * 1.5); q++) {
    // The first patch in the back-left half, where the sheet's sun catches the water.
    const [fx, fz] = q === 0 ? [r.range(0.2, 0.45), r.range(0.2, 0.45)] : [r.range(0.15, 0.85), r.range(0.15, 0.85)];
    patches.push([rect.x0 + fx * w, rect.z0 + fz * d, (0.5 + 0.5 * amount) * r.range(0.8, 1.2) * Math.min(1, Math.min(w, d) / 4)]);
  }
  const loose = amount * 0.015;
  return (x, z) => {
    // Blobs drawn out across the iso view (along x − z).
    const u = (x - z) / Math.SQRT2;
    const v = (x + z) / Math.SQRT2;
    let g = 0;
    for (const [px, pz, rad] of patches) {
      const dd = Math.hypot(x - px, z - pz) / rad;
      if (dd >= 1) continue;
      if (valueNoise3(u * 3.2, v * 6.5, 3.5, seed + 11) > 0.56 + dd * 0.22) g = Math.max(g, 0.85 - dd * 0.3);
    }
    if (!g && hash3(Math.floor(x / SUB), Math.floor(z / SUB), 13, seed) < loose) g = 0.6;
    return g;
  };
}

/** Sunken stones, pebbles and weed on the bed (all below `limit`). */
function bedFeatures(
  p: PieceBuilder,
  look: BedLook,
  o: { x0: number; z0: number; x1: number; z1: number; limit: number; bedAt: (x: number, z: number) => number; map: BedMap; r: Rng; src: ReturnType<typeof here> },
): void {
  const { r, map, src } = o;
  const area = (o.x1 - o.x0) * (o.z1 - o.z0);
  const spot = (w: number, d: number, step: number): [number, number] => [o.x0 + snap(r.range(0, o.x1 - o.x0 - w), step), o.z0 + snap(r.range(0, o.z1 - o.z0 - d), step)];
  if (look.stones) {
    const s = look.stones;
    for (let q = Math.round(area * s.per); q > 0; q--) {
      // On the 1/8 m grid, so the surface's half cells show them crisply.
      const w = r.int(s.size[0], s.size[1]) * SUB;
      const d = r.int(s.size[0], s.size[1]) * SUB;
      const [x, z] = spot(w, d, SUB);
      const base = Math.min(o.bedAt(x, z), o.bedAt(x + w - 1e-3, z), o.bedAt(x, z + d - 1e-3), o.bedAt(x + w - 1e-3, z + d - 1e-3));
      const y = Math.min(o.limit, base + r.int(s.tall[0], s.tall[1]) * TEXEL);
      if (y <= base) continue;
      const tone = r.pick(s.tones);
      // (bedded a texel into the silt)
      p.voxels.span(x, base - TEXEL, z, x + w, y, z + d, tone, 'sandstone', { surf: s.surf, src });
      const c = lin(tone);
      // Seen from above-front-right a block shows its front and right faces: painted beside it, darker.
      if (y - base >= 2 * TEXEL) {
        const face = y - Math.min(TEXEL, (y - base) / 2);
        map.lay({ x0: x + SUB, z0: z + d, x1: Math.min(o.x1, x + w + SUB), z1: Math.min(o.z1, z + d + SUB), y: face, top: scale(c, 0.62), side: scale(c, 0.55) });
        map.lay({ x0: x + w, z0: z + SUB, x1: Math.min(o.x1, x + w + SUB), z1: Math.min(o.z1, z + d), y: face, top: scale(c, 0.48), side: scale(c, 0.45) });
      }
      map.lay({ x0: x, z0: z, x1: x + w, z1: z + d, y, top: c, side: scale(c, 0.6) });
    }
  }
  if (look.pebbles) {
    const s = look.pebbles;
    for (let q = Math.round(area * s.per); q > 0; q--) {
      const w = r.int(1, 2) * TEXEL;
      const d = r.int(1, 2) * TEXEL;
      const [x, z] = spot(w, d, TEXEL);
      const base = o.bedAt(x + w / 2, z + d / 2);
      if (base + TEXEL > o.limit) continue;
      const tone = r.pick(s.tones);
      p.voxels.span(x, base, z, x + w, base + TEXEL, z + d, tone, 'sandstone', { surf: stoneSurf({ stain: 0.3 }), src });
      const c = lin(tone);
      map.lay({ x0: x, z0: z, x1: x + w, z1: z + d, y: base + TEXEL, top: c, side: scale(c, 0.65) });
    }
  }
  if (look.weeds) {
    const s = look.weeds;
    for (let q = Math.round(area * s.per); q > 0; q--) {
      const [cx, cz] = spot(TEXEL, TEXEL, TEXEL);
      const tone = r.pick(s.tones);
      for (let b = r.int(2, 5); b > 0; b--) {
        const x = cx + r.int(-1, 1) * TEXEL;
        const z = cz + r.int(-1, 1) * TEXEL;
        if (x < o.x0 || z < o.z0 || x + TEXEL > o.x1 || z + TEXEL > o.z1) continue;
        const base = o.bedAt(x + TEXEL / 2, z + TEXEL / 2);
        const y = Math.min(o.limit, base + r.int(s.tall[0], s.tall[1]) * TEXEL);
        if (y <= base) continue;
        const c = r.chance(0.3) ? r.pick(s.tones) : tone;
        p.voxels.span(x, base, z, x + TEXEL, y, z + TEXEL, c, 'leaves', { surf: leafSurf({ yellow: 0.2 }), src });
        map.lay({ x0: x, z0: z, x1: x + TEXEL, z1: z + TEXEL, y, top: lin(c), side: scale(lin(c), 0.7) });
      }
    }
  }
}

/** Walkable bed: one box per run of columns at the same height, runs of equal rows merged. */
function bedColliders(p: PieceBuilder, bedTop: Float32Array, nb: number, mb: number, rect: [number, number, number, number], bottom: number): void {
  const [x0, z0, x1, z1] = rect;
  const runs: { i0: number; i1: number; k0: number; k1: number; y: number }[] = [];
  let open: typeof runs = [];
  for (let k = 0; k < mb; k++) {
    const next: typeof runs = [];
    for (let i = 0; i < nb; ) {
      let j = i + 1;
      while (j < nb && bedTop[k * nb + j] === bedTop[k * nb + i]) j++;
      const y = bedTop[k * nb + i];
      const prev = open.find((q) => q.i0 === i && q.i1 === j && q.y === y);
      if (prev) {
        prev.k1 = k + 1;
        next.push(prev);
      } else {
        const run = { i0: i, i1: j, k0: k, k1: k + 1, y };
        runs.push(run);
        next.push(run);
      }
      i = j;
    }
    open = next;
  }
  for (const s of runs) p.collider(x0 + s.i0 * BED_CELL, bottom, z0 + s.k0 * BED_CELL, Math.min(x1, x0 + s.i1 * BED_CELL), s.y, Math.min(z1, z0 + s.k1 * BED_CELL));
}

// ── Helpers for pieces built on the water ────────────────────────────────────

/** Square tile of water centred on the origin, surface at y = 0 (a §17.1 tile). */
export function waterTile(p: PieceBuilder, o: Omit<WaterOptions, 'x0' | 'z0' | 'x1' | 'z1'> & { size?: number }): WaterSurface {
  const h = (o.size ?? WATER_TILE) / 2;
  return water(p, { ...o, x0: -h, z0: -h, x1: h, z1: h });
}

/** Lily pads, lotus flowers, buds and floating leaves on a water surface (the §20 pond's plants, see `pondFlora`). */
export function lilies(p: PieceBuilder, s: WaterSurface, o: Omit<PondFloraOptions, 'top' | 'x0' | 'z0' | 'x1' | 'z1'>): void {
  pondFlora(p, { ...o, top: s.top, x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1 });
}

/** Tones of the damp band a wall or bank takes at the water line: dark wet stone, a green film just above the water. */
export const WATERLINE = { wet: sheet([0x5b5a47, 0x524f40, 0x625f4a]), film: sheet([0x46553a, 0x3f4d35, 0x51603e]) } as const;

/**
 * The damp line on a wall or embankment face where it meets the water: a
 * green film at the surface and a band of dark, wet stone above it, laid a
 * quarter texel proud of the face (which faces `side`, its plane at `at`)
 * from `from` to `to` along it. `height` is the wet band (default 2 texels);
 * it breaks up here and there like a real tide mark.
 */
export function waterline(p: PieceBuilder, o: { side: WaterSide; at: number; from: number; to: number; top: number; height?: number; seed: number }): void {
  const src = here();
  const r = rng(o.seed * 5 + 1);
  const alongX = o.side === 'pz' || o.side === 'nz';
  const t = TEXEL / 4;
  const [f0, f1] = o.side === 'px' || o.side === 'pz' ? [o.at, o.at + t] : [o.at - t, o.at];
  const band = (a0: number, a1: number, y0: number, y1: number, color: number, surf: Surf) => {
    if (alongX) p.voxels.span(a0, y0, f0, a1, y1, f1, color, 'sandstone', { surf, src });
    else p.voxels.span(f0, y0, a0, f1, y1, a1, color, 'sandstone', { surf, src });
  };
  const h = o.height ?? 2 * TEXEL;
  for (let a = o.from; a < o.to - 1e-6; ) {
    const len = Math.min(o.to - a, snap(r.range(0.25, 0.75)));
    band(a, a + len, o.top - TEXEL / 2, o.top + TEXEL, r.pick(WATERLINE.film), stoneSurf({ moss: 0.6 }));
    const hh = h + r.int(-1, 1) * TEXEL;
    if (hh > 0) band(a, a + len, o.top + TEXEL, o.top + TEXEL + hh, r.pick(WATERLINE.wet), stoneSurf({ stain: 0.7, moss: 0.2 }));
    a += len;
  }
}
