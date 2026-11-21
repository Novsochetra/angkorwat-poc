import { hash3 } from '../../voxel/random';
import { graphicsNow } from '../graphics';
import { nyeAsked, nyeOff, nyeSeconds, NYE_TIMES, squareShown } from '../nye/clock';
import { BOARD, GATE, RING, SHOW_AREA, SQUARE, STAGE, STALLS } from '../nye/plan';
import { SPARK_MAX, SPARKS, sparksOut } from '../nye/_lifeSparks';
import type { MapFrame } from '../types';
import { Actor } from './_actor';
import { dress } from './_kinds';
import { festiveLooks, gatherPlaces, GROUP, moreSparklers, pickCouples, planRunners, RUN, runnerAt, spreadGroups, VONG, vongAt, vongLook, type GroupPlan, type Runner } from './_nyeGroups';
import { along, ALL_GONE, BOARD_AT, COME_FROM, ensembleDef, FLOOR, GATE_IN, GATE_OUT, MATS, matDef, planCrowd, SquareGround, STAGE_TOP, standable, type Member, type NyeCrowdPlan } from './_nyePlan';
import { CARRY, danceSide, danceSteps, DANCE, FIT, PEOPLE_FIRE, POSE, SLOT, type Look, type Pose } from './_personModel';
import type { Obstacle, Point, Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';
import { Rig } from './_things';

/**
 * The people of New Year's Eve's festival square at Phnom Kulen's foot (AWP-35; where: nye/plan.ts, when:
 * nye/clock.ts; the crowd's plan: `_nyePlan.ts`).
 *
 * **Ordinary days** (from the day the square ships until the night, and the day after): a seller behind each New
 * Year snack stall and an attendant inside the gate from morning to late evening; children running round the
 * gathering ring by day; visitors in the evening who come in through the gate, take a photo before the board, look at
 * a stall and go.
 *
 * **The night** (from 22:20, ten minutes before the hold): families come up the lantern walk from the village and in
 * through the gate (the first half hour of the hold, a few later), and stand about the square in small groups
 * (`_nyeGroups.ts` `spreadGroups`: each family on a short arc round its own middle, chatting, the groups apart and
 * denser toward the stage; some round the dance, watching it, a few before the stalls) — a child on a father's
 * shoulders now and then, grandparents, mothers and children seated on mats at the sides, two monks watching quietly
 * at the west side (they never cheer), children and the young with sparklers (their sparks: nye/_life.ts, from
 * `SPARKS`), children running between the groups two by two; the ring and the aisle from the gate to the stage's
 * stairs stay open. From 22:42 couples from the crowd dance the roam vong (រាំវង់) slowly round the mandala
 * (`POSE.vong`; on low half of them), and go back to their families at 23:58:40. On the stage (22:30‥23:50) four
 * apsara dancers dance to a pinpeat ensemble seated at its west end (roneat ek, skor thom, sralai, chhing: its phrases
 * are `pinpeat` calls, as at Angkor Wat; it plays on for the roam vong); at 23:50 the dancers bow to the crowd and
 * step aside to the stage's east end. From four minutes before midnight the groups gather toward the stage, closer
 * together (`gatherPlaces`), and from two minutes before everyone turns to the board; the last ten
 * seconds: phones up, arms counting; midnight: cheering, jumping (heads up to the first bursts), two of a family
 * stepping together to hug; then the fireworks over the hill, heads up, phones up, a cheer now and then; after the
 * show they talk and from 00:08 go home down the lantern walk, the last by 00:40.
 *
 * Time: the night's own clock (`nyeSeconds`), so every player sees the same; in a shot (time stands still) the
 * people's clock moves it on from the still's moment minus the preroll (they walk, the dance goes on). On the low
 * graphics level half the standing families stay home (`Member.low`).
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
/**
 * Where heads turn in the fireworks: toward the show's middle, half way up it (≈ 35° up from the square: the crowd's
 * head tilt is clamped, `Crowd.look`, and the `look` pose leans them back as well), each a little apart (`skyOf`).
 */
const SKY: Point = { x: SHOW_AREA.x, y: (SHOW_AREA.low + SHOW_AREA.high) / 2, z: SHOW_AREA.z };
const SKYP: Point = { x: 0, y: 0, z: 0 };
/** Where member `i` looks in the show: round `SKY`, each a little apart (into `SKYP`). */
function skyOf(i: number): Point {
  SKYP.x = SKY.x + (hash3(i, 1, 8, 2027) - 0.5) * SHOW_AREA.spread * 0.8;
  SKYP.y = SKY.y + (hash3(i, 2, 8, 2027) - 0.5) * (SHOW_AREA.high - SHOW_AREA.low) * 0.45;
  SKYP.z = SKY.z + (hash3(i, 3, 8, 2027) - 0.5) * SHOW_AREA.depth * 0.6;
  return SKYP;
}
const SKY_YAW_FROM = { x: SQUARE.x, z: SQUARE.z };
/** The dancers (watched): their heads' height on the stage. */
const STAGE_LOOK: Point = { x: STAGE.x, y: STAGE_TOP + 1.6, z: STAGE.front - 2.4 };
const EX_AT: Point = { x: 0, y: 0, z: 0 };
const P = { x: 0, z: 0, yaw: 0 };
/**
 * The roam vong round the mandala (`_nyeGroups.ts`): its ring (2 m outside the ring of light's gold rim: from the
 * view over the gate its sides show either side of the gate's tower), from 22:42
 * until 23:58:40 (back to their families for the last minute and the show), couples at most (on low: their families'
 * only, as the crowd's).
 */
const VONG_RING = { x: RING.x, z: RING.z, r: RING.r + 2 } as const;
const VONG_FROM = -4700;
const VONG_TO = -80;
const VONG_COUPLES = 16;
/** Children running between the groups (two by two), until a minute and a half before midnight. */
const RUNNERS = 8;
const RUN_TO = -90;
/** Everyone turns to the board from two minutes before midnight (each at their own moment in its first half minute). */
/** The venue's firelight on its people on the event night (`PEOPLE_FIRE`: a warm fill, most on what faces up). */
const FIRE = 0.6;
const TURN_FROM = -120;
/** The groups gather toward the stage for the countdown (`_nyeGroups.ts` `gatherPlaces`), each setting off in these 100 s. */
const GATHER_FROM = -250;
const GATHER_PULL = 0.5;
/** Midnight's hug: partners standing near each other step together (s from midnight). */
const HUG_FROM = 1.5;
const HUG_TO = 8.5;
/** Sparklers in the crowd (with the plan's children's: the young who do not hold a phone). */
const MORE_SPARKLERS = 11;
const V = { x: 0, z: 0, yaw: 0, turn: 0 };
const T = { x: 0, z: 0 };
const Q = { x: 0, z: 0 };
const Q2 = { x: 0, z: 0 };
const LOOK: Point = { x: 0, y: 0, z: 0 };
const HAND = { x: 0, y: 0, z: 0 };

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

/** An evening visitor's round: points (x, z), how long they stay at each (s), the pose there. */
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

export class NyeLife implements PeopleScene {
  readonly name = 'nye';
  readonly actors: Actor[] = [];
  private readonly plan: NyeCrowdPlan;
  private readonly crowdActors: Actor[] = [];
  /** The groups (where each family stands and chats), the roam vong's dancers (each member's place in the ring, high and low: −1 none), the runners. */
  private readonly groups: GroupPlan;
  private readonly slotHigh: Int16Array;
  private readonly slotLow: Int16Array;
  private readonly dancersHigh: number;
  private readonly dancersLow: number;
  private readonly partnerOf: Int16Array;
  private readonly runners: Runner[];
  private readonly runnerOf: Int16Array;
  /** Per member: in the dance's ring now; away from their place (walking back from the dance or a run). */
  private readonly inRing: Uint8Array;
  private readonly away: Uint8Array;
  /** Per member: where they stand gathered toward the stage for the countdown. */
  private readonly gx: Float32Array;
  private readonly gz: Float32Array;
  /** The sparklers (member indices: their tips go to `SPARKS.kulen`). */
  private readonly sparklers: number[];
  private readonly sellers: Seller[] = [];
  private readonly guard: Seller;
  private readonly kids: Actor[] = [];
  private readonly rounds: Round[] = [];
  private readonly dancers: Actor[] = [];
  private readonly players: Actor[] = [];
  private readonly mats: Rig[] = [];
  private readonly music: Rig;
  private readonly pace = new Pace(220, 560);
  private readonly ground: SquareGround;
  private shown = false;
  private rigsOut = false;
  private readonly matOut = new Uint8Array(MATS.length);
  /** When each mat's family has come (s from midnight; the plan's first groups are theirs). */
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
    const room = crowd.capacity - crowd.count - 26;
    this.plan = planCrowd(Math.max(0, Math.min(150, room)));
    // Made alive (_nyeGroups.ts): the families spread in small groups, the roam vong's couples, the runners, more sparklers.
    {
      const ms = this.plan.members;
      const venue = {
        // (clear of the dance's ring: 1.6 m either side of it)
        ok: (x: number, z: number) => standable(x, z) && Math.abs(Math.hypot(x - VONG_RING.x, z - VONG_RING.z) - VONG_RING.r) > 1.6,
        box: [SQUARE.x - SQUARE.rx, STAGE.front, SQUARE.x + SQUARE.rx, SQUARE.z + SQUARE.rz] as const,
        board: (x: number, z: number) => Math.atan2(BOARD.x - x, BOARD.z - z),
        front: { x: STAGE.x, z: STAGE.stairTo + 2, reach: 15 },
        ring: VONG_RING,
        stalls: STALLS,
        stallOut: 4.3,
        seed: 0x2027 + 5,
      };
      this.groups = spreadGroups(ms, venue);
      ({ gx: this.gx, gz: this.gz } = gatherPlaces(ms, this.groups, venue, GATHER_PULL));
      const carriers = new Set(ms.filter((m) => m.role === 'shoulder').map((m) => m.carrier));
      const couples = pickCouples(ms, VONG_COUPLES, (k) => !carriers.has(k), 0x2027 + 6);
      this.slotHigh = new Int16Array(ms.length).fill(-1);
      this.slotLow = new Int16Array(ms.length).fill(-1);
      this.partnerOf = new Int16Array(ms.length).fill(-1);
      let hi = 0;
      let lo = 0;
      for (const [a, b] of couples) {
        // (in their best for the dance; no phone in the hand)
        for (const k of [a, b]) {
          ms[k].look = vongLook(ms[k].look, k);
          ms[k].phone = false;
        }
        this.partnerOf[a] = b;
        this.partnerOf[b] = a;
        this.slotHigh[a] = hi++;
        this.slotHigh[b] = hi++;
        if (ms[a].low && ms[b].low) {
          this.slotLow[a] = lo++;
          this.slotLow[b] = lo++;
        }
      }
      this.dancersHigh = hi;
      this.dancersLow = lo;
      this.runners = planRunners(ms, this.groups, venue, RUNNERS, (k) => this.slotHigh[k] < 0);
      this.runnerOf = new Int16Array(ms.length).fill(-1);
      this.runners.forEach((r, j) => (this.runnerOf[r.k] = j));
      festiveLooks(ms, (k) => this.slotHigh[k] >= 0, 0x2027 + 8);
      moreSparklers(ms, MORE_SPARKLERS, (k) => this.slotHigh[k] < 0, 0x2027 + 7);
      this.sparklers = ms.map((m, k) => (m.sparkler ? k : -1)).filter((k) => k >= 0).slice(0, SPARK_MAX);
      this.inRing = new Uint8Array(ms.length);
      this.away = new Uint8Array(ms.length);
    }
    for (const m of this.plan.members) this.crowdActors.push(mk(m.look));
    // The sellers behind their stalls (each stall faces the square's middle: they stand at its back).
    STALLS.forEach((s, k) => {
      const a = mk(dress('vendor', 9300 + k, { hat: k % 2 ? 'krama' : 'none', goods: 'sweets', sex: k === 2 ? 'm' : 'f' }));
      // (behind the counter: its back edge is 0.4 m before the stall's middle, nye/_sqStalls.ts `COUNTER`)
      this.sellers.push({ a, x: s.x - Math.sin(s.facing) * 0.05, z: s.z - Math.cos(s.facing) * 0.05, yaw: s.facing });
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
      const sx = st.x + Math.sin(st.facing) * 2.4;
      const sz = st.z + Math.cos(st.facing) * 2.4;
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
    // Their things: the families' mats, the ensemble.
    MATS.forEach((m, k) => {
      const r = new Rig(things, matDef(m.w, m.d, k));
      this.mats.push(r);
    });
    this.music = new Rig(things, ensembleDef());
    MATS.forEach((_, k) => {
      const g = this.plan.groups[k];
      const lead = this.plan.members.find((p) => p.group === k && p.role === 'sit');
      if (g && lead) this.matFrom[k] = g.start + lead.cum[lead.cum.length - 1] / g.v - 2;
    });
    const ms = this.plan.members;
    const n = (f: (m: Member) => boolean) => ms.filter(f).length;
    console.info(
      `[map] nye people: ${ms.length} in the night's crowd (${n((m) => m.low)} on low; ${this.plan.groups.length} families, ${n((m) => m.role === 'sit')} seated, ${n((m) => m.role === 'shoulder')} on shoulders, ${n((m) => m.kid)} children, ${n((m) => m.sparkler)} sparklers, ${n((m) => m.phone)} phones; groups ${this.groups.count[0]} out on the square, ${this.groups.count[1]} at the stalls, ${this.groups.count[2]} round the dance; roam vong ${this.dancersHigh} (${this.dancersLow} on low), ${this.runners.length} running), ${this.actors.length} in all`,
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
    // (the square's firelight on its people on the event night, as it gets dark: _personModel.ts `PEOPLE_FIRE`)
    PEOPLE_FIRE.value[0].set(SQUARE.x, SQUARE.z, Math.max(SQUARE.rx, SQUARE.rz) + 8, night ? FIRE * Math.min(1, Math.max(0, (f.night - 0.3) / 0.4)) : 0);
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
    for (let k = 0; k < ms.length; k++) this.member(k, night && (!low || ms[k].low), s, now, dt, ex, low);
    this.stage(night, s, now, dt, f);
    this.sparks(night);
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

  /** The mats and the ensemble: out for the night, written once. */
  private rigs(night: boolean, s: number): void {
    // (each family's mat from when they come to when they get up to go: the plan's first groups are the mats' families)
    for (let k = 0; k < MATS.length; k++) {
      const m = MATS[k];
      const g = this.plan.groups[k];
      const out = night && !!g && s >= this.matFrom[k] && s < g.leave;
      if (out === !!this.matOut[k]) continue;
      this.matOut[k] = out ? 1 : 0;
      if (out) this.mats[k].place(m.x, this.groundAt(m.x, m.z), m.z, 0).write();
      else this.mats[k].hide();
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
    if (!a.shown || a.dist(x, z) > far) {
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

  /** One of the night's crowd: on the way, in their place (or dancing, or running about), on the way home. */
  private member(k: number, on: boolean, s: number, now: number, dt: number, ex: Obstacle | null, low: boolean): void {
    const m = this.plan.members[k];
    const a = this.crowdActors[k];
    if (m.role === 'shoulder') return this.shoulder(m, a, on, s, now);
    const g = this.plan.groups[m.group];
    const L = m.cum[m.cum.length - 1];
    const goneD = (s - g.leave) * g.v - m.lag;
    const comeD = (s - g.start) * g.v - m.lag;
    if (!on || comeD < 0 || goneD >= L) {
      this.inRing[k] = this.away[k] = 0;
      return void (a.shown && a.hide());
    }
    // On the way (in, or home: the way back), a point a little ahead to walk to.
    if (comeD < L || goneD > 0) {
      const home = goneD > 0;
      const d = home ? L - goneD : comeD;
      along(m, d, P);
      // (held up behind others or the explorer: a little quicker to catch up; far behind, there at once)
      const behind = a.shown ? a.dist(P.x, P.z) : 0;
      this.put(a, P.x, P.z, home ? P.yaw + Math.PI : P.yaw, home ? 40 : 8);
      along(m, home ? d - 1.2 : d + 1.2, P);
      a.goTo(P.x, P.z, g.v + Math.min(0.7, behind * 0.25));
      a.face(null);
      a.pose(POSE.stand, now);
      a.carry(m.sparkler && s > -1500 ? 1 : 0, now);
      a.lookAt(null);
      a.step(dt, now);
      return;
    }
    // The roam vong round the mandala.
    const slot = low ? this.slotLow[k] : this.slotHigh[k];
    if (slot >= 0 && s >= VONG_FROM && s < VONG_TO) return this.vong(k, slot, low ? this.dancersLow : this.dancersHigh, s, now, dt);
    if (this.inRing[k]) {
      this.inRing[k] = 0;
      a.riding = false;
    }
    // Running between the groups.
    const r = this.runnerOf[k];
    if (r >= 0 && s < RUN_TO) return this.run(k, this.runners[r], s, now, dt);
    // Walking to their place: back from the dance or a run, or gathering toward the stage for the countdown.
    const q = this.place(k, s, Q);
    const off = a.shown ? a.dist(q.x, q.z) : 0;
    if (off > 1.2 || (this.away[k] && off > 0.45)) {
      this.put(a, q.x, q.z, m.yaw, 80);
      a.goTo(q.x, q.z, this.away[k] ? 1.15 : 0.95);
      a.face(null);
      a.pose(POSE.stand, now);
      a.carry(m.sparkler ? 1 : 0, now);
      a.lookAt(null);
      a.step(dt, now);
      return;
    }
    this.away[k] = 0;
    // In their place (midnight's hug: a step toward the partner).
    this.put(a, q.x, q.z, m.yaw, 80);
    T.x = q.x;
    T.z = q.z;
    const pose = this.mood(k, m, a, s, now);
    a.goTo(T.x, T.z, 0.6);
    a.pose(pose, now);
    if (ex && s < -10 && a.dist(ex.x, ex.z) < 2.5) this.glance(a, ex, now);
    a.step(dt, now);
    // (jumping for joy in the first seconds of the year)
    if (m.jumps && s >= 0 && s < 14 && a.shown) {
      const hop = Math.abs(Math.sin((s + k * 0.37) * Math.PI * 1.6)) * 0.22 * (1 - s / 14);
      a.crowd.place(a.i, a.x, a.y + hop, a.z, a.yaw);
    }
  }

  /** Has group g set off to gather toward the stage for the countdown (each at its own moment)? */
  private gathered(g: number, s: number): boolean {
    return s >= GATHER_FROM + 100 * hash3(g, 4, 5, 2027);
  }

  /** Where member k stands at s (into `out`): their place, or gathered toward the stage for the countdown. */
  private place(k: number, s: number, out: { x: number; z: number }): { x: number; z: number } {
    const m = this.plan.members[k];
    const g = this.gathered(m.group, s);
    out.x = g ? this.gx[k] : m.x;
    out.z = g ? this.gz[k] : m.z;
    return out;
  }

  /** A dancer of the roam vong: to their place in the ring (walking), then slowly round it, the hands dancing. */
  private vong(k: number, j: number, n: number, s: number, now: number, dt: number): void {
    const a = this.crowdActors[k];
    vongAt(j, n, s, VONG_RING, 0, V);
    this.away[k] = 1;
    if (!this.inRing[k] && a.shown && a.dist(V.x, V.z) > 0.7) {
      a.riding = false;
      a.goTo(V.x, V.z, 1.25);
      a.face(null);
      a.pose(POSE.stand, now);
      a.carry(0, now);
      a.lookAt(null);
      a.step(dt, now);
      return;
    }
    this.inRing[k] = 1;
    a.ride(V.x, this.groundAt(V.x, V.z), V.z, V.yaw);
    a.show();
    a.pose(POSE.vong, now);
    a.carry(0, now);
    // (eyes on the partner; she looks back at him as she turns)
    const p = this.crowdActors[this.partnerOf[k]];
    if (p?.shown) {
      LOOK.x = p.x;
      LOOK.y = p.y + 1.5 * p.crowd.scale(p.i);
      LOOK.z = p.z;
      a.lookAt(LOOK, now + 1);
    } else a.lookAt(null);
    a.step(dt, now);
    a.crowd.gait(a.i, 0.55, a.crowd.stepRate(a.i, VONG.pace * 1.6), now);
  }

  /** A child running round its loop between the groups, chasing or chased, a breath (a wave, a cheer) at each point. */
  private run(k: number, r: Runner, s: number, now: number, dt: number): void {
    const a = this.crowdActors[k];
    const m = this.plan.members[k];
    const running = runnerAt(r, s, P);
    this.away[k] = 1;
    if (a.riding) a.riding = false;
    this.put(a, P.x, P.z, P.yaw, 4);
    a.goTo(P.x, P.z, running ? RUN.v * 1.08 : 0.6);
    a.face(running ? null : P.yaw + Math.PI * 0.6);
    a.pose(running || m.sparkler ? POSE.stand : hash3(Math.floor(s / 5), a.i, 7, 2027) < 0.5 ? POSE.wave : POSE.cheer, now);
    a.carry(m.sparkler ? 1 : 0, now);
    a.lookAt(null);
    a.step(dt, now);
  }

  /** The sparklers' tips for the night's life (nye/_life.ts): lit while held up. */
  private sparks(night: boolean): void {
    const out = SPARKS.kulen;
    for (let j = 0; j < out.length; j++) {
      const k = this.sparklers[j];
      const v = out[j];
      const a = k === undefined ? null : this.crowdActors[k];
      if (!night || !a?.shown) {
        v.w = 0;
        continue;
      }
      const c = a.crowd;
      const sc = c.scale(a.i);
      c.handAt(a.i, HAND);
      // (held up the torch's way: the fist high, the wire's tip ≈ 0.82 model m over it)
      const up = (HAND.y - a.y) / sc;
      v.set(HAND.x, HAND.y + 0.84 * sc, HAND.z, Math.min(1, Math.max(0, (up - 0.66) / 0.16)));
    }
  }

  /**
   * What someone in their place does now (their pose; facing and looking set here, `T` the spot to stand on): chatting
   * in the group, watching the dance round the mandala or the stage, at the stall, a photo; turned to the board for the
   * countdown; the cheer and midnight's hug; the fireworks; after.
   */
  private mood(k: number, m: Member, a: Actor, s: number, now: number): Pose {
    const i = a.i;
    const seated = m.role === 'sit';
    const monk = m.role === 'monk';
    const G = this.groups;
    // (a new mood every few seconds, each their own)
    const w = Math.floor((s + i * 2.9) / 7);
    const h = hash3(w, i, 5, 2027);
    // (turned to the board from where they stand: their place, or gathered toward the stage)
    let yaw = Math.atan2(BOARD.x - T.x, BOARD.z - T.z);
    let look: Point | null = BOARD_AT;
    let pose: Pose = seated ? POSE.sit : POSE.stand;
    let hold = 0;
    // (from two minutes before midnight everyone turns to the board, each at their own moment)
    const turned = s >= TURN_FROM + 30 * hash3(i, 3, 5, 2027) || this.gathered(m.group, s);
    if (s < -10 && !turned) {
      // Before the countdown: the group chats (turned to its middle), or watches the dance round the mandala or the
      // stage's apsara, or stands at its stall; phones, a word, a wave.
      look = s < DANCE_TO ? STAGE_LOOK : BOARD_AT;
      const chat = G.chat[k];
      if (!seated && !monk && !Number.isNaN(chat)) {
        // (what the group attends to, a while at a time: all of them together)
        const gw = hash3(Math.floor((s + m.group * 13.7) / 24), m.group, 9, 2027);
        const kind = G.kind[k];
        const vongOn = s >= VONG_FROM && s < VONG_TO;
        if (vongOn && ((kind === GROUP.ring && gw < 0.8) || (kind === GROUP.open && gw > 0.84))) {
          // (watching the dancers go by: turned to the ring, eyes on the nearest of it at head height)
          const dx = m.x - VONG_RING.x;
          const dz = m.z - VONG_RING.z;
          const d = Math.hypot(dx, dz) || 1;
          yaw = Math.atan2(-dx, -dz);
          LOOK.x = VONG_RING.x + (dx / d) * VONG_RING.r;
          LOOK.y = FLOOR + 2;
          LOOK.z = VONG_RING.z + (dz / d) * VONG_RING.r;
          look = LOOK;
        } else if (kind === GROUP.open && s < DANCE_TO && gw > 0.64) look = STAGE_LOOK;
        else {
          yaw = chat;
          look = null;
          if (!m.kid && h > 0.5) pose = POSE.talk;
        }
      }
      if (!seated && !monk) {
        if (m.phone && h < 0.22) pose = POSE.photo;
        else if (m.phone && h < 0.32) hold = 1;
        else if (m.kid && h > 0.86) pose = POSE.wave;
      } else if (seated && m.phone && h < 0.2) hold = 1;
      if (hold) look = null;
      if (m.sparkler && s > -1500) hold = 1;
    } else if (s < 0) {
      // The countdown: everyone to the board; in the last ten seconds phones up, arms counting; the last three, arms up.
      if (!monk && !seated) pose = s < -10 ? (m.phone && h < 0.4 ? POSE.photo : POSE.stand) : m.phone ? POSE.photo : s > -3 && h < 0.6 ? POSE.cheer : POSE.point;
      if (m.sparkler) hold = 1;
    } else if (s < 30) {
      // Midnight: the cheer (heads up to the first bursts now and then), two of a family stepping together to hug, the
      // waving; the monks stay still.
      if (h < 0.45) look = skyOf(i);
      const o = m.partner >= 0 ? this.plan.members[m.partner] : null;
      if (monk) pose = POSE.stand;
      else if (seated) pose = m.kid ? POSE.cheer : h < 0.5 ? POSE.wave : POSE.sit;
      else if (o && o.role === 'stand' && s > HUG_FROM && s < HUG_TO && Math.hypot(this.place(m.partner, s, Q2).x - T.x, Q2.z - T.z) < 2.6) {
        const p = this.crowdActors[m.partner];
        // (each a step toward the middle between their places)
        const mx = (T.x + Q2.x) / 2;
        const mz = (T.z + Q2.z) / 2;
        const d = Math.hypot(T.x - mx, T.z - mz) || 1;
        T.x = mx + ((T.x - mx) / d) * 0.3;
        T.z = mz + ((T.z - mz) / d) * 0.3;
        yaw = a.yawTo(p.x, p.z);
        pose = POSE.hug;
        look = null;
      } else pose = m.phone && h < 0.3 ? POSE.photo : h < 0.75 ? POSE.cheer : POSE.wave;
      if (m.sparkler) hold = 1;
    } else if (s < NYE_TIMES.show) {
      // The fireworks: heads up over the stage, phones up, a cheer at a big one now and then.
      look = skyOf(i);
      yaw = Math.atan2(SKY.x - SKY_YAW_FROM.x, SKY.z - SKY_YAW_FROM.z) * 0.5 + m.yaw * 0.5;
      if (!seated && !monk) pose = m.phone && h < 0.5 ? POSE.photo : h > 0.93 ? POSE.cheer : h > 0.88 ? POSE.point : POSE.look;
      if (m.sparkler) hold = 1;
    } else {
      // After the show: talking (turned to the family again), a last photo of the board, waving to friends.
      const chat = G.chat[k];
      if (!seated && !monk) {
        if (!Number.isNaN(chat) && h < 0.5) {
          yaw = chat;
          look = null;
        }
        pose = h < 0.35 ? POSE.talk : m.phone && h < 0.5 ? POSE.photo : h > 0.92 ? POSE.wave : POSE.stand;
      }
    }
    a.face(yaw);
    a.carry(hold, now);
    if (look) a.lookAt(look, now + 1);
    else a.lookAt(null);
    return pose;
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
    // (the pinpeat plays on for the roam vong round the mandala after the apsara's bow)
    const playing = on && s >= DANCE_FROM && s < VONG_TO;
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
      let pose: Pose = s < VONG_TO ? play : POSE.sit;
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
      a.performing = playing;
      // (nodding on the beat while they play; then watching the board, the sky)
      a.tilt(playing ? 0.22 + 0.14 * Math.cos(((now - this.lastLanding(now)) * Math.PI * 2) / 2.4) : 0);
      a.lookAt(s >= 30 && s < NYE_TIMES.show ? SKY : s < DANCE_TO ? STAGE_LOOK : BOARD_AT, now + 1);
    }
    // The pinpeat: a phrase at each landing of the dance, from the ensemble's mat (as at Angkor Wat, _sceneApsara.ts).
    if (playing && f.dt > 0) {
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
    sparksOut('kulen');
    PEOPLE_FIRE.value[0].w = 0;
    this.inRing.fill(0);
    this.away.fill(0);
    for (const a of this.actors) {
      a.performing = false;
      if (a.shown) a.hide();
    }
  }

  report(traffic: Traffic): void {
    for (const a of this.actors) if (a.shown) traffic.add(this.name, a.x, a.y, a.z);
  }
}
