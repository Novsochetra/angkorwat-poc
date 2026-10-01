import { Color, Mesh, MeshBasicMaterial, RingGeometry, Vector3 } from 'three';
import type { ExpressionName } from '../../character/parts/face';
import { seyPose, type SeyStance } from '../../character/sey';
import { BODY_UNIT_M } from '../../world/scale';
import '../audio/_sey';
import { SFX } from '../audio/addonSfx';
import { pad } from '../pad/pad';
import { progress } from '../progress';
import { flightAt, flightDown, ME, newPoint, SEY, SEY_EVENTS, SEY_HEEL, SEY_KICK_Y, SEY_R_ME, SEY_SNAP, SEY_SPOT, type SeyFlight, type SeyResult } from '../sey';
import type { MapFrame } from '../types';
import { lang, num, onLang, t } from '../ui/lang';
import { registerAddon, touchJump, type AddonEnv, type AddonKey } from './_addons';
import { angleDiff } from './followCam';
import type { RoamBody, RoamCtx } from './types';

/**
 * Kick the sey (ទាត់សី) with the children of the sugar-palm village. By day
 * four of them kick a sey in a circle in the yard north of the sala
 * (people/_seyCircle.ts); near it on foot, E "Play sey with the children":
 * the circle opens a place for him (the children step round), he walks into
 * it and stands ready. The sey arcs from child to child and, about every
 * other kick, to him: a soft ring on the ground shows where it will come down
 * and a timing ring closes on it; Space (or E) as it comes down kicks it —
 * well timed, a clean kick with the inside of the foot back up to a child;
 * dead on, a quick turn and a heel back-kick (the children cheer); early or
 * late, his foot finds only air, the sey drops, a child laughs and runs for
 * it and the game goes on. A counter (top) shows his kicks in a row and his
 * best (kept: `sey.best` in progress.ts). The move stick (walking away) or E
 * while nothing is coming to him: he stops, the children close the circle.
 * At dusk (or in heavy rain) the children go home and the game ends.
 *
 * His foot meets the sey where it is (character/sey.ts: leg IK to the point,
 * the posture of the game); the timing is by the game's clock (the circle's,
 * `SEY.t`), so it plays the same at 30 and 144 frames a second; Space, E and
 * the stick are a keyboard's, a pad's (✕, □) and the touch controls' (the
 * jump button kicks, the Use button leaves).
 *
 * URL (checks): `sey=1` puts him in the game (in his place, the sey on its
 * way down to him, the rings closing), `sey=kick` at the touch of an inside
 * kick, `sey=heel` at the touch of the heel back-kick, `sey=miss` the sey on
 * the ground before him, a child bending for it; with `at=x,z` near the circle
 * his place is round from there (else on its north side); `seystreak=<n>` the
 * counter. Bug reports bring `sey=` and `seystreak=` back.
 */

/** Into his place at this pace (m/s); E is offered this near the circle's middle (m), this far up or down. */
const IN_PACE = 2.2;
const NEAR = SEY_R_ME + 3.4;
const RISE = 1.4;
/**
 * His kick's windows round the moment the timing ring closes (s; − early): dead on (a heel back-kick) round
 * `PERFECT_AT`, good from `EARLY` before to `LATE` after; a press earlier than `READY` before does nothing.
 */
const PERFECT = 0.04;
const PERFECT_AT = -0.015;
const EARLY = 0.13;
const LATE = 0.11;
const READY = 0.45;
/** The move stick pushed this far for this long: he walks away (stops playing). */
const AWAY = 0.5;
const AWAY_FOR = 0.12;
/** His kick spots: this far ahead of his feet and to the kicking foot's other side (BU). */
const SPOT_AHEAD = 5.0;
const SPOT_IN = 0.5;
/**
 * The camera while he plays: round at his right side (from behind, the sey coming down in front of him would be
 * behind his back), a little above, looking across him into the circle; framed this long after he joins.
 */
const CAM = { side: 1.45, pitch: 0.34, dist: 6.2, for: 1.8, rate: 2.4, back: 2.2, focus: 0.25, height: 1.3 };
/** The rings: the soft one where it comes down (m), the timing ring closing on it from this far out. */
const RING_R = 0.3;
const RING_FROM = 1.8;
/** The key help (bottom left) while he plays: Space kicks, E stops (or kicks, as it comes), the stick walks away, the drag looks. */
const KEYS: readonly AddonKey[] = [
  ['Space', 'seyKick', 'south'],
  ['E', 'seyLeave', 'west'],
  ['W A S D', 'seyAway', 'lstick'],
  ['Q R', 'rLook', 'rstick'],
];
/** A kick's whole move (s after the press): up, through, back down. */
const KICK_TIME = 0.6;

let env: AddonEnv | null = null;
let phase: 'off' | 'in' | 'play' = 'off';
/** Walking in: from where he pressed E to his place (m), facing the middle at the end. */
const from = new Vector3();
const slot = new Vector3();
let slotYaw = 0;
let inT = 0;
let inDur = 1;
const stance: SeyStance = { t: 0, ready: 0, lift: 0, foot: 'R', kind: 'none', since: 0, meet: SEY_SNAP, target: new Vector3(), look: new Vector3(), joy: 0 };
const posture = () => seyPose(stance);
/** The flights he has pressed for, and whose miss is counted. */
let pressed = -1;
let counted = -1;
let streak = 0;
let best = 0;
/** His best when this run began (a new one is told as the run ends). */
let bestBefore = 0;
let away = 0;
/** The circle's clock standing still (or the children gone) this long while he plays (s): it ended. */
let stale = 0;
let lastT = -1;
let joyLeft = 0;
let faceLeft = 0;
let faceBefore: ExpressionName | null = null;
/** The player's camera before he joined, and how long it has been framed (or the player turned it: theirs). */
let camBefore: { pitch: number; distance: number; follow: number } | null = null;
let framed = 0;
let camHands = false;
/** A shot's still moment (`sey=kick|heel|miss|1`). */
let still: '' | 'play' | 'kick' | 'heel' | 'miss' = '';
/** The circle's events read so far (-1: none yet). */
let seen = -1;
/** The flight whose ground is known, and when / where it comes down. */
let groundN = -1;
let groundT = 0;
let groundY = 0;
/** The rings' flash after a press: when (the game's clock), where (m), and what came of it. */
let flashAt = -1e9;
const flashAt3 = new Vector3();
let flashKind: SeyResult = 'good';
const pt = newPoint();
const _v = new Vector3();

// ── Words (made once a language) ─────────────────────────────────────────────

let wordsLang = '';
let joinPrompt = '';
let playPrompt = '';
function words(): void {
  const l = lang();
  if (l === wordsLang) return;
  wordsLang = l;
  joinPrompt = `E  ${t('seyJoin')}`;
  playPrompt = `Space  ${t('seyKick')}  ·  E  ${t('seyLeave')}`;
}

// ── The rings (two flat meshes in roaming's group, shown only while the sey comes to him) ──

let rings: { land: Mesh; time: Mesh; landMat: MeshBasicMaterial; timeMat: MeshBasicMaterial } | null = null;
const GOLD = new Color(0xffd27a);
const GOLD_HI = new Color(0xfff2c0);
const SOFT = new Color(0xfff6e0);
const MISS = new Color(0xe07a5a);

function makeRings(e: AddonEnv): NonNullable<typeof rings> {
  const mat = (c: Color) => new MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const landMat = mat(SOFT);
  const timeMat = mat(GOLD);
  const land = new Mesh(new RingGeometry(RING_R - 0.08, RING_R + 0.05, 40).rotateX(-Math.PI / 2), landMat);
  const time = new Mesh(new RingGeometry(0.93, 1, 56).rotateX(-Math.PI / 2), timeMat);
  for (const m of [land, time]) {
    m.name = 'sey:ring';
    m.visible = false;
    m.renderOrder = 3;
    m.frustumCulled = false;
    m.raycast = () => {};
    e.scene.add(m);
  }
  return { land, time, landMat, timeMat };
}

// ── The counter (top middle) ────────────────────────────────────────────────

let hud: { el: HTMLElement; n: HTMLElement; label: HTMLElement; best: HTMLElement } | null = null;
let hudShown = -1;
let hudBest = -1;

function makeHud(e: AddonEnv): NonNullable<typeof hud> {
  const s = document.createElement('style');
  s.textContent = `
    .rh > .sey-hud { left: 50%; top: calc(20 * var(--px)); transform: translate(-50%, -8px); padding: calc(7 * var(--px)) calc(16 * var(--px)) calc(7 * var(--px)) calc(14 * var(--px));
      gap: calc(10 * var(--px)); opacity: 0; visibility: hidden; pointer-events: none; --mu-edge: rgba(255, 208, 112, 0.6);
      transition: opacity 0.4s, transform 0.4s var(--mu-ease), visibility 0s 0.4s; }
    .rh > .sey-hud.is-on { opacity: 1; visibility: visible; transform: translate(-50%, 0); transition: opacity 0.35s, transform 0.35s var(--mu-ease); }
    .sey-n { min-width: calc(30 * var(--px)); text-align: center; font: 700 calc(30 * var(--px)) / 1 var(--mu-display); color: var(--mu-gold-hi); }
    .sey-hud.is-pop .sey-n { animation: sey-pop 0.32s var(--mu-ease); }
    .sey-hud.is-miss .sey-n { animation: sey-miss 0.45s ease-out; }
    @keyframes sey-pop { 0% { transform: scale(1); } 40% { transform: scale(1.32); } 100% { transform: scale(1); } }
    @keyframes sey-miss { 0% { color: #ffb08a; transform: translateY(0); } 30% { transform: translateY(calc(3 * var(--px))); } 100% { transform: translateY(0); } }
    .sey-col { display: flex; flex-direction: column; gap: calc(2 * var(--px)); }
    .sey-label { font-weight: 600; font-size: calc(14 * var(--px)); color: var(--mu-ink); white-space: nowrap; }
    .sey-best { font-size: calc(12.5 * var(--px)); color: var(--mu-ink2); white-space: nowrap; }
    :lang(km) .sey-label { font-size: calc(15 * var(--px)); line-height: 1.3; }
    :lang(km) .sey-best { font-size: calc(13 * var(--px)); line-height: 1.3; }
    @media (max-width: 639px) {
      .rh > .sey-hud { left: 10px; top: 168px; transform: translate(0, -8px); }
      .rh > .sey-hud.is-on { transform: none; }
    }
  `;
  document.head.append(s);
  const el = document.createElement('div');
  el.className = 'sey-hud mu-frame mu-sm';
  el.setAttribute('role', 'status');
  el.innerHTML = '<span class="mu-bg"></span><span class="sey-n"></span><span class="sey-col"><span class="sey-label"></span><span class="sey-best"></span></span>';
  e.layer.append(el);
  const h = { el, n: el.querySelector<HTMLElement>('.sey-n')!, label: el.querySelector<HTMLElement>('.sey-label')!, best: el.querySelector<HTMLElement>('.sey-best')! };
  onLang(() => {
    hudShown = hudBest = -1;
  });
  return h;
}

/** The counter: shown while he plays; the numbers written when they change (a pop on a kick, a shake on a miss). */
function showHud(on: boolean): void {
  const e = env;
  if (!e) return;
  if (!on) {
    hud?.el.classList.remove('is-on');
    return;
  }
  hud ??= makeHud(e);
  const h = hud;
  h.el.classList.add('is-on');
  if (hudShown === streak && hudBest === best) return;
  const up = hudShown >= 0 && streak > hudShown;
  const down = hudShown > 0 && streak === 0;
  hudShown = streak;
  hudBest = best;
  h.n.textContent = num(streak);
  h.label.textContent = t('seyStreak');
  h.best.textContent = t('seyBest', { n: num(best) });
  h.el.classList.remove('is-pop', 'is-miss');
  if (up || down) {
    // (restart the animation)
    void h.el.offsetWidth;
    h.el.classList.add(up ? 'is-pop' : 'is-miss');
  }
}

// ── His place, his kick spots, his space ───────────────────────────────────

/** A point of the map in his space (BU: +x his left, +z ahead, from his feet). */
function toBody(b: RoamBody, x: number, y: number, z: number, out: Vector3): Vector3 {
  const s = b.scale * BODY_UNIT_M;
  const dx = x - b.pos.x;
  const dz = z - b.pos.z;
  const c = Math.cos(b.yaw);
  const sn = Math.sin(b.yaw);
  return out.set((dx * c - dz * sn) / s, (y - b.pos.y) / s, (dx * sn + dz * c) / s);
}

/** Where his right and left foot meet the sey (the map, m): ahead of him, a little to the other side, a kick high. */
function footSpots(b: RoamBody): void {
  const s = b.scale * BODY_UNIT_M;
  const c = Math.cos(b.yaw);
  const sn = Math.sin(b.yaw);
  for (const [spot, side] of [
    [SEY.footR, 1],
    [SEY.footL, -1],
  ] as const) {
    const lx = side * SPOT_IN * s;
    const lz = SPOT_AHEAD * s;
    spot.x = b.pos.x + lx * c + lz * sn;
    spot.y = b.pos.y + SEY_KICK_Y;
    spot.z = b.pos.z - lx * sn + lz * c;
  }
}

/** When the flight `fl` would come down on the ground (cached a flight). */
function groundOf(fl: SeyFlight, e: AddonEnv): void {
  if (groundN === fl.n) return;
  groundN = fl.n;
  groundY = e.world.groundAt(fl.ex, fl.ez);
  groundT = flightDown(fl, groundY + 0.03);
}

const smooth = (u: number) => {
  const k = Math.min(1, Math.max(0, u));
  return k * k * (3 - 2 * k);
};

// ── Joining, playing, leaving ───────────────────────────────────────────────

/** Into the game: his place round the circle from where he stands; he walks into it (or is there at once). */
function join(ctx: RoamCtx, instant: boolean): void {
  const e = env!;
  const b = ctx.body;
  SEY.angle = Math.atan2(b.pos.x - SEY_SPOT.x, b.pos.z - SEY_SPOT.z);
  slot.set(SEY_SPOT.x + Math.sin(SEY.angle) * SEY_R_ME, 0, SEY_SPOT.z + Math.cos(SEY.angle) * SEY_R_ME);
  slot.y = e.world.groundAt(slot.x, slot.z);
  slotYaw = Math.atan2(SEY_SPOT.x - slot.x, SEY_SPOT.z - slot.z);
  SEY.joined = true;
  SEY.ready = false;
  SEY.streak = streak;
  phase = 'in';
  from.copy(b.pos);
  inT = 0;
  inDur = Math.max(0.3, Math.hypot(slot.x - from.x, slot.z - from.z) / IN_PACE);
  pressed = counted = SEY.flight.n;
  stance.kind = 'none';
  stance.ready = stance.lift = stance.joy = 0;
  joyLeft = faceLeft = 0;
  away = stale = 0;
  lastT = -1;
  best = Math.max(best, progress.get('sey.best', 0, isCount));
  bestBefore = best;
  faceBefore = b.explorer.currentExpression;
  b.explorer.setExpression('determined');
  const cam = ctx.cam;
  camBefore ??= { pitch: cam.pitch, distance: cam.distance, follow: cam.follow };
  framed = 0;
  camHands = false;
  cam.follow = 0;
  b.vel.set(0, 0, 0);
  if (instant) inPlace(ctx);
  showHud(true);
}

/** In his place: the game's posture (the Animator plants his feet), ready. */
function inPlace(ctx: RoamCtx): void {
  const b = ctx.body;
  phase = 'play';
  b.pos.copy(slot);
  b.yaw = slotYaw;
  b.vel.set(0, 0, 0);
  b.grounded = true;
  footSpots(b);
  b.explorer.animator.posture = posture;
  b.explorer.animator.postureFeet = true;
  // (on touch the jump button kicks while he plays: it says so)
  touchJump('seyKick');
}

/** Out of the game (the stick, E, the children gone home, another mode): the walk is his again; the children close the circle. */
function leave(ctx: RoamCtx, why: 'left' | 'gone' | 'quiet'): void {
  const b = ctx.body;
  if (phase === 'off') return;
  phase = 'off';
  SEY.joined = false;
  SEY.ready = false;
  SEY.paused = false;
  b.explorer.animator.posture = null;
  b.explorer.animator.postureFeet = true;
  b.explorer.setMotion(0, true, 0);
  touchJump(null);
  if (faceBefore) b.explorer.setExpression(faceBefore);
  faceBefore = null;
  showHud(false);
  if (rings) rings.land.visible = rings.time.visible = false;
  if (still) {
    still = '';
    SEY.shot = '';
  }
  if (why === 'quiet') return;
  if (why === 'gone') ctx.hud.toast(t('seyGone'));
  else if (best > bestBefore && best >= 3) ctx.hud.toast(t('seyNewBest', { n: num(best) }));
  bestBefore = best;
}

/** A press of Space (or E) as the sey comes to him: judged by when it was against when the ring closes. */
function kick(ctx: RoamCtx, fl: SeyFlight, now: number): void {
  const e = env!;
  const b = ctx.body;
  pressed = fl.n;
  const off = now - fl.t1;
  const result: SeyResult = Math.abs(off - PERFECT_AT) <= PERFECT ? 'perfect' : off >= -EARLY && off <= LATE ? 'good' : off < 0 ? 'early' : 'late';
  const hit = result === 'perfect' || result === 'good';
  groundOf(fl, e);
  // (his foot meets it a moment after the press: at once for the inside of the foot, after a quick turn for the heel)
  let at = now + (result === 'perfect' ? SEY_HEEL : SEY_SNAP);
  if (hit) at = Math.min(at, groundT - 0.02);
  const k = SEY.kick;
  k.n++;
  k.result = result;
  k.flight = fl.n;
  k.at = at;
  stance.kind = result === 'perfect' ? 'heel' : hit ? 'inside' : 'whiff';
  stance.foot = fl.foot;
  stance.since = 0;
  stance.meet = Math.max(0.02, at - now);
  // (a kick at the air goes to where it was to be kicked; a good one to where it is when the foot gets there)
  if (hit) flightAt(fl, at, pt);
  else {
    pt.x = fl.ex;
    pt.y = fl.ey;
    pt.z = fl.ez;
  }
  toBody(b, pt.x, pt.y, pt.z, stance.target);
  flashAt = now;
  groundOf(fl, e);
  flashAt3.set(fl.ex, groundY, fl.ez);
  flashKind = result;
  if (hit) {
    streak++;
    SEY.streak = streak;
    if (streak > best) {
      best = streak;
      progress.set('sey.best', best);
    }
    joyLeft = result === 'perfect' ? 1.4 : 0;
    faceLeft = 1.1;
    b.explorer.setExpression('happy');
    pad.rumble(result === 'perfect' ? 'bump' : 'tick', result === 'perfect' ? 0.9 : 0.6);
  } else {
    SFX.play('seySwish', 0.8);
    miss(ctx, fl.n);
  }
}

/** His run ends: the counter back to nought, a startled face (the children laugh: the circle). */
function miss(ctx: RoamCtx, n: number): void {
  counted = n;
  streak = 0;
  SEY.streak = 0;
  faceLeft = 1.0;
  ctx.body.explorer.setExpression('surprised');
  if (best > bestBefore && best >= 3) ctx.hud.toast(t('seyNewBest', { n: num(best) }));
  bestBefore = best;
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

// ── The add-on ──────────────────────────────────────────────────────────────

registerAddon({
  id: 'sey',

  get holding() {
    return phase !== 'off';
  },

  get handsBusy() {
    return phase !== 'off';
  },

  keys() {
    return phase === 'off' ? null : KEYS;
  },

  init(e) {
    env = e;
    best = progress.get('sey.best', 0, isCount);
  },

  offer(ctx, mode) {
    const e = env;
    if (!e || mode !== 'walk' || phase !== 'off' || !SEY.out || e.busy()) return null;
    const p = ctx.body.pos;
    const d = Math.hypot(p.x - SEY_SPOT.x, p.z - SEY_SPOT.z);
    if (d > NEAR || d < 0.8 || Math.abs(p.y - SEY.y) > RISE) return null;
    words();
    return joinPrompt;
  },

  use(ctx) {
    join(ctx, false);
  },

  input(ctx, mode, _tap, dt) {
    if (phase === 'off' || mode !== 'walk') return false;
    const i = ctx.input;
    // (the camera is the player's as soon as they turn it)
    if (i.lookYaw || i.lookPitch) camHands = true;
    ctx.cam.turn(i.lookYaw, i.lookPitch, i.zoom);
    if (still) return true;
    const push = Math.hypot(i.move.x, i.move.y);
    away = push > AWAY ? away + dt : 0;
    if (phase === 'in') {
      // (changed his mind on the way in)
      if (i.use || away > AWAY_FOR) leave(ctx, 'left');
      return true;
    }
    const fl = SEY.flight;
    // (the game's clock at this press: its step adds this frame's time after roaming's; the press came during the frame)
    const now = SEY.t + dt * 0.5;
    const coming = fl.on && fl.to === ME && fl.n !== pressed && fl.n !== counted;
    const kickable = coming && now >= fl.t1 - READY;
    if ((i.jump || i.use) && kickable && stance.kind === 'none') kick(ctx, fl, now);
    else if (away > AWAY_FOR || (i.use && !coming && (stance.kind === 'none' || stance.since > stance.meet + 0.2))) leave(ctx, 'left');
    // (the stick, Space and E are the game's: no tools, emotes or sitting down meanwhile)
    return true;
  },

  hold(ctx, dt) {
    const e = env!;
    const b = ctx.body;
    const ex = b.explorer;
    const cam = ctx.cam;
    const s = b.scale;
    words();
    if (phase === 'in') {
      inT += dt;
      const u = Math.min(1, inT / inDur);
      const k = smooth(u);
      b.pos.lerpVectors(from, slot, k);
      b.pos.y = Math.max(e.world.groundAt(b.pos.x, b.pos.z), from.y + (slot.y - from.y) * k);
      const way = Math.atan2(slot.x - from.x, slot.z - from.z);
      const turn = u < 0.7 && inDur > 0.4 ? way : slotYaw;
      b.yaw += angleDiff(turn, b.yaw) * (1 - Math.exp(-dt * 10));
      // (his legs walk as fast as he goes)
      const speed = (Math.hypot(slot.x - from.x, slot.z - from.z) / inDur) * 6 * u * (1 - u);
      ex.setMotion(speed / s, true, 0);
      if (u >= 1) inPlace(ctx);
    } else {
      b.pos.copy(slot);
      b.vel.set(0, 0, 0);
      b.yaw += angleDiff(slotYaw, b.yaw) * (1 - Math.exp(-dt * 10));
      ex.setMotion(0, true, 0);
      play(ctx, dt);
    }
    if (phase === 'off') return { prompt: null };
    // The camera: at his right side, a little above, looking across him into the circle (framed a moment, then the
    // player's). (A still of a kick or a miss: on him, for the picture.)
    const f = cam.focus;
    const k = still && still !== 'play' ? 0.06 : CAM.focus;
    f.set(b.pos.x + (SEY_SPOT.x - b.pos.x) * k, b.pos.y + CAM.height * (s / 1.4), b.pos.z + (SEY_SPOT.z - b.pos.z) * k);
    cam.behindYaw = slotYaw + CAM.side;
    cam.follow = 0;
    if (!camHands && framed < CAM.for) {
      framed += dt;
      const k = 1 - Math.exp(-CAM.rate * dt);
      cam.yaw += angleDiff(slotYaw + CAM.side, cam.yaw) * k;
      cam.pitch += (CAM.pitch - cam.pitch) * k;
      cam.distance += (CAM.dist * (s / 1.4) - cam.distance) * k;
    }
    return { prompt: phase === 'play' ? playPrompt : null };
  },

  after(ctx, _mode, dt) {
    // (out of the game: back to the player's own view)
    if (phase !== 'off' || !camBefore) return;
    const cam = ctx.cam;
    const k = 1 - Math.exp(-CAM.back * dt);
    cam.pitch += (camBefore.pitch - cam.pitch) * k;
    cam.distance += (camBefore.distance - cam.distance) * k;
    if (Math.abs(camBefore.pitch - cam.pitch) < 0.005 && Math.abs(camBefore.distance - cam.distance) < 0.05) {
      cam.follow = camBefore.follow;
      camBefore = null;
    }
  },

  frame(f, mode) {
    const e = env;
    if (!e) return;
    sounds(f);
    showRings(e, f, mode);
    if (phase !== 'off') showHud(true);
  },

  setMode(next, _prev, ctx) {
    if (next === 'walk' || phase === 'off') return;
    leave(ctx, 'quiet');
    // (back to the map: the camera is the overview's; else the mode's own)
    if (camBefore) {
      ctx.cam.follow = camBefore.follow;
      camBefore = null;
    }
  },

  fromUrl(q, ctx) {
    const v = q.get('sey');
    // (on foot only: the circle is on the ground)
    if (!v || v === '0' || !env || q.get('roam') !== 'walk') return;
    const b = ctx.body;
    // (his place round from where `at=` put him, when near; else the circle's north side)
    if (Math.hypot(b.pos.x - SEY_SPOT.x, b.pos.z - SEY_SPOT.z) > NEAR + 6) b.pos.set(SEY_SPOT.x, b.pos.y, SEY_SPOT.z - SEY_R_ME);
    const yaw0 = b.yaw;
    const n = Number(q.get('seystreak'));
    streak = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    best = Math.max(best, streak);
    join(ctx, true);
    bestBefore = best;
    // (rcam= turned the camera against his facing before this: keep that turn; else frame him at once)
    const cam = ctx.cam;
    if (q.get('rcam')) {
      cam.yaw += b.yaw - yaw0;
      camHands = true;
    } else {
      cam.yaw = b.yaw + CAM.side;
      cam.pitch = CAM.pitch;
      cam.distance = CAM.dist * (b.scale / 1.4);
      framed = CAM.for;
    }
    // (a shot holds the moment; so does a live page with `seystill=1`, to look at it from round about)
    still = ctx.shot || q.get('seystill') === '1' ? (v === 'kick' || v === 'heel' || v === 'miss' ? v : 'play') : '';
    SEY.shot = still;
    if (still) stance.ready = 1;
  },

  report() {
    if (phase !== 'play') return null;
    const now = stance.kind === 'heel' ? 'heel' : stance.kind === 'inside' ? 'kick' : stance.kind === 'whiff' ? 'miss' : '1';
    return { sey: now, seystreak: String(streak) };
  },
});

/** One step in his place: ready, the knee lifting as it comes, the kick's moves, misses, the children gone. */
function play(ctx: RoamCtx, dt: number): void {
  const e = env!;
  const b = ctx.body;
  const ex = b.explorer;
  const fl = SEY.flight;
  // (the game's clock now: the circle's step adds this frame's time after roaming's)
  const now = still ? SEY.t : SEY.t + dt;
  stance.t += dt;
  stance.ready += (1 - stance.ready) * (1 - Math.exp(-dt * 6));
  SEY.ready = stance.ready > 0.8;
  footSpots(b);
  const coming = fl.on && fl.to === ME && fl.n !== pressed && fl.n !== counted;
  if (still) return stillPose(ctx);
  // The knee lifts and turns out as it comes down to him (the foot it comes to), and down again after.
  if (coming) stance.foot = fl.foot;
  const lift = coming ? smooth((now - (fl.t1 - 0.5)) / 0.4) : 0;
  if (stance.kind === 'none') stance.lift += (lift - stance.lift) * (1 - Math.exp(-dt * 12));
  // The kick's moves, then ready again.
  if (stance.kind !== 'none') {
    stance.since += dt;
    if (stance.since > stance.meet + KICK_TIME) {
      stance.kind = 'none';
      stance.lift = 0;
    }
  }
  joyLeft = Math.max(0, joyLeft - dt);
  stance.joy = Math.min(1, joyLeft / 0.35) * (joyLeft > 0 ? 1 : 0);
  if (faceLeft > 0 && (faceLeft -= dt) <= 0) ex.setExpression('determined');
  // (he watches the sey)
  toBody(b, SEY.sx, SEY.sy, SEY.sz, _v);
  stance.look.lerp(_v, 1 - Math.exp(-dt * 14));
  // It came down without a kick: a miss.
  if (fl.to === ME && fl.n !== pressed && fl.n !== counted) {
    groundOf(fl, e);
    if (now > groundT + 0.05 || (!fl.on && now > fl.t1)) miss(ctx, fl.n);
  }
  // The children gone home (dusk, rain), or the circle not going on (the village off the map): out of the game.
  stale = !SEY.out || (SEY.t === lastT && !SEY.paused) ? stale + dt : 0;
  lastT = SEY.t;
  // (a card asking something, Back to the map?: the game waits)
  SEY.paused = typeof document !== 'undefined' && document.body.classList.contains('mu-asking');
  if (stale > 1.2) leave(ctx, SEY.out ? 'quiet' : 'gone');
}

/** A shot's still moment: the kick at its touch, the heel's, the air after a miss, or ready as it comes. */
function stillPose(ctx: RoamCtx): void {
  const b = ctx.body;
  const fl = SEY.flight;
  const T = SEY.t;
  toBody(b, SEY.sx, SEY.sy, SEY.sz, stance.look);
  stance.foot = 'R';
  stance.joy = 0;
  if (still === 'kick' || still === 'heel') {
    stance.kind = still === 'heel' ? 'heel' : 'inside';
    stance.meet = still === 'heel' ? SEY_HEEL : SEY_SNAP;
    stance.since = stance.meet;
    flightAt(fl, T, pt);
    toBody(b, pt.x, pt.y, pt.z, stance.target);
    stance.lift = 1;
    b.explorer.setExpression(still === 'heel' ? 'happy' : 'determined');
  } else if (still === 'miss') {
    stance.kind = 'whiff';
    stance.meet = SEY_SNAP;
    stance.since = SEY_SNAP + 0.18;
    toBody(b, SEY.footR.x, SEY.footR.y, SEY.footR.z, stance.target);
    stance.lift = 1;
    b.explorer.setExpression('surprised');
  } else {
    stance.kind = 'none';
    stance.lift = fl.on ? smooth((T - (fl.t1 - 0.5)) / 0.4) : 0;
  }
}

// ── Sounds: the circle's events, as loud as near they are ─────────────────────

const SFX_OF: Record<string, [string, number]> = { thock: ['seyThock', 1], flutter: ['seyFlutter', 1], tap: ['seyTap', 1], catch: ['seyTap', 0.45], cheer: ['seyClap', 1] };

function sounds(f: MapFrame): void {
  if (seen < 0 || SEY.head - seen > SEY_EVENTS) seen = SEY.head;
  while (seen < SEY.head) {
    const ev = SEY.events[seen % SEY_EVENTS];
    seen++;
    const s = SFX_OF[ev.kind];
    if (!s || f.dt <= 0) continue;
    const d = Math.hypot(ev.x - f.listener.x, ev.y - f.listener.y, ev.z - f.listener.z);
    const g = ev.gain * s[1] * Math.min(1, Math.max(0, 1 - (d - 4) / 32));
    if (g > 0.02) SFX.play(s[0], g);
  }
}

// ── The rings ─────────────────────────────────────────────────────────────────

/**
 * Where the sey will come down to him: a soft ring on the ground under his kick spot, and a gold ring closing on
 * it, meeting it as the sey reaches the spot (the moment to kick). A press flashes them (gold, bright gold for the
 * heel, a dull red for a miss) and they fade.
 */
function showRings(e: AddonEnv, f: MapFrame, mode: string): void {
  const fl = SEY.flight;
  const now = still ? SEY.t : SEY.t + f.dt;
  const playing = phase === 'play' && mode === 'walk';
  const flash = now - flashAt;
  const coming = playing && fl.on && fl.to === ME && fl.kind !== 'toss' && fl.n !== pressed && fl.n !== counted && now < fl.t1 + 0.25;
  if (!playing || (!coming && !(flash >= 0 && flash < 0.4))) {
    if (rings) rings.land.visible = rings.time.visible = false;
    return;
  }
  rings ??= makeRings(e);
  const r = rings;
  r.land.visible = r.time.visible = true;
  if (!coming) {
    // (the press: both rings take its colour, the timing ring springs out a little, and they fade)
    const c = flashKind === 'perfect' ? GOLD_HI : flashKind === 'good' ? GOLD : MISS;
    const k = 1 - flash / 0.4;
    r.land.position.set(flashAt3.x, flashAt3.y + 0.035, flashAt3.z);
    r.time.position.set(flashAt3.x, flashAt3.y + 0.04, flashAt3.z);
    r.landMat.color.copy(c);
    r.timeMat.color.copy(c);
    r.landMat.opacity = 0.9 * k;
    r.timeMat.opacity = 0.95 * k;
    const grow = RING_R + 0.05 + (flashKind === 'perfect' ? 0.5 : 0.3) * Math.sqrt(flash / 0.4);
    r.time.scale.set(grow, 1, grow);
    return;
  }
  groundOf(fl, e);
  r.land.position.set(fl.ex, groundY + 0.035, fl.ez);
  r.time.position.set(fl.ex, groundY + 0.04, fl.ez);
  const into = Math.min(1, Math.max(0, (now - fl.t0) / 0.3));
  // The timing ring closes at an even pace over the flight, meeting the soft ring as it reaches his kick spot.
  const left = (fl.t1 - now) / Math.max(0.3, fl.t1 - fl.t0);
  const rad = left >= 0 ? RING_R + 0.05 + (RING_FROM - RING_R) * left : (RING_R + 0.05) * (1 + left * 2);
  r.time.scale.set(Math.max(0.05, rad), 1, Math.max(0.05, rad));
  // (brighter in the kicking window; fading once it has passed)
  const near = Math.abs(fl.t1 - now) < 0.12 ? 1 : 0;
  const after = now > fl.t1 ? Math.max(0, 1 - (now - fl.t1) / 0.25) : 1;
  r.landMat.color.copy(SOFT);
  r.timeMat.color.copy(near ? GOLD_HI : GOLD);
  r.landMat.opacity = 0.55 * into * after;
  r.timeMat.opacity = (0.65 + 0.3 * near) * into * after;
}
