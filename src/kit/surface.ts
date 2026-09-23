import type { Surf } from '../voxel/VoxelBuilder';
import { SANDSTONE, type SandstoneFinish } from './palette';

/**
 * Named constructors for a block's pattern amounts (0‥1) — see `Surf` and the
 * pattern shader in src/voxel/materials.ts. Use the one that matches the
 * block's material family.
 */

/** `sandstone`: moss patches, lichen blotches, crack lines, dark weathering. */
export function stoneSurf(o: { moss?: number; lichen?: number; crack?: number; stain?: number } = {}): Surf {
  return [o.moss ?? 0, o.lichen ?? 0, o.crack ?? 0, o.stain ?? 0];
}

/** `soil`: grass cover (+ drips down the sides), moss, dryness (paler + cracks), wetness. */
export function soilSurf(o: { grass?: number; moss?: number; dry?: number; wet?: number } = {}): Surf {
  return [o.grass ?? 0, o.moss ?? 0, o.dry ?? 0, o.wet ?? 0];
}

/** `leaves`: flower texels, yellowing blotches. */
export function leafSurf(o: { flowers?: number; yellow?: number } = {}): Surf {
  return [o.flowers ?? 0, o.yellow ?? 0, 0, 0];
}

/** `trunk`: moss, lichen, dark stains. */
export function barkSurf(o: { moss?: number; lichen?: number; stain?: number } = {}): Surf {
  return [o.moss ?? 0, o.lichen ?? 0, 0, o.stain ?? 0];
}

/** A §19.1 sandstone finish: its colour tones, pattern amounts and edge wear. */
export interface StoneFinish {
  palette: readonly number[];
  surf: Surf;
  /** Share of exposed block edges chipped away (0 = crisp, 1 = heavily eroded). */
  wear: number;
}

export const STONE_FINISH: Record<SandstoneFinish, StoneFinish> = {
  clean: { palette: SANDSTONE.clean, surf: stoneSurf(), wear: 0 },
  warm: { palette: SANDSTONE.warm, surf: stoneSurf({ stain: 0.05 }), wear: 0.05 },
  dark: { palette: SANDSTONE.dark, surf: stoneSurf({ stain: 0.25, lichen: 0.05 }), wear: 0.1 },
  cracked: { palette: SANDSTONE.cracked, surf: stoneSurf({ crack: 0.55, stain: 0.05 }), wear: 0.15 },
  weathered: { palette: SANDSTONE.weathered, surf: stoneSurf({ stain: 0.6, moss: 0.18, lichen: 0.12 }), wear: 0.32 },
  mossy: { palette: SANDSTONE.mossy, surf: stoneSurf({ moss: 0.6, stain: 0.15 }), wear: 0.15 },
  broken: { palette: SANDSTONE.broken, surf: stoneSurf({ stain: 0.1 }), wear: 0.3 },
  cavity: { palette: SANDSTONE.cavity, surf: stoneSurf(), wear: 0 },
};

/** Blend two surfs (e.g. a finish plus extra moss): per-component max. */
export function surfMax(a: Surf, b: Surf): Surf {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/** Scale every amount of a surf. */
export function surfScale(a: Surf, k: number): Surf {
  const c = (v: number) => Math.min(1, Math.max(0, v * k));
  return [c(a[0]), c(a[1]), c(a[2]), c(a[3])];
}
