import { Vector3, type BufferAttribute, type BufferGeometry, type InstancedMesh, type Mesh, type Object3D, type WebGLRenderer } from 'three';
import { VOXEL_MATERIALS, type VoxelMaterialKey, type VoxelMaterialSpec } from '../voxel/materials';
import { openSidesIndex, unitVoxelGeometry } from '../voxel/VoxelMesh';
import { GRAPHICS_LEVELS, type GraphicsLevel, type MapQuality } from './types';

/**
 * Graphics levels (the settings' Graphics choice, `graphics=` in the URL):
 * what the picture draws, from the fastest to the finest. Everything changes
 * at once, while the map runs, except the built detail (`build`), which
 * follows the next time the map opens.
 *
 *           picture                 map blocks   MSAA   shadow map         glow, top blur
 *  low      half (ratio 1)          plain boxes  none   2048, still        off
 *  medium   the screen's, half      chamfered    2 / 4  4096, 3rd frame    on
 *           while slow (main.ts)
 *  high     the screen's, always    chamfered    2 / 4  4096, 3rd frame    on
 *  max      the screen's, always    chamfered    4      8192, every frame  on
 *
 * Measured on an M1 Max (the overview, 696 × 925, the scene about 10 M
 * triangles, most of the cost): a frame takes ≈ 11 ms on low, 30 on high,
 * 36 on max. Plain boxes (12 triangles, not 44) alone take 31 ms to 19; a
 * shadow map of 8192² draws as fast as 4096² (the pass is bound by the
 * blocks, not the texels), only sharper, and costs 256 MB.
 *
 * Low's shadows are still (`stillShadows`, `stillCasters`): a shadow redraw
 * every third frame made that frame about 40 % slower than the others (10 M
 * triangles, not 4), a stutter on phones. They are drawn again only when the
 * key light turns ({@link STILL_TURN}: with the day's cycle about every
 * second at dusk and dawn), and then a part a frame over 10–12 frames
 * ({@link dealStillParts}, atmosphere.ts): the whole map in one frame
 * (2.8–3.5 M triangles, ≈ 4–6 ms more on an M1 Max, 20–45 ms on a phone)
 * was a hitch each time; a part is ≈ 0.3 M. What moves casts nothing there: the roaming explorer gets a soft
 * disc under his feet (foreground.ts), and is built with one rounding step
 * (the level draws him so anyway). On a phone the map also draws at
 * most 30 frames a second (`MAX_FPS`), and the `auto` choice picks the level
 * (`AutoGraphics`). On low, other families' blocks are plain from
 * {@link FAR_PLAIN} m too (`plainFar`).
 *
 * `npm run perf` (scripts/perf.mjs; docs/map-work/BRIEF.md, "Phones") on the
 * same M1 Max, low at a phone's 844 × 390: the overview ≈ 7 ms a frame (3.6 M
 * triangles, ≈ 590 draws), a walk 4–4.5 ms (1.2–2 M), the hang glider 5.3 ms;
 * a phone's GPU is 5–8 times slower (an iPhone), its CPU about the same.
 */
export interface GraphicsSpec {
  /** Pixel ratio: the screen's (at most 2), the screen's but 1 while frames come slow (main.ts), or 1. */
  ratio: 'screen' | 'auto' | 1;
  /** The map's blocks (the `map…` families) as plain boxes: no chamfered edges. */
  plainBlocks: boolean;
  /** MSAA samples of the scene (post.ts) at ratio 1, and over ratio 1.5 (dense screens need fewer). */
  samples: [number, number];
  /** Size of the key light's shadow map (atmosphere.ts; no bigger than the GPU's textures). */
  shadowMap: number;
  /** The shadow map is drawn every this many frames (1: every frame, smooth shadows of what moves). */
  shadowEvery: number;
  /**
   * Still shadows: only what never moves casts ({@link markStill}), and the
   * shadow map is drawn again only when the key light has turned by
   * {@link STILL_TURN} (a time-of-day switch, the day's cycle), not every
   * `shadowEvery` frames: while the light stands, no frame draws shadows.
   */
  stillShadows: boolean;
  /** Bloom and the tilt-shift blur along the top edge (post.ts). */
  glow: boolean;
  /** Built detail (tree density, waterfall spray, animals, block meshes): the next time the map opens. */
  build: MapQuality;
}

export const GRAPHICS: Record<GraphicsLevel, GraphicsSpec> = {
  low: { ratio: 1, plainBlocks: true, samples: [0, 0], shadowMap: 2048, shadowEvery: 3, stillShadows: true, glow: false, build: 'low' },
  medium: { ratio: 'auto', plainBlocks: false, samples: [4, 2], shadowMap: 4096, shadowEvery: 3, stillShadows: false, glow: true, build: 'medium' },
  high: { ratio: 'screen', plainBlocks: false, samples: [4, 2], shadowMap: 4096, shadowEvery: 3, stillShadows: false, glow: true, build: 'medium' },
  max: { ratio: 'screen', plainBlocks: false, samples: [4, 4], shadowMap: 8192, shadowEvery: 1, stillShadows: false, glow: true, build: 'high' },
};

/** The level in use (post.ts and atmosphere.ts read it every frame). */
export const graphicsNow: GraphicsSpec & { level: GraphicsLevel } = { level: 'medium', ...GRAPHICS.medium };

/** MSAA samples for a pixel ratio. */
export const samplesAt = (g: GraphicsSpec, ratio: number): number => g.samples[ratio > 1.5 ? 1 : 0];

/**
 * Switch to a level: the values the parts read, and the map's blocks swapped
 * between plain boxes and their chamfered shape (the same instances, only
 * the shared unit block changes: no rebuild). Blocks of other families (the
 * explorer, the people, the boats) keep their edges near the camera: on the
 * plain level those rounded in two steps (the explorer and his ledge: 92
 * triangles a block) get one (44, the game's own blocks: the same look at
 * his size on the map, about 0.4 ms less on an M1 Max), and from
 * {@link FAR_PLAIN} m they are plain boxes too ({@link plainFar}: parked
 * gliders, ramps, boats, the balloon, houses).
 */
export function setGraphics(level: GraphicsLevel, scene: Object3D): void {
  Object.assign(graphicsNow, GRAPHICS[level], { level });
  const plain = graphicsNow.plainBlocks;
  far.length = 0;
  scene.traverse((o) => {
    const mesh = o as InstancedMesh;
    const shape = mesh.userData?.voxelShape as { segments: number; flat: boolean } | undefined;
    if (!mesh.isInstancedMesh || !shape?.segments || !mesh.material || Array.isArray(mesh.material)) return;
    // (`voxel:<family>`, or with a variant after it: `voxel:mapLeaf:sway`)
    const key = (mesh.material.name.split(':')[1] ?? '') as VoxelMaterialKey;
    const spec = VOXEL_MATERIALS[key] as VoxelMaterialSpec | undefined;
    if (!spec) return;
    if (key.startsWith('map')) {
      reshape(mesh, plain ? unitVoxelGeometry(spec.bevel, 0) : null);
      return;
    }
    const near = plain && shape.segments > 1 ? unitVoxelGeometry(spec.bevel, 1, shape.flat) : null;
    reshape(mesh, near);
    if (plain) far.push({ mesh, near, plain: unitVoxelGeometry(spec.bevel, 0), out: false });
  });
}

type OwnShape = { index: BufferAttribute; position: BufferAttribute; normal: BufferAttribute };

/** A voxel mesh drawn with another unit block (its instances as they are), or its own again (`to` null). */
function reshape(mesh: InstancedMesh, to: BufferGeometry | null): void {
  const geo = mesh.geometry;
  // (its own shape, kept the first time it changes)
  let own = mesh.userData.voxelOwnShape as OwnShape | undefined;
  if (to && !own) own = mesh.userData.voxelOwnShape = { index: geo.index!, position: geo.getAttribute('position') as BufferAttribute, normal: geo.getAttribute('normal') as BufferAttribute };
  if (!own) return;
  // (only the sides the mesh's blocks show, if it leaves some out: VoxelMesh.ts `hideCovered`)
  const index = to ? openSidesIndex(to, mesh.userData.voxelSides ?? 63) : own.index;
  if (geo.index === index) return;
  geo.setIndex(index);
  geo.setAttribute('position', to ? to.getAttribute('position') : own.position);
  geo.setAttribute('normal', to ? to.getAttribute('normal') : own.normal);
}

/** From this far (m, to the nearest of its blocks), other families' blocks are plain boxes on the plain level: their edges are under a pixel. */
export const FAR_PLAIN = 80;
/** Other families' meshes on the plain level: their shape near (null: their own) and far. */
const far: { mesh: InstancedMesh; near: BufferGeometry | null; plain: BufferGeometry; out: boolean }[] = [];
const _eye = new Vector3();
const _mid = new Vector3();

/**
 * Every frame (main.ts): on the plain level, the blocks of other families
 * than the map's (parked gliders, launch ramps, boats, the balloon, houses,
 * the explorer's gear) go plain from {@link FAR_PLAIN} m, and back. About
 * 0.2 M triangles fewer in the overview. Nothing on the other levels.
 */
export function plainFar(camera: Object3D): void {
  if (!far.length) return;
  _eye.setFromMatrixPosition(camera.matrixWorld);
  for (const f of far) {
    const m = f.mesh;
    const s = m.boundingSphere;
    if (!s) continue;
    _mid.copy(s.center).applyMatrix4(m.matrixWorld);
    const out = _mid.distanceTo(_eye) - s.radius * m.matrixWorld.getMaxScaleOnAxis() > FAR_PLAIN;
    if (out === f.out) continue;
    f.out = out;
    reshape(m, out ? f.plain : f.near);
  }
}

// ── Still shadows ───────────────────────────────────────────────────────────
/** The layer of what never moves: the only casters of still shadows ({@link stillCasters}). */
export const STILL_LAYER = 1;
/** Still shadows are drawn again once the key light has turned this far (radians, ≈ 0.3°: under a block at the tip of a mesa's shadow). */
export const STILL_TURN = 0.3 * (Math.PI / 180);

/** Mark everything under `root` as still (it casts still shadows), or not (`still` false: something on it moves). */
export function markStill(root: Object3D, still = true): void {
  root.traverse((o) => (still ? o.layers.enable(STILL_LAYER) : o.layers.disable(STILL_LAYER)));
}

/**
 * Only what is marked still casts still shadows. three draws an object into
 * a shadow map when it is on a layer of the camera the picture is drawn with
 * (WebGLShadowMap `renderObject` tests the view camera, not the light's), so
 * while still shadows stand the view camera sees only {@link STILL_LAYER}
 * for the shadow pass ({@link stillView}: one part of it while a redraw is
 * spread over frames). (Before, everything cast into the still map: a
 * person, an animal or a boat left its shadow where it stood when the map
 * was last drawn, and a redraw drew them all.)
 */
export function stillCasters(renderer: WebGLRenderer): void {
  const shadows = renderer.shadowMap;
  const draw = shadows.render.bind(shadows);
  shadows.render = (lights, scene, camera) => {
    const mask = camera.layers.mask;
    if (graphicsNow.stillShadows) camera.layers.mask = stillView.mask;
    try {
      draw(lights, scene, camera);
    } finally {
      camera.layers.mask = mask;
    }
  };
}

/** The layers the view camera sees while the still shadow map is drawn: the still layer, or one part of it (atmosphere.ts). */
export const stillView = { mask: 1 << STILL_LAYER };
/** The first of the layers the still casters are dealt into, a part each ({@link dealStillParts}: layers 2‥13). */
export const STILL_PART_LAYER = 2;
/** At most this many parts (a still redraw takes at most this many frames). */
const MAX_PARTS = 12;
const PART_BITS = ((1 << MAX_PARTS) - 1) << STILL_PART_LAYER;
/**
 * About this much in a part: triangles as built (the pass draws about half
 * of them, leaving out the block sides that face the light:
 * voxel/backFacets.ts), a draw counted as {@link DRAW_WEIGHT} more. The
 * overview's still map is ≈ 5.5 M as built (2.8 M drawn, ≈ 450 draws): 10
 * parts of ≈ 0.28 M; a walk's (the roaming box) 6–6.5 M (3–3.5 M): 11–12.
 */
const PART_WEIGHT = 550_000;
const DRAW_WEIGHT = 2_000;
const dealt: Object3D[] = [];
const weights: number[] = [];
const order: number[] = [];
const load: number[] = [];

/**
 * Deal what casts still shadows now (on {@link STILL_LAYER}, shown, casting)
 * into parts of about the same size, each on a layer of its own from
 * {@link STILL_PART_LAYER} (the biggest first, each to the lightest part so
 * far), so a still shadow map can be drawn a part a frame: the view camera
 * sees one part's layer ({@link stillView}) while the pass runs. Every
 * object loses the part it had (the explorer leaving his ledge is no longer
 * still). `parts`: how many (0: as many as their size needs, at most 12).
 * Returns the number of parts. A walk over the scene (≈ 2,700 objects),
 * ≈ 0.2 ms on an M1 Max, once a redraw.
 */
export function dealStillParts(scene: Object3D, parts = 0): number {
  dealt.length = weights.length = order.length = 0;
  let total = 0;
  const visit = (o: Object3D, shown: boolean): void => {
    o.layers.mask &= ~PART_BITS;
    const on = shown && o.visible;
    const mesh = o as Mesh;
    if (on && mesh.isMesh && mesh.castShadow && o.layers.isEnabled(STILL_LAYER)) {
      const g = mesh.geometry;
      const count = (mesh as InstancedMesh).isInstancedMesh ? (mesh as InstancedMesh).count : 1;
      const w = ((g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)) / 3) * count + DRAW_WEIGHT;
      order.push(dealt.length);
      dealt.push(o);
      weights.push(w);
      total += w;
    }
    const kids = o.children;
    for (let i = 0; i < kids.length; i++) visit(kids[i], on);
  };
  visit(scene, true);
  const n = Math.max(1, Math.min(MAX_PARTS, parts || Math.ceil(total / PART_WEIGHT)));
  order.sort((a, b) => weights[b] - weights[a]);
  load.length = 0;
  for (let k = 0; k < n; k++) load.push(0);
  for (const i of order) {
    let k = 0;
    for (let j = 1; j < n; j++) if (load[j] < load[k]) k = j;
    load[k] += weights[i];
    dealt[i].layers.mask |= 1 << (STILL_PART_LAYER + k);
  }
  dealt.length = 0;
  return n;
}

// ── Phones and auto ─────────────────────────────────────────────────────────
/** A phone: a touch screen without a mouse, under 600 CSS px across (tablets and computers are not). `phone=1` in the URL acts as one. */
export const PHONE =
  new URLSearchParams(location.search).get('phone') === '1' ||
  (typeof matchMedia === 'function' && matchMedia('(pointer: coarse) and (hover: none)').matches && Math.min(screen.width, screen.height) < 600);
/**
 * Frames a second at most: 30 on a phone, else as many as the screen shows.
 * An even 30 (every other refresh) looks smoother than 40 to 60 that come
 * unevenly, and the phone keeps cooler.
 */
export const MAX_FPS = PHONE ? 30 : Infinity;
/** The time a frame has (s): at 60 a second, or at {@link MAX_FPS} under it. */
export const FRAME_TIME = 1 / Math.min(60, MAX_FPS);

const AUTO_KEY = 'angkor-map-graphics-auto';
/** Auto's level: the one it stepped down to on this device before, else a guess (low on a phone, medium on the rest). */
export function autoLevel(): GraphicsLevel {
  try {
    const kept = localStorage.getItem(AUTO_KEY) as GraphicsLevel | null;
    if (kept && GRAPHICS_LEVELS.includes(kept)) return kept;
  } catch {
    /* no storage */
  }
  return PHONE ? 'low' : 'medium';
}
/** Auto starts again from its guess (auto picked again in the settings). */
export function resetAutoLevel(): void {
  try {
    localStorage.removeItem(AUTO_KEY);
  } catch {
    /* no storage */
  }
}

/**
 * Auto's watch over the frames. Every 2 s of drawn frames it takes their mean
 * time. Three means in a row slower than 2 × {@link FRAME_TIME} (under 30
 * frames a second, or 15 on a phone: choppy), and it steps down one level
 * and keeps that level for this device. It waits while the level can still
 * lower its own resolution (medium: main.ts, under 40 a second), and for a
 * new level to settle. (An M1 Max runs medium at about 39 a second: it keeps
 * medium's look.) It never
 * steps up by itself: a device that proved slow (hot, on battery) stays lower
 * until auto is picked again.
 */
export class AutoGraphics {
  private time = 0;
  private frames = 0;
  private slow = 0;

  /** Start over (a new level). */
  reset(): void {
    this.time = this.frames = this.slow = 0;
  }

  /**
   * A drawn frame took `dt` s. `settled`: the level's own resolution is as
   * low as it goes. Returns the level to step down to, or null.
   */
  watch(dt: number, settled: boolean): GraphicsLevel | null {
    // (a hitch: a tab switch, a build)
    if (dt > 0.25) return null;
    this.time += dt;
    this.frames++;
    if (this.time < 2) return null;
    const avg = this.time / this.frames;
    this.time = this.frames = 0;
    this.slow = settled && avg > 2 * FRAME_TIME ? this.slow + 1 : 0;
    const at = GRAPHICS_LEVELS.indexOf(graphicsNow.level);
    if (this.slow < 3 || at <= 0) return null;
    this.reset();
    const next = GRAPHICS_LEVELS[at - 1];
    try {
      localStorage.setItem(AUTO_KEY, next);
    } catch {
      /* this visit only */
    }
    return next;
  }
}
