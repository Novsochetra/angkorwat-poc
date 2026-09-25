import { Group, Vector3 } from 'three';
import type { AngkorExplorer } from '../../character/AngkorExplorer';
import type { PlaceDef } from '../layout';
import type { MapContext, MapFrame, MapPart, RoamLevels, RoamMode, RoamSound } from '../types';
import { createBoat } from './boat';
import { OrbitFollowCam } from './followCam';
import { createRoamHud } from './hud';
import { parseScript, RoamControls } from './input';
import { createParachute } from './parachute';
import { createRoamTools } from './tools';
import { ROAM_SCALE, type FollowCam, type RoamBody, type RoamCtx, type RoamModeHandler, type RoamWorld } from './types';
import { createWalker } from './walker';
import { buildRoamWorld } from './world';

/**
 * Roaming the map: the explorer leaps off his ledge, glides down under a
 * parachute, walks, paddles the rivers and enters the temples. This file
 * runs the modes (roam/types.ts) and hands the camera between the overview
 * rig and the follow camera.
 *
 * URL (for checking): `roam=leap|glide|walk|boat` start in that mode ·
 * `at=x,z` or `at=x,y,z` where (m; y defaults to the ground or water) ·
 * `yaw=<deg>` facing · `sim=<script>` scripted input run before a shot
 * (input.ts `parseScript`, e.g. `sim=w:2,wr:3,j:0.5`) · `rcam=yaw,pitch,dist`
 * the follow camera's orbit (degrees relative to the facing, degrees, m) ·
 * the explorer's tools (tools.ts): `tool=lantern|torch|flashlight|camera|selfie`
 * start with it out · `act=wave|cheer|lookUp|peek` · `beam=mouse` with
 * `mouse=x,y` (0‥1 of the view) · `look=<outfit>` · `hat=0|1` ·
 * `face=<expression>` · `pview=yaw,pitch,fov` the camera's shot (degrees) ·
 * `gesture=…` and `saim=yaw,pitch,reach` the selfie · `keys=1` the key list.
 */
export interface MapRoam extends MapPart {
  readonly mode: RoamMode;
  /** The roaming explorer (feet, facing, size), for the mini-map and the tools. */
  readonly body: RoamBody;
  /** The follow camera (its `yaw` is the view's heading). */
  readonly cam: FollowCam;
  /** What the roaming modes know about the world (ground, water, places). */
  readonly world: RoamWorld;
  /** Roaming (the follow camera has the view). */
  readonly active: boolean;
  /** Leap off the ledge. */
  start(): void;
  /** Back to the overview (fades out and in). */
  stop(): Promise<void>;
  /** Headless shots: run the `sim=` script now (fixed steps). */
  simulate(f: MapFrame): void;
  /** For bug reports: where the explorer is, and URL params that start a shot there (null in the overview). */
  report(): { text: string; params: Record<string, string> } | null;
}

export interface RoamDeps {
  explorer: AngkorExplorer;
  /** The ledge: the explorer's feet and facing there. */
  feet: Vector3;
  yaw: number;
  /** Stop / start the foreground driving the explorer. */
  release(roaming: boolean): void;
  parts: readonly MapPart[];
  uiRoot: HTMLElement;
  canvas: HTMLCanvasElement;
  /** Tell the rest of the page (the picker interface, sound) the mode changed. */
  onMode(mode: RoamMode): void;
  /** Back in the overview: put the overview camera back. */
  onOverview(): void;
  /** Enter a place (fade and open its page). */
  onEnter(place: PlaceDef): void;
  playSound(s: RoamSound, gain: number): void;
}

const STEP = 1 / 30;

export function buildRoam(ctx: MapContext, deps: RoamDeps): MapRoam {
  const params = new URLSearchParams(location.search);
  const object = new Group();
  object.name = 'roam';
  const world = buildRoamWorld(ctx.field, deps.parts);
  const cam = new OrbitFollowCam(ctx.camera);
  const controls = new RoamControls(deps.canvas);
  const explorer = deps.explorer;
  const body: RoamBody = { explorer, pos: new Vector3().copy(deps.feet), vel: new Vector3(), yaw: deps.yaw, grounded: true, scale: 1 };
  const levels: RoamLevels = { wind: 0, wake: 0 };

  let mode: RoamMode = 'overview';
  let leaving = false;
  const hud = createRoamHud(deps.uiRoot, {
    onJump: () => api.start(),
    onBack: () => void api.stop(),
  });

  const tools = createRoamTools({ explorer, body, cam, world, hud, controls, canvas: deps.canvas });
  object.add(tools.object);

  const chute = createParachute();
  // (built now: the boat tied up by the River Gate shows in the overview too)
  const boat = createBoat(ctx.field);
  const handlers: Record<Exclude<RoamMode, 'overview'>, RoamModeHandler> = {
    leap: chute.leap,
    glide: chute.glide,
    walk: createWalker(),
    boat,
  };
  for (const h of new Set(Object.values(handlers))) if (h.object) object.add(h.object);

  const rctx: RoamCtx = {
    world,
    body,
    input: controls.state,
    cam,
    hud,
    sound: (s, gain = 1) => deps.playSound(s, gain),
    levels,
    t: 0,
    night: 0,
    shot: ctx.shot,
    ledge: { feet: deps.feet.clone(), yaw: deps.yaw },
    enter: (place) => {
      if (leaving) return;
      leaving = true;
      deps.playSound('enter', 1);
      deps.onEnter(place);
    },
  };

  function switchTo(next: RoamMode): void {
    if (next === mode) return;
    const prev = mode;
    if (prev !== 'overview') handlers[prev].exit(rctx, next);
    mode = next;
    controls.enabled = next !== 'overview';
    controls.clear();
    hud.setMode(next);
    deps.onMode(next);
    if (next !== 'overview') handlers[next].enter(rctx, prev);
    tools.setMode(next, prev);
  }

  /** Put the body on the explorer's object. */
  function pose(): void {
    explorer.object.position.copy(body.pos);
    explorer.object.rotation.set(0, body.yaw, 0);
    explorer.object.scale.setScalar(body.scale);
  }

  /** One fixed step of the roaming modes. */
  function step(f: MapFrame, dt: number): void {
    rctx.t = f.t;
    rctx.night = f.night;
    controls.poll(dt);
    // (the tools take the keys they use first: Esc puts the camera away, not the map)
    tools.input(rctx, mode, dt);
    if (controls.state.exit) {
      void api.stop();
      return;
    }
    levels.wind = levels.wake = 0;
    const next = handlers[mode as Exclude<RoamMode, 'overview'>].update(rctx, dt);
    if (next) {
      if (next === 'overview') void api.stop();
      else switchTo(next);
    }
    // What he holds (a lantern after dark, until the player picks), where the flashlight points.
    if (mode !== 'overview') tools.after(rctx, mode, dt);
    pose();
    explorer.update(dt);
  }

  const api: MapRoam = {
    name: 'roam',
    object,
    body,
    cam,
    world,
    get mode() {
      return mode;
    },
    get active() {
      return mode !== 'overview';
    },
    start() {
      if (mode !== 'overview' || leaving) return;
      deps.release(true);
      body.scale = 1;
      switchTo('leap');
    },
    async stop() {
      if (mode === 'overview' || leaving) return;
      leaving = true;
      controls.enabled = false;
      await hud.fade(1, 0.45);
      switchTo('overview');
      explorer.animator.posture = null;
      body.pos.copy(deps.feet);
      body.vel.set(0, 0, 0);
      body.yaw = deps.yaw;
      body.scale = 1;
      body.grounded = true;
      pose();
      deps.release(false);
      deps.onOverview();
      leaving = false;
      await hud.fade(0, 0.6);
    },
    report() {
      if (mode === 'overview') return null;
      const p = body.pos;
      const deg = (r: number) => ((((r * 180) / Math.PI) % 360) + 360) % 360;
      const t = tools.report();
      const look = [t.tool, t.act].filter(Boolean).join(', ');
      return {
        text: `${mode} at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}), facing ${deg(body.yaw).toFixed(0)}°${look ? ` · ${look}` : ''}`,
        params: {
          roam: mode === 'leap' ? 'glide' : mode,
          at: [p.x, p.y, p.z].map((v) => v.toFixed(1)).join(','),
          yaw: deg(body.yaw).toFixed(0),
          rcam: [deg(cam.yaw - body.yaw), (cam.pitch * 180) / Math.PI, cam.distance].map((v) => v.toFixed(0)).join(','),
          // (a shot needs a moment for the camera to come up)
          ...(t.tool === 'camera' || t.tool === 'selfie' ? { sim: '_:1' } : {}),
          ...t,
        },
      };
    },
    afterRender() {
      tools.afterRender();
    },
    simulate(f) {
      const spec = params.get('sim');
      if (!spec || mode === 'overview') return;
      controls.runScript(parseScript(spec));
      const n = Math.ceil(controls.scriptLength / STEP);
      for (let i = 0; i < n; i++) {
        step(f, STEP);
        cam.update(STEP, world);
      }
    },
    update(f) {
      hud.update(f.dt);
      // Moored boats rock and light their lanterns in every mode.
      boat.frame(f);
      if (mode !== 'overview') {
        // (headless shots move only in `simulate`)
        if (!ctx.shot && f.dt > 0) step(f, f.dt);
        cam.update(ctx.shot ? 1 : f.dt, world);
        f.listener.set(body.pos.x, body.pos.y + 1.7 * body.scale, body.pos.z);
      } else f.listener.copy(f.camera.position);
      // The view through his camera, the lights of his lantern, torch or flashlight (the ledge's too).
      tools.frame(f);
      f.roam = mode;
      f.roamLevels.wind = mode === 'overview' ? 0 : levels.wind;
      f.roamLevels.wake = mode === 'overview' ? 0 : levels.wake;
    },
  };

  // ── Start in a mode from the URL (checking) ──────────────────────────────
  const startMode = params.get('roam') as RoamMode | null;
  if (startMode && startMode !== 'overview' && startMode in handlers) {
    deps.release(true);
    const at = params.get('at')?.split(',').map(Number);
    const yawDeg = Number(params.get('yaw') ?? NaN);
    if (!Number.isNaN(yawDeg)) body.yaw = (yawDeg * Math.PI) / 180;
    if (startMode === 'leap') switchTo('leap');
    else {
      if (at && at.length >= 2) {
        const [x, z] = at.length === 2 ? [at[0], at[1]] : [at[0], at[2]];
        const y = at.length === 3 ? at[1] : Math.max(world.groundAt(x, z), world.waterAt(x, z) ?? -Infinity);
        body.pos.set(x, y, z);
      }
      body.scale = ROAM_SCALE;
      body.grounded = startMode !== 'glide';
      cam.yaw = body.yaw;
      mode = startMode;
      controls.enabled = true;
      hud.setMode(mode);
      deps.onMode(mode);
      handlers[mode].enter(rctx, 'overview');
      cam.blendFrom(0);
      tools.setMode(mode, 'overview');
    }
    const rc = params.get('rcam')?.split(',').map(Number);
    if (rc) {
      cam.yaw = body.yaw + ((rc[0] ?? 0) * Math.PI) / 180;
      cam.pitch = ((rc[1] ?? 20) * Math.PI) / 180;
      if (rc[2]) cam.distance = rc[2];
      cam.follow = 0;
    }
    // (after the camera: a photo looks the way the view does)
    rctx.night = Number(params.get('night') ?? 0);
    tools.fromUrl(params, rctx);
    pose();
  }
  return api;
}
