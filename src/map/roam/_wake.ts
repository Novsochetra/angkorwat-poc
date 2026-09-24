import { Color, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry, ShaderMaterial, UniformsLib, UniformsUtils } from 'three';
import { NOISE_GLSL } from '../water/glsl';

/**
 * The boat's marks on the water, one instanced draw for all: foam streaks
 * of the V wake, rings where the paddle dips and round a still hull, foam
 * and droplets of a splash. Flat marks lie on the water, droplets face the
 * camera; all fade with the scene's fog.
 */
export interface Wake {
  readonly object: Mesh;
  /** A ring that widens and fades (m, s). */
  ring(x: number, y: number, z: number, r0: number, r1: number, life: number, alpha: number, stretch?: number, spin?: number): void;
  /**
   * A patch of foam drifting at (vx, vz), growing from size0 to size1 (width
   * across, length along `spin`, a heading like `rotation.y`).
   */
  foam(x: number, y: number, z: number, vx: number, vz: number, w0: number, l0: number, w1: number, l1: number, spin: number, life: number, alpha: number): void;
  /** A droplet thrown up (falls back and ends at `floor`). */
  drop(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, floor: number): void;
  /** Age everything by dt (s). */
  update(dt: number): void;
  /** Wipe every mark at once. */
  clear(): void;
  /** Colour of the foam (linear), from the time of day. */
  readonly color: Color;
}

const CAP = 240;
const KIND = { ring: 0, foam: 1, drop: 2 } as const;
const GRAVITY = 14;

export function createWake(): Wake {
  // Particle state (CPU).
  const px = new Float32Array(CAP);
  const py = new Float32Array(CAP);
  const pz = new Float32Array(CAP);
  const vx = new Float32Array(CAP);
  const vy = new Float32Array(CAP);
  const vz = new Float32Array(CAP);
  const age = new Float32Array(CAP);
  const life = new Float32Array(CAP);
  const w0 = new Float32Array(CAP);
  const l0 = new Float32Array(CAP);
  const w1 = new Float32Array(CAP);
  const l1 = new Float32Array(CAP);
  const a0 = new Float32Array(CAP);
  const spin = new Float32Array(CAP);
  const floor = new Float32Array(CAP);
  const kind = new Uint8Array(CAP);
  const seed = new Float32Array(CAP);
  let next = 0;
  let count = 0;

  const quad = new PlaneGeometry(1, 1);
  const geo = new InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  const aP = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
  const aS = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
  geo.setAttribute('aP', aP);
  geo.setAttribute('aS', aS);
  geo.instanceCount = 0;

  const color = new Color(1, 1, 1);
  const material = new ShaderMaterial({
    name: 'boat wake',
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uColor: { value: new Color() } }]),
    vertexShader: WAKE_VERT,
    fragmentShader: WAKE_FRAG,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
  material.uniforms.uColor.value = color;
  const object = new Mesh(geo, material);
  object.name = 'boat wake';
  object.frustumCulled = false;
  object.renderOrder = 2;

  const spawn = (k: number, x: number, y: number, z: number): number => {
    const i = next;
    next = (next + 1) % CAP;
    px[i] = x;
    py[i] = y;
    pz[i] = z;
    vx[i] = vy[i] = vz[i] = 0;
    age[i] = 0;
    kind[i] = k;
    spin[i] = 0;
    floor[i] = -1e4;
    // (a fixed look per mark: its noise must not slide while it drifts)
    seed[i] = ((count++ * 0.618034) % 1) * 0.99;
    return i;
  };

  return {
    object,
    color,
    ring(x, y, z, r0, r1, t, alpha, stretch = 1, sp = 0) {
      const i = spawn(KIND.ring, x, y, z);
      w0[i] = r0 * 2;
      l0[i] = r0 * 2 * stretch;
      w1[i] = r1 * 2;
      l1[i] = r1 * 2 * stretch;
      spin[i] = sp;
      life[i] = t;
      a0[i] = alpha;
    },
    foam(x, y, z, fx, fz, ww0, ll0, ww1, ll1, sp, t, alpha) {
      const i = spawn(KIND.foam, x, y, z);
      vx[i] = fx;
      vz[i] = fz;
      w0[i] = ww0;
      l0[i] = ll0;
      w1[i] = ww1;
      l1[i] = ll1;
      spin[i] = sp;
      life[i] = t;
      a0[i] = alpha;
    },
    drop(x, y, z, dx, dy, dz, size, t, fl) {
      const i = spawn(KIND.drop, x, y, z);
      vx[i] = dx;
      vy[i] = dy;
      vz[i] = dz;
      w0[i] = l0[i] = size;
      w1[i] = l1[i] = size * 0.6;
      life[i] = t;
      a0[i] = 0.85;
      floor[i] = fl;
    },
    clear() {
      age.fill(0);
      life.fill(0);
      geo.instanceCount = 0;
    },
    update(dt) {
      const P = aP.array as Float32Array;
      const S = aS.array as Float32Array;
      let n = 0;
      const drag = Math.exp(-dt * 0.8);
      for (let i = 0; i < CAP; i++) {
        if (age[i] >= life[i]) continue;
        age[i] += dt;
        if (kind[i] === KIND.drop) {
          vy[i] -= GRAVITY * dt;
          if (py[i] < floor[i]) age[i] = life[i];
        } else {
          vx[i] *= drag;
          vz[i] *= drag;
        }
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        pz[i] += vz[i] * dt;
        const u = Math.min(1, age[i] / life[i]);
        if (u >= 1) continue;
        const grow = 1 - (1 - u) * (1 - u);
        const fade = Math.min(1, u * 8) * Math.pow(1 - u, 1.5);
        P[n * 4] = px[i];
        P[n * 4 + 1] = py[i];
        P[n * 4 + 2] = pz[i];
        P[n * 4 + 3] = spin[i];
        S[n * 4] = w0[i] + (w1[i] - w0[i]) * grow;
        S[n * 4 + 1] = l0[i] + (l1[i] - l0[i]) * grow;
        S[n * 4 + 2] = a0[i] * fade;
        S[n * 4 + 3] = kind[i] + seed[i] * 0.45;
        n++;
      }
      geo.instanceCount = n;
      aP.needsUpdate = true;
      aS.needsUpdate = true;
    },
  };
}

const WAKE_VERT = /* glsl */ `
attribute vec4 aP;
attribute vec4 aS;
varying vec2 vUv;
varying float vA;
varying float vKind;
varying float vSeed;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition;
  if (aS.w < 1.5) {
    // Flat on the water: width across, length along the heading aP.w.
    float c = cos(aP.w);
    float s = sin(aP.w);
    vec2 q = vec2(position.x * aS.x, position.y * aS.y);
    mvPosition = modelViewMatrix * vec4(aP.x + c * q.x + s * q.y, aP.y, aP.z - s * q.x + c * q.y, 1.0);
  } else {
    mvPosition = modelViewMatrix * vec4(aP.xyz, 1.0);
    mvPosition.xy += position.xy * aS.x;
  }
  vUv = position.xy * 2.0;
  vA = aS.z;
  vKind = aS.w;
  vSeed = fract(aS.w) * 2.2;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const WAKE_FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv;
varying float vA;
varying float vKind;
varying float vSeed;
#include <common>
#include <fog_pars_fragment>
${NOISE_GLSL}
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float a;
  if (vKind < 0.5) {
    // Ring: a soft band near the rim, broken here and there.
    a = smoothstep(0.55, 0.82, r) * (1.0 - smoothstep(0.86, 1.0, r));
    a *= 0.55 + 0.45 * wNoise(vUv * 3.0 + vSeed * 17.0);
  } else if (vKind < 1.5) {
    // Foam: streaky along its length, broken, thinning to the edge.
    float n = wNoise(vec2(vUv.x * 3.2, vUv.y * 1.1) + vSeed * 23.0) * 0.6 + wNoise(vec2(vUv.x * 7.0, vUv.y * 2.6) + vSeed * 7.0) * 0.4;
    a = smoothstep(0.38, 0.78, n + 0.3 * (1.0 - r)) * (1.0 - smoothstep(0.25, 1.0, r));
  } else {
    a = 1.0 - smoothstep(0.35, 1.0, r);
  }
  gl_FragColor = vec4(uColor, a * vA);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;
