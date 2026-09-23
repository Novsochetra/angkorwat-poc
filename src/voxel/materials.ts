import { Color, MeshBasicMaterial, MeshStandardMaterial, type Material } from 'three';

/**
 * Material "families" used by voxels. A family decides how a voxel is lit and how
 * its rounded edges look; the voxel's own colour comes from its per-instance colour.
 *
 * The reference renders show every block with a soft bevel whose edges catch a
 * warmer, lighter tone (orange rims on hair and leather, gold threads on the krama,
 * pale seams on the shirt). `edgeTint`/`edgeStrength` reproduce that, `bevel` is the
 * corner radius as a fraction of the block's smallest side and `grain` adds the
 * fine felt/clay speckle visible on the close-up sheet.
 */
export interface VoxelMaterialSpec {
  roughness: number;
  metalness: number;
  /** Corner radius relative to the smallest box side (0.5 = fully round). */
  bevel: number;
  edgeTint: number;
  edgeStrength: number;
  /** Width of the tinted rim across the bevel (0‥1, default 1 = whole outer bevel). */
  edgeWidth?: number;
  /** Brightness variation of the surface speckle (0 = none). */
  grain: number;
  /** Speckle cells per geometry unit. */
  grainScale: number;
  /** Unlit, self-coloured voxels (flames, lamp glass). */
  unlit?: boolean;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
}

export const VOXEL_MATERIALS = {
  // ── Character ────────────────────────────────────────────────────────────
  skin: { roughness: 0.7, metalness: 0, bevel: 0.075, edgeTint: 0xffcfa2, edgeStrength: 0.2, edgeWidth: 0.6, grain: 0.035, grainScale: 20 },
  hair: { roughness: 0.78, metalness: 0, bevel: 0.17, edgeTint: 0xae5f2e, edgeStrength: 0.5, edgeWidth: 1.0, grain: 0.16, grainScale: 26 },
  eye: { roughness: 0.35, metalness: 0, bevel: 0.1, edgeTint: 0x000000, edgeStrength: 0, grain: 0, grainScale: 1 },
  shirt: { roughness: 0.93, metalness: 0, bevel: 0.15, edgeTint: 0xfff6ea, edgeStrength: 0.3, edgeWidth: 0.7, grain: 0.08, grainScale: 22 },
  shorts: { roughness: 0.95, metalness: 0, bevel: 0.13, edgeTint: 0x80868c, edgeStrength: 0.4, edgeWidth: 0.6, grain: 0.1, grainScale: 22 },
  sock: { roughness: 0.95, metalness: 0, bevel: 0.14, edgeTint: 0xfff8ee, edgeStrength: 0.18, grain: 0.05, grainScale: 12 },
  krama: { roughness: 0.9, metalness: 0, bevel: 0.17, edgeTint: 0xf0a24c, edgeStrength: 0.5, edgeWidth: 0.6, grain: 0.1, grainScale: 22 },
  leather: { roughness: 0.66, metalness: 0, bevel: 0.13, edgeTint: 0xd48a45, edgeStrength: 0.55, edgeWidth: 0.6, grain: 0.14, grainScale: 26 },
  boot: { roughness: 0.64, metalness: 0, bevel: 0.13, edgeTint: 0xc97a3a, edgeStrength: 0.55, edgeWidth: 0.6, grain: 0.14, grainScale: 24 },
  metal: { roughness: 0.42, metalness: 0.35, bevel: 0.13, edgeTint: 0xd6d6d6, edgeStrength: 0.3, grain: 0.05, grainScale: 18 },
  brass: { roughness: 0.32, metalness: 0.75, bevel: 0.14, edgeTint: 0xffe2a0, edgeStrength: 0.35, grain: 0.03, grainScale: 18 },
  lens: { roughness: 0.12, metalness: 0.2, bevel: 0.12, edgeTint: 0x000000, edgeStrength: 0, grain: 0, grainScale: 1 },
  wood: { roughness: 0.8, metalness: 0, bevel: 0.14, edgeTint: 0xc98a52, edgeStrength: 0.35, grain: 0.09, grainScale: 12 },
  hat: { roughness: 0.92, metalness: 0, bevel: 0.14, edgeTint: 0xfff0d2, edgeStrength: 0.25, grain: 0.08, grainScale: 12 },
  glow: { roughness: 1, metalness: 0, bevel: 0.14, edgeTint: 0xffffff, edgeStrength: 0.25, grain: 0.04, grainScale: 10, unlit: true },
  // ── World (Angkor Wat sandstone kit) ─────────────────────────────────────
  stone: { roughness: 0.9, metalness: 0, bevel: 0.08, edgeTint: 0xe9d4ae, edgeStrength: 0.35, grain: 0.1, grainScale: 9 },
  darkstone: { roughness: 0.92, metalness: 0, bevel: 0.08, edgeTint: 0xa39580, edgeStrength: 0.3, grain: 0.1, grainScale: 9 },
  moss: { roughness: 0.95, metalness: 0, bevel: 0.12, edgeTint: 0xa6c46a, edgeStrength: 0.3, grain: 0.12, grainScale: 8 },
  foliage: { roughness: 0.9, metalness: 0, bevel: 0.14, edgeTint: 0xb5d67a, edgeStrength: 0.35, grain: 0.1, grainScale: 6 },
  bark: { roughness: 0.95, metalness: 0, bevel: 0.12, edgeTint: 0x9c7552, edgeStrength: 0.3, grain: 0.1, grainScale: 8 },
  ground: { roughness: 1, metalness: 0, bevel: 0.06, edgeTint: 0x9fbf66, edgeStrength: 0.2, grain: 0.12, grainScale: 3 },
} as const satisfies Record<string, VoxelMaterialSpec>;

export type VoxelMaterialKey = keyof typeof VOXEL_MATERIALS;

const cache = new Map<VoxelMaterialKey, Material>();

/**
 * Shared material for a voxel family. Adds (via shader injection):
 *  - a bevel-edge tint driven by the undeformed box normal,
 *  - a per-voxel speckle keyed on the instance position (stable under animation).
 */
export function getVoxelMaterial(key: VoxelMaterialKey): Material {
  const hit = cache.get(key);
  if (hit) return hit;
  const spec: VoxelMaterialSpec = VOXEL_MATERIALS[key];
  let material: Material;
  if (spec.unlit) {
    const m = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    injectVoxelShading(m, spec);
    material = m;
  } else {
    const m = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: spec.roughness,
      metalness: spec.metalness,
      transparent: spec.transparent ?? false,
      opacity: spec.opacity ?? 1,
    });
    if (spec.emissive !== undefined) {
      m.emissive = new Color(spec.emissive);
      m.emissiveIntensity = spec.emissiveIntensity ?? 1;
    }
    injectVoxelShading(m, spec);
    material = m;
  }
  material.name = `voxel:${key}`;
  cache.set(key, material);
  return material;
}

function injectVoxelShading(material: MeshStandardMaterial | MeshBasicMaterial, spec: VoxelMaterialSpec): void {
  const edgeTint = new Color(spec.edgeTint);
  const lit = !spec.unlit;
  if (lit) material.defines = { ...(material.defines ?? {}), VOX_LIT: '' };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uEdgeTint = { value: edgeTint };
    shader.uniforms.uEdgeStrength = { value: spec.edgeStrength };
    shader.uniforms.uEdgeWidth = { value: spec.edgeWidth ?? 1 };
    shader.uniforms.uGrain = { value: spec.grain };
    shader.uniforms.uGrainScale = { value: spec.grainScale };
    shader.uniforms.uBevel = { value: Math.max(1e-4, spec.bevel) };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
varying vec3 vVoxN;
varying vec3 vVoxP;
varying vec3 vVoxSeed;
attribute float voxOpen;
flat varying float vVoxOpen;
uniform float uBevel;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `#ifdef USE_INSTANCING
  vec3 voxNS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
#else
  vec3 voxNS = vec3(1.0);
#endif
// Inverse-transpose for the per-instance (diagonal) size scale.
vec3 objectNormal = vec3(normal) / (voxNS * voxNS);
#ifdef USE_TANGENT
  vec3 objectTangent = vec3(tangent.xyz);
#endif`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
{
  // Unit block → real size with a constant bevel radius on every edge.
  #ifdef USE_INSTANCING
    vec3 voxS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  #else
    vec3 voxS = vec3(1.0);
  #endif
  float voxR = min(min(voxS.x, voxS.y), voxS.z) * uBevel;
  vec3 voxT = clamp((abs(position) - (0.5 - uBevel)) / uBevel, 0.0, 1.0);
  vec3 voxPw = sign(position) * (voxS * 0.5 - voxR + voxT * voxR);
  transformed = voxPw / voxS;
  vVoxP = voxPw;
}
vVoxOpen = voxOpen;
vVoxN = normal;
#ifdef USE_INSTANCING
  vVoxSeed = instanceMatrix[3].xyz;
#else
  vVoxSeed = vec3(0.0);
#endif`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
varying vec3 vVoxN;
varying vec3 vVoxP;
varying vec3 vVoxSeed;
flat varying float vVoxOpen;
uniform vec3 uEdgeTint;
uniform float uEdgeStrength;
uniform float uEdgeWidth;
uniform float uGrain;
uniform float uGrainScale;
float voxHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
vec3 voxN = normalize(vVoxN);
// 0 on the flat faces, 1 on the outer half of the rounded bevel.
float voxEdge = smoothstep(0.29 - 0.2 * uEdgeWidth, 0.29, 1.0 - max(max(abs(voxN.x), abs(voxN.y)), abs(voxN.z)));
{
  // Only rims between exposed faces glow; edges against a flush neighbour stay a soft seam.
  int m = int(vVoxOpen + 0.5);
  float w = 1.0;
  if (abs(voxN.x) > 0.12) w *= (voxN.x > 0.0 ? float(m & 1) : float((m >> 1) & 1));
  if (abs(voxN.y) > 0.12) w *= (voxN.y > 0.0 ? float((m >> 2) & 1) : float((m >> 3) & 1));
  if (abs(voxN.z) > 0.12) w *= (voxN.z > 0.0 ? float((m >> 4) & 1) : float((m >> 5) & 1));
  voxEdge *= mix(0.1, 1.0, w);
}
float voxGrain = voxHash(floor(vVoxP * uGrainScale) + floor(vVoxSeed * 7.0));
diffuseColor.rgb *= 1.0 + (voxGrain - 0.5) * uGrain;
#ifndef VOX_LIT
diffuseColor.rgb = mix(diffuseColor.rgb, uEdgeTint, voxEdge * uEdgeStrength);
#endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
{
  // Worn, warm rims catch the key light (orange hair / leather rims, gold krama threads).
  float voxFacing = 1.0;
  #if NUM_DIR_LIGHTS > 0
    voxFacing = smoothstep(-0.2, 0.5, dot(normal, directionalLights[0].direction));
  #endif
  diffuseColor.rgb = mix(diffuseColor.rgb, uEdgeTint, voxEdge * uEdgeStrength * mix(0.3, 1.0, voxFacing));
}`,
      );
  };
  // Every family injects identical code (only uniforms differ), so programs are shared.
  material.customProgramCacheKey = () => 'voxel-shading-v4';
}
