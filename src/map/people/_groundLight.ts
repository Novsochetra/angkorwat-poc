import { DataTexture, FloatType, RGBAFormat, Vector4 } from 'three';

/**
 * A light map lying on the land that lights the crowd standing in it (AWP-35, the owner: "light round the people,
 * not dark shapes"): the New Year square's lamp pools (nye/_sqLight.ts sets it), so whoever stands in a pool is warm
 * and whoever stands in a gap between pools stays dark, as the pavers under them do. One for the map: the crowd's
 * shader reads it (`_personModel.ts`), at each person's feet.
 *
 * - `uPGround`: the map (r the steady light, g the flames' light; b, a unused here);
 * - `uPGroundAt`: x0, z0, 1 / side (map m) and its strength (0: off, nothing sampled: by day, on low, no square).
 */
export const GROUND_LIGHT = {
  uPGround: { value: new DataTexture(new Float32Array(4), 1, 1, RGBAFormat, FloatType) },
  uPGroundAt: { value: new Vector4(0, 0, 1, 0) },
};
GROUND_LIGHT.uPGround.value.needsUpdate = true;
