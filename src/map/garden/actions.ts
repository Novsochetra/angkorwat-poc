import type { PickStyle, PlantForm } from './kinds';

/**
 * What he does in his garden, and when each part of it happens: the one timing
 * table that the poses (character/gardenWork.ts), what he holds (roam/_gardenProps.ts),
 * the work itself (roam/_gardenWork.ts: the plant appears, the earth darkens, the
 * fruit goes into his basket) and the sounds (audio/_garden.ts) all follow.
 * No three.js.
 *
 * - `plant`: a crop. Three chops of the hoe (ចបកាប់) at his feet' front, he
 *   lays the hoe down beside him, kneels, sets the seed (or the cutting, the
 *   pup) in the hole, pats the earth twice over it, stands.
 * - `plantTree`: a seedling in its black nursery bag. Four deeper chops, he
 *   kneels, tears the bag off, sets the root ball in the hole, firms the earth
 *   round it with both hands, stands.
 * - `water`: the watering can (ធុងស្រោចទឹក, a tin can with a long spout) in his
 *   right hand, the left under its spout's foot, tipped over the plant's foot:
 *   the water runs, then he tips it back.
 * - `fill`: he crouches at the water jar (or the stream's edge) and dips the can
 *   in; it fills, gurgling; he lifts it out dripping.
 * - `pickLow`: bends over a low plant (or the pumpkin lying on its vine), twists
 *   the fruit off with both hands, puts it in the basket on his hip.
 * - `pickReach`: standing, reaches up into the leaves (a guava, a papaya's
 *   lowest fruit, an ear of corn, a jackfruit on the trunk), pulls it down.
 * - `pickCut`: with his knife (កាំបិត): two cuts (the sugarcane's canes at the
 *   foot, the banana's bunch stalk overhead), he takes it.
 * - `pickPole`: the long bamboo picking pole with its little basket at the top
 *   (ដងបេះ): raised up into the crown, a hook and a tug, lowered with the fruit.
 * - `pickGround`: fallen fruit (durian, coconut, sugar palm) picked up from
 *   under the tree: a crouch, both hands, up.
 * - `clear`: a dead plant pulled out: grips it, two tugs, out with its roots, tossed aside.
 *
 * Beats are seconds from the start; `len` the whole action (he is free after it).
 * The work calls the beat's sound (`sound`) and its step (`does`: the plant appears
 * at `set`, the earth darkens at `pour`, the fruit leaves the plant at `take`…).
 */
export type GardenAction =
  | 'plant'
  | 'plantTree'
  | 'water'
  | 'fill'
  | 'pickLow'
  | 'pickReach'
  | 'pickCut'
  | 'pickPole'
  | 'pickGround'
  | 'clear'
  | 'fillRope'
  | 'uproot'
  | 'fell';

/** The shoulder pole's actions (ដងរែក, roam/_carryPole*.ts): see `POLE_ACTIONS` below. */
export type PoleAction = 'poleUp' | 'poleDown' | 'poleFill' | 'poleJar' | 'poleScoop' | 'poleFillRope';

/** What he holds at a moment (roam/_gardenProps.ts builds them). */
export type GardenProp =
  | 'hoe'
  | 'can'
  | 'knife'
  | 'pole'
  | 'seed'
  | 'cutting'
  | 'pup'
  | 'seedling'
  | 'fruit'
  | 'stick'
  | 'basket'
  // (a cord between his fists, paid out down to the can or a bucket hanging on it: fillRope, poleFillRope)
  | 'cord'
  // (a living plant dug up whole, its roots and earth: uproot)
  | 'plant';

/**
 * The shoulder pole's props: the pole with its two buckets hung (one prop; their water level and sway the carry
 * add-on's to animate) and the coconut-shell dipper (ផ្ដិល) he waters with from a bucket.
 */
export type PoleProp = 'yoke' | 'dipper';

export interface Beat {
  /** Seconds from the start. */
  readonly at: number;
  /** Its name (the work's and the poses' meaning of it). */
  readonly name: string;
  /** The sound it makes there (audio/_garden.ts `registerSfx` name), if any. */
  readonly sound?: GardenSfx;
}

export interface ActionTiming {
  readonly len: number;
  readonly beats: readonly Beat[];
  /** What is in each hand: from `at` s on (the last entry before t holds). */
  readonly right: readonly (readonly [at: number, prop: GardenProp | null])[];
  readonly left: readonly (readonly [at: number, prop: GardenProp | null])[];
  /** A lasting sound (a loop: the pour, the can filling) from‥to (s). */
  readonly loop?: { readonly sfx: GardenSfx; readonly from: number; readonly to: number };
}

/** The garden's sounds (audio/_garden.ts registers each). */
export type GardenSfx =
  | 'gardenHoe' // the hoe's blade biting into earth (a dull chop and a scatter of crumbs)
  | 'gardenSeed' // a seed or a root ball set in the hole (a soft drop)
  | 'gardenPat' // a palm patting earth flat
  | 'gardenTear' // the nursery bag torn off (thin plastic)
  | 'gardenPour' // loop: water from the can's rose on leaves and earth
  | 'gardenFill' // loop: the can filling, a hollow gurgle rising in pitch
  | 'gardenDip' // the can dipped in the jar / stream (a splash)
  | 'gardenSnap' // a fruit twisted or pulled off its stalk
  | 'gardenRustle' // leaves shaken as he reaches into them
  | 'gardenChop' // the knife through a cane or a bunch stalk
  | 'gardenPole' // the bamboo pole's knock and its basket's catch
  | 'gardenThud' // ripe fruit falling to the ground (a durian, a coconut: heavier)
  | 'gardenPull' // roots tearing out of the earth
  | 'gardenToss' // a dead plant thrown on the heap
  | 'gardenBasket' // fruit laid in his basket (woven bamboo)
  | 'gardenSprout' // ui: a soft rising chime (a first sprout, a plant grown)
  | 'gardenRipe' // ui: two bright notes (ripe to pick)
  | 'gardenThirst' // ui: a dry low note (a plant wants water)
  | 'gardenDied' // ui: a soft falling note (a plant has died)
  // the shoulder pole (roam/_carryPole*.ts)
  | 'gardenYokeCreak' // loop: the bamboo pole creaking on his shoulder as he walks (level by his speed)
  | 'gardenSlosh' // loop: water slopping in the buckets as he walks (level by the sway and how full)
  | 'gardenBucketFill' // loop: two buckets dipped and filling at the water
  | 'gardenJarPour' // the buckets poured into the big jar (a deep glug and splash)
  | 'gardenScoop' // the dipper scooping from a bucket, then the splash on the plant's earth
  | 'gardenSpill' // water spilling over the rims (he ran: some is lost)
  | 'gardenPoleUp' // the pole taken up onto his shoulder (a bamboo knock, the buckets' handles)
  | 'gardenPoleDown'; // the buckets set down on the ground

/** The seed in his hand while planting, by what he plants. */
export const SEED_PROP: Record<PlantForm, GardenProp> = { seed: 'seed', cutting: 'cutting', pup: 'pup', seedling: 'seedling' };

/** The action for picking, by the kind's pick style. */
export const PICK_ACTION: Record<PickStyle, GardenAction> = { low: 'pickLow', reach: 'pickReach', cut: 'pickCut', pole: 'pickPole', ground: 'pickGround' };

/**
 * The shoulder pole's actions (the carry add-on runs them; the poses are character/gardenWork.ts's): taking the pole
 * up onto his right shoulder from where it leans (`poleUp`), setting it down (`poleDown`), dipping both buckets at
 * the water's edge (`poleFill`: he squats with the pole on his shoulder and lowers one bucket, then the other), pouring
 * both into his yard's jar (`poleJar`), and watering a plant with the coconut-shell dipper from a bucket set down
 * beside it (`poleScoop`: the pole stays on the ground by him meanwhile, picked up at the end).
 */
/** A pole action's timing: as `ActionTiming`, its hands holding the pole's props. */
export interface PoleTiming extends Omit<ActionTiming, 'right' | 'left'> {
  readonly right: readonly (readonly [at: number, prop: GardenProp | PoleProp | null])[];
  readonly left: readonly (readonly [at: number, prop: GardenProp | PoleProp | null])[];
}

export const POLE_ACTIONS: Record<PoleAction, PoleTiming> = {
  poleUp: {
    len: 1.6,
    beats: [
      { at: 0.5, name: 'grip' },
      { at: 0.9, name: 'lift', sound: 'gardenPoleUp' },
      { at: 1.3, name: 'shoulder' },
    ],
    right: [[0, null], [0.5, 'yoke']],
    left: [[0, null]],
  },
  poleDown: {
    len: 1.4,
    beats: [
      { at: 0.6, name: 'down', sound: 'gardenPoleDown' },
      { at: 1.0, name: 'free' },
    ],
    right: [[0, 'yoke'], [1.0, null]],
    left: [[0, null]],
  },
  poleFill: {
    len: 3.6,
    beats: [
      { at: 0.6, name: 'dip1', sound: 'gardenDip' },
      { at: 1.6, name: 'full1' },
      { at: 1.9, name: 'dip2', sound: 'gardenDip' },
      { at: 2.9, name: 'full2' },
      { at: 3.2, name: 'up' },
    ],
    right: [[0, 'yoke']],
    left: [[0, null]],
    loop: { sfx: 'gardenBucketFill', from: 0.65, to: 2.9 },
  },
  poleJar: {
    len: 3.2,
    beats: [
      { at: 0.7, name: 'tip1', sound: 'gardenJarPour' },
      { at: 1.6, name: 'empty1' },
      { at: 1.9, name: 'tip2', sound: 'gardenJarPour' },
      { at: 2.8, name: 'empty2' },
    ],
    right: [[0, 'yoke']],
    left: [[0, null]],
  },
  poleScoop: {
    len: 3.2,
    beats: [
      { at: 0.6, name: 'down', sound: 'gardenPoleDown' },
      { at: 1.2, name: 'scoop', sound: 'gardenScoop' },
      { at: 1.7, name: 'pour' },
      { at: 2.5, name: 'up', sound: 'gardenPoleUp' },
    ],
    right: [[0, 'yoke'], [0.6, 'dipper'], [2.4, 'yoke']],
    left: [[0, null]],
  },
  // From a high bank (the water up to ≈ 3 m below): the pole set down on the bank, one bucket untied from it and let down
  // on its own cord hand over hand, filled, pulled up, tied back; the other; the pole taken up again.
  poleFillRope: {
    len: 8.4,
    beats: [
      { at: 0.6, name: 'down', sound: 'gardenPoleDown' },
      { at: 1.4, name: 'lower1' },
      { at: 2.0, name: 'dip1', sound: 'gardenDip' },
      { at: 2.6, name: 'full1' },
      { at: 3.0, name: 'pull1' },
      { at: 3.9, name: 'lower2' },
      { at: 4.6, name: 'dip2', sound: 'gardenDip' },
      { at: 5.2, name: 'full2' },
      { at: 5.6, name: 'pull2' },
      { at: 7.6, name: 'up', sound: 'gardenPoleUp' },
    ],
    right: [[0, 'yoke'], [0.6, 'cord'], [7.2, 'yoke']],
    left: [[0, null], [0.6, 'cord'], [7.2, null]],
    loop: { sfx: 'gardenBucketFill', from: 2.05, to: 5.2 },
  },
};

export const ACTIONS: Record<GardenAction, ActionTiming> = {
  plant: {
    len: 4.2,
    beats: [
      { at: 0.45, name: 'chop', sound: 'gardenHoe' },
      { at: 0.95, name: 'chop', sound: 'gardenHoe' },
      { at: 1.45, name: 'chop', sound: 'gardenHoe' },
      { at: 1.75, name: 'hoeDown' },
      { at: 2.2, name: 'kneel' },
      { at: 2.55, name: 'set', sound: 'gardenSeed' },
      { at: 2.95, name: 'pat', sound: 'gardenPat' },
      { at: 3.3, name: 'pat', sound: 'gardenPat' },
      { at: 3.6, name: 'up' },
    ],
    right: [[0, 'hoe'], [1.75, null], [2.2, 'seed'], [2.55, null]],
    left: [[0, 'hoe'], [1.75, null]],
  },
  plantTree: {
    len: 5.4,
    beats: [
      { at: 0.45, name: 'chop', sound: 'gardenHoe' },
      { at: 0.95, name: 'chop', sound: 'gardenHoe' },
      { at: 1.45, name: 'chop', sound: 'gardenHoe' },
      { at: 1.95, name: 'chop', sound: 'gardenHoe' },
      { at: 2.25, name: 'hoeDown' },
      { at: 2.7, name: 'kneel' },
      { at: 3.05, name: 'tear', sound: 'gardenTear' },
      { at: 3.5, name: 'set', sound: 'gardenSeed' },
      { at: 3.95, name: 'pat', sound: 'gardenPat' },
      { at: 4.35, name: 'pat', sound: 'gardenPat' },
      { at: 4.75, name: 'up' },
    ],
    right: [[0, 'hoe'], [2.25, null], [2.7, 'seedling'], [3.5, null]],
    left: [[0, 'hoe'], [2.25, null], [2.7, 'seedling'], [3.5, null]],
  },
  water: {
    len: 3,
    beats: [
      { at: 0.5, name: 'tip' },
      { at: 0.7, name: 'pour' },
      { at: 2.3, name: 'stop' },
    ],
    right: [[0, 'can']],
    left: [[0, null]],
    loop: { sfx: 'gardenPour', from: 0.6, to: 2.35 },
  },
  fill: {
    len: 2.6,
    beats: [
      { at: 0.55, name: 'dip', sound: 'gardenDip' },
      { at: 1.9, name: 'full' },
      { at: 2.1, name: 'lift' },
    ],
    right: [[0, 'can']],
    left: [[0, null]],
    loop: { sfx: 'gardenFill', from: 0.6, to: 1.95 },
  },
  pickLow: {
    len: 2.4,
    beats: [
      { at: 0.6, name: 'grip', sound: 'gardenRustle' },
      { at: 1.05, name: 'take', sound: 'gardenSnap' },
      { at: 1.6, name: 'basket', sound: 'gardenBasket' },
    ],
    right: [[0, null], [1.05, 'fruit'], [1.6, null]],
    left: [[0, 'basket']],
  },
  pickReach: {
    len: 2.2,
    beats: [
      { at: 0.55, name: 'grip', sound: 'gardenRustle' },
      { at: 0.95, name: 'take', sound: 'gardenSnap' },
      { at: 1.5, name: 'basket', sound: 'gardenBasket' },
    ],
    right: [[0, null], [0.95, 'fruit'], [1.5, null]],
    left: [[0, 'basket']],
  },
  pickCut: {
    len: 2.8,
    beats: [
      { at: 0.7, name: 'cut', sound: 'gardenChop' },
      { at: 1.15, name: 'cut', sound: 'gardenChop' },
      { at: 1.55, name: 'take', sound: 'gardenRustle' },
      { at: 2.1, name: 'basket', sound: 'gardenBasket' },
    ],
    right: [[0, 'knife'], [2.4, null]],
    left: [[0, null], [1.55, 'fruit'], [2.1, null]],
  },
  pickPole: {
    len: 3.8,
    beats: [
      { at: 0.6, name: 'raise' },
      { at: 1.6, name: 'hook', sound: 'gardenRustle' },
      { at: 1.85, name: 'take', sound: 'gardenPole' },
      { at: 2.8, name: 'down' },
      { at: 3.2, name: 'basket', sound: 'gardenBasket' },
    ],
    right: [[0, 'pole'], [3.4, null]],
    left: [[0, 'pole'], [3.4, null]],
  },
  pickGround: {
    len: 2.4,
    beats: [
      { at: 0.7, name: 'grip' },
      { at: 1.0, name: 'take' },
      { at: 1.7, name: 'basket', sound: 'gardenBasket' },
    ],
    right: [[0, null], [1.0, 'fruit'], [1.7, null]],
    left: [[0, null], [1.0, 'fruit'], [1.7, null]],
  },
  clear: {
    len: 2.8,
    beats: [
      { at: 0.55, name: 'grip' },
      { at: 0.95, name: 'tug', sound: 'gardenPull' },
      { at: 1.4, name: 'tug', sound: 'gardenPull' },
      { at: 1.75, name: 'out' },
      { at: 2.25, name: 'toss', sound: 'gardenToss' },
    ],
    right: [[0, null], [1.75, 'stick'], [2.25, null]],
    left: [[0, null], [1.75, 'stick'], [2.25, null]],
  },
  // The watering can from a high bank (the water up to ≈ 3 m below): the cord tied on its handle, let down hand over
  // hand, dipped and filled, pulled up dripping, untied.
  fillRope: {
    len: 6.4,
    beats: [
      { at: 0.6, name: 'tie' },
      { at: 1.0, name: 'lower' },
      { at: 2.4, name: 'dip', sound: 'gardenDip' },
      { at: 3.6, name: 'full' },
      { at: 3.9, name: 'pull' },
      { at: 5.3, name: 'up' },
      { at: 5.8, name: 'untie' },
    ],
    right: [[0, 'can'], [0.9, 'cord'], [5.8, 'can']],
    left: [[0, null], [0.9, 'cord'], [5.8, null]],
    loop: { sfx: 'gardenFill', from: 2.45, to: 3.6 },
  },
  // A living crop or young plant dug up: the hoe loosens the earth round it, it is gripped, tugged out with its roots
  // and its earth, laid down beside him.
  uproot: {
    len: 4.2,
    beats: [
      { at: 0.45, name: 'loosen', sound: 'gardenHoe' },
      { at: 0.95, name: 'loosen', sound: 'gardenHoe' },
      { at: 1.45, name: 'loosen', sound: 'gardenHoe' },
      { at: 1.75, name: 'hoeDown' },
      { at: 2.15, name: 'grip' },
      { at: 2.5, name: 'tug', sound: 'gardenPull' },
      { at: 2.85, name: 'out', sound: 'gardenPull' },
      { at: 3.45, name: 'lay', sound: 'gardenToss' },
    ],
    right: [[0, 'hoe'], [1.75, null], [2.85, 'plant'], [3.45, null]],
    left: [[0, 'hoe'], [1.75, null], [2.85, 'plant'], [3.45, null]],
  },
  // A grown tree taken out: five chops of the hoe at its foot, he steps back as it tips, it falls.
  fell: {
    len: 5.2,
    beats: [
      { at: 0.5, name: 'chop', sound: 'gardenHoe' },
      { at: 1.0, name: 'chop', sound: 'gardenHoe' },
      { at: 1.5, name: 'chop', sound: 'gardenHoe' },
      { at: 2.0, name: 'chop', sound: 'gardenHoe' },
      { at: 2.5, name: 'chop', sound: 'gardenHoe' },
      { at: 3.0, name: 'back' },
      { at: 3.7, name: 'fall' },
    ],
    right: [[0, 'hoe']],
    left: [[0, 'hoe'], [3.0, null]],
  },
};

/** What a hand holds at `t` s into `a`. */
export function propAt(list: ActionTiming['right'], t: number): GardenProp | null {
  let p: GardenProp | null = null;
  for (const [at, prop] of list) if (t >= at) p = prop;
  return p;
}
