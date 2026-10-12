/**
 * Sharing his garden's fruit with the people of the map (the roaming add-on
 * `shareFruit`: roam/_shareFruit*.ts; the people's side: people/_shareBack.ts),
 * read like `GREET` (greet.ts) and `SALE` (shop.ts). No three.js.
 *
 * - **Who** (`findShare`): the people part lends its finder when it is built
 *   (`setShareFinder`): the Khmer grown-up or elder nearest in front of him who
 *   is free to take something (not a monk, a visitor, a dancer at her show, a
 *   rower, someone praying, up a ladder, on a bicycle, with full hands…), or
 *   the nearest child who is free to run up to him (`kids`), leaving out those
 *   `skip` names (given one today). Its `id` is the crowd index (the same
 *   person all the visit long).
 * - **The giving** (`SHARE`): roaming says what happens now (`phase`, a new
 *   `n` each change) to whom (`id`), with what (`fruit`'s colours), where he
 *   stands and faces, where a child comes to (`meetX`, `meetZ`), what they say
 *   (`word`, `word2`) and what they give back (`back`); the people part plays
 *   the person's side and writes back where they are (`px`, `py`, `pz`) and
 *   whether a child has come to him (`arrived`) or the person is gone (`lost`).
 * - **Friends** (`SHARE_FRIENDS`): how often the people of a place greet him back
 *   by his name (people/_greetBack.ts), from how much he has given there.
 */

/** The places whose people count as one for friendship (progress.ts `share.<village>`). */
export type ShareVillage = 'east' | 'floating' | 'back' | 'kulen' | 'other';

/** The middles of the places (m, from layout.ts: the sugar-palm village with its market and fields, the floating village, the hamlet behind Angkor Wat, the Kulen picnic place), and how far each reaches. */
const VILLAGES: readonly (readonly [ShareVillage, number, number, number])[] = [
  ['east', 395, -55, 150],
  ['kulen', 422, -298, 90],
  ['back', 146, -340, 90],
  ['floating', -290, 70, 190],
];

/** The place (x, z) belongs to (the nearest within its reach; `other` elsewhere). */
export function villageAt(x: number, z: number): ShareVillage {
  let best: ShareVillage = 'other';
  let bd = Infinity;
  for (const [v, cx, cz, r] of VILLAGES) {
    const d = Math.hypot(x - cx, z - cz);
    if (d < r && d < bd) {
      bd = d;
      best = v;
    }
  }
  return best;
}

/** Someone he may give to. */
export interface ShareWho {
  /** The crowd index (stays the same person all the visit). */
  id: number;
  /** Feet (m), the way they face (radians), how far from him (m). */
  x: number;
  y: number;
  z: number;
  yaw: number;
  d: number;
  /** `Look.kind` (villager, vendor, tapper, fisherman, pilgrim, kid). */
  kind: string;
  /** Grey-haired (an elder: he gives with a deeper bow, they bless him). */
  elder: boolean;
  kid: boolean;
  /** The grandmother who kept his house's key (people/_sceneHome.ts). */
  gran: boolean;
  /** Sitting, squatting or kneeling (they stay down: he bends to them). */
  seated: boolean;
  /** Their drawn size (m a model metre: a child is small). */
  scale: number;
}

/**
 * The finder (the people part's): the free person nearest (x, y, z) — a
 * grown-up within `range` m and `cone` radians of `yaw` (`kids` false), or a
 * child within `range` m and `cone` of it (`kids` true) — not one `skip` names;
 * fills `out`.
 */
export type ShareFinder = (x: number, y: number, z: number, yaw: number, range: number, cone: number, kids: boolean, skip: (id: number) => boolean, out: ShareWho) => boolean;

let finder: ShareFinder | null = null;

/** The people part lends its finder (null: none, `people=0`). */
export function setShareFinder(f: ShareFinder | null): void {
  finder = f;
}

const noSkip = (): boolean => false;

/** The person to give to (see `ShareFinder`), in `out`; null when nobody is there or there are no people. */
export function findShare(x: number, y: number, z: number, yaw: number, range: number, cone: number, kids: boolean, out: ShareWho, skip: (id: number) => boolean = noSkip): ShareWho | null {
  return finder?.(x, y, z, yaw, range, cone, kids, skip, out) ? out : null;
}

/**
 * What happens now (roaming sets it, the people part plays it):
 * - `come`: they turn to him (a child runs up to `meetX`, `meetZ`);
 * - `hold`: he holds it out to them: they reach out with both hands;
 * - `take`: it is theirs: in their hands;
 * - `thanks`: their thanks (`word`): a sampeah, a child's jump, an elder's nod and blessing;
 * - `back`: they give him something back (`back`, saying `word2`): held out in both hands;
 * - `end`: done: a grown-up holds it a moment, a child runs back to the others with it;
 * - `again`: given one today already: they say so kindly (`word`) and take no more;
 * - `none`: nothing (he walked off: they go back to what they did).
 */
export type SharePhase = 'none' | 'come' | 'hold' | 'take' | 'thanks' | 'back' | 'end' | 'again';

/** What they give back: a snack for his bag, a few seeds, an elder's blessing (words only), or a smile. */
export type ShareBack = 'none' | 'snack' | 'seeds' | 'bless';

export const SHARE = {
  /** Counts up with each change (a reader keeps the last it answered). */
  n: 0,
  phase: 'none' as SharePhase,
  /** To whom (crowd index; −1 none). */
  id: -1,
  /** A child running up to him (else he stepped up to them). */
  kid: false,
  /** The fruit's colours (sRGB): its body, its stalk or shoulder. */
  fruit: 0xf2c23a,
  stalk: 0x6a5a3a,
  /** What they give back, and its colours (the snack, the seed packet). */
  back: 'none' as ShareBack,
  backColor: 0x5a9a3a,
  backTie: 0xf4f0e0,
  /** Their words now (ui/lang.ts keys: `word` the thanks or "I have one already", `word2` with what they give back). */
  word: '',
  word2: '',
  /** For the words: the fruit's name (`{item}`) and the seeds' plant (`{plant}`): ui/lang.ts keys. */
  item: '',
  plant: '',
  /** Where he stands (feet, m) and faces (radians). */
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  /** Where a child comes to stand before him (m). */
  meetX: 0,
  meetZ: 0,
  /** Seconds already into this phase as it is cued (a check that starts in the middle; 0 in play). */
  lag: 0,
  /** (the people part) where the person is now, a child has come to him, the person is gone (hidden, or another hold took them). */
  px: 0,
  py: 0,
  pz: 0,
  arrived: false,
  lost: false,
};

/** Roaming moves the giving on to `phase` (a new `n`). */
export function shareCue(phase: SharePhase, lag = 0): void {
  SHARE.phase = phase;
  SHARE.lag = lag;
  SHARE.n++;
}

/**
 * The people of a place he gives to often greet him back by his name more often (people/_greetBack.ts reads
 * `nameChance`: the share of greetings, after the first, that say his name; roaming fills it from progress.ts).
 */
export const SHARE_FRIENDS = {
  nameChance: (_x: number, _z: number): number => 0.35,
};
