import type { BufferAttribute, InstancedMesh, Object3D } from 'three';
import { VOXEL_MATERIALS, type VoxelMaterialKey } from '../voxel/materials';
import { openSidesIndex, unitVoxelGeometry } from '../voxel/VoxelMesh';
import { GRAPHICS_LEVELS, type GraphicsLevel, type MapQuality } from './types';

/**
 * Graphics levels (the settings' Graphics choice, `graphics=` in the URL):
 * what the picture draws, from the fastest to the finest. Everything changes
 * at once, while the map runs, except the built detail (`build`), which
 * follows the next time the map opens.
 *
 *           picture                 map blocks   MSAA   shadow map         glow, top blur
 *  low      half (ratio 1)          plain boxes  none   2048, still        off
 *  medium   the screen's, half      chamfered    2 / 4  4096, 3rd frame    on
 *           while slow (main.ts)
 *  high     the screen's, always    chamfered    2 / 4  4096, 3rd frame    on
 *  max      the screen's, always    chamfered    4      8192, every frame  on
 *
 * Measured on an M1 Max (the overview, 696 × 925, the scene about 10 M
 * triangles, most of the cost): a frame takes ≈ 11 ms on low, 30 on high,
 * 36 on max. Plain boxes (12 triangles, not 44) alone take 31 ms to 19; a
 * shadow map of 8192² draws as fast as 4096² (the pass is bound by the
 * blocks, not the texels), only sharper, and costs 256 MB.
 *
 * Low's shadows are still (`stillShadows`): a shadow redraw every third frame
 * made that frame about 40 % slower than the others (10 M triangles, not 4),
 * a stutter on phones. On a phone the map also draws at most 30 frames a
 * second (`MAX_FPS`), and the `auto` choice picks the level (`AutoGraphics`).
 */
export interface GraphicsSpec {
  /** Pixel ratio: the screen's (at most 2), the screen's but 1 while frames come slow (main.ts), or 1. */
  ratio: 'screen' | 'auto' | 1;
  /** The map's blocks (the `map…` families) as plain boxes: no chamfered edges. */
  plainBlocks: boolean;
  /** MSAA samples of the scene (post.ts) at ratio 1, and over ratio 1.5 (dense screens need fewer). */
  samples: [number, number];
  /** Size of the key light's shadow map (atmosphere.ts; no bigger than the GPU's textures). */
  shadowMap: number;
  /** The shadow map is drawn every this many frames (1: every frame, smooth shadows of what moves). */
  shadowEvery: number;
  /**
   * Still shadows: only what never moves casts ({@link markStill}), and the
   * shadow map is drawn again only when the key light has turned by
   * {@link STILL_TURN} (a time-of-day switch, the day's cycle), not every
   * `shadowEvery` frames: while the light stands, no frame draws shadows.
   */
  stillShadows: boolean;
  /** Bloom and the tilt-shift blur along the top edge (post.ts). */
  glow: boolean;
  /** Built detail (tree density, waterfall spray, animals, block meshes): the next time the map opens. */
  build: MapQuality;
}

export const GRAPHICS: Record<GraphicsLevel, GraphicsSpec> = {
  low: { ratio: 1, plainBlocks: true, samples: [0, 0], shadowMap: 2048, shadowEvery: 3, stillShadows: true, glow: false, build: 'low' },
  medium: { ratio: 'auto', plainBlocks: false, samples: [4, 2], shadowMap: 4096, shadowEvery: 3, stillShadows: false, glow: true, build: 'medium' },
  high: { ratio: 'screen', plainBlocks: false, samples: [4, 2], shadowMap: 4096, shadowEvery: 3, stillShadows: false, glow: true, build: 'medium' },
  max: { ratio: 'screen', plainBlocks: false, samples: [4, 4], shadowMap: 8192, shadowEvery: 1, stillShadows: false, glow: true, build: 'high' },
};

/** The level in use (post.ts and atmosphere.ts read it every frame). */
export const graphicsNow: GraphicsSpec & { level: GraphicsLevel } = { level: 'medium', ...GRAPHICS.medium };

/** MSAA samples for a pixel ratio. */
export const samplesAt = (g: GraphicsSpec, ratio: number): number => g.samples[ratio > 1.5 ? 1 : 0];

/**
 * Switch to a level: the values the parts read, and the map's blocks swapped
 * between plain boxes and their chamfered shape (the same instances, only
 * the shared unit block changes: no rebuild). Blocks of other families (the
 * explorer, the people, the boats) keep their edges: they are few, and near.
 */
export function setGraphics(level: GraphicsLevel, scene: Object3D): void {
  Object.assign(graphicsNow, GRAPHICS[level], { level });
  const plain = graphicsNow.plainBlocks;
  scene.traverse((o) => {
    const mesh = o as InstancedMesh;
    if (!mesh.isInstancedMesh || !mesh.userData.voxelShape?.segments || !mesh.material || Array.isArray(mesh.material)) return;
    // (`voxel:<family>`, or with a variant after it: `voxel:mapLeaf:sway`)
    const key = (mesh.material.name.split(':')[1] ?? '') as VoxelMaterialKey;
    if (!key.startsWith('map') || !VOXEL_MATERIALS[key]) return;
    const geo = mesh.geometry;
    // (its own shape, kept the first time it goes plain)
    let own = mesh.userData.voxelOwnShape as { index: BufferAttribute; position: BufferAttribute; normal: BufferAttribute } | undefined;
    if (plain && !own) own = mesh.userData.voxelOwnShape = { index: geo.index!, position: geo.getAttribute('position') as BufferAttribute, normal: geo.getAttribute('normal') as BufferAttribute };
    if (!own) return;
    const to = plain ? unitVoxelGeometry(VOXEL_MATERIALS[key].bevel, 0) : null;
    // (only the sides the mesh's blocks show, if it leaves some out: VoxelMesh.ts `hideCovered`)
    const index = to ? openSidesIndex(to, mesh.userData.voxelSides ?? 63) : own.index;
    if (geo.index === index) return;
    geo.setIndex(index);
    geo.setAttribute('position', to ? to.getAttribute('position') : own.position);
    geo.setAttribute('normal', to ? to.getAttribute('normal') : own.normal);
  });
}

// ── Still shadows ───────────────────────────────────────────────────────────
/** The layer of what never moves: the only casters of still shadows (atmosphere.ts sets the shadow camera to it). */
export const STILL_LAYER = 1;
/** Still shadows are drawn again once the key light has turned this far (radians, ≈ 0.3°: under a block at the tip of a mesa's shadow). */
export const STILL_TURN = 0.3 * (Math.PI / 180);

/** Mark everything under `root` as still (it casts still shadows), or not (`still` false: something on it moves). */
export function markStill(root: Object3D, still = true): void {
  root.traverse((o) => (still ? o.layers.enable(STILL_LAYER) : o.layers.disable(STILL_LAYER)));
}

// ── Phones and auto ─────────────────────────────────────────────────────────
/** A phone: a touch screen without a mouse, under 600 CSS px across (tablets and computers are not). `phone=1` in the URL acts as one. */
export const PHONE =
  new URLSearchParams(location.search).get('phone') === '1' ||
  (typeof matchMedia === 'function' && matchMedia('(pointer: coarse) and (hover: none)').matches && Math.min(screen.width, screen.height) < 600);
/**
 * Frames a second at most: 30 on a phone, else as many as the screen shows.
 * An even 30 (every other refresh) looks smoother than 40 to 60 that come
 * unevenly, and the phone keeps cooler.
 */
export const MAX_FPS = PHONE ? 30 : Infinity;
/** The time a frame has (s): at 60 a second, or at {@link MAX_FPS} under it. */
export const FRAME_TIME = 1 / Math.min(60, MAX_FPS);

const AUTO_KEY = 'angkor-map-graphics-auto';
/** Auto's level: the one it stepped down to on this device before, else a guess (low on a phone, medium on the rest). */
export function autoLevel(): GraphicsLevel {
  try {
    const kept = localStorage.getItem(AUTO_KEY) as GraphicsLevel | null;
    if (kept && GRAPHICS_LEVELS.includes(kept)) return kept;
  } catch {
    /* no storage */
  }
  return PHONE ? 'low' : 'medium';
}
/** Auto starts again from its guess (auto picked again in the settings). */
export function resetAutoLevel(): void {
  try {
    localStorage.removeItem(AUTO_KEY);
  } catch {
    /* no storage */
  }
}

/**
 * Auto's watch over the frames. Every 2 s of drawn frames it takes their mean
 * time. Three means in a row slower than 2 × {@link FRAME_TIME} (under 30
 * frames a second, or 15 on a phone: choppy), and it steps down one level
 * and keeps that level for this device. It waits while the level can still
 * lower its own resolution (medium: main.ts, under 40 a second), and for a
 * new level to settle. (An M1 Max runs medium at about 39 a second: it keeps
 * medium's look.) It never
 * steps up by itself: a device that proved slow (hot, on battery) stays lower
 * until auto is picked again.
 */
export class AutoGraphics {
  private time = 0;
  private frames = 0;
  private slow = 0;

  /** Start over (a new level). */
  reset(): void {
    this.time = this.frames = this.slow = 0;
  }

  /**
   * A drawn frame took `dt` s. `settled`: the level's own resolution is as
   * low as it goes. Returns the level to step down to, or null.
   */
  watch(dt: number, settled: boolean): GraphicsLevel | null {
    // (a hitch: a tab switch, a build)
    if (dt > 0.25) return null;
    this.time += dt;
    this.frames++;
    if (this.time < 2) return null;
    const avg = this.time / this.frames;
    this.time = this.frames = 0;
    this.slow = settled && avg > 2 * FRAME_TIME ? this.slow + 1 : 0;
    const at = GRAPHICS_LEVELS.indexOf(graphicsNow.level);
    if (this.slow < 3 || at <= 0) return null;
    this.reset();
    const next = GRAPHICS_LEVELS[at - 1];
    try {
      localStorage.setItem(AUTO_KEY, next);
    } catch {
      /* this visit only */
    }
    return next;
  }
}
