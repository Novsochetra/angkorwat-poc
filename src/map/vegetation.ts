import { Group } from 'three';
import { hash3 } from '../voxel/random';
import { VoxelBuilder } from '../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../voxel/VoxelMesh';
import type { HeightField } from './heightfield';
import type { MapContext, MapPart } from './types';
import { buildCliffGreens } from './veg/cliffs';
import { Lattice } from './veg/lattice';
import type { Proto } from './veg/proto';
import { LOD_CELL, scatterTrees, type ScatterOptions, type TreeSpot } from './veg/scatter';
import { broadleaf, bush, emergent, palm, type Species } from './veg/species';

/**
 * Jungle: map-scale voxel trees, palms, bushes and hanging vines.
 *
 * A few dozen prototypes per species are built once (veg/species.ts), then
 * stamped where the jungle grows (veg/scatter.ts) onto a world lattice of
 * 1 m cells near the camera and 2 m cells far away (veg/lattice.ts), where
 * touching crowns merge. Cliff lips get moss and vines (veg/cliffs.ts).
 * Two meshes in all: near (medium blocks) and far (plain boxes).
 */

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

function makeKit(lod: number): Kit {
  const s = LOD_CELL[lod];
  const near = lod === 0;
  const kit: Kit = { broadleaf: [[], [], []], emergent: [[]], palm: [[]], bush: [[]], flowering: [[]] };
  const per = [8, 6, 5, 4][lod];
  const seed0 = (lod + 1) * 10000;
  BROAD_SIZES[lod].forEach(([h0, h1, r0, r1], size) => {
    for (let n = 0; n < per; n++) {
      const t = hash3(n, size, lod, 1);
      kit.broadleaf[size].push(broadleaf({ s, h: h0 + (h1 - h0) * t, r: r0 + (r1 - r0) * hash3(n, size, lod, 2), seed: seed0 + size * 100 + n }));
    }
  });
  for (let n = 0; n < (near ? 6 : 4); n++) kit.emergent[0].push(emergent({ s, h: 18 + 7 * hash3(n, 0, lod, 3), r: 5 + 2 * hash3(n, 1, lod, 3), seed: seed0 + 5000 + n }));
  for (let n = 0; n < (near ? 8 : 4); n++) kit.palm[0].push(palm({ s, h: 9 + 5 * hash3(n, 0, lod, 4), seed: seed0 + 6000 + n }));
  if (near) for (let n = 0; n < 10; n++) kit.bush[0].push(bush({ s, h: 2 + hash3(n, 0, lod, 5), r: 1.6 + 1.2 * hash3(n, 1, lod, 5), seed: seed0 + 7000 + n }));
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

/** Block budget of the part (the brief: vegetation ≤ 130 k). */
const BUDGET = 130_000;

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

interface Planted {
  near: VoxelBuilder;
  far: VoxelBuilder;
  trees: number;
  counts: Record<string, number>;
  perLod: number[];
  lodBlocks: number[];
  cliffBlocks: number;
}

/** Scatter the trees, stamp them on the lattices and emit the visible blocks (no meshes yet). */
function plant(f: HeightField, kits: Kit[], opts: ScatterOptions): Planted {
  const spots = scatterTrees(f, opts);
  const lattices = LOD_CELL.map((s) => new Lattice(s, f));
  const counts: Record<string, number> = {};
  const perLod = [0, 0, 0, 0];
  for (const t of spots) {
    const p = protoFor(kits[t.lod], t);
    if (!p) continue;
    // Trunk on the lowest corner of its footprint (no floating roots on a step).
    const y = Math.min(t.y, f.heightAt(t.x - 1, t.z - 1), f.heightAt(t.x + 1, t.z + 1), f.heightAt(t.x - 1, t.z + 1), f.heightAt(t.x + 1, t.z - 1));
    const shade = 0.94 + hash3(t.x, t.z, 1, 41) * 0.12;
    lattices[t.lod].stamp(p, t.x, y, t.z, t.seed & 3, (t.seed & 4) !== 0, shade);
    counts[t.kind] = (counts[t.kind] ?? 0) + 1;
    perLod[t.lod]++;
  }
  // Near and middle trees and the cliff greens share the detailed mesh; far trees are plain boxes.
  const near = new VoxelBuilder();
  const lodBlocks = [lattices[0].emit(near), lattices[1].emit(near), 0, 0];
  const cliffBlocks = buildCliffGreens(f, near, opts.density);
  const far = new VoxelBuilder();
  lodBlocks[2] = lattices[2].emit(far);
  lodBlocks[3] = lattices[3].emit(far);
  return { near, far, trees: spots.length, counts, perLod, lodBlocks, cliffBlocks };
}

export function buildVegetation(ctx: MapContext): MapPart {
  const f = ctx.field;
  const object = new Group();
  object.name = 'vegetation';
  const density = ctx.quality === 'low' ? 0.7 : 1;

  const t0 = performance.now();
  const kits = [0, 1, 2, 3].map(makeKit);
  const t1 = performance.now();
  // Over budget (the land changed, more mesa top to cover)? Thin the groves and plant again.
  let thin = 0;
  let r = plant(f, kits, jungle(density, thin));
  for (let n = 0; n < 3 && r.near.boxes.length + r.far.boxes.length > BUDGET; n++) {
    const total = r.near.boxes.length + r.far.boxes.length;
    thin = Math.min(0.2, thin + 0.02 + 0.3 * (1 - BUDGET / total));
    r = plant(f, kits, jungle(density, thin));
  }
  const t2 = performance.now();
  object.add(buildVoxelMesh(r.near, { quality: ctx.quality === 'low' ? 'low' : 'medium', name: 'vegetation' }));
  object.add(buildVoxelMesh(r.far, { quality: 'low', name: 'vegetation:far' }));
  const t3 = performance.now();
  object.userData.trees = r.counts;
  if (new URLSearchParams(location.search).has('vegstats'))
    console.info(
      `[map] vegetation: trees ${r.trees} ${JSON.stringify(r.counts)} per lod ${r.perLod.join('/')} · blocks per lod ${r.lodBlocks.join('/')}, cliffs ${r.cliffBlocks}${thin ? ` · thinned ${thin.toFixed(3)}` : ''} · ms kits ${Math.round(t1 - t0)}, plant ${Math.round(t2 - t1)}, mesh ${Math.round(t3 - t2)}`,
    );
  return { name: 'vegetation', object, blocks: r.near.boxes.length + r.far.boxes.length };
}
