import { Model, type Species } from './_kit';
import type { Habits } from './_landBrain';

/**
 * Deer of the open grass: sambar (1.2 m at the shoulder, dark brown, big
 * ears, a dark bushy tail that flips up white in alarm; stags carry
 * three-tined antlers) and the small red muntjac, the barking deer (the same
 * model at 0.45 of the size, red-brown with a pale belly).
 *
 * They graze with the head down, look up alert with the ears forward, walk,
 * and bound away in long leaps; at rest they lie with the legs folded, the
 * head up, or stretched out on the ground asleep.
 *
 * Variants: 0 sambar hind, 1 sambar stag, 2 muntjac.
 */

const S = { fur: 0, mane: 1, belly: 2, leg: 3, muzzle: 4, black: 5, eye: 6, ear: 7, white: 8, antler: 9, tail: 10 };
const STAG = 1 << 1;
const MUNTJAC = 1 << 2;

const model = new Model()
  .bone('body', null, [0, 1.0, 0])
  .bone('neck', 'body', [0, 1.05, 0.5])
  .bone('head', 'neck', [0, 1.5, 0.62])
  .boneLR('ear*', 'head', [0.07, 1.63, 0.7])
  .bone('tail', 'body', [0, 1.2, -0.66])
  .boneLR('fleg*', 'body', [0.14, 0.86, 0.46])
  .boneLR('fshin*', 'fleg*', [0.14, 0.45, 0.46])
  .boneLR('hleg*', 'body', [0.14, 0.9, -0.5])
  .boneLR('hshin*', 'hleg*', [0.14, 0.48, -0.56]);

model
  // Body: barrel, deep chest, darker withers, round rump, paler belly.
  .box('body', [0, 1.0, -0.02], [0.44, 0.46, 1.24], S.fur)
  .box('body', [0, 0.97, 0.42], [0.42, 0.5, 0.34], S.fur)
  .box('body', [0, 1.245, 0.33], [0.3, 0.06, 0.42], S.mane)
  .box('body', [0, 1.04, -0.5], [0.42, 0.42, 0.3], S.fur)
  .box('body', [0, 0.76, -0.02], [0.34, 0.04, 0.8], S.belly)
  // Short thick neck (upright in the model, carried forward by the pose), shaggy throat.
  .box('neck', [0, 1.29, 0.6], [0.26, 0.5, 0.3], S.mane)
  .box('neck', [0, 1.22, 0.765], [0.2, 0.3, 0.05], S.mane)
  // Head: skull, long muzzle, black nose, eyes.
  .box('head', [0, 1.58, 0.75], [0.21, 0.21, 0.3], S.fur)
  .box('head', [0, 1.535, 0.98], [0.14, 0.14, 0.24], S.muzzle)
  .box('head', [0, 1.56, 1.105], [0.085, 0.065, 0.02], S.black)
  .boxLR('head', [0.107, 1.62, 0.8], [0.01, 0.035, 0.045], S.eye)
  // Big round ears, out and up.
  .boxLR('ear*', [0.18, 1.69, 0.69], [0.22, 0.12, 0.05], S.ear)
  // Stag: three-tined antlers. Muntjac buck: short spikes.
  .boxLR('head', [0.08, 1.82, 0.68], [0.04, 0.34, 0.04], S.antler, STAG)
  .boxLR('head', [0.08, 1.71, 0.78], [0.03, 0.03, 0.16], S.antler, STAG)
  .boxLR('head', [0.1, 2.04, 0.64], [0.03, 0.12, 0.03], S.antler, STAG)
  .boxLR('head', [0.07, 2.01, 0.74], [0.03, 0.09, 0.03], S.antler, STAG)
  .boxLR('head', [0.055, 1.76, 0.7], [0.035, 0.18, 0.035], S.antler, MUNTJAC)
  // Short tail: dark on the outside, white underneath (shows when it flips up).
  .box('tail', [0, 1.11, -0.69], [0.12, 0.2, 0.06], S.tail)
  .box('tail', [0, 1.12, -0.655], [0.1, 0.16, 0.012], S.white)
  // Slim legs, black hooves.
  .boxLR('fleg*', [0.14, 0.66, 0.46], [0.085, 0.42, 0.11], S.fur)
  .boxLR('fshin*', [0.14, 0.24, 0.46], [0.052, 0.42, 0.058], S.leg)
  .boxLR('fshin*', [0.14, 0.03, 0.475], [0.062, 0.06, 0.085], S.black)
  .boxLR('hleg*', [0.14, 0.7, -0.52], [0.12, 0.42, 0.18], S.fur)
  .boxLR('hshin*', [0.14, 0.26, -0.58], [0.055, 0.46, 0.062], S.leg)
  .boxLR('hshin*', [0.14, 0.03, -0.565], [0.062, 0.06, 0.085], S.black);

const GLSL = /* glsl */ `
vec3 faunaBoneRot(int b, FaunaPose P) {
  float lie = P.rest;
  float up = 1.0 - lie;
  float graze = max(P.head, 0.0);
  float alert = max(-P.head, 0.0);
  // (alarm: running, or standing alert)
  float alarm = max(P.run, alert * up);
  if (b == B_BODY) {
    // Leaps rock the body; grazing tips the front down a little.
    return vec3(0.1 * graze * up + 0.16 * sin(P.phase + 1.2) * P.run * up, 0.0, 0.03 * sin(P.phase) * P.walk * up);
  }
  // Neck: tipped forward, upright when alert, stretched out in a run, down to the grass.
  float neck = 1.0 - 0.45 * alert + 0.25 * P.run + 1.55 * graze * up + 0.95 * graze * lie + 0.06 * sin(P.phase * 2.0) * P.walk;
  if (b == B_NECK) return vec3(neck, 0.55 * P.turn * lie, 0.0);
  if (b == B_HEAD) {
    // Head pitch on the map: about level; muzzle down to graze; resting on the ground asleep.
    float chew = 0.05 * sin(P.t * 7.0 + P.seed * 20.0) * graze * up;
    float head = 0.15 - 0.1 * alert + 1.25 * graze * up + 0.15 * graze * lie + chew;
    return vec3(head - neck, P.turn * 0.8 * (1.0 - graze), 0.0);
  }
  if (b == B_EARL || b == B_EARR) {
    float s = b == B_EARL ? 1.0 : -1.0;
    float flick = faunaTwitch(P.t, 0.7, 0.3, P.seed + s * 0.37);
    // Up and forward when alert, flat back while running.
    return vec3(-0.25 * alert + 0.4 * P.run, s * (0.15 * alert - 0.5 * P.run), s * (0.3 * alert - 0.25 * graze + 0.5 * flick));
  }
  if (b == B_TAIL) {
    float flick = faunaTwitch(P.t, 0.5, 0.35, P.seed + 0.5);
    return vec3(2.1 * alarm + 0.35 * flick * (1.0 - alarm), 0.3 * flick, 0.0);
  }
  bool left = b == B_FLEGL || b == B_FSHINL || b == B_HLEGL || b == B_HSHINL;
  bool hind = b == B_HLEGL || b == B_HLEGR || b == B_HSHINL || b == B_HSHINR;
  bool upper = b == B_FLEGL || b == B_FLEGR || b == B_HLEGL || b == B_HLEGR;
  // Steps: walk left hind, left fore, right hind, right fore; bound: hind pair, then front pair.
  float walkOff = hind ? (left ? 0.0 : 0.5) : (left ? 0.25 : 0.75);
  float runOff = hind ? (left ? 0.0 : 0.06) : (left ? 0.45 : 0.52);
  float th = P.phase + 6.2832 * mix(walkOff, runOff, P.run);
  float swing = -sin(th) * (0.34 * P.walk + 0.85 * P.run) * up;
  float bend = max(0.0, cos(th)) * (0.7 * P.walk + 1.3 * P.run) * up;
  if (upper) {
    // Lying: front legs tucked forward, hind legs drawn under.
    float fold = hind ? -1.2 : -0.35;
    // Grazing: front legs a little apart.
    return vec3(swing + fold * lie, 0.0, (left ? 1.0 : -1.0) * 0.06 * graze * up * (hind ? 0.0 : 1.0));
  }
  return vec3(bend + (hind ? 2.35 : 2.55) * lie, 0.0, 0.0);
}

vec3 faunaRootMove(FaunaPose P) {
  float up = 1.0 - P.rest;
  float bob = 0.02 * sin(P.phase * 2.0) * P.walk + 0.28 * max(0.0, sin(P.phase + 1.9)) * P.run;
  return vec3(0.0, -0.66 * P.rest + bob * up, 0.0);
}
`;

export const DEER: Species = {
  name: 'deer',
  model,
  palettes: [
    [0x5e4735, 0x4a382b, 0x74604c, 0x4c3c2e, 0x3f332b, 0x1c1714, 0x120e0c, 0x6d5745, 0xe6ddd0, 0x9b8566, 0x2f261f],
    [0x544030, 0x3c2e24, 0x6a5644, 0x45362a, 0x3b3029, 0x1c1714, 0x120e0c, 0x655040, 0xe6ddd0, 0xa38b69, 0x2a221c],
    [0xa3582d, 0x8e4b27, 0xdcc7ab, 0x6b3d24, 0x7a4a2f, 0x1c1512, 0x120e0c, 0x9d5a33, 0xece2d4, 0x9d8a6e, 0x8a4a28],
  ],
  glsl: GLSL,
  ease: [0.3, 0.9, 0.5, 0.6, 0.4],
};

const DEER_LOOKS: Habits['looks'] = {
  stand: { rest: 0, head: 0, act: 0 },
  graze: { rest: 0, head: 1, act: 0 },
  look: { rest: 0, head: -0.4, act: 0 },
  lie: { rest: 1, head: 0, act: 0 },
  sleep: { rest: 1, head: 1, act: 0 },
};

/** Sambar herds in the open grass: graze most of the time; bound off 30–45 m when the explorer comes within ~15 m. */
export const SAMBAR_HABITS: Habits = {
  walk: 1.0,
  run: 7.5,
  walkHz: 0.9,
  runHz: 2.2,
  turn: 2.2,
  alertAt: 24,
  fleeAt: 15,
  fleeTo: [30, 45],
  wander: 16,
  leash: 60,
  moves: 0.35,
  idle: [
    ['graze', 5, 6, 20],
    ['look', 2, 3, 7],
    ['stand', 1, 2, 5],
    ['lie', 1, 20, 60],
  ],
  looks: DEER_LOOKS,
  night: 0.8,
  climb: 2.1,
};

/** Muntjac pairs by the forest edges: shyer, quicker, not so far. */
export const MUNTJAC_HABITS: Habits = {
  ...SAMBAR_HABITS,
  walk: 0.7,
  run: 5,
  walkHz: 1.3,
  runHz: 3.2,
  turn: 3,
  alertAt: 16,
  fleeAt: 10,
  fleeTo: [14, 24],
  wander: 9,
  leash: 35,
};
