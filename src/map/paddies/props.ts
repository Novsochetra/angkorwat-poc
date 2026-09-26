import { BoxGeometry, Color, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshDepthMaterial, MeshStandardMaterial, Sphere, Vector3, type WebGLProgramParametersWithUniforms } from 'three';
import { hash3 } from '../../voxel/random';
import { CELL, fbm, SURFACE, type HeightField } from '../heightfield';
import { SWAY, SWAY_GLSL } from '../veg/sway';
import { sweepOrder } from './ground';
import { plotAt, SWEEP, type PlotPlan } from './stages';

/**
 * What stands in and round the paddies (one draw call, plain boxes posed in
 * the vertex shader): bamboo fences on the outer dikes, two ting mong
 * (the Khmer scarecrow figure: an old shirt, a krama, a Khmer palm-leaf hat) while
 * the rice grows, sheaves stood in stooks behind the reapers, round straw
 * stacks on a pole after the threshing, and sugar palms (thnot, Cambodia's
 * tree) on the dikes.
 *
 * Each box has a season window (plot-local days folded into absolute
 * season in JS): it grows out of its foot as the window opens and sinks
 * back into it as it closes, so nothing pops. Palms and cloth sway with
 * the land's wind (veg/sway.ts). The same pose casts the shadows.
 */

/** Colours (sRGB). */
const BAMBOO = [0xbba96b, 0xab9c63, 0x9a8d5d, 0xc2b276];
const STRAW = [0xcdb173, 0xc4a86a, 0xd6bb7c, 0xbfa466];
const STRAW_OLD = 0xa69366;
const SHEAF = [0xc9a95a, 0xd1b062, 0xbf9f52];
const SHEAF_HEAD = [0xd8b04a, 0xdcb656, 0xcfa544];
const SHEAF_TIE = 0x8a6a38;
const PALM_TRUNK = [0x69635b, 0x736c63, 0x625c55];
const PALM_LEAF = [0x6f8c45, 0x7a9650, 0x62803e, 0x86a15a];
const PALM_DEAD = [0x8a6a3e, 0x7d6038, 0x96764a];
const SHIRT = [0x5b7ca3, 0xd6cfbc];
const KRAMA = 0xb03a32;
const TROUSERS = 0x3f3b4c;
const HAT = 0xd9bf7e;
/** The red binding of the Khmer palm-leaf hat (brim edge and crown band). */
const HAT_RED = 0xb8352a;

/** A season window: from `at` it grows in over `len`; from `outAt` it goes over `outLen` (absolute season, wraps). */
interface Window {
  at: number;
  len: number;
  outAt: number;
  outLen: number;
}
const ALWAYS: Window = { at: 0, len: -1, outAt: 0, outLen: 0 };

const _c = new Color();

class Boxes {
  readonly p0: number[] = [];
  readonly p1: number[] = [];
  readonly p2: number[] = [];
  readonly show: number[] = [];
  readonly col: number[] = [];
  /** The prop being built: its foot, sway, window. */
  foot = new Vector3();
  sway = 0;
  win: Window = ALWAYS;

  get count(): number {
    return this.p0.length / 4;
  }

  /** A box centred at (x, y, z), size (sx, sy, sz), turned by `yaw` then tipped by `pitch` (+z end down). */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: number, yaw = 0, pitch = 0, shade = 1): void {
    this.p0.push(x, y, z, yaw);
    this.p1.push(sx, sy, sz, pitch);
    this.p2.push(this.foot.x, this.foot.y, this.foot.z, this.sway);
    const w = this.win;
    if (w.len < 0) this.show.push(0, -1, 0, 0);
    else {
      const out = (((w.outAt - w.at) % 1) + 1) % 1;
      this.show.push(w.at, w.len, out, Math.min(1, out + w.outLen));
    }
    _c.setHex(hex).multiplyScalar(shade);
    this.col.push(_c.r, _c.g, _c.b);
  }

  /** A box standing on (x, y, z) along its tipped axis (a stick, a sheaf), `len` long. */
  stick(x: number, y: number, z: number, w: number, len: number, d: number, hex: number, yaw = 0, pitch = 0, from = 0, shade = 1): void {
    // Axis: local +y tipped toward local +z by `pitch`, turned by `yaw`.
    const ay = Math.cos(pitch);
    const az = Math.sin(pitch);
    const ax = az * Math.sin(yaw);
    const azz = az * Math.cos(yaw);
    const m = from + len / 2;
    this.box(x + ax * m, y + ay * m, z + azz * m, w, len, d, hex, yaw, pitch, shade);
  }
}

const pick = (list: readonly number[], r: number) => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/** Bamboo fences along the outer side of the outer dikes, in stretches, open where the trail comes through. */
function fences(b: Boxes, field: HeightField): void {
  const { nx, nz } = field;
  const isPlot = (i: number, k: number) => i >= 0 && k >= 0 && i < nx && k < nz && field.surface[i + k * nx] === SURFACE.paddy;
  const isDike = (i: number, k: number) => {
    if (isPlot(i, k)) return false;
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) if (isPlot(i + di, k + dk)) return true;
    return false;
  };
  const i0 = field.index(-300, 50) % nx;
  const k0 = Math.floor(field.index(-300, 50) / nx);
  const i1 = field.index(-150, 115) % nx;
  const k1 = Math.floor(field.index(-150, 115) / nx);
  const h = CELL / 2;
  b.foot.set(0, 0, 0);
  b.sway = 0;
  b.win = ALWAYS;
  for (let k = k0; k <= k1; k++)
    for (let i = i0; i <= i1; i++) {
      if (!isDike(i, k)) continue;
      const [x, z] = field.cellCenter(i, k);
      const y = field.height[i + k * nx];
      for (const [di, dk] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        if (isDike(i + di, k + dk) || isPlot(i + di, k + dk)) continue;
        // (open where the village trail crosses, by the village, and here and there)
        const ex = x + di * (h - 0.35);
        const ez = z + dk * (h - 0.35);
        if (Math.abs(ez - 83) < 3.5 || ex < -281 || fbm(ex / 18, ez / 18, 9311) < 0.42) continue;
        // One span along the cell's side: a post at its start, two rails to the next.
        const tx = -dk;
        const tz = di;
        const r = (q: number) => hash3(i, k, q + di * 3 + dk * 7, 9313);
        const px = ex - tx * h;
        const pz = ez - tz * h;
        const post = 0.95 + 0.25 * r(1);
        b.box(px, y + post / 2 - 0.1, pz, 0.09, post, 0.09, pick(BAMBOO, r(2)), r(3) * 3, (r(4) - 0.5) * 0.08);
        const yaw = Math.atan2(tx, tz);
        for (const [q, hy] of [
          [5, 0.42],
          [6, 0.8],
        ])
          b.box(ex, y + hy + (r(q) - 0.5) * 0.06, ez, 0.055, 0.055, CELL + 0.1, pick(BAMBOO, r(q + 2)), yaw, (r(q + 4) - 0.5) * 0.04);
      }
    }
}

/**
 * A ting mong: the Khmer figure that keeps birds and bad luck off the field —
 * a bamboo pole and crossbar in an old shirt with a krama at the neck, a
 * straw head and a Khmer palm-leaf hat, trousers hanging. Stands while the rice grows.
 */
function scarecrow(b: Boxes, x: number, y: number, z: number, yaw: number, shirt: number, win: Window): void {
  b.foot.set(x, y, z);
  b.win = win;
  b.sway = 0;
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  // (local x across the arms, turned by yaw)
  const at = (lx: number, ly: number, lz = 0): [number, number, number] => [x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs];
  b.box(...at(0, 1.1), 0.07, 2.2, 0.07, BAMBOO[2], yaw);
  b.sway = 0.05;
  b.box(...at(0, 1.62), 1.3, 0.06, 0.06, BAMBOO[1], yaw);
  b.sway = 0.12;
  b.box(...at(0, 1.42), 0.44, 0.6, 0.22, shirt, yaw);
  b.box(...at(-0.42, 1.62), 0.46, 0.15, 0.15, shirt, yaw, 0, 0.95);
  b.box(...at(0.42, 1.62), 0.46, 0.15, 0.15, shirt, yaw, 0, 0.95);
  b.box(...at(-0.68, 1.6), 0.12, 0.16, 0.12, STRAW[0], yaw);
  b.box(...at(0.68, 1.6), 0.12, 0.16, 0.12, STRAW[0], yaw);
  b.box(...at(0, 1.77), 0.3, 0.09, 0.26, KRAMA, yaw);
  b.box(...at(0.1, 1.72, 0.1), 0.08, 0.2, 0.05, KRAMA, yaw, 0, 0.9);
  b.box(...at(0, 1.97), 0.27, 0.3, 0.25, 0xe0d2b0, yaw);
  // The Khmer palm-leaf hat: a wide flat brim bound in red, a flat-topped crown with a red band, a woven knot on top.
  b.box(...at(0, 2.125), 0.7, 0.03, 0.7, HAT_RED, yaw + 0.3);
  b.box(...at(0, 2.15), 0.66, 0.05, 0.66, HAT, yaw + 0.3);
  b.box(...at(0, 2.2), 0.32, 0.05, 0.32, HAT_RED, yaw + 0.3);
  b.box(...at(0, 2.29), 0.3, 0.14, 0.3, HAT, yaw + 0.3, 0, 0.92);
  b.box(...at(0, 2.37), 0.12, 0.02, 0.12, 0xf0e2b8, yaw + 0.3);
  b.box(...at(-0.1, 0.88), 0.15, 0.52, 0.15, TROUSERS, yaw);
  b.box(...at(0.1, 0.88), 0.15, 0.52, 0.15, TROUSERS, yaw, 0, 0.9);
  b.sway = 0;
}

/** A stook: sheaves stood leaning together, heads up, tied at the waist. */
function stook(b: Boxes, x: number, y: number, z: number, seed: number): void {
  b.foot.set(x, y, z);
  b.sway = 0;
  const n = 5;
  const a0 = hash3(seed, 1, 0, 9321) * Math.PI * 2;
  for (let s = 0; s < n; s++) {
    const r = (q: number) => hash3(seed, s, q, 9323);
    const a = a0 + (s / n) * Math.PI * 2 + (r(1) - 0.5) * 0.3;
    const fx = x + Math.cos(a) * 0.26;
    const fz = z + Math.sin(a) * 0.26;
    // (leaning in toward the middle)
    const yaw = Math.atan2(-Math.cos(a), -Math.sin(a));
    const lean = 0.2 + 0.1 * r(2);
    const len = 0.72 + 0.12 * r(3);
    b.stick(fx, y, fz, 0.24, len, 0.24, pick(SHEAF, r(4)), yaw, lean);
    b.stick(fx, y, fz, 0.27, 0.07, 0.27, SHEAF_TIE, yaw, lean, len * 0.55);
    // (the heads from the top of the stalks, nodding a little further in)
    const tip = len - 0.03;
    const tx = fx + Math.sin(lean) * Math.sin(yaw) * tip;
    const tz = fz + Math.sin(lean) * Math.cos(yaw) * tip;
    b.stick(tx, y + Math.cos(lean) * tip, tz, 0.34, 0.3, 0.34, pick(SHEAF_HEAD, r(5)), yaw, lean + 0.2);
  }
}

/** A round straw stack on a bamboo pole: a beehive of layers (octagons: a square and a turned square), rounding off to the top. */
function strawStack(b: Boxes, x: number, y: number, z: number, seed: number, win: Window): void {
  b.foot.set(x, y, z);
  b.win = win;
  b.sway = 0;
  const r = (q: number) => hash3(seed, q, 5, 9331);
  const D = 3 + 0.6 * r(1);
  const layers = 12;
  const lh = 0.23 + 0.03 * r(2);
  const turn = r(3) * Math.PI;
  for (let l = 0; l < layers; l++) {
    const f = (l + 0.5) / layers;
    const w = D * (0.26 + 0.74 * Math.sqrt(Math.max(0, 1 - f ** 2.6)));
    const hex = l >= layers - 2 ? STRAW_OLD : pick(STRAW, r(10 + l));
    const cy = y + lh * (l + 0.5);
    // (each layer a little off true, as it was forked up by hand)
    const ox = (r(30 + l) - 0.5) * 0.1;
    const oz = (r(40 + l) - 0.5) * 0.1;
    // (the courses of straw a shade apart)
    const sh = l % 2 ? 0.94 : 1;
    const tw = turn + (l % 2) * 0.2 + (r(50 + l) - 0.5) * 0.1;
    b.box(x + ox, cy, z + oz, w, lh + 0.03, w, hex, tw, 0, sh);
    b.box(x + ox, cy, z + oz, w * 0.95, lh, w * 0.95, hex, tw + Math.PI / 4, 0, sh * 0.96);
  }
  const top = y + lh * layers;
  b.box(x, top + 0.1, z, D * 0.2, 0.24, D * 0.2, STRAW_OLD, turn + 0.4, 0, 0.9);
  b.box(x, top + 0.4, z, 0.09, 0.8, 0.09, BAMBOO[2], turn);
}

/**
 * A sugar palm (thnot): a tall grey trunk, a round open crown of stiff fan
 * leaves on long stalks, young fans upright at the top, dead fans hanging
 * brown under the crown.
 */
function sugarPalm(b: Boxes, x: number, y: number, z: number, seed: number): void {
  b.foot.set(x, y, z);
  b.win = ALWAYS;
  const r = (q: number) => hash3(seed, q, 11, 9341);
  const H = 11 + 4 * r(1);
  // (a slight lean, curving)
  const lx = (r(2) - 0.5) * 0.9;
  const lz = (r(3) - 0.5) * 0.9;
  b.sway = 0.02;
  b.box(x, y + 0.3, z, 0.95, 0.6, 0.95, PALM_TRUNK[0], r(4));
  b.box(x, y + 0.9, z, 0.75, 0.8, 0.75, PALM_TRUNK[1], r(4) + 0.4);
  for (let s = 1; s < H; s++) {
    const f = (s / H) ** 1.5;
    b.sway = 0.06 * (s / H);
    const w = 0.62 - 0.08 * (s / H);
    b.box(x + lx * f, y + s + 0.5, z + lz * f, w, 1.02, w, pick(PALM_TRUNK, r(20 + s)), r(40 + s) * 0.3);
  }
  const cx = x + lx;
  const cy = y + H + 0.7;
  const cz = z + lz;
  b.sway = 0.065;
  b.box(cx, cy - 0.2, cz, 0.9, 1.1, 0.9, 0x4d4a36, r(5));
  // Fans on stalks, all round (a spiral): mostly out and up, a few down.
  const fans = 26;
  for (let k = 0; k < fans; k++) {
    const u = (k + 0.5) / fans;
    const elev = -0.6 + 1.85 * u + (r(50 + k) - 0.5) * 0.2;
    const az = k * 2.39996 + r(6) * 6;
    const len = 0.9 + 0.45 * r(60 + k);
    const ce = Math.cos(elev);
    const dx = Math.sin(az) * ce;
    const dz = Math.cos(az) * ce;
    const dy = Math.sin(elev);
    // (the stalk: from the core out along its way)
    b.stick(cx, cy, cz, 0.1, len, 0.1, 0x6b6a40, az, Math.PI / 2 - elev, 0.3);
    const rad = 0.3 + len + 0.55;
    b.box(cx + dx * rad, cy + dy * rad, cz + dz * rad, 1.5, 1.3, 0.1, pick(PALM_LEAF, r(90 + k)), az + (r(70 + k) - 0.5) * 0.5, -elev - 0.25);
  }
  // Young fans, folded, standing up out of the top.
  for (let k = 0; k < 2; k++) b.stick(cx + (k - 0.5) * 0.3, cy + 0.3, cz, 0.35, 1.6 + 0.4 * k, 0.12, PALM_LEAF[3], r(8) + k * 1.6, 0.15 - 0.3 * k);
  // Dead fans hanging down round the top of the trunk.
  for (let k = 0; k < 6; k++) {
    const az = (k / 6) * Math.PI * 2 + r(7);
    b.stick(cx, cy - 0.5, cz, 0.9, 1.6, 0.08, pick(PALM_DEAD, r(120 + k)), az, Math.PI - 0.3, 0.2);
  }
  b.sway = 0;
}

/** The nearest dike cell to (x, z) within 4 m, off the trail (its centre), or null. */
function dikeNear(field: HeightField, x: number, z: number): [number, number] | null {
  let best: [number, number] | null = null;
  let bd = Infinity;
  for (let dz = -4; dz <= 4; dz += CELL)
    for (let dx = -4; dx <= 4; dx += CELL) {
      const c = field.index(x + dx, z + dz);
      if (c < 0 || field.surface[c] !== SURFACE.dirt || field.trail[c]) continue;
      const i = c % field.nx;
      const k = Math.floor(c / field.nx);
      const [cx, cz] = field.cellCenter(i, k);
      if (Math.abs(cz - 83) < 2.5 || plotAt(cx, cz) >= 0) continue;
      let plots = 0;
      for (let q = -1; q <= 1; q++) for (let p = -1; p <= 1; p++) if (field.surface[c + p + q * field.nx] === SURFACE.paddy) plots++;
      if (!plots) continue;
      const d = Math.hypot(cx - x, cz - z);
      if (d < bd) {
        bd = d;
        best = [cx, cz];
      }
    }
  return best;
}

/** Where the palms stand (near these points, snapped to a dike). */
const PALMS: [number, number][] = [
  [-237, 62],
  [-189, 75],
  [-219, 101],
  [-265, 90],
  [-283, 102],
  [-169, 104],
  [-211, 58],
];
/** The straw stacks: plot and where in it (m from its middle). */
const STACKS: [number, number, number][] = [
  [0, -4, -6],
  [5, 2, 5],
  [7, 5, -5],
  [4, 5, 6],
];
/** The ting mong: plot, where in it, shirt. */
const SCARECROWS: [number, number, number, number][] = [
  [1, 3, -4, 0],
  [8, -2, 3, 1],
];

const VERTEX_PARS = /* glsl */ `
attribute vec4 aP0;
attribute vec4 aP1;
attribute vec4 aP2;
attribute vec4 aShow;
attribute vec3 aCol;
uniform float uSeason;
${SWAY_GLSL}
void propPose(out vec3 P, out vec3 N) {
  float t = fract(uSeason - aShow.x);
  float show = aShow.y < 0.0 ? 1.0 : smoothstep(0.0, aShow.y, t) * (1.0 - smoothstep(aShow.z, aShow.w, t));
  float cp = cos(aP1.w);
  float sp = sin(aP1.w);
  vec3 l = position * aP1.xyz;
  l = vec3(l.x, l.y * cp - l.z * sp, l.y * sp + l.z * cp);
  vec3 n = vec3(normal.x, normal.y * cp - normal.z * sp, normal.y * sp + normal.z * cp);
  float cy = cos(aP0.w);
  float sy = sin(aP0.w);
  l = vec3(l.x * cy + l.z * sy, l.y, -l.x * sy + l.z * cy);
  N = vec3(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy);
  P = aP2.xyz + (aP0.xyz + l - aP2.xyz) * show;
  P.xz += swayAt(aP2.xyz) * aP2.w * max(P.y - aP2.y, 0.0);
}`;

function propMaterials(season: { value: number }): { material: MeshStandardMaterial; depth: MeshDepthMaterial } {
  const u = { uSeason: season };
  const material = new MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  material.name = 'paddies:props';
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, SWAY, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}\nvarying vec3 vPropCol;`)
      .replace(
        '#include <beginnormal_vertex>',
        `vec3 prP;\nvec3 objectNormal;\npropPose(prP, objectNormal);\n// (undersides a little darker)\nvPropCol = aCol * (0.8 + 0.2 * smoothstep(-1.0, 0.3, objectNormal.y));`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = prP;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPropCol;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vPropCol;');
  };
  material.customProgramCacheKey = () => 'map-paddies-props-v1';
  const depth = new MeshDepthMaterial();
  depth.name = 'paddies:props-depth';
  depth.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, SWAY, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <begin_vertex>', 'vec3 prP;\nvec3 prN;\npropPose(prP, prN);\nvec3 transformed = prP;');
  };
  depth.customProgramCacheKey = () => 'map-paddies-props-depth-v1';
  return { material, depth };
}

export function buildProps(field: HeightField, plots: PlotPlan[], season: { value: number }): { mesh: Mesh; count: number } {
  const b = new Boxes();
  fences(b, field);
  for (const [pi, ox, oz, shirt] of SCARECROWS) {
    const pl = plots[pi];
    const x = pl.paddy.x + ox;
    const z = pl.paddy.z + oz;
    // (up after the planting, taken in before the harvest)
    scarecrow(b, x, field.heightAt(x, z), z, hash3(pi, 2, 0, 9351) * 6.28, SHIRT[shirt], { at: pl.lag + pl.plant + SWEEP + 0.01, len: 0.015, outAt: pl.lag + pl.cut - 0.015, outLen: 0.012 });
  }
  // Stooks: behind the reapers, until the threshing.
  for (const pl of plots) {
    const p = pl.paddy;
    for (let u = -p.w / 2 + 3.5; u <= p.w / 2 - 3; u += 5.5)
      for (let v = -p.d / 2 + 3.5; v <= p.d / 2 - 3; v += 5.5) {
        const seed = pl.index * 131 + Math.round(u * 7 + v * 53);
        const x = p.x + u + (hash3(seed, 1, 2, 9361) - 0.5) * 2;
        const z = p.z + v + (hash3(seed, 2, 2, 9361) - 0.5) * 2;
        if (plotAt(x, z) !== pl.index) continue;
        const cut = pl.lag + pl.cut + sweepOrder(pl, x, z) * SWEEP;
        b.win = { at: cut + 0.004, len: 0.005, outAt: pl.lag + pl.cut + SWEEP + 0.028 + hash3(seed, 3, 2, 9361) * 0.01, outLen: 0.006 };
        stook(b, x, field.heightAt(x, z) + 0.04, z, seed);
      }
  }
  // Straw stacks: after the threshing, through the dry season, gone before the plots fill.
  for (const [pi, ox, oz] of STACKS) {
    const pl = plots[pi];
    const x = pl.paddy.x + ox;
    const z = pl.paddy.z + oz;
    strawStack(b, x, field.heightAt(x, z) + 0.03, z, pi, { at: pl.lag + pl.cut + SWEEP + 0.035, len: 0.05, outAt: pl.lag + 1.03, outLen: 0.03 });
  }
  PALMS.forEach(([px, pz], i) => {
    const at = dikeNear(field, px, pz);
    if (at) sugarPalm(b, at[0], field.heightAt(at[0], at[1]), at[1], i);
  });

  const n = b.count;
  const geo = new InstancedBufferGeometry();
  const box = new BoxGeometry(1, 1, 1);
  geo.index = box.index;
  geo.setAttribute('position', box.getAttribute('position'));
  geo.setAttribute('normal', box.getAttribute('normal'));
  geo.setAttribute('aP0', new InstancedBufferAttribute(new Float32Array(b.p0), 4));
  geo.setAttribute('aP1', new InstancedBufferAttribute(new Float32Array(b.p1), 4));
  geo.setAttribute('aP2', new InstancedBufferAttribute(new Float32Array(b.p2), 4));
  geo.setAttribute('aShow', new InstancedBufferAttribute(new Float32Array(b.show), 4));
  geo.setAttribute('aCol', new InstancedBufferAttribute(new Float32Array(b.col), 3));
  geo.instanceCount = n;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, b.p0[i * 4]);
    x1 = Math.max(x1, b.p0[i * 4]);
    y0 = Math.min(y0, b.p0[i * 4 + 1]);
    y1 = Math.max(y1, b.p0[i * 4 + 1]);
    z0 = Math.min(z0, b.p0[i * 4 + 2]);
    z1 = Math.max(z1, b.p0[i * 4 + 2]);
  }
  geo.boundingSphere = new Sphere(new Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 4);
  const { material, depth } = propMaterials(season);
  const mesh = new Mesh(geo, material);
  mesh.name = 'paddies:props';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.customDepthMaterial = depth;
  return { mesh, count: n };
}
