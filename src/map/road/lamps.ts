import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { HeightField } from '../heightfield';
import type { PlaceId } from '../types';
import type { GlowBlocks, Halo } from './glow';
import { KIND, LIFT, ROAD_W, STEP, type RoadNetwork } from './line';
import { PAVE, sideInfo, WALL, WALL_V } from './stone';

/**
 * Lights along the road: stone lanterns every ~25 m (alternating sides, on the
 * parapet where the road is raised) and a beacon at every place — a round
 * stone disc on the road with a ring of light and a glowing orb on a pedestal,
 * like the golden discs of the concept art.
 */

/** Lantern spacing (m). */
const LANTERN_EVERY = 25;
/** Lantern glass, beacon light (sRGB; the level scales them). */
export const LAMP_COLOR = [0xffc46a, 0xffb85a, 0xffcf7a];
export const BEACON_COLOR = 0xffd27a;

const pick = (list: readonly number[], r: number) => list[Math.min(list.length - 1, Math.floor(r * list.length))];

export function buildLanterns(b: VoxelBuilder, net: RoadNetwork, field: HeightField, glass: GlowBlocks, halos: Halo[]): number {
  const src = traceSource();
  let count = 0;
  net.roads.forEach((road, r) => {
    const st = road.stations;
    const near = net.beacons.filter((bc) => bc.road === r).map((bc) => st[bc.station]);
    let next = 10;
    let side = r % 2 ? 1 : -1;
    for (let i = 0; i < st.length; i++) {
      const s = st[i];
      const along = s.s - st[0].s;
      if (along < next || s.kind === KIND.gate) continue;
      if (along > st[st.length - 1].s - st[0].s - 6) break;
      if (near.some((bc) => Math.hypot(bc.x - s.x, bc.z - s.z) < 9)) continue;
      next = along + LANTERN_EVERY;
      side = -side;
      const info = sideInfo(field, s, side);
      // On the wall where there is one, else on the ground beside the paving.
      const v = info.wall ? WALL_V : ROAD_W / 2 + 0.55;
      const x = s.x + s.tz * v * side;
      const z = s.z - s.tx * v * side;
      const base = info.wall ? info.top : Math.max(s.h + LIFT - 0.3, Math.min(field.heightAt(x, z), s.h + LIFT + 1));
      const ry = Math.atan2(s.tx, s.tz);
      const tone = hash3(r, i, 1, 41);
      b.box(x, base + 0.1, z, 0.6, 0.2, 0.6, pick(WALL, tone), 'mapStone', { ry, shade: 0.9, src });
      b.box(x, base + 0.6, z, 0.34, 0.8, 0.34, pick(WALL, hash3(r, i, 2, 41)), 'mapStone', { ry, shade: 0.85, src });
      glass.add(x, base + 1.22, z, 0.44, 0.44, 0.44, ry, pick(LAMP_COLOR, tone), hash3(r, i, 3, 41) * 6.28);
      b.box(x, base + 1.53, z, 0.7, 0.18, 0.7, pick(PAVE, tone), 'mapStone', { ry, shade: 0.9, src });
      b.box(x, base + 1.7, z, 0.22, 0.16, 0.22, pick(PAVE, tone), 'mapStone', { ry, shade: 0.9, src });
      halos.push({ x, y: base + 1.22, z, size: 4.2, kind: 0, phase: hash3(r, i, 3, 41) * 6.28 });
      field.occupy(x - 1.5, z - 1.5, x + 1.5, z + 1.5);
      count++;
    }
  });
  return count;
}

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
