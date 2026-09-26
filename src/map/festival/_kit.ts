import {
  Box3,
  BoxGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Matrix4,
  Mesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  RGBADepthPacking,
  Sphere,
  Vector3,
  Vector4,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import type { CastView } from '../cull';
import { ROW_HZ } from '../people/_personModel';

/**
 * The festival's things (boats, paddles, floats, candles, sand stupas,
 * flags, bunting, splashes), all as boxes of ONE instanced mesh per
 * festival (a draw, and one for its shadow), posed in the vertex shader:
 *
 * - every box has its place, size and turn (yaw, pitch, roll) in its
 *   **rig**'s space: rig 0 is the world, the others move whole (a dragon
 *   boat, a lit float) by a matrix per rig (`Kit.rigs`, a uniform array);
 * - a box may **move** by itself (`ANIM`): a paddle swings with its boat's
 *   stroke (the same clock as the rowers' `row` pose, `ROW_HZ`), a cloth
 *   waves from its pole, a floating candle drifts, a splash of water or a
 *   thrown ball flies in an arc;
 * - it may **glow** (its colour times `glow`, brighter at night: blooms) and
 *   show only at night or only by day (`SHOW`).
 *
 * Every repeating motion repeats within 600 s (`PERIOD`: the clock the
 * shader gets wraps there, so nothing jumps), which is why speeds are given
 * as whole numbers of turns per 600 s (`perPeriod`).
 *
 * Posed in the shader, the mesh is never culled by three; `KitMesh.inView`
 * tells whether any of it (or its shadow) can be seen: the world's boxes by
 * places (`PLACE` m squares), each rig's round where the rig is now.
 */

/** Rigs (moving frames) a kit can have; rig 0 is the world. */
export const RIGS = 12;
/** The shader's clock wraps every this many seconds (every repeating motion fits it). */
export const PERIOD = 600;
/** An angular speed near `radPerSec` that turns a whole number of times in `PERIOD` (so it does not jump when the clock wraps). */
export const perPeriod = (radPerSec: number): number => (Math.max(1, Math.round((radPerSec * PERIOD) / (Math.PI * 2))) * Math.PI * 2) / PERIOD;

/** How a box moves by itself. */
export const ANIM = {
  none: 0,
  /** A paddle: swings about its grip (`a` = pivot x, y, z in rig space) with the rig's stroke; `b.x` = side (+1 port, −1 starboard). */
  paddle: 1,
  /** A cloth waving from its pole along its own +x: `a` = (amplitude m/m, metres of cloth before this box, rad/s), `b.x` = phase. */
  wave: 2,
  /** A floating candle drifting (see `kDrift`): `a` = (kind 0 wander / 1 flow out, phase 0‥1, radius or length m), `b` = (dir x, dir z, period s or rad/s). */
  drift: 3,
  /** A flying drop or bit: `a` = (phase 0‥1, period s, flight s), `b` = (velocity x, y, z m/s, gravity m/s²). */
  arc: 4,
  /** A ball thrown to and fro between here and here + `b.xyz`: `a` = (slot 0‥1, slot length s, arc height m), `b.w` = slots in the round. */
  toss: 5,
  /** Foam round a moving boat: as big as the rig's speed (`rigRow.z`, 0‥1), breathing (`a.x` phase). */
  wake: 6,
} as const;

/** When a box shows. */
export const SHOW = { always: 0, night: 1, day: 2 } as const;

export interface BoxOpts {
  rig?: number;
  yaw?: number;
  pitch?: number;
  roll?: number;
  /** Glow (0 none; 1 its colour at full, times the time of day's glow level). */
  glow?: number;
  show?: number;
  anim?: number;
  a?: [number, number, number];
  b?: [number, number, number, number];
}

/** Floats per box: pos+rig 4, size+yaw 4, pitch roll glow show 4, colour 3, anim 4, anim2 4. */
const STRIDE = 23;
/** The world's boxes are gathered in squares this big (m) for `KitMesh.inView`. */
const PLACE = 80;

/** How far a box can reach from its middle (m): half its diagonal, and how far it moves by itself. */
function reachOf(d: readonly number[], o: number): number {
  const half = Math.hypot(d[o + 4], d[o + 5], d[o + 6]) / 2;
  const [a0, a1, a2] = [d[o + 16], d[o + 17], d[o + 18]];
  const b = Math.hypot(d[o + 19], d[o + 20], d[o + 21]);
  switch (Math.round(d[o + 15])) {
    case ANIM.paddle:
      return half + Math.hypot(d[o] - a0, d[o + 1] - a1, d[o + 2] - a2);
    case ANIM.wave:
      return half + 1;
    case ANIM.drift:
      return half + a2 + 1.5;
    case ANIM.arc:
      return half + b * a2 + 0.5 * d[o + 22] * a2 * a2;
    case ANIM.toss:
      return half + b + a2;
    default:
      return half;
  }
}

/** A place of a kit: a sphere round its boxes in its rig's space, how tall they stand (m), and the rig. */
interface KitPlace {
  s: Sphere;
  h: number;
  rig: number;
}

/** GLSL shared with the glow (the rigs, the clock, the stroke and the candles' drift). */
export const KIT_COMMON = /* glsl */ `
uniform mat4 uRig[${RIGS}];
uniform vec4 uRigRow[${RIGS}];
uniform float uTime;
uniform float uNight;
const float K_ROW_HZ = ${ROW_HZ.toFixed(4)};

// A rowing stroke: +1 at the catch (reaching forward), −1 at the end of the pull; the pull is quicker than the recovery.
float kStroke(float x) {
  return x < 0.4 ? cos(3.14159265 * x / 0.4) : -cos(3.14159265 * (x - 0.4) / 0.6);
}

// A floating candle's drift: offset (xyz) and size (w). a = (anim, kind, phase, radius | length), b = (dir x, dir z, period | rad/s, 0).
vec4 kDrift(vec4 a, vec4 b, float t) {
  float bob = 0.025 * sin(t * ${((105 * Math.PI * 2) / PERIOD).toFixed(6)} + a.z * 17.0);
  if (a.y < 0.5) {
    float w = t * b.z + a.z * 6.2831853;
    return vec4(a.w * cos(w), bob, a.w * sin(w + 0.7), 1.0);
  }
  float tau = fract(t / b.z + a.z);
  vec2 d = b.xy;
  vec2 o = d * (tau * a.w) + vec2(-d.y, d.x) * (1.1 * sin(tau * 5.0 + a.z * 11.0));
  float sc = smoothstep(0.0, 0.04, tau) * (1.0 - smoothstep(0.86, 1.0, tau));
  return vec4(o.x, bob, o.y, sc);
}

// Night (1) / day (2) only, or always (0).
float kShow(float mode) {
  if (mode < 0.5) return 1.0;
  float n = smoothstep(0.4, 0.6, uNight);
  return mode < 1.5 ? n : 1.0 - n;
}
`;

const KIT_VERTEX = /* glsl */ `
attribute vec4 iPos;
attribute vec4 iSize;
attribute vec4 iRot;
attribute vec3 iCol;
attribute vec4 iAnim;
attribute vec4 iAnim2;
${KIT_COMMON}

mat3 kRotY(float a) { float c = cos(a); float s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 kRotX(float a) { float c = cos(a); float s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 kRotZ(float a) { float c = cos(a); float s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

// The box's vertex p (unit box) in the world; its normal turned along.
vec3 kitPos(vec3 p, inout vec3 n) {
  vec3 size = iSize.xyz;
  vec3 q = p * size;
  int mode = int(iAnim.x + 0.5);
  int rig = int(iPos.w + 0.5);
  if (mode == 2) {
    // Cloth: waves grow along it away from the pole.
    float u = iAnim.z + (p.x + 0.5) * size.x;
    float w = uTime * iAnim.w + iAnim2.x - u * 2.4;
    q.z += iAnim.y * u * sin(w);
    q.y -= iAnim.y * 0.25 * u * (0.5 + 0.5 * sin(w * 0.5 + 1.3));
  }
  mat3 R = kRotY(iSize.w) * kRotX(iRot.x) * kRotZ(iRot.y);
  vec3 c = iPos.xyz;
  float sc = kShow(iRot.w);
  if (mode == 3) {
    vec4 d = kDrift(iAnim, iAnim2, uTime);
    c += d.xyz;
    sc *= d.w;
  } else if (mode == 4) {
    float tau = fract(uTime / iAnim.z + iAnim.y) * iAnim.z;
    c += iAnim2.xyz * tau - vec3(0.0, 0.5 * iAnim2.w * tau * tau, 0.0);
    sc *= step(tau, iAnim.w) * (1.0 - 0.55 * tau / max(iAnim.w, 1e-3));
  } else if (mode == 5) {
    float s = fract(uTime / (iAnim.z * iAnim2.w) - iAnim.y) * iAnim2.w;
    float u = s < 0.5 ? 2.0 * s : 2.0 - 2.0 * s;
    float h = s < 0.5 ? 2.0 * s : 2.0 * s - 1.0;
    c += iAnim2.xyz * u + vec3(0.0, iAnim.w * 4.0 * h * (1.0 - h), 0.0);
    sc *= step(s, 1.0);
  } else if (mode == 6) {
    float sp = uRigRow[rig].z;
    sc *= sp * (0.75 + 0.25 * sin(uTime * ${((190 * Math.PI * 2) / PERIOD).toFixed(5)} + iAnim.y * 6.2831853));
    q.x *= 0.6 + 0.4 * sp;
  }
  vec3 local = c + R * (q * sc);
  n = R * n;
  if (mode == 1) {
    vec4 row = uRigRow[rig];
    float x = fract(uTime * K_ROW_HZ + row.y);
    float st = kStroke(x);
    float lift = x < 0.4 ? 0.0 : 0.25 * sin(3.14159265 * (x - 0.4) / 0.6);
    // Resting (row.x 0): the paddles lean back, blades just in the water.
    mat3 P = kRotX(mix(0.5, -0.62 * st, row.x)) * kRotZ(iAnim2.x * 0.28);
    vec3 pivot = iAnim.yzw;
    local = pivot + P * (local - pivot) + vec3(0.0, lift * row.x, 0.0);
    n = P * n;
  }
  mat4 M = uRig[rig];
  n = mat3(M) * n;
  return (M * vec4(local, 1.0)).xyz;
}
`;

export interface KitUniforms {
  uRig: { value: Matrix4[] };
  uRigRow: { value: Vector4[] };
  uTime: { value: number };
  uNight: { value: number };
  uGlow: { value: number };
}

/** The shared uniforms of a kit (and its glow): rigs, clock, night, glow level. */
export function kitUniforms(): KitUniforms {
  return {
    uRig: { value: Array.from({ length: RIGS }, () => new Matrix4()) },
    uRigRow: { value: Array.from({ length: RIGS }, () => new Vector4(0, 0, 0, 0)) },
    uTime: { value: 0 },
    uNight: { value: 0 },
    uGlow: { value: 0.4 },
  };
}

function inject(shader: WebGLProgramParametersWithUniforms, u: KitUniforms, colour: boolean): void {
  Object.assign(shader.uniforms, u);
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${KIT_VERTEX}${colour ? 'uniform float uGlow;\nvarying vec3 vKitCol;\nvarying vec3 vKitGlow;\n' : ''}`);
  if (colour)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <beginnormal_vertex>',
        `vec3 kN = normal;
  vec3 kP = kitPos(position, kN);
  vec3 objectNormal = kN;
  vKitCol = iCol * (0.84 + 0.16 * smoothstep(-1.0, 0.2, normal.y));
  vKitGlow = iCol * iRot.z * uGlow;`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = kP;');
  else shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', 'vec3 kN = normal;\n  vec3 transformed = kitPos(position, kN);');
}

/** A kit being filled: `box` adds one, `build` makes the mesh. */
export class Kit {
  private readonly data: number[] = [];
  private readonly c = new Color();

  get count(): number {
    return this.data.length / STRIDE;
  }

  /** A box: middle (x, y, z) and size (m) in its rig's space, colour (sRGB hex). */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, o: BoxOpts = {}): void {
    this.c.setHex(color);
    const a = o.a ?? [0, 0, 0];
    const b = o.b ?? [0, 0, 0, 0];
    this.data.push(x, y, z, o.rig ?? 0, sx, sy, sz, o.yaw ?? 0, o.pitch ?? 0, o.roll ?? 0, o.glow ?? 0, o.show ?? 0, this.c.r, this.c.g, this.c.b, o.anim ?? 0, a[0], a[1], a[2], b[0], b[1], b[2], b[3]);
  }

  /** The instanced mesh (count 0 until `show`), its material sharing `u` with others of the same kit. */
  build(name: string, u: KitUniforms): KitMesh {
    const n = this.count;
    const box = new BoxGeometry(1, 1, 1);
    const geo = new InstancedBufferGeometry();
    geo.setIndex(box.getIndex());
    geo.setAttribute('position', box.getAttribute('position'));
    geo.setAttribute('normal', box.getAttribute('normal'));
    const d = this.data;
    const take = (off: number, size: number) => {
      const a = new Float32Array(n * size);
      for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) a[i * size + k] = d[i * STRIDE + off + k];
      return new InstancedBufferAttribute(a, size);
    };
    geo.setAttribute('iPos', take(0, 4));
    geo.setAttribute('iSize', take(4, 4));
    geo.setAttribute('iRot', take(8, 4));
    geo.setAttribute('iCol', take(12, 3));
    geo.setAttribute('iAnim', take(15, 4));
    geo.setAttribute('iAnim2', take(19, 4));
    geo.instanceCount = 0;
    const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    material.name = `${name}:kit`;
    material.onBeforeCompile = (shader) => {
      inject(shader, u, true);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vKitCol;\nvarying vec3 vKitGlow;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vKitCol;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vKitGlow;');
    };
    // (every festival kit shares one program)
    material.customProgramCacheKey = () => 'festival-kit';
    const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
    depth.name = `${name}:kit depth`;
    depth.onBeforeCompile = (shader) => inject(shader, u, false);
    depth.customProgramCacheKey = () => 'festival-kit-depth';
    const mesh = new Mesh(geo, material);
    mesh.name = `${name}:kit`;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.customDepthMaterial = depth;
    mesh.raycast = () => {};
    const places = this.places();
    const c = new Vector3();
    return {
      mesh,
      boxes: n,
      show: (on: boolean) => void (geo.instanceCount = on ? n : 0),
      inView(view: CastView, shadow: boolean): boolean {
        for (const p of places) {
          c.copy(p.s.center);
          if (p.rig) c.applyMatrix4(u.uRig.value[p.rig]);
          if (shadow ? view.seesShadow(c, p.s.radius, p.h) : view.sees(c, p.s.radius)) return true;
        }
        return false;
      },
    };
  }

  /** The boxes of rig 0 by `PLACE` squares, and those of each other rig (in its space). */
  private places(): KitPlace[] {
    const boxes = new Map<string, { box: Box3; rig: number }>();
    const d = this.data;
    const p = new Vector3();
    for (let o = 0; o < d.length; o += STRIDE) {
      const rig = Math.round(d[o + 3]);
      const key = rig ? `r${rig}` : `${Math.floor(d[o] / PLACE)},${Math.floor(d[o + 2] / PLACE)}`;
      let b = boxes.get(key);
      if (!b) boxes.set(key, (b = { box: new Box3(), rig }));
      const r = reachOf(d, o);
      b.box.expandByPoint(p.set(d[o] - r, d[o + 1] - r, d[o + 2] - r)).expandByPoint(p.set(d[o] + r, d[o + 1] + r, d[o + 2] + r));
    }
    return [...boxes.values()].map(({ box, rig }) => ({ s: box.getBoundingSphere(new Sphere()), h: box.max.y - box.min.y, rig }));
  }
}

export interface KitMesh {
  mesh: Mesh;
  boxes: number;
  /** Draw it (all its boxes) or not (none: no draw call; the shader stays compiled). */
  show(on: boolean): void;
  /** Whether any of its boxes (or, with `shadow`, their shadows) can be in view (the rigs where they are now). */
  inView(view: CastView, shadow: boolean): boolean;
}
