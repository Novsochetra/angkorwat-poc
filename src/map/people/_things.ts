import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshDepthMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';

/**
 * The people's things (boats, the ox cart, kites and their strings, the
 * thrown net and its splash, torch stands, the fruit stall…): every box of
 * them is one instance of ONE InstancedMesh of a unit cube (a draw, and one
 * more for its shadow), with its own colour and, for flames, a glow that
 * blooms at night. Written from the CPU, and only when a thing moves.
 *
 * - A **rig** (`Rig`) is a thing made of boxes in its own space (feet on
 *   y = 0, facing +z, +x its left, like the people), grouped in **parts**
 *   that turn about their own pivot (a cart's wheels, a kite's tail). Make
 *   its boxes with `RigDef.box`, then `rig.place(...)` and `rig.turn(part,
 *   …)`; `rig.write()` puts every box on the map (cheap: one matrix product
 *   a box). `rig.hide()` folds it away.
 * - Loose boxes (a kite's string, a splash ring's bits): `things.segment`
 *   (a box stretched between two points) and `things.put` (a box at a
 *   point, turned about y).
 *
 * `flush(night)` once a frame flags what changed.
 */

/** A box of a rig: centre and size (m, rig space), colour (sRGB), part, glow (flames), turn (rad, about x, y, z). */
interface BoxDef {
  c: [number, number, number];
  s: [number, number, number];
  color: number;
  part: number;
  glow: number;
  rot?: [number, number, number];
}

/** The boxes of a rig and its parts' pivots. */
export class RigDef {
  readonly boxes: BoxDef[] = [];
  readonly pivots: [number, number, number][] = [[0, 0, 0]];

  /** A part turning about `pivot` (rig space); returns its id (0 is the rig itself). */
  part(pivot: [number, number, number]): number {
    this.pivots.push(pivot);
    return this.pivots.length - 1;
  }

  box(c: [number, number, number], s: [number, number, number], color: number, opts: { part?: number; glow?: number; rot?: [number, number, number] } = {}): this {
    this.boxes.push({ c, s, color, part: opts.part ?? 0, glow: opts.glow ?? 0, rot: opts.rot });
    return this;
  }
}

const M = new Matrix4();
const M2 = new Matrix4();
const P = new Matrix4();
const T = new Matrix4();
const Q = new Quaternion();
const E = new Euler();
const V = new Vector3();
const S = new Vector3();
const C = new Color();

/** Unchanged slots sent along between two changed ones (fewer uploads for a few bytes more). */
const GAP = 6;

/**
 * Slots written since the last flush: sent to the GPU as update ranges
 * (runs of slots; short gaps are sent along, fewer calls), not the whole
 * buffer.
 */
export class SlotMarks {
  private readonly marks: Uint8Array;
  private lo = Number.POSITIVE_INFINITY;
  private hi = -1;

  constructor(capacity: number) {
    this.marks = new Uint8Array(capacity);
  }

  mark(i: number, n = 1): void {
    this.marks.fill(1, i, i + n);
    if (i < this.lo) this.lo = i;
    if (i + n - 1 > this.hi) this.hi = i + n - 1;
  }

  /** Ranges of the marked slots onto `attrs` (each `size` floats a slot), flagged for upload; false if nothing was marked. */
  flush(attrs: readonly { attr: InstancedBufferAttribute; size: number }[]): boolean {
    if (this.hi < 0) return false;
    const m = this.marks;
    let i = this.lo;
    while (i <= this.hi) {
      if (!m[i]) {
        i++;
        continue;
      }
      let end = i;
      // (a gap of up to GAP slots goes along with the run)
      for (let j = i + 1; j <= this.hi && j <= end + GAP + 1; j++) if (m[j]) end = j;
      for (const { attr, size } of attrs) attr.addUpdateRange(i * size, (end - i + 1) * size);
      i = end + 1;
    }
    for (const { attr } of attrs) attr.needsUpdate = true;
    m.fill(0, this.lo, this.hi + 1);
    this.lo = Number.POSITIVE_INFINITY;
    this.hi = -1;
    return true;
  }
}

export class Things {
  readonly mesh: InstancedMesh;
  readonly capacity: number;
  /** Slots handed out so far. */
  used = 0;
  private readonly glow: InstancedBufferAttribute;
  private readonly uniforms = { uThingGlow: { value: 1.5 } };
  private readonly moved: SlotMarks;
  private readonly painted: SlotMarks;
  private readonly matrixRanges: { attr: InstancedBufferAttribute; size: number }[];
  private readonly colorRanges: { attr: InstancedBufferAttribute; size: number }[];

  constructor(capacity: number) {
    this.capacity = capacity;
    this.moved = new SlotMarks(capacity);
    this.painted = new SlotMarks(capacity);
    const geo = new BoxGeometry(1, 1, 1);
    this.glow = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    geo.setAttribute('aThingGlow', this.glow);
    const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    material.name = 'people:things';
    const u = this.uniforms;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aThingGlow;\nvarying float vThingGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vThingGlow = aThingGlow;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uThingGlow;\nvarying float vThingGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vThingGlow * uThingGlow;');
    };
    material.customProgramCacheKey = () => 'people:things';
    // (flames cast no shadow)
    const depth = new MeshDepthMaterial();
    depth.name = 'people:things depth';
    depth.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aThingGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  if (aThingGlow > 0.0) transformed = vec3(0.0);');
    };
    depth.customProgramCacheKey = () => 'people:things depth';
    const mesh = new InstancedMesh(geo, material, capacity);
    mesh.name = 'people:things';
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    (mesh.instanceMatrix.array as Float32Array).fill(0);
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    mesh.instanceColor.setUsage(DynamicDrawUsage);
    // (things are spread over the map: one draw, no culling)
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.customDepthMaterial = depth;
    mesh.count = 0;
    mesh.raycast = () => {};
    this.mesh = mesh;
    this.matrixRanges = [{ attr: mesh.instanceMatrix, size: 16 }];
    this.colorRanges = [
      { attr: mesh.instanceColor!, size: 3 },
      { attr: this.glow, size: 1 },
    ];
  }

  /** `n` slots (hidden until written); returns the first. */
  alloc(n: number): number {
    if (this.used + n > this.capacity) throw new Error('people: things are full');
    const i = this.used;
    this.used += n;
    this.mesh.count = this.used;
    return i;
  }

  /** Colour (sRGB) and glow of slot `i`. */
  paint(i: number, color: number, glow = 0): void {
    C.setHex(color);
    const a = this.mesh.instanceColor!.array as Float32Array;
    // (compared as the buffers hold them: float32)
    const r = Math.fround(C.r);
    const g = Math.fround(C.g);
    const b = Math.fround(C.b);
    glow = Math.fround(glow);
    if (a[i * 3] === r && a[i * 3 + 1] === g && a[i * 3 + 2] === b && this.glow.array[i] === glow) return;
    a[i * 3] = r;
    a[i * 3 + 1] = g;
    a[i * 3 + 2] = b;
    (this.glow.array as Float32Array)[i] = glow;
    this.painted.mark(i);
  }

  /** Slot `i` takes the matrix `m` (sent to the GPU only if it changed). */
  set(i: number, m: Matrix4): void {
    const a = this.mesh.instanceMatrix.array as Float32Array;
    const e = m.elements;
    const o = i * 16;
    let k = 0;
    while (k < 16 && a[o + k] === Math.fround(e[k])) k++;
    if (k === 16) return;
    for (; k < 16; k++) a[o + k] = e[k];
    this.moved.mark(i);
  }

  /** Fold slot `i` away. */
  hide(i: number, n = 1): void {
    const a = this.mesh.instanceMatrix.array as Float32Array;
    if (a[i * 16 + 15] === 0 && a[(i + n - 1) * 16 + 15] === 0) return;
    a.fill(0, i * 16, (i + n) * 16);
    this.moved.mark(i, n);
  }

  /** A box in slot `i` at (x, y, z) (its middle), size (sx, sy, sz), turned `yaw` about y. */
  put(i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0): void {
    Q.setFromAxisAngle(V.set(0, 1, 0), yaw);
    M.compose(V.set(x, y, z), Q, S.set(sx, sy, sz));
    this.set(i, M);
  }

  /** A box in slot `i` stretched from a to b, `w` thick (a string, a rope, a pole). */
  segment(i: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number): void {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    // (not Math.hypot: it allocates on every call in V8)
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-4) return this.hide(i);
    Q.setFromUnitVectors(V.set(0, 0, 1), S.set(dx / len, dy / len, dz / len));
    M.compose(V.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), Q, S.set(w, w, len));
    this.set(i, M);
  }

  /** Once a frame: the glow (brighter at night) and the buffers that changed. */
  flush(night: number): void {
    this.uniforms.uThingGlow.value = 1.2 + 3.2 * night;
    // (only the slots that changed: a rig's boxes, a string)
    this.moved.flush(this.matrixRanges);
    this.painted.flush(this.colorRanges);
  }
}

/** A thing on the map made of a rig's boxes (see `Things`). */
export class Rig {
  readonly base: number;
  readonly n: number;
  shown = false;
  /** Each box's own matrix (its middle, turn and size) in its part's space. */
  private readonly local: Matrix4[];
  private readonly parts: Matrix4[];
  private readonly turns: Matrix4[];
  private readonly root = new Matrix4();
  /** Placed or turned otherwise since the last write (a rig standing still is written once). */
  private moved = true;

  constructor(
    readonly things: Things,
    readonly def: RigDef,
  ) {
    this.n = def.boxes.length;
    this.base = things.alloc(this.n);
    this.local = def.boxes.map((b) => {
      const [px, py, pz] = def.pivots[b.part];
      Q.setFromEuler(E.set(...(b.rot ?? [0, 0, 0]), 'YXZ'));
      return new Matrix4().compose(V.set(b.c[0] - px, b.c[1] - py, b.c[2] - pz), Q, S.set(...b.s));
    });
    def.boxes.forEach((b, k) => things.paint(this.base + k, b.color, b.glow));
    this.parts = def.pivots.map(() => new Matrix4());
    this.turns = def.pivots.map(() => new Matrix4());
  }

  /** Recolour box `k` (e.g. a kite's sail, the cart's load). */
  paint(k: number, color: number, glow = 0): void {
    this.things.paint(this.base + k, color, glow);
  }

  /** Where the rig is: feet at (x, y, z), heading `yaw` (0 = +z), then `pitch` (front down) and `roll` (left side up), scaled `k`. */
  place(x: number, y: number, z: number, yaw: number, pitch = 0, roll = 0, k = 1): this {
    Q.setFromEuler(E.set(pitch, yaw, roll, 'YXZ'));
    M2.compose(V.set(x, y, z), Q, S.set(k, k, k));
    if (!this.root.equals(M2)) {
      this.root.copy(M2);
      this.moved = true;
    }
    return this;
  }

  /** Turn part `p` about its pivot: (x, y, z) angles (rad, applied y, then x, then z). */
  turn(p: number, ax: number, ay = 0, az = 0): this {
    Q.setFromEuler(E.set(ax, ay, az, 'YXZ'));
    M2.makeRotationFromQuaternion(Q);
    if (!this.turns[p].equals(M2)) {
      this.turns[p].copy(M2);
      this.moved = true;
    }
    return this;
  }

  /** Put every box on the map (nothing to do if it is there already and has not moved). */
  write(): void {
    if (this.shown && !this.moved) return;
    this.moved = false;
    const piv = this.def.pivots;
    for (let p = 0; p < piv.length; p++) {
      // root · T(pivot) · turn
      T.makeTranslation(piv[p][0], piv[p][1], piv[p][2]);
      this.parts[p].multiplyMatrices(this.root, T).multiply(this.turns[p]);
    }
    const boxes = this.def.boxes;
    for (let k = 0; k < this.n; k++) {
      P.multiplyMatrices(this.parts[boxes[k].part], this.local[k]);
      this.things.set(this.base + k, P);
    }
    this.shown = true;
  }

  /** A point of the rig (rig space) on the map, as last placed. */
  point(x: number, y: number, z: number, out: Vector3): Vector3 {
    return out.set(x, y, z).applyMatrix4(this.root);
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.things.hide(this.base, this.n);
  }
}
