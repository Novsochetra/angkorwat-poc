/**
 * The speed test (`speedtest=1` in the URL, any page of the map): measures
 * the live frame on this device with parts of the map turned off one by one,
 * so a phone tells what makes it slow. It starts 4 s after the map is entered
 * (the loading screen's button), and again with a tap on its panel (walk
 * somewhere else first to test there).
 *
 * A phone slows itself when it warms (iOS lowers the chip's clock), for tens
 * of seconds at a time: a step measured after another would show the heat,
 * not the step. So each step is measured in pairs, off and on in turn, three
 * times, and only the difference within each pair counts. And the time of a
 * picture is measured directly, not as frames a second (those stop at 60, and
 * jump between 60 and 30 with the screen's refresh): every frame, after the
 * map is drawn, a one-pixel read waits for the GPU (`ms`: the CPU's part and
 * the GPU's, one after the other). The frames a second (`fps`) are those of
 * the live loop meanwhile (with that wait in them): only the steps that do
 * not draw (the buttons, the glass blur, the recorder) need them.
 *
 * Use it with `fps=60` (no drop to 30) and a graphics level held
 * (`graphics=low`), else auto changes the level meanwhile. Nothing of it
 * loads without the URL value (main.ts imports it then only).
 */
import type { Light, Object3D, WebGLRenderer } from 'three';
import posthog, { isPostHogConfigured } from '../posthog';
import type { MapFrame, MapPart } from './types';

interface Step {
  label: string;
  /** Turns the thing off (the test's "on": the step applied); returns how to put it back. */
  apply(): () => void;
}
interface Slice {
  /** Median time of a picture (ms), and frames a second. */
  ms: number;
  fps: number;
}
interface Result {
  label: string;
  base: Slice;
  with: Slice;
  /** What the step saves of a picture (ms): the middle of its pairs' differences. */
  saved: number;
}

/** Each pair: the map as it is, then the step, this long each (ms); the first part of each is left out (settling). */
const SLICE_MS = 1100;
const SETTLE_MS = 250;
const PAIRS = 3;
const START_AFTER_MS = 4000;

const w = window as unknown as {
  scene: Object3D;
  renderer: WebGLRenderer;
  parts: MapPart[];
  post: { render(f: MapFrame): void };
  graphicsNow: { level: string; ratio: unknown };
  __loop?: { drawn: number; mode: string; fps: number };
  __speedtest?: { device: string; base: Slice; results: Result[] };
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const drawn = () => w.__loop?.drawn ?? 0;
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
/** The mean of the middle 60 % (Safari's clock counts whole ms: a mean of many sees between them, the ends left out for hitches). */
const middleMean = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const cut = Math.floor(s.length * 0.2);
  const mid = s.slice(cut, s.length - cut);
  return mid.reduce((a, b) => a + b, 0) / mid.length;
};

/** Times of the pictures drawn while `taking` (ms each: the map drawn, then a one-pixel read that waits for the GPU). */
let taking: number[] | null = null;
function timePictures(): void {
  const r = w.renderer;
  const gl = r.getContext();
  const px = new Uint8Array(4);
  const render = w.post.render.bind(w.post);
  w.post.render = (f) => {
    if (!taking) return render(f);
    const s = performance.now();
    render(f);
    r.setRenderTarget(null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    taking.push(performance.now() - s);
  };
}

/** One slice: settle, then the pictures' time and the loop's frames a second. */
async function slice(): Promise<Slice> {
  await wait(SETTLE_MS);
  const times: number[] = [];
  taking = times;
  const d0 = drawn();
  const t0 = performance.now();
  await wait(SLICE_MS - SETTLE_MS);
  taking = null;
  const fps = (drawn() - d0) / ((performance.now() - t0) / 1000);
  return { ms: middleMean(times), fps };
}

/** Parts hidden by name (their visibility put back after). */
function hideParts(names: (n: string) => boolean): () => void {
  const was = w.parts.filter((p) => names(p.name)).map((p) => [p.object, p.object.visible] as const);
  for (const [o] of was) o.visible = false;
  return () => {
    for (const [o, v] of was) o.visible = v;
  };
}

function steps(panel: HTMLElement): Step[] {
  return [
    {
      label: 'No lamp lights',
      apply() {
        const ls: Light[] = [];
        w.scene.traverse((o) => {
          const l = o as Light & { isPointLight?: boolean; isSpotLight?: boolean };
          if ((l.isPointLight || l.isSpotLight) && l.visible) ls.push(l);
        });
        for (const l of ls) l.visible = false;
        return () => ls.forEach((l) => (l.visible = true));
      },
    },
    {
      label: 'No shadows',
      apply() {
        const ls: Light[] = [];
        w.scene.traverse((o) => {
          const l = o as Light;
          if (l.isLight && l.castShadow) ls.push(l);
        });
        for (const l of ls) l.castShadow = false;
        w.renderer.shadowMap.enabled = false;
        return () => {
          for (const l of ls) l.castShadow = true;
          w.renderer.shadowMap.enabled = true;
          w.renderer.shadowMap.needsUpdate = true;
        };
      },
    },
    {
      label: 'Half the pixels',
      apply() {
        // (the level's own ratio, which main.ts holds every frame: a smaller one, as a level would have it)
        const g = w.graphicsNow;
        const was = g.ratio;
        g.ratio = w.renderer.getPixelRatio() * Math.SQRT1_2;
        return () => (g.ratio = was);
      },
    },
    { label: 'No grass, rice, trees', apply: () => hideParts((n) => n === 'vegetation' || n === 'undergrowth' || n === 'paddies' || n === 'jungle') },
    { label: 'No people, animals', apply: () => hideParts((n) => ['people', 'fauna', 'wildlife', 'jungleFauna', 'life'].includes(n)) },
    { label: 'No mist, clouds', apply: () => hideParts((n) => n === 'clouds') },
    { label: 'No water', apply: () => hideParts((n) => n === 'water') },
    { label: 'No temples, houses', apply: () => hideParts((n) => n.startsWith('landmark') || ['village', 'hamlet', 'camps', 'treasure', 'path'].includes(n)) },
    { label: 'No ground', apply: () => hideParts((n) => n === 'terrain') },
    {
      label: 'No buttons on screen',
      apply() {
        const was = [...document.body.children].filter((e): e is HTMLElement => e instanceof HTMLElement && e !== panel && e !== w.renderer.domElement);
        const vis = was.map((e) => e.style.visibility);
        for (const e of was) e.style.visibility = 'hidden';
        return () => was.forEach((e, i) => (e.style.visibility = vis[i]));
      },
    },
    {
      label: 'No glass blur',
      apply() {
        const css = document.createElement('style');
        css.textContent = '*, *::before, *::after { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }';
        document.head.append(css);
        return () => css.remove();
      },
    },
    {
      label: 'No PostHog recording',
      apply() {
        const was = isPostHogConfigured && posthog.sessionRecordingStarted();
        if (was) posthog.stopSessionRecording();
        return () => {
          if (was) posthog.startSessionRecording();
        };
      },
    },
    { label: 'Only the sky', apply: () => hideParts((n) => n !== 'atmosphere') },
  ];
}

/** Frames come again after a change (a step that changes the lights compiles shaders: its first frames are slow). */
async function framesAgain(): Promise<void> {
  const d = drawn();
  while (drawn() < d + 3) await wait(50);
}

export function startSpeedTest(): void {
  timePictures();
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;left:50%;top:max(6px,env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483647;' +
    'background:rgba(0,0,0,0.82);color:#fff;font:11px/1.3 ui-monospace,Menlo,monospace;padding:8px 10px;border-radius:8px;' +
    'max-width:calc(100vw - 20px);white-space:pre;overflow:hidden;pointer-events:auto;';
  document.body.append(panel);
  const gl = w.renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  const device = () =>
    `${gpu.replace(/^ANGLE \((.*)\)$/, '$1').slice(0, 60)}\ndpr ${devicePixelRatio} · canvas ${w.renderer.domElement.width}×${w.renderer.domElement.height} · level ${w.graphicsNow.level}`;

  let running = false;
  const run = async () => {
    running = true;
    const list = steps(panel);
    const results: Result[] = [];
    const firsts: Slice[] = [];
    const show = (now: string) => {
      const b = firsts[0];
      const head = b ? `As you play: ${b.ms.toFixed(1)} ms a picture, ${b.fps.toFixed(0)} fps\n` : '';
      const rows = results.map((r) => {
        const pct = (100 * r.saved) / r.base.ms;
        const fps = `${r.base.fps.toFixed(0)}→${r.with.fps.toFixed(0)} fps`;
        return `${r.label.padEnd(22)}${r.saved.toFixed(1).padStart(5)} ms${`${pct.toFixed(0)}%`.padStart(5)}  ${fps}`;
      });
      panel.textContent = `SPEED TEST  ${device()}\n${head}${'step'.padEnd(22)} saves of a picture   fps\n${rows.join('\n')}${now ? `\n${now}` : ''}`;
    };
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      show(`… ${i + 1}/${list.length}: ${s.label} (hold still, do not touch)`);
      // (once off and back first: shaders the step needs compile now, not in a measured slice)
      let undo = s.apply();
      await framesAgain();
      undo();
      await framesAgain();
      const base: Slice[] = [];
      const withIt: Slice[] = [];
      for (let k = 0; k < PAIRS; k++) {
        base.push(await slice());
        undo = s.apply();
        await framesAgain();
        withIt.push(await slice());
        undo();
        await framesAgain();
      }
      firsts.push(base[0]);
      const pick = (xs: Slice[]): Slice => ({ ms: median(xs.map((x) => x.ms)), fps: median(xs.map((x) => x.fps)) });
      results.push({ label: s.label, base: pick(base), with: pick(withIt), saved: median(base.map((b, k) => b.ms - withIt[k].ms)) });
      show('');
    }
    w.__speedtest = { device: device(), base: firsts[0], results };
    console.table(results.map((r) => ({ step: r.label, baseMs: r.base.ms, withMs: r.with.ms, baseFps: r.base.fps, withFps: r.with.fps })));
    show('Done. Take a screenshot. Tap here to run again.');
    running = false;
  };
  panel.onclick = () => {
    if (!running) void run();
  };

  panel.textContent = 'SPEED TEST: press the button to start, then hold still.';
  const begin = async () => {
    // (the loop waits behind the loading screen's button: start once frames come)
    let d = drawn();
    for (;;) {
      await wait(1000);
      if (drawn() > d + 3) break;
      d = drawn();
    }
    panel.textContent = `SPEED TEST  ${device()}\nStarting in ${START_AFTER_MS / 1000} s: hold still, do not touch.`;
    await wait(START_AFTER_MS);
    if (!running) await run();
  };
  void begin();
}
