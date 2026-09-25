import { FLAG_ASPECT, FLAG_BLUE, FLAG_RED } from '../roam/_flag';

/**
 * The story's title flag (beats.ts scene `title`): the flag of Cambodia on a
 * thin gold pole, waving. The flag is painted once on a 2D canvas (blue, the
 * red band, Angkor Wat in white with fine black lines: five lotus-bud towers,
 * three galleries, the stepped base and the stair in the middle) and laid on
 * a cloth of 60 × 40 cells that a small WebGL shader moves: waves run from
 * the pole to the free end, growing as they go, with a smaller wave and a
 * flutter at the end for life, lit by a warm light (brighter on the crests,
 * darker in the folds), a fine weave, soft edges.
 *
 * `start()` / `stop()`: the story runs it only while the title shows (it
 * keeps going for the words' fade-out after `stop()`). Calm by
 * `prefers-reduced-motion`. Shots draw one still frame at once. No WebGL, a
 * shader that fails or a lost context: the flat flag instead.
 *
 * Its own WebGL context, not three.js (the map has the page's renderer).
 */
export interface WavingFlag {
  readonly el: HTMLElement;
  start(): void;
  stop(): void;
}

/** The canvas round the flag, in flag heights (the flag: x 0‥FLAG_ASPECT from the pole, y −0.5‥0.5): the finial above, the pole's foot below, room for the waves. */
const VIEW = { x0: -0.09, x1: 1.6, y0: -0.7, y1: 0.66 };
/** The pole: radius, top, foot (fading out), the finial's radius (flag heights). */
const POLE = { r: 0.019, top: 0.555, foot: VIEW.y0, ball: 0.036 };
/** Cloth cells, along × down. */
const CELLS = [60, 40] as const;
/** The painted flag (texels, a power of two for mipmaps; drawn stretched, laid back at 25 : 16). */
const TEX = [1024, 512] as const;
/** The time (s) it starts at, and a shot shows: a good fold. */
const SHOT_TIME = 3.4;
/** The words fade out in 0.7 s (story.ts render): the flag waves on until they are gone. */
const FADE_MS = 800;

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

// ── The flag ────────────────────────────────────────────────────────────────
// Drawn in a design box of 1000 × 640 (the flag's 25 : 16); the red band is
// y 160‥480, the temple spans x 282‥718, y 186‥456.
const DW = 1000;
const DH = 640;

/** A closed white shape with a black outline. */
function shape(g: CanvasRenderingContext2D, pts: number[]): void {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fill();
  g.stroke();
}

function block(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  shape(g, [x0, y0, x1, y0, x1, y1, x0, y1]);
}

function line(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

/** A dark opening (a doorway, a window between columns), round-topped when `arch`. */
function opening(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, arch = false): void {
  g.fillStyle = '#000';
  g.beginPath();
  if (arch) {
    const r = (x1 - x0) / 2;
    g.moveTo(x0, y1);
    g.lineTo(x0, y0 + r);
    g.arc(x0 + r, y0 + r, r, Math.PI, 0);
    g.lineTo(x1, y1);
    g.closePath();
  } else g.rect(x0, y0, x1 - x0, y1 - y0);
  g.fill();
  g.fillStyle = '#fff';
}

/**
 * A lotus-bud tower from its foot to its tip: a porch with a doorway, then
 * tiers (each a flared ledge and a face stepping in, with its corner lines)
 * swelling a little and closing in to a point, and a short spike.
 */
function tower(g: CanvasRenderingContext2D, cx: number, foot: number, tip: number, hw: number, tiers: number): void {
  const h = foot - tip;
  const porch = h * 0.16;
  const budFoot = foot - porch;
  const budTop = tip + h * 0.07;
  const width = (q: number) => Math.max(hw * 0.06, hw * (1 + 0.14 * Math.sin(Math.PI * q)) * Math.pow(Math.max(0, 1 - Math.pow(q, 1.7)), 0.7));
  shape(g, [cx - hw * 0.08, budTop + 3, cx, tip, cx + hw * 0.08, budTop + 3]);
  for (let i = tiers - 1; i >= 0; i--) {
    const y0 = budFoot - ((budFoot - budTop) * i) / tiers;
    const y1 = budFoot - ((budFoot - budTop) * (i + 1)) / tiers;
    const w0 = width(i / tiers);
    const w1 = i === tiers - 1 ? 0 : width((i + 1) / tiers);
    const ledge = (y0 - y1) * 0.26;
    shape(g, [cx - w0 * 0.9, y0 - ledge, cx - w1 * 0.94, y1, cx + w1 * 0.94, y1, cx + w0 * 0.9, y0 - ledge]);
    block(g, cx - w0 * 1.02, y0 - ledge, cx + w0 * 1.02, y0);
    // (the redented corners: two lines up each face)
    if (i < tiers - 1) {
      g.lineWidth = 1.3;
      for (const k of [-0.42, 0.42]) line(g, cx + w0 * k * 0.9, y0 - ledge, cx + w1 * k * 0.94, y1);
      g.lineWidth = 2;
    }
  }
  const pw = hw * 1.12;
  block(g, cx - pw, budFoot, cx + pw, foot);
  line(g, cx - pw, budFoot + porch * 0.28, cx + pw, budFoot + porch * 0.28);
  opening(g, cx - hw * 0.2, budFoot + porch * 0.42, cx + hw * 0.2, foot, true);
}

/** A gallery seen from the front: a two-step roof over a row of openings between columns. */
function gallery(g: CanvasRenderingContext2D, x0: number, x1: number, top: number, bottom: number, pitch: number): void {
  const roof = (bottom - top) * 0.3;
  block(g, x0 - 4, top, x1 + 4, top + roof);
  line(g, x0 - 4, top + roof * 0.5, x1 + 4, top + roof * 0.5);
  block(g, x0, top + roof, x1, bottom);
  const n = Math.floor((x1 - x0) / pitch);
  const pad = (x1 - x0 - n * pitch) / 2;
  for (let i = 0; i < n; i++) {
    const x = x0 + pad + (i + 0.5) * pitch;
    opening(g, x - pitch * 0.14, top + roof + 4, x + pitch * 0.14, bottom - 3);
  }
}

/** The stair up the middle: its side walls and a line for each step. */
function stair(g: CanvasRenderingContext2D, cx: number, bottom: number, top: number, wb: number, wt: number): void {
  shape(g, [cx - wb, bottom, cx - wt, top, cx + wt, top, cx + wb, bottom]);
  const n = Math.round((bottom - top) / 6);
  g.lineWidth = 1.3;
  for (let i = 1; i < n; i++) {
    const w = (wb + ((wt - wb) * i) / n) * 0.74;
    const y = bottom - ((bottom - top) * i) / n;
    line(g, cx - w, y, cx + w, y);
  }
  g.lineWidth = 2;
  for (const k of [-0.74, 0.74]) line(g, cx + wb * k, bottom, cx + wt * k, top);
}

/** Angkor Wat as the flag shows it, white with black lines, back to front. */
function temple(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#fff';
  g.strokeStyle = '#000';
  g.lineWidth = 2;
  g.lineJoin = 'miter';
  tower(g, 500, 322, 186, 40, 8);
  gallery(g, 388, 612, 322, 352, 11);
  for (const cx of [416, 584]) tower(g, cx, 322, 240, 28, 6);
  gallery(g, 352, 648, 352, 384, 12);
  gallery(g, 318, 682, 384, 420, 12);
  // The corner pavilions of the outer gallery, and the lower towers on them.
  for (const [x0, x1] of [
    [314, 356],
    [644, 686],
  ]) {
    gallery(g, x0, x1, 366, 420, 14);
    tower(g, (x0 + x1) / 2, 366, 300, 20, 5);
  }
  block(g, 306, 420, 694, 432);
  block(g, 294, 432, 706, 444);
  block(g, 282, 444, 718, 456);
  stair(g, 500, 456, 352, 30, 17);
  // The west door of the upper gallery, where the stair arrives.
  block(g, 484, 328, 516, 352);
  opening(g, 493, 334, 507, 352, true);
}

/** Paint the flag into the rectangle (x, y, w, h). */
function paintFlag(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.save();
  g.translate(x, y);
  g.scale(w / DW, h / DH);
  g.fillStyle = css(FLAG_BLUE);
  g.fillRect(0, 0, DW, DH);
  g.fillStyle = css(FLAG_RED);
  g.fillRect(0, DH / 4, DW, DH / 2);
  temple(g);
  g.restore();
}

// ── The shader ──────────────────────────────────────────────────────────────
// (GLSL ES 1.00: runs on WebGL 2 and 1 alike)

const VERT = /* glsl */ `
precision highp float;
attribute vec2 aUV;
uniform mediump float uMode; // 0 the cloth, 1 the pole, 2 the finial
uniform mediump float uUnit; // device pixels per flag height
uniform float uTime;
uniform float uAmp;
uniform vec4 uView;          // centre x, y and half width, height of the canvas (flag heights)
uniform vec4 uPole;          // radius, top, foot, the finial's radius
varying vec2 vUV;
varying vec3 vN;
varying float vFold;
varying float vR;

const float ASPECT = ${FLAG_ASPECT.toFixed(4)};
const float CAM = 2.8;   // the camera's distance (flag heights)
const float YAW = 0.16;  // the flag turned a little about the pole, its end away

// The cloth at uv (u 0..1 pole to end, v 0..1 top to bottom): x along, y up,
// z toward the viewer; w: the fold (-1 in a trough, 1 on a crest).
vec4 cloth(vec2 uv) {
  float u = max(uv.x, 0.0);
  float v = uv.y;
  float t = uTime;
  // (still at the pole, the waves grow toward the end; a slow gust breathes)
  float env = u * (1.4 - 0.4 * u);
  float a = uAmp * (1.0 + 0.2 * sin(t * 0.31) + 0.1 * sin(t * 0.53 + 1.3));
  float x = uv.x * ASPECT;
  float ph = 5.8 * x - 2.0 * t + 0.9 * v;
  float wave = sin(ph);
  float z = a * env * (0.12 * wave + 0.028 * sin(12.0 * x - 3.4 * t - 2.0 * v + 1.0));
  z += a * 0.01 * smoothstep(0.7, 1.0, u) * sin(5.0 * t + 10.0 * v + 3.0 * x);
  // (the cloth keeps its length: the end comes in as the waves grow; it sags a little)
  x -= 0.045 * a * a * env * x;
  float y = (0.5 - v) * (1.0 - 0.035 * u) - 0.05 * u * u + 0.02 * a * env * cos(ph);
  float c = cos(YAW);
  float s = sin(YAW);
  return vec4(x * c + z * s, y, z * c - x * s, wave * smoothstep(0.0, 0.25, u));
}

vec4 project(vec3 p) {
  return vec4((p.x - uView.x) / uView.z, (p.y - uView.y) / uView.w, 0.0, (CAM - p.z) / CAM);
}

void main() {
  vN = vec3(0.0, 0.0, 1.0);
  vFold = 0.0;
  if (uMode < 0.5) {
    // (2 px more all round, for the soft edge)
    vec2 m = vec2(2.0 / (ASPECT * uUnit), 2.0 / uUnit);
    vec2 uv = aUV * (1.0 + 2.0 * m) - m;
    vec4 p = cloth(uv);
    vec3 pu = cloth(uv + vec2(0.01, 0.0)).xyz;
    vec3 pv = cloth(uv + vec2(0.0, 0.01)).xyz;
    vN = normalize(cross(pv - p.xyz, pu - p.xyz));
    vFold = p.w;
    vUV = uv;
    vR = 0.0;
    gl_Position = project(p.xyz);
  } else if (uMode < 1.5) {
    vR = uPole.x * uUnit;
    float s = (aUV.x * 2.0 - 1.0) * (1.0 + 1.5 / vR);
    vUV = vec2(s, aUV.y);
    gl_Position = project(vec3(s * uPole.x, mix(uPole.z, uPole.y, aUV.y), 0.0));
  } else {
    vR = uPole.w * uUnit;
    vec2 q = (aUV * 2.0 - 1.0) * (1.0 + 1.5 / vR);
    vUV = q;
    gl_Position = project(vec3(q.x * uPole.w, uPole.y + uPole.w * 0.8 + q.y * uPole.w, 0.0));
  }
}
`;

const FRAG = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex;
uniform mediump float uMode;
uniform mediump float uUnit;
varying vec2 vUV;
varying vec3 vN;
varying float vFold;
varying float vR;

const float ASPECT = ${FLAG_ASPECT.toFixed(4)};
const vec3 L = vec3(-0.42, 0.5, 0.757);   // the light: from the upper left, in front
const vec3 KEY = vec3(1.0, 0.96, 0.9);    // warm, like the gold round it
const vec3 SKY = vec3(0.32, 0.34, 0.43);  // what the folds turned away still get

vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }

vec3 gold(vec3 n, float shine) {
  vec3 h = normalize(L + vec3(0.0, 0.0, 1.0));
  float d = max(dot(n, L), 0.0);
  float sp = pow(max(dot(n, h), 0.0), shine);
  return lin(vec3(0.91, 0.66, 0.26)) * (0.28 + 0.9 * d) + vec3(1.0, 0.9, 0.66) * sp;
}

void main() {
  vec3 col;
  float a;
  if (uMode < 0.5) {
    // soft edges: the distance to them in pixels
    vec2 e = min(vUV, 1.0 - vUV) * vec2(ASPECT, 1.0) * uUnit;
    a = clamp(e.x + 0.5, 0.0, 1.0) * clamp(e.y + 0.5, 0.0, 1.0);
    vec3 n = normalize(vN);
    if (n.z < 0.0) n = -n;
    vec3 base = lin(texture2D(uTex, clamp(vUV, 0.0, 1.0), -0.5).rgb);
    // 1 where the cloth lies flat: the flag's own colours there
    float d = max(dot(n, L), 0.0) / L.z;
    vec3 light = (SKY + (KEY - SKY) * d) * (0.92 + 0.08 * vFold);
    // a fine weave, a thread every 2.6 px
    vec2 th = vUV * vec2(ASPECT, 1.0) * uUnit * (3.14159 / 2.6);
    col = base * light * (1.0 + 0.045 * sin(th.x) * sin(th.y));
    // a soft sheen where the cloth turns to the light (hardly any where it lies flat)
    vec3 h = normalize(L + vec3(0.0, 0.0, 1.0));
    col += KEY * 0.07 * pow(max(dot(n, h), 0.0), 60.0);
  } else if (uMode < 1.5) {
    float s = vUV.x;
    a = clamp((1.0 - abs(s)) * vR + 0.5, 0.0, 1.0) * smoothstep(0.0, 0.7, vUV.y);
    col = gold(vec3(s, 0.0, sqrt(max(0.0, 1.0 - s * s))), 24.0);
  } else {
    float r = length(vUV);
    a = clamp((1.0 - r) * vR + 0.5, 0.0, 1.0);
    col = gold(vec3(vUV, sqrt(max(0.0, 1.0 - r * r))), 36.0);
  }
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)) * a, a);
}
`;

type GL = WebGLRenderingContext;

/** The waving flag on WebGL, drawing into `canvas`; throws if it cannot. */
function glFlag(canvas: HTMLCanvasElement, picture: HTMLCanvasElement, shot: boolean): { draw(time: number, amp: number): void } {
  const attrs: WebGLContextAttributes = { alpha: true, premultipliedAlpha: true, antialias: true, depth: false, stencil: false, preserveDrawingBuffer: shot, powerPreference: 'low-power' };
  const gl = (canvas.getContext('webgl2', attrs) ?? canvas.getContext('webgl', attrs)) as GL | null;
  if (!gl) throw new Error('no WebGL');

  const compile = (type: number, src: string): WebGLShader => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.bindAttribLocation(prog, 0, 'aUV');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
  const u = (name: string) => gl.getUniformLocation(prog, name);
  const loc = { mode: u('uMode'), unit: u('uUnit'), time: u('uTime'), amp: u('uAmp'), view: u('uView'), pole: u('uPole'), tex: u('uTex') };

  // The cloth: a grid of (u, v) 0..1; the pole and finial: one quad.
  const [nx, ny] = CELLS;
  const grid = new Float32Array((nx + 1) * (ny + 1) * 2);
  for (let j = 0, k = 0; j <= ny; j++) for (let i = 0; i <= nx; i++, k += 2) grid.set([i / nx, j / ny], k);
  const index = new Uint16Array(nx * ny * 6);
  for (let j = 0, k = 0; j < ny; j++)
    for (let i = 0; i < nx; i++, k += 6) {
      const a = j * (nx + 1) + i;
      const b = a + nx + 1;
      index.set([a, b, a + 1, a + 1, b, b + 1], k);
    }
  const buffer = (target: number, data: ArrayBufferView) => {
    const b = gl.createBuffer();
    gl.bindBuffer(target, b);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return b;
  };
  const gridBuf = buffer(gl.ARRAY_BUFFER, grid);
  const quadBuf = buffer(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]));
  const indexBuf = buffer(gl.ELEMENT_ARRAY_BUFFER, index);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, picture);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);

  gl.useProgram(prog);
  gl.uniform1i(loc.tex, 0);
  gl.uniform4f(loc.view, (VIEW.x0 + VIEW.x1) / 2, (VIEW.y0 + VIEW.y1) / 2, (VIEW.x1 - VIEW.x0) / 2, (VIEW.y1 - VIEW.y0) / 2);
  gl.uniform4f(loc.pole, POLE.r, POLE.top, POLE.foot, POLE.ball);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.enableVertexAttribArray(0);
  gl.clearColor(0, 0, 0, 0);

  return {
    draw(time, amp) {
      if (gl.isContextLost()) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(loc.time, time);
      gl.uniform1f(loc.amp, amp);
      gl.uniform1f(loc.unit, canvas.width / (VIEW.x1 - VIEW.x0));
      gl.uniform1f(loc.mode, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf);
      gl.drawElements(gl.TRIANGLES, index.length, gl.UNSIGNED_SHORT, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      for (const mode of [1, 2]) {
        gl.uniform1f(loc.mode, mode);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    },
  };
}

/** The flat flag on its pole (no WebGL): the same picture, still. */
function drawFlat(canvas: HTMLCanvasElement, picture: HTMLCanvasElement): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const unit = canvas.width / (VIEW.x1 - VIEW.x0);
  const px = (x: number) => (x - VIEW.x0) * unit;
  const py = (y: number) => (VIEW.y1 - y) * unit;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(picture, px(0), py(0.5), FLAG_ASPECT * unit, unit);
  const r = POLE.r * unit;
  const pole = g.createLinearGradient(px(-POLE.r), 0, px(POLE.r), 0);
  pole.addColorStop(0, '#8a5a18');
  pole.addColorStop(0.35, '#ffe39a');
  pole.addColorStop(1, '#b07a26');
  g.fillStyle = pole;
  g.fillRect(px(0) - r, py(POLE.top), r * 2, py(POLE.foot) - py(POLE.top));
  // (its foot fades out, under the flag)
  const fade = g.createLinearGradient(0, py(-0.5), 0, py(POLE.foot));
  fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  fade.addColorStop(1, '#000');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = fade;
  g.fillRect(px(0) - r - 1, py(-0.5), r * 2 + 2, py(POLE.foot) - py(-0.5));
  g.globalCompositeOperation = 'source-over';
  const bx = px(0);
  const by = py(POLE.top + POLE.ball * 0.8);
  const ball = g.createRadialGradient(bx - r * 0.6, by - r * 0.6, 0, bx, by, POLE.ball * unit);
  ball.addColorStop(0, '#fff2c0');
  ball.addColorStop(1, '#b07a26');
  g.fillStyle = ball;
  g.beginPath();
  g.arc(bx, by, POLE.ball * unit, 0, Math.PI * 2);
  g.fill();
}

export function createWavingFlag(opts: { shot: boolean }): WavingFlag {
  const el = document.createElement('div');
  el.className = 'st-flag';
  el.setAttribute('aria-hidden', 'true');
  const newCanvas = () => {
    const c = document.createElement('canvas');
    c.style.aspectRatio = String((VIEW.x1 - VIEW.x0) / (VIEW.y1 - VIEW.y0));
    return c;
  };
  let canvas = newCanvas();
  el.append(canvas);

  let picture: HTMLCanvasElement | null = null;
  let gl: ReturnType<typeof glFlag> | null = null;
  let flat = false;
  let sized = false;
  let on = false;
  let until = 0;
  let raf = 0;
  let last = 0;
  let time = SHOT_TIME;
  let speed = 1;
  let amp = 1;

  function paint(): HTMLCanvasElement {
    if (picture) return picture;
    picture = document.createElement('canvas');
    [picture.width, picture.height] = TEX;
    paintFlag(picture.getContext('2d')!, 0, 0, TEX[0], TEX[1]);
    return picture;
  }

  /** The flat flag from now on (the WebGL canvas is dropped). */
  function fallBack(why: unknown): void {
    if (flat) return;
    console.warn('[map] story flag: a flat flag instead of the waving one', why);
    flat = true;
    gl = null;
    const c = newCanvas();
    canvas.replaceWith(c);
    canvas = c;
    sized = false;
    draw();
  }

  /** The canvas's pixels follow its size on screen (up to 2 per CSS pixel). */
  function fit(): boolean {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return false;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    sized = true;
    return true;
  }

  function draw(): void {
    if (!sized && !fit()) return;
    if (flat) return drawFlat(canvas, paint());
    try {
      if (!gl) {
        gl = glFlag(canvas, paint(), opts.shot);
        canvas.addEventListener('webglcontextlost', () => fallBack('context lost'));
      }
      gl.draw(time, amp);
    } catch (e) {
      fallBack(e);
    }
  }

  new ResizeObserver(() => {
    sized = false;
    if (on || opts.shot) draw();
  }).observe(el);

  function loop(now: number): void {
    raf = 0;
    if (!on && now > until) return;
    // (real time; a hidden tab pauses it)
    time += (last ? Math.min(0.1, (now - last) / 1000) : 0) * speed;
    last = now;
    draw();
    if (!flat) raf = requestAnimationFrame(loop);
  }

  return {
    el,
    start() {
      const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
      speed = calm ? 0.35 : 1;
      amp = calm ? 0.45 : 1;
      on = true;
      if (opts.shot) {
        sized = false;
        draw();
      } else if (!raf) {
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    },
    stop() {
      if (on) until = performance.now() + FADE_MS;
      on = false;
    },
  };
}
