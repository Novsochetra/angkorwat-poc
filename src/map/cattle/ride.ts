/**
 * The white Khmer cattle he may ride (គោ: the ox of the villages, people/_ox.ts
 * `OX`), shared between whoever keeps them and the ride (roam/_cowRide.ts). No
 * three.js here, nothing per frame allocated.
 *
 * - **Keepers** add their cows with `addRideCow` and keep each one's fields up
 *   to date while it is theirs to move: the sugar-palm village's herd
 *   (people/_sceneEastVillage.ts `Herd`: the herd boy's three) and his own
 *   (roam/_cattle*.ts, map/cattle/). A keeper draws its cow from these fields
 *   every frame, ridden or not.
 * - **The ride** (roam/_cowRide.ts) offers E by a cow that `canRide`, and while
 *   it holds `COW_RIDE.ridden` it moves that cow itself: it writes `x y z yaw`,
 *   the tilt (`pitch`, `roll`), the step (`gait`: the walk's phase in steps,
 *   `speed` m/s) and the head (`head`), and the keeper only draws it (its own
 *   step skips that cow: `ridden`). When the ride ends it sets `ridden` false
 *   and `COW_RIDE.ridden` null, and the keeper takes the cow on from where it
 *   was left (or walks it home).
 */

export interface RideCow {
  /** Unique: `ev-0‥2` the village herd's, `own-<id>` his own. */
  readonly id: string;
  /** Whose: the village's (the herd boy lets him) or his own. */
  readonly owner: 'village' | 'his';
  /** Where its feet are (world m), its heading (rad, as `atan2(dx, dz)`: 0 faces +z), its size (× the `OX` model). */
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  /** He may get on now: grown (no calf), standing still, grazing or lying, not walking a way, not in its pen's lane. */
  canRide: boolean;
  /** It lies down (getting on, it gets up first). */
  lying: boolean;
  /** The ride has it: the keeper does not move it, only draws it from these fields. */
  ridden: boolean;
  /** Ridden: its tilt on the ground (rad: pitch + its front down, roll + its left side up), its step's phase (in steps) and speed (m/s), its head (0 level, 1 down grazing, −1 up lowing). */
  pitch: number;
  roll: number;
  gait: number;
  speed: number;
  head: number;
}

export const COW_RIDE = {
  /** Every cow that may be ridden, the keepers' (in the order they were added). */
  cows: [] as RideCow[],
  /** The one he rides, getting on or off, or null. */
  ridden: null as RideCow | null,
  /** He walks (or rides) calmly: cattle let him come up to them. */
  calm: false,
  /** Bumped when the list changes. */
  version: 0,
};

/** A new cow with everything at rest (a keeper fills where it is). */
export function rideCow(id: string, owner: RideCow['owner']): RideCow {
  return { id, owner, x: 0, y: 0, z: 0, yaw: 0, scale: 1, canRide: false, lying: false, ridden: false, pitch: 0, roll: 0, gait: 0, speed: 0, head: 0 };
}

/** A keeper's cow may be ridden (one with the same id replaces the old one). */
export function addRideCow(c: RideCow): void {
  const i = COW_RIDE.cows.findIndex((o) => o.id === c.id);
  if (i >= 0) COW_RIDE.cows[i] = c;
  else COW_RIDE.cows.push(c);
  COW_RIDE.version++;
}

/** The cow is gone (sold, its part gone): off the list; if he rides it the ride lets go first (it reads `version`). */
export function removeRideCow(id: string): void {
  const i = COW_RIDE.cows.findIndex((o) => o.id === id);
  if (i < 0) return;
  COW_RIDE.cows.splice(i, 1);
  COW_RIDE.version++;
}
