import type { Object3D } from 'three';
import { BUILT, PIECES, pieceToWorld, type Built } from '../build/pieces';
import { BUILD, distTo } from '../build/state';
import type { HeightField } from '../heightfield';
import { addHammock, HAMMOCK_IN_USE, removeHammock } from './_hammockSpots';
import { REST_SEATS, type RestKind, type RestSeat } from './_rest';
import { WORSHIP } from './_worship';

/**
 * What the pieces he built are for (roam/_build.ts keeps these up to date as
 * pieces come to stand or are taken down; only a piece that stands is used):
 *
 * - **Seats** (the bamboo bed, the shelter's bench: `PIECES[id].seat`): J / L
 *   (or E "Sit") by one put him on it (roam/_rest.ts `REST_SEATS`): on the bed
 *   he sits and lies along it (his feet toward one end, his head to the other),
 *   on the bench he sits facing out of the shelter (no lying on it).
 * - **Hammocks** (`ties`): each one is the hammock add-on's (_hammockSpots.ts
 *   `addHammock({ id: 'build-<uid>', a, b, root })`, its cloth the view's `petal`
 *   blocks between the ties), registered again whenever the view makes its batch
 *   again (its blocks move: the add-on reads them anew).
 * - **The spirit house** (`kneel`): a prayer spot of its own in `WORSHIP`
 *   (`build-<uid>`): E "Pray" before it (_pray.ts), the golden lotus where he kneels.
 */

/** He sits from this near a seat piece (m from its footprint), feet within this of the ground or its top. */
const SEAT_REACH = 1.1;
const SEAT_UP = 0.8;
/** On the bed: where his feet go (local: toward its +x end) to sit or lie along it, his head to −x. */
const BED_FEET = 0.85;
/** On the bench: his feet this far before the seat's middle (on the bench, the hips a little behind them). */
const BENCH_FEET = 0.22;

let field: HeightField | null = null;
let root: Object3D | null = null;
const hammockIds = new Set<string>();
const prayIds = new Set<string>();
const _p: [number, number] = [0, 0];

/** The seat piece he is at (feet at x, y, z), or null. */
function seatAt(x: number, y: number, z: number): Built | null {
  let best: Built | null = null;
  let bd = SEAT_REACH;
  for (const b of BUILT.list) {
    const seat = PIECES[b.id].seat;
    if (!seat || b.done < 1) continue;
    if (y > b.y + seat.y + SEAT_UP || y < b.y - SEAT_UP) continue;
    const d = distTo(b, x, z);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

/** Where he sits or lies on a seat piece (into `out`), its feet and his way. */
function seatSpot(b: Built, kind: RestKind, out: RestSeat): boolean {
  const seat = PIECES[b.id].seat!;
  if (kind === 'lie' && !seat.lie) return false;
  if (seat.lie) {
    // (a bed: along it, his feet toward its +x end, facing it; lying back his head goes to the −x end)
    pieceToWorld(b, BED_FEET, seat.z, _p);
    out.yaw = b.yaw + Math.PI / 2;
  } else {
    pieceToWorld(b, seat.x, seat.z + BENCH_FEET, _p);
    out.yaw = b.yaw + seat.yaw;
  }
  out.x = _p[0];
  out.z = _p[1];
  out.y = b.y + seat.y;
  return true;
}

export const BuildUses = {
  init(f: HeightField, standing: Object3D): void {
    field = f;
    root = standing;
    REST_SEATS.find = (kind, x, y, z, out) => {
      const b = seatAt(x, y, z);
      return !!b && seatSpot(b, kind, out);
    };
    REST_SEATS.noLie = (x, y, z) => {
      const b = seatAt(x, y, z);
      return !!b && !PIECES[b.id].seat!.lie && y > b.y + 0.3;
    };
  },

  /** A seat piece he could sit on from here (E "Sit"), or null. */
  seatNear(x: number, y: number, z: number): Built | null {
    return seatAt(x, y, z);
  },

  /** The hammocks and the prayer spots as the pieces are now (`again`: every hammock registered anew: the view's batch was made again). */
  sync(again = false): void {
    if (!field || !root) return;
    const seenH = new Set<string>();
    const seenP = new Set<string>();
    for (const b of BUILD.list) {
      const p = PIECES[b.id];
      if (b.done < 1) continue;
      if (p.ties) {
        const id = `build-${b.uid}`;
        seenH.add(id);
        if (again || !hammockIds.has(id)) {
          // (not while he lies in it: its blocks are his then)
          if (HAMMOCK_IN_USE.id === id && hammockIds.has(id)) continue;
          const [ta, tb] = p.ties;
          pieceToWorld(b, ta[0], ta[2], _p);
          const a: [number, number, number] = [_p[0], b.y + ta[1], _p[1]];
          pieceToWorld(b, tb[0], tb[2], _p);
          const c: [number, number, number] = [_p[0], b.y + tb[1], _p[1]];
          addHammock({ id, a, b: c, root });
          hammockIds.add(id);
        }
      }
      if (p.kneel) {
        const id = `build-${b.uid}`;
        seenP.add(id);
        if (!prayIds.has(id)) {
          pieceToWorld(b, p.kneel.x, p.kneel.z, _p);
          WORSHIP.push({ id, place: null, x: _p[0], y: field.heightAt(_p[0], _p[1]), z: _p[1], fx: b.x, fz: b.z });
          prayIds.add(id);
        }
      }
    }
    for (const id of [...hammockIds])
      if (!seenH.has(id)) {
        removeHammock(id);
        hammockIds.delete(id);
      }
    for (const id of [...prayIds])
      if (!seenP.has(id)) {
        const i = WORSHIP.findIndex((w) => w.id === id);
        if (i >= 0) WORSHIP.splice(i, 1);
        prayIds.delete(id);
      }
  },

  /** For checks: the hammocks and prayer spots registered. */
  state(): { hammocks: string[]; prayers: string[] } {
    return { hammocks: [...hammockIds], prayers: [...prayIds] };
  },
};
