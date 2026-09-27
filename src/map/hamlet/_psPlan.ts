import { hash3 } from '../../voxel/random';
import type { HeightField } from '../heightfield';

/**
 * Where everything of the palm sugar yard stands (layout.ts `PALM_GROVE`),
 * shared by its build (`_palmSugar.ts`) and its people and animals
 * (`people/_scenePalmSugar.ts`, `_scenePalmSugarYard.ts`). `psPlan(field)`
 * reads the ground once and keeps the answer (the hamlet part is built
 * before the people, but either may come alone: `parts=` builds only some).
 *
 * The yard, as a player comes down the palm lane from the village street:
 * the family's stall at the lane's edge by the yard's gap in the bamboo
 * fence (its painted sign turned up the lane), behind it the swept earth of
 * the yard, the open cooking shed with its long stove, the steam pouring out
 * of its ridge vent and a tapped palm with its ladder standing right behind
 * it (the view lines them up); to the right the family's own little stilt
 * house of palm leaf, its jars, a straw stack and a cow; the drying racks of
 * golden cakes in the sun south of the shed; the palms in clumps and singles
 * round it all, most of them tapped, and more on the paddies' dikes.
 *
 * - **The shed** (`HUT`): a local frame (m) round its middle on the ground,
 *   +x east (the open front, facing the palm lane), +z south. The long clay
 *   stove runs along z under the east slope of the roof, its three woks in a
 *   row, the fire mouths on its east face; the thatch comes down to a
 *   woven palm-leaf wall on the west, the gables are closed with woven leaf.
 *   North of it the fronds and firewood, the juice jars inside in its
 *   south-east corner, the mat of moulds by them.
 * - **The house** (`HOME`), **the stall** (`STALL`), **the drying racks**
 *   (`RACKS`) and the rest of the yard (`YARD`): world metres.
 * - **The palms** (`PsPalm`): sugar palms in the yard and on the dikes of the
 *   east paddies, most of them tapped (a bamboo ladder, tubes under the
 *   crown), a few not. Their foot is on the ground or the dike top; the crown's
 *   base (where the ladder ends and the tapper works) is `h − 1.6` over it
 *   (veg/palms.ts contract).
 * - **The rounds** (`ROUNDS`): the palms the tapper climbs one after the
 *   other, and the way between them (round the house, the racks and the
 *   stall; along the dikes: never through a flooded plot).
 * - **The cooking** through the day (`psCooking`) and the lamps (`psLamps`):
 *   from the clock alone, so the build and the people agree.
 */

/** The shed's middle (m) and the local frame's axes (+x east, +z south). */
export const HUT = { x: 387.5, z: -1 };

/** A spot in a local frame (m). */
export interface Local {
  x: number;
  z: number;
}

/** The long clay stove: middle x, its z span, width and height (hut frame, m). */
export const STOVE = { x: 1.0, z0: -4.0, z1: 1.8, w: 1.15, h: 0.7 };
/** The woks along the stove (hut z) and their radius; the syrup lies `SYRUP_DROP` under their rims (`_psHut.ts` `WOK_TOP`). */
export const WOKS = [-3.0, -1.1, 0.8];
export const WOK_R = 0.62;
export const SYRUP_DROP = 0.06;
/** The chimney at the stove's north end (hut frame): middle and top (m over the ground). */
export const CHIMNEY = { x: 1.0, z: -4.35, top: 1.75 };
/** The vent along the ridge over the stove (hut z): the top of the thatch is open there under a little raised roof. */
export const VENT = { z0: -4.3, z1: 2.0 };
/** Posts: the eaves' line (± x), rows along z, their height; the ridge's height; the roof's overhang. */
export const ROOF = { postX: 3.0, rows: [-4.6, -0.6, 3.4], eave: 2.95, ridge: 5.35, over: 0.8 };
/** The big earthen jars for the juice (hut frame, m) and where the tapper stands to pour into them (facing west). */
export const JARS: Local[] = [
  { x: 2.15, z: 2.35 },
  { x: 1.25, z: 2.7 },
  { x: 2.1, z: 3.15 },
];
export const POUR: Local = { x: 2.95, z: 2.1 };
/** The mat of moulds (palm-leaf rings) where the grandmother pours the syrup into cakes, and where she squats. */
export const MAT = { x0: -1.95, x1: -0.35, z0: 2.15, z1: 3.15 };
export const GRANNY: Local = { x: -2.35, z: 2.65 };
/**
 * The low bench under the east eaves, facing the lane (its seat's span and height: a Khmer low bench,
 * the height of people/_personModel.ts `FIT.stool` under a man sitting), where one sits (the middle of
 * the seat: the `stool` pose keeps the hips over the feet's spot), and the child's little stool by it.
 */
export const BENCH = { x: 3.3, z0: -2.7, z1: -0.95, h: 0.23 };
export const SEAT: Local = { x: 3.3, z: -1.55 };
export const KID_STOOL: Local = { x: 3.35, z: -3.25 };
/** The fronds and firewood (outside, north) and where one stands to take some. */
export const PILE = { x0: -2.1, x1: 1.6, z0: -6.9, z1: -5.55 };
export const PILE_AT: Local = { x: 1.9, z: -6.0 };
/** The rack of clean bamboo tubes drying (outside, north-east). */
export const RACK = { x: 3.75, z0: -5.4, z1: -3.9 };
/** The fire side of the stove (east): x of whoever squats there feeding the mouths (the stirring side is where the paddle reaches the wok's middle: `FIT.wok`). */
export const FIRE_X = 2.25;
/** The lantern hung from the front eave beam over the bench (hut frame; its height over the ground): lit while they work in the dark. */
export const LANTERN = { x: 2.75, y: 2.35, z: -2.15 };

// ── The family's house ──────────────────────────────────────────────────────

/**
 * The family's own house (ផ្ទះស្លឹក: palm leaf on hardwood posts), west of
 * the shed, its front (and veranda) to the east, the yard: its middle (world
 * m) and, in its own frame (world axes from the middle), the rooms' span,
 * the floor's and the walls' tops, the ridge (m over the ground), the roof's
 * overhang. The stilts stand on the rooms' corners, middles and the
 * veranda's front.
 */
export const HOME = { x: 376.5, z: -7.5, x0: -2.1, x1: 2.1, z0: -2.8, z1: 2.8, floor: 2.6, wall: 4.85, ridge: 7.25, over: 0.7 };
/** The open veranda (រានហាល) along the front's north part, and the stair down from its south end (its top at the floor, its foot on the ground; house frame). */
export const VERANDA = { x0: 2.1, x1: 3.75, z0: -2.8, z1: 0.45 };
export const STAIR = { x: 2.95, z0: 0.45, z1: 2.5, w: 0.9 };
/** The door in the front wall (house frame: its middle along z) and the lamp hung on the veranda by it. */
export const DOOR = { z: -1.35, w: 0.95 };
export const HOME_LAMP = { x: 2.45, y: 4.55, z: -0.55 };
/** The hammock under the house (house frame: between the middle stilt and the south one) and its low point. */
export const HAMMOCK = { x: 0, z0: 0, z1: 2.65, y: 0.62 };

/** World (x, z) of a spot in the house's frame. */
export function homeWorld(l: Local): [number, number] {
  return [HOME.x + l.x, HOME.z + l.z];
}

/** The stair's foot on the ground (world): where the family go up in the evening and come down at dawn. */
export const HOME_FOOT = { x: HOME.x + STAIR.x, z: HOME.z + STAIR.z1 + 0.45 };

// ── The stall by the lane ───────────────────────────────────────────────────

/**
 * The family's stall at the lane's edge (world m; its own frame has the
 * world's axes, +x to the lane, where the buyer stands): a thatched roof on
 * four bamboo posts over a table of the day's sugar, palm juice in bamboo
 * tubes in an ice box, the seller's stool behind the table; the painted
 * sign on its two tall posts over the roof's north-east corner, turned to
 * the north-east (radians from +z toward +x): read coming down the lane and
 * from the stall's front, and the stall seen under it.
 */
export const STALL = { x: 395.2, z: -9.4 };
export const STALL_TABLE = { x0: 0.1, x1: 0.9, z0: -1.2, z1: 1.2, h: 0.85 };
export const SELL_SEAT: Local = { x: -0.45, z: 0 };
/** Where the buyer stands (world) and faces (the seller, west). */
export const BUY = { x: STALL.x + 1.95, z: STALL.z, facing: -Math.PI / 2 };
export const SIGN = { x: 396.15, z: -10.95, face: Math.PI - 0.8, mid: 3.55 };

// ── The yard ────────────────────────────────────────────────────────────────

/** The drying racks south of the shed, in the sun (world): x span, middle z, width, height; trays of cakes on them. */
export const RACKS = [
  { x0: 384.6, x1: 389.8, z: 5.3 },
  { x0: 384.6, x1: 389.8, z: 7.5 },
].map((r) => ({ ...r, w: 1.1, h: 0.72 }));
/** Where the grandmother stands between the racks, turning the cakes (world x along the aisle; z the aisle). */
export const DRY_AT = { xs: [385.6, 387.3, 389.0], z: 6.4 };

/** The rest of the yard (world m). */
export const YARD = {
  /** Swept earth: round the house and between it and the shed; under the racks. */
  earth: [
    [373.6, -11.4, 383.6, -3.0],
    [383.4, 3.2, 391.4, 9.4],
  ] as [number, number, number, number][],
  /** The bamboo rail fence along the lane's edge (a gap at the stall: the way in). */
  fence: [
    [396.7, -17.2, 396.6, -12.6],
    [396.35, -6.4, 395.7, 1.4],
  ] as [number, number, number, number][],
  /** Dry fronds stacked on an A-frame (fuel), between the house and the shed. */
  fronds: { x0: 380.9, x1: 383.3, z: -9.8 },
  /** The tapper's bicycle (bamboo tube holders on its carrier), leaning on the shed's west wall. */
  bike: { x: 383.95, z: -3.6 },
  /** A rice straw stack on its pole, west of the house; the chickens' basket under the house (house frame). */
  straw: { x: 369.3, z: -9.8, s: 0.8 },
  coop: { x: 1.2, z: 1.95 },
  /** The water jars in a row under the house's south eave (house frame). */
  jars: { z: 3.35, xs: [-1.6, -0.55, 0.5, 1.55] },
  /** The dog asleep in the shade by the stall (world). */
  dog: { x: 394.2, z: -12.3 },
  /** A banana clump behind the house; pots of flowers by the veranda (world). */
  banana: { x: 372.4, z: -4.6 },
  pots: { x: HOME.x + 4.4, z: HOME.z + 0.2 },
};

/** The two cows (white Khmer cows), each tethered to a stake: where, how far the rope lets them graze (world m). */
export const COWS = [
  { x: 403.2, z: -4.4, r: 1.1 },
  { x: 369.2, z: -1.2, r: 1.2 },
];
/** The hens and the rooster: round where they scratch by day (world m), and their roost under the house at night. */
export const HENS = { x: 381.4, z: -1.2, r: 4.2, roost: { x: HOME.x + 0.9, z: HOME.z + 1.2 } };

// ── The palms ───────────────────────────────────────────────────────────────

/** One sugar palm of the grove or the dikes. */
export interface PsPalm {
  id: string;
  /** Trunk's foot (m) and the ground (or dike top) there. */
  x: number;
  y: number;
  z: number;
  /** Height (the palm model's `h`) and the crown's base over the map (`y + h − 1.6`). */
  h: number;
  crown: number;
  /** Tapped: a ladder and tubes. */
  tapped: boolean;
  /** Unit direction (x, z) from the trunk's axis to the ladder, and as an angle (radians from +z toward +x: veg/palms.ts `ladder`). */
  lx: number;
  lz: number;
  ladder: number;
  seed: number;
}

/** The bamboo pole's middle stands this far out from the trunk's bark (m: half its thickness and the lashing). */
export const POLE_OUT = 0.07;
/**
 * The stubs the feet go on, one side then the other, this far apart (m): half a climbing cycle of
 * people/_personModel.ts `POSE.climb` (`FIT.climb.rise`, 0.37, times the tapper's drawn size ≈ 1.37).
 */
export const RUNG = 0.255;
/**
 * The tapper's feet stand this far under the crown's base while he works: `POSE.climb` holding on puts
 * his knife hand ≈ 1.55 m over his feet and ≈ 0.45 m ahead, a little to his right — at the tip of the
 * flower stalk on the ladder's right (veg/palms.ts `sugarPalmWork`: the tubes hang at ±54° either side
 * of the ladder, their tops at the crown's base + 0.36).
 */
export const WORK_DROP = 1.25;

/**
 * The palms (world m), in clumps and singles as sugar palms grow round a
 * yard: `g…` tapped ones of the yard — one by the lane (its ladder on the
 * lane's side: the tapper climbs it in full view), one in the clump behind
 * the house, one right behind the shed as the lane sees it (its tapper over
 * the steam), one south of the racks; `u…` not tapped (the clumps' others,
 * two young ones, one across the lane where a cow is tied); `d…` on the
 * dike junctions and along the wide dikes of the east paddies. Ladders on an
 * east or west side: from the lane and from the paddies he climbs in
 * profile. `h`: a palm's own height (else seeded, 12.6–15.8 m).
 */
const SPOTS: { id: string; x: number; z: number; tapped: boolean; side?: [number, number]; h?: number }[] = [
  { id: 'g1', x: 371.5, z: -13.5, tapped: true, side: [1, 0.3] },
  { id: 'g2', x: 382, z: 9.5, tapped: true, side: [1, -0.1] },
  { id: 'g3', x: 392.4, z: 13.4, tapped: true, side: [1, 0.15] },
  { id: 'g4', x: 392.5, z: -16.5, tapped: true, side: [1, 0.25] },
  { id: 'u1', x: 368.8, z: -10.2, tapped: false },
  { id: 'u2', x: 402.5, z: -8, tapped: false },
  { id: 'u6', x: 374, z: -17.2, tapped: false, h: 10.4 },
  { id: 'u7', x: 394.6, z: 16.9, tapped: false },
  { id: 'u8', x: 379.3, z: 12.8, tapped: false, h: 9.6 },
  { id: 'd1', x: 383.5, z: 23, tapped: true, side: [-1, 0] },
  { id: 'd2', x: 402, z: 23, tapped: true, side: [1, 0] },
  { id: 'd3', x: 384, z: 38, tapped: true, side: [1, 0] },
  { id: 'd4', x: 408, z: 35, tapped: true, side: [-1, 0] },
  { id: 'u3', x: 361, z: 33, tapped: false },
  { id: 'u4', x: 396, z: 60, tapped: false },
  { id: 'u5', x: 419, z: 66, tapped: false },
];

/** A round of the tapper: the palms in order, and the way (world x, z) before each and home after the last. */
export interface Round {
  palms: string[];
  /** `ways[k]`: points walked through before palm k (the last list: after the last palm, to the shed's forecourt). */
  ways: [number, number][][];
}

/**
 * The rounds (turn by turn): the yard (the palm by the lane, the one behind
 * the house, the one behind the shed: north of the stall, north of the
 * house, round its west and south sides, south of the racks); south of the
 * racks and down the wide dike between the first two plots; down the lane
 * and along the north dike to the wide dike east. Each ends at the shed's
 * forecourt (`FORECOURT`), from where he goes round to the jars.
 */
export const ROUNDS: Round[] = [
  {
    palms: ['g4', 'g1', 'g2'],
    ways: [[[393.3, -6], [393.3, -12.5]], [[386, -14.6]], [[370.6, -6.5], [371.4, -2.6], [376.5, 1.6], [380.5, 6.6]], [[386, 9.5], [391.3, 9.0]]],
  },
  {
    palms: ['g3', 'd1', 'd3'],
    ways: [[[393.8, 5.5]], [[388.5, 18]], [[384.4, 30]], [[384.4, 23], [387, 16.5], [389.5, 11.5], [392.5, 9.8]]],
  },
  {
    palms: ['d2', 'd4'],
    ways: [[[396.4, 9], [396.4, 23]], [[408, 23]], [[408, 23], [396.4, 23], [396.4, 9]]],
  },
];
/** The shed's forecourt (world m): where rounds end, before the jars. */
export const FORECOURT = { x: 392.6, z: 3.4 };

/** The yard's plan, with the ground read. */
export interface PsPlanned {
  /** Ground under the shed's middle (m). */
  y: number;
  palms: PsPalm[];
  byId: Record<string, PsPalm>;
}

const cache = new WeakMap<HeightField, PsPlanned>();

/** The plan on this land (read once per height field). */
export function psPlan(field: HeightField): PsPlanned {
  const hit = cache.get(field);
  if (hit) return hit;
  const palms: PsPalm[] = SPOTS.map((s, i) => {
    const y = field.heightAt(s.x, s.z);
    const seed = 9100 + i * 13;
    const h = s.h ?? 12.6 + 3.2 * hash3(i, 3, 7, 9101);
    const [sx, sz] = s.side ?? [Math.sin(i * 2.4), Math.cos(i * 2.4)];
    const l = Math.hypot(sx, sz) || 1;
    return { id: s.id, x: s.x, y, z: s.z, h, crown: y + h - 1.6, tapped: s.tapped, lx: sx / l, lz: sz / l, ladder: Math.atan2(sx, sz), seed };
  });
  const plan: PsPlanned = { y: field.heightAt(HUT.x, HUT.z), palms, byId: Object.fromEntries(palms.map((p) => [p.id, p])) };
  cache.set(field, plan);
  return plan;
}

/** World (x, z) of a spot in the shed's frame. */
export function hutWorld(l: Local): [number, number] {
  return [HUT.x + l.x, HUT.z + l.z];
}

// ── The cooking and the lamps through the day ──────────────────────────────

const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The family works from before dawn (they light the fire in the blue hour,
 * `clock` ≈ 0.69) to dusk (≈ 0.23): the clock's day side (0 is the golden
 * afternoon, 0.75 dawn). The stall is open as long.
 */
export function psWorking(clock: number): boolean {
  const c = clock - Math.floor(clock);
  return c >= 0.69 || c < 0.23;
}

/** The cooking now: the fire (0 cold … 1 roaring; the night keeps embers ≈ 0.2), the steam off the woks (0‥1), the syrup boiling (0‥1). */
export interface Cooking {
  fire: number;
  steam: number;
  boil: number;
}

/**
 * From the clock and the weather: the fire comes up in the blue hour before
 * dawn and dies to embers after dusk; the steam is thickest in the cool
 * morning (it shows best against the low sun), thinner in the afternoon's
 * heat; rain damps it all a little (the roof keeps the fire).
 */
export function psCooking(clock: number, rain: number, out: Cooking): Cooking {
  const c = clock - Math.floor(clock);
  // (hours from dawn's side: 0.69 → 1.23 is the working day)
  const u = c < 0.5 ? c + 1 : c;
  const on = smooth(0.69, 0.72, u) * (1 - smooth(1.2, 1.25, u));
  // Embers through the night: glowing after dusk, fading toward dawn.
  const night = c >= 0.23 && c < 0.69 ? 0.08 + 0.2 * (1 - smooth(0.25, 0.66, c)) : 0;
  out.fire = Math.max(on, night);
  const cool = 0.55 + 0.45 * smooth(0.7, 0.76, u) * (1 - smooth(0.9, 0.99, u));
  out.steam = on * cool * (1 - 0.3 * rain);
  out.boil = on;
  return out;
}

/** The lamps now (0 out … 1 lit): the house's (the evening at home, and waking before dawn), the shed's lantern (work in the dark: the blue hour, dusk). */
export interface Lamps {
  home: number;
  shed: number;
}

export function psLamps(clock: number, out: Lamps): Lamps {
  const c = clock - Math.floor(clock);
  out.home = Math.max(smooth(0.19, 0.215, c) * (1 - smooth(0.4, 0.425, c)), smooth(0.66, 0.675, c) * (1 - smooth(0.735, 0.755, c)));
  out.shed = Math.max(smooth(0.685, 0.7, c) * (1 - smooth(0.76, 0.785, c)), smooth(0.165, 0.18, c) * (1 - smooth(0.226, 0.234, c)));
  return out;
}
