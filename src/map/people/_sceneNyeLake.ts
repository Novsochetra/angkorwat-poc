import { Vector3 } from 'three';
import { hash3 } from '../../voxel/random';
import { graphicsNow } from '../graphics';
import { nyeAsked, nyeOff, nyeSeconds, NYE_TIMES, squareShown } from '../nye/clock';
import { LAKE_SHORE, LAKE_SHOW, LAKE_STAGE } from '../nye/plan';
import type { MapFrame } from '../types';
import { Actor } from './_actor';
import { dress } from './_kinds';
import { matDef } from './_nyePlan';
import {
  alongLake,
  alongRoute,
  BOAT_LAMP,
  CANDLE_EVERY,
  CANDLE_LIFE,
  candleDef,
  familyBoatDef,
  LAKE_COME,
  LAKE_GONE,
  LakeGround,
  LakeSite,
  LOTUS_FROM,
  LOTUS_TO,
  mahoriDef,
  netHeapDef,
  planLakeCrowd,
  stagePt,
  stoolDef,
  WATER,
  type LakeBoat,
  type LakeCrowdPlan,
  type LakeMember,
} from './_nyeLakePlan';
import { danceSide, PEOPLE_SCALE, POSE, SLOT, type Look, type Pose } from './_personModel';
import type { Obstacle, Point, Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';
import { Rig } from './_things';

/**
 * The people of New Year's Eve's second stage, by the great lake (AWP-35; where: nye/plan.ts `LAKE_*`, when:
 * nye/clock.ts; the crowd's plan: `_nyeLakePlan.ts`). The Kulen square's crowd (`_sceneNye.ts`) on the same clock,
 * with the lake's own character: the floating village's families and the fishermen's.
 *
 * **Ordinary days**: a couple strolling round the shore terrace in the evening, looking out over the lake; a
 * fisherman sitting by the terrace's front steps by day, mending his net.
 *
 * **The night** (from 22:20): families walk up the east shore trail from the floating village and onto the terrace
 * (nye/_lkShore.ts) — the mat families on the landing at the top of the ghat, the steps down to the water
 * (grandmother, mother, children; the grandfather on a low stool behind), the standing families over the landing and
 * the terrace, denser toward the stage, the jetty and the pale way up the middle kept open; children with sparklers,
 * phones up. Five boats of families paddle up from the village and moor on the open water beyond the stage's village
 * end, a paper lantern glowing at each bow. From 22:58 two of the mats' children go down the ghat to the second step
 * in the water, kneel and set lotus candles afloat in turn (a few of their own drift off along the shore, among the
 * venue's: nye/_lkWater.ts), squatting to watch them go. On the floating stage (22:30‥23:50) a mahori ensemble (roneat
 * ek, khim, tro) plays at its north-west end and two dancers circle in the romvong; at 23:50 they bow and step aside. The
 * last ten seconds: everyone to the board, phones up, arms counting; midnight: cheering, jumping, two of a family
 * turning to each other, the boats' children standing up; the fireworks over the lake behind the stage (heads up);
 * after the show they talk and from 00:09 go home (the boats paddle off; the performers down the jetty from 00:15),
 * the last by 00:40.
 *
 * Time: as the Kulen square's (`nyeSeconds`, a shot moves it on from its moment less the preroll). On the low graphics
 * level half the families stay home (`LakeMember.low`) and two boats fewer come.
 *
 * URL: `people=nyelake` (only them), with `countdown=<s>`, `fireworks=<s>`, `nye=+2m`.
 */

/** Seconds a shot's people live before its still (index.ts `PREROLL` + `REACT`). */
const SHOT_LEAD = 9.6;
/** The stage's times (s from midnight): the dance begins, ends (the bow), the performers go off the stage. */
const DANCE_FROM = NYE_TIMES.nightFrom + 15;
const DANCE_TO = -600;
const BOW = 6;
const OFF_AT = 900;
const STAGE_WALK = 0.8;
/** The ensemble's mat on the deck (stage frame u, v) and its players (mat space: x across, z ahead), their pose. */
const MAHORI = { u: 6.2, v: 1.2 } as const;
const PLAYERS: readonly [number, number][] = [
  [-1.0, -0.15],
  [0.1, -0.15],
  [1.4, 0.2],
];
/** The romvong's circle (stage frame), its radius (m) and pace (rad/s). */
const ROMVONG = { u: -2.6, v: 2.6, r: 1.05, w: 0.1 } as const;
/** Where the dancers stand aside (they all go off by the gangway and the jetty: `goOff`). */
const ASIDE = { u: 3.0, v: 3.4 } as const;
/** The board's face on the deck (v; nye/_lkStage.ts: its gate at the back, braziers before it at u ±3.9, v −3.2). */
const BOARD_V = -LAKE_STAGE.d / 2 + 1.64;
/** Lotus candles kept afloat at once (a ring of rigs). */
const CANDLES = 8;

/** The ordinary days' hours (`clock`): the evening's stroll, the mender by day. */
const STROLL = (c: number) => c >= 0.08 && c < 0.3;
const MENDING = (c: number) => c >= 0.76 || c < 0.12;

const EX_AT: Point = { x: 0, y: 0, z: 0 };
const P = { x: 0, z: 0, yaw: 0 };
const UV = { x: 0, z: 0 };
const V = new Vector3();

interface BoatRun {
  b: LakeBoat;
  rig: Rig;
  crew: Actor[];
  lit: boolean;
}

export class NyeLakeLife implements PeopleScene {
  readonly name = 'nyelake';
  readonly actors: Actor[] = [];
  private readonly plan: LakeCrowdPlan;
  private readonly crowdActors: Actor[] = [];
  private readonly boats: BoatRun[] = [];
  private readonly dancers: Actor[] = [];
  private readonly players: Actor[] = [];
  private readonly strollers: Actor[] = [];
  private readonly mender: Actor | null = null;
  private readonly menderAt = { x: 0, z: 0, yaw: 0 };
  private readonly mats: Rig[] = [];
  private readonly stools: Rig[] = [];
  private readonly music: Rig;
  private readonly net: Rig;
  private readonly candles: Rig[] = [];
  private readonly pace = new Pace(220, 560);
  private readonly ground: LakeGround;
  private readonly site: LakeSite;
  /** The deck's top (the water under the stage plus its height over it). */
  private readonly deck: number;
  private readonly stageLook: Point;
  private readonly boardAt: Point;
  private readonly sky: Point;
  private readonly matOut: Uint8Array;
  private readonly matFrom: Float64Array;
  /** The children who set lotus candles afloat (the candles go to them in turn). */
  private readonly lotusKids: number;
  private shown = false;
  private rigsOut = false;
  private netOut = false;
  private now0 = NaN;
  private phraseAt = -Infinity;
  private murmurAt = 0;

  constructor(private readonly env: PeopleEnv) {
    const { crowd, things } = env;
    const field = env.ground.field;
    this.site = new LakeSite(field);
    this.ground = new LakeGround(this.site, env.ground.walk);
    const ground = this.ground;
    const mk = (look: Look, avoid = true) => {
      const a = new Actor(crowd, look, ground).avoid(avoid ? env.traffic : null, this.name);
      this.actors.push(a);
      return a;
    };
    this.deck = this.site.deck;
    const sl = stagePt(ROMVONG.u + 1.5, ROMVONG.v, { x: 0, z: 0 });
    this.stageLook = { x: sl.x, y: this.deck + 1.6, z: sl.z };
    // (the board's middle: in its gate at the deck's back, nye/_lkStage.ts)
    const bd = stagePt(0, BOARD_V, { x: 0, z: 0 });
    this.boardAt = { x: bd.x, y: this.deck + 3.2, z: bd.z };
    this.sky = { x: LAKE_SHOW.x, y: WATER + LAKE_SHOW.low - 5, z: LAKE_SHOW.z };
    // The night's crowd (room left in the crowd, less the boats, the stage and the ordinary days' people: up to 78).
    const room = crowd.capacity - crowd.count - 22;
    this.plan = planLakeCrowd(this.site, Math.max(0, Math.min(78, room)));
    for (const m of this.plan.members) this.crowdActors.push(mk(m.look));
    for (const b of this.plan.boats) {
      const crew = b.crew.map((c) => mk(c.look, false));
      this.boats.push({ b, rig: new Rig(things, familyBoatDef(b.lamp)), crew, lit: true });
    }
    // The stage: the mahori players (white shirts, a dark sampot) and two romvong dancers in silk.
    PLAYERS.forEach((_, k) => {
      const look = dress('villager', 9760 + k, { sex: 'm', hat: 'none', age: k === 2 ? 'old' : undefined });
      const colors = look.colors.slice();
      for (const s of [SLOT.top, SLOT.sleeveL, SLOT.sleeveR]) colors[s] = 0xf2eee4;
      colors[SLOT.hips] = colors[SLOT.thigh] = 0x2a4a6a;
      this.players.push(mk({ ...look, colors }, false));
    });
    for (let k = 0; k < 2; k++) this.dancers.push(mk(dress('villager', 9770 + k, { sex: k ? 'm' : 'f', hat: 'none' }), false));
    // (in silk for the dance: a gold-bordered sampot, a bright top)
    for (const [k, top, low] of [
      [0, 0xf2a0b8, 0x6a2a8a],
      [1, 0xf4f0e6, 0xa82838],
    ] as const) {
      const a = this.dancers[k];
      const colors = a.look.colors.slice();
      for (const s of [SLOT.top, SLOT.sleeveL, SLOT.sleeveR]) colors[s] = top;
      for (const s of [SLOT.hips, SLOT.thigh, SLOT.shin]) colors[s] = low;
      colors[SLOT.accent] = 0xe0b048;
      a.look = { ...a.look, colors };
      crowd.dress(a.i, a.look);
    }
    // The ordinary days: a couple strolling in the evening, the fisherman mending his net.
    this.strollers.push(mk(dress('villager', 9780, { sex: 'f', hat: 'krama' })), mk(dress('villager', 9781, { sex: 'm', hat: 'none' })));
    const m0 = this.plan.mats[2] ?? this.plan.mats[0];
    if (m0) {
      const fisher = dress('fisherman', 9790);
      this.mender = mk({ ...fisher, carry: 0 });
      // (by the steps, a little toward the water from where the mat lies on the night, facing the lake)
      this.menderAt = { x: m0.x - Math.sin(m0.yaw) * 1.2, z: m0.z - Math.cos(m0.yaw) * 1.2, yaw: m0.yaw + Math.PI };
    }
    // Their things.
    this.plan.mats.forEach((_, k) => this.mats.push(new Rig(things, matDef(2.9, 2.1, k + 1))));
    this.plan.stools.forEach(() => this.stools.push(new Rig(things, stoolDef())));
    this.music = new Rig(things, mahoriDef());
    this.net = new Rig(things, netHeapDef());
    for (let k = 0; k < CANDLES; k++) this.candles.push(new Rig(things, candleDef()));
    this.lotusKids = Math.max(1, this.plan.members.filter((m) => m.role === 'lotus').length);
    this.matOut = new Uint8Array(this.plan.mats.length);
    this.matFrom = new Float64Array(this.plan.mats.length).fill(Infinity);
    this.plan.mats.forEach((m, k) => {
      const g = this.plan.groups[m.group];
      const lead = this.plan.members.find((p) => p.group === m.group);
      if (g && lead) this.matFrom[k] = g.start + lead.cum[lead.cum.length - 1] / g.v - 2;
    });
    const ms = this.plan.members;
    const n = (f: (m: LakeMember) => boolean) => ms.filter(f).length;
    const crew = this.plan.boats.reduce((s, b) => s + b.crew.length, 0);
    const crewLow = this.plan.boats.reduce((s, b) => s + (b.low ? b.crew.length : 0), 0);
    console.info(
      `[map] nye lake people: ${ms.length} on the terrace (${n((m) => m.low)} on low; ${this.plan.groups.length} families, ${this.plan.mats.length} mats, ${n((m) => m.role === 'sit' || m.role === 'lotus')} seated, ${n((m) => m.role === 'stool')} on stools, ${n((m) => m.kid)} children, ${n((m) => m.sparkler)} sparklers, ${n((m) => m.phone)} phones, ${n((m) => m.role === 'lotus')} with lotus candles), ${this.plan.boats.length} boats with ${crew} (${crewLow} on low), ${this.plan.candles.length} candles, ${this.actors.length} in all`,
    );
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const step = this.pace.step(dt, viewDist(f, LAKE_SHORE.x, LAKE_SHORE.z));
    if (step < 0 || !squareShown() || nyeOff()) {
      this.hideAll();
      return;
    }
    if (step === 0 && this.shown) return;
    dt = step;
    this.shown = true;
    if (this.env.shot && Number.isNaN(this.now0)) this.now0 = now;
    const s = nyeSeconds() + (this.env.shot ? now - this.now0 - SHOT_LEAD : 0);
    const night = (!this.env.shot || nyeAsked()) && s >= LAKE_COME && s < NYE_TIMES.nightTo;
    const c = f.clock - Math.floor(f.clock);
    const low = graphicsNow.level === 'low';
    this.rigs(night, s, low);
    // The ordinary days.
    this.stroll(!night && STROLL(c), now, dt, ex);
    this.mend(!night && MENDING(c), now, dt, ex);
    // The night.
    const ms = this.plan.members;
    for (let k = 0; k < ms.length; k++) this.member(k, night && (!low || ms[k].low), s, now, dt, ex);
    for (const b of this.boats) this.boat(b, night && (!low || b.b.low), s, now, dt, f);
    this.floatCandles(night, s, now);
    this.stage(night, s, now, dt, f);
    // (the crowd's murmur, children laughing: never in shots)
    if (night && f.dt > 0 && now > this.murmurAt && s > LAKE_COME + 400 && s < LAKE_GONE) {
      this.murmurAt = now + 3.6;
      if (viewDist(f, LAKE_SHORE.x, LAKE_SHORE.z) < 120) {
        f.calls.push({ kind: 'market', x: LAKE_SHORE.x, y: WATER + 4.5, z: LAKE_SHORE.z, gain: 0.45 });
        const k = Math.floor(hash3(Math.floor(now), 7, 5, 2027) * ms.length);
        const a = this.crowdActors[k];
        if (a && ms[k].kid && a.shown && s < -60) f.calls.push({ kind: 'laugh', x: a.x, y: a.y + 1, z: a.z, gain: 0.5 });
      }
    }
  }

  /** The mats and stools (from when each family comes to when they go), the ensemble's mat (the night), the net (by day). */
  private rigs(night: boolean, s: number, low = false): void {
    const { mats, stools, members, groups } = this.plan;
    for (let k = 0; k < mats.length; k++) {
      const m = mats[k];
      const g = groups[m.group];
      const out = night && (!low || m.low) && s >= this.matFrom[k] && s < g.leave;
      if (out === !!this.matOut[k]) continue;
      this.matOut[k] = out ? 1 : 0;
      if (out) this.mats[k].place(m.x, this.groundAt(m.x, m.z), m.z, m.yaw).write();
      else this.mats[k].hide();
      for (let j = 0; j < stools.length; j++) {
        const st = stools[j];
        if (members[st.member].group !== m.group) continue;
        if (out) this.stools[j].place(st.x, this.groundAt(st.x, st.z), st.z, st.yaw, 0, 0, this.env.crowd.scale(this.crowdActors[st.member].i)).write();
        else this.stools[j].hide();
      }
    }
    if (night !== this.rigsOut) {
      this.rigsOut = night;
      if (night) {
        stagePt(MAHORI.u, MAHORI.v, UV);
        this.music.place(UV.x, this.deck, UV.z, LAKE_STAGE.yaw).write();
      } else this.music.hide();
    }
  }

  private groundAt(x: number, z: number): number {
    const y = this.ground.at(x, z, WATER + 4);
    return Number.isFinite(y) ? y : this.ground.field.heightAt(x, z);
  }

  /** Show `a` at (x, z) (warped there when hidden or far). */
  private put(a: Actor, x: number, z: number, yaw: number, far = 5): void {
    if (!a.shown || a.riding || a.dist(x, z) > far) {
      a.warp(x, this.groundAt(x, z), z, yaw);
      a.show();
    }
  }

  /** The evening's couple: round the terrace, stopping at its front to look out over the lake. */
  private stroll(on: boolean, now: number, dt: number, ex: Obstacle | null): void {
    const cycle = 150;
    const u = (((now % cycle) + cycle) % cycle) / cycle;
    // (walking round three quarters of the time, then standing at the front, looking out)
    const walking = u < 0.78;
    const ang = walking ? (u / 0.78) * Math.PI * 2 : 0;
    const front = LAKE_STAGE.yaw + Math.PI;
    for (let k = 0; k < this.strollers.length; k++) {
      const a = this.strollers[k];
      if (!on) {
        if (a.shown) a.hide();
        continue;
      }
      const r = 0.62 + k * 0.06;
      const t = front + ang;
      const x = LAKE_SHORE.x + Math.sin(t) * LAKE_SHORE.rx * r;
      const z = LAKE_SHORE.z + Math.cos(t) * LAKE_SHORE.rz * r;
      this.put(a, x, z, t + Math.PI / 2, 6);
      if (walking) {
        const t2 = t + 0.08;
        a.goTo(LAKE_SHORE.x + Math.sin(t2) * LAKE_SHORE.rx * r, LAKE_SHORE.z + Math.cos(t2) * LAKE_SHORE.rz * r, 0.55);
        a.face(null);
        a.pose(k === 1 && u > 0.3 && u < 0.36 ? POSE.point : POSE.stand, now);
      } else {
        a.goTo(x, z, 0.5);
        a.face(LAKE_STAGE.yaw + Math.PI);
        a.pose(k === 0 && u > 0.86 && u < 0.92 ? POSE.photo : POSE.stand, now);
      }
      this.glance(a, ex, now);
      a.step(dt, now);
    }
  }

  /** The fisherman by the steps, mending his net (sitting, his head down over it, now and then looking up at the lake). */
  private mend(on: boolean, now: number, dt: number, ex: Obstacle | null): void {
    const a = this.mender;
    if (!a) return;
    const m = this.menderAt;
    if (on !== this.netOut) {
      this.netOut = on;
      if (on) {
        const k = PEOPLE_SCALE;
        const nx = m.x + Math.sin(m.yaw) * 0.55 * k;
        const nz = m.z + Math.cos(m.yaw) * 0.55 * k;
        this.net.place(nx, this.groundAt(nx, nz), nz, m.yaw, 0, 0, k).write();
      } else this.net.hide();
    }
    if (!on) return void (a.shown && a.hide());
    this.put(a, m.x, m.z, m.yaw);
    a.goTo(m.x, m.z, 0.4);
    a.face(m.yaw);
    a.pose(POSE.sit, now);
    const w = Math.floor((now + 3) / 14);
    a.tilt(hash3(w, a.i, 9, 2027) < 0.2 ? 0 : 0.55 + 0.08 * Math.sin(now * 2.3));
    this.glance(a, ex, now);
    a.step(dt, now);
  }

  /** One of the terrace's crowd: on the way, in their place (a lotus child down at the water's edge), on the way home. */
  private member(k: number, on: boolean, s: number, now: number, dt: number, ex: Obstacle | null): void {
    const m = this.plan.members[k];
    const a = this.crowdActors[k];
    const g = this.plan.groups[m.group];
    const L = m.cum[m.cum.length - 1];
    const goneD = (s - g.leave) * g.v - m.lag;
    const comeD = (s - g.start) * g.v - m.lag;
    if (!on || comeD < 0 || goneD >= L) return void (a.shown && a.hide());
    if (comeD < L || goneD > 0) {
      const home = goneD > 0;
      const d = home ? L - goneD : comeD;
      alongLake(m, d, P);
      const behind = a.shown ? a.dist(P.x, P.z) : 0;
      this.put(a, P.x, P.z, home ? P.yaw + Math.PI : P.yaw, 8);
      alongLake(m, home ? d - 1.2 : d + 1.2, P);
      a.goTo(P.x, P.z, g.v + Math.min(0.7, behind * 0.25));
      a.face(null);
      a.pose(POSE.stand, now);
      a.carry(m.sparkler && s > -1500 ? 1 : 0, now);
      a.lookAt(null);
      a.tilt(0);
      a.step(dt, now);
      return;
    }
    // A lotus child: down to the water's edge, kneeling to set each candle afloat, squatting to watch it go.
    if (m.role === 'lotus' && s >= LOTUS_FROM && s < LOTUS_TO + 30) {
      const there = s < LOTUS_TO;
      const tx = there ? m.wx : m.x;
      const tz = there ? m.wz : m.z;
      // (a page opened now: already there)
      if (!a.shown || a.riding) this.put(a, tx, tz, m.wyaw);
      a.goTo(tx, tz, 0.7);
      a.lookAt(null);
      a.tilt(0);
      if (a.dist(tx, tz) > 0.3 || !there) {
        a.face(null);
        a.pose(POSE.stand, now);
      } else {
        a.face(m.wyaw);
        a.pose(this.lotusPose(m, s), now);
        a.tilt(0.3);
      }
      a.carry(0, now);
      a.step(dt, now);
      return;
    }
    this.put(a, m.x, m.z, m.yaw, 6);
    a.goTo(m.x, m.z, 0.6);
    a.pose(this.mood(m, a, s, now), now);
    if (ex && s < -10 && a.dist(ex.x, ex.z) < 2.5) this.glance(a, ex, now);
    a.step(dt, now);
    if (m.jumps && s >= 0 && s < 14 && a.shown) {
      const hop = Math.abs(Math.sin((s + k * 0.37) * Math.PI * 1.6)) * 0.22 * (1 - s / 14);
      a.crowd.place(a.i, a.x, a.y + hop, a.z, a.yaw);
    }
  }

  /** The lotus child at the water: kneeling as a candle of theirs goes on the water (handing it to the lake), else squatting. */
  private lotusPose(m: LakeMember, s: number): Pose {
    const cs = this.plan.candles;
    const nk = this.lotusKids;
    const n = Math.round((s - (LOTUS_FROM + 30)) / CANDLE_EVERY);
    for (let j = n - 1; j <= n + 1; j++) {
      const cd = cs[j];
      if (!cd || j % nk !== m.lotus) continue;
      const u = s - cd.t;
      if (u > -6 && u < -1.5) return POSE.kneel;
      if (u >= -1.5 && u < 1.5) return POSE.give;
    }
    return POSE.squat;
  }

  /** What someone in their place does now (as the Kulen square's: the stage, phones, the count, the cheer, the show, after). */
  private mood(m: LakeMember, a: Actor, s: number, now: number): Pose {
    const seated = m.role !== 'stand';
    const sitPose = m.role === 'stool' ? POSE.stool : POSE.sit;
    const w = Math.floor((s + a.i * 2.9) / 7);
    const h = hash3(w, a.i, 6, 2027);
    let yaw = m.yaw;
    let look: Point | null = this.boardAt;
    let pose: Pose = seated ? sitPose : POSE.stand;
    let hold = 0;
    if (s < -10) {
      look = s < DANCE_TO ? this.stageLook : this.boardAt;
      if (!seated) {
        if (m.phone && h < 0.22) pose = POSE.photo;
        else if (m.phone && h < 0.45) hold = 1;
        else if (!m.kid && h > 0.82) pose = POSE.talk;
        else if (m.kid && h > 0.86) pose = POSE.wave;
      } else if (m.phone && h < 0.2) hold = 1;
      if (hold) look = null;
      if (m.sparkler && s > -1500) hold = 1;
    } else if (s < 0) {
      if (!seated) pose = m.phone ? POSE.photo : s > -3 && h < 0.6 ? POSE.cheer : POSE.point;
      if (m.sparkler) hold = 1;
    } else if (s < 30) {
      if (m.role === 'stool') pose = POSE.stool;
      else if (seated) pose = m.kid ? POSE.cheer : h < 0.5 ? POSE.wave : POSE.sit;
      else if (m.partner >= 0 && s > 2 && s < 9) {
        const o = this.crowdActors[m.partner];
        yaw = a.yawTo(o.x, o.z);
        pose = POSE.give;
        look = null;
      } else pose = m.phone && h < 0.3 ? POSE.photo : h < 0.75 ? POSE.cheer : POSE.wave;
      if (m.sparkler) hold = 1;
    } else if (s < NYE_TIMES.show) {
      look = this.sky;
      yaw = Math.atan2(this.sky.x - m.x, this.sky.z - m.z) * 0.5 + m.yaw * 0.5;
      if (!seated) pose = m.phone && h < 0.5 ? POSE.photo : h > 0.93 ? POSE.cheer : h > 0.88 ? POSE.point : POSE.look;
      if (m.sparkler) hold = 1;
    } else if (!seated) pose = h < 0.35 ? POSE.talk : m.phone && h < 0.5 ? POSE.photo : h > 0.92 ? POSE.wave : POSE.stand;
    a.face(yaw);
    a.carry(hold, now);
    a.tilt(0);
    if (look) a.lookAt(look, now + 1);
    else a.lookAt(null);
    return pose;
  }

  /** A family's boat: paddled up from the village, moored before the stage (bobbing, its lantern lit), paddled home. */
  private boat(r: BoatRun, on: boolean, s: number, now: number, dt: number, f: MapFrame): void {
    const b = r.b;
    const L = b.cum[b.cum.length - 1];
    const comeD = (s - b.start) * b.v;
    const goneD = (s - b.leave) * b.v;
    if (!on || comeD < 0 || goneD >= L) {
      r.rig.hide();
      for (const a of r.crew) if (a.shown) a.hide();
      return;
    }
    let x = b.x;
    let z = b.z;
    let yaw = b.yaw;
    let moving = false;
    if (comeD < L) {
      alongRoute(b.route, b.cum, comeD, P);
      x = P.x;
      z = P.z;
      yaw = P.yaw;
      moving = true;
    } else if (goneD > 0) {
      // (backing off, round, and away the way they came)
      alongRoute(b.route, b.cum, L - goneD, P);
      x = P.x;
      z = P.z;
      yaw = P.yaw + Math.PI * Math.min(1, goneD / 6);
      moving = true;
    }
    const t = now + b.lamp * 1e-6 + b.x;
    const bob = 0.02 * Math.sin(t * 1.1);
    const roll = (moving ? 0.035 : 0.022) * Math.sin(t * 0.8);
    const pitch = 0.012 * Math.sin(t * 0.9 + 1);
    // (moored: swinging a little on its rope)
    if (!moving) yaw += 0.06 * Math.sin(t / 23);
    const y = WATER + 0.1 + bob;
    r.rig.place(x, y, z, yaw, pitch, roll, PEOPLE_SCALE).write();
    const lit = f.night > 0.3;
    if (lit !== r.lit) {
      r.lit = lit;
      r.rig.paint(BOAT_LAMP, lit ? b.lamp : 0xc8b8a0, lit ? 1 : 0);
    }
    for (let k = 0; k < r.crew.length; k++) {
      const a = r.crew[k];
      const c = b.crew[k];
      r.rig.point(c.seat[0], -0.05, c.seat[1], V);
      // (a child stands up to cheer at midnight; everyone else sits)
      const up = c.kid && !moving && s >= 0 && s < 30;
      let face = yaw;
      let look: Point | null = null;
      if (!moving) {
        if (s < -10) look = s < DANCE_TO ? this.stageLook : this.boardAt;
        else if (s < 30) look = this.boardAt;
        else if (s < NYE_TIMES.show) look = this.sky;
        if (look) face = yaw + Math.max(-0.9, Math.min(0.9, wrapA(Math.atan2(look.x - V.x, look.z - V.z) - yaw)));
      }
      a.ride(V.x, V.y - (up ? 0 : 0.02), V.z, face);
      if (!a.shown) {
        a.show();
        a.carry(0, now);
      }
      const paddling = moving && c.paddler;
      a.pose(paddling ? POSE.row : up ? POSE.cheer : POSE.sit, now);
      // (a phone or a sparkler held up now and then, seated)
      const h = hash3(Math.floor((s + k * 3.1) / 8), a.i, 4, 2027);
      if (paddling) a.crowd.gait(a.i, 0.55, 0, now);
      a.carry(c.look.carry && !moving && s > -1500 && s < NYE_TIMES.show && h < 0.5 ? 1 : 0, now);
      a.lookAt(look, now + 1);
      a.step(dt, now);
    }
  }

  /** The lotus candles on the water: the last `CANDLES` set afloat, drifting out and along the shore till they burn down. */
  private floatCandles(night: boolean, s: number, now: number): void {
    const cs = this.plan.candles;
    if (!night || !cs.length) {
      for (const r of this.candles) r.hide();
      return;
    }
    // (how many are afloat by now: the times rise in order)
    let n = Math.max(0, Math.min(cs.length, Math.floor((s - (LOTUS_FROM + 30)) / CANDLE_EVERY) + 2));
    while (n > 0 && cs[n - 1].t > s) n--;
    for (let k = 0; k < CANDLES; k++) {
      const j = n - 1 - k;
      const slot = ((j % CANDLES) + CANDLES) % CANDLES;
      const r = this.candles[slot];
      const cd = j >= 0 ? cs[j] : null;
      const age = cd ? s - cd.t : -1;
      if (!cd || age < 0 || age > CANDLE_LIFE) {
        r.hide();
        continue;
      }
      const d = Math.min(cd.far, cd.v * age);
      const bob = 0.012 * Math.sin(now * 1.3 + j);
      r.place(cd.x + cd.dx * d, WATER + 0.02 + bob, cd.z + cd.dz * d, j * 1.7 + age * 0.03, 0, 0, PEOPLE_SCALE).write();
    }
  }

  /** The floating stage: the romvong and the mahori, the bow, standing aside, going off. */
  private stage(night: boolean, s: number, now: number, dt: number, f: MapFrame): void {
    const on = night && s >= NYE_TIMES.nightFrom && s < OFF_AT + 60;
    const dancing = on && s >= DANCE_FROM && s < DANCE_TO;
    const fy = LAKE_STAGE.yaw;
    for (let k = 0; k < this.dancers.length; k++) {
      const a = this.dancers[k];
      if (!on) {
        if (a.shown) a.hide();
        continue;
      }
      // (the romvong: round a small circle, each across from the other, the dancer turned to the crowd)
      const th = now * ROMVONG.w + k * Math.PI;
      const hu = ROMVONG.u + Math.sin(th) * ROMVONG.r;
      const hv = ROMVONG.v + Math.cos(th) * ROMVONG.r * 0.7;
      const au = ASIDE.u + k * 1.1;
      let u = hu;
      let v = hv;
      let yaw = fy + 0.5 * Math.cos(th) - 0.2 * danceSide(now);
      let pose: Pose = POSE.stand;
      let walk = 0;
      if (s < DANCE_TO) {
        if (dancing) pose = POSE.dance;
      } else if (s < DANCE_TO + BOW) {
        pose = POSE.sampeah;
        yaw = fy;
      } else if (s < OFF_AT) {
        walk = this.walkTo(hu, hv, au, ASIDE.v, s - DANCE_TO - BOW);
        u = P.x;
        v = P.z;
        yaw = walk ? P.yaw : fy;
        pose = walk ? POSE.stand : s >= 0 && s < 30 ? (k ? POSE.wave : POSE.cheer) : s >= 30 && s < NYE_TIMES.show ? POSE.look : POSE.stand;
      } else {
        walk = this.goOff(au, ASIDE.v, s - OFF_AT - k * 1.6);
        if (!walk && s - OFF_AT > 10) {
          if (a.shown) a.hide();
          continue;
        }
        u = P.x;
        v = P.z;
        yaw = P.yaw;
      }
      this.onDeck(a, u, v, yaw, pose, walk, now, dt);
      a.performing = dancing;
      a.lookAt(s >= 30 && s < NYE_TIMES.show ? this.sky : null, now + 1);
    }
    for (let k = 0; k < this.players.length; k++) {
      const a = this.players[k];
      if (!on) {
        if (a.shown) a.hide();
        continue;
      }
      const [px, pz] = PLAYERS[k];
      // (mat space to the stage's frame: the mat faces the shore, its x along the stage's u)
      const hu = MAHORI.u + px;
      const hv = MAHORI.v + pz;
      let u = hu;
      let v = hv;
      let yaw = fy;
      let pose: Pose = POSE.sit;
      let walk = 0;
      if (s >= OFF_AT) {
        walk = this.goOff(hu, hv, s - OFF_AT - 5 - k * 1.6);
        if (!walk && s - OFF_AT > 12) {
          if (a.shown) a.hide();
          continue;
        }
        u = P.x;
        v = P.z;
        yaw = P.yaw;
        pose = POSE.stand;
      }
      this.onDeck(a, u, v, yaw, pose, walk, now, dt);
      a.performing = dancing;
      a.tilt(dancing ? 0.25 + 0.12 * Math.cos(now * 2.6 + k) : 0);
      a.lookAt(s >= 30 && s < NYE_TIMES.show ? this.sky : s < DANCE_TO ? null : this.boardAt, now + 1);
    }
    // (a phrase of music every few seconds while they play, from the ensemble's mat)
    if (dancing && f.dt > 0 && now - this.phraseAt > 7.1) {
      this.phraseAt = now;
      stagePt(MAHORI.u, MAHORI.v, UV);
      f.calls.push({ kind: 'pinpeat', x: UV.x, y: this.deck + 1, z: UV.z, gain: 0.8 });
    }
  }

  /** Where someone walking from (u0, v0) to (u1, v1) on the deck is `t` s after setting off (into `P`, stage frame); 1 while on the way. */
  private walkTo(u0: number, v0: number, u1: number, v1: number, t: number): number {
    const l = Math.hypot(u1 - u0, v1 - v0);
    const k = l > 0 ? Math.min(1, Math.max(0, (t * STAGE_WALK) / l)) : 1;
    P.x = u0 + (u1 - u0) * k;
    P.z = v0 + (v1 - v0) * k;
    // (the heading in the world: the stage frame's way turned into the map's)
    const du = u1 - u0;
    const dv = v1 - v0;
    const c = Math.cos(LAKE_STAGE.yaw);
    const sn = Math.sin(LAKE_STAGE.yaw);
    P.yaw = Math.atan2(c * du + sn * dv, -sn * du + c * dv);
    return t > 0 && k < 1 ? 1 : 0;
  }

  /**
   * Off the stage: from (u0, v0) to the gangway's opening at the front, then up the jetty to the terrace, `t` s after
   * setting off (into `P`); 1 while on the way.
   */
  private goOff(u0: number, v0: number, t: number): number {
    const site = this.site;
    const gv = site.jEnd - 0.4;
    const l1 = Math.hypot(u0, gv - v0);
    if (t * STAGE_WALK < l1) return this.walkTo(u0, v0, 0, gv, t);
    return this.walkTo(0, gv, 0, site.jStart + 2.5, t - l1 / STAGE_WALK);
  }

  /** On the deck, the jetty or the terrace's top (placed there: the people's walk map does not hold them) at (u, v) of the stage's frame. */
  private onDeck(a: Actor, u: number, v: number, yaw: number, pose: Pose, walk: number, now: number, dt: number): void {
    stagePt(u, v, UV);
    const site = this.site;
    const y = v <= site.jEnd ? this.deck : v >= site.jStart ? site.top : site.jettyY(0, v);
    a.ride(UV.x, y, UV.z, yaw);
    a.show();
    a.pose(pose, now);
    a.carry(0, now);
    a.step(dt, now);
    if (walk) a.crowd.gait(a.i, 1, a.crowd.stepRate(a.i, STAGE_WALK), now);
  }

  private glance(a: Actor, ex: Obstacle | null, now: number): void {
    if (!ex || a.dist(ex.x, ex.z) > 3) return;
    EX_AT.x = ex.x;
    EX_AT.y = ex.y + 2;
    EX_AT.z = ex.z;
    a.lookAt(EX_AT, now + 1);
  }

  private hideAll(): void {
    if (!this.shown) return;
    this.shown = false;
    this.rigs(false, 0);
    for (const r of this.boats) r.rig.hide();
    for (const r of this.candles) r.hide();
    if (this.netOut) {
      this.netOut = false;
      this.net.hide();
    }
    for (const a of this.actors) {
      a.performing = false;
      if (a.shown) a.hide();
    }
  }

  report(traffic: Traffic): void {
    for (const a of this.actors) if (a.shown && !a.riding) traffic.add(this.name, a.x, a.y, a.z);
  }
}

function wrapA(a: number): number {
  return a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
}
