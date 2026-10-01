import { BufferAttribute, DataTexture, DoubleSide, DynamicDrawUsage, FloatType, Frustum, InstancedBufferAttribute, InstancedBufferGeometry, MathUtils, Matrix4, Mesh, MeshStandardMaterial, NearestFilter, RGBAFormat, Sphere, Vector3, Vector4, type Camera, type PerspectiveCamera, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { hash3 } from '../../voxel/random';
import { graphicsNow } from '../graphics';
import { fbm, SURFACE, type HeightField } from '../heightfield';
import type { GraphicsLevel, MapFrame } from '../types';
import { SWAY, SWAY_GLSL } from '../veg/sway';
import { RICE_COLOR_GLSL, riceColorUniforms, sweepOrder } from './ground';
import { NURSERY, NURSERY_W, plotAt, plotSeason, STAGE_GLSL, SWEEP, type PlotPlan } from './stages';

/**
 * The rice, thin like real rice: one hill per planting spot, in rows (as the
 * farmers plant it), posed in the vertex shader from the plot's stage on the
 * season: seedlings standing in the water, growing to knee–hip high and deep
 * green, heads coming out, turning gold and bending over heavy, cut in a
 * sweep across the plot to short straw stubble, which greys and is grazed
 * away in the dry season. The nursery bed (one plot's corner) grows dense
 * seedlings first and is pulled for planting out.
 *
 * A hill is drawn three ways by its distance from the camera (`NEAR`, by
 * graphics level), each blending into the next over a few metres:
 *  - near, a clump of thin leaf blades (flat strips 2–3 cm wide, each arching
 *    out from the foot its own way: the inner ones upright and long, the
 *    outer ones leaning out and curling over) and thin heads (panicles) that
 *    come out above the leaves, arch over as the grain fills and go gold
 *    (beaded grain up close); the phone level has fewer blades and a shorter
 *    reach;
 *  - farther, a fan of three broad blades from one foot standing for the
 *    clump;
 *  - far off, the hills thin out: every other one (a checkerboard) goes and
 *    the rest broaden, and on the low level every other one again farther
 *    still (`sparse`, `sparse2`).
 * Two draws for all the rice: the near clumps, and the fans of every plot.
 * Every hill's numbers sit in one float texture (three texels a hill, cell
 * by cell, `CELL`); each draw is a list of hill numbers, the hills of the
 * cells in view and in season (a cell far off lists only the hills it keeps
 * there), written again only when the cells change. The fans' shader is the
 * clumps' without the leaf and head code and without `discard` (the GPU
 * shades only the blade in front, and the floor hidden under it not at all).
 * The shapes follow the stage (`Stage`): heads only while they are out, one
 * triangle a straw stub after the cut. Blades are at least about a pixel
 * wide however far (thinner ones would break up into sparkles), and lit as
 * thin leaves (the face toward the key light). Between the blades and from
 * afar the plot's floor takes the rice's colour (ground.ts), so the field
 * reads as one soft carpet.
 *
 * The wind: the jungle's sway (veg/sway.ts: a calm rock, a lean downwind)
 * plus waves running across the field with the wind, the bent tips lighter,
 * each blade fluttering a little of its own, the heavy heads swinging more.
 * The explorer parts the rice as he wades through (pushed aside and down).
 * Up close to the camera the blades dissolve in a dither (no view through a
 * leaf). Check with `season=` (0.09 nursery · 0.25 young · 0.45 lush · 0.62
 * heads · 0.7 harvest · 0.8 stubble) and `graphics=low|max`, e.g.
 * `cam=-205,9.6,82.6,-205,8.2,90` (low over a plot's edge) or
 * `roam=walk&at=-212,92&yaw=270&rcam=90,15,4.5` (wading).
 */

/** Between rows, and between hills along a row (m). */
const ROW = 0.55;
const STEP = 0.42;
/** Hills keep this far from a plot's edge (the dike's wall), m. */
const MARGIN = 0.3;
/** The nursery bed's seedlings: a dense grid (m). */
const BED_STEP = 0.3;
/** Hills are grouped in cells this big (m): what is drawn is picked cell by cell. */
const CELL = 3.5;
/** Hills a row of the hills' texture (three texels each: `aT0`, `aT1`, `aT2`). */
const TEX_ROW = 512;

/**
 * By graphics level: blades and heads of a near clump, how near to the camera (m) hills are clumps, from how far
 * (m) every other hill is left out (a checkerboard; the rest broader), and from how far every other one again.
 */
const NEAR: Record<GraphicsLevel, { blades: number; heads: number; reach: number; sparse: number; sparse2: number }> = {
  low: { blades: 5, heads: 2, reach: 16, sparse: 40, sparse2: 70 },
  medium: { blades: 8, heads: 3, reach: 24, sparse: 60, sparse2: 1e5 },
  high: { blades: 8, heads: 3, reach: 24, sparse: 60, sparse2: 1e5 },
  max: { blades: 8, heads: 3, reach: 36, sparse: 90, sparse2: 1e5 },
};
/** Clumps and fans blend over this band (m) short of the reach. */
const BAND = 5;
/** Far off, the hills kept broaden this much at each step of thinning. */
const BROADEN = 1.6;
/** Kinds of strip (the vertex shader poses each its own way). */
const KIND = { fan: 0, blade: 1, head: 2 };
/**
 * Where along a strip its rows of vertices are (0 foot … 1 tip): a fan blade, a leaf blade, a head (a thin neck,
 * then the grain), a straw stub (straight: one triangle).
 */
const ROWS = { fan: [0, 0.5, 1], blade: [0, 1 / 3, 2 / 3, 1], head: [0, 0.25, 0.5, 0.75, 1], stub: [0, 1] };

/**
 * What a plot's rice needs drawn now: `heads` (out above the leaves, till the
 * cut), `leaves` (growing, no heads yet), `stubs` (all cut: straight straw
 * stubs, a triangle each). The shapes follow, so a clump costs its heads'
 * triangles only while they show.
 */
type Stage = 'heads' | 'leaves' | 'stubs';
const STAGES: Stage[] = ['stubs', 'leaves', 'heads'];
/** A plot's stage at its own season `s` (a hill is cut by the plot's `cut` + `SWEEP` and its short ramp). */
const stageOf = (pl: PlotPlan, s: number): Stage => (s >= pl.cut + SWEEP + 0.004 ? 'stubs' : s >= 0.49 ? 'heads' : 'leaves');

export interface RiceUniforms {
  uSeason: { value: number };
  /** His feet while roaming (far away in the overview). */
  uFocus: { value: Vector3 };
  /** How near to the camera hills are clumps (m). */
  uNear: { value: number };
  /** Every other hill gone from this far (m), and every other one of the rest from this far. */
  uSparse: { value: number };
  uSparse2: { value: number };
  /** A pixel's size (m) 1 m in front of the camera. */
  uPx: { value: number };
  /** Toward the key light, the sun or the moon (`f.lightDir`). */
  uRcLight: { value: Vector3 };
  /** Every hill's numbers (`aT0`, `aT1`, `aT2`: three texels a hill, `TEX_ROW` hills a row). */
  uRcHills: { value: DataTexture };
}

/**
 * Strips of one kind (`n` of them: a pair of vertices at each row up the
 * strip, one at its tip). Per vertex `position` = (side −1‥1, along 0‥1, 0),
 * `aBlade` = (kind, its number in the hill, 0 inner … 1 outer).
 */
function addStrips(pos: number[], blade: number[], idx: number[], kind: number, n: number, rows: number[]): void {
  for (let b = 0; b < n; b++) {
    const v0 = pos.length / 3;
    for (let j = 0; j < rows.length; j++)
      for (const side of j === rows.length - 1 ? [0] : [-1, 1]) {
        pos.push(side, rows[j], 0);
        blade.push(kind, b, n > 1 ? b / (n - 1) : 0.5);
      }
    for (let j = 0; j + 1 < rows.length; j++) {
      const a = v0 + j * 2;
      if (j + 2 < rows.length) idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
      else idx.push(a, a + 1, a + 2);
    }
  }
}

interface Shape {
  index: BufferAttribute;
  position: BufferAttribute;
  /** (not read: the shader makes the normals; without one three would shade the strips flat) */
  normal: BufferAttribute;
  aBlade: BufferAttribute;
  /** Triangles in one hill. */
  tris: number;
}

function shape(...strips: [kind: number, n: number, rows: number[]][]): Shape {
  const pos: number[] = [];
  const blade: number[] = [];
  const idx: number[] = [];
  for (const [kind, n, rows] of strips) addStrips(pos, blade, idx, kind, n, rows);
  const normal = new BufferAttribute(new Float32Array(pos.length), 3);
  return { index: new BufferAttribute(new Uint16Array(idx), 1), position: new BufferAttribute(new Float32Array(pos), 3), normal, aBlade: new BufferAttribute(new Float32Array(blade), 3), tris: idx.length / 3 };
}

/**
 * The far fan: three broad blades from one foot (a vertex they share: a pair halfway up each and its tip), three
 * stubs after the cut (a triangle each).
 */
function fanShape(stage: Stage): Shape {
  if (stage === 'stubs') return shape([KIND.fan, 3, ROWS.stub]);
  const pos: number[] = [0, 0, 0];
  const blade: number[] = [KIND.fan, 1, 0.5];
  const idx: number[] = [];
  for (let b = 0; b < 3; b++) {
    const v = pos.length / 3;
    pos.push(-1, ROWS.fan[1], 0, 1, ROWS.fan[1], 0, 0, 1, 0);
    blade.push(KIND.fan, b, b / 2, KIND.fan, b, b / 2, KIND.fan, b, b / 2);
    // (wound as the strips are: a blade's face is the same side, for anything that reads it, as the snow does)
    idx.push(0, v + 1, v, v, v + 1, v + 2);
  }
  return { index: new BufferAttribute(new Uint16Array(idx), 1), position: new BufferAttribute(new Float32Array(pos), 3), normal: new BufferAttribute(new Float32Array(pos.length), 3), aBlade: new BufferAttribute(new Float32Array(blade), 3), tris: idx.length / 3 };
}

/** The near clump of a graphics level: its blades (straight stubs after the cut), and its heads while they are out. */
function clumpShape(level: GraphicsLevel, stage: Stage): Shape {
  const { blades, heads } = NEAR[level];
  if (stage === 'stubs') return shape([KIND.blade, blades, ROWS.stub]);
  if (stage === 'leaves') return shape([KIND.blade, blades, ROWS.blade]);
  return shape([KIND.blade, blades, ROWS.blade], [KIND.head, heads, ROWS.head]);
}

/** Give a geometry a shape (the same instances: only the shared strips change). */
function useShape(geo: InstancedBufferGeometry, sh: Shape): void {
  geo.setIndex(sh.index);
  geo.setAttribute('position', sh.position);
  geo.setAttribute('normal', sh.normal);
  geo.setAttribute('aBlade', sh.aBlade);
}

const VERTEX_PARS = /* glsl */ `
attribute float aHill;
attribute vec3 aBlade;
uniform sampler2D uRcHills;
uniform float uSeason;
uniform vec3 uFocus;
uniform float uNear;
uniform float uSparse;
uniform float uSparse2;
uniform float uPx;
uniform vec3 uRcLight;
varying vec3 vRiceCol;
varying vec2 vRcHead;
${STAGE_GLSL}
${SWAY_GLSL}
${RICE_COLOR_GLSL}
// An arc from its foot, leaning 'lean' from upright there and turning 'curl' more along its length L: (out, up) at t (0‥1).
vec2 rcArc(float lean, float curl, float L, float t) {
  float c = max(curl, 0.02);
  return L / c * vec2(cos(lean) - cos(lean + c * t), sin(lean + c * t) - sin(lean));
}`;

/**
 * Per vertex, in world space (the mesh stays at the origin). The hill
 * (`aHill`, its number) is three texels of `uRcHills`: `aT0` = foot
 * (x, y, z), turn; `aT1` = plot lag, planted, cut (plot-local season), a
 * random 0‥1; `aT2` = nursery seedling (1) or rice (0), + 2 × how soon it
 * thins out far off (0 kept, 1 gone past `uSparse2`, 2 gone past `uSparse`),
 * size, the way its heads bend (radians), and when a nursery seedling is
 * pulled (rice: its patch's colour, ×). The shape (`position`, `aBlade`) is a
 * strip of a fan, a leaf blade or a head; `RC_FAN` (the fans' program) has
 * fans only.
 */
const VERTEX = /* glsl */ `
vec3 rcPos;
vec3 objectNormal;
{
  int rcI = int(aHill + 0.5);
  ivec2 rcT = ivec2((rcI % ${TEX_ROW}) * 3, rcI / ${TEX_ROW});
  vec4 aT0 = texelFetch(uRcHills, rcT, 0);
  vec4 aT1 = texelFetch(uRcHills, rcT + ivec2(1, 0), 0);
  vec4 aT2 = texelFetch(uRcHills, rcT + ivec2(2, 0), 0);
  float s = fract(uSeason - aT1.x);
  float rnd = aT1.w;
  float k = aT2.y;
  float g = smoothstep(aT1.y, aT1.y + 0.3, s);
  float planted = smoothstep(aT1.y, aT1.y + 0.006, s);
  float cutT = smoothstep(aT1.z, aT1.z + 0.003, s);
  float gone = smoothstep(0.9 + 0.07 * rnd, 0.93 + 0.07 * rnd, s);
  float H = mix(mix(0.3, 1.05, g), 0.12 + 0.08 * rnd, cutT) * k;
  float show = planted * (1.0 - gone);
  float droop = pdDroop(s) * (1.0 - cutT);
  // (the heads come out of the leaves, and arch over as their grain fills)
  float heading = smoothstep(0.5, 0.58, s) * (1.0 - cutT);
  float fill = smoothstep(0.54, 0.66, s) * (1.0 - cutT);
  // (young leaves are narrow)
  float slim = mix(0.55, 1.0, g);
  vec3 stubble = pdStubbleCol(max(s - aT1.z - 0.02, 0.0));
  float seedling = 0.0;
  if (mod(aT2.x, 2.0) > 0.5) {
    // A nursery seedling: sown early, dense and bright, pulled for planting out.
    seedling = 1.0;
    H = mix(0.06, 0.34, smoothstep(0.065, 0.11, s)) * k;
    show = smoothstep(0.062, 0.072, s) * (1.0 - smoothstep(aT2.w, aT2.w + 0.003, s));
    // (sown thick: a little spread, so the bed reads as one bright carpet)
    g = 0.35;
    cutT = 0.0;
    droop = 0.0;
    heading = 0.0;
    fill = 0.0;
    slim = 0.7;
  }
  H *= show;
  vec3 foot = aT0.xyz;
#ifdef RC_FAN
  const float kind = 0.0;
#else
  float kind = aBlade.x;
#endif
  float bi = aBlade.y;
  float outer = aBlade.z;
  float t = position.y;
#ifdef RC_FAN
  // (a fan blade cut: its middle pair goes down to the foot, a stub broad at its foot like the stubs' own triangle)
  t *= 1.0 - cutT * step(t, 0.99);
#endif
  // Near the camera a clump of blades and heads, farther the fan (they blend short of the reach).
  float camD = distance(foot, cameraPosition);
  float clump = 1.0 - smoothstep(uNear - ${BAND.toFixed(1)}, uNear, camD);
  float lod = kind < 0.5 ? 1.0 - clump : clump;
  // (each blade its own: which way, how far it leans and curls, how long and wide)
  float h1 = fract(rnd * 13.71 + bi * 0.618034);
  float h2 = fract(rnd * 29.37 + bi * 0.414214);
  float h3 = fract(rnd * 47.93 + bi * 0.732051);
  float az = aT0.w + bi * 2.39996 + (h1 - 0.5) * 0.6;
  float lean = 0.0;
  float curl = 0.0;
  float L = 0.0;
  float w = 0.0;
  float isHead = step(1.5, kind);
  // (a head's thin neck ends here along it, then the grain)
  float tn = ${ROWS.head[1].toFixed(2)};
  vec2 arc = vec2(0.0);
  float ang = 0.0;
  if (kind < 0.5) {
    // A fan blade: broad, standing for a third of the clump; the heads' gold at its tip, bending over with them.
    az = aT0.w + bi * 2.0944 + (h1 - 0.5) * 0.5;
    lean = mix(0.1, 0.38, g) + 0.1 * h2;
    curl = mix(0.2, 0.7, g) + fill * 0.3 + droop * 0.5;
    L = H * (0.95 + 0.1 * h3);
    w = mix(0.03, 0.1, g) * mix(1.0, 0.5, seedling);
  }
#ifndef RC_FAN
  else if (kind < 1.5) {
    // A leaf blade: the inner ones upright and long, the outer ones leaning out and curling over.
    lean = mix(0.04, 0.55, outer) * mix(0.5, 1.0, g) + (h2 - 0.5) * 0.14 + droop * 0.1;
    curl = mix(0.3, 1.35, 0.7 * outer + 0.3 * h3) * mix(0.35, 1.0, g) + droop * 0.35;
    L = H * mix(1.1, 0.72, outer) * (0.9 + 0.2 * h3);
    w = mix(0.017, 0.027, h1) * slim;
  } else {
    // A head: its stalk rises through the leaves (hidden), the strip is its thin neck and then the grain, arching over as it fills.
    az = aT2.z + (bi - 1.0) * 0.9 + (h1 - 0.5) * 0.5;
    lean = 0.08 + 0.14 * h2;
    float cS = 0.18;
    float Ls = H * mix(0.6, 0.98, heading);
    float Lh = H * 0.3 * heading;
    float cH = mix(0.4, 1.5, fill) + droop * 0.9 + 0.35 * h3;
    arc = t < tn ? rcArc(lean, cS, Ls, 0.8 + 0.2 * t / tn) : rcArc(lean, cS, Ls, 1.0) + rcArc(lean + cS, cH, Lh, (t - tn) / (1.0 - tn));
    ang = t < tn ? lean + cS * (0.8 + 0.2 * t / tn) : lean + cS + cH * (t - tn) / (1.0 - tn);
    w = (t < tn * 0.5 ? 0.006 : mix(0.036, 0.048, h3) * (1.0 - 0.3 * smoothstep(0.5, 0.9, t))) * heading;
  }
#endif
  // Cut: short straight straw stubs.
  if (kind < 1.5) {
    lean = mix(lean, 0.05 + 0.3 * h2, cutT);
    curl = mix(curl, 0.0, cutT);
    L = mix(L, H, cutT);
    // (a stub is one triangle, broad at its foot)
    w = mix(w, kind < 0.5 ? 0.05 : 0.024, cutT);
    arc = rcArc(lean, curl, L, t);
    ang = lean + curl * t;
  } else w *= 1.0 - cutT;
  vec2 dir = vec2(cos(az), sin(az));
  vec3 side = vec3(-dir.y, 0.0, dir.x);
  // (at least about a pixel wide; a little narrower at the foot, and a leaf widest a third of the way up)
  float prof = kind < 1.5 ? mix(mix(0.7, 1.0, smoothstep(0.0, 0.34, t)), 1.0, cutT) : 1.0;
  float fanK = step(kind, 0.5);
  float width = max(w * prof, uPx * camD * mix(0.9, 1.2, fanK)) * lod * step(0.001, w * show);
  // (far off the hills thin out, every other one and then every other again, and the rest broaden)
  float rank = floor(aT2.x * 0.5);
  float thin1 = smoothstep(uSparse * 0.75, uSparse, camD);
  float thin2 = smoothstep(uSparse2 * 0.75, uSparse2, camD);
  float keep = rank > 1.5 ? 1.0 - thin1 : mix(1.0, ${BROADEN.toFixed(2)}, thin1) * (rank > 0.5 ? 1.0 - thin2 : mix(1.0, ${BROADEN.toFixed(2)}, thin2));
  width *= mix(1.0, keep, fanK);
#ifdef RC_FAN
  // (a fan's stub is one triangle whichever shape draws it: narrowing to its tip)
  width *= 1.0 - cutT * t;
#endif
  vec3 P = foot + vec3(dir.x * arc.x, arc.y, dir.y * arc.x) + side * position.x * width * 0.5;
  // The wind: the land's sway, and waves running across the field downwind.
  vec2 sw = swayAt(foot) * 1.4;
  float along = dot(foot.xz, uSwayDir);
  float acrossW = dot(foot.xz, vec2(-uSwayDir.y, uSwayDir.x));
  float wave = 0.5 + 0.5 * sin(along * 0.45 - uSwayTime * 2.1 + 0.8 * sin(acrossW * 0.08));
  float group = 0.5 + 0.5 * sin(along * 0.06 - uSwayTime * 0.5 + acrossW * 0.03);
  float bendW = uSwayWind * wave * wave * (0.35 + 0.65 * group);
  sw += uSwayDir * bendW * 0.7;
  // Him wading through: the rice parts round his legs, pushed aside and down.
  float fd = distance(foot.xz, uFocus.xz);
  float nearHim = (1.0 - smoothstep(0.45, 1.8, fd)) * (1.0 - step(1.5, abs(foot.y - uFocus.y)));
  vec2 away = (foot.xz - uFocus.xz) / max(fd, 0.05) * nearHim;
  float hf = clamp((P.y - foot.y) / max(H, 0.05), 0.0, 1.3);
  float c2 = hf * hf;
  float stiff = 1.0 - 0.85 * cutT;
  // (a little lean of the hill's own, so the rows are not ruled; the heavy heads swing more)
  vec2 ld = vec2(cos(aT2.z), sin(aT2.z));
  P.xz += (sw * stiff * (1.0 + 0.5 * isHead) + ld * (0.05 + 0.06 * rnd)) * c2 * H;
  P.y -= (length(sw) * 0.2 + nearHim * 0.45) * stiff * c2 * H;
  P.xz += away * 1.1 * stiff * hf * H;
  // (and each blade flutters a little of its own)
  P += side * sin(uSwayTime * 2.7 + bi * 1.9 + rnd * 6.283) * (0.01 + 0.03 * uSwayWind) * t * t * H * stiff;
  rcPos = P;
  // Lit soft: the blade's face turned up (and round across it). A leaf is thin: the light comes through it, so the
  // face it shows the light is lit, a little dimmer when that is its back (no blade dark for leaning the wrong way).
  vec3 face = vec3(-dir.x * cos(ang), sin(ang), -dir.y * cos(ang));
  float through = step(dot(face, uRcLight), 0.0);
  face *= 1.0 - 2.0 * through;
  objectNormal = normalize(face + vec3(0.0, 0.4, 0.0) + side * position.x * 0.35);
  vec3 col;
  // (a fan stands for a whole clump: from afar mostly its sunlit top shows, so it is coloured and shaded more like that)
  float fanK2 = step(kind, 0.5);
  if (kind < 1.5) {
    // (up the blade from its foot to its tip, however it bends: a drooping tip keeps its colour)
    col = mix(pdRiceCol(sqrt(mix(t, 0.5 + 0.5 * t, fanK2)), g, s) * aT2.w, stubble, cutT);
    col = mix(col, uSeedling * mix(0.75, 1.1, t), seedling);
    // (blade to blade a shade lighter or darker, the outer, older leaves a little duller; a fan carries its heads' gold)
    col *= mix(0.9 + 0.2 * h3 - 0.1 * outer, 1.0, step(kind, 0.5));
    col = mix(col, uRipeHead * 1.12, pdRipe(s) * (1.0 - cutT) * 0.5 * t * step(kind, 0.5));
  } else {
    // (the neck green-gold, the grain green, then gold as it ripens)
    vec3 grain = mix(uGreenTip * 1.1, uRipeHead * 1.12, pdRipe(s));
    col = mix(pdRiceCol(0.9, g, s), grain, step(tn, t));
  }
  // (the foot in the others' shade; tips lighter where the wind bends them)
  col *= 1.0 - 0.12 * through;
  col *= (0.88 + 0.24 * rnd) * mix(mix(0.6, 0.75, fanK2), 1.0, max(min(hf, 1.0), t)) * (1.0 + 0.6 * bendW * c2);
  vRiceCol = col;
  // (along a head's grain, and across it)
  vRcHead = isHead * step(tn, t) > 0.5 ? vec2((t - tn) / (1.0 - tn), position.x) : vec2(-1.0, 0.0);
}`;

/** Close to the camera, blades dissolve in a fine dither (as the undergrowth does); none of it in the fans' program. */
const FRAGMENT = /* glsl */ `
#ifndef RC_FAN
{
  float rcCam = length(vViewPosition);
  vec2 rcA = floor(gl_FragCoord.xy);
  vec2 rcA2 = floor(0.5 * gl_FragCoord.xy);
  float rcDither = fract(rcA2.x * 0.5 + rcA2.y * rcA2.y * 0.75) * 0.25 + fract(rcA.x * 0.5 + rcA.y * rcA.y * 0.75);
  if (rcCam < 1.6 && smoothstep(0.4, 1.6, rcCam) < rcDither) discard;
  // A head's grains up close: beads along it (its edge notched between them), darker between them and at its edges.
  if (vRcHead.x >= 0.0) {
    float bead = abs(fract(vRcHead.x * 7.0) - 0.5) * 2.0;
    float close = 1.0 - smoothstep(5.0, 16.0, rcCam);
    if (abs(vRcHead.y) > 1.0 - 0.45 * bead * bead * close) discard;
    diffuseColor.rgb *= mix(1.0, 0.8 + 0.32 * (1.0 - bead * bead) - 0.3 * vRcHead.y * vRcHead.y, close);
  }
}
#endif`;

/** The rice's material: the near clumps', or with `fan` the fans' (their own program: `RC_FAN`). */
function riceMaterial(u: RiceUniforms, fan: boolean): MeshStandardMaterial {
  const rice = riceColorUniforms();
  // (both sides of a blade drawn, lit alike)
  const m = new MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: DoubleSide });
  m.name = fan ? 'paddies:rice-fans' : 'paddies:rice';
  if (fan) m.defines = { RC_FAN: '' };
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, SWAY, u, rice);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <beginnormal_vertex>', VERTEX)
      .replace('#include <begin_vertex>', 'vec3 transformed = rcPos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRiceCol;\nvarying vec2 vRcHead;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FRAGMENT}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vRiceCol;')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
      // (matte like the map's leaf blocks, a faint sheen)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.directSpecular *= 0.25;\nreflectedLight.indirectSpecular *= 0.0;');
  };
  m.customProgramCacheKey = () => (fan ? 'map-paddies-rice-fans-v3' : 'map-paddies-rice-v3');
  return m;
}

/**
 * A cell of hills: its plot, its hills (`i0` ‥ `i1`, those kept farthest first: `i0` ‥ `k0` kept however far,
 * ‥ `k1` gone past `sparse2`, ‥ `i1` gone past `sparse`), the sphere round them.
 */
interface Cell {
  plot: number;
  /** The nursery bed's seedlings (else rows of rice). */
  bed: boolean;
  i0: number;
  k0: number;
  k1: number;
  i1: number;
  c: Vector3;
  r: number;
}

/** A sphere round hills `i0` ‥ `i1` (feet, `aT0` of each: 12 numbers a hill), their blades and their arching tips. */
function sphereOf(data: Float32Array, i0: number, i1: number): Sphere {
  let [x0, x1, y0, y1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (let i = i0; i < i1; i++) {
    const o = texelOf(i);
    x0 = Math.min(x0, data[o]);
    x1 = Math.max(x1, data[o]);
    y0 = Math.min(y0, data[o + 1]);
    y1 = Math.max(y1, data[o + 1] + 1.4);
    z0 = Math.min(z0, data[o + 2]);
    z1 = Math.max(z1, data[o + 2]);
  }
  return new Sphere(new Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 0.8);
}

/** Where hill `i`'s first texel starts in the hills' texture data (floats). */
export const texelOf = (i: number): number => (Math.floor(i / TEX_ROW) * TEX_ROW * 3 + (i % TEX_ROW) * 3) * 4;

/**
 * The hills for helping the farmers (roam/_farmWork.ts): the explorer plants and cuts a few where he works, by
 * rewriting their planting or cutting day (`aT1.y`, `aT1.z`, plot-local season) in `data` at `texelOf(i)` and
 * uploading those texels (`tex`). `early[plot]` 1: that plot's rows are drawn before its own planting begins (his
 * first clumps in a plot the farmers are just starting). Set when the rice is built.
 */
export const RICE_HILLS: { data: Float32Array | null; tex: DataTexture | null; count: number; early: Uint8Array } = { data: null, tex: null, count: 0, early: new Uint8Array(32) };

export interface Rice {
  /** The fans (every plot's, one mesh) and the near clumps (one mesh). */
  meshes: Mesh[];
  uniforms: RiceUniforms;
  /** Hills (and nursery seedlings). */
  count: number;
  /** Draws at most in a frame. */
  draws: number;
  /** For the build's log line: the shapes and reaches of the graphics level now. */
  summary: string;
  /** Every frame: which hills are clumps and which fans (the cells in view and in season). */
  update(f: MapFrame): void;
}

/** Plant every plot: rows of hills, and the nursery bed's seedlings. */
export function buildRice(field: HeightField, plots: PlotPlan[], season: { value: number }): Rice {
  /** Per hill: aT0, aT1, aT2 (see `VERTEX`), grouped by plot, then by cell (those kept farthest first). */
  const hills: number[][] = [];
  const cellsOf: { plot: number; bed: boolean; hills: number[][] }[] = [];
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
  /**
   * How soon a hill thins out far off, by its place in the rows: the checkerboard's other half first, then every
   * other one of the rest, picked at random (a regular grid would show as one far off).
   */
  const rankOf = (i: number, j: number, seed: number) => ((i + j) % 2 ? 2 : hash3(i, j, seed, 5513) < 0.5 ? 1 : 0);
  for (const pl of plots) {
    const p = pl.paddy;
    /** This plot's cells (key: column and row of the cell, and 1 for the nursery bed's). */
    const cells = new Map<number, number[][]>();
    const put = (x: number, z: number, bed: boolean, hill: number[]) => {
      const key = ((Math.floor(x / CELL) + 4096) * 8192 + Math.floor(z / CELL) + 4096) * 2 + (bed ? 1 : 0);
      let c = cells.get(key);
      if (!c) cells.set(key, (c = []));
      c.push(hill);
    };
    const cs = Math.cos(p.rot);
    const sn = Math.sin(p.rot);
    // Rows across the plot's local axes (u along the rows, v across them).
    const [lu, lv] = pl.rowsX ? [p.w, p.d] : [p.d, p.w];
    const rows = Math.floor((lv - 2 * MARGIN) / ROW);
    const count = Math.floor((lu - 2 * MARGIN) / STEP);
    const v0 = -((rows - 1) * ROW) / 2;
    const u0 = -((count - 1) * STEP) / 2;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < count; i++) {
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
        // (patches a little lusher or paler, plot by plot and across a plot)
        const patch = 0.86 + 0.28 * fbm(x / 11, z / 11, 5503) + (hash3(pl.index, 9, 9, 5509) - 0.5) * 0.08;
        put(x, z, false, [
          x,
          y,
          z,
          (pl.rowsX ? 0 : Math.PI / 2) + (r(4) - 0.5) * 0.5,
          pl.lag,
          pl.plant + order * SWEEP + r(5) * 0.002,
          pl.cut + cutOrder * SWEEP,
          r(6),
          2 * rankOf(i, j, pl.index),
          (0.86 + 0.28 * r(7)) * (0.94 + 0.12 * patch - 0.06),
          r(8) * Math.PI * 2,
          patch,
        ]);
      }
    if (pl.index === NURSERY)
      // The nursery bed: a strip along the plot's east side, dense seedlings, pulled just before this plot's planting.
      for (let b = 0, z = p.z - p.d / 2 + MARGIN; z <= p.z + p.d / 2 - MARGIN; b++, z += BED_STEP)
        for (let a = 0, x = p.x + p.w / 2 - NURSERY_W + MARGIN; x <= p.x + p.w / 2 - MARGIN; a++, x += BED_STEP) {
          const r = (k: number) => hash3(Math.round(x * 10), Math.round(z * 10), k, 5507);
          const jx = x + (r(1) - 0.5) * 0.12;
          const jz = z + (r(2) - 0.5) * 0.12;
          if (!inPlot(pl.index, jx, jz, MARGIN)) continue;
          put(jx, jz, true, [jx, field.heightAt(jx, jz), jz, r(3) * Math.PI, pl.lag, 2, 2, r(4), 1 + 2 * rankOf(a, b, 99), 0.8 + 0.4 * r(5), 0, pl.plant - 0.014 + r(6) * 0.014]);
        }
    for (const [key, list] of cells) {
      // (those kept farthest first: a cell far off draws only its first ones)
      list.sort((a, b) => a[8] - b[8]);
      cellsOf.push({ plot: pl.index, bed: key % 2 === 1, hills: list });
      hills.push(...list);
    }
  }
  const count = hills.length;
  // Every hill's numbers: three texels in a row of the texture (`TEX_ROW` hills a row).
  const texRows = Math.max(1, Math.ceil(count / TEX_ROW));
  const data = new Float32Array(TEX_ROW * 3 * texRows * 4);
  hills.forEach((h, i) => data.set(h, texelOf(i)));
  const hillTex = new DataTexture(data, TEX_ROW * 3, texRows, RGBAFormat, FloatType);
  hillTex.minFilter = hillTex.magFilter = NearestFilter;
  hillTex.generateMipmaps = false;
  hillTex.needsUpdate = true;
  Object.assign(RICE_HILLS, { data, tex: hillTex, count });

  const cells: Cell[] = [];
  /** Each plot's cells, and the sphere round its hills. */
  const cellsFrom = plots.map(() => 0);
  const cellsTo = plots.map(() => 0);
  const plotBall: (Sphere | null)[] = plots.map(() => null);
  let at = 0;
  for (let ci = 0; ci < cellsOf.length; ci++) {
    const c = cellsOf[ci];
    if (ci === 0 || cellsOf[ci - 1].plot !== c.plot) cellsFrom[c.plot] = cells.length;
    const n = c.hills.length;
    const ranked = (rank: number) => c.hills.filter((h) => h[8] >= 2 * rank).length;
    const s = sphereOf(data, at, at + n);
    cells.push({ plot: c.plot, bed: c.bed, i0: at, k0: at + n - ranked(1), k1: at + n - ranked(2), i1: at + n, c: s.center, r: s.radius });
    at += n;
    cellsTo[c.plot] = cells.length;
  }
  for (const pl of plots) if (cellsTo[pl.index] > cellsFrom[pl.index]) plotBall[pl.index] = sphereOf(data, cells[cellsFrom[pl.index]].i0, cells[cellsTo[pl.index] - 1].i1);

  const uniforms: RiceUniforms = {
    uSeason: season,
    uFocus: { value: new Vector3(0, -1e4, 0) },
    uNear: { value: NEAR.medium.reach },
    uSparse: { value: NEAR.medium.sparse },
    uSparse2: { value: NEAR.medium.sparse2 },
    uPx: { value: 0.001 },
    uRcLight: { value: new Vector3(0, 1, 0) },
    uRcHills: { value: hillTex },
  };
  // (a pixel's size, from the camera and the picture drawn now)
  const vp = new Vector4();
  const measurePixel = (renderer: WebGLRenderer, _scene: unknown, camera: Camera) => {
    const cam = camera as PerspectiveCamera;
    if (!cam.isPerspectiveCamera) return;
    renderer.getCurrentViewport(vp);
    uniforms.uPx.value = (2 * Math.tan(MathUtils.degToRad(cam.fov) / 2)) / cam.zoom / Math.max(1, vp.w);
  };

  /** A mesh drawing the hills listed in its `aHill` (none yet). */
  const listMesh = (name: string, sh: Shape, fan: boolean) => {
    const geo = new InstancedBufferGeometry();
    useShape(geo, sh);
    const ids = new InstancedBufferAttribute(new Float32Array(count), 1).setUsage(DynamicDrawUsage);
    geo.setAttribute('aHill', ids);
    geo.instanceCount = 0;
    geo.boundingSphere = new Sphere(new Vector3(), 1);
    const mesh = new Mesh(geo, riceMaterial(uniforms, fan));
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.onBeforeRender = measurePixel;
    mesh.visible = false;
    return { mesh, geo, ids, shown: [] as number[], picked: [] as number[] };
  };

  // The fans: every plot's in one mesh (full, or stubs while every fan drawn is cut).
  const fanShapes = { full: fanShape('leaves'), stubs: fanShape('stubs') };
  const fans = listMesh('paddies:rice', fanShapes.full, true);
  let fansStubs = false;
  // The near clumps: one mesh, the shape of the graphics level and what the rice near the camera needs now.
  let level: GraphicsLevel = graphicsNow.level;
  let nearStage: Stage = 'heads';
  const clumps = new Map<string, Shape>();
  const clumpOf = (lv: GraphicsLevel, st: Stage): Shape => {
    const key = `${lv}:${st}`;
    let sh = clumps.get(key);
    if (!sh) clumps.set(key, (sh = clumpShape(lv, st)));
    return sh;
  };
  const near = listMesh('paddies:rice-near', clumpOf(level, nearStage), false);

  /** Write a mesh's hill list again from its cells picked (codes: cell × 4 + 0 all its hills, 1 those kept past `sparse`, 2 past `sparse2`), if they changed. */
  const write = (m: typeof near) => {
    const { picked, shown } = m;
    let same = picked.length === shown.length;
    for (let i = 0; same && i < picked.length; i++) same = picked[i] === shown[i];
    if (same) return;
    const ids = m.ids.array as Float32Array;
    let n = 0;
    let [x0, x1, y0, y1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    for (const code of picked) {
      const c = cells[code >> 2];
      const end = (code & 3) === 0 ? c.i1 : (code & 3) === 1 ? c.k1 : c.k0;
      for (let h = c.i0; h < end; h++) ids[n++] = h;
      x0 = Math.min(x0, c.c.x - c.r);
      x1 = Math.max(x1, c.c.x + c.r);
      y0 = Math.min(y0, c.c.y - c.r);
      y1 = Math.max(y1, c.c.y + c.r);
      z0 = Math.min(z0, c.c.z - c.r);
      z1 = Math.max(z1, c.c.z + c.r);
    }
    m.ids.clearUpdateRanges();
    m.ids.addUpdateRange(0, n);
    m.ids.needsUpdate = true;
    m.geo.instanceCount = n;
    if (n) {
      m.geo.boundingSphere!.center.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      m.geo.boundingSphere!.radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2;
    }
    m.picked = shown;
    m.shown = picked;
  };

  const eye = new Vector3();
  const frustum = new Frustum();
  const vpm = new Matrix4();
  /** The cells' spheres (x, y, z, r), flat. */
  const cellBall = new Float32Array(cells.length * 4);
  cells.forEach((c, i) => {
    cellBall[i * 4] = c.c.x;
    cellBall[i * 4 + 1] = c.c.y;
    cellBall[i * 4 + 2] = c.c.z;
    cellBall[i * 4 + 3] = c.r;
  });
  /** The view's planes this frame (normal x, y, z, constant), flat. */
  const planes = new Float32Array(24);
  /**
   * How a sphere lies to the view, kept a little past its edges (the cells change less often as the camera turns):
   * 0 out, 1 partly in, 2 wholly in. `d`: its distance from the camera (m).
   */
  const inView = (x: number, y: number, z: number, r: number, d: number): number => {
    const m = r + 1 + 0.05 * Math.max(0, d);
    let whole = 2;
    for (let k = 0; k < 24; k += 4) {
      const dist = planes[k] * x + planes[k + 1] * y + planes[k + 2] * z + planes[k + 3];
      if (dist < -m) return 0;
      if (dist < r) whole = 1;
    }
    return whole;
  };

  /** What the picking saw last: the camera (its matrix and projection), the graphics level, each plot's state (−1 out of season). */
  const seenCam = new Float32Array(32);
  let seenLevel: GraphicsLevel | null = null;
  const seenPlot = new Int8Array(plots.length);
  /** Anything the cells picked depend on changed since the last frame? (and remember it) */
  const changed = (f: MapFrame): boolean => {
    let diff = graphicsNow.level !== seenLevel;
    seenLevel = graphicsNow.level;
    const m = f.camera.matrixWorld.elements;
    const pr = f.camera.projectionMatrix.elements;
    for (let k = 0; k < 16; k++) {
      if (seenCam[k] !== Math.fround(m[k]) || seenCam[16 + k] !== Math.fround(pr[k])) diff = true;
      seenCam[k] = m[k];
      seenCam[16 + k] = pr[k];
    }
    for (const pl of plots) {
      const s = plotSeason(f.season, pl.lag);
      const rows = s >= pl.plant - 0.001 || RICE_HILLS.early[pl.index] === 1;
      const bed = pl.index === NURSERY && s >= 0.06 && s <= pl.plant + 0.002;
      const code = rows ? STAGES.indexOf(stageOf(pl, s)) * 2 + (bed ? 1 : 0) : bed ? 1 : -1;
      if (seenPlot[pl.index] !== code) diff = true;
      seenPlot[pl.index] = code;
    }
    return diff;
  };

  const update = (f: MapFrame) => {
    const { reach, sparse, sparse2 } = NEAR[graphicsNow.level];
    uniforms.uNear.value = reach;
    uniforms.uSparse.value = sparse;
    uniforms.uSparse2.value = sparse2;
    uniforms.uRcLight.value.copy(f.lightDir);
    // (the camera still, the plots as they were: the same cells)
    if (!changed(f)) return;
    const cam = f.camera;
    eye.setFromMatrixPosition(cam.matrixWorld);
    vpm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(vpm);
    for (let k = 0; k < 6; k++) {
      const pl = frustum.planes[k];
      planes[k * 4] = pl.normal.x;
      planes[k * 4 + 1] = pl.normal.y;
      planes[k * 4 + 2] = pl.normal.z;
      planes[k * 4 + 3] = pl.constant;
    }
    const ex = eye.x;
    const ey = eye.y;
    const ez = eye.z;
    near.picked.length = 0;
    fans.picked.length = 0;
    /** The most the near clumps and the fans need drawn (`STAGES` index; −1: nothing picked). */
    let needNear = -1;
    let needFans = -1;
    for (const pl of plots) {
      const pb = plotBall[pl.index];
      if (!pb) continue;
      // (in season: rows planted, or the nursery bed sown and not yet pulled)
      const s = plotSeason(f.season, pl.lag);
      const rows = s >= pl.plant - 0.001 || RICE_HILLS.early[pl.index] === 1;
      const bed = pl.index === NURSERY && s >= 0.06 && s <= pl.plant + 0.002;
      if (!(rows || bed)) continue;
      const dp = pb.center.distanceTo(eye);
      const seen = inView(pb.center.x, pb.center.y, pb.center.z, pb.radius, dp - pb.radius);
      if (!seen) continue;
      const stage = STAGES.indexOf(rows ? stageOf(pl, s) : 'leaves');
      // (a plot wholly in view and past the clumps, its cells all as far off as each other: all of them, no sums a cell)
      const dMin = dp - pb.radius - 1;
      const dMax = dp + pb.radius + 1;
      const code = dMin >= sparse2 ? 2 : dMin >= sparse && dMax < sparse2 ? 1 : dMax < sparse ? 0 : -1;
      if (seen === 2 && dMin > reach && code >= 0) {
        for (let i = cellsFrom[pl.index]; i < cellsTo[pl.index]; i++) {
          const c = cells[i];
          if (c.bed ? !bed : !rows) continue;
          fans.picked.push(i * 4 + code);
          needFans = Math.max(needFans, c.bed ? 1 : stage);
        }
        continue;
      }
      for (let i = cellsFrom[pl.index]; i < cellsTo[pl.index]; i++) {
        const c = cells[i];
        if (c.bed ? !bed : !rows) continue;
        const x = cellBall[i * 4];
        const y = cellBall[i * 4 + 1];
        const z = cellBall[i * 4 + 2];
        const r = cellBall[i * 4 + 3];
        const dc = Math.sqrt((x - ex) ** 2 + (y - ey) ** 2 + (z - ez) ** 2);
        const d = dc - r;
        // (a plot wholly in view: every cell of it too)
        if (seen === 1 && !inView(x, y, z, r, d)) continue;
        const st = c.bed ? 1 : stage;
        if (d < reach) {
          near.picked.push(i * 4);
          needNear = Math.max(needNear, st);
        }
        // (fans unless every hill of the cell is a whole clump; far off only the hills kept there)
        if (dc + r > reach - BAND) {
          fans.picked.push(i * 4 + (d >= sparse2 ? 2 : d >= sparse ? 1 : 0));
          needFans = Math.max(needFans, st);
        }
      }
    }
    // The clumps' shape: the graphics level's, with what the rice near the camera needs now; the fans' stubs while all are cut.
    const stage = needNear < 0 ? nearStage : STAGES[needNear];
    if (graphicsNow.level !== level || stage !== nearStage) {
      level = graphicsNow.level;
      nearStage = stage;
      useShape(near.geo, clumpOf(level, nearStage));
    }
    const stubs = needFans === 0;
    if (needFans >= 0 && stubs !== fansStubs) {
      fansStubs = stubs;
      useShape(fans.geo, stubs ? fanShapes.stubs : fanShapes.full);
    }
    write(near);
    write(fans);
    near.mesh.visible = near.geo.instanceCount > 0;
    fans.mesh.visible = fans.geo.instanceCount > 0;
  };

  const n = NEAR[level];
  const tris = STAGES.map((st) => clumpOf(level, st).tris).reverse();
  const summary = `clumps of ${n.blades} blades and ${n.heads} heads (${tris.join(' / ')} triangles with heads / leaves / stubble) to ${n.reach} m, fans (${fanShapes.full.tris} / ${fanShapes.stubs.tris}) past it, every other hill past ${n.sparse} m${n.sparse2 < 1e4 ? `, every other again past ${n.sparse2} m` : ''}, ${cells.length} cells`;
  return { meshes: [fans.mesh, near.mesh], uniforms, count, draws: 2, summary, update };
}
