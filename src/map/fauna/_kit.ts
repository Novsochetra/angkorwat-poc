import {
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  Uint16BufferAttribute,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from 'three';

/**
 * Kit for the map's animals: blocky models made of boxes on a few bones,
 * one `InstancedMesh` per species, posed in the vertex shader.
 *
 * - A model (`Model`) is boxes in its rest pose (standing, facing +z, feet
 *   on y = 0; +x is its left side), each on a bone that turns about a pivot,
 *   and painted with a colour slot. Boxes can belong to some variants only
 *   (a stag's antlers, a rooster's sickle tail): the others fold them away.
 * - Per animal the shader gets five eased channels (`CH`): each is
 *   (from, to, start time), eased over the species' time, so a change of pose
 *   is one write and the shader does the blend. The gait channel also has
 *   the step phase, and the step rate rides on the rest channel.
 * - A species' GLSL gives each bone's turn from the pose (`faunaBoneRot`)
 *   and the body's lift (`faunaRootMove`); the kit walks every vertex up its
 *   bone chain. Light, shadows and the map's haze stay three's own (the
 *   material is a MeshStandardMaterial with a few chunks swapped).
 * - The CPU side (`Flock`) writes an animal's root (place, heading, size)
 *   and channels only when they change, and flags each buffer once a frame.
 */

export type V3 = [number, number, number];

/** Pose channels (eased in the shader). */
export const CH = {
  /** 0 = still, 1 = walk, 2 = run. */
  gait: 0,
  /** 0 = standing, 1 = sitting or lying. */
  rest: 1,
  /** −1 = head high (alert), 0 = level, 1 = down (grazing, pecking, asleep). */
  head: 2,
  /** Head turned: −1 (right) ‥ 1 (left). */
  turn: 3,
  /** The species' own action (grooming, pecking, trunk swing…). */
  act: 4,
} as const;
export type Channel = (typeof CH)[keyof typeof CH];

interface Bone {
  name: string;
  parent: number;
  pivot: V3;
}

/** All variants. */
const ALL = 0xff;

/**
 * A model: boxes on bones, in the rest pose. `*` in a bone name stands for
 * L (+x, the animal's left) and R (−x): `boneLR` and `boxLR` make both.
 */
export class Model {
  readonly bones: Bone[] = [];
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly part: number[] = [];
  private readonly idx: number[] = [];
  boxes = 0;

  bone(name: string, parent: string | null, pivot: V3): this {
    const p = parent === null ? -1 : this.id(parent);
    this.bones.push({ name, parent: p, pivot });
    return this;
  }

  /** A left and a right bone (`name` with `*`, e.g. `leg*`); a parent with `*` is taken on the same side. */
  boneLR(name: string, parent: string, pivot: V3): this {
    for (const [s, sx] of [['L', 1], ['R', -1]] as const) this.bone(name.replace('*', s), parent.replace('*', s), [pivot[0] * sx, pivot[1], pivot[2]]);
    return this;
  }

  /** A box (centre, size) on a bone, painted with colour `slot`; `mask`: the variants that have it (bit per variant). */
  box(bone: string, c: V3, s: V3, slot: number, mask = ALL): this {
    const b = this.id(bone);
    const base = this.pos.length / 3;
    const [cx, cy, cz] = c;
    const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
    // Six faces, four corners each, counter-clockwise seen from outside.
    const faces: [V3, V3, V3][] = [
      [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
      [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
      [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
      [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    ];
    faces.forEach(([n, u, v], f) => {
      for (const [a, bb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        this.pos.push(cx + (n[0] + u[0] * a + v[0] * bb) * hx, cy + (n[1] + u[1] * a + v[1] * bb) * hy, cz + (n[2] + u[2] * a + v[2] * bb) * hz);
        this.nrm.push(n[0], n[1], n[2]);
        this.part.push(b, slot, mask);
      }
      const o = base + f * 4;
      this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    this.boxes++;
    return this;
  }

  /** The box and its mirror across x = 0: on `bone` with `*` as L and R, or both on one bone. */
  boxLR(bone: string, c: V3, s: V3, slot: number, mask = ALL): this {
    this.box(bone.replace('*', 'L'), c, s, slot, mask);
    return this.box(bone.replace('*', 'R'), [-c[0], c[1], c[2]], s, slot, mask);
  }

  id(name: string): number {
    const i = this.bones.findIndex((b) => b.name === name);
    if (i < 0) throw new Error(`fauna model: no bone "${name}"`);
    return i;
  }

  /** Chain depth of the deepest bone (the shader walks this many steps). */
  get depth(): number {
    let d = 0;
    for (let b = 0; b < this.bones.length; b++) {
      let n = 0;
      for (let p = b; p >= 0; p = this.bones[p].parent) n++;
      d = Math.max(d, n);
    }
    return d;
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aFauna', new Float32BufferAttribute(this.part, 3));
    g.setIndex(new Uint16BufferAttribute(this.idx, 1));
    return g;
  }
}

/** A species: its model, colours and pose shader. */
export interface Species {
  name: string;
  model: Model;
  /** Per variant, the sRGB colour of every slot (all variants the same length). */
  palettes: number[][];
  /**
   * GLSL: `vec3 faunaBoneRot(int b, FaunaPose P)` (pitch, yaw, roll of bone b
   * against its parent; pitch > 0 tips the front down, yaw > 0 turns left,
   * roll > 0 tips the left side up) and `vec3 faunaRootMove(FaunaPose P)`
   * (lift of the whole body). Bones are `B_<NAME>` constants.
   */
  glsl: string;
  /** Ease time (s) of each channel: gait, rest, head, turn, act. */
  ease: [number, number, number, number, number];
  /** Casts shadows (big animals only). */
  shadows?: boolean;
}

/** GLSL shared by every species (after three's `common`). */
const PRELUDE = /* glsl */ `
attribute vec3 aFauna;
attribute vec4 aFaunaCh0;
attribute vec4 aFaunaCh1;
attribute vec4 aFaunaCh2;
attribute vec4 aFaunaCh3;
attribute vec4 aFaunaCh4;
uniform float uFaunaTime;
uniform vec4 uFaunaEase;
uniform float uFaunaEaseAct;

struct FaunaPose {
  // Time (s), step phase (rad), 0 still / 1 walk / 2 run, and its walk and run shares.
  float t;
  float phase;
  float gait;
  float walk;
  float run;
  // Sitting or lying 0‥1; head −1 high ‥ 1 down; head turn −1‥1; the species' action.
  float rest;
  float head;
  float turn;
  float act;
  // Per animal: 0‥1 random, variant.
  float seed;
  int variant;
};

float faunaEase(vec4 c, float d) {
  float k = clamp((uFaunaTime - c.z) / max(d, 1e-3), 0.0, 1.0);
  return mix(c.x, c.y, k * k * (3.0 - 2.0 * k));
}

float faunaHash(float n) {
  return fract(sin(n * 12.9898 + 4.1414) * 43758.5453);
}

// Short twitches now and then (0‥1): \`rate\` chances a second, each taken
// with probability p; a twitch lasts about a third of its slot.
float faunaTwitch(float t, float rate, float p, float seed) {
  float x = t * rate + seed * 13.7;
  float k = floor(x);
  float on = step(1.0 - p, faunaHash(k + seed * 71.0));
  return on * sin(clamp(fract(x) / 0.33, 0.0, 1.0) * 3.14159);
}

FaunaPose faunaPose() {
  FaunaPose P;
  P.t = uFaunaTime;
  P.gait = faunaEase(aFaunaCh0, uFaunaEase.x);
  P.phase = uFaunaTime * aFaunaCh1.w * 6.2831853 + aFaunaCh0.w;
  P.run = clamp(P.gait - 1.0, 0.0, 1.0);
  P.walk = clamp(P.gait, 0.0, 1.0) - P.run;
  P.rest = faunaEase(aFaunaCh1, uFaunaEase.y);
  P.head = faunaEase(aFaunaCh2, uFaunaEase.z);
  P.turn = faunaEase(aFaunaCh3, uFaunaEase.w);
  P.act = faunaEase(aFaunaCh4, uFaunaEaseAct);
  P.seed = aFaunaCh3.w;
  P.variant = int(aFaunaCh2.w + 0.5);
  return P;
}

mat3 faunaRotX(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c);
}
mat3 faunaRotY(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
}
mat3 faunaRotZ(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0);
}
`;

const f = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(4)));

/** GLSL of one species: bones, pose functions and the skinning walk. */
function speciesGlsl(sp: Species): string {
  const { bones } = sp.model;
  const n = bones.length;
  const consts = bones.map((b, i) => `const int B_${b.name.toUpperCase()} = ${i};`).join('\n');
  const pivots = `const vec3 FAUNA_PIVOT[${n}] = vec3[${n}](${bones.map((b) => `vec3(${b.pivot.map(f).join(', ')})`).join(', ')});`;
  const parents = `const int FAUNA_PARENT[${n}] = int[${n}](${bones.map((b) => b.parent).join(', ')});`;
  return `
${PRELUDE}
${consts}
${pivots}
${parents}
${sp.glsl}
// Pose a rest-pose point and normal: up the bone chain, then lift the body.
// Boxes of other variants fold to a point.
void faunaSkin(inout vec3 p, inout vec3 n, FaunaPose P) {
  int b = int(aFauna.x + 0.5);
  if (((int(aFauna.z + 0.5) >> P.variant) & 1) == 0) {
    p = vec3(0.0);
    return;
  }
  for (int i = 0; i < ${sp.model.depth}; i++) {
    if (b < 0) break;
    vec3 r = faunaBoneRot(b, P);
    mat3 R = faunaRotY(r.y) * faunaRotX(r.x) * faunaRotZ(r.z);
    vec3 pv = FAUNA_PIVOT[b];
    p = pv + R * (p - pv);
    n = R * n;
    b = FAUNA_PARENT[b];
  }
  p += faunaRootMove(P);
}
`;
}

/** Shared uniforms of one species (the material and its shadow caster read the same objects). */
interface KitUniforms {
  uFaunaTime: { value: number };
  uFaunaEase: { value: { x: number; y: number; z: number; w: number } };
  uFaunaEaseAct: { value: number };
  uFaunaPal: { value: Vector3[] };
}

function injectVertex(shader: WebGLProgramParametersWithUniforms, sp: Species, u: KitUniforms, colour: boolean): void {
  Object.assign(shader.uniforms, u);
  const slots = sp.palettes[0].length;
  const pars = colour ? `\nuniform vec3 uFaunaPal[${sp.palettes.length * slots}];\nvarying vec3 vFaunaColor;\n` : '';
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${speciesGlsl(sp)}${pars}`);
  const pose = /* glsl */ `
  FaunaPose faunaP = faunaPose();
  vec3 faunaPos = position;
  vec3 faunaNrm = normal;
  faunaSkin(faunaPos, faunaNrm, faunaP);
`;
  if (colour) {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <beginnormal_vertex>',
        `${pose}
  vec3 objectNormal = faunaNrm;
  vFaunaColor = uFaunaPal[faunaP.variant * ${slots} + int(aFauna.y + 0.5)] * aFaunaCh4.w;
  // Undersides a little darker (no bounce light there).
  vFaunaColor *= 0.84 + 0.16 * smoothstep(-1.0, 0.2, normal.y);`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = faunaPos;');
  } else shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `${pose}\n  vec3 transformed = faunaPos;`);
}

function speciesMaterials(sp: Species, u: KitUniforms): { material: MeshStandardMaterial; depth: MeshDepthMaterial } {
  // Same surface as the map's blocks (VOXEL_MATERIALS map families): matte, no metal.
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  material.name = `fauna:${sp.name}`;
  material.onBeforeCompile = (shader) => {
    injectVertex(shader, sp, u, true);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFaunaColor;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vFaunaColor;');
  };
  material.customProgramCacheKey = () => `fauna:${sp.name}`;
  const depth = new MeshDepthMaterial();
  depth.name = `fauna-depth:${sp.name}`;
  depth.onBeforeCompile = (shader) => injectVertex(shader, sp, u, false);
  depth.customProgramCacheKey = () => `fauna-depth:${sp.name}`;
  return { material, depth };
}

/**
 * The animals of one species on the map: one InstancedMesh, fed per animal
 * through `place` (root) and `set` / `gait` (eased channels). Everything is
 * written only when it changes; `flush` flags the buffers once a frame.
 */
export class Flock {
  readonly mesh: InstancedMesh;
  readonly count: number;
  /** Channel buffers: (from, to, start, extra) per animal. */
  private readonly ch: Float32Array[];
  private readonly attrs: InstancedBufferAttribute[];
  private readonly ease: number[];
  private readonly shown: Uint8Array;
  private readonly uniforms: KitUniforms;
  private dirtyRoot = false;
  private dirtyCh = 0;
  /** Time origin of the shader clock (it is rebased now and then, so floats stay exact). */
  private base = 0;

  constructor(
    readonly species: Species,
    count: number,
  ) {
    this.count = count;
    const geo = species.model.geometry();
    this.ch = [];
    this.attrs = [];
    for (let c = 0; c < 5; c++) {
      const a = new Float32Array(count * 4);
      const attr = new InstancedBufferAttribute(a, 4);
      attr.setUsage(DynamicDrawUsage);
      geo.setAttribute(`aFaunaCh${c}`, attr);
      this.ch.push(a);
      this.attrs.push(attr);
    }
    this.ease = species.ease.slice();
    const pal = species.palettes.flat().map((hex) => {
      const c = new Color(hex);
      return new Vector3(c.r, c.g, c.b);
    });
    const [e0, e1, e2, e3, e4] = species.ease;
    this.uniforms = {
      uFaunaTime: { value: 0 },
      uFaunaEase: { value: { x: e0, y: e1, z: e2, w: e3 } },
      uFaunaEaseAct: { value: e4 },
      uFaunaPal: { value: pal },
    };
    const { material, depth } = speciesMaterials(species, this.uniforms);
    const mesh = new InstancedMesh(geo, material, count);
    mesh.name = `fauna:${species.name}`;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    // (animals are spread over the whole map: one draw, no culling)
    mesh.frustumCulled = false;
    mesh.castShadow = species.shadows ?? false;
    mesh.receiveShadow = true;
    if (mesh.castShadow) mesh.customDepthMaterial = depth;
    this.mesh = mesh;
    this.shown = new Uint8Array(count);
    const m = mesh.instanceMatrix.array as Float32Array;
    m.fill(0);
    for (let i = 0; i < count; i++) {
      m[i * 16 + 15] = 1;
      this.ch[1][i * 4 + 3] = 1;
      this.ch[4][i * 4 + 3] = 1;
      for (let c = 0; c < 5; c++) this.ch[c][i * 4 + 2] = -1e4;
    }
  }

  /** Variant, a 0‥1 random for the shader's twitches, and a brightness (≈ 1). */
  setup(i: number, variant: number, seed: number, tint: number): void {
    this.ch[CH.head][i * 4 + 3] = variant;
    this.ch[CH.turn][i * 4 + 3] = seed;
    this.ch[CH.act][i * 4 + 3] = tint;
    this.dirtyCh |= (1 << CH.head) | (1 << CH.turn) | (1 << CH.act);
  }

  /** Put animal `i` on the map: feet at (x, y, z), heading `yaw` (0 = +z, turning to +x), size. */
  place(i: number, x: number, y: number, z: number, yaw: number, scale: number): void {
    const m = this.mesh.instanceMatrix.array as Float32Array;
    const o = i * 16;
    const c = Math.fround(Math.cos(yaw) * scale);
    const s = Math.fround(Math.sin(yaw) * scale);
    x = Math.fround(x);
    y = Math.fround(y);
    z = Math.fround(z);
    if (this.shown[i] && m[o + 12] === x && m[o + 13] === y && m[o + 14] === z && m[o] === c && m[o + 8] === s) return;
    this.shown[i] = 1;
    m[o] = c;
    m[o + 2] = -s;
    m[o + 5] = scale;
    m[o + 8] = s;
    m[o + 10] = c;
    m[o + 12] = x;
    m[o + 13] = y;
    m[o + 14] = z;
    this.dirtyRoot = true;
  }

  /** Hide animal `i` (folds it to a point). */
  hide(i: number): void {
    if (!this.shown[i]) return;
    this.shown[i] = 0;
    const m = this.mesh.instanceMatrix.array as Float32Array;
    const o = i * 16;
    m[o] = m[o + 2] = m[o + 5] = m[o + 8] = m[o + 10] = 0;
    this.dirtyRoot = true;
  }

  isShown(i: number): boolean {
    return this.shown[i] === 1;
  }

  /** Channel `c` of animal `i` at time `t`, as the shader has it. */
  value(i: number, c: Channel, t: number): number {
    const a = this.ch[c];
    const o = i * 4;
    let k = (t - this.base - a[o + 2]) / this.ease[c];
    k = k < 0 ? 0 : k > 1 ? 1 : k;
    return a[o] + (a[o + 1] - a[o]) * k * k * (3 - 2 * k);
  }

  /** Target of channel `c` of animal `i`. */
  target(i: number, c: Channel): number {
    return this.ch[c][i * 4 + 1];
  }

  /** Ease channel `c` of animal `i` to `v`, from where it is at time `t` (`snap`: at once). */
  set(i: number, c: Channel, v: number, t: number, snap = false): void {
    const a = this.ch[c];
    const o = i * 4;
    if (a[o + 1] === v && (!snap || a[o] === v)) return;
    a[o] = snap ? v : this.value(i, c, t);
    a[o + 1] = v;
    a[o + 2] = t - this.base;
    this.dirtyCh |= 1 << c;
  }

  /** Gait (0 still, 1 walk, 2 run) and step rate (cycles a second), keeping the step phase where it is. */
  gait(i: number, v: number, hz: number, t: number): void {
    this.set(i, CH.gait, v, t);
    const o = i * 4 + 3;
    const rate = this.ch[CH.rest];
    if (Math.abs(rate[o] - hz) < 1e-3) return;
    const g = this.ch[CH.gait];
    const tt = t - this.base;
    const phase = tt * rate[o] * Math.PI * 2 + g[o];
    g[o] = (phase - tt * hz * Math.PI * 2) % (Math.PI * 2);
    rate[o] = hz;
    this.dirtyCh |= (1 << CH.gait) | (1 << CH.rest);
  }

  /** Once a frame: the shader clock, and the buffers that changed. */
  flush(t: number): void {
    // Rebase the clock every ~10 min (the channel starts and step phases move with it).
    if (t - this.base > 600) {
      const shift = Math.floor((t - this.base) / 600) * 600;
      for (let i = 0; i < this.count; i++) {
        const o = i * 4;
        for (let c = 0; c < 5; c++) this.ch[c][o + 2] = Math.max(-1e4, this.ch[c][o + 2] - shift);
        this.ch[CH.gait][o + 3] = (this.ch[CH.gait][o + 3] + shift * this.ch[CH.rest][o + 3] * Math.PI * 2) % (Math.PI * 2);
      }
      this.base += shift;
      this.dirtyCh = 0b11111;
    }
    this.uniforms.uFaunaTime.value = t - this.base;
    if (this.dirtyRoot) this.mesh.instanceMatrix.needsUpdate = true;
    for (let c = 0; c < 5; c++) if (this.dirtyCh & (1 << c)) this.attrs[c].needsUpdate = true;
    this.dirtyRoot = false;
    this.dirtyCh = 0;
    let any = false;
    for (let i = 0; i < this.count && !any; i++) any = this.shown[i] === 1;
    this.mesh.visible = any;
  }
}
