import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { FISH_KINDS, fishModel, type FishKind } from './_fishKinds';

/**
 * What the explorer fishes with, drawn while he fishes (nothing at all
 * otherwise): the bamboo pole (bent by the line's pull and its own weight),
 * the float, the fish on the line or in his hand, and the line.
 *
 * Two draws: every box (the pole's pieces, its node rings and grip, the
 * float, the fish's cells) is one instance of ONE InstancedMesh of a unit
 * cube, written from the CPU in world space each frame it shows (a few
 * dozen boxes; the fish's few hundred cells only while it is out of the
 * water); the line is a thin `Line` (one pixel wide, as a real one looks).
 * The fish's skin is wet: glossy and a little brighter at glancing angles;
 * the float's tip glows at night (village night floats carry a light).
 * No shadows (thin moving things; the low level's shadows stand still).
 */

/** The pole's length and its thickness at the butt and the tip (m, true size), the grip wrap (m from the butt). */
export const ROD_LEN = 3.0;
const ROD_BUTT = 0.028;
const ROD_TIP = 0.008;
const GRIP = [0.18, 0.42] as const;
/** Where the fist holds the pole (m from the butt, true size). */
export const ROD_HOLD = 0.3;
/** Pieces of the pole (boxes along its curve) and node rings (every other joint). */
const SEGS = 14;
const NODES = 6;
/** Colours (sRGB): dry bamboo, its nodes, the rattan wrap, the dark tip; the float; the line by day. */
const BAMBOO = [0xcfae6a, 0xc6a460, 0xd6b877];
const NODE = 0x8e6a36;
const WRAP = 0x5b3a1e;
const TIP = 0x4a3a28;
const FLOAT_BODY = 0xf1eadb;
const FLOAT_TOP = 0xd23d27;
const FLOAT_TIP = 0xffa23a;
const LINE_DAY = new Color(0.86, 0.88, 0.86);
/** The float is drawn this much bigger than a real one (so it reads on the water from the boat). */
const FLOAT_SCALE = 1.5;
/** Points of the line (a curve from the pole's tip to the float or the fish). */
export const LINE_POINTS = 18;

const M = new Matrix4();
const Q = new Quaternion();
const V = new Vector3();
const S = new Vector3();
const Z = new Vector3(0, 0, 1);
const C = new Color();
const _d = new Vector3();
const _p = new Vector3();
const _q = new Vector3();
const _perp = new Vector3();
const _g = new Vector3();
const _w0 = new Vector3();
const _w1 = new Vector3();

export interface FishGear {
  /** The gear's scene objects (world space; add once). */
  readonly object: Group;
  /** Shown (fishing) or not (nothing drawn, nothing written). */
  show(on: boolean): void;
  readonly shown: boolean;
  /**
   * The pole from its butt along `dir` (world, unit), bent by `bend` (0‥1)
   * towards `pull` (world, unit: where the line pulls at the tip; null: only
   * its own weight), at the explorer's scale `k`. Writes the tip (world) to
   * `tip`, and where the fist holds it to `hold` if given.
   */
  rod(butt: Vector3, dir: Vector3, bend: number, pull: Vector3 | null, k: number, tip: Vector3, hold?: Vector3): void;
  /** The float at `at` (world: its middle on the waterline), lying over by `lie` (0 upright … 1 on its side, turned `yaw`), or hidden (null). */
  float(at: Vector3 | null, k: number, lie?: number, yaw?: number): void;
  /**
   * The fish: `kind` placed by `m` (fish space: +z the snout, +y its back, +x
   * its left flank, the length 1 — scale it to the fish's length), its tail
   * half bent by `flex` (radians, + to its left); null hides it.
   */
  fish(kind: FishKind | null, m?: Matrix4, flex?: number): void;
  /** The line through `n` points of `pts` (world), or none. */
  line(pts: readonly Vector3[] | null, n?: number): void;
  /** The time of day (0 day … 1 night): the float's glow, the line's light. */
  light(night: number): void;
  /** Once a frame after the writes: send what changed to the GPU. */
  flush(): void;
}

export function createFishGear(): FishGear {
  const object = new Group();
  object.name = 'fishing';
  // Slots: the pole, its nodes and grip, the float (body, cap, tip), then the biggest fish.
  const ROD0 = 0;
  const NODE0 = ROD0 + SEGS;
  const WRAP0 = NODE0 + NODES;
  const FLOAT0 = WRAP0 + 1;
  const FISH0 = FLOAT0 + 3;
  const most = Math.max(...FISH_KINDS.map((k) => fishModel(k).cells.length));
  const cap = FISH0 + most;

  const geo = new BoxGeometry(1, 1, 1);
  geo.deleteAttribute('uv');
  const shine = new InstancedBufferAttribute(new Float32Array(cap), 1);
  const glow = new InstancedBufferAttribute(new Float32Array(cap), 1);
  shine.setUsage(DynamicDrawUsage);
  glow.setUsage(DynamicDrawUsage);
  geo.setAttribute('aShine', shine);
  geo.setAttribute('aGlow', glow);
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0 });
  material.name = 'fishing gear';
  const u = { uGlow: { value: 0 }, uSheen: { value: 1 } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aShine;\nattribute float aGlow;\nvarying float vShine;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vShine = aShine;\n  vGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;\nuniform float uSheen;\nvarying float vShine;\nvarying float vGlow;')
      // (wet skin: glossy)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.2, vShine);')
      // (and a little brighter where it turns away: the wet sheen; the float's tip glows at night)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  float fishRim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += diffuseColor.rgb * (vShine * uSheen * (0.22 + 0.5 * fishRim) + vGlow * uGlow);`,
      );
  };
  material.customProgramCacheKey = () => 'fishing gear';
  const mesh = new InstancedMesh(geo, material, cap);
  mesh.name = 'fishing:gear';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  (mesh.instanceMatrix.array as Float32Array).fill(0);
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
  mesh.instanceColor.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.raycast = () => {};
  mesh.count = FISH0;
  object.add(mesh);

  const paint = (i: number, hex: number, sh = 0, gl = 0) => {
    C.setHex(hex);
    const a = mesh.instanceColor!.array as Float32Array;
    a[i * 3] = C.r;
    a[i * 3 + 1] = C.g;
    a[i * 3 + 2] = C.b;
    (shine.array as Float32Array)[i] = sh;
    (glow.array as Float32Array)[i] = gl;
  };
  for (let i = 0; i < SEGS; i++) paint(ROD0 + i, i === SEGS - 1 ? TIP : BAMBOO[i % BAMBOO.length], 0.15);
  for (let i = 0; i < NODES; i++) paint(NODE0 + i, NODE, 0.15);
  paint(WRAP0, WRAP);
  paint(FLOAT0, FLOAT_BODY, 0.4);
  paint(FLOAT0 + 1, FLOAT_TOP, 0.4);
  paint(FLOAT0 + 2, FLOAT_TIP, 0.4, 1);
  let painted: FishKind | null = null;
  let fishShown = 0;

  // The line: a strip of points (one pixel wide).
  const lineGeo = new BufferGeometry();
  const linePos = new BufferAttribute(new Float32Array(LINE_POINTS * 3), 3);
  linePos.setUsage(DynamicDrawUsage);
  lineGeo.setAttribute('position', linePos);
  lineGeo.setDrawRange(0, 0);
  const lineMat = new LineBasicMaterial({ color: LINE_DAY, transparent: true, opacity: 0.75, depthWrite: false, fog: true });
  lineMat.name = 'fishing line';
  const line = new Line(lineGeo, lineMat);
  line.name = 'fishing:line';
  line.frustumCulled = false;
  line.raycast = () => {};
  line.renderOrder = 3;
  object.add(line);

  let on = false;
  object.visible = false;
  let dirty = false;

  /** A box from a to b (world), `w` thick, in slot i. */
  const segment = (i: number, a: Vector3, b: Vector3, w: number) => {
    _d.subVectors(b, a);
    const len = _d.length();
    if (len < 1e-5) return hide(i);
    Q.setFromUnitVectors(Z, _d.divideScalar(len));
    M.compose(V.addVectors(a, b).multiplyScalar(0.5), Q, S.set(w, w, len));
    M.toArray(mesh.instanceMatrix.array as Float32Array, i * 16);
  };
  const hide = (i: number, n = 1) => (mesh.instanceMatrix.array as Float32Array).fill(0, i * 16, (i + n) * 16);

  const api: FishGear = {
    object,
    get shown() {
      return on;
    },
    show(v) {
      if (v === on) return;
      on = v;
      object.visible = v;
      if (!v) {
        api.fish(null);
        lineGeo.setDrawRange(0, 0);
      }
    },
    rod(butt, dir, bend, pull, k, tip, hold) {
      const L = ROD_LEN * k;
      const ds = L / SEGS;
      // Bend: towards the line's pull (across the pole only), more towards the tip; and a little under its own weight.
      _perp.set(0, 0, 0);
      if (pull && bend > 0) _perp.copy(pull).addScaledVector(dir, -pull.dot(dir)).multiplyScalar(bend * 1.9);
      _g.set(0, -1, 0).addScaledVector(dir, dir.y).multiplyScalar(0.22);
      _p.copy(butt);
      let node = 0;
      for (let i = 0; i < SEGS; i++) {
        const s = (i + 0.5) / SEGS;
        _d.copy(dir)
          .addScaledVector(_perp, s * s)
          .addScaledVector(_g, s * s)
          .normalize();
        _q.copy(_p).addScaledVector(_d, ds);
        const w = (ROD_BUTT + (ROD_TIP - ROD_BUTT) * s) * k;
        segment(ROD0 + i, _p, _q, w);
        // (node rings at every other joint)
        if (i % 2 === 1 && node < NODES) {
          V.copy(_q).addScaledVector(_d, -0.012 * k);
          segment(NODE0 + node++, V, _q, w * 1.28);
        }
        // (the grip's wrap, and where the fist holds it: m from the butt, true size)
        const s0 = (i * ds) / k;
        const s1 = s0 + ds / k;
        if (s0 <= GRIP[0] && s1 > GRIP[0]) {
          _w0.copy(_p).addScaledVector(_d, (GRIP[0] - s0) * k);
          _w1.copy(_w0).addScaledVector(_d, (GRIP[1] - GRIP[0]) * k);
          segment(WRAP0, _w0, _w1, w * 1.22);
        }
        if (hold && s0 <= ROD_HOLD && s1 > ROD_HOLD) hold.copy(_p).addScaledVector(_d, (ROD_HOLD - s0) * k);
        _p.copy(_q);
      }
      for (; node < NODES; node++) hide(NODE0 + node);
      tip.copy(_p);
      dirty = true;
    },
    float(at, k, lie = 0, yaw = 0) {
      if (!at) {
        hide(FLOAT0, 3);
        dirty = true;
        return;
      }
      const f = k * FLOAT_SCALE;
      // (upright: its body half under the waterline, the red cap and the tip above; lying: turned over about its own axis)
      Q.setFromAxisAngle(V.set(Math.cos(yaw), 0, -Math.sin(yaw)), lie * 1.35);
      const place = (i: number, y: number, sx: number, sy: number) => {
        _p.set(0, y * f, 0).applyQuaternion(Q).add(at);
        M.compose(_p, Q, S.set(sx * f, sy * f, sx * f));
        M.toArray(mesh.instanceMatrix.array as Float32Array, i * 16);
      };
      place(FLOAT0, -0.01, 0.04, 0.045);
      place(FLOAT0 + 1, 0.028, 0.032, 0.03);
      place(FLOAT0 + 2, 0.068, 0.012, 0.05);
      dirty = true;
    },
    fish(kind, m, flex = 0) {
      if (!kind || !m) {
        if (fishShown) {
          hide(FISH0, fishShown);
          fishShown = 0;
          mesh.count = FISH0;
          dirty = true;
        }
        return;
      }
      const model = fishModel(kind);
      const cells = model.cells;
      if (painted !== kind) {
        painted = kind;
        for (let i = 0; i < cells.length; i++) paint(FISH0 + i, cells[i].color, cells[i].shine);
        mesh.instanceColor!.needsUpdate = true;
        shine.needsUpdate = true;
        glow.needsUpdate = true;
      }
      if (fishShown > cells.length) hide(FISH0 + cells.length, fishShown - cells.length);
      fishShown = cells.length;
      mesh.count = FISH0 + cells.length;
      const n = model.n;
      const c = 1 / n;
      const e = m.elements;
      const arr = mesh.instanceMatrix.array as Float32Array;
      // The tail half bends about the fish's middle, more towards the tail (a column of cells at a time).
      for (let q = 0; q < cells.length; q++) {
        const cl = cells[q];
        const u = (cl.i + 0.5) * c;
        let x = cl.k * c;
        const y = cl.j * c;
        let z = 0.5 - u;
        let ca = 1;
        let sa = 0;
        if (flex && u > 0.45) {
          const a = flex * ((u - 0.45) / 0.55) ** 1.4;
          ca = Math.cos(a);
          sa = Math.sin(a);
          const x0 = x;
          x = x0 * ca + z * sa;
          z = -x0 * sa + z * ca;
        }
        // World = m · T(x, y, z) · R_y · S(c): the columns of m's turn, turned and scaled, and m applied to the point.
        const o = (FISH0 + q) * 16;
        arr[o] = (e[0] * ca - e[8] * sa) * c;
        arr[o + 1] = (e[1] * ca - e[9] * sa) * c;
        arr[o + 2] = (e[2] * ca - e[10] * sa) * c;
        arr[o + 3] = 0;
        arr[o + 4] = e[4] * c;
        arr[o + 5] = e[5] * c;
        arr[o + 6] = e[6] * c;
        arr[o + 7] = 0;
        arr[o + 8] = (e[0] * sa + e[8] * ca) * c;
        arr[o + 9] = (e[1] * sa + e[9] * ca) * c;
        arr[o + 10] = (e[2] * sa + e[10] * ca) * c;
        arr[o + 11] = 0;
        arr[o + 12] = e[0] * x + e[4] * y + e[8] * z + e[12];
        arr[o + 13] = e[1] * x + e[5] * y + e[9] * z + e[13];
        arr[o + 14] = e[2] * x + e[6] * y + e[10] * z + e[14];
        arr[o + 15] = 1;
      }
      dirty = true;
    },
    line(pts, n = pts?.length ?? 0) {
      if (!pts || n < 2) {
        lineGeo.setDrawRange(0, 0);
        return;
      }
      const a = linePos.array as Float32Array;
      const m = Math.min(n, LINE_POINTS);
      for (let i = 0; i < m; i++) {
        a[i * 3] = pts[i].x;
        a[i * 3 + 1] = pts[i].y;
        a[i * 3 + 2] = pts[i].z;
      }
      linePos.clearUpdateRanges();
      linePos.addUpdateRange(0, m * 3);
      linePos.needsUpdate = true;
      lineGeo.setDrawRange(0, m);
    },
    light(night) {
      u.uGlow.value = 4 * night * night;
      // (the sky's light on the wet skin, less at night)
      u.uSheen.value = 1 - 0.75 * night;
      lineMat.color.copy(LINE_DAY).multiplyScalar(1 - 0.72 * night);
    },
    flush() {
      if (!dirty) return;
      dirty = false;
      const im = mesh.instanceMatrix;
      im.clearUpdateRanges();
      im.addUpdateRange(0, mesh.count * 16);
      im.needsUpdate = true;
    },
  };
  return api;
}
