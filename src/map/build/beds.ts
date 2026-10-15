import { BUILT, PIECES, pieceToWorld, type Built, type PieceId } from './pieces';
import { distTo } from './state';
import { underRoof } from './shelterRules';

/**
 * Beds he built under a roof of his (AWP-25): any standing piece one lies on
 * (`isBedPiece`: the bamboo bed; AWP-23's sleeping mat with `isBed` there, one
 * line) whose middle is under a roof he built (build/shelterRules.ts
 * `underRoof`) is a bed to sleep in, as his mat at home: roam/_home.ts offers
 * "E  Sleep" by it and sleeps him there (roam/_homeSleep.ts, the same card,
 * the same night). In the open it stays a bed to lie on (J / L: _rest.ts).
 * No three.js.
 */

/** Where he sleeps on a bed: his feet's spot on it (lying back his head goes the other way), its top, the way he faces; where he gets up to and faces then. */
export interface BedPlace {
  readonly uid: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly out: { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number };
}

/**
 * Sleeping on one (the home add-on sets it: roam/_home.ts opens its card, "until when", then sleeps him there;
 * roam/_build.ts calls it on E by a bed under a roof, a short press: held, E takes the bed down as any piece).
 */
export const BED_SLEEP = { start: null as ((bed: BedPlace) => void) | null };

/** He is offered the bed from this near its footprint (m), his feet within this of its ground. */
const REACH = 1.3;
const UP = 0.9;
/** On it: his feet toward its +x end (local, m), as the bamboo bed's rest (roam/_buildUses.ts `BED_FEET`). */
const FEET = 0.85;
/** Up again he stands this far out before its front (m). */
const OUT = 0.75;

const _p: [number, number] = [0, 0];

/**
 * A piece he lies on (THE one place: with AWP-23 merged, `isBed(id)` from build/furniture.ts — the bamboo bed and the
 * sleeping mat — in this one line).
 */
export const isBedPiece = (id: PieceId): boolean => !!PIECES[id].seat?.lie;

/** A bed's place to sleep (null: not one, or not under a roof of his). */
export function bedPlace(b: Built): BedPlace | null {
  const p = PIECES[b.id];
  const seat = p.seat;
  if (!seat || !isBedPiece(b.id) || b.done < 1) return null;
  if (!underRoof(b.x, b.z, b.y + seat.y + 0.3)) return null;
  pieceToWorld(b, FEET, seat.z, _p);
  const x = _p[0];
  const z = _p[1];
  pieceToWorld(b, 0, p.d / 2 + OUT, _p);
  return { uid: b.uid, x, y: b.y + seat.y, z, yaw: b.yaw + Math.PI / 2, out: { x: _p[0], y: b.y, z: _p[1], yaw: b.yaw } };
}

/** The bed under a roof of his he is by (feet at x, y, z), or null. */
export function bedNear(x: number, y: number, z: number): BedPlace | null {
  let best: Built | null = null;
  let bd = REACH;
  for (const b of BUILT.list) {
    if (!isBedPiece(b.id) || b.done < 1 || Math.abs(y - b.y) > UP) continue;
    const d = distTo(b, x, z);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best ? bedPlace(best) : null;
}
