import { hash3 } from '../../voxel/random';
import { BlockSet, masonry, type BlockStyle, type MasonryOptions } from '../BlockSet';
import { SOIL } from '../palette';
import type { PieceBuilder } from '../PieceBuilder';
import { placePiece, type Placement } from '../place';
import { snap } from '../shapes';
import { soilSurf, type StoneFinish } from '../surface';
import type { KitPiece } from '../types';

/**
 * Shared parts of the §18.1 environment examples (tree near temple wall, palms
 * along the causeway): the scene's ground, stairs, a prasat stand-in for the
 * towers of later sections, and putting kit pieces into stone without their
 * hidden blocks fighting the stone's faces.
 */

/** An axis-aligned box in scene space: [x0, y0, z0, x1, y1, z1] (metres). */
export type Box = readonly [number, number, number, number, number, number];

const inBox = (b: Box, x: number, y: number, z: number): boolean => x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5];

/**
 * Put a kit piece into the scene. Blocks whose centre lies inside one of `cut`
 * (the terrace or wall the piece grows into) are dropped — they'd be hidden,
 * and their faces would flicker against the stone's — and so are colliders
 * wholly inside one.
 */
export function put(p: PieceBuilder, piece: KitPiece | null, at: Placement, cut: readonly Box[] = []): void {
  if (!piece) return;
  const b0 = p.voxels.boxes.length;
  const c0 = p.colliders.length;
  placePiece({ voxels: p.voxels, collider: (c) => p.colliders.push(c), extra: (o) => p.extras.push(o) }, piece, at);
  if (!cut.length) return;
  const boxes = p.voxels.boxes;
  let w = b0;
  for (let n = b0; n < boxes.length; n++) if (!cut.some((c) => inBox(c, boxes[n].x, boxes[n].y, boxes[n].z))) boxes[w++] = boxes[n];
  boxes.length = w;
  const cols = p.colliders;
  let v = c0;
  for (let n = c0; n < cols.length; n++) {
    const { min, max } = cols[n];
    if (!cut.some((c) => min[0] >= c[0] && min[1] >= c[1] && min[2] >= c[2] && max[0] <= c[3] && max[1] <= c[4] && max[2] <= c[5])) cols[v++] = cols[n];
  }
  cols.length = v;
}

/**
 * Masonry for a big solid volume, laid as a shell: a top course over the
 * whole area and walls one block (0.5 m) thick round the sides — what can be
 * seen. The inside stays empty (every stone laid costs time, hidden ones too).
 */
export function shell(set: BlockSet, b: Box, o: MasonryOptions): number[] {
  const w = 0.5;
  const y1 = b[4] - Math.min(o.course, b[4] - b[1]);
  const ids = masonry(set, b[0], y1, b[2], b[3], b[4], b[5], { ...o, course: b[4] - y1, depth: o.depth ?? w });
  if (y1 - b[1] < 1e-6) return ids;
  const lay = (x0: number, z0: number, x1: number, z1: number, axis: 'x' | 'z', seed: number) =>
    x1 - x0 > 1e-6 && z1 - z0 > 1e-6 ? masonry(set, x0, b[1], z0, x1, y1, z1, { ...o, axis, depth: w, seed }) : [];
  const s = o.seed ?? 1;
  return [
    ...ids,
    ...lay(b[0], b[5] - w, b[3], b[5], 'x', s + 1),
    ...lay(b[0], b[2], b[3], b[2] + w, 'x', s + 2),
    ...lay(b[0], b[2] + w, b[0] + w, b[5] - w, 'z', s + 3),
    ...lay(b[3] - w, b[2] + w, b[3], b[5] - w, 'z', s + 4),
  ];
}

/**
 * Ground of a scene: one soil block per rectangle (top at y = 0, 0.5 m deep) —
 * the `soil` pattern draws the grass or bare dirt texels — with its collider.
 * Neighbouring rectangles merge (no bevel between them).
 */
export function soilGround(p: PieceBuilder, rects: readonly { x0: number; z0: number; x1: number; z1: number; grass?: number; dry?: number; wet?: number; moss?: number }[], depth = 0.5): void {
  for (const r of rects) {
    // Merge the sides that touch another rectangle.
    const touches = (x: number, z: number) => rects.some((o) => o !== r && x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1);
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const merge = (touches(r.x1 + 0.01, cz) ? 1 : 0) | (touches(r.x0 - 0.01, cz) ? 2 : 0) | (touches(cx, r.z1 + 0.01) ? 16 : 0) | (touches(cx, r.z0 - 0.01) ? 32 : 0);
    p.voxels.span(r.x0, -depth, r.z0, r.x1, 0, r.z1, SOIL.dirt[0], 'soil', { surf: soilSurf({ grass: r.grass ?? 0.9, dry: r.dry, wet: r.wet, moss: r.moss }), merge, open: 4 | (63 & ~merge & ~4 & ~8) });
    p.collider(r.x0, -depth, r.z0, r.x1, 0, r.z1);
  }
}

/** Direction a flight of steps climbs towards. */
export type Climb = '+x' | '-x' | '+z' | '-z';

/**
 * A flight of solid steps: `n` risers of `rise` over treads of `run`, `width`
 * wide, climbing from `foot` (the middle of the lowest step's nosing, on the
 * ground at foot[1]) towards `dir`. Each step runs back under the ones above
 * it (no gaps show at the sides), its tread laid as a few stones across the
 * flight; one collider per step.
 */
export function flight(set: BlockSet, p: PieceBuilder, o: { foot: [number, number, number]; dir: Climb; width: number; n: number; rise?: number; run?: number; palette: readonly number[]; style?: BlockStyle; seed?: number }): void {
  const rise = o.rise ?? 0.25;
  const run = o.run ?? 0.35;
  const [fx, fy, fz] = o.foot;
  const s = o.dir[0] === '+' ? 1 : -1;
  const alongX = o.dir[1] === 'x';
  for (let k = 0; k < o.n; k++) {
    const a0 = (alongX ? fx : fz) + s * k * run;
    const a1 = (alongX ? fx : fz) + s * o.n * run;
    const [u0, u1] = [Math.min(a0, a1), Math.max(a0, a1)];
    const c = alongX ? fz : fx;
    const box: Box = alongX ? [u0, fy + k * rise, c - o.width / 2, u1, fy + (k + 1) * rise, c + o.width / 2] : [c - o.width / 2, fy + k * rise, u0, c + o.width / 2, fy + (k + 1) * rise, u1];
    // Treads laid as a few slabs across the flight, so the joints stagger.
    masonry(set, box[0], box[1], box[2], box[3], box[4], box[5], { length: [0.75, 1.5], course: rise, axis: alongX ? 'z' : 'x', depth: run * 1.01, palette: o.palette, style: o.style, seed: (o.seed ?? 1) + k * 7 });
    p.collider(box[0], fy, box[2], box[3], box[4], box[5]);
  }
}

export interface TowerOptions {
  /** Centre of the tower's foot and the height it stands on. */
  x: number;
  y: number;
  z: number;
  /** Width of the plinth (metres). */
  base: number;
  /** Plinth to the tip of the finial (metres). */
  height: number;
  finish: StoneFinish;
  seed: number;
}

/**
 * A prasat stand-in (the towers of §05 / §14 aren't built yet): a moulded
 * plinth, a square cella with a false door on each face, then tiers in a
 * lotus-bud profile up to the finial — each tier a projecting cornice crowned
 * by antefix blocks at its corners and mid-sides, the bumpy stepped silhouette
 * of the sheets' towers. Returns its box, for a collider.
 */
export function prasat(set: BlockSet, o: TowerOptions): Box {
  const f = o.finish;
  const style: BlockStyle = { surf: f.surf };
  const top = o.y + o.height;
  const b = o.base;
  const lay = (hw: number, hd: number, y0: number, y1: number, seed: number, course = 0.5) =>
    shell(set, [o.x - hw, y0, o.z - hd, o.x + hw, y1, o.z + hd], { length: [0.5, 1.0], course, axis: 'x', palette: f.palette, style, seed });
  const block = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, n: number) =>
    set.add(o.x + x0, y0, o.z + z0, o.x + x1, y1, o.z + z1, f.palette[Math.floor(hash3(n, 3, 7, o.seed) * f.palette.length)], style);
  // Plinth: base course, recessed band, top course.
  let y = o.y;
  lay(b / 2, b / 2, y, y + 0.5, o.seed);
  lay(b / 2 - 0.25, b / 2 - 0.25, y + 0.5, y + 0.75, o.seed + 1, 0.25);
  lay(b / 2 - 0.125, b / 2 - 0.125, y + 0.75, y + 1.0, o.seed + 2, 0.25);
  y += 1.0;
  // Cella: about a third of the height.
  const cw = b / 2 - 0.5;
  const ch = Math.round((o.height * 0.3) / 0.5) * 0.5;
  lay(cw, cw, y, y + ch, o.seed + 3);
  // A false door on each face: a proud panel between jambs, under a lintel.
  const dw = Math.min(1.25, cw * 0.7);
  const dh = Math.min(ch - 0.5, 2.5);
  for (let side = 0; side < 4; side++) {
    const [sx, sz] = [[0, 1], [1, 0], [0, -1], [-1, 0]][side];
    const face = (u0: number, u1: number, y0: number, y1: number, d0: number, d1: number, n: number) => {
      const c = f.palette[Math.floor(hash3(n, 3, 7, o.seed) * f.palette.length)];
      if (sx) set.add(o.x + sx * d0, y0, o.z + u0, o.x + sx * d1, y1, o.z + u1, c, style);
      else set.add(o.x + u0, y0, o.z + sz * d0, o.x + u1, y1, o.z + sz * d1, c, style);
    };
    face(-dw / 2, dw / 2, y, y + dh, cw, cw + 0.125, 20 + side);
    face(-dw / 2 - 0.25, -dw / 2, y, y + dh, cw, cw + 0.25, 30 + side);
    face(dw / 2, dw / 2 + 0.25, y, y + dh, cw, cw + 0.25, 40 + side);
    face(-dw / 2 - 0.375, dw / 2 + 0.375, y + dh, y + dh + 0.375, cw, cw + 0.25, 50 + side);
  }
  y += ch;
  // Tiers in a lotus-bud profile — swelling a little over the cella, then
  // rounding in to the tip: each a body with a projecting cornice, antefixes on
  // its corners and mid-sides.
  const tiers = Math.max(3, Math.round((top - y - 1.5) / 1.25));
  const th = (top - y - 1.5) / tiers;
  for (let t = 0; t < tiers; t++) {
    const u = (t + 0.5) / tiers;
    const bw = Math.max(0.375, snap(cw * (0.9 + 0.12 * Math.sin(Math.PI * u)) * Math.sqrt(Math.max(0.04, 1 - u ** 2.4)), 0.125));
    const body = Math.max(0.25, Math.round((th - 0.25) / 0.125) * 0.125);
    lay(bw, bw, y, y + body, o.seed + 10 + t, body > 0.75 ? body / 2 : body);
    lay(bw + 0.25, bw + 0.25, y + body, y + body + 0.25, o.seed + 30 + t, 0.25);
    const a = bw > 1 ? 0.25 : 0.1875;
    const ah = bw > 1 ? 0.5 : 0.375;
    for (const [ux, uz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const cx = ux * (bw + 0.25 - a);
      const cz = uz * (bw + 0.25 - a);
      block(cx - a, y + body + 0.25, cz - a, cx + a, y + body + 0.25 + ah, cz + a, 60 + t * 8 + ux * 3 + uz);
    }
    y += body + 0.25;
  }
  // Lotus-bud finial: two shrinking courses and a tip.
  const fw = Math.max(0.375, snap(cw * 0.26, 0.125));
  lay(fw, fw, y, y + 0.5, o.seed + 50);
  lay(fw - 0.125, fw - 0.125, y + 0.5, y + 0.875, o.seed + 51, 0.375);
  block(-0.25, y + 0.875, -0.25, 0.25, y + 1.25, 0.25, 90);
  block(-0.125, y + 1.25, -0.125, 0.125, y + 1.5, 0.125, 91);
  return [o.x - b / 2, o.y, o.z - b / 2, o.x + b / 2, top, o.z + b / 2];
}
