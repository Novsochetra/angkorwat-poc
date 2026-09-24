import { Color, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry, ShaderMaterial, UniformsLib, UniformsUtils } from 'three';
import { mulberry32 } from '../../voxel/random';
import type { MapQuality } from '../types';
import type { FallFoot } from './falls';
import { NOISE_GLSL } from './glsl';

/**
 * Spray and mist at the foot of the falls: soft puffs that rise slowly,
 * drift down the river, swell and fade (one instanced draw for all).
 */
export interface SprayUniforms {
  uTime: { value: number };
  uColor: { value: Color };
  uOpacity: { value: number };
}

export function buildSpray(feet: FallFoot[], quality: MapQuality): { mesh: Mesh; uniforms: SprayUniforms } {
  const rnd = mulberry32(9127);
  const base: number[] = [];
  const params: number[] = [];
  const drift: number[] = [];
  const density = quality === 'low' ? 0.5 : quality === 'high' ? 1.4 : 1;
  const puff = (x: number, y: number, z: number, size: number, rise: number, dx: number, dz: number, period: number, alpha: number) => {
    base.push(x, y, z);
    // (phase, period, size, rise); alpha packed into the drift's y
    params.push(rnd(), period, size, rise);
    drift.push(dx, alpha, dz);
  };
  for (const ft of feet) {
    const side = [-ft.dir[1], ft.dir[0]];
    if (ft.small) {
      if (ft.drop < 1.5) continue;
      puff(ft.x, ft.y + 0.3, ft.z, 1.8, 1, ft.dir[0] * 1.5, ft.dir[1] * 1.5, 7 + rnd() * 3, 0.35);
      continue;
    }
    const n = Math.round(Math.min(24, Math.max(6, ft.width * 0.9 + ft.drop * 0.35)) * density);
    const size = Math.min(11, 3.5 + ft.drop * 0.25);
    for (let k = 0; k < n; k++) {
      const u = (rnd() - 0.5) * ft.width;
      const fwd = 1 + rnd() * 2.5;
      const x = ft.x + side[0] * u + ft.dir[0] * fwd;
      const z = ft.z + side[1] * u + ft.dir[1] * fwd;
      const go = 2 + ft.drop * 0.12 + rnd() * 2;
      puff(x, ft.y + 0.8, z, size * (0.7 + rnd() * 0.6), 1.5 + ft.drop * 0.22 * (0.6 + rnd() * 0.8), ft.dir[0] * go, ft.dir[1] * go, 7 + rnd() * 5, 0.55);
    }
    // Veils of mist up the lower half of a tall fall.
    if (ft.drop > 10)
      for (let k = 0; k < Math.round(4 * density); k++) {
        const u = (rnd() - 0.5) * ft.width * 0.8;
        puff(ft.x + side[0] * u + ft.dir[0] * 0.8, ft.y + ft.drop * (0.08 + rnd() * 0.35), ft.z + side[1] * u + ft.dir[1] * 0.8, size * 0.75, 2, ft.dir[0] * 1.5, ft.dir[1] * 1.5, 9 + rnd() * 5, 0.3);
      }
  }
  const quad = new PlaneGeometry(1, 1);
  const geo = new InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  geo.setAttribute('aBase', new InstancedBufferAttribute(new Float32Array(base), 3));
  geo.setAttribute('aP', new InstancedBufferAttribute(new Float32Array(params), 4));
  geo.setAttribute('aDrift', new InstancedBufferAttribute(new Float32Array(drift), 3));
  geo.instanceCount = base.length / 3;

  const uniforms: SprayUniforms = {
    uTime: { value: 0 },
    uColor: { value: new Color(1, 1, 1) },
    uOpacity: { value: 1 },
  };
  const material = new ShaderMaterial({
    name: 'waterfall spray',
    uniforms: UniformsUtils.merge([UniformsLib.fog, {}]),
    vertexShader: SPRAY_VERT,
    fragmentShader: SPRAY_FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  Object.assign(material.uniforms, uniforms);
  const mesh = new Mesh(geo, material);
  mesh.name = 'waterfall spray';
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

const SPRAY_VERT = /* glsl */ `
attribute vec3 aBase;
attribute vec4 aP;
attribute vec3 aDrift;
uniform float uTime;
varying vec2 vUv;
varying float vA;
varying float vSeed;
#include <common>
#include <fog_pars_vertex>
void main() {
  float age = fract(uTime / aP.y + aP.x);
  float up = 1.0 - (1.0 - age) * (1.0 - age);
  vec3 c = aBase + vec3(aDrift.x, 0.0, aDrift.z) * age + vec3(0.0, aP.w * up, 0.0);
  c.x += sin(uTime * 0.23 + aP.x * 40.0) * 0.5 * age;
  c.z += cos(uTime * 0.19 + aP.x * 23.0) * 0.5 * age;
  float size = aP.z * (0.55 + 0.9 * age);
  vec4 mvPosition = modelViewMatrix * vec4(c, 1.0);
  // A little towards the camera, so it does not cut into the pool or the cliff.
  mvPosition.xyz += normalize(-mvPosition.xyz) * size * 0.25;
  mvPosition.xy += position.xy * size;
  vA = smoothstep(0.0, 0.25, age) * (1.0 - smoothstep(0.4, 1.0, age)) * aDrift.y;
  vUv = position.xy * 2.0;
  vSeed = aP.x;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const SPRAY_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
varying float vA;
varying float vSeed;
#include <common>
#include <fog_pars_fragment>
${NOISE_GLSL}
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float n = wNoise(vUv * 1.7 + vSeed * 37.0 + vec2(0.0, uTime * 0.07)) * 0.6 + wNoise(vUv * 3.9 + vSeed * 11.0) * 0.4;
  float a = exp(-r * r * 3.5) * (1.0 - r * r);
  a *= smoothstep(0.05, 0.8, n + 0.3 * (1.0 - r));
  gl_FragColor = vec4(uColor, a * vA * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;
