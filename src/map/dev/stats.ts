import type { WebGLRenderer } from 'three';

/**
 * The frame rate panel: frames a second, each frame's time and the worst of the last second, a graph of the last
 * 4 seconds (lines at 60 and 30 a second), the page's own JS time a frame (the map's step and its draw: what the CPU
 * spends; the rest of a slow frame is the GPU or the browser), the loop's cap and pace (idle and an unfocused window
 * draw fewer frames on purpose), the graphics level and drawing size, draws and triangles a frame (the shadow pass
 * and the effects too), the JS heap (Chrome), what three keeps on the GPU, and the sound's rate.
 *
 * Opened by the 📈 FPS button beside 🐞 Report on the dev server (kept open across reloads), or by `?stats=1` on
 * any page, a build too (a phone on the live site). A tap on its head folds it to its first line. Nothing is sent
 * anywhere; it costs a text update twice a second and a small graph four times a second.
 */
export interface FrameStats {
  readonly on: boolean;
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
  /** The sound: its rate (Hz) and state, or null before it starts. */
  sound: () => { rate: number; state: string } | null;
  /** The 📈 FPS button (the dev server). */
  button: boolean;
  /** Open at once (`?stats=1`). */
  open: boolean;
}

const KEEP = 'angkor-map-stats';
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
      pointer-events: auto; cursor: pointer; user-select: none; -webkit-user-select: none; display: none;
      backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
    .st-fps.on { display: block; }
    .st-fps-top { font-size: 13px; font-weight: 600; white-space: nowrap; }
    .st-fps-top b { font-size: 15px; }
    .st-fps canvas { display: block; width: 196px; height: 40px; margin: 4px 0 3px; }
    .st-fps-rest { white-space: pre; color: #cfc8b8; }
    .st-fps.folded canvas, .st-fps.folded .st-fps-rest { display: none; }
    .st-ok { color: #8ff0a0; } .st-meh { color: #ffd76a; } .st-bad { color: #ff8a7a; }
    .fb-button.st-open { left: 252px !important; }
    body.freecam .st-open { display: none !important; }
  `;
  document.head.append(style);
  document.body.append(panel);
  panel.addEventListener('click', () => {
    folded = !folded;
    panel.classList.toggle('folded', folded);
  });

  let btn: HTMLButtonElement | null = null;
  const setOn = (v: boolean) => {
    on = v;
    panel.classList.toggle('on', v);
    btn?.classList.toggle('is-on', v);
    // (every pass of the frame counted: the shadow map, the scene, the effects; reset by `begin`)
    h.renderer.info.autoReset = !v;
    if (v) {
      head = count = 0;
      lastDrawn = 0;
    }
  };
  if (h.button) {
    btn = document.createElement('button');
    btn.className = 'fb-button st-open';
    btn.textContent = '📈 FPS';
    btn.title = 'Frame rate panel';
    btn.addEventListener('click', () => {
      setOn(!on);
      try {
        localStorage.setItem(KEEP, on ? '1' : '0');
      } catch {
        /* (no storage: not kept) */
      }
    });
    document.body.append(btn);
  }
  let kept = false;
  try {
    kept = h.button && localStorage.getItem(KEEP) === '1';
  } catch {
    /* (no storage) */
  }
  setOn(h.open || kept);

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
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const gm = h.renderer.info.memory;
    const s = h.sound();
    const lines = [
      `CPU   ${n ? (csum / n).toFixed(1) : '–'} ms (worst ${cworst.toFixed(1)})`,
      `Cap   ${cap} · ${MODE[loop?.mode ?? ''] ?? loop?.mode ?? '?'}`,
      `Look  ${h.graphics()}`,
      `Draw  ${draws} calls · ${(tris / 1e6).toFixed(2)} M tris`,
      `GPU   ${gm.geometries} geometries · ${gm.textures} textures`,
      ...(mem ? [`Heap  ${(mem.usedJSHeapSize / 2 ** 20).toFixed(0)} MB (JS)`] : []),
      `Sound ${s ? `${(s.rate / 1000).toFixed(0)} kHz · ${s.state}` : 'not started'}`,
    ];
    rest.textContent = lines.join('\n');
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
