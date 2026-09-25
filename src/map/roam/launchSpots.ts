import { Group, Quaternion, Vector3 } from 'three';
import { CELL, SURFACE, type HeightField } from '../heightfield';
import { PLACES, PLATEAUS } from '../layout';
import { ROAM_AREA } from '../terrain/views';
import { GLIDER, Glider } from './_gliderModel';
import { buildLaunchRamp, RAMP, rampDeckY } from './_launchRamp';
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
 * can walk there from the road (steps up to 2 m), and the first 150 m of the
 * flight stay well over the land (the treetops too, near the cliff). The
 * best (high, a deep drop, a short walk, looking over the temples), far
 * apart and a couple per mesa at most, get a ramp.
 *
 * `reserveLaunchSpots` (main.ts, before the jungle is planted) keeps the
 * trees off them; without it only spots with no tree round them are used.
 *
 * The ramps are walkable: `deckAt` gives their deck height, and roam.ts
 * lays it over the walk map.
 */

export interface LaunchSpot {
  /** Back end of the ramp (m): the ground there, and the heading of the take-off (radians, 0 = toward +z). */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** How far the land drops under the flight (m), for the report. */
  drop: number;
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
  /** Every frame: lanterns and windsocks; a glider comes back to its ramp once the explorer is well away. */
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
  const list = pre ? pre.map((s) => settle(field, world, s)).filter((s) => s !== null) : findSpots(field, world);
  const object = new Group();
  object.name = 'roam:launchSpots';
  let blocks = 0;
  const ramps: { spot: LaunchSpot; update(night: number, t: number): void; glider: Glider; taken: boolean }[] = [];
  const q = new Quaternion();
  const p = new Vector3();
  for (const [i, spot] of list.entries()) {
    const ramp = buildLaunchRamp(i + 1);
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
        if (Math.abs(y - (s.y + rampDeckY(Math.max(0, u)))) < 2.5) return s;
      }
      return null;
    },
    deckAt(x, z) {
      let top = -Infinity;
      for (const s of list) {
        const [u, v] = local(s, x, z);
        if (u < 0 || u > RAMP.length || Math.abs(v) > RAMP.width / 2) continue;
        top = Math.max(top, s.y + rampDeckY(u));
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
  console.info(`[map] launch spots: ${list.length} (${list.map((s) => `${s.x.toFixed(0)},${s.z.toFixed(0)} ↑${s.y.toFixed(0)}m yaw ${Math.round((s.yaw * 180) / Math.PI)}° ↓${s.drop.toFixed(0)}m`).join(' · ')}) in ${(performance.now() - t0).toFixed(0)} ms`);
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
const reserved = new WeakMap<HeightField, LaunchSpot[]>();

/**
 * Find the take-off spots on the land alone and keep the ground round each
 * ramp clear: no tree grows where a parked glider's wings reach (the cells
 * are marked built on, as the landmarks and the road do). Call it after the
 * landmarks and the road are built and before the vegetation is planted
 * (main.ts); `createLaunchSpots` then puts the ramps there. Without it,
 * `createLaunchSpots` looks for spots with no tree trunk round them: few in
 * this jungle.
 */
export function reserveLaunchSpots(field: HeightField): readonly LaunchSpot[] {
  const list = findSpots(field, null);
  const L = RAMP.length;
  for (const s of list) {
    const fx = Math.sin(s.yaw);
    const fz = Math.cos(s.yaw);
    for (let u = -KEEP_BACK - 1; u <= L + 2; u += 1)
      for (let v = -KEEP_SIDE - 1; v <= KEEP_SIDE + 1; v += 1) {
        const px = s.x + fx * u + fz * v;
        const pz = s.z + fz * u - fx * v;
        field.occupy(px, pz, px, pz);
      }
  }
  reserved.set(field, list);
  return list;
}

interface Candidate extends LaunchSpot {
  score: number;
}

/**
 * The best cliff-top take-offs on the land (see the file's note), with
 * `world` (the walk map) checked for anything standing round them (tree
 * trunks, walls, rocks); without it, on the land alone.
 */
function findSpots(field: HeightField, world: RoamWorld | null): LaunchSpot[] {
  const found = candidates(field);
  const out: LaunchSpot[] = [];
  const regions: string[] = [];
  for (const f of found) {
    if (out.length >= MAX_SPOTS) break;
    if (out.some((o) => Math.hypot(o.x - f.x, o.z - f.z) < SPACING)) continue;
    // (spread over the highlands: a couple on each mesa or mountain at most)
    const region = regionOf(f.x, f.z);
    if (regions.filter((r) => r === region).length >= PER_REGION) continue;
    if (world && blocked(field, world, f)) continue;
    out.push({ x: f.x, y: f.y, z: f.z, yaw: f.yaw, drop: f.drop });
    regions.push(region);
  }
  return out;
}

/**
 * A reserved spot where it can go now the trees and the moss are there: as
 * it is, or slid a little along the cliff (inside its clearing) round a moss
 * cushion; null (and a warning) if nowhere.
 */
function settle(field: HeightField, world: RoamWorld, s: LaunchSpot): LaunchSpot | null {
  const fx = Math.sin(s.yaw);
  const fz = Math.cos(s.yaw);
  let why: string | null = null;
  for (const dv of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2]) {
    const t = { ...s, x: s.x + fz * dv, z: s.z - fx * dv };
    if (dv && !fits(field, t.x, t.y, t.z, fx, fz, null)) continue;
    const w = blocked(field, world, t);
    if (!w) return t;
    why ??= w;
  }
  console.warn(`[map] launch spot ${s.x.toFixed(0)},${s.z.toFixed(0)} left out: ${why}`);
  return null;
}

/** What stands in the way of a spot (the walk map): something where the ramp and the parked glider's wings are, or trees too tall ahead; null if nothing. */
function blocked(field: HeightField, world: RoamWorld, s: LaunchSpot): string | null {
  const fx = Math.sin(s.yaw);
  const fz = Math.cos(s.yaw);
  const W = RAMP.width / 2 + 0.3;
  for (let u = -KEEP_BACK; u <= RAMP.length + 2; u += 1)
    for (let v = -KEEP_SIDE; v <= KEEP_SIDE; v += 1) {
      const px = s.x + fx * u + fz * v;
      const pz = s.z + fz * u - fx * v;
      const g = field.heightAt(px, pz);
      const w = world.groundAt(px, pz);
      // (under the deck nothing may poke through it; round it, where the wings are, a moss cushion or a stone is fine)
      const deck = u >= -0.5 && u <= RAMP.length && Math.abs(v) <= W;
      if (g >= s.y - 1 && w > g + (deck ? 0.25 : 1.5)) return `${(w - g).toFixed(1)} m high at ${u},${v} on the ramp`;
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

/** Every take-off that fits on the land, best first. */
function candidates(field: HeightField): Candidate[] {
  const a = ROAM_AREA;
  const L = RAMP.length;
  const { nx, nz, height } = field;
  const walk = walkFromRoad(field);
  // Cells nothing is built on or passes (a pad, the road, a lamp, a river).
  const free = new Uint8Array(nx * nz);
  for (let c = 0; c < free.length; c++) free[c] = field.occupied[c] ? 0 : 1;
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
        // Walked to from the road (steps up to 2 m).
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
        found.push({ x, y, z, yaw, drop: clear, score });
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
    const c = Math.cos(p.rot ?? 0);
    const s = Math.sin(p.rot ?? 0);
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot((dx * c + dz * s) / p.rx, (-dx * s + dz * c) / p.rz);
    if (d < bestD) {
      bestD = d;
      best = p.name.startsWith('summit') ? 'summit' : p.name;
    }
  }
  return best;
}

/**
 * How far the explorer walks from the road to each cell of the land (m, in
 * steps of a cell; −1 where he cannot get to): he climbs steps up to 2 m
 * (a hop) and drops down any height. Water counts at its surface (a boat).
 */
function walkFromRoad(f: HeightField): Float32Array {
  const { nx, nz } = f;
  const n = nx * nz;
  const dist = new Float32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (const p of f.paths)
    for (const s of p.samples) {
      const c = f.index(s.x, s.z);
      if (c >= 0 && dist[c] < 0) {
        dist[c] = 0;
        queue[tail++] = c;
      }
    }
  const top = (c: number) => Math.max(f.height[c], f.water[c]);
  const visit = (m: number, h: number, d: number) => {
    if (dist[m] < 0 && top(m) <= h + 2.2) {
      dist[m] = d;
      queue[tail++] = m;
    }
  };
  while (head < tail) {
    const c = queue[head++];
    const i = c % nx;
    const h = top(c);
    const d = dist[c] + CELL;
    if (i > 0) visit(c - 1, h, d);
    if (i < nx - 1) visit(c + 1, h, d);
    if (c >= nx) visit(c - nx, h, d);
    if (c < n - nx) visit(c + nx, h, d);
  }
  return dist;
}
