import { Color, Euler, Quaternion, Vector3 } from 'three';
import type { SourceTrace } from '../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../voxel/materials';
import { hash3 } from '../../voxel/random';
import type { Surf, VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { PieceBuilder } from '../PieceBuilder';
import { here, rng, TEXEL, type Rng } from '../shapes';

/**
 * Fallen leaves — the §18.2 ⑥ litter tile, the §20 ⑨ loose leaves, and leaf
 * litter for any diorama.
 *
 * The sheets draw a fallen leaf as a flat pixel-art plate one cell thick — a
 * stepped star on the tile, lobed oak-like blades on §20 — with darker veins,
 * each lobe painted with a lit and a shaded facet. Here a leaf is an outline
 * ({@link LEAF_SHAPES}) rasterised at any size and angle onto a lattice of
 * {@link LEAF_CELL} cells that stays aligned with the world axes, so its pixel
 * steps line up with the texel grid like the sheets', and the `leaves` family
 * paints one continuous texel pattern over it (a rotated box would get its own).
 * Cells merge into as few boxes as the outline allows, seamlessly.
 *
 *  - {@link placeLeaf}: one leaf lying on a surface (the ground, a wall, a tile side).
 *  - {@link LeafBed}: a height map of the ground. Leaves dropped on it one by one
 *    rest on whatever lies below — flat on bare ground, tilted where they overlap,
 *    heaped over a pile's core, folded over the edge of a block top — and
 *    `commit()` lays them with ambient occlusion, leaving out cells buried in a heap.
 *  - {@link scatterLeaves}, {@link leafCluster}, {@link leafPile}: litter over an
 *    area, a rosette round a point (§20), a heap.
 *  - {@link randomLeaf}, {@link LITTER_TONES}, {@link LITTER_MIX}: seeded looks and colours.
 */

/** Lattice cell of a leaf: a third of a texel (≈ 2 cm), so a 0.2 m leaf is ten cells across. */
export const LEAF_CELL = TEXEL / 3;
/** Plate thickness: a quarter texel (the sheets' leaves are chunky; real ones are paper-thin). */
export const LEAF_THICK = TEXEL / 4;

// ── Shapes ────────────────────────────────────────────────────────────────────
/** A segment [u0, v0, u1, v1] in leaf units. */
export type Seg = readonly [number, number, number, number];

/**
 * A leaf outline in leaf units (length 1): u across, v along, the tip at
 * v = −0.5 and the stem end at +0.5. Laid with yaw 0 the tip points to −z (up
 * on a top view).
 */
export interface LeafShape {
  /** Width over length (for bounds). */
  readonly width: number;
  /** Is (u, v) on the blade? */
  blade(u: number, v: number): boolean;
  /**
   * Downhill direction (u, v) of the facet at a point, or null on a ridge: the
   * sheets paint each lobe as two facets either side of its vein, one lit, one shaded.
   */
  facet(u: number, v: number): readonly [number, number] | null;
  /** The midrib, painted darker on big leaves. */
  readonly midrib?: Seg;
  /** The stalk past the blade's base. */
  readonly stem?: Seg;
}

/**
 * A star leaf: lobes [angle from the tip (deg), reach, half-width (deg)] round a
 * centre at v = cv, full near the centre and pointed at the tip; `sinus` is the
 * radius of the notches between them. Its size is the star's diameter.
 */
function starLeaf(lobes: readonly (readonly [number, number, number])[], sinus: number, cv = 0): LeafShape {
  const all = lobes.flatMap(([a, r, w]) => (a === 0 ? [[a, r, w]] : [[a, r, w], [-a, r, w]]));
  const rad = all.map(([a, r, w]) => [(a * Math.PI) / 180, r, (w * Math.PI) / 180]);
  // Outline radius and facet per angle round the centre, tabulated once.
  const N = 1024;
  const reach = new Float32Array(N);
  const fu = new Float32Array(N);
  const fv = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const t = (n / N) * Math.PI * 2 - Math.PI;
    let r = sinus;
    let d = Infinity;
    let a0 = 0;
    for (const [a, R, w] of rad) {
      const dd = Math.atan2(Math.sin(t - a), Math.cos(t - a));
      if (Math.abs(dd) < w) r = Math.max(r, sinus + (R - sinus) * (1 - Math.pow(Math.abs(dd) / w, 1.2)));
      if (Math.abs(dd) < Math.abs(d)) [d, a0] = [dd, a];
    }
    reach[n] = r;
    // Each lobe is two wedges either side of its vein (a pinwheel round the centre).
    if (Math.abs(d) >= 0.06) [fu[n], fv[n]] = [Math.sign(d) * Math.cos(a0), Math.sign(d) * Math.sin(a0)];
  }
  const at = (u: number, v: number) => Math.min(N - 1, Math.floor(((Math.atan2(u, cv - v) + Math.PI) / (Math.PI * 2)) * N));
  return {
    width: 2 * Math.max(...rad.map(([a, r]) => Math.abs(Math.sin(a)) * r)),
    blade: (u, v) => Math.hypot(u, v - cv) <= reach[at(u, v)],
    facet: (u, v) => {
      const n = at(u, v);
      return Math.hypot(u, v - cv) < 0.05 || (!fu[n] && !fv[n]) ? null : [fu[n], fv[n]];
    },
    midrib: [0, cv - 0.4, 0, cv + sinus],
    stem: [0, cv + sinus * 0.6, 0, cv + sinus + 0.16],
  };
}

/** A long blade: its half-width along the length (t = 0 at the tip, 1 at the base), folded along the midrib. */
function longLeaf(width: number, half: (t: number) => number): LeafShape {
  return {
    width,
    blade: (u, v) => v >= -0.5 && v <= 0.42 && Math.abs(u) <= half((v + 0.5) / 0.92),
    facet: (u) => (Math.abs(u) < 0.02 ? null : [Math.sign(u), 0]),
    midrib: [0, -0.46, 0, 0.42],
    stem: [0, 0.3, 0, 0.56],
  };
}

export const LEAF_SHAPES = {
  /** §18.2 big leaf: a seven-pointed maple star, the two points by the stem smaller. */
  maple: starLeaf(
    [
      [0, 0.5, 26],
      [50, 0.48, 25],
      [98, 0.46, 24],
      [145, 0.36, 22],
    ],
    0.26,
    0.03,
  ),
  /** §18.2 middle leaf: a five-pointed star. */
  star: starLeaf(
    [
      [0, 0.5, 32],
      [72, 0.49, 31],
      [144, 0.46, 30],
    ],
    0.26,
  ),
  /** §18.2 small leaf: three broad points on a stem. */
  trident: starLeaf(
    [
      [0, 0.5, 40],
      [80, 0.46, 38],
    ],
    0.26,
    0.06,
  ),
  /** §20 leaf: an oak-like blade with four rounded lobes a side, widest above the middle. */
  oak: longLeaf(0.68, (t) => 0.34 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.06)), 0.5) * (0.7 + 0.3 * Math.cos(Math.PI * 2 * (3.6 * t - 0.1)))),
  /** Tropical entire leaf (fig, dipterocarp): a pointed oval with a drip tip. */
  oval: longLeaf(0.46, (t) => 0.23 * Math.pow(Math.sin(Math.PI * t), 0.75) * Math.min(1, 0.35 + t * 3)),
  /** A scrap of leaf: a small plus, like the sheet's smallest leaves. */
  bit: { width: 1, blade: (u: number, v: number) => Math.hypot(u, v) <= 0.5 && Math.min(Math.abs(u), Math.abs(v)) <= 0.19, facet: () => null },
} as const satisfies Record<string, LeafShape>;

// ── Colours ───────────────────────────────────────────────────────────────────
/**
 * Albedo of leaf-litter colours, sampled off the sheets' lit leaf tops. A flat
 * top takes the studio's key light head-on and renders close to its albedo
 * (brighter than the average of top and front that `fromSheet` corrects for),
 * so these stay near the sheet colours.
 */
export const LITTER_TONES = {
  /** Bright orange, the commonest dry leaf on both sheets. */
  orange: [0xec943c, 0xdd8d43, 0xe8984f, 0xd67e3a],
  /** Straw yellow and gold. */
  yellow: [0xe8b457, 0xf2c860, 0xf6d470, 0xe6a84e],
  /** Salmon to rust red. */
  red: [0xe0906a, 0xca7a50, 0xb96a49],
  /** Dead brown. */
  brown: [0x956f54, 0xa07650, 0x8a6448],
  /** Olive-yellow, half-dried. */
  olive: [0xaf8d52, 0xa58050, 0xbc9a58],
  /** Fresh-fallen yellow-green (§20's green cluster). */
  green: [0x9a8d39, 0x8a8529, 0xa29a40],
  /** Rain-soaked and rotting: dull dark browns. */
  wet: [0x7a5a44, 0x6c5040, 0x86644a, 0x94704e],
  /** Stems and a heap's inside: near-black brown. */
  dark: [0x3e2a1e, 0x4a3222, 0x352519],
} as const;

/** Blends for scatters (a tone listed twice is picked twice as often). */
export const LITTER_MIX = {
  /** §18.2 dry litter: orange and yellow, some salmon, a little olive. */
  dry: [...LITTER_TONES.orange, ...LITTER_TONES.orange, ...LITTER_TONES.orange, ...LITTER_TONES.yellow, ...LITTER_TONES.yellow, ...LITTER_TONES.red, LITTER_TONES.olive[2]],
  /** §18.2 wet litter: dark browns with a few dull orange leaves. */
  wet: [...LITTER_TONES.wet, ...LITTER_TONES.wet, ...LITTER_TONES.brown, 0xb07040, 0xa07848],
  /** §20 loose leaves: browns and oranges, some rust and olive. */
  fallen: [...LITTER_TONES.brown, ...LITTER_TONES.brown, ...LITTER_TONES.orange, ...LITTER_TONES.red, ...LITTER_TONES.olive],
  /** Red autumn: rust and orange. */
  autumn: [...LITTER_TONES.red, ...LITTER_TONES.red, ...LITTER_TONES.orange, 0x8b4a30],
  /** Freshly fallen: yellow-green with a little yellow. */
  fresh: [...LITTER_TONES.green, ...LITTER_TONES.green, ...LITTER_TONES.olive, 0xb9a35a],
} as const;

const _ca = new Color();
const _cb = new Color();

/** Blend two colours (sRGB hex) in linear light. */
export function mixColor(a: number, b: number, t: number): number {
  return _ca.setHex(a).lerp(_cb.setHex(b), t).getHex();
}

/** Scale a colour's channels in linear light (clamped); one factor scales all three. */
export function scaleColor(hex: number, r: number, g = r, b = g): number {
  _ca.setHex(hex);
  return _ca.setRGB(Math.min(1, _ca.r * r), Math.min(1, _ca.g * g), Math.min(1, _ca.b * b)).getHex();
}

/** Veins: the blade darker and browner. */
const veinOf = (c: number) => scaleColor(c, 0.6, 0.52, 0.45);
/** Stem: dark brown. */
const stemOf = (c: number) => mixColor(scaleColor(c, 0.5, 0.44, 0.38), LITTER_TONES.dark[0], 0.4);

// ── One leaf ──────────────────────────────────────────────────────────────────
/** What a leaf looks like (see {@link randomLeaf} for a seeded one). */
export interface LeafLook {
  shape: LeafShape;
  /** Length tip to base (metres); 0.08–0.2 m for real leaves. */
  size: number;
  /** Plate thickness (default {@link LEAF_THICK}). */
  thick?: number;
  /** Blade colour (albedo). */
  color: number;
  /** Vein colour (default: the blade darker and browner). */
  vein?: number;
  /** Stem colour (default: dark brown). */
  stem?: number;
  /** Brightness of the whole leaf. */
  shade?: number;
  /** `leaves` pattern amounts (yellowing blotches…). */
  surf?: Surf;
  /** Damage: a torn edge along a line (angle, share kept) and bites out of the outline. */
  damage?: { cut?: readonly [number, number]; bites?: number; seed: number };
  /** Material family (default `leaves`). */
  mat?: VoxelMaterialKey;
  /** Lattice cell (default {@link LEAF_CELL}); finer for leaves with fine lobes. */
  cell?: number;
}

/** Rasterised leaf: cells (a, b) of the lattice in its plane, a0 ≤ a < a0 + na. */
interface Raster {
  /** Lattice cell (metres). */
  cell: number;
  a0: number;
  b0: number;
  na: number;
  nb: number;
  /** 0 empty, 1 blade, 2 vein, 3 stem (index (a − a0) · nb + b − b0). */
  code: Uint8Array;
  /** Facet brightness per cell. */
  facet: Float32Array;
}

/** The studio's key light (the sheets' too): from the upper left, in front. */
const KEY_LIGHT = new Vector3(-2, 6.4, 3).normalize();
/** Slope of a leaf's facets either side of a vein (radians), for their painted light. */
const FACET = 0.3;

/** Distance from (u, v) to a segment. */
function segDist(u: number, v: number, s: Seg): number {
  const [u0, v0, u1, v1] = s;
  const du = u1 - u0;
  const dv = v1 - v0;
  const t = Math.max(0, Math.min(1, ((u - u0) * du + (v - v0) * dv) / (du * du + dv * dv || 1)));
  return Math.hypot(u - u0 - t * du, v - v0 - t * dv);
}

/**
 * Rasterise a leaf centred at (pc, qc) (metres along its plane's axes P, Q),
 * turned by `yaw` in the plane. `light` is the key light in (P, N, Q) terms,
 * for the facets: the half of a lobe facing it is brighter.
 */
function rasterise(look: LeafLook, pc: number, qc: number, yaw: number, light: Vector3): Raster {
  const { shape, size } = look;
  const cell = look.cell ?? LEAF_CELL;
  const R = size * (0.5 * Math.max(1, shape.width) + 0.12) + cell;
  const a0 = Math.floor((pc - R) / cell);
  const b0 = Math.floor((qc - R) / cell);
  const na = Math.ceil((pc + R) / cell) - a0;
  const nb = Math.ceil((qc + R) / cell) - b0;
  const code = new Uint8Array(na * nb);
  const facet = new Float32Array(na * nb).fill(1);
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const px = cell / size;
  // The midrib shows on leaves at least nine cells long.
  const midrib = size / cell >= 9 ? shape.midrib : undefined;
  const t = Math.tan(FACET);
  const cut = look.damage?.cut;
  for (let a = 0; a < na; a++)
    for (let b = 0; b < nb; b++) {
      const dp = (a0 + a + 0.5) * cell - pc;
      const dq = (b0 + b + 0.5) * cell - qc;
      const u = (dp * cs - dq * sn) / size;
      const v = (dp * sn + dq * cs) / size;
      if (cut && u * Math.cos(cut[0]) + v * Math.sin(cut[0]) > cut[1] - 0.5) continue;
      const i = a * nb + b;
      if (!shape.blade(u, v)) {
        if (shape.stem && segDist(u - px * 0.01, v, shape.stem) < px * 0.5) code[i] = 3;
        continue;
      }
      // One cell wide: a centre exactly between two columns goes to the right one.
      code[i] = midrib && segDist(u - px * 0.01, v, midrib) < px * 0.5 ? 2 : 1;
      const f = light.y > 0.15 ? shape.facet(u, v) : null;
      if (!f) continue;
      // The facet's downhill direction back in the plane (P, Q), and its light: a few clean steps.
      const fp = f[0] * cs + f[1] * sn;
      const fq = -f[0] * sn + f[1] * cs;
      const lit = (light.y + t * (fp * light.x + fq * light.z)) / Math.hypot(1, t) / light.y;
      facet[i] = Math.min(1.15, Math.max(0.8, Math.round(lit * 10) / 10));
    }
  const bites = look.damage?.bites ?? 0;
  if (bites > 0) {
    const seed = look.damage!.seed;
    const edge: number[] = [];
    for (let i = 0; i < code.length; i++) {
      if (code[i] !== 1) continue;
      const a = Math.floor(i / nb);
      const b = i % nb;
      if (a === 0 || b === 0 || a === na - 1 || b === nb - 1 || !code[i - nb] || !code[i + nb] || !code[i - 1] || !code[i + 1]) edge.push(i);
    }
    for (let k = 0; k < bites && edge.length; k++) {
      const i = edge[Math.floor(hash3(k, seed, 3) * edge.length)];
      code[i] = 0;
      const j = i + (hash3(k, seed, 5) < 0.5 ? nb : 1);
      if (j < code.length && code[j] === 1) code[j] = 0;
    }
  }
  return { cell, a0, b0, na, nb, code, facet };
}

/**
 * A lattice plane in world space: world = o + P·p + Q·q + N·n for plane
 * coordinates (p, q) (metres) and n across the leaf's thickness. Axis-aligned
 * frames lay plain boxes; a tilted one (`rot`) lays boxes turned with it.
 */
interface Frame {
  o: Vector3;
  P: Vector3;
  Q: Vector3;
  N: Vector3;
  rot?: Quaternion;
}

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const neg = (v: Vector3) => v.clone().negate();
const frame = (o: Vector3, P: Vector3, Q: Vector3, N: Vector3, rot?: Quaternion): Frame => ({ o, P, Q, N, rot });
/** Exposed-face bit of a signed world axis (see VoxelBox.open). */
const bitOf = (d: Vector3) => (d.x > 0.5 ? 1 : d.x < -0.5 ? 2 : d.y > 0.5 ? 4 : d.y < -0.5 ? 8 : d.z > 0.5 ? 16 : 32);

/**
 * Surfaces a leaf can lie on: 'top' (the ground, facing up) or a wall facing
 * ±x / ±z, e.g. the side of a tile. On a wall the lattice's second axis runs
 * down it, so yaw 0 puts the tip up.
 */
export type LeafPlane = 'top' | '+x' | '-x' | '+z' | '-z';

/** The lattice plane of a surface, its normal out of it, at offset n0 along the normal. */
function surfaceFrame(plane: LeafPlane, n0: number): Frame {
  const down = neg(Y);
  const f =
    plane === '+z' ? frame(new Vector3(), X, down, Z) : plane === '-z' ? frame(new Vector3(), neg(X), down, neg(Z)) : plane === '+x' ? frame(new Vector3(), neg(Z), down, X) : plane === '-x' ? frame(new Vector3(), Z, down, neg(X)) : frame(new Vector3(), X, Z, Y);
  f.o.addScaledVector(f.N, n0);
  return f;
}

interface LayOptions {
  /** Frame per body (0 = the leaf's own plane, others: parts folded over an edge). */
  frames: Frame[];
  /** Body of each cell (index into frames), 255 = left out. */
  body?: Uint8Array;
  /** Brightness factor per cell (ambient occlusion). */
  shade?: Float32Array;
  src?: SourceTrace;
}

interface Rect {
  b0: number;
  b1: number;
  a0: number;
  a1: number;
  key: number;
  /** Neighbour status per side: 0 empty, 1 laid by another body, 2 same body. */
  lo: number;
  hi: number;
  west: number;
  east: number;
}

/**
 * Lay a rasterised leaf as merged boxes. Cells join into runs along a only
 * while their neighbours across the run match, and runs stack into rectangles
 * only with matching ends, so every box side is either outline (bevelled, lit
 * rim) or merged into the same plate (no bevel): the leaf reads as one piece
 * with a stepped outline and painted facets. Returns the box count.
 */
function layRaster(b: VoxelBuilder, look: LeafLook, ras: Raster, o: LayOptions): number {
  const { na, nb, code, cell } = ras;
  const thick = look.thick ?? LEAF_THICK;
  const colors = [0, look.color, look.vein ?? veinOf(look.color), look.stem ?? stemOf(look.color)];
  // Cells join when part, tone and body match: key = part + 4 · (tone step + 128 · body), 0 = none.
  const keys = new Int32Array(na * nb);
  const tone = new Float32Array(na * nb);
  const bodyOf = (i: number) => o.body?.[i] ?? 0;
  for (let i = 0; i < code.length; i++) {
    if (!code[i] || bodyOf(i) === 255) continue;
    const t = Math.round((look.shade ?? 1) * ras.facet[i] * (o.shade?.[i] ?? 1) * 25);
    tone[i] = t / 25;
    keys[i] = code[i] + 4 * (t + 128 * bodyOf(i));
  }
  const status = (i: number, a: number, bb: number) => {
    if (a < 0 || bb < 0 || a >= na || bb >= nb) return 0;
    const j = a * nb + bb;
    return !keys[j] ? 0 : bodyOf(j) === bodyOf(i) ? 2 : 1;
  };
  const rects: Rect[] = [];
  let above = new Map<string, Rect>();
  for (let bb = 0; bb < nb; bb++) {
    const row = new Map<string, Rect>();
    for (let a = 0; a < na; ) {
      const i = a * nb + bb;
      if (!keys[i]) {
        a++;
        continue;
      }
      const lo = status(i, a, bb - 1);
      const hi = status(i, a, bb + 1);
      let a1 = a;
      while (a1 + 1 < na) {
        const j = (a1 + 1) * nb + bb;
        if (keys[j] !== keys[i] || status(j, a1 + 1, bb - 1) !== lo || status(j, a1 + 1, bb + 1) !== hi) break;
        a1++;
      }
      const run: Rect = { b0: bb, b1: bb, a0: a, a1, key: keys[i], lo, hi, west: status(i, a - 1, bb), east: status(a1 * nb + bb, a1 + 1, bb) };
      const sig = `${a}|${a1}|${run.key}|${run.west}|${run.east}`;
      const up = above.get(sig);
      if (up && up.hi === 2 && lo === 2) {
        up.b1 = bb;
        up.hi = hi;
        row.set(sig, up);
      } else {
        rects.push(run);
        row.set(sig, run);
      }
      a = a1 + 1;
    }
    above = row;
  }

  const c = new Vector3();
  const e = new Euler();
  for (const r of rects) {
    const i = r.a0 * nb + r.b0;
    const f = o.frames[bodyOf(i)];
    const lp = (r.a1 - r.a0 + 1) * cell;
    const lq = (r.b1 - r.b0 + 1) * cell;
    c.copy(f.o)
      .addScaledVector(f.P, (ras.a0 + (r.a0 + r.a1 + 1) / 2) * cell)
      .addScaledVector(f.Q, (ras.b0 + (r.b0 + r.b1 + 1) / 2) * cell)
      .addScaledVector(f.N, thick / 2);
    // Sides on the same plate merge (no bevel). Only the face up counts as open, so the
    // outline gets no light rim: the sheets' leaves have dark edges.
    const dirs = f.rot ? [1, 2, 16, 32, 4] : [bitOf(f.P), bitOf(neg(f.P)), bitOf(f.Q), bitOf(neg(f.Q)), bitOf(f.N)];
    const open = dirs[4];
    let merge = 0;
    [r.east, r.west, r.hi, r.lo].forEach((st, k) => {
      if (st === 2) merge |= dirs[k];
    });
    const style = { shade: tone[i], open, merge, surf: look.surf, src: o.src };
    const mat = look.mat ?? 'leaves';
    if (f.rot) {
      e.setFromQuaternion(f.rot, 'XYZ');
      b.box(c.x, c.y, c.z, lp, thick, lq, colors[code[i]], mat, { ...style, rx: e.x, ry: e.y, rz: e.z });
    } else {
      const s = new Vector3().addScaledVector(f.P, lp).addScaledVector(f.Q, lq).addScaledVector(f.N, thick);
      b.box(c.x, c.y, c.z, Math.abs(s.x), Math.abs(s.y), Math.abs(s.z), colors[code[i]], mat, style);
    }
  }
  return rects.length;
}

/** Key light in a frame's (P, N, Q) terms, for the facets. */
const lightIn = (f: Frame) => new Vector3(KEY_LIGHT.dot(f.P), KEY_LIGHT.dot(f.N), KEY_LIGHT.dot(f.Q));

const builderOf = (t: PieceBuilder | VoxelBuilder): VoxelBuilder => ('voxels' in t ? t.voxels : t);

/**
 * One leaf lying on a surface: its centre at world point (x, y, z) on a plane
 * facing up ('top', the default) or out of a wall (±x, ±z), turned by `yaw` in
 * that plane (0: tip to −z on the ground, up on a wall), sunk `embed` metres
 * into the surface (e.g. half its thickness, pressed into soil). `keep` drops
 * cells whose centre falls outside something (a face's edges). Returns the box count.
 */
export function placeLeaf(
  target: PieceBuilder | VoxelBuilder,
  look: LeafLook,
  at: { x: number; y: number; z: number; plane?: LeafPlane; yaw?: number; embed?: number },
  keep?: (x: number, y: number, z: number) => boolean,
): number {
  const plane = at.plane ?? 'top';
  const w = new Vector3(at.x, at.y, at.z);
  const f = surfaceFrame(plane, w.dot(surfaceFrame(plane, 0).N) - (at.embed ?? 0));
  const ras = rasterise(look, w.dot(f.P), w.dot(f.Q), at.yaw ?? 0, lightIn(f));
  let body: Uint8Array | undefined;
  if (keep) {
    body = new Uint8Array(ras.na * ras.nb);
    const c = new Vector3();
    for (let a = 0; a < ras.na; a++)
      for (let bb = 0; bb < ras.nb; bb++) {
        c.copy(f.o)
          .addScaledVector(f.P, (ras.a0 + a + 0.5) * ras.cell)
          .addScaledVector(f.Q, (ras.b0 + bb + 0.5) * ras.cell);
        if (!keep(c.x, c.y, c.z)) body[a * ras.nb + bb] = 255;
      }
  }
  return layRaster(builderOf(target), look, ras, { frames: [f], body, src: here() });
}

// ── Random leaves ─────────────────────────────────────────────────────────────
export interface LeafLookOptions {
  /** Blade colours to pick from (repeat a tone to weight it). */
  palette: readonly number[];
  /** Shapes to pick from (repeat to weight). */
  shapes?: readonly LeafShape[];
  /** Leaf length range (metres), default 0.1–0.2. */
  size?: readonly [number, number];
  /** Share of leaves torn or bitten (0‥1). */
  torn?: number;
  thick?: number;
  surf?: Surf;
  mat?: VoxelMaterialKey;
  cell?: number;
}

const DEFAULT_SHAPES: readonly LeafShape[] = [LEAF_SHAPES.maple, LEAF_SHAPES.star, LEAF_SHAPES.star, LEAF_SHAPES.trident];

/** A seeded leaf: shape, size, colour (a blend of two palette tones ±8 %), damage. */
export function randomLeaf(r: Rng, o: LeafLookOptions): LeafLook {
  const shape = r.pick(o.shapes ?? DEFAULT_SHAPES);
  const [s0, s1] = o.size ?? [0.1, 0.2];
  const color = scaleColor(mixColor(r.pick(o.palette), r.pick(o.palette), r() * 0.35), 0.92 + r() * 0.16);
  const damage = !r.chance(o.torn ?? 0) ? undefined : r.chance(0.4) ? { cut: [r.range(0, Math.PI * 2), r.range(0.62, 0.82)] as const, seed: r.int(0, 9999) } : { bites: r.int(2, 4), seed: r.int(0, 9999) };
  return { shape, size: r.range(s0, s1), thick: o.thick, color, surf: o.surf, mat: o.mat, cell: o.cell, damage };
}

// ── The bed ───────────────────────────────────────────────────────────────────
export interface LeafBedOptions {
  /** Centre and size of the bed (metres). Leaves reaching past it hang in the air (or fold, see `drape`). */
  x?: number;
  z?: number;
  w: number;
  d: number;
  /** Ground height: a constant or a function of (x, z) (default 0). */
  ground?: number | ((x: number, z: number) => number);
  /** Height-map spacing (default half a leaf cell). */
  res?: number;
  /**
   * The bed is the top of a block (a tile, a step) with its edges on the leaf
   * lattice: leaves lying flat across an edge fold down the side, like the
   * sheet's tile.
   */
  drape?: boolean;
}

interface Placed {
  look: LeafLook;
  ras: Raster;
  /** Centre, underside height there, and the underside's slopes over world x and z. */
  x: number;
  y: number;
  z: number;
  sx: number;
  sz: number;
  drape: boolean;
}

const QUARTERS: [number, number][] = [
  [-0.3, -0.3],
  [0.3, -0.3],
  [-0.3, 0.3],
  [0.3, 0.3],
];
const RING: [number, number][] = [
  [1.3, 0],
  [-1.3, 0],
  [0, 1.3],
  [0, -1.3],
  [0.95, 0.95],
  [-0.95, 0.95],
  [0.95, -0.95],
  [-0.95, -0.95],
];

/**
 * A height map the leaves fall onto. `drop()` rests each new leaf on what is
 * already there (the ground, a pile core, earlier leaves) and raises the map
 * by it; `commit()` lays them all, darkening cells in the crevices of a heap
 * and leaving out the ones buried under it.
 */
export class LeafBed {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  readonly res: number;
  readonly drape: boolean;
  private readonly nx: number;
  private readonly nz: number;
  private readonly h: Float32Array;
  private readonly ground: (x: number, z: number) => number;
  private readonly placed: Placed[] = [];

  constructor(o: LeafBedOptions) {
    const cx = o.x ?? 0;
    const cz = o.z ?? 0;
    this.x0 = cx - o.w / 2;
    this.z0 = cz - o.d / 2;
    this.x1 = cx + o.w / 2;
    this.z1 = cz + o.d / 2;
    this.res = o.res ?? LEAF_CELL / 2;
    this.drape = o.drape ?? false;
    this.nx = Math.round(o.w / this.res) + 1;
    this.nz = Math.round(o.d / this.res) + 1;
    const g = o.ground ?? 0;
    this.ground = typeof g === 'number' ? () => g : g;
    this.h = new Float32Array(this.nx * this.nz);
    for (let i = 0; i < this.nx; i++) for (let k = 0; k < this.nz; k++) this.h[i * this.nz + k] = this.ground(this.x0 + i * this.res, this.z0 + k * this.res);
  }

  /** Surface height (ground or litter) at (x, z); −Infinity off the bed. */
  top(x: number, z: number): number {
    const i = Math.round((x - this.x0) / this.res);
    const k = Math.round((z - this.z0) / this.res);
    return i < 0 || k < 0 || i >= this.nx || k >= this.nz ? -Infinity : this.h[i * this.nz + k];
  }

  /** Raise the surface to at least y over a rectangle (a core, a stone the leaves rest on). */
  raise(x0: number, z0: number, x1: number, z1: number, y: number): void {
    const i0 = Math.max(0, Math.ceil((x0 - this.x0) / this.res - 1e-6));
    const i1 = Math.min(this.nx - 1, Math.floor((x1 - this.x0) / this.res + 1e-6));
    const k0 = Math.max(0, Math.ceil((z0 - this.z0) / this.res - 1e-6));
    const k1 = Math.min(this.nz - 1, Math.floor((z1 - this.z0) / this.res + 1e-6));
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) this.h[i * this.nz + k] = Math.max(this.h[i * this.nz + k], y);
  }

  /** Number of leaves dropped so far. */
  get size(): number {
    return this.placed.length;
  }

  /** Room around (x, z) for a leaf of this size: distance to the nearest leaf over their mean size (∞ when empty). */
  gap(x: number, z: number, size: number): number {
    let g = Infinity;
    for (const L of this.placed) g = Math.min(g, Math.hypot(L.x - x, L.z - z) / ((size + L.look.size) / 2));
    return g;
  }

  /**
   * Let a leaf fall at (x, z) turned by `yaw`: it settles as low as it can on
   * what lies under it, tilted at most `maxTilt` each way (default 20°: a
   * limp leaf lies nearly flat over others). Returns false (and places
   * nothing) when little of it is over the bed.
   */
  drop(look: LeafLook, x: number, z: number, yaw: number, maxTilt = 0.35): boolean {
    const thick = look.thick ?? LEAF_THICK;
    const ras = rasterise(look, x, z, yaw, lightIn(surfaceFrame('top', 0)));
    const cell = ras.cell;
    const at = (a: number, b: number) => [(ras.a0 + a + 0.5) * cell, (ras.b0 + b + 0.5) * cell];
    const pts: [number, number, number][] = [];
    let total = 0;
    let outside = false;
    for (let a = 0; a < ras.na; a++)
      for (let b = 0; b < ras.nb; b++) {
        if (!ras.code[a * ras.nb + b]) continue;
        total++;
        const [cx, cz] = at(a, b);
        if (cx < this.x0 || cx > this.x1 || cz < this.z0 || cz > this.z1) outside = true;
        let h = -Infinity;
        for (const [du, dv] of QUARTERS) h = Math.max(h, this.top(cx + du * cell, cz + dv * cell));
        if (h > -Infinity) pts.push([cx - x, cz - z, h]);
      }
    if (pts.length < Math.max(3, total * 0.5)) return false;
    // The tilt that brings its centre lowest while it rests on the supports — a
    // coarse then a fine search; a hair of preference for flat breaks ties.
    const lim = Math.tan(maxTilt);
    const rest = (sx: number, sz: number) => {
      let y = -Infinity;
      for (const [dx, dz, h] of pts) y = Math.max(y, h - sx * dx - sz * dz);
      return y;
    };
    let sx = 0;
    let sz = 0;
    let score = rest(0, 0);
    for (const step of [lim / 4, lim / 16]) {
      const [x0, z0] = [sx, sz];
      for (let i = -4; i <= 4; i++)
        for (let j = -4; j <= 4; j++) {
          const a = Math.max(-lim, Math.min(lim, x0 + i * step));
          const c = Math.max(-lim, Math.min(lim, z0 + j * step));
          const sc = rest(a, c) + (Math.abs(a) + Math.abs(c)) * cell * 0.25;
          if (sc < score - 1e-9) {
            score = sc;
            sx = a;
            sz = c;
          }
        }
    }
    // Nearly flat reads flat: plain boxes keep the texel pattern whole.
    if (Math.abs(sx) < 0.03 && Math.abs(sz) < 0.03) sx = sz = 0;
    const y = rest(sx, sz);
    const drape = this.drape && outside && !sx && !sz && y - this.ground(x, z) < thick / 2;
    // Off a block's edge only a leaf lying flat on its top folds over; a tilted one would slide off.
    if (this.drape && outside && !drape) return false;
    this.placed.push({ look, ras, x, y, z, sx, sz, drape });
    for (let a = 0; a < ras.na; a++)
      for (let b = 0; b < ras.nb; b++) {
        if (!ras.code[a * ras.nb + b]) continue;
        const [cx, cz] = at(a, b);
        this.raise(cx - cell / 2, cz - cell / 2, cx + cell / 2, cz + cell / 2, y + sx * (cx - x) + sz * (cz - z) + thick);
      }
    return true;
  }

  /**
   * Lay every dropped leaf (see {@link LeafBed}); returns the number of boxes.
   * `shadow`: colour of a thin crescent on the ground to the lower right of
   * each leaf lying on it — the sheets' drop shadows, and contact darkening
   * in game light.
   */
  commit(target: PieceBuilder | VoxelBuilder, o: { ao?: number; shadow?: number } = {}): number {
    const b = builderOf(target);
    const ao = o.ao ?? 0.3;
    const src = here();
    let count = 0;
    if (o.shadow !== undefined) for (const L of this.placed) count += this.shadow(b, L, o.shadow, src);
    for (const L of this.placed) {
      const { ras } = L;
      const thick = L.look.thick ?? LEAF_THICK;
      const body = new Uint8Array(ras.na * ras.nb);
      const shade = new Float32Array(ras.na * ras.nb).fill(1);
      const filled = (a: number, bb: number) => a >= 0 && bb >= 0 && a < ras.na && bb < ras.nb && ras.code[a * ras.nb + bb] > 0;
      for (let a = 0; a < ras.na; a++)
        for (let bb = 0; bb < ras.nb; bb++) {
          const i = a * ras.nb + bb;
          if (!ras.code[i]) continue;
          const cx = (ras.a0 + a + 0.5) * ras.cell;
          const cz = (ras.b0 + bb + 0.5) * ras.cell;
          if (L.drape) {
            // Past one edge: that edge's fold; past two (a corner): left out.
            const over = [cx > this.x1, cx < this.x0, cz > this.z1, cz < this.z0];
            const k = over.filter(Boolean).length;
            body[i] = k === 0 ? 0 : k > 1 ? 255 : over.indexOf(true) + 1;
            if (body[i]) continue;
          }
          const top = L.y + L.sx * (cx - L.x) + L.sz * (cz - L.z) + thick;
          // Buried: two leaves' depth of litter over all of it, and not on its outline.
          let buried = filled(a - 1, bb) && filled(a + 1, bb) && filled(a, bb - 1) && filled(a, bb + 1);
          for (const [du, dv] of QUARTERS) if (buried && this.top(cx + du * ras.cell, cz + dv * ras.cell) - top < 2 * thick) buried = false;
          if (buried) {
            body[i] = 255;
            continue;
          }
          // Crevice darkening: how far the litter around stands above the cell.
          let occ = 0;
          for (const [du, dv] of RING) {
            const h = this.top(cx + du * ras.cell, cz + dv * ras.cell);
            if (h > top) occ += Math.min(1, (h - top) / (2.5 * thick));
          }
          occ /= RING.length;
          shade[i] = occ > 0.5 ? 1 - ao : occ > 0.2 ? 1 - ao * 0.5 : 1;
        }
      const frames = [this.planeOf(L), ...(L.drape ? this.folds(L.y) : [])];
      count += layRaster(b, L.look, ras, { frames, body, shade, src });
    }
    return count;
  }

  /** The drop shadow of a leaf lying flat on the ground: its outline moved a cell towards +x, +z, less itself. */
  private shadow(b: VoxelBuilder, L: Placed, color: number, src?: SourceTrace): number {
    const { ras } = L;
    if (L.sx || L.sz || L.y - this.ground(L.x, L.z) > 0.002) return 0;
    const na = ras.na + 1;
    const nb = ras.nb + 1;
    const code = new Uint8Array(na * nb);
    const leaf = (a: number, bb: number) => a >= 0 && bb >= 0 && a < ras.na && bb < ras.nb && ras.code[a * ras.nb + bb] > 0;
    for (let a = 0; a < na; a++)
      for (let bb = 0; bb < nb; bb++) {
        const x = (ras.a0 + a + 0.5) * ras.cell;
        const z = (ras.b0 + bb + 0.5) * ras.cell;
        if (leaf(a - 1, bb - 1) && !leaf(a, bb) && x > this.x0 && x < this.x1 && z > this.z0 && z < this.z1) code[a * nb + bb] = 1;
      }
    const look: LeafLook = { shape: LEAF_SHAPES.bit, size: L.look.size, color, thick: 0.002 };
    return layRaster(b, look, { cell: ras.cell, a0: ras.a0, b0: ras.b0, na, nb, code, facet: new Float32Array(na * nb).fill(1) }, { frames: [frame(new Vector3(0, L.y, 0), X, Z, Y)], src });
  }

  /** The lattice plane of a resting leaf: flat at its height, or tilted about its centre. */
  private planeOf(L: Placed): Frame {
    if (!L.sx && !L.sz) return frame(new Vector3(0, L.y, 0), X, Z, Y);
    const rot = new Quaternion().setFromUnitVectors(Y, new Vector3(-L.sx, 1, -L.sz).normalize());
    const P = X.clone().applyQuaternion(rot);
    const Q = Z.clone().applyQuaternion(rot);
    const N = Y.clone().applyQuaternion(rot);
    return frame(new Vector3(L.x, L.y, L.z).addScaledVector(P, -L.x).addScaledVector(Q, -L.z), P, Q, N, rot);
  }

  /**
   * Planes of the parts folded over the bed's edges (+x, −x, +z, −z) for a leaf
   * flat at height y: a cell d past an edge hangs d below the top, against the side.
   */
  private folds(y: number): Frame[] {
    return [
      frame(new Vector3(this.x1, y + this.x1, 0), neg(Y), Z, X),
      frame(new Vector3(this.x0, y - this.x0, 0), Y, Z, neg(X)),
      frame(new Vector3(0, y + this.z1, this.z1), X, neg(Y), Z),
      frame(new Vector3(0, y - this.z0, this.z0), X, Y, neg(Z)),
    ];
  }
}

// ── Scatters ──────────────────────────────────────────────────────────────────
export interface LitterOptions extends LeafLookOptions {
  /** Centre of the area (metres). */
  x?: number;
  z?: number;
  /** A w × d rectangle, or a disc of radius r. */
  w?: number;
  d?: number;
  r?: number;
  count: number;
  seed: number;
  /** 0 = spread evenly (default), 1 = heaped towards the centre. */
  pile?: number;
  /** Minimum distance between leaf centres over their mean size (default 0.55). */
  spacing?: number;
  /** Steepest a leaf may lie (radians, see {@link LeafBed.drop}). */
  tilt?: number;
  /** Drop onto this bed and leave the commit to the caller; default: a new flat bed, laid at once. */
  bed?: LeafBed;
  /** Ground height for a new bed (default 0). */
  ground?: number | ((x: number, z: number) => number);
}

function bedFor(o: { x?: number; z?: number; w?: number; d?: number; r?: number; ground?: LitterOptions['ground'] }, margin: number): LeafBed {
  const w = o.w ?? (o.r ?? 0.5) * 2;
  const d = o.d ?? (o.r ?? 0.5) * 2;
  return new LeafBed({ x: o.x, z: o.z, w: w + 2 * margin, d: d + 2 * margin, ground: o.ground });
}

/** Standard normal sample (Box–Muller). */
function gauss(r: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}

/**
 * Leaf litter over an area: `count` seeded leaves spread with a minimum
 * spacing (so they read as separate leaves, like the sheets) or heaped towards
 * the centre (`pile`), each resting on the ground and the leaves before it.
 * Big leaves fall first, small ones settle in the gaps and over them.
 * Returns the bed (committed already unless `o.bed` was given).
 */
export function scatterLeaves(target: PieceBuilder | VoxelBuilder, o: LitterOptions): LeafBed {
  const r = rng(o.seed * 7 + 3);
  const bed = o.bed ?? bedFor(o, (o.size?.[1] ?? 0.2) * 0.6);
  const cx = o.x ?? 0;
  const cz = o.z ?? 0;
  const pile = o.pile ?? 0;
  const looks = Array.from({ length: o.count }, () => randomLeaf(r, o)).sort((a, b) => b.size - a.size);
  for (const look of looks)
    for (let attempt = 0; attempt < 4; attempt++) {
      if (dropOne(look)) break;
    }
  function dropOne(look: LeafLook): boolean {
    let best: [number, number] | null = null;
    let bestGap = -Infinity;
    for (let t = 0; t < 24; t++) {
      let px: number;
      let pz: number;
      if (o.r !== undefined) {
        const a = r.range(0, Math.PI * 2);
        const rad = o.r * (pile > 0 ? Math.min(1, Math.abs(gauss(r)) * (1.05 - pile * 0.6)) : Math.sqrt(r()));
        px = cx + Math.cos(a) * rad;
        pz = cz + Math.sin(a) * rad;
      } else {
        const k = 1 - pile * 0.6;
        px = cx + (pile > 0 ? gauss(r) * 0.35 * k : r() - 0.5) * (o.w ?? 1);
        pz = cz + (pile > 0 ? gauss(r) * 0.35 * k : r() - 0.5) * (o.d ?? 1);
      }
      // Keep the roomiest of a few tries (a blue-noise spread), or the first one in a heap.
      const gap = bed.gap(px, pz, look.size);
      if (gap > bestGap) {
        best = [px, pz];
        bestGap = gap;
      }
      if (gap >= (o.spacing ?? 0.55) || pile > 0) break;
    }
    return !!best && bed.drop(look, best[0], best[1], r.range(0, Math.PI * 2), o.tilt);
  }
  if (!o.bed) bed.commit(target);
  return bed;
}

export interface ClusterOptions extends LeafLookOptions {
  x?: number;
  z?: number;
  /** Number of leaves (5–16 reads as a cluster). */
  count: number;
  seed: number;
  /** Steepest a leaf may lie (radians, default ≈ 13°: a rosette lies nearly flat). */
  tilt?: number;
  /** Drop onto this bed and leave the commit to the caller. */
  bed?: LeafBed;
  ground?: LitterOptions['ground'];
}

/**
 * A rosette of leaves round a point, as §20 draws its clusters: an outer ring
 * lying on the ground with the stems pointing in and just meeting, a smaller
 * ring over their bases and (in a big one) a leaf on top, all pointing outward — each
 * resting on the ones below, two or three deep in the middle.
 */
export function leafCluster(target: PieceBuilder | VoxelBuilder, o: ClusterOptions): LeafBed {
  const r = rng(o.seed * 13 + 5);
  const looks = Array.from({ length: o.count }, () => randomLeaf(r, o)).sort((a, b) => b.size - a.size);
  const mean = looks.reduce((t, l) => t + l.size, 0) / Math.max(1, looks.length);
  const bed = o.bed ?? bedFor({ x: o.x, z: o.z, r: mean * 1.3, ground: o.ground }, mean * 0.4);
  const cx = o.x ?? 0;
  const cz = o.z ?? 0;
  const top = o.count >= 10 ? 1 : 0;
  const inner = o.count >= 6 ? Math.round((o.count - top) * 0.35) : 0;
  const outer = o.count - top - inner;
  const ring = (list: LeafLook[], radius: number, a0: number) =>
    list.forEach((look, i) => {
      // The tip (−v) points outward: yaw = azimuth + π.
      const a = a0 + (i / list.length) * Math.PI * 2 + r.range(-0.25, 0.25);
      const rad = look.size * radius * r.range(0.85, 1.15);
      bed.drop(look, cx + Math.sin(a) * rad, cz + Math.cos(a) * rad, a + Math.PI + r.range(-0.3, 0.3), o.tilt ?? 0.22);
    });
  const a0 = r.range(0, Math.PI * 2);
  ring(looks.slice(0, outer), 0.72, a0);
  ring(looks.slice(outer, outer + inner), 0.5, a0 + Math.PI / Math.max(1, inner));
  ring(looks.slice(outer + inner), 0.3, r.range(0, Math.PI * 2));
  if (!o.bed) bed.commit(target);
  return bed;
}

export interface PileOptions extends LeafLookOptions {
  x?: number;
  z?: number;
  /** Radius of the heap's foot and its height (metres). */
  r: number;
  height: number;
  /** Leaves on it (default: enough to cover it about 1.4 deep). */
  count?: number;
  seed: number;
  /** Colours of the core's surface, the litter showing between the leaves (default: the palette in shade). */
  core?: readonly number[];
  /** Steepest a leaf may lie (radians, default ≈ 31° over a core, 20° without). */
  tilt?: number;
  bed?: LeafBed;
  ground?: LitterOptions['ground'];
}

/**
 * A heap of leaves: a dome of litter (texel columns in quarter-texel steps,
 * `leaves` family, hidden cells culled) under a skin of leaves spread evenly
 * over it — body without hundreds of buried leaves. A low heap (up to about
 * six leaves deep) is just leaves stacked towards the middle.
 */
export function leafPile(target: PieceBuilder | VoxelBuilder, o: PileOptions): LeafBed {
  const b = builderOf(target);
  const r = rng(o.seed * 17 + 11);
  const cx = o.x ?? 0;
  const cz = o.z ?? 0;
  const bed = o.bed ?? bedFor({ x: cx, z: cz, r: o.r, ground: o.ground }, (o.size?.[1] ?? 0.2) * 0.6);
  const thick = o.thick ?? LEAF_THICK;
  // Deeper than about six leaves, a heap gets a core; the leaves over it add two more.
  const coreH = o.height - 2.5 * thick;
  const core = o.height > 6 * thick;
  if (core) {
    const step = TEXEL / 4;
    const rc = o.r * 0.82;
    const base = bed.top(cx, cz);
    const g = b.grid({ cell: [TEXEL, step, TEXEL], origin: [0, base, 0], mat: 'leaves', jitter: 0.05, ao: 0.4, seed: o.seed });
    const skin = o.core ?? o.palette.map((c) => scaleColor(c, 0.55));
    const deep = LITTER_TONES.dark;
    for (let i = Math.floor((cx - rc) / TEXEL); i <= Math.ceil((cx + rc) / TEXEL); i++)
      for (let k = Math.floor((cz - rc) / TEXEL); k <= Math.ceil((cz + rc) / TEXEL); k++) {
        const q = Math.hypot((i + 0.5) * TEXEL - cx, (k + 0.5) * TEXEL - cz) / rc + (r() - 0.5) * 0.08;
        if (q >= 1) continue;
        const n = Math.max(1, Math.round((coreH * Math.pow(1 - q * q, 1.3)) / step));
        g.ghost(i, -1, k);
        // Litter on top, darker further down (the steps of the dome read as shade between leaves).
        for (let j = 0; j < n; j++) {
          const tones = j === n - 1 ? skin : deep;
          g.set(i, j, k, tones[Math.floor(hash3(i, j, k, o.seed) * tones.length)]);
        }
        bed.raise(i * TEXEL, k * TEXEL, (i + 1) * TEXEL, (k + 1) * TEXEL, base + n * step);
      }
    g.commit();
  }
  const mean = ((o.size?.[0] ?? 0.1) + (o.size?.[1] ?? 0.2)) / 2;
  const count = o.count ?? Math.round((Math.PI * o.r * o.r * 1.4) / (0.5 * mean * mean));
  scatterLeaves(b, { ...o, x: cx, z: cz, r: o.r, count, pile: core ? 0 : 0.45, spacing: core ? 0.35 : 0, tilt: o.tilt ?? (core ? 0.55 : 0.35), bed, seed: o.seed + 1 });
  if (!o.bed) bed.commit(b);
  return bed;
}
