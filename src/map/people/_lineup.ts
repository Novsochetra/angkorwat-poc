import type { HeightField } from '../heightfield';
import { buildRoadNetwork, LIFT, ROAD_W } from '../road/line';
import { dress, type DressOptions, type PersonKind } from './_kinds';
import { CARRY, Crowd, FEAT, POSE, type Pose } from './_personModel';

/**
 * Checking the people (`?people=lineup`): every kind, then every pose, in
 * two rows along the valley road, turned a little from the camera
 * (`lineupturn=<rad>`). The console names a camera for each row (`cam=`
 * for a shot).
 */

/** How far beside the road's middle the rows stand (m). */
const OFF = 3.6;

interface Entry {
  kind: PersonKind;
  seed: number;
  opts?: DressOptions;
  pose?: Pose;
  walk?: number;
  carry?: number;
  pitch?: number;
}

const KINDS: Entry[] = [
  { kind: 'monk', seed: 1, opts: { carry: CARRY.bowl } },
  { kind: 'monk', seed: 2, opts: { carry: CARRY.umbrella } },
  { kind: 'monk', seed: 3, opts: { carry: CARRY.bowl, young: true } },
  { kind: 'monk', seed: 4, opts: { carry: CARRY.broom } },
  { kind: 'guide', seed: 5 },
  { kind: 'guide', seed: 6, opts: { carry: CARRY.umbrella } },
  { kind: 'visitor', seed: 7, opts: { sex: 'f' } },
  { kind: 'visitor', seed: 8, opts: { sex: 'm' } },
  { kind: 'visitor', seed: 9, opts: { sex: 'f', age: 'old' } },
  { kind: 'visitor', seed: 10, opts: { sex: 'm', age: 'old' } },
  { kind: 'visitor', seed: 11, opts: { sex: 'f' } },
  { kind: 'visitor', seed: 12, opts: { sex: 'm' } },
  { kind: 'visitor', seed: 13 },
  { kind: 'kid', seed: 14 },
  { kind: 'kid', seed: 15 },
  { kind: 'kid', seed: 16, opts: { carry: CARRY.kite } },
  { kind: 'fisherman', seed: 17 },
  { kind: 'fisherman', seed: 18 },
  { kind: 'dancer', seed: 19 },
  { kind: 'dancer', seed: 20, opts: { carry: CARRY.torch } },
  { kind: 'villager', seed: 21, opts: { sex: 'f', hat: 'palm' } },
  { kind: 'villager', seed: 22, opts: { sex: 'm', hat: 'palm' } },
  { kind: 'villager', seed: 23, opts: { sex: 'f', hat: 'krama' } },
  { kind: 'villager', seed: 24, opts: { sex: 'm', hat: 'none', carry: CARRY.pole } },
];

const POSES: Entry[] = [
  { kind: 'visitor', seed: 31, opts: { sex: 'm', props: [FEAT.camera] }, pose: POSE.stand },
  { kind: 'visitor', seed: 32, opts: { sex: 'f' }, pose: POSE.stand, walk: 1 },
  { kind: 'monk', seed: 33, opts: { carry: CARRY.umbrella }, pose: POSE.stand, walk: 0.7 },
  { kind: 'visitor', seed: 34, pose: POSE.look },
  { kind: 'visitor', seed: 35, opts: { sex: 'm' }, pose: POSE.point },
  { kind: 'visitor', seed: 36, opts: { sex: 'f', props: [FEAT.camera] }, pose: POSE.photo },
  { kind: 'visitor', seed: 37, opts: { carry: CARRY.phone }, pose: POSE.photo },
  { kind: 'monk', seed: 38, opts: { carry: CARRY.broom }, pose: POSE.sweep },
  { kind: 'monk', seed: 39, pose: POSE.sit },
  { kind: 'monk', seed: 40, pose: POSE.sampeah },
  { kind: 'visitor', seed: 41, pose: POSE.bow },
  { kind: 'guide', seed: 42, pose: POSE.talk, carry: 0.3 },
  { kind: 'visitor', seed: 43, pose: POSE.wave },
  { kind: 'dancer', seed: 44, pose: POSE.dance },
  { kind: 'fisherman', seed: 45, pose: POSE.cast },
  { kind: 'visitor', seed: 46, opts: { sex: 'f' }, pose: POSE.kneel },
  { kind: 'kid', seed: 47, opts: { carry: CARRY.kite }, pose: POSE.stand, pitch: -1 },
  { kind: 'guide', seed: 48, pose: POSE.stand, walk: 1 },
  { kind: 'villager', seed: 49, opts: { sex: 'f', hat: 'palm', props: [FEAT.seedlings] }, pose: POSE.plant },
  { kind: 'villager', seed: 50, opts: { sex: 'm', hat: 'palm', props: [FEAT.sickle] }, pose: POSE.reap },
  { kind: 'villager', seed: 51, opts: { sex: 'm', hat: 'krama', carry: CARRY.pole }, pose: POSE.stand, walk: 0.8 },
];

export function buildPeopleLineup(field: HeightField): { crowd: Crowd; update(t: number, night: number): void } {
  const road = buildRoadNetwork(field).roads[0].stations;
  const crowd = new Crowd(KINDS.length + POSES.length);
  // (kinds on the grass beside the road; poses on its paving, beside the light down its middle)
  const rows: [Entry[], number, number, number][] = [
    [KINDS, 150, 1.5, OFF],
    [POSES, 214, 1.6, 1.25],
  ];
  const turn = Number(new URLSearchParams(location.search).get('lineupturn') ?? 0.5);
  for (const [row, station, gap, off] of rows) {
    const mid = road[Math.round(station + ((row.length - 1) * gap) / 2 / 0.5)];
    const side = mid.tx > 0 ? 1 : -1;
    const [nx, nz] = [-mid.tz * side, mid.tx * side];
    row.forEach((e, k) => {
      const st = road[Math.round(station + (k * gap) / 0.5)];
      const i = crowd.add(dress(e.kind, e.seed, e.opts));
      // On the grass beside the road (out of the road's light), towards the camera, turned a little (`lineupturn=` rad; 1.57: side on).
      const x = st.x + nx * off;
      const z = st.z + nz * off;
      crowd.place(i, x, off > ROAD_W / 2 ? field.heightAt(x, z) : st.h + LIFT, z, Math.atan2(nx, nz) + turn);
      crowd.pose(i, e.pose ?? POSE.stand, 0, true);
      crowd.carry(i, e.carry ?? 1, 0, true);
      crowd.look(i, 0, e.pitch ?? 0, 0, true);
      const walk = e.walk ?? 0;
      crowd.gait(i, walk, walk ? crowd.stepRate(i, walk * 0.9, walk) : 1, 0);
    });
    const d = row.length * gap * 0.55;
    const y = mid.h + LIFT;
    const [cx, cz] = [mid.x + nx * off, mid.z + nz * off];
    const cam = [cx + nx * d, y + 2 + d * 0.18, cz + nz * d, cx, y + 1.3, cz].map((v) => v.toFixed(2)).join(',');
    console.info(`[map] people lineup ${row === KINDS ? 'kinds' : 'poses'}: cam=${cam}`);
  }
  return { crowd, update: (t, night) => crowd.flush(t, night) };
}
