import { BoxGeometry, Color, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicMaterial, Sphere, Vector3 } from 'three';
import { hash3 } from '../../voxel/random';
import type { LifeUniforms } from './_sqLife';
import { SWAY_GLSL } from './_sqSway';
import { BULB_MAX, BULB_MIN } from './_sqGlowBodies';

/**
 * The square's edge strings of warm bulbs (`_sqDecor.ts`: from the banners' poles to the flowering trees), swaying
 * in the breeze: the wire and its bulbs in one unlit instanced draw, posed in the vertex shader. Each string hangs
 * from p to q, sagging `sag` m in the middle; it swings sideways round the line between its ends, at most a fifth as
 * far as it sags there (none at the ends), on two slow beats of its own, rising a little as it swings out, as a
 * hanging cord does: `_sqSway.ts`, the same swing as the canopy's strings and lanterns (`_sqGlow.ts`).
 * The wire's pieces are bent at their vertices (each knows where along the string it is), so it never breaks; each
 * bulb hangs under its point. The bulbs glow as the square's other bulbs do (square.ts `bulbs`: warm, ≈ 10 times
 * brighter at night, breathing), small bright points at any distance (≈ 2‥5 px: `_sqGlowBodies.ts` `BULB_MIN`‥`BULB_MAX`);
 * no halo of their own (a world-sized one swelled into a disc by the camera: the bloom's is enough).
 */

export interface StringSpan {
  p: { x: number; y: number; z: number };
  q: { x: number; y: number; z: number };
  /** How far it sags in the middle (m). */
  sag: number;
  /** A bulb every this many m. */
  every: number;
}

/** Where along a string its bulbs hang (u 0‥1, not the ends), as `_sqDecor.ts` lays their halos. */
export function bulbsAlong(s: StringSpan): number[] {
  const len = Math.hypot(s.q.x - s.p.x, s.q.z - s.p.z);
  const n = Math.max(2, Math.round(len / s.every));
  return Array.from({ length: n - 1 }, (_, i) => (i + 1) / n);
}

/** A point of a string hanging still (u 0‥1 along it; bulbs: 0.09 m under it). */
export function hangAt(s: StringSpan, u: number): [number, number, number] {
  return [s.p.x + (s.q.x - s.p.x) * u, s.p.y + (s.q.y - s.p.y) * u - s.sag * 4 * u * (1 - u), s.p.z + (s.q.z - s.p.z) * u];
}

const WIRE = 0x2a2420;
const BULB = new Color(0xffc27a);

const VERTEX = /* glsl */ `
attribute vec4 sA;
attribute vec4 sB;
attribute vec4 sU;
attribute vec3 sCol;
uniform float uLifeT;
uniform vec3 uBulb;
varying vec3 vSwCol;
${SWAY_GLSL}
`;

/** How far the edge strings swing: a fifth of their sag at most (they hang low: `_sqSway.ts` `stringK`). */
const EDGE_K = 0.2;

const POSE = /* glsl */ `
  float isBulb = step(sU.y - sU.x, 1e-4);
  float u = mix(mix(sU.x, sU.y, position.x + 0.5), sU.x, isBulb);
  vec3 span = sB.xyz - sA.xyz;
  vec3 sideways = normalize(vec3(-span.z, 0.0, span.x));
  float bow = 4.0 * u * (1.0 - u);
  vec3 at = sA.xyz + span * u - vec3(0.0, sA.w * bow, 0.0) + nyeStringSway(span, sA.w, ${EDGE_K.toFixed(2)}, sB.w, u, uLifeT);
  vec3 along = normalize(span - vec3(0.0, sA.w * 4.0 * (1.0 - 2.0 * u), 0.0));
  vec3 across = cross(along, sideways);
  vec3 wire = at + (sideways * position.z + across * position.y) * sU.z;
  // (a bulb a small bright point at any distance, as the square's other bulbs: _sqGlow.ts clampBulbs)
  vec3 bulbAt = at + vec3(0.0, -0.09, 0.0);
  float bulbN = sU.z * projectionMatrix[1][1] / max(-(modelViewMatrix * vec4(bulbAt, 1.0)).z, 0.05);
  vec3 bulb = bulbAt + position * sU.z * clamp(bulbN, ${BULB_MIN.toFixed(4)}, ${BULB_MAX.toFixed(4)}) / max(bulbN, 1e-5);
  vec3 swayAt = mix(wire, bulb, isBulb);
  vSwCol = mix(sCol, uBulb * sU.w * (1.0 - 0.5 * smoothstep(${BULB_MAX.toFixed(4)}, ${(BULB_MAX * 5).toFixed(4)}, bulbN)), isBulb);
`;

/** The edge strings: wire and bulbs, one draw (none if there are none). */
export function buildSway(spans: readonly StringSpan[], u: LifeUniforms): Mesh | null {
  const a: number[] = [];
  const b: number[] = [];
  const s: number[] = [];
  const col: number[] = [];
  const wire = new Color(WIRE);
  const pts: Vector3[] = [];
  for (const [k, span] of spans.entries()) {
    const len = Math.hypot(span.q.x - span.p.x, span.q.z - span.p.z);
    if (len < 1) continue;
    const phase = hash3(span.p.x, span.p.z, k, 77) * Math.PI * 2;
    const piece = (u0: number, u1: number, size: number, glow: number, c: Color) => {
      a.push(span.p.x, span.p.y, span.p.z, span.sag);
      b.push(span.q.x, span.q.y, span.q.z, phase);
      s.push(u0, u1, size, glow);
      col.push(c.r, c.g, c.b);
    };
    const pieces = Math.max(4, Math.round(len / 1.2));
    for (let i = 0; i < pieces; i++) piece(i / pieces, (i + 1) / pieces, 0.025, 0, wire);
    for (const [i, t] of bulbsAlong(span).entries()) {
      const [x, , z] = hangAt(span, t);
      piece(t, t, 0.11, 0.8 + 0.4 * hash3(x, z, i + 1, 3), wire);
    }
    pts.push(new Vector3(span.p.x, span.p.y, span.p.z), new Vector3(span.q.x, span.q.y, span.q.z));
  }
  const n = s.length / 4;
  if (!n) return null;
  const box = new BoxGeometry(1, 1, 1);
  const geo = new InstancedBufferGeometry();
  geo.setIndex(box.getIndex());
  geo.setAttribute('position', box.getAttribute('position'));
  geo.setAttribute('sA', new InstancedBufferAttribute(new Float32Array(a), 4));
  geo.setAttribute('sB', new InstancedBufferAttribute(new Float32Array(b), 4));
  geo.setAttribute('sU', new InstancedBufferAttribute(new Float32Array(s), 4));
  geo.setAttribute('sCol', new InstancedBufferAttribute(new Float32Array(col), 3));
  geo.instanceCount = n;
  geo.boundingSphere = new Sphere().setFromPoints(pts);
  geo.boundingSphere.radius += 2;
  const material = new MeshBasicMaterial({ color: 0xffffff });
  material.name = 'nye:life:strings';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX}`)
      .replace('#include <begin_vertex>', `${POSE}\n  vec3 transformed = swayAt;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSwCol;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vSwCol;');
  };
  material.customProgramCacheKey = () => 'nye-life-strings';
  const mesh = new Mesh(geo, material);
  mesh.name = 'nye:life:strings';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = () => {};
  return mesh;
}

/** The bulbs' colour now (linear, into `u.uBulb`): as square.ts's `bulbs` lamps (0.35 by day, 3.4 at night, breathing). */
export function bulbLight(out: Color, night: number, t: number): Color {
  const n = Math.max(0, Math.min(1, (night - 0.1) / 0.75));
  const k = n * n * (3 - 2 * n);
  return out.copy(BULB).multiplyScalar((0.35 + (3.4 - 0.35) * k) * (1 + 0.05 * Math.sin(t * 0.9) * k));
}
