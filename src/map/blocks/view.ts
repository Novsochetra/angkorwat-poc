import { Box3, BufferGeometry, Group, InstancedBufferAttribute, InstancedMesh, Sphere, Vector3 } from 'three';
import { VOXEL_MATERIALS, type VoxelMaterialKey, type VoxelMaterialSpec } from '../../voxel/materials';
import { getVoxelDepthMaterial } from '../../voxel/shadow';
import { skipBackFacets } from '../../voxel/backFacets';
import { disposeVoxelMesh, openSidesIndex, unitVoxelGeometry } from '../../voxel/VoxelMesh';
import { CastView, coverMaterialOf } from '../cull';
import { graphicsNow, markStill, paintRim, pixelSize, plainAt } from '../graphics';
import type { MapContext, MapFrame, MapPart } from '../types';
import { edgeOf, FAMILIES, packChunk } from './mesh';
import { BLOCKS, chunkPlace, type BlockChange } from './store';

/**
 * The player's blocks on the map (the part `blocks`, main.ts): a group per
 * chunk of the store (store.ts `BLOCKS`), in it a mesh per block family
 * (mesh.ts `packChunk`: only the boxes that can be seen, their open and seen
 * sides, shade and colour). Nothing is made while the store is empty: no
 * draw, no work a frame.
 *
 * - **Rebuilt only where it changed**: each change (store.ts `BlockChange`)
 *   marks the chunks that see a changed cell (`touched`); the next frame
 *   makes each of them again once (a batch of thousands of blocks too), its
 *   meshes' arrays written in place (only the boxes in use sent to the GPU),
 *   a mesh made new only when a family outgrows its room. `stats()` gives
 *   each rebuild's time (`ms`, `maxMs`).
 * - **The map's look and programs**: the map's own families and the
 *   material its still parts wear (cull.ts `coverMaterialOf`: the cut copy
 *   whose plain boxes leave the covered sides out, block by block), its
 *   block shapes (one cut on medium and up, plain boxes on low), its depth
 *   material for shadows: no shader program of its own (perf's `programs`
 *   are the same with blocks and without).
 * - **Far** (the build view's rule, build/view.ts): a chunk's blocks are
 *   plain boxes once their cut edges span under a pixel where the chunk
 *   comes nearest the camera, their rims painted (graphics.ts `plainAt`,
 *   `paintRim`); hidden once a metre there spans under `HIDE_PX` pixels.
 * - **Shadows**: cast and received, still (graphics.ts `markStill`); the
 *   still map is asked again after a rebuild (at most once a second while
 *   blocks keep changing). On high and max (the shadow map drawn every few
 *   frames) a chunk casts only while its shadow can be in view (cull.ts
 *   `CastView`, as `ShadowGate` gates the map's parts). A chunk hidden by
 *   distance drops out of the still map; back in view, its shadow returns at
 *   the next still redraw (as build/view.ts; to watch in AWP-20).
 * - Drawn only from the sides that can face the camera (voxel/backFacets.ts),
 *   as the map's temples.
 */

/** A metre spans under this many pixels where the nearest block of a chunk is: hidden (build/view.ts `HIDE_PX`). */
const HIDE_PX = 0.9;
/** The still shadows asked again at most this often while blocks keep changing (s). */
const SHADOW_EVERY = 1;
/** A mesh's bounds grown by this (m): the shader pushes a covered side 1.2 cm into its neighbour. */
const BOUND_PAD = 0.05;

/** One family's mesh in a chunk, with room for `cap` boxes. */
interface FamMesh {
  readonly family: VoxelMaterialKey;
  readonly mesh: InstancedMesh;
  readonly cap: number;
  readonly open: InstancedBufferAttribute;
  readonly shown: InstancedBufferAttribute;
  readonly color: InstancedBufferAttribute;
  /** Its family's cut block and plain box, and the sides its index draws now. */
  readonly cut: BufferGeometry;
  readonly box: BufferGeometry;
  sides: number;
}

interface ChunkView {
  readonly key: number;
  readonly group: Group;
  /** By family slot (mesh.ts `FAMILIES`). */
  readonly meshes: (FamMesh | null)[];
  readonly sphere: Sphere;
  /** Its height (m), its largest cut edge (m). */
  height: number;
  edge: number;
  hidden: boolean;
  plain: boolean;
  /** Its meshes cast shadows now. */
  cast: boolean;
}

export interface BlocksStats {
  /** Blocks in the store, boxes drawn, blocks left out (all sides covered). */
  blocks: number;
  boxes: number;
  buried: number;
  /** Chunks drawn, meshes (draws), chunks hidden or plain now. */
  chunks: number;
  draws: number;
  hidden: number;
  plain: number;
  /** Chunks made again so far; the last one's time and the slowest (ms). */
  rebuilds: number;
  ms: number;
  maxMs: number;
  /** The last frame's rebuilds: chunks, ms in all. */
  lastFrame: { chunks: number; ms: number };
}

export interface BlocksPart extends MapPart {
  /** Make what changed now (else at the next frame): checks, timing. */
  flush(): number;
  stats(): BlocksStats;
  /**
   * Checks: the time to make a chunk again after one change (ms, `runs`
   * times: a block of the fullest chunk taken away and put back, each change
   * flushed on its own), as the live page does it.
   */
  bench(runs?: number): { runs: number; median: number; max: number; mean: number; chunkBlocks: number };
}

export function buildBlocksView(ctx: MapContext): BlocksPart {
  const object = new Group();
  object.name = 'blocks';
  const views = new Map<number, ChunkView>();
  const dirty = new Set<number>();
  let low = graphicsNow.plainBlocks;
  let shadowWant = false;
  let shadowAt = -Infinity;
  const st: BlocksStats = { blocks: 0, boxes: 0, buried: 0, chunks: 0, draws: 0, hidden: 0, plain: 0, rebuilds: 0, ms: 0, maxMs: 0, lastFrame: { chunks: 0, ms: 0 } };
  const boxes = new Map<number, { boxes: number; buried: number }>();

  // (blocks already in the store when the map is built: a save loaded first)
  for (const c of BLOCKS.chunkList()) dirty.add(c.key);
  BLOCKS.onChange((c: BlockChange) => {
    for (const k of c.touched) dirty.add(k);
  });

  function newMesh(family: VoxelMaterialKey, cap: number, key: number): FamMesh {
    const spec = VOXEL_MATERIALS[family] as VoxelMaterialSpec;
    const cut = unitVoxelGeometry(spec.bevel, 1, spec.chamfer ?? false);
    const box = unitVoxelGeometry(spec.bevel, 0);
    const geo = new BufferGeometry();
    const open = new InstancedBufferAttribute(new Float32Array(cap), 1);
    const shown = new InstancedBufferAttribute(new Float32Array(cap), 1);
    geo.setAttribute('voxOpen', open);
    geo.setAttribute('voxRadius', new InstancedBufferAttribute(new Float32Array(cap), 1));
    geo.setAttribute('voxShown', shown);
    const mesh = new InstancedMesh(geo, coverMaterialOf(family), cap);
    const color = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.instanceColor = color;
    mesh.count = 0;
    const { cx, cy, cz } = chunkPlace(key);
    mesh.name = `blocks:${cx},${cy},${cz}:${family}`;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.customDepthMaterial = getVoxelDepthMaterial(family);
    mesh.boundingBox = new Box3();
    mesh.boundingSphere = new Sphere();
    const f: FamMesh = { family, mesh, cap, open, shown, color, cut, box, sides: -1 };
    return f;
  }

  /** A mesh drawn with its plain box or its cut block, its index the sides it shows. */
  function shape(f: FamMesh, plain: boolean): void {
    const unit = plain ? f.box : f.cut;
    const geo = f.mesh.geometry;
    const index = openSidesIndex(unit, f.sides);
    if (geo.index === index && geo.getAttribute('position') === unit.getAttribute('position')) return;
    geo.setIndex(index);
    geo.setAttribute('position', unit.getAttribute('position'));
    geo.setAttribute('normal', unit.getAttribute('normal'));
  }

  function dropMesh(f: FamMesh): void {
    paintRim(f.mesh, false);
    f.mesh.removeFromParent();
    disposeVoxelMesh(f.mesh as unknown as Group);
  }

  function dropView(v: ChunkView): void {
    for (const f of v.meshes) if (f) dropMesh(f);
    v.group.removeFromParent();
    views.delete(v.key);
    boxes.delete(v.key);
  }

  /** Make chunk `key` again from the store. */
  function rebuild(key: number): void {
    const c = BLOCKS.chunkAt(key);
    let v = views.get(key);
    if (!c) {
      if (v) dropView(v);
      return;
    }
    const packed = packChunk(BLOCKS, c);
    boxes.set(key, { boxes: packed.boxes, buried: packed.buried });
    if (!packed.boxes) {
      if (v) dropView(v);
      return;
    }
    if (!v) {
      const group = new Group();
      const { cx, cy, cz } = chunkPlace(key);
      group.name = `blocks:${cx},${cy},${cz}`;
      // (builder space = world: the bug report's picks)
      group.userData.voxelOffset = new Vector3();
      v = { key, group, meshes: FAMILIES.map(() => null), sphere: new Sphere(), height: 0, edge: 0, hidden: false, plain: low, cast: true };
      views.set(key, v);
      object.add(group);
    }
    const all = new Box3();
    v.edge = 0;
    packed.families.forEach((p, slot) => {
      let f = v.meshes[slot];
      if (!p.count) {
        if (f) dropMesh(f);
        v.meshes[slot] = null;
        return;
      }
      const fresh = !f || f.cap < p.count;
      if (!f || f.cap < p.count) {
        if (f) dropMesh(f);
        f = newMesh(p.family, Math.ceil(p.count * 1.25) + 16, key);
        v.meshes[slot] = f;
        v.group.add(f.mesh);
        markStill(f.mesh);
        f.mesh.castShadow = v.cast;
        if (v.plain && !low) paintRim(f.mesh, true);
      }
      const n = p.count;
      const m = f.mesh;
      put(m.instanceMatrix, p.matrix, n * 16);
      put(f.color, p.color, n * 3);
      put(f.open, p.open, n);
      put(f.shown, p.shown, n);
      m.count = n;
      f.sides = p.sides;
      shape(f, v.plain);
      // (once it has its index: only the sides that can face the camera are drawn)
      if (fresh) skipBackFacets(m);
      const b = p.bounds;
      m.boundingBox!.min.set(b[0] - BOUND_PAD, b[1] - BOUND_PAD, b[2] - BOUND_PAD);
      m.boundingBox!.max.set(b[3] + BOUND_PAD, b[4] + BOUND_PAD, b[5] + BOUND_PAD);
      m.boundingBox!.getBoundingSphere(m.boundingSphere!);
      all.union(m.boundingBox!);
      v.edge = Math.max(v.edge, edgeOf(p.family));
    });
    all.getBoundingSphere(v.sphere);
    v.height = all.max.y - all.min.y;
    shadowWant = true;
  }

  /** Write the first `n` values of `from` into an attribute, and send only those. */
  function put(a: InstancedBufferAttribute, from: Float32Array, n: number): void {
    (a.array as Float32Array).set(from.subarray(0, n));
    a.clearUpdateRanges();
    a.addUpdateRange(0, n);
    a.needsUpdate = true;
  }

  function flush(): number {
    if (!dirty.size) return 0;
    const t0 = performance.now();
    let n = 0;
    for (const key of [...dirty].sort((a, b) => a - b)) {
      const t = performance.now();
      rebuild(key);
      const ms = performance.now() - t;
      st.rebuilds++;
      st.ms = ms;
      st.maxMs = Math.max(st.maxMs, ms);
      n++;
    }
    dirty.clear();
    st.lastFrame = { chunks: n, ms: performance.now() - t0 };
    return n;
  }

  const _eye = new Vector3();
  const castView = new CastView();
  /** Hidden when small, plain boxes when its cut edges are under a pixel (the map's rule; on low, plain always). */
  function judge(v: ChunkView, pixel: number): void {
    const d = Math.max(0, v.sphere.center.distanceTo(_eye) - v.sphere.radius);
    const hide = d * pixel > 1 / HIDE_PX;
    if (hide !== v.hidden) {
      v.hidden = hide;
      v.group.visible = !hide;
    }
    if (hide) return;
    const plain = low || plainAt(d, v.edge, pixel, v.plain);
    if (plain === v.plain) return;
    v.plain = plain;
    for (const f of v.meshes)
      if (f) {
        shape(f, plain);
        paintRim(f.mesh, plain && !low);
      }
  }

  /** Cast shadows or not (its meshes). */
  function cast(v: ChunkView, on: boolean): void {
    if (on === v.cast) return;
    v.cast = on;
    for (const f of v.meshes) if (f) f.mesh.castShadow = on;
  }

  function frame(f: MapFrame): void {
    const { camera, t } = f;
    // (the graphics level changed: every chunk's block shape)
    if (graphicsNow.plainBlocks !== low) {
      low = graphicsNow.plainBlocks;
      for (const v of views.values()) {
        v.plain = low;
        for (const f of v.meshes)
          if (f) {
            paintRim(f.mesh, false);
            shape(f, low);
          }
      }
    }
    flush();
    if (views.size) {
      _eye.setFromMatrixPosition(camera.matrixWorld);
      const pixel = pixelSize(camera);
      for (const v of views.values()) judge(v, pixel);
      // Shadows: the still ones (low, medium) are drawn for wherever the camera goes next: every chunk casts; else only
      // a chunk whose shadow can be in view (cull.ts `ShadowGate`'s rule: the map's shadow map covers the whole map).
      if (graphicsNow.stillShadows) for (const v of views.values()) cast(v, true);
      else {
        castView.set(f);
        for (const v of views.values()) cast(v, castView.seesShadow(v.sphere.center, v.sphere.radius, v.height));
      }
    }
    if (shadowWant && (ctx.shot || t - shadowAt >= SHADOW_EVERY)) {
      shadowWant = false;
      shadowAt = t;
      ctx.renderer.shadowMap.needsUpdate = true;
    }
  }

  const part: BlocksPart = {
    name: 'blocks',
    object,
    get blocks() {
      return BLOCKS.count;
    },
    update(f: MapFrame) {
      frame(f);
    },
    flush,
    stats() {
      st.blocks = BLOCKS.count;
      st.boxes = st.buried = 0;
      for (const b of boxes.values()) {
        st.boxes += b.boxes;
        st.buried += b.buried;
      }
      st.chunks = views.size;
      st.draws = st.hidden = st.plain = 0;
      for (const v of views.values()) {
        for (const f of v.meshes) if (f) st.draws++;
        if (v.hidden) st.hidden++;
        else if (v.plain) st.plain++;
      }
      return { ...st, lastFrame: { ...st.lastFrame } };
    },
    bench(runs = 50) {
      flush();
      const full = BLOCKS.chunkList().sort((a, b) => b.count - a.count)[0];
      if (!full) return { runs: 0, median: 0, max: 0, mean: 0, chunkBlocks: 0 };
      // (a block inside the chunk, away from its edges: one chunk made again; else any)
      let at = -1;
      for (let a = 0; a < full.cells.length; a++) {
        if (!full.cells[a]) continue;
        const lx = a % 32;
        const lz = Math.floor(a / 32) % 32;
        const ly = Math.floor(a / 1024);
        if (at < 0) at = a;
        if (lx > 0 && lx < 31 && lz > 0 && lz < 31 && ly > 0 && ly < 31) {
          at = a;
          break;
        }
      }
      const i = full.i0 + (at % 32);
      const j = full.j0 + Math.floor(at / 1024);
      const k = full.k0 + (Math.floor(at / 32) % 32);
      const raw = BLOCKS.raw(i, j, k);
      const times: number[] = [];
      for (let r = 0; r < runs; r++) {
        BLOCKS.setRaw(i, j, k, r % 2 ? raw : 0);
        const t0 = performance.now();
        flush();
        times.push(performance.now() - t0);
      }
      if (BLOCKS.raw(i, j, k) !== raw) {
        BLOCKS.setRaw(i, j, k, raw);
        flush();
      }
      times.sort((a, b) => a - b);
      const r2 = (x: number) => +x.toFixed(3);
      return { runs, median: r2(times[times.length >> 1]), max: r2(times[times.length - 1]), mean: r2(times.reduce((a, b) => a + b, 0) / runs), chunkBlocks: full.count };
    },
  };
  return part;
}
