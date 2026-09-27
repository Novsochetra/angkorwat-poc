import { BufferGeometry, Color, Float32BufferAttribute, Points, ShaderMaterial, UniformsLib, UniformsUtils, Vector2, type BufferAttribute } from 'three';
import { hash3 } from '../../voxel/random';
import type { MapFrame } from '../types';
import type { Puff } from './_mkStalls';

/**
 * Steam off the noodle stall's pots: thin white wisps curling up a metre or
 * two and gone, leaning with the breeze, catching the low sun in the morning
 * and the bulb's warm light at night. Like the village's kitchen smoke
 * (village/_smoke.ts, which makes the grill's): one cloud of camera-facing
 * points moved in the vertex shader from the time; per frame only uniforms,
 * and a pot's gate (steaming or not) is written when its stall opens or
 * closes. Hidden while no pot steams.
 */

/** Puffs per pot, a puff's life (s), how high it rises (m). */
const PUFFS = 12;
const LIFE = 3.6;
const RISE = 1.9;

export interface MarketSteam {
  object: Points;
  /** Once a frame (near): which pots steam (`on(stall)`), the time, the wind, the light. */
  update(f: MapFrame, scale: number, on: (stall: string) => boolean): void;
}

export function buildSteam(pots: Puff[]): MarketSteam {
  const n = pots.length * PUFFS;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n * 3);
  const gate = new Float32Array(n);
  pots.forEach((p, j) => {
    for (let i = 0; i < PUFFS; i++) {
      const k = j * PUFFS + i;
      pos.set([p.x, p.y, p.z], k * 3);
      seed.set([(i + hash3(i, j, 1, 93) * 0.7) / PUFFS, hash3(i, j, 2, 94), hash3(j, i, 3, 95)], k * 3);
    }
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new Float32BufferAttribute(seed, 3));
  geo.setAttribute('aGate', new Float32BufferAttribute(gate, 1));
  const material = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 }, uScale: { value: 800 }, uWind: { value: new Vector2() }, uColor: { value: new Color(1, 1, 1) }, uAlpha: { value: 0.3 } }]),
    vertexShader: /* glsl */ `
      attribute vec3 aSeed;
      attribute float aGate;
      uniform float uTime;
      uniform float uScale;
      uniform vec2 uWind;
      varying float vA;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        float age = fract(uTime / ${LIFE.toFixed(1)} + aSeed.x);
        vec3 p = position;
        p.y += age * ${RISE.toFixed(1)} * (1.0 - 0.35 * age);
        float curl = uTime * 0.9 + aSeed.y * 6.283;
        p.xz += uWind * age * age * 1.6 + vec2(sin(curl + age * 3.0), cos(curl * 0.8 + age * 2.4)) * (0.05 + age * 0.22);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float size = mix(0.22, 1.05, sqrt(age)) * (0.8 + 0.4 * aSeed.z);
        gl_PointSize = aGate * min(size * uScale / max(1.0, -mvPosition.z), 260.0);
        vA = aGate * smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.3, 1.0, age));
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAlpha;
      varying float vA;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(p, p);
        if (r2 >= 1.0 || vA <= 0.002) discard;
        float a = exp(-r2 * 3.0) * (1.0 - r2);
        gl_FragColor = vec4(uColor * (0.94 + 0.1 * -p.y), a * vA * uAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  material.name = 'market:steam';
  const object = new Points(geo, material);
  object.name = 'market:steam';
  object.frustumCulled = false;
  object.renderOrder = 3;
  object.castShadow = false;
  const u = material.uniforms;
  const gates = geo.getAttribute('aGate') as BufferAttribute;
  const was = pots.map(() => false);
  const day = new Color(0.96, 0.96, 0.95);
  const dawn = new Color(1.0, 0.9, 0.82);
  const night = new Color(0.62, 0.46, 0.32);
  return {
    object,
    update(f, scale, on) {
      let any = false;
      pots.forEach((p, j) => {
        const want = on(p.stall);
        any ||= want;
        if (want === was[j]) return;
        was[j] = want;
        (gates.array as Float32Array).fill(want ? 1 : 0, j * PUFFS, (j + 1) * PUFFS);
        gates.needsUpdate = true;
      });
      object.visible = any;
      if (!any) return;
      u.uTime.value = f.t;
      u.uScale.value = scale;
      const w = f.weather;
      const wind = 0.15 + w.wind * 0.8;
      u.uWind.value.set(Math.sin(w.windDir) * wind, Math.cos(w.windDir) * wind);
      // (the morning's cool air shows the steam best; the bulb warms it at night)
      const c = f.clock;
      const morning = c > 0.7 && c < 0.95 ? Math.sin(((c - 0.7) / 0.25) * Math.PI) : 0;
      const n = f.night;
      u.uColor.value.copy(day).lerp(dawn, morning * 0.6).lerp(night, Math.min(1, Math.max(0, (n - 0.45) * 2.2)));
      u.uAlpha.value = (0.26 + 0.16 * morning) * (1 - 0.5 * w.rain);
    },
  };
}
