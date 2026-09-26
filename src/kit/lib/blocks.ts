import type { SourceTrace } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { TEMPLE_BLOCK_M } from '../../world/scale';
import { fromSheet, MOSS, SANDSTONE } from '../palette';
import { PieceBuilder } from '../PieceBuilder';
import { turnXZ } from '../place';
import { here, rng, snap, type Rng } from '../shapes';
import { STONE_FINISH, stoneSurf, type StoneFinish } from '../surface';
import type { KitPiece } from '../types';
import { DryMasonry, FACE, finishLook, type Box6, type Stone } from './gallery';

/**
 * §21.1 basic building blocks — the voxel building kit's primitives (the
 * 1x1, 1x2, 1x3, 2x2 and 2x4 blocks, the long wall block and the L corner
 * block) as functions, so walls, steps, platforms and ruins can be laid
 * procedurally from them and look like the sheet.
 *
 * ## What a block is
 * The sheet counts blocks in **units** (width × length × height): one unit is
 * the kit's 0.5 m sandstone block (`TEMPLE_BLOCK_M`), one course high. A block
 * is made of real stones, one box each, laid dry by {@link DryMasonry} in the
 * §19.1 finishes (`finishLook`), so blocks look like the rest of the temple:
 *  - A stone up to 1.5 × 0.5 × 0.5 m (≤ 0.9 t at 2.3 t/m³; Angkor Wat's
 *    heaviest are ≈ 1.5 t) is **one stone**: the 1x1, 1x2 and 1x3.
 *  - Anything bigger is **several stones** with true joints between them
 *    (touching boxes whose cut edges meet in a thin shadow line): the 2x2 is
 *    two 1.0 m ashlars side by side, the 2x4 a row of 1.0 + 1.0 m behind a row
 *    of 0.5 + 1.0 + 0.5 m (running bond), the long wall block 1.0 + 1.0 m, the
 *    corner a 1.0 m stretcher and a 0.5 m header.
 *  - The sheet divides every unit face into quarters by fine lines. On one
 *    stone those are **shallow grooves**, not joints: a dark wall and a sunlit
 *    one, a few centimetres wide, standing a hair proud of the face. The unit
 *    seams run right across the stone and notch its arrises; each unit's top
 *    has a cross of grooves running in from the middle of its edges (the "+"
 *    of the sheet's top view); each unit's side a bedding groove at mid height
 *    and a short upright one below or above it.
 *  - Moss as on the sheet: the kit's moss pattern in patches and flecks on
 *    the tops, creeping down the sides, and the grooves moss-filled.
 *
 * ## Placement contract
 * - A block's footprint is `length` units along x and `width` units along z
 *   ({@link BLOCK_SHAPES}); it stands `height` metres tall (default one unit,
 *   0.5 m). {@link BlockAt} places it by the **centre of its footprint** (x, z)
 *   and its **bottom** (y), turned by quarter turns about +Y like `placePiece`
 *   (turn 1 turns the block's front, +Z, to face +X; its length then runs
 *   along z). {@link blockSize} gives the turned footprint.
 * - The corner block is an L on a 2 × 2 unit footprint. Its missing quarter
 *   is at the front right (+x, +z) at turn 0, back right at turn 1, back left
 *   at turn 2, front left at turn 3.
 * - Shapes of several stones have a second bond (`alt: true` in
 *   {@link BlockAt}): the same footprint with the joints moved, to lay on every
 *   second course (a corner then bonds like a real one).
 * - The walkable top of a block is its top face (y + height). Colliders: one
 *   box per stone, merged where stones make a larger box.
 * - Blocks laid into one {@link BlockLayer} know each other: sides against
 *   another stone become masonry joints, and covered faces get no grooves or
 *   moss. Lay a whole wall or platform into one layer, then `emit` once. The
 *   layer does not check overlaps: don't lay two stones into one space.
 * - A 0.5 m block is above the explorer's 0.42 m step: steps want `height`
 *   0.25 (or less).
 *
 * ## Usage
 * ```ts
 * const p = new PieceBuilder();
 * const blocks = new BlockLayer({ finish: BLOCK_FINISH.mossy, seed });
 * // A 3 m wall, 0.5 m thick on z = 0, ends at x = ±1.5: two courses in running bond,
 * // then a corner closing its right end and starting a side wall along +z at x = 2.25.
 * for (let c = 0; c < 2; c++) {
 *   blocks.course({ from: -1.5, to: 1.5, y: c * 0.5, row: c });
 *   blocks.block('corner', { x: 2, y: c * 0.5, z: 0.25, turn: 3, alt: c % 2 === 1 });
 *   blocks.course({ from: 0.75, to: 2.75, axis: 'z', at: 2.25, y: c * 0.5, row: c });
 * }
 * // A loose 1x1 on the wall, and a 0.25 m slab as a step in front of it:
 * blocks.block('1x1', { x: -1.25, y: 1, z: 0 });
 * blocks.block('1x2', { x: 0, y: 0, z: 0.5 }, { height: 0.25 });
 * blocks.emit(p);
 * return p.done();
 * ```
 * One block as a kit piece: `blockPiece('2x4', { finish: BLOCK_FINISH.weathered, seed })`.
 */

/** One unit of the building kit (metres): the 0.5 m temple block. */
export const UNIT = TEMPLE_BLOCK_M;

export type BlockKind = '1x1' | '1x2' | '1x3' | '2x2' | '2x4' | 'long' | 'corner';

/** A block's footprint in units and the stones it is made of. */
export interface BlockShape {
  /** Units along x. */
  length: number;
  /** Units along z. */
  width: number;
  /** Each stone as a unit rectangle [i0, k0, i1, k1]: i along x from the −x end, k along z from the back (−z). */
  stones: readonly UnitRect[];
  /** The other bond (same footprint, joints elsewhere): lay it every second course so joints don't line up. */
  alt?: readonly UnitRect[];
}

/** A rectangle of unit cells [i0, k0, i1, k1] (i along x, k along z, max exclusive). */
export type UnitRect = readonly [number, number, number, number];

/** The seven blocks of the sheet. */
export const BLOCK_SHAPES: Record<BlockKind, BlockShape> = {
  '1x1': { length: 1, width: 1, stones: [[0, 0, 1, 1]] },
  '1x2': { length: 2, width: 1, stones: [[0, 0, 2, 1]] },
  '1x3': { length: 3, width: 1, stones: [[0, 0, 3, 1]] },
  // One stone would be 0.5 m³ (1.15 t), more than a real 1.5 × 0.5 × 0.6 m ashlar: two stretchers side by side.
  '2x2': { length: 2, width: 2, stones: [[0, 0, 2, 1], [0, 1, 2, 2]], alt: [[0, 0, 1, 2], [1, 0, 2, 2]] },
  // One stone would be 2.3 t: a back row of two 1.0 m ashlars, the front row in running bond.
  '2x4': {
    length: 4,
    width: 2,
    stones: [[0, 0, 2, 1], [2, 0, 4, 1], [0, 1, 1, 2], [1, 1, 3, 2], [3, 1, 4, 2]],
    alt: [[0, 0, 1, 1], [1, 0, 3, 1], [3, 0, 4, 1], [0, 1, 2, 2], [2, 1, 4, 2]],
  },
  long: { length: 4, width: 1, stones: [[0, 0, 2, 1], [2, 0, 4, 1]], alt: [[0, 0, 1, 1], [1, 0, 3, 1], [3, 0, 4, 1]] },
  // A stretcher along the back and a header in front of its left end; the other bond turns them.
  corner: { length: 2, width: 2, stones: [[0, 0, 2, 1], [0, 1, 1, 2]], alt: [[0, 0, 1, 2], [1, 0, 2, 1]] },
};

/** Where a block goes: the centre of its footprint (x, z), its bottom (y), quarter turns about +Y. */
export interface BlockAt {
  x: number;
  y: number;
  z: number;
  turn?: number;
  /** Lay the shape's other bond ({@link BlockShape.alt}), e.g. on every second course. */
  alt?: boolean;
}

/** A block's look; anything left out comes from the {@link BlockLayer}. */
export interface BlockLook {
  finish?: StoneFinish;
  /** Moss beyond the finish's own (0‥1), in patches that vary stone by stone. */
  moss?: number;
  /** The sheet's quarter grooves (0 = unit seams only, 1 = as on the sheet). */
  lines?: number;
  /** Height in metres (default one unit, 0.5 m; e.g. 0.25 m for slabs and steps). */
  height?: number;
}

/**
 * The block finishes — the sheet's own look first, then two §19.1 finishes.
 * Any `StoneFinish` (STONE_FINISH.*) works as well.
 */
export const BLOCK_FINISH = {
  /**
   * The §21.1 sheet: warm pinkish-tan sandstone (sampled off its lit faces,
   * then matched to the studio render), moss in patches on the tops creeping
   * down the sides, a little grime.
   */
  mossy: {
    palette: [0xcda688, 0xc7a083, 0xd4ac8e, 0xc19b7f, 0xd9b294],
    surf: stoneSurf({ moss: 0.18, stain: 0.08, lichen: 0.04 }),
    wear: 0,
  },
  /** §19.1 heavily weathered: mottled brown, chipped arrises, a little moss. */
  weathered: STONE_FINISH.weathered,
  /** §19.1 clean, recently built stone. */
  clean: STONE_FINISH.clean,
} satisfies Record<string, StoneFinish>;

/** The turned footprint of a block (metres): [size along x, size along z]. */
export function blockSize(kind: BlockKind | BlockShape, turn = 0, unit = UNIT): [number, number] {
  const s = typeof kind === 'string' ? BLOCK_SHAPES[kind] : kind;
  return turn % 2 ? [s.width * unit, s.length * unit] : [s.length * unit, s.width * unit];
}

/** A stone laid by a {@link BlockLayer}, with what its face marks need. */
interface LaidStone {
  stone: Stone;
  /** The box it was laid in; the stone's open faces are set back from it by the grooves' depth. */
  box: Box6;
  finish: StoneFinish;
  unit: number;
  lines: number;
  seed: number;
}

/** Towards the sun (the game's, upper left front): the lit wall of a groove faces it. */
const SUN = [-0.55, 0.62, 0.35];
/** How far grooves stand proud of the face: 4 mm, too little to see edge-on, enough not to flicker. Moss lies on them. */
const PROUD = 0.004;
/** One sandstone pattern texel (1/24 m): the grooves' widths and the moss spots' cells. */
const PT = 1 / 24;
/** The dark wall of a groove in bare stone, and of a moss-filled one (the sheet's seams). */
const GROOVE = [SANDSTONE.cavity[2], SANDSTONE.cavity[0], 0x524236];
const MOSSY_GROOVE = [0x463d1e, 0x3c3519, 0x4f4524].map(fromSheet);
/** Moss flecks: the kit's moss tones, as its moss pattern draws them on the stone. */
const FLECK = [MOSS[0], MOSS[2], MOSS[4], 0x8a9a3e, 0x7d9038];

/**
 * Blocks laid together (a wall, a platform, a heap): collects their stones and
 * emits them in one go, so touching stones make joints and covered faces stay
 * plain.
 */
export class BlockLayer {
  private readonly laid: LaidStone[] = [];
  private readonly mason: DryMasonry;

  constructor(readonly o: BlockLook & { seed: number; unit?: number }) {
    this.mason = new DryMasonry(o.seed);
  }

  get unit(): number {
    return this.o.unit ?? UNIT;
  }

  /** Lay one block; returns its stones' boxes (metres). */
  block(kind: BlockKind | BlockShape, at: BlockAt, look: BlockLook = {}): Box6[] {
    const s = typeof kind === 'string' ? BLOCK_SHAPES[kind] : kind;
    const u = this.unit;
    const turn = (((at.turn ?? 0) % 4) + 4) % 4;
    const h = look.height ?? this.o.height ?? u;
    const src = here();
    return (at.alt && s.alt ? s.alt : s.stones).map(([i0, k0, i1, k1]) => {
      // Unit rectangle → local metres (footprint centred) → turned → placed.
      const [ax, az] = turnXZ((i0 - s.length / 2) * u, (k0 - s.width / 2) * u, turn);
      const [bx, bz] = turnXZ((i1 - s.length / 2) * u, (k1 - s.width / 2) * u, turn);
      const box: Box6 = [snap(Math.min(ax, bx) + at.x), snap(at.y), snap(Math.min(az, bz) + at.z), snap(Math.max(ax, bx) + at.x), snap(at.y + h), snap(Math.max(az, bz) + at.z)];
      this.lay(box, look, src);
      return box;
    });
  }

  /** Lay one stone filling a box (metres, on the 1/16 m texel grid); its units run along its longer side. */
  stone(box: Box6, look: BlockLook = {}): Box6 {
    this.lay(box, look, here());
    return box;
  }

  private lay(box: Box6, look: BlockLook, src: SourceTrace | undefined): void {
    const finish = look.finish ?? this.o.finish ?? BLOCK_FINISH.mossy;
    const lk = finishLook(finish, this.o.seed, { moss: look.moss ?? this.o.moss });
    const stone: Stone = { box, look: lk((box[0] + box[3]) / 2, (box[1] + box[4]) / 2, (box[2] + box[5]) / 2), face: FACE.pz, src };
    this.mason.stones.push(stone);
    this.laid.push({
      stone,
      box,
      finish,
      unit: this.unit,
      lines: look.lines ?? this.o.lines ?? 1,
      seed: Math.floor(hash3(Math.round(box[0] * 16), Math.round(box[1] * 16), Math.round(box[2] * 16), this.o.seed) * 1e6),
    });
  }

  /**
   * A course of stones in running bond from `from` to `to` along `axis`
   * (default x) at height y, `depth` thick (default one unit) centred on
   * `at` across it: mostly 1.0 m ashlars, now and then a 1.5 m one, every odd
   * `row` starting with a 0.5 m half stone; the ends are cut square. Returns
   * the stones' boxes.
   */
  course(o: { from: number; to: number; y: number; axis?: 'x' | 'z'; at?: number; row?: number; depth?: number } & BlockLook): Box6[] {
    const u = this.unit;
    const [a0, a1] = [Math.min(o.from, o.to), Math.max(o.from, o.to)];
    const c = o.at ?? 0;
    const d = (o.depth ?? u) / 2;
    const h = o.height ?? this.o.height ?? u;
    const r = rng(this.o.seed * 7 + Math.round(o.y * 16) * 131 + Math.round(c * 16) * 17 + Math.round(a0 * 16));
    const lay = (a: number, b: number): Box6 => {
      const box: Box6 = o.axis === 'z' ? [snap(c - d), snap(o.y), snap(a), snap(c + d), snap(o.y + h), snap(b)] : [snap(a), snap(o.y), snap(c - d), snap(b), snap(o.y + h), snap(c + d)];
      return this.stone(box, o);
    };
    const out: Box6[] = [];
    let a = a0;
    if ((o.row ?? 0) % 2 === 1 && a1 - a0 > 2 * u) out.push(lay(a, (a += u)));
    while (a < a1 - 1e-6) {
      // Never leave less than a unit at the end: the last stone takes the rest.
      let len = r.chance(0.2) ? 3 * u : 2 * u;
      if (a1 - (a + len) < u - 1e-6) len = a1 - a;
      out.push(lay(a, (a += len)));
    }
    return out;
  }

  /** Emit every stone with its grooves, moss and chips, and (unless `colliders` is false) their colliders. */
  emit(p: PieceBuilder, o: { colliders?: boolean } = {}): void {
    const stones = this.laid;
    const boxes = stones.map((s) => s.box);
    const inside = solidTest(boxes);
    // Faces wholly in the open are set back by the grooves' depth, so the grooves and flecks
    // on them come flush with the laid box (a block measures its true size).
    for (const s of stones) {
      const b: Box6 = [...s.box];
      for (const sd of [TOP, ...SIDES]) {
        if (![0.1, 0.5, 0.9].every((fu) => [0.1, 0.5, 0.9].every((fv) => exposedAt(s.box, sd, fu, fv, inside)))) continue;
        if (sd.sign > 0) b[sd.n + 3] -= PROUD;
        else b[sd.n] += PROUD;
      }
      s.stone.box = b;
    }
    // Chipped arrises on worn finishes (one chip on an open face of some stones).
    for (const s of stones) {
      const r = rng(s.seed + 3);
      if (s.finish.wear <= 0 || !r.chance(s.finish.wear * 1.8)) continue;
      const faces = SIDES.filter((sd) => exposedAt(s.stone.box, sd, 0.5, 0.5, inside));
      if (!faces.length) continue;
      s.stone.face = r.pick(faces).bit;
      this.mason.chip(s.stone, r.int(1, 1e6));
    }
    this.mason.emit(p.voxels);
    const src = here();
    for (const s of stones) faceMarks(p, s, inside, src);
    if (o.colliders ?? true) for (const b of mergeBoxes(boxes)) p.collider(b[0], b[1], b[2], b[3], b[4], b[5]);
  }
}

/** One block as a kit piece, its footprint centred on the origin, standing on y = 0. */
export function blockPiece(kind: BlockKind | BlockShape, o: BlockLook & { seed: number; turn?: number }): KitPiece {
  const p = new PieceBuilder();
  const layer = new BlockLayer(o);
  layer.block(kind, { x: 0, y: 0, z: 0, turn: o.turn });
  layer.emit(p);
  return p.done();
}

/** A face of a box: its FACE bit, normal axis and sign, and its in-plane axes (u across, v up / back). */
interface Side {
  bit: number;
  n: 0 | 1 | 2;
  sign: 1 | -1;
  u: 0 | 1 | 2;
  v: 0 | 1 | 2;
}
const SIDES: Side[] = [
  { bit: FACE.pz, n: 2, sign: 1, u: 0, v: 1 },
  { bit: FACE.nz, n: 2, sign: -1, u: 0, v: 1 },
  { bit: FACE.px, n: 0, sign: 1, u: 2, v: 1 },
  { bit: FACE.nx, n: 0, sign: -1, u: 2, v: 1 },
];
const TOP: Side = { bit: FACE.py, n: 1, sign: 1, u: 0, v: 2 };

/** Is the face open to the air at (fu, fv) (fractions across it)? */
function exposedAt(b: Box6, s: Side, fu: number, fv: number, inside: (x: number, y: number, z: number) => boolean): boolean {
  const p = [0, 0, 0];
  p[s.n] = s.sign > 0 ? b[s.n + 3] + PT / 2 : b[s.n] - PT / 2;
  p[s.u] = b[s.u] + (b[s.u + 3] - b[s.u]) * fu;
  p[s.v] = b[s.v] + (b[s.v + 3] - b[s.v]) * fv;
  return !inside(p[0], p[1], p[2]);
}

/**
 * The sheet's marks on one stone's open faces: grooves (unit seams, the
 * quarter lines), cracks on worn stone, and moss flecks.
 */
function faceMarks(p: PieceBuilder, s: LaidStone, inside: (x: number, y: number, z: number) => boolean, src: SourceTrace | undefined): void {
  // Laid out on the laid box; the notches sit on the stone's own (set back) edges.
  const b = s.box;
  const a = s.stone.box;
  const r = rng(s.seed);
  // The stone's flat-cut edge (the sandstone family's bevel: 6.5 % of the smallest side).
  const R = Math.min(a[3] - a[0], a[4] - a[1], a[5] - a[2]) * 0.065;
  const tones = s.stone.look.surf[0] >= 0.15 ? MOSSY_GROOVE : GROOVE;
  // Moss flecks follow the stone's own moss.
  const flecks = Math.min(1, s.stone.look.surf[0] * 2);
  const chip = s.stone.chip;
  const lip = s.stone.look.color;
  // A plate on face `sd` over u0‥u1 × v0‥v1 (metres, in the face's own axes), from the stone's face out to the laid box.
  // (`lift` < 1 keeps a plate under the grooves where they cross: no two faces in one plane)
  const plate = (sd: Side, u0: number, u1: number, v0: number, v1: number, tone: number, shade = 1, mat: 'sandstone' | 'leaves' = 'sandstone', lift = 1) => {
    const lo = [0, 0, 0];
    const hi = [0, 0, 0];
    lo[sd.n] = sd.sign > 0 ? a[sd.n + 3] : a[sd.n] - PROUD * lift;
    hi[sd.n] = lo[sd.n] + PROUD * lift;
    [lo[sd.u], hi[sd.u]] = [Math.min(u0, u1), Math.max(u0, u1)];
    [lo[sd.v], hi[sd.v]] = [Math.min(v0, v1), Math.max(v0, v1)];
    if (hi[sd.u] - lo[sd.u] < 1e-4 || hi[sd.v] - lo[sd.v] < 1e-4) return;
    if (chip && lo[0] < chip[3] && hi[0] > chip[0] && lo[1] < chip[4] && hi[1] > chip[1] && lo[2] < chip[5] && hi[2] > chip[2]) return;
    p.voxels.span(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2], tone, mat, { shade, open: sd.bit, src });
  };
  // A groove across the face's axis `c` (sd.u or sd.v) at `at`, running from‥to along the other:
  // its dark wall, and beside it the wall that faces the sun, lit.
  const groove = (sd: Side, c: number, at: number, from: number, to: number, dark: number, lit: number, tone: number) => {
    const sunSide = SUN[c] < 0 ? 1 : -1;
    const [d0, d1] = sunSide > 0 ? [at - dark, at] : [at, at + dark];
    const [l0, l1] = sunSide > 0 ? [at, at + lit] : [at - lit, at];
    // (on a top the lip is fainter: it would run as a pale line through the moss)
    const shade = sd === TOP ? 1.12 : 1.3;
    if (c === sd.v) {
      plate(sd, from, to, d0, d1, tone);
      plate(sd, from, to, l0, l1, lip, shade);
    } else {
      plate(sd, d0, d1, from, to, tone);
      plate(sd, l0, l1, from, to, lip, shade);
    }
  };
  const unitDark = (PT * 2) / 3;
  const unitLit = PT / 2;
  // The dark notch where a unit seam crosses the flat-cut arris between the top and side `sd`.
  const notch = (sd: Side, at: number, tone: number) => {
    const k = R * Math.SQRT2;
    const q = PROUD / 2 / Math.SQRT2;
    const y = a[4] - R / 2 + q;
    const o = sd.sign * (R / 2 - q);
    // (as wide as the groove's dark wall, and on the same side)
    const c = at + (SUN[sd.u] < 0 ? -1 : 1) * (unitDark / 2);
    if (sd.n === 2) p.voxels.box(c, y, (sd.sign > 0 ? a[5] : a[2]) - o, unitDark, PROUD, k, tone, 'sandstone', { rx: sd.sign * (Math.PI / 4), open: 4, src });
    else p.voxels.box((sd.sign > 0 ? a[3] : a[0]) - o, y, c, k, PROUD, unitDark, tone, 'sandstone', { rz: -sd.sign * (Math.PI / 4), open: 4, src });
  };
  const fineDark = PT / 3;
  const fineLit = PT / 4;
  const E = R + PT / 4;
  for (const sd of [TOP, ...SIDES]) {
    const [u0, u1] = [b[sd.u], b[sd.u + 3]];
    const [v0, v1] = [b[sd.v], b[sd.v + 3]];
    const nu = Math.max(1, Math.round((u1 - u0) / s.unit));
    const nv = sd === TOP ? Math.max(1, Math.round((v1 - v0) / s.unit)) : 1;
    const cu = (u1 - u0) / nu;
    const cv = (v1 - v0) / nv;
    const open = (i: number, j: number) => i >= 0 && j >= 0 && i < nu && j < nv && exposedAt(b, sd, (i + 0.5) / nu, (j + 0.5) / nv, inside);
    // Unit seams, right across the face (clear of the stone's flat-cut edges), notched into the arris.
    for (let i = 1; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        if (!open(i - 1, j) && !open(i, j)) continue;
        groove(sd, sd.u, u0 + i * cu, j === 0 ? v0 + E : v0 + j * cv, j === nv - 1 ? v1 - E : v0 + (j + 1) * cv, unitDark, unitLit, r.pick(tones));
        if (sd !== TOP && exposedAt(b, TOP, sd.n === 0 ? (sd.sign > 0 ? 0.99 : 0.01) : (u0 + i * cu - b[0]) / (b[3] - b[0]), sd.n === 2 ? (sd.sign > 0 ? 0.99 : 0.01) : (u0 + i * cu - b[2]) / (b[5] - b[2]), inside)) notch(sd, u0 + i * cu, r.pick(tones));
      }
    for (let j = 1; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        if (!open(i, j - 1) && !open(i, j)) continue;
        groove(sd, sd.v, v0 + j * cv, i === 0 ? u0 + E : u0 + i * cu, i === nu - 1 ? u1 - E : u0 + (i + 1) * cu, unitDark, unitLit, r.pick(tones));
      }
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        if (!open(i, j)) continue;
        const [ua, ub] = [u0 + i * cu, u0 + (i + 1) * cu];
        const [va, vb] = [v0 + j * cv, v0 + (j + 1) * cv];
        // (grooves start clear of the stone's flat-cut edge, or of a unit seam)
        const ia = i === 0 ? E : unitLit + PT / 4;
        const ib = i === nu - 1 ? E : unitDark + PT / 4;
        const ja = j === 0 ? E : unitLit + PT / 4;
        const jb = j === nv - 1 ? E : unitDark + PT / 4;
        const t = r.pick(tones);
        // (a texel off the middle now and then, like the sheet's hand-drawn lines)
        const mu = snap((ua + ub) / 2 + r.int(-1, 1) * (PT / 2) * (r() < 0.4 ? 1 : 0), PT / 2);
        const mv = snap((va + vb) / 2 + r.int(-1, 1) * (PT / 2) * (r() < 0.4 ? 1 : 0), PT / 2);
        const y = snap(v0 + (v1 - v0) * r.range(0.45, 0.55), PT / 2);
        if (s.lines > 0) {
          if (sd === TOP) {
            // A cross of grooves from the middle of each edge, stopping short of the centre (the sheet's "+").
            const reach = (half: number) => half * r.range(0.45, 0.8);
            const ch = 0.85 * s.lines;
            if (r.chance(ch)) groove(sd, sd.u, mu, va + ja, va + ja + reach(mv - va - ja), fineDark, fineLit, t);
            if (r.chance(ch)) groove(sd, sd.u, mu, vb - jb - reach(vb - jb - mv), vb - jb, fineDark, fineLit, t);
            if (r.chance(ch)) groove(sd, sd.v, mv, ua + ia, ua + ia + reach(mu - ua - ia), fineDark, fineLit, t);
            if (r.chance(ch)) groove(sd, sd.v, mv, ub - ib - reach(ub - ib - mu), ub - ib, fineDark, fineLit, t);
          } else {
            // A bedding groove at mid height, and an upright one in the lower or upper half.
            if (r.chance(0.85 * s.lines)) groove(sd, sd.v, y, ua + ia, ub - ib, fineDark, fineLit, t);
            if (r.chance(0.75 * s.lines)) {
              if ((i + Math.round(b[1] / s.unit)) % 2 === 0) groove(sd, sd.u, mu, v0 + E, y - fineDark - PT / 4, fineDark, fineLit, t);
              else groove(sd, sd.u, mu, y + fineLit + PT / 4, v1 - E, fineDark, fineLit, t);
            }
          }
        }
        const cracked = s.finish.wear > 0.2 && r.chance(s.finish.wear) ? crack(sd, [ua + ia, ub - ib], [va + ja, vb - jb], r) : [];
        if (flecks > 0.05) moss(sd, ua, va, [ua + ia, ub - ib], [va + ja, vb - jb], [mu], [sd === TOP ? mv : y], cracked, r);
      }
  }

  // Moss flecks on one unit face (its corner at ua, va), clear of its grooves: a few on a top (between the moss
  // pattern's patches), more on a side, most of them high up, some running down as drips.
  function moss(sd: Side, ua: number, va: number, [u0, u1]: number[], [v0, v1]: number[], uLines: number[], vLines: number[], cracked: number[][], r: Rng): void {
    const top = sd === TOP;
    // Cells of the pattern's texel grid that lie inside u0‥u1 × v0‥v1.
    const [i0, i1] = [Math.ceil((u0 - ua) / PT - 1e-6), Math.floor((u1 - ua) / PT + 1e-6) - 1];
    const [j0, j1] = [Math.ceil((v0 - va) / PT - 1e-6), Math.floor((v1 - va) / PT + 1e-6) - 1];
    if (i1 < i0 || j1 < j0) return;
    const taken = new Set<number>();
    const fits = (i: number, j: number) => {
      const [cu, cv] = [ua + i * PT, va + j * PT];
      if (taken.has(i * 64 + j) || cu < u0 || cu + PT > u1 || cv < v0 || cv + PT > v1) return false;
      if (cracked.some(([p0, p1, q0, q1]) => p0 < cu + PT && p1 > cu && q0 < cv + PT && q1 > cv)) return false;
      return uLines.every((l) => l < cu - PT / 2 || l > cu + 1.5 * PT) && vLines.every((l) => l < cv - PT / 2 || l > cv + 1.5 * PT);
    };
    const put = (i: number, j: number) => {
      taken.add(i * 64 + j);
      plate(sd, ua + i * PT, ua + (i + 1) * PT, va + j * PT, va + (j + 1) * PT, r.pick(FLECK), r.range(0.82, 1), 'leaves');
    };
    for (let n = Math.round(flecks * (top ? r.range(1, 5) : r.range(3, 8))); n > 0; n--) {
      const i = r.int(i0, i1);
      // (on a side, rows counted down from the top, most near it)
      const j = top ? r.int(j0, j1) : j1 - Math.floor(r() * r() * (j1 - j0 + 1));
      if (!fits(i, j)) continue;
      put(i, j);
      if (r.chance(0.35) && fits(i + 1, j)) put(i + 1, j);
      if (!top) for (let k = j - 1, run = r.int(0, 2); run > 0 && fits(i, k); k--, run--) put(i, k);
    }
  }

  // A stepped crack half a texel wide running in from an edge of the unit face (worn stone); returns its pieces (u0, u1, v0, v1).
  function crack(sd: Side, [ua, ub]: number[], [va, vb]: number[], r: Rng): number[][] {
    const alongV = r.chance(0.5);
    const [a0, a1] = alongV ? [va, vb] : [ua, ub];
    const [c0, c1] = alongV ? [ua, ub] : [va, vb];
    let c = snap(c0 + (c1 - c0) * r.range(0.2, 0.8), PT);
    const fromStart = r.chance(0.5);
    let at = fromStart ? a0 : a1;
    let left = (a1 - a0) * r.range(0.35, 0.7);
    const t = r.pick(tones);
    const out: number[][] = [];
    while (left > 1e-3) {
      const seg = Math.min(left, r.int(1, 3) * PT);
      const e = fromStart ? at + seg : at - seg;
      const [p0, p1] = [Math.min(at, e), Math.max(at, e)];
      out.push(alongV ? [c, c + PT / 2, p0, p1] : [p0, p1, c, c + PT / 2]);
      const [u0, u1, v0, v1] = out[out.length - 1];
      plate(sd, u0, u1, v0, v1, t, 1, 'sandstone', 0.6);
      at = e;
      left -= seg;
      c = Math.min(c1 - PT, Math.max(c0, c + r.int(-1, 1) * (PT / 2)));
    }
    return out;
  }
}

/**
 * Is a point inside one of the boxes (or below the ground, where blocks stand)?
 * A 1 m bucket grid keeps it quick on long walls.
 */
function solidTest(boxes: readonly Box6[]): (x: number, y: number, z: number) => boolean {
  const E = 1e-6;
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const buckets = new Map<string, Box6[]>();
  for (const b of boxes)
    for (let x = Math.floor(b[0] + E); x <= Math.floor(b[3] - E); x++)
      for (let y = Math.floor(b[1] + E); y <= Math.floor(b[4] - E); y++)
        for (let z = Math.floor(b[2] + E); z <= Math.floor(b[5] - E); z++) {
          const k = key(x, y, z);
          const list = buckets.get(k);
          if (list) list.push(b);
          else buckets.set(k, [b]);
        }
  return (x, y, z) => y < 0 || (buckets.get(key(Math.floor(x), Math.floor(y), Math.floor(z))) ?? []).some((b) => x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5]);
}

/**
 * Merge boxes that together make a bigger box (the stones of a block, a
 * course, a platform): along x, then z, then y, each pass joining boxes that
 * share their other four sides and touch end to end.
 */
function mergeBoxes(list: readonly Box6[]): Box6[] {
  let out = list.map((b) => [...b] as Box6);
  const r = (v: number) => Math.round(v * 1024);
  for (const ax of [0, 2, 1]) {
    const others = [0, 1, 2].filter((n) => n !== ax);
    const groups = new Map<string, Box6[]>();
    for (const b of out) {
      const k = others.map((n) => `${r(b[n])},${r(b[n + 3])}`).join('|');
      const g = groups.get(k);
      if (g) g.push(b);
      else groups.set(k, [b]);
    }
    out = [];
    for (const g of groups.values()) {
      g.sort((p, q) => p[ax] - q[ax]);
      let cur = g[0];
      for (const b of g.slice(1)) {
        if (r(b[ax]) === r(cur[ax + 3])) cur[ax + 3] = b[ax + 3];
        else {
          out.push(cur);
          cur = b;
        }
      }
      out.push(cur);
    }
  }
  return out;
}
