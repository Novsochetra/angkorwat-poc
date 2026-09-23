import { Euler, PointLight, Vector3 } from 'three';
import type { VoxelMaterialKey } from '../../../voxel/materials';
import { FLOWER, fromSheet, LEAF, OFFERING } from '../../palette';
import { PieceBuilder } from '../../PieceBuilder';
import { rng, type Rng } from '../../shapes';
import { defineKitAsset, type KitPiece } from '../../types';
import { joints, MossLayer, pores } from './_masonry-props';
import { Mason, mossCushions, SHRINE_CAVITY, socketStone, T } from './_shrine';

/**
 * §20 ⑤ Offering platform — a low stone altar at a shrine, as on the sheet:
 * a solid altar of dressed blocks (plinth, a recessed course in shadow, a
 * thick top slab), a slab table on four short legs, or an altar with a dark
 * niche in its front. On top: joss sticks smouldering in a brass bowl of ash,
 * candles, marigolds and lotus buds, stone offering cups. Flames and embers
 * are unlit `glow` blocks; altars with candles carry one small warm light so
 * they glow at dusk.
 *
 * The stone is authored in texels (1/16 m); the offerings are free boxes at
 * their real size (joss sticks 0.3 m, candles 0.1–0.15 m). Candles are the
 * red ones of Cambodian offerings, each in a brass cup, as the sheet draws them.
 */

/** Pores per m² of face: half-texel marks, in scale with the small blocks. */
const PORES = 14;

/** Offering colours sampled off the sheet's altars (via fromSheet) or taken from the kit palette. */
const COL = {
  stick: fromSheet(0xbd4a27),
  /** The incense paste on the upper part of a joss stick. */
  paste: fromSheet(0x96301f),
  /** The white-hot point of a smouldering tip. */
  hot: fromSheet(0xf3c251),
  ash: 0xbdb4a6,
  brass: fromSheet(0xac7336),
  gold: fromSheet(0xefb647),
  saffron: [fromSheet(0xc49043), fromSheet(0xd6a04c)],
  clay: fromSheet(0x7c512e),
  /** Red offering candles (the sheet's #c93425–#e65728). */
  wax: [0xc8402a, 0xd8542e],
  wick: 0x2a2420,
  flameCore: 0xfff0b8,
} as const;

/** Where the candle flames burn, for the dusk light. */
type Flames = Vector3[];

const _e = new Euler();
const _v = new Vector3();

/**
 * A straight rod from `base` (metres), tilted by rx / rz, made of segments laid
 * end to end — [length, colour, family, width].
 */
function rod(p: PieceBuilder, base: Vector3, [rx, ry, rz]: [number, number, number], segs: [number, number, VoxelMaterialKey, number][]): void {
  const dir = _v.set(0, 1, 0).applyEuler(_e.set(rx, ry, rz));
  let t = 0;
  for (const [len, color, mat, w] of segs) {
    const c = base.clone().addScaledVector(dir, t + len / 2);
    p.voxels.box(c.x, c.y, c.z, w, len, w, color, mat, { rx, ry, rz });
    t += len;
  }
}

/** Joss sticks smouldering in a brass bowl of ash: red bamboo, dark paste, a glowing tip. */
function incensePot(p: PieceBuilder, r: Rng, x: number, y: number, z: number, n: number): void {
  p.voxels.box(x, y + 0.01, z, 0.1, 0.02, 0.1, COL.brass, 'brass');
  p.voxels.box(x, y + 0.055, z, 0.15, 0.07, 0.15, COL.brass, 'brass');
  p.voxels.box(x, y + 0.0975, z, 0.17, 0.015, 0.17, COL.gold, 'brass');
  p.voxels.box(x, y + 0.1, z, 0.13, 0.012, 0.13, COL.ash, 'petal');
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(-0.3, 0.3);
    const off = n > 1 ? 0.035 : 0;
    const base = new Vector3(x + Math.cos(a) * off, y + 0.1, z + Math.sin(a) * off);
    const len = r.range(0.26, 0.31);
    // Fanned a little outwards, like sticks pushed into soft ash.
    rod(p, base, [Math.sin(a) * r.range(0.05, 0.16), 0, -Math.cos(a) * r.range(0.05, 0.16)], [
      [len * 0.4, COL.stick, 'wood', 0.018],
      [len * 0.52, COL.paste, 'wood', 0.024],
      [0.02, OFFERING.ember, 'glow', 0.026],
      [0.012, COL.hot, 'glow', 0.016],
    ]);
  }
}

/** A candle standing in a brass cup: red wax, a drip, a wick and a two-tone flame. */
function candle(p: PieceBuilder, r: Rng, x: number, y: number, z: number, h: number, flames: Flames, wax: number = COL.wax[0]): void {
  p.voxels.box(x, y + 0.0175, z, 0.085, 0.035, 0.085, COL.brass, 'brass');
  p.voxels.box(x, y + 0.037, z, 0.097, 0.008, 0.097, COL.gold, 'brass');
  const w = h > 0.12 ? 0.062 : 0.05;
  p.voxels.box(x, y + 0.015 + h / 2, z, w, h, w, wax, 'wax');
  const side = r.chance(0.5) ? 1 : -1;
  p.voxels.box(x + (side * w) / 2, y + 0.015 + h * 0.7, z + w * 0.2, 0.014, h * 0.35, 0.016, wax, 'wax', { shade: 1.12 });
  const top = y + 0.015 + h;
  p.voxels.box(x, top + 0.006, z, 0.008, 0.012, 0.008, COL.wick, 'wood');
  p.voxels.box(x, top + 0.024, z, 0.03, 0.03, 0.03, OFFERING.ember, 'glow');
  p.voxels.box(x, top + 0.05, z, 0.02, 0.028, 0.02, OFFERING.flame, 'glow');
  p.voxels.box(x, top + 0.07, z, 0.01, 0.014, 0.01, COL.flameCore, 'glow');
  flames.push(new Vector3(x, top + 0.04, z));
}

/** A heap of marigold heads — round puffs (a squat block crowned by a smaller turned one), orange and yellow. */
function marigolds(p: PieceBuilder, r: Rng, x: number, y: number, z: number, n: number, spread: number): void {
  const tones = [...OFFERING.marigold, ...FLOWER.yellow];
  for (let i = 0; i < n; i++) {
    const a = r.range(0, Math.PI * 2);
    const d = spread * Math.sqrt(r());
    const s = r.range(0.042, 0.054);
    const [hx, hy, hz] = [x + Math.cos(a) * d, y + (i >= n - 2 ? s * 0.55 : 0), z + Math.sin(a) * d];
    const ry = r.range(0, Math.PI);
    const tone = r.pick(tones);
    p.voxels.box(hx, hy + s * 0.3, hz, s, s * 0.6, s, tone, 'petal', { ry });
    p.voxels.box(hx, hy + s * 0.68, hz, s * 0.7, s * 0.3, s * 0.7, tone, 'petal', { ry: ry + Math.PI / 4 });
  }
}

/** Two lotus buds laid on the slab: a green stem, then the bud swelling and closing to a pink point. */
function lotusBuds(p: PieceBuilder, r: Rng, x: number, y: number, z: number): void {
  for (let i = 0; i < 2; i++) {
    const ry = r.range(-0.4, 0.4) + i * 0.6;
    rod(p, new Vector3(x + i * 0.05, y + 0.028, z - i * 0.07), [0, ry, -Math.PI / 2], [
      [0.1, LEAF.bright[2], 'leaves', 0.014],
      [0.02, FLOWER.lotus[1], 'petal', 0.042],
      [0.035, FLOWER.lotus[0], 'petal', 0.052],
      [0.025, FLOWER.lotus[0], 'petal', 0.04],
      [0.02, FLOWER.lotus[2], 'petal', 0.024],
    ]);
  }
}

/** Joss-stick sized banana-leaf plate with a pile of marigolds (a simple baysei). */
function leafPlate(p: PieceBuilder, r: Rng, x: number, y: number, z: number): void {
  p.voxels.box(x, y + 0.006, z, 0.22, 0.012, 0.13, OFFERING.banana[0], 'leaves', { ry: r.range(-0.3, 0.3) });
  marigolds(p, r, x, y + 0.012, z, 6, 0.045);
}

interface Altar {
  /** Top of the slab (texels). */
  top: number;
  /** The plinth's ledge, where moss gathers (texels; 0 = none). */
  ledge: number;
}

/** Solid altar: a plinth course, a recessed course in shadow, a thick top slab. */
function solidAltar(m: Mason, hx: number, hz: number, [plinth, body, slab]: number[]): Altar {
  m.ring(hx, hz, 0, plinth, 3, 0, [3, 6], { moss: 1.3 });
  m.block(-hx + 3, 0, -hz + 3, hx - 3, plinth, hz - 3);
  m.ring(hx - 1, hz - 1, plinth, plinth + body, 3, 1, [3, 6], { moss: 0.8 });
  m.block(-hx + 4, plinth, -hz + 4, hx - 4, plinth + body, hz - 4);
  return { top: topSlab(m, hx, hz, plinth + body, slab), ledge: plinth };
}

/** Two rows of thick slabs, their joints staggered; kept fairly clean where the offerings stand. Returns the top. */
function topSlab(m: Mason, hx: number, hz: number, y: number, h: number): number {
  m.runX(-hx, hx, y, y + h, 0, hz, [4, 6], { moss: 0.6 });
  m.runX(-hx, hx, y, y + h, -hz, 0, [4, 7], { moss: 0.6 });
  return y + h;
}

/** A slab table on four short, thick legs. */
function tableAltar(m: Mason, hx: number, hz: number, [legs, slab]: number[]): Altar {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.block(sx < 0 ? -hx + 1 : hx - 4, 0, sz < 0 ? -hz + 1 : hz - 4, sx < 0 ? -hx + 4 : hx - 1, legs, sz < 0 ? -hz + 4 : hz - 1, { moss: 1.4 });
  return { top: topSlab(m, hx, hz, legs, slab), ledge: 0 };
}

/** An altar with a dark niche in its front course, under a lintel course and the slab. */
function nicheAltar(m: Mason, hx: number, hz: number, [plinth, niche, lintel, slab]: number[]): Altar {
  m.ring(hx, hz, 0, plinth, 3, 0, [4, 7], { moss: 1.3 });
  m.block(-hx + 3, 0, -hz + 3, hx - 3, plinth, hz - 3);
  const y = plinth;
  const nw = Math.max(2, hx - 4);
  m.block(-hx + 4, y, -hz + 4, hx - 4, y + niche + lintel, hz - 4, { tones: SHRINE_CAVITY, moss: 0 });
  m.ring(hx - 1, hz - 1, y, y + niche, 3, 1, [4, 7], { moss: 0.9 }, { front: [-nw, nw] });
  m.ring(hx - 1, hz - 1, y + niche, y + niche + lintel, 3, 0, [5, 8], { moss: 0.8 });
  return { top: topSlab(m, hx, hz, y + niche + lintel, slab), ledge: plinth };
}

const HX = 10;
const HZ = 6;
/** Courses of each altar, bottom up (texels): its default height and how a new height is shared out. */
const COURSES: Record<string, number[]> = { incense: [4, 4], candles: [2, 4, 1, 2], solid: [3, 3, 3] };

/** An integer height shared out in proportion to `w`, each part at least one texel. */
function split(total: number, w: number[]): number[] {
  const sum = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  let prev = 0;
  return w.map((x) => {
    acc += x;
    const next = Math.round((acc * total) / sum);
    const part = Math.max(1, next - prev);
    prev = next;
    return part;
  });
}

function build(variant: string, seed: number, height?: number): KitPiece {
  const p = new PieceBuilder();
  const r = rng(seed * 31 + 7);
  const m = new Mason({ seed, moss: variant === 'plain' ? 0.6 : 0.5, stain: 0.25 });
  const g = p.voxels.grid({ cell: T, origin: [0, 0, 0], mat: 'sandstone', jitter: 0.05, ao: 0.3, seed });
  const courses = COURSES[variant] ?? COURSES.solid;
  const base = courses.reduce((a, b) => a + b, 0);
  // `height` sets the slab top; the footprint grows with it.
  const H = height ? Math.max(4, Math.round(height / T)) : base;
  const k = H / base;
  const s = (n: number) => Math.max(1, Math.round(n * k));
  const hx = Math.max(5, s(HX));
  const hz = Math.max(4, s(HZ));
  const c = split(H, courses);
  const altar = variant === 'incense' ? tableAltar(m, hx, hz, c) : variant === 'candles' ? nicheAltar(m, hx, hz, c) : solidAltar(m, hx, hz, c);
  const top = altar.top * T;
  const [X, Z] = [hx * T, hz * T];
  const jig = () => r.range(-0.025, 0.025);
  const flames: Flames = [];

  if (variant === 'plain') {
    // Two stone offering cups, one still holding a few faded marigolds.
    socketStone(m, g, -s(5), altar.top, -s(2), 2, 2, 0.6);
    socketStone(m, g, s(4), altar.top, s(1), 2, 2, 0.6);
    marigolds(p, r, -s(5) * T, top + T, -s(2) * T, 4, 0.02);
  } else if (variant === 'incense') {
    // A saffron cloth hanging over the front edge, the bowl of joss sticks on it,
    // stone cups at both ends.
    const cw = 0.5;
    p.voxels.box(0, top + 0.006, 0.03, cw, 0.012, Z * 2 - 0.06, COL.saffron[0], 'petal');
    p.voxels.box(0, top - 0.054, Z + 0.006, cw, 0.132, 0.012, COL.saffron[1], 'petal');
    incensePot(p, r, jig(), top + 0.012, -0.04 + jig(), 5);
    socketStone(m, g, -hx + 3, altar.top, -s(2), 2, 2, 0.6);
    socketStone(m, g, hx - 3, altar.top, s(1), 2, 2, 0.6);
  } else if (variant === 'candles') {
    candle(p, r, -0.08 + jig(), top, 0.05 + jig(), 0.15, flames);
    candle(p, r, 0.1 + jig(), top, 0.12 + jig(), 0.1, flames, OFFERING.candle[1]);
    candle(p, r, 0.24 + jig(), top, -0.08 + jig(), 0.12, flames, COL.wax[1]);
    // A clay brazier pot and a stone cup.
    p.voxels.box(-X + 0.2, top + 0.05, -0.12, 0.16, 0.1, 0.16, COL.clay, 'wood');
    p.voxels.box(-X + 0.2, top + 0.1, -0.12, 0.12, 0.01, 0.12, SHRINE_CAVITY[0], 'wood');
    socketStone(m, g, hx - 3, altar.top, -s(2), 2, 2, 0.6);
  } else {
    // The full altar: joss sticks at the back, candles, a dish of marigolds,
    // lotus buds and a banana-leaf plate.
    incensePot(p, r, 0.02 + jig(), top, -0.14 + jig(), r.int(3, 5));
    candle(p, r, 0.3 + jig(), top, 0.1 + jig(), 0.13, flames);
    candle(p, r, 0.44 + jig(), top, -0.1 + jig(), 0.1, flames, COL.wax[1]);
    p.voxels.box(-0.34, top + 0.012, -0.08, 0.2, 0.024, 0.2, COL.gold, 'brass');
    marigolds(p, r, -0.34, top + 0.024, -0.08, 9, 0.06);
    lotusBuds(p, r, -0.2 + jig(), top, 0.2);
    leafPlate(p, r, 0.08 + jig(), top, 0.2 + jig());
  }

  // Candles light the altar top a little (one light for the whole altar), from a
  // little above the flames so the slab takes a soft glow rather than an orange spot.
  if (flames.length) {
    const c = flames.reduce((a, v) => a.add(v), new Vector3()).divideScalar(flames.length);
    const light = new PointLight(0xffa24a, 0.04 * flames.length, 1.5, 2);
    light.position.set(c.x, c.y + 0.2, c.z);
    light.name = 'offering-candles';
    p.extras.push(light);
  }

  // Chipped edges below the slab first, so the moss below follows the worn stone.
  m.set.erode(0.1, seed + 5, { where: (_x, y) => y < top - T });
  // Moss cushions on the plinth ledge (not in front of the niche, which would hide it)
  // and here and there along the outer texel of the slab, clear of the offerings.
  if (altar.ledge) mossCushions(g, m, [-hx - 1, hx + 1, 1, altar.ledge + 1, -hz - 1, variant === 'candles' ? hz - 2 : hz + 1], 0.7, seed + 3);
  // (the front edge leaves room for the incense table's hanging cloth, 0.5 m wide)
  const front = variant === 'incense' ? [[-hx, -5], [4, hx - 1]] : [[-hx, hx - 1]];
  for (const [i0, i1, k0, k1] of [...front.map(([a, b]) => [a, b, hz - 1, hz - 1]), [-hx, hx - 1, -hz, -hz], [-hx, -hx, -hz, hz - 1], [hx - 1, hx - 1, -hz, hz - 1]])
    mossCushions(g, m, [i0, i1, altar.top - 1, altar.top, k0, k1], 0.55, seed + 5);
  // Streaks of moss down the slab's edge and the plinth below it (in half-texel cells, like the stones' scale).
  const moss = new MossLayer(p, seed, (x, y, z) => m.set.solidAt(x, y, z), T / 2);
  for (let x = -X + 0.08; x < X - 0.05; x += r.range(0.12, 0.3)) if (r.chance(0.6)) moss.drip('x', x, top, Z, 1, 3);
  for (let z = -Z + 0.08; z < Z - 0.05; z += r.range(0.12, 0.3)) if (r.chance(0.5)) moss.drip('z', z, top, X, 1, 3);
  if (altar.ledge) for (let x = -X + 0.08; x < X - 0.05; x += r.range(0.12, 0.3)) if (r.chance(0.4)) moss.drip('x', x, altar.ledge * T, Z, 1, 2);
  moss.commit();
  pores(p, m.set, seed, PORES, () => true, T / 2);
  joints(p, m.set, seed);
  m.set.emit(p.voxels, { seed, jitter: 0.09 });
  g.commit();
  p.collider(-X, 0, -Z, X, top, Z);
  return p.done();
}

export default defineKitAsset({
  section: '20',
  order: 5,
  name: 'Offering platform',
  caption: 'Stone platform for offerings.',
  size: {
    real: '1.25 × 0.75 m, 0.5–0.56 m high; joss sticks 0.3 m, candles 0.1–0.15 m',
    sheet: 'not given',
    note: 'Altars in front of Angkor’s shrines and Buddhas are knee to thigh high, about a stride long; offerings are at their real size.',
  },
  variants: [
    { id: 'full', name: 'Incense, candles, flowers' },
    { id: 'plain', name: 'Plain altar' },
    { id: 'incense', name: 'Incense table' },
    { id: 'candles', name: 'Candle altar' },
  ],
  ref: { sheet: 'section 20/6706F03E-0DFA-4AFA-80F0-5C031D4F49D5.PNG', box: [1230, 88, 1520, 398] },
  build: ({ variant, seed, height }) => build(variant, seed, height),
});
