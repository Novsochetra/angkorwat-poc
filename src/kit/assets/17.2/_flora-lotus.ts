import { valueNoise3 } from '../../../voxel/random';
import type { VoxelGrid } from '../../../voxel/VoxelBuilder';
import { LEAF_CELL, type LeafBed } from '../../lib/leaves';
import type { WaterSurface } from '../../lib/water';
import type { PieceBuilder } from '../../PieceBuilder';
import { here, rng, TEXEL, type Rng } from '../../shapes';
import { leafSurf } from '../../surface';
import { findSpot, Plate, stalk, type FloraArea, type FloraSpot } from './_flora-core';
import { BLOOM_CELL, PAD_SINK, PAD_THICK, padBed, padShape, petal, putAt, spindle } from './_flora-lilies';

/**
 * The sacred lotus (Nelumbo nucifera) — the other flower of Angkor's pools and
 * the lotus-bud towers' model. Unlike the water lily it holds most of its
 * leaves out of the water: round blue-green shields 0.3–0.8 m across, dished
 * with a pale navel where the stalk meets them and a wavy rim, on stalks
 * 0.3–1.5 m tall; only its young leaves float flat. The flowers, 0.2–0.3 m,
 * stand over the leaves on their own stalks — a bowl of broad pink petals,
 * paler at the base, round a flat-topped yellow seed pod ringed with stamens —
 * with tall pointed buds beside them and old pods, green then brown and
 * nodding, left where the petals fell.
 *
 * Leaves are {@link Plate}s of half-texel cells stepped up towards the rim (a
 * pixel-art dish); flowers, buds and pods are quarter-texel cells; stalks are
 * thin boxes.
 */

/** Leaf tones (blue-green with a waxy bloom), the pale navel, the lighter veins, the rim. */
export const LOTUS_LEAF = {
  top: [0x6c9a5c, 0x77a462, 0x62904f, 0x81ab69],
  navel: [0xb8cc90, 0xacc485],
  vein: [0x8cb676, 0x92ba7c],
  rim: [0x5a8646, 0x62884a],
  /** An old leaf drying from the rim. */
  dry: [0xa89a54, 0x9a8448, 0x8a7440],
} as const;
const STALK = [0x5f8a3c, 0x6a9442, 0x557e36] as const;
/** Flower: pale base, pink body, deep pink tips; the pod and stamens. */
const PETAL = { base: [0xfbe6ee, 0xf8dce8], body: [0xf2a6c2, 0xee9aba, 0xf4b2cb], tip: [0xe07a9e, 0xd86e94] } as const;
const STAMENS = [0xf6c62a, 0xf2b624] as const;
const POD = { top: [0xc4c45a, 0xbcbe52], side: [0x9aae4a, 0x8ea444], hole: [0x5c6a2c, 0x56622a] } as const;
const POD_DRY = { top: [0x8a6a3e, 0x80623a], side: [0x74583a, 0x6c5236], hole: [0x3a2c1e, 0x33271c] } as const;
const BUD = { base: [0x8aa650, 0x9aae58], body: [0xeea0bc, 0xe894b4], tip: [0xd8668e, 0xd06088] } as const;

const tonePick = (list: readonly number[], r: Rng) => list[Math.floor(r() * list.length) % list.length];

// ── Leaves ───────────────────────────────────────────────────────────────────

/**
 * An emergent lotus leaf `d` metres across, its navel at (x, y, z): a dish of
 * half-texel cells whose top rises towards a wavy rim, tilted a little,
 * stepped to quarter texels. `dry` browns its rim. Emits its own plate.
 */
export function lotusLeaf(p: PieceBuilder, o: { x: number; y: number; z: number; d: number; seed: number; dry?: boolean }): void {
  const r = rng(o.seed);
  const cell = TEXEL / 2;
  const plate = new Plate(cell, Math.floor(o.x / TEXEL) * TEXEL, Math.floor(o.z / TEXEL) * TEXEL);
  const part = plate.part();
  const R = o.d / 2;
  const waves = r.int(5, 8);
  const phase = r() * Math.PI * 2;
  const [tx, tz] = [r.range(-0.25, 0.25), r.range(-0.25, 0.25)];
  const veins = r.int(11, 14);
  const vPhase = r() * Math.PI * 2;
  const step = TEXEL / 4;
  const n = Math.ceil(R / cell) + 1;
  const [ci, ck] = plate.index(o.x, o.z);
  for (let i = ci - n; i <= ci + n; i++)
    for (let k = ck - n; k <= ck + n; k++) {
      const [px, pz] = plate.at(i, k);
      const [dx, dz] = [px - o.x, pz - o.z];
      const a = Math.atan2(dz, dx);
      const rho = Math.hypot(dx, dz) / R;
      const wave = Math.sin(waves * a + phase);
      if (rho > 1 + 0.05 * wave) continue;
      const lift = R * (0.2 * rho * rho + 0.07 * wave * rho * rho * rho) + tx * dx + tz * dz;
      const top = o.y + Math.round(lift / step) * step;
      const va = Math.abs(Math.sin(((a + vPhase) * veins) / 2));
      const patch = valueNoise3(px * 5, pz * 5, 1.5, o.seed) > 0.5 ? 1 : 0;
      const tones =
        rho < 0.16 ? LOTUS_LEAF.navel : o.dry && rho > 0.72 + 0.12 * wave ? LOTUS_LEAF.dry : rho > 0.86 ? LOTUS_LEAF.rim : va < 0.14 && rho > 0.22 ? LOTUS_LEAF.vein : LOTUS_LEAF.top;
      plate.set(i, k, { top, color: tones[(patch + (rho > 0.5 ? 1 : 0)) % tones.length], part });
    }
  plate.commit(p.voxels, { mat: 'leaves', thick: TEXEL / 2, surf: leafSurf({ yellow: o.dry ? 0.4 : 0.05 }), src: here() });
}

// ── Flowers, buds, pods ──────────────────────────────────────────────────────

/**
 * An open lotus `diameter` metres across, its base at (x, y, z): three whorls
 * of broad cupped petals (five, six, five) rising to a bowl, pale at the base
 * and deep pink at the tips, round a ring of stamens and the flat-topped seed pod.
 */
export function lotusBloom(g: VoxelGrid, x: number, y: number, z: number, o: { diameter: number; seed: number }): void {
  const r = rng(o.seed);
  const R = o.diameter / 2;
  const c = g.cell[0];
  const a0 = r() * Math.PI * 2;
  const tint = (t: number) => tonePick(t < 0.3 ? PETAL.base : t > 0.78 ? PETAL.tip : PETAL.body, r);
  const whorls: [number, number, number, number][] = [
    // count, elevation, length, half-width
    [5, 0.5, R, R * 0.4],
    [6, 0.85, R * 0.92, R * 0.38],
    [5, 1.18, R * 0.78, R * 0.34],
  ];
  whorls.forEach(([n, el, len, w], wi) => {
    for (let q = 0; q < n; q++) {
      const az = a0 + (wi * Math.PI) / n + (q / n) * Math.PI * 2 + r.range(-0.1, 0.1);
      petal(g, { base: [x + Math.cos(az) * R * 0.14, y + wi * c, z + Math.sin(az) * R * 0.14], az, el: el + r.range(-0.08, 0.08), len: len * r.range(0.94, 1.04), w, cup: 0.55, widest: 0.5, point: 0.6, color: tint });
    }
  });
  pod(g, x, y + c, z, { top: R * 0.24, h: 3 * c, look: POD, seed: o.seed, ring: true });
}

/**
 * A seed pod: a flat-topped cone `top` metres in radius, `h` tall, its top
 * pitted with seed holes; `ring` adds the flower's stamens round its foot.
 */
function pod(g: VoxelGrid, x: number, y: number, z: number, o: { top: number; h: number; look: typeof POD | typeof POD_DRY; seed: number; ring?: boolean; lean?: [number, number] }): void {
  const r = rng(o.seed);
  const c = g.cell[0];
  const n = Math.max(2, Math.round(o.h / c));
  const R = Math.ceil(o.top / c) + 1;
  const [lx, lz] = o.lean ?? [0, 0];
  for (let j = 0; j < n; j++) {
    const rad = o.top * (0.45 + (0.55 * (j + 1)) / n);
    const [ox, oz] = [lx * j * c, lz * j * c];
    for (let i = -R; i <= R; i++)
      for (let k = -R; k <= R; k++) {
        const d = Math.hypot(i, k) * c;
        if (d > rad) continue;
        const topLayer = j === n - 1;
        const hole = topLayer && d < rad - c * 0.8 && (i * 7 + k * 3 + 100) % 4 === 0;
        putAt(g, x + i * c + ox, y + (j + 0.5) * c, z + k * c + oz, tonePick(hole ? o.look.hole : topLayer ? o.look.top : o.look.side, r));
      }
  }
  if (o.ring)
    for (let q = 0; q < 14; q++) {
      const a = (q / 14) * Math.PI * 2;
      const d = o.top + c * 0.9;
      for (let j = 0; j < 2; j++) putAt(g, x + Math.cos(a) * d, y + (j + 0.5) * c, z + Math.sin(a) * d, tonePick(STAMENS, r));
    }
}

// ── A stand of lotus ─────────────────────────────────────────────────────────

export interface LotusStandOptions extends FloraArea {
  seed: number;
  /** Centre (default: a free spot on the surface). */
  x?: number;
  z?: number;
  /** Radius of the stand (default 0.9 m). */
  radius?: number;
  /** Tallest leaf above the water (default 0.95 m). */
  height?: number;
  /** Leaves held over the water (default 7), young leaves floating on it (default 5). */
  leaves?: number;
  floating?: number;
  /** Open flowers (default 2), buds (default 2), seed pods (default 1). */
  flowers?: number;
  buds?: number;
  pods?: number;
}

/**
 * A stand of lotus: leaves held up on their stalks (the tallest in the middle,
 * lower towards the edge), a rolled young leaf, flowers standing over them,
 * pointed buds, an old seed pod, and young leaves floating flat round its
 * foot. Returns its footprint.
 */
export function lotusStand(p: PieceBuilder, s: WaterSurface, o: LotusStandOptions): FloraSpot[] {
  const r = rng(o.seed * 43 + 7);
  const src = here();
  const R = o.radius ?? 0.9;
  const H = o.height ?? 0.95;
  const at = o.x !== undefined && o.z !== undefined ? [o.x, o.z] : findSpot(r, s, R, [], o);
  if (!at) return [];
  const [cx, cz] = at;
  const g = p.voxels.grid({ cell: BLOOM_CELL, origin: [Math.floor(s.x0 / TEXEL) * TEXEL, s.top, Math.floor(s.z0 / TEXEL) * TEXEL], mat: 'petal', jitter: 0.04, ao: 0.2, seed: o.seed });
  const snapY = (y: number) => s.top + Math.round((y - s.top) / BLOOM_CELL) * BLOOM_CELL;
  const taken: FloraSpot[] = [];
  const spot = (reach: number, rad: number): [number, number] => {
    const q = findSpot(r, s, rad, taken, { near: { x: cx, z: cz, r: reach }, tries: 16 });
    const [x, z] = q ?? [cx + r.range(-reach, reach) * 0.5, cz + r.range(-reach, reach) * 0.5];
    taken.push({ x, z, r: rad * 0.6 });
    return [x, z];
  };
  const stem = (x: number, z: number, y1: number) =>
    stalk(p.voxels, { x, z, y0: s.top - PAD_SINK, y1, w: BLOOM_CELL, color: tonePick(STALK, r), bend: r.chance(0.7) ? { at: r.range(0.25, 0.75), dx: r.int(-1, 1), dz: r.int(-1, 1) } : undefined, src });

  // Leaves: tallest first, in the middle.
  const nl = o.leaves ?? 7;
  for (let q = 0; q < nl; q++) {
    const d = r.range(0.34, 0.6);
    const [x, z] = spot(R * (0.25 + (0.55 * q) / Math.max(1, nl - 1)), d / 2);
    const y = snapY(s.top + H * (1 - (0.6 * q) / Math.max(1, nl - 1)) * r.range(0.9, 1.05));
    stem(x, z, y - TEXEL / 2);
    lotusLeaf(p, { x, y, z, d, seed: o.seed * 31 + q, dry: q === nl - 1 });
  }
  // A young leaf still rolled up.
  {
    const [x, z] = spot(R * 0.6, 0.05);
    const y = snapY(s.top + H * r.range(0.35, 0.55));
    const [tx, tz] = stem(x, z, y);
    spindle(g, tx, y, tz, { len: 0.16, width: 0.035, dir: [0.2, 0.98, 0], color: () => tonePick(LOTUS_LEAF.top, r) });
  }
  // Flowers over the leaves, buds and pods among them.
  for (let q = 0; q < (o.flowers ?? 2); q++) {
    const [x, z] = spot(R * 0.55, 0.12);
    const y = snapY(s.top + H * r.range(0.85, 1.15));
    const [tx, tz] = stem(x, z, y + BLOOM_CELL);
    lotusBloom(g, tx, y, tz, { diameter: r.range(0.22, 0.27), seed: o.seed * 57 + q });
  }
  for (let q = 0; q < (o.buds ?? 2); q++) {
    const [x, z] = spot(R * 0.65, 0.05);
    const y = snapY(s.top + H * r.range(0.7, 1.1));
    const [tx, tz] = stem(x, z, y + BLOOM_CELL);
    const turn = r() * Math.PI;
    spindle(g, tx, y, tz, {
      len: r.range(0.11, 0.14),
      width: r.range(0.055, 0.065),
      dir: [0, 1, 0],
      color: (t, a) => tonePick(t < 0.2 ? BUD.base : t > 0.72 || Math.abs(Math.sin(2.5 * (a + turn))) < 0.2 ? BUD.tip : BUD.body, r),
    });
  }
  for (let q = 0; q < (o.pods ?? 1); q++) {
    const [x, z] = spot(R * 0.7, 0.05);
    const dry = q % 2 === 0;
    const y = snapY(s.top + H * r.range(0.6, 0.95));
    const [tx, tz] = stem(x, z, y + BLOOM_CELL);
    pod(g, tx, y, tz, { top: r.range(0.035, 0.045), h: 0.05, look: dry ? POD_DRY : POD, seed: o.seed * 71 + q, lean: dry ? [r.int(-1, 1) * 0.5, r.int(-1, 1) * 0.5] : undefined });
  }
  g.commit();

  // Young leaves floating round the foot of the stand.
  const bed: LeafBed = padBed(s);
  for (let q = 0; q < (o.floating ?? 5); q++) {
    const a = r() * Math.PI * 2;
    const d = R * r.range(0.55, 1);
    const size = r.range(0.2, 0.34);
    bed.drop({ shape: padShape(0, r() * Math.PI * 2, { teeth: 0.03 }), size, thick: PAD_THICK, color: tonePick(LOTUS_LEAF.top, r), surf: leafSurf({ yellow: r.chance(0.3) ? 0.3 : 0 }), cell: LEAF_CELL }, cx + Math.cos(a) * d, cz + Math.sin(a) * d, r() * Math.PI * 2, 0.12);
  }
  bed.commit(p);
  return [{ x: cx, z: cz, r: R }];
}
