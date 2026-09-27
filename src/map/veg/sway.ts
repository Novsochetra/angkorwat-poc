import { Vector2, Vector4, type InstancedMesh, type Material, type Object3D, type Texture, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { getVoxelMaterial } from '../../voxel/materials';
import { getVoxelDepthMaterial } from '../../voxel/shadow';
import type { HeightField } from '../heightfield';
import { buildLandMap } from '../sky/mist';
import type { MapFrame } from '../types';

/**
 * Leaves in the wind: every leaf block of the jungle (and the undergrowth,
 * veg/undergrowth.ts) is moved a little in the vertex shader. A tiny calm
 * rock is always there; with `f.weather.wind` (0‥1) the crowns lean toward
 * `windDir`, rock more and gusts roll across the canopy with the wind.
 * Higher leaves move more (height over the ground, from the land map the
 * mist reads: sky/mist.ts); trunks and branches (bark) do not move.
 *
 * The offset is a smooth field of the world point (not per block), so
 * neighbouring blocks move together: no cracks open, a crown sways as one,
 * the next crown a little out of step. The shadow casters get the same
 * offset (`customDepthMaterial`), so a leaf never falls into its own shadow;
 * the shadow map is redrawn every third frame, a few centimetres behind in
 * a strong wind at most.
 *
 * Cost: one texture read and a few sines per leaf vertex; no draw calls, no
 * per-frame work on the CPU but three uniforms.
 */

/** Shared uniforms of every swaying material (one write moves them all). */
export const SWAY = {
  /** Clock of the sway (s): runs faster in the wind, never jumps. */
  uSwayTime: { value: 0 },
  /** Wind strength 0‥1. */
  uSwayWind: { value: 0 },
  /** Where the wind blows to (x, z), unit. */
  uSwayDir: { value: new Vector2(0, 1) },
  /** Land map: ground height (r) per 4 m texel, and its place (x0, z0, 1 / width, 1 / depth). */
  uSwayLand: { value: null as Texture | null },
  uSwayLandBounds: { value: new Vector4() },
};

/**
 * GLSL (vertex): `swayAt(p)` the wind's offset (world x, z, m) of a point
 * with unit weight; `swayGround(xz)` the ground height there.
 */
export const SWAY_GLSL = /* glsl */ `
uniform float uSwayTime;
uniform float uSwayWind;
uniform vec2 uSwayDir;
uniform sampler2D uSwayLand;
uniform vec4 uSwayLandBounds;
float swayGround(vec2 xz) {
  vec2 uv = (xz - uSwayLandBounds.xy) * uSwayLandBounds.zw;
  return texture2D(uSwayLand, clamp(uv, vec2(0.001), vec2(0.999))).r;
}
vec2 swayAt(vec3 p) {
  // Phase: smooth over the land (a crown moves as one, its neighbour out of step).
  float ph = sin(p.x * 0.13 + p.z * 0.07) * 1.7 + sin(p.z * 0.11 - p.x * 0.05) * 1.3 + dot(p.xz, vec2(0.021, 0.017));
  float t = uSwayTime;
  float w = uSwayWind;
  vec2 across = vec2(-uSwayDir.y, uSwayDir.x);
  // A slow rock, mostly along the wind.
  float rock = sin(t * 1.3 + ph) + 0.35 * sin(t * 2.3 + ph * 1.7);
  float roll = sin(t * 0.9 + ph * 1.2 + 1.3);
  vec2 d = (uSwayDir * rock + across * roll * 0.6) * (0.035 + 0.1 * w);
  // In the wind: a lean downwind, and gusts rolling over the canopy with it.
  float gust = 0.5 + 0.5 * sin(t * 0.55 - dot(p.xz, uSwayDir) * 0.045 + ph * 0.25);
  d += uSwayDir * w * (0.08 + 0.15 * gust);
  return d;
}
`;

/** The tree leaves' offset, before `project_vertex` (voxel blocks: moved in their own unscaled space). */
const LEAF_SWAY = /* glsl */ `
float swGone = 0.0;
#ifdef USE_INSTANCING
{
  vec3 swW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  // Higher leaves move more: 1 at 10 m over the ground, at most 1.6.
  float swK = clamp((swW.y - swayGround(swW.xz)) * 0.1, 0.0, 1.6);
  vec3 swS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  transformed.xz += swayAt(swW) * swK / swS.xz;
  #ifdef SW_CUT
  vec3 swA = abs(normal);
  if (min(min(abs(position.x), abs(position.y)), abs(position.z)) > 0.499 && normal.y > -0.5) {
    int swSide = swA.x > 0.5 ? (normal.x > 0.0 ? 1 : 2) : swA.y > 0.5 ? 4 : (normal.z > 0.0 ? 16 : 32);
    swGone = (int(voxOpen + 0.5) & swSide) == 0 ? 1.0 : 0.0;
  }
  #endif
}
#endif
#include <project_vertex>
if (swGone > 0.5) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);`;

/**
 * The same, and on plain boxes (the low level; far trees) the sides of a
 * leaf block that lie against the next block (not open: the jungle
 * lattice's neighbours, veg/lattice.ts, exact) are drawn as nothing: their
 * corners go out of the clip volume, so the GPU drops their triangles
 * before it sets them up (half the leaves' sides; the sway moves neighbours
 * together, no crack opens). A plain box's corners are its own for each
 * side (and sit at ±0.5 on every axis). Not on the chamfered blocks: the
 * groove between two neighbours' cut edges would open onto the sky there.
 * Undersides stay: under a crown the cells left out close the holes with
 * them. The shadow caster does the same (a covered side is never the
 * crown's outside, which is what casts).
 */
const LEAF_SWAY_CUT = `#define SW_CUT\n${LEAF_SWAY}`;

let owner: string | null = null;
/** The frame's `drift` clock at the last step (NaN: not started). */
let lastDrift = NaN;

/** Point the shared uniforms at the land map (once per page). */
export function swayLand(field: HeightField): void {
  if (SWAY.uSwayLand.value) return;
  const land = buildLandMap(field);
  SWAY.uSwayLand.value = land.texture;
  SWAY.uSwayLandBounds.value.copy(land.bounds);
}

/**
 * Every frame, from the parts that sway (the first one to call keeps the
 * clock; the others' calls do nothing). The sway runs on `f.drift`, so it
 * stands still with the "reduce motion" setting, like the mist and clouds.
 */
export function stepWind(f: MapFrame, part: string): void {
  owner ??= part;
  if (owner !== part) return;
  const w = Math.min(1, Math.max(0, f.weather.wind));
  const speed = 1 + 0.8 * w;
  // (a still starts where the clock would be at its time)
  if (Number.isNaN(lastDrift)) SWAY.uSwayTime.value = f.drift * speed;
  else SWAY.uSwayTime.value += Math.max(0, f.drift - lastDrift) * speed;
  lastDrift = f.drift;
  SWAY.uSwayWind.value = w;
  SWAY.uSwayDir.value.set(Math.sin(f.weather.windDir), Math.cos(f.weather.windDir));
}

/**
 * A copy of a voxel material that sways. It runs its original's shader
 * changes at compile time (so the ones added later, like the near fade of
 * roam/_nearFade.ts, reach it too) and then its own.
 */
function swayCopy(base: Material, vertex: string, tag: string): Material {
  const m = base.clone();
  m.defines = base.defines && { ...base.defines };
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => {
    base.onBeforeCompile.call(base, shader, renderer);
    Object.assign(shader.uniforms, SWAY);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${SWAY_GLSL}`).replace('#include <project_vertex>', vertex);
  };
  m.customProgramCacheKey = () => `${base.customProgramCacheKey.call(base)}|${tag}`;
  m.name = `${base.name}:${tag}`;
  return m;
}

const leaves = new Map<string, { material: Material; depth: Material }>();

/** The swaying leaf material and its shadow caster (made once each, shared by every leaf mesh); `cut`: covered sides drawn as nothing. */
function leafMaterials(cut: boolean): { material: Material; depth: Material } {
  const tag = cut ? 'sway-cut' : 'sway';
  let m = leaves.get(tag);
  if (!m) {
    const glsl = cut ? LEAF_SWAY_CUT : LEAF_SWAY;
    leaves.set(tag, (m = { material: swayCopy(getVoxelMaterial('mapLeaf'), glsl, tag), depth: swayCopy(getVoxelDepthMaterial('mapLeaf'), glsl, tag) }));
  }
  return m;
}

/**
 * Let every leaf block under `root` sway (its `mapLeaf` meshes get the
 * swaying material). `cut`: their blocks' `open` sides are exact (every side
 * not open lies against another block, drawn or inside the crown), and the
 * rest are left out (the jungle's lattice).
 */
export function swayLeaves(root: Object3D, field: HeightField, cut = false): void {
  swayLand(field);
  const { material, depth } = leafMaterials(cut);
  root.traverse((o) => {
    const mesh = o as InstancedMesh;
    if (!mesh.isInstancedMesh || !mesh.name.endsWith(':mapLeaf')) return;
    mesh.material = material;
    mesh.customDepthMaterial = depth;
  });
}
