import { hash3 } from '../../voxel/random';
import { SURFACE, type HeightField } from '../heightfield';
import type { MapFrame } from '../types';
import { call, smooth, type Explorer, type Herd, type View } from './_waterAirKit';
import { CRITTER } from './_waterModels';
import type { Rings } from './_waterRings';
import { drawnWater, openWater } from './_waterRivers';

/**
 * Small water life, only where it can be seen:
 *  - fish: now and then a little silver fish arcs out of the water and drops
 *    back, with a splash ring at each end. A few "slots" that come round on
 *    their own clocks; each time a slot comes round it picks open water near
 *    the roaming explorer (or, from the overview, a river point in view).
 *  - frogs at night on the banks round the roaming explorer: they croak
 *    (throat puffing) and hop into the water when he comes within a few metres.
 * Everything is a function of the time and the explorer's position, so a
 * still at `t` is always the same.
 */

/** Fish slots, how long a jump lasts (s), and its size over real life. */
const FISH = 6;
const JUMP = 0.72;
const FISH_SIZE = 1.3;
/** Frogs round the explorer at night, their size, how close he may come (m). */
const FROGS = 8;
const FROG_SIZE = 1.6;
const FROG_SHY = 3.5;

interface FishSlot {
  period: number;
  offset: number;
  n: number;
  ok: boolean;
  x: number;
  z: number;
  level: number;
  dx: number;
  dz: number;
  h: number;
  len: number;
  prev: number;
}

interface Frog {
  on: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Where the hop lands (water), when it started (s), gone since. */
  wx: number;
  wz: number;
  level: number;
  hopT: number;
  gone: boolean;
  homeT: number;
  croakP: number;
  croakO: number;
  lastCroak: number;
  epoch: number;
}

export interface WaterCritters {
  fishSlots: number;
  frogs: number;
  update(f: MapFrame, view: View, me: Explorer, herd: Herd, rings: Rings | null): void;
}

export function buildWaterCritters(field: HeightField): WaterCritters {
  const slots: FishSlot[] = Array.from({ length: FISH }, (_, j) => ({
    period: 3.2 + hash3(j, 1, 0, 71) * 4.5,
    offset: hash3(j, 2, 0, 71) * 20,
    n: -1,
    ok: false,
    x: 0,
    z: 0,
    level: 0,
    dx: 1,
    dz: 0,
    h: 0.6,
    len: 1,
    prev: 1e9,
  }));
  // River points for fish seen from afar.
  const riverPts = field.rivers.flatMap((r) => r.samples.filter((_, i) => i % 3 === 0));
  const frogs: Frog[] = Array.from({ length: FROGS }, (_, i) => ({
    on: false,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    wx: 0,
    wz: 0,
    level: 0,
    hopT: -1e4,
    gone: false,
    homeT: -1e4,
    croakP: 4 + hash3(i, 3, 0, 72) * 6,
    croakO: hash3(i, 4, 0, 72) * 10,
    lastCroak: -1,
    epoch: 0,
  }));

  /** Pick where slot j jumps on its n-th turn; false if nowhere. */
  const placeFish = (s: FishSlot, j: number, n: number, f: MapFrame, view: View, me: Explorer): boolean => {
    const h = (k: number) => hash3(n, j, k, 73);
    // (not every turn, fewer at night)
    if (h(0) < 0.3 + 0.3 * f.night) return false;
    for (let k = 1; k <= 7; k++) {
      let x: number;
      let z: number;
      if (me.near) {
        const a = h(k * 3) * Math.PI * 2;
        const r = 5 + h(k * 3 + 1) * 32;
        x = me.x + Math.cos(a) * r;
        z = me.z + Math.sin(a) * r;
      } else {
        const p = riverPts[Math.floor(h(k * 3) * riverPts.length)];
        x = p.x + (h(k * 3 + 1) - 0.5) * p.w * 0.5;
        z = p.z + (h(k * 3 + 2) - 0.5) * p.w * 0.5;
        if (!view.sees(x, p.level, z, 2, 280)) continue;
      }
      const level = openWater(field, x, z, 1.8);
      if (level === null || (me.near && Math.abs(level - me.y) > 6)) continue;
      const a = h(k * 3 + 2) * Math.PI * 2;
      Object.assign(s, { ok: true, x, z, level, dx: Math.cos(a), dz: Math.sin(a), h: 0.45 + h(40) * 0.4, len: 0.8 + h(41) * 0.6 });
      return true;
    }
    return false;
  };

  /** A bank spot for frog i near the explorer: sand by the water, facing it. */
  const placeFrog = (fr: Frog, i: number, t: number, me: Explorer): void => {
    fr.on = false;
    fr.gone = false;
    fr.homeT = t;
    fr.epoch++;
    for (let k = 0; k < 14; k++) {
      const h = (m: number) => hash3(i, fr.epoch, k * 4 + m, 74);
      const a = h(0) * Math.PI * 2;
      const r = 5 + h(1) * 20;
      const x = me.x + Math.cos(a) * r;
      const z = me.z + Math.sin(a) * r;
      if (field.surfaceAt(x, z) !== SURFACE.sand || drawnWater(field, x, z) !== null) continue;
      // Water within a step: hop that way.
      for (const [dx, dz] of [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ]) {
        const w = drawnWater(field, x + dx, z + dz);
        const y = field.heightAt(x, z);
        if (w === null || y - w > 2.5 || y < w) continue;
        Object.assign(fr, { on: true, x, y, z, yaw: Math.atan2(dx, dz), wx: x + dx * 0.9, wz: z + dz * 0.9, level: w, hopT: -1e4 });
        return;
      }
    }
  };

  return {
    fishSlots: FISH,
    frogs: FROGS,
    update(f, view, me, herd, rings) {
      const t = f.t;

      // ── Fish ─────────────────────────────────────────────────────────
      slots.forEach((s, j) => {
        const local = t + s.offset;
        const n = Math.floor(local / s.period);
        const tau = local - n * s.period;
        if (n !== s.n) {
          s.n = n;
          s.ok = placeFish(s, j, n, f, view, me);
          s.prev = tau;
        }
        if (!s.ok) return;
        if (s.prev < JUMP && tau >= JUMP) call(f, 'fish', s.x, s.level, s.z, 0.55);
        s.prev = tau;
        const x0 = s.x - s.dx * s.len * 0.5;
        const z0 = s.z - s.dz * s.len * 0.5;
        const x1 = s.x + s.dx * s.len * 0.5;
        const z1 = s.z + s.dz * s.len * 0.5;
        const close = view.dist(s.x, s.level, s.z);
        if (rings && close < 300) {
          const big = close > 120 ? 1.6 : 1;
          rings.add(x0, s.level, z0, t - tau, 0.7 * big, 0.7, 1.8, 0.7);
          if (tau >= JUMP) rings.add(x1, s.level, z1, t - tau + JUMP, 1.1 * big, 0.8, 2.3, 1);
        }
        if (tau >= JUMP || close > 140) return;
        const u = tau / JUMP;
        const y = s.level - 0.12 + s.h * 4 * u * (1 - u);
        if (!view.sees(s.x, y, s.z, 1, 140)) return;
        // Nose along the arc; a flick of the tail.
        const slope = (s.h * 4 * (1 - 2 * u)) / s.len;
        const o = herd.add(x0 + (x1 - x0) * u, y, z0 + (z1 - z0) * u, FISH_SIZE, Math.atan2(s.dx, s.dz), -Math.atan(slope), 0.3 * Math.sin(j * 1.7), CRITTER.fish);
        if (o >= 0) herd.data[o + 14] = 0.5 * Math.sin(t * 34 + j);
      });

      // ── Frogs (night, round the roaming explorer) ────────────────────
      const dark = smooth(0.45, 0.75, f.night);
      if (dark <= 0 || !me.near) return;
      frogs.forEach((fr, i) => {
        // A new bank when he has gone on, or a while after it hopped in.
        const far = !fr.on || Math.hypot(fr.x - me.x, fr.z - me.z) > 28;
        if (far || (fr.gone && t - fr.hopT > 25)) {
          if (t - fr.homeT > 1 || fr.homeT > t) placeFrog(fr, i, t, me);
          if (!fr.on) return;
        }
        if (fr.gone) return;
        const d = Math.hypot(fr.x - me.x, fr.z - me.z);
        if (fr.hopT < 0 && d < (me.boat ? FROG_SHY * 1.5 : FROG_SHY)) {
          fr.hopT = t;
          call(f, 'frog', fr.x, fr.y, fr.z, 0.35);
        }
        let x = fr.x;
        let y = fr.y;
        let z = fr.z;
        let pitch = 0;
        let hind = 0;
        let throat = 0;
        if (fr.hopT > 0) {
          // The hop: an arc into the water, a plop, gone.
          const u = (t - fr.hopT) / 0.55;
          if (u >= 1) {
            fr.gone = true;
            rings?.add(fr.wx, fr.level, fr.wz, fr.hopT + 0.55, 0.7, 0.7, 1.8, 0.8);
            call(f, 'fish', fr.wx, fr.level, fr.wz, 0.3);
            return;
          }
          x = fr.x + (fr.wx - fr.x) * u;
          z = fr.z + (fr.wz - fr.z) * u;
          y = fr.y + (fr.level - fr.y) * u + 0.45 * 4 * u * (1 - u);
          pitch = -0.6 + 1.4 * u;
          hind = 1.3 * (1 - smooth(0.2, 0.9, u)) + 0.3;
        } else {
          // Croaks: two or three puffs of the throat every few seconds.
          const c = (t + fr.croakO) % fr.croakP;
          throat = c < 1.1 ? 0.9 * Math.max(0, Math.sin((c / 1.1) * Math.PI * 3)) : 0;
          const k = Math.floor((t + fr.croakO) / fr.croakP);
          if (c < 1.1 && k !== fr.lastCroak) {
            fr.lastCroak = k;
            call(f, 'frog', fr.x, fr.y, fr.z, 0.4 + 0.3 * hash3(i, k, 5, 75));
          }
        }
        if (!view.sees(x, y, z, 0.5, 40)) return;
        const o = herd.add(x, y, z, FROG_SIZE * dark, fr.yaw, pitch, 0, CRITTER.frog);
        if (o < 0) return;
        herd.data[o + 14] = throat;
        herd.data[o + 15] = hind;
      });
    },
  };
}
