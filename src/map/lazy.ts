import { WebGLRenderTarget, type Camera, type Mesh, type Object3D, type Scene, type WebGLRenderer } from 'three';
import type { MapContext, MapFrame, MapPart } from './types';

/**
 * Parts built only when they are needed (main.ts `LATER`): the rain, the
 * rainbow, the snow (24 000 flakes, the snowmen) and the festival (≈ 8 000
 * boxes and a crowd) may never show on a visit, so they are not built with
 * the rest before Start unless the page opens wanting them (the URL, the
 * saved settings, the calendar: main.ts builds those in their place, as
 * before). The others wait here:
 *
 * - `defer`: in the build, a part that is not wanted yet (its module is
 *   loaded only when it is built);
 * - `watch(f)`: every frame of the live page (twice a second of the map's
 *   time), each waiting part is asked whether it is wanted now (the weather
 *   wants rain once a shower's clouds begin to build, snow the moment the
 *   setting is picked; the festival calendar a day ahead). A wanted part is
 *   built in the background, one at a time: its module loaded, then built
 *   in idle time (`requestIdleCallback`), its shaders compiled side by side
 *   off the frame (`compileFor`), and only then does it join the map
 *   (main.ts `arrive`: the scene, `parts`, the blocks line, the graphics
 *   level's block shapes). A few frames later it draws with nothing left to
 *   compile: no hitch;
 * - `settle(f)`: a headless shot builds any waiting part its moment wants at
 *   once (none should: main.ts builds what the URL asks in its place).
 *
 * A part that fails to build is logged and left out, as at load; it is not
 * tried again. `states` names each part's state (`__mapStats.late`).
 */

type Builder = (ctx: MapContext) => MapPart | Promise<MapPart>;

/** A part built later: its name, its module, and whether it is wanted this frame (`now`: shown this very frame, for a shot; else `wanted`). */
export interface LateSpec {
  name: string;
  load: () => Promise<Builder>;
  wanted: (f: MapFrame) => boolean;
  now?: (f: MapFrame) => boolean;
}

export type LateState = 'waiting' | 'building' | 'built' | 'failed';

/** What main.ts does with a part built later, and with one that failed. */
export interface LateHooks {
  ctx: MapContext;
  /** It joins the map (ms: its build, its shaders' compile: `compileFor`'s times). */
  arrive(name: string, part: MapPart, ms: { build: number; compile: CompileTimes }): void;
  fail(name: string, e: unknown): void;
}

/** How often the waiting parts are asked (s of the map's time). */
const WATCH_EVERY = 0.5;
/** Idle time is waited for at most this long (ms) before a build or a join goes ahead anyway. */
const IDLE_WAIT = 400;
/** The shaders' compile is waited for at most this long (ms): then the part joins, and the rest compiles as it draws. */
const COMPILE_WAIT = 5000;

/** An idle moment of the main thread (or `IDLE_WAIT` ms), for the work of a build that can wait. */
function idle(): Promise<void> {
  return new Promise((r) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => r(), { timeout: IDLE_WAIT });
    else setTimeout(r, 16);
  });
}

/**
 * Compile the shaders of `object` (not yet in `scene`) as the map will draw
 * it — into the post effects' target (post.ts: no tone mapping, linear
 * colour; a program compiled for the screen would be another), with the
 * scene's lights and fog — side by side (`KHR_parallel_shader_compile`), the
 * frames going on meanwhile. Resolves once they are ready (at most `wait` ms)
 * and linked: each program's first use (its link checked, its uniforms
 * looked up) done here, one an idle moment with `spread` (a browser without
 * parallel compiling finishes each program there, not in the frame that
 * first draws it). The shadow pass's depth programs are compiled at its
 * first shadow draw.
 */
export async function compileFor(renderer: WebGLRenderer, object: Object3D, camera: Camera, scene: Scene, spread = false, wait = COMPILE_WAIT): Promise<CompileTimes> {
  const t0 = performance.now();
  const target = new WebGLRenderTarget(1, 1);
  const was = { target: renderer.getRenderTarget(), face: renderer.getActiveCubeFace(), level: renderer.getActiveMipmapLevel() };
  let compiled: Promise<unknown>;
  try {
    renderer.setRenderTarget(target);
    compiled = renderer.compileAsync(object, camera, scene);
  } finally {
    renderer.setRenderTarget(was.target, was.face, was.level);
  }
  const start = performance.now() - t0;
  try {
    await Promise.race([compiled.catch(() => undefined), new Promise((r) => setTimeout(r, wait))]);
  } finally {
    target.dispose();
  }
  const ready = performance.now() - t0;
  /** Each program, and the material it was first found with (for the slow ones' names). */
  const programs = new Map<{ getUniforms(): unknown }, string>();
  object.traverse((o) => {
    const m = (o as Mesh).material;
    for (const x of Array.isArray(m) ? m : m ? [m] : [])
      for (const p of (renderer.properties.get(x) as { programs?: Map<string, { getUniforms(): unknown }> }).programs?.values() ?? []) if (!programs.has(p)) programs.set(p, x.name || x.type);
  });
  const link: number[] = [];
  const slow: string[] = [];
  for (const [p, name] of programs) {
    if (spread) await idle();
    const l0 = performance.now();
    p.getUniforms();
    const ms = performance.now() - l0;
    link.push(ms);
    if (ms > SLOW_LINK) slow.push(name);
  }
  return { start, ready, link, slow };
}

/** A program's first use that takes longer than this (ms) is named in `CompileTimes.slow`. */
const SLOW_LINK = 10;

/** `compileFor`'s times (ms): its programs started (three's `compile`, on the main thread), all ready (from the start), each one's first use (its link checked, its uniforms looked up). */
export interface CompileTimes {
  start: number;
  ready: number;
  link: number[];
  /** The materials of the programs whose first use took over `SLOW_LINK` ms. */
  slow: string[];
}

interface Waiting extends LateSpec {
  state: LateState;
}

export class LateParts {
  private readonly list: Waiting[] = [];
  /** One build at a time (the last one started). */
  private queue: Promise<unknown> = Promise.resolve();
  /** Seconds until the waiting parts are asked again. */
  private clock = 0;
  /** Each part's state, by name. */
  readonly states: Record<string, LateState> = {};

  constructor(private readonly hooks: LateHooks) {}

  /** Build it later, when `wanted` says so. */
  defer(spec: LateSpec): void {
    this.list.push({ ...spec, state: 'waiting' });
    this.states[spec.name] = 'waiting';
  }

  /** The live page, every frame: a waiting part wanted now is built in the background, and joins the map when ready. */
  watch(f: MapFrame): void {
    if ((this.clock -= f.dt) > 0) return;
    this.clock = WATCH_EVERY;
    for (const w of this.list) if (w.state === 'waiting' && w.wanted(f)) void this.start(w, false);
  }

  /**
   * A headless shot: every waiting part its moment shows (`now`), built at
   * once (no idle wait) and joined; resolves with them (they missed this
   * frame's update: the caller runs it).
   */
  async settle(f: MapFrame): Promise<MapPart[]> {
    const wanted = this.list.filter((w) => w.state === 'waiting' && (w.now ?? w.wanted)(f));
    if (wanted.length) console.warn(`[map] late parts wanted by the shot but not built with the map: ${wanted.map((w) => w.name).join(', ')} (built now)`);
    const out: MapPart[] = [];
    for (const w of wanted) {
      const p = await this.start(w, true);
      if (p) out.push(p);
    }
    return out;
  }

  private start(w: Waiting, now: boolean): Promise<MapPart | null> {
    this.states[w.name] = w.state = 'building';
    const run = this.queue.then(() => this.build(w, now));
    this.queue = run;
    return run;
  }

  private async build(w: Waiting, now: boolean): Promise<MapPart | null> {
    const { ctx } = this.hooks;
    try {
      const make = await w.load();
      if (!now) await idle();
      const t0 = performance.now();
      const part = await make(ctx);
      const build = performance.now() - t0;
      const compile = await compileFor(ctx.renderer, part.object, ctx.camera, ctx.scene, !now);
      this.states[w.name] = w.state = 'built';
      this.hooks.arrive(w.name, part, { build, compile });
      return part;
    } catch (e) {
      this.states[w.name] = w.state = 'failed';
      this.hooks.fail(w.name, e);
      return null;
    }
  }
}
