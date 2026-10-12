import { Model, type Species } from '../fauna/_kit';

/**
 * The white Khmer ox (a zebu of the villages, `ko`) that pulls the ox cart
 * (`_sceneCart.ts`), in the land animals' style (fauna/_kit.ts: boxes on
 * bones, posed in the vertex shader; built from the water buffalo,
 * fauna/_landBuffalo.ts): a lean white body on long legs, a hump over the
 * shoulders, a dewlap hanging under the throat, a long narrow face with a
 * greyish-pink muzzle, short horns up, the ears drooping, a long tail with
 * a dark switch; a red collar with a bronze bell under the neck.
 *
 * Model space: standing, facing +z, feet on y = 0, +x its left; about
 * 1.35 m at the hump, 2.2 m from nose to rump (drawn at the people's
 * scale). Channels (`CH`): gait (walk; past 1 a trot, as one he rides
 * goes when urged on: roam/_cowRide.ts), rest (lying down: the legs
 * folded under, the body on the ground), head (0 level, 1 down: pulling,
 * a little lower; −1 up), turn (look aside), act (a shake of the head,
 * the bell swinging). One he rides is posed on the CPU too, with the same
 * numbers (`_oxRide.ts` `oxPoint`).
 */

const S = { skin: 0, shade: 1, belly: 2, muzzle: 3, dark: 4, horn: 5, tip: 6, eye: 7, hoof: 8, bell: 9, collar: 10 };

const model = new Model()
  .bone('body', null, [0, 1.0, 0])
  .bone('neck', 'body', [0, 1.15, 0.72])
  .bone('head', 'neck', [0, 1.12, 1.02])
  .boneLR('ear*', 'head', [0.13, 1.18, 1.1])
  .bone('bell', 'neck', [0, 0.92, 0.98])
  .bone('tail', 'body', [0, 1.28, -0.82])
  .boneLR('fleg*', 'body', [0.2, 0.84, 0.56])
  .boneLR('fshin*', 'fleg*', [0.2, 0.42, 0.56])
  .boneLR('hleg*', 'body', [0.2, 0.88, -0.6])
  .boneLR('hshin*', 'hleg*', [0.2, 0.42, -0.64]);

model
  // Lean barrel, the hump over the shoulders, the rump, a pale belly.
  .box('body', [0, 1.02, -0.05], [0.6, 0.56, 1.55], S.skin)
  .box('body', [0, 1.07, 0.52], [0.62, 0.52, 0.42], S.skin)
  .box('body', [0, 1.4, 0.5], [0.34, 0.26, 0.38], S.shade)
  .box('body', [0, 1.3, 0.42], [0.44, 0.1, 0.5], S.skin)
  .box('body', [0, 1.06, -0.8], [0.54, 0.5, 0.16], S.skin)
  .box('body', [0, 0.72, -0.05], [0.5, 0.06, 1.1], S.belly)
  // Neck, the dewlap hanging under it, the red collar.
  .box('neck', [0, 1.12, 0.9], [0.36, 0.4, 0.4], S.skin)
  .box('neck', [0, 0.84, 0.88], [0.1, 0.28, 0.48], S.shade)
  .box('neck', [0, 1.12, 1.0], [0.38, 0.42, 0.06], S.collar)
  // Long narrow face, the muzzle and nostrils, eyes, a pale poll.
  .box('head', [0, 1.1, 1.28], [0.3, 0.3, 0.44], S.skin)
  .box('head', [0, 1.02, 1.5], [0.24, 0.22, 0.2], S.skin)
  .box('head', [0, 0.97, 1.62], [0.25, 0.2, 0.1], S.muzzle)
  .box('head', [0, 0.95, 1.672], [0.18, 0.08, 0.012], S.dark)
  .boxLR('head', [0.155, 1.17, 1.3], [0.01, 0.045, 0.06], S.eye)
  .box('head', [0, 1.27, 1.18], [0.26, 0.05, 0.16], S.belly)
  // Short horns, up and a little out.
  .boxLR('head', [0.1, 1.33, 1.14], [0.07, 0.12, 0.07], S.horn)
  .boxLR('head', [0.12, 1.43, 1.13], [0.05, 0.1, 0.05], S.tip)
  // Ears, drooping out and down.
  .boxLR('ear*', [0.22, 1.13, 1.1], [0.16, 0.06, 0.1], S.shade)
  // The bell on its cord.
  .box('bell', [0, 0.84, 1.0], [0.1, 0.12, 0.1], S.bell)
  .box('bell', [0, 0.77, 1.0], [0.12, 0.03, 0.12], S.bell)
  // Long tail with a dark switch.
  .box('tail', [0, 0.95, -0.85], [0.05, 0.62, 0.05], S.skin)
  .box('tail', [0, 0.58, -0.85], [0.09, 0.16, 0.09], S.dark)
  // Long legs: white, a little grey below; dark hooves.
  .boxLR('fleg*', [0.2, 0.64, 0.56], [0.15, 0.4, 0.17], S.skin)
  .boxLR('fshin*', [0.2, 0.22, 0.56], [0.1, 0.4, 0.1], S.shade)
  .boxLR('fshin*', [0.2, 0.03, 0.58], [0.12, 0.06, 0.13], S.hoof)
  .boxLR('hleg*', [0.2, 0.68, -0.6], [0.17, 0.42, 0.22], S.skin)
  .boxLR('hshin*', [0.2, 0.22, -0.64], [0.1, 0.4, 0.1], S.shade)
  .boxLR('hshin*', [0.2, 0.03, -0.62], [0.12, 0.06, 0.13], S.hoof);

/**
 * The walk's and the trot's rocking (radians, model units), and lying down: `_oxRide.ts` `oxPoint` mirrors the
 * shader with the same numbers. The trot (gait past 1: `P.run`) is the ride's only (roam/_cowRide.ts): a longer,
 * quicker stride, the legs in diagonal pairs, a bounce.
 */
export const OX_ROCK = { roll: 0.03, nod: 0.06, lift: 0.02, trotRoll: 0.015, trotNod: 0.07, trotLift: 0.05, trotPitch: 0.025 };
/** Lying: how far the body comes down (model units), and the legs folded (radians: upper leg, shin; front, hind). */
export const OX_LIE = { drop: 0.6, front: [-1.25, 2.6], hind: [-1.3, 2.55] } as const;
const n = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(5)));

const GLSL = /* glsl */ `
vec3 faunaBoneRot(int b, FaunaPose P) {
  float down = max(P.head, 0.0);
  float up = max(-P.head, 0.0);
  float lie = P.rest;
  float stand = 1.0 - lie;
  // (walking: the head nods with the steps, the hump and barrel sway; a trot nods and pitches more)
  float nod = (${n(OX_ROCK.nod)} * P.walk + ${n(OX_ROCK.trotNod)} * P.run) * sin(P.phase * 2.0);
  float shake = P.act * sin(P.t * 9.0) * 0.25;
  if (b == B_BODY) return vec3(${n(OX_ROCK.trotPitch)} * P.run * sin(P.phase * 2.0 + 1.0), 0.0, (${n(OX_ROCK.roll)} * P.walk + ${n(OX_ROCK.trotRoll)} * P.run) * sin(P.phase));
  if (b == B_NECK) return vec3(0.25 * down - 0.15 * up + nod, 0.2 * P.turn, 0.0);
  if (b == B_HEAD) {
    float chew = 0.025 * sin(P.t * 3.5 + P.seed * 11.0) * (1.0 - P.walk);
    return vec3(0.15 * down - 0.1 * up + chew + 0.5 * nod, P.turn * 0.6 + shake, 0.05 * P.turn);
  }
  if (b == B_EARL || b == B_EARR) {
    float s = b == B_EARL ? 1.0 : -1.0;
    return vec3(0.0, s * 0.35 * faunaTwitch(P.t, 0.5, 0.3, P.seed + s * 0.31), s * -0.35);
  }
  // (the bell swings with the steps and the head)
  float mv = P.walk + P.run;
  if (b == B_BELL) return vec3(0.35 * sin(P.phase * 2.0 + 0.8) * mv + 0.5 * shake, 0.0, 0.15 * sin(P.phase) * mv);
  if (b == B_TAIL) {
    float bout = smoothstep(0.1, 0.6, sin(P.t * 0.27 + P.seed * 8.0));
    return vec3(0.08 + 0.25 * P.run, 0.4 * sin(P.t * 2.3 + P.seed * 5.0) * (0.2 + 0.8 * bout), 0.0);
  }
  bool left = b == B_FLEGL || b == B_FSHINL || b == B_HLEGL || b == B_HSHINL;
  bool hind = b == B_HLEGL || b == B_HLEGR || b == B_HSHINL || b == B_HSHINR;
  bool upper = b == B_FLEGL || b == B_FLEGR || b == B_HLEGL || b == B_HLEGR;
  // (a walk steps one leg after another; trotting, the front legs come round a quarter: diagonal pairs together)
  float off = hind ? (left ? 0.0 : 0.5) : (left ? 0.25 : 0.75) + 0.25 * P.run;
  float th = P.phase + 6.2832 * off;
  float swing = -sin(th) * (0.32 * P.walk + 0.42 * P.run) * stand;
  float bend = max(0.0, cos(th)) * (0.6 * P.walk + 0.85 * P.run) * stand;
  // Lying: the upper legs forward, the shins folded back under it.
  if (upper) return vec3(swing + (hind ? ${n(OX_LIE.hind[0])} : ${n(OX_LIE.front[0])}) * lie, 0.0, 0.0);
  return vec3(bend + (hind ? ${n(OX_LIE.hind[1])} : ${n(OX_LIE.front[1])}) * lie, 0.0, 0.0);
}

vec3 faunaRootMove(FaunaPose P) {
  return vec3(0.0, -${n(OX_LIE.drop)} * P.rest + (${n(OX_ROCK.lift)} * P.walk + ${n(OX_ROCK.trotLift)} * P.run) * sin(P.phase * 2.0) * (1.0 - P.rest), 0.0);
}
`;

export const OX: Species = {
  name: 'ox',
  model,
  palettes: [
    [0xece6da, 0xd6cebf, 0xf4f0e6, 0x9a8580, 0x2e2826, 0x9a8a6a, 0x4a4034, 0x100d0c, 0x2a2624, 0xc39a48, 0xa02a22],
    [0xe2dccc, 0xc8bfae, 0xeee8da, 0x8a7872, 0x2e2826, 0x8a7a5c, 0x3e3830, 0x100d0c, 0x2a2624, 0xb88c3c, 0x2a4a8a],
  ],
  glsl: GLSL,
  ease: [0.6, 1.2, 0.8, 1.0, 0.4],
  shadows: true,
};

/** Hump height (m, model): where the yoke sits in front of it. */
export const OX_YOKE: [number, number] = [1.3, 0.78];
