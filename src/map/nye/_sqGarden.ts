import { Sphere, Vector3, type Mesh } from 'three';
import { traceSource, type SourceTrace } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { Glow, GLOW_MODE } from '../festival/_glow';
import { ANIM, Kit, perPeriod, SHOW, type KitUniforms } from '../festival/_kit';
import type { HeightField } from '../heightfield';
import type { Lamps } from '../landmarks/_prasatKit';
import { beam, leaf, log, type P3 } from '../veg/plantKit';
import { SQUARE } from './plan';
import { AVENUE } from './_sqWalk';
import { khmerLamp, LATERITE, PAVER, pick } from './_sqKit';

/**
 * The festival square's garden and water (AWP-35; the owner: "the colour of blossoms and water is missing"):
 *
 * - **flowering trees** round the square, behind the stage and over the Kulen stream (`NYE_TREES`, spots kept
 *   stable: the square's string lights and lanterns hang in them): crape myrtle (Lagerstroemia, ត្របែកព្រៃ) in
 *   purple and lilac pink, the pink trumpet tree (Tabebuia rosea) nearly bare under its blossom, and frangipani
 *   (ចំប៉ា, champa) by the gate, white with yellow hearts on forked grey branches; at night each crown glows softly
 *   (halos in its colours and a few lit panicles) and petals lie on the ground under them;
 * - **flower beds** along the square's edge and the gate's walk: marigolds, red cockscomb, pink periwinkle, purple
 *   torenia in patches; two **bougainvillea arches** over the walk outside the gate;
 * - **the Kulen stream's west bank** (between the picnic trail and the water): sandstone ghat steps down to the
 *   water on a laterite footing, a flower bed along its top, Khmer lamps with their warm streaks on the water,
 *   lily pads and pink lotus at the water's edge;
 * - **floating lotus candles** (បណ្តែតប្រទីប, bandaet pratip) on the stream, drifting south with it, and on the
 *   Kulen pool, at night; many more on the event night (clock.ts `nightHeld`). No sky lanterns (Thai).
 *
 * Blocks: the trees, beds, arches and the ghat go into the square's builder (its families: no new draw). The rest
 * is the festival kit's way: one kit (petals, panicles, lily pads, lotus, candles), one glow (crowns, candles and
 * their streaks, the lamps' streaks), and the event night's extra candles in a kit and a glow of their own, drawn
 * only that night: 2 draws (4 on the event night). Nothing here is in the walk map but the voxels (the kit is not).
 */

export type TreeKind = 'myrtle' | 'trumpet' | 'champa';
export type Bloom = 'purple' | 'pink' | 'white';

export interface NyeTree {
  x: number;
  z: number;
  kind: TreeKind;
  bloom: Bloom;
  /** Height and crown radius (m). */
  h: number;
  r: number;
  /** On the square's edge (the string lights run between these), or round about. */
  edge: boolean;
  /** Left out on the low graphics level. */
  extra?: boolean;
}

/** Where the trees stand (map x, z: stable, the lights hang in them). θ round the square in the comments. */
export const NYE_TREES: readonly NyeTree[] = [
  { x: 401.7, z: -283.0, kind: 'myrtle', bloom: 'purple', h: 11, r: 4.4, edge: true }, // θ −50, by the stage's east end
  { x: 409.6, z: -272.4, kind: 'trumpet', bloom: 'pink', h: 10, r: 4.0, edge: true }, // θ −22, over the east stalls
  { x: 410.5, z: -254.5, kind: 'myrtle', bloom: 'pink', h: 9, r: 3.6, edge: true }, // θ 16
  { x: 399.4, z: -240.0, kind: 'champa', bloom: 'white', h: 6.5, r: 3.0, edge: true }, // θ 56, the gate's east side
  { x: 367.0, z: -240.0, kind: 'champa', bloom: 'white', h: 6.5, r: 3.0, edge: true }, // θ 124, the gate's west side
  { x: 350.0, z: -255.0, kind: 'trumpet', bloom: 'pink', h: 9.5, r: 3.8, edge: true }, // θ 164, out past the pavilion
  { x: 351.0, z: -271.0, kind: 'myrtle', bloom: 'purple', h: 10, r: 4.0, edge: true }, // θ 198, out past the pavilion
  { x: 364.3, z: -283.2, kind: 'myrtle', bloom: 'purple', h: 11, r: 4.4, edge: true }, // θ 230, by the stage's west end
  { x: 366.0, z: -301.0, kind: 'trumpet', bloom: 'pink', h: 12, r: 4.6, edge: false, extra: true }, // behind the stage, west
  { x: 400.5, z: -300.0, kind: 'myrtle', bloom: 'pink', h: 11, r: 4.2, edge: false, extra: true }, // behind the stage, east
  { x: 448.0, z: -256.0, kind: 'trumpet', bloom: 'pink', h: 9, r: 3.6, edge: false }, // over the stream, east bank
  { x: 449.0, z: -239.0, kind: 'myrtle', bloom: 'purple', h: 9, r: 3.6, edge: false, extra: true }, // over the stream, east bank
];

/** A tree as built: its spot, crown radius, the crown's underside and top (world y). */
export interface BuiltTree {
  x: number;
  z: number;
  r: number;
  ground: number;
  low: number;
  top: number;
  edge: boolean;
}

/** Blossom tones, deep shade → sunlit (sRGB). */
const BLOOM: Record<Bloom, readonly number[]> = {
  purple: [0x6a3488, 0x7e429e, 0x9455b6, 0xab6cca, 0xc18ada, 0xd6a8e8],
  pink: [0xa8405f, 0xc4567c, 0xd96e97, 0xe98cb0, 0xf3a9c6, 0xf9c6da],
  white: [0xd8ccb4, 0xe6dcc6, 0xf1e8d4, 0xf8f1e2, 0xfdf8ec, 0xfffcf4],
};
/** The leaves showing between the blossom. */
const LEAF = [0x2a4a30, 0x355e36, 0x497534, 0x5f8a37];
/** Crape myrtle's smooth mottled bark, the trumpet tree's grey, frangipani's pale grey. */
const BARK: Record<TreeKind, readonly number[]> = {
  myrtle: [0x9a8068, 0xae9478, 0x8a705a, 0xb8a084],
  trumpet: [0x6e6458, 0x7a6f62, 0x625a50],
  champa: [0x9c968a, 0xa8a296, 0x8e887c],
};
/** Night halos round the crowns. */
const HALO: Record<Bloom, number> = { purple: 0xb070ff, pink: 0xff7ab0, white: 0xffe8c0 };

/** Flower bed plants: [leaves, flower] (marigold, red cockscomb, pink periwinkle, purple torenia, white jasmine). */
const BED: readonly [number, readonly number[]][] = [
  [0x4f8a2c, [0xf08a12, 0xf7a81c, 0xe8740e]],
  [0x3f7a2e, [0xc8182e, 0xd82a3a, 0xb8102a]],
  [0x4a8a36, [0xf07aa8, 0xe8609a, 0xf596bd]],
  [0x447e34, [0x8a4cc8, 0x9a5ad6, 0x7a3eb4]],
  [0x4f8a2c, [0xf7b21c, 0xf4c030, 0xf08a12]],
  [0x3f7a2e, [0xe0407a, 0xd02e6a, 0xea5a8e]],
];
/** The bougainvillea arches over the avenue (map z; posts outside its kerbs). */
const ARCHES = [AVENUE.z0 + 11, AVENUE.z0 + 23] as const;
const SOIL = [0x4a3424, 0x543a28, 0x40301f];
const BOUG = [0xc0186e, 0xd42a80, 0xe2449a, 0xb01062];

const ell = (thDeg: number, k: number): [number, number] => {
  const a = (thDeg * Math.PI) / 180;
  return [SQUARE.x + Math.cos(a) * SQUARE.rx * k, SQUARE.z + Math.sin(a) * SQUARE.rz * k];
};

/** The kit's drift values for a candle (`ANIM.drift`). */
interface Drift {
  a: [number, number, number];
  b: [number, number, number, number];
}

export interface NyeGarden {
  trees: BuiltTree[];
  /** Blocks in the kits (the voxels are counted in the builder). */
  kitBoxes: number;
  /** Makes the kits' and glows' meshes (sharing the square's kit uniforms: clock, night, glow). */
  build(u: KitUniforms): Mesh[];
  /** Each frame: night 0‥1, the halos' light 0‥1, the event night. */
  update(night: number, lit: number, event: boolean): void;
}

/**
 * Plant the garden into the square's builder `b` (and the kits). Call before the square's dressing, which hangs
 * its lights in `trees`. `lamps` are the square's flames (the bank's lamps join them).
 */
export function plantGarden(b: VoxelBuilder, field: HeightField, lamps: Lamps, low: boolean): NyeGarden {
  const src = traceSource();
  const kit = new Kit();
  const blossom = new Kit();
  const glow = new Glow();
  const eventKit = new Kit();
  const eventGlow = new Glow();

  // ── The trees ──
  const trees: BuiltTree[] = [];
  for (const [i, t] of NYE_TREES.entries()) {
    if (low && t.extra) continue;
    const spot = freeSpot(field, t.x, t.z);
    if (!spot) continue;
    const [x, z] = spot;
    const g = field.heightAt(x, z);
    const built = t.kind === 'champa' ? champa(b, kit, glow, field, t, x, g, z, 7100 + i, low, src) : crown(b, kit, blossom, glow, field, t, x, g, z, 7100 + i, low, src);
    field.occupy(x - t.r * 0.8, z - t.r * 0.8, x + t.r * 0.8, z + t.r * 0.8);
    trees.push({ x, z, r: t.r, ground: g, low: built.low, top: built.top, edge: t.edge });
    fallenPetals(kit, field, t, x, z, 7100 + i, low);
  }

  // ── Flower beds: the square's edge (not before the gate or the stage, nor the west pavilion), the gate's walk ──
  const beds: [number, number, number, number][] = [];
  const arc = (th0: number, th1: number, k: number) => {
    const steps = Math.max(1, Math.round(((th1 - th0) * Math.PI * SQUARE.rx * k) / 180 / 2.2));
    for (let s = 0; s < steps; s++) {
      const [x0, z0] = ell(th0 + ((th1 - th0) * s) / steps, k);
      const [x1, z1] = ell(th0 + ((th1 - th0) * (s + 1)) / steps, k);
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      if (mx < 369 && mx > 354 && mz > -276 && mz < -244) continue;
      if (trees.some((t) => Math.hypot(t.x - mx, t.z - mz) < 1.8)) continue;
      beds.push([x0, z0, x1, z1]);
    }
  };
  arc(-58, 62, 1.12);
  arc(118, 238, 1.12);
  // Along the avenue to the gate (_sqWalk.ts `AVENUE`): both sides, 3.9‥6 m out from its middle, off the trails' treads.
  for (let z = AVENUE.z0 + 1.2; z + 2.2 <= AVENUE.z1 - 3.2; z += 2.4)
    for (const side of [-1, 1]) {
      const x = AVENUE.x + side * 4.95;
      if ([z, z + 1.1, z + 2.2].some((zz) => field.trail[field.index(x, zz)] === 2 || field.waterAt(x, zz) !== null)) continue;
      if (ARCHES.some((az) => Math.abs(az - (z + 1.1)) < 1.8)) continue;
      beds.push([x, z, x, z + 2.2]);
    }
  for (const [i, [x0, z0, x1, z1]] of beds.entries()) flowerBed(b, field, x0, z0, x1, z1, i, low, src);

  // ── Bougainvillea arches over the walk ──
  for (const [i, az] of ARCHES.entries()) bougainvilleaArch(b, field, AVENUE.x, az, 0, -1, 300 + i, low, src);

  // ── The Kulen stream's west bank: the ghat, its bed and lamps; lily pads and lotus; candles ──
  const stream = streamRows(field);
  let lampN = 0;
  for (const [ri, row] of stream.entries()) {
    const { z, xw, wy, top, trailEdge } = row;
    const z0 = z - 1;
    const z1 = z + 1;
    // The terrace on its laterite footing, and the steps down into the water.
    b.box(xw - 2.5, (wy - 0.7 + top + 0.12) / 2, z, 2.2, top + 0.12 - (wy - 0.7), 2, pick(PAVER, xw, z, 1), 'mapStone', { src });
    b.box(xw - 3.65, (wy - 0.7 + top + 0.2) / 2, z, 0.3, top + 0.2 - (wy - 0.7), 2, pick(LATERITE, xw, z, 2), 'mapStone', { src });
    const k = Math.max(2, Math.round((top + 0.12 - wy) / 0.4));
    const rise = (top + 0.12 - (wy + 0.05)) / k;
    const run = 1.8 / k;
    for (let s = 1; s <= k; s++) {
      const x0 = xw - 1.4 + (s - 1) * run;
      const x1 = xw + 0.5;
      const y1 = top + 0.12 - s * rise;
      b.box((x0 + x1) / 2, (wy - 0.7 + y1) / 2, z, x1 - x0, y1 - (wy - 0.7), 2, pick(PAVER, x0, z, 3 + s), 'mapStone', { src, shade: 1 - s * 0.03 });
    }
    field.occupy(xw - 3.8, z0, xw, z1);
    // The bed between the trail and the terrace's kerb.
    const bx0 = Math.max(trailEdge + 0.3, xw - 4.9);
    if (xw - 3.85 - bx0 > 0.45) flowerBed(b, field, (bx0 + xw - 3.85) / 2, z0 + 0.05, (bx0 + xw - 3.85) / 2, z1 - 0.05, 100 + ri, low, src, xw - 3.85 - bx0);
    // A lamp every 8 m on the terrace, its warm streak on the water.
    if (ri % 4 === 1) {
      khmerLamp(b, xw - 2.6, top + 0.12, z, 1.3, 40 + lampN++, src, lamps, glow, 2.0);
      glow.add(xw + 2.2, wy, z, 0xffa850, 7, { mode: GLOW_MODE.streak, level: 1.3, width: 0.4 });
    }
    // Lily pads and lotus at the water's edge.
    const n = low ? 1 : 2;
    for (let m = 0; m < n; m++) {
      const h = hash3(ri, m, 5, 77);
      if (h < 0.25) continue;
      const lx = xw + 0.9 + 1.6 * hash3(ri, m, 6, 77);
      const lz = z0 + 2 * hash3(ri, m, 7, 77);
      if (field.waterAt(lx, lz) === null) continue;
      lilyPad(kit, lx, wy, lz, ri * 7 + m);
      if (h > 0.6) lotus(kit, lx + 0.35, wy, lz - 0.2, ri * 7 + m, h > 0.85);
    }
  }
  // Lily pads and lotus round the Kulen pool's edge.
  for (let m = 0; m < (low ? 10 : 22); m++) {
    const a = hash3(m, 1, 9, 78) * Math.PI * 2;
    const u = 0.62 + 0.25 * hash3(m, 2, 9, 78);
    const lx = POOL.x + Math.cos(a) * POOL.rx * u;
    const lz = POOL.z + Math.sin(a) * POOL.rz * u;
    if (lz < -306 || field.waterAt(lx, lz) === null) continue;
    const wy = field.waterAt(lx, lz) ?? 0;
    lilyPad(kit, lx, wy, lz, 500 + m);
    if (hash3(m, 3, 9, 78) > 0.45) lotus(kit, lx + 0.3, wy, lz + 0.2, 500 + m, hash3(m, 4, 9, 78) > 0.7);
  }

  // ── Floating lotus candles: the stream (drifting south with it) and the pool (wandering) ──
  let ci = 0;
  const streamCandles = (k: Kit, gl: Glow, per: number, seed: number) => {
    for (let s = 0; s + 6 < stream.length; s += 6) {
      const r0 = stream[s];
      const r1 = stream[s + 6];
      const len = Math.hypot(r1.mid - r0.mid, r1.z - r0.z);
      const dx = (r1.mid - r0.mid) / len;
      const dz = (r1.z - r0.z) / len;
      for (let i = 0; i < per; i++, ci++) {
        const side = (hash3(ci, seed, 1, 81) - 0.5) * Math.max(0.5, r0.half - 1.6);
        candle(k, gl, r0.mid + side, r0.wy, r0.z, { a: [1, hash3(ci, seed, 2, 81), len], b: [dx, dz, 160 + 120 * hash3(ci, seed, 3, 81), 0] }, ci);
      }
    }
  };
  const poolCandles = (k: Kit, gl: Glow, n: number, seed: number) => {
    for (let i = 0; i < n * 3 && n > 0; i++, ci++) {
      const a = hash3(ci, seed, 4, 82) * Math.PI * 2;
      const u = Math.sqrt(hash3(ci, seed, 5, 82)) * 0.62;
      const x = POOL.x + Math.cos(a) * POOL.rx * u;
      const z = POOL.z + Math.sin(a) * POOL.rz * u;
      const wy = field.waterAt(x, z);
      if (wy === null || z < -307) continue;
      candle(k, gl, x, wy, z, { a: [0, hash3(ci, seed, 6, 82), 0.3 + 0.5 * hash3(ci, seed, 7, 82)], b: [0, 0, perPeriod(0.02 + 0.05 * hash3(ci, seed, 8, 82)), 0] }, ci);
      if (--n <= 0) break;
    }
  };
  streamCandles(kit, glow, low ? 2 : 3, 1);
  poolCandles(kit, glow, low ? 6 : 10, 2);
  streamCandles(eventKit, eventGlow, low ? 3 : 6, 3);
  poolCandles(eventKit, eventGlow, low ? 8 : 16, 4);

  let halos: ReturnType<Glow['build']> | null = null;
  let extraHalos: ReturnType<Glow['build']> | null = null;
  let extraKit: ReturnType<Kit['build']> | null = null;
  console.info(
    `[map] nye garden: ${trees.length} trees, ${beds.length} bed runs, ${stream.length} bank rows, blossom ${blossom.count}, kit ${kit.count} (+${eventKit.count} on the night), glows ${glow.count} (+${eventGlow.count})`,
  );
  return {
    trees,
    kitBoxes: kit.count + eventKit.count + blossom.count,
    build(u) {
      // (all within the square, the stream and the pool)
      const s = new Sphere(new Vector3((SQUARE.x + POOL.x) / 2, 14, -268), 62);
      const km = kit.build('nye:garden', u);
      km.show(true);
      km.mesh.castShadow = false;
      bound(km.mesh, s);
      const bm = blossom.build('nye:blossom', u);
      bm.show(true);
      bound(bm.mesh, s);
      halos = glow.build('nye:garden', u);
      bound(halos.mesh, s);
      extraKit = eventKit.build('nye:candles', u);
      extraKit.mesh.castShadow = false;
      bound(extraKit.mesh, s);
      extraHalos = eventGlow.build('nye:candles', u);
      bound(extraHalos.mesh, s);
      return [bm.mesh, km.mesh, halos.mesh, extraKit.mesh, extraHalos.mesh];
    },
    update(night, lit, event) {
      if (halos) {
        halos.level.value = lit * (event ? 1.25 : 1);
        halos.show(lit > 0);
      }
      const extra = event && lit > 0;
      extraKit?.show(extra);
      if (extraHalos) {
        extraHalos.level.value = lit;
        extraHalos.show(extra);
      }
      void night;
    },
  };
}

/** The Kulen pool (layout.ts `LAKES`). */
const POOL = { x: 445, z: -302, rx: 11, rz: 9 } as const;

/** A free spot for a trunk at (x, z) or a little off it. */
function freeSpot(field: HeightField, x: number, z: number): [number, number] | null {
  for (const [dx, dz] of [
    [0, 0],
    [1.2, 0],
    [-1.2, 0],
    [0, 1.2],
    [0, -1.2],
    [1.6, 1.6],
    [-1.6, -1.6],
  ]) {
    const c = field.index(x + dx, z + dz);
    if (c < 0) continue;
    if (field.isFree(x + dx, z + dz) || (field.trail[c] === 1 && !field.occupied[c])) return [x + dx, z + dz];
  }
  return null;
}

/**
 * A crape myrtle or a pink trumpet tree: trunk(s) and branches as beams, a crown of lumps in 1 m cells (only its
 * shell), blossom over most of it (the trumpet tree nearly all: it flowers bare), a few lit panicles on top in the
 * kit, soft halos round it at night.
 */
function crown(b: VoxelBuilder, kit: Kit, blossom: Kit, glow: Glow, field: HeightField, t: NyeTree, x: number, g: number, z: number, seed: number, low: boolean, src: SourceTrace | undefined): { low: number; top: number } {
  const rnd = (i: number) => hash3(seed, i, 3, 91);
  const myrtle = t.kind === 'myrtle';
  const R = t.r;
  const Rv = R * (myrtle ? 0.72 : 0.6);
  const cy = t.h - Rv;
  const blobs: { x: number; y: number; z: number; r: number; ry: number }[] = [{ x: 0, y: cy, z: 0, r: R * 0.74, ry: Rv * 0.85 }];
  const n = myrtle ? 4 : 5;
  const a0 = rnd(1) * Math.PI * 2;
  for (let q = 0; q < n; q++) {
    const a = a0 + (q / n) * Math.PI * 2 + (rnd(10 + q) - 0.5) * 0.7;
    const d = R * (0.45 + rnd(20 + q) * 0.2);
    blobs.push({ x: Math.cos(a) * d, y: cy + Rv * (myrtle ? 0.1 + rnd(30 + q) * 0.35 : rnd(30 + q) * 0.3 - 0.15), z: Math.sin(a) * d, r: R * (0.42 + rnd(40 + q) * 0.14), ry: Rv * (0.55 + rnd(50 + q) * 0.15) });
  }
  blobs.push({ x: 0, y: cy + Rv * 0.5, z: 0, r: R * 0.45, ry: Rv * 0.5 });
  const floor = cy - Rv * (myrtle ? 0.7 : 0.62);
  // Trunks to the lumps (myrtle: three stems from the foot; trumpet: one trunk, then limbs).
  const bark = BARK[t.kind];
  const bk = (i: number) => bark[Math.floor(rnd(60 + i) * bark.length) % bark.length];
  if (myrtle) {
    for (let s = 0; s < 3; s++) {
      const L = blobs[1 + s];
      const mid: P3 = [x + L.x * 0.35, g + floor * 0.55, z + L.z * 0.35];
      log(b, [x + (s - 1) * 0.2, g - 0.1, z + (s % 2) * 0.2], mid, 0.4, bk(s), 'mapBark', 1, src);
      log(b, mid, [x + L.x * 0.75, g + L.y - L.ry * 0.3, z + L.z * 0.75], 0.3, bk(s + 3), 'mapBark', 1, src);
    }
  } else {
    const fork: P3 = [x, g + floor * 0.7, z];
    log(b, [x, g - 0.2, z], fork, 0.7, bk(0), 'mapBark', 1, src);
    b.box(x, g + 0.25, z, 1.1, 0.5, 1.1, bk(1), 'mapBark', { src, shade: 0.9 });
    for (let s = 1; s <= 4; s++) {
      const L = blobs[s];
      log(b, fork, [x + L.x * 0.8, g + L.y - L.ry * 0.2, z + L.z * 0.8], 0.36, bk(s + 1), 'mapBark', 1, src);
    }
  }
  // The crown's cells (world-aligned to the trunk).
  const RI = Math.ceil(R * 1.3) + 1;
  const J0 = Math.floor(floor);
  const J1 = Math.ceil(t.h) + 1;
  const inside = (i: number, j: number, k: number): boolean => {
    if (j + 0.5 < floor) return false;
    let d = Infinity;
    for (const L of blobs) {
      const dx = (i - L.x) / L.r;
      const dy = (j + 0.5 - L.y) / L.ry;
      const dz = (k - L.z) / L.r;
      d = Math.min(d, dx * dx + dy * dy + dz * dz);
    }
    return d < 1 + 0.45 * (hash3(i, j, k, seed) - 0.5);
  };
  const tones = BLOOM[t.bloom];
  const pTop = myrtle ? 0.88 : 0.96;
  const pSide = myrtle ? 0.7 : 0.88;
  const pLow = myrtle ? 0.3 : 0.6;
  const haloAt: [number, number, number][] = [];
  for (let j = J0; j <= J1; j++)
    for (let k = -RI; k <= RI; k++)
      for (let i = -RI; i <= RI; i++) {
        if (!inside(i, j, k)) continue;
        const up = !inside(i, j + 1, k);
        const dn = !inside(i, j - 1, k);
        const side = !inside(i + 1, j, k) || !inside(i - 1, j, k) || !inside(i, j, k + 1) || !inside(i, j, k - 1);
        if (!up && !dn && !side) continue;
        const cx = x + i;
        const cz = z + k;
        const cyy = g + j + 0.5;
        if (cyy - 0.5 < field.heightAt(cx, cz) - 0.05) continue;
        const h = hash3(i, j, k, seed + 1);
        const p = up ? pTop : dn ? pLow : pSide;
        const lit = Math.max(0, Math.min(1, (j + 0.5 - floor) / (t.h - floor)));
        const shade = (dn && !up ? 0.78 : up ? 1.06 : 0.92) + (h - 0.5) * 0.1;
        if (h < p) {
          const ti = Math.max(0, Math.min(tones.length - 1, Math.round(1 + lit * 3 + (up ? 1 : 0) - (dn ? 1 : 0) + (hash3(i, j, k, seed + 2) - 0.5) * 1.6)));
          // (in the blossom kit: lit softly from within at night)
          const c0 = tones[ti];
          blossom.box(cx, cyy, cz, 1, 1, 1, shade === 1 ? c0 : mixShade(c0, shade), { glow: up ? 0.11 : 0.08 });
          // A lit panicle (crape myrtle) or a cluster of trumpets standing out of the top.
          if (!low && up && hash3(i, j, k, seed + 3) < (myrtle ? 0.3 : 0.18)) {
            const c = tones[Math.min(tones.length - 1, ti + 1)];
            kit.box(cx + (hash3(i, j, k, seed + 4) - 0.5) * 0.4, cyy + 0.62, cz + (hash3(i, j, k, seed + 5) - 0.5) * 0.4, 0.32, myrtle ? 0.5 : 0.3, 0.32, c, { yaw: h * 3, glow: 0.22 });
          }
          if (side && !dn && hash3(i, j, k, seed + 6) < 0.035) haloAt.push([cx, cyy, cz]);
        } else {
          const li = Math.max(0, Math.min(LEAF.length - 1, Math.round(lit * 2 + (up ? 1 : 0) - (dn ? 1 : 0) + h)));
          b.box(cx, cyy, cz, 1, 1, 1, LEAF[li], 'mapLeaf', { src, shade });
        }
      }
  // Soft light in the crown at night: a few halos on its sides and one inside.
  const hc = HALO[t.bloom];
  glow.add(x, g + cy, z, hc, R * 2.8, { level: 0.2 });
  for (const [hx, hy, hz] of haloAt.slice(0, low ? 3 : 7)) glow.add(hx, hy, hz, hc, R * 1.2, { level: 0.24 });
  return { low: g + floor, top: g + t.h };
}

/**
 * Frangipani (ចំប៉ា): a short pale trunk forking into thick grey branches that fork again (a candelabra), each tip
 * a tuft of long leaves (the plant kit's) round a cluster of white flowers with yellow hearts.
 */
function champa(b: VoxelBuilder, kit: Kit, glow: Glow, field: HeightField, t: NyeTree, x: number, g: number, z: number, seed: number, low: boolean, src: SourceTrace | undefined): { low: number; top: number } {
  void field;
  const rnd = (i: number) => hash3(seed, i, 4, 93);
  const bark = BARK.champa;
  const bk = (i: number) => bark[Math.floor(rnd(70 + i) * bark.length) % bark.length];
  const fork: P3 = [x, g + 1.5, z];
  log(b, [x, g - 0.2, z], fork, 0.5, bk(0), 'mapBark', 1, src);
  const tips: P3[] = [];
  const n = 5;
  for (let s = 0; s < n; s++) {
    const a = (s / n) * Math.PI * 2 + rnd(s) * 0.8;
    const m: P3 = [x + Math.cos(a) * t.r * 0.45, g + t.h * 0.5 + rnd(10 + s) * 0.6, z + Math.sin(a) * t.r * 0.45];
    log(b, fork, m, 0.3, bk(s + 1), 'mapBark', 1, src);
    for (let f = 0; f < 2; f++) {
      const a2 = a + (f ? 0.5 : -0.5);
      const tip: P3 = [m[0] + Math.cos(a2) * t.r * 0.45, g + t.h * (0.8 + 0.18 * rnd(20 + s * 2 + f)), m[2] + Math.sin(a2) * t.r * 0.45];
      log(b, m, tip, 0.2, bk(s + f + 2), 'mapBark', 1, src);
      tips.push(tip);
    }
  }
  const tones = BLOOM.white;
  for (const [ti, tip] of tips.entries()) {
    const leaves = low ? 4 : 7;
    for (let l = 0; l < leaves; l++) {
      const az = (l / leaves) * Math.PI * 2 + rnd(30 + ti);
      leaf(b, tip, { len: 0.55, wid: 0.16, az, el: 0.5 - 0.25 * (l % 2), color: LEAF[1 + (l % 3)], segs: low ? 1 : 2, rib: false, src });
    }
    // The flowers: a cluster of five-petalled whites (each two crossed slabs) with yellow hearts, standing on the tuft.
    const fl = low ? 2 : 4;
    for (let f = 0; f < fl; f++) {
      const a = (f / fl) * Math.PI * 2 + rnd(40 + ti);
      const fx = tip[0] + Math.cos(a) * 0.16;
      const fz = tip[2] + Math.sin(a) * 0.16;
      const fy = tip[1] + 0.2 + 0.06 * (f % 2);
      kit.box(fx, fy, fz, 0.2, 0.05, 0.2, tones[4 + (f % 2)], { yaw: a, glow: 0.18 });
      kit.box(fx, fy + 0.012, fz, 0.2, 0.05, 0.2, tones[3], { yaw: a + Math.PI / 4, glow: 0.18 });
      kit.box(fx, fy + 0.04, fz, 0.07, 0.03, 0.07, 0xf3c23a, { glow: 0.2 });
    }
    if (ti % 3 === 0) glow.add(tip[0], tip[1] + 0.2, tip[2], HALO.white, 2.2, { level: 0.12 });
  }
  return { low: g + t.h * 0.55, top: g + t.h };
}

/** Petals fallen under a crown (the kit: thin slabs lying on the ground or the pavers). */
function fallenPetals(kit: Kit, field: HeightField, t: NyeTree, x: number, z: number, seed: number, low: boolean): void {
  const tones = BLOOM[t.bloom];
  const n = low ? 10 : t.kind === 'champa' ? 18 : 34;
  for (let i = 0; i < n; i++) {
    const a = hash3(seed, i, 1, 95) * Math.PI * 2;
    const r = t.r * 1.15 * Math.sqrt(hash3(seed, i, 2, 95));
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    if (field.waterAt(px, pz) !== null) continue;
    const s = 0.16 + 0.16 * hash3(seed, i, 3, 95);
    kit.box(px, field.heightAt(px, pz) + 0.105, pz, s, 0.02, s * 0.8, tones[2 + Math.floor(hash3(seed, i, 4, 95) * 4)], { yaw: a * 3 });
  }
}

/**
 * A flower bed from (x0, z0) to (x1, z1), `w` m wide: dark soil, then plants in patches of one kind (each a leafy
 * mound and its flower heads on top), two rows staggered (one on the low level).
 */
function flowerBed(b: VoxelBuilder, field: HeightField, x0: number, z0: number, x1: number, z1: number, seed: number, low: boolean, src: SourceTrace | undefined, w = 1.0): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.3) return;
  const ux = (x1 - x0) / len;
  const uz = (z1 - z0) / len;
  const ry = Math.atan2(ux, uz);
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  const gm = field.heightAt(mx, mz);
  b.box(mx, gm + 0.06, mz, w, 0.16, len + 0.1, pick(SOIL, mx, mz, 1), 'mapStone', { src, ry, shade: 0.9 });
  field.occupy(mx - w / 2 - len / 2, mz - w / 2 - len / 2, mx + w / 2 + len / 2, mz + w / 2 + len / 2);
  const rows = low || w < 0.8 ? 1 : 2;
  const step = low ? 0.6 : 0.42;
  const n = Math.max(1, Math.floor(len / step));
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n - 0.5;
    for (let r = 0; r < rows; r++) {
      const off = rows === 1 ? 0 : (r ? 0.22 : -0.22) * w;
      const along = u * len + (r ? step * 0.25 : -step * 0.25);
      const px = mx + ux * along + uz * off;
      const pz = mz + uz * along - ux * off;
      const kind = BED[Math.floor(hash3(Math.floor((seed * 7 + i / 6) as number), r, 3, 96) * BED.length) % BED.length];
      const g = field.heightAt(px, pz);
      const h = hash3(px, pz, seed, 97);
      const s = 0.3 + 0.1 * h;
      b.box(px, g + 0.14 + s * 0.4, pz, s, s * 0.8, s, kind[0], 'mapLeaf', { src, ry: h * 1.6, shade: 0.9 + 0.15 * h });
      const fc = kind[1][Math.floor(hash3(px, pz, seed, 98) * kind[1].length) % kind[1].length];
      b.box(px, g + 0.14 + s * 0.85, pz, s * 0.78, 0.13, s * 0.78, fc, 'petal', { src, ry: h * 2.3 + 0.4 });
    }
  }
}

/**
 * A bougainvillea arch over the walk at (x, z), the walk going (dx, dz): two dark wooden posts, a curved top, the
 * vine climbing both posts and heaped over the top in magenta bracts and leaves (0.5 m cells).
 */
function bougainvilleaArch(b: VoxelBuilder, field: HeightField, x: number, z: number, dx: number, dz: number, seed: number, low: boolean, src: SourceTrace | undefined): void {
  const nx = -dz;
  const nz = dx;
  const half = 4.3;
  const g = field.heightAt(x, z);
  const post = 0x4a3020;
  const H = 3.3;
  const pts: P3[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (i / 8);
    const s = -Math.cos(a) * half;
    pts.push([x + nx * s, g + H + Math.sin(a) * 1.5, z + nz * s]);
  }
  for (const s of [-half, half]) {
    const px = x + nx * s;
    const pz = z + nz * s;
    const gy = field.heightAt(px, pz);
    beam(b, [px, gy - 0.1, pz], [px, g + H, pz], 0.16, 0.16, post, 'mapBark', 0, 1, src);
    b.box(px, gy + 0.1, pz, 0.36, 0.2, 0.36, pick(LATERITE, px, pz, 1), 'mapStone', { src });
    field.occupy(px - 0.3, pz - 0.3, px + 0.3, pz + 0.3);
  }
  for (let i = 0; i < 8; i++) beam(b, pts[i], pts[i + 1], 0.14, 0.14, post, 'mapBark', 0, 1, src);
  // The vine: clumps along the arch (thicker on top), and climbing the posts.
  const cells = low ? 40 : 90;
  for (let c = 0; c < cells; c++) {
    const u = hash3(seed, c, 1, 99);
    let p: P3;
    if (c % 4 === 0) {
      const s = hash3(seed, c, 2, 99) < 0.5 ? -half : half;
      p = [x + nx * s, g + 0.6 + (H - 0.4) * u, z + nz * s];
    } else {
      const f = u * 8;
      const i = Math.min(7, Math.floor(f));
      const q = pts[i];
      const r = pts[i + 1];
      const t = f - i;
      p = [q[0] + (r[0] - q[0]) * t, q[1] + (r[1] - q[1]) * t + 0.15, q[2] + (r[2] - q[2]) * t];
    }
    const ox = (hash3(seed, c, 3, 99) - 0.5) * 0.7;
    const oy = (hash3(seed, c, 4, 99) - 0.3) * 0.5;
    const oz = (hash3(seed, c, 5, 99) - 0.5) * 0.7;
    const leafy = hash3(seed, c, 6, 99) < 0.28;
    const s = 0.42 + 0.18 * hash3(seed, c, 7, 99);
    b.box(p[0] + ox * Math.abs(dx) + nx * ox * 0.3, p[1] + oy, p[2] + oz * Math.abs(dz) + nz * oz * 0.3, s, s * 0.85, s, leafy ? LEAF[2] : BOUG[c % BOUG.length], leafy ? 'mapLeaf' : 'petal', { src, ry: hash3(seed, c, 8, 99), shade: 0.9 + 0.2 * u });
  }
}

/** A lily pad on the water (two thin slabs turned 45°: a round leaf), a little bobbing (the kit's drift). */
function lilyPad(kit: Kit, x: number, wy: number, z: number, i: number): void {
  const d = { anim: ANIM.drift, a: [0, hash3(i, 1, 3, 71), 0.08] as [number, number, number], b: [0, 0, perPeriod(0.05), 0] as [number, number, number, number] };
  const s = 0.55 + 0.35 * hash3(i, 2, 3, 71);
  const c = [0x3f7f35, 0x4f9440, 0x356e30][i % 3];
  const yaw = hash3(i, 3, 3, 71) * 3;
  kit.box(x, wy + 0.03, z, s, 0.03, s * 0.9, c, { ...d, yaw });
  kit.box(x, wy + 0.035, z, s * 0.9, 0.03, s, c, { ...d, yaw: yaw + Math.PI / 4 });
  // (a second, smaller pad beside it)
  const a = yaw * 2;
  kit.box(x + Math.cos(a) * s * 0.9, wy + 0.03, z + Math.sin(a) * s * 0.9, s * 0.6, 0.03, s * 0.55, c, { ...d, yaw: yaw + 0.5 });
}

/** A pink lotus (outer and inner petals crossed, a gold heart) standing on the water, or a bud on its stalk. */
function lotus(kit: Kit, x: number, wy: number, z: number, i: number, bud: boolean): void {
  const glow = 0.12;
  kit.box(x, wy + 0.25, z, 0.03, 0.5, 0.03, 0x5a7a3a);
  if (bud) {
    kit.box(x, wy + 0.58, z, 0.14, 0.2, 0.14, 0xf08ab0, { glow, yaw: 0.4 });
    kit.box(x, wy + 0.7, z, 0.07, 0.08, 0.07, 0xf6b0c8, { glow, yaw: 0.4 });
    return;
  }
  const yaw = hash3(i, 5, 3, 72) * 2;
  kit.box(x, wy + 0.52, z, 0.42, 0.1, 0.18, 0xe8729c, { glow, yaw });
  kit.box(x, wy + 0.52, z, 0.18, 0.1, 0.42, 0xe8729c, { glow, yaw });
  kit.box(x, wy + 0.57, z, 0.3, 0.14, 0.3, 0xf08ab0, { glow, yaw: yaw + Math.PI / 4 });
  kit.box(x, wy + 0.62, z, 0.2, 0.12, 0.2, 0xf6b0c8, { glow, yaw });
  kit.box(x, wy + 0.67, z, 0.08, 0.04, 0.08, 0xf0c040, { glow: 0.3 });
}

/**
 * A floating lotus candle (បណ្តែតប្រទីប: a banana-leaf boat, lotus petals, a candle and its flame), drifting; its
 * halo and its streak on the water drift with it. Night only.
 */
function candle(kit: Kit, glow: Glow, x: number, y: number, z: number, drift: Drift, i: number): void {
  const d = { show: SHOW.night, anim: ANIM.drift, a: drift.a, b: drift.b };
  const petal = hash3(i, 7, 1, 55) < 0.6 ? 0xf29ab8 : 0xf6f0e4;
  kit.box(x, y + 0.05, z, 0.46, 0.1, 0.46, 0x5f9a3a, d);
  kit.box(x, y + 0.13, z, 0.36, 0.12, 0.36, petal, { ...d, yaw: Math.PI / 4 });
  kit.box(x, y + 0.24, z, 0.05, 0.14, 0.05, 0xf4ecd8, d);
  kit.box(x, y + 0.35, z, 0.06, 0.09, 0.06, 0xffc070, { ...d, glow: 2.2 });
  glow.add(x, y + 0.36, z, 0xffa850, 1.4, { drift, level: 0.55 });
  glow.add(x, y + 0.01, z, 0xffa040, 5, { drift, mode: GLOW_MODE.streak, level: 1.4, width: 0.26 });
}

/** The stream's west bank by the square, row by row (2 m): its edge, water level, the land's top, the trail's edge. */
function streamRows(field: HeightField): { z: number; xw: number; wy: number; top: number; trailEdge: number; mid: number; half: number }[] {
  const out: { z: number; xw: number; wy: number; top: number; trailEdge: number; mid: number; half: number }[] = [];
  for (let z = -283; z <= -235; z += 2) {
    let xw = -1;
    for (let x = 424; x <= 448; x += 0.5)
      if (field.waterAt(x, z) !== null) {
        xw = x;
        break;
      }
    if (xw < 0) continue;
    const wy = field.waterAt(xw + 0.5, z) ?? 0;
    let xe = xw;
    while (xe < xw + 20 && field.waterAt(xe + 0.5, z) !== null) xe += 0.5;
    const top = Math.max(field.heightAt(xw - 5, z), field.heightAt(xw - 4.5, z));
    if (top - wy < 0.3 || top - wy > 3.5) continue;
    let trailEdge = xw - 8;
    for (let x = xw - 0.5; x >= xw - 12; x -= 0.5)
      if (field.trail[field.index(x, z)] > 0) {
        trailEdge = Math.floor(x / 2) * 2 + 2;
        break;
      }
    out.push({ z, xw, wy, top, trailEdge, mid: (xw + xe) / 2, half: (xe - xw) / 2 });
  }
  return out;
}

/** A mesh posed in its shader: culled on the sphere that holds all it draws (world m; the mesh stays at the origin). */
function bound(mesh: Mesh, s: Sphere): void {
  mesh.geometry.boundingSphere = s;
  mesh.frustumCulled = true;
}

/** An sRGB colour times a brightness. */
function mixShade(c: number, k: number): number {
  const ch = (sh: number) => Math.max(0, Math.min(255, Math.round(((c >> sh) & 255) * k)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
