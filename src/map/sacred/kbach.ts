import { CanvasTexture, NoColorSpace, SRGBColorSpace, type Texture } from 'three';

/**
 * Khmer ornament (kbach) painted on a canvas: gilt relief on red lacquer, as
 * on the gables, doors and altars of a Cambodian pagoda (Wat Bo and Wat
 * Preah Prom Rath in Siem Reap, Wat Ounalom in Phnom Penh).
 *
 * An ornament is drawn in metres (x right, y up) into the layers of a
 * `KbachPen`: the gold (only its shape counts), lines cut into the gold,
 * glass mosaic and the lacquer ground. `gild` then lays the gold on the
 * ground with its relief (a soft shadow on the lacquer, lit and shaded
 * edges, dark grooves) and makes the maps a lit material needs: the colour,
 * and the relief (red: height for the bump, green: roughness, blue:
 * metalness — three.js reads each from its own channel).
 *
 * The motifs:
 * - `flame`: the flame leaf of kbach phni tes, swelling from its foot and
 *   drawn out to a point that curls;
 * - `scroll`: a vine curling into a spiral, flame leaves along its outside;
 * - `flameRow`: flames along any path (an arch, a halo, a frame);
 * - `lotusBand`: a row of lotus petals under a line of beads;
 * - `flameArch`: the pointed flame arch of a niche;
 * - `glass`: a glass inlay in a gold setting.
 * `paintGable` puts them together for a pagoda's gable; `gableTextures`
 * makes (and keeps) its maps.
 *
 * Everything is drawn from fixed numbers: the same picture on every run.
 */

/** A point (m). */
export type P = readonly [number, number];

/** A 2D canvas, on the page or off it, and its drawing context. */
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const ctx = (c: AnyCanvas): Ctx2D => (c as OffscreenCanvas).getContext('2d')!;

export interface KbachPen {
  /** The raised gilt: only the shape counts (draw in any opaque colour). */
  gold: Ctx2D;
  /** Lines cut into the gilt (veins, folds, the face): shape only. */
  cut: Ctx2D;
  /** Glass mosaic, in its own colours (it lies over the gold). */
  glass: Ctx2D;
  /** The lacquer ground, in its own colours. */
  ground: Ctx2D;
  /** Pixels per metre of the drawing (so thin lines stay a pixel wide or more). */
  ppm: number;
}

export const LACQUER = '#a01d18';
export const LACQUER_DEEP = '#4a0c0a';
export const GLASS_BLUE = '#2d6fd6';
export const GLASS_GREEN = '#18a07a';

const TAU = Math.PI * 2;

// ── Paths ────────────────────────────────────────────────────────────────

/** A cubic Bézier from p0 to p3 as `n` + 1 points. */
export function bezier(p0: P, p1: P, p2: P, p3: P, n = 24): P[] {
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
  }
  return out;
}

/**
 * A spiral round (cx, cy): from radius `r` at angle `a0` (rad), turning
 * `turns` times (`dir` +1 anticlockwise) while it winds in to `end` × r.
 */
export function spiral(cx: number, cy: number, r: number, a0: number, turns: number, dir: 1 | -1, end = 0.18): P[] {
  const n = Math.max(12, Math.round(turns * 72));
  const k = Math.log(end);
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + dir * t * turns * TAU;
    const rr = r * Math.exp(k * t);
    out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return out;
}

/** Length of a path (m). */
function pathLength(pts: readonly P[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}

/** Points every `step` m along a path, each with its heading (rad). */
export function along(pts: readonly P[], step: number, from = 0): { p: P; ang: number; s: number }[] {
  const out: { p: P; ang: number; s: number }[] = [];
  let next = from;
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d < 1e-9) continue;
    const ang = Math.atan2(y1 - y0, x1 - x0);
    while (next <= s + d) {
      const t = (next - s) / d;
      out.push({ p: [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t], ang, s: next });
      next += step;
    }
    s += d;
  }
  return out;
}

/** The path moved `d` m to its left (negative: right). */
export function offset(pts: readonly P[], d: number): P[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [p[0] - ((b[1] - a[1]) / l) * d, p[1] + ((b[0] - a[0]) / l) * d] as P;
  });
}

/**
 * Fills a band along `pts`, `left(t)` m to its left and `right(t)` to its
 * right at share t of the way.
 */
export function band(g: Ctx2D, pts: readonly P[], left: (t: number) => number, right: (t: number) => number): void {
  const n = pts.length;
  if (n < 2) return;
  const L: P[] = [];
  const R: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const t = i / (n - 1);
    const l = left(t);
    const r = right(t);
    L.push([pts[i][0] + nx * l, pts[i][1] + ny * l]);
    R.push([pts[i][0] - nx * r, pts[i][1] - ny * r]);
  }
  g.beginPath();
  g.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) g.lineTo(L[i][0], L[i][1]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
  g.closePath();
  g.fill();
}

/** A tapered stroke along `pts`: `w0` m wide at the start to `w1` at the end, round at the start. */
export function ribbon(g: Ctx2D, pts: readonly P[], w0: number, w1 = w0, cap = true): void {
  band(
    g,
    pts,
    (t) => (w0 + (w1 - w0) * t) / 2,
    (t) => (w0 + (w1 - w0) * t) / 2,
  );
  if (cap && pts.length) dot(g, pts[0][0], pts[0][1], w0 / 2);
}

/** A filled circle. */
export function dot(g: Ctx2D, x: number, y: number, r: number): void {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

/** A filled polygon through the points. */
export function poly(g: Ctx2D, pts: readonly P[]): void {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fill();
}

/** A cut line (m wide, at least a pixel and a bit). */
function cutLine(pen: KbachPen, pts: readonly P[], w0: number, w1 = w0): void {
  const min = 1.3 / pen.ppm;
  ribbon(pen.cut, pts, Math.max(min, w0), Math.max(min * 0.8, w1));
}

// ── Motifs ───────────────────────────────────────────────────────────────

export interface FlameOpts {
  /** Cut a vein along it (default true, when it is wide enough to show). */
  vein?: boolean;
  /** A second, smaller tongue off its outer side near the foot (its length as a share, 0: none). */
  tongue?: number;
}

/**
 * A flame leaf (the "phni" of kbach phni tes): from its foot at (x, y),
 * setting out at `ang` (rad), `len` m long and at most `wid` wide; it
 * swells near its foot and draws out to a point that curls by `curl` rad
 * (+ to the left), the outer side of the curl the fuller one. A vein is cut
 * along it; a smaller tongue may flick off its outer side. Returns its
 * middle line.
 */
export function flame(pen: KbachPen, x: number, y: number, ang: number, len: number, wid: number, curl = 0, o: FlameOpts = {}): P[] {
  const n = Math.max(10, Math.min(40, Math.round((len * pen.ppm) / 3)));
  const pts: P[] = [[x, y]];
  const heads: number[] = [ang];
  let px = x;
  let py = y;
  for (let i = 1; i <= n; i++) {
    const t = (i - 0.5) / n;
    const h = ang + curl * Math.pow(t, 2.2);
    px += (Math.cos(h) * len) / n;
    py += (Math.sin(h) * len) / n;
    pts.push([px, py]);
    heads.push(h);
  }
  const f = (t: number) => (t < 0.28 ? 0.45 + 0.55 * Math.sin(((t / 0.28) * Math.PI) / 2) : Math.pow(Math.cos((((t - 0.28) / 0.72) * Math.PI) / 2), 1.1));
  // (curling left, the right side is the outer, fuller one)
  const inner = curl >= 0 ? 0.38 : 0.62;
  pen.gold.fillStyle = '#fff';
  band(
    pen.gold,
    pts,
    (t) => wid * f(t) * inner,
    (t) => wid * f(t) * (1 - inner),
  );
  const side = curl >= 0 ? -1 : 1;
  if ((o.vein ?? true) && wid * pen.ppm > 5) {
    const i0 = Math.round(n * 0.14);
    const i1 = Math.round(n * 0.7);
    cutLine(pen, offset(pts.slice(i0, i1), side * wid * 0.07), wid * 0.2, wid * 0.07);
  }
  if (o.tongue && len * o.tongue * pen.ppm > 6) {
    const i = Math.round(n * 0.3);
    const [tx, ty] = pts[i];
    const h = heads[i] + side * 0.75;
    const off = wid * f(0.3) * (1 - inner) * 0.7;
    flame(pen, tx + Math.cos(heads[i] + (side * Math.PI) / 2) * off, ty + Math.sin(heads[i] + (side * Math.PI) / 2) * off, h, len * o.tongue, wid * 0.55, curl * 0.9, { vein: false });
  }
  return pts;
}

/** A glass inlay (colour `color`) of radius `r` in a gold setting. */
export function glass(pen: KbachPen, x: number, y: number, r: number, color: string): void {
  pen.gold.fillStyle = '#fff';
  dot(pen.gold, x, y, r * 1.5);
  const g = pen.glass;
  g.fillStyle = color;
  dot(g, x, y, r);
  g.fillStyle = 'rgba(0, 0, 0, 0.35)';
  g.beginPath();
  g.arc(x, y, r, Math.PI * 1.1, Math.PI * 1.9);
  g.arc(x, y + r * 0.25, r * 0.85, Math.PI * 1.9, Math.PI * 1.1, true);
  g.fill();
  g.fillStyle = 'rgba(255, 255, 255, 0.85)';
  dot(g, x - r * 0.35, y + r * 0.35, r * 0.32);
}

export interface ScrollSpec {
  /** The spiral's centre and outer radius (m). */
  cx: number;
  cy: number;
  r: number;
  /** Angle (rad) where the vine comes into the spiral, and the spiral's sense (+1 anticlockwise). */
  at: number;
  dir: 1 | -1;
  /** Turns (default 1.5), and the share of `r` it winds in to (0.2). */
  turns?: number;
  end?: number;
  /** Where the vine starts (m) and the way it sets out (rad); none: the spiral alone. */
  from?: P;
  fromAng?: number;
  /** Stem width where it starts (m, default r × 0.17). */
  stem?: number;
  /** Flame leaves along the outside: spacing (rad of spiral, default 0.62), length as a share of the radius there (0.72). */
  leafStep?: number;
  leaf?: number;
  /** How far the leaves lean back against the spiral's turn (rad, 0.35) and curl on with it (rad, 1.9). */
  lean?: number;
  curl?: number;
  /** Leaves pointing lower than this (the y of their direction) are left out (default −0.3). */
  minUp?: number;
  /** Leaves along the vine too, every so many metres (default 0: none), on its upper side. */
  vineLeaves?: number;
  /** A glass inlay in the eye (colour), none if null. */
  eye?: string | null;
}

/**
 * A kbach scroll: a vine (from `from`, if given) sweeping into a spiral that
 * winds inward, flame leaves along the spiral's outside, leaning back and
 * curling on with the turn, so the whole reads as a curl of flame. Returns
 * the stem's path.
 */
export function scroll(pen: KbachPen, o: ScrollSpec): P[] {
  const turns = o.turns ?? 1.5;
  const end = o.end ?? 0.2;
  const stem = o.stem ?? o.r * 0.17;
  const sp = spiral(o.cx, o.cy, o.r, o.at, turns, o.dir, end);
  let path: P[] = sp;
  let vineLen = 0;
  if (o.from) {
    const e = sp[0];
    const tx = -Math.sin(o.at) * o.dir;
    const ty = Math.cos(o.at) * o.dir;
    const d = Math.hypot(e[0] - o.from[0], e[1] - o.from[1]);
    const fa = o.fromAng ?? Math.atan2(e[1] - o.from[1], e[0] - o.from[0]);
    const v = bezier(o.from, [o.from[0] + Math.cos(fa) * d * 0.45, o.from[1] + Math.sin(fa) * d * 0.45], [e[0] - tx * d * 0.45, e[1] - ty * d * 0.45], e, Math.max(8, Math.round(d * 40)));
    vineLen = pathLength(v);
    path = [...v, ...sp.slice(1)];
  }
  const total = pathLength(path);
  const vineShare = vineLen / total;
  // The stem: even along the vine, tapering in the spiral.
  const width = (t: number) => (t <= vineShare ? stem : stem * (1 - 0.7 * ((t - vineShare) / (1 - vineShare))));
  band(
    pen.gold,
    path,
    (t) => width(t) / 2,
    (t) => width(t) / 2,
  );
  if (o.from) {
    pen.gold.fillStyle = '#fff';
    dot(pen.gold, path[0][0], path[0][1], stem / 2);
  }
  // A groove along the stem (the doubled stem of carved kbach).
  cutLine(pen, path.slice(0, Math.round(path.length * 0.85)), stem * 0.2, stem * 0.08);

  // Leaves along the spiral's outside.
  const step = o.leafStep ?? 0.5;
  const size = o.leaf ?? 1.0;
  const lean = o.lean ?? 0.8;
  const curl = o.curl ?? 2.2;
  const minUp = o.minUp ?? -0.3;
  const k = Math.log(end);
  const span = turns * TAU;
  for (let a = step * 0.4; a < span * 0.72; a += step * (1 - (0.35 * a) / span)) {
    const t = a / span;
    const ang = o.at + o.dir * a;
    const rr = o.r * Math.exp(k * t);
    if (Math.sin(ang) < minUp) continue;
    const len = rr * size;
    if (len * pen.ppm < 6) break;
    const w = width(vineShare + t * (1 - vineShare));
    const fx = o.cx + Math.cos(ang) * (rr + w * 0.3);
    const fy = o.cy + Math.sin(ang) * (rr + w * 0.3);
    flame(pen, fx, fy, ang - o.dir * lean, len, len * 0.44, o.dir * curl, { tongue: 0.45 });
  }
  // Leaves along the vine, on each side in turn, leaning on the way it runs.
  if (o.from && o.vineLeaves) {
    const vine = path.slice(0, Math.round(path.length * vineShare) + 1);
    let side = o.dir;
    for (const q of along(vine, o.vineLeaves, o.vineLeaves * 0.6)) {
      const n = q.ang + (side * Math.PI) / 2;
      const len = stem * 3.6;
      flame(pen, q.p[0] + Math.cos(n) * stem * 0.3, q.p[1] + Math.sin(n) * stem * 0.3, q.ang + side * 0.75, len, len * 0.42, side * 1.1);
      side = -side as 1 | -1;
    }
  }
  // The eye: a bud of glass.
  const tip = sp[sp.length - 1];
  if (o.eye) glass(pen, tip[0], tip[1], Math.max(o.r * end * 0.55, 1.8 / pen.ppm), o.eye);
  return path;
}

export interface FlameRowSpec {
  /** Flame length and width (m). */
  len: number;
  wid?: number;
  /** Spacing along the path (m), from where (m along it) to where (default: its end). */
  gap: number;
  from?: number;
  to?: number;
  /** Which side of the path (+1 left), how far they lean on along the path (rad), how they curl (rad, + with the lean). */
  side: 1 | -1;
  lean?: number;
  curl?: number;
  /** Length at the end of the row as a share of `len` (default 1: all alike). */
  taper?: number;
}

/** Flames along a path on one side of it (the fringe of an arch or a halo, a frame's teeth). */
export function flameRow(pen: KbachPen, pts: readonly P[], o: FlameRowSpec): void {
  const lean = o.lean ?? 0.5;
  const curl = o.curl ?? 1.2;
  const L = pathLength(pts);
  const to = Math.min(L, o.to ?? L);
  for (const q of along(pts, o.gap, o.from ?? o.gap * 0.5)) {
    if (q.s > to) break;
    const t = q.s / Math.max(1e-6, to);
    const len = o.len * (1 + ((o.taper ?? 1) - 1) * t);
    const n = q.ang + (o.side * Math.PI) / 2;
    flame(pen, q.p[0], q.p[1], n - o.side * lean, len, (o.wid ?? o.len * 0.38) * (len / o.len), -o.side * curl);
  }
}

/**
 * A row of lotus petals from x0 to x1, standing on y, `h` m tall to the top
 * of the beads over them; a gold fillet under them.
 */
export function lotusBand(pen: KbachPen, x0: number, x1: number, y: number, h: number, beadColor: string | null = GLASS_GREEN): void {
  const g = pen.gold;
  g.fillStyle = '#fff';
  g.fillRect(x0, y, x1 - x0, h * 0.13);
  const ph = h * 0.66;
  const n = Math.max(1, Math.round((x1 - x0) / (ph * 0.78)));
  const pw = (x1 - x0) / n;
  const foot = y + h * 0.13;
  const petal = (cx: number, w: number, hh: number, k: number) => {
    const b = foot;
    const pts = [...bezier([cx - w * k, b], [cx - w * k * 1.05, b + hh * 0.55], [cx - w * 0.12 * k, b + hh * 0.72], [cx, b + hh], 10), ...bezier([cx, b + hh], [cx + w * 0.12 * k, b + hh * 0.72], [cx + w * k * 1.05, b + hh * 0.55], [cx + w * k, b], 10)];
    return pts;
  };
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * pw;
    poly(g, petal(cx, pw, ph, 0.47));
    // (a petal within the petal: its outline cut)
    const inner = petal(cx, pw * 0.62, ph * 0.72, 0.47);
    pen.cut.lineWidth = Math.max(1.3 / pen.ppm, h * 0.035);
    pen.cut.lineJoin = 'round';
    pen.cut.beginPath();
    pen.cut.moveTo(inner[0][0], inner[0][1]);
    for (const p of inner) pen.cut.lineTo(p[0], p[1]);
    pen.cut.stroke();
  }
  // The beads, glass in every other one.
  const by = y + h * 0.9;
  const br = h * 0.085;
  const m = Math.max(1, Math.round((x1 - x0) / (br * 2.6)));
  for (let i = 0; i < m; i++) {
    const bx = x0 + ((i + 0.5) * (x1 - x0)) / m;
    if (beadColor && i % 2 === 1) glass(pen, bx, by, br * 0.62, beadColor);
    else {
      g.fillStyle = '#fff';
      dot(g, bx, by, br);
    }
  }
}

/**
 * A halo (the light round a Buddha's head): a gold ring of radius `r` round
 * (cx, cy), `w` wide, a fine ring inside it, and a fringe of flames licking
 * out and up round its upper half; glass set in the ring if `inlay`.
 */
export function halo(pen: KbachPen, cx: number, cy: number, r: number, o: { w?: number; flames?: number; inlay?: string | null } = {}): void {
  const w = o.w ?? r * 0.1;
  const circle = (rr: number): P[] => Array.from({ length: 97 }, (_, i) => [cx + Math.cos((i / 96) * TAU) * rr, cy + Math.sin((i / 96) * TAU) * rr] as P);
  pen.gold.fillStyle = '#fff';
  ribbon(pen.gold, circle(r), w, w, false);
  ribbon(pen.gold, circle(r - w * 1.6), w * 0.35, w * 0.35, false);
  const fl = o.flames ?? r * 0.42;
  // From the top down each side (a path's right is its outside going anticlockwise, its left going clockwise), leaning up.
  for (const s of [1, -1] as const) {
    const arc: P[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI / 2 - s * ((i / 24) * (Math.PI * 0.62));
      arc.push([cx + Math.cos(a) * (r + w * 0.4), cy + Math.sin(a) * (r + w * 0.4)]);
    }
    flameRow(pen, arc, { len: fl, gap: fl * 0.7, from: fl * 0.5, side: s > 0 ? 1 : -1, lean: -0.55, curl: -1.0, taper: 0.7 });
  }
  if (o.inlay) for (let i = 0; i < 12; i++) glass(pen, cx + Math.cos((i / 12) * TAU) * r, cy + Math.sin((i / 12) * TAU) * r, w * 0.3, o.inlay);
}

/**
 * The outline of a pointed flame arch standing on y from −w to w: straight
 * sides up to `shoulder` m, then drawing in to a point `tip` m up with a
 * slight hollow below the point.
 */
export function archOutline(cx: number, y: number, w: number, shoulder: number, tip: number): P[] {
  const left = [...bezier([cx - w, y], [cx - w, y + shoulder * 0.4], [cx - w, y + shoulder * 0.7], [cx - w, y + shoulder], 6).slice(0, -1), ...bezier([cx - w, y + shoulder], [cx - w * 1.03, y + shoulder + (tip - shoulder) * 0.5], [cx - w * 0.1, y + tip - (tip - shoulder) * 0.4], [cx, y + tip], 28)];
  const right = left
    .slice(0, -1)
    .reverse()
    .map(([x, yy]) => [2 * cx - x, yy] as P);
  return [...left, ...right];
}

export interface ArchSpec {
  /** Half width inside the frame, height of the straight sides and of the point (m). */
  w: number;
  shoulder: number;
  tip: number;
  /** The frame's width (m), the fringe's flame length (m). */
  frame?: number;
  flames?: number;
  /** The niche's ground (colour), glass along the frame (colour or null). */
  fill?: string | CanvasGradient;
  inlay?: string | null;
}

/**
 * A niche under a pointed flame arch (the frame round a figure): its deep
 * ground, a gold frame with a line inside it and glass along it, flames
 * licking out and up all along its outside, a tall flame on its point.
 */
export function flameArch(pen: KbachPen, cx: number, y: number, o: ArchSpec): void {
  const fw = o.frame ?? 0.09;
  const fl = o.flames ?? 0.24;
  const out = archOutline(cx, y, o.w + fw / 2, o.shoulder, o.tip);
  pen.ground.fillStyle = o.fill ?? LACQUER_DEEP;
  poly(pen.ground, out);
  pen.gold.fillStyle = '#fff';
  const half = Math.ceil(out.length / 2);
  const sides = [out.slice(0, half), out.slice(half - 1).reverse()];
  for (const side of sides) ribbon(pen.gold, side, fw, fw * 0.7, false);
  // A fine gold line inside the frame.
  const inner = archOutline(cx, y, o.w - fw * 0.9, o.shoulder - fw * 0.5, o.tip - fw * 2.2);
  const ih = Math.ceil(inner.length / 2);
  for (const side of [inner.slice(0, ih), inner.slice(ih - 1).reverse()]) ribbon(pen.gold, side.slice(1), fw * 0.28, fw * 0.22, false);
  // Flames along the outside, licking up toward the point.
  const outer = archOutline(cx, y, o.w + fw, o.shoulder, o.tip + fw * 0.6);
  const oh = Math.ceil(outer.length / 2);
  flameRow(pen, outer.slice(0, oh), { len: fl, gap: fl * 0.62, from: o.shoulder * 0.2, side: 1, lean: 0.35, curl: 1.5, taper: 0.7 });
  flameRow(pen, outer.slice(oh - 1).reverse(), { len: fl, gap: fl * 0.62, from: o.shoulder * 0.2, side: -1, lean: 0.35, curl: 1.5, taper: 0.7 });
  // The point: a tall flame, curling a little each way (two tongues).
  const ty = y + o.tip + fw * 0.3;
  flame(pen, cx, ty - fw, Math.PI / 2, fl * 2.4, fl * 0.62, 0);
  flame(pen, cx - fw * 0.3, ty, Math.PI / 2 + 0.55, fl * 1.1, fl * 0.34, 1.2);
  flame(pen, cx + fw * 0.3, ty, Math.PI / 2 - 0.55, fl * 1.1, fl * 0.34, -1.2);
  if (o.inlay) for (const side of sides) for (const q of along(side, 0.22, 0.2)) glass(pen, q.p[0], q.p[1], fw * 0.24, o.inlay);
}

// ── Gilding ──────────────────────────────────────────────────────────────

/** A 2D canvas off the page (a page canvas where there is none). */
function canvas(w: number, h: number): [AnyCanvas, Ctx2D] {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(w, h);
    return [c, c.getContext('2d')!];
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, ctx(c)];
}

/** A copy of `src`'s shape filled with `style`. */
function tint(src: AnyCanvas, style: string | CanvasGradient): AnyCanvas {
  const [c, g] = canvas(src.width, src.height);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = style;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** `src`'s shape with the part `dx`, `dy` px over from it taken away (the edges facing away from that way). */
function rim(src: AnyCanvas, style: string, dx: number, dy: number): AnyCanvas {
  const c = tint(src, style);
  const g = ctx(c);
  g.globalCompositeOperation = 'destination-out';
  g.drawImage(src, dx, dy);
  return c;
}

/** Draws `src`'s shape blurred by `blur` px, moved by (dx, dy), in `color` (a shadow cast from off the canvas). */
function soft(dst: Ctx2D, src: AnyCanvas, color: string, blur: number, dx = 0, dy = 0): void {
  const far = src.width + 64;
  dst.save();
  dst.setTransform(1, 0, 0, 1, 0, 0);
  dst.shadowColor = color;
  dst.shadowBlur = blur;
  dst.shadowOffsetX = far + dx;
  dst.shadowOffsetY = dy;
  dst.drawImage(src, -far, 0);
  dst.restore();
}

export interface Gilded {
  /** The colour (sRGB). */
  color: AnyCanvas;
  /** Relief: red the height (gold up, lacquer down), green roughness, blue metalness. */
  relief: AnyCanvas;
  /** What lamps light at night (sRGB, for an emissive map): the gold, the lacquer faintly. */
  glow: AnyCanvas;
}

export interface GildLook {
  /** The gold's colours: lit top, shaded foot, highlight, dark edge, grooves. */
  gold?: [string, string];
  light?: string;
  dark?: string;
  groove?: string;
}

/**
 * Lays a drawing's gold on its ground: `w` × `h` px, `draw` gets a pen whose
 * layers already map metres to pixels (`toPx` sets that: e.g. origin at the
 * bottom middle, y up). Light is taken to come from the upper left.
 */
export function gild(w: number, h: number, toPx: (g: Ctx2D) => void, ppm: number, draw: (pen: KbachPen) => void, look: GildLook = {}): Gilded {
  const [groundC, ground] = canvas(w, h);
  const [goldC, gold] = canvas(w, h);
  const [cutC, cut] = canvas(w, h);
  const [glassC, glassG] = canvas(w, h);
  for (const g of [ground, gold, cut, glassG]) {
    toPx(g);
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    g.lineCap = 'round';
    g.lineJoin = 'round';
  }
  draw({ gold, cut, glass: glassG, ground, ppm });

  // The grooves only where there is gold.
  const cuts = tint(cutC, '#fff');
  {
    const g = ctx(cuts);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(goldC, 0, 0);
  }

  // Colour: the ground, the gold's soft shadow on it, the gold (lit above, warmer below), its edges, its grooves, the glass.
  const [color, C] = canvas(w, h);
  C.drawImage(groundC, 0, 0);
  soft(C, goldC, 'rgba(22, 2, 1, 0.9)', 4, 2, 3);
  const [g0, g1] = look.gold ?? ['#f6cf66', '#d49a34'];
  const grad = C.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, g0);
  grad.addColorStop(1, g1);
  C.drawImage(tint(goldC, grad), 0, 0);
  C.globalAlpha = 0.55;
  C.drawImage(rim(goldC, look.light ?? '#fff3c0', 3, 3), 0, 0);
  C.globalAlpha = 0.9;
  C.drawImage(rim(goldC, look.light ?? '#fff3c0', 1, 1), 0, 0);
  C.globalAlpha = 0.85;
  C.drawImage(rim(goldC, look.dark ?? '#6a3a0c', -2, -2), 0, 0);
  C.globalAlpha = 0.7;
  C.drawImage(tint(cuts, look.light ?? '#fff3c0'), 1, 1);
  C.globalAlpha = 1;
  C.drawImage(tint(cuts, look.groove ?? '#4a2106'), 0, 0);
  C.drawImage(glassC, 0, 0);

  // Relief: height in red (a soft-edged plateau of gold, grooves in it), then roughness and metalness.
  const [relief, R] = canvas(w, h);
  R.fillStyle = '#000';
  R.fillRect(0, 0, w, h);
  soft(R, goldC, '#fff', 3);
  R.globalAlpha = 0.45;
  R.drawImage(tint(goldC, '#fff'), 0, 0);
  R.globalAlpha = 0.7;
  R.drawImage(tint(cuts, '#000'), 0, 0);
  R.globalAlpha = 1;
  R.globalCompositeOperation = 'multiply';
  R.fillStyle = '#f00';
  R.fillRect(0, 0, w, h);
  // (green: lacquer 0.5 rough, gold 0.35, grooves 0.6, glass 0.15; blue: gold 0.8 metal, grooves 0.45, glass 0.1)
  const [fin, F] = canvas(w, h);
  F.fillStyle = 'rgb(0, 128, 0)';
  F.fillRect(0, 0, w, h);
  F.drawImage(tint(goldC, 'rgb(0, 90, 205)'), 0, 0);
  F.drawImage(tint(cuts, 'rgb(0, 150, 115)'), 0, 0);
  F.drawImage(tint(glassC, 'rgb(0, 38, 25)'), 0, 0);
  R.globalCompositeOperation = 'lighter';
  R.drawImage(fin, 0, 0);
  R.globalCompositeOperation = 'source-over';

  const [glow, W] = canvas(w, h);
  W.fillStyle = '#000';
  W.fillRect(0, 0, w, h);
  W.globalAlpha = 0.12;
  W.drawImage(groundC, 0, 0);
  W.globalAlpha = 1;
  W.drawImage(tint(goldC, look.light ?? '#fff3c0'), 0, 0);
  W.globalAlpha = 0.6;
  W.drawImage(tint(cuts, '#000'), 0, 0);
  W.globalAlpha = 1;
  return { color, relief, glow };
}

// ── The gable ────────────────────────────────────────────────────────────

/** The triangle the gable's ornament is drawn for (m): half its base and its height. */
export const GABLE = { half: 4.52, height: 4.07 };

/**
 * The niche in the gable's middle (m, in `GABLE`'s frame): its foot, half
 * its width inside the frame, its straight sides and point. A sculpted
 * Buddha sits in it (gable.ts), `figure` × `tip` tall, his head's middle
 * `head` of his height up: a halo is painted behind it.
 */
export const GABLE_NICHE = { y: 0.3, w: 0.96, shoulder: 1.25, tip: 2.72, figure: 0.8, head: 0.765 };

/**
 * A pagoda's gable (the triangle under the roof, `GABLE` wide and tall, its
 * foot on y = 0, drawn in its own metres): gold kbach on red lacquer. In
 * the middle a deep niche under a pointed flame arch (`GABLE_NICHE`), for
 * a Buddha in high relief; on each side flame scrolls spread out and up
 * to the corners; a gold band runs up each slope with flame teeth along
 * it; lotus petals and beads along the foot; blue and green glass in the
 * eyes of the scrolls, on the arch and in the beads. Outside the triangle
 * the lacquer lies in the roof's shadow.
 */
export function paintGable(pen: KbachPen): void {
  const { half, height } = GABLE;
  const k = height / half;
  const tri: P[] = [
    [-half, 0],
    [0, height],
    [half, 0],
  ];
  const G = pen.ground;
  G.fillStyle = '#4a0b09';
  G.fillRect(-half * 2, -1, half * 4, height * 2);
  const lac = G.createLinearGradient(0, height, 0, 0);
  lac.addColorStop(0, '#881814');
  lac.addColorStop(1, LACQUER);
  G.fillStyle = lac;
  poly(G, tri);
  for (const g of [pen.gold, pen.cut, pen.glass, pen.ground]) {
    g.save();
    g.beginPath();
    g.moveTo(-half - 0.02, -0.5);
    g.lineTo(-half - 0.02, 0);
    g.lineTo(0, height + 0.02 * k);
    g.lineTo(half + 0.02, 0);
    g.lineTo(half + 0.02, -0.5);
    g.closePath();
    g.clip();
  }

  // The bands up the slopes, flame teeth climbing along their inner edge.
  const bw = 0.085;
  for (const s of [-1, 1]) {
    const slope: P[] = [
      [s * (half + 0.2), -0.2 * k],
      [0, height],
    ];
    const line = along(slope, 0.02).map((q) => q.p);
    const inside = offset(line, s * (-0.02 - bw / 2) * -1);
    pen.gold.fillStyle = '#fff';
    ribbon(pen.gold, inside, bw, bw, false);
    const edge = offset(line, s * (bw + 0.02));
    flameRow(pen, edge, { len: 0.27, gap: 0.19, from: 0.3, side: s > 0 ? 1 : -1, lean: 0.45, curl: 1.6 });
    for (const q of along(inside, 0.36, 0.3)) glass(pen, q.p[0], q.p[1], 0.019, s * q.s > 0 ? GLASS_BLUE : GLASS_GREEN);
  }

  // Lotus petals and beads along the foot.
  lotusBand(pen, -half, half, 0, 0.3, GLASS_BLUE);

  // Scrolls on each side (drawn for the left, mirrored for the right): big ones low, spreading out to the corner.
  const wing = (s: 1 | -1) => {
    const X = (x: number) => s * x;
    const A = (a: number) => (s > 0 ? a : Math.PI - a);
    const dir = (d: 1 | -1) => (s > 0 ? d : (-d as 1 | -1));
    const S = (o: ScrollSpec) => scroll(pen, { ...o, cx: X(o.cx), at: A(o.at), dir: dir(o.dir), from: o.from ? [X(o.from[0]), o.from[1]] : undefined, fromAng: o.fromAng === undefined ? undefined : A(o.fromAng) });
    pen.gold.fillStyle = '#fff';
    // The ground vine along the foot, from the niche out to the corner, small flames standing on it.
    const foot = bezier([X(-1.05), 0.36], [X(-2.0), 0.3], [X(-3.0), 0.44], [X(-3.95), 0.33], 40);
    ribbon(pen.gold, foot, 0.06, 0.025);
    flameRow(pen, s > 0 ? foot : foot.map(([x, y]) => [x, y] as P), { len: 0.16, gap: 0.2, from: 0.15, side: s > 0 ? -1 : 1, lean: 0.5, curl: 1.2, taper: 0.7 });
    // A big scroll rising from it, rolling out toward the corner.
    S({ cx: -2.15, cy: 1.08, r: 0.5, at: -0.15, dir: 1, turns: 1.55, from: [-1.35, 0.36], fromAng: 1.9, stem: 0.08, eye: GLASS_BLUE, vineLeaves: 0.17, leaf: 1.1 });
    // Out along the foot, smaller and smaller.
    S({ cx: -3.1, cy: 0.74, r: 0.3, at: -0.3, dir: 1, turns: 1.45, from: [-2.55, 0.38], fromAng: 1.2, stem: 0.055, eye: GLASS_GREEN, leaf: 1.2 });
    S({ cx: -3.68, cy: 0.5, r: 0.15, at: -0.4, dir: 1, turns: 1.3, from: [-3.4, 0.37], fromAng: 1.0, stem: 0.036, eye: null, leaf: 1.2 });
    // A scroll rising along the niche to the slope, rolling out under it.
    S({ cx: -1.62, cy: 2.14, r: 0.32, at: -0.2, dir: 1, turns: 1.45, from: [-1.4, 1.2], fromAng: 1.35, stem: 0.055, eye: GLASS_GREEN, vineLeaves: 0.16, leaf: 1.1 });
    // Under the big scroll, a small one turning back toward the niche.
    S({ cx: -1.55, cy: 0.66, r: 0.16, at: Math.PI + 0.3, dir: -1, turns: 1.3, from: [-1.95, 0.4], fromAng: 0.6, stem: 0.04, eye: null, minUp: -0.1 });
    // By the point of the arch, a scroll under the apex.
    S({ cx: -0.8, cy: 3.0, r: 0.21, at: -0.3, dir: 1, turns: 1.4, from: [-0.6, 2.55], fromAng: 1.9, stem: 0.042, eye: GLASS_BLUE, leaf: 1.2 });
    // Flames filling the gaps: between the big scroll and the slope, and out toward the corner.
    for (const [x, y, a, len] of [
      [-2.62, 1.72, 2.1, 0.34],
      [-2.95, 1.25, 2.0, 0.3],
      [-3.45, 0.95, 2.2, 0.24],
      [-1.2, 2.72, 1.85, 0.28],
      [-2.05, 1.95, 1.6, 0.26],
    ] as const)
      flame(pen, X(x), y, A(a), len, len * 0.42, s * 1.8, { tongue: 0.4 });
  };
  wing(1);
  wing(-1);

  // The niche: deep lacquer, darker up under its point.
  const N = GABLE_NICHE;
  const deep = pen.ground.createLinearGradient(0, N.y, 0, N.y + N.tip);
  deep.addColorStop(0, '#4c0c0a');
  deep.addColorStop(1, '#2a0605');
  flameArch(pen, 0, N.y, { w: N.w, shoulder: N.shoulder, tip: N.tip, frame: 0.09, flames: 0.3, inlay: GLASS_GREEN, fill: deep });
  // The halo behind the Buddha's head, and a soft light on the niche's back round him.
  const hy = N.y + N.tip * N.figure * N.head;
  const glowR = pen.ground.createRadialGradient(0, hy - 0.5, 0.1, 0, hy - 0.5, 1.2);
  glowR.addColorStop(0, 'rgba(120, 30, 18, 0.55)');
  glowR.addColorStop(1, 'rgba(120, 30, 18, 0)');
  pen.ground.save();
  pen.ground.beginPath();
  const inside = archOutline(0, N.y, N.w, N.shoulder, N.tip);
  pen.ground.moveTo(inside[0][0], inside[0][1]);
  for (const p of inside) pen.ground.lineTo(p[0], p[1]);
  pen.ground.clip();
  pen.ground.fillStyle = glowR;
  pen.ground.fillRect(-N.w, N.y, N.w * 2, N.tip);
  pen.ground.restore();
  halo(pen, 0, hy, 0.3, { w: 0.032, flames: 0.15, inlay: null });
  for (const g of [pen.gold, pen.cut, pen.glass, pen.ground]) g.restore();
}

// ── The gable's maps ─────────────────────────────────────────────────────

export interface GableArtSpec {
  /** The canvas's extent (m): from −width/2 to width/2, and from 0 up to `height`. */
  width: number;
  height: number;
  /** The painted triangle: its sides from (±half, foot) up to (0, apex) (m). */
  half: number;
  foot: number;
  apex: number;
  /** Pixels across (default 1024). */
  px?: number;
}

export interface GableArt {
  /** Colour (sRGB). */
  map: Texture;
  /** Red: height (for `bumpMap`), green: roughness, blue: metalness. */
  relief: Texture;
  /** Lamp light at night (for `emissiveMap`): the gold, brightest low down where the lamps hang. */
  glow: Texture;
  /** The canvases (for a look at them). */
  canvases: Gilded;
  /** How long painting them took (ms). */
  ms: number;
}

const made = new Map<string, GableArt>();

/**
 * The maps for a gable (made once per spec): `paintGable` fitted to the
 * triangle, over the whole canvas. u runs 0‥1 across `width`, v 0‥1 up
 * `height` (v = 1 is the canvas's top row).
 */
export function gableTextures(spec: GableArtSpec): GableArt {
  const key = JSON.stringify(spec);
  const had = made.get(key);
  if (had) return had;
  const t0 = performance.now();
  const w = spec.px ?? 1024;
  const ppm = w / spec.width;
  const h = Math.round(spec.height * ppm);
  const sx = spec.half / GABLE.half;
  const sy = (spec.apex - spec.foot) / GABLE.height;
  const canvases = gild(
    w,
    h,
    (g) => {
      g.setTransform(ppm, 0, 0, -ppm, w / 2, h);
      g.translate(0, spec.foot);
      g.scale(sx, sy);
    },
    ppm * Math.sqrt(sx * sy),
    paintGable,
  );
  const map = new CanvasTexture(canvases.color);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  map.name = 'gable';
  const relief = new CanvasTexture(canvases.relief);
  relief.colorSpace = NoColorSpace;
  relief.anisotropy = 8;
  relief.name = 'gable relief';
  // (the lamps hang under the eaves at the foot: their light fades up the gable)
  const W = ctx(canvases.glow);
  const fade = W.createLinearGradient(0, h, 0, 0);
  fade.addColorStop(0, '#fff');
  fade.addColorStop(0.35, '#b0b0b0');
  fade.addColorStop(1, '#484848');
  W.globalCompositeOperation = 'multiply';
  W.fillStyle = fade;
  W.fillRect(0, 0, w, h);
  const glow = new CanvasTexture(canvases.glow);
  glow.colorSpace = SRGBColorSpace;
  glow.name = 'gable glow';
  const art = { map, relief, glow, canvases, ms: performance.now() - t0 };
  made.set(key, art);
  return art;
}
