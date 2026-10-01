import { Euler, Matrix4, MeshDepthMaterial, MeshStandardMaterial, Quaternion, Vector3, Vector4, type InstancedMesh, type WebGLProgramParametersWithUniforms } from 'three';
import { CH, Flock, Model, type Species, type V3 } from '../fauna/_kit';

/**
 * The village dog that becomes his friend (roam/_dog.ts): a Khmer village dog
 * (ឆ្កែស្រុក), lean and short-haired, tan with a cream muzzle, chest, belly
 * and socks, a darker saddle, pricked pointed ears and a tail curled up over
 * its back. The colours are the villages' sleeping dogs' (village/_kit.ts
 * `dog`: fur 0xc49a62, shade 0x9a7446).
 *
 * Built on the map animals' kit (fauna/_kit.ts): boxes on bones, one
 * InstancedMesh of one animal (one draw, and one for its shadow), posed in
 * the vertex shader. The kit's eased channels carry the gait and its step
 * phase (0 still, 1 walk, 2 trot, 3 gallop), how it rests (0 standing, 1
 * sitting, 2 lying, 3 flat out on its side asleep), the head (−1 up, alert ‥
 * 1 down: sniffing, the chin on its paws) and its turn (−1 right ‥ 1 left).
 * Its moods, quicker than a channel's ease, are three uniforms the add-on
 * eases on the CPU every frame (`DogLook`): the tail's wag (how much, and its
 * phase), panting, the eyes shut, the ears (back ‥ pricked), leaning into a
 * hand, a bark, a tilt of the head, the hind leg's thump while its ears are
 * scratched, sniffing, a leap up or down a step, and the hand's pat. Its
 * blinks and breaths come from the shader's clock. A dissolve (`fade`) lets
 * it come and go softly (a dither, its shadow too).
 *
 * Model units are metres of a real dog (0.46 m at the shoulder), facing +z,
 * its left +x; the add-on draws it `DOG_SCALE` times that, beside the
 * explorer drawn 1.4 times his size. `dogPoint` mirrors the shader's head on
 * the CPU (where his hand pats it).
 */

/** Drawn this many times a real dog's size (the explorer and the people are drawn 1.4 times theirs, with short legs). */
export const DOG_SCALE = 1.2;

const S = { fur: 0, cream: 1, dark: 2, nose: 3, eye: 4, lid: 5, inner: 6, tongue: 7, mouth: 8 };

/** The hips: the body's root (it sits back on them). */
const HIP: V3 = [0, 0.37, -0.2];

const model = new Model()
  .bone('body', null, HIP)
  .bone('neck', 'body', [0, 0.42, 0.2])
  .bone('head', 'neck', [0, 0.53, 0.3])
  .bone('jaw', 'head', [0, 0.532, 0.415])
  .bone('tongue', 'jaw', [0, 0.53, 0.43])
  .boneLR('ear*', 'head', [0.052, 0.652, 0.345])
  // (eyes and lids turn about a point a metre over the head: a small turn slides them into the skull, the open eye
  // in and the shut lid out, or the other way)
  .boneLR('eye*', 'head', [0, 1.6, 0.42])
  .boneLR('lid*', 'head', [0, 1.6, 0.42])
  .boneLR('fleg*', 'body', [0.065, 0.32, 0.17])
  .boneLR('fshin*', 'fleg*', [0.065, 0.16, 0.17])
  .boneLR('hleg*', 'body', [0.07, 0.35, -0.21])
  .boneLR('hshin*', 'hleg*', [0.07, 0.19, -0.24])
  .bone('tail1', 'body', [0, 0.43, -0.285])
  .bone('tail2', 'tail1', [0, 0.55, -0.285])
  .bone('tail3', 'tail2', [0, 0.64, -0.285]);

model
  // Chest and its cream brisket, the ribs and the cream belly, the hips, the darker saddle along the back.
  .box('body', [0, 0.365, 0.13], [0.18, 0.2, 0.2], S.fur)
  .box('body', [0, 0.262, 0.15], [0.13, 0.05, 0.14], S.cream)
  .box('body', [0, 0.375, -0.05], [0.17, 0.17, 0.2], S.fur)
  .box('body', [0, 0.287, -0.05], [0.12, 0.02, 0.18], S.cream)
  .box('body', [0, 0.38, -0.215], [0.17, 0.17, 0.15], S.fur)
  .box('body', [0, 0.4605, -0.04], [0.12, 0.012, 0.34], S.dark)
  // Neck, the cream throat.
  .box('neck', [0, 0.465, 0.245], [0.115, 0.15, 0.12], S.fur)
  .box('neck', [0, 0.425, 0.296], [0.085, 0.1, 0.022], S.cream)
  // A wedge of a head: the skull, the cream muzzle with its tan bridge, the black nose.
  .box('head', [0, 0.59, 0.36], [0.15, 0.135, 0.14], S.fur)
  .box('head', [0, 0.553, 0.47], [0.086, 0.068, 0.1], S.cream)
  .box('head', [0, 0.5915, 0.464], [0.076, 0.012, 0.086], S.fur)
  .box('head', [0, 0.571, 0.526], [0.042, 0.032, 0.014], S.nose)
  // Eyes (open), and the shut lids' dark lines (tucked in the skull while the eyes are open).
  .boxLR('eye*', [0.0805, 0.607, 0.41], [0.012, 0.03, 0.03], S.eye)
  .boxLR('lid*', [0.0808, 0.601, 0.41], [0.012, 0.008, 0.034], S.lid)
  // The lower jaw, the mouth's dark inside (it shows when the jaw drops), the tongue.
  .box('jaw', [0, 0.524, 0.462], [0.072, 0.022, 0.09], S.cream)
  .box('jaw', [0, 0.5345, 0.452], [0.06, 0.004, 0.078], S.mouth)
  .box('tongue', [0, 0.531, 0.47], [0.038, 0.008, 0.075], S.tongue)
  // Pricked ears, pointed: a broad base, a narrow tip, pink inside.
  .boxLR('ear*', [0.054, 0.69, 0.345], [0.058, 0.076, 0.028], S.fur)
  .boxLR('ear*', [0.054, 0.742, 0.345], [0.034, 0.032, 0.024], S.fur)
  .boxLR('ear*', [0.054, 0.686, 0.3595], [0.034, 0.052, 0.002], S.inner)
  // Front legs: tan above, cream socks and paws.
  .boxLR('fleg*', [0.065, 0.245, 0.17], [0.06, 0.17, 0.068], S.fur)
  .boxLR('fshin*', [0.065, 0.115, 0.172], [0.05, 0.09, 0.052], S.fur)
  .boxLR('fshin*', [0.065, 0.047, 0.175], [0.052, 0.05, 0.054], S.cream)
  .boxLR('fshin*', [0.065, 0.013, 0.19], [0.056, 0.026, 0.074], S.cream)
  // Hind legs: the thigh, the shank down to the hock, cream paws.
  .boxLR('hleg*', [0.07, 0.28, -0.205], [0.068, 0.17, 0.11], S.fur)
  .boxLR('hshin*', [0.07, 0.125, -0.255], [0.05, 0.13, 0.052], S.fur)
  .boxLR('hshin*', [0.07, 0.047, -0.25], [0.052, 0.05, 0.054], S.cream)
  .boxLR('hshin*', [0.07, 0.013, -0.235], [0.056, 0.026, 0.074], S.cream)
  // The tail: three pieces (the shader curls them up over the back), a cream tip.
  .box('tail1', [0, 0.49, -0.285], [0.045, 0.12, 0.045], S.fur)
  .box('tail2', [0, 0.595, -0.285], [0.042, 0.09, 0.042], S.fur)
  .box('tail3', [0, 0.668, -0.285], [0.04, 0.056, 0.04], S.dark)
  .box('tail3', [0, 0.708, -0.285], [0.034, 0.026, 0.034], S.cream);

/**
 * The resting shapes (radians, model metres), shared by the shader and `dogPoint`: sitting tips the body up about the
 * hips and lowers them onto the ground; lying puts the belly on it; flat out it rolls onto its right side.
 */
const K = {
  sitPitch: -0.75,
  sitDrop: 0.254,
  lieDrop: 0.235,
  sideRoll: 1.42,
  sideDrop: 0.262,
  /** The neck keeps the head about level as the body tips up sitting; down sniffing, or the chin on the paws lying. */
  neckSit: 0.52,
  neckDown: 0.62,
  neckDownLie: 0.5,
  neckUp: -0.22,
  neckSide: 0.35,
  headSit: 0.22,
  headDown: 0.3,
  headUp: -0.12,
  /** Head turn: shared between the neck and the head; tilt (roll) of the head. */
  turnNeck: 0.42,
  turnHead: 0.62,
  tilt: 0.36,
  /** Leaning into a hand: the nose up, the head a little round; the pat presses it down a little. */
  leanPitch: -0.2,
  leanRoll: 0.16,
  patPitch: 0.12,
  barkPitch: -0.14,
};
const n = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(5)));

// ── The pose: tables, not GLSL ifs ─────────────────────────────────────────
//
// Each bone's turn (pitch, yaw, roll) is a sum of "drivers" (how much it sits, lies, looks down, pants, wags…)
// times its own coefficients, read from const tables by the bone's index; the legs add the stride (their place in
// it and how far they swing and bend, by gait). Plain arithmetic: a chain of `if (b == …) return …` takes some
// GPUs' compilers seconds to minutes (people/_personModel.ts `CARRY_ROT`), and the kit's chain walk is a loop
// the compiler cannot unroll here (`DogMesh`), so the pose is compiled once.

/** What the pitch, the yaw and the roll are made of (the shader works these out from the channels and the moods). */
const PITCH_IN = ['one', 'sit', 'lie', 'side', 'air', 'rise', 'fall', 'galRock', 'hdown', 'hdownStand', 'hdownLie', 'hup', 'gal', 'neckBob', 'breathRest', 'lean', 'pat', 'bark', 'sniffDip', 'pantPuff', 'pant', 'eperk', 'eback', 'twL', 'twR', 'thumpOsc', 'thumpAmt', 'flat'] as const;
const YAW_IN = ['turn', 'wag0', 'wag1', 'wag2', 'twL', 'twR', 'side', 'zero'] as const;
const ROLL_IN = ['one', 'side', 'walkRoll', 'tilt', 'lean', 'eback', 'shut', 'zero'] as const;
type Row<T extends readonly string[]> = Partial<Record<T[number], number>>;
type Gaits = readonly [walk: number, trot: number, gallop: number];
interface Rule {
  pitch?: Row<typeof PITCH_IN>;
  yaw?: Row<typeof YAW_IN>;
  roll?: Row<typeof ROLL_IN>;
  /** A leg: where it is in the stride (a share of it) by gait, how far it swings (upper) and bends (lower). */
  stride?: { at: Gaits; swing?: Gaits; bend?: Gaits };
}
/** The walk's lateral steps (left hind, left fore, right hind, right fore), the trot's diagonal pairs, the gallop's hinds then fores. */
const AT = { fL: [0.25, 0, 0.42], fR: [0.75, 0.5, 0.5], hL: [0, 0.5, 0], hR: [0.5, 0, 0.08] } as const satisfies Record<string, Gaits>;
const SWING_F: Gaits = [0.32, 0.52, 0.85];
const SWING_H: Gaits = [0.3, 0.5, 0.75];
const BEND: Gaits = [0.5, 0.8, 1.0];
const FLEG: Row<typeof PITCH_IN> = { sit: 0.7, lie: -1.25, side: -0.5, air: -0.55 };
const FSHIN: Row<typeof PITCH_IN> = { lie: -0.3, side: -0.35, air: 0.35 };
const HLEG: Row<typeof PITCH_IN> = { sit: -0.62, lie: -1.35, side: -0.45, air: 0.5 };
const HSHIN: Row<typeof PITCH_IN> = { sit: 2.55, lie: 2.6, side: 0.9, air: -0.3 };

const RULES: Record<string, Rule> = {
  // Sitting tips it up about the hips; a leap tips it up, then down; the gallop rocks it; the walk rolls it a little.
  body: { pitch: { sit: K.sitPitch, rise: -0.32, fall: 0.22, galRock: 0.11 }, roll: { side: K.sideRoll, walkRoll: 0.03 } },
  neck: {
    pitch: { sit: K.neckSit, hdownStand: K.neckDown, hdownLie: K.neckDownLie, hup: K.neckUp, side: K.neckSide, gal: 0.25, neckBob: 1, breathRest: 0.008, rise: -0.2 },
    yaw: { turn: K.turnNeck },
  },
  head: {
    pitch: { sit: K.headSit, hdown: K.headDown, hup: K.headUp, lean: K.leanPitch, pat: K.patPitch, bark: K.barkPitch, sniffDip: 1 },
    yaw: { turn: K.turnHead },
    roll: { tilt: K.tilt, lean: K.leanRoll },
  },
  jaw: { pitch: { pantPuff: 0.34, bark: 0.48 } },
  tongue: { pitch: { one: -0.25, pant: 0.8, bark: 0.15 } },
  // (back while it gallops or is happy at his hand, pricked when it watches; a twitch now and then)
  earL: { pitch: { eperk: 0.16, eback: -0.9, twL: -0.25 }, yaw: { twL: 0.25 }, roll: { one: -0.06, eback: -0.42 } },
  earR: { pitch: { eperk: 0.16, eback: -0.9, twR: -0.25 }, yaw: { twR: -0.25 }, roll: { one: 0.06, eback: 0.42 } },
  // (the open eye slides into the skull as the shut lid slides out)
  eyeL: { roll: { shut: -0.032 } },
  eyeR: { roll: { shut: 0.032 } },
  lidL: { roll: { one: -0.032, shut: 0.032 } },
  lidR: { roll: { one: 0.032, shut: -0.032 } },
  flegL: { pitch: FLEG, stride: { at: AT.fL, swing: SWING_F } },
  flegR: { pitch: FLEG, stride: { at: AT.fR, swing: SWING_F } },
  fshinL: { pitch: FSHIN, stride: { at: AT.fL, bend: BEND } },
  fshinR: { pitch: FSHIN, stride: { at: AT.fR, bend: BEND } },
  // (scratched behind the ears, the left hind leg thumps)
  hlegL: { pitch: { ...HLEG, thumpOsc: -1 }, stride: { at: AT.hL, swing: SWING_H } },
  hlegR: { pitch: HLEG, stride: { at: AT.hR, swing: SWING_H } },
  hshinL: { pitch: { ...HSHIN, thumpAmt: 0.5 }, stride: { at: AT.hL, bend: BEND } },
  hshinR: { pitch: HSHIN, stride: { at: AT.hR, bend: BEND } },
  // Curled up over the back, flatter at a gallop and lying; it wags from the root.
  tail1: { pitch: { one: -0.55, flat: -0.65, air: -0.3, lie: -0.75 }, yaw: { wag0: 0.55, side: 0.9 } },
  tail2: { pitch: { one: 0.95, flat: -0.75 }, yaw: { wag1: 0.32 } },
  tail3: { pitch: { one: 0.85, flat: -0.55 }, yaw: { wag2: 0.2 } },
};

const v4 = (a: readonly number[]) => `vec4(${a.map(n).join(', ')})`;
/** A table of `vec4`s, `per` a bone, in the bones' order. */
function table<T extends readonly string[]>(name: string, inputs: T, row: (r: Rule) => Row<T> | undefined): string {
  const out: string[] = [];
  for (const b of model.bones) {
    const r = row(RULES[b.name] ?? {}) ?? {};
    const vals = inputs.map((k) => (r as Record<string, number>)[k] ?? 0);
    for (let i = 0; i < vals.length; i += 4) out.push(v4(vals.slice(i, i + 4)));
  }
  return `const vec4 ${name}[${out.length}] = vec4[${out.length}](${out.join(', ')});`;
}
const STRIDE_TABLE = (() => {
  const out: string[] = [];
  for (const b of model.bones) {
    const s = RULES[b.name]?.stride;
    out.push(v4([...(s?.at ?? [0, 0, 0]), 0]), v4([...(s?.swing ?? [0, 0, 0]), 0]), v4([...(s?.bend ?? [0, 0, 0]), 0]));
  }
  return `const vec4 DOG_STRIDE[${out.length}] = vec4[${out.length}](${out.join(', ')});`;
})();
for (const name of Object.keys(RULES)) model.id(name);

const GLSL = /* glsl */ `
uniform vec4 uDogA;
uniform vec4 uDogB;
uniform vec4 uDogC;
${table('DOG_PITCH', PITCH_IN, (r) => r.pitch)}
${table('DOG_YAW', YAW_IN, (r) => r.yaw)}
${table('DOG_ROLL', ROLL_IN, (r) => r.roll)}
${STRIDE_TABLE}

// The gaits on the gait channel: 0 still, 1 walk, 2 trot, 3 gallop (their shares).
vec3 dogGaits(float g) {
  float gal = clamp(g - 2.0, 0.0, 1.0);
  float trot = clamp(g - 1.0, 0.0, 1.0) - gal;
  float walk = clamp(g, 0.0, 1.0) - trot - gal;
  return vec3(walk, trot, gal);
}

vec3 faunaBoneRot(int b, FaunaPose P) {
  vec3 w = dogGaits(P.gait);
  float sit = clamp(1.0 - abs(P.rest - 1.0), 0.0, 1.0);
  float lie = clamp(1.0 - abs(P.rest - 2.0), 0.0, 1.0);
  float side = clamp(P.rest - 2.0, 0.0, 1.0);
  float up = 1.0 - clamp(P.rest, 0.0, 1.0);
  float ph = P.phase;
  float leap = uDogC.z;
  float hdown = max(P.head, 0.0);
  float e = mix(uDogB.x, -0.8, w.z);
  float eback = max(-e, 0.0);
  float scratch = uDogC.x * max(0.0, 1.0 - lie - side);
  // (a slow breath; the nose's quick dips sniffing; panting's puffs)
  float breath = sin(P.t * 2.2 + P.seed * 5.0);
  float sniffDip = uDogC.y * 0.05 * max(0.0, sin(P.t * 21.0)) * step(0.2, fract(P.t * 0.9));
  float neckBob = sin(ph * 2.0) * (0.05 * w.x + 0.06 * w.y) + 0.08 * sin(ph + 2.2) * w.z;
  float wp = uDogA.y;
  float wag = uDogA.x;
  // (a blink now and then; shut asleep)
  float shut = step(0.5, max(uDogA.w, faunaTwitch(P.t, 4.0, 0.035, P.seed)));
  float twL = faunaTwitch(P.t, 0.5, 0.3, P.seed + 0.37) * (1.0 - eback);
  float twR = faunaTwitch(P.t, 0.5, 0.3, P.seed - 0.37) * (1.0 - eback);

  vec4 p0 = vec4(1.0, sit, lie, side);
  vec4 p1 = vec4(abs(leap), max(-leap, 0.0), max(leap, 0.0), sin(ph + 0.6) * w.z);
  vec4 p2 = vec4(hdown, hdown * max(0.0, 1.0 - lie - side), hdown * lie, max(-P.head, 0.0));
  vec4 p3 = vec4(w.z, neckBob, breath * (lie + side), uDogB.y);
  vec4 p4 = vec4(uDogC.w, uDogB.z, sniffDip, uDogA.z * (0.82 + 0.18 * sin(P.t * 19.0)));
  vec4 p5 = vec4(uDogA.z, max(e, 0.0), eback, twL);
  vec4 p6 = vec4(twR, scratch * (0.85 + 0.28 * sin(P.t * 40.0)), scratch, max(w.z, 0.6 * (lie + side)));
  vec4 y0 = vec4(P.turn, wag * sin(wp), wag * sin(wp - 0.8), wag * sin(wp - 1.5));
  vec4 y1 = vec4(twL, twR, side, 0.0);
  vec4 r0 = vec4(1.0, side, sin(ph) * w.x, uDogB.w);
  vec4 r1 = vec4(uDogB.y, eback, shut, 0.0);

  int i = b * 7;
  float pitch = dot(DOG_PITCH[i], p0) + dot(DOG_PITCH[i + 1], p1) + dot(DOG_PITCH[i + 2], p2) + dot(DOG_PITCH[i + 3], p3)
    + dot(DOG_PITCH[i + 4], p4) + dot(DOG_PITCH[i + 5], p5) + dot(DOG_PITCH[i + 6], p6);
  float yaw = dot(DOG_YAW[b * 2], y0) + dot(DOG_YAW[b * 2 + 1], y1);
  float roll = dot(DOG_ROLL[b * 2], r0) + dot(DOG_ROLL[b * 2 + 1], r1);
  // The stride: each leg at its place in it (by gait), the upper swinging, the lower bending as it comes forward.
  vec4 at = DOG_STRIDE[b * 3];
  float th = ph + 6.2832 * dot(at.xyz, w) / max(w.x + w.y + w.z, 0.001);
  pitch += (-sin(th) * dot(DOG_STRIDE[b * 3 + 1].xyz, w) + max(0.0, cos(th)) * dot(DOG_STRIDE[b * 3 + 2].xyz, w)) * up;
  return vec3(pitch, yaw, roll);
}

vec3 faunaRootMove(FaunaPose P) {
  vec3 w = dogGaits(P.gait);
  float sit = clamp(1.0 - abs(P.rest - 1.0), 0.0, 1.0);
  float lie = clamp(1.0 - abs(P.rest - 2.0), 0.0, 1.0);
  float side = clamp(P.rest - 2.0, 0.0, 1.0);
  float up = 1.0 - clamp(P.rest, 0.0, 1.0);
  float ph = P.phase;
  float bob = 0.006 * sin(ph * 2.0) * w.x + 0.016 * abs(sin(ph)) * w.y + 0.035 * max(0.0, sin(ph + 0.4)) * w.z;
  float breath = (0.003 + 0.004 * uDogA.z) * sin(P.t * (2.2 + 16.8 * uDogA.z) + P.seed * 5.0);
  return vec3(0.0, -${n(K.sitDrop)} * sit - ${n(K.lieDrop)} * lie - ${n(K.sideDrop)} * side + bob * up + breath, 0.0);
}
`;

export const DOG: Species = {
  name: 'dog',
  model,
  palettes: [[0xc49a62, 0xead6ae, 0x9a7446, 0x2b211c, 0x15100c, 0x5e432a, 0xd49a86, 0xd9646e, 0x4a2622]],
  glsl: GLSL,
  ease: [0.3, 0.55, 0.35, 0.3, 0.3],
  shadows: true,
};

/** The dog's moods, eased by the add-on every frame (the shader's uniforms). */
export interface DogLook {
  /** The tail's wag: how much (0‥1) and its phase (radians: the add-on turns it at the wag's pace). */
  wag: number;
  wagPhase: number;
  /** Panting (0‥1), the eyes shut (0‥1), the ears (−1 back ‥ 0 ‥ 1 pricked). */
  pant: number;
  shut: number;
  ears: number;
  /** Leaning its head into his hand (0‥1), a bark's open mouth (0‥1), the head tilted (−1 ‥ 1: its left ear down). */
  lean: number;
  bark: number;
  tilt: number;
  /** The hind leg's thump (0‥1), sniffing (0‥1), a leap (−1 going up ‥ 1 coming down), the hand's pat pressing on its head (0‥1). */
  scratch: number;
  sniff: number;
  leap: number;
  pat: number;
  /** Seen (1) ‥ gone (0): a dither, its shadow too. */
  fade: number;
}

export const newLook = (): DogLook => ({ wag: 0, wagPhase: 0, pant: 0, shut: 0, ears: 0, lean: 0, bark: 0, tilt: 0, scratch: 0, sniff: 0, leap: 0, pat: 0, fade: 1 });

/** Where the dog stands and leans (feet m, radians), and its size over the model's. */
export interface DogPlace {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  scale: number;
}

const _q = new Quaternion();
const _e = new Euler();
const _m = new Matrix4();
const _p = new Vector3();
const _s = new Vector3();

/**
 * The dog on the map: one InstancedMesh of one animal (the kit's flock), its
 * moods' uniforms and the dissolve (shared by its material and its shadow's).
 */
export class DogMesh {
  readonly flock = new Flock(DOG, 1);
  readonly mesh: InstancedMesh = this.flock.mesh;
  private readonly ua = { value: new Vector4() };
  private readonly ub = { value: new Vector4() };
  private readonly uc = { value: new Vector4() };
  private readonly uFade = { value: 1 };
  /** What is drawn now (the last `place`), and whether it is. */
  readonly at: DogPlace = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: DOG_SCALE };
  shown = false;

  constructor() {
    this.mesh.name = 'roam:dog';
    this.mesh.frustumCulled = true;
    this.flock.setup(0, 0, 0.37, 1);
    const u = { uDogA: this.ua, uDogB: this.ub, uDogC: this.uc, uDogFade: this.uFade };
    const hook = (m: MeshStandardMaterial | MeshDepthMaterial) => {
      const before = m.onBeforeCompile;
      m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, r) => {
        before.call(m, shader, r);
        Object.assign(shader.uniforms, u);
        // (the kit walks the chain in a loop of a fixed count, which a compiler unrolls into a copy of the pose code
        // per link: a loop it cannot unroll keeps one, as the people's bone pass does)
        const skin = /for \(int i = 0; i < \d+; i\+\+\) \{/;
        if (skin.test(shader.vertexShader)) shader.vertexShader = shader.vertexShader.replace(skin, 'while (b >= 0) {');
        else console.warn('[map] dog: no chain loop found in the kit (its pose code may compile slowly)');
        // (the dissolve: a soft dither, the same pattern every frame so it does not crawl)
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uDogFade;')
          .replace(
            '#include <clipping_planes_fragment>',
            '#include <clipping_planes_fragment>\n  if (uDogFade < 0.999 && fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715)))) > uDogFade) discard;',
          );
      };
    };
    hook(this.mesh.material as MeshStandardMaterial);
    if (this.mesh.customDepthMaterial) hook(this.mesh.customDepthMaterial as MeshDepthMaterial);
  }

  /** Put it there (feet, heading, the ground's tilt under it), shown. */
  place(p: DogPlace): void {
    Object.assign(this.at, p);
    this.shown = true;
    const fl = this.flock;
    fl.place(0, p.x, p.y, p.z, p.yaw, p.scale);
    if (p.pitch === 0 && p.roll === 0) return;
    // (`place` writes only the heading: the whole turn over it, as the ridden buffalo's: fauna/_landBuffalo.ts)
    _q.setFromEuler(_e.set(p.pitch, p.yaw, p.roll, 'YXZ'));
    _m.compose(_p.set(p.x, p.y, p.z), _q, _s.setScalar(p.scale));
    _m.toArray(fl.mesh.instanceMatrix.array as Float32Array, 0);
    fl.mesh.instanceMatrix.needsUpdate = true;
  }

  hide(): void {
    this.shown = false;
    this.flock.hide(0);
  }

  /** The moods (every frame), then the flock's buffers and clock (`t`: the add-on's clock, as its channels were set with). */
  flush(look: DogLook, t: number): void {
    this.ua.value.set(look.wag, look.wagPhase % (Math.PI * 200), look.pant, look.shut);
    this.ub.value.set(look.ears, look.lean, look.bark, look.tilt);
    this.uc.value.set(look.scratch, look.sniff, look.leap, look.pat);
    this.uFade.value = look.fade;
    this.flock.flush(t);
  }

  /** A channel's value now (as the shader has it at `t`). */
  value(c: (typeof CH)[keyof typeof CH], t: number): number {
    return this.flock.value(0, c, t);
  }
}

// ── The head on the CPU (his hand pats it) ───────────────────────────────

const PIV = {
  body: HIP,
  neck: model.bones[model.id('neck')].pivot,
  head: model.bones[model.id('head')].pivot,
};
/** Points of the head (model metres): the crown between the ears, behind each ear (where it is scratched), the nose. */
export const DOG_HEAD = {
  crown: [0, 0.662, 0.35] as V3,
  earL: [0.068, 0.645, 0.32] as V3,
  earR: [-0.068, 0.645, 0.32] as V3,
  nose: [0, 0.571, 0.535] as V3,
};

/** Turn `p` about `pv` by the shader's (pitch, yaw, roll) of a bone: R = Ry · Rx · Rz. */
function turn(p: Vector3, pv: readonly number[], rx: number, ry: number, rz: number): void {
  const x0 = p.x - pv[0];
  const y0 = p.y - pv[1];
  const z0 = p.z - pv[2];
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

const ORIGIN = [0, 0, 0];

/** The still pose a point of the head is read in: the rest, head and turn channels, and the moods that move the head. */
export interface DogHeadPose {
  rest: number;
  head: number;
  turn: number;
  lean: number;
  pat: number;
  bark: number;
  tilt: number;
}

/**
 * Where a point of its head (`DOG_HEAD`) is in its own space (model metres: feet at 0, facing +z) in a still pose: the
 * shader's resting shapes, the head's channels, leaning, tilt, the pat (not the gaits' sway nor the breath).
 */
export function dogHeadLocal(h: DogHeadPose, point: V3, out: Vector3): Vector3 {
  const sit = Math.max(0, 1 - Math.abs(h.rest - 1));
  const lie = Math.max(0, 1 - Math.abs(h.rest - 2));
  const side = Math.min(1, Math.max(0, h.rest - 2));
  const hdown = Math.max(h.head, 0);
  const hup = Math.max(-h.head, 0);
  out.set(point[0], point[1], point[2]);
  turn(
    out,
    PIV.head,
    K.headSit * sit + K.headDown * hdown + K.headUp * hup + K.leanPitch * h.lean + K.patPitch * h.pat + K.barkPitch * h.bark,
    K.turnHead * h.turn,
    K.tilt * h.tilt + K.leanRoll * h.lean,
  );
  turn(out, PIV.neck, K.neckSit * sit + hdown * (K.neckDown * Math.max(0, 1 - lie - side) + K.neckDownLie * lie) + K.neckUp * hup + K.neckSide * side, K.turnNeck * h.turn, 0);
  turn(out, PIV.body, K.sitPitch * sit, 0, K.sideRoll * side);
  out.y -= K.sitDrop * sit + K.lieDrop * lie + K.sideDrop * side;
  return out;
}

const _hp: DogHeadPose = { rest: 0, head: 0, turn: 0, lean: 0, pat: 0, bark: 0, tilt: 0 };

/** Where a point of its head is on the map now (m): its pose as the shader has it at `t`, then where it stands. */
export function dogPoint(d: DogMesh, t: number, look: DogLook, point: V3, out: Vector3): Vector3 {
  _hp.rest = d.value(CH.rest, t);
  _hp.head = d.value(CH.head, t);
  _hp.turn = d.value(CH.turn, t);
  _hp.lean = look.lean;
  _hp.pat = look.pat;
  _hp.bark = look.bark;
  _hp.tilt = look.tilt;
  dogHeadLocal(_hp, point, out);
  const a = d.at;
  out.multiplyScalar(a.scale);
  turn(out, ORIGIN, a.pitch, a.yaw, a.roll);
  return out.set(out.x + a.x, out.y + a.y, out.z + a.z);
}
