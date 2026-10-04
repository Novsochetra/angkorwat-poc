import { BufferGeometry, Color, Matrix4 } from 'three';
import type { Finish, Palette } from './finish';
import { hash, lathe, profileRadius, redented, revolve, sheet, smooth01, vnoise, type Plan } from './offerings';
import { meshSculpt, Sculpt, type MeshOptions, type SculptMesh } from './sculpt';
import { roundBox, union, type Box, type Shape } from './sdf';
import { addBayonFaces } from './_stupaFace';

/**
 * The shape of a Khmer stupa (chetdei, ចេតិយ) for stupa.ts, at its
 * reference size (4 m to the tip; y up, the front +z):
 *
 * - a tall stepped base on the Khmer redented plan (each corner stepped in
 *   twice): three receding steps, a moulded pedestal with a band of lotus
 *   petals hanging down and one standing up, a cornice;
 * - the cella: a square body with a false door on each side (a gilt frame,
 *   a painted panel, a pediment over it), or on the front a niche under a
 *   pointed arch with a flame on its point, for a small Buddha;
 * - form `tower`: over it, a tower like Angkor Wat's, seven tiers drawing
 *   in upward in the outline of a lotus bud (a corn cob: it swells a
 *   little over its foot, then draws in ever faster), each on a deeper
 *   redented plan, its walls leaning in, its cornice set at every corner
 *   with three leaf-shaped antefixes, more along the sides, and a small
 *   pediment in the middle of each side, the antefixes leaning in as a
 *   bud's petals close;
 * - form `faces`: over the cella a square stage with a Bayon face on each
 *   side, looking to the four directions (_stupaFace.ts), under a
 *   diadem's band, then four tiers;
 * - the lotus crown: two rows of petals, the closed bud in its petals, a
 *   short gold tip (the stone stupa ends at its bud).
 *
 * The big forms are sculpted (sculpt.ts: soft stucco and stone, baked
 * shade, weathering painted on); the small sharp ones — antefixes,
 * pediments, the crown's petals, the tip — are thin plain plaques in the
 * same material (`stupaOrnaments`), like the offerings' petals.
 */

export type StupaForm = 'tower' | 'faces';
export type StupaLook = 'white' | 'gold' | 'stone';
export type StupaDetail = 'near' | 'far' | 'coarse';

// ── Measures (the reference: 4 m to the tip; plain, no niche) ────────────────

/** The base's and the cella's plan: the Khmer redented square. */
const BASE_REDENT = 0.16;
const BASE_PLAN = redented(BASE_REDENT);
/** The tiers' plan: stepped in deeper, as on Angkor Wat's towers. */
const TIER_REDENT = 0.2;
const TIER_PLAN = redented(TIER_REDENT);

/** The cella: its foot and half-width (m); its height is `cellaH`. */
const CELLA = { foot: 0.8, r: 0.62 };
/** The cella's height: taller with a niche in it (m). */
const cellaH = (niche: boolean) => (niche ? 0.9 : 0.42);
/** How much everything over the cella rises for a niche (m). */
const lift = (niche: boolean) => cellaH(niche) - cellaH(false);
/** The lotus bud's top and the gold tip's (m). */
const BUD_TOP = 3.78;
const TIP_TOP = 4.0;
/** The reference's full height (to the tip; the stone one ends at its bud). */
export const stupaTop = (niche: boolean, look: StupaLook) => (look === 'stone' ? BUD_TOP : TIP_TOP) + lift(niche);

/** The niche in the cella's front (m): its floor, half its width, where its arch springs and its point, its depth, and the frame's middle plane. */
export const NICHE = { floor: 0.8, halfWidth: 0.25, spring: 1.22, point: 1.52, depth: 0.36, face: 0.6 };
/** The niche's frame: how far it stands round the opening (m). */
const FRAME = 0.065;

/** A tier of the tower: its foot (plain) and height, the outline's half-width at its foot and top (m). */
interface Tier {
  y: number;
  h: number;
  r0: number;
  r1: number;
}

/**
 * The outline of a lotus bud (Angkor Wat's towers): its half-width as a
 * share of the foot's at share t of the way from the foot to the bud's
 * tip. It swells a little over the foot, holds, then draws in ever faster
 * to the point: a corn cob.
 */
const BUD_OUTLINE: [number, number][] = [
  [0, 1],
  [0.15, 1.02],
  [0.3, 1],
  [0.45, 0.93],
  [0.6, 0.8],
  [0.72, 0.65],
  [0.82, 0.5],
  [0.9, 0.35],
  [0.96, 0.2],
  [1, 0],
];

/** Tiers from `y` (m) of these heights on the bud's outline, `r` its half-width at `y` (m). */
function budTiers(y: number, r: number, heights: number[]): Tier[] {
  const H = BUD_TOP - y;
  const at = (dy: number) => {
    const t = dy / H;
    for (let i = 1; i < BUD_OUTLINE.length; i++)
      if (t <= BUD_OUTLINE[i][0]) {
        const [t0, f0] = BUD_OUTLINE[i - 1];
        const [t1, f1] = BUD_OUTLINE[i];
        return r * (f0 + ((f1 - f0) * (t - t0)) / (t1 - t0));
      }
    return 0;
  };
  const out: Tier[] = [];
  let t = 0;
  for (const h of heights) {
    out.push({ y: y + t, h, r0: at(t), r1: at(t + h) });
    t += h;
  }
  return out;
}

/** Form `tower`: seven tiers over the cella, each a little lower, up to the lotus crown. */
const TOWER_TIERS = budTiers(1.22, 0.58, [0.36, 0.33, 0.31, 0.29, 0.27, 0.26, 0.26]);
/** Form `faces`: the stage of the faces over the cella, and four tiers over it. */
const FACE_STAGE: Tier = { y: 1.22, h: 0.6, r0: 0.44, r1: 0.44 };
const FACE_TIERS = budTiers(1.82, 0.465, [0.4, 0.37, 0.35, 0.36]);
/** The faces: their height (chin to diadem) and middle (plain, m). */
const FACE_H = 0.48;
const FACE_Y = FACE_STAGE.y + 0.035 + (0.84 * FACE_STAGE.h - 0.035) / 2;
/** Where the tiers end and the lotus crown stands (m). */
const CROWN_FOOT = 3.3;

/** The tiers of a form. */
const tiersOf = (form: StupaForm): Tier[] => (form === 'faces' ? [FACE_STAGE, ...FACE_TIERS] : TOWER_TIERS);
/** A tier's outline at share f of its height (m). */
const outline = (t: Tier, f: number) => t.r0 + (t.r1 - t.r0) * f;
/** Where a tier's cornice is (share of its height) and how far out (m); the stage of the faces has its diadem's band there. */
const corniceOf = (t: Tier, stage: boolean) => (stage ? { f: 0.965, r: t.r0 + 0.045 } : { f: 0.62, r: outline(t, 0.55) });

/**
 * Grid cells (m, reference size) by detail; `fineCell` for the faces (the
 * sculpt's fine zones). `coarse`: once its cells span under 1.2 px
 * (_detail.ts), its plaques fewer and plainer; it also casts the still
 * shadows.
 */
const FAR = { cell: 0.095, fineCell: 0.04 };
export const STUPA_CELLS: Record<StupaDetail, MeshOptions> = {
  near: { cell: 0.048, fineCell: 0.016 },
  far: FAR,
  // (shaded as the far one is: sculpt.ts `occlusionAs`)
  coarse: { cell: 0.15, fineCell: 0.075, occlusionAs: FAR },
};

// ── Profiles ([r, y] m, foot to top) ──────────────────────────────────────────

const up = (p: [number, number][], dy: number): [number, number][] => p.map(([r, y]) => [r, y + dy]);

/** Three receding steps, a round moulding, the dado between the petal bands, the cornice. */
const BASE: [number, number][] = [
  [0, 0],
  [0.92, 0],
  [0.92, 0.12],
  [0.9, 0.14],
  [0.86, 0.14],
  [0.86, 0.26],
  [0.84, 0.28],
  [0.8, 0.28],
  [0.8, 0.4],
  [0.78, 0.42],
  [0.79, 0.43],
  [0.795, 0.455],
  [0.78, 0.48],
  [0.765, 0.48],
  [0.765, 0.575],
  [0.7, 0.58],
  [0.69, 0.655],
  [0.705, 0.66],
  [0.72, 0.68],
  [0.74, 0.72],
  [0.745, 0.73],
  [0.745, 0.755],
  [0.7, 0.77],
  [0.66, 0.785],
  [0.66, CELLA.foot],
  [0, CELLA.foot],
];

/** The cella to its top `t`: a foot band, the wall, a cornice. */
const cellaProfile = (t: number): [number, number][] => [
  [0, CELLA.foot],
  [0.645, CELLA.foot],
  [0.645, CELLA.foot + 0.035],
  [CELLA.r, CELLA.foot + 0.05],
  [CELLA.r, t - 0.1],
  [0.64, t - 0.085],
  [0.668, t - 0.06],
  [0.668, t - 0.025],
  [0.64, t - 0.005],
  [0.6, t],
  [0, t],
];

/**
 * The tiers as one profile: each a foot band, a wall leaning in with the
 * outline, a cornice out to it, a sloping top in to the next (the stage of
 * the faces: an upright wall and the diadem's band).
 */
function tierProfile(tiers: Tier[], form: StupaForm, L: number): [number, number][] {
  const p: [number, number][] = [[0, tiers[0].y + L]];
  tiers.forEach((t, i) => {
    const y = t.y + L;
    const { h } = t;
    const foot = t.r0 * 0.95;
    const next = i + 1 < tiers.length ? tiers[i + 1].r0 * 0.95 : 0.26;
    p.push([foot + 0.012, y], [foot + 0.012, y + 0.025], [foot, y + 0.035]);
    if (form === 'faces' && i === 0) {
      const r = t.r0;
      p.push([r, y + 0.84 * h], [r + 0.03, y + 0.87 * h], [r + 0.045, y + 0.9 * h], [r + 0.045, y + 0.97 * h], [r + 0.012, y + h - 0.006]);
    } else {
      const wall = outline(t, 0.45) * 0.93;
      const c = corniceOf(t, false);
      p.push([wall, y + 0.45 * h], [wall + 0.015, y + 0.48 * h], [c.r + 0.02, y + 0.52 * h], [c.r + 0.02, y + 0.58 * h], [c.r, y + c.f * h]);
    }
    p.push([next + 0.02, y + h - 0.004]);
  });
  const last = tiers[tiers.length - 1];
  p.push([0, last.y + last.h + L]);
  return p;
}

/** The lotus crown's drum and core (round, under the petal rows), and the bud. */
const DRUM: [number, number][] = [
  [0, 3.28],
  [0.27, 3.28],
  [0.27, 3.33],
  [0.25, 3.35],
  [0.232, 3.35],
  [0.228, 3.4],
  [0.21, 3.43],
  [0, 3.43],
];
const BUD: [number, number][] = [
  [0, 3.41],
  [0.165, 3.42],
  [0.178, 3.47],
  [0.168, 3.53],
  [0.14, 3.59],
  [0.1, 3.65],
  [0.058, 3.71],
  [0.022, 3.755],
  [0, BUD_TOP],
];

// ── Shapes ────────────────────────────────────────────────────────────────────

/**
 * A band of lotus petals round a square or redented plan: like offerings.ts
 * `crown`, but the petals spaced `step` m apart along each side from its
 * middle (one bent round each corner when a side holds whole steps), their
 * points rising `tip` m over y1 (hanging below y0 when `tip` < 0).
 */
function planCrown(o: { y0: number; y1: number; r0: number; r1: number; plan: Plan; step: number; tip: number; shape?: number; bulge?: number; flare?: number }): Shape {
  const { y0, y1, r0, r1, plan, step, tip } = o;
  const shape = o.shape ?? 0.6;
  const bulge = o.bulge ?? 0;
  const flare = o.flare ?? 0;
  const rising = tip >= 0;
  const slope = (r1 - r0) / Math.max(y1 - y0, 1e-6);
  const sideNorm = 1 / Math.sqrt(1 + Math.min(Math.abs(slope), 4) ** 2);
  const edgeNorm = 1 / Math.sqrt(1 + ((2 * Math.abs(tip)) / step) ** 2);
  const R = Math.max(r0, r1) + Math.abs(tip * flare) + bulge + 0.001;
  return {
    d(x, y, z) {
      let u = Math.min(Math.abs(x), Math.abs(z)) / step;
      u -= Math.round(u);
      const w = 1 - Math.abs(u) * 2;
      const over = rising ? Math.max(0, y - y1) : Math.max(0, y0 - y);
      const rr = r0 + slope * (y - y0) + flare * over + bulge * (1 - 4 * u * u);
      const side = (plan(x, z) - rr) * sideNorm;
      const edge = tip * Math.pow(w, shape);
      const ends = rising ? Math.max(y0 - y, (y - (y1 + edge)) * edgeNorm) : Math.max(y - y1, (y0 + edge - y) * edgeNorm);
      return Math.max(side, ends);
    },
    box: [-R, rising ? y0 : y0 + tip, -R, R, rising ? y1 + tip : y1, R],
  };
}

/** Distance to a rectangle of half-sizes (hx, hy) round the origin (2D). */
function rect(px: number, py: number, hx: number, hy: number): number {
  const qx = Math.abs(px) - hx;
  const qy = Math.abs(py) - hy;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
}

/**
 * A shape drawn on the cella's +x side (a = out from the axis, b across ≥ 0,
 * y up), on all four sides (the square's symmetry); none on the front
 * (+z) when `front` is false.
 */
function onSides(d: (a: number, y: number, b: number) => number, box: Box, front: boolean): Shape {
  return {
    d(x, y, z) {
      const ax = Math.abs(x);
      const az = Math.abs(z);
      if (!front && z > ax) return 1;
      return ax >= az ? d(ax, y, az) : d(az, y, ax);
    },
    box,
  };
}

/** The door's opening on each side of the cella: its foot and top (m). */
const doorSpan = (niche: boolean): [number, number] => [0.88, niche ? 1.52 : 1.14];

/**
 * A pointed arch's outline (2D, m): straight sides `w` from the axis up to
 * `spring`, then two arcs meeting at `point`; grown by `grow`.
 */
function arch(x: number, y: number, w: number, floor: number, spring: number, point: number, grow = 0): number {
  const rise = point - spring;
  const R = (w * w + rise * rise) / (2 * w);
  const c = R - w;
  const sides = rect(x, y - (floor + spring) / 2, w, (spring - floor) / 2);
  const top = Math.max(Math.hypot(Math.abs(x) + c, y - spring) - R, spring - y);
  return Math.min(sides, top) - grow;
}

/**
 * The stupa as a sculpt (regions `wall`, `petal`, `nicheFrame`, `crown`,
 * `bud`, the faces' `face` and `diadem`; painted `plinth`, `band`, `door`,
 * `niche`, the faces' `eye`, `brow`, `lip`, and the weather: `lichen`,
 * `stain`, `moss` on stone, `streak`, `grime` on stucco).
 */
export function stupaSculpt(form: StupaForm, niche: boolean, stone: boolean): Sculpt {
  const s = new Sculpt();
  const L = lift(niche);
  const T = CELLA.foot + cellaH(niche);
  const tiers = tiersOf(form);

  // The stepped base and the pedestal, their petals (hanging under the dado, standing over it).
  s.add(lathe(BASE, { plan: BASE_PLAN, round: 0.012, res: 0.006 }), 'wall');
  const k = 1 - BASE_REDENT / 2;
  s.add(planCrown({ y0: 0.55, y1: 0.575, r0: 0.768, r1: 0.768, plan: BASE_PLAN, step: (0.768 * k) / 4, tip: -0.07, bulge: 0.01, flare: 0.25 }), 'petal', 0.006);
  s.add(planCrown({ y0: 0.655, y1: 0.68, r0: 0.708, r1: 0.722, plan: BASE_PLAN, step: (0.72 * k) / 4, tip: 0.06, bulge: 0.01, flare: 0.3 }), 'petal', 0.006);

  // The cella, a false door framed on each side (not the front, with a niche).
  s.add(lathe(cellaProfile(T), { plan: BASE_PLAN, round: 0.01, res: 0.005 }), 'wall');
  const [d0, d1] = doorSpan(niche);
  const outer = [0.16, d0, d1 + 0.045];
  const inner = [0.105, d0 - 0.05, d1 - 0.012];
  const R = CELLA.r + 0.03;
  s.add(
    onSides(
      (a, y, b) => {
        const ring = Math.max(rect(b, y - (outer[1] + outer[2]) / 2, outer[0], (outer[2] - outer[1]) / 2), -rect(b, y - (inner[1] + inner[2]) / 2, inner[0], (inner[2] - inner[1]) / 2));
        return Math.max(ring, Math.abs(a - CELLA.r + 0.002) - 0.03);
      },
      [-R, d0 - 0.01, -R, R, d1 + 0.05, R],
      !niche,
    ),
    'nicheFrame',
    0.006,
  );
  s.paint(
    onSides((a, y, b) => Math.max(rect(b, y - (d0 + d1 - 0.01) / 2, inner[0], (d1 - 0.01 - d0) / 2), Math.abs(a - CELLA.r) - 0.05), [-R, d0, -R, R, d1, R], !niche),
    'door',
  );

  if (niche) {
    // The niche: a raised frame with a pointed arch, the opening cut through it into the cella.
    const { floor, halfWidth: w, spring, point, depth, face } = NICHE;
    s.add(
      {
        d: (x, y, z) => Math.max(arch(x, y, w, floor - 0.02, spring, point, FRAME), Math.abs(z - face) - 0.04),
        box: [-w - FRAME, floor - 0.03, face - 0.04, w + FRAME, point + FRAME + 0.02, face + 0.04],
      },
      'nicheFrame',
      0.01,
    );
    s.carve(
      {
        d: (x, y, z) => Math.max(arch(x, y, w, floor, spring, point), Math.abs(z - face) - depth),
        box: [-w, floor, face - depth, w, point, face + depth],
      },
      0.012,
    );
    s.paint(roundBox([0, (floor + point) / 2, face - depth / 2 - 0.02], [w - 0.012, (point - floor) / 2, depth / 2], 0), 'niche');
  }

  // The tower's tiers (form `faces`: the stage of the faces first), and the faces.
  s.add(lathe(tierProfile(tiers, form, L), { plan: TIER_PLAN, round: 0.008, res: 0.005 }), 'wall');
  if (form === 'faces') addBayonFaces(s, { wall: FACE_STAGE.r0, y: FACE_Y + L, height: FACE_H });

  // The lotus crown's drum and core (their petals are plaques: `stupaOrnaments`), the bud.
  s.add(lathe(up(DRUM, L), { round: 0.006, res: 0.004 }), 'crown');
  s.add(lathe(up(BUD, L), { round: 0.008, res: 0.004 }), 'bud', 0.012);

  // Painted: the steps, the gilt (or darker) lines on the cornices.
  s.paint(roundBox([0, stone ? 0.14 : 0.21, 0], [1, stone ? 0.14 : 0.21, 1]), 'plinth');
  const slab = (y0: number, y1: number, r: number): Shape => roundBox([0, (y0 + y1) / 2, 0], [r, (y1 - y0) / 2, r]);
  const bands: Shape[] = [slab(0.725, 0.78, 0.8), slab(T - 0.09, T, 0.72)];
  tiers.forEach((t, i) => {
    const y = t.y + L;
    if (form === 'faces' && i === 0) bands.push(slab(y + 0.86 * t.h, y + t.h, t.r0 + 0.07));
    else bands.push(slab(y + 0.5 * t.h, y + 0.6 * t.h, t.r0 + 0.08));
  });
  s.paint(union(bands), 'band');

  weathering(s, stone, form === 'faces' ? FACE_Y + L : null, CROWN_FOOT + L);
  return s;
}

/**
 * Weather painted on (after the shapes): on stone, pale lichen, dark rain
 * stains and moss on what faces up and low down; on stucco, grey rain
 * streaks down the walls (not over the faces or the gilt crown) and grime
 * at the foot.
 */
function weathering(s: Sculpt, stone: boolean, faces: number | null, crown: number): void {
  const bounds = s.bounds();
  const slope = (x: number, y: number, z: number) => {
    const e = 0.03;
    const gx = s.distance(x + e, y, z) - s.distance(x - e, y, z);
    const gy = s.distance(x, y + e, z) - s.distance(x, y - e, z);
    const gz = s.distance(x, y, z + e) - s.distance(x, y, z - e);
    return gy / (Math.sqrt(gx * gx + gy * gy + gz * gz) || 1);
  };
  const where = (f: (x: number, y: number, z: number) => number): Shape => ({ d: (x, y, z) => -f(x, y, z), box: bounds });
  if (stone) {
    s.paint(where((x, y, z) => 0.7 * vnoise(x * 1.7, y * 5, z * 1.7) + 0.5 * vnoise(x * 9, y * 9, z * 9) - 0.45), 'lichen');
    s.paint(where((x, y, z) => vnoise(x * 12, y * 0.9, z * 12) * 0.9 + 0.35 * vnoise(x * 3, y * 3, z * 3) - 0.62), 'stain');
    s.paint(
      where((x, y, z) => {
        const n = 0.6 * vnoise(x * 2.3 + 5, y * 2.3, z * 2.3) + 0.4 * vnoise(x * 8, y * 8, z * 8);
        // (moss low down and on the tiers' tops; the slope only when it could decide)
        const rest = (1 - smooth01(y / 1.2)) * 0.5 + n * 0.9 - 1.05;
        return rest + 0.9 <= 0 ? rest : rest + 0.9 * smooth01((slope(x, y, z) - 0.35) / 0.4);
      }),
      'moss',
    );
    return;
  }
  s.paint(
    where((x, y, z) => {
      if (y > crown || (faces !== null && Math.abs(y - faces) < 0.27)) return -1;
      const n = vnoise(x * 10, y * 0.7, z * 10) * 0.8 + 0.3 * vnoise(x * 2, y * 2, z * 2) - 0.55;
      return n <= 0 ? n : n - smooth01((slope(x, y, z) - 0.2) / 0.3);
    }),
    'streak',
  );
  s.paint(where((x, y, z) => 0.4 * vnoise(x * 4, y * 4, z * 4) + 0.2 * vnoise(x * 13, y * 13, z * 13) + (1 - smooth01(y / 0.35)) * 0.8 - 0.72), 'grime');
}

/**
 * The stupa's mesh at a detail (sculpted, meshed, the stone worn), and how
 * long it all took (ms). Pass the sculpt when it is made already.
 */
export function meshStupa(form: StupaForm, niche: boolean, stone: boolean, detail: StupaDetail, sculpt?: Sculpt): SculptMesh {
  const t0 = performance.now();
  const s = sculpt ?? stupaSculpt(form, niche, stone);
  const m = meshSculpt(s, STUPA_CELLS[detail]);
  if (stone) weatherStone(m.geometry, 0.016, 4.2);
  return { geometry: m.geometry, regions: m.regions, ms: performance.now() - t0 };
}

/**
 * Wears a stone mesh (m): each vertex pushed in or out along its normal
 * by a smooth noise `amp` m deep, `freq` bumps a metre, its normal tipped
 * to match: pitted faces, softened edges. (Far cheaper than wearing the
 * sculpt's shapes.)
 */
export function weatherStone(g: BufferGeometry, amp: number, freq: number): void {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const e = 0.35 / freq;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const f = vnoise(x * freq, y * freq, z * freq);
    const gx = (vnoise((x + e) * freq, y * freq, z * freq) - f) / e;
    const gy = (vnoise(x * freq, (y + e) * freq, z * freq) - f) / e;
    const gz = (vnoise(x * freq, y * freq, (z + e) * freq) - f) / e;
    const nx = n.getX(i);
    const ny = n.getY(i);
    const nz = n.getZ(i);
    const d = gx * nx + gy * ny + gz * nz;
    // (the slope along the surface tips the normal)
    const tx = nx - amp * (gx - d * nx);
    const ty = ny - amp * (gy - d * ny);
    const tz = nz - amp * (gz - d * nz);
    const l = Math.hypot(tx, ty, tz) || 1;
    p.setXYZ(i, x + nx * amp * f, y + ny * amp * f, z + nz * amp * f);
    n.setXYZ(i, tx / l, ty / l, tz / l);
  }
  p.needsUpdate = true;
  n.needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();
}

// ── The plaques: antefixes, pediments, the crown's petals, the tip ────────────

/**
 * A leaf-shaped antefix (a thin plaque; its foot's middle at the origin,
 * rising along +y, its face to +z): swelling from its foot like the flame
 * leaf of kbach, drawn out to a point that bends out, a ridge up its middle.
 */
function antefix(w: number, h: number, f: Finish, tip: Finish = f, plain = false): BufferGeometry {
  return sheet(
    plain ? 1 : 2,
    plain ? 2 : 3,
    (u, v) => {
      const s = v < 0.3 ? 0.6 + 0.4 * Math.sin((v / 0.3) * (Math.PI / 2)) : Math.cos(((v - 0.3) / 0.7) * (Math.PI / 2)) ** 0.9;
      const hw = (w / 2) * Math.max(0.04, s);
      return [(u - 0.5) * 2 * hw, v * h, (1 - Math.abs(2 * u - 1)) * w * 0.16 * (1 - 0.6 * v) + 0.22 * h * v ** 2.5];
    },
    (_u, v) => ({ f: blend(f, tip, (v - 0.4) / 0.3), occ: 0.5 + 0.5 * Math.min(1, v * 1.7) }),
    w * 0.15,
  );
}

/** Finish a to b by t (0‥1, clamped). */
function blend(a: Finish, b: Finish, t: number): Finish {
  if (a === b || t <= 0) return a;
  if (t >= 1) return b;
  const mix = (p: number, q: number) => p + (q - p) * t;
  return { color: new Color(a.color).lerp(new Color(b.color), t).getHex(), metal: mix(a.metal, b.metal), rough: mix(a.rough, b.rough), grain: mix(a.grain ?? 0.3, b.grain ?? 0.3) };
}

/**
 * A small pediment (a thin plaque; its foot's middle at the origin, rising
 * along +y, face +z): the Khmer pointed arch, straight sides a little way,
 * then drawn in to a point that lifts; its edge cut in flame teeth.
 */
function pediment(w: number, h: number, f: Finish): BufferGeometry {
  const rows = 6;
  return sheet(
    2,
    rows,
    (u, v) => {
      const s = v < 0.22 ? 1 : Math.cos(((v - 0.22) / 0.78) * (Math.PI / 2)) ** 1.25;
      // (every other row a tooth out)
      const tooth = v > 0.05 && v < 0.95 && Math.round(v * rows) % 2 === 1 ? 1.14 : 1;
      const hw = (w / 2) * Math.max(0.03, s) * tooth;
      return [(u - 0.5) * 2 * hw, v * h, (1 - Math.abs(2 * u - 1)) * w * 0.08 + 0.12 * h * v ** 3];
    },
    (_u, v) => ({ f, occ: 0.55 + 0.45 * Math.min(1, v * 1.5) }),
    Math.min(0.02, w * 0.1),
  );
}

/**
 * A lotus petal (a thin plaque; foot's middle at the origin, rising along
 * +y, its back to +z): round shoulders and a point, cupped toward the axis,
 * its tip curling out.
 */
function petal(w: number, h: number, f: Finish, plain = false): BufferGeometry {
  return sheet(
    plain ? 1 : 2,
    plain ? 2 : 4,
    (u, v) => {
      const hw = (w / 2) * Math.max(0.05, Math.sin(Math.PI * Math.pow(v, 0.62)) ** 0.55);
      const e = (2 * u - 1) ** 2;
      return [(u - 0.5) * 2 * hw, v * h, -0.35 * e * hw + 0.18 * h * v * v];
    },
    (_u, v) => ({ f, occ: 0.55 + 0.45 * v }),
    Math.min(0.012, w * 0.1),
  );
}

/** A plaque stood at (x, y, z), its face turned to (nx, nz) and leaning out by `lean` (rad). */
function stand(g: BufferGeometry, x: number, y: number, z: number, nx: number, nz: number, lean: number): BufferGeometry {
  const m = new Matrix4().makeRotationY(Math.atan2(nx, nz)).multiply(new Matrix4().makeRotationX(lean));
  m.setPosition(x, y, z);
  return g.applyMatrix4(m);
}

const CORNERS: [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const SIDES: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * The plaques of a stupa (reference size, in `pal`'s `antefix`, `fronton`,
 * `crown`, `bud`, `tip` and `nicheFrame` finishes): antefixes at the
 * corners of the cella's cornice and of each tier's (three to a corner, on
 * the corner and on the redents either side), a pediment over each door
 * and in the middle of each tier's side, the flame on the niche's point,
 * the crown's two rows of petals and the petals clasping the bud, the gold
 * tip (not on stone). The far detail keeps the corners' antefixes and the
 * crown; the coarse one the same, plainer, and one row of the crown's
 * petals. On stone some antefixes have fallen.
 */
export function stupaOrnaments(form: StupaForm, niche: boolean, look: StupaLook, detail: StupaDetail, pal: Palette): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const L = lift(niche);
  const T = CELLA.foot + cellaH(niche);
  const near = detail === 'near';
  /** The coarse detail: plaques of fewer facets, one row of petals round the crown. */
  const plain = detail === 'coarse';
  const fallback = pal['*'];
  const fA = pal.antefix ?? fallback;
  const fT = pal.antefixTip ?? fA;
  const fP = pal.fronton ?? fA;
  let n = 0;
  /** Stone: about one antefix in five has fallen. */
  const kept = () => look !== 'stone' || hash(n++, 17, 5) > 0.2;

  // A corner's three antefixes on a cornice at y, the plan's outer size r (redent a): the corner one bigger; leaning `lean` (rad, < 0: in).
  const cornerSet = (y: number, r: number, a: number, h: number, w: number, lean: number) => {
    const c = r * (1 - a / 2) - 0.012;
    for (const [sx, sz] of CORNERS) {
      if (kept()) out.push(stand(antefix(w, h, fA, fT, plain), sx * c, y, sz * c, sx, sz, lean));
      if (!near) continue;
      if (kept()) out.push(stand(antefix(w * 0.8, h * 0.82, fA, fT), sx * (r - 0.012), y, sz * r * (1 - a), sx, 0, lean));
      if (kept()) out.push(stand(antefix(w * 0.8, h * 0.82, fA, fT), sx * r * (1 - a), y, sz * (r - 0.012), 0, sz, lean));
    }
  };

  // The cella's cornice, the pediments over its doors (over the niche: its flame).
  cornerSet(T - 0.01, 0.668, BASE_REDENT, 0.2, 0.1, -0.08);
  if (near)
    for (const [nx, nz] of SIDES) {
      if (niche && nz > 0) continue;
      out.push(stand(pediment(0.3, 0.25, fP), nx * 0.675, T - 0.07, nz * 0.675, nx, nz, -0.04));
    }
  if (niche) out.push(stand(antefix(0.11, 0.2, pal.nicheFrame ?? fA, pal.nicheFrame ?? fA, plain), 0, NICHE.point + FRAME - 0.035, NICHE.face + 0.03, 0, 1, -0.05));

  // Each tier's cornice (the stage of the faces: its diadem's band): the corners, antefixes along the sides, a pediment in the middle of each.
  tiersOf(form).forEach((t, i) => {
    const stage = form === 'faces' && i === 0;
    const c = corniceOf(t, stage);
    const y = t.y + L + c.f * t.h;
    // (leaning in with the outline and a little more, as a bud's petals close)
    const lean = -(Math.atan2(t.r0 - t.r1, t.h) + 0.15);
    const h = stage ? 0.3 : t.h * 0.95;
    cornerSet(y, c.r, TIER_REDENT, h, h * 0.5, lean);
    if (!near || stage) return;
    for (const [nx, nz] of SIDES) {
      const e = c.r + 0.012;
      out.push(stand(pediment(t.h * 0.62, t.h * 0.8, fP), nx * e, t.y + L + 0.28 * t.h, nz * e, nx, nz, lean * 0.5));
      if (i > 4) continue;
      for (const sgn of [-1, 1]) {
        const u = sgn * c.r * 0.47;
        const d = c.r - 0.012;
        if (kept()) out.push(stand(antefix(h * 0.4, h * 0.75, fA, fT), nx ? nx * d : u, y, nz ? nz * d : u, nx, nz, lean));
      }
    }
  });

  // The lotus crown: a row of petals round the drum, a row round the core between them, the petals clasping the bud.
  const fC = pal.crown ?? fallback;
  const ring = (count: number, r: number, y: number, w: number, h: number, lean: number, phase: number) => {
    for (let k = 0; k < count; k++) {
      const a = ((k + phase) / count) * Math.PI * 2;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      out.push(stand(petal(w, h, fC, plain), nx * r, y, nz * r, nx, nz, lean));
    }
  };
  ring(near ? 16 : plain ? 8 : 10, 0.262, 3.3 + L, near ? 0.13 : plain ? 0.22 : 0.18, 0.16, -0.3, 0);
  if (!plain) ring(near ? 14 : 9, 0.222, 3.37 + L, near ? 0.12 : 0.165, 0.14, -0.5, 0.5);
  const fB = pal.bud ?? fC;
  const budR = profileRadius(BUD, 0.006);
  const count = near ? 8 : plain ? 4 : 6;
  for (let k = 0; k < count; k++) {
    const a0 = (k / count) * Math.PI * 2 + 0.2;
    out.push(
      sheet(
        2,
        near ? 5 : plain ? 2 : 3,
        (u, v) => {
          const y = 3.44 + v * 0.22;
          const half = (Math.PI / count) * 1.05 * Math.max(0.05, Math.sin(Math.PI * Math.pow(v, 0.55)) ** 0.5);
          const a = a0 - (u - 0.5) * 2 * half;
          const r = budR(y) + 0.004 * (1 - Math.abs(2 * u - 1));
          return [Math.cos(a) * r, y + L, Math.sin(a) * r];
        },
        (_u, v) => ({ f: fB, occ: 0.6 + 0.4 * v }),
        0.006,
      ),
    );
  }

  // The gold tip: a slim spike with a ring and a knob.
  if (look !== 'stone') {
    const f = pal.tip ?? fB;
    const p: [number, number][] = [
      [0, TIP_TOP],
      [0.004, 3.965],
      [0.007, 3.9],
      [0.016, 3.885],
      [0.02, 3.868],
      [0.016, 3.852],
      [0.009, 3.842],
      [0.011, 3.8],
      [0.02, 3.778],
      [0, 3.762],
    ];
    out.push(
      revolve(
        p.map(([r, y]) => ({ r, y: y + L, f })),
        near ? 14 : plain ? 6 : 8,
      ),
    );
  }
  return out;
}
