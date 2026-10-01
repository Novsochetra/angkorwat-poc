import type { Object3D } from 'three';

/**
 * The hammocks he may lie in (roam/_hammock.ts), and the hook the people read
 * so that nobody lies down in the one he is in. No three.js objects are made
 * here: the places that hang hammocks (or the add-on, for the map's own:
 * village, east village, palm sugar yard, the Kulen hut, the back hamlet)
 * register them with `addHammock`, and the people scenes ask
 * `hammockTaken(x, z)` before they put someone in theirs.
 *
 * A hammock is drawn by the place that hangs it (voxel blocks of a map part,
 * or a people's rig). While he lies in it the add-on hides that and draws one
 * of its own in the same colours and stripes that sags under him and swings.
 */

/** A point (m, world). */
export type HammockPoint = readonly [number, number, number];

/**
 * How a hammock looks, when it is not voxel blocks the add-on can find (a
 * people's rig): its blocks as the finder would read them, in world metres.
 */
export interface HammockBlock {
  /** Middle (m, world). */
  c: HammockPoint;
  /** Size along the hammock (from `a` to `b`), across it and up (m). */
  along: number;
  across: number;
  up: number;
  /** Its colour (sRGB). */
  color: number;
}

export interface HammockSpot {
  /** Unique (a bug report and the console name it). */
  readonly id: string;
  /** Where its two ropes are tied (m, world): on the posts, the trees. It hangs level-ish between them. */
  readonly a: HammockPoint;
  readonly b: HammockPoint;
  /**
   * What draws it, to be hidden while he lies in it. `part`: the map part (`MapPart.name`, e.g. `village`,
   * `hamlet`) or `root`: any Object3D, whose voxel blocks of family `petal` make it — the cloth and the
   * ropes, found between the ties by where they are (not the posts, not the knots on the posts). A hammock
   * built of `petal` blocks in a part needs nothing else.
   */
  readonly part?: string;
  readonly root?: Object3D;
  /** Or its look (`blocks`), drawn by someone who hides it while `hammockTaken` says so (a people's rig). */
  readonly blocks?: readonly HammockBlock[];
  /** It is there now (e.g. its part is built); default: always. */
  readonly ready?: () => boolean;
}

const SPOTS: HammockSpot[] = [];
let version = 0;

/**
 * A hammock he may lie in (E "Lie in the hammock" when he stands beside it, inside the roaming area, nobody in
 * it). One with the same id replaces the old one. His stilt house's: `addHammock({ id: 'home', a, b, part: … })`.
 */
export function addHammock(spot: HammockSpot): void {
  const i = SPOTS.findIndex((s) => s.id === spot.id);
  if (i >= 0) SPOTS[i] = spot;
  else SPOTS.push(spot);
  version++;
}

/** Take a hammock off the list (its place is gone). */
export function removeHammock(id: string): void {
  const i = SPOTS.findIndex((s) => s.id === id);
  if (i < 0) return;
  SPOTS.splice(i, 1);
  version++;
}

/** Every hammock (in the order added), and a number that changes whenever the list does. */
export const hammocks = (): readonly HammockSpot[] => SPOTS;
export const hammocksVersion = (): number => version;

/**
 * The hammock he is in (from E until he has got out and gone `AWAY` m from it), for the people: its middle (m),
 * and whether the add-on draws it now (`hide`: whoever else draws it hides theirs). Written by the add-on only.
 */
export const HAMMOCK_IN_USE = { id: null as string | null, x: 0, z: 0, hide: false };

/**
 * Is the hammock whose middle is at (x, z) his just now (he lies in it, is getting in or out, or has only
 * just walked off)? A people scene asks before it puts someone in it, and keeps them out meanwhile.
 */
export function hammockTaken(x: number, z: number, r = 2): boolean {
  const u = HAMMOCK_IN_USE;
  return u.id !== null && Math.abs(u.x - x) < r && Math.abs(u.z - z) < r;
}

/** The add-on draws the hammock at (x, z) now (he is in it): a rig of it (the people's) hides meanwhile. */
export const hammockHidden = (x: number, z: number, r = 2): boolean => HAMMOCK_IN_USE.hide && hammockTaken(x, z, r);
