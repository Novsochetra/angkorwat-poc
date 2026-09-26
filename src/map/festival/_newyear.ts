import { hash3 } from '../../voxel/random';
import type { HeightField } from '../heightfield';
import { CARRY, FEAT, POSE, type Crowd, type Look, type Pose } from '../people/_personModel';
import type { MapFrame } from '../types';
import { PAGODA } from '../village/_spots';
import { bunting, BUDDHIST, flagPole, garland, PENNANTS, stupaGroup } from './_decor';
import { folk } from './_folk';
import { ANIM, SHOW, type Kit } from './_kit';
import { FESTIVAL_SCENE } from './_schedule';

/**
 * Chaul Chnam Thmey (Khmer New Year), mid-April, the hot dry days before
 * the rains:
 *
 * - sand stupas (Phnom Khsach) with paper flags, marigolds and joss sticks
 *   in Angkor Wat's upper courtyard and in the village pagoda's yard;
 * - flags and bunting: the flag of Cambodia and the Buddhist flag on poles
 *   along the valley road at the River Gate and round the village, strings
 *   of pennants, marigold garlands at the pagoda door, and small coloured
 *   lights on the pagoda's strings at night;
 * - the village plays: children splash each other with water pistols (the
 *   water flies in arcs), young people play Chol Chhoung (two lines toss a
 *   knotted krama back and forth), elders sit on a mat while the young
 *   pour water over them for a blessing, families kneel before two monks
 *   on the pagoda porch, people build and tend the sand stupas, musicians
 *   (roneat and skor drums) play under the village's tamarind.
 */

/** Chol Chhoung: slot seconds (a throw and the throw back), slots in a round. */
const TOSS_T = 6;
const TOSS_N = 5;
/** Water pistols: a round of both sides shooting (s). */
const SPLASH_T = 6;

interface Person {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Pose by day (a function of the time for the games). */
  pose: (now: number) => Pose;
  /** Stays out at night (the pagoda, the musicians), else goes home. */
  late: boolean;
  carry?: boolean;
}

export interface NewYear {
  looks: Look[];
  blocks: number;
  update(f: MapFrame, now: number, dt: number, crowd: Crowd, first: boolean): void;
}

export function buildNewYear(kit: Kit, field: HeightField, villageBuilt: boolean): NewYear {
  const looks: Look[] = [];
  const people: Person[] = [];
  const g = (x: number, z: number) => field.heightAt(x, z);
  /** The pagoda terrace's top (the village part builds it; the bare ground if it is not there). */
  const terrace = (x: number, z: number) => (villageBuilt ? PAGODA.terrace.y : g(x, z));
  const add = (look: Look, p: Person) => {
    looks.push(look);
    people.push(p);
  };
  const still = (p: Pose) => () => p;

  // ── Sand stupas ──
  // (Angkor Wat: in the upper courtyard, either side of the Bakan, clear of its stairs and the corner towers; the terrace top is 64 m)
  const AW_Y = 64;
  for (const sx of [-1, 1]) stupaGroup(kit, sx * 27, AW_Y, -196, 11 + sx);
  // (at the pagoda: on the ground west of the naga stair's foot, in the wat's yard)
  const px = -314;
  const pz = 84;
  stupaGroup(kit, px, g(px, pz), pz, 21, g);

  // ── The pagoda: Buddhist flags at the terrace's corners, bunting to the door, marigolds, lights at night ──
  const T = PAGODA.terrace;
  const corners: [number, number][] = [
    [T.x0 + 0.6, T.z0 + 0.6],
    [T.x1 - 0.6, T.z0 + 0.6],
  ];
  for (const [x, z] of corners) flagPole(kit, x, terrace(x, z), z, 6, 1.5, 1.0, Math.PI * 0.85, 'buddhist');
  const doorY = villageBuilt ? PAGODA.floor : terrace(PAGODA.x, PAGODA.doorZ);
  for (const [x, z] of corners) {
    const top = terrace(x, z) + 5.6;
    bunting(kit, x, top, z, PAGODA.x, doorY + 4.2, PAGODA.doorZ, 0.8, 0.5, BUDDHIST);
    // String lights along it (small glowing bulbs, lit at night).
    for (let i = 1; i < 12; i++) {
      const u = i / 12;
      const bx = x + (PAGODA.x - x) * u;
      const bz = z + (PAGODA.doorZ - z) * u;
      const by = top + (doorY + 4.2 - top) * u - 0.8 * 4 * u * (1 - u) - 0.08;
      kit.box(bx, by, bz, 0.12, 0.12, 0.12, PENNANTS[i % PENNANTS.length], { glow: 0.9 });
    }
  }
  garland(kit, PAGODA.x - 1.6, doorY + 2.6, PAGODA.doorZ - 0.35, PAGODA.x + 1.6, doorY + 2.6, PAGODA.doorZ - 0.35, 0.5);
  garland(kit, PAGODA.x - 1.6, doorY + 2.6, PAGODA.doorZ - 0.35, PAGODA.x - 1.6, doorY + 1.2, PAGODA.doorZ - 0.35, 0);
  garland(kit, PAGODA.x + 1.6, doorY + 2.6, PAGODA.doorZ - 0.35, PAGODA.x + 1.6, doorY + 1.2, PAGODA.doorZ - 0.35, 0);

  // ── Flags and bunting round the village square (below the pagoda) and round the game on the beach ──
  for (const ring of [
    [
      [-316.5, 75.5],
      [-303, 74.5],
      [-301.5, 87.5],
      [-317, 88.5],
    ],
    [
      [-295.5, -2],
      [-283, -2],
      [-283, 12.5],
      [-294, 12.5],
    ],
  ] as [number, number][][])
    ring.forEach(([x, z], i) => {
      const y = g(x, z);
      flagPole(kit, x, y, z, 5, 1.3, 0.85, Math.PI * 0.8, i % 2 === 0 ? 'khmer' : 'buddhist');
      const [nx, nz] = ring[(i + 1) % ring.length];
      bunting(kit, x, y + 4.4, z, nx, g(nx, nz) + 4.4, nz, 0.7);
    });
  // Across the lane to the jetty.
  bunting(kit, -292, g(-292, 60) + 4, 60, -302, g(-302, 70) + 4, 70, 0.6);
  kit.box(-292, g(-292, 60) + 2.1, 60, 0.1, 4.2, 0.1, 0xc8a46a);
  kit.box(-302, g(-302, 70) + 2.1, 70, 0.1, 4.2, 0.1, 0xc8a46a);

  // ── The valley road at the River Gate: flags both sides ──
  roadFlags(kit, field);

  // ── Chol Chhoung: two lines, a knotted krama flying between them ──
  // (on the beach north of the houses, the lake behind the west line)
  const A = [0, 1, 2, 3, 4].map((i) => ({ x: -293.2, z: 0.8 + i * 2.2 }));
  const B = [0, 1, 2, 3, 4].map((i) => ({ x: -284.8, z: 1.4 + i * 2.2 }));
  const pairOf = (k: number) => [(k * 2) % 5, (k * 3 + 1) % 5];
  const tossPose = (line: 'A' | 'B', i: number) => (now: number) => {
    const c = ((now % (TOSS_T * TOSS_N)) + TOSS_T * TOSS_N) % (TOSS_T * TOSS_N);
    const k = Math.floor(c / TOSS_T);
    const tau = c - k * TOSS_T;
    const [a, b] = pairOf(k);
    if (line === 'A' && i === a) return tau < 0.6 ? POSE.point : tau > 4.6 ? POSE.look : POSE.stand;
    if (line === 'B' && i === b) return tau > 1.6 && tau < 3.0 ? POSE.look : tau >= 3.0 && tau < 3.6 ? POSE.point : POSE.stand;
    return hash3(i, k, line === 'A' ? 1 : 2, 71) < 0.3 ? POSE.wave : POSE.stand;
  };
  A.forEach((p, i) => add(folk('man', 500 + i), { x: p.x, y: g(p.x, p.z), z: p.z, yaw: Math.PI / 2, pose: tossPose('A', i), late: false }));
  B.forEach((p, i) => add(folk('woman', 520 + i), { x: p.x, y: g(p.x, p.z), z: p.z, yaw: -Math.PI / 2, pose: tossPose('B', i), late: false }));
  for (let k = 0; k < TOSS_N; k++) {
    const [a, b] = pairOf(k);
    const ax = A[a].x + 0.5;
    const ay = g(A[a].x, A[a].z) + 2.1;
    const az = A[a].z - 0.4;
    const bx = B[b].x - 0.5;
    const by = g(B[b].x, B[b].z) + 2.1;
    const bz = B[b].z + 0.4;
    const o = { anim: ANIM.toss, a: [k / TOSS_N, TOSS_T, 3.2] as [number, number, number], b: [bx - ax, by - ay, bz - az, TOSS_N] as [number, number, number, number], show: SHOW.day };
    kit.box(ax, ay, az, 0.28, 0.24, 0.28, 0xb8322c, o);
    kit.box(ax, ay - 0.05, az, 0.3, 0.06, 0.12, 0xf0ece0, o);
    kit.box(ax, ay - 0.2, az + 0.08, 0.1, 0.25, 0.08, 0xb8322c, o);
  }

  // ── Water pistols: four pairs of children, each side in turn, the water in arcs ──
  // (in the village square below the pagoda, between the stupas and the tamarind)
  const kidsAt: [number, number, number, number][] = [
    [-311.5, 77, -308, 80],
    [-307, 75.5, -304.5, 78.8],
    [-310.8, 81.2, -313.8, 78.6],
    [-306.2, 82.4, -308.8, 84.8],
  ];
  const TOYS = [0x33c0ff, 0xff5ab4, 0x7cdd3a, 0xffb020, 0xa07aff];
  kidsAt.forEach(([ax, az, bx, bz], i) => {
    const ya = g(ax, az);
    const yb = g(bx, bz);
    const yawA = Math.atan2(bx - ax, bz - az);
    const yawB = yawA + Math.PI;
    const shooter = (half: number) => (now: number) => {
      const c = ((now + i * 1.3) % SPLASH_T) / SPLASH_T;
      const mine = half === 0 ? c < 0.42 : c >= 0.5 && c < 0.92;
      const theirs = half === 0 ? c >= 0.5 && c < 0.92 : c < 0.42;
      return mine ? POSE.point : theirs ? (hash3(i, half, Math.floor(now / SPLASH_T), 73) < 0.5 ? POSE.cheer : POSE.wave) : POSE.stand;
    };
    add(folk('kid', 600 + i * 2, { carry: CARRY.phone, props: [FEAT.phone], gear: TOYS[i % TOYS.length] }), { x: ax, y: ya, z: az, yaw: yawA, pose: shooter(0), late: false });
    add(folk('kid', 601 + i * 2, { carry: CARRY.phone, props: [FEAT.phone], gear: TOYS[(i + 2) % TOYS.length] }), { x: bx, y: yb, z: bz, yaw: yawB, pose: shooter(1), late: false });
    // The drops: a squirt of 8 from each, in its half of the round.
    for (const [sx, sy, sz, tx, ty, tz, half] of [
      [ax, ya, az, bx, yb, bz, 0],
      [bx, yb, bz, ax, ya, az, 1],
    ] as const) {
      const d = Math.hypot(tx - sx, tz - sz) || 1;
      const ux = (tx - sx) / d;
      const uz = (tz - sz) / d;
      const hx = sx + ux * 0.55 - uz * 0.25;
      const hz = sz + uz * 0.55 + ux * 0.25;
      const hy = sy + 1.2;
      const fly = 0.62;
      for (let k = 0; k < 8; k++) {
        const spread = (hash3(i, k, half, 74) - 0.5) * 0.5;
        const vx = ((tx - hx) / fly) * (0.85 + 0.1 * hash3(i, k, 2, 75)) + -uz * spread;
        const vz = ((tz - hz) / fly) * (0.85 + 0.1 * hash3(i, k, 3, 76)) + ux * spread;
        const vy = (ty + 1.3 - hy + 0.5 * 9.8 * fly * fly) / fly;
        // Phase: this side's half of the round, the round shifted per pair like the poses.
        const ph = (((half === 0 ? 0.04 : 0.54) + (k / 8) * 0.34 - (i * 1.3) / SPLASH_T) % 1 + 1) % 1;
        kit.box(hx, hy, hz, 0.12, 0.12, 0.12, 0xd6eef8, { anim: ANIM.arc, a: [ph, SPLASH_T, fly], b: [vx, vy, vz, 9.8], show: SHOW.day });
      }
    }
  });

  // ── The pagoda: elders blessed with water, families before the monks, stupa builders ──
  const ex = PAGODA.x + 5.2;
  const ez = PAGODA.terrace.z0 + 2.2;
  const ey = terrace(ex, ez);
  kit.box(ex, ey + 0.03, ez, 2.8, 0.06, 1.8, 0xb8322c);
  kit.box(ex, ey + 0.035, ez, 2.6, 0.065, 1.6, 0xe8b84a);
  for (const dx of [-0.7, 0.7]) {
    add(folk('elder', 700 + dx * 10), { x: ex + dx, y: ey + 0.06, z: ez + 0.2, yaw: Math.PI, pose: still(POSE.sit), late: true });
    // Water poured over their shoulders (a slow trickle of drops).
    for (let k = 0; k < 6; k++)
      kit.box(ex + dx + 0.15, ey + 2.25, ez + 0.55, 0.07, 0.09, 0.07, 0xcfeaf6, { anim: ANIM.arc, a: [k / 6 + dx, 4, 0.55], b: [(hash3(k, dx, 1, 77) - 0.5) * 0.3, -0.4, -0.3, 9.8], show: SHOW.day });
  }
  for (const dx of [-1.4, 0, 1.4]) add(folk(dx === 0 ? 'woman' : 'man', 710 + dx * 10), { x: ex + dx * 0.85, y: ey, z: ez + 1.5, yaw: Math.PI, pose: still(POSE.bow), late: false });
  // Two monks on the porch, families kneeling before them.
  const my = doorY;
  for (const dx of [-1.2, 1.2]) add(folk('monk', 720 + dx * 10), { x: PAGODA.x + dx, y: my, z: PAGODA.doorZ - 1.2, yaw: Math.PI, pose: still(POSE.sit), late: true });
  for (let i = 0; i < 4; i++) {
    const x = PAGODA.x - 2.4 + i * 1.6;
    const z = PAGODA.doorZ - 3.6 - (i % 2) * 0.6;
    add(folk(i % 2 ? 'woman' : 'man', 730 + i), { x, y: terrace(x, z), z, yaw: 0, pose: still(POSE.kneel), late: true });
  }
  // At the pagoda's stupas: kneeling, a child with a flag.
  for (let i = 0; i < 3; i++) {
    const a = 0.6 + i * 1.9;
    const x = px + Math.cos(a) * 2.9;
    const z = pz + Math.sin(a) * 2.9;
    add(folk(i === 1 ? 'man' : 'woman', 740 + i), { x, y: g(x, z), z, yaw: Math.atan2(px - x, pz - z), pose: still(POSE.kneel), late: true });
  }
  add(folk('kid', 745, { carry: CARRY.flag }), { x: px + 2.6, y: g(px + 2.6, pz - 2), z: pz - 2, yaw: -2.2, pose: still(POSE.stand), late: false, carry: true });

  // ── The musicians by the play field: roneat, skor drums, a tro (fiddle) ──
  // (by the tamarind, the village's meeting place)
  const mx = -300.5;
  const mz = 82.8;
  const my2 = g(mx, mz);
  kit.box(mx, my2 + 0.03, mz, 2.2, 0.06, 3.2, 0x6a2a8a);
  // Roneat: a boat-shaped wooden stand with its bars.
  kit.box(mx + 0.2, my2 + 0.25, mz - 0.8, 0.45, 0.35, 1.3, 0x7a3a1c);
  for (let i = 0; i < 9; i++) kit.box(mx + 0.2, my2 + 0.45, mz - 1.35 + i * 0.14, 0.34, 0.03, 0.1, 0xd8b070);
  // Skor: two drums.
  kit.box(mx + 0.3, my2 + 0.3, mz + 0.7, 0.45, 0.55, 0.45, 0x8a2a1c);
  kit.box(mx + 0.3, my2 + 0.58, mz + 0.7, 0.4, 0.02, 0.4, 0xe8dcc0);
  kit.box(mx - 0.3, my2 + 0.22, mz + 1.2, 0.36, 0.4, 0.36, 0x8a2a1c);
  add(folk('man', 760), { x: mx - 0.4, y: my2 + 0.06, z: mz - 0.8, yaw: Math.PI / 2, pose: still(POSE.sit), late: true });
  add(folk('man', 761), { x: mx - 0.4, y: my2 + 0.06, z: mz + 0.8, yaw: Math.PI / 2, pose: still(POSE.sit), late: true });
  add(folk('woman', 762), { x: mx - 0.2, y: my2 + 0.06, z: mz + 0.05, yaw: Math.PI / 2 + 0.3, pose: still(POSE.sit), late: true });

  // ── Angkor Wat's courtyard: people at the stupas ──
  for (const [x, z, p] of [
    [-24.6, -193.3, POSE.kneel],
    [24.8, -193.0, POSE.kneel],
    [29.6, -193.5, POSE.stand],
  ] as const)
    add(folk(x < 0 ? 'woman' : 'man', 780 + x), { x, y: AW_Y, z, yaw: Math.atan2(Math.sign(x) * 27 - x, -196 - z), pose: still(p), late: false });

  const play = { x: -309, y: 7, z: 79 };
  const music = { x: mx, y: my2 + 1, z: mz };
  const current = new Int8Array(people.length).fill(-1);
  return {
    looks,
    blocks: kit.count,
    update(f, now, _dt, crowd, first) {
      const late = f.night > 0.6;
      FESTIVAL_SCENE.music = music;
      FESTIVAL_SCENE.play = late ? null : play;
      for (let i = 0; i < people.length; i++) {
        const p = people[i];
        if (late && !p.late) {
          crowd.hide(i);
          current[i] = -1;
          continue;
        }
        crowd.place(i, p.x, p.y, p.z, p.yaw);
        const pose = late ? p.pose(0) : p.pose(now);
        if (pose !== current[i] || first) {
          current[i] = pose;
          crowd.pose(i, pose, now, first);
        }
        if (p.carry || looks[i].carry === CARRY.phone) crowd.carry(i, 1, now, first);
      }
    },
  };
}

/** Flags on poles both sides of the valley road near the River Gate (off the bridge and the beacon), pennants between them. */
function roadFlags(kit: Kit, field: HeightField): void {
  const road = field.paths.find((p) => p.name === 'valley road');
  if (!road) return;
  const [axc, , azc] = [-82, 10, 45];
  const s = road.samples;
  const wet = s.map((q) => q.wet);
  const nearWet = (i: number) => {
    for (let k = Math.max(0, i - 7); k <= Math.min(s.length - 1, i + 7); k++) if (wet[k]) return true;
    return false;
  };
  const last: Record<number, [number, number, number] | null> = { [-1]: null, [1]: null };
  let n = 0;
  for (let i = 1; i < s.length - 1; i += 8) {
    const q = s[i];
    const d = Math.hypot(q.x - axc, q.z - azc);
    if (d < 14 || d > 62 || nearWet(i)) {
      last[-1] = last[1] = null;
      continue;
    }
    const dx = s[i + 1].x - s[i - 1].x;
    const dz = s[i + 1].z - s[i - 1].z;
    const l = Math.hypot(dx, dz) || 1;
    for (const side of [-1, 1]) {
      const x = q.x + (-dz / l) * 5.4 * side;
      const z = q.z + (dx / l) * 5.4 * side;
      if (field.waterAt(x, z) !== null) {
        last[side] = null;
        continue;
      }
      const y = field.heightAt(x, z);
      flagPole(kit, x, y, z, 5.5, 1.3, 0.85, Math.atan2(dx, dz) + Math.PI * 0.8 * side, n % 2 ? 'buddhist' : 'khmer');
      const prev = last[side];
      if (prev) bunting(kit, prev[0], prev[1] + 4.6, prev[2], x, y + 4.6, z, 0.7);
      last[side] = [x, y, z];
    }
    n++;
  }
}
