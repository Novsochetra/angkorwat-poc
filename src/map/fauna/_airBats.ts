import { mulberry32 } from '../../voxel/random';
import type { HeightField } from '../heightfield';
import { placeById } from '../layout';
import type { MapFrame } from '../types';
import { BAT_SHOULDER, batShape } from './_airModels';
import { call, creatureMaterial, Herd, smooth, type Explorer, type View } from './_waterAirKit';
import { len2, len3 } from './_len';

/**
 * Bats at dusk and at night: flying foxes flitting round the towers of
 * Angkor Wat (they roost in the temple's trees and fly out at dusk), and
 * small bats hawking insects low over the rivers. Dark shapes against the
 * moonlit sky; gone by day. Their flight is a loop with quick jinks laid
 * over it: never still, turning sharply, wings beating fast.
 */

/** Flying foxes round the temple, small bats over the water. */
const TEMPLE = 22;
/** River beats: a river point and how many bats hunt over it. */
const RIVER_BEATS: { at: [number, number]; n: number }[] = [
  { at: [-32, 50], n: 3 },
  { at: [-19, 92], n: 2 },
  { at: [22, 18], n: 2 },
  { at: [75, -52], n: 2 },
  { at: [-142, -22], n: 2 },
  { at: [73, -190], n: 2 },
];
/** Farthest drawn (m): the temple's flying foxes are seen from the overview. */
const FAR_FOX = 620;
const FAR_SMALL = 260;

interface Bat {
  fox: boolean;
  /** Centre of the loop, its radii (m) and turn rate (rad/s). */
  cx: number;
  cy: number;
  cz: number;
  r: number;
  r2: number;
  w: number;
  /** River beats: the river's heading. */
  dx: number;
  dz: number;
  size: number;
  rate: number;
  ph: number[];
}

export interface Bats {
  herd: Herd;
  count: number;
  update(f: MapFrame, view: View, me: Explorer): void;
}

export function buildBats(field: HeightField): Bats {
  const rnd = mulberry32(6060);
  const bats: Bat[] = [];
  const temple = placeById('sanctuary');
  const phases = () => Array.from({ length: 9 }, () => rnd() * Math.PI * 2);
  for (let i = 0; i < TEMPLE; i++) {
    const r = 12 + rnd() * 34;
    const v = 5.5 + rnd() * 3;
    bats.push({
      fox: true,
      cx: temple.x + (rnd() - 0.5) * 12,
      // (round the tower tops, most of them against the sky)
      cy: temple.y + 38 + rnd() * 36,
      cz: temple.z + (rnd() - 0.5) * 12,
      r,
      r2: 3 + rnd() * 5,
      w: (v / r) * (rnd() < 0.5 ? 1 : -1),
      dx: 0,
      dz: 1,
      // (large flying foxes: up to 1.5 m across)
      size: 1.2 + rnd() * 0.3,
      rate: 2.4 + rnd() * 0.7,
      ph: phases(),
    });
  }
  for (const beat of RIVER_BEATS) {
    // The nearest river point: its level and heading.
    let best = field.rivers[0].samples[0];
    let bd = Infinity;
    for (const r of field.rivers)
      for (const s of r.samples) {
        const d = Math.hypot(s.x - beat.at[0], s.z - beat.at[1]);
        if (d < bd) [bd, best] = [d, s];
      }
    for (let i = 0; i < beat.n; i++)
      bats.push({
        fox: false,
        cx: best.x,
        cy: best.level + 2.5 + rnd() * 2,
        cz: best.z,
        r: 10 + rnd() * 8,
        r2: 2 + rnd() * 2.5,
        w: 0.35 + rnd() * 0.2,
        dx: best.dir[0],
        dz: best.dir[1],
        size: 0.42 + rnd() * 0.08,
        rate: 6.5 + rnd() * 2,
        ph: phases(),
      });
  }
  const herd = new Herd('wildlife:bats', [batShape()], creatureMaterial('map:bats', { shoulder: BAT_SHOULDER, roughness: 0.8 }), bats.length);

  const pos = (b: Bat, t: number, out: number[]) => {
    const p = b.ph;
    if (b.fox) {
      // Round the towers: a wobbling loop, rising and falling, with jinks.
      const a = b.w * t + p[0] + 0.5 * Math.sin(0.23 * t + p[1]);
      const r = b.r + b.r2 * Math.sin(0.31 * t + p[2]) + 2 * Math.sin(1.7 * t + p[3]);
      out[0] = b.cx + Math.cos(a) * r + 0.9 * Math.sin(4.1 * t + p[4]);
      out[1] = b.cy + 6 * Math.sin(0.19 * t + p[5]) + 1.3 * Math.sin(2.3 * t + p[6]);
      out[2] = b.cz + Math.sin(a) * r + 0.9 * Math.cos(3.7 * t + p[7]);
    } else {
      // Up and down a stretch of river, weaving across it, jinking after insects.
      const along = b.r * Math.sin(b.w * t + p[0]);
      const across = b.r2 * Math.sin(b.w * 2.3 * t + p[1]) + 0.7 * Math.sin(5.3 * t + p[2]) + 0.4 * Math.sin(8.9 * t + p[3]);
      out[0] = b.cx + b.dx * along - b.dz * across;
      out[1] = b.cy + 1.2 * Math.sin(0.7 * t + p[4]) + 0.5 * Math.sin(6.1 * t + p[5]);
      out[2] = b.cz + b.dz * along + b.dx * across;
    }
    return out;
  };

  const p0 = [0, 0, 0];
  const p1 = [0, 0, 0];
  const p2 = [0, 0, 0];
  const talk = mulberry32(17);
  let squeakIn = 2;

  return {
    herd,
    count: bats.length,
    update(f, view, me) {
      herd.begin();
      const out = smooth(0.35, 0.7, f.night);
      if (out <= 0) return herd.end();
      const t = f.t;
      let nearest = Infinity;
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (const b of bats) {
        pos(b, t, p0);
        if (me.near) {
          const d = len3(p0[0] - me.x, p0[1] - me.y, p0[2] - me.z);
          if (d < nearest) [nearest, nx, ny, nz] = [d, p0[0], p0[1], p0[2]];
        }
        if (!view.sees(p0[0], p0[1], p0[2], 1, b.fox ? FAR_FOX : FAR_SMALL)) continue;
        // Heading and bank from the path a moment ahead and behind.
        pos(b, t + 0.08, p1);
        pos(b, t - 0.08, p2);
        const vx = p1[0] - p2[0];
        const vz = p1[2] - p2[2];
        const yaw = Math.atan2(vx, vz);
        const turn = (vx * (p1[2] - 2 * p0[2] + p2[2]) - vz * (p1[0] - 2 * p0[0] + p2[0])) / Math.max(1e-4, (vx * vx + vz * vz) ** 1.5);
        const climb = Math.atan2(p1[1] - p2[1], len2(vx, vz));
        // (far off a little larger, so they stay a few pixels across from the overview)
        const grow = b.fox ? 1 + 0.6 * smooth(120, 420, view.dist(p0[0], p0[1], p0[2])) : 1;
        const o = herd.add(p0[0], p0[1], p0[2], b.size * grow * out, yaw, -climb * 0.6, Math.max(-0.7, Math.min(0.7, turn * 4)), 0);
        if (o < 0) continue;
        // Deep quick beats; the flying foxes slower, with a short glide now and then.
        const glide = b.fox ? smooth(0.6, 0.95, Math.sin(t * 0.9 + b.ph[8])) : 0;
        herd.data[o + 8] = 0.15 + 0.75 * Math.sin(t * Math.PI * 2 * b.rate + b.ph[8]) * (1 - 0.8 * glide);
        herd.data[o + 9] = 1;
        herd.data[o + 10] = -0.1;
      }
      herd.end();
      // A faint squeak now and then from a bat flitting near him.
      squeakIn -= f.dt;
      if (squeakIn <= 0 && f.dt > 0) {
        squeakIn = 1.5 + talk() * 3;
        if (nearest < 40) call(f, 'bat', nx, ny, nz, (0.25 + talk() * 0.2) * out);
      }
    },
  };
}
