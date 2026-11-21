import { BufferGeometry, CustomBlending, Float32BufferAttribute, Group, OneFactor, OneMinusSrcAlphaFactor, Points, ShaderMaterial, Sphere, UniformsLib, UniformsUtils, Vector3, type InstancedBufferAttribute, type Mesh, type Object3D, type Vector4 } from 'three';
import { mulberry32 } from '../../voxel/random';
import { graphicsNow } from '../graphics';
import type { HeightField } from '../heightfield';
import { PX_SCALE } from '../resolution';
import { pointScale } from '../road/glow';
import type { MapContext, MapFrame } from '../types';
import { nightHeld, nyeOff } from './clock';
import type { NyePiece } from './index';
import { GROUND, LAKE_SHORE, LAKE_STAGE, onLakeLanding, onLakeShore, onSquare, RING, SQUARE, STAGE } from './plan';
import { SPARK_MAX, SPARKS, type SparkSite } from './_lifeSparks';

/**
 * The New Year's Eve night's small life and motion round both venues (AWP-35, the craft pass; the owner's lake
 * reference: fireflies in the garden, petals drifting from the flowering trees): one point-sprite draw a venue, all of
 * it moving in its shader (the `nye` part is frozen for matrices: nothing here moves on the CPU), only on the event
 * night (clock.ts `nightHeld`), only near its venue (within `NEAR` m of the camera), none on the low level (phones):
 *
 * - **fireflies**: small warm-green lights wandering slowly a metre or two over the garden round the plaza, under the
 *   flowering trees and (by the lake) over the reeds, more out at the dark edges than by the lamps; each glows up
 *   softly for a moment every few seconds;
 * - **petals**: pink and purple, from the flowering trees' crowns (found in the venue's own kit meshes by their
 *   blossom colour, so they follow whatever trees the square and the lake plant), fluttering down on the breeze,
 *   lying a while on the ground, then gone, and again;
 * - **motes**: a faint warm dust rising slowly through the stage's light and the mandala's glow, twinkling;
 * - **sparks**: thrown from the sparklers in the crowd's hands (`_lifeSparks.ts` `SPARKS`, written by the people).
 *
 * The sprites are drawn premultiplied (one draw: the glowing ones add, the petals cover). Kinds by tables in the
 * shader (weights, no branches). Medium draws the first part of each venue's list (`MEDIUM`).
 */

/** Drawn only while the camera is this near the venue's middle (m). */
const NEAR = 260;
/** Each venue's sprites on high (medium draws the first `MEDIUM` share of each kind). */
const COUNTS = {
  kulen: { fireflies: 320, petals: 440, motes: 170, sparks: 14 },
  lake: { fireflies: 260, petals: 320, motes: 130, sparks: 14 },
} as const;
const MEDIUM = 0.55;
/** The breeze the petals drift on (rad: toward (sin, cos) in x, z), and how much each strays from it. */
const BREEZE = 0.7;

const KIND = { firefly: 0, petal: 1, mote: 2, spark: 3 } as const;

interface Venue {
  site: SparkSite;
  x: number;
  z: number;
  /** How far round its middle blossom boxes count as its trees' (m). */
  reach: number;
  points: Points;
  uniforms: LifeUniforms;
  built: boolean;
  /** Sprites on medium, and all. */
  medium: number;
  all: number;
}

interface LifeUniforms {
  [k: string]: { value: unknown };
  uTime: { value: number };
  uLevel: { value: number };
  uScale: { value: number };
  uPx: { value: number };
  uPetal: { value: number };
  uSpark: { value: Vector4[] };
}

/** One sprite list being made: medium's first, then high's (`add(…, med)`). */
class List {
  private readonly parts = [this.part(), this.part()];
  private part() {
    return { pos: [] as number[], seed: [] as number[], kind: [] as number[], data: [] as number[], color: [] as number[] };
  }
  add(rnd: () => number, med: boolean, kind: number, x: number, y: number, z: number, data: readonly number[], color: readonly number[] = [1, 1, 1]): void {
    const p = this.parts[med ? 0 : 1];
    p.pos.push(x, y, z);
    p.seed.push(rnd(), rnd(), rnd(), rnd());
    p.kind.push(kind);
    p.data.push(data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, data[3] ?? 0);
    p.color.push(color[0], color[1], color[2]);
  }
  get medium(): number {
    return this.parts[0].kind.length;
  }
  fill(geo: BufferGeometry): number {
    const [a, b] = this.parts;
    geo.setAttribute('position', new Float32BufferAttribute([...a.pos, ...b.pos], 3));
    geo.setAttribute('aSeed', new Float32BufferAttribute([...a.seed, ...b.seed], 4));
    geo.setAttribute('aKind', new Float32BufferAttribute([...a.kind, ...b.kind], 1));
    geo.setAttribute('aData', new Float32BufferAttribute([...a.data, ...b.data], 4));
    geo.setAttribute('aColor', new Float32BufferAttribute([...a.color, ...b.color], 3));
    return a.kind.length + b.kind.length;
  }
}

/** A blossom block of the venue's flowering trees (its middle, its colour: linear). */
interface Bloom {
  x: number;
  y: number;
  z: number;
  c: [number, number, number];
}

/**
 * The flowering trees' blossom blocks round (x, z) in the nye part's festival kit meshes (the square's garden, the
 * lake's shore and meadow: `_sqGarden.ts` `crown` puts them in a kit): world-placed 1 m blocks, pink or purple, dimly
 * lit, high over the ground.
 */
function findBlossom(root: Object3D, field: HeightField, x: number, z: number, reach: number): Bloom[] {
  const out: Bloom[] = [];
  root.traverse((o) => {
    const geo = (o as Mesh).geometry as BufferGeometry | undefined;
    if (!geo) return;
    const pos = geo.getAttribute('iPos') as InstancedBufferAttribute | undefined;
    const size = geo.getAttribute('iSize') as InstancedBufferAttribute | undefined;
    const rot = geo.getAttribute('iRot') as InstancedBufferAttribute | undefined;
    const col = geo.getAttribute('iCol') as InstancedBufferAttribute | undefined;
    if (!pos || !size || !rot || !col) return;
    for (let i = 0; i < pos.count; i++) {
      // (world-placed: rig 0; a crown's cell: ≈ 1 m; dimly lit, not a lantern)
      if (pos.getW(i) !== 0 || rot.getZ(i) > 0.3) continue;
      const sx = size.getX(i);
      const sy = size.getY(i);
      if (sx < 0.6 || sx > 1.3 || sy < 0.6 || sy > 1.3) continue;
      const r = col.getX(i);
      const g = col.getY(i);
      const b = col.getZ(i);
      if (g > 0.65 * Math.min(r, b) || r < 0.08 || b < 0.06) continue;
      const bx = pos.getX(i);
      const by = pos.getY(i);
      const bz = pos.getZ(i);
      if (Math.hypot(bx - x, bz - z) > reach || by < field.heightAt(bx, bz) + 2.5) continue;
      out.push({ x: bx, y: by, z: bz, c: [r, g, b] });
    }
  });
  return out;
}

/** The ground a petal lands on under (x, z): the land (the square's or the terrace's paving a little over it), or the water. */
function floorAt(field: HeightField, x: number, z: number): number {
  const g = field.heightAt(x, z);
  const w = field.waterAt(x, z);
  if (w !== null && w > g) return w;
  return g + (onSquare(x, z) || onLakeShore(x, z) || onLakeLanding(x, z) ? 0.08 : 0);
}

/** Fill a venue's sprites (on its first night near the camera: the blossom is read from the part's built meshes). */
function fill(v: Venue, root: Object3D, field: HeightField): void {
  const rnd = mulberry32(v.site === 'kulen' ? 0x11fe : 0x1a4f);
  const n = COUNTS[v.site];
  const list = new List();
  const blooms = findBlossom(root, field, v.x, v.z, v.reach);
  const dry = (x: number, z: number) => {
    const w = field.waterAt(x, z);
    return w === null || w < field.heightAt(x, z) - 0.05;
  };
  // The venue's shape: its plaza (kept free of fireflies) and the band of garden round it.
  const kulen = v.site === 'kulen';
  const ex = kulen ? SQUARE.rx : LAKE_SHORE.rx;
  const ez = kulen ? SQUARE.rz : LAKE_SHORE.rz;
  const onPlaza = (x: number, z: number) => (kulen ? onSquare(x, z, 1) : onLakeShore(x, z, 1) || onLakeLanding(x, z, 1));
  // The lake stage's frame (u across, v toward the shore) and its deck.
  const FX = Math.sin(LAKE_STAGE.yaw);
  const FZ = Math.cos(LAKE_STAGE.yaw);
  const stageAt = (u: number, w: number): [number, number] => [LAKE_STAGE.x + Math.cos(LAKE_STAGE.yaw) * u + FX * w, LAKE_STAGE.z - Math.sin(LAKE_STAGE.yaw) * u + FZ * w];
  const nearStage = (x: number, z: number) => {
    if (kulen) return x > STAGE.x0 - 2 && x < STAGE.x1 + 2 && z > STAGE.back - 2 && z < STAGE.front + 1;
    const dx = x - LAKE_STAGE.x;
    const dz = z - LAKE_STAGE.z;
    return Math.abs(dx * Math.cos(LAKE_STAGE.yaw) - dz * Math.sin(LAKE_STAGE.yaw)) < LAKE_STAGE.w / 2 + 2 && Math.abs(dx * FX + dz * FZ) < LAKE_STAGE.d / 2 + 2;
  };
  const deck = (field.waterAt(LAKE_STAGE.x, LAKE_STAGE.z) ?? 5) + LAKE_STAGE.deck;

  // ── Fireflies: half under and round the flowering trees, half out in the garden's band (more toward its dark edge) ──
  for (let k = 0, tries = 0; k < n.fireflies && tries < n.fireflies * 40; tries++) {
    let x: number;
    let z: number;
    if (blooms.length && rnd() < 0.45) {
      const b = blooms[Math.floor(rnd() * blooms.length)];
      const a = rnd() * Math.PI * 2;
      const d = 1 + rnd() * 5;
      x = b.x + Math.sin(a) * d;
      z = b.z + Math.cos(a) * d;
    } else {
      const a = rnd() * Math.PI * 2;
      const e = 1.05 + 0.85 * Math.sqrt(rnd());
      x = v.x + Math.sin(a) * ex * e;
      z = v.z + Math.cos(a) * ez * e;
    }
    if (onPlaza(x, z) || nearStage(x, z)) continue;
    const g = field.heightAt(x, z);
    let y: number;
    if (dry(x, z)) {
      if (kulen && Math.abs(g - GROUND) > 7) continue;
      y = g + 0.4 + rnd() * 2.3;
    } else {
      // (over the water only in the shallows by the bank: the reeds)
      const w = field.waterAt(x, z)!;
      if (kulen || w - g > 1.3 || rnd() < 0.4) continue;
      y = w + 0.3 + rnd() * 1.2;
    }
    list.add(rnd, k < n.fireflies * MEDIUM, KIND.firefly, x, y, z, [0.7 + rnd() * 0.9]);
    k++;
  }
  // ── Petals: from the blossom's blocks, down onto the ground under them (or the water), lying a while ──
  if (blooms.length)
    for (let k = 0; k < n.petals; k++) {
      const b = blooms[Math.floor(rnd() * blooms.length)];
      const x = b.x + (rnd() - 0.5) * 1.1;
      const z = b.z + (rnd() - 0.5) * 1.1;
      const y = b.y - 0.4 - rnd() * 0.3;
      const ground = floorAt(field, x, z);
      // (a little lighter than the crown's block: a petal against the night)
      const c = b.c.map((q) => q * 0.8 + 0.2 * Math.max(...b.c));
      list.add(rnd, k < n.petals * MEDIUM, KIND.petal, x, y, z, [ground, BREEZE + (rnd() - 0.5) * 0.9, 6 + rnd() * 9, 0.42 + rnd() * 0.3], c);
    }
  // ── Motes: in the light before the stage's board and over the mandala's glow ──
  for (let k = 0; k < n.motes; k++) {
    const med = k < n.motes * MEDIUM;
    if (rnd() < 0.6) {
      if (kulen) list.add(rnd, med, KIND.mote, STAGE.x0 + 2 + rnd() * (STAGE.x1 - STAGE.x0 - 4), GROUND + STAGE.h + 1 + rnd() * 9, STAGE.front - 3 + rnd() * 10, [5]);
      else {
        const [x, z] = stageAt((rnd() - 0.5) * (LAKE_STAGE.w - 3), -LAKE_STAGE.d / 2 + 2 + rnd() * (LAKE_STAGE.d + 2));
        list.add(rnd, med, KIND.mote, x, deck + 0.8 + rnd() * 7, z, [4.5]);
      }
    } else {
      const cx = kulen ? RING.x : LAKE_SHORE.x;
      const cz = kulen ? RING.z : LAKE_SHORE.z;
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * (kulen ? RING.r : 7);
      const x = cx + Math.sin(a) * d;
      const z = cz + Math.cos(a) * d;
      list.add(rnd, med, KIND.mote, x, floorAt(field, x, z) + 1.5 + rnd() * 4, z, [3.5]);
    }
  }
  // ── Sparks: a few a sparkler (each holder's slot in `SPARKS`) ──
  for (let h = 0; h < SPARK_MAX; h++) for (let k = 0; k < n.sparks; k++) list.add(rnd, true, KIND.spark, 0, 0, 0, [h]);

  const geo = v.points.geometry;
  v.all = list.fill(geo);
  v.medium = list.medium;
  // (culled on what it draws: the garden's band round the venue and the trees' crowns over it)
  geo.boundingSphere = new Sphere(new Vector3(v.x, (kulen ? GROUND : deck) + 4, v.z), Math.max(ex, ez) * 2 + 12);
  v.built = true;
  console.info(`[map] nye life (${v.site}): ${blooms.length} blossom blocks · ${v.all} sprites (${v.medium} on medium)`);
}

const VERTEX = /* glsl */ `
attribute vec4 aSeed;
attribute float aKind;
attribute vec4 aData;
attribute vec3 aColor;
uniform float uTime;
uniform float uLevel;
uniform float uScale;
uniform float uPx;
uniform float uPetal;
uniform vec4 uSpark[${SPARK_MAX}];
varying vec3 vCol;
varying float vCover;
varying float vShape;
varying float vTumble;
#include <common>
#include <fog_pars_vertex>
// The kinds' sizes (m), their smallest and biggest dot (px): firefly (with its halo), petal, mote, spark.
const vec4 SIZE = vec4(0.26, 0.26, 0.04, 0.04);
const vec4 MINPX = vec4(2.8, 2.0, 1.0, 1.5);
const vec4 MAXPX = vec4(16.0, 11.0, 3.0, 3.5);
const vec3 FIREFLY = vec3(0.72, 1.0, 0.3);
const vec3 MOTE = vec3(1.0, 0.78, 0.45);
const vec3 SPARK = vec3(1.0, 0.9, 0.62);
void main() {
  vec4 kw = vec4(equal(vec4(aKind), vec4(0.0, 1.0, 2.0, 3.0)));
  float t = uTime;
  vec4 s = aSeed * 6.2831853;
  // Firefly: a slow wander (aData.x m), a soft glow for a moment every few seconds, a faint ember between.
  vec3 pF = position + aData.x * vec3(
    sin(t * 0.23 * (0.7 + aSeed.w) + s.x) + 0.5 * sin(t * 0.51 + s.y),
    0.35 * sin(t * 0.37 * (0.7 + aSeed.w) + s.z),
    cos(t * 0.19 * (0.7 + aSeed.w) + s.y) + 0.5 * cos(t * 0.43 + s.x));
  float ph = fract(t / (2.6 + 3.4 * aSeed.x) + aSeed.y);
  float iF = 0.16 + 1.7 * smoothstep(0.0, 0.14, ph) * (1.0 - smoothstep(0.2, 0.55, ph));
  // Petal: down from the crown at aData.w m/s onto the ground (aData.x), drifting on the breeze (aData.y) and
  // fluttering, lying there aData.z s, fading; then from the crown again.
  float fallT = max(0.3, position.y - aData.x) / aData.w;
  float life = fallT + aData.z;
  float u = mod(t + aSeed.x * (life + 1.5), life + 1.5);
  float fall = clamp(u / fallT, 0.0, 1.0);
  float flying = 1.0 - step(1.0, fall);
  vec2 drift = vec2(sin(aData.y), cos(aData.y)) * (0.5 + 1.5 * aSeed.z) * fall;
  vec2 flutter = vec2(sin(u * 1.9 + s.z), cos(u * 1.4 + s.x)) * 0.32 * flying;
  vec3 pP = vec3(position.x + drift.x + flutter.x, mix(position.y, aData.x + 0.03, fall), position.z + drift.y + flutter.y);
  float iP = smoothstep(0.0, 0.7, u) * (1.0 - smoothstep(life - 1.5, life, u));
  // Mote: rising slowly through the light (aData.x m, round again), drifting, twinkling as it turns.
  float rise = fract(t * 0.022 * (0.5 + aSeed.w) + aSeed.y);
  vec3 pM = position + vec3(0.8 * sin(t * 0.11 + s.x), (rise - 0.5) * aData.x, 0.8 * cos(t * 0.09 + s.z));
  float iM = (0.2 + 0.8 * pow(0.5 + 0.5 * sin(t * (0.8 + aSeed.z) + s.w), 6.0)) * sin(rise * 3.14159);
  // Spark: thrown out from its sparkler's tip (aData.x: which), falling, dying in a fraction of a second.
  vec4 hs = uSpark[int(aData.x + 0.5)];
  float us = fract(t * (1.7 + 1.5 * aSeed.w) + aSeed.x);
  float el = aSeed.z * 2.4 - 0.6;
  vec3 dir = vec3(cos(s.y) * cos(el), sin(el), sin(s.y) * cos(el));
  vec3 pS = hs.xyz + dir * (0.04 + 0.5 * us) - vec3(0.0, 0.45 * us * us, 0.0);
  float iS = hs.w * (1.0 - us) * (1.0 - us);
  vec3 p = kw.x * pF + kw.y * pP + kw.z * pM + kw.w * pS;
  float I = dot(kw, vec4(iF, iP, iM, iS)) * uLevel;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float dist = max(0.5, -mvPosition.z);
  float px = dot(kw, SIZE) * uScale / dist;
  float lo = dot(kw, MINPX);
  // (nothing to draw: no dot at all)
  gl_PointSize = clamp(px, lo, dot(kw, MAXPX)) * uPx * step(0.003, I);
  // (smaller than its smallest dot far off: its light spread over it, dimmer)
  float cover = clamp(px / lo, 0.3, 1.0);
  vCol = (kw.x * FIREFLY * 2.4 * cover + kw.y * aColor * uPetal + kw.z * MOTE * 0.55 * cover + kw.w * SPARK * 4.0) * I;
  vCover = kw.y * I;
  vShape = kw.y;
  vTumble = flying * abs(cos(t * (2.0 + 2.5 * aSeed.w) + s.w)) + (1.0 - flying) * 0.3;
  #include <fog_vertex>
}`;

const FRAGMENT = /* glsl */ `
varying vec3 vCol;
varying float vCover;
varying float vShape;
varying float vTumble;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  // The glowing kinds: a bright core in a soft halo. A petal: a small leaf-shaped block, thinner as it turns edge on.
  float glow = (exp(-r2 * 7.0) + 0.16 * exp(-r2 * 2.2)) * step(r2, 1.0);
  float petal = step(abs(q.x), 0.75) * step(abs(q.y), 0.22 + 0.55 * vTumble);
  float m = mix(glow, petal, vShape);
  if (m <= 0.003) discard;
  // (premultiplied: the glowing kinds add, a petal covers what is behind it)
  gl_FragColor = vec4(vCol * m, vCover * m);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    gl_FragColor.rgb *= 1.0 - fogFactor;
  #endif
}`;

function venue(site: SparkSite, x: number, z: number, reach: number): Venue {
  const uniforms = UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 }, uLevel: { value: 0 }, uScale: { value: 800 }, uPx: { value: PX_SCALE }, uPetal: { value: 1.0 } }]) as LifeUniforms;
  // (the sparklers' tips: the people's own vectors, not copies)
  uniforms.uSpark = { value: SPARKS[site] };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    fog: true,
  });
  material.name = 'nye:life';
  const points = new Points(new BufferGeometry(), material);
  points.name = `nye:life:${site}`;
  points.visible = false;
  points.renderOrder = 3;
  points.raycast = () => {};
  return { site, x, z, reach, points, uniforms, built: false, medium: 0, all: 0 };
}

export function buildNyeLife(ctx: MapContext): NyePiece {
  const object = new Group();
  object.name = 'nye:life';
  const venues = [venue('kulen', SQUARE.x, SQUARE.z, 75), venue('lake', LAKE_SHORE.x, LAKE_SHORE.z, 62)];
  for (const v of venues) object.add(v.points);
  let fade = 0;
  let last = -1;
  return {
    object,
    blocks: 0,
    update(f: MapFrame) {
      const level = graphicsNow.level;
      // (the event night, dark, not on low; fading in and out over a second or two)
      const want = nightHeld() && !nyeOff() && level !== 'low' ? Math.min(1, Math.max(0, (f.night - 0.3) / 0.4)) : 0;
      const dt = last < 0 || f.dt <= 0 ? 1 : Math.min(0.1, f.dt);
      last = f.t;
      fade += Math.max(-dt * 0.7, Math.min(dt * 0.7, want - fade));
      if (f.dt <= 0) fade = want;
      const scale = fade > 0 ? pointScale(ctx.renderer, f.camera) : 0;
      const cam = f.camera.position;
      for (const v of venues) {
        const near = Math.hypot(cam.x - v.x, cam.z - v.z) < NEAR;
        const on = fade > 0.001 && near;
        if (on && !v.built && object.parent) fill(v, object.parent, ctx.field);
        v.points.visible = on && v.all > 0;
        if (!v.points.visible) continue;
        v.points.geometry.setDrawRange(0, level === 'medium' ? v.medium : v.all);
        const u = v.uniforms;
        u.uTime.value = f.t % 3600;
        u.uLevel.value = fade;
        u.uScale.value = scale;
      }
    },
  };
}
