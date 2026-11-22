import { Sphere, Vector3, type Mesh } from 'three';
import { traceSource, type SourceTrace } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { Glow, GLOW_MODE } from '../festival/_glow';
import { ANIM, Kit, perPeriod, SHOW, type KitUniforms } from '../festival/_kit';
import type { HeightField } from '../heightfield';
import type { Lamps } from '../landmarks/_prasatKit';
import { beam, leaf, log, type P3 } from '../veg/plantKit';
import { BRIDGE, SQUARE, STEPS_Z } from './plan';
import { AVENUE } from './_sqWalk';
import { khmerLamp, LATERITE, PAVER, pick } from './_sqKit';
import { WaterLights } from './_lkReflect';
import { onGardenPath, poleRoom } from './_sqPath';
import { flowerBed, stonePlanter } from './_sqPathKit';
import { dressRiver, lilyPad, lotus } from './_sqRiver';

export { flowerBed, lilyPad, lotus };

/**
 * The festival square's garden and water (AWP-35; the owner: "the colour of blossoms and water is missing"):
 *
 * - **flowering trees** round the square, behind the stage and over the Kulen stream (`NYE_TREES`, spots kept
 *   stable: the square's string lights and lanterns hang in them): crape myrtle (Lagerstroemia, ត្របែកព្រៃ) in
 *   purple and lilac pink, the pink trumpet tree (Tabebuia rosea) nearly bare under its blossom, and frangipani
 *   (ចំប៉ា, champa) by the gate: forked grey-brown branches, rosettes of long glossy leaves at their tips and clusters of
 *   small white flowers with yellow hearts nestled in them (never a disc on top: from afar it read as a lamp); at night each crown glows softly
 *   (halos in its colours and a few lit panicles) and petals lie on the ground under them;
 * - **flower beds** along the square's edge and the gate's walk: marigolds, red cockscomb, pink periwinkle, purple
 *   torenia in patches; round the square a wide bed (three rows mounded, a sandstone kerb each side) with every fourth
 *   length a carved sandstone planter (`_sqPathKit.ts`), none where a garden path passes (`_sqPath.ts`); two
 *   **bougainvillea arches** over the walk outside the gate;
 * - **the Kulen stream's west bank** (between the picnic trail and the water): sandstone ghat steps down to the
 *   water on a laterite footing, a flower bed along its top, Khmer lamps every 6 m with their warm streaks on the
 *   water, lily pads and pink lotus at the water's edge; where the footbridge starts (plan.ts `BRIDGE`) one solid
 *   abutment instead of steps. The bridge, the stepping stones, the east bank and the lotus patches: `_sqRiver.ts`;
 * - **floating lotus candles** (បណ្តែតប្រទីប, bandaet pratip) on the stream, drifting south with it (in two reaches,
 *   either side of the stepping stones: none floats through them), and on the Kulen pool, at night; many more on the
 *   event night (clock.ts `nightHeld`). No sky lanterns (Thai).
 *
 * Blocks: the trees, beds, arches and the ghat go into the square's builder (its families: no new draw). The rest
 * is the festival kit's way: one kit (petals, panicles, lily pads, lotus, candles), one glow (the crowns' halos), the
 * water lights (`_lkReflect.ts` `WaterLights`, as the lake's: the candles' halos and every reflection on the stream and
 * the pool — long only at a grazing angle, a short soft patch seen from above), and the event night's extra candles in
 * a kit of their own, drawn only that night: 3 draws (4 on the event night). Nothing here is in the walk map but the voxels (the kit is not).
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
/** Crape myrtle's smooth mottled bark, the trumpet tree's grey, frangipani's grey-brown (a bark, not a stone post). */
const BARK: Record<TreeKind, readonly number[]> = {
  myrtle: [0x9a8068, 0xae9478, 0x8a705a, 0xb8a084],
  trumpet: [0x6e6458, 0x7a6f62, 0x625a50],
  champa: [0x7a6a5a, 0x857463, 0x6c5e50, 0x8f7e6a],
};
/** Frangipani's leaves: a deep glossy green, long, in rosettes at the branch tips. */
const CHAMPA_LEAF = [0x2e5a2c, 0x376a30, 0x2a5028, 0x427834];
/** Night halos round the crowns. */
const HALO: Record<Bloom, number> = { purple: 0xb070ff, pink: 0xff7ab0, white: 0xffe8c0 };

/** The bougainvillea arches over the avenue (map z; posts outside its kerbs). */
const ARCHES = [AVENUE.z0 + 11, AVENUE.z0 + 23] as const;
const BOUG = [0xc0186e, 0xd42a80, 0xe2449a, 0xb01062];

const ell = (thDeg: number, k: number): [number, number] => {
  const a = (thDeg * Math.PI) / 180;
  return [SQUARE.x + Math.cos(a) * SQUARE.rx * k, SQUARE.z + Math.sin(a) * SQUARE.rz * k];
};

/** The kit's drift values for a candle (`ANIM.drift`). */
export interface Drift {
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
  /** The candles' halos and every light's reflection on the stream and the pool (the lake's water lights: one draw). */
  const water = new WaterLights();

  const v0 = b.boxes.length;
  // ── The trees ──
  const trees: BuiltTree[] = [];
  for (const [i, t] of NYE_TREES.entries()) {
    if (low && t.extra) continue;
    // (an edge tree keeps its angle round the square and stands just outside its edge, whatever the square's size: the
    // spots in `NYE_TREES` were set round a 44 × 42 m square; east of it the picnic trail, so no farther than x 418)
    let tx = t.x;
    let tz = t.z;
    if (t.edge) {
      const th = Math.atan2((t.z - SQUARE.z) / 21, (t.x - SQUARE.x) / 22);
      tx = Math.min(418, SQUARE.x + Math.cos(th) * (SQUARE.rx + 4.5));
      tz = SQUARE.z + Math.sin(th) * (SQUARE.rz + 4.5);
    }
    const spot = freeSpot(field, tx, tz);
    if (!spot) continue;
    const [x, z] = spot;
    const g = field.heightAt(x, z);
    const built = t.kind === 'champa' ? champa(b, kit, glow, field, t, x, g, z, 7100 + i, low, src) : crown(b, kit, blossom, glow, field, t, x, g, z, 7100 + i, low, src);
    field.occupy(x - t.r * 0.8, z - t.r * 0.8, x + t.r * 0.8, z + t.r * 0.8);
    trees.push({ x, z, r: t.r, ground: g, low: built.low, top: built.top, edge: t.edge });
    fallenPetals(kit, field, t, x, z, 7100 + i, low);
  }

  // ── Flower beds: the square's edge (not before the gate or the stage, nor the west pavilion), the gate's walk ──
  // (round the square a wide bed, three rows mounded in the middle, and every fourth length a carved planter in its
  // line instead: bed, bed, bed, planter, as a temple terrace's garden; none where a garden path passes)
  const beds: [number, number, number, number, number][] = [];
  const planters: [number, number, number][] = [];
  const arc = (th0: number, th1: number, k: number) => {
    const steps = Math.max(1, Math.round(((th1 - th0) * Math.PI * SQUARE.rx * k) / 180 / 2.2));
    for (let s = 0; s < steps; s++) {
      const [x0, z0] = ell(th0 + ((th1 - th0) * s) / steps, k);
      const [x1, z1] = ell(th0 + ((th1 - th0) * (s + 1)) / steps, k);
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      if (mx < 369 && mx > 354 && mz > -276 && mz < -244) continue;
      if (trees.some((t) => Math.hypot(t.x - mx, t.z - mz) < 1.8) || onGardenPath(mx, mz, 1.4)) continue;
      if (s % 4 === 2 && poleRoom(mx, mz, 2.2)) planters.push([mx, mz, Math.atan2(x1 - x0, z1 - z0)]);
      else beds.push([x0, z0, x1, z1, 1.5]);
    }
  };
  arc(-58, 62, 1.12);
  arc(118, 238, 1.12);
  // Along the avenue to the gate (_sqWalk.ts `AVENUE`): both sides, 3.9‥6 m out from its middle, off the trails' treads and the paths.
  for (let z = AVENUE.z0 + 1.2; z + 2.2 <= AVENUE.z1 - 3.2; z += 2.4)
    for (const side of [-1, 1]) {
      const x = AVENUE.x + side * 4.95;
      if ([z, z + 1.1, z + 2.2].some((zz) => field.trail[field.index(x, zz)] === 2 || field.waterAt(x, zz) !== null || onGardenPath(x, zz, 0.5))) continue;
      if (ARCHES.some((az) => Math.abs(az - (z + 1.1)) < 1.8)) continue;
      beds.push([x, z, x, z + 2.2, 1.0]);
    }
  for (const [i, [x0, z0, x1, z1, w]] of beds.entries()) flowerBed(b, field, x0, z0, x1, z1, i, low, src, w, w > 1.2);
  for (const [i, [x, z, ry]] of planters.entries()) {
    stonePlanter(b, x, field.heightAt(x, z), z, 0.95, ry, 400 + i, low, src);
    field.occupy(x - 0.7, z - 0.7, x + 0.7, z + 0.7);
  }

  // ── Bougainvillea arches over the walk ──
  for (const [i, az] of ARCHES.entries()) bougainvilleaArch(b, field, AVENUE.x, az, 0, -1, 300 + i, low, src);

  // ── The Kulen stream's west bank: the ghat, its bed and lamps; lily pads and lotus; candles ──
  const stream = streamRows(field);
  let lampN = 0;
  for (const [ri, row] of stream.entries()) {
    const { z, xw, wy, top, trailEdge } = row;
    const z0 = z - 1;
    const z1 = z + 1;
    // (where the footbridge starts: one solid abutment out to the water's edge, no steps, no lamp, no bed: the path)
    const atBridge = Math.abs(z - BRIDGE.z) < BRIDGE.w / 2 + 0.4;
    const nearBridge = Math.abs(z - BRIDGE.z) < BRIDGE.w / 2 + 2.4;
    if (atBridge) {
      b.box(xw - 1.7, (wy - 0.7 + top + 0.12) / 2, z, 4.2, top + 0.12 - (wy - 0.7), 2, pick(PAVER, xw, z, 1), 'mapStone', { src });
      b.box(xw + 0.45, (wy - 0.7 + top + 0.02) / 2, z, 0.3, top + 0.02 - (wy - 0.7), 2, pick(LATERITE, xw, z, 5), 'mapStone', { src, shade: 0.9 });
    } else {
      // The terrace on its laterite footing, and the steps down into the water.
      b.box(xw - 2.5, (wy - 0.7 + top + 0.12) / 2, z, 2.2, top + 0.12 - (wy - 0.7), 2, pick(PAVER, xw, z, 1), 'mapStone', { src });
      const k = Math.max(2, Math.round((top + 0.12 - wy) / 0.4));
      const rise = (top + 0.12 - (wy + 0.05)) / k;
      const run = 1.8 / k;
      for (let s = 1; s <= k; s++) {
        const x0 = xw - 1.4 + (s - 1) * run;
        const x1 = xw + 0.5;
        const y1 = top + 0.12 - s * rise;
        b.box((x0 + x1) / 2, (wy - 0.7 + y1) / 2, z, x1 - x0, y1 - (wy - 0.7), 2, pick(PAVER, x0, z, 3 + s), 'mapStone', { src, shade: 1 - s * 0.03 });
      }
    }
    b.box(xw - 3.65, (wy - 0.7 + top + 0.2) / 2, z, 0.3, top + 0.2 - (wy - 0.7), 2, pick(LATERITE, xw, z, 2), 'mapStone', { src });
    field.occupy(xw - 3.8, z0, xw, z1);
    // The bed between the trail and the terrace's kerb.
    const bx0 = Math.max(trailEdge + 0.3, xw - 4.9);
    if (!nearBridge && xw - 3.85 - bx0 > 0.45) flowerBed(b, field, (bx0 + xw - 3.85) / 2, z0 + 0.05, (bx0 + xw - 3.85) / 2, z1 - 0.05, 100 + ri, low, src, xw - 3.85 - bx0);
    // A lamp every 6 m on the terrace, its warm streak on the water (the bridge has its own).
    if (ri % 3 === 1 && Math.abs(z - BRIDGE.z) > 4.5) {
      khmerLamp(b, xw - 2.6, top + 0.12, z, 1.3, 40 + lampN++, src, lamps, glow, 2.0);
      // (its reflection from the water's edge before it: the lamp's flame stands ≈ 2 m over the water)
      water.streak(xw + 0.4, wy, z, top + 0.12 + 2.0 - wy, undefined, { level: 1.4, width: 0.4 });
    }
    // Lily pads and lotus at the water's edge.
    const n = low ? 2 : 3;
    for (let m = 0; m < n; m++) {
      const h = hash3(ri, m, 5, 77);
      if (h < 0.15) continue;
      const lx = xw + 0.9 + 1.6 * hash3(ri, m, 6, 77);
      const lz = z0 + 2 * hash3(ri, m, 7, 77);
      if (field.waterAt(lx, lz) === null || Math.abs(lz - BRIDGE.z) < BRIDGE.w / 2 + 0.5 || Math.abs(lz - STEPS_Z) < 1.2) continue;
      lilyPad(kit, lx, wy, lz, ri * 7 + m);
      if (h > 0.5) lotus(kit, lx + 0.35, wy, lz - 0.2, ri * 7 + m, h > 0.85);
    }
  }
  // The footbridge, the stepping stones, the east bank, lily pads and lotus in patches (`_sqRiver.ts`).
  const river = dressRiver(b, kit, glow, lamps, field, low, src, water);
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
  // (in two reaches, past the stepping stones and on south under the bridge: none floats through the stones)
  const reaches = [stream.filter((r) => r.z < STEPS_Z - 1.2), stream.filter((r) => r.z > STEPS_Z + 1.2)].filter((r) => r.length > 2);
  const streamCandles = (k: Kit, gl: Glow, per: number, seed: number, event: boolean) => {
    for (const reach of reaches) {
      const r0 = reach[0];
      const r1 = reach[reach.length - 1];
      const len = Math.hypot(r1.mid - r0.mid, r1.z - r0.z);
      const dx = (r1.mid - r0.mid) / len;
      const dz = (r1.z - r0.z) / len;
      const m = Math.max(1, Math.round((per * len) / 12));
      for (let i = 0; i < m; i++, ci++) {
        const side = (hash3(ci, seed, 1, 81) - 0.5) * Math.max(0.5, r0.half - 1.6);
        candle(k, gl, r0.mid + side, r0.wy, r0.z, { a: [1, hash3(ci, seed, 2, 81), len], b: [dx, dz, (160 + 120 * hash3(ci, seed, 3, 81)) * (len / 12), 0] }, ci, { lights: water, event });
      }
    }
  };
  const poolCandles = (k: Kit, gl: Glow, n: number, seed: number, event: boolean) => {
    for (let i = 0; i < n * 3 && n > 0; i++, ci++) {
      const a = hash3(ci, seed, 4, 82) * Math.PI * 2;
      const u = Math.sqrt(hash3(ci, seed, 5, 82)) * 0.62;
      const x = POOL.x + Math.cos(a) * POOL.rx * u;
      const z = POOL.z + Math.sin(a) * POOL.rz * u;
      const wy = field.waterAt(x, z);
      if (wy === null || z < -307) continue;
      candle(k, gl, x, wy, z, { a: [0, hash3(ci, seed, 6, 82), 0.3 + 0.5 * hash3(ci, seed, 7, 82)], b: [0, 0, perPeriod(0.02 + 0.05 * hash3(ci, seed, 8, 82)), 0] }, ci, { lights: water, event });
      if (--n <= 0) break;
    }
  };
  streamCandles(kit, glow, low ? 3 : 5, 1, false);
  poolCandles(kit, glow, low ? 6 : 10, 2, false);
  streamCandles(eventKit, glow, low ? 3 : 6, 3, true);
  poolCandles(eventKit, glow, low ? 8 : 16, 4, true);

  let halos: ReturnType<Glow['build']> | null = null;
  let waterLights: ReturnType<WaterLights['build']> | null = null;
  let extraKit: ReturnType<Kit['build']> | null = null;
  console.info(
    `[map] nye garden: ${b.boxes.length - v0} blocks (river ${river.blocks}), ${trees.length} trees, ${beds.length} bed runs, ${planters.length} planters, ${stream.length} bank rows, blossom ${blossom.count}, kit ${kit.count} (+${eventKit.count} on the night), glows ${glow.count}, water lights ${water.count}`,
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
      waterLights = water.build('nye:garden', u);
      bound(waterLights.mesh, s);
      return [bm.mesh, km.mesh, halos.mesh, extraKit.mesh, waterLights.mesh];
    },
    update(night, lit, event) {
      if (halos) {
        halos.level.value = lit * (event ? 1.25 : 1);
        halos.show(lit > 0);
      }
      const extra = event && lit > 0;
      extraKit?.show(extra);
      waterLights?.update(lit, event ? 1 : 0);
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
export function crown(b: VoxelBuilder, kit: Kit, blossom: Kit, glow: Glow, field: HeightField, t: NyeTree, x: number, g: number, z: number, seed: number, low: boolean, src: SourceTrace | undefined): { low: number; top: number } {
  const rnd = (i: number) => hash3(seed, i, 3, 91);
  const myrtle = t.kind === 'myrtle';
  // (a broad, open crown of separate lobes on spreading limbs, not one ball: from above it reads as a tree, gaps
  // between its lobes, each lobe at its own height; the trumpet tree flatter, an umbrella)
  const R = t.r * 1.2;
  const Rv = R * (myrtle ? 0.72 : 0.58);
  const cy = t.h - Rv;
  const blobs: { x: number; y: number; z: number; r: number; ry: number }[] = [{ x: 0, y: cy + Rv * 0.15, z: 0, r: R * 0.48, ry: Rv * 0.6 }];
  const n = myrtle ? 5 : 6;
  const a0 = rnd(1) * Math.PI * 2;
  for (let q = 0; q < n; q++) {
    const a = a0 + (q / n) * Math.PI * 2 + (rnd(10 + q) - 0.5) * 0.6;
    const d = R * (0.68 + rnd(20 + q) * 0.24);
    blobs.push({ x: Math.cos(a) * d, y: cy + Rv * (myrtle ? rnd(30 + q) * 0.6 - 0.3 : rnd(30 + q) * 0.4 - 0.25), z: Math.sin(a) * d, r: R * (0.36 + rnd(40 + q) * 0.12), ry: Rv * (0.5 + rnd(50 + q) * 0.15) });
  }
  blobs.push({ x: (rnd(70) - 0.5) * R * 0.3, y: cy + Rv * 0.7, z: (rnd(71) - 0.5) * R * 0.3, r: R * 0.34, ry: Rv * 0.45 });
  const floor = cy - Rv * (myrtle ? 0.78 : 0.7);
  // Trunks to the lumps (myrtle: three stems from the foot; trumpet: one trunk, then limbs).
  const bark = BARK[t.kind];
  const bk = (i: number) => bark[Math.floor(rnd(60 + i) * bark.length) % bark.length];
  if (myrtle) {
    for (let s = 0; s < n; s++) {
      const L = blobs[1 + s];
      const mid: P3 = [x + L.x * 0.35, g + floor * 0.55, z + L.z * 0.35];
      log(b, [x + ((s % 3) - 1) * 0.2, g - 0.1, z + (s % 2) * 0.2], mid, 0.4, bk(s), 'mapBark', 1, src);
      log(b, mid, [x + L.x * 0.75, g + L.y - L.ry * 0.3, z + L.z * 0.75], 0.3, bk(s + 3), 'mapBark', 1, src);
    }
  } else {
    const fork: P3 = [x, g + floor * 0.7, z];
    log(b, [x, g - 0.2, z], fork, 0.7, bk(0), 'mapBark', 1, src);
    b.box(x, g + 0.25, z, 1.1, 0.5, 1.1, bk(1), 'mapBark', { src, shade: 0.9 });
    for (let s = 1; s <= n; s++) {
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
export function champa(b: VoxelBuilder, kit: Kit, glow: Glow, field: HeightField, t: NyeTree, x: number, g: number, z: number, seed: number, low: boolean, src: SourceTrace | undefined): { low: number; top: number } {
  void field;
  const rnd = (i: number) => hash3(seed, i, 4, 93);
  const bark = BARK.champa;
  const bk = (i: number) => bark[Math.floor(rnd(70 + i) * bark.length) % bark.length];
  const fork: P3 = [x, g + 1.5, z];
  log(b, [x, g - 0.2, z], fork, 0.56, bk(0), 'mapBark', 1, src);
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
    // A rosette of long glossy leaves at the tip: some reaching up, most out and drooping (the tree's crown of green).
    const leaves = low ? 5 : 9;
    for (let l = 0; l < leaves; l++) {
      const az = (l / leaves) * Math.PI * 2 + rnd(30 + ti);
      leaf(b, tip, { len: 1.05 + 0.2 * rnd(50 + l), wid: 0.3, az, el: [0.75, 0.35, 0.05][l % 3], bend: 0.45, color: CHAMPA_LEAF[(l + ti) % CHAMPA_LEAF.length], segs: low ? 1 : 2, src });
    }
    // The flowers: a cluster nestled in the rosette, five-petalled whites (each two crossed slabs, small) with yellow
    // hearts — not a disc on top: only a soft glow of their own at night.
    const fl = low ? 4 : 9;
    for (let f = 0; f < fl; f++) {
      const a = (f / fl) * Math.PI * 2 + rnd(40 + ti);
      const rr = f === 0 ? 0 : 0.12 + 0.06 * (f % 2);
      const fx = tip[0] + Math.cos(a) * rr;
      const fz = tip[2] + Math.sin(a) * rr;
      const fy = tip[1] + 0.16 + 0.07 * (f % 3);
      kit.box(fx, fy, fz, 0.2, 0.045, 0.2, tones[4 + (f % 2)], { yaw: a, pitch: 0.25 * (f % 2), glow: 0.12 });
      kit.box(fx, fy + 0.012, fz, 0.2, 0.045, 0.2, tones[3], { yaw: a + Math.PI / 4, glow: 0.12 });
      kit.box(fx, fy + 0.04, fz, 0.08, 0.03, 0.08, 0xf3c23a, { glow: 0.16 });
    }
    if (ti % 4 === 0) glow.add(tip[0], tip[1] + 0.2, tip[2], HALO.white, 1.6, { level: 0.05 });
  }
  return { low: g + t.h * 0.55, top: g + t.h };
}

/** Petals fallen under a crown (the kit: thin slabs lying on the ground or the pavers). */
export function fallenPetals(kit: Kit, field: HeightField, t: NyeTree, x: number, z: number, seed: number, low: boolean): void {
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

/**
 * A floating lotus candle (បណ្តែតប្រទីប: a banana-leaf boat, lotus petals, a candle and its tiny flame), drifting; its
 * halo and its reflection on the water drift with it. Night only. With `water` (the venue's water lights,
 * `_lkReflect.ts` `WaterLights`) the reflection is the lake's own: long only seen at a grazing angle, a short soft patch
 * looked down on (from over the square a rod of light stood on the water); else the festival glow's streak as before.
 */
export function candle(kit: Kit, glow: Glow, x: number, y: number, z: number, drift: Drift, i: number, water?: { lights: WaterLights; event: boolean }): void {
  const d = { show: SHOW.night, anim: ANIM.drift, a: drift.a, b: drift.b };
  const petal = hash3(i, 7, 1, 55) < 0.6 ? 0xf29ab8 : 0xf6f0e4;
  kit.box(x, y + 0.05, z, 0.46, 0.1, 0.46, 0x5f9a3a, d);
  kit.box(x, y + 0.13, z, 0.36, 0.12, 0.36, petal, { ...d, yaw: Math.PI / 4 });
  kit.box(x, y + 0.24, z, 0.05, 0.14, 0.05, 0xf4ecd8, d);
  kit.box(x, y + 0.34, z, 0.045, 0.07, 0.045, 0xffd080, { ...d, glow: water ? 1.4 : 2.2 });
  if (water) {
    water.lights.halo(x, y + 0.36, z, 0xffa850, 0.9, { drift, level: 0.32, event: water.event });
    water.lights.streak(x, y, z, 0.36, undefined, { drift, level: 1.2, width: 0.24, event: water.event });
    return;
  }
  glow.add(x, y + 0.36, z, 0xffa850, 1.4, { drift, level: 0.55 });
  glow.add(x, y + 0.01, z, 0xffa040, 6, { drift, mode: GLOW_MODE.streak, level: 1.8, width: 0.3 });
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
