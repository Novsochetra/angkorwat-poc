import type { MapFrame } from '../types';
import { Actor } from './_actor';
import { dress } from './_kinds';
import { CARRY, POSE, SLOT, type Look, type Pose } from './_personModel';
import type { Obstacle, Point, Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';
import { Rig, RigDef } from './_things';

/**
 * Apsara dancers at night in front of Angkor Wat: on the grass before the
 * west reflecting pool, west of the road (clear of the road, its beacon and
 * the prayer spot in the gate), four dancers in gold headdresses and silk
 * sampots dance slowly (`dance`: knees bent, a foot lifted behind, the arms
 * curving, the hands bent back), drifting through a slow figure; two
 * bearers hold torches at the sides, two standing torches burn behind them
 * (glow and bloom only: no light), the pool mirrors them. A pinpeat
 * ensemble sits on a mat to the west, a roneat (xylophone) and a pair of
 * skor thom drums before them; its music (`pinpeat`) comes from there. A few
 * visitors sit on the grass watching, now and then one stands for a photo.
 *
 * They come out of the gate at dusk (`clock` ≈ 0.22), dance from ≈ 0.28
 * to midnight (0.51) and go back in.
 */

/** Clock: set out from the gate, dance, go back in. */
const OUT = 0.22;
const SHOW = 0.28;
const END = 0.51;
/** The stage's middle (on the grass before the west pool, 56 m up) and its facing (south, to the watchers). */
const STAGE = { x: -16.5, z: -158.6 };
/** The gate's passage (they come out and go in there) and the causeway's foot (round the pool). */
const DOOR: Point = { x: -1.8, y: 58, z: -169.5 };
const CAUSEWAY: Point = { x: -5.2, y: 56, z: -160.8 };
/** The visitors come up the road's last stair (on its west lane) and across the grass. */
const STAIR: Point[] = [
  { x: 1.0, y: 44.25, z: -146.5 },
  { x: 1.0, y: 56.25, z: -157.2 },
  { x: -3.2, y: 56, z: -157 },
];
/** Walking pace (m/s). */
const WALK = 0.8;
/** Seconds of one phrase of the music (a `pinpeat` call each). */
const PHRASE = 7.2;
/** Where the torch bearers, the players and the watchers look (the stage), and the explorer's face (scratch). */
const TORCH_LOOK: Point = { x: STAGE.x, y: 57.5, z: STAGE.z };
const MUSIC_LOOK: Point = { x: STAGE.x, y: 57, z: STAGE.z };
const WATCH_LOOK: Point = { x: STAGE.x, y: 57.3, z: STAGE.z };
const EX_AT: Point = { x: 0, y: 0, z: 0 };

interface Performer {
  a: Actor;
  /** Their place: (x, z) and facing; the pose there. */
  x: number;
  z: number;
  yaw: number;
  pose: Pose;
  /** How late they set out after the first (s), and their state. */
  delay: number;
  state: 'off' | 'in' | 'on' | 'back';
  leg: number;
  role: 'dancer' | 'torch' | 'music' | 'watch';
  /** Watchers: when they stand for a photo. */
  photoAt: number;
  /** Their ways to their place and back out (made once). */
  routeIn: Point[];
  routeBack: Point[];
}

/** A standing torch: a bamboo pole in a stand, an iron bowl, the flame (glows). */
function torchStand(): RigDef {
  return new RigDef()
    .box([0, 0.1, 0], [0.5, 0.2, 0.5], 0x5a4a3a)
    .box([0, 1.1, 0], [0.08, 2.0, 0.08], 0x9a7a4a)
    .box([0, 2.12, 0], [0.26, 0.1, 0.26], 0x3a3230)
    .box([0, 2.3, 0], [0.2, 0.26, 0.2], 0xffb050, { glow: 1 })
    .box([0, 2.5, 0], [0.11, 0.18, 0.11], 0xffc870, { glow: 1 });
}

/** The ensemble's mat, the roneat ek (a boat-shaped xylophone on its stand, its bars) and the two skor thom drums. */
function ensemble(): RigDef {
  const d = new RigDef();
  // (rig space: the mat's middle; the players face +x, the stage)
  d.box([0, 0.015, 0], [2.4, 0.03, 3.2], 0xb8342c).box([0, 0.02, 0], [2.2, 0.03, 3.0], 0xd8b060);
  // Roneat: a curved trough on a foot, 21 bars along it (as a few runs of pale and dark).
  d.box([0.75, 0.12, -0.7], [0.3, 0.2, 0.2], 0x5a3420)
    .box([0.75, 0.3, -0.7], [0.42, 0.18, 1.3], 0x7a4424)
    .box([0.75, 0.42, -1.3], [0.4, 0.14, 0.14], 0x7a4424)
    .box([0.75, 0.42, -0.1], [0.4, 0.14, 0.14], 0x7a4424);
  for (let k = 0; k < 7; k++) d.box([0.75, 0.4, -1.2 + k * 0.17], [0.34, 0.03, 0.12], k % 2 ? 0x3a2418 : 0x5a3a24);
  // Skor thom: two barrel drums tilted on a stand.
  for (const z of [0.55, 1.05]) {
    d.box([0.8, 0.35, z], [0.44, 0.44, 0.44], 0x6a2a1e, { rot: [0, 0, 0.35] })
      .box([0.96, 0.43, z], [0.06, 0.4, 0.4], 0xe0d0b0, { rot: [0, 0, 0.35] });
  }
  d.box([0.7, 0.12, 0.8], [0.5, 0.2, 1.0], 0x4a2c1c);
  return d;
}

export class Apsara implements PeopleScene {
  readonly name = 'apsara';
  readonly actors: Actor[] = [];
  private readonly people: Performer[] = [];
  private readonly torches: Rig[];
  private readonly music: Rig;
  private readonly pace = new Pace(200, 470);
  private phraseAt = 0;
  private shown = false;

  constructor(private readonly env: PeopleEnv) {
    const { crowd, ground, things } = env;
    const add = (look: Look, role: Performer['role'], x: number, z: number, yaw: number, pose: Pose, delay: number) => {
      const a = new Actor(crowd, look, ground).avoid(env.traffic, this.name);
      this.actors.push(a);
      const seat: Point = { x, y: 56, z };
      const routeIn = role === 'watch' ? [...STAIR, seat] : [CAUSEWAY, seat];
      const routeBack = role === 'watch' ? [seat, ...STAIR.slice().reverse()] : [CAUSEWAY, DOOR];
      this.people.push({ a, x, z, yaw, pose, delay, state: 'off', leg: 0, role, photoAt: 0, routeIn, routeBack });
    };
    // Four dancers in a shallow arc, facing the watchers (south).
    [-5.2, -1.75, 1.75, 5.2].forEach((dx, k) => add(dress('dancer', 701 + k, { young: k === 3 }), 'dancer', STAGE.x + dx, STAGE.z - 0.5 + Math.abs(dx) * 0.12, dx * -0.03, POSE.dance, k * 1.6));
    // Torch bearers at the sides, turned a little in.
    const bearer = (seed: number) => {
      const l = dress('villager', seed, { sex: 'm', hat: 'none', carry: CARRY.torch });
      return this.whiteShirt(l);
    };
    add(bearer(711), 'torch', STAGE.x - 8.3, STAGE.z + 0.6, 0.35, POSE.stand, 7);
    add(bearer(712), 'torch', STAGE.x + 8.1, STAGE.z + 0.6, -0.35, POSE.stand, 8);
    // The ensemble on its mat (west of the stage), facing east to the dancers.
    const mat = { x: STAGE.x - 11, z: STAGE.z + 0.4 };
    add(this.whiteShirt(dress('villager', 721, { sex: 'm', hat: 'none' })), 'music', mat.x - 0.2, mat.z - 0.75, Math.PI / 2, POSE.sit, 9);
    add(this.whiteShirt(dress('villager', 722, { sex: 'm', hat: 'none', age: 'old' })), 'music', mat.x - 0.2, mat.z + 0.8, Math.PI / 2, POSE.sit, 10);
    // Visitors sitting on the grass, watching (north).
    [-4.5, -1.5, 1.6, 4.4].forEach((dx, k) => add(dress('visitor', 731 + k * 5), 'watch', STAGE.x + dx, STAGE.z + 4.1 + (k % 2) * 0.5, Math.PI + dx * 0.04, POSE.sit, 3 + k * 1.3));
    this.torches = [
      [STAGE.x - 7.2, STAGE.z - 2.1],
      [STAGE.x + 7.0, STAGE.z - 2.1],
    ].map(([x, z]) => {
      const r = new Rig(things, torchStand());
      const y = env.ground.at(x, z, 56);
      r.place(x, Number.isFinite(y) ? y : 56, z, 0, 0, 0, 1);
      return r;
    });
    this.music = new Rig(things, ensemble());
    const my = env.ground.at(mat.x, mat.z, 56);
    this.music.place(mat.x, Number.isFinite(my) ? my : 56, mat.z, 0, 0, 0, 1);
  }

  /** The pinpeat players and the torch bearers wear white shirts. */
  private whiteShirt(l: Look): Look {
    const colors = l.colors.slice();
    for (const s of [SLOT.top, SLOT.sleeveL, SLOT.sleeveR]) colors[s] = 0xf2eee4;
    colors[SLOT.hips] = colors[SLOT.thigh] = 0x3a2a4a;
    return { ...l, colors };
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const c = f.clock;
    const on = c >= OUT && c < END;
    const step = this.pace.step(dt, viewDist(f, STAGE.x, STAGE.z));
    if (step < 0 || (!on && !this.anyOut())) {
      this.hideAll();
      return;
    }
    if (step === 0 && this.shown) return;
    dt = step;
    this.shown = true;
    // (standing still: written once, when they come out)
    for (const r of this.torches) r.write();
    this.music.write();
    // (a still or a page opened in the evening: everyone already in place)
    const warp = !this.started;
    this.started = true;
    const since = ((c - OUT + 1) % 1) * 360;
    for (const p of this.people) this.person(p, dt, now, f, on, since, warp, ex);
    // The music: a phrase at a time from the ensemble's mat while they dance.
    if (c >= SHOW && c < END && f.dt > 0 && now >= this.phraseAt) {
      this.phraseAt = now + PHRASE;
      f.calls.push({ kind: 'pinpeat', x: STAGE.x - 11, y: 57.5, z: STAGE.z + 0.4, gain: 1 });
    }
  }

  private started = false;

  /** Anyone out of the gate (on the way, or in place)? */
  private anyOut(): boolean {
    for (const p of this.people) if (p.state !== 'off') return true;
    return false;
  }

  private person(p: Performer, dt: number, now: number, f: MapFrame, on: boolean, since: number, warp: boolean, ex: Obstacle | null): void {
    const a = p.a;
    const g = this.env.ground;
    if (p.state === 'off') {
      if (!on || since < p.delay) return;
      if (warp && f.clock >= SHOW) {
        const y = g.at(p.x, p.z, 56);
        a.warp(p.x, Number.isFinite(y) ? y : 56, p.z, p.yaw);
        p.state = 'on';
      } else if (p.role === 'watch') {
        // (visitors come up the road's stair and across the grass)
        a.warp(STAIR[0].x, STAIR[0].y, STAIR[0].z, Math.PI);
        p.state = 'in';
        p.leg = 1;
      } else {
        a.warp(DOOR.x, DOOR.y, DOOR.z, Math.PI);
        p.state = 'in';
        p.leg = 0;
      }
      a.show();
      a.carry(1, now);
    }
    if (p.state === 'in' || p.state === 'back') {
      const route = p.state === 'in' ? p.routeIn : p.routeBack;
      const goal = route[Math.min(p.leg, route.length - 1)];
      a.pose(POSE.stand, now);
      a.goTo(goal.x, goal.z, WALK);
      a.face(null);
      if (a.dist(goal.x, goal.z) < 0.35) {
        if (p.leg < route.length - 1) p.leg++;
        else if (p.state === 'in') p.state = 'on';
        else {
          p.state = 'off';
          a.hide();
          return;
        }
      }
    }
    if (p.state === 'on') {
      if (!on) {
        p.state = 'back';
        p.leg = 0;
      } else this.perform(p, now, f, ex);
    }
    a.step(dt, now);
  }

  /** In place: dancing (drifting through a slow figure), holding the torch up, playing, watching. */
  private perform(p: Performer, now: number, f: MapFrame, ex: Obstacle | null): void {
    const a = p.a;
    const dancing = f.clock >= SHOW;
    if (p.role === 'dancer') {
      // (a slow figure: each drifts round her place, turning a little, the four out of step)
      const u = now * 0.045 + p.delay;
      const x = p.x + 0.55 * Math.sin(u * 1.3);
      const z = p.z + 0.35 * Math.sin(u * 2.1);
      a.goTo(x, z, 0.25);
      a.face(p.yaw + 0.45 * Math.sin(u * 0.9));
      a.pose(dancing ? POSE.dance : POSE.stand, now);
      a.carry(0, now);
      a.lookAt(null);
      return;
    }
    a.goTo(p.x, p.z, 0.6);
    a.face(p.yaw);
    if (p.role === 'torch') {
      a.pose(POSE.stand, now);
      a.carry(1, now);
      a.lookAt(TORCH_LOOK, now + 1);
    } else if (p.role === 'music') {
      a.pose(POSE.sit, now);
      a.lookAt(MUSIC_LOOK, now + 1);
      a.tilt(0.25 + 0.15 * Math.sin(now * 2.2 + p.delay));
    } else {
      // Watching; now and then one stands up for a photo, and sits down again.
      if (now > p.photoAt + 40) p.photoAt = now + 20 + ((p.delay * 37) % 30);
      const photo = dancing && now > p.photoAt && now < p.photoAt + 5;
      a.pose(photo ? POSE.photo : POSE.sit, now);
      a.lookAt(photo ? null : WATCH_LOOK, now + 1);
      // (the explorer walking by: a glance)
      if (ex && a.dist(ex.x, ex.z) < 3) {
        EX_AT.x = ex.x;
        EX_AT.y = ex.y + 2;
        EX_AT.z = ex.z;
        a.lookAt(EX_AT, now + 1);
      }
    }
  }

  private hideAll(): void {
    if (!this.shown) return;
    this.shown = false;
    this.started = false;
    for (const r of this.torches) r.hide();
    this.music.hide();
    for (const p of this.people) {
      p.state = 'off';
      if (p.a.shown) p.a.hide();
    }
  }

  report(traffic: Traffic): void {
    for (const p of this.people) if (p.a.shown) traffic.add(this.name, p.a.x, p.a.y, p.a.z);
  }
}
