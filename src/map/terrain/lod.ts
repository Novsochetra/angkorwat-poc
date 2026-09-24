import { Box3, BufferGeometry, Group, InstancedMesh, Vector3, type Camera } from 'three';
import { VOXEL_MATERIALS } from '../../voxel/materials';
import { unitVoxelGeometry } from '../../voxel/VoxelMesh';
import { MAP_BOUNDS } from '../layout';

/**
 * Chunks of the map for big voxel parts (the land, the jungle): each chunk
 * has its own meshes, so the camera only draws the chunks in front of it,
 * and chunks far from the camera draw their bevelled blocks as plain boxes
 * (the bevels are smaller than a pixel there).
 */

/** The map cut into square chunks. */
export class ChunkGrid {
  private readonly cx: number;
  private readonly cz: number;
  /** Number of chunks. */
  readonly count: number;

  /** `size`: chunk side (m). */
  constructor(readonly size: number) {
    this.cx = Math.ceil((MAP_BOUNDS.x1 - MAP_BOUNDS.x0) / size);
    this.cz = Math.ceil((MAP_BOUNDS.z1 - MAP_BOUNDS.z0) / size);
    this.count = this.cx * this.cz;
  }

  /** Chunk of a map point (points off the map go to the nearest chunk). */
  at(x: number, z: number): number {
    const a = Math.min(this.cx - 1, Math.max(0, Math.floor((x - MAP_BOUNDS.x0) / this.size)));
    const b = Math.min(this.cz - 1, Math.max(0, Math.floor((z - MAP_BOUNDS.z0) / this.size)));
    return a + b * this.cx;
  }

  /** A chunk's ground plan, as a box of any height. */
  box(n: number): Box3 {
    const a = n % this.cx;
    const b = (n - a) / this.cx;
    const x0 = MAP_BOUNDS.x0 + a * this.size;
    const z0 = MAP_BOUNDS.z0 + b * this.size;
    return new Box3(new Vector3(x0, -Infinity, z0), new Vector3(x0 + this.size, Infinity, z0 + this.size));
  }
}

/**
 * Chunks farther than this from the camera (m, on the map) draw plain boxes:
 * while roaming, and in the overview (only the back hills and the top of
 * the holy mountain, deep in the haze, are that far there).
 */
const PLAIN_FROM = { roam: 170, overview: 300 };

/**
 * A plain-box twin of voxel meshes (from `buildVoxelMesh`): the same blocks
 * as plain boxes (12 triangles each instead of 44). The twin shares the
 * meshes' instance buffers (positions, sizes, colours, open sides), so it
 * costs no extra memory or upload; show one of the two at a time. It has no
 * `voxelShape`: the look panel and the roaming walk map read the originals.
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
    geo.setIndex(unit.index);
    geo.setAttribute('position', unit.getAttribute('position'));
    geo.setAttribute('normal', unit.getAttribute('normal'));
    for (const name of ['voxOpen', 'voxRadius', 'voxSurf']) {
      const a = m.geometry.getAttribute(name);
      if (a) geo.setAttribute(name, a);
    }
    const t = new InstancedMesh(geo, m.material, m.count);
    t.name = `${m.name}:plain`;
    t.instanceMatrix = m.instanceMatrix;
    t.instanceColor = m.instanceColor;
    t.castShadow = m.castShadow;
    t.receiveShadow = m.receiveShadow;
    t.customDepthMaterial = m.customDepthMaterial;
    t.userData = { voxelSources: m.userData.voxelSources };
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
  private readonly list: { box: Box3; parent: Group; fine: Group; plain: Group | null }[] = [];
  private readonly flat = new Vector3();

  /** Add the bevelled meshes of a chunk (`box`: its ground plan) to `parent`. */
  add(parent: Group, box: Box3, fine: Group): void {
    parent.add(fine);
    this.list.push({ box, parent, fine, plain: null });
  }

  update(camera: Camera, roaming: boolean): void {
    this.flat.set(camera.position.x, 0, camera.position.z);
    const from = roaming ? PLAIN_FROM.roam : PLAIN_FROM.overview;
    for (const l of this.list) {
      const plain = l.box.distanceToPoint(this.flat) > from;
      if (plain && !l.plain) l.parent.add((l.plain = lowTwin(l.fine)));
      l.fine.visible = !plain;
      if (l.plain) l.plain.visible = plain;
    }
  }
}
