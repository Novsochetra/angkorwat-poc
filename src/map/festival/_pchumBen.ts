import { Matrix4 } from 'three';
import type { HeightField } from '../heightfield';
import { POSE, type Crowd, type Look } from '../people/_personModel';
import type { MapFrame } from '../types';
import { PAGODA } from '../village/_spots';
import { LINE_HELD, PAGODA_SPOTS, PROCESSION, SLOTS } from './_circuit';
import type { Glow } from './_glow';
import { SHOW, type Kit, type KitUniforms } from './_kit';
import { dressPagoda, mat, ricePile, tiffin } from './_pagodaDecor';
import { monkLook, pagodaLook, type PagodaRole } from './_pagodaFolk';
import { createPagodaLine, type PagodaLine } from './_pagodaLine';
import { between, Cast, placeSitters } from './_pagodaScene';
import { pchumDay } from './_schedule';

/**
 * Pchum Ben (បុណ្យភ្ជុំបិណ្ឌ) at the village pagoda: the fifteen days when the
 * spirits of the ancestors come back from the other world, and the living
 * feed them and make merit for them at the pagoda (festival/_schedule.ts
 * says when).
 *
 * - Before dawn (clock 0.58‥0.77): people dressed for the pagoda (women in
 *   white blouses and dark sampot with the white sash, men in white shirts)
 *   walk round the hall with candles, lotus and incense, throwing small
 *   sticky-rice balls (bay ben) out into the dark for the spirits who
 *   cannot come into the light (bay ben bos); the monks chant inside the
 *   lit hall. A grandmother at the top of the naga stair hands out rice
 *   balls from her tray (roam/_pchumBen.ts: the explorer joins them).
 * - In the morning and by day: families bring food to the monks in tiffin
 *   carriers (chan srak): four monks sit on the porch, a family kneeling
 *   before each, one holding out the tray; families sit on mats on the
 *   terrace with their tiffins; on Pchum, the last and biggest day, more of
 *   them (`pchumDay`).
 * - Evening: the families on their mats by small oil lamps.
 * - All days: the flag of Cambodia and the Buddhist flag at the terrace's
 *   front corners, strings of small lights to the porch, oil lamps along
 *   the front balustrade, the hall lit.
 *
 * Kit: its boxes (the big day's mats ride rig 2: folded away the other
 * days); glow: the walkers' candles first (moved by the line), then the
 * lamps. Everyone is one crowd (the festival part's).
 */

const X = PAGODA.x;
const F = PAGODA.floor;
/** When things happen (the clock: 0 afternoon, 0.25 dusk, 0.5 night, 0.75 dawn). */
export const PCHUM_TIMES = { walk: [0.58, 0.77], monks: [0.77, 0.18], families: [0.77, 0.52], chant: [0.77, 0.9] } as const;
/** The big day's things ride this rig. */
const BIG_RIG = 2;
const ZERO = new Matrix4().makeScale(0, 0, 0);
const ONE = new Matrix4();

export interface PagodaFestival {
  looks: Look[];
  blocks: number;
  line: PagodaLine;
  update(f: MapFrame, now: number, crowd: Crowd, first: boolean): void;
  clear(crowd: Crowd): void;
}

export function buildPchumBen(kit: Kit, glow: Glow, u: KitUniforms, field: HeightField, villageBuilt: boolean): PagodaFestival {
  const T = PAGODA.terrace;
  const terrace = (x: number, z: number) => (villageBuilt ? T.y : field.heightAt(x, z));
  const porch = villageBuilt ? F : terrace(X, 97);
  const cast = new Cast();

  // ── The walk before dawn: the line round the hall (its candles are the glow's first quads), the grandmother by the stair ──
  const walkers = SLOTS - 1;
  const roles: PagodaRole[] = ['grandma', 'woman', 'grandma', 'man', 'woman', 'nun', 'grandpa', 'woman', 'kid', 'grandma'];
  for (let i = 0; i < walkers; i++) cast.add(pagodaLook(roles[(i * 7 + 3) % roles.length], 9100 + i, { offering: true }));
  for (let i = 0; i < walkers; i++) glow.add(X, T.y, 100, 0xffb060, 0, { level: 0.85 });
  const giver = cast.add(pagodaLook('grandma', 9180, { tray: 'rice' }));
  const g = PAGODA_SPOTS.giver;
  ricePile(kit, g.x - 0.95, terrace(g.x - 0.95, g.z), g.z - 0.05, 3);

  // ── The pagoda dressed: flags, lights, lamps ──
  dressPagoda(kit, glow, terrace);

  // ── The porch: four monks on a red carpet before the door, a family kneeling before each with its tiffin carriers ──
  const MONK_X = [-3.65, -2.35, 2.35, 3.65];
  const monkZ = PAGODA.doorZ - 1.45;
  for (const s of [-1, 1]) kit.box(X + s * 3.0, porch + 0.02, monkZ, 2.3, 0.03, 0.9, 0xa8281e);
  const morning = (c: number) => between(c, PCHUM_TIMES.monks[0], PCHUM_TIMES.monks[1]);
  const day = (c: number) => between(c, PCHUM_TIMES.families[0], PCHUM_TIMES.families[1]);
  MONK_X.forEach((dx, k) => {
    cast.sit(monkLook(9200 + k), { x: X + dx, y: porch + 0.03, z: monkZ, yaw: Math.PI, pose: POSE.sit, when: morning });
    // (the tiffins set down before him, between him and the family)
    tiffin(kit, X + dx + (dx < 0 ? 0.22 : -0.22), porch, monkZ - 0.8, 9210 + k);
  });
  const famZ = PAGODA.doorZ - 3.05;
  MONK_X.forEach((dx, k) => {
    const giving = k === 1;
    const look = pagodaLook(k % 2 ? 'woman' : 'grandma', 9220 + k, giving ? { tray: 'food' } : {});
    cast.sit(look, { x: X + dx, y: porch, z: famZ, yaw: 0, pose: giving ? POSE.give : POSE.kneel, when: morning, carry: giving });
  });
  for (const s of [-1, 1]) {
    cast.sit(pagodaLook(s < 0 ? 'kid' : 'man', 9230 + s), { x: X + s * 4.75, y: porch, z: famZ - 0.2, yaw: 0, pose: POSE.kneel, when: morning });
    tiffin(kit, X + s * 4.45, porch, famZ + 0.55, 9235 + s);
  }

  // ── Families on mats on the terrace with their tiffins (more on Pchum, the big day) ──
  const mats: { x: number; z: number; big: boolean }[] = [
    { x: X + 10.05, z: 101.1, big: false },
    { x: X - 10.05, z: 108.4, big: false },
    { x: X + 10.05, z: 108.4, big: true },
    { x: X - 10.05, z: 101.1, big: true },
  ];
  mats.forEach((m, k) => {
    const y = terrace(m.x, m.z);
    const o = m.big ? { rig: BIG_RIG } : {};
    mat(kit, m.x, y, m.z, 2.0, 2.6, 0, 9240 + k, o);
    tiffin(kit, m.x - 0.18, y + 0.04, m.z - 0.15, 9250 + k, o);
    tiffin(kit, m.x + 0.2, y + 0.04, m.z + 0.2, 9260 + k, o);
    // (an oil lamp for the evening)
    kit.box(m.x + 0.55, y + 0.08, m.z - 0.85, 0.12, 0.08, 0.12, 0x9a5a34, o);
    kit.box(m.x + 0.55, y + 0.15, m.z - 0.85, 0.045, 0.08, 0.045, 0xffb050, { ...o, glow: 2.2, show: SHOW.night });
    if (!m.big) glow.add(m.x + 0.55, y + 0.2, m.z - 0.85, 0xffa850, 1.2, { level: 0.5 });
    const seats: [number, number, number][] = [
      [-0.62, -0.75, 0.6],
      [0.62, -0.75, -0.6],
      [-0.62, 0.8, 2.5],
      [0.62, 0.8, -2.5],
    ];
    const who: PagodaRole[] = ['grandma', 'woman', 'kid', 'man'];
    seats.forEach(([dx, dz, yaw], j) =>
      cast.sit(pagodaLook(who[(j + k) % 4], 9270 + k * 4 + j), { x: m.x + dx, y: y + 0.04, z: m.z + dz, yaw, pose: POSE.sit, when: day, bigDay: m.big }),
    );
  });

  const line = createPagodaLine({ first: 0, count: walkers, lead: 0, giver, glowFirst: 0, throws: true });
  const sitPosed = new Int8Array(cast.sitters.length).fill(-1);
  const sitFirst = cast.sitFirst;
  const hall = { ...PAGODA_SPOTS.hall };
  const porchChant = { x: X, y: porch + 1.4, z: monkZ };
  let lastClock = -1;
  let wasBig = false;

  return {
    looks: cast.looks,
    blocks: kit.count,
    line,
    update(f, now, crowd, first) {
      const c = f.clock;
      // (a jump of the clock: a time skip, a shot's moment; what is on shows at once)
      const snap = lastClock < 0 || Math.abs(((c - lastClock + 1.5) % 1) - 0.5) > 0.03;
      lastClock = c;
      const big = pchumDay(f.day);
      if (big !== wasBig || first) u.uRig.value[BIG_RIG].copy(big ? ONE : ZERO);
      wasBig = big;
      PROCESSION.kind = 'pchumben';
      PROCESSION.t = now;
      PROCESSION.night = f.night;
      const walk = LINE_HELD ?? between(c, PCHUM_TIMES.walk[0], PCHUM_TIMES.walk[1]);
      line.update(now, walk, snap, crowd, first, f.camera.position);
      placeSitters(cast.sitters, sitFirst, crowd, c, big, now, first || snap, sitPosed);
      // The chant: inside the hall while they walk, on the porch for the ancestors in the morning.
      PROCESSION.chant = PROCESSION.running ? hall : between(c, PCHUM_TIMES.chant[0], PCHUM_TIMES.chant[1]) ? porchChant : null;
    },
    clear(crowd) {
      line.clear(crowd);
      for (let k = 0; k < cast.sitters.length; k++) if (crowd.isShown(sitFirst + k)) crowd.hide(sitFirst + k);
      sitPosed.fill(-1);
      lastClock = -1;
      PROCESSION.kind = null;
      PROCESSION.chant = null;
    },
  };
}
