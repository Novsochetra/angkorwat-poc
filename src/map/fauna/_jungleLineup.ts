import type { HeightField } from '../heightfield';
import { buildRoadNetwork, LIFT } from '../road/line';
import { CH, Flock, type Species } from './_kit';
import { BIRD, BIRDS } from './_jungleBirds';
import { BOAR } from './_jungleBoar';
import { GIBBON } from './_jungleGibbons';
import { PEAFOWL } from './_junglePeafowl';
import { CRITTERS, SMALL } from './_jungleSmall';

/**
 * Checking the models (`?fauna=jungle`): every jungle species in every pose,
 * in rows along the flat valley road, side on (the birds in flight a little
 * above it). The console names a camera for each row (`cam=` for a shot).
 */

/** Big birds in the mesh at most (two hornbill pairs, two ibis pairs). */
export const BIG_BIRDS_MAX = 8;

interface Pose {
  variant?: number;
  scale?: number;
  gait?: number;
  hz?: number;
  rest?: number;
  head?: number;
  turn?: number;
  act?: number;
  /** Lifted over the road (m): the birds in flight. */
  lift?: number;
}

const ROWS: { sp: Species; station: number; gap: number; size: number; poses: Pose[] }[] = [
  {
    sp: BOAR,
    station: 120,
    gap: 1.8,
    size: 0.9,
    poses: [{}, { head: 1, act: 1 }, { head: 0.5, act: 2 }, { head: -1 }, { gait: 1, hz: 1.5 }, { gait: 2, hz: 2.6 }, { rest: 1 }, { variant: 1, scale: 0.38 }, { variant: 1, scale: 0.38, head: 1, act: 1 }, { variant: 1, scale: 0.38, gait: 2, hz: 4 }],
  },
  {
    sp: PEAFOWL,
    station: 170,
    gap: 1.9,
    size: 1.1,
    poses: [{}, { act: 1 }, { act: 2 }, { act: 3 }, { head: -1 }, { gait: 1, hz: 1.8 }, { gait: 2, hz: 4.5 }, { rest: 1 }, { variant: 1 }, { variant: 1, act: 1 }],
  },
  {
    sp: GIBBON,
    station: 215,
    gap: 1.4,
    size: 1.1,
    poses: [
      { rest: 1 },
      { rest: 1, act: 1, head: -0.3 },
      { rest: 1, act: 2 },
      { rest: 1, act: 3 },
      { rest: 1, act: 4 },
      { rest: 1, head: 1 },
      { gait: 1, hz: 0.4, lift: 1.4 },
      { gait: 2, hz: 0.4, lift: 0.6 },
      { variant: 1, rest: 1 },
      { variant: 1, rest: 1, act: 2 },
      { variant: 2, rest: 1, scale: 1 },
    ].map((p) => ({ scale: 1.45, ...p })),
  },
  {
    sp: BIRDS,
    station: 255,
    gap: 2.4,
    size: 1.2,
    poses: [
      { variant: BIRD.hornbill },
      { variant: BIRD.hornbill, head: 1 },
      { variant: BIRD.hornbill, rest: 1 },
      { variant: BIRD.hornbill, gait: 2, act: 1, lift: 2 },
      { variant: BIRD.hornbill, gait: 2, turn: 0.4, lift: 2 },
      { variant: BIRD.ibis },
      { variant: BIRD.ibis, act: 1 },
      { variant: BIRD.ibis, gait: 1, hz: 1.6 },
      { variant: BIRD.ibis, gait: 2, act: 1, lift: 2 },
    ].map((p) => ({ scale: 1.25, ...p })),
  },
  {
    sp: CRITTERS,
    station: 300,
    gap: 1.2,
    size: 0.4,
    poses: [
      { variant: SMALL.squirrel, scale: 1.7 },
      { variant: SMALL.squirrel2, scale: 1.7, act: 1 },
      { variant: SMALL.squirrel, scale: 1.7, gait: 2, hz: 3 },
      { variant: SMALL.squirrel, scale: 1.7, rest: 1, lift: 0.5 },
      { variant: SMALL.monitor, scale: 1.2, act: 1 },
      { variant: SMALL.monitor, scale: 1.2, gait: 1, hz: 1.2, head: -1 },
      { variant: SMALL.snake, scale: 1.5, head: -1 },
      { variant: SMALL.snake, scale: 1.5, gait: 1, hz: 0.9 },
      { variant: SMALL.skink, scale: 1.8 },
      { variant: SMALL.skink, scale: 1.8, gait: 1, hz: 6 },
    ],
  },
];

export function buildJungleLineup(field: HeightField): Flock[] {
  const road = buildRoadNetwork(field).roads[0].stations;
  const flocks: Flock[] = [];
  for (const row of ROWS) {
    const fl = new Flock(row.sp, row.sp === BIRDS ? Math.max(BIG_BIRDS_MAX, row.poses.length) : row.poses.length);
    flocks.push(fl);
    row.poses.forEach((p, i) => {
      const st = road[Math.round(row.station + (i * row.gap) / 0.5)];
      fl.setup(i, p.variant ?? 0, (i * 0.37) % 1, 1);
      fl.place(i, st.x, st.h + LIFT + (p.lift ?? 0), st.z, Math.atan2(st.tx, st.tz), p.scale ?? 1);
      fl.gait(i, p.gait ?? 0, p.hz ?? 1, 0);
      fl.set(i, CH.gait, p.gait ?? 0, 0, true);
      fl.set(i, CH.rest, p.rest ?? 0, 0, true);
      fl.set(i, CH.head, p.head ?? 0, 0, true);
      fl.set(i, CH.turn, p.turn ?? 0, 0, true);
      fl.set(i, CH.act, p.act ?? 0, 0, true);
    });
    // Cameras from either side (the sun behind one of them), at the middle of the row, close.
    const mid = road[Math.round(row.station + ((row.poses.length - 1) * row.gap) / 2 / 0.5)];
    const d = Math.max(3, row.poses.length * row.gap * 0.42);
    const y = mid.h + LIFT;
    const cams = [1, -1].map((side) => {
      const [nx, nz] = [-mid.tz * side, mid.tx * side];
      return [mid.x + nx * d, y + row.size + d * 0.18, mid.z + nz * d, mid.x, y + row.size * 0.55, mid.z].map((v) => v.toFixed(2)).join(',');
    });
    console.info(`[map] jungle lineup ${row.sp.name}: cam=${cams[0]} · other side cam=${cams[1]}`);
  }
  return flocks;
}
