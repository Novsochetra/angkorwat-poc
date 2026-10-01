import { equinoxMorning, FIRST_LIGHT, GATHER, GONE, HALO_END, LEAVE, ON_TOWER, TOWER_TOP } from '../sky/_equinox';
import type { MapFrame } from '../types';
import { Actor } from './_actor';
import { dress } from './_kinds';
import { CARRY, FEAT, POSE, type Look, type Pose } from './_personModel';
import type { Obstacle, Point, Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';
import { Rig, RigDef } from './_things';

/**
 * The dawn crowd of the equinox sunrise (sky/_equinox.ts): on an equinox
 * morning people come up the road's last stair in the dark (`GATHER`) and
 * wait in front of Angkor Wat for the sun to rise behind the central tower:
 * a row sitting along the west reflecting pool's edge (where the towers stand
 * in the water) with more standing behind them, two photographers at their
 * tripods, a few along the causeway's balustrades, three monks sitting on the
 * grass east of the road and a Khmer family on a mat beside them. Waiting,
 * they look at their phones and up at the temple; as the first light comes
 * (`FIRST_LIGHT`) they stand, phones and cameras up toward the tower, and take
 * photos while the sun is on it (the halo: roam/_equinox.ts, with their
 * "ooh"); then they look at what they took, talk a little, and go back down
 * the stair (from `LEAVE`). The road's middle and the causeway's
 * stay free for the explorer.
 *
 * In a still (or a page opened in the middle of it) everyone is already where
 * the clock has them. URL: `equinox=1&clock=0.7` (waiting), `clock=0.76` (the
 * moment), `people=equinox` (only them).
 */

/**
 * The road up to the pad: on the mid tier a little before the last stair (they come and go there), and on the pad
 * past its top. The stair itself (the walk map's) climbs from z −138 (44 m) to −151 (56.25 m), a metre a step, on
 * x ≈ 0‥4: `STAIR_LINE`.
 */
const STAIR: Point[] = [
  { x: 3.0, y: 44.25, z: -133 },
  { x: 2.2, y: 56.25, z: -153.5 },
];
const STAIR_LINE = { z0: -138, y0: 44, z1: -151, y1: 56.25 };
/** Walking pace (m/s): keen to get a place, unhurried going. */
const WALK_IN = 1.15;
const WALK_OUT = 1.05;
/** The longest the way back down may take (s): past it they are gone where they are (held up behind the others, say). */
const OUT_MAX = 100;
/** The tower they face, and the explorer's face (scratch). */
const TOWER: Point = { x: TOWER_TOP.x, y: TOWER_TOP.y - 4, z: TOWER_TOP.z };
/**
 * How far up they look (the head's tilt: its tangent): the tower top stands ≈ 45° over them, more than a head tips
 * back; they look up this much and the eyes do the rest (the photo pose lifts the phone with the head).
 */
const LOOK_UP = 0.36;
const EX_AT: Point = { x: 0, y: 0, z: 0 };

type Role =
  /** Sits on the grass the whole time, looking up (hands on the knees). */
  | 'sit'
  /** Sits waiting, stands up for the sun with the phone up, sits down again after. */
  | 'rise'
  /** Stands with the phone, photos at the moment. */
  | 'stand'
  /** Behind a tripod, the camera to the eye through the moment. */
  | 'tripod'
  /** A monk sitting; the novice stands for a photo with his phone. */
  | 'monk'
  | 'novice';

interface Watcher {
  a: Actor;
  role: Role;
  /** Their place and facing (toward the tower). */
  x: number;
  z: number;
  yaw: number;
  /** When they set out after `GATHER`, react to the light, and leave after `LEAVE` (clock). */
  out: number;
  react: number;
  leave: number;
  state: 'off' | 'in' | 'on' | 'back';
  leg: number;
  /** The way up to their place and back down (made once), and the one they are on. */
  routeIn: Point[];
  routeBack: Point[];
  route: Point[];
  /** Where they look up to (toward the tower, `LOOK_UP` over their eyes). */
  look: Point;
  /** When they set off back (the people's clock, s). */
  since: number;
}

/** A camera on a tripod (rig space: the feet's middle; the lens toward +z). */
function tripod(): RigDef {
  const d = new RigDef();
  const leg = 0x2a2a2e;
  // (three legs splayed from the head, 1.35 m up)
  d.box([0, 0.68, 0.16], [0.04, 1.4, 0.04], leg, { rot: [-0.24, 0, 0] })
    .box([0.14, 0.68, -0.08], [0.04, 1.4, 0.04], leg, { rot: [0.12, 0, 0.21] })
    .box([-0.14, 0.68, -0.08], [0.04, 1.4, 0.04], leg, { rot: [0.12, 0, -0.21] })
    .box([0, 1.37, 0], [0.12, 0.06, 0.12], 0x3a3a3e)
    // (the camera, its long lens tilted up at the tower)
    .box([0, 1.48, 0], [0.16, 0.12, 0.1], 0x1e1e22)
    .box([0, 1.53, 0.12], [0.09, 0.09, 0.2], 0x2a2a30, { rot: [-0.55, 0, 0] });
  return d;
}

/** A woven mat on the grass (rig space: its middle). */
function mat(): RigDef {
  return new RigDef().box([0, 0.015, 0], [4.0, 0.03, 1.5], 0xc89a4a).box([0, 0.02, 0], [3.7, 0.03, 1.2], 0xa8342c);
}

export class EquinoxCrowd implements PeopleScene {
  readonly name = 'equinox';
  readonly actors: Actor[] = [];
  private readonly people: Watcher[] = [];
  private readonly rigs: Rig[] = [];
  private readonly rigAt: [number, number, number][] = [];
  private readonly pace = new Pace(200, 470);
  private shown = false;
  private started = false;

  constructor(private readonly env: PeopleEnv) {
    const add = (look: Look, role: Role, x: number, z: number, k: number) => {
      const a = new Actor(env.crowd, look, env.ground).avoid(env.traffic, this.name);
      this.actors.push(a);
      // (the farther from the stair, the sooner they set out and the sooner they go; each a little apart)
      const far = Math.hypot(x - STAIR[1].x, z - STAIR[1].z);
      const out = GATHER + Math.max(0, 0.05 - far * 0.0011) + ((k * 0.37) % 1) * 0.012;
      const leave = Math.max(0, 0.03 - far * 0.0008) + ((k * 0.43) % 1) * 0.008;
      const yaw = Math.atan2(TOWER.x - x, TOWER.z - z);
      const seat: Point = { x, y: 56, z };
      const h = Math.hypot(TOWER.x - x, TOWER.z - z);
      const up: Point = { x: TOWER.x, y: 56 + 1.75 + h * LOOK_UP, z: TOWER.z };
      const routeIn = [STAIR[0], STAIR[1], seat];
      const routeBack = [seat, STAIR[1], STAIR[0]];
      this.people.push({ a, role, x, z, yaw, out, react: ((k * 0.61) % 1) * 0.012, leave, state: 'off', leg: 0, routeIn, routeBack, route: routeIn, look: up, since: 0 });
    };
    const phone = (seed: number, o: Parameters<typeof dress>[2] = {}) => dress('visitor', seed, { carry: CARRY.phone, ...o });
    const camera = (seed: number, o: Parameters<typeof dress>[2] = {}) => dress('visitor', seed, { carry: CARRY.none, props: [FEAT.camera], ...o });
    // Khmer people out for the sunrise, in their best (silk colours), with their phones.
    const khmer = (seed: number, o: Parameters<typeof dress>[2] = {}) => dress('pilgrim', seed, { pilgrim: 'best', carry: CARRY.phone, ...o });
    let k = 0;
    // West: along the reflecting pool's edge, sitting; standing behind them; a photographer at each end.
    for (const [x, look] of [
      [-30, phone(801)],
      [-26.5, khmer(802, { sex: 'f' })],
      [-23, phone(803, { sex: 'f' })],
      [-19.5, camera(804)],
      [-15.5, khmer(805)],
      [-12, phone(806, { sex: 'm' })],
    ] as [number, Look][])
      add(look, k % 2 ? 'sit' : 'rise', x, -161.1 + (k % 3) * 0.12, k++);
    for (const [x, look] of [
      [-28.4, camera(811, { sex: 'f' })],
      [-24.7, phone(812)],
      [-20.9, phone(813, { age: 'old' })],
      [-17.2, khmer(814)],
      [-13.6, phone(815, { sex: 'f' })],
    ] as [number, Look][])
      add(look, 'stand', x, -158.9 - (k % 2) * 0.35, k++);
    add(camera(821, { sex: 'm' }), 'tripod', -33.6, -160.3, k++);
    add(camera(822, { sex: 'f' }), 'tripod', -8.9, -159.5, k++);
    // The causeway: along its balustrades, the middle left free.
    for (const [x, z, look] of [
      [-4.7, -163.6, phone(831)],
      [-4.9, -165.9, camera(832, { sex: 'f' })],
      [4.8, -164.2, phone(833, { sex: 'm' })],
      [4.7, -166.3, khmer(834, { sex: 'f' })],
    ] as [number, number, Look][])
      add(look, 'stand', x, z, k++);
    // East of the road: three monks (an elder, a monk, a novice with his phone) and a Khmer family on a mat.
    add(dress('monk', 841, { age: 'old' }), 'monk', 13.2, -160.9, k++);
    add(dress('monk', 842), 'monk', 15.7, -160.7, k++);
    add(dress('monk', 843, { young: true, carry: CARRY.phone }), 'novice', 18.2, -160.9, k++);
    add(khmer(851, { age: 'old' }), 'sit', 22.6, -161.3, k++);
    add(khmer(852, { sex: 'f' }), 'rise', 24.4, -161.2, k++);
    add(dress('kid', 853), 'sit', 26.0, -161.4, k++);
    add(phone(861), 'stand', 23.4, -158.7, k++);
    add(camera(862, { sex: 'f' }), 'stand', 27.6, -158.9, k++);
    // Their things: the tripods (in front of the photographers, toward the tower) and the family's mat.
    for (const p of this.people)
      if (p.role === 'tripod') this.thing(tripod(), p.x + Math.sin(p.yaw) * 0.75, p.z + Math.cos(p.yaw) * 0.75, p.yaw);
    this.thing(mat(), 24.3, -161.3, 0);
  }

  private thing(def: RigDef, x: number, z: number, yaw: number): void {
    this.rigs.push(new Rig(this.env.things, def));
    this.rigAt.push([x, z, yaw]);
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const c = f.clock - Math.floor(f.clock);
    const on = c >= GATHER && c < GONE && equinoxMorning(f.season, c);
    const step = this.pace.step(dt, viewDist(f, 0, -160));
    if (step < 0 || (!on && !this.anyOut())) {
      this.hideAll();
      return;
    }
    if (step === 0 && this.shown) return;
    dt = step;
    if (!this.shown) {
      // (the things stand still: placed and written once, when they come out)
      this.rigs.forEach((r, i) => {
        const [x, z, yaw] = this.rigAt[i];
        const y = this.env.ground.at(x, z, 56);
        r.place(x, Number.isFinite(y) ? y : 56, z, yaw).write();
      });
    }
    this.shown = true;
    // (a still or a page opened in the middle of it: everyone where the clock has them)
    const warp = !this.started;
    this.started = true;
    for (const p of this.people) this.person(p, dt, now, c, on, warp, ex);
  }

  private anyOut(): boolean {
    for (const p of this.people) if (p.state !== 'off') return true;
    return false;
  }

  private person(p: Watcher, dt: number, now: number, c: number, on: boolean, warp: boolean, ex: Obstacle | null): void {
    const a = p.a;
    const leaving = !on || c >= LEAVE + p.leave;
    if (p.state === 'off') {
      if (!on || c < p.out || leaving) return;
      if (warp) {
        // (already there)
        const y = this.env.ground.at(p.x, p.z, 56);
        a.warp(p.x, Number.isFinite(y) ? y : 56, p.z, p.yaw);
        p.state = 'on';
      } else {
        a.warp(STAIR[0].x, STAIR[0].y, STAIR[0].z, Math.PI);
        p.state = 'in';
        p.route = p.routeIn;
        p.leg = 1;
      }
      a.show();
    }
    if (p.state === 'on' && leaving) {
      p.state = 'back';
      p.leg = 0;
      p.route = p.routeBack;
      p.since = now;
      a.performing = false;
    }
    if (p.state === 'in' || p.state === 'back') {
      const goal = p.route[Math.min(p.leg, p.route.length - 1)];
      a.pose(POSE.stand, now);
      a.carry(p.state === 'in' && c < FIRST_LIGHT ? 1 : 0, now);
      a.goTo(goal.x, goal.z, p.state === 'in' ? WALK_IN : WALK_OUT);
      a.face(null);
      a.lookAt(null);
      if (a.dist(goal.x, goal.z) < 0.35) {
        if (p.leg < p.route.length - 1) p.leg++;
        else if (p.state === 'in') p.state = 'on';
        else {
          p.state = 'off';
          a.hide();
          return;
        }
      }
      // (one held up somewhere on the way out for long: gone)
      if (p.state === 'back' && now - p.since > OUT_MAX) {
        p.state = 'off';
        a.hide();
        return;
      }
    }
    if (p.state === 'on') this.watch(p, now, c, ex);
    a.step(dt, now);
    if (p.state === 'in' || p.state === 'back') this.keepUp(a);
  }

  /**
   * Their floor on the road's last stair and on the pad above it, should the walk map lose them (pushed off the steep
   * stair's side by the others or the explorer, they would keep their height and walk on under the pad): on the stair
   * never below its line, on the pad its floor.
   */
  private keepUp(a: Actor): void {
    const L = STAIR_LINE;
    const t = (a.z - L.z0) / (L.z1 - L.z0);
    let y = NaN;
    if (t > 0 && t < 1 && Math.abs(a.x - 2) < 6) {
      const line = L.y0 + (L.y1 - L.y0) * t;
      // (on a step the walk map may stand them a little over the line: that is right)
      if (a.y < line - 0.6) y = line;
    } else if (t >= 1 && a.y < L.y1 - 2) {
      const g = this.env.ground.at(a.x, a.z, STAIR[1].y + 1);
      y = Number.isFinite(g) ? g : STAIR[1].y;
    }
    if (!Number.isFinite(y)) return;
    a.y = y;
    if (a.shown) a.crowd.place(a.i, a.x, a.y, a.z, a.yaw);
  }

  /** In place: waiting, the moment, after it. */
  private watch(p: Watcher, now: number, c: number, ex: Obstacle | null): void {
    const a = p.a;
    a.goTo(p.x, p.z, 0.6);
    a.face(p.yaw);
    // The moment: from the first light (each a moment apart) until the halo has gone.
    const up = c >= FIRST_LIGHT + p.react && c < HALO_END + p.react;
    const after = c >= HALO_END + p.react;
    // (rapt while the sun is on the tower: a greeting only turns their heads, they don't turn to pose for his camera)
    a.performing = up;
    let pose: Pose = POSE.stand;
    let hold = 0;
    switch (p.role) {
      case 'sit':
      case 'monk':
        pose = POSE.sit;
        break;
      case 'rise':
        pose = up ? POSE.photo : POSE.sit;
        break;
      case 'novice':
        pose = up && c >= ON_TOWER ? POSE.photo : POSE.sit;
        break;
      case 'tripod':
        // (at the camera from the first light; before it, checking it now and then)
        pose = c >= FIRST_LIGHT - 0.02 + p.react ? POSE.photo : POSE.look;
        break;
      case 'stand':
        // (waiting: the phone at the waist; the moment: up — one in four points at it first, "look!"; after: looking
        // at what they took, or talking)
        pose = up ? (p.a.i % 4 === 1 && c >= ON_TOWER && c < ON_TOWER + 0.012 ? POSE.point : POSE.photo) : after && p.a.i % 3 === 0 ? POSE.talk : POSE.stand;
        hold = up ? 0 : 1;
        break;
    }
    a.pose(pose, now);
    a.carry(hold, now);
    // (eyes on the tower; with the phone down, on its screen — waiting, now and then up at the temple; a glance at
    // the explorer going by)
    if (ex && a.dist(ex.x, ex.z) < 3 && !up) {
      EX_AT.x = ex.x;
      EX_AT.y = ex.y + 2;
      EX_AT.z = ex.z;
      a.lookAt(EX_AT, now + 1);
    } else if (hold && (after || (now + a.i * 3.7) % 14 > 5)) a.lookAt(null);
    else a.lookAt(p.look, now + 1);
  }

  private hideAll(): void {
    if (!this.shown) return;
    this.shown = false;
    this.started = false;
    for (const r of this.rigs) r.hide();
    for (const p of this.people) {
      p.state = 'off';
      p.a.performing = false;
      if (p.a.shown) p.a.hide();
    }
  }

  report(traffic: Traffic): void {
    for (const p of this.people) if (p.a.shown) traffic.add(this.name, p.a.x, p.a.y, p.a.z);
  }
}
