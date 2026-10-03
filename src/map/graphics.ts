import { BufferAttribute, DepthFormat, DepthTexture, GreaterEqualCompare, Group, InstancedBufferAttribute, InstancedMesh, LessEqualCompare, LinearFilter, NearestFilter, PCFShadowMap, RedFormat, UnsignedByteType, UnsignedIntType, Vector3, VSMShadowMap, WebGLRenderTarget, type BufferGeometry, type Camera, type Light, type LightShadow, type Material, type Mesh, type Object3D, type PerspectiveCamera, type WebGLRenderer } from 'three';
import { VOXEL_MATERIALS, voxelRimMaterial, type VoxelMaterialKey, type VoxelMaterialSpec } from '../voxel/materials';
import { openSidesIndex, unitVoxelGeometry } from '../voxel/VoxelMesh';
import { sceneHeight } from './resolution';
import { GRAPHICS_LEVELS, type GraphicsLevel, type MapQuality } from './types';

/**
 * Graphics levels (the settings' Graphics choice, `graphics=` in the URL):
 * what the picture draws, from the fastest to the finest. Everything changes
 * at once, while the map runs, except the built detail (`build`), which
 * follows the next time the map opens.
 *
 *           picture                 map blocks   MSAA   shadow map         glow, top blur
 *  low      half (ratio 1)          plain boxes  none   2048, still        off
 *  medium   the screen's, half      chamfered    2 / 4  4096, still        on
 *           while slow (main.ts)
 *  high     the screen's, always    chamfered    2 / 4  4096, 3rd frame    on
 *  max      the screen's, always    chamfered    4      8192, every frame  on
 *
 * (The picture's size is the level's while the Resolution setting is Auto;
 * a picked size overrides it: resolution.ts, main.ts `holdRatio`.)
 *
 * Measured on an M1 Max (the overview, 696 × 925, the scene about 10 M
 * triangles, most of the cost): a frame takes ≈ 11 ms on low, 30 on high,
 * 36 on max. Plain boxes (12 triangles, not 44) alone take 31 ms to 19; a
 * shadow map of 8192² draws as fast as 4096² (the pass is bound by the
 * blocks, not the texels), only sharper, and costs 256 MB.
 *
 * Low's and medium's shadows are still (`stillShadows`, `stillCasters`): a
 * shadow redraw every third frame made that frame about 40 % slower than the
 * others on low (10 M triangles, not 4), a stutter on phones; on medium it
 * was 2.5–5 ms of every third frame (a 9.5 M-triangle pass in the overview).
 * They are drawn again only when the
 * key light turns ({@link STILL_TURN}: with the day's cycle about every
 * second at dusk and dawn), and then a part a frame over 10–12 frames
 * ({@link dealStillParts}, atmosphere.ts): the whole map in one frame
 * (2.8–3.5 M triangles, ≈ 4–6 ms more on an M1 Max, 20–45 ms on a phone)
 * was a hitch each time; a part is ≈ 0.3 M (0.8–0.9 M on medium). What
 * moves casts nothing there (people, animals, boats, parked gliders, the
 * roaming explorer): he gets a soft disc under his feet (foreground.ts),
 * and on low is built with one rounding step (the level draws him so
 * anyway). Medium keeps its 4096² map (two of them now: the next is drawn
 * while the shown one stays, ≈ 128 MB more on the GPU); 3072² or 2048²
 * frame no faster and lose the thin shadows (reeds, poles) up close. On a phone the map also draws at
 * most 30 frames a second (`frameCap`), and the `auto` choice picks the level
 * (`AutoGraphics`). On low, other families' blocks are plain from
 * {@link FAR_PLAIN} m too (`plainFar`).
 *
 * Far blocks as plain boxes on every level (a plain box draws 12 triangles,
 * not 44; 92 for two rounding steps): a mesh of blocks (a temple, the road,
 * houses, boats) goes plain once its largest cut edge spans under
 * {@link PLAIN_PX} pixels where it comes nearest the camera ({@link plainFar},
 * {@link plainFrom}: the camera's field of view and the scene's pixels
 * decide, so a zoomed photo or a sharper resolution keeps the edges
 * further), the land's and the jungle's chunks the same way (terrain/lod.ts
 * `ChunkSwitch`); the explorer keeps his. On medium and up the plain boxes
 * paint the cut rim they stand in for ({@link RIM_PAINTED}, {@link paintRim}):
 * without it, the missing rims show under a pixel. At 1 px the medium
 * overview at 1280 × 720 draws 5.7 M triangles, not 8.8 (the shadow pass
 * 5.2, not 9.5), 12.9 ms a frame, not 16.0–16.2.
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
  medium: { ratio: 'auto', plainBlocks: false, samples: [4, 2], shadowMap: 4096, shadowEvery: 3, stillShadows: true, glow: true, build: 'medium' },
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
 * gliders, ramps, boats, the balloon, houses). On the other levels every
 * voxel mesh keeps its own shape near and is drawn plain far off
 * ({@link plainFar}, {@link plainFrom}), but the land's and the jungle's
 * chunks (a group marked `chunkLod`), which switch to their plain twins
 * themselves (terrain/lod.ts, vegetation.ts), and the explorer, always
 * near. Meshes made after this call (a part built later) keep their own
 * shape: call it again then (main.ts does after the roaming's build).
 */
export function setGraphics(level: GraphicsLevel, scene: Object3D): void {
  Object.assign(graphicsNow, GRAPHICS[level], { level });
  const plain = graphicsNow.plainBlocks;
  far.length = 0;
  const byGeo = new Map<BufferGeometry, Far>();
  // (the materials whose rim variants can be drawn, and a mesh that wears each: rimPrograms)
  const painted = new Map<Material, InstancedMesh>();
  scene.traverse((o) => {
    const mesh = o as InstancedMesh;
    const shape = mesh.userData?.voxelShape as { segments: number; flat: boolean } | undefined;
    if (!mesh.isInstancedMesh || !shape?.segments || !mesh.material || Array.isArray(mesh.material)) return;
    // (its own material again, if it wore its rim variant)
    paintRim(mesh, false);
    // (`voxel:<family>`, or with a variant after it: `voxel:mapLeaf:sway`)
    const key = (mesh.material.name.split(':')[1] ?? '') as VoxelMaterialKey;
    const spec = VOXEL_MATERIALS[key] as VoxelMaterialSpec | undefined;
    if (!spec) return;
    const box = unitVoxelGeometry(spec.bevel, 0);
    if (key.startsWith('map') && plain) {
      reshape(mesh, box);
      return;
    }
    const near = plain && shape.segments > 1 ? unitVoxelGeometry(spec.bevel, 1, shape.flat) : null;
    reshape(mesh, near);
    // (the land's and the jungle's chunks paint their plain twins themselves, with these materials: terrain/lod.ts)
    if (!plain && pixelLimit() > 0 && mesh.parent?.userData.chunkLod && !painted.has(mesh.material)) painted.set(mesh.material, mesh);
    // (on the other levels only while far blocks can go plain: nothing to do each frame else)
    if (!plain && (!(pixelLimit() > 0) || mesh.parent?.userData.chunkLod || isExplorer(mesh))) return;
    // (copies of a model share their geometry, e.g. the boats: it goes plain only when all of them are far)
    let f = byGeo.get(mesh.geometry);
    if (!f) byGeo.set(mesh.geometry, (f = { mesh, near, plain: box, paint: !plain, out: false, meshes: [] }));
    f.meshes.push({ mesh, edge: plain ? -1 : chamferOf(mesh), version: mesh.instanceMatrix.version, moves: 0 });
    if (!plain && !painted.has(mesh.material)) painted.set(mesh.material, mesh);
  });
  for (const f of byGeo.values()) far.push(f);
  rimPrograms(scene, painted);
}

type OwnShape = { index: BufferAttribute; position: BufferAttribute; normal: BufferAttribute };

/** Part of the explorer (character/AngkorExplorer.ts): always near the camera, he keeps his edges on every level but low. */
function isExplorer(o: Object3D): boolean {
  for (let x: Object3D | null = o; x; x = x.parent) if (x.name === 'AngkorExplorer') return true;
  return false;
}

/**
 * A voxel mesh drawn with another unit block (its instances as they are), or
 * its own again (`to` null). The geometry changes: every copy of the mesh
 * that shares it too.
 */
function reshape(mesh: InstancedMesh, to: BufferGeometry | null): void {
  const geo = mesh.geometry;
  // (its own shape, kept the first time it changes)
  let own = geo.userData.voxelOwnShape as OwnShape | undefined;
  if (to && !own) own = geo.userData.voxelOwnShape = { index: geo.index!, position: geo.getAttribute('position') as BufferAttribute, normal: geo.getAttribute('normal') as BufferAttribute };
  if (!own) return;
  // (only the sides the mesh's blocks show, if it leaves some out: VoxelMesh.ts `hideCovered`)
  const index = to ? openSidesIndex(to, mesh.userData.voxelSides ?? 63) : own.index;
  if (geo.index !== index) {
    geo.setIndex(index);
    geo.setAttribute('position', to ? to.getAttribute('position') : own.position);
    geo.setAttribute('normal', to ? to.getAttribute('normal') : own.normal);
  }
}

/**
 * A voxel mesh drawn as plain boxes standing in for its blocks with cut
 * edges far away wears the rim variant of its material (`on`; materials.ts
 * `voxelRimMaterial`: the cut edges' strips painted, by their share of the
 * pixel, so the blocks keep the lines between them), or its own again. Only
 * the painted meshes draw with the variant's program: the blocks that keep
 * their edges draw as before. (A material given to the mesh meanwhile by
 * something else stays.)
 */
export function paintRim(mesh: Mesh, on: boolean): void {
  const own = mesh.userData.voxRimOwn as Material | undefined;
  if (on && RIM_URL) {
    if (own || Array.isArray(mesh.material)) return;
    mesh.userData.voxRimOwn = mesh.material;
    mesh.material = mesh.userData.voxRimWorn = voxelRimMaterial(mesh.material);
  } else if (own) {
    if (mesh.material === mesh.userData.voxRimWorn) mesh.material = own;
    delete mesh.userData.voxRimOwn;
    delete mesh.userData.voxRimWorn;
  }
}

/** `rim=0` in the URL: far plain boxes left unpainted (to compare). */
const RIM_URL = new URLSearchParams(location.search).get('rim') !== '0';

/** The hidden meshes wearing the rim variants ({@link rimPrograms}). */
let rimHolder: Group | null = null;

/**
 * Compile the rim variants with the rest: a hidden mesh wearing each (as the
 * meshes that can go plain wear it: instanced, coloured), in the scene, so
 * the map's compile at load (main.ts, lazy.ts `compileFor`: three compiles
 * hidden objects too) makes their programs side by side with the others',
 * and the first mesh to go plain draws at once: no hitch. Made again with
 * every {@link setGraphics} (none on the plain level).
 */
function rimPrograms(scene: Object3D, painted: Map<Material, InstancedMesh>): void {
  if (rimHolder) {
    rimHolder.removeFromParent();
    for (const c of rimHolder.children) (c as InstancedMesh).dispose();
    rimHolder = null;
  }
  if (!painted.size || !RIM_URL) return;
  const holder = new Group();
  holder.name = 'graphics:rim-programs';
  holder.visible = false;
  const box = unitVoxelGeometry(0.1, 0);
  for (const [material, like] of painted) {
    const m = new InstancedMesh(box, voxelRimMaterial(material), 0);
    if (like.instanceColor) m.instanceColor = new InstancedBufferAttribute(new Float32Array(3), 3);
    holder.add(m);
  }
  scene.add(holder);
  rimHolder = holder;
}

/** From this far (m, to the nearest of its blocks), other families' blocks are plain boxes on the plain level: their edges are under a pixel. */
export const FAR_PLAIN = 80;

// ── Plain boxes far away (every level) ──────────────────────────────────────
/**
 * The voxel shader paints the rim a far plain box stands in for: a mesh
 * drawn plain on medium and up wears its material's rim variant
 * ({@link paintRim}; materials.ts `voxelRimMaterial`, a program of its own,
 * so the blocks that keep their edges draw as before), which paints each
 * cut edge's slanted strip where the block would show it, by its share of
 * the pixel: the rim tint with the strip's own facing, and its light (the
 * normal leaning toward the edge; the block's axes worked out per pixel
 * from how its own position and the view position change across it; in a
 * groove, the strip leaning toward the camera shows wider). Unpainted, a
 * plain box loses the map families' bright cut rim (`edgeTint`, the low sun
 * on the slanted strip) even where it is a fraction of a pixel: Angkor
 * Wat's stones (rims ≈ 0.6 px at 2880 × 1800) lose the lines between them,
 * the temple pops smooth at the switch, and at 1672 × 941 a limit of ¼ px
 * already softens the Bayon's faces. Painted, at 1 px, the temples keep
 * their lines (the 2× and 1× overviews, the switch point, dusk, night, the
 * hang glider: the same by eye, a few levels apart pixel by pixel at the
 * blocks' edges; forced to 6 px up close, the strips land within a pixel of
 * the cut ones). Measured (M1 Max, 1280 × 720, back to back with every
 * block cut, twice, `npm run perf`): the medium overview 16.0–16.2 → 12.9
 * ms a frame (unpainted plain boxes 11.7), the hang glider 11.0–11.1 →
 * 8.6–8.7 (8.4), at dusk 16.1–16.2 → 12.6–12.8; high about the same; max
 * (½ px) 18.4–18.8 → 16.9–17.1, the hang glider 13.7–13.8 → 12.1–12.3;
 * with nothing plain (`plainpx=0`) as before to 0.1 ms. Of the painting's
 * ≈ 1.1 ms in the overview about half is
 * three sorting the painted meshes' materials after all the others (a
 * front-to-back sort of the opaque draws takes it back, and 0.4 ms more,
 * for ≈ 0.8 ms of CPU); the shader itself ≈ 0.5. Two earlier tries: the
 * block's axes on every voxel vertex (the blocks that keep their edges
 * too) cost all the gain; worked out per pixel inside a branch, dark dots
 * along the edges (derivatives taken where a quad's pixels part ways).
 * `rim=0` in the URL leaves the far plain boxes unpainted (to compare).
 */
export const RIM_PAINTED = true;
/**
 * A block's cut edge far off is drawn as a plain box's once it spans fewer
 * than this many pixels: with the rim painted ({@link RIM_PAINTED}) medium
 * and high 1, max ½ (it keeps its edges twice as far); without, never (0:
 * every block cut). Low draws every map block plain, other families from
 * {@link FAR_PLAIN} m. `plainpx=<px>` in the URL sets it for every level
 * but low (to compare; 0: never).
 */
export const PLAIN_PX: Record<GraphicsLevel, number> = RIM_PAINTED ? { low: 1, medium: 1, high: 1, max: 0.5 } : { low: 1, medium: 0, high: 0, max: 0 };
const PLAIN_PX_URL = (() => {
  const v = new URLSearchParams(location.search).get('plainpx');
  return v !== null && v !== '' && Number(v) >= 0 ? Number(v) : null;
})();
/** A mesh goes plain this share further out than {@link plainFrom}, and takes its edges back within it: no flicker while the camera sways on the line. */
export const PLAIN_HOLD = 0.04;

/** One pixel's size (m) a metre from the camera, now: its field of view over the scene's height in pixels (resolution.ts `sceneHeight`). */
export function pixelSize(camera: Camera): number {
  const c = camera as PerspectiveCamera;
  const fov = c.isPerspectiveCamera ? c.getEffectiveFOV() : 60;
  return (2 * Math.tan((fov * Math.PI) / 360)) / sceneHeight();
}

/**
 * From this far (m) a cut edge of `edge` m (the rounding's radius: its
 * slanted strip is edge · √2 across, seen from any side) spans fewer than
 * the level's {@link PLAIN_PX} pixels, one pixel being `pixel` m a metre
 * away ({@link pixelSize}): d = edge · √2 / (px · pixel). Infinity: never
 * (`plainpx=0`). The overview (60° high at 16:10, 55° at 16:9) on a 2×
 * screen (1800–1880 pixels high) at 1 px: a temple stone of 1 m (edge
 * 0.08 m) 175–205 m, a leaf cell of 1 m (0.12) 265–305 m, a 2 m block of
 * land (0.14) 310–360 m, a road slab 0.3 m thick (0.024) 55–60 m; roaming
 * (50°) 1.1–1.25 × as far; on a 1× screen, or a picture drawn at half its
 * pixels, half as far.
 */
export function plainFrom(edge: number, pixel: number): number {
  const px = pixelLimit();
  return px > 0 ? (edge * Math.SQRT2) / (px * pixel) : Infinity;
}

/** The level's {@link PLAIN_PX} now (`plainpx=` in the URL on the levels but low). */
const pixelLimit = (): number => (graphicsNow.plainBlocks ? PLAIN_PX.low : (PLAIN_PX_URL ?? PLAIN_PX[graphicsNow.level]));

/** Blocks with cut edges of `edge` m, the nearest `d` m away: plain boxes now? `was`: they were ({@link PLAIN_HOLD}). */
export function plainAt(d: number, edge: number, pixel: number, was: boolean): boolean {
  return d > plainFrom(edge, pixel) * (was ? 1 : 1 + PLAIN_HOLD);
}

/**
 * The largest cut edge (m) of a voxel mesh's blocks as the shader cuts them
 * (materials.ts: a block's own `radius`, at most 0.45 of its smallest side,
 * else its smallest side × the family's `bevel`), in the mesh's space. 0: no
 * family of blocks.
 */
export function chamferOf(mesh: InstancedMesh): number {
  const mat = mesh.material;
  if (Array.isArray(mat)) return 0;
  const spec = VOXEL_MATERIALS[(mat.name.split(':')[1] ?? '') as VoxelMaterialKey] as VoxelMaterialSpec | undefined;
  if (!spec) return 0;
  const e = mesh.instanceMatrix.array;
  const own = mesh.geometry.getAttribute('voxRadius')?.array;
  let edge = 0;
  for (let i = 0; i < mesh.count; i++) {
    const k = i * 16;
    const side = Math.min(Math.hypot(e[k], e[k + 1], e[k + 2]), Math.hypot(e[k + 4], e[k + 5], e[k + 6]), Math.hypot(e[k + 8], e[k + 9], e[k + 10]));
    edge = Math.max(edge, own && own[i] > 0 ? Math.min(own[i], side * 0.45) : side * spec.bevel);
  }
  return edge;
}

/**
 * A geometry {@link plainFar} switches (`mesh`: one that draws it): its
 * shape near (null: its own) and far, and the meshes that share it (copies
 * of a model): each with the largest cut edge of its blocks (-1: from
 * {@link FAR_PLAIN} m, the plain level's other families), its blocks as last
 * measured (`instanceMatrix.version`) and how often they have moved since.
 */
interface Far {
  mesh: InstancedMesh;
  near: BufferGeometry | null;
  plain: BufferGeometry;
  /** Its plain boxes stand in for chamfered blocks ({@link paintRim}): not the plain level's. */
  paint: boolean;
  out: boolean;
  meshes: { mesh: InstancedMesh; edge: number; version: number; moves: number }[];
}
const far: Far[] = [];
/** A mesh whose blocks have moved more often than this keeps its own shape (its bounds may lag behind its blocks: judged near as it may be). */
const MOVES = 8;
const _eye = new Vector3();
const _mid = new Vector3();
/** Drawn: it and every parent visible, up to the scene. */
const shown = (o: Object3D): boolean => {
  for (let x: Object3D | null = o; x; x = x.parent) if (!x.visible) return false;
  return true;
};

/**
 * Every frame (main.ts), a pass over the voxel meshes {@link setGraphics}
 * found (≈ 0.05 ms): on the plain level, the blocks of other families than
 * the map's (parked gliders, launch ramps, boats, the balloon, houses, the
 * explorer's gear) go plain from {@link FAR_PLAIN} m, and back (about 0.2 M
 * triangles fewer in the overview). On the other levels every mesh (temples,
 * the road, villages, houses, boats) goes plain once its largest cut edge
 * spans under {@link PLAIN_PX} pixels where the mesh comes nearest the camera
 * ({@link plainFrom}), its cut rim painted ({@link paintRim}), and back. A
 * whole mesh at once: one as big as the map (the road) stays near. A mesh
 * drawn off screen by its own choice (`frustumCulled` false) or whose
 * blocks keep moving keeps its edges.
 */
export function plainFar(camera: Camera): void {
  if (!far.length) return;
  _eye.setFromMatrixPosition(camera.matrixWorld);
  const pixel = pixelSize(camera);
  for (const f of far) {
    let out = true;
    for (const g of f.meshes) {
      const m = g.mesh;
      // (a hidden copy has no say: judged again the frame it shows, before it is drawn)
      if (f.meshes.length > 1 && !shown(m)) continue;
      const s = m.boundingSphere;
      if (!s) {
        out = false;
        break;
      }
      const scale = m.matrixWorld.getMaxScaleOnAxis();
      _mid.copy(s.center).applyMatrix4(m.matrixWorld);
      const d = _mid.distanceTo(_eye) - s.radius * scale;
      if (g.edge < 0) out = d > FAR_PLAIN;
      else {
        // (blocks moved, added or taken away: their edges measured again, a few times)
        if (m.instanceMatrix.version !== g.version) {
          g.version = m.instanceMatrix.version;
          if (++g.moves <= MOVES) g.edge = chamferOf(m);
        }
        out = g.moves <= MOVES && m.frustumCulled && plainAt(d, g.edge * scale, pixel, f.out);
      }
      if (!out) break;
    }
    if (out === f.out) continue;
    f.out = out;
    reshape(f.mesh, out ? f.plain : f.near);
    for (const g of f.meshes) paintRim(g.mesh, out && f.paint);
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
    leanShadowMaps(renderer, lights);
    const mask = camera.layers.mask;
    if (graphicsNow.stillShadows) camera.layers.mask = stillView.mask;
    try {
      draw(lights, scene, camera);
    } finally {
      camera.layers.mask = mask;
    }
  };
}

/**
 * A shadow map three would make (WebGLShadowMap, three r186) holds a
 * colour texture of RGBA bytes beside its depth texture, and PCF shadows
 * read only the depth: 64 MB of 4096² never read, per map (the key light's
 * and the next still map's, atmosphere.ts). Made here first, the same but
 * for one byte of colour a texel (the framebuffer needs a colour attachment
 * of its size): 16 MB. Only for maps three has not made yet (a new size is
 * made again: atmosphere.ts sets `map` to null).
 */
function leanShadowMaps(renderer: WebGLRenderer, lights: Light[]): void {
  const type = renderer.shadowMap.type;
  if (type === VSMShadowMap) return;
  for (const light of lights) {
    const shadow = (light as Light & { shadow?: LightShadow }).shadow;
    if (!shadow || shadow.map !== null || !light.castShadow || (light as { isPointLight?: boolean }).isPointLight) continue;
    const { x: w, y: h } = shadow.mapSize;
    const map = new WebGLRenderTarget(w, h, { format: RedFormat, type: UnsignedByteType, minFilter: NearestFilter, magFilter: NearestFilter, generateMipmaps: false });
    const depth = new DepthTexture(w, h, UnsignedIntType);
    depth.name = `${light.name}.shadowMap`;
    depth.format = DepthFormat;
    const reversed = (renderer.state.buffers.depth as { getReversed?: () => boolean }).getReversed?.() ?? false;
    if (type === PCFShadowMap) {
      depth.compareFunction = reversed ? GreaterEqualCompare : LessEqualCompare;
      depth.minFilter = depth.magFilter = LinearFilter;
    } else {
      depth.compareFunction = null;
      depth.minFilter = depth.magFilter = NearestFilter;
    }
    map.depthTexture = depth;
    shadow.map = map;
    // (three sets its projection when it makes the map itself)
    (shadow.camera as PerspectiveCamera).updateProjectionMatrix();
  }
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
 * Frames a second at most (main.ts paces its loop by it): 60, or 30 with the
 * Battery saver setting. A phone draws 60 while it keeps up and an even 30
 * when it does not ({@link PhoneFrameRate}): an even 30 (every other
 * refresh) looks smoother than 40 to 50 that come unevenly, and the device
 * keeps cooler; a 120 Hz screen drew twice the frames for little the eye
 * keeps. `time`: the time a frame has (s), what the resolution and auto's
 * watch measure frames against.
 */
export const frameCap = { fps: 60, time: 1 / 60 };
const setCap = (fps: number): void => {
  frameCap.fps = fps;
  frameCap.time = 1 / fps;
};
/** `fps=30|60` in the URL: that cap, held (a phone's watch off). */
const FPS_HELD = ((v) => (v === 30 || v === 60 ? v : 0))(Number(new URLSearchParams(location.search).get('fps')));
let saver = false;
/** Battery saver on or off (the settings): 30 frames a second, or 60 (a phone: 60 while it keeps up). */
export function setBatterySaver(on: boolean): void {
  saver = on;
  setCap(FPS_HELD || (on ? 30 : PHONE ? phoneRate.fps : 60));
}

const RATE_KEY = 'angkor-map-phone-fps';
/**
 * A phone's frame rate: 60 while the phone keeps up, else an even 30, and 60
 * tried again later. Phones differ a lot (a new iPhone draws a walk in about
 * 15 ms, a mid Android in 50), and one phone differs with the view (the
 * overview draws twice a walk's triangles) and with its heat. It watches
 * full-pace frames in windows of 2 s: two windows in a row under 52 frames
 * a second at 60 (one frame in about eight missing its refresh), and it
 * drops to 30. At 30 a frame's own cost cannot be seen (every frame waits
 * for its turn), so after {@link wait} s of frames it tries 60 again; a try
 * that drops at once doubles the wait (20 s, then 40 … up to 5 min), one
 * that held a while starts it over. Roaming starting or ending tries at once
 * ({@link retry}: a walk is lighter than the overview). The last rate is kept
 * for this phone: the next visit starts with it. It waits while the level can
 * still lower its own resolution (medium: main.ts), as auto's watch does.
 */
export class PhoneFrameRate {
  fps: 30 | 60;
  /** Seconds at 30 before 60 is tried again. */
  wait = 20;
  private time = 0;
  private frames = 0;
  private slow = 0;
  /** Seconds at the rate in use (frames at full pace). */
  private age = 0;

  constructor() {
    let kept: string | null = null;
    try {
      kept = localStorage.getItem(RATE_KEY);
    } catch {
      /* no storage */
    }
    this.fps = kept === '30' ? 30 : 60;
  }

  /** The watch runs: a phone, no battery saver, no held cap. */
  get on(): boolean {
    return PHONE && !saver && !FPS_HELD;
  }

  /** Try 60 at the next frame (roaming starts or ends). */
  retry(): void {
    if (this.on && this.fps === 30) this.age = this.wait;
  }

  /**
   * A frame at full pace took `dt` s. `settled`: the level's own resolution
   * is as low as it goes. Returns true when the rate changed (`frameCap`
   * then holds the new one).
   */
  watch(dt: number, settled: boolean): boolean {
    if (!this.on || dt > 0.25) return false;
    this.age += dt;
    if (this.fps === 30) {
      if (this.age < this.wait) return false;
      this.use(60);
      return true;
    }
    this.time += dt;
    this.frames++;
    if (this.time < 2) return false;
    const avg = this.time / this.frames;
    this.time = this.frames = 0;
    this.slow = settled && avg > 1 / 52 ? this.slow + 1 : 0;
    if (this.slow < 2) return false;
    // (a try that dropped within its first windows: wait longer; one that held a while: soon again)
    this.wait = this.age < 8 ? Math.min(300, this.wait * 2) : 20;
    this.use(30);
    return true;
  }

  private use(fps: 30 | 60): void {
    this.fps = fps;
    this.time = this.frames = this.slow = this.age = 0;
    setCap(fps);
    try {
      localStorage.setItem(RATE_KEY, String(fps));
    } catch {
      /* this visit only */
    }
  }
}
/** The phone's rate (main.ts feeds it frames). */
export const phoneRate = new PhoneFrameRate();
setCap(FPS_HELD || (PHONE ? phoneRate.fps : 60));

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
/** Auto one level down from the one in use, kept for this device: the level, or null on the lowest. */
export function lowerAutoLevel(): GraphicsLevel | null {
  const at = GRAPHICS_LEVELS.indexOf(graphicsNow.level);
  if (at <= 0) return null;
  const next = GRAPHICS_LEVELS[at - 1];
  try {
    localStorage.setItem(AUTO_KEY, next);
  } catch {
    /* this visit only */
  }
  return next;
}

/**
 * Auto's watch over the frames. Every 2 s of drawn frames it takes their mean
 * time. Three means in a row slower than 2 × `frameCap.time` (under 30
 * frames a second, or 15 on a phone or the battery saver: choppy), and it steps down one level
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
    // (a hitch — a tab switch, a build — counts as a quarter second: one is lost among a window's other frames; left
    // out, a device that draws every frame that slowly, a few a second, was never stepped down)
    this.time += Math.min(dt, 0.25);
    this.frames++;
    if (this.time < 2) return null;
    const avg = this.time / this.frames;
    this.time = this.frames = 0;
    this.slow = settled && avg > 2 * frameCap.time ? this.slow + 1 : 0;
    if (this.slow < 3) return null;
    const next = lowerAutoLevel();
    if (next) this.reset();
    return next;
  }
}
