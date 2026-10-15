import { BLOCKS, cellOf } from '../blocks/store';
import { rectD, rectW } from './footPlan';
import { FOOTS, type FootRec } from './footState';
import { BUILT, PIECES, pieceToWorld, type Built } from './pieces';
import { toLocal } from './state';

/**
 * Things that work where he builds them (AWP-25): the one shared check of what
 * is "under a roof" and what is "fenced" on his land, no three.js. A bed under
 * any roof he built is a bed to sleep in (roam/_home.ts, build/beds.ts); his
 * cows go into any fenced and roofed area he built as into the pen piece
 * (roam/_cattleHerd.ts, `roofedPens`).
 *
 * - **`underRoof(x, z, y)`**: the point (x, z) at the height `y` (m: the feet,
 *   or a bed's top) has a roof of his over it: a stilt house or a shed he
 *   built whole (build/footState.ts: inside its footprint and under its plan's
 *   top: under a house's floor or in its room, under a shed's roof), the
 *   thatched shelter piece (inside its roof, under its ridge), or any solid
 *   block of his block layer within `BLOCK_ROOF` m over it (a roof of his own
 *   blocks, a floor over him, AWP-23's furniture under a roof the same).
 * - **`fenced(x, z)`**: inside a fence line of his that closes round (a fence
 *   footprint built whole, not a straight run: its gate is its way in), or
 *   inside the cattle pen piece's rails. The yard's fence pieces (runs of 3 m)
 *   are not counted: they need not close.
 * - **`roofedPens()`**: the fenced and roofed areas his cows may use as the pen
 *   piece (`PenFrame`: a frame where the pen piece would stand, its gate on the
 *   fence's gate): a fence footprint closing round at least `PEN_ROOM` (the pen
 *   piece's rails and a margin), its gate on a side, with a roof over the
 *   frame's middle (a shed or a house built inside the ring, a shelter piece,
 *   blocks). The herd puts its cows at the pen piece's places in that frame.
 *   Made again only when something he built changes.
 */

/** A roof of his blocks counts this far over the point at most (m). */
export const BLOCK_ROOF = 8;
/** A fence ring is a pen when it holds this much at least (m: the pen piece's 7 × 5.6 m and half a metre round). */
export const PEN_ROOM = { w: 7.5, d: 6.1 } as const;

/** Is (x, z) inside a footprint rectangle (cells, both ends in)? */
const inRect = (r: FootRec['rect'], x: number, z: number): boolean => x >= r.i0 * 0.5 && x < (r.i1 + 1) * 0.5 && z >= r.k0 * 0.5 && z < (r.k1 + 1) * 0.5;

const _l: [number, number] = [0, 0];

/** The point (x, z) at the height `y` has a roof of his over it (see above). */
export function underRoof(x: number, z: number, y: number): boolean {
  for (const r of FOOTS.list) {
    if (r.kind === 'fence' || r.done < 1 || !inRect(r.rect, x, z)) continue;
    if (y < FOOTS.plan(r).top - 0.5) return true;
  }
  for (const b of BUILT.list) {
    if (b.id !== 'shelter' || b.done < 1) continue;
    const p = PIECES.shelter;
    toLocal(b, x, z, _l);
    if (Math.abs(_l[0]) < p.w / 2 && Math.abs(_l[1]) < p.d / 2 && y < b.y + p.h - 0.5) return true;
  }
  if (!BLOCKS.count) return false;
  const i = cellOf(x);
  const k = cellOf(z);
  const j0 = cellOf(y + 0.05);
  for (let j = j0; j <= j0 + Math.ceil(BLOCK_ROOF / 0.5); j++) if (BLOCKS.solid(i, j, k)) return true;
  return false;
}

/** Is (x, z) inside a fence of his that closes round, or the pen piece's rails (see above)? */
export function fenced(x: number, z: number): boolean {
  for (const r of FOOTS.list) {
    if (r.kind !== 'fence' || r.done < 1 || rectW(r.rect) === 1 || rectD(r.rect) === 1) continue;
    if (inRect(r.rect, x, z)) return true;
  }
  for (const b of BUILT.list) {
    if (b.id !== 'pen' || b.done < 1) continue;
    const pen = PIECES.pen.pen!;
    toLocal(b, x, z, _l);
    if (Math.abs(_l[0] - pen.x) < pen.w / 2 && Math.abs(_l[1] - pen.z) < pen.d / 2) return true;
  }
  return false;
}

/**
 * A fenced and roofed area as the herd's pen: where the pen piece would stand (its frame: middle `x`, `z` on the
 * ground at `y`, turned `yaw` so its gate, local +z, is on the fence's gate), as a standing piece (`id` 'pen', `done`
 * 1: the herd reads it as one), its `uid` `foot-<the fence's uid>`.
 */
export type PenFrame = Built;

/** The pens as made last: the build's and the block layer's versions then (a footprint built whole writes its blocks). */
const pensAt = { built: -1, blocks: -1 };
let pens: PenFrame[] = [];

/** The fenced and roofed areas his cows may use as a pen (see above), made again when what he built changes. */
export function roofedPens(heightAt: (x: number, z: number) => number): readonly PenFrame[] {
  if (pensAt.built === BUILT.version && pensAt.blocks === BLOCKS.version) return pens;
  pensAt.built = BUILT.version;
  pensAt.blocks = BLOCKS.version;
  pens = [];
  for (const r of FOOTS.list) {
    if (r.kind !== 'fence' || r.done < 1) continue;
    const w = rectW(r.rect) * 0.5;
    const d = rectD(r.rect) * 0.5;
    if (w === 0.5 || d === 0.5) continue;
    // (its gate's side: the pen's front, local +z; the pen piece's rails just inside the ring)
    const along = r.door % 2 ? d : w;
    const across = r.door % 2 ? w : d;
    if (along < PEN_ROOM.w || across < PEN_ROOM.d) continue;
    const cx = (r.rect.i0 + r.rect.i1 + 1) * 0.25;
    const cz = (r.rect.k0 + r.rect.k1 + 1) * 0.25;
    // (out through the gate: 0 −z, 1 +x, 2 +z, 3 −x; the frame's middle the pen's half depth in from the gate's side)
    const ox = r.door === 1 ? 1 : r.door === 3 ? -1 : 0;
    const oz = r.door === 2 ? 1 : r.door === 0 ? -1 : 0;
    const back = across / 2 - PIECES.pen.d / 2 - 0.25;
    const x = cx + ox * back;
    const z = cz + oz * back;
    const frame: PenFrame = { uid: `foot-${r.uid}`, id: 'pen', x, y: heightAt(x, z), z, yaw: Math.atan2(ox, oz), done: 1, seed: 0 };
    // (roofed: a roof of his over the pen's middle, at a cow's back)
    pieceToWorld(frame, 0, PIECES.pen.pen!.z, _l);
    if (!underRoof(_l[0], _l[1], frame.y + 1)) continue;
    pens.push(frame);
  }
  return pens;
}
