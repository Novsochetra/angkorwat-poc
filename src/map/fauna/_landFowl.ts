import { Model, type Species } from './_kit';
import type { Habits } from './_landBrain';

/**
 * Red junglefowl, the wild chicken of the forest edges: the rooster flame
 * orange on the neck and saddle, dark red wings, a green-black breast and a
 * tall arched sickle tail, red comb and wattles, a white ear patch; hens
 * small and brown with a short tail.
 *
 * They walk with the head bobbing, peck at the ground, scratch with a foot,
 * stretch up to look, and scurry off low and fast with the wings half open.
 * They sleep sitting down, the head turned back into the feathers.
 *
 * Variants: 0 rooster, 1 hen. Act: 1 peck, 2 scratch the ground.
 */

const S = { back: 0, breast: 1, saddle: 2, hackle: 3, beak: 4, comb: 5, white: 6, eye: 7, wing: 8, tail: 9, leg: 10 };
const ROOSTER = 1 << 0;
const HEN = 1 << 1;

const model = new Model()
  .bone('body', null, [0, 0.28, 0])
  .bone('head', 'body', [0, 0.34, 0.1])
  .bone('tail', 'body', [0, 0.33, -0.12])
  .boneLR('wing*', 'body', [0.08, 0.34, 0.06])
  .boneLR('leg*', 'body', [0.045, 0.21, 0.01]);

model
  // Body, breast and saddle.
  .box('body', [0, 0.28, 0], [0.15, 0.15, 0.26], S.back)
  .box('body', [0, 0.26, 0.1], [0.14, 0.13, 0.1], S.breast)
  .box('body', [0, 0.36, -0.04], [0.13, 0.03, 0.18], S.saddle)
  // Neck hackles, head, beak, eyes; comb, wattles and ear patch.
  .box('head', [0, 0.4, 0.13], [0.075, 0.13, 0.075], S.hackle)
  .box('head', [0, 0.48, 0.16], [0.065, 0.065, 0.085], S.hackle)
  .box('head', [0, 0.475, 0.215], [0.028, 0.022, 0.04], S.beak)
  .boxLR('head', [0.034, 0.49, 0.175], [0.004, 0.012, 0.012], S.eye)
  .box('head', [0, 0.535, 0.16], [0.018, 0.05, 0.08], S.comb, ROOSTER)
  .box('head', [0, 0.44, 0.19], [0.02, 0.045, 0.02], S.comb, ROOSTER)
  .boxLR('head', [0.034, 0.47, 0.145], [0.004, 0.025, 0.025], S.white, ROOSTER)
  .box('head', [0, 0.52, 0.17], [0.015, 0.02, 0.04], S.comb, HEN)
  // Folded wings.
  .boxLR('wing*', [0.082, 0.29, -0.01], [0.02, 0.1, 0.19], S.wing)
  // Rooster: tail coverts and the sickle feathers' arch. Hen: a short tail.
  .box('tail', [0, 0.38, -0.16], [0.05, 0.08, 0.05], S.tail, ROOSTER)
  .box('tail', [0, 0.44, -0.17], [0.035, 0.18, 0.06], S.tail, ROOSTER)
  .box('tail', [0, 0.52, -0.24], [0.035, 0.05, 0.12], S.tail, ROOSTER)
  .box('tail', [0, 0.46, -0.31], [0.035, 0.12, 0.05], S.tail, ROOSTER)
  .box('tail', [0, 0.38, -0.335], [0.03, 0.07, 0.04], S.tail, ROOSTER)
  .box('tail', [0, 0.37, -0.16], [0.06, 0.09, 0.06], S.tail, HEN)
  .box('tail', [0, 0.41, -0.19], [0.05, 0.05, 0.04], S.tail, HEN)
  // Legs: feathered thigh, bare shank, toes.
  .boxLR('leg*', [0.045, 0.19, 0.01], [0.05, 0.06, 0.06], S.breast)
  .boxLR('leg*', [0.045, 0.085, 0.02], [0.02, 0.15, 0.02], S.leg)
  .boxLR('leg*', [0.045, 0.008, 0.04], [0.04, 0.016, 0.07], S.leg)
  .boxLR('leg*', [0.045, 0.008, -0.005], [0.015, 0.016, 0.03], S.leg);

const GLSL = /* glsl */ `
vec3 faunaBoneRot(int b, FaunaPose P) {
  float sit = P.rest;
  float up = 1.0 - sit;
  float peck = clamp(1.0 - abs(P.act - 1.0), 0.0, 1.0) * up;
  float scratch = clamp(1.0 - abs(P.act - 2.0), 0.0, 1.0) * up;
  float alert = max(-P.head, 0.0);
  float tuck = max(P.head, 0.0) * sit;
  // Quick jabs at the ground, a few a second, now and then a pause.
  float jab = pow(max(0.0, sin(P.t * 5.5 + P.seed * 20.0)), 4.0) * step(0.3, sin(P.t * 0.9 + P.seed * 7.0) + 0.6);
  if (b == B_BODY) return vec3(-0.22 * up - 0.12 * alert + 0.3 * P.run + 0.25 * peck + 0.08 * scratch - 0.1 * sit, 0.0, 0.05 * sin(P.phase) * P.walk);
  if (b == B_HEAD) {
    // Head bobs with the steps; jabs down to peck; asleep: turned back into the feathers.
    float bob = -0.25 * sin(P.phase * 2.0) * P.walk;
    float pitch = 0.22 * up - 0.2 * alert + 0.1 * P.run + bob + (0.5 + 0.9 * jab) * peck + 0.3 * scratch + 0.4 * tuck;
    return vec3(pitch, P.turn * 0.9 * (1.0 - tuck) + 2.5 * tuck, 0.0);
  }
  if (b == B_TAIL) return vec3(0.1 * P.run - 0.12 * sit, 0.06 * sin(P.t * 1.3 + P.seed * 9.0), 0.0);
  float s = (b == B_WINGL || b == B_LEGL) ? 1.0 : -1.0;
  if (b == B_WINGL || b == B_WINGR) {
    // Half open and beating while running away.
    float flap = P.run * (0.5 + 0.5 * sin(P.t * 26.0 + P.seed * 3.0));
    return vec3(0.0, 0.0, s * (0.9 * flap + 0.12 * faunaTwitch(P.t, 0.2, 0.3, P.seed)));
  }
  // Legs: alternate steps; one foot rakes the ground back when scratching; folded away sitting.
  float th = P.phase + (s > 0.0 ? 0.0 : 3.1416);
  float step = -sin(th) * (0.5 * P.walk + 0.9 * P.run);
  float rake = s > 0.0 ? scratch * (0.2 + 0.7 * max(0.0, sin(P.t * 7.0 + P.seed * 4.0))) : 0.0;
  return vec3(step + rake - 1.2 * sit + 0.22 * up, 0.0, 0.0);
}

vec3 faunaRootMove(FaunaPose P) {
  float bob = 0.012 * abs(sin(P.phase)) * P.walk + 0.03 * abs(sin(P.phase)) * P.run;
  return vec3(0.0, -0.17 * P.rest + bob, 0.0);
}
`;

export const FOWL: Species = {
  name: 'junglefowl',
  model,
  palettes: [
    [0x7a2a16, 0x1c2622, 0xd36a1f, 0xe08a2a, 0x8a7c6c, 0xc42118, 0xeae4da, 0x2a1a10, 0x6e2814, 0x152420, 0x5f6060],
    [0x7a5a3a, 0x8e6b48, 0x7f5d3b, 0xa27a44, 0x8a7c6c, 0xa3362a, 0xa27a44, 0x2a1a10, 0x6b4c31, 0x4b3624, 0x5f6060],
  ],
  glsl: GLSL,
  ease: [0.15, 0.5, 0.25, 0.3, 0.25],
};

/** A rooster and his hens by the road and the ruins: peck, rake, look up; scurry off a few metres. */
export const FOWL_HABITS: Habits = {
  walk: 0.45,
  run: 3.2,
  walkHz: 2.4,
  runHz: 6,
  turn: 5,
  alertAt: 8,
  fleeAt: 5,
  fleeTo: [5, 10],
  wander: 6,
  leash: 20,
  moves: 0.55,
  idle: [
    ['peck', 5, 3, 10],
    ['rake', 2, 2, 5],
    ['stand', 1, 1, 3],
    ['look', 1, 1, 3],
    ['sit', 1, 10, 20],
  ],
  looks: {
    stand: { rest: 0, head: 0, act: 0 },
    look: { rest: 0, head: -1, act: 0 },
    peck: { rest: 0, head: 0, act: 1 },
    rake: { rest: 0, head: 0, act: 2 },
    sit: { rest: 1, head: 0, act: 0 },
    sleep: { rest: 1, head: 1, act: 0 },
  },
  night: 1,
  climb: 1.1,
};
