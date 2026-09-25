import type { HeightField, RiverSample } from '../heightfield';

/**
 * The rivers as the water animals see them: water as it is drawn (not the
 * height field's water metres above the ground past a cliff), calm reaches
 * away from the falls and the bridges, and how much open water there is
 * either side of a river's middle line.
 */

/** Water surface as drawn at (x, z) (water/grid.ts: none floating over a cliff), or null. */
export function drawnWater(f: HeightField, x: number, z: number): number | null {
  const c = f.index(x, z);
  if (c < 0) return null;
  const w = f.water[c];
  return w < -1000 || w - f.height[c] > 1.5 ? null : w;
}

/** Open water at (x, z): drawn water at one level all round within r m, or null. */
export function openWater(f: HeightField, x: number, z: number, r: number): number | null {
  const L = drawnWater(f, x, z);
  if (L === null) return null;
  for (const [dx, dz] of RING) {
    const w = drawnWater(f, x + dx * r, z + dz * r);
    if (w === null || Math.abs(w - L) > 0.3) return null;
  }
  return L;
}
const RING = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7, 0.7],
  [-0.7, 0.7],
  [0.7, -0.7],
  [-0.7, -0.7],
];

/** A point on a reach: map position, the river's heading there (unit x, z) and the water level. */
export interface ReachPoint {
  x: number;
  z: number;
  dx: number;
  dz: number;
  level: number;
}

/**
 * A calm stretch of one river: samples `a`‥`b` at one level, at least a few
 * metres from a fall, a step or a bridge. `left` / `right`: open water from
 * the middle line to either bank per sample (m, towards −n and +n, where
 * n = (−dz, dx) of the river), less a small margin.
 */
export interface Reach {
  river: string;
  samples: RiverSample[];
  a: number;
  b: number;
  level: number;
  left: Float32Array;
  right: Float32Array;
}

/** Keep this far from a fall or a step along the river (m, samples). */
const FALL_GAP = 12;
/** And this far from a bridge (m). */
const BRIDGE_GAP = 9;

/**
 * The calm reach of river water nearest to (x, z), reaching up to `half`
 * metres up and down the river from there; null if there is none within
 * 30 m.
 */
export function reachNear(f: HeightField, x: number, z: number, half = 35): Reach | null {
  let best: { r: number; i: number; d: number } | null = null;
  f.rivers.forEach((r, ri) =>
    r.samples.forEach((s, i) => {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < 30 && (!best || d < best.d)) best = { r: ri, i, d };
    }),
  );
  if (!best) return null;
  const { r: ri, i } = best as { r: number; i: number };
  const river = f.rivers[ri];
  const sm = river.samples;
  const L = sm[i].level;
  const bridges = f.paths.flatMap((p) => p.samples.filter((s) => s.wet));
  const calm = (k: number) => {
    if (k < 0 || k >= sm.length || Math.abs(sm[k].level - L) > 0.01) return false;
    // (a fall or a step nearby: the level changes within FALL_GAP samples)
    for (const j of [k - FALL_GAP, k + FALL_GAP]) if (j >= 0 && j < sm.length && Math.abs(sm[j].level - L) > 0.01) return false;
    const s = sm[k];
    return !bridges.some((b) => Math.hypot(b.x - s.x, b.z - s.z) < BRIDGE_GAP + s.w / 2);
  };
  if (!calm(i)) return null;
  let a = i;
  let b = i;
  while (a > i - half && calm(a - 1)) a--;
  while (b < i + half && calm(b + 1)) b++;
  const n = b - a + 1;
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let k = a; k <= b; k++) {
    const s = sm[k];
    const nx = -s.dir[1];
    const nz = s.dir[0];
    const free = (sg: number) => {
      let v = 0;
      while (v < s.w) {
        const w = drawnWater(f, s.x + nx * sg * (v + 0.5), s.z + nz * sg * (v + 0.5));
        if (w === null || Math.abs(w - L) > 0.3) break;
        v += 0.5;
      }
      return Math.max(0, v - 0.6);
    };
    left[k - a] = free(-1);
    right[k - a] = free(1);
  }
  return { river: river.name, samples: sm, a, b, level: L, left, right };
}

/**
 * The point at sample `u` (fractional, clamped to the reach) and `v` across
 * the river: −1 = at the left bank, 0 = the middle line, 1 = at the right bank.
 */
export function reachPoint(r: Reach, u: number, v: number, out: ReachPoint): ReachPoint {
  const uu = Math.min(r.b, Math.max(r.a, u));
  const k = Math.min(r.b - 1, Math.floor(uu));
  const t = uu - k;
  const s0 = r.samples[k];
  const s1 = r.samples[Math.min(r.b, k + 1)];
  const x = s0.x + (s1.x - s0.x) * t;
  const z = s0.z + (s1.z - s0.z) * t;
  const dx = s0.dir[0] + (s1.dir[0] - s0.dir[0]) * t;
  const dz = s0.dir[1] + (s1.dir[1] - s0.dir[1]) * t;
  const l = Math.hypot(dx, dz) || 1;
  const i0 = k - r.a;
  const i1 = Math.min(r.b - r.a, i0 + 1);
  const room = v < 0 ? r.left[i0] + (r.left[i1] - r.left[i0]) * t : r.right[i0] + (r.right[i1] - r.right[i0]) * t;
  const off = v * room;
  out.dx = dx / l;
  out.dz = dz / l;
  out.x = x - out.dz * off;
  out.z = z + out.dx * off;
  out.level = r.level;
  return out;
}

/** Sample index of the reach nearest to (x, z) (fractional is not needed: whole metres). */
export function reachIndex(r: Reach, x: number, z: number): number {
  let best = r.a;
  let bd = Infinity;
  for (let k = r.a; k <= r.b; k += 2) {
    const s = r.samples[k];
    const d = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return best;
}
