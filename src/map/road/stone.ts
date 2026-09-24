import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { HeightField } from '../heightfield';
import { KIND, LIFT, ROAD_W, STEP, type RoadLine, type Station } from './line';

/**
 * The road's stone: sandstone paving in rows across the road (0.5–1.5 m
 * stones, a few tones, some missing, grass creeping over the edges), steps
 * where the road climbs, side walls wherever the road stands above the land
 * (stairs and causeways get a low parapet), and small footbridges over the
 * rivers: a deck beam, parapets and a pier or two down to the river bed.
 */

// Colours sampled from the concept art's road (sunlit pale sandstone) and
// pulled a little darker, since the sun warms and brightens them.
export const PAVE = [0xd4bb96, 0xc9ae88, 0xdcc4a0, 0xbfa27e, 0xcfb38e];
export const WALL = [0xa68866, 0x9a7d5d, 0xae906d, 0x8f7456, 0xa38463];
const MOSSY = [0x8e8a5c, 0x7d7c52, 0x9a9462];
const GRASS = [0x6a9433, 0x5d8a2e, 0x78a23a, 0x557f2a, 0x83aa40];

const pick = (list: readonly number[], r: number) => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/** Across-road stone widths per row (sum = ROAD_W), picked per row. */
const ROWS: number[][] = [
  [1, 1, 1, 1],
  [1.5, 1, 1.5],
  [1, 1.5, 1.5],
  [1.5, 1.5, 1],
  [0.5, 1, 1, 1, 0.5],
  [1, 1, 1.5, 0.5],
  [0.5, 1.5, 1, 1],
  [1, 0.5, 1, 1.5],
  [1.5, 1, 1, 0.5],
];

/** Centre of the side walls, from the road's centre line (m). */
export const WALL_V = ROAD_W / 2 + 0.25;
const WALL_T = 0.5;

export interface SideInfo {
  /** Ground under the wall (m). */
  ground: number;
  /** A wall stands on this side. */
  wall: boolean;
  bottom: number;
  top: number;
}

/** The side (−1 or +1) of a station: is there a wall, and from where to where. */
export function sideInfo(field: HeightField, st: Station, side: number): SideInfo {
  const x = st.x + st.tz * WALL_V * side;
  const z = st.z - st.tx * WALL_V * side;
  const top = st.h + LIFT;
  const g = field.heightAt(x, z);
  const w = field.waterAt(x, z);
  const overWater = w !== null && w > g;
  if (st.kind === KIND.bridge) {
    // Over the water: a parapet on the deck beam; on the banks: down to the ground.
    return { ground: g, wall: true, bottom: overWater ? st.h - 1.25 : Math.min(g - 0.5, st.h - 1.25), top: top + 0.6 };
  }
  const raised = top - g;
  const wall = st.stair ? raised > 0.3 : raised > 0.6;
  return { ground: g, wall, bottom: g - 0.5, top: st.stair || raised > 2.2 ? top + 0.5 : top };
}

/** A block laid along the road: `across` × `height` × `along`, turned to the road. */
function laid(b: VoxelBuilder, x: number, y0: number, y1: number, z: number, across: number, along: number, ry: number, color: number, mat: 'mapStone' | 'mapGrass', shade: number, src: ReturnType<typeof traceSource>): void {
  b.box(x, (y0 + y1) / 2, z, across, y1 - y0, along, color, mat, { ry, shade, src });
}

export function buildRoadStone(b: VoxelBuilder, roads: RoadLine[], field: HeightField): void {
  roads.forEach((road, r) => {
    paving(b, road.stations, r);
    walls(b, road.stations, field, r);
    bridges(b, road.stations, field, r);
    for (const st of road.stations) {
      if (st.kind === KIND.gate) continue;
      const m = WALL_V + 0.6;
      field.occupy(st.x - m, st.z - m, st.x + m, st.z + m);
    }
  });
}

/** Rows of paving stones: 1 m rows where the road is flat, one row per step on stairs. */
function paving(b: VoxelBuilder, st: Station[], road: number): void {
  const src = traceSource();
  let row = 0;
  for (let i = 0; i < st.length; ) {
    const a = st[i];
    if (a.kind === KIND.gate) {
      i++;
      continue;
    }
    const two = i + 1 < st.length && !a.stair && !st[i + 1].stair && st[i + 1].h === a.h && st[i + 1].kind === a.kind;
    const c = two ? st[i + 1] : a;
    const x = (a.x + c.x) / 2;
    const z = (a.z + c.z) / 2;
    const tx = (a.tx + c.tx) / 2;
    const tz = (a.tz + c.tz) / 2;
    const ry = Math.atan2(tx, tz);
    const along = two ? 2 * STEP : STEP;
    const top = a.h + LIFT;
    const flatGround = !a.stair && a.kind === KIND.ground && !a.landing;
    const widths = ROWS[Math.floor(hash3(road, row, 3, 11) * ROWS.length)];
    let v = -ROAD_W / 2;
    widths.forEach((w, n) => {
      const vc = v + w / 2;
      v += w;
      const px = x + tz * vc;
      const pz = z - tx * vc;
      const h = hash3(road, row, n, 12);
      // A few stones are gone (never the middle, where the light runs): the
      // earth shows, sometimes a tuft of grass.
      if (flatGround && Math.abs(vc) - w / 2 > 0.3 && h < 0.05) {
        if (h < 0.025) laid(b, px, top - 0.45, top - 0.12, pz, w - 0.15, along - 0.15, ry, pick(GRASS, hash3(road, row, n, 13)), 'mapGrass', 1, src);
        return;
      }
      const mossy = hash3(road, row, n, 14) < (a.stair ? 0.03 : 0.07);
      const color = mossy ? pick(MOSSY, hash3(road, row, n, 15)) : pick(PAVE, h);
      const shade = 0.93 + hash3(road, row, n, 16) * 0.12;
      laid(b, px, top - 0.5, top, pz, w, along, ry, color, 'mapStone', shade, src);
    });
    // Grass creeping over the edges of the paving (where it lies on the ground).
    if (flatGround)
      for (const side of [-1, 1]) {
        const g = hash3(road, row, side, 17);
        if (g > 0.3) continue;
        const across = 0.35 + hash3(road, row, side, 18) * 0.45;
        const vc = side * (ROAD_W / 2 + 0.2 - across / 2);
        laid(b, x + tz * vc, top - 0.3, top + 0.07, z - tx * vc, across, along * (0.6 + g), ry, pick(GRASS, hash3(road, row, side, 19)), 'mapGrass', 0.95 + g * 0.2, src);
      }
    row++;
    i += two ? 2 : 1;
  }
}

/**
 * Side walls in 1 m sections: courses of 1 m near the top and 2 m lower down,
 * and a 0.5 m cap where one station of a section stands a step higher.
 */
function walls(b: VoxelBuilder, st: Station[], field: HeightField, road: number): void {
  const src = traceSource();
  for (const side of [-1, 1]) {
    const info = st.map((s) => (s.kind === KIND.gate ? null : sideInfo(field, s, side)));
    for (let i = 0; i < st.length; i += 2) {
      const ia = info[i];
      const j = Math.min(st.length - 1, i + 1);
      const ib = info[j];
      if (!ia?.wall && !ib?.wall) continue;
      // The section: the stations that have a wall.
      const idx = [i, j].filter((k, n) => (n === 0 || k !== i) && info[k]?.wall);
      const ends = idx.map((k) => st[k]);
      const x = ends.reduce((sum, s) => sum + s.x, 0) / ends.length;
      const z = ends.reduce((sum, s) => sum + s.z, 0) / ends.length;
      const tx = ends.reduce((sum, s) => sum + s.tx, 0) / ends.length;
      const tz = ends.reduce((sum, s) => sum + s.tz, 0) / ends.length;
      const ry = Math.atan2(tx, tz);
      const px = x + tz * WALL_V * side;
      const pz = z - tx * WALL_V * side;
      const along = ends.length * STEP;
      const bottom = Math.min(...idx.map((k) => info[k]!.bottom));
      const tops = idx.map((k) => info[k]!.top);
      const common = Math.min(...tops);
      // Courses, aligned to whole metres so neighbouring sections line up.
      let y = bottom;
      let c = 0;
      while (y < common - 0.05) {
        const deep = common - y > 3;
        let next = deep ? Math.floor(y / 2) * 2 + 2 : Math.floor(y) + 1;
        if (next - y < 0.3) next += deep ? 2 : 1;
        if (common - next < 0.3) next = common;
        const color = pick(WALL, hash3(road * 7 + side, i, c, 21));
        laid(b, px, y, next, pz, WALL_T, along, ry, color, 'mapStone', 0.9 + hash3(road, i, c, 22) * 0.12, src);
        y = next;
        c++;
      }
      // Caps on the higher station of a stepped section.
      if (idx.length === 2 && tops[0] !== tops[1]) {
        const k = tops[0] > tops[1] ? 0 : 1;
        const s = st[idx[k]];
        const cx = s.x + s.tz * WALL_V * side;
        const cz = s.z - s.tx * WALL_V * side;
        laid(b, cx, common, tops[k], cz, WALL_T, STEP, ry, pick(WALL, hash3(road, idx[k], side, 23)), 'mapStone', 0.95, src);
      }
    }
  }
}

/** Footbridges: a deck beam under the paving and piers down to the river bed. */
function bridges(b: VoxelBuilder, st: Station[], field: HeightField, road: number): void {
  const src = traceSource();
  for (let i = 0; i < st.length; i++) {
    if (st[i].kind !== KIND.bridge || !st[i].wet) continue;
    let e = i;
    while (e + 1 < st.length && st[e + 1].kind === KIND.bridge && st[e + 1].wet) e++;
    // Deck beam, a metre deep, under the paving.
    for (let k = i; k <= e; k += 2) {
      const a = st[k];
      const c = st[Math.min(e, k + 1)];
      const ry = Math.atan2(a.tx + c.tx, a.tz + c.tz);
      const along = c === a ? STEP : 2 * STEP;
      laid(b, (a.x + c.x) / 2, a.h - 1.25, a.h - 0.25, (a.z + c.z) / 2, ROAD_W, along, ry, pick(WALL, hash3(road, k, 0, 31)), 'mapStone', 0.85, src);
    }
    // Piers, evenly over the span (spans under 6 m need none).
    const span = (e - i + 1) * STEP;
    const piers = Math.floor(span / 6);
    for (let p = 1; p <= piers; p++) {
      const s = st[i + Math.round(((e - i) * p) / (piers + 1))];
      const bed = field.heightAt(s.x, s.z);
      const ry = Math.atan2(s.tx, s.tz);
      laid(b, s.x, bed - 0.5, s.h - 1.25, s.z, ROAD_W + 1.1, 1.4, ry, pick(WALL, hash3(road, i, p, 32)), 'mapStone', 0.8, src);
    }
    i = e;
  }
}
