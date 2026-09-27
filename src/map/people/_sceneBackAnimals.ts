import { Group } from 'three';
import { hash3 } from '../../voxel/random';
import { CH, Flock } from '../fauna/_kit';
import { BUFFALO } from '../fauna/_landBuffalo';
import { len2 } from '../fauna/_len';
import { HOMES, homeFront, homeToWorld, MEADOW, PEN, type BackSpots, type P2, type P3 } from '../hamlet/_bhSpots';
import type { MapFrame, Subject } from '../types';
import { Actor, wrap } from './_actor';
import { dress } from './_kinds';
import { OX } from './_ox';
import { POSE, type Look, type Pose } from './_personModel';
import type { Ground, Obstacle, Point, Traffic } from './_routes';
import type { PeopleEnv } from './_scene';
import { raining, since, UMBRELLAS, Way, withUmbrella, within, type WayPoint } from './_sceneBackKit';

/**
 * The animals behind Angkor Wat and their herder:
 *
 * - **Buffalo** (`Wallow`): two water buffalo (the land animals' model,
 *   fauna/_landBuffalo.ts) lying in the muddy west end of the lotus pond
 *   from mid-morning to dusk (`clock` 0.84‥0.22), only their backs, heads
 *   and horns out of the water, chewing, turning their heads, flicking an
 *   ear; they lift their heads and look when the explorer comes near. At
 *   dusk they get up, wade out and lie down on the mud of the bank for the
 *   night; in the morning back in. A low call now and then (`buffalo`).
 * - **Cattle** (`Herd`): four white Khmer cows (the ox cart's zebu,
 *   `_ox.ts`) graze in the meadow south of the back trail by day, their
 *   herder (an old man in a palm-leaf hat and a krama) sitting in the shade
 *   of the big tree watching them. In the late afternoon (from `clock`
 *   0.05) he walks them home in a line along the back trail, up the lane
 *   and into the pen, their bells clonking (`cowBell`); the cows stand in
 *   the pen through the night; from dawn (0.78) he walks them back out.
 *   Seen part way (a still, coming into view), they are as far along as the
 *   clock says.
 *
 * URL: `bhherd=<s>` puts the herd that many seconds into its walk (the
 * way home in the afternoon's half of the day, out in the morning's).
 */

// ── Buffalo ──────────────────────────────────────────────────────────────────

const BUFF_SCALE = 1.3;
const WADE = 0.5;

interface Buff {
  i: number;
  at: 'water' | 'bank' | 'walk';
  want: 'water' | 'bank';
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Walking between the wallow and the bank: from, to, how far (0‥1). */
  from: P3;
  to: P3;
  u: number;
  rise: number;
}

export class Wallow {
  readonly flock = new Flock(BUFFALO, 2);
  private readonly buff: Buff[] = [];
  private nextCall = 0;

  constructor(
    private readonly spots: BackSpots,
    private readonly ground: Ground,
  ) {
    const p = spots.pond;
    for (let i = 0; i < 2; i++) {
      this.flock.setup(i, 0, 0.3 + 0.4 * i, 0.94 + 0.08 * i);
      const [wx, wz] = p.wallow[i];
      this.buff.push({ i, at: 'water', want: 'water', x: wx, y: 0, z: wz, yaw: i ? -2.4 : 1.3, from: [wx, 0, wz], to: [wx, 0, wz], u: 0, rise: 0 });
    }
  }

  private spot(b: Buff, where: 'water' | 'bank'): P3 {
    const p = this.spots.pond;
    if (where === 'bank') return p.bank[b.i];
    const [x, z] = p.wallow[b.i];
    return [x, p.level - 0.5, z];
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null, first: boolean): void {
    const want = within(f.clock, 0.84, 0.22) ? 'water' : 'bank';
    const fl = this.flock;
    for (const b of this.buff) {
      if (first) {
        // (straight to where they are now)
        const s = this.spot(b, want);
        b.at = b.want = want;
        [b.x, b.y, b.z] = s;
        b.yaw = want === 'water' ? (b.i ? -2.4 : 1.3) : b.i ? 0.9 : 2.2;
        fl.set(b.i, CH.rest, 1, now, true);
      }
      if (b.at !== 'walk' && b.at !== want) {
        // Get up and wade across.
        b.from = [b.x, b.y, b.z];
        b.to = this.spot(b, want);
        b.want = want;
        b.at = 'walk';
        b.u = 0;
        b.rise = 1.6;
        fl.set(b.i, CH.rest, 0, now);
      }
      let walking = false;
      if (b.at === 'walk') {
        if (b.rise > 0) b.rise -= dt;
        else {
          const [fx, , fz] = b.from;
          const [tx, ty, tz] = b.to;
          const d = len2(tx - fx, tz - fz) || 1;
          b.u = Math.min(1, b.u + (WADE * dt) / d);
          b.x = fx + (tx - fx) * b.u;
          b.z = fz + (tz - fz) * b.u;
          b.yaw = Math.atan2(tx - fx, tz - fz);
          // (standing on the pond's bed or the bank while it walks; lying at its end)
          b.y = this.ground.field.heightAt(b.x, b.z);
          walking = b.u < 1;
          if (b.u >= 1) {
            b.at = b.want;
            b.y = ty;
            fl.set(b.i, CH.rest, 1, now);
          }
        }
      }
      fl.gait(b.i, walking ? 1 : 0, walking ? 0.7 : 0.5, now);
      // Head: chewing, looking about; up and round at the explorer when he comes close.
      const near = ex ? len2(ex.x - b.x, ex.z - b.z) : 1e9;
      if (near < 9 && ex) {
        const rel = wrap(Math.atan2(ex.x - b.x, ex.z - b.z) - b.yaw);
        fl.set(b.i, CH.head, -0.6, now);
        fl.set(b.i, CH.turn, Math.round(Math.max(-1, Math.min(1, rel / 1.2)) * 10) / 10, now);
      } else {
        fl.set(b.i, CH.head, walking ? 0.2 : Math.round(10 * (-0.3 + 0.2 * Math.sin(now * 0.11 + b.i * 2))) / 10, now);
        fl.set(b.i, CH.turn, walking ? 0 : Math.round(10 * 0.55 * Math.sin(now * 0.07 + b.i * 2.4)) / 10, now);
      }
      fl.place(b.i, b.x, b.y, b.z, b.yaw, BUFF_SCALE);
    }
    fl.flush(now);
    if (f.dt > 0 && now > this.nextCall) {
      this.nextCall = now + 35 + 50 * hash3(Math.floor(now), 5, 7, 161);
      const b = this.buff[Math.floor(now) % 2];
      const c = f.camera.position;
      if (f.night < 0.6 && len2(b.x - c.x, b.z - c.z) < 90) f.calls.push({ kind: 'buffalo', x: b.x, y: b.y + 1, z: b.z, gain: 0.45 });
    }
  }

  hide(): void {
    for (const b of this.buff) this.flock.hide(b.i);
    this.flock.flush(0);
  }

  subjects(out: Subject[]): void {
    const m = this.flock.mesh.instanceMatrix.array;
    for (let i = 0; i < 2; i++) if (this.flock.isShown(i)) out.push({ kind: 'buffalo', x: m[i * 16 + 12], y: m[i * 16 + 13] + 0.8, z: m[i * 16 + 14], r: 1.05 * BUFF_SCALE });
  }

  /** Into the traffic as animals (people step round them), from `obstacles[at]` on. */
  report(traffic: Traffic, obstacles: Obstacle[], at: number): void {
    for (let k = 0; k < this.buff.length; k++) {
      const b = this.buff[k];
      const o = obstacles[at + k];
      o.x = b.x;
      o.y = b.y;
      o.z = b.z;
      o.r = 1.2;
      traffic.list.push(o);
    }
  }
}

// ── The cattle and their herder ──────────────────────────────────────────────

const COWS = 4;
const COW_SCALE = 1.22;
/** Walking pace (m/s), the gap between the cows (s), the herder behind the last (s). */
const V = 1.15;
const GAP = 3.1;
const BEHIND = 2.6;
/** The afternoon's walk home and the morning's walk out begin (clock). */
const HOME = 0.05;
const OUT = 0.78;
/** The morning: the herder first walks from his house to the pen's gate; the cows go out after (s). */
const LEAD = 12;

interface Cow {
  i: number;
  home: Way;
  out: Way;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Grazing: where it has wandered to, and when it moves on. */
  gx: number;
  gz: number;
  moveAt: number;
}

export class Herd {
  readonly flock = new Flock(OX, COWS);
  readonly herder: Actor;
  /** His look, and with his black umbrella up in the rain. */
  private readonly herderDry: Look;
  private readonly herderWet: Look;
  private rain = false;
  private readonly cows: Cow[] = [];
  private readonly herderHome: Way;
  private readonly herderOut: Way;
  private readonly toGate: Way;
  private readonly toHouse: Way;
  private readonly stalls: P3[];
  private readonly wp: WayPoint = { x: 0, z: 0, yaw: 0 };
  private readonly look: Point = { x: 0, y: 0, z: 0 };
  /** Which walk the day is on, and the seconds into it. */
  private trip: 'home' | 'out' | null = null;
  private h = 0;
  private bellAt = 0;
  private readonly params: URLSearchParams;
  /** The herder sitting under his tree faces the cows; his seat on the blue house's veranda in the evening. */
  private readonly sitYaw = Math.atan2(MEADOW.graze[0][0] - MEADOW.herder[0], MEADOW.graze[0][1] - MEADOW.herder[1]);
  private readonly seat: P2;

  constructor(
    env: PeopleEnv,
    private readonly spots: BackSpots,
    private readonly ground: Ground,
    add: (a: Actor) => Actor,
  ) {
    this.params = env.params;
    const route = spots.routes.herd;
    const pen = route.slice(0, -1);
    this.stalls = [
      [PEN.x0 + 2.3, 0, PEN.z0 + 2.4],
      [PEN.x0 + 2.5, 0, PEN.z1 - 2.1],
      [PEN.x0 + 6.3, 0, PEN.z0 + 2.2],
      [PEN.x0 + 6.0, 0, PEN.z1 - 2.0],
    ];
    for (let i = 0; i < COWS; i++) {
      this.flock.setup(i, i % 2, 0.2 + 0.19 * i, 0.95 + 0.06 * (i % 3));
      const g = MEADOW.graze[i];
      const stall: P2 = [this.stalls[i][0], this.stalls[i][2]];
      const home = new Way([g, ...route.slice(1), stall]);
      this.cows.push({ i, home, out: home.reversed(), x: g[0], y: 0, z: g[1], yaw: 0, gx: g[0], gz: g[1], moveAt: 0 });
    }
    // The herder: from his tree behind the last cow to the gate; then home to the blue house (and the reverse in the morning).
    const gate = route[route.length - 2];
    const house = HOMES[1];
    const foot = homeToWorld(house, house.stair, homeFront(house).footZ + 0.6);
    this.herderHome = new Way([MEADOW.herder, ...pen.slice(1)]);
    this.herderOut = this.herderHome.reversed();
    this.toGate = new Way([foot, [gate[0] + 3, gate[1] - 1.5], gate]);
    this.toHouse = this.toGate.reversed();
    this.herderDry = dress('villager', 2203, { sex: 'm', age: 'old', hat: 'palm' });
    this.herderWet = withUmbrella(this.herderDry, UMBRELLAS[0]);
    this.herder = add(new Actor(env.crowd, this.herderDry, ground));
    const { zw, zf } = homeFront(house);
    this.seat = homeToWorld(house, house.w * 0.24, (zw + zf) / 2 + 0.2);
  }

  /** The seconds a cow `k` has walked `h` s into a trip (it starts after the one before it). */
  private cowS(k: number, h: number, trip: 'home' | 'out'): number {
    return Math.max(0, (h - (trip === 'out' ? LEAD : 0) - k * GAP) * V);
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null, first: boolean): void {
    const trip = within(f.clock, HOME, OUT) ? 'home' : 'out';
    if (trip !== this.trip || first) {
      const q = this.params.get('bhherd');
      this.h = q !== null && first ? Number(q) || 0 : since(f.clock, trip === 'home' ? HOME : OUT);
      this.trip = trip;
    } else this.h += dt;
    const h = this.h;
    const fl = this.flock;
    let walking = 0;
    for (const c of this.cows) {
      const way = trip === 'home' ? c.home : c.out;
      const s = this.cowS(c.i, h, trip);
      const moving = s > 0 && s < way.len;
      const done = s >= way.len;
      if (moving) {
        way.at(s, this.wp);
        // (a little to one side and the other along the way: not a straight file; from where it grazed at first)
        const side = 0.3 * Math.sin(s * 0.21 + c.i * 1.9);
        const k = trip === 'home' ? Math.min(1, s / 2.5) : 1;
        c.x = c.gx + (this.wp.x + Math.cos(this.wp.yaw) * side - c.gx) * k;
        c.z = c.gz + (this.wp.z - Math.sin(this.wp.yaw) * side - c.gz) * k;
        c.yaw = this.wp.yaw;
        walking++;
      } else if (done === (trip === 'out')) this.graze(c, now);
      else {
        // (in the pen at its stall: home for the night, or not yet let out)
        c.x = this.stalls[c.i][0];
        c.z = this.stalls[c.i][2];
        c.yaw = c.i % 2 ? 1.2 : -0.4;
      }
      const g = this.ground.at(c.x, c.z, c.y + 0.6);
      c.y = Number.isFinite(g) ? g : this.ground.field.heightAt(c.x, c.z);
      fl.place(c.i, c.x, c.y, c.z, c.yaw, COW_SCALE);
      const grazing = !moving && ((done && trip === 'out') || (!done && trip === 'home'));
      fl.gait(c.i, moving ? 1 : 0, moving ? V / (1.55 * COW_SCALE * 0.5) : 0.5, now);
      const night = f.night > 0.6 && !moving && !grazing;
      fl.set(c.i, CH.head, moving ? 0.3 : grazing ? (Math.sin(now * 0.09 + c.i * 1.7) > -0.5 ? 1 : 0) : night ? 0.9 : Math.round(10 * 0.25 * Math.sin(now * 0.13 + c.i)) / 10, now);
      fl.set(c.i, CH.turn, moving ? 0 : Math.round(10 * 0.4 * Math.sin(now * 0.1 + c.i * 2.3)) / 10, now);
    }
    fl.flush(now);
    this.herderStep(dt, now, f, ex, h, trip);
    // Bells: with the steps while they walk, now and then as they graze or stand.
    if (f.dt > 0 && now > this.bellAt) {
      const k = Math.floor(hash3(Math.floor(now * 3), 1, 9, 162) * COWS) % COWS;
      const c = this.cows[k];
      const cam = f.camera.position;
      this.bellAt = now + (walking ? 0.7 + 0.8 * hash3(Math.floor(now * 5), 2, 9, 162) : 5 + 8 * hash3(Math.floor(now), 3, 9, 162));
      if (len2(c.x - cam.x, c.z - cam.z) < 80) f.calls.push({ kind: 'cowBell', x: c.x, y: c.y + 1.1, z: c.z, gain: walking ? 0.55 + 0.2 * hash3(Math.floor(now * 7), 4, 9, 162) : 0.3 });
    }
  }

  /** A cow grazing: head down, a few steps to a new patch now and then. */
  private graze(c: Cow, now: number): void {
    const base = MEADOW.graze[c.i];
    if (now > c.moveAt) {
      c.moveAt = now + 14 + 10 * hash3(c.i, Math.floor(now), 3, 163);
      const a = hash3(c.i, Math.floor(now), 4, 163) * Math.PI * 2;
      c.gx = base[0] + Math.cos(a) * 1.0;
      c.gz = base[1] + Math.sin(a) * 1.0;
    }
    const dx = c.gx - c.x;
    const dz = c.gz - c.z;
    const d = len2(dx, dz);
    if (d > 0.02) {
      const v = Math.min(d, 0.012) / d;
      c.x += dx * v;
      c.z += dz * v;
      c.yaw = Math.atan2(dx, dz);
    }
  }

  private herderStep(dt: number, now: number, f: MapFrame, ex: Obstacle | null, h: number, trip: 'home' | 'out'): void {
    const a = this.herder;
    const last = this.cowS(COWS - 1, h, trip);
    const lastWay = trip === 'home' ? this.cows[COWS - 1].home : this.cows[COWS - 1].out;
    const wp = this.wp;
    let pose: Pose = POSE.stand;
    let tx = MEADOW.herder[0];
    let tz = MEADOW.herder[1];
    let speed = V;
    const sitYaw = this.sitYaw;
    if (trip === 'home') {
      if (last <= 0) {
        // Under the tree, watching them; he gets up to go.
        pose = h > (COWS - 1) * GAP - 2 ? POSE.stand : POSE.sit;
      } else if (last < lastWay.len) {
        this.herderHome.at(Math.min(this.herderHome.len, Math.max(0, last - BEHIND * V)), wp);
        tx = wp.x;
        tz = wp.z;
      } else {
        // The cows are in: at the gate a moment, then home.
        const t = h - ((COWS - 1) * GAP + lastWay.len / V);
        if (t > 22 || f.night > 0.75) {
          // (in the evening he sits out on his veranda a while; then in for the night)
          if (within(f.clock, 0.2, 0.34)) this.veranda(a, now, dt, ex);
          else if (a.shown) a.hide();
          return;
        }
        this.toHouse.at(Math.max(0, (t - 4) * 1.1), wp);
        tx = wp.x;
        tz = wp.z;
        speed = 1.1;
      }
    } else if (h < LEAD) {
      if (f.night > 0.8) {
        if (a.shown) a.hide();
        return;
      }
      this.toGate.at(h * (this.toGate.len / LEAD), wp);
      tx = wp.x;
      tz = wp.z;
    } else if (last < lastWay.len) {
      this.herderOut.at(Math.min(this.herderOut.len, Math.max(0, last - BEHIND * V)), wp);
      tx = wp.x;
      tz = wp.z;
    } else if (a.dist(tx, tz) < 0.4) pose = POSE.sit;
    if (!a.shown) {
      a.warp(tx, this.ground.field.heightAt(tx, tz), tz, sitYaw);
      a.show();
    }
    // (in the rain his umbrella is up, walking or sitting out with the cows)
    this.rain = raining(f, this.rain);
    const look = this.rain ? this.herderWet : this.herderDry;
    if (a.look !== look) {
      a.look = look;
      a.crowd.dress(a.i, look);
      a.carry(this.rain ? 1 : 0, now);
    }
    a.goTo(tx, tz, a.dist(tx, tz) > 3 ? speed * 1.4 : speed);
    a.face(pose === POSE.sit ? sitYaw : null);
    a.pose(pose, now);
    if (ex && a.dist(ex.x, ex.z) < 7) {
      this.look.x = ex.x;
      this.look.y = ex.y + 2;
      this.look.z = ex.z;
      a.lookAt(this.look, now + 0.5);
    } else if (pose === POSE.sit) {
      const c = this.cows[Math.floor(now / 9) % COWS];
      this.look.x = c.x;
      this.look.y = c.y + 1;
      this.look.z = c.z;
      a.lookAt(this.look, now + 0.5);
    } else a.lookAt(null);
    a.step(dt, now);
  }

  /** On the blue house's veranda in the evening, sitting, looking out over the yard. */
  private veranda(a: Actor, now: number, dt: number, ex: Obstacle | null): void {
    const house = HOMES[1];
    const [x, z] = this.seat;
    const y = this.spots.floors[1];
    if (!a.shown || a.dist(x, z) > 0.5) {
      a.warp(x, y, z, house.facing);
      a.show();
    }
    // (under the roof: the umbrella down)
    if (a.look !== this.herderDry) {
      a.look = this.herderDry;
      a.crowd.dress(a.i, a.look);
      a.carry(0, now);
    }
    a.stop(house.facing);
    a.pose(POSE.sit, now);
    if (ex && a.dist(ex.x, ex.z) < 9) {
      this.look.x = ex.x;
      this.look.y = ex.y + 2;
      this.look.z = ex.z;
      a.lookAt(this.look, now + 0.5);
    } else a.lookAt(null);
    a.step(dt, now);
  }

  hide(): void {
    for (const c of this.cows) this.flock.hide(c.i);
    this.flock.flush(0);
    if (this.herder.shown) this.herder.hide();
    this.trip = null;
  }

  subjects(out: Subject[]): void {
    const m = this.flock.mesh.instanceMatrix.array;
    for (let i = 0; i < COWS; i++) if (this.flock.isShown(i)) out.push({ kind: 'ox', x: m[i * 16 + 12], y: m[i * 16 + 13] + 1, z: m[i * 16 + 14], r: 1.0 * COW_SCALE });
  }

  /** Into the traffic as animals (people step round them), from `obstacles[at]` on. */
  report(traffic: Traffic, obstacles: Obstacle[], at: number): void {
    for (let k = 0; k < COWS; k++) {
      const c = this.cows[k];
      const o = obstacles[at + k];
      o.x = c.x;
      o.y = c.y;
      o.z = c.z;
      o.r = 1.0;
      traffic.list.push(o);
    }
  }
}

/** The animals' meshes (for the scene's object). */
export function animalMeshes(w: Wallow, h: Herd): Group {
  const g = new Group();
  g.name = 'people:back-animals';
  g.add(w.flock.mesh, h.flock.mesh);
  return g;
}
