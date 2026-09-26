import { Vector3, type PerspectiveCamera } from 'three';
import type { AngkorExplorer } from '../../character/AngkorExplorer';
import { REST_U, restDuration, restPose, type RestState } from '../../character/rest';
import { t } from '../ui/lang';
import { angleDiff } from './followCam';
import type { FollowCam, RoamBody, RoamCtx, RoamHud } from './types';
import { stepSound } from './walker';

/** What he does on the ground: sit (J) or lie down (L). */
export type RestKind = 'sit' | 'lie';

/** Lying still this long (s) he falls asleep; his breath slows and his eyes close over `DOZE` (s). */
const SLEEP_AFTER = 12;
const DOZE = 2.5;
/** The stick past this (or Space, E): he gets up. */
const STICK = 0.3;
/** Past this far along the way down (`RestState.u`) his hat comes off to lie back (its brim is wide), and back on coming up. */
const HAT_OFF = 1.25;
/** He sets down with a soft sound when the seat lands and when his back does (`u`), this loud. */
const THUD = { seat: 0.85, back: 1.8, gain: 0.35 };
/**
 * Where he may rest: the ground under him and round him (m, at his roaming
 * size: sitting he takes about 1 m behind his feet and his pack beside him
 * on his right, lying nearly 2 m) no more than `FLAT` up or down from his
 * feet, with room above it; no water.
 */
const FLAT = 0.35;
const ROOM = 0.9;
/**
 * No room the way he faces (a step, a wall, the edge of a path): he turns to
 * the nearest way with room (radians from where he faces), over the way down
 * at this rate (1/s).
 */
const TURNS = [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, Math.PI];
const TURN_RATE = 8;
const AREA: Record<RestKind, { x: readonly number[]; z: readonly number[] }> = {
  sit: { x: [-0.9, -0.45, 0, 0.45], z: [0.25, -0.3, -0.8, -1.05] },
  lie: { x: [-0.9, -0.45, 0, 0.45], z: [0.25, -0.3, -0.9, -1.4, -1.85] },
};
/**
 * The camera while he rests, watching the sky: it comes down low at his
 * left side, a little behind him (his face shows in profile, looking up;
 * his pack is on his right), and looks up past him: he is small in the
 * lower right of the view (clear of the tool bar and the key help), the
 * sky fills the rest. It eases there over the first `FRAME_FOR` s (then the
 * player may look round; a drag looks up further, to `LOOK_UP`), and back
 * to where it was when he gets up. It looks at a point `lift` over his feet
 * (m, at his roaming size: the camera then stands about 1 m up, over the
 * ground rule's 0.9 m, and about 7 m off, so he is about a fifth of the view
 * high) over his middle (`back` behind his feet, m, sitting and lying) and
 * `left` of him as the camera sees it (m); `side` turns it round him (radians,
 * − to his left).
 */
const SKY = { pitch: -0.21, distance: 7.6, lift: 2.6, side: -1.0, left: 2.6, back: { sit: 0.45, lie: 0.8 }, rate: 1.6, out: 2.2 };
const FRAME_FOR = 3;
const LOOK_UP = -1.1;

export interface Rest {
  /** Down on the ground, or on the way down or up (the rest's posture holds him). */
  readonly active: boolean;
  /** What he is doing, for bug reports and the key help: sitting, lying, asleep (null: up, or getting up). */
  readonly state: RestKind | 'sleep' | null;
  /** The rest has his hat off (lying: it goes back on as he gets up). */
  readonly hatOff: boolean;
  /**
   * J (`sit`) or L (`lie`): down on the ground where he stands (a short
   * message where he can't); the same key again gets him up, the other one
   * lies him back or sits him up.
   */
  toggle(kind: RestKind, ctx: RoamCtx): void;
  /**
   * Down without looking at the ground (URL `act=sit|lie|sleep`: asleep as
   * soon as he lies). `keepView`: the camera stays as it is (a bug report's
   * `rcam=`), not brought down to the sky.
   */
  start(kind: RestKind | 'sleep', keepView?: boolean): void;
  /** Get up: `soft` the way up (the stick, a key); else at once (a new mode). */
  stop(soft?: boolean): void;
  /**
   * On foot, before the walker's step: asleep, any key or the stick wakes
   * him (and does nothing else); awake, the stick, Space or E gets him up.
   * He keeps still meanwhile (the camera still turns). True when it took
   * the input.
   */
  input(ctx: RoamCtx): boolean;
  /** On foot, after the walker's step: the way down or up, the hat, sleep, the camera, the key help. `free`: no camera or phone up, no album open (else he stays awake). */
  step(ctx: RoamCtx, dt: number, free: boolean): void;
  /** Every frame, after the follow camera: the "Z z z" over his head while he sleeps. */
  frame(camera: PerspectiveCamera, photoView: number): void;
  /** The player put the hat on or off while he rests (H): it stays as they left it. */
  hatChosen(): void;
}

export interface RestDeps {
  explorer: AngkorExplorer;
  body: RoamBody;
  cam: FollowCam;
  hud: RoamHud;
  canvas: HTMLCanvasElement;
  /** After the hat changes (photo.ts `refreshBody`, as the H key). */
  refreshBody(): void;
}

const _v = new Vector3();

/**
 * Resting on the ground while roaming, watching the sky: J sits him down
 * where he stands (upright, his hands resting on his legs), L lies him on his
 * back (hands behind his head); the poses, the way down and up and the
 * pack he puts down beside him are character/rest.ts, a posture over the
 * walk. The follow camera comes down low behind him and looks up, so the
 * sky fills the view (clouds by day, stars and the moon at night). Lying
 * still for a while he falls asleep: his eyes close, he breathes slowly and
 * a small "Z z z" rises from his head; any key wakes him. J / L again, the
 * stick, Space or E gets him up; the camera and the phone work from the
 * ground (the lantern, torch and flashlight wait: a light key gets him up).
 * Not in water, on stairs or steep ground, or where a wall is in the way.
 */
export function createRest(d: RestDeps): Rest {
  const { explorer, body, cam, hud } = d;
  /** Where he is along the way (0 up, 1 sitting, 2 lying), and the move under way. */
  let u = 0;
  let from = 0;
  let to = 0;
  let k = 1;
  let len = 0;
  /** Lying still (s), how asleep (0‥1, eased), asleep or not. */
  let still = 0;
  let sleep = 0;
  let asleep = false;
  let hatTaken = false;
  /** The player's camera before the rest (to go back to), and how long it has been framed for it (s). */
  let before: { pitch: number; distance: number; pitchMin: number } | null = null;
  let framed = 0;
  let prompt: string | null = null;
  /** The way he turns to as he sits down (room there), or null. */
  let turnTo: number | null = null;
  const state: RestState = { u: 0, sleep: 0, t: 0, pack: 'none', knife: true };
  const posture = (time: number) => {
    state.t = time;
    return restPose(state);
  };
  const zzz = createSnore(hud.layer ?? document.body);

  const active = () => u > 0 || to > 0;

  /** Go from where he is to `target` along the way (0 up, 1 sitting, 2 lying). */
  function go(target: number): void {
    if (target === to && k < 1) return;
    from = u;
    to = target;
    k = 0;
    len = Math.max(0.2, restDuration(from, to));
    if (target > 0) {
      // (down from standing: the camera comes down to the sky again)
      if (from === 0) framed = 0;
      explorer.animator.posture = posture;
      explorer.animator.postureFeet = false;
      body.vel.x = body.vel.z = 0;
    }
    still = 0;
    wake();
  }

  function wake(): void {
    asleep = false;
    still = 0;
  }

  function setHat(on: boolean): void {
    if (explorer.currentOutfit.hat === on) return;
    explorer.setOutfit({ hat: on });
    d.refreshBody();
  }

  /** Up again: the posture off (the Animator eases back to the walk), the hat back on. */
  function done(): void {
    u = from = to = 0;
    k = 1;
    turnTo = null;
    // (standing, while the Animator eases out of the posture: no lying on the ledge after Esc)
    state.u = state.sleep = 0;
    explorer.animator.posture = null;
    explorer.animator.postureFeet = true;
    explorer.asleep = false;
    sleep = 0;
    wake();
    if (hatTaken) {
      hatTaken = false;
      setHat(true);
    }
    setPrompt(null);
  }

  function setPrompt(text: string | null): void {
    if (text === prompt) return;
    prompt = text;
    hud.prompt(text);
  }

  /** Can he sit or lie down here: dry, fairly flat ground round him, with room. The reason he can't, or null. */
  function refusal(kind: RestKind, ctx: RoamCtx, yaw: number): string | null {
    const w = ctx.world;
    const p = body.pos;
    const water = (x: number, z: number) => (w.waterAt(x, z) ?? -Infinity) > p.y - 0.05;
    if (water(p.x, p.z)) return t('rRestWater');
    const s = body.scale / 1.4;
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const a = AREA[kind];
    for (const lx of a.x)
      for (const lz of a.z) {
        // (his space: +z the way he faces, +x his left)
        const x = p.x + (lx * c + lz * sn) * s;
        const z = p.z + (-lx * sn + lz * c) * s;
        const g = w.standAt ? w.standAt(x, z, p.y, FLAT, ROOM * s) : w.groundAt(x, z);
        if (Number.isNaN(g) || g > p.y + FLAT) return t('rRestRoom');
        if (g < p.y - FLAT) return t('rRestSteep');
        if (water(x, z)) return t('rRestWater');
      }
    return null;
  }

  /** The camera low behind him looking up at the sky (see `SKY`), and back after. */
  function frame(dt: number): void {
    const down = to > 0;
    if (down) {
      before ??= { pitch: cam.pitch, distance: cam.distance, pitchMin: cam.pitchMin };
      cam.pitchMin = LOOK_UP;
      framed += dt;
      if (framed <= FRAME_FOR) {
        const e = 1 - Math.exp(-SKY.rate * dt);
        cam.yaw += angleDiff(body.yaw + SKY.side, cam.yaw) * e;
        cam.pitch += (SKY.pitch - cam.pitch) * e;
        cam.distance += (SKY.distance * (body.scale / 1.4) - cam.distance) * e;
      }
    } else if (before) {
      // (getting up: back to the player's own view)
      const e = 1 - Math.exp(-SKY.out * dt);
      cam.pitch += (before.pitch - cam.pitch) * e;
      cam.distance += (before.distance - cam.distance) * e;
      if (u === 0 && Math.abs(before.pitch - cam.pitch) < 0.005 && Math.abs(before.distance - cam.distance) < 0.05) {
        cam.pitchMin = before.pitchMin;
        before = null;
      }
    }
    // It looks at a point over his middle (the walker looks at his chest): up there as he goes down.
    const w = Math.min(1, u);
    if (w <= 0) return;
    const s = body.scale / 1.4;
    const back = (SKY.back.sit + (SKY.back.lie - SKY.back.sit) * Math.max(0, Math.min(1, u - 1))) * s;
    const f = cam.focus;
    // (the camera's left: −its right, which is (−cos yaw, 0, sin yaw))
    const lx = Math.cos(cam.yaw) * SKY.left * s;
    const lz = -Math.sin(cam.yaw) * SKY.left * s;
    f.x += (body.pos.x - Math.sin(body.yaw) * back + lx - f.x) * w;
    f.z += (body.pos.z - Math.cos(body.yaw) * back + lz - f.z) * w;
    f.y += (body.pos.y + SKY.lift * s - f.y) * w;
    cam.behindYaw = body.yaw + SKY.side;
  }

  const api: Rest = {
    get active() {
      return active();
    },
    get state() {
      if (to === 0) return null;
      return asleep ? 'sleep' : to === REST_U.sit ? 'sit' : 'lie';
    },
    get hatOff() {
      return hatTaken;
    },
    toggle(kind, ctx) {
      const want = kind === 'sit' ? REST_U.sit : REST_U.lie;
      if (to === want) {
        // (the same key again: up)
        go(REST_U.stand);
        return;
      }
      if (to > 0) {
        // (sitting: lie back; lying: sit up)
        go(want);
        hud.toast(t(kind === 'sit' ? 'rSitting' : 'rLying'));
        return;
      }
      if (u > 0) {
        // (still getting up: down again from there)
        go(want);
        return;
      }
      if (!body.grounded) return;
      const no = refusal(kind, ctx, body.yaw);
      const turn = no ? TURNS.find((a) => !refusal(kind, ctx, body.yaw + a)) : 0;
      if (turn === undefined) {
        hud.toast(no!);
        return;
      }
      turnTo = turn ? body.yaw + turn : null;
      go(want);
      hud.toast(t(kind === 'sit' ? 'rSitting' : 'rLying'));
    },
    start(kind, keepView = false) {
      go(kind === 'sit' ? REST_U.sit : REST_U.lie);
      if (keepView) framed = Infinity;
      // (asleep as soon as he is down)
      if (kind === 'sleep') still = SLEEP_AFTER;
    },
    stop(soft = false) {
      if (!active()) return;
      if (soft) go(REST_U.stand);
      else {
        done();
        if (before) cam.pitchMin = before.pitchMin;
        before = null;
        zzz.show(false);
      }
    },
    input(ctx) {
      if (!active()) return false;
      const i = ctx.input;
      const any = (i.taps?.size ?? 0) > 0 || i.jump || i.use || i.click || Math.hypot(i.move.x, i.move.y) > STICK;
      if (asleep && any) {
        // (any key: he wakes, and nothing else)
        wake();
        hud.toast(t('rAwake'));
        i.move.x = i.move.y = 0;
        i.run = i.jump = i.jumpHeld = i.use = false;
        i.click = false;
        return true;
      }
      if (to > 0 && (i.jump || i.use || Math.hypot(i.move.x, i.move.y) > STICK)) go(REST_U.stand);
      if (any) still = 0;
      // (he keeps still on the ground and while getting up; the view still turns)
      i.move.x = i.move.y = 0;
      i.run = i.jump = i.jumpHeld = i.use = false;
      return false;
    },
    step(ctx, dt, free) {
      if (!active()) {
        frame(dt);
        return;
      }
      const u0 = u;
      if (k < 1) {
        k = Math.min(1, k + dt / len);
        u = from + (to - from) * k * k * (3 - 2 * k);
      } else u = to;
      if (turnTo !== null) {
        const dy = angleDiff(turnTo, body.yaw);
        body.yaw += dy * Math.min(1, dt * TURN_RATE);
        if (Math.abs(dy) < 0.01) turnTo = null;
      }
      if (u <= 0 && to === 0) {
        done();
        frame(dt);
        return;
      }
      // A soft sound as he sets down (the seat, then his back).
      const p = body.pos;
      for (const at of [THUD.seat, THUD.back]) if (u0 < at && u >= at) ctx.sound(stepSound(ctx.world, p.x, p.y, p.z), THUD.gain);
      // His hat off to lie back (the brim), on again coming up; as the player left it if they chose (H).
      if (u > HAT_OFF && explorer.currentOutfit.hat) {
        hatTaken = true;
        setHat(false);
      } else if (u < HAT_OFF && hatTaken) {
        hatTaken = false;
        setHat(true);
      }
      // Asleep after lying still a while; the eyes close early in the doze.
      if (u >= REST_U.lie && to === REST_U.lie && free) {
        still += dt;
        if (!asleep && still >= SLEEP_AFTER) {
          asleep = true;
          hud.toast(t('rAsleep'));
        }
      } else if (asleep || !free) wake();
      sleep = Math.max(0, Math.min(1, sleep + (asleep ? dt : -3 * dt) / DOZE));
      explorer.asleep = asleep && sleep > 0.2;
      const o = explorer.currentOutfit;
      state.u = u;
      state.sleep = sleep;
      state.pack = o.pack;
      state.knife = o.legs === 'shorts';
      body.vel.x = body.vel.z = 0;
      frame(dt);
      // The keys to get up (not asleep: the "Z z z" says it; not while a photo is up).
      setPrompt(to === 0 || asleep ? null : to === REST_U.sit ? `J  ${t('rGetUp')}  ·  L  ${t('rLieBack')}` : `L  ${t('rGetUp')}  ·  J  ${t('rSitUp')}`);
    },
    frame(camera, photoView) {
      const on = asleep && sleep > 0.5 && photoView < 0.3;
      zzz.show(on);
      if (!on) return;
      // Over his head (a little above the top of his hair), on the screen.
      explorer.rig.joints.head.getWorldPosition(_v);
      _v.y += 0.5 * body.scale;
      _v.project(camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1.2 || Math.abs(_v.y) > 1.2) {
        zzz.show(false);
        return;
      }
      const r = d.canvas.getBoundingClientRect();
      zzz.place(r.left + ((_v.x + 1) / 2) * r.width, r.top + ((1 - _v.y) / 2) * r.height);
    },
    hatChosen() {
      hatTaken = false;
    },
  };
  return api;
}

// ── Z z z ──────────────────────────────────────────────────────────────────

/** A pixel "Z" (5 × 5). */
const Z = `<svg viewBox="0 0 5 5" aria-hidden="true" shape-rendering="crispEdges"><path d="M0 0h5v1H0zM3 1h1v1H3zM2 2h1v1H2zM1 3h1v1H1zM0 4h5v1H0z"/></svg>`;

/** Three small pixel Z's rising from his head one after another, growing and fading (a DOM overlay: no draw calls). */
function createSnore(layer: HTMLElement): { show(on: boolean): void; place(x: number, y: number): void } {
  injectStyle();
  const el = document.createElement('div');
  el.className = 'rr-zzz';
  el.innerHTML = Z + Z + Z;
  layer.append(el);
  let shown = false;
  return {
    show(on) {
      if (on === shown) return;
      shown = on;
      el.classList.toggle('is-on', on);
    },
    place(x, y) {
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    },
  };
}

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    .rr-zzz { position: absolute; left: 0; top: 0; width: 0; height: 0; opacity: 0; visibility: hidden; transition: opacity 0.8s, visibility 0s 0.8s; }
    .rr-zzz.is-on { opacity: 1; visibility: visible; transition: opacity 1.2s, visibility 0s; }
    .rr-zzz svg { position: absolute; left: calc(2 * var(--px, 1px)); bottom: 0; width: calc(11 * var(--px, 1px)); height: calc(11 * var(--px, 1px));
      fill: #f6efe2; filter: drop-shadow(0 0 calc(1 * var(--px, 1px)) rgba(20, 16, 30, 0.9)) drop-shadow(0 calc(1 * var(--px, 1px)) 0 rgba(20, 16, 30, 0.6));
      opacity: 0; animation: rr-z 3.6s linear infinite; }
    .rr-zzz svg:nth-child(2) { animation-delay: -1.2s; }
    .rr-zzz svg:nth-child(3) { animation-delay: -2.4s; }
    /* (still, as in shots: animations off) */
    .mu-shot .rr-zzz svg:nth-child(1) { transform: translate(calc(4 * var(--px, 1px)), calc(-8 * var(--px, 1px))) scale(0.85); opacity: 0.95; }
    .mu-shot .rr-zzz svg:nth-child(2) { transform: translate(calc(11 * var(--px, 1px)), calc(-24 * var(--px, 1px))) scale(1.15); opacity: 0.85; }
    .mu-shot .rr-zzz svg:nth-child(3) { transform: translate(calc(17 * var(--px, 1px)), calc(-42 * var(--px, 1px))) scale(1.45); opacity: 0.6; }
    @keyframes rr-z {
      0% { transform: translate(0, 0) scale(0.7); opacity: 0; }
      15% { opacity: 0.95; }
      50% { transform: translate(calc(12 * var(--px, 1px)), calc(-24 * var(--px, 1px))) scale(1.2); }
      75% { opacity: 0.75; }
      100% { transform: translate(calc(18 * var(--px, 1px)), calc(-50 * var(--px, 1px))) scale(1.6); opacity: 0; }
    }
    /* (the camera or the phone up: only the viewfinder) */
    body.roam-photo .rr-zzz { display: none; }`;
  document.head.append(style);
}
