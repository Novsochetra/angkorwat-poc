import type { Material, WebGLProgramParametersWithUniforms } from 'three';
import { PERIOD } from '../festival/_kit';

/**
 * The festival square's flames breathing (AWP-35; the owner: "gentle lantern flickering"): a slow, soft flicker per
 * lamp, never two in step, computed in the shaders from the lamp's place (its x, z) and a clock that wraps every
 * `PERIOD` s (the kit's): two slow waves of incommensurate speeds and a small quicker one, each a whole number of
 * turns in `PERIOD`, so nothing jumps as the clock wraps. The same function lights a lamp, its halo and the pool
 * under it (all from the same x, z), so they breathe together.
 */

const turn = (k: number): string => ((k * Math.PI * 2) / PERIOD).toFixed(5);

/** GLSL: `nyeFlicker(xz, t)`: −1‥1 round 0, slow (≈ 0.2‥0.8 Hz), a seed from the lamp's map x, z. */
export const FLICKER_GLSL = /* glsl */ `
float nyeFlicker(vec2 xz, float t) {
  float s = fract(sin(dot(floor(xz * 4.0) + 0.5, vec2(12.9898, 78.233))) * 43758.5453);
  return 0.55 * sin(t * ${turn(131)} + s * 40.0) * sin(t * ${turn(197)} + s * 17.0)
    + 0.3 * sin(t * ${turn(467)} + s * 63.0)
    + 0.15 * sin(t * ${turn(1013)} + s * 9.0);
}`;

/**
 * Let an instanced unlit material's flames flicker (its instances' colours × 1 + amount · flicker): `amount` 0‥1 for
 * all (`number`), or per instance from the instanced attribute `aFlick` (`'attr'`: bulbs 0, flames 1). `time` is a
 * clock wrapping every `PERIOD` s. One program per kind of patch (its cache key), compiled with the map.
 */
export function flickerFlames(material: Material, time: { value: number }, amount: number | 'attr'): void {
  const perInstance = amount === 'attr';
  const level = { value: perInstance ? 1 : amount };
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uFlickTime = time;
    shader.uniforms.uFlickLevel = level;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFlickTime;
        uniform float uFlickLevel;
        ${perInstance ? 'attribute float aFlick;' : 'const float aFlick = 1.0;'}
        ${FLICKER_GLSL}`,
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
        #if defined( USE_INSTANCING ) && ( defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) )
          vColor.xyz *= 1.0 + uFlickLevel * aFlick * nyeFlicker(instanceMatrix[3].xz, uFlickTime);
        #endif`,
      );
  };
  material.customProgramCacheKey = () => (perInstance ? 'nye-flicker-attr' : 'nye-flicker');
  material.needsUpdate = true;
}
