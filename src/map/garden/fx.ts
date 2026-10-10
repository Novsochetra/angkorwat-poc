import type { GardenAction, PoleAction } from './actions';
import type { PlantKindId } from './kinds';

/**
 * What the garden's work does to the world as it happens, beat by beat (garden/actions.ts): earth flying from the
 * hoe and the hole deepening, the seed in the hole, the heap patted over it into the bed, water splashing and the
 * earth darkening, roots and earth sprayed as a dead plant is pulled, leaves shaken down as fruit is picked, dust where
 * a durian lands, drops from a bucket… The work (roam/_gardenWork.ts, roam/_carryPole*.ts, roam/_bodhiPlant.ts) calls
 * `GARDEN_FX.beat` at each beat; the view's effects (garden/_fx*.ts) fill this hook object when the view is made.
 * Until then (and in a build with no view) nothing happens.
 *
 * A plain hook object (no three.js here), as map/greet.ts: no add-on imports another's module.
 */
export interface FxBeat {
  /** The action and the beat's name (`ACTIONS[action].beats[i].name`, `POLE_ACTIONS`), and which time it is in the action (0: the first `chop`, 1: the second…). */
  readonly action: GardenAction | PoleAction;
  readonly beat: string;
  readonly n: number;
  /** Where (m, the map): the spot of the work (the hole, the plant's foot, the water, the fruit), its ground height, the way he faces (radians, as `body.yaw`). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  /** The plant's kind (its leaves' colour, its fruit's size), or null. */
  readonly kind: PlantKindId | null;
  /** The plant's id (planting: the new plant's, from the `set` beat on), or -1. */
  readonly plant: number;
}

export const GARDEN_FX = {
  /** A beat of the work happened. */
  beat: (_b: FxBeat): void => undefined,
  /** The work stopped before its end (the stick, back to the map): take away what it left half done (the hole, the heap). */
  cancel: (_action: GardenAction | PoleAction): void => undefined,
};
