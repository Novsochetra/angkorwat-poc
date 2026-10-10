import { Group, Vector3 } from 'three';
import { CARRY_PACE, carryWalk, SPILL_RATE, type YokeRig } from '../../character/carryPole';
import { BODY_UNIT_M, WALK_SPEED } from '../../world/scale';
import '../audio/_garden';
import { SFX } from '../audio/addonSfx';
import { POLE_ACTIONS, type PoleAction } from '../garden/actions';
import { GARDEN_FX } from '../garden/fx';
import { BUCKET_POURS, GARDEN, JAR_MAX, type Plant } from '../garden/state';
import { HOME } from '../hamlet/_homePlan';
import { pad } from '../pad/pad';
import type { MapFrame } from '../types';
import { num, onLang, t } from '../ui/lang';
import { registerAddon, touchJump, type AddonEnv, type AddonHold, type AddonKey } from './_addons';
import { CARRY } from './_carryHook';
import { downModel, leanModel, type DownModel } from './_carryPoleModel';
import { CarryPoleBody } from './_carryPoleBody';
import { jarNear, restAt, TAKE_REACH, thirstyNear, waterAhead } from './_carryPoleSpots';
import { createCarryChip, type CarryChip } from './_carryPoleChip';
import { gardenSay, plantWord } from './_gardenToasts';
import { angleDiff } from './followCam';
import { PAD_LIGHT } from './input';
import type { RoamCtx } from './types';

/**
 * Carrying water on the shoulder pole (add-on `carryPole`; ដងរែក, carrying water: រែកទឹក): his bamboo pole with
 * a bucket hung from each end, to bring water from the stream to his yard's jar and to his plants.
 *
 * - **Its place**: leaning on his house's front stilt by the stair (_carryPoleSpots.ts `restAt`, the model
 *   _carryPoleModel.ts). Once the house is his: "E  Take up the shoulder pole" (`poleUp`).
 * - **Carrying**: the walker moves him (not a ride), a little slower the fuller the buckets (`CARRY_PACE`: the
 *   step's input scaled); the pole on his right shoulder, the buckets swinging (character/carryPole.ts `YokeRig`,
 *   his upper body `applyCarryWalk`, the props _carryPoleBody.ts). Running (Shift) and jumping make them swing and
 *   slop: water spills over the rims (`spill`: pours lost, `gardenSpill`, a `spill` beat to the garden's effects), a
 *   word the first time a visit. The pole creaks and the water sloshes by his pace and the swing (loops
 *   `gardenYokeCreak`, `gardenSlosh`). The buckets' water shows in a chip over the tool bar ("Buckets 9/12").
 * - **What E does with it** (first in the E row: `order` 12, so no ride, boat, ramp or hammock is offered while he
 *   carries it; the garden offers nothing of its own either: `CARRY.on`): at water he can reach — the stream's or the
 *   lake's surface at most 0.45 m under his feet (the village's washing steps, a low edge) or wading in the shallows —
 *   "E  Fill the buckets" (`poleFill`: two buckets of `BUCKET_POURS`); at his jar with water in the buckets "E  Pour
 *   into the jar · jar 12/24" (`poleJar`: `GARDEN.fillJar`); at a thirsty plant of his garden "E  Water the mango with
 *   the dipper" (`poleScoop`: one pour, `GARDEN.water(p, 'bucket')`); anywhere else "E  Set down the pole"
 *   (`poleDown`: it lies there, the water in its buckets, till he takes it up again).
 * - **Hands full**: no lantern or torch (`handsBusy`), and the keys that want his hands (the tools, sitting and
 *   lying down, the emotes, the greeting) say to set the pole down first.
 * - **Back to the map**: the pole is back at its place, its water poured out. Nothing is saved but the jar.
 *
 * An action holds him (`holding`) from E to its end (garden/actions.ts `POLE_ACTIONS`: its beats, sounds, the
 * props in his hands; his posture character/gardenWork.ts `gardenPose`): he steps to it and turns first. The stick
 * held away stops it (before its beat nothing changes).
 *
 * URL (checks): `carry=1` he carries it (empty) · `carry=full|<pours>` with water · `carry=down` set down where he
 * stands · `carry=<action>[:<t>]` (`up`, `down`, `fill`, `jar`, `scoop`) held at `t` s of it (with what it needs: at the
 * water, the jar, a thirsty plant; else from where he stands) · `report()` gives `carry=`.
 */

/** Pours in both buckets full. */
const FULL = BUCKET_POURS * 2;
/** The stick held away this long (s) stops an action. */
const PUSH = 0.15;
/** Stepping to the work: his pace (m/s, true size × his scale), given up after this long (s). */
const STEP_PACE = 1.4;
const STEP_MAX = 3;
/** Where he stands for the work (m from it): the pole's foot, the jar's middle, the plant's foot. */
const STAND = { up: 0.75, jar: 1.05, scoop: 0.95 };
/** The camera at the work: round to his side (rad), tilt, distance; eased there, the player's after. */
const FRAME = { side: 1.15, pitch: 0.28, distance: 5.4, rate: 2.4, for: 1.6, back: 1.6 };
/**
 * How full a bucket of `BUCKET_POURS` stands (its water's height in it: one fills them to a hand under the rim, so a
 * calm walk spills none): the swing and the props see this share.
 */
const BRIM = 0.85;
/** A calm walk spills only past this much of the swing's spill (0‥1); running and jumping spill from any slop. */
const CALM = 0.85;
/** …and only this share of it (a careful walker's starts and turns lose a few drops, not a pour). */
const CALM_LOSS = 0.06;
/** Slower than this (m/s at his size) he stands: a calm swing spills nothing. */
const STILL = 0.3;
/** A jump of his place over this (m in a step: a "Go there", a check's teleport) is no fling: the swing starts afresh. */
const JUMP_PLACE = 1.5;
/** The swing settles this long (s) after it is taken up or he is put elsewhere: no spill meanwhile. */
const SETTLE = 0.8;
/** Spilling: the sound and the splash no oftener than this (s); the word once a visit, after this much is lost (pours). */
const SPILL_EVERY = 0.55;
const SPILL_SAY = 0.6;
/** Keys that want his hands (they say to set the pole down first, and do nothing). */
const HANDS_KEYS = [PAD_LIGHT, 'Digit1', 'Numpad1', 'Digit2', 'Numpad2', 'Digit3', 'Numpad3', 'Digit4', 'Numpad4', 'Digit5', 'Numpad5', 'KeyJ', 'KeyL', 'KeyF', 'KeyO', 'KeyU', 'KeyP', 'KeyY', 'KeyZ', 'KeyC', 'Digit8'];

type Rest = { at: 'lean' } | { at: 'down'; x: number; y: number; z: number; yaw: number };

interface Act {
  readonly a: PoleAction;
  phase: 'step' | 'turn' | 'work';
  t: number;
  stepT: number;
  push: number;
  /** Where the work is (m: the pole's foot, the water, the jar's mouth, the plant's foot), where he stands, the way he faces. */
  readonly target: Vector3;
  readonly stand: Vector3;
  face: number;
  readonly done: boolean[];
  frozen: boolean;
  readonly plant: Plant | null;
  /** At his house: taken up from where it leans on the stilt, or leant back there. */
  readonly home: boolean;
}

let env: AddonEnv | null = null;
let carrying = false;
/** The two buckets' water (pours: front, back). */
const buckets: [number, number] = [0, 0];
let rest: Rest = { at: 'lean' };
let act: Act | null = null;
let lastCtx: RoamCtx | null = null;
/** The models on the map when he does not carry it. */
let lean: Group | null = null;
let down: DownModel | null = null;
/** His body with it (the pose over his walk, the props, the swing). */
const walk = carryWalk();
let body: CarryPoleBody | null = null;
/** The buckets' swing (the props' `YokeRig`: sway, slosh, spill), once the body is made. */
let yoke: YokeRig = null as unknown as YokeRig;
let chip: CarryChip | null = null;
/** The camera before an action (eased back to after), how long it has been framed, the side it comes round to. */
let camBefore: { pitch: number; distance: number } | null = null;
let framed = 0;
let side = 1;
/** Spilling: since the last sound (s), lost this visit (pours), the word said. */
let spillT = 0;
let spilled = 0;
let spillSaid = false;
let handsSaidAt = -1e9;
let clock = 0;
let speedNow = 0;
/** No spilling for this long (s) after it is taken up or he is put somewhere (the swing settles first). */
let settleFor = 0;
/** In the air this long (s: a jump, a fall). */
let airT = 0;
let lastX = 0;
let lastZ = 0;
let runNow = 0;
const _v = new Vector3();
/** The leaning pole's foot and top (world m: from its model's frame), and both in his space for the pose (BU). */
const leanFoot = new Vector3();
const leanTop = new Vector3();
const leanBody = { foot: new Vector3(), top: new Vector3() };
const _w = { x: 0, y: 0, z: 0 };
const prompts = new Map<string, string>();
onLang(() => prompts.clear());

const total = (): number => buckets[0] + buckets[1];
const load = (): number => total() / FULL;
function sync(): void {
  CARRY.on = carrying;
  CARRY.water = total();
  chip?.set(carrying, total(), FULL);
}

/** A prompt, made once a key, language and number (asked every step). */
function prompt(key: string, make: () => string): string {
  let p = prompts.get(key);
  if (p === undefined) prompts.set(key, (p = make()));
  return p;
}

// ── Where things are ─────────────────────────────────────────────────────────

/** The pole where it lies now (when he does not carry it): its foot and the way it lies. */
function restPlace(): { x: number; z: number } {
  if (rest.at === 'down') return rest;
  const r = restAt();
  return { x: r.x, z: r.z };
}

/** He stands near enough the pole lying there to take it up (and the house is his, for the one at its place). */
function nearPole(ctx: RoamCtx): boolean {
  if (carrying || act) return false;
  if (rest.at === 'lean' && !HOME.owned) return false;
  const p = restPlace();
  return Math.hypot(ctx.body.pos.x - p.x, ctx.body.pos.z - p.z) < TAKE_REACH;
}

/** What E would do now while he carries it (the first that fits). */
function carryOffer(ctx: RoamCtx): { a: PoleAction; plant: Plant | null; home?: boolean } | 'jarFull' | null {
  const b = ctx.body;
  if (total() < FULL - 0.5 && waterAhead(ctx.world, b.pos.x, b.pos.y, b.pos.z, b.yaw, _w)) return { a: 'poleFill', plant: null };
  if (total() >= 0.5 && jarNear(ctx.world, b.pos.x, b.pos.z, _w)) return GARDEN.jar < JAR_MAX - 0.5 ? { a: 'poleJar', plant: null } : 'jarFull';
  if (total() >= 1) {
    const p = thirstyNear(b.pos.x, b.pos.z);
    if (p) return { a: 'poleScoop', plant: p };
  }
  // (by its place at his house, the buckets empty: leant back against the stilt)
  if (total() < 0.5 && HOME.owned && Math.hypot(b.pos.x - leanFoot.x, b.pos.z - leanFoot.z) < TAKE_REACH) return { a: 'poleDown', plant: null, home: true };
  return { a: 'poleDown', plant: null };
}

// ── The actions ──────────────────────────────────────────────────────────────

/** Begin an action: where it is, where he stands for it. */
function begin(ctx: RoamCtx, a: PoleAction, plant: Plant | null, back = false): boolean {
  if (!env || act) return false;
  const b = ctx.body;
  const target = new Vector3();
  const stand = new Vector3(b.pos.x, 0, b.pos.z);
  switch (a) {
    case 'poleUp': {
      const p = restPlace();
      target.set(p.x, ctx.world.field.heightAt(p.x, p.z), p.z);
      placeBy(b.pos.x, b.pos.z, target, STAND.up, stand);
      break;
    }
    case 'poleFill':
      if (!waterAhead(ctx.world, b.pos.x, b.pos.y, b.pos.z, b.yaw, _w)) return false;
      target.set(_w.x, _w.y, _w.z);
      break;
    case 'poleJar':
      if (!jarNear(ctx.world, b.pos.x, b.pos.z, _w)) return false;
      target.set(_w.x, _w.y, _w.z);
      placeBy(b.pos.x, b.pos.z, target, STAND.jar, stand);
      break;
    case 'poleScoop':
      if (!plant) return false;
      target.set(plant.x, ctx.world.field.heightAt(plant.x, plant.z), plant.z);
      placeBy(b.pos.x, b.pos.z, target, STAND.scoop, stand);
      break;
    default:
      if (back) {
        // (leaning it back at his house: before its place, facing it)
        target.copy(leanFoot);
        placeBy(b.pos.x, b.pos.z, target, STAND.up, stand);
        break;
      }
      // (setting it down: where he stands, the way he faces)
      target.set(b.pos.x + Math.sin(b.yaw), b.pos.y, b.pos.z + Math.cos(b.yaw));
  }
  const home = a === 'poleUp' ? rest.at === 'lean' : a === 'poleDown' && back;
  const far = Math.hypot(stand.x - b.pos.x, stand.z - b.pos.z) > 0.08;
  act = {
    a,
    phase: far ? 'step' : 'turn',
    t: 0,
    stepT: 0,
    push: 0,
    target,
    stand,
    face: Math.atan2(target.x - stand.x, target.z - stand.z),
    done: POLE_ACTIONS[a].beats.map(() => false),
    frozen: false,
    plant,
    home,
  };
  camBefore ??= { pitch: ctx.cam.pitch, distance: ctx.cam.distance };
  side = angleDiff(ctx.cam.yaw, b.yaw) >= 0 ? 1 : -1;
  framed = 0;
  b.vel.set(0, 0, 0);
  touchJump('hide');
  return true;
}

/** Where he stands to work at `target`: `d` m from it, on the side he comes from. */
function placeBy(x: number, z: number, target: Vector3, d: number, out: Vector3): void {
  let ax = x - target.x;
  let az = z - target.z;
  const l = Math.hypot(ax, az) || 1;
  ax /= l;
  az /= l;
  out.set(target.x + ax * d, 0, target.z + az * d);
}

/** A beat crossed: its sound, the effects, and what it does. */
function beatDone(ctx: RoamCtx, s: Act, i: number, quiet: boolean): void {
  const B = POLE_ACTIONS[s.a].beats[i];
  if (B.sound && !quiet) SFX.play(B.sound, 0.85);
  const n = POLE_ACTIONS[s.a].beats.slice(0, i).filter((x) => x.name === B.name).length;
  GARDEN_FX.beat({ action: s.a, beat: B.name, n, x: s.target.x, y: s.target.y, z: s.target.z, yaw: ctx.body.yaw, kind: s.plant?.kind ?? null, plant: s.plant?.id ?? -1 });
  switch (`${s.a}:${B.name}`) {
    case 'poleUp:grip':
      // (in his hands: the model where it lay goes, the props in his hands show it)
      showRest(false);
      break;
    case 'poleUp:shoulder':
      carrying = true;
      yoke.reset();
      settleFor = SETTLE;
      break;
    case 'poleDown:free': {
      if (s.home) {
        // (let go, leaning on the stilt: the props show it there till the end, then the model)
        rest = { at: 'lean' };
        carrying = false;
        break;
      }
      // (let go: it lies where the pose set it, by his right side; the model takes over from the props)
      const b = ctx.body;
      rest = { at: 'down', x: b.pos.x, y: b.pos.y, z: b.pos.z, yaw: b.yaw };
      carrying = false;
      showRest(true);
      break;
    }
    case 'poleFill:full1':
      buckets[0] = BUCKET_POURS;
      break;
    case 'poleFill:full2':
      buckets[1] = BUCKET_POURS;
      if (!quiet) gardenSay(t('carryFilled'));
      break;
    case 'poleJar:empty1':
    case 'poleJar:empty2': {
      const k = B.name === 'empty1' ? 0 : 1;
      buckets[k] -= GARDEN.fillJar(buckets[k]);
      if (k === 1 && !quiet) gardenSay(t(GARDEN.jar >= JAR_MAX - 0.01 ? 'carryJarNowFull' : 'carryJarNow', { n: num(Math.floor(GARDEN.jar)), max: num(JAR_MAX) }));
      break;
    }
    case 'poleScoop:pour': {
      const p = s.plant;
      if (p && GARDEN.plants.includes(p) && GARDEN.water(p, 'bucket')) {
        // (from the fuller bucket)
        const k = buckets[0] >= buckets[1] ? 0 : 1;
        const from = Math.min(1, buckets[k]);
        buckets[k] -= from;
        buckets[1 - k] = Math.max(0, buckets[1 - k] - (1 - from));
        if (!quiet && total() < 1) gardenSay(t('carryEmpty'));
      }
      break;
    }
    default:
      break;
  }
  sync();
}

function beats(ctx: RoamCtx, s: Act, from: number, to: number, quiet: boolean): void {
  const list = POLE_ACTIONS[s.a].beats;
  for (let i = 0; i < list.length; i++) {
    if (s.done[i] || list[i].at > to || list[i].at < from - 1e-6) continue;
    s.done[i] = true;
    beatDone(ctx, s, i, quiet);
  }
}

/** The action's lasting sound (the buckets filling) at `t`. */
function loopAt(s: Act | null, on: boolean): void {
  const loop = s ? POLE_ACTIONS[s.a].loop : POLE_ACTIONS.poleFill.loop;
  if (!loop) return;
  SFX.level(loop.sfx, on && s && s.t >= loop.from && s.t < loop.to ? 1 : 0);
}

/** Stop the action now (its end, or the stick, another mode). */
function finish(ctx: RoamCtx | null, stopped: boolean): void {
  const s = act;
  if (!s) return;
  act = null;
  // (from the action's pose back onto his shoulder the buckets swing a moment: that is no spill)
  settleFor = SETTLE;
  loopAt(null, false);
  if (stopped) GARDEN_FX.cancel(s.a);
  // (taking it up stopped before it was on his shoulder: it stays where it was)
  if (s.a === 'poleUp' && !carrying) showRest(true);
  // (leant back at his house: the model takes over from the props)
  if (s.a === 'poleDown' && s.home && !carrying) showRest(true);
  body?.act(null, 0);
  touchJump(null);
  if (ctx) ctx.body.explorer.setMotion(0, true, 0);
  sync();
}

function settle(ctx: RoamCtx, dt: number): void {
  const p = ctx.body.pos;
  const land = ctx.world.field.heightAt(p.x, p.z);
  const top = ctx.world.groundAt(p.x, p.z);
  const y = top - land < 0.6 || Math.abs(top - p.y) < 0.7 ? top : land;
  p.y += (y - p.y) * (dt > 0 ? 1 - Math.exp(-14 * dt) : 1);
}

/** The work's place in his space (BU), for the posture. */
function toBody(ctx: RoamCtx, x: number, y: number, z: number, out: Vector3): Vector3 {
  const b = ctx.body;
  const k = 1 / (BODY_UNIT_M * b.scale);
  const dx = x - b.pos.x;
  const dz = z - b.pos.z;
  const c = Math.cos(b.yaw);
  const sn = Math.sin(b.yaw);
  return out.set((dx * c - dz * sn) * k, (y - b.pos.y) * k, (dx * sn + dz * c) * k);
}

/** The leaning pole in his space (BU), for an action at his house; else null (it lies on its buckets). */
function leanOf(ctx: RoamCtx, s: Act): { foot: Vector3; top: Vector3 } | null {
  if (!s.home) return null;
  toBody(ctx, leanFoot.x, leanFoot.y, leanFoot.z, leanBody.foot);
  toBody(ctx, leanTop.x, leanTop.y, leanTop.z, leanBody.top);
  return leanBody;
}

/** One step of an action (it holds him). */
function holdAct(ctx: RoamCtx, dt: number): void {
  const s = act!;
  const b = ctx.body;
  const ex = b.explorer;
  ctx.cam.turn(ctx.input.lookYaw, ctx.input.lookPitch, ctx.input.zoom);
  const push = Math.hypot(ctx.input.move.x, ctx.input.move.y) > 0.5;
  s.push = push ? s.push + dt : 0;
  if (push && !s.frozen && (s.phase !== 'work' || s.push > PUSH)) {
    finish(ctx, true);
    return;
  }
  switch (s.phase) {
    case 'step': {
      s.stepT += dt;
      const dx = s.stand.x - b.pos.x;
      const dz = s.stand.z - b.pos.z;
      const d = Math.hypot(dx, dz);
      const v = Math.min(STEP_PACE * b.scale, 0.4 + d * 3);
      if (d > 0.04) {
        const k = Math.min(d, v * dt) / d;
        b.pos.x += dx * k;
        b.pos.z += dz * k;
        b.yaw += angleDiff(Math.atan2(dx, dz), b.yaw) * (1 - Math.exp(-10 * dt));
      }
      settle(ctx, dt);
      ex.setMotion(d > 0.04 ? v / b.scale : 0, true, 0);
      if (d <= 0.04 || s.stepT > STEP_MAX) {
        s.phase = 'turn';
        s.face = Math.atan2(s.target.x - b.pos.x, s.target.z - b.pos.z);
      }
      break;
    }
    case 'turn':
      settle(ctx, dt);
      ex.setMotion(0, true, 0);
      b.yaw += angleDiff(s.face, b.yaw) * (1 - Math.exp(-10 * dt));
      if (Math.abs(angleDiff(s.face, b.yaw)) < 0.06 || (s.a === 'poleDown' && !s.home)) {
        b.yaw = s.a === 'poleDown' && !s.home ? b.yaw : s.face;
        s.phase = 'work';
      }
      break;
    case 'work': {
      settle(ctx, dt);
      ex.setMotion(0, true, 0);
      b.vel.set(0, 0, 0);
      const was = s.t;
      if (!s.frozen) s.t += dt;
      beats(ctx, s, was, s.t, s.frozen);
      // (at his house the props take the leaning pole over from its first frame: the model goes)
      if (s.home && lean) lean.visible = false;
      body?.act(s.a, s.t, toBody(ctx, s.target.x, s.target.y, s.target.z, _v), s.plant, dt, leanOf(ctx, s));
      loopAt(s, !s.frozen);
      if (s.t >= POLE_ACTIONS[s.a].len) {
        finish(ctx, false);
        return;
      }
      break;
    }
  }
  frameCam(ctx, dt);
}

/** The camera at the work: round to his side, a little closer (eased for a while; the player's after). */
function frameCam(ctx: RoamCtx, dt: number): void {
  const { cam, body: b, input } = ctx;
  cam.focus.set(b.pos.x, b.pos.y + 1.7 * b.scale * (act?.phase === 'work' ? 0.62 : 0.86), b.pos.z);
  cam.behindYaw = b.yaw;
  if (input.lookYaw || input.lookPitch || input.zoom) framed = FRAME.for;
  if (!act || act.phase !== 'work' || framed >= FRAME.for) return;
  framed += dt;
  const k = 1 - Math.exp(-FRAME.rate * dt);
  cam.yaw += angleDiff(b.yaw + FRAME.side * side, cam.yaw) * k;
  cam.pitch += (FRAME.pitch - cam.pitch) * k;
  cam.distance += (Math.min(Math.max(FRAME.distance, cam.minDistance), cam.maxDistance) - cam.distance) * k;
}

// ── On the map ───────────────────────────────────────────────────────────────

/** The pole at its place or where he set it down (shown), or neither (he has it). */
function showRest(on: boolean): void {
  if (lean) lean.visible = on && rest.at === 'lean' && HOME.owned;
  if (down) {
    down.object.visible = on && rest.at === 'down';
    if (rest.at === 'down') {
      down.object.position.set(rest.x, rest.y, rest.z);
      down.object.rotation.set(0, rest.yaw, 0);
      down.setWater((buckets[0] / BUCKET_POURS) * BRIM, (buckets[1] / BUCKET_POURS) * BRIM);
    }
  }
}

/** Back at its place, empty (back to the map; a check's start). */
function home(): void {
  if (act) finish(lastCtx, true);
  carrying = false;
  buckets[0] = buckets[1] = 0;
  rest = { at: 'lean' };
  yoke.reset();
  walk.w = 0;
  body?.carry(false);
  showRest(true);
  sync();
}

/** Spilling while he walks: what goes over the rims (the swing's `spills`), the sound, the effects, a word once. */
function spill(ctx: RoamCtx, dt: number): void {
  spillT += dt;
  let lost = 0;
  for (let i = 0; i < 2; i++) {
    // (walking calmly, only a real slop goes over: a run, a jump, a sharp turn)
    // (standing still, nothing: the swing dies down in the buckets)
    const raw = yoke.spills[i];
    const k = runNow > 0.5 || airT > 0.05 ? raw : speedNow < STILL ? 0 : (Math.max(0, raw - CALM) / (1 - CALM)) * CALM_LOSS;
    if (k <= 0 || buckets[i] <= 0) continue;
    const l = Math.min(buckets[i], k * dt * SPILL_RATE * BUCKET_POURS);
    buckets[i] -= l;
    lost += l;
  }
  if (lost <= 0) return;
  spilled += lost;
  sync();
  if (yoke.spill > 0.1 && spillT >= SPILL_EVERY) {
    spillT = 0;
    SFX.play('gardenSpill', Math.min(1, 0.4 + yoke.spill));
    const b = ctx.body;
    GARDEN_FX.beat({ action: 'poleFill', beat: 'spill', n: 0, x: b.pos.x, y: b.pos.y, z: b.pos.z, yaw: b.yaw, kind: null, plant: -1 });
    pad.rumble('tick', 0.2);
  }
  if (!spillSaid && spilled >= SPILL_SAY) {
    spillSaid = true;
    gardenSay(t('carrySpill'));
  }
}

const ACT_KEYS: readonly AddonKey[] = [
  ['W A S D', 'gardenKeyStop', 'lstick'],
  ['Q R', 'rLook', 'rstick'],
];

registerAddon({
  id: 'carryPole',
  order: 12,
  init(e) {
    env = e;
    lean = leanModel();
    const r = restAt();
    lean.position.set(r.x, e.world.field.heightAt(r.x, r.z), r.z);
    lean.rotation.y = r.yaw;
    e.scene.add(lean);
    lean.updateMatrixWorld(true);
    leanFoot.set(0, 0.02, -0.06).applyMatrix4(lean.matrixWorld);
    leanTop.set(0, 1.59, 0.48).applyMatrix4(lean.matrixWorld);
    down = downModel();
    e.scene.add(down.object);
    body = new CarryPoleBody(e.explorer);
    yoke = body.yoke.rig;
    chip = createCarryChip(e.layer);
    // (checks: the pole's state, read by a test in the page)
    if (e.shot || import.meta.env.DEV)
      Object.assign(window, {
        __carryPole: {
          state: () => ({ carrying, buckets: [...buckets], rest: rest.at, act: act ? { a: act.a, t: +act.t.toFixed(2), phase: act.phase } : null, sway: yoke.sway, slosh: yoke.slosh, spill: yoke.spill, spills: [...yoke.spills], run: runNow, speed: speedNow, air: airT, grounded: lastCtx?.body.grounded, swing: yoke.swing.map((w) => ({ ...w })) }),
          empty: () => {
            buckets[0] = buckets[1] = 0;
            sync();
          },
          pours: (n: number) => {
            buckets[0] = Math.min(BUCKET_POURS, Math.ceil(n / 2));
            buckets[1] = Math.min(BUCKET_POURS, Math.floor(n / 2));
            sync();
          },
          shown: () => ({ lean: !!lean?.visible, down: !!down?.object.visible, props: !!body?.carried }),
        },
      });
    showRest(true);
    sync();
  },
  get holding() {
    return act !== null;
  },
  get handsBusy() {
    return carrying || act !== null;
  },
  input(ctx, mode, tap) {
    lastCtx = ctx;
    if (!carrying || act || mode !== 'walk') return false;
    // His hands are on the pole: what wants them says so, and does nothing.
    const taps = ctx.input.taps as Set<string> | undefined;
    if (taps && tap(...HANDS_KEYS)) {
      for (const k of HANDS_KEYS) taps.delete(k);
      if (clock - handsSaidAt > 2.5) {
        handsSaidAt = clock;
        ctx.hud.toast(t('carryHandsFull'));
      }
    }
    // Slower with water in the buckets (a heavier, shorter step).
    const k = 1 - (1 - CARRY_PACE) * load();
    ctx.input.move.x *= k;
    ctx.input.move.y *= k;
    return false;
  },
  offer(ctx, mode) {
    if (mode !== 'walk' || !env || act) return null;
    if (!carrying) {
      if (env.busy() || !ctx.body.grounded || !nearPole(ctx)) return null;
      return prompt('take', () => `E  ${t('carryTake')}`);
    }
    if (!ctx.body.grounded) return null;
    const o = carryOffer(ctx);
    if (o === 'jarFull') return prompt('jarFull', () => t('carryJarIsFull'));
    if (!o) return null;
    switch (o.a) {
      case 'poleFill':
        return prompt('fill', () => `E  ${t('carryFill')}`);
      case 'poleJar': {
        const n = Math.floor(GARDEN.jar);
        return prompt(`jar${n}`, () => `E  ${t('carryJar', { n: num(n), max: num(JAR_MAX) })}`);
      }
      case 'poleScoop':
        return prompt(`scoop${o.plant!.kind}`, () => `E  ${t('carryScoop', { plant: plantWord(o.plant!.kind) })}`);
      default:
        return o.home ? prompt('back', () => `E  ${t('carryBack')}`) : prompt('down', () => `E  ${t('carryDown')}`);
    }
  },
  use(ctx, mode) {
    if (mode !== 'walk' || act) return;
    if (!carrying) {
      if (nearPole(ctx)) begin(ctx, 'poleUp', null);
      return;
    }
    const o = carryOffer(ctx);
    if (o && o !== 'jarFull') begin(ctx, o.a, o.plant, o.home);
  },
  hold(ctx, dt): AddonHold {
    lastCtx = ctx;
    if (act) holdAct(ctx, dt);
    return { prompt: null };
  },
  keys() {
    return act ? ACT_KEYS : null;
  },
  after(ctx, mode, dt) {
    lastCtx = ctx;
    if (mode !== 'walk') return;
    const b = ctx.body;
    speedNow = Math.hypot(b.vel.x, b.vel.z) / b.scale;
    // (put elsewhere at once: the buckets' swing starts afresh, no fling)
    if (Math.hypot(b.pos.x - lastX, b.pos.z - lastZ) > JUMP_PLACE) {
      yoke.reset();
      settleFor = SETTLE;
    }
    settleFor = Math.max(0, settleFor - dt);
    // (a jump or a real fall: off the ground and going up or down fast — a step down off a ledge is not one)
    airT = !b.grounded && Math.abs(b.vel.y) > 2.2 * b.scale ? airT + dt : Math.max(0, airT - dt * 2);
    lastX = b.pos.x;
    lastZ = b.pos.z;
    runNow += ((carrying && ctx.input.run && speedNow > WALK_SPEED * 1.15 ? 1 : 0) - runNow) * (1 - Math.exp(-6 * dt));
    if (carrying && !act && settleFor <= 0) spill(ctx, dt);
    // (the camera back to the player's after an action)
    if (!act && camBefore) {
      if (ctx.input.zoom) camBefore = null;
      else {
        const k = 1 - Math.exp(-FRAME.back * dt);
        ctx.cam.pitch += (camBefore.pitch - ctx.cam.pitch) * k;
        ctx.cam.distance += (camBefore.distance - ctx.cam.distance) * k;
        if (Math.abs(camBefore.pitch - ctx.cam.pitch) < 0.005 && Math.abs(camBefore.distance - ctx.cam.distance) < 0.05) camBefore = null;
      }
    }
  },
  frame(f: MapFrame, mode) {
    clock = f.t;
    // (the props on him: carrying, or in an action until it is let go — taken up from its grip, set down until free)
    const on = mode === 'walk' && act === null ? carrying : mode === 'walk' && act !== null && (act.a === 'poleUp' ? act.done[0] || (act.home && act.phase === 'work') : act.a === 'poleDown' ? carrying || act.home : true);
    // (at his house the props take over from the leaning model the frame the work begins)
    if (act?.home && act.phase === 'work' && lean) lean.visible = false;
    // His upper body with the pole, the buckets swinging (after the walker's step and his animation: over it).
    walk.w += ((on && !act ? 1 : 0) - walk.w) * (f.dt > 0 ? 1 - Math.exp(-8 * f.dt) : 1);
    walk.load = load();
    walk.speed = speedNow;
    walk.run = runNow;
    walk.t = f.t;
    walk.bounce = yoke.bounce;
    if (env && body) {
      walk.phase = env.explorer.animator.phase;
      body.carry(on);
      body.frame(f.dt, walk, [(buckets[0] / BUCKET_POURS) * BRIM, (buckets[1] / BUCKET_POURS) * BRIM], runNow);
    }
    // The pole's creak and the water's slosh, by his pace and the swing.
    const moving = carrying && !act ? Math.min(1, speedNow / WALK_SPEED) : 0;
    SFX.level('gardenYokeCreak', moving * (0.45 + 0.55 * load()));
    SFX.level('gardenSlosh', carrying && !act ? yoke.slosh * Math.min(1, load() * 2) : 0);
  },
  setMode(next, _prev, ctx) {
    lastCtx = ctx;
    if (next === 'overview') {
      home();
      spilled = 0;
      spillSaid = false;
      camBefore = null;
      SFX.level('gardenYokeCreak', 0);
      SFX.level('gardenSlosh', 0);
      return;
    }
    if (next !== 'walk') {
      if (act) finish(ctx, true);
      // (off his feet with it: it lies where he was, the water in its buckets)
      if (carrying) {
        const b = ctx.body;
        rest = { at: 'down', x: b.pos.x, y: ctx.world.field.heightAt(b.pos.x, b.pos.z), z: b.pos.z, yaw: b.yaw };
        carrying = false;
        body?.carry(false);
        showRest(true);
        sync();
      }
    }
  },
  fromUrl(q, ctx) {
    lastCtx = ctx;
    const v = q.get('carry');
    if (!v || !env) return;
    home();
    settleFor = SETTLE;
    const [what, at] = v.split(':');
    const tt = Number(at);
    const fill = (n: number) => {
      buckets[0] = Math.min(BUCKET_POURS, Math.ceil(n / 2));
      buckets[1] = Math.min(BUCKET_POURS, Math.floor(n / 2));
    };
    const b = ctx.body;
    if (what === 'down') {
      rest = { at: 'down', x: b.pos.x, y: b.pos.y, z: b.pos.z, yaw: b.yaw };
      fill(Number(at) || 0);
      showRest(true);
      sync();
      return;
    }
    // (`set:<t>` sets it down where he stands; `back:<t>` leans it back at his house)
    const acts: Record<string, PoleAction> = { up: 'poleUp', fill: 'poleFill', jar: 'poleJar', scoop: 'poleScoop', set: 'poleDown', back: 'poleDown' };
    const back = what === 'back';
    const a = acts[what];
    if (!a || a !== 'poleUp') {
      carrying = true;
      showRest(false);
      fill(what === 'full' || a === 'poleJar' || a === 'poleScoop' ? FULL : Number.isFinite(Number(what)) ? Number(what) : 0);
      if (a === 'poleFill') fill(0);
    }
    sync();
    if (!a) return;
    // (an action held at `t` s: where it is from here — at the water, the jar, a thirsty plant — else nothing)
    if ((a === 'poleUp' && rest.at === 'lean') || back) {
      const r = restAt();
      b.pos.set(r.x + Math.sin(r.yaw + Math.PI) * STAND.up, b.pos.y, r.z + Math.cos(r.yaw + Math.PI) * STAND.up);
      settle(ctx, 0);
    }
    const plant = a === 'poleScoop' ? thirstyNear(b.pos.x, b.pos.z) : null;
    if (!begin(ctx, a, plant, back)) {
      console.warn(`[map] carryPole: ${a} has nothing to work on from (${b.pos.x.toFixed(1)}, ${b.pos.z.toFixed(1)})`);
      return;
    }
    const s = act!;
    b.pos.x = s.stand.x;
    b.pos.z = s.stand.z;
    settle(ctx, 0);
    b.yaw = a === 'poleDown' && !back ? b.yaw : Math.atan2(s.target.x - b.pos.x, s.target.z - b.pos.z);
    s.phase = 'work';
    s.frozen = true;
    s.t = Math.max(0, Math.min(POLE_ACTIONS[a].len - 0.01, Number.isFinite(tt) ? tt : POLE_ACTIONS[a].len / 2));
    beats(ctx, s, 0, s.t, true);
    if (s.home && lean) lean.visible = false;
    body?.act(a, s.t, toBody(ctx, s.target.x, s.target.y, s.target.z, _v), s.plant, 0, leanOf(ctx, s));
    framed = 0;
    for (let i = 0; i < 60; i++) frameCam(ctx, 1 / 30);
    console.info(`[map] carryPole: ${a}:${s.t.toFixed(2)} at (${b.pos.x.toFixed(1)}, ${b.pos.z.toFixed(1)}), buckets ${total().toFixed(1)}/${FULL}`);
  },
  report() {
    if (carrying) return { carry: String(Math.round(total())) };
    if (rest.at === 'down') return { carry: `down:${Math.round(total())}` };
    return null;
  },
});

