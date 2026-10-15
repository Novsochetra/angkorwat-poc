import { Box3, Group, Vector3, type InstancedMesh } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import type { VoxelMaterialKey } from '../../voxel/materials';
import { ShadowGate } from '../cull';
import { pixelSize } from '../graphics';
import type { HeightField } from '../heightfield';
import { pickTone, ROPE, Site } from '../jungle/_campKit';
import { ChunkSwitch, PLAIN_FROM } from '../terrain/lod';
import type { MapContext, MapFrame, Subject } from '../types';
import { BAMBOO_FOREST_CUT, type BambooClumpData } from './bambooCut';
import { BAMBOO_FOREST, CLEARING, FOREST_BOX, forestDepth, TRAIL_KEEP, TRAIL_OPEN, trailDistance } from './bambooForestPlan';
import type { CanopyTree } from './canopy';
import { Lattice } from './lattice';
import type { Proto } from './proto';
import { bamboo } from './species';

/**
 * **The bamboo forest** (ព្រៃឫស្សី, ticket AWP-15): a dense stand of the jungle's bamboo clumps (veg/species.ts
 * `bamboo`, 1 m cells: the culms with their node rings, the feathery leaves) where it grows
 * (veg/bambooForestPlan.ts), a trail into it and a clearing with the woodcutter's rack where the cut poles dry. Its
 * clumps are cut like the jungle's (the source `bambooForest`, roam/_gatherBamboo.ts; `BAMBOO_FOREST_CUT`, the same
 * cut look). Drawn by the vegetation part (a group of its own under it: its leaves sway, the maps and the walk map
 * read it), not planted by the jungle's scatter (which keeps out).
 *
 * - **Planted** on a staggered grid (`STEP` m, jittered), thinning at the ragged edge; no clump on the trail
 *   (`TRAIL_KEEP`), in the clearing, or off free ground; the canopy is open over the trail's tread and the clearing
 *   (`Lattice.stamp`'s `keep`), so the trail shows from above (the maps) and the sky over the clearing. The clumps
 *   merge in their own lattice as the jungle's do (a leaf cell is drawn only where it is open).
 * - **Near**: its blocks in `CHUNK` m chunks (each its leaves and its culms: two draws; three leaves out the chunks
 *   off screen), with their edges near and plain boxes farther (terrain/lod.ts `ChunkSwitch`, as the jungle's tiles;
 *   all plain on the low level).
 * - **Far** (`FAR` m from its box and on): the same clumps of 2 m cells, every other culm (the jungle's far bamboo):
 *   one plain mesh, about a fifth of the blocks. Out of the walk map (`noWalk`); a cut clump shows whole there.
 * - Shadows: cast while they can be seen (cull.ts `ShadowGate`; every mesh casts the still shadows of low and medium).
 */

/** Grid step of the clumps (m) and how far each strays from its grid point. */
const STEP = 5.4;
const JITTER = 0.9;
/** The edge thins over this share of the radius. */
const FRINGE = 0.2;
/** No clump nearer the clearing's middle than its radius and this (m). */
const CLEAR_KEEP = 2.8;
/** Chunk size (m). */
const CHUNK = 24;
/** The far form from this far from the forest's box (m), back to near this much nearer. */
const FAR = 75;
const FAR_HOLD = 10;
/** A clump of the stand (veg/species.ts `bamboo`'s `stand`): its neighbours hide most of it. */
const STAND = { culms: 8, seg: 3.5, nodesBelow: 3.6, leafFrom: 0.6, spray: 0.25 };
/** Near chunks turn to plain boxes this many times nearer than the jungle's (terrain/lod.ts `ChunkSwitch`: by the pixel). */
const PLAIN_NEARER = 5;
/** Prototype kinds (near, far). */
const KINDS = { near: 6, far: 3 };

/** A clump of the forest, as planted. */
interface Clump {
  x: number;
  z: number;
  /** The ground under it (its footprint's lowest corner). */
  y: number;
  near: Proto;
  far: Proto;
  q: number;
  m: boolean;
  shade: number;
}

/** The forest planted (no meshes): its clumps, and them as the undergrowth and the nature book see them. */
export interface PlantedForest {
  clumps: Clump[];
  /** For veg/canopy.ts (the undergrowth keeps off the clumps, the shade under them). */
  trees: CanopyTree[];
  ms: number;
}

/** Its prototypes: the jungle's near bamboo (1 m cells) and far bamboo (2 m cells), seeds of their own. */
function kinds(): { near: Proto[]; far: Proto[] } {
  const near: Proto[] = [];
  const far: Proto[] = [];
  for (let n = 0; n < KINDS.near; n++) near.push(bamboo({ s: 1, h: 10 + 5 * hash3(n, 0, 15, 7), r: 3.2 + 0.8 * hash3(n, 1, 15, 7), seed: 152000 + n, stand: { ...STAND, culms: STAND.culms + (n % 3) } }));
  for (let n = 0; n < KINDS.far; n++) far.push(bamboo({ s: 2, h: 10 + 5 * hash3(n, 0, 16, 7), r: 3.6 + 0.8 * hash3(n, 1, 16, 7), seed: 152100 + n, stand: STAND }));
  return { near, far };
}

/** Where the forest's clumps stand (the vegetation part, before the undergrowth's canopy is written). */
export function plantBambooForest(f: HeightField): PlantedForest {
  const t0 = performance.now();
  const k = kinds();
  const clumps: Clump[] = [];
  const trees: CanopyTree[] = [];
  const row = STEP * 0.866;
  for (let z = FOREST_BOX.z0, r = 0; z <= FOREST_BOX.z1; z += row, r++)
    for (let x0 = FOREST_BOX.x0 + (r % 2) * STEP * 0.5; x0 <= FOREST_BOX.x1; x0 += STEP) {
      const gx = Math.round(x0 * 10);
      const gz = Math.round(z * 10);
      const x = x0 + (hash3(gx, gz, 1, 1521) - 0.5) * 2 * JITTER;
      const zz = z + (hash3(gx, gz, 2, 1521) - 0.5) * 2 * JITTER;
      const depth = forestDepth(x, zz);
      if (depth <= 0) continue;
      // (the edge thins out: a clump here and there)
      if (depth < FRINGE && hash3(gx, gz, 3, 1521) > depth / FRINGE) continue;
      if (trailDistance(x, zz) < TRAIL_KEEP || Math.hypot(x - CLEARING.x, zz - CLEARING.z) < CLEARING.r + CLEAR_KEEP) continue;
      if (!f.isFree(x, zz)) continue;
      const y = Math.min(f.heightAt(x, zz), f.heightAt(x - 1, zz - 1), f.heightAt(x + 1, zz + 1), f.heightAt(x - 1, zz + 1), f.heightAt(x + 1, zz - 1));
      const h = hash3(gx, gz, 4, 1521);
      const c: Clump = { x, z: zz, y, near: k.near[Math.floor(h * KINDS.near)], far: k.far[Math.floor(hash3(gx, gz, 5, 1521) * KINDS.far)], q: Math.floor(hash3(gx, gz, 6, 1521) * 4), m: hash3(gx, gz, 7, 1521) < 0.5, shade: 0.94 + hash3(gx, gz, 8, 1521) * 0.12 };
      clumps.push(c);
      // (the trunk's middle: the lattice cell's centre, as the jungle's)
      trees.push({ x: Math.floor(x) + 0.5, z: Math.floor(zz) + 0.5, y, kind: 'bamboo', r: c.near.r, low: c.near.low, h: c.near.h });
    }
  return { clumps, trees, ms: performance.now() - t0 };
}

/** Leaves stay off the trail's tread and the clearing (the canopy open over them). */
const keepLeaf = (x: number, _y: number, z: number): boolean => trailDistance(x, z) >= TRAIL_OPEN && Math.hypot(x - CLEARING.x, z - CLEARING.z) >= CLEARING.r - 1;

/** The forest as drawn (veg/bambooForest.ts `buildBambooForest`). */
export interface BambooForest {
  readonly object: Group;
  readonly blocks: number;
  readonly stats: { clumps: number; near: number; culms: number; far: number; props: number; chunks: number; ms: number };
  update(f: MapFrame): void;
  subjects(out: Subject[]): void;
}

/**
 * The forest's meshes (`planted`: `plantBambooForest`'s): near chunks, the far form, the clearing's rack; its clumps
 * handed to `BAMBOO_FOREST_CUT`. Its group goes under the vegetation part's (before its leaves are made to sway).
 */
export function buildBambooForest(ctx: MapContext, planted: PlantedForest): BambooForest {
  const t0 = performance.now();
  const f = ctx.field;
  const src = traceSource();
  const lowOnly = ctx.quality === 'low';
  const object = new Group();
  object.name = 'vegetation:bambooForest';

  // ── Near: 1 m cells, in chunks ──────────────────────────────────────────
  const nx = Math.ceil((FOREST_BOX.x1 - FOREST_BOX.x0) / CHUNK);
  const nz = Math.ceil((FOREST_BOX.z1 - FOREST_BOX.z0) / CHUNK);
  const chunkAt = (x: number, z: number) => Math.max(0, Math.min(nx - 1, Math.floor((x - FOREST_BOX.x0) / CHUNK))) + Math.max(0, Math.min(nz - 1, Math.floor((z - FOREST_BOX.z0) / CHUNK))) * nx;
  const builders = Array.from({ length: nx * nz }, () => new VoxelBuilder());
  const near = new Lattice(1, f);
  const far = new Lattice(2, f);
  planted.clumps.forEach((c, i) => {
    near.stamp(c.near, c.x, c.y, c.z, c.q, c.m, c.shade, i, keepLeaf);
    far.stamp(c.far, c.x, c.y, c.z, c.q, c.m, c.shade, -1, keepLeaf);
  });
  /** Each clump's blocks as emitted: [builder, index in it]. */
  const refs: [number, number][][] = planted.clumps.map(() => []);
  const nearBlocks = near.emit(
    (x, z) => builders[chunkAt(x, z)],
    (o, b, i) => void refs[o].push([builders.indexOf(b), i]),
  );
  // (each block's place among its family's blocks in its builder: its instance in that family's mesh)
  const order = builders.map((b) => {
    const o = new Int32Array(b.boxes.length);
    const seen = new Map<string, number>();
    b.boxes.forEach((box, i) => {
      const n = seen.get(box.mat) ?? 0;
      o[i] = n;
      seen.set(box.mat, n + 1);
    });
    return o;
  });
  const data: BambooClumpData[] = planted.clumps.map((c, i) => {
    const at = new Int32Array(refs[i].length * 2);
    refs[i].forEach(([ch, idx], n) => {
      at[n * 2] = (ch << 2) | (builders[ch].boxes[idx].mat === 'mapBark' ? 1 : 0);
      at[n * 2 + 1] = order[ch][idx];
    });
    return { x: Math.floor(c.x) + 0.5, y: c.y, z: Math.floor(c.z) + 0.5, r: c.near.r, h: c.near.h, at };
  });
  // The clearing's rack (into its chunk's culms' mesh: no draw of its own; after the clumps, whose places it keeps).
  const props = rack(new Site(builders[chunkAt(RACK.x, RACK.z)], f, RACK.x, f.heightAt(RACK.x, RACK.z), RACK.z, RACK.yaw, src, 1523));

  const nearGroup = new Group();
  nearGroup.name = 'vegetation:bambooForest:near';
  object.add(nearGroup);
  const chunks: { lod: ChunkSwitch | null; group: Group | null }[] = [];
  const meshes: (Group | null)[] = [];
  builders.forEach((b, n) => {
    if (!b.boxes.length) {
      meshes.push(null);
      return;
    }
    const name = `vegetation:bambooForest${n}`;
    const g = buildVoxelMesh(b, { quality: lowOnly ? 'low' : 'medium', name });
    nearGroup.add(g);
    meshes.push(g);
    const ix = n % nx;
    const iz = Math.floor(n / nx);
    const plan = new Box3(new Vector3(FOREST_BOX.x0 + ix * CHUNK, 0, FOREST_BOX.z0 + iz * CHUNK), new Vector3(FOREST_BOX.x0 + (ix + 1) * CHUNK, 0, FOREST_BOX.z0 + (iz + 1) * CHUNK));
    // (the leaves sway a little past their blocks)
    for (const o of g.children) if ((o as InstancedMesh).isInstancedMesh && (o as InstancedMesh).boundingSphere) (o as InstancedMesh).boundingSphere!.radius += 1;
    chunks.push({ lod: lowOnly ? null : new ChunkSwitch(plan, g, nearGroup), group: g });
  });
  BAMBOO_FOREST_CUT.attach(
    data,
    (code) => {
      const g = meshes[code >> 2];
      const mesh = g?.children.find((o) => o.name.endsWith(code & 1 ? ':mapBark' : ':mapLeaf')) as InstancedMesh | undefined;
      return mesh ? { mesh, from: 0 } : null;
    },
    ctx.renderer,
  );
  object.add(BAMBOO_FOREST_CUT.object);

  // ── Far: 2 m cells, one plain mesh ──────────────────────────────────────
  const fb = new VoxelBuilder();
  const farBlocks = far.emit(() => fb);
  const farGroup = buildVoxelMesh(fb, { quality: 'low', name: 'vegetation:bambooForest:far' });
  // (the walk map, the camera's and the near fade read the near blocks: these stand where they stand)
  farGroup.traverse((o) => void (o.userData.noWalk = true));
  farGroup.visible = false;
  object.add(farGroup);

  const box = new Box3(new Vector3(FOREST_BOX.x0, 0, FOREST_BOX.z0), new Vector3(FOREST_BOX.x1, 40, FOREST_BOX.z1));
  box.min.y = f.heightAt(BAMBOO_FOREST.x, BAMBOO_FOREST.z) - 4;
  box.max.y = box.min.y + 24;
  const shadows = new ShadowGate().addLive(nearGroup).addAll(farGroup, true);
  const flat = new Vector3();
  let isFar = false;
  // (checks: `bambooforest=near|far` holds that form wherever the camera is, `=0` hides the forest: shots and the dev server only)
  const hold = ctx.shot || import.meta.env.DEV ? new URLSearchParams(location.search).get('bambooforest') : null;
  if (hold === '0') object.visible = false;
  const subjects: Subject[] = planted.trees.map((t) => ({ kind: 'bamboo', x: t.x, y: t.y + t.h * 0.4, z: t.z, r: Math.min(t.r, t.h * 0.3) }));
  const culms = builders.reduce((n, b) => n + b.boxes.filter((x) => x.mat === 'mapBark').length, 0) - props;
  const stats = { clumps: planted.clumps.length, near: nearBlocks, culms, far: farBlocks, props, chunks: chunks.length, ms: Math.round(planted.ms + performance.now() - t0) };
  return {
    object,
    blocks: nearBlocks + props,
    stats,
    update(fr) {
      const cam = fr.camera.position;
      const d = box.distanceToPoint(cam);
      const want = hold === 'far' || (hold !== 'near' && (isFar ? d > FAR - FAR_HOLD : d > FAR));
      if (want !== isFar) {
        isFar = want;
        nearGroup.visible = !isFar;
        farGroup.visible = isFar;
      }
      if (!isFar) {
        flat.set(cam.x, 0, cam.z);
        const from = fr.roam !== 'overview' ? PLAIN_FROM.roam : PLAIN_FROM.overview;
        const pixel = pixelSize(fr.camera) * PLAIN_NEARER;
        for (const c of chunks) c.lod?.update(cam, flat, from, pixel);
      }
      shadows.update(fr);
      BAMBOO_FOREST_CUT.update(fr.dt);
    },
    subjects(out) {
      for (const s of subjects) out.push(s);
    },
  };
}

/** The rack: on the clearing's far (west) side, its front (the bundle, local −z) to the trail coming in from the east. */
const RACK = { x: CLEARING.x - 3.5, z: CLEARING.z - 0.5, yaw: -Math.PI / 2 } as const;

/** Cut poles: pale green-yellow, the older straw-yellow, their cut ends pale. */
const POLE = [0xa9b45a, 0xb8b764, 0xc4b46a, 0x9fae52, 0xc9b878];

/**
 * The woodcutter's rack (រានហាលឫស្សី) in the clearing: two crossed pairs of poles lashed at the top with a pole
 * across them, cut poles leaning on it to dry, a bundle tied with rattan on the ground before it, and a log to sit
 * on. Plain cut bamboo and rope: blocks of the bark family (no new family, no new draw). Returns its blocks.
 */
function rack(s: Site): number {
  const n0 = s.b.boxes.length;
  const mat: VoxelMaterialKey = 'mapBark';
  const tone = (i: number) => pickTone(POLE, i, 3, 5, s.seed);
  // The two X legs (local x along the rack, z out from it), 3.2 m apart, 1.9 m high where they cross.
  const top = 1.9;
  for (const lx of [-1.6, 1.6]) {
    s.beam([lx - 0.55, s.ground(lx - 0.55, 0) - 0.15, 0], [lx + 0.25, top + 0.35, 0], 0.11, 0.11, tone(1), mat);
    s.beam([lx + 0.55, s.ground(lx + 0.55, 0) - 0.15, 0], [lx - 0.25, top + 0.35, 0], 0.11, 0.11, tone(2), mat);
    // (lashed where they cross)
    s.box(lx, top, 0, 0.2, 0.16, 0.2, pickTone(ROPE, lx > 0 ? 1 : 2, 1, 1, s.seed), mat);
  }
  // The pole across, resting in the crosses.
  s.beam([-2.4, top + 0.1, 0], [2.4, top + 0.1, 0], 0.12, 0.12, tone(3), mat);
  // Poles leaning on it, their feet out on the far side (+z), their tops past it, a little fanned.
  for (let i = 0; i < 9; i++) {
    const lx = -2.1 + i * 0.52 + (hash3(i, 1, 0, s.seed) - 0.5) * 0.18;
    const foot = 1.5 + hash3(i, 2, 0, s.seed) * 0.4;
    const over = 0.5 + hash3(i, 3, 0, s.seed) * 0.6;
    // (from its foot on the ground over the pole across, and on past it)
    const ax = lx + (hash3(i, 4, 0, s.seed) - 0.5) * 0.3;
    const ay = s.ground(ax, foot) + 0.05;
    const dx = lx - ax;
    const dy = top + 0.16 - ay;
    const dz = -foot;
    const k = 1 + over / Math.hypot(dx, dy, dz);
    const b: [number, number, number] = [ax + dx * k, ay + dy * k, foot + dz * k];
    s.beam([ax, ay, foot], b, 0.1, 0.1, tone(10 + i), mat);
  }
  // A bundle of poles on the ground before it (−z), two rattan ties.
  for (let i = 0; i < 7; i++) {
    const ox = (i % 3) * 0.12 - 0.12;
    const oy = 0.06 + Math.floor(i / 3) * 0.1;
    const lz = -1.5 + ox;
    const y = s.ground(0, -1.5) + oy;
    s.beam([-2.2 + hash3(i, 5, 0, s.seed) * 0.3, y, lz], [2.3 - hash3(i, 6, 0, s.seed) * 0.3, y, lz], 0.1, 0.1, tone(20 + i), mat);
  }
  for (const lx of [-1.1, 1.0]) s.box(lx, s.ground(lx, -1.5) + 0.14, -1.5, 0.08, 0.34, 0.46, pickTone(ROPE, 3, 4, 5, s.seed), mat);
  // A log to sit on, by the rack's end.
  s.log([-3.4, s.ground(-3.4, -0.6) + 0.18, -1.1], [-3.0, s.ground(-3.0, -2.0) + 0.18, -2.4], 0.36, 0x6b533e, mat);
  return s.b.boxes.length - n0;
}
