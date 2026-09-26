import { BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshStandardMaterial } from 'three';
import { RAIN_RINGS_GLSL } from '../sky/rain';
import type { MapFrame } from '../types';

/**
 * Angkor Wat's moat and reflecting pools: flat water in stone basins on the
 * pad (the kerbs are voxels, see sanctuary.ts). One mesh, one material; the
 * colour follows the time of day. In rain, drops ring the water up close
 * (`RAIN_RINGS_GLSL`, like the rivers and the lake); dry, that code is skipped.
 */

export interface Pool {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

// Between the shallow and deep tones of the rivers (water.ts), so the pools match them.
const DAY = new Color(0x2f9aa3);
const NIGHT = new Color(0x1a3f6c);
// Splash white (the rivers' foam), day → night.
const SPLASH_DAY = new Color(0xf2f5ec);
const SPLASH_NIGHT = new Color(0xaec4e4);

export function buildPools(pools: Pool[], y: number): { mesh: Mesh; update(f: MapFrame): void } {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const p of pools) {
    const n = pos.length / 3;
    pos.push(p.x0, y, p.z0, p.x1, y, p.z0, p.x1, y, p.z1, p.x0, y, p.z1);
    idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);
  const mat = new MeshStandardMaterial({ color: DAY.clone(), roughness: 0.18, metalness: 0 });
  const uniforms = { uTime: { value: 0 }, uRain: { value: 0 }, uSplash: { value: SPLASH_DAY.clone() } };
  mat.customProgramCacheKey = () => 'angkor-pools';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPoolW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vPoolW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform float uRain;\nuniform vec3 uSplash;\nvarying vec3 vPoolW;\n${RAIN_RINGS_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  vec3 poolRain = vec3(0.0);
  if (uRain > 0.001) {
    poolRain = rainRings(vPoolW.xz, uTime, uRain) * (1.0 - smoothstep(35.0, 110.0, length(vPoolW - cameraPosition)));
    // (no mirrored sky here to catch the ring's slope, so its crest is lightened a little)
    float poolLift = clamp(poolRain.z * 0.55 + length(poolRain.xy) * 0.3, 0.0, 0.7);
    diffuseColor.rgb = mix(diffuseColor.rgb, uSplash, poolLift);
  }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.4, uRain);')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
  if (uRain > 0.001) normal = normalize((viewMatrix * vec4(normalize(vec3(poolRain.x * 0.5, 1.0, poolRain.y * 0.5)), 0.0)).xyz);`,
      );
  };
  const mesh = new Mesh(geo, mat);
  mesh.name = 'angkor:pools';
  mesh.receiveShadow = true;
  return {
    mesh,
    update(f: MapFrame) {
      mat.color.copy(DAY).lerp(NIGHT, f.night);
      uniforms.uTime.value = f.t;
      uniforms.uRain.value = f.weather.rain;
      uniforms.uSplash.value.copy(SPLASH_DAY).lerp(SPLASH_NIGHT, f.night);
    },
  };
}
