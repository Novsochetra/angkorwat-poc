import { Group, type PerspectiveCamera } from 'three';
import type { HeightField } from '../heightfield';
import { buildRoadNetwork, LIFT, ROAD_W } from '../road/line';
import { Bicycle } from './_bicycle';
import { dress, type DressOptions, type PersonKind } from './_kinds';
import { CARRY, Crowd, type CrowdOptions, FEAT, FIT, POSE, type Pose } from './_personModel';
import { Rig, RigDef, Things } from './_things';

/**
 * Checking the people (`?people=lineup`): every kind, every pose, and the
 * new life's poses, carries and props (each with the thing it fits: the
 * climber's pole, a stool, the stove and its wok, a bicycle, a hammock), in
 * three rows along the valley road, turned a little from the camera
 * (`lineupturn=<rad>`). The console names a camera for each row (`cam=` for
 * a shot) and one close up for each person (`[map] people lineup new 8
 * ride: cam=… side=…`); `lineupone=new:8` builds that one alone (to look at
 * them from any side). `lod=far` draws them all with the far model.
 */

/** How far beside the road's middle the rows stand (m). */
const OFF = 3.6;

interface Entry {
  kind: PersonKind;
  seed: number;
  opts?: DressOptions;
  pose?: Pose;
  walk?: number;
  /** Step cycles a second (else a walk's). */
  hz?: number;
  carry?: number;
  pitch?: number;
  /** What it fits: a pole to climb (up that high, m), a stool, the stove and wok, a bicycle, a hammock. */
  fit?: 'pole' | 'stool' | 'wok' | 'bike' | 'hammock';
  up?: number;
  /** Name in the console. */
  name?: string;
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
  { kind: 'vendor', seed: 25, opts: { sex: 'f', hat: 'krama', goods: 'fruit' } },
  { kind: 'vendor', seed: 26, opts: { sex: 'f', hat: 'palm', goods: 'greens' } },
  { kind: 'vendor', seed: 27, opts: { sex: 'm', goods: 'fish' } },
  { kind: 'tapper', seed: 28 },
  { kind: 'tapper', seed: 29 },
  { kind: 'pilgrim', seed: 30, opts: { pilgrim: 'elder', sex: 'f' } },
  { kind: 'pilgrim', seed: 31, opts: { pilgrim: 'elder', sex: 'm' } },
  { kind: 'pilgrim', seed: 32, opts: { pilgrim: 'yeaychi' } },
  { kind: 'pilgrim', seed: 33, opts: { pilgrim: 'best', sex: 'f' } },
  { kind: 'pilgrim', seed: 34, opts: { pilgrim: 'best', sex: 'm' } },
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

/** The new life: its poses, carries and props, each with what it fits. */
const NEW: Entry[] = [
  { name: 'climbing', kind: 'tapper', seed: 60, pose: POSE.climb, walk: 1, hz: 0.5, fit: 'pole', up: 1.4 },
  { name: 'at work', kind: 'tapper', seed: 61, pose: POSE.climb, walk: 0, fit: 'pole', up: 2.2 },
  { name: 'squat', kind: 'vendor', seed: 62, opts: { sex: 'f', hat: 'krama' }, pose: POSE.squat },
  { name: 'stir', kind: 'villager', seed: 63, opts: { sex: 'f', hat: 'krama', props: [FEAT.paddle] }, pose: POSE.stir, fit: 'wok' },
  { name: 'stool', kind: 'villager', seed: 64, opts: { sex: 'm', hat: 'none' }, pose: POSE.stool, fit: 'stool' },
  { name: 'eat', kind: 'villager', seed: 65, opts: { sex: 'f', hat: 'none', props: [FEAT.smallBowl] }, pose: POSE.eat, fit: 'stool' },
  { name: 'give', kind: 'vendor', seed: 66, opts: { sex: 'f', props: [FEAT.parcel] }, pose: POSE.give },
  { name: 'give tray', kind: 'vendor', seed: 67, opts: { sex: 'f', carry: CARRY.tray, goods: 'sweets' }, pose: POSE.give },
  { name: 'ride', kind: 'villager', seed: 68, opts: { sex: 'm', hat: 'krama' }, pose: POSE.ride, hz: 0.8, fit: 'bike' },
  { name: 'hammock', kind: 'villager', seed: 69, opts: { sex: 'm', hat: 'none' }, pose: POSE.hammock, fit: 'hammock' },
  { name: 'nod', kind: 'monk', seed: 70, opts: { carry: CARRY.bowl }, pose: POSE.nod },
  { name: 'chant', kind: 'monk', seed: 79, pose: POSE.chant },
  { name: 'head held', kind: 'vendor', seed: 71, opts: { sex: 'f', carry: CARRY.head, goods: 'fruit' }, pose: POSE.stand, walk: 0.8 },
  { name: 'head free', kind: 'vendor', seed: 72, opts: { sex: 'f', carry: CARRY.head, goods: 'greens' }, pose: POSE.stand, walk: 0.8, carry: 0 },
  { name: 'tray', kind: 'vendor', seed: 73, opts: { sex: 'f', carry: CARRY.tray, goods: 'fruit' }, pose: POSE.stand },
  { name: 'tapper', kind: 'tapper', seed: 74, pose: POSE.stand },
  { name: 'offering', kind: 'pilgrim', seed: 75, opts: { pilgrim: 'elder', sex: 'f', props: [FEAT.offering] }, pose: POSE.stand },
  { name: 'pray', kind: 'pilgrim', seed: 76, opts: { pilgrim: 'best', sex: 'f', props: [FEAT.offering] }, pose: POSE.sampeah },
  { name: 'kneel', kind: 'pilgrim', seed: 77, opts: { pilgrim: 'yeaychi', props: [FEAT.offering] }, pose: POSE.kneel },
  { name: 'pouch', kind: 'vendor', seed: 78, opts: { sex: 'm' }, pose: POSE.talk },
];

/** The things the new poses fit, in the person's model metres (placed at their scale). */
function fitDef(fit: NonNullable<Entry['fit']>): RigDef {
  const d = new RigDef();
  if (fit === 'pole') {
    // A bamboo pole with pegs either side every 0.19 (the palm's ladder), 3 m tall on the map.
    const z = FIT.climb.reach;
    d.box([0, 1.4, z], [0.06, 4.0, 0.06], 0xb8a060);
    for (let y = -0.6; y < 3.2; y += 0.185) d.box([0, y, z - 0.03], [0.24, 0.025, 0.04], 0x8a7440);
  } else if (fit === 'stool') {
    d.box([0, FIT.stool / 2, 0.02], [0.3, FIT.stool, 0.26], 0x3a6ac0);
  } else if (fit === 'wok') {
    // A clay stove, the wok on it, the syrup in it.
    const { z, y } = FIT.wok;
    d.box([0, (y - 0.05) / 2, z], [0.62, y - 0.05, 0.56], 0x9a6a4a)
      .box([0, y + 0.04, z], [0.64, 0.12, 0.64], 0x2a2a2a)
      .box([0, y + 0.1, z], [0.54, 0.01, 0.54], 0x8a4a1a);
  } else if (fit === 'hammock') {
    // The cloth in its sag under the body, rising to the ropes at both ends.
    const { head, feet } = FIT.hammock;
    d.box([0, -0.02, (head + feet) / 2 + 0.05], [0.5, 0.02, 0.9], 0x3a6a8a)
      .box([0, 0.16, head - 0.02], [0.46, 0.02, 0.45], 0x3a6a8a, { rot: [0.7, 0, 0] })
      .box([0, 0.12, feet + 0.1], [0.46, 0.02, 0.4], 0x3a6a8a, { rot: [-0.55, 0, 0] });
  }
  return d;
}

export function buildPeopleLineup(field: HeightField, opts: Pick<CrowdOptions, 'renderer' | 'still'> = {}): { object: Group; crowd: Crowd; update(t: number, night: number, camera: PerspectiveCamera): void } {
  const road = buildRoadNetwork(field).roads[0].stations;
  const object = new Group();
  const crowd = new Crowd(KINDS.length + POSES.length + NEW.length, 'lineup', { lod: true, ...opts });
  const things = new Things(900);
  object.add(crowd.mesh, crowd.far!, things.mesh);
  const bikes: { bike: Bicycle; i: number; x: number; y: number; z: number; yaw: number }[] = [];
  // (kinds on the grass beside the road; poses on its paving, beside the light down its middle; the new life on the
  // grass past the kinds, up the road (down it, a stream runs by the road); m beside the road's middle, less than 0:
  // across it)
  const rows: [string, Entry[], number, number, number][] = [
    ['kinds', KINDS, 150, 1.5, OFF],
    ['poses', POSES, 214, 1.6, 1.25],
    ['new', NEW, 260, 2.4, OFF],
  ];
  /** Does a row from `station` (`n` people `gap` m apart, `off` m beside the road) stand in water, or a metre from it? */
  const wet = (station: number, n: number, gap: number, off: number): boolean => {
    const mid = road[Math.round(station + ((n - 1) * gap) / 2 / 0.5)];
    const side = (mid.tx > 0 ? 1 : -1) * Math.sign(off);
    for (let k = 0; k < n; k++) {
      const st = road[Math.round(station + (k * gap) / 0.5)];
      const x = st.x - mid.tz * side * Math.abs(off);
      const z = st.z + mid.tx * side * Math.abs(off);
      for (const [dx, dz] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        if (field.waterAt(x + dx, z + dz) !== null) return true;
    }
    return false;
  };
  const params = new URLSearchParams(location.search);
  const turn = Number(params.get('lineupturn') ?? 0.5);
  // (`lineupone=<row>:<k>`: only that one, for cameras all round them)
  const [oneRow, oneK] = (params.get('lineupone') ?? ':').split(':');
  const cam = (x: number, y: number, z: number, nx: number, nz: number, d: number, h: number) =>
    [x + nx * d, y + h, z + nz * d, x, y + 1.1, z].map((v) => v.toFixed(2)).join(',');
  for (let [label, row, station, gap, off] of rows) {
    // (on dry ground: where the land changed and water came to the row, it moves on along the road)
    while (wet(station, row.length, gap, off) && station + 10 + ((row.length - 1) * gap) / 0.5 < road.length) station += 10;
    const mid = road[Math.round(station + ((row.length - 1) * gap) / 2 / 0.5)];
    const side = (mid.tx > 0 ? 1 : -1) * Math.sign(off);
    const [nx, nz] = [-mid.tz * side, mid.tx * side];
    off = Math.abs(off);
    row.forEach((e, k) => {
      if (oneRow && (oneRow !== label || Number(oneK) !== k)) return;
      const st = road[Math.round(station + (k * gap) / 0.5)];
      const i = crowd.add(dress(e.kind, e.seed, e.opts));
      // On the grass beside the road (out of the road's light), towards the camera, turned a little (`lineupturn=` rad; 1.57: side on).
      const x = st.x + nx * off;
      const z = st.z + nz * off;
      const ground = off > ROAD_W / 2 ? field.heightAt(x, z) : st.h + LIFT;
      const yaw = Math.atan2(nx, nz) + turn;
      const k1 = crowd.scale(i);
      crowd.place(i, x, ground + (e.up ?? 0) + (e.fit === 'hammock' ? 0.42 * k1 : 0), z, yaw);
      crowd.pose(i, e.pose ?? POSE.stand, 0, true);
      crowd.carry(i, e.carry ?? 1, 0, true);
      crowd.look(i, 0, e.pitch ?? 0, 0, true);
      const walk = e.walk ?? 0;
      crowd.gait(i, walk, e.hz ?? (walk ? crowd.stepRate(i, walk * 0.9, walk) : 1), 0);
      if (e.fit === 'bike') bikes.push({ bike: new Bicycle(things, e.seed, { load: 'basket' }), i, x, y: ground, z, yaw });
      else if (e.fit) new Rig(things, fitDef(e.fit)).place(x, e.fit === 'pole' ? ground : ground + (e.fit === 'hammock' ? 0.42 * k1 : 0), z, yaw, 0, 0, k1).write();
      // (a close camera in front, and one on their left at the height of their chest)
      const y0 = ground + (e.up ?? 0);
      console.info(`[map] people lineup ${label} ${k} ${e.name ?? e.kind}: cam=${cam(x, y0, z, Math.sin(yaw), Math.cos(yaw), 4.5, 2.8)} side=${cam(x, y0 - 0.2, z, Math.cos(yaw), -Math.sin(yaw), 3.6, 1.4)}`);
    });
    const d = row.length * gap * 0.55;
    const y = mid.h + LIFT;
    const [cx, cz] = [mid.x + nx * off, mid.z + nz * off];
    console.info(`[map] people lineup ${label}: cam=${cam(cx, y, cz, nx, nz, d, 2 + d * 0.3)}`);
  }
  return {
    object,
    crowd,
    update: (t, night, camera) => {
      for (const b of bikes) b.bike.put(b.x, b.y, b.z, b.yaw, crowd.scale(b.i), crowd.phaseOf(b.i, t), t * 1.2);
      crowd.flush(t, night, camera);
      things.flush(night);
    },
  };
}
