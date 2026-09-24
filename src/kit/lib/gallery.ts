import type { SourceTrace } from '../../feedback/sourceTrace';
import { hash3, valueNoise3 } from '../../voxel/random';
import type { Surf, VoxelBuilder } from '../../voxel/VoxelBuilder';
import { MOSS, SANDSTONE } from '../palette';
import { PieceBuilder } from '../PieceBuilder';
import { here, rng, snap, TEXEL } from '../shapes';
import { STONE_FINISH, stoneSurf, type StoneFinish } from '../surface';
import type { KitPiece } from '../types';
import { commitGrass, ghostGround, GRASS_TONES, grassGrid, grassTuft, plusTuft } from './grass';

/**
 * Angkor gallery façade — the wall of a temple gallery as the sheets draw it:
 * a stepped plinth, courses of dressed sandstone laid dry (every joint a dark
 * line), bays of deep, dark windows filled with lathe-turned balusters,
 * pilasters with bases and capitals between the bays, a sill string course, a
 * projecting cornice with the pier heads rising above it, and a corbelled roof.
 * Built facing +Z with its front face at z = 0 and the wall behind (z < 0),
 * running along x from −length/2 to +length/2, standing on y = 0. Used by the
 * §19.1 / §19.2 usage examples; a first step towards the §03 / §15 gallery kit.
 */
export interface FacadeOptions {
  length: number;
  finish: StoneFinish;
  seed: number;
  /** Bay width (a window + its piers), default 3 m. */
  bay?: number;
  /** Wall height to the cornice, default 5 m. */
  height?: number;
  /** Doorway instead of windows in the middle bay. */
  door?: boolean;
  /** Skip the pilaster at the left / right end (where the façade meets another). */
  openEnds?: boolean;
  /**
   * Depth of the gallery behind the wall (metres): adds its corbelled roof,
   * stepping up from the cornice to a ridge over the corridor, and the
   * corridor's back wall. 0 = wall only.
   */
  gallery?: number;
  /** Height of the stepped base (metres, 0–1 in quarter metres; default 1). */
  plinth?: number;
  /** Height of the window sills (default 1.5 m); a sill low on the plinth makes an open colonnade. */
  sill?: number;
  /** Height of the window heads (default 3.25 m). */
  lintel?: number;
  /** Width of the window openings (default 1.5 m, less on narrow bays). */
  window?: number;
  /** Balusters per window (default one per 0.45 m of opening). */
  balusters?: number;
  /** The pilasters between the bays: width and projection (default 1 × 0.25 m). */
  pilaster?: { width?: number; depth?: number };
  /** Age and overgrowth beyond the finish's own (defaults follow the finish). */
  weather?: FacadeWeather;
}

/** Damage and nature on a façade (see {@link FacadeOptions.weather}). */
export interface FacadeWeather {
  /** Stones knocked out of the face, leaving dark holes (count). */
  missing?: number;
  /** Stones split by a stair-stepped crack (count). */
  cracked?: number;
  /** Moss cushions on the ledges, hanging over their edges (0‥1). */
  moss?: number;
  /** Grass tufts sprouting from the joints of the ledges (0‥1). */
  grass?: number;
  /** Dark run-off streaks down the face below the cornice and sills (0‥1). */
  streaks?: number;
}

/** Heights of the façade's parts (metres). */
export const FACADE = {
  plinth: 1.0,
  sill: 1.5,
  lintel: 3.25,
  cornice: 5.0,
  depth: 1.0,
  course: 0.25,
  window: 1.5,
} as const;

const T = TEXEL;
/** A hair (1/64 m): how far the fill keeps back from the stones' faces where a texel would open a slot. */
const HAIR = T / 4;
/** The dark seen in the open joints, window recesses and holes. */
const JOINT = SANDSTONE.cavity[1];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** An axis-aligned box: min x, y, z, max x, y, z (metres). */
export type Box6 = [number, number, number, number, number, number];

/** Face bits, as in a voxel's `open` mask: +x, −x, +y, −y, +z, −z. */
export const FACE = { px: 1, nx: 2, py: 4, ny: 8, pz: 16, nz: 32 } as const;

/** Colour and pattern of one stone. */
export interface StoneLook {
  color: number;
  surf: Surf;
  shade?: number;
}

/** A dressed stone laid by {@link DryMasonry}. */
export interface Stone {
  box: Box6;
  look: StoneLook;
  /** The face it shows (a FACE bit): damage is cut into that face. */
  face: number;
  /** Knocked out, leaving a hole this deep (metres). */
  gone?: number;
  /** Split by a crack: the crack's column (texels from the stone's start) per pair of texel rows. */
  crack?: number[];
  /** A chip knocked out of it. */
  chip?: Box6;
  /** Who laid it (dev builds; one capture per course, for the bug reporter). */
  src?: SourceTrace;
}

export interface CourseOptions {
  /** Direction the stones run (default x). */
  axis?: 'x' | 'z';
  /** The face the course shows (a FACE bit; default +z for x courses, +x for z courses). */
  face?: number;
  /** Stone length range along the course (metres). */
  length: [number, number];
  /**
   * Faces of the course that abut other stone (FACE bits; default the bottom).
   * The dark fill isn't set back from covered faces.
   */
  closed?: number;
  /** Course number in its wall: alternate courses start with a part stone (running bond). */
  row?: number;
  /** Stones of their own over given spans along the course (lintels), standing `proud` of the face. */
  fixed?: { a: number; b: number; proud?: number }[];
  /** Spans along the course whose underside is open (over a window): the fill is lifted off there. */
  openBelow?: [number, number][];
  look: (x: number, y: number, z: number) => StoneLook;
}

const boxesTouch = (a: Box6, b: Box6, ax: number): number => {
  // 1 if b lies against a's + side along ax, −1 against its − side, 0 if not touching there.
  const o = [0, 1, 2].filter((n) => n !== ax);
  if (!o.every((n) => a[n] < b[n + 3] - 1e-6 && b[n] < a[n + 3] - 1e-6)) return 0;
  if (Math.abs(a[ax + 3] - b[ax]) < 1e-6) return 1;
  if (Math.abs(b[ax + 3] - a[ax]) < 1e-6) return -1;
  return 0;
};

const overlaps = (a: Box6, b: Box6) => a[0] < b[3] - 1e-6 && b[0] < a[3] - 1e-6 && a[1] < b[4] - 1e-6 && b[1] < a[4] - 1e-6 && a[2] < b[5] - 1e-6 && b[2] < a[5] - 1e-6;

/** The parts of box `a` outside box `b` (at most six boxes). */
export function subtractBox(a: Box6, b: Box6): Box6[] {
  if (!overlaps(a, b)) return [a];
  const out: Box6[] = [];
  let [x0, y0, z0, x1, y1, z1] = a;
  if (b[0] > x0) (out.push([x0, y0, z0, b[0], y1, z1]), (x0 = b[0]));
  if (b[3] < x1) (out.push([b[3], y0, z0, x1, y1, z1]), (x1 = b[3]));
  if (b[1] > y0) (out.push([x0, y0, z0, x1, b[1], z1]), (y0 = b[1]));
  if (b[4] < y1) (out.push([x0, b[4], z0, x1, y1, z1]), (y1 = b[4]));
  if (b[2] > z0) (out.push([x0, y0, z0, x1, y1, b[2]]), (z0 = b[2]));
  if (b[5] < z1) out.push([x0, y0, b[5], x1, y1, z1]);
  return out;
}

/**
 * Masonry laid dry, as the sheets draw Angkor's walls: dressed stones on the
 * texel grid, each stopping a texel short of the next stone along its course
 * and of the course above, and behind every course a dark fill set a texel
 * back from its faces — so every joint reads as a dark line between rounded,
 * rim-lit blocks, at any distance. One box per stone plus one fill box per
 * course, cheap enough for long galleries. Stones can then be knocked out
 * (a dark hole), split by a crack or chipped (§19.2).
 */
export class DryMasonry {
  readonly stones: Stone[] = [];
  /** The dark fill behind the joints (and who laid it). */
  private fill: { b: Box6; src?: SourceTrace }[] = [];

  constructor(readonly seed: number) {}

  /**
   * Lay one course filling `box` (metres, on the texel grid): stones in running
   * bond along the axis, each through the full depth of the course.
   */
  course(box: Box6, o: CourseOptions): Stone[] {
    const axis = o.axis ?? 'x';
    const A = axis === 'x' ? 0 : 2;
    const C = axis === 'x' ? 2 : 0;
    const face = o.face ?? (axis === 'x' ? FACE.pz : FACE.px);
    const closed = o.closed ?? FACE.ny;
    const bitP = axis === 'x' ? FACE.px : FACE.pz;
    const bitN = axis === 'x' ? FACE.nx : FACE.nz;
    const [crossP, crossN] = axis === 'x' ? [FACE.pz, FACE.nz] : [FACE.px, FACE.nx];
    const [a0, a1] = [box[A], box[A + 3]];
    const row = o.row ?? 0;
    const seed = this.seed + Math.round(box[1] * 16) * 131 + Math.round(a0 * 16) * 7;
    const src = here();
    // Segments along the course: fixed stones (lintels) and the runs between them.
    const segs: { a: number; b: number; proud: number }[] = [];
    const fixed = [...(o.fixed ?? [])].filter((f) => f.b > a0 + 1e-6 && f.a < a1 - 1e-6).sort((p, q) => p.a - q.a);
    let at = a0;
    let n = 0;
    const run = (e: number) => {
      // Running bond: alternate courses start with a part stone.
      const [l0, l1] = o.length;
      let s = at;
      if (row % 2 === 1 && s === a0) {
        const part = snap(((l0 + l1) / 4) * (0.8 + 0.4 * hash3(row, 1, 3, seed)));
        if (part > T && e - s - part >= l0 * 0.5) {
          segs.push({ a: s, b: s + part, proud: 0 });
          s += part;
        }
      }
      while (s < e - 1e-6) {
        let len = Math.max(2 * T, snap(l0 + (l1 - l0) * hash3(row, n++, 5, seed)));
        if (e - (s + len) < l0 * 0.5) len = e - s;
        segs.push({ a: s, b: s + len, proud: 0 });
        s += len;
      }
      at = e;
    };
    for (const f of fixed) {
      const fa = Math.max(at, snap(f.a));
      const fb = Math.min(a1, snap(f.b));
      if (fb <= fa + 1e-6) continue;
      if (fa > at + 1e-6) run(fa);
      segs.push({ a: fa, b: fb, proud: f.proud ?? T });
      at = fb;
    }
    if (at < a1 - 1e-6) run(a1);
    // Slivers (a pier narrower than a stone) join the stone beside them.
    for (let i = 0; i < segs.length; i++) {
      if (segs[i].b - segs[i].a >= 3 * T || segs.length === 1) continue;
      if (i > 0) segs[i - 1].b = segs[i].b;
      else segs[i + 1].a = segs[i].a;
      segs.splice(i--, 1);
    }
    // Stones touch their neighbours: the joints are drawn by their bevels (see emit).
    const out: Stone[] = [];
    segs.forEach((sg) => {
      const b: Box6 = [...box];
      b[A] = sg.a;
      b[A + 3] = sg.b;
      if (face === crossP) b[C + 3] += sg.proud;
      else if (face === crossN) b[C] -= sg.proud;
      const look = o.look((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
      const s: Stone = { box: b, look, face, src };
      this.stones.push(s);
      out.push(s);
    });
    // The dark fill: the course's volume set a texel back from its open faces
    // (the joints read as dark slots there) and a hair back from its open top,
    // underside and ends — enough not to flicker against the stones' faces, too
    // little to leave a slot through the wall under a joint — lifted off where
    // the underside is open.
    const fill: Box6 = [...box];
    const inset = (bit: number, ax: number, sign: 1 | -1, by: number) => {
      if (!(closed & bit)) fill[sign > 0 ? ax + 3 : ax] -= sign * by;
    };
    inset(bitP, A, 1, HAIR);
    inset(bitN, A, -1, HAIR);
    inset(crossP, C, 1, T);
    inset(crossN, C, -1, T);
    inset(FACE.py, 1, 1, HAIR);
    inset(FACE.ny, 1, -1, HAIR);
    const lifted = (o.openBelow ?? []).map(([p, q]) => [Math.max(fill[A], p - T), Math.min(fill[A + 3], q + T)]).filter(([p, q]) => q > p);
    if (!lifted.length || !(closed & FACE.ny)) this.fill.push({ b: fill, src });
    else {
      let s = fill[A];
      for (const [p, q] of lifted.sort((u, v) => u[0] - v[0])) {
        if (p > s) this.fill.push({ b: withSpan(fill, A, s, p), src });
        const lift = withSpan(fill, A, p, q);
        lift[1] += HAIR;
        this.fill.push({ b: lift, src });
        s = q;
      }
      if (s < fill[A + 3]) this.fill.push({ b: withSpan(fill, A, s, fill[A + 3]), src });
    }
    return out;
  }

  /** Courses stacked from y0 at the given heights (see {@link course}); the top one keeps `closed`'s top bit. */
  wall(box: Box6, heights: readonly number[], o: CourseOptions): Stone[] {
    const out: Stone[] = [];
    let y = box[1];
    heights.forEach((h, i) => {
      const last = i === heights.length - 1;
      const closed = (o.closed ?? FACE.ny) | FACE.ny;
      out.push(...this.course([box[0], y, box[2], box[3], y + h, box[5]], { ...o, row: (o.row ?? 0) + i, closed: last ? closed : closed | FACE.py }));
      y += h;
    });
    return out;
  }

  /** Knock a stone out: a dark hole `depth` into its face (the fill behind it is cut back). */
  knockOut(s: Stone, depth = 0.5): void {
    const b = s.box;
    const ax = s.face === FACE.px || s.face === FACE.nx ? 0 : s.face === FACE.py || s.face === FACE.ny ? 1 : 2;
    const pos = s.face === FACE.px || s.face === FACE.py || s.face === FACE.pz;
    const d = Math.min(depth, b[ax + 3] - b[ax] - 2 * T);
    if (d <= 0) return;
    s.gone = d;
    // The hole takes the joints around the stone with it (but not the course below: its fill is the hole's floor).
    const hole: Box6 = [b[0] - T, b[1], b[2] - T, b[3] + T, b[4] + T, b[5] + T];
    if (pos) [hole[ax], hole[ax + 3]] = [b[ax + 3] - d, b[ax + 3]];
    else [hole[ax], hole[ax + 3]] = [b[ax], b[ax] + d];
    const cut = cutOf(hole, s.face);
    cut[1] = b[1];
    this.fill = this.fill.flatMap((f) => subtractBox(f.b, cut).map((q) => ({ b: q, src: f.src })));
  }

  /** Split a stone from top to bottom with a stair-stepped crack (a texel wide, dark behind). */
  crack(s: Stone, seed: number): void {
    const b = s.box;
    const A = s.face === FACE.px || s.face === FACE.nx ? 2 : 0;
    const n = Math.round((b[A + 3] - b[A]) / T);
    const rows = Math.ceil(Math.round((b[4] - b[1]) / T) / 2);
    if (n < 5) return;
    const r = rng(seed);
    let c = r.int(Math.floor(n * 0.3), Math.ceil(n * 0.65));
    s.crack = [];
    for (let i = 0; i < rows; i++) {
      s.crack.push(c);
      c = Math.max(1, Math.min(n - 2, c + r.int(-1, 1)));
    }
  }

  /** Knock a chip out of one of the stone's arrises on its face. */
  chip(s: Stone, seed: number): void {
    const b = s.box;
    const r = rng(seed);
    const A = s.face === FACE.px || s.face === FACE.nx ? 2 : 0;
    const C = A === 0 ? 2 : 0;
    const pos = s.face === FACE.pz || s.face === FACE.px;
    const along = snap(Math.min(b[A + 3] - b[A] - 2 * T, r.range(2, 5) * T));
    const up = snap(Math.min(b[4] - b[1] - T, r.range(2, 3.5) * T));
    const deep = snap(r.range(2, 4) * T);
    if (along < T || up < T) return;
    const c: Box6 = [...b];
    const right = r.chance(0.5);
    c[A] = right ? b[A + 3] - along : b[A];
    c[A + 3] = right ? b[A + 3] : b[A] + along;
    const top = r.chance(0.7);
    c[1] = top ? b[4] - up : b[1];
    c[4] = top ? b[4] : b[1] + up;
    c[C] = pos ? b[C + 3] - deep : b[C];
    c[C + 3] = pos ? b[C + 3] : b[C] + deep;
    s.chip = c;
    // The notch shows the stone around it, not the dark fill behind the joints.
    const cut = cutOf(c, s.face);
    this.fill = this.fill.flatMap((f) => subtractBox(f.b, cut).map((q) => ({ b: q, src: f.src })));
  }

  /**
   * Emit the stones and the dark fill. A stone's side that lies wholly against
   * other stones is a masonry joint (`joint`): its bevel keeps a softer rim and
   * closes in a thin shadow line, and an edge between two joints stays square,
   * like the §19 blocks.
   */
  emit(v: VoxelBuilder): void {
    const pieces: { b: Box6; s: Stone; merge: number }[] = [];
    for (const s of this.stones) {
      const put = (b: Box6, merge = 0) => pieces.push({ b, s, merge });
      let parts: Box6[] = [s.box];
      if (s.gone) {
        // What is left behind the hole, a texel behind the fill that is its back.
        const b: Box6 = [...s.box];
        const g = s.gone + T;
        if (s.face === FACE.pz) b[5] -= g;
        else if (s.face === FACE.nz) b[2] += g;
        else if (s.face === FACE.px) b[3] -= g;
        else if (s.face === FACE.nx) b[0] += g;
        v.box((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2, b[3] - b[0], b[4] - b[1], b[5] - b[2], JOINT, 'sandstone', { shade: 0.8, open: 0, src: s.src });
        continue;
      }
      if (s.crack) parts = crackParts(s);
      else if (s.chip) parts = subtractBox(s.box, s.chip);
      if (parts.length === 1) put(parts[0]);
      else {
        // Pieces of one stone: sides against another piece merge (no bevel), except across
        // the crack (crack parts alternate left, right).
        const sameHalf = (i: number, j: number) => !s.crack || i % 2 === j % 2;
        parts.forEach((pb, i) => {
          let merge = 0;
          parts.forEach((qb, j) => {
            if (i === j || !sameHalf(i, j)) return;
            for (let ax = 0; ax < 3; ax++) {
              const t = boxesTouch(pb, qb, ax);
              if (t) merge |= 1 << (ax * 2 + (t > 0 ? 0 : 1));
            }
          });
          put(pb, merge);
        });
      }
    }
    const joints = jointMasks(pieces);
    pieces.forEach(({ b, s, merge }, i) => {
      const joint = joints[i] & ~merge;
      v.box((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2, b[3] - b[0], b[4] - b[1], b[5] - b[2], s.look.color, 'sandstone', {
        shade: s.look.shade ?? 1,
        open: 63 & ~joint,
        merge,
        joint,
        surf: s.look.surf,
        src: s.src,
      });
    });
    for (const { b: f, src } of this.fill) {
      if (f[3] - f[0] < 1e-6 || f[4] - f[1] < 1e-6 || f[5] - f[2] < 1e-6) continue;
      v.box((f[0] + f[3]) / 2, (f[1] + f[4]) / 2, (f[2] + f[5]) / 2, f[3] - f[0], f[4] - f[1], f[5] - f[2], JOINT, 'sandstone', { open: 0, src });
    }
  }
}

/**
 * A cut through the fill, grown a hair on every side but the face:
 * the fill's cut faces then sit inside the stones around the cut instead of
 * flush with their faces (which would flicker).
 */
function cutOf(b: Box6, face: number): Box6 {
  const e = HAIR;
  const c: Box6 = [b[0] - e, b[1] - e, b[2] - e, b[3] + e, b[4] + e, b[5] + e];
  // (towards the face the cut is open anyway)
  if (face === FACE.pz) c[5] = b[5];
  else if (face === FACE.nz) c[2] = b[2];
  else if (face === FACE.px) c[3] = b[3];
  else if (face === FACE.nx) c[0] = b[0];
  return c;
}

const withSpan = (b: Box6, ax: number, p: number, q: number): Box6 => {
  const o: Box6 = [...b];
  o[ax] = p;
  o[ax + 3] = q;
  return o;
};

/** The two halves of a cracked stone as boxes: rows of two texels either side of the crack. */
function crackParts(s: Stone): Box6[] {
  const b = s.box;
  const A = s.face === FACE.px || s.face === FACE.nx ? 2 : 0;
  const out: Box6[] = [];
  s.crack!.forEach((c, i) => {
    const y0 = b[1] + i * 2 * T;
    const y1 = Math.min(b[4], y0 + 2 * T);
    const left: Box6 = [...b];
    left[1] = y0;
    left[4] = y1;
    left[A + 3] = b[A] + c * T;
    const right: Box6 = [...left];
    right[A] = b[A] + (c + 1) * T;
    right[A + 3] = b[A + 3];
    out.push(left, right);
  });
  return out;
}

/**
 * Joint mask of each piece (FACE bits): the sides lying wholly against pieces
 * of other stones, tested texel by texel just outside the side. Pieces sit on
 * the texel grid; a 1 m bucket grid keeps the test cheap on long walls.
 */
function jointMasks(pieces: readonly { b: Box6; s: Stone }[]): number[] {
  const E = 1e-6;
  const cell = (v: number) => Math.floor(v);
  const buckets = new Map<string, number[]>();
  pieces.forEach(({ b }, i) => {
    for (let x = cell(b[0] + E); x <= cell(b[3] - E); x++)
      for (let y = cell(b[1] + E); y <= cell(b[4] - E); y++)
        for (let z = cell(b[2] + E); z <= cell(b[5] - E); z++) {
          const k = `${x},${y},${z}`;
          const list = buckets.get(k);
          if (list) list.push(i);
          else buckets.set(k, [i]);
        }
  });
  const inOther = (p: readonly number[], s: Stone) => {
    for (const j of buckets.get(`${cell(p[0])},${cell(p[1])},${cell(p[2])}`) ?? []) {
      const q = pieces[j];
      if (q.s !== s && p[0] > q.b[0] && p[0] < q.b[3] && p[1] > q.b[1] && p[1] < q.b[4] && p[2] > q.b[2] && p[2] < q.b[5]) return true;
    }
    return false;
  };
  return pieces.map(({ b, s }) => {
    let mask = 0;
    for (let bit = 0; bit < 6; bit++) {
      const ax = bit >> 1;
      const [u, w] = [(ax + 1) % 3, (ax + 2) % 3];
      const p = [0, 0, 0];
      p[ax] = bit & 1 ? b[ax] - T / 2 : b[ax + 3] + T / 2;
      let all = true;
      for (let a = b[u] + T / 2; all && a < b[u + 3]; a += T)
        for (let c = b[w] + T / 2; all && c < b[w + 3]; c += T) {
          p[u] = a;
          p[w] = c;
          all = inOther(p, s);
        }
      if (all) mask |= 1 << bit;
    }
    return mask;
  });
}

/**
 * The look of stones in a §19.1 finish, varied stone by stone: the finish's
 * tones, a little shade jitter, moss in patches (more low down), lichen,
 * cracks on only some of the stones (a wall where every block is crazed reads
 * as a texture, not as damage) and grime that deepens where `streaks` runs.
 */
export function finishLook(f: StoneFinish, seed: number, o: { streaks?: (x: number, y: number) => number; moss?: number } = {}): (x: number, y: number, z: number) => StoneLook {
  const [moss, lichen, crack, stain] = f.surf;
  return (x, y, z) => {
    const [i, j, k] = [Math.round(x * 16), Math.round(y * 16), Math.round(z * 16)];
    const h = (salt: number) => hash3(i, j, k, seed + salt);
    const n = valueNoise3(x / 1.6, y / 1.6, z / 1.6, seed + 5);
    const s = valueNoise3(x / 1.2 + 7, y / 2.4, z / 1.2, seed + 9);
    const low = clamp01(1 - y / 2);
    return {
      color: f.palette[Math.floor(h(1) * f.palette.length) % f.palette.length],
      shade: 1 + (h(2) - 0.5) * 0.14,
      surf: [
        clamp01(moss * (0.3 + 1.2 * n + 0.5 * low) + (o.moss ?? 0) * (0.5 + n)),
        clamp01(lichen * (0.4 + 1.2 * h(3))),
        h(4) < 0.28 ? clamp01(crack * 1.3) : 0,
        // (grime varies stone by stone but stays under the sheets' warm, sunlit stone)
        clamp01(Math.max(stain * (0.3 + 0.75 * s), o.streaks?.(x, y) ?? 0)),
      ],
    };
  };
}

/**
 * One lathe-turned baluster, bottom at y0, standing on (x, z): a square base,
 * a slim shaft with two turned rings and a capital, the rings cut as crossed
 * boxes so they read round — the sheets' stacked-disc balusters, a dozen
 * boxes each. `size` 1 = shaft 3 texels, rings 5; ≥ 1.5 = shaft 5, rings 7
 * (the columns of an open colonnade).
 */
export function baluster(b: VoxelBuilder, x: number, y0: number, y1: number, z: number, palette: readonly number[], surf: Surf, seed: number, size = 1): void {
  // On a texel centre, so the odd widths keep their edges on the texel grid.
  const cx = (Math.floor(x / T) + 0.5) * T;
  const cz = (Math.floor(z / T) + 0.5) * T;
  const [ws, wr] = size >= 1.5 ? [5, 7] : [3, 5];
  const n = Math.max(8, Math.round((y1 - y0) / T));
  const tone = (k: number) => palette[Math.floor(hash3(k, 3, 1, seed) * palette.length) % palette.length];
  const src = here();
  // (`e` trims a crossing box's ends by a hair, so the pair never shares a face plane)
  const part = (j0: number, j1: number, wx: number, wz: number, k: number, shade = 1, e = 0) =>
    b.box(cx, y0 + ((j0 + j1) / 2) * T, cz, wx * T, (j1 - j0) * T - 2 * e, wz * T, tone(k), 'sandstone', { shade, surf, src });
  const ring = (j0: number, j1: number, k: number) => {
    part(j0, j1, wr, wr - 2, k);
    part(j0, j1, wr - 2, wr, k, 1, HAIR);
  };
  // Stout shafts are cut octagonal too; slim ones are too thin for it to show.
  const shaft = (j0: number, j1: number, k: number) => {
    if (ws < 5) return part(j0, j1, ws, ws, k, 0.94);
    part(j0, j1, ws, ws - 2, k, 0.94);
    part(j0, j1, ws - 2, ws, k, 0.94, HAIR);
  };
  const r1 = Math.round(n * 0.3);
  const r2 = Math.round(n * 0.62);
  part(0, 2, wr, wr, 0);
  shaft(2, r1, 1);
  ring(r1, r1 + 2, 2);
  shaft(r1 + 2, r2, 3);
  ring(r2, r2 + 2, 4);
  shaft(r2 + 2, n - 3, 5);
  ring(n - 3, n - 2, 6);
  part(n - 2, n, wr, wr, 7);
}

/** The spans of a‥b left between the holes. */
export function spansOf(a: number, b: number, holes: readonly [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let s = a;
  for (const [p, q] of [...holes].sort((u, v) => u[0] - v[0])) {
    if (q <= s + 1e-6 || p >= b - 1e-6) continue;
    if (p > s + 1e-6) out.push([s, p]);
    s = Math.max(s, q);
  }
  if (s < b - 1e-6) out.push([s, b]);
  return out;
}

/** Split a height into equal courses of at most 0.5 m (texel-snapped). */
export function coursesOf(h: number): number[] {
  const n = Math.max(1, Math.ceil(h / 0.5 - 1e-6));
  const out: number[] = [];
  let prev = 0;
  for (let i = 1; i <= n; i++) {
    const y = i === n ? h : snap((h * i) / n);
    out.push(y - prev);
    prev = y;
  }
  return out;
}

/** A tread the weather settles on: x0‥x1 at height y, from z0 back to its front edge z1. */
export interface Ledge {
  x0: number;
  x1: number;
  y: number;
  z0: number;
  z1: number;
  /** Joints along it (x), where grass takes root. */
  joints: number[];
}

/** An opening through the wall. */
interface Opening {
  a: number;
  b: number;
  y0: number;
  y1: number;
  door: boolean;
}

/** Build one façade segment as a kit piece. */
export function galleryFacade(o: FacadeOptions): KitPiece {
  const p = new PieceBuilder();
  const f = o.finish;
  const m = new DryMasonry(o.seed);
  const L = snap(o.length);
  const [x0, x1] = [-L / 2, L / 2];
  const D = FACADE.depth;
  const H = snap(o.height ?? FACADE.cornice);
  const P = snap(Math.min(1, Math.max(0, o.plinth ?? FACADE.plinth)), 0.25);
  const sill = snap(Math.max(P, o.sill ?? FACADE.sill));
  const head = snap(Math.min(H - 0.5, Math.max(sill + 0.75, o.lintel ?? FACADE.lintel)));
  const pw = snap(o.pilaster?.width ?? 1);
  const pd = snap(o.pilaster?.depth ?? 0.25);
  const w = {
    missing: o.weather?.missing ?? 0,
    cracked: o.weather?.cracked ?? (f.surf[2] >= 0.3 ? Math.max(1, Math.round(L / 5)) : 0),
    moss: o.weather?.moss ?? (f.surf[0] >= 0.4 ? f.surf[0] : 0),
    grass: o.weather?.grass ?? 0,
    streaks: o.weather?.streaks ?? (f.surf[3] >= 0.2 ? f.surf[3] : 0),
  };
  // Run-off streaks: bands below the cornice (and the sills) where rain water runs down the face.
  const r = rng(o.seed * 7 + 3);
  const bands: [number, number, number][] = [];
  if (w.streaks > 0) for (let x = x0 + r.range(0.2, 1.2); x < x1; x += r.range(0.9, 2.2)) bands.push([x, r.range(0.25, 0.6), r.range(0.5, 1)]);
  const streaks = (x: number, y: number) => {
    let s = 0;
    for (const [bx, bw, k] of bands) if (Math.abs(x - bx) < bw) s = Math.max(s, k * (y > head ? 1 : y > P ? 0.75 : 0.5));
    return s * w.streaks;
  };
  const look = finishLook(f, o.seed, { streaks });
  const ledges: Ledge[] = [];
  // A course's top as a ledge for moss and grass, less the spans something stands on.
  const ledgeOf = (stones: Stone[], y: number, z0: number, z1: number, covered: readonly [number, number][] = []) => {
    if (!stones.length) return;
    const joints = stones.slice(0, -1).map((s) => s.box[3]);
    for (const [a, b] of spansOf(stones[0].box[0], stones[stones.length - 1].box[3], covered)) ledges.push({ x0: a, x1: b, y, z0, z1, joints: joints.filter((j) => j > a && j < b) });
  };

  // Bays: a window (or the door) centred in each.
  const bays = Math.max(1, Math.round(L / (o.bay ?? 3)));
  const edges = Array.from({ length: bays + 1 }, (_, i) => snap(x0 + (L * i) / bays));
  const doorBay = o.door ? Math.floor(bays / 2) : -1;
  const doorTop = snap(Math.min(P + 3.5, H - 0.5), 0.25);
  const openings: Opening[] = [];
  for (let i = 0; i < bays; i++) {
    const cx = (edges[i] + edges[i + 1]) / 2;
    const bw = edges[i + 1] - edges[i];
    if (i === doorBay) {
      const dw = Math.min(1.75, bw - 1.25);
      openings.push({ a: snap(cx - dw / 2), b: snap(cx + dw / 2), y0: P, y1: doorTop, door: true });
    } else {
      const ww = Math.min(o.window ?? FACADE.window, bw - 1);
      if (ww >= 0.5) openings.push({ a: snap(cx - ww / 2), b: snap(cx + ww / 2), y0: sill, y1: head, door: false });
    }
  }
  // The door's frame stands proud of the wall, a little wider than the door.
  const JAMB = 0.375;
  const outer = (op: Opening): [number, number] => (op.door ? [op.a - JAMB, op.b + JAMB] : [op.a, op.b]);

  // Pilasters on the piers between the bays (and at the ends): as wide as the pier allows.
  const pilasters: [number, number][] = [];
  const free = (x: number) => {
    // Room either side of x before the nearest opening (or the façade's end).
    let lo = x0;
    let hi = x1;
    for (const q of openings) {
      const [a, b] = outer(q);
      if (b <= x + 1e-6) lo = Math.max(lo, b);
      if (a >= x - 1e-6) hi = Math.min(hi, a);
    }
    return [lo, hi];
  };
  for (let i = 1; i < bays; i++) {
    const [lo, hi] = free(edges[i]);
    const half = snap(Math.min(pw / 2, edges[i] - lo - 0.125, hi - edges[i] - 0.125));
    if (half >= 0.1875) pilasters.push([edges[i] - half, edges[i] + half]);
  }
  if (!o.openEnds) {
    const [, hiL] = free(x0);
    const [loR] = free(x1);
    const wl = snap(Math.min(pw, hiL - x0 - 0.25));
    const wr = snap(Math.min(pw, x1 - loR - 0.25));
    if (wl >= 0.375) pilasters.push([x0, x0 + wl]);
    if (wr >= 0.375) pilasters.push([x1 - wr, x1]);
  }
  // A pilaster's base and capital stand a little wider and prouder than its shaft.
  const flare = (a: number, b: number): [number, number] => [a <= x0 + 1e-6 ? a : a - 0.125, b >= x1 - 1e-6 ? b : b + 0.125];

  // Plinth: courses stepping back as they rise.
  const plinth = P >= 1 ? [0.5, ...Array(Math.round((P - 0.5) / 0.25)).fill(0.25)] : Array(Math.round(P / 0.25)).fill(0.25);
  let y = 0;
  plinth.forEach((h, i) => {
    const front = plinth.length > 1 ? snap(0.5 - (0.25 * i) / (plinth.length - 1)) : 0.25;
    const next = i < plinth.length - 1 ? snap(0.5 - (0.25 * (i + 1)) / (plinth.length - 1)) : 0;
    const stones = m.course([x0, y, -D, x1, y + h, front], { length: [0.75, 1.5], row: i, look });
    // (the top step carries the pilaster bases and the door frame)
    ledgeOf(stones, y + h, next, front, i === plinth.length - 1 ? [...pilasters.map(([a, b]) => flare(a, b)), ...openings.filter((q) => q.door).map(outer)] : []);
    p.collider(x0, 0, 0, x1, y + h, front);
    y += h;
  });

  // The wall: course boundaries at the string course, sills, heads and door head.
  const cuts = new Set<number>([P, H, sill, head]);
  const string = sill - P >= 0.45 && openings.some((q) => !q.door);
  if (string) cuts.add(sill - 0.25);
  if (doorBay >= 0 && doorTop > P && doorTop < H) cuts.add(doorTop);
  const levels = [...cuts].filter((v) => v >= P && v <= H).sort((a, b) => a - b);
  let row = 0;
  for (let l = 0; l + 1 < levels.length; l++) {
    let yb = levels[l];
    for (const h of coursesOf(levels[l + 1] - levels[l])) {
      const [ya, yc] = [yb, yb + h];
      yb = yc;
      // The string course under the sills projects (a ledge), broken by the pilaster bases.
      const isString = string && Math.abs(ya - (sill - 0.25)) < 1e-6;
      const holes = openings.filter((q) => q.y0 < yc - 1e-6 && q.y1 > ya + 1e-6).map(outer);
      const heads = openings.filter((q) => Math.abs(q.y1 - ya) < 1e-6);
      const fixed = heads.map((q) => (q.door ? { a: q.a - JAMB, b: q.b + JAMB, proud: 0.1875 } : { a: q.a - 0.25, b: q.b + 0.25, proud: T }));
      for (const [a, b] of spansOf(x0, x1, holes)) {
        const course: CourseOptions = { length: [0.5, 1.25], row, closed: FACE.ny | (isString ? 0 : FACE.py), fixed, openBelow: heads.map((q) => [q.a, q.b]), look };
        m.course([a, ya, -D, b, yc, 0], course);
        // (a ledge standing proud of the wall: its underside is open)
        if (isString) for (const [sa, sb] of spansOf(a, b, pilasters.map(([u, v]) => flare(u, v)))) ledgeOf(m.course([sa, ya, 0, sb, yc, 0.125], { ...course, closed: FACE.nz }), yc, 0, 0.125);
      }
      row++;
    }
  }

  // Door frame: jambs standing proud either side of the doorway.
  for (const q of openings.filter((u) => u.door)) {
    for (const [a, b] of [
      [q.a - JAMB, q.a],
      [q.b, q.b + JAMB],
    ])
      m.wall([a, P, -D, b, q.y1, 0.1875], coursesOf(q.y1 - P), { length: [JAMB, JAMB], closed: FACE.ny | FACE.py, look });
  }

  // Pilasters: base, shaft of alternating stones, capital. (Base and capital
  // overhang what they stand on, so their undersides count as open.)
  const baseTop = snap(Math.max(sill, P + 0.5));
  const capH = 0.375;
  for (const [a, b] of pilasters) {
    const [fa, fb] = flare(a, b);
    const base = coursesOf(baseTop - P);
    m.course([fa, P, 0, fb, P + base[0], pd + 0.125], { length: [0.5, 1], closed: FACE.nz | (base.length > 1 ? FACE.py : 0), look });
    if (base.length > 1) m.wall([fa, P + base[0], 0, fb, baseTop, pd + 0.125], base.slice(1), { length: [0.5, 1], closed: FACE.nz, row: 1, look });
    m.wall([a, baseTop, 0, b, H - capH, pd], coursesOf(H - capH - baseTop), { length: [0.5, 1], closed: FACE.ny | FACE.nz | FACE.py, row: 1, look });
    m.course([fa, H - capH, 0, fb, H, pd + 0.125], { length: [2, 2], closed: FACE.nz | FACE.py, look });
    p.collider(fa, P, 0, fb, H, pd + 0.125);
  }

  // Cornice: two projecting courses, then the parapet stepping back to the roof.
  const c1 = pd + 0.125;
  const c2 = pd + 0.25;
  m.course([x0, H, -D, x1, H + 0.25, c1], { length: [0.75, 1.5], closed: FACE.py, look });
  // (the pier heads stand on the cornice and the parapet's first step; the roof covers the second)
  ledgeOf(m.course([x0, H + 0.25, -D, x1, H + 0.5, c2], { length: [0.75, 1.5], closed: 0, row: 1, look }), H + 0.5, -0.25, c2, pilasters);
  ledgeOf(m.course([x0, H + 0.5, -D, x1, H + 1.0, -0.25], { length: [0.75, 1.5], look }), H + 1.0, -0.5, -0.25, pilasters);
  const parapet = m.course([x0, H + 1.0, -D, x1, H + 1.5, -0.5], { length: [0.75, 1.5], row: 1, look });
  if (!(o.gallery ?? 0)) ledgeOf(parapet, H + 1.5, -D, -0.5);
  // Pier heads over the pilasters, in front of the parapet's steps, each with a cap stone.
  for (const [a, b] of pilasters) {
    m.course([a, H + 0.5, -0.25, b, H + 1.0, pd], { length: [0.5, 1], row: 1, closed: FACE.ny | FACE.nz | FACE.py, look });
    m.course([a, H + 1.0, -0.5, b, H + 1.5, pd], { length: [0.5, 1], closed: FACE.ny | FACE.nz, look });
    const cx = snap((a + b) / 2);
    m.course([cx - 0.25, H + 1.5, snap(pd / 2) - 0.3125, cx + 0.25, H + 1.75, snap(pd / 2) + 0.1875], { length: [1, 1], closed: 0, look });
  }

  // The windows: deep, dark recesses with the balusters standing in them; the door: a dark passage.
  const cav = SANDSTONE.cavity;
  const src = here();
  const dark = (bx0: number, by0: number, bz0: number, bx1: number, by1: number, bz1: number, k: number) =>
    p.voxels.span(bx0, by0, bz0, bx1, by1, bz1, cav[k % cav.length], 'sandstone', { shade: 0.42, open: 0, src });
  const zf = -2 * T; // linings start two texels in, so each reveal keeps a lit arris
  openings.forEach((q, i) => {
    dark(q.a, q.y0, -D, q.a + T, q.y1, zf, i);
    dark(q.b - T, q.y0, -D, q.b, q.y1, zf, i + 1);
    dark(q.a + T, q.y1 - T, -D, q.b - T, q.y1, zf, i + 2);
    dark(q.a + T, q.y0, -D, q.b - T, q.y0 + T, zf, i);
    dark(q.a + T, q.y0 + T, -D, q.b - T, q.y1 - T, -D + T, i + 1);
    if (q.door) return;
    const width = q.b - q.a;
    const n = o.balusters ?? Math.max(2, Math.round(width / 0.45));
    // Tall openings with room between the shafts get the colonnade's stout columns.
    const size = q.y1 - q.y0 > 2.2 && width / n >= 0.55 ? 1.6 : 1;
    for (let k = 0; k < n; k++) baluster(p.voxels, q.a + ((k + 0.5) * width) / n, q.y0 + T, q.y1 - T, -0.4375, f.palette, f.surf, o.seed + i * 7 + k, size);
  });

  // The gallery behind: its back wall, and the corbelled roof stepping in to a ridge.
  const G = o.gallery ?? 0;
  if (G > 0) {
    const back = snap(-D - G);
    m.wall([x0, 0, back, x1, H + 1.5, back + 0.75], coursesOf(H + 1.5), { length: [1, 2], closed: FACE.ny | FACE.py, look });
    p.collider(x0, 0, back, x1, H + 1.5, back + 0.75);
    const mid = snap((back - 0.5) / 2);
    const steps = Math.max(2, Math.round(G / 1.2));
    let ry = H + 1.5;
    for (let t = 0; t < steps; t++) {
      const inset = snap(((mid - back) * t) / steps);
      const next = snap(((mid - back) * (t + 1)) / steps);
      // (the first tier spans the corridor: its underside is open between the walls)
      const tier = m.course([x0, ry, back + inset, x1, ry + 0.5, -0.5 - inset], { length: [0.75, 1.5], row: t, closed: t ? FACE.ny : 0, look });
      ledgeOf(tier, ry + 0.5, -0.5 - next, -0.5 - inset);
      ry += 0.5;
    }
    // Ridge course (no wider than the last tier) under a row of capping stones.
    const rw = Math.min(0.375, snap((mid - back - snap(((mid - back) * (steps - 1)) / steps)) * 0.9));
    m.course([x0, ry, mid - rw, x1, ry + 0.375, mid + rw], { length: [1, 2], look });
    ledgeOf(m.course([x0, ry + 0.375, mid - 0.1875, x1, ry + 0.5625, mid + 0.1875], { length: [0.5, 0.75], look }), ry + 0.5625, mid - 0.1875, mid + 0.1875);
    p.collider(x0, H + 1.5, back, x1, ry + 0.5625, -0.5);
  }

  // Age: split stones, knocked-out stones, chipped arrises on the rest.
  const dr = rng(o.seed * 13 + 5);
  const face = m.stones.filter((s) => s.face === FACE.pz && s.box[5] >= -1e-6 && s.box[4] - s.box[1] >= 0.25);
  // Plain wall stones in the open (not lintels, which stand proud, nor stones behind a pilaster
  // or the door's frame) and the stones of the pilaster shafts.
  const covers = [...pilasters.map(([a, b]) => flare(a, b)), ...openings.filter((q) => q.door).map(outer)];
  const wallStones = face.filter(
    (s) =>
      s.box[1] >= P - 1e-6 &&
      s.box[4] <= H + 1e-6 &&
      s.box[3] - s.box[0] >= 0.5 &&
      ((Math.abs(s.box[5]) < 1e-6 && !covers.some(([a, b]) => s.box[3] > a - T && s.box[0] < b + T)) || (Math.abs(s.box[5] - pd) < 1e-6 && s.box[1] >= baseTop - 1e-6 && s.box[4] <= H - capH)),
  );
  const pick = () => wallStones.splice(dr.int(0, wallStones.length - 1), 1)[0];
  for (let k = 0; k < w.cracked && wallStones.length; k++) m.crack(pick(), dr.int(1, 1e6));
  for (let k = 0; k < w.missing && wallStones.length; k++) m.knockOut(pick(), 0.5);
  for (const s of face) if (!s.crack && !s.gone && dr.chance(f.wear * 0.7)) m.chip(s, dr.int(1, 1e6));
  m.emit(p.voxels);

  // Run-off streaks: dark stains two or three texels wide running down the face
  // from under the cornice, the capitals and the sill ledge, fading as they go —
  // stopping at the window heads, the ledges and the holes.
  const holes = m.stones.filter((s) => s.gone);
  // (strands never overlap one another: overlapping faces would flicker)
  const strands: Box6[] = [];
  for (const [bx, bw, k] of bands) {
    for (let n = Math.max(1, Math.round(bw * 7 * k * w.streaks)); n > 0; n--) {
      const x = snap(bx + r.range(-bw, bw));
      const sw = r.pick([2, 2, 3]) * T;
      if (x < x0 + T || x + sw > x1 - T) continue;
      const pil = pilasters.find(([a, b]) => x >= a + T && x + sw <= b - T);
      const onPil = pilasters.some(([a, b]) => x + sw > a - 0.125 && x < b + 0.125);
      if (onPil && !pil) continue;
      const zf = pil ? pd : 0;
      const fromSill = !pil && string && r.chance(0.3);
      const top = pil ? H - capH : fromSill ? sill - 0.25 : H;
      let bottom = top - r.range(0.5, 2.6) * k;
      for (const q of openings) {
        const [a, b] = outer(q);
        if (pil || x + sw <= a - 0.25 || x >= b + 0.25) continue;
        // Stop on the course over a window; never run into an opening.
        if (q.y1 <= top) bottom = Math.max(bottom, q.y1 + 0.5);
        else if (q.y0 < top) bottom = top;
      }
      if (!pil && !fromSill && string) bottom = Math.max(bottom, sill);
      bottom = snap(Math.max(bottom, P + 0.25));
      if (top - bottom < 0.375 || holes.some((s) => x + sw > s.box[0] && x < s.box[3] && s.box[1] < top && s.box[4] > bottom)) continue;
      if (strands.some((q) => x + sw > q[0] - 1e-6 && x < q[3] + 1e-6 && bottom < q[4] && top > q[1] && zf === q[2])) continue;
      strands.push([x, bottom, zf, x + sw, top, zf]);
      // Darkest under the ledge, fainter lower down.
      const mid = snap(top - (top - bottom) * r.range(0.35, 0.6));
      const stain = SANDSTONE.cavity[2];
      p.voxels.span(x, mid, zf, x + sw, top, zf + T / 4, stain, 'sandstone', { shade: 1.05, open: 16, surf: STREAK, src });
      p.voxels.span(x, bottom, zf, x + sw, mid, zf + T / 4, stain, 'sandstone', { shade: 1.4, open: 16, surf: STREAK, src });
    }
  }

  // Overgrowth on the ledges: moss cushions hanging over their edges, grass in their joints.
  if (w.moss > 0 || w.grass > 0) overgrow(p, ledges, w.moss, w.grass, o.seed);

  p.collider(x0, P, -D, x1, H + 1.5, 0);
  return p.done();
}

/** The pattern of the run-off streaks: grimy texels over the dark. */
const STREAK = stoneSurf({ stain: 0.6 });

/** Moss tones for the cushions: the sheets' ledge moss, olive to bright yellow-green. */
const CUSHION = [MOSS[0], MOSS[2], MOSS[4], 0x8a9a3e, 0x7d9038] as const;

/**
 * Moss cushions along the ledges — a texel-thick pad hugging the front edge,
 * a lump or two on it, strands hanging down the face below — and grass tufts
 * rooted in the ledges' joints (`moss`, `grass` 0‥1).
 */
export function overgrow(p: PieceBuilder, ledges: readonly Ledge[], moss: number, grass: number, seed: number): void {
  const r = rng(seed * 3 + 17);
  const v = p.voxels;
  const src = here();
  // Cushions laid per ledge (x ranges), so grass in a joint they cover roots on top of them.
  const cushions = new Map<Ledge, [number, number][]>();
  for (const l of ledges) {
    if (moss <= 0) break;
    const laid: [number, number][] = [];
    cushions.set(l, laid);
    const depth = l.z1 - l.z0;
    // (cushions side by side, never overlapping: overlapping tops would flicker)
    for (let x = l.x0 + r.range(0, 0.6); x < l.x1 - 0.2; x += r.range(0.3, 1.1)) {
      if (!r.chance(moss)) continue;
      const xa = snap(x);
      const len = snap(Math.min(l.x1 - xa, r.range(0.25, 0.4 + moss)));
      const d = snap(Math.min(depth, r.range(2, 5) * T));
      if (len < 2 * T || d < T) continue;
      x = xa + len;
      const c = () => CUSHION[r.int(0, CUSHION.length - 1)];
      v.span(xa, l.y, l.z1 - d, xa + len, l.y + T, l.z1 + T / 2, c(), 'leaves', { shade: 0.95, src });
      laid.push([xa - T, xa + len + T]);
      if (len > 4 * T && r.chance(0.7)) {
        const lx = snap(xa + r.range(T, len - 3 * T));
        v.span(lx, l.y + T, l.z1 - Math.min(d, 2 * T), lx + snap(r.range(2, 3) * T), l.y + 2 * T, l.z1, c(), 'leaves', { shade: 1.05, src });
      }
      // Now and then a strand hanging over the edge.
      if (r.chance(0.45)) {
        const sx = snap(xa + r.range(0, len - T));
        const h = r.int(1, 3) * T;
        v.span(sx, l.y - h, l.z1, sx + T, l.y, l.z1 + T / 2, c(), 'leaves', { shade: 0.85, src });
      }
    }
  }
  if (grass <= 0) return;
  const g = grassGrid(p, [snap(ledges.reduce((a, l) => Math.min(a, l.x0), 0)) - 1, 0, -8], seed);
  const [ox, , oz] = g.origin;
  for (const l of ledges) {
    for (const jx of l.joints) {
      if (!r.chance(grass * 0.55)) continue;
      const onMoss = (cushions.get(l) ?? []).some(([a, b]) => jx > a && jx < b);
      const j = Math.round(l.y / T) + (onMoss ? 1 : 0);
      const i = Math.round((jx - ox) / T);
      // (clear of the wall behind the ledge: a tuft spreads a texel or two)
      const k = Math.round((r.range(Math.min(l.z0 + 2.5 * T, l.z1 - T), l.z1 - T) - oz) / T);
      ghostGround(g, i - 2, k - 2, i + 2, k + 2, j);
      if (r.chance(0.6)) plusTuft(g, i, k, { j, height: r.int(2, 4), seed: r.int(1, 1e6), tones: GRASS_TONES.meadow });
      else grassTuft(g, i, k, { j, height: r.int(3, 6), radius: 1, arms: 0.3, seed: r.int(1, 1e6), tones: GRASS_TONES.meadow });
    }
  }
  commitGrass(p, g, { seed });
}

/** The finish of a §19.1 sample by name. */
export const finish = (name: keyof typeof STONE_FINISH): StoneFinish => STONE_FINISH[name];
