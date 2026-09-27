import { Box3, Group, Sphere, Vector3, type InstancedMesh } from 'three';
import { hash3 } from '../voxel/random';
import { VoxelBuilder } from '../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../voxel/VoxelMesh';
import type { VoxelMaterialKey } from '../voxel/materials';
import { CastView } from './cull';
import { graphicsNow } from './graphics';
import type { HeightField } from './heightfield';
import { ChunkGrid, lowTwin } from './terrain/lod';
import type { MapContext, MapFrame, MapPart, Subject } from './types';
import { setCanopy, underReach, type CanopyTree } from './veg/canopy';
import { buildCliffGreens } from './veg/cliffs';
import { Lattice } from './veg/lattice';
import { isSugarPalmProto } from './veg/palms';
import type { Proto } from './veg/proto';
import { LOD_CELL, scatterTrees, type ScatterOptions, type TreeSpot } from './veg/scatter';
import { bamboo, broadleaf, bush, emergent, palm, type Species } from './veg/species';
import { stepWind, swayLeaves } from './veg/sway';

/**
 * Jungle: map-scale voxel trees, palms, bushes and hanging vines.
 *
 * A few dozen prototypes per species are built once (veg/species.ts), then
 * stamped where the jungle grows (veg/scatter.ts) onto a world lattice of
 * 1 m cells near the camera and 2 m cells far away (veg/lattice.ts), where
 * touching crowns merge. Cliff lips get moss and vines (veg/cliffs.ts).
 *
 * The leaves are cut into 100 m tiles, everything else (trunks, branches,
 * cliff moss: a tenth of the blocks) into 300 m chunks (terrain/lod.ts
 * `ChunkGrid`), each with its own meshes, so three draws only the tiles in
 * front of the camera: roaming, a third to a tenth of the jungle's
 * triangles of 300 m chunks (the camera stood in a chunk, and drew it
 * whole). Per tile a near mesh (1 m and 1.5 m cells: medium blocks, plain
 * boxes from 170 m while roaming, 300 m in the overview) and a far one (2 m
 * and 3 m cells, plain boxes); on the low level one plain mesh a tile.
 * A tile casts its shadow only while it can be seen (`CastView`, as
 * cull.ts `ShadowGate`; every tile casts the low level's still shadows).
 * The leaves sway in the wind (veg/sway.ts). The trees where the explorer
 * roams are handed to the undergrowth (veg/canopy.ts).
 */

/** Leaf tiles and the chunks of the rest (m). */
const LEAF_GRID = new ChunkGrid(100);
const REST_GRID = new ChunkGrid(300);

/** Prototype sets per species and size class, for one level of detail. */
type Kit = Record<Species, Proto[][]>;

/** Broadleaf size classes per level of detail: [height min, max, crown radius min, max] (m). */
const BROAD_SIZES = [
  [
    [8, 10, 3, 3.6],
    [10, 12, 3.6, 4.4],
    [12, 14, 4.4, 5.2],
  ],
  [
    [8, 10, 3.4, 4],
    [10, 12, 4.2, 4.9],
    [12, 14, 5.2, 5.9],
  ],
  [
    [9, 11, 4, 4.8],
    [11, 13, 5, 5.8],
    [13, 15, 6, 6.8],
  ],
  [
    [10, 12, 5, 5.6],
    [12, 14, 6, 6.6],
    [13, 15, 7, 7.6],
  ],
];

/**
 * The prototypes for trees planted at a level of detail, built of the cells
 * of `cell` (see scatter.ts `cellLod`). Crowns of smaller cells than their
 * level's grow a little, to fill as much of the view as the coarse ones.
 */
function makeKit(lod: number, cell = lod): Kit {
  const s = LOD_CELL[cell];
  const near = cell === 0;
  const grow = cell < lod ? 1.12 : 1;
  const kit: Kit = { broadleaf: [[], [], []], emergent: [[]], palm: [[]], bush: [[]], flowering: [[]], bamboo: [[]] };
  const per = [8, 6, 5, 4][lod];
  const seed0 = (lod + 1) * 10000;
  BROAD_SIZES[lod].forEach(([h0, h1, r0, r1], size) => {
    for (let n = 0; n < per; n++) {
      const t = hash3(n, size, lod, 1);
      kit.broadleaf[size].push(broadleaf({ s, h: (h0 + (h1 - h0) * t) * grow, r: (r0 + (r1 - r0) * hash3(n, size, lod, 2)) * grow, seed: seed0 + size * 100 + n }));
    }
  });
  for (let n = 0; n < (near ? 6 : 4); n++) kit.emergent[0].push(emergent({ s, h: 18 + 7 * hash3(n, 0, lod, 3), r: 5 + 2 * hash3(n, 1, lod, 3), seed: seed0 + 5000 + n }));
  for (let n = 0; n < (near ? 8 : 4); n++) kit.palm[0].push(palm({ s, h: 9 + 5 * hash3(n, 0, lod, 4), seed: seed0 + 6000 + n }));
  if (near) for (let n = 0; n < 10; n++) kit.bush[0].push(bush({ s, h: 2 + hash3(n, 0, lod, 5), r: 1.6 + 1.2 * hash3(n, 1, lod, 5), seed: seed0 + 7000 + n }));
  // Bamboo clumps: a little wider with distance (like the crowns: see scatter.ts BAMBOO_R).
  for (let n = 0; n < (near ? 6 : 3); n++) kit.bamboo[0].push(bamboo({ s, h: (10 + 5 * hash3(n, 0, lod, 7)) * grow, r: ([3.2, 3.6, 4.2, 5][lod] + 0.8 * hash3(n, 1, lod, 7)) * grow, seed: seed0 + 9000 + n }));
  for (let n = 0; n < (near ? 5 : 3); n++)
    kit.flowering[0].push(broadleaf({ s, h: 9 + 3 * hash3(n, 0, lod, 6), r: 3.4 + lod * 0.6 + hash3(n, 1, lod, 6), seed: seed0 + 8000 + n, flower: n % 3 === 2 ? 'orange' : 'pink' }));
  return kit;
}

function protoFor(kit: Kit, t: TreeSpot): Proto | null {
  const sets = kit[t.kind];
  const list = sets[Math.min(sets.length - 1, t.size)];
  if (!list.length) return null;
  // Closest crown size among a few hashed picks (so spacing and crown agree).
  let best = list[t.seed % list.length];
  for (let n = 1; n < 3; n++) {
    const p = list[(t.seed >> (n * 4)) % list.length];
    if (Math.abs(p.r - t.r) < Math.abs(best.r - t.r)) best = p;
  }
  return best;
}

/**
 * Block budget of the part, with trees all over the roaming area: ≤ 170 k
 * since the map grew east and north (the new roaming land east of the Kulen
 * stream, the far hills round it: about 20 k blocks; the jungle planted as
 * before elsewhere, not thinned). The low level (phones) plants 0.7 of it:
 * about 136 k. Past it the groves thin out everywhere.
 */
const BUDGET = 170_000;

/**
 * The tuned jungle. `thin` (0‥0.2) shrinks the groves and the lip rows, for
 * when the land offers more room than the block budget.
 */
function jungle(density: number, thin: number): ScatterOptions {
  return {
    density,
    grove: { top: 0.46 + thin, low: 0.7 + thin, lod: [0, 0.02, 0.06, 0], back: 0.14 },
    halo: 0.15,
    high: 0.07,
    glade: [0.03, 0.035, 0.012, 0.008],
    lip: 0.6 * (1 - thin * 2),
    lipLod: [1, 0.8, 0.4, 0.25],
  };
}

/** Kits by level of detail and cells: `lod * 4 + cell`. */
type Kits = Map<number, Kit>;

/** A tile's (or chunk's) blocks: near (1 m and 1.5 m cells, cliff greens) and far (2 m and 3 m cells). */
type Pair = [VoxelBuilder, VoxelBuilder];

interface Planted {
  /** Per leaf tile, and per chunk of the rest (bark, cliff moss). */
  leaves: Pair[];
  rest: Pair[];
  blocks: number;
  trees: number;
  counts: Record<string, number>;
  perLod: number[];
  lodBlocks: number[];
  cliffBlocks: number;
  /** The trees where the explorer roams (for the undergrowth). */
  near: CanopyTree[];
  /** The sugar palms there, for the nature book (their crowns: where the flower stalks are). */
  sugarPalms: Subject[];
}

/** Scatter the trees, stamp them on the lattices and emit the visible blocks (no meshes yet). */
function plant(f: HeightField, kits: Kits, opts: ScatterOptions): Planted {
  const spots = scatterTrees(f, opts);
  const lattices = LOD_CELL.map((s) => new Lattice(s, f));
  const counts: Record<string, number> = {};
  const perLod = [0, 0, 0, 0];
  const nearTrees: CanopyTree[] = [];
  const sugarPalms: Subject[] = [];
  for (const t of spots) {
    const p = protoFor(kits.get(t.lod * 4 + t.cell)!, t);
    if (!p) continue;
    // Trunk on the lowest corner of its footprint (no floating roots on a step).
    const y = Math.min(t.y, f.heightAt(t.x - 1, t.z - 1), f.heightAt(t.x + 1, t.z + 1), f.heightAt(t.x - 1, t.z + 1), f.heightAt(t.x + 1, t.z - 1));
    const shade = 0.94 + hash3(t.x, t.z, 1, 41) * 0.12;
    lattices[t.cell].stamp(p, t.x, y, t.z, t.seed & 3, (t.seed & 4) !== 0, shade);
    counts[t.kind] = (counts[t.kind] ?? 0) + 1;
    perLod[t.cell]++;
    // (the trunk's middle: the lattice cell's centre)
    const s = LOD_CELL[t.cell];
    if (underReach(t.x, t.z)) {
      const x = (Math.floor(t.x / s) + 0.5) * s;
      const z = (Math.floor(t.z / s) + 0.5) * s;
      nearTrees.push({ x, z, y, kind: t.kind, r: p.r, low: p.low, h: p.h });
      if (t.kind === 'palm' && isSugarPalmProto(p)) sugarPalms.push({ kind: 'sugarPalm', x, y: y + p.h - 2.2, z, r: 3 });
    }
  }
  // Near and middle trees and the cliff greens share the detailed meshes; far trees are plain boxes.
  const leaves: Pair[] = [];
  const rest: Pair[] = [];
  for (let n = 0; n < LEAF_GRID.count; n++) leaves.push([new VoxelBuilder(), new VoxelBuilder()]);
  for (let n = 0; n < REST_GRID.count; n++) rest.push([new VoxelBuilder(), new VoxelBuilder()]);
  /** The builder of a block: leaves by tile, the rest by chunk; near or far. */
  const sink = (far: 0 | 1) => (x: number, z: number, mat: VoxelMaterialKey) => (mat === 'mapLeaf' ? leaves[LEAF_GRID.at(x, z)] : rest[REST_GRID.at(x, z)])[far];
  const near = sink(0);
  const lodBlocks = [lattices[0].emit(near), lattices[1].emit(near), lattices[2].emit(sink(1)), lattices[3].emit(sink(1))];
  const treeBlocks = lodBlocks.reduce((a, b) => a + b, 0);
  // (the cliff greens' vines are leaves, their moss goes with the rest)
  buildCliffGreens(f, (x, z) => ({ box: (...a: Parameters<VoxelBuilder['box']>) => near(x, z, a[7]).box(...a) }) as VoxelBuilder, opts.density);
  let blocks = 0;
  for (const [n, fa] of [...leaves, ...rest]) blocks += n.boxes.length + fa.boxes.length;
  return { leaves, rest, blocks, trees: spots.length, counts, perLod, lodBlocks, cliffBlocks: blocks - treeBlocks, near: nearTrees, sugarPalms };
}

/** The whole jungle's blocks (no meshes yet), thinned to the budget. */
export function plantJungle(f: HeightField, density: number): Planted & { thin: number; ms: [number, number] } {
  const t0 = performance.now();
  const kits: Kits = new Map();
  for (const lod of [0, 1, 2, 3]) kits.set(lod * 4 + lod, makeKit(lod));
  // (the back hills' trees where the explorer roams: their size, smaller cells)
  kits.set(3 * 4 + 2, makeKit(3, 2));
  const t1 = performance.now();
  // Over budget (the land changed, more mesa top to cover)? Thin the groves and plant again.
  let thin = 0;
  let r = plant(f, kits, jungle(density, thin));
  for (let n = 0; n < 3 && r.blocks > BUDGET; n++) {
    thin = Math.min(0.2, thin + 0.02 + 0.3 * (1 - BUDGET / r.blocks));
    r = plant(f, kits, jungle(density, thin));
  }
  return { ...r, thin, ms: [t1 - t0, performance.now() - t1] };
}

/**
 * Near meshes farther than this from the camera (m, on the map) draw plain
 * boxes: while roaming, and in the overview (as the land's chunks,
 * terrain/lod.ts).
 */
const PLAIN_FROM = { roam: 170, overview: 300 };
/** Frames at load when every tile casts (the shadow shaders compile then; cull.ts `ShadowGate`). */
const WARM = 3;

/** One tile (or chunk) of the jungle as drawn: its meshes, where its blocks are, its plain twin. */
interface Tile {
  /** Ground plan (for the distance to the camera). */
  plan: Box3;
  /** Round its blocks (world), and their height, for the shadow's reach. */
  c: Vector3;
  r: number;
  h: number;
  /** Near blocks with their edges (medium and up; null on the low level, where all is plain). */
  fine: Group | null;
  /** The fine meshes' plain twin (made the first time the tile is far). */
  plain: Group | null;
  /** Every mesh the tile draws (fine, twin, far): they cast together. */
  meshes: InstancedMesh[];
  casts: boolean;
}

/**
 * The jungle's tiles: each shows its near blocks with their edges or as
 * plain boxes by its distance from the camera, and casts its shadow only
 * while the shadow can be in view (the box round its blocks swept away from
 * the light: cull.ts `CastView`). Still shadows (the low level) are drawn
 * for wherever the camera goes next: every tile casts then.
 */
class Tiles {
  private readonly list: Tile[] = [];
  private readonly view = new CastView();
  private readonly flat = new Vector3();
  private frames = 0;

  constructor(private readonly parent: Group) {}

  /** A tile's meshes: `fine` (near, with edges; switched to a plain twin when far) and `far` (plain). */
  add(plan: Box3, fine: Group | null, far: Group | null): void {
    const meshes: InstancedMesh[] = [];
    const box = new Box3();
    for (const g of [fine, far]) {
      if (!g) continue;
      this.parent.add(g);
      g.traverse((o) => {
        const m = o as InstancedMesh;
        if (!m.isInstancedMesh) return;
        meshes.push(m);
        // (leaves sway a little past their blocks: keep them in view to the edge of the screen)
        if (m.boundingSphere) m.boundingSphere.radius += 1;
        if (m.boundingBox) box.union(m.boundingBox);
      });
    }
    if (!meshes.length) return;
    const s = box.getBoundingSphere(new Sphere());
    this.list.push({ plan, c: s.center, r: s.radius, h: box.max.y - box.min.y, fine, plain: null, meshes, casts: true });
  }

  get count(): number {
    return this.list.length;
  }

  update(f: MapFrame): void {
    const cam = f.camera.position;
    this.flat.set(cam.x, 0, cam.z);
    const from = f.roam !== 'overview' ? PLAIN_FROM.roam : PLAIN_FROM.overview;
    const warm = this.frames++ < WARM;
    const all = warm || graphicsNow.stillShadows;
    if (!all) this.view.set(f);
    for (const t of this.list) {
      if (t.fine) {
        const plain = t.plan.distanceToPoint(this.flat) > from;
        if (plain && !t.plain) {
          this.parent.add((t.plain = lowTwin(t.fine)));
          t.plain.traverse((o) => void ((o as InstancedMesh).isInstancedMesh && t.meshes.push(o as InstancedMesh)));
        }
        t.fine.visible = !plain;
        if (t.plain) t.plain.visible = plain;
      }
      const casts = all || this.view.seesShadow(t.c, t.r, t.h);
      if (casts === t.casts) continue;
      t.casts = casts;
      for (const m of t.meshes) m.castShadow = casts;
    }
  }
}

export function buildVegetation(ctx: MapContext): MapPart {
  const f = ctx.field;
  const object = new Group();
  object.name = 'vegetation';
  const density = ctx.quality === 'low' ? 0.7 : 1;

  const r = plantJungle(f, density);
  const { thin } = r;
  setCanopy(f, r.near);
  const t2 = performance.now();
  const lowOnly = ctx.quality === 'low';
  const tiles = new Tiles(object);
  const meshes = (grid: ChunkGrid, pairs: Pair[], kind: string) =>
    pairs.forEach(([near, far], n) => {
      const name = `vegetation:${kind}${n}`;
      if (lowOnly) {
        // (all plain boxes: one mesh a tile)
        for (const b of far.boxes) near.boxes.push(b);
        tiles.add(grid.box(n), null, near.boxes.length ? buildVoxelMesh(near, { quality: 'low', name }) : null);
      } else tiles.add(grid.box(n), near.boxes.length ? buildVoxelMesh(near, { quality: 'medium', name }) : null, far.boxes.length ? buildVoxelMesh(far, { quality: 'low', name: `${name}:far` }) : null);
    });
  meshes(LEAF_GRID, r.leaves, 'leaf');
  meshes(REST_GRID, r.rest, 'rest');
  // (before the plain twins are made: they share the meshes' materials; the lattice's open sides are exact: the
  // covered ones are left out, veg/sway.ts)
  swayLeaves(object, f, true);
  const t3 = performance.now();
  object.userData.trees = r.counts;
  if (new URLSearchParams(location.search).has('vegstats'))
    console.info(
      `[map] vegetation: trees ${r.trees} ${JSON.stringify(r.counts)} per lod ${r.perLod.join('/')} · blocks per lod ${r.lodBlocks.join('/')}, cliffs ${r.cliffBlocks}${thin ? ` · thinned ${thin.toFixed(3)}` : ''} · ${tiles.count} tiles · ${r.sugarPalms.length} sugar palms in the nature book · ms kits ${Math.round(r.ms[0])}, plant ${Math.round(r.ms[1])}, mesh ${Math.round(t3 - t2)}`,
    );
  // (the nature book, roam/_book.ts: the bamboo clumps and sugar palms where the explorer roams, as they stand)
  const bamboo: Subject[] = r.near.filter((t) => t.kind === 'bamboo').map((t) => ({ kind: 'bamboo', x: t.x, y: t.y + t.h * 0.4, z: t.z, r: Math.min(t.r, t.h * 0.3) }));
  return {
    name: 'vegetation',
    object,
    blocks: r.blocks,
    update(fr) {
      stepWind(fr, 'vegetation');
      tiles.update(fr);
    },
    subjects(out) {
      for (const b of bamboo) out.push(b);
      for (const p of r.sugarPalms) out.push(p);
    },
  };
}
