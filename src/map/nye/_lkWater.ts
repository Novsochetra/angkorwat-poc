import { hash3 } from '../../voxel/random';
import type { Glow } from '../festival/_glow';
import { ANIM, perPeriod, SHOW, type Kit } from '../festival/_kit';
import type { HeightField } from '../heightfield';
import { LAKE_STAGE } from './plan';
import { lilyPad, type Drift } from './_sqGarden';
import { boat, type LakeFrame } from './_lkKit';
import { launchFlotilla, type Flotilla } from './_lkBoats';
import type { WaterLights } from './_lkReflect';

/**
 * On the water round the lake stage (AWP-35, lake.ts): floating lotus candles (បណ្តែតប្រទីប, Bandaet Pratip: a
 * banana-leaf boat, two rings of lotus petals, a candle and its flame: `lakeCandle`) — set afloat from the ghat's
 * steps and drifting out past the stage on either side, and wandering slowly round it; more on the event night (a kit
 * of their own, drawn only then), with the lantern flotilla (`_lkBoats.ts`: lantern boats, lotus floats,
 * the Water Festival's illuminated floats); lily pads and glowing lotus in the shallows beside the ghat; four small
 * wooden boats with lanterns moored by the jetty and the stage. The candles' halos and every light's reflection on the
 * water are the venue's water lights (`_lkReflect.ts` `WaterLights`: one draw). Nothing here is solid (the kit is not in the walk map). No sky lanterns: those are Thai.
 */

export interface LakeWater {
  candles: number;
  eventCandles: number;
  boats: number;
  flotilla: Flotilla;
}

/**
 * A floating lotus candle at (x, y, z), drifting (`drift`, the kit's): a banana-leaf boat, an outer ring of petals
 * leaning out and an inner one (pink or white), a candle and its flame; its halo and its streak on the water drift with
 * it. Night only. Bigger and brighter than the square's (`_sqGarden.ts` `candle`): seen from the terrace 20‥60 m off.
 */
export function lakeCandle(kit: Kit, lights: WaterLights, x: number, y: number, z: number, drift: Drift, i: number, low: boolean, event: boolean): void {
  const d = { show: SHOW.night, anim: ANIM.drift, a: drift.a, b: drift.b };
  const white = hash3(i, 7, 1, 55) >= 0.6;
  const outer = white ? 0xf6f0e4 : 0xf29ab8;
  const inner = white ? 0xfaf4ea : 0xf6b8cc;
  const turn = hash3(i, 8, 1, 55) * Math.PI;
  kit.box(x, y + 0.05, z, 0.56, 0.1, 0.56, 0x5f9a3a, { ...d, yaw: turn });
  if (!low) kit.box(x, y + 0.05, z, 0.56, 0.1, 0.56, 0x548c34, { ...d, yaw: turn + Math.PI / 4 });
  const n = low ? 4 : 6;
  for (let k = 0; k < n; k++) {
    const a = turn + (k / n) * Math.PI * 2;
    kit.box(x + Math.sin(a) * 0.2, y + 0.16, z + Math.cos(a) * 0.2, 0.16, 0.18, 0.04, outer, { ...d, yaw: a, pitch: 0.75, glow: 0.25 });
  }
  kit.box(x, y + 0.17, z, 0.2, 0.14, 0.2, inner, { ...d, yaw: turn + 0.4, glow: 0.3 });
  kit.box(x, y + 0.3, z, 0.05, 0.14, 0.05, 0xf4ecd8, d);
  kit.box(x, y + 0.41, z, 0.07, 0.1, 0.07, 0xffc070, { ...d, glow: 1.8 });
  lights.halo(x, y + 0.42, z, 0xffa850, 1.1, { drift, level: 0.35, event });
  lights.streak(x, y, z, 0.42, undefined, { drift, level: 1.6, width: 0.36, event });
}

/** A lotus standing over the water (outer and inner petals, a gold heart), softly lit at night, or a bud on its stalk. */
function lakeLotus(kit: Kit, x: number, wy: number, z: number, i: number, bud: boolean): void {
  const glow = 0.6;
  kit.box(x, wy + 0.25, z, 0.03, 0.5, 0.03, 0x5a7a3a);
  if (bud) {
    kit.box(x, wy + 0.58, z, 0.14, 0.2, 0.14, 0xf08ab0, { glow, yaw: 0.4 });
    kit.box(x, wy + 0.7, z, 0.07, 0.08, 0.07, 0xf6b0c8, { glow, yaw: 0.4 });
    return;
  }
  const yaw = hash3(i, 5, 3, 72) * 2;
  for (let k = 0; k < 4; k++) {
    const a = yaw + (k * Math.PI) / 2;
    kit.box(x + Math.sin(a) * 0.15, wy + 0.55, z + Math.cos(a) * 0.15, 0.17, 0.2, 0.04, 0xe8729c, { glow, yaw: a, pitch: 0.8 });
  }
  kit.box(x, wy + 0.57, z, 0.26, 0.16, 0.26, 0xf08ab0, { glow, yaw: yaw + Math.PI / 4 });
  kit.box(x, wy + 0.64, z, 0.17, 0.12, 0.17, 0xf6b0c8, { glow, yaw });
  kit.box(x, wy + 0.7, z, 0.08, 0.04, 0.08, 0xf0c040, { glow: 1.2 });
}

export function dressLakeWater(field: HeightField, fr: LakeFrame, kit: Kit, glow: Glow, eventKit: Kit, lights: WaterLights, waterEdge: readonly [number, number][], low: boolean): LakeWater {
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
  const flows = (k: Kit, event: boolean, n: number, seed: number) => {
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
      lakeCandle(k, lights, sx, field.waterAt(sx, sz) ?? fr.water, sz, drift, 900 + ci, low, event);
      made++;
    }
    return made;
  };
  // ── And wandering round the stage ─────────────────────────────────────────
  const wander = (k: Kit, event: boolean, n: number, seed: number) => {
    let made = 0;
    for (let i = 0; i < n * 5 && made < n; i++, ci++) {
      const a = hash3(ci, seed, 1, 422) * Math.PI * 2;
      const r = 13 + 32 * Math.sqrt(hash3(ci, seed, 2, 422));
      const x = fr.x + Math.cos(a) * r;
      const z = fr.z + Math.sin(a) * r;
      if (!open(x, z, 1.4)) continue;
      const drift: Drift = { a: [0, hash3(ci, seed, 3, 422), 0.3 + 0.7 * hash3(ci, seed, 4, 422)], b: [0, 0, perPeriod(0.02 + 0.04 * hash3(ci, seed, 5, 422)), 0] };
      lakeCandle(k, lights, x, field.waterAt(x, z) ?? fr.water, z, drift, 1400 + ci, low, event);
      made++;
    }
    return made;
  };
  const candles = flows(kit, false, low ? 12 : 22, 1) + wander(kit, false, low ? 16 : 34, 2);
  const eventCandles = flows(eventKit, true, low ? 10 : 22, 3) + wander(eventKit, true, low ? 14 : 30, 4);

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
    if (hash3(m, 3, 9, 423) > 0.35) lakeLotus(kit, lx + 0.35, wy, lz - 0.25, 700 + m, hash3(m, 4, 9, 423) > 0.7);
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
  // ── The event night's lantern flotilla: boats, lotus floats, the illuminated floats (`_lkBoats.ts`) ──
  const before = eventKit.count;
  const flotilla = launchFlotilla(field, fr, eventKit, lights, open, low);
  console.info(
    `[map] nye lake water: ${candles} candles (+${eventCandles} on the night), ${boats} boats, kit ${kit.count} boxes; the night's flotilla: ${flotilla.boats} lantern boats, ${flotilla.lotus} lotus floats, ${flotilla.floats} illuminated floats (${eventKit.count - before} boxes; the night's kit ${eventKit.count}; water lights ${lights.count})`,
  );
  return { candles, eventCandles, boats, flotilla };
}
