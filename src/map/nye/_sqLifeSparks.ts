import { AdditiveBlending, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry, ShaderMaterial, Sphere, Vector3 } from 'three';
import { hazeUniforms } from '../sky/haze';
import type { LifeUniforms } from './_sqLife';

/**
 * Little lights round the festival square at night (AWP-35; `_sqLife.ts` says where), one additive draw of quads
 * turned to the camera, all moving in the vertex shader from the clock:
 *
 * - **fireflies**: soft warm-green glows wandering a metre or two round their spot, each glowing up for about a
 *   second every 3‥7 s and dimmer between (the map's own, road/fireflies.ts, in the square's colour), smaller as the
 *   camera comes close (a firefly's own small light), never under 3 px far off;
 * - **embers** rising from the fire bowls: a spark leaves the fire, climbs 1‥4 m, swirls and drifts west with the
 *   evening breeze (the flags fly that way), cooling from orange to nothing.
 *
 * A kind is a value (0 firefly, 1 ember) that mixes the two motions: no branches. Faded into the haze as the
 * festival's glows are (festival/_glow.ts).
 */

export const SPARK = { firefly: 0, ember: 1 } as const;

const VERTEX = /* glsl */ `
#include <fog_pars_vertex>
attribute vec4 gPos;
attribute vec4 gSeed;
uniform float uLifeT;
uniform float uFlies;
uniform float uFire;
uniform float uPxPerM;
uniform float uPx;
varying vec2 vUv;
varying vec3 vCol;
const vec3 FIREFLY = vec3(0.72, 1.0, 0.3);
const vec3 EMBER = vec3(1.0, 0.42, 0.1);
void main() {
  float t = uLifeT;
  vec4 s = gSeed * 6.2831853;
  float kind = gPos.w;
  // A firefly: slow wandering on its own clock; a glow for about a second every 3–7 s, a faint light between.
  float rate = 0.75 + 0.5 * gSeed.w;
  vec3 wander = 1.4 * vec3(
    sin(t * 0.23 * rate + s.x) + 0.5 * sin(t * 0.51 + s.y),
    0.45 * sin(t * 0.37 * rate + s.z),
    cos(t * 0.19 * rate + s.y) + 0.5 * cos(t * 0.43 + s.x));
  float ph = fract(t / (3.0 + 4.0 * gSeed.x) + gSeed.y);
  float flash = smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.18, 0.42, ph));
  float fly = uFlies * (0.5 + 2.0 * flash);
  // An ember: up from the fire, west on the breeze, swirling, cooling.
  float life = 1.4 + 1.8 * gSeed.x;
  float tau = fract(t / life + gSeed.y);
  float up = tau * life;
  vec3 rise = vec3(-0.32 * up + 0.22 * tau * sin(t * 3.3 + s.z), up * (0.75 + 0.55 * gSeed.w), 0.18 * tau * sin(t * 2.6 + s.w));
  float ember = 3.0 * uFire * pow(1.0 - tau, 1.5) * smoothstep(0.0, 0.08, tau) * (0.65 + 0.35 * sin(t * 19.0 + s.z * 5.0));
  vec3 p = gPos.xyz + mix(wander, rise, kind);
  float level = mix(fly, ember, kind);
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  float dist = max(0.5, -mvPosition.z);
  // Its size (m): a firefly's glow 0.5 (less close by), an ember 0.11 shrinking as it cools; 3‥22 px on the screen.
  float size = mix(0.5 * mix(0.3, 1.0, smoothstep(3.0, 30.0, dist)), 0.11 * (1.0 - 0.5 * tau), kind);
  float perPx = dist / uPxPerM;
  float w = clamp(size, 3.0 * uPx * perPx, 22.0 * uPx * perPx);
  // (a dot drawn bigger than it is keeps about its light)
  vCol = mix(FIREFLY, EMBER, kind) * level * clamp(size / w, 0.35, 1.0);
  mvPosition.xy += position.xy * w;
  gl_Position = projectionMatrix * mvPosition;
  if (level < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vUv = position.xy * 2.0;
  #include <fog_vertex>
}`;

const FRAGMENT = /* glsl */ `
#include <fog_pars_fragment>
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 >= 1.0) discard;
  // A bright heart in a soft halo (no bloom on the low level: the halo is its own).
  float a = exp(-r2 * 9.0) + 0.45 * exp(-r2 * 2.6) * (1.0 - r2);
  vec3 col = vCol * a * 2.0;
  #ifdef USE_FOG
    vec3 hzRay = vFogWorld - cameraPosition;
    float hzDist = length(hzRay);
    float low = hazeLowAmount(cameraPosition, vFogWorld, hzDist, hazeBanks(vFogWorld.xz).x);
    col *= (1.0 - hazeDistance(hzDist)) * (1.0 - 0.7 * low);
  #endif
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sparks {
  private readonly data: number[] = [];

  get count(): number {
    return this.data.length / 8;
  }

  /** A firefly round (x, y, z), or an ember from a fire at (x, y, z); `seed` four values 0‥1 of its own. */
  add(kind: number, x: number, y: number, z: number, seed: [number, number, number, number]): void {
    this.data.push(x, y, z, kind, ...seed);
  }

  build(u: LifeUniforms): Mesh | null {
    const n = this.count;
    if (!n) return null;
    const quad = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.setIndex(quad.getIndex());
    geo.setAttribute('position', quad.getAttribute('position'));
    const pos = new Float32Array(n * 4);
    const seed = new Float32Array(n * 4);
    const pts: Vector3[] = [];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 4; k++) {
        pos[i * 4 + k] = this.data[i * 8 + k];
        seed[i * 4 + k] = this.data[i * 8 + 4 + k];
      }
      pts.push(new Vector3(pos[i * 4], pos[i * 4 + 1], pos[i * 4 + 2]));
    }
    geo.setAttribute('gPos', new InstancedBufferAttribute(pos, 4));
    geo.setAttribute('gSeed', new InstancedBufferAttribute(seed, 4));
    geo.instanceCount = n;
    // (they wander ≈ 2.1 m, embers climb ≤ 4.5 m and drift ≤ 1.5 m west)
    geo.boundingSphere = new Sphere().setFromPoints(pts);
    geo.boundingSphere.radius += 5;
    const material = new ShaderMaterial({
      name: 'nye:life:sparks',
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: true,
      uniforms: { ...hazeUniforms(), ...u },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    const mesh = new Mesh(geo, material);
    mesh.name = 'nye:life:sparks';
    mesh.renderOrder = 12;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.raycast = () => {};
    return mesh;
  }
}
