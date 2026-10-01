import type { HeightField } from '../heightfield';
import { progress } from '../progress';

/**
 * His stilt house (ផ្ទះឈើ): where it stands and where everything in it is,
 * with no three.js, so the house (hamlet/_home.ts), its grandmother
 * (people/_sceneHome.ts), the roaming add-on (roam/_home*.ts), the maps
 * (ui/_minimapSpots.ts) and the dog read the same numbers; and `HOME`, the
 * small shared state between them (who has the key, the doors, the net, the
 * grandmother's cues).
 *
 * The house stands at the sugar-palm village's north-east edge, past the
 * mango and the coconut palm behind the north houses, its veranda looking
 * north up the Kulen foot meadow to Phnom Kulen and its falls, the Kulen
 * stream a few steps east of it, the Kulen foot trail 12 m west. Nothing
 * else stands there (the bicycles, the kite stall, the sey circle and the
 * dak bat way are all south of the street or round the sala).
 *
 * Its frame (as the village's houses, hamlet/_evSpots.ts): `x, z` the
 * floor's middle, `facing` the way its front looks (here −z, to the
 * mountain); local x across the front (the ridge runs along it), +z to the
 * front (the veranda, the stair). Facing π, so local (lx, lz) is the map's
 * (x − lx, z − lz): local +x is the map's west (the trail), −x its east (the
 * stream).
 */

export const HOME_AT = { x: 424, z: -107, facing: Math.PI } as const;

/** Across (along the ridge), the rooms' depth, the veranda's in front, the floor over the ground, the walls over the floor (m). */
export const HOME_SIZE = { w: 7, d: 4.8, v: 2.2, lift: 3, wall: 3.3 } as const;
/** The back of the rooms, the front wall, the veranda's edge (local z, m). */
export const HOME_Z = { back: -3.5, wall: 1.3, front: 3.5 } as const;
/** Plank walls' thickness (m). */
export const HOME_T = 0.18;
/** The doorway in the front wall: half its width, its height over the floor (m). Wide and tall for the roaming explorer (1.4 × his size: 2.26 m tall, 0.42 m round). */
export const HOME_DOOR = { half: 1.05, h: 2.6 } as const;
/** The front stair: where it leaves the veranda (local x), its width, its steps' rise and run (m). */
export const HOME_STAIR = { x: 2, width: 1.8, step: 0.5 } as const;
/** Where the stair's foot is (local z): the last tread's front and a little room. */
export const HOME_STAIR_FOOT = HOME_Z.front + (HOME_SIZE.lift / HOME_STAIR.step - 1) * HOME_STAIR.step + 0.6;

/**
 * Inside (local, m; heights over the floor): the sleeping mat under its
 * mosquito net along the back wall's east half (his head by the east window,
 * looking over the stream); the altar shelf high on the west wall; the shelf
 * of what he found on the back wall's west half, his kite over it; a water
 * jar by the door; a sitting mat with a teapot; the lamp on the east front
 * window's sill.
 */
export const HOME_IN = {
  mat: { x0: -3.12, x1: -0.12, z0: -3.25, z1: -1.85 },
  net: { x0: -3.24, x1: 0.02, z0: -3.3, z1: -1.72, top: 2.55 },
  /** Where his feet stand to lie down (local), facing local +x: his head goes to the mat's east end, on the pillow. */
  lie: { x: -0.32, z: -2.55 },
  /** Where he stands to stretch on waking: off the mat, out from under the net, turned to the room. */
  wake: { x: 0.5, z: -0.8 },
  altar: { x: 3.3, z: -1.0, y: 2.05, w: 1.25, d: 0.46 },
  shelf: { x0: 0.5, x1: 3.12, z: -3.32, d: 0.38, ys: [1.0, 1.52] as readonly number[] },
  kite: { x: 1.8, y: 2.55, z: -3.3 },
  jar: { x: 1.62, z: 0.62 },
  sit: { x: 1.4, z: -1.35 },
  lamp: { x: -2.45, y: 1.15, z: HOME_Z.wall - 0.16 },
  /** The windows: in the front wall (x), the east side wall by the mat (wide: the view), the west side wall (z). */
  front: [-2.45, 2.45] as readonly number[],
  east: { z: -1.1, half: 0.62 },
  west: { z: 0.35, half: 0.45 },
} as const;

/** The sign over the door (his name, or "ផ្ទះខ្ញុំ"): its board's middle (local, y over the floor), its size (m). */
export const HOME_SIGN = { x: 0, y: 3.13, z: HOME_Z.wall + 0.05, w: 1.9, h: 0.66 } as const;

/** The stilts (local x columns, z rows), as the village's: about 3 m apart, the hammock between two of the front row. */
export function homeStilts(): { xs: number[]; zs: number[] } {
  const { w } = HOME_SIZE;
  const nx = 3;
  const nz = 4;
  const xs: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i < nx; i++) xs.push(-w / 2 + 0.2 + ((w - 0.4) * i) / (nx - 1));
  for (let j = 0; j < nz; j++) zs.push(HOME_Z.back + 0.2 + ((HOME_Z.front - HOME_Z.back - 0.4) * j) / (nz - 1));
  return { xs, zs };
}

/** The hammock under the house: its two ties (local x on the front row of stilts, the row's z; height under the floor, m). */
export function homeHammock(): { x0: number; x1: number; z: number; down: number } {
  const { xs, zs } = homeStilts();
  // (the bay away from the stair: under the east half of the veranda)
  return { x0: xs[0] + 0.16, x1: xs[1] - 0.16, z: zs[zs.length - 1], down: 0.75 };
}

/**
 * The dog's bed at the stair's foot, east of it (local, and the way it opens: +z, out to the yard): a round
 * woven basket with an old krama in it. The dog (roam/_dog*.ts) sleeps here while he is away from home
 * (`homeDogBed()`, `HOME.inside`).
 */
export const HOME_DOG = { x: 0.15, z: 5.35 } as const;

/** The grandmother's places (local): sweeping the yard west of the stair by day; sitting by her little lamp at night. */
export const HOME_GRAN = {
  sweep: { x: 5.8, z: 8.4, r: 1.6 },
  sit: { x: 5.5, z: 4.6 },
  lamp: { x: 4.85, z: 5.25 },
  /** Where she goes after giving him the key: back to the trail, then on to the village. */
  away: [
    { x: 9.5, z: 4 },
    { x: 12.5, z: -4 },
    { x: 12, z: -18 },
  ] as readonly { x: number; z: number }[],
} as const;

/** Local (lx, lz) → the map's (x, z). */
export function homeToWorld(lx: number, lz: number): [number, number] {
  const s = Math.sin(HOME_AT.facing);
  const c = Math.cos(HOME_AT.facing);
  return [HOME_AT.x + lx * c + lz * s, HOME_AT.z - lx * s + lz * c];
}

/** The map's (x, z) → local (lx, lz). */
export function homeLocal(x: number, z: number): [number, number] {
  const s = Math.sin(HOME_AT.facing);
  const c = Math.cos(HOME_AT.facing);
  const dx = x - HOME_AT.x;
  const dz = z - HOME_AT.z;
  return [dx * c - dz * s, dx * s + dz * c];
}

/** A heading in the house's frame (local, radians from +z toward +x) → the map's (as `body.yaw`). */
export const homeYaw = (local: number): number => local + HOME_AT.facing;

/** The ground under the house's middle and its floor's top (m): the land is flat there (10 m). */
export function homeFloor(field: HeightField): { ground: number; floor: number } {
  const ground = field.heightAt(HOME_AT.x, HOME_AT.z);
  return { ground, floor: ground + HOME_SIZE.lift };
}

/** Is the map point (x, z) inside the rooms (`margin` m in from the walls' inner faces)? */
export function inRooms(x: number, z: number, margin = 0): boolean {
  const [lx, lz] = homeLocal(x, z);
  const half = HOME_SIZE.w / 2 - HOME_T - margin;
  return lx > -half && lx < half && lz > HOME_Z.back + HOME_T + margin && lz < HOME_Z.wall - HOME_T - margin;
}

/** On the house's floor or veranda (his feet near the floor's top), `margin` m in from the edges. */
export function onHomeFloor(x: number, y: number, z: number, floor: number, margin = 0): boolean {
  const [lx, lz] = homeLocal(x, z);
  return Math.abs(y - floor) < 0.3 && Math.abs(lx) < HOME_SIZE.w / 2 - margin && lz > HOME_Z.back + margin && lz < HOME_Z.front - margin;
}

/** The dog's bed on the map: where it lies (feet, m) and the way it opens (radians, as `body.yaw`). */
export function homeDogBed(field: HeightField): { x: number; y: number; z: number; yaw: number } {
  const [x, z] = homeToWorld(HOME_DOG.x, HOME_DOG.z);
  return { x, y: field.heightAt(x, z), z, yaw: homeYaw(0) };
}

/** The grandmother's cue from the roaming add-on (people/_sceneHome.ts plays it). */
export type GranCue = 'idle' | 'call' | 'talk' | 'give' | 'taken' | 'leave' | 'gone';

/**
 * What the house, its grandmother and the roaming add-on share (one object, plain numbers):
 *
 * - `owned`: he has the key (progress.ts `home.owned`, or the URL's `home=`); `opened`: he has opened the doors
 *   once (they stay open from then on: `home.opened`); `door` 0 shut ‥ 1 open, eased by the house toward
 *   `opened`.
 * - `net` 0 rolled up ‥ 1 down round the mat (he sleeps), eased by the house toward `netDown`.
 * - `inside`: he is in the house or on its veranda (the dog keeps him company; away, it sleeps in its bed).
 * - `gran`: the grandmother. The people scene writes where she is (`shown`, `x, y, z`, `yaw`) once it is
 *   built (`ready`); the add-on gives her cues (`cue`, a new `n` each time) and where he stands (`ex*`).
 */
export const HOME = {
  owned: false,
  opened: false,
  door: 0,
  net: 0,
  netDown: false,
  inside: false,
  gran: {
    ready: false,
    shown: false,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    cue: 'idle' as GranCue,
    n: 0,
    exX: 0,
    exY: 0,
    exZ: 0,
  },
};

/** Give the grandmother a cue (a new one each call, even the same again). */
export function granCue(cue: GranCue, ex?: { x: number; y: number; z: number }): void {
  const g = HOME.gran;
  g.cue = cue;
  g.n++;
  if (ex) {
    g.exX = ex.x;
    g.exY = ex.y;
    g.exZ = ex.z;
  }
}

// (kept between visits: the house is drawn as he left it from the first frame; shots keep nothing)
HOME.owned = progress.get('home.owned', false);
HOME.opened = HOME.owned && progress.get('home.opened', false);
HOME.door = HOME.opened ? 1 : 0;
// (a shot's or a page's `home=`: owned before anything is built, so the house is drawn with its door open)
if (typeof location !== 'undefined') {
  const v = new URLSearchParams(location.search).get('home');
  if (v === '0' || v === 'key' || v === 'call') {
    HOME.owned = HOME.opened = false;
    HOME.door = 0;
  } else if (v) {
    HOME.owned = true;
    HOME.opened = v !== 'shut';
    HOME.door = HOME.opened ? 1 : 0;
  }
}
