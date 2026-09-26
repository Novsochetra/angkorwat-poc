import { Model, type Species } from './_kit';
import type { Habits } from './_landBrain';

/**
 * Green peafowl, the wild peafowl of Cambodia's forests (endangered): tall
 * and upright, green all over with bronze and blue sheen, a long green neck
 * of scale-like feathers, a straight crest, bare yellow and blue skin on the
 * face. The male's train (the long upper tail coverts, 1.4 m) trails behind
 * him bronze-green with eyespots; now and then he raises it into a fan and
 * shivers it. The hen is duller, with a short tail.
 *
 * They walk the clearings pecking at the ground, preen, stretch up to look
 * about; when the explorer comes close they run off with the neck stretched
 * out. At night they go up into the trees to roost (jungle.ts hides them).
 *
 * The train's feathers lie in a fan spread flat (`fan*` bones, yaw) on a
 * base (`train`) that lifts it upright (pitch): folded, the spread closes
 * and the base lays it behind him.
 *
 * Variants: 0 male, 1 hen. Act: 1 peck, 2 display (the fan), 3 preen.
 */

const S = {
  body: 0,
  breast: 1,
  wing: 2,
  neck: 3,
  head: 4,
  crest: 5,
  bill: 6,
  faceY: 7,
  faceB: 8,
  eye: 9,
  leg: 10,
  train: 11,
  train2: 12,
  ring: 13,
  spot: 14,
  tail: 15,
};
const MALE = 1 << 0;
const HEN = 1 << 1;
/** Feathers of the train, and their spread when fanned (rad each). */
const FEATHERS = 7;
const PIVOT_TRAIN: [number, number, number] = [0, 0.64, -0.2];

const model = new Model()
  .bone('body', null, [0, 0.56, 0])
  .bone('neck', 'body', [0, 0.66, 0.18])
  .bone('head', 'neck', [0, 0.93, 0.24])
  .boneLR('wing*', 'body', [0.1, 0.66, 0.1])
  .boneLR('leg*', 'body', [0.06, 0.47, 0.0])
  .bone('tail', 'body', [0, 0.6, -0.2])
  .bone('train', 'body', PIVOT_TRAIN);
for (let k = 0; k < FEATHERS; k++) model.bone(`fan${k}`, 'train', PIVOT_TRAIN);

model
  // Body, the blue-green scaled breast.
  .box('body', [0, 0.57, -0.02], [0.2, 0.22, 0.42], S.body)
  .box('body', [0, 0.6, 0.16], [0.17, 0.22, 0.14], S.breast)
  // Folded wings: bronze coverts.
  .boxLR('wing*', [0.105, 0.6, -0.05], [0.03, 0.16, 0.36], S.wing)
  // Long neck, head, crest, bill, the bare face (yellow below, blue above), eyes.
  .box('neck', [0, 0.8, 0.22], [0.075, 0.3, 0.075], S.neck)
  .box('head', [0, 0.965, 0.26], [0.075, 0.075, 0.11], S.head)
  .box('head', [0, 0.955, 0.34], [0.032, 0.026, 0.06], S.bill)
  .boxLR('head', [0.039, 0.95, 0.28], [0.004, 0.035, 0.06], S.faceY)
  .boxLR('head', [0.039, 0.977, 0.27], [0.004, 0.018, 0.05], S.faceB)
  .boxLR('head', [0.04, 0.968, 0.29], [0.004, 0.012, 0.012], S.eye)
  .box('head', [0, 1.055, 0.25], [0.014, 0.1, 0.03], S.crest)
  .box('head', [0, 1.1, 0.25], [0.022, 0.02, 0.035], S.crest)
  // Legs: feathered thighs, long grey shanks, toes.
  .boxLR('leg*', [0.06, 0.43, 0.0], [0.07, 0.1, 0.09], S.body)
  .boxLR('leg*', [0.06, 0.2, 0.01], [0.026, 0.38, 0.026], S.leg)
  .boxLR('leg*', [0.06, 0.012, 0.04], [0.06, 0.024, 0.1], S.leg)
  // The true tail under the train (the hen's is all there is).
  .box('tail', [0, 0.58, -0.32], [0.12, 0.05, 0.2], S.tail, MALE)
  .box('tail', [0, 0.6, -0.34], [0.15, 0.06, 0.28], S.tail, HEN);
// The train: feathers along −z from the base, eyespots on their upper side, the middle ones longest.
for (let k = 0; k < FEATHERS; k++) {
  const c = k - (FEATHERS - 1) / 2;
  const len = 1.35 * (1 - 0.2 * (Math.abs(c) / 3));
  const x = c * 0.006;
  const y = PIVOT_TRAIN[1] + 0.004 * (k % 2);
  const z0 = PIVOT_TRAIN[2];
  const bone = `fan${k}`;
  model.box(bone, [x, y, z0 - len / 2], [0.15, 0.018, len], k % 2 ? S.train2 : S.train, MALE);
  for (const f of [0.55, 0.78, 0.97]) {
    const z = z0 - len * f;
    model.box(bone, [x, y + 0.011, z], [0.11, 0.006, 0.1], S.ring, MALE);
    model.box(bone, [x, y + 0.016, z], [0.06, 0.006, 0.055], S.spot, MALE);
  }
}

const GLSL = /* glsl */ `
vec3 faunaBoneRot(int b, FaunaPose P) {
  float sit = P.rest;
  float up = 1.0 - sit;
  float peck = clamp(1.0 - abs(P.act - 1.0), 0.0, 1.0) * up;
  float fan = clamp(1.0 - abs(P.act - 2.0), 0.0, 1.0) * up;
  float preen = clamp(1.0 - abs(P.act - 3.0), 0.0, 1.0) * up;
  float alert = max(-P.head, 0.0);
  float jab = pow(max(0.0, sin(P.t * 4.2 + P.seed * 20.0)), 4.0) * step(0.2, sin(P.t * 0.8 + P.seed * 7.0) + 0.5);
  // The fan shivers in bursts (a rattle of the quills).
  float shiver = fan * 0.035 * sin(P.t * 36.0) * step(0.62, fract(P.t * 0.23 + P.seed));
  if (b == B_BODY) return vec3(-0.1 * alert + 0.3 * P.run + 0.18 * peck + 0.12 * fan - 0.08 * sit, shiver * 0.5, 0.04 * sin(P.phase) * P.walk);
  if (b == B_NECK) {
    // Bobs with the steps; down to peck; stretched out forward running; turned back to preen.
    float bob = -0.16 * sin(P.phase * 2.0) * P.walk;
    float pitch = 0.08 - 0.12 * alert + bob + (0.95 + 0.25 * jab) * peck - 0.12 * fan + 0.45 * preen + 0.55 * P.run + 0.25 * sit;
    return vec3(pitch, P.turn * 0.45 + 1.6 * preen, 0.0);
  }
  if (b == B_HEAD) return vec3(0.35 * peck + 0.3 * jab * peck - 0.08 * alert + 0.5 * preen - 0.4 * P.run, P.turn * 0.5, 0.0);
  float s = (b == B_WINGL || b == B_LEGL) ? 1.0 : -1.0;
  if (b == B_WINGL || b == B_WINGR) {
    // Half open and beating when running off; drooped a little in display.
    float flap = P.run * (0.45 + 0.45 * sin(P.t * 22.0 + P.seed * 3.0));
    return vec3(0.0, 0.0, s * (0.9 * flap - 0.18 * fan));
  }
  if (b == B_LEGL || b == B_LEGR) {
    float th = P.phase + (s > 0.0 ? 0.0 : 3.1416);
    float step = -sin(th) * (0.45 * P.walk + 0.85 * P.run);
    return vec3(step - 1.25 * sit + 0.15 * up, 0.0, 0.0);
  }
  if (b == B_TAIL) return vec3(0.1 * P.run + 0.9 * fan - 0.1 * sit, 0.0, 0.0);
  // The train: lifted upright by its base, spread by each feather.
  // (running, the body tips forward: the train is held level behind)
  if (b == B_TRAIN) return vec3(-0.28 + 1.72 * fan - 0.3 * P.run + 0.1 * sit + shiver, 0.0, 0.0);
  float k = float(b - B_FAN0) - 3.0;
  return vec3(0.0, k * (0.012 + 0.4 * fan), 0.0);
}

vec3 faunaRootMove(FaunaPose P) {
  float bob = 0.012 * abs(sin(P.phase)) * P.walk + 0.03 * abs(sin(P.phase)) * P.run;
  return vec3(0.0, -0.36 * P.rest + bob, 0.0);
}
`;

export const PEAFOWL: Species = {
  name: 'peafowl',
  model,
  palettes: [
    [0x3a5634, 0x2a6658, 0x6a6a38, 0x3a7654, 0x2e6858, 0x2a5a6a, 0x6a6258, 0xe0b43a, 0x3d6ac8, 0x14100c, 0x6e665e, 0x566f2e, 0x4a6632, 0xc8a44a, 0x1f3a70, 0x3a3a2a],
    [0x4c5a3c, 0x3a5e50, 0x6a6242, 0x40664e, 0x3a6050, 0x355a5a, 0x6a6258, 0xc8a040, 0x4a6aa8, 0x14100c, 0x6e665e, 0x566f2e, 0x4a6632, 0xc8a44a, 0x1f3a70, 0x4c4632],
  ],
  glsl: GLSL,
  ease: [0.18, 0.6, 0.3, 0.35, 0.9],
  shadows: true,
};

const LOOKS: Habits['looks'] = {
  stand: { rest: 0, head: 0, act: 0 },
  look: { rest: 0, head: -1, act: 0 },
  peck: { rest: 0, head: 0, act: 1 },
  rake: { rest: 0, head: 0, act: 2 },
  scratch: { rest: 0, head: 0, act: 3 },
  sit: { rest: 1, head: 0, act: 0 },
  sleep: { rest: 1, head: 1, act: 0 },
};

/** The male: walks and pecks, looks about, preens, and now and then fans his train (`rake`). */
export const PEACOCK_HABITS: Habits = {
  walk: 0.42,
  run: 3.2,
  walkHz: 1.8,
  runHz: 4.5,
  turn: 2.8,
  alertAt: 20,
  fleeAt: 12,
  fleeTo: [12, 22],
  wander: 9,
  leash: 30,
  moves: 0.5,
  idle: [
    ['peck', 5, 4, 12],
    ['stand', 2, 2, 5],
    ['look', 2, 2, 5],
    ['rake', 1.4, 7, 14],
    ['scratch', 1, 2, 5],
  ],
  looks: LOOKS,
  night: 1,
  climb: 1.1,
};

/** The hens: the same, without the display. */
export const PEAHEN_HABITS: Habits = {
  ...PEACOCK_HABITS,
  walk: 0.45,
  idle: [
    ['peck', 6, 4, 12],
    ['stand', 2, 2, 5],
    ['look', 2, 2, 5],
    ['scratch', 1, 2, 5],
    ['sit', 0.5, 6, 14],
  ],
};
