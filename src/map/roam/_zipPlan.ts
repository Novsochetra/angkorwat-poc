import type { HeightField } from '../heightfield';

/**
 * The zip line through the jungle behind Angkor Wat: where its trees,
 * platforms, stairs and cables are (plain numbers: the meshes are
 * jungle/_zipLine.ts, the walk map's part _zipWalk.ts, the ride _zipRide.ts,
 * the add-on _zip.ts, the mini-map's badge ui/_minimapSpots.ts).
 *
 * Four giant trees stand in the valley between Angkor Wat's hill and the
 * cliffs of the northern mesas, each with an octagonal wooden platform round
 * its trunk high up; three steel cables run between them, east along the
 * valley towards Phnom Kulen (221, 156 and 116 m long, 5, 4.4 and 3 m of drop
 * from platform to platform), over the jungle, past the lotus pond and the
 * back hamlet. A straight wooden stair climbs from the back trail to the first
 * platform (18.5 m up); another comes down from the last (8 m) to the trail by
 * the Kulen shrine. The middle platforms have no way down but the next line.
 *
 * The run was picked on the land and the jungle as they are (the same every
 * run, every graphics level): each line is clear of leaves and solid blocks by
 * at least a metre round the rider's whole body, all the way (checked against
 * the roaming world's walk maps, `world.softClearance` and `clearance`: the
 * console line `[map] zip: …` in a shot), the trees stand on flat grass with
 * no other trunk within 9 m, and no line passes over a holy place (the forest
 * Buddha, the monk's hut, the hamlet's spirit house and its neak ta shrine,
 * the Kulen shrine: at least 18 m to the side of each).
 *
 * Units: metres. Headings (yaw) as the roaming body's: 0 = towards +z, the
 * direction (sin yaw, cos yaw).
 */

/** A tree of the zip line: its trunk's middle (whole metres: the trunk's blocks are square on them), its platform, its stair. */
interface StationDef {
  x: number;
  z: number;
  /** The deck's top over the ground at the trunk (m). */
  deck: number;
  /** The tree: height, crown reach, seed (veg/species.ts `emergent`; seeds whose crown and boughs all start 6 m or more over the deck). */
  tree: { h: number; r: number; seed: number };
  /** A stair to the ground: the way it runs down from the platform (heading; it leaves from the octagon's side nearest it), and its landings. */
  stair?: { yaw: number; landings: number };
  /** The octagon turned this much from the line leaving (radians): so no line comes in or goes out over a corner post. */
  turn?: number;
}

/**
 * The four trees, west to east. Their deck heights fall a few metres from
 * each to the next, so a rider rolls on by himself (the cable sags too: down
 * steeply at first, flatter, a little up at the end: `cableY`).
 */
const DEFS: readonly StationDef[] = [
  // At the valley's west end, 26 m north of the back trail (the stair comes down towards it, south-south-west: its foot 8 m short of it).
  { x: -84, z: -324, deck: 18.5, tree: { h: 32, r: 6.8, seed: 4017 }, stair: { yaw: -0.49, landings: 2 } },
  // At the foot of the northern mesa's cliffs, north of the lotus pond.
  { x: 128, z: -388, deck: 13.5, tree: { h: 27.5, r: 6.6, seed: 4027 } },
  // In the open valley below Phnom Kulen.
  { x: 268, z: -320, deck: 9.1, tree: { h: 23.5, r: 6.4, seed: 4014 }, turn: 0.18 },
  // Beside the back trail, east of the Kulen shrine (the stair comes down south to the trail's edge).
  { x: 348, z: -236, deck: 8.1, tree: { h: 22.5, r: 6.2, seed: 4014 }, stair: { yaw: -0.03, landings: 0 } },
];

// ── Sizes (m) ───────────────────────────────────────────────────────────────

/** The trunk's half width (the jungle's big emergents: 2 m square). */
export const TRUNK_HALF = 1;
/** The octagonal deck: from the trunk out to its sides (apothem), its thickness (planks on joists). */
export const DECK_R = 3.3;
export const DECK_T = 0.24;
/** The rail round it: height, and how far out of the deck its walk-map wall reaches (so his probes cannot slip past it). */
export const RAIL_H = 1.15;
/** The rail's wall in the walk map: as tall as no jump can top, and this thick (out from the rail's line). */
export const RAIL_WALL = 4;
export const RAIL_BAND = 0.45;
/** Where he stands to clip in (from the trunk's middle, out along the line), and where he touches down on the next. */
export const R_LAUNCH = 2.6;
export const R_LAND = 2.0;
/** The cable over his feet where he stands clipped in (and where he touches down): the trolley over his head. */
export const HANG = 2.75;
/** The trolley's pin under the cable (the lanyard hangs from it), and his harness's front ring over his feet standing (character/zipRide.ts `ZIP_RING`). */
export const TROLLEY_DROP = 0.16;
export const RING_Y = 0.79;
/** The lanyard, from the pin to the carabiner (standing clipped in, the pin a little ahead of his face). */
export const STRAP = 1.8;
/** How far the cable sags under a rider, a share of the span. */
export const SAG = 0.015;
/** The brake block's spring on the cable: this far before the landing point (m). */
export const BRAKE = 7;
/** The stairs: width between the rails, one step's rise and run, a landing's length. */
export const STAIR_W = 1.9;
export const STEP_RISE = 0.3;
export const STEP_RUN = 0.34;
export const LANDING = 1.9;

/** The octagon's side length. */
export const SIDE = 2 * DECK_R * Math.tan(Math.PI / 8);

// ── The plan ───────────────────────────────────────────────────────────────

export interface ZipStair {
  /** Heading it runs down (away from the deck), and across (+: its left looking down it). */
  yaw: number;
  /** Where its top step meets the deck's side (world, m), the deck's height there. */
  x: number;
  z: number;
  top: number;
  /** Its foot's ground height. */
  ground: number;
  /** Flights (steps each, in order from the top) and landings between them. */
  flights: number[];
  /** Horizontal length from the deck's side to the foot (m). */
  length: number;
}

export interface ZipStation {
  readonly index: number;
  /** Trunk's middle (m), the ground there, the deck's top (absolute). */
  readonly x: number;
  readonly z: number;
  readonly ground: number;
  readonly deck: number;
  readonly tree: { h: number; r: number; seed: number };
  /** The octagon's first side faces this heading (the line leaving, or on the last tree the line arriving): side k faces `yaw + k π/4`. */
  readonly yaw: number;
  /** Sides with no rail: where a line leaves or arrives, where the stair meets the deck. */
  readonly open: readonly number[];
  readonly stair: ZipStair | null;
}

export interface ZipLineDef {
  /** 1, 2, 3 (as the URL says it). */
  readonly n: number;
  readonly from: ZipStation;
  readonly to: ZipStation;
  /** Heading along it, unit direction (plan). */
  readonly yaw: number;
  readonly dx: number;
  readonly dz: number;
  /** The ridden span: from where he clips in (`x0`, `y0` the cable there) to where he touches down (`x1`, `y1`), its plan length. */
  readonly x0: number;
  readonly z0: number;
  readonly y0: number;
  readonly x1: number;
  readonly z1: number;
  readonly y1: number;
  readonly length: number;
  /** The cable's ends on the two trunks (it runs on straight past the ridden span to them). */
  readonly ax: number;
  readonly az: number;
  readonly ay: number;
  readonly bx: number;
  readonly bz: number;
  readonly by: number;
}

export interface ZipPlan {
  readonly stations: readonly ZipStation[];
  readonly lines: readonly ZipLineDef[];
  /** Round everything (plan, m): the meshes are hidden far from it. */
  readonly cx: number;
  readonly cz: number;
  readonly radius: number;
}

/** Heading of a direction. */
const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);
/** Angle a − b wrapped to −π‥π. */
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** The octagon side (0‥7) whose outward heading is nearest `yaw`, for a deck turned to `yaw0`. */
export const sideOf = (yaw0: number, yaw: number) => (Math.round(wrapAngle(yaw - yaw0) / (Math.PI / 4)) + 8) % 8;

/** The stair's steps per flight for a deck `deck` m over the ground with `landings` landings. */
function flightsFor(deck: number, landings: number): number[] {
  // (the top step is the deck itself; from the last, about a step over the ground, he steps down onto it)
  const steps = Math.max(1, Math.round(deck / STEP_RISE) - 1);
  const n = landings + 1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Math.floor(steps / n) + (i < steps % n ? 1 : 0));
  return out;
}

/** Plan length of a stair (deck side to foot). */
const stairLength = (flights: readonly number[]) => flights.reduce((s, f) => s + f * STEP_RUN, 0) + (flights.length - 1) * LANDING;

/** Where the first tree's stair comes down (its foot, plan m): the mini-map's badge, the target's point. */
export const ZIP_START = (() => {
  const d = DEFS[0];
  const yaw0 = yawOf(DEFS[1].x - d.x, DEFS[1].z - d.z) + (d.turn ?? 0);
  const yaw = yaw0 + (sideOf(yaw0, d.stair!.yaw) * Math.PI) / 4;
  const out = DECK_R + stairLength(flightsFor(d.deck, d.stair!.landings));
  return { x: d.x + Math.sin(yaw) * out, z: d.z + Math.cos(yaw) * out };
})();

/** How many lines (the URL's `zip=<line>:…`: 1‥this). */
export const ZIP_LINES = DEFS.length - 1;

let made: ZipPlan | null = null;

/** The zip line on this land (made once). */
export function zipPlan(field: HeightField): ZipPlan {
  if (made) return made;
  const n = DEFS.length;
  const head = DEFS.map((d, i) => {
    const o = DEFS[Math.min(n - 1, i + 1)];
    const p = DEFS[Math.max(0, i - 1)];
    // (the line leaving, or on the last tree the way back along the line arriving)
    return (i < n - 1 ? yawOf(o.x - d.x, o.z - d.z) : yawOf(p.x - d.x, p.z - d.z)) + (d.turn ?? 0);
  });
  const stations: ZipStation[] = DEFS.map((d, i) => {
    const ground = field.heightAt(d.x, d.z);
    const yaw = head[i];
    const open = new Set<number>();
    if (i < n - 1) open.add(0);
    if (i > 0) open.add(sideOf(yaw, yawOf(DEFS[i - 1].x - d.x, DEFS[i - 1].z - d.z)));
    let stair: ZipStair | null = null;
    if (d.stair) {
      const k = sideOf(yaw, d.stair.yaw);
      open.add(k);
      // (it leaves square from the middle of that side)
      const sy = yaw + (k * Math.PI) / 4;
      const flights = flightsFor(d.deck, d.stair.landings);
      const length = stairLength(flights);
      const fx = d.x + Math.sin(sy) * (DECK_R + length);
      const fz = d.z + Math.cos(sy) * (DECK_R + length);
      stair = { yaw: sy, x: d.x + Math.sin(sy) * DECK_R, z: d.z + Math.cos(sy) * DECK_R, top: ground + d.deck, ground: field.heightAt(fx, fz), flights, length };
    }
    return { index: i, x: d.x, z: d.z, ground, deck: ground + d.deck, tree: d.tree, yaw, open: [...open].sort(), stair };
  });
  const lines: ZipLineDef[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / l;
    const dz = (b.z - a.z) / l;
    const length = l - R_LAUNCH - R_LAND;
    const y0 = a.deck + HANG;
    const y1 = b.deck + HANG;
    // (straight on past the ridden span to the trunks: along the sagging cable's slope there)
    const s0 = (y1 - y0) / length - 4 * SAG;
    const s1 = (y1 - y0) / length + 4 * SAG;
    lines.push({
      n: i + 1,
      from: a,
      to: b,
      yaw: yawOf(dx, dz),
      dx,
      dz,
      x0: a.x + dx * R_LAUNCH,
      z0: a.z + dz * R_LAUNCH,
      y0,
      x1: b.x - dx * R_LAND,
      z1: b.z - dz * R_LAND,
      y1,
      length,
      ax: a.x + dx * TRUNK_HALF,
      az: a.z + dz * TRUNK_HALF,
      ay: y0 - s0 * (R_LAUNCH - TRUNK_HALF),
      bx: b.x - dx * TRUNK_HALF,
      bz: b.z - dz * TRUNK_HALF,
      by: y1 + s1 * (R_LAND - TRUNK_HALF),
    });
  }
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const s of stations) {
    const r = DECK_R + (s.stair?.length ?? 0) + 8;
    x0 = Math.min(x0, s.x - r);
    x1 = Math.max(x1, s.x + r);
    z0 = Math.min(z0, s.z - r);
    z1 = Math.max(z1, s.z + r);
  }
  made = { stations, lines, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, radius: Math.hypot(x1 - x0, z1 - z0) / 2 };
  return made;
}

/** The cable's height over the ridden span at `u` (0 where he clips in ‥ 1 where he touches down). */
export const cableY = (l: ZipLineDef, u: number): number => l.y0 + (l.y1 - l.y0) * u - SAG * l.length * 4 * u * (1 - u);
/** Its slope there (rise per metre along). */
export const cableSlope = (l: ZipLineDef, u: number): number => (l.y1 - l.y0) / l.length - 4 * SAG * (1 - 2 * u);

/** A point on the cable over the ridden span (`u` may run a little past 0 and 1: on along the same curve). */
export function cableAt(l: ZipLineDef, u: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  out.x = l.x0 + (l.x1 - l.x0) * u;
  out.z = l.z0 + (l.z1 - l.z0) * u;
  out.y = cableY(l, u);
  return out;
}

/** The stair's tread top at `along` m from the deck's side (down it): the deck's height before 0, NaN past the last step (the ground). */
export function stairTop(s: ZipStair, along: number): number {
  if (along < 0) return s.top;
  let y = s.top;
  let at = 0;
  for (let f = 0; f < s.flights.length; f++) {
    const n = s.flights[f];
    if (along < at + n * STEP_RUN) return y - STEP_RISE * (Math.floor((along - at) / STEP_RUN) + 1);
    at += n * STEP_RUN;
    y -= n * STEP_RISE;
    if (f < s.flights.length - 1) {
      if (along < at + LANDING) return y;
      at += LANDING;
    }
  }
  // (past the last step: the ground)
  return NaN;
}

/**
 * The posts under a stair (pairs, under its sides): at both ends of each
 * landing, and along each flight about every 2.5 m where it is a metre or
 * more over the ground. `a` along it from the deck's side, `c` across (+ its
 * left looking down it), `y` the tread's top over the post.
 */
export function stairPosts(s: ZipStair): { a: number; c: number; y: number }[] {
  const out: { a: number; c: number; y: number }[] = [];
  const c = STAIR_W / 2 - 0.08;
  const add = (a: number) => {
    const y = stairTop(s, a);
    if (Number.isNaN(y) || y - s.ground < 1.2) return;
    out.push({ a, c, y }, { a, c: -c, y });
  };
  let at = 0;
  for (let f = 0; f < s.flights.length; f++) {
    const run = s.flights[f] * STEP_RUN;
    const n = Math.max(1, Math.round(run / 2.5));
    for (let i = 1; i < n; i++) add(at + (run * i) / n);
    at += run;
    if (f < s.flights.length - 1) {
      add(at + 0.15);
      add(at + LANDING - 0.15);
      at += LANDING;
    }
  }
  // (and at the deck's side, under the top step)
  add(0.15);
  return out;
}
