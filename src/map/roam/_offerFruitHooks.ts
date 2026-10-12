/**
 * Offering fruit to a monk he meets on the way (roam/_offerFruitMonk.ts): the
 * link between roaming (the explorer who offers) and the people part (the monk
 * who takes it, people/_offerBack.ts). A plain module object, as greet.ts and
 * roam/_dakBatHooks.ts: no part imports another's three.js objects. No three.js,
 * nothing allocated per frame.
 *
 * - **His asking** (`OFFER.ask`, roaming writes): `ask` (n counts up: a new
 *   one), where he stands and faces, the fruit's kind; then roaming leads the
 *   steps with its own clock (`t` s into `state`): `there` he holds the fruit
 *   out, `take` the monk takes it in both hands, `bless` the monk's blessing
 *   while he sampeahs, `done` (the monk walks on), `none`.
 * - **The monk's answer** (the people part writes): the monk it found (`i`, the
 *   crowd's index; −1: nobody), where he stands (`mx`, `mz`, his feet `my`, the
 *   way he faces `myaw`: to the explorer), where his hands meet holding the fruit
 *   (`hx`, `hy`, `hz`, his `give` pose at full weight), and `again`: he has had
 *   fruit from him today already (a smile, no gift taken). `answered` is the
 *   ask's `n` it answers.
 *
 * Distances in metres (the map's: people and the explorer are 1.4 × true size).
 */

export type OfferState = 'none' | 'ask' | 'there' | 'take' | 'bless' | 'again' | 'done';

export interface OfferAsk {
  state: OfferState;
  n: number;
  /** Seconds into `state` (roaming's clock). */
  t: number;
  /** His feet (m), the way he faces. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** The fruit (garden/kinds.ts id). */
  kind: string;
  /** The people part's answer: the ask it answered (its `n`; 0: none yet), the monk (crowd index, −1 none). */
  answered: number;
  i: number;
  again: boolean;
  mx: number;
  my: number;
  mz: number;
  myaw: number;
  hx: number;
  hy: number;
  hz: number;
}

/** How near in front of him a monk may stand to be offered to (m), within this angle either side (radians). */
export const OFFER_NEAR = 3.2;
export const OFFER_CONE = 0.75;
/** He stands this far before the monk to give (m, feet to feet). */
export const OFFER_STAND = 1.4;

export const OFFER = {
  ask: { state: 'none', n: 0, t: 0, x: 0, y: 0, z: 0, yaw: 0, kind: '', answered: 0, i: -1, again: false, mx: 0, my: 0, mz: 0, myaw: 0, hx: 0, hy: 0, hz: 0 } as OfferAsk,
  /**
   * The monks who had fruit from him (crowd index → the game day, `TIME.days()` floored): one gift a monk a day. The
   * people part reads it (`again`), roaming writes it when a gift is taken.
   */
  given: new Map<number, number>(),
  /**
   * The people part's finder (lent when it is built; −1 without people): the monk (crowd index) in front of one
   * standing at (x, y, z) facing `yaw` who would take a gift now (standing or walking, not seated, riding, at a
   * blessing or on his alms round). Roaming's prompt shows only before one.
   */
  find: (_x: number, _y: number, _z: number, _yaw: number): number => -1,
};
