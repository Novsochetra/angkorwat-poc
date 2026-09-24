import { Group } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { PATHS, type PlaceDef } from '../layout';
import type { MapContext, MapFrame, MapPart } from '../types';
import { FLOWER_ORANGE, FLOWER_PINK, gardenTree, GRASS, LEAF, Mason, type Palette, pick, prasat, SHADOW, SIDE, stupa, tieredTop, type Tones } from './_prasat';
import { Frame, grassOverPad, Lamps, Pools } from './_prasatKit';
import { giantTree } from './_prasatTrees';

/**
 * Ta Prohm — "The Lost Gardens": a jungle temple swallowed by giant trees,
 * in a setting of garden terraces and pools on the eastern hills.
 *
 * The garden road crosses the pad from its south-west corner to the
 * north-east, so the temple stands on the north-west side of it: a raised
 * platform with a step and a stair, a square gallery of dark mossy stone
 * (windows, stepped roofs, corner towers, a gate tower on the south, part
 * of the north side fallen in), and a central lotus-bud sanctuary. Silk-
 * cotton and fig trees grow out of the courtyard and off the gallery roofs:
 * pale trunks, roots pouring down the walls, wide crowns above the towers.
 * South of the platform a lotus pond; across the road a raised garden with a
 * long pool, flower beds and small stupas; south-west of the pad an open
 * lawn (kept free of jungle so the overview sees the temple) with a lotus
 * pool that spills into the head of the Terrace stream. At night lanterns
 * and a few gallery windows glow.
 */

/** Dark, mossy temple stone (greyer and greener than the other temples). */
const TP: Palette = {
  stone: [0x77736a, 0x6c685e, 0x827d72, 0x625e55],
  light: [0x938d80, 0x8a8478, 0x9c968a],
  dark: [0x4f4c45, 0x46433d, 0x57544c],
  base: [0x6e6254, 0x64594c, 0x786b5c],
};
const MOSS_DEEP: Tones = [0x4f6a2c, 0x5b7a32, 0x476326, 0x62823a];
const VINE: Tones = [0x355f25, 0x3f6e2a, 0x2f5621];
const ROAD = 'garden and mountain road';

export function buildTerrace(ctx: MapContext, place: PlaceDef): MapPart {
  const f = ctx.field;
  const g = place.y;
  const [hx, hz] = place.pad;
  const ex = hx + 2;
  const ez = hz + 2;
  // Local frame at the pad centre (+x east, +z south, world heights).
  const fr = new Frame(place.x, 0, place.z, 0);
  const b = new VoxelBuilder();
  const m = new Mason(b, 1, { seed: 51 });
  const d = new Mason(b, 0.5, { seed: 52 });
  const lamps = new Lamps(0.5, 4.2);
  const windows = new Lamps(0.04, 3);
  const pools = new Pools();
  const src = traceSource();

  // ── The road across the pad: signed distance, + on the north-west side ───
  const pts = (PATHS.find((p) => p.name === ROAD) ?? PATHS[0]).points;
  const sd = (lx: number, lz: number): number => {
    const x = fr.wx(lx, lz);
    const z = fr.wz(lx, lz);
    let best = Infinity;
    let side = 1;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      const t = Math.min(len, Math.max(0, (x - ax) * ux + (z - az) * uz));
      const dd = Math.hypot(ax + ux * t - x, az + uz * t - z);
      if (dd < best) {
        best = dd;
        // Left of the direction of travel (north-west here).
        side = (x - ax) * uz - (z - az) * ux >= 0 ? 1 : -1;
      }
    }
    return best * side;
  };
  const inPad = (x: number, z: number) => x >= -ex && x < ex && z >= -ez && z < ez;
  const CLEAR = 4.5;

  // ── Platform (2 m) with a 1 m step in front ─────────────────────────────
  const P = { x0: -26, x1: 6, z0: -22, z1: 3 };
  const onPlatform = (x: number, z: number) => x >= P.x0 && x < P.x1 && z >= P.z0 && z < P.z1 && inPad(x, z) && sd(x, z) >= CLEAR;
  const onStep = (x: number, z: number) => x >= P.x0 && x < P.x1 && z >= P.z1 && z < P.z1 + 3 && inPad(x, z) && sd(x, z) >= CLEAR;
  m.fill(P.x0, g, P.z0, P.x1, g + 2, P.z1, TP.stone, { src, keep: (x, _y, z) => onPlatform(x, z) });
  m.fill(P.x0, g, P.z1, P.x1, g + 1, P.z1 + 3, TP.stone, { src, keep: (x, _y, z) => onStep(x, z) });
  m.paint(P.x0, g, P.z0, P.x1, g + 1, P.z1 + 3, TP.base, { src });
  // Grass on top, a stone kerb along the edges.
  const inner = (test: (x: number, z: number) => boolean) => (x: number, _y: number, z: number) => test(x + 1, z) && test(x - 1, z) && test(x, z + 1) && test(x, z - 1);
  m.paint(P.x0, g + 1, P.z0, P.x1, g + 2, P.z1, GRASS, { src, mat: 'mapGrass', keep: inner(onPlatform) });
  m.paint(P.x0, g, P.z1, P.x1, g + 1, P.z1 + 3, GRASS, { src, mat: 'mapGrass', keep: inner(onStep) });

  // ── The temple ───────────────────────────────────────────────────────────
  const y0 = g + 2;
  const E = { x0: -24, x1: 2, z0: -20, z1: 0 };
  const W = 3;
  const axis = -11;
  const inRing = (x: number, z: number) =>
    x >= E.x0 && x < E.x1 && z >= E.z0 && z < E.z1 && !(x >= E.x0 + W && x < E.x1 - W && z >= E.z0 + W && z < E.z1 - W) && onPlatform(x, z);
  // Gallery walls, a darker base course, windows all round the outside.
  m.fill(E.x0, y0, E.z0, E.x1, y0 + 4, E.z1, TP.stone, { src, keep: (x, _y, z) => inRing(x, z) });
  m.paint(E.x0, y0, E.z0, E.x1, y0 + 1, E.z1, TP.dark, { src });
  for (let x = E.x0 + 2; x < E.x1 - 2; x += 2) {
    m.paint(x, y0 + 1, E.z1 - 1, x + 1, y0 + 3, E.z1, SHADOW, { src });
    m.paint(x, y0 + 1, E.z0, x + 1, y0 + 3, E.z0 + 1, SHADOW, { src });
    // Some south windows glow at night.
    if (Math.abs(x - axis) > 4 && hash3(x, 1, 2, 57) < 0.55) windows.strip(fr.world(x + 0.5, y0 + 2, E.z1 - 0.9), 0.8, 0.2, 1.6, 0, 0.9);
  }
  for (let z = E.z0 + 2; z < E.z1 - 2; z += 2) {
    m.paint(E.x0, y0 + 1, z, E.x0 + 1, y0 + 3, z + 1, SHADOW, { src });
    m.paint(E.x1 - 1, y0 + 1, z, E.x1, y0 + 3, z + 1, SHADOW, { src });
  }
  // Stepped roofs over the gallery (fine cells).
  const roof = (x0: number, z0: number, x1: number, z1: number, alongX: boolean) => {
    for (let k = 0; k < 3; k++) {
      const inset = k * 0.5 - 0.5;
      const [ax0, ax1, az0, az1] = alongX ? [x0, x1, z0 + inset, z1 - inset] : [x0 + inset, x1 - inset, z0, z1];
      d.fill(ax0, y0 + 4 + k * 0.5, az0, ax1, y0 + 4.5 + k * 0.5, az1, k === 0 ? TP.light : TP.stone, { src, keep: (x, _y, z) => onPlatform(x, z) });
    }
  };
  roof(E.x0, E.z1 - W, E.x1, E.z1, true);
  roof(E.x0, E.z0, E.x1, E.z0 + W, true);
  roof(E.x0, E.z0 + W, E.x0 + W, E.z1 - W, false);
  roof(E.x1 - W, E.z0 + W, E.x1, E.z1 - W, false);
  // Corner towers.
  for (const [cx, cz] of [
    [E.x0 + 2, E.z0 + 2],
    [E.x1 - 2, E.z0 + 2],
    [E.x0 + 2, E.z1 - 2],
    [E.x1 - 2, E.z1 - 2],
  ]) {
    m.fill(cx - 2, y0, cz - 2, cx + 2, y0 + 6, cz + 2, TP.stone, { src, keep: (x, _y, z) => onPlatform(x, z) });
    m.paint(cx - 2, y0 + 2, cz - 2, cx + 2, y0 + 3, cz + 2, TP.light, { src });
    tieredTop(d, cx, cz, y0 + 6, [1.5, 1], 1.5, src, TP);
  }
  // Gate tower on the south side, on the axis.
  m.fill(axis - 4, y0, E.z1 - W, axis + 4, y0 + 6, E.z1 + 2, TP.stone, { src });
  m.paint(axis - 4, y0, E.z1 - W, axis + 4, y0 + 1, E.z1 + 2, TP.dark, { src });
  m.clear(axis - 1, y0, E.z1 + 1, axis + 1, y0 + 4, E.z1 + 2);
  m.paint(axis - 1, y0, E.z1, axis + 1, y0 + 4, E.z1 + 1, SHADOW, { src });
  // Stepped pediment over the door.
  for (let s = 0; s < 6; s++) d.fill(axis - 3 + s * 0.5, y0 + 6 + s * 0.5, E.z1 + 1.5, axis + 3 - s * 0.5, y0 + 6.5 + s * 0.5, E.z1 + 2, TP.light, { src });
  d.fill(axis - 3, y0 + 6, E.z1 - 2, axis + 3, y0 + 7, E.z1 + 1.5, TP.stone, { src });
  tieredTop(d, axis, E.z1 - 0.5, y0 + 7, [2.5, 2, 1.5, 1], 1.5, src, TP);
  lamps.add(fr.world(axis - 2, y0 + 3.2, E.z1 + 2.4), 0.5);
  lamps.add(fr.world(axis + 2, y0 + 3.2, E.z1 + 2.4), 0.5);
  // Central sanctuary.
  prasat(m, axis, -10, y0, { h: 17, w: 6, tiers: 4, doors: SIDE.all, fine: d, pal: TP, src });
  windows.strip(fr.world(axis, y0 + 1.5, -10 + 4 - 0.9), 1.6, 0.2, 2.6, 0, 1);
  // The north side has fallen in: a gap in the roof and wall, rubble below.
  m.clear(-14, y0 + 2, E.z0, -7, y0 + 4, E.z0 + W);
  d.clear(-14, y0 + 4, E.z0 - 1, -7, y0 + 6, E.z0 + W + 1);
  m.clear(-12, y0 + 1, E.z0, -9, y0 + 2, E.z0 + W);
  for (let i = 0; i < 26; i++) {
    const size = hash3(i, 3, 0, 61) < 0.5 ? 1 : 0.5;
    const mason = size === 1 ? m : d;
    const rx = Math.floor((-16 + hash3(i, 1, 0, 61) * 11) / size) * size;
    const rz = Math.floor((E.z0 - 1.5 + hash3(i, 2, 0, 61) * (W + 5)) / size) * size;
    const top = onPlatform(rx + size / 2, rz + size / 2) ? y0 : g;
    if (m.has(rx + size / 2, top + 0.25, rz + size / 2) || d.has(rx + size / 2, top + 0.25, rz + size / 2)) continue;
    mason.fill(rx, top, rz, rx + size, top + size, rz + size, TP.stone, { src });
  }
  // Moss everywhere on top, vines down the outer walls.
  m.weather(0.35, 7, MOSS_DEEP);
  d.weather(0.3, 8, MOSS_DEEP);
  m.mottle(0.22, MOSS_DEEP, 9);
  d.mottle(0.18, MOSS_DEEP, 10);
  for (let i = 0; i < 60; i++) {
    const side = i % 4;
    const t = hash3(i, 5, 0, 67);
    const len = 1 + Math.floor(hash3(i, 6, 0, 67) * 4) * 0.5;
    const [x, z] =
      side === 0 ? [E.x0 + t * (E.x1 - E.x0), E.z1 + 0.25] : side === 1 ? [E.x0 + t * (E.x1 - E.x0), E.z0 - 0.25] : side === 2 ? [E.x0 - 0.25, E.z0 + t * (E.z1 - E.z0)] : [E.x1 + 0.25, E.z0 + t * (E.z1 - E.z0)];
    const vx = Math.floor(x * 2) / 2 + 0.25;
    const vz = Math.floor(z * 2) / 2 + 0.25;
    if (!onPlatform(vx, vz) && !onPlatform(vx - 0.5, vz) && !onPlatform(vx, vz - 0.5)) continue;
    for (let y = y0 + 4 - len; y < y0 + 4; y += 0.5) b.box(vx, y + 0.25, vz, 0.5, 0.5, 0.5, pick(VINE, hash3(i, y * 2, 0, 71)), 'mapLeaf', { src });
  }

  // ── Stair from the road up to the gate ───────────────────────────────────
  d.fill(axis - 2, g, P.z1 + 3, axis + 2, g + 0.5, P.z1 + 4, TP.light, { src });
  d.fill(axis - 2, g + 1, P.z1, axis + 2, g + 1.5, P.z1 + 1, TP.light, { src });
  for (const sx of [-1, 1]) lamps.add(fr.world(axis + sx * 2.75, g + 1.8, P.z1 + 2.75), 0.45);

  // ── Giant trees ──────────────────────────────────────────────────────────
  const surface = (x: number, z: number): number => {
    for (let y = 60; y >= g; y -= 0.5) if (m.has(x, y + 0.25, z) || d.has(x, y + 0.25, z)) return Math.floor(y * 2) / 2 + 0.5;
    return g;
  };
  const allowed = (x: number, z: number) => inPad(x, z) && sd(x, z) >= 3.5;
  const trees = [
    // Out of the courtyard, towering over the sanctuary.
    { x: -3.5, z: -15.5, base: y0, top: y0 + 19, crown: 9.5, roots: 8, reach: 10 },
    // Off the gallery roofs (ridge top at y0 + 5.5), roots down both faces.
    { x: -22.5, z: -9, base: y0 + 5.5, top: y0 + 17, crown: 10, roots: 7, reach: 9 },
    { x: 0.5, z: -8, base: y0 + 5.5, top: y0 + 14, crown: 8, roots: 6, reach: 8 },
    { x: -17, z: -18.5, base: y0 + 5.5, top: y0 + 13, crown: 8, roots: 5, reach: 7 },
    { x: -22.5, z: -1.5, base: y0 + 5.5, top: y0 + 11, crown: 6.5, roots: 5, reach: 7 },
  ];
  trees.forEach((t, i) => giantTree(b, { ...t, seed: 80 + i * 7, surface, allowed }));

  // ── Garden: lotus pond, raised garden with a long pool, beds, stupas ─────
  // Lotus pond south-west of the platform.
  const pond = { x0: -25, x1: -18, z0: 8, z1: 18 };
  d.fill(pond.x0 - 0.5, g, pond.z0 - 0.5, pond.x1 + 0.5, g + 0.5, pond.z1 + 0.5, TP.light, { src, keep: (x, _y, z) => !(x > pond.x0 && x < pond.x1 && z > pond.z0 && z < pond.z1) });
  pools.add(fr.wx(pond.x0, 0), fr.wz(0, pond.z0), fr.wx(pond.x1, 0), fr.wz(0, pond.z1), g + 0.35);
  for (let i = 0; i < 16; i++) {
    const x = Math.floor((pond.x0 + 0.5 + hash3(i, 1, 3, 73) * (pond.x1 - pond.x0 - 1)) * 2) / 2;
    const z = Math.floor((pond.z0 + 0.5 + hash3(i, 2, 3, 73) * (pond.z1 - pond.z0 - 1)) * 2) / 2;
    const flower = hash3(i, 3, 3, 73) < 0.4;
    b.box(x + 0.25, g + 0.45, z + 0.25, 0.5, flower ? 0.3 : 0.1, 0.5, flower ? pick(FLOWER_PINK, hash3(i, 4, 3, 73)) : pick(LEAF, hash3(i, 5, 3, 73)), 'mapLeaf', { src });
  }
  lamps.add(fr.world(pond.x1 + 0.5, g + 1.2, pond.z0 - 0.5), 0.45);
  lamps.add(fr.world(pond.x0 - 0.5, g + 1.2, pond.z1 + 0.5), 0.45);
  // Raised garden across the road.
  const onGarden = (x: number, z: number) => inPad(x, z) && sd(x, z) <= -CLEAR;
  const pool = { x0: 8, x1: 22, z0: 9, z1: 19 };
  const inPool = (x: number, z: number) => x > pool.x0 && x < pool.x1 && z > pool.z0 && z < pool.z1;
  m.fill(-ex, g, -ez, ex, g + 1, ez, TP.light, { src, keep: (x, _y, z) => onGarden(x, z) && !inPool(x, z) });
  m.paint(-ex, g, -ez, ex, g + 1, ez, GRASS, { src, mat: 'mapGrass', keep: (x, _y, z) => onGarden(x + 1, z) && onGarden(x - 1, z) && onGarden(x, z + 1) && onGarden(x, z - 1) && !inPool(x + 1, z) && !inPool(x - 1, z) && !inPool(x, z + 1) && !inPool(x, z - 1) });
  pools.add(fr.wx(pool.x0, 0), fr.wz(0, pool.z0), fr.wx(pool.x1, 0), fr.wz(0, pool.z1), g + 0.7);
  for (const [x, z] of [
    [pool.x0 + 0.5, pool.z0 + 0.5],
    [pool.x1 - 0.5, pool.z0 + 0.5],
    [pool.x0 + 0.5, pool.z1 - 0.5],
    [pool.x1 - 0.5, pool.z1 - 0.5],
  ])
    lamps.add(fr.world(x, g + 1.5, z), 0.45);
  // Flower beds: pink and orange, sparse, on the garden and the platform step.
  for (let x = -ex; x < ex; x += 0.5)
    for (let z = -ez; z < ez; z += 0.5) {
      const bed = (onGarden(x, z) && (z > pool.z1 + 0.5 || x > pool.x1 + 0.5) && onGarden(x + 1.5, z) && onGarden(x, z + 1.5) && onGarden(x - 1.5, z)) || (onStep(x, z) && Math.abs(x + 0.25 - axis) > 3 && onStep(x, z - 1));
      if (!bed || hash3(x * 2, z * 2, 5, 79) > 0.2) continue;
      const top = g + 1;
      const tones = hash3(x * 2, z * 2, 6, 79) < 0.6 ? FLOWER_PINK : FLOWER_ORANGE;
      b.box(x + 0.25, top + 0.25, z + 0.25, 0.5, 0.5, 0.5, pick(tones, hash3(x * 2, z * 2, 7, 79)), 'mapLeaf', { src });
    }
  // Small stupas and a few garden trees.
  for (const [x, z] of [
    [4.5, 20.5],
    [24.5, 5.5],
    [24.5, 20.5],
  ])
    if (onGarden(x, z) && onGarden(x - 1.5, z - 1.5)) stupa(d, x, z, g + 1, 4, src, TP);
  for (const [i, [x, z, h]] of [
    [0, 15, 8],
    [23, -1, 7],
    [14, 21, 6],
  ].entries())
    if (onGarden(x, z)) gardenTree(b, x + 0.5, g + 1, z + 0.5, h, 90 + i, i === 1 ? FLOWER_PINK : undefined);

  // ── Lower garden south-west of the pad ───────────────────────────────────
  // The overview looks at the temple across this ground: kept as an open
  // lawn (no jungle in the way) with a lotus pool that spills into the head
  // of the Terrace stream. Built only where the land is flat at pad height.
  const LG = { x0: -44, x1: -12, z0: ez, z1: ez + 20 };
  const flat = (x: number, z: number) => f.heightAt(fr.wx(x, z), fr.wz(x, z)) === g && f.waterAt(fr.wx(x, z), fr.wz(x, z)) === null;
  const lotus = { x0: -40, x1: -27, z0: ez + 8, z1: ez + 17 };
  let lotusOk = true;
  for (let x = lotus.x0 - 1; x <= lotus.x1 + 1 && lotusOk; x += 1)
    for (let z = lotus.z0 - 1; z <= lotus.z1 + 1 && lotusOk; z += 1) lotusOk = flat(x, z) && Math.abs(sd(x, z)) >= 5;
  if (lotusOk) {
    d.fill(lotus.x0 - 0.5, g, lotus.z0 - 0.5, lotus.x1 + 0.5, g + 0.5, lotus.z1 + 0.5, TP.light, { src, keep: (x, _y, z) => !(x > lotus.x0 && x < lotus.x1 && z > lotus.z0 && z < lotus.z1) });
    pools.add(fr.wx(lotus.x0, 0), fr.wz(0, lotus.z0), fr.wx(lotus.x1, 0), fr.wz(0, lotus.z1), g + 0.35);
    for (let i = 0; i < 22; i++) {
      const x = Math.floor((lotus.x0 + 0.5 + hash3(i, 1, 4, 83) * (lotus.x1 - lotus.x0 - 1)) * 2) / 2;
      const z = Math.floor((lotus.z0 + 0.5 + hash3(i, 2, 4, 83) * (lotus.z1 - lotus.z0 - 1)) * 2) / 2;
      const flower = hash3(i, 3, 4, 83) < 0.4;
      b.box(x + 0.25, g + 0.45, z + 0.25, 0.5, flower ? 0.3 : 0.1, 0.5, flower ? pick(FLOWER_PINK, hash3(i, 4, 4, 83)) : pick(LEAF, hash3(i, 5, 4, 83)), 'mapLeaf', { src });
    }
    for (const [x, z] of [
      [lotus.x0 - 0.5, lotus.z0 - 0.5],
      [lotus.x1 + 0.5, lotus.z0 - 0.5],
      [lotus.x0 - 0.5, lotus.z1 + 0.5],
    ])
      lamps.add(fr.world(x, g + 1.1, z), 0.45);
    // A spout to the stream's head, if it is just below the pool.
    const head = f.rivers.find((r) => r.name === 'Terrace stream')?.samples[0];
    const [slx, slz] = head ? fr.local(head.x, head.z) : [NaN, NaN];
    if (head && slx > lotus.x0 + 1 && slx < lotus.x1 - 1 && slz > lotus.z1 && slz - lotus.z1 < 6) {
      const cx = Math.round(slx);
      d.fill(cx - 1.5, g, lotus.z1, cx - 1, g + 0.5, slz - 1, TP.light, { src });
      d.fill(cx + 1, g, lotus.z1, cx + 1.5, g + 0.5, slz - 1, TP.light, { src });
      pools.add(fr.wx(cx - 1, 0), fr.wz(0, lotus.z1), fr.wx(cx + 1, 0), fr.wz(0, slz - 1), g + 0.35);
      pools.fall(fr.wx(cx - 1, 0), fr.wx(cx + 1, 0), fr.wz(0, slz - 1), head.level, g + 0.35);
    }
  }
  // Sparse flower beds on the lawn.
  for (let x = LG.x0; x < LG.x1; x += 0.5)
    for (let z = LG.z0 + 1; z < LG.z1; z += 0.5) {
      if (hash3(x * 2, z * 2, 8, 89) > 0.035 || !flat(x, z) || Math.abs(sd(x, z)) < 5) continue;
      if (x > lotus.x0 - 1.5 && x < lotus.x1 + 1.5 && z > lotus.z0 - 1.5 && z < lotus.z1 + 1.5) continue;
      const tones = hash3(x * 2, z * 2, 9, 89) < 0.6 ? FLOWER_PINK : FLOWER_ORANGE;
      b.box(x + 0.25, g + 0.25, z + 0.25, 0.5, 0.5, 0.5, pick(tones, hash3(x * 2, z * 2, 10, 89)), 'mapLeaf', { src });
    }

  m.commit();
  d.commit();

  // ── Into place ───────────────────────────────────────────────────────────
  const world = new VoxelBuilder();
  fr.place(b, world);
  for (const bx of world.boxes) bx.ry = undefined;
  grassOverPad(f, world, { x0: place.x - ex, z0: place.z - ez, x1: place.x + ex, z1: place.z + ez, y: g }, (x, z) => {
    const [lx, lz] = fr.local(x, z);
    return Math.abs(sd(lx, lz)) < 3.2 || onPlatform(lx, lz) || onStep(lx, lz) || onGarden(lx, lz) || (lx > pond.x0 - 1 && lx < pond.x1 + 1 && lz > pond.z0 - 1 && lz < pond.z1 + 1);
  });
  f.occupy(place.x - ex, place.z - ez, place.x + ex, place.z + ez);
  // The lower garden stays an open lawn (terrain grass, no trees).
  f.occupy(fr.wx(LG.x0, 0), fr.wz(0, LG.z0), fr.wx(LG.x1, 0), fr.wz(0, LG.z1));

  const object = new Group();
  object.name = `landmark:${place.id}`;
  object.add(buildVoxelMesh(world, { quality: ctx.quality === 'low' ? 'low' : 'medium', name: `landmark:${place.id}` }));
  const water = pools.build(`landmark:${place.id}:pools`);
  if (water) object.add(water);
  object.add(lamps.addLight(fr.world(axis, y0 + 5, E.z1 + 7), 1200, 50));
  for (const [l, name] of [
    [lamps, 'lamps'],
    [windows, 'windows'],
  ] as const) {
    const mesh = l.build(`landmark:${place.id}:${name}`);
    if (mesh) object.add(mesh);
  }
  return {
    name: `landmark:${place.id}`,
    object,
    blocks: world.boxes.length,
    update(fr: MapFrame) {
      lamps.update(fr.night, fr.t);
      windows.update(fr.night, fr.t);
    },
  };
}
