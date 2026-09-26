import type { Sculpt } from './sculpt';
import { boxDist, cone, grow, mirrorX, place, rot, smax, smin, subtract, union, type Rot, type Shape, type V3 } from './sdf';
import { FIG, type Throne } from './_buddhaFrame';

/**
 * The Buddha's throne (figure space, _buddhaFrame.ts): below y = 0, where
 * he sits, facing +z. `addThrone` returns its height (m): the statue's foot
 * is at y = −height.
 *
 * - `lotus`: the double lotus of the pagoda Buddhas (padmasana): a cushion,
 *   two staggered rows of upturned petals (round-shouldered, pointed, a
 *   raised rim round each and the middle swelling like a smaller petal
 *   inside it), a narrow waist with a string of beads, a row of downturned
 *   petals, and a plinth in two steps with gold rolls along their edges
 *   (red lacquer in the gilt palette). Oval, wider than deep.
 * - `naga`: the naga Muchalinda of Angkor: he sits on three coils of the
 *   serpent's scaly body (on a low plinth); the body rises behind his back
 *   and opens into a hood of seven cobra heads round his head, the middle
 *   one highest over his ushnisha, each with a flame-like crest, looking
 *   forward.
 *
 * The rings of a throne share one oval, so each is one shape whose parts
 * share the point's place round it (`OvalAt`); rows of petals, scales,
 * ribs and heads look only at the one or two nearest a point. That keeps
 * the sculpt quick. The red lacquer and the naga's eyes are painted on.
 */

const DEG = Math.PI / 180;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (v: number) => {
  const t = clamp(v, 0, 1);
  return t * t * (3 - 2 * t);
};
/** Lengths of 2- and 3-vectors (Math.hypot is several times slower in the sculpt's hot loops). */
const len2 = (a: number, b: number) => Math.sqrt(a * a + b * b);
const len3 = (a: number, b: number, c: number) => Math.sqrt(a * a + b * b + c * c);
/** atan2 to about 0.0002 rad (quicker than Math.atan2; for placing petals, scales and heads). */
function atan2(y: number, x: number): number {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const mx = ax > ay ? ax : ay;
  if (mx === 0) return 0;
  const t = (ax > ay ? ay : ax) / mx;
  const s = t * t;
  let r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * t + t;
  if (ay > ax) r = 1.5707963267948966 - r;
  if (x < 0) r = 3.141592653589793 - r;
  return y < 0 ? -r : r;
}

// ── Ovals ─────────────────────────────────────────────────────────────────

/** Arc length (m) round the ellipse (a, b), from θ = −π to the "elliptic angle" θ = atan2(z / b, x / a). */
function arcOf(a: number, b: number): { at(th: number): number; total: number } {
  const N = 512;
  const L = new Float64Array(N + 1);
  const dt = (2 * Math.PI) / N;
  for (let k = 0; k < N; k++) {
    const th = -Math.PI + (k + 0.5) * dt;
    L[k + 1] = L[k] + len2(a * Math.sin(th), b * Math.cos(th)) * dt;
  }
  return {
    total: L[N],
    at(th) {
      const f = (th + Math.PI) / dt;
      const k = f < 0 ? 0 : f >= N ? N - 1 : Math.floor(f);
      return L[k] + (L[k + 1] - L[k]) * (f - k);
    },
  };
}

/**
 * Where a point is round the oval A × B on the axis, worked out once and
 * shared by every ring of a throne: how far out from the oval scaled by s,
 * or grown by some metres, and how far round it.
 */
class OvalAt {
  y = 0;
  private x = 0;
  private z = 0;
  /** 1 on the oval, 0 on the axis; metres per unit of it here. */
  private k = 0;
  private m = 0;
  private arcAt = NaN;
  readonly arc: ReturnType<typeof arcOf>;
  private readonly iA: number;
  private readonly iB: number;

  constructor(
    readonly A: number,
    readonly B: number,
  ) {
    this.arc = arcOf(A, B);
    this.iA = 1 / A;
    this.iB = 1 / B;
  }

  set(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    const u = x * this.iA;
    const v = z * this.iB;
    this.k = Math.sqrt(u * u + v * v);
    const k1 = Math.sqrt(u * u * this.iA * this.iA + v * v * this.iB * this.iB);
    this.m = k1 > 1e-9 ? this.k / k1 : this.B;
    this.arcAt = NaN;
  }

  /** Distance (m) out from the oval scaled by s (A·s × B·s). */
  scaled(s: number): number {
    return (this.k - s) * this.m;
  }

  /** Distance (m) out from the oval grown by `by` m all round (shrunk if negative). */
  grown(by: number): number {
    return (this.k - 1) * this.m - by;
  }

  /** How far round the oval (m, on A × B from its −x end). */
  around(): number {
    if (Number.isNaN(this.arcAt)) this.arcAt = this.arc.at(atan2(this.z / this.B, this.x / this.A));
    return this.arcAt;
  }
}

/** A ring of a throne (a slab, a moulding, a row of petals…) between two heights. */
interface Layer {
  lo: number;
  hi: number;
  /** Blend (m) into the layers before it. */
  k: number;
  d(p: OvalAt): number;
}

/**
 * The order to look at parts in, by height band (1 cm): those at the
 * band's height first (in their own order), then the others from the
 * nearest out (up to `reach` m away) — so the first few give a close
 * distance and the far ones are skipped.
 */
function bandOrder<T>(items: T[], range: (t: T) => [number, number], lo: number, hi: number, reach = Infinity): { at(y: number): T[] } {
  const H = 0.01;
  const n = Math.max(1, Math.ceil((hi - lo) / H));
  const bands: T[][] = [];
  for (let i = 0; i < n; i++) {
    const a = lo + i * H;
    const gap = (t: T) => {
      const [l, h] = range(t);
      return Math.max(l - (a + H), a - h, 0);
    };
    bands.push(
      items
        .map((t, j) => ({ t, j, g: gap(t) }))
        .filter((e) => e.g < reach)
        .sort((p, q) => p.g - q.g || p.j - q.j)
        .map((e) => e.t),
    );
  }
  return { at: (y) => bands[clamp(Math.floor((y - lo) / H), 0, n - 1)] };
}

/** A throne's rings round the oval A × B as one shape (they blend where they meet). */
function rings(A: number, B: number, layers: Layer[], out: number): Shape {
  const p = new OvalAt(A, B);
  let lo = Infinity;
  let hi = -Infinity;
  for (const l of layers) {
    lo = Math.min(lo, l.lo);
    hi = Math.max(hi, l.hi);
  }
  const order = bandOrder(layers, (l) => [l.lo, l.hi], lo, hi);
  return {
    box: [-A - out, lo, -B - out, A + out, hi, B + out],
    d(x, y, z) {
      p.set(x, y, z);
      const list = order.at(y);
      let d = Infinity;
      for (let i = 0; i < list.length; i++) {
        const l = list[i];
        if (Math.max(l.lo - y, y - l.hi) >= d + l.k) continue;
        d = smin(d, l.d(p), l.k);
      }
      return d;
    },
  };
}

/**
 * Parts (each blended in over its own k) as one shape, looked at in
 * height-band order (`bandOrder`), those whose box is further than the best
 * so far skipped. A band leaves out parts more than `reach` m above or below
 * it: past that the distance is capped at `reach` (still a bound — the
 * sculpt only needs it exact near the surface).
 */
function pile(parts: [Shape, number][], reach = 0.1): Shape {
  const box = union(parts.map((p) => p[0])).box;
  const order = bandOrder(parts, (p) => [p[0].box[1], p[0].box[4]], box[1], box[4], reach);
  return {
    box,
    d(x, y, z) {
      const list = order.at(y);
      let d = reach;
      for (let i = 0; i < list.length; i++) {
        const [s, k] = list[i];
        if (boxDist(s.box, x, y, z) >= d + k) continue;
        d = smin(d, s.d(x, y, z), k);
      }
      return d;
    },
  };
}

/** A slab from y0 to y1, the oval grown by `by` m, its edges rounded by r. */
function slab(y0: number, y1: number, by: number, r: number, k = 0): Layer {
  const yc = (y0 + y1) / 2;
  const hh = (y1 - y0) / 2 - r;
  return {
    lo: y0,
    hi: y1,
    k,
    d(p) {
      const dx = p.grown(by - r);
      const dy = Math.abs(p.y - yc) - hh;
      return Math.min(Math.max(dx, dy), 0) + len2(Math.max(dx, 0), Math.max(dy, 0)) - r;
    },
  };
}

/** A round moulding at height y along the oval grown by `by` m, radius r. */
function moulding(y: number, by: number, r: number, k = 0): Layer {
  return { lo: y - r, hi: y + r, k, d: (p) => len2(p.grown(by), p.y - y) - r };
}

/** A string of n beads of radius r at height y along the oval grown by `by` m. */
function beads(A: number, B: number, y: number, by: number, r: number, n: number, k = 0): Layer {
  const total = arcOf(A, B).total;
  const step = (total + 2 * Math.PI * by) / n;
  return {
    lo: y - r,
    hi: y + r,
    k,
    d(p) {
      const f = (p.around() / total) * n;
      return len3(p.grown(by), p.y - y, Math.abs(f - Math.round(f)) * step) - r;
    },
  };
}

// ── Lotus petals ──────────────────────────────────────────────────────────

/** A lotus petal's half-width (share of its widest) along it, 0 root ‥ 1 tip: a rounded foot, an ogee point. */
function petalOutline(t: number): number {
  const TM = 0.42;
  if (t <= TM) {
    const q = (TM - t) / (TM + 0.25);
    return Math.sqrt(Math.max(0, 1 - q * q));
  }
  if (t >= 1) return 0;
  const q = (t - TM) / (1 - TM);
  return Math.pow(1 - q * q, 1.3);
}

interface PetalRow {
  /** Petals round the ring; where the first stands (share of a step: 0 puts one in front, 0.5 a gap). */
  n: number;
  phase: number;
  /** Root and tip heights (m): the tip above the root for upturned petals, below for downturned. */
  root: number;
  tip: number;
  /** How far (m) this row sits inside the bowl. */
  inset: number;
  /** Half-width at the widest, as a share of the step between petals (over 0.5: they overlap). */
  wide: number;
  /** Relief (m) above the bowl; thickness behind it (for free tips); the rim's width. */
  lift: number;
  back: number;
  rim: number;
  /** How high the middle swells inside the rim (share of `lift`): an inner petal. */
  swell: number;
}

/**
 * A lotus bowl: a core, and rows of petals on it, the bowl's oval scaled
 * by S(y). Each petal is round-shouldered with an ogee point, raised off
 * the bowl with a soft rim round its edge, a shallow field inside and the
 * middle swelling up again like a smaller petal (the Khmer "petal in a
 * petal"), all in slopes wide enough for the grid; a point looks only at
 * the two petals nearest it. The bowl's measures by height and the
 * petals' outline are in tables.
 */
function bowl(A: number, B: number, S: (y: number) => number, lo: number, hi: number, core: { inset: number; lo: number; hi: number }, rows: PetalRow[]): Layer {
  const total = arcOf(A, B).total;
  const slopeAt = (y: number) => (A * (S(clamp(y + 0.002, lo, hi)) - S(clamp(y - 0.002, lo, hi)))) / 0.004;
  // By height: the scale and the slant's cosine.
  const N = 200;
  const y0 = lo - 0.012;
  const dy = (hi + 0.012 - y0) / N;
  const tS = new Float64Array(N + 2);
  const tC = new Float64Array(N + 2);
  for (let k = 0; k <= N + 1; k++) {
    const y = y0 + k * dy;
    tS[k] = S(clamp(y, lo, hi));
    tC[k] = 1 / len2(1, slopeAt(y));
  }
  const g = petalOutline;
  const G = 128;
  const made = rows.map((o) => {
    // Length along the petal (m) from its root, by height (negative past the root).
    const tV = new Float64Array(N + 2);
    const kr = Math.round((o.root - y0) / dy);
    for (let k = kr + 1; k <= N + 1; k++) tV[k] = tV[k - 1] + dy / tC[k];
    for (let k = kr - 1; k >= 0; k--) tV[k] = tV[k + 1] + dy / tC[k];
    const up = o.tip > o.root ? 1 : -1;
    for (let k = 0; k <= N + 1; k++) if ((k - kr) * up < 0) tV[k] = -tV[k];
    const it = (o.tip - y0) / dy;
    const kt = Math.floor(it);
    const len = tV[kt] + (tV[kt + 1] - tV[kt]) * (it - kt);
    const step = total / o.n;
    const W = o.wide * step * S((o.root + o.tip) / 2);
    const tG = new Float64Array(G + 2);
    const tN = new Float64Array(G + 2);
    for (let k = 0; k <= G + 1; k++) {
      const t = k / G;
      tG[k] = W * g(t);
      tN[k] = 1 / len2(1, (W * (g(t + 0.005) - g(t - 0.005))) / (0.01 * len));
    }
    const dip = o.lift * 0.3;
    const swell = o.lift * o.swell;
    const rim = o.rim;
    return {
      ...o,
      tV,
      len,
      step,
      W,
      tG,
      tN,
      rlo: Math.min(o.root, o.tip) - 0.01,
      rhi: Math.max(o.root, o.tip) + 0.01,
      top: o.lift + swell,
      /** Height (m) of the petal's face by how far in from its edge (a table, 0.5 mm steps). */
      relief: Float64Array.from({ length: Math.ceil(W / 0.0005) + 2 }, (_, i) => {
        const e = i * 0.0005;
        return o.lift * smooth(e / rim) - dip * smooth((e - rim) / rim) + swell * smooth((e - 1.6 * rim) / Math.max(W - 1.6 * rim, rim));
      }),
    };
  });
  // (outer rows first: they are nearest a point on the bowl, so the rows behind are often skipped)
  made.sort((a, b) => a.inset - b.inset);
  const nRows = made.length;
  return {
    lo: y0,
    hi: hi + 0.012,
    k: 0.004,
    d(p) {
      const y = p.y;
      const f = clamp((y - y0) / dy, 0, N);
      const k = Math.min(N - 1, Math.floor(f));
      const fr = f - k;
      const s = tS[k] + (tS[k + 1] - tS[k]) * fr;
      const cs = tC[k] + (tC[k + 1] - tC[k]) * fr;
      // Out from the bowl (m).
      const w = p.scaled(s) * cs;
      let d = Math.max(w + core.inset, core.lo - y, y - core.hi);
      for (let i = 0; i < nRows; i++) {
        const r = made[i];
        const wr = w + r.inset;
        // (far off this row: skip it)
        if (Math.max(wr - r.top, r.rlo - y, y - r.rhi) >= d + 0.003 || wr < -r.back - 0.01) continue;
        const v = r.tV[k] + (r.tV[k + 1] - r.tV[k]) * fr;
        const t = clamp(v / r.len, 0, 1) * G;
        const kg = Math.min(G - 1, Math.floor(t));
        const hw = r.tG[kg] + (r.tG[kg + 1] - r.tG[kg]) * (t - kg);
        const nrm = r.tN[kg];
        const q = p.around() / r.step - r.phase;
        const near = Math.abs(q - Math.round(q));
        const rel = r.relief;
        const last = rel.length - 1;
        let best = Infinity;
        for (let j = 0; j < 2; j++) {
          const du = (j === 0 ? near : 1 - near) * r.step * s;
          // The outline (negative inside), capped at the tip and below the root.
          const d2 = Math.max((du - hw) * nrm, v - r.len, -v - 0.03);
          // (the far petal: its outline alone already rules it out)
          if (j === 1 && d2 >= best) break;
          // The face's height at -d2 in from the edge (a table).
          let h = 0;
          if (d2 < 0) {
            const e = -d2 / 0.0005;
            const ie = Math.floor(e);
            h = ie >= last ? rel[last] : rel[ie] + (rel[ie + 1] - rel[ie]) * (e - ie);
          }
          const dd = Math.max(smax(d2, (wr - h) * 0.7, 0.005), -wr - r.back);
          if (dd < best) best = dd;
        }
        d = smin(d, best, 0.003);
      }
      return d;
    },
  };
}

// ── The lotus throne ──────────────────────────────────────────────────────

/** The lotus's oval at the seat (m): LA wide (x), LB deep (z). */
const LA = FIG.seatHalf[0] + 0.005;
const LB = FIG.seatHalf[1] + 0.005;

/** Heights (m) of the lotus's parts, top down. */
const LY = { cushion: -0.034, waistTop: -0.152, waistBot: -0.176, lowTip: -0.262, step: -0.303, foot: -0.344 };

/** The upper bowl (upturned petals): its scale from the waist up to the tips. */
const upperS = (y: number) => {
  const t = clamp((y - LY.waistTop) / (0.02 - LY.waistTop), 0, 1);
  return 0.7 + 0.33 * (1 - Math.pow(1 - t, 2.3));
};
/** The lower bowl (downturned petals): its scale from the waist down to the tips. */
const lowerS = (y: number) => {
  const t = clamp((LY.waistBot - y) / (LY.waistBot - LY.lowTip), 0, 1);
  return 0.7 + 0.32 * (1 - Math.pow(1 - t, 2));
};
/** The waist's oval: grown by this (m, negative) from the seat's. */
const WAIST = -0.135;
/** The plinth's two steps: bottom, top, how far (m) the face stands out from the seat's oval. */
const STEPS: [number, number, number][] = [
  [LY.step, LY.lowTip, 0.022],
  [LY.foot, LY.step, 0.052],
];
/** The gold roll along each step's top edge: its radius and how far it stands out past the face. */
const ROLL = { r: 0.007, out: 0.003 };
const stepFace = ([y0, y1, by]: [number, number, number]) => slab(y0, y1 - ROLL.r, by, 0.009, 0.009);
const stepRoll = ([, y1, by]: [number, number, number]) => moulding(y1 - ROLL.r, by + ROLL.out - ROLL.r * 0.35, ROLL.r, 0.007);
/** A step and its roll as one layer (they share the point's distance round the oval). */
function step(st: [number, number, number]): Layer {
  const face = stepFace(st);
  const roll = stepRoll(st);
  return { lo: face.lo, hi: roll.hi, k: face.k, d: (p) => smin(face.d(p), roll.d(p), roll.k) };
}

function addLotus(s: Sculpt): number {
  const beadRing = beads(LA, LB, (LY.waistTop + LY.waistBot) / 2, WAIST, 0.0095, 56, 0.002);
  const rolls = STEPS.map(stepRoll);
  // The cushion he sits on, the two lotuses, the waist with its beads, the plinth's steps with gold rolls along their edges.
  s.add(
    rings(
      LA,
      LB,
      [
        slab(LY.cushion, 0, 0.001, 0.009),
        // upper lotus: the core, the inner row (taller, showing between), the outer row
        bowl(LA, LB, upperS, LY.waistTop, 0.02, { inset: 0.018, lo: LY.waistTop - 0.004, hi: LY.cushion + 0.004 }, [
          { n: 20, phase: 0.5, root: LY.waistTop + 0.016, tip: 0.017, inset: 0.007, wide: 0.56, lift: 0.01, back: 0.014, rim: 0.012, swell: 0.9 },
          { n: 20, phase: 0, root: LY.waistTop, tip: -0.028, inset: 0, wide: 0.54, lift: 0.011, back: 0.02, rim: 0.013, swell: 1 },
        ]),
        beadRing,
        // lower lotus: the core and a row of downturned petals
        bowl(LA, LB, lowerS, LY.lowTip, LY.waistBot, { inset: 0.018, lo: LY.lowTip + 0.004, hi: LY.waistBot + 0.004 }, [
          { n: 24, phase: 0, root: LY.waistBot, tip: LY.lowTip, inset: 0, wide: 0.56, lift: 0.01, back: 0.018, rim: 0.011, swell: 0.6 },
        ]),
        slab(LY.waistBot - 0.004, LY.waistTop + 0.004, WAIST - 0.004, 0.006, 0.004),
        ...STEPS.map(step),
      ],
      0.08,
    ),
    'lotus',
  );
  // The plinth is red lacquer (in the gilt palette) but for its rolls; the red fades out along them.
  const plinth = rings(LA, LB, [slab(LY.foot - 0.01, LY.lowTip - ROLL.r - 0.003, STEPS[1][2] + 0.02, 0)], 0.08);
  s.paint(subtract(plinth, grow(rings(LA, LB, rolls, 0.08), 0.0015)), 'base');
  return -LY.foot;
}

// ── The naga ──────────────────────────────────────────────────────────────

/** A triangle wave 0 ‥ 0.5 (0 on the grooves between scales). */
const tri = (v: number) => Math.abs(v - Math.floor(v) - 0.5);

/** Diamond scales (−0.5 grooves ‥ 0.5 the scale's middle) from a position along (u) and across (v), both in scale sizes. */
const scales = (u: number, v: number) => smooth(Math.min(tri(u + v), tri(u - v)) / 0.2) - 0.5;

/** The coils' tube radius (m) and the top coil's middle line: the seat's oval less the tube. */
const COIL_R = 0.056;
const CA = FIG.seatHalf[0] - COIL_R;
const CB = FIG.seatHalf[1] - COIL_R;

/**
 * One coil of the naga's body: a thick tube at height y along the top
 * coil's line grown by `by` m, covered in diamond scales `amp` m high.
 */
function coil(y: number, by: number, amp: number): Layer {
  const r = COIL_R;
  const total = arcOf(CA, CB).total;
  const su = total / Math.round(total / 0.042);
  const sv = (2 * Math.PI * r) / Math.round((2 * Math.PI * r) / 0.032);
  return {
    lo: y - r - amp,
    hi: y + r + amp,
    k: 0.006,
    d(p) {
      const e = p.grown(by);
      const dy = p.y - y;
      const d = len2(e, dy) - r;
      if (d > 2 * amp) return d - amp;
      if (d < -2 * amp) return d;
      return d - amp * scales(p.around() / su, (atan2(dy, e) * r) / sv);
    },
  };
}

/** A shape with diamond scales `amp` m high over it, laid out by `uv` (along, across; in scale sizes). */
function scaly(s: Shape, amp: number, uv: (x: number, y: number, z: number) => number): Shape {
  const b = s.box;
  return {
    box: [b[0] - amp, b[1] - amp, b[2] - amp, b[3] + amp, b[4] + amp, b[5] + amp],
    d(x, y, z) {
      const d = s.d(x, y, z);
      if (d > 2 * amp) return d - amp;
      if (d < -2 * amp) return d;
      return d - amp * uv(x, y, z);
    },
  };
}

/** Where the hood is: the heads' arc round (0, cy), radius R; the plate's plane z; where it narrows into the body (y, half-width); the heads' z. */
const HOOD = { cy: 0.48, R: 0.275, z: -0.172, low: 0.31, neck: 0.08, headZ: -0.104 };
/** The seven heads: angle (rad) from straight up of the middle one and of those on his left (+x); the right mirror them. */
const HEAD_ANG = [0, 24, 48, 72].map((a) => a * DEG);

/**
 * The hood behind his head: a plate cupped forward at the sides, round at
 * the top (a little past the heads' arc) and narrowing below into the body
 * like a cobra's hood, leaning back there clear of his shoulders; up it run
 * seven ribs, the necks, from low on the
 * plate out to each head, standing out front and back. A point looks only
 * at the two ribs nearest it round the fan.
 */
function hoodPlate(t: number, cup: number): Shape {
  const { cy, z: zc, low, neck } = HOOD;
  const R = HOOD.R + 0.012;
  const hwAt = (y: number) => neck + (R - neck) * (1 - Math.pow(1 - clamp((y - low) / (cy - low), 0, 1), 2));
  const round = t - 0.002;
  // (below the heads' arc the plate leans back, clear of his shoulders)
  const tilt = (y: number) => 0.13 * Math.max(0, cy - y);
  // The ribs meet low on the plate and run out to under each head.
  const y0 = cy - 0.14;
  const ribs = HEAD_ANG.map((ang) => {
    const [x, y] = headFrame(ang).at;
    const ex = x * 0.95;
    const ey = cy + (y - cy) * 0.95;
    const L = len2(ex, ey - y0);
    return { ux: ex / L, uy: (ey - y0) / L, L, ang: atan2(ex, ey - y0) };
  });
  const rib = (j: number, ax: number, py: number, z: number) => {
    const r = ribs[j];
    const f = clamp((ax * r.ux + py * r.uy) / r.L, 0, 1);
    const cx = r.ux * f * r.L;
    const ry = r.uy * f * r.L;
    return len3(ax - cx, py - ry, z - zc - cup * cx * cx + tilt(y0 + ry)) - (RIB_R - 0.001 * f);
  };
  return {
    box: [-R, low - 0.01, zc - RIB_R - tilt(low - 0.01), R, cy + R, zc + RIB_R + cup * R * R],
    d(x, y, z) {
      const ax = Math.abs(x);
      let d2: number;
      if (y >= cy) d2 = len2(ax, y - cy) - R;
      else {
        const sl = (hwAt(y + 0.003) - hwAt(y - 0.003)) / 0.006;
        d2 = Math.max((ax - hwAt(y)) / len2(1, sl), low - y);
      }
      d2 += round;
      const dz = Math.abs(z - (zc + cup * x * x - tilt(y))) - (t - round);
      let d = Math.min(Math.max(d2, dz), 0) + len2(Math.max(d2, 0), Math.max(dz, 0)) - round;
      // the two nearest ribs
      const py = y - y0;
      const psi = atan2(ax, py);
      let j = 0;
      while (j < ribs.length - 1 && Math.abs(ribs[j + 1].ang - psi) < Math.abs(ribs[j].ang - psi)) j++;
      const j2 = psi > ribs[j].ang ? Math.min(j + 1, ribs.length - 1) : Math.max(j - 1, 0);
      d = smin(d, rib(j, ax, py, z), 0.01);
      if (j2 !== j) d = smin(d, rib(j2, ax, py, z), 0.01);
      return d;
    },
  };
}

/** The ribs' (necks') radius (m). */
const RIB_R = 0.021;

/**
 * Balls (x, y, z, radius; in its frame) that hold a naga head (`nagaHead`):
 * the middle of one ball round it all (`NAGA_HEAD_REACH`), then the head,
 * the crest and the neck.
 */
const NAGA_HEAD_REACH = 0.108;
const NAGA_HEAD_BALLS: [number, number, number, number][] = [
  [0, 0.01, -0.01, 0],
  [0, 0, 0.012, 0.07],
  [0, 0.056, -0.036, 0.052],
  [0, -0.014, -0.055, 0.042],
];

/** An upright ellipsoid (as sdf.ts's, but boxed tight and without Math.hypot: the heads are many). */
function ell(c: V3, r: V3): Shape {
  const [cx, cy, cz] = c;
  const [rx, ry, rz] = r;
  const ix = 1 / rx;
  const iy = 1 / ry;
  const iz = 1 / rz;
  const inner = -Math.min(rx, ry, rz);
  return {
    box: [cx - rx, cy - ry, cz - rz, cx + rx, cy + ry, cz + rz],
    d(x, y, z) {
      const px = (x - cx) * ix;
      const py = (y - cy) * iy;
      const pz = (z - cz) * iz;
      const k0 = Math.sqrt(px * px + py * py + pz * pz);
      const k1 = Math.sqrt(px * px * ix * ix + py * py * iy * iy + pz * pz * iz * iz);
      return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : inner;
    },
  };
}

/** A naga head's eyes (in its frame, `nagaHead`). */
const NAGA_EYES = mirrorX(ell([0.024, 0.017, 0.018], [0.0125, 0.0115, 0.012]));

/**
 * A flat leaf or flame standing up from `base` (in the x–y plane, facing
 * +z): `len` m long, `w` m half-wide at its widest, `t` m half-thick in the
 * middle (thinner to the edges), leaning back by `lean` (rad), its tip
 * curling forward by `curl` m. The outline is the lotus petal's.
 */
function leaf(base: V3, len: number, w: number, t: number, lean: number, curl: number): Shape {
  const [bx, by, bz] = base;
  const cl = Math.cos(lean);
  const sl = Math.sin(lean);
  const back = len * sl + t + 0.004;
  const front = Math.abs(curl) + t + 0.004;
  return {
    box: [bx - w - t, by - t - 0.004, bz - back, bx + w + t, by + len * cl + t + 0.004, bz + front],
    d(x, y, z) {
      const px = Math.abs(x - bx);
      const py = y - by;
      const pz = z - bz;
      // along the leaf, and out of its plane (+ in front)
      const v = py * cl - pz * sl;
      const s = clamp(v / len, 0, 1);
      const n = pz * cl + py * sl - curl * s * s;
      const hw = w * petalOutline(s);
      const d2 = Math.max(px - hw, -v, v - len);
      const th = t * (0.35 + 0.65 * Math.sqrt(Math.max(0, 1 - (px * px) / Math.max(hw * hw, 1e-9))));
      const dz = Math.abs(n) - th;
      return Math.min(Math.max(d2, dz), 0) + len2(Math.max(d2, 0), Math.max(dz, 0));
    },
  };
}

/**
 * One cobra head in its own frame: its middle at the origin, looking along
 * +z, the top +y. A broad flat head tapering to the snout, the mouth open,
 * bulging eyes under a stern brow, and behind it the Khmer naga's crest: a
 * flame-shaped leaf standing up, its tip curling forward. Its neck runs
 * back into the hood.
 */
function nagaHead(): Shape {
  const parts: Shape[] = [
    // the head: broad at the back, tapering to the snout; the lower jaw
    ell([0, 0.002, -0.012], [0.037, 0.024, 0.036]),
    ell([0, 0, 0.03], [0.026, 0.017, 0.038]),
    ell([0, -0.018, 0.02], [0.024, 0.01, 0.036]),
    // eyes and the brow over them
    NAGA_EYES,
    mirrorX(cone([0.008, 0.026, 0.028], [0.034, 0.022, 0.008], 0.0065, 0.006)),
    // the crest
    leaf([0, 0.012, -0.03], 0.088, 0.032, 0.0075, 10 * DEG, 0.018),
    // the neck, back into the hood
    cone([0, -0.004, -0.02], [0, -0.014, -0.058], RIB_R - 0.001, RIB_R),
  ];
  // The mouth: open, wider to the front.
  return subtract(union(parts, 0.012), ell([0, -0.011, 0.058], [0.03, 0.0065, 0.032]), 0.002);
}

/** A head's place: its middle and turn (fanned out along the hood, looking forward and a little down). */
function headFrame(ang: number): { at: V3; R: Rot } {
  const x = HOOD.R * Math.sin(ang);
  const y = HOOD.cy + HOOD.R * Math.cos(ang);
  return { at: [x, y, HOOD.headZ + 0.35 * x * x], R: rot(-ang * 0.15, 11 * DEG, -ang * 0.8) };
}

/**
 * The seven heads as one shape, from the middle one and those on his left
 * (+x; the right mirror them): a point looks only at the two heads nearest
 * it round the fan (the others are further off).
 */
function headFan(heads: Shape[], frames: { at: V3; R: Rot }[]): Shape {
  const step = HEAD_ANG[1];
  const last = heads.length - 1;
  // Balls round each head (`NAGA_HEAD_BALLS`): further than a little past them, they bound its distance.
  const balls = frames.map(({ at, R }) =>
    NAGA_HEAD_BALLS.map(([x, y, z, r]) => [at[0] + R[0] * x + R[1] * y + R[2] * z, at[1] + R[3] * x + R[4] * y + R[5] * z, at[2] + R[6] * x + R[7] * y + R[8] * z, r]),
  );
  const one = (j: number, x: number, y: number, z: number) => {
    const b = balls[j];
    // (first the ball round them all)
    const big = len3(x - b[0][0], y - b[0][1], z - b[0][2]) - NAGA_HEAD_REACH;
    if (big > 0.012) return big;
    let out = Infinity;
    for (let i = 1; i < b.length; i++) out = Math.min(out, len3(x - b[i][0], y - b[i][1], z - b[i][2]) - b[i][3]);
    return out > 0.012 ? out : heads[j].d(x, y, z);
  };
  return {
    box: mirrorX(union(heads)).box,
    d(x, y, z) {
      const ax = Math.abs(x);
      const f = atan2(ax, y - HOOD.cy) / step;
      const j = clamp(Math.round(f), 0, last);
      const j2 = clamp(f > j ? j + 1 : j - 1, 0, last);
      const d = one(j, ax, y, z);
      return j2 === j ? d : Math.min(d, one(j2, ax, y, z));
    },
  };
}

function addNaga(s: Sculpt): number {
  const r = COIL_R;
  const top = -r - 0.202 - r + 0.004;
  const foot = top - 0.036;
  // Three coils, the widest at the bottom, a core filling them (he sits on a solid seat), a low plinth with a gold roll.
  const plinth: [number, number, number] = [foot, top, r + 0.045];
  const coils = rings(
    CA,
    CB,
    [slab(-r - 0.24, -0.008, -0.01, 0.02), coil(-r, 0, 0.0028), coil(-r - 0.101, 0.018, 0.0028), coil(-r - 0.202, 0.036, 0.0028), step(plinth)],
    r + 0.06,
  );

  // The body rising behind his back, flaring into the hood.
  // (a finger's width behind his back)
  const b0: V3 = [0, -0.03, -0.27];
  const b1: V3 = [0, HOOD.low + 0.05, HOOD.z - 0.033];
  const body = scaly(cone(b0, b1, 0.06, 0.07), 0.0025, (x, y, z) => {
    const t = clamp((y - b0[1]) / (b1[1] - b0[1]), 0, 1);
    return scales(y / 0.04, (atan2(x, z - b0[2] - t * (b1[2] - b0[2])) * 0.065) / 0.032);
  });

  // The hood: the plate with its ribs (the necks), the seven heads.
  const head = nagaHead();
  const heads = HEAD_ANG.map((ang) => {
    const { at, R } = headFrame(ang);
    return place(head, at, R);
  });
  s.add(
    pile([
      [coils, 0],
      [body, 0.03],
      [hoodPlate(0.013, 0.35), 0.03],
      [headFan(heads, HEAD_ANG.map(headFrame)), 0.008],
    ]),
    'naga',
  );

  // The plinth in red lacquer (in the gilt palette) but for its roll; the heads' eyes.
  const lacquer = rings(CA, CB, [slab(foot - 0.01, top - ROLL.r - 0.003, plinth[2] + 0.02, 0)], r + 0.08);
  s.paint(subtract(lacquer, grow(rings(CA, CB, [stepRoll(plinth)], r + 0.08), 0.0015)), 'base');
  for (const ang of HEAD_ANG) {
    const { at, R } = headFrame(ang);
    const eyes = grow(place(NAGA_EYES, at, R), 0.0005);
    s.paint(ang ? mirrorX(eyes) : eyes, 'eye');
  }
  return -foot;
}

export function addThrone(s: Sculpt, throne: Throne): number {
  return throne === 'naga' ? addNaga(s) : addLotus(s);
}
