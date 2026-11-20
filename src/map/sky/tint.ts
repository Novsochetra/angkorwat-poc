/**
 * Coloured light in the sky from something on the map (the New Year's Eve fireworks, nye/fireworks.ts): its
 * colour × strength (linear, ≈ 0‥2: a 35 m peony at its peak is its colour × 1, a finale saturates softly at
 * ≈ 1.6) and where it is (the light-weighted middle of the bursts in the air, m). All 0 when nothing lights the
 * sky, so the sky, the clouds and the haze read exactly as they do without it.
 *
 * Unlike the weather's `flash` (lightning: cold white, the whole sky), this is a coloured bloom round one place:
 * the haze toward it (sky/haze.ts `hazeColorDir`), the sky dome's glow low round it and its clouds
 * (sky/skyDome.ts), the rain clouds (clouds.ts). Written once a frame by whoever lights it; read the next frame
 * is fine. Uniforms only: no shader changes when it comes or goes.
 */
export const SKY_TINT = { r: 0, g: 0, b: 0, x: 0, y: 0, z: 0 };

/** Nothing lights the sky. */
export function clearSkyTint(): void {
  SKY_TINT.r = SKY_TINT.g = SKY_TINT.b = 0;
}
