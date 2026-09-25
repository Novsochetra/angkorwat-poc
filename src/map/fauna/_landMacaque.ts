import { Model, type Species } from './_kit';
import type { Habits } from './_landBrain';

/**
 * Long-tailed macaque (crab-eating macaque), the monkey of Angkor's temples:
 * about 0.5 m of body and as much again of tail, grey-brown with a paler
 * belly and cheek whiskers, a bare pinkish-grey face. On all fours it
 * knuckle-walks and gallops; it sits upright on its haunches to groom a
 * neighbour, scratch or eat, and sleeps sitting hunched, head on its chest.
 * Babies are dark and ride on their mother's back.
 *
 * Variants: 0 adult, 1 baby (dark fur, pink face), 2 old male (more golden).
 * Act: 1 groom (right hand picks at a neighbour), 2 scratch (left hand), 3 eat.
 */

const S = { fur: 0, back: 1, pale: 2, face: 3, hand: 4, eye: 5, brow: 6 };

const model = new Model()
  .bone('body', null, [0, 0.3, -0.15])
  .bone('neck', 'body', [0, 0.4, 0.19])
  .bone('head', 'neck', [0, 0.4, 0.19])
  .boneLR('arm*', 'body', [0.085, 0.33, 0.15])
  .boneLR('fore*', 'arm*', [0.085, 0.17, 0.15])
  .boneLR('leg*', 'body', [0.075, 0.3, -0.15])
  .boneLR('shin*', 'leg*', [0.075, 0.16, -0.12])
  .bone('tail1', 'body', [0, 0.37, -0.21])
  .bone('tail2', 'tail1', [0, 0.37, -0.43]);

model
  // Body: long back, deeper chest, pale belly, a darker saddle.
  .box('body', [0, 0.33, -0.03], [0.19, 0.17, 0.4], S.fur)
  .box('body', [0, 0.345, 0.12], [0.21, 0.19, 0.14], S.fur)
  .box('body', [0, 0.25, 0.0], [0.15, 0.03, 0.3], S.pale)
  .box('body', [0, 0.418, -0.05], [0.16, 0.02, 0.3], S.back)
  // Head: skull with a little crest, flat pale face, muzzle, brow, whiskers, ears.
  .box('head', [0, 0.44, 0.27], [0.15, 0.14, 0.14], S.fur)
  .box('head', [0, 0.52, 0.25], [0.06, 0.03, 0.08], S.back)
  .box('head', [0, 0.43, 0.345], [0.11, 0.09, 0.012], S.face)
  .box('head', [0, 0.405, 0.36], [0.07, 0.045, 0.045], S.face)
  .box('head', [0, 0.47, 0.35], [0.12, 0.022, 0.028], S.brow)
  .boxLR('head', [0.028, 0.447, 0.352], [0.024, 0.018, 0.01], S.eye)
  .boxLR('head', [0.075, 0.42, 0.31], [0.03, 0.085, 0.07], S.pale)
  .boxLR('head', [0.082, 0.465, 0.26], [0.015, 0.04, 0.035], S.face)
  // Arms and legs, hands and feet of dark skin.
  .boxLR('arm*', [0.085, 0.25, 0.15], [0.055, 0.165, 0.06], S.fur)
  .boxLR('fore*', [0.085, 0.095, 0.15], [0.05, 0.15, 0.055], S.fur)
  .boxLR('fore*', [0.085, 0.012, 0.165], [0.055, 0.024, 0.075], S.hand)
  .boxLR('leg*', [0.078, 0.23, -0.14], [0.07, 0.15, 0.09], S.fur)
  .boxLR('shin*', [0.075, 0.09, -0.125], [0.055, 0.14, 0.06], S.fur)
  .boxLR('shin*', [0.075, 0.012, -0.1], [0.055, 0.024, 0.11], S.hand)
  // Tail, as long as the body.
  .box('tail1', [0, 0.37, -0.32], [0.036, 0.036, 0.22], S.fur)
  .box('tail2', [0, 0.37, -0.555], [0.03, 0.03, 0.25], S.back);

const GLSL = /* glsl */ `
vec3 faunaBoneRot(int b, FaunaPose P) {
  float sit = P.rest;
  float up = 1.0 - sit;
  float groom = clamp(1.0 - abs(P.act - 1.0), 0.0, 1.0) * sit;
  float scratch = clamp(1.0 - abs(P.act - 2.0), 0.0, 1.0) * sit;
  float eat = clamp(1.0 - abs(P.act - 3.0), 0.0, 1.0) * sit;
  if (b == B_BODY) return vec3(-1.25 * sit + sin(P.phase) * 0.14 * P.run * up, 0.0, sin(P.phase) * 0.04 * P.walk * up);
  // (the neck keeps the head level whatever the body does)
  if (b == B_NECK) return vec3(1.25 * sit - sin(P.phase) * 0.14 * P.run * up, 0.0, 0.0);
  if (b == B_HEAD) {
    float nod = P.head * (0.6 + 0.15 * sit) + 0.35 * groom + 0.08 * sin(P.t * 3.1 + P.seed * 9.0) * groom;
    nod -= 0.05 * sin(P.phase * 2.0) * P.walk;
    float look = P.turn * 0.9 + 0.25 * scratch;
    return vec3(nod, look, 0.12 * scratch);
  }
  // (tail pitch > 0 lifts it) Carried with its base up and the rest hanging in an arc; on the ground behind when sitting.
  if (b == B_TAIL1) return vec3(0.3 * up + 1.35 * sit + 0.2 * P.run, 0.18 * sin(P.t * 0.9 + P.seed * 6.0), 0.0);
  if (b == B_TAIL2) return vec3(-0.95 * up - 0.05 * sit + 0.5 * P.run, 0.25 * sin(P.t * 0.9 + P.seed * 6.0 - 0.8), 0.0);

  bool left = b == B_ARML || b == B_FOREL || b == B_LEGL || b == B_SHINL;
  bool hind = b == B_LEGL || b == B_LEGR || b == B_SHINL || b == B_SHINR;
  bool upper = b == B_ARML || b == B_ARMR || b == B_LEGL || b == B_LEGR;
  float side = left ? 1.0 : -1.0;
  // Steps: diagonal walk (left hind, left fore, right hind, right fore), a gallop runs in pairs.
  float walkOff = hind ? (left ? 0.0 : 0.5) : (left ? 0.25 : 0.75);
  float runOff = hind ? (left ? 0.0 : 0.1) : (left ? 0.5 : 0.6);
  float th = P.phase + 6.2832 * mix(walkOff, runOff, P.run);
  float swing = -sin(th) * (0.42 * P.walk + 0.8 * P.run) * up;
  float bend = max(0.0, cos(th)) * (0.55 * P.walk + 0.9 * P.run) * up;
  if (hind) {
    if (upper) return vec3(swing - 0.45 * sit, 0.25 * side * sit, 0.0);
    return vec3(bend + 1.15 * sit, 0.0, 0.0);
  }
  // Arms: hang in front when sitting; the right one grooms or feeds, the left scratches.
  bool right = !left;
  if (upper) {
    float a = swing + 0.95 * sit;
    if (right) a += -0.9 * groom - 1.9 * eat + 0.12 * sin(P.t * 1.7) * eat;
    else a += -2.1 * scratch;
    return vec3(a, 0.0, left ? 0.55 * scratch : 0.0);
  }
  float f = -bend * 0.7;
  if (right) f += (-0.55 + 0.3 * sin(P.t * 6.5 + P.seed * 5.0)) * groom - 1.7 * eat;
  else f += (-1.3 + 0.35 * sin(P.t * 19.0)) * scratch;
  return vec3(f, 0.0, 0.0);
}

vec3 faunaRootMove(FaunaPose P) {
  float up = 1.0 - P.rest;
  float bob = 0.012 * sin(P.phase * 2.0) * P.walk + 0.06 * max(0.0, sin(P.phase)) * P.run;
  return vec3(0.0, -0.205 * P.rest + bob * up, 0.0);
}
`;

export const MACAQUE: Species = {
  name: 'macaque',
  model,
  palettes: [
    [0x7d6e5c, 0x685a48, 0xb2a48e, 0xc8a393, 0x4a4038, 0x1d1612, 0x584b3e],
    [0x3d3531, 0x342d29, 0x5c524b, 0xdcaea5, 0x4d3e37, 0x120e0c, 0x2a2420],
    [0x9c8667, 0x836d50, 0xc7b69a, 0xc09888, 0x4a4038, 0x1d1612, 0x6a5a45],
  ],
  glsl: GLSL,
  ease: [0.25, 0.45, 0.4, 0.5, 0.35],
};

/** Troops round the temples: sit, groom, scratch, eat, pick at the ground; scamper off and settle again. */
export const MACAQUE_HABITS: Habits = {
  walk: 0.9,
  run: 3.8,
  walkHz: 1.8,
  runHz: 3.4,
  turn: 4,
  alertAt: 9,
  fleeAt: 5.5,
  fleeTo: [7, 13],
  wander: 7,
  leash: 25,
  moves: 0.4,
  idle: [
    ['sit', 3, 6, 15],
    ['look', 2, 4, 10],
    ['groom', 3, 10, 25],
    ['scratch', 1, 2, 5],
    ['eat', 2, 5, 12],
    ['graze', 2, 3, 8],
    ['stand', 1, 2, 5],
  ],
  looks: {
    stand: { rest: 0, head: 0, act: 0 },
    graze: { rest: 0, head: 1, act: 0 },
    look: { rest: 1, head: 0, act: 0 },
    sit: { rest: 1, head: 0.2, act: 0 },
    groom: { rest: 1, head: 0.3, act: 1 },
    groomed: { rest: 1, head: 0.7, act: 0 },
    scratch: { rest: 1, head: 0, act: 2 },
    eat: { rest: 1, head: 0, act: 3 },
    sleep: { rest: 1, head: 1, act: 0 },
  },
  night: 0.9,
  climb: 1.3,
};
