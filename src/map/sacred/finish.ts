import { BufferAttribute, BufferGeometry, Color, CubeTexture, MeshStandardMaterial, SRGBColorSpace, Vector3, Vector4, type Camera } from 'three';
import type { SculptMesh } from './sculpt';

/**
 * How a sculpted statue's surface looks (sculpt.ts): each region of the
 * sculpt gets a colour and a finish — gold leaf that shines, sandstone that
 * does not, saffron cloth — and a fine surface texture (grain in the colour
 * and a small bump: the stone's sand, the gold leaf's sheets, the cloth's
 * weave), drawn in the shader so it stays sharp up close.
 *
 * One material for every statue (`statueMaterial`): the colour and finish
 * ride on the mesh (`dress`), so a gilt and a sandstone Buddha share it.
 * It reflects a warm room (`sacredEnv`: gold needs something to mirror),
 * and up to four candle lamps near the camera light it (`SACRED_LAMPS`),
 * with no three.js lights added to the scene.
 */

export interface Finish {
  /** Colour (sRGB hex). */
  color: number;
  /** 0 stone or cloth ‥ 1 bare metal (gold leaf ≈ 0.85). */
  metal: number;
  /** 0 mirror ‥ 1 matte. */
  rough: number;
  /** Surface texture 0‥1: grain in the colour, a fine bump (default 0.3). */
  grain?: number;
}

/** Region name → finish; `*` for regions not listed. */
export type Palette = Record<string, Finish>;

/** Palettes for the usual statues (region names from buddha.ts; others fall back to `*`). */
export const PALETTES = {
  /** A pagoda Buddha: gilded all over, the eyes and brows painted dark, the lips a little warmer. */
  gilt: {
    '*': { color: 0xd9a441, metal: 0.9, rough: 0.3, grain: 0.35 },
    skin: { color: 0xe0ac48, metal: 0.92, rough: 0.26, grain: 0.3 },
    robe: { color: 0xd49a3a, metal: 0.88, rough: 0.34, grain: 0.4 },
    hem: { color: 0xe8b95a, metal: 0.95, rough: 0.22, grain: 0.3 },
    hair: { color: 0x9a6a22, metal: 0.8, rough: 0.42, grain: 0.5 },
    flame: { color: 0xeab94e, metal: 0.95, rough: 0.2, grain: 0.2 },
    eye: { color: 0x1d1510, metal: 0.1, rough: 0.5, grain: 0 },
    brow: { color: 0x2a1c12, metal: 0.1, rough: 0.6, grain: 0 },
    // (a warm touch of red in the gold, not paint: a lipstick red looked wrong)
    lip: { color: 0xc8703c, metal: 0.7, rough: 0.3, grain: 0.1 },
    lotus: { color: 0xd8a03e, metal: 0.9, rough: 0.3, grain: 0.35 },
    base: { color: 0x7a1f1a, metal: 0.05, rough: 0.45, grain: 0.3 },
    naga: { color: 0xcf9a3a, metal: 0.88, rough: 0.32, grain: 0.4 },
    sash: { color: 0xe07a1c, metal: 0, rough: 0.85, grain: 0.6 },
    jewel: { color: 0xc02a24, metal: 0.3, rough: 0.2, grain: 0 },
  },
  /** A sandstone Buddha of the old temples: warm grey-ochre stone, a saffron sash the people tied on. */
  sandstone: {
    '*': { color: 0xb49a78, metal: 0, rough: 0.92, grain: 0.9 },
    skin: { color: 0xbba080, metal: 0, rough: 0.9, grain: 0.85 },
    robe: { color: 0xae9373, metal: 0, rough: 0.93, grain: 0.9 },
    hem: { color: 0xa88e6e, metal: 0, rough: 0.93, grain: 0.9 },
    hair: { color: 0x8c7658, metal: 0, rough: 0.95, grain: 1 },
    flame: { color: 0xb09676, metal: 0, rough: 0.92, grain: 0.9 },
    eye: { color: 0x8e785c, metal: 0, rough: 0.95, grain: 0.8 },
    brow: { color: 0xa08868, metal: 0, rough: 0.95, grain: 0.8 },
    lip: { color: 0xb09070, metal: 0, rough: 0.92, grain: 0.8 },
    lotus: { color: 0xa48a6a, metal: 0, rough: 0.94, grain: 1 },
    base: { color: 0x9c8466, metal: 0, rough: 0.95, grain: 1 },
    naga: { color: 0xa8906e, metal: 0, rough: 0.94, grain: 1 },
    sash: { color: 0xe07a1c, metal: 0, rough: 0.85, grain: 0.6 },
    jewel: { color: 0xa88e6e, metal: 0, rough: 0.9, grain: 0.8 },
  },
  /** Dark old bronze with worn gold high points (a small shrine's Buddha). */
  bronze: {
    '*': { color: 0x6b4a2a, metal: 0.85, rough: 0.45, grain: 0.6 },
    skin: { color: 0x8a6232, metal: 0.9, rough: 0.35, grain: 0.5 },
    hair: { color: 0x3a2a1c, metal: 0.7, rough: 0.55, grain: 0.7 },
    eye: { color: 0x2a1d14, metal: 0.4, rough: 0.6, grain: 0 },
    brow: { color: 0x3a2a1c, metal: 0.5, rough: 0.6, grain: 0 },
    lip: { color: 0x7a4a2a, metal: 0.8, rough: 0.4, grain: 0.3 },
    base: { color: 0x5a3a22, metal: 0.8, rough: 0.5, grain: 0.7 },
    sash: { color: 0xe07a1c, metal: 0, rough: 0.85, grain: 0.6 },
  },
} satisfies Record<string, Palette>;

const lin = new Color();

/**
 * The sculpt's mesh in `palette`'s colours: a geometry sharing the mesh's
 * shape (positions, normals, faces, occlusion), with its own `color` and
 * `finish` (metal, rough, grain). Cheap: make one per look.
 */
export function dress(mesh: SculptMesh, palette: Palette): BufferGeometry {
  const src = mesh.geometry;
  const g = new BufferGeometry();
  for (const name of ['position', 'normal', 'occlusion', 'region']) g.setAttribute(name, src.getAttribute(name));
  g.setIndex(src.getIndex());
  const region = src.getAttribute('region');
  const paint = src.getAttribute('paint');
  const paintW = src.getAttribute('paintW');
  const n = region.count;
  const color = new Float32Array(n * 3);
  const finish = new Float32Array(n * 3);
  const fallback = palette['*'] ?? { color: 0xc0a070, metal: 0, rough: 0.8, grain: 0.3 };
  const per = mesh.regions.map((r) => {
    const f = palette[r] ?? fallback;
    lin.setHex(f.color, SRGBColorSpace);
    return [lin.r, lin.g, lin.b, f.metal, f.rough, f.grain ?? 0.3];
  });
  for (let i = 0; i < n; i++) {
    const a = per[region.getX(i)] ?? per[0];
    // (a painted line or patch blends in over its soft edge)
    const w = paint ? paintW.getX(i) : 0;
    const b = w > 0 ? (per[paint.getX(i)] ?? a) : a;
    for (let c = 0; c < 3; c++) {
      color[i * 3 + c] = a[c] + (b[c] - a[c]) * w;
      finish[i * 3 + c] = a[c + 3] + (b[c + 3] - a[c + 3]) * w;
    }
  }
  g.setAttribute('color', new BufferAttribute(color, 3));
  g.setAttribute('finish', new BufferAttribute(finish, 3));
  g.boundingBox = src.boundingBox;
  g.boundingSphere = src.boundingSphere;
  return g;
}

// ── Candle lamps ──────────────────────────────────────────────────────────

/** A warm lamp that lights the statues near it (candles on an altar, a lamp in a niche). */
export interface SacredLamp {
  /** World position (m). */
  x: number;
  y: number;
  z: number;
  /** How far its light reaches (m). */
  range: number;
  /** Linear colour × strength at night (by day it is `day` of that). */
  color: [number, number, number];
  /** Share of its strength by day (candles are lit all day in a pagoda: 0.35; a lamp only at night: 0). */
  day: number;
}

const MAX_LAMPS = 4;
const lampPos = Array.from({ length: MAX_LAMPS }, () => new Vector4(0, 0, 0, 1));
const lampCol = Array.from({ length: MAX_LAMPS }, () => new Vector3());
const uniforms = {
  uLampPos: { value: lampPos },
  uLampCol: { value: lampCol },
  uGrainScale: { value: 1 },
};

/** Every statue lamp on the map (parts add theirs at build). */
export const SACRED_LAMPS: SacredLamp[] = [];

const tmp = new Vector3();
const near: { lamp: SacredLamp; d: number }[] = [];

/**
 * Puts the lamps nearest the camera into the statues' shader (view space),
 * each as strong as the night asks. Call from the `update` of every part
 * with statues (cheap: a few lamps).
 */
export function updateSacredLights(camera: Camera, night: number): void {
  camera.updateMatrixWorld();
  const cam = camera.position;
  near.length = 0;
  for (const lamp of SACRED_LAMPS) {
    const d = Math.hypot(lamp.x - cam.x, lamp.y - cam.y, lamp.z - cam.z);
    if (d < 80) near.push({ lamp, d });
  }
  near.sort((a, b) => a.d - b.d);
  for (let i = 0; i < MAX_LAMPS; i++) {
    const it = near[i];
    if (!it) {
      lampCol[i].set(0, 0, 0);
      continue;
    }
    const l = it.lamp;
    tmp.set(l.x, l.y, l.z).applyMatrix4(camera.matrixWorldInverse);
    lampPos[i].set(tmp.x, tmp.y, tmp.z, l.range);
    const k = l.day + (1 - l.day) * night;
    // (a soft fade as the lamp leaves the nearest four)
    const fade = Math.min(1, Math.max(0, (80 - it.d) / 20));
    lampCol[i].set(l.color[0] * k * fade, l.color[1] * k * fade, l.color[2] * k * fade);
  }
  material?.setValues({ envMapIntensity: 1 - 0.7 * night });
}

// ── The material ──────────────────────────────────────────────────────────

let material: MeshStandardMaterial | null = null;

/** The one material for sculpted statues (made on first use). */
export function statueMaterial(): MeshStandardMaterial {
  if (material) return material;
  const m = new MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 1, envMap: sacredEnv(), envMapIntensity: 1 });
  m.name = 'statue';
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 finish;
attribute float occlusion;
varying vec3 vFinish;
varying float vOcc;
varying vec3 vObj;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vFinish = finish;
vOcc = occlusion;
vObj = position;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vFinish;
varying float vOcc;
varying vec3 vObj;
uniform vec4 uLampPos[${MAX_LAMPS}];
uniform vec3 uLampCol[${MAX_LAMPS}];
uniform float uGrainScale;
float sHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float sNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sHash(i), sHash(i + vec3(1, 0, 0)), f.x), mix(sHash(i + vec3(0, 1, 0)), sHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(sHash(i + vec3(0, 0, 1)), sHash(i + vec3(1, 0, 1)), f.x), mix(sHash(i + vec3(0, 1, 1)), sHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
/** Surface texture height: broad patches (gold leaf sheets, stone colour), fine sand. */
float sGrain(vec3 p) {
  p *= uGrainScale;
  return sNoise(p * 9.0) * 0.45 + sNoise(p * 38.0) * 0.35 + sNoise(p * 140.0) * 0.2;
}
vec3 sBump(vec3 pos, vec3 n, float h) {
  vec3 dx = dFdx(pos);
  vec3 dy = dFdy(pos);
  vec3 r1 = cross(dy, n);
  vec3 r2 = cross(n, dx);
  float det = dot(dx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - grad);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float sG = sGrain(vObj);
float sAmt = vFinish.z;
// Colour grain; the folds a little darker and browner (dust), the high points a little brighter (worn by hands).
diffuseColor.rgb *= 1.0 + (sG - 0.5) * 0.5 * sAmt;
diffuseColor.rgb *= mix(vec3(0.62, 0.52, 0.42), vec3(1.0), smoothstep(0.25, 0.9, vOcc));`,
      )
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = clamp(vFinish.y + (sG - 0.5) * 0.35 * sAmt + (1.0 - vOcc) * 0.25, 0.05, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = vFinish.x;`)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
normal = sBump(-vViewPosition, normal, sG * 0.0035 * sAmt / max(uGrainScale, 0.1));`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `for (int i = 0; i < ${MAX_LAMPS}; i++) {
  if (dot(uLampCol[i], uLampCol[i]) < 1e-6) continue;
  vec3 lv = uLampPos[i].xyz - geometryPosition;
  float ld = length(lv);
  IncidentLight lamp;
  lamp.direction = lv / max(ld, 1e-4);
  lamp.color = uLampCol[i] * getDistanceAttenuation(ld, uLampPos[i].w, 2.0);
  lamp.visible = true;
  RE_Direct(lamp, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
}
#include <lights_fragment_end>
// (baked occlusion: the folds and hollows get less of the room's light)
reflectedLight.indirectDiffuse *= vOcc;
reflectedLight.indirectSpecular *= mix(vOcc * vOcc, 1.0, 0.25);
reflectedLight.directDiffuse *= mix(1.0, vOcc, 0.45);`,
      );
  };
  m.customProgramCacheKey = () => 'sacred-statue-1';
  material = m;
  return m;
}

// ── The room gold reflects ────────────────────────────────────────────────

let env: CubeTexture | null = null;

/**
 * A small warm room for the gold to mirror (six 64 px canvases): a bright
 * ceiling, walls warm and dim with a light doorway, a dark red floor. Three
 * blurs it for rough surfaces (PMREM) on first use.
 */
export function sacredEnv(): CubeTexture {
  if (env) return env;
  const S = 64;
  const faces: HTMLCanvasElement[] = [];
  // Order: +x, −x, +y, −y, +z, −z.
  for (let f = 0; f < 6; f++) {
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const g = c.getContext('2d')!;
    if (f === 2) {
      const r = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S * 0.75);
      r.addColorStop(0, '#fff4dc');
      r.addColorStop(0.5, '#e8c890');
      r.addColorStop(1, '#a8845a');
      g.fillStyle = r;
      g.fillRect(0, 0, S, S);
    } else if (f === 3) {
      g.fillStyle = '#3a1c14';
      g.fillRect(0, 0, S, S);
    } else {
      const v = g.createLinearGradient(0, 0, 0, S);
      v.addColorStop(0, '#b89a70');
      v.addColorStop(0.45, '#d8b680');
      v.addColorStop(0.6, '#8a5a36');
      v.addColorStop(1, '#40201a');
      g.fillStyle = v;
      g.fillRect(0, 0, S, S);
      // A bright doorway or window on each wall (on the front one, wide: the door).
      g.fillStyle = '#fff0d0';
      const w = f === 4 ? 22 : 10;
      g.fillRect(S / 2 - w / 2 + (f === 0 ? 12 : f === 1 ? -12 : 0), 14, w, 24);
      g.fillStyle = 'rgba(255, 200, 120, 0.5)';
      g.fillRect(4, 30, 6, 8);
      g.fillRect(S - 10, 30, 6, 8);
    }
    faces.push(c);
  }
  env = new CubeTexture(faces);
  env.colorSpace = SRGBColorSpace;
  env.needsUpdate = true;
  env.name = 'sacred room';
  return env;
}
