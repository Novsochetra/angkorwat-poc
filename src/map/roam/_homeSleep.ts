import { Vector3 } from 'three';
import { REST_U, restDuration, restPose, type RestState } from '../../character/rest';
import { SFX } from '../audio/addonSfx';
import { eventById } from '../calendar';
import { HOME, HOME_IN, homeToWorld, homeYaw } from '../hamlet/_homePlan';
import { TIME } from '../time';
import type { MapPart } from '../types';
import type { Minimap } from '../ui/minimap';
import { t } from '../ui/lang';
import type { AddonEnv, AddonHold } from './_addons';
import { stretchPose } from './_homePoses';
import { angleDiff } from './followCam';
import { createSnore } from './_rest';
import type { RoamCtx } from './types';

/**
 * Sleeping in his stilt house (roam/_home.ts: E "Sleep" at his mat, then the
 * card, _homeCard.ts): he steps onto the mat, turns, sits and lies back on it
 * (the rest's poses: character/rest.ts, a posture over the walk), his hat off
 * beside the pillow; the net's front comes down round him (the house:
 * `HOME.netDown`); his eyes close, the "Z z z" rises (_rest.ts `createSnore`),
 * three soft bells and the view fades to black; the time moves on
 * (time.ts `TIME.skipTo`: to dawn, the afternoon, or a few seconds before the
 * event he chose, as the calendar's "Wait for it" does); what is built late
 * comes (`TIME.building()`, a few seconds at most); the view fades back in
 * on him still asleep in the new light; he wakes (two soft notes), the net
 * goes up, he sits up and stands, and stretches (_homePoses.ts) — "Good
 * morning! The sun is up" (or the afternoon's, or "Up in time: …", and the
 * mini-map heads for the event when it is over 60 m away).
 *
 * While the time stands still (the Time setting is Day or Night, or a URL
 * holds it) it is a short rest: down, a doze with the "Z z z", up — the card
 * said why. The camera comes into the room beside the mat, looking down
 * along him; the player may turn it. Before the view is dark E, Space or the
 * stick gets him up again; from the dark on he sleeps till it is over. Back
 * to the map stops it at once (the view comes back, the net goes up).
 */

/** What he sleeps for: to a moment of the day, for an event (a few seconds before it), a short rest, or (a still) held asleep. */
export interface SleepPlan {
  kind: 'dawn' | 'afternoon' | 'event' | 'rest' | 'still';
  /** Days of the cycle to wake at (not for `rest` / `still`). */
  to?: number;
  event?: string;
}

type Phase = 'walk' | 'down' | 'doze' | 'dark' | 'wake' | 'up' | 'out' | 'stretch' | 'done';

/** Seconds: the doze before the fade, the fade out, the dark at least, the fade in, asleep after it, the short rest's doze, the stretch. */
const T = { doze: 1.6, fadeOut: 1.6, dark: 0.9, fadeIn: 1.8, after: 0.9, rest: 5.0, stretch: 2.6, buildWait: 8 };
/** Walking onto the mat (m/s) and turning (1/s). */
const STEP = 1.2;
const TURN = 7;
/** Past this along the way down (`u`) his hat comes off (its brim), and on again coming up (as the rest's). */
const HAT_OFF = 1.25;
/** The camera beside the mat: its heading off the map's +z (radians), tilt, distance (m at his roaming size), how fast it comes (1/s). */
const CAM = { yaw: 0.5, pitch: 0.55, dist: 3.5, rate: 1.4 };
/** How fast the camera comes to the stretch's view (1/s). */
const STRETCH_RATE = 2.2;
/** He gets up for the stick past this, or E, or Space. */
const STICK = 0.4;

export interface SleepSession {
  readonly kind: 'sleep';
  readonly phase: Phase;
  readonly plan: SleepPlan;
  readonly done: boolean;
  /** In the dark, or fading (no input, no camera keys). */
  readonly dark: boolean;
  /** It has his hat off (lying down: the brim; it goes back on as he gets up). */
  readonly hatTaken: boolean;
  /** The step's input, before it is taken (roam/_home.ts `input`): E, Space or the stick. */
  poke(up: boolean, stick: number): void;
  hold(ctx: RoamCtx, dt: number): AddonHold;
  frame(camera: import('three').PerspectiveCamera, photoView: number): void;
  /** At once (a new mode, back to the map): all as it was. */
  stop(): void;
}

const smooth = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return c * c * (3 - 2 * c);
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** A card asks something just now ("Back to the map?": ui/ask.ts puts `mu-asking` on the body). */
const asking = () => typeof document !== 'undefined' && document.body.classList.contains('mu-asking');
const _v = new Vector3();

let snore: { show(on: boolean): void; place(x: number, y: number): void } | null = null;

/** Start (from where he stands in the room; `lying`: already down and asleep, a URL's `home=sleep`; `stretch`: a URL's `home=stretch`). */
export function startSleep(env: AddonEnv, ctx: RoamCtx, plan: SleepPlan, from: 'stand' | 'lying' | 'stretch' = 'stand'): SleepSession {
  const body = ctx.body;
  const ex = env.explorer;
  const cam = ctx.cam;
  snore ??= createSnore(env.layer);
  const floor = body.pos.y;
  const [lx, lz] = homeToWorld(HOME_IN.lie.x, HOME_IN.lie.z);
  const spot = new Vector3(lx, floor, lz);
  // (up again, he steps off the mat and out from under the net to stretch, turned to the room)
  const [ox, oz] = homeToWorld(HOME_IN.wake.x, HOME_IN.wake.z);
  const outSpot = new Vector3(ox, floor, oz);
  const outYaw = homeYaw(-Math.PI / 2);
  // (first out of the net's open front, then to the stretch's spot)
  const [vx, vz] = homeToWorld(HOME_IN.out.x, HOME_IN.out.z);
  const via = new Vector3(vx, floor, vz);
  let viaDone = false;
  // The camera for the stretch: by the east window up near the eaves, looking across the room at him.
  const [scx, scz] = homeToWorld(HOME_IN.stretchCam.x, HOME_IN.stretchCam.z);
  const stretchCam = new Vector3(scx, floor + HOME_IN.stretchCam.y, scz);
  // (facing the house's +x: his head goes back toward the pillow at the mat's east end)
  const yaw = homeYaw(Math.PI / 2);
  const before = { pitch: cam.pitch, distance: cam.distance, pitchMin: cam.pitchMin };
  const state: RestState = { u: 0, sleep: 0, t: 0, pack: ex.currentOutfit.pack, knife: ex.currentOutfit.legs === 'shorts' };
  let phase: Phase = 'walk';
  let time = 0;
  let pt = 0;
  let u = 0;
  let uFrom = 0;
  let uTo = 0;
  let uk = 1;
  let uLen = 0;
  let hatTaken = false;
  let up = false;
  let stick = 0;
  let stretch = 0;
  let dark = false;
  let cancelled = false;
  let faceHeld = false;
  let framed = 0;
  /** The fade, the jump and the fade back run on their own (promises); this says when it is over. */
  let darkDone = false;

  const go = (to: number) => {
    uFrom = u;
    uTo = to;
    uk = 0;
    uLen = Math.max(0.2, restDuration(uFrom, uTo));
  };
  const setPhase = (p: Phase) => {
    phase = p;
    pt = 0;
  };
  const posture = (tt: number) => {
    state.t = tt;
    return restPose(state);
  };
  const hat = (on: boolean) => {
    if (!on && ex.currentOutfit.hat) {
      ex.setOutfit({ hat: false });
      env.photo.refreshBody();
      hatTaken = true;
    } else if (on && hatTaken) {
      hatTaken = false;
      if (!ex.currentOutfit.hat) {
        ex.setOutfit({ hat: true });
        env.photo.refreshBody();
      }
    }
  };
  const startPosture = () => {
    ex.animator.posture = posture;
    ex.animator.postureFeet = false;
  };
  const endPosture = () => {
    ex.animator.posture = null;
    ex.animator.postureFeet = true;
    ex.asleep = false;
    if (faceHeld) {
      ex.showFace(null);
      faceHeld = false;
    }
  };

  /** Into the dark, the time moved on, back out (the view fades by itself; `darkDone` once it is back). */
  async function night(): Promise<void> {
    dark = true;
    SFX.play('homeSleep');
    await env.hud.fade(1, T.fadeOut);
    if (cancelled) return;
    // The dark first, and nothing moves while a card asks ("Back to the map?", roam/_leave.ts) or while roaming is on
    // its way back to the map (its controls off: roam.ts `stop`, which ends this a moment later): back to the map
    // from the dark moves nothing. Only then the time moves on.
    const t0 = performance.now();
    const waitOn = () => performance.now() - t0 < T.dark * 1000 || asking() || !env.controls.enabled;
    while (waitOn() && !cancelled) await sleep(50);
    if (cancelled) return;
    const t1 = performance.now();
    if (plan.to !== undefined && env.controls.enabled) TIME.skipTo(Math.max(TIME.days(), plan.to));
    // (two frames for the late parts to be asked for, then what is built late: a few seconds at most)
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    while (TIME.building() && performance.now() - t1 < T.buildWait * 1000 && !cancelled) await sleep(80);
    if (cancelled) return;
    await env.hud.fade(0, T.fadeIn);
    dark = false;
    darkDone = true;
  }

  /** The toast on waking, and the mini-map's target for an event far off. */
  function morning(c: RoamCtx): void {
    const clock = ((TIME.days() % 1) + 1) % 1;
    if (plan.kind === 'rest') return c.hud.toast(t('homeRested'));
    if (plan.kind === 'event' && plan.event) {
      const e = eventById(plan.event);
      if (e) {
        c.hud.toast(t('homeWoke', { event: t(e.name) }));
        const mm = env.parts.find((p: MapPart) => p.name === 'minimap') as Minimap | undefined;
        if (mm && e.where && Math.hypot(e.where.x - body.pos.x, e.where.z - body.pos.z) > 60) mm.setTarget({ kind: 'event', id: e.id });
        return;
      }
    }
    c.hud.toast(t(clock >= 0.62 && clock < 0.95 ? 'homeMorning' : 'homeAfternoon'));
  }

  if (from !== 'stand') {
    body.pos.copy(from === 'lying' ? spot : outSpot);
    body.yaw = from === 'lying' ? yaw : outYaw;
    body.vel.set(0, 0, 0);
    if (from === 'lying') {
      u = uFrom = uTo = REST_U.lie;
      state.u = u;
      state.sleep = 1;
      startPosture();
      hat(false);
      HOME.netDown = true;
      HOME.net = 1;
      ex.asleep = true;
      setPhase('doze');
      pt = T.doze;
    } else {
      setPhase('stretch');
      pt = T.stretch * 0.42;
      ex.animator.posture = (tt: number) => stretchPose(stretch, tt);
      ex.animator.postureFeet = true;
    }
    cam.yaw = homeYaw(0) + Math.PI + CAM.yaw;
    cam.pitch = CAM.pitch;
    cam.distance = CAM.dist * (body.scale / 1.4);
    framed = 9;
  }

  const api: SleepSession = {
    kind: 'sleep',
    get phase() {
      return phase;
    },
    plan,
    get done() {
      return phase === 'done';
    },
    get dark() {
      return dark;
    },
    get hatTaken() {
      return hatTaken;
    },
    poke(u0, s) {
      up ||= u0;
      stick = s;
    },
    hold(c, dt) {
      time += dt;
      pt += dt;
      const ctrl = !dark;
      if (ctrl) cam.turn(c.input.lookYaw, c.input.lookPitch, c.input.zoom);
      body.vel.set(0, 0, 0);
      body.grounded = true;
      ex.setMotion(0, true, 0);
      const wantsUp = up || stick > STICK;
      up = false;
      // ── Along the way down or up ─────────────────────────────────────────
      if (uk < 1) {
        const u0 = u;
        uk = Math.min(1, uk + dt / uLen);
        u = uFrom + (uTo - uFrom) * smooth(uk);
        // (the mat as he sits onto it and lies back, and as he gets up)
        for (const at of [1.0, 1.85]) if ((u0 < at && u >= at) || (u0 > at && u <= at)) SFX.play('homeMat', at > 1.5 ? 0.8 : 0.6);
        if (u > HAT_OFF && u0 <= HAT_OFF) hat(false);
        else if (u < HAT_OFF && u0 >= HAT_OFF) hat(true);
      }
      state.u = u;
      switch (phase) {
        case 'walk': {
          const dx = spot.x - body.pos.x;
          const dz = spot.z - body.pos.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.03) {
            const step = Math.min(d, STEP * (body.scale / 1.4) * dt);
            body.pos.x += (dx / d) * step;
            body.pos.z += (dz / d) * step;
            body.yaw += angleDiff(d > 0.3 ? Math.atan2(dx, dz) : yaw, body.yaw) * Math.min(1, dt * TURN);
            ex.setMotion(step / Math.max(1e-3, dt) / body.scale, true, 0);
          } else {
            body.pos.x = spot.x;
            body.pos.z = spot.z;
            const dy = angleDiff(yaw, body.yaw);
            body.yaw += dy * Math.min(1, dt * TURN);
            if (Math.abs(dy) < 0.05) {
              body.yaw = yaw;
              startPosture();
              go(REST_U.lie);
              setPhase('down');
            }
          }
          if (wantsUp && time > 0.3) finish(c);
          break;
        }
        case 'down':
          if (u > 1.7 && !HOME.netDown) {
            HOME.netDown = true;
            SFX.play('homeNet', 0.7);
          }
          if (wantsUp) getUp();
          else if (uk >= 1) setPhase('doze');
          break;
        case 'doze':
          state.sleep = Math.min(1, state.sleep + dt / 2);
          ex.asleep = state.sleep > 0.3;
          if (plan.kind === 'still') break;
          if (wantsUp && !dark) {
            getUp();
            break;
          }
          if (plan.kind === 'rest') {
            if (pt >= T.rest) setPhase('wake');
          } else if (pt >= T.doze && !dark && !darkDone) {
            setPhase('dark');
            void night();
          }
          break;
        case 'dark':
          // (asleep in the dark; once the view is back, a moment more, then he wakes)
          if (darkDone && pt >= 0) {
            darkDone = false;
            setPhase('wake');
            pt = -T.after;
          }
          break;
        case 'wake':
          if (pt < 0) break;
          if (pt - dt < 0) {
            SFX.play('homeWake');
            ex.asleep = false;
          }
          state.sleep = Math.max(0, state.sleep - dt / 0.6);
          if (pt >= 0.45 && HOME.netDown) {
            HOME.netDown = false;
            SFX.play('homeNet', 0.6);
          }
          if (pt >= 1.1) {
            go(REST_U.stand);
            setPhase('up');
          }
          break;
        case 'up':
          if (uk >= 1 && u <= 0) {
            // (got up before he slept: no stretch)
            if (cancelled) {
              finish(c);
              break;
            }
            // Standing: off the mat, out from under the net (the walk), then the stretch.
            ex.animator.posture = null;
            ex.animator.postureFeet = true;
            setPhase('out');
          }
          break;
        case 'out': {
          const goal = viaDone ? outSpot : via;
          if (!viaDone && Math.hypot(via.x - body.pos.x, via.z - body.pos.z) < 0.12) viaDone = true;
          const dx = goal.x - body.pos.x;
          const dz = goal.z - body.pos.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.03) {
            const step = Math.min(d, STEP * (body.scale / 1.4) * dt);
            body.pos.x += (dx / d) * step;
            body.pos.z += (dz / d) * step;
            body.yaw += angleDiff(d > 0.3 ? Math.atan2(dx, dz) : outYaw, body.yaw) * Math.min(1, dt * TURN);
            ex.setMotion(step / Math.max(1e-3, dt) / body.scale, true, 0);
          } else {
            const dy = angleDiff(outYaw, body.yaw);
            body.yaw += dy * Math.min(1, dt * TURN);
            if (Math.abs(dy) < 0.08 || pt > 3) {
              // The stretch (its own posture, the feet planted).
              ex.animator.posture = (tt: number) => stretchPose(stretch, tt);
              ex.animator.postureFeet = true;
              setPhase('stretch');
              morning(c);
            }
          }
          break;
        }
        case 'stretch': {
          const k = pt / T.stretch;
          stretch = k < 0.3 ? smooth(k / 0.3) : k < 0.7 ? 1 : 1 - smooth((k - 0.7) / 0.3);
          const peak = k > 0.25 && k < 0.75;
          if (peak !== faceHeld) {
            ex.showFace(peak ? 'ahh' : null);
            faceHeld = peak;
          }
          if (k >= 1 || (stick > STICK && k > 0.2)) finish(c);
          break;
        }
        default:
          break;
      }
      camera(dt);
      return { prompt: null };
    },
    frame(camera, photoView) {
      const on = ex.asleep && state.sleep > 0.5 && photoView < 0.3 && !dark;
      snore!.show(on);
      if (!on) return;
      ex.rig.joints.head.getWorldPosition(_v);
      _v.y += 0.5 * body.scale;
      _v.project(camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1.2 || Math.abs(_v.y) > 1.2) return snore!.show(false);
      const r = env.canvas.getBoundingClientRect();
      snore!.place(r.left + ((_v.x + 1) / 2) * r.width, r.top + ((1 - _v.y) / 2) * r.height);
    },
    stop() {
      if (phase === 'done') return;
      cancelled = true;
      if (dark) void env.hud.fade(0, 0.3);
      dark = false;
      HOME.netDown = false;
      endPosture();
      hat(true);
      snore?.show(false);
      cam.pitchMin = before.pitchMin;
      phase = 'done';
    },
  };

  /** Up again before he slept: the net up, sit up, stand. */
  function getUp(): void {
    if (HOME.netDown) {
      HOME.netDown = false;
      SFX.play('homeNet', 0.5);
    }
    ex.asleep = false;
    state.sleep = 0;
    go(REST_U.stand);
    setPhase('up');
    cancelled = true;
  }

  /** Done: the posture off (the Animator eases back to the walk), the camera back to the player's. */
  function finish(c: RoamCtx): void {
    endPosture();
    hat(true);
    snore?.show(false);
    HOME.netDown = false;
    c.cam.pitchMin = before.pitchMin;
    // (the room's camera, roam/_home.ts, takes him over from here)
    phase = 'done';
  }

  /** The camera into the room beside the mat, looking down along him (eased in; then the player's). */
  function camera(dt: number): void {
    const lying = smooth(u - 0.6);
    framed += dt;
    if (phase === 'out' || phase === 'stretch' || (phase === 'up' && u < 0.6)) {
      // (standing again: from by the east window up near the eaves, looking across the room at him: all of him in view,
      // arms up and all; the room's own camera, roam/_home.ts, takes him over once he is done)
      const s = body.scale;
      const fy = body.pos.y + s * 1.7 * 0.62;
      cam.focus.set(body.pos.x, fy, body.pos.z);
      const dx = body.pos.x - stretchCam.x;
      const dz = body.pos.z - stretchCam.z;
      const h = Math.hypot(dx, dz);
      const k = 1 - Math.exp(-STRETCH_RATE * dt);
      cam.yaw += angleDiff(Math.atan2(dx, dz), cam.yaw) * k;
      cam.pitch += (Math.atan2(stretchCam.y - fy, h) - cam.pitch) * k;
      cam.distance += (Math.hypot(h, stretchCam.y - fy) - cam.distance) * k;
      cam.behindYaw = cam.yaw;
      return;
    }
    if (framed < 3 && phase !== 'done') {
      const k = 1 - Math.exp(-CAM.rate * dt);
      cam.yaw += angleDiff(homeYaw(0) + Math.PI + CAM.yaw, cam.yaw) * k;
      cam.pitch += (CAM.pitch - cam.pitch) * k;
      cam.distance += (CAM.dist * (body.scale / 1.4) - cam.distance) * k;
    }
    // (his chest standing; his middle lying, half way back toward the pillow)
    const s = body.scale;
    const back = 0.75 * (s / 1.4) * lying;
    cam.focus.set(body.pos.x - Math.sin(body.yaw) * back, body.pos.y + s * (1.5 - 1.0 * lying), body.pos.z - Math.cos(body.yaw) * back);
    cam.behindYaw = cam.yaw;
  }

  return api;
}
