import {
  Color,
  DataTexture,
  DepthTexture,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Material,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RedFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type MeshStandardMaterial,
  type Object3D,
  type Points,
  type Texture,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { getVoxelMaterial, VOXEL_MATERIALS, type VoxelMaterialKey } from '../../voxel/materials';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { graphicsNow, STILL_LAYER } from '../graphics';
import { SURFACE, type HeightField } from '../heightfield';
import { EAST_VILLAGE } from '../layout';
import type { MapContext, MapFrame, MapPart } from '../types';
import { VILLAGE_SPOTS } from '../village/_spots';
import { hazeUniforms } from './haze';
import { lamps as lampList } from './lampSlots';
import { mistNoiseTexture } from './noise';
import { SKY } from './palette';
import { PX_SCALE, view } from '../resolution';

/**
 * Snow (the part `snow`): the Weather setting's "snow", a dream — it never
 * snows at Angkor (sky/weather.ts sets `MapWeather.snow`, falling now, and
 * `snowCover`, how white the land lies).
 *
 * Snowfall: soft round flakes drifting and fluttering down round the camera,
 * one instanced draw (a quad a flake) in three nested boxes that travel with
 * the camera and wrap round it, as the rain's (sky/rain.ts), so the flakes
 * stay put in the world as it moves:
 *  - near: a 24 m box round the explorer; the few that pass right by the lens
 *    are big, soft and faint, out of focus (over the picker fewer, fainter:
 *    a snow globe, not specks on the lens);
 *  - middle: 150 m (bigger over the picker: a few pixels each, falling
 *    between the camera and the map);
 *  - far: 800 m, small faint ones, many: a veil, fading into the haze.
 * The flakes are soft clumps a little bigger than true flakes, so they read.
 * They fall slowly (0.7–1.35 m/s), each fluttering round its own small loop,
 * and drift with the wind (`wind`, `windDir`); fewer in a light snowfall (the
 * instance count follows `snow`), fewer again on the low graphics level. Lit
 * all round, a little brighter than the snow on the land (the sky light, its
 * bounce off the snow, the key light: the moon by night), they catch the
 * glow of the lamps near them and of the explorer's lantern, and fade into
 * the haze. None above the cloud base (≈ 500 m), none under a roof, a bridge
 * or a tree (the cover's map from above, below). Nothing is drawn while it
 * does not snow.
 *
 * The white cover (`installSnowCover`, once at build): the map's lit
 * materials — the land, rocks, trees, temples, roads, roofs, the paddies, the
 * palms and the undergrowth (every part built before this one, and the
 * world's block families wherever they are used later: the ledge) — get a
 * small shader patch after their own. A face that looks up whitens with
 * `snowCover`: in drifts at first (the map's tiling noise at two sizes;
 * its mipmaps even them out far away), flat tops first and thickest, a slope
 * only once it lies thick, never a steep side — but a side just under its
 * top edge carries a lip of snow, so stepped roofs, terraces and cliff rims
 * read white. The green of what stays bare fades a little; thin two-sided
 * leaves (palm fronds) hold only patches. Never on water or anything wet and
 * shiny (low roughness; the blocks are all matte), never under a roof, a
 * bridge or a tree: a depth map of the still layer (graphics.ts) seen from
 * straight above, drawn once the first time it snows (`TopView`, about as
 * much work as one still shadow map; ≈ 14 MB, let go two minutes after the
 * snow is gone). Less on the roads and trails (trodden: the height field's
 * path and trail cells). The explorer, people, animals and the sculpted
 * Buddhas and stupas stay as they are (the families the explorer's things
 * share with the world, wood and metal, get a copy with snow for the world's
 * blocks). One set of shared uniforms drives it all: no shader is compiled
 * again when the weather changes; with no snow it is one uniform test a pixel.
 *
 * Snowmen: while the land lies thick with snow, the children have built a
 * snowman in the floating village (by a stilt house's stair) and one in the
 * sugar-palm village, each in a red-and-white krama (≈ 200 blocks each, a few
 * draws, only while there is snow); they rise as it thickens and slump as it
 * melts. They are never solid to walk into (`noWalk`).
 *
 * Built only when wanted (main.ts, lazy.ts; sky/weather.ts `weatherAtLoad`,
 * `wants`): as the page opens when the URL holds snow or the snow setting is
 * saved, else in the background the moment the snow setting is picked (the
 * flakes, the snowmen, the trodden-ground map). At the snow's place in the
 * build the white cover goes into the materials all the same, and a hidden
 * stand-in with the flakes' material and the (hidden) snowmen into the scene
 * (`prepareSnow`): they compile with the map at load, and none when it first
 * snows.
 *
 * No allocation per frame (but lamps gathered once, the first night it
 * snows). URL (checks): `weather=snow|snowy`, `snow=`, `snowCover=`
 * (sky/weather.ts) · `snowtop=0` no depth map from above (snow under roofs
 * too) · `snowmen=0` none.
 */

// ── Snowfall ────────────────────────────────────────────────────────────────

/**
 * Flake layers: box size across and tall (m), flake radius (m: big soft
 * clumps, bigger than true flakes, so they read), opacity, share of the flakes.
 */
const LAYERS = [
  { box: 24, tall: 16, size: 0.02, alpha: 1, share: 0.3 },
  { box: 150, tall: 90, size: 0.045, alpha: 0.9, share: 0.36 },
  // (far away: small, faint, many: a veil)
  { box: 800, tall: 360, size: 0.28, alpha: 0.6, share: 0.34 },
];
/** Flakes in a full snowfall (all layers), by the built detail; the low graphics level draws this share of them. */
const FLAKES = { low: 10000, medium: 24000, high: 28000 };
const LOW_SHARE = 0.6;
/**
 * Over the picker (the camera high over the land, nothing near it): the near
 * layer shows this much (flakes drifting by the lens: a snow globe, not specks
 * on it), and the middle one's flakes are this much bigger (they fall between
 * the camera and the map: a few pixels each, a veil over it).
 */
const OVER = { near: 0.6, mid: 1.8 };
/** Sideways speed in a full wind (m/s): snow drifts on it. */
const WIND_SPEED = 5;
/** Lamps whose glow the flakes catch at once (the nearest), and how far from the camera they may be (m). */
const LAMPS = 6;
const LAMP_REACH = 60;
/** Warm lamplight on a flake (linear), at full glow. */
const LAMP_COLOR = new Color(1, 0.6, 0.28).multiplyScalar(1.3);

// ── The white cover ─────────────────────────────────────────────────────────

/**
 * Families only the map's world uses (land, rocks, leaves, bark, stone, the
 * kit's): whitened where they are, on every part that draws them.
 */
const WORLD_FAMILIES = new Set<string>(['mapRock', 'mapGrass', 'mapLeaf', 'mapBark', 'mapStone', 'stone', 'darkstone', 'moss', 'foliage', 'bark', 'ground', 'sandstone', 'soil', 'leaves', 'trunk', 'petal']);
/** Families the explorer and his things share with the world (planks, tin roofs): the world's blocks of them get a copy with snow. */
const SHARED_FAMILIES = new Set<string>(['wood', 'metal']);
/** Materials never whitened (by name): the sculpted Buddhas and stupas, the water. */
const NEVER = new Set(['statue', 'water surface', 'waterfalls']);
/** The snow's colour (linear albedo): a soft white, a little blue. */
const SNOW_WHITE = new Color(0.8, 0.83, 0.88);
/** The height map from above: texels across the map's long side (the low graphics level: half), how high it looks down from and how deep (m). */
const TOP = { size: 2048, lowSize: 1024, y: 420, depth: 480 };

/** Shared by every material with the snow cover (one update a frame reaches them all). */
const COVER = {
  /** How white the land lies (0‥1, `snowCover`). */
  uSnowCover: { value: 0 },
  uSnowColor: { value: SNOW_WHITE.clone() },
  /** The map from above (depth), where it lies on the map (x0, z1, 1 / width, −1 / depth: uv from world x, z), and its top y, depth range, on (0 / 1), texel (m). */
  uSnowTop: { value: null as Texture | null },
  uSnowTopBox: { value: new Vector4() },
  uSnowTopY: { value: new Vector4() },
  /** Trodden ground (roads, trails: 0‥1) on the height field's grid, and its uv from world x, z (x0, z0, 1 / width, 1 / depth). */
  uSnowTrod: { value: null as Texture | null },
  uSnowTrodBox: { value: new Vector4() },
  /** The map's tiling noise (sky/noise.ts): the drifts. */
  uSnowNoise: { value: mistNoiseTexture() as Texture },
};

const COVER_PARS = /* glsl */ `
uniform float uSnowCover;
uniform vec3 uSnowColor;
uniform sampler2D uSnowTop;
uniform vec4 uSnowTopBox;
uniform vec4 uSnowTopY;
uniform sampler2D uSnowTrod;
uniform vec4 uSnowTrodBox;
uniform sampler2D uSnowNoise;`;

/**
 * After the emissive map (the colour, the normal and the roughness are known):
 * the snow on what looks up. World up in view space is the view matrix's second
 * column; the world point and normal come back from view space (the view matrix
 * is a turn and a move).
 */
const COVER_MAIN = /* glsl */ `
if (uSnowCover > 0.001) {
  vec3 snowW = cameraPosition - vViewPosition * mat3(viewMatrix);
  vec3 snowNw = nonPerturbedNormal * mat3(viewMatrix);
  // Drifts: big soft patches and small tufts (the tiling noise at two sizes, crossed; far away its
  // mipmaps even them out, where they would only flicker).
  float snowN = dot(vec3(texture2D(uSnowNoise, snowW.xz * 0.0103).gb, texture2D(uSnowNoise, snowW.zx * 0.0171 + 0.37).b), vec3(0.45, 0.25, 0.3));
  snowN = clamp((snowN - 0.5) * 1.6 + 0.5, 0.0, 1.0);
  // Winter: the green of what stays bare fades a little.
  float snowL = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float snowGreen = clamp((diffuseColor.g - max(diffuseColor.r, diffuseColor.b)) / max(diffuseColor.g, 1e-3) * 2.5, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(snowL), snowGreen * 0.4 * uSnowCover);
  if (snowNw.y > -0.25) {
    // Trodden ground (the roads, the trails) keeps less (off the land's grid: none).
    vec2 snowUv = (snowW.xz - uSnowTrodBox.xy) * uSnowTrodBox.zw;
    float snowTrod = snowUv == clamp(snowUv, 0.0, 1.0) ? textureLod(uSnowTrod, snowUv, 0.0).r : 0.0;
    float snowLie = uSnowCover * 1.3 - (1.0 - snowN) * 0.8 - snowTrod;
    // The first solid seen from straight above, just inside this face (off that map, or before it is drawn: open sky).
    float snowBelow = 0.0;
    float snowLip = 0.0;
    snowUv = (snowW.xz - snowNw.xz * uSnowTopY.w * 0.7 - uSnowTopBox.xy) * uSnowTopBox.zw;
    if (uSnowTopY.z > 0.5 && snowUv == clamp(snowUv, 0.0, 1.0)) {
      snowBelow = uSnowTopY.x - textureLod(uSnowTop, snowUv, 0.0).r * uSnowTopY.y - snowW.y;
      // A side just under its top edge carries a lip of snow (a stepped roof reads white, a wall or cliff has a white rim).
      snowLip = (1.0 - smoothstep(0.14, 0.3 + 0.12 * snowN, snowBelow)) * step(-0.3, snowBelow) * smoothstep(0.05, 0.25, snowLie) * (1.0 - smoothstep(0.4, 0.7, snowNw.y));
    }
    // Flat tops first and thickest; a slope only once it lies thick; a steep side none (but its lip).
    float snowK = snowNw.y > 0.3 ? smoothstep(0.0, 0.12, snowLie - (1.0 - smoothstep(0.35, 0.95, snowNw.y)) * 0.75) : 0.0;
    // Nothing under a roof, a bridge or a tree.
    snowK = max(snowK * (1.0 - smoothstep(0.8, 1.4, snowBelow)), snowLip);
    #ifndef VOX_LIT
      // Water, and anything wet and shiny, takes none (the blocks are all matte).
      snowK *= smoothstep(0.3, 0.6, roughnessFactor);
    #endif
    #ifdef DOUBLE_SIDED
      // (thin leaves — palm fronds, blades — hold only a little, in patches)
      snowK *= smoothstep(0.35, 0.75, snowN);
    #endif
    diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, snowK);
  }
}`;

/** The key a material's program had before the snow (a material with three's own key: its compile function's text, taken now). */
function ownKey(m: Material): () => string {
  if (m.customProgramCacheKey !== Material.prototype.customProgramCacheKey) {
    const key = m.customProgramCacheKey;
    return () => key.call(m);
  }
  const text = m.onBeforeCompile.toString();
  return () => text;
}

/** Materials with the cover (for the build line). */
let covered = 0;

/**
 * Put the snow cover into a lit material (a MeshStandardMaterial), after its
 * own changes: once; a copy of a covered material (its compile calls its
 * base's) gets it only once too. Other parts may call it for their own
 * still things (a material with `userData.noSnow` is left alone).
 */
export function coverMaterial(m: Material): void {
  if (m.userData.snowCover || m.userData.noSnow) return;
  m.userData.snowCover = true;
  covered++;
  const compile = m.onBeforeCompile;
  const key = ownKey(m);
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => {
    compile.call(m, shader, renderer);
    if (shader.fragmentShader.includes('uSnowCover') || !shader.fragmentShader.includes('#include <emissivemap_fragment>')) return;
    Object.assign(shader.uniforms, COVER);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${COVER_PARS}`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${COVER_MAIN}`);
  };
  m.customProgramCacheKey = () => {
    const k = key();
    return k.includes('|snow') ? k : `${k}|snow`;
  };
  m.needsUpdate = true;
}

/** Copies with snow of the families the explorer shares with the world (one per family). */
const copies = new Map<Material, Material>();
function coveredCopy(m: Material): Material {
  let c = copies.get(m);
  if (!c) {
    c = m.clone();
    c.defines = m.defines && { ...m.defines };
    c.onBeforeCompile = m.onBeforeCompile;
    c.customProgramCacheKey = m.customProgramCacheKey;
    coverMaterial(c);
    copies.set(m, c);
  }
  return c;
}

/** A block family's shared material, if `m` is one (null: another material, or a copy of one: sway, bob). */
function familyOf(m: Material): string | null {
  if (!m.name.startsWith('voxel:')) return null;
  const key = m.name.split(':')[1];
  return key in VOXEL_MATERIALS && getVoxelMaterial(key as VoxelMaterialKey) === m ? key : null;
}

/** Give a still mesh of the world its snow (its material, a copy, or none). */
function coverMesh(o: Object3D): void {
  const mesh = o as Mesh;
  if (!mesh.isMesh || Array.isArray(mesh.material) || !mesh.material) return;
  const m = mesh.material as MeshStandardMaterial;
  if (!m.isMeshStandardMaterial || m.transparent || m.opacity < 1 || NEVER.has(m.name) || m.envMap || m.metalness > 0.3 || m.userData.noSnow) return;
  const family = familyOf(m);
  if (family === null) coverMaterial(m);
  else if (WORLD_FAMILIES.has(family)) coverMaterial(m);
  else if (SHARED_FAMILIES.has(family)) mesh.material = coveredCopy(m);
}

/** World families first used by parts built after this one (the ledge's): covered now, so they compile with it. */
const LATER_FAMILIES: VoxelMaterialKey[] = ['sandstone', 'leaves'];

/** The cover is in the materials (`installSnowCover` ran). */
let installed = false;

/**
 * The cover for the map: every part built so far (all the still ones but the
 * ledge), and the world's families wherever they are used later. main.ts
 * calls it at the snow's place in the build (after the clouds and the rain,
 * before the animals and people), whether the snow part is built then or
 * only once it is wanted: the materials compile with it at load, and none
 * compiles again when it first snows. Once.
 */
export function installSnowCover(scene: Object3D): void {
  if (installed) return;
  installed = true;
  for (const key of LATER_FAMILIES) coverMaterial(getVoxelMaterial(key));
  scene.traverse(coverMesh);
}

/** Once it first snows: anything still (graphics.ts) built after this part, or added since, gets its snow too (usually nothing new). */
function coverLateStill(scene: Object3D): void {
  scene.traverse((o) => {
    if (o.layers.isEnabled(STILL_LAYER)) coverMesh(o);
  });
}

/**
 * Trodden ground on the height field's grid, soft between: the roads and the
 * trails' treads (1: patches of snow only), the dirt of the villages' squares
 * and the paddies' dikes (0.45: a little less).
 */
function trodTexture(field: HeightField): DataTexture {
  const { nx, nz } = field;
  const data = new Uint8Array(nx * nz);
  for (let c = 0; c < nx * nz; c++) data[c] = field.surface[c] === SURFACE.path || field.trail[c] === 2 ? 255 : field.surface[c] === SURFACE.dirt ? 115 : 0;
  const tex = new DataTexture(data, nx, nz, RedFormat, UnsignedByteType);
  tex.magFilter = tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  COVER.uSnowTrodBox.value.set(field.x0, field.z0, 1 / (nx * field.cell), 1 / (nz * field.cell));
  return tex;
}

/**
 * The map seen from straight above (orthographic, the still layer only: the
 * land, trees, temples, roads, villages), its depth kept: how high the first
 * solid is over every point. Drawn once, the first time it snows (about as
 * much work as one still shadow map); glows, halos, smoke and water are left
 * out of it.
 */
class TopView {
  target: WebGLRenderTarget | null = null;
  private readonly hidden: Object3D[] = [];
  private readonly solid = new MeshBasicMaterial({ colorWrite: false, fog: false });

  constructor(private readonly ctx: MapContext) {}

  draw(): void {
    const t0 = performance.now();
    const { renderer, scene, field } = this.ctx;
    // (the height field's bounds: the land itself, a little over)
    const x0 = field.x0 - 10;
    const z0 = field.z0 - 10;
    const w = field.nx * field.cell + 20;
    const d = field.nz * field.cell + 20;
    const long = graphicsNow.level === 'low' ? TOP.lowSize : TOP.size;
    const tw = w >= d ? long : Math.round((long * w) / d);
    const th = w >= d ? Math.round((long * d) / w) : long;
    const target = new WebGLRenderTarget(tw, th, { format: RedFormat, type: UnsignedByteType, depthBuffer: true, depthTexture: new DepthTexture(tw, th), generateMipmaps: false });
    target.depthTexture!.minFilter = target.depthTexture!.magFilter = NearestFilter;
    const cam = new OrthographicCamera(-w / 2, w / 2, d / 2, -d / 2, 0, TOP.depth);
    cam.position.set(x0 + w / 2, TOP.y, z0 + d / 2);
    // (north up in the picture: its v runs from the south edge to the north)
    cam.up.set(0, 0, -1);
    cam.lookAt(x0 + w / 2, 0, z0 + d / 2);
    cam.updateMatrixWorld();
    cam.layers.set(STILL_LAYER);
    // Only what is solid (lit and opaque): not the glows, halos, smoke or lamplight on the ground.
    scene.traverseVisible((o) => {
      if (!o.layers.isEnabled(STILL_LAYER)) return;
      const mesh = o as Mesh;
      const m = mesh.material as Material | Material[] | undefined;
      if (!m) return;
      const solid = mesh.isMesh && !Array.isArray(m) && !m.transparent && (m as MeshStandardMaterial).isMeshStandardMaterial === true && m.colorWrite !== false;
      if (!solid) {
        o.visible = false;
        this.hidden.push(o);
      }
    });
    const was = { target: renderer.getRenderTarget(), shadows: renderer.shadowMap.needsUpdate, override: scene.overrideMaterial };
    try {
      renderer.shadowMap.needsUpdate = false;
      scene.overrideMaterial = this.solid;
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, cam);
    } finally {
      // (the scene as it was, whatever happened)
      renderer.setRenderTarget(was.target);
      scene.overrideMaterial = was.override;
      renderer.shadowMap.needsUpdate = was.shadows;
      for (const o of this.hidden) o.visible = true;
      this.hidden.length = 0;
    }
    this.target = target;
    console.info(`[map] snow: the map from above (${tw}×${th}, ${(w / tw).toFixed(2)} m a texel) drawn in ${(performance.now() - t0).toFixed(1)} ms`);
    COVER.uSnowTop.value = target.depthTexture;
    // uv = ((x − x0) / w, (z1 − z) / d); y = top − depth · range
    COVER.uSnowTopBox.value.set(x0, z0 + d, 1 / w, -1 / d);
    COVER.uSnowTopY.value.set(TOP.y, TOP.depth, 1, w / tw);
  }

  /** Let it go (the snow melted away and the setting is not snow): it is drawn again if it snows again. */
  free(): void {
    if (!this.target) return;
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.forget();
  }

  /** No map from above (the GPU lost the picture: its texture went with it, not disposed): drawn again while it snows. */
  forget(): void {
    COVER.uSnowTopY.value.z = 0;
    COVER.uSnowTop.value = null;
    this.target = null;
  }
}

// ── Snowmen ─────────────────────────────────────────────────────────────────

/** Where the snowmen stand: in front of a stilt house near the village's middle (by its stair), and in the sugar-palm village. */
function snowmanSpots(field: HeightField): { x: number; y: number; z: number; facing: number }[] {
  const out: { x: number; y: number; z: number; facing: number }[] = [];
  // The floating village: the home nearest its middle ground, 2.6 m out in front of its stair and a little aside, facing out.
  const want = { x: -309, z: 57 };
  let best: (typeof VILLAGE_SPOTS.homes)[number] | null = null;
  let bestD = Infinity;
  for (const h of VILLAGE_SPOTS.homes) {
    const d = Math.hypot(h.stairFoot[0] - want.x, h.stairFoot[2] - want.z);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  if (best) {
    const fx = Math.sin(best.facing);
    const fz = Math.cos(best.facing);
    const x = best.stairFoot[0] + fx * 2.6 + fz * 1.8;
    const z = best.stairFoot[2] + fz * 2.6 - fx * 1.8;
    if (field.waterAt(x, z) === null) out.push({ x, y: field.heightAt(x, z), z, facing: best.facing });
  }
  // The sugar-palm village: open, dry, flat ground a few metres off its street, looking at the street.
  const street = field.trails.find((t) => t.name === 'east village road')?.samples ?? [];
  for (let k = 0; k < 40; k++) {
    const a = k * 2.39996;
    const r = 6 + k * 0.5;
    const x = EAST_VILLAGE.x - 12 + Math.sin(a) * r;
    const z = EAST_VILLAGE.z + 7 + Math.cos(a) * r;
    if (field.waterAt(x, z) !== null || !field.isFree(x, z)) continue;
    const y = field.heightAt(x, z);
    if (Math.abs(field.heightAt(x + 1, z) - y) > 0.1 || Math.abs(field.heightAt(x, z + 1) - y) > 0.1) continue;
    let facing = Math.atan2(-Math.sin(a), -Math.cos(a));
    let near = Infinity;
    for (const s of street) {
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d < near) {
        near = d;
        facing = Math.atan2(s.x - x, s.z - z);
      }
    }
    out.push({ x, y, z, facing });
    break;
  }
  return out;
}

/**
 * A snowman of blocks (0.08 m): three balls of snow, coal eyes, a smile and
 * buttons, a carrot nose, twig arms and a red-and-white krama round its neck,
 * its end hanging down the front. Local: on y = 0, facing +z.
 */
function snowmanBlocks(b: VoxelBuilder, seed: number): void {
  const src = traceSource();
  const C = 0.08;
  const N = { x: 13, y: 21 };
  const x0 = -(N.x * C) / 2;
  const g = b.grid({ cell: C, origin: [x0, 0, x0], mat: 'mapStone', jitter: 0.03, ao: 0.4, seed });
  const balls = [
    { y: 0.4, r: 0.44 },
    { y: 0.98, r: 0.32 },
    { y: 1.42, r: 0.22 },
  ];
  const at = (i: number) => x0 + (i + 0.5) * C;
  for (let i = 0; i < N.x; i++)
    for (let j = 0; j < N.y; j++)
      for (let k = 0; k < N.x; k++) {
        const y = (j + 0.5) * C;
        if (balls.some((ball) => Math.hypot(at(i), (y - ball.y) * 1.05, at(k)) <= ball.r)) g.put(i, j, k, { color: [0xf2f5fa, 0xeaeef6, 0xf7f8fb][Math.floor(hash3(i, j, k, seed) * 3)], src });
      }
  /** The front of the snow at (x, y) (the face of its frontmost block, m). */
  const front = (x: number, y: number) => {
    const i = Math.floor((x - x0) / C);
    const j = Math.floor(y / C);
    for (let k = N.x - 1; k >= 0; k--) if (g.has(i, j, k)) return at(k) + C / 2;
    return 0;
  };
  const coal = (x: number, y: number, s = 0.05) => b.box(x, y, front(x, y) + s * 0.3, s, s, s, 0x1e1c1c, 'mapStone', { src });
  // Coal eyes, a smile and two buttons; the carrot nose.
  for (const x of [-0.075, 0.075]) coal(x, 1.47, 0.055);
  for (const x of [-0.07, -0.025, 0.025, 0.07]) coal(x, Math.abs(x) > 0.05 ? 1.37 : 1.35, 0.035);
  for (const y of [0.9, 1.05]) coal(0, y);
  b.box(0, 1.42, front(0, 1.42) + 0.07, 0.05, 0.05, 0.15, 0xe8742a, 'petal', { src });
  // The krama: a band of red-and-white checks round the neck, its end down the front.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    b.box(Math.sin(a) * 0.19, 1.24, Math.cos(a) * 0.19, 0.1, 0.08, 0.1, i % 2 ? 0xd8342c : 0xf1ece2, 'petal', { ry: a, src });
  }
  for (let i = 0; i < 3; i++) {
    const y = 1.16 - i * 0.08;
    b.box(0.1, y, front(0.1, y) + 0.02, 0.09, 0.08, 0.03, i % 2 ? 0xf1ece2 : 0xd8342c, 'petal', { src });
  }
  // Twig arms, reaching up and out.
  for (const s of [-1, 1]) {
    b.box(s * 0.44, 1.08, 0, 0.36, 0.035, 0.035, 0x5a4030, 'mapBark', { rz: s * 0.45, src });
    b.box(s * 0.6, 1.2, 0.02, 0.1, 0.03, 0.03, 0x5a4030, 'mapBark', { rz: s * 1.1, src });
  }
  g.commit();
}

/** The snowmen (one group each, on their spot), or none. */
function buildSnowmen(ctx: MapContext): Group[] {
  const out: Group[] = [];
  snowmanSpots(ctx.field).forEach((s, i) => {
    const b = new VoxelBuilder();
    snowmanBlocks(b, 71 + i * 13);
    const g = buildVoxelMesh(b, { quality: 'medium', name: 'snow:snowman', castShadow: true, receiveShadow: true });
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = s.facing;
    g.visible = false;
    g.userData.blocks = b.boxes.length;
    // (never solid to walk into: the walk maps are made once, as roaming is set up, and a snowman comes and goes, or
    // is built only when the snow setting is picked: roam/walkmap.ts `noWalk`)
    g.traverse((o) => void (o.userData.noWalk = true));
    out.push(g);
  });
  return out;
}

/** The flakes' material and its uniforms (made once: a hidden stand-in warms its shader at load, `prepareSnow`; the part draws with it). */
let flakes: { material: ShaderMaterial; u: ReturnType<typeof flakeUniforms> } | null = null;
function flakeUniforms() {
  return {
    uBox: { value: LAYERS.map((l) => new Vector3(l.box, l.tall, l.box)) },
    /** Per layer: flake radius (m), opacity, the share shown now (the near one over the picker), —. */
    uShape: { value: LAYERS.map((l) => new Vector4(l.size, l.alpha, 1, 0)) },
    /** How far the wind has carried the flakes (m, x and z), and the time they have fallen (s, y). */
    uDrift: { value: new Vector3() },
    uTime: { value: 0 },
    /** Metres a pixel covers 1 m from the camera (a pixel of the screen: `pxscale` pixels in a picture drawn bigger). */
    uPixel: { value: 0.001 },
    uColor: { value: new Color() },
    /** Lamplight on the flakes near a lamp (linear), and the lamps (x, y, z, strength). */
    uGlow: { value: new Color() },
    uLamps: { value: Array.from({ length: LAMPS }, () => new Vector4()) },
    uOpacity: { value: 0 },
  };
}
function flakeMaterial(): NonNullable<typeof flakes> {
  if (flakes) return flakes;
  const u = flakeUniforms();
  const material = new ShaderMaterial({
    name: 'snow',
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
    defines: { HAZE_MIST: '', LAMPS },
    // (the map from above, shared with the cover: no flake falls under a roof)
    uniforms: { ...hazeUniforms(), ...u, uSnowTop: COVER.uSnowTop, uSnowTopBox: COVER.uSnowTopBox, uSnowTopY: COVER.uSnowTopY },
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      uniform sampler2D uSnowTop;
      uniform vec4 uSnowTopBox;
      uniform vec4 uSnowTopY;
      uniform vec3 uBox[${LAYERS.length}];
      uniform vec4 uShape[${LAYERS.length}];
      uniform vec3 uDrift;
      uniform float uTime;
      uniform float uPixel;
      uniform vec4 uLamps[LAMPS];
      attribute vec3 aFlake;
      attribute vec2 aInfo;
      varying vec2 vUv;
      varying float vAlpha;
      varying float vSoft;
      varying float vGlint;
      void main() {
        int L = int(aInfo.x + 0.5);
        vec3 B = uBox[L];
        vec4 shape = uShape[L];
        float r = aInfo.y;
        float r2 = fract(r * 7.31);
        float r3 = fract(r * 13.17 + 0.37);
        // Big flakes fall slowest; each rides the wind a little more or less and flutters round its own small loop.
        float fall = mix(0.7, 1.35, r2);
        float carry = mix(0.8, 1.15, r3);
        float w = mix(0.5, 1.4, r3);
        vec3 flutter = vec3(sin(uTime * w + r * 41.0), 0.0, cos(uTime * w * 0.83 + r * 23.0)) * mix(0.12, 0.5, r);
        // Where it is: its place in the box, carried down and along, wrapped round the camera.
        vec3 P = aFlake * B + vec3(uDrift.x * carry, -uDrift.y * fall, uDrift.z * carry) + flutter;
        vec3 lo = cameraPosition - B * 0.5;
        vec3 c = lo + mod(P - lo, B);
        float dist = max(length(c - cameraPosition), 1e-3);
        float size = shape.x * mix(0.6, 1.3, r2 * r2);
        // Right by the lens a flake is out of focus: bigger, softer, fainter; and only one in four comes so
        // close (they would fill the view).
        float blur = L == 0 ? 1.0 - smoothstep(0.7, 3.0, dist) : 0.0;
        size *= 1.0 + 3.0 * blur;
        float few = L == 0 ? mix(step(fract(r * 91.7), 0.25), 1.0, smoothstep(1.6, 2.8, dist)) : 1.0;
        // Never smaller than about a pixel and a half (fainter instead).
        float drawn = max(size, dist * uPixel * 0.8);
        float keep = size / drawn;
        // Soft at the box's sides and ends; a layer shows only past the one inside it.
        vec3 rel = (c - cameraPosition) / (B * 0.5);
        float edge = (1.0 - smoothstep(0.6, 1.0, max(abs(rel.x), abs(rel.z)))) * (1.0 - smoothstep(0.55, 1.0, abs(rel.y)));
        vec3 Bi = uBox[max(L - 1, 0)];
        float inner = L == 0 ? smoothstep(0.25, 0.5, dist) : smoothstep(Bi.x * 0.2, Bi.x * 0.42, dist);
        // (none above the cloud base)
        float base = 1.0 - smoothstep(420.0, 540.0, c.y);
        // (none under a roof, a bridge or a tree: under the first solid seen from straight above, as the cover)
        vec2 topUv = (c.xz - uSnowTopBox.xy) * uSnowTopBox.zw;
        if (uSnowTopY.z > 0.5 && topUv == clamp(topUv, 0.0, 1.0)) base *= smoothstep(-0.9, -0.3, c.y - uSnowTopY.x + textureLod(uSnowTop, topUv, 0.0).r * uSnowTopY.y);
        vAlpha = shape.y * shape.z * edge * inner * base * keep * few * mix(1.0, 0.28, blur);
        vSoft = blur;
        // The lamps near it light it a little.
        float g = 0.0;
        for (int i = 0; i < LAMPS; i++) {
          vec3 d = c - uLamps[i].xyz;
          g += uLamps[i].w / (1.0 + dot(d, d) * 0.15);
        }
        vGlint = L < 2 ? g : 0.0;
        // A quad facing the camera (its right and up in the world: the view matrix's rows).
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 world = c + (right * position.x + up * position.y) * 2.0 * drawn;
        vUv = position.xy * 2.0;
        vec4 mvPosition = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        // (a flake that does not show: off the screen)
        if (vAlpha < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform vec3 uColor;
      uniform vec3 uGlow;
      uniform float uOpacity;
      varying vec2 vUv;
      varying float vAlpha;
      varying float vSoft;
      varying float vGlint;
      void main() {
        float d2 = dot(vUv, vUv);
        if (d2 >= 1.0) discard;
        // A soft round flake; out of focus, a flat disc with a soft rim.
        float soft = 1.0 - smoothstep(0.15, 1.0, d2);
        float disc = 1.0 - smoothstep(0.55, 1.0, d2);
        float a = vAlpha * uOpacity * mix(soft, disc, vSoft);
        if (a < 0.002) discard;
        gl_FragColor = vec4(uColor + uGlow * min(vGlint, 2.0), a);
        #include <fog_fragment>
      }`,
  });
  return (flakes = { material, u });
}

/** A hidden stand-in with the flakes' material, and the snowmen (hidden too), in the scene until the part is built. */
let warm: { flakes: Mesh; snowmen: Group[] } | null = null;

/**
 * The snow's place in the build (main.ts), whether the part is built then or
 * only once it is wanted: the flakes' material with a hidden stand-in, and
 * the snowmen (small, hidden until the land lies thick), in the scene, so the
 * map's shaders compiled at load take theirs in too (a program's first use
 * costs up to ≈ 0.1 s on an M1 Max: under the loading screen, not a hitch the
 * moment snow is picked); then the white cover into the materials built so
 * far (`installSnowCover`). The part takes them over when it is built.
 */
export function prepareSnow(ctx: MapContext): void {
  if (!warm) {
    // (the flakes' attributes, no normal or uv: a program's key follows them)
    const quad = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.instanceCount = 0;
    const flakes = new Mesh(geo, flakeMaterial().material);
    flakes.name = 'snow:warm';
    flakes.visible = false;
    flakes.raycast = () => {};
    const snowmen = new URLSearchParams(location.search).get('snowmen') === '0' ? [] : buildSnowmen(ctx);
    ctx.scene.add(flakes, ...snowmen);
    warm = { flakes, snowmen };
  }
  installSnowCover(ctx.scene);
}

// ── The part ────────────────────────────────────────────────────────────────

export function buildSnow(ctx: MapContext): MapPart {
  const t0 = performance.now();
  const object = new Group();
  object.name = 'snow';

  // The flakes: one quad each, the layers mixed through the list (a light snowfall thins every layer alike).
  const quad = new PlaneGeometry(1, 1);
  const geo = new InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  const n = FLAKES[ctx.quality];
  const flake = new Float32Array(n * 3);
  const info = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    flake[i * 3] = hash3(i, 1, 9, 911);
    flake[i * 3 + 1] = hash3(i, 2, 9, 912);
    flake[i * 3 + 2] = hash3(i, 3, 9, 913);
    let k = hash3(i, 5, 9, 915);
    let layer = 0;
    while (layer < LAYERS.length - 1 && k >= LAYERS[layer].share) k -= LAYERS[layer++].share;
    info[i * 2] = layer;
    info[i * 2 + 1] = hash3(i, 4, 9, 914);
  }
  geo.setAttribute('aFlake', new InstancedBufferAttribute(flake, 3));
  geo.setAttribute('aInfo', new InstancedBufferAttribute(info, 2));
  geo.instanceCount = n;

  const { material, u } = flakeMaterial();
  // (the stand-in that warmed its shader at load goes; its snowmen are the part's)
  const prepared = warm;
  if (warm) {
    warm.flakes.removeFromParent();
    warm.flakes.geometry.dispose();
    warm = null;
  }
  const mesh = new Mesh(geo, material);
  mesh.name = 'snow';
  mesh.frustumCulled = false;
  mesh.renderOrder = 21;
  mesh.raycast = () => {};
  object.add(mesh);

  // The white cover, on every material of the world built before the snow's place in the build (and the world's
  // families): put in there by main.ts (built later, the snow finds it in; alone, it puts it in now).
  installSnowCover(ctx.scene);
  COVER.uSnowTrod.value = trodTexture(ctx.field);
  const params = new URLSearchParams(location.search);
  const top = params.get('snowtop') === '0' ? null : new TopView(ctx);

  const snowmen = prepared?.snowmen ?? (params.get('snowmen') === '0' ? [] : buildSnowmen(ctx));
  for (const s of snowmen) object.add(s);

  // Lamps the flakes catch: the lamps of the road and the villages (their halos), and the lamp lights (the explorer's lantern, the
  // boat's, the temples': lampSlots.ts, read as they are, whether a slot of the map's few lights has them or not).
  let lamps: Vector3[] | null = null;
  const findLamps = () => {
    lamps = [];
    const p = new Vector3();
    ctx.scene.traverse((o) => {
      const pts = o as Points;
      if (!pts.isPoints || !pts.name.endsWith(':halos')) return;
      const pos = pts.geometry.getAttribute('position');
      const kind = pts.geometry.getAttribute('aKind');
      pts.updateMatrixWorld();
      for (let i = 0; i < pos.count; i++) if (!kind || kind.getX(i) < 0.5) lamps!.push(p.fromBufferAttribute(pos, i).applyMatrix4(pts.matrixWorld).clone());
    });
  };
  /** The lights that move (up to 2 slots, every frame) and the nearest lamps (the rest, every few tenths of a second). */
  const MOVING = 2;
  const near: { d: number; i: number }[] = Array.from({ length: LAMPS - MOVING }, () => ({ d: Infinity, i: -1 }));
  const _l = new Vector3();
  let lampClock = 0;
  /** The lights on near the camera (the explorer's lantern or torch, the boat's lamp) into the first slots. */
  const placeLights = (f: MapFrame) => {
    const slots = u.uLamps.value;
    const cam = f.camera.position;
    let k = 0;
    for (const l of lampList()) {
      if (k >= MOVING || l.kind !== 'point' || !l.lit) continue;
      _l.copy(l.locate());
      if (_l.distanceTo(cam) > LAMP_REACH) continue;
      slots[k++].set(_l.x, _l.y, _l.z, Math.min(1, l.intensity / (l.intensity + 2)) * 1.3);
    }
    for (; k < MOVING; k++) slots[k].set(0, -1e4, 0, 0);
  };
  /** The nearest lamps of the road and the villages round the camera into the other slots. */
  const placeLamps = (f: MapFrame) => {
    const slots = u.uLamps.value;
    const list = lamps!;
    const cam = f.camera.position;
    for (const s of near) {
      s.d = Infinity;
      s.i = -1;
    }
    for (let i = 0; i < list.length; i++) {
      const d = list[i].distanceToSquared(cam);
      if (d > LAMP_REACH * LAMP_REACH || d >= near[near.length - 1].d) continue;
      let j = near.length - 1;
      while (j > 0 && near[j - 1].d > d) {
        near[j].d = near[j - 1].d;
        near[j].i = near[j - 1].i;
        j--;
      }
      near[j].d = d;
      near[j].i = i;
    }
    near.forEach((s, j) => {
      const p = s.i >= 0 ? list[s.i] : null;
      if (p) slots[MOVING + j].set(p.x, p.y, p.z, 0.55);
      else slots[MOVING + j].set(0, -1e4, 0, 0);
    });
  };

  const buf = new Vector2();
  const tint = new Color();
  const drift = u.uDrift.value;
  // (drawn, unseen, until it has been drawn once: its shader compiles before the first snowfall)
  let compiled = false;
  mesh.onAfterRender = () => void (compiled = true);
  /** Seconds since the snow last lay on the land (the height map from above is let go after a while). */
  let bare = 0;
  /** It has snowed on this page (the still things built after this part have their snow). */
  let snowed = false;
  const blocks = snowmen.reduce((s, g) => s + (g.userData.blocks as number), 0);
  console.info(`[map] snow: ${n} flakes · the cover on ${covered} materials (${copies.size} copies) · ${snowmen.length} snowmen, ${blocks} blocks · built in ${(performance.now() - t0).toFixed(1)} ms`);

  return {
    name: 'snow',
    object,
    blocks,
    restored() {
      top?.forget();
    },
    update(f: MapFrame) {
      const w = f.weather;
      const snow = w.snow;
      const cover = w.snowCover;
      // The white on the land (and, the first time it snows, the map from above: what lies under a roof stays bare).
      COVER.uSnowCover.value = cover;
      if (cover > 0.001 || snow > 0.001) {
        bare = 0;
        if (!snowed) {
          snowed = true;
          coverLateStill(ctx.scene);
        }
        if (top && !top.target) top.draw();
      } else if (top?.target && (bare += f.dt) > 120) top.free();

      // Snowmen: built (they grow) while the land lies thick; they slump and go as it melts.
      const built = Math.min(1, Math.max(0, (cover - 0.55) / 0.3));
      for (const s of snowmen) {
        s.visible = built > 0.01;
        if (!s.visible) continue;
        const k = built * built * (3 - 2 * built);
        s.scale.set(0.55 + 0.45 * k, k, 0.55 + 0.45 * k);
      }

      // The flakes.
      const wx = Math.sin(w.windDir) * w.wind * WIND_SPEED;
      const wz = Math.cos(w.windDir) * w.wind * WIND_SPEED;
      if (ctx.shot) drift.set(wx * f.t, f.t, wz * f.t);
      else drift.set(drift.x + wx * f.dt, drift.y + f.dt, drift.z + wz * f.dt);
      u.uTime.value = f.t;
      const none = snow <= 0.002;
      mesh.visible = !none || !compiled;
      if (!mesh.visible) return;
      const share = graphicsNow.level === 'low' ? LOW_SHARE : 1;
      geo.instanceCount = none ? LAYERS.length : Math.max(LAYERS.length, Math.ceil(n * share * Math.min(1, snow * 1.2)));
      const over = f.roam === 'overview';
      u.uShape.value[0].z = over ? OVER.near : 1;
      u.uShape.value[1].x = LAYERS[1].size * (over ? OVER.mid : 1);
      ctx.renderer.getDrawingBufferSize(buf);
      const cam = f.camera;
      // (the scene's height: a picked resolution between whole steps draws the scene smaller than the canvas, resolution.ts;
      // a picture drawn k times bigger than the screen, `PX_SCALE`: the smallest flake is as big as on the screen)
      u.uPixel.value = ((2 * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(1, (buf.y * view.scene) / view.canvas) / cam.zoom) * PX_SCALE;
      // Lit all round, a little brighter than the snow on the land (so they read against it): the sky light from
      // above, its bounce off the snow below and the key light (the moon, by night); a flash lights every flake.
      const c = u.uColor.value
        .copy(SKY.fillSky)
        .multiplyScalar(0.55 * SKY.fillIntensity)
        .add(tint.copy(SKY.fillGround).multiplyScalar(0.2 * SKY.fillIntensity))
        .add(tint.copy(SKY.key).multiplyScalar(0.26 * SKY.keyIntensity));
      // (whiter than the sky light's blue, and never so bright it glows)
      const l = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
      c.lerp(tint.setScalar(l), 0.35).multiplyScalar(Math.min(1, 0.95 / Math.max(l, 1e-4))).addScalar(0.7 * w.flash);
      // Lamplight (by night): the lights that move every frame, the nearest lamps again every few tenths of a second.
      const glow = f.night * f.night * (3 - 2 * f.night);
      u.uGlow.value.copy(LAMP_COLOR).multiplyScalar(glow);
      if (glow > 0.01) {
        if (!lamps) findLamps();
        placeLights(f);
        lampClock -= f.dt;
        if (lampClock <= 0 || ctx.shot) {
          lampClock = 0.3;
          placeLamps(f);
        }
      }
      u.uOpacity.value = none ? 0 : 0.6 + 0.4 * Math.min(1, snow);
    },
  };
}
