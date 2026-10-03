import type { WordKey } from '../ui/lang';
import { PAGODA } from '../village/_spots';

/**
 * Kneeling to listen to the monks' chanting (ស្ដាប់ព្រះសង្ឃសូត្រមន្ត): the link
 * between roaming (the explorer kneeling to listen, roam/_listen.ts), the people
 * part (the monks who chant: the dawn chant's row in the floating village
 * pagoda's hall, people/_sceneChant.ts; the blessing monk on his dais, who
 * chants for one who kneels before him, people/_sceneBlessing.ts) and the sound
 * (audio/_listen.ts: the blessing monk's chanting; audio/temple.ts: the pagoda's
 * dawn chant follows the row). Plain module objects, as roam/_blessingHooks.ts:
 * no part imports another's three.js objects. No three.js, nothing allocated per
 * frame.
 *
 * - **The row** (`CHANT_ROW`): at the dawn chant (events.ts `dawnChant`, ≈ clock
 *   0.71‥0.83) four monks sit cross-legged in a row before the offering table,
 *   facing the Buddha, palms together, chanting; three villagers kneel behind
 *   them on the mats (`CHANT_FOLK`). The people part writes `LISTEN.row`.
 * - **The listener** (`LISTEN.ask`, roaming leads it, its own clock): `kneel`
 *   (walking to his place, kneeling down), `listen` (on his heels, palms together
 *   at his face), `bow` (three bows to the floor as the chanting ends, or as he
 *   leaves), `none`. `who`: the row (he kneels behind it, at `LISTEN_SPOTS`) or
 *   the blessing monk (he kneels before his dais: `BLESS_SEATS`' kneeling place),
 *   who chants `CHANT_VERSES` for him over `MONK_CHANT_FOR` s.
 *
 * Distances in metres (the map's: people and the explorer are 1.4 × true size).
 */

const X = PAGODA.x;
const F = PAGODA.floor;

/**
 * The dawn chant's row in the hall (village/_pagoda.ts): the offering table's front at z 105.0 (± 1.15 m), the blessing
 * monk's dais against the east wall up to z 104.2 and its step at x + 2.11‥2.43, z 103.74‥104.18. The monks sit on a
 * low platform (`CHANT_SEAT`: one kneeling behind them keeps his head below theirs, as on the blessing monk's dais) at
 * `z`: their knees stop short of the table, their backs clear the dais's step; `x` the seats (m from the hall's axis),
 * each facing the Buddha (+z, yaw 0). They step up onto it from `front`. The aisle up the middle is the red carpet
 * (they walk in and out along it).
 */
export const CHANT_ROW = { z: 104.5, front: 103.85, x: [-2.1, -0.7, 0.7, 2.1], yaw: 0, floor: F, axis: X } as const;
/**
 * The monks' platform (អាសនៈ): dark lacquered wood with a gold line along its edges, a kantel mat on it. Seated
 * cross-legged on its top a monk's head is ≈ 1.64 m over it (2.19 m up), the explorer's on his heels ≈ 2.03 m up
 * (character/blessing.ts; bowed as he listens, lower). Half its width (m from the axis), its front and back (z), its
 * top over the floor.
 */
export const CHANT_SEAT = { half: 2.65, z0: 104.22, z1: 104.98, top: F + 0.55 } as const;
/**
 * The villagers who come to chant with them, kneeling behind on the mats (m from the axis), facing the Buddha: out at
 * the sides, clear of the carpet (the monks' aisle) and of the line from the listening camera to him (roam/_listen.ts).
 */
export const CHANT_FOLK: readonly { readonly x: number; readonly z: number; readonly role: 'nun' | 'grandma' | 'grandpa' }[] = [
  { x: -2.7, z: 102.2, role: 'nun' },
  { x: 2.0, z: 100.3, role: 'grandpa' },
  { x: 2.9, z: 100.9, role: 'grandma' },
];
/**
 * Where the explorer kneels behind the row (m from the axis): on the mats, behind the gap between two monks (the Buddha
 * between their heads), off the carpet (the monks' aisle). The nearest of them.
 */
export const LISTEN_SPOTS: readonly { readonly x: number; readonly z: number }[] = [
  { x: -1.4, z: 102.8 },
  { x: 1.4, z: 102.8 },
];
/**
 * The row on the pagoda's festival days (festival/_schedule.ts): at Pchum Ben the monks chant in the lit hall while the
 * people walk round it before dawn (festival/_pchumBen.ts `PCHUM_TIMES.walk`; from its end they sit on the porch with
 * the families, so the row goes then); at Visak Bochea they chant at dawn once the night's procession round the hall
 * is over (festival/_visak.ts `VISAK_TIMES.walk` ends). The clock (0‥1).
 */
export const FEST_ROW = { pchumben: [0.58, 0.77], visakFrom: 0.74 } as const;
/** E asks in the hall (its floor, from past the door to before the offering table), within this of the axis (m). */
export const HALL_ASK = { x: 3.6, z0: PAGODA.doorZ + 0.5, z1: 104.0, floor: F } as const;

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
  /** A festival's (Pchum Ben's): its own chant is heard from the hall (roam/_pchumBen.ts), not the pagoda's dawn chant. */
  festival: boolean;
  /** Seconds into its chanting (the verses' clock). */
  chantT: number;
  /** When it last wrote (`MapFrame.t`, s): stale for a moment, the row is not built or far (no offer). */
  t: number;
}

export const LISTEN = {
  row: { there: false, chanting: false, ending: false, coming: false, leaving: false, festival: false, chantT: 0, t: -1e9 } as ChantRowNow,
  ask: { who: 'none', state: 'none', n: 0, seat: '', t: 0, x: 0, y: 0, z: 0 } as ListenAsk,
  /** The frame's time (s, `MapFrame.t`): roaming keeps it, to tell fresh writes. */
  now: 0,
};

/** The row wrote a moment ago (it is built and near). */
export const rowFresh = (): boolean => LISTEN.now - LISTEN.row.t < 1.5;
