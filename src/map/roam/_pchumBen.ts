import { BoxGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { buildBasket, THROW, throwHand } from '../../character/procession';
import { PCHUM_CHANT } from '../audio/_pchum';
import { chantAir, chantGain, chantWet } from '../audio/_visak';
import { SFX } from '../audio/addonSfx';
import { registerEvent } from '../calendar';
import { BALL_SIZE, PROCESSION } from '../festival/_circuit';
import { festivalAt, festivalNow } from '../festival/_schedule';
import type { MapFrame } from '../types';
import { num, t } from '../ui/lang';
import { PAGODA } from '../village/_spots';
import { registerAddon, type AddonEnv, type RoamAddon } from './_addons';
import { LUNAR, nextLunarSpan } from './_calendarKhmer';
import { createLineWalk, type LineWalk } from './_procession';
import { angleDiff } from './followCam';

/**
 * Pchum Ben's bay ben (festival/_pchumBen.ts), joined: before dawn, near the
 * people walking round the pagoda's hall (or by the grandmother at the top
 * of the naga stair), "E  Throw bay ben": she (or the walker beside him)
 * gives him a little basket of sticky-rice balls, and he walks round with
 * them, the way leading him (_procession.ts). E or Space throws one (a few:
 * `BALLS`): he takes it from the basket and casts it out to the left, away
 * from the hall, into the dark for the spirits of the ancestors; it falls
 * on the terrace or beyond its wall. After the last he steps out of the
 * line, turns to the hall and joins his palms (the sampeah): "Sathu! May
 * the ancestors receive this merit". The stick pushed away and held steps
 * him out before; Esc or a new mode: out at once.
 *
 * The monks' chant for the ancestors (audio/_pchum.ts) comes from inside
 * the hall while people walk, from the porch in the morning.
 *
 * URL (checks): `bayben=1` (or `<n>`: rice balls left) puts him in the line
 * near `at=`; `bayben=throw` in the middle of a throw, a ball in the air;
 * `bayben=thanks` stepped out, his palms joined; `report()` gives them
 * back. With `fest=pchumben&clock=0.7` (before dawn).
 */

/** Rice balls in his basket. */
const BALLS = 5;
/** After the last throw he walks on this long (s) before he steps out. */
const AFTER_LAST = 1.4;
/** His balls in the air or lying where they fell; how long one lies there (s). */
const LIE = 4.5;
const G = 9.8;
const T = PAGODA.terrace;

function createPchumAddon(): RoamAddon {
  let env: AddonEnv | null = null;
  let walk: LineWalk | null = null;
  let left = 0;
  let throwing = false;
  /** Seconds since the last ball left his hand (to step out after the last). */
  let since = 0;
  let thanks = 0;
  let pending: string | null = null;
  let basket = -1;
  const v = new Vector3();
  let chantAt = -1;
  // His thrown balls: a few, one instanced draw.
  let balls: InstancedMesh | null = null;
  const flying = Array.from({ length: BALLS }, () => ({ t: -1e9, p: new Vector3(), v: new Vector3(), land: 0 }));
  let nextBall = 0;
  let clock = 0;
  const m4 = new Matrix4();
  const q = new Quaternion();
  const sc = new Vector3();
  const tmp = new Vector3();
  const out = new Vector3();
  const fwd = new Vector3();
  /** A shot's throw (`bayben=throw`): started on the first step in the line, so the ball is in the air at the end of the shot's settling. */
  let urlThrow = false;

  /** His balls in the air and lying where they fell, and the one in his hand from the basket to the throw. */
  const drawBalls = () => {
    if (!balls || !env) return;
    let n = 0;
    for (const b of flying) {
      const age = clock - b.t;
      if (age < 0 || age > b.land + LIE) continue;
      const tau = Math.min(age, b.land);
      const k = age > b.land + LIE - 0.6 ? Math.max(0.01, (b.land + LIE - age) / 0.6) : 1;
      v.set(b.p.x + b.v.x * tau, b.p.y + b.v.y * tau - 0.5 * G * tau * tau + (age >= b.land ? BALL_SIZE * 0.4 : 0), b.p.z + b.v.z * tau);
      sc.setScalar(BALL_SIZE * k);
      m4.compose(v, q, sc);
      balls.setMatrixAt(n++, m4);
    }
    if (n || balls.count) balls.instanceMatrix.needsUpdate = true;
    balls.count = n;
    // The ball in his hand from the basket to the throw.
    const pose = walk?.pose;
    if (throwing && pose && pose.throwT >= THROW.take && pose.throwT < THROW.release && n < BALLS) {
      throwHand(pose.throwT, tmp);
      env.explorer.rig.joints.chest.localToWorld(v.copy(tmp));
      sc.setScalar(BALL_SIZE);
      m4.compose(v, q, sc);
      balls.setMatrixAt(n, m4);
      balls.count = n + 1;
      balls.instanceMatrix.needsUpdate = true;
    }
  };

  const holding = () => (walk?.stage ?? 'off') !== 'off' || thanks > 0;

  /**
   * His thrown balls' mesh: made and put in the scene the first time he is handed the basket (none on a page that
   * never sees Pchum Ben: no program to link), kept after.
   */
  const ensureBalls = () => {
    if (balls || !env) return;
    const mat = new MeshStandardMaterial({ color: 0xf4f0e4, roughness: 0.95 });
    mat.name = 'roam:bayben';
    balls = new InstancedMesh(new BoxGeometry(1, 0.85, 1), mat, BALLS);
    balls.name = 'roam:bayben';
    balls.instanceMatrix.setUsage(DynamicDrawUsage);
    balls.count = 0;
    balls.frustumCulled = false;
    balls.raycast = () => {};
    env.scene.add(balls);
  };

  /** The basket in his right hand with `n` balls (or none). */
  const showBasket = (n: number) => {
    if (!env || n === basket) return;
    basket = n;
    if (n >= 0) ensureBalls();
    if (n < 0) env.explorer.rig.clearSlot('pchumBasket');
    else env.explorer.rig.setSlot('pchumBasket', 'chest', buildBasket(n));
  };

  const finish = () => {
    walk?.stop();
    showBasket(-1);
    throwing = false;
    thanks = 0;
  };

  /** A ball leaves his left hand: out to his left, a little forward and up; where it comes down. */
  const release = () => {
    if (!env) return;
    const chest = env.explorer.rig.joints.chest;
    throwHand(THROW.release, tmp);
    chest.localToWorld(v.copy(tmp));
    // (his left and his forward, from the chest's own turn)
    chest.localToWorld(out.set(tmp.x + 1, tmp.y, tmp.z)).sub(v).normalize();
    chest.localToWorld(fwd.set(tmp.x, tmp.y, tmp.z + 1)).sub(v).normalize();
    const b = flying[nextBall];
    nextBall = (nextBall + 1) % BALLS;
    b.t = clock;
    b.p.copy(v);
    b.v.copy(out).multiplyScalar(3.4).addScaledVector(fwd, 1.0);
    b.v.y = 2.6;
    const fall = (y: number) => (b.v.y + Math.sqrt(Math.max(0, b.v.y * b.v.y + 2 * G * (b.p.y - y)))) / G;
    let tf = fall(T.y + 0.02);
    const fx = b.p.x + b.v.x * tf;
    const fz = b.p.z + b.v.z * tf;
    if (fx < T.x0 || fx > T.x1 || fz < T.z0 || fz > T.z1) tf = fall(T.y - 0.98);
    b.land = tf;
    SFX.play('pchumToss', 0.8);
  };

  return {
    id: 'pchumben',
    get holding() {
      return holding();
    },
    get handsBusy() {
      return holding();
    },

    init(e) {
      env = e;
      walk = createLineWalk(e, 'pchumben', 'basket');
    },

    offer(ctx, mode) {
      if (mode !== 'walk' || !walk || holding() || !walk.canJoin(ctx)) return null;
      return `E  ${t('pchumJoin')}`;
    },

    use(ctx) {
      if (!walk) return;
      walk.join(ctx);
      left = BALLS;
      since = 0;
      throwing = false;
      ctx.hud.toast(`${t(walk.fromGiver ? 'pchumGiveGrandma' : 'pchumGive')}  ·  ${t('pchumHow')}`);
      SFX.play('pchumGive', 0.8);
    },

    hold(ctx, dt) {
      if (!walk || !env) return { prompt: null };
      // ── Stepped out: his palms joined to the hall, then free ──
      if (walk.stage === 'off' && thanks > 0) {
        thanks -= dt;
        if (thanks <= 0) finish();
        const body = ctx.body;
        const h = 1.7 * body.scale * 0.95;
        ctx.cam.focus.set(body.pos.x, body.pos.y + h * 0.86, body.pos.z);
        // (behind him as he faces the hall, his palms joined: out on the open side, not from among the shrines)
        ctx.cam.behindYaw = body.yaw;
        if (!ctx.input.lookYaw && !ctx.input.lookPitch) ctx.cam.yaw += angleDiff(body.yaw, ctx.cam.yaw) * (1 - Math.exp(-dt * 2.2));
        ctx.cam.turn(ctx.input.lookYaw, ctx.input.lookPitch, ctx.input.zoom);
        env.explorer.setMotion(0, true, 0);
        return { prompt: null };
      }
      // ── In the line ──
      if (walk.stage === 'join' && walk.stageT > 0.45) showBasket(left);
      if (basket >= 0 && (walk.stage === 'join' || walk.stage === 'walk')) walk.pose.hold = Math.min(1, walk.pose.hold + dt * 2.2);
      // The throw: E or Space; a ball from the basket at the start, away at the release.
      const pose = walk.pose;
      if (throwing) {
        const t0 = pose.throwT;
        pose.throwT += dt;
        if (t0 < THROW.take && pose.throwT >= THROW.take) showBasket(left - 1);
        if (t0 < THROW.release && pose.throwT >= THROW.release) {
          left--;
          since = 0;
          release();
        }
        if (pose.throwT >= THROW.length) {
          throwing = false;
          pose.throwT = -1;
        }
      } else if (walk.stage === 'walk' && left > 0 && (((ctx.input.use || ctx.input.jump) && !env.photo.kind) || urlThrow)) {
        throwing = true;
        // (a shot's: the ball leaves the hand a third of a second before the shot is taken)
        pose.throwT = urlThrow ? 0.15 : 0;
        urlThrow = false;
      }
      since += dt;
      const wasOut = walk.stage === 'out';
      if (!walk.step(ctx, dt)) {
        // (out of the line: after the last ball, his palms joined and the thanks; else just out, or the festival gone)
        if (wasOut && left === 0 && PROCESSION.kind === 'pchumben') {
          showBasket(-1);
          env.explorer.play('greet');
          ctx.sound('greet', 1);
          ctx.hud.toast(t('pchumThanks'));
          thanks = 2.4;
          return { prompt: null };
        }
        finish();
        return { prompt: null };
      }
      if (walk.stage === 'walk' && !throwing) {
        if (left === 0 && since > AFTER_LAST) walk.stepOut(ctx);
        else if (walk.pushedOut(ctx, dt)) walk.stepOut(ctx);
      }
      return { prompt: walk.stage === 'walk' && left > 0 ? `E  ${t('pchumThrow', { n: num(left) })}` : null };
    },

    after(ctx, mode, dt) {
      // (the balls fly with the roaming steps: a shot's still frames hold them where they are)
      clock += dt;
      // (a shot's state, once the festival's line is there)
      if (!pending || !walk || !env || mode !== 'walk' || PROCESSION.kind !== 'pchumben' || !PROCESSION.full || holding()) return;
      const p = pending;
      pending = null;
      walk.join(ctx, true);
      left = /^\d$/.test(p) ? Math.max(0, Math.min(BALLS, Number(p))) : BALLS;
      since = 0;
      showBasket(left);
      walk.pose.hold = 1;
      if (p === 'throw') urlThrow = true;
      else if (p === 'thanks') {
        left = 0;
        walk.stepOut(ctx);
      }
    },

    frame(f: MapFrame) {
      if (!env) return;
      if (balls) drawBalls();
      // The chant for the ancestors, from the hall (before dawn) or the porch (the morning).
      const c = PROCESSION.kind === 'pchumben' ? PROCESSION.chant : null;
      if (!c) {
        SFX.level('pchumChant', 0);
        return;
      }
      const d = f.listener.distanceTo(v.set(c.x, c.y, c.z));
      SFX.level('pchumChant', Math.min(1, chantGain(d)));
      if (f.t - chantAt > 1 / 12 || f.t < chantAt) {
        chantAt = f.t;
        const e = f.camera.matrixWorld.elements;
        const side = d > 0.01 ? ((c.x - f.listener.x) * e[0] + (c.y - f.listener.y) * e[1] + (c.z - f.listener.z) * e[2]) / d : 0;
        PCHUM_CHANT.place({ pan: Math.max(-0.85, Math.min(0.85, 0.85 * side * (d / (d + 12)))), air: chantAir(d), wet: chantWet(d) });
      }
    },

    setMode(next) {
      if (next !== 'walk' && holding()) finish();
      if (next === 'overview') {
        pending = null;
        urlThrow = false;
        for (const b of flying) b.t = -1e9;
      }
    },

    fromUrl(q) {
      const p = q.get('bayben');
      if (!p || p === '0') return;
      pending = p === '1' ? String(BALLS) : p;
    },

    report() {
      if (thanks > 0) return { bayben: 'thanks' };
      if (!walk || walk.stage === 'off') return null;
      return { bayben: throwing ? 'throw' : String(left) };
    },
  };
}

registerAddon(createPchumAddon());

/** Pchum Ben in the calendar of events (the rule its part plays by: festival/_schedule.ts). */
registerEvent({
  id: 'pchumben',
  kind: 'festival',
  name: 'pchumName',
  note: 'pchumNote',
  place: 'pchumPlace',
  begins: 'pchumBegins',
  where: { x: PAGODA.x, z: PAGODA.z },
  on: (m) => festivalAt(m.season, m.day, m.clock) === 'pchumben',
  shown: (m) => festivalNow(m) === 'pchumben',
  step: 1 / 48,
  horizon: 400,
  // (the fifteen days of the waning moon of Phatrabot, Pchum on the last, and the 1st of Assoch)
  real: (from) => nextLunarSpan(from, LUNAR.phatrabot, 29, 14, 1),
});
