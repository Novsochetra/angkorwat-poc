import { Vector3 } from 'three';
import type { GardenAction } from '../map/garden/actions';
import type { Pose } from './pose';

/**
 * Working in his home garden (the map's roam/_gardenWork.ts): a posture for
 * `Animator.posture` with `postureFeet = false`, one per action of
 * map/garden/actions.ts (`ACTIONS`: its beats are the poses' moments too).
 *
 * STUB (the core's): stands still. The poses' owner fills it; the API below stays.
 *
 * Units: body units (BU) in the explorer's space (+z forward, +x his left, y up
 * from his soles), as character/farmWork.ts.
 */
export interface GardenBody {
  action: GardenAction;
  /** Seconds into the action (0‥`ACTIONS[action].len`). */
  t: number;
  /**
   * Where the work is (BU, his space): the plant's foot (plant, water, clear, pickLow, pickGround), the fruit
   * (pickReach, pickCut, pickPole: its height too), the water's surface (fill).
   */
  readonly spot: Vector3;
  /** Seconds since the posture began (breathing). */
  life: number;
}

export function gardenBody(action: GardenAction): GardenBody {
  return { action, t: 0, spot: new Vector3(0, 0, 6), life: 0 };
}

/** His pose for the body's action at its time. */
export function gardenPose(w: GardenBody): Pose {
  void w;
  return {};
}
