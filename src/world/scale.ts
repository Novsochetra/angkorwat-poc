/**
 * World scale contract shared by the character and the Angkor Wat map.
 *
 *   1 world unit = 1 metre.
 *
 * The Angkor Wat reference sheets are drawn at real size (complex ≈ 1.5 km × 1.3 km,
 * central tower ≈ 65 m) and mark the human scale figure as ≈ 1.7 m, so the explorer
 * is built to that height. The character sheet's own "16 voxels / 6 voxels" labels
 * do not match its renders (the render is ≈ 32 blocks tall), so the model is
 * authored in *body units* (1 BU = one hair/face block of the render) and scaled to
 * metres here. Anything placed in the map should use these constants rather than
 * guessing, so doors, stairs and props stay consistent with the character.
 */

/** Standing height of the explorer, sole to top of hair, in metres. */
export const CHARACTER_HEIGHT_M = 1.7;

/** Height of the voxel model in body units (sole to hair top) — see character/dims.ts. */
export const CHARACTER_HEIGHT_BU = 32.4;

/** Metres per body unit (≈ 5.2 cm). One face/hair block of the character. */
export const BODY_UNIT_M = CHARACTER_HEIGHT_M / CHARACTER_HEIGHT_BU;

/** Collision capsule for the controller (metres). */
export const CHARACTER_RADIUS_M = 0.32;
/** Highest ledge the explorer climbs without jumping (Angkor steps are ~0.2–0.35 m). */
export const CHARACTER_STEP_M = 0.42;

/** Movement speeds (m/s), tuned to the stride length of the walk/run cycles. */
export const WALK_SPEED = 1.9;
export const RUN_SPEED = 4.6;

/** Size of one sandstone block of the temple building kit. */
export const TEMPLE_BLOCK_M = 0.5;

/**
 * Real-world dimensions from the Angkor Wat reference sheets (metres). Use these
 * when laying out the map so it stays in proportion with the explorer.
 */
export const ANGKOR = {
  complexLengthEW: 1500,
  complexWidthNS: 1300,
  moatWidth: 190,
  causewayLength: 200,
  causewayWidth: 12,
  centralTowerHeight: 65,
  cornerTowerHeight: 45,
  /** Clear opening of a gallery / gopura doorway (≈ 2× the explorer). */
  doorwayHeight: 3.4,
  doorwayWidth: 1.8,
  /** Typical stair riser / tread. */
  stairRise: 0.25,
  stairRun: 0.35,
  nagaBalustradeHeight: 1.0,
  treeHeightMin: 8,
  treeHeightMax: 12,
} as const;
