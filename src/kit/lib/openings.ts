import { hash3, valueNoise3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { fromSheet } from '../palette';
import type { PieceBuilder } from '../PieceBuilder';
import { here, rng, snap, TEXEL, type Rng } from '../shapes';
import { stoneSurf, type StoneFinish } from '../surface';
import { DryMasonry, FACE, finishLook, type Box6, type Stone, type StoneLook } from './gallery';

/**
 * §21.2 openings — the temple's pillars, baluster windows and door frames, as
 * the §21 sheet draws them (weathered warm sandstone, stepped moulded bases
 * and capitals carved with key frets, moss on the tops) at Angkor Wat's real
 * sizes (docs/kit-work/SIZES-ARCH.md §1.4–1.6):
 *
 *  - {@link pillar}: a square gallery pillar (0.5 m shaft, 3.75 m in all, a
 *    stepped base and capital a step wider) or a round column (⌀ 0.5 m,
 *    terraces and causeway), with carved bands; {@link pilaster}: the same
 *    pier engaged in a wall face.
 *  - {@link balusterWindow}: a moulded stone frame filling a hole cut through
 *    a wall, a sill ledge under it, a drip band over it, and a row of lathe-
 *    turned balusters nearly touching (7 in the standard 1.375 × 1.625 m
 *    opening, 0.1875 m apart) a quarter of the wall in from its front face,
 *    open or blind (balusters half sunk in the back of the recess under a
 *    carved, half-lowered stone blind).
 *  - {@link doorFrame}: jambs lining the passage, a threshold, front and back
 *    lintels, and on the faces a carved surround about three times the clear
 *    width: octagonal colonnettes carrying a proud carved lintel, flanked by
 *    pilasters. Small / standard / main sizes (1.0 × 2.0625, 1.25 × 2.5,
 *    1.75 × 3.375 m clear). Open, or a false door of carved stone leaves.
 *
 * Placement contract (metres, piece space, front = +Z):
 *  - The wall runs along X; its faces are at z = `z` ± `wall`/2 (default
 *    z = 0, wall 1.0). The opening is centred on x = `x` (default 0).
 *  - Window: `sill` is the height of the clear opening's bottom (the top of the
 *    sill stone, where the balusters stand; default 0.5 above y = 0, the
 *    gallery floor). Door: `y` is the floor at the door (default 0); the
 *    threshold stands on it and the clear height is measured from the
 *    threshold's top.
 *  - The caller leaves the box {@link windowCut} / {@link doorCut} empty — a
 *    hole through the whole wall — and these functions fill it (frame, sill,
 *    lintels, reveals), then add mouldings standing proud of the wall faces
 *    around it (never inside the wall's volume). {@link windowExtent} /
 *    {@link doorExtent} give how far those reach along X, up and out, so the
 *    caller can keep its own pilasters, plinth mouldings and grass clear.
 *  - A door's surround stands on the floor in front of the face: the floor
 *    must reach {@link doorExtent}`.proud` out from the wall face.
 *  - Colliders: a window fills its cut (not walkable); a door keeps its clear
 *    opening free from the threshold's top to the lintel (the explorer's
 *    0.64 m capsule fits even the small door), the threshold is a 0.125 m step.
 *  - Stones go into `mason` when given (the wall's own DryMasonry, so the
 *    joints between wall and frame read as joints; the caller emits it), else
 *    into a masonry of their own, emitted at once. Balusters, colonnettes,
 *    carvings and moss go straight into the piece. Pass the wall's `look`
 *    (finishLook) so frame and wall are one stone; the default is
 *    {@link OPENING_FINISH}.sheet, sampled off the §21 sheet.
 *  - Pillars: centred on (x, z), standing on y; {@link PillarResult}.top is
 *    the capital's top (an architrave's seat). Pilasters: on the wall face at
 *    z, looking +Z (`side` 1) or −Z (−1); {@link pilasterGrow} gives how far
 *    their base and capital overhang.
 *  - Also shared: {@link carve} / {@link GLYPH} (the sheet's key spirals,
 *    frets, petals, rosettes as shallow carvings), {@link turned} /
 *    {@link balusterProfile} (lathe-turned stone), {@link mossTops}.
 *
 * ```ts
 * const p = new PieceBuilder();
 * const m = new DryMasonry(seed);
 * const holes = [windowCut({ x: 2, sill: 1.5 }), doorCut({ x: -2, y: 1.0 })]; // [x0, y0, z0, x1, y1, z1]
 * // …lay the wall's courses around the holes into m (spansOf / DryMasonry.course),
 * //   keeping plinth mouldings off doorExtent({ x: -2, y: 1.0 })…
 * balusterWindow(p, { x: 2, sill: 1.5, seed, mason: m, look });
 * doorFrame(p, { x: -2, y: 1.0, size: 'standard', seed, mason: m, look });
 * pilaster(p, { x: 0, z: 0.5, y: 1.0, height: 4.0, seed, mason: m, look }); // on the front face
 * pillar(p, { x: 0, z: 2.5, y: 1.0, seed });                               // colonnade in front
 * m.emit(p.voxels);
 * ```
 */

const T = TEXEL;
/** A hair (1/64 m): the step between parts that would otherwise share a face plane. */
const HAIR = T / 4;

/** Kit standard sizes (SIZES-ARCH §1.4–1.6), metres. */
export const OPENINGS = {
  /** A gallery wall, the frames' default depth. */
  wall: 1.0,
  pillar: { width: 0.5, height: 3.75, base: 0.5, capital: 0.5625 },
  window: { width: 1.375, height: 1.625, frame: 0.1875, sill: 0.5, spacing: 0.1875 },
  door: {
    small: { width: 1.0, height: 2.0625 },
    standard: { width: 1.25, height: 2.5 },
    main: { width: 1.75, height: 3.375 },
    jamb: 0.25,
    lintel: 0.5,
    threshold: 0.125,
  },
} as const;

export type DoorSize = 'small' | 'standard' | 'main';
export type StoneLookFn = (x: number, y: number, z: number) => StoneLook;

/**
 * The §21 sheet's stone, sampled off its pillar, window and door (fromSheet of
 * lit faces): lighter and pinker than the §19.1 warm finish, stone to stone
 * from sand to rose, speckled, a little lichen. `aged` is the same stone
 * darker and greyer under grime, lichen and moss (ruins, weathered variants).
 */
export const OPENING_FINISH = {
  sheet: {
    palette: [0xd6a874, 0xcfa070, 0xdcb282, 0xcb9c72, 0xd4ac7e, 0xd9a874].map(fromSheet),
    surf: stoneSurf({ stain: 0.28, lichen: 0.05, moss: 0.04 }),
    wear: 0.1,
  },
  aged: {
    palette: [0xa98664, 0x9e7c5e, 0xb08e6c, 0x977a60, 0xa6865f].map(fromSheet),
    surf: stoneSurf({ stain: 0.55, lichen: 0.2, moss: 0.2, crack: 0.1 }),
    wear: 0.3,
  },
} satisfies Record<string, StoneFinish>;

/** Shared options: the stone and how the parts join the caller's piece. */
export interface OpeningStyle {
  seed: number;
  /** Finish of the stones (default {@link OPENING_FINISH}.sheet; any §19.1 `STONE_FINISH`). */
  finish?: StoneFinish;
  /** Look of each stone (default `finishLook(finish, seed)` with a little moss). Pass the wall's own so frame and wall match. */
  look?: StoneLookFn;
  /** Lay the stones into this masonry (the caller emits it); default: a masonry of their own, emitted at once. */
  mason?: DryMasonry;
  /** Moss cushions on the ledges and tops (0‥1, default 0.35). */
  moss?: number;
  /** Add colliders (default true). */
  colliders?: boolean;
}

/** Sheet-sampled tones (fromSheet): the carvings' dark recesses and the yellow-olive moss of the §21 sheet. */
const CARVE = [0x5a4232, 0x523c2e, 0x614836].map(fromSheet);
const MOSS_LIT = [0xa78a3f, 0x9d842d, 0xb09a52, 0x8f8a3a].map(fromSheet);
const MOSS_DEEP = [0x6e6a2e, 0x5f5a28, 0x756431].map(fromSheet);

/** A stone top that moss settles on: x0‥x1 × z0‥z1 at y, less `inner` (what stands on it); `edges` = FACE bits of its free edges. */
export interface MossTop {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y: number;
  inner?: [number, number, number, number];
  edges: number;
}

interface Ctx {
  p: PieceBuilder;
  m: DryMasonry;
  own: boolean;
  look: StoneLookFn;
  f: StoneFinish;
  seed: number;
  moss: number;
  tops: MossTop[];
  colliders: boolean;
}

function context(p: PieceBuilder, o: OpeningStyle): Ctx {
  const f = o.finish ?? OPENING_FINISH.sheet;
  return {
    p,
    m: o.mason ?? new DryMasonry(o.seed),
    own: !o.mason,
    look: o.look ?? finishLook(f, o.seed, { moss: 0.12 }),
    f,
    seed: o.seed,
    moss: o.moss ?? 0.35,
    tops: [],
    colliders: o.colliders ?? true,
  };
}

/** Emit the context's own masonry and the moss. */
function finish(c: Ctx): void {
  if (c.own) c.m.emit(c.p.voxels);
  if (c.moss > 0) mossTops(c.p, c.tops, c.moss, c.seed);
}

/* ------------------------------------------------------------------------ */
/* Carvings                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Glyphs of the sheet's carvings, rows from the top ('#' = cut texel): the
 * key spirals on its base and capital blocks, a running fret, lotus petals.
 */
export const GLYPH = {
  /** Square key spiral, the sheet's hooks on its big base and capital blocks (7 × 7). */
  key: ['#######', '......#', '#####.#', '#...#.#', '#.###.#', '#.....#', '#######'],
  /** A smaller key for narrower bands (5 × 5). */
  small: ['#####', '....#', '###.#', '#...#', '#####'],
  /** One period of a running fret (a square wave), tiled along a band. */
  fret: ['###.', '#.#.', '#.##'],
  /** One lotus petal hanging from a line (scallops under a capital). */
  petal: ['####', '#..#', '.##.'],
  /** A four-petalled rosette (bosses, false-door panels). */
  rosette: ['.#.#.', '#...#', '..#..', '#...#', '.#.#.'],
  /** A niche with a seated hermit in it: the foot of Angkor Wat's pillar shafts. */
  niche: ['..##..', '.####.', '##..##', '##..##', '#....#', '#....#', '#.##.#', '#....#', '######'],
} as const;

/** Size of a carving's bit: half a texel. */
const C = T / 2;

/** Is this FACE bit a face whose rightward direction (seen from outside) runs towards −X or −Z? */
const mirrored = (face: number) => face === FACE.nz || face === FACE.px;

/**
 * Carve a bitmap into a vertical face: dark plates a hair proud of the face
 * (a real cut would split the stone into cells), without rims, so they read
 * as recesses. `u` is the glyph's centre along the face (x on ±z faces, z on
 * ±x faces), `top` its top edge; `cell` the size of one bit (default half a
 * texel: the sheet's carvings are fine lines).
 */
export function carve(v: VoxelBuilder, face: number, plane: number, u: number, top: number, bits: readonly string[], seed: number, cell = C): void {
  const w = Math.max(...bits.map((r) => r.length));
  const flip = mirrored(face);
  const alongZ = face === FACE.px || face === FACE.nx;
  const out = face === FACE.pz || face === FACE.px ? 1 : -1;
  const src = here();
  bits.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== '#') continue;
      let e = c;
      while (e + 1 < row.length && row[e + 1] === '#') e++;
      // (glyphs read left to right as seen from outside the face)
      const a = flip ? u + (w / 2 - e - 1) * cell : u + (c - w / 2) * cell;
      const b = a + (e - c + 1) * cell;
      const y1 = top - r * cell;
      const n0 = plane;
      const n1 = plane + out * HAIR;
      const tone = CARVE[Math.floor(hash3(r, c, Math.round(u * 16), seed) * CARVE.length)];
      if (alongZ) v.span(n0, y1 - cell, a, n1, y1, b, tone, 'sandstone', { open: face, shade: 0.9, src });
      else v.span(a, y1 - cell, n0, b, y1, n1, tone, 'sandstone', { open: face, shade: 0.9, src });
      c = e;
    }
  });
}

/** A glyph repeated along a band `width` long (a bit's margin at each end), centred on u, its middle at `yMid`. */
function band(v: VoxelBuilder, face: number, plane: number, u: number, yMid: number, width: number, unit: readonly string[], seed: number): void {
  const count = Math.floor((width / C - 2) / unit[0].length);
  if (count < 1) return;
  carve(v, face, plane, u, yMid + (unit.length * C) / 2, unit.map((r) => r.repeat(count)), seed);
}

/** The four vertical faces of a box, as [face bit, plane, centre along it, width along it]. */
function facesOf(b: Box6, which = FACE.px | FACE.nx | FACE.pz | FACE.nz): [number, number, number, number][] {
  const cx = (b[0] + b[3]) / 2;
  const cz = (b[2] + b[5]) / 2;
  const out: [number, number, number, number][] = [];
  if (which & FACE.pz) out.push([FACE.pz, b[5], cx, b[3] - b[0]]);
  if (which & FACE.nz) out.push([FACE.nz, b[2], cx, b[3] - b[0]]);
  if (which & FACE.px) out.push([FACE.px, b[3], cz, b[5] - b[2]]);
  if (which & FACE.nx) out.push([FACE.nx, b[0], cz, b[5] - b[2]]);
  return out;
}

/* ------------------------------------------------------------------------ */
/* Turned stone: balusters, colonnettes, round columns                       */
/* ------------------------------------------------------------------------ */

/** One section of a lathe-turned part: its height and diameter (metres), square or round. */
export interface Turn {
  h: number;
  d: number;
  square?: boolean;
}

/**
 * A lathe-turned part standing at (x, z) from y0: its sections stacked, each
 * round one cut as crossed boxes (two for slim ones, an octagon of four from
 * 0.25 m up — Khmer colonnettes and columns are octagonal) so it reads round
 * from every side. The crossing boxes are trimmed a hair at their ends so no
 * two share a face plane. `look`
 * gives the stone at a height (one stone: return the same look); the necks
 * shade a little darker than the rings, as a turned profile does.
 */
export function turned(v: VoxelBuilder, x: number, z: number, y0: number, parts: readonly Turn[], look: (y: number) => StoneLook): number {
  const src = here();
  const dmax = Math.max(...parts.map((s) => s.d));
  let y = y0;
  parts.forEach((s) => {
    const l = look(y + s.h / 2);
    const turn = s.square ? 1 : 0.9 + 0.12 * (s.d / dmax);
    const put = (wx: number, wz: number, e: number, shade = 1, ry = 0) =>
      v.box(x, y + s.h / 2, z, wx, Math.max(HAIR, s.h - 2 * e), wz, l.color, 'sandstone', { shade: (l.shade ?? 1) * shade * turn, surf: l.surf, src, ...(ry ? { ry } : {}) });
    if (s.square) put(s.d, s.d, 0);
    else if (s.d >= 0.25 - 1e-6) {
      // An octagon: two boxes square to the axes, two turned 45°.
      const side = s.d * Math.tan(Math.PI / 8);
      put(s.d, side, 0);
      put(side, s.d, HAIR / 4);
      put(s.d, side, HAIR / 2, 0.96, Math.PI / 4);
      put(s.d, side, (3 * HAIR) / 4, 0.96, -Math.PI / 4);
    } else {
      const narrow = Math.max(T / 2, snap(s.d * 0.6, T / 4));
      put(s.d, narrow, 0);
      put(narrow, s.d, HAIR / 2, 0.97);
    }
    y += s.h;
  });
  return y;
}

/**
 * The profile of a window baluster `h` tall whose rings are `d` across: a
 * square foot and head, and between them, mirrored about the middle, a ring,
 * a bulb, ring groups on slim necks and a big central bulb — the sheet's
 * stacked beads. The necks stretch to fit the height.
 */
export function balusterProfile(h: number, d: number): Turn[] {
  const neck = d * 0.6;
  const bulb = d * 0.86;
  const half: Turn[] = [
    { h: T, d, square: true },
    { h: T, d },
    { h: T, d: neck },
    { h: 2 * T, d: bulb },
    { h: T, d: neck },
    { h: T, d },
    { h: 0, d: neck }, // (stretches)
    { h: T, d },
    { h: T, d: neck },
    { h: 2 * T, d },
  ];
  const fixed = 2 * half.reduce((a, s) => a + s.h, 0);
  const stretch = Math.max(0, h - fixed) / 2;
  half[6].h = stretch;
  const top = [...half].reverse();
  // (the two halves of the central bulb make one section)
  const mid: Turn = { h: half[9].h * 2, d };
  return [...half.slice(0, 9), mid, ...top.slice(1)].filter((s) => s.h > 1e-6);
}

/* ------------------------------------------------------------------------ */
/* Pillars and pilasters                                                     */
/* ------------------------------------------------------------------------ */

export interface PillarOptions extends OpeningStyle {
  /** Centre of the footprint (default 0, 0) and the floor it stands on (default 0). */
  x?: number;
  z?: number;
  y?: number;
  /** Overall height, base to the top of the capital (default 3.75 m). */
  height?: number;
  /** Shaft width, or diameter of a round column (default 0.5 m). */
  width?: number;
  /** Square gallery pillar (default) or round column. */
  shape?: 'square' | 'round';
  /** Key frets on the base and capital, carved bands on the shaft (default true). */
  carved?: boolean;
  /** Age (0‥1): chipped arrises, a split drum (square pillars). */
  weathered?: number;
  /** Something rests on the capital (an architrave, a cornice): no moss up there. */
  capped?: boolean;
}

export interface PillarResult {
  /** Height of the capital's top (where an architrave sits). */
  top: number;
  /** Width of the capital's top (square). */
  capital: number;
}

/** One tier of a pillar: its width over the shaft, its height, stones per side, glyph. */
interface Tier {
  grow: number;
  h: number;
  split: 1 | 2;
  glyph?: 'key' | 'fret';
}

/** The sheet's stepped base and capital: tiers stepping out a texel or two, the big ones carved. */
const BASE: Tier[] = [
  { grow: 0.375, h: 0.25, split: 2, glyph: 'key' },
  { grow: 0.25, h: 0.1875, split: 1, glyph: 'fret' },
  { grow: 0.125, h: 0.0625, split: 1 },
];
const CAPITAL: Tier[] = [
  { grow: 0.0625, h: 0.0625, split: 1 },
  { grow: 0.1875, h: 0.1875, split: 1, glyph: 'fret' },
  { grow: 0.375, h: 0.25, split: 2, glyph: 'key' },
  // (the seat of the architrave: a plate a step in from the abacus)
  { grow: 0.125, h: 0.0625, split: 1 },
];

/**
 * A free-standing pillar (square) or column (round), with its colliders (the
 * base, the shaft and the capital as three boxes). Returns the capital's top.
 */
export function pillar(p: PieceBuilder, o: PillarOptions): PillarResult {
  const c = context(p, o);
  const res = o.shape === 'round' ? roundColumn(c, o) : squarePillar(c, o);
  finish(c);
  return res;
}

function squarePillar(c: Ctx, o: PillarOptions): PillarResult {
  const [x, z, y0] = [o.x ?? 0, o.z ?? 0, o.y ?? 0];
  const w = snap(o.width ?? OPENINGS.pillar.width);
  const H = snap(Math.max(1.5, o.height ?? OPENINGS.pillar.height));
  const carved = o.carved ?? true;
  const wear = o.weathered ?? 0;
  const v = c.p.voxels;
  const box = (grow: number, ya: number, yb: number): Box6 => [x - (w + grow) / 2, ya, z - (w + grow) / 2, x + (w + grow) / 2, yb, z + (w + grow) / 2];
  const shaftStones: Stone[] = [];
  const capStones: Stone[] = [];
  let y = y0;
  // Base: tiers stepping in, each carved on all four faces.
  BASE.forEach((t, i) => {
    const b = box(t.grow, y, y + t.h);
    tier(c, b, t.split, FACE.ny);
    if (carved) tierGlyphs(v, b, t, c.seed + i);
    const next = i + 1 < BASE.length ? BASE[i + 1].grow : 0;
    c.tops.push({ x0: b[0], z0: b[2], x1: b[3], z1: b[5], y: y + t.h, inner: [x - (w + next) / 2, z - (w + next) / 2, x + (w + next) / 2, z + (w + next) / 2], edges: 63 });
    y += t.h;
  });
  const baseTop = y;
  const capH = CAPITAL.reduce((a, t) => a + t.h, 0);
  const shaftTop = y0 + H - capH;
  // Shaft: three drums (a monolith would pass Angkor's 1.5 t stones), joints on the texel grid.
  const n = Math.max(1, Math.round((shaftTop - baseTop) / 0.95));
  for (let i = 0; i < n; i++) {
    const ya = i ? snap(baseTop + ((shaftTop - baseTop) * i) / n) : baseTop;
    const yb = i < n - 1 ? snap(baseTop + ((shaftTop - baseTop) * (i + 1)) / n) : shaftTop;
    shaftStones.push(...c.m.course(box(0, ya, yb), { length: [w, w], closed: FACE.ny | FACE.py, look: c.look }));
  }
  if (carved) shaftBands(v, box(0, baseTop, shaftTop), c.seed);
  // Capital: tiers stepping out (their undersides overhang), the widest one carved, the seat plate on top.
  y = shaftTop;
  CAPITAL.forEach((t, i) => {
    const b = box(t.grow, y, y + t.h);
    capStones.push(...tier(c, b, t.split, i && CAPITAL[i - 1].grow >= t.grow ? FACE.ny : 0));
    if (carved) tierGlyphs(v, b, t, c.seed + 11 + i);
    const next = CAPITAL[i + 1]?.grow ?? -1;
    if (next < t.grow && !(o.capped && next < 0)) {
      const g = Math.max(0, next);
      c.tops.push({ x0: b[0], z0: b[2], x1: b[3], z1: b[5], y: y + t.h, inner: next >= 0 ? [x - (w + g) / 2, z - (w + g) / 2, x + (w + g) / 2, z + (w + g) / 2] : undefined, edges: 63 });
    }
    y += t.h;
  });
  const capW = w + Math.max(...CAPITAL.map((t) => t.grow));
  weather(c, wear, shaftStones, capStones);
  if (c.colliders) {
    const bw = w + BASE[0].grow;
    c.p.collider(x - bw / 2, y0, z - bw / 2, x + bw / 2, baseTop, z + bw / 2);
    c.p.collider(x - w / 2, baseTop, z - w / 2, x + w / 2, shaftTop, z + w / 2);
    c.p.collider(x - capW / 2, shaftTop, z - capW / 2, x + capW / 2, y, z + capW / 2);
  }
  return { top: y, capital: w + CAPITAL[CAPITAL.length - 1].grow };
}

/** Lay one tier: a single stone, or two by two stones (front and back halves along z). */
function tier(c: Ctx, b: Box6, split: 1 | 2, closed: number, face = FACE.pz): Stone[] {
  const w = b[3] - b[0];
  if (split === 1) return c.m.course(b, { length: [w, w], closed, face, look: c.look });
  const zm = snap((b[2] + b[5]) / 2);
  return [
    ...c.m.course([b[0], b[1], zm, b[3], b[4], b[5]], { length: [w / 2, w / 2], closed: closed | FACE.nz, face: FACE.pz, look: c.look }),
    ...c.m.course([b[0], b[1], b[2], b[3], b[4], zm], { length: [w / 2, w / 2], closed: closed | FACE.pz, face: FACE.nz, look: c.look }),
  ];
}

/** Carve a tier's glyphs on the given faces: key spirals per stone on the big tiers, a fret along the others. */
function tierGlyphs(v: VoxelBuilder, b: Box6, t: Tier, seed: number, which?: number): void {
  if (!t.glyph) return;
  const h = b[4] - b[1];
  const yMid = (b[1] + b[4]) / 2;
  for (const [face, plane, u, width] of facesOf(b, which)) {
    if (t.glyph === 'fret') band(v, face, plane, u, yMid, width - 2 * C, GLYPH.fret, seed);
    else {
      const g = h >= 8 * C ? GLYPH.key : GLYPH.small;
      const top = yMid + (g.length * C) / 2;
      // One spiral per stone along the face (two a side on the split tiers).
      if (t.split === 2 && width >= 0.75) {
        carve(v, face, plane, u - width / 4, top, g, seed);
        carve(v, face, plane, u + width / 4, top, g, seed + 1);
      } else carve(v, face, plane, u, top, width >= (g[0].length + 4) * C ? g : GLYPH.small, seed);
    }
  }
}

/**
 * The shaft's carved bands, as on Angkor Wat's gallery pillars: at the foot a
 * framed panel with a small pointed niche (where the real ones hold a praying
 * hermit), under the capital a row of lotus petals.
 */
function shaftBands(v: VoxelBuilder, b: Box6, seed: number, which?: number): void {
  for (const [face, plane, u, width] of facesOf(b, which)) {
    const n = Math.round(width / C) - 4;
    if (n < 8) continue;
    // Foot panel: a frame line a texel in from the arrises round the niche.
    const nw = GLYPH.niche[0].length;
    const pad = (row: string) => {
      const l = Math.floor((n - 2 - nw) / 2);
      return '#' + '.'.repeat(l) + row + '.'.repeat(n - 2 - nw - l) + '#';
    };
    const rows = ['#'.repeat(n), pad('.'.repeat(nw)), ...GLYPH.niche.map(pad), pad('.'.repeat(nw)), '#'.repeat(n)];
    carve(v, face, plane, u, b[1] + (rows.length + 2) * C, rows, seed);
    // Lotus petals hanging under the capital.
    const k = Math.floor(n / 4);
    carve(v, face, plane, u, b[4] - C, GLYPH.petal.map((r) => r.repeat(k)), seed + 5);
  }
}

/** Age a pillar: chips knocked off the arrises of the shaft and capital, one drum split. */
function weather(c: Ctx, wear: number, shaft: Stone[], cap: Stone[]): void {
  if (wear <= 0) return;
  const r = rng(c.seed * 17 + 3);
  if (shaft.length > 1 && wear >= 0.5) c.m.crack(shaft[r.int(0, shaft.length - 1)], r.int(1, 1e6));
  for (const s of [...shaft, ...cap]) if (!s.crack && r.chance(wear * 0.6)) c.m.chip(s, r.int(1, 1e6));
}

function roundColumn(c: Ctx, o: PillarOptions): PillarResult {
  const [x, z, y0] = [o.x ?? 0, o.z ?? 0, o.y ?? 0];
  const d = snap(o.width ?? OPENINGS.pillar.width);
  const H = snap(Math.max(1.5, o.height ?? OPENINGS.pillar.height));
  const wear = o.weathered ?? 0;
  const v = c.p.voxels;
  // Square plinth and abacus as stones; the turned parts between them.
  const plinthW = d + 0.25;
  const plinth: Box6 = [x - plinthW / 2, y0, z - plinthW / 2, x + plinthW / 2, y0 + 0.25, z + plinthW / 2];
  const stones = tier(c, plinth, 1, FACE.ny);
  if (o.carved ?? true) tierGlyphs(v, plinth, { grow: 0, h: 0.25, split: 1, glyph: 'fret' }, c.seed);
  const abW = d + 0.375;
  const abH = 0.25;
  const turnTop = y0 + H - abH;
  const shaftH = turnTop - (y0 + 0.25) - 5 * T - 4 * T;
  // Rings in pairs at a third and two thirds, like the Terrace of Honour's columns.
  // (a short column keeps one plain drum)
  const drum = shaftH >= 1.125 ? snap(shaftH / 3) : shaftH;
  const ring = (dd: number): Turn[] => [
    { h: T, d: dd + 0.125 },
    { h: T, d: dd },
    { h: T, d: dd + 0.125 },
  ];
  const shaft: Turn[] =
    drum < shaftH ? [{ h: drum - 3 * T, d }, ...ring(d), { h: drum - 3 * T, d }, ...ring(d), { h: shaftH - 2 * drum, d }] : [{ h: shaftH, d }];
  const parts: Turn[] = [
    { h: 2 * T, d: d + 0.1875 },
    { h: T, d: d + 0.125 },
    { h: 2 * T, d: d + 0.0625 },
    ...shaft,
    { h: T, d: d + 0.0625 },
    { h: T, d: d + 0.125 },
    { h: 2 * T, d: d + 0.25 },
  ];
  // (one stone per drum: the look changes at the drum joints)
  const tones = (yy: number) => c.look(x, y0 + 0.25 + Math.min(2, Math.floor((yy - y0 - 0.25) / drum)) * drum, z);
  const top = turned(v, x, z, y0 + 0.25, parts, tones);
  const ab: Box6 = [x - abW / 2, top, z - abW / 2, x + abW / 2, top + abH, z + abW / 2];
  const cap = tier(c, ab, 1, 0);
  if (o.carved ?? true) tierGlyphs(v, ab, { grow: 0, h: abH, split: 1, glyph: 'fret' }, c.seed + 3);
  c.tops.push({ x0: plinth[0], z0: plinth[2], x1: plinth[3], z1: plinth[5], y: y0 + 0.25, inner: [x - (d + 0.1875) / 2, z - (d + 0.1875) / 2, x + (d + 0.1875) / 2, z + (d + 0.1875) / 2], edges: 63 });
  if (!o.capped) c.tops.push({ x0: ab[0], z0: ab[2], x1: ab[3], z1: ab[5], y: ab[4], edges: 63 });
  weather(c, wear, stones, cap);
  if (c.colliders) {
    c.p.collider(plinth[0], y0, plinth[2], plinth[3], plinth[4], plinth[5]);
    c.p.collider(x - d / 2, plinth[4], z - d / 2, x + d / 2, top, z + d / 2);
    c.p.collider(ab[0], ab[1], ab[2], ab[3], ab[4], ab[5]);
  }
  return { top: ab[4], capital: abW };
}

export interface PilasterOptions extends OpeningStyle {
  /** Centre along the wall (x) and the plane of the wall face it stands on (z). */
  x: number;
  z: number;
  /** Which face: +1 = a face looking +Z (default), −1 = looking −Z. */
  side?: 1 | -1;
  /** Foot and top (default 0 and 3.75 m). */
  y?: number;
  height?: number;
  /** Shaft width along the wall and how far it stands proud of the face (default 0.5 × 0.125 m). */
  width?: number;
  proud?: number;
  carved?: boolean;
  /** Something rests on the capital (a cornice, a lintel): no moss up there. */
  capped?: boolean;
}

/**
 * A pilaster: the square pillar's base, shaft and capital engaged in a wall
 * face, standing `proud` of it (its tiers step out further, like the
 * pillar's). Only the part in front of the face is built.
 */
export function pilaster(p: PieceBuilder, o: PilasterOptions): PillarResult {
  const c = context(p, o);
  const res = pilasterIn(c, o);
  finish(c);
  return res;
}

/** How much a pilaster's tiers step out, in proportion to its width (the pillar's for 0.5 m). */
const growOf = (w: number, grow: number) => Math.max(T, snap(grow * Math.min(1, Math.max(0.5, w / OPENINGS.pillar.width))));
/** The widest step of a pilaster `w` wide: its base and capital overhang the shaft by half this a side, and stand out `proud` + half this. */
export const pilasterGrow = (w: number) => growOf(w, Math.max(...BASE.map((t) => t.grow), ...CAPITAL.map((t) => t.grow)));

function pilasterIn(c: Ctx, o: PilasterOptions): PillarResult {
  const s = o.side ?? 1;
  const w = snap(o.width ?? OPENINGS.pillar.width);
  const pr = snap(o.proud ?? 0.125);
  const y0 = o.y ?? 0;
  const H = snap(o.height ?? OPENINGS.pillar.height);
  const carved = o.carved ?? true;
  const v = c.p.voxels;
  const faceBit = s > 0 ? FACE.pz : FACE.nz;
  const back = s > 0 ? FACE.nz : FACE.pz;
  const box = (grow: number, ya: number, yb: number): Box6 => {
    const g = grow ? growOf(w, grow) : 0;
    const out = o.z + s * (pr + g / 2);
    return [o.x - (w + g) / 2, ya, Math.min(o.z, out), o.x + (w + g) / 2, yb, Math.max(o.z, out)];
  };
  const glyphFaces = faceBit | FACE.px | FACE.nx;
  let y = y0;
  BASE.forEach((t, i) => {
    const b = box(t.grow, y, y + t.h);
    c.m.course(b, { length: [b[3] - b[0], b[3] - b[0]], closed: FACE.ny | back, face: faceBit, look: c.look });
    if (carved) tierGlyphs(v, b, { ...t, split: 1 }, c.seed + i, glyphFaces);
    const nb = box(i + 1 < BASE.length ? BASE[i + 1].grow : 0, 0, 0);
    c.tops.push({ x0: b[0], z0: b[2], x1: b[3], z1: b[5], y: y + t.h, inner: [nb[0], nb[2], nb[3], nb[5]], edges: glyphFaces });
    y += t.h;
  });
  const capH = CAPITAL.reduce((a, t) => a + t.h, 0);
  const shaftTop = y0 + H - capH;
  const shaft = box(0, y, shaftTop);
  stack(c, shaft, courseSplit(shaftTop - y, 0.95), FACE.ny | FACE.py | back, faceBit);
  if (carved) shaftBands(v, shaft, c.seed + 7, faceBit);
  y = shaftTop;
  CAPITAL.forEach((t, i) => {
    const b = box(t.grow, y, y + t.h);
    c.m.course(b, { length: [b[3] - b[0], b[3] - b[0]], closed: back | (i && CAPITAL[i - 1].grow >= t.grow ? FACE.ny : 0), face: faceBit, look: c.look });
    if (carved) tierGlyphs(v, b, { ...t, split: 1 }, c.seed + 11 + i, glyphFaces);
    const next = CAPITAL[i + 1]?.grow ?? -1;
    if (next < t.grow && !(o.capped && next < 0)) {
      const nb = next >= 0 ? box(next, 0, 0) : null;
      c.tops.push({ x0: b[0], z0: b[2], x1: b[3], z1: b[5], y: y + t.h, inner: nb ? [nb[0], nb[2], nb[3], nb[5]] : undefined, edges: glyphFaces });
    }
    y += t.h;
  });
  const cap = box(CAPITAL[CAPITAL.length - 1].grow, 0, 0);
  if (c.colliders) {
    const bb = box(BASE[0].grow, y0, y);
    c.p.collider(bb[0], bb[1], bb[2], bb[3], bb[4], bb[5]);
  }
  return { top: y, capital: cap[3] - cap[0] };
}

/**
 * Stones one above another filling the box, one per course (a pier, a jamb:
 * no running bond); `closed` = the box's sides against other stone.
 */
function stack(c: Ctx, b: Box6, heights: readonly number[], closed: number, face: number = FACE.pz): Stone[] {
  const out: Stone[] = [];
  const w = b[3] - b[0];
  let y = b[1];
  heights.forEach((h, i) => {
    const ends = (i ? FACE.ny : closed & FACE.ny) | (i < heights.length - 1 ? FACE.py : closed & FACE.py);
    out.push(...c.m.course([b[0], y, b[2], b[3], y + h, b[5]], { length: [w, w], closed: (closed & ~(FACE.ny | FACE.py)) | ends, face, look: c.look }));
    y += h;
  });
  return out;
}

/** Split a height into about-`step` courses on the texel grid. */
function courseSplit(h: number, step: number): number[] {
  const n = Math.max(1, Math.round(h / step));
  const out: number[] = [];
  let prev = 0;
  for (let i = 1; i <= n; i++) {
    const y = i === n ? h : snap((h * i) / n);
    out.push(y - prev);
    prev = y;
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Baluster windows                                                          */
/* ------------------------------------------------------------------------ */

/** Where a window sits and its size — all {@link windowCut} needs. */
export interface WindowShape {
  /** Centre of the opening along the wall (default 0). */
  x?: number;
  /** Height of the clear opening's bottom, where the balusters stand (default 0.5 m). */
  sill?: number;
  /** The wall's centre plane (default 0) and thickness (default 1.0 m). */
  z?: number;
  wall?: number;
  /** Clear opening (default 1.375 × 1.625 m). */
  width?: number;
  height?: number;
  /** Width of the moulded frame (default 0.1875 m). */
  frame?: number;
  /** How far the sill ledge and drip band run past the frame on each side (default 0.125 m; 0 between close pilasters). */
  ledge?: number;
}

export interface WindowOptions extends WindowShape, OpeningStyle {
  /** Balusters (default 7 on the standard width: one per 0.1875 m or so). */
  balusters?: number;
  /** Open (see-through) or blind: balusters half sunk into the back of the recess under a carved stone blind. */
  kind?: 'open' | 'blind';
  /** Mouldings on both wall faces (default) or the front (+Z) only. */
  faces?: 'both' | 'front';
  /** Share of balusters broken (0‥1): snapped in two or gone, as in the ruins. */
  broken?: number;
  /** Depth of the balusters' centre line behind the front face (default a quarter of the wall: 0.25 m). */
  inset?: number;
}

const winDims = (o: WindowShape) => {
  const W = OPENINGS.window;
  const w = snap(o.width ?? W.width);
  const h = snap(o.height ?? W.height);
  const fr = snap(o.frame ?? W.frame);
  const t = snap(o.wall ?? OPENINGS.wall);
  return { x: o.x ?? 0, z: o.z ?? 0, sill: o.sill ?? W.sill, w, h, fr, t, ext: snap(o.ledge ?? 0.125) };
};

/** The hole a wall must leave for a window: the outer frame, through the whole wall. */
export function windowCut(o: WindowShape): Box6 {
  const { x, z, sill, w, h, fr, t } = winDims(o);
  return [x - w / 2 - fr, sill - fr, z - t / 2, x + w / 2 + fr, sill + h + fr, z + t / 2];
}

/** Where a window's mouldings reach on the wall faces: along x, from the sill ledge's foot to the drip band's top, and out from the face. */
export function windowExtent(o: WindowShape): { x0: number; x1: number; y0: number; y1: number; proud: number } {
  const c = windowCut(o);
  const { ext } = winDims(o);
  return { x0: c[0] - ext, x1: c[3] + ext, y0: c[1] - 0.125, y1: c[4] + 0.125, proud: 0.1875 };
}

/**
 * A baluster window filling {@link windowCut}: the moulded frame (jambs, sill
 * and head stones through the wall, standing a texel proud of each face), a
 * sill ledge under it and a drip band over it on the faces (a fret carved
 * along it), and the balusters `inset` behind the front face. Returns the
 * tops moss settles on.
 */
export function balusterWindow(p: PieceBuilder, o: WindowOptions): MossTop[] {
  const c = context(p, o);
  const { x, z, sill, w, h, fr, t, ext } = winDims(o);
  const both = (o.faces ?? 'both') === 'both';
  const zf = z + t / 2;
  const zb = z - t / 2;
  const [pf, pb] = [zf + T, both ? zb - T : zb];
  const blind = o.kind === 'blind';
  const [xa, xb] = [x - w / 2, x + w / 2];
  // Frame: the jambs full height, sill and head between them, all through the wall.
  const frame: CourseLook = { closed: FACE.ny, look: c.look };
  course(c, [xa - fr, sill - fr, pb, xa, sill + h + fr, pf], frame);
  course(c, [xb, sill - fr, pb, xb + fr, sill + h + fr, pf], frame);
  course(c, [xa, sill - fr, pb, xb, sill, pf], { ...frame, closed: FACE.ny | FACE.px | FACE.nx });
  course(c, [xa, sill + h, pb, xb, sill + h + fr, pf], { closed: FACE.px | FACE.nx | FACE.py, look: c.look });
  // Faces: the sill ledge (moss gathers on it) and the drip band over the head.
  const lx = [xa - fr - ext, xb + fr + ext];
  for (const s of both ? [1, -1] : [1]) {
    const f = s > 0 ? zf : zb;
    const out = f + s * 0.1875;
    const faceBit = s > 0 ? FACE.pz : FACE.nz;
    const ledge: Box6 = [lx[0], sill - fr - 0.125, Math.min(f, out), lx[1], sill - fr, Math.max(f, out)];
    c.m.course(ledge, { length: [0.5, 1], closed: s > 0 ? FACE.nz : FACE.pz, face: faceBit, look: c.look });
    const drip: Box6 = [lx[0], sill + h + fr, Math.min(f, f + s * 0.125), lx[1], sill + h + fr + 0.125, Math.max(f, f + s * 0.125)];
    c.m.course(drip, { length: [0.5, 1], closed: s > 0 ? FACE.nz : FACE.pz, face: faceBit, look: c.look });
    band(c.p.voxels, faceBit, s > 0 ? drip[5] : drip[2], x, (drip[1] + drip[4]) / 2, drip[3] - drip[0] - 0.25, GLYPH.fret, c.seed + 3);
    // (the frame stands a texel proud on the ledge's back strip)
    const onLedge: [number, number, number, number] = [xa - fr, Math.min(f, s > 0 ? pf : pb), xb + fr, Math.max(f, s > 0 ? pf : pb)];
    c.tops.push({ x0: ledge[0], z0: ledge[2], x1: ledge[3], z1: ledge[5], y: ledge[4], inner: onLedge, edges: faceBit | FACE.px | FACE.nx });
    c.tops.push({ x0: drip[0], z0: drip[2], x1: drip[3], z1: drip[5], y: drip[4], edges: faceBit | FACE.px | FACE.nx });
  }
  // Balusters nearly touching, a quarter of the wall in.
  const n = Math.max(1, o.balusters ?? Math.round(w / OPENINGS.window.spacing - 0.4));
  const pitch = w / n;
  const d = Math.min(snap(pitch - T / 2, T / 4), 0.1875);
  const r = rng(c.seed * 5 + 1);
  const broken = o.broken ?? 0;
  const bz = snap(zf - (o.inset ?? t / 4));
  for (let k = 0; k < n; k++) {
    const bx = xa + (k + 0.5) * pitch;
    const prof = balusterProfile(h, d);
    const one = c.look(bx, sill + h / 2, bz);
    const tones = () => one;
    if (!blind && broken > 0 && r.chance(broken)) {
      brokenBaluster(c.p.voxels, bx, bz, sill, h, prof, tones, r);
      // Now and then its broken piece lies on the sill in front.
      if (r.chance(0.5)) {
        const l = c.look(bx, sill, bz + 0.25);
        const fx = Math.min(xb - 0.15, Math.max(xa + 0.15, bx));
        c.p.voxels.box(fx, sill + d / 2, bz + 0.22, 0.25, d, d, l.color, 'sandstone', { shade: 0.95, surf: l.surf, ry: r.range(-0.35, 0.35), src: here() });
      }
    }
    else turned(c.p.voxels, bx, bz, sill, prof, tones);
  }
  if (blind) blindBack(c, xa, xb, sill, h, zb, bz);
  if (c.colliders) c.p.collider(xa - fr, sill - fr, pb, xb + fr, sill + h + fr, pf);
  finish(c);
  return c.tops;
}

/** Options of a course laid by {@link course}. */
interface CourseLook {
  closed: number;
  look: StoneLookFn;
}

/** One stone filling the box (its face +z). */
function course(c: Ctx, b: Box6, o: CourseLook): Stone[] {
  const w = b[3] - b[0];
  return c.m.course(b, { length: [w, w], closed: o.closed, look: o.look });
}

/** A baluster snapped in the ruins: the lower part standing to a ragged break, a stub hanging from the head, or only its foot left. */
function brokenBaluster(v: VoxelBuilder, x: number, z: number, y0: number, h: number, prof: Turn[], look: (y: number) => StoneLook, r: Rng): void {
  const cut = (from: number, to: number): Turn[] => {
    // The sections of the profile between heights from‥to (metres above y0).
    const out: Turn[] = [];
    let y = 0;
    for (const s of prof) {
      const a = Math.max(y, from);
      const b = Math.min(y + s.h, to);
      if (b > a + 1e-6) out.push({ ...s, h: b - a });
      y += s.h;
    }
    return out;
  };
  const gone = r.chance(0.3);
  const low = gone ? 2 * T : snap(h * r.range(0.3, 0.6));
  turned(v, x, z, y0, cut(0, low), look);
  if (!gone || r.chance(0.5)) {
    const high = snap(h * r.range(0.7, 0.88));
    turned(v, x, z, y0 + high, cut(high, h), look);
  }
}

/**
 * A blind window's back: the recess filled behind the balusters' centre line
 * (so they stand half sunk), and a carved stone blind lowered over the top
 * third — horizontal slats ending in a rolled edge — as on Angkor Wat's false
 * windows.
 */
function blindBack(c: Ctx, xa: number, xb: number, sill: number, h: number, zb: number, line: number): void {
  const v = c.p.voxels;
  const src = here();
  const z = line - T / 2;
  c.m.wall([xa, sill, zb, xb, sill + h, z], courseSplit(h, 0.5), { length: [0.5, 1], closed: FACE.ny | FACE.py | FACE.px | FACE.nx, look: c.look });
  const drop = snap(h * 0.36);
  const y1 = sill + h;
  const y0 = y1 - drop;
  const front = line + 0.125;
  // The blind: slats a texel deep stepping forward to the roll at its foot.
  const slats = Math.max(2, Math.floor((drop - 0.125) / (2 * T)));
  for (let i = 0; i < slats; i++) {
    const ya = y1 - (i + 1) * 2 * T;
    const l = c.look(xa + i * 0.13, ya, front);
    v.span(xa, ya, z, xb, ya + 2 * T, front - T + ((i % 2) * T) / 2, l.color, 'sandstone', { shade: (l.shade ?? 1) * (0.9 + 0.04 * (i % 2)), surf: l.surf, src });
  }
  const rollTop = y1 - slats * 2 * T;
  const rl = c.look(xa, rollTop, front);
  v.span(xa, Math.max(y0, rollTop - 0.125), z, xb, rollTop, front + T, rl.color, 'sandstone', { shade: rl.shade, surf: rl.surf, src });
  // Tassel cords hanging from the roll at the quarter points.
  for (const q of [0.25, 0.75]) {
    const tx = snap(xa + (xb - xa) * q);
    v.span(tx - T / 2, rollTop - 0.125 - 3 * T, front - T, tx + T / 2, rollTop - 0.125, front, rl.color, 'sandstone', { shade: 0.95, surf: rl.surf, src });
  }
}

/* ------------------------------------------------------------------------ */
/* Doors                                                                     */
/* ------------------------------------------------------------------------ */

/** Where a door sits and its size — all {@link doorCut} and {@link doorExtent} need. */
export interface DoorShape {
  /** Centre along the wall (default 0) and the floor at the door (default 0). */
  x?: number;
  y?: number;
  /** The wall's centre plane (default 0) and thickness (default 1.0 m). */
  z?: number;
  wall?: number;
  /** Clear size: small 1.0 × 2.0625, standard 1.25 × 2.5 (default), main 1.75 × 3.375 m. */
  size?: DoorSize;
  /** Clear width / height overriding `size`. */
  width?: number;
  height?: number;
  /** Threshold height (default 0.125 m, a step). */
  threshold?: number;
  /** Colonnettes, pilasters and the carved lintel on the faces (default true). */
  surround?: boolean;
}

export interface DoorOptions extends DoorShape, OpeningStyle {
  /** Surround on both faces (default) or the front (+Z) only. */
  faces?: 'both' | 'front';
  /** Open doorway, or a false door: carved stone leaves filling it. */
  kind?: 'open' | 'false';
}

const doorDims = (o: DoorShape) => {
  const D = OPENINGS.door;
  const s = D[o.size ?? 'standard'];
  const w = snap(o.width ?? s.width);
  const h = snap(o.height ?? s.height);
  const th = snap(o.threshold ?? D.threshold);
  const t = snap(o.wall ?? OPENINGS.wall);
  const jamb = D.jamb;
  // Colonnettes and pilasters grow with the door (0.25 m ⌀ and 0.375 m on the standard one).
  const col = w >= 1.5 ? 0.3125 : w <= 1.0 ? 0.1875 : 0.25;
  const pil = w >= 1.5 ? 0.5 : w <= 1.0 ? 0.25 : 0.375;
  // Out from the jambs: the colonnette's base (col + 1/8 wide), then the lintel's end, then the pilaster.
  const colX = w / 2 + jamb + col / 2 + 0.0625;
  const lx = colX + col / 2 + 0.0625;
  const grow = pilasterGrow(pil);
  const pilX = lx + pil / 2 + grow / 2;
  const half = pilX + pil / 2 + grow / 2;
  return { x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0, w, h, th, t, jamb, L: D.lintel, col, pil, colX, lx, pilX, half };
};

/** The hole a wall must leave for a door: the jambs' outer edges, from the floor to the lintels' top, through the wall. */
export function doorCut(o: DoorShape): Box6 {
  const { x, y, z, w, h, th, t, jamb, L } = doorDims(o);
  return [x - w / 2 - jamb, y, z - t / 2, x + w / 2 + jamb, y + th + h + L, z + t / 2];
}

/**
 * Where a door's surround stands on the wall faces: x0‥x1 along the wall
 * (about three times the clear width: 4.0 m for the standard door), up to y1
 * (the lintel's top), `proud` out from the face (the floor must reach that far).
 */
export function doorExtent(o: DoorShape): { x0: number; x1: number; y1: number; proud: number } {
  const d = doorDims(o);
  const cut = doorCut(o);
  return (o.surround ?? true) ? { x0: d.x - d.half, x1: d.x + d.half, y1: cut[4], proud: d.col + 0.25 } : { x0: cut[0], x1: cut[3], y1: cut[4], proud: T };
}

/**
 * A door filling {@link doorCut}: the threshold across the passage, jambs
 * lining it (a texel proud of the faces), front and back lintels over it —
 * and on the faces the surround: an octagonal colonnette on a base either
 * side carrying a proud lintel carved with key spirals and a central boss,
 * flanked by pilasters. A false door fills the opening with two carved
 * leaves. Returns the tops moss settles on.
 */
export function doorFrame(p: PieceBuilder, o: DoorOptions): MossTop[] {
  const c = context(p, o);
  const d = doorDims(o);
  const { x, y, z, w, h, th, t, jamb, L } = d;
  const both = (o.faces ?? 'both') === 'both';
  const framed = o.surround ?? true;
  const zf = z + t / 2;
  const zb = z - t / 2;
  const [pf, pb] = [zf + T, both ? zb - T : zb];
  const [xa, xb] = [x - w / 2, x + w / 2];
  const yo = y + th;
  const yl = yo + h;
  // Threshold: one stone across the cut, the jambs standing on its ends.
  c.m.course([xa - jamb, y, pb, xb + jamb, yo, pf], { length: [w + 2 * jamb, w + 2 * jamb], closed: FACE.ny, look: c.look });
  // Jambs: two stones each, a joint a little above the middle.
  const split = [snap(h * 0.55), h - snap(h * 0.55)];
  for (const [a, b] of [
    [xa - jamb, xa],
    [xb, xb + jamb],
  ])
    stack(c, [a, yo, pb, b, yl, pf], split, FACE.ny | FACE.py);
  // Lintels: front and back stones (one through the wall would be ≈ 2 t); flush where the surround's lintel stands before them.
  const zm = snap(z);
  const [lf, lb] = framed ? [zf, zb] : [pf, pb];
  c.m.course([xa - jamb, yl, zm, xb + jamb, yl + L, lf], { length: [w + 2 * jamb, w + 2 * jamb], closed: FACE.nz, look: c.look });
  c.m.course([xa - jamb, yl, lb, xb + jamb, yl + L, zm], { length: [w + 2 * jamb, w + 2 * jamb], closed: FACE.pz, face: FACE.nz, look: c.look });
  if (o.kind === 'false') falseDoor(c, xa, xb, yo, yl, zb, zf);
  if (framed) for (const s of both ? [1, -1] : [1]) surround(c, d, s as 1 | -1, s > 0 ? zf : zb);
  if (c.colliders) {
    c.p.collider(xa - jamb, y, pb, xb + jamb, yo, pf);
    c.p.collider(xa - jamb, yo, pb, xa, yl, pf);
    c.p.collider(xb, yo, pb, xb + jamb, yl, pf);
    c.p.collider(xa - jamb, yl, pb, xb + jamb, yl + L, pf);
    if (o.kind === 'false') c.p.collider(xa, yo, zb, xb, yl, zf);
  }
  finish(c);
  return c.tops;
}

type DoorDims = ReturnType<typeof doorDims>;

/**
 * The carved surround on one face (s = +1 front, −1 back; `face` = the wall
 * face's plane): colonnettes on square bases carrying a proud lintel,
 * pilasters outside them with bases and capitals, key spirals on the lintel's
 * ends, a boss and frets along its middle.
 */
function surround(c: Ctx, d: DoorDims, s: 1 | -1, face: number): void {
  const { x, y, h, th, L, col, pil, colX, lx, pilX } = d;
  const v = c.p.voxels;
  const faceBit = s > 0 ? FACE.pz : FACE.nz;
  const back = s > 0 ? FACE.nz : FACE.pz;
  const zOut = (depth: number): [number, number] => (s > 0 ? [face, face + depth] : [face - depth, face]);
  const yl = y + th + h;
  const colZ = face + s * (col / 2 + 0.0625);
  // Colonnettes: a square base, an octagonal shaft ringed at the foot, the middle and the top, a capital block.
  const baseH = 0.25;
  const capH = 0.1875;
  const shaftH = yl - (y + baseH) - capH;
  const ring = (dd: number): Turn[] => [
    { h: T, d: dd + 0.0625 },
    { h: T, d: dd },
    { h: T, d: dd + 0.0625 },
  ];
  const mid = snap((shaftH - 9 * T) / 2);
  const parts: Turn[] = [...ring(col), { h: mid, d: col }, ...ring(col), { h: shaftH - 9 * T - mid, d: col }, ...ring(col)];
  const bw = col + 0.125;
  const rw = (col + 0.0625) / 2;
  const [cz0, cz1] = zOut(col + 0.1875);
  for (const sx of [-1, 1]) {
    const cx = x + sx * colX;
    c.m.course([cx - bw / 2, y, cz0, cx + bw / 2, y + baseH, cz1], { length: [bw, bw], closed: FACE.ny | back, face: faceBit, look: c.look });
    const one = c.look(cx, y + 1, colZ);
    const tones = () => one;
    turned(v, cx, colZ, y + baseH, parts, tones);
    c.m.course([cx - bw / 2, yl - capH, cz0, cx + bw / 2, yl, cz1], { length: [bw, bw], closed: back | FACE.py, face: faceBit, look: c.look });
    carve(v, faceBit, s > 0 ? cz1 : cz0, cx, yl - capH / 2 + 2.5 * C, GLYPH.small, c.seed + sx);
    c.tops.push({ x0: cx - bw / 2, z0: cz0, x1: cx + bw / 2, z1: cz1, y: y + baseH, inner: [cx - rw, colZ - rw, cx + rw, colZ + rw], edges: faceBit | FACE.px | FACE.nx });
  }
  // The proud lintel over the colonnettes: key spirals at its ends, frets and a central boss.
  const [lz0, lz1] = zOut(col + 0.25);
  c.m.course([x - lx, yl, lz0, x + lx, yl + L, lz1], { length: [2 * lx, 2 * lx], closed: back, face: faceBit, look: c.look });
  const plane = s > 0 ? lz1 : lz0;
  const ym = yl + L / 2;
  const keyTop = ym + (GLYPH.key.length * C) / 2;
  const keyU = lx - 0.1875 - (GLYPH.key[0].length * C) / 2;
  carve(v, faceBit, plane, x - keyU, keyTop, GLYPH.key, c.seed + 2);
  carve(v, faceBit, plane, x + keyU, keyTop, GLYPH.key, c.seed + 3);
  // Frets between the keys and the boss.
  const fa = 0.1875;
  const fb = keyU - (GLYPH.key[0].length * C) / 2 - 0.0625;
  if (fb - fa >= 0.25) for (const sx of [-1, 1]) band(v, faceBit, plane, x + (sx * (fa + fb)) / 2, ym, fb - fa, GLYPH.fret, c.seed + 5);
  // Central boss: a rosette standing proud (the kala face of the real lintels, in the sheet's blocky hand).
  const bl = c.look(x, ym, plane);
  const [bz0, bz1] = s > 0 ? [plane, plane + T] : [plane - T, plane];
  v.span(x - 0.125, ym - 0.125, bz0, x + 0.125, ym + 0.125, bz1, bl.color, 'sandstone', { shade: bl.shade, surf: bl.surf, src: here() });
  carve(v, faceBit, s > 0 ? bz1 : bz0, x, ym + 2.5 * C, GLYPH.rosette, c.seed + 4);
  c.tops.push({ x0: x - lx, z0: lz0, x1: x + lx, z1: lz1, y: yl + L, edges: faceBit | FACE.px | FACE.nx });
  // Pilasters beside the lintel's ends, up to its top.
  for (const sx of [-1, 1]) pilasterIn(c, { x: x + sx * pilX, z: face, side: s, y, height: yl + L - y, width: pil, proud: 0.125, seed: c.seed + 20 + sx });
  if (c.colliders) {
    const e = d.w / 2 + d.jamb;
    c.p.collider(x - lx, y, lz0, x - e, yl, lz1);
    c.p.collider(x + e, y, lz0, x + lx, yl, lz1);
    c.p.collider(x - lx, yl, lz0, x + lx, yl + L, lz1);
  }
}

/**
 * A false door's two stone leaves, set back from the front of the frame:
 * rails and stiles standing a texel proud around sunk panels, a rosette in
 * each panel, the meeting stiles with a lock boss.
 */
function falseDoor(c: Ctx, xa: number, xb: number, y0: number, y1: number, zb: number, zf: number): void {
  const v = c.p.voxels;
  const src = here();
  const zl = zf - 0.125;
  stack(c, [xa, y0, zb, xb, y1, zl], courseSplit(y1 - y0, 0.9), FACE.ny | FACE.py | FACE.px | FACE.nx);
  const panels = Math.max(3, Math.round((y1 - y0) / 0.6));
  const ph = (y1 - y0 - 0.125) / panels;
  const mid = (xa + xb) / 2;
  for (const [a, b] of [
    [xa, mid],
    [mid, xb],
  ]) {
    // Stiles.
    const l = c.look(a, y0, zl);
    v.span(a, y0, zl, a + 0.125, y1, zl + T, l.color, 'sandstone', { shade: l.shade, surf: l.surf, src });
    v.span(b - 0.125, y0, zl, b, y1, zl + T, l.color, 'sandstone', { shade: l.shade, surf: l.surf, src });
    for (let i = 0; i <= panels; i++) {
      const ya = snap(y0 + i * ph);
      const rl = c.look(a + 0.2, ya, zl);
      v.span(a + 0.125, ya, zl, b - 0.125, ya + 0.125, zl + T, rl.color, 'sandstone', { shade: rl.shade, surf: rl.surf, src });
      if (i === panels) break;
      // A rosette in the panel.
      const cy = snap(ya + 0.125 + (ph - 0.125) / 2);
      const cx = snap((a + b) / 2);
      v.span(cx - 1.5 * T, cy - 1.5 * T, zl, cx + 1.5 * T, cy + 1.5 * T, zl + T / 2, rl.color, 'sandstone', { shade: 1.05, surf: rl.surf, src });
      carve(v, FACE.pz, zl + T / 2, cx, cy + 2.5 * C, GLYPH.rosette, c.seed + i);
    }
  }
  // Lock boss on the meeting stiles.
  const bl = c.look(mid, (y0 + y1) / 2, zl);
  v.span(mid - 0.125, (y0 + y1) / 2 - 0.1875, zl + T, mid + 0.125, (y0 + y1) / 2 + 0.0625, zl + 2 * T, bl.color, 'sandstone', { shade: 1.05, surf: bl.surf, src });
}

/* ------------------------------------------------------------------------ */
/* Moss                                                                      */
/* ------------------------------------------------------------------------ */

/**
 * Moss on stone tops, the §21 sheet's yellow-olive felt: half-texel-thin cells
 * in noise patches (about 0.3 m) that crowd the free edges and the corner
 * against whatever stands on the top — darker there — and now and then a
 * strand hanging over a front or back edge. `amount` 0‥1 is roughly the share of the
 * ring along the edges that is grown over.
 */
export function mossTops(p: PieceBuilder, tops: readonly MossTop[], amount: number, seed: number): void {
  if (amount <= 0 || !tops.length) return;
  const r = rng(seed * 3 + 29);
  const v = p.voxels;
  const src = here();
  const g = v.grid({ cell: [T, T / 2, T], origin: [0, 0, 0], mat: 'leaves', jitter: 0.12, ao: 0.3, seed });
  const pick = (list: readonly number[], t: number) => list[Math.min(list.length - 1, Math.floor(t * list.length))];
  const taken = new Set<string>();
  for (const top of tops) {
    const j = Math.round(top.y / (T / 2));
    const inner = top.inner;
    const [i0, i1] = [Math.round(top.x0 / T), Math.round(top.x1 / T)];
    const [k0, k1] = [Math.round(top.z0 / T), Math.round(top.z1 / T)];
    // First the cells the moss would cover, then only those with company (no lone specks).
    const cells = new Map<string, { i: number; k: number; x: number; z: number; edge: number; wall: number; n: number; t: number }>();
    for (let i = i0; i < i1; i++)
      for (let k = k0; k < k1; k++) {
        const [x, z] = [(i + 0.5) * T, (k + 0.5) * T];
        // (not even partly under what stands on the top)
        if (inner && x + T / 2 > inner[0] + 1e-6 && x - T / 2 < inner[2] - 1e-6 && z + T / 2 > inner[1] + 1e-6 && z - T / 2 < inner[3] - 1e-6) continue;
        // Distance to the nearest free edge and to what stands on the top (texels).
        const edge = Math.min(top.edges & FACE.nx ? x - top.x0 : 9, top.edges & FACE.px ? top.x1 - x : 9, top.edges & FACE.nz ? z - top.z0 : 9, top.edges & FACE.pz ? top.z1 - z : 9) / T;
        const wall = inner ? Math.max(inner[0] - x, x - inner[2], inner[1] - z, z - inner[3]) / T : 9;
        const n = valueNoise3(x * 2.4, top.y * 2, z * 2.4, seed + 17) * 0.9 + r() * 0.1;
        const t = 0.12 + amount * 0.58 - Math.min(Math.min(edge, wall), 8) * 0.04;
        if (n <= t) cells.set(`${i},${k}`, { i, k, x, z, edge, wall, n, t });
      }
    for (const c of cells.values()) {
      const company = [`${c.i + 1},${c.k}`, `${c.i - 1},${c.k}`, `${c.i},${c.k + 1}`, `${c.i},${c.k - 1}`].filter((q) => cells.has(q)).length;
      if (company < 2) continue;
      const key = `${c.i},${j},${c.k}`;
      if (taken.has(key)) continue;
      taken.add(key);
      const { i, k, x, z, edge, wall, n, t } = c;
      const deep = wall < 1.5 || n < t - 0.28;
      g.set(i, j, k, pick(deep ? MOSS_DEEP : MOSS_LIT, valueNoise3(x * 6, top.y, z * 6, seed + 3) * 0.8 + r() * 0.2));
      // A cushion a cell higher in the thick of a patch, a strand over the edge now and then.
      if (company === 4 && n < t - 0.2 && r.chance(0.6)) g.set(i, j + 1, k, pick(MOSS_LIT, r()));
      if (edge < 1 && r.chance(0.2 * amount + 0.05)) {
        const hl = r.int(1, 2) * T;
        const tone = pick(MOSS_DEEP, r());
        const e = T / 2;
        // (only down the fronts and backs: the ends of a top often butt against a neighbour)
        if (top.edges & FACE.pz && top.z1 - z < T) v.span(i * T, top.y - hl, top.z1, i * T + T, top.y, top.z1 + e, tone, 'leaves', { shade: 0.85, src });
        else if (top.edges & FACE.nz && z - top.z0 < T) v.span(i * T, top.y - hl, top.z0 - e, i * T + T, top.y, top.z0, tone, 'leaves', { shade: 0.85, src });
      }
    }
  }
  g.commit();
}
