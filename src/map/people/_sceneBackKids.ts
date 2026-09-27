import { hash3 } from '../../voxel/random';
import { eventsNow } from '../events';
import { len2 } from '../fauna/_len';
import type { BackSpots } from '../hamlet/_bhSpots';
import type { MapFrame } from '../types';
import { Actor, wrap } from './_actor';
import { dress, shade } from './_kinds';
import { FEAT, POSE, SLOT, type Look } from './_personModel';
import type { Ground, Obstacle, Point } from './_routes';
import type { PeopleEnv } from './_scene';
import { Splash, Way, within, type WayPoint } from './_sceneBackKit';

/**
 * The children of the hamlet behind Angkor Wat at the lotus pond, on hot
 * afternoons (`clock` 0.9‥0.18, not in a storm nor in snow): two boys (bare-chested,
 * in shorts) and two girls (swimming in their clothes, wet through) run
 * down the plank jetty and jump off its end, arms up, into the water with a
 * splash (`splashPlay`), bob up laughing (`laugh`), swim about splashing
 * each other, climb out by the bamboo ladder at the jetty's end or up the
 * stones on the bank, and go again; the little one mostly sits on the
 * jetty's edge watching and cheering, and now and then jumps too. One at a
 * time on the jetty. At dusk they climb out and run home to the children's
 * house (`routes.kids`). In a still the second boy is in the air.
 *
 * URL: `bhkids=<s>` in a still, the jumping boy that many seconds before
 * his jump (0: he takes off as the picture is taken; in a still without it
 * he is in the air).
 */

type State = 'away' | 'walkIn' | 'deck' | 'run' | 'jump' | 'under' | 'swim' | 'ladder' | 'steps' | 'sit' | 'walkOut';

interface Kid {
  a: Actor;
  role: number;
  st: State;
  /** Seconds in the state (negative: still waiting to start it). */
  t: number;
  dur: number;
  /** Riding (in the air, in the water): where they are. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Where they swim to. */
  tx: number;
  tz: number;
  /** Along the way home or to the pond. */
  s: number;
  /** A counter for their seeded choices. */
  n: number;
  /** Going home: climb out and walk. */
  leaving: boolean;
  exit: 'ladder' | 'steps';
  splashAt: number;
}

/** Swimming speed, running on the jetty, walking (m/s). */
const SWIM = 0.55;
const RUN = 2.7;
const WALK = 1.5;
/** A still's people clock runs this far from their first step to the picture (index.ts: `PREROLL`, `REACT`, 30 frames). */
const SHOT_SPAN = 10.1;
/** The jump: how long in the air (s), how far out and how high (m, drawn). */
const AIR = 0.72;
const OUT = 2.1;
const HOP = 0.95;

export class PondKids {
  readonly actors: Actor[] = [];
  private readonly kids: Kid[] = [];
  private readonly splash: Splash[];
  private readonly home: Way;
  private readonly back: Way;
  private readonly wp: WayPoint = { x: 0, z: 0, yaw: 0 };
  private readonly look: Point = { x: 0, y: 0, z: 0 };
  /** Who is on the jetty's runway now (one at a time). */
  private runway: Kid | null = null;
  private nextCall = 0;
  private shown = false;

  constructor(
    private readonly env: PeopleEnv,
    private readonly spots: BackSpots,
    private readonly ground: Ground,
    add: (a: Actor) => Actor,
  ) {
    const looks = [kidLook(2101, true, false), kidLook(2103, true, false), kidLook(2107, false, false), kidLook(2111, false, true)];
    looks.forEach((l, role) => {
      const a = add(new Actor(env.crowd, l, ground));
      this.kids.push({ a, role, st: 'away', t: 0, dur: 0, x: 0, y: 0, z: 0, yaw: 0, tx: 0, tz: 0, s: 0, n: role * 17, leaving: false, exit: role === 0 ? 'ladder' : 'steps', splashAt: 0 });
      this.actors.push(a);
    });
    this.splash = [new Splash(env.things), new Splash(env.things)];
    // (the kids' way runs from the jetty's root to their house's stair: `back` is the way home)
    this.back = new Way(spots.routes.kids);
    this.home = this.back.reversed();
  }

  /** The swimming window: hot afternoons, not in a storm, not while snow falls or lies (the Weather setting's dream). */
  private out(f: MapFrame): boolean {
    return within(f.clock, 0.9, 0.18) && eventsNow(f).shelter < 0.5 && f.weather.snow < 0.3 && f.weather.snowCover < 0.3;
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null, first: boolean): void {
    const out = this.out(f);
    if (first || !this.shown) this.shown = true;
    for (const k of this.kids) {
      if (k.st === 'away') {
        if (!out) continue;
        if (first) this.placeNow(k, now);
        else this.start(k, 'walkIn', 0);
      }
      if (!out && !k.leaving && k.st !== 'away') this.goHome(k);
      this.stepKid(k, dt, now, f, ex);
    }
    for (const s of this.splash) s.update(now);
    // (a laugh now and then while they play, when near)
    if (out && f.dt > 0 && now > this.nextCall && this.kids.some((k) => k.st === 'swim' || k.st === 'sit')) {
      this.nextCall = now + 9 + 12 * hash3(Math.floor(now), 3, 5, 151);
      const k = this.kids[Math.floor(hash3(Math.floor(now), 4, 6, 151) * 4) % 4];
      if (k.a.shown) f.calls.push({ kind: 'laugh', x: k.a.x, y: k.a.y + 1, z: k.a.z, gain: 0.55 });
    }
  }

  hide(): void {
    for (const k of this.kids) {
      k.st = 'away';
      k.leaving = false;
      if (k.a.shown) k.a.hide();
    }
    this.runway = null;
    this.shown = false;
  }

  // ── The states ────────────────────────────────────────────────────────────

  private start(k: Kid, st: State, dur: number, t = 0): void {
    k.st = st;
    k.t = t;
    k.dur = dur;
    k.n++;
  }

  private r(k: Kid, q: number): number {
    return hash3(k.n, k.role, q, 152);
  }

  /** Where each would be in the middle of the afternoon (a still, or coming into view). */
  private placeNow(k: Kid, now: number): void {
    const p = this.spots.pond;
    const a = k.a;
    a.show();
    a.carry(0, now);
    if (k.role === 1) {
      // (on the jetty's root, about to run and jump: in a still he is in the air)
      const q = this.env.params.get('bhkids');
      const [rx, rz] = p.jetty.root;
      a.warp(rx - 0.8, p.jetty.y, rz, -Math.PI / 2);
      const run = (rx - 0.8 - (p.jetty.end[0] + 0.35)) / RUN + 1.0;
      const lead = this.env.shot ? SHOT_SPAN - AIR * 0.45 - run : 2;
      this.start(k, 'deck', 0, -(q !== null ? Math.max(0, SHOT_SPAN - Number(q) - run) : Math.max(0, lead)));
    } else if (k.role === 3) {
      this.sitDown(k, now);
    } else {
      const ang = this.r(k, 1) * Math.PI * 2;
      k.x = p.swim.x + Math.cos(ang) * p.swim.r * 0.7;
      k.z = p.swim.z + Math.sin(ang) * p.swim.r * 0.7;
      k.y = this.swimY(k);
      this.pickSwim(k);
      // (in a still they keep swimming: the jetty is the jumping boy's)
      this.start(k, 'swim', (this.env.shot ? 16 : 6) + 6 * this.r(k, 2), 2 * this.r(k, 3));
    }
  }

  private swimY(k: Kid): number {
    return this.spots.pond.level - 0.62 * 1.7 * k.a.crowd.scale(k.a.i);
  }

  private pickSwim(k: Kid): void {
    const p = this.spots.pond.swim;
    const ang = this.r(k, 4) * Math.PI * 2;
    const d = Math.sqrt(this.r(k, 5)) * p.r;
    k.tx = p.x + Math.cos(ang) * d;
    k.tz = p.z + Math.sin(ang) * d;
  }

  private sitDown(k: Kid, now: number): void {
    const j = this.spots.pond.jetty;
    k.a.warp(j.end[0] + 2.2, j.y, j.end[1] + j.w / 2 - 0.3, 0);
    k.a.show();
    k.a.pose(POSE.sit, now);
    this.start(k, 'sit', 14 + 12 * this.r(k, 6));
  }

  private goHome(k: Kid): void {
    k.leaving = true;
    if (k.st === 'sit' || k.st === 'deck' || k.st === 'run') {
      k.s = 0;
      this.start(k, 'walkOut', 0);
      if (this.runway === k) this.runway = null;
    } else if (k.st === 'walkIn') this.start(k, 'walkOut', 0);
    else if (k.st === 'swim') k.dur = 0;
  }

  private stepKid(k: Kid, dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const a = k.a;
    const p = this.spots.pond;
    const j = p.jetty;
    k.t += dt;
    switch (k.st) {
      case 'away':
        return;
      case 'walkIn':
      case 'walkOut': {
        // Along the path between the house and the jetty's root.
        const way = k.st === 'walkIn' ? this.home : this.back;
        if (k.t <= dt) {
          if (k.st === 'walkIn' || !a.shown) {
            way.at(0, this.wp);
            a.warp(this.wp.x, this.ground.field.heightAt(this.wp.x, this.wp.z), this.wp.z, this.wp.yaw);
          }
          a.show();
          k.s = 0;
        }
        k.s = Math.min(way.len, k.s + WALK * dt);
        way.at(Math.min(way.len, k.s + 1.2), this.wp);
        a.pose(POSE.stand, now);
        a.goTo(this.wp.x, this.wp.z, k.leaving ? 2.2 : WALK);
        a.face(null);
        a.step(dt, now);
        if (k.s >= way.len && a.dist(this.wp.x, this.wp.z) < 0.5) {
          if (k.st === 'walkOut') {
            a.hide();
            k.st = 'away';
            k.leaving = false;
          } else this.start(k, 'deck', 0);
        }
        return;
      }
      case 'deck': {
        // On the jetty (or its root): wait for the runway, then run.
        const [rx, rz] = j.root;
        if (!a.shown) {
          a.warp(rx - 0.8, j.y, rz, -Math.PI / 2);
          a.show();
        }
        a.pose(POSE.stand, now);
        if (k.leaving) {
          this.start(k, 'walkOut', 0);
          return;
        }
        const jumper = this.runway;
        this.lookAtKid(a, jumper ?? this.kids[(k.role + 2) % 4], now);
        a.stop(-Math.PI / 2);
        a.step(dt, now);
        if (k.t >= 0 && (!jumper || jumper === k)) {
          this.runway = k;
          this.start(k, 'run', 0);
        }
        return;
      }
      case 'run': {
        // (full speed off the end: the goal is past it, the jump starts at its edge)
        const ex0 = j.end[0] + 0.35;
        a.pose(POSE.stand, now);
        a.goTo(ex0 - 1.5, j.end[1] + (k.role % 2 ? 0.15 : -0.15), RUN);
        a.face(-Math.PI / 2);
        a.lookAt(null);
        a.step(dt, now);
        if (a.x <= ex0 || k.t > 6) {
          k.x = a.x;
          k.y = a.y;
          k.z = a.z;
          k.yaw = -Math.PI / 2;
          this.start(k, 'jump', AIR);
        }
        return;
      }
      case 'jump': {
        // Out over the water, arms up, down in.
        const u = Math.min(1, k.t / AIR);
        const x = k.x - OUT * u;
        const y = k.y + (p.level - 0.3 - k.y) * u + HOP * 4 * u * (1 - u);
        a.ride(x, y, k.z, k.yaw);
        a.pose(POSE.cheer, now);
        a.step(dt, now);
        if (u >= 1) {
          k.x = x;
          k.y = y;
          if (this.runway === k) this.runway = null;
          const s = this.splash[k.role % 2];
          s.start(now, x, p.level, k.z, 1);
          if (f.dt > 0 && viewNear(f, x, k.z, 90)) {
            f.calls.push({ kind: 'splashPlay', x, y: p.level, z: k.z, gain: 0.9 });
            this.nextCall = Math.min(this.nextCall, now + 0.6);
          }
          this.start(k, 'under', 1.1);
        }
        return;
      }
      case 'under': {
        // Down under and bobbing up, then swimming.
        const u = Math.min(1, k.t / k.dur);
        const sy = this.swimY(k);
        const y = u < 0.35 ? p.level - 0.3 + (sy - 0.55 - (p.level - 0.3)) * (u / 0.35) : sy - 0.55 + 0.55 * ((u - 0.35) / 0.65);
        a.ride(k.x, y, k.z, k.yaw);
        a.pose(POSE.stand, now);
        a.step(dt, now);
        if (u >= 1) {
          k.y = sy;
          this.pickSwim(k);
          this.start(k, 'swim', 5 + 7 * this.r(k, 7));
        }
        return;
      }
      case 'swim': {
        // Towards a spot, bobbing, splashing now and then; at the end to the way out.
        const out = k.t > k.dur;
        if (out) {
          const ladder = k.exit === 'ladder' && !k.leaving;
          k.tx = ladder ? j.end[0] + 1.15 : p.steps.water[0];
          k.tz = ladder ? j.end[1] + j.w / 2 + 0.55 : p.steps.water[1];
        }
        const dx = k.tx - k.x;
        const dz = k.tz - k.z;
        const d = len2(dx, dz);
        if (d > 0.05) {
          const v = Math.min(d, SWIM * dt) / d;
          k.x += dx * v;
          k.z += dz * v;
          k.yaw = wrap(k.yaw + Math.max(-2 * dt, Math.min(2 * dt, wrap(Math.atan2(dx, dz) - k.yaw))));
        } else if (!out) this.pickSwim(k);
        const bob = 0.05 * Math.sin(now * 2.1 + k.role * 1.7);
        a.ride(k.x, this.swimY(k) + bob, k.z, k.yaw);
        // Splashing each other: arms up a moment, a small splash.
        const play = !out && Math.sin(now * 0.45 + k.role * 2.3) > 0.93;
        a.pose(play ? POSE.cheer : POSE.stand, now);
        if (play && now > k.splashAt) {
          k.splashAt = now + 4;
          this.splash[(k.role + 1) % 2].start(now, k.x + Math.sin(k.yaw) * 0.6, p.level, k.z + Math.cos(k.yaw) * 0.6, 0.45);
          if (f.dt > 0 && viewNear(f, k.x, k.z, 60)) f.calls.push({ kind: 'splashPlay', x: k.x, y: p.level, z: k.z, gain: 0.45 });
        }
        this.lookAtKid(a, this.kids[(k.role + 1) % 4], now);
        a.step(dt, now);
        if (out && d < 0.35) {
          k.exit = k.leaving ? 'steps' : k.exit;
          this.start(k, k.exit === 'ladder' ? 'ladder' : 'steps', k.exit === 'ladder' ? 1.4 : 2.2);
          k.tx = k.x;
          k.tz = k.z;
          // (the next time out, the other way now and then)
          if (k.role !== 0 && this.r(k, 8) < 0.3) k.exit = k.exit === 'ladder' ? 'steps' : 'ladder';
        }
        return;
      }
      case 'ladder': {
        // Up the bamboo ladder onto the jetty's end.
        const u = Math.min(1, k.t / k.dur);
        const topX = j.end[0] + 1.15;
        const topZ = j.end[1] + j.w / 2 - 0.35;
        const sy = this.swimY(k);
        a.ride(k.tx + (topX - k.tx) * u * u, sy + (j.y - sy) * Math.min(1, u * 1.15), k.tz + (topZ - k.tz) * u * u, Math.PI);
        a.pose(POSE.climb, now);
        a.step(dt, now);
        a.crowd.gait(a.i, 1, a.crowd.climbRate(a.i, (j.y - sy) / k.dur), now);
        if (u >= 1) {
          a.warp(topX, j.y, topZ, Math.PI);
          if (k.leaving) this.start(k, 'walkOut', 0);
          else if (this.runway && this.runway !== k) this.start(k, 'deck', 0, -1);
          else {
            this.runway = k;
            this.start(k, 'run', 0);
          }
        }
        return;
      }
      case 'steps': {
        // Up the stones onto the bank, then along to the jetty (or home).
        const u = Math.min(1, k.t / k.dur);
        const [bx, by, bz] = p.steps.bank;
        const sy = this.swimY(k);
        const y = sy + (by - sy) * Math.min(1, u * 1.2);
        a.ride(k.tx + (bx - k.tx) * u, y, k.tz + (bz - k.tz) * u, Math.atan2(bx - k.tx, bz - k.tz));
        a.pose(POSE.stand, now);
        a.step(dt, now);
        a.crowd.gait(a.i, 0.6, 1.2, now);
        if (u >= 1) {
          a.warp(bx, by, bz, a.yaw);
          if (k.leaving) {
            k.s = 0;
            this.start(k, 'walkOut', 0);
          } else this.start(k, 'deck', 0, -2 - 3 * this.r(k, 9));
        }
        return;
      }
      case 'sit': {
        // On the jetty's edge, watching, cheering a jump; now and then she stands up and jumps too.
        a.pose(this.runway && this.runway.st === 'jump' ? POSE.cheer : POSE.sit, now);
        this.lookAtKid(a, this.runway ?? this.kids[k.n % 3], now);
        if (ex && a.dist(ex.x, ex.z) < 5) {
          this.look.x = ex.x;
          this.look.y = ex.y + 2;
          this.look.z = ex.z;
          a.lookAt(this.look, now + 0.5);
        }
        a.stop(0);
        a.step(dt, now);
        if (k.t > k.dur && !this.runway) {
          if (this.r(k, 10) < 0.45) {
            this.runway = k;
            this.start(k, 'run', 0);
          } else this.sitDown(k, now);
        }
        return;
      }
    }
  }

  private lookAtKid(a: Actor, other: Kid | undefined, now: number): void {
    if (!other || !other.a.shown || other.a === a) return a.lookAt(null);
    this.look.x = other.a.x;
    this.look.y = other.a.y + 1;
    this.look.z = other.a.z;
    a.lookAt(this.look, now + 0.5);
  }
}

/** Near enough to be heard (m, from the camera). */
function viewNear(f: MapFrame, x: number, z: number, d: number): boolean {
  const c = f.camera.position;
  return len2(x - c.x, z - c.z) < d;
}

/**
 * A child dressed for the pond: a boy bare-chested in shorts, a girl in her
 * clothes, darker for being wet.
 */
function kidLook(seed: number, boy: boolean, young: boolean): Look {
  const l = dress('kid', seed, { young });
  const c = l.colors;
  const skin = c[SLOT.skin];
  const feats = new Set(l.feats);
  if (boy) {
    for (const s of [SLOT.top, SLOT.sleeveL, SLOT.sleeveR, SLOT.foreL, SLOT.foreR, SLOT.shin, SLOT.foot]) c[s] = skin;
    const shorts = [0x2a3a6a, 0xb03a30, 0x2a2a2e][seed % 3];
    c[SLOT.hips] = c[SLOT.thigh] = shorts;
    for (const f of [FEAT.collar, FEAT.skirt, FEAT.hairLong, FEAT.hairBun]) feats.delete(f);
  } else {
    if (!feats.has(FEAT.hairBun) && !feats.has(FEAT.hairLong)) feats.add(FEAT.hairLong);
    for (const s of [SLOT.top, SLOT.sleeveL, SLOT.sleeveR, SLOT.hips, SLOT.thigh]) c[s] = shade(c[s], 0.8);
    c[SLOT.hair] = shade(c[SLOT.hair], 0.7);
    c[SLOT.foot] = skin;
  }
  c[SLOT.sole] = skin;
  return { ...l, feats: [...feats] };
}
