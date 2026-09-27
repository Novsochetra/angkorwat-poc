import { InstancedBufferAttribute, type InstancedMesh, type Material, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { getVoxelMaterial } from '../../voxel/materials';
import { getVoxelDepthMaterial } from '../../voxel/shadow';
import { PALM_FLEX } from '../veg/palms';
import { SWAY, SWAY_GLSL } from '../veg/sway';

/**
 * The bamboo ladders bend with their palms: a sugar palm's trunk sways in
 * the land's wind (veg/palms.ts: its top moves `PALM_FLEX · h · swayAt(foot)`,
 * the foot not at all, as the square of the height), so the blocks lashed
 * to it are moved the same way in the vertex shader (and the tapper on the
 * ladder by veg/palms.ts `palmBend`, the same sums on the CPU). Blocks that
 * are not on a palm (the hut) have no bend (`w` = 0). A copy of the bark
 * family's material and its shadow caster, made once; the near fade and
 * other changes to the family still reach it (its original's shader changes
 * run first, at compile time).
 */

const BEND = /* glsl */ `
#ifdef USE_INSTANCING
if (aPsBend.w > 0.0) {
  // (where the block is at rest, how high on its palm; moved along with the trunk)
  vec3 psW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  float psUp = clamp((psW.y - aPsBend.y) / aPsBend.w, 0.0, 1.3);
  vec2 psOff = swayAt(aPsBend.xyz) * (${PALM_FLEX.sugar.toFixed(2)} * aPsBend.w * psUp * psUp);
  transformed += inverse(mat3(instanceMatrix)) * vec3(psOff.x, 0.0, psOff.y);
}
#endif
#include <project_vertex>`;

function bendCopy(base: Material): Material {
  const m = base.clone();
  m.defines = base.defines && { ...base.defines };
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => {
    base.onBeforeCompile.call(base, shader, renderer);
    Object.assign(shader.uniforms, SWAY);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${SWAY_GLSL}\nattribute vec4 aPsBend;`).replace('#include <project_vertex>', BEND);
  };
  m.customProgramCacheKey = () => `${base.customProgramCacheKey.call(base)}|ps-bend`;
  m.name = `${base.name}:ps-bend`;
  return m;
}

let bark: { material: Material; depth: Material } | null = null;

/**
 * Let a bark mesh's blocks bend with their palms: `feet` holds, per
 * instance (in the mesh's order), the palm's foot (x, y, z) and its height
 * `h` (0: the block stands on the ground and does not move).
 */
export function bendWithPalms(mesh: InstancedMesh, feet: Float32Array): void {
  bark ??= { material: bendCopy(getVoxelMaterial('mapBark')), depth: bendCopy(getVoxelDepthMaterial('mapBark')) };
  mesh.geometry.setAttribute('aPsBend', new InstancedBufferAttribute(feet, 4));
  mesh.material = bark.material;
  mesh.customDepthMaterial = bark.depth;
}
