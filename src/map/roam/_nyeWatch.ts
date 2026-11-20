import { Vector3 } from 'three';
import { showTime } from '../nye/clock';
import { pad } from '../pad/pad';
import { SKY_TINT } from '../sky/tint';
import type { RoamMode } from '../types';
import { t } from '../ui/lang';
import { registerAddon, type AddonEnv, type AddonHold, type AddonKey } from './_addons';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * New Year's Eve (AWP-35): "E  Watch the fireworks" (មើលកាំជ្រួច). On foot the follow camera looks down at him, and
 * the show is high over Phnom Kulen, above its frame. While the show plays, anywhere
 * on the map, E turns him to face it and brings the camera down low behind him, looking up at the sky (wider, him
 * small at the bottom of the picture): a drag, Q / R or the right stick looks round from there; E, a move key or
 * the stick lets go and the camera goes back to where it was. The way to the show follows its light
 * (sky/tint.ts `SKY_TINT`, where the bursts light the sky), else the show's middle.
 *
 * Shots: `nyewatch=1` (with `fireworks=<s>` and a walk: `roam=walk&at=x,z`).
 */

/** Where the show is when no burst lights the sky yet (m: over Kulen's east flank, nye/show.ts). */
const SHOW_AT = { x: 490, y: 140, z: -400 };
/** The watching camera: this far behind him and this high over his feet (m), looking this far up (radians), this wide (°). */
const VIEW = { back: 5.2, up: 1.15, look: 0.36, dist: 12, fov: 60 };
/** How far up a drag may look (radians: the follow camera's `pitchMin` while watching). */
const LOOK_MOST = 1.1;
/** How fast he turns and the camera settles (1/s). */
const SETTLE = 2.4;
/** Seconds of the player's own looking before the camera stops turning toward the show by itself. */
const OWN_LOOK = 0.2;

const KEYS: readonly AddonKey[] = [
  ['E', 'nyeWatchStop', 'west'],
  ['W A S D', 'nyeWatchStop', 'lstick'],
];

interface Session {
  /** The camera as it was (put back after). */
  before: { pitch: number; distance: number; fov: number; pitchMin: number; follow: number };
  /** Seconds watching, and whether the player has looked round himself (then the view stays where he put it). */
  time: number;
  own: boolean;
}

let env: AddonEnv | null = null;
let session: Session | null = null;
const _c = new Vector3();

/** The way to the show from (x, z): its light's middle when there is light, else its middle. */
function showFrom(x: number, z: number): { yaw: number; up: number } {
  const lit = SKY_TINT.r + SKY_TINT.g + SKY_TINT.b > 0.05;
  const sx = lit ? SKY_TINT.x : SHOW_AT.x;
  const sy = lit ? SKY_TINT.y : SHOW_AT.y;
  const sz = lit ? SKY_TINT.z : SHOW_AT.z;
  const d = Math.max(1, Math.hypot(sx - x, sz - z));
  return { yaw: Math.atan2(sx - x, sz - z), up: Math.atan2(sy, d) };
}

/** The show plays now: E may start watching. */
const showOn = (): boolean => showTime() !== null;

function begin(e: AddonEnv, ctx: RoamCtx): void {
  const cam = ctx.cam;
  session = {
    before: { pitch: cam.pitch, distance: cam.distance, fov: cam.fov, pitchMin: cam.pitchMin, follow: cam.follow },
    time: 0,
    own: false,
  };
  cam.pitchMin = -LOOK_MOST;
  cam.follow = 0;
  e.explorer.setMotion(0, true, 0);
}

function end(e: AddonEnv, ctx: RoamCtx | null): void {
  const s = session;
  if (!s) return;
  session = null;
  const cam = ctx?.cam ?? e.cam;
  cam.pitchMin = s.before.pitchMin;
  cam.pitch = s.before.pitch;
  cam.distance = s.before.distance;
  cam.fov = s.before.fov;
  cam.follow = s.before.follow;
}

function step(e: AddonEnv, ctx: RoamCtx, dt: number): AddonHold {
  const s = session!;
  const { body, input, cam } = ctx;
  s.time += dt;
  // (a move, a jump or E: he lets go)
  if (input.use || input.jump || Math.hypot(input.move.x, input.move.y) > 0.3 || !showOn()) {
    end(e, ctx);
    return { prompt: null };
  }
  e.explorer.setMotion(0, true, 0);
  body.vel.set(0, 0, 0);
  const way = showFrom(body.pos.x, body.pos.z);
  // He turns to face the show.
  const k = 1 - Math.exp(-SETTLE * dt);
  body.yaw += angleDiff(way.yaw, body.yaw) * k;
  // The camera: the player looks round himself (a drag, Q / R, the stick), else it turns to the show and up at it.
  if (input.lookYaw || input.lookPitch) s.own = s.time > OWN_LOOK || s.own;
  cam.turn(input.lookYaw, input.lookPitch, 0);
  if (!s.own) {
    cam.yaw += angleDiff(way.yaw, cam.yaw) * k;
    const want = -Math.min(LOOK_MOST, Math.max(VIEW.look, way.up * 0.82));
    cam.pitch += (want - cam.pitch) * k;
  }
  cam.distance += (VIEW.dist - cam.distance) * k;
  cam.fov += (VIEW.fov - cam.fov) * k;
  cam.behindYaw = cam.yaw;
  // Low behind him, looking up along the view: the follow camera orbits a point out along it (it sits at
  // focus − forward × distance, so that point is where it looks; he stays small at the bottom of the picture).
  const cp = Math.cos(cam.pitch);
  _c.set(body.pos.x - Math.sin(cam.yaw) * VIEW.back, body.pos.y + VIEW.up * body.scale, body.pos.z - Math.cos(cam.yaw) * VIEW.back);
  cam.focus.set(_c.x + Math.sin(cam.yaw) * cp * cam.distance, _c.y - Math.sin(cam.pitch) * cam.distance, _c.z + Math.cos(cam.yaw) * cp * cam.distance);
  return { prompt: pad.active ? null : `E  ${t('nyeWatchStop')}` };
}

registerAddon({
  id: 'nyeWatch',
  order: 8,
  get holding() {
    return session !== null;
  },
  keys: () => (session ? KEYS : null),
  init(e) {
    env = e;
  },
  offer(ctx, mode: RoamMode | 'walk' | 'boat') {
    if (mode !== 'walk' || !env || session || env.busy() || !ctx.body.grounded || !showOn()) return null;
    return `E  ${t('nyeWatch')}`;
  },
  use(ctx) {
    if (!env || session) return;
    begin(env, ctx);
  },
  hold(ctx, dt) {
    if (!env || !session) return { prompt: null };
    return step(env, ctx, dt);
  },
  setMode(next) {
    if (env && next !== 'walk') end(env, null);
  },
  fromUrl(q, ctx) {
    if (!env || q.get('nyewatch') !== '1' || !showOn()) return;
    begin(env, ctx);
    // (a still: settled at once)
    for (let i = 0; i < 60; i++) step(env, ctx, 0.1);
  },
  report: () => (session ? { nyewatch: '1' } : null),
});
