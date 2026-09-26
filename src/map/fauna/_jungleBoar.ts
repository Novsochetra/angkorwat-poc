import { Model, type Species } from './_kit';
import type { Habits } from './_landBrain';

/**
 * Wild boar of the forest floor: a sow, dark grey-brown and bristly, heavy
 * in the shoulders with a dark mane along the back, a long wedge of a head
 * ending in the round snout; her piglets small, brown and striped along
 * the back and sides with cream.
 *
 * They root about under the trees (head down, the snout pushing into the
 * earth in quick shoves), stand and sniff, lie down to rest; when the
 * explorer comes close they look up, ears forward, then trot off with the
 * tail up, the piglets close behind. At night they lie together.
 *
 * Variants: 0 sow, 1 piglet. Act: 1 root (snout in the earth), 2 sniff.
 */

const S = { coat: 0, mane: 1, belly: 2, snout: 3, disc: 4, eye: 5, hoof: 6, ear: 7, stripe: 8 };
const PIGLET = 1 << 1;

const model = new Model()
  .bone('body', null, [0, 0.46, 0])
  .bone('head', 'body', [0, 0.56, 0.44])
  .boneLR('ear*', 'head', [0.1, 0.62, 0.54])
  .bone('tail', 'body', [0, 0.6, -0.5])
  .boneLR('fleg*', 'body', [0.12, 0.38, 0.3])
  .boneLR('hleg*', 'body', [0.12, 0.42, -0.34]);

model
  // Body: deep shoulders under a bristly mane, a narrower rump, the belly.
  .box('body', [0, 0.47, -0.06], [0.38, 0.38, 0.84], S.coat)
  .box('body', [0, 0.52, 0.26], [0.42, 0.46, 0.34], S.coat)
  .box('body', [0, 0.77, 0.14], [0.1, 0.07, 0.56], S.mane)
  .box('body', [0, 0.69, -0.2], [0.08, 0.05, 0.36], S.mane)
  .box('body', [0, 0.45, -0.46], [0.32, 0.32, 0.12], S.coat)
  .box('body', [0, 0.27, -0.02], [0.3, 0.04, 0.6], S.belly)
  // The piglet's stripes: along the back and down each side.
  .boxLR('body', [0.193, 0.56, -0.05], [0.012, 0.035, 0.84], S.stripe, PIGLET)
  .boxLR('body', [0.193, 0.45, -0.05], [0.012, 0.035, 0.8], S.stripe, PIGLET)
  .boxLR('body', [0.12, 0.667, -0.05], [0.035, 0.012, 0.8], S.stripe, PIGLET)
  .boxLR('body', [0.213, 0.58, 0.26], [0.012, 0.035, 0.3], S.stripe, PIGLET)
  // Head: a wedge down to the snout, with its pale disc, small eyes, ears.
  .box('head', [0, 0.5, 0.6], [0.3, 0.3, 0.3], S.coat)
  .box('head', [0, 0.44, 0.8], [0.2, 0.2, 0.18], S.coat)
  .box('head', [0, 0.38, 0.95], [0.14, 0.14, 0.16], S.snout)
  .box('head', [0, 0.38, 1.035], [0.13, 0.11, 0.02], S.disc)
  .box('head', [0, 0.66, 0.56], [0.09, 0.05, 0.26], S.mane)
  .boxLR('head', [0.142, 0.53, 0.72], [0.012, 0.03, 0.035], S.eye)
  .boxLR('ear*', [0.12, 0.69, 0.54], [0.08, 0.13, 0.04], S.ear)
  // Tail with a tuft.
  .box('tail', [0, 0.46, -0.53], [0.03, 0.24, 0.03], S.coat)
  .box('tail', [0, 0.33, -0.53], [0.05, 0.06, 0.05], S.mane)
  // Short legs: the thighs in the body, thin shanks, dark hooves.
  .boxLR('fleg*', [0.12, 0.2, 0.3], [0.1, 0.34, 0.11], S.coat)
  .boxLR('fleg*', [0.12, 0.025, 0.31], [0.09, 0.05, 0.11], S.hoof)
  .boxLR('hleg*', [0.12, 0.25, -0.35], [0.12, 0.3, 0.15], S.coat)
  .boxLR('hleg*', [0.12, 0.09, -0.35], [0.09, 0.14, 0.1], S.coat)
  .boxLR('hleg*', [0.12, 0.025, -0.34], [0.09, 0.05, 0.11], S.hoof);

const GLSL = /* glsl */ `
vec3 faunaBoneRot(int b, FaunaPose P) {
  float lie = P.rest;
  float up = 1.0 - lie;
  float root = clamp(1.0 - abs(P.act - 1.0), 0.0, 1.0) * up;
  float sniff = clamp(1.0 - abs(P.act - 2.0), 0.0, 1.0) * up;
  float alert = max(-P.head, 0.0) * up;
  float down = max(P.head, 0.0);
  if (b == B_BODY) return vec3(0.05 * down * up - 0.06 * alert + 0.04 * sin(P.phase * 2.0) * P.run, 0.0, 0.03 * sin(P.phase) * P.walk * up + 0.1 * lie);
  if (b == B_HEAD) {
    // Rooting: the snout shoves into the earth in quick bursts, now and then a pause.
    float shove = root * 0.14 * max(0.0, sin(P.t * 7.0 + P.seed * 9.0)) * step(-0.2, sin(P.t * 0.8 + P.seed * 5.0));
    float nose = sniff * 0.05 * sin(P.t * 11.0 + P.seed * 3.0);
    float pitch = 0.5 * down * up + 0.25 * lie - 0.3 * alert + shove + nose + 0.05 * sin(P.phase * 2.0) * P.walk + 0.1 * P.run;
    return vec3(pitch, P.turn * 0.55 * (1.0 - 0.5 * down), 0.08 * lie);
  }
  if (b == B_EARL || b == B_EARR) {
    float s = b == B_EARL ? 1.0 : -1.0;
    // Ears back running, forward alert, a flick now and then.
    return vec3(0.35 * alert - 0.4 * P.run + 0.25 * faunaTwitch(P.t, 0.3, 0.3, P.seed + s), 0.0, s * (0.35 - 0.3 * alert));
  }
  // Tail: straight up trotting off, a swish at rest.
  if (b == B_TAIL) return vec3(0.2 + 2.3 * P.run, 0.35 * sin(P.t * 4.1 + P.seed * 7.0) * up, 0.0);
  bool left = b == B_FLEGL || b == B_HLEGL;
  bool hind = b == B_HLEGL || b == B_HLEGR;
  // A trot: diagonal pairs together.
  float off = hind ? (left ? 0.5 : 0.0) : (left ? 0.0 : 0.5);
  float th = P.phase + 6.2832 * off;
  float swing = -sin(th) * (0.4 * P.walk + 0.75 * P.run) * up;
  // Lying down: the front legs folded back under the chest, the hind ones forward.
  return vec3(swing + (hind ? -1.35 : 1.35) * lie, 0.0, 0.0);
}

vec3 faunaRootMove(FaunaPose P) {
  float bob = 0.01 * sin(P.phase * 2.0) * P.walk + 0.035 * abs(sin(P.phase)) * P.run;
  return vec3(0.0, -0.27 * P.rest + bob * (1.0 - P.rest), 0.0);
}
`;

export const BOAR: Species = {
  name: 'boar',
  model,
  palettes: [
    [0x4a3f36, 0x2a221e, 0x5a4c40, 0x342b26, 0x735a52, 0x0c0908, 0x1c1714, 0x3a3029, 0xd8c9a0],
    [0x7a5636, 0x4f3622, 0x8e6a48, 0x5a4030, 0x8a6a60, 0x0c0908, 0x2e2018, 0x684a30, 0xdcc696],
  ],
  glsl: GLSL,
  ease: [0.2, 0.9, 0.35, 0.4, 0.3],
  shadows: true,
};

/** The sow: roots about under the trees, rests; trots off a good way when the explorer comes close. */
export const SOW_HABITS: Habits = {
  walk: 0.5,
  run: 2.6,
  walkHz: 1.5,
  runHz: 2.6,
  turn: 2.4,
  alertAt: 16,
  fleeAt: 10,
  fleeTo: [16, 26],
  wander: 9,
  leash: 40,
  moves: 0.45,
  idle: [
    ['graze', 6, 6, 16],
    ['eat', 2, 3, 8],
    ['stand', 1, 2, 5],
    ['look', 1, 2, 4],
    ['lie', 1, 15, 35],
  ],
  looks: {
    stand: { rest: 0, head: 0, act: 0 },
    look: { rest: 0, head: -0.4, act: 0 },
    graze: { rest: 0, head: 1, act: 1 },
    eat: { rest: 0, head: 0.5, act: 2 },
    lie: { rest: 1, head: 0.2, act: 0 },
    sleep: { rest: 1, head: 0.5, act: 0 },
  },
  night: 1,
  climb: 1.1,
};

/** Her piglets: root beside her in a small circle (jungle.ts keeps their home on her), scamper after her. */
export const PIGLET_HABITS: Habits = {
  walk: 0.7,
  run: 2.9,
  walkHz: 1.5,
  runHz: 2.6,
  turn: 4,
  alertAt: 12,
  fleeAt: 7,
  fleeTo: [12, 20],
  wander: 2.6,
  leash: 60,
  moves: 0.7,
  idle: [
    ['graze', 5, 3, 9],
    ['eat', 2, 2, 5],
    ['stand', 1, 1, 3],
    ['look', 1, 1, 3],
    ['lie', 1, 8, 20],
  ],
  looks: SOW_HABITS.looks,
  night: 1,
  climb: 1.1,
};
