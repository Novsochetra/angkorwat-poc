import { Color, Group, Mesh, type DirectionalLight, type Fog, type FogExp2, type HemisphereLight, type InstancedBufferGeometry } from 'three';
import type { MapContext, MapFrame, MapPart } from './types';
import { buildWaterData } from './water/data';
import { buildFallGeometry, fallMaterial } from './water/falls';
import { buildWaterGrid } from './water/grid';
import { buildSpray } from './water/spray';
import { buildSurfaceGeometry, surfaceMaterial } from './water/surface';

/**
 * Rivers, pools and waterfalls (three draw calls):
 *  - `water surface`: every water cell of the height field, flowing along
 *    the rivers (surface.ts; its map of banks, foam and flow in data.ts);
 *  - `waterfalls`: a sheet down the cliff for every fall, and small cascades
 *    where a river steps down (falls.ts);
 *  - `waterfall spray`: mist puffs at the foot of the falls (spray.ts).
 * All follow the scene's lights (sun by day, moon by night) and fog.
 */

// Colours (sRGB), day → night.
const SHALLOW = [0x4cc2b4, 0x2f6f9c];
const DEEP = [0x16708a, 0x123f73];
const FOAM = [0xf2f5ec, 0xaec4e4];
const FALL_WHITE = [0xeaf2f6, 0xc8d6f0];
const FALL_TINT = [0x8cc7c4, 0x6a8fc4];
/** Glow of the falls themselves: faint by day, pale blue at night. */
const FALL_GLOW = [0x0d0f10, 0x1c2a48];

export function buildWater(ctx: MapContext): MapPart {
  const grid = buildWaterGrid(ctx.field);
  const falls = buildFallGeometry(grid);
  const data = buildWaterData(grid, falls.feet, ctx.scene);

  const object = new Group();
  object.name = 'water';

  const surf = surfaceMaterial(data.texture, data.box);
  const surface = new Mesh(buildSurfaceGeometry(grid), surf.material);
  surface.name = 'water surface';
  surface.receiveShadow = true;

  const fall = fallMaterial();
  const sheets = new Mesh(falls.geometry, fall.material);
  sheets.name = 'waterfalls';
  sheets.receiveShadow = true;

  const spray = buildSpray(falls.feet, ctx.quality);
  object.add(surface, sheets, spray.mesh);
  console.info(
    `[map] water: ${falls.feet.filter((f) => !f.small).length} falls, ${falls.feet.filter((f) => f.small).length} steps, ${(spray.mesh.geometry as InstancedBufferGeometry).instanceCount} mist puffs, ${data.obstacles} texels round rocks and piers`,
  );

  // The scene's lights (the atmosphere adds them after the parts are built).
  let hemi: HemisphereLight | null = null;
  let key: DirectionalLight | null = null;
  const findLights = () => {
    hemi = null;
    key = null;
    ctx.scene.traverse((o) => {
      if ((o as HemisphereLight).isHemisphereLight && !hemi) hemi = o as HemisphereLight;
      const d = o as DirectionalLight;
      if (d.isDirectionalLight && (!key || (d.castShadow && !key.castShadow) || (d.castShadow === key.castShadow && d.intensity > key.intensity))) key = d;
    });
  };
  let frames = 0;
  const c = new Color();
  const sky = new Color();
  const keyC = new Color();
  const hemiC = new Color();
  const mix = (out: Color, pair: number[], n: number) => out.setHex(pair[0]).lerp(c.setHex(pair[1]), n);

  return {
    name: 'water',
    object,
    update(f: MapFrame) {
      // (look again now and then while one is missing: the atmosphere may swap them)
      if ((!key?.parent || !hemi?.parent) && frames++ % 60 === 0) findLights();
      const n = f.night;
      const k = key as DirectionalLight | null;
      const h = hemi as HemisphereLight | null;
      if (k) keyC.copy(k.color).multiplyScalar(k.intensity);
      else keyC.setRGB(2, 2, 2);
      if (h) hemiC.copy(h.color).multiplyScalar(h.intensity);
      else hemiC.setRGB(1, 1, 1);
      const fog = ctx.scene.fog as Fog | FogExp2 | null;
      // Mirrored sky: the haze colour at the horizon, a little of the sky light above it.
      sky.copy(fog ? fog.color : hemiC).lerp(c.copy(hemiC).multiplyScalar(0.6), 0.3).multiplyScalar(1 + 0.4 * n);

      const s = surf.uniforms;
      s.uTime.value = f.t;
      mix(s.uShallow.value, SHALLOW, n);
      mix(s.uDeep.value, DEEP, n);
      mix(s.uFoam.value, FOAM, n);
      s.uSky.value.copy(sky);
      s.uLightDirW.value.copy(f.lightDir);
      s.uSparkle.value = 7 + 4 * n;
      s.uRain.value = f.weather.rain;

      const u = fall.uniforms;
      u.uTime.value = f.t;
      mix(u.uWhite.value, FALL_WHITE, n);
      mix(u.uTint.value, FALL_TINT, n);
      mix(u.uGlow.value, FALL_GLOW, n);
      u.uBack.value.copy(keyC).multiplyScalar(0.1);
      u.uLightDirW.value.copy(f.lightDir);

      const p = spray.uniforms;
      p.uTime.value = f.t;
      p.uColor.value.copy(hemiC).multiplyScalar(0.55).add(c.copy(keyC).multiplyScalar(0.18)).lerp(c.setHex(FALL_WHITE[1]).multiplyScalar(0.5), n * 0.5);
      p.uOpacity.value = 0.6 - 0.15 * n;
    },
  };
}
