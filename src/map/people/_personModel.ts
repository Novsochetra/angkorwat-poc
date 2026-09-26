import {
  BufferGeometry,
  Color,
  DataTexture,
  DynamicDrawUsage,
  Float32BufferAttribute,
  FloatType,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  NearestFilter,
  RGBAFormat,
  Uint16BufferAttribute,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { ROAM_SCALE } from '../roam/types';

/**
 * The people of the map: one blocky person model (boxes on 13 bones, in the
 * explorer's big-headed voxel proportions) that every kind of person wears
 * differently, all of them drawn by ONE InstancedMesh (a draw, and one more
 * for its shadow) and posed in the vertex shader, like the animals
 * (fauna/_kit.ts).
 *
 * How it fits together:
 *
 * - **Boxes** (`buildModel`): each box sits on a bone, is painted with a colour
 *   `SLOT`, and may belong to a **feature** (`FEAT`: a hair style, a hat, the
 *   monk's robe, a backpack, a prop like the umbrella…). A person shows the
 *   features in their look; the others fold away to a point.
 * - **Colours**: every person has their own row of slot colours in a small
 *   float texture (row = instance), so no two visitors need to dress alike.
 * - **Poses** (`POSE`): whole-body poses (stand, look up, point, take a
 *   photo, sweep, sit, sampeah…) blended in the shader: a change of pose is
 *   one write (from, to, start) and the GPU eases it. On top: the **gait**
 *   (legs and arms swing with a step phase), the **carry** (how the arms hold
 *   the person's prop while standing or walking: umbrella up, flag high,
 *   bowl at the belly…), and the head's **look** (turn, tilt). Breathing and
 *   small idle moves come from time and a per-person seed.
 * - **Props** ride a grip bone in each hand; the shader turns the grip so
 *   the prop keeps a sensible world angle whatever the arm does (the umbrella
 *   and flag stand upright, the broom leans to the ground, the net hangs).
 *
 * Driving people: `crowd.add(look)` gives a person's index; `place` (feet,
 * heading), `gait` (walk share and step rate: `stepRate`), `pose`, `carry`
 * and `look` write only what changed; `flush(t, night)` once a frame.
 * `handAt` says where the right fist is (a torch's light, a kite's string),
 * `castPhase` where the net throw is. `_actor.ts` wraps all this for one
 * person walking about.
 *
 * Adding things (see also the notes by each table):
 * - a **kind**: dress it in `_kinds.ts` (features + colours + carry + size);
 * - a **feature / prop**: a new `FEAT` id (≤ 48) and its boxes in
 *   `buildModel` (props in the right hand: build them round the fist at
 *   `FIST_R`, the stick along +z: the grip holds that axis at the pose's
 *   tilt; boxes that show only in some poses: `SHOW`);
 * - a **pose**: a new `POSE` id, then in `GLSL` its bone turns in `pRot`,
 *   which arms / legs stay free in `pFree`, how far the hips drop in
 *   `pDrop`, and (if it holds the prop its own way) `pGripTarget`;
 * - a **carry** style: `CARRY` id + `pCarryRot`, `pCarrySide`, `pCarryGrip`.
 *
 * Sizes: the model is a 1.7 m adult (the explorer's own proportions: a head
 * a third of the height, short legs). People are drawn at `PEOPLE_SCALE`
 * (the roaming explorer's `ROAM_SCALE`) times their own `height`.
 */

// ── Tables ──────────────────────────────────────────────────────────────────

/** People are drawn at the roaming explorer's scale, so they stand eye to eye with him (and don't look like dolls next to him). */
export const PEOPLE_SCALE = ROAM_SCALE;

/** Whole-body poses (eased in the shader). */
export const POSE = {
  /** Standing (breathing, looking round a little); walks with the gait. */
  stand: 0,
  /** Looking up at a temple, leaning back a little. */
  look: 1,
  /** Pointing up ahead with the right arm. */
  point: 2,
  /** A camera or phone held up in front of the face with both hands. */
  photo: 3,
  /** Bent over a broom, sweeping side to side. */
  sweep: 4,
  /** Sitting cross-legged on the ground, hands on the knees. */
  sit: 5,
  /** Sampeah: palms together at the chest, the head bowed a little (the Khmer greeting). */
  sampeah: 6,
  /** Sampeah with a deep bow from the waist (alternate with `sampeah` for bows). */
  bow: 7,
  /** Talking to a group: the left hand gestures, the head sweeps over the listeners. */
  talk: 8,
  /** Waving the right hand high. */
  wave: 9,
  /** Apsara dance: knees bent, a foot lifted behind, hands curved up (slow, sways side to side). */
  dance: 10,
  /** Casting a net: holds it, twists back and throws, over a 6 s cycle (`castPhase`). */
  cast: 11,
  /** Kneeling, sitting back on the heels, palms together. */
  kneel: 12,
  /** Planting rice: bent over from the hips in the flooded plot, the right hand pushing seedlings into the mud, the bundle in the left. */
  plant: 13,
  /** Harvesting rice: bent over, the left hand gathering the stalks, the right swinging the sickle. */
  reap: 14,
  /**
   * Rowing a dragon boat, seated on a thwart (festival/): the stroke comes from
   * `fract(t · ROW_HZ + seed)` (give a crew one `seed`: they row in time) and its
   * strength from the gait's walk share (`gait(i, 0‥1, 0)`: 0 resting … 1 racing).
   */
  row: 15,
  /** Cheering: both arms up, pumping in turn (twice a `ROW_HZ` stroke; a boat's caller keeps its crew's time). */
  cheer: 16,
} as const;
/** Rowing strokes a second (the `row` pose; a whole number in 600 s, so the clock's wrap does not jump). */
export const ROW_HZ = 0.9;
export type Pose = (typeof POSE)[keyof typeof POSE];

/** How the hands hold the person's prop while standing or walking (`Crowd.carry` eases it in and out). */
export const CARRY = {
  none: 0,
  /** Right forearm forward, the umbrella upright over the head. */
  umbrella: 1,
  /** Right arm raised high, the flag's stick upright ("follow me"). */
  flag: 2,
  /** Right hand up in front, the torch upright. */
  torch: 3,
  /** The broom held like a staff, bristles down by the right foot. */
  broom: 4,
  /** Both hands on the alms bowl at the belly. */
  bowl: 5,
  /** The folded net hanging from the left hand. */
  net: 6,
  /** Both hands up, the kite's string rising ahead. */
  kite: 7,
  /** The phone held in front at the waist (looking at it). */
  phone: 8,
  /** A shoulder pole with a load at each end (sheaves, baskets), the right hand on it before the shoulder. */
  pole: 9,
} as const;
export type Carry = (typeof CARRY)[keyof typeof CARRY];

/** Colour slots (every person has a colour for each). */
export const SLOT = {
  skin: 0,
  hair: 1,
  eye: 2,
  /** Shirt / robe / bodice. */
  top: 3,
  sleeveL: 4,
  sleeveR: 5,
  /** Forearms (skin for short sleeves). */
  foreL: 6,
  foreR: 7,
  /** Pelvis: trousers, skirt, lower robe, sampot. */
  hips: 8,
  thigh: 9,
  shin: 10,
  foot: 11,
  sole: 12,
  hat: 13,
  /** Folds of the robe, collar, hat band, krama. */
  accent: 14,
  accent2: 15,
  bag: 16,
  /** Camera, phone, sunglasses, the alms bowl. */
  gear: 17,
  /** Umbrella cover, flag, net. */
  prop: 18,
  prop2: 19,
  /** Sticks and handles, broom straw. */
  wood: 20,
  /** Jewellery, the apsara's headdress. */
  gold: 21,
  /** The torch's flame: glows (blooms at night). */
  flame: 22,
  white: 23,
  /** The mouth (a darker skin tone). */
  mouth: 24,
  /** The Khmer palm-leaf hat's red binding on the brim and band round the crown. */
  trim: 25,
  /** Its darker straw: the leaf strips and the woven knot on top. */
  straw: 26,
} as const;
export const SLOTS = 27;
export type SlotName = keyof typeof SLOT;

/**
 * Features: boxes a person may have (ids 1‥48; 0 = every person). A look
 * lists the ones it wears. Props that go with a carry style are features
 * too (the carry only moves the arms).
 */
export const FEAT = {
  hairShort: 1,
  /** (with hairShort) long hair down the back. */
  hairLong: 2,
  /** (with hairShort) a bun at the back. */
  hairBun: 3,
  hatSun: 4,
  hatCap: 5,
  /** The Khmer palm-leaf hat (មួកស្លឹកត្នោត, woven from sugar-palm leaves): a round flat-topped crown with straight sides, a wide flat brim, red binding and band. */
  hatPalm: 6,
  /** Krama (checked scarf) wound round the head. */
  kramaHead: 7,
  /** Krama round the neck, a tail hanging in front. */
  kramaNeck: 8,
  /** The monk's robe: over the left shoulder, the right shoulder bare, a fold across the chest. */
  robe: 9,
  /** A skirt (or the robe's lower part) over the thighs. */
  skirt: 10,
  /** The apsara's sampot: long wrapped skirt with a gold belt and a front drape. */
  sampot: 11,
  backpack: 12,
  /** Camera on a strap at the chest (it goes to the face for a photo). */
  camera: 13,
  /** Phone in the right hand. */
  phone: 14,
  umbrella: 15,
  /** Small flag of Cambodia on a stick (a guide's). */
  flag: 16,
  broom: 17,
  /** Alms bowl with its lid, held at the belly. */
  bowl: 18,
  /** Folded cast net in the left hand. */
  net: 19,
  /** Torch: a stick with a glowing flame. */
  torch: 20,
  /** Kite reel in the right hand and the first metres of its string. */
  kite: 21,
  /** Apsara headdress (mokot): tiers and a spire of gold, ear ornaments. */
  headdress: 22,
  /** Gold collar, armbands and anklets. */
  jewels: 23,
  /** Sunglasses. */
  glasses: 24,
  /** A shirt collar (neat shirt). */
  collar: 25,
  /** Shoulder bag: strap across the chest, the bag at the right hip. */
  bag: 26,
  /** A tuft of hair on top (kids). */
  tuft: 27,
  /** A shoulder pole (bamboo) over the right shoulder, a load hanging at each end (sheaves of rice, baskets: `prop`, ties `prop2`). */
  pole: 28,
  /** A bundle of rice seedlings in the left hand, leaves up (planting). */
  seedlings: 29,
  /** A sickle in the right hand (harvest). */
  sickle: 30,
  /** The apsara's hands: flat, the fingers curved back (they show in the dance). */
  fingers: 31,
} as const;
export type Feature = (typeof FEAT)[keyof typeof FEAT];

/** A person's look: what they wear and carry, their colours and size. */
export interface Look {
  /** Features worn (FEAT ids). */
  feats: Feature[];
  carry: Carry;
  /** sRGB colour of every slot (`SLOTS` long). */
  colors: number[];
  /** Size over a 1.7 m adult (a kid ≈ 0.65). */
  height: number;
  /** 0‥1: varies the idle moves. */
  seed: number;
  /** Who they are (_kinds.ts `PersonKind`: set by `dress`), for the nature book (roam/_book.ts). */
  kind?: string;
}

// ── The model (rest pose: standing, facing +z, feet on y = 0, +x = the person's LEFT; metres for a 1.7 m adult) ──

const BONES = ['hips', 'chest', 'head', 'armL', 'foreL', 'gripL', 'armR', 'foreR', 'gripR', 'legL', 'shinL', 'legR', 'shinR'] as const;
type BoneName = (typeof BONES)[number];
const PARENT: Record<BoneName, BoneName | null> = {
  hips: null,
  chest: 'hips',
  head: 'chest',
  armL: 'chest',
  foreL: 'armL',
  gripL: 'foreL',
  armR: 'chest',
  foreR: 'armR',
  gripR: 'foreR',
  legL: 'hips',
  shinL: 'legL',
  legR: 'hips',
  shinR: 'legR',
};
type V3 = [number, number, number];
const SHOULDER_X = 0.26;
const ARM_X = 0.297;
const LEG_X = 0.126;
const PIVOT: Record<BoneName, V3> = {
  hips: [0, 0.52, 0],
  chest: [0, 0.62, 0],
  head: [0, 1.0, 0],
  armL: [SHOULDER_X, 0.95, 0],
  foreL: [ARM_X, 0.73, 0],
  gripL: [ARM_X, 0.555, 0],
  armR: [-SHOULDER_X, 0.95, 0],
  foreR: [-ARM_X, 0.73, 0],
  gripR: [-ARM_X, 0.555, 0],
  legL: [LEG_X, 0.52, -0.02],
  shinL: [LEG_X, 0.3, -0.02],
  legR: [-LEG_X, 0.52, -0.02],
  shinR: [-LEG_X, 0.3, -0.02],
};
/** Middle of the right fist in the rest pose (props in the right hand are built round it). */
export const FIST_R: V3 = [-ARM_X, 0.555, 0];

/** When a box shows, besides its feature: always, not while taking a photo, only while taking a photo, only with the palms together, only while dancing. */
const SHOW = { always: 0, notPhoto: 1, photo: 2, palms: 3, dance: 4 } as const;

class Builder {
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly part: number[] = [];
  private readonly idx: number[] = [];
  boxes = 0;

  /** A box (centre, size) on a bone, painted with `slot`, part of feature `feat` (0: everyone), shown per `show`. */
  box(bone: BoneName, c: V3, s: V3, slot: number, feat = 0, show: number = SHOW.always): this {
    const b = BONES.indexOf(bone);
    const base = this.pos.length / 3;
    const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
    const faces: [V3, V3, V3][] = [
      [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
      [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
      [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
      [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    ];
    faces.forEach(([n, u, v], f) => {
      for (const [a, bb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        this.pos.push(c[0] + (n[0] + u[0] * a + v[0] * bb) * hx, c[1] + (n[1] + u[1] * a + v[1] * bb) * hy, c[2] + (n[2] + u[2] * a + v[2] * bb) * hz);
        this.nrm.push(n[0], n[1], n[2]);
        this.part.push(b, slot, feat, show);
      }
      const o = base + f * 4;
      this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    this.boxes++;
    return this;
  }

  /** The box and its mirror across x = 0: on `bone` with `*` as L and R (or the same bone twice). */
  boxLR(bone: string, c: V3, s: V3, slot: number, feat = 0, show: number = SHOW.always): this {
    this.box(bone.replace('*', 'L') as BoneName, c, s, slot, feat, show);
    return this.box(bone.replace('*', 'R') as BoneName, [-c[0], c[1], c[2]], s, slot, feat, show);
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aPart', new Float32BufferAttribute(this.part, 4));
    g.setIndex(this.pos.length / 3 > 65535 ? this.idx : new Uint16BufferAttribute(this.idx, 1));
    return g;
  }
}

const S = SLOT;
const F = FEAT;

function buildModel(): Builder {
  const m = new Builder();
  const [fx, fy, fz] = FIST_R;
  /** A box in the right hand, `c` relative to the fist. */
  const inR = (c: V3, s: V3, slot: number, feat: number, show: number = SHOW.always) => m.box('gripR', [fx + c[0], fy + c[1], fz + c[2]], s, slot, feat, show);

  // ── Body (everyone) ──
  // Pelvis, thighs, shins, feet (bare, sandals or shoes by colour) on thin soles.
  m.box('hips', [0, 0.575, -0.01], [0.44, 0.1, 0.26], S.hips)
    .boxLR('leg*', [LEG_X, 0.41, -0.02], [0.185, 0.24, 0.2], S.thigh)
    .boxLR('shin*', [LEG_X, 0.185, -0.02], [0.165, 0.23, 0.18], S.shin)
    .boxLR('shin*', [LEG_X, 0.04, 0.03], [0.17, 0.06, 0.27], S.foot)
    .boxLR('shin*', [LEG_X, 0.005, 0.03], [0.18, 0.012, 0.28], S.sole);
  // Chest, neck.
  m.box('chest', [0, 0.81, 0], [0.46, 0.38, 0.29], S.top).box('chest', [0, 1.03, 0], [0.2, 0.07, 0.18], S.skin);
  // Arms: sleeve, forearm, hand.
  m.box('armL', [ARM_X, 0.845, 0], [0.13, 0.23, 0.14], S.sleeveL)
    .box('armR', [-ARM_X, 0.845, 0], [0.13, 0.23, 0.14], S.sleeveR)
    .box('foreL', [ARM_X, 0.665, 0], [0.12, 0.13, 0.13], S.foreL)
    .box('foreR', [-ARM_X, 0.665, 0], [0.12, 0.13, 0.13], S.foreR)
    .boxLR('fore*', [ARM_X, 0.555, 0.005], [0.115, 0.09, 0.12], S.skin);
  // Head: the big block, ears, eyes, brows (hair-coloured), a small smile.
  m.box('head', [0, 1.335, 0.01], [0.58, 0.525, 0.47], S.skin)
    .boxLR('head', [0.3, 1.25, 0.0], [0.03, 0.09, 0.07], S.skin)
    .box('head', [0, 1.15, 0.247], [0.12, 0.025, 0.012], S.mouth)
    .boxLR('head', [0.07, 1.16, 0.247], [0.025, 0.02, 0.012], S.mouth)
    .boxLR('head', [0.125, 1.25, 0.248], [0.07, 0.075, 0.02], S.eye)
    .boxLR('head', [0.125, 1.325, 0.248], [0.11, 0.03, 0.02], S.hair);
  // Palms together (shown only in the sampeah / bow / kneel poses: the chibi arms are short).
  m.box('chest', [0, 0.86, 0.225], [0.12, 0.17, 0.08], S.skin, 0, SHOW.palms);

  // ── Hair ──
  m.box('head', [0, 1.625, 0.0], [0.6, 0.07, 0.49], S.hair, F.hairShort)
    .box('head', [0, 1.42, -0.228], [0.6, 0.36, 0.035], S.hair, F.hairShort)
    .boxLR('head', [0.293, 1.45, -0.06], [0.02, 0.3, 0.36], S.hair, F.hairShort)
    .box('head', [0, 1.56, 0.24], [0.58, 0.07, 0.025], S.hair, F.hairShort);
  m.box('head', [0, 1.14, -0.235], [0.56, 0.42, 0.06], S.hair, F.hairLong).boxLR('head', [0.292, 1.2, -0.11], [0.03, 0.3, 0.22], S.hair, F.hairLong);
  m.box('head', [0, 1.62, -0.2], [0.2, 0.17, 0.17], S.hair, F.hairBun);
  m.box('head', [0.03, 1.69, 0.05], [0.14, 0.08, 0.14], S.hair, F.tuft);

  // ── Hats and head cloths ──
  m.box('head', [0, 1.62, 0.02], [0.86, 0.035, 0.78], S.hat, F.hatSun)
    .box('head', [0, 1.7, 0.0], [0.62, 0.13, 0.52], S.hat, F.hatSun)
    .box('head', [0, 1.65, 0.0], [0.63, 0.035, 0.53], S.accent, F.hatSun);
  m.box('head', [0, 1.655, 0.0], [0.61, 0.12, 0.51], S.hat, F.hatCap).box('head', [0, 1.615, 0.33], [0.44, 0.03, 0.22], S.hat, F.hatCap);
  // Khmer palm-leaf hat: round shapes as two crossed boxes (an octagon). A wide flat brim, its edge bound in red
  // cloth a little lower (the droop), leaf strips across it; a flat-topped crown with straight sides tapering a
  // little, a red band round its base, a small woven knot on top.
  const round = (y: number, w: number, h: number, k: number, slot: number) =>
    m.box('head', [0, y, 0], [w, h, w * k], slot, F.hatPalm).box('head', [0, y, 0], [w * k, h, w], slot, F.hatPalm);
  round(1.625, 1.08, 0.03, 0.71, S.hat);
  round(1.607, 1.12, 0.022, 0.71, S.trim);
  m.box('head', [0, 1.6415, 0], [1.02, 0.004, 0.035], S.straw, F.hatPalm).box('head', [0, 1.6415, 0], [0.035, 0.004, 1.02], S.straw, F.hatPalm);
  round(1.725, 0.58, 0.2, 0.74, S.hat);
  round(1.85, 0.54, 0.05, 0.72, S.hat);
  round(1.665, 0.6, 0.05, 0.74, S.trim);
  round(1.882, 0.13, 0.018, 0.62, S.straw);
  m.box('head', [0, 1.6, 0.0], [0.62, 0.12, 0.51], S.accent, F.kramaHead)
    .box('head', [0, 1.6, 0.0], [0.63, 0.04, 0.52], S.accent2, F.kramaHead)
    .box('head', [0.31, 1.58, 0.07], [0.06, 0.11, 0.11], S.accent, F.kramaHead);
  // Apsara mokot: a gold band, tiers narrowing to a spire, ear ornaments.
  m.box('head', [0, 1.62, 0.01], [0.61, 0.06, 0.5], S.gold, F.headdress)
    .box('head', [0, 1.69, 0.0], [0.46, 0.09, 0.38], S.gold, F.headdress)
    .box('head', [0, 1.775, 0.0], [0.33, 0.09, 0.27], S.gold, F.headdress)
    .box('head', [0, 1.86, 0.0], [0.21, 0.09, 0.18], S.gold, F.headdress)
    .box('head', [0, 1.97, 0.0], [0.09, 0.14, 0.09], S.gold, F.headdress)
    .box('head', [0, 1.66, 0.22], [0.1, 0.1, 0.03], S.accent, F.headdress)
    .boxLR('head', [0.31, 1.2, 0.02], [0.03, 0.16, 0.05], S.gold, F.headdress);
  m.boxLR('head', [0.12, 1.255, 0.257], [0.15, 0.085, 0.02], S.gear, F.glasses).box('head', [0, 1.27, 0.257], [0.1, 0.025, 0.018], S.gear, F.glasses);

  // ── Clothes ──
  // Monk's robe: bare right shoulder and upper chest, a fold from the left shoulder down to the right hip (front and back).
  m.box('chest', [-0.13, 0.965, 0.0], [0.21, 0.075, 0.296], S.skin, F.robe).box('chest', [-0.12, 0.93, 0.1485], [0.19, 0.06, 0.01], S.skin, F.robe);
  for (const [x, y] of [[0.14, 0.93], [0.03, 0.83], [-0.08, 0.73], [-0.18, 0.645]])
    m.box('chest', [x, y, 0.1485], [0.13, 0.11, 0.012], S.accent, F.robe).box('chest', [x, y, -0.1485], [0.13, 0.11, 0.012], S.accent, F.robe);
  m.box('hips', [0.07, 0.4, 0.16], [0.07, 0.3, 0.012], S.accent, F.robe);
  // Skirt (and the robe's lower part) over the thighs.
  m.box('hips', [0, 0.41, -0.01], [0.48, 0.34, 0.31], S.hips, F.skirt);
  // Sampot: long wrap to the ankles, a gold belt and a front drape.
  m.box('hips', [0, 0.33, -0.01], [0.44, 0.5, 0.3], S.hips, F.sampot)
    .box('hips', [0, 0.595, -0.01], [0.47, 0.05, 0.31], S.gold, F.sampot)
    .box('hips', [0, 0.36, 0.145], [0.1, 0.4, 0.02], S.accent, F.sampot)
    .box('hips', [0, 0.14, 0.145], [0.14, 0.05, 0.02], S.gold, F.sampot);
  // Collar of a neat shirt.
  m.box('chest', [0, 0.99, 0.02], [0.3, 0.045, 0.27], S.accent, F.collar)
    .boxLR('chest', [0.06, 0.96, 0.148], [0.08, 0.05, 0.012], S.accent, F.collar);
  // Krama round the neck (red and white checks), a tail in front.
  m.box('chest', [0, 0.985, 0.0], [0.34, 0.07, 0.31], S.accent, F.kramaNeck)
    .box('chest', [0, 0.985, 0.0], [0.345, 0.025, 0.315], S.accent2, F.kramaNeck)
    .box('chest', [0.12, 0.87, 0.152], [0.08, 0.17, 0.02], S.accent, F.kramaNeck)
    .box('chest', [0.12, 0.83, 0.153], [0.082, 0.03, 0.02], S.accent2, F.kramaNeck);
  // Gold collar, armbands, bracelets, anklets.
  m.box('chest', [0, 0.97, 0.01], [0.37, 0.06, 0.305], S.gold, F.jewels)
    .box('chest', [0, 0.91, 0.15], [0.16, 0.08, 0.012], S.gold, F.jewels)
    .boxLR('arm*', [ARM_X, 0.9, 0], [0.14, 0.035, 0.15], S.gold, F.jewels)
    .boxLR('fore*', [ARM_X, 0.612, 0], [0.125, 0.03, 0.135], S.gold, F.jewels)
    .boxLR('shin*', [LEG_X, 0.095, -0.02], [0.175, 0.03, 0.19], S.gold, F.jewels);

  // ── Bags and gear ──
  m.box('chest', [0, 0.82, -0.215], [0.34, 0.34, 0.14], S.bag, F.backpack)
    .box('chest', [0, 0.97, -0.21], [0.3, 0.05, 0.15], S.bag, F.backpack)
    .box('chest', [0, 0.74, -0.29], [0.24, 0.12, 0.03], S.accent2, F.backpack)
    .boxLR('chest', [0.13, 0.86, 0.148], [0.05, 0.28, 0.012], S.bag, F.backpack);
  for (let k = 0; k < 5; k++) m.box('chest', [0.16 - k * 0.08, 0.95 - k * 0.075, 0.1485], [0.07, 0.07, 0.012], S.bag, F.bag);
  m.box('chest', [-0.25, 0.64, 0.02], [0.07, 0.15, 0.2], S.bag, F.bag);
  m.box('chest', [0, 0.84, 0.18], [0.17, 0.11, 0.07], S.gear, F.camera, SHOW.notPhoto)
    .box('chest', [0, 0.84, 0.225], [0.07, 0.07, 0.03], S.white, F.camera, SHOW.notPhoto)
    .boxLR('chest', [0.1, 0.93, 0.148], [0.03, 0.14, 0.012], S.gear, F.camera, SHOW.notPhoto);
  // The camera at the face for a photo: between the hands (level: the grip keeps it so).
  inR([0.15, 0.12, 0.04], [0.2, 0.12, 0.09], S.gear, F.camera, SHOW.photo);
  inR([0.15, 0.12, 0.095], [0.07, 0.07, 0.03], S.white, F.camera, SHOW.photo);
  // Phone: upright in the fist; held up before the eyes for a photo.
  inR([0.03, 0.06, 0.04], [0.09, 0.15, 0.016], S.gear, F.phone, SHOW.notPhoto);
  inR([0.12, 0.13, 0.06], [0.15, 0.1, 0.016], S.gear, F.phone, SHOW.photo);
  // Alms bowl with its lid, held at the belly (on the chest: it rides with the body).
  m.box('chest', [0, 0.675, 0.25], [0.3, 0.17, 0.26], S.gear, F.bowl)
    .box('chest', [0, 0.77, 0.25], [0.24, 0.04, 0.2], S.gear, F.bowl)
    .box('chest', [0, 0.795, 0.25], [0.06, 0.03, 0.06], S.gold, F.bowl)
    .box('chest', [0.13, 0.9, 0.149], [0.04, 0.18, 0.012], S.accent, F.bowl);

  // ── Props in the right hand (the stick along +z from the fist: the grip turns it) ──
  // Umbrella: shaft, a stepped canopy and its tip (upright when carried).
  inR([0, 0, 0.56], [0.03, 0.03, 1.2], S.wood, F.umbrella)
    .box('gripR', [fx, fy, fz + 1.1], [1.12, 1.12, 0.06], S.prop, F.umbrella)
    .box('gripR', [fx, fy, fz + 1.16], [0.84, 0.84, 0.07], S.prop, F.umbrella)
    .box('gripR', [fx, fy, fz + 1.22], [0.5, 0.5, 0.07], S.prop2, F.umbrella)
    .box('gripR', [fx, fy, fz + 1.29], [0.06, 0.06, 0.1], S.wood, F.umbrella);
  // Flag of Cambodia on a stick: blue, red, blue; Angkor Wat in white in the middle (the cloth flies back from the stick).
  inR([0, 0, 0.62], [0.03, 0.03, 1.3], S.wood, F.flag)
    .box('gripR', [fx, fy + 0.22, fz + 1.195], [0.015, 0.42, 0.075], S.prop, F.flag)
    .box('gripR', [fx, fy + 0.22, fz + 1.08], [0.015, 0.42, 0.155], S.prop2, F.flag)
    .box('gripR', [fx, fy + 0.22, fz + 0.965], [0.015, 0.42, 0.075], S.prop, F.flag)
    .box('gripR', [fx, fy + 0.22, fz + 1.085], [0.02, 0.12, 0.07], S.white, F.flag);
  // Broom: a long handle (its top end behind the fist), a fan of straw.
  inR([0, 0, 0.025], [0.03, 0.03, 0.95], S.wood, F.broom)
    .box('gripR', [fx, fy, fz + 0.53], [0.1, 0.09, 0.1], S.wood, F.broom)
    .box('gripR', [fx, fy, fz + 0.63], [0.34, 0.07, 0.12], S.prop, F.broom);
  // Torch: a stick, a flame (glows).
  inR([0, 0, 0.3], [0.05, 0.05, 0.7], S.wood, F.torch)
    .box('gripR', [fx, fy, fz + 0.66], [0.09, 0.09, 0.08], S.gear, F.torch)
    .box('gripR', [fx, fy, fz + 0.77], [0.13, 0.13, 0.16], S.flame, F.torch)
    .box('gripR', [fx, fy, fz + 0.88], [0.07, 0.07, 0.12], S.flame, F.torch);
  // Kite: a reel in the fist and the string's first metres (the kite is its own thing).
  inR([0, 0, 0.02], [0.14, 0.14, 0.08], S.wood, F.kite).box('gripR', [fx, fy, fz + 1.05], [0.012, 0.012, 2.0], S.white, F.kite);
  // ── The left hand: the cast net, folded, hanging (the grip keeps it hanging) ──
  m.box('gripL', [ARM_X, 0.42, 0.03], [0.2, 0.26, 0.18], S.prop, F.net)
    .box('gripL', [ARM_X, 0.24, 0.03], [0.3, 0.12, 0.28], S.prop, F.net)
    .box('gripL', [ARM_X, 0.175, 0.03], [0.32, 0.03, 0.3], S.prop2, F.net);
  // A bundle of rice seedlings in the left fist, leaves up, muddy roots below (the grip keeps it upright).
  m.box('gripL', [ARM_X, 0.53, 0.07], [0.1, 0.07, 0.1], S.prop2, F.seedlings)
    .box('gripL', [ARM_X, 0.68, 0.07], [0.15, 0.24, 0.13], S.prop, F.seedlings)
    .box('gripL', [ARM_X + 0.03, 0.83, 0.05], [0.08, 0.08, 0.07], S.prop, F.seedlings);
  // Sickle: a short wooden handle, the blade curving round to the left.
  inR([0, 0, 0.07], [0.04, 0.04, 0.16], S.wood, F.sickle)
    .box('gripR', [fx + 0.02, fy, fz + 0.2], [0.05, 0.018, 0.11], S.gear, F.sickle)
    .box('gripR', [fx + 0.08, fy, fz + 0.27], [0.1, 0.018, 0.05], S.gear, F.sickle)
    .box('gripR', [fx + 0.14, fy, fz + 0.23], [0.04, 0.018, 0.07], S.gear, F.sickle);
  // The apsara's hands (on the grip bones: in the dance the wrist bends back): a flat palm, the fingers curling back further.
  for (const [bone, x] of [['gripL', ARM_X], ['gripR', -ARM_X]] as const) {
    m.box(bone, [x, 0.475, 0.0], [0.1, 0.11, 0.028], S.skin, F.fingers, SHOW.dance)
      .box(bone, [x, 0.405, 0.025], [0.09, 0.05, 0.026], S.skin, F.fingers, SHOW.dance)
      .box(bone, [x, 0.375, 0.06], [0.08, 0.026, 0.05], S.skin, F.fingers, SHOW.dance);
  }
  // Shoulder pole on the right shoulder, a load hanging at each end on short cords (it rides with the body).
  m.box('chest', [-0.2, 1.075, 0], [0.045, 0.045, 1.7], S.wood, F.pole);
  for (const z of [-0.74, 0.74]) {
    m.box('chest', [-0.2, 0.98, z], [0.015, 0.14, 0.015], S.prop2, F.pole)
      .box('chest', [-0.2, 0.66, z], [0.26, 0.5, 0.22], S.prop, F.pole)
      .box('chest', [-0.2, 0.84, z], [0.28, 0.05, 0.24], S.prop2, F.pole)
      .box('chest', [-0.2, 0.95, z], [0.2, 0.08, 0.16], S.prop, F.pole);
  }
  return m;
}

// ── Shader ──────────────────────────────────────────────────────────────────

const f = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(4)));
const POSE_CONSTS = Object.entries(POSE).map(([k, v]) => `const int P_${k.toUpperCase()} = ${v};`).join('\n');
const BONE_CONSTS = BONES.map((b, i) => `const int B_${b.toUpperCase()} = ${i};`).join('\n');

/**
 * The pose GLSL. Angles (radians, per bone, against its parent): pitch > 0
 * tips the front down (a hanging limb swings back; an arm raised forward is
 * negative), yaw > 0 turns to the person's left, roll > 0 lifts the left side
 * (the left arm out, the right arm in).
 */
const GLSL = /* glsl */ `
attribute vec4 aPart;
attribute vec4 aPCh0;
attribute vec4 aPCh1;
attribute vec4 aPCh2;
attribute vec4 aPCh3;
attribute vec4 aPCh4;
attribute vec4 aPLook;
uniform float uPTime;
uniform vec4 uPEase;
uniform float uPEasePitch;

${POSE_CONSTS}
${BONE_CONSTS}
const float P_ROW_HZ = ${f(ROW_HZ)};
// A rowing stroke (the row pose; festival/_kit.ts swings the paddles the same way): +1 at the catch, −1 at the end of the quicker pull.
float pStroke(float x) {
  return x < 0.4 ? cos(3.14159265 * x / 0.4) : -cos(3.14159265 * (x - 0.4) / 0.6);
}
const vec3 P_PIVOT[${BONES.length}] = vec3[${BONES.length}](${BONES.map((b) => `vec3(${PIVOT[b].map(f).join(', ')})`).join(', ')});
const int P_PARENT[${BONES.length}] = int[${BONES.length}](${BONES.map((b) => (PARENT[b] ? BONES.indexOf(PARENT[b]!) : -1)).join(', ')});

struct PP {
  // Time (s), step phase (rad), walk 0‥1 (also the stride), the blend from pose \`from\` to \`to\` (k 0‥1).
  float t;
  float ph;
  float walk;
  float k;
  int from;
  int to;
  // Carry weight and style; head turn (rad, + left) and tilt (−1 up ‥ 1 down); 0‥1 per person.
  float carry;
  int ctype;
  float yaw;
  float pitch;
  float seed;
};

float pEase(vec4 c, float d) {
  float k = clamp((uPTime - c.z) / max(d, 1e-3), 0.0, 1.0);
  return mix(c.x, c.y, k * k * (3.0 - 2.0 * k));
}

PP pState() {
  PP P;
  P.t = uPTime;
  P.walk = pEase(aPCh0, uPEase.x);
  P.ph = uPTime * aPCh1.w * 6.2831853 + aPCh0.w;
  P.from = int(aPCh1.x + 0.5);
  P.to = int(aPCh1.y + 0.5);
  float k = clamp((uPTime - aPCh1.z) / max(uPEase.y, 1e-3), 0.0, 1.0);
  P.k = k * k * (3.0 - 2.0 * k);
  P.carry = pEase(aPCh2, uPEase.z);
  P.ctype = int(aPLook.z + 0.5);
  P.yaw = pEase(aPCh3, uPEase.w);
  P.pitch = pEase(aPCh4, uPEasePitch);
  P.seed = aPLook.w;
  return P;
}

mat3 pRotX(float a) { float c = cos(a); float s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 pRotY(float a) { float c = cos(a); float s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 pRotZ(float a) { float c = cos(a); float s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

// Standing: breathing, the weight shifting, the head looking round a little.
vec3 pStand(int b, PP P) {
  float s = P.seed * 6.2831;
  float br = sin(P.t * 1.35 + s);
  if (b == B_HIPS) return vec3(0.0, 0.0, 0.025 * sin(P.t * 0.31 + s));
  if (b == B_CHEST) return vec3(0.015 * br, 0.04 * sin(P.t * 0.27 + s * 2.0), -0.02 * sin(P.t * 0.31 + s));
  if (b == B_HEAD) return vec3(0.04 * sin(P.t * 0.45 + s * 3.0), 0.14 * sin(P.t * 0.21 + s * 5.0), 0.0);
  if (b == B_ARML) return vec3(0.03 * br, 0.0, 0.08);
  if (b == B_ARMR) return vec3(0.03 * br, 0.0, -0.08);
  if (b == B_FOREL || b == B_FORER) return vec3(-0.18, 0.0, 0.0);
  return vec3(0.0);
}

// Palms together at the chest (sampeah, bow, kneel).
vec3 pPalms(int b) {
  if (b == B_ARML) return vec3(-0.5, 0.0, -0.05);
  if (b == B_ARMR) return vec3(-0.5, 0.0, 0.05);
  if (b == B_FOREL) return vec3(-1.95, 0.0, -0.62);
  if (b == B_FORER) return vec3(-1.95, 0.0, 0.62);
  return vec3(0.0);
}

// One pose's bone turns (no gait, no carry, no look).
vec3 pRot(int p, int b, PP P) {
  float s = P.seed * 6.2831;
  float t = P.t;
  float br = sin(t * 1.35 + s);
  vec3 base = pStand(b, P);
  bool arm = b == B_ARML || b == B_ARMR || b == B_FOREL || b == B_FORER;
  if (p == P_STAND) return base;
  if (p == P_LOOK) {
    if (b == B_HIPS) return vec3(-0.04, 0.0, 0.0);
    if (b == B_CHEST) return vec3(-0.1, 0.08 * sin(t * 0.2 + s), 0.0);
    if (b == B_HEAD) return vec3(-0.45, 0.25 * sin(t * 0.17 + s), 0.0);
    if (b == B_ARML) return vec3(0.12, 0.0, 0.1);
    if (b == B_ARMR) return vec3(0.12, 0.0, -0.1);
    if (b == B_FOREL || b == B_FORER) return vec3(-0.35, 0.0, 0.0);
    return base;
  }
  if (p == P_POINT) {
    if (b == B_CHEST) return vec3(0.0, 0.14, 0.0);
    if (b == B_HEAD) return vec3(-0.3, 0.05, 0.0);
    if (b == B_ARMR) return vec3(-1.95, 0.2, -0.15);
    if (b == B_FORER) return vec3(-0.12, 0.0, 0.0);
    return base;
  }
  if (p == P_PHOTO) {
    if (b == B_CHEST) return vec3(-0.05, 0.0, 0.0);
    if (b == B_HEAD) return vec3(0.06, 0.0, 0.0);
    if (b == B_ARML) return vec3(-1.5, -0.5, 0.12);
    if (b == B_ARMR) return vec3(-1.5, 0.5, -0.12);
    if (b == B_FOREL || b == B_FORER) return vec3(-1.3, 0.0, 0.0);
    return base;
  }
  if (p == P_SWEEP) {
    float sw = sin(t * 1.4 + s);
    if (b == B_HIPS) return vec3(0.0, 0.12 * sw, 0.0);
    if (b == B_CHEST) return vec3(0.42, 0.22 * sw, 0.0);
    if (b == B_HEAD) return vec3(-0.25, -0.1 * sw, 0.0);
    if (b == B_ARMR) return vec3(-0.5, 0.25, -0.05);
    if (b == B_FORER) return vec3(-0.6, 0.0, 0.0);
    if (b == B_ARML) return vec3(-0.95, -0.35, 0.05);
    if (b == B_FOREL) return vec3(-0.55, 0.0, 0.0);
    if (b == B_LEGL) return vec3(-0.22, 0.0, 0.03);
    if (b == B_SHINL) return vec3(0.3, 0.0, 0.0);
    if (b == B_LEGR) return vec3(0.08, 0.0, -0.03);
    if (b == B_SHINR) return vec3(0.14, 0.0, 0.0);
    return base;
  }
  if (p == P_SIT) {
    if (b == B_CHEST) return vec3(0.05 + 0.012 * br, 0.0, 0.0);
    if (b == B_HEAD) return vec3(0.12, 0.1 * sin(t * 0.2 + s), 0.0);
    if (b == B_LEGL) return vec3(-1.5, 0.6, 0.0);
    if (b == B_SHINL) return vec3(-0.2, 0.0, -2.5);
    if (b == B_LEGR) return vec3(-1.5, -0.6, 0.0);
    if (b == B_SHINR) return vec3(-0.2, 0.0, 2.5);
    if (b == B_ARML) return vec3(-0.55, 0.0, 0.2);
    if (b == B_ARMR) return vec3(-0.55, 0.0, -0.2);
    if (b == B_FOREL || b == B_FORER) return vec3(-0.55, 0.0, 0.0);
    return vec3(0.0);
  }
  if (p == P_SAMPEAH) {
    if (b == B_CHEST) return vec3(0.06 + 0.01 * br, 0.0, 0.0);
    if (b == B_HEAD) return vec3(0.16, 0.0, 0.0);
    if (arm) return pPalms(b);
    return base;
  }
  if (p == P_BOW) {
    if (b == B_CHEST) return vec3(0.55, 0.0, 0.0);
    if (b == B_HEAD) return vec3(0.25, 0.0, 0.0);
    if (arm) return pPalms(b);
    return vec3(0.0);
  }
  if (p == P_TALK) {
    if (b == B_CHEST) return vec3(0.0, 0.12 * sin(t * 0.33 + s + 0.5), 0.0);
    if (b == B_HEAD) return vec3(0.02 * sin(t * 1.1), 0.35 * sin(t * 0.33 + s), 0.0);
    if (b == B_ARML) return vec3(-0.85 + 0.18 * sin(t * 1.7 + s), -0.25, 0.22 + 0.08 * sin(t * 1.1));
    if (b == B_FOREL) return vec3(-0.75 + 0.25 * sin(t * 2.1 + s), 0.0, 0.0);
    return base;
  }
  if (p == P_WAVE) {
    float w = sin(t * 7.5);
    if (b == B_HEAD) return vec3(-0.1, 0.1, 0.0);
    if (b == B_ARMR) return vec3(-2.75, 0.0, -0.2 - 0.28 * w);
    if (b == B_FORER) return vec3(-0.3 + 0.25 * sin(t * 7.5 + 0.6), 0.0, 0.0);
    return base;
  }
  if (p == P_DANCE) {
    // f: +1 the left foot lifted behind, −1 the right; it changes slowly.
    float fl = 2.0 * smoothstep(-0.4, 0.4, sin(t * 0.45 + s)) - 1.0;
    float L = max(fl, 0.0);
    float R = max(-fl, 0.0);
    if (b == B_HIPS) return vec3(0.0, 0.0, 0.08 * fl);
    if (b == B_CHEST) return vec3(0.02, 0.12 * fl, -0.16 * fl);
    if (b == B_HEAD) return vec3(0.08, 0.3 * fl, 0.18 * fl);
    if (b == B_LEGL) return vec3(-0.4 + 0.7 * L, 0.25, 0.0);
    if (b == B_SHINL) return vec3(0.75 + 1.0 * L, 0.0, 0.0);
    if (b == B_LEGR) return vec3(-0.4 + 0.7 * R, -0.25, 0.0);
    if (b == B_SHINR) return vec3(0.75 + 1.0 * R, 0.0, 0.0);
    // The arm on the lifted side curves out and up, the other forward at the chest, hands bent back
    // (the wrists: pSkin); the forearms undulate slowly, never still.
    float un = 0.1 * sin(t * 0.7 + s * 3.0);
    if (b == B_ARML) return mix(vec3(-1.2, -0.3, 0.25), vec3(-0.35, 0.0, 1.25), L) + vec3(0.5 * un, 0.0, 0.0);
    if (b == B_FOREL) return mix(vec3(-1.1, 0.0, 0.0), vec3(-1.5, 0.0, 0.3), L) + vec3(un, 0.0, 0.0);
    if (b == B_ARMR) return mix(vec3(-1.2, 0.3, -0.25), vec3(-0.35, 0.0, -1.25), R) - vec3(0.5 * un, 0.0, 0.0);
    if (b == B_FORER) return mix(vec3(-1.1, 0.0, 0.0), vec3(-1.5, 0.0, -0.3), R) - vec3(un, 0.0, 0.0);
    return vec3(0.0);
  }
  if (p == P_CAST) {
    float u = fract(t / 6.0 + P.seed);
    float wind = smoothstep(0.5, 0.68, u) * (1.0 - smoothstep(0.7, 0.76, u));
    float thr = smoothstep(0.7, 0.76, u) * (1.0 - smoothstep(0.85, 1.0, u));
    if (b == B_CHEST) return vec3(0.1 + 0.15 * wind - 0.1 * thr, -0.9 * wind + 0.4 * thr, 0.0);
    if (b == B_HEAD) return vec3(0.1 - 0.2 * thr, 0.5 * wind - 0.2 * thr, 0.0);
    if (b == B_ARML) return vec3(-0.4 - 0.3 * wind - 1.6 * thr, -0.3 * wind, 0.1);
    if (b == B_FOREL) return vec3(-0.8 + 0.4 * wind + 0.6 * thr, 0.0, 0.0);
    if (b == B_ARMR) return vec3(-0.3 - 0.6 * wind - 1.5 * thr, 0.3, -0.1);
    if (b == B_FORER) return vec3(-0.9 + 0.3 * thr, 0.0, 0.0);
    if (b == B_LEGL) return vec3(-0.25, 0.2, 0.0);
    if (b == B_SHINL) return vec3(0.25, 0.0, 0.0);
    if (b == B_LEGR) return vec3(0.2, -0.2, 0.0);
    return vec3(0.0);
  }
  if (p == P_KNEEL) {
    if (b == B_CHEST) return vec3(0.05 + 0.01 * br, 0.0, 0.0);
    if (b == B_HEAD) return vec3(0.2, 0.0, 0.0);
    if (b == B_LEGL) return vec3(-1.3, 0.08, 0.0);
    if (b == B_LEGR) return vec3(-1.3, -0.08, 0.0);
    if (b == B_SHINL || b == B_SHINR) return vec3(2.8, 0.0, 0.0);
    if (arm) return pPalms(b);
    return vec3(0.0);
  }
  if (p == P_PLANT) {
    // Bent over from the hips (the arms hang in the chest's frame: −1.1 brings them back to the vertical);
    // the right hand dips a seedling into the mud and comes up for the next, the left holds the bundle by the knee.
    float c = sin(t * 3.6 + s);
    float dip = smoothstep(-0.2, 0.9, c);
    if (b == B_HIPS) return vec3(0.0, 0.0, 0.02 * sin(t * 0.4 + s));
    if (b == B_CHEST) return vec3(1.1 + 0.06 * dip, 0.06 * sin(t * 0.3 + s), 0.0);
    if (b == B_HEAD) return vec3(-0.6, 0.12 * sin(t * 0.37 + s), 0.0);
    if (b == B_ARMR) return vec3(-1.25 - 0.3 * dip, 0.0, -0.08);
    if (b == B_FORER) return vec3(-0.15 - 0.1 * (1.0 - dip), 0.0, 0.0);
    if (b == B_ARML) return vec3(-1.35, -0.2, 0.2);
    if (b == B_FOREL) return vec3(-0.75, 0.0, 0.0);
    if (b == B_LEGL) return vec3(-0.35, 0.0, 0.08);
    if (b == B_SHINL) return vec3(0.4, 0.0, 0.0);
    if (b == B_LEGR) return vec3(-0.2, 0.0, -0.08);
    if (b == B_SHINR) return vec3(0.3, 0.0, 0.0);
    return vec3(0.0);
  }
  if (p == P_REAP) {
    // Bent over the rice: the left hand gathers a fistful ahead, the right draws the sickle through it, then lays the cut stalks aside.
    float c = sin(t * 2.6 + s);
    float cut = smoothstep(-0.3, 0.8, c);
    if (b == B_CHEST) return vec3(0.85 + 0.05 * cut, 0.18 * cut - 0.06, 0.0);
    if (b == B_HEAD) return vec3(-0.4, -0.1 * cut, 0.0);
    if (b == B_ARML) return vec3(-1.55 + 0.1 * cut, -0.25, 0.12);
    if (b == B_FOREL) return vec3(-0.35, 0.0, 0.0);
    if (b == B_ARMR) return vec3(-1.2 - 0.35 * cut, 0.2 + 0.35 * cut, -0.15);
    if (b == B_FORER) return vec3(-0.7 + 0.2 * cut, 0.0, 0.0);
    if (b == B_LEGL) return vec3(-0.45, 0.1, 0.1);
    if (b == B_SHINL) return vec3(0.45, 0.0, 0.0);
    if (b == B_LEGR) return vec3(0.1, -0.1, -0.1);
    if (b == B_SHINR) return vec3(0.25, 0.0, 0.0);
    return vec3(0.0);
  }
  if (p == P_ROW) {
    // Seated, knees up: leaning forward to the catch, pulling back (P.walk: how hard).
    float c = pStroke(fract(t * P_ROW_HZ + P.seed)) * P.walk;
    if (b == B_CHEST) return vec3(0.18 + 0.32 * c, 0.0, 0.0);
    if (b == B_HEAD) return vec3(-0.12 - 0.22 * c, 0.0, 0.0);
    if (b == B_ARML) return vec3(-0.95 - 0.45 * c, 0.0, -0.12);
    if (b == B_ARMR) return vec3(-0.95 - 0.45 * c, 0.0, 0.12);
    if (b == B_FOREL || b == B_FORER) return vec3(-0.45 + 0.2 * c, 0.0, 0.0);
    if (b == B_LEGL) return vec3(-1.45, 0.1, 0.0);
    if (b == B_LEGR) return vec3(-1.45, -0.1, 0.0);
    if (b == B_SHINL || b == B_SHINR) return vec3(1.35, 0.0, 0.0);
    return vec3(0.0);
  }
  if (p == P_CHEER) {
    float u = 6.2831853 * (t * P_ROW_HZ * 2.0 + P.seed);
    float pump = sin(u);
    if (b == B_CHEST) return vec3(-0.08, 0.1 * sin(u * 0.5), 0.0);
    if (b == B_HEAD) return vec3(-0.25, 0.15 * sin(t * 0.4 + s), 0.0);
    if (b == B_ARML) return vec3(-2.55 - 0.3 * pump, 0.0, 0.35);
    if (b == B_ARMR) return vec3(-2.55 + 0.3 * pump, 0.0, -0.35);
    if (b == B_FOREL || b == B_FORER) return vec3(-0.25, 0.0, 0.0);
    return base;
  }
  return base;
}

// Which parts a pose leaves to the carry and the walk: (left arm, right arm, legs).
vec3 pFree(int p) {
  if (p == P_STAND) return vec3(1.0, 1.0, 1.0);
  if (p == P_LOOK || p == P_POINT || p == P_WAVE) return vec3(1.0, 0.0, 1.0);
  if (p == P_TALK) return vec3(0.0, 1.0, 1.0);
  if (p == P_PHOTO || p == P_SWEEP || p == P_SAMPEAH || p == P_BOW) return vec3(0.0, 0.0, 1.0);
  return vec3(0.0);
}

// How far the hips go down (m, for a 1.7 m person).
float pDrop(int p, PP P) {
  if (p == P_SIT) return 0.4;
  if (p == P_KNEEL) return 0.33;
  if (p == P_PLANT) return 0.08;
  if (p == P_REAP) return 0.09;
  if (p == P_ROW) return 0.2;
  if (p == P_SWEEP || p == P_CAST) return 0.03;
  if (p == P_DANCE) return 0.075 + 0.015 * sin(P.t * 0.9 + P.seed * 6.0);
  return 0.0;
}

// Carry styles: the arm turns, which arms, and the world tilt of the prop in the hand.
vec3 pCarryRot(int c, int b) {
  if (c == 1) { if (b == B_ARMR) return vec3(-0.35, 0.0, -0.2); if (b == B_FORER) return vec3(-1.2, 0.0, 0.0); }
  if (c == 2) { if (b == B_ARMR) return vec3(-2.6, 0.0, -0.3); if (b == B_FORER) return vec3(-0.3, 0.0, 0.0); }
  if (c == 3) { if (b == B_ARMR) return vec3(-1.2, 0.0, -0.14); if (b == B_FORER) return vec3(-0.4, 0.0, 0.0); }
  if (c == 4) { if (b == B_ARMR) return vec3(-0.2, 0.0, -0.12); if (b == B_FORER) return vec3(-0.9, 0.0, 0.0); }
  if (c == 5) {
    if (b == B_ARML) return vec3(-0.25, 0.0, 0.05);
    if (b == B_FOREL) return vec3(-1.3, -0.55, 0.0);
    if (b == B_ARMR) return vec3(-0.25, 0.0, -0.05);
    if (b == B_FORER) return vec3(-1.3, 0.55, 0.0);
  }
  if (c == 6) { if (b == B_ARML) return vec3(-0.3, 0.0, 0.14); if (b == B_FOREL) return vec3(-0.8, 0.0, 0.0); }
  if (c == 7) {
    if (b == B_ARMR) return vec3(-1.9, 0.2, -0.1);
    if (b == B_FORER) return vec3(-0.5, 0.0, 0.0);
    if (b == B_ARML) return vec3(-1.3, -0.3, 0.1);
    if (b == B_FOREL) return vec3(-0.6, 0.0, 0.0);
  }
  if (c == 8) { if (b == B_ARMR) return vec3(-0.15, 0.2, 0.0); if (b == B_FORER) return vec3(-1.1, 0.0, 0.0); }
  if (c == 9) { if (b == B_ARMR) return vec3(-1.3, 0.0, -0.1); if (b == B_FORER) return vec3(-1.5, 0.0, 0.0); }
  return vec3(0.0);
}
float pCarrySide(int c, bool left) {
  if (c == 0) return 0.0;
  if (c == 5 || c == 7) return 1.0;
  if (c == 6) return left ? 1.0 : 0.0;
  return left ? 0.0 : 1.0;
}
float pCarryGrip(int c) {
  if (c == 1 || c == 2 || c == 3) return -1.5708;
  if (c == 4) return 1.5708;
  if (c == 7) return -1.0;
  return 0.0;
}
// The world tilt of the props in a pose (the grip axis: 0 = level ahead, −π/2 = up).
float pGripTarget(int p, PP P) {
  if (p == P_PHOTO || p == P_CAST || p == P_PLANT) return 0.0;
  if (p == P_REAP) return 0.35;
  if (p == P_SWEEP) return 1.0 + 0.1 * sin(P.t * 1.4 + P.seed * 6.2831);
  return pCarryGrip(P.ctype);
}

vec3 pArm(int b, PP P) {
  bool left = b == B_ARML || b == B_FOREL;
  bool upper = b == B_ARML || b == B_ARMR;
  vec3 r = mix(pRot(P.from, b, P), pRot(P.to, b, P), P.k);
  vec3 fr = mix(pFree(P.from), pFree(P.to), P.k);
  float free = left ? fr.x : fr.y;
  float cw = P.carry * pCarrySide(P.ctype, left) * free;
  r = mix(r, pCarryRot(P.ctype, b), cw);
  // Arms swing against the legs (the left arm back as the left leg goes forward).
  float sw = P.walk * free * (1.0 - cw) * fr.z;
  float s = sin(P.ph) * (left ? 1.0 : -1.0);
  if (upper) r.x += 0.42 * s * sw;
  else r.x -= (0.12 + 0.18 * max(0.0, -s)) * sw;
  return r;
}

vec3 pLeg(int b, PP P) {
  bool left = b == B_LEGL || b == B_SHINL;
  bool upper = b == B_LEGL || b == B_LEGR;
  vec3 r = mix(pRot(P.from, b, P), pRot(P.to, b, P), P.k);
  float w = P.walk * mix(pFree(P.from).z, pFree(P.to).z, P.k);
  float th = P.ph + (left ? 0.0 : 3.14159);
  if (upper) r.x -= 0.46 * sin(th) * w;
  else r.x += 0.75 * max(0.0, cos(th)) * w;
  return r;
}

vec3 pBody(int b, PP P) {
  vec3 r = mix(pRot(P.from, b, P), pRot(P.to, b, P), P.k);
  float w = P.walk * mix(pFree(P.from).z, pFree(P.to).z, P.k);
  if (b == B_HIPS) r.y += 0.07 * sin(P.ph) * w;
  if (b == B_CHEST) {
    r.y += 0.3 * P.yaw - 0.1 * sin(P.ph) * w;
    r.x += 0.05 * w;
  }
  if (b == B_HEAD) {
    r.y += 0.7 * P.yaw;
    r.x += 0.55 * P.pitch + 0.03 * sin(P.ph * 2.0) * w - 0.05 * w;
  }
  return r;
}

mat3 pEuler(vec3 r) {
  return pRotY(r.y) * pRotX(r.x) * pRotZ(r.z);
}

// A hand's grip: undoes the turns of the body and the arm above it, so the
// prop keeps its own tilt (pGripTarget) whatever the arm does, turning only
// with the torso's heading (an umbrella stands upright, the broom sweeps).
mat3 pGrip(int b, PP P) {
  bool left = b == B_GRIPL;
  vec3 h = pBody(B_HIPS, P);
  vec3 c = pBody(B_CHEST, P);
  mat3 chain = pEuler(h) * pEuler(c) * pEuler(pArm(left ? B_ARML : B_ARMR, P)) * pEuler(pArm(left ? B_FOREL : B_FORER, P));
  float target = mix(pGripTarget(P.from, P), pGripTarget(P.to, P), P.k);
  return transpose(chain) * pRotY(h.y + c.y) * pRotX(target);
}

vec3 pBoneRot(int b, PP P) {
  if (b == B_ARML || b == B_ARMR || b == B_FOREL || b == B_FORER) return pArm(b, P);
  if (b >= B_LEGL) return pLeg(b, P);
  return pBody(b, P);
}

float pWeight(int p, PP P) {
  return (P.from == p ? 1.0 - P.k : 0.0) + (P.to == p ? P.k : 0.0);
}

// Does this box show on this person (its feature, and its pose rule)?
bool pShown(PP P) {
  int fi = int(aPart.z + 0.5);
  if (fi > 0) {
    int m = fi <= 24 ? int(aPLook.x + 0.5) : int(aPLook.y + 0.5);
    int bit = fi <= 24 ? fi - 1 : fi - 25;
    if (((m >> bit) & 1) == 0) return false;
  }
  int show = int(aPart.w + 0.5);
  if (show == 0) return true;
  float photo = pWeight(P_PHOTO, P);
  if (show == 1) return photo < 0.5;
  if (show == 2) return photo >= 0.5;
  if (show == 4) return pWeight(P_DANCE, P) >= 0.5;
  return pWeight(P_SAMPEAH, P) + pWeight(P_BOW, P) + pWeight(P_KNEEL, P) >= 0.5;
}

void pSkin(inout vec3 p, inout vec3 n, PP P) {
  if (!pShown(P)) {
    p = vec3(0.0);
    return;
  }
  int b = int(aPart.x + 0.5);
  for (int i = 0; i < 5; i++) {
    if (b < 0) break;
    // (dancing, the wrists bend back from the forearms, swaying a little: the apsara's hands)
    mat3 R = b == B_GRIPL || b == B_GRIPR
      ? (pWeight(P_DANCE, P) >= 0.5 ? pEuler(vec3(-1.25 + 0.15 * sin(P.t * 0.8 + P.seed * 6.2831 + float(b)), 0.0, 0.0)) : pGrip(b, P))
      : pEuler(pBoneRot(b, P));
    vec3 pv = P_PIVOT[b];
    p = pv + R * (p - pv);
    n = R * n;
    b = P_PARENT[b];
  }
  float w = P.walk * mix(pFree(P.from).z, pFree(P.to).z, P.k);
  float drop = mix(pDrop(P.from, P), pDrop(P.to, P), P.k);
  p.y += (0.016 - 0.034 * abs(sin(P.ph))) * w - drop;
}
`;

interface CrowdUniforms {
  uPTime: { value: number };
  uPEase: { value: { x: number; y: number; z: number; w: number } };
  uPEasePitch: { value: number };
  uPPal: { value: DataTexture };
  uPGlow: { value: number };
}

function inject(shader: WebGLProgramParametersWithUniforms, u: CrowdUniforms, colour: boolean): void {
  Object.assign(shader.uniforms, u);
  const pars = colour ? `\nuniform sampler2D uPPal;\nuniform float uPGlow;\nvarying vec3 vPColor;\nvarying vec3 vPGlow;\n` : '';
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${GLSL}${pars}`);
  const pose = /* glsl */ `
  PP pP = pState();
  vec3 pPos = position;
  vec3 pNrm = normal;
  pSkin(pPos, pNrm, pP);
`;
  if (colour) {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <beginnormal_vertex>',
        `${pose}
  vec3 objectNormal = pNrm;
  int pSlot = int(aPart.y + 0.5);
  vPColor = texelFetch(uPPal, ivec2(pSlot, gl_InstanceID), 0).rgb;
  vPGlow = pSlot == ${SLOT.flame} ? vPColor * uPGlow : vec3(0.0);
  // Undersides a little darker (no bounce light there).
  vPColor *= 0.84 + 0.16 * smoothstep(-1.0, 0.2, normal.y);`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = pPos;');
  } else shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `${pose}\n  vec3 transformed = pPos;`);
}

// ── The crowd: every person on the map, one InstancedMesh ──────────────────

/** Eased channels per person: (from, to, start, extra). */
const CH = { gait: 0, pose: 1, carry: 2, yaw: 3, pitch: 4 } as const;
/** Ease times (s): gait, pose, carry, head turn, head tilt. */
const EASE = [0.35, 0.55, 0.6, 0.5, 0.6];

/** Metres one step cycle (two steps) carries a person at full stride (true scale; times the drawn size). */
export const STRIDE = 0.86;

/**
 * Every person on the map: one InstancedMesh (plus its shadow), fed per
 * person through `place` (feet, heading) and the eased channels (`gait`,
 * `pose`, `carry`, `look`). Things are written only when they change;
 * `flush` flags the buffers once a frame. Make it with room for everyone
 * (`capacity`), then `add` people.
 */
export class Crowd {
  readonly mesh: InstancedMesh;
  readonly capacity: number;
  /** People added so far. */
  count = 0;
  private readonly ch: Float32Array[] = [];
  private readonly attrs: InstancedBufferAttribute[] = [];
  private readonly looks: Float32Array;
  private readonly lookAttr: InstancedBufferAttribute;
  private readonly pal: Float32Array;
  private readonly palTex: DataTexture;
  private readonly shown: Uint8Array;
  private readonly size: Float32Array;
  private readonly uniforms: CrowdUniforms;
  private dirtyRoot = false;
  private dirtyCh = 0;
  private dirtyLook = false;
  private base = 0;
  /** Boxes in the model (all features). */
  readonly boxes: number;

  constructor(capacity: number, name = 'people') {
    this.capacity = capacity;
    const model = buildModel();
    this.boxes = model.boxes;
    const geo = model.geometry();
    for (let c = 0; c < 5; c++) {
      const a = new Float32Array(capacity * 4);
      const attr = new InstancedBufferAttribute(a, 4);
      attr.setUsage(DynamicDrawUsage);
      geo.setAttribute(`aPCh${c}`, attr);
      this.ch.push(a);
      this.attrs.push(attr);
    }
    this.looks = new Float32Array(capacity * 4);
    this.lookAttr = new InstancedBufferAttribute(this.looks, 4);
    geo.setAttribute('aPLook', this.lookAttr);
    this.pal = new Float32Array(SLOTS * capacity * 4);
    this.palTex = new DataTexture(this.pal, SLOTS, capacity, RGBAFormat, FloatType);
    this.palTex.magFilter = this.palTex.minFilter = NearestFilter;
    this.palTex.generateMipmaps = false;
    this.palTex.needsUpdate = true;
    this.uniforms = {
      uPTime: { value: 0 },
      uPEase: { value: { x: EASE[0], y: EASE[1], z: EASE[2], w: EASE[3] } },
      uPEasePitch: { value: EASE[4] },
      uPPal: { value: this.palTex },
      uPGlow: { value: 1.5 },
    };
    const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
    material.name = `${name}:body`;
    const u = this.uniforms;
    material.onBeforeCompile = (shader) => {
      inject(shader, u, true);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPColor;\nvarying vec3 vPGlow;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vPColor;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vPGlow;');
    };
    material.customProgramCacheKey = () => `people:${name}`;
    const depth = new MeshDepthMaterial();
    depth.name = `${name}:depth`;
    depth.onBeforeCompile = (shader) => inject(shader, u, false);
    depth.customProgramCacheKey = () => `people-depth:${name}`;
    const mesh = new InstancedMesh(geo, material, capacity);
    mesh.name = `${name}:crowd`;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    // (people are spread over the whole map: one draw, no culling)
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.customDepthMaterial = depth;
    mesh.count = 0;
    this.mesh = mesh;
    this.shown = new Uint8Array(capacity);
    this.size = new Float32Array(capacity).fill(PEOPLE_SCALE);
    (mesh.instanceMatrix.array as Float32Array).fill(0);
    for (let i = 0; i < capacity; i++) for (let c = 0; c < 5; c++) this.ch[c][i * 4 + 2] = -1e4;
  }

  /** A new person wearing `look` (hidden until placed); returns their index. */
  add(look: Look): number {
    if (this.count >= this.capacity) throw new Error('people: crowd is full');
    const i = this.count++;
    this.mesh.count = this.count;
    this.dress(i, look);
    return i;
  }

  /** Change what person `i` wears and carries. */
  dress(i: number, look: Look): void {
    let lo = 0;
    let hi = 0;
    for (const ft of look.feats) {
      if (ft <= 24) lo |= 1 << (ft - 1);
      else hi |= 1 << (ft - 25);
    }
    const o = i * 4;
    this.looks[o] = lo;
    this.looks[o + 1] = hi;
    this.looks[o + 2] = look.carry;
    this.looks[o + 3] = look.seed;
    this.dirtyLook = true;
    const c = new Color();
    for (let s = 0; s < SLOTS; s++) {
      c.setHex(look.colors[s] ?? 0xff00ff);
      const p = (i * SLOTS + s) * 4;
      this.pal[p] = c.r;
      this.pal[p + 1] = c.g;
      this.pal[p + 2] = c.b;
      this.pal[p + 3] = 1;
    }
    this.palTex.needsUpdate = true;
    this.size[i] = PEOPLE_SCALE * look.height;
  }

  /** Drawn size of person `i` (m per model metre). */
  scale(i: number): number {
    return this.size[i];
  }

  /** Put person `i` on the map: feet at (x, y, z), facing `yaw` (0 = +z, turning to +x). */
  place(i: number, x: number, y: number, z: number, yaw: number): void {
    const m = this.mesh.instanceMatrix.array as Float32Array;
    const o = i * 16;
    const k = this.size[i];
    const c = Math.fround(Math.cos(yaw) * k);
    const s = Math.fround(Math.sin(yaw) * k);
    x = Math.fround(x);
    y = Math.fround(y);
    z = Math.fround(z);
    if (this.shown[i] && m[o + 12] === x && m[o + 13] === y && m[o + 14] === z && m[o] === c && m[o + 8] === s) return;
    this.shown[i] = 1;
    m[o] = c;
    m[o + 2] = -s;
    m[o + 5] = k;
    m[o + 8] = s;
    m[o + 10] = c;
    m[o + 12] = x;
    m[o + 13] = y;
    m[o + 14] = z;
    m[o + 15] = 1;
    this.dirtyRoot = true;
  }

  /** Hide person `i` (folds them to a point). */
  hide(i: number): void {
    if (!this.shown[i]) return;
    this.shown[i] = 0;
    const m = this.mesh.instanceMatrix.array as Float32Array;
    m.fill(0, i * 16, i * 16 + 16);
    this.dirtyRoot = true;
  }

  isShown(i: number): boolean {
    return this.shown[i] === 1;
  }

  private value(i: number, c: number, t: number): number {
    const a = this.ch[c];
    const o = i * 4;
    let k = (t - this.base - a[o + 2]) / EASE[c];
    k = k < 0 ? 0 : k > 1 ? 1 : k;
    return a[o] + (a[o + 1] - a[o]) * k * k * (3 - 2 * k);
  }

  private set(i: number, c: number, v: number, t: number, snap: boolean): void {
    const a = this.ch[c];
    const o = i * 4;
    // (compared as the buffer holds it: a value a float32 cannot hold exactly would never match, re-easing every frame)
    v = Math.fround(v);
    if (a[o + 1] === v && (!snap || a[o] === v)) return;
    a[o] = snap ? v : this.value(i, c, t);
    a[o + 1] = v;
    a[o + 2] = t - this.base;
    this.dirtyCh |= 1 << c;
  }

  /**
   * Walking: `walk` 0 (still) ‥ 1 (a full stride; less is a shorter, slower
   * step) at `hz` step cycles a second (`stepRate` gives it for a speed),
   * keeping the step phase where it is.
   */
  gait(i: number, walk: number, hz: number, t: number): void {
    this.set(i, CH.gait, walk, t, false);
    const o = i * 4 + 3;
    const rate = this.ch[CH.pose];
    if (Math.abs(rate[o] - hz) < 1e-3) return;
    const g = this.ch[CH.gait];
    const tt = t - this.base;
    const phase = tt * rate[o] * Math.PI * 2 + g[o];
    g[o] = (phase - tt * hz * Math.PI * 2) % (Math.PI * 2);
    rate[o] = hz;
    this.dirtyCh |= (1 << CH.gait) | (1 << CH.pose);
  }

  /** Step cycles a second for person `i` walking at `speed` m/s with stride share `walk`. */
  stepRate(i: number, speed: number, walk = 1): number {
    return Math.round((speed / (STRIDE * this.size[i] * Math.max(0.3, walk))) * 50) / 50;
  }

  /** Ease person `i` into pose `p` (`snap`: at once). */
  pose(i: number, p: Pose, t: number, snap = false): void {
    const a = this.ch[CH.pose];
    const o = i * 4;
    if (a[o + 1] === p && (!snap || a[o] === p)) return;
    // (mid-blend, the new blend starts from the nearer of the two)
    const k = (t - this.base - a[o + 2]) / EASE[CH.pose];
    a[o] = snap ? p : k < 0.5 ? a[o] : a[o + 1];
    a[o + 1] = p;
    a[o + 2] = t - this.base;
    this.dirtyCh |= 1 << CH.pose;
  }

  /** The pose person `i` is going to. */
  poseOf(i: number): Pose {
    return this.ch[CH.pose][i * 4 + 1] as Pose;
  }

  /** How much person `i` holds their prop the carry way (0‥1, eased). */
  carry(i: number, w: number, t: number, snap = false): void {
    this.set(i, CH.carry, w, t, snap);
  }

  /** Head of person `i`: turn (rad against the body, + = to their left; the chest takes a third) and tilt (−1 up ‥ 1 down). */
  look(i: number, yaw: number, pitch: number, t: number, snap = false): void {
    this.set(i, CH.yaw, Math.round(Math.max(-1.3, Math.min(1.3, yaw)) * 50) / 50, t, snap);
    this.set(i, CH.pitch, Math.round(Math.max(-1, Math.min(1, pitch)) * 20) / 20, t, snap);
  }

  /** Once a frame: the shader clock, the glow (brighter at night), and the buffers that changed. */
  flush(t: number, night = 0): void {
    if (t - this.base > 600) {
      const shift = Math.floor((t - this.base) / 600) * 600;
      for (let i = 0; i < this.count; i++) {
        const o = i * 4;
        for (let c = 0; c < 5; c++) this.ch[c][o + 2] = Math.max(-1e4, this.ch[c][o + 2] - shift);
        this.ch[CH.gait][o + 3] = (this.ch[CH.gait][o + 3] + shift * this.ch[CH.pose][o + 3] * Math.PI * 2) % (Math.PI * 2);
      }
      this.base += shift;
      this.dirtyCh = 0b11111;
    }
    this.uniforms.uPTime.value = t - this.base;
    this.uniforms.uPGlow.value = 1.2 + 3.2 * night;
    if (this.dirtyRoot) this.mesh.instanceMatrix.needsUpdate = true;
    for (let c = 0; c < 5; c++) if (this.dirtyCh & (1 << c)) this.attrs[c].needsUpdate = true;
    if (this.dirtyLook) this.lookAttr.needsUpdate = true;
    this.dirtyRoot = false;
    this.dirtyCh = 0;
    this.dirtyLook = false;
  }

  /** Seconds into the net-casting cycle of person `i` at time `t` (0‥6: the throw leaves the hands at ≈ 4.4 s), for a thrown net to follow. */
  castPhase(i: number, t: number): number {
    const u = ((t - this.base) / 6 + this.looks[i * 4 + 3]) % 1;
    return u * 6;
  }

  /**
   * Where person `i`'s right fist is (m, on the map), holding the prop the
   * carry way (at full carry) or hanging at the side: for a light, a kite
   * string or a sound to start from.
   */
  handAt(i: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const m = this.mesh.instanceMatrix.array as Float32Array;
    const o = i * 16;
    const k = this.size[i];
    const c = this.value(i, CH.carry, this.uniforms.uPTime.value + this.base);
    const hold = HAND[this.looks[i * 4 + 2]] ?? HAND[0];
    const lx = HAND[0][0] + (hold[0] - HAND[0][0]) * c;
    const ly = HAND[0][1] + (hold[1] - HAND[0][1]) * c;
    const lz = HAND[0][2] + (hold[2] - HAND[0][2]) * c;
    // (the matrix holds cos·k, sin·k: rows of a turn about y)
    out.x = m[o + 12] + m[o] * lx + m[o + 8] * lz;
    out.y = m[o + 13] + ly * k;
    out.z = m[o + 14] + m[o + 2] * lx + m[o + 10] * lz;
    return out;
  }
}

/** The right fist (model metres) by carry style at full carry (index 0: hanging at the side). */
const HAND: V3[] = [
  [-0.31, 0.56, 0.03],
  [-0.34, 0.74, 0.25],
  [-0.35, 1.31, 0.15],
  [-0.33, 0.87, 0.38],
  [-0.32, 0.66, 0.2],
  [-0.2, 0.72, 0.23],
  [-0.31, 0.56, 0.03],
  [-0.3, 1.2, 0.35],
  [-0.28, 0.66, 0.2],
  [-0.3, 1.05, 0.27],
];
