import { hash3 } from '../../voxel/random';
import { graphicsNow } from '../graphics';
import { nyeAsked, nyeOff, nyeSeconds, NYE_TIMES, squareShown } from '../nye/clock';
import { BOARD, GATE, SALA, SALA_FLOOR, SHOW_AREA, SQUARE, STAGE, STALL_K, STALLS } from '../nye/plan';
import type { MapFrame } from '../types';
import { Actor } from './_actor';
import { dress } from './_kinds';
import { along, ALL_GONE, BOARD_AT, COME_FROM, ensembleDef, FLOOR, GATE_IN, GATE_OUT, MATS, matDef, picnicDef, planCrowd, SquareGround, STAGE_TOP, type Member, type NyeCrowdPlan } from './_nyePlan';
import { CARRY, danceSide, danceSteps, DANCE, FIT, POSE, SLOT, type Look, type Pose } from './_personModel';
import type { Obstacle, Point, Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';
import { Rig } from './_things';

/**
 * The people of New Year's Eve's festival square at Phnom Kulen's foot (AWP-35; where: nye/plan.ts, when:
 * nye/clock.ts; the crowd's plan: `_nyePlan.ts`).
 *
 * **Ordinary days** (from the day the square ships until the night, and the day after): a seller at each stall and
 * the juice cart and an attendant inside the gate from morning to late evening; children running round the gathering
 * ring by day; visitors in the evening who come in through the gate, take a photo before the board, look at a stall
 * and go.
 *
 * **The night** (from 22:20, ten minutes before the hold): groups come up the lantern walk from the village and in
 * through the gate, and spread over the whole square, each to its spot (the plan's): families watching the dance in
 * loose knots before the stage (a child on a father's shoulders now and then), families eating at the low tables
 * (they sit down on the stools, a bowl in hand), grandparents, mothers and children on mats with their picnic, elders
 * on the benches, friends chatting in circles (one talks, the others turn to them, a laugh), couples taking selfies
 * with the board behind them, children chasing round the fire bowls with sparklers, buyers queuing at every stall,
 * strollers going from stall to stall, three monks watching from the sala (they never cheer); the ring and the aisle
 * from the gate to the stage's stairs stay open. On the stage (22:30‥23:50) four apsara dancers dance to a pinpeat
 * ensemble seated at its west end (roneat ek, skor thom, sralai, chhing: its phrases are `pinpeat` calls, as at
 * Angkor Wat); at 23:50 the dancers bow to the crowd and step aside to the stage's east end. The last ten seconds:
 * the runners and strollers back in their places, the diners up from their stools, everyone facing the board, phones
 * up, arms counting; midnight: cheering, jumping, two of a group turning to each other; then the fireworks over the
 * hill, heads up, phones up, a cheer now and then; after the show the diners sit down again, they talk and from 00:08
 * go home down the lantern walk, the last by 00:40.
 *
 * Time: the night's own clock (`nyeSeconds`), so every player sees the same; in a shot (time stands still) the
 * people's clock moves it on from the still's moment minus the preroll (they walk, the dance goes on). On the low
 * graphics level half the groups stay home (`Member.low`).
 *
 * URL: `people=nye` (only them), with `countdown=<s>`, `fireworks=<s>`, `nye=+2m` (nye/clock.ts).
 */

/** Seconds a shot's people live before its still (index.ts `PREROLL` + `REACT`): its moment is then the URL's. */
const SHOT_LEAD = 9.6;
/** The stage's performers: the dancers' places (x, z: before the board), the ensemble's mat (its middle; players face east). */
const DANCERS: readonly [number, number][] = [
  [STAGE.x - 6.2, STAGE.front - 2.6],
  [STAGE.x - 2.2, STAGE.front - 2.3],
  [STAGE.x + 2.2, STAGE.front - 2.3],
  [STAGE.x + 6.2, STAGE.front - 2.6],
];
const ENSEMBLE = { x: STAGE.x0 + 2.4, z: STAGE.front - 4.5 } as const;
/** The players round the mat (rig space as `ensembleDef`: +x their facing), their pose. */
const PLAYERS: readonly [number, number, Pose][] = [
  [0.45, -0.6, POSE.sit],
  [0.45, 0.7, POSE.sit],
  [-0.55, -0.6, POSE.chant],
  [-0.55, 0.7, POSE.sit],
];
/**
 * Where the dancers stand aside for the countdown (the stage's east end, between the gate's pillar and the fire bowls
 * on the front edge: two by two) and where all go off it (behind the board).
 */
const ASIDE = { x: STAGE.x1 - 2.6, z: STAGE.front - 2.6 } as const;
const OFF_EAST = { x: STAGE.x1 - 2, z: STAGE.back + 1.5 } as const;
const OFF_WEST = { x: STAGE.x0 + 1.5, z: STAGE.back + 1.5 } as const;
/** The stage's times (s from midnight): the show begins, the dancers bow and step aside, they and the players go off. */
const DANCE_FROM = NYE_TIMES.nightFrom + 15;
const DANCE_TO = -600;
const BOW = 6;
const OFF_AT = 900;
/** Walking on the stage (m/s). */
const STAGE_WALK = 0.8;
/** The diners stand up from their stools for the count (s from midnight) and sit down again after the show. */
const UP_AT = -16;
const DOWN_AT = NYE_TIMES.show + 25;
/** Runners run and strollers stroll until this (s from midnight), then go to their places for the count. */
const RUN_TO = -18;
const STROLL_TO = -50;
/**
 * Where heads turn in the fireworks: toward the show's middle, low (the `look` pose leans them back as well: their
 * heads tipped up to the bursts' height would show only their crowns).
 */
const SKY: Point = { x: SHOW_AREA.x, y: SHOW_AREA.low - 5, z: SHOW_AREA.z };
const SKY_YAW_FROM = { x: SQUARE.x, z: SQUARE.z };
/** The dancers (watched): their heads' height on the stage. */
const STAGE_LOOK: Point = { x: STAGE.x, y: STAGE_TOP + 1.6, z: STAGE.front - 2.4 };
const EX_AT: Point = { x: 0, y: 0, z: 0 };
/** (a point looked at, filled per call: `lookAt` copies it) */
const AT: Point = { x: 0, y: 0, z: 0 };
/** What someone does in their place before the count (`NyeLife.before`'s answer, filled per call). */
interface Mood {
  pose: Pose;
  yaw: number;
  look: Point | null;
  hold: number;
}
const BEFORE: Mood = { pose: POSE.stand, yaw: 0, look: null, hold: 0 };

/** Someone's head (into `AT`). */
function headOf(o: Actor): Point {
  AT.x = o.x;
  AT.y = o.y + 1.85 * o.crowd.scale(o.i) * 0.75;
  AT.z = o.z;
  return AT;
}
const P = { x: 0, z: 0, yaw: 0 };

/** The ordinary days' hours (`clock`): sellers and the attendant, the children, the evening's visitors. */
const OPEN = (c: number) => c >= 0.8 || c < 0.4;
const KIDS = (c: number) => c >= 0.86 || c < 0.2;
const VISITS = (c: number) => c >= 0.06 && c < 0.4;

interface Seller {
  a: Actor;
  x: number;
  z: number;
  yaw: number;
}

/** A walk round points (x, z), staying at each a while (s) with a pose and facing; when each is reached and left. */
interface Round {
  a: Actor;
  pts: Float32Array;
  stay: Float32Array;
  poses: Pose[];
  faces: Float32Array;
  /** When they reach each point and leave it (s into the round), the round's length. */
  at: Float32Array;
  off: Float32Array;
  period: number;
  phase: number;
}

/** A stroller's round (`Member.visits`): its legs' times (s after they start it), its length. */
interface Stroll {
  pts: Float32Array;
  at: Float32Array;
  off: Float32Array;
  period: number;
}

export class NyeLife implements PeopleScene {
  readonly name = 'nye';
  readonly actors: Actor[] = [];
  private readonly plan: NyeCrowdPlan;
  private readonly crowdActors: Actor[] = [];
  /** Per member: their seat's height (seated, the sala's monks: placed there), a mate to turn to, the look they wear (1: eating). */
  private readonly rideY: Float32Array;
  private readonly mate: Int16Array;
  /** Each group's members (indices into the plan's members, by their place in the group). */
  private readonly byGroup: number[][];
  private readonly wearing: Uint8Array;
  private readonly strolls: (Stroll | null)[] = [];
  private readonly sellers: Seller[] = [];
  private readonly guard: Seller;
  private readonly kids: Actor[] = [];
  private readonly rounds: Round[] = [];
  private readonly dancers: Actor[] = [];
  private readonly players: Actor[] = [];
  private readonly mats: Rig[] = [];
  private readonly picnics: Rig[] = [];
  private readonly music: Rig;
  private readonly pace = new Pace(220, 560);
  private readonly ground: SquareGround;
  private shown = false;
  private rigsOut = false;
  private readonly matOut = new Uint8Array(MATS.length);
  /** When each mat's family has come (s from midnight). */
  private readonly matFrom = new Float64Array(MATS.length).fill(Infinity);
  /** (a shot: the people's clock at its first step) */
  private now0 = NaN;
  private phraseAt = -Infinity;
  private murmurAt = 0;

  constructor(private readonly env: PeopleEnv) {
    const { crowd, things } = env;
    const ground = new SquareGround(env.ground.field, env.ground.walk);
    this.ground = ground;
    const mk = (look: Look) => {
      const a = new Actor(crowd, look, ground).avoid(env.traffic, this.name);
      this.actors.push(a);
      return a;
    };
    // The night's crowd (as many as the crowd has room for, up to 150: the square is 68 × 48 m).
    const room = crowd.capacity - crowd.count - 29;
    this.plan = planCrowd(Math.max(0, Math.min(150, room)));
    const ms = this.plan.members;
    for (const m of ms) this.crowdActors.push(mk(m.look));
    // (seats' heights; the sala's floor over the land's lowest corner under it, as nye/_sqSala.ts builds it)
    const field = env.ground.field;
    const sala = Math.min(...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => field.heightAt(SALA.x + (sx * SALA.w) / 2, SALA.z + (sz * SALA.d) / 2)))) + SALA_FLOOR;
    this.rideY = new Float32Array(ms.map((m) => (m.lift < 0 ? sala : this.groundAt(m.x, m.z) + m.lift)));
    this.mate = new Int16Array(ms.map((m, k) => ms.findIndex((o, j) => j !== k && o.group === m.group && o.role !== 'shoulder')));
    this.byGroup = this.plan.groups.map(() => []);
    ms.forEach((m, k) => (this.byGroup[m.group][m.idx] = k));
    this.wearing = new Uint8Array(ms.length);
    for (const m of ms) this.strolls.push(m.visits ? strollOf(m) : null);
    // The sellers behind their stalls (each stall faces the square's middle: they stand at its back; the cart's at its handles).
    STALLS.forEach((s, k) => {
      const kind = s.kind;
      const a = mk(dress('vendor', 9300 + k, { hat: k % 2 ? 'krama' : 'none', goods: 'sweets', sex: k === 2 || kind === 'cane' ? 'm' : 'f' }));
      // (behind the counter: its back edge is 0.3 m before the stall's middle, nye/_sqStalls.ts `COUNTER`)
      const back = (kind === 'cane' ? 1.25 : 0.05) * STALL_K;
      this.sellers.push({ a, x: s.x - Math.sin(s.facing) * back, z: s.z - Math.cos(s.facing) * back, yaw: s.facing });
    });
    // The attendant just inside the gate, east of the way in, turned to it.
    {
      const look = dress('villager', 9310, { sex: 'm', hat: 'none' });
      const colors = look.colors.slice();
      for (const s of [SLOT.top, SLOT.sleeveL, SLOT.sleeveR]) colors[s] = 0xf2eee4;
      colors[SLOT.hips] = colors[SLOT.thigh] = colors[SLOT.shin] = 0x2a2e3a;
      const gx = GATE.x + GATE.w / 2 + 3.8;
      const gz = GATE.z - 7;
      this.guard = { a: mk({ ...look, colors }), x: gx, z: gz, yaw: Math.atan2(GATE.x - gx, GATE.z + 1 - gz) };
    }
    // Children running round the ring by day.
    for (let k = 0; k < 3; k++) this.kids.push(mk(dress('kid', 9320 + k)));
    // The evening's visitors: in through the gate, a photo before the board, a stall, out again.
    for (let k = 0; k < 6; k++) {
      const st = STALLS[k % STALLS.length];
      const sx = st.x + Math.sin(st.facing) * 2.4 * STALL_K;
      const sz = st.z + Math.cos(st.facing) * 2.4 * STALL_K;
      const px = BOARD.x - 6 + k * 2.3 + (k > 2 ? 1.6 : 0);
      const pz = STAGE.stairTo + 2.2 + (k % 2) * 0.8;
      const pts = new Float32Array([GATE_OUT.x, GATE_OUT.z + 3, GATE_IN.x + (k % 2 ? 0.6 : -0.6), GATE_IN.z, px, pz, sx, sz, GATE_IN.x, GATE_IN.z, GATE_OUT.x, GATE_OUT.z + 3]);
      const stay = new Float32Array([0, 0, 10 + (k % 3) * 3, 14 + (k % 2) * 8, 0, 60 + k * 9]);
      const faces = new Float32Array([0, 0, Math.atan2(BOARD.x - px, BOARD.z - pz), st.facing + Math.PI, 0, 0]);
      const look = dress('visitor', 9330 + k * 3, { carry: CARRY.phone });
      const r: Round = { a: mk(look), pts, stay, poses: [POSE.stand, POSE.stand, POSE.photo, POSE.talk, POSE.stand, POSE.stand], faces, at: new Float32Array(6), off: new Float32Array(6), period: 0, phase: k * 41 };
      let t = 0;
      for (let j = 0; j < 6; j++) {
        if (j > 0) t += Math.hypot(pts[2 * j] - pts[2 * j - 2], pts[2 * j + 1] - pts[2 * j - 1]) / 0.85;
        r.at[j] = t;
        t += stay[j];
        r.off[j] = t;
      }
      r.period = t;
      this.rounds.push(r);
    }
    // The stage: the dancers and the pinpeat players (white shirts).
    DANCERS.forEach((_, k) => {
      const a = mk(dress('dancer', 9350 + k, { young: k === 3 }));
      a.avoid(null);
      this.dancers.push(a);
    });
    PLAYERS.forEach((_, k) => {
      const look = dress('villager', 9360 + k, { sex: 'm', hat: 'none', age: k === 1 ? 'old' : undefined });
      const colors = look.colors.slice();
      for (const s of [SLOT.top, SLOT.sleeveL, SLOT.sleeveR]) colors[s] = 0xf2eee4;
      colors[SLOT.hips] = colors[SLOT.thigh] = 0x3a2a4a;
      const a = mk({ ...look, colors });
      a.avoid(null);
      this.players.push(a);
    });
    // Their things: the families' mats with their picnics, the ensemble.
    MATS.forEach((m, k) => {
      this.mats.push(new Rig(things, matDef(m.w, m.d, k)));
      this.picnics.push(new Rig(things, picnicDef(k)));
    });
    this.music = new Rig(things, ensembleDef());
    this.plan.mats.forEach((g, k) => {
      const gr = this.plan.groups[g];
      const lead = ms.find((p) => p.group === g);
      if (gr && lead) this.matFrom[k] = gr.start + lead.cum[lead.cum.length - 1] / gr.v - 2;
    });
    const n = (f: (m: Member) => boolean) => ms.filter(f).length;
    const acts = [...new Set(ms.map((m) => m.act))].map((a) => `${a} ${n((m) => m.act === a)}`).join(', ');
    console.info(
      `[map] nye people: ${ms.length} in the night's crowd (${n((m) => m.low)} on low; ${this.plan.groups.length} groups: ${acts}; ${n((m) => m.role === 'seat')} on seats, ${n((m) => m.role === 'sit')} on mats and the floor, ${n((m) => m.role === 'shoulder')} on shoulders, ${n((m) => m.kid)} children, ${n((m) => m.sparkler)} sparklers, ${n((m) => m.phone)} phones), ${this.actors.length} in all`,
    );
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const step = this.pace.step(dt, viewDist(f, SQUARE.x, SQUARE.z));
    if (step < 0 || !squareShown() || nyeOff()) {
      this.hideAll();
      return;
    }
    if (step === 0 && this.shown) return;
    dt = step;
    this.shown = true;
    // The night's clock (a shot: moved on by the people's clock from the still's moment, less the preroll).
    if (this.env.shot && Number.isNaN(this.now0)) this.now0 = now;
    const s = nyeSeconds() + (this.env.shot ? now - this.now0 - SHOT_LEAD : 0);
    // (the night only when the URL asks for it in a shot, as the hold: nye/clock.ts)
    const night = (!this.env.shot || nyeAsked()) && s >= COME_FROM && s < NYE_TIMES.nightTo;
    const c = f.clock - Math.floor(f.clock);
    const low = graphicsNow.level === 'low';
    this.rigs(night, s);
    // The ordinary days' people (the sellers and the attendant also through the night).
    const open = night ? s < ALL_GONE + 120 : OPEN(c);
    for (const sl of this.sellers) this.seller(sl, open, night, now, dt, ex);
    this.attend(open, now, dt, ex);
    this.children(!night && KIDS(c), now, dt);
    for (const r of this.rounds) this.visitor(r, !night && VISITS(c), now, dt, ex);
    // The night.
    const ms = this.plan.members;
    for (let k = 0; k < ms.length; k++) this.member(k, night && (!low || ms[k].low), s, now, dt, ex);
    this.stage(night, s, now, dt, f);
    // (the crowd's murmur, children laughing: never in shots)
    if (night && f.dt > 0 && now > this.murmurAt && s > COME_FROM + 400 && s < ALL_GONE) {
      this.murmurAt = now + 3.4;
      const hear = viewDist(f, SQUARE.x, SQUARE.z);
      if (hear < 120) {
        f.calls.push({ kind: 'market', x: SQUARE.x, y: FLOOR + 1.5, z: SQUARE.z - 6, gain: 0.5 });
        const k = Math.floor(hash3(Math.floor(now), 7, 3, 2027) * ms.length);
        const a = this.crowdActors[k];
        if (ms[k].kid && a.shown && s < -60) f.calls.push({ kind: 'laugh', x: a.x, y: a.y + 1, z: a.z, gain: 0.5 });
      }
    }
  }

  /** The mats with their picnics and the ensemble: out for the night, written once. */
  private rigs(night: boolean, s: number): void {
    // (each family's mat from when they come to when they get up to go)
    for (let k = 0; k < MATS.length; k++) {
      const m = MATS[k];
      const g = this.plan.groups[this.plan.mats[k]];
      const out = night && !!g && s >= this.matFrom[k] && s < g.leave;
      if (out === !!this.matOut[k]) continue;
      this.matOut[k] = out ? 1 : 0;
      if (out) {
        const y = this.groundAt(m.x, m.z);
        this.mats[k].place(m.x, y, m.z, 0).write();
        this.picnics[k].place(m.x, y + 0.03, m.z, k * 0.7).write();
      } else {
        this.mats[k].hide();
        this.picnics[k].hide();
      }
    }
    if (night === this.rigsOut) return;
    this.rigsOut = night;
    if (night) this.music.place(ENSEMBLE.x, STAGE_TOP, ENSEMBLE.z, 0).write();
    else this.music.hide();
  }

  private groundAt(x: number, z: number): number {
    const y = this.ground.at(x, z, FLOOR + 0.5);
    return Number.isFinite(y) ? y : FLOOR;
  }

  /** Show `a` at (x, z) (warped there when hidden or far: a page opened at any time has everyone where they belong). */
  private put(a: Actor, x: number, z: number, yaw: number, far = 5): void {
    if (!a.shown || a.riding || a.dist(x, z) > far) {
      a.warp(x, this.groundAt(x, z), z, yaw);
      a.show();
    }
  }

  private seller(sl: Seller, open: boolean, night: boolean, now: number, dt: number, ex: Obstacle | null): void {
    const a = sl.a;
    if (!open) return void (a.shown && a.hide());
    this.put(a, sl.x, sl.z, sl.yaw);
    a.goTo(sl.x, sl.z, 0.5);
    a.face(sl.yaw);
    // (busy at night: handing snacks over every few seconds; by day now and then, talking between)
    const w = Math.floor((now + a.i * 3.1) / (night ? 5 : 9));
    const h = hash3(w, a.i, 11, 2027);
    a.pose(h < (night ? 0.55 : 0.25) ? POSE.give : h < 0.75 ? POSE.stand : POSE.talk, now);
    a.carry(0, now);
    this.glance(a, ex, now);
    a.step(dt, now);
  }

  private attend(open: boolean, now: number, dt: number, ex: Obstacle | null): void {
    const g = this.guard;
    const a = g.a;
    if (!open) return void (a.shown && a.hide());
    this.put(a, g.x, g.z, g.yaw);
    a.goTo(g.x, g.z, 0.5);
    a.face(g.yaw);
    const h = hash3(Math.floor(now / 11), a.i, 12, 2027);
    a.pose(h < 0.2 ? POSE.wave : h < 0.35 ? POSE.point : POSE.stand, now);
    this.glance(a, ex, now);
    a.step(dt, now);
  }

  /** Children running round the ring, stopping now and then to wave and laugh. */
  private children(on: boolean, now: number, dt: number): void {
    for (let k = 0; k < this.kids.length; k++) {
      const a = this.kids[k];
      if (!on) {
        if (a.shown) a.hide();
        continue;
      }
      const cycle = 26;
      const u = now + k * 4.3;
      const lap = Math.floor(u / cycle);
      const run = Math.min(u - lap * cycle, 19);
      const running = u - lap * cycle < 19;
      const r = 8.9 + 0.5 * Math.sin(k * 2.1);
      const ang = ((lap * 19 + run) * 1.9) / r + k * 2.09;
      const x = SQUARE.x + Math.sin(ang) * r;
      const z = SQUARE.z + 1 + Math.cos(ang) * r;
      this.put(a, x, z, ang + Math.PI / 2);
      if (running) {
        const ahead = ang + 1.4 / r;
        a.goTo(SQUARE.x + Math.sin(ahead) * r, SQUARE.z + 1 + Math.cos(ahead) * r, 1.9);
        a.face(null);
        a.pose(POSE.stand, now);
      } else {
        a.goTo(x, z, 0.5);
        a.face(ang + Math.PI);
        a.pose(k === 1 ? POSE.cheer : POSE.wave, now);
      }
      a.step(dt, now);
    }
  }

  /** An evening visitor on their round (hidden while away, outside the gate). */
  private visitor(r: Round, on: boolean, now: number, dt: number, ex: Obstacle | null): void {
    const a = r.a;
    const u = (((now + r.phase) % r.period) + r.period) % r.period;
    const last = r.at.length - 1;
    if (!on || u >= r.at[last]) return void (a.shown && a.hide());
    let j = 1;
    while (j < last && u >= r.off[j]) j++;
    // (walking to point j, or staying there)
    const there = u >= r.at[j];
    const px = r.pts[2 * j];
    const pz = r.pts[2 * j + 1];
    if (there) {
      this.put(a, px, pz, r.faces[j]);
      a.goTo(px, pz, 0.6);
      a.face(r.faces[j]);
      a.pose(r.poses[j], now);
      a.carry(r.poses[j] === POSE.stand ? 1 : 0, now);
    } else {
      const k = (u - r.off[j - 1]) / Math.max(0.01, r.at[j] - r.off[j - 1]);
      const qx = r.pts[2 * j - 2];
      const qz = r.pts[2 * j - 1];
      this.put(a, qx + (px - qx) * k, qz + (pz - qz) * k, Math.atan2(px - qx, pz - qz));
      a.goTo(px, pz, 0.85);
      a.face(null);
      a.pose(POSE.stand, now);
      a.carry(0, now);
    }
    this.glance(a, ex, now);
    a.step(dt, now);
  }

  /** One of the night's crowd: on the way, settling onto a seat, in their place (doing what their group does), on the way home. */
  private member(k: number, on: boolean, s: number, now: number, dt: number, ex: Obstacle | null): void {
    const m = this.plan.members[k];
    const a = this.crowdActors[k];
    if (m.role === 'shoulder') return this.shoulder(m, a, on, s, now);
    const g = this.plan.groups[m.group];
    const L = m.cum[m.cum.length - 1];
    const E = m.settle;
    const comeD = (s - g.start) * g.v - m.lag;
    const goneD = (s - g.leave) * g.v - m.lag;
    if (!on || comeD < 0 || goneD >= L + E) {
      if (a.shown) a.hide();
      return;
    }
    // On the way (in, or home: the way back), a point a little ahead to walk to.
    if (comeD < L || goneD > E) {
      const home = goneD > E;
      const d = home ? L - (goneD - E) : comeD;
      this.wear(k, false);
      along(m, d, P);
      // (held up behind others or the explorer: a little quicker to catch up; far behind, there at once)
      const behind = a.shown && !a.riding ? a.dist(P.x, P.z) : 0;
      this.put(a, P.x, P.z, home ? P.yaw + Math.PI : P.yaw, 8);
      along(m, home ? d - 1.2 : d + 1.2, P);
      a.goTo(P.x, P.z, g.v + Math.min(0.7, behind * 0.25));
      a.face(null);
      a.pose(POSE.stand, now);
      a.carry(m.sparkler && s > -1500 ? 1 : 0, now);
      a.lookAt(null);
      a.step(dt, now);
      return;
    }
    // Onto their seat or the sala's floor (the last metre placed, not walked), up for the count, down again after.
    if (E > 0) {
      let u = Math.min(1, (comeD - L) / E, 1 - Math.max(0, goneD) / E);
      if (m.act === 'table') u = Math.min(u, s < UP_AT || s >= DOWN_AT + 1.6 ? 1 : s < DOWN_AT ? Math.max(0, 1 - (s - UP_AT) / 1.6) : (s - DOWN_AT) / 1.6);
      if (u < 1) return this.settling(k, m, a, Math.max(0, u), s, now, dt, ex);
      this.wear(k, m.act === 'table');
      a.ride(m.x, this.rideY[k], m.z, m.yaw);
      a.show();
      const pose = this.mood(k, m, a, s, now, true);
      a.pose(pose, now);
      a.step(dt, now);
      return;
    }
    // Running round the fire bowl, strolling round the stalls (before the count).
    if (m.role === 'run' && (s < RUN_TO || s >= NYE_TIMES.show + 40)) return this.run(m, a, now, dt);
    if (m.role === 'stroll' && s < STROLL_TO && this.stroll(k, m, a, s - (g.start + (L + m.lag) / g.v), now, dt)) return;
    // In their place.
    this.put(a, m.x, m.z, m.yaw, m.role === 'stroll' || m.role === 'run' ? 40 : 6);
    a.goTo(m.x, m.z, m.role === 'stroll' ? 0.95 : m.role === 'run' ? 1.6 : 0.6);
    const pose = this.mood(k, m, a, s, now, m.role === 'sit');
    a.pose(a.dist(m.x, m.z) > 0.6 ? POSE.stand : pose, now);
    if (ex && s < -10 && a.dist(ex.x, ex.z) < 2.5) this.glance(a, ex, now);
    a.step(dt, now);
    // (jumping for joy in the first seconds of the year)
    if (m.jumps && s >= 0 && s < 14 && a.shown) {
      const hop = Math.abs(Math.sin((s + k * 0.37) * Math.PI * 1.6)) * 0.22 * (1 - s / 14);
      a.crowd.place(a.i, a.x, a.y + hop, a.z, a.yaw);
    }
  }

  /** Between where their route ends (u 0: standing there) and their seat (u 1), placed. */
  private settling(k: number, m: Member, a: Actor, u: number, s: number, now: number, dt: number, ex: Obstacle | null): void {
    const r = m.route;
    const n = r.length;
    const ax = r[n - 2];
    const az = r[n - 1];
    const y0 = this.groundAt(ax, az);
    const x = ax + (m.x - ax) * u;
    const z = az + (m.z - az) * u;
    // (up the sala's steps over the first 1.5 m; seated for the last few centimetres)
    const left = (1 - u) * m.settle;
    const y = y0 + (this.rideY[k] - y0) * Math.min(1, (u * m.settle) / 1.5);
    const seated = left < 0.3;
    this.wear(k, seated && m.act === 'table');
    if (u <= 0) {
      // (up from the stool for the count and the show: standing behind it, turning as a walker would)
      const was = a.shown ? a.yaw : m.yaw;
      a.ride(ax, y0, az, was);
      a.show();
      const pose = this.mood(k, m, a, s, now, false);
      const turn = Math.atan2(Math.sin(this.faceYaw - was), Math.cos(this.faceYaw - was));
      a.ride(ax, y0, az, was + Math.max(-3 * dt, Math.min(3 * dt, turn)));
      a.pose(pose, now);
      if (ex && s < -10 && a.dist(ex.x, ex.z) < 2.5) this.glance(a, ex, now);
      a.step(dt, now);
      return;
    }
    const walkYaw = Math.atan2(m.x - ax, m.z - az);
    const turn = Math.atan2(Math.sin(m.yaw - walkYaw), Math.cos(m.yaw - walkYaw));
    a.ride(x, y, z, seated ? m.yaw : walkYaw + turn * Math.min(1, Math.max(0, (0.7 - left) / 0.4)));
    a.show();
    a.pose(seated ? (m.act === 'monk' ? POSE.sit : POSE.stool) : POSE.stand, now);
    a.carry(0, now);
    a.lookAt(null);
    a.step(dt, now);
    if (!seated) a.crowd.gait(a.i, 1, a.crowd.stepRate(a.i, 0.6), now);
  }

  /** The way someone stood up from their seat turns to (set by `mood` through `face`). */
  private faceYaw = 0;

  /**
   * What someone in their place does now (their pose; facing and looking set here): what their group does before the
   * count (watching the dance, eating, chatting, a selfie, buying), the countdown, the cheer, the fireworks, after.
   * `sitting`: on a seat, a mat or the sala's floor.
   */
  private mood(k: number, m: Member, a: Actor, s: number, now: number, sitting: boolean): Pose {
    const i = a.i;
    const monk = m.act === 'monk';
    // (a new mood every few seconds, each their own)
    const w = Math.floor((s + i * 2.9) / 7);
    const h = hash3(w, i, 5, 2027);
    let yaw = m.yaw;
    let look: Point | null = BOARD_AT;
    let pose: Pose = sitting ? (m.role === 'seat' ? POSE.stool : POSE.sit) : POSE.stand;
    let hold = 0;
    if (s < -10) {
      look = s < DANCE_TO ? STAGE_LOOK : BOARD_AT;
      const act = this.before(k, m, a, s, h, sitting);
      pose = act.pose;
      yaw = act.yaw;
      look = act.look;
      hold = act.hold;
    } else if (s < 0) {
      // The last ten seconds: everyone to the board, phones up, arms counting; the last three, arms up.
      if (!sitting) {
        yaw = Math.atan2(BOARD.x - a.x, BOARD.z - a.z);
        pose = m.phone ? POSE.photo : s > -3 && h < 0.6 ? POSE.cheer : POSE.point;
      }
      if (m.sparkler) hold = 1;
    } else if (s < 30) {
      // Midnight: the cheer (two of a group turn to each other for the first seconds), the waving; the monks stay still.
      if (!sitting) yaw = Math.atan2(BOARD.x - a.x, BOARD.z - a.z);
      if (monk || (sitting && m.role === 'seat')) pose = sitting ? pose : POSE.stand;
      else if (sitting) pose = m.kid ? POSE.cheer : h < 0.5 ? POSE.wave : POSE.sit;
      else if (m.partner >= 0 && s > 2 && s < 9) {
        const o = this.crowdActors[m.partner];
        yaw = a.yawTo(o.x, o.z);
        pose = POSE.give;
        look = null;
      } else pose = m.phone && h < 0.3 ? POSE.photo : h < 0.75 ? POSE.cheer : POSE.wave;
      if (m.sparkler) hold = 1;
    } else if (s < NYE_TIMES.show) {
      // The fireworks: heads up over the stage, phones up, a cheer at a big one now and then.
      look = SKY;
      if (!sitting) {
        yaw = Math.atan2(SKY.x - SKY_YAW_FROM.x, SKY.z - SKY_YAW_FROM.z) * 0.5 + Math.atan2(BOARD.x - a.x, BOARD.z - a.z) * 0.5;
        pose = m.phone && h < 0.5 ? POSE.photo : h > 0.93 ? POSE.cheer : h > 0.88 ? POSE.point : POSE.look;
      }
      if (m.sparkler) hold = 1;
    } else if (!sitting) {
      // After the show: talking, a last photo of the board, waving to friends.
      pose = h < 0.35 ? POSE.talk : m.phone && h < 0.5 ? POSE.photo : h > 0.92 ? POSE.wave : POSE.stand;
      if (m.act === 'circle' || m.act === 'selfie') yaw = Math.atan2(m.cx - a.x, m.cz - a.z);
    }
    this.faceYaw = yaw;
    a.face(yaw);
    a.carry(hold, now);
    if (look) a.lookAt(look, now + 1);
    else a.lookAt(null);
    return pose;
  }

  /** Before the count: what each group does in its place (into `BEFORE`, read at once: no object a call). */
  private before(k: number, m: Member, a: Actor, s: number, h: number, sitting: boolean): Mood {
    const out = BEFORE;
    out.pose = sitting ? (m.role === 'seat' ? POSE.stool : POSE.sit) : POSE.stand;
    out.yaw = m.yaw;
    out.look = s < DANCE_TO ? STAGE_LOOK : BOARD_AT;
    out.hold = m.sparkler && s > -1500 ? 1 : 0;
    const mate = this.mate[k] >= 0 ? this.crowdActors[this.mate[k]] : null;
    switch (m.act) {
      case 'table':
        // Eating, a word with the one across, a glance at the stage (up from the stool: as the watchers).
        if (!sitting) break;
        out.pose = h < 0.6 ? POSE.eat : POSE.stool;
        out.look = h < 0.6 ? null : h < 0.85 && mate ? headOf(mate) : out.look;
        return out;
      case 'mat':
        if (m.kid && h > 0.85) out.pose = POSE.wave;
        else if (m.phone && h < 0.3) {
          out.hold = 1;
          out.look = null;
        } else if (h < 0.55 && mate) out.look = headOf(mate);
        return out;
      case 'bench':
      case 'monk':
        return out;
      case 'circle': {
        // One talks at a time, the others turn to them; a laugh now and then; a look at a phone.
        const ks = this.byGroup[m.group];
        const talker = Math.floor(hash3(Math.floor(s / 5), m.group, 9, 2027) * ks.length);
        out.yaw = Math.atan2(m.cx - m.x, m.cz - m.z);
        if (m.idx === talker) {
          out.pose = POSE.talk;
          out.look = null;
        } else {
          out.look = headOf(this.crowdActors[ks[talker]]);
          if (h > 0.9) out.pose = POSE.cheer;
          else if (m.phone && h < 0.18) {
            out.hold = 1;
            out.look = null;
          }
        }
        return out;
      }
      case 'selfie': {
        // A selfie with the board behind them (her arm up with the phone, his peace sign), then a look at it, a word.
        // (side by side all the while: a half turn to each other to look at the picture and talk)
        const phase = (s + m.group * 5.3) % 18;
        if (phase < 8) {
          out.yaw = m.yaw;
          if (m.selfie === 1) out.pose = POSE.point;
          else out.hold = 1;
          AT.x = m.cx + Math.sin(m.yaw) * 1.4;
          AT.y = a.y + 2.3;
          AT.z = m.cz + Math.cos(m.yaw) * 1.4;
          out.look = AT;
        } else {
          const toward = mate ? Math.atan2(Math.sin(a.yawTo(mate.x, mate.z) - m.yaw), Math.cos(a.yawTo(mate.x, mate.z) - m.yaw)) : 0;
          out.yaw = m.yaw + toward * 0.35;
          const check = phase < 13;
          out.pose = check ? POSE.stand : m.selfie === 1 ? POSE.talk : POSE.stand;
          out.hold = m.selfie === 1 && check ? 1 : 0;
          const taker = m.selfie === 1 ? a : mate;
          if (check && taker) {
            AT.x = taker.x + Math.sin(taker.yaw) * 0.3;
            AT.y = taker.y + 1.25;
            AT.z = taker.z + Math.cos(taker.yaw) * 0.3;
            out.look = AT;
          } else out.look = null;
        }
        return out;
      }
      case 'queue':
        // The first is handed what they bought, the others wait (a phone, a word).
        AT.x = m.cx;
        AT.y = FLOOR + 1.8;
        AT.z = m.cz;
        out.look = AT;
        if (m.idx === 0) out.pose = h < 0.5 ? POSE.give : POSE.stand;
        else if (m.phone && h < 0.4) {
          out.hold = 1;
          out.look = null;
        } else if (h > 0.8) out.pose = POSE.talk;
        return out;
      default:
        break;
    }
    // Watching the dance (and the strollers and runners back in their places): phones, a word with the family.
    if (!sitting) {
      if (m.phone && h < 0.22) out.pose = POSE.photo;
      else if (m.phone && h < 0.45) out.hold = 1;
      else if (!m.kid && h > 0.82) out.pose = POSE.talk;
      else if (m.kid && h > 0.86) out.pose = POSE.wave;
    }
    if (out.hold && !m.sparkler) out.look = null;
    return out;
  }

  /** A child chasing the others round their fire bowl, stopping now and then to wave a sparkler. */
  private run(m: Member, a: Actor, now: number, dt: number): void {
    const cycle = 21;
    const u = now + m.group * 3.3;
    const lap = Math.floor(u / cycle);
    const t = u - lap * cycle;
    const running = t < 15;
    const r = 2.3 + 0.25 * Math.sin(m.idx * 2.1);
    const ang = ((lap * 15 + Math.min(t, 15)) * 2.0) / r + m.idx * 2.09;
    const x = m.cx + Math.cos(ang) * r;
    const z = m.cz + Math.sin(ang) * r;
    this.put(a, x, z, ang, 6);
    if (running) {
      const ahead = ang + 1.2 / r;
      a.goTo(m.cx + Math.cos(ahead) * r, m.cz + Math.sin(ahead) * r, 2.0);
      a.face(null);
      a.pose(POSE.stand, now);
      a.carry(m.sparkler ? 1 : 0, now);
    } else {
      a.goTo(x, z, 0.5);
      a.face(Math.atan2(m.cx - x, m.cz - z) + Math.PI);
      a.pose(hash3(lap, m.idx, 3, 7) < 0.5 ? POSE.cheer : POSE.wave, now);
      a.carry(m.sparkler ? 1 : 0, now);
    }
    a.lookAt(null);
    a.step(dt, now);
  }

  /** A stroller on their round of the stalls, `t` s after they first came to their place (true: done). */
  private stroll(k: number, m: Member, a: Actor, t: number, now: number, dt: number): boolean {
    const r = this.strolls[k];
    if (!r || t < 0) return false;
    const u = t % r.period;
    const n = r.at.length;
    let j = 0;
    while (j < n - 1 && u >= r.off[j]) j++;
    const px = r.pts[4 * j];
    const pz = r.pts[4 * j + 1];
    const there = u >= r.at[j];
    this.put(a, px, pz, a.yaw, 40);
    if (there && r.pts[4 * j + 2] > 0) {
      const face = r.pts[4 * j + 3];
      a.goTo(px, pz, 0.6);
      a.face(face);
      const h = hash3(Math.floor((u + a.i) / 6), a.i, 7, 2027);
      a.pose(h < 0.3 ? POSE.point : h < 0.55 ? POSE.talk : m.phone && h < 0.75 ? POSE.photo : POSE.stand, now);
      AT.x = px + Math.sin(face) * 2.2;
      AT.y = FLOOR + 1.6;
      AT.z = pz + Math.cos(face) * 2.2;
      a.lookAt(AT, now + 1);
    } else {
      a.goTo(px, pz, 0.9);
      a.face(null);
      a.pose(POSE.stand, now);
      a.lookAt(null);
    }
    a.carry(m.sparkler ? 1 : 0, now);
    a.step(dt, now);
    return true;
  }

  /** The look member `k` wears: with the bowl while seated at their table. */
  private wear(k: number, eating: boolean): void {
    const m = this.plan.members[k];
    if (!m.eatLook || eating === !!this.wearing[k]) return;
    this.wearing[k] = eating ? 1 : 0;
    const a = this.crowdActors[k];
    a.look = eating ? m.eatLook : m.look;
    a.crowd.dress(a.i, a.look);
  }

  /** A child on a father's shoulders (rides with him; his hands on his head; hidden with him). */
  private shoulder(m: Member, a: Actor, on: boolean, s: number, now: number): void {
    const c = this.crowdActors[m.carrier];
    if (!on || !c.shown) return void (a.shown && a.hide());
    const crowd = a.crowd;
    // (the saddle of the ride pose on his shoulders' top, a little behind his head)
    const y = c.y + crowd.scale(c.i) * 1.02 - crowd.scale(a.i) * FIT.bike.saddle;
    const x = c.x - Math.sin(c.yaw) * 0.06;
    const z = c.z - Math.cos(c.yaw) * 0.06;
    a.ride(x, y, z, c.yaw);
    a.show();
    a.pose(POSE.ride, now);
    crowd.gait(a.i, 1, 0, now);
    a.lookAt(s >= 30 && s < NYE_TIMES.show ? SKY : BOARD_AT, now + 1);
    a.step(0, now);
  }

  /** The stage: the dance and the pinpeat, the bow, standing aside, going off. */
  private stage(night: boolean, s: number, now: number, dt: number, f: MapFrame): void {
    const on = night && s >= NYE_TIMES.nightFrom && s < OFF_AT + 60;
    const dancing = on && s >= DANCE_FROM && s < DANCE_TO;
    for (let k = 0; k < this.dancers.length; k++) {
      const a = this.dancers[k];
      if (!on) {
        if (a.shown) a.hide();
        continue;
      }
      const [hx, hz] = DANCERS[k];
      const side = k < 2 ? 1 : -1;
      const ax = ASIDE.x + (k % 2) * 1.1;
      const az = ASIDE.z - Math.floor(k / 2) * 1.2;
      let x = hx;
      let z = hz;
      let yaw = (hx - STAGE.x) * -0.03;
      let pose: Pose = POSE.stand;
      let walk = 0;
      if (s < DANCE_TO) {
        if (dancing) {
          // (the figure: a step at each change of the foot, side to side and to the front, turned from the lifted foot)
          const u = (danceSteps(now) * Math.PI * 2) / 16;
          x += side * 0.38 * Math.sin(u * 2);
          z += 0.25 * Math.sin(u);
          yaw -= 0.25 * danceSide(now);
          pose = POSE.dance;
        }
      } else if (s < DANCE_TO + BOW) pose = POSE.sampeah;
      else if (s < OFF_AT) {
        walk = this.walkTo(hx, hz, ax, az, s - DANCE_TO - BOW, P);
        x = P.x;
        z = P.z;
        yaw = walk ? P.yaw : -Math.PI / 2 - 0.35;
        pose = walk ? POSE.stand : s >= 0 && s < 30 ? (k % 2 ? POSE.wave : POSE.cheer) : s >= 30 && s < NYE_TIMES.show ? POSE.look : POSE.stand;
      } else {
        walk = this.walkTo(ax, az, OFF_EAST.x, OFF_EAST.z - k * 0.6, s - OFF_AT - k * 1.2, P);
        if (!walk && s - OFF_AT > 10) {
          if (a.shown) a.hide();
          continue;
        }
        x = P.x;
        z = P.z;
        yaw = P.yaw;
      }
      this.onStage(a, x, z, yaw, pose, walk, now, dt);
      a.performing = dancing;
      a.lookAt(s >= 30 && s < NYE_TIMES.show ? SKY : null, now + 1);
    }
    for (let k = 0; k < this.players.length; k++) {
      const a = this.players[k];
      if (!on) {
        if (a.shown) a.hide();
        continue;
      }
      const [px, pz, play] = PLAYERS[k];
      const hx = ENSEMBLE.x + px;
      const hz = ENSEMBLE.z + pz;
      let x = hx;
      let z = hz;
      let yaw = Math.PI / 2;
      let pose: Pose = s < DANCE_TO ? play : POSE.sit;
      let walk = 0;
      if (s >= OFF_AT) {
        walk = this.walkTo(hx, hz, OFF_WEST.x + 0.6 * k, OFF_WEST.z, s - OFF_AT - k * 1.4, P);
        if (!walk && s - OFF_AT > 12) {
          if (a.shown) a.hide();
          continue;
        }
        x = P.x;
        z = P.z;
        yaw = P.yaw;
        pose = POSE.stand;
      }
      this.onStage(a, x, z, yaw, pose, walk, now, dt);
      a.performing = dancing;
      // (nodding on the beat while they play; then watching the board, the sky)
      a.tilt(dancing ? 0.22 + 0.14 * Math.cos(((now - this.lastLanding(now)) * Math.PI * 2) / 2.4) : 0);
      a.lookAt(s >= 30 && s < NYE_TIMES.show ? SKY : s < DANCE_TO ? STAGE_LOOK : BOARD_AT, now + 1);
    }
    // The pinpeat: a phrase at each landing of the dance, from the ensemble's mat (as at Angkor Wat, _sceneApsara.ts).
    if (dancing && f.dt > 0) {
      const at = this.lastLanding(now);
      if (at > this.phraseAt) {
        this.phraseAt = at;
        if (now - at < 0.5) f.calls.push({ kind: 'pinpeat', x: ENSEMBLE.x, y: STAGE_TOP + 1, z: ENSEMBLE.z, gain: 1 });
      }
    }
  }

  private lastLanding(t: number): number {
    return (Math.floor((t * DANCE.step) / Math.PI) * Math.PI) / DANCE.step;
  }

  /** Where someone walking from (x0, z0) to (x1, z1) on the stage is `t` s after setting off (into `out`); 1 while on the way. */
  private walkTo(x0: number, z0: number, x1: number, z1: number, t: number, out: { x: number; z: number; yaw: number }): number {
    const l = Math.hypot(x1 - x0, z1 - z0);
    const k = l > 0 ? Math.min(1, Math.max(0, (t * STAGE_WALK) / l)) : 1;
    out.x = x0 + (x1 - x0) * k;
    out.z = z0 + (z1 - z0) * k;
    out.yaw = Math.atan2(x1 - x0, z1 - z0);
    return t > 0 && k < 1 ? 1 : 0;
  }

  /** On the stage's top (not in the walk map: placed there), walking with the gait when `walk`. */
  private onStage(a: Actor, x: number, z: number, yaw: number, pose: Pose, walk: number, now: number, dt: number): void {
    a.ride(x, STAGE_TOP, z, yaw);
    a.show();
    a.pose(pose, now);
    a.carry(0, now);
    a.step(dt, now);
    if (walk) a.crowd.gait(a.i, 1, a.crowd.stepRate(a.i, STAGE_WALK), now);
  }

  /** A look at the explorer close by. */
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
    for (const a of this.actors) {
      a.performing = false;
      if (a.shown) a.hide();
    }
  }

  report(traffic: Traffic): void {
    for (const a of this.actors) if (a.shown) traffic.add(this.name, a.x, a.y, a.z);
  }
}

/** A stroller's round from their place: each point reached and left (s), walking at 0.85 m/s. */
function strollOf(m: Member): Stroll {
  const pts = m.visits!;
  const n = pts.length / 4;
  const at = new Float32Array(n);
  const off = new Float32Array(n);
  let t = 0;
  let [px, pz] = [m.x, m.z];
  for (let j = 0; j < n; j++) {
    t += Math.hypot(pts[4 * j] - px, pts[4 * j + 1] - pz) / 0.85;
    at[j] = t;
    t += pts[4 * j + 2] || 0;
    off[j] = t;
    px = pts[4 * j];
    pz = pts[4 * j + 1];
  }
  return { pts, at, off, period: t };
}
