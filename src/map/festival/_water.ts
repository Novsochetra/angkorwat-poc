import { Euler, Matrix4, Vector3 } from 'three';
import { hash3 } from '../../voxel/random';
import type { HeightField } from '../heightfield';
import { CARRY, FEAT, POSE, ROW_HZ, SLOT, type Crowd, type Look, type Pose } from '../people/_personModel';
import { moonPath } from '../sky/palette';
import type { MapFrame } from '../types';
import { LAKE_LEVEL } from '../village/_spots';
import { CALLER, CREWS, DRUMMER, FLOOR, halfBeam, litFloat, raceBoat, ROW_X, ROW_Z, STEERER, type FloatKind } from './_boats';
import { bunting, flag, flagPole, garland } from './_decor';
import { folk, rower } from './_folk';
import { GLOW_MODE, type Glow } from './_glow';
import { ANIM, perPeriod, SHOW, type Kit, type KitUniforms } from './_kit';
import { boatAt, BOATS, CH_BUOYS_Z, CH_CREWS, CH_FINISH, CH_GANGWAY, CH_JUDGES, CH_SEAT, CH_START, CH_WATCHERS, CH_YAW, CHALLENGE, chMoored, MOORINGS, type BoatPose, type ChallengeBoat } from './_race';
import { FESTIVAL_SCENE } from './_schedule';

/**
 * Bon Om Touk (the Water Festival) on the great lake and at Angkor Wat.
 *
 * By day: the racing boat (ngo) race (`_race.ts`), heat after heat, the crews
 * rowing in time to their drummer, a caller at the bow; crowds on the
 * village beach cheering them in, bunting and flags, the judges' pavilion,
 * start and finish buoys. The lit floats wait moored by the north shore.
 *
 * At night (glow and bloom only, no lights): the boats lie moored off the
 * beach; the three illuminated floats (Bandaet Pratip: Angkor Wat, the naga, a
 * lotus) drift slowly up and down the lake, their light streaked on the
 * water; floating lotus candles drift out from the beach and float on
 * Angkor Wat's moat; families on the beach kneel facing the full moon with
 * offerings (Sampeah Preah Khae), others sit and watch the floats.
 *
 * The challenge (_race.ts `CHALLENGE`, the player's race: roam/_raceRow.ts):
 * two more ngo with their crews wait by the north shore at a small landing
 * (a gangway down to the inshore boat, mooring posts, flags, a few people
 * watching), the start and finish buoys of their own lanes, the officials'
 * boat at the finish. While the player is in one, the add-on says where both
 * boats are and how their crews row (their stroke follows his); else they
 * wait at their moorings (their crews go home at night). Their people are the
 * crowd's last ones, drawn only near (`CH_NEAR`) or while he races.
 */

/** Rigs: 1‥4 the racing boats (ngo), 5‥7 the floats, 8‥9 the challenge's boats, 10 its officials' boat. */
const BOAT_RIG = 1;
const FLOAT_RIG = 5;
const CH_RIG = 8;
const JUDGE_RIG = 10;
/** The challenge's people are drawn while the camera is this near the landing (m), or while he races. */
const CH_NEAR = 300;
const CH_HUB = { x: -400, z: -32 };
const FLOATS: { kind: FloatKind; x: number; moor: [number, number] }[] = [
  { kind: 'angkor', x: -374, moor: [-512, -38] },
  { kind: 'naga', x: -406, moor: [-540, -39] },
  { kind: 'lotus', x: -438, moor: [-568, -38] },
];
/** Angkor Wat's moat and pools (world rectangles, the water's top). */
const MOAT: [number, number, number, number][] = [
  [-58.5, -166.5, -7.5, -162.5],
  [7.5, -166.5, 58.5, -162.5],
  [-60.5, -198.5, -56.5, -162.5],
  [56.5, -198.5, 60.5, -162.5],
];
const MOAT_Y = 56.8;
/** The village beach north of the houses, where the village watches: its dry edge (x) along z (clear of the nets and boats the village keeps further south). */
const EDGE: [number, number][] = [
  [-8, -304],
  [-2, -301],
  [2, -298.5],
  [8, -295],
  [14, -292.5],
  [20, -291.5],
];
const BEACH_Z: [number, number] = [-1, 17];
function edge(z: number): number {
  if (z <= EDGE[0][0]) return EDGE[0][1];
  for (let i = 1; i < EDGE.length; i++) {
    const [z1, x1] = EDGE[i];
    const [z0, x0] = EDGE[i - 1];
    if (z <= z1) return x0 + ((x1 - x0) * (z - z0)) / (z1 - z0);
  }
  return EDGE[EDGE.length - 1][1];
}

/** Night: the moment the boats go to their moorings and the lights come out. */
const NIGHT = 0.5;
/** The challenge crews' stroke seeds while they wait (any: they rest; fixed, so nothing is sent up every frame). */
const CH_REST = [0.31, 0.74];

interface Seat {
  boat: number;
  x: number;
  y: number;
  z: number;
  /** Faces aft (drummer, caller). */
  back: boolean;
  pose: Pose;
  /** Leans to its side (rowers). */
  side: number;
}

export interface WaterFestival {
  looks: Look[];
  blocks: number;
  /** Once a frame while it is on. */
  update(f: MapFrame, now: number, dt: number, crowd: Crowd, first: boolean): void;
}

export function buildWaterFestival(kit: Kit, glow: Glow, u: KitUniforms, field: HeightField): WaterFestival {
  const looks: Look[] = [];
  const seats: Seat[] = [];
  // ── The four racing boats (ngo) and their crews ──
  const seeds = BOATS.map((_, k) => hash3(k, 3, 5, 717));
  CREWS.forEach((crew, k) => {
    raceBoat(kit, BOAT_RIG + k, crew, k);
    const stroke = seeds[k];
    for (const z of ROW_Z)
      for (const side of [1, -1]) {
        seats.push({ boat: k, x: side * ROW_X, y: FLOOR, z, back: false, pose: POSE.row, side });
        looks.push(rower(crew.shirt, k * 40 + seats.length, stroke));
      }
    seats.push({ boat: k, x: DRUMMER.x, y: DRUMMER.y, z: DRUMMER.z, back: true, pose: POSE.row, side: 0 });
    looks.push(rower(crew.shirt, k * 40 + 30, stroke));
    seats.push({ boat: k, x: CALLER.x, y: CALLER.y, z: CALLER.z, back: true, pose: POSE.cheer, side: 0 });
    looks.push({ ...folk('man', k * 40 + 31), seed: stroke });
    seats.push({ boat: k, x: STEERER.x, y: STEERER.y, z: STEERER.z, back: false, pose: POSE.stand, side: 0 });
    looks.push(rower(crew.shirt, k * 40 + 32, stroke));
  });
  const crewCount = looks.length;

  // ── The village on the beach: watchers by day, moon salute and float watchers by night ──
  interface Watcher {
    x: number;
    z: number;
    y: number;
    yaw: number;
    kid: boolean;
    /** At night: kneel to the moon at a tray (group), sit and watch the floats, or go home. */
    night: 'moon' | 'sit' | 'home';
    nx: number;
    nz: number;
    ny: number;
  }
  const watchers: Watcher[] = [];
  const ground = (x: number, z: number) => field.heightAt(x, z);
  const trays: [number, number][] = [2.5, 8.5, 14.5].map((z) => [edge(z) + 1.2, z]);
  for (let i = 0; i < 30; i++) {
    const r1 = hash3(i, 1, 2, 31);
    const r2 = hash3(i, 2, 3, 32);
    const kid = i % 4 === 1;
    const z = BEACH_Z[0] + (BEACH_Z[1] - BEACH_Z[0]) * ((i + r1 * 0.8) / 30);
    const row = kid ? 0 : 1 + Math.floor(r2 * 2);
    const x = edge(z) + 1.3 + row * 1.4 + r2 * 0.6;
    const role = kid ? 'kid' : i % 3 === 0 ? 'man' : 'woman';
    const carry = !kid && r1 > 0.8 ? CARRY.umbrella : !kid && r1 < 0.12 ? CARRY.flag : CARRY.none;
    looks.push(folk(role, 300 + i, { carry }));
    const g = i < 12 ? trays[i % 3] : null;
    const a = (Math.floor(i / 3) / 4) * Math.PI * 2 + 0.4;
    const nx = g ? g[0] + 0.9 + Math.cos(a) * 1.2 : x + 0.5;
    const nz = g ? g[1] + Math.sin(a) * 1.4 : z;
    watchers.push({ x, z, y: ground(x, z), yaw: -Math.PI / 2 + (r2 - 0.5) * 0.5, kid, night: g ? 'moon' : i < 22 ? 'sit' : 'home', nx, nz, ny: ground(nx, nz) });
  }
  const watchFirst = crewCount;
  /** At night the watchers put their umbrellas and flags away. */
  const plain = looks.slice(watchFirst).map((l) => ({ ...l, carry: CARRY.none, feats: l.feats.filter((f) => f !== FEAT.umbrella && f !== FEAT.flag) }));

  // ── The challenge (the player's race, _race.ts): its two crews, the officials, the landing's people (the crowd's last ones) ──
  const chFirst = looks.length;
  const chSeats: Seat[] = [];
  CH_CREWS.forEach((crew, k) => {
    for (const z of ROW_Z)
      for (const side of [1, -1]) {
        chSeats.push({ boat: k, x: side * ROW_X, y: FLOOR, z, back: false, pose: POSE.row, side });
        looks.push(rower(crew.shirt, 600 + k * 40 + chSeats.length, CH_REST[k]));
      }
    chSeats.push({ boat: k, x: DRUMMER.x, y: DRUMMER.y, z: DRUMMER.z, back: true, pose: POSE.row, side: 0 });
    looks.push(rower(crew.shirt, 600 + k * 40 + 30, CH_REST[k]));
    chSeats.push({ boat: k, x: CALLER.x, y: CALLER.y, z: CALLER.z, back: true, pose: POSE.cheer, side: 0 });
    looks.push({ ...folk('man', 600 + k * 40 + 31), seed: CH_REST[k] });
    chSeats.push({ boat: k, x: STEERER.x, y: STEERER.y, z: STEERER.z, back: false, pose: POSE.stand, side: 0 });
    looks.push(rower(crew.shirt, 600 + k * 40 + 32, CH_REST[k]));
  });
  /** The officials in their boat (its space): the one at the bow raises the flag of Cambodia as the boats cross, two sit on the benches. */
  const officials: { x: number; z: number; pose: Pose; flag: boolean }[] = [
    { x: -0.05, z: 1.75, pose: POSE.stand, flag: true },
    { x: 0.05, z: 0.15, pose: POSE.stool, flag: false },
    { x: 0.05, z: -1.25, pose: POSE.stool, flag: false },
  ];
  const officialFirst = looks.length;
  officials.forEach((o, i) => looks.push(official(700 + i, o.flag)));
  const chWatchFirst = looks.length;
  const chWatchY = CH_WATCHERS.map(([x, z]) => ground(x, z));
  CH_WATCHERS.forEach((_, i) => looks.push(folk(i === 2 || i === 5 ? 'kid' : i % 2 ? 'woman' : 'man', 720 + i, { carry: i === 1 || i === 4 ? CARRY.flag : CARRY.none })));
  const chSlot = new Int32Array(CH_WATCHERS.length).fill(-1);

  // ── The beach: bunting, flags, the judges' pavilion, offering trays for the moon ──
  const poles = [-4, 2, 8, 14, 19].map((z) => [edge(z) + 0.4, z] as const);
  poles.forEach(([x, z], i) => {
    const y = ground(x, z);
    const top = i % 2 === 0 ? 4.3 : 3.9;
    if (i % 2 === 0) flagPole(kit, x, y, z, 5, 1.3, 0.85, Math.PI * 0.9, 'khmer');
    else kit.box(x, y + 2, z, 0.1, 4, 0.1, 0xc8a46a);
    if (i > 0) {
      const [px, pz] = poles[i - 1];
      bunting(kit, px, ground(px, pz) + ((i - 1) % 2 === 0 ? 4.3 : 3.9), pz, x, y + top, z, 0.5, undefined, undefined, undefined, ground);
    }
  });
  pavilion(kit, -297.5, ground(-297.5, -8.5), -8.5);
  for (const [tx, tz] of trays) tray(kit, glow, tx + 0.9, ground(tx + 0.9, tz), tz);

  // ── Start and finish buoys ──
  for (const x of [-548, -348])
    for (const z of [1, 13, 25]) {
      kit.box(x, LAKE_LEVEL + 0.1, z, 0.7, 0.45, 0.7, 0xd8312a);
      kit.box(x, LAKE_LEVEL + 0.35, z, 0.72, 0.1, 0.72, 0xf4f0e6);
      kit.box(x, LAKE_LEVEL + 1.9, z, 0.07, 3.2, 0.07, 0xd8d0c0);
      flag(kit, x, LAKE_LEVEL + 3.2, z, 0.9, 0.55, Math.PI, x > -400 ? 0xd8312a : 0xf6c21a);
    }

  // ── The challenge: its two boats (his with a thwart of his own behind the last pair), the landing, its buoys, the officials' boat ──
  CH_CREWS.forEach((crew, k) => raceBoat(kit, CH_RIG + k, crew, 20 + k));
  {
    const o = { rig: CH_RIG };
    const x1 = halfBeam(CH_SEAT.z) - 0.12;
    kit.box((x1 - 0.06) / 2, CH_SEAT.y - 0.035, CH_SEAT.z, x1 + 0.06, 0.07, 0.32, 0x5c3a22, o);
    kit.box(x1 / 2, (FLOOR + CH_SEAT.y - 0.07) / 2, CH_SEAT.z, 0.08, CH_SEAT.y - 0.07 - FLOOR, 0.08, 0x4a2e1a, o);
  }
  gangway(kit, ground);
  // Mooring stakes along the shore, the flag of Cambodia and bunting over the landing, a striped pole on the finish line.
  for (const [x, z] of [
    [-378.2, -41.8],
    [-401.6, -42.4],
    [-405.6, -42.1],
    [-427.8, -41.2],
  ])
    stake(kit, x, z, ground(x, z));
  const flagA: [number, number] = [-389.6, -46.6];
  const flagB: [number, number] = [-371.2, -41.4];
  flagPole(kit, flagA[0], ground(...flagA), flagA[1], 5.2, 1.3, 0.85, Math.PI * 0.95, 'khmer');
  flagPole(kit, flagB[0], ground(...flagB), flagB[1], 4.6, 0.9, 0.5, Math.PI * 0.9, CH_CREWS[0].band);
  bunting(kit, flagA[0], ground(...flagA) + 4.6, flagA[1], flagB[0], ground(...flagB) + 4.1, flagB[1], 0.8, undefined, undefined, undefined, ground);
  {
    const x = CH_FINISH;
    const z = -41.3;
    const y = ground(x, z);
    for (let i = 0; i < 6; i++) kit.box(x, y + 0.3 + i * 0.6, z, 0.14, 0.6, 0.14, i % 2 ? 0xf4f0e6 : 0xd8312a);
    flag(kit, x, y + 3.6, z, 1.0, 0.6, Math.PI, 0xd8312a);
  }
  for (const [x, color] of [
    [CH_START, 0xf6c21a],
    [CH_FINISH, 0xd8312a],
  ] as const)
    for (const z of CH_BUOYS_Z) {
      kit.box(x, LAKE_LEVEL + 0.1, z, 0.7, 0.45, 0.7, 0xd8312a);
      kit.box(x, LAKE_LEVEL + 0.35, z, 0.72, 0.1, 0.72, 0xf4f0e6);
      kit.box(x, LAKE_LEVEL + 1.9, z, 0.07, 3.2, 0.07, 0xd8d0c0);
      flag(kit, x, LAKE_LEVEL + 3.2, z, 0.9, 0.55, Math.PI, color);
    }
  judgesBoat(kit, JUDGE_RIG);

  // ── The lit floats ──
  FLOATS.forEach((fl, i) => {
    litFloat(kit, FLOAT_RIG + i, fl.kind);
    const rig = FLOAT_RIG + i;
    for (const lx of [-4, 0, 4]) {
      glow.add(lx, lx === 0 ? 6 : 4, 0.6, 0xffb860, 8, { rig, level: 0.12 });
      glow.add(lx, 0, 3.2, 0xffb050, 16, { rig, mode: GLOW_MODE.streak, level: 1.6, width: 2.2 });
    }
  });

  // ── Floating candles: Angkor Wat's moat, and out from the beach at night ──
  const candle = (x: number, y: number, z: number, drift: { a: [number, number, number]; b: [number, number, number, number] }, i: number) => {
    const d = { show: SHOW.night, anim: ANIM.drift, a: drift.a, b: drift.b };
    const petal = hash3(i, 7, 1, 55) < 0.5 ? 0xf29ab8 : 0xf6f0e4;
    kit.box(x, y + 0.05, z, 0.46, 0.1, 0.46, 0x5f9a3a, d);
    kit.box(x, y + 0.14, z, 0.3, 0.14, 0.3, petal, d);
    kit.box(x, y + 0.26, z, 0.05, 0.14, 0.05, 0xf4ecd8, d);
    kit.box(x, y + 0.37, z, 0.06, 0.09, 0.06, 0xffc070, { ...d, glow: 2.2 });
    glow.add(x, y + 0.38, z, 0xffa850, 1.5, { drift, level: 0.55 });
    glow.add(x, y + 0.01, z, 0xffa040, 5, { drift, mode: GLOW_MODE.streak, level: 1.5, width: 0.28 });
  };
  let ci = 0;
  for (const [x0, z0, x1, z1] of MOAT) {
    const area = (x1 - x0) * (z1 - z0);
    const n = Math.round(area / 9);
    for (let i = 0; i < n; i++, ci++) {
      const x = x0 + 0.6 + (x1 - x0 - 1.2) * hash3(ci, 1, 9, 41);
      const z = z0 + 0.6 + (z1 - z0 - 1.2) * hash3(ci, 2, 9, 42);
      candle(x, MOAT_Y, z, { a: [0, hash3(ci, 3, 9, 43), 0.25 + 0.35 * hash3(ci, 4, 9, 44)], b: [0, 0, perPeriod(0.03 + 0.05 * hash3(ci, 5, 9, 45)), 0] }, ci);
    }
  }
  // (set on the water at the beach's north end, clear of the village's net fences further south, and a few already far out)
  for (let i = 0; i < 46; i++, ci++) {
    const near = i < 34;
    const zn = -5 + 10 * hash3(i, 2, 8, 47);
    const x = near ? edge(zn) - 1.4 : -330 - 24 * hash3(i, 1, 8, 46);
    const z = near ? zn : -6 + 24 * hash3(i, 3, 8, 48);
    const ang = -Math.PI / 2 - 0.08 + (hash3(i, 4, 8, 49) - 0.5) * 0.6;
    candle(x, LAKE_LEVEL, z, { a: [1, hash3(i, 5, 8, 50), near ? 30 + 22 * hash3(i, 6, 8, 51) : 40], b: [Math.sin(ang), Math.cos(ang), 300, 0] }, ci);
  }

  // ── Every frame ──
  const pose: BoatPose = { x: 0, z: 0, yaw: 0, row: 0, speed: 0, racing: false, toGo: 0 };
  const amp = [0, 0, 0, 0];
  const M = new Matrix4();
  const v = new Vector3();
  const moon = new Vector3();
  const boats = FESTIVAL_SCENE.boats;
  for (let k = 0; k < 4; k++) boats.push({ x: 0, y: 0, z: 0, row: 0, stroke: 0, racing: false });
  /** A challenge boat at its mooring (worked out each frame while the add-on does not hold them), and the landing's cheer as last picked. */
  const idle: ChallengeBoat = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, speed: 0, stroke: 0, row: 0, mood: 0 };
  let chCheer = 0;
  /** The pose now of each watcher (writes only on change), re-picked every few seconds. */
  const slot = new Int32Array(watchers.length).fill(-1);
  let lastNight = -1;

  return {
    looks,
    blocks: kit.count,
    update(f, now, dt, crowd, first) {
      const night = f.night >= NIGHT;
      const nightChanged = (night ? 1 : 0) !== lastNight;
      lastNight = night ? 1 : 0;
      // Boats: racing by day, moored at night.
      let excite = 0;
      for (let k = 0; k < 4; k++) {
        const rig = BOAT_RIG + k;
        let x;
        let z;
        let yaw;
        let target = 0;
        let speed = 0;
        if (night) {
          [x, z, yaw] = MOORINGS[k];
        } else {
          boatAt(k, now, pose);
          x = pose.x;
          z = pose.z;
          yaw = pose.yaw;
          target = pose.row;
          speed = pose.speed;
          if (pose.racing) excite = Math.max(excite, 1 - Math.min(1, pose.toGo / 110));
        }
        amp[k] = first || nightChanged ? target : amp[k] + (target - amp[k]) * (1 - Math.exp(-dt * 1.5));
        const bob = Math.sin(now * 1.1 + k * 1.7) * 0.03;
        // (the boat surges a little with each stroke)
        const x0 = fractional(now * ROW_HZ + seeds[k]);
        const surge = 0.06 * amp[k] * Math.sin(x0 * Math.PI * 2);
        M.makeRotationFromEuler(eul.set(0.012 * Math.sin(now * 0.9 + k), yaw, 0.01 * Math.sin(now * 0.7 + k * 2), 'YXZ'));
        M.setPosition(x + Math.sin(yaw) * surge, LAKE_LEVEL + bob, z + Math.cos(yaw) * surge);
        u.uRig.value[rig].copy(M);
        u.uRigRow.value[rig].set(amp[k], seeds[k], Math.min(1, speed / 3.4), 0);
        const b = boats[k];
        b.x = x;
        b.y = LAKE_LEVEL + 1;
        b.z = z;
        b.row = amp[k];
        b.stroke = now * ROW_HZ + seeds[k];
        b.racing = !night && pose.racing;
      }
      // Floats: moored by day, drifting at night (their pictures face east, to the village).
      FLOATS.forEach((fl, i) => {
        const rig = FLOAT_RIG + i;
        if (night) {
          const zz = 14 + 22 * Math.sin((now / 600) * Math.PI * 2 + i * 2.1);
          M.makeRotationFromEuler(eul.set(0, Math.PI / 2 + 0.02 * Math.sin(now * 0.2 + i), 0.006 * Math.sin(now * 0.5 + i), 'YXZ'));
          M.setPosition(fl.x, LAKE_LEVEL + 0.02 * Math.sin(now * 0.8 + i), zz);
        } else {
          M.makeRotationY(0);
          M.setPosition(fl.moor[0], LAKE_LEVEL, fl.moor[1]);
        }
        u.uRig.value[rig].copy(M);
      });
      // Crews: in their boats by day; ashore at night (hidden).
      for (let i = 0; i < seats.length; i++) {
        const s = seats[i];
        if (night) {
          crowd.hide(i);
          continue;
        }
        const Mb = u.uRig.value[BOAT_RIG + s.boat];
        v.set(s.x, s.y, s.z).applyMatrix4(Mb);
        const e = Mb.elements;
        const yaw = Math.atan2(e[8], e[10]) + (s.back ? Math.PI : 0);
        crowd.place(i, v.x, v.y, v.z, yaw);
        // (the caller calls the stroke while they row)
        crowd.pose(i, s.pose === POSE.cheer && amp[s.boat] < 0.3 ? POSE.stand : s.pose, now, first);
        if (s.pose === POSE.row) {
          crowd.gait(i, Math.round(amp[s.boat] * 20) / 20, 0, now);
          crowd.look(i, s.side * 0.4, 0, now, first);
        }
      }
      // The challenge (_race.ts): its boats where the add-on puts them while he is in one, else at their moorings.
      const ch = CHALLENGE;
      for (let k = 0; k < 2; k++) {
        const b = ch.active ? ch.boats[k] : chMoored(k, now, idle);
        M.makeRotationFromEuler(eul.set(b.pitch, b.yaw, b.roll, 'YXZ'));
        M.setPosition(b.x, b.y, b.z);
        u.uRig.value[CH_RIG + k].copy(M);
        u.uRigRow.value[CH_RIG + k].set(ch.active ? b.row : 0, ch.active ? fractional(b.stroke - now * ROW_HZ) : CH_REST[k], ch.active ? Math.min(1, b.speed / 3.4) : 0, 0);
      }
      // (the officials' boat rocks at its anchor)
      M.makeRotationFromEuler(eul.set(0.008 * Math.sin(now * 0.7), CH_YAW, 0.014 * Math.sin(now * 0.9 + 1), 'YXZ'));
      M.setPosition(CH_JUDGES[0], LAKE_LEVEL + Math.sin(now * 1.0 + 0.4) * 0.03, CH_JUDGES[1]);
      u.uRig.value[JUDGE_RIG].copy(M);
      // Their people: by day (at night they go home, unless he is racing), drawn only near the landing or while he races.
      const chOn = ch.active || !night;
      const cam = f.camera.position;
      crowd.mesh.count = ch.active || Math.hypot(cam.x - CH_HUB.x, cam.z - CH_HUB.z) < CH_NEAR ? looks.length : chFirst;
      for (let s = 0; s < chSeats.length; s++) {
        const i = chFirst + s;
        const st = chSeats[s];
        if (!chOn) {
          crowd.hide(i);
          continue;
        }
        const b = ch.boats[st.boat];
        const Mb = u.uRig.value[CH_RIG + st.boat];
        v.set(st.x, st.y, st.z).applyMatrix4(Mb);
        const e = Mb.elements;
        crowd.place(i, v.x, v.y, v.z, Math.atan2(e[8], e[10]) + (st.back ? Math.PI : 0));
        // (the crew rows to the add-on's stroke, his; a crew that won stands up cheering, one that lost rests, heads down)
        const row = ch.active ? b.row : 0;
        const mood = ch.active ? b.mood : 0;
        crowd.reseed(i, ch.active ? fractional(b.stroke - now * ROW_HZ) : CH_REST[st.boat]);
        const p: Pose = mood > 0 ? POSE.cheer : st.pose === POSE.cheer ? (row >= 0.3 ? POSE.cheer : POSE.stand) : st.pose;
        crowd.pose(i, p, now, first);
        if (p === POSE.row) {
          crowd.gait(i, Math.round(row * 20) / 20, 0, now);
          crowd.look(i, mood < 0 ? 0 : st.side * 0.4, mood < 0 ? 0.4 : 0, now, first);
        }
      }
      const MJ = u.uRig.value[JUDGE_RIG];
      for (let j = 0; j < officials.length; j++) {
        const i = officialFirst + j;
        if (!chOn) {
          crowd.hide(i);
          continue;
        }
        const o = officials[j];
        v.set(o.x, 0.1, o.z).applyMatrix4(MJ);
        // (facing the lanes, south)
        crowd.place(i, v.x, v.y, v.z, CH_YAW - Math.PI / 2);
        crowd.pose(i, o.pose, now, first);
        if (o.flag) crowd.carry(i, ch.flag, now, first);
      }
      // (the landing's people: watching, pointing, cheering as the boats come in; a new mood every few seconds, at once when the cheer changes)
      const cheerJump = Math.abs(ch.cheer - chCheer) > 0.25;
      if (cheerJump) chCheer = ch.cheer;
      for (let j = 0; j < CH_WATCHERS.length; j++) {
        const i = chWatchFirst + j;
        if (!chOn) {
          crowd.hide(i);
          continue;
        }
        const [wx, wz, wyaw] = CH_WATCHERS[j];
        crowd.place(i, wx, chWatchY[j], wz, wyaw);
        const k = Math.floor(now / 4 + hash3(j, 2, 2, 81) * 4);
        if (k !== chSlot[j] || first || cheerJump) {
          chSlot[j] = k;
          const r = hash3(j, k, 4, 82);
          const c = chCheer;
          const next: Pose = r < c * 0.75 ? POSE.cheer : r < c * 0.92 ? POSE.wave : r < 0.3 ? POSE.look : r < 0.42 ? POSE.point : r < 0.5 ? POSE.photo : POSE.stand;
          const flagged = looks[i].carry !== CARRY.none;
          crowd.pose(i, flagged ? (next === POSE.cheer || next === POSE.wave ? POSE.wave : POSE.stand) : next, now, first);
          crowd.look(i, (hash3(j, k, 5, 83) - 0.5) * 0.8, -0.05, now, first);
        }
        if (looks[i].carry !== CARRY.none) crowd.carry(i, 1, now, first);
      }
      excite = Math.max(excite, ch.cheer);
      // The watchers.
      moonPath(moon, f.clock, f.moonHigh);
      const moonYaw = Math.atan2(moon.x, moon.z);
      FESTIVAL_SCENE.crowd = { x: edge(8) + 3, y: 7, z: 8, cheer: night ? 0 : 0.25 + 0.75 * excite };
      for (let w = 0; w < watchers.length; w++) {
        const i = watchFirst + w;
        const p = watchers[w];
        if (nightChanged && looks[i].carry !== CARRY.none) crowd.dress(i, night ? plain[w] : looks[i]);
        if (night) {
          if (p.night === 'home') {
            crowd.hide(i);
            continue;
          }
          if (p.night === 'moon') {
            crowd.place(i, p.nx, p.ny, p.nz, moonYaw);
            crowd.pose(i, POSE.kneel, now, first || nightChanged);
          } else {
            crowd.place(i, p.x + 0.4, p.y, p.z, -Math.PI / 2 + (p.yaw + Math.PI / 2) * 0.5);
            crowd.pose(i, p.kid ? POSE.sit : w % 3 === 0 ? POSE.stand : POSE.sit, now, first || nightChanged);
          }
          continue;
        }
        // By day: watching, pointing, waving; cheering as a heat comes in (a new mood every few seconds).
        const k = Math.floor(now / 5 + hash3(w, 1, 1, 61) * 5);
        if (k !== slot[w] || first || nightChanged) {
          slot[w] = k;
          const r = hash3(w, k, 3, 62);
          const cheer = excite * (p.kid ? 1 : 0.8);
          const next: Pose = r < cheer * 0.6 ? POSE.cheer : r < cheer * 0.85 ? POSE.wave : r < 0.35 ? POSE.look : r < 0.45 ? POSE.point : r < 0.5 && !p.kid ? POSE.photo : POSE.stand;
          crowd.pose(i, looks[i].carry === CARRY.none ? next : next === POSE.cheer || next === POSE.wave ? POSE.wave : POSE.stand, now, first);
          crowd.look(i, (hash3(w, k, 5, 63) - 0.5) * 0.9, -0.1, now, first);
        }
        crowd.place(i, p.x, p.y, p.z, p.yaw);
        if (looks[i].carry !== CARRY.none) crowd.carry(i, 1, now, first || nightChanged);
      }
    },
  };
}

const eul = new Euler();

function fractional(v: number): number {
  return v - Math.floor(v);
}

/** The judges' pavilion on the beach: a raised floor, four posts, a red roof, bunting (faces west, the lake). */
function pavilion(kit: Kit, x: number, y: number, z: number): void {
  const W = 4.2;
  kit.box(x, y + 0.3, z, W, 0.6, W, 0x8a6a4a);
  kit.box(x - W / 2 - 0.3, y + 0.15, z, 0.6, 0.3, 1.6, 0x8a6a4a);
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ])
    kit.box(x + dx * (W / 2 - 0.2), y + 2.1, z + dz * (W / 2 - 0.2), 0.2, 3, 0.2, 0xe8e0cc);
  // Roof: three stepped tiers of red, gold edges.
  for (let i = 0; i < 3; i++) {
    const s = W + 0.8 - i * 1.5;
    kit.box(x, y + 3.7 + i * 0.45, z, s, 0.4, s, i === 2 ? 0xe8b84a : 0xb02a22);
    kit.box(x, y + 3.52 + i * 0.45, z, s + 0.08, 0.06, s + 0.08, 0xe8b84a);
  }
  kit.box(x, y + 5.4, z, 0.14, 1.0, 0.14, 0xe8b84a);
  // A table with a white cloth, a cup for the winners.
  kit.box(x - 0.6, y + 1.0, z, 0.8, 0.08, 2.2, 0xf4f0e6);
  kit.box(x - 0.6, y + 0.8, z, 0.7, 0.4, 2.0, 0xf0ece0);
  kit.box(x - 0.6, y + 1.2, z, 0.2, 0.3, 0.2, 0xe8c050);
  garland(kit, x - W / 2, y + 3.3, z - W / 2 + 0.2, x - W / 2, y + 3.3, z + W / 2 - 0.2, 0.6);
  bunting(kit, x - W / 2 - 0.2, y + 3.45, z - W / 2, x - W / 2 - 0.2, y + 3.45, z + W / 2, 0.3, 0.4);
}

/** An offering tray for the moon (night only): a low table, bananas, ambok, a coconut, candles and joss sticks. */
function tray(kit: Kit, glow: Glow, x: number, y: number, z: number): void {
  const o = { show: SHOW.night };
  kit.box(x, y + 0.2, z, 0.9, 0.06, 0.6, 0xa82a22, o);
  for (const [dx, dz] of [
    [-0.38, -0.24],
    [0.38, -0.24],
    [0.38, 0.24],
    [-0.38, 0.24],
  ])
    kit.box(x + dx, y + 0.09, z + dz, 0.06, 0.18, 0.06, 0x5a3a22, o);
  kit.box(x - 0.2, y + 0.3, z - 0.1, 0.28, 0.12, 0.18, 0xf2d24a, o);
  kit.box(x + 0.15, y + 0.29, z - 0.12, 0.26, 0.1, 0.2, 0xb8c878, o);
  kit.box(x + 0.2, y + 0.33, z + 0.14, 0.18, 0.18, 0.18, 0x6a8a3a, o);
  for (const dx of [-0.3, 0.3]) {
    kit.box(x + dx, y + 0.3, z + 0.18, 0.05, 0.14, 0.05, 0xf4ecd8, o);
    kit.box(x + dx, y + 0.41, z + 0.18, 0.06, 0.08, 0.06, 0xffc070, { ...o, glow: 2.2 });
    glow.add(x + dx, y + 0.42, z + 0.18, 0xffa850, 1.3, { level: 0.5 });
  }
  kit.box(x, y + 0.45, z + 0.2, 0.02, 0.4, 0.02, 0xb8402a, o);
  kit.box(x, y + 0.66, z + 0.2, 0.03, 0.03, 0.03, 0xff8a3a, { ...o, glow: 1.5 });
}

/** An official of the race: a white shirt with a collar, dark trousers; the flag of Cambodia in the hand of the one who signals. */
function official(seed: number, withFlag: boolean): Look {
  const l = folk('man', seed, { carry: withFlag ? CARRY.flag : CARRY.none });
  for (const slot of [SLOT.top, SLOT.sleeveL, SLOT.sleeveR]) l.colors[slot] = 0xf6f4ee;
  l.colors[SLOT.hips] = l.colors[SLOT.thigh] = 0x2a2e3a;
  l.feats = l.feats.filter((f) => f !== FEAT.kramaNeck);
  if (!l.feats.includes(FEAT.collar)) l.feats.push(FEAT.collar);
  return l;
}

/**
 * The landing's gangway (_race.ts `CH_GANGWAY`): a plank from the grass down onto his boat's gunwale, cleats across
 * it, resting at its head on two stakes in the water (the boat may be out racing).
 */
function gangway(kit: Kit, ground: (x: number, z: number) => number): void {
  const [fx, fy, fz] = CH_GANGWAY.foot;
  const [hx, hy, hz] = CH_GANGWAY.head;
  const run = Math.hypot(hx - fx, hz - fz);
  const len = Math.hypot(run, hy - fy);
  const yaw = Math.atan2(hx - fx, hz - fz);
  // (+pitch dips the box's +z end: the head is lower than the foot)
  const pitch = Math.atan2(fy - hy, run);
  const w = CH_GANGWAY.width;
  kit.box((fx + hx) / 2, (fy + hy) / 2 - 0.04, (fz + hz) / 2, w, 0.08, len + 0.3, 0x8a6440, { yaw, pitch });
  for (let i = 1; i < 9; i++) {
    const t = i / 9;
    kit.box(fx + (hx - fx) * t, fy + (hy - fy) * t + 0.01, fz + (hz - fz) * t, w, 0.05, 0.07, 0x6a4a2e, { yaw, pitch });
  }
  // (the stakes under its head, and a short log it rests on at its foot)
  const sx = Math.cos(yaw) * (w / 2 - 0.05);
  const sz = -Math.sin(yaw) * (w / 2 - 0.05);
  for (const k of [-1, 1]) {
    const x = hx - Math.sin(yaw) * 0.25 + sx * k;
    const z = hz - Math.cos(yaw) * 0.25 + sz * k;
    const bed = Math.min(ground(x, z), LAKE_LEVEL - 0.4);
    kit.box(x, (bed + hy) / 2 - 0.05, z, 0.1, hy - bed + 0.1, 0.1, 0x5a3e26);
  }
  kit.box(fx, fy - 0.12, fz, w + 0.3, 0.16, 0.22, 0x5a3e26, { yaw });
}

/** A mooring stake in the shallows or on the bank: a post and its darker cap, a few turns of rope. */
function stake(kit: Kit, x: number, z: number, g: number): void {
  const bed = Math.min(g, LAKE_LEVEL - 0.4);
  const top = Math.max(g, LAKE_LEVEL) + 1.1;
  kit.box(x, (bed + top) / 2, z, 0.14, top - bed, 0.14, 0x6a4a2e);
  kit.box(x, top + 0.04, z, 0.17, 0.08, 0.17, 0x4a3220);
  kit.box(x, top - 0.3, z, 0.2, 0.12, 0.2, 0xc8b48a);
}

/**
 * The officials' boat at the finish (rig `rig`: +z ahead, +x port, y 0 the water): a plain wooden boat 6 m long,
 * a white awning over its two benches, the flag of Cambodia at the stern, a red-and-white board on its side
 * facing the lanes.
 */
function judgesBoat(kit: Kit, rig: number): void {
  const o = { rig };
  const HULL = 0x6a4a2e;
  const RIM = 0x2f6aa8;
  const L = 3.1;
  const hb = (z: number) => 0.78 * Math.sqrt(Math.max(0.04, 1 - Math.pow(Math.abs(z) / (L + 0.15), 4)));
  for (let z = -L + 0.25; z < L; z += 0.5) {
    const w = hb(z);
    for (const sx of [-1, 1]) {
      kit.box(sx * (w - 0.05), 0.08, z, 0.1, 0.56, 0.52, HULL, o);
      kit.box(sx * (w - 0.04), 0.38, z, 0.12, 0.08, 0.52, RIM, o);
    }
    kit.box(0, 0.06, z, 2 * w - 0.12, 0.08, 0.52, 0x7a5636, o);
    kit.box(0, -0.2, z, 2 * w - 0.3, 0.08, 0.52, HULL, o);
  }
  // Bow and stern caps.
  for (const k of [-1, 1]) kit.box(0, 0.12, k * (L + 0.02), 0.3, 0.56, 0.2, HULL, o);
  // Benches across (the seated officials), an awning on four poles over them.
  for (const z of [0.15, -1.25]) kit.box(0.25, 0.32, z, 2 * hb(z) - 0.16, 0.07, 0.34, 0x8a6440, o);
  for (const [x, z] of [
    [-0.6, -2.05],
    [0.6, -2.05],
    [-0.6, 0.85],
    [0.6, 0.85],
  ])
    kit.box(x, 1.2, z, 0.06, 1.7, 0.06, 0xd8d0c0, o);
  kit.box(0, 2.08, -0.6, 1.5, 0.06, 3.2, 0xf4f0e6, o);
  for (const k of [-1, 1]) kit.box(k * 0.76, 1.98, -0.6, 0.04, 0.16, 3.2, 0xb02a22, o);
  // The flag of Cambodia at the stern; a board striped red and white on the side facing the lanes (the finish).
  kit.box(0.1, 1.3, -L + 0.35, 0.05, 2.4, 0.05, 0xd8c8a0, o);
  flag(kit, 0.1, 2.2, -L + 0.35, 1.0, 0.66, Math.PI, 'khmer', o);
  for (let i = 0; i < 4; i++) kit.box(-hb(0) - 0.02, 0.62, -0.9 + i * 0.5, 0.04, 0.4, 0.5, i % 2 ? 0xf4f0e6 : 0xd8312a, o);
}
