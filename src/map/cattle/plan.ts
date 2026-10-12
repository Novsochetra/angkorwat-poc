/**
 * Where his cattle and the cattle trader are (no three.js), so the roaming
 * add-on (roam/_cattle*.ts), the trader himself (people/_sceneCattle.ts) and
 * the maps (ui/_minimapSpots.ts) read the same numbers; and the small shared
 * state between them (`TRADER`, `CATTLE_OBSTACLES`).
 *
 * **The cattle trader** (ឈ្មួញគោ) keeps his place on the Kulen foot meadow
 * north of the sugar-palm village, west of the Kulen foot trail, 50 m north
 * of his stilt house (hamlet/_homePlan.ts `HOME_AT`): a big old tamarind for
 * shade, his low stool under it facing the trail, a calf and two cattle tied
 * to posts in front, a stack of rice-straw bundles (ចំបើង) behind him, a log
 * trough. The meadow there lies a land step (2 m) below the village (8 m),
 * flat and open; the trail runs 5 m east of his front posts.
 *
 * Its frame (as the nursery's, hamlet/_nurseryPlan.ts): `x, z` its middle on
 * the ground, `yaw` the way its front looks (east, to the trail); local x
 * along the trail (+x north), +z out to the front. Local (lx, lz) is the
 * map's (x + lz, z − lx).
 *
 * **His cows** are tethered by day to four stakes on the same meadow, north
 * of his house and east of the trail (`STAKES`), where nothing is built and
 * the garden is not (its plants are kept clear of the ropes' reach by the
 * cows themselves: they graze round them).
 */

export const TRADER_AT = { x: 397.5, z: -150, yaw: Math.PI / 2 } as const;

/** Local (lx, lz) → the map's (x, z). */
export function traderToWorld(lx: number, lz: number): [number, number] {
  const c = Math.cos(TRADER_AT.yaw);
  const s = Math.sin(TRADER_AT.yaw);
  return [TRADER_AT.x + lx * c + lz * s, TRADER_AT.z - lx * s + lz * c];
}
/** A heading in its frame (local radians from +z toward +x) → the map's. */
export const traderYaw = (local: number): number => local + TRADER_AT.yaw;

/** The tamarind: its trunk's foot (local), its girth (radius, m), its crown's middle (local), radius and height. */
export const TRADER_TREE = { x: 0.6, z: -2.7, r: 0.62, cx: 0.2, cz: -1.4, cr: 5.6, cy: 6.4, low: 3.8 } as const;
/** His low stool (local), the way he faces on it (local radians: 0 = +z, out to the trail). */
export const TRADER_STOOL = { x: -0.7, z: 0.15, face: 0.1 } as const;
/** His kettle and cup on an upturned crate beside the stool (local). */
export const TRADER_CRATE = { x: 0.45, z: -0.25 } as const;
/** His stack of straw bundles (local middle, half size). */
export const TRADER_STRAW = { x: 2.6, z: -1.4, hw: 0.9, hd: 0.7 } as const;
/** The log trough (local middle, its length along local x). */
export const TRADER_TROUGH = { x: -4.2, z: 0.5, len: 2.0 } as const;
/**
 * The tethering posts (local) and the animal tied at each: the way it stands out from its post (local radians: its
 * middle is that way, its nose half a metre short of the post), what it is (a grown one, a calf and a young cow: he
 * sells the calf and the young cow, the grown one is his own plough ox), its size (× `OX`).
 */
export const TRADER_POSTS: readonly { readonly x: number; readonly z: number; readonly out: number; readonly kind: 'calf' | 'young' | 'grown'; readonly size: number }[] = [
  { x: -4.6, z: 2.2, out: -0.55, kind: 'grown', size: 1.46 },
  { x: -2.6, z: 3.6, out: 0.25, kind: 'calf', size: 0.78 },
  { x: 3.4, z: 2.6, out: 0.4, kind: 'young', size: 1.15 },
];
/** The ox model's nose ahead of its middle (model units: × its size for metres). */
export const OX_NOSE = 1.67;
/** Where post `i`'s animal stands by its post (local: its middle; the way it faces, local radians, toward the post), into `out`. */
export function postAnimal(i: number, out: { x: number; z: number; face: number }): { x: number; z: number; face: number } {
  const p = TRADER_POSTS[i];
  const d = OX_NOSE * p.size + 0.5;
  out.x = p.x + Math.sin(p.out) * d;
  out.z = p.z + Math.cos(p.out) * d;
  out.face = p.out + Math.PI;
  return out;
}
/** Where the buyer stands (local, before the stool, facing it: local −z) and how near he must be (m). */
export const TRADER_BUY = { x: -0.6, z: 2.35, r: 1.9 } as const;
/** Before his place (local box): the prompt says he is away (out of his hours) or coming back. */
export const TRADER_FRONT = { x0: -8, x1: 7, z0: -1, z1: 9 } as const;
/** His hand-painted sign on a post by the trail (local), side-on to it. */
export const TRADER_SIGN = { x: 5.6, z: 6.4, turn: -Math.PI / 2 + 0.3, w: 1.5 } as const;

/** Open hours (the clock: 0 golden afternoon, 0.25 dusk, 0.5 night, 0.75 dawn): a little after sunrise to the late afternoon. */
export const TRADER_HOURS: readonly [number, number] = [0.77, 0.19];
/** Where he walks home (and in from) out of hours: to the trail, down it to the village street (map m). */
export const TRADER_AWAY: readonly (readonly [number, number])[] = [
  [405.5, -149],
  [411.6, -143],
  [412.4, -124],
  [411.8, -100],
  [410.6, -88],
  [410.2, -76],
  [409.5, -66],
];

/**
 * His cows' stakes (map m) on the meadow north of his house, east of the trail, clear of the stream's bank; the rope
 * lets a cow's middle go `ROPE` m round its stake.
 */
export const STAKES: readonly (readonly [number, number])[] = [
  [421, -134.5],
  [430, -137.5],
  [422, -146],
  [431, -148.5],
];
export const ROPE = 2.7;

/** Whether the clock is in a window (wrapping past 1). */
export function inHours(clock: number, [a, b]: readonly [number, number]): boolean {
  const c = clock - Math.floor(clock);
  return a <= b ? c >= a && c < b : c >= a || c < b;
}
export const traderOpen = (clock: number): boolean => inHours(clock, TRADER_HOURS);

/** His cows' day: out to their stakes after dawn, into the pen (if there is one) before dusk (the clock). */
export const PEN_HOURS: readonly [number, number] = [0.21, 0.79];
/** Without a pen they lie down by their stakes through the night. */
export const LIE_HOURS: readonly [number, number] = [0.3, 0.76];

/**
 * The trader and the roaming add-on (one plain object): whether the people part has him (`ready`), where he is
 * (`here`: open and on his way or at his place; `atStool`: sitting there to serve), what the add-on wants of him
 * (`wanted`: someone at his stool in his hours, he comes back to it; `visit`: his card is open, he talks to him), and
 * its cues (`cue`, counted by `cueN`): a greeting as the card opens, his thanks for a purchase, a cow he paid for.
 */
export const TRADER = {
  ready: false,
  here: false,
  atStool: false,
  wanted: false,
  visit: false,
  cue: '' as '' | 'hi' | 'bought' | 'straw' | 'sold' | 'short',
  cueN: 0,
  /** The display animal he just sold (0‥2, `TRADER_POSTS`), untied and led off: he points after it. */
  led: -1,
};

/** The add-on cues him (people/_sceneCattle.ts plays it). */
export function traderCue(c: (typeof TRADER)['cue']): void {
  TRADER.cue = c;
  TRADER.cueN++;
}

/**
 * Where the cattle stand this frame (his and the trader's, map m), for the people's traffic: walkers go round them
 * (people/_sceneCattle.ts reports them). Written by roam/_cattleHerd.ts; `n` of them are in use.
 */
export const CATTLE_OBSTACLES = {
  n: 0,
  x: new Float32Array(16),
  y: new Float32Array(16),
  z: new Float32Array(16),
  r: new Float32Array(16),
};
