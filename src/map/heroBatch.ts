import { BufferGeometry, DataTexture, FloatType, FrontSide, Group, InstancedBufferAttribute, InstancedMesh, NearestFilter, Object3D, RGBAFormat, ShaderChunk, type BufferAttribute, type Material, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { getVoxelMaterial, VOXEL_MATERIALS, type VoxelMaterialKey, type VoxelMaterialSpec } from '../voxel/materials';
import { unitVoxelGeometry } from '../voxel/VoxelMesh';

/**
 * The roaming explorer in a few draws.
 *
 * He is ≈ 90 voxel meshes, one per joint and family (the hat's straw on the
 * head, the shirt on the chest, the boots on each ankle …): a phone walk drew
 * 48–50 of them every frame, a fifth of the frame's draws, 33–45 of them
 * under 2,000 triangles. A draw costs the browser and the driver about the
 * same whether it has 20 blocks or 2,000, and an ordinary phone is short of
 * exactly that time. They cannot be merged as they are (each hangs from its
 * own joint), and baking his blocks into world space would change how they
 * are shaded (the block shader seeds each block's grain from its own place).
 *
 * So, on the low level while he roams, his opaque blocks are drawn from a few
 * instanced meshes, one per family and block shape (≈ 15), each block as it
 * is in its own mesh (its matrix, colour, open sides, rounding), plus the row
 * of its mesh in a small float texture of world matrices written each frame
 * ({@link JOINTS}): a variant of the family's material (`VOX_JOINT`, a
 * program of its own, compiled at load with the rest) puts the block through
 * that matrix where three put it through the mesh's. The same picture (the
 * shading is the block's own; the normals turn with the joint, as three's
 * normal matrix does for the uniform scales his joints have), in a third of
 * the draws. His own meshes stay as they are for everything else (picking,
 * the bug report, the walk map, other levels, the ledge's still shadows);
 * they are only kept out of the frame's picture ({@link beforeRender}, layer
 * mask 0, back right after it). Blocks the batch cannot take (transparent,
 * unlit, two-sided, a mesh drawn in its own way) are drawn as before.
 *
 * The batch follows him: his visible meshes are listed each frame, and the
 * batch is made again when any of them changes (shown or hidden, a new
 * outfit or tool, a blink's face, the head fade's shrunk blocks, a rounding
 * step): a copy of their instance data, ≈ 0.1–0.3 ms, a few times a minute.
 * `herobatch=0` in the URL draws him mesh by mesh (to compare).
 */

/** Rows of the joint matrices' texture: at most this many of his meshes are batched (the rest draw as before). */
const MAX_ROWS = 256;
const rows = new Float32Array(MAX_ROWS * 16);
/** Each batched mesh's world matrix, a row of four RGBA texels (its columns). */
const JOINTS = new DataTexture(rows, 4, MAX_ROWS, RGBAFormat, FloatType);
JOINTS.minFilter = JOINTS.magFilter = NearestFilter;
JOINTS.generateMipmaps = false;
JOINTS.needsUpdate = true;
const jointsUniform = { value: JOINTS };

export const HERO_BATCH = typeof location === 'undefined' || new URLSearchParams(location.search).get('herobatch') !== '0';

/** The families the explorer is made of (characters' families: their joint variants are compiled at load). */
const HERO_FAMILIES: VoxelMaterialKey[] = ['skin', 'face', 'hair', 'eye', 'shirt', 'shorts', 'sock', 'krama', 'leather', 'boot', 'metal', 'brass', 'lens', 'wood', 'hat'];

const variants = new WeakMap<Material, Material>();

/** The joint variant of a voxel family's material: the same shading, each block through its mesh's world matrix from {@link JOINTS}. */
function jointMaterial(base: Material): Material {
  let m = variants.get(base);
  if (!m) {
    m = base.clone();
    m.name = `${base.name}:joint`;
    m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => {
      base.onBeforeCompile.call(base, shader, renderer);
      jointVertex(shader);
    };
    m.customProgramCacheKey = () => `${base.customProgramCacheKey.call(base)}|joint`;
    variants.set(base, m);
  }
  if (m.userData.jointOf !== base.version) {
    m.userData.jointOf = base.version;
    m.defines = { ...(base.defines ?? {}), VOX_JOINT: '' };
    m.needsUpdate = true;
  }
  return m;
}

/** The vertex shader of a joint variant: the block's mesh matrix from the texture, between its instance matrix and three's model-view (identity model). */
function jointVertex(shader: WebGLProgramParametersWithUniforms): void {
  shader.uniforms.uVoxJoints = jointsUniform;
  const chunk = (name: 'defaultnormal_vertex' | 'project_vertex' | 'worldpos_vertex', from: string, to: string): string => {
    const text = ShaderChunk[name];
    if (!text.includes(from)) console.warn(`[heroBatch] three's ${name} has changed: the joint variant cannot place its matrix`);
    return text.replace(from, to);
  };
  const steps: [string, string][] = [
    [
      '#include <common>',
      /* glsl */ `#include <common>
attribute float voxJoint;
uniform highp sampler2D uVoxJoints;
mat4 voxJointMatrix() {
  int r = int(voxJoint + 0.5);
  return mat4(texelFetch(uVoxJoints, ivec2(0, r), 0), texelFetch(uVoxJoints, ivec2(1, r), 0), texelFetch(uVoxJoints, ivec2(2, r), 0), texelFetch(uVoxJoints, ivec2(3, r), 0));
}`,
    ],
    ['void main() {', 'void main() {\n  mat4 voxJointM = voxJointMatrix();'],
    ['#include <defaultnormal_vertex>', chunk('defaultnormal_vertex', 'transformedNormal = normalMatrix * transformedNormal;', 'transformedNormal = normalMatrix * ( mat3( voxJointM ) * transformedNormal );')],
    ['#include <project_vertex>', chunk('project_vertex', 'mvPosition = modelViewMatrix * mvPosition;', 'mvPosition = modelViewMatrix * ( voxJointM * mvPosition );')],
    ['#include <worldpos_vertex>', chunk('worldpos_vertex', 'worldPosition = modelMatrix * worldPosition;', 'worldPosition = modelMatrix * ( voxJointM * worldPosition );')],
  ];
  for (const [from, to] of steps) {
    if (!shader.vertexShader.includes(from)) console.warn(`[heroBatch] the joint variant found no ${from} in the shader`);
    shader.vertexShader = shader.vertexShader.replace(from, to);
  }
}

/** A mesh the batch can take: one of his opaque, lit, one-sided voxel meshes drawn the plain way, shown, on the picture's layer. */
function batchable(m: InstancedMesh): boolean {
  const mat = m.material;
  if (Array.isArray(mat) || !mat.name.startsWith('voxel:') || mat.transparent || mat.side !== FrontSide) return false;
  const spec = VOXEL_MATERIALS[mat.name.slice(6) as VoxelMaterialKey] as VoxelMaterialSpec | undefined;
  if (!spec || spec.unlit) return false;
  const g = m.geometry;
  if (!g.index || !g.getAttribute('voxOpen') || !g.getAttribute('voxRadius') || !m.instanceColor || m.count <= 0) return false;
  if (m.onBeforeRender !== Object3D.prototype.onBeforeRender && !m.userData.backFacets) return false;
  return (m.layers.mask & 1) !== 0;
}

/** Shown: it and every parent visible, up to the scene. */
function shown(o: Object3D): boolean {
  for (let x: Object3D | null = o; x; x = x.parent) if (!x.visible) return false;
  return true;
}

/** An id for an object (shared buffers, materials) in a batch's key. */
const ids = new WeakMap<object, number>();
let nextId = 1;
const idOf = (o: object): number => {
  let id = ids.get(o);
  if (id === undefined) ids.set(o, (id = nextId++));
  return id;
};

export class HeroBatch {
  /** The batch's meshes (in the scene, shown only while a frame is drawn: {@link beforeRender}). */
  readonly object = new Group();
  private sources: InstancedMesh[] = [];
  private sig: unknown[] = [];
  private readonly batches = new Map<string, InstancedMesh>();
  private readonly hidden: { o: Object3D; mask: number }[] = [];
  private readonly list: InstancedMesh[] = [];
  private readonly now: unknown[] = [];
  /** Batches made (for checks). */
  made = 0;

  constructor(private readonly root: Object3D) {
    this.object.name = 'foreground:heroBatch';
    this.object.visible = false;
    // (their programs compiled at load with the rest: a hidden mesh wearing each family's variant, as his would)
    const warm = new Group();
    warm.name = 'heroBatch:programs';
    warm.visible = false;
    for (const key of HERO_FAMILIES) {
      const geo = this.geometry(unitVoxelGeometry(VOXEL_MATERIALS[key].bevel, 0), 1, false, false);
      const m = new InstancedMesh(geo, jointMaterial(getVoxelMaterial(key)), 1);
      m.instanceColor = new InstancedBufferAttribute(new Float32Array(3), 3);
      m.frustumCulled = false;
      warm.add(m);
    }
    this.object.add(warm);
  }

  /** Before a frame's picture (main.ts): his meshes into the batch (made again if they changed), the batch shown and they kept out. */
  beforeRender(on: boolean): void {
    // (a picture drawn without its afterRender — a shot's — gave nothing back yet)
    this.afterRender();
    if (!on || !HERO_BATCH) return;
    // (his matrices as this frame draws them: the batch reads them before three's pass would make them)
    this.root.updateMatrixWorld();
    const list = this.list;
    const now = this.now;
    list.length = now.length = 0;
    this.root.traverseVisible((o) => {
      const m = o as InstancedMesh;
      if (!m.isInstancedMesh || list.length >= MAX_ROWS || !batchable(m)) return;
      const g = m.geometry;
      list.push(m);
      now.push(m, m.material, g.index, g.getAttribute('position'), g.getAttribute('normal'), m.count, m.instanceMatrix.version, m.instanceColor!.version, (g.getAttribute('voxOpen') as BufferAttribute).version, (g.getAttribute('voxRadius') as BufferAttribute).version, (g.getAttribute('voxSurf') as BufferAttribute | undefined)?.version ?? -1, (g.getAttribute('voxShown') as BufferAttribute | undefined)?.version ?? -1);
    });
    // (a hidden ancestor: `traverseVisible` stops there; the root itself hidden, nothing)
    if (!list.length || !shown(this.root)) return;
    let same = now.length === this.sig.length;
    for (let i = 0; same && i < now.length; i++) same = now[i] === this.sig[i];
    if (!same) this.rebuild();
    for (let i = 0; i < this.sources.length; i++) rows.set(this.sources[i].matrixWorld.elements, i * 16);
    JOINTS.needsUpdate = true;
    for (const m of this.sources) {
      this.hidden.push({ o: m, mask: m.layers.mask });
      m.layers.mask = 0;
    }
    this.object.visible = true;
  }

  /** After the frame's picture: his meshes back as they were, the batch hidden. */
  afterRender(): void {
    for (const h of this.hidden) h.o.layers.mask = h.mask;
    this.hidden.length = 0;
    this.object.visible = false;
  }

  /** The batch made again from his meshes now (`list`, `now`). */
  private rebuild(): void {
    this.made++;
    this.sources = this.list.slice();
    this.sig = this.now.slice();
    // Grouped by material and block shape (the same unit block, the same optional attributes).
    const groups = new Map<string, number[]>();
    this.sources.forEach((m, i) => {
      const g = m.geometry;
      const key = `${idOf(m.material as Material)}|${idOf(g.index!)}|${idOf(g.getAttribute('position'))}|${idOf(g.getAttribute('normal'))}|${g.getAttribute('voxSurf') ? 1 : 0}|${g.getAttribute('voxShown') ? 1 : 0}`;
      let at = groups.get(key);
      if (!at) groups.set(key, (at = []));
      at.push(i);
    });
    // (batches no longer wanted: let go)
    for (const [key, mesh] of this.batches)
      if (!groups.has(key)) {
        this.drop(mesh);
        this.batches.delete(key);
      }
    for (const [key, at] of groups) {
      const first = this.sources[at[0]];
      const fg = first.geometry;
      let total = 0;
      for (const i of at) total += this.sources[i].count;
      const surf = !!fg.getAttribute('voxSurf');
      const shownSides = !!fg.getAttribute('voxShown');
      let mesh = this.batches.get(key);
      if (!mesh || (mesh.instanceMatrix.array as Float32Array).length < total * 16) {
        if (mesh) this.drop(mesh);
        const geo = this.geometry(fg, total, surf, shownSides);
        mesh = new InstancedMesh(geo, jointMaterial(first.material as Material), total);
        mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(total * 3), 3);
        mesh.name = `heroBatch:${(first.material as Material).name.slice(6)}`;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = first.receiveShadow;
        this.batches.set(key, mesh);
        this.object.add(mesh);
      }
      // (the material's variant, made again if the family's material changed meanwhile)
      mesh.material = jointMaterial(first.material as Material);
      const g = mesh.geometry;
      const mat = mesh.instanceMatrix.array as Float32Array;
      const col = mesh.instanceColor!.array as Float32Array;
      const open = g.getAttribute('voxOpen').array as Float32Array;
      const radius = g.getAttribute('voxRadius').array as Float32Array;
      const joint = g.getAttribute('voxJoint').array as Float32Array;
      const sf = surf ? (g.getAttribute('voxSurf').array as Float32Array) : null;
      const sh = shownSides ? (g.getAttribute('voxShown').array as Float32Array) : null;
      let n = 0;
      for (const i of at) {
        const s = this.sources[i];
        const sg = s.geometry;
        const c = s.count;
        mat.set((s.instanceMatrix.array as Float32Array).subarray(0, c * 16), n * 16);
        col.set((s.instanceColor!.array as Float32Array).subarray(0, c * 3), n * 3);
        open.set((sg.getAttribute('voxOpen').array as Float32Array).subarray(0, c), n);
        radius.set((sg.getAttribute('voxRadius').array as Float32Array).subarray(0, c), n);
        if (sf) sf.set((sg.getAttribute('voxSurf').array as Float32Array).subarray(0, c * 4), n * 4);
        if (sh) sh.set((sg.getAttribute('voxShown').array as Float32Array).subarray(0, c), n);
        joint.fill(i, n, n + c);
        n += c;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
      for (const name of ['voxOpen', 'voxRadius', 'voxJoint', 'voxSurf', 'voxShown']) {
        const a = g.getAttribute(name);
        if (a) a.needsUpdate = true;
      }
    }
  }

  /** A batch's geometry: the unit block's shared buffers (index, position, normal) and its own per-block ones for `count` blocks. */
  private geometry(shape: BufferGeometry, count: number, surf: boolean, shownSides: boolean): BufferGeometry {
    const geo = new BufferGeometry();
    geo.setIndex(shape.index);
    geo.setAttribute('position', shape.getAttribute('position'));
    geo.setAttribute('normal', shape.getAttribute('normal'));
    geo.setAttribute('voxOpen', new InstancedBufferAttribute(new Float32Array(count), 1));
    geo.setAttribute('voxRadius', new InstancedBufferAttribute(new Float32Array(count), 1));
    geo.setAttribute('voxJoint', new InstancedBufferAttribute(new Float32Array(count), 1));
    if (surf) geo.setAttribute('voxSurf', new InstancedBufferAttribute(new Float32Array(count * 4), 4));
    if (shownSides) geo.setAttribute('voxShown', new InstancedBufferAttribute(new Float32Array(count), 1));
    return geo;
  }

  /** A batch mesh let go: its own buffers freed (the unit block's shared ones kept, as VoxelMesh.ts `disposeVoxelMesh` does). */
  private drop(mesh: InstancedMesh): void {
    mesh.removeFromParent();
    const g = mesh.geometry;
    g.setIndex(null);
    g.deleteAttribute('position');
    g.deleteAttribute('normal');
    g.dispose();
    mesh.dispose();
  }
}
