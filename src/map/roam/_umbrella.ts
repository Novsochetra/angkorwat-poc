import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3, type Mesh, type Object3D } from 'three';
import { FOOD_GRIPS } from '../../character/parts/food';
import type { JointName } from '../../character/skeleton';
import { buildUmbrella, isUmbrellaColor, UMB, umbrellaArm, type UmbrellaColor, type UmbrellaModel } from '../../character/umbrella';
import { hash3 } from '../../voxel/random';
import { BODY_UNIT_M } from '../../world/scale';
import { SFX } from '../audio/addonSfx';
import '../audio/_umbrella';
import { pad } from '../pad/pad';
import { SKY } from '../sky/palette';
import type { MapFrame, RoamMode } from '../types';
import { num, t } from '../ui/lang';
import { ADDONS, MENU_HOOKS, registerAddon, type AddonEnv, type AddonTap, type RoamAddon } from './_addons';
import { shrine } from './_pray';
import type { RoamCtx } from './types';

/**
 * The umbrella (ឆ័ត្រ): a plain rain umbrella of the markets (character/umbrella.ts).
 *
 * On foot in rain (or the dream's snow) he opens it by himself, in his right
 * hand (the lantern, the torch, the flashlight are his left hand's); his
 * left when the right holds something to eat or drink; folded away when both
 * are full. 8 opens or closes it any time — a sun umbrella is just as
 * Cambodian — and that choice holds for the visit (closed with 8 in rain, it
 * stays closed until 8 again; open in the sun, it stays open).
 *
 * It folds away (and comes back after) for the boat, the hang glider, the
 * parachute and the balloon (at once: their poses take him), praying (from E
 * at the shrine to standing up again), sitting and lying on the ground (the
 * rest watches the sky; he sits down with both hands), an action of his arms
 * (a greeting, a wave, a cheer…, quickly), the camera or the phone up, an
 * add-on holding him or his hands, and under a roof or where there is no
 * room for it (a low ceiling, a doorway, a take-off ramp under its glider;
 * it leans away from a wall beside it). His wide palm-leaf hat comes off while it is up (the hat's brim is
 * wider than the arm can hold the shaft out), and goes back on once it is
 * put away for good (dry again, or 8) or as he sits down — not for a moment's
 * fold; H puts the hat on instead (the umbrella folds: the player's choice).
 *
 * While it is open: it keeps the rain off him (nothing wet is drawn on him,
 * so there is nothing to stop), a few drops gather at the rib tips and drip
 * (one draw of a few small streaks, in rain), the rain on the cloth patters
 * over his head (audio/_umbrella.ts `umbPatter`, levelled with the rain), the
 * wind leans it downwind and rocks it in gusts, it bobs with his walk and
 * leans forward as he runs.
 *
 * URL (checks): `umbrella=1` open (the player's choice), `umbrella=0` closed,
 * `umbrella=auto` (the default: in rain or snow) · `umbhand=L|R` the hand ·
 * `umbspread=0‥1` the canopy held that far open · `umbcolor=blue|black|green`.
 * A shot starts it as it would be (no opening on the way). `window.__umbrella`
 * is its state (dev builds and shots).
 */

type Choice = 'auto' | 'open' | 'closed';
type Hand = 'L' | 'R';

/** Rain (or snow) that makes him open it, and less that makes him close it again (as the people's umbrellas: events.ts `umbrellas`). */
const RAIN_UP = 0.27;
const RAIN_DOWN = 0.21;
const SNOW_UP = 0.18;
const SNOW_DOWN = 0.1;
/** Seconds of rain before he opens it, of dry weather before he closes it. */
const OPEN_AFTER = 0.6;
const CLOSE_AFTER = 2.5;
/** Seconds: the arm up with it furled, the pop open, the fold, the arm down (quick: for the camera, a greeting, no room). */
const RISE = 0.3;
const OPEN = 0.32;
const FOLD = 0.4;
const LOWER = 0.3;
const FOLD_QUICK = 0.18;
const LOWER_QUICK = 0.16;
/** A roof this close over his head is shelter (m); under one this long it folds, out from it this long it opens (s). */
const ROOF = 12;
const COVER_AFTER = 0.35;
const CLEAR_AFTER = 0.7;
/** Where the canopy is over his feet, standing (m at his true size): its top, its rim, how far out its rim goes. */
const FIST_Y = 12.2 + 5.0;
const TOP_H = (FIST_Y + UMB.shaft + 1.8) * BODY_UNIT_M;
const RIM_H = (FIST_Y + UMB.shaft - UMB.height) * BODY_UNIT_M;
const RIM_R = (UMB.radius + 1) * BODY_UNIT_M;
/** Leans (radians): in toward his head, back a little; forward walking and running; downwind; away from a wall. */
const LEAN_IN = 0.04;
const LEAN_BACK = 0.05;
const LEAN_WALK = 0.04;
const LEAN_RUN = 0.24;
const LEAN_WIND = 0.15;
const LEAN_GUST = 0.07;
const LEAN_WALL = 0.3;
/** True-size speeds (m/s) between which a walk becomes a run (the walker's pace: walk ≈ 3, run ≈ 7.4). */
const RUN_FROM = 3.3;
const RUN_AT = 6.6;
/** Drips: how many at most (one draw), and how fast they fall (m/s²). */
const DRIPS = 14;
const GRAVITY = 9.8;

const _v = new Vector3();
const _w = new Vector3();
const _up = new Vector3();
const _fw = new Vector3();
const _x = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _m = new Matrix4();
const _s = new Vector3();
const _c = new Color();
/** Eight directions round him (unit x, z). */
const RING = Array.from({ length: 8 }, (_, i) => [Math.sin((i * Math.PI) / 4), Math.cos((i * Math.PI) / 4)] as const);

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => {
  const k = clamp01(v);
  return k * k * (3 - 2 * k);
};
/** The pop open: a little past open, and back. */
const popOpen = (p: number) => {
  const k = clamp01(p) - 1;
  return 1 + 2.4 * k * k * k + 1.4 * k * k;
};

// ── State (for the visit: the player's choice outlives going back to the map) ──
let env: AddonEnv | null = null;
let model: UmbrellaModel | null = null;
let color: UmbrellaColor = 'blue';
let choice: Choice = 'auto';
let mode: RoamMode = 'overview';
/** The hand it is in (null: put away), how far it is up (0‥1: the arm, and it in the fist), how far open (0‥1). */
let hand: Hand | null = null;
let held = 0;
let spread = 0;
/** Opening (+1), folding (−1), or neither (0): which way the canopy went last (the sounds, the ease). */
let going = 0;
/** Rain or snow enough now (with its margin), for how long, and whether he wants it up for it. */
let wet = false;
let wetFor = 0;
let dryFor = 0;
let auto = false;
/** Under a roof or with no room for it now, how long, and whether it is folded for that. */
let cover = false;
let tight = false;
let coverFor = 0;
let clearFor = 0;
let sheltered = false;
/** Away from a wall beside it (unit x, z, world; 0 none). */
const push = { x: 0, z: 0 };
/** It took his hat off (it goes back on once it is put away). */
let hatTaken = false;
/** The first time it opened by itself this visit (a toast says why, and what 8 does), and the rain that came now asks for it. */
let told = false;
let tell = false;
/** The next step puts it where it should be at once (a shot, a saved view). */
let snap = false;
/** Checks: the hand, the canopy's spread held. */
let forcedHand: Hand | null = null;
let spreadHold: number | null = null;
/** The look of it, eased (radians of lean, world x and z), and how much of a run it is. */
const lean = { x: 0, z: 0 };
let run = 0;
let rain = 0;
/** Folded for a quick reason (the camera, an action, no room): faster. */
let quick = false;
/** A headless still (not a video's frames): no easing, it is where it would be. */
let still = false;

// ── The drips ────────────────────────────────────────────────────────────────
let drips: InstancedMesh | null = null;
const dripN = new Float64Array(DRIPS).fill(Number.NaN);
const dripOn = new Uint8Array(DRIPS);
const dripAt = new Float32Array(DRIPS * 5);

/** A few small streaks falling from the rib tips (one draw). */
function makeDrips(e: AddonEnv): InstancedMesh {
  const mat = new MeshBasicMaterial({ color: 0xcfd8e2, transparent: true, opacity: 0.55, depthWrite: false });
  mat.name = 'umbrella drips';
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), mat, DRIPS);
  mesh.name = 'roam:umbrella drips';
  mesh.frustumCulled = false;
  mesh.renderOrder = 21;
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.raycast = () => {};
  _m.makeScale(0, 0, 0);
  for (let i = 0; i < DRIPS; i++) mesh.setMatrixAt(i, _m);
  mesh.visible = false;
  e.scene.add(mesh);
  return mesh;
}

function hideDrips(): void {
  if (drips) drips.visible = false;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const intent = (): boolean => choice === 'open' || (choice === 'auto' && auto);

/** The umbrella is his choice now (8 opened it, or it is up for the rain; also while it waits out a prayer): the explorer menu lights its button. */
export const umbrellaUp = (): boolean => mode === 'walk' && intent();
// (the explorer menu's umbrella button reads it without loading this module: _addons.ts MENU_HOOKS)
MENU_HOOKS.umbrellaUp = umbrellaUp;

/** The model, built the first time it is wanted. */
function theModel(e: AddonEnv): UmbrellaModel {
  if (model) return model;
  model = buildUmbrella(color, e.explorer.rig.quality);
  model.root.traverse((o) => {
    if ((o as Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });
  return model;
}

function setHat(e: AddonEnv, on: boolean): void {
  if (e.explorer.currentOutfit.hat === on) return;
  e.explorer.setOutfit({ hat: on });
  e.photo.refreshBody();
}

/** Off his hand at once (a new mode: its pose takes him). */
function putAway(): void {
  if (env && hand) env.explorer.rig.clearSlot('umbrella');
  hand = null;
  held = spread = 0;
  going = 0;
  hideDrips();
  SFX.level('umbPatter', 0);
}

/** Into `h` (its fist), furled, the arm about to come up. */
function takeUp(e: AddonEnv, h: Hand): void {
  const m = theModel(e);
  hand = h;
  held = spread = 0;
  going = 0;
  e.explorer.rig.setSlotObject('umbrella', ARM_JOINTS[h][3], m.root);
}

/** Which hand is free for it: the right, unless it holds something to eat; then the left, unless that is full too. */
function freeHand(e: AddonEnv): Hand | null {
  if (forcedHand) return forcedHand;
  const ex = e.explorer;
  const food = ex.foodHeld;
  const g = food ? FOOD_GRIPS[food] : null;
  const right = !!g?.right;
  // (a light in the left hand: not while the umbrella is in it, the tools keep the light away then: `handsBusy`)
  const left = !!(g?.left || g?.both) || (ex.currentOutfit.held !== 'none' && hand !== 'L');
  return !right ? 'R' : !left ? 'L' : null;
}

/** His chest leans back from upright (lying down, or on the way down to it). */
function reclined(e: AddonEnv): boolean {
  e.explorer.rig.joints.chest.getWorldQuaternion(_q);
  return _w.set(0, 1, 0).applyQuaternion(_q).y < 0.8;
}

/** Another add-on has him or his hands (a ride, the binoculars…). */
function others(): boolean {
  for (const a of ADDONS) if (a !== addon && (a.holding || a.handsBusy)) return true;
  return false;
}

/** The arm's joints for each hand: shoulder, elbow, wrist, and the fist's prop joint. */
const ARM_JOINTS: Record<Hand, readonly [JointName, JointName, JointName, JointName]> = {
  R: ['shoulderR', 'elbowR', 'wristR', 'propR'],
  L: ['shoulderL', 'elbowL', 'wristL', 'propL'],
};

/** Ease a joint from the Animator's pose toward the umbrella's (Euler XYZ), and its place back to rest (no shrug), by `w`. */
function blend(g: Object3D, rest: Vector3, x: number, y: number, z: number, w: number): void {
  const r = g.rotation;
  r.set(r.x + (x - r.x) * w, r.y + (y - r.y) * w, r.z + (z - r.z) * w);
  g.position.lerp(rest, w);
}

/**
 * Under a roof (shelter: it folds) or with no room for it (a low ceiling, a
 * doorway: walls on both sides of it; a take-off ramp, under its glider's
 * wing); a wall on one side: `push` leans it away.
 */
function shelter(ctx: RoamCtx): void {
  const { world, body } = ctx;
  const p = body.pos;
  const s = body.scale;
  cover = tight = false;
  push.x = push.z = 0;
  // (on a take-off ramp the parked hang glider's wing is over him: he is about to fly)
  if (world.launchNear?.(p.x, p.z, p.y)) {
    tight = true;
    return;
  }
  if (!world.ceilingAt) return;
  const top = p.y + TOP_H * s;
  let roofs = 0;
  for (let i = -1; i < 4; i++) {
    const x = i < 0 ? p.x : p.x + RING[i * 2][0] * RIM_R * s * 0.8;
    const z = i < 0 ? p.z : p.z + RING[i * 2][1] * RIM_R * s * 0.8;
    const c = world.ceilingAt(x, z, p.y + 0.3 * s);
    if (c < top + 0.1) tight = true;
    if (c < p.y + ROOF) roofs++;
  }
  cover = roofs === 5;
  if (!world.clearance) return;
  // Walls at the canopy's height round him: lean away from one; walls across from each other: no room.
  const y = p.y + RIM_H * s;
  let n = 0;
  for (let i = 0; i < 8; i++) {
    const [dx, dz] = RING[i];
    if (world.clearance(p.x, y, p.z, p.x + dx * RIM_R * s, y, p.z + dz * RIM_R * s) >= 0.98) continue;
    n++;
    push.x -= dx;
    push.z -= dz;
    // (blocked across: the one four round from it too)
    const [ox, oz] = RING[(i + 4) % 8];
    if (world.clearance(p.x, y, p.z, p.x + ox * RIM_R * s, y, p.z + oz * RIM_R * s) < 0.98) tight = true;
  }
  if (n >= 5) tight = true;
  const l = Math.hypot(push.x, push.z);
  if (l > 1e-4) {
    push.x /= l;
    push.z /= l;
  } else push.x = push.z = 0;
}

/** What the 8 key does now: the other of what it would be. */
function toggle(e: AddonEnv, m: RoamMode): void {
  if (m === 'boat') return e.hud.toast(t('rHandsPaddle'));
  if (m === 'hang') return e.hud.toast(t('rHandsBar'));
  if (m === 'balloon') return e.hud.toast(t('rHandsBurner'));
  if (m !== 'walk') return;
  const on = !intent();
  choice = on ? 'open' : 'closed';
  // (he knows the key now)
  told = true;
  e.hud.toast(t(on ? 'umbUp' : 'umbDown'));
}

// ── The add-on ───────────────────────────────────────────────────────────────

const addon: RoamAddon = {
  id: 'umbrella',

  init(e) {
    env = e;
    still = e.shot && e.params.get('video') !== '1';
    if (import.meta.env.DEV || e.shot)
      Object.assign(window, {
        __umbrella: {
          get state() {
            return { choice, hand, held, spread, auto, wet, cover, tight, sheltered, hatTaken, color, lean: { ...lean }, push: { ...push }, run };
          },
        },
      });
  },

  get handsBusy() {
    // (in his left hand: the light stays put away)
    return hand === 'L';
  },

  input(_ctx, m, tap: AddonTap) {
    const e = env;
    if (!e) return false;
    if (tap('Digit8', 'Numpad8')) toggle(e, m);
    // H: the hat. With the umbrella up it would go on under it: the umbrella folds away instead (the player chose the hat).
    if (tap('KeyH') && m === 'walk') {
      const willWear = !e.explorer.currentOutfit.hat;
      // (also while it waits, folded a moment: else it would take the hat off again as it comes back)
      if (willWear && (hand || intent())) {
        putAway();
        choice = 'closed';
      }
      hatTaken = false;
    }
    return false;
  },

  after(ctx, m, dt) {
    const e = env;
    mode = m;
    if (!e) return;
    const ex = e.explorer;
    if (m !== 'walk') {
      if (hand) putAway();
      return;
    }
    // The weather: enough rain or snow (with a margin), for a moment.
    const w = ctx.weather;
    rain = w?.rain ?? 0;
    const snow = w?.snow ?? 0;
    wet = wet ? rain > RAIN_DOWN || snow > SNOW_DOWN : rain > RAIN_UP || snow > SNOW_UP;
    wetFor = wet ? wetFor + dt : 0;
    dryFor = wet ? 0 : dryFor + dt;
    if (snap) auto = wet;
    else if (wet && wetFor >= OPEN_AFTER && !auto) {
      auto = true;
      // (the rain came: the first time this visit he opens it for it, a toast says so)
      tell = !told && choice === 'auto';
    } else if (!wet && dryFor >= CLOSE_AFTER) auto = tell = false;
    const want = intent();
    // A roof over him, no room for it (only looked at while it is wanted).
    if (want || hand) shelter(ctx);
    else cover = tight = false;
    if (cover || tight) {
      coverFor += dt;
      clearFor = 0;
    } else {
      clearFor += dt;
      coverFor = 0;
    }
    if (snap) sheltered = cover || tight;
    else if (!sheltered && (tight || coverFor >= COVER_AFTER)) sheltered = true;
    else if (sheltered && clearFor >= CLEAR_AFTER) sheltered = false;
    // What has him or his hands now.
    const act = ex.currentAction;
    const meal = act === 'eat' || act === 'bite' || act === 'drink';
    const praying = act === 'pray' || shrine.busy();
    quick = !!e.photo.kind || (!!act && !meal && act !== 'pray') || others() || tight;
    const away = quick || praying || !!ex.animator.posture || sheltered;
    const target = want && !away ? freeHand(e) : null;

    if (snap) {
      snap = false;
      if (hand !== target) {
        putAway();
        if (target) takeUp(e, target);
      }
      held = spread = target ? 1 : 0;
      going = 0;
    } else {
      if (hand && hand !== target) {
        // Away: it folds, the arm comes down as it closes, then it is gone.
        if (spread > 0) {
          if (going !== -1 && spread > 0.5 && !e.shot) SFX.play('umbClose', 1);
          going = -1;
          spread = Math.max(0, spread - dt / (quick ? FOLD_QUICK : FOLD));
        }
        if (spread < 0.45) held = Math.max(0, held - dt / (quick ? LOWER_QUICK : LOWER));
        if (held <= 0 && spread <= 0) {
          ex.rig.clearSlot('umbrella');
          hand = null;
          going = 0;
        }
      }
      if (!hand && target) {
        takeUp(e, target);
        // (opened by the rain the first time this visit: say so, and what 8 does)
        if (tell && choice === 'auto' && !told && !e.shot) {
          told = true;
          tell = false;
          const keys = !pad.active && !document.body.classList.contains('roam-touch');
          const why = t(rain > RAIN_DOWN ? 'umbRain' : 'umbSnow');
          e.hud.toast(keys ? `${why}  ·  ${t('umbHint', { key: num(8) })}` : why);
        }
      }
      if (hand && hand === target) {
        held = Math.min(1, held + dt / RISE);
        if (held > 0.65 && spread < 1) {
          if (going !== 1 && spread < 0.5 && !e.shot) SFX.play('umbOpen', 1);
          going = 1;
          spread = Math.min(1, spread + dt / OPEN);
        }
      }
    }
    // His hat: off while it is up (its brim is in the way). Back on once it is put away for good (dry again, or 8),
    // or as he sits down; not for a moment's fold (a greeting, the camera, an eave, under a roof), so it does not
    // flick on and off. Never while he prays (the prayer takes it off once, at its time) or lies back (the rest has
    // it off then: its brim).
    const lying = !!ex.animator.posture && reclined(e);
    if (hand && ex.currentOutfit.hat) {
      setHat(e, false);
      hatTaken = true;
    } else if (!hand && hatTaken && !praying && !lying && (!want || !!ex.animator.posture)) {
      hatTaken = false;
      setHat(e, true);
    }
    // How much of a run (true-size speed), eased.
    const speed = Math.hypot(ctx.body.vel.x, ctx.body.vel.z) / ctx.body.scale;
    run += (clamp01((speed - RUN_FROM) / (RUN_AT - RUN_FROM)) - run) * (still ? 1 : 1 - Math.exp(-dt * 5));
  },

  frame(f: MapFrame, m) {
    const e = env;
    if (!e) return;
    if (m !== 'walk' || !hand || !model) {
      hideDrips();
      SFX.level('umbPatter', 0);
      return;
    }
    const ex = e.explorer;
    const body = e.body;
    const rig = ex.rig;
    const w = f.weather;
    // (a still is put where it would be; a video's frames, as the live page's, ease)
    const k = f.dt > 0 && !still ? 1 - Math.exp(-f.dt * 6) : 1;

    // ── Where it leans (world): in toward his head, back a little, forward as he goes, downwind, away from a wall ──
    const yaw = body.yaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // (his left: +x of his body)
    const lx = Math.cos(yaw);
    const lz = -Math.sin(yaw);
    const side = hand === 'R' ? 1 : -1;
    const fwd = LEAN_WALK * clamp01(run * 4 + Math.hypot(body.vel.x, body.vel.z) / 4) + LEAN_RUN * run - LEAN_BACK;
    const ph = ex.animator.phase * Math.PI * 2;
    const moving = clamp01(Math.hypot(body.vel.x, body.vel.z) / 2);
    const sway = 0.035 * Math.sin(ph) * moving;
    const nod = 0.02 * Math.sin(ph * 2) * moving;
    const gust = w.wind * (LEAN_WIND + LEAN_GUST * Math.sin(f.t * 1.9 + 2.1 * Math.sin(f.t * 0.53)));
    const tx = lx * (LEAN_IN * side + sway) + fx * (fwd + nod) + Math.sin(w.windDir) * gust + push.x * LEAN_WALL;
    const tz = lz * (LEAN_IN * side + sway) + fz * (fwd + nod) + Math.cos(w.windDir) * gust + push.z * LEAN_WALL;
    lean.x += (tx - lean.x) * k;
    lean.z += (tz - lean.z) * k;
    _up.set(Math.tan(lean.x), 1, Math.tan(lean.z)).normalize();

    // ── The arm that holds it (over the Animator's pose: its own walk, his other hand's light) ──
    const wArm = smooth(held);
    rig.joints.chest.getWorldQuaternion(_q).invert();
    _v.copy(_up).applyQuaternion(_q);
    const arm = umbrellaArm(hand, run, _v);
    const [sj, ej, wj, pj] = ARM_JOINTS[hand];
    blend(rig.joints[sj], rig.rest[sj], arm.shoulder.x, arm.shoulder.y, arm.shoulder.z, wArm);
    blend(rig.joints[ej], rig.rest[ej], arm.elbow, 0, 0, wArm);
    blend(rig.joints[wj], rig.rest[wj], arm.wrist.x, arm.wrist.y, arm.wrist.z, wArm);
    rig.joints[sj].updateMatrixWorld(true);

    // ── The umbrella: upright in the world (its own lean), in the fist ──
    const mdl = model;
    rig.joints[pj].getWorldQuaternion(_q2).invert();
    _fw.set(fx, 0, fz).addScaledVector(_up, -(fx * _up.x + fz * _up.z)).normalize();
    _x.crossVectors(_up, _fw);
    _q.setFromRotationMatrix(_m.makeBasis(_x, _up, _fw));
    mdl.root.quaternion.copy(_q2).multiply(_q);
    // (it comes into his fist as the arm starts up, and goes as it ends down)
    mdl.root.scale.setScalar(Math.max(1e-3, smooth(held / 0.3)));
    const open = spreadHold ?? (going === 1 ? popOpen(spread) : smooth(spread));
    const flutter = w.wind * Math.sin(f.t * 13.1 + Math.sin(f.t * 3.7) * 2);
    mdl.setSpread(open, flutter);
    mdl.root.updateMatrixWorld(true);

    // ── Drips off the rib tips in rain, and the patter on the cloth ──
    const dry = sheltered || rain < 0.05 || open < 0.95;
    SFX.level('umbPatter', dry ? 0 : Math.min(1, rain * 1.2) ** 0.8 * clamp01(open));
    if (dry) return hideDrips();
    const d = (drips ??= makeDrips(e));
    d.visible = true;
    // (lit as the rain is: the sky's haze and a little of its fill; a lightning flash lights them)
    (d.material as MeshBasicMaterial).color
      .copy(SKY.haze)
      .multiplyScalar(0.95)
      .add(_c.copy(SKY.fillSky).multiplyScalar(0.25 * SKY.fillIntensity))
      .addScalar(0.06 + 0.7 * w.flash);
    const chance = Math.min(0.8, 0.12 + rain * 0.7);
    const ground = body.pos.y - 0.02;
    const sc = body.scale / 1.4;
    for (let i = 0; i < DRIPS; i++) {
      const period = 0.8 + hash3(i, 7, 3, 4511) * 0.9;
      const cyc = (f.t + hash3(i, 9, 5, 4512) * period) / period;
      const n = Math.floor(cyc);
      const tau = (cyc - n) * period;
      const o = i * 5;
      if (n !== dripN[i]) {
        // A new drop: from a rib tip where it is now, carried along as he goes.
        dripN[i] = n;
        dripOn[i] = hash3(i, n, 11, 4513) < chance ? 1 : 0;
        mdl.canopy.localToWorld(_w.copy(mdl.tips[(i * 3) % mdl.tips.length]));
        dripAt[o] = _w.x;
        dripAt[o + 1] = _w.y;
        dripAt[o + 2] = _w.z;
        dripAt[o + 3] = body.vel.x * 0.9;
        dripAt[o + 4] = body.vel.z * 0.9;
      }
      const y = dripAt[o + 1] - 0.5 * GRAVITY * tau * tau;
      if (!dripOn[i] || y < ground) _m.makeScale(0, 0, 0);
      else {
        // (a bead at first, drawn out as it falls)
        const len = (0.05 + Math.min(0.14, GRAVITY * tau * 0.02)) * sc;
        _m.compose(_w.set(dripAt[o] + dripAt[o + 3] * tau, y - len / 2, dripAt[o + 2] + dripAt[o + 4] * tau), _q.identity(), _s.set(0.024 * sc, len, 0.024 * sc));
      }
      d.setMatrixAt(i, _m);
    }
    d.instanceMatrix.needsUpdate = true;
  },

  setMode(next) {
    mode = next;
    if (next === 'walk') return;
    putAway();
    // (off his feet: the hat back on at once, as it was)
    if (hatTaken && env) {
      hatTaken = false;
      setHat(env, true);
    }
  },

  fromUrl(q) {
    const u = q.get('umbrella');
    if (u === '1') choice = 'open';
    else if (u === '0') choice = 'closed';
    else if (u === 'auto') choice = 'auto';
    const h = q.get('umbhand');
    forcedHand = h === 'L' || h === 'R' ? h : null;
    const sp = q.get('umbspread');
    spreadHold = sp !== null && sp !== '' && Number.isFinite(Number(sp)) ? clamp01(Number(sp)) : null;
    const c = q.get('umbcolor');
    if (isUmbrellaColor(c) && c !== color) {
      putAway();
      model?.dispose();
      model = null;
      color = c;
    }
    // (in the picture as it would be by now: no opening on the way)
    snap = true;
    if (mode !== 'walk') putAway();
  },

  report() {
    const out: Record<string, string> = {};
    if (choice === 'open' || (hand && held > 0.5)) out.umbrella = '1';
    else if (choice === 'closed') out.umbrella = '0';
    // (the hat it took off: a shot puts it on, and the umbrella takes it off again)
    if (hatTaken) out.hat = '1';
    if (hand === 'L') out.umbhand = 'L';
    if (color !== 'blue') out.umbcolor = color;
    return Object.keys(out).length ? out : null;
  },
};

registerAddon(addon);
