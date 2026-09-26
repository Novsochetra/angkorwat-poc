import { BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshStandardMaterial, Sphere, Vector3, type WebGLProgramParametersWithUniforms } from 'three';
import { hash3 } from '../../voxel/random';
import { fbm, SURFACE, type HeightField } from '../heightfield';
import { SWAY, SWAY_GLSL } from '../veg/sway';
import { RICE_COLOR_GLSL, riceColorUniforms, sweepOrder } from './ground';
import { NURSERY, NURSERY_W, plotAt, STAGE_GLSL, SWEEP, type PlotPlan } from './stages';

/**
 * The rice: one tuft per hill, planted in rows (one mesh per plot, all of
 * one material: the plots out of view are not drawn). A tuft is a soft tapered block (narrow at the foot, fanning out at
 * the top, three rings high so it can curve), posed in the vertex shader
 * from the plot's stage on the season: seedlings in the water, growing to
 * knee–hip high and deep green, heads coming out and turning gold, bending
 * over heavy, cut in a sweep across the plot to short straw stubble, which
 * greys and is grazed away in the dry season. The nursery bed (one plot's
 * corner) grows dense seedlings first and is pulled for planting out.
 *
 * The wind: the jungle's sway (veg/sway.ts: a calm rock, a lean downwind)
 * plus waves running across the field with the wind, the bent tips lighter.
 * The explorer parts the rice as he wades through. Up close to the camera
 * the tufts dissolve in a dither (no view through a leaf).
 */

/** Between rows, and between hills along a row (m). */
const ROW = 0.55;
const STEP = 0.42;
/** Tufts keep this far from a plot's edge (the dike's wall), m. */
const MARGIN = 0.3;
/** The nursery bed's seedlings: a dense grid (m). */
const BED_STEP = 0.3;

export interface RiceUniforms {
  uSeason: { value: number };
  /** His feet while roaming (far away in the overview). */
  uFocus: { value: Vector3 };
}

/** One tuft: three rings (foot, middle, tip) of a unit square, sides and top, y 0‥1. */
function tuftGeometry(): InstancedBufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const sides: [number, number, number, number, number, number][] = [
    // (corner a x, z; corner b x, z; normal x, z), wound to face out
    [0.5, 0.5, 0.5, -0.5, 1, 0],
    [-0.5, -0.5, -0.5, 0.5, -1, 0],
    [-0.5, 0.5, 0.5, 0.5, 0, 1],
    [0.5, -0.5, -0.5, -0.5, 0, -1],
  ];
  for (const [ax, az, bx, bz, nx, nz] of sides) {
    const v = pos.length / 3;
    for (const y of [0, 0.5, 1]) {
      pos.push(ax, y, az, bx, y, bz);
      nor.push(nx, 0, nz, nx, 0, nz);
    }
    for (let r = 0; r < 2; r++) {
      const a = v + r * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  const v = pos.length / 3;
  pos.push(-0.5, 1, -0.5, -0.5, 1, 0.5, 0.5, 1, 0.5, 0.5, 1, -0.5);
  nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
  idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
  const geo = new InstancedBufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  geo.setIndex(idx);
  return geo;
}

const VERTEX_PARS = /* glsl */ `
attribute vec4 aT0;
attribute vec4 aT1;
attribute vec4 aT2;
uniform float uSeason;
uniform vec3 uFocus;
varying vec3 vRiceCol;
${STAGE_GLSL}
${SWAY_GLSL}
${RICE_COLOR_GLSL}`;

/**
 * Per vertex, in world space (the mesh stays at the origin). `aT0` = foot
 * (x, y, z), turn; `aT1` = plot lag, planted, cut (plot-local season), a
 * random 0‥1; `aT2` = nursery seedling (1) or rice (0), size, the way its
 * head bends (radians), and when a nursery seedling is pulled (rice: its
 * patch's colour, ×).
 */
const VERTEX = /* glsl */ `
vec3 rcPos;
vec3 objectNormal;
{
  float s = fract(uSeason - aT1.x);
  float rnd = aT1.w;
  float k = aT2.y;
  float hf = position.y;
  float g = smoothstep(aT1.y, aT1.y + 0.3, s);
  float planted = smoothstep(aT1.y, aT1.y + 0.006, s);
  float cutT = smoothstep(aT1.z, aT1.z + 0.003, s);
  float gone = smoothstep(0.9 + 0.07 * rnd, 0.93 + 0.07 * rnd, s);
  float H = mix(mix(0.3, 1.05, g), 0.12 + 0.08 * rnd, cutT) * k;
  float wTop = mix(mix(0.15, 0.36, g), 0.15, cutT);
  float wBot = mix(mix(0.07, 0.11, g), 0.1, cutT);
  float show = planted * (1.0 - gone);
  vec3 col = mix(pdRiceCol(hf, g, s) * aT2.w, pdStubbleCol(max(s - aT1.z - 0.02, 0.0)), cutT);
  float droop = pdDroop(s) * (1.0 - cutT);
  float stiff = 1.0 - 0.85 * cutT;
  if (aT2.x > 0.5) {
    // A nursery seedling: sown early, dense and bright, pulled for planting out.
    H = mix(0.06, 0.34, smoothstep(0.065, 0.11, s)) * k;
    wTop = 0.13;
    wBot = 0.06;
    show = smoothstep(0.062, 0.072, s) * (1.0 - smoothstep(aT2.w, aT2.w + 0.003, s));
    col = uSeedling * mix(0.75, 1.1, hf);
    droop = 0.0;
  }
  H *= show;
  float w = mix(wBot, wTop, hf) * show;
  float cy = cos(aT0.w);
  float sy = sin(aT0.w);
  vec2 lp = position.xz * w;
  vec3 base = aT0.xyz;
  vec3 P = base + vec3(lp.x * cy + lp.y * sy, hf * H, -lp.x * sy + lp.y * cy);
  // The wind: the land's sway, and waves running across the field downwind.
  vec2 sw = swayAt(base) * 1.4;
  float along = dot(base.xz, uSwayDir);
  float across = dot(base.xz, vec2(-uSwayDir.y, uSwayDir.x));
  float wave = 0.5 + 0.5 * sin(along * 0.45 - uSwayTime * 2.1 + 0.8 * sin(across * 0.08));
  float group = 0.5 + 0.5 * sin(along * 0.06 - uSwayTime * 0.5 + across * 0.03);
  float bendW = uSwayWind * wave * wave * (0.35 + 0.65 * group);
  sw += uSwayDir * bendW * 0.7;
  // Him wading through: the rice parts round his legs.
  float fd = distance(base.xz, uFocus.xz);
  float near = (1.0 - smoothstep(0.3, 1.3, fd)) * (1.0 - step(1.5, abs(base.y - uFocus.y)));
  sw += (base.xz - uFocus.xz) / max(fd, 0.05) * near * 0.6;
  // Heavy heads bending over, each its own way.
  vec2 ld = vec2(cos(aT2.z), sin(aT2.z));
  float c2 = hf * hf;
  // (and a little lean of its own, so the rows are not ruled)
  P.xz += (sw * stiff + ld * (droop * 0.32 + 0.1 + 0.1 * rnd)) * c2 * H;
  P.y -= (droop * 0.18 + length(sw) * stiff * 0.2) * c2 * H;
  rcPos = P;
  objectNormal = vec3(normal.x * cy + normal.z * sy, normal.y, -normal.x * sy + normal.z * cy);
  // (the foot in the others' shade; tips lighter where the wind bends them)
  col *= (0.88 + 0.24 * rnd) * mix(0.5, 1.0, hf) * (1.0 + 0.6 * bendW * c2);
  vRiceCol = col;
}`;

/** Close to the camera, tufts dissolve in a fine dither (as the undergrowth does). */
const FRAGMENT = /* glsl */ `
{
  float rcCam = length(vViewPosition);
  vec2 rcA = floor(gl_FragCoord.xy);
  vec2 rcA2 = floor(0.5 * gl_FragCoord.xy);
  float rcDither = fract(rcA2.x * 0.5 + rcA2.y * rcA2.y * 0.75) * 0.25 + fract(rcA.x * 0.5 + rcA.y * rcA.y * 0.75);
  if (rcCam < 1.6 && smoothstep(0.4, 1.6, rcCam) < rcDither) discard;
}`;

function riceMaterial(u: RiceUniforms): MeshStandardMaterial {
  const rice = riceColorUniforms();
  const m = new MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  m.name = 'paddies:rice';
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, SWAY, u, rice);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <beginnormal_vertex>', VERTEX)
      .replace('#include <begin_vertex>', 'vec3 transformed = rcPos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRiceCol;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FRAGMENT}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vRiceCol;')
      // (matte like the map's leaf blocks, a faint sheen)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.directSpecular *= 0.25;\nreflectedLight.indirectSpecular *= 0.0;');
  };
  m.customProgramCacheKey = () => 'map-paddies-rice-v1';
  return m;
}

/** Plant every plot: rows of hills, and the nursery bed's seedlings (a mesh per plot). */
export function buildRice(field: HeightField, plots: PlotPlan[], season: { value: number }): { meshes: Mesh[]; uniforms: RiceUniforms; count: number } {
  const t0: number[] = [];
  const t1: number[] = [];
  const t2: number[] = [];
  /** The first tuft of each plot. */
  const starts: number[] = [];
  /** Is (x, z) on this plot's floor, clear of its dikes by `m`? */
  const inPlot = (pi: number, x: number, z: number, m: number) => {
    for (const [dx, dz] of [
      [0, 0],
      [m, 0],
      [-m, 0],
      [0, m],
      [0, -m],
    ]) {
      const c = field.index(x + dx, z + dz);
      if (c < 0 || field.surface[c] !== SURFACE.paddy || plotAt(x + dx, z + dz) !== pi) return false;
    }
    return true;
  };
  for (const pl of plots) {
    starts.push(t0.length / 4);
    const p = pl.paddy;
    const cs = Math.cos(p.rot);
    const sn = Math.sin(p.rot);
    // Rows across the plot's local axes (u along the rows, v across them).
    const [lu, lv] = pl.rowsX ? [p.w, p.d] : [p.d, p.w];
    const rows = Math.floor((lv - 2 * MARGIN) / ROW);
    const hills = Math.floor((lu - 2 * MARGIN) / STEP);
    const v0 = -((rows - 1) * ROW) / 2;
    const u0 = -((hills - 1) * STEP) / 2;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < hills; i++) {
        const r = (k: number) => hash3(i + pl.index * 997, j, k, 5501);
        const u = u0 + i * STEP + (r(1) - 0.5) * 0.1;
        const v = v0 + j * ROW + (r(2) - 0.5) * 0.08;
        const [lx, lz] = pl.rowsX ? [u, v] : [v, u];
        const x = p.x + lx * cs - lz * sn;
        const z = p.z + lx * sn + lz * cs;
        if (!inPlot(pl.index, x, z, MARGIN)) continue;
        const y = field.heightAt(x, z);
        const order = sweepOrder(pl, x, z);
        // (a ragged edge to the sweep: the reapers do not keep a line)
        const cutOrder = Math.min(1, Math.max(0, order + (r(3) - 0.5) * 0.08));
        t0.push(x, y, z, (pl.rowsX ? 0 : Math.PI / 2) + (r(4) - 0.5) * 0.5);
        t1.push(pl.lag, pl.plant + order * SWEEP + r(5) * 0.002, pl.cut + cutOrder * SWEEP, r(6));
        // (patches a little lusher or paler, plot by plot and across a plot)
        const patch = 0.86 + 0.28 * fbm(x / 11, z / 11, 5503) + (hash3(pl.index, 9, 9, 5509) - 0.5) * 0.08;
        t2.push(0, (0.86 + 0.28 * r(7)) * (0.94 + 0.12 * patch - 0.06), r(8) * Math.PI * 2, patch);
      }
    if (pl.index !== NURSERY) continue;
    // The nursery bed: a strip along the plot's east side, dense seedlings, pulled just before this plot's planting.
    for (let z = p.z - p.d / 2 + MARGIN; z <= p.z + p.d / 2 - MARGIN; z += BED_STEP)
      for (let x = p.x + p.w / 2 - NURSERY_W + MARGIN; x <= p.x + p.w / 2 - MARGIN; x += BED_STEP) {
        const r = (k: number) => hash3(Math.round(x * 10), Math.round(z * 10), k, 5507);
        const jx = x + (r(1) - 0.5) * 0.12;
        const jz = z + (r(2) - 0.5) * 0.12;
        if (!inPlot(pl.index, jx, jz, MARGIN)) continue;
        t0.push(jx, field.heightAt(jx, jz), jz, r(3) * Math.PI);
        t1.push(pl.lag, 2, 2, r(4));
        t2.push(1, 0.8 + 0.4 * r(5), 0, pl.plant - 0.014 + r(6) * 0.014);
      }
  }
  const count = t0.length / 4;
  starts.push(count);
  const shape = tuftGeometry();
  const a0 = new Float32Array(t0);
  const a1 = new Float32Array(t1);
  const a2 = new Float32Array(t2);
  const uniforms: RiceUniforms = { uSeason: season, uFocus: { value: new Vector3(0, -1e4, 0) } };
  const material = riceMaterial(uniforms);
  const meshes: Mesh[] = [];
  for (let k = 0; k + 1 < starts.length; k++) {
    const [i0, i1] = [starts[k], starts[k + 1]];
    if (i1 <= i0) continue;
    const geo = new InstancedBufferGeometry();
    geo.setIndex(shape.index);
    geo.setAttribute('position', shape.getAttribute('position'));
    geo.setAttribute('normal', shape.getAttribute('normal'));
    geo.setAttribute('aT0', new InstancedBufferAttribute(a0.subarray(i0 * 4, i1 * 4), 4));
    geo.setAttribute('aT1', new InstancedBufferAttribute(a1.subarray(i0 * 4, i1 * 4), 4));
    geo.setAttribute('aT2', new InstancedBufferAttribute(a2.subarray(i0 * 4, i1 * 4), 4));
    geo.instanceCount = i1 - i0;
    // (bounds: every foot, and a tuft's height)
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = i0; i < i1; i++) {
      x0 = Math.min(x0, t0[i * 4]);
      x1 = Math.max(x1, t0[i * 4]);
      y0 = Math.min(y0, t0[i * 4 + 1]);
      y1 = Math.max(y1, t0[i * 4 + 1] + 1.3);
      z0 = Math.min(z0, t0[i * 4 + 2]);
      z1 = Math.max(z1, t0[i * 4 + 2]);
    }
    geo.boundingSphere = new Sphere(new Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 1.5);
    const mesh = new Mesh(geo, material);
    mesh.name = 'paddies:rice';
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    meshes.push(mesh);
  }
  return { meshes, uniforms, count };
}
