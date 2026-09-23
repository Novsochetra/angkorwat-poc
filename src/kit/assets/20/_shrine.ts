import type { Surf, VoxelGrid } from '../../../voxel/VoxelBuilder';
import { hash3, valueNoise3 } from '../../../voxel/random';
import { BlockSet } from '../../BlockSet';
import { fromSheet } from '../../palette';
import { TEXEL } from '../../shapes';
import { stoneSurf } from '../../surface';
import { PROP_MOSS } from './_masonry-props';

/**
 * Shared masonry of the §20 small shrine and offering platform. The sheet draws
 * both in the same weathered sandstone as its other props: small dressed blocks
 * (0.2–0.4 m) with soft bevels, yellow-olive moss on every ledge running down
 * the joints, dark pores and a few pale lichen blotches. Everything here is
 * authored in texels (1/16 m) — x / z centred on the piece, y up from the
 * ground — so block edges stay on the pixel-art grid of the stone pattern.
 */
export const T = TEXEL;

/**
 * Lit-face tones of the blocks: the sheet's shrine and altar faces (top and
 * front averaged, via fromSheet) — the taupe tan of the other §20 masonry
 * (see PROP_STONE), with a paler one (index 2) for carved frames and a greyer
 * one where the moss and grime sit.
 */
export const SHRINE_STONE: readonly number[] = [0xac8961, 0xa5835e, 0xbb966c, 0xa28a6c, 0xb08c63, 0xa88a66].map(fromSheet);

/** Door reveals, tympana and sheltered recesses: the same stone in shade, olive-grey like the sheet's (not the kit's pink-brown dark). */
export const SHRINE_SHADOW: readonly number[] = [0x7a6a55, 0x716250, 0x82705a, 0x6a5c4a];

/** False-door panels: grimy, a step darker than the walls. */
export const SHRINE_PANEL: readonly number[] = [0x9a7c5e, 0x92765a, 0xa08262].map(fromSheet);

/** The dark interior seen through a doorway or a niche: the sheet's olive-black. */
export const SHRINE_CAVITY: readonly number[] = [0x2c2a23, 0x26241e, 0x322f27];

/** Raised moss cushions: the sheet's yellow-olive moss, mostly mid and dark olive, a few lit tufts. */
export const MOSS_CLUMP: readonly number[] = [PROP_MOSS.lit[1], PROP_MOSS.lit[2], ...PROP_MOSS.mid, ...PROP_MOSS.mid, ...PROP_MOSS.deep, PROP_MOSS.deep[0]];

export interface StoneOpts {
  color?: number;
  /** Picks the tone from this list instead of the mason's palette. */
  tones?: readonly number[];
  /** Multiplies the mason's moss for this block (roof ledges get more). */
  moss?: number;
  /** Exact pattern amounts (skips the moss / stain field). */
  surf?: Surf;
  shade?: number;
}

export interface MasonOptions {
  seed: number;
  /** Moss of an average block (0‥1). */
  moss: number;
  /** Dark weathering streaks (0‥1). */
  stain: number;
  palette?: readonly number[];
}

/**
 * Lays dressed blocks into a {@link BlockSet} (1/16 m carve grid) in texel
 * coordinates: single blocks, runs of blocks with staggered joints and whole
 * courses around a rectangle.
 */
export class Mason {
  readonly set = new BlockSet(T);
  private n = 0;

  constructor(readonly o: MasonOptions) {}

  /** One block from texel corners; returns its id. */
  block(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, s: StoneOpts = {}): number {
    const n = this.n++;
    const tones = s.tones ?? this.o.palette ?? SHRINE_STONE;
    const color = s.color ?? tones[Math.floor(hash3(n, x0 * 7 + x1, y0 * 13 + z0 * 5 + z1, this.o.seed) * tones.length)];
    const surf = s.surf ?? this.surf((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, s.moss ?? 1);
    return this.set.add(x0 * T, y0 * T, z0 * T, x1 * T, y1 * T, z1 * T, color, { surf, shade: s.shade });
  }

  /**
   * Pattern amounts at a block centre (texels): moss in slow patches (the sheet's
   * shrines are green on one flank, bare on another), run-off stains, a little
   * lichen and the odd crack. (The pattern's moss is a cool green, so it stays
   * light: the sheet's olive moss is laid on as cushions, see {@link mossCushions}.)
   */
  surf(x: number, y: number, z: number, k = 1): Surf {
    const seed = this.o.seed;
    const patch = valueNoise3(x * 0.12, y * 0.1, z * 0.12, seed + 5);
    const moss = Math.min(0.5, this.o.moss * k * (0.25 + 0.85 * patch));
    const stain = this.o.stain * (0.6 + 0.8 * valueNoise3(x * 0.2, y * 0.15, z * 0.2, seed + 9));
    const lichen = valueNoise3(x * 0.25, y * 0.25, z * 0.25, seed + 13) > 0.62 ? 0.3 : 0.06;
    const crack = hash3(Math.floor(x), Math.floor(y), Math.floor(z), seed + 17) > 0.8 ? 0.35 : 0;
    return stoneSurf({ moss, stain, lichen, crack });
  }

  /** Blocks along x from x0 to x1 (texels) filling y0‥y1 × z0‥z1; lengths lo‥hi, no end slivers. */
  runX(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, len: [number, number], s: StoneOpts = {}): void {
    this.run(x0, x1, len, y0 * 31 + z0 * 7, (a, b) => this.block(a, y0, z0, b, y1, z1, s));
  }

  /** Blocks along z, like {@link runX}. */
  runZ(z0: number, z1: number, y0: number, y1: number, x0: number, x1: number, len: [number, number], s: StoneOpts = {}): void {
    this.run(z0, z1, len, y0 * 31 + x0 * 7 + 3, (a, b) => this.block(x0, y0, a, x1, y1, b, s));
  }

  private run(a0: number, a1: number, [lo, hi]: [number, number], salt: number, put: (a: number, b: number) => void): void {
    let a = a0;
    for (let i = 0; a < a1; i++) {
      let l = lo + Math.floor(hash3(a, salt, i, this.o.seed + 3) * (hi - lo + 1));
      if (a1 - (a + l) < lo) l = a1 - a;
      put(a, a + l);
      a += l;
    }
  }

  /**
   * One course around the rectangle ±hx × ±hz: four walls `skin` thick (the
   * core is left to the caller). `bond` flips which walls own the corners, so
   * joints stagger from course to course like coursed masonry. `gaps` leaves
   * an opening (texels along the wall) in the front / back / right / left wall.
   */
  ring(
    hx: number,
    hz: number,
    y0: number,
    y1: number,
    skin: number,
    bond: number,
    len: [number, number],
    s: StoneOpts = {},
    gaps: { front?: [number, number]; back?: [number, number]; right?: [number, number]; left?: [number, number] } = {},
  ): void {
    const along = (a0: number, a1: number, gap: [number, number] | undefined, put: (a: number, b: number) => void) => {
      if (!gap) return put(a0, a1);
      if (gap[0] > a0) put(a0, gap[0]);
      if (gap[1] < a1) put(gap[1], a1);
    };
    const fx = bond % 2 === 0 ? hx : hx - skin;
    const fz = bond % 2 === 0 ? hz - skin : hz;
    along(-fx, fx, gaps.front, (a, b) => this.runX(a, b, y0, y1, hz - skin, hz, len, s));
    along(-fx, fx, gaps.back, (a, b) => this.runX(a, b, y0, y1, -hz, -hz + skin, len, s));
    along(-fz, fz, gaps.right, (a, b) => this.runZ(a, b, y0, y1, hx - skin, hx, len, s));
    along(-fz, fz, gaps.left, (a, b) => this.runZ(a, b, y0, y1, -hx, -hx + skin, len, s));
  }

  /** Is the texel cell (i, j, k) inside stone? */
  solid(i: number, j: number, k: number): boolean {
    return this.set.solidAt((i + 0.5) * T, (j + 0.5) * T, (k + 0.5) * T);
  }
}

/**
 * A stone with a square socket in its top — a cap stone whose finial is lost,
 * an offering cup: a rim one texel thick around a 2 × 2 texel hole with a
 * grimy floor, on a solid foot when it is taller than two texels. Centred on
 * texel (cx, cz).
 */
export function socketStone(m: Mason, g: VoxelGrid, cx: number, y0: number, cz: number, hw: number, h: number, moss = 1.3): void {
  const y1 = y0 + h - 2;
  if (h > 2) m.block(cx - hw, y0, cz - hw, cx + hw, y1, cz + hw, { moss });
  const rim = (x0: number, z0: number, x1: number, z1: number) => m.block(cx + x0, y1, cz + z0, cx + x1, y0 + h, cz + z1, { moss: moss * 1.1 });
  rim(-hw, 1, hw, hw);
  rim(-hw, -hw, hw, -1);
  rim(-hw, -1, -1, 1);
  rim(1, -1, hw, 1);
  for (let i = -1; i < 1; i++) for (let k = -1; k < 1; k++) g.set(cx + i, y1, cz + k, SHRINE_CAVITY[0], 'sandstone', 1, stoneSurf({ moss: 0.4 }));
}

/**
 * Raised moss cushions (leaves family, one texel) on the exposed tops of a
 * mason's stone and of a detail grid in the box i0‥i1 × j0‥j1 × k0‥k1 (texel
 * cells): noise decides where they grow, `amount` how much of a ledge they cover.
 * The grid must use texel cells with its origin at the piece origin.
 */
export function mossCushions(g: VoxelGrid, m: Mason, box: [number, number, number, number, number, number], amount: number, seed: number): void {
  const [i0, i1, j0, j1, k0, k1] = box;
  const solid = (i: number, j: number, k: number) => m.solid(i, j, k) || g.has(i, j, k);
  for (let i = i0; i <= i1; i++)
    for (let k = k0; k <= k1; k++)
      for (let j = j1; j > j0; j--) {
        if (!solid(i, j - 1, k) || solid(i, j, k)) continue;
        // Cushions gather in patches and along the outer edges of ledges.
        const edge = !solid(i + 1, j - 1, k) || !solid(i - 1, j - 1, k) || !solid(i, j - 1, k + 1) || !solid(i, j - 1, k - 1);
        const n = valueNoise3(i * 0.3, j * 0.3, k * 0.3, seed) * 0.8 + hash3(i, j, k, seed + 1) * 0.2 + (edge ? 0.08 : 0);
        if (n < 1 - amount * 0.55) continue;
        g.set(i, j, k, MOSS_CLUMP[Math.floor(hash3(i, j, k, seed + 2) * MOSS_CLUMP.length)], 'leaves');
        if (!g.has(i, j - 1, k)) g.ghost(i, j - 1, k);
        if (n > 1.12 - amount * 0.3 && !solid(i, j + 1, k)) g.set(i, j + 1, k, MOSS_CLUMP[Math.floor(hash3(i, j + 1, k, seed + 2) * MOSS_CLUMP.length)], 'leaves');
      }
}
