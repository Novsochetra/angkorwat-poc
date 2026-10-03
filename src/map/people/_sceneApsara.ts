import { Frustum, Matrix4, Sphere } from 'three';
import type { MapFrame } from '../types';
import { Actor } from './_actor';
import { dress } from './_kinds';
import { CARRY, DANCE, danceSide, danceSteps, POSE, SLOT, type Look, type Pose } from './_personModel';
import type { Obstacle, Point, Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';
import { Rig, RigDef } from './_things';

/**
 * Apsara dancers at night in front of Angkor Wat: on the grass before the
 * west reflecting pool, west of the road (clear of the road, its beacon and
 * the prayer spot in the gate), four dancers in gold headdresses and silk
 * sampots dance slowly (`dance`: knees bent, a foot lifted behind, the arms
 * curving, the hands bent back), together and to the music: each change of
 * the foot is a step of their slow figure (they hold still while a foot is
 * up, turned a little from the watchers), and the pinpeat's phrase begins as
 * both feet are down (`danceSteps`); two bearers hold torches at the sides,
 * two standing torches burn behind them (glow and bloom only: no light), the
 * pool mirrors them. A pinpeat ensemble sits on a mat to the west, a roneat
 * (xylophone) and a pair of skor thom drums before them, nodding to the beat;
 * its music (`pinpeat`) comes from there. A few visitors sit on the grass
 * watching, now and then one stands for a photo. The show goes on when the
 * explorer greets them: the dancers and the players only turn their heads to
 * him (`Actor.performing`); in their places they do not step out of his way
 * (he pushes past them, at most).
 *
 * They come out of the gate's passage at dusk (`clock` ≈ 0.18: the farthest
 * first, in single file), along the lane behind the dancers' line (clear of
 * the standing torches), dance from ≈ 0.28 (once all are in their places, at
 * the next landing: the first phrase) to midnight (0.51) and go back in the
 * same way, a sampeah to the Buddha in the passage before they go. The
 * visitors come up the road's stair. Out of the passage or the stair's foot,
 * and away again, not while it is seen close by (a little late, at most).
 */

/** Clock: set out from the gate, dance, go back in (the calendar of events asks them too: map/calendar.ts). */
export const OUT = 0.18;
export const SHOW = 0.28;
export const END = 0.51;
/** The stage's middle (on the grass before the west pool, 56 m up) and its facing (south, to the watchers). */
export const STAGE = { x: -16.5, z: -158.6 };
/**
 * The gate's passage, before the Buddha's offering step (they come out and go in there, three side by side: the
 * passage is 3 m wide, the shrine behind), its mouth at the porch's front (down its stair onto the causeway), the
 * causeway's foot (round the pool).
 */
const DOOR_Z = -169.25;
const DOOR_X = [-0.9, 0, 0.9];
const PORCH: Point = { x: -0.9, y: 58, z: -166.9 };
const CAUSEWAY: Point = { x: -5.2, y: 56, z: -160.8 };
/** The lane west behind the dancers' line, between it and the standing torches (≈ 0.75 m from each): its east end, its line. */
const LANE_EAST: Point = { x: -7.4, y: 56, z: -159.9 };
const LANE_Z = -159.95;
/**
 * The visitors come up the road's last stair and across the grass: from the mid tier a little before its foot, past
 * its top on the pad (the walk map's stair climbs from z −138 at 44 m to −151 at 56.25 m, x ≈ 0‥4; as
 * people/_sceneEquinox.ts), then west onto the grass. They come and go at the first point, below the pad's edge.
 */
const STAIR: Point[] = [
  { x: 3.0, y: 44.25, z: -133 },
  { x: 2.2, y: 56.25, z: -153.5 },
  { x: -3.2, y: 56, z: -157 },
];
/**
 * Walking pace (m/s): out to their places briskly (the players and the dancers there before the show, the farthest
 * setting out first), back at a stroll; the visitors up the whole stair a little quicker.
 */
const WALK_OUT = 1.1;
const WALK = 0.85;
const WALK_UP = 1.05;
/**
 * The dancers' figure: a step of it at each change of the foot (`danceSteps`): side to side (`SWAY` m, a turn in 8
 * steps; the two halves of the line mirrored), towards the watchers and back (`REACH` m, in 16); turned from the
 * watchers by up to `TURN` (rad) away from the lifted foot (so it shows), the head back to them (the pose's).
 */
const SWAY = 0.42;
const REACH = 0.28;
const TURN = 0.25;
/** Back in their place (seated, dancing) after the explorer pushed past, at most this fast (m/s). */
const SETTLE = 0.6;
/**
 * The explorer this near a dancer's spot (m, from his middle to hers: about touching): she stops and steps out of his
 * way (the traffic's dodge, walking), back when he is this far (and then dances on).
 */
const ASIDE = 1.3;
const ASIDE_BACK = 1.8;
/** The players nod every this many seconds, on the beat (the pinpeat's 0.6 s: audio/people.ts), a little ahead (the head's ease). */
const NOD = 2.4;
const NOD_LEAD = 0.3;
/** Where the torch bearers, the players and the watchers look (the stage), and the explorer's face (scratch). */
const TORCH_LOOK: Point = { x: STAGE.x, y: 57.5, z: STAGE.z };
const MUSIC_LOOK: Point = { x: STAGE.x, y: 57, z: STAGE.z };
const WATCH_LOOK: Point = { x: STAGE.x, y: 57.3, z: STAGE.z };
const EX_AT: Point = { x: 0, y: 0, z: 0 };
/** Coming out or going away: not while that spot is in view nearer than `SEEN_FAR` m, but at most this late (s); at the door, a sampeah of `BOW` s first. */
const APPEAR_LATE = 10;
const LEAVE_LATE = 10;
const BOW = 2.4;
const SEEN_FAR = 70;
/** Out of the passage (or up the stair) one at a time, at least this far apart (s; the clock skipping on, "Wait for it", sends them all at once). */
const ONE_BY_ONE = 0.9;
/** The next time both feet are down in the dance (the people's clock, s), after `t`. */
const nextLanding = (t: number) => ((Math.floor((t * DANCE.step) / Math.PI) + 1) * Math.PI) / DANCE.step;
const lastLanding = (t: number) => (Math.floor((t * DANCE.step) / Math.PI) * Math.PI) / DANCE.step;

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
  /** Dancers: their half of the line (+1 west, −1 east: the sway mirrored). */
  side: number;
  /** Watchers: when they stand for a photo. */
  photoAt: number;
  /** Their ways to their place and back out (made once), where they come out (the gate's passage or the stair's foot). */
  routeIn: Point[];
  routeBack: Point[];
  door: Point;
  /** Since when they could come out, or have been back at the door (people's clock, s; −1: not yet). */
  waitFrom: number;
  /** A dancer stepped aside: the explorer came onto her spot (she walks back and dances on when he has gone). */
  aside: boolean;
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
  /** When the dancing (and the music) begins: after `SHOW`, once all are in place, as both feet are down (∞: not yet tonight); the figure's steps then; the next phrase. */
  private danceFrom = Infinity;
  private steps0 = 0;
  private phraseAt = Infinity;
  private shown = false;
  private started = false;
  /** (the camera's view this frame, worked out when someone needs it: `seen`) */
  private viewAt = -1;
  private readonly view = new Frustum();
  /** When the last came out of the gate, and up the stair (people's clock, s). */
  private readonly lastOut = { gate: -Infinity, stair: -Infinity };
  private readonly fig = { x: 0, z: 0, yaw: 0 };

  constructor(private readonly env: PeopleEnv) {
    const { crowd, ground, things } = env;
    const add = (look: Look, role: Performer['role'], x: number, z: number, yaw: number, pose: Pose, delay: number, side = 0, via?: Point[]) => {
      const a = new Actor(crowd, look, ground).avoid(env.traffic, this.name);
      this.actors.push(a);
      const seat: Point = { x, y: 56, z };
      const door: Point = role === 'watch' ? STAIR[0] : { x: DOOR_X[this.people.length % DOOR_X.length], y: 58, z: DOOR_Z };
      // (out of the passage, down onto the causeway, west along the lane, then to their place; back the same way)
      const lane = [LANE_EAST, ...(via ?? [{ x, y: 56, z: LANE_Z }])];
      const routeIn = role === 'watch' ? [...STAIR, seat] : [PORCH, CAUSEWAY, ...lane, seat];
      const routeBack = role === 'watch' ? [seat, ...STAIR.slice().reverse()] : [...lane.slice().reverse(), CAUSEWAY, PORCH, door];
      this.people.push({ a, x, z, yaw, pose, delay, state: 'off', leg: 0, role, side, photoAt: 0, routeIn, routeBack, door, waitFrom: -1, aside: false });
    };
    // (they set out the farthest first, in single file: the players, the west torch, the dancers west to east, the east torch)
    // Four dancers in a shallow arc, facing the watchers (south).
    [-5.2, -1.75, 1.75, 5.2].forEach((dx, k) => add(dress('dancer', 701 + k, { young: k === 3 }), 'dancer', STAGE.x + dx, STAGE.z - 0.5 + Math.abs(dx) * 0.12, dx * -0.03, POSE.dance, 2.7 + k * 1.2, dx < 0 ? 1 : -1));
    // Torch bearers at the sides, turned a little in.
    const bearer = (seed: number) => {
      const l = dress('villager', seed, { sex: 'm', hat: 'none', carry: CARRY.torch });
      return this.whiteShirt(l);
    };
    add(bearer(711), 'torch', STAGE.x - 8.3, STAGE.z + 0.6, 0.35, POSE.stand, 1.8);
    add(bearer(712), 'torch', STAGE.x + 8.1, STAGE.z + 0.6, -0.35, POSE.stand, 7.5);
    // The ensemble on its mat (west of the stage), facing east to the dancers (the drummer round the roneat player's back).
    const mat = { x: STAGE.x - 11, z: STAGE.z + 0.4 };
    add(this.whiteShirt(dress('villager', 721, { sex: 'm', hat: 'none' })), 'music', mat.x - 0.2, mat.z - 0.75, Math.PI / 2, POSE.sit, 0.9);
    add(this.whiteShirt(dress('villager', 722, { sex: 'm', hat: 'none', age: 'old' })), 'music', mat.x - 0.2, mat.z + 0.8, Math.PI / 2, POSE.sit, 0, 0, [
      { x: mat.x - 1.8, y: 56, z: LANE_Z },
      { x: mat.x - 1.8, y: 56, z: mat.z + 0.8 },
    ]);
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
    // The show: from SHOW, once the dancers and the players are in their places, at the next time both feet are down
    // (the dancers start with the music), to END.
    if (c < SHOW || !on) this.danceFrom = this.phraseAt = Infinity;
    else if (this.danceFrom === Infinity && this.ready()) {
      this.danceFrom = this.phraseAt = nextLanding(now);
      this.steps0 = danceSteps(this.danceFrom);
    }
    const since = ((c - OUT + 1) % 1) * 360;
    for (const p of this.people) this.person(p, dt, now, f, on, since, warp, ex);
    // The music: a phrase at each landing from the ensemble's mat (a phrase is 7.2 s, the dance's half step ≈ 7.14: each
    // begins as the last ends). One long missed (a pause) is not played late.
    if (now >= this.phraseAt) {
      if (f.dt > 0 && now - this.phraseAt < 0.5) f.calls.push({ kind: 'pinpeat', x: STAGE.x - 11, y: 57.5, z: STAGE.z + 0.4, gain: 1 });
      this.phraseAt = nextLanding(now);
    }
  }

  /** Anyone out of the gate (on the way, or in place)? */
  private anyOut(): boolean {
    for (const p of this.people) if (p.state !== 'off') return true;
    return false;
  }

  /** The dancers and the players all in their places? */
  private ready(): boolean {
    for (const p of this.people) if ((p.role === 'dancer' || p.role === 'music') && p.state !== 'on') return false;
    return true;
  }

  /** Is (x, y, z) in the camera's view this frame, nearer than `SEEN_FAR`? (never in shots: a still is the same every time) */
  private seen(f: MapFrame, p: Point): boolean {
    if (this.env.shot) return false;
    const cam = f.camera;
    const dx = p.x - cam.position.x;
    const dz = p.z - cam.position.z;
    if (dx * dx + dz * dz > SEEN_FAR * SEEN_FAR) return false;
    if (this.viewAt !== f.t) {
      this.viewAt = f.t;
      this.view.setFromProjectionMatrix(VIEW_PROJ.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    }
    BODY.center.set(p.x, p.y + 1.2, p.z);
    return this.view.intersectsSphere(BODY);
  }

  private person(p: Performer, dt: number, now: number, f: MapFrame, on: boolean, since: number, warp: boolean, ex: Obstacle | null): void {
    const a = p.a;
    const g = this.env.ground;
    if (p.state === 'off') {
      if (!on || since < p.delay) return;
      if (warp && f.clock >= SHOW) {
        this.figure(p, now);
        const fig = this.fig;
        const y = g.at(fig.x, fig.z, 56);
        a.warp(fig.x, Number.isFinite(y) ? y : 56, fig.z, fig.yaw);
        p.state = 'on';
        a.avoid(p.role === 'torch' ? this.env.traffic : null);
      } else {
        // (out of the passage or up the stair: not while that is seen close by, unless they are late; one at a time, the
        // farthest first)
        if (p.waitFrom < 0) p.waitFrom = now;
        if (this.seen(f, p.door) && now - p.waitFrom < APPEAR_LATE) return;
        const way = p.role === 'watch' ? 'stair' : 'gate';
        if (now - this.lastOut[way] < ONE_BY_ONE) return;
        for (const q of this.people) if (q !== p && q.state === 'off' && q.delay < p.delay && since >= q.delay && (q.role === 'watch') === (way === 'stair')) return;
        this.lastOut[way] = now;
        p.waitFrom = -1;
        // (the visitors come up the road's stair and across the grass; the others out of the gate, facing out)
        a.warp(p.door.x, p.door.y, p.door.z, p.role === 'watch' ? Math.PI : 0);
        p.state = 'in';
        p.leg = p.role === 'watch' ? 1 : 0;
        a.avoid(this.env.traffic);
      }
      a.show();
      a.carry(1, now);
    }
    if (p.state === 'in' || p.state === 'back') {
      const route = p.state === 'in' ? p.routeIn : p.routeBack;
      const goal = route[Math.min(p.leg, route.length - 1)];
      if (p.state === 'back' && p.waitFrom >= 0) {
        // Back at the door: a sampeah to the Buddha in the passage (the torch bearers with their torches up), then
        // gone — not while seen close by, unless long. (The visitors at the stair's foot go on.)
        const gate = p.role !== 'watch';
        if (gate) {
          a.stop(Math.PI);
          a.pose(p.role === 'torch' ? POSE.stand : POSE.sampeah, now);
        }
        if (now - p.waitFrom > (gate ? BOW : 0) && (!this.seen(f, p.door) || now - p.waitFrom > LEAVE_LATE)) {
          p.state = 'off';
          p.waitFrom = -1;
          a.hide();
          return;
        }
      } else {
        a.pose(POSE.stand, now);
        a.goTo(goal.x, goal.z, p.role === 'watch' ? WALK_UP : p.state === 'in' ? WALK_OUT : WALK);
        a.face(null);
        if (a.dist(goal.x, goal.z) < 0.35) {
          if (p.leg < route.length - 1) p.leg++;
          else if (p.state === 'back') p.waitFrom = now;
          else {
            p.state = 'on';
            // (in their place they keep it: no stepping out of the explorer's way, but the torch bearers)
            if (p.role !== 'torch') a.avoid(null);
          }
        }
      }
    }
    if (p.state === 'on') {
      if (!on) {
        p.state = 'back';
        p.leg = 0;
        p.waitFrom = -1;
        p.aside = false;
        a.performing = false;
        a.tilt(0);
        a.avoid(this.env.traffic);
      } else this.perform(p, now, dt, f, ex);
    }
    a.step(dt, now);
  }

  /** Where someone in place stands now (`fig`): their place; a dancer's in the figure, and her facing. */
  private figure(p: Performer, now: number): void {
    const fig = this.fig;
    fig.x = p.x;
    fig.z = p.z;
    fig.yaw = p.yaw;
    if (p.role !== 'dancer' || now < this.danceFrom) return;
    // (a step at each change of the foot, still while it is up: danceSteps)
    const u = ((danceSteps(now) - this.steps0) * Math.PI * 2) / 16;
    fig.x += p.side * SWAY * Math.sin(u * 2);
    fig.z += REACH * Math.sin(u);
    fig.yaw -= TURN * danceSide(now);
  }

  /** In place: dancing (stepping through the figure), holding the torch up, playing, watching. */
  private perform(p: Performer, now: number, dt: number, f: MapFrame, ex: Obstacle | null): void {
    const a = p.a;
    const dancing = now >= this.danceFrom;
    // (the show on: a greeting only turns the dancers' and the players' heads, _greetBack.ts)
    a.performing = f.clock >= SHOW && (p.role === 'dancer' || p.role === 'music');
    if (p.role === 'torch') {
      a.goTo(p.x, p.z, 0.6);
      a.face(p.yaw);
      a.pose(POSE.stand, now);
      a.carry(1, now);
      a.lookAt(TORCH_LOOK, now + 1);
      return;
    }
    // (the dancers where the figure has them, the others in their places: never walked there, only back slowly if the
    // explorer pushed past)
    const fig = this.fig;
    this.figure(p, now);
    if (p.role === 'dancer') {
      // (the explorer on her spot: she steps out of his way, walking, and back when he has gone)
      const d = ex ? Math.hypot(ex.x - fig.x, ex.z - fig.z) : Infinity;
      if (!p.aside && d < ASIDE) {
        p.aside = true;
        a.avoid(this.env.traffic);
      } else if (p.aside && d > ASIDE_BACK && a.dist(fig.x, fig.z) < 0.15) {
        p.aside = false;
        a.avoid(null);
      }
      if (p.aside) a.goTo(fig.x, fig.z, WALK);
      else a.shuffle(fig.x, fig.z, SETTLE * dt);
      a.face(fig.yaw);
      a.pose(dancing && !p.aside ? POSE.dance : POSE.stand, now);
      a.carry(0, now);
      a.lookAt(null);
      return;
    }
    a.shuffle(fig.x, fig.z, SETTLE * dt);
    a.face(fig.yaw);
    if (p.role === 'music') {
      a.pose(POSE.sit, now);
      a.lookAt(MUSIC_LOOK, now + 1);
      // (nodding on the beat while they play: each phrase begins as the dancers' feet are both down)
      const beat = now + NOD_LEAD - lastLanding(now + NOD_LEAD);
      a.tilt(dancing ? 0.25 + 0.15 * Math.cos((beat * Math.PI * 2) / NOD) : 0.2);
    } else {
      // Watching; now and then one stands up for a photo, and sits down again.
      if (now > p.photoAt + 40) p.photoAt = now + 20 + ((p.delay * 37) % 30);
      const photo = f.clock >= SHOW && now > p.photoAt && now < p.photoAt + 5;
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
    this.danceFrom = this.phraseAt = Infinity;
    this.lastOut.gate = this.lastOut.stair = -Infinity;
    for (const r of this.torches) r.hide();
    this.music.hide();
    for (const p of this.people) {
      p.state = 'off';
      p.waitFrom = -1;
      p.aside = false;
      p.a.performing = false;
      if (p.a.shown) p.a.hide();
    }
  }

  report(traffic: Traffic): void {
    for (const p of this.people) if (p.a.shown) traffic.add(this.name, p.a.x, p.a.y, p.a.z);
  }
}

/** (`seen`'s scratch) */
const VIEW_PROJ = new Matrix4();
const BODY = new Sphere(undefined, 1.4);
