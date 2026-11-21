import { BoxGeometry, BufferGeometry, Color, Euler, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { FLICKER_GLSL } from './_sqLightFlicker';
import { STILL, SWAY_GLSL, type Sway } from './_sqSway';

/**
 * The square's glowing bodies and wires (`_sqGlow.ts`), swaying in the breeze (`_sqSway.ts`), posed in their vertex
 * shaders from the glow's clock:
 *
 * - **Bodies**: bulbs, lantern bodies and flames, and the hanging lanterns' wood (their tower tops' tiers and gilt
 *   buds, eaves and rings: they swing with their lanterns, so they are here, not in the square's still voxel mesh). One
 *   instanced draw, unlit: what glows is its colour × a level over 1.0 at night (the bloom), flames and lanterns
 *   flickering (`_sqLightFlicker.ts`); the wood is its colour × the time of day's light by the way its face turns, and
 *   at night warm on the face turned to its own lantern's glow (an eave's underside, a bottom ring's top).
 * - **Wires**: the canopy's strings and the lanterns' cords, one line draw; each vertex knows its sway.
 */

/** A face of a lantern's wood turned to its lantern's light: none, the light under it (its underside lit), over it. */
export type Toward = 0 | 1 | -1;

interface Item {
  p: [number, number, number];
  s: [number, number, number];
  c: number;
  k: number;
  ry: number;
  flick: number;
  glows: number;
  toward: Toward;
  sway: Sway;
}

export class Bodies {
  private readonly items: Item[] = [];

  get count(): number {
    return this.items.length;
  }

  /** A glowing box: colour (sRGB) × k; `flick` 0 a bulb (steady) ‥ 1 a flame; how it sways. */
  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number, k: number, ry = 0, flick = 0, sway: Sway = STILL): void {
    this.items.push({ p: [x, y, z], s: [sx, sy, sz], c, k, ry, flick, glows: 1, toward: 0, sway });
  }

  /** A box of a lantern's wood (or gilt): colour (sRGB) × shade, lit as the hour is, warm on the face `toward` its lantern. */
  wood(x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number, shade: number, toward: Toward, sway: Sway): void {
    this.items.push({ p: [x, y, z], s: [sx, sy, sz], c, k: shade, ry: 0, flick: 0, glows: 0, toward, sway });
  }

  build(): { mesh: InstancedMesh; update(night: number, event: number, t: number): void } | null {
    const n = this.items.length;
    if (!n) return null;
    const u = { uSwayT: { value: 0 }, uBodyLevel: { value: 1 }, uWood: { value: new Vector3(1, 0, 0) } };
    const material = new MeshBasicMaterial({ color: 0xffffff });
    material.name = 'nye:glow:bodies';
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${BODY_VERTEX}`)
        .replace('#include <color_vertex>', `#include <color_vertex>\n${BODY_COLOUR}`)
        .replace('#include <project_vertex>', BODY_PROJECT);
    };
    material.customProgramCacheKey = () => 'nye-glow-bodies';
    const geo = new BoxGeometry(1, 1, 1);
    const per = (size: number, f: (it: Item) => readonly number[]) => new InstancedBufferAttribute(new Float32Array(this.items.flatMap(f)), size);
    geo.setAttribute('aFlick', per(1, (it) => [0.16 * it.flick]));
    geo.setAttribute('aSkin', per(2, (it) => [it.glows, it.toward]));
    geo.setAttribute('aSwA', per(4, (it) => it.sway.slice(0, 4)));
    geo.setAttribute('aSwB', per(4, (it) => it.sway.slice(4, 8)));
    geo.setAttribute('aSwC', per(4, (it) => it.sway.slice(8, 12)));
    const mesh = new InstancedMesh(geo, material, n);
    mesh.name = 'nye:glow:bodies';
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    const v = new Vector3();
    const s = new Vector3();
    const c = new Color();
    this.items.forEach((it, i) => {
      q.setFromEuler(e.set(0, it.ry, 0));
      m.compose(v.set(...it.p), q, s.set(...it.s));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setHex(it.c).multiplyScalar(it.k));
    });
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.raycast = () => {};
    mesh.computeBoundingSphere();
    // (what sways reaches out of where it hangs still)
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 1;
    return {
      mesh,
      update(night, event, t) {
        const lit = smooth(0.1, 0.85, night);
        // Paper and glass by day (a little warm), over 1.0 at night for the bloom (a soft one: hundreds of bulbs).
        u.uBodyLevel.value = (0.6 + 2.1 * lit) * (1 + 0.12 * event);
        // (the wood: dark lacquer in the day's light, half in the shade of what it hangs from, and the night's; its
        // lantern's glow on it at night)
        u.uWood.value.set(0.62 - 0.5 * lit, 2.2 * lit * (1 + 0.12 * event), 0);
        u.uSwayT.value = t;
      },
    };
  }
}

const BODY_VERTEX = /* glsl */ `
attribute float aFlick;
attribute vec2 aSkin;
attribute vec4 aSwA;
attribute vec4 aSwB;
attribute vec4 aSwC;
uniform float uSwayT;
uniform float uBodyLevel;
uniform vec3 uWood;
${FLICKER_GLSL}
${SWAY_GLSL}
`;

// What glows: × its level, flickering by its own place (aFlick 0 a bulb); the wood (aSkin.x 0): the hour's light by the
// way its face turns, its lantern's warm glow on the face turned to it (aSkin.y: the light under it 1, over it −1).
const BODY_COLOUR = /* glsl */ `
  float bodyFlick = 1.0 + aFlick * nyeFlicker(instanceMatrix[3].xz, uSwayT);
  float woodFace = 0.6 + 0.26 * normal.y + 0.14 * abs(normal.x);
  vec3 woodLight = vec3(uWood.x * woodFace) + uWood.y * max(0.0, -normal.y * aSkin.y) * vec3(1.0, 0.58, 0.28);
  vColor.rgb *= mix(woodLight, vec3(uBodyLevel * bodyFlick), aSkin.x);
`;

// (as three's project_vertex, the instance placed, then moved by its sway: the mesh stays at the origin, FROZEN)
const BODY_PROJECT = /* glsl */ `
  vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
  mvPosition.xyz = nyeSwayAt(mvPosition.xyz, aSwA, aSwB, aSwC, uSwayT);
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;
`;

/** The canopy's wires and the lanterns' cords: segments, each end with its sway (one line draw). */
export class Wires {
  private readonly pos: number[] = [];
  private readonly sway: number[] = [];

  /** A straight piece from a to b, each end moving with its own sway. */
  add(a: readonly [number, number, number], swayA: Sway, b: readonly [number, number, number], swayB: Sway): void {
    this.pos.push(...a, ...b);
    this.sway.push(...swayA, ...swayB);
  }

  build(): { mesh: LineSegments; time: { value: number } } {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    const n = this.pos.length / 3;
    const take = (off: number) => {
      const a = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) a[i * 4 + k] = this.sway[i * 12 + off + k];
      return new Float32BufferAttribute(a, 4);
    };
    geo.setAttribute('aSwA', take(0));
    geo.setAttribute('aSwB', take(4));
    geo.setAttribute('aSwC', take(8));
    geo.computeBoundingSphere();
    if (geo.boundingSphere) geo.boundingSphere.radius += 1;
    const time = { value: 0 };
    const material = new LineBasicMaterial({ color: 0x241e1a, fog: true });
    material.name = 'nye:glow:wires';
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uSwayT = time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nattribute vec4 aSwA;\nattribute vec4 aSwB;\nattribute vec4 aSwC;\nuniform float uSwayT;\n${SWAY_GLSL}`)
        .replace('#include <begin_vertex>', 'vec3 transformed = nyeSwayAt(position, aSwA, aSwB, aSwC, uSwayT);');
    };
    material.customProgramCacheKey = () => 'nye-glow-wires';
    const mesh = new LineSegments(geo, material);
    mesh.name = 'nye:glow:wires';
    mesh.raycast = () => {};
    return { mesh, time };
  }
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
