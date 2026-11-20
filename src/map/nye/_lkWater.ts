import { hash3 } from '../../voxel/random';
import type { Glow } from '../festival/_glow';
import { perPeriod, type Kit } from '../festival/_kit';
import type { HeightField } from '../heightfield';
import { LAKE_STAGE } from './plan';
import { candle, lilyPad, lotus, type Drift } from './_sqGarden';
import { boat, type LakeFrame } from './_lkKit';

/**
 * On the water round the lake stage (AWP-35, lake.ts): floating lotus candles (បណ្តែតប្រទីប, Bandaet Pratip: a
 * banana-leaf boat, lotus petals, a candle; the square's, `_sqGarden.ts` `candle`) — set afloat from the ghat's
 * steps and drifting out past the stage on either side, and wandering slowly round it; more on the event night (a kit
 * and a glow of their own, drawn only then); lily pads and lotus in the shallows beside the ghat; four small wooden
 * boats with lanterns moored by the jetty and the stage. Their light lies on the water as warm streaks (the festival
 * glow). Nothing here is solid (the kit is not in the walk map). No sky lanterns: those are Thai.
 */

export interface LakeWater {
  candles: number;
  eventCandles: number;
  boats: number;
}

export function dressLakeWater(field: HeightField, fr: LakeFrame, kit: Kit, glow: Glow, eventKit: Kit, eventGlow: Glow, waterEdge: readonly [number, number][], low: boolean): LakeWater {
  const hw = LAKE_STAGE.w / 2 + 1.6;
  const hd = LAKE_STAGE.d / 2 + 1.6;
  /** Open water here (not under the stage or the jetty, with `margin` m of water round it). */
  const open = (x: number, z: number, margin = 1): boolean => {
    for (const [dx, dz] of [
      [0, 0],
      [margin, 0],
      [-margin, 0],
      [0, margin],
      [0, -margin],
    ])
      if (field.waterAt(x + dx, z + dz) === null) return false;
    const [u, v] = fr.local(x, z);
    if (Math.abs(u) < hw && Math.abs(v) < hd) return false;
    if (Math.abs(u) < 2.6 && v > 0 && v < 30) return false;
    return true;
  };

  // ── Candles set afloat from the ghat, drifting out past the stage ─────────
  let ci = 0;
  const flows = (k: Kit, gl: Glow, n: number, seed: number) => {
    let made = 0;
    for (let i = 0; i < n * 4 && made < n && waterEdge.length; i++, ci++) {
      const [ex, ez] = waterEdge[Math.floor(hash3(ci, seed, 1, 421) * waterEdge.length) % waterEdge.length];
      const [eu] = fr.local(ex, ez);
      const side = eu === 0 ? (hash3(ci, seed, 2, 421) < 0.5 ? -1 : 1) : Math.sign(eu);
      // (out along the stage's back direction, turned to pass beside it on the candle's side)
      const turn = 0.75 + 0.45 * hash3(ci, seed, 3, 421);
      const bx = -fr.f[0];
      const bz = -fr.f[1];
      const rot = (t: number): [number, number] => [bx * Math.cos(t) - bz * Math.sin(t), bx * Math.sin(t) + bz * Math.cos(t)];
      let [ddx, ddz] = rot(turn);
      if (Math.sign(ddx * fr.a[0] + ddz * fr.a[1]) !== side) [ddx, ddz] = rot(-turn);
      const len = 34 + 26 * hash3(ci, seed, 4, 421);
      const sx = ex + ddx * 1.2;
      const sz = ez + ddz * 1.2;
      // (all its way on open water)
      let ok = true;
      for (let t = 0; t <= len && ok; t += 3) ok = open(sx + ddx * t, sz + ddz * t, 0.8);
      if (!ok) continue;
      const drift: Drift = { a: [1, hash3(ci, seed, 5, 421), len], b: [ddx, ddz, 260 + 160 * hash3(ci, seed, 6, 421), 0] };
      candle(k, gl, sx, field.waterAt(sx, sz) ?? fr.water, sz, drift, 900 + ci);
      made++;
    }
    return made;
  };
  // ── And wandering round the stage ─────────────────────────────────────────
  const wander = (k: Kit, gl: Glow, n: number, seed: number) => {
    let made = 0;
    for (let i = 0; i < n * 5 && made < n; i++, ci++) {
      const a = hash3(ci, seed, 1, 422) * Math.PI * 2;
      const r = 13 + 32 * Math.sqrt(hash3(ci, seed, 2, 422));
      const x = fr.x + Math.cos(a) * r;
      const z = fr.z + Math.sin(a) * r;
      if (!open(x, z, 1.4)) continue;
      const drift: Drift = { a: [0, hash3(ci, seed, 3, 422), 0.3 + 0.7 * hash3(ci, seed, 4, 422)], b: [0, 0, perPeriod(0.02 + 0.04 * hash3(ci, seed, 5, 422)), 0] };
      candle(k, gl, x, field.waterAt(x, z) ?? fr.water, z, drift, 1400 + ci);
      made++;
    }
    return made;
  };
  const candles = flows(kit, glow, low ? 12 : 22, 1) + wander(kit, glow, low ? 16 : 34, 2);
  const eventCandles = flows(eventKit, eventGlow, low ? 16 : 34, 3) + wander(eventKit, eventGlow, low ? 22 : 48, 4);

  // ── Lily pads and lotus in the shallows beside the ghat ───────────────────
  const clumps = low ? 6 : 14;
  for (let m = 0; m < clumps; m++) {
    const side = m % 2 ? 1 : -1;
    const u = side * (10 + 9 * hash3(m, 1, 9, 423));
    const v = 9 + 6 * hash3(m, 2, 9, 423);
    const [x, z] = fr.at(u, v);
    // (back toward the open water until it floats)
    let lx = x;
    let lz = z;
    for (let k = 0; k < 10 && field.waterAt(lx, lz) === null; k++) {
      lx -= fr.f[0];
      lz -= fr.f[1];
    }
    if (!open(lx, lz, 0.6)) continue;
    const wy = field.waterAt(lx, lz) ?? fr.water;
    lilyPad(kit, lx, wy, lz, 700 + m);
    if (hash3(m, 3, 9, 423) > 0.35) lotus(kit, lx + 0.35, wy, lz - 0.25, 700 + m, hash3(m, 4, 9, 423) > 0.7);
    if (!low && hash3(m, 5, 9, 423) > 0.5) lilyPad(kit, lx - 1.1, wy, lz + 0.6, 760 + m);
  }

  // ── Four small boats with lanterns, moored by the jetty and the stage ─────
  let boats = 0;
  const along = fr.yaw;
  for (const [i, [u, v, turn]] of (
    [
      [-3.2, 9.5, 0.08],
      [3.3, 8.6, -0.1],
      [-(LAKE_STAGE.w / 2 + 2.3), 1.5, 0.05],
      [LAKE_STAGE.w / 2 + 2.3, -2.5, -0.06],
    ] as const
  ).entries()) {
    let [x, z] = fr.at(u, v);
    for (let k = 0; k < 12 && !open(x, z, 1.3); k++) [x, z] = fr.at(u, v - (k + 1) * 0.8);
    if (!open(x, z, 1.3)) continue;
    boat(kit, glow, x, field.waterAt(x, z) ?? fr.water, z, along + turn, 11 + i, true);
    boats++;
  }
  console.info(`[map] nye lake water: ${candles} candles (+${eventCandles} on the night), ${boats} boats, kit ${kit.count} boxes`);
  return { candles, eventCandles, boats };
}
