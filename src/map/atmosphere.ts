import { DirectionalLight, Fog, Group, HemisphereLight, Matrix4, Vector3 } from 'three';
import { MAP_BOUNDS } from './layout';
import { HAZE, installHaze } from './sky/haze';
import { buildLandMap } from './sky/mist';
import { mistNoiseTexture } from './sky/noise';
import { SKY, updateSky } from './sky/palette';
import { buildSkyDome } from './sky/skyDome';
import type { MapContext, MapFrame, MapPart } from './types';

/**
 * Sky, sun and moon, lights and haze for both times of day (golden-hour
 * afternoon ↔ moonlit night, blended by `night`; the values are in
 * sky/palette.ts).
 *
 * - The sky dome (sky/skyDome.ts): gradient, sun and moon discs placed where
 *   the concept art has them, clouds, stars.
 * - One key light (sun by day, moon by night) that casts every shadow of the
 *   map. Its direction is a cheat: it comes from the east-south-east and
 *   low (≈ 25° by day), so the faces toward the camera catch the warm light
 *   while the sun disc sits low in the north-east of the picture. `f.lightDir`
 *   is this direction.
 * - A hemisphere fill: cool sky light from above, warm bounce from below.
 * - Haze (sky/haze.ts): three's fog chunks are replaced here, before any
 *   material compiles, with distance haze tinted towards the sun plus
 *   valley mist, so every material gets both.
 */
export interface Atmosphere extends MapPart {
  /** The key light (sun by day, moon by night); casts the map's shadows. */
  key: DirectionalLight;
}

/** The land the shadow map must cover (m): the whole map, ground to the top of Phnom Kulen. */
const SHADOW_BOX = { x0: MAP_BOUNDS.x0, x1: MAP_BOUNDS.x1, y0: -4, y1: 175, z0: MAP_BOUNDS.z0, z1: MAP_BOUNDS.z1 };

export function buildAtmosphere(ctx: MapContext): Atmosphere {
  const land = buildLandMap(ctx.field);
  installHaze(mistNoiseTexture(), land.texture);
  HAZE.landBounds.set(land.bounds.x, land.bounds.y, land.bounds.z);
  HAZE.landBounds.w = land.bounds.w;

  const object = new Group();
  object.name = 'atmosphere';

  const sky = buildSkyDome();
  sky.mesh.raycast = () => {};
  object.add(sky.mesh);

  const fill = new HemisphereLight(0xffffff, 0x000000, 1);
  fill.name = 'sky light';
  const key = new DirectionalLight(0xffffff, 3);
  key.name = 'sun';
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  // The shadow map stores the far sides of the blocks (three renders back
  // faces into it), so lit faces never shadow themselves: only a small
  // push along the normal for the rounded block edges.
  key.shadow.bias = -0.00005;
  key.shadow.normalBias = 0.35;
  key.shadow.radius = 2.5;
  object.add(fill, key, key.target);

  const fog = new Fog(0xffffff, 150, 1200);
  ctx.scene.fog = fog;

  // Fit the shadow camera tightly around the map box, seen from the light.
  const lightView = new Matrix4();
  const corner = new Vector3();
  const centre = new Vector3((SHADOW_BOX.x0 + SHADOW_BOX.x1) / 2, (SHADOW_BOX.y0 + SHADOW_BOX.y1) / 2, (SHADOW_BOX.z0 + SHADOW_BOX.z1) / 2);
  const fitted = new Vector3(0, 0, 0);
  function fitShadow(dir: Vector3): void {
    if (fitted.distanceToSquared(dir) < 1e-10) return;
    fitted.copy(dir);
    key.position.copy(centre).addScaledVector(dir, 1500);
    key.target.position.copy(centre);
    key.updateMatrixWorld();
    key.target.updateMatrixWorld();
    lightView.lookAt(key.position, centre, corner.set(0, 1, 0)).setPosition(key.position).invert();
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? SHADOW_BOX.x1 : SHADOW_BOX.x0, i & 2 ? SHADOW_BOX.y1 : SHADOW_BOX.y0, i & 4 ? SHADOW_BOX.z1 : SHADOW_BOX.z0).applyMatrix4(lightView);
      x0 = Math.min(x0, corner.x);
      x1 = Math.max(x1, corner.x);
      y0 = Math.min(y0, corner.y);
      y1 = Math.max(y1, corner.y);
      z0 = Math.min(z0, corner.z);
      z1 = Math.max(z1, corner.z);
    }
    const cam = key.shadow.camera;
    cam.left = x0;
    cam.right = x1;
    cam.bottom = y0;
    cam.top = y1;
    cam.near = Math.max(1, -z1 - 20);
    cam.far = -z0 + 20;
    cam.updateProjectionMatrix();
    shadowDirty = true;
  }

  // The shadow map is 4096² over ≈ 400 k blocks: draw it again only when
  // the light turns, and every few frames for things that move.
  const shadows = ctx.renderer.shadowMap;
  shadows.autoUpdate = false;
  shadows.needsUpdate = true;
  let shadowDirty = true;
  let frames = 0;

  return {
    name: 'atmosphere',
    object,
    key,
    update(f: MapFrame) {
      const s = updateSky(f.night);
      f.lightDir.copy(s.keyDir);

      key.color.copy(s.key);
      key.intensity = s.keyIntensity;
      fill.color.copy(s.fillSky);
      fill.groundColor.copy(s.fillGround);
      fill.intensity = s.fillIntensity;
      fitShadow(s.keyDir);
      if (ctx.shot || shadowDirty || ++frames % 3 === 0) shadows.needsUpdate = true;
      shadowDirty = false;

      fog.color.copy(s.haze);
      fog.near = s.hazeNear;
      fog.far = s.hazeFar;
      HAZE.sunDir.fromVector(s.glowDir);
      HAZE.sunColor.fromColor(s.hazeSun);
      HAZE.lowColor.fromColor(s.mistShade);
      HAZE.mistLit.fromColor(s.mistLit);
      HAZE.keyDir.fromVector(s.keyDir);
      HAZE.height.set(2, s.lowH, s.lowDensity);
      HAZE.height.w = s.lowMax;
      HAZE.mist.set(f.drift, 1 / s.bankSize, s.mound);
      HAZE.mist.w = s.coverage;

      sky.update(s, f.drift, f.camera.position);
    },
  };
}

export { SKY };
