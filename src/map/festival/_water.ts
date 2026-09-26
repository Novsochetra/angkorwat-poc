import { Euler, Matrix4, Vector3 } from 'three';
import { hash3 } from '../../voxel/random';
import type { HeightField } from '../heightfield';
import { CARRY, FEAT, POSE, ROW_HZ, type Crowd, type Look, type Pose } from '../people/_personModel';
import { moonPath } from '../sky/palette';
import type { MapFrame } from '../types';
import { LAKE_LEVEL } from '../village/_spots';
import { CALLER, CREWS, DRUMMER, dragonBoat, FLOOR, litFloat, ROW_X, ROW_Z, STEERER, type FloatKind } from './_boats';
import { bunting, flag, flagPole, garland } from './_decor';
import { folk, rower } from './_folk';
import { GLOW_MODE, type Glow } from './_glow';
import { ANIM, perPeriod, SHOW, type Kit, type KitUniforms } from './_kit';
import { boatAt, BOATS, MOORINGS, type BoatPose } from './_race';
import { FESTIVAL_SCENE } from './_schedule';

/**
 * Bon Om Touk (the Water Festival) on the great lake and at Angkor Wat.
 *
 * By day: the dragon boat race (`_race.ts`), heat after heat, the crews
 * rowing in time to their drummer, a caller at the bow; crowds on the
 * village beach cheering them in, bunting and flags, the judges' pavilion,
 * start and finish buoys. The lit floats wait moored by the north shore.
 *
 * At night (glow and bloom only, no lights): the boats lie moored off the
 * beach; the three illuminated floats (Loy Pratip: Angkor Wat, the naga, a
 * lotus) drift slowly up and down the lake, their light streaked on the
 * water; floating lotus candles drift out from the beach and float on
 * Angkor Wat's moat; families on the beach kneel facing the full moon with
 * offerings (Sampeah Preah Khae), others sit and watch the floats.
 */

/** Rigs: 1‥4 the dragon boats, 5‥7 the floats. */
const BOAT_RIG = 1;
const FLOAT_RIG = 5;
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
  // ── The four dragon boats and their crews ──
  const seeds = BOATS.map((_, k) => hash3(k, 3, 5, 717));
  CREWS.forEach((crew, k) => {
    dragonBoat(kit, BOAT_RIG + k, crew, k);
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

  // ── The beach: bunting, flags, the judges' pavilion, offering trays for the moon ──
  const poles = [-4, 2, 8, 14, 19].map((z) => [edge(z) + 0.4, z] as const);
  poles.forEach(([x, z], i) => {
    const y = ground(x, z);
    const top = i % 2 === 0 ? 4.3 : 3.9;
    if (i % 2 === 0) flagPole(kit, x, y, z, 5, 1.3, 0.85, Math.PI * 0.9, 'khmer');
    else kit.box(x, y + 2, z, 0.1, 4, 0.1, 0xc8a46a);
    if (i > 0) {
      const [px, pz] = poles[i - 1];
      bunting(kit, px, ground(px, pz) + ((i - 1) % 2 === 0 ? 4.3 : 3.9), pz, x, y + top, z, 0.5);
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
      // The watchers.
      moonPath(moon, f.clock);
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
