import { Vector3 } from 'three';
import { hash3 } from '../../voxel/random';
import { CH, Flock } from '../fauna/_kit';
import type { HeightField } from '../heightfield';
import { LIFT } from '../road/line';
import type { MapFrame, Subject } from '../types';
import type { WordKey } from '../ui/lang';
import { Actor } from './_actor';
import { Bubble } from './_bubble';
import { CART, RIDER, type CartPoint } from './_cartHook';
import { dress } from './_kinds';
import { OX } from './_ox';
import { PEOPLE_SCALE, POSE } from './_personModel';
import { PERSON_R, type Obstacle, type RoadGraph, type Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';
import { Rig, RigDef } from './_things';

/**
 * An ox cart (rotes ko): a pair of white oxen under one yoke pull a long
 * wooden cart on two tall spoked wheels, a farmer sitting cross-legged at
 * its front, a load of rice straw (harvest and the dry season) or clay pots
 * in the back. It goes slowly from the village along the village trail on
 * the dike between the rice paddies, past the spirit house, onto the valley
 * road's south end below the River Gate; stops there a while, turns round on
 * the grass and goes back; stops by the village shop, turns round, and so
 * on through the day. At night it stands by the village, the oxen dozing.
 *
 * It stops for the explorer (and for anyone else) in its way, the farmer
 * nodding to him; people step round it (it goes into the traffic as an
 * animal, like the elephants). The oxen's bronze bells clonk with their
 * steps and the cart creaks (`oxBell`, `cartCreak`). From dusk a lantern
 * hangs at its front corner, by the farmer.
 *
 * The explorer can ride on its back (roam/_cartRide.ts; they share
 * `_cartHook.ts`): as he climbs on the farmer lets the tailboard down flat for
 * him to sit on and turns round to welcome him aboard (a bubble), says "on we
 * go" as it leaves a stop with him, wishes him well as he hops off; he stays
 * out with the cart at night until he gets down. The cart goes its way at its
 * own pace whoever rides.
 *
 * Shots: `cart=<m>` puts it that far along its round (0 leaving the village,
 * ≈ 202 the far stop, then its turn; ≈ 434 the home stop; 462 m round).
 */

/** Walking pace (m/s), easing (m/s²). */
const SPEED = 0.75;
const EASE = 0.35;
/** Stops at the far end and by the shop (s). */
const STOP_FAR = 30;
const STOP_HOME = 50;
/**
 * The turn at each end, a round loop (radius, m: far, home) about a middle: on the grass west of the valley road's
 * end, and round the village's shade tree (the tamarind on the square, village/_houses.ts `shore`).
 */
const TURN_R: [number, number] = [3.8, 4.2];
const TURN_FAR: [number, number] = [-103.5, 64.5];
const TURN_HOME: [number, number] = [-297, 81];
/** How far the valley road is followed past the trail's end (m). */
const ROAD_ON = 6;
/** The explorer (or anyone) this far ahead in its way, this far across: it stops (m). */
const BLOCK_AHEAD = 5.5;
const BLOCK_ACROSS = 2.2;

/** A disc (x, y, z, r) in the lane ahead of the yoke `y`, heading (tx, tz)? (no allocation: runs each frame) */
function inPath(x: number, oy: number, z: number, r: number, y: { x: number; y: number; z: number }, tx: number, tz: number): boolean {
  if (Math.abs(oy - y.y) > 3) return false;
  const dx = x - y.x;
  const dz = z - y.z;
  const along = dx * tx + dz * tz;
  const across = Math.abs(dx * tz - dz * tx);
  return along > -0.5 && along < BLOCK_AHEAD + r && across < BLOCK_ACROSS + r;
}
/** Dark enough to stand for the night; light enough to go out (`night`). */
const DARK = 0.6;
const LIGHT = 0.5;

// ── The loop it drives: out along the trail, a turn, back, a turn ──

class Loop {
  readonly xs: number[] = [];
  readonly ys: number[] = [];
  readonly zs: number[] = [];
  readonly len: number;
  /** Where the far stop and the home stop are (m along). */
  readonly far: number;
  readonly home: number;

  constructor(pts: [number, number, number][], far: number, home: number) {
    // Resampled every 0.5 m (round the loop: the last point joins the first).
    let next = 0;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay, az] = pts[i];
      const [bx, by, bz] = pts[(i + 1) % pts.length];
      const d = Math.hypot(bx - ax, bz - az);
      let u = next;
      for (; u < d; u += 0.5) {
        const k = u / d;
        this.xs.push(ax + (bx - ax) * k);
        this.ys.push(ay + (by - ay) * k);
        this.zs.push(az + (bz - az) * k);
      }
      next = u - d;
    }
    // (smoothed along the loop over ±2 m: the corners into and out of the turns round off)
    for (const a of [this.xs, this.zs, this.ys]) {
      const src = a.slice();
      const n = src.length;
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = -4; j <= 4; j++) sum += src[(i + j + n) % n];
        a[i] = sum / 9;
      }
    }
    this.len = this.xs.length * 0.5;
    this.far = far;
    this.home = home;
  }

  at(s: number, out: Vector3): Vector3 {
    const n = this.xs.length;
    const f = ((((s / 0.5) % n) + n) % n);
    const i = Math.floor(f);
    const j = (i + 1) % n;
    const k = f - i;
    return out.set(this.xs[i] + (this.xs[j] - this.xs[i]) * k, this.ys[i] + (this.ys[j] - this.ys[i]) * k, this.zs[i] + (this.zs[j] - this.zs[i]) * k);
  }

  wrap(s: number): number {
    return ((s % this.len) + this.len) % this.len;
  }
}

/** The cart's round: from the village end of the village trail, out, round, back, round (and where it stops). */
function buildLoop(field: HeightField, graph: RoadGraph): Loop | null {
  const trail = field.trails.find((t) => t.name === 'village trail');
  if (!trail) return null;
  // (the trail runs from the valley road to the village: out is its reverse; its last metres are in among the houses)
  const out: [number, number, number][] = trail.samples
    .slice(0, trail.samples.length - 9)
    .reverse()
    .map((s) => [s.x, s.y, s.z]);
  const road = graph.net.roads[0].stations;
  for (let i = 0; i < ROAD_ON * 2 && i < road.length; i += 2) out.push([road[i].x, road[i].h + LIFT, road[i].z]);
  const far = out.length;
  // A turn at each end, as a cart turns where the trail ends: off onto the open ground in a round loop
  // about (cx, cz), and back onto its line going the other way.
  const turn = (pts: [number, number, number][], [cx, cz]: [number, number], R: number) => {
    const [bx, , bz] = pts[pts.length - 1];
    // The two tangent points from the trail's end; round the circle keeping its middle on the left.
    const back = Math.atan2(bx - cx, bz - cz);
    const open = Math.acos(Math.min(0.95, R / Math.hypot(bx - cx, bz - cz)));
    const on = (a: number): [number, number] => [cx + Math.sin(a) * R, cz + Math.cos(a) * R];
    let a1 = back - open;
    let a2 = back + open;
    const [t1x, t1z] = on(a1);
    const wx = t1x - bx;
    const wz = t1z - bz;
    if ((cx - t1x) * wz - (cz - t1z) * wx < 0) [a1, a2] = [a2, a1];
    while (a2 <= a1 + Math.PI) a2 += Math.PI * 2;
    const loop: [number, number, number][] = [];
    const n = Math.ceil(((a2 - a1) * R) / 1.5);
    for (let k = 0; k <= n; k++) {
      const [x, z] = on(a1 + ((a2 - a1) * k) / n);
      loop.push([x, field.heightAt(x, z), z]);
    }
    return loop;
  };
  const back = out.slice().reverse();
  // (the way back keeps to the same line: the trail is one cart wide)
  const pts = [...out, ...turn(out, TURN_FAR, TURN_R[0]), ...back];
  const home = pts.length;
  pts.push(...turn(back, TURN_HOME, TURN_R[1]));
  // (stops: m along, measured on the points before resampling at 0.5 m)
  const dist = (n: number) => {
    let d = 0;
    for (let i = 1; i < n; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]);
    return d;
  };
  return new Loop(pts, dist(far) - 1, dist(home) - 1);
}

// ── The cart (true size: the people's scale draws it) ──

const WOOD = 0x8a6038;
const WOOD_DARK = 0x5e3f24;
const WOOD_PALE = 0xa87c4c;
const STRAW = 0xd4b868;
const STRAW_DARK = 0xb09448;
const POT = 0xb0603a;
const POT_DARK = 0x7a3e24;
/** Wheel radius and track (m, true size), the pole's reach to the yoke ahead of the axle. */
const WHEEL_R = 0.66;
const TRACK = 0.74;
const REACH = 3.55;
/** Where the farmer sits (cart space). */
const SEAT: [number, number, number] = [0, 0.96, 1.05];

/** The tailboard's hinge (cart space: the bottom of its back face); let down flat behind for a rider (radians about x). */
const GATE_HINGE: [number, number, number] = [0, 0.87, -1.055];
const GATE_DOWN = -Math.PI / 2;
/** Seconds to let it down or put it up. */
const GATE_TIME = 0.5;

function cartDef(): { def: RigDef; wheels: [number, number]; load: [number, number]; gate: number } {
  const d = new RigDef();
  const wheels: [number, number] = [0, 0];
  [1, -1].forEach((sx, w) => {
    const p = d.part([sx * TRACK, WHEEL_R, 0]);
    wheels[w] = p;
    // Rim: 14 felloes, 7 spokes through the hub, the hub.
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      d.box([sx * TRACK, WHEEL_R + Math.cos(a) * (WHEEL_R - 0.035), Math.sin(a) * (WHEEL_R - 0.035)], [0.07, 0.07, ((Math.PI * 2 * WHEEL_R) / 14) * 1.05], k % 2 ? WOOD : WOOD_DARK, { part: p, rot: [a, 0, 0] });
    }
    for (let k = 0; k < 7; k++) d.box([sx * TRACK, WHEEL_R, 0], [0.035, (WHEEL_R - 0.05) * 2, 0.035], WOOD_PALE, { part: p, rot: [(k / 7) * Math.PI, 0, 0] });
    d.box([sx * TRACK, WHEEL_R, 0], [0.22, 0.17, 0.17], WOOD_DARK, { part: p });
  });
  // Axle; the bed on its bearers; low side rails with posts.
  d.box([0, WHEEL_R, 0], [TRACK * 2 + 0.3, 0.08, 0.08], WOOD_DARK)
    .box([0, 0.86, 0.2], [0.96, 0.07, 2.5], WOOD)
    .box([0.44, 0.8, 0.2], [0.08, 0.1, 2.5], WOOD_DARK)
    .box([-0.44, 0.8, 0.2], [0.08, 0.1, 2.5], WOOD_DARK);
  for (const sx of [1, -1]) {
    d.box([sx * 0.48, 1.08, 0.2], [0.05, 0.05, 2.5], WOOD_PALE);
    for (const z of [-1.0, -0.2, 0.6, 1.4]) d.box([sx * 0.48, 0.97, z], [0.05, 0.22, 0.05], WOOD_DARK);
  }
  // (the tailboard, on its hinge: let down for a rider)
  const gate = d.part(GATE_HINGE);
  d.box([0, 0.97, -1.03], [0.96, 0.2, 0.05], WOOD_DARK, { part: gate });
  // The pole, rising from the bed's front to the yoke, and the yoke across both necks.
  const rise = Math.atan2(1.3 - 0.9, REACH - 1.45);
  d.box([0, 1.1, (1.45 + REACH) / 2], [0.1, 0.1, Math.hypot(REACH - 1.45, 0.4)], WOOD_DARK, { rot: [-rise, 0, 0] })
    .box([0, 1.3, REACH], [1.25, 0.09, 0.11], WOOD_PALE)
    .box([0.44, 1.21, REACH], [0.04, 0.2, 0.04], WOOD_DARK)
    .box([-0.44, 1.21, REACH], [0.04, 0.2, 0.04], WOOD_DARK);
  // The load: straw heaped high and bound (repainted as pots when it carries pots).
  const l0 = d.boxes.length;
  d.box([0, 1.2, -0.25], [0.88, 0.62, 1.5], STRAW)
    .box([0, 1.55, -0.3], [0.7, 0.2, 1.2], STRAW)
    .box([0, 1.3, -0.25], [0.9, 0.06, 1.52], STRAW_DARK)
    .box([0, 1.2, 0.35], [0.86, 0.5, 0.06], STRAW_DARK);
  return { def: d, wheels, load: [l0, d.boxes.length - l0], gate };
}

const LAMP_METAL = 0x34302c;
const LAMP_GLASS = 0xffc35a;
const BAMBOO = 0xb89a5a;
/** The lantern's hook at the end of its arm (cart space): it hangs and swings from there. */
const LAMP_HOOK: [number, number, number] = [0.67, 1.545, 1.4];
/** Lit from this far into the dusk (`night`). */
const LAMP_ON = 0.32;

/**
 * The lantern for the night (a kerosene lamp, changkieng koum): a bamboo pole
 * lashed to the bed's front left post, an arm out over the side, the lamp
 * hanging from it on a short cord (its own part: it swings with the cart).
 */
function lampDef(): { def: RigDef; lamp: number; glass: number } {
  const d = new RigDef();
  d.box([0.48, 1.32, 1.4], [0.035, 0.5, 0.035], BAMBOO).box([0.575, 1.555, 1.4], [0.21, 0.03, 0.03], BAMBOO);
  const lamp = d.part(LAMP_HOOK);
  const [x, , z] = LAMP_HOOK;
  d.box([x, 1.51, z], [0.012, 0.07, 0.012], LAMP_METAL, { part: lamp })
    .box([x, 1.47, z], [0.05, 0.03, 0.05], LAMP_METAL, { part: lamp })
    .box([x, 1.45, z], [0.12, 0.03, 0.12], LAMP_METAL, { part: lamp });
  const glass = d.boxes.length;
  d.box([x, 1.375, z], [0.09, 0.12, 0.09], LAMP_GLASS, { part: lamp, glow: 1 })
    .box([x, 1.305, z], [0.12, 0.025, 0.12], LAMP_METAL, { part: lamp });
  return { def: d, lamp, glass };
}

const P = new Vector3();
const Q = new Vector3();
const A = new Vector3();
const Y = new Vector3();
const H = new Vector3();
/** The farmer's look point (copied by `lookAt`). */
const LOOK = { x: 0, y: 0, z: 0 };

/** Where the rider's head is (cart space, true m: on the let-down tailboard) for the farmer to look at. */
const RIDER_HEAD: [number, number, number] = [0, 2.1, -1.2];
/** The farmer turning round on his seat to the rider behind him (rad: his head turns the rest of the way), and for how long (s). */
const TURN_BACK = 1.75;
const TALK = 3.4;
/** His words over his head this high (m over his seat). */
const SAY_UP = 1.75;

export class OxCart implements PeopleScene {
  readonly name = 'cart';
  readonly actors: Actor[] = [];
  readonly object;
  private readonly loop: Loop | null;
  private readonly flock: Flock;
  private readonly cart: Rig;
  private readonly farmer: Actor;
  private readonly wheels: [number, number];
  private readonly load: [number, number];
  /** The tailboard's part, and how far it is let down (0 up ‥ 1 flat, for a rider). */
  private readonly gate: number;
  private gateDown = 0;
  /** The lantern (shown from dusk) and its hanging part, its glass box. */
  private readonly lamp: Rig;
  private readonly lampPart: number;
  private readonly lampGlass: number;
  /** The farmer's own bubble (his words to the rider), what he says, until when (people's clock), how far he has turned round. */
  private readonly bubble = new Bubble();
  private readonly head = { x: 0, y: 0, z: 0 };
  private readonly headAt = () => this.head;
  private talkUntil = -1e9;
  private turnBack = 0;
  /** The rider's greetings answered (`CART.hello`, `bye`), and whether "on we go" / "night" were said for this stop. */
  private hello = CART.hello;
  private bye = CART.bye;
  private waited = false;
  private nightSaid = false;
  /** Out with the cart at night for a rider (until he is down and gone). */
  private stayOut = false;
  private readonly pace = new Pace(160, 420);
  private s = 0;
  private speed = 0;
  private wait = 0;
  private roll = 0;
  private started = false;
  private night = false;
  private nodAt = -1e9;
  private bellAt = 0;
  private creakAt = 0;
  private pots = false;
  /** The cart and oxen as obstacles for the people (animals: they step round). */
  private readonly obstacles: Obstacle[] = [0, 1, 2].map(() => ({ x: 0, y: 0, z: 0, r: 1.3, vx: 0, vz: 0, who: 'animal' }));
  private readonly vel = { x: 0, z: 0 };

  constructor(private readonly env: PeopleEnv) {
    this.loop = buildLoop(env.ground.field, env.graph);
    this.flock = new Flock(OX, 2);
    this.flock.setup(0, 0, 0.23, 1);
    this.flock.setup(1, 1, 0.71, 1);
    this.object = this.flock.mesh;
    const c = cartDef();
    this.cart = new Rig(env.things, c.def);
    this.wheels = c.wheels;
    this.load = c.load;
    this.gate = c.gate;
    const l = lampDef();
    this.lamp = new Rig(env.things, l.def);
    this.lampPart = l.lamp;
    this.lampGlass = l.glass;
    this.farmer = new Actor(env.crowd, dress('villager', 611, { sex: 'm', hat: 'palm' }), env.ground);
    this.actors.push(this.farmer);
    // (the ride, roam/_cartRide.ts: points of the cart on the map)
    CART.live = false;
    CART.scale = PEOPLE_SCALE;
    CART.pace = SPEED;
    CART.point = (x: number, y: number, z: number, out: CartPoint) => {
      this.cart.point(x, y, z, H);
      out.x = H.x;
      out.y = H.y;
      out.z = H.z;
      return out;
    };
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const loop = this.loop;
    if (!loop) return;
    // (the farmer's words to the rider follow him on the screen every frame)
    this.bubble.update(dt, f.camera, f.roam !== 'overview');
    if (!this.started) {
      this.started = true;
      const q = this.env.params.get('cart');
      this.s = q !== null ? loop.wrap(Number(q) || 0) : loop.wrap(now * SPEED * 0.6 + 120);
      this.speed = SPEED;
      // (a night: standing at home)
      if (q === null && f.night > DARK) {
        this.s = loop.wrap(loop.home + 0.45);
        this.speed = 0;
        this.wait = STOP_HOME;
      }
    }
    const step = this.pace.step(dt, viewDist(f, loop.xs[Math.floor(this.s / 0.5) % loop.xs.length], loop.zs[Math.floor(this.s / 0.5) % loop.zs.length]));
    if (step < 0) {
      this.hide();
      this.flock.flush(now);
      this.flock.mesh.visible = true;
      return;
    }
    if (step === 0 && this.cart.shown) {
      this.flock.flush(now);
      this.flock.mesh.visible = true;
      return;
    }
    dt = step;
    // Night: home by the shop (it drives on to its home stop first), the farmer gone in.
    if (f.night > DARK) this.night = true;
    else if (f.night < LIGHT) this.night = false;
    // ── Where it goes: on round the loop, stopping at the ends and for whoever is in the way ──
    const blocked = this.blocked(ex);
    const toFar = loop.wrap(loop.far - this.s);
    const toHome = loop.wrap(loop.home - this.s);
    const waiting = this.wait > 0;
    let want = SPEED;
    if (this.wait > 0) {
      this.wait -= dt;
      want = 0;
      // (at night it stays at home; from the far end it sets off home at once)
      if (this.night) this.wait = toHome > loop.len - 2 ? Math.max(this.wait, 1) : 0;
    } else if (toFar < 0.4 || toHome < 0.4) {
      // (arrived at a stop: wait there; the load changes at home)
      this.wait = toFar < 0.4 ? STOP_FAR : STOP_HOME;
      this.s = loop.wrap(this.s + 0.45);
      if (toHome < 0.4) this.pots = hash3(Math.floor(now / 100), 3, 9) < 0.5;
      want = 0;
    } else {
      // (slowing into a stop)
      want = Math.min(SPEED, Math.max(0.15, Math.min(toFar, toHome) * 0.4));
      if (this.night) want = Math.min(want, Math.max(0.15, toHome * 0.4));
    }
    if (blocked) want = 0;
    this.speed += Math.max(-EASE * 2 * dt, Math.min(EASE * dt, want - this.speed));
    const ds = this.speed * dt;
    this.s = loop.wrap(this.s + ds);
    this.roll += ds / (WHEEL_R * PEOPLE_SCALE);
    // ── Place the oxen, the cart, the farmer ──
    const k = PEOPLE_SCALE;
    const front = this.s;
    const ahead = loop.at(front + 0.8, P);
    const behind = loop.at(front - 0.8, Q);
    const yawOx = Math.atan2(ahead.x - behind.x, ahead.z - behind.z);
    const yoke = loop.at(front, A);
    // The cart: axle REACH behind the yoke, along the loop (a chord of it), pitched to the yoke's height.
    const axle = loop.at(front - REACH * k, Y);
    const yawCart = Math.atan2(yoke.x - axle.x, yoke.z - axle.z);
    const rx = yoke.x - axle.x;
    const rz = yoke.z - axle.z;
    const reach = Math.sqrt(rx * rx + rz * rz) || 1;
    const pitch = Math.atan2(axle.y - yoke.y, reach) * 0.8;
    // (the pole's end rides at the yoke: the axle comes forward on a tight turn)
    const fx = yoke.x - Math.sin(yawCart) * REACH * k;
    const fz = yoke.z - Math.cos(yawCart) * REACH * k;
    const sway = 0.015 * Math.sin(this.roll * 1.7);
    this.cart.place(fx, axle.y, fz, yawCart, pitch, sway, k);
    this.cart.turn(this.wheels[0], this.roll).turn(this.wheels[1], this.roll);
    // (the tailboard let down flat for a rider to sit on, put up again once he is off: roam/_cartRide.ts)
    const riding = CART.rider !== RIDER.none;
    const gateWant = riding ? 1 : 0;
    this.gateDown = CART.snap ? gateWant : this.gateDown + Math.max(-dt / GATE_TIME, Math.min(dt / GATE_TIME, gateWant - this.gateDown));
    const gd = this.gateDown;
    this.cart.turn(this.gate, GATE_DOWN * gd * gd * (3 - 2 * gd));
    this.cart.write();
    // The lantern from dusk, swinging a little on its cord as the cart rolls, its flame flickering.
    if (f.night > LAMP_ON) {
      const go = Math.min(1, this.speed / SPEED);
      this.lamp.place(fx, axle.y, fz, yawCart, pitch, sway, k);
      this.lamp.turn(this.lampPart, 0.05 * Math.sin(now * 2.2) * go, 0, 0.08 * Math.sin(now * 1.6 + 1) * (0.25 + 0.75 * go) - 0.5 * sway);
      this.lamp.paint(this.lampGlass, LAMP_GLASS, 0.88 + 0.12 * Math.sin(now * 13.1) * Math.sin(now * 7.3));
      this.lamp.write();
    } else this.lamp.hide();
    // (straw in the harvest and dry season, pots the rest of the year)
    this.paintLoad(f.season > 0.62 || f.season < 0.08 ? false : this.pots);
    // The oxen: side by side under the yoke; each one's middle 1.09 m (drawn) behind its neck.
    const walking = this.speed > 0.05;
    const hz = walking ? this.speed / (1.55 * k * 0.5) : 0;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 0.53 : -0.53;
      const x = yoke.x + Math.cos(yawOx) * side * k * 0.75 - Math.sin(yawOx) * 0.78 * k;
      const z = yoke.z - Math.sin(yawOx) * side * k * 0.75 - Math.cos(yawOx) * 0.78 * k;
      const g = this.env.ground.at(x, z, yoke.y);
      this.flock.place(i, x, Number.isFinite(g) ? g : yoke.y, z, yawOx, k);
      this.flock.gait(i, walking ? Math.min(1, this.speed / SPEED) : 0, walking ? hz : 0.5, now);
      // (pulling: heads a little low; standing: they look about, dozing at night)
      this.flock.set(i, CH.head, this.night && !walking ? 1 : walking ? 0.35 : Math.round(10 * 0.1 * Math.sin(now * 0.2 + i * 2)) / 10, now);
      this.flock.set(i, CH.turn, walking ? 0 : Math.round(10 * 0.4 * Math.sin(now * 0.13 + i * 2.1)) / 10, now);
    }
    this.flock.flush(now);
    this.flock.mesh.visible = true;
    // The farmer, sitting cross-legged at the front, nodding to the explorer when the cart waits for him.
    // (at night he has gone in, unless the explorer rides with him: then he stays out until he is down and gone)
    const a = this.farmer;
    const parked = this.night && this.wait > 0 && loop.wrap(loop.home - this.s) > loop.len - 2;
    if (riding && this.night) this.stayOut = true;
    else if (this.stayOut && (!ex || (ex.x - a.x) ** 2 + (ex.z - a.z) ** 2 > 15 * 15 || !this.night)) this.stayOut = false;
    if (this.night && !walking && !this.stayOut) {
      if (a.shown) a.hide();
    } else {
      // (the rider: he turns round on his seat to him and speaks: welcome aboard, on we go, the night, farewell)
      if (a.shown) this.talkToRider(now, waiting, parked);
      const talking = now < this.talkUntil;
      this.turnBack += ((talking ? TURN_BACK : 0) - this.turnBack) * (dt > 0 ? 1 - Math.exp(-dt * 4) : 1);
      this.cart.point(SEAT[0], SEAT[1], SEAT[2], P);
      a.ride(P.x, P.y, P.z, yawCart + this.turnBack);
      if (!a.shown) a.show();
      a.pose(POSE.sit, now);
      const ax = ex ? ex.x - a.x : 0;
      const az = ex ? ex.z - a.z : 0;
      if (talking) {
        this.cart.point(RIDER_HEAD[0], RIDER_HEAD[1], RIDER_HEAD[2], Q);
        LOOK.x = Q.x;
        LOOK.y = Q.y;
        LOOK.z = Q.z;
        a.lookAt(LOOK, now + 0.5);
      } else if (ex && blocked && Math.sqrt(ax * ax + az * az) < 9) {
        if (now - this.nodAt > 30) this.nodAt = now;
        LOOK.x = ex.x;
        LOOK.y = ex.y + 2;
        LOOK.z = ex.z;
        a.lookAt(LOOK, now + 0.5);
      } else a.lookAt(null);
      const u = now - this.nodAt;
      a.tilt(u > 0.4 && u < 1.3 ? 0.7 : 0);
      a.step(dt, now);
      this.head.x = a.x;
      this.head.y = a.y + SAY_UP;
      this.head.z = a.z;
    }
    // ── Sounds: the bells with the oxen's steps, a creak now and then ──
    this.vel.x = (Math.sin(yawOx) * this.speed);
    this.vel.z = (Math.cos(yawOx) * this.speed);
    if (walking && f.dt > 0) {
      this.bellAt -= dt * hz * 2;
      if (this.bellAt <= 0) {
        this.bellAt = 1 + Math.floor(hash3(Math.floor(now * 3), 1, 7) * 2);
        f.calls.push({ kind: 'oxBell', x: yoke.x, y: yoke.y + 1.2, z: yoke.z, gain: 0.6 + 0.4 * hash3(Math.floor(now * 5), 2, 7) });
      }
      this.creakAt -= dt;
      if (this.creakAt <= 0) {
        this.creakAt = 2.2 + 2.5 * hash3(Math.floor(now), 3, 7);
        // (a little softer with him sitting right over it)
        f.calls.push({ kind: 'cartCreak', x: axle.x, y: axle.y + 0.8, z: axle.z, gain: riding ? 0.5 : 0.7 });
      }
    }
    // (for the ride on its back, roam/_cartRide.ts)
    const h = CART;
    h.live = true;
    h.s = this.s;
    h.speed = this.speed;
    h.parked = parked;
    h.yaw = yawCart;
    h.oxYaw = yawOx;
    h.vx = Math.sin(yawCart) * this.speed;
    h.vz = Math.cos(yawCart) * this.speed;
    h.pitch = pitch;
    h.roll = sway;
    h.axle.x = fx;
    h.axle.y = axle.y;
    h.axle.z = fz;
    h.yoke.x = yoke.x;
    h.yoke.y = yoke.y;
    h.yoke.z = yoke.z;
    h.snap = false;
    // (for the people: the pair of oxen and the cart, as three discs)
    const o = this.obstacles;
    o[0].x = yoke.x - Math.sin(yawOx) * 0.9 * k;
    o[0].z = yoke.z - Math.cos(yawOx) * 0.9 * k;
    o[1].x = (yoke.x + axle.x) / 2;
    o[1].z = (yoke.z + axle.z) / 2;
    o[2].x = axle.x;
    o[2].z = axle.z;
    for (const b of o) {
      b.y = yoke.y;
      b.vx = this.vel.x;
      b.vz = this.vel.z;
    }
    o[0].r = 1.25;
    o[1].r = 0.9;
    o[2].r = 1.25;
  }

  private paintLoad(pots: boolean): void {
    const [l0, n] = this.load;
    const colors = pots ? [POT, POT_DARK, POT_DARK, POT] : [STRAW, STRAW, STRAW_DARK, STRAW_DARK];
    for (let i = 0; i < n; i++) this.cart.paint(l0 + i, colors[i]);
  }

  /** Someone in the way ahead (the explorer on foot, people, an animal)? */
  private blocked(ex: Obstacle | null): boolean {
    const loop = this.loop!;
    const k = PEOPLE_SCALE;
    const a = loop.at(this.s + 0.8, P);
    const b = loop.at(this.s - 0.8, Q);
    const tx = (a.x - b.x) / 1.6;
    const tz = (a.z - b.z) / 1.6;
    const y = loop.at(this.s, A);
    if (ex && inPath(ex.x, ex.y, ex.z, ex.r, y, tx, tz)) return true;
    const near = 2.6 * k;
    for (const o of this.env.traffic.list) {
      if (o.who === 'animal' || o.who === 'explorer' || o.who === 'beacon' || o.who === this.name) continue;
      // (people just step aside: only someone right before the oxen stops it)
      if (!inPath(o.x, o.y, o.z, Math.min(o.r, PERSON_R), y, tx, tz)) continue;
      const dx = o.x - y.x;
      const dz = o.z - y.z;
      if (Math.sqrt(dx * dx + dz * dz) < near) return true;
    }
    return false;
  }

  private hide(): void {
    this.cart.hide();
    this.lamp.hide();
    this.flock.hide(0);
    this.flock.hide(1);
    if (this.farmer.shown) this.farmer.hide();
    CART.live = false;
  }

  /**
   * The rider and the farmer (roam/_cartRide.ts): he welcomes him aboard as
   * he climbs on, says "on we go" as the cart leaves a stop with him, tells
   * him the oxen need their rest once it stands for the night, and wishes him
   * well as he hops off: each time he turns round on his seat and says it
   * over his head (`talkUntil`).
   */
  private talkToRider(now: number, waiting: boolean, parked: boolean): void {
    const on = CART.rider === RIDER.riding;
    if (CART.hello !== this.hello) {
      this.hello = CART.hello;
      this.waited = false;
      this.say('cartHello', now);
    } else if (CART.bye !== this.bye) {
      this.bye = CART.bye;
      this.say('cartBye', now);
    } else if (on && parked && !this.nightSaid) {
      this.nightSaid = true;
      this.say('cartNight', now);
    } else if (on && this.waited && !waiting && this.speed > 0.05 && now > this.talkUntil) {
      this.waited = false;
      this.say('cartGo', now);
    }
    if (on && waiting && !parked) this.waited = true;
    if (!on) this.waited = false;
    if (!parked) this.nightSaid = false;
  }

  /** The farmer turns round and says `key` over his head (and nods as he begins). */
  private say(key: WordKey, now: number): void {
    this.talkUntil = now + TALK;
    this.nodAt = now;
    this.bubble.say(key, this.headAt, TALK);
  }

  // (the nature book, roam/_book.ts: the two oxen where they are drawn; read only)
  subjects(out: Subject[]): void {
    const m = this.flock.mesh.instanceMatrix.array;
    for (let i = 0; i < 2; i++) if (this.flock.isShown(i)) out.push({ kind: 'ox', x: m[i * 16 + 12], y: m[i * 16 + 13] + 1, z: m[i * 16 + 14], r: 1.05 });
  }

  report(traffic: Traffic): void {
    if (!this.cart.shown) return;
    for (const o of this.obstacles) traffic.list.push(o);
    if (this.farmer.shown) traffic.add(this.name, this.farmer.x, this.farmer.y, this.farmer.z);
  }
}
