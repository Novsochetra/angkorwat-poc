import { Color, MeshBasicMaterial, MeshStandardMaterial, type Material, type WebGLProgramParametersWithUniforms } from 'three';

/**
 * Pixel-art surfaces of the world kit (plan §19). Every face of a block with a
 * pattern is drawn as texels of 1/16 m, like the reference sheets' block textures:
 * a speckle of 3–4 tones, then per-block amounts of moss, lichen, cracks and dark
 * weathering (stone), grass drips (soil), flowers (leaves)… from its `surf`.
 *
 *   stone  surf = [moss, lichen, cracks, stain]
 *   soil   surf = [grass, moss, dry (paler + cracks), wet (darker)]
 *   leaf   surf = [flowers, yellowing, —, —]
 *   bark   surf = [moss, lichen, —, stain]
 *   water  surf = [—, —, —, —] (ripple texels)
 */
export type VoxelPattern = 'stone' | 'soil' | 'leaf' | 'bark' | 'water';
const PATTERN_ID: Record<VoxelPattern, number> = { stone: 1, soil: 2, leaf: 3, bark: 4, water: 5 };

/** Texels per metre of every pattern: 16 → 6.25 cm, eight to a 0.5 m sandstone block. */
export const KIT_TEXELS_PER_M = 16;

/**
 * Overlay colours the patterns paint with (sRGB albedo), sampled from the
 * section 18–19 sheets — moss on the mossy sandstone and moss tiles, the grass
 * tile's greens, the lichen tile's pale blotches, the flowering leaf cube — and
 * corrected in linear light so the studio render matches the sheets.
 */
export const SURFACE_COLORS = {
  moss: [0x607339, 0x495d30, 0x788741, 0x38492c],
  lichen: [0xc9c2ae, 0xaaa88f, 0xdad6c6],
  grass: [0x607946, 0x4c6644, 0x788e44, 0x3f5f3d, 0x889c46],
  grit: 0x8d8478,
  flowerPink: 0xe59bb0,
  flowerCream: 0xf1e6d2,
} as const;

/**
 * Material "families" used by voxels. A family decides how a voxel is lit and how
 * its rounded edges look; the voxel's own colour comes from its per-instance colour.
 *
 * The reference renders show every block with a soft bevel whose edges catch a
 * warmer, lighter tone (orange rims on hair and leather, gold threads on the krama,
 * pale seams on the shirt). `edgeTint`/`edgeStrength` reproduce that, `bevel` is the
 * corner radius as a fraction of the block's smallest side and `grain` adds the
 * fine felt/clay speckle visible on the close-up sheet.
 */
export interface VoxelMaterialSpec {
  roughness: number;
  metalness: number;
  /** Corner radius relative to the smallest box side (0.5 = fully round). */
  bevel: number;
  /** Edges cut flat (one slanted strip that catches the light) instead of rounded. */
  chamfer?: boolean;
  edgeTint: number;
  edgeStrength: number;
  /** Width of the tinted rim across the bevel (0‥1, default 1 = whole outer bevel). */
  edgeWidth?: number;
  /** Brightness variation of the surface speckle (0 = none). */
  grain: number;
  /** Speckle cells per geometry unit. */
  grainScale: number;
  /** Unlit, self-coloured voxels (flames, lamp glass). */
  unlit?: boolean;
  /**
   * Flush neighbours merge into one smooth surface: each block pushes its bevel
   * into covered neighbours, so only the outer silhouette stays rounded (the face).
   */
  seamless?: boolean;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  /** Pixel-art surface drawn on every face (world kit), see {@link VoxelPattern}. */
  pattern?: VoxelPattern;
  /** Share of stone texels that are dark pores (0‥1). */
  pits?: number;
  /**
   * Chiselled surface: each texel's normal (1/16 m on patterned families, one
   * grain cell on others) leans up to this much (tangent of the angle) its own
   * way, so light catches the face texel by texel like rough stone, bark or
   * leaves instead of sliding over a smooth plane.
   */
  relief?: number;
  /**
   * Share of the specular reflection kept (sun highlight and environment,
   * default 1). World materials keep little of it, so they read matte.
   */
  specular?: number;
}

export const VOXEL_MATERIALS = {
  // ── Character ────────────────────────────────────────────────────────────
  skin: { roughness: 0.7, metalness: 0, bevel: 0.075, edgeTint: 0xffcfa2, edgeStrength: 0.2, edgeWidth: 0.6, grain: 0.035, grainScale: 20 },
  // The face reads as one smooth block on the sheet: no seams between its cells.
  face: { roughness: 0.7, metalness: 0, bevel: 0.075, edgeTint: 0xffcfa2, edgeStrength: 0.2, edgeWidth: 0.6, grain: 0.035, grainScale: 20, seamless: true },
  hair: { roughness: 0.78, metalness: 0, bevel: 0.17, edgeTint: 0xae5f2e, edgeStrength: 0.5, edgeWidth: 1.0, grain: 0.16, grainScale: 26 },
  eye: { roughness: 0.35, metalness: 0, bevel: 0.1, edgeTint: 0x000000, edgeStrength: 0, grain: 0, grainScale: 1 },
  shirt: { roughness: 0.93, metalness: 0, bevel: 0.15, edgeTint: 0xfff6ea, edgeStrength: 0.3, edgeWidth: 0.7, grain: 0.08, grainScale: 22 },
  shorts: { roughness: 0.95, metalness: 0, bevel: 0.13, edgeTint: 0x80868c, edgeStrength: 0.4, edgeWidth: 0.6, grain: 0.1, grainScale: 22 },
  sock: { roughness: 0.95, metalness: 0, bevel: 0.14, edgeTint: 0xfff8ee, edgeStrength: 0.18, grain: 0.05, grainScale: 12 },
  krama: { roughness: 0.9, metalness: 0, bevel: 0.17, edgeTint: 0xf0a24c, edgeStrength: 0.5, edgeWidth: 0.6, grain: 0.1, grainScale: 22 },
  leather: { roughness: 0.66, metalness: 0, bevel: 0.13, edgeTint: 0xd48a45, edgeStrength: 0.55, edgeWidth: 0.6, grain: 0.14, grainScale: 26 },
  boot: { roughness: 0.64, metalness: 0, bevel: 0.13, edgeTint: 0xc97a3a, edgeStrength: 0.55, edgeWidth: 0.6, grain: 0.14, grainScale: 24 },
  metal: { roughness: 0.55, metalness: 0.12, bevel: 0.13, edgeTint: 0xc9c7c3, edgeStrength: 0.38, edgeWidth: 0.7, grain: 0.07, grainScale: 22 },
  brass: { roughness: 0.32, metalness: 0.75, bevel: 0.14, edgeTint: 0xffe2a0, edgeStrength: 0.35, grain: 0.03, grainScale: 18 },
  lens: { roughness: 0.12, metalness: 0.2, bevel: 0.12, edgeTint: 0x000000, edgeStrength: 0, grain: 0, grainScale: 1 },
  wood: { roughness: 0.8, metalness: 0, bevel: 0.14, edgeTint: 0xc98a52, edgeStrength: 0.35, grain: 0.09, grainScale: 12 },
  hat: { roughness: 0.92, metalness: 0, bevel: 0.14, edgeTint: 0xfff0d2, edgeStrength: 0.25, grain: 0.08, grainScale: 12 },
  glow: { roughness: 1, metalness: 0, bevel: 0.14, edgeTint: 0xffffff, edgeStrength: 0.25, grain: 0.04, grainScale: 10, unlit: true },
  // ── World (Angkor Wat sandstone kit) ─────────────────────────────────────
  // World families are matte (little specular), with flat-cut edges and a
  // chiselled `relief`, like the kit's sandstone.
  stone: { roughness: 0.96, metalness: 0, bevel: 0.08, chamfer: true, edgeTint: 0xe9d4ae, edgeStrength: 0.35, grain: 0.1, grainScale: 9, relief: 0.07, specular: 0.35 },
  darkstone: { roughness: 0.96, metalness: 0, bevel: 0.08, chamfer: true, edgeTint: 0xa39580, edgeStrength: 0.3, grain: 0.1, grainScale: 9, relief: 0.07, specular: 0.35 },
  moss: { roughness: 0.98, metalness: 0, bevel: 0.12, chamfer: true, edgeTint: 0xa6c46a, edgeStrength: 0.3, grain: 0.12, grainScale: 8, relief: 0.08, specular: 0.3 },
  foliage: { roughness: 0.95, metalness: 0, bevel: 0.14, chamfer: true, edgeTint: 0xb5d67a, edgeStrength: 0.35, grain: 0.1, grainScale: 6, relief: 0.1, specular: 0.4 },
  bark: { roughness: 0.97, metalness: 0, bevel: 0.12, chamfer: true, edgeTint: 0x9c7552, edgeStrength: 0.3, grain: 0.1, grainScale: 8, relief: 0.08, specular: 0.3 },
  ground: { roughness: 1, metalness: 0, bevel: 0.06, chamfer: true, edgeTint: 0x9fbf66, edgeStrength: 0.2, grain: 0.12, grainScale: 3, relief: 0.06, specular: 0.3 },
  // ── World kit (plan §18–20): pixel-art surfaces, see SURFACE_COLORS ───────
  // 5 cm flat-cut edges on a 0.5 m block; a matte, chiselled surface.
  sandstone: { roughness: 0.96, metalness: 0, bevel: 0.1, chamfer: true, edgeTint: 0xf6e2bd, edgeStrength: 0.34, edgeWidth: 0.75, grain: 0.19, grainScale: KIT_TEXELS_PER_M, pattern: 'stone', pits: 0.045, relief: 0.07, specular: 0.35 },
  soil: { roughness: 1, metalness: 0, bevel: 0.05, chamfer: true, edgeTint: 0xc39a6a, edgeStrength: 0.18, edgeWidth: 0.6, grain: 0.2, grainScale: KIT_TEXELS_PER_M, pattern: 'soil', relief: 0.07, specular: 0.3 },
  leaves: { roughness: 0.92, metalness: 0, bevel: 0.1, chamfer: true, edgeTint: 0xd8ec8e, edgeStrength: 0.32, edgeWidth: 0.7, grain: 0.2, grainScale: KIT_TEXELS_PER_M, pattern: 'leaf', relief: 0.1, specular: 0.4 },
  trunk: { roughness: 0.97, metalness: 0, bevel: 0.09, chamfer: true, edgeTint: 0xc2946a, edgeStrength: 0.3, edgeWidth: 0.7, grain: 0.14, grainScale: KIT_TEXELS_PER_M, pattern: 'bark', relief: 0.08, specular: 0.3 },
  water: { roughness: 0.1, metalness: 0.05, bevel: 0.04, edgeTint: 0xcdeee8, edgeStrength: 0.2, edgeWidth: 0.6, grain: 0.1, grainScale: KIT_TEXELS_PER_M, pattern: 'water', transparent: true, opacity: 0.84 },
  petal: { roughness: 0.85, metalness: 0, bevel: 0.12, chamfer: true, edgeTint: 0xfff2f4, edgeStrength: 0.3, edgeWidth: 0.7, grain: 0.06, grainScale: KIT_TEXELS_PER_M, relief: 0.05, specular: 0.5 },
  wax: { roughness: 0.7, metalness: 0, bevel: 0.1, chamfer: true, edgeTint: 0xfff5e2, edgeStrength: 0.25, grain: 0.03, grainScale: KIT_TEXELS_PER_M, emissive: 0x3a1c00, emissiveIntensity: 0.4, specular: 0.6 },
} as const satisfies Record<string, VoxelMaterialSpec>;

/** Families drawn with a pixel-art pattern (their instances carry a `surf`). */
export function voxelPatternOf(key: VoxelMaterialKey): VoxelPattern | undefined {
  return (VOXEL_MATERIALS[key] as VoxelMaterialSpec).pattern;
}

export type VoxelMaterialKey = keyof typeof VOXEL_MATERIALS;

const cache = new Map<VoxelMaterialKey, Material>();

/**
 * Shared material for a voxel family. Adds (via shader injection):
 *  - a bevel-edge tint driven by the undeformed box normal,
 *  - a per-voxel speckle keyed on the instance position (stable under animation).
 */
export function getVoxelMaterial(key: VoxelMaterialKey): Material {
  const hit = cache.get(key);
  if (hit) return hit;
  const spec: VoxelMaterialSpec = VOXEL_MATERIALS[key];
  let material: Material;
  if (spec.unlit) {
    const m = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    injectVoxelShading(m, spec);
    material = m;
  } else {
    const m = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: spec.roughness,
      metalness: spec.metalness,
      transparent: spec.transparent ?? false,
      opacity: spec.opacity ?? 1,
    });
    if (spec.emissive !== undefined) {
      m.emissive = new Color(spec.emissive);
      m.emissiveIntensity = spec.emissiveIntensity ?? 1;
    }
    injectVoxelShading(m, spec);
    material = m;
  }
  material.name = `voxel:${key}`;
  cache.set(key, material);
  return material;
}

/** Linear-space GLSL vec3 literal of an sRGB hex colour. */
function glslColor(hex: number): string {
  const c = new Color(hex);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
}

/**
 * Pixel-art surface patterns (see {@link VoxelPattern}). Everything is keyed on
 * whole texels, so it reads as the hand-placed pixels of the reference sheets,
 * and on mesh-space position, so moss patches and cracks run across block seams.
 */
const PATTERN_GLSL = /* glsl */ `
uniform float uTexel;
uniform float uPits;
flat varying vec4 vVoxSurf;
flat varying vec3 vVoxS;
const vec3 MOSS_0 = ${glslColor(SURFACE_COLORS.moss[0])};
const vec3 MOSS_1 = ${glslColor(SURFACE_COLORS.moss[1])};
const vec3 MOSS_2 = ${glslColor(SURFACE_COLORS.moss[2])};
const vec3 MOSS_3 = ${glslColor(SURFACE_COLORS.moss[3])};
const vec3 LICHEN_0 = ${glslColor(SURFACE_COLORS.lichen[0])};
const vec3 LICHEN_1 = ${glslColor(SURFACE_COLORS.lichen[1])};
const vec3 LICHEN_2 = ${glslColor(SURFACE_COLORS.lichen[2])};
const vec3 GRASS_0 = ${glslColor(SURFACE_COLORS.grass[0])};
const vec3 GRASS_1 = ${glslColor(SURFACE_COLORS.grass[1])};
const vec3 GRASS_2 = ${glslColor(SURFACE_COLORS.grass[2])};
const vec3 GRASS_3 = ${glslColor(SURFACE_COLORS.grass[3])};
const vec3 GRASS_4 = ${glslColor(SURFACE_COLORS.grass[4])};
const vec3 GRIT = ${glslColor(SURFACE_COLORS.grit)};
const vec3 FLOWER_PINK = ${glslColor(SURFACE_COLORS.flowerPink)};
const vec3 FLOWER_CREAM = ${glslColor(SURFACE_COLORS.flowerCream)};

// Smooth value noise, p in lattice (texel) units.
float voxNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(voxHash(i), voxHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(voxHash(i + vec3(0.0, 1.0, 0.0)), voxHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(voxHash(i + vec3(0.0, 0.0, 1.0)), voxHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(voxHash(i + vec3(0.0, 1.0, 1.0)), voxHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

// Two 0‥1 amounts packed as a·256 + b (8 bits each), see packSurf in VoxelMesh.ts.
vec2 voxUnpack(float v) {
  float a = floor(v / 256.0 + 0.001);
  return vec2(a, v - a * 256.0) / 255.0;
}

// Crack network: one-texel lines along some Voronoi borders (≈0.6 m cells) of the
// face plane; more borders crack as amount grows.
float voxCracks(vec3 p, vec3 f, float amount) {
  float plane = floor(dot(p, abs(f)) * 4.0 + 0.5) + 3.0 * (f.x + 2.0 * f.y + 4.0 * f.z);
  vec2 q = (floor(voxFaceUV(p, f) * uTexel) + 0.5) / uTexel;
  vec2 g = q * 1.6;
  vec2 gi = floor(g);
  vec2 gf = fract(g);
  float d1 = 9.0;
  float d2 = 9.0;
  vec2 id1 = vec2(0.0);
  vec2 id2 = vec2(0.0);
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 c = gi + o;
      vec2 r = o + 0.15 + 0.7 * vec2(voxHash(vec3(c, plane)), voxHash(vec3(c, plane + 57.0))) - gf;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; id2 = id1; d1 = d; id1 = c; }
      else if (d < d2) { d2 = d; id2 = c; }
    }
  float border = sqrt(d2) - sqrt(d1);
  // The same decision on both sides of a border, so a crack is whole or absent.
  vec2 lo = min(id1, id2);
  vec2 hi = max(id1, id2);
  float keep = step(1.0 - amount, voxHash(vec3(lo * 1.37 + hi * 0.71, plane + 13.0)));
  return step(border, 1.05 * 1.6 / uTexel) * keep;
}

// Moss: patches that start on tops and upper edges, creep down the sides and
// shy away from undersides. Returns the moss colour's weight.
float voxMossMask(vec3 T, float amount, float up, float hb, float h1) {
  if (amount <= 0.001) return 0.0;
  float m = voxNoise(T * 0.16 + 23.0) * 0.6 + voxNoise(T * 0.42 + 61.0) * 0.28 + h1 * 0.12;
  m += 0.3 * up + 0.14 * hb * (1.0 - abs(up)) - 0.3 * step(up, -0.5);
  return step(1.25 - amount, m);
}

vec3 voxMossColor(float h, float blot) {
  vec3 c = h < 0.3 ? MOSS_0 : (h < 0.55 ? MOSS_1 : (h < 0.8 ? MOSS_2 : MOSS_3));
  return c * (0.88 + 0.24 * blot);
}

float voxLichenMask(vec3 T, float amount, float h1) {
  if (amount <= 0.001) return 0.0;
  float l = voxNoise(T * 0.21 + 41.0) * 0.82 + h1 * 0.18;
  return step(1.0 - amount * 0.62, l);
}

vec3 voxPattern(vec3 base, vec3 n) {
  vec3 an = abs(n);
  // The block face this fragment belongs to (bevels take the nearest face).
  vec3 f = an.x > an.y && an.x > an.z ? vec3(sign(n.x), 0.0, 0.0) : (an.y > an.z ? vec3(0.0, sign(n.y), 0.0) : vec3(0.0, 0.0, sign(n.z)));
  vec3 P = vVoxSeed + vVoxP;
  // The texel just inside the face (faces sit exactly on texel boundaries).
  vec3 T = floor(P * uTexel - f * 0.5);
  // Far away a texel shrinks below a pixel: fade the fine detail to its mean.
  float fine = 1.0 - smoothstep(0.45, 1.1, length(fwidth(P)) * uTexel);
  vec2 sA = voxUnpack(vVoxSurf.x);
  vec2 sB = voxUnpack(vVoxSurf.y);
  float up = f.y;
  // Height inside the block: -1 at its bottom, +1 at its top.
  float hb = clamp(vVoxP.y / max(vVoxS.y * 0.5, 1e-4), -1.0, 1.0);
  float h1 = voxHash(T);
  float h2 = voxHash(T + vec3(17.0, 31.0, 7.0));
  float blot = voxNoise(T * 0.33 + vec3(3.1, 7.7, 1.3));
  vec3 c = base;
#if VOX_PAT == 1
  // Sandstone: 3–4 tones in soft blotches, then the sheets' bold grains —
  // small clusters of pale cream and of cool grey-brown — and dark pores.
  c *= 1.0 + ((h1 - 0.5) * uGrain + (blot - 0.5) * uGrain * 0.9) * fine;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float pale = step(0.76, voxNoise(T * 0.55 + 17.0) * 0.75 + h1 * 0.25);
  c = mix(c, mix(c, vec3(lum), 0.35) * 1.22, pale * 0.85 * fine);
  float grey = step(0.78, voxNoise(T * 0.6 + 43.0) * 0.75 + h2 * 0.25);
  c = mix(c, mix(c, vec3(lum), 0.2) * 0.52, grey * fine);
  c = mix(c, c * vec3(0.5, 0.48, 0.48), step(h2, uPits) * fine);
  if (sB.y > 0.001) {
    // Dark weathering: a harsher mottle, vertical run-off streaks, grime low on blocks.
    c *= 1.0 + (voxHash(T + 3.0) - 0.5) * sB.y * 0.45 * fine;
    float st = voxNoise(vec3(T.x * 0.23, T.y * 0.07, T.z * 0.23) + 11.0) * 0.72 + voxNoise(T * 0.12 + 5.0) * 0.28 - hb * 0.07;
    float stain = step(1.05 - sB.y * 0.95, st + (h1 - 0.5) * 0.08);
    c = mix(c, c * vec3(0.45, 0.42, 0.39), stain * 0.92);
  }
  if (sB.x > 0.001) c = mix(c, c * vec3(0.33, 0.29, 0.27), voxCracks(P, f, sB.x));
  c = mix(c, h2 < 0.45 ? LICHEN_0 : (h2 < 0.8 ? LICHEN_1 : LICHEN_2), voxLichenMask(T, sA.y, h1) * 0.9);
  c = mix(c, voxMossColor(h2, blot), voxMossMask(T, sA.x, up, hb, h1));
#elif VOX_PAT == 2
  // Soil: crumbly speckle with grit and dark crumbs.
  c *= 1.0 + ((h1 - 0.5) * uGrain + (blot - 0.5) * uGrain) * fine;
  c = mix(c, GRIT * (0.85 + 0.3 * h1), step(h2, 0.035) * fine);
  c = mix(c, c * 0.6, step(0.955, h2) * fine);
  c = mix(c, c * vec3(0.64, 0.58, 0.53), sB.y);
  if (sB.x > 0.001) {
    c = mix(c, c * 1.16 + 0.015, sB.x * 0.7);
    c = mix(c, c * 0.5, voxCracks(P, f, sB.x) * step(0.5, up));
  }
  c = mix(c, voxMossColor(h2, blot), voxMossMask(T, sA.y, up, hb, h1));
  if (sA.x > 0.001) {
    // Grass: covers the top, hangs 1–4 texels down exposed sides.
    int m = int(vVoxOpen + 0.5);
    float topOpen = float((m >> 2) & 1);
    float patchN = voxNoise(T * 0.14 + 71.0) * 0.82 + h1 * 0.18;
    float onTop = step(1.0 - sA.x * 1.08, patchN);
    float colN = voxHash(vec3(f.x != 0.0 ? T.z : T.x, 5.0, f.x != 0.0 ? T.x : T.z));
    float drip = (1.0 + floor(colN * 4.0)) * smoothstep(0.35, 0.9, sA.x);
    float dTop = (vVoxS.y * 0.5 - vVoxP.y) * uTexel;
    float g = up > 0.5 ? onTop * topOpen : (up < -0.5 ? 0.0 : step(dTop, drip) * topOpen);
    vec3 gc = h2 < 0.25 ? GRASS_0 : (h2 < 0.5 ? GRASS_1 : (h2 < 0.7 ? GRASS_2 : (h2 < 0.9 ? GRASS_3 : GRASS_4)));
    c = mix(c, gc * (0.9 + 0.2 * blot), g);
  }
#elif VOX_PAT == 3
  // Leaves: strong light / dark texels, bright tips, dark gaps.
  float t = (h1 - 0.5) * uGrain + (blot - 0.5) * uGrain * 0.8 + step(0.86, h2) * 0.26 - step(h2, 0.1) * 0.3;
  c *= 1.0 + t * fine;
  if (sA.y > 0.001) c = mix(c, c * vec3(1.28, 1.16, 0.55), step(1.0 - sA.y, voxNoise(T * 0.22 + 5.0)) * 0.85);
  if (sA.x > 0.001) {
    float fl = step(1.0 - sA.x * 0.3, voxHash(T + 91.0));
    c = mix(c, voxHash(T + 7.0) < 0.65 ? FLOWER_PINK : FLOWER_CREAM, fl);
  }
#elif VOX_PAT == 4
  // Bark: vertical ridges and furrows.
  vec2 hv = f.x != 0.0 ? T.zy : (f.z != 0.0 ? T.xy : T.xz);
  float ridge = voxNoise(vec3(hv.x * 0.75, hv.y * 0.13, dot(T, abs(f)) * 0.3 + 9.0));
  c *= 1.0 + ((ridge - 0.5) * 0.6 + (h1 - 0.5) * uGrain) * fine;
  if (sB.y > 0.001) {
    float st = voxNoise(vec3(T.x * 0.23, T.y * 0.07, T.z * 0.23) + 11.0);
    c = mix(c, c * vec3(0.5, 0.47, 0.44), step(1.05 - sB.y * 0.95, st) * 0.9);
  }
  c = mix(c, h2 < 0.45 ? LICHEN_0 : (h2 < 0.8 ? LICHEN_1 : LICHEN_2), voxLichenMask(T, sA.y, h1) * 0.85);
  c = mix(c, voxMossColor(h2, blot), voxMossMask(T, sA.x, up, hb, h1));
#elif VOX_PAT == 5
  // Water: slow ripple bands and a few glinting texels on top.
  float r = voxNoise(vec3(T.x * 0.3, T.y * 0.3, T.z * 0.3) + 3.0);
  c *= 0.9 + 0.2 * r;
  c = mix(c, c * 1.55 + 0.03, step(0.93, h1) * step(0.5, up) * fine);
#endif
  return c * vVoxSurf.z;
}
`;

function injectVoxelShading(material: MeshStandardMaterial | MeshBasicMaterial, spec: VoxelMaterialSpec): void {
  const edgeTint = new Color(spec.edgeTint);
  const lit = !spec.unlit;
  const defines: Record<string, unknown> = { ...(material.defines ?? {}) };
  if (lit) defines.VOX_LIT = '';
  if (spec.pattern) defines.VOX_PAT = String(PATTERN_ID[spec.pattern]);
  if (lit && spec.relief) defines.VOX_RELIEF = '';
  material.defines = defines;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uEdgeTint = { value: edgeTint };
    shader.uniforms.uEdgeStrength = { value: spec.edgeStrength };
    shader.uniforms.uEdgeWidth = { value: spec.edgeWidth ?? 1 };
    shader.uniforms.uGrain = { value: spec.grain };
    shader.uniforms.uGrainScale = { value: spec.grainScale };
    shader.uniforms.uTexel = { value: KIT_TEXELS_PER_M };
    shader.uniforms.uPits = { value: spec.pits ?? 0 };
    shader.uniforms.uRelief = { value: spec.relief ?? 0 };
    shader.uniforms.uSpecular = { value: spec.specular ?? 1 };

    injectVoxelVertex(shader, spec);

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
varying vec3 vVoxN;
varying vec3 vVoxP;
varying vec3 vVoxSeed;
flat varying float vVoxOpen;
uniform vec3 uEdgeTint;
uniform float uEdgeStrength;
uniform float uEdgeWidth;
uniform float uGrain;
uniform float uGrainScale;
uniform float uRelief;
uniform float uSpecular;
float voxHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
// Face-plane coordinates (metres) of a point on the face with normal f.
vec2 voxFaceUV(vec3 p, vec3 f) {
  return f.x != 0.0 ? p.zy : (f.y != 0.0 ? p.xz : p.xy);
}
#ifdef VOX_PAT
${PATTERN_GLSL}
// Surface detail cells per metre: the pattern's texels.
#define VOX_TEXEL uTexel
#else
#define VOX_TEXEL uGrainScale
#endif`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
vec3 voxN = normalize(vVoxN);
// 0 on the flat faces, 1 on the outer half of the rounded bevel.
float voxEdge = smoothstep(0.29 - 0.2 * uEdgeWidth, 0.29, 1.0 - max(max(abs(voxN.x), abs(voxN.y)), abs(voxN.z)));
{
  // Only rims between exposed faces glow; edges against a flush neighbour stay a
  // soft seam. A masonry joint (bits 6–11) is half exposed: every stone's own
  // bevel catches some light down to where it meets the next stone.
  int m = int(vVoxOpen + 0.5) & 63;
  int j = (int(vVoxOpen + 0.5) >> 6) & 63;
  float w = 1.0;
  if (abs(voxN.x) > 0.12) w *= voxN.x > 0.0 ? max(float(m & 1), 0.6 * float(j & 1)) : max(float((m >> 1) & 1), 0.6 * float((j >> 1) & 1));
  if (abs(voxN.y) > 0.12) w *= voxN.y > 0.0 ? max(float((m >> 2) & 1), 0.6 * float((j >> 2) & 1)) : max(float((m >> 3) & 1), 0.6 * float((j >> 3) & 1));
  if (abs(voxN.z) > 0.12) w *= voxN.z > 0.0 ? max(float((m >> 4) & 1), 0.6 * float((j >> 4) & 1)) : max(float((m >> 5) & 1), 0.6 * float((j >> 5) & 1));
  voxEdge *= mix(0.1, 1.0, w);
}
float voxSeam = 0.0;
#ifdef VOX_PAT
{
  // Where two stones meet, the V of their bevels closes in a thin shadow line.
  int j = (int(vVoxOpen + 0.5) >> 6) & 63;
  vec3 js = vec3(
    vVoxP.x > 0.0 ? float(j & 1) : float((j >> 1) & 1),
    vVoxP.y > 0.0 ? float((j >> 2) & 1) : float((j >> 3) & 1),
    vVoxP.z > 0.0 ? float((j >> 4) & 1) : float((j >> 5) & 1));
  vec3 sd = vVoxS * 0.5 - abs(vVoxP);
  vec3 sl = js * (1.0 - smoothstep(vec3(0.003), vec3(0.014), sd));
  // (a line thinner than a pixel far away would only flicker)
  voxSeam = max(max(sl.x, sl.y), sl.z) * (1.0 - smoothstep(0.004, 0.012, length(fwidth(vVoxP))));
  voxEdge *= 1.0 - voxSeam;
}
#if VOX_PAT == 1
// Worn stone edges: the light rim breaks up texel by texel (evened out far away).
voxEdge *= mix(0.75, 0.5 + 0.5 * voxHash(floor((vVoxSeed + vVoxP) * uTexel) + 71.0), 1.0 - smoothstep(0.45, 1.1, length(fwidth(vVoxP)) * uTexel));
#endif
#endif
#ifdef VOX_PAT
diffuseColor.rgb = voxPattern(diffuseColor.rgb, voxN);
#else
float voxGrain = voxHash(floor(vVoxP * uGrainScale) + floor(vVoxSeed * 7.0));
diffuseColor.rgb *= 1.0 + (voxGrain - 0.5) * uGrain;
#endif
#ifndef VOX_LIT
diffuseColor.rgb = mix(diffuseColor.rgb, uEdgeTint, voxEdge * uEdgeStrength);
#endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
#ifdef VOX_RELIEF
{
  // Chiselled surface: every texel leans a little its own way (a tilt in its
  // face plane, turned into view space by the screen-space frame of the face).
  vec3 ra = abs(voxN);
  vec3 rf = ra.x > ra.y && ra.x > ra.z ? vec3(sign(voxN.x), 0.0, 0.0) : (ra.y > ra.z ? vec3(0.0, sign(voxN.y), 0.0) : vec3(0.0, 0.0, sign(voxN.z)));
  vec3 rP = vVoxSeed + vVoxP;
  vec3 rT = floor(rP * VOX_TEXEL - rf * 0.5);
  // (faded out where a texel shrinks below a pixel)
  float rFine = 1.0 - smoothstep(0.45, 1.1, length(fwidth(rP)) * VOX_TEXEL);
  vec2 rTilt = (vec2(voxHash(rT + 13.1), voxHash(rT + 27.7)) - 0.5) * 2.0 * uRelief * rFine;
  vec2 rUV = voxFaceUV(rP, rf);
  vec3 q0 = dFdx(-vViewPosition);
  vec3 q1 = dFdy(-vViewPosition);
  vec2 st0 = dFdx(rUV);
  vec2 st1 = dFdy(rUV);
  vec3 q1perp = cross(q1, normal);
  vec3 q0perp = cross(normal, q0);
  vec3 rTan = q1perp * st0.x + q0perp * st1.x;
  vec3 rBit = q1perp * st0.y + q0perp * st1.y;
  float rDet = max(dot(rTan, rTan), dot(rBit, rBit));
  float rScale = rDet == 0.0 ? 0.0 : inversesqrt(rDet);
  normal = normalize(normal + (rTan * rTilt.x + rBit * rTilt.y) * rScale);
}
#endif
{
  // Worn, warm rims catch the key light (orange hair / leather rims, gold krama threads).
  float voxFacing = 1.0;
  #if NUM_DIR_LIGHTS > 0
    voxFacing = smoothstep(-0.2, 0.5, dot(normal, directionalLights[0].direction));
  #endif
  diffuseColor.rgb = mix(diffuseColor.rgb, uEdgeTint, voxEdge * uEdgeStrength * mix(0.3, 1.0, voxFacing));
  diffuseColor.rgb *= 1.0 - 0.5 * voxSeam;
}`,
      )
      .replace(
        '#include <aomap_fragment>',
        /* glsl */ `#include <aomap_fragment>
#ifdef VOX_LIT
// Matte families keep only part of the sun highlight and environment reflection.
reflectedLight.directSpecular *= uSpecular;
reflectedLight.indirectSpecular *= uSpecular;
#endif`,
      );
  };
  // Families inject identical code (only uniforms and the pattern define differ).
  material.customProgramCacheKey = () => `voxel-shading-v9${spec.pattern ? `:${spec.pattern}` : ''}${defines.VOX_RELIEF !== undefined ? ':relief' : ''}`;
}

/**
 * The vertex half of the voxel shading: re-bevels each instance to its real
 * size (constant bevel, squared joints, pushed / merged sides). Shared with the
 * shadow depth pass (see shadow.ts), so what casts a shadow is what is drawn.
 */
export function injectVoxelVertex(shader: WebGLProgramParametersWithUniforms, spec: VoxelMaterialSpec): void {
  shader.uniforms.uBevel = { value: Math.max(1e-4, spec.bevel) };
  shader.uniforms.uSeamless = { value: spec.seamless ? 1 : 0 };
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      /* glsl */ `#include <common>
varying vec3 vVoxN;
varying vec3 vVoxP;
varying vec3 vVoxSeed;
attribute float voxOpen;
attribute float voxRadius;
flat varying float vVoxOpen;
#ifdef VOX_PAT
attribute vec4 voxSurf;
flat varying vec4 vVoxSurf;
flat varying vec3 vVoxS;
#endif
uniform float uBevel;
uniform float uSeamless;
// Sides that butt against another block (bits 6–11 of voxOpen).
vec3 voxJointOf(float open, vec3 p) {
  int m = int(open + 0.5) >> 6;
  return vec3(
    float(p.x > 0.0 ? (m & 1) : ((m >> 1) & 1)),
    float(p.y > 0.0 ? ((m >> 2) & 1) : ((m >> 3) & 1)),
    float(p.z > 0.0 ? ((m >> 4) & 1) : ((m >> 5) & 1)));
}
// Seamless families push the bevel of every covered side into the neighbour, so
// flush faces meet flat and only the silhouette stays rounded.
vec3 voxPushOf(float open, vec3 p) {
  if (uSeamless < 0.5) return vec3(0.0);
  int m = int(open + 0.5);
  return vec3(
    1.0 - float(p.x > 0.0 ? (m & 1) : ((m >> 1) & 1)),
    1.0 - float(p.y > 0.0 ? ((m >> 2) & 1) : ((m >> 3) & 1)),
    1.0 - float(p.z > 0.0 ? ((m >> 4) & 1) : ((m >> 5) & 1)));
}
#ifdef VOX_PAT
// Patterned blocks also merge the sides flagged in voxSurf.w (cells of one stone).
vec3 voxMergeOf(float merge, vec3 p) {
  int m = int(merge + 0.5);
  return vec3(
    float(p.x > 0.0 ? (m & 1) : ((m >> 1) & 1)),
    float(p.y > 0.0 ? ((m >> 2) & 1) : ((m >> 3) & 1)),
    float(p.z > 0.0 ? ((m >> 4) & 1) : ((m >> 5) & 1)));
}
#endif
// ...and shade the pushed bevel like the face it continues. Fully covered faces
// take the block's exposed direction, so a sliver leaking through a seam matches.
vec3 voxFlatNormal(vec3 n, vec3 push, float open) {
  vec3 f = n * (1.0 - push);
  if (dot(f, f) > 1e-4) return normalize(f);
  int m = int(open + 0.5);
  vec3 e = vec3(float(m & 1) - float((m >> 1) & 1), float((m >> 2) & 1) - float((m >> 3) & 1), float((m >> 4) & 1) - float((m >> 5) & 1));
  return dot(e, e) > 0.5 ? normalize(e) : n;
}`,
    )
    .replace(
      '#include <beginnormal_vertex>',
      /* glsl */ `#ifdef USE_INSTANCING
  vec3 voxNS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
#else
  vec3 voxNS = vec3(1.0);
#endif
// three.js divides instance normals by scale² then applies the instance matrix
// (n / s); the re-bevelled block keeps its unit normals, so pre-multiply by s.
vec3 voxPushN = voxPushOf(voxOpen, position);
#ifdef VOX_PAT
  voxPushN = max(voxPushN, voxMergeOf(voxSurf.w, position));
#endif
vec3 objectNormal = voxFlatNormal(vec3(normal), voxPushN, voxOpen) * voxNS;
#ifdef USE_TANGENT
  vec3 objectTangent = vec3(tangent.xyz);
#endif`,
    )
    .replace(
      '#include <begin_vertex>',
      /* glsl */ `#include <begin_vertex>
{
  // Unit block → real size with a constant bevel radius on every edge.
  #ifdef USE_INSTANCING
    vec3 voxS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  #else
    vec3 voxS = vec3(1.0);
  #endif
  float voxMin = min(min(voxS.x, voxS.y), voxS.z);
  // (a block's own radius, if given, stays below half its smallest side)
  float voxR = voxRadius > 0.0 ? min(voxRadius, voxMin * 0.45) : voxMin * uBevel;
  vec3 voxT = clamp((abs(position) - (0.5 - uBevel)) / uBevel, 0.0, 1.0);
  // An edge between two joints lies inside the masonry: keep it square, so no
  // channel opens between the stones where four of them meet.
  vec3 voxJ = voxJointOf(voxOpen, position);
  float voxOnJoint = max(max(voxJ.x * step(1e-3, voxT.x), voxJ.y * step(1e-3, voxT.y)), voxJ.z * step(1e-3, voxT.z));
  voxT = max(voxT, voxJ * voxOnJoint);
  vec3 voxPush = voxPushOf(voxOpen, position);
  #ifdef VOX_PAT
    voxPush = max(voxPush, voxMergeOf(voxSurf.w, position));
  #endif
  // (+ a hair of overlap so neighbouring flat faces never leave a crack)
  vec3 voxPw = sign(position) * (voxS * 0.5 - voxR + voxT * voxR + voxPush * (voxR + 0.012));
  transformed = voxPw / voxS;
  vVoxP = voxPw;
  vVoxN = voxFlatNormal(normal, voxPush, voxOpen);
  #ifdef VOX_PAT
    vVoxS = voxS;
    vVoxSurf = voxSurf;
  #endif
}
vVoxOpen = voxOpen;
#ifdef USE_INSTANCING
  vVoxSeed = instanceMatrix[3].xyz;
#else
  vVoxSeed = vec3(0.0);
#endif`,
    );
}
