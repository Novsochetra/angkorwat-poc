import { hash3 } from '../../voxel/random';
import { PAGODA } from '../village/_spots';
import { flagPole, PENNANTS } from './_decor';
import type { Glow } from './_glow';
import { SHOW, type BoxOpts, type Kit } from './_kit';

/**
 * The village pagoda dressed for Pchum Ben and Visak Bochea (kit boxes,
 * world m): the flag of Cambodia and the Buddhist flag at the terrace's
 * front corners, strings of small coloured lights from them to the porch and
 * along the porch's front, little oil lamps along the front balustrade (lit
 * at night); and the things people bring: woven mats, tiffin carriers
 * (chan srak, the stacked food pots families carry to the monks), candle
 * trays, lotus in vases, a basket of rice balls.
 *
 * `terrace(x, z)`: the terrace's top there (the village part builds it; the
 * bare ground when it is not built).
 */

const X = PAGODA.x;
const T = PAGODA.terrace;
/** The porch's front pillars (village/_pagoda.ts: the colonnade at ±5.55, its first row at z 95) and their tops (m). */
const PILLAR = { dx: 5.55, z: 95, top: 12.2 };

/** Flags, light strings and the balustrade's lamps. */
export function dressPagoda(kit: Kit, glow: Glow, terrace: (x: number, z: number) => number): void {
  const corners: [number, number][] = [
    [T.x0 + 0.6, T.z0 + 0.6],
    [T.x1 - 0.6, T.z0 + 0.6],
  ];
  // The flag of Cambodia (west) and the Buddhist flag (east), flying out over the terrace's front corners.
  corners.forEach(([x, z], i) => flagPole(kit, x, terrace(x, z), z, 6.4, 1.6, 1.05, Math.PI * (i ? 0.85 : 1.15), i ? 'buddhist' : 'khmer'));
  // Strings of small lights: from each corner pole's top to the porch's front pillar, and along the porch's front.
  const night: BoxOpts = { show: SHOW.night, glow: 1.0 };
  const bulbs = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, sag: number, every: number, seed: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.round(len / every));
    const yaw = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
    // (the wire, then a bulb every `every` m: lit at night, a soft colour by day)
    for (let i = 0; i < n; i++) {
      const u0 = i / n;
      const u1 = (i + 1) / n;
      const y0 = ay + (by - ay) * u0 - sag * 4 * u0 * (1 - u0);
      const y1 = ay + (by - ay) * u1 - sag * 4 * u1 * (1 - u1);
      const l = Math.hypot((bx - ax) * (u1 - u0), y1 - y0, (bz - az) * (u1 - u0));
      kit.box(ax + (bx - ax) * (u0 + u1) * 0.5, (y0 + y1) / 2, az + (bz - az) * (u0 + u1) * 0.5, l, 0.02, 0.02, 0x3a3430, { yaw, roll: Math.atan2(y1 - y0, Math.hypot((bx - ax) * (u1 - u0), (bz - az) * (u1 - u0))) });
    }
    for (let i = 1; i < n; i++) {
      const u = i / n;
      const y = ay + (by - ay) * u - sag * 4 * u * (1 - u) - 0.07;
      kit.box(ax + (bx - ax) * u, y, az + (bz - az) * u, 0.11, 0.13, 0.11, PENNANTS[Math.floor(hash3(i, seed, 3, 91) * PENNANTS.length) % PENNANTS.length], night);
    }
  };
  for (const [x, z] of corners) {
    const s = Math.sign(x - X);
    bulbs(x, terrace(x, z) + 6.1, z, X + s * PILLAR.dx, PILLAR.top, PILLAR.z - 0.38, 0.7, 0.42, Math.round(x));
  }
  bulbs(X - PILLAR.dx, PILLAR.top, PILLAR.z - 0.4, X + PILLAR.dx, PILLAR.top, PILLAR.z - 0.4, 0.45, 0.4, 7);
  // Little oil lamps along the front balustrade (its top 0.7 m over the terrace), either side of the stair.
  const S = PAGODA.stair;
  for (const [x0, x1] of [
    [T.x0 + 0.8, S.x0 - 1.4],
    [S.x1 + 1.4, T.x1 - 0.8],
  ]) {
    const n = Math.round((x1 - x0) / 1.05);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = T.y + 0.7;
      const z = T.z0 + 0.2;
      kit.box(x, y + 0.04, z, 0.14, 0.08, 0.14, 0x9a5a34);
      kit.box(x, y + 0.13, z, 0.05, 0.1, 0.05, 0xffb050, { show: SHOW.night, glow: 2.4 });
      if (i % 2 === 0) glow.add(x, y + 0.16, z, 0xffa850, 0.9, { level: 0.45 });
    }
  }
}

/** A woven mat (kantel) on the ground: red and green bands on straw (`yaw` turns it). */
export function mat(kit: Kit, x: number, y: number, z: number, w: number, d: number, yaw: number, seed: number, o: BoxOpts = {}): void {
  kit.box(x, y + 0.02, z, w, 0.04, d, 0xd8c48a, { ...o, yaw });
  const bands = [0xb8322c, 0x3a7a4a, 0xc89a3a, 0x2a4a8a];
  const c = bands[seed % bands.length];
  const s = Math.sin(yaw);
  const k = Math.cos(yaw);
  for (const off of [-0.36, 0.36]) {
    const along = off * d;
    kit.box(x + s * along, y + 0.042, z + k * along, w * 0.96, 0.01, d * 0.08, c, { ...o, yaw });
  }
  kit.box(x, y + 0.042, z, w * 0.96, 0.01, d * 0.05, shadeOf(c), { ...o, yaw });
}

const shadeOf = (c: number) => (c === 0xb8322c ? 0xc89a3a : 0xb8322c);

/** Tiffin carriers (chan srak): `n` round pots stacked in a frame with a handle on top. */
export function tiffin(kit: Kit, x: number, y: number, z: number, seed: number, o: BoxOpts = {}): void {
  const pot = [0xe8eaee, 0x5a8ac8, 0xd84a4a, 0x6ab07a, 0xc8ccd2][Math.floor(hash3(seed, 1, 2, 93) * 5)];
  const n = 3 + Math.floor(hash3(seed, 2, 2, 93) * 2);
  for (let i = 0; i < n; i++) {
    kit.box(x, y + 0.055 + i * 0.105, z, 0.2, 0.1, 0.2, pot, o);
    kit.box(x, y + 0.105 + i * 0.105, z, 0.215, 0.012, 0.215, 0xb8bcc2, o);
  }
  const top = y + n * 0.105;
  // (the frame: a rail up each side, the handle across the top)
  for (const dx of [-0.115, 0.115]) kit.box(x + dx, (y + top + 0.1) / 2, z, 0.015, top + 0.1 - y, 0.04, 0xa8acb2, o);
  kit.box(x, top + 0.1, z, 0.25, 0.02, 0.04, 0xa8acb2, o);
  kit.box(x, top + 0.04, z, 0.05, 0.1, 0.05, 0xa8acb2, o);
}

/** A low candle tray (a red lacquer stand with a gold rim): candles lit at night, a lotus vase in the middle. */
export function candleTray(kit: Kit, glow: Glow, x: number, y: number, z: number, candles: number, seed: number): void {
  kit.box(x, y + 0.18, z, 0.95, 0.05, 0.55, 0xa8281e);
  kit.box(x, y + 0.205, z, 0.98, 0.012, 0.58, 0xd9a93a);
  for (const [dx, dz] of [
    [-0.4, -0.22],
    [0.4, -0.22],
    [0.4, 0.22],
    [-0.4, 0.22],
  ])
    kit.box(x + dx, y + 0.08, z + dz, 0.06, 0.16, 0.06, 0x7a1e16);
  // (sand in the tray, the candles stood in it)
  kit.box(x, y + 0.225, z, 0.86, 0.03, 0.46, 0xd8c8a0);
  lotusVase(kit, x, y + 0.24, z + 0.12, seed);
  for (let i = 0; i < candles; i++) {
    const cx = x - 0.36 + 0.72 * hash3(i, seed, 1, 95);
    const cz = z - 0.18 + 0.2 * hash3(i, seed, 2, 95);
    const h = 0.1 + 0.08 * hash3(i, seed, 3, 95);
    kit.box(cx, y + 0.24 + h / 2, cz, 0.035, h, 0.035, 0xf8f2dc);
    kit.box(cx, y + 0.27 + h, cz, 0.03, 0.05, 0.03, 0xffb860, { show: SHOW.night, glow: 2.6 });
  }
  glow.add(x, y + 0.42, z - 0.05, 0xffa850, 1.6, { level: 0.6 });
}

/** A brass vase of lotus buds (pink and white) on green stems. */
export function lotusVase(kit: Kit, x: number, y: number, z: number, seed: number): void {
  kit.box(x, y + 0.07, z, 0.12, 0.14, 0.12, 0xc8962a);
  kit.box(x, y + 0.15, z, 0.08, 0.03, 0.08, 0xd9a93a);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + seed;
    const r = i ? 0.06 : 0;
    const h = 0.32 + 0.1 * hash3(i, seed, 4, 97);
    const bx = x + Math.cos(a) * r;
    const bz = z + Math.sin(a) * r;
    kit.box(bx, y + 0.16 + h / 2, bz, 0.012, h, 0.012, 0x4a8a3a);
    const pink = hash3(i, seed, 5, 97) < 0.6;
    kit.box(bx, y + 0.2 + h, bz, 0.06, 0.08, 0.06, pink ? 0xf2a8c0 : 0xf6ecdc);
    kit.box(bx, y + 0.26 + h, bz, 0.035, 0.05, 0.035, pink ? 0xe888a8 : 0xf0e2cc);
  }
}

/** A big flat basket of rice balls (bay ben) on a low stand, banana leaves under them. */
export function ricePile(kit: Kit, x: number, y: number, z: number, seed: number): void {
  kit.box(x, y + 0.14, z, 0.62, 0.06, 0.62, 0x8a6a3a);
  for (const [dx, dz] of [
    [-0.26, -0.26],
    [0.26, -0.26],
    [0.26, 0.26],
    [-0.26, 0.26],
  ])
    kit.box(x + dx, y + 0.06, z + dz, 0.05, 0.12, 0.05, 0x6a4a2a);
  kit.box(x, y + 0.2, z, 0.6, 0.06, 0.6, 0xb8945a);
  kit.box(x, y + 0.235, z, 0.52, 0.012, 0.52, 0x4f9a3a);
  for (let i = 0; i < 26; i++) {
    const a = hash3(i, seed, 1, 99) * Math.PI * 2;
    const r = 0.22 * Math.sqrt(hash3(i, seed, 2, 99));
    const layer = i < 18 ? 0 : 1;
    kit.box(x + Math.cos(a) * r * (layer ? 0.6 : 1), y + 0.27 + layer * 0.06, z + Math.sin(a) * r * (layer ? 0.6 : 1), 0.075, 0.065, 0.075, 0xf4f0e4);
  }
}
