import { Box3, Sphere, Vector3, type BufferAttribute, type BufferGeometry, type Camera, type InstancedMesh, type Object3D } from 'three';
import { VOXEL_MATERIALS, type VoxelMaterialKey } from '../../voxel/materials';
import { openSidesIndex, unitVoxelGeometry } from '../../voxel/VoxelMesh';
import { chamferOf, FAR_PLAIN, graphicsNow, paintRim, pixelSize, PLAIN_HOLD, PLAIN_PX } from '../graphics';

/**
 * The zip line's blocks as plain boxes far off (_zip.ts): its decks, stairs,
 * cables and trees (jungle/_zipLine.ts: one mesh per family for the whole
 * line, 480 m from the first tree to the last) are built in idle time after
 * Start, after the graphics level gave every block of the map its shape
 * (graphics.ts `setGraphics`, `plainFar`), so they kept their cut edges (44
 * triangles a block, not 12) at any distance and on every level; and judged
 * as one mesh (its sphere 240 m round) they would be near from anywhere by
 * the line. Here each mesh is judged by its blocks round each tree (the
 * nearest of them to the camera), as graphics.ts judges the map's: on the
 * plain level (low) the map's families (the trees' leaves and bark, the
 * footing stones) are plain everywhere and the others (wood, steel, brass)
 * from `FAR_PLAIN` m; on the other levels a mesh is plain once its largest
 * cut edge spans under the level's `PLAIN_PX` where it comes nearest
 * (`pixelSize`: a zoomed photo keeps them), its cut rim painted as the
 * map's are (`paintRim`: the trees' and stones' materials are the map's,
 * their rim shaders compiled at load). The wood, steel and brass wear their
 * own copies (the near fade, roam/_nearFade.ts), whose rim shaders nothing
 * compiles before (a hitch the first time): unpainted, from half that. The
 * meshes are graphics.ts's no more (their `voxelShape` goes: as the ramps'
 * batches, roam/_rampBatch.ts). The east walk 66 → 28 k triangles on low
 * (live, built late: 103 k). Up close the same.
 */

/** The wood, steel and brass (unpainted) go plain from this share of the level's `PLAIN_PX`. */
const UNPAINTED = 0.5;

type Shape = { index: BufferAttribute; position: BufferAttribute; normal: BufferAttribute };

interface Piece {
  mesh: InstancedMesh;
  map: boolean;
  /** Its largest cut edge (m). */
  edge: number;
  own: Shape;
  plain: Shape;
  /** Its blocks round each tree (world). */
  near: Sphere[];
  out: boolean;
}

export class ZipLod {
  private readonly pieces: Piece[] = [];
  /** The graphics level last frame (a change: every mesh's shape and rim again). */
  private level = '';

  /** The voxel meshes under `roots` that stand still, their blocks grouped round `places` (the trees: x, z). */
  constructor(roots: readonly Object3D[], places: readonly { x: number; z: number }[]) {
    for (const root of roots) {
      root.updateWorldMatrix(true, true);
      for (const o of root.children) {
        const mesh = o as InstancedMesh;
        const shape = mesh.userData.voxelShape as { segments: number } | undefined;
        if (!mesh.isInstancedMesh || !shape?.segments || Array.isArray(mesh.material)) continue;
        const key = (mesh.material.name.split(':')[1] ?? '') as VoxelMaterialKey;
        const spec = VOXEL_MATERIALS[key];
        if (!spec) continue;
        const geo = mesh.geometry;
        const unit = unitVoxelGeometry(spec.bevel, 0);
        const sides = (mesh.userData.voxelSides as number | undefined) ?? 63;
        // (graphics.ts leaves it to us from now on: a level's change, or a shot that built it before the level was set)
        delete mesh.userData.voxelShape;
        // Its blocks round each place (by the nearest), a sphere each.
        const boxes = places.map(() => new Box3());
        const e = mesh.instanceMatrix.array;
        for (let i = 0; i < mesh.count; i++) {
          const k = i * 16;
          _p.set(e[k + 12], e[k + 13], e[k + 14]).applyMatrix4(mesh.matrixWorld);
          const half = 0.5 * Math.max(Math.hypot(e[k], e[k + 1], e[k + 2]), Math.hypot(e[k + 4], e[k + 5], e[k + 6]), Math.hypot(e[k + 8], e[k + 9], e[k + 10]));
          let best = 0;
          for (let j = 1; j < places.length; j++) if (Math.hypot(places[j].x - _p.x, places[j].z - _p.z) < Math.hypot(places[best].x - _p.x, places[best].z - _p.z)) best = j;
          boxes[best].expandByPoint(_q.copy(_p).addScalar(-half)).expandByPoint(_q.copy(_p).addScalar(half));
        }
        this.pieces.push({
          mesh,
          map: key.startsWith('map'),
          edge: chamferOf(mesh) * mesh.matrixWorld.getMaxScaleOnAxis(),
          own: { index: geo.index!, position: geo.getAttribute('position') as BufferAttribute, normal: geo.getAttribute('normal') as BufferAttribute },
          plain: { index: openSidesIndex(unit, sides), position: unit.getAttribute('position') as BufferAttribute, normal: unit.getAttribute('normal') as BufferAttribute },
          near: boxes.filter((b) => !b.isEmpty()).map((b) => b.getBoundingSphere(new Sphere())),
          out: false,
        });
      }
    }
  }

  /** Every frame: each mesh plain or with its cut edges, for the camera that draws the picture. */
  update(camera: Camera): void {
    _eye.setFromMatrixPosition(camera.matrixWorld);
    const pixel = pixelSize(camera);
    const plainLevel = graphicsNow.plainBlocks;
    const again = this.level !== graphicsNow.level;
    this.level = graphicsNow.level;
    for (const p of this.pieces) {
      let d = Infinity;
      for (const s of p.near) d = Math.min(d, s.center.distanceTo(_eye) - s.radius);
      const px = PLAIN_PX[graphicsNow.level] * (p.map ? 1 : UNPAINTED);
      const from = plainLevel ? (p.map ? -Infinity : FAR_PLAIN) : px > 0 ? (p.edge * Math.SQRT2) / (px * pixel) : Infinity;
      const out = d > from * (p.out ? 1 : 1 + PLAIN_HOLD);
      if (out === p.out && !again && p.mesh.geometry.index === (out ? p.plain : p.own).index) continue;
      p.out = out;
      setShape(p.mesh.geometry, out ? p.plain : p.own);
      paintRim(p.mesh, out && p.map && !plainLevel);
    }
  }
}

function setShape(geo: BufferGeometry, s: Shape): void {
  if (geo.index === s.index) return;
  geo.setIndex(s.index);
  geo.setAttribute('position', s.position);
  geo.setAttribute('normal', s.normal);
}

const _p = new Vector3();
const _q = new Vector3();
const _eye = new Vector3();
