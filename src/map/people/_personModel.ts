import {
  BufferGeometry,
  Color,
  DataTexture,
  DynamicDrawUsage,
  Float32BufferAttribute,
  FloatType,
  Frustum,
  GLSL3,
  HalfFloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  NearestFilter,
  OrthographicCamera,
  RawShaderMaterial,
  RGBAFormat,
  Scene,
  Sphere,
  type Texture,
  type TextureDataType,
  Uint16BufferAttribute,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { graphicsNow } from '../graphics';
import { ROAM_SCALE } from '../roam/types';
import { SlotMarks } from './_things';

/**
 * The people of the map: one blocky person model (boxes on 15 bones, in the
 * explorer's big-headed voxel proportions) that every kind of person wears
 * differently, all of them drawn by ONE InstancedMesh (a draw, and one more
 * for its shadow) and posed on the GPU: their bones once a frame in a small
 * texture (the bone pass, `BONE_VERTEX`), which the vertex shader reads (on
 * a renderer that cannot draw into float textures, every vertex poses
 * itself, like the animals: fauna/_kit.ts). Far off they are drawn by a second, much simpler model
 * (the far model: ≈ 60 boxes instead of ≈ 260, a person showing ≈ 18 of
 * them), and nobody hidden costs anything (see "Cost" below).
 *
 * How it fits together:
 *
 * - **Boxes** (`buildModel`, and `buildFarModel` for the far model): each box
 *   sits on a bone, is painted with a colour `SLOT`, and may belong to a
 *   **feature** (`FEAT`: a hair style, a hat, the monk's robe, a backpack, a
 *   prop like the umbrella…). A person shows the features in their look; the
 *   others fold away to a point.
 * - **Colours**: every person has their own row of slot colours in a small
 *   float texture (row = person), so no two visitors need to dress alike.
 * - **Poses** (`POSE`): whole-body poses (stand, look up, point, take a
 *   photo, sweep, sit, sampeah, climb a palm, squat, ride a bicycle…) blended
 *   in the shader: a change of pose is one write (from, to, start) and the
 *   GPU eases it. On top: the **gait** (legs and arms swing with a step
 *   phase), the **carry** (how the arms hold the person's prop while standing
 *   or walking: umbrella up, flag high, bowl at the belly, a basket on the
 *   head…), and the head's **look** (turn, tilt). Breathing and small idle
 *   moves come from time and a per-person seed.
 * - **Props** ride a grip bone in each hand; the shader turns the grip so
 *   the prop keeps a sensible world angle whatever the arm does (the umbrella
 *   and flag stand upright, the broom leans to the ground, the net hangs, the
 *   paddle dips into the wok).
 * - **Fit** (`FIT`): where the body meets the things the scenes build (the
 *   pole a climber holds, a stool's seat, the wok's middle, a bicycle's
 *   saddle, bars and pedals, the hammock's sag), in model metres: times
 *   `crowd.scale(i)` on the map.
 *
 * Driving people: `crowd.add(look)` gives a person's index; `place` (feet,
 * heading), `gait` (walk share and step rate: `stepRate`, `climbRate`),
 * `pose`, `carry` and `look` write only what changed; `flush(t, night,
 * camera)` once a frame. `handAt` says where the right fist is (a torch's
 * light, a kite's string), `castPhase` where the net throw is, `phaseOf`
 * where the step (or pedal, or climbing) cycle is. `_actor.ts` wraps all
 * this for one person walking about.
 *
 * Cost (`new Crowd(n, name, { lod: true, renderer })`, the people part):
 * each frame the people shown are packed into two lists, near and far (by
 * their size on screen: `LOD_SHARE`, by the graphics level), each drawn by
 * its own InstancedMesh of that many instances (the same material: one
 * shader), so a hidden person costs nothing and a far one a fifth of a near
 * one; out of the camera's view they are left out too while they cast no
 * shadow (the low level: `pack`). Only what changed goes up to the GPU. The
 * bone pass poses the people shown (46 texels each: the pose's math, once a
 * bone) and costs about one small draw; a vertex then reads three texels
 * (`pbones=0` in the URL: every vertex posed by itself, ≈ 5–10 times the
 * crowd's GPU time). Without `lod` (the festival's crowd) instance i is
 * person i, hidden people fold to a point (a quick early out in the
 * shader).
 *
 * Adding things (see also the notes by each table):
 * - a **kind**: dress it in `_kinds.ts` (features + colours + carry + size);
 * - a **feature / prop**: a new `FEAT` id (≤ 48) and its boxes in
 *   `buildModel` (and, if it shows from afar, a box or two in
 *   `buildFarModel`); props in the right hand: build them round the fist at
 *   `FIST_R`, the stick along +z: the grip holds that axis at the pose's
 *   tilt; boxes that show only in some poses: `SHOW`;
 * - a **pose**: a new `POSE` id, then in `GLSL` its bone turns in `pRot`,
 *   which arms / legs stay free in `pFree`, how far the hips drop in
 *   `pDrop`, whether the feet stay level (`pFlat`), and (if it holds the
 *   props its own way) `pGripTarget`;
 * - a **carry** style: `CARRY` id + `pCarryRot`, `pCarrySide`, `pCarryGrip`
 *   (and the fist in `HAND`).
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
   * Rowing a racing boat (ngo), seated on a thwart (festival/): the stroke comes from
   * `fract(t · ROW_HZ + seed)` (give a crew one `seed`: they row in time) and its
   * strength from the gait's walk share (`gait(i, 0‥1, 0)`: 0 resting … 1 racing).
   */
  row: 15,
  /** Cheering: both arms up, pumping in turn (twice a `ROW_HZ` stroke; a boat's caller keeps its crew's time). */
  cheer: 16,
  /**
   * Climbing a pole ladder (the palm tapper's bamboo against the trunk): facing the pole
   * (`FIT.climb.reach` in front of the feet), the hands one over the other on it, the knees
   * up in turn, the feet level on its pegs. The gait drives it: `gait(i, 1, climbRate(i,
   * speed))` climbs while the scene raises the person `speed` m/s (a cycle, a step with each
   * foot, rises `FIT.climb.rise`; a negative speed climbs down, the cycle backwards);
   * `gait(i, 0, 0)` holds on: the left hand high on the pole, the right working at the crown
   * (with `FEAT.knife` the blade slices the flower stalk, a slow stroke).
   */
  climb: 17,
  /** Squatting low (the Khmer squat), heels down, forearms on the knees, looking about: a seller behind her goods, a cook at a low stove. The knees reach ≈ 0.35 m in front of the feet (model: times the scale). */
  squat: 18,
  /** Stirring a big wok with a long paddle (`FEAT.paddle`) in both hands, leaning in, a slow round stroke; the blade works at `FIT.wok` in front of the feet. */
  stir: 19,
  /** Sitting on a low stool (its seat `FIT.stool` high under the hips), knees up, hands on the knees, looking about. */
  stool: 20,
  /** On a low stool (as `stool`) eating: the bowl (`FEAT.smallBowl`) in the left hand at the chest, the right bringing food to the mouth every few seconds. */
  eat: 21,
  /** Handing something over with both hands held out, bowing a little (a parcel: `FEAT.parcel`; with `CARRY.tray` the tray itself). */
  give: 22,
  /**
   * Riding a bicycle: on the saddle, hands on the bars, the feet on the pedals (`FIT.bike`;
   * `_bicycle.ts` builds a bicycle that fits). The gait's phase turns the pedals: `gait(i, 1,
   * turns a second)` (`FIT.bike.gear` m a turn), `gait(i, 1, 0)` coasting; `phaseOf` turns the
   * bicycle's crank with them.
   */
  ride: 23,
  /** Lying back in a hammock along the heading, the head to the back (`FIT.hammock`), a knee up, hands on the belly (the scene rocks the person: `place` a swaying point). */
  hammock: 24,
  /** A monk's greeting back: a small slow nod as the pose begins (then the head stays a little bowed), the right hand raised a little in blessing (monks do not sampeah lay people). */
  nod: 25,
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
  /**
   * A round basket on the head (`FEAT.headBasket`): carried (1) the right arm goes up and the
   * hand steadies it; let go (0) it rides balanced, both arms swinging.
   */
  head: 10,
  /** A flat woven tray of goods (`FEAT.tray`) held in front at the belly in both hands; it shows only while held (or offered: `give`). */
  tray: 11,
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
  /** The krama's white checks, the sash (sbai). */
  accent2: 15,
  /** Bags, the money pouch. */
  bag: 16,
  /** Camera, phone, sunglasses, the alms bowl, blades. */
  gear: 17,
  /** Umbrella cover, flag, net; a basket's or tray's load, the juice tubes, lotus buds. */
  prop: 18,
  /** Ties and bindings, a parcel, lotus stems. */
  prop2: 19,
  /** Sticks and handles, broom straw, woven baskets and trays, incense sticks. */
  wood: 20,
  /** Jewellery, the apsara's headdress. */
  gold: 21,
  /** The torch's flame, incense tips: glows (blooms at night). */
  flame: 22,
  /** A small bowl's porcelain, a shirt's white. */
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
  /** The apsara's Khmer crown (mokot): a gold band and diadem with three tall spikes, jasmine strands and flowers hanging at the sides, ear ornaments. */
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
  /** Bamboo juice tubes (bampong: `prop` the bamboo, `prop2` the cord and ties) hanging mouth up from a cord round the waist at the back (the palm tapper). */
  tubes: 32,
  /**
   * The tapper's long knife (`gear` blade, `wood` handle): in the right hand, the blade
   * hanging (turned up to the flower stalks at work in `climb`); while climbing, or while the
   * right hand holds a carry (the shoulder pole), it rides in its wooden holder at the hip.
   */
  knife: 33,
  /** A long wooden paddle in both hands (palm syrup, a noodle pot): shows in the `stir` pose (else it is left in the wok). */
  paddle: 34,
  /** A small bowl on the left palm (`white`, its food `prop`) and chopsticks in the right hand (`wood`): eating. */
  smallBowl: 35,
  /** A round woven basket on the head (`wood`, its rim `prop2`, its load heaped: `prop`) on a coiled krama (`accent`): `CARRY.head`. */
  headBasket: 36,
  /** A flat woven tray of goods (`wood`, the goods `prop`, `prop2`) held at the belly: `CARRY.tray`. */
  tray: 37,
  /** A small parcel (a bag of goods, rice in a banana leaf: `prop2`, its tie `accent2`) held out in both hands in the `give` pose. */
  parcel: 38,
  /** A money pouch at the waist on a thin belt (the market seller's: `bag`). */
  pouch: 39,
  /** A sash (sbai) over the left shoulder, across the chest to the right hip, front and back (`accent2`: white for the pagoda). */
  sash: 40,
  /**
   * Lotus buds and incense sticks (`prop` the buds, `prop2` their stems, `wood` the sticks,
   * `flame` their glowing tips): raised between the palms in the sampeah, bow and kneel
   * poses, else upright in the left hand (pilgrims, a prayer at a shrine).
   */
  offering: 41,
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

/**
 * Where the body meets the scenes' things, in model metres from the feet
 * (the person's origin; +z ahead): times `crowd.scale(i)` on the map.
 */
export const FIT = {
  /**
   * `climb`: the ladder's pole (the palm's bamboo) stands `reach` in front of the feet; a
   * climbing cycle (a step with each foot) rises `rise`; the pegs under the feet are ≈ 0.19 apart.
   */
  climb: { reach: 0.33, rise: 0.37 },
  /** `stool`, `eat`: the stool's seat top under the thighs (a low Khmer stool: 0.24 m for an adult on the map). */
  stool: 0.17,
  /** `stir`: the paddle's blade works at the wok's middle, `z` ahead and `y` up (its bottom): a rim ≈ 0.12 higher, ≈ 0.6 across. */
  wok: { z: 0.78, y: 0.38 },
  /**
   * `ride`: the saddle's top, the handlebar grips (x either side, y, z), the crank's axle
   * (y, z) and its arm, the metres a turn of the pedals carries the bicycle (`gear`: the
   * step rate is `speed / (gear · scale)`).
   */
  bike: { saddle: 0.585, bars: [0.19, 0.84, 0.38] as const, crank: [0.19, 0.12] as const, arm: 0.1, gear: 1.5 },
  /** `hammock`: the body lies along the heading, the head `head` behind the feet origin; the lowest point (the seat of the sag) is at the origin, the head ≈ 0.2 up, the heels ≈ 0.1. */
  hammock: { head: -1.0, feet: 0.55 },
} as const;

// ── The model (rest pose: standing, facing +z, feet on y = 0, +x = the person's LEFT; metres for a 1.7 m adult) ──

const BONES = ['hips', 'chest', 'head', 'armL', 'foreL', 'gripL', 'armR', 'foreR', 'gripR', 'legL', 'shinL', 'legR', 'shinR', 'footL', 'footR'] as const;
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
  footL: 'shinL',
  footR: 'shinR',
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
  footL: [LEG_X, 0.07, -0.02],
  footR: [-LEG_X, 0.07, -0.02],
};
/** Middle of the right fist in the rest pose (props in the right hand are built round it). */
export const FIST_R: V3 = [-ARM_X, 0.555, 0];

/**
 * When a box shows, besides its feature: always; not while taking a photo /
 * only then; only with the palms together (sampeah, bow, kneel) / not then;
 * only while dancing; while the head basket is held (the steadying hand) /
 * not then (the right hand's own box); while the tray is held or offered;
 * while stirring; in the give pose; the knife in the hand / in its holder
 * (while climbing, or while the right hand holds the carry: the pole).
 */
const SHOW = { always: 0, notPhoto: 1, photo: 2, palms: 3, dance: 4, notPalms: 5, holdHead: 6, notHoldHead: 7, holdTray: 8, stir: 9, give: 10, knifeHand: 11, knifeHolder: 12 } as const;

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

  /** A round thing as two crossed boxes (an octagon) on a bone: centre, width, height, the cross's narrow share. */
  round(bone: BoneName, c: V3, w: number, h: number, k: number, slot: number, feat: number, show: number = SHOW.always): this {
    return this.box(bone, c, [w, h, w * k], slot, feat, show).box(bone, c, [w * k, h, w], slot, feat, show);
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
  /** A box in the left hand, `c` relative to the fist. */
  const inL = (c: V3, s: V3, slot: number, feat: number, show: number = SHOW.always) => m.box('gripL', [ARM_X + c[0], fy + c[1], fz + c[2]], s, slot, feat, show);

  // ── Body (everyone) ──
  // Pelvis, thighs, shins, feet (bare, sandals or shoes by colour: on the ankles, so they can stay level) on thin soles.
  m.box('hips', [0, 0.575, -0.01], [0.44, 0.1, 0.26], S.hips)
    .boxLR('leg*', [LEG_X, 0.41, -0.02], [0.185, 0.24, 0.2], S.thigh)
    .boxLR('shin*', [LEG_X, 0.185, -0.02], [0.165, 0.23, 0.18], S.shin)
    .boxLR('foot*', [LEG_X, 0.04, 0.03], [0.17, 0.06, 0.27], S.foot)
    .boxLR('foot*', [LEG_X, 0.005, 0.03], [0.18, 0.012, 0.28], S.sole);
  // Chest, neck.
  m.box('chest', [0, 0.81, 0], [0.46, 0.38, 0.29], S.top).box('chest', [0, 1.03, 0], [0.2, 0.07, 0.18], S.skin);
  // Arms: sleeve, forearm, hand (the right hand gives way to the long reach up to a head basket: `CARRY.head`).
  m.box('armL', [ARM_X, 0.845, 0], [0.13, 0.23, 0.14], S.sleeveL)
    .box('armR', [-ARM_X, 0.845, 0], [0.13, 0.23, 0.14], S.sleeveR)
    .box('foreL', [ARM_X, 0.665, 0], [0.12, 0.13, 0.13], S.foreL)
    .box('foreR', [-ARM_X, 0.665, 0], [0.12, 0.13, 0.13], S.foreR)
    .box('foreL', [ARM_X, 0.555, 0.005], [0.115, 0.09, 0.12], S.skin)
    .box('foreR', [-ARM_X, 0.555, 0.005], [0.115, 0.09, 0.12], S.skin, 0, SHOW.notHoldHead);
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
  const hat = (y: number, w: number, h: number, k: number, slot: number) => m.round('head', [0, y, 0], w, h, k, slot, F.hatPalm);
  hat(1.625, 1.08, 0.03, 0.71, S.hat);
  hat(1.607, 1.12, 0.022, 0.71, S.trim);
  m.box('head', [0, 1.6415, 0], [1.02, 0.004, 0.035], S.straw, F.hatPalm).box('head', [0, 1.6415, 0], [0.035, 0.004, 1.02], S.straw, F.hatPalm);
  hat(1.725, 0.58, 0.2, 0.74, S.hat);
  hat(1.85, 0.54, 0.05, 0.72, S.hat);
  hat(1.665, 0.6, 0.05, 0.74, S.trim);
  hat(1.882, 0.13, 0.018, 0.62, S.straw);
  // Krama wound round the head: a white band over the brow and a folded top, checked with crossing stripes of
  // its colour (whole boxes a hair bigger: each shows on every face it reaches, crossings are the same colour),
  // a knot at the back on the left and a short tail hanging from it, its white fringe at the end.
  m.box('head', [0, 1.53, 0.01], [0.62, 0.18, 0.51], S.accent2, F.kramaHead)
    .box('head', [0, 1.64, 0.01], [0.56, 0.05, 0.46], S.accent2, F.kramaHead)
    .box('head', [0, 1.485, 0.01], [0.625, 0.04, 0.515], S.accent, F.kramaHead)
    .box('head', [0, 1.575, 0.01], [0.625, 0.04, 0.515], S.accent, F.kramaHead);
  for (const x of [-0.17, 0, 0.17]) m.box('head', [x, 1.53, 0.01], [0.04, 0.185, 0.515], S.accent, F.kramaHead);
  for (const z of [-0.1, 0.12]) m.box('head', [0, 1.53, z], [0.625, 0.185, 0.04], S.accent, F.kramaHead);
  m.box('head', [0, 1.64, 0.01], [0.04, 0.054, 0.465], S.accent, F.kramaHead)
    .box('head', [0, 1.64, 0.01], [0.565, 0.054, 0.04], S.accent, F.kramaHead)
    .box('head', [0.2, 1.53, -0.265], [0.12, 0.11, 0.09], S.accent, F.kramaHead)
    .box('head', [0.23, 1.39, -0.275], [0.09, 0.18, 0.04], S.accent, F.kramaHead)
    .box('head', [0.23, 1.285, -0.275], [0.092, 0.035, 0.042], S.accent2, F.kramaHead);
  // The Khmer apsara crown (mokot), as on Angkor Wat's devata and in the Royal Ballet's Robam Tep Apsara: a gold
  // band and diadem with a red jewel at the front, THREE tall spikes in a row across it (the middle one tallest,
  // each tapering to its point, a jewel at its foot), strands of white jasmine hanging at the sides by the ears,
  // ending in red flower clusters, and gold ear ornaments. (Not the Thai chada: one tiered spire.)
  m.box('head', [0, 1.62, 0.01], [0.61, 0.06, 0.5], S.gold, F.headdress)
    .box('head', [0, 1.675, 0.03], [0.5, 0.07, 0.4], S.gold, F.headdress)
    .box('head', [0, 1.66, 0.25], [0.1, 0.1, 0.03], S.accent, F.headdress);
  for (const [x, h] of [[0, 1], [-0.16, 0.72], [0.16, 0.72]]) {
    m.box('head', [x, 1.72 + 0.09 * h, 0.05], [0.11, 0.18 * h, 0.1], S.gold, F.headdress)
      .box('head', [x, 1.72 + 0.24 * h, 0.05], [0.065, 0.14 * h, 0.065], S.gold, F.headdress)
      .box('head', [x, 1.72 + 0.35 * h, 0.05], [0.03, 0.1 * h, 0.03], S.gold, F.headdress)
      .box('head', [x, 1.74, 0.105], [0.05, 0.05, 0.02], S.accent, F.headdress);
  }
  m.boxLR('head', [0.318, 1.42, 0.03], [0.04, 0.3, 0.07], S.white, F.headdress)
    .boxLR('head', [0.322, 1.25, 0.03], [0.055, 0.07, 0.08], S.accent, F.headdress)
    .boxLR('head', [0.31, 1.16, 0.06], [0.03, 0.12, 0.05], S.gold, F.headdress);
  m.boxLR('head', [0.12, 1.255, 0.257], [0.15, 0.085, 0.02], S.gear, F.glasses).box('head', [0, 1.27, 0.257], [0.1, 0.025, 0.018], S.gear, F.glasses);
  // A round woven basket on the head, sitting on a coiled krama: its sides, a darker rim, the load heaped in it
  // (fruit, greens, fish: `prop`), a little higher in the middle.
  m.round('head', [0, 1.675, 0.01], 0.36, 0.04, 0.7, S.accent, F.headBasket)
    .round('head', [0, 1.775, 0.01], 0.64, 0.17, 0.72, S.wood, F.headBasket)
    .round('head', [0, 1.865, 0.01], 0.68, 0.03, 0.72, S.prop2, F.headBasket)
    .round('head', [0, 1.9, 0.01], 0.54, 0.07, 0.7, S.prop, F.headBasket)
    .box('head', [0.04, 1.955, 0.03], [0.24, 0.07, 0.2], S.prop, F.headBasket);

  // ── Clothes ──
  // Monk's robe: bare right shoulder and upper chest, a fold from the left shoulder down to the right hip (front and back).
  m.box('chest', [-0.13, 0.965, 0.0], [0.21, 0.075, 0.296], S.skin, F.robe).box('chest', [-0.12, 0.93, 0.1485], [0.19, 0.06, 0.01], S.skin, F.robe);
  const diagonal: [number, number][] = [[0.14, 0.93], [0.03, 0.83], [-0.08, 0.73], [-0.18, 0.645]];
  for (const [x, y] of diagonal) m.box('chest', [x, y, 0.1485], [0.13, 0.11, 0.012], S.accent, F.robe).box('chest', [x, y, -0.1485], [0.13, 0.11, 0.012], S.accent, F.robe);
  m.box('hips', [0.07, 0.4, 0.16], [0.07, 0.3, 0.012], S.accent, F.robe);
  // The sash (sbai) the same way: over the left shoulder, across to the right hip, front and back.
  m.box('chest', [0.135, 0.975, 0.0], [0.15, 0.03, 0.3], S.accent2, F.sash);
  for (const [x, y] of diagonal) m.box('chest', [x, y, 0.1495], [0.13, 0.11, 0.012], S.accent2, F.sash).box('chest', [x, y, -0.1495], [0.13, 0.11, 0.012], S.accent2, F.sash);
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
    .box('chest', [0.12, 0.83, 0.153], [0.082, 0.03, 0.02], S.accent2, F.kramaNeck)
    .box('chest', [-0.06, 0.985, 0.0], [0.03, 0.075, 0.316], S.accent2, F.kramaNeck)
    .box('chest', [0.12, 0.88, 0.152], [0.022, 0.1, 0.022], S.accent2, F.kramaNeck);
  // Gold collar, armbands, bracelets, anklets.
  m.box('chest', [0, 0.97, 0.01], [0.37, 0.06, 0.305], S.gold, F.jewels)
    .box('chest', [0, 0.91, 0.15], [0.16, 0.08, 0.012], S.gold, F.jewels)
    .boxLR('arm*', [ARM_X, 0.9, 0], [0.14, 0.035, 0.15], S.gold, F.jewels)
    .boxLR('fore*', [ARM_X, 0.612, 0], [0.125, 0.03, 0.135], S.gold, F.jewels)
    .boxLR('shin*', [LEG_X, 0.095, -0.02], [0.175, 0.03, 0.19], S.gold, F.jewels);
  // The market seller's money pouch on a thin belt, at the front on the right (clear of the skirt).
  m.box('hips', [0, 0.605, -0.01], [0.452, 0.024, 0.272], S.bag, F.pouch)
    .box('hips', [-0.12, 0.535, 0.168], [0.13, 0.12, 0.05], S.bag, F.pouch)
    .box('hips', [-0.12, 0.585, 0.19], [0.132, 0.03, 0.012], S.accent2, F.pouch);

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
  // Bamboo juice tubes hanging mouth up from a cord round the waist, at the back (clear of the legs' swing):
  // each a length of bamboo with a node ring and a cord tie at its mouth.
  m.box('hips', [0, 0.6, -0.01], [0.456, 0.022, 0.276], S.prop2, F.tubes);
  for (const [x, y, z] of [[-0.1, 0.44, -0.235], [0.01, 0.42, -0.25], [0.12, 0.43, -0.24]] as V3[]) {
    m.box('hips', [x, y, z], [0.085, 0.3, 0.085], S.prop, F.tubes)
      .box('hips', [x, y - 0.06, z], [0.09, 0.022, 0.09], S.prop2, F.tubes)
      .box('hips', [x, y + 0.13, z], [0.092, 0.03, 0.092], S.prop2, F.tubes);
  }
  // The knife's wooden holder tied at the right hip, behind the arm (and the knife's handle in it while climbing).
  m.box('hips', [-0.2, 0.46, -0.17], [0.07, 0.26, 0.1], S.wood, F.knife).box('hips', [-0.2, 0.635, -0.17], [0.045, 0.11, 0.05], S.wood, F.knife, SHOW.knifeHolder);
  // A money pouch's worth of goods: the small parcel held out (between the hands in the give pose).
  inR([0.1, 0.06, 0.03], [0.16, 0.1, 0.13], S.prop2, F.parcel, SHOW.give);
  inR([0.1, 0.06, 0.03], [0.03, 0.105, 0.135], S.accent2, F.parcel, SHOW.give);
  // A flat woven tray held level in both hands, from the right fist to the left, its goods heaped (the tray's own
  // rim a little higher; the goods: fruit, cakes of palm sugar, greens).
  inR([0.215, 0.03, 0.03], [0.62, 0.03, 0.42], S.wood, F.tray, SHOW.holdTray)
    .box('gripR', [fx + 0.215, fy + 0.06, fz + 0.03], [0.64, 0.035, 0.03], S.prop2, F.tray, SHOW.holdTray)
    .box('gripR', [fx + 0.215, fy + 0.06, fz + 0.03], [0.03, 0.035, 0.44], S.prop2, F.tray, SHOW.holdTray)
    .box('gripR', [fx + 0.12, fy + 0.08, fz + 0.06], [0.2, 0.07, 0.16], S.prop, F.tray, SHOW.holdTray)
    .box('gripR', [fx + 0.32, fy + 0.075, fz - 0.02], [0.18, 0.06, 0.18], S.prop, F.tray, SHOW.holdTray);
  // The steadying hand on a carried head basket: the forearm reaching on up from the fist (the grip holds it
  // upright), the hand at the basket's side (the arm's own hand gives way).
  inR([0, 0, 0.17], [0.11, 0.115, 0.34], S.foreR, F.headBasket, SHOW.holdHead);
  inR([0, 0, 0.39], [0.115, 0.12, 0.1], S.skin, F.headBasket, SHOW.holdHead);

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
  // Sickle: a short wooden handle, the blade curving round to the left.
  inR([0, 0, 0.07], [0.04, 0.04, 0.16], S.wood, F.sickle)
    .box('gripR', [fx + 0.02, fy, fz + 0.2], [0.05, 0.018, 0.11], S.gear, F.sickle)
    .box('gripR', [fx + 0.08, fy, fz + 0.27], [0.1, 0.018, 0.05], S.gear, F.sickle)
    .box('gripR', [fx + 0.14, fy, fz + 0.23], [0.04, 0.018, 0.07], S.gear, F.sickle);
  // The tapper's long knife: the wooden handle in the fist, a long straight blade below it, its end squared.
  inR([0, 0.02, 0], [0.045, 0.13, 0.05], S.wood, F.knife, SHOW.knifeHand)
    .box('gripR', [fx, fy - 0.2, fz + 0.012], [0.014, 0.3, 0.066], S.gear, F.knife, SHOW.knifeHand)
    .box('gripR', [fx, fy - 0.365, fz + 0.022], [0.014, 0.04, 0.05], S.gear, F.knife, SHOW.knifeHand);
  // The stirring paddle: a long shaft (its top end behind the fists), the blade flat across the stroke.
  inR([0, 0, 0.22], [0.04, 0.04, 0.86], S.wood, F.paddle, SHOW.stir).box('gripR', [fx, fy, fz + 0.58], [0.025, 0.15, 0.2], S.wood, F.paddle, SHOW.stir);
  // Chopsticks in the right hand, pointing across into the bowl (two, a little apart).
  inR([0.13, 0.035, 0.03], [0.26, 0.012, 0.012], S.wood, F.smallBowl).box('gripR', [fx + 0.13, fy + 0.035, fz + 0.05], [0.26, 0.012, 0.012], S.wood, F.smallBowl);
  // ── The left hand ──
  // The cast net, folded, hanging (the grip keeps it hanging).
  m.box('gripL', [ARM_X, 0.42, 0.03], [0.2, 0.26, 0.18], S.prop, F.net)
    .box('gripL', [ARM_X, 0.24, 0.03], [0.3, 0.12, 0.28], S.prop, F.net)
    .box('gripL', [ARM_X, 0.175, 0.03], [0.32, 0.03, 0.3], S.prop2, F.net);
  // A bundle of rice seedlings in the left fist, leaves up, muddy roots below (the grip keeps it upright).
  m.box('gripL', [ARM_X, 0.53, 0.07], [0.1, 0.07, 0.1], S.prop2, F.seedlings)
    .box('gripL', [ARM_X, 0.68, 0.07], [0.15, 0.24, 0.13], S.prop, F.seedlings)
    .box('gripL', [ARM_X + 0.03, 0.83, 0.05], [0.08, 0.08, 0.07], S.prop, F.seedlings);
  // A small bowl on the left palm, its food heaped (rice, noodles: `prop`), a foot ring below.
  inL([0, 0.075, 0.02], [0.17, 0.075, 0.17], S.white, F.smallBowl)
    .box('gripL', [ARM_X, fy + 0.105, 0.02], [0.13, 0.035, 0.13], S.prop, F.smallBowl)
    .box('gripL', [ARM_X, fy + 0.03, 0.02], [0.09, 0.02, 0.09], S.white, F.smallBowl);
  // Lotus buds and incense upright in the left hand: green stems, two pale buds, three sticks with glowing tips…
  inL([0, 0.09, 0.03], [0.035, 0.14, 0.035], S.prop2, F.offering, SHOW.notPalms)
    .box('gripL', [ARM_X - 0.025, fy + 0.2, 0.02], [0.06, 0.1, 0.06], S.prop, F.offering, SHOW.notPalms)
    .box('gripL', [ARM_X + 0.03, fy + 0.175, 0.05], [0.05, 0.08, 0.05], S.prop, F.offering, SHOW.notPalms);
  for (const x of [-0.02, 0, 0.02]) {
    inL([x, 0.12, -0.03], [0.012, 0.26, 0.012], S.wood, F.offering, SHOW.notPalms).box('gripL', [ARM_X + x, fy + 0.26, -0.03], [0.016, 0.02, 0.016], S.flame, F.offering, SHOW.notPalms);
  }
  // …or raised between the palms (sampeah, bow, kneel): the buds and the sticks rising before the face.
  m.box('chest', [0, 0.975, 0.275], [0.03, 0.1, 0.03], S.prop2, F.offering, SHOW.palms)
    .box('chest', [0, 1.05, 0.29], [0.065, 0.1, 0.065], S.prop, F.offering, SHOW.palms);
  for (const x of [-0.035, 0.035]) {
    m.box('chest', [x, 1.01, 0.3], [0.012, 0.22, 0.012], S.wood, F.offering, SHOW.palms).box('chest', [x, 1.125, 0.3], [0.016, 0.02, 0.016], S.flame, F.offering, SHOW.palms);
  }
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

/**
 * The far model: the same bones, slots, features and show rules in about
 * sixty boxes (a person shows ≈ 18): the body in its big blocks, the eyes,
 * and whatever still reads at a distance (hair, hats, skirts, the robe's
 * bare shoulder, big props). A person drawn smaller than `LOD_SHARE` of the
 * screen's height wears it.
 */
function buildFarModel(): Builder {
  const m = new Builder();
  const [fx, fy, fz] = FIST_R;
  const inR = (c: V3, s: V3, slot: number, feat: number, show: number = SHOW.always) => m.box('gripR', [fx + c[0], fy + c[1], fz + c[2]], s, slot, feat, show);
  // Body: pelvis, thighs, shins, feet; chest; sleeves, forearms with the hands; the head and its eyes.
  m.box('hips', [0, 0.575, -0.01], [0.44, 0.1, 0.26], S.hips)
    .boxLR('leg*', [LEG_X, 0.41, -0.02], [0.185, 0.24, 0.2], S.thigh)
    .boxLR('shin*', [LEG_X, 0.185, -0.02], [0.165, 0.23, 0.18], S.shin)
    .boxLR('foot*', [LEG_X, 0.035, 0.03], [0.17, 0.07, 0.27], S.foot)
    .box('chest', [0, 0.82, 0], [0.46, 0.4, 0.29], S.top)
    .box('armL', [ARM_X, 0.845, 0], [0.13, 0.23, 0.14], S.sleeveL)
    .box('armR', [-ARM_X, 0.845, 0], [0.13, 0.23, 0.14], S.sleeveR)
    .box('foreL', [ARM_X, 0.62, 0], [0.12, 0.22, 0.13], S.foreL)
    .box('foreR', [-ARM_X, 0.62, 0], [0.12, 0.22, 0.13], S.foreR, 0, SHOW.notHoldHead)
    .box('head', [0, 1.335, 0.01], [0.58, 0.525, 0.47], S.skin)
    .boxLR('head', [0.125, 1.25, 0.248], [0.07, 0.075, 0.02], S.eye)
    .box('chest', [0, 0.86, 0.225], [0.12, 0.17, 0.08], S.skin, 0, SHOW.palms);
  // Hair, hats, head cloths.
  m.box('head', [0, 1.45, -0.035], [0.61, 0.43, 0.44], S.hair, F.hairShort)
    .box('head', [0, 1.14, -0.235], [0.56, 0.42, 0.06], S.hair, F.hairLong)
    .box('head', [0, 1.62, -0.2], [0.2, 0.17, 0.17], S.hair, F.hairBun)
    .box('head', [0.03, 1.69, 0.05], [0.14, 0.08, 0.14], S.hair, F.tuft)
    .box('head', [0, 1.62, 0.02], [0.86, 0.035, 0.78], S.hat, F.hatSun)
    .box('head', [0, 1.7, 0.0], [0.62, 0.13, 0.52], S.hat, F.hatSun)
    .box('head', [0, 1.655, 0.0], [0.61, 0.12, 0.51], S.hat, F.hatCap)
    .box('head', [0, 1.615, 0.33], [0.44, 0.03, 0.22], S.hat, F.hatCap)
    .box('head', [0, 1.62, 0], [0.96, 0.035, 0.96], S.hat, F.hatPalm)
    .box('head', [0, 1.76, 0], [0.52, 0.26, 0.52], S.hat, F.hatPalm)
    .box('head', [0, 1.55, 0.01], [0.625, 0.22, 0.515], S.accent2, F.kramaHead)
    .box('head', [0, 1.53, 0.01], [0.63, 0.07, 0.52], S.accent, F.kramaHead)
    .box('head', [0, 1.66, 0.02], [0.56, 0.14, 0.46], S.gold, F.headdress)
    .box('head', [0, 1.9, 0.05], [0.08, 0.36, 0.08], S.gold, F.headdress)
    .boxLR('head', [0.16, 1.85, 0.05], [0.07, 0.26, 0.07], S.gold, F.headdress)
    .box('head', [0, 1.73, 0.01], [0.62, 0.2, 0.46], S.wood, F.headBasket)
    .box('head', [0, 1.87, 0.01], [0.5, 0.1, 0.38], S.prop, F.headBasket);
  // Clothes and what hangs on the body.
  m.box('chest', [-0.13, 0.965, 0.0], [0.21, 0.075, 0.296], S.skin, F.robe)
    .box('hips', [0, 0.41, -0.01], [0.48, 0.34, 0.31], S.hips, F.skirt)
    .box('hips', [0, 0.33, -0.01], [0.44, 0.5, 0.3], S.hips, F.sampot)
    .box('chest', [0, 0.985, 0.0], [0.34, 0.07, 0.31], S.accent, F.kramaNeck)
    .box('chest', [0, 0.82, -0.215], [0.34, 0.34, 0.14], S.bag, F.backpack)
    .box('chest', [-0.25, 0.64, 0.02], [0.07, 0.15, 0.2], S.bag, F.bag)
    .box('chest', [0, 0.675, 0.25], [0.3, 0.17, 0.26], S.gear, F.bowl)
    .box('hips', [0.01, 0.44, -0.24], [0.33, 0.3, 0.09], S.prop, F.tubes)
    .box('chest', [-0.2, 1.075, 0], [0.045, 0.045, 1.7], S.wood, F.pole);
  for (const z of [-0.74, 0.74]) m.box('chest', [-0.2, 0.7, z], [0.26, 0.56, 0.22], S.prop, F.pole);
  // Big props: the umbrella, the flag, the broom, a torch's flame, the net, the paddle, the tray.
  inR([0, 0, 0.56], [0.03, 0.03, 1.2], S.wood, F.umbrella).box('gripR', [fx, fy, fz + 1.13], [1.12, 1.12, 0.12], S.prop, F.umbrella);
  inR([0, 0, 0.62], [0.03, 0.03, 1.3], S.wood, F.flag).box('gripR', [fx, fy + 0.22, fz + 1.08], [0.015, 0.42, 0.3], S.prop, F.flag);
  inR([0, 0, 0.025], [0.03, 0.03, 0.95], S.wood, F.broom).box('gripR', [fx, fy, fz + 0.62], [0.34, 0.08, 0.14], S.prop, F.broom);
  inR([0, 0, 0.3], [0.05, 0.05, 0.7], S.wood, F.torch).box('gripR', [fx, fy, fz + 0.8], [0.13, 0.13, 0.22], S.flame, F.torch);
  inR([0, 0, 0.22], [0.04, 0.04, 0.86], S.wood, F.paddle, SHOW.stir);
  inR([0.215, 0.05, 0.03], [0.62, 0.07, 0.42], S.wood, F.tray, SHOW.holdTray);
  inR([0, 0, 0.1], [0.11, 0.115, 0.6], S.foreR, F.headBasket, SHOW.holdHead);
  m.box('gripL', [ARM_X, 0.33, 0.03], [0.28, 0.3, 0.25], S.prop, F.net);
  return m;
}

// ── Shader ──────────────────────────────────────────────────────────────────

const f = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(4)));
const POSE_CONSTS = Object.entries(POSE).map(([k, v]) => `const int P_${k.toUpperCase()} = ${v};`).join('\n');
const CARRY_CONSTS = Object.entries(CARRY).map(([k, v]) => `const int C_${k.toUpperCase()} = ${v};`).join('\n');
const SHOW_CONSTS = Object.entries(SHOW).map(([k, v]) => `const int SHOW_${k.toUpperCase()} = ${v};`).join('\n');
const BONE_CONSTS = BONES.map((b, i) => `const int B_${b.toUpperCase()} = ${i};`).join('\n');
const SHOW_COUNT = Object.keys(SHOW).length;
/** Texels in a person's row of the bone texture: three a bone (its turn's columns, the shift in w), then the show rules. */
const BONE_W = BONES.length * 3 + 1;

/**
 * The pose GLSL (no attributes: the bone pass runs it once a bone, or the
 * vertex shader for every vertex). Angles (radians, per bone, against its
 * parent): pitch > 0 tips the front down (a hanging limb swings back; an arm
 * raised forward is negative), yaw > 0 turns to the person's left, roll > 0
 * lifts the left side (the left arm out, the right arm in).
 */
const GLSL_POSE = /* glsl */ `
uniform float uPTime;
uniform vec4 uPEase;
uniform float uPEasePitch;

${POSE_CONSTS}
${CARRY_CONSTS}
${SHOW_CONSTS}
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
  // Seconds since the pose \`to\` began (a nod, a hand held out).
  float since;
};

float pEase(vec4 c, float d) {
  float k = clamp((uPTime - c.z) / max(d, 1e-3), 0.0, 1.0);
  return mix(c.x, c.y, k * k * (3.0 - 2.0 * k));
}

// A person's state now, from their channels (gait, pose, carry, head turn, head tilt) and look.
PP pStateOf(vec4 c0, vec4 c1, vec4 c2, vec4 c3, vec4 c4, vec4 look) {
  PP P;
  P.t = uPTime;
  P.walk = pEase(c0, uPEase.x);
  P.ph = uPTime * c1.w * 6.2831853 + c0.w;
  P.from = int(c1.x + 0.5);
  P.to = int(c1.y + 0.5);
  P.since = uPTime - c1.z;
  float k = clamp(P.since / max(uPEase.y, 1e-3), 0.0, 1.0);
  P.k = k * k * (3.0 - 2.0 * k);
  P.carry = pEase(c2, uPEase.z);
  P.ctype = int(look.z + 0.5);
  P.yaw = pEase(c3, uPEase.w);
  P.pitch = pEase(c4, uPEasePitch);
  P.seed = look.w;
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

// A leg reaching for a point (a ladder's peg, a pedal): the thigh's and the shin's pitch that put the ankle at
// (y, z) in the hips' frame (before the drop), the knee forward (thigh 0.22, shin to the ankle 0.23).
vec2 pReach(vec2 ank) {
  vec2 d = ank - vec2(0.52, -0.02);
  float l = clamp(length(d), 0.03, 0.449);
  float phi = atan(-d.y, -d.x);
  float al = acos(clamp((0.0484 + l * l - 0.0529) / (0.44 * l), -1.0, 1.0));
  float be = acos(clamp((0.0529 + l * l - 0.0484) / (0.46 * l), -1.0, 1.0));
  return vec2(phi - al, al + be);
}

// Sitting on a low stool (stool, eat): thighs forward and a little up, shins down to the ground (the feet level).
vec3 pStoolLegs(int b) {
  if (b == B_LEGL) return vec3(-1.75, 0.14, 0.0);
  if (b == B_LEGR) return vec3(-1.75, -0.14, 0.0);
  if (b == B_SHINL || b == B_SHINR) return vec3(1.6, 0.0, 0.0);
  return vec3(0.0);
}

// The climbing arms: a hand low on the pole … high, as one over the other (h 0‥1; the right arm mirrored).
vec3 pClimbArm(bool upper, float h, bool right) {
  vec3 r = upper ? mix(vec3(-1.28, -0.45, -0.26), vec3(-2.22, -0.11, -0.5), h) : vec3(mix(-0.93, -0.03, h), 0.0, 0.0);
  return right ? r * vec3(1.0, -1.0, -1.0) : r;
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
  if (p == P_CLIMB) {
    // a: climbing (1) or holding on at work (0). The cycle (phase u): the left hand and the right foot go up
    // together while the others hold, then the other pair; each limb's height (0‥1) against the body.
    float a = P.walk;
    float c = cos(P.ph);
    if (b == B_HIPS) return vec3(0.0, 0.0, 0.03 * sin(P.ph) * a);
    if (b == B_CHEST) return vec3(0.1 + 0.012 * br, 0.0, -0.03 * sin(P.ph) * a);
    // (at work he looks at the stalk he is cutting, a little up and to the right)
    if (b == B_HEAD) return vec3(-0.4 + 0.15 * (1.0 - a), -0.25 * (1.0 - a) + 0.06 * sin(t * 0.3 + s) * (1.0 - a), 0.0);
    if (b == B_ARML || b == B_FOREL) return pClimbArm(b == B_ARML, mix(1.0, 0.5 - 0.5 * c, a), false);
    if (b == B_ARMR || b == B_FORER) {
      vec3 cl = pClimbArm(b == B_ARMR, 0.5 + 0.5 * c, true);
      // At work: the knife slices the flower stalk's tip, a slow stroke down and out, and back.
      float cut = smoothstep(-0.3, 0.9, sin(t * 2.2 + s));
      vec3 wk = b == B_ARMR ? mix(vec3(-1.9, 0.2, 0.2), vec3(-1.77, 0.19, 0.2), cut) : vec3(mix(-0.52, -0.05, cut), 0.0, 0.0);
      return mix(wk, cl, a);
    }
    bool left = b == B_LEGL || b == B_SHINL;
    float fh = left ? mix(0.75, 0.5 + 0.5 * c, a) : mix(0.05, 0.5 - 0.5 * c, a);
    // (the ankle over a peg: the sole on it, the drop taken back)
    vec2 r = pReach(vec2(0.1 + 0.185 * fh, 0.11));
    bool upper = b == B_LEGL || b == B_LEGR;
    return vec3(upper ? r.x : r.y, upper ? (left ? 0.06 : -0.06) : 0.0, 0.0);
  }
  if (p == P_SQUAT) {
    if (b == B_HIPS) return vec3(0.0, 0.0, 0.015 * sin(t * 0.3 + s));
    if (b == B_CHEST) return vec3(0.45 + 0.015 * br, 0.06 * sin(t * 0.23 + s), 0.0);
    if (b == B_HEAD) return vec3(-0.4 + 0.06 * sin(t * 0.41 + s * 2.0), 0.3 * sin(t * 0.19 + s * 5.0), 0.0);
    if (b == B_ARML) return vec3(-0.75, -0.35, -0.1);
    if (b == B_ARMR) return vec3(-0.75, 0.35, 0.1);
    if (b == B_FOREL) return vec3(-0.7 + 0.08 * sin(t * 0.5 + s), 0.0, 0.0);
    if (b == B_FORER) return vec3(-0.7 + 0.08 * sin(t * 0.45 + s + 2.0), 0.0, 0.0);
    if (b == B_LEGL) return vec3(-1.85, 0.2, 0.0);
    if (b == B_LEGR) return vec3(-1.85, -0.2, 0.0);
    if (b == B_SHINL || b == B_SHINR) return vec3(2.15, 0.0, 0.0);
    return vec3(0.0);
  }
  if (p == P_STIR) {
    // A slow round stroke: the body sways round a circle (the hands and the paddle go with it: the grip keeps the
    // paddle's tilt and turns it with the chest, so the blade sweeps the wok).
    float u = t * 2.4 + s;
    float cx = cos(u);
    float sx = sin(u);
    if (b == B_HIPS) return vec3(0.04 + 0.02 * sx, -0.05 * cx, 0.0);
    if (b == B_CHEST) return vec3(0.22 + 0.06 * sx, 0.16 * cx, 0.03 * cx);
    if (b == B_HEAD) return vec3(0.25 - 0.05 * sx, -0.1 * cx, 0.0);
    if (b == B_ARMR) return vec3(-0.93, 0.32, 0.54);
    if (b == B_FORER) return vec3(-1.15 + 0.1 * sx, 0.0, 0.0);
    if (b == B_ARML) return vec3(-1.38, -0.28, -0.4);
    if (b == B_FOREL) return vec3(-0.04 + 0.04 * sx, 0.0, 0.0);
    if (b == B_LEGL) return vec3(-0.25, 0.08, 0.04);
    if (b == B_SHINL) return vec3(0.3, 0.0, 0.0);
    if (b == B_LEGR) return vec3(0.1, -0.08, -0.04);
    if (b == B_SHINR) return vec3(0.12, 0.0, 0.0);
    return vec3(0.0);
  }
  if (p == P_STOOL) {
    if (b == B_CHEST) return vec3(0.12 + 0.012 * br, 0.05 * sin(t * 0.21 + s), 0.0);
    if (b == B_HEAD) return vec3(-0.1 + 0.05 * sin(t * 0.37 + s), 0.28 * sin(t * 0.17 + s * 3.0), 0.0);
    if (b == B_ARML) return vec3(-0.29, -0.48, -0.1);
    if (b == B_ARMR) return vec3(-0.29, 0.48, 0.1);
    if (b == B_FOREL || b == B_FORER) return vec3(-1.34, 0.0, 0.0);
    return pStoolLegs(b);
  }
  if (p == P_EAT) {
    // A bite every few seconds: the right hand comes up to the mouth, the head bows to meet it; between bites the
    // chopsticks pick in the bowl.
    float u = fract(t / 5.0 + P.seed);
    float bite = smoothstep(0.55, 0.68, u) * (1.0 - smoothstep(0.8, 0.92, u));
    float pick = 0.08 * sin(t * 3.1 + s) * (1.0 - bite);
    if (b == B_CHEST) return vec3(0.15 + 0.01 * br, 0.0, 0.0);
    if (b == B_HEAD) return vec3(0.12 + 0.08 * bite, 0.06 * sin(t * 0.3 + s) * (1.0 - bite), 0.0);
    if (b == B_ARML) return vec3(-0.8, -0.47, -0.2);
    if (b == B_FOREL) return vec3(-1.06, 0.0, 0.0);
    if (b == B_ARMR) return mix(vec3(-1.0, 0.61, 0.09), vec3(-1.95, 0.4, 0.3), bite);
    if (b == B_FORER) return vec3(mix(-0.78, -0.2, bite) + pick, 0.0, 0.0);
    return pStoolLegs(b);
  }
  if (p == P_GIVE) {
    if (b == B_CHEST) return vec3(0.14 + 0.01 * br, 0.0, 0.0);
    if (b == B_HEAD) return vec3(0.12, 0.06 * sin(t * 0.3 + s), 0.0);
    if (b == B_ARML) return vec3(-1.21, -0.32, -0.2);
    if (b == B_ARMR) return vec3(-1.21, 0.32, 0.2);
    if (b == B_FOREL || b == B_FORER) return vec3(-0.08, 0.0, 0.0);
    return base;
  }
  if (p == P_RIDE) {
    // The pedals turn with the phase (forward over the top); each foot on its pedal, the other half a turn on.
    if (b == B_HIPS) return vec3(0.0, 0.0, 0.025 * sin(P.ph));
    if (b == B_CHEST) return vec3(0.3 + 0.01 * br, 0.0, -0.025 * sin(P.ph));
    if (b == B_HEAD) return vec3(-0.3, 0.15 * sin(t * 0.25 + s), 0.0);
    if (b == B_ARML) return vec3(-0.84, -0.02, -0.35);
    if (b == B_ARMR) return vec3(-0.84, 0.02, 0.35);
    if (b == B_FOREL || b == B_FORER) return vec3(-1.19, 0.0, 0.0);
    bool left = b == B_LEGL || b == B_SHINL;
    float th = -P.ph + (left ? 0.0 : 3.14159265);
    // (the ankle above and behind the pedal: the ball of the foot on it; the rise taken back)
    vec2 r = pReach(vec2(0.2 + 0.1 * sin(th), 0.03 + 0.1 * cos(th)));
    bool upper = b == B_LEGL || b == B_LEGR;
    return vec3(upper ? r.x : r.y, 0.0, 0.0);
  }
  if (p == P_HAMMOCK) {
    // Lying back in the sag, the upper back and the head raised by the cloth, the left knee up, hands on the belly.
    if (b == B_HIPS) return vec3(-1.2, 0.0, 0.0);
    if (b == B_CHEST) return vec3(-0.12 + 0.015 * br, 0.0, 0.0);
    if (b == B_HEAD) return vec3(0.2, 0.25 * sin(t * 0.11 + s), 0.0);
    if (b == B_ARML) return vec3(-0.35, -0.38, -0.35);
    if (b == B_ARMR) return vec3(-0.35, 0.38, 0.35);
    if (b == B_FOREL || b == B_FORER) return vec3(-0.99, 0.0, 0.0);
    if (b == B_LEGL) return vec3(-0.85, 0.05, 0.0);
    if (b == B_SHINL) return vec3(1.0, 0.0, 0.0);
    if (b == B_LEGR) return vec3(-0.45, -0.06, 0.0);
    if (b == B_SHINR) return vec3(0.4, 0.0, 0.0);
    return vec3(0.0);
  }
  if (p == P_NOD) {
    // One slow nod as the pose begins, then the head stays a little bowed; the right hand raised in blessing.
    float n = smoothstep(0.1, 0.7, P.since) * (1.0 - smoothstep(0.9, 1.7, P.since));
    if (b == B_CHEST) return vec3(0.04 + 0.05 * n + 0.012 * br, 0.0, 0.0);
    if (b == B_HEAD) return vec3(0.1 + 0.28 * n, 0.0, 0.0);
    if (b == B_ARMR) return vec3(-1.1, 0.2, 0.24);
    if (b == B_FORER) return vec3(-1.72 + 0.06 * sin(t * 0.8 + s), 0.0, 0.0);
    return base;
  }
  return base;
}

// Which parts a pose leaves to the carry and the walk: (left arm, right arm, legs).
vec3 pFree(int p) {
  if (p == P_STAND) return vec3(1.0, 1.0, 1.0);
  if (p == P_LOOK || p == P_POINT || p == P_WAVE || p == P_NOD) return vec3(1.0, 0.0, 1.0);
  if (p == P_TALK) return vec3(0.0, 1.0, 1.0);
  if (p == P_PHOTO || p == P_SWEEP || p == P_SAMPEAH || p == P_BOW || p == P_GIVE) return vec3(0.0, 0.0, 1.0);
  return vec3(0.0);
}

// How far the hips go down (m, for a 1.7 m person; less than 0: up, onto a saddle).
float pDrop(int p, PP P) {
  if (p == P_SIT) return 0.4;
  if (p == P_KNEEL) return 0.33;
  if (p == P_PLANT) return 0.08;
  if (p == P_REAP) return 0.09;
  if (p == P_ROW) return 0.2;
  if (p == P_SWEEP || p == P_CAST) return 0.03;
  if (p == P_DANCE) return 0.075 + 0.015 * sin(P.t * 0.9 + P.seed * 6.0);
  if (p == P_SQUAT) return 0.291;
  if (p == P_STOOL || p == P_EAT) return 0.262;
  if (p == P_HAMMOCK) return 0.38;
  if (p == P_CLIMB) return 0.03;
  if (p == P_STIR) return 0.02;
  if (p == P_RIDE) return -0.06;
  return 0.0;
}

// How much the feet stay level (on the ground, a peg, a pedal) whatever the legs do (0: they follow the shins).
float pFlat(int p) {
  return p == P_SQUAT || p == P_STOOL || p == P_EAT || p == P_CLIMB || p == P_RIDE ? 1.0 : 0.0;
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
  // (the right arm up along the side of the head, the hand reaching on to the basket's side)
  if (c == C_HEAD) { if (b == B_ARMR) return vec3(-2.96, -0.1, -0.2); if (b == B_FORER) return vec3(-0.22, 0.0, 0.0); }
  if (c == C_TRAY) {
    if (b == B_ARML) return vec3(-0.69, -0.08, -0.15);
    if (b == B_FOREL) return vec3(-0.06, 0.0, 0.0);
    if (b == B_ARMR) return vec3(-0.69, 0.08, 0.15);
    if (b == B_FORER) return vec3(-0.06, 0.0, 0.0);
  }
  return vec3(0.0);
}
float pCarrySide(int c, bool left) {
  if (c == 0) return 0.0;
  if (c == 5 || c == 7 || c == C_TRAY) return 1.0;
  if (c == 6) return left ? 1.0 : 0.0;
  return left ? 0.0 : 1.0;
}
float pCarryGrip(int c) {
  if (c == 1 || c == 2 || c == 3 || c == C_HEAD) return -1.5708;
  if (c == 4) return 1.5708;
  if (c == 7) return -1.0;
  return 0.0;
}
// The world tilt of the props in a pose (the grip axis: 0 = level ahead, −π/2 = up), per hand (a carry's tilt only in the hand holding it).
float pGripTarget(int p, PP P, bool left) {
  if (p == P_PHOTO || p == P_CAST || p == P_PLANT || p == P_EAT || p == P_GIVE) return 0.0;
  if (p == P_REAP) return 0.35;
  if (p == P_SWEEP) return 1.0 + 0.1 * sin(P.t * 1.4 + P.seed * 6.2831);
  if (p == P_STIR) return left ? 0.0 : 0.78;
  // (the knife's blade turned up and ahead to the flower stalks)
  if (p == P_CLIMB) return left ? 0.0 : -2.1;
  return pCarrySide(P.ctype, left) > 0.0 ? pCarryGrip(P.ctype) : 0.0;
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

// A foot: it follows the shin, or (pFlat) stays level: its pitch undoes the hips', the thigh's and the shin's.
vec3 pFoot(int b, PP P) {
  float fl = mix(pFlat(P.from), pFlat(P.to), P.k);
  if (fl <= 0.0) return vec3(0.0);
  bool left = b == B_FOOTL;
  float pitch = pBody(B_HIPS, P).x + pLeg(left ? B_LEGL : B_LEGR, P).x + pLeg(left ? B_SHINL : B_SHINR, P).x;
  return vec3(-pitch * fl, 0.0, 0.0);
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
  float target = mix(pGripTarget(P.from, P, left), pGripTarget(P.to, P, left), P.k);
  return transpose(chain) * pRotY(h.y + c.y) * pRotX(target);
}

vec3 pBoneRot(int b, PP P) {
  if (b == B_ARML || b == B_ARMR || b == B_FOREL || b == B_FORER) return pArm(b, P);
  if (b == B_FOOTL || b == B_FOOTR) return pFoot(b, P);
  if (b >= B_LEGL) return pLeg(b, P);
  return pBody(b, P);
}

float pWeight(int p, PP P) {
  return (P.from == p ? 1.0 - P.k : 0.0) + (P.to == p ? P.k : 0.0);
}

// How firmly the (right, or left) arm holds carry style c now: the carry's weight where the pose leaves the arm to it.
float pHold(PP P, int c, bool left) {
  if (P.ctype != c) return 0.0;
  vec3 fr = mix(pFree(P.from), pFree(P.to), P.k);
  return P.carry * pCarrySide(c, left) * (left ? fr.x : fr.y);
}

// Does a worn box with this show rule show in the pose now?
bool pShowRule(int show, PP P) {
  if (show == SHOW_ALWAYS) return true;
  if (show == SHOW_NOTPHOTO || show == SHOW_PHOTO) return (pWeight(P_PHOTO, P) >= 0.5) == (show == SHOW_PHOTO);
  if (show == SHOW_PALMS || show == SHOW_NOTPALMS) return (pWeight(P_SAMPEAH, P) + pWeight(P_BOW, P) + pWeight(P_KNEEL, P) >= 0.5) == (show == SHOW_PALMS);
  if (show == SHOW_DANCE) return pWeight(P_DANCE, P) >= 0.5;
  if (show == SHOW_HOLDHEAD || show == SHOW_NOTHOLDHEAD) return (pHold(P, C_HEAD, false) >= 0.5) == (show == SHOW_HOLDHEAD);
  if (show == SHOW_HOLDTRAY) return pHold(P, C_TRAY, false) >= 0.5 || (P.ctype == C_TRAY && pWeight(P_GIVE, P) >= 0.5);
  if (show == SHOW_STIR) return pWeight(P_STIR, P) >= 0.5;
  if (show == SHOW_GIVE) return pWeight(P_GIVE, P) >= 0.5;
  // (the knife rides in its holder while climbing, or while the right hand holds the carry: a pole, a basket)
  bool away = (pWeight(P_CLIMB, P) >= 0.5 && P.walk >= 0.5) || pHold(P, P.ctype, false) >= 0.5;
  return (show == SHOW_KNIFEHOLDER) == away;
}

// Every show rule at once (bit s: rule s shows now), for the bone texture.
int pShowMask(PP P) {
  int m = 0;
  for (int s = 0; s < ${SHOW_COUNT}; s++) if (pShowRule(s, P)) m |= 1 << s;
  return m;
}

// Bone b's turn against its parent (about its pivot).
mat3 pBoneMat(int b, PP P) {
  // (dancing, the wrists bend back from the forearms, swaying a little: the apsara's hands)
  if (b == B_GRIPL || b == B_GRIPR)
    return pWeight(P_DANCE, P) >= 0.5 ? pEuler(vec3(-1.25 + 0.15 * sin(P.t * 0.8 + P.seed * 6.2831 + float(b)), 0.0, 0.0)) : pGrip(b, P);
  return pEuler(pBoneRot(b, P));
}

// The step's bob less the pose's drop (m, up).
float pLift(PP P) {
  float w = P.walk * mix(pFree(P.from).z, pFree(P.to).z, P.k);
  float drop = mix(pDrop(P.from, P), pDrop(P.to, P), P.k);
  return (0.016 - 0.034 * abs(sin(P.ph))) * w - drop;
}

// Bone b posed as a whole (its turns up the chain to the hips, then the lift): a rest point p goes to M · p + c.
void pChain(int b, PP P, out mat3 M, out vec3 c) {
  M = mat3(1.0);
  c = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    if (b < 0) break;
    mat3 R = pBoneMat(b, P);
    vec3 pv = P_PIVOT[b];
    M = R * M;
    c = pv + R * (c - pv);
    b = P_PARENT[b];
  }
  c.y += pLift(P);
}
`;

/** The crowd's vertex side: its attributes and the check whether a box is worn (both ways of posing). */
const GLSL_WORN = /* glsl */ `
attribute vec4 aPart;
attribute vec4 aPCh0;
attribute vec4 aPCh1;
attribute vec4 aPCh2;
attribute vec4 aPCh3;
attribute vec4 aPCh4;
attribute vec4 aPLook;

// Is this box worn at all (a person drawn, the feature in their look)? Checked before anything else: the rest is folded away cheaply.
bool pWorn() {
  if (instanceMatrix[1][1] == 0.0) return false;
  int fi = int(aPart.z + 0.5);
  if (fi == 0) return true;
  int m = fi <= 24 ? int(aPLook.x + 0.5) : int(aPLook.y + 0.5);
  int bit = fi <= 24 ? fi - 1 : fi - 25;
  return ((m >> bit) & 1) == 1;
}
`;

/** Posing every vertex itself (no bone pass: a renderer that cannot draw into float textures). */
const GLSL_SKIN = /* glsl */ `
${GLSL_POSE}
void pSkin(inout vec3 p, inout vec3 n, PP P) {
  int b = int(aPart.x + 0.5);
  for (int i = 0; i < 5; i++) {
    if (b < 0) break;
    mat3 R = pBoneMat(b, P);
    vec3 pv = P_PIVOT[b];
    p = pv + R * (p - pv);
    n = R * n;
    b = P_PARENT[b];
  }
  p.y += pLift(P);
}
`;

/** Reading the bones from the bone texture (the bone pass: a row of `BONE_W` texels a person). */
const GLSL_FETCH = /* glsl */ `
uniform highp sampler2D uPBones;
`;

interface CrowdUniforms {
  uPTime: { value: number };
  uPEase: { value: { x: number; y: number; z: number; w: number } };
  uPEasePitch: { value: number };
  uPPal: { value: DataTexture };
  uPGlow: { value: number };
}

/** The bone texture the crowd reads (the bone pass; null without it). */
interface BoneUniforms {
  uPBones: { value: Texture | null };
}

/**
 * The crowd's shader: the pose GLSL into a lit (`colour`) or a shadow depth
 * material. With `bones` each vertex reads its bone's turn and shift from the
 * bone texture (three texels, a matrix product); without, it runs the pose's
 * whole chain itself (≈ 5 times the GPU's time).
 */
function inject(shader: WebGLProgramParametersWithUniforms, u: CrowdUniforms & BoneUniforms, colour: boolean, bones: boolean): void {
  Object.assign(shader.uniforms, u);
  const pars = colour ? `\nuniform sampler2D uPPal;\nuniform float uPGlow;\nvarying vec3 vPColor;\nvarying vec3 vPGlow;\n` : '';
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${GLSL_WORN}${bones ? GLSL_FETCH : GLSL_SKIN}${pars}`);
  // (a box not worn, or a person hidden, folds to a point before any posing)
  const pose = bones
    ? /* glsl */ `
  vec3 pPos = vec3(0.0);
  vec3 pNrm = normal;
  if (pWorn()) {
    // (the person's row: aPCh2.w, as for their colours)
    int pRow = int(aPCh2.w + 0.5);
    vec2 pRules = texelFetch(uPBones, ivec2(${BONE_W - 1}, pRow), 0).xy;
    int pShow = int(pRules.x + 0.5) | (int(pRules.y + 0.5) << 8);
    if (((pShow >> int(aPart.w + 0.5)) & 1) == 1) {
      int pB = 3 * int(aPart.x + 0.5);
      vec4 pT0 = texelFetch(uPBones, ivec2(pB, pRow), 0);
      vec4 pT1 = texelFetch(uPBones, ivec2(pB + 1, pRow), 0);
      vec4 pT2 = texelFetch(uPBones, ivec2(pB + 2, pRow), 0);
      mat3 pM = mat3(pT0.xyz, pT1.xyz, pT2.xyz);
      pPos = pM * position + vec3(pT0.w, pT1.w, pT2.w);
      pNrm = pM * normal;
    }
  }
`
    : /* glsl */ `
  vec3 pPos = vec3(0.0);
  vec3 pNrm = normal;
  if (pWorn()) {
    PP pP = pStateOf(aPCh0, aPCh1, aPCh2, aPCh3, aPCh4, aPLook);
    if (pShowRule(int(aPart.w + 0.5), pP)) {
      pPos = position;
      pSkin(pPos, pNrm, pP);
    }
  }
`;
  if (colour) {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <beginnormal_vertex>',
        `${pose}
  vec3 objectNormal = pNrm;
  int pSlot = int(aPart.y + 0.5);
  // (the person's own row of colours: aPCh2.w)
  vPColor = texelFetch(uPPal, ivec2(pSlot, int(aPCh2.w + 0.5)), 0).rgb;
  vPGlow = pSlot == ${SLOT.flame} ? vPColor * uPGlow : vec3(0.0);
  // Undersides a little darker (no bounce light there).
  vPColor *= 0.84 + 0.16 * smoothstep(-1.0, 0.2, normal.y);`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = pPos;');
  } else shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `${pose}\n  vec3 transformed = pPos;`);
}

/**
 * The bone pass (the crowd with a renderer that draws into float textures):
 * once a frame, a quad for every person over their row of a small float
 * texture (a row a person: `BONE_W` texels); each texel poses one bone
 * (`pChain`: its turns up the chain to the hips and the lift, three texels
 * a bone) or, the last, sums up the show rules (`pShowMask`). The crowd's
 * vertices then only read their bone (three texels, a matrix product): the
 * pose's math runs 46 times a person, not for each of their ≈ 6 000
 * vertices (the crowd's GPU time a fifth of what it was, the look the
 * same). Two textures take turns: the crowd reads the one drawn the frame
 * before (posed for this frame's time: `flush` looks a frame ahead), so
 * the frame's geometry never waits for the bone pass, which would wait for
 * the last frame's pixels (a GPU drawing frames back to back overlaps
 * them). A state a scene sets (a pose, a carry) so shows a frame later.
 */
const BONE_VERTEX = /* glsl */ `
precision highp float;
precision highp int;
in vec3 position;
in vec4 aPCh0;
in vec4 aPCh1;
in vec4 aPCh2;
in vec4 aPCh3;
in vec4 aPCh4;
in vec4 aPLook;
in float aPOn;
uniform vec2 uPBoneSize;
flat out vec4 vC0;
flat out vec4 vC1;
flat out vec4 vC2;
flat out vec4 vC3;
flat out vec4 vC4;
flat out vec4 vLook;
void main() {
  vC0 = aPCh0;
  vC1 = aPCh1;
  vC2 = aPCh2;
  vC3 = aPCh3;
  vC4 = aPCh4;
  vLook = aPLook;
  // (the person's row: the instance, person i; someone hidden is left out)
  vec2 px = vec2(position.x * uPBoneSize.x, float(gl_InstanceID) + position.y);
  gl_Position = aPOn > 0.5 ? vec4(px / uPBoneSize * 2.0 - 1.0, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`;
const BONE_FRAGMENT = /* glsl */ `
precision highp float;
precision highp int;
flat in vec4 vC0;
flat in vec4 vC1;
flat in vec4 vC2;
flat in vec4 vC3;
flat in vec4 vC4;
flat in vec4 vLook;
${GLSL_POSE}
out highp vec4 pOut;
void main() {
  PP P = pStateOf(vC0, vC1, vC2, vC3, vC4, vLook);
  int col = int(gl_FragCoord.x);
  if (col >= ${BONE_W - 1}) {
    // (in two halves: whole numbers a half float holds exactly)
    int m = pShowMask(P);
    pOut = vec4(float(m & 255), float(m >> 8), 0.0, 1.0);
    return;
  }
  int b = col / 3;
  mat3 M;
  vec3 c;
  pChain(b, P, M, c);
  int k = col - 3 * b;
  pOut = vec4(M[k], c[k]);
}
`;

/**
 * The texture type the bone pass draws into on this renderer (float, else
 * half float), or null: no bone pass, every vertex posed by itself.
 * `pbones=0` in the URL turns it off (to compare).
 */
function boneType(renderer?: WebGLRenderer): TextureDataType | null {
  if (!renderer || new URLSearchParams(location.search).get('pbones') === '0') return null;
  if (renderer.extensions.has('EXT_color_buffer_float')) return FloatType;
  if (renderer.extensions.has('EXT_color_buffer_half_float')) return HalfFloatType;
  return null;
}

/** The bone pass of a crowd: its two textures (drawn in turn: `next`), the quad mesh (an instance a person) and its own clock. */
interface BonePass {
  renderer: WebGLRenderer;
  targets: [WebGLRenderTarget, WebGLRenderTarget];
  next: number;
  /** Nothing drawn yet: the first pass draws both textures. */
  fresh: boolean;
  scene: Scene;
  camera: OrthographicCamera;
  quad: Mesh<InstancedBufferGeometry, RawShaderMaterial>;
  /** The pass's own clock (the crowd's, a frame ahead). */
  time: { value: number };
  /** The crowd's clock at the last flush (the frame ahead: as long as the last). */
  last: number;
  /** A still (shots): the crowd reads what was just drawn, at its own time. */
  still: boolean;
  /**
   * (lod) the people's own channels, look and `on`, and which of them changed
   * since the last pass (bit k: `attrs[k]`; each sent up whole: a few kB, one
   * call, cheaper than many small ones).
   */
  attrs: InstancedBufferAttribute[];
  changed: number;
  /** Posed by the pass (lod: the people shown), and (lod) who the texture the crowd reads next has posed. */
  on: Float32Array;
  posed: Uint8Array;
}

/** The crowd's lit material (each person's colours; flames glow), posed by the bone pass (`bones`) or vertex by vertex. */
function crowdMaterial(name: string, u: CrowdUniforms & BoneUniforms, bones: boolean): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  material.name = `${name}:body`;
  material.onBeforeCompile = (shader) => {
    inject(shader, u, true, bones);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPColor;\nvarying vec3 vPGlow;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vPColor;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vPGlow;');
  };
  material.customProgramCacheKey = () => `people:${name}:${bones ? 'bones' : 'skin'}`;
  return material;
}

/** How a crowd is made (`new Crowd`). */
export interface CrowdOptions {
  /** Near and far lists packed each frame (the people part), else instance i is person i (the festival). */
  lod?: boolean;
  /** The renderer, for the bone pass (without: every vertex posed by itself, ≈ 5 times the GPU's time). */
  renderer?: WebGLRenderer;
  /** A still (a shot, not a video): the bones drawn and read in the same frame, at its own time. */
  still?: boolean;
}

// ── The crowd: every person on the map ──────────────────────────────────────

/** Eased channels per person: (from, to, start, extra). The carry channel's extra is the person's row of colours. */
const CH = { gait: 0, pose: 1, carry: 2, yaw: 3, pitch: 4 } as const;
/** Ease times (s): gait, pose, carry, head turn, head tilt. */
const EASE = [0.35, 0.55, 0.6, 0.5, 0.6];
/** Dirty bits of a person (lod mode): the matrix, each channel, the look. */
const ROOT_BIT = 1;
const LOOK_BIT = 64;
const ALL_BITS = 127;

/** Metres one step cycle (two steps) carries a person at full stride (true scale; times the drawn size). */
export const STRIDE = 0.86;

/**
 * A person is drawn with the far model when smaller than this share of the
 * screen's height (by the graphics level: on low sooner, on max later). An
 * adult at 50° of view: ≈ 45 m on low, 70 m on medium and high, 100 m on max.
 */
export const LOD_SHARE: Record<string, number> = { low: 0.056, medium: 0.036, high: 0.036, max: 0.025 };
/** …and back to the near model only when this much bigger again (no flicker at the edge). */
const LOD_BACK = 1.12;

/** What the crowd needs of the camera to pick near and far (a PerspectiveCamera). */
export interface CrowdView {
  position: { x: number; y: number; z: number };
  /** Vertical field of view (degrees). */
  fov: number;
  /** (a camera's) where it stands and looks, and its lens: people outside its view are left out while they cast no shadow. */
  matrixWorld?: Matrix4;
  projectionMatrix?: Matrix4;
}

/** A person's bounding sphere, in model metres (times their size): round the chest, reaching a raised flag's top, a kite's string, the shoulder pole's loads. */
const CULL_Y = 1.0;
const CULL_R = 2.6;
const _viewProj = new Matrix4();
const _frustum = new Frustum();
const _sphere = new Sphere();

/** One drawn list of people: an InstancedMesh of one model, its instance buffers in slot order. */
interface Batch {
  mesh: InstancedMesh;
  /** Person in each slot. */
  who: Int16Array;
  /** Slots in use. */
  n: number;
  mat: Float32Array;
  ch: Float32Array[];
  look: Float32Array;
  /** Slots written since the last flush: matrix, channels 0‥4, look. */
  marks: SlotMarks[];
  ranges: { attr: InstancedBufferAttribute; size: number }[][];
}

/**
 * Every person on the map, fed per person through `place` (feet, heading)
 * and the eased channels (`gait`, `pose`, `carry`, `look`). Things are
 * written only when they change; `flush` sends them up once a frame. Make it
 * with room for everyone (`capacity`), then `add` people.
 *
 * With `lod` (the people part), the people shown are packed each frame into
 * the near list (`mesh`, the full model) or the far one (`far`, the far
 * model) by their size on screen (`flush(t, night, camera)`); hidden people
 * are in neither. Without it (the festival), instance i is person i in
 * `mesh` (a festival sets `mesh.count` itself and reads the matrices).
 */
export class Crowd {
  /** The near people (all of them without `lod`): add it to the scene. */
  readonly mesh: InstancedMesh;
  /** The far people (with `lod` only): add it to the scene too. */
  readonly far: InstancedMesh | null;
  readonly capacity: number;
  /** People added so far. */
  count = 0;
  /** Boxes in the model (all features), and in the far model. */
  readonly boxes: number;
  readonly farBoxes: number;
  /** Drawn now: near, far (lod mode; after `flush`). */
  readonly drawn = { near: 0, far: 0 };
  /** `lod=near|far` (the URL, for checks): everyone in that model. */
  force: 'near' | 'far' | null = null;
  // Each person's own data (by person): matrix, channels, look.
  private readonly mat: Float32Array;
  private readonly ch: Float32Array[] = [];
  private readonly looks: Float32Array;
  private readonly pal: Float32Array;
  private readonly palTex: DataTexture;
  private readonly shown: Uint8Array;
  private readonly size: Float32Array;
  private readonly uniforms: CrowdUniforms;
  private readonly lod: boolean;
  private readonly batches: Batch[] = [];
  /** The bone pass (null: every vertex posed by itself), and the bone texture the crowd reads. */
  private readonly bones: BonePass | null;
  private readonly boneTex: { value: Texture | null } = { value: null };
  // (lod) which list each person is in (0 none, 1 near, 2 far) and their slot there; what changed since the last flush.
  private readonly list: Uint8Array;
  private readonly slot: Int16Array;
  private readonly dirty: Uint8Array;
  private readonly dirtyList: Int16Array;
  private dirtyN = 0;
  private base = 0;

  constructor(capacity: number, name = 'people', opts: CrowdOptions = {}) {
    this.capacity = capacity;
    this.lod = !!opts.lod;
    const model = buildModel();
    this.boxes = model.boxes;
    const farModel = buildFarModel();
    this.farBoxes = farModel.boxes;
    this.mat = new Float32Array(capacity * 16);
    for (let c = 0; c < 5; c++) this.ch.push(new Float32Array(capacity * 4));
    this.looks = new Float32Array(capacity * 4);
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
    const type = boneType(opts.renderer);
    const bones = type !== null;
    const u = { ...this.uniforms, uPBones: this.boneTex };
    const material = crowdMaterial(name, u, bones);
    const depth = new MeshDepthMaterial();
    depth.name = `${name}:depth`;
    depth.onBeforeCompile = (shader) => inject(shader, u, false, bones);
    depth.customProgramCacheKey = () => `people-depth:${name}:${bones ? 'bones' : 'skin'}`;
    // (without lod the near list's buffers are the people's own: instance i is person i)
    this.batches.push(this.batch(model.geometry(), material, depth, `${name}:crowd`, !this.lod));
    if (this.lod) this.batches.push(this.batch(farModel.geometry(), material, depth, `${name}:far`, false));
    this.mesh = this.batches[0].mesh;
    this.far = this.lod ? this.batches[1].mesh : null;
    this.bones = type !== null && opts.renderer ? this.bonePass(opts.renderer, type, name, !!opts.still) : null;
    this.shown = new Uint8Array(capacity);
    this.size = new Float32Array(capacity).fill(PEOPLE_SCALE);
    this.list = new Uint8Array(capacity);
    this.slot = new Int16Array(capacity).fill(-1);
    this.dirty = new Uint8Array(capacity);
    this.dirtyList = new Int16Array(capacity);
    for (let i = 0; i < capacity; i++) {
      for (let c = 0; c < 5; c++) this.ch[c][i * 4 + 2] = -1e4;
      this.ch[CH.carry][i * 4 + 3] = i;
    }
  }

  private batch(geo: BufferGeometry, material: MeshStandardMaterial, depth: MeshDepthMaterial, name: string, own: boolean): Batch {
    const cap = this.capacity;
    const ch: Float32Array[] = [];
    const ranges: { attr: InstancedBufferAttribute; size: number }[][] = [];
    for (let c = 0; c < 5; c++) {
      const a = own ? this.ch[c] : new Float32Array(cap * 4);
      const attr = new InstancedBufferAttribute(a, 4);
      attr.setUsage(DynamicDrawUsage);
      geo.setAttribute(`aPCh${c}`, attr);
      ch.push(a);
      ranges.push([{ attr, size: 4 }]);
    }
    const look = own ? this.looks : new Float32Array(cap * 4);
    const lookAttr = new InstancedBufferAttribute(look, 4);
    geo.setAttribute('aPLook', lookAttr);
    const mesh = new InstancedMesh(geo, material, cap);
    mesh.name = name;
    if (own) mesh.instanceMatrix = new InstancedBufferAttribute(this.mat, 16);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    (mesh.instanceMatrix.array as Float32Array).fill(0);
    // (lod: culled as a whole on a sphere round the list's people, worked out each frame, `pack`: everywhere until
    // then; without lod (the festival) not culled, its instances are where the festival puts them)
    if (this.lod) mesh.boundingSphere = new Sphere(undefined, Infinity);
    else mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.customDepthMaterial = depth;
    mesh.count = 0;
    const marks = [0, 1, 2, 3, 4, 5, 6].map(() => new SlotMarks(cap));
    return {
      mesh,
      who: new Int16Array(cap),
      n: 0,
      mat: mesh.instanceMatrix.array as Float32Array,
      ch,
      look,
      marks,
      ranges: [[{ attr: mesh.instanceMatrix, size: 16 }], ...ranges, [{ attr: lookAttr, size: 4 }]],
    };
  }

  /**
   * The bone pass (see `BONE_VERTEX`): two textures (a row a person), and a
   * quad mesh drawing a quad a person from the people's own channels and
   * look (without lod: the crowd's own instance buffers; with lod: buffers of
   * their own, sent up person by person as they change).
   */
  private bonePass(renderer: WebGLRenderer, type: TextureDataType, name: string, still: boolean): BonePass {
    const cap = this.capacity;
    const target = () => {
      const t = new WebGLRenderTarget(BONE_W, cap, { type, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false });
      t.texture.name = `${name}:bones`;
      return t;
    };
    const geo = new InstancedBufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0], 3));
    const attrs: InstancedBufferAttribute[] = [];
    const own = this.batches[0].mesh.geometry;
    const names = ['aPCh0', 'aPCh1', 'aPCh2', 'aPCh3', 'aPCh4', 'aPLook'];
    names.forEach((n, k) => {
      if (!this.lod) return void geo.setAttribute(n, own.getAttribute(n));
      const attr = new InstancedBufferAttribute(k < 5 ? this.ch[k] : this.looks, 4);
      attr.setUsage(DynamicDrawUsage);
      geo.setAttribute(n, attr);
      attrs.push(attr);
    });
    // (with lod only the people shown are posed; without, everyone: the hidden fold anyway)
    const on = new Float32Array(cap).fill(this.lod ? 0 : 1);
    const onAttr = new InstancedBufferAttribute(on, 1);
    onAttr.setUsage(DynamicDrawUsage);
    geo.setAttribute('aPOn', onAttr);
    if (this.lod) attrs.push(onAttr);
    geo.instanceCount = 0;
    const time = { value: 0 };
    const quad = new Mesh(
      geo,
      new RawShaderMaterial({
        name: `${name}:bones`,
        glslVersion: GLSL3,
        vertexShader: BONE_VERTEX,
        fragmentShader: BONE_FRAGMENT,
        uniforms: { uPTime: time, uPEase: this.uniforms.uPEase, uPEasePitch: this.uniforms.uPEasePitch, uPBoneSize: { value: { x: BONE_W, y: cap } } },
        depthTest: false,
        depthWrite: false,
      }),
    );
    // (drawn into the bone texture, not the map: its vertex shader puts each quad on its row)
    quad.frustumCulled = false;
    const scene = new Scene();
    scene.matrixWorldAutoUpdate = false;
    scene.add(quad);
    const camera = new OrthographicCamera();
    // (its shader compiles beside the build, not in the first frame)
    renderer.compileAsync(scene, camera).catch(() => undefined);
    // (everyone's data up at the first pass)
    return { renderer, targets: [target(), target()], next: 0, fresh: true, scene, camera, quad, time, last: 0, still, attrs, changed: (1 << attrs.length) - 1, on, posed: new Uint8Array(cap) };
  }

  /** Person `i` changed (`bits`: the matrix, channels, look): sent up at the next flush. */
  private touch(i: number, bits: number): void {
    if (!this.lod) {
      const marks = this.batches[0].marks;
      for (let k = 0; k < 7; k++) if (bits & (1 << k)) marks[k].mark(i);
      return;
    }
    if (!this.dirty[i]) this.dirtyList[this.dirtyN++] = i;
    this.dirty[i] |= bits;
  }

  /** A new person wearing `look` (hidden until placed); returns their index. */
  add(look: Look): number {
    if (this.count >= this.capacity) throw new Error('people: crowd is full');
    const i = this.count++;
    if (!this.lod) this.mesh.count = this.count;
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
    this.touch(i, LOOK_BIT);
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
    const m = this.mat;
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
    this.touch(i, ROOT_BIT);
  }

  /** Hide person `i` (with `lod` they leave the drawn lists; else they fold to a point). */
  hide(i: number): void {
    if (!this.shown[i]) return;
    this.shown[i] = 0;
    this.mat.fill(0, i * 16, i * 16 + 16);
    this.touch(i, ROOT_BIT);
  }

  isShown(i: number): boolean {
    return this.shown[i] === 1;
  }

  /** Where person `i`'s feet are (as last placed). */
  at(i: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const o = i * 16;
    out.x = this.mat[o + 12];
    out.y = this.mat[o + 13];
    out.z = this.mat[o + 14];
    return out;
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
    this.touch(i, 2 << c);
  }

  /**
   * Walking: `walk` 0 (still) ‥ 1 (a full stride; less is a shorter, slower
   * step) at `hz` step cycles a second (`stepRate` gives it for a speed),
   * keeping the step phase where it is. (The same cycle climbs, `climbRate`,
   * and pedals: `POSE.climb`, `POSE.ride`.)
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
    this.touch(i, (2 << CH.gait) | (2 << CH.pose));
  }

  /** Step cycles a second for person `i` walking at `speed` m/s with stride share `walk`. */
  stepRate(i: number, speed: number, walk = 1): number {
    return Math.round((speed / (STRIDE * this.size[i] * Math.max(0.3, walk))) * 50) / 50;
  }

  /** Climbing cycles a second for person `i` going up a ladder at `speed` m/s (down: less than 0), `POSE.climb`. */
  climbRate(i: number, speed: number): number {
    return Math.round((speed / (FIT.climb.rise * this.size[i])) * 100) / 100;
  }

  /** Where person `i`'s step cycle is at time `t` (rad; the pedals' turn in `POSE.ride`: the left pedal forward at 0, going over the top first). */
  phaseOf(i: number, t: number): number {
    const tt = t - this.base;
    return tt * this.ch[CH.pose][i * 4 + 3] * Math.PI * 2 + this.ch[CH.gait][i * 4 + 3];
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
    this.touch(i, 2 << CH.pose);
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

  /**
   * Once a frame: the shader clock, the glow (brighter at night), who is
   * drawn near and far (`view`: the camera; lod mode), and the buffers that
   * changed.
   */
  flush(t: number, night = 0, view?: CrowdView): void {
    if (t - this.base > 600) {
      const shift = Math.floor((t - this.base) / 600) * 600;
      for (let i = 0; i < this.count; i++) {
        const o = i * 4;
        for (let c = 0; c < 5; c++) this.ch[c][o + 2] = Math.max(-1e4, this.ch[c][o + 2] - shift);
        this.ch[CH.gait][o + 3] = (this.ch[CH.gait][o + 3] + shift * this.ch[CH.pose][o + 3] * Math.PI * 2) % (Math.PI * 2);
        this.touch(i, ALL_BITS & ~ROOT_BIT & ~LOOK_BIT);
      }
      this.base += shift;
    }
    this.uniforms.uPTime.value = t - this.base;
    this.uniforms.uPGlow.value = 1.2 + 3.2 * night;
    // (after a pause, the festival coming back: both bone textures afresh)
    const bp = this.bones;
    if (bp && (t - bp.last > 0.25 || t < bp.last)) bp.fresh = true;
    if (this.lod) this.pack(view);
    for (const b of this.batches) for (let k = 0; k < 7; k++) b.marks[k].flush(b.ranges[k]);
    if (this.bones) this.drawBones(this.bones, t);
  }

  /**
   * The bone pass (`BONE_VERTEX`): everyone's bones into one texture (at the
   * next frame's time: this one's step on from `t`), while the crowd draws
   * with the other (drawn the frame before, for now). A still draws and reads
   * one texture at `t`; the first pass fills both.
   */
  private drawBones(bp: BonePass, t: number): void {
    const dt = bp.still || bp.fresh ? 0 : Math.min(0.1, t - bp.last);
    bp.last = t;
    bp.time.value = t - this.base + dt;
    for (let k = 0; k < bp.attrs.length; k++) if (bp.changed & (1 << k)) bp.attrs[k].needsUpdate = true;
    bp.changed = 0;
    // (a quad a person added; with lod a hidden person's folds away: aPOn)
    bp.quad.geometry.instanceCount = this.count;
    const into = bp.targets[bp.next];
    const other = bp.targets[bp.next ^ 1];
    if (this.count > 0) {
      const r = bp.renderer;
      const prev = r.getRenderTarget();
      const face = r.getActiveCubeFace();
      const level = r.getActiveMipmapLevel();
      r.setRenderTarget(into);
      r.render(bp.scene, bp.camera);
      if (bp.fresh && !bp.still) {
        r.setRenderTarget(other);
        r.render(bp.scene, bp.camera);
      }
      r.setRenderTarget(prev, face, level);
      bp.fresh = false;
    }
    this.boneTex.value = bp.still ? into.texture : other.texture;
    if (!bp.still) bp.next ^= 1;
    // (who the texture just drawn, read next frame, has posed)
    for (let i = 0; i < this.count; i++) bp.posed[i] = bp.on[i];
  }

  /** (lod) Everyone shown into the near or the far list (moving as few as can be), then what changed into their slots. */
  private pack(view?: CrowdView): void {
    const m = this.mat;
    let share = 0;
    if (view) share = LOD_SHARE[graphicsNow.level] ?? LOD_SHARE.medium;
    const tanHalf = view ? Math.tan((view.fov * Math.PI) / 360) : 1;
    // (out of view: left out, while no shadow of theirs is drawn: on the level of still shadows people cast none, and
    // the people part turns their shadows off far from them)
    const cull = !!view?.matrixWorld && !!view.projectionMatrix && (graphicsNow.stillShadows || !this.mesh.castShadow);
    if (cull) _frustum.setFromProjectionMatrix(_viewProj.copy(view.matrixWorld!).invert().premultiply(view.projectionMatrix!));
    // (someone just shown is drawn from the next frame: the bones the crowd reads now were posed without them)
    const bp = this.bones;
    const posed = bp && !bp.still && !bp.fresh ? bp.posed : null;
    for (let i = 0; i < this.count; i++) {
      let want = 0;
      if (this.shown[i] && (!posed || posed[i])) {
        want = 1;
        const o = i * 16;
        const k = this.size[i];
        if (cull) {
          _sphere.center.set(m[o + 12], m[o + 13] + CULL_Y * k, m[o + 14]);
          _sphere.radius = CULL_R * k;
          if (!_frustum.intersectsSphere(_sphere)) want = 0;
        }
        if (!want) {
          // (out of view)
        } else if (this.force) want = this.force === 'far' ? 2 : 1;
        else if (view) {
          // (size on screen: height over the view's height at that distance)
          const dx = m[o + 12] - view.position.x;
          const dy = m[o + 13] + 0.8 * k - view.position.y;
          const dz = m[o + 14] - view.position.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const s = (1.7 * k) / (2 * tanHalf * Math.max(d, 0.1));
          const cut = this.list[i] === 2 ? share * LOD_BACK : share;
          want = s < cut ? 2 : 1;
        }
      }
      if (want !== this.list[i]) this.move(i, want);
    }
    // What changed of the people who kept their slots (and of everyone, for the bone pass: who is shown, their channels).
    for (let k = 0; k < this.dirtyN; k++) {
      const i = this.dirtyList[k];
      const bits = this.dirty[i];
      this.dirty[i] = 0;
      if (this.list[i]) this.copy(i, this.batches[this.list[i] - 1], this.slot[i], bits);
      if (bp && this.lod) {
        // (the channels' bits 2 << c are the pass's attributes 0‥4, the look's (64) its 5th; then \`on\`)
        bp.changed |= (bits >> 1) & 63;
        if (bp.on[i] !== this.shown[i]) {
          bp.on[i] = this.shown[i];
          bp.changed |= 64;
        }
      }
    }
    this.dirtyN = 0;
    this.drawn.near = this.batches[0].n;
    this.drawn.far = this.batches[1].n;
    for (const b of this.batches) {
      b.mesh.count = b.n;
      // (nobody in a list: no draw at all)
      b.mesh.visible = b.n > 0;
      if (b.n) this.bound(b);
    }
  }

  /**
   * (lod) The sphere three culls a list on: round its people, each as far as
   * the sphere they are culled on one by one (`CULL_R` round the chest). All
   * of a list can be out of view while their shadows are drawn (then they
   * are not culled one by one).
   */
  private bound(b: Batch): void {
    let x0 = Infinity;
    let y0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let z1 = -Infinity;
    let big = 0;
    for (let j = 0; j < b.n; j++) {
      const i = b.who[j];
      const o = j * 16;
      const k = this.size[i];
      const x = b.mat[o + 12];
      const y = b.mat[o + 13] + CULL_Y * k;
      const z = b.mat[o + 14];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
      if (k > big) big = k;
    }
    const s = b.mesh.boundingSphere!;
    s.center.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    s.radius = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2 + (z1 - z0) ** 2) / 2 + CULL_R * big;
  }

  /** Person `i` into list `to` (0: none): out of their slot (the list's last person fills it), into the end of the other. */
  private move(i: number, to: number): void {
    const from = this.list[i];
    if (from) {
      const b = this.batches[from - 1];
      const s = this.slot[i];
      const last = --b.n;
      if (s !== last) {
        const q = b.who[last];
        b.who[s] = q;
        this.slot[q] = s;
        this.copy(q, b, s, ALL_BITS);
      }
    }
    this.list[i] = to;
    this.slot[i] = -1;
    if (!to) return;
    const b = this.batches[to - 1];
    const s = b.n++;
    b.who[s] = i;
    this.slot[i] = s;
    this.copy(i, b, s, ALL_BITS);
  }

  /** Person `i`'s data (`bits` of it) into slot `s` of a list, marked for upload. */
  private copy(i: number, b: Batch, s: number, bits: number): void {
    if (bits & ROOT_BIT) {
      // (element by element: a subarray would be a new object every time)
      for (let k = 0, o = i * 16, d = s * 16; k < 16; k++) b.mat[d + k] = this.mat[o + k];
      b.marks[0].mark(s);
    }
    for (let c = 0; c < 5; c++) {
      if (!(bits & (2 << c))) continue;
      const a = this.ch[c];
      const o = i * 4;
      const d = s * 4;
      b.ch[c][d] = a[o];
      b.ch[c][d + 1] = a[o + 1];
      b.ch[c][d + 2] = a[o + 2];
      b.ch[c][d + 3] = a[o + 3];
      b.marks[c + 1].mark(s);
    }
    if (bits & LOOK_BIT) {
      const o = i * 4;
      const d = s * 4;
      b.look[d] = this.looks[o];
      b.look[d + 1] = this.looks[o + 1];
      b.look[d + 2] = this.looks[o + 2];
      b.look[d + 3] = this.looks[o + 3];
      b.marks[6].mark(s);
    }
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
    const m = this.mat;
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
  [-0.38, 1.33, 0.02],
  [-0.215, 0.645, 0.25],
];
