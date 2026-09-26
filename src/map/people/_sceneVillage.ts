import type { Object3D } from 'three';
import { WalkMap } from '../roam/walkmap';
import type { MapFrame, MapPart } from '../types';
import { JETTY, PAGODA, STILT_HOMES, VILLAGE_SPOTS, type HomeSpec } from '../village/_spots';
import { Actor } from './_actor';
import { dress } from './_kinds';
import { CARRY, POSE, type Pose } from './_personModel';
import { Ground, type Obstacle, type Point, type Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';
import { Rig, RigDef } from './_things';

/**
 * Life in the floating village (the `village` part, village/: its spots,
 * `VILLAGE_SPOTS`), calm and sparse:
 *
 * - two neighbours sitting on their verandas over the water, into the
 *   evening while the windows are lit;
 * - a man sitting at the end of the jetty, looking out over the lake;
 * - a woman selling fruit at a stall under a parasol by the shop (mangoes,
 *   bananas, rambutan, dragon fruit, a watermelon); now and then a neighbour
 *   comes to buy, stands and talks a while, and goes home;
 * - two children playing tag on the beach at the village's north end, by the
 *   nets and the boats pulled up (laughing, far off: `laugh`);
 * - a monk: in the morning his alms round from the pagoda down its naga
 *   stair to the stall, where the fruit seller kneels and gives, and back;
 *   in the late afternoon coming home along the village trail, up the
 *   stair and into the pagoda.
 *
 * They stand on the village's real floors (its verandas, the jetty, the
 * stair: a walk map of the village part).
 */

/** The stall by the shop (its front towards the square), and the neighbour who comes to buy. */
const STALL = { x: -294.2, z: 70.8, yaw: -0.55 };
const BUYER_HOME: Point = { x: -289.5, y: 6, z: 62 };
/** The children's tag round the nets and boats at the north end. */
const TAG = { x: -287.4, z: 21.5, rx: 1.6, rz: 5.2 };
/** The pagoda's stair and door, the square (VILLAGE_SPOTS). */
const DOOR = VILLAGE_SPOTS.pagodaDoor;
const FOOT = VILLAGE_SPOTS.pagodaStairFoot;
const TOP: Point = { x: PAGODA.x, y: PAGODA.terrace.y, z: PAGODA.stair.z1 + 0.6 };
const SQUARE: Point = { x: -299.5, y: 6, z: 84.5 };
const TRAIL_END: Point = { x: -284, y: 7.5, z: 83 };
/** The monk's walking pace (m/s). */
const PACE = 0.55;

/** The fruit stall: a table, a parasol on its pole, fruit piled in baskets. */
function stall(): RigDef {
  const d = new RigDef();
  const wood = 0x8a6a44;
  for (const [x, z] of [
    [-0.75, -0.35],
    [0.75, -0.35],
    [-0.75, 0.35],
    [0.75, 0.35],
  ])
    d.box([x, 0.35, z], [0.06, 0.7, 0.06], wood);
  d.box([0, 0.72, 0], [1.7, 0.05, 0.85], 0xa8845a);
  // Baskets of fruit: mangoes, bananas, rambutan, dragon fruit, a watermelon.
  const fruit: [number, number, number][] = [
    [-0.55, 0.1, 0xf0b030],
    [-0.15, 0.12, 0xe8d040],
    [0.25, 0.1, 0xc8302a],
    [0.6, 0.12, 0xd84a8a],
  ];
  for (const [x, z, c] of fruit) d.box([x, 0.8, z], [0.32, 0.1, 0.32], 0xb89050).box([x, 0.9, z], [0.26, 0.12, 0.26], c);
  d.box([0.1, 0.84, -0.25], [0.3, 0.2, 0.22], 0x3a7a3a);
  // A striped parasol on its pole, tilted a little over the seller.
  d.box([0.2, 1.3, -0.55], [0.05, 2.6, 0.05], 0xd8d0c0);
  for (let k = 0; k < 4; k++) d.box([0.2, 2.55 - k * 0.04, -0.55], [2.0 - k * 0.45, 0.05, 2.0 - k * 0.45], k % 2 ? 0xf2ecd8 : 0xc83a2a);
  return d;
}

interface Walker {
  a: Actor;
  path: Point[];
  leg: number;
  wait: number;
}

export class VillageLife implements PeopleScene {
  readonly name = 'village';
  readonly actors: Actor[] = [];
  private readonly ground: Ground;
  private readonly pace = new Pace(180, 430);
  private readonly sitters: { a: Actor; x: number; y: number; z: number; yaw: number; until: number }[] = [];
  private readonly seller: Actor;
  private readonly buyer: Walker;
  private readonly kids: Actor[];
  private readonly monk: Walker & { mode: 'in' | 'alms' | 'home'; done: string };
  private readonly stall: Rig;
  private shown = false;
  private laughAt = 0;
  private buyAt = 20;

  constructor(private readonly env: PeopleEnv, scene: Object3D) {
    const { crowd, traffic } = env;
    // The village's floors: its own walk map (verandas, the jetty, the pagoda's stair), over the land.
    const parts: MapPart[] = [];
    for (const o of scene.children) if (o.name === 'village' || o.name === 'path') parts.push({ name: o.name, object: o });
    this.ground = parts.some((p) => p.name === 'village') ? new Ground(env.ground.field, new WalkMap(env.ground.field, parts)) : env.ground;
    const g = this.ground;
    const actor = (look: ReturnType<typeof dress>) => {
      const a = new Actor(crowd, look, g).avoid(traffic, this.name);
      this.actors.push(a);
      return a;
    };
    // On two verandas (the middle of the veranda, a little to one side), facing the lake; and at the jetty's end.
    const veranda = (h: HomeSpec, side: number): [number, number, number] => {
      const s = Math.sin(h.facing);
      const c = Math.cos(h.facing);
      const lx = side * h.w * 0.22;
      const lz = h.d / 2 + 0.1;
      return [h.x + lx * c + lz * s, h.floor, h.z - lx * s + lz * c];
    };
    [
      [STILT_HOMES[1], 0.6, 1001, 'f', 0.42],
      [STILT_HOMES[5], -0.5, 1004, 'm', 0.4],
    ].forEach(([h, side, seed, sex, until]) => {
      const home = h as HomeSpec;
      const [x, y, z] = veranda(home, side as number);
      const a = actor(dress('villager', seed as number, { sex: sex as 'f' | 'm', hat: 'none', age: sex === 'm' ? 'old' : undefined }));
      this.sitters.push({ a, x, y, z, yaw: home.facing, until: until as number });
    });
    {
      const [jx, jz] = JETTY.to;
      const [ux, uz] = JETTY.dir;
      const a = actor(dress('villager', 1007, { sex: 'm', hat: 'krama' }));
      this.sitters.push({ a, x: jx - ux * 1.1, y: JETTY.y, z: jz - uz * 1.1, yaw: Math.atan2(ux, uz), until: 0.3 });
    }
    // The fruit seller, sitting behind her stall; a neighbour who comes to buy.
    this.seller = actor(dress('villager', 1011, { sex: 'f', hat: 'palm' }));
    this.buyer = { a: actor(dress('villager', 1013, { sex: 'f', hat: 'krama' })), path: [], leg: 0, wait: 0 };
    this.kids = [actor(dress('kid', 1021)), actor(dress('kid', 1023, { young: true }))];
    this.monk = { a: actor(dress('monk', 1031, { carry: CARRY.bowl })), path: [], leg: 0, wait: 0, mode: 'in', done: '' };
    this.stall = new Rig(env.things, stall());
    const sy = g.at(STALL.x, STALL.z, 6.5);
    this.stall.place(STALL.x, Number.isFinite(sy) ? sy : 6, STALL.z, STALL.yaw, 0, 0, 1.3);
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const step = this.pace.step(dt, viewDist(f, -305, 62));
    if (step < 0) {
      this.hideAll();
      return;
    }
    if (step === 0 && this.shown) return;
    dt = step;
    const first = !this.shown;
    this.shown = true;
    const c = f.clock;
    const day = f.night < 0.5;
    // ── Verandas and the jetty: sitting, looking out, turning to talk now and then ──
    for (const s of this.sitters) {
      const out = day || (c < s.until && c > 0.1);
      if (!out) {
        if (s.a.shown) s.a.hide();
        continue;
      }
      this.placeAt(s.a, s.x, s.y, s.z, s.yaw, first);
      s.a.pose(POSE.sit, now);
      s.a.lookAt(ex && s.a.dist(ex.x, ex.z) < 6 ? { x: ex.x, y: ex.y + 2, z: ex.z } : null, now + 1);
      s.a.step(dt, now);
    }
    // ── The stall and its seller (by day) ──
    const open = day && (c > 0.8 || c < 0.2);
    if (open) this.stall.write();
    else this.stall.hide();
    const fs = Math.sin(STALL.yaw);
    const fc = Math.cos(STALL.yaw);
    const sa = this.seller;
    if (open) {
      this.placeAt(sa, STALL.x - fs * 1.0, NaN, STALL.z - fc * 1.0, STALL.yaw, first);
      const giving = this.monk.mode === 'alms' && this.monk.wait > 0;
      sa.pose(giving ? POSE.kneel : POSE.sit, now);
      sa.lookAt(this.buyer.wait > 0 ? { x: this.buyer.a.x, y: this.buyer.a.y + 2, z: this.buyer.a.z } : null, now + 1);
      sa.step(dt, now);
    } else if (sa.shown) sa.hide();
    this.buy(dt, now, open, first);
    this.play(dt, now, f, day && (c > 0.9 || c < 0.2), first);
    this.monkWalk(dt, now, f);
  }

  /** Stand (or sit) someone at a spot on the village's floor (y NaN: the floor there). */
  private placeAt(a: Actor, x: number, y: number, z: number, yaw: number, first: boolean): void {
    if (!a.shown || first) {
      const gy = Number.isFinite(y) ? this.ground.at(x, z, y + 0.3) : this.ground.at(x, z, 7);
      a.warp(x, Number.isFinite(gy) ? gy : Number.isFinite(y) ? y : this.ground.field.heightAt(x, z), z, yaw);
      a.show();
      a.carry(1, 0);
    }
    a.goTo(x, z, 0.4);
    a.face(yaw);
  }

  /** A neighbour comes to buy now and then: walks over, talks a while, goes home. */
  private buy(dt: number, now: number, open: boolean, first: boolean): void {
    const b = this.buyer;
    const a = b.a;
    if (!open) {
      if (a.shown) a.hide();
      b.path = [];
      return;
    }
    const front: Point = { x: STALL.x + Math.sin(STALL.yaw) * 1.2, y: 6, z: STALL.z + Math.cos(STALL.yaw) * 1.2 };
    if (!b.path.length) {
      if (now < this.buyAt && !first) return;
      b.path = [BUYER_HOME, front, BUYER_HOME];
      b.leg = 1;
      b.wait = 0;
      a.warp(BUYER_HOME.x, this.ground.field.heightAt(BUYER_HOME.x, BUYER_HOME.z), BUYER_HOME.z, 0);
      if (first) {
        a.warp(front.x, this.ground.field.heightAt(front.x, front.z), front.z, STALL.yaw + Math.PI);
        b.wait = 25;
      }
      a.show();
    }
    const goal = b.path[b.leg];
    if (b.wait > 0) {
      b.wait -= dt;
      a.stop(STALL.yaw + Math.PI);
      a.pose(Math.sin(now * 0.4) > 0 ? POSE.talk : POSE.stand, now);
      a.lookAt({ x: this.seller.x, y: this.seller.y + 1.2, z: this.seller.z }, now + 1);
      if (b.wait <= 0) b.leg++;
    } else {
      a.pose(POSE.stand, now);
      a.lookAt(null);
      a.goTo(goal.x, goal.z, 0.7);
      a.face(null);
      if (a.dist(goal.x, goal.z) < 0.35) {
        if (b.leg === 1) b.wait = 22;
        else {
          a.hide();
          b.path = [];
          this.buyAt = now + 50 + 40 * frac(now * 0.137);
          return;
        }
      }
    }
    a.step(dt, now);
  }

  /** Two children playing tag on the beach by the nets and boats. */
  private play(dt: number, now: number, f: MapFrame, out: boolean, first: boolean): void {
    this.kids.forEach((a, k) => {
      if (!out) {
        if (a.shown) a.hide();
        return;
      }
      // (round an oval, the little one a step behind; now and then they stop, catch their breath, run the other way)
      const dir = Math.sin(now * 0.05) > 0 ? 1 : -1;
      const run = Math.sin(now * 0.31) > -0.5;
      const u = now * 0.28 * dir - k * 0.9;
      const x = TAG.x + Math.sin(u) * TAG.rx;
      const z = TAG.z + Math.cos(u) * TAG.rz;
      if (!a.shown || first) {
        a.warp(x, this.ground.field.heightAt(x, z), z, 0);
        a.show();
      }
      if (run) a.goTo(x, z, 2.4);
      else a.stop();
      a.face(null);
      a.pose(!run && k === 0 ? POSE.wave : POSE.stand, now);
      a.lookAt(k === 1 ? { x: this.kids[0].x, y: this.kids[0].y + 1, z: this.kids[0].z } : null, now + 1);
      a.step(dt, now);
    });
    if (out && f.dt > 0 && now > this.laughAt) {
      this.laughAt = now + 12 + 16 * frac(now * 0.173);
      const a = this.kids[0];
      f.calls.push({ kind: 'laugh', x: a.x, y: a.y + 1, z: a.z, gain: 0.7 });
    }
  }

  /** The monk: the morning alms round (down to the stall and back up), the afternoon walk home into the pagoda. */
  private monkWalk(dt: number, now: number, f: MapFrame): void {
    const m = this.monk;
    const a = m.a;
    const c = f.clock;
    const morning = c > 0.76 && c < 0.94;
    const afternoon = c > 0.06 && c < 0.22;
    if (!m.path.length) {
      const window = morning ? 'morning' : afternoon ? 'afternoon' : '';
      if (!window) m.done = '';
      if (!window || m.done === window) {
        if (a.shown) a.hide();
        return;
      }
      m.done = window;
      const stallFront: Point = { x: STALL.x + Math.sin(STALL.yaw) * 1.4, y: 6, z: STALL.z + Math.cos(STALL.yaw) * 1.4 };
      m.mode = morning ? 'alms' : 'home';
      m.path = morning ? [DOOR3, TOP, FOOT3, SQUARE, stallFront, SQUARE, FOOT3, TOP, DOOR3] : [TRAIL_END, SQUARE, FOOT3, TOP, DOOR3];
      m.leg = 1;
      m.wait = 0;
      const s = m.path[0];
      a.warp(s.x, s.y, s.z, 0);
      a.show();
      const look = dress('monk', 1031, { carry: morning ? CARRY.bowl : CARRY.umbrella });
      a.look = look;
      this.env.crowd.dress(a.i, look);
      a.carry(1, now);
    }
    const goal = m.path[m.leg];
    let pose: Pose = POSE.stand;
    if (m.wait > 0) {
      m.wait -= dt;
      a.stop(STALL.yaw + Math.PI);
      if (m.wait <= 0) m.leg++;
    } else {
      a.goTo(goal.x, goal.z, PACE);
      a.face(null);
      if (a.dist(goal.x, goal.z) < 0.3) {
        // (at the stall: he waits while the seller kneels and gives; at the door: in)
        if (m.mode === 'alms' && m.leg === 4) m.wait = 12;
        else if (m.leg >= m.path.length - 1) {
          a.hide();
          m.path = [];
          // (not out again until the next morning / afternoon)
          m.mode = 'in';
          return;
        } else m.leg++;
      }
    }
    if (m.mode === 'alms' && m.wait > 0) pose = POSE.stand;
    a.pose(pose, now);
    a.step(dt, now);
  }

  private hideAll(): void {
    if (!this.shown) return;
    this.shown = false;
    for (const a of this.actors) if (a.shown) a.hide();
    this.stall.hide();
    this.buyer.path = [];
    this.monk.path = [];
  }

  report(traffic: Traffic): void {
    for (const a of this.actors) if (a.shown) traffic.add(this.name, a.x, a.y, a.z);
  }
}

const DOOR3: Point = { x: DOOR[0], y: DOOR[1], z: DOOR[2] };
const FOOT3: Point = { x: FOOT[0], y: FOOT[1], z: FOOT[2] };

function frac(x: number): number {
  return x - Math.floor(x);
}
