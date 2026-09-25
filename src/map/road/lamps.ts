import { Vector3 } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { HeightField } from '../heightfield';
import type { PlaceId } from '../types';
import type { GlowBlocks, Halo, LightPools } from './glow';
import { KIND, LIFT, ROAD_W, STEP, type RoadNetwork, type Station } from './line';
import { PAVE, sideInfo, WALL, WALL_V } from './stone';

/**
 * Lights along the road: small Khmer stone lamps every ~12 m (alternating
 * sides, on the parapet where the road is raised), each with a warm pool of
 * light on the paving at night, and a beacon at every place — a round stone
 * disc on the road with a ring of light and a glowing orb on a pedestal, like
 * the golden discs of the concept art.
 */

/** Lamp spacing along the road (m). */
const LAMP_EVERY = 12;
/** Height of a lamp's light above its foot (m). */
const LAMP_GLASS = 0.98;
/** Reach of a lamp's pool of light from its glass (m; as glow.ts's pool shader). */
const POOL_R = 5.2;
/** Lamp glass, beacon light (sRGB; the level scales them). */
export const LAMP_COLOR = [0xffc46a, 0xffb85a, 0xffcf7a];
export const BEACON_COLOR = 0xffd27a;

const pick = (list: readonly number[], r: number) => list[Math.min(list.length - 1, Math.floor(r * list.length))];

export function buildLamps(b: VoxelBuilder, net: RoadNetwork, field: HeightField, glass: GlowBlocks, halos: Halo[], pools: LightPools): number {
  const src = traceSource();
  let count = 0;
  net.roads.forEach((road, r) => {
    const st = road.stations;
    const near = net.beacons.filter((bc) => bc.road === r).map((bc) => st[bc.station]);
    let next = 6;
    let side = r % 2 ? 1 : -1;
    for (let i = 0; i < st.length; i++) {
      const s = st[i];
      const along = s.s - st[0].s;
      if (along < next || s.kind === KIND.gate) continue;
      if (along > st[st.length - 1].s - st[0].s - 4) break;
      if (near.some((bc) => Math.hypot(bc.x - s.x, bc.z - s.z) < 8)) continue;
      next = along + LAMP_EVERY;
      side = -side;
      const info = sideInfo(field, s, side);
      // On the wall where there is one, else on the ground beside the paving.
      const v = info.wall ? WALL_V : ROAD_W / 2 + 0.45;
      const x = s.x + s.tz * v * side;
      const z = s.z - s.tx * v * side;
      const base = info.wall ? info.top : Math.max(s.h + LIFT - 0.3, Math.min(field.heightAt(x, z), s.h + LIFT + 1));
      const ry = Math.atan2(s.tx, s.tz);
      const phase = hash3(r, i, 3, 41) * 6.28;
      lamp(b, x, base, z, ry, hash3(r, i, 1, 41), hash3(r, i, 2, 41), src);
      glass.add(x, base + LAMP_GLASS, z, 0.28, 0.28, 0.28, ry, pick(LAMP_COLOR, hash3(r, i, 1, 41)), phase);
      halos.push({ x, y: base + LAMP_GLASS, z, size: 3.4, kind: 0, phase });
      pool(pools, st, i, x, base + LAMP_GLASS, z, phase);
      field.occupy(x - 1.2, z - 1.2, x + 1.2, z + 1.2);
      count++;
    }
  });
  return count;
}

/**
 * A Khmer stone lamp, ≈ 1.5 m: a square post on a plinth, a little chamber
 * with a window of light on every side between four corner posts, and a roof
 * rising in tiers to a lotus bud.
 */
function lamp(b: VoxelBuilder, x: number, y: number, z: number, ry: number, tone: number, tone2: number, src: ReturnType<typeof traceSource>): void {
  const post = pick(WALL, tone);
  const cap = pick(PAVE, tone2);
  const at = (w: number, y0: number, y1: number, color: number, shade: number) => b.box(x, y + (y0 + y1) / 2, z, w, y1 - y0, w, color, 'mapStone', { ry, shade, src });
  at(0.56, 0, 0.14, post, 0.88);
  at(0.28, 0.14, 0.76, post, 0.9);
  at(0.44, 0.76, 0.84, cap, 0.95);
  // Corner posts of the chamber (the light shows between them).
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (const [u, w] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]) {
    const a = u * 0.14;
    const e = w * 0.14;
    b.box(x + a * c + e * s, y + 0.98, z - a * s + e * c, 0.08, 0.28, 0.08, cap, 'mapStone', { ry, shade: 0.9, src });
  }
  at(0.46, 1.12, 1.2, cap, 0.95);
  at(0.32, 1.2, 1.3, cap, 0.97);
  at(0.2, 1.3, 1.42, cap, 1);
  at(0.1, 1.42, 1.52, cap, 1.02);
}

/**
 * A lamp's pool of light: patches on the paving round it, one per station
 * (up and down the risers on steps), lit by the lamp in glow.ts's shader.
 */
function pool(pools: LightPools, st: Station[], i: number, lx: number, ly: number, lz: number, phase: number): void {
  const reach = Math.ceil(POOL_R / STEP) + 1;
  const j0 = Math.max(0, i - reach);
  const j1 = Math.min(st.length - 1, i + reach);
  // Edge between stations j and j + 1: its middle and the across direction there.
  const edge = (j: number): [number, number, number, number] => {
    const a = st[Math.max(j0, j)];
    const c = st[Math.min(j1, j + 1)];
    const ux = a.tz + c.tz;
    const uz = -(a.tx + c.tx);
    const l = Math.hypot(ux, uz) || 1;
    return [(a.x + c.x) / 2, (a.z + c.z) / 2, ux / l, uz / l];
  };
  const hw = ROAD_W / 2;
  for (let j = j0; j <= j1; j++) {
    const s = st[j];
    if (s.kind === KIND.gate || Math.hypot(s.x - lx, s.z - lz) > POOL_R + hw) continue;
    const y = s.h + LIFT + 0.05;
    const [ax, az, aux, auz] = j > j0 ? edge(j - 1) : [s.x, s.z, s.tz, -s.tx];
    const [cx, cz, cux, cuz] = j < j1 ? edge(j) : [s.x, s.z, s.tz, -s.tx];
    pools.quad(P[0].set(ax - aux * hw, y, az - auz * hw), P[1].set(ax + aux * hw, y, az + auz * hw), P[2].set(cx + cux * hw, y, cz + cuz * hw), P[3].set(cx - cux * hw, y, cz - cuz * hw), lx, ly, lz, phase);
    // A riser up to the next step (just in front of its face).
    const n = st[j + 1];
    if (j < j1 && n.kind !== KIND.gate && n.h !== s.h) {
      const lo = Math.min(s.h, n.h) + LIFT;
      const hi = Math.max(s.h, n.h) + LIFT + 0.05;
      const k = (n.h > s.h ? -0.04 : 0.04) / STEP;
      const ox = cx + (n.x - s.x) * k;
      const oz = cz + (n.z - s.z) * k;
      pools.quad(P[0].set(ox - cux * hw, lo, oz - cuz * hw), P[1].set(ox + cux * hw, lo, oz + cuz * hw), P[2].set(ox + cux * hw, hi, oz + cuz * hw), P[3].set(ox - cux * hw, hi, oz - cuz * hw), lx, ly, lz, phase);
    }
  }
}
const P = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];

/**
 * Beacons: a round disc of 0.5 m stones (a plinth under it), a ring of light
 * set into it, and an orb of light on a pedestal in the middle.
 */
export function buildBeacons(b: VoxelBuilder, net: RoadNetwork, field: HeightField, light: GlowBlocks, halos: Halo[]): BeaconLights[] {
  const src = traceSource();
  const spans: BeaconLights[] = [];
  net.beacons.forEach((bc, n) => {
    const from = light.list.length;
    const haloFrom = halos.length;
    const s = net.roads[bc.road].stations[bc.station];
    const ry = Math.atan2(s.tx, s.tz);
    const ux = s.tz;
    const uz = -s.tx;
    const at = (a: number, c: number): [number, number] => [s.x + ux * a + s.tx * c, s.z + uz * a + s.tz * c];
    const base = s.h + LIFT;
    // Keep trees off: the beacon should be seen from the overview.
    field.occupy(s.x - 7, s.z - 7, s.x + 7, s.z + 7);
    // Plinth: 1 m stones, a little proud of the paving.
    for (let i = -3; i < 3; i++)
      for (let k = -3; k < 3; k++) {
        const a = i + 0.5;
        const c = k + 0.5;
        if (Math.hypot(a, c) > 3.1) continue;
        const [x, z] = at(a, c);
        b.box(x, base - 0.25, z, 1, 0.7, 1, pick(WALL, hash3(n, i, k, 51)), 'mapStone', { ry, shade: 0.9, src });
      }
    // Disc: 0.5 m stones round a ring of light set in 0.25 m pieces (so it reads round).
    for (let i = -6; i < 6; i++)
      for (let k = -6; k < 6; k++) {
        const a = (i + 0.5) * STEP;
        const c = (k + 0.5) * STEP;
        const d = Math.hypot(a, c);
        if (d > 2.65) continue;
        const [x, z] = at(a, c);
        b.box(x, base + 0.225, z, STEP, 0.25, STEP, pick(PAVE, hash3(n, i, k, 52)), 'mapStone', { ry, shade: 0.97, src });
      }
    for (let i = -9; i < 9; i++)
      for (let k = -9; k < 9; k++) {
        const a = (i + 0.5) * 0.25;
        const c = (k + 0.5) * 0.25;
        const d = Math.hypot(a, c);
        if (d < 1.72 || d > 2.08) continue;
        const [x, z] = at(a, c);
        light.add(x, base + 0.34, z, 0.25, 0.08, 0.25, ry, BEACON_COLOR, n * 1.7);
      }
    // Pedestal and orb.
    b.box(s.x, base + 0.6, s.z, 1.1, 0.5, 1.1, pick(WALL, n / 6), 'mapStone', { ry, shade: 0.9, src });
    b.box(s.x, base + 0.95, s.z, 0.8, 0.2, 0.8, pick(PAVE, n / 6), 'mapStone', { ry, shade: 0.95, src });
    const oy = base + 1.55;
    light.add(s.x, oy, s.z, 0.95, 0.55, 0.55, ry, BEACON_COLOR, n * 1.7);
    light.add(s.x, oy, s.z, 0.55, 0.95, 0.55, ry, BEACON_COLOR, n * 1.7);
    light.add(s.x, oy, s.z, 0.55, 0.55, 0.95, ry, BEACON_COLOR, n * 1.7);
    light.add(s.x, oy, s.z, 0.8, 0.8, 0.8, ry, BEACON_COLOR, n * 1.7);
    halos.push({ x: s.x, y: oy, z: s.z, size: 11, kind: 1, phase: n * 1.7 });
    halos.push({ x: s.x, y: base + 0.4, z: s.z, size: 7, kind: 1, phase: n * 1.7 + 1 });
    spans.push({ id: bc.place.id, from, to: light.list.length, halos: [haloFrom, halos.length] });
  });
  return spans;
}

/** Which beacon glow blocks (`from` ≤ index < `to`) and halos belong to a place. */
export interface BeaconLights {
  id: PlaceId;
  from: number;
  to: number;
  /** Index range of its halos: [first, end). */
  halos: [number, number];
}
