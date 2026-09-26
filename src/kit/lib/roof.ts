import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { SANDSTONE } from '../palette';
import { placePiece } from '../place';
import { PieceBuilder } from '../PieceBuilder';
import { here, rng, snap, TEXEL } from '../shapes';
import { stoneSurf, surfMax, type StoneFinish } from '../surface';
import type { KitPiece } from '../types';
import { coursesOf, DryMasonry, FACE, finishLook, overgrow, type Box6, type Ledge, type Stone, type StoneLook } from './gallery';

/**
 * Stone roofs (§21.2 ⑤ roof tile and ⑥ roof tier; used by the §15 gallery
 * walls and the §21.3 gallery, corner and gopura modules).
 *
 * **Gallery roof** ({@link galleryRoof}) — Angkor's galleries are roofed with
 * corbelled stone vaults whose outside is carved to look like rows of curved
 * tiles: each 0.25 m course of the vault steps in as a row of tiles 0.25 m
 * wide over an eave band of long stones, lined up in columns down the slope,
 * every other one standing a texel proud (the cover tiles' ribs); a ridge beam along the top with lotus buds;
 * the ends closed by stepped gables (pediments) or left open to run on. Contract:
 *  - The ridge runs along X; the roof's ends are at exactly x = ±length/2, so
 *    straight roofs tile by placing the next one at x + length (2 m = one bay).
 *  - y = 0 is the bearing: the top of the walls / cornice the roof sits on.
 *    The ridge beam's top is at y = rise (a gable end and its finial stand
 *    higher).
 *  - The walls under it span z = ±width/2 (default 4.5 m: a 2.5 m corridor
 *    between 1.0 m walls); the eaves overhang them by `eave` (0.25 m). With
 *    a `corridor`, the vault is open under the roof over z = ±corridor/2 and
 *    corbels in, course by course, to close under the ridge.
 *  - `lean`: a half-gallery's lean-to roof — the +Z slope only, from its eave
 *    up to the back at z = −width/2, where it meets a taller wall.
 *  - A gable end is `GABLE` (0.5 m) thick, inside the length, its face a
 *    texel inside the end. Its stepped frame stands two rows above the
 *    tiles; its finial crowns the apex.
 *
 * **Roof tiers** ({@link roofTiers}) — the stepped roof of a gopura or
 * pavilion: 3–4 tiers of 1.0–1.5 m, each set back 0.5–0.75 m from the one
 * below, on a redented (cross-shaped) plan, each a miniature of the building —
 * a body carved with panels or a band of false baluster windows under a
 * projecting cornice, antefixes on its corners, moss on the ledges — and a
 * lotus bud on top. Contract: centred on x = z = 0, standing on y = 0 (the
 * cornice of the building below); the lowest tier's body is width × depth,
 * its plinth and cornice a texel or two wider; the top of the last tier is at
 * `TierInfo.top`.
 *
 * @example
 * // A 6 m gallery roof on walls whose cornice top is at y = 5, gabled at its +X end:
 * const p = new PieceBuilder();
 * galleryRoof(p, { length: 6, finish: STONE_FINISH.weathered, seed, ends: ['open', 'gable'], at: [0, 5, 0] });
 * // A pavilion's roof: four tiers on an 8 × 8 m cornice at y = 5.5:
 * roofTiers(p, { finish: STONE_FINISH.warm, seed, width: 7.5, tiers: 4, at: [0, 5.5, 0] });
 */

const T = TEXEL;

/** The gallery-roof defaults (metres; SIZES-ARCH §1.3, §1.7, §2 §21.2). */
export const ROOF = {
  /** Outside width of the walls under the roof: 2.5 m corridor + 2 × 1.0 m walls. */
  width: 4.5,
  corridor: 2.5,
  /** Ridge top above the cornice (real 2.0–2.75 m). */
  rise: 2.5,
  eave: 0.25,
  /** A row of tiles = one course of the vault. */
  row: 0.25,
  /** Width of a tile (the ribs are every other tile). */
  rib: 0.25,
  /** How convex the slopes are (0 = straight): steeper at the eaves, like the vault inside. */
  curve: 0.15,
} as const;

/** Thickness of a gable end. */
export const GABLE = 0.5;

/** How a gallery roof ends: runs on (tiles along), a closed carved gable, or a gable arched over the open vault. */
export type RoofEnd = 'open' | 'gable' | 'arch';

export interface GalleryRoofOptions {
  /** Along X; the ends are at ±length/2. */
  length: number;
  finish: StoneFinish;
  seed: number;
  width?: number;
  /** Clear span of the vault under the roof (0 = a solid roof). */
  corridor?: number;
  rise?: number;
  eave?: number;
  row?: number;
  rib?: number;
  curve?: number;
  /** A lean-to (half-gallery) roof: the +Z slope only, its back at z = −width/2. */
  lean?: boolean;
  /** The −X and +X ends (default both open). */
  ends?: [RoofEnd, RoofEnd];
  /** Small lotus buds along the ridge (default true). */
  crest?: boolean;
  /** Where the roof's origin (centre of the bearing) goes in the piece. */
  at?: [number, number, number];
  /** Lay the stones into this masonry (the caller emits it; see lib/stair.ts). */
  masonry?: DryMasonry;
  /** Moss on the tiles (0‥1, default from the finish) and grass along the ridge (0‥1, default 0). */
  moss?: number;
  grass?: number;
}

/** One row of tiles (a course of the vault), as a half-section: z ≥ 0 side unless `lean`. */
export interface RoofRow {
  y0: number;
  y1: number;
  /** z of the row's front (eave-side) face. */
  outer: number;
  /**
   * The solid's other side: for a two-slope roof the vault's half-width at
   * this row (0 = closed across); for a lean-to the z of the vault's front
   * edge, or −width/2 where the half vault has closed.
   */
  inner: number;
}

export interface RoofProfile {
  rows: RoofRow[];
  /** The ridge beam's half-width (two slopes) — the last row's tread runs back to it. */
  ridge: number;
  /** Top of the ridge beam (= rise), or of the last row for a lean-to. */
  top: number;
  /** Back of a lean-to (−width/2). */
  back: number;
}

/** The rows of a gallery roof (piece space, before `at`). */
export function roofProfile(o: Omit<GalleryRoofOptions, 'finish' | 'seed' | 'length'>): RoofProfile {
  const W = snap(o.width ?? ROOF.width);
  const h = Math.max(2 * T, snap(o.row ?? ROOF.row));
  const rise = snap(o.rise ?? ROOF.rise);
  const c = Math.max(0, snap(o.corridor ?? ROOF.corridor));
  const Z0 = W / 2 + snap(o.eave ?? ROOF.eave);
  const p = 1 + Math.max(0, o.curve ?? ROOF.curve);
  const back = -W / 2;
  const rows: RoofRow[] = [];
  if (!o.lean) {
    // Two slopes stepping in from the eaves to a 0.5 m ridge beam, one row under the top.
    const ridge = 0.25;
    const n = Math.max(2, Math.round(rise / h) - 1);
    const nv = n - 1;
    for (let k = 0; k < n; k++) {
      const outer = snap(Z0 - (Z0 - ridge) * (k / n) ** p);
      // The vault: steep over the walls, corbelling in faster near its top (a pointed arch).
      let inner = c > 0 ? snap((c / 2) * (1 - (k / nv) ** 1.6)) : 0;
      inner = Math.min(inner, snap(outer - 0.5));
      rows.push({ y0: k * h, y1: (k + 1) * h, outer, inner: inner >= 0.125 ? inner : 0 });
    }
    return { rows, ridge, top: (n + 1) * h, back };
  }
  // Lean-to: one slope from the eave back to the wall behind; the half vault closes against it.
  const n = Math.max(2, Math.round(rise / h));
  const end = back + 0.25;
  for (let k = 0; k < n; k++) {
    const outer = snap(Z0 - (Z0 - end) * (k / (n - 1)) ** p);
    let inner = c > 0 ? snap(back + c * (1 - (k / (n - 1)) ** 1.6)) : back;
    inner = Math.min(inner, snap(outer - 0.5));
    rows.push({ y0: k * h, y1: (k + 1) * h, outer, inner: inner > back + 0.1 ? inner : back });
  }
  return { rows, ridge: 0, top: n * h, back };
}

export interface RoofInfo extends RoofProfile {
  /** Ledges for moss and grass (the ridge and the gable steps). */
  ledges: Ledge[];
}

/**
 * The corbelled gallery roof (see the contract at the top of the file):
 * rows of tiles, ribs, the vault, the ridge with its crest, gable ends.
 */
export function galleryRoof(p: PieceBuilder, o: GalleryRoofOptions): RoofInfo {
  const prof = roofProfile(o);
  const { rows } = prof;
  const f = o.finish;
  const [ax, ay, az] = o.at ?? [0, 0, 0];
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box6 => [x0 + ax, y0 + ay, z0 + az, x1 + ax, y1 + ay, z1 + az];
  const m = o.masonry ?? new DryMasonry(o.seed);
  const moss = o.moss ?? (f.surf[0] >= 0.4 ? f.surf[0] : 0.15);
  const look = finishLook(f, o.seed, { moss: moss * 0.6 });
  // The vault's faces: the same stone, dark with soot and shadow.
  const dark = (x: number, y: number, z: number): StoneLook => ({ ...look(x, y, z), shade: VAULT_SHADE, surf: surfMax(f.surf, VAULT) });
  const L = snap(o.length);
  const ends = o.ends ?? ['open', 'open'];
  const xs = -L / 2 + (ends[0] === 'open' ? 0 : GABLE);
  const xe = L / 2 - (ends[1] === 'open' ? 0 : GABLE);
  const ledges: Ledge[] = [];
  const h = rows[0].y1 - rows[0].y0;

  // Rows of tiles: each a course of the vault, split along the ridge into its
  // two slopes. Tiles one rib pitch wide line up in columns down the slope and
  // every other one stands a texel proud of the row's face: the cover tiles'
  // ribs. Where the vault is open under a row, a course of dark corbels lines it.
  const nt = Math.max(1, Math.round((xe - xs) / snap(o.rib ?? ROOF.rib)));
  const edge = (j: number) => snap(xs + (j * (xe - xs)) / nt);
  const ribs = Array.from({ length: Math.floor(nt / 2) }, (_, j) => ({ a: edge(2 * j + 1), b: edge(2 * j + 2), proud: T }));
  const tile = snap((xe - xs) / nt);
  rows.forEach((r, k) => {
    const spans: [number, number, number][] = []; // z0, z1, the face it shows
    if (o.lean) spans.push([Math.max(prof.back, r.inner), r.outer, FACE.pz]);
    else spans.push([r.inner, r.outer, FACE.pz], [-r.outer, -r.inner, FACE.nz]);
    const open = o.lean ? r.inner > prof.back : r.inner > 0;
    for (const [z0, z1, face] of spans) {
      const d = open ? Math.min(0.25, snap((z1 - z0) / 3)) : 0;
      // (the vault's side of the span: the corbels there; else the other slope or the wall behind)
      const low = face === FACE.pz;
      const [t0, t1] = d ? (low ? [z0 + d, z1] : [z0, z1 - d]) : [z0, z1];
      const closed = d ? 0 : low ? FACE.nz : FACE.pz;
      // (the eave row is a band of long stones, as on the sheet: the tiles start above it)
      const tiles = k === 0 ? { length: [0.75, 1.5] as [number, number], row: 1 } : { length: [tile, tile] as [number, number], row: 0, fixed: ribs };
      m.course(box(xs, r.y0, t0, xe, r.y1, t1), { ...tiles, face, closed, look });
      if (d) m.course(box(xs, r.y0, low ? z0 : z1 - d, xe, r.y1, low ? z0 + d : z1), { length: [0.75, 1.5], row: k, face: low ? FACE.nz : FACE.pz, closed: 0, look: dark });
      p.collider(...box(xs, r.y0, z0, xe, r.y1, z1));
    }
  });

  // The ridge beam, and a row of small lotus buds along it.
  if (!o.lean) {
    const y = prof.top - h;
    const stones = m.course(box(xs, y, -prof.ridge, xe, prof.top, prof.ridge), { length: [0.75, 1.5], row: 1, look });
    p.collider(...box(xs, y, -prof.ridge, xe, prof.top, prof.ridge));
    ledges.push({ x0: xs + ax, x1: xe + ax, y: prof.top + ay, z0: -prof.ridge + az, z1: prof.ridge + az, joints: stones.slice(0, -1).map((s) => s.box[3]) });
  }

  // Gable ends.
  const gables: GableInfo[] = [];
  ends.forEach((e, i) => {
    if (e === 'open') return;
    gables.push(gable(m, p, prof, { side: i === 0 ? -1 : 1, x: i === 0 ? -L / 2 : L / 2, arch: e === 'arch', box, look, ledges, ax, ay, az }));
  });

  if (!o.masonry) {
    ageStones(m, f, o.seed);
    m.emit(p.voxels);
  }

  const v = p.voxels;
  const src = here();
  // Crest: small lotus buds along the ridge, one a metre.
  if (!o.lean && o.crest !== false) {
    const nb = Math.max(1, Math.round((xe - xs) / 1.0));
    for (let j = 0; j < nb; j++) {
      const x = snap(xs + ((j + 0.5) * (xe - xs)) / nb);
      lotusBud(v, x + ax, prof.top + ay, az, 0.25, look(x, prof.top, 0), src);
    }
  }
  for (const g of gables) gableDetails(v, g, look, ends[g.side < 0 ? 0 : 1] === 'gable' && !o.lean, [ax, ay, az], src);

  if (!o.masonry && (moss > 0.3 || (o.grass ?? 0) > 0)) overgrow(p, ledges, moss > 0.3 ? moss * 0.6 : 0, o.grass ?? 0, o.seed);
  return { ...prof, ledges };
}

/** A gallery roof on its own, as a kit piece. */
export function galleryRoofPiece(o: GalleryRoofOptions): KitPiece {
  const p = new PieceBuilder();
  galleryRoof(p, o);
  return p.done();
}

/** Soot and grime inside the vault, and its shadow. */
const VAULT = stoneSurf({ stain: 0.7 });
const VAULT_SHADE = 0.5;

interface GableInfo {
  side: 1 | -1;
  /** The gable's outer face. */
  x: number;
  /** Half-width of each course of the gable (from the bottom). */
  half: number[];
  /** The vault's half-width under each course when arched over it. */
  hole: number[];
  /** Courses that are all frame (no tympanum). */
  full: boolean[];
  h: number;
  /** Top of the eave-wide courses at its foot (the naga ends stand there). */
  foot: number;
  /** Top of the gable (the finial stands on it). */
  top: number;
  lean: boolean;
}

/** How many rows a gable's stepped outline stands above the tiles, and its frame's width. */
const GABLE_LIFT = 2;
const GABLE_FRAME = 0.375;

/**
 * A stepped gable (pediment wall): courses two rows higher than the tiles
 * beside them, so its stepped outline stands well clear of the roof, as on
 * the sheet; a frame a texel proud of the recessed tympanum; courses over the
 * ridge. `arch` leaves the vault open under it, framed.
 */
function gable(
  m: DryMasonry,
  p: PieceBuilder,
  prof: RoofProfile,
  g: { side: 1 | -1; x: number; arch: boolean; box: (...b: Box6) => Box6; look: (x: number, y: number, z: number) => StoneLook; ledges: Ledge[]; ax: number; ay: number; az: number },
): GableInfo {
  const { rows } = prof;
  const h = rows[0].y1 - rows[0].y0;
  const n = rows.length;
  const lean = prof.ridge === 0;
  const fw = GABLE_FRAME;
  const half: number[] = [];
  const hole: number[] = [];
  const full: boolean[] = [];
  for (let k = 0; k <= n + GABLE_LIFT - (lean ? 1 : 0); k++) {
    const i = k - GABLE_LIFT;
    half.push(i < 0 ? rows[0].outer + 0.125 : i < n ? rows[i].outer : prof.ridge);
    hole.push(g.arch && k < n ? (lean ? 0 : rows[k].inner) : 0);
  }
  // (x0..x1: the gable's thickness; the tympanum is recessed a texel from its face)
  const [x0, x1] = g.side > 0 ? [g.x - GABLE, g.x] : [g.x, g.x + GABLE];
  const face = g.side > 0 ? FACE.px : FACE.nx;
  half.forEach((hw, k) => {
    const y0 = k * h;
    const lo = lean ? prof.back : -hw;
    const spans: [number, number][] = hole[k] > 0 ? [[lo, -hole[k]], [hole[k], hw]] : [[lo, hw]];
    full.push(!hole[k] && hw - lo <= 2 * fw + 0.25);
    for (const [a, b] of spans) {
      const whole = b - a <= 2 * fw + 0.25;
      // (with a hole, the frame also runs round the arch; a lean-to's back is against the wall)
      const fixed = whole ? [] : [...(a > lo + 1e-6 || !lean ? [{ a, b: a + fw, proud: T }] : []), { a: b - fw, b, proud: T }];
      // (the frame's face a texel inside the end, so its carving stays within it; the tympanum a texel deeper)
      const [xa, xb] = g.side > 0 ? [x0, x1 - (whole ? T : 2 * T)] : [x0 + (whole ? T : 2 * T), x1];
      m.course(g.box(xa, y0, a, xb, y0 + h, b), { axis: 'z', face, length: [0.5, 1.0], row: k, closed: FACE.ny, fixed, look: g.look });
      p.collider(...g.box(x0, y0, a, x1, y0 + h, b));
    }
    // The steps of the frame (their +Z halves), for moss.
    if (k > 0 && hw < half[k - 1]) g.ledges.push({ x0: x0 + g.ax, x1: x1 + g.ax, y: y0 + g.ay, z0: hw + g.az, z1: half[k - 1] + g.az, joints: [] });
  });
  return { side: g.side, x: g.x, half, hole, full, h, foot: GABLE_LIFT * h, top: half.length * h, lean };
}

/**
 * Finial on the apex, naga ends turned up at the foot of the frame, key
 * patterns on its stones, and (closed gables) the tympanum's relief.
 */
function gableDetails(v: VoxelBuilder, g: GableInfo, look: (x: number, y: number, z: number) => StoneLook, tympanum: boolean, at: [number, number, number], src: ReturnType<typeof here>): void {
  const [ax, ay, az] = at;
  // (centred on the gable's thickness, which stops a texel short of the end)
  const cx = g.x - (g.side * (GABLE + T)) / 2;
  const lk = look(cx, g.top, 0);
  if (!g.lean) lotusBud(v, cx + ax, g.top + ay, az, GABLE - T, lk, src);
  const normal = g.side > 0 ? FACE.px : FACE.nx;
  // Naga ends: the frame's feet curl up and out.
  const z = g.half[0] - GABLE_FRAME / 2;
  for (const s of g.lean ? [1] : [-1, 1]) {
    const hook = look(cx, g.foot, s * z);
    v.span(cx - 0.125 + ax, g.foot + ay, s * z - 0.09375 + az, cx + 0.125 + ax, g.foot + 0.3125 + ay, s * z + 0.09375 + az, hook.color, 'sandstone', { surf: hook.surf, src });
    v.span(cx - 0.09375 + ax, g.foot + 0.25 + ay, s * (z + 0.0625) - 0.09375 + az, cx + 0.09375 + ax, g.foot + 0.4375 + ay, s * (z + 0.0625) + 0.09375 + az, hook.color, 'sandstone', { surf: hook.surf, shade: 1.05, src });
  }
  // Key patterns cut in every other stone of the frame, like the sheet's carved blocks.
  g.half.forEach((hw, k) => {
    if (g.full[k] || k % 2 === 0 || g.hole[k]) return;
    for (const s of g.lean ? [1] : [-1, 1]) keyPanel(v, normal, [g.x - g.side * T + ax, (k + 0.5) * g.h + ay, s * (hw - GABLE_FRAME / 2) + az], 0.25, s * g.side, src);
  });
  if (!tympanum) return;
  // The tympanum: a deity in a pointed niche over the doorway's axis, a
  // scroll either side, cut as dark lines a quarter texel proud of the recess.
  const fx = g.side > 0 ? g.x - 2 * T : g.x + 2 * T;
  const cav = SANDSTONE.cavity;
  const carve = (u0: number, v0: number, u1: number, v1: number, k = 0, color: number = cav[k % cav.length], shade = 0.8, proud = T / 4) => {
    const [xa, xb] = g.side > 0 ? [fx, fx + proud] : [fx - proud, fx];
    v.span(xa + ax, v0 + ay, u0 + az, xb + ax, v1 + ay, u1 + az, color, 'sandstone', { shade, open: normal, surf: CARVED, src });
  };
  const base = g.foot + 0.125;
  // Niche: a dark recess with a stepped, pointed head.
  carve(-0.3125, base, 0.3125, base + 0.8125);
  carve(-0.1875, base + 0.8125, 0.1875, base + 0.9375, 1);
  carve(-0.0625, base + 0.9375, 0.0625, base + 1.0625, 2);
  // The deity: crossed legs, body, arms, head — stone standing proud in the niche.
  const st = lk.color;
  carve(-0.1875, base + 0.0625, 0.1875, base + 0.1875, 0, st, 1, T / 2);
  carve(-0.09375, base + 0.1875, 0.09375, base + 0.5, 0, st, 1.02, T / 2);
  carve(-0.1875, base + 0.375, 0.1875, base + 0.4375, 0, st, 1, T / 2);
  carve(-0.0625, base + 0.5, 0.0625, base + 0.625, 0, st, 1.04, T / 2);
  carve(-0.03125, base + 0.625, 0.03125, base + 0.6875, 0, st, 1.04, T / 2);
  // Scrolls either side: square spirals.
  const room = g.half[Math.min(g.half.length - 1, GABLE_LIFT + 2)] - GABLE_FRAME - 0.125;
  if (room > 1.1) for (const s of [-1, 1]) spiral(carve, s * Math.min(room - 0.25, 1.0), base + 0.375, 0.375, s);
  // A band along the tympanum's foot.
  const foot = g.half[0] - GABLE_FRAME - 0.0625;
  if (!g.hole[1]) carve(-foot, g.foot - 2 * T, foot, g.foot - T, 1, cav[1], 0.9);
}

/** Carved lines: dark, grimy. */
const CARVED = stoneSurf({ stain: 0.4 });

/**
 * A key-pattern panel (a square spiral `size` across) cut into a face — dark
 * lines a quarter texel proud of the face whose outward normal is `normal`
 * (a FACE bit), centred on `at`; `mirror` −1 turns the spiral the other way.
 * The carved blocks of the sheets' cheek walls, gables and tier bases.
 */
export function keyPanel(v: VoxelBuilder, normal: number, at: [number, number, number], size: number, mirror = 1, src?: ReturnType<typeof here>): void {
  const cav = SANDSTONE.cavity;
  const [x, y, z] = at;
  const d = T / 4;
  let k = 0;
  spiral(
    (u0, v0, u1, v1) => {
      const c = cav[k++ % cav.length];
      const o = { shade: 0.85, open: normal, surf: CARVED, src };
      if (normal === FACE.pz) v.span(x + u0, v0, z, x + u1, v1, z + d, c, 'sandstone', o);
      else if (normal === FACE.nz) v.span(x - u1, v0, z - d, x - u0, v1, z, c, 'sandstone', o);
      else if (normal === FACE.px) v.span(x, v0, z - u1, x + d, v1, z - u0, c, 'sandstone', o);
      else v.span(x - d, v0, z + u0, x, v1, z + u1, c, 'sandstone', o);
    },
    0,
    y,
    snap(size),
    mirror,
  );
}

/** A square spiral (Khmer key pattern) of `size` centred on (u, v), cut with `carve`; `s` mirrors it. */
function spiral(carve: (u0: number, v0: number, u1: number, v1: number) => void, u: number, v: number, size: number, s: number): void {
  const n = Math.round(size / T);
  const PAT = n >= 6 ? KEY6 : KEY4;
  PAT.forEach((line, row) => {
    const vy = v + size / 2 - (row + 1) * T;
    let i = 0;
    while (i < line.length) {
      if (line[i] !== '#') {
        i++;
        continue;
      }
      let j = i;
      while (j < line.length && line[j] === '#') j++;
      const [a, b] = [i * T - size / 2, j * T - size / 2];
      const [u0, u1] = s > 0 ? [u + a, u + b] : [u - b, u - a];
      carve(u0, vy, u1, vy + T);
      i = j;
    }
  });
}

const KEY6 = ['######', '#....#', '#.##.#', '#.#..#', '#.####', '#.....'];
const KEY4 = ['.##.', '#..#', '#..#', '.##.'];

/**
 * A lotus bud (finial) standing on (x, y, z), `w` wide at its base: a
 * collar, a swelling bud cut octagonal, a pointed tip — the crown of a
 * gable, a crest bud or the top of a tiered roof.
 */
export function lotusBud(v: VoxelBuilder, x: number, y: number, z: number, w: number, lk: StoneLook, src?: ReturnType<typeof here>): void {
  const u = (k: number) => Math.max(T, snap(w * k));
  const part = (wx: number, h0: number, h1: number, wz = wx, shade = 1) => v.box(x, y + (h0 + h1) / 2, z, wx, h1 - h0, wz, lk.color, 'sandstone', { shade: (lk.shade ?? 1) * shade, surf: lk.surf, src });
  let y0 = 0;
  const stack = (wx: number, h: number, octagon = false, shade = 1) => {
    const hh = Math.max(T, snap(h));
    if (octagon && wx >= 3 * T) {
      part(wx, y0, y0 + hh, wx - 2 * T, shade);
      part(wx - 2 * T, y0 + T / 4, y0 + hh - T / 4, wx, shade);
    } else part(wx, y0, y0 + hh, wx, shade);
    y0 += hh;
  };
  stack(u(1), w * 0.25);
  stack(u(0.75), w * 0.2, false, 0.92);
  stack(u(0.875), w * 0.45, true, 1.04);
  stack(u(0.625), w * 0.3, true, 1.04);
  stack(u(0.375), w * 0.3, false, 1.06);
  stack(T, w * 0.25, false, 1.08);
}

/**
 * An antefix: the small ornament on a tier's corners and axes — a miniature
 * tower (footing, body, cornice, pointed top), 5 texels wide and 9 tall,
 * centred on (x, z): give it a texel's centre to keep its odd widths on the grid.
 */
export function antefix(v: VoxelBuilder, x: number, y: number, z: number, lk: StoneLook, src?: ReturnType<typeof here>): void {
  const [cx, cz] = [x, z];
  let y0 = 0;
  for (const [k, h, shade] of [
    [5, 1, 0.96],
    [3, 3, 1],
    [5, 1, 1.02],
    [3, 2, 1.03],
    [1, 2, 1.06],
  ] as const) {
    v.box(cx, y + (y0 + h / 2) * T, cz, k * T, h * T, k * T, lk.color, 'sandstone', { shade: (lk.shade ?? 1) * shade, surf: lk.surf, src });
    y0 += h;
  }
}

// ——— Roof tiers ———

export interface RoofTierOptions {
  finish: StoneFinish;
  seed: number;
  /** The lowest tier's body (x, z; default 6 × 6 m). */
  width?: number;
  depth?: number;
  /** Number of tiers (default 4). */
  tiers?: number;
  /** Height of the lowest tier (default 1.5 m); each one above is `taper` lower (default 0.125 m, min 0.75). */
  height?: number;
  taper?: number;
  /** Set-back of each tier from the one below, on every side (default 0.625 m). */
  setback?: number;
  /** Redents on each corner (default 2) of `redent` metres (default 0.75 m on a 6 m tier, scaled with the tier, ≥ 0.25). */
  redents?: number;
  redent?: number;
  /** Antefixes on the tiers' corners (default true). */
  antefixes?: boolean;
  /** A lotus bud on the top (default true). */
  finial?: boolean;
  at?: [number, number, number];
  /** Moss on the ledges (0‥1, default from the finish) and grass (0‥1, default 0). */
  moss?: number;
  grass?: number;
}

export interface TierInfo {
  /** Each tier: its base height, height, and body size. */
  tiers: { y: number; height: number; width: number; depth: number }[];
  /** Top of the last tier (the finial stands on it). */
  top: number;
}

/** Projection of the plinth and cornice mouldings beyond a tier's body. */
const CORNICE = 0.125;

/**
 * A redented plan: a width × depth rectangle whose corners step in `n` times
 * by `r` — the cross-shaped plan of Khmer towers and roofs — as the faces
 * seen from each side: for side `turn` (0 = +Z, 1 = +X, 2 = −Z, 3 = −X; see
 * src/kit/place.ts) the face's offset from the centre along its normal and
 * its span along the face (in that side's own frame, +u to the right when
 * facing the face). Main face first.
 */
export function redentFaces(width: number, depth: number, n: number, r: number): { turn: number; off: number; a: number; b: number }[] {
  const out: { turn: number; off: number; a: number; b: number }[] = [];
  for (let turn = 0; turn < 4; turn++) {
    const [w, d] = turn % 2 ? [depth, width] : [width, depth];
    out.push({ turn, off: d / 2, a: -w / 2 + n * r, b: w / 2 - n * r });
    for (let j = 0; j < n; j++) {
      const off = d / 2 - (n - j) * r;
      out.push({ turn, off, a: -w / 2 + j * r, b: -w / 2 + (j + 1) * r }, { turn, off, a: w / 2 - (j + 1) * r, b: w / 2 - j * r });
    }
  }
  return out;
}

/**
 * One course of a redented plan (see {@link redentFaces}), `grow` wider all
 * round: a middle slab of stones running along X and, either side, `n` slabs
 * `r` wide of stones running along Z, stepping in.
 */
export function redentedCourse(
  m: DryMasonry,
  o: { y0: number; y1: number; width: number; depth: number; n: number; r: number; grow?: number; at?: [number, number, number]; look: (x: number, y: number, z: number) => StoneLook; row?: number; closed?: number },
): Stone[] {
  const [ax, ay, az] = o.at ?? [0, 0, 0];
  const g = o.grow ?? 0;
  const W = o.width + 2 * g;
  const D = o.depth + 2 * g;
  const { n, r } = o;
  const course = { look: o.look, row: o.row ?? 0, closed: o.closed ?? FACE.ny };
  const out = m.course([-W / 2 + n * r + ax, o.y0 + ay, -D / 2 + az, W / 2 - n * r + ax, o.y1 + ay, D / 2 + az], { ...course, length: [0.75, 1.25] });
  for (let j = 0; j < n; j++) {
    const hz = D / 2 - (n - j) * r;
    for (const s of [-1, 1]) {
      const [xa, xb] = s < 0 ? [-W / 2 + j * r, -W / 2 + (j + 1) * r] : [W / 2 - (j + 1) * r, W / 2 - j * r];
      out.push(...m.course([xa + ax, o.y0 + ay, -hz + az, xb + ax, o.y1 + ay, hz + az], { ...course, axis: 'z', face: s < 0 ? FACE.nx : FACE.px, length: [0.5, 1.0] }));
    }
  }
  return out;
}

/** The stepped, redented roof tiers of a gopura or pavilion (see the contract at the top of the file). */
export function roofTiers(p: PieceBuilder, o: RoofTierOptions): TierInfo {
  const f = o.finish;
  const at = o.at ?? [0, 0, 0];
  const [ax, ay, az] = at;
  const m = new DryMasonry(o.seed);
  const moss = o.moss ?? (f.surf[0] >= 0.4 ? f.surf[0] : 0.3);
  const look = finishLook(f, o.seed, { moss: moss * 0.25 });
  const band = (x: number, _y: number, z: number): StoneLook => ({ color: SANDSTONE.cavity[Math.abs(Math.round(x * 4 + z * 4)) % 3], shade: 0.7, surf: stoneSurf({ stain: 0.5 }) });
  const W = snap(o.width ?? 6);
  const D = snap(o.depth ?? W);
  const count = Math.max(1, Math.round(o.tiers ?? 4));
  const sb = snap(o.setback ?? 0.625);
  const h0 = snap(o.height ?? 1.5, 0.125);
  const taper = snap(o.taper ?? 0.125, 0.125);
  const info: TierInfo = { tiers: [], top: 0 };
  // Decorations are drawn side by side in each side's own frame (face towards +Z), then turned into place.
  const sideParts = [0, 1, 2, 3].map(() => new PieceBuilder());
  const sideLedges: Ledge[][] = [[], [], [], []];
  const src = here();
  let y = 0;
  for (let i = 0; i < count; i++) {
    const w = W - 2 * i * sb;
    const d = D - 2 * i * sb;
    if (Math.min(w, d) < 0.75) break;
    const th = Math.max(0.75, h0 - i * taper);
    const r = Math.max(0.25, snap(((o.redent ?? 0.75) * Math.min(w, d)) / Math.min(W, D), 0.125));
    const nMax = Math.floor((Math.min(w, d) - 0.5) / (2 * r));
    const nr = Math.max(0, Math.min(o.redents ?? 2, nMax));
    const plan = { width: w, depth: d, n: nr, r, at };
    info.tiers.push({ y, height: th, width: w, depth: d });
    let yy = y;
    // Plinth (lowest tier only), a texel or two proud.
    if (i === 0) {
      redentedCourse(m, { ...plan, y0: yy, y1: yy + 0.25, grow: CORNICE, look, row: 0 });
      yy += 0.25;
    }
    const body = th - 0.25 - (i === 0 ? 0.25 : 0);
    const faces = redentFaces(w, d, nr, r);
    if (i === 0 || body < 0.75) {
      // A body of dressed courses, the lowest tier's carved with key-pattern panels.
      coursesOf(body).forEach((ch, c) => {
        redentedCourse(m, { ...plan, y0: yy, y1: yy + ch, look, row: c + 1, closed: FACE.ny | FACE.py });
        if (i === 0 && ch >= 0.375)
          for (const fc of faces) {
            if (fc.b - fc.a < 0.75) continue;
            const k = Math.max(1, Math.round((fc.b - fc.a) / 1.0));
            for (let j = 0; j < k; j++) {
              if ((j + c) % 2) continue;
              const u = fc.a + ((j + 0.5) * (fc.b - fc.a)) / k;
              keyPanel(sideParts[fc.turn].voxels, FACE.pz, [u, yy + ch / 2, fc.off], Math.min(0.375, ch - 0.125), 1, src);
            }
          }
        yy += ch;
      });
    } else {
      // A band of false windows: a dark recess two texels deep behind stubby balusters.
      const bh = snap(Math.min(0.5, body - 0.5), 0.125);
      const lower = snap((body - bh) / 2, 0.125);
      redentedCourse(m, { ...plan, y0: yy, y1: yy + lower, look, row: 1, closed: FACE.ny | FACE.py });
      redentedCourse(m, { ...plan, y0: yy + lower, y1: yy + lower + bh, grow: -2 * T, look: band, row: 2, closed: FACE.ny | FACE.py });
      for (const fc of faces) {
        if (fc.b - fc.a < 0.25) continue;
        const k = Math.max(1, Math.floor((fc.b - fc.a - 0.0625) / 0.25));
        for (let j = 0; j < k; j++) {
          const u = snap(fc.a + ((j + 0.5) * (fc.b - fc.a)) / k);
          balusterStub(sideParts[fc.turn].voxels, u, yy + lower, yy + lower + bh, fc.off, look(u, yy, fc.off), src);
        }
      }
      redentedCourse(m, { ...plan, y0: yy + lower + bh, y1: yy + body, look, row: 3, closed: FACE.ny | FACE.py });
      yy += body;
    }
    // Cornice, projecting; its top is the ledge the next tier stands back on.
    redentedCourse(m, { ...plan, y0: yy, y1: yy + 0.25, grow: CORNICE, look, row: 4, closed: 0 });
    yy += 0.25;
    // Colliders: the plan as the arms of its cross.
    for (let j = 0; j <= nr; j++) {
      const hx = w / 2 + CORNICE - j * r;
      const hz = d / 2 + CORNICE - (nr - j) * r;
      p.collider(-hx + ax, y + ay, -hz + az, hx + ax, yy + ay, hz + az);
    }
    // Ledges and antefixes, in each side's frame: the cornice's top out to its edge.
    const last = i === count - 1 || Math.min(w, d) - 2 * sb < 0.75;
    const cf = redentFaces(w + 2 * CORNICE, d + 2 * CORNICE, nr, r);
    for (const fc of cf) {
      if (!last) {
        const inset = fc.off - sb - CORNICE;
        sideLedges[fc.turn].push({ x0: fc.a, x1: fc.b, y: yy, z0: Math.max(inset, fc.off - 0.5), z1: fc.off, joints: [] });
      }
    }
    if (o.antefixes !== false)
      for (let turn = 0; turn < 4; turn++) {
        // In each side's frame: one on the axis and one on its right-hand corner (the redent's middle step).
        const [sw, sd] = turn % 2 ? [d + 2 * CORNICE, w + 2 * CORNICE] : [w + 2 * CORNICE, d + 2 * CORNICE];
        const j = Math.ceil(nr / 2);
        // (3.5 texels in from the edges: a texel's centre, so it keeps to the grid; the axial one is centred on the axis)
        const [cu, cz] = [sw / 2 - j * r - 3.5 * T, sd / 2 - (nr - j) * r - 3.5 * T];
        const v = sideParts[turn].voxels;
        antefix(v, cu, yy, cz, look(cu, yy, cz), src);
        if (!last) antefix(v, 0, yy, sd / 2 - 3.5 * T, look(0, yy, sd / 2), src);
      }
    y = yy;
  }
  info.top = y;
  ageStones(m, f, o.seed);
  m.emit(p.voxels);
  // The top: a lotus bud.
  const lt = info.tiers[info.tiers.length - 1];
  if (o.finial !== false && lt) lotusBud(p.voxels, ax, y + ay, az, snap(Math.min(0.75, Math.min(lt.width, lt.depth) * 0.45)), look(0, y, 0), src);
  // Moss on the ledges, and each side's decorations, turned into place.
  const r = rng(o.seed * 5 + 1);
  sideParts.forEach((q, turn) => {
    if (moss > 0 || (o.grass ?? 0) > 0) overgrow(q, sideLedges[turn], moss, o.grass ?? 0, o.seed + turn * 101 + r.int(0, 9));
    placePiece({ voxels: p.voxels }, q.done(), { x: ax, y: ay, z: az, turn });
  });
  return info;
}

/** A roof-tier piece on its own. */
export function roofTiersPiece(o: RoofTierOptions): KitPiece {
  const p = new PieceBuilder();
  roofTiers(p, o);
  return p.done();
}

/** A stubby baluster in a false window, standing in the recess in front of the face at z = off (side frame). */
function balusterStub(v: VoxelBuilder, u: number, y0: number, y1: number, off: number, lk: StoneLook, src: ReturnType<typeof here>): void {
  const z = off - T;
  const mid = snap((y0 + y1) / 2);
  v.box(u, (y0 + y1) / 2, z, 2 * T, y1 - y0, 2 * T, lk.color, 'sandstone', { shade: 0.95, surf: lk.surf, src });
  v.box(u, mid, z, 3 * T, T, 3 * T - T / 4, lk.color, 'sandstone', { shade: 1.02, surf: lk.surf, src });
}

/** Age: cracks and chipped arrises as the finish has them. */
function ageStones(m: DryMasonry, f: StoneFinish, seed: number): void {
  const r = rng(seed * 11 + 7);
  const cracks = f.surf[2] >= 0.3 ? Math.max(1, Math.round(m.stones.length / 15)) : 0;
  const whole = m.stones.filter((s) => s.box[4] - s.box[1] >= 0.25 && s.look.shade !== VAULT_SHADE);
  for (let k = 0; k < cracks && whole.length; k++) m.crack(whole.splice(r.int(0, whole.length - 1), 1)[0], r.int(1, 1e6));
  for (const s of m.stones) if (!s.crack && r.chance(f.wear * 0.5)) m.chip(s, r.int(1, 1e6));
}
