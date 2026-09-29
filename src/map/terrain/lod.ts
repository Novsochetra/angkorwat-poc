import { Box3, BufferGeometry, Group, InstancedMesh, Vector3, type Camera } from 'three';
import { VOXEL_MATERIALS } from '../../voxel/materials';
import { openSidesIndex, unitVoxelGeometry } from '../../voxel/VoxelMesh';
import { chamferOf, graphicsNow, paintRim, pixelSize, plainAt } from '../graphics';

/**
 * Chunks of the map for big voxel parts (the land, the jungle): each chunk
 * has its own meshes, so the camera only draws the chunks in front of it,
 * and chunks far from the camera draw their bevelled blocks as plain boxes
 * (the bevels are smaller than a pixel there).
 */

// (the grid of chunks: plain data, in a module of its own so the build workers can use it without this one's graphics)
export { ChunkGrid } from './grid';

/**
 * Chunks farther than this from the camera (m, on the map) draw plain boxes:
 * while roaming, and in the overview (only the back hills and the top of
 * the holy mountain, deep in the haze, are that far there). Nearer too once
 * their blocks' cut edges are under the level's pixels there (graphics.ts
 * `plainFrom`: a picture with fewer pixels, a 1× screen), never further.
 */
export const PLAIN_FROM = { roam: 170, overview: 300 };

/**
 * A chunk's (or tile's) bevelled meshes and their plain twin, shown by the
 * camera's distance: the twin past {@link PLAIN_FROM} m (on the map, as
 * before), or nearer where the blocks' cut edges are under the level's
 * pixels (graphics.ts `plainAt`: the largest of them, from the nearest point
 * of the box round them). A twin nearer than {@link PLAIN_FROM} stands in
 * for the bevelled blocks: its meshes wear their materials' rim variants
 * (graphics.ts `paintRim`: the cut edges' strips painted); past it, plain
 * boxes as before (not on the plain level either). The twin is made the first
 * time it is needed (`made`: told so). Marks the fine group `chunkLod`:
 * graphics.ts `plainFar` leaves its meshes to the chunk.
 */
export class ChunkSwitch {
  /** The box round the fine blocks (world, their height too) and their largest cut edge (graphics.ts `chamferOf`). */
  readonly box: Box3;
  readonly edge: number;
  plain: Group | null = null;
  private painted = false;

  constructor(
    readonly plan: Box3,
    readonly fine: Group,
    private readonly parent: Group,
    private readonly made?: (twin: Group) => void,
  ) {
    fine.userData.chunkLod = true;
    this.box = plan.clone();
    this.box.min.y = Infinity;
    this.box.max.y = -Infinity;
    let edge = 0;
    for (const child of fine.children) {
      const m = child as InstancedMesh;
      if (!m.isInstancedMesh) continue;
      if (!m.boundingBox) m.computeBoundingBox();
      this.box.min.y = Math.min(this.box.min.y, m.boundingBox!.min.y);
      this.box.max.y = Math.max(this.box.max.y, m.boundingBox!.max.y);
      edge = Math.max(edge, chamferOf(m));
    }
    if (this.box.min.y > this.box.max.y) this.box.min.y = this.box.max.y = 0;
    this.edge = edge;
  }

  /** `eye`: the camera; `flat`: it on the ground (y 0); `from`: {@link PLAIN_FROM} now; `pixel`: graphics.ts `pixelSize`. */
  update(eye: Vector3, flat: Vector3, from: number, pixel: number): void {
    const past = this.plan.distanceToPoint(flat) > from;
    const plain = past || plainAt(this.box.distanceToPoint(eye), this.edge, pixel, !!this.plain?.visible);
    if (plain && !this.plain) {
      this.parent.add((this.plain = lowTwin(this.fine)));
      this.made?.(this.plain);
    }
    this.fine.visible = !plain;
    if (!this.plain) return;
    this.plain.visible = plain;
    // (not on the plain level: its boxes stand in for nothing)
    const paint = plain && !past && !graphicsNow.plainBlocks;
    if (paint === this.painted) return;
    this.painted = paint;
    for (const c of this.plain.children) if ((c as InstancedMesh).isInstancedMesh) paintRim(c as InstancedMesh, paint);
  }
}

/**
 * A plain-box twin of voxel meshes (from `buildVoxelMesh`): the same blocks
 * as plain boxes (12 triangles each instead of 44). The twin shares the
 * meshes' instance buffers (positions, sizes, colours, open sides, the
 * sides that can be seen), so it costs no extra memory or upload; show one
 * of the two at a time. It has no `voxelShape`: the look panel and the
 * roaming walk map read the originals. It draws with the original's
 * material, so where that leaves covered sides out (cull.ts `cutCovered`:
 * the bevelled original keeps them, a plain box drops them) the twin does
 * too (the land's meshes are already cut by the sides their blocks show,
 * VoxelMesh.ts `hideCovered`: no gain measured there), and it is on the
 * original's layers (made after the build, it still casts the low level's
 * still shadows: a map opened on medium that auto steps down to low).
 */
export function lowTwin(src: Group): Group {
  const twin = new Group();
  twin.name = `${src.name}:plain`;
  twin.userData.voxelOffset = src.userData.voxelOffset;
  for (const child of src.children) {
    const m = child as InstancedMesh;
    if (!m.isInstancedMesh) continue;
    // (the mesh is named "<group>:<family>")
    const spec = VOXEL_MATERIALS[m.name.slice(m.name.lastIndexOf(':') + 1) as keyof typeof VOXEL_MATERIALS];
    const unit = unitVoxelGeometry(spec?.bevel ?? 0.1, 0);
    const geo = new BufferGeometry();
    // (only the sides its blocks show, if the mesh leaves some out)
    geo.setIndex(openSidesIndex(unit, m.userData.voxelSides ?? 63));
    geo.setAttribute('position', unit.getAttribute('position'));
    geo.setAttribute('normal', unit.getAttribute('normal'));
    for (const name of ['voxOpen', 'voxRadius', 'voxSurf', 'voxShown']) {
      const a = m.geometry.getAttribute(name);
      if (a) geo.setAttribute(name, a);
    }
    const t = new InstancedMesh(geo, m.material, m.count);
    t.name = `${m.name}:plain`;
    t.instanceMatrix = m.instanceMatrix;
    t.instanceColor = m.instanceColor;
    t.castShadow = m.castShadow;
    t.receiveShadow = m.receiveShadow;
    t.layers.mask = m.layers.mask;
    t.customDepthMaterial = m.customDepthMaterial;
    // (and draws the way it does, e.g. only the sides that face the camera, and in the shadow map those away from the light)
    t.onBeforeRender = m.onBeforeRender;
    t.onAfterRender = m.onAfterRender;
    t.onBeforeShadow = m.onBeforeShadow;
    t.onAfterShadow = m.onAfterShadow;
    // (and how many of its blocks the overview camera sees, terrain/seen.ts)
    t.userData = { voxelSources: m.userData.voxelSources, seenCount: m.userData.seenCount, allCount: m.userData.allCount };
    t.boundingSphere = m.boundingSphere;
    t.boundingBox = m.boundingBox;
    twin.add(t);
  }
  return twin;
}

/**
 * Bevelled chunk meshes and their plain twins, switched by the roaming
 * camera's distance. A twin is made the first time it is needed (so the
 * parts that scan the scene's blocks while the map is built see each block
 * once).
 */
export class ChunkLods {
  private readonly list: ChunkSwitch[] = [];
  private readonly flat = new Vector3();

  /** Add the bevelled meshes of a chunk (`box`: its ground plan) to `parent`. */
  add(parent: Group, box: Box3, fine: Group): void {
    parent.add(fine);
    this.list.push(new ChunkSwitch(box, fine, parent));
  }

  update(camera: Camera, roaming: boolean): void {
    this.flat.set(camera.position.x, 0, camera.position.z);
    const from = roaming ? PLAIN_FROM.roam : PLAIN_FROM.overview;
    const pixel = pixelSize(camera);
    for (const l of this.list) l.update(camera.position, this.flat, from, pixel);
  }
}
