import { DirectionalLight, Fog, Group, HemisphereLight, Matrix4, Vector3, type Camera, type Light, type Scene } from 'three';
import { dealStillParts, graphicsNow, STILL_LAYER, STILL_PART_LAYER, STILL_TURN, stillView } from './graphics';
import { MAP_BOUNDS } from './layout';
import { CAM_REACH, ROAM_AREA } from './terrain/views';
import { skipDarkLights } from './sky/darkLights';
import { HAZE, installHaze } from './sky/haze';
import { buildLandMap } from './sky/mist';
import { mistNoiseTexture } from './sky/noise';
import { SKY, updateSky } from './sky/palette';
import { buildSkyDome } from './sky/skyDome';
import type { MapContext, MapFrame, MapPart } from './types';

/**
 * Sky, sun and moon, lights and haze through the day (golden-hour afternoon
 * → dusk → moonlit night → dawn, on `f.clock`; the moon's phase from `f.day`;
 * the weather from `f.weather`; the values are in sky/palette.ts).
 *
 * - The sky dome (sky/skyDome.ts): gradient, the sun disc and the moon
 *   (its real face and phase, sky/moon.ts) on their paths (where the concept
 *   art has them in the afternoon and at midnight; the sun comes up behind
 *   Angkor Wat at dawn), two layers of clouds drifting with the wind (on
 *   `f.drift`, so they stand still under "reduce motion"), stars and now and
 *   then a shooting star (sky/stars.ts).
 * - One key light (sun by day, moon by night) that casts every shadow of the
 *   map. Its direction is a cheat: it comes from the east-south-east and
 *   low (≈ 25° by day), so the faces toward the camera catch the warm light
 *   while the sun disc sits low in the north-east of the picture. It swings
 *   and drops a little with the sun (and the moon) through the day. It turns
 *   only on the frames the shadow map is drawn anyway (every third), so a
 *   moving sun costs no extra shadow passes. `f.lightDir` is this direction.
 *   Clouds and dawn make its shadows paler and softer (`shadow.intensity`,
 *   `shadow.radius`: uniforms, no redraw).
 * - The still shadows of the low and medium levels (graphics.ts) are drawn
 *   again only once the light has turned {@link STILL_TURN} (with the day's
 *   cycle about every second at dusk and dawn), and then over 10–12 frames:
 *   the next map is drawn a part of the casters a frame (graphics.ts
 *   `dealStillParts`, ≈ 0.3 M triangles each on low, 0.8–0.9 M on medium)
 *   while the one shown stays, and the two swap — the light turning with
 *   them — when it is done. The whole map in one frame (low: 2.8–3.5 M
 *   triangles, ≈ 4–6 ms more on an M1 Max, 20–45 on a phone) was a hitch
 *   each time; a part adds ≈ 0.5 ms of GPU and 0.4 ms of CPU (medium:
 *   ≈ 0.3–0.5 ms a frame in all).
 * - A hemisphere fill: cool sky light from above, warm bounce from below; a
 *   lightning flash floods it for a moment (no light is ever added).
 * - Haze (sky/haze.ts): three's fog chunks are replaced here, before any
 *   material compiles, with distance haze tinted towards the sun plus
 *   valley mist, so every material gets both.
 * - Small lights (sky/darkLights.ts): a point or spot light is shaded only
 *   where it reaches, so the lamps and lanterns that wait in the dark cost
 *   next to nothing.
 *
 * URL (checks): `shadows=live` a shot draws the shadow map when the live
 * page would (else every frame, so each picture is exact: scripts/perf.mjs
 * uses it) · `shadowsteps=<n>` a still redraw over n frames (1: in one, as
 * before; else as many as its size needs, at most 12).
 */
export interface Atmosphere extends MapPart {
  /** The key light (sun by day, moon by night); casts the map's shadows. */
  key: DirectionalLight;
}

/**
 * The land the shadow map must cover (m), ground to the top of Phnom Kulen:
 * in the overview (and the places' views) what those cameras see, the map as
 * it was first made (the land that grew round Phnom Kulen is behind it or off
 * the frame): the one shadow map stays as sharp there; roaming, the roaming
 * area and most of the follow camera's reach round it.
 */
const SHADOW_BOX = {
  overview: { x0: MAP_BOUNDS.x0, x1: 600, y0: -4, y1: 175, z0: -660, z1: MAP_BOUNDS.z1 },
  roam: { x0: MAP_BOUNDS.x0, x1: ROAM_AREA.x1 + CAM_REACH * 0.75, y0: -4, y1: 175, z0: ROAM_AREA.z0 - CAM_REACH / 2, z1: MAP_BOUNDS.z1 },
};
type ShadowBox = (typeof SHADOW_BOX)['overview'];

export function buildAtmosphere(ctx: MapContext): Atmosphere {
  const params = new URLSearchParams(location.search);
  /** The shadow map drawn as the live page draws it (a shot draws it every frame, unless `shadows=live`). */
  const live = !ctx.shot || params.get('shadows') === 'live';
  /** `shadowsteps=`: frames a still redraw takes (0: as many as its size needs). */
  const steps = Math.max(0, Math.round(Number(params.get('shadowsteps')) || 0));

  const land = buildLandMap(ctx.field);
  skipDarkLights();
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
  const centre = new Vector3();
  const fitted = new Vector3(0, 0, 0);
  let box = SHADOW_BOX.overview;
  let fittedBox: ShadowBox | null = null;
  /** Point `light` along `dir` at the middle of `on`, its shadow camera fitted round the box as the light sees it. */
  function aim(light: DirectionalLight, dir: Vector3, on: ShadowBox): void {
    centre.set((on.x0 + on.x1) / 2, (on.y0 + on.y1) / 2, (on.z0 + on.z1) / 2);
    light.position.copy(centre).addScaledVector(dir, 1500);
    light.target.position.copy(centre);
    light.updateMatrixWorld();
    light.target.updateMatrixWorld();
    lightView.lookAt(light.position, centre, corner.set(0, 1, 0)).setPosition(light.position).invert();
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? on.x1 : on.x0, i & 2 ? on.y1 : on.y0, i & 4 ? on.z1 : on.z0).applyMatrix4(lightView);
      x0 = Math.min(x0, corner.x);
      x1 = Math.max(x1, corner.x);
      y0 = Math.min(y0, corner.y);
      y1 = Math.max(y1, corner.y);
      z0 = Math.min(z0, corner.z);
      z1 = Math.max(z1, corner.z);
    }
    const cam = light.shadow.camera;
    cam.left = x0;
    cam.right = x1;
    cam.bottom = y0;
    cam.top = y1;
    cam.near = Math.max(1, -z1 - 20);
    cam.far = -z0 + 20;
    cam.updateProjectionMatrix();
  }
  function fitShadow(dir: Vector3): void {
    if (fitted.distanceToSquared(dir) < 1e-10 && fittedBox === box) return;
    fitted.copy(dir);
    fittedBox = box;
    aim(key, dir, box);
    shadowDirty = true;
  }

  // On high the shadow map is 4096² over ≈ 400 k blocks: it is drawn every
  // third frame (for things that move; graphics.ts: 8192² and every frame on
  // max), and the key light turns only on those frames, so a moving sun or
  // moon adds no shadow pass (at 60 fps it turns 20 times a second, in steps
  // too small to see). The shadows of low and medium are still (graphics.ts):
  // only what never moves casts, and the map is drawn again only once the
  // light has turned a little, so while it stands no frame draws shadows.
  // (three's shadow pass; a new one once the GPU has given a lost picture back: `restored`)
  let shadows = ctx.renderer.shadowMap;
  shadows.autoUpdate = false;
  shadows.needsUpdate = true;
  let shadowDirty = true;
  let frames = 0;
  let lastDrift = NaN;
  /** How much the eye has got used to the shade under the leaves (0‥1, eased). */
  let under = 0;

  // ── Still shadows drawn over a few frames ──
  // The next map belongs to a light of its own that never lights anything
  // (not in the scene: only its shadow map is drawn). Its casters are dealt
  // into parts (graphics.ts, a layer each); each frame the picture's draw
  // draws one part into it (three's shadow pass with the view camera seeing
  // that part's layer, the map cleared only before the first); once all are
  // in, the key light takes the map and its aim, and gives its old map back
  // to be drawn over next time.
  const next = new DirectionalLight(0xffffff, 0);
  next.name = 'sun: the next still shadows';
  next.castShadow = true;
  const nextDir = new Vector3();
  let nextBox = box;
  /** Parts of the next map drawn so far, and how many it has (0: none on the way). */
  let part = 0;
  let parts = 0;
  /** Still shadows are drawn over frames now (live, a level of still shadows, a map shown already). */
  let spread = false;

  /** Start the next map: aimed along `dir` over the box in use, its casters dealt into parts. */
  function startNext(dir: Vector3): void {
    nextDir.copy(dir);
    nextBox = box;
    next.shadow.mapSize.copy(key.shadow.mapSize);
    aim(next, dir, box);
    parts = dealStillParts(ctx.scene, steps);
    part = 0;
  }
  /** No next map (a level without still shadows, a new size): its target freed. */
  function dropNext(): void {
    part = parts = 0;
    next.shadow.map?.dispose();
    next.shadow.map = null;
  }
  /** The next map is done: it shows from now on, and the key light turns to where it was drawn from. */
  function swapNext(): void {
    const shown = key.shadow.map;
    key.shadow.map = next.shadow.map;
    next.shadow.map = shown;
    key.position.copy(next.position);
    key.target.position.copy(next.target.position);
    key.updateMatrixWorld();
    key.target.updateMatrixWorld();
    const a = key.shadow.camera;
    const b = next.shadow.camera;
    a.left = b.left;
    a.right = b.right;
    a.bottom = b.bottom;
    a.top = b.top;
    a.near = b.near;
    a.far = b.far;
    a.updateProjectionMatrix();
    // (the matrix the picture reads the map with)
    key.shadow.updateMatrices(key);
    fitted.copy(nextDir);
    fittedBox = nextBox;
    part = parts = 0;
  }
  // One part a frame, with the picture (not with another view of the scene: the snow's map from above).
  const clear = ctx.renderer.clear;
  const keep = () => {};
  const one: Light[] = [next];
  /** Hook three's shadow pass (the one in use: `shadows`). */
  const hook = () => {
    const draw = shadows.render.bind(shadows);
    shadows.render = (lights: Light[], scene: Scene, camera: Camera) => {
      if (spread && camera === ctx.camera && graphicsNow.stillShadows) {
        // (asked for again — the explorer leaves his ledge, the land's cull changes —: a next map of what casts
        // now, unless this frame's has just been dealt)
        if (shadows.needsUpdate) {
          if (parts === 0 || part > 0) startNext(parts === 0 ? fitted : nextDir);
          shadows.needsUpdate = false;
        }
        if (part < parts) {
          stillView.mask = 1 << (STILL_PART_LAYER + part);
          if (part > 0) ctx.renderer.clear = keep;
          shadows.needsUpdate = true;
          try {
            draw(one, scene, camera);
          } finally {
            ctx.renderer.clear = clear;
            stillView.mask = 1 << STILL_LAYER;
            shadows.needsUpdate = false;
          }
          part++;
        }
      }
      draw(lights, scene, camera);
    };
  };
  hook();

  return {
    name: 'atmosphere',
    object,
    key,
    restored() {
      // (three made a new shadow pass: hooked as the old one was — main.ts has put `stillCasters` on it first —;
      // the maps were drawn into GPU memory that is gone: new ones, the whole map drawn at once as at the start.
      // The old targets are let go, not disposed: their GL objects went with the lost context.)
      shadows = ctx.renderer.shadowMap;
      shadows.autoUpdate = false;
      hook();
      key.shadow.map = null;
      next.shadow.map = null;
      part = parts = 0;
      shadowDirty = true;
    },
    update(f: MapFrame) {
      const s = updateSky(f);
      // (the graphics level sets the map's size and how often it is drawn: graphics.ts)
      const size = Math.min(graphicsNow.shadowMap, ctx.renderer.capabilities.maxTextureSize);
      if (key.shadow.mapSize.x !== size) {
        key.shadow.mapSize.set(size, size);
        key.shadow.map?.dispose();
        key.shadow.map = null;
        dropNext();
        shadowDirty = true;
      }
      const casters = graphicsNow.stillShadows ? 1 << STILL_LAYER : 1;
      if (key.shadow.camera.layers.mask !== casters) {
        key.shadow.camera.layers.mask = casters;
        shadowDirty = true;
      }
      frames++;
      // (the box for what the camera sees now: roaming or not, drawn again when it changes)
      const want = f.roam === 'overview' ? SHADOW_BOX.overview : SHADOW_BOX.roam;
      if (want !== box) {
        box = want;
        shadowDirty = true;
      }
      // Still shadows, live, over a map already shown: the next one is drawn over the next frames (the render hook above).
      spread = live && graphicsNow.stillShadows && key.shadow.map !== null;
      if (spread) {
        if (parts > 0 && part >= parts) swapNext();
        if (shadowDirty || (parts === 0 && frames >= 3 && fitted.angleTo(s.keyDir) > STILL_TURN)) {
          startNext(s.keyDir);
          frames = 0;
        }
        shadowDirty = false;
      } else {
        if (parts > 0 || next.shadow.map) dropNext();
        const redraw = !live || (graphicsNow.stillShadows ? frames >= 3 && fitted.angleTo(s.keyDir) > STILL_TURN : frames >= graphicsNow.shadowEvery);
        if (redraw || shadowDirty) {
          fitShadow(s.keyDir);
          frames = 0;
          shadows.needsUpdate = true;
        }
        shadowDirty = false;
      }
      f.lightDir.copy(fitted);

      // Under the jungle's leaves (roaming on foot or by boat; 0 in the overview)
      // the eye gets used to the shade: paler shadows, more sky fill, a little
      // more exposure. No light is added. Half of it at night.
      const leaves = (f.canopy ?? 0) * (1 - 0.5 * s.night);
      under += (leaves - under) * (f.dt > 0 ? 1 - Math.exp(-f.dt / 2.5) : 1);
      SKY.exposure *= 1 + 0.1 * under;

      key.color.copy(s.key);
      key.intensity = s.keyIntensity;
      key.shadow.intensity = s.shadow * (1 - 0.4 * under);
      key.shadow.radius = s.shadowSoft;
      fill.color.copy(s.fillSky);
      fill.groundColor.copy(s.fillGround);
      fill.intensity = s.fillIntensity * (1 + 0.5 * under);

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

      // (under "reduce motion" the drift clock stands still while frames go by: no shooting stars then)
      sky.update(s, f.drift, f.camera, f.dt > 0 && f.drift === lastDrift);
      lastDrift = f.drift;
    },
  };
}

export { SKY };
