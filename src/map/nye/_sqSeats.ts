import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { Glow } from '../festival/_glow';
import type { HeightField } from '../heightfield';
import { Site } from '../jungle/_campKit';
import type { Lamps } from '../landmarks/_prasatKit';
import { BENCHES, FIRES, SEAT_H, TABLE_H, TABLES, tableStools } from './plan';
import { TOP } from './_sqFloor';
import { khmerLamp, LAMP_HALO, LATERITE, pick, POST_STONE } from './_sqKit';

/**
 * Where people sit and gather on the festival square (AWP-35; spots in plan.ts `TABLES`, `BENCHES`, `FIRES`; the
 * crowd that uses them: people/_nyePlan.ts), as at a Cambodian night fair:
 *
 * - low tables by the food stalls, each with four little plastic stools in red and blue round it, bowls, a plate and
 *   the chilli sauce on it and a small lamp in a glass (its flame glows);
 * - low wooden benches for the elders, a Khmer lamp on its post at one end;
 * - fire bowls on short stone stems (a laterite foot, a bronze bowl, its fire), that children run round.
 *
 * The families' mats are the people part's (they come with the family). Everything in the square's builder (timber
 * `mapBark`, stools, stone and bronze `mapStone`, cloth and food `petal`): no draw of its own. Heights from the paving's
 * top (`_sqFloor.ts` `TOP` over the land): the seats `SEAT_H`, the tables `TABLE_H`.
 */

const WOOD = [0x8a5a3a, 0x7f5235, 0x93613f];
const TEAK = [0x6e4428, 0x7a4c2e, 0x664026];
const STOOL = [0xd8352a, 0x2a6ab8, 0xd8352a, 0x2f8a5a];
const BRONZE = [0x5c4430, 0x523c2a, 0x664c36];

export function buildSeats(b: VoxelBuilder, field: HeightField, lamps: Lamps, glow: Glow | null, low: boolean): number {
  const src = traceSource();
  const n0 = b.boxes.length;
  const floor = (x: number, z: number) => field.heightAt(x, z) + TOP;
  TABLES.forEach((t, i) => {
    const s = new Site(b, field, t.x, floor(t.x, t.z), t.z, t.yaw, src, 940 + i);
    table(s, lamps, glow, low);
    tableStools(t).forEach((st, k) => stool(b, st.x, floor(st.x, st.z), st.z, st.facing, STOOL[(i + k) % STOOL.length], src));
    field.occupy(t.x - 1.6, t.z - 1.6, t.x + 1.6, t.z + 1.6);
  });
  BENCHES.forEach((bn, i) => {
    const s = new Site(b, field, bn.x, floor(bn.x, bn.z), bn.z, bn.facing, src, 960 + i);
    bench(s, bn.len);
    const L = s.world(-(bn.len / 2 + 0.45), 0, -0.1);
    khmerLamp(b, L.x, field.heightAt(L.x, L.z), L.z, 1.15, 965 + i, src, lamps, glow, 2.0);
    field.occupy(bn.x - bn.len / 2 - 0.8, bn.z - bn.len / 2 - 0.8, bn.x + bn.len / 2 + 0.8, bn.z + bn.len / 2 + 0.8);
  });
  FIRES.forEach((f, i) => fireBowl(b, field, f.x, f.z, 980 + i, src, lamps, glow, low));
  return b.boxes.length - n0;
}

/** A low table (its long side along the site's x): a plank top on a dark frame, what is on it, a little lamp. */
function table(s: Site, lamps: Lamps, glow: Glow | null, low: boolean): void {
  const tone = (i: number) => pick(WOOD, i, s.seed, 1, s.seed);
  const H = TABLE_H;
  s.box(0, H - 0.03, 0, 1.6, 0.06, 1.0, tone(1), 'mapBark', { shade: 1.05 });
  s.box(0, H - 0.09, 0, 1.46, 0.06, 0.86, 0x3a2a20, 'mapBark');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) s.box(sx * 0.68, (H - 0.09) / 2, sz * 0.38, 0.07, H - 0.09, 0.07, 0x3a2a20, 'mapBark');
  // Bowls, a plate of food, the chilli sauce, the lamp in its glass.
  for (const [x, z] of [
    [-0.45, 0.28],
    [0.45, -0.28],
  ] as const)
    s.box(x, H + 0.05, z, 0.22, 0.1, 0.22, 0xf2efe8, 'mapStone');
  if (!low) {
    for (const [x, z] of [
      [-0.45, -0.28],
      [0.45, 0.28],
    ] as const)
      s.box(x, H + 0.05, z, 0.22, 0.1, 0.22, 0xf2efe8, 'mapStone');
    s.box(0, H + 0.02, 0.1, 0.42, 0.04, 0.3, 0xe8e4dc, 'mapStone');
    s.box(0, H + 0.06, 0.1, 0.3, 0.05, 0.18, hash3(s.seed, 1, 2, 3) < 0.5 ? 0xc8843a : 0xd8a040, 'petal');
    s.box(-0.14, H + 0.12, -0.2, 0.08, 0.24, 0.08, 0xc82a1a, 'petal');
  }
  s.box(0.16, H + 0.06, -0.16, 0.12, 0.13, 0.12, 0xe8dcc0, 'petal', { shade: 1.1 });
  const L = s.world(0.16, H + 0.17, -0.16);
  lamps.add([L.x, L.y, L.z], 0.08, 0.8);
  glow?.add(L.x, L.y, L.z, LAMP_HALO, 1.5, { level: 0.6 });
}

/** A low plastic stool (its seat `SEAT_H` over the floor at y): a square seat on a skirt, turned to `facing`. */
function stool(b: VoxelBuilder, x: number, y: number, z: number, facing: number, color: number, src: ReturnType<typeof traceSource>): void {
  b.box(x, y + SEAT_H - 0.025, z, 0.32, 0.05, 0.32, color, 'mapStone', { src, ry: facing, shade: 1.05 });
  b.box(x, y + (SEAT_H - 0.05) / 2, z, 0.27, SEAT_H - 0.05, 0.27, color, 'mapStone', { src, ry: facing, shade: 0.82 });
}

/** A low wooden bench along the site's x, `len` m: a plank seat on two trestles, a rail under it. */
function bench(s: Site, len: number): void {
  const tone = (i: number) => pick(TEAK, i, s.seed, 2, s.seed);
  s.box(0, SEAT_H - 0.03, 0, len, 0.06, 0.42, tone(1), 'mapBark', { shade: 1.06 });
  s.box(0, SEAT_H - 0.075, 0.17, len - 0.1, 0.04, 0.05, tone(2), 'mapBark', { shade: 0.9 });
  for (const sx of [-1, 1]) s.box(sx * (len / 2 - 0.2), (SEAT_H - 0.06) / 2, 0, 0.08, SEAT_H - 0.06, 0.36, tone(3), 'mapBark', { shade: 0.85 });
  s.box(0, 0.08, 0, len - 0.4, 0.05, 0.05, tone(4), 'mapBark', { shade: 0.8 });
}

/** A fire bowl on a short stone stem (its foot on the land at x, z): a laterite foot, the stem, a bronze bowl, its fire. */
function fireBowl(b: VoxelBuilder, field: HeightField, x: number, z: number, seed: number, src: ReturnType<typeof traceSource>, lamps: Lamps, glow: Glow | null, low: boolean): void {
  const y = field.heightAt(x, z);
  const st = (i: number) => pick(POST_STONE, x, z, i, seed);
  b.box(x, y + 0.08, z, 0.95, 0.3, 0.95, pick(LATERITE, x, z, 1, seed), 'mapStone', { src, shade: 0.95 });
  b.box(x, y + 0.26, z, 0.72, 0.1, 0.72, st(2), 'mapStone', { src });
  b.box(x, y + 0.42, z, 0.36, 0.28, 0.36, st(3), 'mapStone', { src });
  b.box(x, y + 0.6, z, 0.56, 0.1, 0.56, st(4), 'mapStone', { src, shade: 1.05 });
  b.box(x, y + 0.72, z, 0.8, 0.16, 0.8, pick(BRONZE, x, z, 5, seed), 'mapStone', { src, shade: 0.9 });
  b.box(x, y + 0.84, z, 0.96, 0.1, 0.96, pick(BRONZE, x, z, 6, seed), 'mapStone', { src, shade: 0.95 });
  if (!low) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) b.box(x + dx * 0.5, y + 0.84, z + dz * 0.5, dx ? 0.08 : 0.2, 0.14, dz ? 0.08 : 0.2, pick(BRONZE, dx, dz, 7, seed), 'mapStone', { src });
  const fy = y + 0.9;
  lamps.add([x, fy + 0.14, z], 0.55, 1.5);
  lamps.add([x + 0.06, fy + 0.42, z - 0.04], 0.3, 1.8);
  lamps.add([x - 0.08, fy + 0.62, z + 0.05], 0.14, 1.9);
  glow?.add(x, fy + 0.4, z, LAMP_HALO, low ? 3 : 3.8, { level: 1.15 });
  field.occupy(x - 0.6, z - 0.6, x + 0.6, z + 0.6);
}
