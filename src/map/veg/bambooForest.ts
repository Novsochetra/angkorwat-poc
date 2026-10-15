import { Box3, Frustum, Group, Matrix4, Vector3, type InstancedMesh } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import type { VoxelMaterialKey } from '../../voxel/materials';
import { ShadowGate } from '../cull';
import { graphicsNow, pixelSize } from '../graphics';
import type { HeightField } from '../heightfield';
import { pickTone, ROPE, Site } from '../jungle/_campKit';
import { ChunkSwitch, PLAIN_FROM } from '../terrain/lod';
import type { MapContext, MapFrame, Subject } from '../types';
import { BAMBOO_FOREST_CUT, type BambooClumpData } from './bambooCut';
import { CLEARING, FOREST_BOX, forestDepth, TRAIL_KEEP, TRAIL_OPEN, trailDistance } from './bambooForestPlan';
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
 *   (`TRAIL_KEEP`), in the clearing, off free ground, or by a land step (`STEP_KEEP`: the hollow's edge); the canopy is open over the trail's tread and the clearing
 *   (`Lattice.stamp`'s `keep`), so the trail shows from above (the maps) and the sky over the clearing. The clumps
 *   merge in their own lattice as the jungle's do (a leaf cell is drawn only where it is open).
 * - **Near**: its blocks in `CHUNK` m chunks, each chunk's leaves and its culms apart (two draws; three leaves out
 *   the chunks off screen). The leaves are always plain boxes, their rim painted on medium and up (seen from under
 *   them their cut edges hardly show: about a quarter of the triangles); the culms have their edges near and are plain past
 *   `PLAIN_NEARER` times nearer than the jungle's (terrain/lod.ts `ChunkSwitch`; all plain on the low level).
 * - **No far form**: from afar the same blocks, plain (as the jungle's tiles: no swap that could show). The culms
 *   are a third of the blocks; far off a chunk is two draws of plain boxes.
 * - **Out of view** (its blocks' box, swept away from the key light as far as their shadow reaches, off the camera's
 *   frustum; the overview's frame just misses it): not drawn. Back in view the still shadow map (low, medium: drawn
 *   again only when the light turns) is asked again, so its shadow is never missing.
 * - **Walking**: each clump has a hidden core in the walk map (`CORE`: never drawn), inside its ring of canes, so he
 *   stops at its canes from every side (a gap between two canes no longer lets him in).
 * - Shadows: cast while they can be seen (cull.ts `ShadowGate`; every mesh casts the still shadows of low and medium).
 */

/** Grid step of the clumps (m) and how far each strays from its grid point. */
const STEP = 5.4;
const JITTER = 0.9;
/** The edge thins over this share of the radius. */
const FRINGE = 0.2;
/** No clump with a land step this near its middle (m): he hops up a step onto its far side, past its edge. */
const STEP_KEEP = 2.5;
/** No clump nearer the clearing's middle than its radius and this (m). */
const CLEAR_KEEP = 2.8;
/** Chunk size (m). */
const CHUNK = 44;
/** Each clump's hidden core in the walk map (m): two squares a turn of 45° apart (an octagon), inside its ring of canes, `h` over the highest ground round it. */
const CORE = { w: 1.4, h: 2.4 };
/** A shadow can fall this far below the foot of what casts it (m: as cull.ts). */
const SHADOW_FALL = 12;
/** A clump of the stand (veg/species.ts `bamboo`'s `stand`): its neighbours hide most of it. */
const STAND = { culms: 8, seg: 3.5, nodesBelow: 3.6, leafFrom: 0.6, spray: 0.25 };
/** Near chunks turn to plain boxes this many times nearer than the jungle's (terrain/lod.ts `ChunkSwitch`: by the pixel). */
const PLAIN_NEARER = 5;
/** Prototype kinds (near, far). */
const KINDS = { near: 6 };

/** A clump of the forest, as planted. */
interface Clump {
  x: number;
  z: number;
  /** The ground under it (its footprint's lowest corner). */
  y: number;
  near: Proto;
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

/** Its prototypes: the jungle's near bamboo (1 m cells), seeds of their own. */
function kinds(): { near: Proto[] } {
  const near: Proto[] = [];
  for (let n = 0; n < KINDS.near; n++) near.push(bamboo({ s: 1, h: 10 + 5 * hash3(n, 0, 15, 7), r: 3.2 + 0.8 * hash3(n, 1, 15, 7), seed: 152000 + n, stand: { ...STAND, culms: STAND.culms + (n % 3) } }));
  return { near };
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
      // (no land step within `STEP_KEEP` m: hopping up a step he lands past its edge, and would land among its canes)
      let lo = Infinity;
      let hi = -Infinity;
      for (let a = 0; a < 12; a++)
        for (const d of [0, STEP_KEEP / 2, STEP_KEEP]) {
          const y = f.heightAt(x + Math.cos((a * Math.PI) / 6) * d, zz + Math.sin((a * Math.PI) / 6) * d);
          lo = Math.min(lo, y);
          hi = Math.max(hi, y);
        }
      if (hi - lo > 1) continue;
      const y = Math.min(f.heightAt(x, zz), f.heightAt(x - 1, zz - 1), f.heightAt(x + 1, zz + 1), f.heightAt(x - 1, zz + 1), f.heightAt(x + 1, zz - 1));
      const h = hash3(gx, gz, 4, 1521);
      const c: Clump = { x, z: zz, y, near: k.near[Math.floor(h * KINDS.near)], q: Math.floor(hash3(gx, gz, 6, 1521) * 4), m: hash3(gx, gz, 7, 1521) < 0.5, shade: 0.94 + hash3(gx, gz, 8, 1521) * 0.12 };
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
  readonly stats: { clumps: number; near: number; culms: number; props: number; chunks: number; ms: number };
  update(f: MapFrame): void;
  subjects(out: Subject[]): void;
}

/**
 * The forest's meshes (`planted`: `plantBambooForest`'s): its chunks, the clumps' hidden cores, the clearing's rack; its clumps
 * handed to `BAMBOO_FOREST_CUT`. Its group goes under the vegetation part's (before its leaves are made to sway).
 */
export function buildBambooForest(ctx: MapContext, planted: PlantedForest): BambooForest {
  const t0 = performance.now();
  const f = ctx.field;
  const src = traceSource();
  const lowOnly = ctx.quality === 'low';
  const object = new Group();
  object.name = 'vegetation:bambooForest';

  // ── Near: 1 m cells, in chunks, each its leaves and its culms apart ────────
  const nx = Math.ceil((FOREST_BOX.x1 - FOREST_BOX.x0) / CHUNK);
  const nz = Math.ceil((FOREST_BOX.z1 - FOREST_BOX.z0) / CHUNK);
  const chunkAt = (x: number, z: number) => Math.max(0, Math.min(nx - 1, Math.floor((x - FOREST_BOX.x0) / CHUNK))) + Math.max(0, Math.min(nz - 1, Math.floor((z - FOREST_BOX.z0) / CHUNK))) * nx;
  /** Per chunk: [leaves, culms]. */
  const builders = Array.from({ length: nx * nz }, () => [new VoxelBuilder(), new VoxelBuilder()] as const);
  const near = new Lattice(1, f);
  planted.clumps.forEach((c, i) => near.stamp(c.near, c.x, c.y, c.z, c.q, c.m, c.shade, i, keepLeaf));
  /** Each clump's blocks as emitted: a mesh code (chunk << 2 | 1 for the culms) and the block's index there. */
  const refs: number[][] = planted.clumps.map(() => []);
  const codeOf = new Map<VoxelBuilder, number>();
  builders.forEach(([l, b], n) => {
    codeOf.set(l, n << 2);
    codeOf.set(b, (n << 2) | 1);
  });
  const nearBlocks = near.emit(
    (x, z, mat) => builders[chunkAt(x, z)][mat === 'mapBark' ? 1 : 0],
    (o, b, i) => void refs[o].push(codeOf.get(b)!, i),
  );
  // (one family a builder: a block's index there is its instance in the family's mesh)
  const data: BambooClumpData[] = planted.clumps.map((c, i) => ({ x: Math.floor(c.x) + 0.5, y: c.y, z: Math.floor(c.z) + 0.5, r: c.near.r, h: c.near.h, at: Int32Array.from(refs[i]) }));
  const culms = builders.reduce((n, [, b]) => n + b.boxes.length, 0);
  // The clearing's rack (with its chunk's culms: no draw of its own; after the clumps, whose places it keeps).
  const props = rack(new Site(builders[chunkAt(RACK.x, RACK.z)][1], f, RACK.x, f.heightAt(RACK.x, RACK.z), RACK.z, RACK.yaw, src, 1523));

  const nearGroup = new Group();
  nearGroup.name = 'vegetation:bambooForest:near';
  object.add(nearGroup);
  /** Per chunk and family: its mesh, and how it turns plain (the leaves at once, the culms past `PLAIN_NEARER`). */
  const chunks: { lod: ChunkSwitch | null; leaf: boolean }[] = [];
  const meshes: (InstancedMesh | null)[] = [];
  builders.forEach((pair, n) => {
    const ix = n % nx;
    const iz = Math.floor(n / nx);
    const plan = new Box3(new Vector3(FOREST_BOX.x0 + ix * CHUNK, 0, FOREST_BOX.z0 + iz * CHUNK), new Vector3(FOREST_BOX.x0 + (ix + 1) * CHUNK, 0, FOREST_BOX.z0 + (iz + 1) * CHUNK));
    pair.forEach((b, fam) => {
      if (!b.boxes.length) {
        meshes.push(null);
        return;
      }
      const g = buildVoxelMesh(b, { quality: lowOnly ? 'low' : 'medium', name: `vegetation:bambooForest${n}${fam ? 'c' : 'l'}` });
      nearGroup.add(g);
      const mesh = g.children.find((o) => (o as InstancedMesh).isInstancedMesh) as InstancedMesh | undefined;
      meshes.push(mesh ?? null);
      // (the leaves sway a little past their blocks)
      if (!fam && mesh?.boundingSphere) mesh.boundingSphere.radius += 1;
      chunks.push({ lod: lowOnly ? null : new ChunkSwitch(plan, g, nearGroup), leaf: !fam });
    });
  });
  BAMBOO_FOREST_CUT.attach(data, (code) => {
    const mesh = meshes[(code >> 2) * 2 + (code & 1)];
    return mesh ? { mesh, from: 0 } : null;
  }, ctx.renderer);
  object.add(BAMBOO_FOREST_CUT.object);

  // ── Each clump's core: hidden blocks in the walk map (never drawn): he stops at its canes from every side ──
  object.add(clumpCores(f, data, 'vegetation:bambooForest-solid'));

  // ── Out of view: the box round its blocks, swept away from the key light as far as its shadow can fall ──
  const blocksBox = new Box3();
  nearGroup.traverse((o) => {
    const m = o as InstancedMesh;
    if (!m.isInstancedMesh) return;
    if (!m.boundingBox) m.computeBoundingBox();
    blocksBox.union(m.boundingBox!);
  });
  const shadows = new ShadowGate().addLive(nearGroup);
  const flat = new Vector3();
  const frustum = new Frustum();
  const vp = new Matrix4();
  const swept = new Box3();
  const away = new Box3();
  let frames = 0;
  let shown = true;
  // (checks: `bambooforest=0` hides the forest, still in the walk map: shots and the dev server only)
  const hold = ctx.shot || import.meta.env.DEV ? new URLSearchParams(location.search).get('bambooforest') : null;
  if (hold === '0') object.visible = false;
  const subjects: Subject[] = planted.trees.map((t) => ({ kind: 'bamboo', x: t.x, y: t.y + t.h * 0.4, z: t.z, r: Math.min(t.r, t.h * 0.3) }));
  const stats = { clumps: planted.clumps.length, near: nearBlocks, culms: culms - props, props, chunks: chunks.length, ms: Math.round(planted.ms + performance.now() - t0) };
  return {
    object,
    blocks: nearBlocks + props,
    stats,
    update(fr) {
      const cam = fr.camera.position;
      // Drawn while it or its shadow can be in view (the first frames always: its shaders compile at load). Back in
      // view, the still shadow map (low, medium: drawn again only when the light turns) is asked again, so it is never
      // without the shadow it lost while hidden.
      vp.multiplyMatrices(fr.camera.projectionMatrix, fr.camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(vp);
      const l = fr.lightDir;
      const reach = (blocksBox.max.y - blocksBox.min.y + SHADOW_FALL) / Math.max(0.2, l.y);
      away.copy(blocksBox).translate(_v.set(-l.x * reach, -l.y * reach, -l.z * reach));
      swept.copy(blocksBox).union(away);
      const see = frames++ < 3 || frustum.intersectsBox(swept);
      if (see !== shown) {
        shown = see;
        nearGroup.visible = see;
        if (see && graphicsNow.stillShadows) ctx.renderer.shadowMap.needsUpdate = true;
      }
      if (see) {
        flat.set(cam.x, 0, cam.z);
        const from = fr.roam !== 'overview' ? PLAIN_FROM.roam : PLAIN_FROM.overview;
        const pixel = pixelSize(fr.camera);
        // (the leaves always plain, their rim painted: from under them their cut edges hardly show, and a negative pixel
        // makes `plainAt` true even with the camera inside their box; the culms by the pixel, `PLAIN_NEARER` times nearer)
        for (const c of chunks) c.lod?.update(cam, flat, from, c.leaf ? -1 : pixel * PLAIN_NEARER);
      }
      shadows.update(fr);
      BAMBOO_FOREST_CUT.update(fr.dt);
    },
    subjects(out) {
      for (const s of subjects) out.push(s);
    },
  };
}

const _v = new Vector3();

/**
 * Bamboo clumps' cores (the forest's, and the jungle's: vegetation.ts): hidden blocks in the walk map, never drawn
 * nor picked, so he stops at a clump's canes from every side (between two canes a gap could let him in). Each from
 * its foot to `tall` m over the highest ground round it (on a land step's edge he meets it from above too; the jungle's
 * coarse clumps, whose thick lowest canes he can climb like steps, get it taller: 6 m).
 */
export function clumpCores(f: HeightField, clumps: readonly { x: number; y: number; z: number }[], name: string, tall = CORE.h): Group {
  const src = traceSource();
  const cores = new VoxelBuilder();
  for (const c of clumps) {
    let hi = c.y;
    for (const [dx, dz] of [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) hi = Math.max(hi, f.heightAt(c.x + dx, c.z + dz));
    const h = hi + tall - c.y;
    cores.box(c.x, c.y + h / 2, c.z, CORE.w, h, CORE.w, 0x7f8b48, 'mapBark', { src });
    cores.box(c.x, c.y + h / 2, c.z, CORE.w, h, CORE.w, 0x7f8b48, 'mapBark', { src, ry: Math.PI / 4 });
  }
  const solid = buildVoxelMesh(cores, { quality: 'low', name, castShadow: false, receiveShadow: false });
  solid.visible = false;
  solid.traverse((o) => (o.raycast = () => {}));
  return solid;
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
