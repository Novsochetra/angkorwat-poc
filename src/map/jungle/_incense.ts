import {
  BoxGeometry,
  Color,
  CustomBlending,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  Vector2,
} from 'three';
import { hazeUniforms } from '../sky/haze';
import type { MapFrame } from '../types';

/**
 * The small lights of the jungle shrines, without a single light source:
 *
 * - candle flames and the glowing tips of incense sticks: tiny unlit boxes
 *   (one instanced mesh) whose colour goes above 1.0 (linear) at night, so
 *   they bloom; by day a flame is a small warm dot, a tip a dull ember; the
 *   sculpted candles (sacred/offerings.ts) draw their own flame, and get only
 *   a small bright core in it that blooms at night;
 * - incense smoke: soft grey puffs that rise from each bowl of sticks, sway,
 *   spread and fade over a few seconds, carried by the wind; and a soft
 *   warm halo round the candles at night (additive). All puffs and halos
 *   are one instanced quad facing the camera; the shader moves them from
 *   the time, so they cost the CPU nothing a frame.
 *
 * Always in the scene (the smoke shader is compiled at load).
 */

export interface ShrineLights {
  /** Candle flames (m: the flame's middle). */
  candles: [number, number, number][];
  /** Sculpted candles' own flames (m: the middle; size: the flame's height, m): a bright core in each. */
  cores: { at: [number, number, number]; size: number }[];
  /** Incense sticks' tips (m); `smoke` bowls get a thread of smoke. */
  tips: [number, number, number][];
  /** Where a thread of smoke starts (m), and how strong (1 = a bowl of sticks). */
  smoke: { at: [number, number, number]; strength: number }[];
  /** Soft halos at night (m, size across; strength, default `HALO`). */
  halos: { at: [number, number, number]; size: number; strength?: number }[];
}

/** Puffs in one thread of smoke. */
const PUFFS = 9;
/** Flame and tip sizes (m; the explorer and his world are 1.4 × true size). */
const FLAME = [0.07, 0.13, 0.07] as const;
const TIP = 0.045;
/** A sculpted flame's core, in shares of its height (across, up). */
const CORE = [0.3, 0.55] as const;
/** Their colours (linear) and brightness by day and at night. */
const FLAME_COLOR = new Color(1, 0.6, 0.24);
const CORE_COLOR = new Color(1, 0.82, 0.5);
const TIP_COLOR = new Color(1, 0.26, 0.07);
const LEVEL = { day: 0.95, night: 2.1 };
/** A halo's default strength (additive: more bleaches the stone round it white). */
const HALO = 0.22;

export class ShrineGlow {
  readonly object = new Group();
  private readonly spark = new MeshBasicMaterial({ color: 0xffffff });
  private readonly u = {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uWind: { value: new Vector2() },
    uSmoke: { value: new Color() },
    uWarm: { value: new Color(0.9, 0.42, 0.16) },
    uHalo: { value: new Color(1, 0.6, 0.28) },
  };

  constructor(l: ShrineLights) {
    this.object.name = 'jungle:lights';

    // ── Flames and tips ──────────────────────────────────────────────────
    const n = l.candles.length + l.cores.length + l.tips.length;
    const sparks = new InstancedMesh(new BoxGeometry(1, 1, 1), this.spark, Math.max(1, n));
    sparks.name = 'jungle:sparks';
    sparks.castShadow = sparks.receiveShadow = false;
    const m = new Matrix4();
    let i = 0;
    for (const [x, y, z] of l.candles) {
      sparks.setMatrixAt(i, m.makeScale(FLAME[0], FLAME[1], FLAME[2]).setPosition(x, y, z));
      sparks.setColorAt(i++, FLAME_COLOR);
    }
    for (const { at, size } of l.cores) {
      sparks.setMatrixAt(i, m.makeScale(size * CORE[0], size * CORE[1], size * CORE[0]).setPosition(at[0], at[1], at[2]));
      sparks.setColorAt(i++, CORE_COLOR);
    }
    for (const [x, y, z] of l.tips) {
      sparks.setMatrixAt(i, m.makeScale(TIP, TIP, TIP).setPosition(x, y, z));
      sparks.setColorAt(i++, TIP_COLOR);
    }
    sparks.count = n;
    sparks.computeBoundingSphere();
    sparks.raycast = () => {};
    this.object.add(sparks);

    // ── Smoke puffs and halos: one camera-facing quad each ────────────────
    const geo = new InstancedBufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    const count = l.smoke.length * PUFFS + l.halos.length;
    const at = new Float32Array(Math.max(1, count) * 3);
    // (kind 0 smoke / 1 halo, phase, size, strength)
    const info = new Float32Array(Math.max(1, count) * 4);
    let p = 0;
    const put = (x: number, y: number, z: number, kind: number, phase: number, size: number, strength: number) => {
      at.set([x, y, z], p * 3);
      info.set([kind, phase, size, strength], p * 4);
      p++;
    };
    l.smoke.forEach((s, e) => {
      for (let q = 0; q < PUFFS; q++) put(s.at[0], s.at[1], s.at[2], 0, (q + 0.37 * e) / PUFFS, 0.2 * Math.sqrt(s.strength), 0.3 * s.strength);
    });
    for (const h of l.halos) put(h.at[0], h.at[1], h.at[2], 1, (h.at[0] * 0.37 + h.at[2] * 0.11) % 1, h.size, h.strength ?? HALO);
    geo.setAttribute('aAt', new InstancedBufferAttribute(at, 3));
    geo.setAttribute('aInfo', new InstancedBufferAttribute(info, 4));
    geo.instanceCount = count;
    const material = new ShaderMaterial({
      name: 'jungle smoke',
      transparent: true,
      depthWrite: false,
      fog: true,
      // Premultiplied: the smoke covers what is behind it, the halos add light.
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      uniforms: { ...hazeUniforms(), ...this.u },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    const puffs = new Mesh(geo, material);
    puffs.name = 'jungle:smoke';
    puffs.frustumCulled = false;
    puffs.renderOrder = 3;
    puffs.raycast = () => {};
    this.object.add(puffs);
  }

  update(f: MapFrame): void {
    const n = f.night;
    const flicker = 1 + 0.05 * Math.sin(f.t * 1.7) + 0.03 * Math.sin(f.t * 3.1 + 1.3);
    this.spark.color.setScalar((LEVEL.day + (LEVEL.night - LEVEL.day) * n) * flicker);
    this.u.uTime.value = f.t;
    this.u.uNight.value = n;
    // (a faint drift even on a still day; the wind bends the threads over)
    const w = 0.12 + 1.4 * f.weather.wind;
    this.u.uWind.value.set(Math.sin(f.weather.windDir) * w, Math.cos(f.weather.windDir) * w);
    // Pale grey by day, a faint blue grey in the moonlight.
    this.u.uSmoke.value.setRGB(0.5 - 0.46 * n, 0.5 - 0.455 * n, 0.48 - 0.42 * n);
  }
}

const VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec3 aAt;
attribute vec4 aInfo;
uniform float uTime;
uniform float uNight;
uniform vec2 uWind;
varying vec2 vUv;
varying float vAlpha;
varying float vKind;
varying float vWarm;
void main() {
  float kind = aInfo.x;
  float phase = aInfo.y;
  vec3 c = aAt;
  float size;
  float alpha;
  if (kind < 0.5) {
    // A puff: rises from the bowl, sways, spreads and fades; each bowl its own pace.
    float seed = fract(sin(dot(aAt.xz, vec2(12.9898, 78.233))) * 43758.5453);
    float life = 5.5 + 2.5 * seed;
    float a = fract(uTime / life + phase);
    float s1 = sin(uTime * 0.7 + seed * 40.0 + a * 5.0);
    float s2 = sin(uTime * 1.9 + seed * 13.0 + a * 9.0);
    c += vec3((0.14 * s1 + 0.04 * s2) * a, 1.6 * a, 0.12 * cos(uTime * 0.6 + seed * 31.0 + a * 4.0) * a);
    c.xz += uWind * a * a * 1.8;
    size = aInfo.z * (0.35 + 2.2 * a);
    alpha = aInfo.w * smoothstep(0.0, 0.12, a) * (1.0 - a) * (1.0 - a);
    // (lit warm by the candles near the bowl at night)
    vWarm = (1.0 - smoothstep(0.0, 0.4, a)) * uNight;
  } else {
    // A halo: only at night, a slow flicker.
    float fl = 1.0 + 0.07 * sin(uTime * 1.3 + phase * 20.0) + 0.04 * sin(uTime * 2.9 + phase * 9.0);
    size = aInfo.z * fl;
    alpha = aInfo.w * uNight * uNight * fl;
    vWarm = 1.0;
  }
  vUv = position.xy * 2.0;
  vAlpha = alpha;
  vKind = kind;
  vec4 mvPosition = modelViewMatrix * vec4(c, 1.0);
  mvPosition.xy += position.xy * size;
  gl_Position = projectionMatrix * mvPosition;
  // (nothing to draw: off the screen)
  if (alpha < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  #include <fog_vertex>
}`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uSmoke;
uniform vec3 uWarm;
uniform vec3 uHalo;
varying vec2 vUv;
varying float vAlpha;
varying float vKind;
varying float vWarm;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  bool smoke = vKind < 0.5;
  float k = 1.0 - r2;
  float soft = smoke ? exp(-r2 * 2.5) * k : k * k * k;
  float a = vAlpha * soft;
  gl_FragColor = vec4(smoke ? mix(uSmoke, uWarm * 0.35, vWarm * 0.7) : uHalo, 1.0);
  #include <fog_fragment>
  // Premultiplied (after the haze: it tints the colour, not the coverage).
  gl_FragColor = vec4(gl_FragColor.rgb * a, smoke ? a : 0.0);
}`;
