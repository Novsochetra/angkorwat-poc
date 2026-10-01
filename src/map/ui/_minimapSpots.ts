import { BACK_HAMLET, EAST_VILLAGE, KULEN_PICNIC, MARKET, PALM_GROVE, PLACES } from '../layout';
import { WORSHIP } from '../roam/_worship';
import { BIKE_SPOTS, type BikeSpotId } from '../roam/_bikeSpots';
import { ZIP_START } from '../roam/_zipPlan';
import { LOTUS_BED } from '../roam/_lotusHook';
import { HOME_AT } from '../hamlet/_homePlan';
import type { WordKey } from './lang';
import { badgeSprite, outlined, pixelSvg } from './_minimapArt';

/**
 * The villages and holy places on the mini-map and the big map
 * (ui/minimap.ts): the sugar-palm village, its morning market, the palm
 * sugar hut, the Kulen waterfall (the picnic place below it), the reclining
 * Buddha on Phnom Kulen and the hamlet behind Angkor Wat. Each is a small
 * pixel picture on a round badge like the glider ramps' (a stilt house by a
 * sugar palm, a market parasol over its stall, a sugar palm with the
 * tapper's ladder and tubes, a waterfall, the golden reclining Buddha on
 * his plinth, a thatched hut by the lotus pond), named on the big map in
 * the language in use, and a target there
 * like the temples and the ramps (`target=<id>` in the URL, e.g.
 * `target=market`).
 *
 * The reclining Buddha shows once his worship spot `kulen-buddha` exists
 * (roam/_worship.ts: his badge stands on the statue).
 */

export type SpotId = 'east-village' | 'market' | 'palm-grove' | 'kulen-picnic' | 'kulen-buddha' | 'back-hamlet' | BikeSpotId | 'zip-line' | 'lotus-bed' | 'home';

export interface MapSpot {
  id: SpotId;
  /** Where it is (m): its badge on the mini-map, the target's point. */
  x: number;
  z: number;
  /** Where its badge stands on the big map (m): the same, or pushed clear of a temple's icon (`clearOfTemples`). */
  bx: number;
  bz: number;
  /** How near counts as arriving, on foot or by boat (m). */
  arrive: number;
  /** Its name on the maps, and as said in a sentence ("Heading for the morning market"): ui/lang.ts. */
  name: WordKey;
  the: WordKey;
  /** Its picture: pixel rows (with their outline), keys of `PAL`. */
  rows: string[];
}

/** The pictures' colours (lit from the left, like the temple icon). */
const PAL: Record<string, string> = {
  // roof tiles, thatch, walls, the door, stilts and posts
  R: '#e58a5a',
  r: '#b4532f',
  T: '#ecc77e',
  t: '#b98a48',
  w: '#f2dfb6',
  d: '#4a2e1c',
  p: '#8a6038',
  // palm leaves, trunk, bamboo
  G: '#86c44f',
  g: '#3f7f2e',
  b: '#7a5230',
  l: '#e8d496',
  // the parasol, the fruit, the stall
  c: '#e2483c',
  C: '#fff1dc',
  y: '#f5c542',
  n: '#f08a2c',
  m: '#a8743f',
  // rock, falling water, the pool
  K: '#b9b0a0',
  k: '#857e72',
  W: '#f4fdff',
  B: '#4cb8d8',
  a: '#2a7fa6',
  // gold, the plinth's stone, the lotus
  Y: '#ffd76a',
  u: '#d99a2b',
  S: '#e8d7b6',
  s: '#b39c7a',
  P: '#f59ab8',
  o: 'rgba(24, 16, 12, 0.88)',
};

/** A Khmer house on stilts, a sugar palm beside it. */
const VILLAGE = [
  '..........G..',
  '.........GgG.',
  '........GgGgG',
  '....RR...gGg.',
  '...RRrr...b..',
  '..RRrrrr..b..',
  '.RRrrrrrr.b..',
  '..wwwdww..b..',
  '..wwwdww..b..',
  '..p.p..p..b..',
  '..p.p..p..b..',
];

/** A striped market parasol over a stall of fruit and greens. */
const MARKET_ART = [
  '....cCc....',
  '..cCcCcCc..',
  '.CcCcCcCcC.',
  'cCcCcCcCcCc',
  '.....m.....',
  '.ynG.m.Gyn.',
  'mmmmmmmmmmm',
  '.m.......m.',
  '.m.......m.',
];

/** A sugar palm: its round crown, the tapper's tubes hung under it, the rungs of his bamboo ladder up its trunk. */
const PALM = [
  '...G.G.G...',
  '..GgGgGgG..',
  '.GgGgGgGgG.',
  'GgGgGgGgGgG',
  '.gGgbbbGgg.',
  '.l..bbb..l.',
  '.l..lbl..l.',
  '.....b.....',
  '....lbl....',
  '.....b.....',
  '....lbl....',
  '.....b.....',
  '....lbl....',
];

/** A waterfall between wooded rocks, its spray and pool. */
const FALLS = [
  'GG.......GG',
  'GGK.....KGG',
  'KkkWBWBWkkK',
  'KkkWBWBWkkK',
  '.kkWBWBWkk.',
  '.kkWBWBWkk.',
  '..kWBWBWk..',
  '.WWWWWWWWW.',
  'BaBWBaBWBaB',
  '.BaBaBaBaB.',
];

/** The golden reclining Buddha on his plinth: the lotus bud on his crown (Khmer: never a flame), his head on his hand. */
const BUDDHA = [
  '..u..........',
  '.uYu.........',
  '.uYu.........',
  '.uYuuYYYu....',
  'uuYYYYYYYYuu.',
  '.uYYYYYYYYYYu',
  'sSSSSSSSSSSSs',
  '.sSSSSSSSSSs.',
];

/** A thatched hut on low stilts by the lotus pond, a lotus in flower on it. */
const HAMLET = [
  '....Tt.....',
  '...TTtt....',
  '..TTtttt...',
  '.TTtttttt..',
  '..wwdww....',
  '..p...p..P.',
  'aBBBBBBBGPG',
  'BBGBBBBBBBB',
  '.BBBBBBBBB.',
];

/** A town bicycle (roam/_bikeSpots.ts: where the bicycles to ride stand): its frame in gold on the dark badge, the saddle, the basket on the front. */
const BIKE_ART = [
  '...dd....uu....',
  '....u.....u.mm.',
  '....u.....u.mm.',
  '..KKKu...u.KKK.',
  '.K...Ku.u.Ku..K',
  '.K.kuuuuu.K.k.K',
  '.K...K....K...K',
  '..KKK......KKK.',
];

/** The zip line (roam/_zipPlan.ts: its first stair's foot): a cable from a tall tree's platform down to the next, a rider under his red trolley. */
const ZIP_ART = [
  'GGG..........',
  'GgGG.........',
  'gGgG.........',
  '.bkk.........',
  'mmmmkk.......',
  '.b...ckk...GG',
  '.b...n..kkGgG',
  '.b..wnw...kgG',
  '.b...d...mmmm',
  '.b.........b.',
  '.b.........b.',
];

/** The lotus bed in the great lake (roam/_lotusBed.ts): a pink bud on its stem over round leaves on the water. */
const LOTUS_ART = [
  '.....P.....',
  '....PPP....',
  '....PPP....',
  '.....G.....',
  '..GG.g.....',
  '.GgGGg..GG.',
  'BaGGBBBGgGB',
  'BBBBaBBBBBa',
  '.BBaBBBaBB.',
];

/** His stilt house (hamlet/_home.ts, roam/_home.ts): its tiled gable with the little sun in it, the lamps lit in its windows, the door, the stair. */
const HOME_ART = [
  '......R......',
  '.....RRR.....',
  '....RRYRR....',
  '...RRrYrrR...',
  '..RRrrrrrrR..',
  '.RRrrrrrrrrR.',
  '..wYwwddwYw..',
  '..wYwwddwYw..',
  '..mmmmmmmmm..',
  '..p..p...pm..',
  '..p..p...m...',
];

/**
 * On the big map (about 1 px a metre, less on a small screen) a badge this near a temple's icon
 * (m) would sit on it: it goes out to this far along the line from the temple (east if on it).
 */
const TEMPLE_CLEAR = 42;

/** A spot at (x, z), its big-map badge clear of the temples' icons. */
function spot(id: SpotId, x: number, z: number, arrive: number, name: WordKey, the: WordKey, rows: string[]): MapSpot {
  let bx = x;
  let bz = z;
  for (const p of PLACES) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d >= TEMPLE_CLEAR) continue;
    bx = p.x + (d > 0.5 ? (x - p.x) / d : 1) * TEMPLE_CLEAR;
    bz = p.z + (d > 0.5 ? (z - p.z) / d : 0) * TEMPLE_CLEAR;
  }
  return { id, x, z, bx, bz, arrive, name, the, rows };
}

const reclining = WORSHIP.find((w) => w.id === 'kulen-buddha');

/** The places, drawn in this order (the temples go over them). */
export const MAP_SPOTS: readonly MapSpot[] = [
  spot('back-hamlet', BACK_HAMLET.x, BACK_HAMLET.z, 18, 'jnHamlet', 'jnTheHamlet', outlined(HAMLET)),
  spot('kulen-picnic', KULEN_PICNIC.x, KULEN_PICNIC.z, 12, 'jnFalls', 'jnTheFalls', outlined(FALLS)),
  ...(reclining ? [spot('kulen-buddha', reclining.fx, reclining.fz, 10, 'jnBuddha', 'jnTheBuddha', outlined(BUDDHA))] : []),
  spot('palm-grove', PALM_GROVE.x, PALM_GROVE.z, 14, 'jnPalmSugar', 'jnThePalmSugar', outlined(PALM, 'l')),
  spot('market', MARKET.x, MARKET.z, 14, 'jnMarket', 'jnTheMarket', outlined(MARKET_ART)),
  spot('east-village', EAST_VILLAGE.x, EAST_VILLAGE.z, 30, 'evVillage', 'evVillage', outlined(VILLAGE)),
  // (the bicycles' places: roam/_bike.ts)
  ...BIKE_SPOTS.filter((b) => b.badge).map((b) => spot(b.id, b.x, b.z, 6, 'bikeMap', 'bikeTheMap', outlined(BIKE_ART))),
  // (the zip line: at its first stair's foot by the back trail, roam/_zip.ts)
  spot('zip-line', ZIP_START.x, ZIP_START.z, 12, 'zipMap', 'zipTheMap', outlined(ZIP_ART)),
  // (the lotus to pick from the boat: roam/_lotus.ts)
  spot('lotus-bed', LOTUS_BED.x, LOTUS_BED.z, LOTUS_BED.r, 'lotusMap', 'lotusTheMap', outlined(LOTUS_ART)),
  // (his stilt house at the sugar-palm village's north-east edge: roam/_home.ts)
  spot('home', HOME_AT.x, HOME_AT.z, 9, 'homeMap', 'homeTheMap', outlined(HOME_ART)),
];

/** A place's picture on its badge (the mini-map), `k` device px per pixel (gold: the target). */
export const spotSprite = (s: MapSpot, k: number, gold = false): HTMLCanvasElement => badgeSprite(s.rows, PAL, k, gold);

/** A place's picture as SVG (the big map's badge, the arrival banner), its width in pixels as `--w`. */
export const spotSvg = (s: MapSpot, cls: string): string => pixelSvg(s.rows, cls, [[PAL, '']]).replace('<svg ', `<svg style="--w: ${s.rows[0].length}" `);
