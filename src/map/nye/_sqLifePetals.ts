import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshLambertMaterial, Sphere, Vector3 } from 'three';
import type { LifeUniforms } from './_sqLife';

/**
 * Petals falling from the square's flowering trees (AWP-35; the trees: `_sqGarden.ts` `NYE_TREES`), one instanced
 * draw: each petal leaves the crown's underside and sinks swinging from side to side as a falling leaf does, half of
 * them rocking (tilting into each swing), half tumbling over and over, drifts west on the breeze, settles flat where it
 * lands (on the ground, the pavers or the stream), lies there a few seconds and fades, then falls again from the crown. Where it lands is worked out once on the CPU (`add`); the fall
 * between is the vertex shader's, from the clock. Lit as the blossom is, with a little light of its own at night
 * (the lanterns in the trees).
 */

const VERTEX = /* glsl */ `
attribute vec4 pA;
attribute vec4 pB;
attribute vec4 pS;
attribute vec3 pCol;
uniform float uLifeT;
uniform float uPetalGlow;
varying vec3 vPCol;
varying vec3 vPGlow;
`;

/** The pose: along its fall (start pA.xyz → landing pB.xyz in pA.w s), rocking, then lying a while (pB.w s). */
const POSE = /* glsl */ `
  float fallT = pA.w;
  float cycle = fallT + pB.w;
  float tau = fract(uLifeT / cycle + pS.x) * cycle;
  float tf = min(tau, fallT);
  float along = tf / fallT;
  float falling = 1.0 - step(fallT, tau);
  float rock = falling * sin(tf * (2.2 + 1.6 * pS.y) + pS.z * 6.2831853) * smoothstep(0.0, 0.12, along);
  float yaw = pS.w * 6.2831853 + 0.7 * tf;
  float cy = cos(yaw);
  float sy = sin(yaw);
  vec3 swing = vec3(sy, 0.0, cy);
  vec3 at = mix(pA.xyz, pB.xyz, along) + swing * (0.38 * rock * (1.0 - along * along)) + vec3(0.0, 0.07 * rock * rock * falling, 0.0);
  // (half of them rock flat-ish as a leaf, half tumble over and over; all lie flat as they land)
  float tumbler = step(0.5, pS.w);
  float tilt = mix(0.85 * rock, tf * (2.4 + 2.0 * pS.y), tumbler) * falling * (1.0 - smoothstep(0.88, 1.0, along));
  float ct = cos(tilt);
  float st = sin(tilt);
  mat3 turn = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy) * mat3(1.0, 0.0, 0.0, 0.0, ct, st, 0.0, -st, ct);
  float grow = smoothstep(0.0, 0.5, tau) * (1.0 - smoothstep(cycle - 1.6, cycle, tau));
  float size = (0.2 + 0.1 * pS.y) * grow;
  vec3 objectNormal = turn * vec3(0.0, 1.0, 0.0);
  vec3 petalAt = at + turn * (position * size);
  vPCol = pCol;
  vPGlow = pCol * uPetalGlow;
`;

export class Petals {
  private readonly data: number[] = [];
  private readonly c = new Color();

  get count(): number {
    return this.data.length / 15;
  }

  /** A petal: from `from` to `to` (world m) in `fall` s, then lying `rest` s; colour (sRGB); `seed` four values 0‥1. */
  add(from: [number, number, number], to: [number, number, number], fall: number, rest: number, color: number, seed: [number, number, number, number]): void {
    this.c.setHex(color);
    this.data.push(...from, fall, ...to, rest, ...seed, this.c.r, this.c.g, this.c.b);
  }

  build(u: LifeUniforms): Mesh | null {
    const n = this.count;
    if (!n) return null;
    const shape = petalGeometry();
    const geo = new InstancedBufferGeometry();
    geo.setIndex(shape.getIndex());
    geo.setAttribute('position', shape.getAttribute('position'));
    geo.setAttribute('normal', shape.getAttribute('normal'));
    const take = (off: number, size: number) => {
      const a = new Float32Array(n * size);
      for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) a[i * size + k] = this.data[i * 15 + off + k];
      return new InstancedBufferAttribute(a, size);
    };
    geo.setAttribute('pA', take(0, 4));
    geo.setAttribute('pB', take(4, 4));
    geo.setAttribute('pS', take(8, 4));
    geo.setAttribute('pCol', take(12, 3));
    geo.instanceCount = n;
    const pts: Vector3[] = [];
    for (let o = 0; o < this.data.length; o += 15) pts.push(new Vector3(this.data[o], this.data[o + 1], this.data[o + 2]), new Vector3(this.data[o + 4], this.data[o + 5], this.data[o + 6]));
    geo.boundingSphere = new Sphere().setFromPoints(pts);
    geo.boundingSphere.radius += 1;
    const material = new MeshLambertMaterial({ color: 0xffffff, side: DoubleSide });
    material.name = 'nye:life:petals';
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERTEX}`)
        .replace('#include <beginnormal_vertex>', POSE)
        .replace('#include <begin_vertex>', 'vec3 transformed = petalAt;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPCol;\nvarying vec3 vPGlow;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vPCol;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vPGlow;');
    };
    material.customProgramCacheKey = () => 'nye-life-petals';
    const mesh = new Mesh(geo, material);
    mesh.name = 'nye:life:petals';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.raycast = () => {};
    return mesh;
  }
}

/** A petal lying flat: a rounded teardrop 1 m long (z) and 0.7 m wide (scaled in the shader), fanned from its middle. */
function petalGeometry(): BufferGeometry {
  const pos: number[] = [0, 0, 0];
  const idx: number[] = [];
  const k = 10;
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2;
    // (fuller at the tip, narrow at the stalk end)
    const r = 0.5 * (0.78 + 0.22 * Math.cos(a));
    pos.push(Math.sin(a) * r * 0.7, 0.04 * Math.cos(a * 2), Math.cos(a) * r);
    idx.push(0, 1 + i, 1 + ((i + 1) % k));
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);
  return geo;
}
