import type { WordKey } from '../ui/lang';
import { PAGODA } from '../village/_spots';

/**
 * Kneeling to listen to the monks' chanting (ស្ដាប់ព្រះសង្ឃសូត្រមន្ត): the link
 * between roaming (the explorer kneeling to listen, roam/_listen.ts), the people
 * part (the monks who chant: the dawn chant's rows, in the floating village
 * pagoda's hall and before Phnom Kulen's reclining Buddha, people/_sceneChant.ts;
 * the blessing monk on his dais, who chants for one who kneels before him,
 * people/_sceneBlessing.ts) and the sound (audio/_listen.ts: the blessing monk's
 * chanting; audio/temple.ts: each pagoda's dawn chant follows its row). Plain
 * module objects, as roam/_blessingHooks.ts:
 * no part imports another's three.js objects. No three.js, nothing allocated per
 * frame.
 *
 * - **The rows** (`CHANT_SITES`: the village pagoda's, Kulen's): at the dawn chant
 *   (events.ts `dawnChant`, ≈ clock 0.71‥0.83) four monks sit cross-legged in a
 *   row on a low platform before the Buddha, facing him, palms together,
 *   chanting; three villagers kneel behind them (`folk`). The people part writes
 *   `LISTEN.rows[id]`.
 * - **The listener** (`LISTEN.ask`, roaming leads it, its own clock): `kneel`
 *   (walking to his place, kneeling down), `listen` (on his heels, palms together
 *   at his face), `bow` (three bows to the floor as the chanting ends, or as he
 *   leaves), `none`. `who`: a row (`site`: he kneels behind it, at its `spots`) or
 *   the blessing monk (he kneels before his dais: `BLESS_SEATS`' kneeling place),
 *   who chants `CHANT_VERSES` for him over `MONK_CHANT_FOR` s.
 *
 * Distances in metres (the map's: people and the explorer are 1.4 × true size).
 */

const X = PAGODA.x;
const F = PAGODA.floor;

export type ChantSiteId = 'village' | 'kulen';

/**
 * A place where a row of monks chants at dawn, the explorer kneeling behind them to listen. Its own frame: the origin
 * (`x`, `z`, map m), the way the monks face (`yaw`: 0 = +z, toward (sin, cos)), the floor (m). Local `a` is across the
 * row (+x when the yaw is 0), `d` ahead, toward the Buddha (`siteWorld`, `siteLocal`). The row's middle is at a 0.
 */
export interface ChantSite {
  readonly id: ChantSiteId;
  /** The people scene that seats this row (`people=<scene>`). */
  readonly scene: string;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly floor: number;
  /** The monks' seats: their line (d), the line behind them they step up from (d), each seat (a). */
  readonly row: { readonly d: number; readonly front: number; readonly a: readonly number[] };
  /**
   * The monks' platform (អាសនៈ): dark lacquered wood with a gold line along its edges, a kantel mat on it. Seated
   * cross-legged on its top a monk's head is ≈ 1.64 m over it (2.19 m over the floor), the explorer's on his heels
   * ≈ 2.03 m up (character/blessing.ts; bowed as he listens, lower). Half its width (a), its back and front (d), its
   * top (m).
   */
  readonly seat: { readonly half: number; readonly d0: number; readonly d1: number; readonly top: number };
  /** The villagers who come to chant with them, kneeling behind (a, d), facing the Buddha. */
  readonly folk: readonly { readonly a: number; readonly d: number; readonly role: 'nun' | 'grandma' | 'grandpa' }[];
  /** Where the explorer kneels behind the row: behind the gap between two monks (the Buddha between their heads). The nearest of them. */
  readonly spots: readonly { readonly a: number; readonly d: number }[];
  /** E asks on its floor within `a` of the middle, from `d0` to `d1`. */
  readonly ask: { readonly a: number; readonly d0: number; readonly d1: number };
  /** The room the row is in (the same measures): the explorer in it keeps them chanting after the hour, and sees the lead monk's verses. */
  readonly room: { readonly a: number; readonly d0: number; readonly d1: number };
  /** Where the one kneeling behind them looks: the Buddha (a, y m, d). */
  readonly buddha: { readonly a: number; readonly y: number; readonly d: number };
  /** How far round from behind him the camera looks while he listens, toward the row's middle (rad: on a wide screen, held upright). */
  readonly cam: { readonly side: number; readonly tall: number };
  /** The pagoda's festivals move its row (`FEST_ROW`: the floating village pagoda's own). */
  readonly fest: boolean;
}

/** World (x, z) of a point of `s` at (a, d), into `out`. */
export function siteWorld(s: ChantSite, a: number, d: number, out: { x: number; z: number }): { x: number; z: number } {
  const c = Math.cos(s.yaw);
  const n = Math.sin(s.yaw);
  out.x = s.x + a * c + d * n;
  out.z = s.z - a * n + d * c;
  return out;
}

/** The point (x, z) in the frame of `s` (a, d), into `out`. */
export function siteLocal(s: ChantSite, x: number, z: number, out: { a: number; d: number }): { a: number; d: number } {
  const c = Math.cos(s.yaw);
  const n = Math.sin(s.yaw);
  const dx = x - s.x;
  const dz = z - s.z;
  out.a = dx * c - dz * n;
  out.d = dx * n + dz * c;
  return out;
}

/**
 * Phnom Kulen's reclining Buddha (landmarks/_kulenBuddha.ts, `RECLINING`: the rock's floor 150 m up, his frame's
 * origin at 409, −445). He lies along the rock (his head to the west, facing south, on his bed up to 2.5 m north of
 * the origin); the altar and the pilgrims' kneeling rows are before his head and chest, west of 0 (people/
 * _sceneKulenPilgrims.ts). The row sits before his body and feet, east of the altar's donation box, facing him
 * (north): its middle 3.3 m east of the origin.
 */
const K = { x: 409 + 3.3, z: -445, floor: 150 } as const;

/**
 * The rows. The floating village pagoda's hall (village/_pagoda.ts; its frame is the map's, shifted to the hall's
 * axis): the offering table's front at z 105.0 (± 1.15 m), the blessing monk's dais against the east wall up to z 104.2
 * and its step at x + 2.11‥2.43, z 103.74‥104.18; the monks' knees stop short of the table, their backs clear the
 * dais's step; they step up from the red carpet's end (their aisle up the middle). Kulen's: on the rock's floor before
 * the reclining Buddha's body, the bed's front 0.95 m before their platform; the explorer comes up the rock's stair.
 */
export const CHANT_SITES: readonly ChantSite[] = [
  {
    id: 'village',
    scene: 'chant',
    x: X,
    z: 0,
    yaw: 0,
    floor: F,
    row: { d: 104.5, front: 103.85, a: [-2.1, -0.7, 0.7, 2.1] },
    seat: { half: 2.65, d0: 104.22, d1: 104.98, top: F + 0.55 },
    // (out at the sides, clear of the carpet, the monks' aisle, and of the line from the listening camera to him: roam/_listen.ts)
    folk: [
      { a: -2.7, d: 102.2, role: 'nun' },
      { a: 2.0, d: 100.3, role: 'grandpa' },
      { a: 2.9, d: 100.9, role: 'grandma' },
    ],
    // (on the mats, off the carpet)
    spots: [
      { a: -1.4, d: 102.8 },
      { a: 1.4, d: 102.8 },
    ],
    // (from past the door to before the offering table)
    ask: { a: 3.6, d0: PAGODA.doorZ + 0.5, d1: 104.0 },
    room: { a: 3.8, d0: PAGODA.doorZ, d1: 112.5 },
    // (the Buddha's face on the altar: the seat's top + 0.77 of 3.3 m)
    buddha: { a: 0, y: F + 1.9 + 3.3 * 0.77, d: 110.95 },
    cam: { side: 0.55, tall: 0.2 },
    fest: true,
  },
  {
    id: 'kulen',
    scene: 'kulenchant',
    x: K.x,
    z: K.z,
    yaw: Math.PI,
    floor: K.floor,
    row: { d: 1.55, front: 0.9, a: [-2.1, -0.7, 0.7, 2.1] },
    seat: { half: 2.65, d0: 1.27, d1: 2.03, top: K.floor + 0.55 },
    // (a lay nun and an old couple behind the row's east half: out of the camera's way behind him, clear of the pilgrims' rows to the west)
    folk: [
      { a: -3.0, d: 0.0, role: 'nun' },
      { a: -1.7, d: -0.7, role: 'grandpa' },
      { a: -3.1, d: -1.3, role: 'grandma' },
    ],
    // (one: behind the row's west half, the camera from the east of him, the Buddha's head and the row before him; from
    // the east half it would look past his feet into the sky)
    spots: [{ a: 1.4, d: -0.15 }],
    // (behind the row, under the roof: from inside its front posts to the platform's back; not the pilgrims' place before his head)
    ask: { a: 3.6, d0: -3.0, d1: 1.1 },
    room: { a: 4.4, d0: -5.8, d1: 2.2 },
    // (his chest, a little toward his face to the west)
    buddha: { a: 2.4, y: K.floor + 1.7, d: 3.6 },
    // (less round than in the hall: the roof's front posts stand behind him)
    cam: { side: 0.3, tall: 0.3 },
    fest: false,
  },
];

/** The row of `id`. */
export const chantSite = (id: ChantSiteId): ChantSite => CHANT_SITES.find((s) => s.id === id)!;

/**
 * The row on the pagoda's festival days (festival/_schedule.ts): at Pchum Ben the monks chant in the lit hall while the
 * people walk round it before dawn (festival/_pchumBen.ts `PCHUM_TIMES.walk`; from its end they sit on the porch with
 * the families, so the row goes then); at Visak Bochea they chant at dawn once the night's procession round the hall
 * is over (festival/_visak.ts `VISAK_TIMES.walk` ends). The clock (0‥1). Only the village pagoda's row (`ChantSite.fest`).
 */
export const FEST_ROW = { pchumben: [0.58, 0.77], visakFrom: 0.74 } as const;

/**
 * What the chanting monk's bubbles say (the Pali as Cambodians read it, in Khmer letters; romanised in English), each
 * from `at` s for `for` s: the homage to the Buddha (Namo tassa…), the three refuges, the praise of the Buddha (Itipi
 * so…), loving-kindness for all beings (Sabbe sattā…). The blessing monk chants them once for one who listens (s into
 * `listen`); the row goes round them while it chants (s into its chanting, `% CHANT_CYCLE`).
 */
export const CHANT_VERSES: readonly { readonly key: WordKey; readonly at: number; readonly for: number }[] = [
  { key: 'chantNamo', at: 1.5, for: 7 },
  { key: 'chantBuddham', at: 12, for: 5 },
  { key: 'chantDhammam', at: 19, for: 5 },
  { key: 'chantSangham', at: 26, for: 5 },
  { key: 'chantItipiso', at: 34, for: 8 },
  { key: 'chantMetta', at: 47, for: 7 },
];
/** The row goes round the verses every this many seconds. */
export const CHANT_CYCLE = 60;
/** The blessing monk's chant for one who listens (s into `listen`): it ends here (he bows; the recording fades out over its last seconds). */
export const MONK_CHANT_FOR = 58;

export type ListenWho = 'none' | 'row' | 'monk';
export type ListenState = 'none' | 'kneel' | 'listen' | 'bow';

export interface ListenAsk {
  who: ListenWho;
  state: ListenState;
  /** Counts up with each new listening (the scenes start each once). */
  n: number;
  /** The row's site when `who` is `row`. */
  site: ChantSiteId;
  /** The blessing monk's seat (`BlessSeat.id`) when `who` is `monk`. */
  seat: string;
  /** Seconds into `state` (roaming's own clock). */
  t: number;
  /** Where he kneels (feet, m): the monks look there. */
  x: number;
  y: number;
  z: number;
}

/** The row as the people part last wrote it. */
export interface ChantRowNow {
  /** Seated in their places (all of them), free to be listened to. */
  there: boolean;
  /** Chanting now (palms together, the chant heard from the hall). */
  chanting: boolean;
  /** The chanting is ending: its last verse, then the bows (roaming bows with them). */
  ending: boolean;
  /** Walking in to their places (the chant's hour has begun: no E yet). */
  coming: boolean;
  /** Getting up and going out after it (no E). */
  leaving: boolean;
  /** A festival's (Pchum Ben's, the village pagoda's): its own chant is heard from the hall (roam/_pchumBen.ts), not the pagoda's dawn chant. */
  festival: boolean;
  /** Seconds into its chanting (the verses' clock). */
  chantT: number;
  /** When it last wrote (`MapFrame.t`, s): stale for a moment, the row is not built or far (no offer). */
  t: number;
}

const rowNow = (): ChantRowNow => ({ there: false, chanting: false, ending: false, coming: false, leaving: false, festival: false, chantT: 0, t: -1e9 });

export const LISTEN = {
  /** Each row, by its site. */
  rows: { village: rowNow(), kulen: rowNow() } as Record<ChantSiteId, ChantRowNow>,
  ask: { who: 'none', state: 'none', n: 0, site: 'village', seat: '', t: 0, x: 0, y: 0, z: 0 } as ListenAsk,
  /** The frame's time (s, `MapFrame.t`): roaming keeps it, to tell fresh writes. */
  now: 0,
};

/** The row at `id` wrote a moment ago (it is built and near). */
export const rowFresh = (id: ChantSiteId): boolean => LISTEN.now - LISTEN.rows[id].t < 1.5;
