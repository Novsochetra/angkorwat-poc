import { ShaderChunk, ShaderLib, UniformsLib, type Color, type Texture, type Vector3 } from 'three';

/**
 * The map's haze, in every material: three's fog chunks are replaced once
 * (before any material compiles) with
 *  - aerial perspective: distance haze, `1 − exp(−((d − fogNear) / fogFar)^1.4)`,
 *    tinted towards the sun (or moon) where you look that way;
 *  - height fog: mist that pools in the low valleys (exponential in height,
 *    integrated along the view ray, so it thickens with depth of low ground).
 *
 * `scene.fog` is a plain `Fog`: its colour is the haze away from the sun,
 * `near` where haze starts, `far` the distance of about 63 % haze.
 * The extra values live in {@link HAZE} and reach every built-in material
 * through shared uniform objects (three copies numbers and Vector3s per
 * material, but not these plain objects, so one write updates all).
 *
 * A custom `ShaderMaterial` with `fog: true` gets the same haze when its
 * uniforms include `UniformsLib.fog` (e.g. `UniformsUtils.merge([UniformsLib.fog, …])`
 * or `{ ...UniformsLib.fog, … }`) and it includes the four fog chunks. Without
 * the extras it still gets the distance haze (the extra terms read as zero).
 */

/** A vec3 uniform value shared by every material (three clones Vector3 / Color values, not this). */
export class Shared3 {
  x = 0;
  y = 0;
  z = 0;
  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  fromColor(c: Color): this {
    return this.set(c.r, c.g, c.b);
  }
  fromVector(v: Vector3): this {
    return this.set(v.x, v.y, v.z);
  }
}

export class Shared4 extends Shared3 {
  w = 0;
}

/** Haze values beyond `scene.fog` (linear colours), written by the atmosphere each frame. */
export const HAZE = {
  /** Direction towards the glow in the haze (the visible sun, or the moon), unit. */
  sunDir: new Shared3(),
  /** Haze colour looking straight at the sun (blends in around it). */
  sunColor: new Shared3(),
  /** Colour of the valley mist in shade. */
  lowColor: new Shared3(),
  /** Colour of the sunlit tops of the mist banks. */
  mistLit: new Shared3(),
  /** Towards the key light (the mist banks are lit from that side). */
  keyDir: new Shared3(),
  /** Height fog: (base height m, scale height m, density per m at the base, max amount 0‥1). */
  height: new Shared4(),
  /** Mist banks: (time s, 1 / bank size (1/m), mound height m, coverage 0‥1 — higher = fewer banks). */
  mist: new Shared4(),
  /** The land map (see mist.ts): its place, (x0, z0, 1 / width, 1 / depth). */
  landBounds: new Shared4(),
};

const EXTRA_UNIFORMS: Record<string, { value: unknown }> = {
  hazeSunDir: { value: HAZE.sunDir },
  hazeSunColor: { value: HAZE.sunColor },
  hazeLowColor: { value: HAZE.lowColor },
  hazeMistLit: { value: HAZE.mistLit },
  hazeKeyDir: { value: HAZE.keyDir },
  hazeHeight: { value: HAZE.height },
  hazeMist: { value: HAZE.mist },
  hazeLandBounds: { value: HAZE.landBounds },
  hazeNoise: { value: null },
  hazeLand: { value: null },
};

/** GLSL: uniform declarations of the haze (fog uniforms included). */
export const HAZE_PARS = /* glsl */ `
uniform vec3 fogColor;
uniform vec3 hazeSunDir;
uniform vec3 hazeSunColor;
uniform vec3 hazeLowColor;
uniform vec3 hazeMistLit;
uniform vec3 hazeKeyDir;
uniform vec4 hazeHeight;
uniform vec4 hazeMist;
uniform vec4 hazeLandBounds;
uniform sampler2D hazeNoise;
uniform sampler2D hazeLand;
#ifdef FOG_EXP2
  uniform float fogDensity;
#else
  uniform float fogNear;
  uniform float fogFar;
#endif
`;

/** GLSL: haze functions (need {@link HAZE_PARS}). */
export const HAZE_FUNCS = /* glsl */ `
// Share of the haze colour at distance d (m).
float hazeDistance(float d) {
  #ifdef FOG_EXP2
    return 1.0 - exp(-fogDensity * fogDensity * d * d);
  #else
    float t = max(d - fogNear, 0.0) / max(fogFar, 1.0);
    return 1.0 - exp(-pow(t, 1.4));
  #endif
}
// Glow of the sun (or moon) in the haze, looking along dir: 0‥1.
float hazeSunAmount(vec3 dir) {
  float mu = max(dot(dir, hazeSunDir), 0.0);
  return 0.55 * pow(mu, 5.0) + 0.45 * pow(mu, 24.0);
}
// Haze colour seen along dir.
vec3 hazeColorDir(vec3 dir) {
  return mix(fogColor, hazeSunColor, hazeSunAmount(dir));
}
// How near the side and back edges of the land (0 inside, 1 at the edge and beyond).
float hazeEdge(vec2 xz) {
  vec2 uv = (xz - hazeLandBounds.xy) * hazeLandBounds.zw;
  float inner = min(min(uv.x, 1.0 - uv.x) / max(hazeLandBounds.z, 1e-6), uv.y / max(hazeLandBounds.w, 1e-6));
  return 1.0 - smoothstep(10.0, 150.0, inner);
}
float hazeBankNoise(vec2 p, vec2 drift) {
  return texture2D(hazeNoise, p + drift).r * 0.6 + texture2D(hazeNoise, p * 2.7 - drift * 1.7 + 0.37).a * 0.4;
}
// Mist banks over a map point: x = thickness 0‥1, y = sunlit 0‥1 (the side
// of a bank towards the key light is bright, the far side in shade).
vec2 hazeBanks(vec2 xz) {
  vec2 p = xz * hazeMist.y;
  vec2 drift = vec2(hazeMist.x * 0.0021, hazeMist.x * 0.0008);
  float n = hazeBankNoise(p, drift);
  vec2 k = hazeKeyDir.xz;
  vec2 l = k / max(length(k), 1e-3) * 16.0 * hazeMist.y;
  float nl = hazeBankNoise(p + l, drift);
  vec2 uv = (xz - hazeLandBounds.xy) * hazeLandBounds.zw;
  float edge = hazeEdge(xz);
  float allow = mix(texture2D(hazeLand, clamp(uv, vec2(0.001), vec2(0.999))).g, 1.0, edge);
  float cov = hazeMist.w - edge * 0.32;
  float m = smoothstep(cov - 0.16, cov + 0.24, n) * allow;
  return vec2(m, clamp(0.5 + (nl - n) * 6.0, 0.0, 1.0));
}
// Share of valley mist between the eye (height ye) and a point (height yp), d
// apart, where the banks there are m thick (they rise as mounds).
float hazeHeightAmount(float ye, float yp, float d, float m) {
  float H = max(hazeHeight.y, 1.0);
  float base = hazeHeight.x + m * hazeMist.z;
  float a = ye - base;
  float b = max(yp - base, -3.0 * H);
  float ea = exp(-max(a, -3.0 * H) / H);
  float eb = exp(-b / H);
  float dy = b - a;
  float od = abs(dy) > 0.05 ? (ea - eb) * H / dy : ea;
  float density = hazeHeight.z * (0.1 + 0.9 * m);
  return min(1.0 - exp(-density * d * max(od, 0.0)), hazeHeight.w);
}
// Colour of the mist banks: sunlit tops, shaded sides, the sun's glow in the haze.
vec3 hazeMistColor(vec2 bank, vec3 hazeCol) {
  return mix(hazeLowColor, hazeMistLit, bank.y * (0.35 + 0.65 * bank.x)) + (hazeCol - fogColor) * 0.5;
}
`;

const FOG_PARS_VERTEX = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif
`;

const FOG_VERTEX = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  // World position of the vertex (the view matrix is a rotation and a move).
  vFogWorld = cameraPosition + mvPosition.xyz * mat3( viewMatrix );
#endif
`;

const FOG_PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
  ${HAZE_PARS}
  ${HAZE_FUNCS}
#endif
`;

const FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  vec3 hzRay = vFogWorld - cameraPosition;
  float hzDist = length(hzRay);
  vec3 hzDir = hzRay / max(hzDist, 1e-3);
  vec3 hzCol = hazeColorDir(hzDir);
  // Valley mist first (it lies in front of the far land), then the distance haze over all.
  vec2 hzBank = hazeBanks(vFogWorld.xz);
  float hzLow = hazeHeightAmount(cameraPosition.y, vFogWorld.y, hzDist, hzBank.x);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeMistColor(hzBank, hzCol), hzLow);
  float fogFactor = hazeDistance(hzDist);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, hzCol, fogFactor);
#endif
`;

let installed = false;

/**
 * Put the haze into three's fog chunks and give every built-in material the
 * extra uniforms. Call once, before any material compiles.
 * @param noise tiling noise for the mist banks (sky/noise.ts)
 * @param land the land map (sky/mist.ts): ground height and where mist may lie
 */
export function installHaze(noise: Texture, land: Texture): void {
  EXTRA_UNIFORMS.hazeNoise.value = noise;
  EXTRA_UNIFORMS.hazeLand.value = land;
  if (installed) return;
  installed = true;
  ShaderChunk.fog_pars_vertex = FOG_PARS_VERTEX;
  ShaderChunk.fog_vertex = FOG_VERTEX;
  ShaderChunk.fog_pars_fragment = FOG_PARS_FRAGMENT;
  ShaderChunk.fog_fragment = FOG_FRAGMENT;
  Object.assign(UniformsLib.fog, EXTRA_UNIFORMS);
  for (const shader of Object.values(ShaderLib) as { uniforms: Record<string, unknown> }[])
    if (shader.uniforms && 'fogColor' in shader.uniforms) Object.assign(shader.uniforms, EXTRA_UNIFORMS);
}

/** The haze uniforms for a custom ShaderMaterial (`fogColor`, `fogNear`, `fogFar` are filled by three when `fog: true`). */
export function hazeUniforms(): Record<string, { value: unknown }> {
  return { ...UniformsLib.fog, ...EXTRA_UNIFORMS } as Record<string, { value: unknown }>;
}

/** The haze uniforms for a material without scene fog (sky, far backdrop): its own fog colour, near and far (copy them in each frame). */
export function hazeOwnUniforms(): Record<string, { value: unknown }> {
  return { ...EXTRA_UNIFORMS, fogColor: { value: null }, fogNear: { value: 0 }, fogFar: { value: 1 } };
}
