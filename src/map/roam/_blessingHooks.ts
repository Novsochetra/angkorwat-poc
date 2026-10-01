import { PAGODA } from '../village/_spots';

/**
 * A monk's blessing with the red string (ការចងអំបោះក្រហម): the link between
 * roaming (the explorer kneeling for it, roam/_blessing.ts) and the people
 * part (the monk who gives it, people/_sceneBlessing.ts). Plain module
 * objects, as roam/_dakBatHooks.ts: no part imports another's three.js
 * objects. No three.js, nothing allocated per frame.
 *
 * - **The seats** (`BLESS_SEATS`): where a monk sits for blessings — the
 *   floating village pagoda's hall, on a raised dais against its east wall, to
 *   the Buddha's right, facing across the hall (west) — and where the
 *   explorer kneels before him (the monk sits higher than the one before him:
 *   his head always above the explorer's, the tie included).
 * - **The monk** (`BLESS.monks`): the people part writes whether he sits there
 *   now, free to bless (by day; not at his meal before noon; not while the
 *   pagoda keeps a festival: Pchum Ben, Visak Bochea), and where his hands
 *   meet to tie the string.
 * - **The blessing** (`BLESS.ask`): roaming leads it (its own clock: `t`
 *   seconds into `state`), the monk follows: `kneel` (he looks at him, nods),
 *   `chant` (the Pali blessing; his right hand by `BLESS_SCRIPT` from `SCRIPT_AT`
 *   s into it: the sprig dipped in the lustral water and flicked over him),
 *   `tie` (leaning forward, both hands at the explorer's wrist), `words` (the
 *   blessing in Khmer, a bubble), `bow` (he watches him bow three times), `again`
 *   (a second time in a visit: a smile and a nod), `none`.
 *
 * Distances in metres (the map's: people and the explorer are 1.4 × true size).
 */

/**
 * The monk's right hand, seconds into `POSE.bless` (people/_personModel.ts plays the same in its shader): the sprig
 * taken from the bowl, its leaves dunked in the water, flicked over the one kneeling (the water leaves the leaves),
 * put back; his hand back on his knee.
 */
export const BLESS_SCRIPT = { take: 0.5, dips: [0.8], flicks: [2.2, 3.0, 3.8], put: 5.0, end: 5.8 } as const;
/** The chant (s): the monk's right hand starts its script this far into it; it lasts this long. */
export const SCRIPT_AT = 0.7;
export const CHANT_FOR = 8.2;
/**
 * The tie (s into `tie`): he comes in on his knees and holds out his hand; the monk's hands go out to it (`reach`),
 * the cord goes under his wrist (`wind`, the murmured blessing), round it (`round`), knotted (`knot`: on him for
 * good); the monk's hands come back (`back`) and he goes back to his place on his knees; there he raises his wrist
 * to look at the string (`look`: not so close to the monk, whose face is near his while he holds out his hand), and is
 * back in his sampeah by `for`.
 */
export const TIE = { reach: 1.0, wind: 1.75, round: 2.65, knot: 3.6, back: 3.95, look: 5.0, for: 6.6 } as const;

/** A box on the floor (m): its middle, its half length along the monk's facing and across it, its top. */
export interface BlessBox {
  readonly x: number;
  readonly z: number;
  readonly along: number;
  readonly across: number;
  readonly top: number;
}

export interface BlessSeat {
  /** Short name (bug reports, `bless=` checks). */
  readonly id: string;
  /** Where he sits: the dais top under him (m), and the way he faces (radians: 0 = +z, toward (sin, cos)). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  /** The floor before the dais (m). */
  readonly floor: number;
  /** The dais: its middle (m), its half length along his facing and across it, its top. */
  readonly dais: BlessBox;
  /** The wooden step before the dais at his left end (the same measures): his way up and down. */
  readonly step: BlessBox;
  /**
   * The explorer kneels this far before him (m from the seat along his facing; feet), and comes in this close on his
   * knees for the string, this far to his own left (m: his right hand before the monk's hands).
   */
  readonly kneel: number;
  readonly close: number;
  readonly closeLeft: number;
  /** E asks within this far of the kneeling place (m), on the floor (up or down this much). */
  readonly reach: number;
}

/**
 * The village pagoda's hall (village/_pagoda.ts): the floor `PAGODA.floor`; the east wall's inside at x + 3.8 (the
 * dais against it, over the end of the east mats), the offering table at z 105‥105.8 south-west of it, the altar
 * from z 106.8: room before him and on either side of the one kneeling, for the camera too (roam/_blessing.ts).
 */
const X = PAGODA.x;
const F = PAGODA.floor;
/**
 * The dais's top (m): a monk's raised seat (អាសនៈ), knee high to a man standing, so that seated cross-legged his head
 * is clearly above the head of the one kneeling before him (the explorer is big-headed: on his heels his head's top is
 * ≈ 2.0 m up, ≈ 2.05 up on his knees; the monk's ≈ 1.62‥1.64 m over the dais, 2.27 m up). The step before its left
 * end is half as high.
 */
const DAIS_TOP = F + 0.65;
const STEP_TOP = F + 0.33;
export const BLESS_SEATS: readonly BlessSeat[] = [
  {
    id: 'village',
    x: X + 3.05,
    y: DAIS_TOP,
    z: 103.3,
    yaw: -Math.PI / 2,
    floor: F,
    // (from the wall behind him to 0.62 m before him: his knees on it, the bowl and the plate at his sides)
    dais: { x: X + 3.115, z: 103.3, along: 0.685, across: 0.9, top: DAIS_TOP },
    // (before the dais's front at his left end, the south: clear of the one kneeling close for the string)
    step: { x: X + 3.05 - 0.78, z: 103.3 + 0.66, along: 0.16, across: 0.22, top: STEP_TOP },
    kneel: 2.2,
    // (close for the string: his hand reaches the monk's, their faces a hand and more apart, his head well below)
    close: 1.24,
    closeLeft: 0.26,
    reach: 2.6,
  },
];

/** Where the explorer kneels before `seat` (`d` m out along the monk's facing, `left` m to the explorer's left), into `out`. */
export function seatFront(seat: BlessSeat, d: number, out: { x: number; z: number }, left = 0): { x: number; z: number } {
  // (the explorer faces the monk: his left is the monk's right, −(cos, −sin) of the monk's facing)
  out.x = seat.x + Math.sin(seat.yaw) * d - Math.cos(seat.yaw) * left;
  out.z = seat.z + Math.cos(seat.yaw) * d + Math.sin(seat.yaw) * left;
  return out;
}

/**
 * When a monk sits for blessings (the clock: 0 golden afternoon, 0.25 dusk, 0.5 night, 0.75 dawn): after the dawn
 * chant (events.ts `dawnChant`, ≤ 0.82) until his meal before noon (as the noon bell rings, ≈ 0.976), and from after
 * it until the dusk drum (0.217). At night the monks rest. (A held golden afternoon, clock 0: he is there.)
 */
export const BLESS_HOURS = { from: 0.83, meal: 0.945, back: 0.985, until: 0.19 } as const;

/** What the monk does at `clock`: sits for blessings, eats his meal, or rests (night). */
export function blessHour(clock: number): 'sit' | 'meal' | 'night' {
  const c = clock - Math.floor(clock);
  const H = BLESS_HOURS;
  if (c >= H.meal && c < H.back) return 'meal';
  if ((c >= H.from && c < H.meal) || c >= H.back || c < H.until) return 'sit';
  return 'night';
}

export type BlessState = 'none' | 'kneel' | 'chant' | 'tie' | 'words' | 'bow' | 'again';
/** Why the monk is not there to bless: the night, his meal, a festival at the pagoda, or not built (no people part). */
export type BlessAway = 'night' | 'meal' | 'fest' | 'gone' | null;

export interface BlessMonk {
  /** Seated on his dais, free to bless now. */
  there: boolean;
  /** Not there: why (null: there). */
  away: BlessAway;
  /** Where his hands meet to tie the string (m), with `POSE.bless` at its full lean. */
  hx: number;
  hy: number;
  hz: number;
  /** When the people part last wrote him (`MapFrame.t`, s): stale for a moment, he is gone. */
  t: number;
}

export interface BlessAsk {
  state: BlessState;
  /** Counts up with each new blessing (the scene starts each once). */
  n: number;
  /** The seat (`BlessSeat.id`). */
  id: string;
  /** Seconds into `state` (roaming's own clock: a shot's steps too). */
  t: number;
  /** Where he kneels now (feet, m): the monk looks there. */
  x: number;
  y: number;
  z: number;
}

const MONKS: Record<string, BlessMonk> = {};
for (const s of BLESS_SEATS) MONKS[s.id] = { there: false, away: 'gone', hx: NaN, hy: NaN, hz: NaN, t: -1e9 };

export const BLESS = {
  /** Each seat's monk, by the seat's id. */
  monks: MONKS as Readonly<Record<string, BlessMonk>>,
  ask: { state: 'none', n: 0, id: '', t: 0, x: 0, y: 0, z: 0 } as BlessAsk,
  /** The frame's time (s, `MapFrame.t`): roaming keeps it, to tell fresh writes. */
  now: 0,
};

/** The monk at `id`, writable (the people part). */
export const blessMonk = (id: string): BlessMonk => MONKS[id];
