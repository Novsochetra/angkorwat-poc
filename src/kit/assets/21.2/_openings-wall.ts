import { coursesOf, DryMasonry, FACE, spansOf, type Box6 } from '../../lib/gallery';
import { carve, GLYPH, type MossTop, type StoneLookFn } from '../../lib/openings';
import type { PieceBuilder } from '../../PieceBuilder';
import { TEXEL } from '../../shapes';

/**
 * The short piece of gallery wall the §21.2 window and door cards stand in —
 * as the sheet frames them: dry-laid 0.5 m courses running round the
 * opening's hole, an optional base moulding along both faces, and a two-band
 * cornice stepping out over the top. Straight along X from −length/2 to
 * +length/2, faces at z = ±thickness/2, on y = 0 (the gallery floor).
 */
export interface ShowWallOptions {
  length: number;
  thickness: number;
  /** Top of the wall body; the cornice (0.5 m) sits on it. */
  height: number;
  /** The opening's hole (windowCut / doorCut). */
  cut: Box6;
  look: StoneLookFn;
  mason: DryMasonry;
  /** Base moulding along both faces: its height, the x spans it stops for (pilaster bases) and those where something stands on it (no moss). */
  plinth?: { h: number; skip: [number, number][]; covered?: [number, number][] };
  /** How far the cornice's two bands stand out from the faces (default 0.25 and 0.3125 m). */
  cornice?: [number, number];
  /** Key spirals on the cornice's lower band, over the piers (x positions), as the sheet carves its corner blocks. */
  keys?: number[];
  seed: number;
}

/** Lay the wall into `o.mason` and add its colliders; returns the tops moss settles on. */
export function showWall(p: PieceBuilder, o: ShowWallOptions): MossTop[] {
  const { length: L, thickness: t, height: H, cut, look, mason: m } = o;
  const [x0, x1] = [-L / 2, L / 2];
  const [zb, zf] = [-t / 2, t / 2];
  const tops: MossTop[] = [];
  // Courses: breaks at the hole's foot and head, at most 0.5 m between.
  const levels = [...new Set([0, cut[1], cut[4], H].filter((y) => y >= 0 && y <= H))].sort((a, b) => a - b);
  let row = 0;
  for (let l = 0; l + 1 < levels.length; l++) {
    let y = levels[l];
    for (const h of coursesOf(levels[l + 1] - levels[l])) {
      const [ya, yb] = [y, y + h];
      y = yb;
      const holes: [number, number][] = cut[1] < yb - 1e-6 && cut[4] > ya + 1e-6 ? [[cut[0], cut[3]]] : [];
      const overHole = Math.abs(ya - cut[4]) < 1e-6;
      for (const [a, b] of spansOf(x0, x1, holes)) {
        // (ends against the frame are covered; the top one carries the cornice)
        const closed = FACE.ny | FACE.py | (Math.abs(b - cut[0]) < 1e-6 ? FACE.px : 0) | (Math.abs(a - cut[3]) < 1e-6 ? FACE.nx : 0);
        m.course([a, ya, zb, b, yb, zf], { length: [0.5, 1.125], row, closed, openBelow: overHole ? [[cut[0], cut[3]]] : [], look });
      }
      row++;
    }
  }
  // Base moulding on both faces, stopping at the skips (and at a hole down to the floor).
  if (o.plinth) {
    const skip = [...o.plinth.skip, ...(cut[1] <= 1e-6 ? [[cut[0], cut[3]] as [number, number]] : [])];
    const ph = o.plinth.h;
    for (const [a, b] of spansOf(x0, x1, skip)) {
      m.course([a, 0, zf, b, ph, zf + 0.125], { length: [0.5, 1], closed: FACE.ny | FACE.nz, look });
      m.course([a, 0, zb - 0.125, b, ph, zb], { length: [0.5, 1], closed: FACE.ny | FACE.pz, face: FACE.nz, row: 1, look });
    }
    for (const [a, b] of spansOf(x0, x1, [...skip, ...(o.plinth.covered ?? [])])) {
      tops.push({ x0: a, z0: zf, x1: b, z1: zf + 0.125, y: ph, edges: FACE.pz });
      tops.push({ x0: a, z0: zb - 0.125, x1: b, z1: zb, y: ph, edges: FACE.nz });
    }
  }
  // Cornice: two bands, each standing further out, the upper one past the ends too;
  // each band laid as a front and a back course of short stones, so its top reads as blocks.
  const [c1, c2] = o.cornice ?? [0.25, 0.3125];
  const band = (x0b: number, x1b: number, ya: number, yb: number, out: number, row: number, closed: number) => {
    m.course([x0b, ya, 0, x1b, yb, zf + out], { length: [0.5, 0.875], row, closed: closed | FACE.nz, look });
    m.course([x0b, ya, zb - out, x1b, yb, 0], { length: [0.5, 0.875], row: row + 1, closed: closed | FACE.pz, face: FACE.nz, look });
  };
  band(x0, x1, H, H + 0.25, c1, 0, FACE.py);
  band(x0 - 0.0625, x1 + 0.0625, H + 0.25, H + 0.5, c2, 1, 0);
  for (const kx of o.keys ?? [])
    for (const [face, plane] of [
      [FACE.pz, zf + c1],
      [FACE.nz, zb - c1],
    ])
      carve(p.voxels, face, plane, kx, H + 0.125 + (GLYPH.small.length * TEXEL) / 4, GLYPH.small, o.seed + Math.round(kx * 8));
  tops.push({ x0: x0 - 0.0625, z0: zb - c2, x1: x1 + 0.0625, z1: zf + c2, y: H + 0.5, inner: [x0 + 0.25, zb + 0.125, x1 - 0.25, zf - 0.125], edges: 63 });
  // Colliders: the wall round the hole, the cornice.
  p.collider(x0, 0, zb, cut[0], H, zf);
  p.collider(cut[3], 0, zb, x1, H, zf);
  p.collider(cut[0], cut[4], zb, cut[3], H, zf);
  if (cut[1] > 1e-6) p.collider(cut[0], 0, zb, cut[3], cut[1], zf);
  p.collider(x0 - 0.0625, H, zb - c2, x1 + 0.0625, H + 0.5, zf + c2);
  return tops;
}
