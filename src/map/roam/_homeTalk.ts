import { SFX } from '../audio/addonSfx';
import { granCue, HOME, HOME_GRAN, homeToWorld } from '../hamlet/_homePlan';
import { t } from '../ui/lang';
import type { AddonEnv, AddonHold } from './_addons';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * The key to his stilt house (roam/_home.ts): E "Talk to Grandma" by the
 * grandmother who keeps it (people/_sceneHome.ts). He walks up to her (a
 * step and a half off, facing her); she says the house has stood empty a
 * long time ("ផ្ទះនេះនៅទំនេរយូរហើយ…"), holds the key out in both hands
 * (`POSE.give`) — "This house is yours now. Stay as long as you like." — he
 * takes it (the `interact` action; a small jingle; the toast: the house is
 * his, progress.ts `home.owned`), thanks her the Khmer way, palms up to his
 * face for an elder (`greetHigh`), she bows back, says "Go on, have a look
 * inside!" and walks home along the trail. The camera comes round to their
 * side, both in view.
 *
 * Until the key is in his hand (`TAKEN`) nothing is kept: back to the map
 * meanwhile, and she is there again next time.
 */

/** The timeline (s from E): she talks, holds out the key, he takes it, it is his, he thanks her, she sends him in. */
export const TALK = { give: 2.7, take: 3.7, taken: 4.4, thank: 5.0, leave: 7.4 } as const;
/** How far in front of her he stands (m, at his roaming size), how fast he steps there (m/s), how fast he turns (1/s). */
const GAP = 1.45;
const STEP = 1.3;
const TURN = 7;
/** The camera on their side: how far, how high (radians), and how fast it comes round (1/s). */
const CAM = { dist: 6.2, pitch: 0.2, rate: 1.8 };

export interface TalkSession {
  readonly kind: 'talk';
  readonly time: number;
  readonly done: boolean;
  hold(ctx: RoamCtx, dt: number): AddonHold;
  /** At once (a new mode, back to the map): she goes back to her broom if the key is not his yet. */
  stop(): void;
}

/** Start talking to her (`at`: seconds already in, a URL's `home=key`). */
export function startTalk(env: AddonEnv, ctx: RoamCtx, owned: () => void, at = 0): TalkSession {
  const g = HOME.gran;
  const body = ctx.body;
  // Where she stands (as the scene has her; a still that has not stepped her yet: her yard's middle).
  let gx = g.x;
  let gz = g.z;
  if (!g.shown || !Number.isFinite(gx)) [gx, gz] = homeToWorld(HOME_GRAN.sweep.x, HOME_GRAN.sweep.z);
  // Where he stands: toward him from her, a step and a half off; on the ground she stands on.
  let dx = body.pos.x - gx;
  let dz = body.pos.z - gz;
  const d = Math.hypot(dx, dz);
  if (d < 0.2) {
    dx = 0;
    dz = 1;
  } else {
    dx /= d;
    dz /= d;
  }
  const gap = GAP * (body.scale / 1.4);
  let sx = gx + dx * gap;
  let sz = gz + dz * gap;
  const w = ctx.world;
  const h = 1.7 * body.scale * 0.95;
  let sy = w.standAt ? w.standAt(sx, sz, body.pos.y + 0.5, 0.6, h) : w.groundAt(sx, sz);
  if (!Number.isFinite(sy) || Math.abs(sy - body.pos.y) > 0.6) {
    sx = body.pos.x;
    sz = body.pos.z;
    sy = body.pos.y;
  }
  const face = Math.atan2(gx - sx, gz - sz);
  // The camera's side: square to the line between them, on the side it is on now.
  const nx = -dz;
  const nz = dx;
  const cx = ctx.cam.camera.position.x - (gx + sx) / 2;
  const cz = ctx.cam.camera.position.z - (gz + sz) / 2;
  // (the side with more room for the camera — nothing hard between it and them —, else the side it is on now)
  const mx = (gx + sx) / 2;
  const mz = (gz + sz) / 2;
  const my = sy + 1.7 * body.scale * 0.8;
  const clear = (sd: number) => {
    const cw = w.hardClearance ?? w.clearance;
    const r = CAM.dist * (body.scale / 1.4);
    return cw ? cw(mx, my, mz, mx + nx * sd * r * Math.cos(CAM.pitch), my + r * Math.sin(CAM.pitch), mz + nz * sd * r * Math.cos(CAM.pitch)) : 1;
  };
  const here = at > 0 ? 1 : nx * cx + nz * cz >= 0 ? 1 : -1;
  const side = clear(-here) > clear(here) + 0.15 ? -here : here;
  // (forward from the camera to them: from its side, looking across the line)
  const camYaw = Math.atan2(-nx * side, -nz * side);
  const before = { pitch: ctx.cam.pitch, distance: ctx.cam.distance };
  let time = at;
  let done = false;
  let fired = at > 0 ? (Object.keys(TALK) as (keyof typeof TALK)[]).filter((k) => TALK[k] <= at) : [];
  const fire = (k: keyof typeof TALK) => {
    if (fired.includes(k) || time < TALK[k]) return false;
    fired = [...fired, k];
    return true;
  };
  granCue(at >= TALK.give ? 'give' : 'talk', { x: sx, y: sy, z: sz });
  const ex = env.explorer;
  if (at > 0) {
    body.pos.set(sx, sy, sz);
    body.yaw = face;
    ctx.cam.yaw = camYaw;
    ctx.cam.pitch = CAM.pitch;
    ctx.cam.distance = CAM.dist;
  }
  body.vel.set(0, 0, 0);

  return {
    kind: 'talk',
    get time() {
      return time;
    },
    get done() {
      return done;
    },
    hold(c, dt) {
      time += dt;
      const { cam } = c;
      cam.turn(c.input.lookYaw, c.input.lookPitch, c.input.zoom);
      body.vel.set(0, 0, 0);
      body.grounded = true;
      // He steps up to her and turns to face her.
      const ddx = sx - body.pos.x;
      const ddz = sz - body.pos.z;
      const dist = Math.hypot(ddx, ddz);
      if (dist > 0.03) {
        const v = STEP * (body.scale / 1.4);
        const step = Math.min(dist, v * dt);
        body.pos.x += (ddx / dist) * step;
        body.pos.z += (ddz / dist) * step;
        body.pos.y += (sy - body.pos.y) * Math.min(1, dt * 10);
        const want = dist > 0.3 ? Math.atan2(ddx, ddz) : face;
        body.yaw += angleDiff(want, body.yaw) * Math.min(1, dt * TURN);
        ex.setMotion(step / Math.max(1e-3, dt) / body.scale, true, 0);
      } else {
        body.pos.set(sx, sy, sz);
        body.yaw += angleDiff(face, body.yaw) * Math.min(1, dt * TURN);
        ex.setMotion(0, true, 0);
      }
      if (fire('give')) granCue('give', body.pos);
      if (fire('take')) {
        if (ex.currentAction) ex.stop();
        ex.play('interact');
      }
      if (fire('taken')) {
        granCue('taken', body.pos);
        SFX.play('homeKey', 0.9);
        owned();
        c.hud.toast(t('homeGot'));
      }
      if (fire('thank')) ex.play('greetHigh');
      if (fire('leave')) {
        granCue('leave', body.pos);
        done = true;
        cam.pitch = before.pitch;
        cam.distance = before.distance;
      }
      // The camera: on their side, both in view, looking at the middle between them.
      const k = 1 - Math.exp(-CAM.rate * dt);
      if (time < 1.4 || Math.abs(c.input.lookYaw) < 1e-6) {
        cam.yaw += angleDiff(camYaw, cam.yaw) * k * (time < 2.5 ? 1 : 0.2);
        cam.pitch += (CAM.pitch - cam.pitch) * k;
        cam.distance += (CAM.dist * (body.scale / 1.4) - cam.distance) * k;
      }
      const hh = 1.7 * body.scale * 0.8;
      cam.focus.set((body.pos.x + (g.shown ? g.x : gx)) / 2, body.pos.y + hh, (body.pos.z + (g.shown ? g.z : gz)) / 2);
      cam.behindYaw = cam.yaw;
      return { prompt: null };
    },
    stop() {
      if (done) return;
      done = true;
      // (the key not his yet: she goes back to her broom, and asks again next time)
      if (!HOME.owned) granCue('idle');
      else granCue('leave', body.pos);
      if (ex.currentAction === 'interact' || ex.currentAction === 'greetHigh') ex.stop();
    },
  };
}
