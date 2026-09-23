import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { hash3, valueNoise3 } from '../../voxel/random';
import { PALETTE } from '../palette';
import { skullHas } from './head';

/**
 * Big, messy near-black hair (sheet 3.3.2). Built on the head grid so its blocks
 * line up with the face. The shape is the union of
 *   - a one-block shell hugging the skull (guarantees no scalp shows), and
 *   - a rounded "cloud" (superellipsoid ~15 wide, 12 deep, domed on top),
 * carved around the face, ears and nape, then roughened with clumped tufts and
 * dents so it reads as curly volume like the reference.
 *
 * Grid: i 0‥14 → x −7‥7, j 0‥12 → y 20.9‥32.9, k 0‥15 → z −7.6‥7.4 (cell centres).
 */
export interface HairOptions {
  /** Remove hair whose top is above this height (for hats). */
  clipAboveY?: number;
  seed?: number;
}

const ORIGIN: [number, number, number] = [-7.5, 20.4, -8.1];
const cx = (i: number) => i - 7;
const cy = (j: number) => 20.9 + j;
const cz = (k: number) => -7.6 + k;
const inHead = (i: number, j: number, k: number) => skullHas(cx(i), cy(j), cz(k));

/** The cloud: centre / radii / exponent (body units). */
const CLOUD = { x: 0, y: 26.2, z: -0.9, rx: 6.6, up: 5.5, down: 6.2, back: 6.0, front: 6.0, p: 2.45 };
/** Outer bound for displaced strands / tufts (keeps the silhouette ~14 wide). */
const OUTER = { ...CLOUD, rx: 7.7, up: 6.8, down: 6.9, back: 7.4, front: 7.1, p: 2.3 };

function inCloud(x: number, y: number, z: number, c: typeof CLOUD = CLOUD): boolean {
  const dy = y - c.y;
  const dz = z - c.z;
  const nx = Math.abs(x - c.x) / c.rx;
  const ny = Math.abs(dy) / (dy > 0 ? c.up : c.down);
  const nz = Math.abs(dz) / (dz > 0 ? c.front : c.back);
  return nx ** c.p + ny ** c.p + nz ** c.p <= 1;
}

/**
 * Lowest cell-bottom (y) of the bangs per column x (−5‥5), read off the front view.
 * The character's right side (−x) is messier and hangs to the eye; the left side
 * is shorter so the left brow shows — as in the reference.
 */
const BANGS: Record<number, number> = {
  [-5]: 21.4,
  [-4]: 24.4,
  [-3]: 24.4,
  [-2]: 24.4,
  [-1]: 25.4,
  0: 26.4,
  1: 26.4,
  2: 25.4,
  3: 25.4,
  4: 24.4,
  5: 21.4,
};

/** Keep the face, ears, jaw and nape clear. */
function allowed(i: number, j: number, k: number): boolean {
  if (inHead(i, j, k)) return false;
  const x = cx(i);
  const ax = Math.abs(x);
  const z = cz(k);
  const bottom = cy(j) - 0.5;
  if (z > 4.9) {
    // In front of the face: bang strands.
    if (ax <= 5) return bottom >= (BANGS[x] ?? 26.4);
    return bottom >= 23.4;
  }
  if (ax >= 5.5) {
    // Beside the head the hair stops above the jaw; the strands framing the face
    // hang in front of it (BANGS ±5) so the jaw line stays narrow like the reference.
    if (z >= 1.0) return bottom >= 23.4;
    if (z >= -1.1) return bottom >= 24.4; // ear stays visible
    if (z >= -4.1) return bottom >= 22.4; // behind the ear
  }
  if (z < -4.1) {
    // Nape: hair comes lowest at the centre of the back.
    const minBottom = ax <= 2 ? 20.4 : ax <= 3 ? 21.4 : 22.4;
    return bottom >= minBottom;
  }
  return true;
}

const FACE6: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export function buildHair(opts: HairOptions = {}): VoxelBuilder {
  const seed = opts.seed ?? 7;
  const b = new VoxelBuilder();
  const g = b.grid({ cell: 1, origin: ORIGIN, mat: 'hair', jitter: 0.06, ao: 0.7, seed });
  const P = PALETTE.hair;
  const clump = (x: number, y: number, z: number) => valueNoise3(x * 0.5 + 3.1, y * 0.5 + 1.7, z * 0.5 - 2.3, seed + 1);
  const colour = (i: number, j: number, k: number) => {
    const c = clump(cx(i), cy(j), cz(k));
    const r = hash3(i, j, k, seed + 3);
    if (r > 0.94) return P.light;
    if (c > 0.62) return r < 0.6 ? P.mid : P.base;
    return r < 0.45 ? P.darkest : r < 0.8 ? P.dark : P.base;
  };

  // 1. Shell (face-adjacent to the skull) ∪ cloud.
  for (let i = -1; i <= 15; i++)
    for (let j = 0; j <= 12; j++)
      for (let k = -1; k <= 15; k++) {
        if (!allowed(i, j, k)) continue;
        const shell = FACE6.some(([dx, dy, dz]) => inHead(i + dx, j + dy, k + dz));
        if (shell || inCloud(cx(i), cy(j), cz(k))) g.set(i, j, k, colour(i, j, k));
      }

  const occupied = (i: number, j: number, k: number) => g.has(i, j, k) || inHead(i, j, k);
  const onScalp = (i: number, j: number, k: number) => FACE6.some(([dx, dy, dz]) => inHead(i + dx, j + dy, k + dz));
  const canGrow = (i: number, j: number, k: number) =>
    !occupied(i, j, k) && allowed(i, j, k) && inCloud(cx(i), cy(j), cz(k), OUTER) && !(cz(k) > 4.9 && cy(j) < 26.5);

  // 2. Strand displacement: vertically stretched noise pushes clumps of hair out by
  //    one or two blocks or dents them in, giving the stepped "shingle" strands of the
  //    reference (lit top faces, deep shadows between clumps).
  const adds: [number, number, number, number][] = [];
  const dels: [number, number, number][] = [];
  g.forEach((i, j, k) => {
    const x = cx(i);
    const y = cy(j);
    const z = cz(k);
    const [dx, dy, dz] = outward(x, y, z);
    if (dy < 0 || occupied(i + dx, j + dy, k + dz)) return;
    const axis = dx !== 0 ? 0 : dz !== 0 ? 1 : 2;
    const [u, v] = axis === 0 ? [z, y] : axis === 1 ? [x, y] : [x, z];
    const [fu, fv] = axis === 2 ? [0.42, 0.42] : [0.46, 0.26];
    const n = valueNoise3(u * fu + dx * 5.3 + 1.1, v * fv + dz * 3.7, axis * 7.7 + dy * 2.9, seed + 21);
    const bang = z > 4.9 && y < 27.5;
    let d = n > 0.66 ? 2 : n > 0.47 ? 1 : n < 0.25 ? -1 : 0;
    if (bang) d = Math.max(0, Math.min(d, 1));
    if (axis === 1 && dz > 0 && y > 27.5) d = Math.min(d, 1); // no brim-like overhang up top
    if (axis === 2) d = Math.min(d, 1); // no stacked spikes on the crown
    if (d < 0) {
      if (!onScalp(i, j, k) && g.has(i - dx, j - dy, k - dz)) dels.push([i, j, k]);
      return;
    }
    for (let s = 1; s <= d; s++) adds.push([i + dx * s, j + dy * s, k + dz * s, s]);
  });
  for (const [i, j, k] of dels) g.delete(i, j, k);
  for (const [i, j, k, s] of adds)
    if (canGrow(i, j, k)) g.set(i, j, k, s === 2 ? P.mid : hash3(i, j, k, seed + 4) < 0.5 ? P.base : colour(i, j, k));

  // 3. A few loose tufts on the silhouette.
  const surface: [number, number, number][] = [];
  g.forEach((i, j, k) => surface.push([i, j, k]));
  for (const [i, j, k] of surface) {
    const [dx, dy, dz] = outward(cx(i), cy(j), cz(k));
    if (dy !== 0 || hash3(i, j, k, seed + 9) < 0.93) continue;
    if (canGrow(i + dx, j + dy, k + dz)) g.set(i + dx, j + dy, k + dz, P.mid);
  }

  // 4. Fringe overhanging the forehead like a visor (side view bulges to z ≈ 6.5).
  for (let i = 1; i <= 13; i++)
    for (let j = 4; j <= 10; j++) {
      if (!g.has(i, j, 13) || g.has(i, j, 14)) continue;
      const lowest = !g.has(i, j - 1, 13);
      if (j >= 8 || hash3(i, j, 14, seed + 5) > (lowest ? 0.55 : j >= 6 ? 0.45 : 0.3)) continue;
      g.set(i, j, 14, colour(i, j, 14));
    }

  if (opts.clipAboveY !== undefined) {
    const all: [number, number, number][] = [];
    g.forEach((i, j, k) => all.push([i, j, k]));
    for (const [i, j, k] of all) if (cy(j) + 0.5 > opts.clipAboveY) g.delete(i, j, k);
  }

  // Skull as ghosts so AO darkens the roots and lifts the tips.
  for (let i = 1; i <= 13; i++) for (let j = 0; j <= 10; j++) for (let k = 3; k <= 13; k++) if (inHead(i, j, k)) g.ghost(i, j, k);
  g.commit();
  return b;
}

/** Dominant outward axis from the hair's centre of mass. */
function outward(x: number, y: number, z: number): [number, number, number] {
  const vx = x / CLOUD.rx;
  const vy = (y - CLOUD.y) / CLOUD.up;
  const vz = (z - CLOUD.z) / (z > CLOUD.z ? CLOUD.front : CLOUD.back);
  const ax = Math.abs(vx);
  const ay = Math.abs(vy);
  const az = Math.abs(vz);
  if (ay >= ax && ay >= az) return [0, Math.sign(vy), 0];
  if (ax >= az) return [Math.sign(vx), 0, 0];
  return [0, 0, Math.sign(vz)];
}
