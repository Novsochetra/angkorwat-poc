import { Box3, Group, Vector3, type Mesh } from 'three';
import { ShadowGate } from './cull';
import { buildGround } from './paddies/ground';
import { buildProps } from './paddies/props';
import { buildRice } from './paddies/rice';
import { PLOTS, setPaddySeason } from './paddies/stages';
import { ROAM_SCALE } from './roam/types';
import { SKY } from './sky/palette';
import type { MapContext, MapFrame, MapPart } from './types';
import { stepWind, swayLand } from './veg/sway';

/**
 * Rice paddies that follow the year (layout.ts `PADDIES`, south-west by the
 * great lake): the rice year of every plot on `f.season` is described in
 * paddies/stages.ts. Three kinds of draw:
 *  - `paddies:ground`: the plots' floor — cracked dry clay, wet mud and
 *    furrows, shallow water mirroring the sky, rain rings (ground.ts);
 *  - `paddies:rice`: the tufts in rows, seedlings to gold to stubble,
 *    swaying and waving in the wind (rice.ts; a draw per plot in view);
 *  - `paddies:props`: fences, ting mong, stooks, straw stacks, sugar palms
 *    (props.ts; they also cast shadows, while those can be seen: cull.ts).
 * Every frame: uniforms only. Not solid (roam/walkmap.ts `SKIP_PARTS`): he
 * walks on the land's dikes and wades through the plots (walker.ts steps in
 * water while a plot is flooded: stages.ts `paddyFlooded`).
 */

/** The listener is his head while roaming: his feet are this far below (m). */
const HEAD = 1.7 * ROAM_SCALE;
/** The shaders are compiled in the first frames (drawn wherever the camera is); culled after. */
const WARM_FRAMES = 3;

export function buildPaddies(ctx: MapContext): MapPart {
  const season = { value: 0.45 };
  swayLand(ctx.field);
  const ground = buildGround(ctx.field, PLOTS, season);
  const rice = buildRice(ctx.field, PLOTS, season);
  const props = buildProps(ctx.field, PLOTS, season);

  const object = new Group();
  object.name = 'paddies';
  object.add(ground.mesh, ...rice.meshes, props.mesh);
  const meshes = [ground.mesh, ...rice.meshes, props.mesh];
  for (const m of meshes) m.frustumCulled = false;
  const shadows = new ShadowGate().add(props.mesh, boxOf(props.mesh));
  console.info(`[map] paddies: ${PLOTS.length} plots, ${ground.cells} floor cells, ${rice.count} rice tufts, ${props.count} prop boxes · ${meshes.length} draws at most`);

  let frames = 0;

  return {
    name: 'paddies',
    object,
    blocks: props.count,
    update(f: MapFrame) {
      if (frames === WARM_FRAMES) for (const m of meshes) m.frustumCulled = true;
      frames++;
      shadows.update(f);
      stepWind(f, 'paddies');
      season.value = f.season;
      setPaddySeason(f.season, f.weather.wet);

      const w = f.weather;
      const n = f.night;
      const g = ground.uniforms;
      g.uTime.value = f.drift;
      g.uWet.value = w.wet;
      g.uRain.value = w.rain;
      g.uWind.value = w.wind;
      g.uWindDir.value.set(Math.sin(w.windDir), Math.cos(w.windDir));
      g.uLightDirW.value.copy(f.lightDir);
      g.uSparkle.value = 6 + 5 * n;
      // The mirrored sky: the sky's own colours now (the atmosphere updates SKY before the parts).
      g.uHorizon.value.copy(SKY.horizon).lerp(SKY.haze, 0.35);
      g.uZenith.value.copy(SKY.zenith);
      g.uGlow.value.copy(SKY.glow).multiplyScalar(SKY.glowStrength * (1 - 0.7 * w.cloud));
      g.uGlowDir.value.copy(SKY.glowDir);
      g.uCloud.value.copy(SKY.cloudBody).lerp(SKY.cloudLit, 0.55);
      g.uCloudCover.value = Math.min(1, SKY.coverage + w.cloud);
      const clear = 1 - 0.85 * w.cloud;
      g.uSunDir.value.copy(SKY.sunDir);
      g.uSunCol.value.copy(SKY.key).multiplyScalar(SKY.sun * clear);
      g.uMoonDir.value.copy(SKY.moonDir);
      g.uMoonCol.value.copy(SKY.key).multiplyScalar(SKY.moon * (0.3 + 0.7 * SKY.moonLit) * clear);

      // His feet parting the rice (far away when he is not on foot).
      const L = f.listener;
      if (f.roam === 'walk' || f.roam === 'boat') rice.uniforms.uFocus.value.set(L.x, L.y - HEAD, L.z);
      else rice.uniforms.uFocus.value.set(0, -1e4, 0);
    },
  };
}

/** The box round the props (world, m): each box's middle and half its diagonal (props.ts `aP0`, `aP1`). */
function boxOf(mesh: Mesh): Box3 {
  const p = mesh.geometry.getAttribute('aP0');
  const s = mesh.geometry.getAttribute('aP1');
  const box = new Box3();
  const v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(s.getX(i), s.getY(i), s.getZ(i)) / 2;
    box.expandByPoint(v.set(p.getX(i) - r, p.getY(i) - r, p.getZ(i) - r)).expandByPoint(v.set(p.getX(i) + r, p.getY(i) + r, p.getZ(i) + r));
  }
  return box;
}
