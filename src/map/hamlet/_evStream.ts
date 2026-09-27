import { traceSource } from '../../feedback/sourceTrace';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { PathSample } from '../heightfield';
import { Frame } from '../landmarks/_prasatKit';
import { BAMBOO, DECK, lantern, Local, POST, skiff, tone, traps } from '../village/_kit';
import { frameGlow, kramaLine, type EvEnv } from './_evKit';
import { EV_BRIDGE_AT, EV_WASH_AT } from './_evSpots';

/**
 * The Kulen stream where the village street crosses it: a wooden foot
 * bridge from the village's bank top to the far bank, its plank deck in a
 * gentle arch high over the water (a boat passes under), on log stringers
 * and pairs of posts that stand clear of the boat's channel, bamboo rails,
 * a lamp at its village end; upstream, stone washing steps down the bank
 * face (laterite and sandstone blocks) to a plank landing at the water
 * where the village washes its clothes; a boat pulled up on the sand, a
 * fish trap, kramas drying on a line.
 * Solid in the walk map (deck, rails, steps, landing); the stream runs on
 * under them. Everything is read from the land and the water at build time
 * (the street's samples, `field.rivers`), so it follows a reshaped stream.
 */

/** The bridge built (its ends and deck height) for the people's crossing, or null. */
export interface EvBridge {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Deck top at a fraction `t` (0 at a, 1 at b) of the way. */
  deckAt(t: number): number;
}

export function evStream(env: EvEnv): EvBridge | null {
  const bridge = footBridge(env);
  washSteps(env);
  return bridge;
}

/** The foot bridge on the street's wet run, or null when the street does not cross water. */
function footBridge(env: EvEnv): EvBridge | null {
  const src = traceSource();
  const field = env.field;
  const street = field.trails.find((t) => t.name === 'east village road');
  if (!street) return null;
  const s = street.samples;
  // The wet run inside the village's reach (east of the square).
  let i0 = -1;
  let i1 = -1;
  for (let i = 0; i < s.length; i++) {
    if (!s[i].wet || s[i].x < 380) continue;
    if (i0 < 0) i0 = i;
    i1 = i;
    if (i + 1 < s.length && !s[i + 1].wet) break;
  }
  if (i0 < 0) return null;
  const mid = s[(i0 + i1) >> 1];
  const level = field.waterAt(mid.x, mid.z) ?? mid.y;
  // Out to the bank tops: the village's side high (no step down onto the deck), the far bank a little lower.
  const g = (p: PathSample) => field.heightAt(p.x, p.z);
  let a = i0;
  while (a > 0 && (s[a].wet || g(s[a]) < level + 4.5) && i0 - a < 16) a--;
  // (the far bank: its top if there is one within reach, a levee like the village's bank; else the first dry ground well over the water)
  let b = i1;
  while (b < s.length - 1 && (s[b].wet || g(s[b]) < level + 4.5) && b - i1 < 16) b++;
  if (g(s[b]) < level + 4.5) {
    b = i1;
    while (b < s.length - 1 && (s[b].wet || g(s[b]) < level + 2.5) && b - i1 < 16) b++;
  }
  const A = s[a];
  const B = s[b];
  const len = Math.hypot(B.x - A.x, B.z - A.z);
  const fr = new Frame(A.x, 0, A.z, Math.atan2(B.x - A.x, B.z - A.z));
  const lb = new VoxelBuilder();
  const L = new Local(lb, src, 2111);
  const ya = g(A);
  const yb = g(B);
  const arch = 0.35;
  const deckAt = (t: number) => ya + (yb - ya) * t + arch * Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
  const hw = 1.2;
  // Where the boat's channel is under it (keep its posts out of it).
  const river = field.rivers.find((r) => r.samples.some((q) => Math.hypot(q.x - mid.x, q.z - mid.z) < 6));
  let chan = 3.5;
  if (river) {
    let best = river.samples[0];
    for (const q of river.samples) if (Math.hypot(q.x - mid.x, q.z - mid.z) < Math.hypot(best.x - mid.x, best.z - mid.z)) best = q;
    chan = best.w / 2 + 0.6;
  }
  const cz = fr.local(mid.x, mid.z)[1];
  // The deck: planks across, 0.3 m apart, each at its own height (the arch); log stringers under its edges.
  for (let z = 0, i = 0; z < len - 0.05; z += 0.3, i++) {
    const y = deckAt((z + 0.15) / len);
    L.span(-hw, y - 0.1, z, hw, y, Math.min(len, z + 0.3) - 0.03, tone(DECK, L.r(i, 1)), 'mapBark', 0.93 + L.r(i, 2) * 0.1);
  }
  for (let z = 0; z < len - 0.05; z += 1.2) {
    const y = deckAt((z + 0.6) / len);
    for (const x of [-hw + 0.2, hw - 0.2]) L.span(x - 0.16, y - 0.42, z, x + 0.16, y - 0.1, Math.min(len, z + 1.2), tone(POST, L.r(z, x, 3)), 'mapBark', 0.9);
  }
  // Posts in pairs, a cross beam on each pair; none in the channel.
  for (let z = 1.2; z < len - 0.6; z += 2.6) {
    if (Math.abs(z - cz) < chan) continue;
    const y = deckAt(z / len);
    for (const x of [-hw + 0.2, hw - 0.2]) {
      const gx = fr.wx(x, z);
      const gz = fr.wz(x, z);
      const foot = Math.min(field.heightAt(gx, gz), (field.waterAt(gx, gz) ?? 99) - 1.2);
      if (y - 0.42 - foot < 0.3) continue;
      L.span(x - 0.15, foot - 0.3, z - 0.15, x + 0.15, y - 0.42, z + 0.15, tone(POST, L.r(z, x, 4)), 'mapBark');
    }
    L.span(-hw - 0.1, y - 0.62, z - 0.14, hw + 0.1, y - 0.42, z + 0.14, tone(POST, 0.5), 'mapBark');
  }
  // The two posts either side of the channel carry the span over the water: a little thicker, braced.
  for (const side of [-1, 1]) {
    const z = cz + side * chan;
    if (z < 0.5 || z > len - 0.5) continue;
    const y = deckAt(z / len);
    for (const x of [-hw + 0.2, hw - 0.2]) {
      const foot = Math.min(field.heightAt(fr.wx(x, z), fr.wz(x, z)), level - 1.1);
      L.span(x - 0.19, foot - 0.3, z - 0.19, x + 0.19, y - 0.42, z + 0.19, tone(POST, L.r(z, x, 5) * 0.5), 'mapBark');
    }
    L.span(-hw - 0.15, y - 0.66, z - 0.16, hw + 0.15, y - 0.42, z + 0.16, tone(POST, 0.3), 'mapBark');
  }
  // Bamboo rails: posts every 1.5 m, a top rail and a middle one (level runs between the posts).
  const railH = 1.05;
  for (const x of [-hw, hw]) {
    for (let z = 0.1; z < len; z += 1.5) {
      const y = deckAt(z / len);
      L.box(x, y + railH / 2, z, 0.12, railH, 0.12, tone(BAMBOO, L.r(z, x, 6)), 'mapBark');
    }
    for (let z = 0.1; z < len - 0.2; z += 1.5) {
      const e = Math.min(len, z + 1.5);
      const y = deckAt((z + e) / 2 / len);
      L.span(x - 0.05, y + railH - 0.08, z, x + 0.05, y + railH, e, tone(BAMBOO, L.r(z, 7)), 'mapBark');
      L.span(x - 0.04, y + 0.5, z, x + 0.04, y + 0.56, e, tone(BAMBOO, L.r(z, 8)), 'mapBark');
    }
  }
  // A lamp on a post at the village end.
  const glow = frameGlow(env, fr, 211);
  L.span(-hw - 0.45, ya - 0.2, 0.2, -hw - 0.25, ya + 2.7, 0.4, tone(POST, 0.1), 'mapBark');
  L.span(-hw - 0.45, ya + 2.6, 0.2, -hw + 0.3, ya + 2.7, 0.4, tone(POST, 0.1), 'mapBark');
  lantern(L, -hw + 0.1, ya + 2.15, 0.3, glow);
  fr.place(lb, env.world);
  env.field.occupy(Math.min(A.x, B.x) - 2, Math.min(A.z, B.z) - 2, Math.max(A.x, B.x) + 2, Math.max(A.z, B.z) + 2);
  Object.assign(EV_BRIDGE_AT, { built: true, ax: A.x, az: A.z, bx: B.x, bz: B.z, ya, yb, arch, half: hw });
  return { ax: A.x, az: A.z, bx: B.x, bz: B.z, deckAt };
}

/**
 * The washing steps: stone steps down the bank face (along it, on the sand
 * strip under the village's bank), from a little landing at the top to a
 * plank landing over the water; washing on a line on the bank top, a boat
 * pulled up on the sand, a fish trap by the bank.
 */
function washSteps(env: EvEnv): void {
  const src = traceSource();
  const field = env.field;
  const W = EV_WASH_AT;
  // The bank's lip: going east from the bank top, the first cell well below it.
  const top = field.heightAt(W.x - 4, W.z);
  let lip = W.x - 4;
  while (lip < W.x + 8 && field.heightAt(lip, W.z) > top - 1 && field.waterAt(lip, W.z) === null) lip += 0.5;
  let wet = lip;
  while (wet < lip + 8 && field.waterAt(wet, W.z) === null) wet += 0.5;
  const level = field.waterAt(wet + 0.5, W.z) ?? top - 5;
  const sand = field.heightAt(lip + 0.5, W.z);
  const lb = new VoxelBuilder();
  const L = new Local(lb, src, 2131);
  // (laterite and sandstone blocks, warm and worn)
  const stone = [0xa87858, 0x9a6c4e, 0xb48a68, 0x92705a, 0xa89a82];
  const x0 = lip + 0.05;
  const x1 = Math.min(wet - 0.1, lip + 1.7);
  // The top landing, reaching back onto the bank top.
  L.span(lip - 0.8, sand - 0.2, W.z, x1, top, W.z + 1.3, tone(stone, 0.2), 'mapStone');
  // Steps down (north), each a solid block from the sand.
  const n = Math.max(1, Math.round((top - sand) / 0.5));
  const rise = (top - sand) / n;
  for (let i = 1; i <= n; i++) {
    const z = W.z - i * 0.5;
    L.span(x0, sand - 0.2, z, x1, top - i * rise, z + 0.5, tone(stone, L.r(i, 1)), 'mapStone', 0.95 + (i % 2) * 0.06);
  }
  // A low kerb along the steps' stream side, a step lower each tread.
  for (let i = 1; i <= n; i++) {
    const z = W.z - i * 0.5;
    L.span(x1, sand - 0.2, z, x1 + 0.16, top - i * rise + 0.12, z + 0.5, tone(stone, L.r(i, 2)), 'mapStone', 0.88);
  }
  // The landing over the water on posts, a step down from the last tread.
  const lz1 = W.z - n * 0.5;
  const lz0 = lz1 - 1.8;
  const ly = level + 0.42;
  for (let x = wet - 0.6, i = 0; x < wet + 1.5; x += 0.5, i++) L.span(x, ly - 0.1, lz0, x + 0.5, ly, lz1, tone(DECK, L.r(i, 3)), 'mapBark');
  for (const [x, z] of [
    [wet + 1.3, lz0 + 0.2],
    [wet + 1.3, lz1 - 0.2],
  ])
    L.span(x - 0.1, level - 1.3, z - 0.1, x + 0.1, ly - 0.1, z + 0.1, tone(POST, 0.4), 'mapBark');
  L.span(x0, sand - 0.2, lz0, wet - 0.6, sand + 0.05, lz1, tone(stone, 0.5), 'mapStone');
  // Washing basins on the landing (aluminium), a bar of soap, a bucket.
  L.box(wet + 0.2, ly + 0.1, lz0 + 0.5, 0.6, 0.18, 0.6, 0xb8bcc0, 'mapStone');
  L.box(wet + 0.9, ly + 0.14, lz1 - 0.4, 0.34, 0.28, 0.34, 0x3a8a5a, 'petal');
  // Washing on a line on the bank top by the steps.
  for (const z of [W.z + 2.2, W.z + 7]) L.box(lip - 1.6, top + 1.1, z, 0.1, 2.2, 0.1, tone(BAMBOO, L.r(z, 4)), 'mapBark');
  kramaLine(L, lip - 1.6, W.z + 2.2, lip - 1.6, W.z + 7, top + 2.05);
  // A boat pulled up on the sand further up, a fish trap on a pole at the water's edge.
  const bb = new VoxelBuilder();
  skiff(new Local(bb, src, 2133), 0, field.heightAt(lip + 1, lz0 - 5.5) + 0.12, 0, 3.8, 3);
  // (along the sand strip: turned a quarter, so it lies north–south)
  new Frame(lip + 1.0, 0, lz0 - 5.5, Math.PI / 2 + 0.06).place(bb, lb);
  traps(L, lip + 0.3, sand, lz0 - 2.2, 2);
  L.box(wet + 0.4, level + 0.6, lz0 - 9, 0.1, 2.2, 0.1, tone(BAMBOO, 0.3), 'mapBark');
  L.box(wet + 0.6, level + 0.1, lz0 - 9, 0.5, 0.6, 1.1, tone(BAMBOO, 0.7), 'mapBark', 0.85);
  env.world.append(lb);
  env.field.occupy(lip - 3, lz0 - 11, wet + 2, W.z + 8);
  // Where the washing is done: kneeling on the landing at the water, facing it.
  W.landing.x = wet + 0.55;
  W.landing.y = ly;
  W.landing.z = (lz0 + lz1) / 2;
  W.landing.yaw = Math.PI / 2;
  W.sand.x = lip + 1.0;
  W.sand.y = sand;
  W.sand.z = lz0 - 3.4;
  W.top.x = lip - 1;
  W.top.y = top;
  W.top.z = W.z + 0.6;
  W.foot.x = (x0 + x1) / 2;
  W.foot.y = sand + rise;
  W.foot.z = lz1 + 0.25;
}
