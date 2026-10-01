import type { Object3D } from 'three';
import { DAK, type AlmsMonk } from '../roam/_dakBatHooks';
import { WalkMap } from '../roam/walkmap';
import type { MapFrame, MapPart } from '../types';
import { FV_STALLS } from '../village/_fvPlan';
import { JETTY, PAGODA, STILT_HOMES, VILLAGE_SPOTS, type HomeSpec } from '../village/_spots';
import { Actor, wrap } from './_actor';
import { dress } from './_kinds';
import { CARRY, POSE, type Pose } from './_personModel';
import { Ground, type Obstacle, type Point, type Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';
import { AlmsBowl, OpenBowl, Receiving } from './_sceneAlms';

/**
 * Life in the floating village (the `village` part, village/: its spots,
 * `VILLAGE_SPOTS`), calm and sparse:
 *
 * - two neighbours sitting on their verandas over the water, into the
 *   evening while the windows are lit;
 * - a man sitting at the end of the jetty, looking out over the lake;
 * - two children playing tag on the beach at the village's north end, by the
 *   nets and the boats pulled up (laughing, far off: `laugh`);
 * - a monk: in the morning his alms round from the pagoda down its naga
 *   stair to the market's fruit stall, where the fruit seller gives and
 *   kneels (`ALMS`: the market's people, _sceneVillageMarket.ts, see him
 *   there), and back; in the late afternoon coming home along the village
 *   trail, up the stair and into the pagoda. On his alms round he takes the
 *   explorer's rice too (dak bat: roam/_dakBat.ts, `DAK`, line `fv`): the
 *   explorer kneeling ahead of him on the village's ground, he comes to
 *   stand before him, holds his bowl out and lifts its lid
 *   (people/_sceneAlms.ts `Receiving`), blesses him, and walks on his way.
 *
 * The market's sellers, the women selling from boats, its buyers and eaters
 * are the market's own scene (`villagemarket`, _sceneVillageMarket.ts).
 * They stand on the village's real floors (its verandas, the jetty, the
 * stair, the market's stalls: a walk map of the village part, made once for
 * both scenes: `villageGround`).
 */

/** The monk's alms stop: in front of the market's fruit stall (village/_fvPlan.ts), facing it. */
const FRUIT = FV_STALLS.find((s) => s.id === 'fruit')!;
const STALL = { x: FRUIT.x + Math.sin(FRUIT.yaw) * (FRUIT.d / 2 + 1.1), z: FRUIT.z + Math.cos(FRUIT.yaw) * (FRUIT.d / 2 + 1.1), yaw: FRUIT.yaw };

/**
 * The monk at the fruit stall on his alms round: until when (the people's
 * clock) and where he stands, for the market's scene (its fruit seller gives
 * and kneels while he is there).
 */
export const ALMS = { until: -1e9, x: 0, z: 0 };
/** The monk's morning alms round: out between these clocks, and where he stops (the calendar of events asks them too: map/calendar.ts). */
export const ALMS_ROUND = { from: 0.76, to: 0.94, x: STALL.x, z: STALL.z };

/** The village's floors (its verandas, the jetty, the pagoda's stair, the market's stalls), a walk map made once for its scenes. */
const GROUNDS = new WeakMap<Object3D, Ground>();
export function villageGround(env: PeopleEnv, scene: Object3D): Ground {
  let g = GROUNDS.get(scene);
  if (g) return g;
  const parts: MapPart[] = [];
  for (const o of scene.children) if (o.name === 'village' || o.name === 'path') parts.push({ name: o.name, object: o });
  g = parts.some((p) => p.name === 'village') ? new Ground(env.ground.field, new WalkMap(env.ground.field, parts)) : env.ground;
  GROUNDS.set(scene, g);
  return g;
}

/** The children's tag round the nets and boats at the north end. */
const TAG = { x: -287.4, z: 21.5, rx: 1.6, rz: 5.2 };
/** The pagoda's stair and door, the square (VILLAGE_SPOTS). */
const DOOR = VILLAGE_SPOTS.pagodaDoor;
const FOOT = VILLAGE_SPOTS.pagodaStairFoot;
const TOP: Point = { x: PAGODA.x, y: PAGODA.terrace.y, z: PAGODA.stair.z1 + 0.6 };
/** On the path from the naga stair to the trails' end, and the trails' end (the market's corner). */
const PATH: Point = { x: -302.4, y: 6, z: 79 };
const JUNCTION: Point = { x: -300.3, y: 6, z: 74.6 };
const TRAIL_END: Point = { x: -284, y: 7.5, z: 83 };
/** The monk's walking pace (m/s). */
const PACE = 0.55;
/** His name in `DAK` (dak bat), and from how near he comes over to the explorer (m). */
const DAK_LINE = 'fv';
const DAK_ASIDE = 9;

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
  private readonly kids: Actor[];
  private readonly monk: Walker & { mode: 'in' | 'alms' | 'home'; done: string };
  /** Dak bat: his bowl open for alms, his slot, the explorer's offering (its step, time, whether he stands before him), the ask answered last. */
  private readonly bowl: OpenBowl;
  private readonly recv: Receiving;
  private readonly slot: AlmsMonk;
  private claim: { n: number; step: 'go' | 'settle' | 'open' | 'there' | 'close' | 'bless' | 'back'; t: number; aside: boolean } | null = null;
  private taken = -1;
  private readonly pt: Point = { x: 0, y: 0, z: 0 };
  private shown = false;
  private laughAt = 0;

  constructor(private readonly env: PeopleEnv, scene: Object3D) {
    const { crowd, traffic } = env;
    // The village's floors: its own walk map (verandas, the jetty, the pagoda's stair, the market), over the land.
    this.ground = villageGround(env, scene);
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
    this.kids = [actor(dress('kid', 1021)), actor(dress('kid', 1023, { young: true }))];
    this.monk = { a: actor(dress('monk', 1031, { carry: CARRY.bowl })), path: [], leg: 0, wait: 0, mode: 'in', done: '' };
    this.bowl = new OpenBowl(env.things, this.monk.a.look);
    this.recv = new Receiving(this.bowl);
    this.slot = DAK.slot(DAK_LINE, 0);
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
    const morning = c > ALMS_ROUND.from && c < ALMS_ROUND.to;
    const afternoon = c > 0.06 && c < 0.22;
    if (!m.path.length) {
      const window = morning ? 'morning' : afternoon ? 'afternoon' : '';
      if (!window) m.done = '';
      if (!window || m.done === window) {
        if (a.shown) a.hide();
        return;
      }
      m.done = window;
      const stallFront: Point = { x: STALL.x, y: 6, z: STALL.z };
      m.mode = morning ? 'alms' : 'home';
      m.path = morning ? [DOOR3, TOP, FOOT3, PATH, JUNCTION, stallFront, JUNCTION, PATH, FOOT3, TOP, DOOR3] : [TRAIL_END, JUNCTION, PATH, FOOT3, TOP, DOOR3];
      m.leg = 1;
      m.wait = 0;
      const s = m.path[0];
      a.warp(s.x, s.y, s.z, 0);
      a.show();
      // (the morning's look is his bowl's: `OpenBowl`, the same dress)
      const look = morning ? this.bowl.look : dress('monk', 1031, { carry: CARRY.umbrella });
      a.look = look;
      this.env.crowd.dress(a.i, look);
      a.carry(1, now);
    }
    const goal = m.path[m.leg];
    let pose: Pose = POSE.stand;
    // Dak bat: standing before the explorer for his rice, his own way waits.
    if (this.alms(dt, now, f, goal)) {
      if (!this.recv.busy) a.pose(POSE.stand, now);
      a.step(dt, now);
      this.recv.step(a, dt, now);
      this.writeSlot(f, goal);
      return;
    }
    if (m.wait > 0) {
      m.wait -= dt;
      a.stop(STALL.yaw + Math.PI);
      ALMS.until = now + m.wait;
      ALMS.x = a.x;
      ALMS.z = a.z;
      if (m.wait <= 0) m.leg++;
    } else {
      a.goTo(goal.x, goal.z, PACE);
      a.face(null);
      if (a.dist(goal.x, goal.z) < 0.3) {
        // (at the stall: he waits while the seller gives and kneels; at the door: in)
        if (m.mode === 'alms' && m.leg === 5) m.wait = 12;
        else if (m.leg >= m.path.length - 1) {
          a.hide();
          m.path = [];
          // (not out again until the next morning / afternoon)
          m.mode = 'in';
          this.slot.on = false;
          return;
        } else m.leg++;
      }
    }
    if (m.mode === 'alms' && m.wait > 0) pose = POSE.stand;
    a.pose(pose, now);
    a.step(dt, now);
    this.recv.step(a, dt, now);
    this.writeSlot(f, goal);
  }

  /** His `DAK` slot: on his alms round (walking, or at the stall), where he is and the way he goes. */
  private writeSlot(f: MapFrame, goal: Point): void {
    const a = this.monk.a;
    const sl = this.slot;
    // (not while he stands at the fruit stall: the seller is giving)
    sl.on = this.monk.mode === 'alms' && a.shown && this.monk.wait <= 0;
    sl.x = a.x;
    sl.y = a.y;
    sl.z = a.z;
    sl.yaw = a.dist(goal.x, goal.z) > 0.3 ? a.yawTo(goal.x, goal.z) : a.yaw;
    sl.t = f.t;
  }

  /**
   * Dak bat (roam/_dakBat.ts): his ask taken while on his alms round and walking toward him (ahead of him on his
   * way), the monk comes over to stand before him once near, holds his bowl out and lifts the lid; the rice in, the
   * lid back, the blessing; then on his way. True while he stands before him (his own way waits).
   */
  private alms(dt: number, now: number, f: MapFrame, goal: Point): boolean {
    const ask = DAK.ask;
    const m = this.monk;
    const a = m.a;
    if (ask.line === DAK_LINE && ask.state === 'ask' && ask.n !== this.taken) {
      this.taken = ask.n;
      const yaw = a.yawTo(goal.x, goal.z);
      const ahead = (ask.x - a.x) * Math.sin(yaw) + (ask.z - a.z) * Math.cos(yaw) > 0.4;
      if (m.mode !== 'alms' || !a.shown || !ahead) ask.state = 'none';
      else {
        ask.k = 0;
        ask.state = 'coming';
        this.claim = { n: ask.n, step: 'go', t: 0, aside: false };
      }
    }
    // (a check, `dakbat=give|bless` by his way: he stands before him at once)
    if (ask.snap && ask.line === '' && ask.state !== 'none' && m.mode === 'alms' && a.shown && a.dist(ask.mx, ask.mz) < 12) {
      ask.snap = false;
      ask.line = DAK_LINE;
      ask.k = 0;
      this.taken = ask.n;
      const bless = ask.state === 'bless';
      this.claim = { n: ask.n, step: bless ? 'bless' : 'there', t: 0, aside: true };
      a.warp(ask.mx, this.ground.at(ask.mx, ask.mz, a.y + 0.5), ask.mz, ask.myaw);
      a.carry(1, now);
      this.bowl.fill = 0.35;
      if (!bless) this.recv.open(a, now, true);
      AlmsBowl.mouth(a, 1, this.pt);
      ask.bx = this.pt.x;
      ask.by = this.pt.y;
      ask.bz = this.pt.z;
    }
    const c = this.claim;
    if (!c) return false;
    c.t += dt;
    const gone = ask.n !== c.n || ask.state === 'none' || ask.state === 'done';
    if (gone && c.step !== 'back') {
      c.step = 'back';
      this.recv.close();
    }
    switch (c.step) {
      case 'go':
        if (!c.aside && a.dist(ask.mx, ask.mz) < DAK_ASIDE) c.aside = true;
        if (c.aside && a.dist(ask.mx, ask.mz) < 0.12 && Math.abs(wrap(ask.myaw - a.yaw)) < 0.08 && a.speed < 0.02) {
          c.step = 'settle';
          c.t = 0;
        }
        break;
      case 'settle':
        if (c.t > 0.35) {
          c.step = 'open';
          this.recv.open(a, now);
        }
        break;
      case 'open':
        if (this.recv.phase === 'open') {
          c.step = 'there';
          AlmsBowl.mouth(a, 1, this.pt);
          ask.bx = this.pt.x;
          ask.by = this.pt.y;
          ask.bz = this.pt.z;
          ask.state = 'there';
        }
        break;
      case 'there':
        this.bowl.fill = Math.min(1, 0.3 + 0.4 * ask.rice);
        if (ask.state === 'given' || ask.state === 'bless') {
          c.step = 'close';
          this.recv.close();
        }
        break;
      case 'close':
        if (!this.recv.busy) c.step = 'bless';
        break;
      case 'bless':
        break;
      case 'back':
        // (the bowl back: on his way, his head up; past a point of it already, on to the next, not back to it)
        if (!this.recv.busy) {
          this.claim = null;
          a.tilt(0);
          const p = m.path;
          // (never past the fruit stall's stop: leg 5)
          while (m.wait <= 0 && m.leg < p.length - 1 && !(m.mode === 'alms' && m.leg === 5) && a.dist(p[m.leg + 1].x, p[m.leg + 1].z) < Math.hypot(p[m.leg + 1].x - p[m.leg].x, p[m.leg + 1].z - p[m.leg].z)) m.leg++;
        }
        return this.claim !== null;
    }
    if (!c.aside) return false;
    a.goTo(ask.mx, ask.mz, 0.7);
    a.face(ask.myaw);
    a.lookAt(null);
    a.tilt(c.step === 'bless' ? 0.38 : 0.3);
    void f;
    return true;
  }

  private hideAll(): void {
    if (!this.shown) return;
    this.shown = false;
    this.recv.stop(this.monk.a);
    this.slot.on = false;
    for (const a of this.actors) if (a.shown) a.hide();
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
