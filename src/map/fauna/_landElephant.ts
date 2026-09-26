import { Model, type Species } from './_kit';

/**
 * Asian elephant: 2.7 m at the shoulder, the back arched highest in the
 * middle, a twin-domed head, smaller ears than the African one with pink
 * mottled edges, pink freckles round the trunk's root; grey with dusty
 * reddish feet. The calf is the same model at a bit under half the size.
 *
 * They walk slowly, legs swinging in a lateral walk (hind foot, then the
 * fore foot of the same side), the body rolling, the trunk swinging; they
 * stop to flap the ears, swing and curl the trunk. Asleep they stand still
 * with the head and trunk low. Head up and trunk raised: a trumpet.
 *
 * Bathing in the river (_landBath.ts) the trunk dips into the water and
 * sprays it back over the head and the back; the calf lies down on its
 * side in the shallows and kicks.
 *
 * Variants: 0 cow, 1 calf. Act: 1 trunk up to the mouth, 2 trunk raised
 * high, 3 trunk curled back over the head (spraying), −1 trunk down in the
 * water (drinking it up). Rest: 1 dozing, 2 lying on its side.
 */

const S = { skin: 0, belly: 1, pink: 2, edge: 3, eye: 4, nail: 5, dark: 6, foot: 7 };

const model = new Model()
  .bone('body', null, [0, 1.9, 0])
  .bone('head', 'body', [0, 2.35, 1.15])
  .boneLR('ear*', 'head', [0.56, 2.3, 1.62])
  .bone('trunk1', 'head', [0, 1.95, 2.02])
  .bone('trunk2', 'trunk1', [0, 1.36, 2.04])
  .bone('trunk3', 'trunk2', [0, 0.8, 2.05])
  .bone('tail', 'body', [0, 2.35, -1.45])
  .boneLR('fleg*', 'body', [0.45, 1.5, 0.72])
  .boneLR('fshin*', 'fleg*', [0.45, 0.72, 0.74])
  .boneLR('hleg*', 'body', [0.45, 1.55, -0.9])
  .boneLR('hshin*', 'hleg*', [0.45, 0.72, -0.95]);

model
  // Body: barrel, arched back, belly, rump and chest.
  .box('body', [0, 1.95, -0.1], [1.5, 1.5, 2.6], S.skin)
  .box('body', [0, 2.76, -0.15], [1.2, 0.14, 1.9], S.skin)
  .box('body', [0, 2.86, -0.1], [0.7, 0.08, 1.0], S.skin)
  .box('body', [0, 1.15, -0.05], [1.3, 0.12, 1.9], S.belly)
  .box('body', [0, 1.9, -1.46], [1.25, 1.2, 0.16], S.skin)
  .box('body', [0, 1.9, 1.24], [1.3, 1.2, 0.1], S.skin)
  // Head: tall skull with two domes, the face, pink freckles, lower lip, eyes.
  .box('head', [0, 2.35, 1.62], [1.1, 1.15, 0.85], S.skin)
  .boxLR('head', [0.24, 2.98, 1.62], [0.42, 0.14, 0.55], S.skin)
  .box('head', [0, 2.25, 2.08], [0.72, 0.65, 0.08], S.skin)
  .boxLR('head', [0.24, 2.02, 2.1], [0.22, 0.26, 0.08], S.pink)
  .box('head', [0, 1.72, 1.92], [0.32, 0.12, 0.2], S.dark)
  .boxLR('head', [0.555, 2.32, 1.86], [0.02, 0.07, 0.1], S.eye)
  // Ears: flat plates at the head's sides, pink along the rim.
  .boxLR('ear*', [0.62, 2.25, 1.24], [0.1, 1.0, 0.8], S.skin)
  .boxLR('ear*', [0.625, 1.79, 1.28], [0.1, 0.1, 0.66], S.edge)
  .boxLR('ear*', [0.625, 2.22, 0.87], [0.1, 0.84, 0.07], S.edge)
  // Trunk in three joints, freckled at the root.
  .box('trunk1', [0, 1.66, 2.04], [0.36, 0.62, 0.34], S.skin)
  .box('trunk1', [0, 1.78, 2.215], [0.28, 0.3, 0.01], S.pink)
  .box('trunk2', [0, 1.07, 2.05], [0.28, 0.58, 0.27], S.skin)
  .box('trunk3', [0, 0.55, 2.05], [0.22, 0.52, 0.22], S.skin)
  .box('trunk3', [0, 0.27, 2.07], [0.24, 0.08, 0.26], S.skin)
  // Tail with a dark tuft.
  .box('tail', [0, 1.8, -1.5], [0.1, 1.1, 0.1], S.skin)
  .box('tail', [0, 1.2, -1.5], [0.14, 0.18, 0.14], S.dark)
  // Pillar legs, dusty feet, pale toenails.
  .boxLR('fleg*', [0.45, 1.1, 0.72], [0.5, 0.82, 0.52], S.skin)
  .boxLR('fshin*', [0.45, 0.4, 0.74], [0.46, 0.66, 0.48], S.skin)
  .boxLR('fshin*', [0.45, 0.07, 0.74], [0.5, 0.14, 0.52], S.foot)
  .boxLR('fshin*', [0.45, 0.06, 1.0], [0.36, 0.1, 0.02], S.nail)
  .boxLR('hleg*', [0.45, 1.13, -0.9], [0.52, 0.86, 0.56], S.skin)
  .boxLR('hshin*', [0.45, 0.4, -0.95], [0.46, 0.66, 0.48], S.skin)
  .boxLR('hshin*', [0.45, 0.07, -0.95], [0.5, 0.14, 0.52], S.foot)
  .boxLR('hshin*', [0.45, 0.06, -0.71], [0.36, 0.1, 0.02], S.nail);

const GLSL = /* glsl */ `
vec3 faunaBoneRot(int b, FaunaPose P) {
  // (rest 1‥2: from dozing to lying on its side)
  float lie = clamp(P.rest - 1.0, 0.0, 1.0);
  float doze = clamp(P.rest, 0.0, 1.0) * (1.0 - lie);
  float awake = 1.0 - doze;
  float mouth = clamp(1.0 - abs(P.act - 1.0), 0.0, 1.0);
  float raise = clamp(1.0 - abs(P.act - 2.0), 0.0, 1.0);
  float spray = clamp(P.act - 2.0, 0.0, 1.0);
  float dip = clamp(-P.act, 0.0, 1.0);
  float mv = P.walk + P.run;
  // Lying: rolled onto its right side (the left up).
  if (b == B_BODY) return vec3(0.0, 0.0, 0.035 * sin(P.phase) * mv + 1.3 * lie);
  if (b == B_HEAD) {
    float nod = 0.035 * sin(P.phase * 2.0 + 0.6) * mv + 0.12 * P.head + 0.12 * doze - 0.2 * raise - 0.3 * spray + 0.32 * dip;
    return vec3(nod - 0.15 * lie, P.turn * 0.35 + 0.2 * sin(P.t * 1.3 + P.seed * 5.0) * lie, 0.02 * sin(P.phase) * mv);
  }
  if (b == B_EARL || b == B_EARR) {
    // Flapping in bouts (fanning), wide open when alarmed; still asleep.
    float s = b == B_EARL ? 1.0 : -1.0;
    float bout = smoothstep(0.2, 0.7, sin(P.t * 0.21 + P.seed * 5.0) * 0.5 + 0.5);
    float flap = (0.5 + 0.5 * sin(P.t * 2.3 + P.seed * 9.0 + s * 0.4)) * bout * awake;
    return vec3(0.0, -s * (0.1 + 0.75 * flap + 1.0 * raise + 0.35 * spray), 0.0);
  }
  if (b == B_TRUNK1 || b == B_TRUNK2 || b == B_TRUNK3) {
    // Swinging with the steps and idly; the tip curls forward; up to the mouth, or raised high.
    float k = b == B_TRUNK1 ? 0.0 : (b == B_TRUNK2 ? 1.0 : 2.0);
    float idle = sin(P.t * 0.7 + P.seed * 7.0 - k * 0.5) * 0.08 * awake;
    float sway = sin(P.phase - k * 0.4) * 0.12 * mv;
    float curl = (k == 0.0 ? -0.05 : (k == 1.0 ? -0.15 : -0.4)) * awake;
    float feed = mouth * (k == 0.0 ? -0.35 : (k == 1.0 ? -1.0 : -1.4));
    float up = raise * (k == 0.0 ? -1.3 : (k == 1.0 ? -0.9 : -0.8));
    // Spraying: up and curled back over the head; dipping: straight down into the water, swinging a little.
    float back = spray * (k == 0.0 ? -1.6 : (k == 1.0 ? -1.4 : -1.2));
    float down = dip * (k == 0.0 ? 0.08 : (k == 1.0 ? 0.2 : 0.42));
    float wave = 0.25 * sin(P.t * 2.1 + P.seed * 3.0 - k * 0.7) * lie;
    return vec3(curl + feed + up + back + down + wave + 0.04 * sin(P.phase * 2.0 - k) * mv, sway + idle + 0.08 * sin(P.t * 1.7 - k) * dip, 0.0);
  }
  if (b == B_TAIL) return vec3(0.05, 0.25 * sin(P.t * 1.1 + P.seed * 4.0) * awake, 0.0);
  bool left = b == B_FLEGL || b == B_FSHINL || b == B_HLEGL || b == B_HSHINL;
  bool hind = b == B_HLEGL || b == B_HLEGR || b == B_HSHINL || b == B_HSHINR;
  bool upper = b == B_FLEGL || b == B_FLEGR || b == B_HLEGL || b == B_HLEGR;
  // Lateral walk: left hind, left fore, right hind, right fore.
  float off = hind ? (left ? 0.0 : 0.5) : (left ? 0.2 : 0.7);
  float th = P.phase + 6.2832 * off;
  float swing = -sin(th) * (0.26 * P.walk + 0.45 * P.run);
  float bend = max(0.0, cos(th)) * (0.45 * P.walk + 0.7 * P.run);
  // Lying: the legs stretched out, kicking the water now and then.
  float kick = lie * (0.3 + 0.35 * sin(P.t * 2.6 + P.seed * 7.0 + off * 6.2832)) * (0.5 + 0.5 * sin(P.t * 0.45 + P.seed * 3.0));
  if (upper) return vec3(swing + (hind ? -0.35 : 0.35) * kick, 0.0, 0.0);
  return vec3((hind ? -0.6 * bend : bend) + 0.2 * kick, 0.0, 0.0);
}

vec3 faunaRootMove(FaunaPose P) {
  float lie = clamp(P.rest - 1.0, 0.0, 1.0);
  float doze = clamp(P.rest, 0.0, 1.0) * (1.0 - lie);
  // (lying on its side: the body's middle down near the ground, a little to the right)
  return vec3(-0.35 * lie, 0.035 * sin(P.phase * 2.0) * (P.walk + P.run) - 0.04 * doze - 1.25 * lie, 0.0);
}
`;

export const ELEPHANT: Species = {
  name: 'elephant',
  model,
  palettes: [
    [0x6e6862, 0x5a5550, 0xc49a8c, 0xb08c80, 0x151110, 0xd4cab8, 0x2c2724, 0x7a6556],
    [0x79716b, 0x645e59, 0xb99488, 0x9c8078, 0x151110, 0xd4cab8, 0x2c2724, 0x806a5a],
  ],
  glsl: GLSL,
  ease: [0.8, 2.5, 1.2, 1.5, 0.9],
  shadows: true,
};
