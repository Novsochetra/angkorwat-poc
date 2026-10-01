import type { CalendarEvent, EventKind } from '../calendar';
import { badgeSprite, outlined, pixelSvg } from '../ui/_minimapArt';

/**
 * The calendar of events' pictures (roam/_calendar*.ts, ui/minimap.ts): a
 * small pixel picture for each event, in the look of the maps' badges
 * (_minimapSpots.ts: lit from the left, a dark outline). By the event's id
 * (`EVENT_ART`: a later event adds its own line), else by its kind
 * (`KIND_ART`). Khmer forms: the ngo racing boat (never a dragon boat), the
 * apsara's three-spired mokot, a monk's alms bowl in its saffron sling, the
 * skor drum, the khleng ek with its humming bow, a sand stupa with its flag.
 */

const PAL: Record<string, string> = {
  Y: '#ffd76a',
  u: '#d99a2b',
  U: '#fff0b0',
  R: '#e2483c',
  r: '#a8322a',
  W: '#f4f0e2',
  c: '#fff1dc',
  B: '#4cb8d8',
  a: '#2a7fa6',
  G: '#86c44f',
  g: '#3f7f2e',
  b: '#7a5230',
  p: '#a8743f',
  S: '#ecd9b0',
  s: '#c4a578',
  K: '#a39d92',
  k: '#5e5850',
  d: '#2e2a28',
  O: '#f08a2c',
  h: '#c0631c',
  n: '#e2b896',
  T: '#ecc77e',
  t: '#b98a48',
  P: '#f59ab8',
  q: '#cf5f7f',
  o: 'rgba(24, 16, 12, 0.88)',
};

/** A ngo racing boat: its high prow, the rowers in red, on the water. */
const WATER = [
  'Yu...........',
  '.uY..........',
  '..uY.........',
  '..uY.R.R.R.R.',
  '..uYYYYYYYYYu',
  '...uuuuuuuuu.',
  'aBBaBBBaBBBaB',
  '.BaBBaBBBaBB.',
];
/** A sand stupa (phnom khsach) with a little flag on its top. */
const NEWYEAR = [
  '.....RRr...',
  '.....RR....',
  '.....b.....',
  '....SYS....',
  '...SSSSS...',
  '..SsSYSsS..',
  '.SSSSSSSSS.',
  'SsSSYSSYSsS',
  'sssssssssss',
];
/** A monk in saffron, his palms together, the dawn light behind him. */
const CHANT = [
  '..U...U...U..',
  '...U.....U...',
  '.....nnn.....',
  '.....nnn.....',
  '....OOnOO....',
  '...OOOnOOh...',
  '..OOOOOOOOh..',
  '.OOOOOOOOOOh.',
  '.hhhhhhhhhhh.',
];
/** The skor drum on its stand, the two sticks over it. */
const DRUM = [
  '.p.......p.',
  '..p.....p..',
  '...p...p...',
  '..rrrrrrr..',
  '.rRRYRYRRr.',
  '.RRRRRRRRR.',
  '.rRRYRYRRr.',
  '..rrrrrrr..',
  '..b.....b..',
  '.b.......b.',
];
/** A monk's alms bowl (bat) with its lid, in the saffron cloth it is carried in. */
const ALMS = [
  '.....d.....',
  '...kkKkk...',
  '..kKKKKKk..',
  '.OOOOOOOOO.',
  '.kkkKKKkkk.',
  '..kkkkkkk..',
  '...kkkkk...',
  '....hhh....',
];
/** A striped market parasol over a stall of fruit and greens. */
const MARKET = [
  '....RWR....',
  '..RWRWRWR..',
  '.WRWRWRWRW.',
  'RWRWRWRWRWR',
  '.....p.....',
  '.YOG.p.GYO.',
  'ppppppppppp',
  '.p.......p.',
  '.p.......p.',
];
/** A seller in a palm-leaf hat in her boat, its baskets full, on the lake. */
const BOATS = [
  '....TTT....',
  '...TTtTT...',
  '.....n.....',
  '.GY.RRR.YO.',
  'pbbbbbbbbbp',
  '.pbbbbbbbp.',
  'aBBaBBBaBBa',
];
/** An apsara's face under her golden mokot (three spires, the middle one tallest). */
const APSARA = [
  '......Y......',
  '..Y..YuY..Y..',
  '..Y..YuY..Y..',
  '.YuY.YuY.YuY.',
  '.YuYYYuYYYuY.',
  '.YYYYYYYYYYY.',
  '.uYuYuYuYuYu.',
  '..nnnnnnnnn..',
  '..ndnnnnndn..',
  '..nnnnnnnnn..',
  '...nnnRnnn...',
  '....nnnnn....',
];
/** An elephant in the river, spraying water from her trunk. */
const ELEPHANT = [
  'B.B..........',
  '.B...........',
  '.K...KKKKK...',
  '.K.KKKKKKKKK.',
  '.KKKKKKKKKKKK',
  '..KdKKKKKKKKK',
  '...KKKKKKKKK.',
  '...KK.KK..KK.',
  'aBBKKBKKBBKKB',
  'BBaBBBBaBBBBa',
];
/** A macaque sitting, its long tail curled behind it. */
const MONKEY = [
  '..bbb........',
  '.bnnnb.......',
  '.bndnb.......',
  '..bnb........',
  '.bpppb.......',
  'bppppppb.....',
  'bppppppb...b.',
  '.pppppp...b..',
  '.pp..pp..b...',
  '.bb..bbbb....',
];
/** A khleng ek: the bird-shaped kite, its humming bow over it, two long tails. */
const KITE = [
  '..u.......u..',
  '...uuuuuuu...',
  'W.....R.....W',
  'WW...WRW...WW',
  'WWWWWWRWWWWWW',
  '.WWWWWRWWWWW.',
  '..WWWWRWWWW..',
  '....WWRWW....',
  '.....T.T.....',
  '....T...T....',
  '...T.....T...',
];
/** Seedlings planted out in a flooded paddy. */
const PLANTING = [
  '..G...G...G..',
  '.GgG.GgG.GgG.',
  '..g...g...g..',
  '..g...g...g..',
  'BBgBBBgBBBgBB',
  'aBBBaBBBaBBBa',
];
/** A sheaf of golden rice, tied. */
const HARVEST = [
  '..Y.Y.Y.Y..',
  '.YuYuYuYuY.',
  '..uYuYuYu..',
  '...uYuYu...',
  '....uuu....',
  '...tTTTt...',
  '....uuu....',
  '...uu.uu...',
  '..uu...uu..',
  '.uu.....uu.',
];
/** Pchum Ben's bay ben: sticky-rice balls heaped on a banana leaf. */
const BAYBEN = [
  '....W.W....',
  '...WcWcW...',
  '..WcWcWcW..',
  '.WcWcWcWcW.',
  'GGGGGGGGGGG',
  '.gGgGgGgGg.',
  '..ggggggg..',
];
/** Visak Bochea: a lit candle and a lotus bud, as carried round the pagoda. */
const CANDLE = [
  '...Y.......',
  '..YUY......',
  '...Y.......',
  '..WWW......',
  '..WcW...P..',
  '..WcW..PqP.',
  '..WcW..PqP.',
  '..WcW...g..',
  '..WWW...g..',
  '.sssssssss.',
];
/** The equinox sunrise: the sun coming up right behind Angkor Wat's five towers, the pool before them. */
const EQUINOX = [
  '.....YYY.....',
  '...YYUUUYY...',
  '..YUUUkUUUY..',
  '.YUUUkkkUUUY.',
  '.YUkUkkkUkUY.',
  '..kkkkkkkkk..',
  'kkkkkkkkkkkkk',
  'BBaBBBBBBBaBB',
];
/** A lotus in flower (a festival). */
const LOTUS = [
  '.....P.....',
  '....PqP....',
  '..P.PqP.P..',
  '.PqPPqPPqP.',
  '..PqPqPqP..',
  '...PPPPP...',
  '.G..g.g..G.',
  'GgG..g..GgG',
];
/** The sun (a moment of the day). */
const SUN = [
  '.....Y.....',
  '.Y...Y...Y.',
  '..Y.YYY.Y..',
  '...YYYYY...',
  'YYYYYuYYYYY',
  '...YYYYY...',
  '..Y.YYY.Y..',
  '.Y...Y...Y.',
  '.....Y.....',
];
/** A stalk of rice (a time of the year). */
const STALK = [
  '....Y......',
  '...YuY.....',
  '....uY.....',
  '.....u.G...',
  '.G...g.Gg..',
  '.gG..g.g...',
  '..g..g.g...',
  '..g.gg.g...',
  'BBBBBBBBBBB',
];
/** A star (a rare moment). */
const STAR = [
  '.....Y.....',
  '.....Y.....',
  '....YYY....',
  'YYYYYUYYYYY',
  '.YYYUUUYYY.',
  '..YYYUYYY..',
  '..YY...YY..',
  '.Y.......Y.',
];
/** The calendar's own button: a page with its two rings, a red band, a gold day marked. */
const PAGE = [
  '..d......d..',
  '.RdRRRRRRdR.',
  '.RRRRRRRRRR.',
  '.cccccccccc.',
  '.cKcKcKcKcc.',
  '.cccccccccc.',
  '.cKcKcYYcKc.',
  '.cccccYYccc.',
  '.cKcKcccKcc.',
  '.cccccccccc.',
];

/** The pictures by event id (outlined once): a later event adds its line. */
export const EVENT_ART: Record<string, string[]> = {
  water: outlined(WATER),
  newyear: outlined(NEWYEAR),
  dawnChant: outlined(CHANT),
  duskDrum: outlined(DRUM),
  dakbat: outlined(ALMS),
  'dakbat-back': outlined(ALMS),
  market: outlined(MARKET),
  'market-back': outlined(MARKET),
  'market-float': outlined(BOATS),
  apsara: outlined(APSARA),
  elephants: outlined(ELEPHANT),
  monkeys: outlined(MONKEY),
  kites: outlined(KITE),
  planting: outlined(PLANTING),
  harvest: outlined(HARVEST),
  // (the other add-ons' events: the boat race, the east village's dak bat, Pchum Ben, Visak Bochea, the equinox)
  boatrace: outlined(WATER),
  'dakbat-village': outlined(ALMS),
  pchumben: outlined(BAYBEN),
  visak: outlined(CANDLE),
  equinox: outlined(EQUINOX),
};
/** By kind, for an event with no picture of its own. */
export const KIND_ART: Record<EventKind, string[]> = {
  festival: outlined(LOTUS),
  daily: outlined(SUN),
  season: outlined(STALK),
  rare: outlined(STAR),
};

const artOf = (e: CalendarEvent): string[] => EVENT_ART[e.id] ?? KIND_ART[e.kind];

/** An event's picture as SVG (the card's rows, the toast), its width in pixels as `--w`. */
export const eventSvg = (e: CalendarEvent, cls: string): string => {
  const rows = artOf(e);
  return pixelSvg(rows, cls, [[PAL, '']]).replace('<svg ', `<svg style="--w: ${rows[0].length}" `);
};

/** An event's picture on a round badge (the mini-map), `k` device px per pixel; gold: on now. */
export const eventSprite = (e: CalendarEvent, k: number, gold = true): HTMLCanvasElement => badgeSprite(artOf(e), PAL, k, gold);

/** The calendar's own picture (its button, the explorer menu). */
export const calendarSvg = (cls: string): string => pixelSvg(outlined(PAGE), cls, [[PAL, '']]);
