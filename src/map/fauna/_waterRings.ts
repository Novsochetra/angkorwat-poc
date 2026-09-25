import {
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  ShaderMaterial,
  UniformsLib,
} from 'three';

/**
 * Rings on the water: a splash that spreads into a fading ripple where a fish
 * jumps or drops back, a bird stabs, a frog plops in; small ripples behind
 * swimming ducks. One instanced quad per ring; the shader grows and fades it
 * from its start time, so a ring costs the CPU only when it is written.
 * Each frame the animals write the rings that show (`begin`, `add`, `end`).
 */

const STRIDE = 8;

export class Rings {
  readonly mesh: Mesh;
  readonly max: number;
  count = 0;
  private readonly data: Float32Array;
  private readonly buffer: InstancedInterleavedBuffer;
  private readonly geometry: InstancedBufferGeometry;
  private readonly uniforms: { uTime: { value: number }; uColor: { value: Color } };

  constructor(max: number) {
    this.max = max;
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([-1, 0, -1, -1, 0, 1, 1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0, -1], 3));
    this.data = new Float32Array(max * STRIDE);
    this.buffer = new InstancedInterleavedBuffer(this.data, STRIDE, 1).setUsage(DynamicDrawUsage);
    // (x, y, z, start time), (radius, strength, life, splash)
    g.setAttribute('iAt', new InterleavedBufferAttribute(this.buffer, 4, 0));
    g.setAttribute('iRing', new InterleavedBufferAttribute(this.buffer, 4, 4));
    g.instanceCount = 0;
    this.geometry = g;
    this.uniforms = { uTime: { value: 0 }, uColor: { value: new Color(1, 1, 1) } };
    const material = new ShaderMaterial({
      uniforms: { ...UniformsLib.fog, ...this.uniforms },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    material.name = 'map:water rings';
    this.mesh = new Mesh(g, material);
    this.mesh.name = 'wildlife:rings';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    this.mesh.raycast = () => {};
  }

  begin(t: number, night: number): void {
    this.count = 0;
    this.uniforms.uTime.value = t;
    // Foam white by day, pale moonlit blue at night (dimmer).
    this.uniforms.uColor.value.setRGB(0.95 - 0.55 * night, 0.93 - 0.48 * night, 0.86 - 0.3 * night);
  }

  /**
   * A ring at (x, y, z) that starts at time t0 and lasts `life` s, growing to
   * `radius` m; `splash` 0‥1: a white burst at the start.
   */
  add(x: number, y: number, z: number, t0: number, radius: number, strength: number, life: number, splash: number): void {
    if (this.count >= this.max) return;
    const o = this.count++ * STRIDE;
    const d = this.data;
    d[o] = x;
    d[o + 1] = y + 0.04;
    d[o + 2] = z;
    d[o + 3] = t0;
    d[o + 4] = radius;
    d[o + 5] = strength;
    d[o + 6] = life;
    d[o + 7] = splash;
  }

  end(): void {
    this.geometry.instanceCount = this.count;
    this.mesh.visible = this.count > 0;
    if (!this.count) return;
    this.buffer.clearUpdateRanges();
    this.buffer.addUpdateRange(0, this.count * STRIDE);
    this.buffer.needsUpdate = true;
  }
}

const VERTEX = /* glsl */ `
attribute vec4 iAt;
attribute vec4 iRing;
uniform float uTime;
varying vec2 vUv;
varying float vAge;
varying vec2 vRing;
#include <common>
#include <fog_pars_vertex>
void main() {
  float age = (uTime - iAt.w) / max(iRing.z, 0.01);
  // Grows fast, then slower; nothing outside its life.
  float live = step(0.0, age) * step(age, 1.0);
  float r = iRing.x * (0.2 + 0.8 * (1.0 - (1.0 - age) * (1.0 - age))) * live;
  vUv = position.xz;
  vAge = clamp(age, 0.0, 1.0);
  vRing = iRing.yw;
  vec4 mvPosition = modelViewMatrix * vec4(iAt.xyz + vec3(position.x * r, 0.0, position.z * r), 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv;
varying float vAge;
varying vec2 vRing;
#include <common>
#include <fog_pars_fragment>
void main() {
  float d = length(vUv);
  if (d > 1.0) discard;
  float fade = pow(1.0 - vAge, 1.5);
  // The ripple: a thin bright ring at the edge, a fainter one inside it.
  float w = 0.09 + 0.08 * vAge;
  float ring = 1.0 - smoothstep(0.0, w, abs(d - (1.0 - w)));
  ring += 0.45 * (1.0 - smoothstep(0.0, w * 0.8, abs(d - 0.62)));
  // The splash: a white burst at the start.
  float burst = (1.0 - smoothstep(0.1, 0.55, d)) * pow(1.0 - vAge, 5.0) * vRing.y;
  float a = clamp(vRing.x * (ring * fade + burst * 1.4), 0.0, 1.0);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
