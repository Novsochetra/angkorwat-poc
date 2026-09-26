import type { Surf } from '../../voxel/VoxelBuilder';
import { hash3 } from '../../voxel/random';
import { fromSheet, SANDSTONE } from '../palette';
import { PieceBuilder } from '../PieceBuilder';
import { placePiece } from '../place';
import { rng, snap, TEXEL } from '../shapes';
import type { StoneFinish } from '../surface';
import type { KitPiece } from '../types';
import { coursesOf, DryMasonry, FACE, finishLook, overgrow, type Box6, type Ledge, type Stone, type StoneLook } from './gallery';

/**
 * Prasat towers — the spires of Angkor Wat's five central towers (§21.2 ⑫
 * tower tier; used by the §21.3 tower and gopura sections).
 *
 * **What a tower is.** Above its body (the cella with its porches and
 * pediments, built elsewhere) an Angkor Wat tower rises as a *spire*: five
 * receding tiers, each a smaller replica of the storey below, then three rows
 * of lotus petals and the lotus bud on top — Glaize's "four reducing upper
 * tiers … three rows of lotus petals" plus the attic tier, "each projecting
 * cornice lined … with steles and antefixes". The plan is redented: every
 * face has an axial projection and each corner steps back `redents` times, so
 * the stacked tiers read as a ribbed cone, and the profile swells like a bud:
 * the silhouette follows width × (1 − (y / height)^1.5).
 *
 * **A tier** ({@link towerTier}) is, bottom to top: a base moulding one step
 * proud, the storey's body in 0.5 m courses with a false door in a niche on
 * each axial face (lintel above), a cornice of three bands corbelled out one
 * step each, whose top is the ledge, and antefixes standing on the ledge — a
 * miniature stepped pediment on each axis, small stepped shrines on every
 * outer corner of the redents (taller on the diagonals). A lotus-petal row is
 * a squat, nearly octagonal tier with two cornice bands and a ring of pointed
 * petals.
 *
 * **Sizes** (measured on photos of the towers, scaled by the ≈ 54 m between
 * the corner towers and checked against the central tower's 42 m above the
 * Bakan; see the §21.2 tower-tier asset): the central spire is ≈ 13.5 m wide
 * at its lowest cornice and ≈ 23 m tall from the body's cornice to the tip —
 * tiers of 3.5 → 2.75 m, petal rows of 2 → 1.25 m, a bud ≈ 2.75 m; the corner
 * spires are 0.75 × that ({@link TOWER}).
 *
 * **Placement contract.** Everything is centred on x = z = 0 (plus `at`),
 * front (+Z) like every kit piece, and symmetric under quarter turns.
 *  - A tier's y = 0 is the ledge it stands on; its body is `width` across the
 *    axes (face of one axial projection to the other) and its cornice
 *    `outline` = width + 2 × 3 steps; its top (the ledge) is at y = height.
 *    Its colliders are two crossed boxes to the cornice's corners, so the
 *    ledges are walkable at their real height.
 *  - A spire's y = 0 is the top of the body's cornice: its lowest tier's base
 *    moulding (`SpireLayout.parts[0].width` + 2 steps, ≈ width − 0.75 m) must
 *    stand on it; its tip is at `SpireLayout.top` (= height). `from` / `to`
 *    build a stretch of it (tiers 1–2, tier 5 + crown…) standing at y = 0,
 *    its top paved over.
 *  - Lay into a shared {@link DryMasonry} with `masonry` (the caller emits
 *    it), or leave it out and the builder emits its own.
 *
 * @example
 * // A corner tower's spire on a body whose cornice top is at y = 12:
 * const p = new PieceBuilder();
 * const lay = spire(p, { ...TOWER.corner, seed, at: [0, 12, 0] });
 * // lay.parts[0].width = 8.875 (its moulding 9.25) → the body's cornice must be at
 * // least that wide; lay.top = 17.25 → the tip is at y = 29.25.
 * // One tier on its own, capped (its ledge paved over):
 * towerTier(p, { width: 12.75, height: 3.5, seed });
 * // Only the upper part (tier 5, the petal rows and the bud), from y = 0:
 * spire(p, { ...TOWER.central, seed, from: 4 });
 */

const T = TEXEL;
/** A hair (1/64 m): trims crossing boxes so no two share a face plane. */
const HAIR = T / 4;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** The two spires of Angkor Wat's quincunx (metres; see the header). */
export const TOWER = {
  /** The central tower: 13.5 m at its lowest cornice, 23 m from the body's cornice to the tip. */
  central: { width: 13.5, height: 23, tiers: 5, petals: 3 },
  /** The four corner towers: 0.75 × the central spire. */
  corner: { width: 10, height: 17.25, tiers: 5, petals: 3 },
} as const;

/**
 * The tower's stone: the temple's `warm` finish, with two of the §21.2
 * sheet's golden lit tones (#d6a266, #c9985e sampled off its tiers) and a
 * little grime and lichen, as on the real towers.
 */
export const TOWER_STONE: StoneFinish = {
  palette: [...SANDSTONE.warm, fromSheet(0xd6a266), fromSheet(0xc9985e), SANDSTONE.cracked[1]],
  surf: [0.05, 0.1, 0, 0.18],
  wear: 0,
};

/** How much of a spire's height each part takes (measured on the central tower). */
const SHARE = { tier: 0.152, tierShrink: 0.94, petal: 0.087, petalShrink: 0.78 } as const;

// ── Plans ────────────────────────────────────────────────────────────────────

/**
 * A redented square plan: half-width `a` across the axes, corners stepped back
 * `n` times by `s` each way. The axial projection is 2 × (a − 2ns) wide; the
 * last step meets the diagonal. Offsetting it outwards by p gives (a + p, s, n).
 */
export interface Plan {
  a: number;
  s: number;
  n: number;
}

/** Half-width of a plan's axial projection. */
const axial = (o: Plan) => o.a - 2 * o.n * o.s;

/**
 * Half-extent along x of a plan at distance z from its axis (−1 outside) —
 * by symmetry also its half-extent along z at a given x.
 */
export function planHalf(o: Plan, z: number): number {
  const az = Math.abs(z);
  const c = axial(o);
  if (az <= c + 1e-6) return o.a;
  if (az > o.a + 1e-6) return -1;
  const k = Math.ceil((az - c) / o.s - 1e-6);
  return k <= o.n ? o.a - k * o.s : c + (2 * o.n - k) * o.s;
}

/** The plan of a body `width` across with `redents` steps of `s`, fewer if they would eat the axial projection. */
function planOf(width: number, redents: number, s: number): Plan {
  const a = width / 2;
  let n = redents;
  while (n > 0 && a - 2 * n * s < s) n--;
  return { a, s, n };
}

// ── Faces ────────────────────────────────────────────────────────────────────

/** The four faces (front, right, back, left): details are authored once in face-local (u along, d out) and turned onto each. */
type Face = 0 | 1 | 2 | 3;
const FACES: readonly Face[] = [0, 1, 2, 3];
const FACE_BIT = [FACE.pz, FACE.px, FACE.nz, FACE.nx] as const;

/** World [x0, x1, z0, z1] of face-local u0‥u1 (left to right, seen from outside) × d0‥d1 (outwards). */
function faceRect(f: Face, u0: number, u1: number, d0: number, d1: number): [number, number, number, number] {
  switch (f) {
    case 0:
      return [u0, u1, d0, d1];
    case 1:
      return [d0, d1, -u1, -u0];
    case 2:
      return [-u1, -u0, -d1, -d0];
    default:
      return [-d1, -d0, u0, u1];
  }
}

/** A u-span of face f as a span along its world axis (x for front / back, z for the sides). */
function alongAxis(f: Face, u0: number, u1: number): [number, number] {
  return f === 0 || f === 3 ? [u0, u1] : [-u1, -u0];
}

/** What every part of a tower is laid with. */
interface Ctx {
  p: PieceBuilder;
  m: DryMasonry;
  at: [number, number, number];
  look: (x: number, y: number, z: number) => StoneLook;
  seed: number;
  moss: number;
}

function ctxOf(p: PieceBuilder, o: { finish?: StoneFinish; seed: number; moss?: number; at?: [number, number, number]; masonry?: DryMasonry }): Ctx {
  const f = o.finish ?? TOWER_STONE;
  return { p, m: o.masonry ?? new DryMasonry(o.seed), at: o.at ?? [0, 0, 0], look: finishLook(f, o.seed), seed: o.seed, moss: o.moss ?? 0.12 };
}

/** The finish's look with moss scaled (ledges and antefixes gather more, walls less). */
function mossed(c: Ctx, k: number): (x: number, y: number, z: number) => StoneLook {
  return (x, y, z) => {
    const l = c.look(x, y, z);
    const [moss, lichen, crack, stain] = l.surf;
    return { ...l, surf: [clamp(moss + c.moss * k * (0.4 + hash3(Math.round(x * 4), Math.round(y * 4), Math.round(z * 4), c.seed + 3)), 0, 1), lichen, crack, stain] };
  };
}

/** A look a shade darker (stones in the shadow of a cornice). */
function shaded(look: (x: number, y: number, z: number) => StoneLook, k: number): (x: number, y: number, z: number) => StoneLook {
  return k === 1 ? look : (x, y, z) => {
    const l = look(x, y, z);
    return { ...l, shade: (l.shade ?? 1) * k };
  };
}

/** Shade of a storey's courses, counted down from the one under the cornice. */
const SHADOW = [0.8, 0.89, 0.95, 1] as const;

interface CourseOpts {
  row: number;
  look: (x: number, y: number, z: number) => StoneLook;
  length: [number, number];
  /** Faces covered by other stone (FACE bits): the dark fill isn't set back there. */
  closed?: number;
  /** A stone of its own over a u-span (a lintel), standing `proud`. */
  fixed?: { u0: number; u1: number; proud: number };
}

/** One course in face-local coordinates: stones along the face, showing its outer side. */
function faceCourse(c: Ctx, f: Face, u0: number, u1: number, y0: number, y1: number, d0: number, d1: number, o: CourseOpts): void {
  const [x0, x1, z0, z1] = faceRect(f, u0, u1, d0, d1);
  const [ax, , az] = c.at;
  const box: Box6 = [x0 + ax, y0 + c.at[1], z0 + az, x1 + ax, y1 + c.at[1], z1 + az];
  const off = f % 2 ? az : ax;
  const fixed = o.fixed
    ? [alongAxis(f, o.fixed.u0, o.fixed.u1)].map(([a, b]) => ({ a: a + off, b: b + off, proud: o.fixed!.proud }))
    : undefined;
  c.m.course(box, { axis: f % 2 ? 'z' : 'x', face: FACE_BIT[f], length: o.length, row: o.row, look: o.look, closed: o.closed, fixed });
}

/** A free box in face-local coordinates (antefixes, panels, carvings). */
function faceBox(c: Ctx, f: Face, u0: number, u1: number, y0: number, y1: number, d0: number, d1: number, color: number, surf: Surf, shade = 1): void {
  const [x0, x1, z0, z1] = faceRect(f, u0, u1, d0, d1);
  c.p.voxels.span(x0 + c.at[0], y0 + c.at[1], z0 + c.at[2], x1 + c.at[0], y1 + c.at[1], z1 + c.at[2], color, 'sandstone', { surf, shade });
}

/**
 * One course around a redented plan: the axial run of each face and the
 * chain of step stones (one per redent, `s` square) running out to the
 * diagonal, which each face owns on its right. The ring is hollow — the
 * courses above and below close it — so a course costs a stone per metre of
 * outline. `holes` (face-local u-spans) leave the axial run open (a niche).
 */
function ring(c: Ctx, o: Plan, y0: number, y1: number, co: CourseOpts, holes: [number, number][] = []): void {
  const { a, s, n } = o;
  const ax = axial(o);
  for (const f of FACES) {
    if (n === 0) {
      faceCourse(c, f, -a + s, a, y0, y1, a - s, a, co);
      continue;
    }
    let u = -ax;
    for (const [h0, h1] of [...holes].sort((p, q) => p[0] - q[0])) {
      if (h0 > u + 1e-6) faceCourse(c, f, u, h0, y0, y1, a - s, a, co);
      u = h1;
    }
    if (ax > u + 1e-6) faceCourse(c, f, u, ax, y0, y1, a - s, a, co);
    for (let i = 1; i <= n; i++) {
      const u0 = ax + (i - 1) * s;
      const u1 = ax + i * s;
      const d0 = a - (i + 1) * s;
      const d1 = a - i * s;
      faceCourse(c, f, u0, u1, y0, y1, d0, d1, { ...co, fixed: undefined });
      if (i < n) faceCourse(c, f, -u1, -u0, y0, y1, d0, d1, { ...co, fixed: undefined });
    }
  }
}

/**
 * A paved course over a whole plan — the ledge on top of a cornice: rows of
 * stones along x, one redent step deep, so every row ends on the outline.
 * Under `hole` (the next tier's body, less `margin`) the rows are left out.
 */
function pave(c: Ctx, o: Plan, y0: number, y1: number, co: CourseOpts, hole?: Plan, margin = 0.25): void {
  const { s, n } = o;
  const ax = axial(o);
  const cuts = new Set<number>();
  for (let k = 0; k <= 2 * n; k++) {
    cuts.add(snap(ax + k * s));
    cuts.add(snap(-(ax + k * s)));
  }
  const mid = Math.max(1, Math.round((2 * ax) / s));
  for (let k = 1; k < mid; k++) cuts.add(snap(-ax + (2 * ax * k) / mid));
  const zs = [...cuts].sort((p, q) => p - q);
  const [ox, oy, oz] = c.at;
  for (let r = 0; r + 1 < zs.length; r++) {
    const [z0, z1] = [zs[r], zs[r + 1]];
    const edge = Math.max(Math.abs(z0), Math.abs(z1));
    const X = planHalf(o, (z0 + z1) / 2);
    if (X <= 0) continue;
    const Xh = hole ? planHalf(hole, edge) - margin : -1;
    const spans: [number, number][] = Xh > 2 * T && Xh < X - T ? [[-X, -Xh], [Xh, X]] : Xh >= X - T ? [] : [[-X, X]];
    const face = z0 + z1 >= 0 ? FACE.pz : FACE.nz;
    for (const [p0, p1] of spans) c.m.course([p0 + ox, y0 + oy, z0 + oz, p1 + ox, y1 + oy, z1 + oz], { axis: 'x', face, length: co.length, row: co.row + r, look: co.look, closed: co.closed });
  }
}

// ── Antefixes ────────────────────────────────────────────────────────────────

type Antefix = 'shrine' | 'pediment' | 'petal';

/**
 * One antefix standing on a ledge, centred on face-local u, its front at d1
 * (`w` wide, `dep` deep, `h` tall, bottom at y):
 *  - shrine: a miniature stepped tower, square, narrowing in four stages to a knob;
 *  - pediment: a flat stepped gable facing out with a dark tympanum — the
 *    false porch of the axis;
 *  - petal: a pointed lotus petal, narrow at its foot, swelling and closing
 *    to a tip — a slab half as deep as it is wide.
 */
function antefix(c: Ctx, f: Face, kind: Antefix, uc: number, d1: number, y: number, w: number, dep: number, h: number): void {
  const look = mossed(c, 1);
  const dc = d1 - dep / 2;
  const tone = look(...faceMid(c, f, uc, y, d1));
  const stage = (ww: number, dd: number, y0: number, y1: number, shade = 1) => {
    const hw = Math.max(T, snap(ww / 2));
    const hd = Math.max(T / 2, snap(dd / 2, T / 2));
    faceBox(c, f, uc - hw, uc + hw, y0, y1, dc - hd, dc + hd, tone.color, tone.surf, (tone.shade ?? 1) * shade);
  };
  const Y = (t: number) => y + snap(h * t);
  if (kind === 'shrine') {
    stage(w, dep, Y(0), Y(0.3));
    stage(w * 0.76, dep * 0.76, Y(0.3), Y(0.5), 0.95);
    stage(w * 0.6, dep * 0.6, Y(0.5), Y(0.7));
    stage(w * 0.4, dep * 0.4, Y(0.7), Y(0.87), 0.96);
    stage(w * 0.18, dep * 0.18, Y(0.87), Y(1));
  } else if (kind === 'petal') {
    stage(w * 0.8, dep, Y(0), Y(0.2), 0.95);
    stage(w, dep, Y(0.2), Y(0.5));
    stage(w * 0.7, dep * 0.9, Y(0.5), Y(0.75), 0.97);
    stage(w * 0.4, dep * 0.8, Y(0.75), Y(0.92));
    stage(w * 0.14, dep * 0.6, Y(0.92), Y(1), 0.97);
  } else {
    // Rows of a pointed gable, and its tympanum a shade darker, proud by a hair.
    const rows = [1, 0.82, 0.62, 0.42, 0.22];
    rows.forEach((k, r) => stage(w * k, dep, Y(r / rows.length), Y((r + 1) / rows.length), r % 2 ? 0.95 : 1));
    const hw = snap(w * 0.28);
    faceBox(c, f, uc - hw, uc + hw, Y(0.1), Y(0.52), d1 - T, d1 + HAIR, tone.color, tone.surf, (tone.shade ?? 1) * 0.62);
  }
}

// ── Tiers ────────────────────────────────────────────────────────────────────

export interface TierOptions {
  /** Body width across the axes (m). */
  width: number;
  /** From the ledge it stands on to its own ledge (m). */
  height: number;
  /** 'tier' (a storey: base moulding, body with false doors, 3-band cornice, antefixes) or 'petal' (a lotus-petal row). */
  kind?: 'tier' | 'petal';
  /** Corner steps (default 3 for a tier, 1 for a petal row: nearly an octagon). */
  redents?: number;
  /** Size of each step (m; default width / 20 for a tier — an axial projection ≈ 40 % of the face — and / 7 for a petal row, on 0.125 m). */
  step?: number;
  /** Antefix height (m; default 0.34 × height, petals 0.5 ×); 0 = none. */
  antefix?: number;
  /**
   * What stands on this tier — the next tier's body width (same kind) or its
   * plan ({@link tierPlan}): the antefixes keep clear of it and, unless `cap`,
   * the paving is left out under it. Default: a body 1 m narrower.
   */
  next?: number | Plan;
  /** Pave the whole top (a tier on its own). Default: when `next` is not given. */
  cap?: boolean;
  /** Carved panels and figures on the body's stones (0‥1 of the stones; default 0.3). */
  carving?: number;
  /** Moss cushions along the ledges' edges, grass in their joints (0‥1; default 0). */
  overgrowth?: number;
  /** Chipped, cracked and fallen stones in the body (0‥1; default 0). */
  damage?: number;
  finish?: StoneFinish;
  seed: number;
  /** Extra moss on ledges and antefixes (0‥1, default 0.12). */
  moss?: number;
  /** Where the tier's origin (centre of its foot) goes. */
  at?: [number, number, number];
  /** Lay the stones into this masonry (the caller emits it). */
  masonry?: DryMasonry;
}

export interface TierInfo {
  /** Top of the tier (its ledge), in the tier's frame. */
  top: number;
  /** Body width across the axes. */
  width: number;
  /** Cornice width across the axes (the tier's widest). */
  outline: number;
  /** The body's plan (half-width, step, redents). */
  plan: Plan;
}

/** The body plan of a tier (or petal row) `width` across — what {@link towerTier} builds by default. */
export function tierPlan(width: number, kind: 'tier' | 'petal' = 'tier', redents?: number, step?: number): Plan {
  const w = snap(width, 0.125);
  return planOf(w, redents ?? (kind === 'tier' ? 3 : 1), step ?? Math.max(2 * T, snap(w / (kind === 'tier' ? 20 : 7), 0.125)));
}

/** Heights of a tier's parts: the moulding bands, how far each steps out, how many. */
function tierBands(height: number, kind: 'tier' | 'petal') {
  const band = clamp(snap(height * (kind === 'tier' ? 0.075 : 0.12)), 2 * T, 0.25);
  const out = clamp(snap(height * 0.06), T, 0.1875);
  return { band, out, cornice: kind === 'tier' ? 3 : 2, plinth: kind === 'tier' ? 1 : 0 };
}

/**
 * The dark core inside a hollow ring of the plan: it closes the slots the
 * stones' bevels open at the re-entrant corners (the rings touch there only
 * along an edge) and reads as the shadow in them.
 */
function core(c: Ctx, o: Plan, y0: number, y1: number): void {
  const { a, s, n } = o;
  const ax = axial(o);
  const [ox, oy, oz] = c.at;
  const put = (hx: number, hz: number) => {
    if (hx > 0 && hz > 0) c.p.voxels.span(ox - hx, oy + y0, oz - hz, ox + hx, oy + y1, oz + hz, CORE, 'sandstone', { open: 0 });
  };
  if (n === 0) return put(a - s, a - s);
  for (let i = 0; i <= n; i++) {
    put(ax + i * s, a - (i + 1) * s);
    if (i < n) put(a - (i + 1) * s, ax + i * s);
  }
}
/** The shadow deep in the joints (the masonry's own fill colour). */
const CORE = SANDSTONE.cavity[1];

/** Add one tier (or lotus-petal row) of a prasat tower to a piece (see the file header). */
export function towerTier(p: PieceBuilder, o: TierOptions): TierInfo {
  const c = ctxOf(p, o);
  const kind = o.kind ?? 'tier';
  const W = snap(o.width, 0.125);
  const H = snap(o.height);
  const plan = tierPlan(W, kind, o.redents, o.step);
  const { band, out, cornice, plinth } = tierBands(H, kind);
  const next: Plan = typeof o.next === 'object' ? o.next : tierPlan(o.next ?? W - 1, kind, o.redents);
  const cap = o.cap ?? o.next === undefined;
  const len: [number, number] = [clamp(snap(W / 16), 0.5, 0.875), clamp(snap(W / 9), 0.875, 1.375)];
  const off = (k: number): Plan => ({ ...plan, a: plan.a + k * out });
  const wall = mossed(c, 0.2);
  const ledge = mossed(c, 1);
  const closed = FACE.ny | FACE.py;

  // Base moulding, one step proud.
  let y = 0;
  let row = 0;
  if (plinth) {
    ring(c, off(1), y, y + band, { row: row++, look: wall, length: len, closed });
    core(c, off(1), y, y + band);
    y += band;
  }
  // The body in courses of ≤ 0.5 m, the false doors in their niches.
  const bodyH = H - band * (cornice + plinth);
  const courses = coursesOf(bodyH);
  const ax = axial(plan);
  const nw = kind === 'tier' && bodyH >= 1 && ax >= 0.5 ? clamp(snap(ax * 0.8, 0.125), 0.375, 1.5) : 0;
  const doorCourses = nw ? Math.max(1, Math.min(courses.length - 1, Math.round(courses.length * 0.6))) : 0;
  const yDoor = y;
  const first = c.m.stones.length;
  courses.forEach((h, i) => {
    const holes: [number, number][] = i < doorCourses ? [[-nw / 2, nw / 2]] : [];
    const fixed = nw && i === doorCourses ? { u0: -nw / 2 - 2 * T, u1: nw / 2 + 2 * T, proud: T } : undefined;
    // The storey darkens up into the shadow of its cornice.
    const dim = SHADOW[Math.min(SHADOW.length - 1, courses.length - 1 - i)];
    ring(c, plan, y, y + h, { row: row++, look: shaded(wall, dim), length: len, closed, fixed }, holes);
    y += h;
  });
  core(c, plan, yDoor, y);
  if (nw) falseDoors(c, plan, nw, yDoor, courses.slice(0, doorCourses).reduce((s, h) => s + h, 0));
  const body = c.m.stones.slice(first);
  if (kind === 'tier') carve(c, body, o.carving ?? 0.3);
  if (o.damage) weather(c, body, o.damage);
  // Cornice bands corbelled out, the top one paved as the ledge.
  for (let k = 1; k <= cornice; k++) {
    const pl = off(k);
    const co = { row: row++, look: k === cornice ? ledge : shaded(wall, k === 1 ? 0.92 : 1), length: len, closed: FACE.ny | (k < cornice ? FACE.py : 0) };
    if (k < cornice) {
      ring(c, pl, y, y + band, co);
      core(c, pl, y, y + band);
    } else pave(c, pl, y, y + band, co, cap ? undefined : next);
    y += band;
  }
  const top = snap(y);

  // Antefixes along the ledge: on the axis, at the axial corners and between,
  // on every redent corner (the diagonal's tallest).
  const A = off(cornice);
  const Ac = axial(A);
  const hA = o.antefix ?? snap(H * (kind === 'tier' ? 0.34 : 0.5));
  if (hA > 0) {
    const e = T;
    /** Depth of ledge in front of the next tier's body at u (from the ledge's front d). */
    const room = (u: number, d: number) => d - Math.max(0, planHalf(next, Math.abs(u))) - e;
    const small = kind === 'tier' ? 'shrine' : 'petal';
    const cornerW = snap(Math.min(A.s - 2 * e, hA * (kind === 'tier' ? 0.62 : 0.8)), 2 * T);
    for (const f of FACES) {
      // The axis: a pediment on a tier, a petal on a petal row.
      const axW = kind === 'tier' ? clamp(snap(Ac * 0.8, 2 * T), 4 * T, 1.5) : cornerW;
      const dAx = room(0, A.a - e);
      if (dAx >= 2 * T) antefix(c, f, kind === 'tier' ? 'pediment' : 'petal', 0, A.a - e, top, axW, Math.min(dAx, snap(kind === 'tier' ? axW * 0.4 : cornerW * 0.5)), kind === 'tier' ? hA * 1.2 : hA);
      // Between the axis and the axial corners, as many as fit.
      const span0 = axW / 2 + 2 * T;
      const span1 = Ac - cornerW - 2 * e;
      const fit = Math.floor((span1 - span0 + 2 * T) / (cornerW + 2 * T));
      for (let j = 0; j < fit; j++) {
        const uc = span1 - (span1 - span0) * (fit === 1 ? 0.5 : j / (fit - 1)) - cornerW / 2;
        const dd = Math.min(room(uc + cornerW / 2, A.a - e), snap(cornerW * (kind === 'tier' ? 1 : 0.5)));
        if (dd < 2 * T) continue;
        for (const side of [1, -1]) antefix(c, f, small, side * snap(uc), A.a - e, top, cornerW, dd, hA * 0.9);
      }
      for (let i = 0; i <= A.n; i++) {
        const cu = Ac + i * A.s;
        const cd = A.a - i * A.s;
        const diag = i === A.n;
        for (const side of diag ? [1] : [1, -1]) {
          // As big as the step allows, and clear of the next tier's body.
          let w = i === 0 ? Math.min(cornerW, snap(Ac - axW / 2 - 2 * T, 2 * T)) : cornerW;
          while (w >= 2 * T && room(cu - w - e, cd - e) < w * (kind === 'tier' ? 1 : 0.5)) w -= 2 * T;
          if (w < 2 * T) continue;
          const uc = side * (cu - e - w / 2);
          antefix(c, f, small, uc, cd - e, top, w, kind === 'tier' ? w : snap(w * 0.5), diag ? hA * 1.25 : hA);
        }
      }
    }
  }

  if (o.overgrowth) {
    // Moss cushions and grass along the ledge's front edges, authored on the front face and turned onto each.
    const r = rng(c.seed + 41);
    for (const f of FACES) {
      const q = new PieceBuilder();
      const ledges: Ledge[] = [];
      const add = (u0: number, u1: number, d1: number) => {
        const joints: number[] = [];
        for (let u = u0 + r.range(0.2, 0.8); u < u1 - 0.15; u += r.range(0.6, 1.2)) joints.push(snap(u));
        ledges.push({ x0: u0, x1: u1, y: 0, z0: d1 - 0.5, z1: d1, joints });
      };
      add(-Ac, Ac, A.a);
      for (let i = 1; i <= A.n; i++) {
        add(Ac + (i - 1) * A.s, Ac + i * A.s, A.a - i * A.s);
        if (i < A.n) add(-Ac - i * A.s, -Ac - (i - 1) * A.s, A.a - i * A.s);
      }
      overgrow(q, ledges, o.overgrowth, o.overgrowth * 0.6, c.seed + f * 13);
      placePiece({ voxels: p.voxels }, q.done(), { x: c.at[0], y: c.at[1] + top, z: c.at[2], turn: f });
    }
  }

  // Colliders: two crossed boxes out to the cornice's corners.
  const [ox, oy, oz] = c.at;
  const K = A.a - A.n * A.s;
  p.collider(ox - A.a, oy, oz - K, ox + A.a, oy + top, oz + K);
  p.collider(ox - K, oy, oz - A.a, ox + K, oy + top, oz + A.a);
  if (!o.masonry) c.m.emit(p.voxels);
  return { top, width: W, outline: 2 * A.a, plan };
}

/**
 * False doors in the niches of the axial faces: two carved leaves in a shade
 * darker, a texel apart, set back in the niche; the lintel above is a proud
 * stone of the course over it.
 */
function falseDoors(c: Ctx, plan: Plan, nw: number, y0: number, h: number): void {
  const back = plan.a - plan.s;
  const face = plan.a - 3 * T;
  for (const f of FACES) {
    const l = c.look(...faceMid(c, f, 0, y0, face));
    // The niche's back (closing the hollow ring) and the two leaves.
    faceBox(c, f, -nw / 2, nw / 2, y0, y0 + h, back, face - T, CORE, l.surf, 1);
    faceBox(c, f, -nw / 2, -T / 2, y0, y0 + h - T, face - T, face, l.color, l.surf, 0.8);
    faceBox(c, f, T / 2, nw / 2, y0, y0 + h - T, face - T, face, l.color, l.surf, 0.78);
  }
}

/**
 * Shallow carvings on a share of the body's stones, like the sheet's carved
 * blocks: a panel framed by a groove, or a small devata standing in a dark
 * niche — grooves a shade of the stone, a hair proud of its face.
 */
function carve(c: Ctx, stones: readonly Stone[], share: number): void {
  const v = c.p.voxels;
  for (const s of stones) {
    const b = s.box;
    const onX = s.face === FACE.px || s.face === FACE.nx;
    const len = onX ? b[5] - b[2] : b[3] - b[0];
    const h = b[4] - b[1];
    const hv = hash3(Math.round(b[0] * 16), Math.round(b[1] * 16), Math.round(b[2] * 16), c.seed + 29);
    if (hv > share || len < 6 * T || h < 5 * T) continue;
    const sign = s.face === FACE.px || s.face === FACE.pz ? 1 : -1;
    const plane = s.face === FACE.px ? b[3] : s.face === FACE.nx ? b[0] : s.face === FACE.pz ? b[5] : b[2];
    const a0 = onX ? b[2] : b[0];
    /** A mark on the face: along a‥a+w, up y‥y+hh, `proud` out of the face. */
    const mark = (a: number, w: number, y: number, hh: number, shade: number, proud = HAIR) => {
      const d0 = plane - sign * HAIR;
      const d1 = plane + sign * proud;
      const [p0, p1] = [Math.min(d0, d1), Math.max(d0, d1)];
      if (onX) v.span(p0, y, a, p1, y + hh, a + w, s.look.color, 'sandstone', { surf: s.look.surf, shade: (s.look.shade ?? 1) * shade });
      else v.span(a, y, p0, a + w, y + hh, p1, s.look.color, 'sandstone', { surf: s.look.surf, shade: (s.look.shade ?? 1) * shade });
    };
    const groove = 0.55;
    if (hv < share * 0.45 && h >= 7 * T) {
      // A devata: a dark niche three texels wide, the figure a hair proud inside it.
      const cx = a0 + snap(len / 2);
      const y0 = b[1] + 2 * T;
      const hh = snap(h - 3 * T);
      mark(cx - 2 * T, 4 * T, y0, hh, 0.45);
      mark(cx - T / 2, T, y0 + hh - 2 * T, 1.5 * T, 1.05, T / 2);
      mark(cx - T, 2 * T, y0 + snap(hh * 0.3), hh - 2 * T - snap(hh * 0.3), 1.02, T / 2);
      mark(cx - T / 2, T, y0, snap(hh * 0.3), 1, T / 2);
    } else {
      // A framed panel: a groove round an oblong two texels in from the stone's edges.
      const a = a0 + 2 * T;
      const w = snap(len - 4 * T);
      const y0 = b[1] + 2 * T;
      const hh = snap(h - 4 * T);
      mark(a, w, y0, T, groove);
      mark(a, w, y0 + hh - T, T, groove);
      mark(a, T, y0 + T, hh - 2 * T, groove);
      mark(a + w - T, T, y0 + T, hh - 2 * T, groove);
    }
  }
}

/**
 * Age on the body's stones: chipped arrises on about half of them (× amount),
 * cracks through a fifth, and now and then a stone fallen out of the face.
 */
function weather(c: Ctx, stones: readonly Stone[], amount: number): void {
  stones.forEach((s, i) => {
    const h = hash3(i, 17, 5, c.seed + 71);
    if (h < 0.04 * amount) c.m.knockOut(s, 0.25);
    else if (h < 0.24 * amount) c.m.crack(s, c.seed + i);
    else if (h < 0.7 * amount) c.m.chip(s, c.seed + i * 3);
  });
}

/** World coordinates of a face-local point (for looks). */
function faceMid(c: Ctx, f: Face, u: number, y: number, d: number): [number, number, number] {
  const [x0, , z0] = faceRect(f, u, u, d, d);
  return [x0 + c.at[0], y + c.at[1], z0 + c.at[2]];
}

// ── The lotus bud ────────────────────────────────────────────────────────────

export interface BudOptions {
  /** Width at its foot, its widest (m). */
  width: number;
  height: number;
  finish?: StoneFinish;
  seed: number;
  moss?: number;
  at?: [number, number, number];
}

/**
 * The lotus bud crowning the spire: a round-shouldered ogive of stone,
 * straight for its lowest third and closing to a point, in courses of
 * 16-sided rings (four crossed boxes each, so it reads round); eight petals clasp
 * its lower half, on the axes and diagonals, and a small knob tops it.
 * Returns its top (in its own frame). Its footprint is {@link budPlan}.
 */
export function lotusBud(p: PieceBuilder, o: BudOptions): number {
  const c = ctxOf(p, o);
  const look = mossed(c, 0.5);
  const R = snap(o.width / 2);
  const H = snap(o.height);
  const knob = Math.max(2 * T, snap(H * 0.08));
  const body = H - knob;
  const layer = clamp(snap(body / 12), T, 0.25);
  const n = Math.max(4, Math.round(body / layer));
  const [ox, oy, oz] = c.at;
  const v = p.voxels;
  const radius = (t: number) => (t <= 0.3 ? R : R * Math.pow(Math.cos(((t - 0.3) / 0.7) * (Math.PI / 2)), 0.75));
  let y = 0;
  let rMax = 0;
  for (let k = 0; k < n; k++) {
    const r = Math.max(T, snap(radius((k + 0.5) / n)));
    rMax = Math.max(rMax, r);
    const y1 = k === n - 1 ? body : snap(y + layer);
    const l = look(ox, oy + y, oz);
    const put = (hx: number, hz: number, e: number, shade: number) =>
      v.span(ox - hx, oy + y + e, oz - hz, ox + hx, oy + y1 - e, oz + hz, l.color, 'sandstone', { surf: l.surf, shade: (l.shade ?? 1) * shade });
    // A 16-sided ring from crossed boxes: the arms, the shoulders, the diagonals.
    const [a1, a2, a3] = [Math.max(T, snap(r * 0.36)), snap(r * 0.62), snap(r * 0.86)];
    put(r, a1, 0, 1);
    put(a1, r, HAIR, 0.97);
    if (a3 > a1 + T && a2 > a1) {
      put(a3, a2, 2 * HAIR, 1.02);
      put(a2, a3, 3 * HAIR, 0.99);
    }
    y = y1;
  }
  // Petals clasping the lower half: broad on the axes, narrower on the diagonals.
  const ph = snap(body * 0.5);
  const pw = snap(R * 0.55);
  for (const f of FACES) {
    const d = snap(radius(0.3)) + T;
    const l = look(...faceMid(c, f, 0, 0, d));
    faceBox(c, f, -pw / 2, pw / 2, 0, snap(ph * 0.7), d - 3 * T, d, l.color, l.surf, 0.96);
    faceBox(c, f, -pw / 4, pw / 4, snap(ph * 0.7), ph, d - 3 * T, d - T, l.color, l.surf, 1);
    // (the diagonal petal of this face's right-hand corner)
    const q = snap(R * 0.68) + T;
    const [x0, x1, z0, z1] = faceRect(f, q - 3 * T, q, q - 3 * T, q);
    const ld = look(ox + x0, oy, oz + z0);
    v.span(ox + x0, oy, oz + z0, ox + x1, oy + snap(ph * 0.8), oz + z1, ld.color, 'sandstone', { surf: ld.surf, shade: 0.97 });
  }
  // The knob.
  const kw = Math.max(T, snap(R * 0.14));
  const lk = look(ox, oy + body, oz);
  v.span(ox - kw, oy + body, oz - kw, ox + kw, oy + H, oz + kw, lk.color, 'sandstone', { surf: lk.surf });
  p.collider(ox - rMax, oy, oz - rMax, ox + rMax, oy + body, oz + rMax);
  return H;
}

/** The footprint of a bud `width` across, as a plan (inside its ring of crossed boxes). */
export function budPlan(width: number): Plan {
  const a = snap(width / 2);
  return { a, s: snap(a / 4), n: 1 };
}

// ── The spire ────────────────────────────────────────────────────────────────

export interface SpireOptions {
  /** Cornice width of the lowest tier, the spire's widest (m). */
  width: number;
  /** From the body's cornice to the tip of the bud (m). */
  height: number;
  /** Receding tiers (default 5). */
  tiers?: number;
  /** Lotus-petal rows above them (default 3). */
  petals?: number;
  redents?: number;
  finish?: StoneFinish;
  seed: number;
  moss?: number;
  at?: [number, number, number];
  /** Moss and grass on the ledges, and damage to the stones (see {@link TierOptions}). */
  overgrowth?: number;
  damage?: number;
  /** Build only parts from this index on, the first standing at y = 0 (e.g. the top tier and the crown). */
  from?: number;
  /** …and up to (not including) this index. */
  to?: number;
  masonry?: DryMasonry;
}

/** One part of a spire, in the spire's frame. */
export interface SpirePart {
  kind: 'tier' | 'petal' | 'bud';
  /** Foot of the part. */
  y: number;
  height: number;
  /** Body width across the axes (a bud: its foot). */
  width: number;
}

export interface SpireLayout {
  parts: SpirePart[];
  /** The tip. */
  top: number;
}

/**
 * The parts of a spire: tier heights shrinking by 6 % a tier, petal rows by
 * 22 % a row, the bud taking the rest; each part's cornice on the bud curve
 * width × (1 − (y / height)^1.5) at its foot (heights on the texel, widths on
 * 0.125 m).
 */
export function spireLayout(o: SpireOptions): SpireLayout {
  const Hs = snap(o.height, 0.125);
  const nt = o.tiers ?? 5;
  const np = o.petals ?? 3;
  const scale = Hs / 23;
  const parts: SpirePart[] = [];
  const at = (y: number) => o.width * (1 - Math.pow(Math.min(1, y / Hs), 1.5));
  let y = 0;
  const add = (kind: 'tier' | 'petal', h: number) => {
    const hh = snap(h, 0.125);
    const { out, cornice } = tierBands(hh, kind);
    parts.push({ kind, y, height: hh, width: snap(at(y) - 2 * cornice * out, 0.125) });
    y += hh;
  };
  for (let k = 0; k < nt; k++) add('tier', Hs * SHARE.tier * Math.pow(SHARE.tierShrink, k));
  for (let k = 0; k < np; k++) add('petal', Hs * SHARE.petal * Math.pow(SHARE.petalShrink, k));
  parts.push({ kind: 'bud', y, height: Math.max(0.5 * scale, Hs - y), width: snap(Math.max(at(y), 0.25 * scale * 4), 0.125) });
  return { parts, top: y + parts[parts.length - 1].height };
}

/** Build a spire (see {@link spireLayout} and the file header); returns its layout (the whole spire's, even with `from`). */
export function spire(p: PieceBuilder, o: SpireOptions): SpireLayout {
  const lay = spireLayout(o);
  const m = o.masonry ?? new DryMasonry(o.seed);
  const [ox, oy, oz] = o.at ?? [0, 0, 0];
  const from = o.from ?? 0;
  const to = Math.min(o.to ?? lay.parts.length, lay.parts.length);
  const y0 = lay.parts[from]?.y ?? 0;
  for (let i = from; i < to; i++) {
    const part = lay.parts[i];
    const at: [number, number, number] = [ox, oy + part.y - y0, oz];
    const seed = o.seed + i * 101;
    if (part.kind === 'bud') {
      lotusBud(p, { width: part.width, height: part.height, finish: o.finish, seed, moss: o.moss, at });
      continue;
    }
    const up = lay.parts[i + 1];
    towerTier(p, {
      width: part.width,
      height: part.height,
      kind: part.kind,
      redents: part.kind === 'tier' ? o.redents : undefined,
      next: !up ? undefined : up.kind === 'bud' ? budPlan(up.width) : tierPlan(up.width, up.kind, up.kind === 'tier' ? o.redents : undefined),
      cap: i === to - 1,
      overgrowth: o.overgrowth,
      damage: o.damage,
      finish: o.finish,
      seed,
      moss: o.moss,
      at,
      masonry: m,
    });
  }
  if (!o.masonry) m.emit(p.voxels);
  return lay;
}

/** A spire (or part of one) as a kit piece. */
export function spirePiece(o: SpireOptions): KitPiece {
  const p = new PieceBuilder();
  spire(p, o);
  return p.done();
}

