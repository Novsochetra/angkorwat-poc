import type { SourceTrace } from '../../feedback/sourceTrace';
import { hash3, valueNoise3 } from '../../voxel/random';
import type { Surf, VoxelBuilder } from '../../voxel/VoxelBuilder';
import { here, TEXEL } from '../shapes';
import { FACE, subtractBox, type Box6, type StoneLook } from './gallery';

/**
 * Carved stone — mouldings and shallow reliefs for the temple kit (§21.2
 * cornice, lintel and pediment; §15 decorative walls, §16 decorative blocks,
 * §21.3 gopuras). Khmer carving is shallow: patterns cut a texel or half a
 * texel into a dressed face (or standing proud of it), the cut-back ground in
 * the stone's own shadow, so the pattern reads from a distance as light lines
 * on dark, like the sheets' carved bands.
 *
 * Three layers, each usable on its own:
 *
 * 1. **Reliefs** — {@link Relief}: a grid of cells (u to the right, v up, row
 *    0 at the bottom), each a height *level*: `face` is the uncut face, lower
 *    levels are cut back one `step` each, higher ones stand proud, −1 = no
 *    stone (a silhouette's outside). Draw on it (`rect`, `ellipse`, `disc`,
 *    `ring`, `poly`, `line`, `spiral`, `paint`: cell units, cells whose centre
 *    is inside, combined by `op` 'set' | 'max' | 'min') or `stamp` motifs
 *    (with `ground`, `op` incl. 'over', `flip`, `clip`, `where`, `map`).
 *    Levels at or below `ground` read as the cut-back ground (shaded dark).
 *    Motif makers return a Relief sized in cells whose top level is its face
 *    and whose ground is 0, so stamping lands the motif's top on the target's
 *    face: {@link keyBand} (meander / key cartouches), {@link lozenges},
 *    {@link rosette} (lotus flower), {@link petals} (lotus-petal band),
 *    {@link beads}, {@link scroll} (foliate rinceau), {@link foliage} (curls
 *    filling a field), {@link curl} (a scroll end), {@link figure} (devata,
 *    deity, kneeling worshipper), {@link niche} (pointed arch, −1 outside),
 *    {@link kala} (the monster face of lintels), {@link medallion},
 *    {@link nagaHood} (five-headed naga end, −1 outside); {@link art} reads
 *    pixel art; {@link weather} wears a relief.
 * 2. **Stones** — {@link StoneWork} collects dressed stones and emits them:
 *    `stone(box, carvings)` is a rectangular stone with reliefs cut into any
 *    of its faces (±x, ±z, top); `slab(relief, …)` is a stone slab shaped by a
 *    relief's silhouette (a pediment, a flame crest), split into stones by
 *    {@link courses}. Every stone is one big box behind a thin relief layer
 *    (greedy rectangles of equal level), so a 2 m carved band costs a few
 *    hundred boxes. `emit(v)` works out each box's sides: exposed (rounded,
 *    rim-lit), the same stone (merged flat) or another stone (a masonry
 *    joint's dark line). Looks come from `finishLook(<finish>, seed)` (one
 *    look per stone, from its centre); the ground gets the stone's colour in
 *    shadow (`ground` brightness) with patchy `recessMoss`.
 * 3. **Builders** — {@link moulding} (stacked projecting bands along a run,
 *    carved or plain, front or both faces), {@link mouldingCorner} (the same
 *    profile turning an outer corner), {@link lintel} and {@link pediment}.
 *
 * Placement contract (builders): metres, piece space, +Z is the front. A
 * moulding runs along x from `x0` to `x1` (ends exactly there, so modules
 * tile) on a wall whose faces are z = `front` and z = `back`, its bottom at
 * `y0`; each band's face stands `out` in front of the wall face and its top
 * is flat (walkable). A lintel is centred on x = 0 with its bottom (the door
 * head) at `y0`, its front face at z = `z` + depth/2 (its end panels; the
 * carved band a texel behind). A pediment stands on `y0`, centred on x = 0,
 * front face at z = `z` (default depth/2), flat back at z − depth; it returns
 * collider boxes and its step treads as {@link Top}s for moss (lib/openings'
 * `mossTops` takes them). Every builder only adds stones to a StoneWork: call
 * `emit` once when everything is laid.
 *
 * Usage (a carved plinth band on a 1 m wall, 4 m long):
 *
 * ```ts
 * const w = new StoneWork({ look: finishLook(STONE_FINISH.warm, seed), seed });
 * moulding(w, {
 *   x0: -2, x1: 2, front: 0.5, back: -0.5, seed,
 *   bands: [
 *     { h: 0.25, out: 0.0625, relief: (cw, ch) => keyBand(cw, ch) },
 *     { h: 0.25, out: 0.25 },
 *   ],
 * });
 * // A devata panel cut into the face of a 1 × 1.5 m stone:
 * const r = new Relief(32, 48, { face: 2 });
 * r.rect(2, 2, 30, 46, 0).stamp(figure(40, 'devata'), 4, 4, { op: 'max' });
 * w.stone([-0.5, 1, 0, 0.5, 2.5, 0.5], [{ face: FACE.pz, relief: r, at: [-0.5, 1, 0.5] }]);
 * w.emit(p.voxels);
 * ```
 */

/** The relief grid of fine carving: half a texel (1/32 m). */
export const HALF = TEXEL / 2;
/** A whole texel (1/16 m): bold carving on big pieces. */
export const CELL = TEXEL;

export type V3 = [number, number, number];
export type Op = 'set' | 'max' | 'min';

/** A pattern of relief levels, w × h cells, row 0 at the bottom. */
export interface Motif {
  readonly w: number;
  readonly h: number;
  /** The highest level: stamped onto a face, it lands on the face. */
  readonly top: number;
  at(u: number, v: number): number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const TAU = Math.PI * 2;

/**
 * A carved face: w × h cells of levels (see the file comment). Drawing
 * methods take cell units with v up and fill the cells whose centre lies in
 * the shape; `op` combines with what is there ('max' raises only, 'min' cuts
 * only). They return the relief, so calls chain.
 */
export class Relief implements Motif {
  readonly cells: Int8Array;
  /** Level of the uncut face (the stone's face plane when carved into a stone). */
  face: number;
  /** Levels at or below this are the cut-back ground: in shadow, a little moss. */
  ground: number;

  constructor(
    readonly w: number,
    readonly h: number,
    o: { face?: number; fill?: number; ground?: number } = {},
  ) {
    this.face = o.face ?? 2;
    this.ground = o.ground ?? 0;
    this.cells = new Int8Array(w * h).fill(o.fill ?? this.face);
  }

  get top(): number {
    return this.face;
  }

  at(u: number, v: number): number {
    return this.cells[v * this.w + u];
  }

  /** Level of a cell; −1 outside the grid. */
  get(u: number, v: number): number {
    return u < 0 || v < 0 || u >= this.w || v >= this.h ? -1 : this.cells[v * this.w + u];
  }

  set(u: number, v: number, level: number, op: Op = 'set'): this {
    if (u < 0 || v < 0 || u >= this.w || v >= this.h) return this;
    const i = v * this.w + u;
    const c = this.cells[i];
    this.cells[i] = op === 'max' ? Math.max(c, level) : op === 'min' ? Math.min(c, level) : level;
    return this;
  }

  /** Every cell whose centre (x, y) passes `inside`, within a bounding box (cell units). */
  paint(u0: number, v0: number, u1: number, v1: number, inside: (x: number, y: number) => boolean, level: number, op: Op = 'set'): this {
    for (let v = Math.max(0, Math.floor(v0)); v < Math.min(this.h, Math.ceil(v1)); v++)
      for (let u = Math.max(0, Math.floor(u0)); u < Math.min(this.w, Math.ceil(u1)); u++) if (inside(u + 0.5, v + 0.5)) this.set(u, v, level, op);
    return this;
  }

  /** Cells with centres in [u0, u1) × [v0, v1). */
  rect(u0: number, v0: number, u1: number, v1: number, level: number, op: Op = 'set'): this {
    return this.paint(u0, v0, u1, v1, (x, y) => x >= u0 && x < u1 && y >= v0 && y < v1, level, op);
  }

  ellipse(cu: number, cv: number, ru: number, rv: number, level: number, op: Op = 'set'): this {
    return this.paint(cu - ru, cv - rv, cu + ru, cv + rv, (x, y) => ((x - cu) / ru) ** 2 + ((y - cv) / rv) ** 2 <= 1, level, op);
  }

  disc(cu: number, cv: number, r: number, level: number, op: Op = 'set'): this {
    return this.ellipse(cu, cv, r, r, level, op);
  }

  /** An elliptical ring `width` cells wide on the ellipse (cu, cv, ru, rv). */
  ring(cu: number, cv: number, ru: number, rv: number, width: number, level: number, op: Op = 'set'): this {
    const h = width / 2;
    return this.paint(cu - ru - h, cv - rv - h, cu + ru + h, cv + rv + h, (x, y) => {
      const a = Math.atan2((y - cv) / rv, (x - cu) / ru);
      const d = Math.hypot(x - cu - ru * Math.cos(a), y - cv - rv * Math.sin(a));
      return d <= h;
    }, level, op);
  }

  /** A filled polygon (even–odd). */
  poly(pts: readonly (readonly [number, number])[], level: number, op: Op = 'set'): this {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return this.paint(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (x, y) => inPoly(pts, x, y), level, op);
  }

  /** A polyline `width` cells thick. */
  line(pts: readonly (readonly [number, number])[], width: number, level: number, op: Op = 'set'): this {
    const h = width / 2;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return this.paint(Math.min(...xs) - h, Math.min(...ys) - h, Math.max(...xs) + h, Math.max(...ys) + h, (x, y) => distPolyline(pts, x, y) <= h, level, op);
  }

  /**
   * A spiral line from radius r0 at angle a0 (radians) winding `turns` times
   * (negative: clockwise) to radius r1 — a scroll's curl.
   */
  spiral(cu: number, cv: number, r0: number, r1: number, a0: number, turns: number, width: number, level: number, op: Op = 'set'): this {
    return this.line(spiralPts(cu, cv, r0, r1, a0, turns), width, level, op);
  }

  /**
   * Put a motif with its bottom-left cell at (u0, v0): each cell becomes
   * `ground` + the motif's level (default ground: the face minus the motif's
   * top, so its top lands on the face). `op` 'over' writes only the motif's
   * raised cells (level > 0); motif cells below 0 cut the stone away (−1).
   * `clip` leaves cells outside the silhouette (−1) alone, `where` limits it
   * to some cells, `flip` mirrors it, and `map` turns motif levels into
   * levels here itself (null: leave the cell).
   */
  stamp(m: Motif, u0: number, v0: number, o: { ground?: number; op?: Op | 'over'; flip?: boolean; clip?: boolean; where?: (u: number, v: number) => boolean; map?: (level: number) => number | null } = {}): this {
    const g = o.ground ?? this.face - m.top;
    const op = o.op ?? 'set';
    for (let v = 0; v < m.h; v++)
      for (let u = 0; u < m.w; u++) {
        if (o.clip && this.get(u0 + u, v0 + v) < 0) continue;
        if (o.where && !o.where(u0 + u, v0 + v)) continue;
        const a = m.at(o.flip ? m.w - 1 - u : u, v);
        if (o.map) {
          const lv = o.map(a);
          if (lv !== null) this.set(u0 + u, v0 + v, lv);
        } else if (a < 0) this.set(u0 + u, v0 + v, -1);
        else if (op === 'over') {
          if (a > 0) this.set(u0 + u, v0 + v, g + a);
        } else this.set(u0 + u, v0 + v, g + a, op);
      }
    return this;
  }

  /** Change every level through `fn` (return the new level; cells stay −1 unless fn says otherwise). */
  map(fn: (level: number, u: number, v: number) => number): this {
    for (let v = 0; v < this.h; v++) for (let u = 0; u < this.w; u++) this.cells[v * this.w + u] = fn(this.cells[v * this.w + u], u, v);
    return this;
  }

  /** The same relief mirrored left–right. */
  flipped(): Relief {
    const r = new Relief(this.w, this.h, { face: this.face, ground: this.ground });
    for (let v = 0; v < this.h; v++) for (let u = 0; u < this.w; u++) r.cells[v * this.w + u] = this.cells[v * this.w + this.w - 1 - u];
    return r;
  }
}

function inPoly(pts: readonly (readonly [number, number])[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distPolyline(pts: readonly (readonly [number, number])[], x: number, y: number): number {
  let best = Infinity;
  if (pts.length === 1) return Math.hypot(x - pts[0][0], y - pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

function spiralPts(cu: number, cv: number, r0: number, r1: number, a0: number, turns: number): [number, number][] {
  const n = Math.max(8, Math.ceil(Math.abs(turns) * 28));
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + turns * TAU * t;
    const r = r0 + (r1 - r0) * t;
    pts.push([cu + r * Math.cos(a), cv + r * Math.sin(a)]);
  }
  return pts;
}

/**
 * A motif from pixel art, top row first: '.' or ' ' = 0 (the ground), '+' = 1,
 * '#' = 2, '@' = 3, a digit = that level, 'x' = no stone. Its top is its
 * highest level (or `top`).
 */
export function art(lines: readonly string[], top?: number): Relief {
  const h = lines.length;
  const w = Math.max(...lines.map((l) => l.length));
  const key: Record<string, number> = { '.': 0, ' ': 0, '+': 1, '#': 2, '@': 3, x: -1 };
  const r = new Relief(w, h, { face: 0, fill: 0 });
  let hi = 0;
  lines.forEach((l, row) => {
    for (let u = 0; u < l.length; u++) {
      const ch = l[u];
      const lv = ch >= '0' && ch <= '9' ? +ch : (key[ch] ?? 0);
      r.set(u, h - 1 - row, lv);
      hi = Math.max(hi, lv);
    }
  });
  r.face = top ?? hi;
  return r;
}

// ── Motifs ────────────────────────────────────────────────────────────────

/**
 * A square key (meander) spiral in the cell rectangle x0‥x1 × y0‥y1
 * (inclusive): up the left side, along the top, down the right, back along
 * the bottom, then inwards with one-cell gaps — the sheet's key cartouche.
 */
function keySpiral(r: Relief, x0: number, y0: number, x1: number, y1: number, level: number, mirror: boolean): void {
  const put = (x: number, y: number) => r.set(mirror ? x0 + x1 - x : x, y, level);
  const seg = (ax: number, ay: number, bx: number, by: number) => {
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let i = 0; i <= n; i++) put(ax + Math.sign(bx - ax) * i, ay + Math.sign(by - ay) * i);
  };
  for (let n = 0; ; n++) {
    const L = x0 + 2 * n;
    const R = x1 - 2 * n;
    const T = y1 - 2 * n;
    const B = y0 + 2 * n;
    const start = n === 0 ? y0 : B - 2;
    if (T < start + 1 || R < L) break;
    seg(L, start, L, T);
    if (R < L + 1) break;
    seg(L, T, R, T);
    if (T < B) break;
    seg(R, T, R, B);
    if (R < L + 2) break;
    seg(R, B, L + 2, B);
  }
}

/**
 * A band of key cartouches (the sheet's cornice frieze): square key spirals
 * `unit` cells apart (default: as wide as tall, plus a gap), every other one
 * mirrored, between fillets `margin` cells high (default 1), on a cut-back
 * ground. Face level 1. Tiles seamlessly when `w` is a multiple of 2 × unit.
 */
export function keyBand(w: number, h: number, o: { unit?: number; margin?: number; phase?: number } = {}): Relief {
  const m = o.margin ?? 1;
  const kh = h - 2 * m;
  const unit = o.unit ?? kh + 2;
  const r = new Relief(w, h, { face: 1, fill: 0 });
  r.rect(0, 0, w, m, 1).rect(0, h - m, w, h, 1);
  if (kh < 3) return r;
  for (let k = -1, x = (o.phase ?? 0) - unit; x < w; k++, x += unit) keySpiral(r, x + 1, m, x + unit - 1, h - m - 1, 1, k % 2 !== 0);
  return r;
}

/**
 * Lozenges (the §13 diamond motif): diamonds as tall as the band, each with a
 * nested diamond cut inside and a raised boss, touching tip to tip. Face 2.
 */
export function lozenges(w: number, h: number, o: { phase?: number } = {}): Relief {
  const r = new Relief(w, h, { face: 2, fill: 0 });
  const R = (h - 1) / 2;
  const p = 2 * Math.floor(R) + 2;
  for (let v = 0; v < h; v++)
    for (let u = 0; u < w; u++) {
      const x = (((u + (o.phase ?? 0)) % p) + p) % p;
      const d = Math.abs(x - p / 2 + 0.5) + Math.abs(v - R);
      // Outline raised, a groove inside it, the inner diamond a step down, a boss at its heart.
      if (d <= R) r.set(u, v, d > R - 1 ? 2 : d > R - 2 ? 0 : d > R - 3 ? 1 : 2);
    }
  return r;
}

/**
 * A lotus rosette in a d × d square: `petals` pointed petals with a groove
 * down each and between them, around a raised heart ringed by a groove. Face 2.
 */
export function rosette(d: number, o: { petals?: number } = {}): Relief {
  const n = o.petals ?? 8;
  const r = new Relief(d, d, { face: 2, fill: 0 });
  const c = d / 2;
  for (let v = 0; v < d; v++)
    for (let u = 0; u < d; u++) {
      const x = u + 0.5 - c;
      const y = v + 0.5 - c;
      const rr = Math.hypot(x, y) / c;
      const a = Math.atan2(y, x) + Math.PI / 2;
      const s = Math.abs(((((a / TAU) * n) % 1) + 1) % 1 - 0.5) * 2; // 0 at a petal's axis, 1 between petals
      if (rr <= 0.3) r.set(u, v, 2);
      else if (rr <= 0.42) r.set(u, v, 0);
      else if (rr <= 1) {
        const half = 0.95 * Math.pow(Math.max(0, 1 - (rr - 0.42) / 0.58), 0.55);
        if (s <= half) r.set(u, v, d >= 14 && s < 0.18 && rr > 0.55 && rr < 0.85 ? 1 : 2);
      }
    }
  return r;
}

/**
 * A band of lotus petals (the pendant petals under Khmer cornices): pointed
 * arches `width` cells wide (default ≈ the band's height), each with a groove
 * following its outline; `down` hangs them from the top. Face 2.
 */
export function petals(w: number, h: number, o: { width?: number; down?: boolean; phase?: number } = {}): Relief {
  const pw = o.width ?? Math.max(4, Math.round(h * 0.9));
  const r = new Relief(w, h, { face: 2, fill: 0 });
  for (let v = 0; v < h; v++)
    for (let u = 0; u < w; u++) {
      const x = (((u + (o.phase ?? 0)) % pw) + pw) % pw;
      const s = Math.abs(x + 0.5 - pw / 2) / (pw / 2); // 0 at the petal's axis
      const t = (o.down ? h - 1 - v : v) / Math.max(1, h - 1); // 0 at its base, 1 at its tip
      const half = Math.sqrt(Math.max(0, 1 - t * t)) * (1 - 0.35 * t) * 0.94;
      if (s > half) continue;
      const inner = half - 1.6 / (pw / 2);
      r.set(u, v, h >= 6 && pw >= 6 && s > inner && s <= inner + 1 / (pw / 2) && t < 0.8 ? 1 : 2);
    }
  return r;
}

/** A string of round beads (pearls) along a band, `pitch` cells apart. Face 1. */
export function beads(w: number, h: number, o: { pitch?: number } = {}): Relief {
  const pitch = o.pitch ?? Math.max(2, h);
  const r = new Relief(w, h, { face: 1, fill: 0 });
  for (let x = pitch / 2; x < w + pitch; x += pitch) r.ellipse(x, h / 2, pitch * 0.42, h * 0.42, 1);
  return r;
}

/**
 * A foliate scroll (rinceau): a wavy stem with a curl rolled into each wave
 * and a leaf at each turn, the Khmer garland band. `period` cells per wave
 * (default ≈ 2.4 × the height). Face 2 (stem and curls), leaves 1.
 */
export function scroll(w: number, h: number, o: { period?: number; phase?: number; stem?: number } = {}): Relief {
  const P = o.period ?? Math.max(8, Math.round(h * 2.4));
  const r = new Relief(w, h, { face: 2, fill: 0 });
  const mid = h / 2;
  const A = h * 0.24;
  const sw = o.stem ?? Math.max(1, h / 8);
  const ph = o.phase ?? 0;
  const stem: [number, number][] = [];
  for (let u = -P; u <= w + P; u += 0.5) stem.push([u, mid + A * Math.sin(((u + ph) / P) * TAU)]);
  r.line(stem, sw, 2);
  // In every half wave, a curl rolls in towards the wave's hollow, a leaf hangs outside it.
  for (let k = -2; (k * P) / 2 < w + P; k++) {
    const uc = (k * P) / 2 + P / 4 - ph;
    const up = k % 2 === 0 ? 1 : -1;
    const cr = Math.min(P * 0.2, h * 0.3);
    const cx = uc + P * 0.2;
    const cy = mid + up * (A - cr * 0.9);
    const start = up > 0 ? Math.PI / 2 : -Math.PI / 2;
    r.spiral(cx, cy, cr, cr * 0.2, start, up * -0.95, sw, 2);
    r.ellipse(uc - P * 0.12, mid - up * h * 0.26, P * 0.1, h * 0.12, 1, 'max');
  }
  return r;
}

/**
 * A scroll's end rolled into a curl — the "?" at the ends of lintels and the
 * base of pediments (a naga or makara turning back). `size` cells square;
 * `right` curls the other way. Face 2.
 */
export function curl(size: number, o: { right?: boolean } = {}): Relief {
  const r = new Relief(size, size, { face: 2, fill: 0 });
  const c = size / 2;
  const sw = Math.max(1, size / 7);
  r.spiral(c, c + size * 0.05, size * 0.4, size * 0.06, -Math.PI / 2, -1.2, sw, 2);
  r.line([[c, c - size * 0.35], [c, 0]], sw, 2);
  return o.right ? r.flipped() : r;
}

/**
 * Foliage filling a field (a tympanum, a panel): curls on a staggered grid
 * `pitch` cells apart, turning alternately, each with a leaf beside it — the
 * dense scrollwork of the sheets' pediments. Face 2 (curls), leaves 1.
 */
export function foliage(w: number, h: number, o: { pitch?: number } = {}): Relief {
  const p = o.pitch ?? 9;
  const r = new Relief(w, h, { face: 2, fill: 0 });
  const sw = Math.max(1, p / 6.5);
  for (let row = 0; row * p * 0.8 < h + p; row++) {
    const y = row * p * 0.8 + p * 0.4;
    for (let col = -1; col * p < w + p; col++) {
      const x = col * p + (row % 2 ? p / 2 : 0) + p / 2;
      const d = (row + col) % 2 ? 1 : -1;
      r.spiral(x, y, p * 0.4, p * 0.1, d > 0 ? -Math.PI / 2 : Math.PI / 2, d * 0.9, sw, 2, 'max');
      r.ellipse(x - d * p * 0.42, y + p * 0.32, Math.max(0.8, p * 0.11), Math.max(1, p * 0.16), 1, 'max');
    }
  }
  return r;
}

/**
 * A naga's hooded heads rearing up, as they end the frames of pediments: a
 * fan of five cobra hoods spread on top (the middle one highest), each
 * pointing out from the fan's heart, against a flame-edged halo; the neck
 * banded with belly scales; the body coming in along the bottom from the left
 * and rolling up into a curl at the neck's foot (the sheet's "?" ends).
 * Outside its silhouette −1. Heads and body 2 (the face), halo 1, grooves 0.
 */
export function nagaHood(w: number, h: number): Relief {
  const r = new Relief(w, h, { face: 2, fill: -1 });
  const cx = w / 2;
  const R = w * 0.27;
  const fc = h - R - w * 0.17;
  const nw = w * 0.15;
  // A head: an oval pointing out along angle a (from vertical), rounded hood at its tip.
  const head = (a: number, lv: number, grow = 0) => {
    const [dx, dy] = [Math.sin(a), Math.cos(a)];
    const [hx, hy] = [cx + dx * R, fc + dy * R];
    const [ra, rt] = [w * 0.15 + grow, w * 0.095 + grow];
    r.paint(hx - ra - 1, hy - ra - 1, hx + ra + 1, hy + ra + 1, (x, y) => {
      const along = (x - hx) * dx + (y - hy) * dy;
      const across = (x - hx) * dy - (y - hy) * dx;
      return (along / ra) ** 2 + (across / rt) ** 2 <= 1;
    }, lv, 'max');
  };
  const angles = [-2, -1, 0, 1, 2].map((k) => (k * Math.PI) / 5.2);
  // Halo: a disc behind the fan, showing between the heads.
  r.disc(cx, fc, R + w * 0.08, 1, 'max');
  for (const a of angles) head(a, 2);
  r.disc(cx, fc, R * 0.55, 2, 'max');
  // Neck and the body along the bottom, rolled into a curl beside the neck.
  const bh = Math.max(2, Math.round(h * 0.12));
  r.rect(0, 0, cx + nw, bh, 2);
  r.rect(cx - nw, 0, cx + nw, fc, 2);
  const cr = Math.min(w * 0.26, h * 0.2);
  const [kx, ky] = [Math.min(w - cr - 0.5, cx + nw + cr * 0.75), bh + cr * 0.85];
  r.disc(kx, ky, cr + 0.5, 2);
  r.spiral(kx, ky, cr * 0.8, 0.3, -Math.PI / 2, 1.25, Math.max(1, w / 16), 0);
  r.rect(cx + nw, 0, kx + cr * 0.2, bh, 2);
  // Belly scales across the neck, a groove round the fan's heart.
  for (let y = bh + 2; y < fc - R * 0.6; y += 3) r.rect(cx - nw + 1, y, cx + nw - 1, y + 1, 1);
  r.ring(cx, fc, R * 0.55, R * 0.55, 1, 0);
  return r;
}

/** Figures of the reliefs: a standing devata, a four-armed deity, a kneeling worshipper. */
export type FigurePose = 'devata' | 'deity' | 'kneel';

/**
 * A figure `h` cells tall, frontal, as the sheets' reliefs draw them: the body
 * raised to the face (level 2), belt, necklace and crown band cut a step
 * (level 1), the ground around it 0. Width ≈ 0.45 h (deity 0.62 h).
 */
export function figure(h: number, pose: FigurePose = 'devata'): Relief {
  const wide = pose === 'deity' ? 0.62 : pose === 'kneel' ? 0.5 : 0.46;
  const w = Math.max(3, Math.round(h * wide));
  const r = new Relief(w, h, { face: 2, fill: 0 });
  const P = (x: number, y: number): [number, number] => [w / 2 + x * h, y * h];
  const poly = (pts: [number, number][], lv = 2, op: Op = 'max') => r.poly(pts.map(([x, y]) => P(x, y)), lv, op);
  const line = (pts: [number, number][], width: number, lv = 2) => r.line(pts.map(([x, y]) => P(x, y)), Math.max(1, width * h), lv, 'max');
  const oval = (x: number, y: number, rx: number, ry: number, lv = 2, op: Op = 'max') => r.ellipse(...P(x, y), Math.max(0.5, rx * h), Math.max(0.5, ry * h), lv, op);
  const band = (y0: number, y1: number, hw: number) => r.rect(w / 2 - hw * h, y0 * h, w / 2 + hw * h, y1 * h, 1, 'min');
  const head = (y: number, crown: number) => {
    line([[0, y - 0.07], [0, y - 0.03]], 0.07);
    oval(0, y + 0.04, 0.062, 0.072);
    poly([[-0.06, y + 0.09], [0.06, y + 0.09], [0.03, y + 0.09 + crown * 0.6], [0, y + 0.09 + crown], [-0.03, y + 0.09 + crown * 0.6]]);
    if (h >= 24) band(y + 0.09, y + 0.105, 0.06);
  };
  if (pose === 'kneel') {
    // Kneeling in profile to the right, hands joined in front of the face.
    poly([[-0.2, 0], [0.16, 0], [0.18, 0.14], [0.02, 0.2], [-0.16, 0.2]]);
    poly([[-0.1, 0.18], [0.07, 0.18], [0.08, 0.5], [-0.08, 0.52]]);
    line([[0.05, 0.46], [0.15, 0.52], [0.14, 0.64]], 0.055);
    oval(0.14, 0.66, 0.035, 0.04);
    head(0.56, 0.14);
    if (h >= 20) band(0.3, 0.33, 0.1);
    return r;
  }
  // Feet turned out, as Khmer reliefs show them.
  poly([[-0.14, 0], [0.14, 0], [0.12, 0.035], [-0.12, 0.035]]);
  if (pose === 'deity') {
    // Legs apart under a short sampot, broad shoulders, four arms with the disc, conch, club and orb.
    poly([[-0.1, 0.03], [-0.015, 0.03], [-0.02, 0.3], [-0.11, 0.3]]);
    poly([[0.015, 0.03], [0.1, 0.03], [0.11, 0.3], [0.02, 0.3]]);
    poly([[-0.13, 0.28], [0.13, 0.28], [0.115, 0.47], [-0.115, 0.47]]);
    poly([[-0.1, 0.46], [0.1, 0.46], [0.16, 0.68], [-0.16, 0.68]]);
    line([[-0.15, 0.66], [-0.25, 0.62], [-0.27, 0.74]], 0.045);
    line([[0.15, 0.66], [0.25, 0.62], [0.27, 0.74]], 0.045);
    oval(-0.27, 0.78, 0.04, 0.04);
    oval(0.27, 0.78, 0.035, 0.045);
    line([[-0.15, 0.6], [-0.22, 0.5], [-0.23, 0.42]], 0.045);
    line([[0.15, 0.6], [0.22, 0.5], [0.23, 0.44]], 0.045);
    line([[-0.23, 0.44], [-0.23, 0.1]], 0.04);
    oval(0.23, 0.42, 0.035, 0.035);
    band(0.45, 0.48, 0.12);
    band(0.64, 0.66, 0.1);
    head(0.7, 0.22);
    return r;
  }
  // Devata: long sampot flaring at the hem, slim waist, one hand holding a flower up.
  poly([[-0.09, 0.03], [0.09, 0.03], [0.125, 0.43], [-0.125, 0.43]]);
  poly([[0.1, 0.26], [0.2, 0.2], [0.13, 0.42]]);
  poly([[-0.125, 0.42], [0.125, 0.42], [0.085, 0.53], [-0.085, 0.53]]);
  poly([[-0.085, 0.52], [0.085, 0.52], [0.13, 0.68], [-0.13, 0.68]]);
  line([[-0.14, 0.66], [-0.175, 0.53], [-0.15, 0.44]], 0.045);
  oval(-0.14, 0.43, 0.03, 0.03);
  line([[0.14, 0.66], [0.19, 0.57], [0.11, 0.62]], 0.045);
  oval(0.1, 0.645, 0.035, 0.035);
  line([[0.1, 0.66], [0.09, 0.74]], 0.02);
  oval(0.09, 0.76, 0.03, 0.025);
  band(0.415, 0.44, 0.13);
  band(0.64, 0.655, 0.11);
  if (h >= 24) line([[0, 0.05], [0, 0.4]], 0.02, 1);
  head(0.7, 0.24);
  return r;
}

/**
 * A pointed niche w × h: a frame `frame` cells wide (default w / 8) following
 * a pointed arch, the inside cut to the ground (0), the frame at the face
 * (2), outside the arch nothing (−1).
 */
export function niche(w: number, h: number, o: { frame?: number } = {}): Relief {
  const f = o.frame ?? Math.max(1, Math.round(w / 8));
  const r = new Relief(w, h, { face: 2, fill: -1 });
  // A pointed (two-centred) arch of half-width hw over a rectangle, top at h.
  const arch = (hw: number, top: number) => (x: number, y: number) => {
    const dx = Math.abs(x - w / 2);
    const spring = top - hw * 1.15;
    if (dx > hw || y > top) return false;
    if (y < spring) return true;
    const t = (y - spring) / (top - spring);
    return dx <= hw * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - 0.3 * t);
  };
  r.paint(0, 0, w, h, arch(w / 2, h), 2);
  const inner = arch(w / 2 - f, h - f);
  r.paint(0, 0, w, h, (x, y) => y > f * 0.5 && inner(x, y), 0);
  return r;
}

/**
 * The kala: a monster's face without a lower jaw — bulging ringed eyes under
 * heavy brows, a broad nose, a grin of upper teeth, a diadem, and two hands
 * at the corners of the mouth holding the garland. Face 2.
 */
export function kala(w: number, h: number): Relief {
  const r = new Relief(w, h, { face: 2, fill: 0 });
  const X = (x: number) => w / 2 + x * w;
  const Y = (y: number) => y * h;
  r.ellipse(X(0), Y(0.55), w * 0.38, h * 0.45, 2);
  // Diadem with flame points.
  r.rect(X(-0.33), Y(0.8), X(0.33), Y(0.92), 1);
  for (let k = -2; k <= 2; k++) r.poly([[X(k * 0.14 - 0.05), Y(0.9)], [X(k * 0.14 + 0.05), Y(0.9)], [X(k * 0.14), Y(1.0)]], 2, 'max');
  for (const s of [-1, 1]) {
    // Ringed, bulging eyes under a brow.
    r.ring(X(s * 0.15), Y(0.64), w * 0.09, h * 0.1, Math.max(1, w * 0.035), 0);
    r.ellipse(X(s * 0.15), Y(0.64), w * 0.045, h * 0.05, 2);
    r.line([[X(s * 0.05), Y(0.74)], [X(s * 0.16), Y(0.79)], [X(s * 0.27), Y(0.73)]], Math.max(1, h * 0.06), 2);
    // Ear flames at the sides.
    r.poly([[X(s * 0.36), Y(0.4)], [X(s * 0.5), Y(0.55)], [X(s * 0.38), Y(0.72)]], 2, 'max');
    // Hands at the corners of the mouth.
    r.ellipse(X(s * 0.38), Y(0.2), w * 0.09, h * 0.12, 2, 'max');
    r.line([[X(s * 0.35), Y(0.13)], [X(s * 0.35), Y(0.27)]], 1, 1);
  }
  // Nose and the grinning mouth.
  r.rect(X(-0.07), Y(0.44), X(0.07), Y(0.6), 2);
  r.rect(X(-0.055), Y(0.44), X(-0.02), Y(0.48), 1).rect(X(0.02), Y(0.44), X(0.055), Y(0.48), 1);
  r.rect(X(-0.27), Y(0.14), X(0.27), Y(0.38), 0);
  for (let x = X(-0.25); x < X(0.25); x += Math.max(2, w * 0.08)) r.rect(x, Y(0.28), x + Math.max(1, w * 0.04), Y(0.38), 2);
  r.rect(X(-0.27), Y(0.14), X(-0.2), Y(0.3), 2).rect(X(0.2), Y(0.14), X(0.27), Y(0.3), 2);
  return r;
}

/** An oval medallion: a raised ring round a small rosette, a groove between. Face 2. */
export function medallion(w: number, h: number): Relief {
  const r = new Relief(w, h, { face: 2, fill: 0 });
  const ring = Math.max(1, Math.min(w, h) / 7);
  r.ellipse(w / 2, h / 2, w / 2 - 0.2, h / 2 - 0.2, 2);
  r.ellipse(w / 2, h / 2, w / 2 - ring - 0.2, h / 2 - ring - 0.2, 0);
  const d = Math.max(3, Math.round(Math.min(w, h) - 2 * ring - 2));
  const ros = rosette(d, { petals: d >= 10 ? 8 : 4 });
  r.stamp(ros, Math.round(w / 2 - d / 2), Math.round(h / 2 - d / 2), { op: 'over', ground: 0 });
  return r;
}

/**
 * Wear a relief: raised cells at the edge of a step lose a level in patches
 * (`amount` 0‥1); with `chip`, cells on the silhouette may break off.
 */
export function weather(r: Relief, amount: number, seed: number, o: { chip?: boolean } = {}): Relief {
  if (amount <= 0) return r;
  const src = r.cells.slice();
  const at = (u: number, v: number) => (u < 0 || v < 0 || u >= r.w || v >= r.h ? -1 : src[v * r.w + u]);
  for (let v = 0; v < r.h; v++)
    for (let u = 0; u < r.w; u++) {
      const lv = at(u, v);
      if (lv <= r.ground) continue;
      let low = 99;
      for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) low = Math.min(low, at(u + du, v + dv));
      if (low >= lv) continue;
      const n = valueNoise3(u * 0.21, v * 0.21, 0.5, seed);
      if (hash3(u, v, 7, seed) >= amount * (0.2 + 1.3 * n)) continue;
      r.cells[v * r.w + u] = low < 0 && o.chip && hash3(u, v, 9, seed) < 0.6 ? -1 : lv - 1;
    }
  return r;
}

/**
 * Stones for a relief laid in courses: rows `rows` cells high (bottom first;
 * the last repeats), stones `len` cells long in running bond. Returns the
 * stone number of each cell (for {@link StoneWork.slab}).
 */
export function courses(w: number, h: number, rows: number | readonly number[], len: [number, number], seed: number): (u: number, v: number) => number {
  const heights = typeof rows === 'number' ? [rows] : rows;
  const ids = new Int32Array(w * h);
  let v0 = 0;
  for (let row = 0; v0 < h; row++) {
    const rh = heights[Math.min(row, heights.length - 1)];
    let u = 0;
    let n = 0;
    const cut: number[] = [];
    if (row % 2 === 1) {
      const part = Math.round(((len[0] + len[1]) / 4) * (0.8 + 0.4 * hash3(row, 1, 3, seed)));
      if (part > 1 && part < w) cut.push((u = part));
    }
    while (u < w) {
      let l = Math.round(len[0] + (len[1] - len[0]) * hash3(row, n++, 5, seed));
      if (w - (u + l) < len[0] * 0.5) l = w - u;
      cut.push((u += l));
    }
    for (let v = v0; v < Math.min(h, v0 + rh); v++) {
      let s = 0;
      for (let x = 0; x < w; x++) {
        while (x >= cut[s]) s++;
        ids[v * w + x] = row * 1000 + s;
      }
    }
    v0 += rh;
  }
  return (u, v) => ids[Math.min(h - 1, Math.max(0, v)) * w + Math.min(w - 1, Math.max(0, u))];
}

// ── Stones ────────────────────────────────────────────────────────────────

/** A relief cut into one face of a stone (see {@link StoneWork.stone}). */
export interface Carving {
  /** The face (a FACE bit: pz, nz, px, nx or py). */
  face: number;
  relief: Relief;
  /**
   * Where the relief's cell (0, 0) corner lies (metres): the left end of its
   * bottom row as seen looking at the face (on a top face, the front-left
   * corner), on the face's plane — only stones with a face on that plane take
   * the carving.
   */
  at: V3;
  /** Cell size (default {@link HALF}) and depth of a level (default the cell). */
  cell?: number;
  step?: number;
}

export interface StoneWorkOptions {
  /** Look of a stone from its centre, e.g. `finishLook(STONE_FINISH.warm, seed)`. */
  look: (x: number, y: number, z: number) => StoneLook;
  seed: number;
  /** Brightness of the cut-back ground (linear multiplier, default 0.3: about half as bright as the face). */
  ground?: number;
  /** Moss in the recesses (0‥1, default 0.15). */
  recessMoss?: number;
  /** Share of the stones' moss kept on the carved face (default 0.5). */
  faceMoss?: number;
}

interface Piece {
  b: Box6;
  stone: number;
  color: number;
  shade: number;
  surf: Surf;
}

/** Local frame of a face: (u right, v up, w out of the face) → world. */
type Frame = (u: number, v: number, w: number) => V3;

function frameOf(face: number, o: V3): Frame {
  switch (face) {
    case FACE.nz:
      return (u, v, w) => [o[0] - u, o[1] + v, o[2] - w];
    case FACE.px:
      return (u, v, w) => [o[0] + w, o[1] + v, o[2] - u];
    case FACE.nx:
      return (u, v, w) => [o[0] - w, o[1] + v, o[2] + u];
    case FACE.py:
      return (u, v, w) => [o[0] + u, o[1] + w, o[2] - v];
    default:
      return (u, v, w) => [o[0] + u, o[1] + v, o[2] + w];
  }
}

function localOf(face: number, o: V3, p: V3): V3 {
  switch (face) {
    case FACE.nz:
      return [o[0] - p[0], p[1] - o[1], o[2] - p[2]];
    case FACE.px:
      return [o[2] - p[2], p[1] - o[1], p[0] - o[0]];
    case FACE.nx:
      return [p[2] - o[2], p[1] - o[1], o[0] - p[0]];
    case FACE.py:
      return [p[0] - o[0], o[2] - p[2], p[1] - o[1]];
    default:
      return [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
  }
}

function frameBox(f: Frame, u0: number, v0: number, w0: number, u1: number, v1: number, w1: number): Box6 {
  const a = f(u0, v0, w0);
  const b = f(u1, v1, w1);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
}

/** Axis (0 x, 1 y, 2 z) and side (+1 / −1) of a FACE bit. */
const axisOf = (face: number): [number, 1 | -1] => [face === FACE.px || face === FACE.nx ? 0 : face === FACE.py || face === FACE.ny ? 1 : 2, face === FACE.px || face === FACE.py || face === FACE.pz ? 1 : -1];

/**
 * Greedy rectangles over a w × h grid of keys (null = nothing): each maximal
 * run along u, grown along v while whole rows match.
 */
function greedy(w: number, h: number, key: (u: number, v: number) => number | null, emit: (u0: number, v0: number, u1: number, v1: number, k: number) => void): void {
  const used = new Uint8Array(w * h);
  for (let v = 0; v < h; v++)
    for (let u = 0; u < w; u++) {
      if (used[v * w + u]) continue;
      const k = key(u, v);
      if (k === null) continue;
      let u1 = u + 1;
      while (u1 < w && !used[v * w + u1] && key(u1, v) === k) u1++;
      let v1 = v + 1;
      grow: while (v1 < h) {
        for (let x = u; x < u1; x++) if (used[v1 * w + x] || key(x, v1) !== k) break grow;
        v1++;
      }
      for (let y = v; y < v1; y++) for (let x = u; x < u1; x++) used[y * w + x] = 1;
      emit(u, v, u1, v1, k);
    }
}

/** A colour pulled towards its own grey (shadowed stone reads less saturated). */
function greyer(hex: number, t: number): number {
  const [r, g, b] = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  const m = (c: number) => Math.round(c + (l - c) * t);
  return (m(r) << 16) | (m(g) << 8) | m(b);
}

/**
 * Dressed stones with carved faces (see the file comment). Add stones and
 * slabs, then `emit` once into a VoxelBuilder.
 */
export class StoneWork {
  private readonly stones: { look: StoneLook; src?: SourceTrace }[] = [];
  private readonly pieces: Piece[] = [];

  constructor(readonly o: StoneWorkOptions) {}

  /** Number of stones laid. */
  get count(): number {
    return this.stones.length;
  }

  private newStone(centre: V3, look?: StoneLook): number {
    this.stones.push({ look: look ?? this.o.look(...centre), src: here() });
    return this.stones.length - 1;
  }

  /** Change a stone's look (e.g. moss on a top course). */
  restyle(id: number, fn: (l: StoneLook) => StoneLook): void {
    this.stones[id].look = fn(this.stones[id].look);
  }

  /** The look of a box of stone `id` at a relief level (null = the stone's body). */
  private put(b: Box6, id: number, level: number | null, r?: Relief): void {
    if (b[3] - b[0] < 1e-6 || b[4] - b[1] < 1e-6 || b[5] - b[2] < 1e-6) return;
    const s = this.stones[id].look;
    let color = s.color;
    let shade = s.shade ?? 1;
    let surf = s.surf;
    if (level !== null && r) {
      if (level <= r.ground) {
        // The cut-back ground: the stone in shadow, a little greyer, deeper cuts darker; moss in patches.
        const [cx, cy, cz] = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
        const n = valueNoise3(cx / 0.35, cy / 0.35, cz / 0.35, this.o.seed + 17);
        color = greyer(color, 0.25);
        shade *= (this.o.ground ?? 0.3) * Math.max(0.6, 1 - 0.14 * (r.ground - level));
        surf = [clamp01((this.o.recessMoss ?? 0.15) * (2.4 * n - 0.5)), 0, 0, clamp01(s.surf[3] * 0.4)];
      } else {
        shade *= 1 - 0.04 * Math.max(0, r.face - level);
        surf = [s.surf[0] * (this.o.faceMoss ?? 0.5), s.surf[1], s.surf[2], s.surf[3]];
      }
    }
    this.pieces.push({ b, stone: id, color, shade, surf });
  }

  /**
   * A dressed stone (min/max corners, metres) with reliefs cut into some of
   * its faces. Each carving takes the cells of its relief that fall on this
   * face (so one relief can run across a course of stones) and cuts the face
   * back by the relief's depth there. A later carving yields to an earlier one
   * where they meet (at a corner). `join` adds the box to an existing stone
   * (a stepped profile cut from one block). Returns the stone's number.
   */
  stone(box: Box6, carve: readonly Carving[] = [], o: { look?: StoneLook; join?: number } = {}): number {
    const id = o.join ?? this.newStone([(box[0] + box[3]) / 2, (box[1] + box[4]) / 2, (box[2] + box[5]) / 2], o.look);
    let body: Box6[] = [box];
    const regions: Box6[] = [];
    for (const c of carve) {
      const r = c.relief;
      const cell = c.cell ?? HALF;
      const step = c.step ?? cell;
      const [ax, side] = axisOf(c.face);
      if (Math.abs(c.at[ax] - (side > 0 ? box[ax + 3] : box[ax])) > 1e-6) continue;
      const origin = c.at;
      const f = frameOf(c.face, origin);
      const a = localOf(c.face, origin, [box[0], box[1], box[2]]);
      const b = localOf(c.face, origin, [box[3], box[4], box[5]]);
      const i0 = Math.max(0, Math.round(Math.min(a[0], b[0]) / cell));
      const i1 = Math.min(r.w, Math.round(Math.max(a[0], b[0]) / cell));
      const j0 = Math.max(0, Math.round(Math.min(a[1], b[1]) / cell));
      const j1 = Math.min(r.h, Math.round(Math.max(a[1], b[1]) / cell));
      if (i1 <= i0 || j1 <= j0) continue;
      const D = Math.min((r.face + 1) * step, Math.abs(Math.max(a[2], b[2]) - Math.min(a[2], b[2])));
      const region = frameBox(f, i0 * cell, j0 * cell, -D, i1 * cell, j1 * cell, 0);
      body = body.flatMap((q) => subtractBox(q, region));
      greedy(i1 - i0, j1 - j0, (u, v) => Math.max(0, r.at(i0 + u, j0 + v)), (u0, v0, u1, v1, lv) => {
        let parts = [frameBox(f, (i0 + u0) * cell, (j0 + v0) * cell, -D, (i0 + u1) * cell, (j0 + v1) * cell, (lv - r.face) * step)];
        for (const q of regions) parts = parts.flatMap((p) => subtractBox(p, q));
        for (const p of parts) this.put(p, id, lv, r);
      });
      regions.push(region);
    }
    for (const q of body) this.put(q, id, null);
    return id;
  }

  /**
   * A slab of stone shaped by a relief's silhouette (cells at −1 are empty):
   * the relief's face plane through `at` (its cell (0, 0) corner), looking
   * along `facing` (default +z), the slab running `back` metres behind it with
   * a flat back. `depth` gives some cells a shallower back (metres behind
   * the face: flame tongues and heads carved as thinner plates). `stones`
   * splits it into stones (default one); `look` gives a stone's look from its
   * number and centre.
   */
  slab(r: Relief, o: { at: V3; back: number; depth?: (u: number, v: number) => number | undefined; facing?: number; cell?: number; step?: number; stones?: (u: number, v: number) => number; look?: (stone: number, centre: V3) => StoneLook | undefined }): void {
    const cell = o.cell ?? HALF;
    const step = o.step ?? cell;
    const f = frameOf(o.facing ?? FACE.pz, o.at);
    const Dmax = (r.face + 1) * step;
    const backOf = (u: number, v: number) => Math.round((o.depth?.(u, v) ?? o.back) * 64) / 64;
    const local = o.stones ?? (() => 0);
    // Stone numbers, and each stone's centre for its look.
    const ids = new Map<number, number>();
    const sums = new Map<number, [number, number, number]>();
    for (let v = 0; v < r.h; v++)
      for (let u = 0; u < r.w; u++) {
        if (r.at(u, v) < 0) continue;
        const s = local(u, v);
        const a = sums.get(s) ?? [0, 0, 0];
        a[0] += u;
        a[1] += v;
        a[2]++;
        sums.set(s, a);
      }
    for (const [s, [su, sv, n]] of sums) {
      const c = f((su / n + 0.5) * cell, (sv / n + 0.5) * cell, -o.back / 2);
      ids.set(s, this.newStone(c, o.look?.(s, c)));
    }
    const sid = (u: number, v: number) => ids.get(local(u, v))!;
    // Body: the stones' silhouettes behind the relief layer (keyed by stone and depth).
    greedy(r.w, r.h, (u, v) => (r.at(u, v) < 0 || backOf(u, v) <= Dmax + 1e-6 ? null : sid(u, v) * 4096 + Math.round(backOf(u, v) * 64)), (u0, v0, u1, v1, k) =>
      this.put(frameBox(f, u0 * cell, v0 * cell, -(k % 4096) / 64, u1 * cell, v1 * cell, -Dmax), Math.floor(k / 4096), null),
    );
    // The relief layer: rectangles of one level within one stone (thin cells keep their own back).
    greedy(r.w, r.h, (u, v) => (r.at(u, v) < 0 ? null : (sid(u, v) * 2 + (backOf(u, v) < Dmax - 1e-6 ? 1 : 0)) * 64 + r.at(u, v)), (u0, v0, u1, v1, k) => {
      const lv = k % 64;
      const thin = Math.floor(k / 64) % 2 === 1;
      const w0 = thin ? backOf(u0, v0) : Dmax;
      this.put(frameBox(f, u0 * cell, v0 * cell, -w0, u1 * cell, v1 * cell, (lv - r.face) * step), Math.floor(k / 128), lv, r);
    });
  }

  /** Bounds of everything laid (metres). */
  bounds(): Box6 {
    const b: Box6 = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const { b: q } of this.pieces) for (let a = 0; a < 3; a++) (b[a] = Math.min(b[a], q[a])), (b[a + 3] = Math.max(b[a + 3], q[a + 3]));
    return b;
  }

  /**
   * Emit every box. Each side is sampled on the half-texel grid just outside
   * it: any air → exposed (rounded, rim-lit); all the same stone → merged
   * flat; otherwise a masonry joint. Returns the number of boxes.
   */
  emit(v: VoxelBuilder): number {
    const P = this.pieces;
    const B = 0.25;
    const key = (x: number, y: number, z: number) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
    const buckets = new Map<number, number[]>();
    const E = 1e-6;
    P.forEach(({ b }, i) => {
      for (let x = Math.floor(b[0] / B + E); x <= Math.floor(b[3] / B - E); x++)
        for (let y = Math.floor(b[1] / B + E); y <= Math.floor(b[4] / B - E); y++)
          for (let z = Math.floor(b[2] / B + E); z <= Math.floor(b[5] / B - E); z++) {
            const k = key(x, y, z);
            const l = buckets.get(k);
            if (l) l.push(i);
            else buckets.set(k, [i]);
          }
    });
    const owner = (p: V3): number => {
      for (const j of buckets.get(key(Math.floor(p[0] / B), Math.floor(p[1] / B), Math.floor(p[2] / B))) ?? []) {
        const q = P[j].b;
        if (p[0] > q[0] + E && p[0] < q[3] - E && p[1] > q[1] + E && p[1] < q[4] - E && p[2] > q[2] + E && p[2] < q[5] - E) return P[j].stone;
      }
      return -1;
    };
    const p: V3 = [0, 0, 0];
    for (const pc of P) {
      const { b } = pc;
      let open = 0;
      let merge = 0;
      let joint = 0;
      for (let bit = 0; bit < 6; bit++) {
        const ax = bit >> 1;
        const [ua, wa] = [(ax + 1) % 3, (ax + 2) % 3];
        p[ax] = bit & 1 ? b[ax] - 1e-4 : b[ax + 3] + 1e-4;
        const lu = b[ua + 3] - b[ua];
        const lw = b[wa + 3] - b[wa];
        const nu = Math.min(40, Math.max(1, Math.round(lu / HALF)));
        const nw = Math.min(40, Math.max(1, Math.round(lw / HALF)));
        let air = false;
        let other = false;
        for (let i = 0; i < nu && !air; i++)
          for (let k = 0; k < nw && !air; k++) {
            p[ua] = b[ua] + ((i + 0.5) * lu) / nu;
            p[wa] = b[wa] + ((k + 0.5) * lw) / nw;
            const o = owner(p);
            if (o < 0) air = true;
            else if (o !== pc.stone) other = true;
          }
        if (air) open |= 1 << bit;
        else if (other) joint |= 1 << bit;
        else merge |= 1 << bit;
      }
      const src = this.stones[pc.stone].src;
      v.box((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2, b[3] - b[0], b[4] - b[1], b[5] - b[2], pc.color, 'sandstone', { shade: pc.shade, open, merge, joint, surf: pc.surf, src });
    }
    return P.length;
  }
}

// ── Builders ──────────────────────────────────────────────────────────────

/** One band of a moulding profile. */
export interface Band {
  /** Height (metres, on the texel grid). */
  h: number;
  /** How far its face stands in front of the wall face (metres). */
  out: number;
  /** Its carving: a relief for the band's face, given the face's size in cells (length × height). */
  relief?: (w: number, h: number) => Relief;
  /** Relief cell size (default {@link HALF}) and depth of a level (default the cell). */
  cell?: number;
  step?: number;
  /** Cut from the same stones as the band below (a stepped profile in one block): no joint between them. */
  joined?: boolean;
}

export interface MouldingOptions {
  /** The run along x (metres); its ends are exactly there, so modules tile. */
  x0: number;
  x1: number;
  /** Bottom of the lowest band (default 0). */
  y0?: number;
  /** The wall's front and back faces (z); the bands stand out from them. */
  front: number;
  back: number;
  /** Profile on the front only (a roof edge; default) or on both faces (a free-standing wall top). */
  sides?: 'front' | 'both';
  bands: readonly Band[];
  /** Stone length range (metres, default 0.75–1.25); joints land on 1/8 m. */
  stone?: [number, number];
  /** Deepest stone (metres, default 0.875): deeper bands are laid as front and back stones. */
  skin?: number;
  seed: number;
}

/** Joints of one course along a..b: stones of `len` metres in running bond (course `row`), on 1/8 m. */
function joints(a: number, b: number, len: [number, number], row: number, seed: number): number[] {
  const q = (x: number) => Math.round(x * 8) / 8;
  const cuts = [a];
  let x = a;
  let n = 0;
  if (row % 2 === 1) {
    const part = q(((len[0] + len[1]) / 4) * (0.8 + 0.4 * hash3(row, 1, 3, seed)));
    if (part >= 0.25 && b - a - part >= len[0] * 0.5) cuts.push((x += part));
  }
  while (x < b - 1e-6) {
    let l = Math.max(0.25, q(len[0] + (len[1] - len[0]) * hash3(row, n++, 5, seed)));
    if (b - (x + l) < len[0] * 0.5) l = b - x;
    cuts.push((x += l));
  }
  return cuts;
}

/**
 * A moulding: bands stacked from `y0`, each standing `out` in front of the
 * wall face (and behind the back face with `sides: 'both'`), laid as stones
 * in running bond through the wall's depth, reliefs running across the
 * stones. Returns each band's box (for colliders).
 */
export function moulding(w: StoneWork, o: MouldingOptions): Box6[] {
  const both = o.sides === 'both';
  const len = o.stone ?? [0.75, 1.25];
  const out: Box6[] = [];
  let y = o.y0 ?? 0;
  let prev: { cuts: number[]; ids: number[] }[] | null = null;
  o.bands.forEach((band, bi) => {
    const zf = o.front + band.out;
    const zb = both ? o.back - band.out : o.back;
    const cell = band.cell ?? HALF;
    const cw = Math.round((o.x1 - o.x0) / cell);
    const ch = Math.round(band.h / cell);
    const r = band.relief?.(cw, ch);
    const carve: Carving[] = [];
    if (r) {
      carve.push({ face: FACE.pz, relief: r, at: [o.x0, y, zf], cell, step: band.step });
      if (both) carve.push({ face: FACE.nz, relief: r, at: [o.x1, y, zb], cell, step: band.step });
    }
    // Front and back stones through a deep band, their joints staggered.
    const n = Math.max(1, Math.ceil((zf - zb) / (o.skin ?? 0.875) - 1e-6));
    const skins: { cuts: number[]; ids: number[] }[] = [];
    for (let k = 0; k < n; k++) {
      const za = k ? Math.round((zf - ((zf - zb) * k) / n) * 16) / 16 : zf;
      const zc = k < n - 1 ? Math.round((zf - ((zf - zb) * (k + 1)) / n) * 16) / 16 : zb;
      const join = band.joined && prev?.length === n ? prev[k] : null;
      const cuts = join ? join.cuts : joints(o.x0, o.x1, len, bi + k, o.seed + k * 13);
      const ids: number[] = [];
      for (let s = 0; s + 1 < cuts.length; s++) ids.push(w.stone([cuts[s], y, zc, cuts[s + 1], y + band.h, za], carve, { join: join?.ids[s] }));
      skins.push({ cuts, ids });
    }
    out.push([o.x0, y, zb, o.x1, y + band.h, zf]);
    prev = skins;
    y += band.h;
  });
  return out;
}

/**
 * The same profile turning an outer corner: a front arm along x from `x0` to
 * the corner and a side arm along z from `z0` to it, on walls `thick` metres
 * thick whose outer faces are z = `front` and x = `side`. The reliefs run on
 * round the corner; a plain corner post `post` cells wide (default 3) stops
 * them either side of the arris, as Khmer friezes turn a corner. Profile on
 * the outer faces only. Returns each band's two boxes.
 */
export function mouldingCorner(w: StoneWork, o: { x0: number; z0: number; front: number; side: number; thick: number; y0?: number; bands: readonly Band[]; stone?: [number, number]; seed: number; post?: number }): Box6[] {
  const len = o.stone ?? [0.75, 1.25];
  const boxes: Box6[] = [];
  let y = o.y0 ?? 0;
  o.bands.forEach((band, bi) => {
    const xc = o.side + band.out;
    const zc = o.front + band.out;
    const cell = band.cell ?? HALF;
    const Lf = xc - o.x0;
    const Ls = zc - o.z0;
    const cf = Math.round(Lf / cell);
    const ch = Math.round(band.h / cell);
    let r = band.relief?.(cf + Math.round(Ls / cell), ch);
    const carve: Carving[] = [];
    if (r) {
      // A plain post either side of the arris (and through the corner's relief depth).
      const post = (o.post ?? 3) + Math.ceil(((r.face + 1) * (band.step ?? cell)) / cell);
      r = r.map((lv, u) => (Math.abs(u + 0.5 - cf) < post ? r!.face : lv));
      carve.push({ face: FACE.pz, relief: r, at: [o.x0, y, zc], cell, step: band.step }, { face: FACE.px, relief: r, at: [xc, y, zc + Lf], cell, step: band.step });
    }
    const zBack = o.front - o.thick;
    const xBack = o.side - o.thick;
    const fc = joints(o.x0, xc, len, bi, o.seed);
    for (let s = 0; s + 1 < fc.length; s++) w.stone([fc[s], y, zBack, fc[s + 1], y + band.h, zc], carve);
    const sc = joints(o.z0, zBack, len, bi + 1, o.seed + 7);
    for (let s = 0; s + 1 < sc.length; s++) w.stone([xBack, y, sc[s], xc, y + band.h, sc[s + 1]], carve);
    boxes.push([o.x0, y, zBack, xc, y + band.h, zc], [xBack, y, o.z0, xc, y + band.h, zBack]);
    y += band.h;
  });
  return boxes;
}

/** Designs of a lintel's face. */
export type LintelDesign = 'scroll' | 'kala' | 'plain';

export interface LintelOptions {
  /** Length (default 2.25 m: a 1.25 m door plus 0.5 m bearing each side), height (0.5) and depth (0.5). */
  length?: number;
  height?: number;
  depth?: number;
  /** Bottom of the lintel (the door head, metres). */
  y0: number;
  /** Centre z of the lintel (default 0; front face at z + depth/2). */
  z?: number;
  /**
   * 'scroll': the sheet's band of scrolls with a central medallion;
   * 'kala': Angkor Wat's kala face holding a garland that loops down to
   * curled ends; 'plain': fillets only.
   */
  design?: LintelDesign;
  /** Width of the end sections over the supports (default 0.5 m), carved and standing a step proud. */
  ends?: number;
  /** Relief cell (default {@link HALF}). */
  cell?: number;
  /** Wear of the carving (0‥1). */
  wear?: number;
  seed: number;
}

/**
 * A carved lintel, one stone (≈ 1.3 t at 2.25 × 0.5 × 0.5 m): plain fillets
 * along its top and bottom edges, its end sections (over the supports) a
 * step proud with a curl turning inward, and between them the design.
 * Returns its box.
 */
export function lintel(w: StoneWork, o: LintelOptions): Box6 {
  const L = o.length ?? 2.25;
  const H = o.height ?? 0.5;
  const D = o.depth ?? 0.5;
  const c = o.cell ?? HALF;
  const z = o.z ?? 0;
  const cw = Math.round(L / c);
  const ch = Math.round(H / c);
  const ew = Math.round((o.ends ?? 0.5) / c);
  const r = new Relief(cw, ch, { face: 3, ground: 1 });
  const rim = Math.max(1, Math.round(ch / 8));
  // End sections: proud panels with a curl turning inward.
  for (const s of [-1, 1]) {
    const u0 = s < 0 ? 0 : cw - ew;
    r.rect(u0, 0, u0 + ew, ch, 4);
    const d = Math.min(ew - 2 * rim, ch - 2 * rim);
    if (o.design !== 'plain' && d >= 6) {
      r.rect(u0 + rim, rim, u0 + ew - rim, ch - rim, 1);
      r.stamp(curl(d, { right: s > 0 }), Math.round(u0 + ew / 2 - d / 2), Math.round(ch / 2 - d / 2), { ground: 2, op: 'over' });
    }
  }
  // The middle: a sunk band between fillets.
  const m0 = ew;
  const m1 = cw - ew;
  const bh = ch - 2 * rim;
  if (o.design !== 'plain') r.rect(m0, rim, m1, ch - rim, 1);
  if (o.design === 'kala') {
    // (the kala fills the lintel's height, over the fillets, as the central motif of real lintels does)
    const kw = Math.round(ch * 1.4);
    const kc = Math.round(cw / 2 - kw / 2);
    // Garland loops from the kala's hands to the curled ends, leaves hanging from each loop.
    for (const s of [-1, 1]) {
      const a = s < 0 ? m0 + 1 : cw / 2 + kw / 2 - 1;
      const b = s < 0 ? cw / 2 - kw / 2 + 1 : m1 - 1;
      const n = Math.max(1, Math.round((b - a) / (bh * 1.2)));
      const pts: [number, number][] = [];
      for (let i = 0; i <= n * 12; i++) {
        const t = i / (n * 12);
        pts.push([a + (b - a) * t, rim + bh * (0.72 - 0.45 * Math.abs(Math.sin(t * n * Math.PI)))]);
      }
      r.line(pts, Math.max(1.5, bh / 6), 3, 'max');
      for (let k = 0; k < n; k++) {
        const x = a + ((b - a) * (k + 0.5)) / n;
        r.ellipse(x, rim + bh * 0.2, Math.max(1, bh * 0.1), Math.max(1, bh * 0.14), 3, 'max');
        r.ellipse(x - bh * 0.32, rim + bh * 0.66, Math.max(1, bh * 0.14), Math.max(1, bh * 0.1), 2, 'max');
        r.ellipse(x + bh * 0.32, rim + bh * 0.66, Math.max(1, bh * 0.14), Math.max(1, bh * 0.1), 2, 'max');
      }
    }
    r.rect(kc, 0, kc + kw, ch, 1);
    r.stamp(kala(kw, ch), kc, 0, { ground: 1, op: 'over' });
  } else if (o.design !== 'plain') {
    // The sheet: scrolls running out from a central medallion.
    const mw = Math.round(bh * 1.5);
    const half = Math.floor((m1 - m0 - mw) / 2);
    const sc = scroll(half, bh, { phase: 0 });
    r.stamp(sc, m0, rim, { ground: 1, op: 'over' });
    r.stamp(sc, m1 - half, rim, { ground: 1, op: 'over', flip: true });
    r.stamp(medallion(mw, bh), Math.round(cw / 2 - mw / 2), rim, { ground: 1, op: 'over' });
  }
  weather(r, o.wear ?? 0, o.seed + 3);
  const box: Box6 = [-L / 2, o.y0, z - D / 2, L / 2, o.y0 + H, z + D / 2];
  // (the relief's face is set back a step: the end panels stand proud to the lintel's front)
  w.stone([-L / 2, o.y0, z - D / 2, L / 2, o.y0 + H, z + D / 2 - c], [{ face: FACE.pz, relief: r, at: [-L / 2, o.y0, z + D / 2 - c], cell: c }]);
  return box;
}

/** A stone top where moss settles (the shape of lib/openings' `MossTop`): its rectangle at height y, less `inner`, free edges as FACE bits. */
export interface Top {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y: number;
  inner?: [number, number, number, number];
  edges: number;
}

export interface PedimentOptions {
  /** Width at the base (metres; door 3.5, gopura 5.5) and height to the finial's tip (door 2.5). */
  width: number;
  height: number;
  /** Thickness (default 0.5 m) and the z of its front face (default depth/2). */
  depth?: number;
  z?: number;
  y0?: number;
  /** Relief cell (default {@link HALF}; {@link CELL} for big gopura pediments). */
  cell?: number;
  /** Central figure (default 'deity'); flanking worshippers (default: when wide enough). */
  figure?: FigurePose | 'none';
  flanks?: boolean;
  /** Wear (0‥1): edges lose steps, flame tongues and naga heads break off. */
  wear?: number;
  seed: number;
  /** Look of the stone from its number and centre (default the StoneWork's). */
  look?: (stone: number, centre: V3) => StoneLook | undefined;
}

/**
 * A Khmer pediment: a base course carved with lozenges; the naga rearing at
 * each base corner as a fan of hoods over a curl; between them the stepped
 * gable, its rakes edged with flame tongues and a flame finial at the apex,
 * framed by the raised naga body; inside, the sunk tympanum packed with
 * foliate scrolls around the central figure in a pointed niche (with
 * kneeling worshippers on wide pediments). Laid in 0.5 m courses of stones in
 * running bond, the relief running across the joints; flat back. Returns
 * boxes for colliders and the step tops (where moss settles).
 */
export function pediment(w: StoneWork, o: PedimentOptions): { colliders: Box6[]; tops: Top[] } {
  const c = o.cell ?? HALF;
  const W = o.width;
  const H = o.height;
  const D = o.depth ?? 0.5;
  const y0 = o.y0 ?? 0;
  const zf = o.z ?? D / 2;
  const M = (m: number) => Math.round(m / c);
  const cw = M(W);
  const ch = M(H);
  const cx = cw / 2;
  // Levels: 5 the frame, flames and naga (the front plane), 4 the niche frame and figures,
  // 3 foliage, 2 leaves, 1 the tympanum's ground, 0 the niche's.
  const F = 5;
  const r = new Relief(cw, ch, { face: F, fill: -1, ground: 1 });
  const base = M(0.25);
  r.rect(0, 0, cw, base, F);
  r.stamp(lozenges(cw - 2, base - 2), 1, 1, { ground: F - 2 });
  // The naga's heads at the base corners (the body comes in from the gable).
  const E = M(Math.min(0.875, Math.max(0.5625, W * 0.16)));
  const hood = nagaHood(E, Math.round(E * 1.3));
  const plate = new Uint8Array(cw * ch);
  for (const s of [-1, 1]) {
    const u0 = s < 0 ? 0 : cw - E;
    r.stamp(s < 0 ? hood.flipped() : hood, u0, base, { map: (a) => (a < 0 ? null : a === 0 ? 1 : a === 1 ? F - 2 : F) });
    for (let v = base; v < base + hood.h; v++) for (let u = u0; u < u0 + E; u++) if (r.at(u, v) >= 0) plate[v * cw + u] = 2;
  }
  // The gable: steps `st` high, the rakes a little convex, a flame tongue leaning out from each step.
  const gw = cw / 2 - E;
  const top = ch - M(Math.max(0.25, H * 0.11));
  const st = M(0.25);
  const halfAt = (v: number) => gw * Math.pow(1 - clamp01((v - base) / (top - base)), 0.8);
  const steps: { v1: number; hw: number }[] = [];
  for (let v = base; v < top; v += st) {
    const v1 = Math.min(top, v + st);
    const hw = Math.max(2, Math.round(halfAt(v1)));
    steps.push({ v1, hw });
    r.rect(cx - hw, v, cx + hw, v1, F, 'max');
  }
  // (flames are carved as plates, thinner than the stones they rise from: marked here, depth set below)
  // A flame: a plump leaf leaning out from the step's corner, its tip curling outward.
  const b = Math.max(1.5, st * 0.34);
  const fh = st * 1.05;
  const flame = (x: number, y: number, s: number) => {
    const before = r.cells.slice();
    r.ellipse(x + s * b * 0.25, y + fh * 0.38, b, fh * 0.4, F, 'max');
    r.poly([[x + s * b * 0.2 - b * 0.8, y + fh * 0.45], [x + s * b * 0.2 + b * 0.8, y + fh * 0.45], [x + s * b * 1.4, y + fh]], F, 'max');
    for (let i = 0; i < before.length; i++) if (before[i] < 0 && r.cells[i] >= 0) plate[i] = 1;
  };
  steps.forEach(({ v1, hw }, i) => {
    if (i < steps.length - 1) for (const s of [-1, 1]) flame(cx + s * (hw - b * 0.6), v1, s);
  });
  const apex = steps[steps.length - 1];
  {
    const before = r.cells.slice();
    r.poly([[cx - apex.hw - 1, top], [cx + apex.hw + 1, top], [cx + 1.5, ch - 2], [cx, ch], [cx - 1.5, ch - 2]], F, 'max');
    r.disc(cx, top + (ch - top) * 0.35, Math.max(1.5, apex.hw * 0.9), F, 'max');
    for (let i = 0; i < before.length; i++) if (before[i] < 0 && r.cells[i] >= 0) plate[i] = 2;
  }
  // The tympanum: a frame's width inside the gable's outline, sunk to the ground; the frame's inner edge a step down.
  const fw = Math.max(2, M(0.125));
  const inside = new Uint8Array(cw * ch);
  const isIn = (u: number, v: number) => u >= 0 && v >= 0 && u < cw && v < ch && inside[v * cw + u] === 1;
  for (let v = base + fw; v < top; v++)
    for (let u = Math.floor(cx - gw); u < cx + gw; u++) {
      let ok = r.at(u, v) === F && Math.abs(u + 0.5 - cx) < halfAt(v + 1) - fw;
      for (let d = 1; ok && d <= fw; d++) ok = r.get(u + d, v) === F && r.get(u - d, v) === F && r.get(u, v + d) === F;
      if (ok) inside[v * cw + u] = 1;
    }
  r.map((lv, u, v) => (isIn(u, v) ? 1 : lv === F && v >= base && (isIn(u + 1, v) || isIn(u - 1, v) || isIn(u, v - 1)) ? F - 1 : lv));
  // The central figure in a pointed niche (the tallest whose niche still fits under the rakes).
  const pose = o.figure ?? 'deity';
  const ny = base + fw;
  const nicheOf = (fh: number) => {
    const nw = Math.round(fh * (pose === 'deity' ? 0.62 : 0.46)) + 2 * Math.max(2, Math.round(fh / 10)) + 2;
    return { nw, nh: fh + Math.round(fh * 0.32) };
  };
  const fits = (fh: number) => {
    const { nw, nh } = nicheOf(fh);
    return (halfAt(ny + nh - nw * 0.5) - fw) * 2 >= nw + 2;
  };
  let figH = M(Math.min(1.25, (top - ny) * c * 0.75));
  while (figH > 8 && !fits(figH)) figH--;
  const inNiche = new Set<number>();
  if (pose !== 'none' && figH >= 8) {
    const fig = figure(figH, pose);
    const { nw, nh } = nicheOf(figH);
    const nx = Math.round(cx - nw / 2);
    const ni = niche(nw, nh);
    for (let v = 0; v < nh; v++) for (let u = 0; u < nw; u++) if (ni.at(u, v) === 0) inNiche.add((ny + v) * cw + nx + u);
    r.stamp(ni, nx, ny, { where: isIn, map: (a) => (a < 0 ? null : a === 0 ? 0 : F - 1) });
    r.stamp(fig, Math.round(cx - fig.w / 2), ny + 1, { where: isIn, map: (a) => (a > 0 ? 2 + a : null) });
    if (o.flanks ?? W >= 4.5) {
      const kn = figure(Math.round(figH * 0.5), 'kneel');
      for (const s of [-1, 1]) {
        // (a clear field round each worshipper, so the scrolls don't swallow it)
        const kx = Math.round(cx + s * (nw / 2 + kn.w * 0.75) - kn.w / 2);
        for (let v = ny; v < ny + kn.h + 2; v++) for (let u = kx - 1; u < kx + kn.w + 1; u++) if (isIn(u, v)) inNiche.add(v * cw + u);
        r.stamp(s < 0 ? kn : kn.flipped(), kx, ny, { where: isIn, map: (a) => (a > 0 ? 2 + a : null) });
      }
    }
  }
  // Foliate scrolls packing the rest of the tympanum, mirrored about the axis.
  const half = Math.ceil(cw / 2);
  const leaf = foliage(half, ch, { pitch: Math.max(6, M(0.3)) });
  const free = (u: number, v: number) => isIn(u, v) && !inNiche.has(v * cw + u) && r.at(u, v) === 1;
  r.stamp(leaf, cw - half, 0, { where: free, map: (a) => (a > 0 ? 1 + a : null) });
  r.stamp(leaf, 0, 0, { where: free, flip: true, map: (a) => (a > 0 ? 1 + a : null) });
  if (o.wear) weather(r, o.wear, o.seed + 5, { chip: true });
  const stones = courses(cw, ch, [base, M(0.5)], [M(0.75), M(1.25)], o.seed);
  const thick = [0, M(0.1875) * c, Math.min(D, 0.3125)];
  w.slab(r, { at: [-W / 2, y0, zf], back: D, depth: (u, v) => (plate[v * cw + u] ? thick[plate[v * cw + u]] : undefined), cell: c, stones, look: o.look });
  // Colliders: the base course, the naga ends and the gable in stepped boxes.
  const out: Box6[] = [[-W / 2, y0, zf - D, W / 2, y0 + base * c, zf]];
  const hy = y0 + (base + hood.h) * c;
  out.push([-W / 2, y0 + base * c, zf - D, -W / 2 + E * c, hy, zf], [W / 2 - E * c, y0 + base * c, zf - D, W / 2, hy, zf]);
  for (let v = base; v < top; v += M(0.5)) {
    const hw = halfAt(Math.min(top, v + M(0.25))) * c;
    out.push([-hw, y0 + v * c, zf - D, hw, y0 + Math.min(top, v + M(0.5)) * c, zf]);
  }
  // Tops: the base course's ends beside the naga, and each step's treads either side of the step above.
  const tops: Top[] = [];
  const x = (u: number) => -W / 2 + u * c;
  steps.forEach(({ v1, hw }, i) => {
    const next = steps[i + 1]?.hw ?? 0;
    if (hw - next < 2) return;
    for (const s of [-1, 1]) {
      const [a, b2] = s < 0 ? [x(cx - hw), x(cx - next)] : [x(cx + next), x(cx + hw)];
      tops.push({ x0: a, x1: b2, z0: zf - D, z1: zf, y: y0 + v1 * c, edges: FACE.pz | FACE.nz | (s < 0 ? FACE.nx : FACE.px) });
    }
  });
  return { colliders: out, tops };
}
