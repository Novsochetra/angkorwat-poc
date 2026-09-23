import { Euler, Matrix4 } from 'three';
import type { VoxelMaterialKey } from '../../../voxel/materials';
import { hash3 } from '../../../voxel/random';
import type { Surf } from '../../../voxel/VoxelBuilder';
import { fromSheet, GRASS, SANDSTONE, SOIL } from '../../palette';
import { PieceBuilder } from '../../PieceBuilder';
import { rng, snap, TEXEL, tone, type Rng } from '../../shapes';
import { barkSurf, soilSurf, stoneSurf } from '../../surface';
import type { KitPiece } from '../../types';

/**
 * §18.1 ④ palm builder. The trunk is a stack of octagonal rings (free boxes on
 * the texel grid, alternating light and dark bands like the sheet), standing on
 * a stepped foot in a grass patch.
 *
 *  - `feather`: the sheet's palm. Its crown is drawn cell by cell on a 3/16 m
 *    grid, so the 14–16 pinnate fronds can rise, arch and droop the way the
 *    sheet's stepped blocks do: a comb of jagged leaflets on each rib, brown
 *    dead fronds and fruit bunches hanging under the crown, ambient occlusion
 *    deepening the heart.
 *  - `sugar`: Borassus flabellifer, the sugar palm of Angkor — a ball of stiff
 *    fan leaves on long stalks, a skirt of dry leaves, dark fruit clusters. Fan
 *    segments are straight rays, which cells can't draw at this size, so they
 *    are thin rotated planks.
 */
export type PalmKind = 'feather' | 'sugar';

export interface PalmOptions {
  kind: PalmKind;
  seed: number;
  /** Ground to the top of the crown (metres). Default: seeded, 13–18 m. */
  height?: number;
}

/** Crown cell: three texels, fine enough for arching fronds, chunky like the sheet. */
const CELL = 3 * TEXEL;

type V3 = [number, number, number];
type Pal = readonly number[];
const Y: V3 = [0, 1, 0];
const DEG = Math.PI / 180;
const GOLDEN = 137.5 * DEG;
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Unit direction from an azimuth (from +Z towards +X) and an elevation. */
const dirOf = (az: number, el: number): V3 => [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
/** Horizontal unit vector square to a direction (its "left"); falls back to the azimuth for vertical ones. */
function sideOf(t: V3, az: number): V3 {
  const s = cross(t, Y);
  return Math.hypot(s[0], s[2]) > 0.08 ? unit(s) : [-Math.cos(az), 0, Math.sin(az)];
}

// ── Colours: sampled off the sheet's lit faces (fromSheet) ─────────────────────
const S = (...hex: number[]): Pal => hex.map(fromSheet);

/** Frond greens: young fronds yellow-green, mature ones deeper, old ones olive. */
interface Greens {
  light: Pal;
  mid: Pal;
  deep: Pal;
}

const FEATHER = {
  greens: [
    { light: S(0x8eac48, 0x86a645, 0x96b04c), mid: S(0x628e40, 0x6a943f, 0x5a863d), deep: S(0x3f7036, 0x467835, 0x3a6834) },
    { light: S(0x7c9e44, 0x759843), mid: S(0x4e7c3c, 0x49763a, 0x55823d), deep: S(0x2f5a30, 0x356232, 0x2b542e) },
    { light: S(0x8e9a44, 0x86943f), mid: S(0x687a3c, 0x60743a), deep: S(0x465c34, 0x405632) },
  ] as Greens[],
  rib: S(0xa2a846, 0x98a243),
  stalk: S(0x86843c, 0x7a7a38),
  heart: S(0x9a983f, 0x888a3a, 0x7a6c34),
  fibre: S(0x74562f, 0x624829),
  dead: S(0xb06e34, 0x9a602e, 0xa46b36, 0xba7a3e),
  deadDeep: S(0x7f512a, 0x6e4626, 0x8a5a2e),
  fruit: S(0xa8703a, 0x8c5c30, 0xb8803e, 0x74492a),
  stem: S(0x8c6a36, 0x7a5a30),
  ringLight: S(0xd09e6e, 0xc8986a, 0xd6a476),
  ringDark: S(0xb28a68, 0xaa8462),
  joint: S(0x6e5a4e, 0x645246),
  collar: S(0x7e6038, 0x6e5432),
};

const SUGAR = {
  greens: [
    { light: S(0x9cb452, 0x94ae4e), mid: S(0x628c46, 0x689448, 0x5c8644), deep: S(0x3c683a, 0x42703c) },
    { light: S(0x88a44c, 0x80a048), mid: S(0x4e7a40, 0x4a743e, 0x548042), deep: S(0x315a34, 0x366236) },
    { light: S(0xa2a44e, 0x989e4a), mid: S(0x76823f, 0x6e7c3c), deep: S(0x526236, 0x4c5c34) },
  ] as Greens[],
  petiole: S(0x9a9a50, 0x8c8e4a, 0xa4a456),
  heart: S(0x706c3b, 0x605c35, 0x7c703d),
  dead: S(0xa08058, 0x927250, 0xac8c62, 0x86684a),
  deadDeep: S(0x6e573f, 0x654f39, 0x765e44),
  fruit: S(0x3c2b31, 0x302429, 0x48353b),
  cap: S(0x9c8c3e, 0x8c803a),
  ringLight: S(0x94826f, 0x8c7a68, 0x9a8875),
  ringDark: S(0x887664, 0x82705f),
  joint: S(0x766656, 0x706050),
  root: S(0x6e5e50, 0x625448),
};

// ── Crown sketch ──────────────────────────────────────────────────────────────
interface Dot {
  p: V3;
  pal: Pal;
  /** Higher wins when two parts want the same cell (ribs over leaflets…). */
  pri: number;
  mat: VoxelMaterialKey;
}

/** A thin rotated box: a fan-leaf segment or stalk, laid from `a` along `v`. */
interface Plank {
  a: V3;
  v: V3;
  /** Width direction (square to v); the thickness runs along v × w. */
  w: V3;
  len: number;
  width: number;
  thick: number;
  color: number;
  shade: number;
}

const _m = new Matrix4();
const _e = new Euler();

/**
 * Crown parts collected in crown space (metres, origin = the crown's heart) —
 * cells for the grid and free planks — so the crown's height is known before
 * the trunk is sized to it.
 */
class Sketch {
  readonly dots: Dot[] = [];
  readonly planks: Plank[] = [];
  top = -Infinity;

  plank(pl: Plank): void {
    // Square the width direction to the length, so the box is exactly as laid out.
    const w = unit(add(pl.w, pl.v, -(pl.w[0] * pl.v[0] + pl.w[1] * pl.v[1] + pl.w[2] * pl.v[2])));
    this.planks.push({ ...pl, w });
    const t = cross(pl.v, w);
    const reach = (Math.abs(pl.v[1]) * pl.len + Math.abs(w[1]) * pl.width + Math.abs(t[1]) * pl.thick) / 2;
    this.top = Math.max(this.top, pl.a[1] + (pl.v[1] * pl.len) / 2 + reach);
  }

  dot(p: V3, pal: Pal, pri = 0, mat: VoxelMaterialKey = 'leaves'): void {
    this.dots.push({ p, pal, pri, mat });
    // The cell a dot lands in reaches half a cell above it on average.
    this.top = Math.max(this.top, p[1] + CELL / 2);
  }

  /** Cells every half cell from a to b. */
  line(a: V3, b: V3, pal: Pal, pri = 0): void {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / (CELL / 2)));
    for (let s = 0; s <= n; s++) this.dot(add(a, add(b, a, -1), s / n), pal, pri);
  }

  /** Solid ellipsoid (centre, radii in metres). */
  blob(c: V3, r: V3, pal: Pal, pri = 0): void {
    const h = CELL / 2;
    for (let x = -r[0]; x <= r[0]; x += h)
      for (let y = -r[1]; y <= r[1]; y += h)
        for (let z = -r[2]; z <= r[2]; z += h) if ((x / r[0]) ** 2 + (y / r[1]) ** 2 + (z / r[2]) ** 2 <= 1) this.dot([c[0] + x, c[1] + y, c[2] + z], pal, pri);
  }

  /** Put the cells on a grid of the piece with the heart at `c`. */
  commit(p: PieceBuilder, c: V3, seed: number): void {
    const origin: V3 = [snap(c[0]), snap(c[1]), snap(c[2])];
    const g = p.voxels.grid({ cell: CELL, origin, mat: 'leaves', jitter: 0.07, ao: 0.34, seed });
    const best = new Map<number, { i: number; j: number; k: number; d: Dot }>();
    for (const d of this.dots) {
      const i = Math.floor((c[0] + d.p[0] - origin[0]) / CELL);
      const j = Math.floor((c[1] + d.p[1] - origin[1]) / CELL);
      const k = Math.floor((c[2] + d.p[2] - origin[2]) / CELL);
      const key = ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);
      const b = best.get(key);
      if (!b || d.pri >= b.d.pri) best.set(key, { i, j, k, d });
    }
    for (const { i, j, k, d } of best.values()) g.put(i, j, k, { color: tone(d.pal, i, j, k, seed), mat: d.mat });
    g.commit();
    for (const pl of this.planks) {
      const { w, v } = pl;
      const t = cross(v, w);
      _m.set(w[0], t[0], v[0], 0, w[1], t[1], v[1], 0, w[2], t[2], v[2], 0, 0, 0, 0, 1);
      _e.setFromRotationMatrix(_m);
      const m = add(add(c, pl.a), v, pl.len / 2);
      p.voxels.box(m[0], m[1], m[2], pl.width, pl.thick, pl.len, pl.color, 'leaves', { rx: _e.x, ry: _e.y, rz: _e.z, shade: pl.shade });
    }
  }
}

// ── Feather palm crown (the sheet's palm) ─────────────────────────────────────
interface Frond {
  az: number;
  /** Elevation where the frond leaves the heart. */
  el: number;
  /** How far (radians) the rib bends down by its tip… */
  bend: number;
  /** …and how late along it (higher = the bend gathers at the tip, an arch). */
  bendPow: number;
  len: number;
  /** Longest leaflet (metres). */
  leaf: number;
  /** Leaflet hang below the rib's side plane, at the base and at the tip. */
  hang: [number, number];
  /** Gravity sag of the leaflets (1/m). */
  sag: number;
  /** Sideways sweep of the rib (radians over its length). */
  curl: number;
  greens: Greens;
  rib: Pal;
  stalk: Pal;
  seed: number;
}

/** Leaflet length along the frond: short near the stalk, longest at 40 %, short at the tip. */
const leafletProfile = (u: number) => (0.45 + 0.55 * Math.sin(Math.PI * Math.pow(u, 0.7))) * (1 - 0.6 * u * u * u);

/** Leaflets sit 1½ cells apart: each reads as its own jagged line, yet the frond looks full. */
const LEAFLET_GAP = 1.5 * CELL;

/**
 * One pinnate frond: a rib that leaves the heart at `el` and bends down under
 * its own weight, with a comb of leaflets on both sides that sweep towards the
 * tip and hang in an inverted V, sagging more towards the tip.
 */
function frond(sk: Sketch, f: Frond): void {
  const step = CELL / 2;
  const s0 = 0.16 * f.len;
  const rib: { p: V3; t: V3; s: number }[] = [];
  let p: V3 = mul(dirOf(f.az, f.el), 0.22);
  for (let s = 0; s <= f.len; s += step) {
    const u = s / f.len;
    const t = dirOf(f.az + f.curl * u, f.el - f.bend * Math.pow(u, f.bendPow));
    rib.push({ p, t, s });
    p = add(p, t, step);
  }
  let next = s0;
  let n = 0;
  for (const { p: q, t, s } of rib) {
    if (s < next) continue;
    next = s + LEAFLET_GAP;
    const u = (s - s0) / (f.len - s0);
    const side = sideOf(t, f.az);
    const up = unit(cross(side, t));
    const beta = lerp(f.hang[0], f.hang[1], u);
    for (const sg of [-1, 1]) {
      const len = f.leaf * leafletProfile(u) * (0.8 + 0.3 * hash3(n, sg, 3, f.seed));
      const d = unit(add(add(mul(side, sg * Math.cos(beta)), up, -Math.sin(beta)), t, 0.5));
      for (let l = step; l <= len; l += step) {
        const z = l / len;
        sk.dot(add(add(q, d, l), Y, -f.sag * l * l), z < 0.35 ? f.greens.light : z < 0.75 ? f.greens.mid : f.greens.deep, z < 0.35 ? 2 : 1);
      }
    }
    n++;
  }
  for (const { p: q, s } of rib) sk.dot(q, s < s0 ? f.stalk : f.rib, 3);
}

function featherCrown(sk: Sketch, r: Rng, k: number, seed: number): void {
  const n = r.int(14, 16);
  const az0 = r.range(0, Math.PI * 2);
  // Heart: the bulb of leaf bases the fronds spring from, with brown fibre.
  sk.blob([0, 0, 0], [0.48, 0.58, 0.48], FEATHER.heart, 1);
  for (let i = 0; i < 12; i++) sk.dot(mul(dirOf(r.range(0, 7), r.range(-0.9, 0.2)), 0.5), FEATHER.fibre, 2);
  for (let i = 0; i < n; i++) {
    // Youngest first: they stand up; each older frond leans further out and arches over.
    const age = i / (n - 1);
    frond(sk, {
      az: az0 + i * GOLDEN + r.range(-0.12, 0.12),
      el: (lerp(76, 2, Math.pow(age, 0.8)) + r.range(-5, 5)) * DEG,
      bend: lerp(0.55, 2.0, Math.pow(age, 0.75)) + r.range(-0.12, 0.12),
      bendPow: lerp(2.4, 1.4, age),
      len: k * (age < 0.15 ? r.range(3.8, 4.4) : r.range(4.3, 5.2)),
      leaf: k * lerp(0.75, 1.05, Math.min(1, age * 2)) * r.range(0.93, 1.07),
      hang: [lerp(34, 44, age) * DEG, lerp(62, 80, age) * DEG],
      sag: r.range(0.55, 0.8),
      curl: r.range(-0.3, 0.3),
      greens: FEATHER.greens[age < 0.3 ? 0 : age < 0.8 ? 1 : 2],
      rib: FEATHER.rib,
      stalk: FEATHER.stalk,
      seed: seed * 31 + i,
    });
  }
  // The spear: the next frond, still furled, standing straight up.
  sk.line([0, 0.3, 0], mul(dirOf(r.range(0, 7), 84 * DEG), 1.5 * k), FEATHER.rib, 3);
  // Dead fronds hanging under the crown, and bunches of fruit between them (the
  // sheet's brown clusters).
  const dead = r.int(4, 5);
  for (let i = 0; i < dead; i++)
    frond(sk, {
      az: az0 + (i + 0.5) * ((Math.PI * 2) / dead) + r.range(-0.3, 0.3),
      el: r.range(-22, -8) * DEG,
      bend: r.range(1.3, 1.6),
      bendPow: 1.1,
      len: k * r.range(3.0, 3.6),
      leaf: k * r.range(0.6, 0.75),
      hang: [70 * DEG, 88 * DEG],
      sag: 1,
      curl: r.range(-0.2, 0.2),
      greens: { light: FEATHER.dead, mid: FEATHER.dead, deep: FEATHER.deadDeep },
      rib: FEATHER.stem,
      stalk: FEATHER.stem,
      seed: seed * 17 + i,
    });
  const bunches = r.int(3, 4);
  for (let i = 0; i < bunches; i++) {
    const az = az0 + (i * (Math.PI * 2)) / bunches + r.range(-0.3, 0.3);
    const a = add(mul(dirOf(az, 0), 0.4), [0, -0.35, 0]);
    const b = add(a, dirOf(az, -35 * DEG), 0.5);
    sk.line(a, b, FEATHER.stem, 2);
    // A hanging cone of fruit, lumpy at the edges.
    const rows = r.int(6, 7);
    for (let j = 0; j < rows; j++) {
      const rad = lerp(0.36, 0.1, j / (rows - 1));
      const c = add(b, [0, -j * CELL, 0]);
      for (let x = -rad; x <= rad; x += CELL / 2)
        for (let z = -rad; z <= rad; z += CELL / 2)
          if (x * x + z * z <= rad * rad && hash3(Math.round(x * 16), j, Math.round(z * 16), seed + i) < 0.85) sk.dot(add(c, [x, 0, z]), FEATHER.fruit, 2);
    }
  }
}

// ── Sugar palm crown (Borassus flabellifer) ───────────────────────────────────
interface Fan {
  /** Where the stalk leaves the heart, and its direction. */
  at: V3;
  dir: V3;
  az: number;
  petiole: number;
  radius: number;
  /** Half the opening angle of the fan (radians). */
  span: number;
  /** Pointed segments the blade splits into. */
  fingers: number;
  /** Bend of the blade up off the stalk (radians), so it faces out of the crown. */
  wrist: number;
  /** Roll of the blade about its own axis (radians). */
  roll: number;
  /** How far the two halves cup forward along the midrib (per metre of radius). */
  fold: number;
  /** Gravity sag of the blade (1/m). */
  sag: number;
  /** Brightness of the whole leaf (lower leaves sit in the crown's shade). */
  shade: number;
  greens: Greens;
  stalk: Pal;
  seed: number;
}

/**
 * One costapalmate fan leaf, in planks: a stiff stalk, then a blade bent up at
 * the "wrist" to face out of the crown, whose segments radiate from the stalk
 * — each a wide plank narrowing to a pointed tip, rolled alternately left and
 * right like the pleats of a folded fan; a few tips break and hang.
 */
function fanLeaf(sk: Sketch, f: Fan): void {
  const t = unit(add(f.dir, Y, -0.08 * f.petiole));
  const side = sideOf(t, f.az);
  sk.plank({ a: f.at, v: t, w: side, len: f.petiole, width: 0.1, thick: 0.1, color: tone(f.stalk, f.seed, 0, 0), shade: f.shade });
  const p = add(f.at, t, f.petiole);
  const b = unit(add(mul(t, Math.cos(f.wrist)), unit(cross(side, t)), Math.sin(f.wrist)));
  const e = unit(add(mul(side, Math.cos(f.roll)), cross(b, side), Math.sin(f.roll)));
  const n = unit(cross(b, e));
  const segW = ((2 * f.span) / f.fingers) * f.radius * 0.55;
  for (let i = 0; i < f.fingers; i++) {
    const a = -f.span + ((i + 0.5) * 2 * f.span) / f.fingers;
    const len = f.radius * (0.85 + 0.25 * hash3(i, 1, 7, f.seed));
    const v = unit(add(add(add(mul(b, Math.cos(a)), e, Math.sin(a)), n, f.fold * Math.abs(Math.sin(a))), Y, -f.sag * len));
    const roll = (i % 2 ? 1 : -1) * 0.45;
    const w0 = unit(add(mul(e, Math.cos(a)), b, -Math.sin(a)));
    const w = unit(add(mul(w0, Math.cos(roll)), cross(v, w0), Math.sin(roll)));
    const light = i % 2 === 0;
    const col = tone(light ? f.greens.light : f.greens.mid, i, 3, 0, f.seed);
    sk.plank({ a: p, v, w, len: len * 0.62, width: segW, thick: TEXEL, color: col, shade: f.shade });
    const tip = hash3(i, 2, 7, f.seed) < 0.2 ? unit(add(v, Y, -0.9)) : v;
    sk.plank({ a: add(p, v, len * 0.58), v: tip, w, len: len * 0.42, width: segW * 0.5, thick: TEXEL, color: tone(light ? f.greens.mid : f.greens.deep, i, 4, 0, f.seed), shade: f.shade });
  }
}

function sugarCrown(sk: Sketch, r: Rng, k: number, seed: number): void {
  const n = r.int(20, 24);
  const az0 = r.range(0, Math.PI * 2);
  sk.blob([0, -0.1, 0], [0.5, 0.62, 0.5], SUGAR.heart, 1);
  for (let i = 0; i < n; i++) {
    const age = (i + 0.5) / n;
    const az = az0 + i * GOLDEN + r.range(-0.1, 0.1);
    // Even cover of the sphere: young leaves stand up, old ones droop.
    const el = Math.asin(lerp(0.97, -0.5, Math.pow(age, 0.85))) + r.range(-0.08, 0.08);
    const dir = dirOf(az, el);
    const span = lerp(55, 95, Math.min(1, age * 3)) * DEG;
    fanLeaf(sk, {
      at: mul(dir, 0.4),
      dir,
      az,
      petiole: k * lerp(0.7, 1.5, Math.min(1, age * 2)) * r.range(0.9, 1.1),
      radius: k * lerp(1.1, 1.45, Math.min(1, age * 2.5)) * r.range(0.93, 1.07),
      span,
      fingers: Math.round((span * 2) / (17 * DEG)),
      // Side blades bend up off their stalks to face out of the crown, like raised
      // hands; the upright young ones open outwards to face the sky.
      wrist: el > 40 * DEG ? -r.range(15, 35) * DEG : r.range(40, 65) * DEG * Math.max(0.2, 1 - Math.abs(el - 10 * DEG) / (75 * DEG)),
      roll: r.range(-0.4, 0.4),
      fold: r.range(0.15, 0.3),
      sag: lerp(0.03, 0.12, age),
      shade: lerp(1.1, 0.86, age),
      greens: SUGAR.greens[age < 0.25 ? 0 : age < 0.75 ? 1 : 2],
      stalk: SUGAR.petiole,
      seed: seed * 53 + i,
    });
  }
  // The spear: the newest leaves, still folded shut, standing straight up.
  for (let i = 0; i < 3; i++) {
    const az = az0 + (i * Math.PI * 2) / 3;
    const dir = dirOf(az, r.range(78, 86) * DEG);
    fanLeaf(sk, {
      at: add(mul(dir, 0.2), [0, 0.35, 0]),
      dir,
      az,
      petiole: k * r.range(0.4, 0.7),
      radius: k * r.range(1.0, 1.3),
      span: 12 * DEG,
      fingers: 3,
      wrist: 0,
      roll: r.range(-1.5, 1.5),
      fold: 0.1,
      sag: 0,
      shade: 1.12,
      greens: SUGAR.greens[0],
      stalk: SUGAR.petiole,
      seed: seed * 67 + i,
    });
  }
  // The skirt: dry leaves hanging straight down around the top of the trunk, folded shut.
  const dead = r.int(12, 15);
  for (let i = 0; i < dead; i++) {
    const az = az0 + (i / dead) * Math.PI * 2 + r.range(-0.3, 0.3);
    const dir = dirOf(az, r.range(-78, -58) * DEG);
    fanLeaf(sk, {
      at: add(mul(dirOf(az, 0), 0.45), [0, -0.25, 0]),
      dir,
      az,
      petiole: k * r.range(0.3, 0.6),
      radius: k * r.range(1.3, 1.7),
      span: r.range(16, 24) * DEG,
      fingers: 4,
      wrist: 0,
      roll: r.range(-0.5, 0.5),
      fold: 0.1,
      sag: 0,
      shade: r.range(0.85, 1),
      greens: { light: SUGAR.dead, mid: SUGAR.dead, deep: SUGAR.deadDeep },
      stalk: SUGAR.deadDeep,
      seed: seed * 29 + i,
    });
  }
  // Fruit: dark clusters on stout stalks among the leaf bases.
  const bunches = r.int(2, 4);
  for (let i = 0; i < bunches; i++) {
    const az = az0 + (i + 0.35) * ((Math.PI * 2) / bunches) + r.range(-0.3, 0.3);
    const a = add(mul(dirOf(az, 0), 0.45), [0, -0.4, 0]);
    const b = add(a, dirOf(az, -35 * DEG), 0.5);
    sk.line(a, b, SUGAR.petiole, 3);
    for (let j = 0; j < 14; j++) {
      const q = add(b, add(mul(dirOf(r.range(0, 7), r.range(-1.2, 0.5)), r.range(0.05, 0.26)), [0, -0.1, 0]));
      sk.dot(q, j < 3 ? SUGAR.cap : SUGAR.fruit, 2, 'petal');
    }
  }
}

// ── Trunk ─────────────────────────────────────────────────────────────────────
interface Rings {
  light: Pal;
  dark: Pal;
  joint: Pal;
  /** Ring height range in texels. */
  ring: [number, number];
  surf: Surf;
  /** Bark pattern of the lowest metre (moss, soil splash). */
  baseSurf: Surf;
}

/** One ring: two crossed boxes make an octagon with 2-texel chamfers. */
function octagon(p: PieceBuilder, x: number, y: number, z: number, w: number, h: number, color: number, surf: Surf): void {
  const c = w >= 8 * TEXEL ? 2 * TEXEL : TEXEL;
  const x0 = snap(x - w / 2);
  const z0 = snap(z - w / 2);
  p.voxels.span(x0, y, z0 + c, x0 + w, y + h, z0 + w - c, color, 'trunk', { surf });
  p.voxels.span(x0 + c, y, z0, x0 + w - c, y + h, z0 + w, color, 'trunk', { surf });
}

/**
 * Ringed trunk from the ground to `top`: bands alternate light / dark with a
 * recessed dark joint between them, following a gently curving axis. Adds the
 * trunk's colliders: one round the flared foot, three up the (leaning) shaft.
 */
function trunk(p: PieceBuilder, r: Rng, top: number, width: (y: number) => number, axis: (y: number) => [number, number], look: Rings): void {
  const foot = 0.6;
  const boxes: [number, number, number, number, number, number][] = [];
  let y = 0;
  let n = 0;
  while (y < top - TEXEL / 2) {
    const h = Math.min(top - y, TEXEL * r.int(look.ring[0], look.ring[1]));
    const w = Math.max(6 * TEXEL, snap(width(y + h / 2)));
    const [x, z] = axis(y + h / 2).map((v) => snap(v)) as [number, number];
    const surf = y < 1 ? look.baseSurf : look.surf;
    octagon(p, x, y, z, w, h, tone(n % 2 ? look.dark : look.light, n, 0, 0, 11), surf);
    const g = y < foot ? 0 : 1 + Math.min(2, Math.floor(((y - foot) / (top - foot)) * 3));
    const bx = (boxes[g] ??= [Infinity, y, Infinity, -Infinity, y, -Infinity]);
    bx[0] = Math.min(bx[0], x - w / 2);
    bx[2] = Math.min(bx[2], z - w / 2);
    bx[3] = Math.max(bx[3], x + w / 2);
    bx[5] = Math.max(bx[5], z + w / 2);
    y += h;
    if (y < top - 2 * TEXEL) {
      octagon(p, x, y, z, w - 2 * TEXEL, TEXEL, tone(look.joint, n, 1, 0, 11), surf);
      y += TEXEL;
    }
    bx[4] = y;
    n++;
  }
  for (const bx of boxes) if (bx) p.collider(...bx);
}

// ── Ground at the foot ────────────────────────────────────────────────────────
/**
 * A stepped grass mat, grass tufts and a couple of weathered stones around the
 * foot, like the patch under the sheet's palm.
 */
function foot(p: PieceBuilder, r: Rng, base: number, seed: number, stones: number): void {
  const R = base / 2;
  // Overlapping slabs of one soil tone (so their shared tops match) make a ragged patch.
  const slabs: { x0: number; z0: number; x1: number; z1: number; h: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const long = r.range(0.7, 1.4);
    const short = r.range(-0.2, 0.3);
    const w = base + (i % 2 ? long : short);
    const d = base + (i % 2 ? short : long);
    const x = r.range(-0.45, 0.45);
    const z = r.range(-0.45, 0.45);
    const s = { x0: snap(x - w / 2), z0: snap(z - d / 2), x1: snap(x + w / 2), z1: snap(z + d / 2), h: i === 3 ? 2 : 1 };
    slabs.push(s);
    p.voxels.span(s.x0, 0, s.z0, s.x1, s.h * TEXEL, s.z1, SOIL.dirt[0], 'soil', { surf: soilSurf({ grass: 1 }) });
  }
  /** Height of the patch (texels) over a point. */
  const mat = (x: number, z: number) => Math.max(0, ...slabs.filter((s) => x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1).map((s) => s.h));
  // Tufts: little columns of texels on the patch, tallest in the middle, bright tips.
  const g = p.voxels.grid({ cell: TEXEL, origin: [0, 0, 0], mat: 'leaves', jitter: 0.08, ao: 0.3, seed });
  const tufts = r.int(10, 14);
  for (let t = 0; t < tufts; t++) {
    const a = (t / tufts) * Math.PI * 2 + r.range(-0.25, 0.25);
    const d = R + r.range(0.05, 0.5);
    const ci = Math.floor((Math.sin(a) * d) / TEXEL);
    const ck = Math.floor((Math.cos(a) * d) / TEXEL);
    const hmax = r.int(4, 8);
    for (let di = -1; di <= 1; di++)
      for (let dk = -1; dk <= 1; dk++) {
        const i = ci + di;
        const k = ck + dk;
        const j0 = mat((i + 0.5) * TEXEL, (k + 0.5) * TEXEL);
        const h = hmax - Math.abs(di) - Math.abs(dk) - (hash3(i, 5, k, seed) < 0.4 ? 1 : 0);
        for (let j = j0; j < j0 + h; j++) g.set(i, j, k, tone(j === j0 + h - 1 ? GRASS.tip : GRASS.blade, i, j, k, seed));
      }
  }
  g.commit();
  for (let s = 0; s < stones; s++) {
    const a = r.range(0, Math.PI * 2);
    const d = R + r.range(0.3, 0.6);
    const x = snap(Math.sin(a) * d);
    const z = snap(Math.cos(a) * d);
    const w = TEXEL * r.int(4, 6);
    const l = TEXEL * r.int(3, 5);
    const h = TEXEL * (mat(x + w / 2, z + l / 2) + r.int(2, 4));
    p.voxels.span(x, 0, z, x + w, h, z + l, r.pick(SANDSTONE.weathered), 'sandstone', { surf: stoneSurf({ moss: 0.55, stain: 0.3 }) });
  }
}

/** The sugar palm's root boss: stubby roots fanning out over the ground. */
function roots(p: PieceBuilder, r: Rng, base: number): void {
  const n = r.int(7, 9);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(-0.2, 0.2);
    const len = r.range(0.35, 0.6);
    const h = TEXEL * r.int(3, 4);
    const d = base / 2 + len / 2 - 0.15;
    p.voxels.box(Math.sin(a) * d, h / 2 - TEXEL / 2, Math.cos(a) * d, TEXEL * r.int(2, 3), h, len, tone(SUGAR.root, i, 0, 0, 5), 'trunk', { ry: a, surf: barkSurf({ moss: 0.4, stain: 0.4 }) });
  }
}

// ── The palm ──────────────────────────────────────────────────────────────────
export function buildPalm(o: PalmOptions): KitPiece {
  const sugar = o.kind === 'sugar';
  const r = rng(o.seed * 7919 + 18);
  // Mature palms: 13–18 m (sugar palms a little taller on average).
  const u = r();
  const H = o.height ?? (u < 0.5 ? lerp(13, 15, u * 2) : lerp(15, 18, u * 2 - 1)) + (sugar ? 0.5 : 0);
  const k = Math.min(1.06, Math.max(0.6, Math.sqrt(H / 15)));
  const sk = new Sketch();
  if (sugar) sugarCrown(sk, r, k, o.seed);
  else featherCrown(sk, r, k, o.seed);
  const lift = sugar ? 0.35 : 0.3;
  const top = Math.max(1, H - lift - sk.top);

  // A gentle lean for the feather palm; the sugar palm stands almost plumb.
  const lean = (sugar ? r.range(0, 0.12) : r.range(0.3, 0.7)) * k;
  const la = r.range(0, Math.PI * 2);
  const axis = (y: number): [number, number] => {
    const f = lean * Math.pow(Math.min(1, y / top), 1.8);
    return [Math.sin(la) * f, Math.cos(la) * f];
  };
  const D = sugar ? r.range(0.62, 0.7) : r.range(0.56, 0.64);
  const base = sugar ? 1.15 : 1.3;
  const width = sugar
    ? (y: number) => D * (1 - 0.1 * (y / top)) + (base - D) * Math.exp(-y / 0.45) + 0.06 * Math.exp(-(((y / top - 0.72) / 0.14) ** 2))
    : (y: number) => D * (1 - 0.08 * (y / top)) + (base - D) * Math.exp(-y / 0.5);

  const p = new PieceBuilder();
  const look: Rings = sugar
    ? { light: SUGAR.ringLight, dark: SUGAR.ringDark, joint: SUGAR.joint, ring: [6, 8], surf: barkSurf({ lichen: 0.16, stain: 0.3 }), baseSurf: barkSurf({ moss: 0.4, lichen: 0.1, stain: 0.45 }) }
    : { light: FEATHER.ringLight, dark: FEATHER.ringDark, joint: FEATHER.joint, ring: [6, 8], surf: barkSurf({ lichen: 0.06, stain: 0.12 }), baseSurf: barkSurf({ moss: 0.35, stain: 0.25 }) };
  trunk(p, r, top, width, axis, look);
  const [cx, cz] = axis(top);
  if (!sugar) {
    // Collar of old leaf bases wrapping the top of the trunk.
    octagon(p, snap(cx), top - 0.25, snap(cz), snap(D + 4 * TEXEL), 0.25, tone(FEATHER.collar, 1, 2, 3, o.seed), barkSurf({ stain: 0.3 }));
  }
  sk.commit(p, [cx, top + lift, cz], o.seed);
  foot(p, r, base, o.seed, sugar ? 3 : 2);
  if (sugar) roots(p, r, base);
  return p.done();
}
