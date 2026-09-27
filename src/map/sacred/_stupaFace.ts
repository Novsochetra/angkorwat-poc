import type { Sculpt } from './sculpt';
import { capsule, cone, ellipsoid, sphere, union, type Box, type Shape, type V3 } from './sdf';

/**
 * The four faces of a Khmer face stupa (stupa.ts, form `faces`): the smiling
 * faces of the Bayon's towers (Jayavarman VII's, and the faces on Oudong's
 * royal stupas), one on each side of a square stage, looking to the four
 * directions. Broad and calm, the brows joined in one line, the eyes
 * lowered under heavy lids, a broad short nose, full lips in the gentle
 * smile of Angkor with the corners turned up, long ear lobes with round
 * earrings, a diadem of flowers across the brow. Carved in relief: the
 * face stands a seventh of its height proud of the stage's side.
 *
 * Each feature is drawn once, on one side (`u` across it from its middle,
 * `v` up from the face's middle, `w` out from the side; in face heights),
 * and the square's eightfold symmetry puts it on all four (`onFaces`).
 */

/** Where the faces go: the stage's side (m from the axis), the faces' middle (height, m), and their height, chin to diadem (m). */
export interface FaceSpec {
  wall: number;
  y: number;
  height: number;
}

/**
 * A shape drawn in one side's frame (u across ≥ 0, v up from `y`, w out
 * from the side at `wall`; m), put on all four sides: each point is folded
 * into the side it faces (the square's eightfold symmetry).
 */
function onFaces(s: Shape, wall: number, y: number): Shape {
  const b = s.box;
  const R = wall + b[5];
  return {
    d(x, yy, z) {
      const ax = Math.abs(x);
      const az = Math.abs(z);
      return ax >= az ? s.d(az, yy - y, ax - wall) : s.d(ax, yy - y, az - wall);
    },
    box: [-R, y + b[1], -R, R, y + b[4], R],
  };
}

/** The brow line (u, v in face heights), from over the nose out to the temple: joined over the nose, dipping there a little (a gull's wing). */
const BROW: [number, number][] = [
  [0, 0.205],
  [0.07, 0.228],
  [0.17, 0.238],
  [0.27, 0.214],
  [0.36, 0.16],
];

/** The brow line's height at u (face heights). */
function browAt(u: number): number {
  for (let i = 1; i < BROW.length; i++)
    if (u <= BROW[i][0]) {
      const [u0, v0] = BROW[i - 1];
      const [u1, v1] = BROW[i];
      return v0 + ((v1 - v0) * (u - u0)) / (u1 - u0);
    }
  return BROW[BROW.length - 1][1];
}

/**
 * Adds the four faces to the sculpt (regions `face` and `diadem`; painted
 * `eye` for the lids' slits and the line of the mouth, `brow`, `lip`), and
 * the stage round them as a fine zone (the eyes and the lips need the fine
 * grid): `spec.y` ± 0.49 face heights should be the stage's plain side.
 */
export function addBayonFaces(s: Sculpt, spec: FaceSpec): void {
  const H = spec.height;
  const P = (u: number, v: number, w: number): V3 => [u * H, v * H, w * H];
  const r = (k: number) => k * H;
  // The face's mask: a broad, flat oval standing out of the side (face heights), the cheeks and the jaw full.
  const M = { u: 0.66, v: 0.58, w: 0.42, back: -0.32 };
  /** Depth of the mask's front (w) at (u, v): the features sit on it. */
  const front = (u: number, v: number) => M.back + M.w * Math.sqrt(Math.max(0, 1 - (u / M.u) ** 2 - (v / M.v) ** 2));
  /** A point on the mask's front, `out` in front of it (m). */
  const on = (u: number, v: number, out = 0): V3 => P(u, v, front(u, v) + out);
  const F = (sh: Shape) => onFaces(sh, spec.wall, spec.y);
  const chain = (pts: [number, number][], rad: number, out: number): Shape[] => {
    const o: Shape[] = [];
    for (let i = 0; i + 1 < pts.length; i++) o.push(capsule(on(pts[i][0], pts[i][1], out), on(pts[i + 1][0], pts[i + 1][1], out), r(rad)));
    return o;
  };

  s.add(
    F(
      union(
        [
          ellipsoid(P(0, 0, M.back), [r(M.u), r(M.v), r(M.w)]),
          // (full cheeks and a broad jaw: a Bayon face is nearly square)
          ellipsoid(on(0.22, -0.1, -0.09), [r(0.2), r(0.22), r(0.11)]),
          ellipsoid(on(0, -0.3, -0.08), [r(0.3), r(0.14), r(0.09)]),
        ],
        r(0.08),
      ),
    ),
    'face',
    // (blended well into the side: the face comes out of the stone, as carved)
    r(0.07),
  );
  // The features, blended into the mask.
  const features: Shape[] = [
    // The brows, joined in one line over the nose, arching out and down to the temples: a sharp ridge.
    ...chain(BROW, 0.02, -0.008),
    // The heavy lowered upper lids, their foot a gentle curve.
    ellipsoid(on(0.15, 0.116, -0.02), [r(0.1), r(0.034), r(0.028)]),
    // The nose: broad and short, its bridge flat, the wings of the nostrils round.
    cone(on(0, 0.17, -0.018), on(0, -0.035, 0.045), r(0.03), r(0.06)),
    ellipsoid(on(0.062, -0.05, 0.008), [r(0.05), r(0.034), r(0.034)]),
    // The lips: the upper one wide along the smile (its corners up), the lower one fuller.
    ...chain(
      [
        [0, -0.192],
        [0.08, -0.2],
        [0.165, -0.178],
      ],
      0.024,
      -0.004,
    ),
    capsule(on(0, -0.238, 0), on(0.1, -0.228, -0.006), r(0.03)),
    // The chin.
    ellipsoid(on(0, -0.36, -0.02), [r(0.15), r(0.075), r(0.05)]),
    // The long ear lobes, flat against the side beyond the mask, stretched by their earrings.
    ellipsoid(P(0.49, -0.02, -0.005), [r(0.06), r(0.21), r(0.03)]),
  ];
  s.add(F(union(features, r(0.016))), 'face', r(0.012));
  // The hollows over the lids, under the brow line; the corners of the smile.
  s.carve(F(union([ellipsoid(on(0.15, 0.17, 0.012), [r(0.09), r(0.026), r(0.024)]), sphere(on(0.17, -0.19, 0.02), r(0.012))])), r(0.012));
  // The diadem: a half-round band across the brow hugging the mask, swelling in a row of rosettes; the round earrings.
  const DIADEM = { v: 0.345, half: 0.045, step: 0.15 };
  const band: Shape = {
    d(u, v, w) {
      const t = (v - r(DIADEM.v)) / r(DIADEM.half);
      if (Math.abs(t) >= 1) return Math.max(Math.abs(v - r(DIADEM.v)) - r(DIADEM.half), 0.001);
      const c = Math.cos((Math.PI * u) / r(DIADEM.step));
      const bump = c > 0 ? c * c : 0;
      const top = r(front(u / H, v / H) + (0.018 + 0.02 * bump) * Math.sqrt(1 - t * t));
      return Math.max(w - top, r(front(u / H, v / H) - 0.05) - w, u - r(0.5));
    },
    box: [0, r(DIADEM.v - DIADEM.half), r(M.back), r(0.5), r(DIADEM.v + DIADEM.half), r(M.back + M.w + 0.05)],
  };
  s.add(F(union([band, ellipsoid(P(0.49, -0.25, 0.01), [r(0.045), r(0.045), r(0.022)])], r(0.006))), 'diadem', r(0.006));

  // Painted: the lids' slits and the line of the mouth, the brow line, the lips.
  const cut = (d: Shape['d'], box: Box): Shape => F({ d, box });
  s.paint(F(ellipsoid(on(0.15, 0.093, 0), [r(0.095), r(0.013), r(0.2)])), 'eye');
  s.paint(
    cut((u, v, w) => Math.max(Math.abs(v - r(browAt(u / H))) - r(0.022), u - r(0.36), Math.abs(w) - r(0.3)), [0, r(0.1), r(-0.3), r(0.37), r(0.28), r(0.3)]),
    'brow',
  );
  s.paint(
    cut((u, v, w) => Math.max((Math.hypot(u / r(0.175), (v + r(0.214)) / r(0.058)) - 1) * r(0.058), Math.abs(w) - r(0.3)), [0, r(-0.28), r(-0.3), r(0.18), r(-0.15), r(0.3)]),
    'lip',
  );
  s.paint(
    cut((u, v, w) => Math.max(Math.abs(v - r(-0.212 + 0.75 * (u / H) ** 2)) - r(0.008), u - r(0.15), Math.abs(w) - r(0.3)), [0, r(-0.24), r(-0.3), r(0.16), r(-0.17), r(0.3)]),
    'eye',
  );

  // The whole stage on the fine grid, all round (the seams then lie in the creases of its foot and its
  // cornice, not round each face): from under the chins to over the diadems.
  const R = spec.wall + r(0.3);
  s.fine([-R, spec.y - r(0.49), -R, R, spec.y + r(0.49), R]);
}
