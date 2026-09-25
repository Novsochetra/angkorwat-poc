import { Group, Quaternion, Vector3 } from 'three';
import { CELL, SURFACE, type HeightField } from '../heightfield';
import { OVERVIEW, PLACES, PLATEAUS, type PlaceDef, type Plateau } from '../layout';
import { buildRoadNetwork, KIND, LIFT, type Station } from '../road/line';
import { sideInfo, WALL_V } from '../road/stone';
import { MAP_VIEWS, ROAM_AREA, type MapView } from '../terrain/views';
import { GLIDER, Glider } from './_gliderModel';
import { buildLaunchRamp, RAMP, rampDeckY, rampStairs, rampStepY, WIND } from './_launchRamp';
import { FLAG } from './_rampFlag';
import { ROAM_SCALE, type RoamWorld } from './types';

/**
 * Hang glider take-off spots: a wooden ramp at the edge of a high cliff,
 * with a windsock, a lantern and a glider waiting on it. Walk up to one,
 * press E: the explorer lifts the glider, runs down the ramp and flies
 * (hangGlider.ts).
 *
 * The spots are found on the land itself (the same every run): from every
 * cell on a cliff's lip at least 18 m up, each way the land falls away, a
 * ramp slid back so its lip ends just short of the edge; kept if the cliff
 * drops at least 10 m right there, the land is flat and bare under the deck,
 * nothing rises round it where the parked glider's wings reach, the explorer
 * can walk there from the road and back (steps up to 2 m either way, no
 * drop he could not climb again), and the first 150 m of the flight stay
 * well over the land (the treetops too, near the cliff). The best (high, a
 * deep drop, a short walk, looking over the temples), far apart and a
 * couple per mesa at most, get a ramp.
 *
 * A high temple's hill where no flat cliff top fits (the mountain's
 * narrow terraces, the garden terraces' low steps) gets a built-up ramp:
 * its back stands over level ground, its deck reaches out over the fall on
 * a trestle whose posts go down to the land, a metre or more up (steps
 * lead up to it), and a lane down the slope ahead is kept clear of trees.
 * No ramp stands in front of a temple as the map's cameras see it.
 *
 * Every ramp flies the flag of Cambodia from a tall mast under a beacon
 * lamp (_launchRamp.ts), to find it by from far away, day and night.
 *
 * `reserveLaunchSpots` (main.ts, before the jungle is planted) keeps the
 * trees off them; without it only spots with no tree round them are used.
 *
 * The ramps are walkable: `deckAt` gives their deck height (and their
 * steps'), and roam.ts lays it over the walk map.
 */

export interface LaunchSpot {
  /** Back end of the ramp (m): the deck's foot there (the ground, or `lift` over it), and the heading of the take-off (radians, 0 = toward +z). */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** How far the land drops under the flight (m), for the report. */
  drop: number;
  /** Built up (no flat cliff top on its hill): on a trestle over the falling ground, its deck's foot `lift` metres over the ground at its back (m; 0 on a cliff top). */
  stilts: boolean;
  lift: number;
}

export interface LaunchSpots {
  readonly object: Group;
  readonly list: readonly LaunchSpot[];
  readonly blocks: number;
  /** The spot whose ramp (x, z) is on or at the back of, with feet at height `y`; or null. */
  near(x: number, z: number, y: number): LaunchSpot | null;
  /** Top of a ramp's deck at (x, z), or −Infinity off every ramp. */
  deckAt(x: number, z: number): number;
  /** Where a point `u` metres along the ramp (from its back) and `v` across (+ = the take-off's left) is, deck top (world). */
  along(spot: LaunchSpot, u: number, v: number, out: Vector3): Vector3;
  /** Where the glider waiting on a spot's ramp is (its hang point, world) and how it is turned. */
  parked(spot: LaunchSpot, pos: Vector3, quat: Quaternion): Vector3;
  /** The explorer lifts the spot's glider (it leaves the ramp until he is far away). */
  take(spot: LaunchSpot): void;
  /** Every frame: lanterns, beacons, windsocks and flags; a glider comes back to its ramp once the explorer is well away. */
  frame(night: number, t: number, at: Vector3, flying: boolean): void;
}

/** The cliff: the land past the lip at least this much lower right away, and this much a few metres on (m). */
const EDGE_DROP = 4;
const MIN_DROP = 10;
/** The lip ends this far short of the cliff's edge (m): the posts under it stand on the rock, clear of the moss cushions over the edge (veg/cliffs.ts, a metre in). */
const LIP_GAP = 1.3;
/** The first stretch of the flight: this long (m), at least this far over the land (m, once clear of the lip), and the wing tips this far to each side (m). */
const CLEAR_RUN = 150;
const MIN_CLEAR = 6;
const CORRIDOR = 8;
/** Room round the deck for a parked glider's wings (they reach 7.6 m to each side): across and behind the back (m). */
const KEEP_SIDE = 9;
const KEEP_BACK = 4;
/** No tree this far behind that either (m): the flag streams out back there from its mast, over the treetops. */
const FLAG_ROOM = 4;
/** How tall the jungle grows (m, a typical crown's top over the land), and how far out the flight must clear it (m). */
const TREE_TOP = 10;
const CANOPY_RUN = 40;
/** The take-offs look over the temples if they can: Angkor Wat. */
const HOME = PLACES[0];
/** Only on ground this high (m) … and spots this far apart (m) at most this many. */
const MIN_HEIGHT = 18;
const SPACING = 120;
const MAX_SPOTS = 7;
/** At most this many on one mesa or mountain (the summit's three tiers count as one). */
const PER_REGION = 2;
/** Take-off headings tried from each cell of a cliff's lip. */
const DIRS = 32;
/** Temples this high up (m) get a ramp on their hill: a built-up one if no flat cliff top fits there … */
const HIGH_TEMPLE = 30;
/** … within this far of the temple (m); its deck this high over the ground at its back (m: a metre and more clears the moss cushions on the lips it reaches over), the land falling away this far along it (m), its posts at most this long (m). */
const PERCH_REACH = 120;
const LIFTS = [1.5, 3];
const RESTS = [3, 5];
const POST_MAX = 18;
/** A temple as the map's cameras see it: its pad (this much bigger) and this high over it (m). */
const TEMPLE_GROW = 1.25;
const TEMPLE_H = 45;
/** A glider comes back to its ramp when the explorer is this far from it (m). */
const RETURN_AT = 45;

/** The glider waiting on a ramp: its base bar this far along the deck (m), its nose down this much (rad: into the breeze, so it will not lift; its tips ride over the explorer's head). */
const PARK_AT = RAMP.length * 0.28;
const PARK_PITCH = 0.14;

const UP = new Vector3(0, 1, 0);
const X = new Vector3(1, 0, 0);
const _q = new Quaternion();
const _b = new Vector3();

export function createLaunchSpots(field: HeightField, world: RoamWorld): LaunchSpots {
  const t0 = performance.now();
  // (spots kept clear of the trees before they were planted, if main.ts did; each still checked against what stands there)
  const pre = reserved.get(field);
  const list = pre ? pre.list.map((s) => settle(field, world, s)).filter((s) => s !== null) : findSpots(field, world);
  const object = new Group();
  object.name = 'roam:launchSpots';
  let blocks = 0;
  const ramps: { spot: LaunchSpot; update(night: number, t: number): void; glider: Glider; taken: boolean }[] = [];
  const q = new Quaternion();
  const p = new Vector3();
  for (const [i, spot] of list.entries()) {
    // (the land under it in ramp space: its posts and poles stand on it)
    const fx = Math.sin(spot.yaw);
    const fz = Math.cos(spot.yaw);
    const ground = (x: number, z: number) => field.heightAt(spot.x + fx * z + fz * x, spot.z + fz * z - fx * x) - spot.y;
    // (the breeze a little from whichever side shows the flag's face to the overview camera)
    const [cu, cv] = local(spot, OVERVIEW.pos[0], OVERVIEW.pos[2]);
    const side = Math.abs(cv * Math.cos(WIND) - cu * Math.sin(WIND)) >= Math.abs(cv * Math.cos(WIND) + cu * Math.sin(WIND)) ? 1 : -1;
    const ramp = buildLaunchRamp(i + 1, { ground, stilts: spot.stilts, lift: spot.lift, side });
    ramp.group.position.set(spot.x, spot.y, spot.z);
    ramp.group.rotation.set(0, spot.yaw, 0);
    object.add(ramp.group);
    blocks += ramp.blocks;
    // A glider waiting on the deck, nose to the edge, its bar on the planks.
    const glider = new Glider();
    object.add(glider.object);
    blocks += glider.blocks;
    ramps.push({ spot, update: ramp.update, glider, taken: false });
  }
  const park = (r: (typeof ramps)[number]) => {
    api.parked(r.spot, p, q);
    r.glider.pose({ position: p, quaternion: q, size: ROAM_SCALE, open: 1, flutter: 0.05, t: 0, night: 0 });
  };

  const api: LaunchSpots = {
    object,
    list,
    blocks,
    near(x, z, y) {
      for (const s of list) {
        const [u, v] = local(s, x, z);
        if (u < -3 || u > RAMP.length * 0.7 || Math.abs(v) > RAMP.width / 2 + 1.5) continue;
        // (a built-up deck: from on it or its top steps, not from the ground under it)
        if (Math.abs(y - (s.y + rampDeckY(Math.max(0, u)))) < 2.5 && (s.lift === 0 || y > s.y - 0.8)) return s;
      }
      return null;
    },
    deckAt(x, z) {
      let top = -Infinity;
      for (const s of list) {
        const [u, v] = local(s, x, z);
        if (u >= 0 && u <= RAMP.length && Math.abs(v) <= RAMP.width / 2) top = Math.max(top, s.y + rampDeckY(u));
        // (the steps up to a built-up deck)
        else if (s.lift > 0 && u < 0 && Math.abs(v) <= RAMP.stair.width / 2) top = Math.max(top, s.y + rampStepY(u, s.lift));
      }
      return top;
    },
    along(s, u, v, out) {
      const f = fwd(s.yaw, _f);
      return out.set(s.x + f.x * u + f.z * v, s.y + rampDeckY(Math.min(RAMP.length, Math.max(0, u))), s.z + f.z * u - f.x * v);
    },
    parked(s, pos, quat) {
      // The middle of the base bar on the planks, the nose a little down.
      quat.setFromAxisAngle(UP, s.yaw).multiply(_q.setFromAxisAngle(X, PARK_PITCH));
      api.along(s, PARK_AT, 0, pos);
      return pos.sub(_b.set(0, GLIDER.bar.y, GLIDER.bar.z).multiplyScalar(ROAM_SCALE).applyQuaternion(quat));
    },
    take(spot) {
      const r = ramps.find((r) => r.spot === spot);
      if (!r) return;
      r.taken = true;
      r.glider.hide();
    },
    frame(night, t, at, flying) {
      for (const r of ramps) {
        r.update(night, t);
        if (r.taken && !flying && Math.hypot(at.x - r.spot.x, at.z - r.spot.z) > RETURN_AT) {
          r.taken = false;
          park(r);
        }
      }
    },
  };
  for (const r of ramps) park(r);
  const built = (s: LaunchSpot) => (s.stilts ? ` built up ${s.lift}m` : '');
  console.info(`[map] launch spots: ${list.length} (${list.map((s) => `${s.x.toFixed(0)},${s.z.toFixed(0)} ↑${s.y.toFixed(0)}m yaw ${Math.round((s.yaw * 180) / Math.PI)}° ↓${s.drop.toFixed(0)}m${built(s)}`).join(' · ')}), ${blocks} blocks, ${pre ? `found in ${pre.ms.toFixed(0)} ms, ` : ''}built in ${(performance.now() - t0).toFixed(0)} ms`);
  return api;
}

const _f = new Vector3();
const fwd = (yaw: number, out: Vector3) => out.set(Math.sin(yaw), 0, Math.cos(yaw));

/** (x, z) in a ramp's own frame: metres along it from its back, and across (+ = its left). */
function local(s: LaunchSpot, x: number, z: number): [number, number] {
  const fx = Math.sin(s.yaw);
  const fz = Math.cos(s.yaw);
  const dx = x - s.x;
  const dz = z - s.z;
  return [dx * fx + dz * fz, dx * fz - dz * fx];
}

/** Spots found before the trees were planted (`reserveLaunchSpots`), per land. */
const reserved = new WeakMap<HeightField, { list: LaunchSpot[]; ms: number }>();

/**
 * Find the take-off spots on the land alone and keep the ground round each
 * ramp clear: no tree grows where a parked glider's wings reach (the cells
 * are marked built on, as the landmarks and the road do). Call it after the
 * landmarks and the road are built and before the vegetation is planted
 * (main.ts); `createLaunchSpots` then puts the ramps there. Without it,
 * `createLaunchSpots` looks for spots with no tree trunk round them: few in
 * this jungle. Behind the mast, where the flag streams out, is kept clear
 * too, and a built-up ramp's lane down the slope ahead.
 */
export function reserveLaunchSpots(field: HeightField): readonly LaunchSpot[] {
  const t0 = performance.now();
  const list = findSpots(field, null);
  const L = RAMP.length;
  for (const s of list) {
    const fx = Math.sin(s.yaw);
    const fz = Math.cos(s.yaw);
    const keep = (u: number, v: number) => field.occupy(s.x + fx * u + fz * v, s.z + fz * u - fx * v, s.x + fx * u + fz * v, s.z + fz * u - fx * v);
    const back = KEEP_BACK + FLAG_ROOM + (s.lift > 0 ? rampStairs(s.lift).length : 0);
    // (as wide as the ramp may slide along the cliff when it is put there, `settle`)
    for (let u = -back; u <= L + 2; u += 1) for (let v = -KEEP_SIDE - 1 - SLIDE; v <= KEEP_SIDE + 1 + SLIDE; v += 1) keep(u, v);
    if (s.stilts) for (let u = L + 2; u <= L + CANOPY_RUN; u += 1) for (let v = -CORRIDOR - 2; v <= CORRIDOR + 2; v += 1) keep(u, v);
  }
  reserved.set(field, { list, ms: performance.now() - t0 });
  return list;
}

interface Candidate extends LaunchSpot {
  score: number;
}

/**
 * The best take-offs on the land (see the file's note): the cliff tops,
 * then a built-up one on each high temple's hill that got none; with
 * `world` (the walk map) checked for anything standing round them (tree
 * trunks, walls, rocks), without it on the land alone.
 */
function findSpots(field: HeightField, world: RoamWorld | null): LaunchSpot[] {
  const walk = walkFromRoad(field);
  // Cells nothing is built on or passes (a pad, the road, a lamp, a river).
  const free = new Uint8Array(field.nx * field.nz);
  for (let c = 0; c < free.length; c++) free[c] = field.occupied[c] ? 0 : 1;
  const found = candidates(field, walk, free);
  const out: LaunchSpot[] = [];
  const regions: string[] = [];
  const spot = (f: Candidate): LaunchSpot => ({ x: f.x, y: f.y, z: f.z, yaw: f.yaw, drop: f.drop, stilts: f.stilts, lift: f.lift });
  for (const f of found) {
    if (out.length >= MAX_SPOTS) break;
    if (out.some((o) => Math.hypot(o.x - f.x, o.z - f.z) < SPACING)) continue;
    // (spread over the highlands: a couple on each mesa or mountain at most)
    const region = regionOf(f.x, f.z);
    if (regions.filter((r) => r === region).length >= PER_REGION) continue;
    if (hidesTemple(f)) continue;
    if (world && blocked(field, world, f)) continue;
    out.push(spot(f));
    regions.push(region);
  }
  // A high temple's hill with no ramp yet (no flat cliff top fits there): a built-up one.
  for (const p of PLACES) {
    const region = regionOf(p.x, p.z);
    if (p.y < HIGH_TEMPLE || regions.includes(region)) continue;
    for (const f of perches(field, p, region, walk, free)) {
      if (out.some((o) => Math.hypot(o.x - f.x, o.z - f.z) < SPACING)) continue;
      if (hidesTemple(f)) continue;
      if (world && blocked(field, world, f)) continue;
      out.push(spot(f));
      regions.push(region);
      break;
    }
    if (!regions.includes(region)) console.warn(`[map] launch spots: no ramp fits on ${region}`);
  }
  return out;
}

/**
 * A reserved spot where it can go now the trees and the moss are there: as
 * it is, or slid a few metres along the cliff (inside its clearing) round a
 * moss cushion; null (and a warning) if nowhere.
 */
function settle(field: HeightField, world: RoamWorld, s: LaunchSpot): LaunchSpot | null {
  const fx = Math.sin(s.yaw);
  const fz = Math.cos(s.yaw);
  let why: string | null = null;
  for (const dv of SLIDES) {
    const t = { ...s, x: s.x + fz * dv, z: s.z - fx * dv };
    if (dv && !(s.stilts ? perch(field, t.x, t.y - t.lift, t.z, fx, fz, t.lift, null) >= 0 : fits(field, t.x, t.y, t.z, fx, fz, null))) continue;
    const w = blocked(field, world, t);
    if (!w) return t;
    why ??= w;
  }
  console.warn(`[map] launch spot ${s.x.toFixed(0)},${s.z.toFixed(0)} left out: ${why}`);
  return null;
}
/** How far a ramp may slide along the cliff (m), and the slides tried, nearest first (0, ½, −½, 1, −1 …). */
const SLIDE = 4;
const SLIDES = [0, ...Array.from({ length: SLIDE * 4 }, (_, i) => (Math.floor(i / 2) + 1) * 0.5 * (i % 2 ? -1 : 1))];

/** What stands in the way of a spot (the walk map): something where the ramp and the parked glider's wings are, or trees too tall ahead; null if nothing. */
function blocked(field: HeightField, world: RoamWorld, s: LaunchSpot): string | null {
  const fx = Math.sin(s.yaw);
  const fz = Math.cos(s.yaw);
  const W = RAMP.width / 2 + 0.3;
  // (the ground at the back: under the deck's foot, or `lift` under it)
  const y0 = s.y - s.lift;
  const steps = s.lift > 0 ? rampStairs(s.lift).length + 0.5 : 0;
  for (let u = -KEEP_BACK; u <= RAMP.length + 2; u += 1)
    for (let v = -KEEP_SIDE; v <= KEEP_SIDE; v += 1) {
      const px = s.x + fx * u + fz * v;
      const pz = s.z + fz * u - fx * v;
      const g = field.heightAt(px, pz);
      const w = world.groundAt(px, pz);
      // (under the deck nothing may poke through it, nor through the steps; round it, where the wings are, a moss cushion or a stone is fine)
      const deck = u >= -0.5 && u <= RAMP.length && Math.abs(v) <= W;
      const onSteps = u < 0 && u >= -steps && Math.abs(v) <= RAMP.stair.width / 2 + 0.3;
      let high = g >= y0 - 1 && w > g + (deck || onSteps ? 0.25 : 1.5);
      // (a built-up deck stands over the falling land: under it only what reaches up to its timbers is in the way, round it only what reaches up to the wings)
      if (s.stilts && !onSteps) high = deck ? w > Math.max(g + 0.25, s.y + rampDeckY(u) - 0.5) : w > s.y + 1;
      if (high) return `${(w - g).toFixed(1)} m high at ${u},${v} on the ramp`;
    }
  // Right past the lip, where his feet leave the deck: nothing he would stub them on (a tall moss cushion on the edge).
  for (let u = RAMP.length; u <= RAMP.length + 4; u += 0.5)
    for (let v = -0.5; v <= 0.5; v += 0.5) {
      const w = world.groundAt(s.x + fx * u + fz * v, s.z + fz * u - fx * v);
      if (w > s.y + RAMP.lipY + 0.4) return `${(w - s.y).toFixed(1)} m high at ${u},${v} past the lip`;
    }
  // (a trunk's top is a few metres under its crown)
  const crowns = (x: number, z: number) => {
    const w = world.groundAt(x, z);
    return Math.max(canopy(field, x, z), w > field.heightAt(x, z) + 0.6 ? w + 5 : w);
  };
  return corridor(field, s.x, s.y, s.z, fx, fz, (x, z) => world.groundAt(x, z), crowns) >= 0 ? null : 'trees ahead';
}

/** Every cliff-top take-off that fits on the land, best first (`walk` from the road, on cells `free` of anything built). */
function candidates(field: HeightField, walk: Float32Array, free: Uint8Array): Candidate[] {
  const a = ROAM_AREA;
  const L = RAMP.length;
  const { nx, nz, height } = field;
  const H = (x: number, z: number) => field.heightAt(x, z);
  const found: Candidate[] = [];
  const M = 30;
  // From every cell on a cliff's lip, each way the land falls away: the ramp's lip just short of the edge.
  for (let ck = 0; ck < nz; ck++)
    for (let ci = ck & 1; ci < nx; ci += 2) {
      // (every other cell: the ramps of two cells side by side are all but the same)
      const y = height[ci + ck * nx];
      if (y < MIN_HEIGHT) continue;
      const sx = field.x0 + (ci + 0.5) * CELL;
      const sz = field.z0 + (ck + 0.5) * CELL;
      if (sx < a.x0 + M || sx > a.x1 - M || sz < a.z0 + M || sz > a.z1 - M) continue;
      if (field.dropAt(sx, sz) < EDGE_DROP || field.waterAt(sx, sz) !== null) continue;
      for (let k = 0; k < DIRS; k++) {
        const yaw = (k / DIRS) * Math.PI * 2;
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        // Where the land falls, a cell or so ahead.
        let e = 0;
        for (let u = 0.25; u <= 3 && !e; u += 0.25) if (H(sx + fx * u, sz + fz * u) < y) e = u;
        if (!e) continue;
        const x = sx + fx * (e - LIP_GAP - L);
        const z = sz + fz * (e - LIP_GAP - L);
        if (!fits(field, x, y, z, fx, fz, free)) continue;
        // Walked to from the road and back (steps up to 2 m either way).
        const walkM = walk[field.index(x, z)];
        if (walkM < 0) continue;
        const cell = (u: number, v: number) => field.index(x + fx * u + fz * v, z + fz * u - fx * v);
        let ok = true;
        // Round the deck, where the parked glider's wings reach: no rise over it, nothing built.
        for (let u = -KEEP_BACK; u <= L + 2 && ok; u += 1.5)
          for (let v = -KEEP_SIDE; v <= KEEP_SIDE && ok; v += 1.5) {
            const c = cell(u, v);
            if (c < 0 || height[c] > y + 1 || (height[c] >= y - 1 && field.occupied[c] && field.water[c] < -1000)) ok = false;
          }
        if (!ok) continue;
        // The flight over the treetops.
        const clear = corridor(field, x, y, z, fx, fz, H, (px, pz) => canopy(field, px, pz));
        if (clear < 0) continue;
        // Higher, a deeper drop, a short walk from the road the better; looking over the temples.
        const view = Math.cos(yaw - Math.atan2(HOME.x - x, HOME.z - z));
        const score = Math.min(60, clear) + 0.3 * y - Math.max(0, walkM - 20) * 0.3 + 6 * view;
        found.push({ x, y, z, yaw, drop: clear, stilts: false, lift: 0, score });
      }
    }
  return found.sort((p, q) => q.score - p.score);
}

/**
 * A ramp fits the land with its back at (x, y, z), heading (fx, fz): a real
 * cliff right past the lip, the land flat and dry under the deck and a metre
 * past the lip (moss cushions reach a metre in over a cliff's edge; beside
 * the deck a low step is fine), at the step up at its back and at the
 * windsock pole's foot; not on the road or a pad, and only on cells `free`
 * (1) of anything built.
 */
function fits(field: HeightField, x: number, y: number, z: number, fx: number, fz: number, free: Uint8Array | null): boolean {
  const L = RAMP.length;
  const W = RAMP.width / 2 + 0.4;
  const h = (u: number, v: number) => field.heightAt(x + fx * u + fz * v, z + fz * u - fx * v);
  if (h(L + LIP_GAP + 1, 0) > y - EDGE_DROP || h(L + 6, 0) > y - MIN_DROP) return false;
  // (`drop`: the land may be that much lower there, as beside the deck: no moss cushion on a step that low)
  const flat = (u: number, v: number, drop = 0) => {
    const c = field.index(x + fx * u + fz * v, z + fz * u - fx * v);
    const sf = field.surface[c];
    return c >= 0 && field.height[c] <= y && field.height[c] >= y - drop && field.water[c] < -1000 && sf !== SURFACE.bed && sf !== SURFACE.path && sf !== SURFACE.pad && (!free || free[c] === 1);
  };
  // (the lip's corners first: a slanting ramp hangs over the edge there)
  if (!(flat(L, W) && flat(L, -W) && flat(L + 1, W) && flat(L + 1, -W) && flat(L + 1, 0) && flat(-1, 0) && flat(RAMP.pole.z, RAMP.pole.x))) return false;
  for (let u = 0; u <= L + 1; u += 1) for (const v of ACROSS) if (!flat(u, v * W, Math.abs(v) > 1 ? 2 * CELL : 0)) return false;
  return true;
}
const ACROSS = [-1.4, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 1.4];

/**
 * Built-up take-offs on a temple's hill (`region`, near `place`), best
 * first: from every cell on a lip there, each way the land falls away, a
 * ramp whose back stands over the level top and whose deck reaches out
 * over the fall (`perch`), a metre or more up, walked to from the road
 * (its steps' foot). The flight is checked over the bare land: the lane
 * ahead is kept clear of trees (`reserveLaunchSpots`).
 */
function perches(field: HeightField, place: PlaceDef, region: string, walk: Float32Array, free: Uint8Array): Candidate[] {
  const a = ROAM_AREA;
  const L = RAMP.length;
  const H = (x: number, z: number) => field.heightAt(x, z);
  const found: Candidate[] = [];
  const M = 30;
  const R = PERCH_REACH;
  const i0 = Math.max(0, Math.floor((place.x - R - field.x0) / CELL));
  const k0 = Math.max(0, Math.floor((place.z - R - field.z0) / CELL));
  const i1 = Math.min(field.nx - 1, Math.floor((place.x + R - field.x0) / CELL));
  const k1 = Math.min(field.nz - 1, Math.floor((place.z + R - field.z0) / CELL));
  // A ramp with its back at (x, z) on ground at `y`, its deck `lift` over it; or null.
  const at = (x: number, y: number, z: number, yaw: number, lift: number): Candidate | null => {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const deep = perch(field, x, y, z, fx, fz, lift, free);
    if (deep < 0 || deep + lift > POST_MAX) return null;
    const foot = rampStairs(lift).length + 0.5;
    const walkM = walk[field.index(x - fx * foot, z - fz * foot)];
    if (walkM < 0) return null;
    const top = y + lift;
    // Round the deck, where the parked glider's wings reach: no land over the deck's foot (its moss and vines
    // stay under the wings), nothing built by it. (a cell further out too: the vines hanging down a higher
    // step's wall reach out in front of it, veg/cliffs.ts)
    for (let u = -KEEP_BACK - CELL; u <= L + 2; u += CELL)
      for (let v = -KEEP_SIDE - CELL; v <= KEEP_SIDE + CELL; v += CELL) {
        const c = field.index(x + fx * u + fz * v, z + fz * u - fx * v);
        if (c < 0 || field.height[c] > top || (field.height[c] >= y - 1 && field.occupied[c] && field.water[c] < -1000)) return null;
      }
    const clear = corridor(field, x, top, z, fx, fz, H, H);
    if (clear < 0) return null;
    // As on the cliff tops; and as little built up as will do.
    const view = Math.cos(yaw - Math.atan2(HOME.x - x, HOME.z - z));
    const score = Math.min(60, clear) + 0.3 * top - Math.max(0, walkM - 20) * 0.3 + 6 * view - 2 * lift - 0.2 * deep;
    return { x, y: top, z, yaw, drop: clear, stilts: true, lift, score };
  };
  // (every other cell each way: a ramp's place is set by the lip's line, not the cell)
  for (let ck = k0; ck <= k1; ck += 2)
    for (let ci = i0; ci <= i1; ci += 2) {
      const y = field.height[ci + ck * field.nx];
      if (y < MIN_HEIGHT) continue;
      const [sx, sz] = field.cellCenter(ci, ck);
      if (Math.hypot(sx - place.x, sz - place.z) > R) continue;
      if (sx < a.x0 + M || sx > a.x1 - M || sz < a.z0 + M || sz > a.z1 - M) continue;
      if (field.dropAt(sx, sz) < EDGE_DROP || field.waterAt(sx, sz) !== null) continue;
      // (on the hill's own ground: not where another mesa's outline reaches over it)
      if (regionOf(sx, sz) !== region || !alone(sx, sz, region)) continue;
      for (let k = 0; k < DIRS; k++) {
        const yaw = (k / DIRS) * Math.PI * 2;
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        // Where the land falls, a cell or so ahead: the deck's back metres before it, the rest out over it.
        let e = 0;
        for (let u = 0.25; u <= 3 && !e; u += 0.25) if (H(sx + fx * u, sz + fz * u) < y) e = u;
        if (!e) continue;
        for (const rest of RESTS)
          // (only as high as it has to be)
          for (const lift of LIFTS) {
            const f = at(sx + fx * (e - rest), y, sz + fz * (e - rest), yaw, lift);
            if (!f) continue;
            found.push(f);
            break;
          }
      }
    }
  return found.sort((p, q) => q.score - p.score);
}

/**
 * A built-up ramp fits the land at (x, z), heading (fx, fz), the ground at
 * its back at `y` and its deck `lift` over it: the ground level at `y`, dry
 * and bare under its back metre, its steps and its two poles' feet; nowhere
 * under the deck (and a metre past its lip) higher than that, and dry and
 * bare there too (not the road or a pad; only on cells `free` (1) of
 * anything built). How far the land falls under the deck (m: its longest
 * post, near enough), or −1.
 */
function perch(field: HeightField, x: number, y: number, z: number, fx: number, fz: number, lift: number, free: Uint8Array | null): number {
  const L = RAMP.length;
  const W = RAMP.width / 2 + 0.4;
  const cell = (u: number, v: number) => field.index(x + fx * u + fz * v, z + fz * u - fx * v);
  const bare = (c: number) => {
    const sf = field.surface[c];
    return c >= 0 && field.water[c] < -1000 && sf !== SURFACE.bed && sf !== SURFACE.path && sf !== SURFACE.pad && (!free || free[c] === 1);
  };
  const level = (u: number, v: number) => {
    const c = cell(u, v);
    return bare(c) && field.height[c] === y;
  };
  if (!(level(-1, 0) && level(1, 0) && level(0, W) && level(0, -W) && level(RAMP.pole.z, RAMP.pole.x) && level(RAMP.mast.z, RAMP.mast.x))) return -1;
  const steps = rampStairs(lift).length;
  const sw = RAMP.stair.width / 2 + 0.3;
  for (let u = -steps - 0.5; u < 0; u += 1) if (!level(u, 0) || !level(u, sw) || !level(u, -sw)) return -1;
  let low = y;
  for (let u = 0; u <= L + 1; u += 1)
    for (const v of PERCH_ACROSS) {
      const c = cell(u, v * W);
      if (!bare(c) || field.height[c] > y) return -1;
      low = Math.min(low, field.height[c]);
    }
  return y - low;
}
/** (across the deck: under 2 m apart, so every cell under it is seen) */
const PERCH_ACROSS = [-1.4, -0.7, 0, 0.7, 1.4];

/**
 * The first stretch of the flight from a ramp at (x, y, z) heading (fx, fz):
 * how far the land stays under it at the least (m); or −1 if it leaves the
 * roaming area, or comes too close: the land and what stands on it (`land`)
 * all along, the treetops (`crowns`) in the first `CANOPY_RUN` m, under him
 * and under the wing tips.
 */
function corridor(field: HeightField, x: number, y: number, z: number, fx: number, fz: number, land: (x: number, z: number) => number, crowns: (x: number, z: number) => number): number {
  const L = RAMP.length;
  const a = ROAM_AREA;
  let clear = Infinity;
  // (the middle first: most fail there)
  for (const v of [0, -CORRIDOR, CORRIDOR]) {
    // (the wing tips ride ~3 m over his feet)
    const tips = v === 0 ? 0 : 3;
    for (let u = L + 2; u <= L + CLEAR_RUN; u += 3) {
      const d = u - L;
      // (the glider sinks about a metre in twelve)
      const sink = d / 12;
      const px = x + fx * u + fz * v;
      const pz = z + fz * u - fx * v;
      if (px <= a.x0 || px >= a.x1 || pz <= a.z0 || pz >= a.z1) return -1;
      const under = y - Math.max(land(px, pz), field.waterAt(px, pz) ?? -Infinity);
      if (under < Math.min(MIN_CLEAR, 1 + d * 0.6) + sink - tips) return -1;
      if (d <= CANOPY_RUN && y - crowns(px, pz) < 2 + sink - tips) return -1;
      if (v === 0) clear = Math.min(clear, under);
    }
  }
  return clear;
}

/** Top of the jungle at (x, z) as it may grow (m): the land, and a crown's height where a tree could stand. */
function canopy(field: HeightField, x: number, z: number): number {
  return field.heightAt(x, z) + (field.isFree(x, z) ? TREE_TOP : 0);
}

/** Which mesa or mountain (layout.ts) a point is on: the one whose outline it is deepest inside. */
function regionOf(x: number, z: number): string {
  let best = '';
  let bestD = Infinity;
  for (const p of PLATEAUS) {
    const d = outline(p, x, z);
    if (d < bestD) {
      bestD = d;
      best = regionName(p);
    }
  }
  return best;
}

/** A point is inside the outline of no mesa or mountain but `region`'s. */
function alone(x: number, z: number, region: string): boolean {
  return PLATEAUS.every((p) => regionName(p) === region || outline(p, x, z) >= 1);
}

/** How far out on a mesa's outline a point is (under 1 inside it). */
function outline(p: Plateau, x: number, z: number): number {
  const c = Math.cos(p.rot ?? 0);
  const s = Math.sin(p.rot ?? 0);
  const dx = x - p.x;
  const dz = z - p.z;
  return Math.hypot((dx * c + dz * s) / p.rx, (-dx * s + dz * c) / p.rz);
}

/** (the summit's three tiers count as one) */
const regionName = (p: Plateau) => (p.name.startsWith('summit') ? 'summit' : p.name);

/** A point in a camera's view: how far right and up of its line of sight (per metre along it), and how far along it (m). */
function sight(v: MapView, x: number, y: number, z: number): [number, number, number] {
  const dx = x - v.pos[0];
  const dy = y - v.pos[1];
  const dz = z - v.pos[2];
  const d = Math.max(1, dx * v.fwd[0] + dy * v.fwd[1] + dz * v.fwd[2]);
  return [(dx * v.right[0] + dz * v.right[2]) / d, (dx * v.up[0] + dy * v.up[1] + dz * v.up[2]) / d, d];
}

/** The temples as the map's cameras see them (the overview every one, a close-up its own): where in the view, and how near. */
const SIGHTS = MAP_VIEWS.flatMap((view, vi) =>
  PLACES.filter((_, pi) => vi === 0 || vi === pi + 1).map((p) => {
    const t = { view, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, near: Infinity };
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        for (const h of [0, TEMPLE_H]) {
          const [x, y, d] = sight(view, p.x + sx * p.pad[0] * TEMPLE_GROW, p.y + h, p.z + sz * p.pad[1] * TEMPLE_GROW);
          t.x0 = Math.min(t.x0, x);
          t.x1 = Math.max(t.x1, x);
          t.y0 = Math.min(t.y0, y);
          t.y1 = Math.max(t.y1, y);
          t.near = Math.min(t.near, d);
        }
    return t;
  }),
);

/** A ramp's mast and flag would stand in front of a temple, seen from one of the map's cameras. */
function hidesTemple(s: LaunchSpot): boolean {
  for (const t of SIGHTS) {
    const [x, y0, d] = sight(t.view, s.x, s.y, s.z);
    if (d >= t.near) continue;
    const [, y1] = sight(t.view, s.x, s.y + RAMP.mast.height + 1, s.z);
    // (the flag streams out a few metres from the mast, either way as the camera sees it)
    const reach = (FLAG.width + 3) / d;
    if (x + reach > t.x0 && x - reach < t.x1 && Math.max(y0, y1) > t.y0 && Math.min(y0, y1) < t.y1) return true;
  }
  return false;
}

/**
 * How far the explorer walks from the road to each cell of the land (m, in
 * steps of a cell; −1 where he cannot get to): he hops up and down steps of
 * up to `STEP` (one land block), no higher, so there is always a way back
 * the way he came; deep water stops him. He leaves the road where the land
 * beside it is within a step of its paving, or of the top of its side wall
 * (road/line.ts, road/stone.ts: its staircases stand out from the cliffs on
 * walls, its bridges cross the rivers between parapets), and at its ends.
 */
function walkFromRoad(f: HeightField): Float32Array {
  const { nx, nz } = f;
  const n = nx * nz;
  const dist = new Float32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  // What he stands on in each cell: the ground; NaN in deep water and under the road (he walks along it, not across its cells).
  const floor = new Float32Array(n);
  for (let c = 0; c < n; c++) floor[c] = f.water[c] > f.height[c] + 0.8 ? NaN : f.height[c];
  const net = buildRoadNetwork(f);
  const across = (st: Station, v: number, u = 0) => f.index(st.x + st.tz * v + st.tx * u, st.z - st.tx * v + st.tz * u);
  for (const road of net.roads)
    for (const st of road.stations)
      for (const v of [-2.4, -1.2, 0, 1.2, 2.4]) {
        const c = across(st, v);
        if (c >= 0) floor[c] = NaN;
      }
  // Off the road: over the paving's edge or its wall onto the land beside, or on past its ends.
  const leave = (c: number, top: number) => {
    if (c >= 0 && dist[c] < 0 && Math.abs(floor[c] - top) <= STEP) {
      dist[c] = 0;
      queue[tail++] = c;
    }
  };
  for (const road of net.roads) {
    const st = road.stations;
    for (const s of st) {
      if (s.kind === KIND.gate) continue;
      for (const side of [1, -1]) {
        const wall = sideInfo(f, s, side);
        leave(across(s, side * (WALL_V + 1.25)), wall.wall ? wall.top : s.h + LIFT);
      }
    }
    leave(across(st[0], 0, -3.5), st[0].h + LIFT);
    leave(across(st[st.length - 1], 0, 3.5), st[st.length - 1].h + LIFT);
  }
  const visit = (m: number, h: number, d: number) => {
    if (dist[m] < 0 && Math.abs(floor[m] - h) <= STEP) {
      dist[m] = d;
      queue[tail++] = m;
    }
  };
  while (head < tail) {
    const c = queue[head++];
    const i = c % nx;
    const h = floor[c];
    const d = dist[c] + CELL;
    if (i > 0) visit(c - 1, h, d);
    if (i < nx - 1) visit(c + 1, h, d);
    if (c >= nx) visit(c - nx, h, d);
    if (c < n - nx) visit(c + nx, h, d);
  }
  return dist;
}
/** (the explorer's hop, walker.ts `HOP_UP`) */
const STEP = 2.2;
