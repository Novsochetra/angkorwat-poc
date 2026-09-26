import type { Sculpt } from './sculpt';
import { mirrorX, type Box, type Rot, type Shape, type V3 } from './sdf';
import { FIG, type Mudra } from './_buddhaFrame';

/**
 * The Buddha's body (figure space, _buddhaFrame.ts): a smooth seated body
 * in the half lotus of Southeast Asia (the right leg over the left, the
 * right sole turned up), the hands in the mudra, and the monk's robe worn
 * the Khmer way — the right shoulder bare, the cloth thin and clinging so
 * the body shows through, its edges a raised hem, the folded shoulder
 * cloth (sanghati) falling from the left shoulder to the navel. With
 * `sash`, a saffron cloth the people draped over his left shoulder.
 *
 * The torso is shaped once (skin level); the robe, its hem, the shoulder
 * cloth and the sash are that skin pushed out by a smooth thickness drawn
 * on it as seen from the front (the same lines run round his back), so
 * their edges stay clean on the coarse grid. The hands and the upturned
 * toes are the sculpt's fine zones.
 */
export function addBody(s: Sculpt, o: { mudra: Mudra; sash: boolean }): void {
  const skin = torso();
  const arms = ARMS[o.mudra];

  // The torso in its cloth: robe, hem, shoulder cloth (and sash) are one skin pushed out.
  s.add(dressed(skin, o.sash), 'robe');
  // (which cloth is where: the bare right side, the sash; the hems show by their relief alone,
  // a painted line on the coarse grid would zigzag)
  s.paint(onTorso(skin, (x, y) => 0.0015 - robeEdge(x, y)), 'skin');
  if (o.sash) s.paint(onTorso(skin, (x, y) => Math.abs(sashLine(x, y)) - SASH.paint, 0.03), 'sash');

  // The legs in the robe, its hem at the right ankle; the arms, the right one
  // bare, the left one in the robe to its hem at the wrist. (Many small parts
  // rather than a few big unions: the sculpt skips far parts by their boxes.)
  for (const [part, k] of legParts()) s.add(part, 'robe', k);
  s.add(ankleHem(), 'robe', 0.003);
  for (const part of [...armParts(arms.right), ...armParts(arms.left)]) s.add(part, 'skin', 0.022);
  s.add(wristHem(arms.left), 'skin', 0.003);
  s.paint(sleeve(arms.left), 'robe');
  s.paint(union([ankleHem(), wristHem(arms.left)]), 'hem');

  // The hands in the mudra and the upturned right foot, meshed fine.
  for (const part of [hand(arms.left.hand), hand(arms.right.hand), rightFoot()]) s.add(part, 'skin', 0.008);
  for (const z of [...arms.zones, TOES_ZONE]) s.fine(z);

  if (o.sash) s.add(sashKnot(), 'sash', 0.012);
}

// ── Measures ──────────────────────────────────────────────────────────────

/** How far (m) the robe stands off the skin: thin, it clings. */
const ROBE = 0.0025;

// ── Small helpers ─────────────────────────────────────────────────────────

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => mul(a, 1 / Math.sqrt(dot(a, a)));
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** 0 at `a`, 1 at `b`, easing in and out between (either order; no crease for the mesh to catch on). */
const smoother = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
/** A soft bump: 1 at u = 0, falling smoothly to 0 at |u| = 1 (and flat there). */
const bell = (u: number) => {
  const c = 1 - u * u;
  return c <= 0 ? 0 : c * c * c;
};
const growBox = (b: Box, p: number): Box => [b[0] - p, b[1] - p, b[2] - p, b[3] + p, b[4] + p, b[5] + p];
const joinBox = (a: Box, b: Box): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3]), Math.max(a[4], b[4]), Math.max(a[5], b[5])];

/** A turn whose local x points along `x`, local y towards `y`, local z to the side of `zHint` (it may mirror). */
function frame(x: V3, y: V3, zHint: V3): Rot {
  const X = norm(x);
  const Y = norm(sub(y, mul(X, dot(X, y))));
  let Z = cross(X, Y);
  if (dot(Z, zHint) < 0) Z = mul(Z, -1);
  return [X[0], Y[0], Z[0], X[1], Y[1], Z[1], X[2], Y[2], Z[2]];
}

/** A point given in a frame's local space, in figure space. */
const toWorld = (R: Rot, at: V3, p: V3): V3 => [
  at[0] + R[0] * p[0] + R[1] * p[1] + R[2] * p[2],
  at[1] + R[3] * p[0] + R[4] * p[1] + R[5] * p[2],
  at[2] + R[6] * p[0] + R[7] * p[1] + R[8] * p[2],
];
/** A figure-space point in a frame's local space. */
const toLocal = (R: Rot, at: V3, p: V3): V3 => {
  const q = sub(p, at);
  return [R[0] * q[0] + R[3] * q[1] + R[6] * q[2], R[1] * q[0] + R[4] * q[1] + R[7] * q[2], R[2] * q[0] + R[5] * q[1] + R[8] * q[2]];
};

/** An ellipsoid (as sdf.ts, lighter): radii `r` on its own axes, turned by `R` (local → figure), its box tight. */
function ell(c: V3, r: V3, R?: Rot): Shape {
  const [cx, cy, cz] = c;
  const [rx, ry, rz] = r;
  const ix = 1 / rx;
  const iy = 1 / ry;
  const iz = 1 / rz;
  const m = Math.min(rx, ry, rz);
  const half = (i: number) => (R ? Math.sqrt((R[i * 3] * rx) ** 2 + (R[i * 3 + 1] * ry) ** 2 + (R[i * 3 + 2] * rz) ** 2) : r[i]);
  const h = [half(0), half(1), half(2)];
  return {
    d(x, y, z) {
      let px = x - cx;
      let py = y - cy;
      let pz = z - cz;
      if (R) {
        const qx = R[0] * px + R[3] * py + R[6] * pz;
        const qy = R[1] * px + R[4] * py + R[7] * pz;
        pz = R[2] * px + R[5] * py + R[8] * pz;
        px = qx;
        py = qy;
      }
      const ax = px * ix;
      const ay = py * iy;
      const az = pz * iz;
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
      const bx = ax * ix;
      const by = ay * iy;
      const bz = az * iz;
      const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
      return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -m;
    },
    box: [cx - h[0], cy - h[1], cz - h[2], cx + h[0], cy + h[1], cz + h[2]],
  };
}

/**
 * A tapered capsule: radius `ra` at a to `rb` at b (sdf.ts `cone`, lighter:
 * the radius simply follows the segment, near enough for slender limbs).
 */
function limb(a: V3, b: V3, ra: number, rb: number): Shape {
  const [ax, ay, az] = a;
  const bx = b[0] - ax;
  const by = b[1] - ay;
  const bz = b[2] - az;
  const il = 1 / Math.max(bx * bx + by * by + bz * bz, 1e-12);
  const dr = rb - ra;
  const r = Math.max(ra, rb);
  return {
    d(x, y, z) {
      const px = x - ax;
      const py = y - ay;
      const pz = z - az;
      const t = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) * il));
      const qx = px - bx * t;
      const qy = py - by * t;
      const qz = pz - bz * t;
      return Math.sqrt(qx * qx + qy * qy + qz * qz) - (ra + dr * t);
    },
    box: [Math.min(ax, b[0]) - r, Math.min(ay, b[1]) - r, Math.min(az, b[2]) - r, Math.max(ax, b[0]) + r, Math.max(ay, b[1]) + r, Math.max(az, b[2]) + r],
  };
}

/** A box with half-sizes `h`, its edges rounded by `r` (sdf.ts `roundBox`, lighter; not turned). */
function slab(c: V3, h: V3, r: number): Shape {
  const [cx, cy, cz] = c;
  const hx = h[0] - r;
  const hy = h[1] - r;
  const hz = h[2] - r;
  return {
    d(x, y, z) {
      const qx = Math.abs(x - cx) - hx;
      const qy = Math.abs(y - cy) - hy;
      const qz = Math.abs(z - cz) - hz;
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const oz = Math.max(qz, 0);
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
    },
    box: [cx - h[0], cy - h[1], cz - h[2], cx + h[0], cy + h[1], cz + h[2]],
  };
}

/**
 * The shapes as one, blended over `k` m where they meet (sdf.ts `union`,
 * lighter: the boxes in one array, the far ones skipped without a root).
 */
function union(shapes: Shape[], k = 0): Shape {
  const n = shapes.length;
  const bb = new Float64Array(n * 6);
  shapes.forEach((sh, i) => bb.set(sh.box, i * 6));
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const sh of shapes)
    for (let i = 0; i < 3; i++) {
      box[i] = Math.min(box[i], sh.box[i] - k * 0.25);
      box[i + 3] = Math.max(box[i + 3], sh.box[i + 3] + k * 0.25);
    }
  const ik = k > 0 ? 1 / k : 0;
  return {
    d(x, y, z) {
      let d = Infinity;
      for (let i = 0, o = 0; i < n; i++, o += 6) {
        const reach = d + k;
        if (reach <= 0) break;
        const dx = x < bb[o] ? bb[o] - x : x > bb[o + 3] ? x - bb[o + 3] : 0;
        const dy = y < bb[o + 1] ? bb[o + 1] - y : y > bb[o + 4] ? y - bb[o + 4] : 0;
        const dz = z < bb[o + 2] ? bb[o + 2] - z : z > bb[o + 5] ? z - bb[o + 5] : 0;
        if (dx * dx + dy * dy + dz * dz >= reach * reach) continue;
        const v = shapes[i].d(x, y, z);
        if (k > 0) {
          const h = k - Math.abs(d - v);
          d = h > 0 ? Math.min(d, v) - h * h * ik * 0.25 : Math.min(d, v);
        } else if (v < d) d = v;
      }
      return d;
    },
    box: box as unknown as Box,
  };
}

/** The shape (made about the origin) moved to `t` and turned by `R` (sdf.ts `place`, lighter). */
function place(s: Shape, t: V3, R: Rot): Shape {
  const [tx, ty, tz] = t;
  const [r0, r1, r2, r3, r4, r5, r6, r7, r8] = R;
  const b = s.box;
  const pts: V3[] = [];
  for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) pts.push(toWorld(R, t, [x, y, z]));
  return {
    d(x, y, z) {
      const px = x - tx;
      const py = y - ty;
      const pz = z - tz;
      return s.d(r0 * px + r3 * py + r6 * pz, r1 * px + r4 * py + r7 * pz, r2 * px + r5 * py + r8 * pz);
    },
    box: around(pts, 0),
  };
}

/** Distance (m) from a point to a box (0 inside). */
const boxDist = (b: Box, x: number, y: number, z: number) => {
  const dx = Math.max(b[0] - x, 0, x - b[3]);
  const dy = Math.max(b[1] - y, 0, y - b[4]);
  const dz = Math.max(b[2] - z, 0, z - b[5]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

// ── Lines drawn on him, seen from the front ───────────────────────────────

/** A line across the figure seen from the front (x, y): its signed distance, below it negative. */
type Line2 = (x: number, y: number) => number;

/**
 * A smooth line through points (x increasing), as a signed distance in x, y
 * (below the line: negative; from a table, so it is cheap to ask).
 */
function curve(pts: [number, number][]): Line2 {
  // Catmull–Rom through the points, then its height at even steps of x.
  const p: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[i];
    const c = pts[i + 1];
    const d = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < 16; k++) {
      const t = k / 16;
      const f = (u: number, v: number, w: number, z: number) =>
        0.5 * (2 * v + (-u + w) * t + (2 * u - 5 * v + 4 * w - z) * t * t + (-u + 3 * v - 3 * w + z) * t * t * t);
      p.push([f(a[0], b[0], c[0], d[0]), f(a[1], b[1], c[1], d[1])]);
    }
  }
  p.push(pts[pts.length - 1]);
  const x0 = pts[0][0];
  const x1 = pts[pts.length - 1][0];
  const n = 512;
  const step = (x1 - x0) / n;
  const ys = new Float64Array(n + 1);
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const x = x0 + i * step;
    while (j < p.length - 2 && p[j + 1][0] < x) j++;
    const [ax, ay] = p[j];
    const [bx, by] = p[j + 1];
    ys[i] = ay + ((by - ay) * (x - ax)) / Math.max(bx - ax, 1e-9);
  }
  return (x, y) => {
    const t = Math.max(0, Math.min(n - 1e-6, (x - x0) / step));
    const i = t | 0;
    const f = t - i;
    const a = ys[i];
    const b = ys[i + 1];
    const g = (b - a) / step;
    return (y - a - (b - a) * f) / Math.sqrt(1 + g * g);
  };
}

/** A thickness (m) drawn on the figure seen from the front. */
type Thick = (x: number, y: number) => number;

/**
 * The torso in its cloth: the skin pushed out by the robe (thin, clinging),
 * its hem, the shoulder cloth and, with `sash`, the saffron sash on top.
 */
function dressed(skin: Shape, sash: boolean): Shape {
  // (the most cloth there is anywhere: the sash over the shoulder cloth over the hem over the robe)
  const most = 0.027;
  const b = growBox(skin.box, most);
  return {
    d(x, y, z) {
      // (far from the torso: its box is near enough, and cheap)
      const far = boxDist(b, x, y, z);
      if (far > 0.075) return far;
      const d = skin.d(x, y, z);
      // (beyond every blend's reach the most cloth there is will do: a bound that changes nothing)
      if (d > 0.08) return d - most;
      // (cloth on cloth: the thicknesses add up, so where they cross stays smooth)
      const e = robeEdge(x, y);
      let t = robeThick(e) + hemThick(e) + beltThick(x, y) * smoother(-0.07, 0.03, z) + sanghatiThick(x, y);
      if (sash) t += sashThick(x, y);
      return d - t;
    },
    box: b,
  };
}

/** The torso's surface (within `reach` m of the skin) where `where` (seen from the front) is below 0: for a paint. */
function onTorso(skin: Shape, where: Line2, reach = 0.012): Shape {
  return { d: (x, y, z) => Math.max(where(x, y), Math.abs(skin.d(x, y, z)) - reach), box: growBox(skin.box, reach) };
}

/**
 * The upper robe's edge: from under the right armpit, below the right
 * breast, up across the chest to the left of the neck (and the same line
 * round the back). Below it he is covered.
 */
const robeEdge = curve([
  [-0.42, 0.262],
  [-0.2, 0.254],
  [-0.14, 0.243],
  [-0.08, 0.228],
  [-0.025, 0.242],
  [0.025, 0.285],
  [0.058, 0.34],
  [0.08, 0.4],
  [0.1, 0.5],
]);

/** The robe: thin, on everything below its edge (`edge`: robeEdge at the point). */
const robeThick = (edge: number) => ROBE * smoother(0.006, -0.01, edge);

/**
 * The hem along the robe's edge: a soft raised band (the cloth's selvedge)
 * a little inside the edge, wide enough for the coarse grid to follow it
 * smoothly.
 */
const HEM = { offset: 0.007, width: 0.019, height: 0.0042 };
const hemThick = (edge: number) => HEM.height * bell((edge + HEM.offset) / HEM.width);

/** The lower robe's waistband showing through the upper robe: a low soft band just below the navel, dipping a little in front (and fading round his sides). */
const BELT = { y: FIG.navel[1] - 0.012, dip: 0.006, width: 0.017, height: 0.0038 };
const beltThick: Thick = (x, y) => BELT.height * bell((y - BELT.y - (BELT.dip * x * x) / 0.0121) / BELT.width);

/** The shoulder cloth's line down the chest (top over the shoulder, its end at the navel) and half-width. */
const SANGHATI = { top: [0.1, 0.44] as const, end: [0.056, FIG.navel[1] + 0.004] as const, half: 0.03 };

/** Where the shoulder cloth lies, seen from the front: across (m from its middle) and along (m down from the top), and its length. */
function sanghatiAt(x: number, y: number): { across: number; along: number; len: number } {
  const [tx, ty] = SANGHATI.top;
  const ex = SANGHATI.end[0] - tx;
  const ey = SANGHATI.end[1] - ty;
  const len = Math.sqrt(ex * ex + ey * ey);
  const ax = ex / len;
  const ay = ey / len;
  return { along: (x - tx) * ax + (y - ty) * ay, across: (x - tx) * -ay + (y - ty) * ax, len };
}

/** The folded shoulder cloth (sanghati): a flat band of pleats from the left shoulder to the navel, its end straight. */
const sanghatiThick: Thick = (x, y) => {
  const g = sanghatiAt(x, y);
  const a = Math.abs(g.across);
  if (a > SANGHATI.half + 0.008 || g.along > g.len + 0.008) return 0;
  const u = Math.min(1, a / SANGHATI.half);
  const edge = smoother(SANGHATI.half + 0.008, SANGHATI.half - 0.012, a) * smoother(g.len + 0.008, g.len - 0.014, g.along);
  // (two fold lines along it, between flat pleats)
  const pleat = 0.001 * Math.cos(u * Math.PI * 2);
  return edge * (0.0048 + pleat);
};

/** The sash's middle line: over the left shoulder, across the chest, under the right arm (and so round the back). */
const sashLine = curve([
  [-0.42, 0.08],
  [-0.2, 0.15],
  [-0.1, 0.2],
  [0.0, 0.265],
  [0.08, 0.34],
  [0.13, 0.41],
  [0.2, 0.56],
]);

/** The sash: a soft cloth thicker than the robe, standing off it, rounded like a loosely rolled cloth; its paint's half-width. */
const SASH = { half: 0.042, paint: 0.027, height: 0.012 };
const sashThick: Thick = (x, y) => {
  const u = Math.abs(sashLine(x, y)) / SASH.half;
  if (u >= 1) return 0;
  const ripple = 1 + 0.12 * Math.sin(x * 55 + y * 30);
  return SASH.height * Math.sqrt(bell(u)) * ripple;
};

/** The sash's knot under the right arm, its two ends hanging. */
function sashKnot(): Shape {
  const flat = frame([0.9, 0.3, 0.3], [0, 1, 0], [0, 0, 1]);
  const hang = (tilt: number): Rot => frame([tilt, 1, 0.25], [0, 0.25, 1], [1, 0, 0]);
  return union(
    [
      // the knot, a soft roll flat against his side under the right arm
      ell([-0.11, 0.168, 0.042], [0.026, 0.018, 0.012], flat),
      // its two ends, broad and flat, hanging a little apart
      ell([-0.118, 0.137, 0.05], [0.015, 0.03, 0.0055], hang(0.12)),
      ell([-0.094, 0.14, 0.056], [0.014, 0.026, 0.0055], hang(-0.22)),
    ],
    0.009,
  );
}

// ── The torso ─────────────────────────────────────────────────────────────

/**
 * A trunk drawn by its profiles: at each height (y) an ellipse across,
 * `half` wide each side, from `front` to `back` (z); smooth between the
 * rows, its top and foot closed flat-round. Cheap to ask (one table).
 */
function loft(rows: [y: number, half: number, front: number, back: number][]): Shape {
  const n = 256;
  const y0 = rows[0][0];
  const y1 = rows[rows.length - 1][0];
  const step = (y1 - y0) / n;
  const A = new Float64Array(n + 1);
  const B = new Float64Array(n + 1);
  const C = new Float64Array(n + 1);
  const G = new Float64Array(n + 1);
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const y = y0 + i * step;
    while (j < rows.length - 2 && rows[j + 1][0] < y) j++;
    const t = (y - rows[j][0]) / (rows[j + 1][0] - rows[j][0]);
    // (Catmull–Rom down each column)
    const col = (k: number) => {
      const a = rows[Math.max(0, j - 1)][k];
      const b = rows[j][k];
      const c = rows[j + 1][k];
      const d = rows[Math.min(rows.length - 1, j + 2)][k];
      return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    };
    A[i] = col(1);
    B[i] = (col(2) - col(3)) * 0.5;
    C[i] = (col(2) + col(3)) * 0.5;
  }
  // (smoothed down the rows, so the curvature flows without bands a gilt surface would mirror)
  for (const T of [A, B, C])
    for (let pass = 0; pass < 72; pass++) {
      let prev = T[0];
      for (let i = 1; i < n; i++) {
        const cur = T[i];
        T[i] = (prev + 2 * cur + T[i + 1]) * 0.25;
        prev = cur;
      }
    }
  // (how steeply the sides lean at each height: the distance across is that much too far)
  for (let i = 0; i <= n; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n, i + 1);
    const dy = (i1 - i0) * step;
    const a = (A[i1] - A[i0]) / dy;
    const f = (C[i1] + B[i1] - C[i0] - B[i0]) / dy;
    const b = (C[i1] - B[i1] - C[i0] + B[i0]) / dy;
    const lean2 = a * a + Math.max(f * f, b * b);
    G[i] = Math.max(0.55, 1 / Math.sqrt(1 + lean2));
  }
  let w = 0;
  let zf = -Infinity;
  let zb = Infinity;
  for (const r of rows) {
    w = Math.max(w, r[1]);
    zf = Math.max(zf, r[2]);
    zb = Math.min(zb, r[3]);
  }
  return {
    d(x, y, z) {
      // (the ellipse across at this height, its distance a bound near the surface as sdf.ts `ellipsoid`)
      const t = Math.max(0, Math.min(n - 1e-6, (y - y0) / step));
      const i = t | 0;
      const f = t - i;
      const a = A[i] + (A[i + 1] - A[i]) * f;
      const b = B[i] + (B[i + 1] - B[i]) * f;
      const pz = z - (C[i] + (C[i + 1] - C[i]) * f);
      const ia = 1 / a;
      const ib = 1 / b;
      const u = x * ia;
      const v = pz * ib;
      const k0 = Math.sqrt(u * u + v * v);
      const k1 = Math.sqrt(u * u * ia * ia + v * v * ib * ib);
      const g = G[i] + (G[i + 1] - G[i]) * f;
      const out = (k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(a, b)) * g;
      // (closed at the top and the foot)
      const top = y - y1;
      const foot = y0 - y;
      if (top < out - 0.03 && foot < out - 0.006) return out;
      return smax(smax(out, top, 0.03), foot, 0.006);
    },
    box: [-w, y0, zb, w, y1, zf],
  };
}

/** Smooth maximum (sdf.ts `smax`). */
function smax(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

/**
 * Broad rounded shoulders, a full "lion" chest, a slim waist and a soft
 * belly (the trunk's profiles), the neck's foot left short for the head to
 * join (skin level).
 */
function torso(): Shape {
  const [sx, sy, sz] = FIG.shoulder;
  const trunk = loft([
    // y, half-width, front, back
    // (the seat: the robe spreads on the throne round his hips and rounds over them behind)
    [-0.004, 0.17, 0.03, -0.163],
    [0.014, 0.164, 0.045, -0.166],
    [0.04, 0.15, 0.058, -0.163],
    [0.075, 0.134, 0.072, -0.152],
    [0.1, 0.125, 0.08, -0.14],
    [FIG.navel[1], 0.116, FIG.navel[2] + 0.002, -0.128],
    [0.185, 0.108, 0.081, -0.114],
    [0.225, 0.117, 0.083, -0.115],
    [0.26, 0.137, 0.089, -0.121],
    [FIG.chestY, 0.147, FIG.chestZ + 0.001, -0.124],
    [0.315, 0.151, 0.082, -0.123],
    [0.334, 0.146, 0.068, -0.116],
    [0.346, 0.134, 0.054, -0.108],
  ]);
  return union(
    [
      trunk,
      // the top of the chest and back, rounding up to the neck
      ell([0, 0.342, -0.026], [0.12, 0.03, 0.075]),
      // the slope from the neck to the shoulders, and the rounded shoulders
      mirrorX(limb([0.03, FIG.neck[1] - 0.026, sz - 0.01], [sx - 0.03, sy - 0.006, sz - 0.002], 0.034, 0.032)),
      mirrorX(ell([sx + 0.008, sy - 0.02, sz + 0.002], [0.045, 0.047, 0.047])),
      // the neck's foot (the head's neck overlaps it)
      limb([0, FIG.neck[1] - 0.04, FIG.neck[2] - 0.006], [0, FIG.neck[1] + 0.02, FIG.neck[2] + 0.002], 0.048, 0.044),
    ],
    0.035,
  );
}

// ── The legs ──────────────────────────────────────────────────────────────

const [KX, KY, KZ] = FIG.knee;
/** The right knee and ankle (his right leg lies on top, its foot on the left thigh). */
const R_KNEE: V3 = [-KX + 0.014, KY - 0.016, KZ + 0.012];
const R_ANKLE: V3 = [-0.004, 0.092, 0.198];
/** The left knee and ankle (the foot tucked under the right knee). */
const L_KNEE: V3 = [KX - 0.014, KY - 0.02, KZ + 0.01];
const L_ANKLE: V3 = [-0.17, 0.034, 0.172];

/**
 * Thighs, knees and shins in the robe (the robe included), each with how
 * far it blends into what is there: a broad, low lens, thickest in the
 * middle where the shins cross and the right foot lies, thinning to the
 * knees; the cloth over the lap between them, and the robe's end fanned in
 * pleats on the throne in front.
 */
function legParts(): [Shape, number][] {
  const hip: V3 = [0.1, 0.064, -0.02];
  const knee: V3 = [KX - 0.004, KY - 0.018, KZ];
  const thighAxis = sub(knee, hip);
  const thighLen = Math.sqrt(dot(thighAxis, thighAxis));
  const thigh = (m: number) => {
    const h: V3 = [hip[0] * m, hip[1], hip[2]];
    const k: V3 = [knee[0] * m, knee[1], knee[2]];
    const ax: V3 = [thighAxis[0] * m, thighAxis[1], thighAxis[2]];
    // (flattened, thinning to the knee)
    return union([ell(lerp(h, k, 0.4), [thighLen * 0.42, 0.04, 0.06], frame(ax, [0, 1, 0], [0, 0, 1])), limb(lerp(h, k, 0.5), k, 0.05, 0.038)], 0.03);
  };
  return [
    [thigh(1), 0.045],
    [thigh(-1), 0.045],
    // the cloth over the lap, from knee to knee
    [lapCloth(), 0.03],
    // the left shin, below
    [limb(L_KNEE, L_ANKLE, 0.036, 0.027), 0.03],
    // the right shin on top: its own form, laid on the left leg
    [limb(R_KNEE, R_ANKLE, 0.034, 0.027), 0.016],
    [robeFan(), 0.016],
  ];
}

/** The cloth over the lap, from knee to knee, a few soft folds fanning from under the hands to the knees. */
function lapCloth(): Shape {
  const lap = ell([0, 0.046, 0.085], [0.24, 0.034, 0.105]);
  return {
    d(x, y, z) {
      const d = lap.d(x, y, z);
      // (the folds only near the surface, fading out smoothly away from it)
      const near = smoother(0.03, 0.015, d);
      if (near === 0) return d;
      const pz = z - 0.06;
      const r = Math.sqrt(x * x + pz * pz);
      const out = Math.min(1, Math.max(0, (r - 0.06) / 0.08)) * Math.max(0, 1 - (r - 0.14) / 0.1);
      return d - 0.0034 * Math.cos(Math.atan2(x, pz) * 7) * out * near;
    },
    box: growBox(lap.box, 0.0034),
  };
}

/**
 * The robe's end, spread on the throne in front of the crossed ankles: a
 * thin fan of cloth widening forward, its pleats radiating from under the
 * ankles and its rim gently scalloped.
 */
function robeFan(): Shape {
  const ax = 0.012;
  const az = 0.14;
  const open = 0.62;
  const reach = 0.125;
  const pleats = 7;
  return {
    d(x, y, z) {
      const px = x - ax;
      const pz = z - az;
      const r = Math.sqrt(px * px + pz * pz);
      const th = Math.atan2(px, pz);
      const k = (th / open) * pleats * Math.PI * 0.5;
      const u = Math.min(1, r / reach);
      // (thick where it comes from under the legs, sloping down to a thin rim; the pleats deepen outward)
      const top = 0.017 - 0.011 * u + 0.0026 * Math.cos(k) * u;
      const rim = reach - 0.006 * Math.abs(Math.sin(k));
      let d = smax(y - top, r - rim, 0.004);
      d = smax(d, r * Math.sin(Math.max(0, Math.abs(th) - open)), 0.006);
      return smax(d, -0.004 - y, 0.004);
    },
    box: [ax - reach * Math.sin(open) - 0.01, -0.004, az - 0.01, ax + reach * Math.sin(open) + 0.01, 0.022, az + reach + 0.004],
  };
}

/** The right foot's frame: at the ankle, x to the toes, y out of the sole (up and to the front), z to the big toe. */
const FOOT_R = frame([1, 0.04, 0.0], [0, 0.8, 0.6], [0, -0.6, 0.8]);

/** The right foot on the left thigh, the sole turned up, the toes of even length in a neat row. */
function rightFoot(): Shape {
  const toes: Shape[] = [];
  // (across z, radius, length: nearly even, a neat row)
  const rows = [
    [0.02, 0.0078, 0.024],
    [0.0065, 0.0066, 0.022],
    [-0.0055, 0.0062, 0.021],
    [-0.0165, 0.0058, 0.019],
    [-0.0265, 0.0054, 0.017],
  ];
  for (const [z, r, l] of rows) {
    const b: V3 = [0.118 - Math.abs(z - 0.004) * 0.3, 0.001, z];
    toes.push(limb(b, [b[0] + l, 0.002, z * 1.02], r, r * 0.9));
  }
  const foot = union(
    [
      // the heel, the flat sole, the rounded instep, the ball
      ell([0.01, 0.0, -0.001], [0.024, 0.0145, 0.022]),
      slab([0.066, 0.0015, 0.0], [0.058, 0.0105, 0.0265], 0.0095),
      ell([0.052, -0.007, 0.001], [0.05, 0.0125, 0.021]),
      ell([0.11, 0.0, 0.002], [0.017, 0.0115, 0.03]),
      union(toes, 0.002),
    ],
    0.01,
  );
  return place(foot, R_ANKLE, FOOT_R);
}

/** Where the toes are meshed fine. */
const TOES_ZONE: Box = around(
  [
    [0.106, 0.0, 0.028],
    [0.106, 0.0, -0.034],
    [0.143, 0.003, 0.022],
    [0.135, 0.003, -0.032],
  ].map((p) => toWorld(FOOT_R, R_ANKLE, p as unknown as V3)),
  0.0095,
);

/** The robe's hem round the right ankle: a short band a little proud of the shin. */
function ankleHem(): Shape {
  const axis = norm(sub(R_ANKLE, R_KNEE));
  const at = sub(R_ANKLE, mul(axis, 0.016));
  return limb(sub(at, mul(axis, 0.004)), add(at, mul(axis, 0.004)), 0.0305, 0.0305);
}

// ── Arms and hands ────────────────────────────────────────────────────────

/** A hand, in figure space. */
interface HandPose {
  /** The wrist's middle. */
  at: V3;
  /** Towards the knuckles. */
  along: V3;
  /** The way the back of the hand faces. */
  back: V3;
  /** The side the thumb is on. */
  thumbSide: V3;
  /** Finger bend (rad, towards the palm) at the knuckles and at the middle joints. */
  bend: [number, number];
  /** Where the thumb's tip is (figure space); default along the index finger. */
  thumbTip?: V3;
}

interface ArmPose {
  shoulder: V3;
  elbow: V3;
  hand: HandPose;
}

/** Long smooth arms: shoulder, elbow, wrist, tapering, no muscles (the upper arm and the forearm in two). */
function armParts(a: ArmPose): Shape[] {
  const mid = add(a.elbow, mul(sub(a.hand.at, a.elbow), 0.3));
  return [limb(a.shoulder, a.elbow, 0.036, 0.0245), limb(a.elbow, mid, 0.0245, 0.024), limb(mid, a.hand.at, 0.024, 0.0158)];
}

/** The left arm's robe, as a paint: the arm's surface from the shoulder to the hem at the wrist. */
function sleeve(a: ArmPose): Shape {
  const axis = norm(sub(a.hand.at, a.elbow));
  const end = sub(a.hand.at, mul(axis, 0.026));
  const inner = union([limb(a.shoulder, a.elbow, 0.04, 0.028), limb(a.elbow, end, 0.028, 0.019)], 0.02);
  return { d: (x, y, z) => Math.abs(inner.d(x, y, z)) - 0.007, box: growBox(inner.box, 0.007) };
}

/** The robe's hem round the left wrist: a short band a little proud of the forearm. */
function wristHem(a: ArmPose): Shape {
  const axis = norm(sub(a.hand.at, a.elbow));
  const at = sub(a.hand.at, mul(axis, 0.026));
  return limb(sub(at, mul(axis, 0.003)), add(at, mul(axis, 0.003)), 0.0208, 0.0208);
}

/** The hand's frame: x to the knuckles, y out of the back of the hand, z to the thumb. */
const handFrame = (h: HandPose): Rot => frame(h.along, h.back, h.thumbSide);

/**
 * A Buddha's hand: slender, the palm smooth, four fingers of nearly equal
 * length (one of his marks), round and tapering, lying close together.
 */
function hand(h: HandPose): Shape {
  return handParts(h).shape;
}

/** The hand's shape and, in figure space, the points that bound its fingers and thumb (knuckles, joints, tips). */
function handParts(h: HandPose): { shape: Shape; points: V3[] } {
  const R = handFrame(h);
  const [b1, b2] = h.bend;
  const pts: V3[] = [];
  const fingers: Shape[] = [];
  // (knuckle x, across z, length: nearly equal)
  const rows = [
    [0.07, 0.0203, 0.061],
    [0.072, 0.0068, 0.063],
    [0.07, -0.0068, 0.061],
    [0.066, -0.0203, 0.057],
  ];
  for (const [x, z, l] of rows) {
    const base: V3 = [x, 0, z];
    // (close together, the tips a little nearer than the knuckles)
    const j = add(base, [Math.cos(b1) * l * 0.48, -Math.sin(b1) * l * 0.48, -z * 0.05]);
    const tip = add(j, [Math.cos(b1 + b2) * l * 0.52, -Math.sin(b1 + b2) * l * 0.52, -z * 0.08]);
    fingers.push(limb(base, j, 0.0071, 0.0066), limb(j, tip, 0.0066, 0.0059));
    pts.push(base, j, tip);
  }
  const tipL = h.thumbTip ? toLocal(R, h.at, h.thumbTip) : ([0.064, -0.006, 0.031] as V3);
  const root: V3 = [0.012, -0.006, 0.019];
  const knuckle: V3 = [0.036, -0.008, 0.032];
  const mid = add(lerp(knuckle, tipL, 0.5), [0, 0.001, 0.0015]);
  const thumb = [limb(root, knuckle, 0.011, 0.0086), limb(knuckle, mid, 0.0086, 0.0074), limb(mid, tipL, 0.0074, 0.0062)];
  pts.push(knuckle, mid, tipL);
  const shape = union(
    [
      ell([0.0, 0.0, 0.0], [0.02, 0.012, 0.02]),
      slab([0.037, 0.0005, 0], [0.036, 0.0094, 0.0275], 0.0088),
      ell([0.022, -0.004, 0.015], [0.026, 0.0105, 0.013]),
      ell([0.03, -0.003, -0.017], [0.03, 0.0095, 0.01]),
      union(fingers, 0.0015),
      ...thumb,
    ],
    0.006,
  );
  return { shape: place(shape, h.at, R), points: pts.map((p) => toWorld(R, h.at, p)) };
}

/** Box round points (m), grown by `by`. */
function around(points: V3[], by: number): Box {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const p of points)
    for (let i = 0; i < 3; i++) {
      b[i] = Math.min(b[i], p[i] - by);
      b[i + 3] = Math.max(b[i + 3], p[i] + by);
    }
  return b as unknown as Box;
}

/** The box a hand is meshed fine in: round the fingers and thumb, its sides across the plain palm. */
function handZone(a: ArmPose): Box {
  return around(handParts(a.hand).points, 0.0095);
}

const L_SHOULDER: V3 = [FIG.shoulder[0] + 0.012, FIG.shoulder[1] - 0.025, FIG.shoulder[2] + 0.004];
const R_SHOULDER: V3 = [-L_SHOULDER[0], L_SHOULDER[1], L_SHOULDER[2]];
const L_ELBOW: V3 = [0.262, 0.15, 0.028];
const R_ELBOW: V3 = [-0.262, 0.15, 0.028];

const ARMS: Record<Mudra, { left: ArmPose; right: ArmPose; zones: Box[] }> = (() => {
  // Calling the earth to witness: the left hand in the lap palm up, the
  // right hand over the right knee, its fingers down to the throne.
  const lap: HandPose = { at: [0.076, 0.118, 0.13], along: [-1, 0, 0.06], back: [0, -1, 0], thumbSide: [0, 0, 1], bend: [0.07, 0.1] };
  const touch: HandPose = {
    at: [-0.296, 0.128, 0.2],
    along: [0.03, -0.8, 0.6],
    back: [0, 0.6, 0.8],
    thumbSide: [1, 0, 0],
    bend: [0.6, 0.12],
  };
  const earth = {
    left: { shoulder: L_SHOULDER, elbow: L_ELBOW, hand: lap },
    right: { shoulder: R_SHOULDER, elbow: R_ELBOW, hand: touch },
    zones: [] as Box[],
  };
  earth.zones = [handZone(earth.left), handZone(earth.right)];
  // Meditation: the right hand on the left, palms up, the thumbs' tips touching.
  const thumbs: V3 = [0.0, 0.148, 0.16];
  const under: HandPose = { at: [0.08, 0.115, 0.12], along: [-1, 0, 0.06], back: [0, -1, 0], thumbSide: [0, 0, 1], bend: [0.06, 0.08], thumbTip: add(thumbs, [0.005, 0, 0]) };
  const over: HandPose = {
    at: [-0.08, 0.134, 0.124],
    along: [1, -0.04, 0.06],
    back: [0, -1, 0],
    thumbSide: [0, 0, 1],
    bend: [0.05, 0.08],
    thumbTip: add(thumbs, [-0.005, 0, 0]),
  };
  const meditate = {
    left: { shoulder: L_SHOULDER, elbow: L_ELBOW, hand: under },
    right: { shoulder: R_SHOULDER, elbow: R_ELBOW, hand: over },
    zones: [] as Box[],
  };
  meditate.zones = [joinBox(handZone(meditate.left), handZone(meditate.right))];
  return { earth, meditate };
})();
