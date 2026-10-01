import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { Model, type Species, type V3 } from './_kit';
import type { Agent, Habits } from './_landBrain';

/**
 * Swamp buffalo of the river banks: a heavy slate-grey barrel on short
 * legs, paler below the knees, a pale chevron under the throat, the head
 * carried low and long with wide crescent horns swept back.
 *
 * They stand or lie by the water and in the shallows, graze, chew, turn the
 * head, flick an ear and swish the tail; they walk slowly and hardly ever run.
 *
 * One can be ridden (roam/_buffaloRide.ts): the explorer walking up calmly
 * does not scare them (running at them still does), and the one he rides
 * stops thinking for itself (`BUFFALO_RIDE`): the ride moves it, tilts it
 * (`drawRidden`) and poses it, its step phase too (the act channel), so his
 * sway keeps time with its steps (`buffaloPoint`, the pose on the CPU).
 */

const S = { skin: 0, belly: 1, pale: 2, muzzle: 3, dark: 4, horn: 5, tip: 6, eye: 7, shin: 8, hoof: 9 };

const model = new Model()
  .bone('body', null, [0, 0.95, 0])
  .bone('neck', 'body', [0, 1.12, 0.8])
  .bone('head', 'neck', [0, 1.02, 1.08])
  .boneLR('ear*', 'head', [0.2, 1.03, 1.12])
  .bone('tail', 'body', [0, 1.28, -0.88])
  .boneLR('fleg*', 'body', [0.27, 0.74, 0.6])
  .boneLR('fshin*', 'fleg*', [0.27, 0.37, 0.6])
  .boneLR('hleg*', 'body', [0.27, 0.8, -0.62])
  .boneLR('hshin*', 'hleg*', [0.27, 0.37, -0.66]);

model
  // Barrel, shoulders with a low hump, rump, belly.
  .box('body', [0, 0.95, -0.05], [0.78, 0.72, 1.7], S.skin)
  .box('body', [0, 1.02, 0.55], [0.8, 0.62, 0.5], S.skin)
  .box('body', [0, 1.35, 0.42], [0.58, 0.08, 0.62], S.skin)
  .box('body', [0, 0.99, -0.83], [0.7, 0.6, 0.2], S.skin)
  .box('body', [0, 0.58, -0.05], [0.66, 0.06, 1.2], S.belly)
  // Thick short neck with the pale throat chevron.
  .box('neck', [0, 1.02, 0.95], [0.5, 0.5, 0.38], S.skin)
  .box('neck', [0, 0.78, 0.98], [0.4, 0.06, 0.28], S.pale)
  // Long head, dark muzzle and nostrils, eyes.
  .box('head', [0, 1.0, 1.28], [0.4, 0.34, 0.42], S.skin)
  .box('head', [0, 1.18, 1.18], [0.32, 0.06, 0.2], S.skin)
  .box('head', [0, 0.88, 1.52], [0.32, 0.26, 0.2], S.muzzle)
  .box('head', [0, 0.86, 1.625], [0.22, 0.1, 0.012], S.dark)
  .boxLR('head', [0.205, 1.02, 1.36], [0.01, 0.04, 0.05], S.eye)
  // Horns: out sideways, then swept back and up in a crescent.
  .boxLR('head', [0.3, 1.18, 1.16], [0.24, 0.1, 0.11], S.horn)
  .boxLR('head', [0.46, 1.22, 1.07], [0.1, 0.1, 0.2], S.horn)
  .boxLR('head', [0.5, 1.28, 0.93], [0.09, 0.1, 0.14], S.horn)
  .boxLR('head', [0.44, 1.34, 0.83], [0.07, 0.08, 0.1], S.tip)
  // Ears, flat out under the horns.
  .boxLR('ear*', [0.29, 1.02, 1.12], [0.16, 0.06, 0.09], S.skin)
  // Tail with a dark tuft.
  .box('tail', [0, 0.98, -0.91], [0.06, 0.6, 0.06], S.skin)
  .box('tail', [0, 0.64, -0.91], [0.1, 0.14, 0.1], S.dark)
  // Legs: grey above, paler below the knee, dark hooves.
  .boxLR('fleg*', [0.27, 0.56, 0.6], [0.18, 0.37, 0.2], S.skin)
  .boxLR('fshin*', [0.27, 0.2, 0.6], [0.13, 0.34, 0.14], S.shin)
  .boxLR('fshin*', [0.27, 0.03, 0.62], [0.15, 0.06, 0.17], S.hoof)
  .boxLR('hleg*', [0.27, 0.6, -0.62], [0.2, 0.42, 0.26], S.skin)
  .boxLR('hshin*', [0.27, 0.2, -0.66], [0.13, 0.34, 0.14], S.shin)
  .boxLR('hshin*', [0.27, 0.03, -0.64], [0.15, 0.06, 0.17], S.hoof);

/**
 * The walk's rocking (radians, model units): the body's roll, the neck's nod and the body's lift, and under a rider
 * (`RIDE`) a little more of each and a slow fore-and-aft rock: a heavy stride with a load on its back. `buffaloPoint`
 * mirrors the shader with the same numbers.
 */
const ROCK = { roll: 0.025, nod: 0.04, lift: 0.02 };
const RIDE = { roll: 0.05, nod: 0.08, lift: 0.04, rock: 0.025 };
const glslNum = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(5)));

const GLSL = /* glsl */ `
// The buffalo he rides (roam/_buffaloRide.ts) steps to the ride's clock: its act channel holds 1 + its step phase
// (every other buffalo's act is 0), so his sway keeps time with its steps.
float buffaloRidden(FaunaPose P) {
  return step(0.5, P.act);
}
float buffaloPhase(FaunaPose P) {
  return P.act > 0.5 ? P.act - 1.0 : P.phase;
}

vec3 faunaBoneRot(int b, FaunaPose P) {
  float lie = P.rest;
  float up = 1.0 - lie;
  float graze = max(P.head, 0.0);
  float alert = max(-P.head, 0.0);
  float ph = buffaloPhase(P);
  float rd = buffaloRidden(P);
  if (b == B_BODY) return vec3(0.04 * graze * up + ${glslNum(RIDE.rock)} * rd * sin(ph * 2.0 + 1.0) * P.walk, 0.0, (${glslNum(ROCK.roll)} + ${glslNum(RIDE.roll - ROCK.roll)} * rd) * sin(ph) * P.walk);
  if (b == B_NECK) return vec3(0.85 * graze * up + 0.2 * graze * lie - 0.2 * alert + (${glslNum(ROCK.nod)} + ${glslNum(RIDE.nod - ROCK.nod)} * rd) * sin(ph * 2.0) * P.walk, 0.0, 0.0);
  if (b == B_HEAD) {
    // Chewing, a slow nod now and then; the head turns to look.
    float chew = 0.03 * sin(P.t * 4.0 + P.seed * 11.0) * (1.0 - graze);
    return vec3(0.3 * graze - 0.15 * alert + chew, P.turn * 0.75, 0.05 * P.turn);
  }
  if (b == B_EARL || b == B_EARR) {
    float s = b == B_EARL ? 1.0 : -1.0;
    return vec3(0.0, s * 0.4 * faunaTwitch(P.t, 0.6, 0.35, P.seed + s * 0.21), s * (0.15 * alert - 0.1));
  }
  if (b == B_TAIL) {
    // Swishes at flies, in bouts.
    float bout = smoothstep(0.1, 0.6, sin(P.t * 0.31 + P.seed * 8.0));
    return vec3(0.1 + 0.15 * lie, 0.45 * sin(P.t * 2.6 + P.seed * 5.0) * (0.25 + 0.75 * bout), 0.0);
  }
  bool left = b == B_FLEGL || b == B_FSHINL || b == B_HLEGL || b == B_HSHINL;
  bool hind = b == B_HLEGL || b == B_HLEGR || b == B_HSHINL || b == B_HSHINR;
  bool upper = b == B_FLEGL || b == B_FLEGR || b == B_HLEGL || b == B_HLEGR;
  float off = hind ? (left ? 0.0 : 0.5) : (left ? 0.25 : 0.75);
  float th = ph + 6.2832 * off;
  float swing = -sin(th) * (0.3 * P.walk + 0.6 * P.run) * up;
  float bend = max(0.0, cos(th)) * (0.55 * P.walk + 0.9 * P.run) * up;
  // Lying: front legs folded under the chest, hind legs drawn forward along the belly.
  if (upper) return vec3(swing + (hind ? -1.3 : 0.2) * lie, 0.0, 0.0);
  return vec3(bend + (hind ? 2.6 : 2.7) * lie, 0.0, 0.0);
}

vec3 faunaRootMove(FaunaPose P) {
  float up = 1.0 - P.rest;
  return vec3(0.0, -0.56 * P.rest + (${glslNum(ROCK.lift)} + ${glslNum(RIDE.lift - ROCK.lift)} * buffaloRidden(P)) * sin(buffaloPhase(P) * 2.0) * P.walk * up, 0.0);
}
`;

/**
 * The river herds' size over the model's (land.ts; each a little bigger or smaller): as big as the hamlet's
 * buffaloes (people/_sceneBackAnimals.ts) and the oxen beside the people, who are drawn as big as the explorer
 * (`PEOPLE_SCALE`): a boy on its back is a small rider on a big beast, as in the villages.
 */
export const BUFFALO_SIZE = 1.3;

export const BUFFALO: Species = {
  name: 'buffalo',
  model,
  palettes: [[0x4d4e52, 0x5b5b5e, 0xb5ada2, 0x3b3a3c, 0x1f1d1e, 0x6e6454, 0x3e3831, 0x100d0c, 0x6d6c69, 0x2a2624]],
  glsl: GLSL,
  ease: [0.5, 1.4, 0.9, 1.1, 0.6],
  shadows: true,
};

/** At the river: graze, stand, lie, wallow in the shallows; walk a few steps off when the explorer comes very close. */
export const BUFFALO_HABITS: Habits = {
  walk: 0.7,
  run: 2.2,
  walkHz: 0.75,
  runHz: 1.4,
  turn: 0.8,
  alertAt: 11,
  fleeAt: 5,
  fleeTo: [5, 9],
  wander: 6,
  leash: 16,
  moves: 0.15,
  idle: [
    ['graze', 3, 10, 30],
    ['stand', 2, 5, 15],
    ['look', 1, 4, 8],
    ['lie', 3, 30, 90],
  ],
  looks: {
    stand: { rest: 0, head: 0, act: 0 },
    graze: { rest: 0, head: 1, act: 0 },
    look: { rest: 0, head: 0, act: 0 },
    lie: { rest: 1, head: 0, act: 0 },
    sleep: { rest: 1, head: 1, act: 0 },
  },
  night: 1,
  climb: 1.1,
};

// ── Riding one (roam/_buffaloRide.ts) ─────────────────────────────────────────

/**
 * The ride and the land animals (land.ts) meet here, a plain module object (no
 * part imports another's three.js objects): land.ts lists its buffaloes and its
 * clock, the ride says which one it has and how it is tilted, and whether the
 * explorer comes up calmly.
 */
export const BUFFALO_RIDE = {
  /** Every buffalo of the land animals (land.ts). */
  herd: [] as Agent[],
  /** The one he rides, getting on or off: it does not think (land.ts skips its step); the ride moves and poses it, and land.ts draws it with `drawRidden`. */
  ridden: null as Agent | null,
  /** He walks (or rides) calmly: the buffaloes let him come up to them (running at them still scares them). */
  calm: false,
  /** land.ts's clock (the flocks' time) at its last update. */
  now: 0,
  /** The ridden one's tilt (radians): pitch + = its front down, roll + = its left side up (the shader's sense). */
  pitch: 0,
  roll: 0,
};

const _q = new Quaternion();
const _e = new Euler();
const _m = new Matrix4();
const _p = new Vector3();
const _s = new Vector3();

/** land.ts, for the ridden buffalo instead of its own `place`: placed, and tilted with the ground under it (climbing a bank, stepping down into the water). */
export function drawRidden(ag: Agent): void {
  const fl = ag.flock;
  fl.place(ag.i, ag.x, ag.y, ag.z, ag.yaw, ag.scale);
  const { pitch, roll } = BUFFALO_RIDE;
  if (pitch === 0 && roll === 0) return;
  // (`place` writes only the heading; the whole turn, written over it: `place` rewrites it next time, as it differs)
  _q.setFromEuler(_e.set(pitch, ag.yaw, roll, 'YXZ'));
  _m.compose(_p.set(ag.x, ag.y, ag.z), _q, _s.setScalar(ag.scale));
  _m.toArray(fl.mesh.instanceMatrix.array as Float32Array, ag.i * 16);
  fl.mesh.instanceMatrix.needsUpdate = true;
}

/** A ridden buffalo's pose, as the ride writes it into the flock's channels (and the shader reads it). */
export interface BuffaloPose {
  /** Feet (m), heading and tilt (radians: pitch + front down, roll + left side up), size. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  scale: number;
  /** The channels: gait (0 still, 1 walk, up to 2 run), rest (0 standing, 1 lying), head (−1 up, 0, 1 grazing), turn (−1 right ‥ 1 left). */
  gait: number;
  rest: number;
  head: number;
  turn: number;
  /** Step phase (radians). */
  phase: number;
}

const pivot = (name: string): V3 => model.bones[model.id(name)].pivot;
const PIVOT = { body: pivot('body'), neck: pivot('neck'), head: pivot('head') };
/** Points on it (model units: its own space, feet at y = 0, facing +z): where he sits (on the back, behind the shoulders' hump) and the nose rope's ring through the muzzle. */
export const BUFFALO_SEAT: V3 = [0, 1.31, -0.22];
export const BUFFALO_NOSE: V3 = [0, 0.85, 1.6];

const ORIGIN: V3 = [0, 0, 0];

/** Turn `p` (model units) about `pv` by the shader's (pitch, yaw, roll) of a bone: R = Ry · Rx · Rz. */
function boneTurn(p: Vector3, pv: V3, rx: number, ry: number, rz: number): void {
  const x0 = p.x - pv[0];
  const y0 = p.y - pv[1];
  const z0 = p.z - pv[2];
  // (no allocation: this runs a few times a frame)
  let c = Math.cos(rz);
  let s = Math.sin(rz);
  const x1 = c * x0 - s * y0;
  const y1 = s * x0 + c * y0;
  c = Math.cos(rx);
  s = Math.sin(rx);
  const y2 = c * y1 - s * z0;
  const z2 = s * y1 + c * z0;
  c = Math.cos(ry);
  s = Math.sin(ry);
  p.set(c * x1 + s * z2 + pv[0], y2 + pv[1], -s * x1 + c * z2 + pv[2]);
}

/**
 * Where a point of the ridden buffalo's body (`bone` 'body'), neck or head is now, in metres on the map: the shader's
 * pose (`faunaBoneRot`, `faunaRootMove` with the ride's rocking), then its place and tilt. The head's chewing (a few
 * millimetres) is left out.
 */
export function buffaloPoint(b: BuffaloPose, bone: 'body' | 'neck' | 'head', point: V3, out: Vector3): Vector3 {
  const run = Math.min(1, Math.max(0, b.gait - 1));
  const walk = Math.min(1, Math.max(0, b.gait)) - run;
  const lie = b.rest;
  const up = 1 - lie;
  const graze = Math.max(b.head, 0);
  const alert = Math.max(-b.head, 0);
  const ph = b.phase;
  out.set(point[0], point[1], point[2]);
  if (bone === 'head') boneTurn(out, PIVOT.head, 0.3 * graze - 0.15 * alert, b.turn * 0.75, 0.05 * b.turn);
  if (bone !== 'body') boneTurn(out, PIVOT.neck, 0.85 * graze * up + 0.2 * graze * lie - 0.2 * alert + RIDE.nod * Math.sin(ph * 2) * walk, 0, 0);
  boneTurn(out, PIVOT.body, 0.04 * graze * up + RIDE.rock * Math.sin(ph * 2 + 1) * walk, 0, RIDE.roll * Math.sin(ph) * walk);
  out.y += -0.56 * lie + RIDE.lift * Math.sin(ph * 2) * walk * up;
  out.multiplyScalar(b.scale);
  boneTurn(out, ORIGIN, b.pitch, b.yaw, b.roll);
  return out.set(out.x + b.x, out.y + b.y, out.z + b.z);
}

/** The ridden body's own tilt under the seat now (radians, the shader's sense): its pitch and roll on top of `BuffaloPose.pitch`, `roll`. */
export function buffaloBodyTilt(b: BuffaloPose, out: { pitch: number; roll: number }): { pitch: number; roll: number } {
  const run = Math.min(1, Math.max(0, b.gait - 1));
  const walk = Math.min(1, Math.max(0, b.gait)) - run;
  const graze = Math.max(b.head, 0);
  out.pitch = 0.04 * graze * (1 - b.rest) + RIDE.rock * Math.sin(b.phase * 2 + 1) * walk;
  out.roll = RIDE.roll * Math.sin(b.phase) * walk;
  return out;
}
