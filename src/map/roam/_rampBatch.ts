import { Box3, BufferGeometry, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Sphere, Vector3, type BufferAttribute, type Camera, type Color, type Material, type Matrix4 } from 'three';
import type { SourceTrace } from '../../feedback/sourceTrace';
import { VOXEL_MATERIALS, type VoxelMaterialKey } from '../../voxel/materials';
import { openSidesIndex, unitVoxelGeometry } from '../../voxel/VoxelMesh';
import { farJudges, graphicsNow, paintRim, pixelSize, PLAIN_HOLD, PLAIN_PX } from '../graphics';

/**
 * The blocks of the hang glider take-off spots, drawn together
 * (launchSpots.ts): one InstancedMesh per block family for all the ramps
 * (or all the parked gliders, or all the windsocks), not one per family
 * per ramp. The overview draws the five ramps, their windsocks, flags and
 * parked gliders in 16 draws, not 80.
 *
 * Each spot's blocks are kept apart (`add`, already in world space) and put
 * into the family's mesh one spot after the other (`compose`), again only
 * when something changes:
 *  - a spot can be left out (`setHidden`: the glider he took off with);
 *  - on the plain graphics level (low), a family of other blocks than the
 *    map's has two meshes (`split`): the spots within `FAR_PLAIN` m of the
 *    camera keep their edges, the rest are plain boxes. That is what
 *    graphics.ts `plainFar` does for a whole mesh (these meshes are left out
 *    of it: they carry no `voxelShape`, so a merged mesh as big as the map is
 *    not judged near by its bounds). Not split: plain on low while every spot
 *    is far. The map's families (bark, stone) are plain on low anywhere, as
 *    `setGraphics` makes them;
 *  - on the other levels every family has the two meshes: a spot's blocks
 *    keep their edges while its cut edges span the level's `PLAIN_PX` where
 *    the spot comes nearest the camera (graphics.ts `pixelSize`; `judge`,
 *    every frame from `plainFar`, `farJudges`), else they are plain boxes:
 *    the map's families with their cut rim painted (`paintRim`: their rim
 *    shaders are the map's, compiled at load), the others unpainted (their
 *    own copies of the materials: a rim shader would compile the first time,
 *    a hitch), from `UNPAINTED` of that limit, where the rim is a tenth of a
 *    pixel. Before, they kept their edges at any distance: the overview on
 *    medium drew the five parked gliders' sails in 116 k triangles (2,645
 *    blocks of 44) and the ramps in 84 k, 400 m off; now 32 k and 23 k.
 * Instance data (colours with their shade, side bits, pattern amounts) is
 * copied as `buildVoxelMesh` made it, so the blocks look the same. The code
 * that made each block stays with it (`voxelSources`: the bug report's picks).
 * A spot's blocks can be moved or recoloured (`writeMatrix`, `writeColor`,
 * then `flush` once a frame): the windsocks, the lamps.
 */

interface SpotData {
  n: number;
  matrix: Float32Array;
  color: Float32Array;
  /** The shader's own per-instance values, by attribute name. */
  attrs: Map<string, Float32Array>;
  src: (SourceTrace | undefined)[];
}

interface Family {
  key: VoxelMaterialKey;
  map: boolean;
  split: boolean;
  per: (SpotData | undefined)[];
  sizes: Map<string, number>;
  far: InstancedMesh;
  near: InstancedMesh;
  /** The largest cut edge of its blocks (m, as graphics.ts `chamferOf`), and the spots that keep their edges on the levels but low (bits: `judge`). */
  edge: number;
  pxNear: number;
  /** Its blocks in all spots. */
  blocks: number;
  /** Where each spot's blocks are now: 0 the far mesh, 1 the near one, −1 left out; and the first instance. */
  where: Int8Array;
  start: Int32Array;
  own: Shape;
  plain: Shape;
  /** Attributes written since the last `flush`. */
  dirty: Set<InstancedBufferAttribute>;
}

type Shape = { index: BufferAttribute; position: BufferAttribute; normal: BufferAttribute };

export interface SpotBatchOptions {
  /** Near spots in their own mesh on the plain level (see the file's note). */
  split?: boolean;
  /** Its own copies of the families' materials (the near fade, roam/_nearFade.ts, gives each material it finds one copy). */
  ownMaterials?: boolean;
  /**
   * Still blocks that stay bare in the snow (sky/snow.ts covers what is marked still; the ramps' planks, runner,
   * brass and rope stayed bare before they were, their posts and stones white): its own copies of the families'
   * materials but the map's, marked `noSnow`.
   */
  bare?: boolean;
  /** Blocks that move (m): the bounds grow by this. */
  margin?: number;
  /** Instance matrices written every frame (`writeMatrix`). */
  dynamic?: boolean;
}

/** On the levels but low, the families with their own materials go plain from this share of the level's `PLAIN_PX`: their rim, unpainted, is under a tenth of a pixel. */
const UNPAINTED = 0.1;
/** …and a family of fewer blocks than this (all spots) keeps its edges: a second draw would cost more (the lamps, the tubes). */
const SMALL = 64;

export class SpotBatch {
  readonly object = new Group();
  blocks = 0;
  private readonly fams = new Map<VoxelMaterialKey, Family>();
  /** Round each spot's blocks (world; null: none), for how near the camera is. */
  private spheres: (Sphere | null)[] = [];
  private near = 0;
  private hidden = 0;
  private shown = ~0;
  private plain: boolean | null = null;
  private anyNear = false;
  private built = false;

  constructor(
    readonly name: string,
    private readonly spots: number,
    private readonly opts: SpotBatchOptions = {},
  ) {
    this.object.name = name;
  }

  /** A spot's blocks: voxel meshes (`buildVoxelMesh`'s, or a model's families) and where they stand (their world matrix). */
  add(spot: number, meshes: Iterable<InstancedMesh>, world: Matrix4): void {
    if (this.built) throw new Error(`${this.name}: add after finish`);
    for (const mesh of meshes) {
      const n = mesh.count;
      if (!n) continue;
      const key = (Array.isArray(mesh.material) ? '' : mesh.material.name.split(':')[1]) as VoxelMaterialKey;
      if (!(key in VOXEL_MATERIALS)) throw new Error(`${this.name}: ${mesh.name} is not a voxel family`);
      const fam = this.fams.get(key) ?? this.family(key, mesh);
      const matrix = new Float32Array(n * 16);
      const m = mesh.instanceMatrix.array as Float32Array;
      for (let i = 0; i < n; i++) mulInto(world.elements, m, i * 16, matrix, i * 16);
      const color = mesh.instanceColor ? (mesh.instanceColor.array as Float32Array).slice(0, n * 3) : new Float32Array(n * 3).fill(1);
      const attrs = new Map<string, Float32Array>();
      for (const [name, a] of Object.entries(mesh.geometry.attributes)) {
        if (!(a as InstancedBufferAttribute).isInstancedBufferAttribute) continue;
        fam.sizes.set(name, a.itemSize);
        attrs.set(name, (a.array as Float32Array).slice(0, n * a.itemSize));
      }
      const src = (mesh.userData.voxelSources as (SourceTrace | undefined)[] | undefined)?.slice(0, n) ?? new Array(n).fill(undefined);
      fam.per[spot] = join(fam.per[spot], { n, matrix, color, attrs, src });
      this.blocks += n;
    }
  }

  /** Make the meshes (after every `add`): each family with room for all its spots. */
  finish(): this {
    this.built = true;
    for (const fam of this.fams.values()) {
      const total = fam.per.reduce((s, p) => s + (p?.n ?? 0), 0);
      for (const which of fam.near ? [fam.far, fam.near] : [fam.far]) {
        which.instanceMatrix = new InstancedBufferAttribute(new Float32Array(total * 16), 16);
        if (this.opts.dynamic) which.instanceMatrix.setUsage(DynamicDrawUsage);
        which.instanceColor = new InstancedBufferAttribute(new Float32Array(total * 3), 3);
        for (const [name, size] of fam.sizes) which.geometry.setAttribute(name, new InstancedBufferAttribute(new Float32Array(total * size), size));
      }
    }
    for (const fam of this.fams.values()) {
      fam.edge = edgeOf(fam);
      fam.blocks = fam.per.reduce((n, p) => n + (p?.n ?? 0), 0);
    }
    this.spheres = Array.from({ length: this.spots }, (_, s) => {
      const box = this.bounds(s, new Box3());
      if (box.isEmpty()) return null;
      const sphere = box.getBoundingSphere(new Sphere());
      sphere.radius += this.opts.margin ?? 0;
      return sphere;
    });
    this.compose();
    farJudges.push((camera) => this.judge(camera));
    return this;
  }

  /**
   * Every frame, on the levels but low (graphics.ts `plainFar`): which spots keep their edges, family by family (the
   * nearest of a spot's blocks within where its cut edges span the level's limit, a little further to go plain again).
   */
  private judge(camera: Camera): void {
    if (!this.built || graphicsNow.plainBlocks || this.plain === null) return;
    _eye.setFromMatrixPosition(camera.matrixWorld);
    const pixel = pixelSize(camera);
    const limit = PLAIN_PX[graphicsNow.level];
    let changed = false;
    for (const fam of this.fams.values()) {
      const px = limit * (fam.map ? 1 : UNPAINTED);
      const from = px > 0 && fam.edge > 0 && fam.blocks >= SMALL ? (fam.edge * Math.SQRT2) / (px * pixel) : Infinity;
      let mask = 0;
      for (let s = 0; s < this.spots; s++) {
        const sphere = this.spheres[s];
        if (!sphere) continue;
        const d = sphere.center.distanceTo(_eye) - sphere.radius;
        if (d < from * (fam.pxNear & (1 << s) ? 1 + PLAIN_HOLD : 1)) mask |= 1 << s;
      }
      if (mask !== fam.pxNear) {
        fam.pxNear = mask;
        changed = true;
      }
    }
    if (changed) this.compose();
  }

  /** The spots near the camera (bits): on the plain level their blocks keep their edges. */
  setNear(mask: number): void {
    if (mask === this.near) return;
    this.near = mask;
    this.anyNear = mask !== 0;
    if (this.plain) this.compose();
  }

  /** The spots left out (bits). */
  setHidden(mask: number): void {
    if (mask === this.hidden) return;
    this.hidden = mask;
    this.compose();
  }

  /** The spots that can be seen (bits; the others are left out, as three would leave out a mesh of their own). */
  setShown(mask: number): void {
    if (mask === this.shown) return;
    this.shown = mask;
    this.compose();
  }

  /** Every frame: the shapes of the graphics level (a change of level), and what was written sent to the GPU. */
  flush(): void {
    const plain = graphicsNow.plainBlocks;
    if (plain !== this.plain) {
      this.plain = plain;
      this.compose();
    }
    for (const fam of this.fams.values()) {
      for (const a of fam.dirty) a.needsUpdate = true;
      fam.dirty.clear();
    }
  }

  /** Move a spot's `k`-th block of a family (world matrix). */
  writeMatrix(key: VoxelMaterialKey, spot: number, k: number, m: Matrix4): void {
    const fam = this.fams.get(key)!;
    m.toArray(fam.per[spot]!.matrix, k * 16);
    const mesh = this.meshOf(fam, spot);
    if (!mesh) return;
    const o = (fam.start[spot] + k) * 16;
    m.toArray(mesh.instanceMatrix.array, o);
    touch(fam, mesh.instanceMatrix, o, 16);
  }

  /** Recolour a spot's `k`-th block of a family (linear, with its shade). */
  writeColor(key: VoxelMaterialKey, spot: number, k: number, c: Color): void {
    const fam = this.fams.get(key)!;
    c.toArray(fam.per[spot]!.color, k * 3);
    const mesh = this.meshOf(fam, spot);
    if (!mesh?.instanceColor) return;
    const o = (fam.start[spot] + k) * 3;
    c.toArray(mesh.instanceColor.array, o);
    touch(fam, mesh.instanceColor, o, 3);
  }

  /** A spot's blocks, all families, as they stand now: the box round them (world) added to `out`. */
  bounds(spot: number, out: Box3): Box3 {
    for (const fam of this.fams.values()) {
      const p = fam.per[spot];
      if (!p) continue;
      const m = p.matrix;
      for (let o = 0; o < p.n * 16; o += 16) {
        const hx = 0.5 * (Math.abs(m[o]) + Math.abs(m[o + 4]) + Math.abs(m[o + 8]));
        const hy = 0.5 * (Math.abs(m[o + 1]) + Math.abs(m[o + 5]) + Math.abs(m[o + 9]));
        const hz = 0.5 * (Math.abs(m[o + 2]) + Math.abs(m[o + 6]) + Math.abs(m[o + 10]));
        out.expandByPoint(_lo.set(m[o + 12] - hx, m[o + 13] - hy, m[o + 14] - hz));
        out.expandByPoint(_lo.set(m[o + 12] + hx, m[o + 13] + hy, m[o + 14] + hz));
      }
    }
    return out;
  }

  /** Every mesh (for a family's settings: shadows). */
  meshes(key?: VoxelMaterialKey): InstancedMesh[] {
    const out: InstancedMesh[] = [];
    for (const fam of this.fams.values()) if (!key || fam.key === key) out.push(fam.far, fam.near);
    return out;
  }

  private meshOf(fam: Family, spot: number): InstancedMesh | null {
    const w = fam.where[spot];
    return w < 0 ? null : w === 1 ? fam.near : fam.far;
  }

  private family(key: VoxelMaterialKey, from: InstancedMesh): Family {
    const map = key.startsWith('map');
    const split = !!this.opts.split && !map;
    let material = from.material as Material;
    const bare = !!this.opts.bare && !map;
    if (this.opts.ownMaterials || bare) material = ownCopy(material);
    if (bare) material.userData.noSnow = true;
    const g = from.geometry;
    const own: Shape = { index: g.index!, position: g.getAttribute('position') as BufferAttribute, normal: g.getAttribute('normal') as BufferAttribute };
    const unit = unitVoxelGeometry(VOXEL_MATERIALS[key].bevel, 0);
    const plain: Shape = { index: openSidesIndex(unit, 63), position: unit.getAttribute('position') as BufferAttribute, normal: unit.getAttribute('normal') as BufferAttribute };
    const mesh = (suffix: string) => {
      const geo = new BufferGeometry();
      setShape(geo, own);
      const m = new InstancedMesh(geo, material, 0);
      m.name = `${this.name}:${key}${suffix}`;
      m.castShadow = from.castShadow;
      m.receiveShadow = from.receiveShadow;
      m.customDepthMaterial = from.customDepthMaterial;
      this.object.add(m);
      return m;
    };
    const fam: Family = {
      key,
      map,
      split,
      per: new Array(this.spots),
      sizes: new Map(),
      far: mesh(''),
      near: mesh(':near'),
      edge: 0,
      pxNear: ~0,
      blocks: 0,
      where: new Int8Array(this.spots).fill(-1),
      start: new Int32Array(this.spots),
      own,
      plain,
      dirty: new Set(),
    };
    this.fams.set(key, fam);
    return fam;
  }

  /** Put every family's spots into its meshes, and give each mesh the level's shape. */
  private compose(): void {
    if (!this.built) return;
    const plain = !!this.plain;
    for (const fam of this.fams.values()) {
      const counts = [0, 0];
      const meshes = [fam.far, fam.near];
      const src: (SourceTrace | undefined)[][] = [[], []];
      for (let s = 0; s < this.spots; s++) {
        const p = fam.per[s];
        if (!p || this.hidden & (1 << s) || !(this.shown & (1 << s))) {
          fam.where[s] = -1;
          continue;
        }
        // (low: the near spots of a split family; the other levels: the spots whose cut edges still show)
        const w = (plain ? fam.split && this.near & (1 << s) : fam.pxNear & (1 << s)) ? 1 : 0;
        const mesh = meshes[w];
        const at = counts[w];
        (mesh.instanceMatrix.array as Float32Array).set(p.matrix, at * 16);
        (mesh.instanceColor!.array as Float32Array).set(p.color, at * 3);
        for (const [name, arr] of p.attrs) (mesh.geometry.getAttribute(name).array as Float32Array).set(arr, at * fam.sizes.get(name)!);
        src[w].push(...p.src);
        fam.where[s] = w;
        fam.start[s] = at;
        counts[w] += p.n;
      }
      for (const w of [0, 1]) {
        const mesh = meshes[w];
        mesh.count = counts[w];
        mesh.visible = counts[w] > 0;
        // (all of it, not the blocks last moved)
        for (const a of [mesh.instanceMatrix, mesh.instanceColor!, ...[...fam.sizes.keys()].map((name) => mesh.geometry.getAttribute(name) as InstancedBufferAttribute)]) {
          a.clearUpdateRanges();
          a.needsUpdate = true;
        }
        mesh.userData.voxelSources = src[w];
        // (on the plain level: the map's families plain everywhere; the others plain far off, with their edges near;
        // on the others the far mesh plain, the map's families' rims painted)
        const far = plain ? fam.map || (w === 0 && (fam.split || !this.anyNear)) : w === 0;
        setShape(mesh.geometry, far ? fam.plain : fam.own);
        paintRim(mesh, !plain && w === 0 && fam.map && counts[w] > 0);
        if (mesh.count) {
          mesh.computeBoundingSphere();
          mesh.boundingSphere!.radius += this.opts.margin ?? 0;
        }
      }
      fam.dirty.clear();
    }
  }
}

const _lo = new Vector3();
const _eye = new Vector3();

/** The largest cut edge of a family's blocks (m, world), as the shader cuts them (graphics.ts `chamferOf`: a block's own radius, at most 0.45 of its smallest side, else that side × the family's bevel). */
function edgeOf(fam: Family): number {
  const bevel = VOXEL_MATERIALS[fam.key].bevel;
  let edge = 0;
  for (const p of fam.per) {
    if (!p) continue;
    const own = p.attrs.get('voxRadius');
    const m = p.matrix;
    for (let i = 0; i < p.n; i++) {
      const k = i * 16;
      const side = Math.min(Math.hypot(m[k], m[k + 1], m[k + 2]), Math.hypot(m[k + 4], m[k + 5], m[k + 6]), Math.hypot(m[k + 8], m[k + 9], m[k + 10]));
      edge = Math.max(edge, own && own[i] > 0 ? Math.min(own[i], side * 0.45) : side * bevel);
    }
  }
  return edge;
}

/** Mark part of an attribute written (sent to the GPU at `flush`); past a few dozen parts (a mesh left out for long), all of it. */
function touch(fam: Family, a: InstancedBufferAttribute, start: number, count: number): void {
  if (a.updateRanges.length < MAX_RANGES) a.addUpdateRange(start, count);
  else if (a.updateRanges.length === MAX_RANGES) a.addUpdateRange(0, a.array.length);
  fam.dirty.add(a);
}
const MAX_RANGES = 64;

/** A voxel family's material copied for one batch (the same shader: nothing more to compile). */
function ownCopy(m: Material): Material {
  const c = m.clone();
  c.defines = m.defines && { ...m.defines };
  c.onBeforeCompile = m.onBeforeCompile;
  c.customProgramCacheKey = m.customProgramCacheKey;
  return c;
}

function setShape(geo: BufferGeometry, s: Shape): void {
  if (geo.index === s.index) return;
  geo.setIndex(s.index);
  geo.setAttribute('position', s.position);
  geo.setAttribute('normal', s.normal);
}

/** One spot's blocks of a family added to what it has (two meshes of one family). */
function join(a: SpotData | undefined, b: SpotData): SpotData {
  if (!a) return b;
  const cat = (x: Float32Array, y: Float32Array) => {
    const out = new Float32Array(x.length + y.length);
    out.set(x);
    out.set(y, x.length);
    return out;
  };
  const attrs = new Map<string, Float32Array>();
  for (const [name, x] of a.attrs) attrs.set(name, cat(x, b.attrs.get(name) ?? new Float32Array((x.length / a.n) * b.n)));
  return { n: a.n + b.n, matrix: cat(a.matrix, b.matrix), color: cat(a.color, b.color), attrs, src: [...a.src, ...b.src] };
}

/** out[o‥o+16] = a · b[i‥i+16] (column-major 4 × 4). */
function mulInto(a: ArrayLike<number>, b: ArrayLike<number>, i: number, out: Float32Array, o: number): void {
  for (let c = 0; c < 4; c++) {
    const b0 = b[i + c * 4];
    const b1 = b[i + c * 4 + 1];
    const b2 = b[i + c * 4 + 2];
    const b3 = b[i + c * 4 + 3];
    for (let r = 0; r < 4; r++) out[o + c * 4 + r] = a[r] * b0 + a[4 + r] * b1 + a[8 + r] * b2 + a[12 + r] * b3;
  }
}
