import type { Object3D } from 'three';
import type { VoxelBuilder } from '../voxel/VoxelBuilder';

/**
 * The world kit: reusable voxel assets from the Angkor Wat component plan
 * (`Angkor Wat Voxel Bavel Reconstruction --- Component Plan.md`), one module per
 * numbered component under `src/kit/assets/<section>/<slug>.ts`.
 *
 * Conventions (every asset):
 *  - 1 unit = 1 metre, like the rest of the game (see src/world/scale.ts).
 *  - Piece space: origin at the centre of the footprint, y = 0 on the ground the
 *    piece stands on (ground tiles have their walkable top at y = 0), +Y up,
 *    the "front" faces +Z (towards the default camera), +X is to the right.
 *  - Blocks sit on the kit's texel grid of 1/16 m (KIT_TEXELS_PER_M) wherever
 *    they can, so the pixel-art surface of every face lines up.
 *  - Builds are deterministic: the same seed + variant gives the same piece.
 */

export type KitSection = '15' | '16' | '17.1' | '17.2' | '18.1' | '18.2' | '19.1' | '19.2' | '20' | '21.1' | '21.2' | '21.3';

/** An axis-aligned collision box in piece space (metres). */
export interface KitCollider {
  min: [number, number, number];
  max: [number, number, number];
  /** Blocks movement but is never stood on (water). */
  noStand?: boolean;
}

/** What building an asset returns. */
export interface KitPiece {
  voxels: VoxelBuilder;
  colliders: KitCollider[];
  /** Non-voxel extras in piece space (e.g. the flame light of a candle). */
  extras?: Object3D[];
}

export interface KitVariant {
  id: string;
  /** Label under the small render, e.g. "Patchy grass". */
  name: string;
  /** The variant's own sheet crop, when it has a sheet of its own (else the asset's `ref`). */
  ref?: KitRef;
}

export interface KitBuildOptions {
  /** Variant id (one of `variants`). */
  variant: string;
  /** Seed for the organic variation (trees, damage, scatter). */
  seed: number;
  /**
   * Override of the piece's main size in metres (a tree's height, a pond's
   * length…) for assets that support it — the studio passes `&height=` from the
   * URL so sizes can be compared. Undefined = the asset's real-world default.
   */
  height?: number;
}

/**
 * Camera presets of the studio (all orthographic, like the reference sheets):
 * iso = 3/4 from front-right and above, front / side / back = low elevation,
 * top = straight down (front at the bottom), elevation = true front elevation.
 */
export type KitView = 'iso' | 'iso-low' | 'front' | 'side' | 'back' | 'top' | 'elevation';

/** One small render on a sheet card. */
export interface KitShot {
  view: KitView;
  /** Variant to show (default: the card's main variant). */
  variant?: string;
  seed?: number;
  label: string;
}

/** Where the component is drawn on the reference sheets (pixels of the original PNG). */
export interface KitRef {
  /** Path under `assets/angkor detail/`. */
  sheet: string;
  /** [x0, y0, x1, y1] in sheet pixels. */
  box: [number, number, number, number];
  /** The sheet's size in pixels, when it is not the usual 1536 × 1024. */
  size?: [number, number];
}

export interface KitAsset {
  /** `<section>/<slug>`, the module path under src/kit/assets/ (filled in by the registry). */
  id: string;
  section: KitSection;
  /** Number of the component on its sheet (① Large tree → 1). */
  order: number;
  name: string;
  /** One line under the card, like the sheet's caption. */
  caption: string;
  /**
   * Size we build to. The sheets' own size notes are estimates and some are
   * wrong, so `real` comes from the real monument / real plants, `sheet` records
   * what the sheet said and `note` why they differ.
   */
  size: { real: string; sheet?: string; note?: string };
  variants: KitVariant[];
  /** Small renders under the main one (default: the other variants, then a top view). */
  shots?: KitShot[];
  /** Camera for the card's main render (default iso). */
  mainView?: KitView;
  ref?: KitRef;
  build(o: KitBuildOptions): KitPiece;
}

/** Declare an asset module's default export (id is filled in from the file path). */
export function defineKitAsset(asset: Omit<KitAsset, 'id'> & { id?: string }): KitAsset {
  return { id: '', ...asset };
}
