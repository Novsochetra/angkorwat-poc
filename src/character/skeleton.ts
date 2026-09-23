/**
 * Joint layout of the explorer in body units (BU), measured off the reference
 * turnaround with a 32-block grid overlay. Origin = ground between the feet,
 * +Y up, +Z = facing direction, +X = the character's LEFT.
 *
 *  32.4 ┐ hair top
 *  30.4 │ skull top         head: 11 × 10 × 9 blocks, eyes on rows 22.4–24.4
 *  20.4 ┘ chin
 *  19.0   shoulders / scarf collar 18.2–20.4
 *  12.7   belt top (belt 11.6–12.7)
 *   9.8   crotch / shorts legs, hem 6.8–7.8
 *   5.6   knee skin → cream sock 4.6–5.6
 *   4.6   boot cuff top, sole 0–0.6
 */
export type JointName =
  | 'root'
  | 'body'
  | 'hips'
  | 'chest'
  | 'neck'
  | 'head'
  | 'shoulderL'
  | 'elbowL'
  | 'wristL'
  | 'shoulderR'
  | 'elbowR'
  | 'wristR'
  | 'hipL'
  | 'kneeL'
  | 'ankleL'
  | 'hipR'
  | 'kneeR'
  | 'ankleR'
  | 'scarf1'
  | 'scarf2'
  | 'scarf3'
  | 'camera'
  | 'backpack'
  | 'propL'
  | 'propR';

export type Vec3 = readonly [number, number, number];

export interface JointDef {
  parent: JointName | null;
  /** Rest position in character space (BU). */
  pivot: Vec3;
}

const ARM_X = 5.65;
const LEG_X = 2.4;
const LEG_Z = -0.5;

export const JOINTS: Record<JointName, JointDef> = {
  root: { parent: null, pivot: [0, 0, 0] },
  body: { parent: 'root', pivot: [0, 0, 0] },
  hips: { parent: 'body', pivot: [0, 10.6, -0.3] },
  chest: { parent: 'hips', pivot: [0, 12.2, -0.1] },
  neck: { parent: 'chest', pivot: [0, 19.0, 0.2] },
  head: { parent: 'neck', pivot: [0, 20.2, 0.3] },
  shoulderL: { parent: 'chest', pivot: [5.0, 18.1, 0] },
  elbowL: { parent: 'shoulderL', pivot: [ARM_X, 13.9, 0] },
  wristL: { parent: 'elbowL', pivot: [ARM_X, 12.3, 0] },
  shoulderR: { parent: 'chest', pivot: [-5.0, 18.1, 0] },
  elbowR: { parent: 'shoulderR', pivot: [-ARM_X, 13.9, 0] },
  wristR: { parent: 'elbowR', pivot: [-ARM_X, 12.3, 0] },
  hipL: { parent: 'hips', pivot: [LEG_X, 9.9, LEG_Z] },
  kneeL: { parent: 'hipL', pivot: [LEG_X, 7.1, LEG_Z] },
  ankleL: { parent: 'kneeL', pivot: [LEG_X, 2.0, -0.9] },
  hipR: { parent: 'hips', pivot: [-LEG_X, 9.9, LEG_Z] },
  kneeR: { parent: 'hipR', pivot: [-LEG_X, 7.1, LEG_Z] },
  ankleR: { parent: 'kneeR', pivot: [-LEG_X, 2.0, -0.9] },
  // Krama tail hangs from the front-left of the collar in three swinging segments.
  scarf1: { parent: 'chest', pivot: [2.45, 18.3, 3.35] },
  scarf2: { parent: 'scarf1', pivot: [2.45, 15.7, 3.45] },
  scarf3: { parent: 'scarf2', pivot: [2.45, 13.3, 3.45] },
  // Camera swings from its neck strap.
  camera: { parent: 'chest', pivot: [0, 19.3, 2.3] },
  backpack: { parent: 'chest', pivot: [0, 17.4, -2.9] },
  // Prop sockets sit in the middle of each fist; the grip axis is local Z.
  propL: { parent: 'wristL', pivot: [ARM_X, 10.6, 0] },
  propR: { parent: 'wristR', pivot: [-ARM_X, 10.6, 0] },
};

export const JOINT_NAMES = Object.keys(JOINTS) as JointName[];

/** Sole contact points in ankle-local space (BU), used by the foot-planting IK. */
export const SOLE_POINTS: readonly Vec3[] = [
  [0, -2.0, -3.0],
  [0, -2.0, 4.9],
  [1.8, -2.0, 0.8],
  [-1.8, -2.0, 0.8],
];

export const ARM_CENTER_X = ARM_X;
export const LEG_CENTER_X = LEG_X;
export const LEG_CENTER_Z = LEG_Z;
