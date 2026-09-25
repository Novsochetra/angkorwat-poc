import { Vector3, type Material, type Mesh, type Object3D, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { getVoxelMaterial } from '../../voxel/materials';

/**
 * Near fade: what stands in front of the follow camera, between it and the
 * explorer, dissolves in a fine dither (a screen door), so the view always
 * finds him: tree crowns and trunks (the map's leaf and bark blocks, on
 * every part), a parked hang glider and its ramp.
 *
 * The cleared room is a tube from the camera to him: wide at the camera
 * (whatever the camera stands in goes), narrow at him (a window round him),
 * ending just short of him; its sides dither out softly. Each pixel works it
 * out from his point (world) and the camera the scene is drawn with (never
 * in an orthographic picture). It is off in the overview and in the photo
 * views (`followNearFade`).
 *
 * Cheap: a few sums per pixel of those materials while roaming (in the
 * overview one uniform skips it); no draw calls, one shader variant per
 * family, built once. Shadows come from the depth materials, so a faded
 * crown still shades the ground.
 */

/** The cleared tube (m): its radius at the camera and at him, how softly its sides dither out, and how far short of his chest it ends (and how softly). */
const TUBE = { camera: 3, him: 1.7, soft: 0.8, end: 0.3, endSoft: 0.4 };
/** How fast the fade comes on while roaming (1/s). */
const EASE = 4;

/** Shared by every faded material: his point (world) and how strongly the tube clears (0‥1). */
const uniforms = { uNearFocus: { value: new Vector3() }, uNearFade: { value: 0 } };

const f = (v: number) => v.toFixed(2);
const PARS = /* glsl */ `
uniform vec3 uNearFocus;
uniform float uNearFade;
// A 4 × 4 ordered dither of the pixel (0‥15/16).
float nearBayer(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float nearDither(vec2 p) { return nearBayer(0.5 * p) * 0.25 + nearBayer(p); }`;
const MAIN = /* glsl */ `
if (uNearFade > 0.0 && !isOrthographic) {
  // Him in view space (the camera at 0), and how far along the line to him this point is, and off it.
  vec3 nearTo = (viewMatrix * vec4(uNearFocus, 1.0)).xyz;
  float nearLen = max(length(nearTo), 0.001);
  vec3 nearDir = nearTo / nearLen;
  vec3 nearP = -vViewPosition;
  float nearAlong = dot(nearP, nearDir);
  float nearOff = length(nearP - nearDir * nearAlong);
  float nearR = mix(${f(TUBE.camera)}, ${f(TUBE.him)}, clamp(nearAlong / nearLen, 0.0, 1.0));
  float nearK = step(0.0, nearAlong) * (1.0 - smoothstep(nearR - ${f(TUBE.soft)}, nearR, nearOff))
    * (1.0 - smoothstep(nearLen - ${f(TUBE.end + TUBE.endSoft)}, nearLen - ${f(TUBE.end)}, nearAlong));
  if (nearK * uNearFade > nearDither(gl_FragCoord.xy) + 0.02) discard;
}`;

/**
 * Let the near fade reach the map's leaves and bark (every part's: only the
 * map draws them) and everything lit under `props` (the ramps and their
 * parked gliders: they get their own copies of their materials, as they
 * share them with the explorer and the glider he flies). Once, at build.
 */
export function installNearFade(props: Object3D): void {
  for (const key of ['mapLeaf', 'mapBark'] as const) addFade(getVoxelMaterial(key));
  const copies = new Map<Material, Material>();
  props.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const m = mesh.material;
    // (lit blocks and the sail's flags; not lights, lines, or the ramp flag: its glow is set every frame)
    if (m.userData.nearFade || !('isMeshStandardMaterial' in m) || !(m.name.startsWith('voxel:') || m.name === 'flag')) return;
    let c = copies.get(m);
    if (!c) {
      c = m.clone();
      c.defines = m.defines && { ...m.defines };
      c.onBeforeCompile = m.onBeforeCompile;
      c.customProgramCacheKey = m.customProgramCacheKey;
      addFade(c);
      copies.set(m, c);
    }
    mesh.material = c;
  });
}

/**
 * Every frame: the explorer's point while the follow camera shows him (the
 * fade comes on softly), or null (the overview, the leap: off at once, the
 * view is dark when he leaves). `amount` holds it lower: 0 in a photo view
 * (a photo shows what is there; the phone keeps its own lens clear).
 */
export function followNearFade(focus: Vector3 | null, dt: number, amount = 1): void {
  const u = uniforms.uNearFade;
  if (!focus) {
    u.value = 0;
    return;
  }
  uniforms.uNearFocus.value.copy(focus);
  u.value = Math.min(amount, u.value + (1 - u.value) * (1 - Math.exp(-EASE * dt)));
}

/** Add the fade to a material's shader (after its own changes). */
function addFade(m: Material): void {
  if (m.userData.nearFade) return;
  m.userData.nearFade = true;
  const compile = m.onBeforeCompile;
  const key = m.customProgramCacheKey;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => {
    compile.call(m, shader, renderer);
    shader.uniforms.uNearFocus = uniforms.uNearFocus;
    shader.uniforms.uNearFade = uniforms.uNearFade;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${PARS}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>${MAIN}`);
  };
  m.customProgramCacheKey = () => `${key.call(m)}|near-fade`;
  m.needsUpdate = true;
}
