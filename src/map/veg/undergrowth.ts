import { BoxGeometry, Color, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, MeshStandardMaterial, Vector3, type WebGLProgramParametersWithUniforms } from 'three';
import { hash3 } from '../../voxel/random';
import { CELL, fbm, SURFACE, type HeightField } from '../heightfield';
import { ROAM_SCALE } from '../roam/types';
import type { MapContext, MapFrame, MapPart } from '../types';
import { canopyOf, type Canopy } from './canopy';
import { elephantEar, fallenLog, fern, FLOWER_SETS, flowers, grassTuft, hangingVine, litter, reeds, type PlantSink } from './plants';
import { stepWind, SWAY, SWAY_GLSL, swayLand } from './sway';

/**
 * Undergrowth: the forest floor round the roaming explorer — ferns,
 * elephant ears, grass tufts, ground flowers, reeds on the banks, leaf
 * litter, fallen logs, and vines hanging from the crowns near the roads.
 * Plants you walk through: they brush aside round him and sway in the wind
 * (veg/sway.ts), and they are not voxel blocks of the jungle (its budget is
 * full) nor solid (roam/walkmap.ts `SKIP_PARTS`).
 *
 * A streamed pool: the land round him is cut into 4 m cells; each cell near
 * him is filled once from its own seed (the same spot always grows the same
 * plants), when he has moved a few metres, into the one InstancedMesh (plain
 * boxes, one draw call), packed one after the other: only the boxes filled
 * are drawn. Plants grow out of the ground at the pool's edge (32–44 m) and
 * are gone past it; cells left behind are let go (already gone from sight),
 * and the pool is packed again once enough of them pile up. Dense under the
 * crowns (veg/canopy.ts), sparse on open grass, reeds on the river banks,
 * nothing on the roads, trails, pads, water, bare built ground
 * (`field.occupied`) or tree trunks.
 *
 * Off in the overview and while gliding high (nothing drawn).
 */

/** Pool cell (m): two by two land cells. */
const POOL_CELL = 4;
/** Plants start to shrink this far from him and are gone here (m). */
const FADE = { from: 32, to: 44 };
/** Plan the pool again once he is this far from where it was planned (m). */
const REPLAN = 3;
/** Cells whose middle is this close to the plan's centre are kept or filled (m). */
const KEEP = FADE.to + POOL_CELL * Math.SQRT1_2 + REPLAN + 0.5;
/** Boxes per cell at most. */
const CAP = 80;
const SLOTS = Math.ceil((Math.PI * (KEEP + POOL_CELL) ** 2) / (POOL_CELL * POOL_CELL));
/** The pool is packed again (the cells let go squeezed out) once this many boxes of them lie between the kept ones. */
const REPACK = 60 * CAP;
/** Cells filled per frame at most (the edge of the pool, faded anyway). */
const FILL_PER_FRAME = 12;
/** Higher than this over the ground (gliding), the undergrowth goes (m). */
const HIGH = { from: 30, to: 45 };
/** The listener is his head: his feet are this far below (m). */
const HEAD = 1.7 * ROAM_SCALE;
/** Vines hang from crowns this near a road or trail (m; trunks keep ≈ 9 m off a road's middle). */
const VINE_REACH = 14;

/** Shared by the material: his feet, and the fade (from, to, shown 0‥1). */
const UG = {
  uFocus: { value: new Vector3() },
  uFade: { value: new Vector3(FADE.from, FADE.to, 0) },
};

/** Flex code of hanging plants (vines): 10 + their flex. */
const HANG = 10;

const PARS_VERTEX = /* glsl */ `
attribute vec4 aBase;
uniform vec3 uFocus;
uniform vec3 uFade;
varying float vUgAo;`;

/**
 * Per vertex, in world space (the part stays at the origin): shrink the
 * plant into its foot at the pool's edge, bend it with the wind and away
 * from him, then project. `aBase` = (foot x, y, z, flex); flex ≥ 10: a
 * hanging plant, its foot at the top.
 */
const VERTEX = /* glsl */ `
vec3 ugB = aBase.xyz;
float ugHang = step(${(HANG - 0.5).toFixed(1)}, aBase.w);
float ugFlex = aBase.w - ${HANG}.0 * ugHang;
vec3 ugW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
float ugD = distance(ugB.xz, uFocus.xz);
vec3 ugP = ugB + (ugW - ugB) * (uFade.z * (1.0 - smoothstep(uFade.x, uFade.y, ugD)));
float ugH = abs(ugP.y - ugB.y);
// The wind (the land's sway at its foot, and a flutter of its own), and him walking through.
vec2 ugWind = swayAt(ugB) * 0.7 + vec2(-uSwayDir.y, uSwayDir.x) * sin(uSwayTime * 3.3 + dot(ugB.xz, vec2(1.7, 2.3))) * (0.015 + 0.05 * uSwayWind);
float ugNear = (1.0 - smoothstep(0.35, 1.5, ugD)) * (1.0 - step(mix(2.5, 9.0, ugHang), abs(ugB.y - uFocus.y)));
ugP.xz += (ugWind + (ugB.xz - uFocus.xz) / max(ugD, 0.05) * ugNear * 0.55) * ugFlex * ugH;
ugP.y -= ugNear * ugFlex * ugH * ugH * 0.2 * (1.0 - ugHang);
// (standing plants darker at their feet)
vUgAo = mix(1.0, mix(0.7, 1.0, smoothstep(0.0, 0.45, ugH)), step(0.01, ugFlex) * (1.0 - ugHang));
vec4 mvPosition = viewMatrix * vec4(ugP, 1.0);
gl_Position = projectionMatrix * mvPosition;`;

/** Close to the camera, plants dissolve in a fine dither (the view never looks through a leaf). */
const FRAGMENT = /* glsl */ `
{
  float ugCam = length(vViewPosition);
  vec2 ugA = floor(gl_FragCoord.xy);
  vec2 ugA2 = floor(0.5 * gl_FragCoord.xy);
  float ugDither = fract(ugA2.x * 0.5 + ugA2.y * ugA2.y * 0.75) * 0.25 + fract(ugA.x * 0.5 + ugA.y * ugA.y * 0.75);
  if (ugCam < 1.8 && smoothstep(0.5, 1.8, ugCam) < ugDither) discard;
}`;

/** The pool's material: lit and matte like the map's leaf blocks, shadowed by the crowns. */
function undergrowthMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, SWAY, UG);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SWAY_GLSL}\n${PARS_VERTEX}`)
      .replace('#include <project_vertex>', VERTEX)
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(ugP, 1.0);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vUgAo;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FRAGMENT}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vUgAo;')
      // (matte, like the voxel leaves: no sun highlight, no sheen)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.directSpecular *= 0.0;\nreflectedLight.indirectSpecular *= 0.0;');
  };
  m.customProgramCacheKey = () => 'map-undergrowth-v1';
  m.name = 'undergrowth';
  return m;
}

/** Most boxes a plant of each kind can have (it is only started when they fit). */
const MAX = { vine: 22, log: 8, ear: 12, fern: 20, flowers: 15, reeds: 10, grass: 6, litter: 6 };

type Ground = 'floor' | 'bank' | 'rock';

/** One land cell of a pool cell, as the plants see it. */
interface Spot {
  x: number;
  z: number;
  y: number;
  ground: Ground;
  /** Shade from the crowns 0‥1, near water, a higher neighbour or a trail beside it (small plants only). */
  cover: number;
  wet: boolean;
  tight: boolean;
}

const _c = new Color();

class Pool implements PlantSink {
  readonly mesh: InstancedMesh;
  private readonly m: Float32Array;
  private readonly col: Float32Array;
  private readonly base: Float32Array;
  private readonly baseAttr: InstancedBufferAttribute;
  /** The boxes of each filled cell (first, count), in the order they lie in the pool. */
  private readonly cells = new Map<number, { at: number; n: number }>();
  /** Boxes in use (drawn: the kept cells and those let go since the last packing), and of cells let go. */
  used = 0;
  private dropped = 0;
  private readonly queue: number[] = [];
  private readonly queued = new Set<number>();
  private readonly linear = new Map<number, [number, number, number]>();
  private readonly spots: Spot[] = [0, 1, 2, 3].map(() => ({ x: 0, z: 0, y: 0, ground: 'floor', cover: 0, wet: false, tight: false }));
  private readonly trunks: number[] = [];
  /** Where the pool was planned (NaN: never). */
  planX = NaN;
  planZ = NaN;
  // The plant being written: its foot, turn, size, flex, tint, and the slot's next box.
  private px = 0;
  private py = 0;
  private pz = 0;
  private cos = 1;
  private sin = 0;
  private k = 1;
  private flex = 0;
  private tint = 1;
  private at = 0;
  private end = 0;
  /** Boxes written and cells filled (stats). */
  readonly stats = { boxes: 0, cells: 0, ms: 0 };

  constructor(
    private readonly field: HeightField,
    private readonly canopy: Canopy | null,
    private readonly nearPath: Uint8Array,
  ) {
    const geo = new BoxGeometry(1, 1, 1);
    const n = SLOTS * CAP;
    this.base = new Float32Array(n * 4);
    this.baseAttr = new InstancedBufferAttribute(this.base, 4);
    this.baseAttr.setUsage(DynamicDrawUsage);
    geo.setAttribute('aBase', this.baseAttr);
    this.mesh = new InstancedMesh(geo, undergrowthMaterial(), n);
    this.mesh.name = 'undergrowth:plants';
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    // (all zero: every box starts as nothing)
    this.m = this.mesh.instanceMatrix.array as Float32Array;
    this.m.fill(0);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    this.col = this.mesh.instanceColor.array as Float32Array;
    // (the pool moves with him: never culled as a whole; shadows from the crowns, none cast)
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
  }

  /** Plan round (x, z): let go of cells too far, queue the missing ones (nearest first). */
  plan(x: number, z: number): void {
    this.planX = x;
    this.planZ = z;
    const half = POOL_CELL / 2;
    // (a cell let go keeps its boxes till the next packing: past the fade, nothing of it shows)
    for (const [key, cell] of this.cells) {
      if (keyDist(key, x, z) <= KEEP) continue;
      this.cells.delete(key);
      this.dropped += cell.n;
    }
    const r = Math.ceil(KEEP / POOL_CELL) + 1;
    const c0 = Math.floor(x / POOL_CELL);
    const k0 = Math.floor(z / POOL_CELL);
    for (let ck = k0 - r; ck <= k0 + r; ck++)
      for (let ci = c0 - r; ci <= c0 + r; ci++) {
        if (Math.hypot(ci * POOL_CELL + half - x, ck * POOL_CELL + half - z) > KEEP) continue;
        const key = cellKey(ci, ck);
        if (this.cells.has(key) || this.queued.has(key)) continue;
        this.queued.add(key);
        this.queue.push(key);
      }
    // (nearest last: popped first)
    this.queue.sort((a, b) => keyDist(b, x, z) - keyDist(a, x, z));
  }

  /** Fill up to `max` queued cells. */
  drain(max: number): void {
    if (!this.queue.length) return;
    const t0 = performance.now();
    for (let n = 0; n < max && this.queue.length; n++) {
      if (this.dropped > REPACK || this.used + CAP > SLOTS * CAP) this.pack();
      // (full: the rest waits)
      if (this.used + CAP > SLOTS * CAP) break;
      const key = this.queue.pop()!;
      this.queued.delete(key);
      // (planned again since: too far now)
      if (keyDist(key, this.planX, this.planZ) > KEEP) continue;
      const at = this.used;
      this.fill(keyI(key), keyK(key), at);
      this.cells.set(key, { at, n: this.at - at });
      this.used = this.at;
    }
    this.stats.ms = performance.now() - t0;
  }

  /** Squeeze out the boxes of the cells let go: the kept ones move down, in order, and are uploaded. */
  private pack(): void {
    const list = [...this.cells.values()].sort((a, b) => a.at - b.at);
    let to = 0;
    let first = -1;
    for (const c of list) {
      if (c.at !== to) {
        if (first < 0) first = to;
        const end = c.at + c.n;
        this.m.copyWithin(to * 16, c.at * 16, end * 16);
        this.col.copyWithin(to * 3, c.at * 3, end * 3);
        this.base.copyWithin(to * 4, c.at * 4, end * 4);
        c.at = to;
      }
      to += c.n;
    }
    if (first >= 0) this.upload(first, to);
    this.used = to;
    this.dropped = 0;
  }

  /** Send boxes [from, to) to the GPU. */
  private upload(from: number, to: number): void {
    if (to <= from) return;
    this.mesh.instanceMatrix.addUpdateRange(from * 16, (to - from) * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.addUpdateRange(from * 3, (to - from) * 3);
    this.mesh.instanceColor!.needsUpdate = true;
    this.baseAttr.addUpdateRange(from * 4, (to - from) * 4);
    this.baseAttr.needsUpdate = true;
  }

  get pending(): number {
    return this.queue.length;
  }

  // ── Writing plants ──────────────────────────────────────────────────────
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, color: number, shade: number, tilt = 0): void {
    if (this.at >= this.end) return;
    const i = this.at++;
    const k = this.k;
    const c = this.cos;
    const s = this.sin;
    const X = this.px + k * (c * x + s * z);
    const Z = this.pz + k * (-s * x + c * z);
    const Y = this.py + k * y;
    // Turn about y (the plant's and the box's own), after a tip about the box's z axis.
    const cf = Math.cos(yaw) * c - Math.sin(yaw) * s;
    const sf = Math.sin(yaw) * c + Math.cos(yaw) * s;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const m = this.m;
    const o = i * 16;
    m[o] = cf * ct * sx * k;
    m[o + 1] = st * sx * k;
    m[o + 2] = -sf * ct * sx * k;
    m[o + 3] = 0;
    m[o + 4] = -cf * st * sy * k;
    m[o + 5] = ct * sy * k;
    m[o + 6] = sf * st * sy * k;
    m[o + 7] = 0;
    m[o + 8] = sf * sz * k;
    m[o + 9] = 0;
    m[o + 10] = cf * sz * k;
    m[o + 11] = 0;
    m[o + 12] = X;
    m[o + 13] = Y;
    m[o + 14] = Z;
    m[o + 15] = 1;
    let lin = this.linear.get(color);
    if (!lin) {
      _c.setHex(color);
      this.linear.set(color, (lin = [_c.r, _c.g, _c.b]));
    }
    const b = shade * this.tint;
    this.col[i * 3] = lin[0] * b;
    this.col[i * 3 + 1] = lin[1] * b;
    this.col[i * 3 + 2] = lin[2] * b;
    this.base[i * 4] = this.px;
    this.base[i * 4 + 1] = this.py;
    this.base[i * 4 + 2] = this.pz;
    this.base[i * 4 + 3] = this.flex;
  }

  /** Start a plant (if `need` boxes still fit): its foot, turn, size, flex and tint. */
  private start(need: number, x: number, y: number, z: number, yaw: number, k: number, flex: number, tint: number): boolean {
    if (this.at + need > this.end) return false;
    this.px = x;
    this.py = y;
    this.pz = z;
    this.cos = Math.cos(yaw);
    this.sin = Math.sin(yaw);
    this.k = k;
    this.flex = flex;
    this.tint = tint;
    return true;
  }

  // ── A cell ──────────────────────────────────────────────────────────────
  /** Grow a cell's plants into the pool from box `from` (seeded by the cell; `CAP` boxes at most), and upload them. */
  private fill(ci: number, ck: number, from: number): void {
    const f = this.field;
    const x0 = ci * POOL_CELL;
    const z0 = ck * POOL_CELL;
    this.at = from;
    this.end = from + CAP;
    const rnd = rng(ci, ck);

    // Trunks round the cell (no plant grows in them).
    const trunks = this.trunks;
    trunks.length = 0;
    this.canopy?.near(x0, z0, x0 + POOL_CELL, z0 + POOL_CELL, 4, (n) => void trunks.push(n));

    // The land cells.
    let usable = 0;
    for (let q = 0; q < 4; q++) {
      const sp = this.spots[q];
      sp.x = x0 + (q & 1) * CELL + CELL / 2;
      sp.z = z0 + (q >> 1) * CELL + CELL / 2;
      if (this.ground(sp)) usable++;
      else sp.cover = -1;
    }

    // 1. Vines from the crowns of trees standing in this cell, near a road or trail.
    // (two vines a cell at most: the ground plants need room too)
    let vines = 0;
    if (this.canopy)
      for (const n of trunks) {
        const t = this.canopy.trees[n];
        if (Math.floor(t.x / POOL_CELL) !== ci || Math.floor(t.z / POOL_CELL) !== ck) continue;
        if (t.kind !== 'broadleaf' && t.kind !== 'emergent' && t.kind !== 'flowering') continue;
        if (t.low < 3 || !this.pathNear(t.x, t.z)) continue;
        const want = 1 + Math.floor(rnd() * 2.6);
        for (let v = 0; v < want && vines < 2; v++) {
          const a = rnd() * Math.PI * 2;
          const d = t.r * (0.3 + rnd() * 0.4);
          const ax = t.x + Math.cos(a) * d;
          const az = t.z + Math.sin(a) * d;
          const top = t.y + t.low + 0.3;
          const len = Math.min(7, top - f.standY(ax, az) - (1.3 + rnd() * 1.2));
          if (len < 1.2) continue;
          if (!this.start(MAX.vine, ax, top, az, rnd() * Math.PI * 2, 1, HANG + 0.4, 0.9 + rnd() * 0.2)) continue;
          hangingVine(this, rnd, len);
          vines++;
        }
      }
    if (usable) {
      // 2. Now and then a fallen log under the crowns (on flat ground, off the paths).
      const sp = this.spots[Math.floor(rnd() * 4)];
      if (sp.cover >= 0.4 && sp.ground === 'floor' && !sp.tight && rnd() < 0.05 + 0.1 * sp.cover && !this.pathNear(sp.x, sp.z)) {
        const len = 2.5 + rnd() * 1.5;
        const yaw = rnd() * Math.PI;
        const dx = Math.cos(yaw) * (len / 2);
        const dz = -Math.sin(yaw) * (len / 2);
        const x = sp.x + (rnd() - 0.5) * 0.6;
        const z = sp.z + (rnd() - 0.5) * 0.6;
        if (this.flat(x + dx, z + dz, sp.y) && this.flat(x - dx, z - dz, sp.y) && this.clear(x, z, len / 2) && this.start(MAX.log, x, sp.y, z, yaw, 1, 0, 0.9 + rnd() * 0.2)) fallenLog(this, rnd, len);
      }
      // 3. Plants by size, so the big ones always fit: elephant ears, ferns, flowers, reeds, grass, leaf litter.
      for (const sp of this.spots) {
        if (sp.cover < 0 || sp.ground !== 'floor') continue;
        const n = count(rnd, (0.05 + 0.2 * sp.cover) * (sp.wet ? 2.5 : 1));
        for (let q = 0; q < n; q++) this.plant(sp, rnd, MAX.ear, 0.4, 0.9 + 0.6 * rnd(), 0.7, elephantEar);
      }
      for (const sp of this.spots) {
        if (sp.cover < 0 || sp.ground === 'bank') continue;
        const patch = 0.5 + fbm(sp.x / 9, sp.z / 9, 811);
        const n = count(rnd, (sp.ground === 'rock' ? 0.15 : 0.15 + 0.6 * sp.cover) * patch);
        for (let q = 0; q < n; q++) this.plant(sp, rnd, MAX.fern, 0.45, 0.75 + 0.55 * rnd(), 1, fern);
      }
      for (const sp of this.spots) {
        if (sp.cover < 0 || sp.ground !== 'floor') continue;
        const meadow = fbm(sp.x / 14, sp.z / 14, 813);
        if (rnd() > 0.04 + 0.16 * (1 - sp.cover) + 0.35 * Math.max(0, meadow - 0.55) * 4) continue;
        const colors = FLOWER_SETS[Math.floor(fbm(sp.x / 30, sp.z / 30, 817) * 7) % FLOWER_SETS.length];
        this.plant(sp, rnd, MAX.flowers, 0.3, 0.9 + 0.3 * rnd(), 1.1, (p, r) => flowers(p, r, colors));
      }
      for (const sp of this.spots) {
        if (sp.cover < 0 || sp.ground !== 'bank') continue;
        const n = count(rnd, sp.wet ? 1.1 : 0.4);
        for (let q = 0; q < n; q++) this.plant(sp, rnd, MAX.reeds, 0.2, 0.85 + 0.4 * rnd(), 1, reeds);
      }
      for (const sp of this.spots) {
        if (sp.cover < 0) continue;
        // (sparse on open grass, thicker in meadow patches)
        const meadow = 0.6 + 0.8 * fbm(sp.x / 14, sp.z / 14, 813);
        const n = count(rnd, sp.ground === 'floor' ? (1.6 - 0.7 * sp.cover) * meadow : sp.ground === 'bank' ? 0.8 : 0.4);
        for (let q = 0; q < n; q++) this.plant(sp, rnd, MAX.grass, 0.1, 0.8 + 0.5 * rnd(), 1.3, grassTuft);
      }
      for (const sp of this.spots) {
        if (sp.cover < 0.25 || sp.ground !== 'floor') continue;
        const n = count(rnd, 0.9 * sp.cover);
        for (let q = 0; q < n; q++) this.plant(sp, rnd, MAX.litter, 0.3, 1, 0, litter);
      }
    }

    this.stats.boxes += this.at - from;
    this.stats.cells++;
    this.upload(from, this.at);
  }

  /** A plant somewhere in a land cell (off the trunks; small near a higher neighbour). */
  private plant(sp: Spot, rnd: () => number, need: number, radius: number, k: number, flex: number, draw: (p: PlantSink, r: () => number) => void): void {
    const room = sp.tight ? 0.3 : 0.75;
    const x = sp.x + (rnd() - 0.5) * 2 * room;
    const z = sp.z + (rnd() - 0.5) * 2 * room;
    const yaw = rnd() * Math.PI * 2;
    const tint = 0.9 + rnd() * 0.2;
    if (sp.tight) k = Math.min(k, 0.7);
    if (!this.clear(x, z, radius * k)) return;
    if (this.start(need, x, sp.y, z, yaw, k, flex, tint)) draw(this, rnd);
  }

  /** Is a land cell ground to grow on? Fills its spot (kind, height, shade, wet, tight). */
  private ground(sp: Spot): boolean {
    const f = this.field;
    const c = f.index(sp.x, sp.z);
    // (not on a trail's tread: the band beside it gets small plants, the trail stays clear)
    if (c < 0 || f.water[c] > -1000 || f.lod[c] !== 0 || f.trail[c] === 2) return false;
    const s = f.surface[c];
    // (grass and rock that nothing is built on; sand on the banks is always "occupied")
    if (s === SURFACE.sand) sp.ground = 'bank';
    else if (f.occupied[c]) return false;
    else if (s === SURFACE.grass) sp.ground = 'floor';
    else if (s === SURFACE.rock) sp.ground = 'rock';
    else return false;
    const y = f.height[c];
    sp.y = y;
    sp.cover = this.canopy ? this.canopy.cover[c] / 255 : 0.25 + 0.5 * fbm(sp.x / 40, sp.z / 40, 821);
    sp.wet = s === SURFACE.sand || f.waterAt(sp.x + 4, sp.z) !== null || f.waterAt(sp.x - 4, sp.z) !== null || f.waterAt(sp.x, sp.z + 4) !== null || f.waterAt(sp.x, sp.z - 4) !== null;
    sp.tight = f.trail[c] === 1 || f.heightAt(sp.x + CELL, sp.z) > y || f.heightAt(sp.x - CELL, sp.z) > y || f.heightAt(sp.x, sp.z + CELL) > y || f.heightAt(sp.x, sp.z - CELL) > y;
    return true;
  }

  /** The ground at (x, z) is at height y and free (a log's ends). */
  private flat(x: number, z: number, y: number): boolean {
    const f = this.field;
    const c = f.index(x, z);
    return c >= 0 && f.height[c] === y && !f.occupied[c] && !f.trail[c] && f.water[c] < -1000 && f.surface[c] === SURFACE.grass;
  }

  /** No trunk within `r` of (x, z). */
  private clear(x: number, z: number, r: number): boolean {
    if (!this.canopy) return true;
    for (const n of this.trunks) {
      const t = this.canopy.trees[n];
      if (Math.hypot(t.x - x, t.z - z) < this.canopy.trunk[n] + r * 0.6) return false;
    }
    return true;
  }

  private pathNear(x: number, z: number): boolean {
    const c = this.field.index(x, z);
    return c >= 0 && this.nearPath[c] === 1;
  }
}

/** A whole number of plants for an expected count (seeded). */
function count(rnd: () => number, expected: number): number {
  return Math.floor(expected + rnd());
}

const cellKey = (ci: number, ck: number) => (ci + 1024) * 2048 + (ck + 1024);
const keyI = (key: number) => Math.floor(key / 2048) - 1024;
const keyK = (key: number) => (key % 2048) - 1024;
/** Distance from a pool cell's middle to (x, z) (m). */
const keyDist = (key: number, x: number, z: number) => Math.hypot((keyI(key) + 0.5) * POOL_CELL - x, (keyK(key) + 0.5) * POOL_CELL - z);

/** Seeded stream of a pool cell. */
function rng(ci: number, ck: number): () => number {
  let n = 0;
  return () => hash3(ci, ck, n++, 907);
}

/** Land cells within reach of a road or a trail (vines hang there). */
function pathCells(f: HeightField): Uint8Array {
  const near = new Uint8Array(f.nx * f.nz);
  const lines = [...f.paths, ...f.trails].map((p) => p.samples);
  const r = VINE_REACH;
  for (const samples of lines)
    for (let s = 0; s < samples.length; s += 2) {
      const { x, z } = samples[s];
      for (let dz = -r; dz <= r; dz += CELL)
        for (let dx = -r; dx <= r; dx += CELL) {
          if (dx * dx + dz * dz > r * r) continue;
          const c = f.index(x + dx, z + dz);
          if (c >= 0) near[c] = 1;
        }
    }
  return near;
}

export function buildUndergrowth(ctx: MapContext): MapPart {
  const f = ctx.field;
  swayLand(f);
  const object = new Group();
  object.name = 'undergrowth';
  const pool = new Pool(f, canopyOf(f), pathCells(f));
  object.add(pool.mesh);
  let shown = 0;
  const stats = new URLSearchParams(location.search).has('vegstats');
  let logged = false;
  return {
    name: 'undergrowth',
    object,
    update(fr: MapFrame) {
      stepWind(fr, 'undergrowth');
      const L = fr.listener;
      const feet = L.y - HEAD;
      let want = fr.roam === 'overview' || fr.roam === 'leap' ? 0 : 1;
      // (from high up in the air the plants are too small to see)
      if (want && (fr.roam === 'glide' || fr.roam === 'hang' || fr.roam === 'balloon')) {
        const above = feet - f.standY(L.x, L.z);
        want = 1 - Math.min(1, Math.max(0, (above - HIGH.from) / (HIGH.to - HIGH.from)));
      }
      shown = ctx.shot ? want : shown + (want - shown) * (1 - Math.exp(-2.5 * fr.dt));
      if (shown < 0.002 && want === 0) {
        pool.mesh.count = 0;
        UG.uFade.value.z = 0;
        return;
      }
      UG.uFade.value.z = shown;
      UG.uFocus.value.set(L.x, feet, L.z);
      if (!(Math.hypot(L.x - pool.planX, L.z - pool.planZ) <= REPLAN)) pool.plan(L.x, L.z);
      pool.drain(ctx.shot ? Infinity : FILL_PER_FRAME);
      // (only the boxes filled: the rest of the pool is not drawn)
      pool.mesh.count = pool.used;
      if (stats && !pool.pending && !logged) {
        logged = true;
        console.info(`[map] undergrowth: ${pool.stats.cells} cells, ${pool.stats.boxes} boxes (${(pool.stats.boxes / Math.max(1, pool.stats.cells)).toFixed(1)} a cell, pool ${SLOTS} × ${CAP}) · last fill ${pool.stats.ms.toFixed(2)} ms`);
      }
    },
  };
}
