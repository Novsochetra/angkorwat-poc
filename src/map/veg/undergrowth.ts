import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DynamicDrawUsage,
  FloatType,
  Frustum,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  NearestFilter,
  RGBAFormat,
  Vector3,
  Vector4,
  type Intersection,
  type Material,
  type PerspectiveCamera,
  type Raycaster,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { hash3 } from '../../voxel/random';
import { graphicsNow, STILL_LAYER } from '../graphics';
import { CELL, fbm, SURFACE, type HeightField } from '../heightfield';
import { ROAM_SCALE } from '../roam/types';
import type { GraphicsLevel, MapContext, MapFrame, MapPart } from '../types';
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
 * plants), when he has moved a few metres, into a row of its own of one
 * float texture (`uUgBoxes`: four texels a box, `CAP` boxes a row; a cell
 * let go frees its row). Plants grow out of the ground at the pool's edge
 * (32–44 m; on the low level, phones, 24–32 m) and are gone past it.
 * Dense under the crowns (veg/canopy.ts), sparse on open grass, reeds on
 * the river banks, nothing on the roads, trails, pads, water, bare built
 * ground (`field.occupied`) or tree trunks.
 *
 * What is drawn (one draw, `aUgId`: a list of box numbers, written again
 * only when it changes):
 *  - only the cells in view (their spheres against the camera's frustum,
 *    with a margin) and short of the pool's fade, nearest first;
 *  - each box as the three sides that can face the camera (6 triangles,
 *    not 12): the shape is one corner of a box, turned in the vertex shader
 *    to the camera's side of each box (the picture is the same);
 *  - fewer boxes farther off (`LOD`, by graphics level, from the camera):
 *    each plant's boxes are ranked by size when it grows, its smallest
 *    first to go (a fern's tips and young tuft, two of a grass tuft's
 *    blades, the leaf litter, a log's fungi), shrinking into themselves over
 *    a few metres while the boxes kept broaden a little (`wide`), so the
 *    meadow stays as full; a cell far off lists only the boxes it keeps
 *    there (they lie first in its row). Up close (under ~10 m) every box.
 *
 * Bug reports: the mesh is an InstancedMesh whose matrices and colours are
 * written only when it is picked (a click's ray, or the box / loop pass:
 * `syncPick`), with the whole box for the ray and the ID pass. The snow's
 * map from above (sky/snow.ts `TopView`: the still layer drawn from
 * straight above, so no snow lies under a plant's leaves) sees every box of
 * the pool, whole, in a stand-in (`undergrowth:top`) on the still layer
 * only: never drawn in the picture, never cast, never picked.
 *
 * Off in the overview and while gliding high (nothing drawn).
 * URL: `vegstats` logs the pool's numbers.
 */

/** Pool cell (m): two by two land cells. */
const POOL_CELL = 4;
/** Plants start to shrink this far from him and are gone here (m); nearer on the low graphics level (phones). */
const FADE = { from: 32, to: 44 };
const FADE_LOW = { from: 24, to: 32 };
/** Plan the pool again once he is this far from where it was planned (m). */
const REPLAN = 3;
/** Cells whose middle is this close to the plan's centre are kept or filled (m), for a fade. */
const keepFor = (fade: { to: number }) => fade.to + POOL_CELL * Math.SQRT1_2 + REPLAN + 0.5;
const KEEP = keepFor(FADE);
/** Boxes per cell at most (a row of the boxes' texture). */
const CAP = 80;
/** Cells the pool holds at most (rows of the texture). */
const SLOTS = Math.ceil((Math.PI * (KEEP + POOL_CELL) ** 2) / (POOL_CELL * POOL_CELL));
/** Cells filled per frame at most (the edge of the pool, faded anyway). */
const FILL_PER_FRAME = 12;
/** Higher than this over the ground (gliding), the undergrowth goes (m). */
const HIGH = { from: 30, to: 45 };
/** The listener is his head: his feet are this far below (m). */
const HEAD = 1.7 * ROAM_SCALE;
/** Vines hang from crowns this near a road or trail (m; trunks keep ≈ 9 m off a road's middle). */
const VINE_REACH = 14;
/** Texels a box: centre + turn, size + tip, foot + flex, colour + LOD. */
const TEXELS = 4;

/**
 * Detail by distance from the camera (m), by graphics level: the boxes of the
 * second rank (`tier` 2: the smallest, a fern's young tuft, half the leaf
 * litter) shrink away over `t2`, those of the first rank (a fern's tips, a
 * grass tuft's two smallest blades, the rest of the litter, a log's fungi)
 * over `t1`, while the boxes kept broaden by their plant's `wide` over `t1`.
 */
const LOD: Record<GraphicsLevel, { t2: [number, number]; t1: [number, number] }> = {
  low: { t2: [10, 13], t1: [14, 19] },
  medium: { t2: [12, 16], t1: [18, 24] },
  high: { t2: [14, 18], t1: [22, 28] },
  max: { t2: [18, 24], t1: [28, 36] },
};

/** A walk's view (degrees): through binoculars or a zoomed photo camera, the detail's reaches grow with the zoom. */
const WALK_FOV = 50;

/** How much nearer than a walk's view the camera shows things (binoculars, a photo's zoom): 1 or more. */
function zoomOf(cam: PerspectiveCamera): number {
  return Math.max(1, (Math.tan(MathUtils.degToRad(WALK_FOV / 2)) * cam.zoom) / Math.tan(MathUtils.degToRad(cam.fov / 2)));
}

/**
 * How a kind of plant thins out far off: the share of its boxes (smallest
 * first, by the area of their broad side) of the second rank (`f2`, gone
 * first) and of the first rank or the second (`f1`), and how much its kept
 * boxes broaden (`wide`, across: x and z of the box) once they are gone.
 */
interface Thin {
  f2: number;
  f1: number;
  wide: number;
}
const KEEP_ALL: Thin = { f2: 0, f1: 0, wide: 0 };
const THIN = {
  vine: KEEP_ALL,
  ear: KEEP_ALL,
  flowers: KEEP_ALL,
  reeds: KEEP_ALL,
  // (its fungi)
  log: { f2: 0, f1: 0.25, wide: 0 },
  // (its tips and young tuft)
  fern: { f2: 0, f1: 0.35, wide: 0.14 },
  // (two of five blades)
  grass: { f2: 0, f1: 0.4, wide: 0.3 },
  litter: { f2: 0.5, f1: 1, wide: 0 },
} satisfies Record<string, Thin>;

/** Shared by the material: his feet, the fade (from, to, shown 0‥1), the boxes, the detail's reaches. */
const UG = {
  uFocus: { value: new Vector3() },
  uFade: { value: new Vector3(FADE.from, FADE.to, 0) },
  uUgBoxes: { value: null as DataTexture | null },
  uUgLod: { value: new Vector4(LOD.medium.t2[0], LOD.medium.t2[1], LOD.medium.t1[0], LOD.medium.t1[1]) },
};

/** Flex code of hanging plants (vines): 10 + their flex. */
const HANG = 10;

const PARS_VERTEX = /* glsl */ `
attribute float aUgId;
uniform sampler2D uUgBoxes;
uniform vec3 uFocus;
uniform vec3 uFade;
uniform vec4 uUgLod;
varying float vUgAo;`;

/**
 * Per vertex, in world space (the part stays at the origin; three's
 * instancing is not used: the box comes from `uUgBoxes`, row `id / CAP`).
 * The shape is the +x, +y, +z sides of a unit box: turned (a proper
 * rotation, so the sides stay wound outward) to the corner on the camera's
 * side of this box, they are the sides that can face the camera. Then: the
 * box shrinks into itself far off if it is of a rank that goes (`tier`), or
 * broadens if its plant's kept boxes do; shrink the plant into its foot at
 * the pool's edge, bend it with the wind and away from him, then project.
 * Foot = (x, y, z, flex); flex ≥ 10: a hanging plant, its foot at the top.
 */
const VERTEX = /* glsl */ `
vec3 ugP;
vec3 ugN;
{
  int ugId = int(aUgId + 0.5);
  ivec2 ugT = ivec2((ugId % ${CAP}) * ${TEXELS}, ugId / ${CAP});
  vec4 ugB0 = texelFetch(uUgBoxes, ugT, 0);
  vec4 ugB1 = texelFetch(uUgBoxes, ugT + ivec2(1, 0), 0);
  vec4 ugB2 = texelFetch(uUgBoxes, ugT + ivec2(2, 0), 0);
  vec4 ugB3 = texelFetch(uUgBoxes, ugT + ivec2(3, 0), 0);
  // The box's axes: turned about y (ugB0.w), after a tip about its own z (ugB1.w).
  float ugCy = cos(ugB0.w);
  float ugSy = sin(ugB0.w);
  float ugCt = cos(ugB1.w);
  float ugSt = sin(ugB1.w);
  vec3 ugAx = vec3(ugCy * ugCt, ugSt, -ugSy * ugCt);
  vec3 ugAy = vec3(-ugCy * ugSt, ugCt, ugSy * ugSt);
  vec3 ugAz = vec3(ugSy, 0.0, ugCy);
  vec3 ugToCam = cameraPosition - ugB0.xyz;
  vec3 ugSg = vec3(dot(ugAx, ugToCam) < 0.0 ? -1.0 : 1.0, dot(ugAy, ugToCam) < 0.0 ? -1.0 : 1.0, dot(ugAz, ugToCam) < 0.0 ? -1.0 : 1.0);
  // (an odd number of sides flipped: swap x and y first, so it stays a turn, not a mirror)
  bool ugOdd = ugSg.x * ugSg.y * ugSg.z < 0.0;
  vec3 ugL = (ugOdd ? position.yxz : position) * ugSg;
  vec3 ugLn = (ugOdd ? normal.yxz : normal) * ugSg;
  // Far off: the small boxes of a plant shrink away, the ones it keeps broaden.
  float ugCam = length(ugToCam);
  float ugTier = floor(ugB3.w * 0.25);
  float ugWide = ugB3.w - ugTier * 4.0;
  vec2 ugBand = ugTier > 1.5 ? uUgLod.xy : uUgLod.zw;
  float ugGone = smoothstep(ugBand.x, ugBand.y, ugCam);
  vec3 ugSize = ugB1.xyz * (ugTier > 0.5 ? 1.0 - ugGone : 1.0);
  ugSize.xz *= 1.0 + ugWide * smoothstep(uUgLod.z, uUgLod.w, ugCam);
  ugL *= ugSize;
  vec3 ugW = ugB0.xyz + ugAx * ugL.x + ugAy * ugL.y + ugAz * ugL.z;
  ugN = ugAx * ugLn.x + ugAy * ugLn.y + ugAz * ugLn.z;
  vColor = vec4(ugB3.rgb, 1.0);

  vec3 ugB = ugB2.xyz;
  float ugHang = step(${(HANG - 0.5).toFixed(1)}, ugB2.w);
  float ugFlex = ugB2.w - ${HANG}.0 * ugHang;
  float ugD = distance(ugB.xz, uFocus.xz);
  ugP = ugB + (ugW - ugB) * (uFade.z * (1.0 - smoothstep(uFade.x, uFade.y, ugD)));
  float ugH = abs(ugP.y - ugB.y);
  // The wind (the land's sway at its foot, and a flutter of its own), and him walking through.
  vec2 ugWind = swayAt(ugB) * 0.7 + vec2(-uSwayDir.y, uSwayDir.x) * sin(uSwayTime * 3.3 + dot(ugB.xz, vec2(1.7, 2.3))) * (0.015 + 0.05 * uSwayWind);
  float ugNear = (1.0 - smoothstep(0.35, 1.5, ugD)) * (1.0 - step(mix(2.5, 9.0, ugHang), abs(ugB.y - uFocus.y)));
  ugP.xz += (ugWind + (ugB.xz - uFocus.xz) / max(ugD, 0.05) * ugNear * 0.55) * ugFlex * ugH;
  ugP.y -= ugNear * ugFlex * ugH * ugH * 0.2 * (1.0 - ugHang);
  // (standing plants darker at their feet)
  vUgAo = mix(1.0, mix(0.7, 1.0, smoothstep(0.0, 0.45, ugH)), step(0.01, ugFlex) * (1.0 - ugHang));
}`;

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
      // (the box, its colour and its place, worked out first: the colour is the first thing three sets)
      .replace('#include <color_vertex>', VERTEX)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = ugN;')
      // (world space: no instance matrix, the mesh at the origin)
      .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = normalMatrix * objectNormal;')
      .replace('#include <begin_vertex>', 'vec3 transformed = ugP;')
      .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(ugP, 1.0);\ngl_Position = projectionMatrix * mvPosition;')
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(ugP, 1.0);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vUgAo;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FRAGMENT}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vUgAo;')
      // (matte, like the voxel leaves: no sun highlight, no sheen)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.directSpecular *= 0.0;\nreflectedLight.indirectSpecular *= 0.0;');
  };
  m.customProgramCacheKey = () => 'map-undergrowth-v2';
  m.name = 'undergrowth';
  return m;
}

/** The three sides of a unit box that face +x, +y and +z (a vertex each corner of a side: its own normal). */
function cornerShape(): BufferGeometry {
  const box = new BoxGeometry(1, 1, 1);
  const pos = box.getAttribute('position');
  const nor = box.getAttribute('normal');
  const index = box.getIndex()!;
  const p: number[] = [];
  const n: number[] = [];
  const ix: number[] = [];
  // (BoxGeometry's sides: +x, −x, +y, −y, +z, −z)
  for (const g of [0, 2, 4]) {
    const { start, count } = box.groups[g];
    const map = new Map<number, number>();
    for (let i = start; i < start + count; i++) {
      const v = index.getX(i);
      let to = map.get(v);
      if (to === undefined) {
        map.set(v, (to = p.length / 3));
        p.push(pos.getX(v), pos.getY(v), pos.getZ(v));
        n.push(nor.getX(v), nor.getY(v), nor.getZ(v));
      }
      ix.push(to);
    }
  }
  box.dispose();
  const geo = new BufferGeometry();
  geo.setIndex(ix);
  geo.setAttribute('position', new BufferAttribute(new Float32Array(p), 3));
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(n), 3));
  return geo;
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

/** A filled cell: its row, how many of its boxes are drawn by rank (first rank kept however far, …, all), and its spheres. */
interface Cell {
  slot: number;
  n0: number;
  n1: number;
  n2: number;
  /** Round its boxes (x, y, z, r). */
  cx: number;
  cy: number;
  cz: number;
  r: number;
  /** Round its plants' feet, across (x, z, r): how far from him they fade. */
  fx: number;
  fz: number;
  fr: number;
}

/** Floats a box takes while its cell is being filled: centre, turn, size, tip, foot, flex, colour, LOD. */
const REC = 16;

const _c = new Color();
const _m = new Matrix4();

/** A box's matrix (whole, as it grew: no sway, no fade) from its numbers at `d[o]` (`REC` floats), into `out` at `at`. */
function boxMatrix(d: Float32Array, o: number, out: Float32Array, at: number): void {
  const cf = Math.cos(d[o + 3]);
  const sf = Math.sin(d[o + 3]);
  const ct = Math.cos(d[o + 7]);
  const st = Math.sin(d[o + 7]);
  const sx = d[o + 4];
  const sy = d[o + 5];
  const sz = d[o + 6];
  _m.set(cf * ct * sx, -cf * st * sy, sf * sz, d[o], st * sx, ct * sy, 0, d[o + 1], -sf * ct * sx, sf * st * sy, cf * sz, d[o + 2], 0, 0, 0, 1);
  _m.toArray(out, at);
}

/**
 * The pool's mesh. An InstancedMesh only for the bug report: its matrices
 * and colours are those of the boxes drawn, written when it is picked
 * (`sync`), and the whole box stands in for the three sides then.
 */
class PlantMesh extends InstancedMesh<BufferGeometry, Material> {
  constructor(
    private readonly shape: BufferGeometry,
    private readonly whole: BufferGeometry,
    material: Material,
    capacity: number,
    private readonly sync: () => void,
  ) {
    super(shape, material, capacity);
    // The box / loop pick (feedback/area.ts) draws ids with its own material: the boxes drawn, whole, then.
    let mat = this.material;
    Object.defineProperty(this, 'material', {
      configurable: true,
      enumerable: true,
      get: () => mat,
      set: (m: Material) => {
        mat = m;
        const ids = m.name === 'feedback:id';
        if (ids) this.sync();
        this.geometry = ids ? this.whole : this.shape;
      },
    });
  }

  override raycast(raycaster: Raycaster, intersects: Intersection[]): void {
    if (this.count === 0) return;
    this.sync();
    this.geometry = this.whole;
    try {
      super.raycast(raycaster, intersects);
    } finally {
      this.geometry = this.shape;
    }
  }
}

class Pool implements PlantSink {
  readonly mesh: PlantMesh;
  /** Every box of the pool, whole, a row of `CAP` a cell: for the snow's map from above only (the still layer, not drawn). */
  readonly top: InstancedMesh;
  /** Every box's numbers (`TEXELS` texels a box, a row a cell). */
  private readonly data: Float32Array;
  private readonly tex: DataTexture;
  /** Box numbers drawn, in order (`aUgId`). */
  private readonly ids: Float32Array;
  private readonly idAttr: InstancedBufferAttribute;
  /** The filled cells, and the rows free. */
  private readonly cells = new Map<number, Cell>();
  private readonly free: number[] = [];
  private readonly queue: number[] = [];
  private readonly queued = new Set<number>();
  private readonly linear = new Map<number, [number, number, number]>();
  private readonly spots: Spot[] = [0, 1, 2, 3].map(() => ({ x: 0, z: 0, y: 0, ground: 'floor', cover: 0, wet: false, tight: false }));
  private readonly trunks: number[] = [];
  /** The cell being filled: its boxes (`REC` floats each), their sizes and ranks. */
  private readonly rec = new Float32Array(CAP * REC);
  private readonly weight = new Float32Array(CAP);
  private readonly rank = new Uint8Array(CAP);
  private readonly order: number[] = [];
  /** Where the pool was planned (NaN: never), and how far round (m). */
  planX = NaN;
  planZ = NaN;
  keep = KEEP;
  /** Bumped when a cell is filled or let go. */
  version = 0;
  // The plant being written: its foot, turn, size, flex, tint, how it thins out; the cell's next box, and the plant's first.
  private px = 0;
  private py = 0;
  private pz = 0;
  private yaw = 0;
  private cos = 1;
  private sin = 0;
  private k = 1;
  private flex = 0;
  private tint = 1;
  private thin: Thin = KEEP_ALL;
  private at = 0;
  private first = 0;
  /** Boxes written and cells filled, and the last list (stats). */
  readonly stats = { boxes: 0, cells: 0, ms: 0, drawn: 0, listed: 0 };

  constructor(
    private readonly field: HeightField,
    private readonly canopy: Canopy | null,
    private readonly nearPath: Uint8Array,
  ) {
    const n = SLOTS * CAP;
    this.data = new Float32Array(n * TEXELS * 4);
    this.tex = new DataTexture(this.data, CAP * TEXELS, SLOTS, RGBAFormat, FloatType);
    this.tex.minFilter = this.tex.magFilter = NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
    UG.uUgBoxes.value = this.tex;
    for (let s = SLOTS - 1; s >= 0; s--) this.free.push(s);
    const shape = cornerShape();
    this.ids = new Float32Array(n);
    this.idAttr = new InstancedBufferAttribute(this.ids, 1);
    this.idAttr.setUsage(DynamicDrawUsage);
    shape.setAttribute('aUgId', this.idAttr);
    const whole = new BoxGeometry(1, 1, 1);
    this.mesh = new PlantMesh(shape, whole, undergrowthMaterial(), n, () => this.syncPick());
    this.mesh.name = 'undergrowth:plants';
    this.mesh.count = 0;
    // (for the bug report's picks only: written when picked)
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
    // (the pool moves with him, round the camera: never culled as a whole, the cells are; shadows from the crowns, none cast)
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    // (the same material, instancing and shadows as the mesh: no program of its own; empty rows are boxes of no size, and
    // only the rows up to the last one used are drawn)
    this.top = new InstancedMesh(whole, this.mesh.material, n);
    this.top.name = 'undergrowth:top';
    this.top.count = 0;
    this.top.instanceMatrix.array.fill(0);
    this.top.instanceMatrix.setUsage(DynamicDrawUsage);
    this.top.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.top.layers.set(STILL_LAYER);
    this.top.frustumCulled = false;
    this.top.castShadow = false;
    this.top.receiveShadow = true;
    this.top.raycast = () => {};
  }

  /** Plan round (x, z): let go of cells too far, queue the missing ones (nearest first). */
  plan(x: number, z: number): void {
    this.planX = x;
    this.planZ = z;
    const half = POOL_CELL / 2;
    for (const [key, cell] of this.cells) {
      if (keyDist(key, x, z) <= this.keep) continue;
      this.cells.delete(key);
      this.free.push(cell.slot);
      this.version++;
    }
    const r = Math.ceil(this.keep / POOL_CELL) + 1;
    const c0 = Math.floor(x / POOL_CELL);
    const k0 = Math.floor(z / POOL_CELL);
    for (let ck = k0 - r; ck <= k0 + r; ck++)
      for (let ci = c0 - r; ci <= c0 + r; ci++) {
        if (Math.hypot(ci * POOL_CELL + half - x, ck * POOL_CELL + half - z) > this.keep) continue;
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
      // (full: the rest waits)
      if (!this.free.length) break;
      const key = this.queue.pop()!;
      this.queued.delete(key);
      // (planned again since: too far now)
      if (keyDist(key, this.planX, this.planZ) > this.keep) continue;
      const cell = this.fill(keyI(key), keyK(key), this.free.pop()!);
      this.cells.set(key, cell);
      this.version++;
    }
    this.stats.ms = performance.now() - t0;
  }

  get pending(): number {
    return this.queue.length;
  }

  // ── Writing plants ──────────────────────────────────────────────────────
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, color: number, shade: number, tilt = 0): void {
    if (this.at >= CAP) return;
    const i = this.at++;
    const k = this.k;
    const c = this.cos;
    const s = this.sin;
    const o = i * REC;
    const r = this.rec;
    r[o] = this.px + k * (c * x + s * z);
    r[o + 1] = this.py + k * y;
    r[o + 2] = this.pz + k * (-s * x + c * z);
    // (turned about y by the plant's turn and its own, after a tip about the box's z axis)
    r[o + 3] = yaw + this.yaw;
    r[o + 4] = sx * k;
    r[o + 5] = sy * k;
    r[o + 6] = sz * k;
    r[o + 7] = tilt;
    r[o + 8] = this.px;
    r[o + 9] = this.py;
    r[o + 10] = this.pz;
    r[o + 11] = this.flex;
    let lin = this.linear.get(color);
    if (!lin) {
      _c.setHex(color);
      this.linear.set(color, (lin = [_c.r, _c.g, _c.b]));
    }
    const b = shade * this.tint;
    r[o + 12] = lin[0] * b;
    r[o + 13] = lin[1] * b;
    r[o + 14] = lin[2] * b;
    // (its broad side's area: the smaller go first far off)
    const [a1, a2, a3] = [sx, sy, sz].sort((p, q) => q - p);
    this.weight[i] = a1 * a2 + 1e-4 * a3;
  }

  /** Start a plant (if `need` boxes still fit): its foot, turn, size, flex, tint and how it thins out. */
  private start(need: number, x: number, y: number, z: number, yaw: number, k: number, flex: number, tint: number, thin: Thin): boolean {
    this.endPlant();
    if (this.at + need > CAP) return false;
    this.px = x;
    this.py = y;
    this.pz = z;
    this.yaw = yaw;
    this.cos = Math.cos(yaw);
    this.sin = Math.sin(yaw);
    this.k = k;
    this.flex = flex;
    this.tint = tint;
    this.thin = thin;
    return true;
  }

  /** The plant written since its start: rank its boxes (the smallest go first far off) and mark how its kept ones broaden. */
  private endPlant(): void {
    const a = this.first;
    const b = this.at;
    this.first = b;
    if (b <= a) return;
    const t = this.thin;
    const n = b - a;
    const order = this.order;
    order.length = 0;
    for (let i = a; i < b; i++) order.push(i);
    order.sort((p, q) => this.weight[p] - this.weight[q]);
    const n2 = Math.round(t.f2 * n);
    const n1 = Math.max(n2, Math.round(t.f1 * n));
    for (let j = 0; j < n; j++) {
      const i = order[j];
      const rank = j < n2 ? 2 : j < n1 ? 1 : 0;
      this.rank[i] = rank;
      this.rec[i * REC + 15] = rank * 4 + (rank === 0 && n1 > 0 ? t.wide : 0);
    }
  }

  // ── A cell ──────────────────────────────────────────────────────────────
  /** Grow a cell's plants into row `slot` (seeded by the cell; `CAP` boxes at most), kept boxes first, and upload them. */
  private fill(ci: number, ck: number, slot: number): Cell {
    const f = this.field;
    const x0 = ci * POOL_CELL;
    const z0 = ck * POOL_CELL;
    this.at = 0;
    this.first = 0;
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
          if (!this.start(MAX.vine, ax, top, az, rnd() * Math.PI * 2, 1, HANG + 0.4, 0.9 + rnd() * 0.2, THIN.vine)) continue;
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
        if (this.flat(x + dx, z + dz, sp.y) && this.flat(x - dx, z - dz, sp.y) && this.clear(x, z, len / 2) && this.start(MAX.log, x, sp.y, z, yaw, 1, 0, 0.9 + rnd() * 0.2, THIN.log)) fallenLog(this, rnd, len);
      }
      // 3. Plants by size, so the big ones always fit: elephant ears, ferns, flowers, reeds, grass, leaf litter.
      for (const sp of this.spots) {
        if (sp.cover < 0 || sp.ground !== 'floor') continue;
        const n = count(rnd, (0.05 + 0.2 * sp.cover) * (sp.wet ? 2.5 : 1));
        for (let q = 0; q < n; q++) this.plant(sp, rnd, MAX.ear, 0.4, 0.9 + 0.6 * rnd(), 0.7, THIN.ear, elephantEar);
      }
      for (const sp of this.spots) {
        if (sp.cover < 0 || sp.ground === 'bank') continue;
        const patch = 0.5 + fbm(sp.x / 9, sp.z / 9, 811);
        const n = count(rnd, (sp.ground === 'rock' ? 0.15 : 0.15 + 0.6 * sp.cover) * patch);
        for (let q = 0; q < n; q++) this.plant(sp, rnd, MAX.fern, 0.45, 0.75 + 0.55 * rnd(), 1, THIN.fern, fern);
      }
      for (const sp of this.spots) {
        if (sp.cover < 0 || sp.ground !== 'floor') continue;
        const meadow = fbm(sp.x / 14, sp.z / 14, 813);
        if (rnd() > 0.04 + 0.16 * (1 - sp.cover) + 0.35 * Math.max(0, meadow - 0.55) * 4) continue;
        const colors = FLOWER_SETS[Math.floor(fbm(sp.x / 30, sp.z / 30, 817) * 7) % FLOWER_SETS.length];
        this.plant(sp, rnd, MAX.flowers, 0.3, 0.9 + 0.3 * rnd(), 1.1, THIN.flowers, (p, r) => flowers(p, r, colors));
      }
      for (const sp of this.spots) {
        if (sp.cover < 0 || sp.ground !== 'bank') continue;
        const n = count(rnd, sp.wet ? 1.1 : 0.4);
        for (let q = 0; q < n; q++) this.plant(sp, rnd, MAX.reeds, 0.2, 0.85 + 0.4 * rnd(), 1, THIN.reeds, reeds);
      }
      for (const sp of this.spots) {
        if (sp.cover < 0) continue;
        // (sparse on open grass, thicker in meadow patches)
        const meadow = 0.6 + 0.8 * fbm(sp.x / 14, sp.z / 14, 813);
        const n = count(rnd, sp.ground === 'floor' ? (1.6 - 0.7 * sp.cover) * meadow : sp.ground === 'bank' ? 0.8 : 0.4);
        for (let q = 0; q < n; q++) this.plant(sp, rnd, MAX.grass, 0.1, 0.8 + 0.5 * rnd(), 1.3, THIN.grass, grassTuft);
      }
      for (const sp of this.spots) {
        if (sp.cover < 0.25 || sp.ground !== 'floor') continue;
        const n = count(rnd, 0.9 * sp.cover);
        for (let q = 0; q < n; q++) this.plant(sp, rnd, MAX.litter, 0.3, 1, 0, THIN.litter, litter);
      }
    }
    this.endPlant();
    return this.write(slot);
  }

  /** Write the cell's boxes into its row, those kept farthest first, upload them, and measure the cell. */
  private write(slot: number): Cell {
    const n = this.at;
    const d = this.data;
    const r = this.rec;
    let j = slot * CAP;
    const counts = [0, 0, 0];
    let [x0, x1, y0, y1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    let [fx0, fx1, fz0, fz1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (let rank = 0; rank < 3; rank++)
      for (let i = 0; i < n; i++) {
        if (this.rank[i] !== rank) continue;
        counts[rank]++;
        const o = i * REC;
        const t = j++ * TEXELS * 4;
        d.set(r.subarray(o, o + REC), t);
        // (round the box, broadened as far off: its half diagonal)
        const wide = 1 + (r[o + 15] - rank * 4);
        const h = 0.5 * Math.hypot(r[o + 4] * wide, r[o + 5], r[o + 6] * wide);
        x0 = Math.min(x0, r[o] - h);
        x1 = Math.max(x1, r[o] + h);
        y0 = Math.min(y0, r[o + 1] - h);
        y1 = Math.max(y1, r[o + 1] + h);
        z0 = Math.min(z0, r[o + 2] - h);
        z1 = Math.max(z1, r[o + 2] + h);
        fx0 = Math.min(fx0, r[o + 8]);
        fx1 = Math.max(fx1, r[o + 8]);
        fz0 = Math.min(fz0, r[o + 10]);
        fz1 = Math.max(fz1, r[o + 10]);
      }
    if (n) {
      this.tex.addUpdateRange(slot * CAP * TEXELS * 4, n * TEXELS * 4);
      this.tex.needsUpdate = true;
    }
    // (the stand-in for the snow's map from above: the row's boxes whole, the rest of the row nothing)
    const tm = this.top.instanceMatrix;
    const ta = tm.array as Float32Array;
    for (let i = 0; i < CAP; i++) {
      const at = (slot * CAP + i) * 16;
      if (i < n) boxMatrix(d, (slot * CAP + i) * TEXELS * 4, ta, at);
      else ta.fill(0, at, at + 16);
    }
    tm.addUpdateRange(slot * CAP * 16, CAP * 16);
    tm.needsUpdate = true;
    this.top.count = Math.max(this.top.count, (slot + 1) * CAP);
    this.stats.boxes += n;
    this.stats.cells++;
    const cell: Cell = { slot, n0: counts[0], n1: counts[0] + counts[1], n2: n, cx: 0, cy: 0, cz: 0, r: -1, fx: 0, fz: 0, fr: 0 };
    if (n) {
      cell.cx = (x0 + x1) / 2;
      cell.cy = (y0 + y1) / 2;
      cell.cz = (z0 + z1) / 2;
      cell.r = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2;
      cell.fx = (fx0 + fx1) / 2;
      cell.fz = (fz0 + fz1) / 2;
      cell.fr = Math.hypot(fx1 - fx0, fz1 - fz0) / 2;
    }
    return cell;
  }

  /** A plant somewhere in a land cell (off the trunks; small near a higher neighbour). */
  private plant(sp: Spot, rnd: () => number, need: number, radius: number, k: number, flex: number, thin: Thin, draw: (p: PlantSink, r: () => number) => void): void {
    const room = sp.tight ? 0.3 : 0.75;
    const x = sp.x + (rnd() - 0.5) * 2 * room;
    const z = sp.z + (rnd() - 0.5) * 2 * room;
    const yaw = rnd() * Math.PI * 2;
    const tint = 0.9 + rnd() * 0.2;
    if (sp.tight) k = Math.min(k, 0.7);
    if (!this.clear(x, z, radius * k)) return;
    if (this.start(need, x, sp.y, z, yaw, k, flex, tint, thin)) draw(this, rnd);
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

  // ── What is drawn ───────────────────────────────────────────────────────
  /** The list written last: a code a cell (row × 128 + boxes), in order. */
  private shown: number[] = [];
  private picked: number[] = [];
  private readonly near: { cell: Cell; n: number; d: number }[] = [];
  private readonly planes = new Float32Array(24);
  private readonly frustum = new Frustum();
  private readonly vpm = new Matrix4();

  /**
   * List the boxes to draw: the cells in view and short of the fade round
   * his feet (`fx`, `fz`, `fade`), each with the boxes it keeps at its
   * distance from the camera (`lod`), nearest first; written to `aUgId`
   * only when the list changed. Returns the boxes listed.
   */
  list(camera: PerspectiveCamera, fx: number, fz: number, fade: number, lod: { t2: [number, number]; t1: [number, number] }): number {
    this.vpm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.vpm);
    const planes = this.planes;
    for (let k = 0; k < 6; k++) {
      const pl = this.frustum.planes[k];
      planes[k * 4] = pl.normal.x;
      planes[k * 4 + 1] = pl.normal.y;
      planes[k * 4 + 2] = pl.normal.z;
      planes[k * 4 + 3] = pl.constant;
    }
    const e = camera.matrixWorld.elements;
    const ex = e[12];
    const ey = e[13];
    const ez = e[14];
    const near = this.near;
    near.length = 0;
    for (const cell of this.cells.values()) {
      if (cell.r < 0) continue;
      // (every plant of it past the fade: nothing shows)
      if (Math.hypot(cell.fx - fx, cell.fz - fz) - cell.fr > fade) continue;
      const dc = Math.hypot(cell.cx - ex, cell.cy - ey, cell.cz - ez);
      const d = dc - cell.r;
      // (kept a little past the view's edges: the sway, his parting the plants, and a margin as the camera turns)
      const m = cell.r + 1 + 0.03 * Math.max(0, d);
      let seen = true;
      for (let k = 0; k < 24 && seen; k += 4) seen = planes[k] * cell.cx + planes[k + 1] * cell.cy + planes[k + 2] * cell.cz + planes[k + 3] >= -m;
      if (!seen) continue;
      const n = d < lod.t2[1] ? cell.n2 : d < lod.t1[1] ? cell.n1 : cell.n0;
      if (n) near.push({ cell, n, d: dc });
    }
    near.sort((a, b) => a.d - b.d);
    const picked = this.picked;
    picked.length = 0;
    for (const c of near) picked.push(c.cell.slot * 128 + c.n);
    let same = picked.length === this.shown.length;
    for (let i = 0; same && i < picked.length; i++) same = picked[i] === this.shown[i];
    if (!same) {
      const ids = this.ids;
      let at = 0;
      for (const c of near) {
        const base = c.cell.slot * CAP;
        for (let i = 0; i < c.n; i++) ids[at++] = base + i;
      }
      this.idAttr.clearUpdateRanges();
      this.idAttr.addUpdateRange(0, at);
      this.idAttr.needsUpdate = true;
      this.mesh.count = at;
      this.picked = this.shown;
      this.shown = picked;
      this.stats.drawn = at;
      this.stats.listed = near.length;
    }
    return this.mesh.count;
  }

  /** Forget the list (nothing drawn). */
  hide(): void {
    this.mesh.count = 0;
    this.shown.length = 0;
  }

  /** For the bug report: the boxes drawn as instance matrices and colours (whole, still, as they grew). */
  private syncPick(): void {
    const mesh = this.mesh;
    const d = this.data;
    const m = mesh.instanceMatrix.array as Float32Array;
    const col = mesh.instanceColor!.array as Float32Array;
    for (let i = 0; i < mesh.count; i++) {
      const o = this.ids[i] * TEXELS * 4;
      boxMatrix(d, o, m, i * 16);
      col[i * 3] = d[o + 12];
      col[i * 3 + 1] = d[o + 13];
      col[i * 3 + 2] = d[o + 14];
    }
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.clearUpdateRanges();
    mesh.instanceColor!.needsUpdate = true;
    mesh.boundingSphere = null;
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
  object.add(pool.mesh, pool.top);
  let shown = 0;
  const stats = new URLSearchParams(location.search).has('vegstats');
  let logged = false;
  /** What the list was made for: the camera (its matrix and projection), his feet, the pool, the level. */
  const seen = new Float32Array(36);
  let seenVersion = -1;
  let seenLevel: GraphicsLevel | null = null;
  const changed = (fr: MapFrame, x: number, z: number): boolean => {
    let diff = pool.version !== seenVersion || graphicsNow.level !== seenLevel;
    seenVersion = pool.version;
    seenLevel = graphicsNow.level;
    const m = fr.camera.matrixWorld.elements;
    const p = fr.camera.projectionMatrix.elements;
    for (let k = 0; k < 16; k++) {
      if (seen[k] !== Math.fround(m[k]) || seen[16 + k] !== Math.fround(p[k])) diff = true;
      seen[k] = m[k];
      seen[16 + k] = p[k];
    }
    if (seen[32] !== Math.fround(x) || seen[33] !== Math.fround(z)) diff = true;
    seen[32] = x;
    seen[33] = z;
    return diff;
  };
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
        if (pool.mesh.count) pool.hide();
        seenVersion = -1;
        UG.uFade.value.z = 0;
        return;
      }
      UG.uFade.value.z = shown;
      UG.uFocus.value.set(L.x, feet, L.z);
      // (the graphics level's reach: a new one plans the pool again)
      const fade = graphicsNow.plainBlocks ? FADE_LOW : FADE;
      UG.uFade.value.x = fade.from;
      UG.uFade.value.y = fade.to;
      // (zoomed in, the detail reaches as far as it looks)
      const z = zoomOf(fr.camera);
      const lv = LOD[graphicsNow.level];
      const lod = { t2: [lv.t2[0] * z, lv.t2[1] * z] as [number, number], t1: [lv.t1[0] * z, lv.t1[1] * z] as [number, number] };
      UG.uUgLod.value.set(lod.t2[0], lod.t2[1], lod.t1[0], lod.t1[1]);
      const keep = keepFor(fade);
      if (keep !== pool.keep) {
        pool.keep = keep;
        pool.planX = NaN;
      }
      if (!(Math.hypot(L.x - pool.planX, L.z - pool.planZ) <= REPLAN)) pool.plan(L.x, L.z);
      pool.drain(ctx.shot ? Infinity : FILL_PER_FRAME);
      // (the cells in view, each with the boxes it keeps at its distance: written again when that changes)
      if (changed(fr, L.x, L.z)) pool.list(fr.camera, L.x, L.z, fade.to + 0.25, lod);
      if (stats && !pool.pending && !logged) {
        logged = true;
        const s = pool.stats;
        console.info(`[map] undergrowth: ${s.cells} cells, ${s.boxes} boxes (${(s.boxes / Math.max(1, s.cells)).toFixed(1)} a cell, pool ${SLOTS} × ${CAP}) · drawn ${s.drawn} boxes of ${s.listed} cells · last fill ${s.ms.toFixed(2)} ms`);
      }
    },
  };
}
