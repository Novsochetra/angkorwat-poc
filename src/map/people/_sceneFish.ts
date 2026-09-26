import { Vector3 } from 'three';
import type { HeightField } from '../heightfield';
import { LAKES } from '../layout';
import type { MapFrame } from '../types';
import { Actor } from './_actor';
import { dress } from './_kinds';
import { CARRY, FEAT, PEOPLE_SCALE, POSE, type Look } from './_personModel';
import type { Obstacle, Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';
import { Rig, RigDef, type Things } from './_things';

/**
 * Fishermen with the round cast net (samnanh):
 *
 * - one in a small wooden boat on the great lake, west of the floating
 *   village, and one on the valley river below the River Gate where it runs
 *   calm; the boats drift slowly round their spot, rocking a little;
 * - one standing knee deep in the reed shallows at the village's south end.
 *
 * Each stands a while watching the water, then winds up and throws (the
 * `cast` pose; the flying net follows `crowd.castPhase`): the net leaves his
 * hands, opens into a wide ring in the air, falls flat on the water with a
 * splash (a ring of foam spreading, drops flung up; the sound `netSplash`),
 * sinks, and he hauls it in by its line, slowly, and it is back folded in
 * his hand. At night the river and the shallows are empty; the lake boat
 * stays out with a lantern on a pole at its stern.
 *
 * Shots: `fish=<s>` puts every fisherman `s` seconds into a throw (4.4: the
 * net leaves the hands, 5.3: it lands; 6‥20 the haul).
 */

/** Seconds of a cast cycle when the net leaves the hands, and its flight. */
const THROW = 4.4;
const FLIGHT = 0.9;
/** The net sinks (s), the foam ring spreads (s), the haul (s). */
const SINK = 0.6;
const RING = 1.8;
const HAUL = 12;
/** Standing, watching the water between throws (s). */
const WAIT: [number, number] = [14, 30];
/** How far ahead the net lands, its open radius, the arc's height (m, drawn). */
const REACH = 4.2;
const OPEN = 2.1;
const ARC = 2.4;
/** Net: radial lines, ring bits; the foam ring's bits; drops. */
const SPOKES = 10;
const RIM = 10;
const FOAM = 16;
const DROPS = 6;
/** A still's people clock runs this far from their first step to the picture (index.ts: `PREROLL`, `REACT`, 30 frames). */
const SHOT_SPAN = 10.1;
/** Dark enough for the river and the shallows to be empty; for the lantern (`night`). */
const HOME = 0.58;
const LAMP = 0.35;

// ── The boat: a small dugout of teak, a red band under the gunwale (as the explorer's), at true size ──

const TEAK = 0x8f532b;
const TEAK_DARK = 0x6e3f20;
const CAP = 0xc08652;
const PLANK = 0x5c3419;
const RED = 0xa8352a;
const WICKER = 0xa8864a;

/** Where the fisherman stands in the boat (boat space, m) and the lantern's box. */
const DECK: [number, number, number] = [0, -0.04, 0.3];
const LANTERN_BOX = 13;

function boatDef(): RigDef {
  const d = new RigDef();
  d.box([0, -0.11, 0], [0.56, 0.12, 3.3], TEAK_DARK)
    .box([0, -0.07, 0], [0.64, 0.04, 2.9], PLANK)
    .box([0.37, 0.08, 0], [0.09, 0.32, 3.0], TEAK)
    .box([-0.37, 0.08, 0], [0.09, 0.32, 3.0], TEAK)
    .box([0.385, 0.255, 0], [0.13, 0.04, 3.0], CAP)
    .box([-0.385, 0.255, 0], [0.13, 0.04, 3.0], CAP)
    .box([0.422, 0.17, 0], [0.012, 0.06, 2.9], RED)
    .box([-0.422, 0.17, 0], [0.012, 0.06, 2.9], RED)
    // Bow rising to a post, the stern.
    .box([0, 0.12, 1.66], [0.42, 0.38, 0.36], TEAK)
    .box([0, 0.42, 1.9], [0.14, 0.34, 0.2], CAP)
    .box([0, 0.1, -1.66], [0.42, 0.32, 0.34], TEAK)
    .box([0, 0.3, -1.86], [0.12, 0.2, 0.16], CAP)
    // The lantern's pole at the stern and its glass (glows at night: box LANTERN_BOX).
    .box([0.26, 0.55, -1.45], [0.04, 1.1, 0.04], TEAK_DARK)
    .box([0.26, 1.02, -1.45], [0.13, 0.17, 0.13], 0xffb35c)
    // A thwart, a fish basket, a pole lying along the bottom.
    .box([0, 0.14, -0.7], [0.7, 0.05, 0.2], CAP)
    .box([0.14, 0.06, -1.15], [0.3, 0.26, 0.3], WICKER)
    .box([-0.2, 0.0, 0.2], [0.05, 0.05, 2.3], TEAK_DARK);
  return d;
}

/** The thrown net, its line, the foam ring and the drops: loose boxes in the things. */
class NetThrow {
  readonly base: number;
  private shown = false;
  /** Started (s, the people's clock), where from and to (m), the water. */
  t0 = -1e9;
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private water = 0;
  private boat = new Vector3();

  constructor(private readonly things: Things) {
    const n = SPOKES + RIM + 1 + FOAM + DROPS;
    this.base = things.alloc(n);
    for (let k = 0; k < SPOKES + RIM; k++) things.paint(this.base + k, k < SPOKES ? 0xd8d2c0 : 0x5a5a58);
    things.paint(this.base + SPOKES + RIM, 0xd8ccb0);
    for (let k = 0; k < FOAM + DROPS; k++) things.paint(this.base + SPOKES + RIM + 1 + k, 0xeef2ee);
  }

  /** The net leaves the hands at `from` towards `to` on the water at `water` (heading back to `boat` in the haul). */
  throw(now: number, from: Vector3, to: Vector3, water: number, boat: Vector3): void {
    this.t0 = now;
    this.from.copy(from);
    this.to.copy(to);
    this.water = water;
    this.boat.copy(boat);
  }

  /** Where the net is now, and whether it is back in the hands. */
  get done(): boolean {
    return this.t0 < -1e8;
  }

  /** Once a frame: the net, the line from `hand`; returns true the moment it lands. */
  update(now: number, hand: Vector3, boat: Vector3): boolean {
    const a = now - this.t0;
    const th = this.things;
    const b = this.base;
    if (a < 0 || a > FLIGHT + HAUL) {
      this.t0 = -1e9;
      if (this.shown) th.hide(b, SPOKES + RIM + 1 + FOAM + DROPS);
      this.shown = false;
      return false;
    }
    this.shown = true;
    const landed = a >= FLIGHT;
    // The apex (where the line ties on) and the rim.
    let cx: number;
    let cy: number;
    let cz: number;
    let r: number;
    let h: number;
    let rimY: number;
    if (!landed) {
      const u = a / FLIGHT;
      cx = this.from.x + (this.to.x - this.from.x) * u;
      cz = this.from.z + (this.to.z - this.from.z) * u;
      cy = this.from.y + (this.water - this.from.y) * u + ARC * 4 * u * (1 - u);
      r = 0.25 + (OPEN - 0.25) * smooth(0, 0.75, u);
      h = 0.7 - 0.35 * u;
      rimY = cy - h;
    } else {
      // (flat on the water, sinking; then hauled in under the surface towards the boat)
      const s = a - FLIGHT;
      const k = smooth(SINK, HAUL, s);
      cx = this.to.x + (boat.x - this.to.x) * k;
      cz = this.to.z + (boat.z - this.to.z) * k;
      cy = this.water + 0.3 - Math.min(0.6, s * 0.9);
      r = OPEN * (1 - 0.85 * k);
      h = 0.3;
      rimY = this.water - Math.min(0.5, s * 0.8);
    }
    const sink = landed && a - FLIGHT > SINK;
    for (let k = 0; k < RIM; k++) {
      const p0 = (k / RIM) * Math.PI * 2;
      const p1 = ((k + 1) / RIM) * Math.PI * 2;
      if (sink) {
        th.hide(b + k, 1);
        th.hide(b + SPOKES + k, 1);
        continue;
      }
      th.segment(b + k, cx, cy, cz, cx + Math.sin(p0) * r, rimY, cz + Math.cos(p0) * r, 0.035);
      th.segment(b + SPOKES + k, cx + Math.sin(p0) * r, rimY, cz + Math.cos(p0) * r, cx + Math.sin(p1) * r, rimY, cz + Math.cos(p1) * r, 0.07);
    }
    // The line from the hand to the apex (to the water's surface while under it).
    th.segment(b + SPOKES + RIM, hand.x, hand.y, hand.z, cx, Math.max(cy, this.water + 0.02), cz, 0.025);
    // Foam ring and drops, from the landing.
    const g = a - FLIGHT;
    const f0 = b + SPOKES + RIM + 1;
    if (g >= 0 && g < RING) {
      const R = OPEN * (1.05 + 0.8 * g);
      const w = 0.16 * (1 - g / RING) ** 1.5;
      for (let k = 0; k < FOAM; k++) {
        const p = (k / FOAM) * Math.PI * 2 + 0.2;
        // (the bits along the ring, a little ragged: the foam of the splash spreading and thinning)
        const rr = R * (1 + 0.04 * Math.sin(k * 2.3));
        th.put(f0 + k, this.to.x + Math.sin(p) * rr, this.water + 0.02, this.to.z + Math.cos(p) * rr, w, 0.02, ((Math.PI * 2 * R) / FOAM) * 0.92, p + Math.PI / 2);
      }
    } else th.hide(f0, FOAM);
    if (g >= 0 && g < 0.55) {
      for (let k = 0; k < DROPS; k++) {
        const p = (k / DROPS) * Math.PI * 2 + 0.7;
        const out = OPEN * 0.9 + 1.4 * g;
        const y = this.water + 2.6 * g - 4.9 * g * g;
        const s = 0.09 * (1 - g / 0.55);
        th.put(f0 + FOAM + k, this.to.x + Math.sin(p) * out, Math.max(this.water, y), this.to.z + Math.cos(p) * out, s, s, s);
      }
    } else th.hide(f0 + FOAM, DROPS);
    return landed && a - FLIGHT < 0.05;
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

interface Fisher {
  name: string;
  a: Actor;
  looks: [Look, Look];
  boat: Rig | null;
  /** Middle of the drift (m), the water there, the boat's heading. */
  x: number;
  z: number;
  water: number;
  yaw: number;
  /** Drift (m along, across) and its pace. */
  drift: [number, number];
  state: 'wait' | 'cast' | 'haul';
  until: number;
  net: NetThrow;
  /** Out at night (with a lantern). */
  night: boolean;
  pace: Pace;
  n: number;
  lamp: boolean;
  /** (a shot, `fish=`: the net went out before the first step, at this time) */
  pending: number | null;
}

const V = new Vector3();
const H = new Vector3();
const B = new Vector3();

export class Fishermen implements PeopleScene {
  readonly name = 'fish';
  readonly actors: Actor[] = [];
  private readonly fishers: Fisher[] = [];
  private started = false;

  constructor(private readonly env: PeopleEnv) {
    const { crowd, ground, things } = env;
    const field = ground.field;
    const lake = LAKES[0];
    const add = (name: string, seed: number, at: { x: number; z: number; water: number; yaw: number }, boat: boolean, night: boolean, drift: [number, number]) => {
      const withNet = dress('fisherman', seed);
      const without: Look = { ...withNet, feats: withNet.feats.filter((f) => f !== FEAT.net), carry: CARRY.none };
      const a = new Actor(crowd, withNet, ground);
      this.actors.push(a);
      this.fishers.push({
        name,
        a,
        looks: [withNet, without],
        boat: boat ? new Rig(things, boatDef()) : null,
        ...at,
        drift,
        state: 'wait',
        until: 0,
        net: new NetThrow(things),
        night,
        pace: new Pace(170, boat ? 480 : 380),
        n: this.fishers.length,
        lamp: false,
        pending: null,
      });
    };
    // The great lake, west of the floating houses (off the race lane), heading along the shore.
    add('lake', 501, { x: -392, z: 42, water: lake.level, yaw: 0.35 }, true, true, [5, 3]);
    // The valley river below the River Gate: along its flow.
    const river = riverAt(field, -19.5, 92);
    add('river', 507, { x: river.x, z: river.z, water: river.level, yaw: Math.atan2(river.dir[0], river.dir[1]) }, true, false, [3, 0.8]);
    // Knee deep in the reed shallows at the village's south end, facing the open water.
    const shallow = shallowsNear(field, -366, 88, lake.level);
    add('shallows', 511, { x: shallow.x, z: shallow.z, water: lake.level, yaw: -Math.PI / 2 - 0.3 }, false, false, [0, 0]);
  }

  update(dt: number, now: number, f: MapFrame, _ex: Obstacle | null): void {
    const q = this.env.params.get('fish');
    if (!this.started) {
      this.started = true;
      const crowd = this.env.crowd;
      for (const s of this.fishers) {
        const c = crowd.castPhase(s.a.i, now);
        if (q === null) {
          s.until = now + 2 + 9 * s.n + (6 - c);
          continue;
        }
        // (a still: the picture is `fish=` seconds into a throw; its cast starts at T0)
        const T0 = now + SHOT_SPAN - (Number(q) || 0);
        if (T0 >= now) {
          // (the shader's cycle lined up with it: its top at T0)
          const seed = frac(s.a.look.seed - c / 6 - (T0 - now) / 6);
          s.looks = [{ ...s.looks[0], seed }, { ...s.looks[1], seed }];
          s.a.look = s.looks[0];
          crowd.dress(s.a.i, s.a.look);
          s.until = T0;
        } else {
          s.state = 'haul';
          s.pending = T0 + THROW;
          this.dressAs(s, 1);
        }
      }
    }
    for (const s of this.fishers) {
      const out = f.night < HOME || s.night;
      const step = s.pace.step(dt, viewDist(f, s.x, s.z));
      if (!out || step < 0) {
        if (s.a.shown) s.a.hide();
        s.boat?.hide();
        s.net.update(-1e9, H, B);
        continue;
      }
      if (step === 0 && s.a.shown) continue;
      this.fisher(s, step, now, f);
    }
  }

  private dressAs(s: Fisher, k: 0 | 1): void {
    if (s.a.look === s.looks[k]) return;
    s.a.look = s.looks[k];
    this.env.crowd.dress(s.a.i, s.a.look);
  }

  private throwNet(s: Fisher, t0: number, f: MapFrame): void {
    const a = s.a;
    this.env.crowd.handAt(a.i, H);
    const k = PEOPLE_SCALE;
    V.set(a.x + Math.sin(a.yaw) * REACH * (k / 1.4), s.water, a.z + Math.cos(a.yaw) * REACH * (k / 1.4));
    B.set(a.x, s.water, a.z);
    s.net.throw(t0, H, V, s.water, B);
    void f;
  }

  private fisher(s: Fisher, dt: number, now: number, f: MapFrame): void {
    const a = s.a;
    const c = this.env.crowd;
    // ── Where he is: in the drifting, rocking boat, or standing in the shallows ──
    const t = now + s.n * 97;
    if (s.boat) {
      const along = s.drift[0] * Math.sin((t / 310) * Math.PI * 2);
      const across = s.drift[1] * Math.sin((t / 230) * Math.PI * 2 + 1);
      const yaw = s.yaw + 0.35 * Math.sin((t / 420) * Math.PI * 2);
      const x = s.x + Math.sin(s.yaw) * along + Math.cos(s.yaw) * across;
      const z = s.z + Math.cos(s.yaw) * along - Math.sin(s.yaw) * across;
      // (rocking more for a moment after a throw)
      const kick = Math.max(0, 1 - (now - s.net.t0 - 0.2) / 3) * (s.net.t0 > -1e8 ? 1 : 0);
      const roll = 0.03 * Math.sin(t * 0.7) + 0.05 * kick * Math.sin((now - s.net.t0) * 5);
      const pitch = 0.015 * Math.sin(t * 0.9 + 1);
      // (riding high enough that the water's plane never shows through the floor)
      const y = s.water + 0.1 + 0.025 * Math.sin(t * 1.1);
      s.boat.place(x, y, z, yaw, pitch, roll, PEOPLE_SCALE).write();
      // (the lantern lit at night)
      const lamp = f.night > LAMP;
      if (lamp !== s.lamp) {
        s.lamp = lamp;
        s.boat.paint(LANTERN_BOX, lamp ? 0xffb35c : 0x8a6a3a, lamp ? 1 : 0);
      }
      s.boat.point(DECK[0], DECK[1], DECK[2], V);
      // (he stands facing over the left side: he throws off the side)
      a.ride(V.x, V.y, V.z, yaw + Math.PI / 2);
    } else {
      const y = this.env.ground.field.heightAt(s.x, s.z);
      a.ride(s.x, Number.isFinite(y) ? y : s.water - 0.6, s.z, s.yaw);
    }
    if (!a.shown) {
      a.show();
      a.carry(1, now);
    }
    // ── Watch, throw, haul ──
    const phase = c.castPhase(a.i, now);
    if (s.state === 'wait') {
      a.pose(POSE.stand, now);
      a.carry(1, now);
      a.lookAt({ x: a.x + Math.sin(a.yaw) * 6, y: s.water, z: a.z + Math.cos(a.yaw) * 6 });
      // (the throw starts at the top of the shader's cycle)
      if (now >= s.until && phase < 0.4) {
        s.state = 'cast';
        s.until = now - phase;
        a.pose(POSE.cast, now);
        a.lookAt(null);
      }
    } else if (s.state === 'cast') {
      const u = now - s.until;
      if (u >= THROW && s.net.done) {
        this.throwNet(s, now, f);
        this.dressAs(s, 1);
      }
      if (u >= THROW + 1.25) {
        s.state = 'haul';
        a.pose(POSE.stand, now);
        a.carry(0, now);
      }
    } else if (s.net.done) {
      // (the net is back in his hand, folded)
      this.dressAs(s, 0);
      s.state = 'wait';
      s.until = now + WAIT[0] + (WAIT[1] - WAIT[0]) * frac(Math.sin(now * 12.9898 + s.n) * 43758.55);
    } else a.lookAt({ x: a.x + Math.sin(a.yaw) * 4, y: s.water, z: a.z + Math.cos(a.yaw) * 4 });
    a.step(dt, now);
    if (s.pending !== null) {
      this.throwNet(s, s.pending, f);
      s.pending = null;
    }
    // The net: from his right hand.
    c.handAt(a.i, H);
    B.set(a.x, s.water, a.z);
    if (s.net.update(now, H, B) && f.dt > 0) f.calls.push({ kind: 'netSplash', x: V.x, y: s.water, z: V.z, gain: 1 });
  }

  report(traffic: Traffic): void {
    // (the one in the shallows stands where the explorer may wade)
    const s = this.fishers[2];
    if (s?.a.shown) traffic.add(this.name, s.a.x, s.a.y, s.a.z);
  }
}

function frac(x: number): number {
  return x - Math.floor(x);
}

/** The river sample nearest (x, z): the calm water there. */
function riverAt(field: HeightField, x: number, z: number): { x: number; z: number; level: number; dir: [number, number] } {
  let best = { x, z, level: 5, dir: [0, 1] as [number, number] };
  let bd = Infinity;
  for (const r of field.rivers)
    for (const s of r.samples) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) {
        bd = d;
        best = { x: s.x, z: s.z, level: s.level, dir: s.dir };
      }
    }
  return best;
}

/** The point nearest (x, z) with water 0.4‥0.8 m deep (the reed shallows), searched in a small square. */
function shallowsNear(field: HeightField, x: number, z: number, level: number): { x: number; z: number } {
  let best = { x, z };
  let bd = Infinity;
  for (let dz = -16; dz <= 16; dz += 1)
    for (let dx = -16; dx <= 16; dx += 1) {
      const px = x + dx;
      const pz = z + dz;
      const w = field.waterAt(px, pz);
      if (w === null) continue;
      const depth = level - field.heightAt(px, pz);
      if (depth < 0.4 || depth > 0.8) continue;
      const d = Math.hypot(dx, dz);
      if (d < bd) {
        bd = d;
        best = { x: px, z: pz };
      }
    }
  return best;
}
