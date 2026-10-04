import { DoubleSide, Group, InstancedMesh, Mesh, MeshBasicMaterial, RingGeometry, Vector3, type Camera } from 'three';
import { LOTUS_BUD, LOTUS_COLORS, LOTUS_STEM, LOTUS_WIDE } from '../../character/lotus';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import type { VoxelMaterialKey } from '../../voxel/materials';
import { pixelSize } from '../graphics';
import { BODY_UNIT_M } from '../../world/scale';
import { BOAT_HALF_BEAM, BOAT_LENGTH } from './_boatModel';
import { LOTUS_BED } from './_lotusHook';
import { ROAM_SCALE, type RoamWorld } from './types';

/**
 * The lotus bed in the great lake off the floating village's south end
 * (roam/_lotus.ts picks from it): a few clumps on the open water, a metre
 * deep, out past the village's own lotus in the reed shallows (village/
 * _houses.ts) and the fisherman knee deep there, where the boat comes and
 * goes. Round leaves floating flat and others held up on their stalks,
 * cupped and tipped, pink lotus flowers open over gold hearts, green seed
 * pods, and closed pink buds standing tall on their stems: those are picked
 * from the boat (`buds`: one at a time, gone for the visit once picked; the
 * leaves stay).
 *
 * Voxel blocks of the map's families (`mapLeaf`, `petal`): the plants are
 * one mesh, the buds another (each bud its own run of instances, so one can
 * shrink away). Whatever stands inside the hull of a boat on the water (his,
 * riding or left there) shrinks away too, so no leaf pokes up through its
 * floor (`under`). World metres; the buds are as big as the one in his hand
 * (character/lotus.ts), seen at his size on the map (`ROAM_SCALE`).
 *
 * Far off (`view`: once what it leaves out, `FAR_DETAIL`, is under half a
 * pixel where the bed comes nearest the camera; graphics.ts `pixelSize`)
 * the bed is drawn from fewer plain boxes (its far meshes, built with it):
 * the leaves, stalks and seed pods, an open lotus one pale pink block, a bud
 * its stem and one pink block; no petals, turned-up rims or stubs. 1,210
 * blocks of 44 triangles (53 k), far 536 of 12 (6 k); from about 65 m in a
 * walk on a phone, 160 m at 1672 × 941. The far buds go with the near ones
 * (picked, under a hull).
 */

/** The clumps: middle (x, z) and radius (m). */
const CLUMPS: readonly (readonly [number, number, number])[] = [
  [-373.5, 81, 4.3],
  [-380.5, 85.2, 3.4],
  [-370.5, 74.8, 3.1],
  [-386, 78.6, 3.6],
  [-377.6, 76.8, 2.4],
];
/** The middle of the bed and how far its plants reach from it (m): far off, nothing is looked at (the maps' badge stands there). */
export const BED = LOTUS_BED;
/** Keep clear of the fisherman knee deep in the shallows (people/_sceneFish.ts `shallowsNear(−366, 88)`) and the shallows themselves (m). */
const CLEAR: readonly (readonly [number, number, number])[] = [[-366.5, 88.5, 3.2]];
/** Depth of water a plant needs (m: the lake is a metre deep here; the reed shallows 0.6). */
const DEEP = 0.75;

/** Metres per body unit of him on the map: the buds' size is his lotus's. */
const M = BODY_UNIT_M * ROAM_SCALE;

const PAD = [0x3f7a2e, 0x4a8a34, 0x467f30, 0x55903a, 0x3a6e2a];
const STALK = [0x5a7a3a, 0x4e6e34, 0x5d8f3c];
const PETAL = [0xf08ab0, 0xe8729c, 0xf6b0c8, 0xec80a8];
const OPEN_TIP = 0xe77a9c;
const OPEN_BASE = 0xfae6ea;
const HEART = 0xf2c94c;
const POD = [0x8a9a4a, 0x9aa456, 0x7d8c3c];

/** A bud that can be picked: where its stem stands out of the water, its top, the way it leans (unit), picked or not. */
export interface LotusBud {
  readonly i: number;
  readonly x: number;
  readonly z: number;
  /** The water's surface there (m). */
  readonly water: number;
  /** The bud's foot (where the stem meets the green cup), over the water's middle point (m, world). */
  readonly fx: number;
  readonly fy: number;
  readonly fz: number;
  /** The stem's way up (unit). */
  readonly ax: number;
  readonly ay: number;
  readonly az: number;
  picked: boolean;
}

export interface LotusBed {
  readonly object: Group;
  readonly buds: readonly LotusBud[];
  /** Pick bud `i` (it shrinks away for good) or bring it back (`picked=false`: checks). */
  setPicked(i: number, picked: boolean): void;
  /** A ring spreading on the water at (x, y, z): the stem snapped. */
  ripple(x: number, y: number, z: number): void;
  /** Each frame: the ripple, what stands inside the hull of a boat at (x, z) heading `yaw` (scale `s`) shrinks away; null: no boat on the water. */
  update(dt: number, hull: { x: number; z: number; yaw: number; s: number } | null): void;
  /** Each frame: near or far meshes for the camera that draws the picture. */
  view(camera: Camera): void;
  /** Blocks in all. */
  readonly blocks: number;
}

/** A plant's run of instances in each family of its mesh (to shrink it away under a hull), and its middle and reach (m). */
interface Plant {
  x: number;
  z: number;
  r: number;
  runs: { mat: VoxelMaterialKey; first: number; count: number }[];
  /** Its runs in the far mesh. */
  farRuns: { mat: VoxelMaterialKey; first: number; count: number }[];
  hidden: boolean;
}

/** The largest thing the far meshes leave out (m: an open lotus's petals, a held leaf's turned-up rim). */
const FAR_DETAIL = 0.08;
/** The far meshes once `FAR_DETAIL` spans under this much of a pixel where the bed comes nearest the camera… */
const FAR_PX = 0.5;
/** …and the near ones again this share nearer (no flicker on the line). */
const FAR_HOLD = 0.06;
/** An open lotus far off: one block, its pale petals with a little of their pink tips. */
const OPEN_FAR = 0xf4c6d3;

/** Inside a hull: the plants with their middle within this of its outline (m, beyond its own reach). */
const HULL_PAD = 0.12;

/** The bed, built on the lake where it is deep enough (`world`: the water, what is built there). */
export function createLotusBed(world: RoamWorld): LotusBed {
  const src = traceSource();
  const plants: Plant[] = [];
  const buds: LotusBud[] = [];
  /** The near meshes' blocks (plants, buds) and the far mesh's (plants and buds: `farBuds`). */
  const builders = { plant: new VoxelBuilder(), bud: new VoxelBuilder(), farPlant: new VoxelBuilder() };
  type Which = keyof typeof builders;
  /** Instances so far per family (each builder), to know a plant's runs. */
  const count: Record<Which, Map<VoxelMaterialKey, number>> = { plant: new Map(), bud: new Map(), farPlant: new Map() };
  /** Each bud's two blocks in the far mesh: its stem (`mapLeaf`) and the bud (`petal`). */
  const farBuds: { stem: number; bud: number }[] = [];
  let cur: Plant | null = null;
  /** The water's level at the bed (m): for how far the camera is from it. */
  let level = 0;
  type Extra = { rx?: number; ry?: number; rz?: number; shade?: number };
  /** A block; returns its number among its family's in its mesh. */
  const put = (which: Which, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, mat: VoxelMaterialKey, extra: Extra = {}): number => {
    const c = count[which];
    const n = c.get(mat) ?? 0;
    c.set(mat, n + 1);
    builders[which].box(x, y, z, sx, sy, sz, color, mat, { ...extra, src });
    if ((which === 'plant' || which === 'farPlant') && cur) {
      // (a plant's blocks of one family follow each other: one run per family it has)
      const runs = which === 'plant' ? cur.runs : cur.farRuns;
      const run = runs.find((r) => r.mat === mat);
      if (run) run.count++;
      else runs.push({ mat, first: n, count: 1 });
    }
    return n;
  };
  /** A block of a plant, near and far alike (its leaves, its seed pod). */
  const both = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, mat: VoxelMaterialKey, extra: Extra = {}) => {
    put('plant', x, y, z, sx, sy, sz, color, mat, extra);
    put('farPlant', x, y, z, sx, sy, sz, color, mat, extra);
  };
  const tone = (list: readonly number[], a: number, b: number, k: number) => list[Math.floor(hash3(a, b, k, 911) * list.length) % list.length];

  /** The lake is there, deep enough, nothing built in it, clear of the fisherman. */
  const fits = (x: number, z: number): number | null => {
    const w = world.waterAt(x, z);
    if (w === null || w - world.field.heightAt(x, z) < DEEP || world.groundAt(x, z) > w - 0.3) return null;
    for (const [cx, cz, r] of CLEAR) if (Math.hypot(x - cx, z - cz) < r) return null;
    return w;
  };

  /** A point `h` m up a stem leaning (θx, θz) from (x, y, z): Euler XYZ of a box turns +y to (−sin θz, cos θz cos θx, cos θz sin θx). */
  const up = (tx: number, tz: number) => [-Math.sin(tz), Math.cos(tz) * Math.cos(tx), Math.cos(tz) * Math.sin(tx)] as const;

  let seq = 0;
  for (const [cx, cz, cr] of CLUMPS) {
    const step = 0.72;
    for (let gz = -cr; gz <= cr; gz += step)
      for (let gx = -cr; gx <= cr; gx += step) {
        const key = [Math.round((cx + gx) * 10), Math.round((cz + gz) * 10)] as const;
        const h = (k: number) => hash3(key[0], key[1], k, 4127);
        const x = cx + gx + (h(1) - 0.5) * 0.55;
        const z = cz + gz + (h(2) - 0.5) * 0.55;
        const d = Math.hypot(x - cx, z - cz) / cr;
        // (thicker in the middle, thinning out ragged at the edge)
        if (d > 1 || h(3) > 0.92 - 0.55 * d * d) continue;
        const w = fits(x, z);
        if (w === null) continue;
        // (no two clumps planting on one spot)
        if (plants.some((p) => Math.abs(p.x - x) < 0.3 && Math.abs(p.z - z) < 0.3)) continue;
        const r = h(4);
        const turn = h(5) * Math.PI;
        const size = 0.48 + 0.42 * h(6);
        const leaf = tone(PAD, key[0], key[1], 7);
        if (r < 0.1 && buds.length < 26) {
          // A bud on its tall stem (picked from the boat: its own mesh).
          cur = null;
          const tx = (h(8) - 0.5) * 0.16;
          const tz = (h(9) - 0.5) * 0.16;
          const [ax, ay, az] = up(tx, tz);
          const foot = 0.68 + 0.26 * h(10);
          // (the stub at the water stays when it is picked)
          const STUB = 0.1;
          put('bud', x + ax * (STUB / 2), w + ay * (STUB / 2), z + az * (STUB / 2), 0.42 * M, STUB, 0.42 * M, tone(STALK, key[0], key[1], 11), 'mapLeaf', { rx: tx, rz: tz });
          const along = (u: number) => [x + ax * u, w + ay * u, z + az * u] as const;
          const [sx, sy, sz] = along((STUB + foot) / 2);
          put('bud', sx, sy, sz, 0.42 * M, foot - STUB, 0.42 * M, tone(STALK, key[0], key[1], 11), 'mapLeaf', { rx: tx, rz: tz });
          // (far: the stem without its stub, and below the bud as one block)
          const farStem = put('farPlant', sx, sy, sz, 0.42 * M, foot - STUB, 0.42 * M, tone(STALK, key[0], key[1], 11), 'mapLeaf', { rx: tx, rz: tz });
          const c = LOTUS_COLORS;
          const at = (u: number) => along(foot + u * M);
          const twist = h(12) * Math.PI;
          let p = at(0.15);
          put('bud', p[0], p[1], p[2], 0.66 * M, 0.34 * M, 0.66 * M, c.cup, 'mapLeaf', { rx: tx, ry: twist, rz: tz });
          p = at(0.48);
          put('bud', p[0], p[1], p[2], 1.0 * M, 0.46 * M, 1.0 * M, c.foot, 'petal', { rx: tx, ry: twist, rz: tz });
          p = at(1.08);
          put('bud', p[0], p[1], p[2], 1.2 * M, 0.86 * M, 1.2 * M, c.body, 'petal', { rx: tx, ry: twist, rz: tz });
          put('bud', p[0], p[1], p[2], 1.2 * M, 0.86 * M, 1.2 * M, c.body, 'petal', { rx: tx, ry: twist + Math.PI / 4, rz: tz, shade: 0.96 });
          p = at(1.8);
          put('bud', p[0], p[1], p[2], 0.86 * M, 0.62 * M, 0.86 * M, c.upper, 'petal', { rx: tx, ry: twist + Math.PI / 8, rz: tz });
          p = at(2.32);
          put('bud', p[0], p[1], p[2], 0.46 * M, 0.5 * M, 0.46 * M, c.tip, 'petal', { rx: tx, ry: twist + Math.PI / 8, rz: tz });
          p = at(1.2);
          farBuds.push({ stem: farStem, bud: put('farPlant', p[0], p[1], p[2], 0.9 * M, 2.2 * M, 0.9 * M, c.body, 'petal', { rx: tx, ry: twist, rz: tz }) });
          level = w;
          const f = along(foot);
          buds.push({ i: buds.length, x, z, water: w, fx: f[0], fy: f[1], fz: f[2], ax, ay, az, picked: false });
          // (a floating leaf at its foot)
          cur = { x, z, r: size / 2, runs: [], farRuns: [], hidden: false };
          plants.push(cur);
          both(x + 0.25, w + 0.03, z - 0.1, size * 0.85, 0.03, size * 0.8, leaf, 'mapLeaf', { ry: turn });
          continue;
        }
        cur = { x, z, r: size / 2, runs: [], farRuns: [], hidden: false };
        plants.push(cur);
        seq++;
        if (r < 0.66) {
          // A round leaf floating flat (two squares turned: round), a little dish to it.
          both(x, w + 0.03, z, size, 0.03, size * 0.92, leaf, 'mapLeaf', { ry: turn });
          both(x, w + 0.036, z, size * 0.82, 0.03, size * 0.82, leaf, 'mapLeaf', { ry: turn + Math.PI / 4, shade: 1.06 });
        } else if (r < 0.86) {
          // A leaf held up on its stalk, cupped and tipped (a big one, as lotus leaves stand over the water).
          const hgt = 0.45 + 0.55 * h(13);
          const s = size * 1.2;
          const tip = (h(14) - 0.5) * 0.5;
          both(x, w + hgt / 2, z, 0.035, hgt, 0.035, tone(STALK, key[0], key[1], 15), 'mapLeaf');
          both(x, w + hgt, z, s, 0.04, s * 0.92, leaf, 'mapLeaf', { ry: turn, rz: tip, shade: 1.08 });
          both(x, w + hgt + 0.012, z, s * 0.8, 0.04, s * 0.8, leaf, 'mapLeaf', { ry: turn + Math.PI / 4, rz: tip, shade: 1.12 });
          // (its rim turned up a little on two sides: a cup)
          for (const sd of [-1, 1])
            put('plant', x + Math.cos(turn) * sd * s * 0.47, w + hgt + 0.05 + Math.sin(tip) * -sd * s * 0.47 * Math.cos(turn), z - Math.sin(turn) * sd * s * 0.47, 0.06, 0.08, s * 0.6, leaf, 'mapLeaf', { ry: turn, rz: tip - sd * 0.5, shade: 1.02 });
        } else if (r < 0.95) {
          // A lotus open on its stalk: a ring of pink-tipped petals leaning out round the gold heart, a seed pod in it.
          const hgt = 0.48 + 0.3 * h(16);
          both(x, w + hgt / 2, z, 0.035, hgt, 0.035, tone(STALK, key[0], key[1], 17), 'mapLeaf');
          both(x + 0.3, w + 0.03, z + 0.15, size * 0.8, 0.03, size * 0.75, leaf, 'mapLeaf', { ry: turn });
          // (far: the flower one block, about as much of a pixel as its thin petals cover)
          put('farPlant', x, w + hgt + 0.1, z, 0.2, 0.1, 0.2, OPEN_FAR, 'petal', { ry: h(18) * Math.PI });
          const ft = h(18) * Math.PI;
          for (let k = 0; k < 7; k++) {
            const a = ft + (k / 7) * Math.PI * 2;
            put('plant', x + Math.sin(a) * 0.075, w + hgt + 0.07, z + Math.cos(a) * 0.075, 0.075, 0.15, 0.03, OPEN_BASE, 'petal', { ry: a, rx: -0.62 });
            put('plant', x + Math.sin(a) * 0.12, w + hgt + 0.14, z + Math.cos(a) * 0.12, 0.06, 0.06, 0.03, OPEN_TIP, 'petal', { ry: a, rx: -0.7 });
          }
          for (let k = 0; k < 4; k++) {
            const a = ft + 0.4 + (k / 4) * Math.PI * 2;
            put('plant', x + Math.sin(a) * 0.04, w + hgt + 0.09, z + Math.cos(a) * 0.04, 0.06, 0.13, 0.03, tone(PETAL, k, seq, 19), 'petal', { ry: a, rx: -0.22, shade: 1.06 });
          }
          put('plant', x, w + hgt + 0.06, z, 0.07, 0.04, 0.07, HEART, 'petal');
          put('plant', x, w + hgt + 0.085, z, 0.05, 0.03, 0.05, 0xc9c25a, 'petal');
        } else {
          // A seed pod (ផ្លែឈូក) after the flower: a green cone, flat-topped, nodding on its stalk.
          const hgt = 0.5 + 0.3 * h(20);
          const nod = 0.25 + 0.2 * h(21);
          both(x, w + hgt / 2, z, 0.035, hgt, 0.035, tone(STALK, key[0], key[1], 22), 'mapLeaf');
          both(x, w + hgt + 0.03, z, 0.07, 0.07, 0.07, tone(POD, key[0], key[1], 23), 'mapLeaf', { rx: nod, ry: turn });
          both(x, w + hgt + 0.08, z + Math.sin(nod) * 0.05, 0.12, 0.05, 0.12, tone(POD, key[0], key[1], 24), 'mapLeaf', { rx: nod, ry: turn, shade: 1.05 });
        }
      }
  }
  cur = null;

  const object = new Group();
  object.name = 'roam:lotus-bed';
  const plantMesh = buildVoxelMesh(builders.plant, { quality: 'medium', name: 'lotus-bed' });
  const budMesh = buildVoxelMesh(builders.bud, { quality: 'medium', name: 'lotus-buds' });
  // (far: plain boxes, no shadow: a leaf's on the water is under a pixel there)
  const farPlantMesh = buildVoxelMesh(builders.farPlant, { quality: 'low', name: 'lotus-bed:far', castShadow: false });
  farPlantMesh.visible = false;
  object.add(plantMesh, budMesh, farPlantMesh);
  const meshOf = (g: Group, mat: VoxelMaterialKey): InstancedMesh | null => (g.children.find((c) => c.name === `${g.name}:${mat}`) as InstancedMesh | undefined) ?? null;
  /** Each mesh's matrices as built (to put a block back). */
  const saved = new Map<InstancedMesh, Float32Array>();
  const keep = (m: InstancedMesh | null) => {
    if (m && !saved.has(m)) saved.set(m, (m.instanceMatrix.array as Float32Array).slice());
    return m;
  };
  /** Instances `first`‥ of `m` shrunk to nothing (`hide`) or back as built. */
  const shrink = (m: InstancedMesh | null, first: number, n: number, hide: boolean) => {
    if (!keep(m) || !m) return;
    const a = m.instanceMatrix.array as Float32Array;
    const s = saved.get(m)!;
    for (let i = first; i < first + n; i++) {
      const o = i * 16;
      for (let k = 0; k < 16; k++) a[o + k] = s[o + k];
      // (the block shader needs a size: shrunk where it stands, not removed)
      if (hide) for (const k of [0, 1, 2, 4, 5, 6, 8, 9, 10]) a[o + k] *= 1e-3;
    }
    m.instanceMatrix.addUpdateRange(first * 16, n * 16);
    m.instanceMatrix.needsUpdate = true;
  };
  const budLeaf = meshOf(budMesh, 'mapLeaf');
  const budPetal = meshOf(budMesh, 'petal');
  const farBud = meshOf(farPlantMesh, 'petal');
  const farStem = meshOf(farPlantMesh, 'mapLeaf');
  const plantMeshes = new Map<VoxelMaterialKey, InstancedMesh | null>();
  const farMeshes = new Map<VoxelMaterialKey, InstancedMesh | null>();
  for (const p of plants) {
    for (const r of p.runs) if (!plantMeshes.has(r.mat)) plantMeshes.set(r.mat, meshOf(plantMesh, r.mat));
    for (const r of p.farRuns) if (!farMeshes.has(r.mat)) farMeshes.set(r.mat, meshOf(farPlantMesh, r.mat));
  }

  // The ripple: a thin pale ring that spreads and fades (one draw, only while it shows).
  const ring = new Mesh(new RingGeometry(0.86, 1, 40, 1), new MeshBasicMaterial({ color: 0xe8f2f4, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }));
  ring.name = 'lotus:ripple';
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  ring.renderOrder = 2;
  object.add(ring);
  let rippleT = -1;
  /** Something is shrunk under a hull now (to bring it back once the hull has gone). */
  let anyHidden = false;

  // (the hull's outline: its middle, half length and beam, as the boat keeps off the banks)
  const inHull = (p: Plant, hx: number, hz: number, yaw: number, s: number): boolean => {
    const dx = p.x - hx;
    const dz = p.z - hz;
    const along = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const across = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    const hl = (BOAT_LENGTH / 2) * s + HULL_PAD;
    const hb = BOAT_HALF_BEAM * s + HULL_PAD;
    // (round toward the ends, as the hull narrows)
    const e = Math.min(1, Math.abs(along) / hl);
    const w = hb * Math.sqrt(Math.max(0, 1 - Math.pow(e, 2.4)));
    return Math.abs(along) < hl && Math.abs(across) < w + Math.min(p.r, 0.25);
  };
  const setHidden = (p: Plant, hide: boolean) => {
    if (p.hidden === hide) return;
    p.hidden = hide;
    for (const r of p.runs) shrink(plantMeshes.get(r.mat) ?? null, r.first, r.count, hide);
    for (const r of p.farRuns) shrink(farMeshes.get(r.mat) ?? null, r.first, r.count, hide);
  };
  /** The buds' runs: 3 leaf blocks (the stub stays), 5 petal blocks each. */
  const BUD_LEAF = 3;
  const BUD_PETAL = 5;
  /** Each bud as drawn now: whole, only the stub at the water (picked), or nothing (under a hull); and under a hull now. */
  const budDrawn: ('whole' | 'stub' | 'none')[] = buds.map(() => 'whole');
  const budUnder = buds.map(() => false);
  const showBud = (i: number) => {
    const want = budUnder[i] ? 'none' : buds[i].picked ? 'stub' : 'whole';
    if (want === budDrawn[i]) return;
    budDrawn[i] = want;
    shrink(budLeaf, i * BUD_LEAF, 1, want === 'none');
    shrink(budLeaf, i * BUD_LEAF + 1, BUD_LEAF - 1, want !== 'whole');
    shrink(budPetal, i * BUD_PETAL, BUD_PETAL, want !== 'whole');
    shrink(farStem, farBuds[i].stem, 1, want !== 'whole');
    shrink(farBud, farBuds[i].bud, 1, want !== 'whole');
  };
  /** The hull this step (see `update`), and whether a plant is inside it. */
  const H = { on: false, x: 0, z: 0, yaw: 0, s: 1 };
  const under = (p: Plant): boolean => H.on && Math.abs(p.x - H.x) < 3 && Math.abs(p.z - H.z) < 3 && inHull(p, H.x, H.z, H.yaw, H.s);
  /** A bud's stem as a plant (for the hull's test). */
  const budPlants: Plant[] = buds.map((b) => ({ x: b.x, z: b.z, r: 0.05, runs: [], farRuns: [], hidden: false }));
  /** The far meshes are drawn now. */
  let far = false;

  return {
    object,
    buds,
    blocks: builders.plant.boxes.length + builders.bud.boxes.length,
    setPicked(i, picked) {
      const b = buds[i];
      if (!b || b.picked === picked) return;
      b.picked = picked;
      showBud(i);
    },
    ripple(x, y, z) {
      ring.position.set(x, y + 0.02, z);
      rippleT = 0;
      ring.visible = true;
    },
    update(dt, hull) {
      if (rippleT >= 0) {
        rippleT += dt;
        const u = rippleT / 1.4;
        if (u >= 1) {
          rippleT = -1;
          ring.visible = false;
        } else {
          ring.scale.setScalar(0.12 + 0.75 * Math.sqrt(u));
          ring.material.opacity = 0.55 * (1 - u) * (1 - u);
        }
      }
      // Under a hull on the water: shrunk away (the plants near it only; three uploads the ranges changed and clears them).
      const near = !!hull && Math.hypot(hull.x - BED.x, hull.z - BED.z) < BED.r + 4;
      if (!near && !anyHidden) return;
      anyHidden = false;
      if (near && hull) {
        H.x = hull.x;
        H.z = hull.z;
        H.yaw = hull.yaw;
        H.s = hull.s;
      }
      H.on = near;
      for (const p of plants) {
        const hide = under(p);
        if (hide !== p.hidden) setHidden(p, hide);
        anyHidden ||= hide;
      }
      for (let i = 0; i < buds.length; i++) {
        const u = under(budPlants[i]);
        anyHidden ||= u;
        if (u === budUnder[i]) continue;
        budUnder[i] = u;
        showBud(i);
      }
    },
    view(camera) {
      _eye.setFromMatrixPosition(camera.matrixWorld);
      // (where the bed comes nearest: across its reach, and up to the camera over the water)
      const d = Math.hypot(Math.max(0, Math.hypot(_eye.x - BED.x, _eye.z - BED.z) - BED.r), _eye.y - level);
      const from = FAR_DETAIL / (FAR_PX * pixelSize(camera));
      const next = d > from * (far ? 1 : 1 + FAR_HOLD);
      if (next === far) return;
      far = next;
      plantMesh.visible = budMesh.visible = !far;
      farPlantMesh.visible = far;
    },
  };
}

const _eye = new Vector3();

/** The lotus bed's object hides past this far from the camera (m). */
export const BED_SEEN = 420;
/** The bud's length and width on the map (m), for the add-on's framing. */
export const BUD_SIZE = { len: LOTUS_BUD * M, wide: LOTUS_WIDE * M, stem: LOTUS_STEM * M };
