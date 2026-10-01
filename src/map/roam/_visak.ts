import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3, type PlaneGeometry } from 'three';
import { buildOffering, CANDLE_FLAME, stepPhase } from '../../character/procession';
import { chantAir, chantGain, chantWet, VISAK_CHANT } from '../audio/_visak';
import { SFX } from '../audio/addonSfx';
import { registerEvent } from '../calendar';
import { LENGTH, PAGODA_SPOTS, PROCESSION } from '../festival/_circuit';
import { festivalAt, festivalNow } from '../festival/_schedule';
import type { MapFrame } from '../types';
import { num, t } from '../ui/lang';
import { PAGODA } from '../village/_spots';
import { registerAddon, type AddonEnv, type RoamAddon } from './_addons';
import { LUNAR, nextLunarSpan } from './_calendarKhmer';
import { candleGlow, createLineWalk, faceCamera, type LineWalk } from './_procession';
import { LOTUS_HOOK } from './_lotusHook';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * Visak Bochea's candle procession (festival/_visak.ts), joined: on its
 * full-moon night, near the line walking round the pagoda's hall (or by the
 * elder at the top of the naga stair), "E  Join the procession": someone
 * hands him a candle, three incense sticks and a lotus bud (the elder, or
 * the walker beside him), and he walks in the line holding them before his
 * chest, the way leading him (_procession.ts). Three rounds clockwise round
 * the hall, counted at the front step ("Round 2 of 3"); then he leaves the
 * line there, goes up onto the porch to the candle tray east of the door,
 * sets his candle in the sand and lays the lotus by it, kneels and bows
 * three times (the prayer, `pray`), and a quiet "Sathu!". E ("Step out of
 * the line") or the stick pushed away and held: he steps out of the line
 * before that; Esc or a new mode: out at once, his hands empty. The candle
 * he placed stays lit in the tray while the festival lasts.
 *
 * The monks' chant (audio/_visak.ts) is heard from where they walk at the
 * line's head, near and far, whenever the procession is on.
 *
 * URL (checks): `procession=1` (or `walk`, `walk:<rounds done>`) puts him in
 * the line near `at=`; `procession=join` as it is handed to him;
 * `procession=place` kneeling at the tray, the candle placed; `report()`
 * gives them back. With `fest=visak&clock=0.5` (the night).
 */

/** The rounds round the hall. */
const ROUNDS = 3;
/** Walking up to the tray (m/s), the turn to the hall (s). */
const TO_TRAY = 1.05;
const TURN_T = 0.7;
/** From the way at the front step up onto the porch, then the kneeling place before the eastern tray (world m). */
const X = PAGODA.x;
const UP: readonly [number, number][] = [
  [X + 0.9, 94.08],
  [X + 1.6, 95.2],
  [PAGODA_SPOTS.kneel.x, PAGODA_SPOTS.kneel.z],
];
/** The porch's riser above the front step (z), the step's top and the porch floor (m). */
const RISER = { z: 94.5, step: PAGODA.terrace.y + 0.5, floor: PAGODA.floor };

type Place = 'off' | 'go' | 'turn' | 'pray';

function createVisakAddon(): RoamAddon {
  let env: AddonEnv | null = null;
  let walk: LineWalk | null = null;
  let rounds = 0;
  /** Where along the way he was last step, and how far he had walked when the last round was counted (m). */
  let lastS = 0;
  let countedAt = 0;
  let handed = false;
  let place: Place = 'off';
  let placeT = 0;
  let leg = 0;
  let turnFrom = 0;
  let turnTo = 0;
  let prayed = false;
  let pending: string | null = null;
  let glow: Mesh<PlaneGeometry, MeshBasicMaterial> | null = null;
  let placed: Group | null = null;
  let placedGlow: Mesh<PlaneGeometry, MeshBasicMaterial> | null = null;
  const v = new Vector3();
  let chantAt = -1;

  const holding = () => (walk?.stage ?? 'off') !== 'off' || place !== 'off';

  /** His hands: the candle, incense and lotus (or nothing). */
  const hold = (on: boolean) => {
    if (!env || on === handed) return;
    handed = on;
    if (on) env.explorer.rig.setSlot('visakOffering', 'chest', buildOffering());
    else env.explorer.rig.clearSlot('visakOffering');
  };

  /** All over: out of the line, his hands empty, his own pose back. */
  const finish = () => {
    if (!env) return;
    walk?.stop();
    hold(false);
    place = 'off';
    env.explorer.animator.posture = null;
    env.explorer.animator.postureFeet = true;
  };

  /** The candle and lotus he placed, lit in the eastern tray (made the first time). */
  const showPlaced = () => {
    if (!env) return;
    if (!placed) {
      const g = new Group();
      g.name = 'roam:visak-placed';
      const box = new BoxGeometry(1, 1, 1);
      const add = (m: MeshStandardMaterial | MeshBasicMaterial, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
        const me = new Mesh(box, m);
        me.position.set(x, y, z);
        me.scale.set(sx, sy, sz);
        me.raycast = () => {};
        g.add(me);
      };
      // (a candle taller than the tray's own, the lotus laid by it on its stem)
      add(new MeshStandardMaterial({ color: 0xf6efd8, roughness: 0.7 }), 0, 0.11, 0, 0.045, 0.22, 0.045);
      add(new MeshBasicMaterial({ color: 0xffd080 }), 0, 0.25, 0, 0.035, 0.06, 0.035);
      add(new MeshStandardMaterial({ color: 0xf2a8c0, roughness: 0.85 }), 0.13, 0.04, 0.03, 0.08, 0.07, 0.11);
      add(new MeshStandardMaterial({ color: 0x4a8a3a, roughness: 0.9 }), 0.13, 0.03, -0.12, 0.018, 0.018, 0.16);
      placedGlow = candleGlow(0.9);
      placedGlow.position.set(0, 0.28, 0);
      g.add(placedGlow);
      env.scene.add(g);
      placed = g;
    }
    const tr = PAGODA_SPOTS.trays[1];
    placed.position.set(tr.x + 0.08, PAGODA.floor + 0.25, tr.z - 0.12);
    placed.visible = true;
  };

  /** Into the line: the toast says who hands it over. */
  const joined = (ctx: RoamCtx) => {
    rounds = 0;
    lastS = walk!.s;
    countedAt = 0;
    prayed = false;
    ctx.hud.toast(t(walk!.fromGiver ? 'visakGiveGrandma' : 'visakGive'));
    SFX.play('visakGive', 0.8);
  };

  /** Kneeling at the tray: the candle placed, the prayer begun. */
  const kneel = () => {
    if (!env) return;
    hold(false);
    showPlaced();
    // (a lotus he picked from the boat is the one laid with the candle: roam/_lotus.ts)
    LOTUS_HOOK.offerWith('visak');
    SFX.play('visakPlace', 0.9);
    env.explorer.animator.posture = null;
    env.explorer.play('pray');
    place = 'pray';
    placeT = 0;
    prayed = false;
  };

  return {
    id: 'visak',
    get holding() {
      return holding();
    },
    get handsBusy() {
      return holding();
    },

    init(e) {
      env = e;
      walk = createLineWalk(e, 'visak', 'candle');
      glow = candleGlow(0.55);
      e.scene.add(glow);
    },

    offer(ctx, mode) {
      if (mode !== 'walk' || !walk || holding() || !walk.canJoin(ctx)) return null;
      return `E  ${t('visakJoin')}`;
    },

    use(ctx) {
      if (!walk) return;
      walk.join(ctx);
      joined(ctx);
    },

    hold(ctx, dt) {
      if (!walk || !env) return { prompt: null };
      const body = ctx.body;
      // ── In the line ──
      if (walk.stage !== 'off') {
        // (the candle comes into his hands as it is handed over)
        if (walk.stage === 'join' && walk.stageT > 0.45) hold(true);
        if (handed && (walk.stage === 'join' || walk.stage === 'walk')) walk.pose.hold = Math.min(1, walk.pose.hold + dt * 2.2);
        const was = walk.stage;
        if (!walk.step(ctx, dt)) {
          // (stepped out, or the festival went away: his hands empty)
          finish();
          return { prompt: null };
        }
        if (was === 'walk' && walk.stage === 'walk') {
          // A round counted as he passes the front step, once he has walked half the way round since the last.
          const crossed = walk.s < lastS && lastS - walk.s > LENGTH / 2;
          lastS = walk.s;
          if (crossed && walk.walked - countedAt > LENGTH / 2) {
            countedAt = walk.walked;
            rounds++;
            if (rounds >= ROUNDS) {
              // Three rounds: out of the line at the front step, up to the tray with the candle.
              ctx.hud.toast(t('visakPlaceIt'));
              walk.release();
              place = 'go';
              placeT = 0;
              leg = 0;
              return { prompt: null };
            }
            ctx.hud.toast(t('visakRound', { n: num(rounds + 1) }));
          }
          // (E steps out; not while his camera is up: E is not its key, but a slip there should not end three rounds)
          if ((ctx.input.use && !env.photo.kind) || walk.pushedOut(ctx, dt)) walk.stepOut(ctx);
        }
        return { prompt: walk.stage === 'walk' ? `E  ${t('visakOut')}` : null };
      }
      // ── Up to the tray, the candle placed, the prayer ──
      placeT += dt;
      const pose = walk.pose;
      pose.t += dt;
      if (place === 'go') {
        const [tx, tz] = UP[leg];
        const dx = tx - body.pos.x;
        const dz = tz - body.pos.z;
        const d = Math.hypot(dx, dz);
        const stride = TO_TRAY * dt;
        if (d <= stride) {
          body.pos.x = tx;
          body.pos.z = tz;
          if (++leg >= UP.length) {
            const k = PAGODA_SPOTS.kneel;
            place = 'turn';
            placeT = 0;
            turnFrom = body.yaw;
            turnTo = Math.atan2(k.fx - body.pos.x, k.fz - body.pos.z);
          }
        } else {
          body.pos.x += (dx / d) * stride;
          body.pos.z += (dz / d) * stride;
          body.yaw += angleDiff(Math.atan2(dx, dz), body.yaw) * (1 - Math.exp(-dt * 8));
        }
        // (up the porch's riser from the front step)
        const u = Math.min(1, Math.max(0, (body.pos.z - RISER.z + 0.15) / 0.3));
        body.pos.y = RISER.step + (RISER.floor - RISER.step) * u * u * (3 - 2 * u);
        pose.walk = Math.min(1, pose.walk + dt * 2);
        stepPhase(pose, TO_TRAY / body.scale, dt);
      } else if (place === 'turn') {
        const u = Math.min(1, placeT / TURN_T);
        body.yaw = turnFrom + angleDiff(turnTo, turnFrom) * u * u * (3 - 2 * u);
        pose.walk = Math.max(0, pose.walk - dt * 3);
        if (u >= 1) kneel();
      } else if (place === 'pray') {
        const praying = env.explorer.currentAction === 'pray';
        if (praying) prayed = true;
        // (the three bows done, or the player got him up)
        if ((prayed && !praying) || placeT > 14) {
          ctx.hud.toast(t('visakThanks'));
          finish();
          return { prompt: null };
        }
      }
      body.vel.set(0, 0, 0);
      body.grounded = true;
      env.explorer.setMotion(0, true, 0);
      const h = 1.7 * body.scale * 0.95;
      ctx.cam.focus.set(body.pos.x, body.pos.y + h * 0.86, body.pos.z);
      ctx.cam.behindYaw = body.yaw;
      ctx.cam.turn(ctx.input.lookYaw, ctx.input.lookPitch, ctx.input.zoom);
      return { prompt: null };
    },

    after(ctx, mode) {
      // (a shot's state, once the festival's line is there)
      if (!pending || !walk || !env || mode !== 'walk' || PROCESSION.kind !== 'visak' || holding()) return;
      const p = pending;
      if (p === 'place') {
        pending = null;
        const k = PAGODA_SPOTS.kneel;
        ctx.body.pos.set(k.x, k.y, k.z);
        ctx.body.yaw = Math.atan2(k.fx - k.x, k.fz - k.z);
        kneel();
        return;
      }
      if (!PROCESSION.full) return;
      pending = null;
      walk.join(ctx, p !== 'join');
      joined(ctx);
      const m = /^walk:(\d)$/.exec(p);
      rounds = m ? Math.min(ROUNDS - 1, Number(m[1])) : 0;
      if (p !== 'join') {
        hold(true);
        walk.pose.hold = 1;
      }
    },

    frame(f: MapFrame) {
      if (!env) return;
      // The flame's glow at his hands and the placed one's, soft by day.
      const lit = Math.max(0, Math.min(1, (f.night - 0.2) / 0.35));
      if (glow) {
        glow.visible = handed && lit > 0;
        if (glow.visible) {
          env.explorer.rig.joints.chest.localToWorld(v.copy(CANDLE_FLAME));
          glow.position.copy(v);
          faceCamera(glow, f.camera);
          const fl = 0.9 + 0.1 * Math.sin(f.t * 13.1) * Math.sin(f.t * 7.3 + 1);
          glow.material.opacity = 0.7 * lit * fl;
          glow.scale.setScalar(0.24 * env.body.scale * fl);
        }
      }
      if (placed && placedGlow) {
        placed.visible = PROCESSION.kind === 'visak';
        placedGlow.visible = lit > 0;
        placedGlow.material.opacity = lit;
        if (placed.visible) faceCamera(placedGlow, f.camera);
      }
      // The chant from the monks at the line's head, while the procession walks.
      const c = PROCESSION.kind === 'visak' && PROCESSION.running ? PROCESSION.chant : null;
      if (!c) {
        SFX.level('visakChant', 0);
        return;
      }
      const d = f.listener.distanceTo(v.set(c.x, c.y, c.z));
      SFX.level('visakChant', Math.min(1, chantGain(d)));
      if (f.t - chantAt > 1 / 12 || f.t < chantAt) {
        chantAt = f.t;
        const e = f.camera.matrixWorld.elements;
        const side = d > 0.01 ? ((c.x - f.listener.x) * e[0] + (c.y - f.listener.y) * e[1] + (c.z - f.listener.z) * e[2]) / d : 0;
        VISAK_CHANT.place({ pan: Math.max(-0.85, Math.min(0.85, 0.85 * side * (d / (d + 12)))), air: chantAir(d), wet: chantWet(d) });
      }
    },

    setMode(next) {
      // (back to the map, into a boat, the parachute…: out of the line at once, his hands empty)
      if (next !== 'walk' && holding()) finish();
      if (next === 'overview') pending = null;
    },

    fromUrl(q) {
      const p = q.get('procession');
      if (!p || p === '0') return;
      pending = p === '1' || p === 'walk' ? 'walk:0' : p;
    },

    report() {
      if (place !== 'off') return { procession: 'place' };
      if (!walk || walk.stage === 'off') return null;
      return { procession: walk.stage === 'join' ? 'join' : `walk:${rounds}` };
    },
  };
}

registerAddon(createVisakAddon());

/** Visak Bochea in the calendar of events (the rule its part plays by: festival/_schedule.ts). */
registerEvent({
  id: 'visak',
  kind: 'festival',
  name: 'visakName',
  note: 'visakNote',
  place: 'visakPlace',
  begins: 'visakBegins',
  where: { x: PAGODA.x, z: PAGODA.z },
  on: (m) => festivalAt(m.season, m.day, m.clock) === 'visak',
  shown: (m) => festivalNow(m) === 'visak',
  step: 1 / 48,
  horizon: 400,
  // (the full moon of Pisakh)
  real: (from) => nextLunarSpan(from, LUNAR.pisakh, 14, 0, 0),
});
