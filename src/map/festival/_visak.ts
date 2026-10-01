import type { HeightField } from '../heightfield';
import { POSE, type Crowd } from '../people/_personModel';
import type { MapFrame } from '../types';
import { PAGODA } from '../village/_spots';
import { LINE_HELD, PAGODA_SPOTS, PROCESSION, SLOTS } from './_circuit';
import type { Glow } from './_glow';
import type { Kit } from './_kit';
import { candleTray, dressPagoda, lotusVase, mat } from './_pagodaDecor';
import { monkLook, pagodaLook, type PagodaRole } from './_pagodaFolk';
import { createPagodaLine } from './_pagodaLine';
import type { PagodaFestival } from './_pchumBen';
import { between, Cast, placeSitters } from './_pagodaScene';

/**
 * Visak Bochea (បុណ្យវិសាខបូជា) at the village pagoda: the full moon of Pisakh,
 * the day of the Buddha's birth, his awakening and his passing
 * (festival/_schedule.ts says when).
 *
 * - The full-moon night (clock 0.23‥0.74): the candle procession: monks
 *   leading, people walk round the hall three times clockwise (ប្រទក្សិណ),
 *   candles, incense and lotus buds held between their palms, the monks'
 *   soft chant moving with them under the full moon; at the porch the trays
 *   of candles already placed glow either side of the door. An elder at
 *   the top of the naga stair hands out candles and lotus from her tray
 *   (roam/_visak.ts: the explorer joins the line, then places his candle).
 * - By day: two monks on the porch, people kneeling before the hall with
 *   lotus and incense, others on mats on the terrace; lotus in vases on the
 *   candle trays.
 * - The flag of Cambodia and the Buddhist flag, the strings of lights, the
 *   lamps on the balustrade (_pagodaDecor.ts), the hall lit.
 */

const X = PAGODA.x;
const F = PAGODA.floor;
/** When things happen (the clock: 0 afternoon, 0.25 dusk, 0.5 night, 0.75 dawn). */
export const VISAK_TIMES = { walk: [0.23, 0.74], day: [0.74, 0.23] } as const;
/** Monks leading the line. */
const MONKS = 3;

export function buildVisak(kit: Kit, glow: Glow, field: HeightField, villageBuilt: boolean): PagodaFestival {
  const T = PAGODA.terrace;
  const terrace = (x: number, z: number) => (villageBuilt ? T.y : field.heightAt(x, z));
  const porch = villageBuilt ? F : terrace(X, 97);
  const cast = new Cast();

  // ── The procession: the monks, then the people (their candles are the glow's first quads); the elder by the stair ──
  const walkers = SLOTS - 1;
  const roles: PagodaRole[] = ['woman', 'grandma', 'man', 'woman', 'grandma', 'kid', 'nun', 'woman', 'grandpa', 'man'];
  for (let i = 0; i < walkers; i++) cast.add(i < MONKS ? monkLook(9400 + i, true) : pagodaLook(roles[(i * 3 + 1) % roles.length], 9410 + i, { offering: true }));
  for (let i = 0; i < walkers; i++) glow.add(X, T.y, 100, 0xffb060, 0, { level: 0.85 });
  const giver = cast.add(pagodaLook('grandma', 9480, { tray: 'candles' }));

  dressPagoda(kit, glow, terrace);

  // ── The porch: the candle trays either side of the door (the procession's candles placed in them, lit at night) ──
  for (const [k, tr] of PAGODA_SPOTS.trays.entries()) candleTray(kit, glow, tr.x, porch, tr.z, 14, 9490 + k);

  // ── By day: two monks on the porch, people kneeling before the hall with lotus, others on mats ──
  const day = (c: number) => between(c, VISAK_TIMES.day[0], VISAK_TIMES.day[1]);
  const monkZ = PAGODA.doorZ - 1.4;
  for (const s of [-1, 1]) {
    kit.box(X + s * 4.35, porch + 0.02, monkZ, 1.0, 0.03, 0.9, 0xa8281e);
    cast.sit(monkLook(9500 + s), { x: X + s * 4.35, y: porch + 0.03, z: monkZ, yaw: Math.PI, pose: POSE.sit, when: day });
  }
  const kneelZ = PAGODA.doorZ - 3.1;
  [-4.2, -3.1, 3.1, 4.2].forEach((dx, k) => {
    const look = pagodaLook((['grandma', 'woman', 'nun', 'man'] as const)[k], 9510 + k, { offering: true });
    cast.sit(look, { x: X + dx, y: porch, z: kneelZ, yaw: 0, pose: POSE.kneel, when: day });
  });
  const mats = [
    { x: X + 10.05, z: 104.6 },
    { x: X - 10.05, z: 104.6 },
  ];
  mats.forEach((m, k) => {
    const y = terrace(m.x, m.z);
    mat(kit, m.x, y, m.z, 2.0, 3.0, 0, 9520 + k);
    lotusVase(kit, m.x, y + 0.04, m.z, 9525 + k);
    const seats: [number, number, number][] = [
      [-0.6, -0.9, 0.7],
      [0.6, -0.9, -0.7],
      [0, 1.0, Math.PI],
    ];
    const who: PagodaRole[] = ['grandma', 'woman', 'grandpa'];
    seats.forEach(([dx, dz, yaw], j) => cast.sit(pagodaLook(who[j], 9530 + k * 3 + j), { x: m.x + dx, y: y + 0.04, z: m.z + dz, yaw, pose: POSE.sit, when: day }));
  });

  const line = createPagodaLine({ first: 0, count: walkers, lead: MONKS, giver, glowFirst: 0, throws: false });
  const sitPosed = new Int8Array(cast.sitters.length).fill(-1);
  const sitFirst = cast.sitFirst;
  let lastClock = -1;

  return {
    looks: cast.looks,
    blocks: kit.count,
    line,
    update(f: MapFrame, now: number, crowd: Crowd, first: boolean) {
      const c = f.clock;
      const snap = lastClock < 0 || Math.abs(((c - lastClock + 1.5) % 1) - 0.5) > 0.03;
      lastClock = c;
      PROCESSION.kind = 'visak';
      PROCESSION.t = now;
      PROCESSION.night = f.night;
      line.update(now, LINE_HELD ?? between(c, VISAK_TIMES.walk[0], VISAK_TIMES.walk[1]), snap, crowd, first, f.camera.position);
      placeSitters(cast.sitters, sitFirst, crowd, c, false, now, first || snap, sitPosed);
    },
    clear(crowd: Crowd) {
      line.clear(crowd);
      for (let k = 0; k < cast.sitters.length; k++) if (crowd.isShown(sitFirst + k)) crowd.hide(sitFirst + k);
      sitPosed.fill(-1);
      lastClock = -1;
      PROCESSION.kind = null;
      PROCESSION.chant = null;
    },
  };
}
