import { BufferAttribute, BufferGeometry, CanvasTexture, Color, Mesh, MeshStandardMaterial, NoColorSpace, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { hash3 } from '../../voxel/random';
import { sacredEnv } from '../sacred/finish';
import { bezier, dot, flame, flameArch, gild, glass, GLASS_BLUE, GLASS_GREEN, halo, LACQUER, lotusBand, ribbon, type AnyCanvas, type Ctx2D, type Gilded, type GildLook, type KbachPen, type P } from '../sacred/kbach';
import { SKY } from '../sky/palette';

/**
 * The village pagoda hall's painted surfaces, inside (_pagoda.ts), on
 * canvases like the gables' (sacred/kbach.ts):
 *
 * - the back wall: the Bodhi tree spreading over the Buddha (he calls the
 *   earth to witness under it, the night he became the Buddha), blue hills
 *   and clouds far off, a soft light round his head (`muralMesh`);
 * - the gilt flame arch standing behind him, a halo round his head (`auraMesh`);
 * - gold kbach on red lacquer: the fronts of the altar's tiers and the
 *   frieze under the ceiling (`friezeMesh`), the window shutters inside
 *   (`shutterMesh`), the ceiling's coffers with a gold lotus in each
 *   (`ceilingMesh`).
 *
 * Each is lit like the statues (the gold shines and stands out, the
 * lacquer does not; they mirror a warm room) and glows warm at night, as by
 * candlelight. Everything is drawn from fixed numbers.
 */

// ── Faces ────────────────────────────────────────────────────────────────

/** Which way a face looks (the painting reads the right way round from there). */
export type Facing = '-z' | '+z' | '-x' | '+x' | '-y' | '+y';

/**
 * A rectangle in world metres: it lies at `at` along its facing's axis;
 * `a` and `b` are its extent along the other two (for ±z faces x then y,
 * for ±x faces z then y, for floors and ceilings x then z).
 */
export interface Face {
  facing: Facing;
  at: number;
  a0: number;
  a1: number;
  b0: number;
  b1: number;
}

/**
 * The faces as one geometry: the texture repeats every `tileA` m along a
 * (and `tileB` along b; 0: once over the face). With `world`, the repeats
 * line up with the world's metres (a pattern runs on from face to face).
 */
function faces(list: readonly Face[], tileA: number, tileB: number, world = false): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const f of list) {
    const la = f.a1 - f.a0;
    const lb = f.b1 - f.b0;
    // (corner, the way u runs, the way v runs)
    let o: number[];
    let A: number[];
    let B: number[];
    if (f.facing === '-z') [o, A, B] = [[f.a1, f.b0, f.at], [-la, 0, 0], [0, lb, 0]];
    else if (f.facing === '+z') [o, A, B] = [[f.a0, f.b0, f.at], [la, 0, 0], [0, lb, 0]];
    else if (f.facing === '+x') [o, A, B] = [[f.at, f.b0, f.a1], [0, 0, -la], [0, lb, 0]];
    else if (f.facing === '-x') [o, A, B] = [[f.at, f.b0, f.a0], [0, 0, la], [0, lb, 0]];
    else if (f.facing === '-y') [o, A, B] = [[f.a0, f.at, f.b0], [la, 0, 0], [0, 0, lb]];
    else [o, A, B] = [[f.a0, f.at, f.b1], [la, 0, 0], [0, 0, -lb]];
    const n = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]];
    const nl = Math.hypot(n[0], n[1], n[2]) || 1;
    // (u and v at the corner, and over the face)
    const dir = (V: number[], l: number) => V.map((c) => c / (l || 1));
    const Au = dir(A, la);
    const Bv = dir(B, lb);
    const u0 = world && tileA > 0 ? (o[0] * Au[0] + o[1] * Au[1] + o[2] * Au[2]) / tileA : 0;
    const v0 = world && tileB > 0 ? (o[0] * Bv[0] + o[1] * Bv[1] + o[2] * Bv[2]) / tileB : 0;
    const u = tileA > 0 ? la / tileA : 1;
    const v = tileB > 0 ? lb / tileB : 1;
    const base = pos.length / 3;
    for (const [s, t] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]) {
      pos.push(o[0] + A[0] * s + B[0] * t, o[1] + A[1] * s + B[1] * t, o[2] + A[2] * s + B[2] * t);
      nor.push(n[0] / nl, n[1] / nl, n[2] / nl);
      uv.push(u0 + u * s, v0 + v * t);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// ── Materials ─────────────────────────────────────────────────────────────

/** A 2D canvas off the page (a page canvas where there is none). */
function canvas(w: number, h: number): [AnyCanvas, Ctx2D] {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(w, h);
    return [c, c.getContext('2d')!];
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function texture(c: AnyCanvas, name: string, srgb: boolean, repeat: boolean): Texture {
  const t = new CanvasTexture(c);
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  t.name = name;
  return t;
}

/** How a painted surface glows: its lamps at night (emissive), and how much of the warm room it mirrors by day. */
interface Glow {
  night: number;
  env: number;
}

/**
 * A mesh that sets its material for the time of day as it is drawn: at
 * night the candles light it (emissive) and the moonlight outside hardly
 * reaches in (its colour taken down, so the sky's blue does not tint it).
 */
function litMesh(g: BufferGeometry, m: MeshStandardMaterial, glow: Glow, name: string): Mesh {
  const mesh = new Mesh(g, m);
  mesh.name = name;
  mesh.receiveShadow = true;
  mesh.onBeforeRender = () => {
    const n = SKY.night;
    const k = n * n * (3 - 2 * n);
    m.emissiveIntensity = glow.night * k;
    m.envMapIntensity = glow.env * (1 - 0.75 * n);
    m.color.setScalar(1 - 0.72 * k);
  };
  return mesh;
}

/**
 * Gold on lacquer: the colour, its relief (the gold raised and shining), its
 * glow by lamplight (the gold; with `paint`, the whole painted colour).
 */
function gildMaterial(name: string, art: Gilded, o: { repeat?: boolean; cut?: boolean; bump?: number; paint?: boolean } = {}): MeshStandardMaterial {
  const relief = texture(art.relief, `${name} relief`, false, !!o.repeat);
  const map = texture(art.color, name, true, !!o.repeat);
  const m = new MeshStandardMaterial({
    map,
    bumpMap: relief,
    bumpScale: o.bump ?? 1.6,
    roughnessMap: relief,
    metalnessMap: relief,
    roughness: 1,
    metalness: 1,
    envMap: sacredEnv(),
    emissiveMap: o.paint ? map : texture(art.glow, `${name} glow`, true, !!o.repeat),
    emissive: new Color(1, 0.62, 0.3),
    emissiveIntensity: 0,
    alphaTest: o.cut ? 0.5 : 0,
  });
  m.name = name;
  return m;
}

/** Paints `w` × `h` m at `px` pixels across, origin at the bottom left (or the bottom middle), y up. */
function gilded(w: number, h: number, px: number, draw: (pen: KbachPen) => void, middle = false, look?: GildLook): Gilded {
  const ppm = px / w;
  const H = Math.round(h * ppm);
  return gild(px, H, (g) => g.setTransform(ppm, 0, 0, -ppm, middle ? px / 2 : 0, H), ppm, draw, look);
}

const cache = new Map<string, MeshStandardMaterial>();
const once = (key: string, make: () => MeshStandardMaterial): MeshStandardMaterial => {
  let m = cache.get(key);
  if (!m) cache.set(key, (m = make()));
  return m;
};

// ── Motifs ────────────────────────────────────────────────────────────────

/** A flower of flames: `n` flame petals round a glass eye, a smaller row between them. */
function rosette(pen: KbachPen, cx: number, cy: number, r: number, eye: string | null, n = 8, spin = 0): void {
  for (let i = 0; i < n; i++) {
    const a = spin + ((i + 0.5) / n) * Math.PI * 2;
    flame(pen, cx + Math.cos(a) * r * 0.25, cy + Math.sin(a) * r * 0.25, a, r * 0.62, r * 0.3, 0.5, { vein: false });
  }
  for (let i = 0; i < n; i++) {
    const a = spin + (i / n) * Math.PI * 2;
    flame(pen, cx + Math.cos(a) * r * 0.22, cy + Math.sin(a) * r * 0.22, a, r * 0.85, r * 0.38, 0.7);
  }
  pen.gold.fillStyle = '#fff';
  dot(pen.gold, cx, cy, r * 0.3);
  if (eye) glass(pen, cx, cy, r * 0.17, eye);
}

// ── The frieze (the altar's tiers, under the ceiling) ─────────────────────

/** One repeat of the frieze (m). */
export const FRIEZE = { w: 0.9, h: 0.45 };

/** Gold fillets and beads along the top, lotus petals along the foot, a flower of flames in the middle on a vine running on. */
function paintFrieze(pen: KbachPen): void {
  const { w, h } = FRIEZE;
  pen.ground.fillStyle = LACQUER;
  pen.ground.fillRect(-0.1, -0.1, w + 0.2, h + 0.2);
  const g = pen.gold;
  g.fillStyle = '#fff';
  g.fillRect(-0.1, h - 0.032, w + 0.2, 0.022);
  for (let i = 0; i < 12; i++) {
    const x = ((i + 0.5) * w) / 12;
    if (i % 2) glass(pen, x, h - 0.062, 0.0085, GLASS_GREEN);
    else dot(g, x, h - 0.062, 0.011);
  }
  lotusBand(pen, 0, w, 0.012, 0.11, null);
  // The vine: a wave from end to end (it meets the next repeat), flames curling off it.
  const cy = 0.245;
  const vine: P[] = [];
  for (let i = 0; i <= 60; i++) {
    const x = (i / 60) * w;
    vine.push([x, cy + 0.035 * Math.sin((x / w) * Math.PI * 2)]);
  }
  g.fillStyle = '#fff';
  ribbon(g, vine, 0.014, 0.014, false);
  for (const [x, up] of [
    [0.1, 1],
    [0.2, -1],
    [0.7, 1],
    [0.8, -1],
  ] as const) {
    const y = cy + 0.035 * Math.sin((x / w) * Math.PI * 2);
    // (leaning out toward the ends, curling on outward)
    const out = x < w / 2 ? -1 : 1;
    flame(pen, x, y, (up * Math.PI) / 2 - out * up * 0.6, 0.085, 0.036, -out * up * 1.4, { tongue: 0.4 });
  }
  rosette(pen, w / 2, cy, 0.1, GLASS_BLUE);
  // (half a gem at each end: they meet as one across the repeats)
  for (const x of [0, w]) glass(pen, x, cy, 0.016, GLASS_GREEN);
}

/** The frieze on these faces (repeating along them, stretched to each face's height). */
export function friezeMesh(list: readonly Face[]): Mesh {
  const m = once('frieze', () => gildMaterial('pagoda frieze', gilded(FRIEZE.w, FRIEZE.h, 512, paintFrieze), { repeat: true }));
  return litMesh(faces(list, FRIEZE.w, 0), m, { night: 0.7, env: 1 }, 'pagoda:frieze');
}

// ── The window shutters (inside) ─────────────────────────────────────────

/** A window's pair of shutters (m). */
export const SHUTTER = { w: 1.1, h: 2.0 };

/** Two leaves of red lacquer in gold frames, a stem of three flowers of flames up each, lotus petals at its foot and a flame on top. */
function paintShutter(pen: KbachPen): void {
  const { w, h } = SHUTTER;
  pen.ground.fillStyle = LACQUER;
  pen.ground.fillRect(0, 0, w, h);
  const g = pen.gold;
  g.fillStyle = '#fff';
  for (const x0 of [0, w / 2]) {
    const x1 = x0 + w / 2;
    const frame = (i: number, t: number) => {
      g.fillRect(x0 + i, i, w / 2 - 2 * i, t);
      g.fillRect(x0 + i, h - i - t, w / 2 - 2 * i, t);
      g.fillRect(x0 + i, i, t, h - 2 * i);
      g.fillRect(x1 - i - t, i, t, h - 2 * i);
    };
    frame(0.015, 0.03);
    frame(0.065, 0.008);
    const cx = x0 + w / 4;
    g.fillRect(cx - 0.007, 0.3, 0.014, 1.35);
    lotusBand(pen, x0 + 0.09, x1 - 0.09, 0.09, 0.12, null);
    rosette(pen, cx, 0.52, 0.1, GLASS_GREEN);
    rosette(pen, cx, 1.02, 0.13, GLASS_BLUE);
    rosette(pen, cx, 1.52, 0.1, GLASS_GREEN);
    for (const y of [0.77, 1.27])
      for (const s of [-1, 1]) flame(pen, cx + s * 0.01, y, Math.PI / 2 - s * 0.9, 0.16, 0.065, s * 1.5, { tongue: 0.45 });
    flame(pen, cx, 1.66, Math.PI / 2, 0.2, 0.08, 0.3);
    for (const s of [-1, 1]) flame(pen, cx + s * 0.02, 1.68, Math.PI / 2 - s * 0.7, 0.11, 0.045, s * 1.2);
  }
}

/** Closed shutters on these faces (one pair each, the painting stretched to fit). */
export function shutterMesh(list: readonly Face[]): Mesh {
  const m = once('shutter', () => gildMaterial('pagoda shutter', gilded(SHUTTER.w, SHUTTER.h, 256, paintShutter)));
  return litMesh(faces(list, 0, 0), m, { night: 0.5, env: 0.8 }, 'pagoda:shutters');
}

// ── The ceiling ───────────────────────────────────────────────────────────

/** One coffer of the ceiling (m). */
export const COFFER = 1.2;

/** Deep red, a gold lotus of flames in the middle, gold ribs round it, a small star where four meet. */
function paintCeiling(pen: KbachPen): void {
  const c = COFFER;
  pen.ground.fillStyle = '#6a120e';
  pen.ground.fillRect(-0.1, -0.1, c + 0.2, c + 0.2);
  const g = pen.gold;
  g.fillStyle = '#fff';
  // (the ribs: half on each side of the edge, whole where two coffers meet)
  for (const e of [0, c]) {
    g.fillRect(e - 0.03, -0.1, 0.06, c + 0.2);
    g.fillRect(-0.1, e - 0.03, c + 0.2, 0.06);
  }
  g.fillRect(0.075, 0.075, c - 0.15, 0.01);
  g.fillRect(0.075, c - 0.085, c - 0.15, 0.01);
  g.fillRect(0.075, 0.075, 0.01, c - 0.15);
  g.fillRect(c - 0.085, 0.075, 0.01, c - 0.15);
  rosette(pen, c / 2, c / 2, 0.3, GLASS_GREEN, 8, Math.PI / 8);
  for (const [x, y] of [
    [0, 0],
    [c, 0],
    [0, c],
    [c, c],
  ])
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      flame(pen, x, y, a, 0.12, 0.05, 0.4, { vein: false });
    }
}

/** A ceiling of coffers over this face (facing down). */
export function ceilingMesh(face: Face): Mesh {
  const m = once('ceiling', () => gildMaterial('pagoda ceiling', gilded(COFFER, COFFER, 256, paintCeiling), { repeat: true, bump: 1.2 }));
  return litMesh(faces([face], COFFER, COFFER), m, { night: 0.4, env: 0.7 }, 'pagoda:ceiling');
}

// ── The walls and the floor ──────────────────────────────────────────────

/** One repeat of the walls' stencil (m). */
export const STENCIL = 0.6;

/** Warm ivory paint stencilled with a fine gold lattice of diamonds, a small flower of four flames where the lines cross, a dot in each diamond. */
function paintWall(pen: KbachPen): void {
  const c = STENCIL;
  pen.ground.fillStyle = '#f1e6c9';
  pen.ground.fillRect(-0.1, -0.1, c + 0.2, c + 0.2);
  const g = pen.gold;
  g.fillStyle = '#fff';
  // (the lines run corner to corner: they meet the next repeat's)
  for (const [a, b] of [
    [[-0.05, -0.05], [c + 0.05, c + 0.05]],
    [[-0.05, c + 0.05], [c + 0.05, -0.05]],
  ] as [P, P][])
    ribbon(g, [a, b], 0.006, 0.006, false);
  const cross = (x: number, y: number) => {
    for (let i = 0; i < 4; i++) {
      const t = (i / 4) * Math.PI * 2;
      flame(pen, x + Math.cos(t) * 0.008, y + Math.sin(t) * 0.008, t, 0.05, 0.026, 0.3, { vein: false });
    }
    dot(g, x, y, 0.011);
  };
  cross(c / 2, c / 2);
  for (const [x, y] of [
    [0, 0],
    [c, 0],
    [0, c],
    [c, c],
  ])
    cross(x, y);
  for (const [x, y] of [
    [c / 2, 0],
    [0, c / 2],
    [c, c / 2],
    [c / 2, c],
  ])
    dot(g, x, y, 0.008);
}

/** The painted walls on these faces (the stencil runs on from face to face). */
export function wallMesh(list: readonly Face[]): Mesh {
  const m = once('wall', () => gildMaterial('pagoda wall', gilded(STENCIL, STENCIL, 256, paintWall, false, { gold: ['#eac163', '#cf9d44'], dark: '#9a6a2a' }), { repeat: true, bump: 0.5, paint: true }));
  return litMesh(faces(list, STENCIL, STENCIL, true), m, { night: 0.3, env: 0.55 }, 'pagoda:walls');
}

/** One floor tile (m). */
export const TILE = 0.6;

/** Polished tiles: cream, a terracotta border and a small four-petal flower where four meet. */
function paintFloor(g: Ctx2D): void {
  const c = TILE;
  g.fillStyle = '#e6d6b6';
  g.fillRect(0, 0, c, c);
  g.fillStyle = '#b8653e';
  g.fillRect(0.03, 0.03, c - 0.06, 0.035);
  g.fillRect(0.03, c - 0.065, c - 0.06, 0.035);
  g.fillRect(0.03, 0.03, 0.035, c - 0.06);
  g.fillRect(c - 0.065, 0.03, 0.035, c - 0.06);
  g.fillStyle = '#d9c6a0';
  g.fillRect(0.09, 0.09, c - 0.18, c - 0.18);
  g.fillStyle = '#9a4a2c';
  for (const [x, y] of [
    [0, 0],
    [c, 0],
    [0, c],
    [c, c],
  ]) {
    g.beginPath();
    g.moveTo(x - 0.06, y);
    g.lineTo(x, y - 0.06);
    g.lineTo(x + 0.06, y);
    g.lineTo(x, y + 0.06);
    g.closePath();
    g.fill();
  }
  g.fillStyle = '#e8c070';
  g.beginPath();
  g.arc(c / 2, c / 2, 0.05, 0, Math.PI * 2);
  g.fill();
  // (the grout between tiles)
  g.fillStyle = 'rgba(90, 60, 40, 0.5)';
  g.fillRect(0, 0, c, 0.005);
  g.fillRect(0, 0, 0.005, c);
}

/** The hall's polished tile floor on this face (facing up). */
export function floorMesh(face: Face): Mesh {
  const m = once('floor', () => {
    const px = 192;
    const ppm = px / TILE;
    const [c, g] = canvas(px, px);
    g.setTransform(ppm, 0, 0, -ppm, 0, px);
    paintFloor(g);
    const map = texture(c, 'pagoda floor', true, true);
    const mat = new MeshStandardMaterial({ map, roughness: 0.3, metalness: 0, envMap: sacredEnv(), emissiveMap: map, emissive: new Color(1, 0.66, 0.36), emissiveIntensity: 0 });
    mat.name = 'pagoda floor';
    return mat;
  });
  return litMesh(faces([face], TILE, TILE, true), m, { night: 0.3, env: 0.7 }, 'pagoda:floor');
}

/** A plain painted surface (its colour a canvas `w` × `h` m, y up), glowing by lamplight at night. */
function painted(name: string, w: number, h: number, px: number, paint: (g: Ctx2D) => void, rough: number, repeat: boolean): MeshStandardMaterial {
  const ppm = px / w;
  const H = Math.round(h * ppm);
  const [c, g] = canvas(px, H);
  g.setTransform(ppm, 0, 0, -ppm, 0, H);
  paint(g);
  const map = texture(c, name, true, repeat);
  const m = new MeshStandardMaterial({ map, roughness: rough, metalness: 0, envMap: sacredEnv(), emissiveMap: map, emissive: new Color(1, 0.64, 0.36), emissiveIntensity: 0 });
  m.name = name;
  return m;
}

/** A woven reed mat (kantel), 2 × 1.5 m: straw with fine weave lines, bands of red and green near each end. */
function paintMat(g: Ctx2D): void {
  const w = 2;
  const h = 1.5;
  g.fillStyle = '#d4b77c';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 150; i++) {
    g.fillStyle = i % 2 ? 'rgba(150, 110, 60, 0.28)' : 'rgba(255, 240, 200, 0.2)';
    g.fillRect(0, i * 0.01, w, 0.005);
  }
  for (const [y, d, c] of [
    [0.1, 0.06, '#a3322a'],
    [0.2, 0.03, '#2f6e4a'],
    [0.26, 0.03, '#a3322a'],
    [h - 0.16, 0.06, '#a3322a'],
    [h - 0.23, 0.03, '#2f6e4a'],
    [h - 0.29, 0.03, '#a3322a'],
  ] as [number, number, string][]) {
    g.fillStyle = c;
    g.fillRect(0, y, w, d);
  }
  // A band of red diamonds across its middle.
  g.fillStyle = '#b0402c';
  for (let x = 0.1; x < w; x += 0.2) {
    g.beginPath();
    g.moveTo(x, h / 2 - 0.07);
    g.lineTo(x + 0.07, h / 2);
    g.lineTo(x, h / 2 + 0.07);
    g.lineTo(x - 0.07, h / 2);
    g.closePath();
    g.fill();
  }
  g.strokeStyle = 'rgba(110, 70, 30, 0.6)';
  g.lineWidth = 0.02;
  g.strokeRect(0.01, 0.01, w - 0.02, h - 0.02);
}

/** Woven mats on these faces (facing up; one mat each, stretched to fit). */
export function matMesh(list: readonly Face[]): Mesh {
  const m = once('mat', () => painted('pagoda mat', 2, 1.5, 256, paintMat, 0.9, false));
  return litMesh(faces(list, 0, 0), m, { night: 0.38, env: 0.5 }, 'pagoda:mats');
}

/** One repeat of the carpet along its length (m), 1.6 m wide: red, a gold border down each side, a medallion. */
function paintCarpet(g: Ctx2D): void {
  const w = 1.6;
  g.fillStyle = '#9a1a14';
  g.fillRect(0, 0, w, w);
  for (const x of [0.05, w - 0.17]) {
    g.fillStyle = '#d9a43a';
    g.fillRect(x, 0, 0.12, w);
    g.fillStyle = '#7a1410';
    for (let y = 0.05; y < w; y += 0.2) {
      g.beginPath();
      g.moveTo(x + 0.06, y);
      g.lineTo(x + 0.11, y + 0.1);
      g.lineTo(x + 0.06, y + 0.2);
      g.lineTo(x + 0.01, y + 0.1);
      g.closePath();
      g.fill();
    }
  }
  g.strokeStyle = '#d9a43a';
  g.lineWidth = 0.02;
  g.beginPath();
  g.moveTo(w / 2, w / 2 - 0.36);
  g.lineTo(w / 2 + 0.36, w / 2);
  g.lineTo(w / 2, w / 2 + 0.36);
  g.lineTo(w / 2 - 0.36, w / 2);
  g.closePath();
  g.stroke();
  g.fillStyle = '#c8942e';
  g.beginPath();
  g.arc(w / 2, w / 2, 0.1, 0, Math.PI * 2);
  g.fill();
}

/** The red carpet on this face (facing up), its length along b. */
export function carpetMesh(face: Face): Mesh {
  const m = once('carpet', () => painted('pagoda carpet', 1.6, 1.6, 256, paintCarpet, 0.95, true));
  return litMesh(faces([face], 0, 1.6), m, { night: 0.34, env: 0.4 }, 'pagoda:carpet');
}

/** Red lacquer, a faint grain in it. */
function paintLacquer(g: Ctx2D): void {
  g.fillStyle = '#8a1c14';
  g.fillRect(0, 0, 1, 1);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(${i % 2 ? '60, 6, 4' : '170, 50, 36'}, ${0.08 + hash3(i, 1, 2, 917) * 0.08})`;
    g.fillRect(0, i * 0.025 + hash3(i, 3, 4, 918) * 0.01, 1, 0.006 + hash3(i, 5, 6, 919) * 0.01);
  }
}

/** Red lacquered tops on these faces (facing up). */
export function lacquerMesh(list: readonly Face[]): Mesh {
  const m = once('lacquer', () => painted('pagoda lacquer', 1, 1, 128, paintLacquer, 0.32, true));
  return litMesh(faces(list, 1, 1, true), m, { night: 0.4, env: 0.8 }, 'pagoda:lacquer');
}

// ── The flame arch behind the Buddha ─────────────────────────────────────

/** The arch's canvas (m): it stands on the Buddha's pedestal behind him. */
export const AURA = { w: 3.6, h: 4.6 };

/** The pointed arch of flames, deep red inside, lighter round his head, a halo there with a fringe of flames. */
function paintAura(pen: KbachPen, head: number): void {
  const fill = pen.ground.createRadialGradient(0, head, 0.05, 0, head * 0.85, 2.6);
  fill.addColorStop(0, '#c0341f');
  fill.addColorStop(0.4, '#8f1a12');
  fill.addColorStop(1, '#4c0a07');
  flameArch(pen, 0, 0.0, { w: 1.32, shoulder: 1.9, tip: 3.7, frame: 0.1, flames: 0.27, fill, inlay: GLASS_GREEN });
  halo(pen, 0, head, 0.42, { w: 0.045, flames: 0.17, inlay: GLASS_BLUE });
}

/** The gilt arch (a cut-out panel `AURA` big), its foot's middle at the origin, facing −z; `head` is his head's middle over its foot (m). */
export function auraMesh(head: number): Mesh {
  const m = once(`aura:${head.toFixed(2)}`, () => gildMaterial('pagoda aura', gilded(AURA.w, AURA.h, 512, (pen) => paintAura(pen, head), true), { cut: true, bump: 2 }));
  return litMesh(faces([{ facing: '-z', at: 0, a0: -AURA.w / 2, a1: AURA.w / 2, b0: 0, b1: AURA.h }], 0, 0), m, { night: 0.75, env: 1 }, 'pagoda:aura');
}

// ── The back wall: the Bodhi tree ─────────────────────────────────────────

/** A Bodhi leaf (heart-shaped, drawn out to a long tip), its stalk at (x, y), its tip toward `ang`, `s` m long. */
function leaf(g: Ctx2D, x: number, y: number, ang: number, s: number, color: string): void {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.scale(s, s);
  g.beginPath();
  g.moveTo(0.08, 0);
  g.bezierCurveTo(-0.06, 0.24, 0.2, 0.47, 0.45, 0.36);
  g.bezierCurveTo(0.62, 0.28, 0.74, 0.1, 1.06, 0);
  g.bezierCurveTo(0.74, -0.1, 0.62, -0.28, 0.45, -0.36);
  g.bezierCurveTo(0.2, -0.47, -0.06, -0.24, 0.08, 0);
  g.fillStyle = color;
  g.fill();
  g.strokeStyle = 'rgba(214, 232, 160, 0.4)';
  g.lineWidth = 0.03;
  g.beginPath();
  g.moveTo(0.08, 0);
  g.lineTo(0.86, 0);
  g.moveTo(-0.22, 0);
  g.lineTo(0.08, 0);
  g.stroke();
  g.restore();
}

/**
 * The back wall (`w` × `h` m, the origin at its foot's middle): a sky deep
 * blue high up and warm low down, blue hills and white clouds far off, a
 * soft light round the Buddha's head; the Bodhi tree over it all, its
 * trunk behind the arch, its boughs spreading to the corners in a canopy
 * of heart-shaped leaves; a gold line down each side.
 */
function paintMural(g: Ctx2D, w: number, h: number, head: number): void {
  const sky = g.createLinearGradient(0, h, 0, 0);
  sky.addColorStop(0, '#2f67a4');
  sky.addColorStop(0.3, '#6fa2c8');
  sky.addColorStop(0.55, '#d7dcc8');
  sky.addColorStop(0.75, '#e8cf94');
  sky.addColorStop(1, '#b8803e');
  g.fillStyle = sky;
  g.fillRect(-w / 2, 0, w, h);

  // Far off, blue hills along the foot of the sky; soft clouds over them.
  g.fillStyle = 'rgba(92, 128, 140, 0.55)';
  g.beginPath();
  g.moveTo(-w / 2, 1.9);
  for (let x = -w / 2; x <= w / 2 + 0.01; x += 0.1) g.lineTo(x, 2.25 + 0.28 * Math.sin(x * 1.7 + 0.8) + 0.16 * Math.sin(x * 4.1));
  g.lineTo(w / 2, 1.9);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(64, 104, 96, 0.6)';
  g.beginPath();
  g.moveTo(-w / 2, 1.8);
  for (let x = -w / 2; x <= w / 2 + 0.01; x += 0.1) g.lineTo(x, 2.02 + 0.18 * Math.sin(x * 2.6 + 2.1) + 0.08 * Math.sin(x * 7.3));
  g.lineTo(w / 2, 1.8);
  g.closePath();
  g.fill();
  for (const [cx, cy, r] of [
    [-3.1, 3.15, 0.34],
    [-2.3, 2.85, 0.26],
    [2.6, 3.05, 0.32],
    [3.25, 2.7, 0.24],
  ]) {
    for (let k = 0; k < 5; k++) {
      const x = cx + (k - 2) * r * 0.62;
      const y = cy + Math.sin(k * 1.9) * r * 0.18 + (k === 2 ? r * 0.25 : 0);
      g.fillStyle = 'rgba(255, 250, 238, 0.85)';
      g.beginPath();
      g.arc(x, y, r * (k === 2 ? 0.75 : 0.55), 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(214, 170, 80, 0.8)';
    g.lineWidth = 0.02;
    g.beginPath();
    g.moveTo(cx - r * 1.5, cy - r * 0.35);
    g.lineTo(cx + r * 1.5, cy - r * 0.35);
    g.stroke();
  }

  // A soft light round his head.
  const soft = g.createRadialGradient(0, head, 0.3, 0, head, 3.2);
  soft.addColorStop(0, 'rgba(255, 244, 210, 0.95)');
  soft.addColorStop(0.5, 'rgba(255, 236, 190, 0.4)');
  soft.addColorStop(1, 'rgba(255, 236, 190, 0)');
  g.fillStyle = soft;
  g.fillRect(-w / 2, 0, w, h);

  // The tree: the trunk, boughs spreading out and up to the corners.
  g.fillStyle = '#5a3b24';
  ribbon(g, bezier([0, 1.6], [0.08, 3], [-0.06, 4.3], [0, h + 0.2]), 0.6, 0.28);
  for (const s of [-1, 1]) {
    ribbon(g, bezier([0, 4.2], [s * 0.9, 4.6], [s * 2.1, 4.7], [s * 3.9, 5.1]), 0.28, 0.07);
    ribbon(g, bezier([0, 4.9], [s * 0.7, 5.5], [s * 1.6, 5.9], [s * 2.8, h + 0.1]), 0.22, 0.06);
    ribbon(g, bezier([s * 1.7, 4.72], [s * 2.3, 4.45], [s * 2.9, 4.1], [s * 3.6, 3.85]), 0.13, 0.04);
    ribbon(g, bezier([s * 2.5, 4.85], [s * 2.9, 5.4], [s * 3.3, 5.8], [s * 3.9, 6.0]), 0.11, 0.035);
    ribbon(g, bezier([s * 1.1, 5.35], [s * 1.2, 5.9], [s * 1.0, 6.2], [s * 0.8, h + 0.1]), 0.1, 0.04);
  }

  // The leaves, the shaded ones first, the sunlit ones over them; the canopy hangs lower at the sides.
  const greens = [
    ['#1d4a1b', '#255a20', '#2a6424'],
    ['#35742b', '#3f8432', '#3a7c2d'],
    ['#579838', '#6aab44', '#82bd50'],
  ];
  const step = 0.15;
  for (let pass = 0; pass < 3; pass++)
    for (let i = 0; i * step < w + 0.3; i++)
      for (let j = 0; 2.9 + j * step < h + 0.15; j++) {
        const x0 = -w / 2 - 0.15 + i * step;
        const y0 = 2.9 + j * step;
        const r = hash3(i, j, pass, 911);
        const r2 = hash3(i, j, pass, 912);
        const r3 = hash3(i, j, pass, 913);
        const x = x0 + (r - 0.5) * step * 1.5;
        const y = y0 + (r2 - 0.5) * step * 1.5;
        const t = Math.min(1, Math.abs(x) / (w / 2));
        const low = 4.75 - 1.5 * t * t * (3 - 2 * t) + (hash3(Math.floor(x / 0.45), 3, 0, 914) - 0.5) * 0.55;
        if (y < low + pass * 0.12) continue;
        // (gaps of sky in the canopy, fewer in the front leaves)
        if (hash3(Math.floor((x + 5) / 0.5), Math.floor(y / 0.4), 0, 915) < 0.14 - pass * 0.03 && r3 < 0.8) continue;
        const ang = -Math.PI / 2 + (r3 - 0.5) * 2.3;
        leaf(g, x, y, ang, 0.16 + r2 * 0.09, greens[pass][Math.floor(r3 * 3)]);
      }

  // Gold lines down the sides.
  g.fillStyle = '#c8952e';
  g.fillRect(-w / 2, 0, 0.05, h);
  g.fillRect(w / 2 - 0.05, 0, 0.05, h);
}

/** The back wall's painting (`w` × `h` m), its foot's middle at the origin, facing −z; `head` is the Buddha's head's middle over the wall's foot (m). */
export function muralMesh(w: number, h: number, head: number): Mesh {
  const m = once(`mural:${w}:${h}:${head.toFixed(2)}`, () => {
    const px = 1024;
    const ppm = px / w;
    const H = Math.round(h * ppm);
    const [c, g] = canvas(px, H);
    g.setTransform(ppm, 0, 0, -ppm, px / 2, H);
    paintMural(g, w, h, head);
    // By night the candles on the altar light it: warm round him, fading up into the dark.
    const [gc, G] = canvas(px, H);
    G.drawImage(c, 0, 0);
    G.setTransform(ppm, 0, 0, -ppm, px / 2, H);
    const lamp = G.createRadialGradient(0, head * 0.55, 0.4, 0, head * 0.7, h * 0.95);
    lamp.addColorStop(0, '#ffffff');
    lamp.addColorStop(0.45, '#8a8a8a');
    lamp.addColorStop(1, '#1c1c1c');
    G.globalCompositeOperation = 'multiply';
    G.fillStyle = lamp;
    G.fillRect(-w / 2, 0, w, h);
    const map = texture(c, 'pagoda mural', true, false);
    const mat = new MeshStandardMaterial({ map, roughness: 0.82, metalness: 0, envMap: sacredEnv(), emissiveMap: texture(gc, 'pagoda mural glow', true, false), emissive: new Color(1, 0.62, 0.34), emissiveIntensity: 0 });
    mat.name = 'pagoda mural';
    return mat;
  });
  return litMesh(faces([{ facing: '-z', at: 0, a0: -w / 2, a1: w / 2, b0: 0, b1: h }], 0, 0), m, { night: 0.75, env: 0.6 }, 'pagoda:mural');
}
