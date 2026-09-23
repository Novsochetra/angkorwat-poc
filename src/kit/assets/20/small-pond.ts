import { valueNoise3 } from '../../../voxel/random';
import type { VoxelGrid } from '../../../voxel/VoxelBuilder';
import { TEMPLE_BLOCK_M } from '../../../world/scale';
import { BlockSet } from '../../BlockSet';
import { GRASS_TONES, grassTuft } from '../../lib/grass';
import { GRASS } from '../../palette';
import { PieceBuilder } from '../../PieceBuilder';
import { rng, snap, TEXEL, type Rng } from '../../shapes';
import { leafSurf, stoneSurf } from '../../surface';
import { defineKitAsset, type KitPiece } from '../../types';
import { joints, MossLayer, pores, PROP_BROKEN, PROP_MOSS, PROP_STONE, PROP_STONE_LOW, PROP_STONE_OLD, PROP_WET } from './_masonry-props';
import { pondFlora, waterBody } from './_pond';

/**
 * ⑧ Small pond — a basin of weathered sandstone around dark teal water, as on
 * the §20 sheet: one course of chunky mossy blocks standing on the ground with
 * an uneven top (taller stones and a second course at the back corners, a
 * lower outer step along part of the front), the water about a third of a
 * metre below the rim with lily-pad clusters, pink lotus flowers and a bud,
 * grass tufts at the foot of the rim and moss on its stones. The round pond is
 * the sheet's third one: a rounded, uneven basin cut from a platform of blocks,
 * its front worn down, dry leaves floating on it.
 *
 * The basin stands on the ground (y = 0): 0.5 m blocks, the water surface
 * 0.19 m up over a dark silt bed — the explorer walks on the rim, not into the
 * water.
 */
const B = TEMPLE_BLOCK_M;
/** Carve cell of the masonry: 1/8 m, so chips and the round basin's curve come in two-texel bites. */
const CELL = 0.125;
/** Water surface: five texels (0.31 m) below the rim's nominal top. */
const WATER_TOP = B - 5 * TEXEL;
const BED_TOP = TEXEL;

/** The rim's stones: the §20 props' sandstone; about a quarter of them older, greyer and streaked (the sheet mixes the two). */
const STONE = PROP_STONE;
const STONE_OLD = PROP_STONE_OLD;
/** The lower outer steps: darker, damper. */
const STONE_LOW = PROP_STONE_LOW;
/**
 * Pattern amounts. The pattern's own moss (a cool green) stays light; the
 * sheet's olive moss on the rim tops is laid on as cushions (below).
 */
const SURF = {
  rim: stoneSurf({ moss: 0.24, stain: 0.3, lichen: 0.08, crack: 0.05 }),
  mossy: stoneSurf({ moss: 0.34, stain: 0.34, lichen: 0.1, crack: 0.05 }),
  old: stoneSurf({ moss: 0.3, stain: 0.5, lichen: 0.14, crack: 0.08 }),
  low: stoneSurf({ moss: 0.24, stain: 0.45, lichen: 0.05 }),
};
/** Moss cushions on the stones: the sheet's olive moss on the rim tops, a yellow-green tuft here and there. */
const MOSS_CUSHION = [PROP_MOSS.lit[1], PROP_MOSS.lit[2], ...PROP_MOSS.mid, ...PROP_MOSS.deep, GRASS.tip[0]];
/** Pores per m² of face. */
const PORES = 7;

interface Pond {
  /** Outer length (x) and width (z) at the default size, metres. */
  length: number;
  width: number;
  /** Rounded, uneven basin cut from a platform of blocks instead of a square ring. */
  round?: boolean;
  /** Per m² of water: lily-pad clusters, loose pads, open flowers, buds, floating dry leaves. */
  flora: [number, number, number, number, number];
  /** Pad size (1 = 0.25–0.43 m pads in 0.7–1 m clusters). */
  pads?: number;
  /** Corners that carry a second course (the back one first). */
  caps: number;
  /** Lower outer steps along part of the front and the right side. */
  steps?: boolean;
}

const PONDS: Record<string, Pond> = {
  large: { length: 4.5, width: 3.5, flora: [0.55, 0.25, 0.32, 0.12, 0], caps: 2, steps: true },
  small: { length: 2.25, width: 2.25, flora: [0.64, 3.2, 0.64, 0, 0], pads: 0.7, caps: 1 },
  round: { length: 4, width: 3.5, round: true, flora: [0.45, 0.5, 0.2, 0.25, 3], caps: 0 },
};

/** Block lengths along a course: 0.5–0.8 m on a `step` grid, no sliver at the end. */
function lengths(total: number, r: Rng, step = CELL): number[] {
  const out: number[] = [];
  let left = total;
  while (left > 1e-6) {
    let len = snap(r.range(0.5, 0.8), step);
    if (left <= 0.9) len = left;
    else if (left - len < 0.4) len = snap(left / 2, step);
    out.push(len);
    left -= len;
  }
  return out;
}

/** Rim height: the nominal course, a cell lower or one or two higher here and there. */
function rimHeight(r: Rng): number {
  const t = r();
  return B + CELL * (t < 0.12 ? -1 : t < 0.62 ? 0 : t < 0.92 ? 1 : 2);
}

/** Tone picker that never gives two stones laid one after the other the same tone. */
function tones(r: Rng): (list: readonly number[]) => number {
  let last = -1;
  return (list) => {
    let t = r.int(0, list.length - 1);
    if (t === last) t = (t + 1) % list.length;
    last = t;
    return list[t];
  };
}

const style = (r: Rng, surf = r.chance(0.4) ? SURF.mossy : SURF.rim) => ({ surf, broken: PROP_BROKEN });

/** A rim stone's colour and look: the pond's warm sandstone, or now and then an older, darker one. */
function rimStone(r: Rng, tone: (list: readonly number[]) => number): [number, ReturnType<typeof style>] {
  return r.chance(0.28) ? [tone(STONE_OLD), style(r, SURF.old)] : [tone(STONE), style(r)];
}

/**
 * The square basin: a ring one block thick (front and back run the full
 * length and own the corners, the sides fit between), corners a little taller
 * — but the one nearest the viewer (+x, +z) low, so the water shows — and a
 * second course on the back corner (and one more on the large pond) that
 * reaches past the joint below it onto the side's first stone.
 */
function squareRim(set: BlockSet, pond: Pond, W: number, D: number, r: Rng): void {
  const [hx, hz] = [W / 2, D / 2];
  const [ix, iz] = [hx - B, hz - B];
  const stones: { x0: number; z0: number; x1: number; z1: number; h: number }[] = [];
  const run = (a0: number, a1: number, c0: number, c1: number, axis: 'x' | 'z') => {
    let a = a0;
    for (const len of lengths(a1 - a0, r)) {
      stones.push(axis === 'x' ? { x0: a, z0: c0, x1: a + len, z1: c1, h: rimHeight(r) } : { x0: c0, z0: a, x1: c1, z1: a + len, h: rimHeight(r) });
      a += len;
    }
  };
  run(-hx, hx, iz, hz, 'x');
  run(-hx, hx, -hz, -iz, 'x');
  run(-iz, iz, -hx, -ix, 'z');
  run(-iz, iz, ix, hx, 'z');
  const at = (x: number, z: number) => stones.find((s) => s.x0 <= x && x < s.x1 && s.z0 <= z && z < s.z1)!;
  const corner = (sx: number, sz: number) => at(sx * (hx - 0.01), sz * (hz - 0.01));
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1]]) corner(sx, sz).h = B + CELL * r.int(1, 2);
  corner(1, 1).h = B;
  const caps: [number, number, number, number, number, number][] = [];
  for (const [sx, sz] of [[-1, -1], ...(r.chance(0.5) ? [[-1, 1]] : [[1, -1]])].slice(0, pond.caps)) {
    const c = corner(sx, sz);
    at(sx * (hx - 0.01), sz * (iz - 0.01)).h = c.h;
    const reach = B + CELL * r.int(1, 2);
    const [x0, x1] = sx < 0 ? [-hx, -ix] : [ix, hx];
    const [z0, z1] = sz < 0 ? [-hz, -hz + reach] : [hz - reach, hz];
    caps.push([x0, c.h, z0, x1, c.h + 2 * CELL, z1]);
  }
  const tone = tones(r);
  for (const s of stones) set.add(s.x0, 0, s.z0, s.x1, s.h, s.z1, ...rimStone(r, tone));
  for (const c of caps) set.add(...c, tone(STONE), style(r, SURF.mossy));
  if (pond.steps) {
    // Lower outer steps: a run along the left part of the front, two stones by the right-hand back corner.
    let x = -hx + CELL * r.int(1, 2);
    for (const len of lengths(snap(r.range(1.4, 1.9), CELL), r)) {
      set.add(x, 0, hz, x + len, 2 * CELL, hz + 3 * CELL, tone(STONE_LOW), style(r, SURF.low));
      x += len;
    }
    let z = -iz + CELL * r.int(0, 2);
    for (const len of lengths(snap(r.range(0.9, 1.2), CELL), r)) {
      set.add(hx, 0, z, hx + 3 * CELL, 2 * CELL, z + len, tone(STONE_LOW), style(r, SURF.low));
      z += len;
    }
  }
}

/**
 * The round basin: a platform of block courses (rows along x, staggered
 * joints) with the water's rounded, uneven outline cut out of it and its outer
 * corners rounded off, both in 1/4 m steps, so the curve reads as stones laid
 * in a ring rather than a smooth cut. The water is near-elliptic, the outside a
 * rounded square: the ring is a block wide on the sides and thicker at the
 * corners, where it keeps the corners of the water box covered. The front right
 * is worn down to a low sill. Returns the water outline.
 */
function roundRim(set: BlockSet, W: number, D: number, r: Rng, seed: number): (x: number, z: number) => boolean {
  const [hx, hz] = [W / 2, D / 2];
  const [ix, iz] = [hx - B, hz - B];
  const Q = 0.25;
  const q = (v: number) => (Math.floor(v / Q) + 0.5) * Q;
  const wobble = (x: number, z: number, amp: number, s: number) => {
    const a = Math.atan2(z, x);
    return 1 + amp * (valueNoise3(Math.cos(a) * 1.6, Math.sin(a) * 1.6, 0.5, seed + s) - 0.5) * 2;
  };
  const inWater = (x: number, z: number) => Math.abs(x) < ix && Math.abs(z) < iz && (Math.abs(x) / ix) ** 2.1 + (Math.abs(z) / iz) ** 2.1 < wobble(x, z, 0.07, 3) ** 2.1;
  // (never a column that reaches into the water box, which runs a texel under the stone)
  const outside = (x: number, z: number) =>
    !(Math.abs(x) < ix + TEXEL + Q / 2 && Math.abs(z) < iz + TEXEL + Q / 2) && (Math.abs(x) / hx) ** 3 + (Math.abs(z) / hz) ** 3 > wobble(x, z, 0.04, 7) ** 3;
  // One decision per 1/4 m column (the carve asks for every cell).
  const cuts = new Map<number, boolean>();
  const cut = (x: number, z: number) => {
    const kk = (Math.floor(x / Q) + 512) * 1024 + Math.floor(z / Q) + 512;
    let c = cuts.get(kk);
    if (c === undefined) cuts.set(kk, (c = inWater(q(x), q(z)) || outside(q(x), q(z))));
    return c;
  };
  const tone = tones(r);
  for (let z = -hz; z < hz - 1e-6; z += B) {
    const dz = Math.min(B, hz - z);
    let x = -hx;
    for (const len of lengths(W, r, Q)) {
      let keep = false;
      for (let a = x + Q / 2; a < x + len && !keep; a += Q) for (let b = z + Q / 2; b < z + dz && !keep; b += Q) keep = !cut(a, b);
      if (keep) {
        // Worn down at the front right, where the sheet's rim has fallen low.
        const worn = z + dz > iz + 0.1 && x + len / 2 > -0.4;
        const h = worn ? CELL * r.pick([2, 3, 3]) : rimHeight(r) + (r.chance(0.15) ? CELL : 0);
        set.add(x, 0, z, x + len, h, z + dz, ...(worn ? ([tone(STONE_LOW), style(r, SURF.low)] as const) : rimStone(r, tone)));
      }
      x += len;
    }
  }
  set.carve((x, _y, z) => cut(x, z));
  return (x, z) => inWater(q(x), q(z));
}

/** The deco grid's row just above the stone at cell column (i, k), or −1 if there's no stone under it. */
function topRow(solid: (x: number, y: number, z: number) => boolean, i: number, k: number): number {
  for (let j = 20; j > 0; j--) if (solid((i + 0.5) * TEXEL, (j - 0.5) * TEXEL, (k + 0.5) * TEXEL)) return j;
  return -1;
}

/**
 * A moss cushion on a stone top around (x, z): a texel thick, two in the
 * middle, hanging a texel or two down the outside where the patch reaches the
 * edge (`inner` marks the columns over the water, where it doesn't).
 */
function mossCushion(g: VoxelGrid, solid: (x: number, y: number, z: number) => boolean, inner: (i: number, k: number) => boolean, x: number, z: number, size: number, r: Rng): void {
  const ci = Math.floor(x / TEXEL);
  const ck = Math.floor(z / TEXEL);
  const base = topRow(solid, ci, ck);
  if (base < 0) return;
  const rad = 0.8 + size * r.range(1.2, 2.2);
  const R = Math.ceil(rad);
  const tone = () => r.pick(MOSS_CUSHION);
  for (let di = -R; di <= R; di++)
    for (let dk = -R; dk <= R; dk++) {
      const d = Math.hypot(di, dk) / rad;
      if (d > 1 || r.chance(d * 0.45)) continue;
      const [i, k] = [ci + di, ck + dk];
      const top = topRow(solid, i, k);
      if (Math.abs(top - base) <= 1) {
        g.set(i, top, k, tone());
        if (d < 0.35 && r.chance(0.35)) g.set(i, top + 1, k, tone());
      } else if (top < base - 1 && !inner(i, k) && r.chance(0.7)) {
        // Off the edge: hang down the face.
        for (let j = base - 1; j >= base - r.int(1, 2); j--) if (!solid((i + 0.5) * TEXEL, (j + 0.5) * TEXEL, (k + 0.5) * TEXEL)) g.set(i, j, k, tone());
      }
    }
}

/**
 * Colliders: one box per stone, or — for a stone the round outline cut into —
 * one per 1/8 m strip of what is left, so the explorer can't stand over the water.
 */
function rimColliders(p: PieceBuilder, set: BlockSet): void {
  const s = CELL;
  for (const id of set.find(() => true)) {
    const { min, max } = set.boxOf(id);
    const y = (min[1] + max[1]) / 2;
    const strips: [number, number, number][] = [];
    let cells = 0;
    let solid = 0;
    for (let x = min[0]; x < max[0] - 1e-6; x += s) {
      let [z0, z1] = [Infinity, -Infinity];
      for (let z = min[2]; z < max[2] - 1e-6; z += s) {
        cells++;
        if (!set.solidAt(x + s / 2, y, z + s / 2)) continue;
        solid++;
        [z0, z1] = [Math.min(z0, z), Math.max(z1, z + s)];
      }
      if (z0 < z1) strips.push([x, z0, z1]);
    }
    if (solid >= cells * 0.9) {
      p.collider(min[0], min[1], min[2], max[0], max[1], max[2]);
      continue;
    }
    // Merge neighbouring strips that cover the same span.
    for (let a = 0; a < strips.length; ) {
      let b = a + 1;
      while (b < strips.length && strips[b][1] === strips[a][1] && strips[b][2] === strips[a][2] && Math.abs(strips[b][0] - strips[b - 1][0] - s) < 1e-6) b++;
      p.collider(strips[a][0], min[1], strips[a][1], strips[b - 1][0] + s, max[1], strips[a][2]);
      a = b;
    }
  }
}

function build(variant: string, seed: number, length?: number): KitPiece {
  const pond = PONDS[variant] ?? PONDS.large;
  const r = rng(seed * 7 + 3);
  // (on a 1/4 m grid, so the half sizes stay on the carve cells)
  const W = Math.max(1.5, snap(length ?? pond.length, 2 * CELL));
  const D = Math.max(1.5, snap((W * pond.width) / pond.length, 2 * CELL));
  const [hx, hz] = [W / 2, D / 2];
  const [ix, iz] = [hx - B, hz - B];
  const p = new PieceBuilder();
  const set = new BlockSet(CELL);
  const t2 = TEXEL / 2;
  let water = (x: number, z: number) => Math.abs(x) < ix - t2 && Math.abs(z) < iz - t2;
  if (pond.round) {
    const outline = roundRim(set, W, D, r, seed);
    // Plants keep a texel off the stone.
    water = (x, z) => outline(x - TEXEL, z) && outline(x + TEXEL, z) && outline(x, z - TEXEL) && outline(x, z + TEXEL);
  } else squareRim(set, pond, W, D, r);

  // Weathering: chipped edges (not the bottom row: the blocks sit flat) and a bite or two off top corners.
  // (never next to the water box, whose edges run a texel under the stone)
  const nearWater = (x: number, y: number, z: number) => y < WATER_TOP + TEXEL && Math.abs(x) < ix + 3 * TEXEL && Math.abs(z) < iz + 3 * TEXEL;
  set.erode(pond.round ? 0.28 : 0.18, seed + 11, { where: (x, y, z) => y > CELL && !nearWater(x, y, z) });
  const ids = set.find(() => true);
  for (let b = r.int(1, 2); b > 0; b--) {
    const { min, max } = set.boxOf(r.pick(ids));
    set.carveSphere(r.chance(0.5) ? min[0] : max[0], max[1], r.chance(0.5) ? min[2] : max[2], r.range(0.1, 0.16), seed + b);
  }
  // (a stronger brightness step from stone to stone, so the blocks read one by one like the sheet's)
  set.emit(p.voxels, { seed, jitter: 0.09 });
  pores(p, set, seed, PORES, (_x, y) => y > 0);
  joints(p, set, seed);
  rimColliders(p, set);
  const solid = (x: number, y: number, z: number) => set.solidAt(x, y, z);

  // The water, a third of a metre below the rim, with a damp line along the square basin's walls, and its plants.
  waterBody(p, { x0: -ix - TEXEL, z0: -iz - TEXEL, x1: ix + TEXEL, z1: iz + TEXEL, top: WATER_TOP, bed: BED_TOP, bottom: 0, seed });
  if (!pond.round) {
    const wet = (x0: number, z0: number, x1: number, z1: number) => p.voxels.span(x0, WATER_TOP, z0, x1, WATER_TOP + TEXEL, z1, r.pick(PROP_WET), 'sandstone', { surf: stoneSurf({ moss: 0.5, stain: 0.5 }) });
    wet(-ix, -iz, ix, -iz + t2);
    wet(-ix, iz - t2, ix, iz);
    wet(-ix, -iz + t2, -ix + t2, iz - t2);
    wet(ix - t2, -iz + t2, ix, iz - t2);
  }
  // Plants by the area of water, capped so a pond made bigger with `height` stays in budget.
  const area = 4 * ix * iz * (pond.round ? 0.8 : 1);
  const [c, sp, f, b, l] = pond.flora.map((d, n) => Math.min(d * area, [14, 8, 4, 3, 30][n]));
  pondFlora(p, {
    top: WATER_TOP,
    x0: -ix,
    z0: -iz,
    x1: ix,
    z1: iz,
    inside: water,
    seed,
    clusters: Math.max(1, Math.round(c)),
    pads: Math.round(sp),
    flowers: Math.max(1, Math.round(f)),
    buds: Math.round(b),
    leaves: Math.round(l),
    scale: pond.pads,
  });

  // Grass at the foot of the rim — thicker along the front and left, like the sheet's — and moss on the stones.
  const g = p.voxels.grid({ cell: TEXEL, origin: [0, 0, 0], mat: 'leaves', jitter: 0.08, ao: 0.35, seed, surf: leafSurf({ yellow: 0.15 }) });
  const [ni, nk] = [Math.ceil(hx / TEXEL) + 8, Math.ceil(hz / TEXEL) + 8];
  const foot: [number, number][] = [];
  for (let i = -ni; i < ni; i++)
    for (let k = -nk; k < nk; k++) {
      const [x, z] = [(i + 0.5) * TEXEL, (k + 0.5) * TEXEL];
      if ((Math.abs(x) < ix + TEXEL && Math.abs(z) < iz + TEXEL) || solid(x, t2, z)) continue;
      if (solid(x + 2 * TEXEL, t2, z) || solid(x - 2 * TEXEL, t2, z) || solid(x, t2, z + 2 * TEXEL) || solid(x, t2, z - 2 * TEXEL)) foot.push([i, k]);
    }
  const tufts = Math.round((foot.length / 30) * (pond.round ? 1.3 : 1));
  for (let t = 0; t < tufts; t++) {
    const [i, k] = r.pick(foot);
    // Fewer at the back and right, where the rim hides them anyway.
    if ((k * TEXEL < -hz + 0.2 || i * TEXEL > hx - 0.2) && r.chance(0.55)) continue;
    grassTuft(g, i, k, { height: r.int(3, 5), radius: r.range(1.5, 2.3), lean: 0.45, tones: r.chance(0.65) ? GRASS_TONES.lawn : GRASS_TONES.meadow, seed: seed * 101 + t });
  }
  // A big clump or two by the front corners, as the sheet draws them.
  const front = foot.filter(([i, k]) => (k + 0.5) * TEXEL > hz - 0.3 && Math.abs((i + 0.5) * TEXEL) > hx - 1.2);
  for (let t = 0; t < 2 && front.length; t++) {
    const [i, k] = r.pick(front);
    grassTuft(g, i, k, { height: r.int(4, 6), radius: r.range(2.6, 3.2), lean: 0.5, arms: 0.7, tones: GRASS_TONES.lawn, seed: seed * 131 + t });
  }
  const inner = (i: number, k: number) => Math.abs((i + 0.5) * TEXEL) < ix + TEXEL && Math.abs((k + 0.5) * TEXEL) < iz + TEXEL;
  // The sheet's olive felt lying on the rim tops, and here and there a thicker cushion hanging over an edge.
  const felt = new MossLayer(p, seed, solid);
  felt.cover(set, pond.round ? 0.22 : 0.15);
  felt.commit();
  for (const id of ids)
    if (r.chance(pond.round ? 0.35 : 0.22)) {
      const { min, max } = set.boxOf(id);
      mossCushion(g, solid, inner, r.range(min[0] + 0.05, max[0] - 0.05), r.range(min[2] + 0.05, max[2] - 0.05), r.range(0.5, 1.1), r);
    }
  // Blades can lean into the stone or over the water: drop those cells, ghost the ground for the roots' shade.
  const drop: [number, number, number][] = [];
  g.forEach((i, j, k) => {
    const [x, y, z] = g.center(i, j, k);
    if (solid(x, y, z) || (Math.abs(x) < ix + TEXEL && Math.abs(z) < iz + TEXEL && y < WATER_TOP + TEXEL && topRow(solid, i, k) < 0)) drop.push([i, j, k]);
  });
  for (const [i, j, k] of drop) g.delete(i, j, k);
  g.forEach((i, j, k) => {
    if (j === 0 && !g.has(i, -1, k)) g.ghost(i, -1, k);
  });
  g.commit();
  return p.done();
}

export default defineKitAsset({
  section: '20',
  order: 8,
  name: 'Small pond',
  caption: 'Small water pond or reservoir.',
  size: {
    real: '4.5 × 3.5 m basin (small 2.25 m, round 4 × 3.5 m), 0.5 m blocks, water 0.31 m below the rim',
    sheet: 'not given (≈ 4 × 3.5 m by its blocks)',
    note: 'Small temple basins and garden ponds run 3–5 m; the sheet’s rim reads as one course of 0.5 m blocks, which fixes its scale. Lily pads 0.25–0.4 m; the lotus is built to real size (0.22–0.28 m, where the sheet draws it ~0.45 m) in half-texel cells.',
  },
  variants: [
    { id: 'large', name: 'Large pond' },
    { id: 'small', name: 'Small basin' },
    { id: 'round', name: 'Round pond' },
  ],
  ref: { sheet: 'section 20/6706F03E-0DFA-4AFA-80F0-5C031D4F49D5.PNG', box: [630, 408, 908, 692] },
  build: ({ variant, seed, height }) => build(variant, seed, height),
});
