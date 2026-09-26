/**
 * Signed distance shapes for sculpting statues (sculpt.ts): each shape gives
 * the distance (m) from a point to its surface, negative inside, and the box
 * it fills, so the sculpt skips shapes far from the point it asks about.
 *
 * Statue space: metres, +y up, the statue faces +z, its foot at y = 0 on
 * its axis. Most formulas are Inigo Quilez's (iquilezles.org, "distance
 * functions").
 */

export type V3 = readonly [number, number, number];
/** [x0, y0, z0, x1, y1, z1] (m). */
export type Box = readonly [number, number, number, number, number, number];

export interface Shape {
  /** Signed distance (m) at (x, y, z): negative inside. */
  d(x: number, y: number, z: number): number;
  /** Box the shape fills (m). */
  box: Box;
}

/** A rotation (row-major 3 × 3) from Euler angles in radians: yaw about y, then pitch about x, then roll about z. */
export type Rot = readonly [number, number, number, number, number, number, number, number, number];

export function rot(yaw = 0, pitch = 0, roll = 0): Rot {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  // R = Ry · Rx · Rz
  return [
    cy * cr + sy * sp * sr,
    -cy * sr + sy * sp * cr,
    sy * cp,
    cp * sr,
    cp * cr,
    -sp,
    -sy * cr + cy * sp * sr,
    sy * sr + cy * sp * cr,
    cy * cp,
  ];
}

/** Polynomial smooth minimum: blends two distances over `k` m. */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Smooth maximum (for cuts and intersections). */
export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

/** Distance from a point to a box (0 inside): a lower bound on any shape inside the box. */
export function boxDist(b: Box, x: number, y: number, z: number): number {
  const dx = Math.max(b[0] - x, 0, x - b[3]);
  const dy = Math.max(b[1] - y, 0, y - b[4]);
  const dz = Math.max(b[2] - z, 0, z - b[5]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const around = (c: V3, r: number): Box => [c[0] - r, c[1] - r, c[2] - r, c[0] + r, c[1] + r, c[2] + r];
const joinBoxes = (boxes: Box[], pad = 0): Box => {
  const o = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const b of boxes)
    for (let i = 0; i < 3; i++) {
      o[i] = Math.min(o[i], b[i] - pad);
      o[i + 3] = Math.max(o[i + 3], b[i + 3] + pad);
    }
  return o as unknown as Box;
};

// ── Primitives ────────────────────────────────────────────────────────────

export function sphere(c: V3, r: number): Shape {
  const [cx, cy, cz] = c;
  return {
    d(x, y, z) {
      const dx = x - cx;
      const dy = y - cy;
      const dz = z - cz;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
    },
    box: around(c, r),
  };
}

/** An ellipsoid with radii `r` along its own axes, turned by `R` (a bound, close near the surface). */
export function ellipsoid(c: V3, r: V3, R?: Rot): Shape {
  const [cx, cy, cz] = c;
  const [rx, ry, rz] = r;
  const m = Math.max(rx, ry, rz);
  return {
    d(x, y, z) {
      let px = x - cx;
      let py = y - cy;
      let pz = z - cz;
      if (R) [px, py, pz] = [R[0] * px + R[3] * py + R[6] * pz, R[1] * px + R[4] * py + R[7] * pz, R[2] * px + R[5] * py + R[8] * pz];
      const ax = px / rx;
      const ay = py / ry;
      const az = pz / rz;
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
      const bx = ax / rx;
      const by = ay / ry;
      const bz = az / rz;
      const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
      return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
    },
    box: around(c, m),
  };
}

/** A capsule: all points within `r` of the segment a–b. */
export function capsule(a: V3, b: V3, r: number): Shape {
  return cone(a, b, r, r);
}

/** A rounded cone: radius `ra` at a, `rb` at b, joined smoothly. */
export function cone(a: V3, b: V3, ra: number, rb: number): Shape {
  const [ax, ay, az] = a;
  const bx = b[0] - ax;
  const by = b[1] - ay;
  const bz = b[2] - az;
  const l2 = bx * bx + by * by + bz * bz;
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / Math.max(l2, 1e-12);
  return {
    d(x, y, z) {
      const px = x - ax;
      const py = y - ay;
      const pz = z - az;
      const yv = px * bx + py * by + pz * bz;
      const zv = yv - l2;
      const qx = px * l2 - bx * yv;
      const qy = py * l2 - by * yv;
      const qz = pz * l2 - bz * yv;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yv * yv * l2;
      const z2 = zv * zv * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zv) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
      if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
      return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - ra;
    },
    box: joinBoxes([around(a, ra), around(b, rb)]),
  };
}

/** A box with half-sizes `h`, its edges rounded by `r` (inside the half-sizes), turned by `R`. */
export function roundBox(c: V3, h: V3, r = 0, R?: Rot): Shape {
  const [cx, cy, cz] = c;
  const hx = h[0] - r;
  const hy = h[1] - r;
  const hz = h[2] - r;
  const m = Math.hypot(h[0], h[1], h[2]);
  return {
    d(x, y, z) {
      let px = x - cx;
      let py = y - cy;
      let pz = z - cz;
      if (R) [px, py, pz] = [R[0] * px + R[3] * py + R[6] * pz, R[1] * px + R[4] * py + R[7] * pz, R[2] * px + R[5] * py + R[8] * pz];
      const qx = Math.abs(px) - hx;
      const qy = Math.abs(py) - hy;
      const qz = Math.abs(pz) - hz;
      const ox = qx > 0 ? qx : 0;
      const oy = qy > 0 ? qy : 0;
      const oz = qz > 0 ? qz : 0;
      const out = Math.sqrt(ox * ox + oy * oy + oz * oz);
      return out + Math.min(Math.max(qx, qy, qz), 0) - r;
    },
    box: R ? around(c, m) : [cx - h[0], cy - h[1], cz - h[2], cx + h[0], cy + h[1], cz + h[2]],
  };
}

/** A torus: ring radius `R` round the axis through `c` (turned by `rt` from +y), tube radius `r`. */
export function torus(c: V3, ring: number, r: number, rt?: Rot): Shape {
  const [cx, cy, cz] = c;
  return {
    d(x, y, z) {
      let px = x - cx;
      let py = y - cy;
      let pz = z - cz;
      if (rt) [px, py, pz] = [rt[0] * px + rt[3] * py + rt[6] * pz, rt[1] * px + rt[4] * py + rt[7] * pz, rt[2] * px + rt[5] * py + rt[8] * pz];
      const q = Math.sqrt(px * px + pz * pz) - ring;
      return Math.sqrt(q * q + py * py) - r;
    },
    box: around(c, ring + r),
  };
}

/** An upright cylinder (axis +y through `c`), radius `r`, half-height `h`, edges rounded by `round`. */
export function cylinder(c: V3, r: number, h: number, round = 0): Shape {
  const [cx, cy, cz] = c;
  return {
    d(x, y, z) {
      const ex = x - cx;
      const ez = z - cz;
      const dx = Math.sqrt(ex * ex + ez * ez) - (r - round);
      const dy = Math.abs(y - cy) - (h - round);
      const ox = dx > 0 ? dx : 0;
      const oy = dy > 0 ? dy : 0;
      return Math.min(Math.max(dx, dy), 0) + Math.sqrt(ox * ox + oy * oy) - round;
    },
    box: [cx - r, cy - h, cz - r, cx + r, cy + h, cz + r],
  };
}

// ── Combining shapes ──────────────────────────────────────────────────────

/** The shapes as one, blended over `k` m where they meet. */
export function union(shapes: Shape[], k = 0): Shape {
  const n = shapes.length;
  return {
    d(x, y, z) {
      let d = Infinity;
      for (let i = 0; i < n; i++) {
        const s = shapes[i];
        if (boxDist(s.box, x, y, z) >= d + k) continue;
        d = smin(d, s.d(x, y, z), k);
      }
      return d;
    },
    box: joinBoxes(
      shapes.map((s) => s.box),
      k * 0.25,
    ),
  };
}

/** `a` with `b` cut out of it, the cut's edge rounded over `k` m. */
export function subtract(a: Shape, b: Shape, k = 0): Shape {
  return {
    d(x, y, z) {
      const da = a.d(x, y, z);
      if (boxDist(b.box, x, y, z) >= -da + k) return da;
      return smax(da, -b.d(x, y, z), k);
    },
    box: a.box,
  };
}

/** Only where `a` and `b` overlap. */
export function intersect(a: Shape, b: Shape, k = 0): Shape {
  const ab = a.box;
  const bb = b.box;
  return {
    d: (x, y, z) => smax(a.d(x, y, z), b.d(x, y, z), k),
    box: [Math.max(ab[0], bb[0]), Math.max(ab[1], bb[1]), Math.max(ab[2], bb[2]), Math.min(ab[3], bb[3]), Math.min(ab[4], bb[4]), Math.min(ab[5], bb[5])],
  };
}

/** The shape grown (`by` > 0) or shrunk (`by` < 0) by `by` m all round. */
export function grow(s: Shape, by: number): Shape {
  const b = s.box;
  const p = Math.max(by, 0);
  return { d: (x, y, z) => s.d(x, y, z) - by, box: [b[0] - p, b[1] - p, b[2] - p, b[3] + p, b[4] + p, b[5] + p] };
}

/** A hollow skin `t` m thick round the shape's surface (cloth over a body). */
export function shell(s: Shape, t: number): Shape {
  const b = s.box;
  return { d: (x, y, z) => Math.abs(s.d(x, y, z)) - t, box: [b[0] - t, b[1] - t, b[2] - t, b[3] + t, b[4] + t, b[5] + t] };
}

/**
 * The shape's surface pushed out by `amp` · f(x, y, z) (f in −1‥1): folds,
 * curls, petal ridges. Keep the bumps wider than they are tall, or the
 * distance stops being one.
 */
export function displace(s: Shape, f: (x: number, y: number, z: number) => number, amp: number): Shape {
  const b = s.box;
  const a = Math.abs(amp);
  return {
    d(x, y, z) {
      const d = s.d(x, y, z);
      // (far from the surface the bumps do not matter)
      return d > a * 2 ? d - a : d - amp * f(x, y, z);
    },
    box: [b[0] - a, b[1] - a, b[2] - a, b[3] + a, b[4] + a, b[5] + a],
  };
}

/** The shape and its mirror image across x = 0 (both ears, both eyes). Make the shape on the +x side. */
export function mirrorX(s: Shape): Shape {
  const b = s.box;
  const m = Math.max(Math.abs(b[0]), Math.abs(b[3]));
  return { d: (x, y, z) => s.d(Math.abs(x), y, z), box: [-m, b[1], b[2], m, b[4], b[5]] };
}

/** The shape moved by `t` and turned by `R` about the point `about` (statue space). */
export function place(s: Shape, t: V3, R?: Rot, about: V3 = [0, 0, 0]): Shape {
  const [ox, oy, oz] = about;
  const [tx, ty, tz] = t;
  const b = s.box;
  let box: Box;
  if (!R) box = [b[0] + tx, b[1] + ty, b[2] + tz, b[3] + tx, b[4] + ty, b[5] + tz];
  else {
    // The turned box's corners, boxed again.
    const pts: V3[] = [];
    for (const x of [b[0], b[3]])
      for (const y of [b[1], b[4]])
        for (const z of [b[2], b[5]]) {
          const px = x - ox;
          const py = y - oy;
          const pz = z - oz;
          pts.push([R[0] * px + R[1] * py + R[2] * pz + ox + tx, R[3] * px + R[4] * py + R[5] * pz + oy + ty, R[6] * px + R[7] * py + R[8] * pz + oz + tz]);
        }
    box = joinBoxes(pts.map((p) => [p[0], p[1], p[2], p[0], p[1], p[2]] as Box));
  }
  return {
    d(x, y, z) {
      let px = x - tx - ox;
      let py = y - ty - oy;
      let pz = z - tz - oz;
      // (the inverse of a rotation is its transpose)
      if (R) [px, py, pz] = [R[0] * px + R[3] * py + R[6] * pz, R[1] * px + R[4] * py + R[7] * pz, R[2] * px + R[5] * py + R[8] * pz];
      return s.d(px + ox, py + oy, pz + oz);
    },
    box,
  };
}

/** Lattice hash for `noise3`: −1‥1. */
function lattice(i: number, j: number, k: number): number {
  let n = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) & 0xffff) / 32767.5 - 1;
}

/** A smooth value noise in −1‥1 (for surface bumps; deterministic). */
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const a0 = lattice(xi, yi, zi);
  const a1 = lattice(xi + 1, yi, zi);
  const b0 = lattice(xi, yi + 1, zi);
  const b1 = lattice(xi + 1, yi + 1, zi);
  const c0 = lattice(xi, yi, zi + 1);
  const c1 = lattice(xi + 1, yi, zi + 1);
  const d0 = lattice(xi, yi + 1, zi + 1);
  const d1 = lattice(xi + 1, yi + 1, zi + 1);
  const ab0 = a0 + (a1 - a0) * u;
  const ab1 = b0 + (b1 - b0) * u;
  const cd0 = c0 + (c1 - c0) * u;
  const cd1 = d0 + (d1 - d0) * u;
  const lo = ab0 + (ab1 - ab0) * v;
  const hi = cd0 + (cd1 - cd0) * v;
  return lo + (hi - lo) * w;
}
