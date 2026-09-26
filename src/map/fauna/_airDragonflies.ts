import { Color } from 'three';
import { hash3 } from '../../voxel/random';
import { SURFACE, type HeightField } from '../heightfield';
import type { MapFrame } from '../types';
import { smooth, type Explorer, type Herd, type View } from './_waterAirKit';
import { CRITTER } from './_waterModels';
import { drawnWater } from './_waterRivers';
import { len2 } from './_len';

/**
 * Dragonflies by day over the water and the reedy banks round the roaming
 * explorer (from the overview they would be far below a pixel): each one
 * keeps to a patch a few metres across, hovering still with flickering wings,
 * then darting to the next point. A small pool that follows him: a dragonfly
 * left behind takes a new patch near him.
 */

const COUNT = 10;
/** Size over real life (so a 7 cm dragonfly reads at 5–15 m). */
const SIZE = 1.5;
/** A patch is left when he is this far from it (m), or after its time (s). */
const LEAVE = 24;
const STAY = 35;

const COLORS = [0x2f86e0, 0xd8402a, 0x3aa0d8, 0xe0602a, 0x5a7fe8];

interface Fly {
  home: [number, number, number] | null;
  prev: [number, number, number] | null;
  homeT: number;
  epoch: number;
  period: number;
  offset: number;
  tint: [number, number, number];
}

export interface Dragonflies {
  count: number;
  update(f: MapFrame, view: View, me: Explorer, herd: Herd): void;
}

export function buildDragonflies(field: HeightField): Dragonflies {
  const c = new Color();
  const flies: Fly[] = Array.from({ length: COUNT }, (_, i) => {
    c.setHex(COLORS[i % COLORS.length]);
    return { home: null, prev: null, homeT: -1e4, epoch: 0, period: 1.2 + hash3(i, 0, 0, 81) * 0.9, offset: hash3(i, 1, 0, 81) * 10, tint: [c.r, c.g, c.b] };
  });

  /** A patch near him: over open water first, else over a sandy bank. */
  const patch = (i: number, fl: Fly, me: Explorer): [number, number, number] | null => {
    for (let k = 0; k < 12; k++) {
      const h = (m: number) => hash3(i, fl.epoch, k * 3 + m, 82);
      const a = h(0) * Math.PI * 2;
      const r = 3 + h(1) * 15;
      const x = me.x + Math.cos(a) * r;
      const z = me.z + Math.sin(a) * r;
      const w = drawnWater(field, x, z);
      const bank = k >= 8 && field.surfaceAt(x, z) === SURFACE.sand;
      if (w === null && !bank) continue;
      const y = w ?? field.heightAt(x, z);
      if (Math.abs(y - me.y) > 5) continue;
      return [x, y, z];
    }
    return null;
  };

  /** Hover point k of a fly round its patch. */
  const point = (i: number, k: number, home: [number, number, number], out: [number, number, number]) => {
    const a = hash3(i, k, 0, 83) * Math.PI * 2;
    const r = hash3(i, k, 1, 83) * 2.4;
    out[0] = home[0] + Math.cos(a) * r;
    out[1] = home[1] + 0.35 + hash3(i, k, 2, 83) * 1.1;
    out[2] = home[2] + Math.sin(a) * r;
    return out;
  };

  const p0: [number, number, number] = [0, 0, 0];
  const p1: [number, number, number] = [0, 0, 0];
  const pm: [number, number, number] = [0, 0, 0];
  const q0: [number, number, number] = [0, 0, 0];
  const q1: [number, number, number] = [0, 0, 0];

  /** Where fly i is at time t round a patch, and its heading. */
  const at = (i: number, fl: Fly, t: number, home: [number, number, number], out: [number, number, number]): number => {
    const s = (t + fl.offset) / fl.period;
    const k = Math.floor(s);
    const u = s - k;
    point(i, k, home, p0);
    point(i, k + 1, home, p1);
    point(i, k - 1, home, pm);
    // Hover still (a tiny drift), then dart to the next point.
    const dart = smooth(0.72, 1, u);
    out[0] = p0[0] + (p1[0] - p0[0]) * dart + 0.03 * Math.sin(t * 7 + i);
    out[1] = p0[1] + (p1[1] - p0[1]) * dart + 0.04 * Math.sin(t * 5.3 + i * 2);
    out[2] = p0[2] + (p1[2] - p0[2]) * dart + 0.03 * Math.cos(t * 6.1 + i);
    // Facing where it is going (while hovering: where it came from).
    return u > 0.72 ? Math.atan2(p1[0] - p0[0], p1[2] - p0[2]) : Math.atan2(p0[0] - pm[0], p0[2] - pm[2]);
  };

  return {
    count: COUNT,
    update(f, view, me, herd) {
      const day = 1 - smooth(0.3, 0.6, f.night);
      if (day <= 0 || !me.near) return;
      const t = f.t;
      flies.forEach((fl, i) => {
        if (!fl.home || len2(fl.home[0] - me.x, fl.home[2] - me.z) > LEAVE || t - fl.homeT > STAY + i * 3 || fl.homeT > t) {
          if (t - fl.homeT > 0.8 || fl.homeT > t) {
            fl.epoch++;
            fl.prev = fl.home;
            fl.home = patch(i, fl, me);
            // (the first patch: as if it had been there a while)
            fl.homeT = fl.prev ? t : t - 5;
          }
        }
        if (!fl.home) return;
        let yaw = at(i, fl, t, fl.home, q1);
        // Flying over from its old patch.
        const move = smooth(fl.homeT, fl.homeT + 1.6, t);
        let show = 1;
        if (fl.prev && move < 1) {
          at(i, fl, t, fl.prev, q0);
          for (let k = 0; k < 3; k++) q1[k] = q0[k] + (q1[k] - q0[k]) * move;
          yaw = Math.atan2(fl.home[0] - fl.prev[0], fl.home[2] - fl.prev[2]);
          if (len2(fl.home[0] - fl.prev[0], fl.home[2] - fl.prev[2]) > 40) show = move;
        }
        if (!view.sees(q1[0], q1[1], q1[2], 0.3, 45)) return;
        const o = herd.add(q1[0], q1[1], q1[2], SIZE * day * show, yaw, 0.08 * Math.sin(t * 3 + i), 0, CRITTER.dragonfly);
        if (o < 0) return;
        const a = herd.data;
        // Wings: a fast flicker (a blur of positions from frame to frame).
        a[o + 8] = 0.1 + 0.45 * Math.sin(t * 150 + i * 1.3);
        a[o + 9] = 1;
        a[o + 16] = fl.tint[0];
        a[o + 17] = fl.tint[1];
        a[o + 18] = fl.tint[2];
      });
    },
  };
}
