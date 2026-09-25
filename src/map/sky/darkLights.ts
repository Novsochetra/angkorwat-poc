import { ShaderChunk } from 'three';

/**
 * Point and spot lights light a pixel only where they reach it.
 *
 * The map keeps its small lights in the scene all the time (landmark lamps,
 * the explorer's lantern and flashlight, the boat lantern), dark when unused,
 * so the light count never changes and no shader compiles again. But three
 * shades every lit pixel with every one of them, dark or not: in the overview
 * that was about a quarter of the frame (the picker ran at 30 fps on an M1 Max).
 * Here a point or spot light is skipped when it is switched off (colour 0,
 * the same for every pixel), and its shading runs only where its light is
 * not zero (`directLight.visible`: in range, inside the cone). A dark light
 * added nothing, so the picture stays the same.
 *
 * Call once, before any material compiles.
 */
export function skipDarkLights(): void {
  if (installed) return;
  const chunk = ShaderChunk.lights_fragment_begin;
  const from = chunk.indexOf('#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )');
  // (the point and spot light loops come before the sun and directional ones)
  const to = chunk.indexOf('#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )');
  let loops = from >= 0 && to > from ? chunk.slice(from, to) : '';
  const call = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  const picks = ['pointLight = pointLights[ i ];', 'spotLight = spotLights[ i ];'];
  if (loops.split(call).length !== 3 || picks.some((p) => loops.split(p).length !== 2)) {
    console.warn("[map] dark lights: three's light loop changed; every light shades every pixel");
    return;
  }
  for (const pick of picks) loops = loops.replace(pick, `${pick}\n\t\tif ( ${pick.split(' ')[0]}.color != vec3( 0.0 ) ) {`);
  loops = loops.replaceAll(call, `if ( directLight.visible ) ${call}\n\t\t}`);
  installed = true;
  ShaderChunk.lights_fragment_begin = chunk.slice(0, from) + loops + chunk.slice(to);
}

let installed = false;
