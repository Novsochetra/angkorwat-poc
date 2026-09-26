import { Color, DynamicDrawUsage, Float32BufferAttribute, InstancedBufferGeometry, InstancedInterleavedBuffer, InterleavedBufferAttribute, Mesh, ShaderMaterial, UniformsLib } from 'three';

/**
 * Water thrown about by the bathing elephants (_landBath.ts): drops sprayed
 * from the trunk that fly up, fall back and are gone in the river, and rings
 * on the water (ripples round the legs, the drops landing, a calf rolling
 * over in the shallows: a white burst, then a spreading ring).
 *
 * One draw: an instanced quad per particle (a drop faces the camera, a
 * ring lies on the water); the shader moves and fades each from its start
 * time, so the CPU only writes a particle once, when it is thrown. A ring
 * buffer of `MAX`: the oldest are overwritten. Always in the scene (its
 * shader is made at load); nothing is drawn while no particle is alive.
 */

const MAX = 512;
const STRIDE = 12;

export class Splash {
  readonly mesh: Mesh;
  private readonly data = new Float32Array(MAX * STRIDE);
  private readonly buffer: InstancedInterleavedBuffer;
  private readonly geometry: InstancedBufferGeometry;
  private readonly uniforms = { uTime: { value: 0 }, uColor: { value: new Color(1, 1, 1) } };
  private next = 0;
  private used = 0;
  private dirty = false;
  /** The last particle's end (s): nothing is drawn after it. */
  private until = -1e9;

  constructor() {
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    this.buffer = new InstancedInterleavedBuffer(this.data, STRIDE, 1).setUsage(DynamicDrawUsage);
    // (x, y, z, start), (vx, vy, vz, life), (kind 0 ring · 1 drop, size, water level, strength)
    g.setAttribute('iA', new InterleavedBufferAttribute(this.buffer, 4, 0));
    g.setAttribute('iB', new InterleavedBufferAttribute(this.buffer, 4, 4));
    g.setAttribute('iC', new InterleavedBufferAttribute(this.buffer, 4, 8));
    g.instanceCount = 0;
    this.geometry = g;
    const material = new ShaderMaterial({
      uniforms: { ...UniformsLib.fog, ...this.uniforms },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    material.name = 'fauna:splash';
    this.mesh = new Mesh(g, material);
    this.mesh.name = 'fauna:splash';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.raycast = () => {};
  }

  private slot(): number {
    const o = this.next * STRIDE;
    this.next = (this.next + 1) % MAX;
    this.used = Math.min(MAX, this.used + 1);
    this.dirty = true;
    return o;
  }

  /** A ring on the water at (x, y, z) from `t0` for `life` s, growing to `radius` m; `burst` 0‥1: a white splash first. */
  ring(x: number, y: number, z: number, t0: number, radius: number, strength: number, life: number, burst = 0): void {
    const o = this.slot();
    const d = this.data;
    d.set([x, y + 0.04, z, t0, burst, 0, 0, life, 0, radius, y, strength], o);
    this.until = Math.max(this.until, t0 + life);
  }

  /** A drop thrown from (x, y, z) at `t0` with velocity (vx, vy, vz) (m/s), `size` m across; gone under `floor` (the water) or after `life` s. */
  drop(x: number, y: number, z: number, t0: number, vx: number, vy: number, vz: number, size: number, life: number, floor: number, strength = 0.85): void {
    const o = this.slot();
    this.data.set([x, y, z, t0, vx, vy, vz, life, 1, size, floor, strength], o);
    this.until = Math.max(this.until, t0 + life);
  }

  /** Once a frame: the clock (the animals' own), the light, and what was thrown. */
  flush(t: number, night: number): void {
    this.uniforms.uTime.value = t;
    // Foam white by day, a pale moonlit blue at night.
    this.uniforms.uColor.value.setRGB(0.93 - 0.55 * night, 0.95 - 0.5 * night, 0.97 - 0.35 * night);
    this.geometry.instanceCount = t < this.until ? this.used : 0;
    if (!this.dirty) return;
    this.dirty = false;
    this.buffer.clearUpdateRanges();
    this.buffer.addUpdateRange(0, this.used * STRIDE);
    this.buffer.needsUpdate = true;
  }
}

const VERTEX = /* glsl */ `
attribute vec4 iA;
attribute vec4 iB;
attribute vec4 iC;
uniform float uTime;
varying vec2 vUv;
varying float vAge;
varying float vKind;
varying float vStrength;
varying float vBurst;
#include <common>
#include <fog_pars_vertex>
void main() {
  float age = uTime - iA.w;
  float k = age / max(iB.w, 0.01);
  float live = step(0.0, k) * step(k, 1.0);
  vec4 mvPosition;
  if (iC.x < 0.5) {
    // A ring: flat on the water, growing fast, then slower.
    float r = iC.y * (0.2 + 0.8 * (1.0 - (1.0 - k) * (1.0 - k))) * live;
    mvPosition = modelViewMatrix * vec4(iA.xyz + vec3(position.x * r, 0.0, position.y * r), 1.0);
  } else {
    // A drop: thrown, falling; gone once it is back in the water.
    vec3 p = iA.xyz + iB.xyz * age + vec3(0.0, -4.9 * age * age, 0.0);
    live *= step(iC.z, p.y);
    mvPosition = modelViewMatrix * vec4(p, 1.0);
    mvPosition.xy += position.xy * iC.y * live;
  }
  vUv = position.xy;
  vAge = clamp(k, 0.0, 1.0);
  vKind = iC.x;
  vStrength = iC.w;
  vBurst = iB.x;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv;
varying float vAge;
varying float vKind;
varying float vStrength;
varying float vBurst;
#include <common>
#include <fog_pars_fragment>
void main() {
  float d = length(vUv);
  if (d > 1.0) discard;
  float a;
  if (vKind < 0.5) {
    float fade = pow(1.0 - vAge, 1.5);
    float w = 0.09 + 0.08 * vAge;
    float ring = 1.0 - smoothstep(0.0, w, abs(d - (1.0 - w)));
    ring += 0.45 * (1.0 - smoothstep(0.0, w * 0.8, abs(d - 0.62)));
    float burst = (1.0 - smoothstep(0.1, 0.6, d)) * pow(1.0 - vAge, 5.0) * vBurst;
    a = vStrength * ring * fade + burst * 1.4;
  } else {
    a = (1.0 - smoothstep(0.35, 1.0, d)) * vStrength * (1.0 - vAge * vAge);
  }
  a = clamp(a, 0.0, 1.0);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
