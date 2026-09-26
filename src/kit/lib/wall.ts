import { fromSheet } from '../palette';
import { placePiece } from '../place';
import { PieceBuilder } from '../PieceBuilder';
import { here, rng, snap, TEXEL } from '../shapes';
import { STONE_FINISH, stoneSurf, type StoneFinish } from '../surface';
import type { KitPiece } from '../types';
import { coursesOf, DryMasonry, FACE, finishLook, overgrow, spansOf, type Box6, type FacadeWeather, type Ledge, type Stone, type StoneLook } from './gallery';

/**
 * §15 wall system — the temple's free-standing and gallery walls, laid dry in
 * the §19.1 sandstone, as a stack of three layers (the sheet's "Wall layer
 * breakdown"):
 *
 *   upper block   cornice: two projecting bands (0.25 m each), then a coping
 *   main block    body courses (≈ 0.4–0.5 m) in running bond, string courses
 *                 under and over the window band
 *   foundation    moulded plinth: a 0.5 m footing and two 0.25 m bands, each
 *                 stepping back towards the wall face
 *
 * Real-world defaults ({@link WALL}): 1.0 m thick, 5.0 m from the ground to the
 * top of the cornice (1.0 m plinth, 3.5 m body, 0.5 m cornice) plus a 0.375 m
 * coping, stones ≈ 1 m long laid in leaves ≈ 0.5 m deep (a 1 m wall shows two
 * stones on its end and top, like the sheet's side and top views).
 *
 * ## Placement contract
 * - Straight segments ({@link wallSegment}) run along X with their ends at
 *   exactly x = ±length/2; the wall is centred on z = 0 (body z = ±thickness/2),
 *   front face +Z, standing on y = 0. Mouldings stand out beyond the body faces
 *   (plinth footing and top cornice band 0.25 m each side) but never beyond the
 *   ends. `'open'` ends tile: put the next segment at x + length.
 * - End kinds: `'open'` (tiles), `'return'` (mouldings wrap round a plain end),
 *   `'pier'` (a finished end: a pier 0.75 m wide, 0.25 m proud of both faces,
 *   its mouldings wrapping round the end), `'inner-pier'` (a pier 1.0 m wide
 *   set flush with the end, so the next `'open'` segment continues from it: a
 *   pier every segment along a run). Every pier kind takes 1.0 m of the length.
 *   Two `'pier'` ends placed back to back leave a slot between their shafts —
 *   tile with `'open'` / `'inner-pier'` ends.
 * - Corners ({@link wallCorner}): the origin is where the two wall axes cross
 *   (the centre of the 1.5 × 1.5 m corner pier). Outside corner: arm A runs
 *   along −X to x = −arm, arm B along −Z to z = −arm (arm = 6 m by
 *   default); their fronts (+Z for A, +X for B) are the outside of the L.
 *   Inside corner: arm A runs along +X, arm B along +Z; the decorated faces
 *   (+Z for A, +X for B) are the inside. To
 *   continue arm A with an `'open'` segment of length L: x = cx − arm − L/2,
 *   z = cz, turn 0 (inside: x = cx + arm + L/2). Arm B: x = cx,
 *   z = cz − arm − L/2, turn 1 (inside: z = cz + arm + L/2, turn 1) —
 *   `place.ts` turn 1 turns a segment's front to +X and its +X end to −Z.
 * - Piers ({@link wallPier}) are centred on the origin; a side listed in
 *   `joins` has its mouldings cut flush with the shaft, so a wall run butts
 *   against it there: a pier `width` wide ends an `'open'` run whose end is
 *   at x = e when placed at x = e + width/2 with `joins: FACE.nx` (the §15
 *   end cap is 2.0 m wide: x = e + 1.0).
 * - Openings ({@link WallOpening}) are cut at given x, sill and head: doors and
 *   windows go through, blind windows and niches are recesses in a face. The
 *   courses are laid around them; each gets a default frame (jamb stones
 *   standing a texel proud, a lintel over doors) and infill (turned balusters
 *   in windows), or a caller's `draw` hook fills the frame zone the wall left
 *   free ({@link OpeningDraw}). Openings keep a course under the cornice: a
 *   standard door (2.5 m on the 1 m plinth, 0.5 m lintel) needs a wall at
 *   least 4.5 m high; lower walls shorten it.
 * - Colliders: solid boxes for the plinth bands, the body, the cornice, the
 *   coping and the piers (the cornice and coping tops are walkable); openings
 *   that go through stay open.
 *
 * ## Usage
 * ```ts
 * import { WALL_STONE, blindWindows, wallSegment, wallSpan } from '../../lib/wall';
 * // A 6 m wall with a finished pier at each end and blind windows between them:
 * const piece = wallSegment({ length: 6, ends: 'pier', ...WALL_STONE.weathered, seed });
 * // A door in the middle of a 4 m open-ended segment, with the caller's frame:
 * wallSegment({ length: 4, ...WALL_STONE.weathered, seed, openings: [{ kind: 'door', x: 0, draw: (d) => myDoorFrame(d) }] });
 * // Windows over the part of the body between the piers:
 * const [x0, x1] = wallSpan({ length: 12, ends: 'pier' });
 * wallSegment({ length: 12, ends: 'pier', ...WALL_STONE.mossy, seed, openings: blindWindows(x0, x1, { face: 'both' }) });
 * ```
 */

/** Face bits (+x 1, −x 2, +y 4, −y 8, +z 16, −z 32) for `joins`, re-exported for callers. */
export { FACE };

const T = TEXEL;
const E = 1e-6;
/**
 * The stones at the back of a recess (a blind window, a niche) are in deep
 * shadow, as the sheet paints its baluster band (#483b34 / #241e1c): the lit
 * balusters stand out against them.
 */
const RECESS = [0x4c3c30, 0x44362b, 0x544236, 0x3f3228];
/** Stones run about this deep into the wall: thicker courses are laid in several leaves. */
const LEAF = 0.6;

/** A moulding band: its height and how far it stands out of the body's face (metres). */
export type Band = readonly [height: number, out: number];

/** A string course: a band `h` high at height `y`, standing `out` proud of the wall faces. */
export interface StringCourse {
  y: number;
  h: number;
  out: number;
  /** Also runs round the piers, standing this far proud of them (else it dies into their sides). */
  pier?: number;
}

/** The kit standard for walls (SIZES-ARCH §1.3–1.5, §2 §15), metres. */
export const WALL = {
  thickness: 1.0,
  /** Ground to the top of the cornice. */
  height: 5.0,
  /** Footing and two bands, from the ground up: [height, set-out beyond the wall face]. */
  plinth: [
    [0.5, 0.25],
    [0.25, 0.125],
    [0.25, 0.0625],
  ] as readonly Band[],
  /** Cornice bands under the wall top, from the bottom: each corbels further out. */
  cornice: [
    [0.25, 0.125],
    [0.25, 0.25],
  ] as readonly Band[],
  /** Capping course on the cornice, as thick as the body (0 = none, e.g. under a roof). */
  coping: 0.375,
  /** Sill string under the window band, head string over it (wrapping the piers as a capital band). */
  strings: [
    { y: 1.25, h: 0.25, out: 0.125 },
    { y: 3.125, h: 0.25, out: 0.125, pier: 0.1875 },
  ] as readonly StringCourse[],
  /** Bay of the window rhythm. */
  bay: 2.0,
  /** Baluster windows: 1.375 × 1.625 m clear, sill 0.5 m above the plinth; frame 0.1875 m; blind recess depth. */
  window: { width: 1.375, sill: 1.5, head: 3.125, frame: 0.1875, depth: 0.1875 },
  /** Standard gallery door (SIZES-ARCH §1.4): clear 1.25 × 2.5 m from the plinth top, jambs 0.375 m, 0.5 m lintel. */
  door: { width: 1.25, height: 2.5, frame: 0.375, lintel: 0.5 },
  /** Piers at the segment ends: shaft width along the wall, how far proud of each face, rise of the head above the cornice. */
  pier: { width: 0.75, proud: 0.25, head: 0.75 },
  /** Corner pier and free-standing end cap: 1.5 m square. */
  post: 1.5,
} as const;

/** The finishes of the §15 sheet, with the weather that goes with each. */
export interface WallStone {
  finish: StoneFinish;
  weather: FacadeWeather;
}

/**
 * The §15 sheet's stone: the tan-brown sandstone of its walls (lit faces
 * #a7825f–#b89570, mid #947158) — between the §19.1 warm and weathered
 * samples — so every §15 piece is laid in the same stone.
 */
const SHEET_TAN = [0xa7825f, 0xb08a66, 0x9c7a5c, 0xb89570, 0x94735a].map(fromSheet);
/** The mossy variant's stone: the sheet's sandstone a shade darker under the green. */
const SHEET_MOSSY = [0x9c7a5c, 0x94735a, 0xa7825f, 0x8c6d55].map(fromSheet);
/** The thick wall's older stone: the sheet draws it a shade darker (#846547, #947158 lit). */
const SHEET_AGED = [0x9a785a, 0x8e6f55, 0xa58061, 0x876953, 0x967358].map(fromSheet);

export const WALL_STONE = {
  /** The sheet: warm stone, grime under the ledges, moss on the tops and low down, a split stone or two. */
  weathered: {
    finish: { palette: SHEET_TAN, surf: stoneSurf({ moss: 0.3, lichen: 0.1, stain: 0.3 }), wear: 0.2 },
    weather: { moss: 0.25, grass: 0.3, cracked: 1, missing: 0, streaks: 0.35 },
  },
  /** Overgrown: moss everywhere on the tops and the plinth, grass in the joints. */
  mossy: {
    finish: { palette: SHEET_MOSSY, surf: stoneSurf({ moss: 0.6, lichen: 0.08, stain: 0.2 }), wear: 0.12 },
    weather: { moss: 0.9, grass: 0.6, cracked: 1, missing: 1, streaks: 0.25 },
  },
  /** Newly built: clean dressed stone. */
  clean: { finish: STONE_FINISH.warm, weather: { moss: 0, grass: 0, cracked: 0, missing: 0, streaks: 0 } },
  /** Old and dark (the thick wall): the sheet's aged stone, heavily streaked. */
  aged: {
    finish: { palette: SHEET_AGED, surf: stoneSurf({ moss: 0.4, lichen: 0.12, stain: 0.35 }), wear: 0.28 },
    weather: { moss: 0.4, grass: 0.35, cracked: 2, missing: 1, streaks: 0.4 },
  },
} satisfies Record<string, WallStone>;

// ── Options ───────────────────────────────────────────────────────────────────

/** The layers of the stack (see {@link WALL}); `height` is the top of the cornice. */
export interface WallStackOptions {
  thickness?: number;
  height?: number;
  plinth?: readonly Band[];
  cornice?: readonly Band[];
  coping?: number;
  strings?: readonly StringCourse[];
  /** Build only some layers (the foundation and upper wall blocks). Default: all. */
  layers?: { plinth?: boolean; body?: boolean; cornice?: boolean };
}

/** How a segment ends at −X / +X (see the placement contract). */
export type WallEnd = 'open' | 'return' | 'pier' | 'inner-pier';

export type OpeningKind = 'door' | 'window' | 'blind' | 'niche';

/** An opening cut through or into a wall run. */
export interface WallOpening {
  kind: OpeningKind;
  /** Centre along the run (piece x). */
  x: number;
  /** Clear width (default: door 1.25, windows 1.375, niche 0.75 m). */
  width?: number;
  /** Clear bottom above the ground (default: door on the plinth top, windows 1.5 m, niche 0.5 m over the plinth). A door below the plinth top cuts through it. */
  sill?: number;
  /** Clear top above the ground (default: door sill + 2.5 m, windows 3.125 m, niche 0.5 m under the cornice). */
  head?: number;
  /**
   * The frame round the clear opening, which the wall leaves free for it
   * (metres; default: windows 0.1875 each side; doors 0.375 each side and a
   * 0.5 m lintel; niches 0.125 all round).
   */
  frame?: { side?: number; head?: number; sill?: number };
  /** How deep a blind window or niche goes into the face (default 0.1875 / 0.25 m). */
  depth?: number;
  /** The face a blind window or niche is cut into (default front); doors and windows go through. */
  face?: 'front' | 'back' | 'both';
  /** Balusters in a window (default one per 0.1875 m: 7 in a 1.375 m window, as at Angkor Wat). */
  balusters?: number;
  /** Draw the frame and infill yourself, instead of the default jambs, lintel and balusters. */
  draw?: (d: OpeningDraw) => void;
}

/** What a {@link WallOpening.draw} hook gets: the wall's builder and the space left for the frame. */
export interface OpeningDraw {
  p: PieceBuilder;
  /** The wall's masonry: lay frame stones here (`m.course(…)`) so their joints and damage match the wall. */
  m: DryMasonry;
  /** The wall's stone look (colour, pattern, grime) at a point. */
  look: (x: number, y: number, z: number) => StoneLook;
  finish: StoneFinish;
  seed: number;
  kind: OpeningKind;
  /** Clear opening: x a‥b, y sill‥head. */
  a: number;
  b: number;
  sill: number;
  head: number;
  /** The frame zone the wall left free around it: x oa‥ob, y oy0‥oy1. */
  oa: number;
  ob: number;
  oy0: number;
  oy1: number;
  /** Half the wall's thickness: its faces are z = ±t. */
  t: number;
  /** The empty boxes left for frame and infill (the whole depth through doors and windows; the recess of a blind window or niche). */
  cuts: Box6[];
  balusters: number;
  /** Add a ledge (facing +Z) for moss and grass. */
  ledge(x0: number, z0: number, x1: number, z1: number, y: number): void;
}

export interface WallSegmentOptions extends WallStackOptions {
  length: number;
  finish: StoneFinish;
  seed: number;
  /** Both ends, or [−X end, +X end] (default open). */
  ends?: WallEnd | readonly [WallEnd, WallEnd];
  /** Openings (default: blind windows across the body, one per 2 m bay, in the front face). [] = plain wall. */
  openings?: readonly WallOpening[];
  weather?: FacadeWeather;
}

// ── Stack and openings ────────────────────────────────────────────────────────

interface Stack {
  /** Plinth top, cornice bottom, cornice top (ground = 0). */
  P: number;
  Hc: number;
  H: number;
  plinth: readonly Band[];
  cornice: readonly Band[];
  coping: number;
  strings: readonly StringCourse[];
  body: boolean;
}

const sum = (bands: readonly Band[]) => bands.reduce((s, [h]) => s + h, 0);

function stackOf(o: WallStackOptions): Stack {
  const L = o.layers ?? {};
  const plinth = L.plinth === false ? [] : (o.plinth ?? WALL.plinth);
  const cornice = L.cornice === false ? [] : (o.cornice ?? WALL.cornice);
  const body = L.body !== false;
  const P = sum(plinth);
  const C = sum(cornice);
  const H = body ? snap(Math.max(P + C + 0.5, o.height ?? WALL.height)) : P + C;
  const Hc = H - C;
  const strings = body ? (o.strings ?? WALL.strings).filter((s) => s.y >= P - E && s.y + s.h <= Hc - 0.25 + E) : [];
  return { P, Hc, H, plinth, cornice, coping: L.cornice === false ? 0 : snap(o.coping ?? WALL.coping), strings, body };
}

/** An opening resolved against its wall. */
interface Hole {
  kind: OpeningKind;
  a: number;
  b: number;
  sill: number;
  head: number;
  oa: number;
  ob: number;
  oy0: number;
  oy1: number;
  through: boolean;
  /** Faces a recess is cut into (FACE.pz / nz). */
  faces: number;
  depth: number;
  balusters: number;
  draw?: (d: OpeningDraw) => void;
}

function holeOf(q: WallOpening, S: Stack, t: number): Hole {
  const door = q.kind === 'door';
  const win = q.kind === 'window' || q.kind === 'blind';
  const w = snap(q.width ?? (door ? WALL.door.width : win ? WALL.window.width : 0.75));
  const fr = q.frame ?? {};
  const side = snap(fr.side ?? (door ? WALL.door.frame : win ? WALL.window.frame : 0.125));
  const fh = snap(fr.head ?? (door ? WALL.door.lintel : q.kind === 'niche' ? 0.125 : 0));
  const fs = snap(fr.sill ?? (q.kind === 'niche' ? 0.125 : 0));
  const sill = snap(Math.max(0, q.sill ?? (door ? S.P : win ? WALL.window.sill : S.P + 0.5)));
  // (a head never reaches into the cornice: its frame stops a course under it)
  const head = snap(Math.min(S.Hc - fh, q.head ?? (door ? sill + WALL.door.height : win ? WALL.window.head : S.Hc - 0.5)));
  const a = snap(q.x - w / 2);
  const through = door || q.kind === 'window';
  const faces = through ? FACE.pz | FACE.nz : q.face === 'back' ? FACE.nz : q.face === 'both' ? FACE.pz | FACE.nz : FACE.pz;
  const depth = snap(Math.min(faces === (FACE.pz | FACE.nz) ? t - 2 * T : 2 * t - 4 * T, q.depth ?? (q.kind === 'niche' ? 0.25 : WALL.window.depth)));
  return {
    kind: q.kind,
    a,
    b: a + w,
    sill,
    head,
    oa: a - side,
    ob: a + w + side,
    oy0: Math.max(0, sill - fs),
    oy1: head + fh,
    through,
    faces,
    depth,
    balusters: q.balusters ?? Math.max(3, Math.round(w / 0.1875)),
    draw: q.draw,
  };
}

/**
 * Blind windows spread evenly along x0‥x1, one per bay (default 2 m) where it
 * fits: the sheet's band of balusters, as Angkor Wat's false windows — seven
 * turned balusters half-sunk in a shallow recess, the wall solid behind.
 */
export function blindWindows(x0: number, x1: number, o: Omit<Partial<WallOpening>, 'x'> & { bay?: number } = {}): WallOpening[] {
  const { bay = WALL.bay, ...rest } = o;
  const outer = (o.width ?? WALL.window.width) + 2 * (o.frame?.side ?? WALL.window.frame);
  let n = Math.max(0, Math.round((x1 - x0) / bay));
  while (n > 0 && (x1 - x0) / n < outer + 0.125 - E) n--;
  return Array.from({ length: n }, (_, i) => ({ kind: 'blind' as const, ...rest, x: snap(x0 + ((x1 - x0) * (i + 0.5)) / n) }));
}

/** Room taken at a segment end by each end kind: a pier and its return, or a flush pier as wide. */
const endRoom = (e: WallEnd, out: number) => (e === 'open' ? 0 : e === 'return' ? out : WALL.pier.width + out);

/** The largest set-out of a stack's mouldings: how far a returned end reaches past the body. */
const maxOut = (S: Stack) => Math.max(0, ...S.plinth.map(([, o]) => o), ...S.cornice.map(([, o]) => o));

const endsOf = (e: WallSegmentOptions['ends']): [WallEnd, WallEnd] => (Array.isArray(e) ? [e[0], e[1]] : [(e as WallEnd) ?? 'open', (e as WallEnd) ?? 'open']);

/** The x-range of a segment's wall body between its piers / returned ends (where openings go). */
export function wallSpan(o: Pick<WallSegmentOptions, 'length' | 'ends' | keyof WallStackOptions>): [number, number] {
  const L = snap(o.length);
  const S = stackOf(o);
  const out = maxOut(S);
  const [e0, e1] = endsOf(o.ends);
  return [-L / 2 + endRoom(e0, out), L / 2 - endRoom(e1, out)];
}

// ── The mason: lays runs and piers into one piece ─────────────────────────────

type Look = (x: number, y: number, z: number) => StoneLook;
/** Footprint rectangle [x0, z0, x1, z1]. */
type Rect = [number, number, number, number];
/** A tier of a pier's head: its height and how far it steps in from the one below along x (and z, default the same). */
type Tier = readonly [h: number, inset: number, insetZ?: number];
/** How a run's end meets what is beyond it. */
type RunEnd = 'open' | 'return' | 'join';

interface LayOptions {
  row: number;
  /** Faces of the course abutting other stone (FACE bits), besides the joints between leaves. */
  closed: number;
  length: readonly [number, number];
  /** Interior leaf boundaries (z) to keep, so a recess's stones line up with the wall's leaves. */
  leaves?: readonly number[];
  /** Leaves to lay in shadow: the front (FACE.pz) and / or back (FACE.nz) one. */
  dim?: number;
  /** Stack bond: every course alike (piers). */
  stack?: boolean;
  openBelow?: [number, number][];
  /** Plain wall stones: may be split or knocked out. */
  plain?: boolean;
}

/** A straight run of wall (or a pier: a short run) in the mason's frame. */
interface Run {
  /** The body along x, half its thickness (the body is z = ±t). */
  x0: number;
  x1: number;
  t: number;
  S: Stack;
  ends: [RunEnd, RunEnd];
  /** Faces (FACE.pz / nz) where a wall joins it: mouldings cut flush with the body there. */
  flush?: number;
  holes?: Hole[];
  /** Piers: stack-bonded courses of stones this long; strings only where they run round piers. */
  pier?: number;
  /**
   * Courses above the cornice (piers): the head's rise, then tiers stepping in
   * along x and z (negative = out); `antefix` sets small finials on the
   * cornice's four corners, as on Khmer tower tiers.
   */
  head?: { rise: number; tiers: readonly Tier[]; antefix?: boolean };
  /** Skip the coping (piers carry a head instead). */
  noCoping?: boolean;
}

interface SideLedge extends Ledge {
  /** Which way it faces, in quarter turns of +Z (0 +Z, 1 +X, 2 −Z, 3 −X). */
  f: number;
}

class Mason {
  readonly p = new PieceBuilder();
  readonly m: DryMasonry;
  readonly look: Look;
  readonly dim: Look;
  readonly w: Required<FacadeWeather>;
  /** Plain wall stones on the front (split or knocked out by age), and every stone with an open face (chipped). */
  private readonly plain: Stone[] = [];
  private readonly faces: Stone[] = [];
  private readonly ledges: SideLedge[] = [];

  constructor(
    readonly finish: StoneFinish,
    readonly seed: number,
    weather: FacadeWeather | undefined,
    span: [number, number],
  ) {
    const f = finish;
    this.m = new DryMasonry(seed);
    this.w = {
      missing: weather?.missing ?? 0,
      cracked: weather?.cracked ?? (f.surf[2] >= 0.3 ? 1 : 0),
      moss: weather?.moss ?? (f.surf[0] >= 0.4 ? f.surf[0] : 0),
      grass: weather?.grass ?? 0,
      streaks: weather?.streaks ?? (f.surf[3] >= 0.2 ? f.surf[3] : 0),
    };
    // Run-off streaks: bands of grime down the face where rain runs off the cornice.
    const r = rng(seed * 7 + 3);
    const bands: [number, number, number][] = [];
    if (this.w.streaks > 0) for (let x = span[0] + r.range(0.2, 1.2); x < span[1]; x += r.range(0.9, 2.2)) bands.push([x, r.range(0.25, 0.6), r.range(0.5, 1)]);
    const streaks = (x: number, y: number) => {
      let s = 0;
      for (const [bx, bw, k] of bands) if (Math.abs(x - bx) < bw) s = Math.max(s, k * Math.min(1, 0.35 + y / 6));
      return s * this.w.streaks;
    };
    this.look = finishLook(f, seed, { streaks });
    this.dim = (x, y, z) => {
      const l = this.look(x, y, z);
      return { ...l, color: RECESS[Math.floor(Math.abs(x * 5.3 + y * 7.1) * RECESS.length) % RECESS.length] };
    };
  }

  /**
   * Lay one course over `box` in leaves across its depth (z): the front leaf
   * shows the front face, the back leaf the back face. Returns the front
   * leaf's stones (their joints are where grass takes root).
   */
  lay(box: Box6, o: LayOptions): Stone[] {
    const depth = box[5] - box[2];
    const cuts = o.leaves
      ? o.leaves.filter((z) => z > box[2] + 2 * T && z < box[5] - 2 * T)
      : Array.from({ length: Math.max(1, Math.round(depth / LEAF)) - 1 }, (_, i) => snap(box[2] + (depth * (i + 1)) / Math.max(1, Math.round(depth / LEAF))));
    const zs = [box[2], ...cuts, box[5]];
    const n = zs.length - 1;
    let front: Stone[] = [];
    for (let i = 0; i < n; i++) {
      const isFront = i === n - 1;
      const isBack = i === 0;
      const closed = o.closed | (isBack ? 0 : FACE.nz) | (isFront ? 0 : FACE.pz);
      const face = isFront || !isBack ? FACE.pz : FACE.nz;
      const dim = (isFront && (o.dim ?? 0) & FACE.pz) || (isBack && (o.dim ?? 0) & FACE.nz);
      const stones = this.m.course([box[0], box[1], zs[i], box[3], box[4], zs[i + 1]], {
        length: [o.length[0], o.length[1]],
        row: o.stack ? 0 : o.row + i,
        closed,
        face,
        look: dim ? this.dim : this.look,
        openBelow: o.openBelow,
      });
      const shows = (isFront && !(o.closed & FACE.pz)) || (isBack && !(o.closed & FACE.nz));
      // (chips only on stones big enough to keep their shape: on a thin band a chip leaves a one-texel shelf)
      if (shows) this.faces.push(...stones.filter((st) => st.box[4] - st.box[1] >= 0.375 && Math.max(st.box[3] - st.box[0], st.box[5] - st.box[2]) >= 0.5));
      if (isFront) {
        front = stones;
        if (o.plain && !(o.closed & FACE.pz) && !dim) this.plain.push(...stones.filter((s) => s.box[3] - s.box[0] >= 0.5 && s.box[4] - s.box[1] >= 0.25));
      }
    }
    return front;
  }

  /** A ledge (for moss and grass) over the rectangle x0‥x1 × z0‥z1 at height y, facing `f` (quarter turns of +Z). */
  ledge(f: number, x0: number, z0: number, x1: number, z1: number, y: number, joints: number[] = []): void {
    if (x1 - x0 < T - E || z1 - z0 < T - E) return;
    this.ledges.push({ f, x0, z0, x1, z1, y, joints });
  }

  /** The exposed ring of a course's top between its outer footprint and the footprint of what stands on it. */
  ring(o: Rect, i: Rect, y: number, skip = 0, joints: number[] = []): void {
    if (!(skip & FACE.pz)) this.ledge(0, o[0], i[3], o[2], o[3], y, joints);
    if (!(skip & FACE.nz)) this.ledge(2, o[0], o[1], o[2], i[1], y, joints);
    if (!(skip & FACE.px)) this.ledge(1, i[2], i[1], o[2], i[3], y);
    if (!(skip & FACE.nx)) this.ledge(3, o[0], i[1], i[0], i[3], y);
  }

  /** Lay a straight run (or a pier) from the plinth to the coping / head. */
  run(r: Run): void {
    const { x0, x1, t, S } = r;
    const flush = r.flush ?? 0;
    const holes = r.holes ?? [];
    const nLeaves = Math.max(1, Math.round((2 * t) / LEAF));
    const leaves = Array.from({ length: nLeaves - 1 }, (_, i) => snap(-t + (2 * t * (i + 1)) / nLeaves));
    const pierLen = r.pier ?? 0;
    const length = (l: readonly [number, number]): readonly [number, number] => (pierLen ? [pierLen, pierLen] : l);
    // A course standing `out` proud of the body: its footprint, its ends' closed bits.
    const ext = (out: number): Rect => [x0 - (r.ends[0] === 'return' ? out : 0), -t - (flush & FACE.nz ? 0 : out), x1 + (r.ends[1] === 'return' ? out : 0), t + (flush & FACE.pz ? 0 : out)];
    // Sides without a ledge: flush faces and joined ends.
    const skip = flush | (r.ends[0] === 'return' ? 0 : FACE.nx) | (r.ends[1] === 'return' ? 0 : FACE.px);
    const jointsOf = (stones: Stone[]) => stones.slice(0, -1).map((s) => s.box[3]);
    const body: Rect = [x0, -t, x1, t];

    // Foundation: the plinth bands, stepping back as they rise; doors cut through them.
    let y = 0;
    S.plinth.forEach(([h, out], i) => {
      const [bx0, bz0, bx1, bz1] = ext(out);
      const above = i + 1 < S.plinth.length ? ext(S.plinth[i + 1][1]) : S.body ? body : null;
      const cut = holes.filter((q) => q.oy0 < y + h - E).map((q): [number, number] => [q.oa, q.ob]);
      // (a door through the plinth: default jambs stand in the gap from its sill up)
      for (const q of holes) if (!q.draw && q.oy0 < y + h - E && q.sill <= y + E) for (const [a, b] of [[q.oa, q.a], [q.b, q.ob]]) this.lay([a, y, -t - T, b, y + h, t + T], { row: i, closed: FACE.ny | FACE.py, length: [b - a, b - a], leaves });
      for (const [a, b] of spansOf(bx0, bx1, cut)) {
        const front = this.lay([a, y, bz0, b, y + h, bz1], { row: i, closed: FACE.ny, length: length(h >= 0.5 ? [0.75, 1.25] : [0.5, 1.0]) });
        const top: Rect = above ? [Math.max(a, above[0]), above[1], Math.min(b, above[2]), above[3]] : [(a + b) / 2, 0, (a + b) / 2, 0];
        this.ring([a, bz0, b, bz1], top, y + h, skip | (a > bx0 + E ? FACE.nx : 0) | (b < bx1 - E ? FACE.px : 0), jointsOf(front));
        this.p.collider(a, y, bz0, b, y + h, bz1);
      }
      y += h;
    });

    if (S.body) this.body(r, leaves, length, ext, skip, jointsOf);

    // Upper block: the cornice bands corbelling out, then the coping (or a pier's head).
    let yc = S.Hc;
    S.cornice.forEach(([h, out], i) => {
      const box = ext(out);
      const last = i === S.cornice.length - 1;
      const front = this.lay([box[0], yc, box[1], box[2], yc + h, box[3]], { row: i + 1, closed: last ? 0 : FACE.py, length: length([0.5, 1.0]) });
      if (last) {
        const cap = r.head ? body : S.coping > 0 && !r.noCoping ? copingOf(r) : null;
        this.ring(box, cap ?? [(box[0] + box[2]) / 2, 0, (box[0] + box[2]) / 2, 0], yc + h, skip, jointsOf(front));
        this.p.collider(box[0], S.Hc, box[1], box[2], S.H, box[3]);
      }
      yc += h;
    });
    if (!S.cornice.length) return;

    if (r.head) {
      // A pier's head: stack-bonded courses of the shaft, then its tiers stepping in (or out: a cap band).
      let foot: Rect = body;
      let yh = S.H;
      const rows = coursesOf(r.head.rise);
      // (the top row's top is open where the first tier steps in)
      const coveredTop = (r.head.tiers[0]?.[1] ?? 1) < 0;
      rows.forEach((h, i) => {
        const top = i < rows.length - 1 || coveredTop ? FACE.py : 0;
        this.lay([foot[0], yh, foot[1], foot[2], yh + h, foot[3]], { row: 0, closed: FACE.ny | top, length: [pierLen || 0.5, pierLen || 0.5], stack: true });
        yh += h;
      });
      this.p.collider(foot[0], S.H, foot[1], foot[2], yh, foot[3]);
      if (r.head.antefix) {
        // Finials on the cornice's corners, in the ring the head leaves: a block and a smaller one on it.
        const band = ext(S.cornice[S.cornice.length - 1][1]);
        const w = Math.min(foot[0] - band[0], foot[1] - band[1]);
        for (const [cx, cz] of [
          [band[0] + w / 2, band[1] + w / 2],
          [band[2] - w / 2, band[1] + w / 2],
          [band[0] + w / 2, band[3] - w / 2],
          [band[2] - w / 2, band[3] - w / 2],
        ]) {
          this.lay([cx - w / 2, S.H, cz - w / 2, cx + w / 2, S.H + 0.25, cz + w / 2], { row: 0, closed: FACE.ny, length: [w, w] });
          this.lay([cx - w / 4, S.H + 0.25, cz - w / 4, cx + w / 4, S.H + 0.4375, cz + w / 4], { row: 0, closed: FACE.ny, length: [w / 2, w / 2] });
        }
      }
      r.head.tiers.forEach(([h, inset, iz = inset], i) => {
        const next: Rect = [snap(foot[0] + inset), snap(foot[1] + iz), snap(foot[2] - inset), snap(foot[3] - iz)];
        // (a tier set in leaves a ledge on the one below; a cap band standing out overhangs it)
        if (inset > 0) this.ring(foot, next, yh);
        const w = next[2] - next[0];
        this.lay([next[0], yh, next[1], next[2], yh + h, next[3]], { row: i, closed: inset > 0 ? FACE.ny : 0, length: [Math.min(w, Math.max(0.375, w / 2)), Math.min(w, Math.max(0.375, w / 2))], stack: true });
        this.p.collider(next[0], yh, next[1], next[2], yh + h, next[3]);
        foot = next;
        yh += h;
      });
      // The crown's top.
      const mz = (foot[1] + foot[3]) / 2;
      this.ledge(0, foot[0], mz, foot[2], foot[3], yh);
      this.ledge(2, foot[0], foot[1], foot[2], mz, yh);
    } else if (S.coping > 0 && !r.noCoping) {
      const c = copingOf(r);
      const front = this.lay([c[0], S.H, c[1], c[2], S.H + S.coping, c[3]], { row: 3, closed: FACE.ny, length: length([0.5, 1.0]) });
      this.ledge(0, c[0], 0, c[2], c[3], S.H + S.coping, jointsOf(front));
      this.ledge(2, c[0], c[1], c[2], 0, S.H + S.coping, jointsOf(front));
      this.p.collider(c[0], S.H, c[1], c[2], S.H + S.coping, c[3]);
    }
  }

  /** The main block: body courses and string courses, laid round the openings. */
  private body(
    r: Run,
    leaves: number[],
    length: (l: readonly [number, number]) => readonly [number, number],
    ext: (out: number) => Rect,
    skip: number,
    jointsOf: (s: Stone[]) => number[],
  ): void {
    const { x0, x1, t, S } = r;
    const holes = r.holes ?? [];
    const { P, Hc } = S;
    // Strings: on a wall all of them; on a pier only those that run round it, standing out their own way.
    const strings = r.pier ? S.strings.filter((s) => s.pier).map((s) => ({ ...s, out: s.pier! })) : S.strings;
    // Course boundaries: the plinth top, the cornice, every opening's frame and clear edges, the strings.
    const fixed = new Set<number>([P, Hc]);
    for (const q of holes) for (const v of [q.oy0, q.sill, q.head, q.oy1]) if (v > P + E && v < Hc - E) fixed.add(v);
    const levels = [...fixed];
    for (const s of strings) for (const v of [s.y, s.y + s.h]) if (!levels.some((l) => Math.abs(l - v) < E)) levels.push(v);
    levels.sort((a, b) => a - b);

    let row = 0;
    for (let l = 0; l + 1 < levels.length; l++) {
      const str = strings.find((s) => Math.abs(s.y - levels[l]) < E && Math.abs(s.y + s.h - levels[l + 1]) < E);
      let yb = levels[l];
      for (const h of str ? [levels[l + 1] - levels[l]] : coursesOf(levels[l + 1] - levels[l])) {
        const [ya, yc] = [yb, yb + h];
        yb = yc;
        const over = holes.filter((q) => q.oy0 < yc - E && q.oy1 > ya + E);
        const box = ext(str?.out ?? 0);
        // (a course whose top is the floor of an opening, or whose underside roofs one, keeps its fill off those faces)
        const topOpen = holes.some((q) => Math.abs(q.oy0 - yc) < E);
        const openBelow = holes.filter((q) => Math.abs(q.oy1 - ya) < E).map((q): [number, number] => [q.oa, q.ob]);
        const closed = str ? 0 : FACE.ny | (topOpen ? 0 : FACE.py);
        for (const [a, b] of spansOf(box[0], box[2], over.map((q) => [q.oa, q.ob]))) {
          const front = this.lay([a, ya, box[1], b, yc, box[3]], { row, closed, length: length([0.75, 1.25]), leaves, openBelow, plain: !str && !r.pier, stack: !!r.pier });
          if (str) {
            // The string's top is a ledge, broken where an opening cuts it.
            const cutL = a > box[0] + E ? FACE.nx : 0;
            const cutR = b < box[2] - E ? FACE.px : 0;
            this.ring([a, box[1], b, box[3]], [Math.max(a, x0), -t, Math.min(b, x1), t], yc, skip | cutL | cutR, jointsOf(front));
          }
        }
        for (const q of over) this.opening(q, r, ya, yc, row, leaves);
        row++;
      }
    }

    // Colliders: the body, less the clear openings that go through.
    const through = holes.filter((q) => q.through);
    for (const [a, b] of spansOf(x0, x1, through.map((q) => [q.a, q.b]))) this.p.collider(a, P, -t, b, Hc, t);
    for (const q of through) {
      if (q.sill > P + E) this.p.collider(q.a, P, -t, q.b, q.sill, t);
      if (q.head < Hc - E) this.p.collider(q.a, q.head, -t, q.b, Hc, t);
      // (a door through the plinth: its jambs stand in the plinth's gap)
      if (q.sill < P - E) for (const [a, b] of [[q.oa, q.a], [q.b, q.ob]]) this.p.collider(a, q.sill, -t, b, P, t);
    }
    // Openings: the caller's frame and infill, or the default ones.
    for (const q of holes) this.fillOpening(q, r);
  }

  /** One course's worth of an opening: the recess stones behind a blind window / niche, and the default frame stones. */
  private opening(q: Hole, r: Run, ya: number, yc: number, row: number, leaves: number[]): void {
    const t = r.t;
    const zf = q.through ? t : q.faces & FACE.pz ? t - q.depth : t;
    const zb = q.through ? -t : q.faces & FACE.nz ? -t + q.depth : -t;
    if (!q.through) {
      // The wall behind the recess, its face in shadow; its ends abut the courses either side.
      this.lay([Math.max(q.oa, r.x0), ya, zb, Math.min(q.ob, r.x1), yc, zf], {
        row,
        closed: FACE.ny | FACE.py | FACE.nx | FACE.px | (q.faces & FACE.pz ? 0 : FACE.pz) | (q.faces & FACE.nz ? 0 : FACE.nz),
        length: [0.75, 1.25],
        leaves,
        dim: q.faces,
      });
    }
    if (q.draw) return;
    // Default frame: jambs standing proud of the face (a niche's moulded frame more), a sill stone and a lintel across the whole frame.
    const inClear = ya >= q.sill - E && yc <= q.head + E;
    const pr = q.kind === 'niche' ? 2 * T : T;
    const zs: [number, number][] = [];
    if (q.through) zs.push([-t - pr, t + pr]);
    else {
      if (q.faces & FACE.pz) zs.push([zf, t + pr]);
      if (q.faces & FACE.nz) zs.push([-t - pr, zb]);
    }
    for (const [z0, z1] of zs) {
      const spans: [number, number][] = inClear ? [[q.oa, q.a], [q.b, q.ob]] : [[q.oa, q.ob]];
      for (const [a, b] of spans) {
        if (b - a < T - E) continue;
        this.lay([a, ya, z0, b, yc, z1], { row, closed: FACE.ny | FACE.py, length: [b - a, b - a], leaves });
      }
    }
  }

  /** After the courses: the caller's hook, or the default infill (balusters). */
  private fillOpening(q: Hole, r: Run): void {
    const t = r.t;
    const zf = q.through ? t : q.faces & FACE.pz ? t - q.depth : t;
    const zb = q.through ? -t : q.faces & FACE.nz ? -t + q.depth : -t;
    if (q.draw) {
      const cuts: Box6[] = q.through
        ? [[q.oa, q.oy0, -t, q.ob, q.oy1, t]]
        : [...(q.faces & FACE.pz ? [[q.oa, q.oy0, zf, q.ob, q.oy1, t] as Box6] : []), ...(q.faces & FACE.nz ? [[q.oa, q.oy0, -t, q.ob, q.oy1, zb] as Box6] : [])];
      q.draw({
        p: this.p,
        m: this.m,
        look: this.look,
        finish: this.finish,
        seed: this.seed,
        kind: q.kind,
        a: q.a,
        b: q.b,
        sill: q.sill,
        head: q.head,
        oa: q.oa,
        ob: q.ob,
        oy0: q.oy0,
        oy1: q.oy1,
        t,
        cuts,
        balusters: q.balusters,
        ledge: (lx0, lz0, lx1, lz1, ly) => this.ledge(0, lx0, lz0, lx1, lz1, ly),
      });
      return;
    }
    if (q.kind !== 'window' && q.kind !== 'blind') return;
    // Balusters: through a window, in the middle of the wall; in a blind window, half-sunk in the recess.
    const w = q.b - q.a;
    const n = q.balusters;
    const zc: number[] = q.through ? [0] : [...(q.faces & FACE.pz ? [zf + T / 2] : []), ...(q.faces & FACE.nz ? [zb - T / 2] : [])];
    for (const z of zc)
      for (let k = 0; k < n; k++) turnedBaluster(this.p, snap(q.a + ((k + 0.5) * w) / n), q.sill, q.head, z, this.finish.palette, this.finish.surf, this.seed + k * 7 + Math.round(q.a * 16));
  }

  /** Split and knock out plain stones, chip the rest, emit the masonry and grow the moss and grass. */
  done(): KitPiece {
    const dr = rng(this.seed * 13 + 5);
    const plain = [...this.plain];
    const pick = () => plain.splice(dr.int(0, plain.length - 1), 1)[0];
    for (let k = 0; k < this.w.cracked && plain.length; k++) this.m.crack(pick(), dr.int(1, 1e6));
    for (let k = 0; k < this.w.missing && plain.length; k++) this.m.knockOut(pick(), 0.5);
    for (const s of this.faces) if (!s.crack && !s.gone && dr.chance(this.finish.wear * 0.6)) this.m.chip(s, dr.int(1, 1e6));
    this.m.emit(this.p.voxels);
    if (this.w.moss > 0 || this.w.grass > 0) {
      for (let f = 0; f < 4; f++) {
        const ls = this.ledges.filter((l) => l.f === f).map((l) => toLocal(l, f));
        if (!ls.length) continue;
        if (f === 0) overgrow(this.p, ls, this.w.moss, this.w.grass, this.seed);
        else {
          // Ledges facing another way grow as if facing +Z, then turn into place.
          const tmp = new PieceBuilder();
          overgrow(tmp, ls, this.w.moss, this.w.grass, this.seed + f * 101);
          placePiece({ voxels: this.p.voxels }, tmp.done(), { x: 0, y: 0, z: 0, turn: f });
        }
      }
    }
    return this.p.done();
  }
}

/** The coping's footprint over a run's body (set in a texel from the faces, so the cornice keeps a lit edge). */
function copingOf(r: Run): Rect {
  return [r.x0, -r.t + T, r.x1, r.t - T];
}

/** A ledge turned into the frame where it faces +Z (the frame `overgrow` works in). */
function toLocal(l: SideLedge, f: number): Ledge {
  if (f === 0) return l;
  const turn = (4 - f) % 4;
  const tx = (x: number, z: number) => (turn === 2 ? [-x, -z] : turn === 1 ? [z, -x] : [-z, x]);
  const [ax, az] = tx(l.x0, l.z0);
  const [bx, bz] = tx(l.x1, l.z1);
  // Joints lie along the ledge's run: x for ±Z ledges, z for ±X ledges.
  const along = (v: number) => (f === 2 ? -v : f === 1 ? -v : v);
  return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz), y: l.y, joints: l.joints.map(along) };
}

/**
 * A lathe-turned baluster slim enough for seven to a 1.375 m window (0.1875 m
 * apart, as at Angkor Wat): a square foot, a shaft 3/32 m thick (the real
 * necks are ≈ 0.10 m, so the dark behind shows between them), a ring at a
 * quarter and three quarters of its height and a double ring at the middle, a
 * capital — the rings nearly touch the next baluster's, like the real ones.
 */
export function turnedBaluster(p: PieceBuilder, x: number, y0: number, y1: number, z: number, palette: readonly number[], surf: StoneLook['surf'], seed: number): void {
  const v = p.voxels;
  const src = here();
  const n = Math.max(12, Math.round((y1 - y0) / T));
  const tone = (k: number) => palette[Math.floor(rng(seed + k)() * palette.length) % palette.length];
  const part = (j0: number, j1: number, w: number, k: number, shade = 1) => v.box(x, y0 + ((j0 + j1) / 2) * T, z, w, (j1 - j0) * T, w, tone(k), 'sandstone', { shade, surf, src });
  const RING = 2.5 * T;
  const SHAFT = 1.5 * T;
  const FOOT = 2.5 * T;
  const r1 = Math.round(n * 0.26);
  const r2 = Math.round(n * 0.5) - 1;
  const r3 = Math.round(n * 0.74) - 1;
  part(0, 1, FOOT, 0);
  part(1, n - 1, SHAFT, 1, 0.9);
  part(r1, r1 + 1, RING, 2);
  part(r2, r2 + 2, RING, 3);
  part(r3, r3 + 1, RING, 4);
  part(n - 1, n, FOOT, 5);
}

// ── Public builders ───────────────────────────────────────────────────────────

/** A straight wall segment along X (see the placement contract). */
export function wallSegment(o: WallSegmentOptions): KitPiece {
  const L = snap(o.length);
  const t = snap((o.thickness ?? WALL.thickness) / 2);
  const S = stackOf(o);
  const out = maxOut(S);
  const [e0, e1] = endsOf(o.ends);
  const [x0, x1] = wallSpan(o);
  const mason = new Mason(o.finish, o.seed, o.weather, [-L / 2, L / 2]);
  const pp = WALL.pier.proud;
  const runEnd = (e: WallEnd): RunEnd => (e === 'open' ? 'open' : e === 'return' ? 'return' : 'join');
  // Piers: the shaft, a finished pier's mouldings wrapping round the segment's end.
  const pierAt = (side: -1 | 1, e: WallEnd) => {
    if (e !== 'pier' && e !== 'inner-pier') return;
    const outer = (side * L) / 2 - side * (e === 'pier' ? out : 0);
    const inner = side < 0 ? x0 : x1;
    mason.run({
      x0: Math.min(inner, outer),
      x1: Math.max(inner, outer),
      t: t + pp,
      S,
      ends: side < 0 ? [e === 'pier' ? 'return' : 'open', 'join'] : ['join', e === 'pier' ? 'return' : 'open'],
      pier: 0.375,
      head: pierHead(S),
    });
  };
  pierAt(-1, e0);
  pierAt(1, e1);
  const holes = (o.openings ?? blindWindows(x0, x1)).map((q) => holeOf(q, S, t));
  mason.run({ x0, x1, t, S, ends: [runEnd(e0), runEnd(e1)], holes });
  return mason.done();
}

/** The head of a segment's pier: one course over the cornice, a cap band standing out, a low crowning stone. */
function pierHead(S: Stack): Run['head'] {
  return S.cornice.length ? { rise: WALL.pier.head, tiers: [[0.125, -0.0625], [0.25, 0.1875]] } : undefined;
}

export interface WallPierOptions extends WallStackOptions {
  finish: StoneFinish;
  seed: number;
  weather?: FacadeWeather;
  /** Shaft size along X and Z (default 1.5 × 1.5 m). */
  width?: number;
  depth?: number;
  /** Sides where a wall joins (FACE.px / nx / pz / nz): their mouldings are cut flush with the shaft. */
  joins?: number;
  /** A framed niche panel (a false door) in the front, or front and back. */
  niche?: 'front' | 'both';
  /** Head over the cornice: stepped tiers rising to a crowning block (default), or the segments' low cap. */
  head?: 'tiers' | 'cap';
}

/** A free-standing pier or end cap, centred on the origin (see the placement contract). */
export function wallPier(o: WallPierOptions): KitPiece {
  const base = stackOf(o);
  const W = snap(o.width ?? WALL.post);
  const t = snap((o.depth ?? WALL.post) / 2);
  const joins = o.joins ?? 0;
  const mason = new Mason(o.finish, o.seed, o.weather, [-W / 2 - 0.25, W / 2 + 0.25]);
  const holes: Hole[] = [];
  let S = base;
  if (o.niche && base.body) {
    // A false door: a panel recessed a quarter metre in a frame, from over the plinth to a course under the cornice;
    // bands that would cross it stay off the pier.
    const niche = holeOf(
      { kind: 'niche', x: 0, width: snap(W * 0.4, 0.125), sill: base.P + 0.5, head: base.P + 2.5, depth: 0.375, frame: { side: 0.1875, head: 0.25, sill: 0.125 }, face: o.niche === 'both' ? 'both' : 'front' },
      base,
      t,
    );
    holes.push(niche);
    // A band on the plinth and one under the capital frame the niche, as on the sheet.
    S = { ...base, strings: [{ y: base.P, h: 0.25, out: 0, pier: 0.125 }, { y: base.Hc - 0.5, h: 0.25, out: 0, pier: 0.125 }].filter((s) => s.y >= niche.oy1 - E || s.y + s.h <= niche.oy0 + E) };
  }
  // Two tiers stepping in, then a crowning block about a third of the shaft's depth, square on top.
  const crown = snap(Math.min(W, 2 * t) / 3, 0.125);
  const kx = snap((W - crown) / 6);
  const kz = snap((2 * t - crown) / 6);
  const tiers: Tier[] = o.head === 'cap' ? [[0.125, -0.0625], [0.25, 0.1875]] : [[0.375, kx, kz], [0.375, kx, kz], [0.5, snap((W - crown) / 2 - 2 * kx), snap((2 * t - crown) / 2 - 2 * kz)]];
  mason.run({
    x0: -W / 2,
    x1: W / 2,
    t,
    S,
    ends: [joins & FACE.nx ? 'join' : 'return', joins & FACE.px ? 'join' : 'return'],
    flush: joins & (FACE.pz | FACE.nz),
    holes,
    pier: 0.375,
    head: S.cornice.length ? { rise: o.head === 'cap' ? WALL.pier.head : 0.25, tiers, antefix: o.head !== 'cap' } : undefined,
  });
  return mason.done();
}

export interface WallCornerOptions extends WallStackOptions {
  finish: StoneFinish;
  seed: number;
  weather?: FacadeWeather;
  /** From the corner's axis point to each arm's end (default 6 m). */
  arm?: number;
  /** Inside corner: the arms run +X and +Z and the decorated faces are the inside of the L. */
  inside?: boolean;
  /** The arms' far ends (default a finished pier). */
  ends?: 'pier' | 'open' | 'return';
  /** Blind windows along the arms (default true). */
  windows?: boolean;
}

/** An L of two wall arms round a 1.5 m corner pier (see the placement contract). */
export function wallCorner(o: WallCornerOptions): KitPiece {
  const arm = snap(o.arm ?? 6);
  const t = snap((o.thickness ?? WALL.thickness) / 2);
  const S = stackOf(o);
  const out = maxOut(S);
  const c = WALL.post / 2;
  const inside = !!o.inside;
  const far = o.ends ?? 'pier';
  // Arm A in the corner's own frame (with the pier); arm B built the same way along X, then turned to run along Z.
  const a = new Mason(o.finish, o.seed, o.weather, [-arm, arm]);
  a.run({
    x0: -c,
    x1: c,
    t: c,
    S,
    ends: inside ? ['return', 'join'] : ['join', 'return'],
    flush: inside ? FACE.pz : FACE.nz,
    pier: 0.375,
    head: { rise: WALL.pier.head, tiers: [[0.125, -0.0625], [0.25, 0.1875], [0.25, 0.25]] },
  });
  // An arm from the pier's face to its far end, as a run along +X from `from` to `to` (from < to).
  const armRun = (m: Mason, near: 'lo' | 'hi') => {
    const room = far === 'pier' ? WALL.pier.width + out : far === 'return' ? out : 0;
    const [lo, hi] = near === 'lo' ? [c, arm - room] : [-arm + room, -c];
    const farEnd: RunEnd = far === 'open' ? 'open' : far === 'return' ? 'return' : 'join';
    if (far === 'pier') {
      const [px0, px1] = near === 'lo' ? [hi, arm - out] : [-arm + out, lo];
      m.run({ x0: px0, x1: px1, t: t + WALL.pier.proud, S, ends: near === 'lo' ? ['join', 'return'] : ['return', 'join'], pier: 0.375, head: pierHead(S) });
    }
    const holes = o.windows === false ? [] : blindWindows(lo, hi).map((q) => holeOf(q, S, t));
    m.run({ x0: lo, x1: hi, t, S, ends: near === 'lo' ? ['join', farEnd] : [farEnd, 'join'], holes });
  };
  armRun(a, inside ? 'lo' : 'hi');
  const piece = a.done();
  // Arm B: local +X maps to world −Z under turn 1, so the outside arm (world z −arm‥−c) is local x c‥arm.
  const b = new Mason(o.finish, o.seed + 17, o.weather, [-arm, arm]);
  armRun(b, inside ? 'hi' : 'lo');
  const pb = new PieceBuilder();
  pb.voxels.boxes.push(...piece.voxels.boxes);
  pb.colliders.push(...piece.colliders);
  placePiece({ voxels: pb.voxels, collider: (col) => pb.colliders.push(col) }, b.done(), { x: 0, y: 0, z: 0, turn: 1 });
  return pb.done();
}
