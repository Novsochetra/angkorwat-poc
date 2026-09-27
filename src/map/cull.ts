import { Box3, Frustum, InstancedBufferAttribute, Matrix4, Sphere, Vector3, type InstancedMesh, type Material, type Mesh, type Object3D, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { getVoxelMaterial, VOXEL_MATERIALS, type VoxelMaterialKey } from '../voxel/materials';
import { VoxelBuilder, type VoxelBox } from '../voxel/VoxelBuilder';
import { shownSides } from '../voxel/VoxelMesh';
import { graphicsNow } from './graphics';
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
 *   the camera looks), so its shaders are compiled at load. Still shadows
 *   (the low graphics level, graphics.ts) are drawn once for wherever the
 *   camera goes next: every gated mesh casts then. Gated: the jungle
 *   sites, camps, village, paddies and hamlets (their own gates), the land,
 *   temples, road and ledge (main.ts; the land `addLive`: its plain twins
 *   join as they are made), the jungle's tiles (vegetation.ts, `CastView`).
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
  private readonly gated = new WeakSet<Object3D>();
  /** Roots whose new meshes join the gate (their children counted when last looked at). */
  private readonly live: { root: Object3D; n: number }[] = [];
  private frames = 0;

  /**
   * @param cull also drawn wherever the camera looks in the warm frames
   *   (meshes culled by three that would otherwise compile their shaders
   *   only when first seen)
   */
  constructor(private readonly cull = false) {}

  /**
   * Every mesh under `root` (standing still) that casts a shadow, on the box
   * round its blocks (those gated already are left); `any`: every mesh, as
   * it may be kept from casting just now (a twin made while its original was
   * gated off).
   */
  addAll(root: Object3D, any = false): this {
    root.updateWorldMatrix(true, true);
    const box = new Box3();
    root.traverse((o) => {
      const mesh = o as Mesh & Partial<InstancedMesh>;
      if (!mesh.isMesh || !(mesh.castShadow || any) || this.gated.has(mesh)) return;
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
    this.gated.add(obj);
    return this;
  }

  /**
   * Every mesh under `root` (all of them cast: the land), now and as they
   * come: when its children change (the plain twins its chunks make on the
   * way, terrain/lod.ts), the new ones join.
   */
  addLive(root: Object3D): this {
    this.live.push({ root, n: root.children.length });
    return this.addAll(root, true);
  }

  get count(): number {
    return this.items.length;
  }

  update(f: MapFrame): void {
    for (const l of this.live)
      if (l.root.children.length !== l.n) {
        l.n = l.root.children.length;
        this.addAll(l.root, true);
      }
    if (this.frames <= WARM) {
      // (warm: all cast and, if asked, all drawn; then culled as usual)
      const warm = this.frames++ < WARM;
      for (const it of this.items) {
        it.obj.castShadow = true;
        if (this.cull) it.obj.frustumCulled = !warm;
      }
      if (warm) return;
    }
    if (graphicsNow.stillShadows) {
      for (const it of this.items) it.obj.castShadow = true;
      return;
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

// ── Covered sides ───────────────────────────────────────────────────────────

/**
 * Plain boxes (the low level; far land and trees on the others) draw all six
 * sides of every block, and most of them lie against the next block: in a
 * temple wall 7 in 10 of the sides that face the camera. With `voxShown` per
 * instance (the sides that can be seen: VoxelMesh.ts `shownSides`, bits as
 * `open`, plus 64), these materials draw the others as nothing: their
 * corners go out of the clip volume, so the GPU drops the triangles before
 * it sets them up (the index is the same for every block: only the vertex
 * can tell). A plain box's corners are its own for each side and sit at
 * ±0.5 on every axis; the chamfered blocks keep all their sides (the groove
 * between two neighbours' cut edges would open onto what is behind). The
 * shadow casters keep theirs: the shadow pass draws every family with one
 * program, and a second one there cost more than the sides saved.
 */
const CUT_VERTEX = /* glsl */ `
#include <project_vertex>
if (voxShown > 63.5 && min(min(abs(position.x), abs(position.y)), abs(position.z)) > 0.499) {
  vec3 cvA = abs(normal);
  int cvSide = cvA.x > 0.5 ? (normal.x > 0.0 ? 1 : 2) : cvA.y > 0.5 ? (normal.y > 0.0 ? 4 : 8) : (normal.z > 0.0 ? 16 : 32);
  if ((int(voxShown + 0.5) & cvSide) == 0) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
}`;

/** Families that neither cover nor are cut: light, water, candle wax (they come and go, or are seen through). */
const NO_COVER = new Set(['glow', 'water', 'wax']);
const cutCopies = new Map<Material, Material>();

/** A voxel material that leaves covered sides out (made once per material). */
function cutCopy(base: Material): Material {
  let m = cutCopies.get(base);
  if (m) return m;
  m = base.clone();
  m.defines = base.defines && { ...base.defines };
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => {
    base.onBeforeCompile.call(base, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float voxShown;').replace('#include <project_vertex>', CUT_VERTEX);
  };
  m.customProgramCacheKey = () => `${base.customProgramCacheKey.call(base)}|cut`;
  m.name = `${base.name}:cut`;
  cutCopies.set(base, m);
  return m;
}

/**
 * Covered sides left out, block by block, on the plain boxes of the voxel
 * meshes under `roots` (parts that never move; main.ts). Each builder's
 * blocks (a `buildVoxelMesh` group) cover each other, as `hideCovered`
 * does at build (groups built with it already have `voxShown`); hidden
 * groups and light, water and wax are left as they are. Families with at
 * least `min` blocks there get the cut materials (each is a shader program
 * more). Returns the blocks looked at and the time taken.
 */
export function cutCovered(roots: readonly Object3D[], min = 1500): { blocks: number; ms: number } {
  const t0 = performance.now();
  const groups = new Set<Object3D>();
  const shown = (o: Object3D) => {
    for (let x: Object3D | null = o; x; x = x.parent) if (!x.visible) return false;
    return true;
  };
  for (const root of roots)
    root.traverse((o) => {
      const mesh = o as InstancedMesh;
      if (mesh.isInstancedMesh && mesh.geometry.getAttribute('voxOpen') && mesh.parent?.userData.voxelOffset && shown(mesh)) groups.add(mesh.parent);
    });
  let blocks = 0;
  const count = new Map<string, number>();
  const cut: InstancedMesh[] = [];
  for (const g of groups) {
    const meshes = g.children.filter((o) => {
      const m = o as InstancedMesh;
      return m.isInstancedMesh && m.count > 0 && m.geometry.getAttribute('voxOpen') && !NO_COVER.has(familyOf(m));
    }) as InstancedMesh[];
    if (!meshes.length) continue;
    if (!meshes.every((m) => m.geometry.getAttribute('voxShown'))) {
      // Each block as a box of the builder (the meshes sit in their group as built: no transform of their own).
      const boxes: VoxelBox[] = [];
      for (const m of meshes) {
        const e = m.instanceMatrix.array;
        const open = m.geometry.getAttribute('voxOpen').array;
        for (let i = 0; i < m.count; i++) {
          const k = i * 16;
          const turned = Math.abs(e[k + 1]) + Math.abs(e[k + 2]) + Math.abs(e[k + 4]) + Math.abs(e[k + 6]) + Math.abs(e[k + 8]) + Math.abs(e[k + 9]) > 1e-6 || !(e[k] > 0 && e[k + 5] > 0 && e[k + 10] > 0);
          boxes.push({ x: e[k + 12], y: e[k + 13], z: e[k + 14], sx: Math.abs(e[k]), sy: Math.abs(e[k + 5]), sz: Math.abs(e[k + 10]), color: 0, shade: 1, mat: 'mapStone', open: (open[i] as number) & 63, rx: turned ? 1 : 0 });
        }
      }
      const sides = shownSides(boxes);
      let j = 0;
      for (const m of meshes) {
        const a = new Float32Array(m.count);
        for (let i = 0; i < m.count; i++, j++) a[i] = sides[j] | 64;
        m.geometry.setAttribute('voxShown', new InstancedBufferAttribute(a, 1));
      }
      blocks += boxes.length;
    }
    for (const m of meshes) {
      count.set(familyOf(m), (count.get(familyOf(m)) ?? 0) + m.count);
      cut.push(m);
    }
  }
  for (const m of cut) {
    const key = familyOf(m) as VoxelMaterialKey;
    if ((count.get(key) ?? 0) < min || !VOXEL_MATERIALS[key]) continue;
    if (m.material === getVoxelMaterial(key)) m.material = cutCopy(m.material);
  }
  return { blocks, ms: performance.now() - t0 };
}

/** A voxel mesh's family (its name is "<group>:<family>"). */
function familyOf(m: InstancedMesh): string {
  return m.name.slice(m.name.lastIndexOf(':') + 1);
}
