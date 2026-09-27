import { BufferGeometry, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Vector3, type Box3, type BufferAttribute, type Color, type Material, type Matrix4 } from 'three';
import type { SourceTrace } from '../../feedback/sourceTrace';
import { VOXEL_MATERIALS, type VoxelMaterialKey } from '../../voxel/materials';
import { openSidesIndex, unitVoxelGeometry } from '../../voxel/VoxelMesh';
import { graphicsNow } from '../graphics';

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
 *    `setGraphics` makes them.
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
  near: InstancedMesh | null;
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

export class SpotBatch {
  readonly object = new Group();
  blocks = 0;
  private readonly fams = new Map<VoxelMaterialKey, Family>();
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
    this.compose();
    return this;
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
    for (const fam of this.fams.values()) if (!key || fam.key === key) out.push(fam.far, ...(fam.near ? [fam.near] : []));
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
      near: split ? mesh(':near') : null,
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
        const w = fam.near && plain && this.near & (1 << s) ? 1 : 0;
        const mesh = meshes[w]!;
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
        if (!mesh) continue;
        mesh.count = counts[w];
        mesh.visible = counts[w] > 0;
        // (all of it, not the blocks last moved)
        for (const a of [mesh.instanceMatrix, mesh.instanceColor!, ...[...fam.sizes.keys()].map((name) => mesh.geometry.getAttribute(name) as InstancedBufferAttribute)]) {
          a.clearUpdateRanges();
          a.needsUpdate = true;
        }
        mesh.userData.voxelSources = src[w];
        // (on the plain level: the map's families plain everywhere; the others plain far off, with their edges near)
        const far = w === 0 && (fam.split || !this.anyNear);
        setShape(mesh.geometry, plain && (fam.map || far) ? fam.plain : fam.own);
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
