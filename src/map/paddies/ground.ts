import { BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshStandardMaterial, Sphere, Vector2, Vector3, type WebGLProgramParametersWithUniforms } from 'three';
import { CELL, SURFACE, type HeightField } from '../heightfield';
import { RAIN_RINGS_GLSL } from '../sky/rain';
import { NOISE_GLSL } from '../water/glsl';
import { NURSERY, NURSERY_W, plotAt, STAGE_GLSL, SWEEP, type PlotPlan } from './stages';

/**
 * The floor of the paddy plots: one flat skin over every plot cell of the
 * height field (a quad per 2 m cell), a few centimetres over the land. Its
 * shader shows the plot's stage on the season:
 *  - dry earth, pale, cracked into plates (the hot season, after harvest);
 *  - dark wet mud, ploughed furrows (first rains);
 *  - shallow water: a mirror of the sky (low sky colour at the horizon, the
 *    sky light above, the sun's or moon's glow and glints), ripples running
 *    downwind, rain rings; it breaks into puddles as it fills or drains;
 *  - under the rice, darker; seen from afar it takes the rice's colour (the
 *    tufts are finer than a pixel there, so the plot reads as one field).
 */

/** Height of the skin over the plot's land: when dry, and when full of water (m). */
const LIFT = { dry: 0.05, wet: 0.11 };

/** Colours (sRGB). */
export const GROUND_COLORS = {
  /** Sun-baked clay and the cracks in it. */
  dry: 0xb39a74,
  crack: 0x5a4834,
  /** Wet mud and the plough's furrows. */
  mud: 0x51402d,
  furrow: 0x3b2e21,
};

/** Colours of the rice (sRGB), shared with the tufts (rice.ts). */
export const RICE_COLORS = {
  seedling: 0x86c342,
  green: 0x3f8a2a,
  greenTip: 0x74b23a,
  ripeStem: 0xaea85a,
  ripeHead: 0xcfb864,
  straw: 0xcdb680,
  strawOld: 0xa39579,
};

/** Uniforms of the rice colours (linear), shared by the skin and the tufts. */
export function riceColorUniforms(): Record<string, { value: Color }> {
  return {
    uSeedling: { value: new Color(RICE_COLORS.seedling) },
    uGreen: { value: new Color(RICE_COLORS.green) },
    uGreenTip: { value: new Color(RICE_COLORS.greenTip) },
    uRipeStem: { value: new Color(RICE_COLORS.ripeStem) },
    uRipeHead: { value: new Color(RICE_COLORS.ripeHead) },
    uStraw: { value: new Color(RICE_COLORS.straw) },
    uStrawOld: { value: new Color(RICE_COLORS.strawOld) },
  };
}

export const RICE_COLOR_GLSL = /* glsl */ `
uniform vec3 uSeedling;
uniform vec3 uGreen;
uniform vec3 uGreenTip;
uniform vec3 uRipeStem;
uniform vec3 uRipeHead;
uniform vec3 uStraw;
uniform vec3 uStrawOld;
// Rice colour at a height fraction hf (0 foot … 1 tip), growth g, plot-local season s.
vec3 pdRiceCol(float hf, float g, float s) {
  float lush = smoothstep(0.0, 0.45, g);
  vec3 stem = mix(uSeedling, uGreen, lush);
  vec3 tip = mix(uSeedling, uGreenTip, lush);
  stem = mix(stem, uRipeStem, pdRipe(s) * 0.85);
  tip = mix(tip, uRipeHead, smoothstep(0.52, 0.64, s));
  return mix(stem, tip, hf * hf);
}
// Stubble's colour, fresh from the cut (straw) to old and grey.
vec3 pdStubbleCol(float age) { return mix(uStraw, uStrawOld, smoothstep(0.0, 0.2, age)); }
`;

export interface GroundUniforms {
  uSeason: { value: number };
  uTime: { value: number };
  uWet: { value: number };
  uRain: { value: number };
  uWind: { value: number };
  uWindDir: { value: Vector2 };
  /** The sky mirrored (sky/palette.ts `SKY`): at the horizon, overhead, the glow round the sun or moon, clouds and how many. */
  uHorizon: { value: Color };
  uZenith: { value: Color };
  uGlow: { value: Color };
  uGlowDir: { value: Vector3 };
  uCloud: { value: Color };
  uCloudCover: { value: number };
  /** The sun's and the moon's discs (direction; colour × how visible): their glitter on the water. */
  uSunDir: { value: Vector3 };
  uSunCol: { value: Color };
  uMoonDir: { value: Vector3 };
  uMoonCol: { value: Color };
  uLightDirW: { value: Vector3 };
  uSparkle: { value: number };
  uDry: { value: Color };
  uCrack: { value: Color };
  uMud: { value: Color };
  uFurrow: { value: Color };
}

/**
 * The skin's cells: one quad per paddy cell. Per vertex `aPd` = (lag, cut,
 * plant, sweep order) of its plot, `aRow` = (rows along x, nursery bed here).
 */
export function buildGroundGeometry(field: HeightField, plots: PlotPlan[]): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const pd: number[] = [];
  const row: number[] = [];
  const idx: number[] = [];
  const h = CELL / 2;
  const box = new Sphere();
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let k = 0; k < field.nz; k++)
    for (let i = 0; i < field.nx; i++) {
      const c = i + k * field.nx;
      if (field.surface[c] !== SURFACE.paddy) continue;
      const [x, z] = field.cellCenter(i, k);
      const pi = plotAt(x, z);
      if (pi < 0) continue;
      const pl = plots[pi];
      const y = field.height[c];
      const v = pos.length / 3;
      for (const [dx, dz] of [
        [-h, -h],
        [-h, h],
        [h, h],
        [h, -h],
      ]) {
        const px = x + dx;
        const pz = z + dz;
        pos.push(px, y, pz);
        nor.push(0, 1, 0);
        pd.push(pl.lag, pl.cut, pl.plant, sweepOrder(pl, px, pz));
        const p = pl.paddy;
        row.push(pl.rowsX ? 1 : 0, pi === NURSERY && px > p.x + p.w / 2 - NURSERY_W ? 1 : 0);
      }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      x0 = Math.min(x0, x - h);
      x1 = Math.max(x1, x + h);
      z0 = Math.min(z0, z - h);
      z1 = Math.max(z1, z + h);
    }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  geo.setAttribute('aPd', new Float32BufferAttribute(pd, 4));
  geo.setAttribute('aRow', new Float32BufferAttribute(row, 2));
  geo.setIndex(idx);
  box.center.set((x0 + x1) / 2, 8, (z0 + z1) / 2);
  box.radius = Math.hypot(x1 - x0, z1 - z0) / 2 + 4;
  geo.boundingSphere = box;
  return geo;
}

/**
 * Where a point is in its plot's sweep (0‥1): planting and cutting cross a
 * plot along its rows, from the end nearest the village trail's east end.
 */
export function sweepOrder(pl: PlotPlan, x: number, z: number): number {
  const p = pl.paddy;
  // (rows along x: the sweep runs across them, north to south; else east to west)
  return pl.rowsX ? Math.min(1, Math.max(0, (z - (p.z - p.d / 2)) / p.d)) : Math.min(1, Math.max(0, (p.x + p.w / 2 - x) / p.w));
}

const VERTEX_PARS = /* glsl */ `
uniform float uSeason;
attribute vec4 aPd;
attribute vec2 aRow;
varying vec3 vWPos;
varying vec4 vPd;
varying vec2 vRow;
${STAGE_GLSL}`;

const VERTEX = /* glsl */ `
#include <begin_vertex>
{
  float s = fract(uSeason - aPd.x);
  transformed.y += mix(${LIFT.dry.toFixed(3)}, ${LIFT.wet.toFixed(3)}, pdWater(s));
  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vPd = aPd;
  vRow = aRow;
}`;

const FRAGMENT_PARS = /* glsl */ `
uniform float uSeason;
uniform float uTime;
uniform float uWet;
uniform float uRain;
uniform float uWind;
uniform vec2 uWindDir;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uGlow;
uniform vec3 uGlowDir;
uniform vec3 uCloud;
uniform float uCloudCover;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uMoonDir;
uniform vec3 uMoonCol;
uniform vec3 uLightDirW;
uniform float uSparkle;
uniform vec3 uDry;
uniform vec3 uCrack;
uniform vec3 uMud;
uniform vec3 uFurrow;
varying vec3 vWPos;
varying vec4 vPd;
varying vec2 vRow;
${STAGE_GLSL}
${NOISE_GLSL}
${RAIN_RINGS_GLSL}
// Cracks in dry clay: the edges of irregular plates (≈ 0.7 m), 0 on a plate … 1 in a crack.
float pdCracks(vec2 p) {
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 r = o + vec2(wHash(ip + o), wHash(ip + o + 17.3)) * 0.85 - fp;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
  return 1.0 - smoothstep(0.02, 0.07, sqrt(d2) - sqrt(d1));
}`;

/** Per fragment: the floor's colour, wetness, normal and mirror. */
const FRAGMENT = /* glsl */ `
  vec3 wN = vec3(0.0, 1.0, 0.0);
  float wFres = 0.0;
  float wSpark = 0.0;
  float wWater = 0.0;
  vec3 wRefl = vec3(0.0);
  {
    float s = fract(uSeason - vPd.x);
    float dist = length(vWPos - cameraPosition);
    float far = smoothstep(30.0, 150.0, dist);
    vec2 p = vWPos.xz;
    // Standing water, broken into puddles as it fills or drains (and puddles after heavy rain).
    float cover = max(pdWater(s), uWet * 0.35);
    float pn = wNoise(p * 0.16 + 3.1) * 0.65 + wNoise(p * 0.55 + 9.7) * 0.35;
    wWater = smoothstep(pn - 0.05, pn + 0.05, cover * 1.12 - 0.06);
    // The earth: dry clay with cracks, darkening to wet mud (the season, the rain), furrows after ploughing.
    float mud = max(pdMud(s), uWet * 0.85);
    float grain = wNoise(p * 2.3) * 0.5 + wNoise(p * 0.7 + 5.0) * 0.5;
    float crack = pdCracks(p * 1.4) * (1.0 - smoothstep(20.0, 80.0, dist)) * (1.0 - mud);
    vec3 dry = mix(uDry * (0.9 + 0.2 * grain), uCrack, crack * 0.85);
    float along = vRow.x > 0.5 ? p.y : p.x;
    float furrow = pdFurrow(s) * smoothstep(0.35, 0.8, abs(fract(along / 0.9) - 0.5) * 2.0) * (1.0 - far);
    vec3 wetMud = mix(uMud * (0.85 + 0.3 * grain), uFurrow, furrow * 0.8);
    vec3 earth = mix(dry, wetMud, mud);
    // Rice cover on the floor (the tufts' stage, rice.ts): shade under it, its colour from afar.
    float planted = smoothstep(vPd.z + vPd.w * ${SWEEP.toFixed(3)}, vPd.z + vPd.w * ${SWEEP.toFixed(3)} + 0.012, s);
    float g = smoothstep(vPd.z, vPd.z + 0.3, s);
    float cutT = smoothstep(vPd.y + vPd.w * ${SWEEP.toFixed(3)}, vPd.y + vPd.w * ${SWEEP.toFixed(3)} + 0.006, s);
    float riceCover = planted * mix(0.12, 0.97, g) * (1.0 - cutT);
    float stubble = cutT * 0.35 * (1.0 - smoothstep(0.9, 1.0, s));
    // (the nursery bed: dense seedlings, sown early, pulled for planting out)
    float bed = vRow.y * smoothstep(0.062, 0.08, s) * (1.0 - smoothstep(vPd.z - 0.012, vPd.z + 0.002, s));
    riceCover = max(riceCover, bed * 0.85);
    vec3 riceCol = mix(pdRiceCol(0.7, g, s), uSeedling, bed);
    vec3 stubCol = mix(uStraw, uStrawOld, smoothstep(vPd.y + 0.03, vPd.y + 0.2, s));

    // Water: ripples running downwind (stronger in the wind), rain rings, the sky mirrored.
    vec2 flow = uWindDir * (0.25 + 1.2 * uWind);
    vec3 r1 = wNoiseD(p * 0.9 - flow * uTime * 0.9);
    vec3 r2 = wNoiseD(p * 2.3 + 7.0 - flow * uTime * 1.6);
    float amp = (0.025 + 0.14 * uWind) * (1.0 - 0.6 * far);
    vec2 slope = (r1.yz * 0.6 + r2.yz * 0.4) * amp;
    if (uRain > 0.001) {
      vec3 rr = rainRings(p, uTime, uRain) * (1.0 - smoothstep(30.0, 100.0, dist));
      slope += rr.xy * 0.45;
    }
    vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
    wN = normalize(mix(vec3(0.0, 1.0, 0.0), N, wWater));
    vec3 V = normalize(cameraPosition - vWPos);
    vec3 R = reflect(-V, wN);
    // The sky it mirrors: horizon to zenith, the glow round the sun or moon, and clouds where the ray meets a deck 300 m up.
    float ry = max(R.y, 0.0);
    vec3 sky = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.85, ry), 0.6));
    sky += uGlow * pow(max(dot(R, uGlowDir), 0.0), 5.0);
    vec2 cp = p + R.xz / max(ry, 0.06) * 300.0;
    float cn = wNoise(cp * 0.004 + uTime * 0.003) * 0.6 + wNoise(cp * 0.011 + 3.0) * 0.4;
    float cl = smoothstep(0.66 - 0.35 * uCloudCover, 0.88, cn);
    wRefl = mix(sky, uCloud, cl * 0.65);
    // The sun's or moon's disc and a path of glitter toward it on the ripples.
    float gl = smoothstep(0.55, 0.9, wNoise(p * 3.7 - flow * uTime * 2.0 + 51.0));
    float ds = max(dot(R, uSunDir), 0.0);
    float dm = max(dot(R, uMoonDir), 0.0);
    wRefl += (uSunCol * (pow(ds, 400.0) * 5.0 + pow(ds, 40.0) * gl * 1.2) + uMoonCol * (pow(dm, 400.0) * 5.0 + pow(dm, 40.0) * gl * 1.5)) * (1.0 - cl * 0.8);
    // (the rice hides the water, more so from afar)
    float hide = max(riceCover * mix(0.55, 0.95, far), bed * 0.9);
    wFres = (0.25 + 0.75 * pow(1.0 - max(dot(wN, V), 0.0), 3.0)) * wWater * (1.0 - hide) * (1.0 - 0.35 * uRain);
    float sp = wNoise(p * 3.1 - flow * uTime * 1.3 + 31.0);
    wSpark = smoothstep(0.62, 0.9, sp) * wWater * (1.0 - hide);

    // Under water the mud is darker and greener; under the rice darker still (up close) or rice-coloured (afar).
    vec3 col = mix(earth, earth * vec3(0.55, 0.6, 0.5), wWater);
    col *= 1.0 - 0.45 * riceCover * (1.0 - far);
    col = mix(col, riceCol * 0.82, riceCover * far);
    col = mix(col, stubCol * 0.9, stubble * mix(0.3, 1.0, far));
    diffuseColor.rgb = col;
  }`;

/** The skin's material: lit, shadowed and fogged like the map; matte earth, glossy water. */
export function groundMaterial(season: { value: number }): { material: MeshStandardMaterial; uniforms: GroundUniforms } {
  const uniforms: GroundUniforms = {
    uSeason: season,
    uTime: { value: 0 },
    uWet: { value: 0 },
    uRain: { value: 0 },
    uWind: { value: 0 },
    uWindDir: { value: new Vector2(0, 1) },
    uHorizon: { value: new Color() },
    uZenith: { value: new Color() },
    uGlow: { value: new Color() },
    uGlowDir: { value: new Vector3(0, 0, -1) },
    uCloud: { value: new Color() },
    uCloudCover: { value: 0.4 },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunCol: { value: new Color(0) },
    uMoonDir: { value: new Vector3(0, 1, 0) },
    uMoonCol: { value: new Color(0) },
    uLightDirW: { value: new Vector3(0, 1, 0) },
    uSparkle: { value: 6 },
    uDry: { value: new Color(GROUND_COLORS.dry) },
    uCrack: { value: new Color(GROUND_COLORS.crack) },
    uMud: { value: new Color(GROUND_COLORS.mud) },
    uFurrow: { value: new Color(GROUND_COLORS.furrow) },
  };
  const rice = riceColorUniforms();
  const material = new MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  material.name = 'paddies:ground';
  // (a hair in front of the land under it, however far away)
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -2;
  material.customProgramCacheKey = () => 'map-paddies-ground-v1';
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms, rice);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERTEX_PARS}`).replace('#include <begin_vertex>', VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}\n${RICE_COLOR_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(roughness, 0.12, wWater * (1.0 - 0.5 * uRain));')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.directSpecular *= (1.0 + wSpark * uSparkle) * wWater;\n  reflectedLight.indirectSpecular *= wWater;')
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(totalDiffuse + totalEmissiveRadiance, wRefl, wFres) + totalSpecular;\n#include <opaque_fragment>');
  };
  return { material, uniforms };
}

/** The floor mesh (receives shadows; casts none). */
export function buildGround(field: HeightField, plots: PlotPlan[], season: { value: number }): { mesh: Mesh; uniforms: GroundUniforms; cells: number } {
  const geo = buildGroundGeometry(field, plots);
  const { material, uniforms } = groundMaterial(season);
  const mesh = new Mesh(geo, material);
  mesh.name = 'paddies:ground';
  mesh.receiveShadow = true;
  return { mesh, uniforms, cells: (geo.index?.count ?? 0) / 6 };
}
