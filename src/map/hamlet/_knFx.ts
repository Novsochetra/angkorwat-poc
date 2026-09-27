import { BufferGeometry, Color, Float32BufferAttribute, Group, Points, ShaderMaterial, UniformsLib, UniformsUtils, Vector3, type WebGLRenderer } from 'three';
import { hash3 } from '../../voxel/random';
import { GlowBlocks, glowMaterial, haloPoints, pointScale, type Halo } from '../road/glow';
import type { MapFrame } from '../types';

/**
 * The Kulen picnic place's lights and smoke, with no light added: the huts'
 * lanterns (glow blocks whose colour goes above 1.0 while they are lit, so
 * the bloom catches them, and a soft halo round each) and the grill's smoke
 * (a few soft points rising from the stall, moved in the vertex shader).
 *
 * The lanterns are lit at dusk while the last families linger (`LIT`), and
 * put out when they go home; the grill smokes while the stall is open. Far
 * off (`FAR`) all of it is hidden and nothing is done.
 */

/** Clock keys of the lanterns (0 out … 1 lit): lit as the sun goes down, out once the families have gone. */
const LIT: [number, number][] = [
  [0, 0],
  [0.16, 0],
  [0.2, 1],
  [0.3, 1],
  [0.35, 0],
  [1, 0],
];
/** …and of the grill (0 cold … 1 busy): lit in the morning, busiest at noon, out after dusk. */
const GRILL: [number, number][] = [
  [0, 0.8],
  [0.12, 0.7],
  [0.22, 0.4],
  [0.26, 0],
  [0.77, 0],
  [0.8, 0.5],
  [0.95, 1],
  [1, 0.8],
];
/** Beyond this from the camera (m) the lights and the smoke are hidden. */
const FAR = 480;
/** Smoke puffs per fire, how long one rises (s) and how high (m). */
const PUFFS = 16;
const RISE_T = 9;
const RISE_H = 6;

/** A value from clock keys (smooth between them). */
export function clockKeys(keys: readonly [number, number][], clock: number): number {
  const c = clock - Math.floor(clock);
  for (let i = 0; i < keys.length - 1; i++) {
    const [a, va] = keys[i];
    const [b, vb] = keys[i + 1];
    if (c > b) continue;
    const t = b > a ? (c - a) / (b - a) : 1;
    return va + (vb - va) * t * t * (3 - 2 * t);
  }
  return keys[keys.length - 1][1];
}

/** How lit the huts' lanterns are at a time of day (0‥1). */
export const lanternsLit = (clock: number): number => clockKeys(LIT, clock);
/** How busy the grill is (0 cold … 1). */
export const grillBusy = (clock: number): number => clockKeys(GRILL, clock);

export class KnFx {
  private readonly glows = new GlowBlocks();
  private readonly halos: Halo[] = [];
  private readonly smokes: Vector3[] = [];

  /** A lantern's flame (its glass: m, map space) and halo. */
  lantern(x: number, y: number, z: number, yaw: number): void {
    const phase = hash3(Math.round(x * 10), Math.round(z * 10), 3, 81) * 6.28;
    this.glows.add(x, y, z, 0.18, 0.3, 0.18, yaw, 0xffb45a, phase);
    this.halos.push({ x, y, z, size: 3.4, kind: 0, phase });
  }

  /** A candle's flame (m, map space) and a small halo: lit with the lanterns. */
  candle(x: number, y: number, z: number): void {
    const phase = hash3(Math.round(x * 10), Math.round(z * 10), 5, 82) * 6.28;
    this.glows.add(x, y, z, 0.04, 0.08, 0.04, 0, 0xffc070, phase);
    this.halos.push({ x, y, z, size: 1.1, kind: 0, phase });
  }

  /** A fire's smoke rising from here (m). */
  smoke(x: number, y: number, z: number): void {
    this.smokes.push(new Vector3(x, y, z));
  }

  /** The meshes (glass, halos, smoke) and their per-frame update. */
  build(renderer: WebGLRenderer, mid: { x: number; z: number }): { object: Group; update(f: MapFrame): void } {
    const object = new Group();
    object.name = 'kulenPicnic:fx';
    const { material, uniforms } = glowMaterial('lamp');
    material.name = 'kulenPicnic:glow';
    const glass = this.glows.list.length ? this.glows.mesh(material, 'kulenPicnic:glow') : null;
    if (glass) object.add(glass);
    const halo = this.halos.length ? haloPoints(this.halos) : null;
    if (halo) {
      halo.points.name = 'kulenPicnic:halos';
      halo.uniforms.uColor.value.setRGB(1, 0.64, 0.3);
      object.add(halo.points);
    }
    const smoke = this.smokes.length ? makeSmoke(this.smokes) : null;
    if (smoke) object.add(smoke.points);
    return {
      object,
      update(f) {
        const c = f.camera.position;
        const far = Math.hypot(c.x - mid.x, c.z - mid.z) > FAR;
        object.visible = !far;
        if (far) return;
        const lit = lanternsLit(f.clock);
        const n = f.night;
        uniforms.uTime.value = f.t;
        // (out: the dark glass; lit: warm, above 1 at dusk and night so it blooms)
        uniforms.uLevel.value = 0.05 + lit * (0.8 + 2.6 * n);
        uniforms.uPulse.value = 0.04 + lit * 0.05;
        uniforms.uNearLevel.value = 1 - lit * 0.4;
        if (halo) {
          halo.uniforms.uTime.value = f.t;
          halo.uniforms.uScale.value = pointScale(renderer, f.camera);
          halo.uniforms.uLamp.value = lit * n * 1.3;
        }
        if (smoke) smoke.update(f, pointScale(renderer, f.camera), grillBusy(f.clock));
      },
    };
  }
}

/** Grey-white grill smoke: puffs rising, curling and spreading, leaning with the breeze. */
function makeSmoke(sources: Vector3[]): { points: Points; update(f: MapFrame, scale: number, amount: number): void } {
  const pos: number[] = [];
  const seed: number[] = [];
  for (const [s, p] of sources.entries())
    for (let i = 0; i < PUFFS; i++) {
      pos.push(p.x, p.y, p.z);
      seed.push(i / PUFFS + 0.03 * hash3(i, s, 1, 83), hash3(i, s, 2, 84));
    }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new Float32BufferAttribute(seed, 2));
  const material = new ShaderMaterial({
    name: 'kulenPicnic:smoke',
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      { uTime: { value: 0 }, uScale: { value: 800 }, uWind: { value: new Vector3() }, uColor: { value: new Color(0.7, 0.7, 0.72) }, uOpacity: { value: 0 } },
    ]),
    vertexShader: /* glsl */ `
      attribute vec2 aSeed;
      uniform float uTime;
      uniform float uScale;
      uniform vec3 uWind;
      varying float vA;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        float age = fract(uTime / ${RISE_T.toFixed(1)} + aSeed.x);
        float h = age * ${RISE_H.toFixed(1)} * (1.0 - 0.25 * age);
        vec3 p = position;
        p.y += h;
        // A lazy curl, wider as it rises, and the breeze bending it over.
        float s = aSeed.y * 43.0;
        p.x += sin(s + uTime * 0.37 + age * 4.0) * 0.45 * age + uWind.x * h * h * 0.06;
        p.z += cos(s * 1.3 + uTime * 0.31 + age * 3.5) * 0.45 * age + uWind.z * h * h * 0.06;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = min((0.5 + 2.6 * sqrt(age)) * (0.8 + 0.4 * aSeed.y) * uScale / max(1.0, -mvPosition.z), 360.0);
        vA = smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.3, 1.0, age));
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vA;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(q, q);
        if (r2 >= 1.0) discard;
        float a = exp(-r2 * 3.0) * (1.0 - r2) * vA * uOpacity;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor * (0.94 + 0.1 * -q.y), a);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const points = new Points(geo, material);
  points.name = 'kulenPicnic:smoke';
  points.frustumCulled = false;
  points.renderOrder = 2;
  const u = material.uniforms;
  return {
    points,
    update(f, scale, amount) {
      points.visible = amount > 0.01;
      if (!points.visible) return;
      u.uTime.value = f.drift;
      u.uScale.value = scale;
      const w = f.weather;
      (u.uWind.value as Vector3).set(Math.sin(w.windDir), 0, Math.cos(w.windDir)).multiplyScalar(0.3 + 1.6 * w.wind);
      // Pale by day, a warmer grey at dusk (linear colours); rain beats it down.
      const n = f.night;
      (u.uColor.value as Color).setRGB(0.62 - 0.3 * n, 0.62 - 0.32 * n, 0.64 - 0.3 * n);
      u.uOpacity.value = 0.36 * amount * (1 - 0.7 * w.rain);
    },
  };
}
