import { ShaderChunk, ShaderLib, UniformsLib, type Color, type Texture, type Vector3 } from 'three';

/**
 * The map's haze, in every material: three's fog chunks are replaced once
 * (before any material compiles) with
 *  - aerial perspective: distance haze, `1 − exp(−((d − fogNear) / fogFar)^1.4)`,
 *    tinted towards the sun (or moon) where you look that way;
 *  - height fog: mist that pools in the low valleys (exponential in height,
 *    integrated along the view ray, so it thickens with depth of low ground).
 *    Its banks are alive: they drift with {@link WIND}, roll (bent by slow
 *    swirls) and breathe. Seen from low down (roaming) it keeps clear near
 *    the eye and builds up further off;
 *  - wisps between the mesas: a thin streaky layer ≈ 27 m up, over low ground;
 *  - cloud shadows: soft darker patches drifting over the land by day.
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
  /**
   * Cloud shadows drifting over the land: (darkening 0‥1, 1 / patch size
   * (1/m), cover 0‥1 — higher = fewer, unused). Written by the clouds part
   * (0 = none, e.g. at night or while it is not built).
   */
  shade: new Shared4(),
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
  hazeShade: { value: HAZE.shade },
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
uniform vec4 hazeShade;
uniform sampler2D hazeNoise;
uniform sampler2D hazeLand;
#ifdef FOG_EXP2
  uniform float fogDensity;
#else
  uniform float fogNear;
  uniform float fogFar;
#endif
`;

/**
 * Where the mist drifts (world xz, unit): west and a little north, away from
 * the overview camera, like the sky's clouds. Every mist (valley mist, sea of
 * mist, banks) and the cloud shadows go this way.
 */
export const WIND = { x: -0.94, z: -0.342 };

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
// Metres inside the side and back edges of the land (negative beyond them).
float hazeInside(vec2 xz) {
  vec2 uv = (xz - hazeLandBounds.xy) * hazeLandBounds.zw;
  return min(min(uv.x, 1.0 - uv.x) / max(hazeLandBounds.z, 1e-6), uv.y / max(hazeLandBounds.w, 1e-6));
}
// How near the side and back edges of the land (0 inside, 1 at the edge and beyond).
float hazeEdge(vec2 xz) {
  return 1.0 - smoothstep(10.0, 150.0, hazeInside(xz));
}
// Where the mist drifts (world xz, unit); the sky's clouds go the same way.
const vec2 HAZE_WIND = vec2(${WIND.x.toFixed(4)}, ${WIND.z.toFixed(4)});
// Slow swirls (−0.5‥0.5 each) that bend the mist, so the banks roll and
// change shape as they drift instead of only sliding. The swirls move across
// the wind. p in noise units, t in s.
vec2 hazeSwirl(vec2 p, float t) {
  return texture2D(hazeNoise, p * 0.35 + vec2(0.0016, -0.0042) * t).rg - 0.5;
}
// Bank noise 0‥1 at p; drift = how far the wind has carried it (noise units):
// the fine part is carried faster than the big shapes, so they change.
float hazeBankNoise(vec2 p, vec2 drift) {
  return texture2D(hazeNoise, p - drift).r * 0.6 + texture2D(hazeNoise, p * 2.7 - drift * 4.0 + 0.37).a * 0.4;
}
// Mist banks over a map point: x = thickness 0‥1, y = sunlit 0‥1 (the side
// of a bank towards the key light is bright, the far side in shade).
vec2 hazeBanks(vec2 xz) {
  float t = hazeMist.x;
  vec2 p = xz * hazeMist.y;
  vec2 sw = hazeSwirl(p, t);
  p += sw * 0.35;
  // (about 2 m/s: calm, but it moves while you watch)
  vec2 drift = HAZE_WIND * (t * 2.0 * hazeMist.y);
  float n = hazeBankNoise(p, drift);
  vec2 k = hazeKeyDir.xz;
  vec2 l = k / max(length(k), 1e-3) * 16.0 * hazeMist.y;
  float nl = hazeBankNoise(p + l, drift);
  vec2 uv = (xz - hazeLandBounds.xy) * hazeLandBounds.zw;
  float edge = hazeEdge(xz);
  float allow = mix(texture2D(hazeLand, clamp(uv, vec2(0.001), vec2(0.999))).g, 1.0, edge);
  // Breathing: the banks swell and thin by turns (≈ 20 s), out of step from place to place.
  float cov = hazeMist.w - edge * 0.32 + 0.06 * sin(t * 0.3 + sw.x * 18.0);
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
// Valley mist between the eye and a point d apart (as hazeHeightAmount). Seen
// from low down (roaming the valleys) the first ~100 m of the ray stay clear
// and the mist builds up further off, so the explorer is not lost in it; from
// high up (the overview, gliding) nothing changes.
float hazeLowAmount(vec3 eye, vec3 p, float d, float m) {
  float low = 1.0 - smoothstep(14.0, 45.0, eye.y - hazeHeight.x);
  if (low <= 0.0) return hazeHeightAmount(eye.y, p.y, d, m);
  float clear = 110.0 * low;
  float skip = clear * (1.0 - exp(-d / clear));
  float ye = mix(eye.y, p.y, skip / max(d, 1e-3));
  return hazeHeightAmount(ye, p.y, (d - skip) * (1.0 - 0.6 * low), m);
}
// Wisps between the mesas: a thin layer of streaky mist ≈ 20–34 m up (over
// the valley trees, below the high mesa tops), carried by the wind faster
// than the valley mist under it (≈ 4 m/s), only over low open ground. How
// much of it lies between the eye and p (d apart), 0‥1: found where the ray
// crosses the layer, so it floats at its height and never cuts anything.
float hazeWisps(vec3 eye, vec3 p, float d) {
  // Share of the layer the ray passes through.
  float thru = abs(smoothstep(20.0, 34.0, p.y) - smoothstep(20.0, 34.0, eye.y));
  if (thru < 0.02) return 0.0;
  float k = clamp((27.0 - eye.y) / (p.y - eye.y), 0.0, 1.0);
  vec3 c = eye + (p - eye) * k;
  // Soft wisps, drawn out along the wind, their edges billowing.
  vec2 w = vec2(dot(c.xz, HAZE_WIND), dot(c.xz, vec2(-HAZE_WIND.y, HAZE_WIND.x)));
  vec2 q = vec2((w.x - hazeMist.x * 4.0) / 240.0, w.y / 120.0);
  float n = texture2D(hazeNoise, q).r * 0.65 + texture2D(hazeNoise, q * vec2(2.1, 2.6) + vec2(hazeMist.x * 0.004, 0.37)).a * 0.35;
  float s = smoothstep(0.52, 0.85, n);
  // Over low ground clear of the road and the places, and not right at the eye.
  vec2 uv = (c.xz - hazeLandBounds.xy) * hazeLandBounds.zw;
  vec2 land = texture2D(hazeLand, clamp(uv, vec2(0.001), vec2(0.999))).rg;
  return s * thru * smoothstep(18.0, 10.0, land.x) * land.y * smoothstep(40.0, 130.0, d * k);
}
// Cloud shadows: soft darker patches drifting over the land (1 = none).
float hazeCloudShade(vec3 p) {
  if (hazeShade.x <= 0.0) return 1.0;
  // Where the ray towards the key light meets the clouds (≈ 600 m up), carried by the wind.
  vec2 q = p.xz + hazeKeyDir.xz / max(hazeKeyDir.y, 0.25) * (600.0 - p.y);
  q = (q - HAZE_WIND * hazeMist.x * 6.0) * hazeShade.y;
  float n = texture2D(hazeNoise, q).r;
  return 1.0 - hazeShade.x * smoothstep(hazeShade.z, hazeShade.z + 0.3, n);
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
  #ifdef HAZE_MIST
    // Mist itself (sky/mist.ts): no cloud shadows, and the valley mist in
    // front of it even (per point it would streak the upright banks: their
    // points differ only across).
    vec2 hzBank = vec2(0.5);
  #else
    gl_FragColor.rgb *= hazeCloudShade(vFogWorld);
    vec2 hzBank = hazeBanks(vFogWorld.xz);
  #endif
  float hzLow = hazeLowAmount(cameraPosition, vFogWorld, hzDist, hzBank.x);
  #ifndef HAZE_MIST
    // Where the land sinks away at its side and back edges, the mist swallows
    // it whole (seen up close when roaming, the land's end never shows).
    hzLow = mix(hzLow, 1.0, (1.0 - smoothstep(40.0, 200.0, hazeInside(vFogWorld.xz))) * smoothstep(8.0, -6.0, vFogWorld.y));
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeMistColor(hzBank, hzCol), hzLow);
  #ifndef HAZE_MIST
    // Wisps between the mesas, drifting over the valley mist.
    float hzWisp = hazeWisps(cameraPosition, vFogWorld, hzDist);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeMistColor(vec2(1.0, 0.8), hzCol), hzWisp * 0.45);
  #endif
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
