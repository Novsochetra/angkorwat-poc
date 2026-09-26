import { Vector3 } from 'three';
import type { MapFrame } from '../types';
import { Actor } from './_actor';
import { dress } from './_kinds';
import { CARRY, POSE } from './_personModel';
import type { Obstacle, Point, Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';
import { Rig, RigDef, type Things } from './_things';

/**
 * Children flying kites (khleng) in the afternoon wind, on the open grass
 * south of the rice paddies by the lake (no trees near, the plots and the
 * lake open to the west): three hold the reels up, their kites high on long
 * strings downwind, bobbing, drifting side to side and now and then
 * swooping and climbing again; a small one runs about between them. The
 * kites are traditional Khmer ones: the khleng ek, a long leaf-shaped sail
 * on a bamboo spine with a hummer bow (the "ek", that sings in the wind)
 * across its top and ribbon tails, in bright colours; one a dark crow kite
 * (khleng kaaek). The wind is the weather's (`f.weather.wind`, `windDir`)
 * over a steady afternoon breeze off the lake; in rain they go home.
 * Laughter now and then (`laugh`, heard far off).
 *
 * From late morning (`clock` 0.86) to dusk (0.2).
 */

/** Where the children stand (m) and the base breeze (blowing towards: north-east, off the lake, over the paddies). */
const SPOTS: [number, number][] = [
  [-250, 112.5],
  [-238.5, 113.5],
  [-226, 112],
];
const RUNNER: [number, number] = [-240, 111];
const BREEZE = 2.3;
/** Kite line length (m), its sag, and the kite's size (drawn). */
const LINE = 38;
const SAG = 0.07;
const KITE_SCALE = 1.7;
/** String segments. */
const SEGS = 8;
/** Out between these clocks (late morning to dusk). */
const FROM = 0.86;
const TO = 0.2;

/** Kite colours: sail, its edge / second colour, the tails. */
const KITES: [number, number, number][] = [
  [0xd83a2a, 0xf2d24a, 0xf2d24a],
  [0xf4f0e2, 0x2a5aa8, 0xd83a2a],
  [0x2a2426, 0xe8e0d0, 0xe0a030],
];

/**
 * A khleng ek (kite space: +y up its spine, +x across, +z towards the flyer; the bridle at the origin):
 * a long leaf-shaped sail, the spine, a bent crossbar, the ek (hummer bow) above the top, two ribbon tails
 * (a part that sways).
 */
function kiteDef(c: [number, number, number]): { def: RigDef; tail: number } {
  const [sail, edge, tails] = c;
  const d = new RigDef();
  d.box([0, 0.05, 0], [0.035, 1.5, 0.035], 0x9a7a4a);
  // The sail: stepped slabs, widest across the shoulders, a point below.
  for (const [y, w, h, col] of [
    [0.55, 0.36, 0.14, edge],
    [0.4, 0.9, 0.16, sail],
    [0.24, 1.2, 0.16, sail],
    [0.08, 1.0, 0.16, edge],
    [-0.08, 0.72, 0.16, sail],
    [-0.24, 0.48, 0.16, sail],
    [-0.4, 0.26, 0.16, edge],
    [-0.55, 0.1, 0.14, sail],
  ] as [number, number, number, number][])
    d.box([0, y, -0.02], [w, h, 0.02], col);
  // Crossbar, bent back at the tips; the ek bow above the top and its string.
  d.box([0, 0.32, 0.02], [1.3, 0.03, 0.03], 0x9a7a4a)
    .box([0.72, 0.36, 0.0], [0.18, 0.03, 0.03], 0x9a7a4a, { rot: [0, 0, 0.4] })
    .box([-0.72, 0.36, 0.0], [0.18, 0.03, 0.03], 0x9a7a4a, { rot: [0, 0, -0.4] })
    .box([0, 0.98, 0.03], [0.9, 0.035, 0.035], 0xc8a868)
    .box([0.52, 0.9, 0.03], [0.2, 0.035, 0.035], 0xc8a868, { rot: [0, 0, 0.7] })
    .box([-0.52, 0.9, 0.03], [0.2, 0.035, 0.035], 0xc8a868, { rot: [0, 0, -0.7] })
    .box([0, 0.84, 0.03], [1.2, 0.01, 0.01], 0xe8e0c8);
  const tail = d.part([0, -0.6, 0]);
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) d.box([sx * 0.08, -0.8 - k * 0.42, -0.02], [0.07, 0.4, 0.01], k % 2 ? edge : tails, { part: tail, rot: [0, 0, sx * 0.08 * (k + 1)] });
  return { def: d, tail };
}

interface Flyer {
  a: Actor;
  x: number;
  z: number;
  kite: Rig;
  tail: number;
  line: number;
  /** Their own clock offset, and when their next swoop is. */
  seed: number;
  swoopAt: number;
  pos: Vector3;
}

const H = new Vector3();

export class KiteKids implements PeopleScene {
  readonly name = 'kites';
  readonly actors: Actor[] = [];
  private readonly flyers: Flyer[] = [];
  private readonly runner: Actor;
  private readonly things: Things;
  private readonly pace = new Pace(220, 480);
  private shown = false;
  private laughAt = 0;

  constructor(private readonly env: PeopleEnv) {
    const { crowd, ground, things } = env;
    this.things = things;
    SPOTS.forEach(([x, z], k) => {
      const a = new Actor(crowd, dress('kid', 901 + k * 2, { carry: CARRY.kite }), ground).avoid(env.traffic, this.name);
      const { def, tail } = kiteDef(KITES[k]);
      const kite = new Rig(things, def);
      const line = things.alloc(SEGS);
      for (let s = 0; s < SEGS; s++) things.paint(line + s, 0xeee8d8);
      this.actors.push(a);
      this.flyers.push({ a, x, z, kite, tail, line, seed: k * 2.7, swoopAt: 15 + k * 11, pos: new Vector3() });
    });
    this.runner = new Actor(crowd, dress('kid', 907, { young: true }), ground).avoid(env.traffic, this.name);
    this.actors.push(this.runner);
  }

  update(dt: number, now: number, f: MapFrame, _ex: Obstacle | null): void {
    const out = (f.clock >= FROM || f.clock < TO) && f.weather.rain < 0.25 && f.night < 0.45;
    const step = this.pace.step(dt, viewDist(f, SPOTS[1][0], SPOTS[1][1]));
    if (!out || step < 0) {
      this.hide();
      return;
    }
    if (step === 0 && this.shown) return;
    dt = step;
    const w = f.weather;
    // The wind at kite height: the weather's, over a steady breeze off the lake.
    const strong = Math.min(1, w.wind * 1.4);
    const dir = strong > 0.15 ? w.windDir : BREEZE + 0.25 * Math.sin(now * 0.011);
    const wx = Math.sin(dir);
    const wz = Math.cos(dir);
    for (const fl of this.flyers) this.fly(fl, dt, now, wx, wz, strong, !this.shown);
    this.run(dt, now, !this.shown);
    this.shown = true;
    // Laughter, far off (the small one catching up with someone).
    if (f.dt > 0 && now > this.laughAt) {
      this.laughAt = now + 14 + 18 * frac(Math.sin(now * 91.7) * 4375.5);
      const r = this.runner;
      f.calls.push({ kind: 'laugh', x: r.x, y: r.y + 1.2, z: r.z, gain: 0.8 });
    }
  }

  private fly(fl: Flyer, dt: number, now: number, wx: number, wz: number, strong: number, first: boolean): void {
    const a = fl.a;
    if (first || !a.shown) {
      const y = this.env.ground.at(fl.x, fl.z, 10);
      a.warp(fl.x, Number.isFinite(y) ? y : this.env.ground.field.heightAt(fl.x, fl.z), fl.z, Math.atan2(wx, wz));
      a.show();
      a.carry(1, now);
    }
    // Where the kite is: downwind, high, bobbing and drifting; a swoop now and then.
    const t = now + fl.seed * 10;
    if (now > fl.swoopAt + 6) fl.swoopAt = now + 18 + 20 * frac(Math.sin(fl.seed * 17 + now) * 4375.5);
    const sw = now > fl.swoopAt ? Math.sin(Math.min(1, (now - fl.swoopAt) / 5) * Math.PI) : 0;
    const elev = 0.72 + 0.2 * strong + 0.06 * Math.sin(t * 0.55) - 0.42 * sw;
    const side = 0.22 * Math.sin(t * 0.21) + 0.08 * Math.sin(t * 0.83) + 0.25 * sw * Math.sin(fl.seed + 1);
    const L = LINE * (0.85 + 0.15 * Math.sin(fl.seed));
    const cx = Math.cos(side);
    const sx = Math.sin(side);
    // (downwind turned `side` about the vertical)
    const dx = wx * cx + wz * sx;
    const dz = wz * cx - wx * sx;
    this.env.crowd.handAt(a.i, H);
    const k = fl.pos.set(H.x + dx * L * Math.cos(elev), H.y + L * Math.sin(elev), H.z + dz * L * Math.cos(elev));
    // The kite faces its flyer, leaning back, rocking a little.
    const yaw = Math.atan2(-dx, -dz);
    fl.kite.place(k.x, k.y, k.z, yaw, -0.55 + 0.1 * Math.sin(t * 1.3), 0.18 * Math.sin(t * 0.9) + 0.3 * sw, KITE_SCALE);
    fl.kite.turn(fl.tail, 0.3 * Math.sin(t * 2.1), 0.4 * Math.sin(t * 1.7), 0.25 * Math.sin(t * 2.9));
    fl.kite.write();
    // The line, sagging a little.
    const th = this.things;
    let px = H.x;
    let py = H.y;
    let pz = H.z;
    for (let s = 1; s <= SEGS; s++) {
      const u = s / SEGS;
      const qx = H.x + (k.x - H.x) * u;
      const qy = H.y + (k.y - H.y) * u - SAG * L * 4 * u * (1 - u);
      const qz = H.z + (k.z - H.z) * u;
      th.segment(fl.line + s - 1, px, py, pz, qx, qy, qz, 0.02);
      // (plain assignments: a destructuring swap builds an array every segment, every frame)
      px = qx;
      py = qy;
      pz = qz;
    }
    // The child: facing the kite, reel up, looking up; a few steps back and forth as it swoops.
    const back = 1.2 * sw;
    a.goTo(fl.x - dx * back, fl.z - dz * back, 1.2);
    a.face(Math.atan2(dx, dz));
    a.pose(POSE.stand, now);
    a.carry(1, now);
    a.lookAt(k, now + 1);
    a.step(dt, now);
  }

  /** The small one: runs from one flyer to the next, stops to watch, runs on. */
  private run(dt: number, now: number, first: boolean): void {
    const r = this.runner;
    if (first || !r.shown) {
      const y = this.env.ground.field.heightAt(RUNNER[0], RUNNER[1]);
      r.warp(RUNNER[0], y, RUNNER[1], 0);
      r.show();
    }
    // (`now` can be under 0: a shot's run-up starts before t = 0, and a live page's first frame can be stamped a hair before its start)
    const n = this.flyers.length * 2;
    const k = ((Math.floor(now / 14) % n) + n) % n;
    const target = this.flyers[k < this.flyers.length ? k : n - 1 - k];
    const gx = target.x + 1.6;
    const gz = target.z - 1.2;
    r.goTo(gx, gz, 2.2);
    r.face(r.yawTo(target.x, target.z));
    const p: Point = target.pos;
    r.lookAt(r.dist(gx, gz) < 0.8 ? p : null, now + 1);
    r.pose(r.dist(gx, gz) < 0.8 && Math.sin(now * 0.7) > 0.6 ? POSE.point : POSE.stand, now);
    r.step(dt, now);
  }

  private hide(): void {
    if (!this.shown) return;
    this.shown = false;
    for (const fl of this.flyers) {
      fl.a.hide();
      fl.kite.hide();
      this.things.hide(fl.line, SEGS);
    }
    this.runner.hide();
  }

  report(traffic: Traffic): void {
    for (const a of this.actors) if (a.shown) traffic.add(this.name, a.x, a.y, a.z);
  }
}

function frac(x: number): number {
  return x - Math.floor(x);
}
