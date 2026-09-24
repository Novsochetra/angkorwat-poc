import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Points, ShaderMaterial, UniformsLib, UniformsUtils, type Vector3 } from 'three';
import { mulberry32 } from '../../voxel/random';
import type { HeightField } from '../heightfield';

/**
 * Fireflies at night: warm points of light drifting slowly a metre or two over
 * the lowland meadows (in loose swarms, as they gather by trees and water),
 * and a few round the explorer's ledge close to the camera. Each one glows up
 * softly for a second or so every few seconds. One draw call; the drift and
 * the glow are worked out on the GPU from the time.
 */

export interface FireflyUniforms {
  uTime: { value: number };
  /** 0 by day, 1 at night. */
  uNight: { value: number };
  uScale: { value: number };
  uColor: { value: Color };
}

/** Swarms in the lowlands, fireflies per swarm, swarm radius (m). */
const SWARMS = 80;
const PER_SWARM = 9;
const SWARM_R = 9;
/** Around the explorer's ledge. */
const NEAR = 16;

export function buildFireflies(field: HeightField, feet: Vector3, camera: Vector3): { points: Points; uniforms: FireflyUniforms } {
  const rnd = mulberry32(4242);
  const pos: number[] = [];
  const seed: number[] = [];
  const size: number[] = [];
  const lowland = (x: number, z: number) => {
    const h = field.heightAt(x, z);
    return h <= 26 && field.waterAt(x, z) === null ? h : null;
  };
  // Swarms over low, dry ground in the front half of the map (farther ones would be sub-pixel).
  let tries = 0;
  for (let s = 0; s < SWARMS && tries < 5000; tries++) {
    const cx = -280 + rnd() * 560;
    const cz = -200 + rnd() * 300;
    if (lowland(cx, cz) === null) continue;
    s++;
    for (let i = 0; i < PER_SWARM; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * SWARM_R;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const h = lowland(x, z);
      if (h === null) continue;
      pos.push(x, h + 0.6 + rnd() * 2.8, z);
      seed.push(rnd(), rnd(), rnd(), 0.8 + rnd() * 0.5);
      size.push(0.22);
    }
  }
  // Round the explorer: in the air over and in front of the ledge, never right at the lens.
  for (let i = 0, n = 0; n < NEAR && i < 400; i++) {
    const x = feet.x - 8 + rnd() * 10;
    const y = feet.y - 0.5 + rnd() * 3;
    const z = feet.z - 4 + rnd() * 9;
    if (Math.hypot(x - camera.x, y - camera.y, z - camera.z) < 6) continue;
    pos.push(x, y, z);
    seed.push(rnd(), rnd(), rnd(), 0.5 + rnd() * 0.3);
    size.push(0.022);
    n++;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new Float32BufferAttribute(seed, 4));
  geo.setAttribute('aSize', new Float32BufferAttribute(size, 1));
  const material = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 800 }, uColor: { value: new Color(1.0, 0.78, 0.3) } }]),
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      attribute float aSize;
      uniform float uTime;
      uniform float uNight;
      uniform float uScale;
      varying float vI;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        float t = uTime;
        vec4 s = aSeed * 6.2832;
        // Slow wandering, a metre or two, each on its own clock (the near ones less).
        float amp = aSize > 0.2 ? 1.8 : 0.9;
        vec3 p = position + amp * vec3(
          sin(t * 0.21 * aSeed.w + s.x) + 0.5 * sin(t * 0.47 + s.y),
          0.45 * sin(t * 0.33 * aSeed.w + s.z),
          cos(t * 0.17 * aSeed.w + s.y) + 0.5 * cos(t * 0.39 + s.x));
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float dist = max(1.0, -mvPosition.z);
        float px = aSize * uScale / dist;
        gl_PointSize = max(2.5, px * 6.0);
        // A soft glow for about a second every 3–6 s, and a faint ember between.
        float period = 3.0 + aSeed.x * 3.0;
        float ph = fract(t / period + aSeed.y);
        float flash = smoothstep(0.0, 0.18, ph) * (1.0 - smoothstep(0.22, 0.5, ph));
        float on = smoothstep(0.35, 0.85, uNight);
        // Sub-pixel far ones: keep their light, spread over the smallest dot.
        float cover = clamp(px * 6.0 / 2.5, 0.35, 1.0);
        vI = on * (0.12 + 1.9 * flash) * cover;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vI;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(p, p);
        if (r2 >= 1.0 || vI <= 0.001) discard;
        float a = exp(-r2 * 9.0) + 0.25 * exp(-r2 * 2.5) * (1.0 - r2);
        gl_FragColor = vec4(uColor * vI * a * 2.2, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          #else
            float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          gl_FragColor.rgb *= 1.0 - fogFactor;
        #endif
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: true,
  });
  material.name = 'map:fireflies';
  const points = new Points(geo, material);
  points.name = 'life:fireflies';
  points.frustumCulled = false;
  points.renderOrder = 3;
  return { points, uniforms: material.uniforms as unknown as FireflyUniforms };
}
