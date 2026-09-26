import { beads, figure, foliage, HALF, kala, medallion, niche, petals, Relief, rosette, StoneWork, type Carving, type V3 } from '../../lib/carving';
import { FACE, finishLook, type Box6, type StoneLook } from '../../lib/gallery';
import { mossTops, type MossTop } from '../../lib/openings';
import { placePiece, type PlaceTarget } from '../../place';
import { PieceBuilder } from '../../PieceBuilder';
import type { StoneFinish } from '../../surface';

/**
 * §16 ⑨ terrace decorative blocks — the eight small carved stones of the
 * sheet, as builders the stair (and anyone dressing a terrace rim) can set
 * down: each a stack of dressed stones, bottom up, centred on its footprint,
 * the bigger courses laid as two stones (the joint turning course by course,
 * like the sheet's blocks), the carving cut into the faces on the half-texel
 * grid with lib/carving (reliefs run on across the joints, as Khmer reliefs
 * do), moss on every step's top.
 *
 * Placement: `at` is the centre of the footprint on the ground it stands on;
 * the front (+Z) carries the main carving, `turn` quarter-turns it as in
 * place.ts. One collider, the stack's widest course from the ground to its top.
 */

export type DecoKind = 'rosette' | 'lotus' | 'figure' | 'relief' | 'moulded' | 'corner' | 'stacked' | 'shrine';

/** The sheet's eight blocks in its order (top row, then bottom row), with their names on the cards. */
export const DECO_KINDS: readonly { id: DecoKind; name: string }[] = [
  { id: 'rosette', name: 'Rosette block' },
  { id: 'lotus', name: 'Lotus-bud finial' },
  { id: 'figure', name: 'Devata post' },
  { id: 'relief', name: 'Kala block' },
  { id: 'moulded', name: 'Moulded pedestal' },
  { id: 'corner', name: 'Carved corner block' },
  { id: 'stacked', name: 'Stacked finial' },
  { id: 'shrine', name: 'Miniature shrine' },
];

export interface DecoOptions {
  kind: DecoKind;
  finish: StoneFinish;
  seed: number;
  /** Centre of the footprint on its ground (default the origin). */
  at?: V3;
  /** Quarter turns about +Y (0: the main carving faces +Z). */
  turn?: number;
  /** Moss on the tops, 0‥1 (default 0.3). */
  moss?: number;
  /** Add the collider (default true). */
  collide?: boolean;
}

/** Where a block ended up: its top (metres above its ground) and its box in the target. */
export interface DecoPlaced {
  top: number;
  box: Box6;
}

/** Faces a course can be carved on. */
type Side = 'pz' | 'px' | 'nz' | 'nx' | 'py';
/** A face's relief, given its size in cells (u across, v up; for the top, u along x and v back). */
type Cut = (w: number, h: number) => Relief | undefined;

interface Course {
  /** Width (x = z, metres). */
  w: number;
  h: number;
  /** A sunk fillet in its own shadow (a neck under a capital). */
  dark?: boolean;
  /** Reliefs per face. */
  cut?: Partial<Record<Side, Cut>>;
  /** Stones in the course (default: two where it is 0.625 m or wider). */
  stones?: 1 | 2;
  /** Leave a gap this wide through the middle along x (a notched top: two stones either side). */
  notch?: number;
  /** Depth of a relief level (default a half texel). */
  step?: number;
}

const C = HALF;
const cells = (m: number) => Math.round(m / C);

/** The same relief on the four sides. */
const sides = (cut: Cut): Partial<Record<Side, Cut>> => ({ pz: cut, px: cut, nz: cut, nx: cut });

/** A sunk panel with a raised border `b` cells wide, a motif stamped at its centre (the ground at 0). */
function panel(w: number, h: number, b: number, motif?: Relief): Relief {
  const r = new Relief(w, h, { face: 2 });
  r.rect(b, b, w - b, h - b, 0);
  if (motif) r.stamp(motif, Math.round((w - motif.w) / 2), Math.round((h - motif.h) / 2), { op: 'over', ground: 0 });
  return r;
}

/** The eight designs (metres; widths are square footprints). */
function coursesOf(kind: DecoKind): Course[] {
  switch (kind) {
    case 'rosette':
      // A 0.75 m cube in two courses, a lotus rosette in a sunk square on every side, running across the joint.
      return [
        { w: 0.75, h: 0.375, cut: sides((w, h) => rosetteFace(w, h * 2, 0)) },
        { w: 0.75, h: 0.375, cut: sides((w, h) => rosetteFace(w, h * 2, h)) },
      ];
    case 'lotus':
      // Square foot, a dark neck, the bud swelling out with a ring of lotus petals, stepping in to a point.
      return [
        { w: 0.5, h: 0.25, stones: 2 },
        { w: 0.375, h: 0.0625, dark: true },
        { w: 0.5625, h: 0.25, step: C / 2, cut: sides((w, h) => petals(w, h, { width: 9 }).rect(0, 0, w, 1, 2)) },
        { w: 0.4375, h: 0.125, step: C / 2, cut: sides((w, h) => petals(w, h, { width: 7 })) },
        { w: 0.3125, h: 0.125 },
        { w: 0.1875, h: 0.0625 },
        { w: 0.0625, h: 0.0625 },
      ];
    case 'figure':
      // A post: a foot, a dark neck, a shaft with a devata standing in a pointed niche on each side, a capital and a knob.
      return [
        { w: 0.625, h: 0.25 },
        { w: 0.5, h: 0.0625, dark: true },
        { w: 0.5625, h: 0.5625, stones: 1, cut: sides((w, h) => devataFace(w, h)) },
        { w: 0.625, h: 0.125, cut: sides((w, h) => petals(w, h, { width: 4, down: true })) },
        { w: 0.375, h: 0.1875 },
        { w: 0.1875, h: 0.0625 },
      ];
    case 'relief':
      // A kala's face on the front and back, foliage on the sides, under a projecting cap with a notched crest.
      return [
        { w: 0.75, h: 0.25 },
        { w: 0.625, h: 0.625, stones: 1, cut: { pz: (w, h) => kalaFace(w, h), nz: (w, h) => kalaFace(w, h), px: (w, h) => foliageFace(w, h), nx: (w, h) => foliageFace(w, h) } },
        { w: 0.75, h: 0.125 },
        { w: 0.5, h: 0.1875, notch: 0.125 },
      ];
    case 'moulded':
      // A Khmer moulded pedestal: base band, sunk fillet, a band of lozenges, sunk fillet, top band and a thin slab.
      return [
        { w: 0.75, h: 0.25 },
        { w: 0.6875, h: 0.0625, dark: true },
        { w: 0.75, h: 0.1875, cut: sides((w, h) => beads(w, h, { pitch: 6 })) },
        { w: 0.6875, h: 0.0625, dark: true },
        { w: 0.75, h: 0.25 },
        { w: 0.5, h: 0.0625, stones: 1 },
      ];
    case 'corner':
      // A terrace corner stone: foliage carved on its two outer faces round a plain arris, a medallion on the top.
      return [
        { w: 0.75, h: 0.375, cut: { pz: (w, h) => cornerFace(w, h * 2, 0, 'right'), px: (w, h) => cornerFace(w, h * 2, 0, 'left') } },
        {
          w: 0.75,
          h: 0.375,
          cut: { pz: (w, h) => cornerFace(w, h * 2, h, 'right'), px: (w, h) => cornerFace(w, h * 2, h, 'left'), py: (w, h) => panel(w, h, 3, medallion(w - 10, h - 10)) },
        },
      ];
    case 'stacked':
      // A foot, a dark neck, a projecting capital hung with lotus petals, a smaller block and a thin cap.
      return [
        { w: 0.625, h: 0.3125 },
        { w: 0.5, h: 0.0625, dark: true },
        { w: 0.75, h: 0.3125, step: C / 2, cut: sides((w, h) => petals(w, h - 2, { width: 8 }).rect(0, 0, w, 1, 2)) },
        { w: 0.5, h: 0.1875 },
        { w: 0.3125, h: 0.0625, stones: 1 },
      ];
    case 'shrine':
      // A miniature prasat (antefix): plinth, a body with a pointed door on each side, a cornice, three receding tiers, a bud.
      return [
        { w: 0.625, h: 0.25, stones: 2 },
        { w: 0.5, h: 0.3125, stones: 1, cut: sides((w, h) => doorFace(w, h)) },
        { w: 0.5625, h: 0.0625 },
        { w: 0.4375, h: 0.1875, cut: sides((w, h) => doorFace(w, h)) },
        { w: 0.3125, h: 0.1875 },
        { w: 0.1875, h: 0.125 },
        { w: 0.125, h: 0.0625 },
        { w: 0.0625, h: 0.0625 },
      ];
  }
}

/** A rosette face `H` cells tall, of which this course shows rows `v0`‥`v0 + h` (reliefs run across the joint). */
function rosetteFace(w: number, H: number, v0: number): Relief {
  const full = panel(w, H, 2, rosette(w - 6, { petals: 8 }));
  return slice(full, v0, Math.round(H / 2));
}

/** Rows v0‥v0 + h of a relief. */
function slice(r: Relief, v0: number, h: number): Relief {
  const out = new Relief(r.w, h, { face: r.face, ground: r.ground });
  for (let v = 0; v < h; v++) for (let u = 0; u < r.w; u++) out.set(u, v, r.get(u, v0 + v));
  return out;
}

/** A devata in a pointed niche, framed. */
function devataFace(w: number, h: number): Relief {
  const r = new Relief(w, h, { face: 2 });
  const nw = w - 4;
  const nh = h - 2;
  r.stamp(niche(nw, nh, { frame: 2 }), 2, 1, { map: (l) => (l < 0 ? null : l) });
  const f = figure(nh - 5, 'devata');
  r.stamp(f, Math.round((w - f.w) / 2), 2, { op: 'over', ground: 0 });
  return r;
}

/** A kala's face filling a framed panel. */
function kalaFace(w: number, h: number): Relief {
  return panel(w, h, 1, kala(w - 2, h - 3));
}

/** Foliage scrolls in a framed panel. */
function foliageFace(w: number, h: number): Relief {
  const r = panel(w, h, 2);
  r.stamp(foliage(w - 4, h - 4, { pitch: 8 }), 2, 2, { op: 'over', ground: 0 });
  return r;
}

/**
 * A corner stone's face `H` cells tall (this course: rows v0‥v0 + h): foliage
 * in a sunk field, stopped by a plain post 3 cells wide at the arris (`post`
 * = the end of the face at the corner, as seen looking at it).
 */
function cornerFace(w: number, H: number, v0: number, post: 'left' | 'right'): Relief {
  const r = new Relief(w, H, { face: 2 });
  const [a, b] = post === 'right' ? [2, w - 4] : [4, w - 2];
  r.rect(a, 2, b, H - 2, 0);
  r.stamp(foliage(b - a, H - 4, { pitch: 8 }), a, 2, { op: 'over', ground: 0 });
  // A band of petals along the foot, the base moulding of the terrace it turns.
  r.stamp(petals(b - a, 4, { width: 4 }), a, 2, { ground: 0 });
  return slice(r, v0, Math.round(H / 2));
}

/** A small pointed door (the antefix's shrine), dark inside. */
function doorFace(w: number, h: number): Relief {
  const r = new Relief(w, h, { face: 2 });
  const nw = Math.max(5, Math.round(w * 0.5)) | 1;
  const nh = Math.max(6, h - 2);
  r.stamp(niche(nw, nh, { frame: 1 }), Math.round((w - nw) / 2), 0, { map: (l) => (l < 0 ? null : l) });
  return r;
}

/**
 * Build one decorative block into `target` (see the file comment). The block
 * is built at the origin and placed, so its carving turns with it.
 */
export function decoBlock(target: PieceBuilder, o: DecoOptions): DecoPlaced {
  const p = new PieceBuilder();
  const base = finishLook(o.finish, o.seed, { moss: 0.05 });
  const w = new StoneWork({ look: base, seed: o.seed, recessMoss: 0.3, faceMoss: 0.4 });
  const list = coursesOf(o.kind);
  const tops: MossTop[] = [];
  let y = 0;
  let wide = 0;
  list.forEach((c, i) => {
    const hw = c.w / 2;
    const box: Box6 = [-hw, y, -hw, hw, y + c.h, hw];
    const carvings = carvingsOf(c, box);
    const two = (c.stones ?? (c.w >= 0.625 ? 2 : 1)) === 2;
    const look = (cx: number, cy: number, cz: number): StoneLook => {
      const l = base(cx, cy, cz);
      return c.dark ? { ...l, shade: (l.shade ?? 1) * 0.55 } : l;
    };
    const parts: Box6[] = [];
    if (c.notch) {
      // Two stones either side of the notch.
      parts.push([-hw, box[1], -hw, -c.notch / 2, box[4], hw], [c.notch / 2, box[1], -hw, hw, box[4], hw]);
    } else if (two) {
      // The joint turns course by course: across x on even courses, across z on odd ones.
      if (i % 2 === 0) parts.push([-hw, box[1], -hw, 0, box[4], hw], [0, box[1], -hw, hw, box[4], hw]);
      else parts.push([-hw, box[1], -hw, hw, box[4], 0], [-hw, box[1], 0, hw, box[4], hw]);
    } else parts.push(box);
    for (const b of parts) w.stone(b, carvings, { look: look((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2) });
    // Moss on what the course above leaves of its top.
    const up = list[i + 1];
    if (!c.dark && (!up || up.w < c.w)) {
      const u = up ? up.w / 2 : 0;
      const top: MossTop = { x0: -hw, z0: -hw, x1: hw, z1: hw, y: y + c.h, edges: FACE.px | FACE.nx | FACE.pz | FACE.nz };
      if (up) top.inner = [-u, -u, u, u];
      if (c.w >= 0.25) tops.push(top);
    }
    wide = Math.max(wide, c.w);
    y += c.h;
  });
  w.emit(p.voxels);
  mossTops(p, tops, o.moss ?? 0.3, o.seed);
  if (o.collide ?? true) p.collider(-wide / 2, 0, -wide / 2, wide / 2, y, wide / 2);
  const [x, gy, z] = o.at ?? [0, 0, 0];
  const turn = o.turn ?? 0;
  const t: PlaceTarget = { voxels: target.voxels, collider: (c) => target.colliders.push(c) };
  placePiece(t, p.done(), { x, y: gy, z, turn });
  return { top: y, box: [x - wide / 2, gy, z - wide / 2, x + wide / 2, gy + y, z + wide / 2] };
}

/** The course's reliefs, placed on its faces (cell (0, 0) at the left end of each face's bottom row). */
function carvingsOf(c: Course, b: Box6): Carving[] {
  const out: Carving[] = [];
  const [x0, y0, z0, x1, y1, z1] = b;
  const wc = cells(c.w);
  const hc = cells(c.h);
  const add = (side: Side, face: number, at: V3, w: number, h: number) => {
    const r = c.cut?.[side]?.(w, h);
    if (r) out.push({ face, relief: r, at, step: c.step });
  };
  add('pz', FACE.pz, [x0, y0, z1], wc, hc);
  add('px', FACE.px, [x1, y0, z1], wc, hc);
  add('nz', FACE.nz, [x1, y0, z0], wc, hc);
  add('nx', FACE.nx, [x0, y0, z0], wc, hc);
  add('py', FACE.py, [x0, y1, z1], wc, wc);
  return out;
}

/** Height of a block (metres). */
export function decoHeight(kind: DecoKind): number {
  return coursesOf(kind).reduce((a, c) => a + c.h, 0);
}

/** Width of a block's widest course (metres). */
export function decoWidth(kind: DecoKind): number {
  return Math.max(...coursesOf(kind).map((c) => c.w));
}
