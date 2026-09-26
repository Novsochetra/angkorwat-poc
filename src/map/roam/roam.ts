import { Group, Vector3 } from 'three';
import type { AngkorExplorer } from '../../character/AngkorExplorer';
import type { PlaceDef } from '../layout';
import type { MapContext, MapFrame, MapPart, RoamLevels, RoamMode, RoamSound, UISound } from '../types';
import { followNearFade, installNearFade } from './_nearFade';
import { createBalloon, type BalloonInfo } from './balloon';
import { createBoat } from './boat';
import { OrbitFollowCam } from './followCam';
import { createHangGlider } from './hangGlider';
import { createRoamHud, type JumpKind } from './hud';
import { parseScript, RoamControls } from './input';
import { createLaunchSpots, type LaunchSpot } from './launchSpots';
import { createParachute } from './parachute';
import { createRoamTools } from './tools';
import { ROAM_SCALE, type FollowCam, type RoamBody, type RoamCtx, type RoamModeHandler, type RoamWorld } from './types';
import { createWalker } from './walker';
import { buildRoamWorld } from './world';

/**
 * Roaming the map: the explorer leaps off his ledge, glides down under a
 * parachute, walks, paddles the rivers, flies a hang glider off the
 * cliff-top ramps and enters the temples. This file
 * runs the modes (roam/types.ts) and hands the camera between the overview
 * rig and the follow camera.
 *
 * URL (for checking): `roam=leap|glide|walk|boat|hang|balloon` start in that mode
 * (`roam=leap&start=glider`: the hang glider opens at the end of the leap,
 * not the parachute; hud.ts: `jumpmenu=1` the "Jump in" card open) ·
 * `at=x,z` or `at=x,y,z` where (m; y defaults to the ground or water) ·
 * `yaw=<deg>` facing · `sim=<script>` scripted input run before a shot
 * (input.ts `parseScript`, e.g. `sim=w:2,wr:3,j:0.5`) · `rcam=yaw,pitch,dist`
 * the follow camera's orbit (degrees relative to the facing, degrees, m) ·
 * the explorer's tools (tools.ts): `tool=lantern|torch|flashlight|camera|selfie`
 * start with it out · `act=wave|cheer|lookUp|peek` · `beam=mouse` with
 * `mouse=x,y` (0‥1 of the view) · `look=<outfit>` · `hat=0|1` ·
 * `face=<expression>` · `pview=yaw,pitch,fov` the camera's shot (degrees) ·
 * `gesture=…` and `saim=yaw,pitch,reach` the selfie · `stick=0|1` its stick ·
 * `keys=1` the key list.
 */
export interface MapRoam extends MapPart {
  readonly mode: RoamMode;
  /** The roaming explorer (feet, facing, size), for the mini-map and the tools. */
  readonly body: RoamBody;
  /** The follow camera (its `yaw` is the view's heading). */
  readonly cam: FollowCam;
  /** What the roaming modes know about the world (ground, water, places). */
  readonly world: RoamWorld;
  /** The hang glider take-off ramps (for the maps). */
  readonly launchSpots: readonly LaunchSpot[];
  /** The hot air balloon (where it stands or flies, at home or not, ridden), for the maps. */
  readonly balloon: BalloonInfo;
  /** Roaming (the follow camera has the view). */
  readonly active: boolean;
  /** Leap off the ledge; at the end of the fall the parachute opens over him (`chute`, the default) or the hang glider (`glider`). */
  start(kind?: JumpKind): void;
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
  /** Play an interface sound (the "Jump in" card: hover, open, close, pick). */
  uiSound?(s: UISound): void;
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
  const levels: RoamLevels = { wind: 0, wake: 0, sail: 0, burner: 0 };

  let mode: RoamMode = 'overview';
  let leaving = false;
  const hud = createRoamHud(deps.uiRoot, {
    onJump: (kind) => api.start(kind),
    onBack: () => void api.stop(),
    sound: (s) => deps.uiSound?.(s),
  });

  const tools = createRoamTools({ explorer, body, cam, world, hud, controls, canvas: deps.canvas, parts: deps.parts });
  object.add(tools.object);

  const chute = createParachute();
  // (built now: the boat tied up by the River Gate shows in the overview too)
  const boat = createBoat(ctx.field);
  // Hang glider ramps on the cliff tops: walkable (their decks over the walk map), E on one flies.
  const spots = createLaunchSpots(ctx.field, world);
  object.add(spots.object);
  // (leaves, bark and the ramps' gliders dissolve in front of the follow camera)
  installNearFade(spots.object);
  const { groundAt, standAt } = world;
  world.groundAt = (x, z) => Math.max(groundAt(x, z), spots.deckAt(x, z));
  if (standAt)
    world.standAt = (x, z, y, up, h) => {
      const g = standAt(x, z, y, up, h);
      const d = spots.deckAt(x, z);
      return d > -Infinity && d <= y + up && (Number.isNaN(g) || d > g) ? d : g;
    };
  world.launchNear = (x, z, y) => spots.near(x, z, y) !== null;
  const hang = createHangGlider(spots, world);
  // The hot air balloon on its field below Angkor Wat: E at its basket rides it; the walker goes round the basket.
  const balloon = createBalloon(ctx.field, world);
  world.balloonNear = (x, z, y) => balloon.near(x, z, y);
  const standOnDecks = world.standAt;
  if (standOnDecks) world.standAt = (x, z, y, up, h) => (balloon.solid(x, z, y) ? NaN : standOnDecks(x, z, y, up, h));
  const walker = createWalker();
  const handlers: Record<Exclude<RoamMode, 'overview'>, RoamModeHandler> = {
    leap: chute.leap,
    glide: chute.glide,
    walk: walker,
    boat,
    hang,
    balloon,
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
    rctx.weather = f.weather;
    controls.poll(dt);
    // (the tools take the keys they use first: Esc puts the camera away, not the map)
    tools.input(rctx, mode, dt);
    if (controls.state.exit) {
      void api.stop();
      return;
    }
    levels.wind = levels.wake = levels.sail = levels.burner = 0;
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
    launchSpots: spots.list,
    balloon: balloon.info,
    get mode() {
      return mode;
    },
    get active() {
      return mode !== 'overview';
    },
    start(kind = 'chute') {
      if (mode !== 'overview' || leaving) return;
      chute.leap.opens = kind === 'glider' ? 'hang' : 'glide';
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
      // On the rope swing (_swingRide.ts): the shot starts him at its stand spot, E sits him on
      // it and it swings as long as he has been on it. (The camera or the phone up would keep
      // E from seating him: named in the words, not in the params.)
      const ride = mode === 'walk' ? walker.swing.ride : null;
      if (ride && (t.tool === 'camera' || t.tool === 'selfie')) for (const k of ['tool', 'pview', 'saim', 'gesture', 'stick']) delete t[k];
      const at = ride?.stand ?? p;
      return {
        text: `${mode} at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})${ride ? `, on the rope swing ${ride.seconds.toFixed(1)} s` : ''}, facing ${deg(body.yaw).toFixed(0)}°${look ? ` · ${look}` : ''}`,
        params: {
          // (a leap goes on as whatever opens at its end: the parachute, or the hang glider)
          roam: mode === 'leap' ? chute.leap.opens : mode,
          at: [at.x, at.y, at.z].map((v) => v.toFixed(ride ? 2 : 1)).join(','),
          yaw: deg(body.yaw).toFixed(0),
          rcam: [deg(cam.yaw - body.yaw), (cam.pitch * 180) / Math.PI, cam.distance].map((v) => v.toFixed(0)).join(','),
          // (a shot needs a moment for the camera to come up)
          ...(t.tool === 'camera' || t.tool === 'selfie' ? { sim: '_:1' } : {}),
          ...t,
          ...(ride ? { sim: `e:0.1,_:${Math.max(0.1, ride.seconds - 0.1).toFixed(1)}` } : {}),
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
        // (the glider put away and the seed fluff move on too)
        hang.frame({ ...f, t: f.t + i * STEP, dt: STEP }, mode, body.pos);
        balloon.frame({ ...f, t: f.t + i * STEP, dt: STEP }, mode);
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
      // (the near fade: what stands in front of the follow camera dissolves; not in a photo)
      followNearFade(mode !== 'overview' && mode !== 'leap' ? cam.focus : null, ctx.shot ? 1 : f.dt, 1 - tools.photo.view);
      // The hang glider over him (after his step: they move together), a glider put away, the ramps' lanterns, the seed fluff.
      hang.frame(f, mode, body.pos);
      // The balloon where it stands or flies (back home once he leaves roaming).
      balloon.frame(f, mode);
      // The view through his camera, the lights of his lantern, torch or flashlight (the ledge's too).
      tools.frame(f);
      f.roam = mode;
      f.roamLevels.wind = mode === 'overview' ? 0 : levels.wind;
      f.roamLevels.wake = mode === 'overview' ? 0 : levels.wake;
      f.roamLevels.sail = mode === 'overview' ? 0 : (levels.sail ?? 0);
      f.roamLevels.burner = mode === 'overview' ? 0 : (levels.burner ?? 0);
    },
  };

  // ── Start in a mode from the URL (checking) ──────────────────────────────
  const startMode = params.get('roam') as RoamMode | null;
  if (startMode && startMode !== 'overview' && startMode in handlers) {
    deps.release(true);
    const at = params.get('at')?.split(',').map(Number);
    const yawDeg = Number(params.get('yaw') ?? NaN);
    if (!Number.isNaN(yawDeg)) body.yaw = (yawDeg * Math.PI) / 180;
    if (startMode === 'leap') {
      chute.leap.opens = params.get('start') === 'glider' ? 'hang' : 'glide';
      switchTo('leap');
    } else {
      if (at && at.length >= 2) {
        const [x, z] = at.length === 2 ? [at[0], at[1]] : [at[0], at[2]];
        const y = at.length === 3 ? at[1] : Math.max(world.groundAt(x, z), world.waterAt(x, z) ?? -Infinity);
        body.pos.set(x, y, z);
      }
      body.scale = ROAM_SCALE;
      body.grounded = startMode !== 'glide' && startMode !== 'hang';
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
