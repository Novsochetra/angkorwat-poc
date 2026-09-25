import {
  Color,
  DynamicDrawUsage,
  Euler,
  Float32BufferAttribute,
  Frustum,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Sphere,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import type { AnimalCallKind, MapFrame } from '../types';

/**
 * Shared kit of the water and air animals: blocky models made of boxes with
 * a simple rig, drawn with one instanced mesh per group of species.
 *
 * - A model (`Shape`) is a list of boxes. Each box belongs to a joint of the
 *   rig (head, wings, tail, legs…) and turns about that joint's pivot.
 * - Every animal is 20 numbers in one interleaved buffer (`Herd`): where it
 *   is, its turn, the angles of its joints and a tint. The vertex shader
 *   turns the parts and the body from them, so the CPU writes 20 floats per
 *   animal and one upload per mesh a frame. Only animals near and in view are
 *   written (the instance count shrinks to them).
 * - Several species can share a mesh: each box knows its model (`kind`), and
 *   an animal only shows the boxes of its own kind (the others collapse to a
 *   point and draw nothing).
 * - The material is a lit MeshStandardMaterial, so the animals take the
 *   map's sun or moon, sky light and haze. No shadows.
 *
 * Model frame: +Z forward, +Y up, +X the animal's left; metres.
 */

/** Joints of the rig. */
export const J = {
  body: 0,
  /** Head and neck: pitch (+ = down) then yaw about the pivot. */
  head: 1,
  /** Open wings (shown while `open` > 0.5): roll up by the wing angle about the shoulder. */
  wingL: 2,
  wingR: 3,
  /** Hands of the open wings: bend a little more at the wrist. */
  tipL: 4,
  tipR: 5,
  /** Folded wings (shown while `open` ≤ 0.5). */
  folded: 6,
  /** Tail: pitch up by `tail`. */
  tail: 7,
  /** Legs: swing by ±`leg` about the hip, both back by `hind` (tucked in flight). */
  legL: 8,
  legR: 9,
  /** Throat: puffs up by `throat` (a frog's croak). */
  throat: 10,
  /** Tail fin: wags sideways by `throat`. */
  fin: 11,
  /** Hind legs: kick back by `hind` (a frog's hop). */
  hind: 12,
} as const;
export type Joint = (typeof J)[keyof typeof J];

export interface BoxSpec {
  /** Centre and size (m) in the model frame. */
  at: [number, number, number];
  size: [number, number, number];
  /** sRGB hex. */
  color: number;
  joint?: Joint;
  /** Joint pivot (m), for every joint but the body. */
  pivot?: [number, number, number];
  /** Turn of the box about its centre (radians, x then y then z). */
  rot?: [number, number, number];
  /** 1 = takes the animal's tint (plumage), 0 = keeps its colour (bill, eyes, legs). Default 1. */
  tone?: number;
}

/** Box faces: normal, then the four corners (as signs of the half size). */
const FACES: [number[], number[][]][] = [
  [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
  [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
  [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
  [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
  [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
  [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
];

/** A model: boxes on a rig. `kind` tells it from the other models of its mesh. */
export class Shape {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly col: number[] = [];
  readonly rig: number[] = [];
  readonly part: number[] = [];
  boxes = 0;
  private readonly m = new Matrix4();
  private readonly v = new Vector3();
  private readonly c = new Color();

  constructor(readonly kind = 0) {}

  box(b: BoxSpec): this {
    const [cx, cy, cz] = b.at;
    const [hx, hy, hz] = [b.size[0] / 2, b.size[1] / 2, b.size[2] / 2];
    const joint = b.joint ?? J.body;
    const pv = b.pivot ?? [0, 0, 0];
    const tone = b.tone ?? 1;
    this.c.setHex(b.color);
    if (b.rot) this.m.makeRotationFromEuler(EULER.set(b.rot[0], b.rot[1], b.rot[2]));
    else this.m.identity();
    for (const [n, corners] of FACES) {
      this.v.set(n[0], n[1], n[2]).transformDirection(this.m);
      const [nx, ny, nz] = [this.v.x, this.v.y, this.v.z];
      const quad: number[][] = corners.map(([sx, sy, sz]) => {
        this.v.set(sx * hx, sy * hy, sz * hz).applyMatrix4(this.m);
        return [cx + this.v.x, cy + this.v.y, cz + this.v.z];
      });
      for (const k of [0, 1, 2, 0, 2, 3]) {
        this.pos.push(...quad[k]);
        this.nor.push(nx, ny, nz);
        this.col.push(this.c.r, this.c.g, this.c.b);
        this.rig.push(pv[0], pv[1], pv[2], joint);
        this.part.push(tone, this.kind);
      }
    }
    this.boxes++;
    return this;
  }

  /** The same box on both sides (x mirrored); `joint` (if a left one) and its pivot mirror too. */
  pair(b: BoxSpec): this {
    this.box(b);
    const right: Record<number, Joint> = { [J.wingL]: J.wingR, [J.tipL]: J.tipR, [J.legL]: J.legR };
    const joint = b.joint !== undefined ? (right[b.joint] ?? b.joint) : undefined;
    return this.box({
      ...b,
      at: [-b.at[0], b.at[1], b.at[2]],
      joint,
      pivot: b.pivot ? [-b.pivot[0], b.pivot[1], b.pivot[2]] : undefined,
      rot: b.rot ? [b.rot[0], -b.rot[1], -b.rot[2]] : undefined,
    });
  }
}
const EULER = new Euler();

/** Floats per animal in a herd's buffer. */
export const STRIDE = 20;
/** Offsets of the fields in an animal's 20 floats. */
export const F = {
  /** x, y, z, scale (0 = hidden). */
  pose: 0,
  /** yaw (0 = facing +Z), pitch (+ = nose down), roll, kind. */
  turn: 4,
  /** wing angle, wings open (0/1), head pitch, head yaw. */
  anim: 8,
  /** leg swing, tail up, throat / fin, hind legs (legs back). */
  aux: 12,
  /** tint r, g, b (linear, multiplies the plumage), unused. */
  tint: 16,
} as const;

/**
 * One instanced mesh of animals. Each frame: `begin()`, `add(...)` for every
 * animal that shows (then write its joints at the returned offset), `end()`.
 */
export class Herd {
  readonly mesh: Mesh;
  readonly data: Float32Array;
  readonly geometry: InstancedBufferGeometry;
  readonly material: MeshStandardMaterial;
  readonly max: number;
  count = 0;
  private readonly buffer: InstancedInterleavedBuffer;

  constructor(name: string, shapes: Shape[], material: MeshStandardMaterial, max: number) {
    this.max = max;
    this.material = material;
    const g = new InstancedBufferGeometry();
    const cat = (key: 'pos' | 'nor' | 'col' | 'rig' | 'part') => shapes.flatMap((s) => s[key]);
    g.setAttribute('position', new Float32BufferAttribute(cat('pos'), 3));
    g.setAttribute('normal', new Float32BufferAttribute(cat('nor'), 3));
    g.setAttribute('color', new Float32BufferAttribute(cat('col'), 3));
    g.setAttribute('aRig', new Float32BufferAttribute(cat('rig'), 4));
    g.setAttribute('aPart', new Float32BufferAttribute(cat('part'), 2));
    this.data = new Float32Array(max * STRIDE);
    this.buffer = new InstancedInterleavedBuffer(this.data, STRIDE, 1).setUsage(DynamicDrawUsage);
    g.setAttribute('iPose', new InterleavedBufferAttribute(this.buffer, 4, F.pose));
    g.setAttribute('iTurn', new InterleavedBufferAttribute(this.buffer, 4, F.turn));
    g.setAttribute('iAnim', new InterleavedBufferAttribute(this.buffer, 4, F.anim));
    g.setAttribute('iAux', new InterleavedBufferAttribute(this.buffer, 4, F.aux));
    g.setAttribute('iTint', new InterleavedBufferAttribute(this.buffer, 4, F.tint));
    g.instanceCount = 0;
    this.geometry = g;
    this.mesh = new Mesh(g, material);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.visible = false;
    // (the boxes sit at the origin until the shader moves them: nothing to pick)
    this.mesh.raycast = () => {};
  }

  /** Vertices of one animal (all kinds of the mesh). */
  get vertices(): number {
    return this.geometry.getAttribute('position').count;
  }

  begin(): void {
    this.count = 0;
  }

  /** One more animal this frame: its offset in `data` (joints at rest, no tint), or −1 when full. */
  add(x: number, y: number, z: number, scale: number, yaw: number, pitch: number, roll: number, kind: number): number {
    if (this.count >= this.max) return -1;
    const o = this.count++ * STRIDE;
    const d = this.data;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = z;
    d[o + 3] = scale;
    d[o + 4] = yaw;
    d[o + 5] = pitch;
    d[o + 6] = roll;
    d[o + 7] = kind;
    for (let k = 8; k < 16; k++) d[o + k] = 0;
    d[o + 16] = d[o + 17] = d[o + 18] = 1;
    d[o + 19] = 0;
    return o;
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

/**
 * The creatures' material: a MeshStandardMaterial whose vertex shader turns
 * each box about its joint and then the body into place (see `F`).
 * `shoulder`: the left shoulder of the mesh's open wings (for the wing tips).
 */
export function creatureMaterial(name: string, o: { shoulder?: [number, number, number]; emissive?: number; roughness?: number } = {}): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: o.roughness ?? 0.9, metalness: 0, emissive: o.emissive ?? 0 });
  material.name = name;
  const shoulder = { value: new Vector3(...(o.shoulder ?? [0, 0, 0])) };
  material.customProgramCacheKey = () => 'map-creature';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uShoulder = shoulder;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${RIG_PARS}`)
      .replace('#include <color_vertex>', 'vColor = vec4(mix(color, color * iTint.rgb, aPart.x), 1.0);')
      .replace('#include <beginnormal_vertex>', RIG_MAIN)
      .replace('#include <begin_vertex>', 'vec3 transformed = fWorld;');
  };
  return material;
}

const RIG_PARS = /* glsl */ `
attribute vec4 aRig;
attribute vec2 aPart;
attribute vec4 iPose;
attribute vec4 iTurn;
attribute vec4 iAnim;
attribute vec4 iAux;
attribute vec4 iTint;
uniform vec3 uShoulder;
mat3 fRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 fRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 fRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
`;

const RIG_MAIN = /* glsl */ `
  vec3 objectNormal = vec3(normal);
  vec3 fWorld;
  {
    int j = int(aRig.w + 0.5);
    vec3 pv = aRig.xyz;
    vec3 p = position;
    mat3 R = mat3(1.0);
    // Only the boxes of this animal's model; open or folded wings.
    float show = abs(aPart.y - iTurn.w) < 0.5 ? 1.0 : 0.0;
    if (j >= 2 && j <= 5) show *= step(0.5, iAnim.y);
    if (j == 6) show *= 1.0 - step(0.5, iAnim.y);
    if (j == 1) R = fRotY(iAnim.w) * fRotX(iAnim.z);
    else if (j == 2) R = fRotZ(iAnim.x);
    else if (j == 3) R = fRotZ(-iAnim.x);
    else if (j == 7) R = fRotX(-iAux.y);
    else if (j == 8) R = fRotX(iAux.w + iAux.x);
    else if (j == 9) R = fRotX(iAux.w - iAux.x);
    else if (j == 11) R = fRotY(iAux.z);
    else if (j == 12) R = fRotX(-iAux.w);
    if (j == 4 || j == 5) {
      // Hand: bent at the wrist, then the whole wing at the shoulder.
      float sg = j == 4 ? 1.0 : -1.0;
      mat3 tip = fRotZ(sg * iAnim.x * 0.7);
      mat3 arm = fRotZ(sg * iAnim.x);
      vec3 sh = vec3(uShoulder.x * sg, uShoulder.yz);
      p = arm * (tip * (p - pv) + pv - sh) + sh;
      R = arm * tip;
    } else if (j == 10) {
      p = pv + (p - pv) * (1.0 + iAux.z);
    } else {
      p = R * (p - pv) + pv;
    }
    mat3 B = fRotY(iTurn.x) * fRotX(iTurn.y) * fRotZ(iTurn.z);
    objectNormal = B * (R * objectNormal);
    fWorld = iPose.xyz + B * p * (iPose.w * show);
  }
`;

/** What the camera sees this frame: a frustum and a distance test for animals. */
export class View {
  readonly cam = new Vector3();
  private readonly frustum = new Frustum();
  private readonly m = new Matrix4();
  private readonly s = new Sphere();

  set(camera: PerspectiveCamera): void {
    this.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m);
    this.cam.setFromMatrixPosition(camera.matrixWorld);
  }

  /** Distance from the camera (m). */
  dist(x: number, y: number, z: number): number {
    return Math.hypot(x - this.cam.x, y - this.cam.y, z - this.cam.z);
  }

  /** In view: a sphere of radius r at (x, y, z) within `far` m. */
  sees(x: number, y: number, z: number, r: number, far: number): boolean {
    if (this.dist(x, y, z) > far + r) return false;
    this.s.center.set(x, y, z);
    this.s.radius = r;
    return this.frustum.intersectsSphere(this.s);
  }
}

/** Where the roaming explorer is (feet), and whether he is about at all. */
export interface Explorer {
  /** Roaming on foot or by boat (animals react); false in the overview and in the air. */
  near: boolean;
  boat: boolean;
  x: number;
  y: number;
  z: number;
}

/** Height of the roaming explorer's ears over his feet (roam.ts: 1.7 m × ROAM_SCALE). */
const EAR = 1.7 * 1.4;

export function readExplorer(f: MapFrame, out: Explorer): Explorer {
  out.near = f.roam === 'walk' || f.roam === 'boat';
  out.boat = f.roam === 'boat';
  out.x = f.listener.x;
  out.y = f.listener.y - EAR;
  out.z = f.listener.z;
  return out;
}

/** Animal calls are heard within this distance of the ears (m). */
const HEAR = 150;

/** Push an animal call for the sound (never in shots, only within earshot). */
export function call(f: MapFrame, kind: AnimalCallKind, x: number, y: number, z: number, gain: number): void {
  if (f.dt <= 0 || !f.calls) return;
  const d = Math.hypot(x - f.listener.x, y - f.listener.y, z - f.listener.z);
  if (d > HEAR) return;
  f.calls.push({ kind, x, y, z, gain: Math.min(1, gain) });
}

export function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** A bump 0 → 1 → 0 over [a, b] with soft edges of `e`. */
export function window01(a: number, b: number, e: number, x: number): number {
  return smooth(a, a + e, x) * (1 - smooth(b - e, b, x));
}

/** Shortest turn from angle a to b (radians). */
export function angleTo(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Linear colour of an sRGB hex, as [r, g, b]. */
export function linear(hex: number): [number, number, number] {
  const c = new Color().setHex(hex);
  return [c.r, c.g, c.b];
}
