import type { VoxelGrid } from '../../../voxel/VoxelBuilder';
import { LEAF_CELL, LeafBed, type LeafShape } from '../../lib/leaves';
import { POND, type WaterSurface } from '../../lib/water';
import type { PieceBuilder } from '../../PieceBuilder';
import { here, rng, TEXEL, type Rng } from '../../shapes';
import { leafSurf } from '../../surface';
import { findSpot, stalk, type FloraArea, type FloraSpot } from './_flora-core';

/**
 * Water lilies for any water surface — the §17.2 ③ lily pads, and the lilies
 * of the §21.3 moat and the kit level.
 *
 * What the sheet draws: clusters of green pads on blue water with a pink
 * flower sitting in the middle of each — an upright cup of pink petals, paler
 * at the tips, round a tall yellow centre — and small orange-red buds lying on
 * the pads. Its pads are four-lobed like clover; the lilies of Angkor's pools
 * and moat (Nymphaea pubescens, pink or white) have round pads with a single
 * V-notch (the sinus, running from the rim to where the stalk meets the pad),
 * a finely toothed rim, 0.2–0.4 m across, lying flat on the water; young pads
 * are bronze-red (the sheet's orange-red spots) and old ones yellow and
 * nibbled. Each plant spreads 6–12 pads round its crown, their notches turned
 * towards it; the star-shaped flowers, ≈ 0.15 m across, stand 0.05–0.2 m above
 * the water on their stalks, the buds beside them.
 *
 * Pads are leaf plates of `lib/leaves.ts` (a third-texel lattice, merged into
 * runs) floating on a {@link LeafBed} laid at the water line, so overlapping
 * pads ride up on each other; flowers and buds are drawn in quarter-texel
 * cells, enough for sixteen petals round a 0.15 m bloom.
 */

export type LilyKind = 'pink' | 'white';

/** Pad greens: the §17.1 / §20 ponds' pads (the sheet's #8ba121 lit, #66752b and #607d1b in shade). */
export const LILY_PAD = POND.pad;
/** Young pads: bronze-red, the sheet's orange-red spots on its pads. */
export const LILY_YOUNG = [0xb0603a, 0x9a4e30, 0xc47444] as const;
/** Old pads, going yellow. */
export const LILY_OLD = [0xa8a03c, 0xb49a40, 0x9c9a3a] as const;

/** Petal tones by part of the petal (base → tip), pink and white lilies (the sheet's #d06695 body, #ecb9d0 light). */
const PETALS: Record<LilyKind, { base: readonly number[]; body: readonly number[]; tip: readonly number[]; inner: readonly number[] }> = {
  pink: { base: [0xf6cfe0, 0xf2c2d6], body: [0xe8889f, 0xe17d9e, 0xec94b2], tip: [0xd4608c, 0xcc5a86], inner: [0xf4b0c8, 0xf0a4c0] },
  white: { base: [0xf6f0cc, 0xf2ecc0], body: [0xfdfaf4, 0xf7f3ea, 0xffffff], tip: [0xf0eee6, 0xe8ecdc], inner: [0xfffcf2, 0xfaf6e8] },
};
/** Stamens: the sheet's tall yellow centre (#fac21d), orange where shaded (#ec7c23). */
const STAMEN = [0xf6c21c, 0xf2b41a, 0xf8cc30] as const;
const STAMEN_DEEP = [0xe89420, 0xe08a1e] as const;
/** Sepals and stalks. */
const SEPAL = [0x5f7d2c, 0x6d8a30, 0x56742a] as const;
const STALK = POND.stalk;

/** Cell of the flowers and buds: a quarter texel. */
export const BLOOM_CELL = TEXEL / 4;
/** Pad plates: half a texel thick (chunky, as the sheet draws them), sunk an eighth of a texel into the water. */
export const PAD_THICK = TEXEL / 2;
export const PAD_SINK = TEXEL / 8;

// ── Pads ─────────────────────────────────────────────────────────────────────

/**
 * A water-lily pad in leaf units (1 across): round, the rim finely toothed,
 * the V-notch (half-angle `notch` radians at the rim, 0 for none) on the +v
 * side — the leaf's stem end, so a leaf laid with yaw ψ has its notch towards
 * (sin ψ, cos ψ). The midrib is a dot: the dark spot where the stalk meets the pad.
 */
export function padShape(notch: number, phase: number, o: { teeth?: number; oval?: number } = {}): LeafShape {
  const teeth = o.teeth ?? 0.025;
  const oval = o.oval ?? 1;
  return {
    width: 1,
    blade: (u, v) => {
      const a = Math.atan2(u, v);
      const r = Math.hypot(u, v / oval);
      if (r > 0.5 * (1 - teeth * (0.5 + 0.5 * Math.cos(a * 26 + phase)))) return false;
      return !(notch > 0 && r > 0.02 && Math.abs(a) < notch * (0.5 + r));
    },
    facet: () => null,
    midrib: [0, -0.012, 0, 0.012],
  };
}

export interface PadOptions {
  /** Diameter (m). */
  size: number;
  /** Direction the notch points (radians in the x–z plane from +x), e.g. towards the plant's crown. */
  towards: number;
  color: number;
  seed: number;
  /** Half-angle of the notch at the rim (default 0.2). */
  notch?: number;
  /** Yellowing blotches (0‥1) and nibbled rim (bites). */
  yellow?: number;
  bites?: number;
  /** Steepest it may ride up on pads under it (default 0.12 rad). */
  tilt?: number;
}

/** Float one pad on a bed laid at the water line (see {@link padBed}); false if it didn't fit. */
export function floatPad(bed: LeafBed, x: number, z: number, o: PadOptions): boolean {
  const r = rng(o.seed);
  const shape = padShape(o.notch ?? 0.2, r() * Math.PI * 2, { oval: r.range(1, 1.08) });
  // Notch towards (cos a, sin a): the leaf's +v runs along (sin ψ, cos ψ).
  const yaw = Math.atan2(Math.cos(o.towards), Math.sin(o.towards));
  const damage = o.bites ? { bites: o.bites, seed: r.int(0, 9999) } : undefined;
  return bed.drop({ shape, size: o.size, thick: PAD_THICK, color: o.color, surf: leafSurf({ yellow: o.yellow ?? 0 }), damage, cell: LEAF_CELL }, x, z, yaw, o.tilt ?? 0.12);
}

/** A bed for floating pads over a water surface: its ground is the water line less {@link PAD_SINK}. */
export function padBed(s: WaterSurface): LeafBed {
  return new LeafBed({ x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2, w: s.x1 - s.x0, d: s.z1 - s.z0, ground: s.top - PAD_SINK });
}

// ── Flowers and buds ─────────────────────────────────────────────────────────

/** Set the cell of grid `g` that holds point (x, y, z) (metres). */
export function putAt(g: VoxelGrid, x: number, y: number, z: number, color: number): void {
  g.set(Math.floor((x - g.origin[0]) / g.cell[0]), Math.floor((y - g.origin[1]) / g.cell[1]), Math.floor((z - g.origin[2]) / g.cell[2]), color);
}

/** A petal (or sepal) in metres: from `base`, `len` long at azimuth `az` and elevation `el`, half-width `w`, its edges cupped up by `cup` of its width. */
export interface PetalSpec {
  base: [number, number, number];
  az: number;
  el: number;
  len: number;
  w: number;
  cup?: number;
  /** Colour at t (0 base … 1 tip). */
  color: (t: number) => number;
  /** Where the widest point is (0‥1, default 0.4) and how pointed the tip (default 0.8). */
  widest?: number;
  point?: number;
}

/** Rasterise a petal: a pointed blade, sampled at half-cell steps. */
export function petal(g: VoxelGrid, p: PetalSpec): void {
  const c = g.cell[0];
  const [ca, sa, ce, se] = [Math.cos(p.az), Math.sin(p.az), Math.cos(p.el), Math.sin(p.el)];
  const d = [ce * ca, se, ce * sa];
  const side = [-sa, 0, ca];
  // Normal of the blade, towards the flower's inside (up and in).
  const n = [-se * ca, ce, -se * sa];
  const cup = p.cup ?? 0.35;
  const pw = Math.log(0.5) / Math.log(p.widest ?? 0.4);
  const steps = Math.max(2, Math.ceil((p.len / c) * 2));
  for (let a = 0; a <= steps; a++) {
    const t = a / steps;
    const w = p.w * Math.pow(Math.sin(Math.PI * Math.pow(t, pw)), p.point ?? 0.8);
    const across = Math.max(0, Math.ceil((w / c) * 2));
    const col = p.color(t);
    for (let q = -across; q <= across; q++) {
      const s = across ? q / across : 0;
      const off = s * w;
      const lift = cup * s * s * w;
      putAt(g, p.base[0] + d[0] * t * p.len + side[0] * off + n[0] * lift, p.base[1] + d[1] * t * p.len + n[1] * lift, p.base[2] + d[2] * t * p.len + side[2] * off + n[2] * lift, col);
    }
  }
}

const tonePick = (list: readonly number[], r: Rng) => list[Math.floor(r() * list.length) % list.length];

/**
 * An open water lily of `diameter` metres with its base at (x, y, z): four
 * green sepals spread flat, eight outer petals, eight inner ones more upright
 * and six at the heart round the yellow stamens — the sheet's upright cup
 * from the side, a sixteen-pointed star from above.
 */
export function lilyFlower(g: VoxelGrid, x: number, y: number, z: number, o: { diameter: number; kind: LilyKind; seed: number }): void {
  const r = rng(o.seed);
  const R = o.diameter / 2;
  const c = g.cell[0];
  const tones = PETALS[o.kind];
  const a0 = r() * Math.PI * 2;
  const tint = (t: number, deep = false) =>
    t < 0.28 ? tonePick(tones.base, r) : t > 0.8 ? tonePick(deep ? tones.tip : tones.body, r) : tonePick(deep ? tones.body : tones.inner, r);
  // Sepals under everything; then the whorls outside in, each overwriting the one before where they meet.
  for (let q = 0; q < 4; q++)
    petal(g, { base: [x, y, z], az: a0 + (q * Math.PI) / 2 + Math.PI / 4, el: 0.12, len: R * 0.92, w: R * 0.26, cup: 0.2, color: () => tonePick(SEPAL, r) });
  const whorls: [number, number, number, number, number][] = [
    // count, elevation, length, half-width, twist
    [8, 0.34, R, R * 0.3, 0],
    [8, 0.72, R * 0.86, R * 0.28, Math.PI / 8],
    [6, 1.05, R * 0.6, R * 0.26, Math.PI / 12],
  ];
  whorls.forEach(([n, el, len, w, tw], wi) => {
    for (let q = 0; q < n; q++) {
      const az = a0 + tw + (q / n) * Math.PI * 2 + r.range(-0.12, 0.12);
      const lift = c * wi;
      petal(g, { base: [x + Math.cos(az) * R * 0.12, y + lift, z + Math.sin(az) * R * 0.12], az, el: el + r.range(-0.08, 0.08), len: len * r.range(0.92, 1.05), w, color: (t) => tint(t, wi === 0) });
    }
  });
  // The stamens: a ring of yellow rising round a deeper centre.
  const rs = R * 0.34;
  for (let i = -Math.ceil(rs / c); i <= Math.ceil(rs / c); i++)
    for (let k = -Math.ceil(rs / c); k <= Math.ceil(rs / c); k++) {
      const d = Math.hypot(i, k) * c;
      if (d > rs) continue;
      const h = d > rs * 0.45 ? 3 : 2;
      for (let j = 0; j < h; j++) putAt(g, x + i * c, y + (j + 0.5) * c, z + k * c, j === h - 1 && d > rs * 0.45 ? tonePick(STAMEN, r) : tonePick(STAMEN_DEEP, r));
    }
}

/**
 * A spindle of cells — a closed bud — `len` metres long and `width` across,
 * from (x, y, z) along `dir` (a unit vector): widest a third of the way up,
 * then a pointed tip. `color(t, a)` paints it by t (0 base … 1 tip) and the
 * angle round its axis.
 */
export function spindle(g: VoxelGrid, x: number, y: number, z: number, o: { len: number; width: number; dir: [number, number, number]; color: (t: number, a: number) => number }): void {
  const c = g.cell[0];
  const [dx, dy, dz] = o.dir;
  // Two axes across the spindle, for the angle round it.
  const ux = Math.abs(dy) > 0.9 ? [1, 0, 0] : [-dz, 0, dx];
  const ul = Math.hypot(ux[0], ux[1], ux[2]);
  const u = [ux[0] / ul, ux[1] / ul, ux[2] / ul];
  const v = [dy * u[2] - dz * u[1], dz * u[0] - dx * u[2], dx * u[1] - dy * u[0]];
  const W = o.width / 2;
  const reach = o.len + W;
  const [i0, i1] = [Math.floor((x - reach - g.origin[0]) / c), Math.ceil((x + reach - g.origin[0]) / c)];
  const [j0, j1] = [Math.floor((y - reach - g.origin[1]) / c), Math.ceil((y + reach - g.origin[1]) / c)];
  const [k0, k1] = [Math.floor((z - reach - g.origin[2]) / c), Math.ceil((z + reach - g.origin[2]) / c)];
  for (let i = i0; i <= i1; i++)
    for (let j = j0; j <= j1; j++)
      for (let k = k0; k <= k1; k++) {
        const [px, py, pz] = [g.origin[0] + (i + 0.5) * c - x, g.origin[1] + (j + 0.5) * c - y, g.origin[2] + (k + 0.5) * c - z];
        const along = px * dx + py * dy + pz * dz;
        const t = along / o.len;
        if (t < 0 || t > 1) continue;
        const [qx, qy, qz] = [px - dx * along, py - dy * along, pz - dz * along];
        const rad = W * (t < 0.35 ? 0.72 + (0.28 * t) / 0.35 : Math.pow((1 - t) / 0.65, 0.8));
        if (Math.hypot(qx, qy, qz) > rad + c * 0.3) continue;
        g.set(i, j, k, o.color(t, Math.atan2(qx * v[0] + qy * v[1] + qz * v[2], qx * u[0] + qy * u[1] + qz * u[2])));
      }
}

/**
 * A closed lily bud `len` metres long, base at (x, y, z): green sepals
 * wrapped round it, the petals' colour showing between them and at the
 * pointed tip. Upright on its stalk, or `lying` on the pads (its azimuth,
 * tip a little up) — the sheet's small orange-red buds (`kind` 'red').
 */
export function lilyBud(g: VoxelGrid, x: number, y: number, z: number, o: { len: number; kind: LilyKind | 'red'; seed: number; lying?: number }): void {
  const r = rng(o.seed);
  const tip = o.kind === 'red' ? [0xd4683c, 0xc85e36, 0xe07a44] : o.kind === 'pink' ? PETALS.pink.tip : PETALS.white.body;
  const body = o.kind === 'red' ? [0x9a4e2e, 0xa65a34] : SEPAL;
  const turn = r() * Math.PI;
  const dir: [number, number, number] = o.lying === undefined ? [0, 1, 0] : [Math.cos(o.lying) * 0.95, 0.3, Math.sin(o.lying) * 0.95];
  const width = o.len * 0.46;
  spindle(g, x, y + (o.lying === undefined ? 0 : width * 0.4), z, {
    len: o.len,
    width,
    dir,
    color: (t, a) => {
      // Four sepals: the petals show in the gaps between them, and at the tip.
      const gap = Math.abs(Math.sin(2 * (a + turn))) < 0.35;
      return tonePick(t > 0.62 || (t > 0.3 && gap) ? tip : body, r);
    },
  });
}

// ── A field of lilies ────────────────────────────────────────────────────────

export interface LilyFieldOptions extends FloraArea {
  seed: number;
  /** Flower colour (default pink); 'mixed' picks per plant. */
  kind?: LilyKind | 'mixed';
  /** Colonies (default: one per 4 m² of water, at least one). */
  groups?: number;
  /** Plants per colony [min, max] (default [1, 3]). */
  plants?: [number, number];
  /** Pads per plant [min, max] (default [6, 11]). */
  pads?: [number, number];
  /** Pad diameters (m, default [0.2, 0.4]). */
  padSize?: [number, number];
  /** Open flowers per plant [min, max] (default [1, 2]). */
  flowers?: [number, number];
  /** Buds per plant [min, max] (default [0, 2]). */
  buds?: [number, number];
}

/**
 * Colonies of water lilies over a water surface: each of one to three plants,
 * a rosette of pads round its crown (notches in, a young bronze pad and an old
 * yellowing one among them), one or two flowers standing over the crown on
 * their stalks and a bud or two. Returns the colonies' footprints.
 */
export function lilyField(p: PieceBuilder, s: WaterSurface, o: LilyFieldOptions): FloraSpot[] {
  const r = rng(o.seed * 37 + 11);
  const src = here();
  const bed = padBed(s);
  const g = p.voxels.grid({ cell: BLOOM_CELL, origin: [Math.floor(s.x0 / TEXEL) * TEXEL, s.top, Math.floor(s.z0 / TEXEL) * TEXEL], mat: 'petal', jitter: 0.04, ao: 0.2, seed: o.seed });
  const [p0, p1] = o.pads ?? [6, 11];
  const [s0, s1] = o.padSize ?? [0.2, 0.4];
  const groups = o.groups ?? Math.max(1, Math.round(((s.x1 - s.x0) * (s.z1 - s.z0)) / 4));
  const spots: FloraSpot[] = [];
  const blooms: { x: number; z: number; h: number; kind: LilyKind; d: number; seed: number }[] = [];
  const buds: { x: number; z: number; len: number; lift: number; kind: LilyKind | 'red'; lying?: number; seed: number }[] = [];
  for (let gi = 0; gi < groups; gi++) {
    const nPlants = r.int(...(o.plants ?? [1, 3]));
    const R = 0.42 + 0.22 * nPlants;
    const at = findSpot(r, s, R, spots, { ...o, margin: 0.02 });
    if (!at) continue;
    spots.push({ x: at[0], z: at[1], r: R });
    for (let pi = 0; pi < nPlants; pi++) {
      const a = r() * Math.PI * 2;
      const d = pi === 0 && nPlants === 1 ? 0 : (R - 0.42) * r.range(0.6, 1);
      const [cx, cz] = [at[0] + Math.cos(a) * d, at[1] + Math.sin(a) * d];
      const kind: LilyKind = o.kind === 'mixed' ? (r.chance(0.5) ? 'pink' : 'white') : (o.kind ?? 'pink');
      const n = r.int(p0, p1);
      const a0 = r() * Math.PI * 2;
      // Pads round the crown, big ones first (so the small young ones settle over them).
      const pads = Array.from({ length: n }, (_, q) => ({ q, size: q === 0 ? r.range(s0 * 0.55, s0 * 0.8) : r.range(s0, s1) })).sort((u, v) => v.size - u.size);
      for (const { q, size } of pads) {
        const young = q === 0;
        const old = q === 1 && n > 6;
        const az = a0 + q * 2.39996 + r.range(-0.3, 0.3);
        const dist = young ? r.range(0.03, 0.12) : size / 2 + r.range(-0.04, 0.2);
        const [x, z] = [cx + Math.cos(az) * dist, cz + Math.sin(az) * dist];
        const color = young ? tonePick(LILY_YOUNG, r) : old ? tonePick(LILY_OLD, r) : tonePick(LILY_PAD, r);
        floatPad(bed, x, z, {
          size,
          towards: Math.atan2(cz - z, cx - x) + r.range(-0.5, 0.5),
          color,
          seed: o.seed * 101 + gi * 17 + pi * 7 + q,
          yellow: old ? 0.6 : r.chance(0.3) ? r.range(0.15, 0.35) : 0,
          bites: old ? r.int(3, 5) : r.chance(0.2) ? r.int(1, 2) : 0,
        });
      }
      const nf = r.int(...(o.flowers ?? [1, 2]));
      for (let f = 0; f < nf; f++) {
        const fa = r() * Math.PI * 2;
        const fd = f === 0 ? r.range(0, 0.05) : r.range(0.08, 0.16);
        blooms.push({ x: cx + Math.cos(fa) * fd, z: cz + Math.sin(fa) * fd, h: r.range(0.05, 0.16), kind, d: r.range(0.13, 0.17), seed: o.seed * 53 + gi * 11 + pi * 5 + f });
      }
      const nb = r.int(...(o.buds ?? [0, 2]));
      for (let b = 0; b < nb; b++) {
        const ba = r() * Math.PI * 2;
        const bd = r.range(0.08, 0.2);
        // Some buds stand on stalks, some lie on the pads (the sheet's orange-red ones).
        const lying = r.chance(0.45);
        buds.push({
          x: cx + Math.cos(ba) * bd,
          z: cz + Math.sin(ba) * bd,
          len: lying ? r.range(0.05, 0.065) : r.range(0.06, 0.08),
          lift: lying ? 0 : r.range(0.03, 0.1),
          kind: lying ? 'red' : kind,
          lying: lying ? ba : undefined,
          seed: o.seed * 61 + gi * 13 + pi * 3 + b,
        });
      }
    }
  }
  bed.commit(p);
  const snapUp = (y: number) => s.top + Math.ceil((y - s.top) / BLOOM_CELL - 1e-6) * BLOOM_CELL;
  for (const f of blooms) {
    const y = snapUp(Math.max(bed.top(f.x, f.z), s.top) + f.h);
    const r2 = rng(f.seed);
    const [tx, tz] = stalk(p.voxels, { x: f.x, z: f.z, y0: s.top - PAD_SINK, y1: y + BLOOM_CELL, w: BLOOM_CELL, color: tonePick(STALK, r2), bend: r2.chance(0.6) ? { at: r2.range(0.3, 0.7), dx: r2.int(-1, 1), dz: r2.int(-1, 1) } : undefined, src });
    lilyFlower(g, tx, y, tz, { diameter: f.d, kind: f.kind, seed: f.seed });
  }
  for (const b of buds) {
    const y = snapUp(Math.max(bed.top(b.x, b.z), s.top) + b.lift);
    if (b.lift > 0) stalk(p.voxels, { x: b.x, z: b.z, y0: s.top - PAD_SINK, y1: y + BLOOM_CELL, w: BLOOM_CELL, color: tonePick(STALK, rng(b.seed)), src });
    lilyBud(g, b.x, y, b.z, { len: b.len, kind: b.kind, lying: b.lying, seed: b.seed });
  }
  g.commit();
  return spots;
}
