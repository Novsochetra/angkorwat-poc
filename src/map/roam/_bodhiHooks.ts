/**
 * The bodhi tree at the village pagoda (roam/_bodhi*.ts; the tree's model
 * garden/models/bodhi.ts): what roaming and the people part share, as plain
 * numbers — where the tree stands and where the head monk (people/
 * _sceneBodhiMonk.ts) is and what he does. No three.js, no import of the add-on
 * (as hamlet/_homePlan.ts `HOME.gran`, roam/_blessingHooks.ts).
 *
 * **The place**: on the pagoda's rise west of its terrace (village/_pagoda.ts:
 * the terrace x −318‥−294, z 92‥116, one metre over the grass), on the open
 * grass by its north-west corner, where the way up from the village comes onto the
 * rise: level ground (8 m), clear of the terrace's stupa (13 m), of the palm by the
 * way up (9.5 m) and of the two old trees to the west and south (17 and 19.5 m:
 * far enough that their crowns do not run into its own, seen from the village),
 * with room all round for a crown of 6 m and more; seen from the village and from
 * the head of the naga stair, the hall's roof beside it. Its front (local +z: the
 * cloths' tails, the offerings, where he kneels) looks east-north-east, to the
 * terrace and the head of the stair.
 */

/** The tree (m) and the way its front looks (radians: toward (sin, cos) in x, z). */
export const BODHI_TREE = { x: -327, z: 89.5, yaw: 1.9 } as const;

/** The planted tree's variety (garden/state.ts `Plant.seed`): its look is the same for every player (the sit place keeps off its crutches). */
export const BODHI_SEED = 0.37;

/** A point `lx` m to the tree's own right… left (local +x) and `lz` m out in front (local +z) → the map's (x, z). */
export function bodhiToWorld(lx: number, lz: number, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
  const s = Math.sin(BODHI_TREE.yaw);
  const c = Math.cos(BODHI_TREE.yaw);
  out.x = BODHI_TREE.x + lx * c + lz * s;
  out.z = BODHI_TREE.z - lx * s + lz * c;
  return out;
}

/** A yaw in the tree's frame (0: the way its front looks) → the map's. */
export const bodhiYaw = (local: number): number => BODHI_TREE.yaw + local;

/**
 * Where things are round the tree (local m: x across, z out in front):
 * - `stand`: where he stands to plant it (facing it; garden/actions.ts `plantTree` digs at his feet' front);
 * - `kneel`: where he kneels for the blessing, facing it;
 * - `monk`: where the head monk stands for the blessing (across the sapling from him, a little to his left: they face
 *   each other over it), and the point he faces;
 * - `sit`: where the monk sits at dawn under the grown tree (and by the ring at night), facing out;
 * - `sweep`: the grass he sweeps by day (its middle, its radius), between the tree and the terrace.
 * The ring of stones round it: `ring` (m) while it is young, `ringGrown` round the great tree's roots.
 */
export const BODHI_PLAN = {
  stand: { x: 0, z: 0.92 },
  kneel: { x: 0, z: 1.55 },
  monk: { x: -1.45, z: -0.55, faceX: -0.1, faceZ: 1.3 },
  // (clear of the grown tree's crutches and of the offerings at its foot: garden/models/bodhi.ts, its seed `BODHI_SEED`)
  sit: { x: -1.3, z: 2.5 },
  sweep: { x: -1.6, z: 5.2, r: 2.2 },
  ring: 1.3,
  ringGrown: 3.1,
} as const;

/**
 * The sprinkling (`sprinkle`, s into it): the monk flicks his sprig at each of these; the drops fly to the sapling
 * and to the one kneeling, landing a moment later (roam/_bodhiPlant.ts: their patter, his eyes shut).
 */
export const BODHI_FLICKS = [0.55, 1.35, 2.15] as const;

/** The head monk's cue from roaming (people/_sceneBodhiMonk.ts plays it). */
export type BodhiCue =
  /** his own day: sweeping the grass by day, sitting at night (and at dawn under the grown tree) */
  | 'idle'
  /** he has seen him come (the sapling ready to give): he stops, turns to him and nods */
  | 'notice'
  /** he speaks to him (the first words) */
  | 'talk'
  /** he holds the sapling out in both hands */
  | 'give'
  /** his hands empty: he nods to the explorer's sampeah */
  | 'taken'
  /** he points to the ring of stones and says where to plant it */
  | 'show'
  /** he walks to his place by the tree for the blessing (and waits there) */
  | 'come'
  /** he chants the blessing over the tree and the one kneeling */
  | 'chant'
  /** he sprinkles the lustral water with his sprig */
  | 'sprinkle'
  /** he says the blessing in Khmer */
  | 'words'
  /** the end: a nod, and back to his day */
  | 'done';

/**
 * What the tree, the monk and roaming share (one object, plain numbers):
 * - `monk`: the people scene writes where he is (`shown`, `x, y, z`, `yaw`) once built (`ready`); roaming writes his
 *   cue (`cue`, a new `n` each time) and where the explorer is (`exX…`).
 * - `ready`: the monk has the sapling for him now (his garden has borne: roam/_bodhi.ts), so he notices him.
 * - `grown`: the tree is fully grown (the monk sits under it at dawn).
 */
export const BODHI = {
  monk: {
    ready: false,
    shown: false,
    x: Number.NaN,
    y: Number.NaN,
    z: Number.NaN,
    yaw: 0,
    cue: 'idle' as BodhiCue,
    n: 0,
    exX: 0,
    exY: 0,
    exZ: 0,
  },
  ready: false,
  grown: false,
};

/** Give the head monk a cue (a new one each call, even the same again), and where the explorer is. */
export function bodhiCue(cue: BodhiCue, ex?: { x: number; y: number; z: number }): void {
  const m = BODHI.monk;
  m.cue = cue;
  m.n++;
  if (ex) {
    m.exX = ex.x;
    m.exY = ex.y;
    m.exZ = ex.z;
  }
}
