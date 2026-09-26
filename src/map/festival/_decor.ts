import { hash3 } from '../../voxel/random';
import { ANIM, perPeriod, type BoxOpts, type Kit } from './_kit';

/**
 * Festival decorations as kit boxes (all seeded, sizes in metres):
 * flags on poles (the flag of Cambodia, the Buddhist flag), strings of
 * pennants, marigold garlands, and the sand stupas of Khmer New Year.
 */

/** The flag of Cambodia: blue, red, blue; the temple in white. */
export const KH_BLUE = 0x032ea1;
export const KH_RED = 0xe00025;
/** The Buddhist flag's colours (blue, yellow, red, white, orange), seen at every pagoda at New Year. */
export const BUDDHIST = [0x2a5fd0, 0xf6c21a, 0xd8312a, 0xf4f0e6, 0xef8a1c];
/** Pennants on the strings. */
export const PENNANTS = [0xd8312a, 0xf6c21a, 0x2a5fd0, 0xf4f0e6, 0xef8a1c, 0x3aa05a, 0xe04a8a];
/** Marigolds (orange and yellow), and their leaves. */
const MARIGOLD = [0xf08a12, 0xf7b21c, 0xe8740e, 0xf4c030];
const LEAF = 0x4f8a2c;
/** Bamboo poles. */
export const POLE = [0xc8a46a, 0xb8945a, 0xd2b27a];
/** Sand of the stupas. */
const SAND = [0xdcc59a, 0xd4ba8c, 0xe2cda6, 0xcdb487];

const pick = (a: readonly number[], i: number, j: number, k: number, s: number) => a[Math.floor(hash3(i, j, k, s) * a.length) % a.length];
/** Flags wave at about 2.3 rad/s (a whole number of turns in the kit's period). */
const WAVE = perPeriod(2.3);
/** Pennants sway slower. */
const SWAY = perPeriod(1.6);

/**
 * A flag on a pole: the pole's foot at (x, y, z), `h` m tall, the cloth
 * (w × hf m) flying toward `dir` (radians: toward (sin, cos)) from its top.
 * `kind`: the flag of Cambodia, the Buddhist flag, or one colour.
 */
export function flagPole(kit: Kit, x: number, y: number, z: number, h: number, w: number, hf: number, dir: number, kind: 'khmer' | 'buddhist' | number, o: BoxOpts = {}): void {
  kit.box(x, y + h / 2, z, 0.1, h, 0.1, pick(POLE, x, y, z, 1), o);
  flag(kit, x, y + h - hf / 2 - 0.05, z, w, hf, dir, kind, o);
}

/** The cloth of a flag: its pole edge at (x, y, z) (middle height), `w` long toward `dir`, `h` high. */
export function flag(kit: Kit, x: number, y: number, z: number, w: number, h: number, dir: number, kind: 'khmer' | 'buddhist' | number, o: BoxOpts = {}): void {
  // (the cloth's +x runs from the pole along dir: yaw = dir − π/2)
  const yaw = dir - Math.PI / 2;
  const s = Math.sin(dir);
  const c = Math.cos(dir);
  const phase = hash3(x, y, z, 5) * 6.28;
  const amp = 0.12;
  const at = (u: number) => [x + s * u, z + c * u] as const;
  const cloth = (u0: number, du: number, dy: number, hh: number, color: number, depth = 0) => {
    const [cx, cz] = at(u0 + du / 2);
    kit.box(cx - c * depth, y + dy, cz + s * depth, du, hh, 0.03, color, { ...o, yaw, anim: ANIM.wave, a: [amp, u0, WAVE], b: [phase, 0, 0, 0] });
  };
  if (kind === 'khmer') {
    cloth(0, w, h * 0.375, h / 4, KH_BLUE);
    cloth(0, w, 0, h / 2, KH_RED);
    cloth(0, w, -h * 0.375, h / 4, KH_BLUE);
    // The temple (a small white shape, just proud of the red).
    cloth(w * 0.36, w * 0.28, -h * 0.02, h * 0.26, 0xf4f2ec, 0.025);
  } else if (kind === 'buddhist') {
    const n = BUDDHIST.length;
    for (let i = 0; i < n; i++) cloth((w * i) / n, w / n, 0, h, BUDDHIST[i]);
  } else cloth(0, w, 0, h, kind);
}

/**
 * A string of pennants from (ax, ay, az) to (bx, by, bz), sagging `sag` m
 * in the middle, a pennant every `every` m (seeded colours, or `colors`).
 */
export function bunting(kit: Kit, ax: number, ay: number, az: number, bx: number, by: number, bz: number, sag: number, every = 0.55, colors: readonly number[] = PENNANTS, o: BoxOpts = {}): void {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.round(len / every));
  const yaw = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
  // The line: short straight pieces along the sag.
  const pieces = Math.max(3, Math.round(len / 1.5));
  const yAt = (u: number) => ay + (by - ay) * u - sag * 4 * u * (1 - u);
  for (let i = 0; i < pieces; i++) {
    const u0 = i / pieces;
    const u1 = (i + 1) / pieces;
    const x0 = ax + (bx - ax) * u0;
    const z0 = az + (bz - az) * u0;
    const x1 = ax + (bx - ax) * u1;
    const z1 = az + (bz - az) * u1;
    const y0 = yAt(u0);
    const y1 = yAt(u1);
    const l = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    kit.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, l, 0.025, 0.025, 0x5a4a3a, { ...o, yaw, roll: Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0)) });
  }
  const phase = hash3(ax, ay, az, 9) * 6.28;
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const x = ax + (bx - ax) * u;
    const z = az + (bz - az) * u;
    const y = yAt(u);
    const color = colors === PENNANTS ? pick(colors, i, Math.round(ax), Math.round(az), 3) : colors[i % colors.length];
    // A triangle: two boxes, the lower narrower (they sway a little, across the string).
    kit.box(x, y - 0.13, z, 0.26, 0.16, 0.02, color, { ...o, yaw, anim: ANIM.wave, a: [0.25, 0.0, SWAY], b: [phase + i * 0.9, 0, 0, 0] });
    kit.box(x, y - 0.28, z, 0.12, 0.14, 0.02, color, { ...o, yaw, anim: ANIM.wave, a: [0.25, 0.0, SWAY], b: [phase + i * 0.9, 0, 0, 0] });
  }
}

/** A marigold garland hanging between two points (orange and yellow flower heads). */
export function garland(kit: Kit, ax: number, ay: number, az: number, bx: number, by: number, bz: number, sag: number, o: BoxOpts = {}): void {
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  const n = Math.max(3, Math.round(len / 0.16));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = ax + (bx - ax) * u;
    const z = az + (bz - az) * u;
    const y = ay + (by - ay) * u - sag * 4 * u * (1 - u);
    const s = 0.13 + 0.03 * hash3(i, ax, az, 2);
    kit.box(x, y, z, s, s, s, pick(MARIGOLD, i, Math.round(ax * 3), Math.round(az * 3), 4), o);
  }
}

/** A ring of marigolds round (x, y, z), radius r. */
export function garlandRing(kit: Kit, x: number, y: number, z: number, r: number, o: BoxOpts = {}): void {
  const n = Math.max(6, Math.round((Math.PI * 2 * r) / 0.17));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    kit.box(x + Math.cos(a) * r, y, z + Math.sin(a) * r, 0.14, 0.14, 0.14, pick(MARIGOLD, i, Math.round(x), Math.round(z), 6), o);
    if (i % 5 === 0) kit.box(x + Math.cos(a) * (r + 0.08), y - 0.05, z + Math.sin(a) * (r + 0.08), 0.1, 0.04, 0.1, LEAF, o);
  }
}

/**
 * A sand stupa (Phnom Khsach) of New Year, its foot at (x, y, z), `s` its
 * scale (1 ≈ 1.6 m wide, 2.2 m high): stepped sand, a spire, paper flags on
 * sticks, a marigold ring, a few joss sticks.
 */
export function sandStupa(kit: Kit, x: number, y: number, z: number, s: number, seed: number, o: BoxOpts = {}): void {
  const tiers: [number, number][] = [
    [1.6, 0.42],
    [1.25, 0.36],
    [0.92, 0.32],
    [0.62, 0.3],
    [0.38, 0.28],
  ];
  let top = y;
  tiers.forEach(([w, h], i) => {
    const c = pick(SAND, i, seed, 1, 7);
    kit.box(x, top + (h * s) / 2, z, w * s, h * s, w * s, c, o);
    // (a rim of wet, darker sand at each step's foot)
    if (i === 0) kit.box(x, top + 0.03, z, (w + 0.14) * s, 0.06, (w + 0.14) * s, 0xbca377, o);
    top += h * s;
  });
  // Spire, and a tiny umbrella of gold paper on it.
  kit.box(x, top + 0.35 * s, z, 0.12 * s, 0.7 * s, 0.12 * s, pick(SAND, 9, seed, 1, 7), o);
  kit.box(x, top + 0.74 * s, z, 0.3 * s, 0.04, 0.3 * s, 0xe8b84a, o);
  // A marigold ring on the second step, flowers on the corners.
  garlandRing(kit, x, y + 0.42 * s + 0.05, z, 0.7 * s, o);
  for (const [cx, cz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ])
    kit.box(x + cx * 0.72 * s, y + 0.46 * s, z + cz * 0.72 * s, 0.16, 0.16, 0.16, pick(MARIGOLD, cx, cz, seed, 8), o);
  // Paper flags on thin sticks stuck in each step (coloured, a few waving).
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash3(seed, i, 2, 3) * 0.4;
    const tier = i % 3;
    const r = (tiers[tier][0] / 2 - 0.05) * s;
    const baseY = y + tiers.slice(0, tier + 1).reduce((t, [, h]) => t + h, 0) * s;
    const fx = x + Math.cos(a) * r;
    const fz = z + Math.sin(a) * r;
    kit.box(fx, baseY + 0.28, fz, 0.025, 0.56, 0.025, 0xe8e0c8, o);
    flag(kit, fx, baseY + 0.46, fz, 0.26, 0.17, a, pick(PENNANTS, i, seed, 4, 9), o);
  }
  // Joss sticks in front (glowing tips).
  for (let i = 0; i < 3; i++) {
    const jx = x + (i - 1) * 0.08 * s;
    const jz = z + 0.95 * s;
    kit.box(jx, y + 0.3, jz, 0.02, 0.6, 0.02, 0xb8402a, o);
    kit.box(jx, y + 0.61, jz, 0.03, 0.03, 0.03, 0xff8a3a, { ...o, glow: 1.2 });
  }
}

/** A group of five sand stupas (a big one and four round it), as at a pagoda. */
export function stupaGroup(kit: Kit, x: number, y: number, z: number, seed: number, yAt?: (x: number, z: number) => number): void {
  const g = (px: number, pz: number) => (yAt ? yAt(px, pz) : y);
  sandStupa(kit, x, g(x, z), z, 1.15, seed);
  for (const [dx, dz] of [
    [-1.9, -1.9],
    [1.9, -1.9],
    [1.9, 1.9],
    [-1.9, 1.9],
  ])
    sandStupa(kit, x + dx, g(x + dx, z + dz), z + dz, 0.6, seed + dx * 3 + dz * 7);
  // Bunting from the big spire to the small ones.
  const top = g(x, z) + 1.15 * 2.4;
  for (const [dx, dz] of [
    [-1.9, -1.9],
    [1.9, -1.9],
    [1.9, 1.9],
    [-1.9, 1.9],
  ])
    bunting(kit, x, top, z, x + dx, g(x + dx, z + dz) + 0.6 * 2.2, z + dz, 0.25, 0.3);
}
