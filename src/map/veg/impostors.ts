import {
  Box3,
  BoxGeometry,
  Color,
  DoubleSide,
  FramebufferTexture,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from 'three';
import { graphicsNow, PHONE, pixelSize } from '../graphics';
import type { MapFrame } from '../types';
import type { Proto } from './proto';

/**
 * Far trees as pictures on a phone (the low graphics level on a phone
 * screen, `phone=1`): where a far tree's blocks (the jungle's 2 m and 3 m
 * cells, vegetation.ts) are under {@link PICTURE_PX} pixels, its crown is
 * drawn as one camera-facing quad showing a picture of it, not as its
 * blocks. Everywhere else, and on every other level and screen, nothing
 * changes (nothing is even built).
 *
 * - The pictures: every far prototype's leaves (veg/proto.ts; the kinds and
 *   sizes the far trees are planted from), drawn at load from
 *   {@link AZIMUTHS} × {@link ELEVATIONS} directions into one atlas: per texel
 *   the leaf's colour as built (its baked shade and the family's grain),
 *   the side it shows and its depth. A tree picks the view nearest to how
 *   the camera sees it (its quarter turn and mirror undone: the prototypes
 *   are stamped turned and mirrored, veg/lattice.ts), and is shaded as the
 *   blocks are (the leaf family's light: the sun or the moon on the side each
 *   texel shows, the sky light, the still shadow map at the texel's point,
 *   the haze and fog steps, the snow). Its trunk and branches stay blocks
 *   (the jungle's bark chunks): they are drawn into the pictures as holes
 *   where they come in front of the leaves, and the quad stands at the front
 *   of the crown, so the real trunk shows where it should.
 * - The blocks: a tile's far leaves are the last instances of its leaf mesh
 *   (the low level puts a tile's near and far blocks in one mesh), so while
 *   a tile is drawn as pictures the picture pass draws only the instances
 *   before them (`count`, for the view camera only): no draw more, and no
 *   vertex work for them. The shadow passes, the snow's map from above and
 *   the bug report's picks still see every block: the trees keep casting the
 *   still shadows, and a pick names the block's code.
 * - The switch: per leaf tile, when its far blocks' nearest point is under
 *   {@link PICTURE_PX} px (the camera's field of view and the picture's
 *   pixels decide, `graphics.ts` `pixelSize`); the pictures fade in over
 *   {@link FADE} s (a dither) over the blocks, and only then are the blocks
 *   left out; back, the blocks come at once and the pictures fade out. A
 *   tree whose crown reaches into a tile still drawn as blocks keeps that
 *   tile's blocks too (no crown is ever cut).
 *
 * `imp=0` in the URL: no pictures (to compare); `imppx=<px>` another limit;
 * `impdbg=1` paints the pictures magenta (where they are).
 */

/** A tile's far trees become pictures once their blocks are under this many pixels across. */
export const PICTURE_PX = 1.5;
/** A tile goes to pictures this share under {@link PICTURE_PX}, and back over it: no flicker on the line. */
const HOLD = 0.06;
/** The cross-fade (s). */
const FADE = 0.4;
/** Views of a picture round the tree, and their heights over the horizon (degrees). */
const AZIMUTHS = 8;
const ELEVATIONS = [3, 15, 30];
/** A picture's texels across. */
const TILE = 24;
/** The quad stands this share of the crown's radius in front of its middle (in front of its trunk and branches). */
const FRONT = 0.85;

const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const PX_URL = (() => {
  const v = params.get('imppx');
  return v !== null && v !== '' && Number(v) > 0 ? Number(v) : null;
})();
/** Pictures for far trees: a phone (not `imp=0`). */
export const TREE_PICTURES = PHONE && params.get('imp') !== '0';

// ── The far trees as planted (in a build worker or on the page) ─────────────

/**
 * The far trees and their prototypes, as plain data (it comes from a build
 * worker as it is): per prototype its boxes, 9 numbers each (x, y, z, sx,
 * sy, sz: m, in the prototype's frame: the trunk's cell middle at 0, the
 * cell's floor at y 0; colour as an sRGB number; shade; 0 leaf, 1 bark);
 * per tree 8 numbers (the frame's origin x, y, z; prototype; quarter turns +
 * 4 if mirrored; the tree's shade; its cell size; 0).
 */
export interface FarTrees {
  protos: Float32Array[];
  trees: Float32Array;
}

/** The far trees as they are stamped (vegetation.ts `plant`). */
export class FarTreeList {
  private readonly index = new Map<Proto, number>();
  private readonly protos: Float32Array[] = [];
  private readonly trees: number[] = [];

  /** A tree stamped as veg/lattice.ts `stamp` does: its trunk at (x, z) on ground `y`, turned `q`, mirrored `m`, its `shade`. */
  add(p: Proto, x: number, y: number, z: number, q: number, m: boolean, shade: number): void {
    let n = this.index.get(p);
    if (n === undefined) {
      this.index.set(p, (n = this.protos.length));
      this.protos.push(packProto(p));
    }
    const s = p.s;
    this.trees.push((Math.floor(x / s) + 0.5) * s, Math.round(y / s) * s, (Math.floor(z / s) + 0.5) * s, n, (q & 3) + (m ? 4 : 0), shade, s, 0);
  }

  done(): FarTrees {
    return { protos: this.protos, trees: Float32Array.from(this.trees) };
  }
}

/** A prototype's shell cells and free boxes (leaves and bark), 9 numbers each. */
function packProto(p: Proto): Float32Array {
  const out: number[] = [];
  const s = p.s;
  for (let c = 0; c < p.n; c++) if (p.shell[c]) out.push(p.ci[c] * s, (p.cj[c] + 0.5) * s, p.ck[c] * s, s, s, s, p.color[c], p.shade[c], p.mat[c] ? 1 : 0);
  for (const b of p.boxes) out.push(b.x, b.y, b.z, b.sx, b.sy, b.sz, b.color, b.shade, b.leaf ? 0 : 1);
  return Float32Array.from(out);
}

// ── The atlas ───────────────────────────────────────────────────────────────

/** The round of a prototype's leaves (its frame): x, y, z, radius. */
function leafSphere(boxes: Float32Array): [number, number, number, number] {
  const box = new Box3();
  const p = new Vector3();
  for (let o = 0; o < boxes.length; o += 9) {
    if (boxes[o + 8]) continue;
    box.expandByPoint(p.set(boxes[o] - boxes[o + 3] / 2, boxes[o + 1] - boxes[o + 4] / 2, boxes[o + 2] - boxes[o + 5] / 2));
    box.expandByPoint(p.set(boxes[o] + boxes[o + 3] / 2, boxes[o + 1] + boxes[o + 4] / 2, boxes[o + 2] + boxes[o + 5] / 2));
  }
  const c = box.getCenter(new Vector3());
  let r = 0;
  for (let o = 0; o < boxes.length; o += 9) {
    if (boxes[o + 8]) continue;
    for (let k = 0; k < 8; k++) {
      p.set(boxes[o] + ((k & 1 ? 1 : -1) * boxes[o + 3]) / 2, boxes[o + 1] + ((k & 2 ? 1 : -1) * boxes[o + 4]) / 2, boxes[o + 2] + ((k & 4 ? 1 : -1) * boxes[o + 5]) / 2);
      r = Math.max(r, p.distanceTo(c));
    }
  }
  return [c.x, c.y, c.z, Math.max(r, 0.5)];
}

/** GLSL: a view's direction (toward the camera) from its index: azimuth from +z toward +x, then elevation. */
const VIEW_GLSL = /* glsl */ `
const float IMP_AZ = ${AZIMUTHS}.0;
const float IMP_EL[${ELEVATIONS.length}] = float[](${ELEVATIONS.map((e) => ((e * Math.PI) / 180).toFixed(5)).join(', ')});`;

/**
 * Draws the prototypes into the atlas: a row of pictures per view, a picture
 * per prototype, each prototype scaled to its tile (its leaves' round). A
 * texel: the leaf's colour (sRGB) and, in alpha, 1 + side × 40 + depth
 * (0‥39, over the round's diameter); a bark block in front of the leaves
 * leaves the texel empty (alpha 0), so the real trunk shows there.
 */
function atlasMaterial(protos: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uDir: { value: new Vector3() }, uRight: { value: new Vector3() }, uUp: { value: new Vector3() }, uProtos: { value: protos } },
    side: DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec4 aBox;   // centre in the tile (−0.5‥0.5 of the round's diameter), proto
      attribute vec4 aSize;  // size (of the diameter), bark
      attribute vec4 aColor; // linear colour, grain seed
      uniform vec3 uDir;
      uniform vec3 uRight;
      uniform vec3 uUp;
      uniform float uProtos;
      varying vec3 vColor;
      varying float vAcross;
      varying float vDepth;
      varying vec3 vLocal;
      flat varying float vSide;
      flat varying float vBark;
      void main() {
        vec3 q = aBox.xyz + position * aSize.xyz;
        float across = dot(q, uRight);
        vAcross = across;
        vDepth = dot(q, uDir);
        vLocal = q;
        vColor = aColor.rgb;
        vBark = aSize.w;
        vec3 n = abs(normal);
        vSide = n.x > 0.5 ? (normal.x > 0.0 ? 0.0 : 1.0) : n.y > 0.5 ? (normal.y > 0.0 ? 2.0 : 3.0) : (normal.z > 0.0 ? 4.0 : 5.0);
        gl_Position = vec4(((aBox.w + 0.5 + across) / uProtos) * 2.0 - 1.0, dot(q, uUp) * 2.0, -vDepth, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAcross;
      varying float vDepth;
      varying vec3 vLocal;
      flat varying float vSide;
      flat varying float vBark;
      float impHash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      void main() {
        // (a branch reaching out of its tile)
        if (abs(vAcross) > 0.5) discard;
        if (vBark > 0.5) {
          gl_FragColor = vec4(0.0);
          return;
        }
        // (the family's grain, veg's mapLeaf: one sample a texel, as the blocks give one a pixel)
        float g = impHash(floor(vLocal * 97.0) + vec3(vSide * 13.0));
        vec3 c = vColor * (1.0 + (g - 0.5) * 0.12);
        c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
        float d = clamp(floor((vDepth + 0.5) * 40.0), 0.0, 39.0);
        gl_FragColor = vec4(c, (1.0 + vSide * 40.0 + d) / 255.0);
      }`,
  });
}

/** The view's direction (toward the camera) and its picture's axes, in the prototype's frame. */
function viewAxes(v: number, dir: Vector3, right: Vector3, up: Vector3): void {
  const az = ((v % AZIMUTHS) * 2 * Math.PI) / AZIMUTHS;
  const el = (ELEVATIONS[Math.floor(v / AZIMUTHS)] * Math.PI) / 180;
  dir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  right.set(0, 1, 0).cross(dir).normalize();
  up.copy(dir).cross(right);
}

/** Draw the atlas (the renderer's state kept). Returns the texture (FramebufferTexture: no depth kept). */
function drawAtlas(renderer: WebGLRenderer, protos: Float32Array[], spheres: [number, number, number, number][]): FramebufferTexture {
  const views = AZIMUTHS * ELEVATIONS.length;
  const w = protos.length * TILE;
  const h = views * TILE;
  let n = 0;
  for (const p of protos) n += p.length / 9;
  const box = new Float32Array(n * 4);
  const size = new Float32Array(n * 4);
  const color = new Float32Array(n * 4);
  const c = new Color();
  let i = 0;
  protos.forEach((p, k) => {
    const [cx, cy, cz, r] = spheres[k];
    const d = 2 * r;
    for (let o = 0; o < p.length; o += 9, i++) {
      box.set([(p[o] - cx) / d, (p[o + 1] - cy) / d, (p[o + 2] - cz) / d, k], i * 4);
      size.set([p[o + 3] / d, p[o + 4] / d, p[o + 5] / d, p[o + 8]], i * 4);
      // (as buildVoxelMesh: the sRGB colour to linear, times the shade)
      c.setHex(p[o + 6]).multiplyScalar(p[o + 7]);
      color.set([c.r, c.g, c.b, 0], i * 4);
    }
  });
  const geo = new InstancedBufferGeometry();
  const unit = new BoxGeometry(1, 1, 1);
  geo.setIndex(unit.index);
  geo.setAttribute('position', unit.getAttribute('position'));
  geo.setAttribute('normal', unit.getAttribute('normal'));
  geo.setAttribute('aBox', new InstancedBufferAttribute(box, 4));
  geo.setAttribute('aSize', new InstancedBufferAttribute(size, 4));
  geo.setAttribute('aColor', new InstancedBufferAttribute(color, 4));
  geo.instanceCount = n;
  const material = atlasMaterial(protos.length);
  const mesh = new Mesh(geo, material);
  mesh.frustumCulled = false;
  const scene = new Scene();
  scene.add(mesh);
  const camera = new OrthographicCamera();
  const target = new WebGLRenderTarget(w, h, { depthBuffer: true, generateMipmaps: false });
  const was = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new Color()), alpha: renderer.getClearAlpha(), autoClear: renderer.autoClear, shadows: renderer.shadowMap.needsUpdate };
  const atlas = new FramebufferTexture(w, h);
  atlas.name = 'vegetation:tree-pictures';
  try {
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0);
    target.viewport.set(0, 0, w, h);
    renderer.setRenderTarget(target);
    renderer.clear();
    for (let v = 0; v < views; v++) {
      viewAxes(v, material.uniforms.uDir.value, material.uniforms.uRight.value, material.uniforms.uUp.value);
      target.viewport.set(0, v * TILE, w, TILE);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    }
    target.viewport.set(0, 0, w, h);
    renderer.setRenderTarget(target);
    renderer.copyFramebufferToTexture(atlas, new Vector2(0, 0));
  } finally {
    renderer.setRenderTarget(was.target);
    renderer.setClearColor(was.color, was.alpha);
    renderer.autoClear = was.autoClear;
    renderer.shadowMap.needsUpdate = was.shadows;
    target.dispose();
    geo.dispose();
    unit.dispose();
    material.dispose();
  }
  return atlas;
}

// ── The pictures as drawn ───────────────────────────────────────────────────

/** Shared by the pictures' material. */
const UNIFORMS = {
  uImpAtlas: { value: null as FramebufferTexture | null },
  uImpTime: { value: 0 },
  uImpProtos: { value: 1 },
};

const VERTEX_PARS = /* glsl */ `
attribute vec4 iSphere;  // the crown's round: middle (world), diameter
attribute vec4 iTree;    // prototype, quarter turns + 4 if mirrored, shade, cell size
attribute vec2 iFade;    // since (s), 1 in / −1 out
uniform float uImpTime;
${VIEW_GLSL}
varying vec2 vImpUv;
varying vec3 vImpWorld;
flat varying vec4 vImpTile;  // the picture's first texel (x, y), mirrored, alpha
flat varying vec4 vImpTree;  // quarter turns, mirrored, shade, diameter
flat varying vec3 vImpDir;   // toward the camera (world)
flat varying float vImpCell; // the tree's cell size (m)`;

const VERTEX_MAIN = /* glsl */ `
vec3 impW = normalize(cameraPosition - iSphere.xyz);
int impQm = int(iTree.y + 0.5);
int impQ = impQm & 3;
bool impMir = impQm >= 4;
// (the view in the prototype's frame: the turn undone (lattice.ts turn), then the mirror)
vec2 impL = impQ == 0 ? impW.xz : impQ == 1 ? vec2(impW.z, -impW.x) : impQ == 2 ? -impW.xz : vec2(-impW.z, impW.x);
if (impMir) impL.x = -impL.x;
float impAz = atan(impL.x, impL.y);
float impK = mod(floor(impAz / (6.2831853 / IMP_AZ) + 0.5), IMP_AZ);
float impEl = asin(clamp(impW.y, -1.0, 1.0));
int impE = 0;
for (int e = 1; e < ${ELEVATIONS.length}; e++) if (abs(impEl - IMP_EL[e]) < abs(impEl - IMP_EL[impE])) impE = e;
float impA = clamp((uImpTime - iFade.x) / ${FADE.toFixed(2)}, 0.0, 1.0);
impA = iFade.y > 0.0 ? impA : 1.0 - impA;
vImpTile = vec4(iTree.x * ${TILE}.0, (float(impE) * IMP_AZ + impK) * ${TILE}.0, impMir ? 1.0 : 0.0, impA);
vImpTree = vec4(float(impQ), impMir ? 1.0 : 0.0, iTree.z, iSphere.w);
vImpDir = impW;
vImpCell = iTree.w;
vImpUv = position.xy + 0.5;
vec3 impRight = normalize(cross(vec3(0.0, 1.0, 0.0), impW));
vec3 impUp = cross(impW, impRight);
vec3 transformed = iSphere.xyz + (impRight * position.x + impUp * position.y) * iSphere.w + impW * (iSphere.w * ${(FRONT / 2).toFixed(3)});
vImpWorld = transformed;
// (none yet, or faded out: nothing drawn)
if (impA <= 0.0) transformed = vec3(0.0, -1e5, 0.0);`;

const FRAGMENT_PARS = /* glsl */ `
uniform highp sampler2D uImpAtlas;
uniform mat4 projectionMatrix;
varying vec2 vImpUv;
varying vec3 vImpWorld;
flat varying vec4 vImpTile;
flat varying vec4 vImpTree;
flat varying vec3 vImpDir;
flat varying float vImpCell;
vec3 impAlbedo;
vec3 impHit;
vec3 impViewPos;
vec3 impNormal;
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
  uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
  vec4 impDirShadow[ NUM_DIR_LIGHT_SHADOWS ];
#endif
float impBayer(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float impDither(vec2 p) { return impBayer(0.5 * p) * 0.25 + impBayer(p); }`;

/** The pixel: its texel of the picture, the leaf's colour, side and point; then the leaf family's shading reads these. */
const FRAGMENT_MAIN = /* glsl */ `
{
  vec2 uv = vImpUv;
  if (vImpTile.z > 0.5) uv.x = 1.0 - uv.x;
  ivec2 tx = ivec2(vImpTile.xy) + clamp(ivec2(floor(uv * ${TILE}.0)), ivec2(0), ivec2(${TILE - 1}));
  vec4 a = texelFetch(uImpAtlas, tx, 0);
  if (a.a < 0.5 / 255.0) discard;
  // (fading in or out: a dither)
  if (vImpTile.w < 1.0 && vImpTile.w <= impDither(gl_FragCoord.xy) + 0.03) discard;
  int code = int(a.a * 255.0 + 0.5) - 1;
  int side = code / 40;
  float depth = (float(code - side * 40) + 0.5) / 40.0 - 0.5;
  vec3 n = side == 0 ? vec3(1.0, 0.0, 0.0) : side == 1 ? vec3(-1.0, 0.0, 0.0) : side == 2 ? vec3(0.0, 1.0, 0.0) : side == 3 ? vec3(0.0, -1.0, 0.0) : side == 4 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 0.0, -1.0);
  // (the prototype's side in the world: mirrored, then turned as lattice.ts turns)
  if (vImpTree.y > 0.5) n.x = -n.x;
  int q = int(vImpTree.x + 0.5);
  n.xz = q == 0 ? n.xz : q == 1 ? vec2(-n.z, n.x) : q == 2 ? -n.xz : vec2(n.z, -n.x);
  impAlbedo = mix(a.rgb / 12.92, pow((a.rgb + 0.055) / 1.055, vec3(2.4)), step(0.04045, a.rgb)) * vImpTree.z;
  // (the leaf's point: back from the quad to the crown's middle, then out by its depth; then onto its side's plane:
  // the lattice's cells meet on whole cells, veg/lattice.ts, so the point is where the pixel's ray meets it)
  impHit = vImpWorld + vImpDir * (vImpTree.w * (depth - ${(FRONT / 2).toFixed(3)}));
  {
    vec3 rd = normalize(vImpWorld - cameraPosition);
    int ax = abs(n.x) > 0.5 ? 0 : abs(n.y) > 0.5 ? 1 : 2;
    float plane = floor(impHit[ax] / vImpCell + 0.5) * vImpCell;
    float t = (plane - cameraPosition[ax]) / (abs(rd[ax]) > 1e-4 ? rd[ax] : 1e-4);
    if (t > 0.0 && dot(rd, n) < 0.0) impHit = cameraPosition + rd * t;
  }
  impViewPos = -(viewMatrix * vec4(impHit, 1.0)).xyz;
  // (the leaf's own depth: crowns in front of each other, of their trunks and branches, as the blocks stand)
  vec4 impClip = projectionMatrix * vec4(-impViewPos, 1.0);
  #ifdef USE_REVERSED_DEPTH_BUFFER
    gl_FragDepth = impClip.z / impClip.w;
  #else
    gl_FragDepth = 0.5 * impClip.z / impClip.w + 0.5;
  #endif
  impNormal = normalize((viewMatrix * vec4(n, 0.0)).xyz);
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    for (int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i++) impDirShadow[i] = directionalShadowMatrix[i] * vec4(impHit + n * directionalLightShadows[i].shadowNormalBias, 1.0);
  #endif
}
#define vViewPosition impViewPos
#define vNormal impNormal
#define vFogWorld impHit
#define vDirectionalShadowCoord impDirShadow
`;

/** A shader change that must find its mark (a changed three.js would drop it silently). */
function swap(src: string, mark: string, by: string, what: string): string {
  if (!src.includes(mark)) throw new Error(`tree pictures: no "${mark}" in the ${what} shader`);
  return src.replace(mark, by);
}

/** The pictures' material: lit as the leaf family is (veg's `mapLeaf`: matte, no highlight), from the atlas. */
function pictureMaterial(): MeshStandardMaterial {
  // (mapLeaf's roughness; its colour, grain and shade come from the atlas)
  const m = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  m.name = 'vegetation:tree-pictures';
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, UNIFORMS);
    let v = shader.vertexShader;
    v = swap(v, '#include <common>', `#include <common>\n${VERTEX_PARS}`, 'vertex');
    v = swap(v, '#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(cameraPosition - iSphere.xyz);', 'vertex');
    v = swap(v, '#include <begin_vertex>', VERTEX_MAIN, 'vertex');
    shader.vertexShader = v;
    let f = shader.fragmentShader;
    f = swap(f, 'void main() {', `${FRAGMENT_PARS}\nvoid main() {\n${FRAGMENT_MAIN}`, 'fragment');
    f = swap(f, '#include <color_fragment>', params.get('impdbg') === '1' ? 'diffuseColor.rgb = vec3(1.0, 0.0, 1.0);' : 'diffuseColor.rgb *= impAlbedo;', 'fragment');
    // (matte, as the map's blocks: materials.ts)
    f = swap(f, '#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.directSpecular *= 0.0;\nreflectedLight.indirectSpecular *= 0.0;', 'fragment');
    shader.fragmentShader = f;
  };
  m.customProgramCacheKey = () => 'tree-pictures-v1';
  return m;
}

/** A leaf tile's far leaves: the tile's leaf mesh and the first of its far instances. */
export interface FarLeaves {
  /** The tile (vegetation.ts `LEAF_GRID`). */
  tile: number;
  mesh: InstancedMesh;
  first: number;
}

interface TileState {
  /** Round the far blocks and the trees' crowns (world). */
  box: Box3;
  /** The smallest far cell there (m). */
  cell: number;
  /** Its far blocks are under the pixels: its trees (every tree reaching in) are pictures. */
  on: boolean;
  /** The trees whose crowns reach in (their pictures' indexes). */
  trees: number[];
  meshes: FarLeaves[];
  /** Its far blocks are left out of the picture pass (every tree reaching in a picture, faded in). */
  out: boolean;
}

/** The far trees as pictures on a phone (built only when {@link TREE_PICTURES}). */
export class TreePictures {
  readonly object: Mesh;
  /** What it took: the atlas (bytes, texels) and the time to make it. */
  readonly stats: { trees: number; protos: number; bytes: number; size: [number, number]; ms: number; atlasMs: number };
  private readonly tiles: TileState[] = [];
  /** Per tree: the tiles its crown reaches; shown as a picture, and since when. */
  private readonly reach: TileState[][] = [];
  private readonly shown: Uint8Array;
  private readonly since: Float64Array;
  private readonly fade: InstancedBufferAttribute;
  /** Trees shown as pictures now, and when the last one changed (s). */
  private showing = 0;
  private changedAt = -1e9;
  private camera: Camera | null = null;
  private first = true;
  private hooked = false;
  private readonly eye = new Vector3();
  /** Off: every tile as blocks (to compare, from the console or a tool: `userData.pictures` on the mesh). */
  enabled = true;

  /** `far`: the trees; `leaves`: the tiles' far leaves; `tileOf`: the leaf tile of a point; `tiles`: how many; `plan`: a tile's ground plan. */
  constructor(renderer: WebGLRenderer, far: FarTrees, leaves: FarLeaves[], tileOf: (x: number, z: number) => number, tiles: number) {
    const t0 = performance.now();
    const spheres = far.protos.map(leafSphere);
    const atlas = drawAtlas(renderer, far.protos, spheres);
    const atlasMs = performance.now() - t0;
    UNIFORMS.uImpAtlas.value = atlas;
    UNIFORMS.uImpProtos.value = far.protos.length;
    const T = far.trees;
    const count = T.length / 8;
    const sphere = new Float32Array(count * 4);
    const tree = new Float32Array(count * 4);
    const fade = new Float32Array(count * 2);
    this.shown = new Uint8Array(count);
    this.since = new Float64Array(count).fill(-1e9);
    const states: TileState[] = Array.from({ length: tiles }, () => ({ box: new Box3(), cell: Infinity, on: false, trees: [], meshes: [], out: false }));
    const all = new Box3();
    const c = new Vector3();
    const crown = new Box3();
    // (the trees in the reverse of their planting: where two crowns share a cell the one stamped first keeps it,
    // veg/lattice.ts; drawn last, its picture wins the tie there)
    for (let i = 0; i < count; i++) {
      const o = (count - 1 - i) * 8;
      const [cx, cy, cz, r] = spheres[T[o + 3]];
      const qm = T[o + 4];
      const q = qm & 3;
      // (the crown's middle turned as the prototype's cells are: mirrored, then turned)
      let x = qm >= 4 ? -cx : cx;
      let z = cz;
      [x, z] = q === 1 ? [-z, x] : q === 2 ? [-x, -z] : q === 3 ? [z, -x] : [x, z];
      c.set(T[o] + x, T[o + 1] + cy, T[o + 2] + z);
      sphere.set([c.x, c.y, c.z, 2 * r], i * 4);
      tree.set([T[o + 3], qm, T[o + 5], T[o + 6]], i * 4);
      fade.set([-1e9, -1], i * 2);
      crown.set(c.clone().subScalar(r), c.clone().addScalar(r));
      all.union(crown);
      // (the tiles its crown reaches: its trunk's, and those of its crown's corners)
      const reach: TileState[] = [];
      for (const [px, pz] of [[T[o], T[o + 2]], [crown.min.x, crown.min.z], [crown.max.x, crown.min.z], [crown.min.x, crown.max.z], [crown.max.x, crown.max.z]]) {
        const st = states[tileOf(px, pz)];
        if (reach.includes(st)) continue;
        reach.push(st);
        st.trees.push(i);
        st.box.union(crown);
        st.cell = Math.min(st.cell, T[o + 6]);
      }
      this.reach.push(reach);
    }
    // The far blocks: their tiles, the box round them, their cells.
    const m = new Vector3();
    for (const l of leaves) {
      const st = states[l.tile];
      st.meshes.push(l);
      const a = l.mesh.instanceMatrix.array;
      for (let i = l.first; i < l.mesh.count; i++) {
        const k = i * 16;
        const s = Math.max(a[k], a[k + 5], a[k + 10]);
        st.box.expandByPoint(m.set(a[k + 12] - s / 2, a[k + 13] - s / 2, a[k + 14] - s / 2));
        st.box.expandByPoint(m.set(a[k + 12] + s / 2, a[k + 13] + s / 2, a[k + 14] + s / 2));
        if (Math.abs(a[k] - a[k + 5]) < 1e-4 && Math.abs(a[k] - a[k + 10]) < 1e-4 && a[k] >= 2 - 1e-4) st.cell = Math.min(st.cell, a[k]);
      }
    }
    for (const st of states) if (Number.isFinite(st.cell)) this.tiles.push(st);

    const quad = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.setIndex(quad.index);
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('normal', quad.getAttribute('normal'));
    geo.setAttribute('iSphere', new InstancedBufferAttribute(sphere, 4));
    geo.setAttribute('iTree', new InstancedBufferAttribute(tree, 4));
    this.fade = new InstancedBufferAttribute(fade, 2);
    geo.setAttribute('iFade', this.fade);
    geo.instanceCount = count;
    geo.boundingSphere = all.isEmpty() ? new Sphere() : all.getBoundingSphere(new Sphere());
    geo.boundingBox = all.clone();
    this.object = new Mesh(geo, pictureMaterial());
    this.object.name = 'vegetation:tree-pictures';
    this.object.castShadow = false;
    this.object.receiveShadow = true;
    // (never picked: the blocks answer, they are still there for the picks)
    this.object.raycast = () => {};
    this.object.userData.pictures = this;
    const bytes = atlas.image.width * atlas.image.height * 4;
    this.stats = { trees: count, protos: far.protos.length, bytes, size: [atlas.image.width, atlas.image.height], ms: performance.now() - t0, atlasMs };
  }

  /** Every frame (the vegetation's update). */
  update(f: MapFrame): void {
    this.camera = f.camera;
    UNIFORMS.uImpTime.value = f.t;
    // (only the view camera sees them: not the still layer, the snow's map from above)
    this.object.layers.mask = 1;
    if (!this.hooked) this.hook();
    const on = this.enabled && graphicsNow.level === 'low';
    this.eye.setFromMatrixPosition(f.camera.matrixWorld);
    const pixel = pixelSize(f.camera);
    const limit = PX_URL ?? PICTURE_PX;
    const t = f.t;
    let changed = false;
    for (const st of this.tiles) {
      const px = st.cell / (Math.max(1e-3, st.box.distanceToPoint(this.eye)) * pixel);
      const want = on && px < limit * (st.on ? 1 : 1 - HOLD);
      if (want === st.on) continue;
      st.on = want;
      changed = true;
    }
    if (changed) {
      // A tree is a picture while a tile its crown reaches is under the pixels (the first frame as it stands: no fade).
      const a = this.fade.array as Float32Array;
      for (let i = 0; i < this.reach.length; i++) {
        const shown = this.reach[i].some((st) => st.on) ? 1 : 0;
        if (shown === this.shown[i]) continue;
        this.shown[i] = shown;
        this.showing += shown ? 1 : -1;
        this.changedAt = t;
        this.since[i] = this.first ? -1e9 : t;
        a[i * 2] = this.since[i];
        a[i * 2 + 1] = shown ? 1 : -1;
      }
      this.fade.needsUpdate = true;
    }
    this.first = false;
    // (no draw while no tree is a picture, nor fading out: a phone on another level, walking among near trees)
    this.object.visible = this.showing > 0 || t - this.changedAt < FADE;
    // A tile's far blocks are left out once every tree reaching in is a picture, faded in.
    for (const st of this.tiles) st.out = st.on && st.meshes.length > 0 && st.trees.every((i) => t - this.since[i] >= FADE);
  }

  /**
   * The tiles' leaf meshes draw their far instances or not, in the picture
   * pass only (`count` for the view camera, then all of them again: the
   * shadow passes, the snow's map, the picks see every block). Hooked on
   * the first frame, after main.ts has hooked them (voxel/backFacets.ts).
   */
  private hook(): void {
    this.hooked = true;
    for (const st of this.tiles)
      for (const l of st.meshes) {
        const mesh = l.mesh;
        const before = mesh.onBeforeRender;
        const after = mesh.onAfterRender;
        const all = mesh.count;
        mesh.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
          before.call(mesh, renderer, scene, camera, geometry, material, group);
          if (camera === this.camera && st.out) mesh.count = l.first;
        };
        mesh.onAfterRender = (renderer, scene, camera, geometry, material, group) => {
          mesh.count = all;
          after.call(mesh, renderer, scene, camera, geometry, material, group);
        };
      }
  }
}
