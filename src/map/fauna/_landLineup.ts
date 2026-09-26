import type { HeightField } from '../heightfield';
import { buildRoadNetwork, LIFT } from '../road/line';
import { CH, Flock, type Species } from './_kit';
import { BUFFALO } from './_landBuffalo';
import { DEER } from './_landDeer';
import { ELEPHANT } from './_landElephant';
import { FOWL } from './_landFowl';
import { MACAQUE } from './_landMacaque';

/**
 * Checking the models (`?fauna=lineup`): every species in every pose, in rows
 * along the flat valley road, side on. The console names a camera for each
 * row (`cam=` for a shot).
 */

interface Pose {
  variant?: number;
  scale?: number;
  gait?: number;
  hz?: number;
  rest?: number;
  head?: number;
  turn?: number;
  act?: number;
}

const ROWS: { sp: Species; road?: number; station: number; gap: number; poses: Pose[] }[] = [
  {
    sp: MACAQUE,
    station: 140,
    gap: 0.9,
    poses: [
      {},
      { gait: 1, hz: 1.8 },
      { gait: 2, hz: 3.2 },
      { rest: 1 },
      { rest: 1, act: 1 },
      { rest: 1, act: 2 },
      { rest: 1, act: 3 },
      { rest: 1, head: 1 },
      { head: -1, turn: 1 },
      { variant: 1, scale: 0.45 },
      { variant: 2, scale: 1.1, rest: 1 },
    ],
  },
  {
    sp: DEER,
    station: 90,
    gap: 2.4,
    poses: [{}, { head: 1 }, { head: -1 }, { gait: 1, hz: 1 }, { gait: 2, hz: 2.2 }, { rest: 1 }, { rest: 1, head: 1 }, { variant: 1, scale: 1.08 }, { variant: 2, scale: 0.45 }, { variant: 2, scale: 0.45, head: 1 }],
  },
  {
    sp: FOWL,
    station: 190,
    gap: 0.7,
    poses: [{}, { gait: 1, hz: 2.4 }, { gait: 2, hz: 5 }, { act: 1 }, { act: 2 }, { head: -1 }, { rest: 1, head: 1 }, { variant: 1 }, { variant: 1, act: 1 }, { variant: 1, rest: 1 }],
  },
  {
    sp: BUFFALO,
    station: 222,
    gap: 3,
    poses: [{}, { head: 1 }, { gait: 1, hz: 0.8 }, { rest: 1 }, { head: -1, turn: 1 }],
  },
  {
    sp: ELEPHANT,
    station: 262,
    gap: 5,
    poses: [{}, { gait: 1, hz: 0.55 }, { act: 1 }, { act: 2, head: -1 }, { rest: 1 }, { variant: 1, scale: 0.44 }, { variant: 1, scale: 0.44, gait: 1, hz: 0.85 }],
  },
  {
    // Bathing (_landBath.ts): trunk down in the water, spraying over the back, lying on the side (cow, calf). On the shrine road.
    sp: ELEPHANT,
    road: 1,
    station: 60,
    gap: 5,
    poses: [{ act: -1 }, { act: 3 }, { rest: 2 }, { variant: 1, scale: 0.44, rest: 2 }, { variant: 1, scale: 0.44, act: 3 }],
  },
];

export function buildLineup(field: HeightField): Flock[] {
  const roads = buildRoadNetwork(field).roads;
  const flocks: Flock[] = [];
  for (const row of ROWS) {
    const road = roads[row.road ?? 0].stations;
    const fl = new Flock(row.sp, row.poses.length);
    flocks.push(fl);
    row.poses.forEach((p, i) => {
      const st = road[Math.round(row.station + (i * row.gap) / 0.5)];
      fl.setup(i, p.variant ?? 0, (i * 0.37) % 1, 1);
      fl.place(i, st.x, st.h + LIFT, st.z, Math.atan2(st.tx, st.tz), p.scale ?? 1);
      fl.gait(i, p.gait ?? 0, p.hz ?? 1, 0);
      fl.set(i, CH.gait, p.gait ?? 0, 0, true);
      fl.set(i, CH.rest, p.rest ?? 0, 0, true);
      fl.set(i, CH.head, p.head ?? 0, 0, true);
      fl.set(i, CH.turn, p.turn ?? 0, 0, true);
      fl.set(i, CH.act, p.act ?? 0, 0, true);
    });
    // A camera from the south side, at the middle of the row, as far as the row is long.
    const mid = road[Math.round(row.station + ((row.poses.length - 1) * row.gap) / 2 / 0.5)];
    const side = mid.tx > 0 ? 1 : -1;
    const [nx, nz] = [-mid.tz * side, mid.tx * side];
    const d = Math.max(3, row.poses.length * row.gap * 0.62);
    const y = mid.h + LIFT;
    const size = row.sp === ELEPHANT ? 2.5 : row.sp === BUFFALO || row.sp === DEER ? 1.2 : 0.4;
    const cam = [mid.x + nx * d, y + size + d * 0.25, mid.z + nz * d, mid.x, y + size * 0.6, mid.z].map((v) => v.toFixed(2)).join(',');
    console.info(`[map] fauna lineup ${row.sp.name}${row.road ? ` (road ${row.road})` : ''}: cam=${cam}`);
  }
  return flocks;
}
