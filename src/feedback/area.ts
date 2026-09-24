import { Color, ShaderMaterial, Vector3, WebGLRenderTarget, type Camera, type InstancedMesh, type Material, type Matrix4, type Mesh, type Object3D, type WebGLRenderer } from 'three';
import { describe, type Pick } from './pick';
import type { SourceTrace } from './sourceTrace';

export interface Point {
  x: number;
  y: number;
}

/** One camera's view on screen (client pixels). */
export interface AreaView {
  camera: Camera;
  rect: { left: number; top: number; width: number; height: number };
}

/** One mesh, or one block of an instanced mesh, seen inside a drawn area. */
export interface AreaItem {
  kind: 'block' | 'mesh';
  /** e.g. "gopura · sandstone block". */
  label: string;
  /** Material family or mesh material name. */
  material: string;
  /** Block size text ('' for plain meshes). */
  size: string;
  /** Block centre, as the report writes it ('' for plain meshes). */
  centre: string;
  /** The same centre as numbers, and their unit (for spans). */
  at?: Vector3;
  unit: string;
  /** Which instance of which mesh. */
  ref: string;
  trace?: SourceTrace;
  /** World matrix of a unit cube around the block (for its outline). */
  block?: Matrix4;
  /** How many pixels of it show inside the area. */
  pixels: number;
}

/** A box or loop drawn on screen, and everything seen inside it. */
export interface Area {
  tool: 'box' | 'loop';
  /** The drawn outline, client pixels. It only lines up with the scene while the view is unchanged. */
  outline: Point[];
  items: AreaItem[];
  /** Things seen but left out of `items` (too many). */
  more: number;
  /** Pixels inside the area, and how many of them show nothing (sky / background). */
  pixels: number;
  empty: number;
  /** The camera it was drawn in, and its pose then (see {@link viewPose}). */
  camera: Camera;
  pose: number[];
}

const MAX_ITEMS = 5000;
const MAX_PIXELS = 4e6;

/**
 * Everything visible inside a box or loop drawn on screen, as one pick. The
 * pickable meshes are drawn once more with every block's number as its colour
 * (an "ID pass"), then the pixels inside the outline are read back: exactly the
 * blocks that show there, and none hidden behind them.
 */
export function areaPick(renderer: WebGLRenderer, roots: Object3D[], view: AreaView, tool: Area['tool'], outline: Point[], fallback: Vector3): Pick {
  const { seen, pixels, empty } = seenInside(renderer, roots, view, outline);
  const items: AreaItem[] = [];
  for (const s of seen.slice(0, MAX_ITEMS)) {
    const d = describe(s.mesh, s.instanceId);
    items.push({ kind: d.kind, label: d.label, material: d.material, size: d.size, centre: d.centre, at: d.at, unit: d.unit, ref: d.ref, trace: d.trace, block: d.block, pixels: s.pixels });
  }
  const blocks = items.filter((i) => i.kind === 'block').length;
  const meshes = items.length - blocks;
  const what = [blocks && `${blocks} block${blocks === 1 ? '' : 's'}`, meshes && `${meshes} other mesh${meshes === 1 ? '' : 'es'}`].filter(Boolean).join(' + ') || 'nothing but sky';
  const shown = pixels ? Math.round((100 * (pixels - empty)) / pixels) : 0;
  const facts: [string, string][] = [
    ['Area', `${tool} drawn on the screen · ${what} show inside it${seen.length > items.length ? ` (and ${seen.length - items.length} more, not listed)` : ''}`],
  ];
  if (empty) facts.push(['Covers', `${shown} % of the area; the rest is sky / background`]);
  return {
    kind: 'area',
    point: pinPoint(items, view, outline) ?? fallback,
    label: `${tool}: ${what}`,
    facts,
    colliders: [],
    area: { tool, outline, items, more: seen.length - items.length, pixels, empty, camera: view.camera, pose: viewPose(view) },
  };
}

/** Camera matrices and view rectangle: while these hold, a drawn outline still lines up with the scene. */
export function viewPose(view: AreaView): number[] {
  const { camera: c, rect: r } = view;
  return [...c.matrixWorld.elements, ...c.projectionMatrix.elements, r.left, r.top, r.width, r.height];
}

export function samePose(a: number[], b: number[]): boolean {
  // (matrices to a millimetre / milliradian, the rectangle to half a pixel)
  return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < (i < 32 ? 1e-3 : 0.5));
}

/** The pin goes on the block nearest the middle of the area. */
function pinPoint(items: AreaItem[], view: AreaView, outline: Point[]): Vector3 | null {
  const c = outline.reduce((s, p) => ({ x: s.x + p.x / outline.length, y: s.y + p.y / outline.length }), { x: 0, y: 0 });
  const r = view.rect;
  const v = new Vector3();
  let best: Vector3 | null = null;
  let bestD = Infinity;
  for (const it of items) {
    if (!it.block) continue;
    const s = v.setFromMatrixPosition(it.block).project(view.camera);
    const d = Math.hypot(r.left + ((s.x + 1) / 2) * r.width - c.x, r.top + ((1 - s.y) / 2) * r.height - c.y);
    if (d < bestD) [bestD, best] = [d, new Vector3().setFromMatrixPosition(it.block)];
  }
  return best;
}

// ── The ID pass ──────────────────────────────────────────────────────────────

interface Seen {
  mesh: Mesh;
  instanceId?: number;
  pixels: number;
}

/** A mesh drawn in the ID pass: its instances are numbered base … base + count − 1. */
interface Slot {
  mesh: Mesh;
  base: number;
  count: number;
}

/** Every mesh / block showing inside the outline, most pixels first. */
function seenInside(renderer: WebGLRenderer, roots: Object3D[], view: AreaView, outline: Point[]): { seen: Seen[]; pixels: number; empty: number } {
  const r = view.rect;
  const scale = Math.min(renderer.getPixelRatio(), Math.sqrt(MAX_PIXELS / Math.max(1, r.width * r.height)));
  const W = Math.max(1, Math.round(r.width * scale));
  const H = Math.max(1, Math.round(r.height * scale));
  // The outline in ID-image pixels (top-down), and its box clipped to the view.
  const xs = outline.map((p) => (p.x - r.left) * scale);
  const ys = outline.map((p) => (p.y - r.top) * scale);
  const clamp = (v: number, hi: number) => Math.min(hi, Math.max(0, v));
  const x0 = clamp(Math.floor(Math.min(...xs)), W);
  const x1 = clamp(Math.ceil(Math.max(...xs)), W);
  const y0 = clamp(Math.floor(Math.min(...ys)), H);
  const y1 = clamp(Math.ceil(Math.max(...ys)), H);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 1 || h < 1) return { seen: [], pixels: 0, empty: 0 };

  const mask = outlineMask(xs, ys, x0, y0, w, h);
  // (read-back rows run bottom-up)
  const { slots, data } = drawIds(renderer, roots, view.camera, W, H, x0, H - y1, w, h);
  const counts = new Map<number, number>();
  let pixels = 0;
  let empty = 0;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!mask[(h - 1 - j) * w + i]) continue;
      pixels++;
      const k = (j * w + i) * 4;
      const id = (data[k] | (data[k + 1] << 8) | (data[k + 2] << 16) | (data[k + 3] << 24)) >>> 0;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      else empty++;
    }

  const seen: Seen[] = [];
  for (const [id, n] of counts) {
    const slot = slotOf(slots, id);
    if (!slot) continue;
    const instanced = (slot.mesh as InstancedMesh).isInstancedMesh;
    seen.push({ mesh: slot.mesh, instanceId: instanced ? id - slot.base : undefined, pixels: n });
  }
  seen.sort((a, b) => b.pixels - a.pixels);
  return { seen, pixels, empty };
}

/** 1 where a pixel of the box (x0, y0, w, h) lies inside the outline. */
function outlineMask(xs: number[], ys: number[], x0: number, y0: number, w: number, h: number): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.beginPath();
  xs.forEach((x, i) => (i ? g.lineTo(x - x0, ys[i] - y0) : g.moveTo(x - x0, ys[i] - y0)));
  g.closePath();
  g.fill();
  const a = g.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = a[i * 4 + 3] >= 128 ? 1 : 0;
  return mask;
}

/** Binary search: the slot whose numbers include `id`. */
function slotOf(slots: Slot[], id: number): Slot | null {
  let lo = 0;
  let hi = slots.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = slots[mid];
    if (id < s.base) hi = mid - 1;
    else if (id >= s.base + s.count) lo = mid + 1;
    else return s;
  }
  return null;
}

// Each instance's number (0 = nothing) as four bytes of colour.
const ID_MATERIAL = new ShaderMaterial({
  uniforms: { idBase: { value: 1 } },
  vertexShader: /* glsl */ `
    uniform int idBase;
    flat varying int vId;
    void main() {
      vec4 p = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        p = instanceMatrix * p;
        vId = idBase + gl_InstanceID;
      #else
        vId = idBase;
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * p;
    }`,
  fragmentShader: /* glsl */ `
    flat varying int vId;
    void main() {
      uint id = uint(vId);
      gl_FragColor = vec4(uvec4(id, id >> 8, id >> 16, id >> 24) & 255u) / 255.0;
    }`,
});
ID_MATERIAL.name = 'feedback:id';
const idMaterials = new WeakMap<Mesh, ShaderMaterial>();

/**
 * Draw the pickable meshes into a W × H ID image with `camera`, and read back
 * the region (x, y, w, h), bottom-up. Materials and visibility are restored after.
 */
function drawIds(renderer: WebGLRenderer, roots: Object3D[], camera: Camera, W: number, H: number, x: number, y: number, w: number, h: number): { slots: Slot[]; data: Uint8Array } {
  const slots: Slot[] = [];
  const undo: (() => void)[] = [];
  const hide = (o: Object3D) => {
    o.visible = false;
    undo.push(() => (o.visible = true));
  };
  let next = 1;
  for (const root of roots)
    root.traverseVisible((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) {
        // Lines, points and sprites would draw their own colours into the image.
        if ('isLine' in o || 'isPoints' in o || 'isSprite' in o) hide(o);
        return;
      }
      const original = mesh.material;
      const first: Material | undefined = Array.isArray(original) ? original[0] : original;
      if (!first?.visible) return hide(o);
      let id = idMaterials.get(mesh);
      if (!id) idMaterials.set(mesh, (id = ID_MATERIAL.clone()));
      id.uniforms.idBase.value = next;
      id.side = first.side;
      id.colorWrite = first.colorWrite;
      const count = (mesh as InstancedMesh).isInstancedMesh ? (mesh as InstancedMesh).count : 1;
      slots.push({ mesh, base: next, count });
      next += count;
      mesh.material = id;
      undo.push(() => (mesh.material = original));
    });

  const target = new WebGLRenderTarget(W, H);
  const before = {
    target: renderer.getRenderTarget(),
    autoClear: renderer.autoClear,
    color: renderer.getClearColor(new Color()),
    alpha: renderer.getClearAlpha(),
    shadows: renderer.shadowMap.autoUpdate,
  };
  try {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.autoClear = false;
    renderer.shadowMap.autoUpdate = false;
    for (const root of roots) renderer.render(root, camera);
    const data = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(target, x, y, w, h, data);
    return { slots, data };
  } finally {
    for (const f of undo.reverse()) f();
    renderer.setRenderTarget(before.target);
    renderer.setClearColor(before.color, before.alpha);
    renderer.autoClear = before.autoClear;
    renderer.shadowMap.autoUpdate = before.shadows;
    target.dispose();
  }
}
