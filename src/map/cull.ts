import { Box3, Frustum, Matrix4, Sphere, Vector3, type InstancedMesh, type Mesh, type Object3D } from 'three';
import { VoxelBuilder } from '../voxel/VoxelBuilder';
import type { MapFrame } from './types';

/**
 * Drawing only what can be seen, for parts spread over the map.
 *
 * - `splitByPlace`: a part's blocks cut into one builder per place (sites
 *   near each other share one), so each place is its own set of meshes
 *   with a tight bounding sphere, and three leaves out the places off
 *   screen. One mesh for blocks all over the map is in view from anywhere.
 * - `ShadowGate`: the key light's shadow map covers the whole map
 *   (atmosphere.ts), so three draws every shadow caster into it (every
 *   third frame) wherever the camera is. A gated mesh casts only while the
 *   ground its shadow can fall on is in view: the box round its blocks,
 *   swept away from the light as far as the shadow of its top reaches, and
 *   padded for the camera turning until the next shadow redraw. Out of
 *   view, none of its shadow can be seen: the picture is the same. In the
 *   first frames every gated mesh casts (and, if asked, is drawn wherever
 *   the camera looks), so its shaders are compiled at load.
 */

/** Frames at load when every gated mesh casts and is drawn wherever the camera looks (its shaders compile then). */
const WARM = 3;
/** Kept on this far round (m) plus this share of its distance: the shadow map is redrawn every third frame, the camera moves and turns meanwhile. */
const PAD = { m: 12, perM: 0.12 };
/** The light no lower than this (sin of its height) for how far a shadow reaches. */
const LOW_LIGHT = 0.2;
/** A shadow can fall this far below the foot of what casts it (m: the land falls away, water, hillsides). */
const FALL = 12;

/** What the camera sees this frame, and where the key light comes from. */
export class CastView {
  readonly eye = new Vector3();
  /** Toward the key light (`f.lightDir`). */
  readonly light = new Vector3(0, 1, 0);
  private readonly frustum = new Frustum();
  private readonly m = new Matrix4();
  private readonly s = new Sphere();

  set(f: MapFrame): void {
    const cam = f.camera;
    this.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m);
    this.eye.setFromMatrixPosition(cam.matrixWorld);
    this.light.copy(f.lightDir);
  }

  /** A sphere (world) in view, padded for the frames until the next shadow redraw. */
  sees(c: Vector3, r: number): boolean {
    this.s.center.copy(c);
    this.s.radius = r + PAD.m + PAD.perM * Math.max(0, c.distanceTo(this.eye) - r);
    return this.frustum.intersectsSphere(this.s);
  }

  /** Whether the shadow of what fills a sphere (world), `h` m from its foot to its top, can be in view. */
  seesShadow(c: Vector3, r: number, h: number): boolean {
    // Swept away from the light by the reach of its top's shadow: inside the sphere round the sweep's middle.
    const reach = (h + FALL) / Math.max(LOW_LIGHT, this.light.y);
    const x = c.x - (this.light.x * reach) / 2;
    const y = c.y - (this.light.y * reach) / 2;
    const z = c.z - (this.light.z * reach) / 2;
    return this.sees(_c.set(x, y, z), r + reach / 2);
  }
}
const _c = new Vector3();

interface Gated {
  obj: Object3D;
  c: Vector3;
  r: number;
  h: number;
}

/** Meshes that cast their shadows only while the shadows can be seen (see the file's comment). */
export class ShadowGate {
  readonly view = new CastView();
  private readonly items: Gated[] = [];
  private frames = 0;

  /**
   * @param cull also drawn wherever the camera looks in the warm frames
   *   (meshes culled by three that would otherwise compile their shaders
   *   only when first seen)
   */
  constructor(private readonly cull = false) {}

  /** Every mesh under `root` (standing still) that casts a shadow, on the box round its blocks. */
  addAll(root: Object3D): this {
    root.updateWorldMatrix(true, true);
    const box = new Box3();
    root.traverse((o) => {
      const mesh = o as Mesh & Partial<InstancedMesh>;
      if (!mesh.isMesh || !mesh.castShadow) return;
      if (mesh.isInstancedMesh) {
        if (!mesh.boundingBox) mesh.computeBoundingBox!();
        box.copy(mesh.boundingBox!);
      } else {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        box.copy(mesh.geometry.boundingBox!);
      }
      if (box.isEmpty()) return;
      box.applyMatrix4(mesh.matrixWorld);
      this.add(mesh, box);
    });
    return this;
  }

  /** One object (its shadow and, if `cull`, its drawing in the warm frames), on a box (world). */
  add(obj: Object3D, box: Box3): this {
    const s = box.getBoundingSphere(new Sphere());
    this.items.push({ obj, c: s.center, r: s.radius, h: box.max.y - box.min.y });
    return this;
  }

  get count(): number {
    return this.items.length;
  }

  update(f: MapFrame): void {
    if (this.frames <= WARM) {
      // (warm: all cast and, if asked, all drawn; then culled as usual)
      const warm = this.frames++ < WARM;
      for (const it of this.items) {
        it.obj.castShadow = true;
        if (this.cull) it.obj.frustumCulled = !warm;
      }
      if (warm) return;
    }
    this.view.set(f);
    for (const it of this.items) it.obj.castShadow = this.view.seesShadow(it.c, it.r, it.h);
  }
}

/**
 * A builder's blocks cut by place: each block goes to the nearest of
 * `places` (x, z); places closer than `join` m to an earlier one share its
 * builder. Blocks of the families in `whole` stay together in `rest` (one
 * mesh the part looks up by name, e.g. glow blocks whose order matters).
 */
export function splitByPlace(b: VoxelBuilder, places: readonly { x: number; z: number }[], join: number, whole: readonly string[] = []): { parts: VoxelBuilder[]; rest: VoxelBuilder } {
  const groupOf: number[] = [];
  const heads: { x: number; z: number }[] = [];
  for (const p of places) {
    const g = heads.findIndex((h) => Math.hypot(h.x - p.x, h.z - p.z) < join);
    if (g >= 0) groupOf.push(g);
    else {
      groupOf.push(heads.length);
      heads.push(p);
    }
  }
  const parts = heads.map(() => new VoxelBuilder());
  const rest = new VoxelBuilder();
  for (const box of b.boxes) {
    if (whole.includes(box.mat)) {
      rest.boxes.push(box);
      continue;
    }
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < places.length; i++) {
      const d = (places[i].x - box.x) ** 2 + (places[i].z - box.z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    parts[groupOf[best]].boxes.push(box);
  }
  return { parts: parts.filter((p) => p.boxes.length), rest };
}
