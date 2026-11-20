import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { Glow } from '../festival/_glow';
import { GLOW_MODE } from '../festival/_glow';
import type { Kit } from '../festival/_kit';
import type { HeightField } from '../heightfield';
import { LAKE_SHORE, LAKE_STAGE, onLakeShore } from './plan';
import { flag } from './_sqFlags';
import { champa, crown, flowerBed, type NyeTree } from './_sqGarden';
import { khmerLamp, LATERITE, PAVER, PAVER_LIGHT, POST_STONE, RING_STONE } from './_sqKit';
import { GOLD, lanternPole, LACQUER, pick, PLANK, stringLights, TIMBER, type Bodies, type LakeFrame } from './_lkKit';

/**
 * The lakeside terrace (AWP-35, the lake venue: lake.ts; where: plan.ts `LAKE_SHORE`) on the meadow over the great
 * lake's north-east shore, facing the floating stage across the shallows:
 *
 * - the paved terrace (the ellipse `LAKE_SHORE` and its landing down to the bank): 1 m sandstone pavers flush with the
 *   land, a laterite border fading into the grass, a pale way down the middle from the back to the jetty, a lotus
 *   medallion of gilt and dark stone at its heart; paths of pavers out to the lake trail (north) and the east shore
 *   trail (east), Khmer lamps where they meet the trails;
 * - the ghat: sandstone steps down the bank's 2 m drop to a paved apron on the sand and on down into the water, strip by
 *   strip along the shore (they follow its slant), laterite cheeks at its ends, a Khmer lamp at the water at each side;
 * - the jetty down the ghat's middle to the stage: teak planks on dark posts sloping gently from the terrace to the deck,
 *   red rails with gilt knobs, small flags of Cambodia on its posts, string lights along both rails;
 * - a low carved balustrade along the terrace's back (turned balusters, Khmer lamps on pedestals for newels), lamps on
 *   pedestals along its water side (the view over the stage stays open), flower beds, three flowering trees framing
 *   the view (the square's crape myrtle, pink trumpet tree and frangipani: `_sqGarden.ts`);
 * - tall lacquered lantern poles at the ghat's top corners, the stage's string lights fanning to them, and two tall
 *   flagpoles with big flags of Cambodia (three towers) beside them.
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
}

/** How far the pavers' tops stand over the land (m). */
const TOP = 0.08;
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

  // ── The terrace's floor: the ellipse and its landing down to the bank ─────
  const centre = fr.local(LAKE_SHORE.x, LAKE_SHORE.z);
  const landingTo = centre[1];
  const bankMid = bankAt(0).bank;
  const onLanding = (u: number, v: number) => Math.abs(u) <= GHAT + 1 && v <= landingTo && v >= bankAt(Math.round(u)).bank - 0.05;
  const paved = (x: number, z: number) => {
    if (onLakeShore(x, z)) return true;
    const [u, v] = fr.local(x, z);
    return onLanding(u, v);
  };
  const { x: cx, z: cz, rx, rz } = LAKE_SHORE;
  const x0 = Math.floor(Math.min(cx - rx * 1.15, fr.at(-GHAT - 1, bankMid)[0], fr.at(GHAT + 1, bankMid)[0]));
  const x1 = Math.ceil(Math.max(cx + rx * 1.15, fr.at(-GHAT - 1, bankMid)[0], fr.at(GHAT + 1, bankMid)[0]));
  const z0 = Math.floor(cz - rz * 1.15);
  const z1 = Math.ceil(Math.max(cz + rz * 1.15, fr.at(-GHAT - 1, bankMid)[1], fr.at(GHAT + 1, bankMid)[1]));
  let pavers = 0;
  for (let z = z0 + 0.5; z < z1; z += 1)
    for (let x = x0 + 0.5; x < x1; x += 1) {
      const c = field.index(x, z);
      if (c < 0 || wet(x, z) || land(x, z) < 7.5) continue;
      const e = Math.hypot((x - cx) / rx, (z - cz) / rz);
      const [u, v] = fr.local(x, z);
      const inside = paved(x, z);
      const h = hash3(x, z, 3, 411);
      let shade = 0.96 + 0.08 * hash3(x, z, 5, 411);
      let top = TOP;
      let color: number;
      // (the medallion round the terrace's heart: a pale disc, a gilt ring, a dark ring, lotus petals between)
      const r = Math.hypot(u - centre[0], v - centre[1]);
      const way = Math.abs(u) <= 1.6 && v <= centre[1] + rz && v >= bankMid - 0.5;
      if (!inside) {
        // Loose pavers past the border, fewer and lower the farther out (none on a trail).
        if (low || field.trail[c] === 2 || e > 1.16) continue;
        const out = Math.max(0, (e - 1) / 0.16);
        if (out >= 1 || h > 0.55 * (1 - out) * (1 - out)) continue;
        color = pick(hash3(x, z, 9, 411) < 0.5 ? PAVER : LATERITE, x, z, 7, 411);
        shade *= 0.88;
        top = 0.03 - 0.03 * out;
      } else if (r < 2.6) color = pick(PAVER_LIGHT, x, z, 2, 411);
      else if (Math.abs(r - 3.1) <= 0.5) {
        color = pick(GOLD, x, z, 8, 411);
        shade *= 0.92;
      } else if (Math.abs(r - 5.6) <= 0.5) color = pick(RING_STONE, x, z, 1, 411);
      else if (r < 5.1 && Math.cos(Math.atan2(v - centre[1], u - centre[0]) * 8) > 0.55) color = pick(PAVER_LIGHT, x, z, 4, 411);
      else if (way) color = pick(PAVER_LIGHT, x, z, 3, 411);
      else if (e > 0.93 && onLakeShore(x, z) && !onLanding(u, v)) {
        color = pick(LATERITE, x, z, 4, 411);
        shade *= 0.96;
      } else {
        color = pick(PAVER, x, z, 5, 411);
        if (h < 0.025) color = pick(LATERITE, x, z, 6, 411);
      }
      const g = land(x, z);
      b.box(x, g + top - 0.15, z, 1, 0.3, 1, color, 'mapStone', { src, shade });
      if (inside) field.occupy(x - 0.5, z - 0.5, x + 0.5, z + 0.5);
      pavers++;
    }

  // ── The paths to the trails: north to the lake trail, east to the east shore trail ──
  const path = (ax: number, az: number, bx: number, bz: number, seed: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    const ry = Math.atan2(dx, dz);
    // (its cells up to the trail; a land step on the way gets stairs of 0.33 m on its low side)
    const cells: { x: number; z: number; g: number }[] = [];
    for (let s = 0.5; s < len; s += 1) {
      const x = ax + dx * s;
      const z = az + dz * s;
      const c = field.index(x, z);
      if (c < 0 || field.trail[c] === 2 || wet(x, z)) break;
      cells.push({ x, z, g: land(x, z) });
    }
    for (const [i, { x, z, g }] of cells.entries()) {
      if (paved(x, z)) continue;
      let top = g;
      for (const [j, o] of cells.entries()) top = Math.max(top, o.g - 0.33 * Math.abs(j - i));
      b.box(x, (g - 0.3 + top + TOP) / 2, z, 2.4, top + TOP - (g - 0.3), 1.02, pick(PAVER_LIGHT, x, z, seed, 412), 'mapStone', { src, ry, shade: 0.95 + 0.07 * hash3(x, z, 2, 412) });
      for (const sd of [-1, 1]) b.box(x + dz * sd * 1.45, (g - 0.32 + top + TOP - 0.02) / 2, z - dx * sd * 1.45, 0.5, top + TOP - 0.02 - (g - 0.32), 1.02, pick(LATERITE, x, z, seed + sd, 412), 'mapStone', { src, ry, shade: 0.94 });
      field.occupy(x - 1.7, z - 1.7, x + 1.7, z + 1.7);
      pavers += 3;
    }
    // (a pair of lamps where it meets the trail)
    let ex = ax;
    let ez = az;
    for (let s = 0.5; s < len; s += 0.5) {
      const c = field.index(ax + dx * s, az + dz * s);
      if (c < 0 || field.trail[c] === 2) break;
      ex = ax + dx * s;
      ez = az + dz * s;
    }
    for (const sd of [-1, 1]) {
      const lx = ex + dz * sd * 2.2 - dx * 0.8;
      const lz = ez - dx * sd * 2.2 - dz * 0.8;
      if (field.trail[field.index(lx, lz)] === 2) continue;
      khmerLamp(b, lx, land(lx, lz), lz, 1.4, 70 + seed * 2 + sd, src, lamps, null, 2.2);
      field.occupy(lx - 0.5, lz - 0.5, lx + 0.5, lz + 0.5);
    }
  };
  path(cx, cz - rz * 0.98, cx, cz - rz - 22, 1);
  path(cx + rx * 0.98, cz, cx + rx + 40, cz, 2);

  // ── The rim: a balustrade along the back, lamps on pedestals all round ────
  const K = 0.97;
  const rim = (th: number): [number, number] => [cx + Math.cos(th) * rx * K, cz + Math.sin(th) * rz * K];
  const back = (th: number) => Math.cos(th) * fr.f[0] + Math.sin(th) * fr.f[1] > -0.2;
  const OPEN = [-Math.PI / 2, 0];
  const isOpen = (th: number) => OPEN.some((o) => Math.abs(Math.atan2(Math.sin(th - o), Math.cos(th - o))) < 0.16);
  const steps = 360;
  const posts: { x: number; z: number; th: number; back: boolean }[] = [];
  let run = 0;
  let prev = rim(0);
  const spacing = low ? 7 : 5;
  for (let i = 1; i <= steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    const p = rim(th);
    run += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
    if (isOpen(th)) {
      run = spacing * 0.6;
      continue;
    }
    const [u, v] = fr.local(p[0], p[1]);
    if (onLanding(u, v) || (v < centre[1] && Math.abs(u) <= GHAT + 2.5)) {
      run = spacing * 0.6;
      continue;
    }
    if (run >= spacing) {
      run = 0;
      posts.push({ x: p[0], z: p[1], th, back: back(th) });
    }
  }
  // (the openings' sides get a post each too: gateposts)
  for (const o of OPEN)
    for (const s of [-1, 1]) {
      const th = o + s * 0.19;
      const [x, z] = rim(th);
      posts.push({ x, z, th, back: true });
    }
  posts.sort((p, q) => ((p.th + Math.PI * 2) % (Math.PI * 2)) - ((q.th + Math.PI * 2) % (Math.PI * 2)));
  for (const [i, p] of posts.entries()) {
    const g = land(p.x, p.z) + TOP;
    b.box(p.x, g + 0.12, p.z, 0.92, 0.24, 0.92, pick(LATERITE, p.x, p.z, 1, 413), 'mapStone', { src });
    b.box(p.x, g + 0.42, p.z, 0.74, 0.36, 0.74, pick(POST_STONE, p.x, p.z, 2, 413), 'mapStone', { src });
    b.box(p.x, g + 0.64, p.z, 0.86, 0.08, 0.86, pick(POST_STONE, p.x, p.z, 3, 413), 'mapStone', { src, shade: 1.05 });
    khmerLamp(b, p.x, g + 0.6, p.z, 0.7, 80 + i, src, lamps, null, 2.4);
    field.occupy(p.x - 0.6, p.z - 0.6, p.x + 0.6, p.z + 0.6);
  }
  // The balustrade between neighbouring back posts.
  for (let i = 0; i + 1 < posts.length; i++) {
    const p = posts[i];
    const q = posts[i + 1];
    if (!p.back || !q.back) continue;
    const mid = (p.th + q.th) / 2;
    if (isOpen(mid) || q.th - p.th > (spacing * 1.7) / Math.min(rx, rz)) continue;
    const L = Math.hypot(q.x - p.x, q.z - p.z) - 0.8;
    if (L < 0.4) continue;
    const ry = Math.atan2(q.x - p.x, q.z - p.z) + Math.PI / 2;
    const mx = (p.x + q.x) / 2;
    const mz = (p.z + q.z) / 2;
    const g = land(mx, mz) + TOP;
    b.box(mx, g + 0.12, mz, L, 0.24, 0.5, pick(POST_STONE, mx, mz, 4, 413), 'mapStone', { src, ry, shade: 0.94 });
    b.box(mx, g + 0.76, mz, L, 0.1, 0.38, pick(POST_STONE, mx, mz, 5, 413), 'mapStone', { src, ry, shade: 1.04 });
    const every = low ? 0.62 : 0.42;
    const k = Math.max(1, Math.floor(L / every));
    const dx = (q.x - p.x) / (L + 0.8);
    const dz = (q.z - p.z) / (L + 0.8);
    for (let j = 0; j < k; j++) {
      const s = -L / 2 + ((j + 0.5) * L) / k;
      const x = mx + dx * s;
      const z = mz + dz * s;
      const tone = pick(POST_STONE, x, z, 6, 413);
      const sh = 0.96 + 0.06 * hash3(x, z, 7, 413);
      if (low) b.box(x, g + 0.48, z, 0.16, 0.48, 0.16, tone, 'mapStone', { src, ry, shade: sh });
      else {
        b.box(x, g + 0.33, z, 0.12, 0.18, 0.12, tone, 'mapStone', { src, ry, shade: sh });
        b.box(x, g + 0.48, z, 0.19, 0.12, 0.19, tone, 'mapStone', { src, ry, shade: sh * 1.04 });
        b.box(x, g + 0.63, z, 0.12, 0.18, 0.12, tone, 'mapStone', { src, ry, shade: sh });
      }
    }
    // A flower bed inside it.
    if (!low || i % 2 === 0) {
      const ix = cx + (mx - cx) * 0.93;
      const iz = cz + (mz - cz) * 0.93;
      flowerBed(b, field, ix - dx * L * 0.42, iz - dz * L * 0.42, ix + dx * L * 0.42, iz + dz * L * 0.42, 500 + i, low, src, 0.8);
    }
  }

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
      stringLights(kit, bodies, glow, { x: ax, y: p.y + 1.02, z: az }, { x: bx, y: q.y + 1.02, z: bz }, 0.18, low ? 0.9 : 0.5, 4);
    }
    // Small flags of Cambodia on slim poles at every other post.
    // (not on the last posts by the stage: from the jetty they would hide the board)
    for (let i = 1; i < ps.length; i += low ? 3 : 2) {
      const p = ps[i];
      if (p.v < LAKE_STAGE.d / 2 + 8) continue;
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

  // ── Lantern poles at the ghat's top corners and the terrace's sides; the stage's strings fan to them ──
  const poles: { x: number; y: number; z: number }[] = [];
  for (const [u, dv] of [
    [-(GHAT + 2.2), 1.6],
    [GHAT + 2.2, 1.6],
    [-(GHAT + 8), 7],
    [GHAT + 8, 7],
  ] as const) {
    const vb = bankAt(Math.sign(u) * GHAT).bank;
    const [x, z] = fr.at(u, vb + dv);
    if (wet(x, z) || land(x, z) < 7.5) continue;
    poles.push(lanternPole(b, kit, bodies, glow, x, land(x, z) + TOP, z, 9.5, yaw, src));
    field.occupy(x - 0.6, z - 0.6, x + 0.6, z + 0.6);
  }
  const every = low ? 1.9 : 0.95;
  // (anchors: banner poles W, E, the prasat, the towers W, E, the lintel's ends W, E: _lkStage.ts)
  const [banW, banE, pr, twW, twE, liW, liE] = anchors;
  const west = poles.filter((p) => fr.local(p.x, p.z)[0] < 0);
  const east = poles.filter((p) => fr.local(p.x, p.z)[0] > 0);
  for (const [a, list] of [
    [banW, west],
    [banE, east],
    [twW, west.slice(0, 1)],
    [twE, east.slice(0, 1)],
    [liW, west.slice(1)],
    [liE, east.slice(1)],
  ] as const)
    for (const p of list) if (a) stringLights(kit, bodies, glow, a, p, 2.2, every, low ? 2 : 3);
  if (pr) for (const p of [west[0], east[0]]) if (p) stringLights(kit, bodies, glow, pr, p, 3.2, every, low ? 2 : 3);
  // And round the terrace's sides: pole to pole.
  if (west.length > 1) stringLights(kit, bodies, glow, west[0], west[1], 1.2, every, 3);
  if (east.length > 1) stringLights(kit, bodies, glow, east[0], east[1], 1.2, every, 3);

  // ── Two tall flagpoles beside the ghat ────────────────────────────────────
  for (const s of [-1, 1]) {
    const vb = bankAt(s * GHAT).bank;
    const [x, z] = fr.at(s * (GHAT + 4.6), vb + 2.4);
    if (wet(x, z) || land(x, z) < 7.5) continue;
    const g = land(x, z) + TOP;
    for (const [k, [w, h]] of (
      [
        [1.7, 0.36],
        [1.25, 0.32],
        [0.8, 0.3],
      ] as const
    ).entries())
      b.box(x, g + [0, 0.36, 0.68][k] + h / 2 - (k ? 0 : 0.12), z, w, h + (k ? 0 : 0.24), w, k === 1 ? pick(POST_STONE, x, z, k, 418) : pick(LATERITE, x, z, k, 418), 'mapStone', { src });
    const H = 12;
    b.box(x, g + 0.98 + H / 2, z, 0.2, H, 0.2, 0xe6e2d8, 'mapStone', { src, shade: 1.02 });
    b.box(x, g + 0.98 + H + 0.1, z, 0.34, 0.2, 0.34, pick(GOLD, x, z, 5, 418), 'mapStone', { src, shade: 1.05 });
    b.box(x, g + 0.98 + H + 0.32, z, 0.18, 0.24, 0.18, pick(GOLD, x, z, 6, 418), 'mapStone', { src, shade: 1.1 });
    flag(kit, x, g + 0.98 + H - 0.15, z, DIR, 3.2, low, 60 + s, true);
    field.occupy(x - 1, z - 1, x + 1, z + 1);
  }

  // ── Flower beds along the landing's sides ─────────────────────────────────
  for (const s of [-1, 1]) {
    const vb = bankAt(s * GHAT).bank;
    const [ax, az] = fr.at(s * (GHAT + 1.8), vb + 3.4);
    const [bx, bz] = fr.at(s * (GHAT + 1.8), Math.min(landingTo - 6, vb + 12));
    if (!wet(ax, az) && !wet(bx, bz)) flowerBed(b, field, ax, az, bx, bz, 600 + s, low, src, 1.0);
  }

  // ── Three flowering trees framing the view from the terrace (and a fourth behind, not on low) ──
  const TREES: (NyeTree & { u: number; dv: number })[] = [
    { u: -17.5, dv: 6, x: 0, z: 0, kind: 'myrtle', bloom: 'purple', h: 10, r: 4.2, edge: true },
    { u: 17, dv: 5, x: 0, z: 0, kind: 'trumpet', bloom: 'pink', h: 9.5, r: 3.9, edge: true },
    { u: 11.5, dv: 14, x: 0, z: 0, kind: 'champa', bloom: 'white', h: 6.5, r: 3, edge: true },
    { u: -23, dv: 22, x: 0, z: 0, kind: 'trumpet', bloom: 'pink', h: 10, r: 4, edge: false, extra: true },
  ];
  let trees = 0;
  for (const [i, t] of TREES.entries()) {
    if (low && t.extra) continue;
    const vb = bankAt(Math.sign(t.u) * GHAT).bank;
    const [x, z] = fr.at(t.u, vb + t.dv);
    const c = field.index(x, z);
    if (c < 0 || wet(x, z) || land(x, z) < 7.5 || field.trail[c] === 2 || paved(x, z)) continue;
    const g = land(x, z);
    if (t.kind === 'champa') champa(b, kit, glow, field, t, x, g, z, 7300 + i, low, src);
    else crown(b, kit, blossom, glow, field, t, x, g, z, 7300 + i, low, src);
    field.occupy(x - t.r * 0.8, z - t.r * 0.8, x + t.r * 0.8, z + t.r * 0.8);
    trees++;
  }

  const blocks = b.boxes.length - b0;
  console.info(`[map] nye lake shore: ${blocks} blocks (pavers ${pavers}), ${posts.length} rim lamps, ${poles.length} poles, ${waterEdge.length} ghat strips, ${trees} trees`);
  return { blocks, waterEdge, flames, trees };
}
