/**
 * Helping the farmers (roam/_farmWork.ts) and the farmers in the lake paddies
 * (people/_sceneFarm.ts) talk through this object, so neither part imports
 * the other's (no three.js here; nothing is made per frame).
 *
 * The farmers' scene writes it each step it runs (`shown` false while they
 * are home for the night or too far off to be out): the season's work, the
 * plot they work and where their row stands in it, the two places at the
 * row's ends where one more pair of hands would work (his), and where each
 * of them is.
 *
 * The add-on writes `helper`: which farmer works with him and what she does
 * for him now (turns to him, holds out the bundle of seedlings or her sickle,
 * comes over to him, takes it back, thanks him with a parcel of num ansom);
 * the row waits for him while he works in it (`working`).
 */
export type FarmWork = 'plant' | 'grow' | 'harvest' | 'dry';
export type FarmerJob = 'row' | 'carry' | 'walk' | 'rest';

/**
 * What the farmer who works with him does now:
 * - `none`: her own work;
 * - `face`: she straightens up and turns to him (he comes to her);
 * - `give`: she holds out the bundle of seedlings or her sickle;
 * - `lent`: back at her own work (with her sickle lent, she gathers by hand);
 * - `come`: she comes over to him (`tx`, `tz`), then faces him;
 * - `take`: both hands out, she takes back the bundle or the sickle;
 * - `thank`: "អរគុណ!" and the parcel held out in both hands.
 */
export type FarmAct = 'none' | 'face' | 'give' | 'lent' | 'come' | 'take' | 'thank';

export interface FarmerAt {
  x: number;
  y: number;
  z: number;
  yaw: number;
  job: FarmerJob;
  shown: boolean;
}

export interface FarmRowEnd {
  /** Where one more would stand in the row (m, map x and z). */
  x: number;
  z: number;
  /** On the plot's floor, clear of its dikes. */
  ok: boolean;
}

export const FARM = {
  /** The farmers are out (by day, near enough to be drawn): what follows is theirs now. */
  shown: false,
  work: 'dry' as FarmWork,
  /** The plot they work (paddies/stages.ts `PLOTS` index; −1 none). */
  plot: -1,
  /** Their row's place along the plot's sweep (0‥1). */
  front: 0,
  /** The way the row moves along the sweep (+1 with it, −1 back): planting, the planted rows are behind them; reaping, the cut ones. */
  ahead: 1,
  /** The sweep's way across the plot in the map (unit x, z): planting and cutting go this way. */
  ux: 0,
  uz: 1,
  /** People in the row, and how far apart (m). */
  rowN: 0,
  gap: 2.4,
  /** The places at the row's two ends (its first one's side, its last one's side). */
  ends: [
    { x: 0, z: 0, ok: false },
    { x: 0, z: 0, ok: false },
  ] as [FarmRowEnd, FarmRowEnd],
  /** Each farmer (people/_sceneFarm.ts order). */
  farmers: Array.from({ length: 5 }, (): FarmerAt => ({ x: 0, y: 0, z: 0, yaw: 0, job: 'rest', shown: false })),
  /** What the add-on asks of them. */
  helper: {
    /** The farmer working with him (`farmers` index), or −1. */
    with: -1,
    act: 'none' as FarmAct,
    /** Counts each new act (the scene starts it once: her words, her pose). */
    n: 0,
    /** Where he stands (m, his feet): she looks at him, turns to him. */
    x: 0,
    y: 0,
    z: 0,
    /** Where she comes to (`come`; m). */
    tx: 0,
    tz: 0,
    /** Put her at (`tx`, `tz`) at once (a check's state from the URL: no walk over); the scene clears it. */
    warp: false,
    /** He works in the row: it stays where it is until he is done. */
    working: false,
    /** He has her sickle (she gathers the cut stalks by hand meanwhile). */
    sickle: false,
  },
};

/** Ask the farmer `k` (or −1: nobody) for `act`. */
export function farmAsk(k: number, act: FarmAct): void {
  const h = FARM.helper;
  if (h.with === k && h.act === act) return;
  h.with = k;
  h.act = act;
  h.n++;
}
