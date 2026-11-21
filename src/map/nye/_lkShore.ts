import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { Glow } from '../festival/_glow';
import { GLOW_MODE } from '../festival/_glow';
import type { Kit } from '../festival/_kit';
import type { HeightField } from '../heightfield';
import { LAKE_SHORE, LAKE_STAGE, lakePlazaAt } from './plan';
import { flag } from './_sqFlags';
import { crown, type NyeTree } from './_sqGarden';
import { khmerLamp, LATERITE, PAVER, PAVER_LIGHT } from './_sqKit';
import { GOLD, lanternPole, LACQUER, pick, PLANK, stringLights, TIMBER, type Bodies, type LakeFrame } from './_lkKit';
import { buildPlaza, TOP, type Plaza } from './_lkPlaza';

/**
 * The lake venue on land (AWP-35, lake.ts; the owner's lake reference, assets/new-year-online/lake-reference.png):
 *
 * - the round plaza on the meadow (`_lkPlaza.ts`: the floor of concentric rings round the gold lotus, the ring wall
 *   and its fire pillars, lamp posts and string lights, the land gate with its naga and avenue, the salas, the food
 *   stalls, the flower beds and the lily pond), and its landing down to the bank;
 * - the ghat: sandstone steps down the bank's 2 m drop to a paved apron on the sand and on down into the water, strip by
 *   strip along the shore (they follow its slant), laterite cheeks at its ends, a Khmer lamp at the water at each side;
 * - the jetty down the ghat's middle to the stage: teak planks on dark posts sloping gently from the landing to the
 *   deck, red rails with gilt knobs, small flags of Cambodia on its posts, string lights along both rails (no halos:
 *   the bulbs are small bright points, `Bodies`);
 * - tall lacquered lantern poles at the ghat's top corners, the stage's string lights fanning to them and to the big
 *   fire pillars by the landing;
 * - pink and purple flowering trees framing the stage from the plaza (the Kulen square's crape myrtle and pink trumpet
 *   tree: `_sqGarden.ts`), behind the salas and by the bank.
 *
 * Everything solid is walked on (the pavers, the steps, the jetty; the walk map takes them), but nothing crosses the
 * lake trail or the east shore trail. Marks its ground with `field.occupy` (trees keep off).
 */

export interface LakeShore {
  blocks: number;
  /** The ghat's water edge, strip by strip (map x, z: candles are set afloat there). */
  waterEdge: [number, number][];
  /** Lamps' flames (map m), for the light pools and streaks. */
  flames: [number, number, number][];
  /** Built trees (for their halos' bounds). */
  trees: number;
  /** The plaza (its mandala, its naga). */
  plaza: Plaza;
}

/** The jetty's half width and the ghat's (m, across the stage's frame). */
const JETTY = 1.5;
const GHAT = 8.5;
/** The flags fly west, as on the square (the evening breeze from the east). */
const DIR = -Math.PI / 2;

export function buildLakeShore(field: HeightField, b: VoxelBuilder, kit: Kit, blossom: Kit, bodies: Bodies, glow: Glow, fr: LakeFrame, anchors: { x: number; y: number; z: number }[], low: boolean): LakeShore {
  const src = traceSource();
  const b0 = b.boxes.length;
  const yaw = fr.yaw;
  const flames: [number, number, number][] = [];
  const lamps = bodies.asLamps(glow, (p) => {
    flames.push(p);
    return p;
  });
  const land = (x: number, z: number) => field.heightAt(x, z);
  const wet = (x: number, z: number) => field.waterAt(x, z) !== null;
  /** A box turned square to the stage: its middle at the frame's (u, v), size across (u), up, along (v). */
  const sq = (u: number, v: number, y0: number, y1: number, su: number, sv: number, color: number, shade = 1) => {
    const [x, z] = fr.at(u, v);
    b.box(x, (y0 + y1) / 2, z, su, y1 - y0, sv, color, 'mapStone', { src, ry: yaw, shade });
  };

  // ── Where the bank is: per 1 m strip across, the 8 m land's edge and the water's ──
  const banks = new Map<number, { bank: number; water: number }>();
  const bankAt = (u: number): { bank: number; water: number } => {
    const known = banks.get(u);
    if (known) return known;
    let bank = 40;
    for (let v = 40; v > 0; v -= 0.25) {
      const [x, z] = fr.at(u, v);
      if (land(x, z) < 7.5 || wet(x, z)) {
        bank = v + 0.25;
        break;
      }
    }
    let water = bank;
    for (let v = bank; v > -10; v -= 0.25) {
      const [x, z] = fr.at(u, v);
      if (wet(x, z)) {
        water = v + 0.25;
        break;
      }
    }
    const out = { bank, water };
    banks.set(u, out);
    return out;
  };
  const top0 = land(LAKE_SHORE.x, LAKE_SHORE.z) + TOP;

  // ── The plaza and its landing down to the bank ──
  const bankMid = bankAt(0).bank;
  const plaza = buildPlaza({ field, b, kit, bodies, glow, lamps, fr, bankAt, landing: GHAT + 1, low, src });

  // ── The ghat: steps down the bank, the apron on the sand, steps into the water ──
  const waterEdge: [number, number][] = [];
  const stepRise = 0.25;
  const run0 = 0.5;
  for (let u = -GHAT + 0.5; u < GHAT; u += 1) {
    const { bank, water } = bankAt(u);
    if (bank - water > 14) continue;
    const under = Math.abs(u) < 1.2;
    let top = top0;
    let y = top0;
    let v = bank;
    let wetSteps = 0;
    // (cells of 0.5 m outward from the bank: equal tops are merged into one slab)
    let slabFrom = v;
    let slabTop = -1;
    const flush = (to: number) => {
      if (slabTop < 0 || under) return;
      const [x, z] = fr.at(u, (slabFrom + to) / 2);
      const base = Math.min(land(x, z), wet(x, z) ? fr.water - 1.2 : land(x, z)) - 0.3;
      sq(u, (slabFrom + to) / 2, base, slabTop, 1.0, Math.abs(slabFrom - to), Math.abs(slabFrom - to) > 0.6 ? pick(PAVER, u, to, 7, 414) : pick(PAVER_LIGHT, u, to, 8, 414), 0.94 + 0.08 * hash3(u, to, 9, 414));
    };
    for (let k = 0; k < 40; k++) {
      const vn = v - run0;
      const [x, z] = fr.at(u, v - run0 / 2);
      const isWet = wet(x, z);
      if (!isWet) top = Math.max(land(x, z) + TOP, y - stepRise);
      else {
        wetSteps++;
        top = Math.min(y, fr.water + 1.08) - 0.33;
        if (top < fr.water - 0.75) break;
      }
      y = top;
      if (Math.abs(top - slabTop) > 0.01) {
        flush(v);
        slabFrom = v;
        slabTop = top;
      }
      v = vn;
      if (isWet && wetSteps === 1) waterEdge.push(fr.at(u, v + run0));
    }
    flush(v);
    // (the strip's ground: no trees)
    const [ax, az] = fr.at(u, bank + 0.5);
    const [bx, bz] = fr.at(u, water - 1);
    field.occupy(Math.min(ax, bx) - 0.6, Math.min(az, bz) - 0.6, Math.max(ax, bx) + 0.6, Math.max(az, bz) + 0.6);
    void water;
  }
  // Laterite cheeks at its ends, stepping down with it; a lamp at the water each side.
  for (const s of [-1, 1]) {
    const u = s * (GHAT + 0.3);
    const { bank, water } = bankAt(s * (GHAT - 0.5));
    for (let v = bank; v > water - 1.5; v -= 1) {
      const [x, z] = fr.at(u, v - 0.5);
      const t = Math.max(fr.water + 1.6, top0 + 0.5 - ((bank - v) / 4) * 2);
      sq(u, v - 0.5, Math.min(land(x, z), fr.water) - 0.4, t, 0.6, 1.0, pick(LATERITE, u, v, 1, 415), 0.95);
    }
    const [lx, lz] = fr.at(s * (GHAT - 1.2), water + 0.9);
    khmerLamp(b, lx, fr.water + 1 + TOP, lz, 1.2, 90 + s, src, lamps, null, 2.4);
    const [wx, wz] = fr.at(s * (GHAT - 1.2), water - 0.8);
    glow.add(wx, fr.water, wz, 0xffa850, 10, { mode: GLOW_MODE.streak, level: 1.8, width: 0.4 });
  }

  // ── The jetty: from the terrace's top down to the deck, rails, flags, lights ──
  const jStart = bankMid + 0.6;
  const jEnd = LAKE_STAGE.d / 2 - 0.05;
  const plankRun = 0.5;
  const n = Math.ceil((jStart - jEnd) / plankRun);
  const yAt = (v: number) => fr.deck + (top0 - fr.deck) * Math.max(0, Math.min(1, (v - jEnd) / (jStart - jEnd)));
  for (let i = 0; i < n; i++) {
    const va = jEnd + i * plankRun;
    const vm = va + plankRun / 2;
    const y = yAt(vm);
    sq(0, vm, y - 0.1, y, JETTY * 2, plankRun - 0.03, pick(PLANK, i, 1, 1, 416), 0.94 + 0.1 * hash3(i, 2, 1, 416));
    // (stringers under its edges)
    for (const s of [-1, 1]) sq(s * (JETTY - 0.15), vm, y - 0.38, y - 0.1, 0.18, plankRun + 0.02, pick(TIMBER, i, s, 3, 416), 0.9);
  }
  const posts2: { u: number; v: number; y: number }[] = [];
  for (let v = jEnd + 0.3; v < jStart - 0.2; v += 2.0) {
    const y = yAt(v);
    for (const s of [-1, 1]) {
      const u = s * (JETTY + 0.08);
      const [x, z] = fr.at(u, v);
      const foot = wet(x, z) ? fr.water - 1.1 : land(x, z) - 0.2;
      // A pile down to the bed or the sand, the rail post over it.
      sq(u, v, foot, y + 0.95, 0.2, 0.2, pick(TIMBER, v, s, 4, 416));
      sq(u, v, y + 0.95, y + 1.05, 0.26, 0.26, pick(GOLD, v, s, 5, 416), 1.05);
      posts2.push({ u, v, y });
    }
    // (a cross brace under the planks)
    const [x, z] = fr.at(0, v);
    if (y - 0.4 > (wet(x, z) ? fr.water : land(x, z)) + 0.15) sq(0, v, y - 0.52, y - 0.4, JETTY * 2 + 0.2, 0.14, pick(TIMBER, v, 9, 6, 416), 0.85);
  }
  // Rails: lacquer between the posts, following the slope.
  for (const s of [-1, 1]) {
    const ps = posts2.filter((p) => Math.sign(p.u) === s);
    for (let i = 0; i + 1 < ps.length; i++) {
      const p = ps[i];
      const q = ps[i + 1];
      const pieces = 4;
      for (let k = 0; k < pieces; k++) {
        const t = (k + 0.5) / pieces;
        const v = p.v + (q.v - p.v) * t;
        const y = p.y + (q.y - p.y) * t;
        sq(p.u, v, y + 0.82, y + 0.9, 0.1, (q.v - p.v) / pieces + 0.02, pick(LACQUER, v, s, 7, 416));
      }
      // String lights along the rail, sagging between the posts.
      const [ax, az] = fr.at(p.u, p.v);
      const [bx, bz] = fr.at(q.u, q.v);
      stringLights(kit, bodies, glow, { x: ax, y: p.y + 1.02, z: az }, { x: bx, y: q.y + 1.02, z: bz }, 0.18, low ? 0.9 : 0.5, 0);
    }
    // Small flags of Cambodia on slim poles at every other post.
    // (only on the shore end: from the terrace, looking down the jetty, the farther ones stand in front of the board)
    for (let i = 1; i < ps.length; i += low ? 3 : 2) {
      const p = ps[i];
      if (p.v < LAKE_STAGE.d / 2 + 17) continue;
      const [x, z] = fr.at(p.u + s * 0.12, p.v);
      b.box(x, p.y + 1.05 + 1.0, z, 0.06, 2.0, 0.06, 0xe6e2d8, 'mapStone', { src });
      b.box(x, p.y + 3.1, z, 0.12, 0.1, 0.12, pick(GOLD, x, z, 3, 417), 'mapStone', { src, shade: 1.08 });
      flag(kit, x, p.y + 2.95, z, DIR, 0.9, low, 300 + i * 2 + s);
    }
  }
  {
    const [ax, az] = fr.at(-GHAT - 2, bankMid);
    const [bx, bz] = fr.at(GHAT + 2, jEnd);
    field.occupy(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
  }

  // ── Lantern poles at the ghat's top corners: the stage's strings fan to them, and its lintel's to the big fire pillars ──
  const poles: { x: number; y: number; z: number }[] = [];
  for (const s of [-1, 1]) {
    // (each at the first dry ground beside the landing's kerb, a little up from the bank; outward if a pillar is there)
    for (const du of [2.2, 3.4, 4.6]) {
      const u = s * (GHAT + du);
      const [x, z] = fr.at(u, bankAt(Math.round(u)).bank + 1.4);
      if (wet(x, z) || land(x, z) < 7.5 || plaza.front.some((p) => Math.hypot(p.x - x, p.z - z) < 1.6)) continue;
      poles.push(lanternPole(b, kit, bodies, glow, x, land(x, z) + TOP, z, 9.5, yaw, src));
      field.occupy(x - 0.6, z - 0.6, x + 0.6, z + 0.6);
      break;
    }
  }
  const every = low ? 1.9 : 0.95;
  // (anchors: banner poles W, E, the prasat, the towers W, E, the lintel's ends W, E: _lkStage.ts; W is −u)
  const [banW, banE, pr, twW, twE, liW, liE] = anchors;
  const west = poles.filter((p) => fr.local(p.x, p.z)[0] < 0);
  const east = poles.filter((p) => fr.local(p.x, p.z)[0] > 0);
  const [bigW, bigE] = plaza.front;
  for (const [a, list] of [
    [banW, west],
    [banE, east],
    [twW, west],
    [twE, east],
    [liW, bigW ? [{ ...bigW, y: bigW.y + 0.9 }] : west],
    [liE, bigE ? [{ ...bigE, y: bigE.y + 0.9 }] : east],
  ] as const)
    for (const p of list) if (a) stringLights(kit, bodies, glow, a, p, 2.2, every, 0);
  if (pr) for (const p of [west[0], east[0]]) if (p) stringLights(kit, bodies, glow, pr, p, 3.2, every, 0);

  // ── Flowering trees framing the stage from the plaza: either side by the bank, and behind the salas (not on low) ──
  const TREES: { phi: number; d: number; t: Omit<NyeTree, 'x' | 'z'> }[] = [
    // (out by the salas' near corners: from the crowd's eye height the lake shows between them and the stage)
    { phi: -50, d: 28.5, t: { kind: 'myrtle', bloom: 'purple', h: 10, r: 4.0, edge: true } },
    { phi: 50, d: 28.5, t: { kind: 'trumpet', bloom: 'pink', h: 9.5, r: 3.8, edge: true } },
    { phi: -80, d: 28.5, t: { kind: 'trumpet', bloom: 'pink', h: 10.5, r: 4.2, edge: false, extra: true } },
    { phi: 79, d: 28.5, t: { kind: 'myrtle', bloom: 'purple', h: 10, r: 4.0, edge: false, extra: true } },
  ];
  let trees = 0;
  for (const [i, { phi, d, t }] of TREES.entries()) {
    if (low && t.extra) continue;
    const [x, z] = lakePlazaAt((phi * Math.PI) / 180, d);
    const c = field.index(x, z);
    if (c < 0 || wet(x, z) || land(x, z) < 7.5 || field.trail[c] === 2 || plaza.paved(x, z)) continue;
    crown(b, kit, blossom, glow, field, { ...t, x, z }, x, land(x, z), z, 7300 + i, low, src);
    field.occupy(x - t.r * 0.8, z - t.r * 0.8, x + t.r * 0.8, z + t.r * 0.8);
    trees++;
  }

  const blocks = b.boxes.length - b0;
  console.info(`[map] nye lake shore: ${blocks} blocks (the plaza ${plaza.blocks}), ${poles.length} poles, ${waterEdge.length} ghat strips, ${trees} trees`);
  return { blocks, waterEdge, flames, trees, plaza };
}
