import type { BufferAttribute, InstancedMesh, Object3D } from 'three';
import { VOXEL_MATERIALS, type VoxelMaterialKey } from '../voxel/materials';
import { unitVoxelGeometry } from '../voxel/VoxelMesh';
import type { GraphicsLevel, MapQuality } from './types';

/**
 * Graphics levels (the settings' Graphics choice, `graphics=` in the URL):
 * what the picture draws, from the fastest to the finest. Everything changes
 * at once, while the map runs, except the built detail (`build`), which
 * follows the next time the map opens.
 *
 *           picture                 map blocks   MSAA   shadow map         glow, top blur
 *  low      half (ratio 1)          plain boxes  none   2048               off
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
  /** Bloom and the tilt-shift blur along the top edge (post.ts). */
  glow: boolean;
  /** Built detail (tree density, waterfall spray, animals, block meshes): the next time the map opens. */
  build: MapQuality;
}

export const GRAPHICS: Record<GraphicsLevel, GraphicsSpec> = {
  low: { ratio: 1, plainBlocks: true, samples: [0, 0], shadowMap: 2048, shadowEvery: 3, glow: false, build: 'low' },
  medium: { ratio: 'auto', plainBlocks: false, samples: [4, 2], shadowMap: 4096, shadowEvery: 3, glow: true, build: 'medium' },
  high: { ratio: 'screen', plainBlocks: false, samples: [4, 2], shadowMap: 4096, shadowEvery: 3, glow: true, build: 'medium' },
  max: { ratio: 'screen', plainBlocks: false, samples: [4, 4], shadowMap: 8192, shadowEvery: 1, glow: true, build: 'high' },
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
    const index = to ? to.index! : own.index;
    if (geo.index === index) return;
    geo.setIndex(index);
    geo.setAttribute('position', to ? to.getAttribute('position') : own.position);
    geo.setAttribute('normal', to ? to.getAttribute('normal') : own.normal);
  });
}
