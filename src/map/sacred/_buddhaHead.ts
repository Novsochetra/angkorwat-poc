import type { Sculpt } from './sculpt';
import { boxDist, cone, mirrorX, smax, smin, union, type Box, type Shape, type V3 } from './sdf';
import { F, FIG, type HeadStyle } from './_buddhaFrame';

/**
 * The Buddha's head (figure space, _buddhaFrame.ts): the neck with its three
 * folds, the face, the long ears, the curls, the ushnisha and — on a pagoda
 * Buddha — the flame (rasmi) rising from it.
 *
 * Two faces, after the Buddhas Cambodians pray to:
 *
 * - `pagoda`: the gilded Buddha of today's pagodas (Wat Ounalom, Wat Preah
 *   Prom Rath): an oval face, brows in long arches that meet over a straight
 *   nose, heavy lids half closed looking down, a small smiling mouth, tight
 *   snail-shell curls, a round ushnisha and a tall slim flame.
 * - `angkor`: the naga Buddha of the Bayon's time: a broader, squarer face,
 *   eyes closed, one raised ridge for the brows, the wide gentle Bayon smile,
 *   a diadem over the brow, pointed ear jewels, and a cone of curls ending in
 *   a lotus bud.
 *
 * The head is one shape to the statue's sculpt (so a point far from the
 * face skips all its parts), with its colours painted on: hair, flame,
 * jewels, the eyes' slits, the brows, the lips. Its parts are small clays
 * (`Clay`) in groups: the face's features and the ears are made on his left
 * side and mirrored. The shapes measured at every point (the head's mass,
 * the ears, the curls, the brows) are written out as single functions: the
 * statue's mesh asks the head's distance about 800 000 times.
 */

const DEG = Math.PI / 180;

/** Heights (m) of the face's lines: chin at 3 F, hairline at 4 F. */
const Y = {
  chin: FIG.chin[1],
  mouth: FIG.chin[1] + 0.205 * F,
  nose: FIG.chin[1] + 0.33 * F,
  eye: FIG.chin[1] + 0.57 * F,
  brow: FIG.chin[1] + 0.68 * F,
  hair: FIG.hairline,
};

/** What differs between the two faces. */
interface Face {
  /** The face's slices from the chin up: [y, half-width, front z, flatness (2 round ‥ 4 flat), depth behind z = 0]. */
  loft: [number, number, number, number, number][];
  /** The chin's half-width. */
  chin: number;
  /** Mouth half-width and how far (m) its corners rise. */
  mouth: number;
  smile: number;
  /** Eye half-length (m) and slant (rad, the outer corner up). */
  eye: number;
  slant: number;
  /** How far (m) the eye's slit is open: 0 closed. */
  open: number;
}

const FACES: Record<HeadStyle, Face> = {
  pagoda: {
    loft: [
      [0.408, 0.016, 0.062, 2, 0.008],
      [0.414, 0.027, 0.073, 2, 0.01],
      [0.422, 0.036, 0.078, 2.1, 0.012],
      [0.432, 0.044, 0.081, 2.2, 0.014],
      [0.444, 0.051, 0.082, 2.3, 0.016],
      [0.458, 0.057, 0.082, 2.45, 0.02],
      [0.474, 0.062, 0.082, 2.55, 0.03],
      [0.49, 0.066, 0.082, 2.6, 0.045],
      [0.508, 0.068, 0.083, 2.6, 0.06],
      [0.528, 0.067, 0.083, 2.4, 0.066],
      [0.548, 0.064, 0.078, 2.2, 0.068],
      [0.568, 0.057, 0.067, 2.1, 0.066],
      [0.586, 0.045, 0.05, 2, 0.05],
    ],
    chin: 0.02,
    mouth: 0.0165,
    smile: 0.0018,
    eye: 0.0174,
    slant: 7 * DEG,
    open: 0.0006,
  },
  angkor: {
    loft: [
      [0.408, 0.016, 0.062, 2, 0.008],
      [0.414, 0.028, 0.072, 2.1, 0.01],
      [0.422, 0.038, 0.077, 2.3, 0.012],
      [0.432, 0.047, 0.08, 2.5, 0.014],
      [0.444, 0.055, 0.081, 2.6, 0.016],
      [0.458, 0.061, 0.081, 2.7, 0.02],
      [0.474, 0.066, 0.081, 2.8, 0.03],
      [0.49, 0.069, 0.081, 2.8, 0.045],
      [0.508, 0.071, 0.082, 2.7, 0.06],
      [0.528, 0.07, 0.082, 2.5, 0.066],
      [0.548, 0.067, 0.078, 2.3, 0.068],
      [0.568, 0.06, 0.067, 2.1, 0.066],
      [0.586, 0.047, 0.05, 2, 0.05],
    ],
    chin: 0.025,
    mouth: 0.022,
    smile: 0.0028,
    eye: 0.0172,
    slant: 3 * DEG,
    open: 0,
  },
};

/** The skull (under the curls): centre and radii. */
const SKULL: { c: V3; r: V3 } = { c: [0, 0.512, -0.014], r: [0.072, 0.086, 0.082] };

/** The pagoda Buddha's ushnisha, a round mound on the crown: centre and radii (Angkor: its cone's axis at z = c[2]). */
const USH: { c: V3; r: V3 } = { c: [0, FIG.crown - 0.006, -0.016], r: [0.041, 0.035, 0.041] };

export function addHead(s: Sculpt, style: HeadStyle): void {
  const f = FACES[style];
  const top = style === 'pagoda' ? FIG.crown + 0.2 : FIG.crown + 0.11;
  // The fine zone: from across the plain neck up over the ushnisha (and flame).
  s.fine([-0.115, FIG.neck[1] + 0.01, -0.115, 0.115, top, 0.125]);

  // ── Neck and the head's masses (and the ushnisha: the surface the curls sit on) ──
  const face = headMass(f, style, false);
  const base = headMass(f, style, true);
  const c = new Clay();
  c.add(base, 0);
  c.group(neckFolds());

  // ── The face: nose, eyes and brows, mouth (made on his left side, mirrored) ──
  const paints: [Shape, string][] = [];
  const nose = noseShape(face, style);
  const front = union([face, nose], 0.005);
  const features = new Clay();
  features.add(nose, 0.005);
  features.group(eyes(front, f, style, paints));
  features.group(mouth(front, f, style, paints));
  c.group(features, true);

  // ── Ears ──
  c.group(ears(style, paints), true);

  // ── Curls, and the flame or the diadem ──
  const crown = new Clay();
  if (style === 'pagoda') pagodaCrown(crown, base, paints);
  else angkorCrown(crown, base, paints);
  c.group(crown);

  s.add(c.shape(), 'skin', 0.01);
  for (const [sh, region] of paints) s.paint(sh, region);
}

// ── The head's masses ───────────────────────────────────────────────────

/**
 * Neck, skull, face and chin as one smooth mass (and with `crown`, the
 * ushnisha: the surface the curls sit on). Written out as one function: it
 * is measured at every point the statue's mesh asks about.
 */
function headMass(f: Face, style: HeadStyle, crown: boolean): Shape {
  const neck = neckShape([0, FIG.neck[1] - 0.015, -0.026], [0, 0.44, -0.008], 0.05, 0.046);
  const face = loft(f.loft, -0.004);
  const [sx, sy, sz] = SKULL.c;
  const [srx, sry, srz] = SKULL.r;
  const chinC: V3 = [0, Y.chin + 0.006, 0.064];
  const chinR: V3 = [f.chin, 0.012, 0.015];
  const ush = style === 'pagoda' ? upright(USH.c, USH.r) : cone([0, FIG.crown - 0.016, USH.c[2]], [0, FIG.crown + 0.046, USH.c[2]], 0.041, 0.013);
  const ushK = style === 'pagoda' ? 0.016 : 0.01;
  const ushLow = ush.box[1] - ushK;
  const faceBox = face.box;
  const chinBox: Box = [chinC[0] - chinR[0], chinC[1] - chinR[1], chinC[2] - chinR[2], chinC[0] + chinR[0], chinC[1] + chinR[1], chinC[2] + chinR[2]];
  const box = joinBoxes([neck.box, [sx - srx, sy - sry, sz - srz, sx + srx, sy + sry, sz + srz], faceBox, ...(crown ? [ush.box] : [])]);
  return {
    d(x, y, z) {
      // (neck and skull, then the face, the chin, the ushnisha; each only where it can reach)
      let d = ellD(x - sx, y - sy, z - sz, srx, sry, srz);
      if (boxDist(neck.box, x, y, z) < d + 0.03) d = smin(neck.d(x, y, z), d, 0.03);
      if (boxDist(faceBox, x, y, z) < d + 0.014) d = smin(d, face.d(x, y, z), 0.014);
      if (boxDist(chinBox, x, y, z) < d + 0.01) d = smin(d, ellD(x - chinC[0], y - chinC[1], z - chinC[2], chinR[0], chinR[1], chinR[2]), 0.01);
      if (crown && y > ushLow - d) d = smin(d, ush.d(x, y, z), ushK);
      return d;
    },
    box,
  };
}

/**
 * The neck: a round column leaning a little forward from `a` to `b`,
 * radius `ra` to `rb`, its ends rounded.
 * Cheaper than a rounded cone: it is measured at most points.
 */
function neckShape(a: V3, b: V3, ra: number, rb: number): Shape {
  const [ax, ay, az] = a;
  const h = b[1] - ay;
  const sz = (b[2] - az) / h;
  const sr = (rb - ra) / h;
  // (a level offset from the leaning axis shrinks by its cosine across it)
  const c = 1 / Math.sqrt(1 + sz * sz);
  return {
    d(x, y, z) {
      const t = y - ay;
      const dx = x - ax;
      if (t < 0) {
        // (the foot: round, as a ball of the column's radius)
        const dz = z - az;
        return Math.sqrt(dx * dx + dz * dz + t * t) - ra;
      }
      if (t > h) {
        // (the top, inside the head: round too)
        const dz = z - b[2];
        const dy = t - h;
        return Math.sqrt(dx * dx + dz * dz + dy * dy) - rb;
      }
      const dz = (z - az - sz * t) * c;
      return Math.sqrt(dx * dx + dz * dz) - (ra + sr * t);
    },
    box: [ax - ra, ay - ra, Math.min(az, b[2]) - ra, ax + ra, b[1] + rb, Math.max(az, b[2]) + ra],
  };
}

/** An ellipsoid not turned (its axes along x, y, z). */
function upright(c: V3, r: V3): Shape {
  const [cx, cy, cz] = c;
  const [rx, ry, rz] = r;
  return { d: (x, y, z) => ellD(x - cx, y - cy, z - cz, rx, ry, rz), box: [cx - rx, cy - ry, cz - rz, cx + rx, cy + ry, cz + rz] };
}

/** An upright ellipsoid's distance (a close bound near its surface) at a point relative to its centre. */
function ellD(px: number, py: number, pz: number, rx: number, ry: number, rz: number): number {
  const ax = px / rx;
  const ay = py / ry;
  const az = pz / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const k1 = Math.sqrt((ax * ax) / (rx * rx) + (ay * ay) / (ry * ry) + (az * az) / (rz * rz));
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}

// ── Clay: a small sculpt of its own ─────────────────────────────────────

type Step = { kind: 'add' | 'carve'; s: Shape; k: number } | { kind: 'group'; steps: Step[]; box: Box; k: number; mirror: boolean };

/**
 * Clay put on and cut away in order, like the statue's sculpt, but grouped:
 * a point skips a whole group (an eye, an ear) when it is far from it. Its
 * `shape()` goes into the sculpt as one shape.
 */
class Clay {
  readonly steps: Step[] = [];
  /** Clay on, blended over `k` m. */
  add(s: Shape, k = 0): this {
    this.steps.push({ kind: 'add', s, k });
    return this;
  }
  /** Clay off, the edge rounded over `k` m. */
  carve(s: Shape, k = 0): this {
    this.steps.push({ kind: 'carve', s, k });
    return this;
  }
  /**
   * Another clay's steps as one group here (they carve what is here too).
   * `mirror`: the group was made on the +x side (his left) and serves both
   * sides (eyes, ears).
   */
  group(g: Clay, mirror = false): this {
    if (!g.steps.length) return this;
    const boxes = g.steps.map((st) => (st.kind === 'group' ? st.box : st.s.box));
    const k = Math.max(...g.steps.map((st) => st.k));
    this.steps.push({ kind: 'group', steps: g.steps, box: joinBoxes(boxes), k, mirror });
    return this;
  }
  /** All of it as one shape. */
  shape(): Shape {
    const steps = this.steps;
    const adds: Box[] = [];
    const collect = (l: Step[], m: boolean) =>
      l.forEach((st) => {
        if (st.kind === 'group') collect(st.steps, m || st.mirror);
        else if (st.kind === 'add') {
          const b = st.s.box;
          adds.push(b);
          if (m) adds.push(flipX(b));
        }
      });
    collect(steps, false);
    return { d: (x, y, z) => run(steps, Infinity, x, y, z), box: joinBoxes(adds) };
  }
}

/** A box mirrored across x = 0. */
const flipX = (b: Box): Box => [-b[3], b[1], b[2], -b[0], b[4], b[5]];

/** A clay's steps at a point: from the distance so far to the new one. */
function run(steps: Step[], d: number, x: number, y: number, z: number): number {
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    // (each step skips itself when its box is at least t away: no clay there could change d)
    if (st.kind === 'add') {
      const t = d + st.k;
      if (t <= 0 || far(st.s.box, x, y, z, t)) continue;
      d = smin(d, st.s.d(x, y, z), st.k);
    } else if (st.kind === 'carve') {
      const t = st.k - d;
      if (t <= 0 || far(st.s.box, x, y, z, t)) continue;
      d = smax(d, -st.s.d(x, y, z), st.k);
    } else if (st.kind === 'group') {
      const gx = st.mirror && x < 0 ? -x : x;
      if (far(st.box, gx, y, z, Math.abs(d) + st.k)) continue;
      d = run(st.steps, d, gx, y, z);
    }
  }
  return d;
}

/** Is the point at least `t` (> 0) from the box? */
function far(b: Box, x: number, y: number, z: number, t: number): boolean {
  const dx = b[0] - x > 0 ? b[0] - x : x - b[3] > 0 ? x - b[3] : 0;
  const dy = b[1] - y > 0 ? b[1] - y : y - b[4] > 0 ? y - b[4] : 0;
  const dz = b[2] - z > 0 ? b[2] - z : z - b[5] > 0 ? z - b[5] : 0;
  return dx * dx + dy * dy + dz * dz >= t * t;
}

/** The box round all the boxes. */
function joinBoxes(boxes: Box[]): Box {
  const o = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const b of boxes)
    for (let i = 0; i < 3; i++) {
      o[i] = Math.min(o[i], b[i]);
      o[i + 3] = Math.max(o[i + 3], b[i + 3]);
    }
  return o as unknown as Box;
}

// ── Fast shapes (no Math.hypot, no allocations: they run a million times) ─

type M3 = readonly [number, number, number, number, number, number, number, number, number];

/** A turn: yaw about y, then pitch about x, then roll about z (as sdf.ts `rot`). */
function turn(yaw = 0, pitch = 0, roll = 0): M3 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  return [cy * cr + sy * sp * sr, -cy * sr + sy * sp * cr, sy * cp, cp * sr, cp * cr, -sp, -sy * cr + cy * sp * sr, sy * sr + cy * sp * cr, cy * cp];
}

/** A ball. */
function ball(c: V3, r: number): Shape {
  const [cx, cy, cz] = c;
  return {
    d(x, y, z) {
      const dx = x - cx;
      const dy = y - cy;
      const dz = z - cz;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
    },
    box: [cx - r, cy - r, cz - r, cx + r, cy + r, cz + r],
  };
}

/** An ellipsoid, turned by `R` (a close bound near its surface). */
function ell(c: V3, r: V3, R?: M3): Shape {
  const [cx, cy, cz] = c;
  const ix = 1 / r[0];
  const iy = 1 / r[1];
  const iz = 1 / r[2];
  const mn = Math.min(r[0], r[1], r[2]);
  const T = R ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
  // (its box: along each axis, the reach of the turned radii)
  const ext = [0, 1, 2].map((a) => Math.hypot(T[3 * a] * r[0], T[3 * a + 1] * r[1], T[3 * a + 2] * r[2]));
  return {
    d(x, y, z) {
      const qx = x - cx;
      const qy = y - cy;
      const qz = z - cz;
      const px = (T[0] * qx + T[3] * qy + T[6] * qz) * ix;
      const py = (T[1] * qx + T[4] * qy + T[7] * qz) * iy;
      const pz = (T[2] * qx + T[5] * qy + T[8] * qz) * iz;
      const k0 = Math.sqrt(px * px + py * py + pz * pz);
      const k1 = Math.sqrt(px * px * ix * ix + py * py * iy * iy + pz * pz * iz * iz);
      return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -mn;
    },
    box: [cx - ext[0], cy - ext[1], cz - ext[2], cx + ext[0], cy + ext[1], cz + ext[2]],
  };
}

/** A ring: radius `ring` round the axis through `c` (turned by `R` from +y), tube radius `r`. */
function ring(c: V3, ringR: number, r: number, R?: M3): Shape {
  const [cx, cy, cz] = c;
  const T = R ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
  // (the ring's reach along each axis: its radius times how far that axis leans from the ring's own)
  const ext = [T[1], T[4], T[7]].map((a) => ringR * Math.sqrt(Math.max(0, 1 - a * a)) + r);
  return {
    d(x, y, z) {
      const qx = x - cx;
      const qy = y - cy;
      const qz = z - cz;
      const px = T[0] * qx + T[3] * qy + T[6] * qz;
      const py = T[1] * qx + T[4] * qy + T[7] * qz;
      const pz = T[2] * qx + T[5] * qy + T[8] * qz;
      const q = Math.sqrt(px * px + pz * pz) - ringR;
      return Math.sqrt(q * q + py * py) - r;
    },
    box: [cx - ext[0], cy - ext[1], cz - ext[2], cx + ext[0], cy + ext[1], cz + ext[2]],
  };
}

/** `s` built round the origin, turned by `R` and moved to `at`. */
function placed(s: Shape, at: V3, R: M3): Shape {
  const [tx, ty, tz] = at;
  const b = s.box;
  const o = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const x of [b[0], b[3]])
    for (const y of [b[1], b[4]])
      for (const z of [b[2], b[5]]) {
        const p = [R[0] * x + R[1] * y + R[2] * z + tx, R[3] * x + R[4] * y + R[5] * z + ty, R[6] * x + R[7] * y + R[8] * z + tz];
        for (let i = 0; i < 3; i++) {
          o[i] = Math.min(o[i], p[i]);
          o[i + 3] = Math.max(o[i + 3], p[i]);
        }
      }
  return {
    d(x, y, z) {
      const qx = x - tx;
      const qy = y - ty;
      const qz = z - tz;
      return s.d(R[0] * qx + R[3] * qy + R[6] * qz, R[1] * qx + R[4] * qy + R[7] * qz, R[2] * qx + R[5] * qy + R[8] * qz);
    },
    box: o as unknown as Box,
  };
}

/** A chain of capsules through `pts` (radius `r`, or one per point). */
function chain(pts: V3[], r: number | number[], k = 0): Shape {
  const rr = (i: number) => (typeof r === 'number' ? r : r[i]);
  const links = pts.slice(1).map((p, i) => cone(pts[i], p, rr(i), rr(i + 1)));
  if (links.length <= 5) return union(links, k);
  // (in runs of four, so a point skips the far runs by their boxes)
  const runs: Shape[] = [];
  for (let i = 0; i < links.length; i += 4) runs.push(union(links.slice(i, i + 4), k));
  return union(runs, k);
}

/**
 * A tube round a curve that runs along +x (a brow): through `pts` (x rising),
 * radius `r` at each. Cheaper than a chain of capsules: the point finds its
 * place on the curve by its x, then measures across the curve there.
 */
function tubeX(pts: V3[], r: number[]): Shape {
  const n = 64;
  const x0 = pts[0][0];
  const x1 = pts[pts.length - 1][0];
  const Y = new Float64Array(n + 1);
  const Z = new Float64Array(n + 1);
  const Rr = new Float64Array(n + 1);
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    while (j < pts.length - 2 && pts[j + 1][0] < x) j++;
    const t = (x - pts[j][0]) / (pts[j + 1][0] - pts[j][0]);
    Y[i] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t;
    Z[i] = pts[j][2] + (pts[j + 1][2] - pts[j][2]) * t;
    Rr[i] = r[j] + (r[j + 1] - r[j]) * t;
  }
  const h = (x1 - x0) / n;
  const rMax = Math.max(...r);
  const lo = [Infinity, Infinity];
  const hi = [-Infinity, -Infinity];
  for (let i = 0; i <= n; i++) {
    lo[0] = Math.min(lo[0], Y[i]);
    hi[0] = Math.max(hi[0], Y[i]);
    lo[1] = Math.min(lo[1], Z[i]);
    hi[1] = Math.max(hi[1], Z[i]);
  }
  return {
    d(x, y, z) {
      const u = x < x0 ? x0 : x > x1 ? x1 : x;
      const f = (u - x0) / h;
      const i = f >= n ? n - 1 : Math.floor(f);
      const t = f - i;
      const cy = Y[i] + (Y[i + 1] - Y[i]) * t;
      const cz = Z[i] + (Z[i + 1] - Z[i]) * t;
      const rr = Rr[i] + (Rr[i + 1] - Rr[i]) * t;
      // (across the curve: the offset less its part along the curve's direction here)
      const sy = (Y[i + 1] - Y[i]) / h;
      const sz = (Z[i + 1] - Z[i]) / h;
      const dx = x - u;
      const dy = y - cy;
      const dz = z - cz;
      // (past an end: a round cap)
      if (dx !== 0) return Math.sqrt(dx * dx + dy * dy + dz * dz) - rr;
      const along = (dy * sy + dz * sz) / Math.sqrt(1 + sy * sy + sz * sz);
      const across = dy * dy + dz * dz - along * along;
      return Math.sqrt(across > 0 ? across : 0) - rr;
    },
    box: [x0 - rMax, lo[0] - rMax, lo[1] - rMax, x1 + rMax, hi[0] + rMax, hi[1] + rMax],
  };
}

/**
 * The face's mass: horizontal slices (`keys`: y, half-width, front z,
 * flatness, depth behind `cz`) joined smoothly, each slice an oval —
 * flatter in front for a higher flatness.
 */
function loft(keys: [number, number, number, number, number][], cz: number): Shape {
  const y0 = keys[0][0];
  const y1 = keys[keys.length - 1][0];
  const step = 0.0005;
  const n = Math.ceil((y1 - y0) / step) + 1;
  const A = new Float64Array(n);
  const Z = new Float64Array(n);
  const N = new Float64Array(n);
  const B = new Float64Array(n);
  // (Catmull–Rom through the keys, sampled every half millimetre)
  for (let i = 0; i < n; i++) {
    const y = Math.min(y1, y0 + i * step);
    let j = 0;
    while (j < keys.length - 2 && keys[j + 1][0] < y) j++;
    const t = (y - keys[j][0]) / (keys[j + 1][0] - keys[j][0]);
    const at = (c: number) => {
      const p0 = keys[Math.max(0, j - 1)][c];
      const p1 = keys[j][c];
      const p2 = keys[j + 1][c];
      const p3 = keys[Math.min(keys.length - 1, j + 2)][c];
      return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
    };
    A[i] = at(1);
    Z[i] = at(2) - cz;
    N[i] = at(3);
    B[i] = at(4);
  }
  const wMax = Math.max(...A);
  const zMax = Math.max(...Z);
  const back = Math.max(...B);
  // (the inverses and the flatness's weight per row: the distance is measured a million times)
  const IA = A.map((v) => 1 / v);
  const IZ = Z.map((v) => 1 / v);
  const IB = B.map((v) => 1 / v);
  const W = N.map((v) => Math.max(0, Math.min(1, (v - 2) / 2)));
  const ny = n - 1;
  const iStep = 1 / step;
  return {
    d(x, y, z) {
      const zz = z - cz;
      let f = (y - y0) * iStep;
      f = f < 0 ? 0 : f > ny ? ny : f;
      const i = f >= ny ? ny - 1 : Math.floor(f);
      const t = f - i;
      // The slice at this height: an ellipse (half-width a, front zr or back), flattened in front towards |x|⁴ + |z|⁴ = 1.
      const ia = IA[i] + (IA[i + 1] - IA[i]) * t;
      const front = zz > 0;
      const iz = front ? IZ[i] + (IZ[i + 1] - IZ[i]) * t : IB[i] + (IB[i + 1] - IB[i]) * t;
      const ux = (x < 0 ? -x : x) * ia;
      const uz = (front ? zz : -zz) * iz;
      const x2 = ux * ux;
      const z2 = uz * uz;
      const k0 = Math.sqrt(x2 + z2);
      const k1 = Math.sqrt(x2 * ia * ia + z2 * iz * iz);
      let d = k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -1 / Math.max(ia, iz);
      const w = front ? W[i] + (W[i + 1] - W[i]) * t : 0;
      if (w > 0) {
        const q = Math.sqrt(Math.sqrt(x2 * x2 + z2 * z2));
        if (q > 1e-6) {
          // (first-order distance to the flat oval: the level's step over its slope)
          const gx = x2 * ux * ia;
          const gz = z2 * uz * iz;
          d += (((q - 1) * q * q * q) / Math.sqrt(gx * gx + gz * gz) - d) * w;
        }
      }
      // (the ends close the mass)
      if (y < y0) return Math.sqrt((d > 0 ? d * d : 0) + (y0 - y) * (y0 - y));
      if (y > y1) return Math.sqrt((d > 0 ? d * d : 0) + (y - y1) * (y - y1));
      return d;
    },
    box: [-wMax, y0, cz - back, wMax, y1, cz + zMax],
  };
}

/** Where the surface of `sh` is in front at (x, y): its z (m), found by stepping in from the front. */
function frontZ(sh: Shape, x: number, y: number): number {
  let z = 0.16;
  for (let i = 0; i < 100; i++) {
    const d = sh.d(x, y, z);
    if (d < 2e-5) break;
    z -= Math.max(d * 0.9, 2e-5);
  }
  return z;
}

/** The surface of `sh` along the ray from `o` towards `dir` (unit), found by bisection. */
function castOut(sh: Shape, o: V3, dir: V3, reach = 0.2): V3 {
  let a = 0;
  let b = reach;
  for (let i = 0; i < 24; i++) {
    const m = (a + b) / 2;
    if (sh.d(o[0] + dir[0] * m, o[1] + dir[1] * m, o[2] + dir[2] * m) < 0) a = m;
    else b = m;
  }
  const t = (a + b) / 2;
  return [o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t];
}

/** The outward normal of `sh` at a point. */
function normalAt(sh: Shape, p: V3): V3 {
  const e = 0.0005;
  const gx = sh.d(p[0] + e, p[1], p[2]) - sh.d(p[0] - e, p[1], p[2]);
  const gy = sh.d(p[0], p[1] + e, p[2]) - sh.d(p[0], p[1] - e, p[2]);
  const gz = sh.d(p[0], p[1], p[2] + e) - sh.d(p[0], p[1], p[2] - e);
  const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
  return [gx / l, gy / l, gz / l];
}

// ── Neck ────────────────────────────────────────────────────────────────

/** Three soft folds round the neck (trivali), dipping in front: grooves, the nearest one measured. */
function neckFolds(): Clay {
  const T = turn(0, 19 * DEG, 0);
  const n = 3;
  const [c0x, c0y, c0z] = [0, 0.401, -0.016];
  // (each fold 9.8 mm above the last and 2 mm further forward, its ring a little smaller)
  const step: V3 = [0, 0.0098, 0.002];
  // (the folds' centres and the step between them, in the turned frame: along its axis, and across)
  const loc = (v: V3): V3 => [T[0] * v[0] + T[3] * v[1] + T[6] * v[2], T[1] * v[0] + T[4] * v[1] + T[7] * v[2], T[2] * v[0] + T[5] * v[1] + T[8] * v[2]];
  const s = loc(step);
  const R0 = 0.0494;
  const dR = -0.0006;
  const tube = 0.0019;
  const rings = Array.from({ length: n }, (_v, i) => ring([c0x + step[0] * i, c0y + step[1] * i, c0z + step[2] * i], R0 + dR * i, tube, T));
  const folds: Shape = {
    d(x, y, z) {
      const qx = x - c0x;
      const qy = y - c0y;
      const qz = z - c0z;
      const px = T[0] * qx + T[3] * qy + T[6] * qz;
      const py = T[1] * qx + T[4] * qy + T[7] * qz;
      const pz = T[2] * qx + T[5] * qy + T[8] * qz;
      let i = Math.round(py / s[1]);
      i = i < 0 ? 0 : i > n - 1 ? n - 1 : i;
      const ax = px - s[0] * i;
      const ay = py - s[1] * i;
      const az = pz - s[2] * i;
      const q = Math.sqrt(ax * ax + az * az) - (R0 + dR * i);
      return Math.sqrt(q * q + ay * ay) - tube;
    },
    box: joinBoxes(rings.map((r) => r.box)),
  };
  return new Clay().carve(folds, 0.0035);
}

// ── Nose ────────────────────────────────────────────────────────────────

/** A straight nose: the bridge down from the brows, the tip, small wings. */
function noseShape(mass: Shape, style: HeadStyle): Shape {
  const long = style === 'pagoda' ? 0.0185 : 0.0165;
  const rootY = Y.brow - 0.009;
  const root: V3 = [0, rootY, frontZ(mass, 0, rootY) - 0.003];
  const tipY = Y.nose + 0.0055;
  const tip: V3 = [0, tipY, frontZ(mass, 0, tipY) + long - 0.006];
  const wide = style === 'angkor';
  return union(
    [
      cone(root, tip, wide ? 0.0062 : 0.0055, wide ? 0.0064 : 0.0056),
      ell([0, tipY - 0.0012, tip[2] - 0.0016], [wide ? 0.0066 : 0.0058, 0.006, 0.0056]),
      // (the wings: low, flat and set back, blended in)
      mirrorX(ell([wide ? 0.0112 : 0.0094, Y.nose + 0.0026, tip[2] - 0.0108], [0.0062, 0.0046, 0.0066], turn(0.4, 0, 0))),
    ],
    0.0075,
  );
}

// ── Eyes, brows ─────────────────────────────────────────────────────────

/**
 * His left eye (a mirrored group): a broad shallow socket, the heavy upper
 * lid half closed and looking down, the dark crescent under its edge (on the
 * Angkor Buddha closed: only a fine line), the lower lid, and the brow's
 * long arch.
 */
function eyes(face: Shape, f: Face, style: HeadStyle, paints: [Shape, string][]): Clay {
  const g = new Clay();
  const ex = 0.0285;
  const zf = frontZ(face, ex, Y.eye);
  const R = turn(22 * DEG, 0, f.slant);
  const at = (dx: number, dy: number, dz: number): V3 => [ex + dx, Y.eye + dy, zf + dz];
  g.carve(ell(at(0, 0.0005, 0.0128), [0.025, 0.015, 0.0145], R), 0.012);
  // The upper lid: one long heavy almond, from under the brow down past the eye's line.
  g.add(ell(at(0, 0.0018, -0.0078), [f.eye, 0.0104, 0.009], R), 0.006);
  // A soft groove under its edge: the eye, looking down (painted dark), or on the Angkor Buddha closed.
  const open = f.open;
  g.carve(ell(at(0, -0.0071, 0.0006 + open), [f.eye * 0.9, 0.0026 + open, 0.004], R), 0.004);
  paints.push([mirrorX(ell(at(0, -0.0071, -0.004), [f.eye * 0.84, 0.002 + open * 1.5, 0.014], R)), 'eye']);

  // Brows: long high arches from the nose's root out over the eyes (Angkor: one raised ridge across).
  const pts: V3[] = [];
  const n = 14;
  const x0 = style === 'angkor' ? -0.006 : 0.0055;
  const x1 = 0.057;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + t * (x1 - x0);
    const u = (x - 0.0055) / (x1 - 0.0055);
    const y = Y.brow - 0.0058 + 0.001 * u + (u > 0 ? 0.0122 * Math.sin(Math.PI * Math.pow(u, 0.85)) : 0.003 * u);
    pts.push([x, y, frontZ(face, x, y) - 0.0011]);
  }
  const r = pts.map((_p, i) => (style === 'angkor' ? 0.0034 : 0.003) * (1 - 0.45 * (i / n) ** 2));
  g.add(tubeX(pts.map((p) => [p[0], p[1], p[2] - 0.0014] as V3), r), 0.004);
  // (the pagoda Buddha's brows painted: a fine line along the ridge, thinning to its ends; the paint's soft edge keeps it smooth)
  if (style === 'pagoda') paints.push([mirrorX(tubeX(pts.slice(0, -1), r.slice(0, -1).map((v) => v * 0.45 + 0.0006))), 'brow']);
  return g;
}

// ── Mouth ───────────────────────────────────────────────────────────────

/**
 * The mouth's left half (a mirrored group): full lips as one soft mound, the
 * line between them rising to the corners in a gentle smile, the bow's dip
 * over the middle; the dip under the lower lip over the chin.
 */
function mouth(face: Shape, f: Face, style: HeadStyle, paints: [Shape, string][]): Clay {
  const g = new Clay();
  const w = f.mouth;
  const full = style === 'angkor' ? 1.18 : 1;
  const zAt = (x: number, y: number) => frontZ(face, x, y);
  const zm = zAt(0, Y.mouth);
  // Both lips as one soft mound, split by the line between them.
  const mound = ell([0, Y.mouth - 0.0006 * full, zm - 0.0024], [w, 0.0076 * full, 0.0052], turn(0, -4 * DEG, 0));
  g.add(mound, 0.004);
  // The line between the lips, rising to the corner; the corner pressed in; the bow's dip over the middle.
  const line: V3[] = [];
  for (let i = -1; i <= 5; i++) {
    const x = (i / 5) * (w + 0.0008);
    const u = Math.min(1, Math.abs(x) / w);
    line.push([x, Y.mouth + f.smile * u * u + 0.0003, zm + 0.0026 - 0.0042 * u * u]);
  }
  g.carve(chain(line, 0.0017), 0.0026);
  g.carve(ball([w + 0.0012, Y.mouth + f.smile + 0.0002, zAt(w, Y.mouth) - 0.0012], style === 'angkor' ? 0.0028 : 0.0024), 0.004);
  g.carve(ell([0, Y.mouth + 0.0082 * full, zm + 0.0012], [0.0034, 0.0026, 0.0032]), 0.003);
  // The dip under the lower lip, above the chin.
  g.carve(ell([0, Y.mouth - 0.0112 * full, zm + 0.0036], [w * 0.68, 0.0026, 0.004]), 0.004);
  paints.push([mirrorX(ell([0, Y.mouth - 0.0004 * full, zm + 0.0008], [w * 0.9, 0.0064 * full, 0.0058], turn(0, -4 * DEG, 0))), 'lip']);
  return g;
}

/** `s` grown by `by` m (its box too). */
function grow2(s: Shape, by: number): Shape {
  const b = s.box;
  return { d: (x, y, z) => s.d(x, y, z) - by, box: [b[0] - by, b[1] - by, b[2] - by, b[3] + by, b[4] + by, b[5] + by] };
}

// ── Ears ────────────────────────────────────────────────────────────────

/** Where his left ear is (its middle), and how it turns: the upper ear, and the lobe (turned more to the front). */
const EAR = { at: [0.07, 0.474, -0.006] as V3, upper: turn(-30 * DEG, 0, -4 * DEG), lobe: turn(-44 * DEG, 0, -5 * DEG) };

/** The long ears: the rim, the hollow, the lobe stretched long with its slit (Angkor: a pointed jewel in it); his left ear (a mirrored group). */
function ears(style: HeadStyle, paints: [Shape, string][]): Clay {
  const g = new Clay();
  g.add(earShape(), 0.004);
  if (style === 'angkor') {
    // A pointed jewel hanging in the stretched lobe.
    const [ax, ay, az] = EAR.at;
    const at: V3 = [ax + 0.0012, ay, az + 0.0015];
    const bead = placed(ell([0.001, -0.046, 0.001], [0.0062, 0.005, 0.0062]), at, EAR.lobe);
    const drop = placed(cone([0.0012, -0.049, 0.001], [0.0025, -0.07, 0.002], 0.0058, 0.0006), at, EAR.lobe);
    g.add(union([bead, drop], 0.002), 0.0015);
    paints.push([mirrorX(grow2(drop, 0.0008)), 'flame']);
    paints.push([mirrorX(grow2(bead, 0.0008)), 'jewel']);
  }
  return g;
}

/**
 * His left ear as one shape (it is measured often): made facing +x at the
 * origin (z forward, y up, x out from the head), then turned into place.
 * The upper ear: a plate, its rim an arc of an ellipse, the hollow inside;
 * the lobe: a long flat strap with a groove down it where it was pierced.
 */
function earShape(): Shape {
  const [ax, ay, az] = EAR.at;
  const U = EAR.upper;
  const L = EAR.lobe;
  const lx = ax + 0.0012;
  const lz = az + 0.0015;
  const plate = ell([0, 0.021, -0.001], [0.005, 0.027, 0.0152]);
  const hollow = ell([0.0062, 0.017, 0.0008], [0.0046, 0.0145, 0.0085]);
  const strap = cone([0, 0.004, 0], [0.001, -0.046, 0.001], 0.0105, 0.0092);
  const groove = cone([0.0062, -0.012, 0.0004], [0.0066, -0.037, 0.0008], 0.0032, 0.0028);
  // The rim: a tube round the ellipse (y − 0.0205)/0.026 = sin a, (z + 0.0012)/0.0142 = cos a, from a0 to a1.
  const a0 = -0.26 * Math.PI;
  const a1 = 1.14 * Math.PI;
  const rim = (x: number, y: number, z: number) => {
    let a = Math.atan2((y - 0.0205) / 0.026, (z + 0.0012) / 0.0142);
    if (a < a0) a += 2 * Math.PI;
    if (a > a1) a = a - a1 < a0 + 2 * Math.PI - a ? a1 : a0;
    const dx = x - 0.0024;
    const dy = y - 0.0205 - 0.026 * Math.sin(a);
    const dz = z + 0.0012 - 0.0142 * Math.cos(a);
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - 0.0034;
  };
  const upperBox = placed({ d: () => 0, box: [-0.0055, -0.0095, -0.019, 0.0065, 0.0505, 0.0165] }, [ax, ay, az], U).box;
  const lobeBox = placed({ d: () => 0, box: [-0.0055, -0.056, -0.0105, 0.0085, 0.0145, 0.0115] }, [lx, ay, lz], L).box;
  return {
    d(x, y, z) {
      // (the upper ear, in its own frame)
      let px = x - ax;
      let py = y - ay;
      let pz = z - az;
      let qx = U[0] * px + U[3] * py + U[6] * pz;
      let qy = U[1] * px + U[4] * py + U[7] * pz;
      let qz = U[2] * px + U[5] * py + U[8] * pz;
      let du = Infinity;
      if (boxDist(upperBox, x, y, z) < 0.03) {
        du = smin(plate.d(qx, qy, qz), rim(qx, qy, qz), 0.004);
        du = smax(du, -hollow.d(qx, qy, qz), 0.0035);
      } else du = boxDist(upperBox, x, y, z);
      // (the lobe, in its frame)
      px = x - lx;
      pz = z - lz;
      qx = L[0] * px + L[3] * py + L[6] * pz;
      qy = L[1] * px + L[4] * py + L[7] * pz;
      qz = L[2] * px + L[5] * py + L[8] * pz;
      if (boxDist(lobeBox, x, y, z) >= du + 0.006) return du;
      let dl = strap.d(qx * 2.1, qy, qz) / 2.1;
      dl = smax(dl, -groove.d(qx * 0.8, qy, qz) / 0.8, 0.002);
      return smin(du, dl, 0.006);
    },
    box: joinBoxes([upperBox, lobeBox]),
  };
}

// ── Curls ───────────────────────────────────────────────────────────────

/**
 * Many small spheres (curls, beads) as one shape: a grid of `cs` m cells
 * lists the spheres near each, so a point measures only a few. `list` holds
 * x, y, z, r for each sphere.
 */
function beads(list: number[], cs = 0.009): Shape {
  const n = list.length / 4;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++)
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], list[i * 4 + a] - list[i * 4 + 3]);
      hi[a] = Math.max(hi[a], list[i * 4 + a] + list[i * 4 + 3]);
    }
  const box: Box = [lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]];
  // (the grid reaches a cell past the spheres, so points near them get a true distance)
  for (let a = 0; a < 3; a++) {
    lo[a] -= cs;
    hi[a] += cs;
  }
  const grid: Box = [lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]];
  const M = cs * 0.5;
  const nx = Math.max(1, Math.ceil((hi[0] - lo[0]) / cs));
  const ny = Math.max(1, Math.ceil((hi[1] - lo[1]) / cs));
  const nz = Math.max(1, Math.ceil((hi[2] - lo[2]) / cs));
  const lists: number[][] = Array.from({ length: nx * ny * nz }, () => []);
  const cellBox = (i: number, j: number, k: number): Box => [lo[0] + i * cs, lo[1] + j * cs, lo[2] + k * cs, lo[0] + (i + 1) * cs, lo[1] + (j + 1) * cs, lo[2] + (k + 1) * cs];
  const cl = (v: number, m: number) => Math.max(0, Math.min(m - 1, v));
  for (let b = 0; b < n; b++) {
    const x = list[b * 4];
    const y = list[b * 4 + 1];
    const z = list[b * 4 + 2];
    const r = list[b * 4 + 3];
    const reach = r + M;
    for (let k = cl(Math.floor((z - reach - lo[2]) / cs), nz); k <= cl(Math.floor((z + reach - lo[2]) / cs), nz); k++)
      for (let j = cl(Math.floor((y - reach - lo[1]) / cs), ny); j <= cl(Math.floor((y + reach - lo[1]) / cs), ny); j++)
        for (let i = cl(Math.floor((x - reach - lo[0]) / cs), nx); i <= cl(Math.floor((x + reach - lo[0]) / cs), nx); i++)
          if (boxDist(cellBox(i, j, k), x, y, z) - r < M) lists[i + nx * (j + ny * k)].push(b);
  }
  // Packed: each cell's spheres; for an empty cell, how far the nearest sphere is at least:
  // M, or a cell less than the steps to the nearest cell with spheres (a sweep over the cells).
  const start = new Int32Array(nx * ny * nz + 1);
  for (let c = 0; c < lists.length; c++) start[c + 1] = start[c] + lists[c].length;
  const idx = new Int32Array(start[lists.length]);
  lists.forEach((l, c) => idx.set(l, start[c]));
  const steps = new Int32Array(nx * ny * nz).fill(1 << 20);
  let front: number[] = [];
  for (let c = 0; c < lists.length; c++) if (lists[c].length) (steps[c] = 0), front.push(c);
  for (let t = 1; front.length; t++) {
    const next: number[] = [];
    for (const c of front) {
      const i = c % nx;
      const j = ((c - i) / nx) % ny;
      const k = (c - i - nx * j) / (nx * ny);
      for (let dk = -1; dk <= 1; dk++)
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const a = i + di;
            const b = j + dj;
            const e = k + dk;
            if (a < 0 || b < 0 || e < 0 || a >= nx || b >= ny || e >= nz) continue;
            const q = a + nx * (b + ny * e);
            if (steps[q] > t) (steps[q] = t), next.push(q);
          }
    }
    front = next;
  }
  const clear = new Float32Array(nx * ny * nz);
  for (let c = 0; c < clear.length; c++) clear[c] = Math.max(M, (steps[c] - 1) * cs);
  const S = Float64Array.from(list);
  const [x0, y0, z0] = lo;
  const inGrid = (x: number, y: number, z: number) => {
    const c = cl(Math.floor((x - x0) / cs), nx) + nx * (cl(Math.floor((y - y0) / cs), ny) + ny * cl(Math.floor((z - z0) / cs), nz));
    const a = start[c];
    const e = start[c + 1];
    if (a === e) return clear[c];
    let d = M;
    for (let q = a; q < e; q++) {
      const b = idx[q] * 4;
      const dx = x - S[b];
      const dy = y - S[b + 1];
      const dz = z - S[b + 2];
      const dd = Math.sqrt(dx * dx + dy * dy + dz * dz) - S[b + 3];
      if (dd < d) d = dd;
    }
    return d;
  };
  return {
    d(x, y, z) {
      const out = boxDist(grid, x, y, z);
      if (out === 0) return inGrid(x, y, z);
      // (outside the grid: from the nearest point on it, less the way there)
      const qx = Math.max(grid[0], Math.min(grid[3], x));
      const qy = Math.max(grid[1], Math.min(grid[4], y));
      const qz = Math.max(grid[2], Math.min(grid[5], z));
      return Math.max(out + cs, inGrid(qx, qy, qz) - out);
    },
    box,
  };
}

/** Spheres of radius `r` close along the line through `pts` (a smooth cord, as beads), added to `out`. */
function cord(out: number[], pts: V3[], r: number): void {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / (r * 0.5)));
    for (let j = i === 1 ? 0 : 1; j <= n; j++) {
      const t = j / n;
      out.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, r);
    }
  }
}

/**
 * Curls in rows over a head surface `base`: rows laid on the ellipsoid
 * (centre `c`, radii `r`) from the polar angle `from` to `to` (rad, 0 at
 * the top), `pitch` m apart, each cast out from `c` onto `base` and sunk
 * `sink` of its radius `cr` into it. `keep` picks which (by the place on the
 * surface). Adds x, y, z, r to `out`.
 */
function curlRows(out: number[], base: Shape, c: V3, r: V3, pitch: number, cr: number, keep: (p: V3) => boolean, from: number, to: number, sink = 0.38): void {
  const rh = (r[0] + r[2]) / 2;
  let t = from;
  let row = 0;
  while (t <= to) {
    const st = Math.sin(t);
    const ct = Math.cos(t);
    const count = Math.max(1, Math.round((2 * Math.PI * rh * st) / pitch));
    for (let j = 0; j < count; j++) {
      const a = ((j + (row % 2) * 0.5) / count) * 2 * Math.PI;
      const dir: V3 = [r[0] * st * Math.sin(a), r[1] * ct, r[2] * st * Math.cos(a)];
      const l = Math.hypot(dir[0], dir[1], dir[2]);
      const p = castOut(base, c, [dir[0] / l, dir[1] / l, dir[2] / l]);
      if (!keep(p)) continue;
      const nn = normalAt(base, p);
      out.push(p[0] - nn[0] * cr * sink, p[1] - nn[1] * cr * sink, p[2] - nn[2] * cr * sink, cr);
    }
    // (the next row a pitch further along the ellipse's side)
    t += pitch / Math.max(1e-3, Math.hypot(r[1] * st, rh * ct));
    row++;
  }
}

/** The hairline's height (m) round the head, by the bearing from the front (rad, 0 ahead). */
function hairlineY(bearing: number): number {
  const a = Math.abs(bearing) / DEG;
  const pts: [number, number][] = [
    [0, Y.hair],
    [30, Y.hair - 0.003],
    [58, Y.hair - 0.014],
    [80, Y.hair - 0.027],
    [100, Y.hair - 0.036],
    [125, Y.hair - 0.07],
    [180, Y.hair - 0.105],
  ];
  for (let i = 1; i < pts.length; i++)
    if (a <= pts[i][0]) {
      const t = (a - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
      const sm = t * t * (3 - 2 * t);
      return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * sm;
    }
  return pts[pts.length - 1][1];
}

/** The bearing (rad, 0 ahead) of a point round the skull's axis. */
const bearingOf = (x: number, z: number) => Math.atan2(x, z - SKULL.c[2]);

/** Paint for the hair: above the hairline and near the head's surface (not the ears). */
function hairPaint(base: Shape, lift = 0): Shape {
  const b = base.box;
  return {
    d(x, y, z) {
      const above = hairlineY(bearingOf(x, z)) + lift - y;
      if (above > 0) return above;
      return Math.max(above, base.d(x, y, z) - 0.0085);
    },
    box: [b[0] - 0.01, Y.hair - 0.12, b[2] - 0.01, b[3] + 0.01, b[4] + 0.01, b[5] + 0.01],
  };
}

// ── Pagoda crown ────────────────────────────────────────────────────────

/** Snail-shell curls, the round ushnisha, the band at the hairline, the flame. */
function pagodaCrown(c: Clay, baseShape: Shape, paints: [Shape, string][]): void {
  const pitch = 0.0102;
  const cr = 0.0056;
  const uc = USH.c;
  const ur = USH.r;
  const ushTop = uc[1] + ur[1];
  const list: number[] = [];
  const onUsh = (p: V3) => p[1] > FIG.crown - 0.004 && Math.hypot(p[0], p[2] - uc[2]) < ur[0] + 0.004;
  curlRows(list, baseShape, SKULL.c, SKULL.r, pitch, cr, (p) => p[1] > hairlineY(bearingOf(p[0], p[2])) + 0.0075 && !onUsh(p), 0.22, 2.4);
  curlRows(list, baseShape, [uc[0], uc[1] - 0.01, uc[2]], ur, pitch * 0.96, cr * 0.95, onUsh, 0.2, 1.9);
  // The band where the hair meets the brow (beads so close they make a smooth cord).
  const band: V3[] = [];
  for (let i = 0; i <= 24; i++) {
    const b = (-1 + i / 12) * 112 * DEG;
    const y = hairlineY(b) + 0.0005;
    band.push(castOut(baseShape, [0, y, SKULL.c[2]], [Math.sin(b), 0, Math.cos(b)]));
  }
  cord(list, band, 0.0032);
  c.add(beads(list), 0.0024);

  // The flame (rasmi): slim, pointed, its sides rippling like a flame's tongues, about 1.1 F tall, on a ring of beads.
  const foot = ushTop - 0.006;
  const flame = lathe(foot, 1.12 * F, uc[2], 0.85, (t) => {
    // (a slim neck, the flame's body swelling low, then a long taper to the point, softly rippled)
    const body = t < 0.17 ? 0.0094 + (0.0158 - 0.0094) * Math.sin(((t / 0.17) * Math.PI) / 2) : 0.0158 * Math.pow((1 - t) / 0.83, 1.12);
    return body * (1 + 0.07 * Math.sin((t - 0.17) * 26) * (t > 0.17 ? 1 - t : 0));
  });
  c.add(flame, 0.004);
  const collar = ring([0, foot + 0.003, uc[2]], 0.0122, 0.0036);
  c.add(collar, 0.002);
  paints.push([hairPaint(baseShape, 0.0035), 'hair']);
  paints.push([{ d: (_x, y) => foot - 0.003 - y, box: [-0.03, foot - 0.004, uc[2] - 0.03, 0.03, foot + 0.2, uc[2] + 0.03] }, 'flame']);
}

/**
 * A slim shape turned round an upright axis (the flame): radius `r(t)` at
 * the share `t` of its height `h` above `foot` (`squash` of it front to
 * back), the axis at z = `z0` swaying a little as it rises.
 */
function lathe(foot: number, h: number, z0: number, squash: number, r: (t: number) => number): Shape {
  const n = 240;
  const R = new Float64Array(n + 1);
  const Zs = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    R[i] = r(t);
    Zs[i] = z0 + 0.006 * Math.pow(t, 3) - 0.0035 * Math.sin(Math.PI * t) * t;
  }
  const rMax = Math.max(...R);
  const iq = 1 / squash;
  return {
    d(x, y, z) {
      const t = (y - foot) / h;
      const tc = t < 0 ? 0 : t > 1 ? 1 : t;
      const f = tc * n;
      const i = Math.min(n - 1, Math.floor(f));
      const u = f - i;
      const rr = R[i] + (R[i + 1] - R[i]) * u;
      const dz = (z - (Zs[i] + (Zs[i + 1] - Zs[i]) * u)) * iq;
      const slope = ((R[i + 1] - R[i]) * n) / h;
      const rho = Math.sqrt(x * x + dz * dz);
      let d = ((rho - rr) * squash) / Math.sqrt(1 + slope * slope);
      if (t < 0) d = Math.max(d, -t * h);
      if (t > 1) d = Math.max(d, Math.sqrt(rho * rho * squash * squash + ((t - 1) * h) ** 2));
      return d;
    },
    box: [-rMax, foot, z0 - rMax - 0.006, rMax, foot + h, z0 + rMax + 0.006],
  };
}

// ── Angkor crown ────────────────────────────────────────────────────────

/** Curls in rows, the diadem over the brow, a cone of curls with a lotus bud on top. */
function angkorCrown(c: Clay, baseShape: Shape, paints: [Shape, string][]): void {
  const pitch = 0.0108;
  const cr = 0.0058;
  const cz = USH.c[2];
  const list: number[] = [];
  const band = 0.013;
  curlRows(list, baseShape, SKULL.c, SKULL.r, pitch, cr, (p) => p[1] > hairlineY(bearingOf(p[0], p[2])) + band + 0.003 && p[1] < FIG.crown - 0.008, 0.3, 2.4);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const y = FIG.crown - 0.004 + i * 0.0125;
    const rr = 0.04 - i * 0.0078;
    const k = 1 - i * 0.08;
    const n = Math.max(7, Math.round((2 * Math.PI * rr) / (pitch * k)));
    for (let j = 0; j < n; j++) {
      const a = ((j + (i % 2) * 0.5) / n) * 2 * Math.PI;
      list.push(Math.sin(a) * rr, y, cz + Math.cos(a) * rr, cr * k);
    }
  }
  c.add(beads(list), 0.0022);
  // The lotus bud: eight petals closed round a pointed heart, on a small ring.
  const bud = FIG.crown + 0.058;
  const petals: Shape[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 2 * Math.PI + Math.PI / 8;
    const lean = i % 2 ? 0.2 : 0.12;
    petals.push(ell([Math.sin(a) * 0.0068, bud + (i % 2 ? 0.001 : 0), cz + Math.cos(a) * 0.0068], [0.0052, 0.0135, 0.0036], turn(a, -lean, 0)));
  }
  const budShape = union([...petals, cone([0, bud - 0.004, cz], [0, bud + 0.024, cz], 0.0088, 0.0006), ring([0, bud - 0.0125, cz], 0.0112, 0.0026)], 0.0024);
  c.add(budShape, 0.004);
  // The diadem: a gold band round the brow, a row of rosettes along it.
  const pts: V3[] = [];
  const ros: number[] = [];
  const n = 30;
  for (let i = 0; i <= n; i++) {
    const b = (-1 + (2 * i) / n) * 120 * DEG;
    const y = hairlineY(b) + band * 0.5;
    const p = castOut(baseShape, [0, y, SKULL.c[2]], [Math.sin(b), 0, Math.cos(b)]);
    const nn = normalAt(baseShape, p);
    pts.push([p[0] + nn[0] * 0.0005, p[1], p[2] + nn[2] * 0.0005]);
    if (i % 2 === 1 && Math.abs(b) < 104 * DEG) ros.push(p[0] + nn[0] * 0.004, p[1], p[2] + nn[2] * 0.004, 0.0038);
  }
  const rosettes = beads(ros);
  const cordBeads: number[] = [];
  cord(cordBeads, pts, 0.0048);
  const bandShape = beads([...cordBeads, ...ros]);
  c.add(bandShape, 0.002);
  paints.push([grow2(bandShape, 0.0015), 'flame']);
  paints.push([grow2(rosettes, 0.0008), 'jewel']);
  paints.push([hairPaint(baseShape, band), 'hair']);
  paints.push([grow2(budShape, 0.002), 'flame']);
}
