import { Model, type Species } from './_kit';
import type { Habits } from './_landBrain';

/**
 * Swamp buffalo of the river banks: a heavy slate-grey barrel on short
 * legs, paler below the knees, a pale chevron under the throat, the head
 * carried low and long with wide crescent horns swept back.
 *
 * They stand or lie by the water and in the shallows, graze, chew, turn the
 * head, flick an ear and swish the tail; they walk slowly and hardly ever run.
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

const GLSL = /* glsl */ `
vec3 faunaBoneRot(int b, FaunaPose P) {
  float lie = P.rest;
  float up = 1.0 - lie;
  float graze = max(P.head, 0.0);
  float alert = max(-P.head, 0.0);
  if (b == B_BODY) return vec3(0.04 * graze * up, 0.0, 0.025 * sin(P.phase) * P.walk);
  if (b == B_NECK) return vec3(0.85 * graze * up + 0.2 * graze * lie - 0.2 * alert + 0.04 * sin(P.phase * 2.0) * P.walk, 0.0, 0.0);
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
  float th = P.phase + 6.2832 * off;
  float swing = -sin(th) * (0.3 * P.walk + 0.6 * P.run) * up;
  float bend = max(0.0, cos(th)) * (0.55 * P.walk + 0.9 * P.run) * up;
  // Lying: front legs folded under the chest, hind legs drawn forward along the belly.
  if (upper) return vec3(swing + (hind ? -1.3 : 0.2) * lie, 0.0, 0.0);
  return vec3(bend + (hind ? 2.6 : 2.7) * lie, 0.0, 0.0);
}

vec3 faunaRootMove(FaunaPose P) {
  float up = 1.0 - P.rest;
  return vec3(0.0, -0.56 * P.rest + 0.02 * sin(P.phase * 2.0) * P.walk * up, 0.0);
}
`;

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
