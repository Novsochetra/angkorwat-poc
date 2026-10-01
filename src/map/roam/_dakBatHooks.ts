/**
 * Dak bat (ដាក់បាត្រ), giving food to the monks on their alms round at dawn:
 * the link between roaming (the explorer's offering, roam/_dakBat.ts) and
 * the people part (the monks who take it: the alms line in the sugar-palm
 * village, people/_sceneAlms.ts; Angkor Wat's procession, people/_monks.ts;
 * the floating village's monk, people/_sceneVillage.ts). Plain module
 * objects, as greet.ts and roam/_shop.ts's `stalls`: no part imports
 * another's three.js objects. No three.js, nothing allocated per frame.
 *
 * - **The monks on their round** write where they are into their slot
 *   (`DAK.slot(line, k)`, made once) each step they walk with their bowls;
 *   roaming reads them to know when the monks come near.
 * - **His offering** (`DAK.ask`): roaming asks a line (`state` 'ask'); the
 *   line's scene picks the first of its monks who has not passed him yet,
 *   halts the others and walks that one to stand before him (`coming`),
 *   facing him; the monk lifts his bowl's lid (`there`: `bx, by, bz` is the
 *   bowl's mouth, for the spoon); roaming puts the rice in (`rice` 0‥1),
 *   then `given` (the lid goes back on), `bless` (the monks chant the
 *   blessing, heads bowed), `done` (the line walks on). `none`: let go
 *   (cancelled, or over).
 *
 * Distances (m, the map's: people and the explorer are 1.4 × true size).
 */

export type DakState = 'none' | 'ask' | 'coming' | 'there' | 'given' | 'bless' | 'done';

/** One monk on an alms round, as his scene last wrote him. */
export interface AlmsMonk {
  /** His line (a scene's alms walk) and his place in it (0 the first). */
  readonly line: string;
  readonly k: number;
  /** His feet (m) and the way he walks (radians: 0 = +z, toward (sin, cos) in x, z). */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** On his round with his bowl now (shown, walking or halted on the way). */
  on: boolean;
  /** When his scene last wrote him (`MapFrame.t`, s): a slot not written for a moment is stale. */
  t: number;
}

/** His offering as it goes (see the module's notes). */
export interface DakAsk {
  state: DakState;
  /** Counts up with each new ask (a scene answers the one it has not taken yet). */
  n: number;
  /** The line asked, and the monk its scene sent (−1: not picked yet). */
  line: string;
  k: number;
  /** Where he kneels (feet, m) and the way he faces. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Where the monk stands before him (m) and the way he faces (toward him). */
  mx: number;
  mz: number;
  myaw: number;
  /** The bowl's mouth (m), while it is open (`there` on). */
  bx: number;
  by: number;
  bz: number;
  /** The rice he has put in, 0‥1 (the bowl's heap grows with it). */
  rice: number;
  /** A shot put him mid-offering (`dakbat=give|bless`): the monk stands there at once, his lid already up. */
  snap: boolean;
}

/**
 * Between the explorer kneeling and the monk who takes his rice (m, feet to feet): the monk holds his bowl out in
 * both hands (people/_sceneAlms.ts `Receiving`), the kneeling arm and the spoon reach over it, and their big heads
 * keep apart; just outside the people's own room round him (routes.ts `dodge`: 1.25 m), so a monk who keeps out of
 * others' way on his own (`Actor.avoid`) walks right there.
 */
export const DAK_STAND = 1.45;
/** How near a monk on his round comes before roaming offers (m), how far off his way the explorer may stand (m, either side), how near he must be for the hint without an offering. */
export const DAK_NEAR = 14;
export const DAK_SIDE = 4.2;
export const DAK_HINT = 7;

/** The village alms round (people/_sceneAlms.ts): it sets out over this window of the clock (dawn), and is on the way until about the end of it. */
export const ALMS_START: readonly [number, number] = [0.74, 0.8];
/** Monks walking the round, on the calendar (calendar.ts: the same window the scene plays). */
export const ALMS_ON: readonly [number, number] = [0.74, 0.955];

/**
 * The way the village line walks (map x, z): up the palm lane from the
 * south (the paddies), into the village street at the sala's corner, west
 * along it past the houses, to the market's corner, where it goes on (the
 * market's own monk comes and goes there too: people/_sceneMarket.ts).
 */
export const ALMS_WAY: readonly (readonly [number, number])[] = [
  [397.6, -45.5],
  [397.0, -54],
  [396.3, -61],
  [395.0, -64.3],
  [392, -64.8],
  [384, -66],
  [372, -68.8],
  [362.5, -71.0],
];
/** Where the round is, for the calendar's "go there" (the street between its two stops). */
export const ALMS_WHERE = { x: 382, z: -66.5 };

const SLOTS: AlmsMonk[] = [];

export const DAK = {
  /** Every monk's slot (read by roaming: `on` and fresh ones). */
  monks: SLOTS as readonly AlmsMonk[],
  /** A slot of its own for monk `k` of `line` (made the first time, the same one after). */
  slot(line: string, k: number): AlmsMonk {
    let s = SLOTS.find((m) => m.line === line && m.k === k);
    if (!s) SLOTS.push((s = { line, k, x: 0, y: 0, z: 0, yaw: 0, on: false, t: -1e9 }));
    return s;
  },
  ask: { state: 'none', n: 0, line: '', k: -1, x: 0, y: 0, z: 0, yaw: 0, mx: 0, mz: 0, myaw: 0, bx: 0, by: 0, bz: 0, rice: 0, snap: false } as DakAsk,
  /** `dakbat=1|give|bless` (a shot or a saved view): where he is, for the lines to start near (null: as the clock says). */
  pin: null as { x: number; z: number } | null,
  /** The frame's time (s, `MapFrame.t`): roaming keeps it, to tell fresh slots. */
  now: 0,
};

/** Is (`x`, `z`) within `r` m of the way through `pts`? */
export function nearWay(pts: readonly (readonly [number, number])[], x: number, z: number, r: number): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const ex = ax + dx * u - x;
    const ez = az + dz * u - z;
    if (ex * ex + ez * ez < r * r) return true;
  }
  return false;
}

/** Is `clock` in the window [a, b) (it may wrap past 1)? */
export function inClock(clock: number, [a, b]: readonly [number, number]): boolean {
  const c = clock - Math.floor(clock);
  return a <= b ? c >= a && c < b : c >= a || c < b;
}
