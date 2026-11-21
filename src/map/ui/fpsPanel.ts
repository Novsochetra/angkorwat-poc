import type { BufferGeometry, Material, Object3D, Texture, WebGLRenderer } from 'three';

/**
 * The frame rate panel: frames a second, each frame's time and the worst of the last second, a graph of the last
 * 4 seconds (lines at 60 and 30 a second), the page's own JS time a frame (the map's step and its draw: what the CPU
 * spends; the rest of a slow frame is the GPU or the browser), the loop's cap and pace (idle and an unfocused window
 * draw fewer frames on purpose), the graphics level and drawing size, draws and triangles a frame (the shadow pass
 * and the effects too), memory (the JS heap in Chrome, what the GPU keeps, estimated, the made sounds: the game's own
 * share; the tab's whole number is more and a page cannot read it), and the sound's rate.
 *
 * Shown by default, for every player: Settings › Graphics › "Show the frame rate" hides it (`fpsPanel`; `stats=0|1`
 * in the URL). Never in a shot, under the free camera or the story. A drag (mouse or finger) moves it anywhere, and
 * it opens there next time; a tap folds it to its first line. Nothing is sent
 * anywhere; it costs a text update twice a second and a small graph four times a second.
 */
export interface FrameStats {
  readonly on: boolean;
  /** Show or hide it (the setting). */
  show(on: boolean): void;
  /** A frame began (before the map's step). */
  begin(): void;
  /** The frame was drawn (`now`: its rAF time; after the draw). */
  end(now: number, drawn: boolean): void;
}

export interface StatsHooks {
  renderer: WebGLRenderer;
  /** The loop's cap and pace (main.ts `loop`). */
  loop: () => { fps: number; mode: string } | null;
  /** Graphics level, and the scene's drawing size (px). */
  graphics: () => string;
  /** The sound: its rate (Hz), state and its made buffers' memory (MB), or null before it starts. */
  sound: () => { rate: number; state: string; mb: number } | null;
  /** The map's scene: what it keeps on the GPU is added up from it (`gpuMemory`). */
  scene: Object3D;
  /** Shown at once (the setting). */
  open: boolean;
}

/** Where it was dragged to (its top-left corner, CSS px), kept across reloads. */
const PLACE = 'angkor-map-stats-at';
/** A press that moves less than this (px) is a tap: it folds the panel. */
const TAP = 5;
/** The GPU memory estimate is made again this often (ms): a walk over the scene, ≈ 1.5 ms on an M1 Max (more on a phone). */
const GPU_EVERY = 10000;

/**
 * What the scene keeps on the GPU, estimated (MB): every geometry's buffers once (its attributes, index and an
 * instanced mesh's matrices and colours) and every texture once (its pixels, a third more with mipmaps). Without
 * the drawing targets (the picture, its effects, the shadow map) and the browser's own: the tab's whole memory is
 * more, and a page cannot read it.
 */
export function gpuMemory(scene: Object3D): { meshes: number; textures: number } {
  const geos = new Set<BufferGeometry>();
  const texs = new Set<Texture>();
  let inst = 0;
  const mats = new Set<Material>();
  scene.traverse((o) => {
    const m = o as Object3D & { geometry?: BufferGeometry; material?: Material | Material[]; instanceMatrix?: { array: ArrayLike<number> & { byteLength: number } }; instanceColor?: { array: { byteLength: number } } | null };
    if (m.geometry) geos.add(m.geometry);
    if (m.instanceMatrix) inst += m.instanceMatrix.array.byteLength + (m.instanceColor?.array.byteLength ?? 0);
    if (m.material) for (const mt of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mt);
  });
  let meshes = inst;
  for (const g of geos) {
    for (const a of Object.values(g.attributes)) {
      const arr = (a as { array?: { byteLength: number }; data?: { array: { byteLength: number } } }).data?.array ?? (a as { array?: { byteLength: number } }).array;
      meshes += arr?.byteLength ?? 0;
    }
    meshes += g.index?.array.byteLength ?? 0;
  }
  const isTex = (v: unknown): v is Texture => !!v && typeof v === 'object' && (v as Texture).isTexture === true;
  for (const mt of mats) {
    for (const v of Object.values(mt)) if (isTex(v)) texs.add(v);
    const u = (mt as Material & { uniforms?: Record<string, { value: unknown }> }).uniforms;
    if (u) for (const k in u) if (isTex(u[k]?.value)) texs.add(u[k].value as Texture);
  }
  let textures = 0;
  for (const t of texs) {
    const img = t.image as { width?: number; height?: number; depth?: number; data?: { byteLength: number } } | null;
    if (!img) continue;
    const bytes = img.data?.byteLength ?? (img.width ?? 0) * (img.height ?? 0) * (img.depth ?? 1) * 4;
    textures += t.generateMipmaps ? bytes * 1.33 : bytes;
  }
  return { meshes: meshes / 2 ** 20, textures: textures / 2 ** 20 };
}

/** Frames kept for the graph (≈ 4 s at 60). */
const N = 240;

export function installStats(h: StatsHooks): FrameStats {
  const gap = new Float32Array(N);
  const cpu = new Float32Array(N);
  const at = new Float64Array(N);
  let head = 0;
  let count = 0;
  let lastDrawn = 0;
  let began = 0;
  let nextText = 0;
  let nextGraph = 0;
  let on = false;
  let folded = false;
  let draws = 0;
  let tris = 0;
  let gpu: { meshes: number; textures: number } | null = null;
  let gpuAt = -Infinity;

  const panel = document.createElement('div');
  panel.className = 'st-fps';
  panel.setAttribute('aria-hidden', 'true');
  const top = document.createElement('div');
  top.className = 'st-fps-top';
  const graph = document.createElement('canvas');
  const rest = document.createElement('div');
  rest.className = 'st-fps-rest';
  panel.append(top, graph, rest);
  const style = document.createElement('style');
  style.textContent = `
    .st-fps { position: fixed; left: 8px; top: 8px; z-index: 45; min-width: 196px; max-width: calc(100vw - 16px); box-sizing: border-box; padding: 6px 8px 7px; border-radius: 8px;
      background: rgba(12, 14, 18, 0.78); color: #e9e4d8; font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
      pointer-events: auto; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; display: none;
      backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
    .st-fps.on { display: block; }
    .st-fps.dragging { cursor: grabbing; opacity: 0.9; }
    .st-fps-top { font-size: 13px; font-weight: 600; white-space: nowrap; }
    .st-fps-top b { font-size: 15px; }
    .st-fps canvas { display: block; width: 196px; height: 40px; margin: 4px 0 3px; }
    .st-fps-rest { white-space: pre; color: #cfc8b8; }
    .st-fps.folded canvas, .st-fps.folded .st-fps-rest { display: none; }
    .st-ok { color: #8ff0a0; } .st-meh { color: #ffd76a; } .st-bad { color: #ff8a7a; }
    body.freecam .st-fps, body.st-on .st-fps { display: none !important; }
  `;
  document.head.append(style);
  document.body.append(panel);

  // Dragged anywhere with a mouse or a finger (kept within the window, and where it was left on the next visit);
  // a tap folds it.
  let x = 8;
  let y = 8;
  const place = () => {
    const w = panel.offsetWidth || 196;
    const hh = panel.offsetHeight || 40;
    x = Math.max(0, Math.min(innerWidth - w, x));
    y = Math.max(0, Math.min(innerHeight - hh, y));
    panel.style.left = `${Math.round(x)}px`;
    panel.style.top = `${Math.round(y)}px`;
  };
  try {
    const at = JSON.parse(localStorage.getItem(PLACE) ?? 'null') as unknown;
    if (Array.isArray(at) && at.length === 2 && at.every((v) => Number.isFinite(v))) [x, y] = at as [number, number];
  } catch {
    /* (no storage: the corner) */
  }
  place();
  addEventListener('resize', place);
  let press: { id: number; sx: number; sy: number; x0: number; y0: number; moved: boolean } | null = null;
  panel.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    // (the map under it never sees the press: no camera drag, no walk)
    e.stopPropagation();
    press = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x0: x, y0: y, moved: false };
    panel.setPointerCapture(e.pointerId);
  });
  panel.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    e.stopPropagation();
    const dx = e.clientX - press.sx;
    const dy = e.clientY - press.sy;
    if (!press.moved && Math.hypot(dx, dy) < TAP) return;
    press.moved = true;
    panel.classList.add('dragging');
    x = press.x0 + dx;
    y = press.y0 + dy;
    place();
  });
  const release = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.id) return;
    e.stopPropagation();
    const moved = press.moved;
    press = null;
    panel.classList.remove('dragging');
    if (moved) {
      try {
        localStorage.setItem(PLACE, JSON.stringify([Math.round(x), Math.round(y)]));
      } catch {
        /* (this visit only) */
      }
    } else if (e.type === 'pointerup') {
      folded = !folded;
      panel.classList.toggle('folded', folded);
      // (folded or opened, it may now stick out of the window)
      requestAnimationFrame(place);
    }
  };
  panel.addEventListener('pointerup', release);
  panel.addEventListener('pointercancel', release);

  const setOn = (v: boolean) => {
    on = v;
    panel.classList.toggle('on', v);
    // (every pass of the frame counted: the shadow map, the scene, the effects; reset by `begin`)
    h.renderer.info.autoReset = !v;
    // (shown: its saved place, kept within this window)
    if (v) requestAnimationFrame(place);
    if (v) {
      head = count = 0;
      lastDrawn = 0;
    }
  };
  setOn(h.open);

  /** The loop's pace in words (main.ts `pace`): fewer frames on purpose when idle or in the background. */
  const MODE: Record<string, string> = { full: 'full speed', idle: 'resting: no input', blurred: 'window in the back', waiting: 'waiting for Start' };
  const cls = (ms: number, cap: number) => (ms <= 1000 / cap + 2 ? 'st-ok' : ms <= 2000 / cap + 2 ? 'st-meh' : 'st-bad');

  function text(now: number): void {
    const loop = h.loop();
    const cap = loop?.fps ?? 60;
    // (the last second's frames)
    let n = 0;
    let sum = 0;
    let worst = 0;
    let csum = 0;
    let cworst = 0;
    for (let k = 0; k < count; k++) {
      const i = (head - 1 - k + N) % N;
      if (now - at[i] > 1000) break;
      n++;
      sum += gap[i];
      worst = Math.max(worst, gap[i]);
      csum += cpu[i];
      cworst = Math.max(cworst, cpu[i]);
    }
    const avg = n ? sum / n : 0;
    const fps = n && sum > 0 ? (1000 * n) / sum : 0;
    top.innerHTML = `<b class="${cls(avg, cap)}">${fps.toFixed(0)}</b> fps · ${avg.toFixed(1)} ms <span class="${cls(worst, cap)}">(worst ${worst.toFixed(0)})</span>`;
    if (folded) return;
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    const gm = h.renderer.info.memory;
    const s = h.sound();
    const lines = [
      `CPU   ${n ? (csum / n).toFixed(1) : '–'} ms (worst ${cworst.toFixed(1)})`,
      `Cap   ${cap} · ${MODE[loop?.mode ?? ''] ?? loop?.mode ?? '?'}`,
      `Look  ${h.graphics()}`,
      `Draw  ${draws} calls · ${(tris / 1e6).toFixed(2)} M tris`,
      `GPU   ${gm.geometries} geometries · ${gm.textures} textures`,
      ...memLines(mem, s),
      `Sound ${s ? `${(s.rate / 1000).toFixed(0)} kHz · ${s.state}` : 'not started'}`,
    ];
    rest.textContent = lines.join('\n');
  }

  /**
   * Memory: the JS heap (Chrome: used of its limit), what the GPU keeps (meshes and textures, estimated: `gpuMemory`)
   * and the made sounds. Their sum is the game's own share; the tab's number in the browser is more.
   */
  function memLines(mem: { usedJSHeapSize: number; jsHeapSizeLimit?: number } | undefined, s: { mb: number } | null): string[] {
    const t = performance.now();
    if (t - gpuAt > GPU_EVERY) {
      gpuAt = t;
      try {
        gpu = gpuMemory(h.scene);
      } catch {
        gpu = null;
      }
    }
    const js = mem ? mem.usedJSHeapSize / 2 ** 20 : 0;
    const g = gpu ? gpu.meshes + gpu.textures : 0;
    const snd = s?.mb ?? 0;
    const mb = (v: number) => (v >= 1024 ? `${(v / 1024).toFixed(2)} GB` : `${v.toFixed(0)} MB`);
    return [
      `Mem   ${mb(js + g + snd)} (game's own)`,
      ...(mem ? [`      JS ${mb(js)}${mem.jsHeapSizeLimit ? ` of ${mb(mem.jsHeapSizeLimit / 2 ** 20)}` : ''}`] : []),
      ...(gpu ? [`      GPU ≈ ${mb(g)} (meshes ${mb(gpu.meshes)} · tex ${mb(gpu.textures)})`] : []),
      `      sound ${mb(snd)}`,
    ];
  }

  function draw(cap: number): void {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = 196;
    const hgt = 40;
    if (graph.width !== w * dpr) {
      graph.width = w * dpr;
      graph.height = hgt * dpr;
    }
    const g = graph.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hgt);
    // (0‥50 ms up the graph; lines at 60 and 30 a second)
    const y = (ms: number) => hgt - Math.min(1, ms / 50) * hgt;
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(0, 0, w, hgt);
    const bw = w / N;
    for (let k = 0; k < count; k++) {
      const i = (head - count + k + N) % N;
      const ms = gap[i];
      g.fillStyle = ms <= 1000 / cap + 2 ? '#5fd27a' : ms <= 2000 / cap + 2 ? '#f2c14e' : '#ff6b5a';
      const x = w - (count - k) * bw;
      g.fillRect(x, y(ms), Math.max(1, bw - 0.2), hgt - y(ms));
      // (the page's own JS share of it, darker)
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x, y(Math.min(ms, cpu[i])), Math.max(1, bw - 0.2), hgt - y(Math.min(ms, cpu[i])));
    }
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1;
    for (const ms of [1000 / 60, 1000 / 30]) {
      g.beginPath();
      g.moveTo(0, Math.round(y(ms)) + 0.5);
      g.lineTo(w, Math.round(y(ms)) + 0.5);
      g.stroke();
    }
  }

  return {
    get on() {
      return on;
    },
    show(v) {
      if (v !== on) setOn(v);
    },
    begin() {
      if (!on) return;
      began = performance.now();
      h.renderer.info.reset();
    },
    end(now, drawn) {
      if (!on) return;
      const spent = performance.now() - began;
      if (drawn) {
        draws = h.renderer.info.render.calls;
        tris = h.renderer.info.render.triangles;
      }
      if (lastDrawn > 0) {
        gap[head] = now - lastDrawn;
        cpu[head] = spent;
        at[head] = now;
        head = (head + 1) % N;
        count = Math.min(N, count + 1);
      }
      lastDrawn = now;
      const t = performance.now();
      if (t >= nextText) {
        nextText = t + 500;
        text(now);
      }
      if (!folded && t >= nextGraph) {
        nextGraph = t + 250;
        draw(h.loop()?.fps ?? 60);
      }
    },
  };
}
