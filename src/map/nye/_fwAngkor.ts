/**
 * The signature firework's picture (AWP-35, show.ts kind `angkor`): a lotus flower with the three lotus-bud towers of
 * Angkor Wat rising from it, as on the flag of Cambodia (three towers, never five), drawn in gold sparks. Made once
 * from outlines in code into a short list of 2D points (`ANGKOR_POINTS`, ≤ 256) in the order they are drawn: the
 * fireworks' vertex shader (`_fwShaders.ts`) sends spark j of n to point ⌊j·N/n⌋ and streaks it to the next one when
 * both lie on the same outline, so fewer sparks (a lower graphics level) draw the same picture with fewer, longer
 * strokes. No three.js.
 *
 * Units: x −1‥1 across (right as the square sees it), y −1.02‥1 up; the burst's radius scales it (m).
 */

/** Points in the picture. */
export const ANGKOR_POINTS = 240;

type Pt = [number, number];

/** The towers stand on this line (the terrace the lotus holds). */
const BASE_Y = -0.36;

/**
 * A lotus-bud tower (prang) round `x` from the terrace to `top`, `w` half its foot: a straight body, then the bud
 * swelling a little and closing to its finial in four tiers (small steps in its outline).
 */
function tower(x: number, w: number, top: number): Pt[] {
  const h = top - BASE_Y;
  const half = (y: number): number => {
    const u = (y - BASE_Y) / h;
    if (u < 0.24) return w * (1 - 0.08 * (u / 0.24));
    const v = (u - 0.24) / 0.68;
    if (v >= 1) return w * 0.06 * (1 - (u - 0.92) / 0.08);
    // (the bud: a shoulder over the body, round as it closes; each of its four tiers steps in a little)
    const bud = 1.08 * w * Math.pow(1 - v, 0.6) * (1 + 0.3 * v * (1 - v));
    const step = (v * 4) % 1;
    return Math.max(w * 0.06, bud * (1 - 0.12 * Math.max(0, (step - 0.65) / 0.35)));
  };
  const up: Pt[] = [];
  for (let i = 0; i <= 60; i++) {
    const y = BASE_Y + (h * i) / 60;
    up.push([x - half(y), y]);
  }
  const down = up.map(([px, py]) => [2 * x - px, py] as Pt).reverse();
  return [...up, [x, top + 0.02], ...down];
}

/** A lotus petal along `deg` from upright, `len` long, `w` its half width: its half width `along` its length from the foot (0 outside it). */
function petalHalf(along: number, len: number, w: number): number {
  const t = along / len;
  return t <= 0 || t >= 1 ? 0 : w * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.75) * (1 - 0.25 * t);
}

type Petal = { deg: number; len: number; w: number };
/** The flower's five petals, fanned from its foot. */
const PETALS: Petal[] = [-64, -32, 0, 32, 64].map((deg) => ({ deg, len: Math.abs(deg) > 40 ? 0.6 : deg === 0 ? 0.64 : 0.72, w: Math.abs(deg) > 40 ? 0.15 : 0.18 }));
const FOOT = -1.02;

/** The flower's outline: round its fan of petals from the foot and back, petal tip by petal tip (the farthest any petal reaches along each ray). */
function lotus(): Pt[] {
  const pts: Pt[] = [[0, FOOT]];
  for (let i = 0; i <= 120; i++) {
    const th = ((-96 + (192 * i) / 120) * Math.PI) / 180;
    let reach = 0;
    for (const p of PETALS) {
      const phi = th - (p.deg * Math.PI) / 180;
      for (let r = 0.005; r < p.len; r += 0.005) {
        if (Math.abs(r * Math.sin(phi)) <= petalHalf(r * Math.cos(phi), p.len, p.w)) reach = Math.max(reach, r);
      }
    }
    if (reach > 0.01) pts.push([Math.sin(th) * reach, FOOT + Math.cos(th) * reach]);
  }
  pts.push([0, FOOT]);
  return pts;
}

/** One petal's outline (the middle one, inside the flower's). */
function petal(p: Petal): Pt[] {
  const a = (p.deg * Math.PI) / 180;
  const pts: Pt[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i <= 20 ? i / 20 : 2 - i / 20;
    const side = i <= 20 ? -1 : 1;
    const half = petalHalf(t * p.len, p.len, p.w) * side;
    pts.push([Math.sin(a) * p.len * t + Math.cos(a) * half, FOOT + Math.cos(a) * p.len * t - Math.sin(a) * half]);
  }
  return pts;
}

/** The outlines: the three towers (the middle tallest), the terrace, the lotus round its five petals, its middle petal. */
function outlines(): { pts: Pt[]; tower: boolean }[] {
  return [
    { pts: tower(0, 0.17, 0.98), tower: true },
    { pts: tower(-0.46, 0.12, 0.42), tower: true },
    { pts: tower(0.46, 0.12, 0.42), tower: true },
    { pts: [[-0.7, BASE_Y], [0.7, BASE_Y]], tower: true },
    { pts: lotus(), tower: false },
    { pts: petal(PETALS[2]), tower: false },
  ];
}

const lengthOf = (pts: Pt[]): number => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

/** `k` points evenly along an outline (by its length), both ends kept. */
function resample(pts: Pt[], k: number): Pt[] {
  const total = lengthOf(pts);
  const out: Pt[] = [];
  let seg = 1;
  let acc = 0;
  for (let i = 0; i < k; i++) {
    const want = (total * i) / (k - 1);
    while (seg < pts.length - 1 && acc + Math.hypot(pts[seg][0] - pts[seg - 1][0], pts[seg][1] - pts[seg - 1][1]) < want) {
      acc += Math.hypot(pts[seg][0] - pts[seg - 1][0], pts[seg][1] - pts[seg - 1][1]);
      seg++;
    }
    const a = pts[seg - 1];
    const b = pts[seg];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t = Math.min(1, Math.max(0, (want - acc) / l));
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/**
 * The picture as RGBA floats, a point each (`ANGKOR_POINTS`): x, y, its outline's number (strokes join only within
 * one), 1 on a tower or the terrace / 0 on a petal (the burst's two colours).
 */
export function angkorShape(): Float32Array {
  const lines = outlines();
  const lens = lines.map((l) => lengthOf(l.pts));
  const total = lens.reduce((a, b) => a + b, 0);
  // (points by length; the rounding's leftover to the tallest tower)
  const counts = lens.map((l) => Math.max(4, Math.floor((ANGKOR_POINTS * l) / total)));
  counts[0] += ANGKOR_POINTS - counts.reduce((a, b) => a + b, 0);
  const out = new Float32Array(ANGKOR_POINTS * 4);
  let o = 0;
  lines.forEach((line, id) => {
    for (const [x, y] of resample(line.pts, counts[id])) {
      out[o++] = x;
      out[o++] = y;
      out[o++] = id;
      out[o++] = line.tower ? 1 : 0;
    }
  });
  return out;
}
